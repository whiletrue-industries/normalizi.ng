import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StateService } from '../state.service';

@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.less'],
    standalone: false
})
export class MainComponent implements OnInit {

  constructor(private state: StateService, private router: Router) { }

  ngOnInit(): void {
    const hasSelfie = this.state.imageID || this.state.descriptor;
    if (!hasSelfie) {
      this.router.navigate(['/selfie']);
    } else if (!this.state.played) {
      this.router.navigate(['/game']);
    } else {
      this.router.navigate(['/map']);
    }
  }

}
