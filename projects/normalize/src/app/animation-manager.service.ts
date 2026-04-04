import { Injectable } from '@angular/core';
import { animationFrameScheduler } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AnimationManagerService {
  ticking = false;
  required = false;
  handlers = [];
  enabled = [];

  constructor() {}

  register(id, handler) {
    this.handlers[id] = handler;
    this.enabled[id] = false;
  }

  enable(id) {
    this.enabled[id] = true;
    this.go();
  }

  disable(id) {
    this.enabled[id] = false;
  }

  deregister(id) {
    delete this.handlers[id];
  }

  registered(handler: string) {
    return !!this.handlers[handler];
  }

  go() {
    if (!this.ticking) {
      this.ticking = true;
      animationFrameScheduler.schedule(() => {
        const timestamp = animationFrameScheduler.now();
        for (const key of Object.keys(this.handlers)) {
          if (this.enabled[key]) {
            this.handlers[key](timestamp);
          }
        }
        this.ticking = false;
        if (this.required) {
          this.required = false;
          this.go();
        }
      });
    } else {
      this.required = true;
    }
  }


}
