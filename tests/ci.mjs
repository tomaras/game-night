// End-to-end checks run by CI before anything is deployed (and by you locally: `npm test`).
// Uses a real Chrome, a local PeerServer + MQTT broker (no internet needed) and local copies of the built site laid out
// exactly like the live one: Stable at the root, Nightly in /nightly/ (see scripts/assemble.mjs).
//
//   Locally with your installed Chrome:  PW_CHANNEL=chrome npm test
//   In CI:                                npx playwright install --with-deps chromium && npm test
import { chromium } from 'playwright';
import { PeerServer } from 'peer';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { startBroker } from './broker.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-ci-'));
const SHA = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const results = [];
const test = async (name, fn) => {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return; // e.g. ONLY="rooms list" npm test
  const t0 = Date.now();
  try { await fn(); results.push([name, true]); console.log(`  ✓ ${name} (${Date.now() - t0} ms)`); }
  catch (e) { results.push([name, false, e]); console.log(`  ✗ ${name}\n      ${String(e.stack || e).split('\n').slice(0, 4).join('\n      ')}`); }
};
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000, what = 'condition') {
  const t0 = Date.now();
  for (;;) { try { const v = await fn(); if (v) return v; } catch { /* page may be navigating */ } if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(250); }
}

// ---- Stable at the site root, plus three different "deploys" of Nightly (A, then B, then C) to exercise updates
const builds = {};
for (const [k, time] of [['A', '20261009.0001'], ['B', '20261009.0002'], ['C', '20261009.0003']]) {
  const dir = path.join(TMP, 'dist-' + k);
  execFileSync('node', ['scripts/build.mjs', '--env', 'nightly', '--out', dir], { cwd: ROOT, env: { ...process.env, BUILD_SHA: SHA, BUILD_TIME: time, CI: '1' }, stdio: 'pipe' });
  builds[k] = { dir, id: JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8')).build };
}

const stableDir = path.join(TMP, 'dist-stable');
execFileSync('node', ['scripts/build.mjs', '--env', 'prod', '--out', stableDir], { cwd: ROOT, env: { ...process.env, BUILD_SHA: SHA, BUILD_TIME: '20261009.0000', CI: '1' }, stdio: 'pipe' });
const stableId = JSON.parse(fs.readFileSync(path.join(stableDir, 'build.json'), 'utf8')).build;
const SITE = path.join(TMP, 'site');
execFileSync('node', ['scripts/assemble.mjs', 'root', stableDir, SITE], { cwd: ROOT, stdio: 'pipe' });
/** "Deploy" a Nightly build: replaces only /nightly/, like the real pipeline. */
const deployNightly = (dir) => execFileSync('node', ['scripts/assemble.mjs', 'nightly', dir, SITE], { cwd: ROOT, stdio: 'pipe' });
deployNightly(builds.A.dir);

const peerPort = 19000 + Math.floor(Math.random() * 500);
const peerServer = PeerServer({ port: peerPort, path: '/', allow_discovery: false });
const site = await serve({ base: '/', root: SITE });
const broker = await startBroker(); // the Plaza (room list, presence, global chat) talks to this instead of the public brokers
const QUERY = `signal=127.0.0.1:${peerPort}&mqtt=${broker.url}&recseg=2000`;
const START = `${site.url}nightly/index.html?${QUERY}`; // the pages under test are Nightly's
const STABLE = `${site.url}index.html?${QUERY}`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errorsOf = (page) => { page.errs = []; page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|net::ERR_FAILED|\/media\/videos\//.test(m.text() + (m.location()?.url || ''))) page.errs.push('console: ' + m.text()); }); return page; };
const newPage = async (name = 'Player', opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts });
  await ctx.addInitScript((n) => { try { localStorage.setItem('gn.profile', JSON.stringify({ name: n, avatar: '🦊' })); } catch { /* */ } }, name);
  const page = errorsOf(await ctx.newPage());
  page.ctx = ctx;
  return page;
};
const createRoom = async (p, gameId = 'connect4') => {
  await p.goto(START.replace('index.html', 'index.html') + `#/game/${gameId}`);
  await p.click('.sheet button:has-text("Create a room")');
  await p.click('.sheet button.primary:has-text("Create room")');
  await p.waitForSelector('.lobby', { timeout: 20000 });
  return (await p.textContent('.bignum')).trim();
};

console.log(`\nGame Night CI — Nightly ${builds.A.id}, Stable ${stableId}\n`);

await test('home screen loads without errors; early access is marked by a moon', async () => {
  const p = await newPage();
  await p.goto(START);
  await p.waitForSelector('.gcard');
  ok(!/nightly/i.test(await p.title()), 'the early-access version must not say "nightly" anywhere');
  ok(await p.locator('.diebtn .moon').count() === 1, 'a tiny moon marks early access on the die');
  ok(await p.locator('.envpill').count() === 0, 'no environment pill outside local builds');
  const bj = await (await p.request.get(site.url + 'nightly/build.json')).json();
  ok(bj.build === builds.A.id && bj.env === 'nightly', 'build.json mismatch');
  ok(await p.locator('.gcard').count() >= 52, 'expected at least 52 games, got ' + await p.locator('.gcard').count());
  ok(p.errs.length === 0, 'page errors: ' + p.errs.join(' | '));
  await p.ctx.close();
});

await test('every game module loads and has rules text', async () => {
  const p = await newPage();
  await p.goto(START);
  await p.waitForSelector('.gcard');
  const r = await p.evaluate(async () => {
    const m = await import('./js/games/index.js');
    const bad = [];
    for (const g of m.GAMES) {
      try { const mod = await g.load(); if (typeof mod.start !== 'function') bad.push(g.id + ': no start()'); } catch (e) { bad.push(g.id + ': ' + e.message); }
      if (!(g.help?.steps || g.howto)?.length) bad.push(g.id + ': no rules');
      if (!(g.min >= 1 && g.max >= g.min)) bad.push(g.id + ': bad player range');
      if (!m.CATEGORIES.includes(g.cat)) bad.push(g.id + ': unknown category ' + g.cat);
    }
    return { n: m.GAMES.length, bad };
  });
  ok(r.n >= 52, 'games: ' + r.n);
  ok(r.bad.length === 0, r.bad.join('; '));
  await p.ctx.close();
});

await test('service worker installs, caches the app, and the app starts offline', async () => {
  const p = await newPage();
  await p.goto(START);
  await p.waitForSelector('.gcard');
  await until(() => p.evaluate(() => !!navigator.serviceWorker.controller), 15000, 'service worker to take control');
  const info = await p.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks.find((k) => k.startsWith('gn-nightly-'))); return { ks, n: (await c.keys()).length }; });
  ok(info.ks.includes('gn-nightly-' + builds.A.id), 'cache for this build missing: ' + info.ks);
  ok(info.n >= 80, 'precache too small: ' + info.n);
  await p.ctx.setOffline(true);
  await p.reload();
  await p.waitForSelector('.gcard', { timeout: 10000 });
  await p.ctx.setOffline(false);
  await p.ctx.close();
});

let hostPage, roomNumber;
await test('rooms: host + guest play together on the Nightly room namespace', async () => {
  hostPage = await newPage('Alice');
  roomNumber = await createRoom(hostPage);
  ok(roomNumber === '1', 'first room should be number 1, got ' + roomNumber);
  const peerId = await hostPage.evaluate(() => window.__gn.room.peer.id);
  ok(peerId === 'gnight-nightly-v1-1', 'Nightly rooms must use the Nightly prefix, got ' + peerId);
  const guest = await newPage('Bob');
  await guest.goto(START + '#/room/' + roomNumber);
  await guest.click('.sheet button.primary:has-text("Join room")');
  await guest.waitForSelector('.lobby', { timeout: 20000 });
  await hostPage.click('button:has-text("Start game")');
  await Promise.all([hostPage, guest].map((p) => p.waitForSelector('.c4-board', { timeout: 20000 })));
  ok(hostPage.errs.length + guest.errs.length === 0, 'errors: ' + [...hostPage.errs, ...guest.errs].join(' | '));
  await guest.ctx.close();
});

await test('version handshake: different protocol is refused with a clear reason; old clients without a version still join', async () => {
  const p = await newPage('Probe');
  await p.goto(START);
  const run = (hello) => p.evaluate(({ port, hello }) => new Promise((resolve) => {
    const peer = new Peer({ host: '127.0.0.1', port, path: '/', secure: false });
    const timer = setTimeout(() => resolve({ timeout: true }), 8000);
    peer.on('open', () => {
      const c = peer.connect('gnight-nightly-v1-1', { serialization: 'json' });
      c.on('open', () => c.send(hello));
      c.on('data', (m) => { clearTimeout(timer); resolve(m); peer.destroy(); });
    });
  }), { port: peerPort, hello });
  const newer = await run({ t: 'hello', cid: 'probe-new', name: 'Future', v: 99 });
  ok(newer.t === 'denied' && newer.reason === 'version' && newer.v === 1, 'newer client should be denied with reason=version: ' + JSON.stringify(newer));
  const old = await run({ t: 'hello', cid: 'probe-old', name: 'Legacy' }); // clients from before versioning send no "v"
  ok(old.t === 'welcome' && old.v === 1, 'legacy client should be welcomed: ' + JSON.stringify(old).slice(0, 120));
  await p.ctx.close();
});
if (hostPage) await hostPage.ctx.close();

await test('updates install silently on the home screen but NEVER interrupt a room', async () => {
  const p = await newPage('Carol');
  await p.goto(START);
  await p.waitForSelector('.gcard');
  await until(() => p.evaluate(() => !!navigator.serviceWorker.controller), 15000, 'service worker');
  ok(await p.evaluate(() => window.GAME_NIGHT_CONFIG.build) === builds.A.id, 'should start on build A');
  await p.evaluate(() => { window.__marker = 'same-page'; });

  // 1) deploy B while idle on the home screen → page updates itself
  deployNightly(builds.B.dir);
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await until(() => p.evaluate((b) => window.GAME_NIGHT_CONFIG.build === b && !window.__marker, builds.B.id), 30000, 'idle page to switch to build B');

  // 2) deploy C while the user is inside a room → the page must stay exactly as it is
  await createRoom(p);
  await p.evaluate(() => { window.__marker = 'in-room'; });
  deployNightly(builds.C.dir);
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await until(() => p.evaluate(() => window.__pwa.ready), 20000, 'update to download');
  await sleep(9000); // the apply loop runs every 4 s — give it two chances to (wrongly) reload
  ok(await p.evaluate(() => window.__marker) === 'in-room', 'the page was reloaded while inside a room!');
  ok(await p.evaluate(() => window.GAME_NIGHT_CONFIG.build) === builds.B.id, 'should still be running build B in the room');

  // 3) leave the room → the waiting update is applied
  await p.click('button[aria-label="Leave room"]');
  await p.locator('.dialog button.bad').click({ timeout: 1500 }).catch(() => {});
  await until(() => p.evaluate((b) => window.GAME_NIGHT_CONFIG.build === b, builds.C.id), 30000, 'page to switch to build C after leaving the room');
  ok(p.errs.length === 0, 'errors: ' + p.errs.join(' | '));
  await p.ctx.close();
});


// ------------------------------------------------------------------ play modes
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
await test('play the computer: solo Connect Four answers your move, offline', async () => {
  const p = await newPage('Solo');
  await p.goto(START + '#/game/connect4');
  await p.click('.sheet button:has-text("Vs computer")');
  await p.click('.sheet button:has-text("Start")');
  await p.waitForSelector('.c4-board');
  await until(() => p.evaluate(() => /Your turn/.test(document.querySelector('.c4-status')?.innerText || '')), 10000, 'your turn (the computer may move first)');
  const before = await p.locator('.c4-cell.p1, .c4-cell.p2').count();
  await p.locator('.c4-col').nth(3).click();
  await until(async () => (await p.locator('.c4-cell.p1, .c4-cell.p2').count()) === before + 2, 12000, 'the computer to reply');
  ok(p.errs.length === 0, 'errors: ' + p.errs.join(' | '));
  await p.ctx.close();
});

await test('turn by turn: the move travels in a link; the friend sees it and replies', async () => {
  const [a, b] = [await newPage('Alice'), await newPage('Bob')];
  const linkFrom = async (p) => { await p.waitForSelector('.matchbar a[href^="sms:"]', { timeout: 15000 }); const href = await p.getAttribute('.matchbar a[href^="sms:"]', 'href'); return decodeURIComponent(href.split('body=')[1]).match(/https?:\S+/)[0]; };
  await a.goto(START + '#/game/connect4');
  await a.click('.sheet button:has-text("Turn by turn")');
  await a.click('.sheet button:has-text("Start")');
  await a.waitForSelector('.c4-board');
  await sleep(600);
  await a.locator('.c4-col').nth(3).click();
  const link1 = await linkFrom(a);
  ok(await a.locator('.c4-cell.p1, .c4-cell.p2').count() === 1, 'Alice should see her own piece');
  await b.goto(START);
  await b.evaluate((h) => { location.hash = h; }, link1.slice(link1.indexOf('#')));
  await b.waitForSelector('.c4-board', { timeout: 15000 });
  await until(async () => (await b.locator('.c4-cell.p1, .c4-cell.p2').count()) === 1, 8000, 'Bob to see the first move');
  await sleep(600);
  await b.locator('.c4-col').nth(4).click();
  const link2 = await linkFrom(b);
  await a.evaluate((h) => { location.hash = h; }, link2.slice(link2.indexOf('#')));
  await a.locator('.dialog button.bad').click({ timeout: 2500 }).catch(() => {});
  await until(async () => (await a.locator('.c4-cell.p1, .c4-cell.p2').count()) === 2, 10000, 'Alice to see the reply');
  ok(a.errs.length + b.errs.length === 0, 'errors: ' + [...a.errs, ...b.errs].join(' | '));
  await a.ctx.close(); await b.ctx.close();
});

await test('theme switcher (day / system / night) and the player-count filter', async () => {
  const p = await newPage('Theme');
  await p.goto(START);
  await p.waitForSelector('.gcard');
  await p.evaluate(() => window.__gn.chrome.openDrawer());
  await p.click('.dtheme button:has-text("Night")');
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'night should set data-theme=dark');
  await p.click('.dtheme button:has-text("Day")');
  ok(await p.evaluate(() => document.documentElement.dataset.theme) === 'light', 'day should set data-theme=light');
  await p.keyboard.press('Escape');
  const all = await p.locator('.gcard').count();
  await p.click('.pfilter');
  await p.click('.numgrid .numchip:text-is("1")');
  const solo = await p.locator('.gcard').count();
  ok(solo > 0 && solo < all, `1-player filter should narrow the list (${solo} of ${all})`);
  await p.keyboard.press('Escape');
  await p.click('.pfilter').catch(() => {});
  ok(p.errs.length === 0, 'errors: ' + p.errs.join(' | '));
  await p.ctx.close();
});

// ------------------------------------------------------------------ the Plaza: room list, join requests, audience
await test('rooms list: ask to join (host approves), watch as audience, audience cannot play', async () => {
  const H = await newPage('Hosty', phone), G = await newPage('Guesty', phone), W = await newPage('Watchy', phone);
  await createRoom(H);
  const diag = (p) => p.evaluate(async () => { const { plaza } = await import('./js/plaza.js'); return { connected: plaza.connected, rooms: [...plaza.rooms.keys()], people: plaza.people.size, hosting: !!plaza.hosting, url: plaza.mq?.url, pending: plaza.mq?._pending.length, fails: plaza.mq?._fails, me: plaza.me, room: !!window.__gn.room, st: window.__gn.room?.state?.pub, cid: plaza.cid }; });
  const card = async (p) => { await p.goto(START + '#/rooms'); try { await p.locator('.rcard').first().click({ timeout: 25000 }); } catch (e) { console.log('      diag guest:', JSON.stringify(await diag(p)), 'host:', JSON.stringify(await diag(H))); throw e; } };
  await card(G);
  await G.click('.sheet button:has-text("Ask to join")');
  await G.click('.sheet button:has-text("Join room")');
  await H.waitForSelector('.notice', { timeout: 15000 });
  ok(/Guesty wants to join/.test(await H.innerText('.notice')), 'host should be asked');
  await H.click('.notice button:has-text("Let in")');
  await G.waitForSelector('.lobby', { timeout: 15000 });
  await card(W);
  await W.click('.sheet button:has-text("Watch")');
  await W.click('.sheet button:has-text("Watch")');
  await W.waitForSelector('.lobby', { timeout: 15000 });
  await until(() => H.locator('.watchrow').count(), 8000, 'the host to see a watcher');
  await H.click('button:has-text("Start game")');
  await Promise.all([H, G, W].map((p) => p.waitForSelector('.c4-board', { timeout: 20000 })));
  const mine = (p) => p.evaluate(() => /Your turn/.test(document.querySelector('.c4-status')?.innerText || ''));
  const first = (await mine(H)) ? H : G, second = first === H ? G : H;
  await first.locator('.c4-col').nth(3).click();
  await second.waitForFunction(() => document.querySelectorAll('.c4-cell.p1, .c4-cell.p2').length === 1);
  await W.locator('.c4-col').nth(0).click({ force: true }).catch(() => {});
  await sleep(500);
  const counts = await Promise.all([H, G, W].map((p) => p.locator('.c4-cell.p1, .c4-cell.p2').count()));
  ok(counts.every((n) => n === 1), 'everybody should see exactly 1 piece (the audience can\'t play): ' + counts);
  ok(await W.locator('.specbadge').count() === 1, 'audience badge missing');
  ok([H, G, W].every((p) => p.errs.length === 0), 'errors: ' + [H, G, W].flatMap((p) => p.errs).join(' | '));
  await Promise.all([H, G, W].map((p) => p.ctx.close()));
});

await test('global chat reaches other people; Lounge voice call connects; the mic moves between Room and Global', async () => {
  const A = await newPage('Anna', phone), B = await newPage('Ben', phone);
  await A.goto(START + '#/lounge'); await B.goto(START + '#/lounge');
  await A.waitForSelector('.lounge'); await B.waitForSelector('.lounge');
  await sleep(1500);
  await A.fill('.lounge .chat input', 'hello everyone'); await A.press('.lounge .chat input', 'Enter');
  await until(async () => (await B.locator('.lounge .m .bub').allInnerTexts()).some((t) => /hello everyone/.test(t)), 10000, 'B to see the global message');
  for (const p of [A, B]) { await p.click('.lounge .seg button:has-text("Voice")'); await p.locator('.chrow', { hasText: 'Lounge 1' }).locator('button:has-text("Join")').click(); }
  await until(() => A.evaluate(() => window.__gn.comms.loungeAV?.remote.size === 1), 20000, 'the lounge call to connect');
  // mic: scope Room → Global, then on
  await A.evaluate(() => window.__gn.comms.setScope('mic', 'global'));
  await A.click('.top .cbtn >> nth=0'); // a plain tap on the button turns the mic on — it never just flips the scope
  await until(() => A.evaluate(() => window.__gn.comms.loungeAV?.local.mic === true), 8000, 'mic live in the Lounge');
  ok(await A.evaluate(() => window.__gn.comms.scope.mic) === 'global', 'tapping the mic must not change its scope');
  await until(() => B.evaluate(() => window.__gn.comms.lounge.players.some((p) => p.name === 'Anna' && p.av.mic === 1)), 8000, 'B to see A\'s mic');
  // A hosts a room, flips the live mic to Room and back
  await A.evaluate(() => { location.hash = '#/game/connect4'; });
  await A.click('.sheet button:has-text("Create a room")'); await A.click('.sheet button.primary:has-text("Create room")');
  await A.waitForSelector('.lobby', { timeout: 20000 });
  await A.evaluate(() => window.__gn.comms.setScope('mic', 'room'));
  await until(() => A.evaluate(() => window.__gn.comms.roomAV?.local.mic === true && window.__gn.comms.loungeAV?.local.mic === false), 8000, 'mic to move to the room');
  await A.evaluate(() => window.__gn.comms.setScope('mic', 'global'));
  await until(() => A.evaluate(() => window.__gn.comms.roomAV?.local.mic === false && window.__gn.comms.loungeAV?.local.mic === true), 8000, 'mic to move back to the Lounge');
  ok(A.errs.length + B.errs.length === 0, 'errors: ' + [...A.errs, ...B.errs].join(' | '));
  await A.ctx.close(); await B.ctx.close();
});

await test('recording: the last minutes are kept as clips and overlapping clips with the same settings are stitched', async () => {
  const p = await newPage('Rec');
  await p.goto(START);
  await p.waitForSelector('.gcard');
  await p.evaluate(() => window.__gn.rec.set({ minutes: 1, video: true, screen: true, mic: true, taps: true }));
  await p.evaluate(() => window.__gn.chrome.openDrawer());
  await p.click('.ditem:has-text("Recordings")');
  await p.click('.reccard button:has-text("Start recording")');
  await until(() => p.evaluate(() => window.__gn.rec.active && window.__gn.rec.segs.length >= 2), 20000, 'two segments to be buffered');
  await p.click('.reccard button:has-text("Save last")');
  const info = () => p.evaluate(async () => {
    const { listClips } = await import('./js/clips.js'); const { clipBlob } = await import('./js/recui.js');
    const out = [];
    for (const c of await listClips()) { const blob = await clipBlob(c); const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(blob); const dur = await new Promise((r) => { v.onloadedmetadata = () => r(v.duration); v.onerror = () => r(-1); setTimeout(() => r(-2), 6000); }); out.push({ id: c.id, segs: c.segs.length, span: (c.end - c.start) / 1000, dur, key: c.key }); }
    return out;
  });
  await until(async () => (await info()).length === 1, 10000, 'the first clip');
  const one = (await info())[0];
  ok(one.dur > 1, 'the clip should be playable, duration ' + one.dur);
  await sleep(6000);
  await p.click('.reccard button:has-text("Save last")');
  await until(async () => { const i = await info(); return i.length === 1 && i[0].segs > one.segs; }, 12000, 'the second save to be stitched onto the first');
  const two = (await info())[0];
  ok(two.id === one.id && two.span > one.span && two.dur > one.dur, 'stitched clip should be longer: ' + JSON.stringify([one, two]));
  await p.evaluate(() => window.__gn.rec.stop());
  ok(p.errs.length === 0, 'errors: ' + p.errs.join(' | '));
  await p.ctx.close();
});

// ------------------------------------------------------------------ Stable / Nightly on one site
await test('Stable and Nightly share one site: the menu switches, the choice is remembered, rooms and caches stay separate', async () => {
  const p = await newPage('Chan');
  await p.goto(STABLE);
  await p.waitForSelector('.gcard');
  const cfg = () => p.evaluate(() => ({ env: window.GAME_NIGHT_CONFIG.env, prefix: window.GAME_NIGHT_CONFIG.prefix, path: location.pathname }));
  let c = await cfg();
  ok(c.env === 'prod' && c.prefix === 'gnight-v1-' && c.path === '/index.html', 'root should be Stable: ' + JSON.stringify(c));
  ok(await p.locator('.diebtn .moon').count() === 0, 'Stable has no moon');
  await until(() => p.evaluate(() => !!navigator.serviceWorker.controller), 15000, 'Stable service worker');
  // switch to Nightly from the menu
  await p.click('.diebtn');
  await p.click('.drow:has-text("Early access") label.switch');
  await p.waitForURL(/\/nightly\//, { timeout: 15000 });
  await p.waitForSelector('.gcard');
  c = await cfg();
  ok(c.env === 'nightly' && c.prefix === 'gnight-nightly-v1-', 'should be on Nightly now: ' + JSON.stringify(c));
  ok(await p.locator('.diebtn .moon').count() === 1, 'moon missing on early access');
  // each channel has its OWN service worker and cache, and the Nightly page is controlled by Nightly's
  await until(() => p.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/nightly/sw.js')), 15000, "Nightly's own service worker to control the page");
  const caches = await p.evaluate(async () => (await window.caches.keys()).sort());
  const nightlyId = (await (await p.request.get(site.url + 'nightly/build.json')).json()).build;
  ok(caches.includes('gn-app-' + stableId) && caches.includes('gn-nightly-' + nightlyId), 'both channels need their own cache: ' + caches);
  // the choice is remembered: the site root now opens Nightly… but never hijacks an invite link, and ?channel=stable always gets you out
  await p.goto(STABLE);
  await p.waitForURL(/\/nightly\//, { timeout: 15000 });
  await p.goto(STABLE + '#/room/3');
  await sleep(1500);
  ok(await p.evaluate(() => location.pathname) === '/index.html', 'an invite link on Stable must stay on Stable');
  await p.goto(STABLE + '&channel=stable');
  await sleep(800);
  await p.waitForSelector('.gcard');
  ok(await p.evaluate(() => window.GAME_NIGHT_CONFIG.env) === 'prod', '?channel=stable should land on Stable');
  await p.goto(STABLE);
  await sleep(1200);
  ok(await p.evaluate(() => window.GAME_NIGHT_CONFIG.env) === 'prod', 'after choosing Stable the root should stay on Stable');
  ok(p.errs.length === 0, 'errors: ' + p.errs.join(' | '));
  await p.ctx.close();
});

await test('Recent: games you play appear under a Recent filter, newest first', async () => {
  const p = await newPage('Recent');
  await p.goto(START);
  await p.waitForSelector('.gcard');
  ok(await p.locator('.fchip:has-text("Recent")').count() === 1 && await p.locator('.fchip:has-text("Favourites")').count() === 1, 'Recent and Favourites chips are always there');
  await p.click('.fchip:has-text("Recent")');
  ok(await p.locator('.gcard').count() === 0 && /Games you play show up here/.test(await p.innerText('.home')), 'Recent starts empty with a hint');
  await p.click('.fchip:has-text("All")');
  for (const id of ['connect4', 'letterdash']) {
    await p.evaluate((id) => { location.hash = '#/game/' + id; }, id);
    await p.click('.sheet .galt button:first-child');
    await p.click('.sheet button:has-text("Start")');
    await p.waitForSelector('.game-root');
    await p.click('button[aria-label="Leave room"]');
    await p.locator('.dialog button.bad').click({ timeout: 1500 }).catch(() => {});
    await p.waitForSelector('.gcard');
  }
  await p.click('.fchip:has-text("Recent")');
  const names = await p.locator('.gcard h3').allInnerTexts();
  ok(names.length === 2 && /Letter Dash/.test(names[0]) && /Connect Four/.test(names[1]), 'Recent should list the two games, newest first: ' + names);
  await p.click('.fchip:has-text("All")');
  await p.locator('.gcard', { hasText: 'Word Bomb' }).locator('.fav').click();
  await p.click('.fchip:has-text("Favourites")');
  ok((await p.locator('.gcard h3').allInnerTexts()).join() === 'Word Bomb', 'Favourites should show the starred game');
  await p.click('.fchip:has-text("All")');
  await p.locator('.gcard', { hasText: 'Connect Four' }).locator('.cchip', { hasText: 'Board' }).click(); // facts on a card are clickable filters
  ok((await p.locator('.gcard').count()) > 0 && await p.locator('.fchip.on:has-text("Board")').count() === 1, 'tapping a card\'s category selects that category');
  ok(p.errs.length === 0, 'errors: ' + p.errs.join(' | '));
  await p.ctx.close();
});

// ------------------------------------------------------------------ game overhauls
await test('chess: over the board on one phone — drag and tap moves, clocks, undo, review, hint', async () => {
  const p = await newPage('Chess', phone);
  await p.goto(START + '#/game/chess');
  await p.click('.sheet button:has-text("Same device")');
  await p.locator('.sheet select').nth(1).selectOption('5+3');
  await p.click('.sheet button:has-text("Start")');
  await p.waitForSelector('.ch-board');
  const sq = (s) => p.locator(`[data-sq="${s}"]`);
  const tap = async (a, c) => { await sq(a).click(); await sq(c).click(); await sleep(250); };
  const drag = async (a, c) => { const A = await sq(a).boundingBox(), C = await sq(c).boundingBox(); await p.mouse.move(A.x + A.width / 2, A.y + A.height / 2); await p.mouse.down(); await p.mouse.move(C.x + C.width / 2, C.y + C.height / 2, { steps: 5 }); await p.mouse.up(); await sleep(300); };
  const moves = async (n) => until(async () => (await p.locator('.ch-strip button').count()) === n, 6000, n + ' moves on the board');
  await tap('e2', 'e4'); await moves(1);
  await drag('e7', 'e5'); await moves(2);
  await tap('g1', 'f3'); await moves(3);
  ok((await p.locator('.ch-strip button').allInnerTexts()).join(' ') === 'e4 e5 Nf3', 'moves should be listed');
  ok((await p.locator('.ch-clock').allInnerTexts()).every((t) => /^[45]:/.test(t)), 'clocks should show a 5-minute control');
  await p.click('.ch-ctl button:has-text("Undo")');
  await until(async () => (await p.locator('.ch-strip button').allInnerTexts()).join(' ') === 'e4 e5', 5000, 'the take-back');
  await p.locator('.ch-strip button').first().click();
  ok(/Reviewing move 1/.test(await p.innerText('.ch-status')), 'tapping a move reviews it');
  await p.locator('.ch-nav').count();
  await p.keyboard.press('End');
  await p.click('.ch-ctl button:has-text("Hint")');
  await until(() => p.locator('.ch-arrows line').count(), 8000, 'a hint arrow');
  ok(p.errs.length === 0, 'errors: ' + p.errs.join(' | '));
  await p.ctx.close();
});

await test('chess: against the computer with premoves and the evaluation bar; pool: new table, spin and shot', async () => {
  const p = await newPage('Cpu', phone);
  await p.goto(START + '#/game/chess');
  await p.click('.sheet button:has-text("Vs computer")');
  await p.click('.sheet button:has-text("Start")');
  await p.waitForSelector('.ch-board');
  await p.click('.ch-ctl button:has-text("More")');
  await p.locator('.ch-set .sw-row:has-text("Evaluation") label.switch').click();
  await until(() => p.evaluate(() => document.querySelector('.ch-eval')?.style.display !== 'none' && !!document.querySelector('.ch-eval')?.title), 8000, 'the evaluation bar');
  await p.keyboard.press('Escape');
  await p.click('button[aria-label="Leave room"]'); await p.locator('.dialog button.bad').click({ timeout: 2000 }).catch(() => {});
  await p.waitForSelector('.gcard');
  await p.goto(START + '#/game/pool');
  await p.click('.sheet button:has-text("Vs computer")');
  await p.click('.sheet button:has-text("Start")');
  await p.waitForSelector('.pl canvas');
  await until(() => p.locator('.pl-bar').isVisible(), 8000, 'the control bar on my turn');
  const bb = await p.locator('.pl-bar').boundingBox();
  ok(bb.y + bb.height <= 844 + 1, 'the pool control bar must fit on the phone screen: ' + JSON.stringify(bb));
  await p.locator('.pl-spin').click({ position: { x: 29, y: 14 } }); // a little follow
  await p.click('.pl-shoot');
  await until(async () => /…|lining up|Foul|shoot/.test(await p.innerText('.pl-msg')), 5000, 'the shot to play');
  ok(p.errs.length === 0, 'errors: ' + p.errs.join(' | '));
  await p.ctx.close();
});

await browser.close();
await site.close();
await broker.close();
peerServer.close?.();
fs.rmSync(TMP, { recursive: true, force: true });
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
