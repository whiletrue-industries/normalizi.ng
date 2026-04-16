import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {

  COLLECTED_FRAMES = 7;
  IMAGE_SIZE = 300;
  NUM_FEATURES = 5;
  FEATURES = {
    eyes: {ratio: 0.5},
    mouth: {ratio: 0.5},
    forehead: {ratio: 0.5},
    face: {ratio: 1},
    nose: {ratio: 1.5},
  };
  TINY = false;
  FEATURE_ORDER = ['nose', 'eyes', 'mouth', 'forehead', 'face'];
  IMAGE_SIZE_BY_INDEX = [];
  
  constructor() {
    for (const feature of this.FEATURE_ORDER) {
      const ratio = this.FEATURES[feature].ratio;
      let width = this.IMAGE_SIZE;
      let height = this.IMAGE_SIZE;
      if (ratio > 1) {
        width = width / ratio;
      } else {
        height = height * ratio;
      }
      this.IMAGE_SIZE_BY_INDEX.push({width, height});
    }
  }
}
