import * as L from 'leaflet';
import { Observable, ReplaySubject } from "rxjs";
import { euclideanDistance } from 'face-api.js';
import { GridItem, ImageItem } from '../datatypes';
import { first, map, tap } from 'rxjs/operators';
import { ImageFetcherService } from '../image-fetcher.service';
import { debugLog } from '../logger';

class Overlaid {
  image: GridItem;
  overlay: L.ImageOverlay;
}


export class TSNEOverlay {

  grid: GridItem[];
  imageLayers: any = {};

  constructor(private map: L.Map, private gridObs: ReplaySubject<GridItem[]>,
              private dim: number, private imageFetcher: ImageFetcherService) {
    this.map.createPane('tsne-overlay');
    this.map.getPane('tsne-overlay').style.zIndex = '9';
    this.gridObs.subscribe(grid => {
      this.grid = grid;
    });
  }
  
  addImageLayer(image: ImageItem) {
    return this.gridObs.pipe(first(), map((grid) => {
      let found = null;
      this.grid.forEach((gi) => {
        if (gi.item.id === image.id) {
          found = gi;
        }
      });
      if (!found) {
        debugLog('NOT FOUND in GRID');
        let bestImage = null;
        let bestDistance = null;
        this.grid.forEach((gi) => {
          const distance = euclideanDistance(image.descriptor, gi.item.descriptor);
          if (distance < bestDistance || bestDistance === null) {
            bestImage = gi;
            bestDistance = distance;
          }
        });
        const emptyPosition = this.findEmpty(bestImage);
        debugLog('EMPTY POSITION', bestImage, bestDistance, emptyPosition);
        const overlay = new L.ImageOverlay(
          this.imageFetcher.fetchFaceImage(image.image),
          [[-emptyPosition.y-0.75, emptyPosition.x+0.25], [-emptyPosition.y-0.25, emptyPosition.x+0.75]]
        );
        overlay.addTo(this.map);
        this.imageLayers[image.id] = overlay;
        const gi = {pos: emptyPosition, item: image};
        this.grid.push(gi);
        return gi;
      } else {
        debugLog('FOUND in GRID');
        // const bounds: L.LatLngBoundsExpression = [[-found.pos.y-1, found.pos.x], [-found.pos.y, found.pos.x+1]];
        return found;
      }
    }), first());
  }

  removeImageLayer(image: ImageItem) {
    const layer: L.ImageOverlay = this.imageLayers[image.id];
    if (layer) {
      layer.remove();
      delete this.imageLayers[image.id];
    }
  }

  isEmpty(x, y) {
    if (x < 0 || x >= this.dim || y < 0 || y >= this.dim) {
      return false;
    }
    let empty = true;
    this.grid.forEach((gi) => {
      if (gi.pos.x === x && gi.pos.y === y) {
        empty = false;
      }
    });
    return empty;
  }

  findEmpty(gi: GridItem) {
    const checks = [[-1, 0], [0, -1], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const check of checks) {
      if (this.isEmpty(gi.pos.x + check[0], gi.pos.y + check[1])) {
        return { x: gi.pos.x + check[0], y: gi.pos.y + check[1] };
      }
    }
    return { x: gi.pos.x, y: gi.pos.y };
  }
}