import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { from, fromEvent, Subject, Subscription } from 'rxjs';
import { debounceTime, delay, map, tap, throttle, throttleTime } from 'rxjs/operators';

@Component({
    selector: 'app-slider',
    templateUrl: './slider.component.html',
    styleUrls: ['./slider.component.less'],
    standalone: false
})
export class SliderComponent implements OnInit, AfterViewInit, OnDestroy {

  HANDLE_SIZE = 48 + 8;

  @Input() state = '';
  @Input() extraHandles: ElementRef[] = null;
  @Output() location = new EventEmitter<number>();
  @Output() selected = new EventEmitter<number>();

  @ViewChild('handleLeft') handleLeft: ElementRef;
  @ViewChild('handleRight') handleright: ElementRef;

  subscriptions: Subscription[] = [];
  moveSubscripion: Subscription = null;
  throttled = new Subject<number>();
  width = 0;
  startX = 0;
  startTime = 0;
  currentIdx = 0;
  position = 0;
  opacity = [null, null]
  markSelected = false;
  handles: ElementRef<any>[];
  savedExtraHandles: ElementRef<any>[] = null;

  constructor(private el: ElementRef) {
    this.throttled.pipe(
      throttleTime(33),
    ).subscribe((loc) => {
      this.location.next(loc);
    });
  }

  ngOnInit(): void {
  }

  ngOnChanges() {
    setTimeout(() => {
      this.opacity = [1, 1]
      if (this.state === 'start') {
        this.markSelected = false;
        this.position = 0;
        this.location.next(0);
      }
    }, 0);
    if (this.extraHandles && this.savedExtraHandles !== this.extraHandles) {
      this.savedExtraHandles = this.extraHandles;
      this.clearSubscriptions();
      this.registerHandles(this.extraHandles);
      this.registerHandles(this.handles);
    }
  }

  ngAfterViewInit() {
    this.handles = [this.handleLeft, this.handleright];
    this.width = this.el.nativeElement.offsetWidth - 128 - this.HANDLE_SIZE;
  }

  registerHandles(handles) {
    for (const idx of [0, 1]) {
      const handle = handles[idx].nativeElement;
      this.subscriptions.push(...[
        fromEvent(handle, 'mousedown').subscribe((ev: MouseEvent) => { if (ev.button === 0) { ev.preventDefault(); ; this.mousedown(idx, ev); }}),
        fromEvent(handle, 'touchstart').subscribe((ev: MouseEvent) => { ev.preventDefault(); this.mousedown(idx, ev); }),
      ]);
    }
    this.subscriptions.push(...[
      fromEvent(window, 'mouseup').subscribe((ev: Event) => { ev.preventDefault(); this.mouseup('m'); }),
      fromEvent(window, 'touchend').subscribe((ev: Event) => { ev.preventDefault(); this.mouseup('t'); }),  
    ]);
  }

  clearSubscriptions() {
    while (this.subscriptions.length) {
      this.subscriptions.pop().unsubscribe();
    }
  }

  ngOnDestroy() {
    this.clearSubscriptions();
  }

  mouseup(type) {
    // console.log('MOUSEUP', type);
    const clicked = (performance.now() - this.startTime) < 200;
    from([true]).pipe(
      delay(0),
      map(() => {
        let selected = 0;
        if (clicked) {
          if (!this.markSelected) {
            this.markSelected = true;
            selected = this.currentIdx * 2 - 1;
            console.log('SELECTING CLICKED', selected);
            this.updatePosition(-this.width / 2 * selected);
          }
        }
        else if ((this.position >= this.width * 0.25)) {
          if (!this.markSelected) {
            this.markSelected = true;
            console.log('SELECTING', -1);
            selected = -1;
            this.updatePosition(this.width / 2);
          }
        }
        else if (this.position <= -this.width * 0.25) {
          if (!this.markSelected) {
            this.markSelected = true;
            console.log('SELECTING', 1);
            selected = 1;
            this.updatePosition(-this.width / 2);
          }
        } else {      
          this.updatePosition(0);
        }
        return selected;
      }),
      delay(300),
      tap((selected) => {
        if (selected !== 0) {
          this.selected.next(selected);
        }
      }),
    ).subscribe();
    if (this.moveSubscripion) {
      this.moveSubscripion.unsubscribe();
      this.moveSubscripion = null;
    }
  }

  mousedown(idx, ev) {
    this.startX = this.getX(ev);
    this.startTime = performance.now();
    this.currentIdx = idx;
    if (this.moveSubscripion) {
      this.moveSubscripion.unsubscribe();
    }
    if (ev instanceof MouseEvent) {
      this.moveSubscripion = fromEvent(window, 'mousemove').subscribe((ev: MouseEvent) => { this.mousemove(idx, ev); });
    } else {
      this.moveSubscripion = fromEvent(window, 'touchmove').subscribe((ev: MouseEvent) => { this.mousemove(idx, ev); });
    }
  }

  mousemove(idx, ev) {
    const x = this.getX(ev);
    this.updatePosition(x - this.startX);
  }

  updatePosition(pos) {
    this.position = pos;
    this.position = Math.min(this.position, this.width/2);
    this.position = Math.max(this.position, -this.width/2);
    if (this.position > 0) {
      this.opacity[0] = 1;
      this.opacity[1] = 1 - this.position / (this.width/2);
    } else {
      this.opacity[0] = 1 + this.position / (this.width/2);
      this.opacity[1] = 1;
    }
    this.throttled.next(this.position / (this.width/2));
  }

  getX(ev) {
    let x = 0;
    if (ev instanceof MouseEvent) {
      x = ev.clientX;
    } else if (ev instanceof TouchEvent) {
      x = ev.touches.item(0).clientX;
    }
    return x;
  }

}
