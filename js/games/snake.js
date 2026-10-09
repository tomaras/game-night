// Snake Arena — 2–8 players on one board. Eat apples to grow; crash and you're out (and become food).
// Host ticks the game; clients interpolate between ticks. Keys, on-screen pad or swipe to steer.
import { h, fitCanvas, trackKeys, dpad } from '../util.js';
import { drawAvatar, avatarEl } from '../avatar.js';

const COLS = 26, ROWS = 26, S = 22;
const W = COLS * S, HH = ROWS * S;
const DIRV = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const CSS = `
.sn { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; padding:6px; min-height:0; }
.sn-hud { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.sn-p { display:flex; align-items:center; gap:6px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:3px 10px 3px 4px; font-weight:800; font-size:13px; }
.sn-p.dead { opacity:.4; }
.sn-p .l { font-size:12px; color:var(--muted); }
.sn-wrap { flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; position:relative; }
.sn canvas { border-radius:10px; box-shadow:0 10px 26px rgba(31,41,55,.22); max-width:100%; touch-action:none; }
.sn-banner { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); background:#fff; color:var(--on); box-shadow:var(--e2); border-radius:24px; padding:12px 22px; font-weight:900; font-size:24px; text-align:center; pointer-events:none; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const winsNeeded = +api.opts.wins || 2;
  const tickMs = { slow: 170, normal: 120, fast: 85 }[api.opts.speed || 'normal'];

  const canvas = h('canvas', { width: W, height: HH });
  const ctx = canvas.getContext('2d');
  const hud = h('div.sn-hud');
  const banner = h('div.sn-banner', { style: 'display:none' });
  const wrap = h('div.sn-wrap', canvas, banner);
  const touch = dpad((k, d) => keyEvent(k, d));
  api.root.append(h('style', CSS), h('div.sn', hud, wrap, touch));
  api.cleanup(fitCanvas(canvas, wrap, W / HH));

  // ------------------------------------------------------------ client
  let cur = null, prev = null, tRecv = 0;
  const wins = {};
  ids.forEach((id) => (wins[id] = 0));
  api.on('snap', (s) => {
    prev = cur || s;
    cur = s;
    tRecv = performance.now();
    if (s.ev) s.ev.forEach((e) => api.sfx(e));
    renderHud();
  });
  api.on('msg', (m) => {
    Object.assign(wins, m.wins || {});
    banner.style.display = m.text ? '' : 'none';
    banner.replaceChildren(...(m.text ? m.text.split('\n').map((t) => h('div', t)) : []));
    renderHud();
  });
  function renderHud() {
    if (!cur) return;
    hud.replaceChildren(...cur.s.map((sn) => { const p = api.player(sn.id); return h('div.sn-p' + (sn.a ? '' : '.dead'), avatarEl({ ...p, online: p.online && !p.left }, 'sm', { still: true }), p.name, h('span.l', `🏆${wins[sn.id] || 0} · ${sn.c.length / 2}`)); }));
  }
  function draw(now) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { ctx.fillStyle = (x + y) % 2 ? '#a2d149' : '#aad751'; ctx.fillRect(x * S, y * S, S, S); }
    if (!cur) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [x, y, k] of cur.f) {
      const cx = x * S + S / 2, cy = y * S + S / 2 + 1;
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(cx, cy + 6, 6, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = k === 1 ? '#e7433a' : '#fbbc04'; ctx.beginPath(); ctx.arc(cx, cy, 7.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(cx - 2.5, cy - 3, 2.2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3e7d1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 3, cy - 11); ctx.stroke();
    }
    const alpha = Math.min(1, (now - tRecv) / tickMs);
    for (const sn of cur.s) {
      const p = api.player(sn.id);
      const ps = (prev.s.find((q) => q.id === sn.id) || sn).c;
      const segs = [];
      for (let i = 0; i < sn.c.length; i += 2) {
        const j = Math.min(i, ps.length - 2);
        const px = ps[j] ?? sn.c[i], py = ps[j + 1] ?? sn.c[i + 1];
        segs.push([px + (sn.c[i] - px) * alpha, py + (sn.c[i + 1] - py) * alpha]);
      }
      const blink = !sn.a && Math.floor(now / 120) % 2;
      if (!sn.a && !blink) continue;
      ctx.globalAlpha = sn.a ? 1 : 0.55;
      for (let i = segs.length - 1; i >= 0; i--) {
        const [x, y] = segs[i];
        const r = i === 0 ? S * 0.48 : S * (0.42 - Math.min(0.12, i * 0.004));
        ctx.fillStyle = i % 2 ? p.color : shadeHex(p.color);
        ctx.beginPath(); ctx.arc(x * S + S / 2, y * S + S / 2, r, 0, 7); ctx.fill();
      }
      const [hx, hy] = segs[0];
      if (!drawAvatar(ctx, p.avatar, hx * S + S / 2, hy * S + S / 2, S * 1.5)) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx * S + S / 2, hy * S + S / 2, 6, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (sn.a) {
        ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        ctx.strokeText(p.name, hx * S + S / 2, hy * S - 8); ctx.fillText(p.name, hx * S + S / 2, hy * S - 8);
      }
    }
  }
  function shadeHex(hex) { const v = parseInt(hex.slice(1), 16); const f = (x) => Math.round(x * 0.78); return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`; }
  api.raf((dt, now) => draw(now));

  // ------------------------------------------------------------ input
  trackKeys(api, (k, down) => { if (down) keyEvent(k, true); });
  const DIRS = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };
  function keyEvent(k, down) { if (down && k in DIRS) api.toHost('turn', { d: DIRS[k] }); }
  // swipe
  let sw = null;
  canvas.addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    api.toHost('turn', { d: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0) });
    sw = { x: e.clientX, y: e.clientY };
  });
  const swEnd = () => { sw = null; };
  canvas.addEventListener('pointerup', swEnd); canvas.addEventListener('pointercancel', swEnd);

  // ------------------------------------------------------------ host
  if (api.isHost) {
    const rng = api.rng;
    const G = { snakes: [], foods: [], round: 0, state: 'wait', over: false, wins: {}, ev: [], tickT: 0 };
    ids.forEach((id) => (G.wins[id] = 0));
    const occupied = (x, y) => G.snakes.some((s) => s.body.some((b) => b[0] === x && b[1] === y)) || G.foods.some((f) => f[0] === x && f[1] === y);
    function spawnFood(kind = 1) {
      for (let tries = 0; tries < 80; tries++) {
        const x = rng.int(COLS), y = rng.int(ROWS);
        if (!occupied(x, y)) { G.foods.push([x, y, kind]); return; }
      }
    }
    function newRound() {
      G.round++;
      G.state = 'play';
      G.foods = [];
      const n = ids.length;
      const pos = [[4, 4, 1], [COLS - 5, ROWS - 5, 3], [COLS - 5, 4, 2], [4, ROWS - 5, 0], [COLS / 2, 3, 2], [COLS / 2, ROWS - 4, 0], [3, ROWS / 2, 1], [COLS - 4, ROWS / 2, 3]];
      G.snakes = ids.map((id, i) => {
        const [x, y, d] = pos[i];
        const body = [];
        for (let k = 0; k < 3; k++) body.push([x - DIRV[d][0] * k, y - DIRV[d][1] * k]);
        return { id, body, dir: d, queue: [], alive: !api.player(id).left, grow: 0 };
      });
      for (let i = 0; i < n + 3; i++) spawnFood();
      api.broadcast('msg', { text: `Round ${G.round}\nGO!`, wins: G.wins });
      api.timeout(() => api.broadcast('msg', { text: '', wins: G.wins }), 1100);
    }
    function die(s) { if (!s.alive) return; s.alive = false; G.ev.push('hit'); s.dying = 6; s.body.forEach((b, i) => { if (i % 3 === 1) G.foods.push([b[0], b[1], 2]); }); }
    function step() {
      const live = G.snakes.filter((s) => s.alive);
      for (const s of live) {
        if (s.queue.length) { const d = s.queue.shift(); if ((d + 2) % 4 !== s.dir && d !== s.dir) s.dir = d; }
      }
      const heads = live.map((s) => [s.body[0][0] + DIRV[s.dir][0], s.body[0][1] + DIRV[s.dir][1]]);
      live.forEach((s, i) => {
        const [hx, hy] = heads[i];
        s.next = [hx, hy];
        s.ate = false;
        const fi = G.foods.findIndex((f) => f[0] === hx && f[1] === hy);
        if (fi >= 0) { const f = G.foods.splice(fi, 1)[0]; s.grow += f[2] === 1 ? 1 : 1; s.ate = true; G.ev.push('coin'); if (f[2] === 1) spawnFood(); }
      });
      // move: tails advance unless growing
      live.forEach((s) => { s.body.unshift(s.next); if (s.grow > 0) s.grow--; else s.body.pop(); });
      // collisions
      const dead = new Set();
      for (const s of live) {
        const [hx, hy] = s.body[0];
        if (hx < 0 || hy < 0 || hx >= COLS || hy >= ROWS) { dead.add(s); continue; }
        for (const o of G.snakes) {
          if (!o.alive && !o.dying) continue;
          if (!o.alive) continue;
          for (let i = o === s ? 1 : 0; i < o.body.length; i++) if (o.body[i][0] === hx && o.body[i][1] === hy) { if (o !== s && i === 0) dead.add(o); dead.add(s); }
        }
      }
      dead.forEach(die);
      if (G.foods.length < ids.length) spawnFood();
      const alive = G.snakes.filter((s) => s.alive);
      if (G.state === 'play' && (alive.length <= 1 && ids.length > 1)) roundOver(alive[0]);
    }
    function roundOver(w) {
      G.state = 'between';
      if (w) G.wins[w.id]++;
      const done = w && G.wins[w.id] >= winsNeeded;
      api.broadcast('msg', { text: w ? `${api.player(w.id).name} wins the round!` : 'Everybody crashed!', wins: G.wins });
      api.timeout(() => {
        if (done) {
          G.over = true;
          const ranking = ids.slice().sort((a, b) => G.wins[b] - G.wins[a]).map((id) => ({ id, score: G.wins[id], note: 'round wins' }));
          return api.endGame({ title: `${api.player(w.id).name} is the top snake!`, ranking, winners: [w.id] });
        }
        newRound();
      }, 2500);
    }
    api.on('turn', ({ d }, from) => {
      const s = G.snakes.find((x) => x.id === from);
      if (!s || !s.alive || !(d >= 0 && d < 4)) return;
      const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
      if (d === last || (d + 2) % 4 === last) return;
      if (s.queue.length < 3) s.queue.push(d);
    });
    const snapshot = () => ({
      s: G.snakes.map((s) => ({ id: s.id, a: s.alive ? 1 : 0, c: s.body.flat() })),
      f: G.foods,
      ev: G.ev.length ? [...new Set(G.ev)] : undefined,
    });
    api.interval(() => {
      if (G.state === 'wait' || G.over) return;
      if (G.state === 'play') step();
      api.broadcast('snap', snapshot());
      G.ev = [];
    }, tickMs);
    api.onRejoin((id) => { api.sendTo(id, 'snap', snapshot()); api.sendTo(id, 'msg', { text: '', wins: G.wins }); });
    api.onLeave((id) => { const s = G.snakes.find((x) => x.id === id); if (s && s.alive) die(s); });
    api.timeout(newRound, 600);
  }
}
