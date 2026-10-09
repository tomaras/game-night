// Pong Arena — 2–4 players, a square arena with a paddle on each player's side. Lose a life when the ball
// gets past you; eliminated sides turn into walls. Last paddle standing wins. Host simulates the ball.
import { h, fitCanvas, trackKeys, clamp } from '../util.js';
import { drawAvatar, avatarEl } from '../avatar.js';

const S = 700, PLEN = 120, PT = 14, PM = 10, BR = 9;
const SIDES = ['L', 'R', 'T', 'B'];

const CSS = `
.pg { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; padding:6px; min-height:0; }
.pg-hud { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.pg-p { display:flex; align-items:center; gap:6px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:3px 10px 3px 4px; font-weight:800; font-size:13px; }
.pg-p.dead { opacity:.4; }
.pg-wrap { flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; position:relative; }
.pg canvas { border-radius:14px; box-shadow:0 10px 26px rgba(31,41,55,.22); max-width:100%; touch-action:none; }
.pg-banner { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-weight:900; font-size:56px; text-shadow:0 4px 14px rgba(0,0,0,.8); pointer-events:none; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const sideOf = {};
  ids.forEach((id, i) => (sideOf[id] = SIDES[i]));
  const lives0 = +api.opts.lives || 5;

  const canvas = h('canvas', { width: S, height: S });
  const ctx = canvas.getContext('2d');
  const hud = h('div.pg-hud');
  const banner = h('div.pg-banner');
  const wrap = h('div.pg-wrap', canvas, banner);
  api.root.append(h('style', CSS), h('div.pg', hud, wrap, h('div.muted', { style: 'font-size:12px;padding-bottom:4px' }, 'Move: ← → ↑ ↓ / A D / W S — or drag on the arena')));
  api.cleanup(fitCanvas(canvas, wrap, 1));

  // ------------------------------------------------------------ client
  let snap = null;
  const vis = { ball: null, pad: {} };
  api.on('snap', (s) => {
    snap = s;
    if (!vis.ball) vis.ball = { x: s.b[0], y: s.b[1] };
    for (const p of s.p) if (!(p[0] in vis.pad)) vis.pad[p[0]] = p[1];
    s.ev?.forEach((e) => api.sfx(e));
    banner.textContent = s.msg || '';
    renderHud();
  });
  function renderHud() {
    if (!snap) return;
    hud.replaceChildren(...snap.p.map((p) => { const info = api.player(p[0]); return h('div.pg-p' + (p[2] > 0 ? '' : '.dead'), avatarEl({ ...info, online: info.online && !info.left }, 'sm', { still: true }), info.name, h('span', { style: { color: info.color } }, '❤'.repeat(Math.max(0, p[2])) || '💀')); }));
  }
  const trail = [];
  function padRect(side, pos) {
    if (side === 'L') return [PM, pos - PLEN / 2, PT, PLEN];
    if (side === 'R') return [S - PM - PT, pos - PLEN / 2, PT, PLEN];
    if (side === 'T') return [pos - PLEN / 2, PM, PLEN, PT];
    return [pos - PLEN / 2, S - PM - PT, PLEN, PT];
  }
  function draw() {
    ctx.fillStyle = '#0b0d17'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.setLineDash([12, 14]); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.arc(S / 2, S / 2, 90, 0, 7); ctx.stroke();
    if (!snap) return;
    const owned = {};
    for (const p of snap.p) owned[sideOf[p[0]]] = p;
    // walls for sides without an alive player
    ctx.fillStyle = '#3b4056';
    for (const sd of SIDES) {
      const p = owned[sd];
      if (p && p[2] > 0) continue;
      if (sd === 'L') ctx.fillRect(0, 0, 8, S); else if (sd === 'R') ctx.fillRect(S - 8, 0, 8, S); else if (sd === 'T') ctx.fillRect(0, 0, S, 8); else ctx.fillRect(0, S - 8, S, 8);
    }
    for (const p of snap.p) {
      if (p[2] <= 0) continue;
      const info = api.player(p[0]);
      const side = sideOf[p[0]];
      const [x, y, w, hh] = padRect(side, vis.pad[p[0]]);
      ctx.shadowColor = info.color; ctx.shadowBlur = p[0] === api.me ? 18 : 8;
      ctx.fillStyle = info.color; ctx.beginPath(); ctx.roundRect(x, y, w, hh, 7); ctx.fill();
      ctx.shadowBlur = 0;
      const cx = x + w / 2, cy = y + hh / 2;
      const ax = side === 'L' ? cx + 30 : side === 'R' ? cx - 30 : cx, ay = side === 'T' ? cy + 30 : side === 'B' ? cy - 30 : cy;
      drawAvatar(ctx, info.avatar, ax, ay, 30);
      if (p[0] === api.me) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('YOU', side === 'L' || side === 'R' ? ax : ax, side === 'T' ? ay + 28 : side === 'B' ? ay - 20 : ay + 30); }
    }
    // ball + trail
    if (vis.ball) {
      trail.push([vis.ball.x, vis.ball.y]);
      if (trail.length > 14) trail.shift();
      trail.forEach(([tx, ty], i) => { ctx.fillStyle = `rgba(255,255,255,${(i / trail.length) * 0.25})`; ctx.beginPath(); ctx.arc(tx, ty, BR * (i / trail.length), 0, 7); ctx.fill(); });
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 16; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(vis.ball.x, vis.ball.y, BR, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }
  }
  api.raf((dt) => {
    if (snap) {
      const k = Math.min(1, dt * 30);
      vis.ball.x += (snap.b[0] - vis.ball.x) * k; vis.ball.y += (snap.b[1] - vis.ball.y) * k;
      for (const p of snap.p) vis.pad[p[0]] += (p[1] - vis.pad[p[0]]) * Math.min(1, dt * 26);
    }
    draw();
  });

  // ------------------------------------------------------------ input: keep a local target and send it
  const mySide = sideOf[api.me];
  const vertical = mySide === 'L' || mySide === 'R';
  let target = S / 2, lastSent = -1, lastT = 0;
  const keys = trackKeys(api);
  api.raf((dt) => {
    let dir = 0;
    const neg = vertical ? ['ArrowUp', 'w'] : ['ArrowLeft', 'a'], pos = vertical ? ['ArrowDown', 's'] : ['ArrowRight', 'd'];
    // accept either axis' keys for convenience
    if (neg.some((k) => keys.has(k)) || keys.has(vertical ? 'ArrowLeft' : 'ArrowUp') || keys.has(vertical ? 'a' : 'w')) dir -= 1;
    if (pos.some((k) => keys.has(k)) || keys.has(vertical ? 'ArrowRight' : 'ArrowDown') || keys.has(vertical ? 'd' : 's')) dir += 1;
    if (dir) target = clamp(target + dir * 640 * dt, PLEN / 2, S - PLEN / 2);
    const now = performance.now();
    if (Math.round(target) !== lastSent && now - lastT > 30) { lastSent = Math.round(target); lastT = now; api.toHost('t', { t: lastSent }); }
  });
  const steer = (e) => {
    const r = canvas.getBoundingClientRect();
    const v = vertical ? ((e.clientY - r.top) / r.height) * S : ((e.clientX - r.left) / r.width) * S;
    target = clamp(v, PLEN / 2, S - PLEN / 2);
  };
  let down = false;
  canvas.addEventListener('pointerdown', (e) => { down = true; canvas.setPointerCapture(e.pointerId); steer(e); });
  canvas.addEventListener('pointermove', (e) => { if (down || e.pointerType === 'mouse') steer(e); });
  canvas.addEventListener('pointerup', () => { down = false; });

  // ------------------------------------------------------------ host
  if (api.isHost) {
    const G = { pad: {}, tgt: {}, lives: {}, ball: { x: S / 2, y: S / 2, vx: 0, vy: 0, sp: 330 }, serve: 1.2, msg: '', over: false, out: [], ev: [], lastHit: null };
    ids.forEach((id) => { G.pad[id] = S / 2; G.tgt[id] = S / 2; G.lives[id] = lives0; });
    const aliveIds = () => ids.filter((id) => G.lives[id] > 0 && !api.player(id).left);
    const ownerOf = (side) => ids.find((id) => sideOf[id] === side && G.lives[id] > 0 && !api.player(id).left);
    function serve() {
      const b = G.ball;
      b.x = S / 2; b.y = S / 2; b.sp = 330; b.vx = b.vy = 0; G.serve = 1.3; G.msg = '';
      const targets = aliveIds().map((id) => sideOf[id]);
      const side = targets.length ? targets[Math.floor(Math.random() * targets.length)] : 'L';
      const base = { L: Math.PI, R: 0, T: -Math.PI / 2, B: Math.PI / 2 }[side];
      const a = base + (Math.random() - 0.5) * 0.9;
      G.dir = a;
    }
    function lose(side) {
      const id = ids.find((i) => sideOf[i] === side && G.lives[i] > 0);
      if (!id) return false;
      G.lives[id]--; G.ev.push('lose');
      if (G.lives[id] <= 0) { G.out.push(id); G.ev.push('boom'); }
      if (aliveIds().length <= 1 && ids.length > 1 && !G.over) {
        G.over = true;
        const w = aliveIds()[0];
        const ranking = [...(w ? [w] : []), ...G.out.slice().reverse()].map((i) => ({ id: i, score: G.lives[i], note: 'lives' }));
        G.msg = '';
        api.timeout(() => api.endGame({ title: w ? `${api.player(w).name} wins!` : 'Game over', ranking, winners: w ? [w] : [] }), 1200);
      } else serve();
      return true;
    }
    function tick(dt) {
      for (const id of ids) {
        const t = G.tgt[id], p = G.pad[id], d = t - p, mv = 700 * dt;
        G.pad[id] = p + clamp(d, -mv, mv);
      }
      if (G.over) return;
      const b = G.ball;
      if (G.serve > 0) {
        G.serve -= dt;
        G.msg = G.serve > 0 ? '' : '';
        if (G.serve <= 0) { b.vx = Math.cos(G.dir) * b.sp; b.vy = Math.sin(G.dir) * b.sp; }
        return;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const hitPad = (id, side) => {
        const pos = G.pad[id];
        let off, ok = false;
        if (side === 'L' && b.vx < 0 && b.x - BR < PM + PT && b.x > PM - 4) { off = (b.y - pos) / (PLEN / 2 + BR); ok = Math.abs(off) <= 1; if (ok) { b.x = PM + PT + BR; } }
        else if (side === 'R' && b.vx > 0 && b.x + BR > S - PM - PT && b.x < S - PM + 4) { off = (b.y - pos) / (PLEN / 2 + BR); ok = Math.abs(off) <= 1; if (ok) b.x = S - PM - PT - BR; }
        else if (side === 'T' && b.vy < 0 && b.y - BR < PM + PT && b.y > PM - 4) { off = (b.x - pos) / (PLEN / 2 + BR); ok = Math.abs(off) <= 1; if (ok) b.y = PM + PT + BR; }
        else if (side === 'B' && b.vy > 0 && b.y + BR > S - PM - PT && b.y < S - PM + 4) { off = (b.x - pos) / (PLEN / 2 + BR); ok = Math.abs(off) <= 1; if (ok) b.y = S - PM - PT - BR; }
        if (!ok) return false;
        b.sp = Math.min(820, b.sp + 24);
        const ang = off * 0.95;
        const base = { L: 0, R: Math.PI, T: Math.PI / 2, B: -Math.PI / 2 }[side];
        const a = side === 'L' || side === 'T' ? base + (side === 'L' ? ang : -ang) : base + (side === 'R' ? -ang : ang);
        b.vx = Math.cos(a) * b.sp; b.vy = Math.sin(a) * b.sp;
        G.ev.push('clack');
        return true;
      };
      for (const side of SIDES) { const id = ownerOf(side); if (id && hitPad(id, side)) break; }
      // walls / goals
      const wall = (side, cond, bounce) => { if (!cond) return; const id = ownerOf(side); if (id) { lose(side); } else { bounce(); G.ev.push('bump'); } };
      wall('L', b.x - BR < 0, () => { b.x = BR; b.vx = Math.abs(b.vx); });
      wall('R', b.x + BR > S, () => { b.x = S - BR; b.vx = -Math.abs(b.vx); });
      wall('T', b.y - BR < 0, () => { b.y = BR; b.vy = Math.abs(b.vy); });
      wall('B', b.y + BR > S, () => { b.y = S - BR; b.vy = -Math.abs(b.vy); });
    }
    api.on('t', ({ t }, from) => { if (from in G.tgt) G.tgt[from] = clamp(+t || S / 2, PLEN / 2, S - PLEN / 2); });
    let last = performance.now();
    api.interval(() => {
      const now = performance.now();
      let dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      while (dt > 0) { const s = Math.min(dt, 1 / 120); tick(s); dt -= s; }
      api.broadcast('snap', {
        b: [+G.ball.x.toFixed(1), +G.ball.y.toFixed(1)],
        p: ids.map((id) => [id, +G.pad[id].toFixed(1), G.lives[id]]),
        msg: G.serve > 0 && !G.over ? '•' : '', ev: G.ev.length ? [...new Set(G.ev)] : undefined,
      });
      G.ev = [];
    }, 33);
    api.onLeave((id) => {
      if (G.over) return;
      G.lives[id] = 0; G.out.push(id);
      if (aliveIds().length <= 1) {
        G.over = true;
        const w = aliveIds()[0];
        const ranking = [...(w ? [w] : []), ...G.out.slice().reverse().filter((i) => i !== w)].map((i) => ({ id: i, score: G.lives[i], note: 'lives' }));
        api.timeout(() => api.endGame({ title: w ? `${api.player(w).name} wins!` : 'Game over', ranking, winners: w ? [w] : [] }), 600);
      }
    });
    serve();
  }
}
