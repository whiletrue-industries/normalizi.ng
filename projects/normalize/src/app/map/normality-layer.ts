import * as L from 'leaflet';
import * as geojson from 'geojson';
import { Observable } from 'rxjs';
import { GridItem } from '../datatypes';

export class NormalityLayer {
    layer: L.GeoJSON<any> = null;
    _grid: GridItem[] = [];

    constructor(private map: L.Map, private grid: Observable<any[]>) {
        this.map.createPane('normality');
        this.map.getPane('normality').style.zIndex = '10';
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
            pane: 'normality'
        }).addTo(this.map);  
    }
}