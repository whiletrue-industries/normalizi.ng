import { Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { ImageItem } from '../../datatypes';
import { ImageFetcherService } from '../../image-fetcher.service';

@Component({
    selector: 'app-installation-card',
    templateUrl: './installation-card.component.html',
    styleUrls: ['./installation-card.component.less'],
    standalone: false
})
export class InstallationCardComponent implements OnInit {

  @Input() item: ImageItem;

  normality = '0.50';
  nose_normality = '0.50';
  eyes_normality = '0.50';
  mouth_normality = '0.50';
  forehead_normality = '0.50';
  face_normality = '0.50';

  constructor(public imageFetcher: ImageFetcherService) { }

  ngOnInit() {
    this.normality = ImageItem.normality(this.item).toFixed(2);
    this.nose_normality = ImageItem.normalityText(this.item, 0);
    this.eyes_normality = ImageItem.normalityText(this.item, 1);
    this.mouth_normality = ImageItem.normalityText(this.item, 2);
    this.forehead_normality = ImageItem.normalityText(this.item, 3);
    this.face_normality = ImageItem.normalityText(this.item, 4);
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
}
