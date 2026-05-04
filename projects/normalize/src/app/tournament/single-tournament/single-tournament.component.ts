import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, ViewChildren } from '@angular/core';
import { BehaviorSubject, from } from 'rxjs';
import { debounceTime, delay, first, tap } from 'rxjs/operators';
import { ConfigService } from '../../config.service';
import { ImageFetcherService } from '../../image-fetcher.service';
import { StateService } from '../../state.service';
import { debugLog } from '../../logger';

@Component({
    selector: 'app-single-tournament',
    templateUrl: './single-tournament.component.html',
    styleUrls: ['./single-tournament.component.less'],
    standalone: false
})
export class SingleTournamentComponent implements OnInit, OnChanges, AfterViewInit {

  @Input() candidates: any[];
  @Input() index: number;
  @Output() results = new EventEmitter<number[]>();

  @ViewChildren('handle') handles: QueryList<ElementRef>;
  extraHandles: ElementRef[] = null;

  scales = [1, 1];
  sizes = [50, 50];
  position = 0;
  baseScale = 1;
  direction = null;
  state = 'start';
  triggerTimeout = new BehaviorSubject<boolean>(null);
  timeoutVisible = false;

  constructor(public imageFetcher: ImageFetcherService, private el: ElementRef, private config: ConfigService,
              private stateSvc: StateService) { }

  set location(value) {
    this.position = Math.abs(value);
    if (value > 0) {
      this.direction = true;
    }
    if (value < 0) {
      this.direction = false;
    }
    if (value > 0) {
      this.scales = [this.baseScale * (1 + value), this.baseScale];
      this.sizes = [50 * (1 + value), 50];
    } else {
      this.scales = [this.baseScale, this.baseScale * (1 - value)];
      this.sizes = [50, 50 * (1 - value)];
    }
  }

  ngOnInit(): void {
    if (this.stateSvc.gallery) {
      debugLog('STARTING TOURNAMENT TIMEOUT');
      this.triggerTimeout.pipe(
        debounceTime(30000),
      ).subscribe(() => {
        this.timeoutVisible = true;
      });  
    }
  }

  ngOnChanges() {
    debugLog('TRIGGERING TOURNAMENT TIMEOUT');
    this.triggerTimeout.next(true);
    from([true]).pipe(
      tap(() => {
        this.state = 'start';
        this.direction = null;
      }),
      delay(100),
      tap(() => {
        this.state = 'starting';
      }),
      delay(300),
      tap(() => {
        this.state = '';
      }),
    ).subscribe(() => {
      if (this.el.nativeElement) {
        this.updateScales();
        this.extraHandles = this.handles.toArray();
      }
    });  
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.updateScales();
    }, 0);
  }

  updateScales() {
    this.baseScale = this.el.nativeElement.offsetWidth / (2 * this.config.IMAGE_SIZE_BY_INDEX[this.index].width);
    this.scales = [this.baseScale, this.baseScale];  
  }

  select(candidate) {
    debugLog('WINNER', candidate.id);
    const winner = candidate.id
    let loser = -1;
    for (const c of this.candidates) {
      if (c.id !== winner) {
        loser = c.id;
        break;
      }
    }
    // console.log('SELECT', winner, loser, this.index);
    from([true]).pipe(
      tap(() => {
        this.state = 'end';
      }),
      delay(300),
      tap(() => {
        this.direction = null;
      }),
    ).subscribe(() => {
      // console.log('RESULTS', winner, loser, this.index);
      this.results.emit([winner, loser, this.index]);
    });  
  }

  finish(sliderPosition) {
    // console.log('FINISH', sliderPosition);
    if (sliderPosition === 1) {
      this.select(this.candidates[1]);
    } else if (sliderPosition === -1) {
      this.select(this.candidates[0]);
    }
  }
}
