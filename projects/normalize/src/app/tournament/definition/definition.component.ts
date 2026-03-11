import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { first } from 'rxjs/operators';

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
  timerSub: Subscription;

  @Input() imgSrc: string;
  @Output() closed = new EventEmitter<void>();

  constructor() { }

  ngOnInit(): void {
    this.visible = true;
    this.timerSub = timer(10000).pipe(
      first()
    ).subscribe(() => {
      this.onclose();
    });
  }

  onclose() {
    if (this.timerSub) {
      this.timerSub.unsubscribe();
      this.timerSub = null;
    }
    if (this.visible) {
      this.visible = false;
      setTimeout(() => {
        this.closed.next();
      }, 300);  
    }
  }

}
