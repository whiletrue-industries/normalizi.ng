import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';

import * as L from 'leaflet';
import * as geojson from 'geojson';

import { forkJoin, from, merge, Observable, ReplaySubject, Subject } from 'rxjs';
import { catchError, delay, filter, first, last, map, mergeMap, switchMap, tap } from 'rxjs/operators';
import { ApiService } from '../api.service';
import { ImageFetcherService } from '../image-fetcher.service';
import { StateService } from '../state.service';
import { LayoutService } from '../layout.service';
import { Router } from '@angular/router';
import { GridItem, ImageItem } from '../datatypes';
import { TSNEOverlay } from './tsne-overlay';
import { FaceApiService } from '../face-api.service';
import { EmailModalComponent } from './email-modal/email-modal.component';
import { OutputMapComponent } from '../output-map/output-map.component';
import { debugLog } from '../logger';

@Component({
    selector: 'app-map',
    templateUrl: './map.component.html',
    styleUrls: ['./map.component.less'],
    standalone: false
})
export class MapComponent implements OnInit, AfterViewInit {

  map: L.Map;
  maxZoom: number;
  zoomedMax = false;
  
  definition = false;
  definitionClosed = new ReplaySubject(1);

  focusedLayerPhoto: L.ImageOverlay;
  focusedLayerPos: {x: number, y: number} = {x: -1, y: -1};
  focusedState = false;

  dim = 13;

  ready = new ReplaySubject(1);

  configuration: any = {};
  tileLayers: any = {};
  _feature = null;
  tsneOverlay: TSNEOverlay;
  grid = new ReplaySubject<GridItem[]>(1);
  ownGI = null;

  hasSelfie = false;
  focusedItem: GridItem = null;
  breatheOverlay: L.ImageOverlay = null;
  overlay = true;
  _drawerOpen = true;

  consentModalOpen = false;
  redirectModalOpen = false;
  emailModalOpen = false;
  deleteModalOpen = false;

  private readonly transitionEase = 0.12;
  private readonly zoomOutDurationSec = 1.35;
  private readonly zoomInDurationSec = 1.65;
  private readonly drawerMoveDurationSec = 1.1;
  private readonly mapBackgroundColor = '#EAE7DF';

  @ViewChild(OutputMapComponent) mapElement: OutputMapComponent;
  @ViewChild(EmailModalComponent) emailModal: EmailModalComponent;
  
  constructor(private api: ApiService, private faceapi: FaceApiService,
              private fetchImage: ImageFetcherService, private state: StateService,
              public layout: LayoutService, private router: Router) {
  }

  ngOnInit(): void {
    this.api.getMapConfiguration().subscribe((config) => {
      this.configuration = config;
      this.dim = this.configuration.dim;
      this.ready.next();
      this.ready.complete();
    });
    this.hasSelfie = this.state.imageID || this.state.descriptor;
  }

  ngAfterViewInit() {
    debugLog('HAS SELFIE', this.state.imageID, this.state.descriptor);
    setTimeout(() => {
      this.hasSelfie = this.state.imageID || this.state.descriptor;
    }, 0);
    let start = this.state.gallery ? from([false]) : from([true]);
    let suppressOwnImageOnLoad = false;
    this.state.needsEmail.subscribe(() => {
      debugLog('NEEDS EMAIL');
      this.definition = true;
      if (this.state.getOwnItemID() && !this.state.getAskedForEmail()) {
        this.emailModalOpen = true;
        if (!this.state.gallery) {
          start = this.emailModal.closed.pipe(
            filter((action: string) => action === 'added' || action === 'deleted'),
            tap((action: string) => {
              suppressOwnImageOnLoad = action === 'deleted';
            }),
            map(() => true)
          );
        }
      } else {
        if (this.state.gallery) {
          this.router.navigate(['/selfie'])
        }
      }
    });
    if (!this.state.getNeedsEmail()) {
      debugLog('DOESNT NEED EMAIL');
      this.definitionClosed.next();
      if (this.state.gallery) {
        this.router.navigate(['/selfie']);
      }
    }
    start.pipe(
      filter((el) => !!el),
      switchMap(() => {
        debugLog('WAITING FOR READY');
        return this.ready;
      }),
      tap(() => { // SET UP MAP
        this.maxZoom = this.configuration.max_zoom;
        // Create map
        this.map = this.mapElement.getMap(this.configuration);
        this.feature = 'faces';
        // Map events
        this.map.on('zoomend', (ev) => { return this.onZoomChange(); });
        this.map.on('moveend', (ev) => { return this.onBoundsChange(); });
        this.map.on('click', (ev: L.LeafletMouseEvent) => {
          const latlng = ev.latlng;
          const x = Math.floor(latlng.lng);
          const y = -Math.ceil(latlng.lat);
          const current = this.focusedItem;
          let proposed = null;
          if (x >= 0 && y >= 0) {
            for (const item of this.configuration.grid) {
              const posX = item.pos.x;
              const posY = item.pos.y;
              if (x === posX && y === posY) {
                proposed = item;
                break;
              }
            }
          }
          if (current !== proposed || proposed === null) {
            this.drawerOpen = false;
          }
          if (proposed !== null) {
            setTimeout(() => {
              this.focusedItem = proposed;
              this.drawerOpen = true;
            }, 500);
          }
        });        
      }),
      tap(() => { // SET UP TSNE OVERLAY
        this.tsneOverlay = new TSNEOverlay(this.map, this.grid, this.configuration.dim, this.fetchImage);
        const items: Observable<ImageItem>[] = [];

        let expectedId = suppressOwnImageOnLoad ? null : this.state.getOwnItemID();
        if (!suppressOwnImageOnLoad && this.state.getOwnImageID()) {
          if (this.state.getDescriptor()) {
            const gl = this.state.getGeolocation();
            const item: ImageItem = {
              id: this.state.getOwnItemID(),
              image: this.state.getOwnImageID(),
              descriptor: this.state.getDescriptor(),
              votes: this.state.getVotedSelf(),
              tournaments: 1,
              votes_0: 0,
              tournaments_0: 0,
              votes_1: 0,
              tournaments_1: 0,
              votes_2: 0,
              tournaments_2: 0,
              votes_3: 0,
              tournaments_3: 0,
              votes_4: this.state.getVotedSelf(),
              tournaments_4: 1,
              created_timestamp: new Date().toUTCString(),
              landmarks: this.state.getLandmarks(),
              gender_age: this.state.getGenderAge(),
              geolocation: gl,
              place_name: gl ? `${gl[0].toFixed(2)}, ${gl[1].toFixed(2)}` : ''
            };
            items.push(from([item]));
          } else {
            items.push(
              this.api.getImage(this.state.getOwnItemID()).pipe(
                catchError(() => {
                  return from([{} as ImageItem]);
                }),
                tap((item) => {
                  this.state.checkItem(item);
                }),
              )
            );
            expectedId = null;
          }
        }
        const sharedId = this.state.urlSearchParam('id');
        if (sharedId) {
          expectedId = parseInt(sharedId);
          items.push(
            this.api.getImage(expectedId)
          );
        }
        if (items.length > 0) {
          let targetGi = null;
          merge(...items).pipe(
            mergeMap((item) => {
              return this.tsneOverlay.addImageLayer(item);
            }),
            tap((gi) => {
              if (gi.item.id === expectedId) {
                targetGi = gi;
              }
              if (gi.item.id === this.state.getOwnItemID()) {
                this.ownGI = gi;
              }
            }),
            last(),
            switchMap(() => this.definitionClosed),
            map(() => {
              let center: L.LatLngExpression = null;
              if (targetGi !== null) {
                this.overlay = false;
                this.drawerOpen = false;
                this.mapElement.normalityLayer.refresh();

                const pos = targetGi.pos;
                center = [-pos.y - 0.5, pos.x + 0.5];
              }
              return center;
            }),
            switchMap((center) => {
              if (center === null) {
                return from([null]);
              }

              return this.flyToSmooth(this.map.getCenter(), this.maxZoom - 5, this.zoomOutDurationSec).pipe(
                switchMap(() => this.flyToSmooth(center, this.maxZoom, this.zoomInDurationSec)),
                map(() => center)
              );
            }),
          ).subscribe((center) => {
            if (center !== null && targetGi !== null) {
              this.focusedItem = targetGi;
              this.drawerOpen = true;
            }
          });          
        }
        this.grid.next(this.configuration.grid);
      })
    ).subscribe(() => {
      debugLog('FINISHED VIEW INIT');
    });
  }

  onZoomChange() {
    // this.zoomedMax = this.map.getZoom() >= this.maxZoom;
    this.onBoundsChange();
  }

  onBoundsChange() {
    const bounds = this.map.getBounds();
    const weights = [0.5, 0.5];
    if (this.drawerOpen) {
      if (this.layout.mobile) {
        weights[1] = 0.875;
      } else {
        weights[0] = (0.5 - (200 / window.innerWidth));
      }  
    }
    const pos = {
      lng: bounds.getWest() + (bounds.getEast() - bounds.getWest()) * weights[0],
      lat: bounds.getSouth() + (bounds.getNorth() - bounds.getSouth()) * weights[1]
    };
    const x = Math.floor(pos.lng);
    const y = -Math.ceil(pos.lat);
    const dist = Math.sqrt(Math.pow(x - pos.lng, 2) + Math.pow(y + pos.lat, 2));
    if (this.focusedLayerPos.x !== x || this.focusedLayerPos.y !== y) {
      this.focusedLayerPos = {x, y};
      this.focusedState = false;
      for (const item of this.configuration.grid) {
        const posX = item.pos.x;
        const posY = item.pos.y;
        if (x === posX && y === posY) {
          this.focusedItem = item;
          this.updateBreatheOverlay(this.focusedItem.pos);
          setTimeout(() => {
            this.focusedState = true;
          }, 500);
        }
      }
    }
  }

  set feature(feature: string) {
    this.mapElement.feature = feature;
  }

  get feature(): string {
    return this.mapElement.feature;
  }

  start(skipConsent?: boolean) {
    if (this.layout.mobile) {
      if (!skipConsent) {
        this.consentModalOpen = true;
      } else {
        this.router.navigate(['/selfie']);
      }
    } else {
      this.redirectModalOpen = true;
    }
    this.drawerOpen = false
  }

  delete() {
    this.drawerOpen = false
    this.deleteModalOpen = true
  }

  handleEmailModalClosed(action: string): void {
    this.emailModalOpen = false;
    if (action === 'retake') {
      this.router.navigate(['/selfie']);
    } else if (action === 'added') {
      if (this.state.gallery) {
        this.router.navigate(['/selfie']);
      }
    } else if (action === 'deleted') {
      if (this.state.gallery) {
        this.router.navigate(['/selfie']);
      } else {
        this.hasSelfie = false;
        this.coverDeletedFace();
      }
    }
  }

  private coverDeletedFace(): void {
    if (this.map) {
      this.overlay = false;
      this.focusedItem = null;
      if (this.breatheOverlay) {
        this.breatheOverlay.remove();
        this.breatheOverlay = null;
      }
      this.drawerOpen = false;
    }

    if (this.ownGI && this.map) {
      if (this.tsneOverlay) {
        this.tsneOverlay.removeImageLayer(this.ownGI.item);
      }
      const pos = this.ownGI.pos;
      L.rectangle(
        [[-pos.y - 1, pos.x], [-pos.y, pos.x + 1]] as L.LatLngBoundsExpression,
        { color: 'transparent', weight: 0, fillColor: this.mapBackgroundColor, fillOpacity: 1, interactive: false }
      ).addTo(this.map);
      const idx = this.configuration.grid.indexOf(this.ownGI);
      if (idx !== -1) {
        this.configuration.grid.splice(idx, 1);
        this.grid.next(this.configuration.grid);
      }
      if (this.focusedItem === this.ownGI) {
        this.focusedItem = null;
        this.drawerOpen = false;
      }
      this.ownGI = null;
    }

    if (this.map) {
      this.flyToSmooth(this.map.getCenter(), this.maxZoom - 5, this.zoomOutDurationSec).subscribe();
    }
  }

  focusOnSelf() {
    this.drawerOpen = false;
    const pos = this.ownGI.pos;
    const center: L.LatLngExpression = [-pos.y - 0.5, pos.x + 0.5];
    this.flyToSmooth(center, this.maxZoom, this.zoomInDurationSec).subscribe(() => {
      this.focusedItem = this.ownGI;
      this.drawerOpen = true;  
    });
  }

  updateBreatheOverlay(pos) {
    if (this.breatheOverlay) {
      // precaution
      this.breatheOverlay.remove();
    }
    this.breatheOverlay = new L.ImageOverlay('/assets/img/breathe.svg', 
        [[-pos.y - 0.75, pos.x + 0.25], [-pos.y - 0.25, pos.x + 0.75]]).addTo(this.map);
  }

  set drawerOpen(open: boolean) {
    this._drawerOpen = open;
    if (this.map && this.focusedItem) {
      const zoom = this.map.getZoom();
      if (open) {
        const options: any = {
          animate: true,
          duration: this.drawerMoveDurationSec,
          easeLinearity: this.transitionEase,
        };
        if (this.layout.mobile) {
          options.paddingBottomRight = [0, open ? window.innerHeight * 0.73 : 70]
        } else {
          options.paddingBottomRight = [open ? 400 : 0, 0];
        }
        this.map.fitBounds(
          [[-this.focusedItem.pos.y - 1, this.focusedItem.pos.x], [-this.focusedItem.pos.y, this.focusedItem.pos.x + 1]], options
        );
        this.updateBreatheOverlay(this.focusedItem.pos);
      } else {
        this.map.setView(
          [-this.focusedItem.pos.y - 0.5, this.focusedItem.pos.x + 0.5],
          zoom,
          { animate: true, duration: this.drawerMoveDurationSec, easeLinearity: this.transitionEase }
        );
        if (this.breatheOverlay) {
          this.breatheOverlay.remove();
          this.breatheOverlay = null;
        }
        // this.focusedItem = null;
      }
    }
  } 

  get drawerOpen() {
    return this._drawerOpen;
  }

  private flyToSmooth(center: L.LatLngExpression, zoom: number, durationSec: number): Observable<void> {
    return new Observable<void>((observer) => {
      if (!this.map) {
        observer.next();
        observer.complete();
        return () => {
          // No-op teardown when map is unavailable.
        };
      }

      let done = false;
      const complete = () => {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(fallbackTimeout);
        this.map.off('moveend', complete);
        this.map.off('zoomend', complete);
        observer.next();
        observer.complete();
      };

      this.map.once('moveend', complete);
      this.map.once('zoomend', complete);
      this.map.flyTo(center, zoom, {
        animate: true,
        duration: durationSec,
        easeLinearity: this.transitionEase,
      });

      // Fallback in case map events are skipped by a no-op transition.
      const fallbackTimeout = setTimeout(complete, durationSec * 1000 + 250);

      return () => {
        clearTimeout(fallbackTimeout);
        this.map.off('moveend', complete);
        this.map.off('zoomend', complete);
      };
    });
  }

}
