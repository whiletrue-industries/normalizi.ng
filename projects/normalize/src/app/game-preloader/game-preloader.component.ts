import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { ApiService } from '../api.service';
import { ImageFetcherService } from '../image-fetcher.service';

@Component({
    selector: 'app-game-preloader',
    templateUrl: './game-preloader.component.html',
    styleUrls: ['./game-preloader.component.less'],
    standalone: false
})
export class GamePreloaderComponent implements OnInit {

  @Output() loaded = new EventEmitter<void>();
  _count = 0;
  game: any;

  constructor(private api: ApiService, public imageFetcher: ImageFetcherService) {
    api.getGame().subscribe((game) => {
      this.game = game;
    });
  }

  ngOnInit(): void {
  }

  get count(): number {
    return this._count;
  }

  set count(value: number) {
    this._count = value;
    if (this.game) {
      if (this._count >= this.game.records.length) {
        this.loaded.emit();
      }
    }
  }
}
