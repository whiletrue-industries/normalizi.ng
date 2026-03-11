import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, ViewChild } from '@angular/core';
import { fromEvent } from 'rxjs';
import { first } from 'rxjs/operators';
import { LayoutService } from '../../layout.service';

@Component({
    selector: 'app-drawer',
    templateUrl: './drawer.component.html',
    styleUrls: ['./drawer.component.less'],
    host: {
        'class': 'drawer',
        '[class.open]': 'open && !hidden',
        '[class.hidden]': 'hidden',
        '[class.desktop]': 'layout.desktop',
        '[class.mobile]': 'layout.mobile',
        '(touchstart)': 'touchstart($event)',
    },
    standalone: false
})
export class DrawerComponent implements OnInit, OnChanges {

  @Input() open = false;
  @Input() hidden = false;
  @Output() changed = new EventEmitter<boolean>();

  @ViewChild('content') content: ElementRef;

  startTouch: number;

  constructor(public layout: LayoutService) { }

  ngOnInit(): void {
  }

  ngOnChanges() {
    if (!this.open && this.content.nativeElement) {
      const el: HTMLElement = this.content.nativeElement;
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  state(value) {
    this.changed.emit(value);
  }

  touchstart(event: TouchEvent) {
    this.startTouch = event.touches[0].clientY;
    fromEvent(window, 'touchend').pipe(first()).subscribe((event: TouchEvent) => {
      const endTouch = event.changedTouches[0].clientY;
      const diff = endTouch - this.startTouch;
      if (diff > 100 && this.open) {
        this.state(false);
      }
      if (diff < 100 && !this.open) {
        this.state(true);
      }
      this.startTouch = null
    });
  }

  touchstartContent(event: TouchEvent) {
    // console.log('touchstartContent', this.open, this.content.nativeElement.scrollTop);
    event.stopPropagation();
    if (this.open && this.content.nativeElement && this.content.nativeElement.scrollTop === 0) {
      this.touchstart(event);
    }
  }
}
