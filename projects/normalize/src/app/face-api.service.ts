import { Injectable } from '@angular/core';
import * as faceapi from 'face-api.js';
import { defer, ReplaySubject } from 'rxjs';
import { ConfigService } from './config.service';
import { debugLog } from './logger';

@Injectable({
  providedIn: 'root'
})
export class FaceApiService {

  public ready = new ReplaySubject<void>(1);

  constructor(private config: ConfigService) {
    defer(async () => { await this.loadModels(); }).subscribe(() => {
      debugLog('FACEAPI LOADED', faceapi.nets.tinyFaceDetector.params && faceapi.nets.faceLandmark68TinyNet, faceapi.nets);
      this.ready.next();
    });
  }

  async loadModels() {
    if (this.config.TINY) {
      await faceapi.loadFaceLandmarkTinyModel('assets/models');
      await faceapi.loadTinyFaceDetectorModel('assets/models');
    } else {
      await faceapi.loadFaceDetectionModel('assets/models');
      await faceapi.loadFaceLandmarkModel('assets/models');  
    }
    await faceapi.loadFaceRecognitionModel('assets/models');
    await faceapi.loadAgeGenderModel('assets/models');
  }
}