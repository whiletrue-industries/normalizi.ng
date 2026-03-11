import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ApiService } from '../../api.service';
import { ImageItem } from '../../datatypes';
import { ImageFetcherService } from '../../image-fetcher.service';
import { StateService } from '../../state.service';

@Component({
    selector: 'app-delete-modal',
    templateUrl: './delete-modal.component.html',
    styleUrls: ['./delete-modal.component.less'],
    standalone: false
})
export class DeleteModalComponent implements OnInit {

  @Input() open = true;
  @Output() closed = new EventEmitter<boolean>();

  phase = 0;
  submit_text: string;
  cancel_text: string;

  constructor(public imageFetcher: ImageFetcherService, public state: StateService, private api: ApiService) { }

  ngOnInit(): void {
    this.start();
  }

  start() {
    this.submit_text = 'delete all my data';
    this.cancel_text = 'cancel';
    this.phase = 0;
  }

  complete() {
    this.submit_text = 'ok';
    this.cancel_text = null;
    this.phase = 1;
  }

  close(value) {
    if (this.phase === 1) {
      this.closed.next(true);
      return;
    }
    if (value) {
      if (this.phase === 0) {
        this.api.deleteOwnItem().subscribe(() => {
          this.state.fullClear();
          window.location.reload();
        });
        this.complete();
      }
    } else {
      this.closed.next(false);
      setTimeout(() => {
        this.start();
      });
    }
  }

  get image() {
    return this.state.getOwnImageID();
  }
}
