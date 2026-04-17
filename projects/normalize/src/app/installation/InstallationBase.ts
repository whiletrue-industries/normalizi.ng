import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { forkJoin, interval, ReplaySubject, Subscription } from "rxjs";
import { first, switchMap } from "rxjs/operators";
import { ApiService } from "../api.service";
import { debugLog } from '../logger';
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
                    debugLog('SET CHANGED!!!');
                    this.configuration = config;
                    this.grid.next(this.configuration.grid);
                    this.createMap();
                }
                return this.api.getLatest();
            })
        ).subscribe((data) => {
            this.tsneOverlay.addImageLayer(data).subscribe((gi: GridItem) => {
                const incomingId = gi && gi.item ? gi.item.id : null;
                const currentTopId = this.items.length > 0 && this.items[0] && this.items[0].item ? this.items[0].item.id : null;

                // Skip immediate duplicate cards so the output stream never shows the same card twice in a row.
                if (incomingId !== null && currentTopId !== null && incomingId === currentTopId) {
                    return;
                }

                if (this.items.length > 0) {
                    this.mapElement.normalityLayer.refresh();
                    const pos = this.items[0].pos;
                    const mapCenter: L.LatLngTuple = [-this.configuration.dim / 2, this.configuration.dim / 2];

                    if (this.breatheOverlay) {
                        // precaution
                        this.breatheOverlay.remove();
                    }
                    const bounds: L.LatLngBoundsExpression = [[-pos.y - 0.75, pos.x + 0.25], [-pos.y - 0.25, pos.x + 0.75]];
                    this.breatheOverlay = new L.ImageOverlay('/assets/img/breathe.svg', bounds).addTo(this.map);

                    // Hide interactive paths before zoom-out
                    const paths = Array.from(document.querySelectorAll('.leaflet-interactive')) as SVGPathElement[];
                    const pathWidths: Map<SVGPathElement, string> = new Map();
                    
                    paths.forEach((path: SVGPathElement) => {
                        const computed = window.getComputedStyle(path);
                        const originalWidth = computed.strokeWidth;
                        pathWidths.set(path, originalWidth);
                        path.style.strokeWidth = '0';
                    });

                    // Zoom out with smoother cubic easing curve
                    const cubicEase = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                    this.map.flyTo(mapCenter, this.configuration.min_zoom + 2, Object.assign({duration: 1, easing: cubicEase}, this.baseFlyToParams));
                    
                    // Animate paths back from 0 to their original width before zoom-in
                    setTimeout(() => {
                        paths.forEach((path: SVGPathElement) => {
                            const originalWidth = pathWidths.get(path);
                            path.style.transition = 'stroke-width 1s ease-out';
                            // Trigger reflow to ensure transition is applied
                            (path as any).offsetHeight;
                            path.style.strokeWidth = originalWidth;
                        });
                    }, 500);

                    setTimeout(() => {
                        // this.map.flyTo(newCenter, this.configuration.max_zoom, Object.assign({duration: 5}, this.baseFlyToParams));
                        const params: L.FitBoundsOptions = Object.assign({duration: 5, maxZoom: this.configuration.max_zoom, animate: true}, this.baseFlyToParams);
                        params['zoom'] = {animate: true, duration: 5};
                        // console.log('PPP', params);
                        this.map.flyToBounds(bounds, params);
                    }, 3000);
                }

                // Keep each card unique in the visible stack.
                if (incomingId !== null) {
                    const existingIdx = this.items.findIndex((item) => item && item.item && item.item.id === incomingId);
                    if (existingIdx !== -1) {
                        this.items.splice(existingIdx, 1);
                    }
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
