import { ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { first } from 'rxjs/operators';
import { ApiService } from '../../api.service';
import { ImageFetcherService } from '../../image-fetcher.service';
import { StateService } from '../../state.service';

@Component({
    selector: 'app-email-modal',
    templateUrl: './email-modal.component.html',
    styleUrls: ['./email-modal.component.less'],
    standalone: false
})
export class EmailModalComponent implements OnDestroy, OnChanges {

  @Input() open = true;
  @Output() closed = new EventEmitter<string>();

  @ViewChild('input') input: ElementRef;
  _emailAddress: string = null;

  // phases: 0 = confirmation, 1 = email form, 2 = delete confirmation
  phase = 0;

  countdownSeconds: number | null = null;
  fallbackImageID: string | null = null;
  isLoadingFallbackImage = false;

  private autoDeleteTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private countdownIntervalHandle: ReturnType<typeof setInterval> | null = null;
  private emailIdleTimerHandle: ReturnType<typeof setTimeout> | null = null;
  private hasSubmitted = false;
  private readonly AUTO_DELETE_DELAY_MS = 25000;
  private readonly COUNTDOWN_SECONDS = 10;
  private readonly EMAIL_IDLE_TIMEOUT_MS = 30000;

  constructor(private api: ApiService, private state: StateService, public imageFetcher: ImageFetcherService) { }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes.open) {
      return;
    }
    if (changes.open.currentValue === true) {
      this.resetForOpen();
    } else {
      this.clearTimers();
    }
  }

  private resetForOpen(): void {
    this.phase = 0;
    this._emailAddress = null;
    this.hasSubmitted = false;
    this.ensureConfirmationImage();
    this.startAutoDeleteTimer();
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
        this.clearTimers();
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
    this.clearEmailIdleTimer();
  }

  private startEmailIdleTimer(): void {
    this.clearEmailIdleTimer();
    this.emailIdleTimerHandle = setTimeout(() => {
      this.emailIdleTimerHandle = null;
      if (this.phase === 1 && !this.hasSubmitted) {
        this.submitEmail();
      }
    }, this.EMAIL_IDLE_TIMEOUT_MS);
  }

  private clearEmailIdleTimer(): void {
    if (this.emailIdleTimerHandle !== null) {
      clearTimeout(this.emailIdleTimerHandle);
      this.emailIdleTimerHandle = null;
    }
  }

  addToMap(): void {
    this.clearTimers();
    this.phase = 1;
    this.startEmailIdleTimer();
  }

  backToConfirmation(): void {
    this.phase = 0;
    this.ensureConfirmationImage();
    this.startAutoDeleteTimer();
  }

  private ensureConfirmationImage(): void {
    if (this.confirmationImageId || this.isLoadingFallbackImage) {
      return;
    }
    const ownItemID = this.state.getOwnItemID();
    if (!Number.isFinite(ownItemID) || ownItemID <= 0) {
      return;
    }
    this.isLoadingFallbackImage = true;
    this.api.getImage(ownItemID).pipe(first()).subscribe({
      next: (item: any) => {
        if (item?.image) {
          this.fallbackImageID = item.image;
        }
      },
      error: () => {
        this.fallbackImageID = null;
      },
      complete: () => {
        this.isLoadingFallbackImage = false;
      }
    });
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
    this.backToConfirmation();
  }

  confirmDelete(): void {
    this.doDelete();
  }

  private doDelete(): void {
    this.clearTimers();
    this.countdownSeconds = null;
    this.state.setLastDeletedOwnItemID(this.state.getOwnItemID());
    this.api.deleteOwnItem().pipe(
      first()
    ).subscribe(() => {
      this.state.fullClear();
      this.closed.emit('deleted');
    });
  }

  onEmailEnterKey(event: Event): void {
    if (this.hasEmail) {
      this.submitEmail();
    }
  }

  submitEmail(): void {
    if (this.hasSubmitted) {
      return;
    }
    this.hasSubmitted = true;
    this.clearTimers();
    this.state.pushRequest(this.api.sendEmail(this.hasEmail ? this.emailAddress : null));
    this.state.setAskedForEmail();
    this.closed.emit('added');
  }

  noThanks(): void {
    if (this.hasSubmitted) {
      return;
    }
    this.hasSubmitted = true;
    this.clearTimers();
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
    if (this.phase === 1) {
      this.startEmailIdleTimer();
    }
  }

  get emailAddress() {
    return this._emailAddress;
  }

  get ownFaceImage() {
    if (!this.confirmationImageId) {
      return null;
    }
    return this.imageFetcher.fetchImage(this.confirmationImageId);
  }

  get confirmationImageId() {
    return this.state.getOwnImageID() || this.fallbackImageID;
  }

  get confirmationImageAnimationId() {
    return this.confirmationImageId ? `${this.confirmationImageId}-confirmation` : 'confirmation-image';
  }
}

