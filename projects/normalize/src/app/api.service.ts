import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

import { environment } from '../environments/environment';
import { ImageItem } from './datatypes';
import { debugLog } from './logger';
import { StateService } from './state.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  constructor(private http: HttpClient, private state: StateService) { }

  createNew(imageItem: ImageItem) {
    const params = {image: imageItem.image, descriptor: imageItem.descriptor, landmarks: imageItem.landmarks, gender_age: imageItem.gender_age, geolocation: imageItem.geolocation};
    return this.http.post(environment.endpoints.new, params);
  }

  getGame() {
    return this.http.get(environment.endpoints.getGame);
  }

  getImage(id): Observable<ImageItem> {
    return this.http.get(environment.endpoints.getImage, {params: {id}}).pipe(
      map(result => result as ImageItem)
    );
  }

  saveGameResults(results) {
    return this.http.post(environment.endpoints.gameResults, {results});
  }

  getMapConfiguration() {
    return this.http.get('https://normalizing-us-files.fra1.digitaloceanspaces.com/tsne.json');
  }

  getLatest() {
    const search = new URLSearchParams(location.search);
    const key = search.get('key');
    const params = {};
    if (key) {
      params['key'] = key;
    }
    return this.http.get(environment.endpoints.getLatest, {params}).pipe(
      map((result: any) => result.record as ImageItem)
    );
  }

  sendEmail(email) {
    if (!this.state.hasValidPrivateLinkData()) {
      debugLog('Skipping sendEmail due to invalid private-link data', {
        own_id: this.state.getOwnItemID(),
        image_id: this.state.getOwnImageID(),
        magic: this.state.getMagic()
      });
      return from([true]);
    }
    return from([true]).pipe(
      map(() => {
        const link = this.state.getPrivateUrl();
        const own_id = this.state.getOwnItemID();
        const magic = this.state.getMagic();
        const body = {email, link, own_id, magic};
        debugLog('EMAIL PARAMS', body);
        return body;
      }),
      switchMap((body) => this.http.post(environment.endpoints.sendEmail, body)),
      tap((res) => {
        debugLog('SENT EMAIL RESULT', res);
      })
    );
  }

  deleteOwnItem() {
    const id = this.state.getOwnItemID() + '';
    const magic = this.state.getMagic();
    if (id && magic) {
      return this.http.post(environment.endpoints.deleteItem, null, {params: {id, magic}}).pipe(
        tap((res) => {
          debugLog('DELETE ITEM RESULT', res);
        })
      );
    } else {
      return from([true]);
    }
  }
}
