export const environment = {
  production: true,
  debug: false,
  endpoints: {
    new: 'https://europe-west3-normalize-us.cloudfunctions.net/upload-selfie',
    getGame: 'https://europe-west3-normalize-us.cloudfunctions.net/get-game',
    getImage: 'https://europe-west3-normalize-us.cloudfunctions.net/get-image',
    gameResults: 'https://europe-west3-normalize-us.cloudfunctions.net/game-results',
    sendEmail: 'https://europe-west3-normalize-us.cloudfunctions.net/send_email',
    deleteItem: 'https://europe-west3-normalize-us.cloudfunctions.net/delete-item',
    getLatest: 'https://europe-west3-normalize-us.cloudfunctions.net/get-latest',
  }
};
