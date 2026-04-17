import { AfterViewInit, Component, computed, ElementRef, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { animationFrameScheduler, defer, from, fromEvent, interval, ReplaySubject, Subject, Subscription } from 'rxjs';
import { ConfigService } from '../config.service';
import { debounceTime, delay, filter, first, map, switchMap, take, takeWhile, tap, throttleTime } from 'rxjs/operators';
import { FaceProcessorService } from '../face-processor.service';
import { ApiService } from '../api.service';
import { StateService } from '../state.service';
import { Router } from '@angular/router';
import { debugLog } from '../logger';

const PROMPTS = {
  initial: ['', ''],
  getting_ready: ['Hold on', `we're getting things ready`],
  no_detection: ['Please bring your face', 'into the frame'],
  too_far: ['Please bring the camera', 'closer to your face'],
  too_close: [`You're too close...`, 'move a bit farther away'],
  not_aligned: ['Please', 'align your face'],
  hold_still: ["Avoid uneven shadows on your face", 'then tap'],
  hold_still2: ["That's it", 'now hold still'],
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
  public detected = signal(false);
  public src = '';
  public transform = '';
  public transformOrigin = '';
  public faceOffsetX = signal(0);
  public faceOffsetY = signal(0);
  public faceInFrame = false;
  public maskOverlayScale = signal(1);
  public showDynamicRings = false;
  public showConfirmedOverlay = false;
  public dynamicRingsConfirmed = false;
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
  private ringHideTimeout: ReturnType<typeof setTimeout> | null = null;
  private ringRevealAnimationFrameId: number | null = null;

  public svgHack = false;
  public _allowed = false;
  readonly captureTimeoutMs = 5000;
  readonly captureButtonRingLength = 188.5;
  public captureButtonRingOffset = 0;
  readonly ringTransitionMs = 200;


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
    defer(async () => this.init()).subscribe(() => {
      debugLog('initialized');
    });
  }

  async init() {
    const videoEl: HTMLVideoElement = this.inputVideo.nativeElement;
    const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    debugLog('SUPPORTED', JSON.stringify(supportedConstraints));
    const strictConstraints: MediaTrackConstraints = {};
    if (supportedConstraints.facingMode) {
      strictConstraints.facingMode = { exact: 'user' };
    }
    if (supportedConstraints.height) {
      strictConstraints.height = { min: 960 };
    }
    if (supportedConstraints.width) {
      strictConstraints.width = { min: 540 };
    }

    const softConstraints: MediaTrackConstraints = {};
    if (supportedConstraints.facingMode) {
      softConstraints.facingMode = { ideal: 'user' };
    }
    if (supportedConstraints.height) {
      softConstraints.height = { ideal: 960 };
    }
    if (supportedConstraints.width) {
      softConstraints.width = { ideal: 540 };
    }

    const sizeOnlyConstraints: MediaTrackConstraints = {};
    if (supportedConstraints.height) {
      sizeOnlyConstraints.height = { ideal: 960 };
    }
    if (supportedConstraints.width) {
      sizeOnlyConstraints.width = { ideal: 540 };
    }

    const attempts: MediaStreamConstraints[] = [
      { video: strictConstraints },
      { video: softConstraints },
      { video: sizeOnlyConstraints },
      { video: true },
    ];

    debugLog('CONSTRAINT ATTEMPTS', attempts.map((a) => a.video));

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
    const videoTrack = this.videoStream.getVideoTracks()[0];
    debugLog('STREAM SIZE', videoTrack.getSettings().width, videoTrack.getSettings().height);

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
        this.maskOverlayScale.set(videoEl.offsetHeight * 0.675 / 254 * this.faceProcessor.defaultScale);
        this.maskOverlayTransform = `scale(${this.maskOverlayScale()})`;
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
    this.faceProcessor.processFaces(videoEl, 5)
      .subscribe((event) => {
        // console.log('EVENT', event);
        if (event.kind === 'start') {
          debugLog('STARTED!');
          this.prompts = PROMPTS.no_detection;
          this.started = true;
          this.faceOffsetX.set(0);
          this.faceOffsetY.set(0);
          this.faceInFrame = false;
          this.showDynamicRings = false;
          this.showConfirmedOverlay = false;
          this.dynamicRingsConfirmed = false;
          this.faceScale.set(1);
        } else if (event.kind === 'transform') {
          this.transform = event.transform;
          this.transformOrigin = event.transformOrigin;
          const faceInFrame = event.faceOffsetX !== undefined;
          const faceOffsetX = Number.isFinite(event.faceOffsetX) ? event.faceOffsetX : 0;
          const faceOffsetY = Number.isFinite(event.faceOffsetY) ? event.faceOffsetY : 0;
          this.faceInFrame = faceInFrame;
          this.distance = (event.distance as Number).toFixed(2);
          this.orientation = (event.orientation as Number).toFixed(1);;
          this.scale = (event.scale as Number).toFixed(2);;
          this.faceScale.set(Number.isFinite(event.scale) ? event.scale : 1);
          this.detected.set(event.snapped);
          if (event.snapped) {
            this.animateRingsToCenter(true);
          } else if (faceInFrame) {
            this.animateRingsFromCenter(faceOffsetX, faceOffsetY);
          } else {
            this.animateRingsToCenter(false);
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
      delay(3000)
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
      if (!this.detected() || this._allowed) {
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

  private cancelRingTimers() {
    if (this.ringHideTimeout) {
      clearTimeout(this.ringHideTimeout);
      this.ringHideTimeout = null;
    }

    if (this.ringRevealAnimationFrameId !== null) {
      cancelAnimationFrame(this.ringRevealAnimationFrameId);
      this.ringRevealAnimationFrameId = null;
    }
  }

  private animateRingsFromCenter(targetX: number, targetY: number) {
    this.cancelRingTimers();
    this.showConfirmedOverlay = false;
    this.dynamicRingsConfirmed = false;

    if (!this.showDynamicRings) {
      this.showDynamicRings = true;
      this.faceOffsetX.set(0);
      this.faceOffsetY.set(0);
      this.ringRevealAnimationFrameId = requestAnimationFrame(() => {
        this.ringRevealAnimationFrameId = null;
        this.faceOffsetX.set(targetX);
        this.faceOffsetY.set(targetY);
      });
      return;
    }

    this.faceOffsetX.set(targetX);
    this.faceOffsetY.set(targetY);
  }

  private animateRingsToCenter(showConfirmedOverlay: boolean) {
    this.cancelRingTimers();
    this.dynamicRingsConfirmed = showConfirmedOverlay;

    if (!this.showDynamicRings) {
      this.showConfirmedOverlay = showConfirmedOverlay;
      this.faceOffsetX.set(0);
      this.faceOffsetY.set(0);
      return;
    }

    this.faceOffsetX.set(0);
    this.faceOffsetY.set(0);
    this.ringHideTimeout = setTimeout(() => {
      this.showDynamicRings = false;
      this.showConfirmedOverlay = showConfirmedOverlay;
      this.dynamicRingsConfirmed = false;
      this.ringHideTimeout = null;
    }, this.ringTransitionMs);
  }

  get ringFilterAttr(): string | null {
    return null;
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
