import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { TIMEOUT } from 'dns';
import { interval } from 'rxjs';
import { take } from 'rxjs/operators';
import { debugLog } from '../../logger';

@Component({
    selector: 'app-timeout-counter',
    templateUrl: './timeout-counter.component.html',
    styleUrls: ['./timeout-counter.component.less'],
    host: {
        '(touchstart)': 'cancel()'
    },
    standalone: false
})
export class TimeoutCounterComponent implements OnInit {

  @Output() canceled = new EventEmitter<void>();
  TIMEOUT = 10;
  seconds: number = this.TIMEOUT;
  width = 1;

  constructor(private router: Router) { }

  ngOnInit(): void {
    interval(1000).pipe(
      take(this.TIMEOUT),
    ).subscribe(() => {
      this.seconds -= 1;
      this.width = this.seconds / this.TIMEOUT;
      if (this.seconds === 0) {
        this.router.navigate(['/selfie']);
      }
    })
  }

  cancel() {
    debugLog('CANCEL');
    this.canceled.emit();
    return false;
  }
}
