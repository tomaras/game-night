// Bomber Arena — 2–4 players, Bomberman-style. Host simulates at 30 Hz; clients send input and render snapshots.
import { h, fitCanvas, trackKeys, dpad, clamp } from '../util.js';
import { drawAvatar, avatarEl } from '../avatar.js';
import { Fx } from '../fx.js';

const COLS = 15, ROWS = 15, TS = 40;
const CW = COLS * TS, CH = ROWS * TS;
const SPAWNS = [[1, 1], [COLS - 2, ROWS - 2], [COLS - 2, 1], [1, ROWS - 2]];
const FUSE = 2.1, FLAME_T = 0.5, RAD = 0.36;
const PU = { b: '💣', f: '🔥', s: '👟' };

const CSS = `
.bm { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; padding:6px; min-height:0; }
.bm-hud { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.bm-p { display:flex; align-items:center; gap:6px; background:var(--panel); border:1px solid var(--line); border-radius:var(--r); padding:3px 10px 3px 4px; font-weight:800; font-size:13px; }
.bm-p.dead { opacity:.4; text-decoration:line-through; }
.bm-p .st { font-size:11px; color:var(--muted); font-weight:700; }
.bm-wrap { flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; position:relative; }
.bm canvas { border-radius:var(--r); box-shadow:var(--z2); max-width:100%; image-rendering:auto; touch-action:none; }
.bm-banner { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); background:#fff; color:var(--on); box-shadow:var(--e2); border-radius:var(--r); padding:12px 22px; font-weight:900; font-size:24px; text-align:center; pointer-events:none; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const winsNeeded = +api.opts.wins || 2;

  const canvas = h('canvas', { width: CW, height: CH });
  const ctx = canvas.getContext('2d');
  const hud = h('div.bm-hud');
  const banner = h('div.bm-banner', { style: 'display:none' });
  const wrap = h('div.bm-wrap', canvas, banner);
  const touch = dpad((k, d) => keyEvent(k, d), { actions: [{ label: '💣', key: ' ' }] });
  api.root.append(h('style', CSS), h('div.bm', hud, wrap, touch));
  api.cleanup(fitCanvas(canvas, wrap, CW / CH));

  // ---------------------------------------------------------------- client state & rendering
  let snap = null, prevSnap = null;
  const fx = new Fx();
  let grid = new Array(COLS * ROWS).fill(0);
  const vis = {}; // smoothed positions
  const wins = {};
  ids.forEach((id) => (wins[id] = 0));

  const cx = (x) => x * TS + TS / 2;
  api.on('snap', (s) => {
    const oldGrid = grid;
    if (s.g) grid = s.g.split('').map(Number);
    prevSnap = snap;
    snap = s;
    if (prevSnap) {
      // crates burst into splinters, new flames spit sparks, a collected power-up pops, a dead player explodes
      for (let i = 0; i < grid.length; i++) if (oldGrid[i] === 2 && grid[i] === 0) fx.burst(cx(i % COLS), cx(Math.floor(i / COLS)), { n: 10, colors: ['#ca8a04', '#a16207', '#713f12'], speed: 200, life: 0.7, gravity: 260, size: 3.4, glow: false });
      const had = new Set(prevSnap.f.map((f) => f[0] + ',' + f[1]));
      let fresh = 0;
      for (const [x, y] of s.f) if (!had.has(x + ',' + y)) { fresh++; fx.burst(cx(x), cx(y), { n: 6, colors: ['#fff7ae', '#ff9f1c', '#e63946'], speed: 160, life: 0.55, size: 3.6, gravity: -40 }); }
      if (fresh > 2) fx.shake(Math.min(9, 2 + fresh * 0.6), 0.28);
      for (const [x, y, t] of prevSnap.u) if (!s.u.some((q) => q[0] === x && q[1] === y)) { fx.ring(cx(x), cx(y), { r: 34, color: '#ffd23f', life: 0.4, width: 3 }); fx.burst(cx(x), cx(y), { n: 10, colors: ['#ffd23f', '#fff'], speed: 180, life: 0.5 }); }
      for (const p of s.p) { const was = prevSnap.p.find((q) => q[0] === p[0]); if (was && was[3] && !p[3]) { const v = vis[p[0]]; if (v) { fx.burst(cx(v.x - 0.5), cx(v.y - 0.5), { n: 28, colors: [api.player(p[0]).color, '#fff', '#ffb454'], speed: 320, life: 0.9, size: 4, gravity: 120 }); fx.ring(cx(v.x - 0.5), cx(v.y - 0.5), { r: 70, color: '#ff7a29', life: 0.5, width: 5 }); fx.shake(p[0] === api.me ? 12 : 6, 0.4); if (p[0] === api.me) fx.flash('#ff3d4a', 0.2); } } }
    }
    for (const p of s.p) {
      const v = vis[p[0]] || (vis[p[0]] = { x: p[1], y: p[2] });
      if (Math.abs(v.x - p[1]) + Math.abs(v.y - p[2]) > 2.5) { v.x = p[1]; v.y = p[2]; }
    }
    if (s.ev) for (const e of s.ev) api.sfx(e);
    renderHud();
  });
  api.on('msg', (m) => {
    Object.assign(wins, m.wins || {});
    banner.style.display = m.text ? '' : 'none';
    banner.replaceChildren(...(m.text ? m.text.split('\n').map((t) => h('div', t)) : []));
    renderHud();
  });
  function renderHud() {
    if (!snap) return;
    hud.replaceChildren(...snap.p.map((p) => {
      const info = api.player(p[0]);
      return h('div.bm-p' + (p[3] ? '' : '.dead'), [avatarEl({ ...info, online: p[3] ? info.online : false }, 'sm', { still: true }), info.name, h('span.st', `🏆${wins[p[0]] || 0}  💣${p[4]} 🔥${p[5]} 👟${p[6]}`)]);
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    ctx.save(); fx.begin(ctx);
    // floor
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#2f7d3a' : '#378a43';
      ctx.fillRect(x * TS, y * TS, TS, TS);
    }
    if (!snap) { ctx.restore(); return; }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const c = grid[y * COLS + x];
      if (c === 1) {
        ctx.fillStyle = '#6b7280'; ctx.fillRect(x * TS, y * TS, TS, TS);
        ctx.fillStyle = '#9ca3af'; ctx.fillRect(x * TS, y * TS, TS, 5); ctx.fillRect(x * TS, y * TS, 5, TS);
        ctx.fillStyle = '#4b5563'; ctx.fillRect(x * TS, y * TS + TS - 6, TS, 6); ctx.fillRect(x * TS + TS - 6, y * TS, 6, TS);
        ctx.fillStyle = '#7b8190'; ctx.fillRect(x * TS + 9, y * TS + 9, TS - 18, TS - 18);
      } else if (c === 2) {
        ctx.fillStyle = '#a16207'; ctx.fillRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
        ctx.fillStyle = '#ca8a04'; ctx.fillRect(x * TS + 5, y * TS + 5, TS - 10, TS - 10);
        ctx.strokeStyle = '#713f12'; ctx.lineWidth = 2; ctx.strokeRect(x * TS + 5, y * TS + 5, TS - 10, TS - 10);
        ctx.beginPath(); ctx.moveTo(x * TS + 5, y * TS + 5); ctx.lineTo(x * TS + TS - 5, y * TS + TS - 5); ctx.moveTo(x * TS + TS - 5, y * TS + 5); ctx.lineTo(x * TS + 5, y * TS + TS - 5); ctx.stroke();
      }
    }
    ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [x, y, t] of snap.u) ctx.fillText(PU[t], x * TS + TS / 2, y * TS + TS / 2 + 2);
    const now = performance.now() / 1000;
    for (const [x, y, left] of snap.b) {
      const pulse = 1 + Math.sin(now * (left < 0.8 ? 26 : 9)) * 0.08;
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x * TS + TS / 2, y * TS + TS / 2 + 2, TS * 0.36 * pulse, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(x * TS + TS / 2 - 5, y * TS + TS / 2 - 3, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d97706'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x * TS + TS / 2 + 4, y * TS + 6); ctx.lineTo(x * TS + TS / 2 + 9, y * TS + 2); ctx.stroke();
      if (Math.sin(now * 20) > 0) { ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(x * TS + TS / 2 + 9, y * TS + 2, 3, 0, 7); ctx.fill(); }
    }
    for (const [x, y, k] of snap.f) {
      const g = ctx.createRadialGradient(x * TS + TS / 2, y * TS + TS / 2, 2, x * TS + TS / 2, y * TS + TS / 2, TS * 0.65);
      g.addColorStop(0, '#fff7ae'); g.addColorStop(0.5, '#ff9f1c'); g.addColorStop(1, 'rgba(230,57,70,.85)');
      ctx.fillStyle = g; ctx.globalAlpha = (0.55 + k * 0.45) * (0.85 + Math.random() * 0.15);
      ctx.shadowColor = '#ff9f1c'; ctx.shadowBlur = 14;
      ctx.fillRect(x * TS + 2 + (1 - k) * 4, y * TS + 2 + (1 - k) * 4, TS - 4 - (1 - k) * 8, TS - 4 - (1 - k) * 8); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }
    // players
    for (const [id, , , alive] of snap.p) {
      const v = vis[id];
      if (!alive) continue;
      const info = api.player(id);
      const x = v.x * TS, y = v.y * TS - Math.abs(Math.sin(v.walk || 0)) * 2.2;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, v.y * TS + 14, 13 - Math.abs(Math.sin(v.walk || 0)) * 1.4, 6, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = info.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.stroke();
      if (!drawAvatar(ctx, info.avatar, x, y, 32)) { ctx.fillStyle = info.color; ctx.beginPath(); ctx.arc(x, y, 15, 0, 7); ctx.fill(); }
      ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
      ctx.strokeText(info.name, x, y - 24); ctx.fillText(info.name, x, y - 24);
    }
    fx.draw(ctx);
    ctx.restore(); fx.overlay(ctx, CW, CH);
  }
  api.raf((dt) => {
    if (snap) for (const p of snap.p) {
      const v = vis[p[0]], k = Math.min(1, dt * 22), ox = v.x, oy = v.y;
      v.x += (p[1] - v.x) * k; v.y += (p[2] - v.y) * k;
      const mv = Math.hypot(v.x - ox, v.y - oy); v.walk = (v.walk || 0) + mv * 26; // bob while walking
      if (mv > 0.012 && p[3] && Math.random() < 0.18) fx.burst(v.x * TS, v.y * TS + 12, { n: 1, color: 'rgba(210,230,200,.5)', speed: 14, life: 0.35, size: 3, glow: false });
    }
    // fuse sparks on the bombs
    if (snap) for (const [x, y] of snap.b) if (Math.random() < 0.5) fx.burst(cx(x) + 8, y * TS + 4, { n: 1, colors: ['#fde047', '#fff'], speed: 60, life: 0.3, size: 2, gravity: 80 });
    fx.update(dt);
    draw();
  });

  // ---------------------------------------------------------------- input
  const keys = trackKeys(api, (k, down) => keyEvent(k, down, true));
  let held = []; // stack of directions
  const DIRS = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
  let lastSent = '0,0';
  function keyEvent(k, down) {
    if (k === null) { held = []; return send(); }
    if (DIRS[k]) {
      held = held.filter((x) => x !== k);
      if (down) held.push(k);
      return send();
    }
    if ((k === ' ' || k === 'Enter' || k === 'e') && down) api.toHost('bomb');
  }
  void keys;
  function send() {
    const d = held.length ? DIRS[held[held.length - 1]] : [0, 0];
    const key = d.join(',');
    if (key !== lastSent) { lastSent = key; api.toHost('in', { dx: d[0], dy: d[1] }); }
  }

  // ---------------------------------------------------------------- host simulation
  if (api.isHost) {
    const rng = api.rng;
    const G = { grid: [], players: {}, bombs: [], flames: [], pus: [], round: 0, state: 'wait', over: false, t: 0, sdIdx: 0, sdT: 0, wins: {}, ev: [], gdirty: true, bid: 0 };
    ids.forEach((id) => (G.wins[id] = 0));
    const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? 1 : G.grid[y * COLS + x]);
    const set = (x, y, v) => { G.grid[y * COLS + x] = v; G.gdirty = true; };
    const bombAt = (x, y) => G.bombs.find((b) => b.x === x && b.y === y);
    const spiral = (() => {
      const out = []; let x0 = 0, y0 = 0, x1 = COLS - 1, y1 = ROWS - 1;
      while (x0 <= x1 && y0 <= y1) {
        for (let x = x0; x <= x1; x++) out.push([x, y0]);
        for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
        if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
        if (x1 > x0) for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
        x0++; y0++; x1--; y1--;
      }
      return out;
    })();

    function newRound() {
      G.round++;
      G.grid = Array.from({ length: COLS * ROWS }, (_, i) => {
        const x = i % COLS, y = Math.floor(i / COLS);
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) return 1;
        if (x % 2 === 0 && y % 2 === 0) return 1;
        return rng.next() < 0.72 ? 2 : 0;
      });
      G.bombs = []; G.flames = []; G.pus = []; G.t = 0; G.sdIdx = 0; G.sdT = 0; G.gdirty = true;
      ids.forEach((id, i) => {
        const [sx, sy] = SPAWNS[i];
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = sx + dx, y = sy + dy; if (x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1 && !(x % 2 === 0 && y % 2 === 0)) G.grid[y * COLS + x] = 0; }
        G.players[id] = { id, x: sx + 0.5, y: sy + 0.5, dx: 0, dy: 0, alive: !api.player(id).left, maxB: 1, range: 2, speed: 3.6, out: 0 };
      });
      G.state = 'play';
      api.broadcast('msg', { text: `Round ${G.round}\nGO!`, wins: G.wins });
      api.timeout(() => api.broadcast('msg', { text: '', wins: G.wins }), 1200);
    }
    const solidFor = (pl, x, y) => {
      const c = at(x, y);
      if (c === 1 || c === 2) return true;
      const b = bombAt(x, y);
      return !!b && !b.pass.has(pl.id);
    };
    const blocked = (pl, px, py) => {
      for (let ty = Math.floor(py - RAD); ty <= Math.floor(py + RAD); ty++) for (let tx = Math.floor(px - RAD); tx <= Math.floor(px + RAD); tx++) {
        if (!solidFor(pl, tx, ty)) continue;
        const cx = clamp(px, tx, tx + 1), cy = clamp(py, ty, ty + 1);
        if ((px - cx) ** 2 + (py - cy) ** 2 < RAD * RAD - 0.0001) return true;
      }
      return false;
    };
    function movePlayer(pl, dt) {
      if (!pl.dx && !pl.dy) return;
      const dist = pl.speed * dt;
      const nx = pl.x + pl.dx * dist, ny = pl.y + pl.dy * dist;
      if (!blocked(pl, nx, ny)) { pl.x = nx; pl.y = ny; return; }
      // corner assist: slide toward the lane centre
      if (pl.dx) { const cy = Math.floor(pl.y) + 0.5, off = cy - pl.y; if (Math.abs(off) > 0.001 && Math.abs(off) < 0.5) { const st = Math.sign(off) * Math.min(Math.abs(off), dist); if (!blocked(pl, pl.x, pl.y + st)) pl.y += st; } }
      if (pl.dy) { const cx = Math.floor(pl.x) + 0.5, off = cx - pl.x; if (Math.abs(off) > 0.001 && Math.abs(off) < 0.5) { const st = Math.sign(off) * Math.min(Math.abs(off), dist); if (!blocked(pl, pl.x + st, pl.y)) pl.x += st; } }
    }
    function explode(b0) {
      const queue = [b0];
      while (queue.length) {
        const b = queue.pop();
        if (!G.bombs.includes(b)) continue;
        G.bombs.splice(G.bombs.indexOf(b), 1);
        const owner = G.players[b.owner]; if (owner) owner.out--;
        G.ev.push('boom');
        const flame = (x, y) => { G.flames.push({ x, y, t: FLAME_T }); const pu = G.pus.findIndex((p) => p.x === x && p.y === y); if (pu >= 0) G.pus.splice(pu, 1); const ob = bombAt(x, y); if (ob && ob !== b) queue.push(ob); };
        flame(b.x, b.y);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          for (let k = 1; k <= b.range; k++) {
            const x = b.x + dx * k, y = b.y + dy * k, c = at(x, y);
            if (c === 1) break;
            flame(x, y);
            if (c === 2) {
              set(x, y, 0);
              if (rng.next() < 0.32) G.pus.push({ x, y, t: 'bfs'[Math.floor(rng.next() * 3)] });
              break;
            }
          }
        }
      }
    }
    function kill(pl) { if (pl.alive) { pl.alive = false; G.ev.push('hit'); } }
    function tick(dt) {
      G.t += dt;
      for (const pl of Object.values(G.players)) {
        if (!pl.alive) continue;
        movePlayer(pl, dt);
        // leave-bomb rule
        for (const b of G.bombs) if (b.pass.has(pl.id) && (Math.abs(pl.x - (b.x + 0.5)) > 0.5 + RAD || Math.abs(pl.y - (b.y + 0.5)) > 0.5 + RAD)) b.pass.delete(pl.id);
        // power-ups
        const tx = Math.floor(pl.x), ty = Math.floor(pl.y);
        const pi = G.pus.findIndex((p) => p.x === tx && p.y === ty);
        if (pi >= 0) { const p = G.pus.splice(pi, 1)[0]; if (p.t === 'b') pl.maxB++; else if (p.t === 'f') pl.range++; else pl.speed = Math.min(6.2, pl.speed + 0.6); G.ev.push('pickup'); }
      }
      for (const b of [...G.bombs]) { b.t -= dt; if (b.t <= 0) explode(b); }
      for (const f of G.flames) f.t -= dt;
      G.flames = G.flames.filter((f) => f.t > 0);
      for (const pl of Object.values(G.players)) {
        if (!pl.alive) continue;
        const tx = Math.floor(pl.x), ty = Math.floor(pl.y);
        if (G.flames.some((f) => f.x === tx && f.y === ty)) kill(pl);
      }
      // sudden death
      if (G.t > 75) {
        G.sdT -= dt;
        while (G.sdT <= 0 && G.sdIdx < spiral.length) {
          G.sdT += 0.32;
          const [x, y] = spiral[G.sdIdx++];
          if (at(x, y) === 1) continue;
          set(x, y, 1);
          const bi = G.bombs.findIndex((b) => b.x === x && b.y === y); if (bi >= 0) G.bombs.splice(bi, 1);
          G.pus = G.pus.filter((p) => !(p.x === x && p.y === y));
          for (const pl of Object.values(G.players)) if (Math.floor(pl.x) === x && Math.floor(pl.y) === y) kill(pl);
          G.ev.push('break');
        }
      }
      const alive = Object.values(G.players).filter((p) => p.alive);
      if (G.state === 'play' && alive.length <= 1) roundOver(alive[0]);
    }
    function roundOver(w) {
      G.state = 'between';
      if (w) G.wins[w.id]++;
      const done = w && G.wins[w.id] >= winsNeeded;
      api.broadcast('msg', { text: w ? `${api.player(w.id).name} wins the round!` : 'Draw!', wins: G.wins });
      api.timeout(() => {
        if (done) {
          const ranking = ids.slice().sort((a, b) => G.wins[b] - G.wins[a]).map((id) => ({ id, score: G.wins[id], note: 'round wins' }));
          G.over = true;
          return api.endGame({ title: `${api.player(w.id).name} is the Bomber King!`, ranking, winners: [w.id] });
        }
        newRound();
      }, 2600);
    }
    api.on('in', ({ dx, dy }, from) => {
      const pl = G.players[from];
      if (!pl) return;
      dx = Math.sign(+dx) || 0; dy = Math.sign(+dy) || 0;
      if (dx && dy) dy = 0;
      pl.dx = dx; pl.dy = dy;
    });
    api.on('bomb', (_, from) => {
      const pl = G.players[from];
      if (!pl || !pl.alive || G.state !== 'play' || pl.out >= pl.maxB) return;
      const x = Math.floor(pl.x), y = Math.floor(pl.y);
      if (bombAt(x, y) || at(x, y) !== 0) return;
      const pass = new Set(Object.values(G.players).filter((p) => p.alive && Math.floor(p.x) === x && Math.floor(p.y) === y).map((p) => p.id));
      G.bombs.push({ x, y, t: FUSE, owner: from, range: pl.range, pass, id: ++G.bid });
      pl.out++;
      G.ev.push('plant');
    });
    // ---- computer players: dodge blast zones first, then hunt for power-ups, soft blocks and rivals — bombing only when there is a way out
    const K = (x, y) => x + ',' + y;
    const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const blastOf = (x0, y0, range) => {
      const cells = [[x0, y0]];
      for (const [dx, dy] of DIRS4) for (let k = 1; k <= range; k++) { const x = x0 + dx * k, y = y0 + dy * k, c = at(x, y); if (c === 1) break; cells.push([x, y]); if (c === 2) break; }
      return cells;
    };
    const dangerMap = (extra) => {
      const m = new Set(G.flames.map((f) => K(f.x, f.y)));
      for (const b of [...G.bombs, ...(extra ? [extra] : [])]) for (const [x, y] of blastOf(b.x, b.y, b.range)) m.add(K(x, y));
      return m;
    };
    /** Breadth-first search over walkable tiles; returns the path (list of [x,y], excluding the start) to the first goal tile. */
    const bfs = (sx, sy, goal, danger, maxLen = 40, blockedTiles = null) => {
      const prev = new Map([[K(sx, sy), null]]);
      const q = [[sx, sy, 0]];
      while (q.length) {
        const [x, y, d] = q.shift();
        if ((x !== sx || y !== sy) && goal(x, y)) { const path = []; let cur = K(x, y); while (prev.get(cur)) { const [px, py] = cur.split(',').map(Number); path.unshift([px, py]); cur = prev.get(cur); } return path; }
        if (d >= maxLen) continue;
        for (const [dx, dy] of DIRS4) {
          const nx = x + dx, ny = y + dy, k = K(nx, ny);
          if (prev.has(k) || at(nx, ny) !== 0 || bombAt(nx, ny) || (blockedTiles && blockedTiles.has(k))) continue;
          prev.set(k, K(x, y));
          q.push([nx, ny, d + 1]);
        }
      }
      return null;
    };
    const stepDir = (path, tx, ty) => { const [nx, ny] = path[0]; return { dx: nx - tx, dy: ny - ty }; };
    api.interval(() => {
      if (G.state !== 'play' || G.over) return;
      const lvl = api.level;
      for (const id of ids) {
        const pl = G.players[id];
        if (!pl || !pl.alive || !api.isBot(id)) continue;
        if (lvl === 'easy' && Math.random() < 0.45) continue;
        const tx = Math.floor(pl.x), ty = Math.floor(pl.y);
        const danger = dangerMap();
        const move = (path) => { const d = path && path.length ? stepDir(path, tx, ty) : { dx: 0, dy: 0 }; api.botDo(id, 'in', d); };
        if (danger.has(K(tx, ty))) { // standing in a blast zone: run to the nearest safe tile
          const path = bfs(tx, ty, (x, y) => !danger.has(K(x, y)), danger, 12);
          if (path) { move(path); continue; }
        }
        const rivals = Object.values(G.players).filter((o) => o.alive && o.id !== id).map((o) => [Math.floor(o.x), Math.floor(o.y)]);
        const hits = (x, y) => blastOf(x, y, pl.range).some(([bx, by]) => at(bx, by) === 2 || rivals.some(([rx, ry]) => rx === bx && ry === by));
        const canBomb = pl.out < pl.maxB && !bombAt(tx, ty) && at(tx, ty) === 0;
        const escape = () => { const hypo = { x: tx, y: ty, range: pl.range }; const d2 = dangerMap(hypo); return bfs(tx, ty, (x, y) => !d2.has(K(x, y)), d2, 8, new Set([K(tx, ty)])); };
        if (canBomb && hits(tx, ty) && Math.random() < (lvl === 'easy' ? 0.3 : 0.9)) {
          const esc = escape();
          if (esc) { api.botDo(id, 'bomb'); move(esc); continue; }
        }
        // otherwise walk toward the nearest power-up, or a tile where a bomb would do something
        const pu = new Set(G.pus.map((p) => K(p.x, p.y)));
        const path = bfs(tx, ty, (x, y) => !danger.has(K(x, y)) && (pu.has(K(x, y)) || (pl.out < pl.maxB && hits(x, y))), danger, 30);
        if (path) move(path);
        else if (Math.random() < 0.5) { const o = DIRS4[Math.floor(Math.random() * 4)]; if (at(tx + o[0], ty + o[1]) === 0 && !danger.has(K(tx + o[0], ty + o[1]))) api.botDo(id, 'in', { dx: o[0], dy: o[1] }); }
        else api.botDo(id, 'in', { dx: 0, dy: 0 });
      }
    }, 120);
    const snapshot = (full) => ({
      p: ids.map((id) => { const p = G.players[id]; return [id, +p.x.toFixed(2), +p.y.toFixed(2), p.alive ? 1 : 0, p.maxB, p.range, +(p.speed / 3.6).toFixed(1)]; }),
      b: G.bombs.map((b) => [b.x, b.y, +b.t.toFixed(2)]),
      f: G.flames.map((f) => [f.x, f.y, +(f.t / FLAME_T).toFixed(2)]),
      u: G.pus.map((p) => [p.x, p.y, p.t]),
      g: full || G.gdirty ? G.grid.join('') : undefined,
      ev: G.ev.length ? [...new Set(G.ev)] : undefined,
    });
    let last = performance.now();
    api.interval(() => {
      if (G.state === 'wait' || G.over) return;
      const now = performance.now();
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      if (G.state === 'play') tick(dt);
      else for (const f of G.flames) f.t -= dt;
      G.flames = G.flames.filter((f) => f.t > 0);
      api.broadcast('snap', snapshot());
      G.gdirty = false; G.ev = [];
    }, 33);
    api.onRejoin((id) => { api.sendTo(id, 'snap', snapshot(true)); api.sendTo(id, 'msg', { text: '', wins: G.wins }); });
    api.onLeave((id) => { const pl = G.players[id]; if (pl) { pl.alive = false; pl.dx = pl.dy = 0; } });
    api.timeout(newRound, 600);
  }
}
