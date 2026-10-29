// VectoFly settings.
var isMobile = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) || ('ontouchstart' in window && Math.min(screen.width, screen.height) < 800);
var Colors = { red:0xf25346, white:0xd8d0d1, brown:0x59332e, brownDark:0x23190f, pink:0xF5986E, yellow:0xf4ce93, blue:0x68c3c0 };

// ---------------------------------------------------------------------------------------------
// GLOBAL LEADERBOARD  (see README.md - pick ONE of the two options, or neither)
//
//  A) Own server (easiest):  run  `node server/server.js`  - it serves the game AND the board on the
//     same address, so you do not have to configure anything here (API_URL can stay '').
//     If the game is hosted somewhere else than the server, put the server address in API_URL,
//     e.g. 'https://scores.example.com'
//
//  B) Firebase Realtime Database (no server to run): paste its URL in FIREBASE_URL,
//     e.g. 'https://my-vectofly-default-rtdb.firebaseio.com'
//
// If neither is available the game quietly uses the local "This device" board only.
// ---------------------------------------------------------------------------------------------
window.VECTOFLY_CONFIG = {
  API_URL: '',
  FIREBASE_URL: '',
  BOARD_PATH: 'scores',   // folder name inside the Firebase database
  SHOW_TOP: 20
};
