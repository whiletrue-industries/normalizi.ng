import * as L from 'leaflet';
import * as geojson from 'geojson';
import { Observable } from 'rxjs';
import { GridItem } from '../datatypes';

export class NormalityLayer {
    layer: L.GeoJSON<any> = null;
    _grid: GridItem[] = [];
    private _renderer: any = null;

    constructor(private map: L.Map, private grid: Observable<any[]>) {
        this.map.createPane('normality');
        this.map.getPane('normality').style.zIndex = '10';
        // pane: 'normality' on a GeoJSON layer triggers Leaflet to auto-create
        // a pane renderer with the default padding of 0.1 (10%), which causes
        // severe clipping during zoom-out animations. Use an intentionally
        // oversized renderer so the clip edge stays far outside the animated
        // viewport even during large zoom-and-pan moves.
        this._renderer = (L.svg as any)({ padding: 500, pane: 'normality' });
        this.grid.subscribe(grid => {
            this._grid = grid;
            this.refresh();
        });
    }

    refresh() {
        const features: geojson.Feature[] = [];
        let minNorm = 1;
        let maxNorm = 0;
        this._grid.forEach((g) => {
            const norm = GridItem.normality(g);
            if (norm < minNorm) {
                minNorm = norm;
            }
            if (norm > maxNorm) {
                maxNorm = norm;
            }
        });
        const normRange = Math.max(maxNorm - minNorm, 0.1);
        this._grid.forEach((g) => {
            const x = g.pos.x;
            const y = - 1 - g.pos.y;
            const r = 0.24 * (1.0 - (GridItem.normality(g) - minNorm) / normRange);
            features.push({
                type: 'Feature',
                properties: {},
                geometry: {
                type: 'Polygon',
                coordinates: [
                    [
                    [x + r, y + r], [x + 1 - r, y + r], [x + 1 - r, y + 1 - r], [x + r, y + 1 - r]
                    ],
                    [
                    [x + 0.25, y + 0.25], [x + 0.75, y + 0.25], [x + 0.75, y + 0.75], [x + 0.25, y + 0.75]
                    ],
                ]              
                }
            });
        });
        const geoJson: geojson.FeatureCollection<any, any> = {type: 'FeatureCollection', features: features};
        if (this.layer) {
            this.map.removeLayer(this.layer);
        }
        this.layer = L.geoJSON(geoJson, {
            style: {
                fill: true,
                fillColor: '#eae7df',
                stroke: false,
                fillOpacity: 1  
            },
            renderer: this._renderer,
            noClip: true,
            pane: 'normality'
        } as any).addTo(this.map);  
    }
}