import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { animationFrameScheduler, interval, Subscription } from 'rxjs';
import { map, takeWhile } from 'rxjs/operators';

@Component({
    selector: 'app-definition',
    templateUrl: './definition.component.html',
    styleUrls: ['./definition.component.less'],
    host: {
        '[class.visible]': 'visible'
    },
    standalone: false
})
export class DefinitionComponent implements OnInit {

  visible = true;
  readonly timeoutMs = 10000;
  readonly buttonRingLength = 153.94;
  buttonRingOffset = 0;
  private countdownSubscription: Subscription | null = null;

  @Input() imgSrc: string;
  @Output() closed = new EventEmitter<void>();

  constructor() { }

  ngOnInit(): void {
    this.visible = true;
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  onclose() {
    this.stopCountdown();
    if (this.visible) {
      this.visible = false;
      setTimeout(() => {
        this.closed.next();
      }, 300);  
    }
  }

  private startCountdown() {
    this.buttonRingOffset = 0;
    const startTime = animationFrameScheduler.now();
    this.countdownSubscription = interval(0, animationFrameScheduler).pipe(
      map(() => Math.min((animationFrameScheduler.now() - startTime) / this.timeoutMs, 1)),
      takeWhile(progress => progress < 1, true),
    ).subscribe(progress => {
      this.buttonRingOffset = this.buttonRingLength * progress;
      if (progress >= 1) {
        this.onclose();
      }
    });
  }

  private stopCountdown() {
    if (this.countdownSubscription) {
      this.countdownSubscription.unsubscribe();
      this.countdownSubscription = null;
    }
  }

}
