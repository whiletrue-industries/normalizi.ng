import { AfterViewInit, Component, ElementRef } from '@angular/core';
import { LayoutService } from './layout.service';
import { debugLog } from './logger';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.less'],
    standalone: false
})
export class AppComponent implements AfterViewInit {

  constructor(private layout: LayoutService, private el: ElementRef) {
    debugLog('(v33) Normalizi.ng is in early testing phase, please do not share this link yet and send any bug or feedback to mushon@shual.com');
  }

  ngAfterViewInit() { 
    setTimeout(() => {
      this.layout.updateView(this.el.nativeElement);
    }, 0);
  }
}
