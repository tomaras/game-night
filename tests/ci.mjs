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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-ci-'));
const SHA = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const results = [];
const test = async (name, fn) => {
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
const START = `${site.url}index.html?signal=127.0.0.1:${peerPort}`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const errorsOf = (page) => { page.errs = []; page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|net::ERR_FAILED/.test(m.text() + (m.location()?.url || ''))) page.errs.push('console: ' + m.text()); }); return page; };
const newPage = async (name = 'Player') => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((n) => { try { localStorage.setItem('gn.profile', JSON.stringify({ name: n, avatar: '🦊' })); } catch { /* */ } }, name);
  const page = errorsOf(await ctx.newPage());
  page.ctx = ctx;
  return page;
};
const createRoom = async (p, gameId = 'connect4') => {
  await p.goto(START.replace('index.html', 'index.html') + `#/game/${gameId}`);
  await p.click('button:has-text("Create a room")');
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

await browser.close();
await site.close();
peerServer.close?.();
fs.rmSync(TMP, { recursive: true, force: true });
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
