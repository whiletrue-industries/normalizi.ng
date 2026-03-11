import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
    selector: 'app-start-button',
    templateUrl: './start-button.component.html',
    styleUrls: ['./start-button.component.less'],
    standalone: false
})
export class StartButtonComponent implements OnInit {

  @Input() label;
  @Output() click = new EventEmitter<void>();

  constructor() { }

  ngOnInit(): void {
  }

}
