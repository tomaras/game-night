// 8-Ball Pool — 2 to 4 players (2 teams). The host simulates the physics (spin, rolling, cushions, throw: see pool-physics.js) and
// streams ball positions and spin; every screen interpolates them and draws shaded, rolling balls (pool-render.js).
// The shooter aims (drag on the table), sets power and spin, and shoots. Simplified standard 8-ball rules.
import { h, canvasPoint, clamp } from '../util.js';
import { botLoop, thinkMs } from '../bots.js';
import { icon } from '../ui.js';
import { W, HT, R, MAXV, POCKETS, newBall, isMoving, strike, step } from './pool-physics.js';
import { M, CW, CH, HEAD, colorOf, paintTable, makeSprite, drawSprite, spinBy, randomOrientation } from './pool-render.js';

const groupOf = (id) => (id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solid' : 'stripe');
const STRIKE_MS = 150; // the cue swings forward this long before the balls start to move
const DELAY = 90; // screens draw the table this many ms in the past, so the motion between network packets is interpolated

const CSS = `
.pl { flex:1; display:flex; flex-direction:column; align-items:center; gap:8px; padding:8px 8px calc(8px + var(--sab)); min-height:0; background:#1b1d1f; color:#fff; }
.pl-top { display:flex; gap:8px; align-items:stretch; width:100%; max-width:1000px; justify-content:center; }
.pl-team { flex:1; min-width:0; background:#2a2d31; border-radius:var(--r); padding:6px 10px 7px; display:flex; flex-direction:column; gap:5px; box-shadow:var(--z1); position:relative; overflow:hidden; transition:background-color .25s; }
.pl-team.turn { background:#34393f; }
.pl-team.turn::after { content:''; position:absolute; left:0; right:0; bottom:0; height:3px; background:var(--m-amber); }
.pl-team .tn { font:500 13px var(--font); display:flex; gap:6px; align-items:center; min-width:0; }
.pl-team .tn .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }
.pl-team .tn .gp { font:500 10.5px var(--font); letter-spacing:.06em; text-transform:uppercase; color:rgba(255,255,255,.6); flex:none; }
.pl-tray { display:flex; gap:3px; }
.pl-mini { width:17px; height:17px; border-radius:50%; flex:none; position:relative; box-shadow:inset -2px -3px 4px rgba(0,0,0,.35), inset 2px 2px 3px rgba(255,255,255,.35); }
.pl-mini.slot { background:rgba(255,255,255,.08); box-shadow:inset 0 1px 2px rgba(0,0,0,.6); }
.pl-mini.gone { opacity:.18; filter:grayscale(.6); }
.pl-mini i { position:absolute; left:50%; top:50%; width:8px; height:8px; margin:-4px 0 0 -4px; border-radius:50%; background:#fff; }
.pl-wrap { flex:1 1 0; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.pl canvas { touch-action:none; cursor:crosshair; max-width:100%; filter:drop-shadow(0 14px 22px rgba(0,0,0,.55)); }
.pl-msg { font:500 14px var(--font); min-height:20px; text-align:center; color:rgba(255,255,255,.85); }
.pl-bar { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:12px; width:100%; max-width:760px; background:#2a2d31; box-shadow:var(--z2); border-radius:var(--r); padding:8px 10px; }
.pl-spin { width:52px; height:52px; border-radius:50%; background:radial-gradient(circle at 35% 30%, #fff, #e9e9e9 55%, #b8b8b8); box-shadow:inset -3px -4px 8px rgba(0,0,0,.25), 0 2px 4px rgba(0,0,0,.5); position:relative; touch-action:none; cursor:pointer; }
.pl-spin::before, .pl-spin::after { content:''; position:absolute; background:rgba(0,0,0,.14); } .pl-spin::before { left:50%; top:10%; bottom:10%; width:1px; } .pl-spin::after { top:50%; left:10%; right:10%; height:1px; }
.pl-spin i { position:absolute; width:13px; height:13px; margin:-6.5px 0 0 -6.5px; border-radius:50%; background:#e53935; box-shadow:0 1px 3px rgba(0,0,0,.5); left:50%; top:50%; }
/* the power control: pull the cue back along the track and let go */
.pl-pull { position:relative; height:52px; border-radius:26px; background:#16181a; box-shadow:inset 0 2px 6px rgba(0,0,0,.7); touch-action:none; cursor:grab; overflow:hidden; user-select:none; -webkit-user-select:none; }
.pl-pull.on { cursor:grabbing; }
.pl-pull .fill { position:absolute; left:0; top:0; bottom:0; width:0; background:linear-gradient(90deg,#43a047,#fdd835 55%,#e53935); opacity:.85; }
.pl-pull .stick { position:absolute; top:50%; height:12px; margin-top:-6px; left:-40px; right:46px; border-radius:6px; transform:translateX(var(--pull, 0px)); transition:transform .25s var(--std);
  background:linear-gradient(270deg, #4aa3e8 0 3px, #f6f1e4 3px 14px, #e5cfa0 14px 52%, #c9cdd1 52% calc(52% + 4px), #1c1c1c calc(52% + 4px) 74%, #2c2c2c 74% 96%, #111 96%); box-shadow:inset 0 -4px 5px rgba(0,0,0,.35), inset 0 2px 2px rgba(255,255,255,.35), 0 2px 3px rgba(0,0,0,.5); }
.pl-pull.on .stick { transition:none; }
.pl-pull::after { content:''; position:absolute; right:12px; top:50%; width:26px; height:26px; margin-top:-13px; border-radius:50%; background:radial-gradient(circle at 35% 30%, #fff, #e6e6e6 55%, #a9a9a9); box-shadow:0 2px 4px rgba(0,0,0,.6); }
.pl-pull .lbl { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); padding:3px 10px; border-radius:999px; background:rgba(0,0,0,.6); font:500 11px var(--font); letter-spacing:.08em; text-transform:uppercase; color:rgba(255,255,255,.8); pointer-events:none; white-space:nowrap; }
.pl-pull.on .lbl { color:#fff; font-size:15px; }
.pl-fine { display:grid; grid-template-columns:40px 40px; grid-template-rows:auto auto; gap:4px; }
.pl-fine button { position:relative; width:40px; height:24px; border-radius:var(--r); border:0; background:#3a3f45; color:#fff; display:grid; place-items:center; cursor:pointer; touch-action:manipulation; }
.pl-fine button.g { grid-column:1 / -1; width:auto; font:500 10.5px var(--font); letter-spacing:.06em; text-transform:uppercase; color:rgba(255,255,255,.75); }
.pl-fine .ic { width:20px; height:20px; }
.pl-lbl { font:500 10px var(--font); color:rgba(255,255,255,.5); text-transform:uppercase; letter-spacing:.06em; text-align:center; margin-top:2px; }
`;
export function start(api) {
  const ids = api.players.map((p) => p.id);
  const teams = [[], []];
  ids.forEach((id, i) => teams[i % 2].push(id));
  const teamOf = (id) => (teams[0].includes(id) ? 0 : 1);

  // ------------------------------------------------------------ shared client state
  const S = { balls: [], turn: ids[0], shooter: ids[0], team: 0, groups: [null, null], inHand: false, phase: 'aim', msg: '', pocketed: [[], []], over: false };
  const live = []; // for rendering: {id, x, y, s: [network samples], vx, vy, wx, wy, wz, in, m: orientation, sp: sprite, dirty, drop}
  const byId = new Map();
  const aimNow = { a: 0 };
  let power = 0.55, lastPower = 0.55;
  let spin = { x: 0, y: 0 }; // where on the cue ball you strike: y>0 follow (top), y<0 draw (back), x = side
  let guide = (() => { try { return localStorage.getItem('gn.pool.guide') || 'long'; } catch { return 'long'; } })();
  const remote = { a: 0, p: 0, t: 0 };
  let stroke = null; // the cue swinging into the ball

  const canvas = h('canvas', { width: CW, height: CH });
  const ctx = canvas.getContext('2d');
  const msgEl = h('div.pl-msg');
  const teamEls = [h('div.pl-team'), h('div.pl-team')];
  const pullFill = h('div.fill'), pullStick = h('div.stick'), pullLbl = h('div.lbl', 'Pull back to shoot');
  const pullEl = h('div.pl-pull', { role: 'slider', 'aria-label': 'Shot power: pull back and let go', 'aria-valuemin': 0, 'aria-valuemax': 100 }, pullFill, pullStick, pullLbl);
  const spinEl = h('div.pl-spin', { title: 'Spin: top follows, bottom draws, sides curve off cushions' }, h('i'));
  const setSpin = (e) => {
    const r = spinEl.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width - 0.5) * 2, y = -((e.clientY - r.top) / r.height - 0.5) * 2;
    const m = Math.hypot(x, y); if (m > 0.85) { x *= 0.85 / m; y *= 0.85 / m; }
    spin = { x, y }; spinEl.firstChild.style.left = 50 + x * 50 + '%'; spinEl.firstChild.style.top = 50 - y * 50 + '%';
  };
  spinEl.addEventListener('pointerdown', (e) => { spinEl.setPointerCapture(e.pointerId); setSpin(e); });
  spinEl.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure) setSpin(e); });
  spinEl.addEventListener('dblclick', () => { spin = { x: 0, y: 0 }; spinEl.firstChild.style.left = '50%'; spinEl.firstChild.style.top = '50%'; });
  const nudge = (dir) => { const go = () => { aimNow.a += dir * 0.0025; sendAim(); }; go(); const t = setInterval(go, 60); const stop = () => { clearInterval(t); removeEventListener('pointerup', stop); }; addEventListener('pointerup', stop); };
  const guideBtn = h('button.g', { 'aria-label': 'Aim guide', onclick: () => { guide = guide === 'long' ? 'short' : guide === 'short' ? 'off' : 'long'; try { localStorage.setItem('gn.pool.guide', guide); } catch { /* */ } guideBtn.textContent = 'Guide ' + guide; } }, 'Guide ' + guide);
  const fine = h('div.pl-fine', h('button', { 'aria-label': 'Aim a little left', onpointerdown: () => nudge(-1) }, icon('chevron_left')), h('button', { 'aria-label': 'Aim a little right', onpointerdown: () => nudge(1) }, icon('chevron_right')), guideBtn);
  const bar = h('div.pl-bar', h('div', spinEl), pullEl, fine);
  // pull back and let go: the distance you pull is the power; letting go near the start cancels
  let pulling = null;
  const pullTo = (e) => {
    const r = pullEl.getBoundingClientRect();
    const d = clamp((pulling.x0 - e.clientX) / (r.width * 0.78), 0, 1);
    power = d;
    pullFill.style.width = d * 100 + '%';
    pullEl.style.setProperty('--pull', -d * (r.width * 0.55) + 'px');
    pullLbl.textContent = d < 0.03 ? 'Pull back to shoot' : Math.round(d * 100) + '%';
    pullEl.setAttribute('aria-valuenow', Math.round(d * 100));
    sendAim();
  };
  pullEl.addEventListener('pointerdown', (e) => { if (!myTurn()) return; e.preventDefault(); pullEl.setPointerCapture(e.pointerId); pulling = { x0: e.clientX }; pullEl.classList.add('on'); power = 0; pullTo(e); });
  pullEl.addEventListener('pointermove', (e) => { if (pulling) pullTo(e); });
  const release = () => {
    if (!pulling) return;
    pulling = null; pullEl.classList.remove('on');
    pullFill.style.width = '0'; pullEl.style.setProperty('--pull', '0px'); pullLbl.textContent = 'Pull back to shoot';
    if (power >= 0.03 && myTurn()) { lastPower = power; shoot(); } else { power = lastPower; sendAim(); }
  };
  pullEl.addEventListener('pointerup', release); pullEl.addEventListener('pointercancel', release);
  const wrap = h('div.pl-wrap', canvas);
  api.root.append(h('style', CSS), h('div.pl', h('div.pl-top', teamEls), msgEl, wrap, bar));

  // On tall (phone) screens the table is drawn rotated 90° so it fills the screen. The canvas is drawn at device resolution.
  let portrait = false, K = 1, bg = null, light = [0, 0, 1], spriteK = 0;
  const layout = () => {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const p = r.height > r.width * 1.05;
    const bw = p ? CH : CW, bh = p ? CW : CH, asp = bw / bh;
    let w = r.width, hh = w / asp;
    if (hh > r.height) { hh = r.height; w = hh * asp; }
    canvas.style.width = Math.floor(w) + 'px'; canvas.style.height = Math.floor(hh) + 'px';
    const k = clamp((window.devicePixelRatio || 1) * (w / bw), 1, 2.4);
    if (!bg || p !== portrait || Math.abs(k - K) / K > 0.06) {
      portrait = p; K = k;
      canvas.width = Math.round(bw * K); canvas.height = Math.round(bh * K);
      bg = paintTable(K);
      // the light comes from the top left of the screen, whichever way the table is turned
      const sx = -0.5, sy = -0.6, sz = 0.62, l = Math.hypot(sx, sy, sz);
      light = portrait ? [sy / l, -sx / l, sz / l] : [sx / l, sy / l, sz / l];
      spriteK = K; for (const b of live) { b.sp = makeSprite(spriteK); b.dirty = true; }
    }
  };
  const ro = new ResizeObserver(layout);
  ro.observe(wrap);
  layout();
  api.cleanup(() => ro.disconnect());

  const cueBall = () => byId.get(0);
  const myTurn = () => S.shooter === api.me && S.phase === 'aim' && !S.over;

  // ------------------------------------------------------------ rendering
  const ease = (u) => 1 - Math.pow(1 - u, 3);
  // where a ball is drawn right now: interpolated between the network samples (Hermite, using the streamed velocities)
  function place(b, rt) {
    const s = b.s;
    if (!s.length) { b.rx = b.x; b.ry = b.y; return; }
    while (s.length > 2 && s[1].t <= rt) s.shift();
    const a = s[0], c = s[1];
    if (!c || rt >= (c ? c.t : 0)) {
      const e = c || a, dt = clamp((rt - e.t) / 1000, 0, 0.07);
      b.rx = e.x + e.vx * dt; b.ry = e.y + e.vy * dt; b.cur = e; return;
    }
    if (rt <= a.t) { b.rx = a.x; b.ry = a.y; b.cur = a; return; }
    const D = (c.t - a.t) / 1000, u = (rt - a.t) / (c.t - a.t), u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    b.rx = h00 * a.x + h10 * D * a.vx + h01 * c.x + h11 * D * c.vx;
    b.ry = h00 * a.y + h10 * D * a.vy + h01 * c.y + h11 * D * c.vy;
    b.cur = u < 0.5 ? a : c;
  }
  function raycast(c, dx, dy) {
    let best = { t: 1e9, ball: null };
    for (const b of live) {
      if (b.id === 0 || b.in) continue;
      const fx = c.rx - b.rx, fy = c.ry - b.ry;
      const B = fx * dx + fy * dy, C = fx * fx + fy * fy - 4 * R * R;
      const disc = B * B - C;
      if (disc >= 0) { const t = -B - Math.sqrt(disc); if (t > 0 && t < best.t) best = { t, ball: b }; }
    }
    const rails = [];
    if (dx < 0) rails.push((R - c.rx) / dx); if (dx > 0) rails.push((W - R - c.rx) / dx);
    if (dy < 0) rails.push((R - c.ry) / dy); if (dy > 0) rails.push((HT - R - c.ry) / dy);
    for (const t of rails) if (t > 0 && t < best.t) best = { t, ball: null };
    return best;
  }
  // The cue, drawn as a real two-piece stick: blue-chalked tip, ivory ferrule, maple shaft, steel joint, ebony forearm with
  // inlaid points, a linen wrap, and a butt sleeve with rings; cylinder shading across it and a soft shadow on the cloth.
  const CUE_L = 560, TIP = 3.3, BUTT = 8.6;
  const cueW = (u) => TIP + (BUTT - TIP) * Math.pow(u, 0.9); // radius at fraction u from the tip
  function drawCue(cx, cy, a, back, alpha) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.globalAlpha = alpha;
    const x0 = -back, L = CUE_L;
    const X = (u) => x0 - u * L;
    const body = (u0, u1) => { ctx.beginPath(); ctx.moveTo(X(u0), -cueW(u0)); ctx.lineTo(X(u1), -cueW(u1)); ctx.lineTo(X(u1), cueW(u1)); ctx.lineTo(X(u0), cueW(u0)); ctx.closePath(); };
    // shadow on the cloth, thrown away from the light
    ctx.save(); ctx.translate(-light[0] * 7 * Math.cos(a) - light[1] * 7 * Math.sin(a), light[0] * 7 * Math.sin(a) - light[1] * 7 * Math.cos(a));
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.filter = 'blur(3px)'; body(0, 1); ctx.fill(); ctx.filter = 'none'; ctx.restore();
    const part = (u0, u1, fill) => { ctx.fillStyle = fill; body(u0, u1); ctx.fill(); };
    part(0, 0.004, '#3d8fd6'); // tip
    part(0.004, 0.022, '#f3eee0'); // ferrule
    const maple = ctx.createLinearGradient(X(0.022), 0, X(0.5), 0); maple.addColorStop(0, '#efdcb0'); maple.addColorStop(1, '#d9b67a');
    part(0.022, 0.5, maple); // shaft
    part(0.5, 0.508, '#cfd4d8'); // joint collar
    part(0.508, 0.72, '#1d1612'); // ebony forearm
    // inlaid points (four long ivory diamonds pointing at the tip; two show from above)
    ctx.fillStyle = '#ece3cf';
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(X(0.53), sgn * cueW(0.53) * 0.12); ctx.lineTo(X(0.65), sgn * cueW(0.65) * 0.75); ctx.lineTo(X(0.705), sgn * cueW(0.705) * 0.12); ctx.closePath(); ctx.fill(); }
    part(0.716, 0.722, '#cfd4d8');
    part(0.722, 0.9, '#2b2a2a'); // wrap
    ctx.save(); body(0.722, 0.9); ctx.clip(); ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 0.8;
    for (let u = 0.725; u < 0.9; u += 0.006) { ctx.beginPath(); ctx.moveTo(X(u), -BUTT); ctx.lineTo(X(u) - 3, BUTT); ctx.stroke(); } ctx.restore();
    part(0.9, 0.905, '#cfd4d8'); part(0.905, 0.99, '#1d1612'); part(0.94, 0.944, '#cfd4d8'); part(0.99, 1, '#0b0b0b');
    // the cylinder: lit along the top edge, shadowed underneath
    ctx.save(); body(0, 1); ctx.clip();
    const cyl = ctx.createLinearGradient(0, -BUTT, 0, BUTT);
    cyl.addColorStop(0, 'rgba(0,0,0,.25)'); cyl.addColorStop(0.3, 'rgba(255,255,255,.35)'); cyl.addColorStop(0.42, 'rgba(255,255,255,.08)'); cyl.addColorStop(0.75, 'rgba(0,0,0,.22)'); cyl.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = cyl; ctx.fillRect(X(1), -BUTT, L + 4, BUTT * 2);
    ctx.restore();
    ctx.restore();
  }
  function draw(dt, now) {
    if (!bg) { layout(); if (!bg) return; }
    const rt = now - DELAY;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(K, 0, 0, K, 0, 0);
    if (portrait) { ctx.translate(CH, 0); ctx.rotate(Math.PI / 2); }
    ctx.drawImage(bg, 0, 0, CW, CH);
    ctx.save(); ctx.translate(M, M);
    ctx.beginPath(); ctx.rect(-14, -14, W + 28, HT + 28); ctx.clip();
    for (const b of live) place(b, rt);
    // roll the balls
    for (const b of live) {
      if (b.in) continue;
      const c = b.cur;
      if (S.phase === 'sim' && c && (c.wx || c.wy || c.wz)) { if (spinBy(b.m, c.wx, c.wy, c.wz, dt)) b.dirty = true; }
    }
    const cue = cueBall();
    const mine = myTurn();
    const showRemote = !mine && S.phase === 'aim' && now - remote.t < 1500 && cue && !cue.in;
    let stick = null;
    if (cue && !cue.in && S.phase === 'aim' && (mine || showRemote)) {
      const a = mine ? aimNow.a : remote.a;
      const dx = Math.cos(a), dy = Math.sin(a);
      stick = { a, pw: mine ? (pulling ? power : 0.04) : remote.p };
      if (guide !== 'off' || !mine) {
        const hit = raycast(cue, dx, dy);
        const reach = guide === 'short' && mine ? Math.min(hit.t, 260) : hit.t;
        const ex = cue.rx + dx * reach, ey = cue.ry + dy * reach;
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(cue.rx + dx * R, cue.ry + dy * R); ctx.lineTo(ex - dx * R, ey - dy * R); ctx.stroke();
        if (reach === hit.t) {
          ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(ex, ey, R, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex, ey, R, 0, 7); ctx.stroke();
          if (hit.ball) {
            const nx = hit.ball.rx - ex, ny = hit.ball.ry - ey, nl = Math.hypot(nx, ny) || 1;
            const ox = hit.ball.rx + (nx / nl) * R, oy = hit.ball.ry + (ny / nl) * R, ol = 70 + 90 * Math.max(0, (dx * nx + dy * ny) / nl);
            ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + (nx / nl) * ol, oy + (ny / nl) * ol); ctx.stroke();
            const ux = nx / nl, uy = ny / nl, dot = dx * ux + dy * uy;
            let tx = dx - dot * ux, ty = dy - dot * uy; const tl = Math.hypot(tx, ty);
            if (tl > 0.05) { tx /= tl; ty /= tl; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + tx * 60 * tl, ey + ty * 60 * tl); ctx.stroke(); }
          }
        }
      }
    }
    // soft shadows first (a wide one thrown away from the light, and a tight dark one under the ball), so they never cover a neighbour
    const sdx = -light[0] * 5, sdy = -light[1] * 5;
    for (const b of live) {
      if (b.in && !b.drop) continue;
      const k = b.drop ? 1 - ease(clamp((now - b.drop.t0) / 340, 0, 1)) * 0.6 : 1;
      const x = b.drop ? b.drop.x : b.rx, y = b.drop ? b.drop.y : b.ry;
      const sg = ctx.createRadialGradient(x + sdx, y + sdy, 1, x + sdx, y + sdy, R * 1.5 * k);
      sg.addColorStop(0, 'rgba(0,0,0,.44)'); sg.addColorStop(0.55, 'rgba(0,0,0,.2)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x + sdx, y + sdy, R * 1.5 * k, 0, 7); ctx.fill();
    }
    for (const b of live) {
      if (b.in || !b.sp) continue;
      if (b.dirty || !b.img) { b.img = drawSprite(b.sp, b.id, b.m, light); b.dirty = false; }
      const sz = b.sp.S / spriteK;
      ctx.drawImage(b.img, b.rx - sz / 2, b.ry - sz / 2, sz, sz);
    }
    // a ball dropping into a pocket: slides into the hole, shrinks and fades
    for (const b of live) {
      if (!b.drop) continue;
      const u = clamp((now - b.drop.t0) / 340, 0, 1);
      if (u >= 1) { b.drop = null; continue; }
      const e = ease(u), p = POCKETS[b.drop.pk];
      const x = b.drop.x + (p.x - b.drop.x) * e, y = b.drop.y + (p.y - b.drop.y) * e, sc = 1 - e * 0.55;
      if (!b.img) continue;
      const sz = (b.sp.S / spriteK) * sc;
      ctx.save(); ctx.globalAlpha = 1 - e * e; ctx.drawImage(b.img, x - sz / 2, y - sz / 2, sz, sz); ctx.restore();
      ctx.fillStyle = `rgba(0,0,0,${0.5 * e})`; ctx.beginPath(); ctx.arc(x, y, R * sc, 0, 7); ctx.fill();
    }
    ctx.restore();
    // the cue lies over the rails, so it's drawn outside the cloth's clip
    ctx.save(); ctx.translate(M, M);
    // the cue: aiming (with a slow breath), or swinging into the ball
    if (stroke) {
      const t = now - stroke.t0, back0 = R + 6 + stroke.p * 130;
      if (t >= STRIKE_MS && !stroke.hit) { stroke.hit = true; api.sfx('cue', stroke.p); }
      let back, alpha = 1;
      if (t < STRIKE_MS) { const u = t / STRIKE_MS; back = back0 + (R + 0.5 - back0) * (u * u * (3 - 2 * u * 0.4)); } else { back = R + 0.5 - (t - STRIKE_MS) * 0.014; alpha = clamp(1 - (t - STRIKE_MS - 90) / 260, 0, 1); }
      if (t > STRIKE_MS + 360) stroke = null; else if (cue) drawCue(stroke.x, stroke.y, stroke.a, back, alpha);
    } else if (stick && cue) {
      drawCue(cue.rx, cue.ry, stick.a, R + 6 + stick.pw * 130 + (mine && !pulling ? Math.sin(now / 300) * 1.4 : 0), 1);
    }
    if (mine && S.inHand && cue) {
      ctx.strokeStyle = '#ffc857'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(cue.rx, cue.ry, R + 7, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  api.raf((dt, now) => draw(dt, now));

  const miniBall = (id, gone) => {
    const col = colorOf(id), stripe = id > 8;
    return h('span.pl-mini' + (gone ? '.gone' : ''), { style: { background: stripe ? `linear-gradient(#f6f3ea 27%, ${col} 27% 73%, #f6f3ea 73%)` : col } }, id === 8 ? null : h('i'));
  };
  const GROUP = { solid: [1, 2, 3, 4, 5, 6, 7], stripe: [9, 10, 11, 12, 13, 14, 15] };
  function renderHud() {
    for (let t = 0; t < 2; t++) {
      const g = S.groups[t];
      const potted = new Set(S.pocketed[t]);
      const tray = g ? [...GROUP[g].map((id) => miniBall(id, potted.has(id))), GROUP[g].every((id) => potted.has(id)) ? miniBall(8, false) : null] : Array.from({ length: 7 }, () => h('span.pl-mini.slot'));
      teamEls[t].classList.toggle('turn', S.team === t && !S.over);
      teamEls[t].replaceChildren(
        h('div.tn', h('span.nm', teams[t].map((id) => (api.player(id)?.name || '?') + (id === api.me ? ' (you)' : '')).join(' & ')), h('span.gp', g ? (g === 'solid' ? 'Solids' : 'Stripes') : '')),
        h('div.pl-tray', tray)
      );
    }
    const sh = api.player(S.shooter);
    msgEl.textContent = S.over ? S.msg : S.phase === 'sim' ? '' : (S.shooter === api.me ? (S.inHand ? 'Ball in hand — drag the cue ball' : 'Your shot') : `${sh?.name || '?'} is shooting…`) + (S.msg ? '  ' + S.msg : '');
    bar.style.visibility = myTurn() ? '' : 'hidden';
  }

  // ------------------------------------------------------------ input
  let dragCue = false;
  function tablePt(ev) {
    const p = canvasPoint(canvas, ev); // canvas pixels
    const px = p.x / K, py = p.y / K;
    const lx = portrait ? py : px, ly = portrait ? CH - px : py;
    return { x: lx - M, y: ly - M };
  }
  let lastAimSent = 0;
  function sendAim() {
    const now = performance.now();
    if (now - lastAimSent < 90) return;
    lastAimSent = now;
    api.toHost('aim', { a: aimNow.a, p: pulling ? power : 0.04 });
  }
  function setAimFrom(pt) {
    const cue = cueBall();
    if (!cue) return;
    aimNow.a = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    sendAim();
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!myTurn()) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const pt = tablePt(e);
    const cue = cueBall();
    if (S.inHand && cue && Math.hypot(pt.x - cue.x, pt.y - cue.y) < R * 3) { dragCue = true; return; }
    setAimFrom(pt);
    canvas.dataset.aiming = '1';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!myTurn()) return;
    const pt = tablePt(e);
    if (dragCue) {
      const cue = cueBall();
      const x = clamp(pt.x, R, W - R), y = clamp(pt.y, R, HT - R);
      if (!live.some((b) => b.id !== 0 && !b.in && Math.hypot(b.x - x, b.y - y) < R * 2.05)) { cue.x = x; cue.y = y; }
      return;
    }
    if (canvas.dataset.aiming === '1' || e.pointerType === 'mouse') setAimFrom(pt);
  });
  const up = () => { dragCue = false; canvas.dataset.aiming = ''; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  api.listen(window, 'keydown', (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if ((e.key === ' ' || e.key === 'Enter') && myTurn()) { e.preventDefault(); shoot(); }
    if (e.key === 'ArrowUp' && myTurn()) { power = lastPower = clamp(power + 0.05, 0.08, 1); sendAim(); api.toast('Power ' + Math.round(power * 100) + '%'); }
    if (e.key === 'ArrowDown' && myTurn()) { power = lastPower = clamp(power - 0.05, 0.08, 1); sendAim(); api.toast('Power ' + Math.round(power * 100) + '%'); }
    if (e.key === 'ArrowLeft' && myTurn()) { aimNow.a -= e.shiftKey ? 0.002 : 0.01; sendAim(); }
    if (e.key === 'ArrowRight' && myTurn()) { aimNow.a += e.shiftKey ? 0.002 : 0.01; sendAim(); }
  });
  function shoot() {
    if (!myTurn()) return;
    const cue = cueBall();
    api.toHost('shot', { a: aimNow.a, p: power, sx: +spin.x.toFixed(2), sy: +spin.y.toFixed(2), cx: S.inHand ? cue.x : undefined, cy: S.inHand ? cue.y : undefined });
    S.phase = 'sim';
    renderHud();
  }

  // ------------------------------------------------------------ message handlers (all clients)
  function applyBalls(arr) {
    const seen = new Set();
    for (const [id, x, y, inn] of arr) {
      let b = byId.get(id);
      if (!b) { b = { id, x, y, rx: x, ry: y, s: [], vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, in: false, m: randomOrientation(id), sp: makeSprite(spriteK || K), dirty: true, img: null, drop: null, cur: null }; byId.set(id, b); live.push(b); }
      b.x = x; b.y = y; b.rx = x; b.ry = y; b.s.length = 0; b.cur = null; b.in = !!inn; if (!inn) b.drop = null;
      seen.add(id);
    }
    for (let i = live.length - 1; i >= 0; i--) if (!seen.has(live[i].id)) { byId.delete(live[i].id); live.splice(i, 1); }
  }
  api.on('st', (s) => {
    const prevPhase = S.phase;
    Object.assign(S, s);
    applyBalls(s.balls);
    if (S.shooter === api.me && prevPhase !== 'aim' && S.phase === 'aim') api.sfx('turn');
    const cue = cueBall();
    if (cue && S.phase === 'aim' && S.shooter === api.me && s.balls) aimNow.a = Math.atan2(HT / 2 - cue.y, W * 0.7 - cue.x); // default aim: toward the rack
    renderHud();
  });
  let off = null; // host clock -> this device's clock
  let sounds = 0;
  api.on('fr', (f) => {
    const now = performance.now();
    S.phase = 'sim';
    const o = now - f.t; off = off === null || o < off ? o : off + (o - off) * 0.02;
    const t = f.t + off;
    for (const [id, x, y, vx, vy, wx, wy, wz] of f.b) {
      const b = byId.get(id);
      if (b) { b.x = x; b.y = y; b.s.push({ t, x, y, vx, vy, wx, wy, wz }); if (b.s.length > 8) b.s.shift(); }
    }
    for (const [id, pk] of f.out || []) { const b = byId.get(id); if (b && !b.in) { b.in = true; b.drop = { t0: now + DELAY * 0.5, pk, x: b.rx, y: b.ry }; } }
    sounds = 0;
    for (const [k, v] of f.ev || []) { if (sounds++ > 4) break; if (k === 'b') api.sfx('ball', v); else if (k === 'r') api.sfx('rail', v); else if (k === 'p') api.sfx('pocket'); }
  });
  api.on('strike', (a) => {
    const cue = cueBall();
    if (cue) stroke = { t0: performance.now(), a: a.a, p: a.p, x: cue.x, y: cue.y, hit: false };
  });
  api.on('aimr', (a) => { remote.a = a.a; remote.p = a.p; remote.t = performance.now(); });
  api.onPlayersChanged(() => renderHud());

  // ------------------------------------------------------------ host: physics + rules
  if (api.isHost) {
    const rng = api.rng;
    let balls = [];
    const H = { team: 0, ptr: [0, 0], groups: [null, null], pocketed: [[], []], phase: 'aim', inHand: false, isBreak: true, msg: '', timer: 0, over: false };
    const shooterId = () => teams[H.team][H.ptr[H.team] % teams[H.team].length];

    function rack() {
      balls = [newBall(0, HEAD.x, HT / 2)];
      const order = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
      const layout = []; // 15 slots
      const fx = W * 0.72, dx = R * 2 * 0.87 + 0.5;
      for (let c = 0; c < 5; c++) for (let r = 0; r <= c; r++) layout.push({ x: fx + c * dx, y: HT / 2 + (r - c / 2) * (R * 2 + 0.6) });
      // slot 4 (row 2 middle) = eight; back corners get one solid and one stripe
      const eightSlot = 4;
      const corner1 = 10, corner2 = 14;
      const solids = order.filter((i) => i < 8), stripes = order.filter((i) => i > 8);
      const assign = {};
      assign[eightSlot] = 8;
      assign[corner1] = solids.pop(); assign[corner2] = stripes.pop();
      const pool = rng.shuffle([...solids, ...stripes]);
      layout.forEach((p, i) => { balls.push(newBall(assign[i] ?? pool.pop(), p.x, p.y)); });
    }
    const snapBalls = () => balls.map((b) => [b.id, +b.x.toFixed(1), +b.y.toFixed(1), b.in ? 1 : 0]);
    const snapState = () => ({ balls: snapBalls(), turn: shooterId(), shooter: shooterId(), team: H.team, groups: H.groups, inHand: H.inHand, phase: H.phase, msg: H.msg, pocketed: H.pocketed, over: H.over });
    const publish = (to) => (to ? api.sendTo(to, 'st', snapState()) : api.broadcast('st', snapState()));

    // --- physics (see pool-physics.js)
    let ev = [], first = null, shotPocketed = [], out = [];
    const onHit = (kind, v) => { if (ev.length < 12) ev.push([kind, +v.toFixed(2)]); };
    const onFirst = (other) => { if (first === null) first = other; };
    const onPocket = (b, k) => { shotPocketed.push(b.id); out.push([b.id, k]); };
    const moving = () => balls.some(isMoving);
    let acc = 0, last = 0, lastSend = 0;
    function loop() {
      const now = performance.now();
      acc = Math.min(0.1, acc + (now - last) / 1000);
      last = now;
      const dt = 1 / 240;
      while (acc >= dt) { step(balls, dt, onHit, onFirst, onPocket); acc -= dt; }
      if (now - lastSend > 33) {
        lastSend = now;
        const msg = { t: now, b: balls.filter((b) => !b.in).map((b) => [b.id, +b.x.toFixed(1), +b.y.toFixed(1), +b.vx.toFixed(0), +b.vy.toFixed(0), +b.wx.toFixed(1), +b.wy.toFixed(1), +b.wz.toFixed(1)]), out, ev };
        out = []; ev = [];
        api.broadcast('fr', msg);
      }
      if (!moving()) { clearInterval(H.timer); H.timer = 0; resolve(); }
    }

    function remaining(team) { const g = H.groups[team]; if (!g) return 99; return balls.filter((b) => !b.in && groupOf(b.id) === g).length; }
    function endGame(winTeam, why) {
      H.over = true; H.msg = why;
      publish();
      api.save({ balls: snapBalls(), team: H.team, ptr: H.ptr, groups: H.groups, pocketed: H.pocketed, inHand: false, isBreak: false, msg: why }, { turn: null, over: true, summary: `${teams[winTeam].map((id) => api.player(id).name).join(' & ')} won — ${why}`, moves: 0 });
      const win = teams[winTeam], lose = teams[1 - winTeam];
      api.timeout(() => api.endGame({ title: `${win.map((id) => api.player(id).name).join(' & ')} win${win.length > 1 ? '' : 's'}!`, subtitle: why, ranking: [...win, ...lose].map((id, i) => ({ id, score: win.includes(id) ? 'win' : 'loss' })), winners: win }), 1800);
    }
    function respot8() { const e = balls.find((b) => b.id === 8); e.in = false; e.x = W * 0.72; e.y = HT / 2; e.vx = e.vy = 0; }

    function resolve() {
      const team = H.team;
      const poc = shotPocketed.slice();
      const cueIn = poc.includes(0), eightIn = poc.includes(8);
      const ballsPocketed = poc.filter((id) => id !== 0 && id !== 8);
      const myGroupBefore = H.groups[team];
      // remaining of own group BEFORE this shot = remaining now + pocketed own this shot
      const ownLeftBefore = myGroupBefore ? remaining(team) + ballsPocketed.filter((id) => groupOf(id) === myGroupBefore).length : 99;
      let foul = false, why = '';
      if (first === null) { foul = true; why = 'No ball was hit.'; }
      else if (myGroupBefore) {
        const target = ownLeftBefore === 0 ? 'eight' : myGroupBefore;
        if (groupOf(first) !== target) { foul = true; why = ownLeftBefore === 0 ? 'Must hit the 8-ball first.' : 'Wrong ball hit first.'; }
      } else if (first === 8 && !H.isBreak) { foul = true; why = 'Hit the 8-ball first on an open table.'; }
      if (cueIn) { foul = true; why = 'Scratch!'; }
      if (eightIn) {
        if (H.isBreak) { respot8(); H.msg = '8-ball re-spotted.'; }
        else {
          const cleared = myGroupBefore && ownLeftBefore === 0;
          if (cleared && !foul) return endGame(team, 'Sank the 8-ball!');
          return endGame(1 - team, cleared ? 'Fouled on the 8-ball.' : 'Sank the 8-ball too early.');
        }
      }
      // assign groups on open table
      if (!H.groups[team] && !foul && ballsPocketed.length) {
        const g = groupOf(ballsPocketed[0]);
        H.groups[team] = g; H.groups[1 - team] = g === 'solid' ? 'stripe' : 'solid';
      }
      for (const id of poc) if (id !== 0 && id !== 8) { const t = H.groups[0] === groupOf(id) ? 0 : H.groups[1] === groupOf(id) ? 1 : team; H.pocketed[t].push(id); }
      const pocketedOwn = !foul && ballsPocketed.some((id) => groupOf(id) === H.groups[team]);
      H.isBreak = false;
      if (cueIn) { const c = balls.find((b) => b.id === 0); c.in = false; c.x = HEAD.x; c.y = HT / 2; c.vx = c.vy = c.wx = c.wy = c.wz = 0; }
      if (foul) {
        H.team = 1 - team; H.ptr[H.team]++; H.inHand = true; H.msg = `Foul: ${why} Ball in hand.`;
      } else if (pocketedOwn) {
        H.msg = 'Nice shot — shoot again!';
        H.inHand = false;
      } else {
        H.team = 1 - team; H.ptr[H.team]++; H.inHand = false; H.msg = '';
      }
      // skip departed shooters
      for (let k = 0; k < 8 && api.player(shooterId())?.left; k++) H.ptr[H.team]++;
      H.phase = 'aim';
      publish();
      api.save({ balls: snapBalls(), team: H.team, ptr: H.ptr, groups: H.groups, pocketed: H.pocketed, inHand: H.inHand, isBreak: H.isBreak, msg: H.msg },
        { turn: shooterId(), over: false, summary: H.msg || '', moves: 0 });
    }

    api.on('aim', (a, from) => { if (from === shooterId() && H.phase === 'aim') api.broadcast('aimr', a, from); });
    api.on('shot', ({ a, p, cx, cy, sx, sy }, from) => {
      if (from !== shooterId() || H.phase !== 'aim' || H.over) return;
      const cue = balls.find((b) => b.id === 0);
      if (H.inHand && Number.isFinite(cx) && Number.isFinite(cy)) {
        const x = clamp(cx, R, W - R), y = clamp(cy, R, HT - R);
        if (!balls.some((b) => b.id !== 0 && !b.in && Math.hypot(b.x - x, b.y - y) < R * 2)) { cue.x = x; cue.y = y; }
      }
      a = Number.isFinite(a) ? a : 0;
      p = clamp(Number.isFinite(p) ? p : 0.5, 0.05, 1);
      const spx = clamp(Number.isFinite(sx) ? sx : 0, -0.9, 0.9), spy = clamp(Number.isFinite(sy) ? sy : 0, -0.9, 0.9);
      first = null; shotPocketed = []; ev = []; out = [];
      H.phase = 'sim'; H.inHand = false; H.msg = '';
      publish();
      api.broadcast('strike', { a, p });
      api.timeout(() => { // the cue swings first; the balls move when it lands
        strike(cue, a, p, spx, spy);
        ev.push(['b', +(0.35 + p * 0.65).toFixed(2)]);
        acc = 0; last = performance.now();
        H.timer = setInterval(loop, 8);
      }, STRIKE_MS);
    });
    // ---- computer player: ghost-ball geometry finds the shots, the real physics engine tries them out
    function simulate(a, p, cx, cy) {
      const saved = { balls, ev, first, shotPocketed, out };
      balls = saved.balls.map((b) => ({ ...b }));
      const cue = balls.find((b) => b.id === 0);
      if (cx !== undefined) { cue.x = cx; cue.y = cy; }
      strike(cue, a, p, 0, 0);
      first = null; shotPocketed = []; out = []; ev = [];
      for (let i = 0; i < 240 * 9 && balls.some(isMoving); i++) step(balls, 1 / 240, null, onFirst, onPocket);
      const res = { first, poc: shotPocketed.slice(), cueIn: shotPocketed.includes(0) };
      balls = saved.balls; ev = saved.ev; first = saved.first; shotPocketed = saved.shotPocketed; out = saved.out;
      return res;
    }
    const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); };
    function botTargets(team) {
      const g = H.groups[team];
      const mine = g ? balls.filter((b) => !b.in && groupOf(b.id) === g) : [];
      if (g && !mine.length) return balls.filter((b) => !b.in && b.id === 8);
      return g ? mine : balls.filter((b) => !b.in && b.id !== 0 && b.id !== 8);
    }
    function candidates(cue, targets) {
      const out2 = [];
      for (const t of targets) for (const pk of POCKETS) {
        const dx = pk.x - t.x, dy = pk.y - t.y, dl = Math.hypot(dx, dy) || 1;
        const gx = t.x - (dx / dl) * 2 * R, gy = t.y - (dy / dl) * 2 * R;
        if (gx < R || gx > W - R || gy < R || gy > HT - R) continue;
        const cx2 = gx - cue.x, cy2 = gy - cue.y, cl = Math.hypot(cx2, cy2) || 1;
        const cos = (cx2 * dx + cy2 * dy) / (cl * dl);
        if (cos < 0.22) continue; // too thin a cut
        let blocked = false;
        for (const o of balls) {
          if (o.in || o.id === 0 || o.id === t.id) continue;
          if (segDist(o.x, o.y, cue.x, cue.y, gx, gy) < 2 * R - 1 || segDist(o.x, o.y, t.x, t.y, pk.x, pk.y) < 2 * R - 1) { blocked = true; break; }
        }
        if (blocked) continue;
        out2.push({ a: Math.atan2(cy2, cx2), d: cl + dl, cos, target: t.id, p: clamp(0.3 + (cl + dl) / 1500, 0.3, 0.92), sc: cos * 2 - (cl + dl) * 0.0016 });
      }
      return out2.sort((x, y) => y.sc - x.sc);
    }
    function chooseShot() {
      const lvl = api.level, team = H.team, id = shooterId();
      let cue = balls.find((b) => b.id === 0), hand;
      if (H.inHand) { // ball in hand: put the cue ball on the table somewhere clear and open
        let best = null;
        for (let i = 0; i < 14; i++) {
          const x = R + 20 + Math.random() * (W * 0.55), y = R + 20 + Math.random() * (HT - 2 * R - 40);
          if (balls.some((b) => b.id !== 0 && !b.in && Math.hypot(b.x - x, b.y - y) < R * 2.6)) continue;
          const cs = candidates({ x, y }, botTargets(team));
          const sc = cs.length ? cs[0].sc : -9;
          if (!best || sc > best.sc) best = { x, y, sc };
        }
        if (best) { hand = { cx: best.x, cy: best.y }; cue = { x: best.x, y: best.y }; }
      }
      if (H.isBreak) { const apex = balls.filter((b) => b.id !== 0).sort((a2, b2) => a2.x - b2.x)[0]; return { a: Math.atan2(apex.y - cue.y, apex.x - cue.x) + (Math.random() - 0.5) * 0.03, p: lvl === 'easy' ? 0.7 : 0.95, ...hand }; }
      const targets = botTargets(team);
      let cands = candidates(cue, targets);
      if (!cands.length) { // no clean pot: hit the nearest legal ball, gently
        const t = targets.slice().sort((a2, b2) => Math.hypot(a2.x - cue.x, a2.y - cue.y) - Math.hypot(b2.x - cue.x, b2.y - cue.y))[0] || balls.find((b) => b.id !== 0 && !b.in);
        return { a: Math.atan2(t.y - cue.y, t.x - cue.x) + (Math.random() - 0.5) * 0.04, p: 0.45, ...hand };
      }
      if (lvl === 'easy') { const c = cands[Math.floor(Math.random() * Math.min(cands.length, 4))]; return { a: c.a + (Math.random() - 0.5) * 0.16, p: clamp(c.p + (Math.random() - 0.5) * 0.3, 0.25, 1), ...hand }; }
      const tries = [];
      const n = lvl === 'hard' ? 8 : 3;
      for (const c of cands.slice(0, n)) for (const dp of lvl === 'hard' ? [-0.12, 0, 0.12] : [0]) tries.push({ a: c.a, p: clamp(c.p + dp, 0.2, 1), target: c.target });
      let best = null;
      for (const tr of tries) {
        const r = simulate(tr.a, tr.p, hand?.cx, hand?.cy);
        const g = H.groups[team];
        const own = r.poc.filter((i) => i !== 0 && i !== 8 && (!g || groupOf(i) === g)).length;
        const foes = r.poc.filter((i) => i !== 0 && i !== 8 && g && groupOf(i) !== g).length;
        const legalFirst = r.first !== null && (targets.some((t) => t.id === r.first));
        const eightBad = r.poc.includes(8) && !(g && !balls.some((b) => !b.in && groupOf(b.id) === g));
        const sc = own * 10 - foes * 6 - (r.cueIn ? 30 : 0) - (legalFirst ? 0 : 25) - (eightBad ? 80 : 0) + (r.poc.includes(8) && !eightBad && !r.cueIn ? 100 : 0) + Math.random();
        if (!best || sc > best.sc) best = { ...tr, sc };
      }
      return { a: best.a + (Math.random() - 0.5) * (lvl === 'hard' ? 0.006 : 0.02), p: best.p, ...hand };
    }
    let poolBusy = false;
    botLoop(api, () => {
      if (H.over || H.phase !== 'aim' || poolBusy || !api.isBot(shooterId())) return null;
      const id = shooterId();
      return { delay: thinkMs(api.level, 700, 800), run: () => {
        if (H.over || H.phase !== 'aim' || shooterId() !== id) return;
        poolBusy = true;
        const shot = chooseShot();
        api.broadcast('aimr', { a: shot.a, p: shot.p }, id); // let everyone watch the cue swing round
        api.timeout(() => { poolBusy = false; if (!H.over && H.phase === 'aim' && shooterId() === id) api.botDo(id, 'shot', shot); }, 800);
      } };
    });
    api.cleanup(() => clearInterval(H.timer));
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => {
      if (H.over) return;
      const t = teamOf(id);
      if (teams[t].every((x) => api.player(x).left)) return endGame(1 - t, 'The other team left.');
      if (H.phase === 'aim' && api.player(shooterId())?.left) { H.ptr[H.team]++; publish(); }
    });
    function restoreFrom(r) {
      balls = r.balls.map(([id, x, y, inn]) => { const b = newBall(id, x, y); b.in = !!inn; return b; });
      Object.assign(H, { team: r.team, ptr: r.ptr, groups: r.groups, pocketed: r.pocketed, inHand: !!r.inHand, isBreak: !!r.isBreak, msg: r.msg || '' });
    }
    if (api.restore) { try { restoreFrom(api.restore); } catch (e) { console.error('bad pool snapshot', e); rack(); } } else rack();
    api.timeout(() => publish(), 400);
  }
  renderHud();
  return {
    get state() { return S; },
    // test helper: take a random-ish shot at a random ball
    bot() {
      if (!myTurn()) return false;
      const cue = cueBall();
      const targets = live.filter((b) => b.id !== 0 && !b.in);
      const t = targets[Math.floor(Math.random() * targets.length)] || { x: W / 2, y: HT / 2 };
      aimNow.a = Math.atan2(t.y - cue.y, t.x - cue.x) + (Math.random() - 0.5) * 0.1;
      power = 0.4 + Math.random() * 0.6;
      shoot();
      return true;
    },
  };
}
