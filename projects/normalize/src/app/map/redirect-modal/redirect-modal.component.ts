import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
    selector: 'app-redirect-modal',
    templateUrl: './redirect-modal.component.html',
    styleUrls: ['./redirect-modal.component.less'],
    standalone: false
})
export class RedirectModalComponent implements OnInit {

  @Input() open = true;
  @Output() closed = new EventEmitter<boolean>();

  constructor() { }

  ngOnInit(): void {
  }

  close() {
    this.closed.next(false);
  }

}
