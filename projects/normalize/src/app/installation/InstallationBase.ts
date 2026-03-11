import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { forkJoin, interval, ReplaySubject, Subscription } from "rxjs";
import { first, switchMap } from "rxjs/operators";
import { ApiService } from "../api.service";
import { OutputMapComponent } from "../output-map/output-map.component";

import * as L from 'leaflet';
import { TSNEOverlay } from "../map/tsne-overlay";
import { ImageFetcherService } from "../image-fetcher.service";
import { GridItem } from "../datatypes";

@Component({
    selector: 'app-installation-base',
    template: ``,
    standalone: false
})
export class InstallationBase implements AfterViewInit, OnInit, OnDestroy {

    @ViewChild(OutputMapComponent) mapElement: OutputMapComponent;

    map: L.Map;
    tsneOverlay: TSNEOverlay;
    grid = new ReplaySubject<GridItem[]>(1);

    ready = new ReplaySubject<void>(1);
    configuration: any;
    loop: Subscription;

    items: GridItem[] = [];
    baseFlyToParams = {};
    offsetX = 0;

    breatheOverlay: L.ImageOverlay = null;

    constructor(private api: ApiService, private fetchImage: ImageFetcherService) {
        this.api.getMapConfiguration().subscribe((config) => {
            this.configuration = config;
            this.grid.next(this.configuration.grid);
            this.ready.next();
        });
    }

    ngAfterViewInit() {
        this.ready.pipe(
            first(),
        ).subscribe(() => {
            this.createMap();
            this.loop = interval(10000).subscribe(() => {
                // this.loop = interval(5000).subscribe(() => {
                this.fetchLatest();
            });
            this.fetchLatest();
        });
    }

    createMap() {
        this.map = this.mapElement.getMap(this.configuration);
        this.mapElement.feature = 'faces';
        this.tsneOverlay = new TSNEOverlay(this.map, this.grid, this.configuration.dim, this.fetchImage);
        forkJoin(this.items.map((gi) => this.tsneOverlay.addImageLayer(gi.item))).subscribe((gis) => {
            this.items.forEach((gi, i) => {
                gi.pos = gis[i].pos;
            });
        });
    }

    fetchLatest() {
        this.api.getMapConfiguration().pipe(
            switchMap((config: any) => {
                if (config.set !== this.configuration.set) {
                    console.log('SET CHANGED!!!');
                    this.configuration = config;
                    this.grid.next(this.configuration.grid);
                    this.createMap();
                }
                return this.api.getLatest();
            })
        ).subscribe((data) => {
            this.tsneOverlay.addImageLayer(data).subscribe((gi: GridItem) => {
                if (this.items.length > 0) {
                    this.mapElement.normalityLayer.refresh();
                    const pos = this.items[0].pos;
                    let center: L.LatLngTuple =[-pos.y - 0.5, pos.x + 0.5];
                    const projected = this.map.project(center);
                    const moved = new L.Point(projected.x + this.offsetX, projected.y);
                    const newCenter = this.map.unproject(moved);

                    if (this.breatheOverlay) {
                        // precaution
                        this.breatheOverlay.remove();
                    }
                    const bounds: L.LatLngBoundsExpression = [[-pos.y - 0.75, pos.x + 0.25], [-pos.y - 0.25, pos.x + 0.75]];
                    this.breatheOverlay = new L.ImageOverlay('/assets/img/breathe.svg', bounds).addTo(this.map);

                    this.map.flyTo(center, this.configuration.min_zoom + 2, Object.assign({duration: 1}, this.baseFlyToParams));
                    setTimeout(() => {
                        // this.map.flyTo(newCenter, this.configuration.max_zoom, Object.assign({duration: 5}, this.baseFlyToParams));
                        const params: L.FitBoundsOptions = Object.assign({duration: 5, maxZoom: this.configuration.max_zoom, animate: true}, this.baseFlyToParams);
                        params['zoom'] = {animate: true, duration: 5};
                        // console.log('PPP', params);
                        this.map.flyToBounds(bounds, params);
                    }, 3000);
                }
                this.items.unshift(gi);
                if (this.items.length > 7) {
                    const removed = this.items.pop();
                    this.tsneOverlay.removeImageLayer(removed.item);
                }
            });
        });
    }

    ngOnInit() {
    }

    ngOnDestroy() {
        this.loop.unsubscribe();
    }
}
