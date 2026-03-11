import { state } from '@angular/animations';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { StateService } from '../../state.service';

@Component({
    selector: 'app-consent-modal',
    templateUrl: './consent-modal.component.html',
    styleUrls: ['./consent-modal.component.less'],
    standalone: false
})
export class ConsentModalComponent implements OnInit {

  @Input() open = true;
  @Output() closed = new EventEmitter<boolean>();

  geolocationPossible = false;

  _sliderCamera = false;
  _sliderGeolocation = false;
  _sliderPrivacy = false;

  constructor(private router: Router, private state: StateService) { }

  ngOnInit(): void {
    this.geolocationPossible = !!navigator && !!navigator.geolocation;
  }

  close(result) {
    if (result === false) {
      this.closed.next(result);
    } else {
      if (this.sliderAll) {
        this.router.navigate(['/selfie']);
      }
    }
  }

  set sliderCamera(value: boolean) {
    this._sliderCamera = value;
  }

  get sliderCamera() {
    return this._sliderCamera;
  }

  set sliderGeolocation(value: boolean) {
    this._sliderGeolocation = value;
  }

  get sliderGeolocation() {
    return this._sliderGeolocation;
  }

  set sliderPrivacy(value: boolean) {
    this._sliderPrivacy = value;
  }

  get sliderPrivacy() {
    return this._sliderPrivacy;
  }

  get sliderAll() {
    return this.sliderCamera && this.sliderGeolocation && this.sliderPrivacy;
  }
}
