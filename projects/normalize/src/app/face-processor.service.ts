import { Injectable } from '@angular/core';
import { detectSingleFace, FaceLandmarks68, Point, TinyFaceDetectorOptions, SsdMobilenetv1Options, LabeledFaceDescriptors } from 'face-api.js';
import { from, Observable, ReplaySubject, Subject } from 'rxjs';
import { catchError, filter, map, switchMap, tap } from 'rxjs/operators';
import { AnimationManagerService } from './animation-manager.service';
import { ConfigService } from './config.service';
import { FaceApiService } from './face-api.service';



class AnimationObservable {

  public subject: Subject<void>;
  public active = false;
  public cancelled = false;

  constructor(private id: string, private animationManager: AnimationManagerService) {
  }

  frame() {
    if (this.active) {
      this.subject.next();
      this.animationManager.disable(this.id);
    } else {
      this.subject.complete();
      this.subject = null;
      this.animationManager.deregister(this.id);
    }
  }

  start() {
    this.animationManager.register(this.id, () => {
      return this.frame();
    });
    this.active = true;
    this.subject = new Subject<void>();
    this.continue();
    return this.subject;
  }

  continue() {
    this.animationManager.enable(this.id);
  }

  stop() {
    this.active = false;
  }

  cancel() {
    this.cancelled = true;
  }

}

@Injectable({
  providedIn: 'root'
})
export class FaceProcessorService {

  public scoreThresholdHigh : any;
  public scoreThresholdLow : any;
  public detectorOptions: any;
  public defaultSnap = {
    orientaton: 10,
    size: 75,
    distance: 0.1
  };
  public defaultScale = 1;
  public allowed = false;

  constructor(private faceapi: FaceApiService, private config: ConfigService, private animationManager: AnimationManagerService) {
    if (config.TINY) {
      this.scoreThresholdHigh = new TinyFaceDetectorOptions({inputSize: 128, scoreThreshold: 0.75});;
      this.scoreThresholdLow = new TinyFaceDetectorOptions({inputSize: 128, scoreThreshold: 0.5});;
    } else {
      this.scoreThresholdHigh = new SsdMobilenetv1Options({minConfidence: 0.75, maxResults: 1});;
      this.scoreThresholdLow = new SsdMobilenetv1Options({minConfidence: 0.5, maxResults: 1});;        
    }
    this.detectorOptions = this.scoreThresholdHigh;
  }

  processFaces(el: HTMLVideoElement | HTMLImageElement, skipFramesStart=5, snap=this.defaultSnap) {
    const compositionFrame = this.getCompositionFrame();
    const canvas = document.createElement('canvas');
    const elementHeight = el.offsetHeight;
    this.allowed = false;
    const processingEdge = this.config.TINY ? 640 : 960;
    let sourceWidth = 0;
    let sourceHeight = 0;
    if (el instanceof HTMLVideoElement) {
      sourceWidth = el.videoWidth;
      sourceHeight = el.videoHeight;
    }
    if (el instanceof HTMLImageElement) {
      sourceWidth = el.width;
      sourceHeight = el.height;
    }
    const sourceMaxEdge = Math.max(sourceWidth, sourceHeight, 1);
    const processingScale = Math.min(1, processingEdge / sourceMaxEdge);
    canvas.width = Math.max(1, Math.round(sourceWidth * processingScale));
    canvas.height = Math.max(1, Math.round(sourceHeight * processingScale));
    // console.log('CANVAS', canvas);
    const ratio = Math.min(el.offsetWidth / canvas.width, el.offsetHeight / canvas.height);
    // console.log('RATIO', ratio);
    const context = canvas.getContext('2d');
    const progress = new ReplaySubject<any>(2);

    let frames = 0;
    let skipFrames = skipFramesStart;
    let descriptor = [];
    let firstLandmarks: any[] = [];
    let snapped = false;
    let gender_age: any = {};

    const id = 'fps' + Math.random();
    const animationObs = new AnimationObservable(id, this.animationManager);
    progress.next({
      kind: 'start',
      observer: animationObs
    });
    progress.next({
      transformOrigin: `${el.offsetWidth*0.5}px ${el.offsetHeight*0.5}px`,
      transform: `translate(0px,0px)rotate(0rad)scale(${this.defaultScale})`,
      kind: 'transform',
      snapped: false,
      orientation: NaN, scale: NaN, distance: NaN
    });
    // console.log('SENT!');
    this.faceapi.ready.pipe(
      switchMap(() => {
        // console.log('FP: READY');
        return animationObs.start();  
      }),
      switchMap(() => {
        context.drawImage(el, 0, 0, canvas.width, canvas.height);
        return detectSingleFace(canvas, this.detectorOptions).withFaceLandmarks(this.config.TINY).run();
      }),
      catchError((e, caught) => {
        console.log('ERRR', e);
        return from([false]);
      }),
      filter((result: any) => {
        // console.log('RESULTTT', result && result.detection.score);
        if (!result) {
          animationObs.continue();
          this.detectorOptions = this.scoreThresholdHigh;
        }
        if (!result) {
          progress.next({
            transformOrigin: `${el.offsetWidth*0.5}px ${el.offsetHeight*0.5}px`,
            transform: `translate(0px,0px)rotate(0rad)scale(${this.defaultScale})`,
            kind: 'transform',
            snapped: false,
            orientation: NaN, scale: NaN, distance: NaN
          });
          progress.next({
            kind: 'detection',
            score: result ? result.detection.score : 0,
            detected: false
          });
          frames = 0;
        }
        return !!result || animationObs.cancelled;
      }),
      switchMap((result) => {
        if (animationObs.cancelled) {
          console.log('SKIPPING ROTATION, CANCELLED')
          return from([null]);
        }
        this.detectorOptions = this.scoreThresholdLow;
        const landmarks: FaceLandmarks68 = result.landmarks;
        const topPoint = landmarks.positions[27];
        const bottomPoint = landmarks.positions[8];
        const center = landmarks.positions[30];
        const sub = topPoint.sub(bottomPoint);
        const rotation = Math.atan(sub.x / (sub.y ? sub.y : 0.00001));
        const orientation = rotation / Math.PI * 180;
        const scale = 0.3 * canvas.height / sub.magnitude();
        const magnification = 0.657 / scale * elementHeight / 291; // 291 = face-mask height
        // const templateMagnification = 
        // if (scale < 1) {
        //   scale = 1;
        // }
        const distance = Math.sqrt((center.x - canvas.width*0.5)**2 + (center.y - canvas.height*0.6)**2);
        // Mirror X to match the selfie UI's horizontal flip.
        const faceOffsetX = -(center.x - canvas.width / 2) * ratio;
        const faceOffsetY = (center.y - canvas.height / 2) * ratio;
  
        const snapRatio = snapped ? 2 : 1;
        let problem = null;
        let shouldSnap = true;
        if (scale > 1 + snap.size * snapRatio / 100) {
          problem = 'too_far';
          shouldSnap = false;
        } else if (scale < 1 - snap.size * snapRatio / 100) {
          problem = 'too_close';
          shouldSnap = false;
        } else if (Math.abs(orientation) > snap.orientaton * snapRatio) {
          problem = 'not_aligned';
          shouldSnap = false;
        } else if (distance > snap.distance * canvas.height * snapRatio) {
          problem = 'not_aligned';
          shouldSnap = false;
        }
        // console.log('SSS', shouldSnap, problem);
        snapped = shouldSnap;

        // console.log('SHOULD SNAP', shouldSnap, orientation, scale, distance);
        if (shouldSnap) {
          context.save();
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.translate(canvas.width/2, canvas.height/2);
          context.rotate(rotation);
          context.scale(scale, scale);
          context.translate(-center.x, -center.y);
          context.drawImage(el, 0, 0, canvas.width, canvas.height);
          context.restore();
  
          progress.next({
            // transformOrigin: `${center.x * ratio}px ${center.y * ratio}px`,
            transformOrigin: `${el.offsetWidth*0.5 + (center.x - canvas.width/2)* ratio}px ${el.offsetHeight*0.5 + (center.y-canvas.height/2) * ratio}px`,
            transform: `translate(${-(center.x - canvas.width/2)* ratio}px,${-(center.y-canvas.height/2) * ratio}px)rotate(${rotation}rad)scale(${scale*this.defaultScale})`,
            // preview: canvas.toDataURL(),
            maskTransform: `translate(${canvas.width/2 * ratio}px,${canvas.height/2 * ratio}px)rotate(0rad)scale(${magnification*this.defaultScale})`,
            kind: 'transform',
            snapped: true,
            faceOffsetX,
            faceOffsetY,
            orientation, scale, distance: distance / canvas.height,
          });
          // Avoid the expensive descriptor/age second pass while still guiding alignment.
          if (!this.allowed) {
            return from([result]);
          }
          const ret = detectSingleFace(canvas, this.detectorOptions).withFaceLandmarks(this.config.TINY).withFaceDescriptor();
          if (gender_age.gender) {
            return ret.run();
          } else {
            return ret.withAgeAndGender().run();
          }
        } else {
          progress.next({
            transformOrigin: `${el.offsetWidth*0.5}px ${el.offsetHeight*0.5}px`,
            transform: `translate(0px,0px)rotate(0rad)scale(${this.defaultScale})`,
            // maskTransform: `translate(0px,0px)rotate(0rad)scale(1)`,
            maskTransform: `translate(${topPoint.x * ratio}px,${topPoint.y * ratio}px)rotate(${-rotation}rad)scale(${magnification*this.defaultScale})`,
            kind: 'transform',
            snapped: false,
            faceOffsetX,
            faceOffsetY,
            orientation, scale, distance: distance / canvas.height,
            problem: problem
          });
          return from([null]);
        }

      }),
      filter((result) => {
        animationObs.continue();
        // console.log('DETECTION2', result ? result.detection.score : 0);
        progress.next({
          kind: 'detection',
          score: result ? result.detection.score : 0,
          detected: !!result
        });
        if (!result) {
          skipFrames = skipFramesStart;
          frames = 0;
        }
        return !!result || animationObs.cancelled;
      }),
      tap(() => {
        if (skipFrames > 0) {
          skipFrames -= 1;
        }
      }),
      filter(() => skipFrames === 0 && frames < this.config.COLLECTED_FRAMES && this.allowed),
      tap((result) => {
        if (animationObs.cancelled) {
          console.log('SKIPPING EXTRACTION, CANCELLED')
          return;
        }
        if (result.gender) {
          gender_age.gender = result.gender;
        }
        if (result.genderProbability) {
          gender_age.genderProbability = result.genderProbability;
        }
        if (result.age) {
          gender_age.age = result.age;
        }
        const landmarks: FaceLandmarks68 = result.landmarks;
        if (firstLandmarks.length === 0) {
          firstLandmarks = landmarks.positions.map((p) => { return {x: p.x, y: p.y}; });
        }
        descriptor = result.descriptor;
        const nose = landmarks.getNose()
        const mouth = landmarks.getMouth()
        const leftEye = landmarks.getLeftEye()
        const rightEye = landmarks.getRightEye()
        const leftEyeBbrow = landmarks.getLeftEyeBrow()
        const rightEyeBrow = landmarks.getRightEyeBrow()
        const box = this.extent(...landmarks.positions);
        const forehead = [{x: box[0], y: box[1]}, {x: box[0] + box[2], y: this.extent(...leftEyeBbrow, ...rightEyeBrow)[1]}];
        forehead[0].y = forehead[1].y - 1.2 * this.extent(...nose)[3];
        // const face = [{x: box[0], y: box[1]}, {x: box[0] + box[2], y: box[1] + box[3]}] as Point[];
        
        const features = [
          {feature: 'nose', points: [...nose], padding: [0.5, 0.25]},
          {feature: 'eyes', points: [...leftEye, ...rightEye, ...leftEyeBbrow, ...rightEyeBrow], padding: [0.25, 0]},
          {feature: 'mouth', points: [...mouth], padding: [0.25, 0]},
          {feature: 'forehead', points: [...forehead as Point[]], padding: [0, 0]},
          {feature: 'face', points: [...landmarks.positions, ...forehead as Point[]], padding: [0, 0.2]},
        ];

        const context = compositionFrame.getContext('2d');
        let index = 0;
        for (const {feature, points, padding} of features) {
          const ratio = this.config.FEATURES[feature].ratio;
          let extent = this.extent(...points);
          extent = this.applyPadding(padding as [number, number], extent);
          extent = this.applyRatio(ratio, extent);
          // console.log('RATIO', ratio, extent[3]/extent[2]);
          const center = this.center(index, frames, extent[2], extent[3]);
          try {
            // console.log('COPYING', extent, '-> ', center);
            context.drawImage(canvas, ...extent, ...center);
          } catch (exception) {
            console.log('FAILED TO COPY', extent, center);
          }
          index++;
        }
        frames++;
        console.log('COLLECTED', frames);
      }),
      filter(() => (frames === this.config.COLLECTED_FRAMES) || animationObs.cancelled),
    ).subscribe(() => {
      // console.log('COLLECTED FRAMES');
      animationObs.stop();
      progress.next({
        kind: 'done',
        image: compositionFrame.toDataURL('png', 90),
        descriptor: [...descriptor],
        landmarks: firstLandmarks,
        gender_age: gender_age,
        collected: frames
      });
      compositionFrame.remove();
      canvas.remove();
      progress.complete();
    });

    return progress;
  }

  getCompositionFrame(): HTMLCanvasElement {
    const compositionFrame: HTMLCanvasElement = document.createElement('canvas');
    compositionFrame.width = this.config.NUM_FEATURES * this.config.IMAGE_SIZE;
    compositionFrame.height = this.config.COLLECTED_FRAMES * this.config.IMAGE_SIZE;
    return compositionFrame;
  }

  extent(...points: Point[]): [number, number, number, number] {
    const minX = Math.min(...points.map((p: Point) => p.x));
    const minY = Math.min(...points.map((p: Point) => p.y));
    const maxX = Math.max(...points.map((p: Point) => p.x));
    const maxY = Math.max(...points.map((p: Point) => p.y));
    return [minX, minY, maxX - minX, maxY - minY];
  }

  center(index, frame, width, height): [number, number, number, number] {
    const ratio = Math.min(this.config.IMAGE_SIZE / width, this.config.IMAGE_SIZE / height);
    const tgtWidth = Math.min(width * ratio, this.config.IMAGE_SIZE);
    const tgtHeight = Math.min(height * ratio, this.config.IMAGE_SIZE);
    // const x = (this.config.IMAGE_SIZE - tgtWidth) / 2;
    // const y = (this.config.IMAGE_SIZE - tgtHeight) / 2;
    // return [index * this.config.IMAGE_SIZE + x, frame * this.config.IMAGE_SIZE + y, tgtWidth, tgtHeight];
    return [index * this.config.IMAGE_SIZE, frame * this.config.IMAGE_SIZE, tgtWidth, tgtHeight];
  }

  applyRatio(ratio, [minX, minY, dX, dY]): [number, number, number, number] {
    const currentRatio = dY/dX;
    if (ratio > currentRatio) {
      const _dY = ratio*dX;
      minY -= (_dY - dY) / 2;
      return [minX, minY, dX, _dY];
    } else if (ratio < currentRatio) {
      const _dX = dY/ratio;
      minX -= (_dX - dX) / 2;
      return [minX, minY, _dX, dY];
    }
    return [minX, minY, dX, dY];
  }

  applyPadding([paddingX, paddingY], [minX, minY, dX, dY]): [number, number, number, number] {
    const ddX = dX * paddingX;
    const ddY = dY * paddingY;
    return [minX - ddX / 2, minY - ddY / 2, dX + ddX, dY + ddY];
  }

}
