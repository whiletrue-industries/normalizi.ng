import { ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { debounceTime, first } from 'rxjs/operators';
import { ApiService } from '../../api.service';
import { StateService } from '../../state.service';

@Component({
    selector: 'app-email-modal',
    templateUrl: './email-modal.component.html',
    styleUrls: ['./email-modal.component.less'],
    standalone: false
})
export class EmailModalComponent implements OnInit, OnDestroy {

  @Input() open = true;
  @Output() closed = new EventEmitter<string>();

  @ViewChild('input') input: ElementRef;
  _emailAddress: string = null;

  // phases: 0 = confirmation, 1 = email form, 2 = delete confirmation
  phase = 0;

  countdownSeconds: number | null = null;

  private autoDeleteTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private countdownIntervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly AUTO_DELETE_DELAY_MS = 15000;
  private readonly COUNTDOWN_SECONDS = 5;

  triggerEmailTimeout = new BehaviorSubject<boolean>(null);

  constructor(private api: ApiService, private state: StateService) { }

  ngOnInit(): void {
    this.startAutoDeleteTimer();
    this.triggerEmailTimeout.pipe(
      debounceTime(30000),
      first()
    ).subscribe(() => {
      if (this.phase === 1) {
        this.submitEmail();
      }
    });
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  private startAutoDeleteTimer(): void {
    this.clearTimers();
    this.countdownSeconds = null;
    this.autoDeleteTimerHandle = setTimeout(() => {
      this.startCountdown();
    }, this.AUTO_DELETE_DELAY_MS);
  }

  private startCountdown(): void {
    this.countdownSeconds = this.COUNTDOWN_SECONDS;
    this.countdownIntervalHandle = setInterval(() => {
      this.countdownSeconds--;
      if (this.countdownSeconds <= 0) {
        this.doDelete();
      }
    }, 1000);
  }

  private clearTimers(): void {
    if (this.autoDeleteTimerHandle !== null) {
      clearTimeout(this.autoDeleteTimerHandle);
      this.autoDeleteTimerHandle = null;
    }
    if (this.countdownIntervalHandle !== null) {
      clearInterval(this.countdownIntervalHandle);
      this.countdownIntervalHandle = null;
    }
  }

  addToMap(): void {
    this.clearTimers();
    this.phase = 1;
  }

  retake(): void {
    this.clearTimers();
    this.state.pushRequest(this.api.deleteOwnItem());
    this.state.fullClear();
    this.closed.emit('retake');
  }

  showDeleteConfirmation(): void {
    this.clearTimers();
    this.phase = 2;
  }

  cancelDelete(): void {
    this.phase = 0;
    this.startAutoDeleteTimer();
  }

  confirmDelete(): void {
    this.doDelete();
  }

  private doDelete(): void {
    this.clearTimers();
    this.countdownSeconds = null;
    this.state.pushRequest(this.api.deleteOwnItem());
    this.state.fullClear();
    this.closed.emit('deleted');
  }

  submitEmail(): void {
    this.state.pushRequest(this.api.sendEmail(this.hasEmail ? this.emailAddress : null));
    this.state.setAskedForEmail();
    this.closed.emit('added');
  }

  noThanks(): void {
    this.state.pushRequest(this.api.sendEmail(null));
    this.state.setAskedForEmail();
    this.closed.emit('added');
  }

  get hasEmail() {
    const el = this.input ? this.input.nativeElement as HTMLInputElement : null;
    const valid = !el || el.checkValidity();
    return !!this.emailAddress && valid;
  }

  set emailAddress(value: string) {
    this._emailAddress = value;
    this.triggerEmailTimeout.next(true);
  }

  get emailAddress() {
    return this._emailAddress;
  }
}

