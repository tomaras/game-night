#!/usr/bin/env node
// Records REAL gameplay footage of a game, as an image sequence from Chrome's screencast (full phone resolution).
//   node videos/capture.mjs <gameId> [--seconds 110] [--work .video-work]
//
// Games with a computer opponent are played by the computer on both sides (the "autopilot" test hook). Everything else is a
// real multi-player room: several browser pages join it and a generic "monkey" plays every seat through the normal UI
// (typing answers, drawing, tapping cards and buttons) while the host's screen is recorded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';
import { PeerServer } from 'peer';
import { startBroker } from '../tests/broker.mjs';
import { loadGames } from './script.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const srv = net.createServer(); srv.once('error', rej); srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => res(port)); }); });
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const PHRASES = ['a sleepy dragon at the bus stop', 'banana', 'dancing robot', 'the moon', 'tiny pirate ship', 'spaghetti', 'a very brave potato', 'ocean', 'purple elephant', 'birthday party', 'rocket', 'cheese'];
const NAMES = ['Alice', 'Ben', 'Chloe', 'Dev', 'Eva', 'Finn', 'Grace', 'Hugo', 'Ivy', 'Jack', 'Kira', 'Leo'];

// ------------------------------------------------------------------ screencast
async function startScreencast(page, dir) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(dir, String(n++).padStart(6, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, ts: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* */ }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 780, maxHeight: 1688, everyNthFrame: 2 });
  return { frames, async stop() { try { await cdp.send('Page.stopScreencast'); } catch { /* */ } await sleep(300); return frames; } };
}

// ------------------------------------------------------------------ the generic player
/** One thing to do on this page right now, or null. Runs in the page. */
function pickIn(page, id) {
  return page.evaluate((id) => {
    const root = document.querySelector('.game-root') || document.querySelector('.results');
    const res = document.querySelector('.results');
    const out = [];
    const vis = (el) => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return r.width > 18 && r.height > 18 && r.bottom > 70 && r.top < innerHeight - 4 && r.left < innerWidth && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none' && !el.closest('.hide,[hidden],.chatsheet,.cover');
    };
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height }; };
    const bad = /leave|rules|resign|quit|exit|share|fullscreen|abort|report|mute|invite|copy|download|kick|lock|remove|change game|reset|host sound|load your own/i;
    if (res) for (const b of res.querySelectorAll('button')) if (/play again|again|next/i.test(b.innerText)) out.push({ kind: 'click', prio: 9, ...box(b), text: b.innerText });
    if (root) {
      for (const el of root.querySelectorAll('input:not([type=range]):not([type=checkbox]):not([type=file]):not([type=radio]),textarea')) if (vis(el) && !el.value && !el.disabled) out.push({ kind: 'fill', prio: 8, ...box(el), text: el.placeholder || '' });
      for (const el of root.querySelectorAll('canvas')) { if (vis(el) && el.getBoundingClientRect().width > 140) out.push({ kind: 'draw', prio: 4, ...box(el), text: 'canvas' }); }
      for (const el of root.querySelectorAll('button:not(:disabled),[role=button],a.btn')) {
        if (!vis(el) || bad.test(el.innerText + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.title || ''))) continue;
        const primary = /primary|good/.test(el.className) || /^(send|submit|done|ready|vote|ok|next|confirm|continue|guess|reveal|propose|go|start|bid|play|call|pick|check|fold|draw)/i.test(el.innerText.trim());
        out.push({ kind: 'click', prio: primary ? 7 : 3, ...box(el), text: el.innerText.trim().slice(0, 30) });
      }
      for (const el of root.querySelectorAll('div,li,span,img,svg,label')) {
        if (el.closest('button,[role=button]') || !vis(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 26 || r.height < 26 || r.width > 380 || r.height > 380) continue;
        if (getComputedStyle(el).cursor === 'pointer') out.push({ kind: 'click', prio: 3, ...box(el), text: (el.innerText || '').trim().slice(0, 30) });
      }
    }
    return out;
  }, id);
}
const KEYS = ['Enter', 'ArrowRight', 'ArrowDown', 'x', 'z', 'ArrowLeft', 'ArrowUp', 'x', 'Enter'];
async function monkeyStep(page, st) {
  if (st.id === 'retro' && Math.random() < 0.7) { try { await page.keyboard.down(rand(KEYS)); await sleep(90); await page.keyboard.up(rand(KEYS)); } catch { /* */ } } // the console is played from the keyboard
  let cands;
  try { cands = await pickIn(page, st.id); } catch { return; }
  cands = cands.filter((c) => !st.recent.some((r) => Math.abs(r.x - c.x) < 6 && Math.abs(r.y - c.y) < 6 && Date.now() - r.t < 2500 && c.kind === 'click'));
  if (!cands.length) return;
  const top = Math.max(...cands.map((c) => c.prio));
  const pool = cands.filter((c) => c.prio >= top - (top >= 8 ? 0 : 4));
  const c = rand(pool);
  st.recent.push({ x: c.x, y: c.y, t: Date.now() }); if (st.recent.length > 6) st.recent.shift();
  try {
    if (c.kind === 'fill') { await page.mouse.click(c.x, c.y); await page.keyboard.type(rand(PHRASES), { delay: 28 }); await page.keyboard.press('Enter'); }
    else if (c.kind === 'draw' && /^(pinplace|jigsaw)$/.test(st.id) && Math.random() < 0.7) { await page.mouse.click(c.x + (Math.random() - 0.5) * c.w * 0.8, c.y + (Math.random() - 0.5) * c.h * 0.8); } // a map: drop a pin
    else if (c.kind === 'draw') {
      const sx = c.x + (Math.random() - 0.5) * c.w * 0.5, sy = c.y + (Math.random() - 0.5) * c.h * 0.5;
      await page.mouse.move(sx, sy); await page.mouse.down();
      for (let i = 1; i <= 14; i++) await page.mouse.move(sx + Math.sin(i / 2.2) * c.w * 0.18 + i * 6, sy + Math.cos(i / 2.8) * c.h * 0.16, { steps: 2 });
      await page.mouse.up();
    } else await page.mouse.click(c.x, c.y);
  } catch { /* the page moved on */ }
}

// ------------------------------------------------------------------ main
export async function captureGame(id, { seconds = 110, work = path.join(ROOT, '.video-work'), headless = true } = {}) {
  const { GAME_BY_ID } = await loadGames();
  const def = GAME_BY_ID[id];
  if (!def) throw new Error('unknown game ' + id);
  const peerPort = await freePort();
  const peerServer = PeerServer({ port: peerPort, path: '/', allow_discovery: false });
  const broker = await startBroker();
  const webPort = await freePort();
  const web = spawn('node', [path.join(ROOT, 'tests/serve.mjs'), ROOT, '/', String(webPort)], { stdio: 'ignore' });
  await sleep(1000);
  const base = `http://127.0.0.1:${webPort}/index.html?signal=127.0.0.1:${peerPort}&mqtt=${broker.url}`;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const mkPage = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(({ n, gid }) => { try { localStorage.setItem('gn.profile', JSON.stringify({ name: n, avatar: { c: Math.floor(Math.random() * 16), e: Math.floor(Math.random() * 12), m: Math.floor(Math.random() * 12), a: Math.random() < 0.5 ? Math.floor(Math.random() * 12) : 0 } })); localStorage.setItem('gn.theme', 'day'); localStorage.setItem('gn.seen.' + gid, '1'); } catch { /* */ } }, { n: name, gid: id });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [${name}] page error:`, e.message));
    return page;
  };
  const dir = path.join(work, id);
  const solo = !!(def.bots || def.solo);
  let rec, started = Date.now();
  const pages = [];
  try {
    if (solo) {
      const p = await mkPage('Alice'); pages.push(p);
      await p.goto(base + '&autopilot=1#/game/' + id); await p.waitForSelector('.sheet');
      await p.click('.sheet .galt button:first-child');
      await p.waitForSelector('.sheet button:has-text("Start")');
      rec = await startScreencast(p, path.join(dir, 'frames'));
      started = Date.now();
      await p.click('.sheet button:has-text("Start")');
      while ((Date.now() - started) / 1000 < seconds) {
        await sleep(1000);
        const again = p.locator('.results button:has-text("Play again")');
        if (await again.count()) await again.first().click().catch(() => {});
      }
    } else {
      const host = await mkPage(NAMES[0]); pages.push(host);
      await host.goto(base + '#/game/' + id); await host.waitForSelector('.sheet');
      await host.click('.sheet button:has-text("Create a room")'); await host.waitForSelector('.sheet button:has-text("Create room")'); await host.click('.sheet button:has-text("Create room")');
      await host.waitForSelector('.lobby', { timeout: 30000 });
      const num = (await host.locator('.codechip').first().innerText()).match(/\d+/)[0];
      const need = Math.min(def.max, Math.max(def.min, id === 'retro' || id === 'jigsaw' || id === 'pinplace' ? 2 : def.min + 1));
      for (let i = 1; i < need; i++) {
        const g = await mkPage(NAMES[i]); pages.push(g);
        await g.goto(base + '#/room/' + num); await g.waitForSelector('.sheet button:has-text("Join room")'); await g.click('.sheet button:has-text("Join room")'); await g.waitForSelector('.lobby', { timeout: 30000 });
      }
      await sleep(1200);
      rec = await startScreencast(host, path.join(dir, 'frames'));
      started = Date.now();
      await host.click('button:has-text("Start game")');
      const st = pages.map(() => ({ id, recent: [] }));
      const loops = pages.map((p, i) => (async () => { while ((Date.now() - started) / 1000 < seconds) { await monkeyStep(p, st[i]); await sleep(500 + Math.random() * 700 + (i ? 300 : 0)); } })());
      await Promise.all(loops);
    }
    const frames = await rec.stop();
    fs.mkdirSync(dir, { recursive: true });
    const meta = { id, solo, seconds, frames: frames.length, span: frames.length ? frames.at(-1).ts - frames[0].ts : 0, frameList: frames.map((f) => [path.basename(f.file), f.ts]) };
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta));
    return meta;
  } finally {
    await browser.close().catch(() => {});
    web.kill(); peerServer.close?.(); await broker.close().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : d; };
  const ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  for (const id of ids) {
    console.log(`capturing ${id}…`);
    const m = await captureGame(id, { seconds: +opt('seconds', 110), work: opt('work', path.join(ROOT, '.video-work')) });
    console.log(`  ${m.frames} frames over ${m.span.toFixed(1)} s (${m.solo ? 'computer played' : 'multi-player room'})`);
  }
  process.exit(0);
}
