import { EventEmitter } from '@angular/core';
import { Component, Input, OnInit, Output } from '@angular/core';

@Component({
    selector: 'app-feature-selector',
    templateUrl: './feature-selector.component.html',
    styleUrls: ['./feature-selector.component.less'],
    standalone: false
})
export class FeatureSelectorComponent implements OnInit {

  @Input() feature: string;
  @Output() selected = new EventEmitter<string>();

  constructor() { }

  ngOnInit(): void {
  }

  select(feature: string) {
    this.selected.emit(feature);
  }

}
