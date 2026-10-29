# VectoFly

Endless 3D plane game. Open `index.html` through any web server, or run the bundled one (below).

## Global leaderboard

The game shows a **World** tab (global) and a **This device** tab. The World tab turns on by itself when a
score server is reachable. Pick one option:

### Option A - bundled Node server (needs Node 16+, no npm install)
```
node server/server.js          # http://localhost:3000  (PORT=8080 node server/server.js to change)
```
It serves the game **and** `/api/scores`, so nothing to configure. Scores are stored in `server/data/scores.json`.
Deploy it on any Node host (Render, Railway, Fly.io, a VPS...). If the game files live somewhere else
(itch.io, GitHub Pages...), set `API_URL: 'https://your-server'` in `js/config.js`.
The server keeps one best score per player, rate-limits submissions and rejects impossible scores.

### Option B - Firebase Realtime Database (no server to run)
1. Create a project at https://console.firebase.google.com, add a **Realtime Database**.
2. Paste the database URL into `FIREBASE_URL` in `js/config.js`.
3. In the database **Rules** tab paste:
```json
{
  "rules": {
    "scores": {
      ".read": true,
      ".indexOn": ["s"],
      "$uid": {
        ".write": "!data.exists() || newData.child('s').val() >= data.child('s').val()",
        ".validate": "newData.hasChildren(['n','s','t'])",
        "n": { ".validate": "newData.isString() && newData.val().length <= 12" },
        "s": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 10000000" },
        "t": { ".validate": "newData.isNumber()" },
        "$other": { ".validate": false }
      }
    }
  }
}
```
Note: any browser game can be cheated by someone editing scores in their own browser; these limits only stop
the obvious abuse.

If neither is set up (or the server cannot be reached) the game falls back to the local board.

## What is in the box
- `js/game.js` core loop: flat endless world, obstacles, **damage** meter, fuel
- `js/world.js` flat scrolling ground + scenery for every map
- `js/planes.js` plane models and paint patterns
- `js/vectofly.js` hangar (planes / paints / maps), leaderboard, audio, saves

## Difficulty
Easy / Medium / Hard / Hell is chosen on the menu (saved per device). Harder modes hit harder, spawn bigger and closer waves, speed up faster and burn fuel quicker, but multiply score and coins (x1 / x1.25 / x1.5 / x2). Tune them in the `DIFFS` table in `js/vectofly.js`.

## SEO setup (do this before launch)
1. Set your domain everywhere (index.html, how-to-play.html, privacy.html, robots.txt, sitemap.xml):
   `sh set-domain.sh https://yourdomain.com`   (no trailing slash)
2. Upload the whole folder. Apache hosts use `.htaccess`, Netlify/Cloudflare Pages use `_headers`, Node hosts use `server/server.js`.
3. Google Search Console: add the site, submit `https://yourdomain.com/sitemap.xml`, then "Request indexing" for the home page.
4. Bing Webmaster Tools: import from Search Console, or submit the sitemap.
5. Test: Rich Results Test (JSON-LD), PageSpeed Insights, and share a link on WhatsApp/Discord to check the preview image.
6. Replace `img/og-image.jpg` (1200x630) with a real gameplay screenshot when you have one.
7. Legal pages (privacy, terms, contact, cookies, disclaimer, DMCA, about) are included and use itsvasudev404@gmail.com.
Note: `sitemap.xml` lastmod dates should be updated whenever you change a page.

## Deploy on Vercel with the global leaderboard (no Firebase)
1. Push this folder to GitHub and import it in Vercel (Framework preset: Other, no build command).
2. In the Vercel project open **Storage** (or Marketplace) > add **Upstash Redis** > connect it to the project. Vercel adds
   the `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`) env vars for you.
3. Redeploy. Leave `API_URL` and `FIREBASE_URL` empty in `js/config.js`: the game calls `/api/scores` on the same domain.
4. Check `https://yourdomain.com/api/scores` shows `{"scores":[]}`. The World tab appears in the game.
`api/scores.js` is the Vercel version of `server/server.js` (same validation and rate limit). `.vercelignore` keeps `server/` off the live site.
