// Tank Battle — 2–4 players, free-for-all top-down tank combat (Battle City style).
// Map is generated from the shared seed on every client; the host simulates and streams tanks/bullets.
import { h, fitCanvas, trackKeys, dpad, makeRng } from '../util.js';
import { drawAvatar, avatarEl } from '../avatar.js';
import { Fx } from '../fx.js';

const CELL = 16, TX = 19, TY = 19, TILE = 32;
const CWc = TX * 2, CHc = TY * 2;
const W = TX * TILE, HH = TY * TILE;
const HALF = 13, SPEED = 112, BSPEED = 310;
const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 0 up, 1 right, 2 down, 3 left
const SPAWN = [[1, 1], [TX - 2, TY - 2], [TX - 2, 1], [1, TY - 2]];

const CSS = `
.tk { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; padding:6px; min-height:0; }
.tk-hud { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.tk-p { display:flex; align-items:center; gap:6px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:3px 10px 3px 4px; font-weight:800; font-size:13px; }
.tk-p .k { font-size:16px; font-weight:900; }
.tk-wrap { flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; position:relative; }
.tk canvas { border-radius:10px; box-shadow:0 10px 26px rgba(31,41,55,.22); max-width:100%; touch-action:none; }
.tk-log { position:absolute; top:6px; right:10px; display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-weight:800; font-size:13px; pointer-events:none; text-shadow:0 1px 3px #000; }
`;

function buildMap(seed) {
  const r = makeRng(seed ^ 0x9e3779b9);
  const tiles = new Array(TX * TY).fill(0);
  const clear = (x, y) => SPAWN.some(([sx, sy]) => Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2);
  for (let y = 0; y <= (TY - 1) / 2; y++) for (let x = 0; x <= (TX - 1) / 2; x++) {
    if (clear(x, y)) continue;
    const v = r.next();
    const t = v < 0.2 ? 1 : v < 0.27 ? 2 : 0;
    for (const [mx, my] of [[x, y], [TX - 1 - x, y], [x, TY - 1 - y], [TX - 1 - x, TY - 1 - y]]) tiles[my * TX + mx] = t;
  }
  const cells = new Uint8Array(CWc * CHc);
  for (let y = 0; y < TY; y++) for (let x = 0; x < TX; x++) {
    const t = tiles[y * TX + x];
    if (t) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) cells[(y * 2 + dy) * CWc + x * 2 + dx] = t;
  }
  return cells;
}

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const target = +api.opts.kills || 10;
  const cells = buildMap(api.seed);

  const canvas = h('canvas', { width: W, height: HH });
  const ctx = canvas.getContext('2d');
  const hud = h('div.tk-hud');
  const logEl = h('div.tk-log');
  const wrap = h('div.tk-wrap', canvas, logEl);
  const touch = dpad((k, d) => keyEvent(k, d), { actions: [{ label: '🔥', key: ' ' }] });
  api.root.append(h('style', CSS), h('div.tk', hud, wrap, touch));
  api.cleanup(fitCanvas(canvas, wrap, W / HH));

  // ------------------------------------------------------------ client
  let snap = null, prevB = [];
  const fx = new Fx();
  const vis = {};
  const scores = {};
  ids.forEach((id) => (scores[id] = 0));
  api.on('snap', (s) => {
    snap = s;
    for (const t of s.t) { const v = vis[t[0]] || (vis[t[0]] = { x: t[1], y: t[2], ang: t[3] * Math.PI / 2, kick: 0, kd: 0 }); if (Math.abs(v.x - t[1]) + Math.abs(v.y - t[2]) > 80) { v.x = t[1]; v.y = t[2]; } }
    if (s.d) for (const i of s.d) { cells[i] = 0; fx.burst((i % CWc) * CELL + CELL / 2, Math.floor(i / CWc) * CELL + CELL / 2, { n: 6, colors: ['#d9692f', '#b5461d', '#6b2a10'], speed: 150, gravity: 220, life: 0.6, size: 3, glow: false }); }
    // muzzle flash + recoil where a new shell appears next to a tank; blast particles for fresh explosions
    for (const b of s.b) {
      if (prevB.some((q) => Math.hypot(q[0] - b[0], q[1] - b[1]) < 26)) continue;
      const t = s.t.find((q) => q[4] && Math.hypot(q[1] - b[0], q[2] - b[1]) < 34);
      if (t) { fx.burst(b[0], b[1], { n: 7, colors: ['#fff', '#ffd23f', '#ff9a3c'], speed: 240, life: 0.22, size: 3, angle: t[3] * Math.PI / 2 - Math.PI / 2, spread: 0.9 }); const v = vis[t[0]]; if (v) { v.kick = 1; v.kd = t[3]; } if (t[0] === api.me) fx.shake(1.6, 0.08); }
    }
    prevB = s.b;
    for (const [x, y, k] of s.x || []) if (k > 0.92) { fx.burst(x, y, { n: 18, colors: ['#ff7a29', '#ffd23f', '#fff', '#444'], speed: 260, life: 0.7, size: 4, gravity: 40 }); fx.ring(x, y, { r: 40, color: '#ffb454', life: 0.35, width: 4 }); fx.shake(5, 0.2); }
    if (s.sc) { Object.assign(scores, s.sc); renderHud(); }
    if (s.ev) s.ev.forEach((e) => api.sfx(e));
  });
  api.on('full', (f) => { cells.fill(0); const c = f.cells; for (let i = 0; i < c.length; i++) cells[i] = +c[i]; });
  api.on('kill', (k) => {
    const v = vis[k.who];
    if (v) { fx.burst(v.x, v.y, { n: 30, colors: [api.player(k.who)?.color || '#fff', '#fff', '#ffb454'], speed: 320, life: 0.9, size: 4, gravity: 60 }); fx.ring(v.x, v.y, { r: 80, color: '#ff7a29', life: 0.5, width: 5 }); fx.shake(k.who === api.me ? 11 : 6, 0.3); fx.text(v.x, v.y - 22, '💥', { size: 26 }); }
    const el = h('div', `${api.player(k.by)?.name || '?'} 💥 ${api.player(k.who)?.name || '?'}`);
    logEl.append(el);
    setTimeout(() => el.remove(), 3500);
    while (logEl.childNodes.length > 4) logEl.firstChild.remove();
  });
  function renderHud() {
    hud.replaceChildren(...ids.map((id) => { const p = api.player(id); return h('div.tk-p', avatarEl({ ...p, online: p.online && !p.left }, 'sm', { still: true }), p.name, h('span.k', { style: { color: p.color } }, scores[id] + '/' + target)); }));
  }
  renderHud();
  api.onPlayersChanged(renderHud);

  function drawBrickCell(x, y) {
    const px = x * CELL, py = y * CELL;
    ctx.fillStyle = '#b5461d'; ctx.fillRect(px, py, CELL, CELL);
    ctx.fillStyle = '#d9692f'; ctx.fillRect(px, py, CELL, 7); ctx.fillRect(px + 8, py + 8, 8, 7); ctx.fillRect(px, py + 8, 6, 7);
    ctx.fillStyle = '#6b2a10'; ctx.fillRect(px, py + 7, CELL, 1); ctx.fillRect(px, py + 15, CELL, 1); ctx.fillRect(px + 7, py, 1, 7); ctx.fillRect(px + 7, py + 8, 1, 7);
  }
  function drawSteelCell(x, y) {
    const px = x * CELL, py = y * CELL;
    ctx.fillStyle = '#9aa3ad'; ctx.fillRect(px, py, CELL, CELL);
    ctx.fillStyle = '#e5e9ee'; ctx.fillRect(px, py, CELL, 3); ctx.fillRect(px, py, 3, CELL);
    ctx.fillStyle = '#5b6470'; ctx.fillRect(px, py + CELL - 3, CELL, 3); ctx.fillRect(px + CELL - 3, py, 3, CELL);
    ctx.fillStyle = '#bfc7d0'; ctx.fillRect(px + 5, py + 5, 6, 6);
  }
  function drawTank(id, x, y, ang, inv, alive, now, kick = 0, kd = 0) {
    if (!alive) return;
    x -= Math.sin(kd * Math.PI / 2) * -kick * 3; y -= Math.cos(kd * Math.PI / 2) * kick * 3; // recoil against the barrel direction
    const info = api.player(id);
    ctx.save(); ctx.translate(x, y);
    if (inv && Math.floor(now / 90) % 2) ctx.globalAlpha = 0.45;
    ctx.rotate(ang);
    // treads
    ctx.fillStyle = '#20232b'; ctx.fillRect(-14, -14, 7, 28); ctx.fillRect(7, -14, 7, 28);
    ctx.fillStyle = '#4b5060'; for (let i = -12; i < 14; i += 4) { ctx.fillRect(-14, i, 7, 1.5); ctx.fillRect(7, i, 7, 1.5); }
    // hull
    ctx.fillStyle = info.color; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-9, -11, 18, 24, 4); ctx.fill(); ctx.stroke();
    // barrel
    ctx.fillStyle = '#2a2d36'; ctx.fillRect(-2.5, -20, 5, 15);
    ctx.fillStyle = '#fff'; ctx.fillRect(-2.5, -20, 5, 2);
    ctx.restore();
    ctx.save(); ctx.globalAlpha = inv && Math.floor(now / 90) % 2 ? 0.45 : 1;
    drawAvatar(ctx, info.avatar, x, y + 1, 19);
    ctx.restore();
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
    ctx.strokeText(info.name, x, y - 24); ctx.fillText(info.name, x, y - 24);
  }
  function draw(now) {
    ctx.fillStyle = '#eef1f7'; ctx.fillRect(0, 0, W, HH);
    ctx.save(); fx.begin(ctx);
    ctx.fillStyle = 'rgba(31,41,55,.045)';
    for (let y = 0; y < TY; y++) for (let x = 0; x < TX; x++) if ((x + y) % 2) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    for (let y = 0; y < CHc; y++) for (let x = 0; x < CWc; x++) { const c = cells[y * CWc + x]; if (c === 1) drawBrickCell(x, y); else if (c === 2) drawSteelCell(x, y); }
    if (!snap) { ctx.restore(); return; }
    for (const t of snap.t) { const v = vis[t[0]]; drawTank(t[0], v.x, v.y, v.ang, t[5], t[4], now, v.kick, v.kd); }
    for (const [x, y] of snap.b) { // shells glow and leave a short smoky streak
      ctx.shadowColor = '#ff6a3d'; ctx.shadowBlur = 10; ctx.fillStyle = '#ea4335'; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, 1.5, 0, 7); ctx.fill();
      if (Math.random() < 0.6) fx.burst(x, y, { n: 1, color: 'rgba(255,140,60,.85)', speed: 20, life: 0.3, size: 3, glow: false });
    }
    for (const [x, y, k] of snap.x || []) { ctx.fillStyle = `rgba(255,${120 + k * 100},40,${k})`; ctx.beginPath(); ctx.arc(x, y, 8 + (1 - k) * 22, 0, 7); ctx.fill(); }
    fx.draw(ctx);
    ctx.restore(); fx.overlay(ctx, W, HH);
  }
  api.raf((dt, now) => {
    if (snap) for (const t of snap.t) {
      const v = vis[t[0]], k = Math.min(1, dt * 20); v.x += (t[1] - v.x) * k; v.y += (t[2] - v.y) * k;
      let da = t[3] * Math.PI / 2 - v.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); v.ang += da * Math.min(1, dt * 16); // turn smoothly instead of snapping
      v.kick = Math.max(0, v.kick - dt * 9);
      if (t[4] && Math.hypot(t[1] - v.x, t[2] - v.y) > 3 && Math.random() < 0.5) fx.burst(v.x, v.y, { n: 1, color: 'rgba(120,110,100,.5)', speed: 12, life: 0.4, size: 3, glow: false });
    }
    fx.update(dt);
    draw(now);
  });

  // ------------------------------------------------------------ input
  trackKeys(api, (k, down) => keyEvent(k, down));
  const DIRS = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };
  let held = [], lastSent = -1;
  function keyEvent(k, down) {
    if (k === null) { held = []; return send(); }
    if (k in DIRS) { held = held.filter((x) => x !== k); if (down) held.push(k); return send(); }
    if ((k === ' ' || k === 'Enter' || k === 'e') && down) api.toHost('fire');
  }
  function send() {
    const d = held.length ? DIRS[held[held.length - 1]] : -1;
    if (d !== lastSent) { lastSent = d; api.toHost('in', { d }); }
  }

  // ------------------------------------------------------------ host
  if (api.isHost) {
    const G = { tanks: {}, bullets: [], fx: [], scores: {}, over: false, destroyed: [], ev: [] };
    ids.forEach((id, i) => {
      G.scores[id] = 0;
      const [sx, sy] = SPAWN[i];
      G.tanks[id] = { id, x: sx * TILE + TILE / 2, y: sy * TILE + TILE / 2, dir: i === 0 || i === 2 ? 2 : 0, want: -1, alive: !api.player(id).left, inv: 2, respawn: 0, reload: 0, spawn: [sx * TILE + TILE / 2, sy * TILE + TILE / 2], shots: 0 };
    });
    const solidAt = (px, py) => {
      if (px < 0 || py < 0 || px >= W || py >= HH) return 2;
      return cells[Math.floor(py / CELL) * CWc + Math.floor(px / CELL)];
    };
    const rectBlocked = (x, y, self) => {
      if (x - HALF < 0 || y - HALF < 0 || x + HALF > W || y + HALF > HH) return true;
      const x0 = Math.floor((x - HALF) / CELL), x1 = Math.floor((x + HALF - 0.01) / CELL), y0 = Math.floor((y - HALF) / CELL), y1 = Math.floor((y + HALF - 0.01) / CELL);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (cells[cy * CWc + cx]) return true;
      for (const t of Object.values(G.tanks)) if (t !== self && t.alive && Math.abs(t.x - x) < HALF * 2 && Math.abs(t.y - y) < HALF * 2) return true;
      return false;
    };
    function moveTank(t, dt) {
      if (t.want < 0) return;
      if (t.want !== t.dir) {
        // turning: snap the perpendicular axis to an 8px grid so corridors are easy to enter
        if ((t.want % 2) !== (t.dir % 2)) {
          if (t.want % 2 === 0) { const sx = Math.round(t.x / 8) * 8; if (!rectBlocked(sx, t.y, t)) t.x = sx; }
          else { const sy = Math.round(t.y / 8) * 8; if (!rectBlocked(t.x, sy, t)) t.y = sy; }
        }
        t.dir = t.want;
      }
      const [dx, dy] = DIRV[t.dir];
      const nx = t.x + dx * SPEED * dt, ny = t.y + dy * SPEED * dt;
      if (!rectBlocked(nx, ny, t)) { t.x = nx; t.y = ny; }
    }
    function killTank(t, by) {
      if (!t.alive || t.inv > 0) return;
      t.alive = false; t.respawn = 2.5; t.want = -1;
      G.ev.push('boom');
      G.fx.push({ x: t.x, y: t.y, t: 0.5 });
      if (by && by !== t.id) G.scores[by]++;
      api.broadcast('kill', { by: by || t.id, who: t.id });
      if (by && G.scores[by] >= target && !G.over) {
        G.over = true;
        const ranking = ids.slice().sort((a, b) => G.scores[b] - G.scores[a]).map((id) => ({ id, score: G.scores[id], note: 'kills' }));
        api.timeout(() => api.endGame({ title: `${api.player(by).name} rules the battlefield!`, ranking, winners: [by] }), 1500);
      }
    }
    function tick(dt) {
      for (const t of Object.values(G.tanks)) {
        if (api.player(t.id).left) { t.alive = false; continue; }
        t.inv = Math.max(0, t.inv - dt);
        t.reload = Math.max(0, t.reload - dt);
        if (t.alive) moveTank(t, dt);
        else if ((t.respawn -= dt) <= 0 && !G.over) {
          const [sx, sy] = t.spawn;
          if (!Object.values(G.tanks).some((o) => o !== t && o.alive && Math.abs(o.x - sx) < 34 && Math.abs(o.y - sy) < 34)) { t.alive = true; t.x = sx; t.y = sy; t.inv = 2; t.dir = 0; }
        }
      }
      // bullets (sub-stepped so they can't skip over thin walls)
      for (const b of G.bullets) {
        const steps = Math.ceil((BSPEED * dt) / 4);
        for (let s = 0; s < steps && !b.dead; s++) {
          b.x += DIRV[b.dir][0] * (BSPEED * dt) / steps; b.y += DIRV[b.dir][1] * (BSPEED * dt) / steps;
          const c = solidAt(b.x, b.y);
          if (c) {
            b.dead = true;
            if (c === 1) {
              const cx = Math.floor(b.x / CELL), cy = Math.floor(b.y / CELL);
              // erode the 2-cell-wide strip (perpendicular to the shot) like classic tank games
              const strip = b.dir % 2 === 1 ? [[cx, cy & ~1], [cx, cy | 1]] : [[cx & ~1, cy], [cx | 1, cy]];
              for (const [x, y] of strip) if (cells[y * CWc + x] === 1) { cells[y * CWc + x] = 0; G.destroyed.push(y * CWc + x); }
              G.ev.push('hit');
            } else G.ev.push('bump');
            G.fx.push({ x: b.x, y: b.y, t: 0.2 });
            break;
          }
          for (const t of Object.values(G.tanks)) {
            if (t.alive && t.id !== b.owner && Math.abs(t.x - b.x) < HALF && Math.abs(t.y - b.y) < HALF) { if (t.inv > 0) { b.dead = true; } else { b.dead = true; killTank(t, b.owner); } break; }
          }
          for (const o of G.bullets) if (o !== b && !o.dead && o.owner !== b.owner && Math.abs(o.x - b.x) < 5 && Math.abs(o.y - b.y) < 5) { o.dead = b.dead = true; }
        }
      }
      for (const b of G.bullets) if (b.dead) { const t = G.tanks[b.owner]; if (t) t.shots--; }
      G.bullets = G.bullets.filter((b) => !b.dead);
      for (const f of G.fx) f.t -= dt;
      G.fx = G.fx.filter((f) => f.t > 0);
    }
    api.on('in', ({ d }, from) => { const t = G.tanks[from]; if (t) t.want = Number.isInteger(d) && d >= 0 && d < 4 ? d : -1; });
    api.on('fire', (_, from) => {
      const t = G.tanks[from];
      if (!t || !t.alive || t.reload > 0 || t.shots >= 2) return;
      const [dx, dy] = DIRV[t.dir];
      G.bullets.push({ x: t.x + dx * 18, y: t.y + dy * 18, dir: t.dir, owner: from });
      t.shots++; t.reload = 0.28;
      G.ev.push('shoot');
    });
    // ---- computer players: hunt the nearest tank, shoot when lined up, blast through bricks that block the way
    const brain = {};
    if (window.__gnDebug) window.__tk = { G, brain };
    const lineClear = (x1, y1, x2, y2) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 8));
      for (let i = 1; i < n; i++) if (solidAt(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n)) return false;
      return true;
    };
    api.interval(() => {
      if (G.over) return;
      const lvl = api.level;
      for (const id of ids) {
        const t = G.tanks[id];
        if (!api.isBot(id) || !t.alive) continue;
        const B = brain[id] || (brain[id] = { lx: t.x, ly: t.y, stuck: 0, detour: 0, dd: 0 });
        if (lvl === 'easy' && Math.random() < 0.4) continue; // slower reactions
        const enemies = Object.values(G.tanks).filter((o) => o.alive && o.id !== id);
        if (!enemies.length) { t.want = -1; continue; }
        const e = enemies.reduce((a, o) => (Math.hypot(o.x - t.x, o.y - t.y) < Math.hypot(a.x - t.x, a.y - t.y) ? o : a));
        const dx = e.x - t.x, dy = e.y - t.y;
        if (t.want >= 0 && Math.hypot(t.x - B.lx, t.y - B.ly) < 2) B.stuck++; else B.stuck = 0;
        B.lx = t.x; B.ly = t.y;
        const shoot = () => { if (t.reload <= 0 && Math.random() < (lvl === 'easy' ? 0.35 : lvl === 'hard' ? 1 : 0.7)) api.botDo(id, 'fire'); };
        // lined up with a clear shot? (tight = bullet will really hit; loose = close, so sidestep to line it up)
        const T = HALF * 0.55, L = HALF * 2.4;
        let fd = -1, adj = -1;
        if (Math.abs(dy) < L && lineClear(t.x, t.y, e.x, t.y)) { if (Math.abs(dy) < T) fd = dx > 0 ? 1 : 3; else adj = dy > 0 ? 2 : 0; }
        else if (Math.abs(dx) < L && lineClear(t.x, t.y, t.x, e.y)) { if (Math.abs(dx) < T) fd = dy > 0 ? 2 : 0; else adj = dx > 0 ? 1 : 3; }
        if (fd >= 0) { if (t.dir !== fd) t.want = fd; else { t.want = -1; shoot(); } continue; }
        if (adj >= 0 && B.stuck < 4) { t.want = adj; continue; }
        if (B.detour > 0) { B.detour--; t.want = B.dd; if (B.detour % 3 === 0) shoot(); continue; }
        if (B.stuck > 5) { B.detour = 7; B.dd = Math.floor(Math.random() * 4); B.stuck = 0; continue; }
        // move along the longer axis first, else the shorter one
        const pref = Math.abs(dx) > Math.abs(dy) ? [dx > 0 ? 1 : 3, dy > 0 ? 2 : 0] : [dy > 0 ? 2 : 0, dx > 0 ? 1 : 3];
        let moved = false;
        for (const d of pref) {
          const ahead = solidAt(t.x + DIRV[d][0] * (HALF + 5), t.y + DIRV[d][1] * (HALF + 5));
          if (ahead === 0) { t.want = d; moved = true; break; }
          if (ahead === 1 && d === pref[0]) { if (t.dir === d) { t.want = -1; shoot(); } else t.want = d; moved = true; break; } // brick: face it and fire
        }
        if (!moved) { B.detour = 6; B.dd = Math.floor(Math.random() * 4); }
      }
    }, 110);
    const snapshot = () => ({
      t: ids.map((id) => { const t = G.tanks[id]; return [id, +t.x.toFixed(1), +t.y.toFixed(1), t.dir, t.alive ? 1 : 0, t.inv > 0 ? 1 : 0]; }),
      b: G.bullets.map((b) => [+b.x.toFixed(1), +b.y.toFixed(1)]),
      x: G.fx.map((f) => [+f.x.toFixed(0), +f.y.toFixed(0), +Math.min(1, f.t * 2).toFixed(2)]),
      d: G.destroyed.length ? G.destroyed : undefined,
      sc: G.scores, ev: G.ev.length ? [...new Set(G.ev)] : undefined,
    });
    let last = performance.now();
    api.interval(() => {
      const now = performance.now();
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      tick(dt);
      api.broadcast('snap', snapshot());
      G.destroyed = []; G.ev = [];
    }, 33);
    api.onRejoin((id) => api.sendTo(id, 'full', { cells: Array.from(cells).join('') }));
    api.onLeave((id) => { const t = G.tanks[id]; if (t) { t.alive = false; t.want = -1; } });
  }
}
