import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { defer, from, fromEvent, Subject } from 'rxjs';
import { first, switchMap } from 'rxjs/operators';
import { ApiService } from '../api.service';
import { FaceApiService } from '../face-api.service';
import { FaceProcessorService } from '../face-processor.service';
import * as faceapi from 'face-api.js';

@Component({
    selector: 'app-dataset',
    templateUrl: './dataset.component.html',
    styleUrls: ['./dataset.component.less'],
    standalone: false
})
export class DatasetComponent implements OnInit, AfterViewInit {

  @ViewChild('image') image: ElementRef;
  url = '';
  preview = '';
  extracted = '';
  images: any[] = [];
  datasetSnap = {
    orientaton: 100,
    size: 100,
    distance: 10
  };
  imageUrl = '';
  imageLoaded = new Subject<EventTarget>();

  constructor(private faceProcessor: FaceProcessorService, private faceApi: FaceApiService, private api: ApiService, private http: HttpClient) { }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
  }

  testUrl(event: Event) {
    const name = (event.target as HTMLInputElement).value;
    if (name === 'tpdne') {
      this.images = [];
      for (let i = 0 ; i < 1000 ; i++) {
        this.images.push(`http://127.0.0.1:5000/#${i}`)
      }
      setTimeout(() => {
        this.getNextImage();
      }, 0);
      return;
    }
    const index_url = `https://storage.googleapis.com/selfie-datasets/${name}/index.json?a`;
    this.http.get(index_url).subscribe((results: any[]) => {
      this.images = results.map(x => `https://storage.googleapis.com/selfie-datasets/${name}/${x}`);
      setTimeout(() => {
        this.getNextImage();
      }, 0);
    });
  }

  pullImage() {
    if (this.images.length > 0) {
      return this.images.shift();
    }
  }

  getNextImage() {
    let observer: any = null;
    this.faceApi.ready
    .pipe(
      switchMap(() => {
        const imageUrl = this.pullImage();
        this.imageUrl = imageUrl;
        return this.imageLoaded.pipe(first());
        // return faceapi.fetchImage(imageUrl);
      }),
      switchMap((img) => {
        return this.faceProcessor.processFaces(img as HTMLImageElement, 0, this.datasetSnap);
      }),
      switchMap((event) => {
        if (event.kind === 'start') {
          observer = event.observer;
        } else if (event.kind === 'transform') {
          this.preview = event.preview;
        } else if (event.kind === 'detection') {
          if (!event.detected) {
            observer.cancel();
          }
        } else if (event.kind === 'done') {
          console.log('GOT EVENT DONE', event.collected);
          this.extracted = event.image;
          if (event.collected) {
            return this.api.createNew(event);
          } else {
            return from([false]);
          }
        }
        return from([]);
      })
    ).subscribe((res) => {
      console.log('UPLOADED', res);
      this.getNextImage(); 
    });
  }

  get hasList() : boolean {
    return this.images.length > 0;
  }

}
