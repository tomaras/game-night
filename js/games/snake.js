// Snake Arena — 2–8 players on one board. Eat apples to grow; crash and you're out (and become food).
// Host ticks the game; clients interpolate between ticks. Keys, on-screen pad or swipe to steer.
import { h, fitCanvas, trackKeys, dpad } from '../util.js';
import { drawAvatar, avatarEl } from '../avatar.js';
import { Fx } from '../fx.js';

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
  const fx = new Fx();
  const foodBorn = new Map(); // food key -> when it appeared (for the pop-in)
  const wins = {};
  ids.forEach((id) => (wins[id] = 0));
  api.on('snap', (s) => {
    prev = cur || s;
    cur = s;
    tRecv = performance.now();
    effects(prev, s);
    if (s.ev) s.ev.forEach((e) => api.sfx(e));
    renderHud();
  });
  api.on('msg', (m) => {
    Object.assign(wins, m.wins || {});
    banner.style.display = m.text ? '' : 'none';
    banner.replaceChildren(...(m.text ? m.text.split('\n').map((t) => h('div', t)) : []));
    renderHud();
  });
  const px = (v) => v * S + S / 2;
  function effects(a, b) {
    const key = (f) => f[0] + ',' + f[1] + ',' + f[2];
    const nowKeys = new Set(b.f.map(key));
    for (const f of a.f) if (!nowKeys.has(key(f))) { // an apple was eaten: sparks in the colour of whoever is standing there
      const eater = b.s.find((sn) => sn.a && sn.c[0] === f[0] && sn.c[1] === f[1]);
      const col = eater ? api.player(eater.id).color : '#fff';
      fx.burst(px(f[0]), px(f[1]), { n: f[2] === 1 ? 12 : 18, colors: [col, '#fff', f[2] === 1 ? '#e7433a' : '#fbbc04'], speed: 190, life: 0.5, size: 3 });
      fx.ring(px(f[0]), px(f[1]), { r: 26, color: '#fff', life: 0.3, width: 2 });
      if (f[2] !== 1) fx.text(px(f[0]), px(f[1]) - 6, '+3', { color: '#fff', size: 16 });
    }
    for (const f of b.f) if (!foodBorn.has(key(f))) foodBorn.set(key(f), performance.now());
    for (const sn of b.s) {
      const was = a.s.find((q) => q.id === sn.id);
      if (was && was.a && !sn.a) { // crashed: the whole snake bursts into its own colour
        const col = api.player(sn.id).color;
        for (let i = 0; i < was.c.length; i += 2) fx.burst(px(was.c[i]), px(was.c[i + 1]), { n: 3, colors: [col, '#fff'], speed: 220, life: 0.8, size: 3.4, gravity: 120 });
        fx.shake(sn.id === api.me ? 14 : 6, 0.4); if (sn.id === api.me) fx.flash('#ff3d4a', 0.22);
        fx.ring(px(was.c[0]), px(was.c[1]), { r: 70, color: col, life: 0.5, width: 5 });
      }
    }
  }
  function renderHud() {
    if (!cur) return;
    hud.replaceChildren(...cur.s.map((sn) => { const p = api.player(sn.id); return h('div.sn-p' + (sn.a ? '' : '.dead'), avatarEl({ ...p, online: p.online && !p.left }, 'sm', { still: true }), p.name, h('span.l', `🏆${wins[sn.id] || 0} · ${sn.c.length / 2}`)); }));
  }
  function draw(now) {
    ctx.save();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { ctx.fillStyle = (x + y) % 2 ? '#a2d149' : '#aad751'; ctx.fillRect(x * S, y * S, S, S); }
    if (!cur) { ctx.restore(); return; }
    fx.begin(ctx);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [x, y, k] of cur.f) {
      const born = foodBorn.get(x + ',' + y + ',' + k) || 0, u = Math.min(1, (now - born) / 320);
      const sc = u >= 1 ? 1 : 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2); // overshoots a little, then settles
      const cx = x * S + S / 2, cy = y * S + S / 2 + 1 + Math.sin(now / 380 + x * 1.7 + y) * 0.9;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(0, 6, 6, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = k === 1 ? '#e7433a' : '#fbbc04'; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(-2.5, -3, 2.2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3e7d1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(3, -11); ctx.stroke();
      ctx.restore();
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
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const tube = (wf, col, dx = 0, dy = 0) => { // thicker near the head, tapering to the tail
        for (let i = segs.length - 1; i > 0; i--) {
          const wd = S * wf * (0.62 + 0.38 * (1 - i / Math.max(segs.length, 4)));
          ctx.strokeStyle = col; ctx.lineWidth = wd;
          ctx.beginPath(); ctx.moveTo(segs[i][0] * S + S / 2 + dx, segs[i][1] * S + S / 2 + dy); ctx.lineTo(segs[i - 1][0] * S + S / 2 + dx, segs[i - 1][1] * S + S / 2 + dy); ctx.stroke();
        }
      };
      tube(0.92, 'rgba(0,0,0,.2)', 0, 3);
      tube(0.86, shadeHex(p.color));
      tube(0.66, p.color);
      tube(0.2, 'rgba(255,255,255,.28)', -2, -2.5);
      ctx.fillStyle = shadeHex(p.color); ctx.beginPath(); ctx.arc(segs[0][0] * S + S / 2, segs[0][1] * S + S / 2, S * 0.5, 0, 7); ctx.fill();
      const [hx, hy] = segs[0];
      if (!drawAvatar(ctx, p.avatar, hx * S + S / 2, hy * S + S / 2, S * 1.5)) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx * S + S / 2, hy * S + S / 2, 6, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (sn.a) {
        ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        ctx.strokeText(p.name, hx * S + S / 2, hy * S - 8); ctx.fillText(p.name, hx * S + S / 2, hy * S - 8);
      }
    }
    fx.draw(ctx);
    ctx.restore(); fx.overlay(ctx, W, HH);
  }
  function shadeHex(hex) { const v = parseInt(hex.slice(1), 16); const f = (x) => Math.round(x * 0.78); return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`; }
  api.raf((dt, now) => { fx.update(dt); draw(now); });

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
    // ---- computer players: stay alive first (flood-fill so they never trap themselves), then chase food
    function botSteer(s) {
      const lvl = api.level;
      const blocked = new Set();
      for (const o of G.snakes) if (o.alive) o.body.forEach((b, i) => { if (!(i === o.body.length - 1 && !o.grow)) blocked.add(b[0] + ',' + b[1]); });
      const ok = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !blocked.has(x + ',' + y);
      const area = (x, y, limit) => {
        const seen = new Set([x + ',' + y]), q = [[x, y]];
        while (q.length && seen.size < limit) {
          const [cx, cy] = q.pop();
          for (const [dx, dy] of DIRV) { const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny; if (ok(nx, ny) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); } }
        }
        return seen.size;
      };
      const [hx, hy] = s.body[0];
      const enemyHeads = G.snakes.filter((o) => o !== s && o.alive).map((o) => o.body[0]);
      let best = null;
      for (const d of [s.dir, (s.dir + 1) % 4, (s.dir + 3) % 4]) {
        const nx = hx + DIRV[d][0], ny = hy + DIRV[d][1];
        if (!ok(nx, ny)) continue;
        const room = Math.min(area(nx, ny, s.body.length * 3 + 6), s.body.length * 3 + 6);
        const fd = G.foods.length ? Math.min(...G.foods.map((f) => Math.abs(f[0] - nx) + Math.abs(f[1] - ny))) : 0;
        let sc = room * 12 - fd * (lvl === 'easy' ? 0.4 : 1.4) + Math.random() * (lvl === 'easy' ? 12 : 2);
        if (lvl !== 'easy' && enemyHeads.some((e) => Math.abs(e[0] - nx) + Math.abs(e[1] - ny) <= 1)) sc -= 40; // don't play chicken with another head
        if (lvl === 'hard' && d === s.dir) sc += 1;
        if (!best || sc > best.sc) best = { d, sc };
      }
      if (best && best.d !== s.dir) s.queue = [best.d];
    }
    api.interval(() => {
      if (G.state === 'wait' || G.over) return;
      if (G.state === 'play') { for (const s of G.snakes) if (s.alive && api.isBot(s.id)) botSteer(s); step(); }
      api.broadcast('snap', snapshot());
      G.ev = [];
    }, tickMs);
    api.onRejoin((id) => { api.sendTo(id, 'snap', snapshot()); api.sendTo(id, 'msg', { text: '', wins: G.wins }); });
    api.onLeave((id) => { const s = G.snakes.find((x) => x.id === id); if (s && s.alive) die(s); });
    api.timeout(newRound, 600);
  }
}
