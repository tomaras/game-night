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

const CACHE_PREFIX = 'gn-nightly-';
const BUILD = '20261021.0523-79a0a65';
const PRECACHE = ["assets/chess/db.svg","assets/chess/dk.svg","assets/chess/dn.svg","assets/chess/dp.svg","assets/chess/dq.svg","assets/chess/dr.svg","assets/chess/lb.svg","assets/chess/lk.svg","assets/chess/ln.svg","assets/chess/lp.svg","assets/chess/lq.svg","assets/chess/lr.svg","assets/fonts/README.txt","assets/fonts/outfit-latin-ext.woff2","assets/fonts/outfit-latin.woff2","assets/gameicons/alienamong.svg","assets/gameicons/beans.svg","assets/gameicons/blocks.svg","assets/gameicons/bomber.svg","assets/gameicons/captions.svg","assets/gameicons/cascadia.svg","assets/gameicons/champdraw.svg","assets/gameicons/chess.svg","assets/gameicons/codecrack.svg","assets/gameicons/colorrush.svg","assets/gameicons/connect4.svg","assets/gameicons/copilots.svg","assets/gameicons/coup.svg","assets/gameicons/dialitin.svg","assets/gameicons/drawbattle.svg","assets/gameicons/fibquiz.svg","assets/gameicons/harmonies.svg","assets/gameicons/hive.svg","assets/gameicons/imposter.svg","assets/gameicons/islandsettlers.svg","assets/gameicons/jigsaw.svg","assets/gameicons/letterdash.svg","assets/gameicons/liars.svg","assets/gameicons/movie.svg","assets/gameicons/onenightwolf.svg","assets/gameicons/petals.svg","assets/gameicons/pinplace.svg","assets/gameicons/poker.svg","assets/gameicons/pong.svg","assets/gameicons/pool.svg","assets/gameicons/puckfootball.svg","assets/gameicons/quipclash.svg","assets/gameicons/redline.svg","assets/gameicons/retro.svg","assets/gameicons/rowrumble.svg","assets/gameicons/royalletters.svg","assets/gameicons/shadowquest.svg","assets/gameicons/sketch.svg","assets/gameicons/snake.svg","assets/gameicons/spyplace.svg","assets/gameicons/sumo.svg","assets/gameicons/sushitrain.svg","assets/gameicons/tanks.svg","assets/gameicons/telephone.svg","assets/gameicons/temple.svg","assets/gameicons/tilemosaic.svg","assets/gameicons/trainheist.svg","assets/gameicons/trickcrew.svg","assets/gameicons/triviatrap.svg","assets/gameicons/tshirt.svg","assets/gameicons/tunneltraitors.svg","assets/gameicons/typeracer.svg","assets/gameicons/uniqueclues.svg","assets/gameicons/wingspan.svg","assets/gameicons/wonderrivals.svg","assets/gameicons/wordbomb.svg","assets/gameicons/wordspies.svg","assets/icons/apple-touch-icon.png","assets/icons/icon-192.png","assets/icons/icon-512.png","assets/icons/maskable-512.png","assets/sfx/bell/ding1.mp3","assets/sfx/bell/ding2.mp3","assets/sfx/bell/ding3.mp3","assets/sfx/cards/fan.mp3","assets/sfx/cards/place1.mp3","assets/sfx/cards/place2.mp3","assets/sfx/cards/place3.mp3","assets/sfx/cards/place4.mp3","assets/sfx/cards/shove1.mp3","assets/sfx/cards/shove2.mp3","assets/sfx/cards/shove3.mp3","assets/sfx/cards/shove4.mp3","assets/sfx/cards/shuffle.mp3","assets/sfx/cards/slide1.mp3","assets/sfx/cards/slide2.mp3","assets/sfx/cards/slide3.mp3","assets/sfx/cards/slide4.mp3","assets/sfx/cards/slide5.mp3","assets/sfx/chips/collide1.mp3","assets/sfx/chips/collide2.mp3","assets/sfx/chips/collide3.mp3","assets/sfx/chips/collide4.mp3","assets/sfx/chips/handle1.mp3","assets/sfx/chips/handle2.mp3","assets/sfx/chips/handle3.mp3","assets/sfx/chips/handle4.mp3","assets/sfx/chips/lay1.mp3","assets/sfx/chips/lay2.mp3","assets/sfx/chips/lay3.mp3","assets/sfx/chips/stack1.mp3","assets/sfx/chips/stack2.mp3","assets/sfx/chips/stack3.mp3","assets/sfx/chips/stack4.mp3","assets/sfx/chips/stack5.mp3","assets/sfx/chips/stack6.mp3","assets/sfx/dice/die1.mp3","assets/sfx/dice/die2.mp3","assets/sfx/dice/die3.mp3","assets/sfx/dice/die4.mp3","assets/sfx/dice/shake1.mp3","assets/sfx/dice/shake2.mp3","assets/sfx/dice/shake3.mp3","assets/sfx/dice/throw1.mp3","assets/sfx/dice/throw2.mp3","assets/sfx/dice/throw3.mp3","assets/sfx/fx/explode1.mp3","assets/sfx/fx/explode2.mp3","assets/sfx/fx/explode3.mp3","assets/sfx/fx/laser1.mp3","assets/sfx/fx/laser2.mp3","assets/sfx/fx/laser3.mp3","assets/sfx/fx/lowboom1.mp3","assets/sfx/fx/lowboom2.mp3","assets/sfx/fx/power1.mp3","assets/sfx/fx/power2.mp3","assets/sfx/fx/power3.mp3","assets/sfx/fx/power4.mp3","assets/sfx/impact/generic1.mp3","assets/sfx/impact/generic2.mp3","assets/sfx/impact/generic3.mp3","assets/sfx/impact/generic4.mp3","assets/sfx/impact/generic5.mp3","assets/sfx/impact/metal1.mp3","assets/sfx/impact/metal2.mp3","assets/sfx/impact/metal3.mp3","assets/sfx/impact/punch1.mp3","assets/sfx/impact/punch2.mp3","assets/sfx/impact/punch3.mp3","assets/sfx/impact/punch4.mp3","assets/sfx/impact/punch5.mp3","assets/sfx/impact/punchheavy1.mp3","assets/sfx/impact/punchheavy2.mp3","assets/sfx/impact/punchheavy3.mp3","assets/sfx/impact/rock1.mp3","assets/sfx/impact/rock2.mp3","assets/sfx/impact/rock3.mp3","assets/sfx/impact/soft1.mp3","assets/sfx/impact/soft2.mp3","assets/sfx/impact/soft3.mp3","assets/sfx/impact/soft4.mp3","assets/sfx/impact/soft5.mp3","assets/sfx/impact/softheavy1.mp3","assets/sfx/impact/softheavy2.mp3","assets/sfx/impact/softheavy3.mp3","assets/sfx/impact/wood1.mp3","assets/sfx/impact/wood2.mp3","assets/sfx/impact/wood3.mp3","assets/sfx/impact/wood4.mp3","assets/sfx/impact/wood5.mp3","assets/sfx/impact/woodmed1.mp3","assets/sfx/impact/woodmed2.mp3","assets/sfx/impact/woodmed3.mp3","assets/sfx/impact/woodmed4.mp3","assets/sfx/impact/woodmed5.mp3","assets/sfx/keys/key1.mp3","assets/sfx/keys/key10.mp3","assets/sfx/keys/key11.mp3","assets/sfx/keys/key12.mp3","assets/sfx/keys/key2.mp3","assets/sfx/keys/key3.mp3","assets/sfx/keys/key4.mp3","assets/sfx/keys/key5.mp3","assets/sfx/keys/key6.mp3","assets/sfx/keys/key7.mp3","assets/sfx/keys/key8.mp3","assets/sfx/keys/key9.mp3","assets/sfx/paper/erase.mp3","assets/sfx/paper/flip1.mp3","assets/sfx/paper/flip2.mp3","assets/sfx/paper/flip3.mp3","assets/sfx/paper/pencil.mp3","assets/sfx/ui/click1.mp3","assets/sfx/ui/click2.mp3","assets/sfx/ui/click3.mp3","assets/sfx/ui/click4.mp3","assets/sfx/ui/click5.mp3","assets/sfx/ui/pop1.mp3","assets/sfx/ui/pop2.mp3","assets/sfx/ui/pop3.mp3","assets/sfx/ui/switch1.mp3","assets/sfx/ui/switch2.mp3","assets/sfx/ui/switch3.mp3","assets/sfx/ui/switch4.mp3","assets/sfx/ui/switch5.mp3","assets/sfx/ui/tick1.mp3","assets/sfx/ui/tick2.mp3","assets/sfx/ui/tick3.mp3","css/style.css","index.html","js/audio.js","js/av.js","js/avatar.js","js/avui.js","js/bots.js","js/cards.js","js/channel.js","js/chatoverlay.js","js/chatview.js","js/chrome.js","js/clips.js","js/comms.js","js/commsui.js","js/config.js","js/dice.js","js/drawpad.js","js/engines/chess.worker.js","js/engines/chessai.js","js/engines/hive-ai.js","js/engines/hive-rules.js","js/engines/hive.worker.js","js/fx.js","js/gameicons.js","js/games/alienamong.js","js/games/beans-art.js","js/games/beans-bot.js","js/games/beans-css.js","js/games/beans-engine.js","js/games/beans.js","js/games/blocks.js","js/games/bomber.js","js/games/captions.js","js/games/cascadia-ai.js","js/games/cascadia-rules.js","js/games/cascadia.js","js/games/champdraw.js","js/games/chess.js","js/games/codecrack.js","js/games/colorrush.js","js/games/connect4.js","js/games/copilots.js","js/games/coup-art.js","js/games/coup-bots.js","js/games/coup-engine.js","js/games/coup.js","js/games/dialitin.js","js/games/fibquiz.js","js/games/harmonies-art.js","js/games/harmonies-bot.js","js/games/harmonies-cards.js","js/games/harmonies-engine.js","js/games/harmonies-rules.js","js/games/harmonies.js","js/games/hive-art.js","js/games/hive-book.js","js/games/hive.js","js/games/hive3d.js","js/games/imposter.js","js/games/index.js","js/games/islandsettlers.js","js/games/jigsaw.js","js/games/letterdash.js","js/games/liars.js","js/games/movie.js","js/games/onenightwolf.js","js/games/petals.js","js/games/pinplace.js","js/games/poker.js","js/games/pong.js","js/games/pool-physics.js","js/games/pool-render.js","js/games/pool.js","js/games/puckfootball.js","js/games/quipclash.js","js/games/redline.js","js/games/retro.js","js/games/rowrumble.js","js/games/royalletters.js","js/games/shadowquest.js","js/games/sketch.js","js/games/snake.js","js/games/spyplace.js","js/games/sumo.js","js/games/sushitrain.js","js/games/tanks.js","js/games/telephone.js","js/games/temple.js","js/games/tilemosaic.js","js/games/trainheist.js","js/games/trickcrew.js","js/games/triviatrap.js","js/games/tshirt.js","js/games/tunneltraitors.js","js/games/typeracer.js","js/games/uniqueclues.js","js/games/wingspan-data.js","js/games/wingspan-engine.js","js/games/wingspan.js","js/games/wonderrivals.js","js/games/wordbomb.js","js/games/wordspies.js","js/icons_data.js","js/kit.js","js/local.js","js/lounge.js","js/main.js","js/matches.js","js/media.js","js/motion.js","js/mqtt.js","js/net.js","js/plaza.js","js/pwa.js","js/qr.js","js/recorder.js","js/recui.js","js/roompanel.js","js/session.js","js/table3d.js","js/theme.js","js/ui.js","js/util.js","js/vendor/BufferGeometryUtils.js","js/vendor/GLTFLoader.js","js/vendor/RoomEnvironment.js","js/vendor/THREE-LICENSE.txt","js/vendor/three.module.min.js","js/videos.js","js/webm.js","js/words.js","manifest.webmanifest","vendor/chess.js","vendor/jsnes.min.js","vendor/peerjs.min.js"];

const APP_CACHE = CACHE_PREFIX + BUILD;
const DATA_CACHE = 'gn-data-v1'; // big, rarely-changing files (word list, world map, ROMs): refreshed in the background
const SCOPE = self.registration.scope;
const NIGHTLY_PATH = new URL('nightly/', SCOPE).pathname; // the Nightly channel lives in a /nightly/ folder with its own worker
const url = (p) => new URL(p, SCOPE).href;

self.addEventListener('install', (e) => {
  // If any file fails to download the install fails and the previous version keeps running — never a half update.
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(PRECACHE.map((p) => new Request(url(p), { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(CACHE_PREFIX) && k !== APP_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'GET_BUILD') e.source?.postMessage({ type: 'BUILD', build: BUILD });
});

const isData = (u) => /\/(vendor\/(words\.txt|countries-110m\.json)|roms\/|assets\/(hive|hive3d|cascadia)\/)/.test(u.pathname); // big art: fetched on first use, then kept

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return; // fonts, PeerJS cloud etc. go straight to the network
  if (u.pathname.endsWith('/build.json') || u.pathname.endsWith('/sw.js')) return; // always fresh
  if (u.pathname.includes('/media/')) return; // big how-to-play videos: let the browser stream them itself (range requests)
  if (u.pathname.startsWith(NIGHTLY_PATH)) return; // Nightly's pages and files are Nightly's worker's business, never ours

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
