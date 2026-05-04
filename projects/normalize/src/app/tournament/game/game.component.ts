import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { from, Subscription } from 'rxjs';
import { first, map, switchMap, tap } from 'rxjs/operators';
import { ApiService } from '../../api.service';
import { ImageFetcherService } from '../../image-fetcher.service';
import { StateService } from '../../state.service';
import { debugLog } from '../../logger';

@Component({
    selector: 'app-game',
    templateUrl: './game.component.html',
    styleUrls: ['./game.component.less'],
    standalone: false
})
export class GameComponent implements OnInit, OnDestroy {

  TUPLES_PER_FEATURE = 3;
  FEATURES = [
    0, 3, 2, 1, 4
  ];

  game: any;
  index = -1;
  feature = -1;
  maxIndex = 5;
  tuples = [];
  candidates = [];
  results = [];
  Array = Array;
  loaded = false;
  definition = true;
  idsCount = {};
  private gameSaved = false;
  private gameSubscription: Subscription = Subscription.EMPTY;

  constructor(private api: ApiService, private state: StateService, public imageFetcher: ImageFetcherService, private router: Router) {
  }

  ngOnInit(): void {
    if (this.state.getPlayed()) {
      this.router.navigate(['/']);
      return;
    }
    this.definition = true;
    this.gameSubscription = this.api.getGame().subscribe({
      next: (game) => {
        this.game = game;
        debugLog('GOT GAME', game);
        this.next();
      },
      error: (err) => {
        console.error('Failed to load game data', err);
      }
    });
  }

  ngOnDestroy(): void {
    this.gameSubscription.unsubscribe();
  }

  next() {
    if (this.index < this.maxIndex) {
      if (this.tuples.length === 0) {
        this.index += 1;
        if (this.index === this.maxIndex) {
          this.saveGameResults();
          return;
        }
        // Re-fetch to pick up any moderation changes (e.g. allowed set to -1) since last fetch
        this.api.getGame().pipe(first()).subscribe({
          next: (game) => { this.game = game; this.buildTuples(); },
          error: () => { this.buildTuples(); }
        });
      } else {
        this.candidates = this.tuples.shift();
      }
    }
  }

  private buildTuples() {
        this.feature = this.FEATURES[this.index];
        const forbidden = Object.keys(this.idsCount).filter((id) => this.idsCount[id] > 2).map((id) => parseInt(id, 10));
        this.tuples = this.randomTuples(this.TUPLES_PER_FEATURE, forbidden);
        if (this.tuples.length === 0) {
          // All records were forbidden — retry with no restrictions to avoid skipping this feature
          this.tuples = this.randomTuples(this.TUPLES_PER_FEATURE, []);
        }
        this.tuples.forEach((t) => {
          for (let item of t) {
            const id = item.id;
            this.idsCount[id] = (this.idsCount[id] || 0) + 1;
          }
        });
        if (this.feature === 4) {
          const ownImageID = this.state.getOwnImageID();
          const ownItemID = this.state.getOwnItemID();
          const isDeleted = this.state.getLastDeletedOwnItemID() === ownItemID;
          if (ownImageID && this.tuples.length > 0 && !isDeleted && ownItemID > 0) {
            // Verify own item is still allowed before injecting into tournament
            this.api.getImage(ownItemID).pipe(first()).subscribe({
              next: (item: any) => {
                if (item && item.allowed >= 0) {
                  this.tuples[this.tuples.length - 1][1] = {id: -1, image: ownImageID};
                }
                this.candidates = this.tuples.shift();
              },
              error: () => {
                // Item not found or not allowed — skip injection
                this.candidates = this.tuples.shift();
              }
            });
            return; // candidates will be set in the subscribe callback above
          }
        }
        this.candidates = this.tuples.shift();
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
  }

  randomTuples(count, forbidden) {
    const ret = [];
    const records = (this.game?.records || []).filter((r) => r.allowed == null || r.allowed > 0);
    this.shuffleArray(records);
    records.sort((a, b) => {
      return (this.idsCount[a.id] || 0) - (this.idsCount[b.id] || 0);
    });
    for (const i of records) {
      for (const j of records) {
        if (i.id <= j.id) {
          continue;
        }
        if (forbidden.indexOf(i.id) !== -1 || forbidden.indexOf(j.id) !== -1) {
          continue;
        }
        if (Math.random() > 0.5) {
          ret.push([i, j]);
        } else {
          ret.push([j, i]);
        }
      }
    }
    
    const used = [];
    const ret2 = [];
    for (const t of ret) {
      if (used.indexOf(t[0].id) === -1 && used.indexOf(t[1].id) === -1) {
        ret2.push(t);
        used.push(t[0].id);
        used.push(t[1].id);
      }
      if (ret2.length === count) {
        return ret2;
      }
    }
    return ret2;
  }

  addResults(single) {
    if (single[0] === -1) {
      this.state.setVotedSelf();
    }
    this.results.push(single);
    this.next();
  }

  saveGameResults() {
    if (this.gameSaved) {
      return;
    }
    if (this.results && this.results.length) {
      this.gameSaved = true;
      this.state.pushRequest(
        from([this.results]).pipe(
          map((results) => {
            return results.map((t) => t.map((c) => c === -1 ? this.state.getOwnItemID() : c));
          }),
          switchMap((results) => {
            return this.api.saveGameResults(results);
          }),
          tap(() => {
            debugLog('SAVED');
            this.results = [];
          })
        )
      );
      this.state.setPlayed();
      this.router.navigate(['/']);  
    }
  }
}
