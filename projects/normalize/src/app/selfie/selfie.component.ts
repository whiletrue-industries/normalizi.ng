import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { animationFrameScheduler, defer, from, fromEvent, interval, ReplaySubject, Subject, Subscription } from 'rxjs';
import { ConfigService } from '../config.service';
import { debounceTime, delay, filter, first, map, switchMap, take, takeWhile, tap, throttleTime } from 'rxjs/operators';
import { FaceProcessorService } from '../face-processor.service';
import { ApiService } from '../api.service';
import { StateService } from '../state.service';
import { Router } from '@angular/router';
import { debugLog } from '../logger';
import { environment } from '../../environments/environment';

const PROMPTS = {
  initial: ['', ''],
  getting_ready: ['Hold on', `we're getting things ready`],
  no_detection: ['Please bring your face', 'into the frame'],
  too_far: ['Please bring the camera', 'closer to your face'],
  too_close: [`You're too close...`, 'move a bit farther away'],
  not_aligned: ['Please', 'align your face'],
  hold_still: ["Avoid uneven shadows on your face", 'then tap'],
  hold_still2: ["That's it", 'now hold still'],
  camera_error: ['Camera not available', 'please check your camera and try again'],
}

@Component({
    selector: 'app-selfie',
    templateUrl: './selfie.component.html',
    styleUrls: ['./selfie.component.less'],
    standalone: false
})
export class SelfieComponent implements OnInit, AfterViewInit, OnDestroy {
  
  @ViewChild('inputVideo') inputVideo: ElementRef;

  private videoStream: MediaStream;
  private completed = new ReplaySubject(1);
  public canStart = new ReplaySubject(1);
  private countdown: Subscription = null;
  private captureCountdownSubscription: Subscription | null = null;

  public flashActive = false;
  public countdownText = '';
  public videoHeight = 0;

  public started = false;
  public detected = false;
  public src = '';
  public transform = '';
  public maskTransform = '';
  public transformOrigin = '';
  public isSlowDevice = false;
  public useDynamicRings = false;
  public lowPowerForced = false;
  public showConfirmedOverlay = false;
  public dynamicRingsConfirmed = false;
  public faceOffsetX = 0;
  public faceOffsetY = 0;
  public faceScale = 1;

  public orientation = '';
  public scale = '';
  public distance = '';
  public maskOverlayTransform = 'scale(1)';
  public prompts = PROMPTS.getting_ready;
  public outgoingPrompts: string[] | null = null;
  public incomingPromptVisible = false;
  public promptsStream = new Subject<string[]>();
  private promptOutTimeout: ReturnType<typeof setTimeout> | null = null;
  private promptInTimeout: ReturnType<typeof setTimeout> | null = null;

  public svgHack = false;
  public _allowed = false;
  readonly captureTimeoutMs = 10000;
  readonly captureButtonRingLength = 188.5;
  public captureButtonRingOffset = 0;
  readonly ringTransitionMs = 200;
  private readonly ringSmoothingAlpha = 0.24;
  private readonly ringSmoothingEpsilon = 0.1;
  private readonly ringParallaxFactors = [0.00, 0.12, 0.24, 0.36, 0.50, 0.66, 0.82];
  public ringTransforms = this.ringParallaxFactors.map(() => 'translate3d(0px, 0px, 0)');
  public centerRingTransformValue = 'translate3d(0px, 0px, 0) scale(1)';
  private ringTargetX = 0;
  private ringTargetY = 0;
  private ringTargetScale = 1;
  private ringRenderX = 0;
  private ringRenderY = 0;
  private ringRenderScale = 1;
  private ringHideTimeout: ReturnType<typeof setTimeout> | null = null;
  private ringRevealAnimationFrameId: number | null = null;
  private ringAnimationFrameId: number | null = null;


  constructor(private faceProcessor: FaceProcessorService, private api: ApiService, private state: StateService,
              private router: Router, private el: ElementRef) {
      this.promptsStream.pipe(
        throttleTime(250),
      ).subscribe((prompts) => {
        this.transitionPrompts(prompts);
      });
  }

  private transitionPrompts(nextPrompts: string[]) {
    if (this.prompts[0] === nextPrompts[0] && this.prompts[1] === nextPrompts[1]) {
      return;
    }

    if (this.promptOutTimeout) {
      clearTimeout(this.promptOutTimeout);
      this.promptOutTimeout = null;
    }

    if (this.promptInTimeout) {
      clearTimeout(this.promptInTimeout);
      this.promptInTimeout = null;
    }

    this.outgoingPrompts = this.prompts;
    this.prompts = nextPrompts;
    this.incomingPromptVisible = true;
    this.promptOutTimeout = setTimeout(() => {
      this.outgoingPrompts = null;
      this.incomingPromptVisible = false;
      this.promptOutTimeout = null;
    }, 500);
  }

  ngOnInit(): void { 
    this.isSlowDevice = this.detectSlowDevice();
    const lowPowerOverride = this.getLowPowerOverrideFromQuery();
    if (lowPowerOverride !== null) {
      this.isSlowDevice = lowPowerOverride;
      this.lowPowerForced = true;
    }
    this.useDynamicRings = !this.isSlowDevice;
    debugLog('SELFIE MODE', {
      isSlowDevice: this.isSlowDevice,
      useDynamicRings: this.useDynamicRings,
      lowPowerForced: this.lowPowerForced,
    });
    if (!this.state.getGeolocation()) {
      navigator.geolocation.getCurrentPosition((position) => {
        if (position && position.coords) {
          this.state.setGeolocation([position.coords.latitude, position.coords.longitude]);
        }
      }, () => {
      }, {
        enableHighAccuracy: false, 
      });
    }
  }

  ngAfterViewInit(): void {
    defer(async () => this.init()).subscribe({
      next: () => { debugLog('initialized'); },
      error: (e) => {
        console.error('Camera init failed', e);
        this.prompts = PROMPTS.camera_error;
        this.started = true;
      }
    });
  }

  async init() {
    const videoEl: HTMLVideoElement = this.inputVideo.nativeElement;
    const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    debugLog('SUPPORTED', JSON.stringify(supportedConstraints));
    const preferredHeight = this.isSlowDevice ? 640 : 960;
    const preferredWidth = this.isSlowDevice ? 360 : 540;

    const strictConstraints: MediaTrackConstraints = {};
    if (supportedConstraints.facingMode) {
      strictConstraints.facingMode = { exact: 'user' };
    }
    if (supportedConstraints.height) {
      strictConstraints.height = { min: preferredHeight };
    }
    if (supportedConstraints.width) {
      strictConstraints.width = { min: preferredWidth };
    }

    const softConstraints: MediaTrackConstraints = {};
    if (supportedConstraints.facingMode) {
      softConstraints.facingMode = { ideal: 'user' };
    }
    if (supportedConstraints.height) {
      softConstraints.height = { ideal: preferredHeight };
    }
    if (supportedConstraints.width) {
      softConstraints.width = { ideal: preferredWidth };
    }

    const attempts: MediaStreamConstraints[] = [
      { video: strictConstraints },
      { video: softConstraints },
      { video: true },
    ];

    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        this.videoStream = await navigator.mediaDevices.getUserMedia(attempt);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!this.videoStream) {
      throw lastError;
    }
    debugLog('STREAM SIZE', this.videoStream.getVideoTracks()[0].getSettings().width, this.videoStream.getVideoTracks()[0].getSettings().height);

    videoEl.srcObject = this.videoStream;
    fromEvent(videoEl, 'play').pipe(
      first(),
      delay(1000),
      switchMap(() => {
        return this.state.networkQueueLength.pipe(
          filter((l) => l === 0),
          first(),
          tap(() => {
            if (this.state.gallery) {
              this.state.fullClear();
            }
          }),
        );
      }),
      switchMap(() => {
        this.videoHeight = videoEl.offsetHeight;
        this.faceProcessor.defaultScale = Math.max(
          this.el.nativeElement.offsetWidth/videoEl.offsetWidth,
          this.el.nativeElement.offsetHeight/videoEl.offsetHeight,
          1
        );
        this.maskOverlayTransform = `scale(${videoEl.offsetHeight * 0.675 / 254 * this.faceProcessor.defaultScale})`;
        // this.maskOverlayTransform = `scale(${videoEl.offsetHeight * 0.675 / 254})`;
        debugLog('RETURNING CAN START');
        return this.canStart;
      }),
      tap(() => {
        debugLog('CAN START TRIGGERED');
        this.triggerDetectFaces();
      })
    ).subscribe(() => {
        debugLog('DETECTING FACES...');
    });
  }

  triggerDetectFaces() {
    const videoEl: HTMLVideoElement = this.inputVideo.nativeElement;
    debugLog('DETECTING FACES...');
    this.faceProcessor.processFaces(videoEl, 5, this.faceProcessor.defaultSnap, { lowPower: this.isSlowDevice })
      .subscribe((event) => {
        // console.log('EVENT', event);
        if (event.kind === 'start') {
          debugLog('STARTED!');
          this.prompts = PROMPTS.no_detection;
          this.started = true;
          this.faceOffsetX = 0;
          this.faceOffsetY = 0;
          this.faceScale = 1;
          this.showConfirmedOverlay = false;
          this.dynamicRingsConfirmed = false;
          this.updateRingTransforms(true);
        } else if (event.kind === 'transform') {
          this.transform = event.transform;
          this.transformOrigin = event.transformOrigin;
          this.maskTransform = event.maskTransform;
          this.distance = (event.distance as Number).toFixed(2);
          this.orientation = (event.orientation as Number).toFixed(1);;
          this.scale = (event.scale as Number).toFixed(2);;
          this.faceScale = Number.isFinite(event.scale) ? event.scale : 1;
          this.detected = event.snapped;
          if (this.useDynamicRings) {
            const hasTracking = event.faceOffsetX !== undefined;
            const offsetX = Number.isFinite(event.faceOffsetX) ? event.faceOffsetX : 0;
            const offsetY = Number.isFinite(event.faceOffsetY) ? event.faceOffsetY : 0;
            if (event.snapped) {
              this.animateRingsToCenter(true);
            } else if (hasTracking) {
              this.animateRingsFromCenter(offsetX, offsetY);
            } else {
              this.animateRingsToCenter(false);
            }
          }
          if (event.snapped) {
            if (!this._allowed && this.captureCountdownSubscription === null) {
              this.startCaptureCountdown();
            }
            if (this._allowed) {
              this.promptsStream.next(PROMPTS.hold_still2);    
            } else {
              this.promptsStream.next(PROMPTS.hold_still);
            }
          } else {
            this.stopCaptureCountdown();
            setTimeout(() => {
              if (event.problem) {
                this.promptsStream.next(PROMPTS[event.problem]);
              } else {
                this.promptsStream.next(PROMPTS.no_detection);
              }
            });
          }
          // console.log('TRANSFORM', event.transform);
        } else if (event.kind === 'detection') {
          if (!event.detected) {
            this.promptsStream.next(PROMPTS.no_detection);
          }
        } else if (event.kind === 'done') {
          // console.log('GOT EVENT DONE');
          // this.src = event.content;
          // console.log('STARTING COUNTDOWN');
          this.state.setOwnInfo({descriptor: event.descriptor, image: event.image, landmarks: event.landmarks, gender_age: event.gender_age});
          event.geolocation = this.state.geolocation;
          event.id = this.state.itemID;
          event.magic = this.state.magic;
          this.state.pushRequest(
            this.api.createNew(event)
            .pipe(
              tap((result: any) => {
                if (result.success) {
                  debugLog('SETTING OWN INFO', result);
                  this.state.setOwnInfo(result);
                }
              })
            )
          );
          this.countdown = this.doCountdown().subscribe((x) => {
            // console.log('COUNTDOWN DONE', x);
            this.completed.next();
          });
          this.completed.pipe(first()).subscribe(() => {
            debugLog('completed');
            (this.inputVideo.nativeElement as HTMLVideoElement).remove();
            this.videoStream.getVideoTracks()[0].stop();
            if (this.state.getPlayed()) {
              this.router.navigate(['/']);  
            } else {
              this.router.navigate(['/game']);  
            }
          });
        }
      });
  }

  doCountdown() {
    this.svgHack = true;
    return from([true]).pipe(
      delay(0),
      tap(() => {
        this.flashActive = true;
      }),
      delay(1500)
    );
  }

  setAllowed(event, value) {
    const e: any = event || (window as any).event;
    if (e) {
      e.preventDefault && e.preventDefault();
      e.stopPropagation && e.stopPropagation();
      e.cancelBubble = true;
      e.returnValue = false;
    }
    this.stopCaptureCountdown();
    this.allowed = value;
    return false;
  }

  private startCaptureCountdown() {
    this.stopCaptureCountdown();
    this.captureButtonRingOffset = 0;
    const startTime = animationFrameScheduler.now();
    this.captureCountdownSubscription = interval(0, animationFrameScheduler).pipe(
      map(() => Math.min((animationFrameScheduler.now() - startTime) / this.captureTimeoutMs, 1)),
      takeWhile(progress => progress < 1, true),
    ).subscribe(progress => {
      if (!this.detected || this._allowed) {
        this.stopCaptureCountdown();
        return;
      }
      this.captureButtonRingOffset = this.captureButtonRingLength * progress;
      if (progress >= 1) {
        this.setAllowed(null, true);
      }
    });
  }

  private stopCaptureCountdown() {
    if (this.captureCountdownSubscription !== null) {
      this.captureCountdownSubscription.unsubscribe();
      this.captureCountdownSubscription = null;
    }
    this.captureButtonRingOffset = 0;
  }

  private detectSlowDevice(): boolean {
    const navAny = navigator as any;
    const hardwareConcurrency = Number(navigator.hardwareConcurrency || 0);
    const deviceMemory = Number(navAny.deviceMemory || 0);
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);

    if (deviceMemory > 0 && deviceMemory <= 4) {
      return true;
    }
    if (hardwareConcurrency > 0 && hardwareConcurrency <= 4) {
      return true;
    }
    if (isAndroid && (deviceMemory <= 6 || hardwareConcurrency <= 6)) {
      return true;
    }
    return false;
  }

  private getLowPowerOverrideFromQuery(): boolean | null {
    if (environment.production) {
      return null;
    }
    const search = new URLSearchParams(location.search);
    const raw = search.get('lowpower') ?? search.get('low-power');
    if (raw === null) {
      return null;
    }
    const normalized = raw.trim().toLowerCase();
    if (['0', 'false', 'off', 'no'].includes(normalized)) {
      return false;
    }
    if (['1', 'true', 'on', 'yes'].includes(normalized)) {
      return true;
    }
    return true;
  }

  private cancelRingTimers() {
    if (this.ringHideTimeout) {
      clearTimeout(this.ringHideTimeout);
      this.ringHideTimeout = null;
    }

    if (this.ringRevealAnimationFrameId !== null) {
      cancelAnimationFrame(this.ringRevealAnimationFrameId);
      this.ringRevealAnimationFrameId = null;
    }

    if (this.ringAnimationFrameId !== null) {
      cancelAnimationFrame(this.ringAnimationFrameId);
      this.ringAnimationFrameId = null;
    }
  }

  private animateRingsFromCenter(targetX: number, targetY: number) {
    this.cancelRingTimers();
    this.showConfirmedOverlay = false;
    this.dynamicRingsConfirmed = false;

    this.faceOffsetX = targetX;
    this.faceOffsetY = targetY;
    this.updateRingTransforms();
  }

  private animateRingsToCenter(showConfirmedOverlay: boolean) {
    this.cancelRingTimers();
    this.dynamicRingsConfirmed = showConfirmedOverlay;
    this.faceOffsetX = 0;
    this.faceOffsetY = 0;
    this.updateRingTransforms();
    this.ringHideTimeout = setTimeout(() => {
      this.showConfirmedOverlay = showConfirmedOverlay;
      this.dynamicRingsConfirmed = false;
      this.ringHideTimeout = null;
    }, this.ringTransitionMs);
  }

  private updateRingTransforms(immediate = false) {
    this.ringTargetX = this.faceOffsetX;
    this.ringTargetY = this.faceOffsetY;
    this.ringTargetScale = Number.isFinite(this.faceScale) && this.faceScale > 0 ? 1 / this.faceScale : 1;

    if (immediate) {
      this.ringRenderX = this.ringTargetX;
      this.ringRenderY = this.ringTargetY;
      this.ringRenderScale = this.ringTargetScale;
      this.applyRingTransforms();
      return;
    }
    this.startRingAnimationLoop();
  }

  private startRingAnimationLoop() {
    if (this.ringAnimationFrameId !== null) {
      return;
    }
    const step = () => {
      const alpha = this.ringSmoothingAlpha;
      this.ringRenderX += (this.ringTargetX - this.ringRenderX) * alpha;
      this.ringRenderY += (this.ringTargetY - this.ringRenderY) * alpha;
      this.ringRenderScale += (this.ringTargetScale - this.ringRenderScale) * alpha;

      const doneX = Math.abs(this.ringTargetX - this.ringRenderX) < this.ringSmoothingEpsilon;
      const doneY = Math.abs(this.ringTargetY - this.ringRenderY) < this.ringSmoothingEpsilon;
      const doneScale = Math.abs(this.ringTargetScale - this.ringRenderScale) < 0.001;

      if (doneX) {
        this.ringRenderX = this.ringTargetX;
      }
      if (doneY) {
        this.ringRenderY = this.ringTargetY;
      }
      if (doneScale) {
        this.ringRenderScale = this.ringTargetScale;
      }

      this.applyRingTransforms();

      if (doneX && doneY && doneScale) {
        this.ringAnimationFrameId = null;
        return;
      }
      this.ringAnimationFrameId = requestAnimationFrame(step);
    };
    this.ringAnimationFrameId = requestAnimationFrame(step);
  }

  private applyRingTransforms() {
    const baseX = this.ringRenderX;
    const baseY = this.ringRenderY;
    for (let i = 0; i < this.ringParallaxFactors.length; i++) {
      const t = this.ringParallaxFactors[i];
      this.ringTransforms[i] = `translate3d(${baseX * t}px, ${baseY * t}px, 0)`;
    }
    this.centerRingTransformValue = `translate3d(${baseX}px, ${baseY}px, 0) scale(${this.ringRenderScale})`;
  }

  set allowed(value) {
    debugLog('ALLOWED=', value);
    this._allowed = value;
    this.faceProcessor.allowed = value;
    this.stopCaptureCountdown();
    if (value) {
      if (this.prompts === PROMPTS.hold_still) {
        this.promptsStream.next(PROMPTS.hold_still2);
      }
    } else {
      if (this.prompts === PROMPTS.hold_still2) {
        this.promptsStream.next(PROMPTS.hold_still);
      }
    }
  }

  get allowed() {
    return this._allowed;
  }

  ngOnDestroy() {
    this.stopCaptureCountdown();
    this.cancelRingTimers();
    if (this.promptOutTimeout) {
      clearTimeout(this.promptOutTimeout);
      this.promptOutTimeout = null;
    }
    if (this.promptInTimeout) {
      clearTimeout(this.promptInTimeout);
      this.promptInTimeout = null;
    }
  }

}
