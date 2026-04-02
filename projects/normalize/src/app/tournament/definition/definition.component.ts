import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';

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
  private animationFrameId: number | null = null;
  private countdownStartTime: number | null = null;

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
    this.countdownStartTime = null;
    this.animationFrameId = requestAnimationFrame((timestamp) => this.tickCountdown(timestamp));
  }

  private stopCountdown() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.countdownStartTime = null;
  }

  private tickCountdown(timestamp: number) {
    if (!this.visible) {
      return;
    }

    if (this.countdownStartTime === null) {
      this.countdownStartTime = timestamp;
    }

    const elapsed = timestamp - this.countdownStartTime;
    const progress = Math.min(elapsed / this.timeoutMs, 1);
    this.buttonRingOffset = this.buttonRingLength * progress;

    if (progress >= 1) {
      this.onclose();
      return;
    }

    this.animationFrameId = requestAnimationFrame((nextTimestamp) => this.tickCountdown(nextTimestamp));
  }

}
