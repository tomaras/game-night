// End-to-end checks run by CI before anything is deployed (and by you locally: `npm test`).
// Uses a real Chrome, a local PeerServer (no internet needed) and a local copy of the built dev site served
// under /game-night-dev/ exactly like GitHub Pages does.
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

// ---- three different "deploys" of the dev site (A, then B, then C) to exercise updates
const builds = {};
for (const [k, time] of [['A', '20261009.0001'], ['B', '20261009.0002'], ['C', '20261009.0003']]) {
  const dir = path.join(TMP, 'dist-' + k);
  execFileSync('node', ['scripts/build.mjs', '--env', 'dev', '--out', dir], { cwd: ROOT, env: { ...process.env, BUILD_SHA: SHA, BUILD_TIME: time, CI: '1' }, stdio: 'pipe' });
  builds[k] = { dir, id: JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8')).build };
}

const peerPort = 19000 + Math.floor(Math.random() * 500);
const peerServer = PeerServer({ port: peerPort, path: '/', allow_discovery: false });
const site = await serve({ base: '/game-night-dev/', root: builds.A.dir });
const broker = await startBroker(); // the Plaza (room list, presence, global chat) talks to this instead of the public brokers
const START = `${site.url}index.html?signal=127.0.0.1:${peerPort}&mqtt=${broker.url}&recseg=2000`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errorsOf = (page) => { page.errs = []; page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|net::ERR_FAILED/.test(m.text() + (m.location()?.url || ''))) page.errs.push('console: ' + m.text()); }); return page; };
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

console.log(`\nGame Night CI — dev build ${builds.A.id}\n`);

await test('home screen loads without errors; dev build is clearly marked', async () => {
  const p = await newPage();
  await p.goto(START);
  await p.waitForSelector('.gcard');
  ok((await p.title()).startsWith('[DEV]'), 'title should start with [DEV], got ' + (await p.title()));
  ok(await p.locator('.envpill').count() === 1, 'dev pill missing');
  const bj = await (await p.request.get(site.url + 'build.json')).json();
  ok(bj.build === builds.A.id && bj.env === 'dev', 'build.json mismatch');
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
  const info = await p.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks.find((k) => k.startsWith('gn-app-'))); return { ks, n: (await c.keys()).length }; });
  ok(info.ks.includes('gn-app-' + builds.A.id), 'cache for this build missing: ' + info.ks);
  ok(info.n >= 80, 'precache too small: ' + info.n);
  await p.ctx.setOffline(true);
  await p.reload();
  await p.waitForSelector('.gcard', { timeout: 10000 });
  await p.ctx.setOffline(false);
  await p.ctx.close();
});

let hostPage, roomNumber;
await test('rooms: host + guest play together on the dev room namespace', async () => {
  hostPage = await newPage('Alice');
  roomNumber = await createRoom(hostPage);
  ok(roomNumber === '1', 'first room should be number 1, got ' + roomNumber);
  const peerId = await hostPage.evaluate(() => window.__gn.room.peer.id);
  ok(peerId === 'gnight-dev-v1-1', 'dev rooms must use the dev prefix, got ' + peerId);
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
      const c = peer.connect('gnight-dev-v1-1', { serialization: 'json' });
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
  site.setRoot(builds.B.dir);
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await until(() => p.evaluate((b) => window.GAME_NIGHT_CONFIG.build === b && !window.__marker, builds.B.id), 30000, 'idle page to switch to build B');

  // 2) deploy C while the user is inside a room → the page must stay exactly as it is
  await createRoom(p);
  await p.evaluate(() => { window.__marker = 'in-room'; });
  site.setRoot(builds.C.dir);
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
  await p.click('.sheet button:has-text("Play vs computer")');
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
  await A.click('.top .cbtn >> nth=0 >> .sbadge');
  await A.click('.top .cbtn >> nth=0');
  await until(() => A.evaluate(() => window.__gn.comms.loungeAV?.local.mic === true), 8000, 'mic live in the Lounge');
  await until(() => B.evaluate(() => window.__gn.comms.lounge.players.some((p) => p.name === 'Anna' && p.av.mic === 1)), 8000, 'B to see A\'s mic');
  // A hosts a room, flips the live mic to Room and back
  await A.evaluate(() => { location.hash = '#/game/connect4'; });
  await A.click('.sheet button:has-text("Create a room")'); await A.click('.sheet button.primary:has-text("Create room")');
  await A.waitForSelector('.lobby', { timeout: 20000 });
  await A.click('.top .cbtn >> nth=0 >> .sbadge');
  await until(() => A.evaluate(() => window.__gn.comms.roomAV?.local.mic === true && window.__gn.comms.loungeAV?.local.mic === false), 8000, 'mic to move to the room');
  await A.click('.top .cbtn >> nth=0 >> .sbadge');
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

await browser.close();
await site.close();
await broker.close();
peerServer.close?.();
fs.rmSync(TMP, { recursive: true, force: true });
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
