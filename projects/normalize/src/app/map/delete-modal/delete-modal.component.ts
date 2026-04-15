import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { first } from 'rxjs/operators';
import { ApiService } from '../../api.service';
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
  @Input() image = null;
  @Output() closed = new EventEmitter<boolean>();

  phase = 0;
  deleting = false;
  submit_text: string;
  cancel_text: string;

  constructor(public imageFetcher: ImageFetcherService, public state: StateService, private api: ApiService) { }

  ngOnInit(): void {
    this.start();
  }

  start() {
    this.submit_text = 'delete my data';
    this.cancel_text = 'cancel';
    this.phase = 0;
    this.deleting = false;
  }

  close(value) {
    if (value) {
      if (this.phase === 0) {
        this.deleting = true;
        this.state.setLastDeletedOwnItemID(this.state.getOwnItemID());
        this.api.deleteOwnItem().pipe(first()).subscribe(() => {
          this.state.fullClear();
          this.closed.next(true);
        });
      }
    } else {
      this.closed.next(false);
      setTimeout(() => {
        this.start();
      });
    }
  }

  get imageId() {
    return this.image || this.state.getOwnImageID();
  }
}
