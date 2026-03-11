import { Component, OnInit } from '@angular/core';
import { InstallationBase } from '../InstallationBase';

@Component({
    selector: 'app-installation-h',
    templateUrl: './installation-h.component.html',
    styleUrls: ['./installation-h.component.less'],
    standalone: false
})
export class InstallationHComponent extends InstallationBase {

  ngOnInit(): void {
  }
}
