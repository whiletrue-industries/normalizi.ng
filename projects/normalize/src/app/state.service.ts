import { Injectable } from '@angular/core';
import { BehaviorSubject, ReplaySubject } from 'rxjs';
import { delay, first } from 'rxjs/operators';
import { ImageItem } from './datatypes';
import { Galleries } from './galleries';
import { debugLog } from './logger';

@Injectable({
  providedIn: 'root'
})
export class StateService {
  OWN_ID_KEY = 'normalize_own_id';
  OWN_IMAGE_KEY = 'normalize_own_image';
  OWN_MAGIC_KEY = 'normalize_own_magic';
  PLAYED_KEY = 'normalize_played';
  ASKED_FOR_EMAIL_KEY = 'normalize_email';
  GALLERY = 'normalize_gallery';

  descriptor: any;
  landmarks: any;
  gender_age: any;
  itemID: number;
  imageID: string;
  geolocation: number[];
  place_name: string;
  magic: string;
  played = false;
  askedForEmail = false;
  handlingRequest = false;
  requests = [];
  needsEmail = new ReplaySubject<void>(1);
  votedSelf = 0;
  gallery = false;
  lastDeletedOwnItemID: number = null;
  networkQueueLength = new BehaviorSubject<number>(0);

  constructor() {
    this.checkUrlParameters();
    try {
      this.itemID = parseInt(window.localStorage.getItem(this.OWN_ID_KEY));
    } catch (e) {
      this.itemID = null;
    }
    this.imageID = window.localStorage.getItem(this.OWN_IMAGE_KEY);
    this.magic = window.localStorage.getItem(this.OWN_MAGIC_KEY);
    this.played = window.localStorage.getItem(this.PLAYED_KEY) === 'true';
    this.askedForEmail = window.localStorage.getItem(this.ASKED_FOR_EMAIL_KEY) === 'true';
    this.checkGallery();
    if (this.getNeedsEmail()) {
      this.needsEmail.next();
    }
  }

  checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const itemID = urlParams.get('i');
    const imageID = urlParams.get('u');
    const magic = urlParams.get('m');
    if (itemID && imageID && magic) {
      this.setPlayed();
      this.setAskedForEmail();
      window.localStorage.setItem(this.OWN_ID_KEY, itemID);
      window.localStorage.setItem(this.OWN_IMAGE_KEY, imageID);
      window.localStorage.setItem(this.OWN_MAGIC_KEY, magic);
      window.location.search = '';
    }
    const gallery = urlParams.get('gallery');
    if (gallery) {
      if (gallery === 'clear') {
        window.localStorage.removeItem(this.GALLERY);
      } else {
        const coords = Galleries[gallery];
        if (coords) {
          this.setGallery(coords);
        }
      }
    }
  }

  getPrivateUrl() {
    if (!this.hasValidPrivateLinkData()) {
      return null;
    }
    return `https://normalizi.ng/?i=${this.itemID}&u=${this.imageID}&m=${this.magic}`;
  }

  hasValidPrivateLinkData() {
    const validItemID = Number.isFinite(this.itemID) && this.itemID > 0;
    const validImageID = !!this.imageID && this.imageID !== 'null' && this.imageID !== 'undefined';
    const validMagic = !!this.magic && this.magic !== 'null' && this.magic !== 'undefined';
    return validItemID && validImageID && validMagic;
  }

  setOwnInfo(value) {
    this.itemID = value.id || this.itemID || -1;
    this.imageID = value.image;
    this.magic = value.magic || this.magic;
    this.descriptor = value.descriptor || this.descriptor;
    this.landmarks = value.landmarks || this.landmarks;
    this.gender_age = value.gender_age || this.gender_age;
    this.lastDeletedOwnItemID = null;
    window.localStorage.setItem(this.OWN_ID_KEY, this.itemID + '');
    if (this.imageID && this.imageID.length < 64) {
      window.localStorage.setItem(this.OWN_IMAGE_KEY, this.imageID);
    } else {
      window.localStorage.removeItem(this.OWN_IMAGE_KEY);
    }
    window.localStorage.removeItem(this.ASKED_FOR_EMAIL_KEY);
    if (this.magic) {
      window.localStorage.setItem(this.OWN_MAGIC_KEY, this.magic);
      this.needsEmail.next();
    } else {
      window.localStorage.removeItem(this.OWN_MAGIC_KEY);
    }
  }

  setGeolocation(geolocation: number[]) {
    this.geolocation = geolocation;
  }

  setPlaceName(place_name: string) {
    this.place_name = place_name;
  }

  setVotedSelf() {
    this.votedSelf = 1;
  }

  getVotedSelf() {
    return this.votedSelf;
  }

  getOwnItemID() {
    return this.itemID;
  }

  setLastDeletedOwnItemID(itemID: number) {
    this.lastDeletedOwnItemID = itemID;
  }

  getLastDeletedOwnItemID() {
    return this.lastDeletedOwnItemID;
  }

  clearLastDeletedOwnItemID() {
    this.lastDeletedOwnItemID = null;
  }

  getOwnImageID() {
    return this.imageID;
  }

  getMagic() {
    return this.magic;
  }

  getDescriptor() {
    return this.descriptor;
  }

  getLandmarks() {
    return this.landmarks;
  }

  getGenderAge() {
    return this.gender_age;
  }

  getGeolocation() {
    return this.geolocation;
  }

  getPlaceName() {
    return this.place_name;
  }

  getPlayed() {
    return this.played;
  }

  setPlayed() {
    this.played = true;
    window.localStorage.setItem(this.PLAYED_KEY, 'true');
  }

  setAskedForEmail() {
    this.askedForEmail = true;
    window.localStorage.setItem(this.ASKED_FOR_EMAIL_KEY, 'true');
  }

  getAskedForEmail() {
    return this.askedForEmail;
  }

  setGallery(coords) {
    window.localStorage.setItem(this.GALLERY, JSON.stringify(coords));
  }

  checkGallery() {
    try {
      const coordsJson = window.localStorage.getItem(this.GALLERY);
      const coords = JSON.parse(coordsJson);
      if (coords && Array.isArray(coords)) {
        this.setGeolocation(JSON.parse(coordsJson));
        this.gallery = true;
        debugLog('IN GALLERY @', coordsJson);
        return;
      }
    } catch (e) {
    }
    debugLog('NOT IN GALLERY');
  }

  pushRequest(request) {
    this.requests.push(request);
    this.handleRequest();
  }

  handleRequest() {
    if (this.handlingRequest) {
      return;
    }
    debugLog('networkQueueLength', this.requests.length);
    this.networkQueueLength.next(this.requests.length);
    if (this.requests.length === 0) {
      return;
    }
    const request = this.requests.shift();
    this.handlingRequest = true;
    request.pipe(
      first(),
      delay(0),
    ).subscribe(() => {
      this.handlingRequest = false;
      this.handleRequest();
    });
  }

  clear() {
    this.itemID = null;
    this.imageID = null;
    this.magic = null;
    window.localStorage.removeItem(this.OWN_ID_KEY);
    window.localStorage.removeItem(this.OWN_IMAGE_KEY);
    window.localStorage.removeItem(this.OWN_MAGIC_KEY);
  }

  fullClear() {
    this.clear();
    this.played = false;
    this.askedForEmail = false;
    window.localStorage.removeItem(this.PLAYED_KEY);
    window.localStorage.removeItem(this.ASKED_FOR_EMAIL_KEY);
  }

  checkItem(item: ImageItem) {
    if (
      (item.id !== this.getOwnItemID()) ||
      (item.image !== this.getOwnImageID())
    ) {
      this.fullClear();
      window.location.reload();
    }
    return true;
  }

  getNeedsEmail() {
    return (this.magic || this.gallery) && !this.askedForEmail;
  }

  urlSearchParam(key) {
    const params = new URLSearchParams(location.search);
    return params.get(key);
  }
}
