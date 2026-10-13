// 8-Ball Pool — 2 to 4 players (2 teams). The host simulates the physics and streams ball positions;
// the shooter aims (drag on the table), sets power and shoots. Simplified standard 8-ball rules.
import { h, canvasPoint, clamp, fitCanvas } from '../util.js';
import { botLoop, thinkMs } from '../bots.js';
import { icon } from '../ui.js';

const W = 1000, HT = 500, R = 11, M = 44; // table size, ball radius, rail margin
const CW = W + M * 2, CH = HT + M * 2;
const POCKETS = [
  { x: -3, y: -3, r: 25 }, { x: W / 2, y: -8, r: 17 }, { x: W + 3, y: -3, r: 25 },
  { x: -3, y: HT + 3, r: 25 }, { x: W / 2, y: HT + 8, r: 17 }, { x: W + 3, y: HT + 3, r: 25 },
];
const COLORS = ['#f8f8f8', '#f2c500', '#1f58c7', '#d6281e', '#5a2a8c', '#f27f0c', '#0f8a3c', '#7a1c1c', '#161616'];
const colorOf = (id) => (id === 0 ? COLORS[0] : id === 8 ? COLORS[8] : COLORS[((id - 1) % 8) + 1]);
const groupOf = (id) => (id === 0 ? 'cue' : id === 8 ? 'eight' : id < 8 ? 'solid' : 'stripe');
const HEAD = { x: W * 0.25, y: HT / 2 };
const MAXV = 1900;

const CSS = `
.pl { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; padding:6px 8px 8px; min-height:0; }
.pl-top { display:flex; gap:8px; align-items:stretch; width:100%; max-width:1000px; justify-content:center; }
.pl-team { flex:1; min-width:0; background:var(--surface); box-shadow:var(--e1); border-radius:18px; padding:6px 10px; display:flex; flex-direction:column; gap:3px; transition:box-shadow .2s; }
.pl-team.turn { box-shadow:0 0 0 3px var(--yellow), var(--e1); }
.pl-team .tn { font-weight:800; font-size:12.5px; display:flex; gap:6px; align-items:center; min-width:0; }
.pl-team .tn .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pl-team .tn .chip { height:20px; padding:0 8px; font-size:10.5px; flex:none; }
.pl-tray { display:flex; gap:2px; min-height:19px; flex-wrap:wrap; }
.pl-mini { width:18px; height:18px; border-radius:50%; display:inline-grid; place-items:center; font-size:8.5px; font-weight:900; color:#111; box-shadow:inset -2px -2px 3px rgba(0,0,0,.28), inset 1px 1px 2px rgba(255,255,255,.5); }
.pl-mini i { width:9px; height:9px; border-radius:50%; background:#fff; display:grid; place-items:center; font-style:normal; line-height:1; }
.pl-wrap { flex:1 1 0; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.pl canvas { border-radius:16px; box-shadow:0 14px 34px rgba(0,0,0,.32); touch-action:none; cursor:crosshair; max-width:100%; }
.pl-msg { font-weight:700; min-height:20px; text-align:center; font-size:14px; }
.pl-bar { display:grid; grid-template-columns:auto auto 1fr; align-items:center; gap:8px 12px; width:100%; max-width:760px; background:var(--surface); box-shadow:var(--e2); border-radius:24px; padding:8px 12px; }
.pl-power { grid-column:1 / -1; display:flex; align-items:center; gap:10px; }
.pl-power b { font:800 12px var(--font); color:var(--on3); width:46px; }
.pl-power input[type=range] { flex:1; -webkit-appearance:none; appearance:none; height:14px; border-radius:7px; background:linear-gradient(90deg,#3ddc84,#ffd23f 55%,#ff5252); outline:none; }
.pl-power input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:26px; height:26px; border-radius:50%; background:#fff; border:3px solid #263238; box-shadow:0 2px 6px rgba(0,0,0,.35); }
.pl-power input[type=range]::-moz-range-thumb { width:22px; height:22px; border-radius:50%; background:#fff; border:3px solid #263238; }
.pl-spin { width:58px; height:58px; border-radius:50%; background:radial-gradient(circle at 35% 30%, #fff, #e8e8e8 60%, #bcbcbc); box-shadow:inset -3px -4px 8px rgba(0,0,0,.25), var(--e1); position:relative; touch-action:none; cursor:pointer; }
.pl-spin::before, .pl-spin::after { content:''; position:absolute; background:rgba(0,0,0,.14); } .pl-spin::before { left:50%; top:8%; bottom:8%; width:1px; } .pl-spin::after { top:50%; left:8%; right:8%; height:1px; }
.pl-spin i { position:absolute; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:#e63946; box-shadow:0 1px 3px rgba(0,0,0,.45); left:50%; top:50%; }
.pl-fine { display:flex; gap:6px; align-items:center; }
.pl-fine button { width:40px; height:40px; border-radius:50%; border:0; background:var(--s2); color:var(--on); display:grid; place-items:center; cursor:pointer; touch-action:manipulation; }
.pl-fine button:active { background:var(--blue-c); }
.pl-fine .ic { width:22px; height:22px; }
.pl-shoot { justify-self:end; }
.pl-lbl { font:700 10px var(--font); color:var(--on3); text-transform:uppercase; letter-spacing:.6px; text-align:center; margin-top:2px; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const teams = [[], []];
  ids.forEach((id, i) => teams[i % 2].push(id));
  const teamOf = (id) => (teams[0].includes(id) ? 0 : 1);

  // ------------------------------------------------------------ shared client state
  const S = { balls: [], turn: ids[0], shooter: ids[0], team: 0, groups: [null, null], inHand: false, phase: 'aim', msg: '', pocketed: [[], []], over: false };
  const live = []; // for rendering: {id,x,y,vx,vy,in,t}
  const aimNow = { a: 0, p: 0.55, cx: null, cy: null };
  let power = 0.55;
  let spin = { x: 0, y: 0 }; // where on the cue ball you strike: y>0 follow (top), y<0 draw (back), x = side
  let guide = (() => { try { return localStorage.getItem('gn.pool.guide') || 'long'; } catch { return 'long'; } })();
  const remote = { a: 0, p: 0, t: 0 };

  const canvas = h('canvas', { width: CW, height: CH });
  const ctx = canvas.getContext('2d');
  const msgEl = h('div.pl-msg');
  const teamEls = [h('div.pl-team'), h('div.pl-team')];
  const slider = h('input', { type: 'range', min: 8, max: 100, value: 55, 'aria-label': 'Shot power', oninput: (e) => { power = e.target.value / 100; aimNow.p = power; sendAim(); } });
  const shootBtn = h('button.btn.primary.big.pl-shoot', { onclick: () => shoot() }, 'Shoot');
  const spinEl = h('div.pl-spin', { title: 'Where you hit the cue ball: top = follow, bottom = draw, sides = english' }, h('i'));
  const setSpin = (e) => {
    const r = spinEl.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width - 0.5) * 2, y = -((e.clientY - r.top) / r.height - 0.5) * 2;
    const m = Math.hypot(x, y); if (m > 0.85) { x *= 0.85 / m; y *= 0.85 / m; }
    spin = { x, y }; spinEl.firstChild.style.left = 50 + x * 50 + '%'; spinEl.firstChild.style.top = 50 - y * 50 + '%';
  };
  spinEl.addEventListener('pointerdown', (e) => { spinEl.setPointerCapture(e.pointerId); setSpin(e); });
  spinEl.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure) setSpin(e); });
  spinEl.addEventListener('dblclick', () => { spin = { x: 0, y: 0 }; spinEl.firstChild.style.left = '50%'; spinEl.firstChild.style.top = '50%'; });
  const nudge = (dir) => { let t = 0; const step = () => { aimNow.a += dir * 0.0025; sendAim(); }; step(); t = setInterval(step, 60); const stop = () => { clearInterval(t); removeEventListener('pointerup', stop); }; addEventListener('pointerup', stop); };
  const fine = h('div.pl-fine', h('button', { 'aria-label': 'Aim a little left', onpointerdown: () => nudge(-1) }, icon('chevron_left')), h('button', { 'aria-label': 'Aim a little right', onpointerdown: () => nudge(1) }, icon('chevron_right')),
    h('button', { 'aria-label': 'Aim guide', title: 'Aim guide: long / short / off', onclick: (e) => { guide = guide === 'long' ? 'short' : guide === 'short' ? 'off' : 'long'; try { localStorage.setItem('gn.pool.guide', guide); } catch { /* */ } e.currentTarget.classList.toggle('on', guide !== 'off'); api.toast('Aim guide: ' + guide); } }, icon('visibility')));
  const bar = h('div.pl-bar', h('div.pl-power', h('b', 'Power'), slider), h('div', spinEl, h('div.pl-lbl', 'Spin')), h('div', fine, h('div.pl-lbl', 'Fine aim')), shootBtn);
  const wrap = h('div.pl-wrap', canvas);
  api.root.append(h('style', CSS), h('div.pl', h('div.pl-top', teamEls), msgEl, wrap, bar));
  // On tall (phone) screens the table is drawn rotated 90° so it fills the screen.
  let portrait = false;
  const layout = () => {
    const r = wrap.getBoundingClientRect();
    portrait = r.height > r.width * 1.05;
    canvas.width = portrait ? CH : CW;
    canvas.height = portrait ? CW : CH;
    const asp = canvas.width / canvas.height;
    let w = r.width, hh = w / asp;
    if (hh > r.height) { hh = r.height; w = hh * asp; }
    canvas.style.width = Math.floor(w) + 'px';
    canvas.style.height = Math.floor(hh) + 'px';
  };
  const ro = new ResizeObserver(layout);
  ro.observe(wrap);
  layout();
  api.cleanup(() => ro.disconnect());

  const cueBall = () => live.find((b) => b.id === 0);
  const myTurn = () => S.shooter === api.me && S.phase === 'aim' && !S.over;

  // ------------------------------------------------------------ rendering
  // the table itself is painted once (wood, felt, cushions, pockets) and then just copied each frame
  const bg = document.createElement('canvas'); bg.width = CW; bg.height = CH;
  (function paintTable() {
    const c = bg.getContext('2d');
    const wood = c.createLinearGradient(0, 0, 0, CH);
    wood.addColorStop(0, '#8a5530'); wood.addColorStop(0.5, '#6a3d1e'); wood.addColorStop(1, '#45260f');
    c.fillStyle = wood; c.beginPath(); c.roundRect(0, 0, CW, CH, 28); c.fill();
    // wood grain
    c.lineWidth = 1;
    for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(${i % 2 ? '30,14,4' : '255,214,160'},${0.04 + Math.random() * 0.05})`; const y = Math.random() * CH; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(CW * 0.3, y + (Math.random() - 0.5) * 8, CW * 0.7, y + (Math.random() - 0.5) * 8, CW, y + (Math.random() - 0.5) * 6); c.stroke(); }
    c.strokeStyle = 'rgba(255,225,180,.35)'; c.lineWidth = 2; c.beginPath(); c.roundRect(2, 2, CW - 4, CH - 4, 26); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 3; c.beginPath(); c.roundRect(M - 8, M - 8, W + 16, HT + 16, 8); c.stroke();
    // diamonds
    const dia = (x, y) => { c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.fillStyle = '#f1e4c8'; c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1; c.fillRect(-4.5, -4.5, 9, 9); c.strokeRect(-4.5, -4.5, 9, 9); c.restore(); };
    for (let i = 1; i < 8; i++) { if (i === 4) continue; dia(M + (W * i) / 8, M / 2); dia(M + (W * i) / 8, CH - M / 2); }
    for (let i = 1; i < 4; i++) { dia(M / 2, M + (HT * i) / 4); dia(CW - M / 2, M + (HT * i) / 4); }
    c.save(); c.translate(M, M);
    // cushions (dark green rubber) around the felt
    c.fillStyle = '#0e5a30'; c.fillRect(-14, -14, W + 28, HT + 28);
    const felt = c.createRadialGradient(W / 2, HT / 2, 60, W / 2, HT / 2, W * 0.66);
    felt.addColorStop(0, '#2a9d5c'); felt.addColorStop(0.6, '#1b8048'); felt.addColorStop(1, '#13663a');
    c.fillStyle = felt; c.fillRect(0, 0, W, HT);
    // felt texture
    for (let i = 0; i < 5200; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,40,20'},${0.025 + Math.random() * 0.04})`; c.fillRect(Math.random() * W, Math.random() * HT, 1.3, 1.3); }
    // cushion bevel
    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 5; c.strokeRect(0, 0, W, HT);
    c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 2; c.strokeRect(-6, -6, W + 12, HT + 12);
    // head string, spots
    c.strokeStyle = 'rgba(255,255,255,.13)'; c.lineWidth = 2; c.beginPath(); c.moveTo(HEAD.x, 6); c.lineTo(HEAD.x, HT - 6); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.22)'; for (const [sx, sy] of [[W * 0.72, HT / 2], [HEAD.x, HT / 2]]) { c.beginPath(); c.arc(sx, sy, 3.2, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.07)'; c.font = '800 26px sans-serif'; c.textAlign = 'center'; c.fillText('GAME NIGHT', W * 0.5, HT / 2 + 9);
    // pockets: leather rim + deep hole
    for (const p of POCKETS) {
      const g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r + 8);
      g.addColorStop(0, '#000'); g.addColorStop(0.7, '#0a0a0a'); g.addColorStop(1, '#2b1b10');
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r + 8, 0, 7); c.fill();
      c.strokeStyle = '#b08d57'; c.lineWidth = 2.5; c.beginPath(); c.arc(p.x, p.y, p.r + 8, 0, 7); c.stroke();
    }
    c.restore();
    // vignette
    const v = c.createRadialGradient(CW / 2, CH / 2, CH * 0.35, CW / 2, CH / 2, CW * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.28)');
    c.fillStyle = v; c.beginPath(); c.roundRect(0, 0, CW, CH, 28); c.fill();
  })();

  function ballFill(b, x, y, r) {
    const col = colorOf(b.id);
    const stripe = b.id > 8;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = stripe ? '#f6f3ea' : col;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (stripe) { ctx.fillStyle = col; ctx.fillRect(x - r, y - r * 0.56, r * 2, r * 1.12); }
    // number disc
    if (b.id > 0) {
      ctx.fillStyle = '#fdfcf8'; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = `800 ${r * 0.74}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(b.id), x, y + r * 0.04);
    }
    // sphere shading
    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r * 1.02);
    g.addColorStop(0, 'rgba(255,255,255,.7)'); g.addColorStop(0.28, 'rgba(255,255,255,.12)'); g.addColorStop(0.62, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(x - r * 0.36, y - r * 0.42, r * 0.2, r * 0.12, -0.6, 0, 7); ctx.fill();
  }
  function pos(b, now) {
    if (S.phase !== 'sim' || !b.t) return [b.x, b.y];
    const dt = Math.min(0.06, (now - b.t) / 1000);
    return [b.x + b.vx * dt, b.y + b.vy * dt];
  }
  function raycast(c, dx, dy) {
    let best = { t: 1e9, ball: null };
    for (const b of live) {
      if (b.id === 0 || b.in) continue;
      const fx = c.x - b.x, fy = c.y - b.y;
      const B = fx * dx + fy * dy, C = fx * fx + fy * fy - 4 * R * R;
      const disc = B * B - C;
      if (disc >= 0) { const t = -B - Math.sqrt(disc); if (t > 0 && t < best.t) best = { t, ball: b }; }
    }
    const rails = [];
    if (dx < 0) rails.push((R - c.x) / dx); if (dx > 0) rails.push((W - R - c.x) / dx);
    if (dy < 0) rails.push((R - c.y) / dy); if (dy > 0) rails.push((HT - R - c.y) / dy);
    for (const t of rails) if (t > 0 && t < best.t) best = { t, ball: null };
    return best;
  }
  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (portrait) { ctx.translate(CH, 0); ctx.rotate(Math.PI / 2); }
    ctx.drawImage(bg, 0, 0);
    ctx.save(); ctx.translate(M, M);
    ctx.beginPath(); ctx.rect(-12, -12, W + 24, HT + 24); ctx.clip();
    // aim guide
    const cue = cueBall();
    const mine = myTurn();
    const showRemote = !mine && S.phase === 'aim' && now - remote.t < 1500 && cue && !cue.in;
    let stick = null;
    if (cue && !cue.in && S.phase === 'aim' && (mine || showRemote)) {
      const a = mine ? aimNow.a : remote.a;
      const dx = Math.cos(a), dy = Math.sin(a);
      stick = { a, pw: mine ? power : remote.p };
      if (guide !== 'off' || !mine) {
        const hit = raycast(cue, dx, dy);
        const reach = guide === 'short' && mine ? Math.min(hit.t, 260) : hit.t;
        const ex = cue.x + dx * reach, ey = cue.y + dy * reach;
        ctx.setLineDash([9, 7]); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cue.x + dx * R, cue.y + dy * R); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        if (reach === hit.t) {
          ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ex, ey, R, 0, 7); ctx.stroke();
          if (hit.ball) {
            const nx = hit.ball.x - ex, ny = hit.ball.y - ey, nl = Math.hypot(nx, ny) || 1;
            ctx.strokeStyle = 'rgba(255,214,100,.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(hit.ball.x, hit.ball.y); ctx.lineTo(hit.ball.x + (nx / nl) * 90, hit.ball.y + (ny / nl) * 90); ctx.stroke();
            // where the cue ball goes afterwards (tangent line)
            const ux = nx / nl, uy = ny / nl, dot = dx * ux + dy * uy;
            let tx = dx - dot * ux, ty = dy - dot * uy; const tl = Math.hypot(tx, ty);
            if (tl > 0.05) { tx /= tl; ty /= tl; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + tx * 60 * tl, ey + ty * 60 * tl); ctx.stroke(); }
          }
        }
      }
    }
    // balls (soft shadows first so they never cover a neighbour)
    for (const b of live) {
      if (b.in) continue;
      const [x, y] = pos(b, now);
      const sg = ctx.createRadialGradient(x + 2, y + 4, 1, x + 2, y + 4, R * 1.15);
      sg.addColorStop(0, 'rgba(0,0,0,.42)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x + 2, y + 4, R * 1.15, 0, 7); ctx.fill();
    }
    for (const b of live) { if (!b.in) { const [x, y] = pos(b, now); ballFill(b, x, y, R); } }
    // cue stick
    if (stick && cue) {
      const back = R + 8 + stick.pw * 85;
      ctx.save(); ctx.translate(cue.x, cue.y); ctx.rotate(stick.a);
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5;
      const L = 360, g = ctx.createLinearGradient(-back - L, 0, -back, 0);
      g.addColorStop(0, '#2a1a0d'); g.addColorStop(0.28, '#3d2614'); g.addColorStop(0.3, '#caa070'); g.addColorStop(0.75, '#efd7a8'); g.addColorStop(1, '#f9ecc8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-back, -1.9); ctx.lineTo(-back - L, -4.8); ctx.lineTo(-back - L, 4.8); ctx.lineTo(-back, 1.9); ctx.closePath(); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#f4f4f0'; ctx.fillRect(-back - 12, -2, 12, 4);
      ctx.fillStyle = '#4aa3e8'; ctx.beginPath(); ctx.roundRect(-back - 2, -2.1, 4, 4.2, 1); ctx.fill();
      ctx.restore();
    }
    if (mine && S.inHand && cue) {
      ctx.strokeStyle = '#ffc857'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(cue.x, cue.y, R + 7, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  api.raf((dt, now) => draw(now));

  const miniBall = (id) => {
    const col = colorOf(id), stripe = id > 8;
    return h('span.pl-mini', { style: { background: stripe ? `linear-gradient(#f6f3ea 26%, ${col} 26% 74%, #f6f3ea 74%)` : col, color: id === 8 ? '#fff' : '#111' } }, h('i', { style: id === 8 ? { background: '#fff' } : {} }, String(id)));
  };
  function renderHud() {
    for (let t = 0; t < 2; t++) {
      const g = S.groups[t];
      const own = S.pocketed[t];
      teamEls[t].classList.toggle('turn', S.team === t && !S.over);
      teamEls[t].replaceChildren(
        h('div.tn', h('span.nm', teams[t].map((id) => (api.player(id)?.name || '?') + (id === api.me ? ' (you)' : '')).join(' & ')), h('span.chip', g ? (g === 'solid' ? 'Solids' : 'Stripes') : 'Open')),
        h('div.pl-tray', own.map((id) => miniBall(id)))
      );
    }
    const sh = api.player(S.shooter);
    msgEl.textContent = S.over ? S.msg : S.phase === 'sim' ? '…' : (S.shooter === api.me ? (S.inHand ? 'Ball in hand — place the cue ball' : 'Your shot') : `${sh?.name || '?'} is shooting…`) + (S.msg ? '  ' + S.msg : '');
    bar.style.display = myTurn() ? '' : 'none';
  }

  // ------------------------------------------------------------ input
  let dragCue = false;
  function tablePt(ev) {
    const p = canvasPoint(canvas, ev);
    const lx = portrait ? p.y : p.x, ly = portrait ? CH - p.x : p.y;
    return { x: lx - M, y: ly - M };
  }
  let lastAimSent = 0;
  function sendAim() {
    const now = performance.now();
    if (now - lastAimSent < 90) return;
    lastAimSent = now;
    api.toHost('aim', { a: aimNow.a, p: power });
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
    if (e.key === 'ArrowUp' && myTurn()) { power = clamp(power + 0.05, 0.08, 1); slider.value = power * 100; }
    if (e.key === 'ArrowDown' && myTurn()) { power = clamp(power - 0.05, 0.08, 1); slider.value = power * 100; }
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
    live.length = 0;
    for (const [id, x, y, inn] of arr) live.push({ id, x, y, vx: 0, vy: 0, in: !!inn, t: 0 });
  }
  api.on('st', (s) => {
    const prevPhase = S.phase;
    Object.assign(S, s);
    applyBalls(s.balls);
    if (S.shooter === api.me && prevPhase !== 'aim' && S.phase === 'aim') api.sfx('turn');
    const cue = cueBall();
    if (cue && S.phase === 'aim' && S.shooter === api.me && s.balls) {
      // default aim: toward the rack
      aimNow.a = Math.atan2(HT / 2 - cue.y, W * 0.7 - cue.x);
    }
    renderHud();
  });
  api.on('fr', (f) => {
    const now = performance.now();
    S.phase = 'sim';
    for (const [id, x, y, vx, vy] of f.b) {
      const b = live.find((q) => q.id === id);
      if (b) { b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.t = now; }
    }
    for (const id of f.out || []) { const b = live.find((q) => q.id === id); if (b) b.in = true; }
    for (const ev of f.ev || []) api.sfx(ev);
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
      balls = [{ id: 0, x: HEAD.x, y: HT / 2, vx: 0, vy: 0, in: false }];
      const order = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
      const layout = []; // 15 slots
      const fx = W * 0.72, dx = R * 2 * 0.87 + 0.5;
      for (let c = 0; c < 5; c++) for (let r = 0; r <= c; r++) layout.push({ x: fx + c * dx, y: HT / 2 + (r - c / 2) * (R * 2 + 0.6) });
      // slot 4 (row 2 middle) = eight; back corners get one solid and one stripe
      const eightSlot = 4;
      const rest = order.slice();
      const corner1 = 10, corner2 = 14;
      const solids = rest.filter((i) => i < 8), stripes = rest.filter((i) => i > 8);
      const assign = {};
      assign[eightSlot] = 8;
      assign[corner1] = solids.pop(); assign[corner2] = stripes.pop();
      const pool = rng.shuffle([...solids, ...stripes]);
      layout.forEach((p, i) => { balls.push({ id: assign[i] ?? pool.pop(), x: p.x, y: p.y, vx: 0, vy: 0, in: false }); });
    }
    const snapState = () => ({
      balls: balls.map((b) => [b.id, +b.x.toFixed(1), +b.y.toFixed(1), b.in ? 1 : 0]),
      turn: shooterId(), shooter: shooterId(), team: H.team, groups: H.groups, inHand: H.inHand, phase: H.phase, msg: H.msg, pocketed: H.pocketed, over: H.over,
    });
    const publish = (to) => (to ? api.sendTo(to, 'st', snapState()) : api.broadcast('st', snapState()));

    // --- physics
    const FRIC = 230, DAMP = 0.45, MINV = 7;
    let ev = [], first = null, shotPocketed = [], out = [];
    let cspin = null; // the cue-ball strike point of the shot in progress: {x: side, y: follow(+)/draw(-), dx, dy, rails}
    function stepPhysics(dt) {
      const alive = balls.filter((b) => !b.in);
      for (const b of alive) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 0) {
          const ns = Math.max(0, sp - (FRIC + sp * DAMP) * dt);
          if (ns < MINV) { b.vx = 0; b.vy = 0; } else { b.vx *= ns / sp; b.vy *= ns / sp; }
        }
      }
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i], b = alive[j];
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 < 4 * R * R && d2 > 0.0001) {
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
            const ov = (2 * R - d) / 2;
            a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
            const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (vn > 0) {
              const imp = vn * 0.97;
              a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
              if (vn > 40) ev.push('clack');
              if (first === null && (a.id === 0 || b.id === 0)) {
                first = a.id === 0 ? b.id : a.id;
                if (cspin && cspin.y) { const cb = a.id === 0 ? a : b, k = cspin.y * 0.5 * vn; cb.vx += cspin.dx * k; cb.vy += cspin.dy * k; } // follow rolls on after contact, draw pulls back
              }
            }
          }
        }
      }
      for (const b of alive) {
        let pocketed = false;
        for (const p of POCKETS) if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) { pocketed = true; break; }
        if (pocketed) { b.in = true; b.vx = b.vy = 0; shotPocketed.push(b.id); out.push(b.id); ev.push('coin'); continue; }
        const ovx = b.vx, ovy = b.vy;
        if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx) * 0.8; if (Math.abs(b.vx) > 40) ev.push('bump'); }
        if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx) * 0.8; if (Math.abs(b.vx) > 40) ev.push('bump'); }
        if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy) * 0.8; if (Math.abs(b.vy) > 40) ev.push('bump'); }
        if (b.y > HT - R) { b.y = HT - R; b.vy = -Math.abs(b.vy) * 0.8; if (Math.abs(b.vy) > 40) ev.push('bump'); }
        if (b.id === 0 && cspin && cspin.x && cspin.rails < 3 && (b.vx !== ovx || b.vy !== ovy)) { // side spin ("english") bends the angle the cue ball leaves a cushion at
          const ang = cspin.x * 0.2 / (1 + cspin.rails), c = Math.cos(ang), sn = Math.sin(ang), vx = b.vx, vy = b.vy;
          b.vx = vx * c - vy * sn; b.vy = vx * sn + vy * c; cspin.rails++;
        }
      }
    }
    const moving = () => balls.some((b) => !b.in && (b.vx || b.vy));
    let acc = 0, last = 0, lastSend = 0;
    function loop() {
      const now = performance.now();
      acc = Math.min(0.1, acc + (now - last) / 1000);
      last = now;
      const dt = 1 / 240;
      while (acc >= dt) { stepPhysics(dt); acc -= dt; }
      if (now - lastSend > 33) {
        lastSend = now;
        const msg = { b: balls.filter((b) => !b.in).map((b) => [b.id, +b.x.toFixed(1), +b.y.toFixed(1), +b.vx.toFixed(0), +b.vy.toFixed(0)]), out, ev: [...new Set(ev)] };
        out = []; ev = [];
        api.broadcast('fr', msg);
      }
      if (!moving()) { clearInterval(H.timer); H.timer = 0; resolve(); }
    }

    function remaining(team) { const g = H.groups[team]; if (!g) return 99; return balls.filter((b) => !b.in && groupOf(b.id) === g).length; }
    function endGame(winTeam, why) {
      H.over = true; H.msg = why;
      publish();
      api.save({ balls: balls.map((b) => [b.id, +b.x.toFixed(1), +b.y.toFixed(1), b.in ? 1 : 0]), team: H.team, ptr: H.ptr, groups: H.groups, pocketed: H.pocketed, inHand: false, isBreak: false, msg: why }, { turn: null, over: true, summary: `${teams[winTeam].map((id) => api.player(id).name).join(' & ')} won — ${why}`, moves: 0 });
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
      if (cueIn) { const c = balls.find((b) => b.id === 0); c.in = false; c.x = HEAD.x; c.y = HT / 2; c.vx = c.vy = 0; }
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
      api.save({ balls: balls.map((b) => [b.id, +b.x.toFixed(1), +b.y.toFixed(1), b.in ? 1 : 0]), team: H.team, ptr: H.ptr, groups: H.groups, pocketed: H.pocketed, inHand: H.inHand, isBreak: H.isBreak, msg: H.msg },
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
      cue.vx = Math.cos(a) * p * MAXV; cue.vy = Math.sin(a) * p * MAXV;
      const spx = clamp(Number.isFinite(sx) ? sx : 0, -0.9, 0.9), spy = clamp(Number.isFinite(sy) ? sy : 0, -0.9, 0.9);
      cspin = spx || spy ? { x: spx, y: spy, dx: Math.cos(a), dy: Math.sin(a), rails: 0 } : null;
      first = null; shotPocketed = []; ev = ['clack']; out = [];
      H.phase = 'sim'; H.inHand = false; H.msg = '';
      publish();
      acc = 0; last = performance.now();
      H.timer = setInterval(loop, 8);
    });
    // ---- computer player: ghost-ball geometry finds the shots, the real physics engine tries them out
    function simulate(a, p, cx, cy) {
      const saved = { balls, ev, first, shotPocketed, out, cspin }; cspin = null;
      balls = saved.balls.map((b) => ({ ...b }));
      const cue = balls.find((b) => b.id === 0);
      if (cx !== undefined) { cue.x = cx; cue.y = cy; }
      cue.vx = Math.cos(a) * p * MAXV; cue.vy = Math.sin(a) * p * MAXV;
      first = null; shotPocketed = []; out = []; ev = [];
      for (let i = 0; i < 240 * 9 && balls.some((b) => !b.in && (b.vx || b.vy)); i++) stepPhysics(1 / 240);
      const res = { first, poc: shotPocketed.slice(), cueIn: shotPocketed.includes(0) };
      balls = saved.balls; ev = saved.ev; first = saved.first; shotPocketed = saved.shotPocketed; out = saved.out; cspin = saved.cspin;
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
      balls = r.balls.map(([id, x, y, inn]) => ({ id, x, y, vx: 0, vy: 0, in: !!inn }));
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
