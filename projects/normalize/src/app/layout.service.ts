import { Injectable } from '@angular/core';
import { fromEvent } from 'rxjs';
import { debugLog } from './logger';

@Injectable({
  providedIn: 'root'
})
export class LayoutService {
  nativeElement: HTMLElement;
  mobile: boolean;
  desktop: boolean;
  layout: string;
  height = 0;

  constructor() {
    fromEvent(window, 'resize').subscribe(($event) => {
      this.updateView();
    });
    this.updateView();
  }

  updateView(nativeElement?: HTMLElement) {
    if (nativeElement) {
      this.nativeElement = nativeElement;
    }
    if (this.nativeElement) {
      this.mobile = this.nativeElement.offsetWidth < 600;
      this.desktop = this.nativeElement.offsetWidth >= 600;
      this.layout = this.mobile ? 'mobile' : 'desktop';
      this.height = this.nativeElement.offsetHeight;
      debugLog('LAYOUT', this.layout);
    }
  }

}
