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

const BUILD = 'local'; // __BUILD__ (stamped at build time)
const PRECACHE = []; // __PRECACHE__ (stamped at build time)

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
