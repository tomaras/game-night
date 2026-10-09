// Service worker: makes the site installable, start instantly and keep working with a flaky connection.
//
// How updates reach people without interrupting anyone:
//  * scripts/build.mjs stamps BUILD and the PRECACHE list below, so sw.js changes on every deploy.
//  * The browser notices the new sw.js, downloads the whole new version into its OWN cache in the background,
//    and then WAITS. Nothing the user sees changes while they play (one version is never mixed with another).
//  * js/pwa.js tells the waiting worker to take over at a safe moment (home screen, not inside a room), then reloads.
//
// Emergency kill switch: deploy a sw.js that only unregisters itself (see README "If something goes wrong").
// Users can also open the site with ?reset to wipe the cache and service worker by hand.

const BUILD = '20261009.1052-c76dddc';
const PRECACHE = ["assets/chess/db.svg","assets/chess/dk.svg","assets/chess/dn.svg","assets/chess/dp.svg","assets/chess/dq.svg","assets/chess/dr.svg","assets/chess/lb.svg","assets/chess/lk.svg","assets/chess/ln.svg","assets/chess/lp.svg","assets/chess/lq.svg","assets/chess/lr.svg","assets/fonts/outfit-latin-ext.woff2","assets/fonts/outfit-latin.woff2","assets/icons/apple-touch-icon.png","assets/icons/icon-192.png","assets/icons/icon-512.png","assets/icons/maskable-512.png","css/style.css","index.html","js/audio.js","js/av.js","js/avatar.js","js/avui.js","js/config.js","js/drawpad.js","js/games/alienamong.js","js/games/beans.js","js/games/blocks.js","js/games/bomber.js","js/games/captions.js","js/games/champdraw.js","js/games/chess.js","js/games/codecrack.js","js/games/colorrush.js","js/games/connect4.js","js/games/copilots.js","js/games/dialitin.js","js/games/fibquiz.js","js/games/imposter.js","js/games/index.js","js/games/islandsettlers.js","js/games/jigsaw.js","js/games/letterdash.js","js/games/liars.js","js/games/movie.js","js/games/onenightwolf.js","js/games/petals.js","js/games/pinplace.js","js/games/poker.js","js/games/pong.js","js/games/pool.js","js/games/puckfootball.js","js/games/quipclash.js","js/games/redline.js","js/games/retro.js","js/games/rowrumble.js","js/games/royalletters.js","js/games/shadowquest.js","js/games/sketch.js","js/games/snake.js","js/games/spyplace.js","js/games/sumo.js","js/games/sushitrain.js","js/games/tanks.js","js/games/telephone.js","js/games/temple.js","js/games/tilemosaic.js","js/games/trainheist.js","js/games/trickcrew.js","js/games/triviatrap.js","js/games/tshirt.js","js/games/tunneltraitors.js","js/games/typeracer.js","js/games/uniqueclues.js","js/games/wonderrivals.js","js/games/wordbomb.js","js/games/wordspies.js","js/icons_data.js","js/kit.js","js/main.js","js/net.js","js/pwa.js","js/session.js","js/ui.js","js/util.js","js/words.js","manifest.webmanifest","vendor/chess.js","vendor/jsnes.min.js","vendor/peerjs.min.js"];

const APP_CACHE = 'gn-app-' + BUILD;
const DATA_CACHE = 'gn-data-v1'; // big, rarely-changing files (word list, world map, ROMs): refreshed in the background
const SCOPE = self.registration.scope;
const url = (p) => new URL(p, SCOPE).href;

self.addEventListener('install', (e) => {
  // If any file fails to download the install fails and the previous version keeps running — never a half update.
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(PRECACHE.map((p) => new Request(url(p), { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('gn-app-') && k !== APP_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'GET_BUILD') e.source?.postMessage({ type: 'BUILD', build: BUILD });
});

const isData = (u) => /\/(vendor\/(words\.txt|countries-110m\.json)|roms\/)/.test(u.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return; // fonts, PeerJS cloud etc. go straight to the network
  if (u.pathname.endsWith('/build.json') || u.pathname.endsWith('/sw.js')) return; // always fresh

  if (req.mode === 'navigate') {
    e.respondWith(caches.match(url('index.html')).then((r) => r || fetch(req)));
    return;
  }
  if (isData(u)) {
    e.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }
  e.respondWith(caches.open(APP_CACHE).then((c) => c.match(req, { ignoreSearch: true })).then((r) => r || fetch(req)));
});
