import { ElementRef, ViewChild } from '@angular/core';
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
export class EmailModalComponent implements OnInit {

  @Input() open = true;
  @Output() closed = new EventEmitter<boolean>();

  @ViewChild('input') input: ElementRef;
  _emailAddress: string = null;

  triggerTimeout = new BehaviorSubject<boolean>(null);

  constructor(private api: ApiService, private state: StateService) { }

  ngOnInit(): void {
    this.triggerTimeout.pipe(
      debounceTime(30000),
      first()
    ).subscribe(() => {
      this.close(false);
    });
  }

  close(result) {
    if (result === false) {
      this.state.pushRequest(
        this.api.sendEmail(null)
      );
    } else {
      this.state.pushRequest(
        this.api.sendEmail(this.emailAddress)
      );
    }
    this.closed.next(result);
  }

  get hasEmail() {
    const el = this.input ? this.input.nativeElement as HTMLInputElement : null;
    const valid = !el || el.checkValidity();
    return !!this.emailAddress && valid; 
  }

  set emailAddress(value: string) {
    this._emailAddress = value;
    this.triggerTimeout.next(true);
  }

  get emailAddress() {
    return this._emailAddress;
  }
}
