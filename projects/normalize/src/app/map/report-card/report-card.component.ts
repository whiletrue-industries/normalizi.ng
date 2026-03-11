import { EventEmitter, OnDestroy } from '@angular/core';
import { Component, Input, OnChanges, OnInit, Output } from '@angular/core';
import { Location } from '@angular/common';
import { ImageItem } from '../../datatypes';
import { ImageFetcherService } from '../../image-fetcher.service';
import { StateService } from '../../state.service';

@Component({
    selector: 'app-report-card',
    templateUrl: './report-card.component.html',
    styleUrls: ['./report-card.component.less'],
    standalone: false
})
export class ReportCardComponent implements OnInit, OnChanges, OnDestroy {

  @Input() item: ImageItem;
  @Output() delete = new EventEmitter<void>();
  @Output() start = new EventEmitter<void>();

  // 'nose', 'eyes', 'mouth', 'forehead', 'face
  normality = '0.50';
  nose_normality = '0.50';
  eyes_normality = '0.50';
  mouth_normality = '0.50';
  forehead_normality = '0.50';
  face_normality = '0.50';

  itemImage = null;

  constructor(public imageFetcher: ImageFetcherService, private state: StateService, private location: Location) { }

  ngOnInit(): void {
  }

  ngOnDestroy() {
    this.location.replaceState('/');
  }

  ngOnChanges() {
    if (this.item) {
      const item = this.item;
      this.itemImage = this.imageFetcher.fetchImage(item.image)
      this.normality = ImageItem.normality(item).toFixed(2);
      this.nose_normality = ImageItem.normalityText(item, 0);
      this.eyes_normality = ImageItem.normalityText(item, 1);
      this.mouth_normality = ImageItem.normalityText(item, 2);
      this.forehead_normality = ImageItem.normalityText(item, 3);
      this.face_normality = ImageItem.normalityText(item, 4);
      this.location.replaceState('/', `?id=${this.item.id}`);
    }
  }

  get age() {
    return this.item.gender_age.age.toFixed(0);
  }

  get gender() {
    return this.item.gender_age.gender[0].toUpperCase();
  }

  get gender_confidence() {
    return this.item.gender_age.genderProbability.toFixed(2);
  }

  get placeName() {
    return this.item.place_name || '';
  }

  get createdTime() {
    if (this.item.created_timestamp) {
      return this.item.created_timestamp.split('T')[1].split('.')[0] || '';
    }
    return '';
  }

  get createdDate() {
    if (this.item.created_timestamp) {
      return this.item.created_timestamp.split('T')[0] || '';
    }
    return '';
  }

  get hasShare() {
    return !!navigator && !!navigator.share;
  }

  get ownCard() {
    return this.item.id === this.state.getOwnItemID();
  }

  shareUrl() {
    return `https://normalizi.ng?id=${this.item.id}`;
  }

  share() {
    const url = this.shareUrl();
    navigator.share({
      title: url,
      text: url,
      url: url
    }).then((result) => {
      console.log('Share result:', result);
    });
  }
}
