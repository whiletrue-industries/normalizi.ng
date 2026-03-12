import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';

import * as L from 'leaflet';
import { Observable } from 'rxjs';
import { ApiService } from '../api.service';
import { GridItem } from '../datatypes';
import { LayoutService } from '../layout.service';
import { NormalityLayer } from '../map/normality-layer';

@Component({
    selector: 'app-output-map',
    templateUrl: './output-map.component.html',
    styleUrls: ['./output-map.component.less'],
    standalone: false
})
export class OutputMapComponent implements OnInit {

  @Input() clean = false;
  @Input() grid: Observable<GridItem[]>;
  @ViewChild('map') mapElement: ElementRef;
  map: L.Map;
  tileLayers: any = {};
  _feature = 'faces';
  normalityLayer: NormalityLayer;

  
  constructor(private layout: LayoutService) {}

  ngOnInit(): void {
  }

  ngAfterViewInit() {
  }

  getMap(configuration) {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    if (!this.map) {
      this.map = L.map(this.mapElement.nativeElement, {
        crs: L.CRS.Simple,
        renderer: L.svg({ padding: 12 }),
        maxZoom: configuration.max_zoom,
        minZoom: configuration.min_zoom,
        maxBounds: [[-configuration.dim * 2, -configuration.dim], [configuration.dim, configuration.dim * 2]],
        center: [-configuration.dim/2, configuration.dim/2],
        zoom: configuration.min_zoom + 2,
        zoomControl: false,
        attributionControl: false
      });
      if (this.layout.desktop && !this.clean) {
        new L.Control.Zoom({ position: 'bottomleft' }).addTo(this.map);
      }
      // Tile layers
      for (const feature of ['faces', 'mouths', 'eyes', 'noses', 'foreheads']) {
        this.tileLayers[feature] = L.tileLayer(`https://normalizing-us-files.fra1.cdn.digitaloceanspaces.com/feature-tiles/${configuration.set}/${feature}/{z}/{x}/{y}`, {
          maxZoom: 9,
          minZoom: configuration.min_zoom,
          bounds: [[-configuration.dim - 1, 0], [-1, configuration.dim]],
          errorTileUrl: '/assets/img/empty.png'
        });
      }
      this.normalityLayer = new NormalityLayer(this.map, this.grid);
    }
    return this.map;
  }

  set feature(feature: string) {
    if (this._feature) {
      this.map.removeLayer(this.tileLayers[this._feature]);
    }
    this._feature = feature;
    this.tileLayers[this._feature].addTo(this.map);
  }

  get feature(): string {
    return this._feature;
  }

}
