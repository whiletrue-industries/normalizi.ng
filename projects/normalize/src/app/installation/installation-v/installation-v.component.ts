import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../api.service';
import { InstallationBase } from '../InstallationBase';

@Component({
    selector: 'app-installation-v',
    templateUrl: './installation-v.component.html',
    styleUrls: ['./installation-v.component.less'],
    standalone: false
})
export class InstallationVComponent extends InstallationBase {

}
