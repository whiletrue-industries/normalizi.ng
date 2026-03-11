import { Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { AnimationManagerService } from '../animation-manager.service';
import { ConfigService } from '../config.service';

@Component({
    selector: 'app-moving-image',
    templateUrl: './moving-image.component.html',
    styleUrls: ['./moving-image.component.less'],
    standalone: false
})
export class MovingImageComponent implements OnChanges, OnDestroy {

  @Input() src: string;
  @Input() index: number;
  @Input() id: string;

  ANIMATION_DIVIDER = 10;

  x = [0, 0];
  y = [0, 0];
  width = 300;
  height = 300;
  frame = 0;
  count = 0;
  current = 0;
  animationId = '';
  loaded = false;
  _src = '';

  constructor(public config: ConfigService, private animation: AnimationManagerService) { }

  ngOnChanges(): void {
    this.x[0] = -this.config.IMAGE_SIZE * this.index;
    this.x[1] = -this.config.IMAGE_SIZE * this.index;
    const dimensions = this.config.IMAGE_SIZE_BY_INDEX[this.index];
    this.width = dimensions.width;
    this.height = dimensions.height;
    const animationId = 'moving-image-' + this.id;
    if (this.animationId !== animationId) {
      if (this.animationId) {
        this.animation.deregister(this.animationId);
      }
      this.animationId = animationId;
      this.animation.register(this.animationId, () => this.animationFrame());
    }
    this._src = '';
    setTimeout(() => {
      this._src = this.src;
    }, 0);
  }

  onLoaded() {
    this.animation.enable(this.animationId);  
  }

  ngOnDestroy(): void {
    this.animation.deregister(this.animationId);
  }

  animationFrame() {
    this.count -= 1;
    if (this.count <= 0) {
      this.frame += 1;
      this.current = 1 - this.current;
      if (this.frame >= this.config.COLLECTED_FRAMES) {
        this.frame = 0
      }
      this.y[this.current] = -Math.abs(this.frame) * this.config.IMAGE_SIZE;
      this.count = this.ANIMATION_DIVIDER;
    }
    this.animation.go();
  }

}
