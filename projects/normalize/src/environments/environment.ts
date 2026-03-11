// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  endpoints: {
    new: 'https://europe-west3-normalize-us.cloudfunctions.net/upload-selfie',
    getGame: 'https://europe-west3-normalize-us.cloudfunctions.net/get-game',
    getImage: 'https://europe-west3-normalize-us.cloudfunctions.net/get-image',
    gameResults: 'https://europe-west3-normalize-us.cloudfunctions.net/game-results',
    sendEmail: 'https://europe-west3-normalize-us.cloudfunctions.net/send_email',
    deleteItem: 'https://europe-west3-normalize-us.cloudfunctions.net/delete-item',
    getLatest: 'https://europe-west3-normalize-us.cloudfunctions.net/get-latest',
    // new: 'http://localhost:8080/'
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
