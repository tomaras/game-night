// Puck Soccer — a HaxBall-style top-down soccer game. Steer your disc, bump and kick the ball into the goal.
// Host runs the physics; everyone steers with arrows/WASD, the pointer, or the on-screen pad. Space/⚽ kicks.
import { h, trackKeys, dpad, clamp } from '../util.js';
import { drawAvatar } from '../avatar.js';

const W = 800, H = 440, GH = 74, D = 38, PAD = 46, PR = 22, BR = 12, CY = H / 2;
const TEAM = ['#e53935', '#1e88e5'];
const TNAME = ['Red', 'Blue'];
// wall segments [ax, ay, bx, by]
const SEGS = [
  [0, 0, W, 0], [0, H, W, H],
  [0, 0, 0, CY - GH], [0, CY + GH, 0, H], [W, 0, W, CY - GH], [W, CY + GH, W, H],
  [-D, CY - GH, -D, CY + GH], [-D, CY - GH, 0, CY - GH], [-D, CY + GH, 0, CY + GH],
  [W + D, CY - GH, W + D, CY + GH], [W, CY - GH, W + D, CY - GH], [W, CY + GH, W + D, CY + GH],
];

const CSS = `
.pf { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; padding:6px; min-height:0; }
.pf-hud { display:flex; align-items:center; justify-content:center; gap:10px; font:800 clamp(18px,5vw,26px) var(--font); }
.pf-hud .sc { min-width:42px; height:42px; border-radius:14px; display:grid; place-items:center; color:#fff; padding:0 8px; } .pf-hud .tm { font-variant-numeric:tabular-nums; color:var(--on2); min-width:64px; text-align:center; }
.pf-wrap { flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; position:relative; }
.pf canvas { border-radius:18px; box-shadow:var(--e2); max-width:100%; touch-action:none; }
.pf-banner { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); background:#fff; color:var(--on); box-shadow:var(--e3); border-radius:24px; padding:12px 26px; font:900 clamp(22px,7vw,34px) var(--font); text-align:center; pointer-events:none; animation:pop .3s; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const goalLimit = +api.opts.goals || 5;
  const matchSec = (+api.opts.time || 3) * 60;
  const team = {};
  ids.forEach((id, i) => (team[id] = i % 2));
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d');
  const hud = h('div.pf-hud');
  const banner = h('div.pf-banner', { style: 'display:none' });
  const wrap = h('div.pf-wrap', canvas, banner);
  const touch = dpad((k, d) => keyEvent(k, d), { actions: [{ label: '⚽', key: ' ' }] });
  api.root.append(h('style', CSS), h('div.pf', hud, wrap, touch));
  const ORG = PAD + D; // offset so the goal pockets fit
  let portrait = false;
  function layout() {
    const r = wrap.getBoundingClientRect();
    portrait = r.height > r.width * 1.05;
    const cw = W + 2 * ORG, ch = H + 2 * PAD;
    canvas.width = portrait ? ch : cw; canvas.height = portrait ? cw : ch;
  }
  function fit() {
    const r = wrap.getBoundingClientRect();
    const aspect = canvas.width / canvas.height;
    let w = r.width, hgt = w / aspect;
    if (hgt > r.height) { hgt = r.height; w = hgt * aspect; }
    canvas.style.width = Math.floor(w) + 'px'; canvas.style.height = Math.floor(hgt) + 'px';
  }
  layout(); fit();
  const ro = new ResizeObserver(() => { layout(); fit(); });
  ro.observe(wrap);
  api.cleanup(() => ro.disconnect());
  const scr = (x, y) => (portrait ? [y + PAD, x + ORG] : [x + ORG, y + PAD]);

  // ------------------------------------------------------------ client
  let snap = null;
  const vis = {}, ball = { x: W / 2, y: CY };
  let score = [0, 0], timeLeft = matchSec, flashes = {};
  api.on('snap', (s) => {
    snap = s;
    score = s.sc; timeLeft = s.t;
    for (const p of s.p) { const v = vis[p[0]] || (vis[p[0]] = { x: p[1], y: p[2] }); if (Math.abs(v.x - p[1]) + Math.abs(v.y - p[2]) > 150) { v.x = p[1]; v.y = p[2]; } if (p[5]) flashes[p[0]] = performance.now(); }
    if (Math.abs(ball.x - s.b[0]) + Math.abs(ball.y - s.b[1]) > 200) { ball.x = s.b[0]; ball.y = s.b[1]; }
    s.ev?.forEach((e) => api.sfx(e));
    renderHud();
  });
  api.on('msg', (m) => { banner.style.display = m.text ? '' : 'none'; banner.textContent = m.text || ''; if (m.sfx) api.sfx(m.sfx); });
  function renderHud() {
    const mm = Math.floor(timeLeft / 60), ss = Math.max(0, Math.floor(timeLeft % 60));
    hud.replaceChildren(h('div.sc', { style: `background:${TEAM[0]}` }, score[0]), h('div.tm', timeLeft > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : 'GOLDEN GOAL'), h('div.sc', { style: `background:${TEAM[1]}` }, score[1]));
  }
  renderHud();

  function drawPitch() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bg.addColorStop(0, '#2e7d32'); bg.addColorStop(1, '#1b5e20');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (portrait) ctx.setTransform(0, 1, 1, 0, PAD, ORG); else ctx.setTransform(1, 0, 0, 1, ORG, PAD);
    // stripes
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; ctx.fillRect((W / 10) * i, 0, W / 10, H); }
    // goal pockets
    [[-D, 0], [W, 1]].forEach(([x, t]) => { ctx.fillStyle = TEAM[t] + '44'; ctx.fillRect(x, CY - GH, D, GH * 2); });
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.strokeRect(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, CY, 70, 0, 7); ctx.stroke();
    ctx.strokeRect(0, CY - 130, 110, 260); ctx.strokeRect(W - 110, CY - 130, 110, 260);
    ctx.lineWidth = 5;
    SEGS.slice(6).forEach(([a, b, c, d], i) => { ctx.strokeStyle = TEAM[i < 3 ? 0 : 1]; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); });
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (const y of [CY - GH, CY + GH]) for (const x of [0, W]) { ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); }
  }
  function draw(now) {
    drawPitch();
    if (!snap) return;
    // shadows + ball in world space
    for (const p of snap.p) { const v = vis[p[0]]; ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(v.x + 3, v.y + 5, PR, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(ball.x + 3, ball.y + 4, BR, 0, 7); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // players
    for (const p of snap.p) {
      const id = p[0], v = vis[id], t = team[id];
      const [sx, sy] = scr(v.x, v.y);
      const fl = flashes[id] && now - flashes[id] < 180;
      ctx.beginPath(); ctx.arc(sx, sy, PR + (fl ? 5 : 0), 0, 7); ctx.fillStyle = TEAM[t]; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = fl ? '#ffeb3b' : '#fff'; ctx.stroke();
      const info = api.player(id);
      if (!drawAvatar(ctx, info.avatar, sx, sy, (PR - 3) * 2)) { ctx.beginPath(); ctx.arc(sx, sy, PR - 4, 0, 7); ctx.fillStyle = info.color || '#fff'; ctx.fill(); }
      if (id === api.me) { ctx.beginPath(); ctx.arc(sx, sy, PR + 8, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
    }
    // ball
    const [bx, by] = scr(ball.x, ball.y);
    ctx.beginPath(); ctx.arc(bx, by, BR, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#263238'; ctx.stroke();
    ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, 7); ctx.fillStyle = '#263238'; ctx.fill();
  }
  api.raf((dt, now) => {
    if (snap) {
      const k = Math.min(1, dt * 26);
      for (const p of snap.p) { const v = vis[p[0]]; v.x += (p[1] + p[3] * 0.03 - v.x) * k; v.y += (p[2] + p[4] * 0.03 - v.y) * k; }
      ball.x += (snap.b[0] + snap.b[2] * 0.03 - ball.x) * k; ball.y += (snap.b[1] + snap.b[3] * 0.03 - ball.y) * k;
    }
    draw(now);
  });

  if (window.__gnDebug) window.__pf = { vis, ball, team, me: api.me, get snap() { return snap; }, get portrait() { return portrait; } };

  // ------------------------------------------------------------ input
  const keys = trackKeys(api, () => sendInput());
  const virt = new Set();
  let pointer = null, last = '';
  function keyEvent(k, down) { if (k === ' ') { api.toHost('kick', { on: down }); return; } if (down) virt.add(k); else virt.delete(k); sendInput(); }
  function sendInput() {
    let x = 0, y = 0;
    const has = (a, b) => keys.has(a) || keys.has(b) || virt.has(a);
    if (has('ArrowLeft', 'a')) x -= 1; if (has('ArrowRight', 'd')) x += 1; if (has('ArrowUp', 'w')) y -= 1; if (has('ArrowDown', 's')) y += 1;
    if (pointer) [x, y] = pointer;
    let wx = x, wy = y;
    if (portrait && !pointer) { wx = y; wy = x; }
    const l = Math.hypot(wx, wy) || 1;
    const out = !wx && !wy ? [0, 0] : [+(wx / l).toFixed(2), +(wy / l).toFixed(2)];
    const key = out.join(',');
    if (key !== last) { last = key; api.toHost('in', { x: out[0], y: out[1] }); }
  }
  api.listen(window, 'keydown', (e) => { if ((e.key === ' ' || e.key === 'Shift') && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); if (!e.repeat) api.toHost('kick', { on: true }); } });
  api.listen(window, 'keyup', (e) => { if (e.key === ' ' || e.key === 'Shift') api.toHost('kick', { on: false }); });
  const steer = (e) => {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * canvas.width, py = ((e.clientY - r.top) / r.height) * canvas.height;
    const wx = portrait ? py - ORG : px - ORG, wy = portrait ? px - PAD : py - PAD;
    const me = vis[api.me] || { x: W / 2, y: CY };
    const dx = wx - me.x, dy = wy - me.y, d = Math.hypot(dx, dy);
    pointer = d < 14 ? [0, 0] : [dx / d, dy / d];
    sendInput();
  };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); steer(e); });
  canvas.addEventListener('pointermove', (e) => { if (pointer) steer(e); });
  const stop = () => { pointer = null; sendInput(); };
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);

  // ------------------------------------------------------------ host
  if (api.isHost) {
    const G = { p: {}, b: { x: W / 2, y: CY, vx: 0, vy: 0 }, sc: [0, 0], t: matchSec, state: 'wait', ev: [], over: false, golden: false };
    if (window.__gnDebug) window.__pfHost = G;
    const red = ids.filter((i) => team[i] === 0), blue = ids.filter((i) => team[i] === 1);
    function kickoff() {
      G.b = { x: W / 2, y: CY, vx: 0, vy: 0 };
      [red, blue].forEach((side, t) => side.forEach((id, k) => {
        const n = side.length;
        G.p[id] = { ...(G.p[id] || {}), x: t === 0 ? W / 2 - 110 - (k % 2) * 90 : W / 2 + 110 + (k % 2) * 90, y: CY + (k - (n - 1) / 2) * 90 * (n > 1 ? 1 : 0), vx: 0, vy: 0, ix: G.p[id]?.ix || 0, iy: G.p[id]?.iy || 0, kick: false, cd: 0, flash: 0 };
      }));
      G.state = 'play';
    }
    ids.forEach((id) => (G.p[id] = { x: 0, y: 0, vx: 0, vy: 0, ix: 0, iy: 0, kick: false, cd: 0, flash: 0 }));
    function collideSeg(e, r, rest, [ax, ay, bx, by]) {
      const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby;
      let t = ((e.x - ax) * abx + (e.y - ay) * aby) / l2; t = clamp(t, 0, 1);
      const cx = ax + abx * t, cy = ay + aby * t, dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
      if (d < r && d > 0.0001) {
        const nx = dx / d, ny = dy / d;
        e.x += nx * (r - d); e.y += ny * (r - d);
        const vn = e.vx * nx + e.vy * ny;
        if (vn < 0) { e.vx -= (1 + rest) * vn * nx; e.vy -= (1 + rest) * vn * ny; return -vn; }
      }
      return 0;
    }
    function tick(dt) {
      for (const id of ids) {
        const p = G.p[id];
        p.vx += p.ix * 1900 * dt; p.vy += p.iy * 1900 * dt;
        const damp = Math.exp(-6.2 * dt); p.vx *= damp; p.vy *= damp;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.cd = Math.max(0, p.cd - dt);
        p.kickT = Math.max(0, (p.kickT || 0) - dt); p.kick = !!p.hold || p.kickT > 0;
        for (const s of SEGS) collideSeg(p, PR, 0.3, s);
      }
      const b = G.b;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const bd = Math.exp(-0.75 * dt); b.vx *= bd; b.vy *= bd;
      for (const s of SEGS) { const imp = collideSeg(b, BR, 0.82, s); if (imp > 160) G.ev.push('pop'); }
      // player ↔ player
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = G.p[ids[i]], c = G.p[ids[j]];
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        if (d < PR * 2) { const nx = dx / d, ny = dy / d, ov = (PR * 2 - d) / 2; a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov; const vn = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny; if (vn > 0) { a.vx -= vn * nx * 0.9; a.vy -= vn * ny * 0.9; c.vx += vn * nx * 0.9; c.vy += vn * ny * 0.9; } }
      }
      // player ↔ ball (+ kicks)
      for (const id of ids) {
        const p = G.p[id];
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 0.01, nx = dx / d, ny = dy / d;
        if (d < PR + BR) {
          const ov = PR + BR - d; b.x += nx * ov; b.y += ny * ov;
          const rvn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
          if (rvn < 0) { b.vx -= (1 + 0.55) * rvn * nx * 0.78; b.vy -= (1 + 0.55) * rvn * ny * 0.78; }
        }
        if (p.kick && p.cd <= 0 && d < PR + BR + 9) { b.vx += nx * 640; b.vy += ny * 640; p.cd = 0.28; p.flash = 1; G.ev.push('shoot'); }
      }
      const sp = Math.hypot(b.vx, b.vy); if (sp > 1100) { b.vx *= 1100 / sp; b.vy *= 1100 / sp; }
      // goals
      if (G.state === 'play' && Math.abs(b.y - CY) < GH + 2) {
        if (b.x < -BR / 2) goal(1); else if (b.x > W + BR / 2) goal(0);
      }
    }
    function goal(t) {
      G.state = 'goal'; G.sc[t]++;
      api.broadcast('msg', { text: `⚽ GOAL for ${TNAME[t]}!`, sfx: 'win' });
      const done = G.sc[t] >= goalLimit || G.golden;
      api.timeout(() => {
        if (done) return finish();
        api.broadcast('msg', { text: '' });
        kickoff();
      }, 2200);
    }
    function finish() {
      if (G.over) return;
      G.over = true;
      const t = G.sc[0] === G.sc[1] ? -1 : G.sc[0] > G.sc[1] ? 0 : 1;
      const ranking = ids.slice().sort((a, b) => (team[a] === t ? 0 : 1) - (team[b] === t ? 0 : 1)).map((id) => ({ id, score: `${TNAME[team[id]]} ${G.sc[team[id]]}–${G.sc[1 - team[id]]}`, note: '' }));
      api.endGame({ title: t < 0 ? 'It’s a draw!' : `${TNAME[t]} team wins!`, subtitle: `${G.sc[0]} – ${G.sc[1]}`, ranking, winners: t < 0 ? [] : ids.filter((id) => team[id] === t) });
    }
    api.on('in', ({ x, y }, from) => { const p = G.p[from]; if (p) { p.ix = clamp(+x || 0, -1, 1); p.iy = clamp(+y || 0, -1, 1); } });
    api.on('kick', ({ on }, from) => { const p = G.p[from]; if (p) { p.hold = !!on; if (on) p.kickT = 0.2; } });
    let lastT = performance.now();
    api.interval(() => {
      if (G.state === 'wait' || G.over) return;
      const now = performance.now();
      let dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      if (G.state === 'play' || G.state === 'goal') { if (G.state === 'play') { G.t -= dt; if (G.t <= 0 && !G.golden) { if (G.sc[0] === G.sc[1]) { G.golden = true; api.broadcast('msg', { text: 'Golden goal!', sfx: 'ding' }); api.timeout(() => api.broadcast('msg', { text: '' }), 1500); } else return finish(); } } while (dt > 0) { const s = Math.min(dt, 1 / 120); tick(s); dt -= s; } }
      api.broadcast('snap', { p: ids.map((id) => { const p = G.p[id]; const f = p.flash; p.flash = 0; return [id, +p.x.toFixed(1), +p.y.toFixed(1), +p.vx.toFixed(0), +p.vy.toFixed(0), f]; }), b: [+G.b.x.toFixed(1), +G.b.y.toFixed(1), +G.b.vx.toFixed(0), +G.b.vy.toFixed(0)], sc: G.sc, t: Math.max(0, +G.t.toFixed(1)), ev: G.ev.length ? [...new Set(G.ev)] : undefined });
      G.ev = [];
    }, 33);
    api.onRejoin((id) => api.sendTo(id, 'msg', { text: '' }));
    api.onLeave(() => {
      const rest = ids.filter((i) => !api.player(i).left);
      if (G.over || (rest.some((i) => team[i] === 0) && rest.some((i) => team[i] === 1))) return;
      G.over = true;
      api.endGame({ title: 'A team left the pitch', ranking: rest.map((i) => ({ id: i, score: '', note: '' })), winners: rest });
    });
    api.timeout(() => kickoff(), 600);
  }
}
