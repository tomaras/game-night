// 8-Ball Pool — 2 to 4 players (2 teams). The host simulates the physics and streams ball positions;
// the shooter aims (drag on the table), sets power and shoots. Simplified standard 8-ball rules.
import { h, canvasPoint, clamp, fitCanvas } from '../util.js';

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
.pl { flex:1; display:flex; flex-direction:column; align-items:center; gap:8px; padding:8px; min-height:0; }
.pl-top { display:flex; gap:10px; align-items:stretch; width:100%; max-width:1000px; flex-wrap:wrap; justify-content:center; }
.pl-team { flex:1; min-width:150px; background:var(--panel); box-shadow:var(--e1); border-radius:20px; padding:8px 14px; display:flex; flex-direction:column; gap:4px; }
.pl-team.turn { box-shadow:0 0 0 3px var(--yellow); }
.pl-team .tn { font-weight:800; font-size:13px; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.pl-tray { display:flex; gap:3px; min-height:20px; flex-wrap:wrap; }
.pl-mini { width:18px; height:18px; border-radius:50%; display:inline-grid; place-items:center; font-size:9px; font-weight:900; color:#fff; border:1px solid rgba(255,255,255,.4); }
.pl-wrap { flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; }
.pl canvas { border-radius:14px; box-shadow:0 12px 30px rgba(31,41,55,.22); touch-action:none; cursor:crosshair; max-width:100%; }
.pl-bar { display:flex; align-items:center; gap:10px; width:100%; max-width:760px; background:var(--panel); box-shadow:var(--e2); border-radius:26px; padding:10px 14px; flex-wrap:wrap; justify-content:center; }
.pl-bar input[type=range] { flex:1; min-width:120px; accent-color:var(--blue); }
.pl-msg { font-weight:700; min-height:22px; text-align:center; }
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
  const remote = { a: 0, p: 0, t: 0 };

  const canvas = h('canvas', { width: CW, height: CH });
  const ctx = canvas.getContext('2d');
  const msgEl = h('div.pl-msg');
  const teamEls = [h('div.pl-team'), h('div.pl-team')];
  const slider = h('input', { type: 'range', min: 8, max: 100, value: 55, oninput: (e) => { power = e.target.value / 100; aimNow.p = power; sendAim(); } });
  const shootBtn = h('button.btn.primary.big', { onclick: () => shoot() }, 'Shoot');
  const bar = h('div.pl-bar', h('span', 'Power'), slider, shootBtn);
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
  function ballFill(b, x, y, r) {
    const col = colorOf(b.id);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = b.id > 8 ? '#f4f4f0' : col;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (b.id > 8) { ctx.fillStyle = col; ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1); }
    ctx.restore();
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (b.id > 0) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = `bold ${r * 0.72}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(b.id), x, y + 0.5);
    }
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
    // rails
    const wood = ctx.createLinearGradient(0, 0, 0, CH);
    wood.addColorStop(0, '#7a4a25'); wood.addColorStop(1, '#4d2c14');
    ctx.fillStyle = wood; ctx.beginPath(); ctx.roundRect(0, 0, CW, CH, 26); ctx.fill();
    ctx.fillStyle = '#d8b98a';
    for (let i = 1; i < 8; i++) { if (i === 4) continue; for (const yy of [M / 2, CH - M / 2]) { ctx.beginPath(); ctx.arc(M + (W * i) / 8, yy, 3.5, 0, 7); ctx.fill(); } }
    for (let i = 1; i < 4; i++) for (const xx of [M / 2, CW - M / 2]) { ctx.beginPath(); ctx.arc(xx, M + (HT * i) / 4, 3.5, 0, 7); ctx.fill(); }
    ctx.save(); ctx.translate(M, M);
    // felt
    const felt = ctx.createRadialGradient(W / 2, HT / 2, 80, W / 2, HT / 2, W * 0.65);
    felt.addColorStop(0, '#1f8a4f'); felt.addColorStop(1, '#126b3a');
    ctx.fillStyle = felt; ctx.fillRect(-4, -4, W + 8, HT + 8);
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(HEAD.x, 0); ctx.lineTo(HEAD.x, HT); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(W * 0.72, HT / 2, 3, 0, 7); ctx.fill();
    // cushion shading
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 6; ctx.strokeRect(-1, -1, W + 2, HT + 2);
    // pockets
    for (const p of POCKETS) { ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, 7); ctx.fill(); }
    // aim line
    const cue = cueBall();
    const mine = myTurn();
    const showRemote = !mine && S.phase === 'aim' && now - remote.t < 1500 && cue && !cue.in;
    if (cue && !cue.in && S.phase === 'aim' && (mine || showRemote)) {
      const a = mine ? aimNow.a : remote.a;
      const dx = Math.cos(a), dy = Math.sin(a);
      const hit = raycast(cue, dx, dy);
      const ex = cue.x + dx * hit.t, ey = cue.y + dy * hit.t;
      ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cue.x + dx * R, cue.y + dy * R); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(ex, ey, R, 0, 7); ctx.stroke();
      if (hit.ball) {
        const nx = hit.ball.x - ex, ny = hit.ball.y - ey, nl = Math.hypot(nx, ny) || 1;
        ctx.strokeStyle = 'rgba(255,230,120,.9)'; ctx.beginPath(); ctx.moveTo(hit.ball.x, hit.ball.y); ctx.lineTo(hit.ball.x + (nx / nl) * 70, hit.ball.y + (ny / nl) * 70); ctx.stroke();
      }
      // cue stick
      const pw = mine ? power : remote.p;
      const back = R + 10 + pw * 70;
      ctx.save(); ctx.translate(cue.x, cue.y); ctx.rotate(a);
      const g = ctx.createLinearGradient(-back - 330, 0, -back, 0);
      g.addColorStop(0, '#3b2412'); g.addColorStop(0.7, '#e2b676'); g.addColorStop(1, '#f6e3b8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-back - 330, -3.5, 330, 7, 3); ctx.fill();
      ctx.fillStyle = '#6ec6ff'; ctx.fillRect(-back - 2, -3.5, 6, 7);
      ctx.restore();
    }
    // balls
    for (const b of live) {
      if (b.in) continue;
      const [x, y] = pos(b, now);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 4, R, R * 0.85, 0, 0, 7); ctx.fill();
      ballFill(b, x, y, R);
    }
    if (mine && S.inHand && cue) {
      ctx.strokeStyle = '#ffc857'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(cue.x, cue.y, R + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  api.raf((dt, now) => draw(now));

  function renderHud() {
    for (let t = 0; t < 2; t++) {
      const g = S.groups[t];
      const own = S.pocketed[t];
      teamEls[t].classList.toggle('turn', S.team === t && !S.over);
      teamEls[t].replaceChildren(
        h('div.tn', teams[t].map((id) => (api.player(id)?.name || '?') + (id === api.me ? ' (you)' : '')).join(' & '), h('span.chip', g ? (g === 'solid' ? 'Solids' : 'Stripes') : 'open')),
        h('div.pl-tray', own.map((id) => h('span.pl-mini', { style: { background: colorOf(id) } }, id)))
      );
    }
    const sh = api.player(S.shooter);
    msgEl.textContent = S.over ? S.msg : S.phase === 'sim' ? '…' : (S.shooter === api.me ? (S.inHand ? 'Ball in hand — drag the cue ball to place it, then aim and shoot!' : 'Your shot — drag on the table to aim, set power, then shoot!') : `${sh?.name || '?'} is lining up a shot…`) + (S.msg ? '  ' + S.msg : '');
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
  });
  function shoot() {
    if (!myTurn()) return;
    const cue = cueBall();
    api.toHost('shot', { a: aimNow.a, p: power, cx: S.inHand ? cue.x : undefined, cy: S.inHand ? cue.y : undefined });
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
              if (first === null && (a.id === 0 || b.id === 0)) first = a.id === 0 ? b.id : a.id;
            }
          }
        }
      }
      for (const b of alive) {
        let pocketed = false;
        for (const p of POCKETS) if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) { pocketed = true; break; }
        if (pocketed) { b.in = true; b.vx = b.vy = 0; shotPocketed.push(b.id); out.push(b.id); ev.push('coin'); continue; }
        if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx) * 0.8; if (Math.abs(b.vx) > 40) ev.push('bump'); }
        if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx) * 0.8; if (Math.abs(b.vx) > 40) ev.push('bump'); }
        if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy) * 0.8; if (Math.abs(b.vy) > 40) ev.push('bump'); }
        if (b.y > HT - R) { b.y = HT - R; b.vy = -Math.abs(b.vy) * 0.8; if (Math.abs(b.vy) > 40) ev.push('bump'); }
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
    }

    api.on('aim', (a, from) => { if (from === shooterId() && H.phase === 'aim') api.broadcast('aimr', a, from); });
    api.on('shot', ({ a, p, cx, cy }, from) => {
      if (from !== shooterId() || H.phase !== 'aim' || H.over) return;
      const cue = balls.find((b) => b.id === 0);
      if (H.inHand && Number.isFinite(cx) && Number.isFinite(cy)) {
        const x = clamp(cx, R, W - R), y = clamp(cy, R, HT - R);
        if (!balls.some((b) => b.id !== 0 && !b.in && Math.hypot(b.x - x, b.y - y) < R * 2)) { cue.x = x; cue.y = y; }
      }
      a = Number.isFinite(a) ? a : 0;
      p = clamp(Number.isFinite(p) ? p : 0.5, 0.05, 1);
      cue.vx = Math.cos(a) * p * MAXV; cue.vy = Math.sin(a) * p * MAXV;
      first = null; shotPocketed = []; ev = ['clack']; out = [];
      H.phase = 'sim'; H.inHand = false; H.msg = '';
      publish();
      acc = 0; last = performance.now();
      H.timer = setInterval(loop, 8);
    });
    api.cleanup(() => clearInterval(H.timer));
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => {
      if (H.over) return;
      const t = teamOf(id);
      if (teams[t].every((x) => api.player(x).left)) return endGame(1 - t, 'The other team left.');
      if (H.phase === 'aim' && api.player(shooterId())?.left) { H.ptr[H.team]++; publish(); }
    });
    rack();
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
