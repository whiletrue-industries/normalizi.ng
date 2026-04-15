import { EventEmitter } from '@angular/core';
import { Component, Input, OnInit, Output } from '@angular/core';

@Component({
    selector: 'app-modal',
    templateUrl: './modal.component.html',
    styleUrls: ['./modal.component.less'],
    standalone: false
})
export class ModalComponent implements OnInit {

  @Input() submit_text = 'OK';
  @Input() cancel_text = '';
  @Input() open = true;
  @Input() submit_allowed = true;
  @Input() hide_close = false;
  @Input() hide_actions = false;
  @Input() wide = false;
  @Input() cancel_text_preserve_case = false;
  @Output() closed = new EventEmitter<boolean>();

  constructor() { }

  ngOnInit(): void {
  }

  close(result) {
    this.closed.next(result);
  }

}
