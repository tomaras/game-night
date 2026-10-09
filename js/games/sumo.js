// Sumo Brawl — 2–8 players shove each other off a shrinking platform. Host runs the physics at 60 Hz.
// Move with arrows/WASD or by holding the pointer/finger on the arena; dash with Space or the 💨 button.
import { h, fitCanvas, trackKeys, dpad, clamp } from '../util.js';
import { drawAvatar, avatarEl } from '../avatar.js';

const S = 760, CX = S / 2, CY = S / 2, R0 = 330, RMIN = 120, PR = 25;

const CSS = `
.su { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; padding:6px; min-height:0; }
.su-hud { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
.su-p { display:flex; align-items:center; gap:6px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:3px 10px 3px 4px; font-weight:800; font-size:13px; }
.su-p.dead { opacity:.4; }
.su-wrap { flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; position:relative; }
.su canvas { border-radius:14px; box-shadow:0 10px 26px rgba(31,41,55,.22); max-width:100%; touch-action:none; }
.su-banner { position:absolute; left:50%; top:40%; transform:translate(-50%,-50%); background:#fff; color:var(--on); box-shadow:var(--e2); border-radius:24px; padding:12px 22px; font-weight:900; font-size:24px; text-align:center; pointer-events:none; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const winsNeeded = +api.opts.wins || 3;

  const canvas = h('canvas', { width: S, height: S });
  const ctx = canvas.getContext('2d');
  const hud = h('div.su-hud');
  const banner = h('div.su-banner', { style: 'display:none' });
  const wrap = h('div.su-wrap', canvas, banner);
  const touch = dpad((k, d) => keyEvent(k, d), { actions: [{ label: '💨', key: ' ' }] });
  api.root.append(h('style', CSS), h('div.su', hud, wrap, touch));
  api.cleanup(fitCanvas(canvas, wrap, 1));

  // ------------------------------------------------------------ client
  let snap = null;
  const vis = {};
  const wins = {};
  ids.forEach((id) => (wins[id] = 0));
  api.on('snap', (s) => {
    snap = s;
    for (const p of s.p) { const v = vis[p[0]] || (vis[p[0]] = { x: p[1], y: p[2] }); if (Math.abs(v.x - p[1]) + Math.abs(v.y - p[2]) > 120) { v.x = p[1]; v.y = p[2]; } }
    s.ev?.forEach((e) => api.sfx(e));
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
    hud.replaceChildren(...snap.p.map((p) => { const info = api.player(p[0]); return h('div.su-p' + (p[5] ? '' : '.dead'), avatarEl({ ...info, online: info.online && !info.left }, 'sm', { still: true }), info.name, h('span', { style: 'color:var(--muted);font-size:12px' }, '🏆' + (wins[p[0]] || 0))); }));
  }
  function draw(now) {
    ctx.clearRect(0, 0, S, S);
    const bg = ctx.createRadialGradient(CX, CY, 60, CX, CY, S * 0.75);
    bg.addColorStop(0, '#2a1b4d'); bg.addColorStop(1, '#0d0a1c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
    // lava shimmer
    ctx.fillStyle = 'rgba(255,90,40,.10)';
    for (let i = 0; i < 14; i++) { const a = i * 0.9 + now / 3000; ctx.beginPath(); ctx.arc(CX + Math.cos(a) * 360, CY + Math.sin(a * 1.3) * 360, 70 + (i % 3) * 20, 0, 7); ctx.fill(); }
    if (!snap) return;
    const pr = snap.pr;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(CX, CY + 10, pr + 6, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(CX, CY, 20, CX, CY, pr);
    g.addColorStop(0, '#f0d9a8'); g.addColorStop(1, '#c79a5b');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, pr, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = 'rgba(120,80,40,.35)'; ctx.lineWidth = 2;
    for (let r = 50; r < pr; r += 50) { ctx.beginPath(); ctx.arc(CX, CY, r, 0, 7); ctx.stroke(); }
    for (const p of snap.p) {
      const [id, , , , , alive, fall, dash] = p;
      const v = vis[id];
      if (!alive && !fall) continue;
      const info = api.player(id);
      const sc = fall ? Math.max(0.1, 1 - fall) : 1;
      ctx.save(); ctx.translate(v.x, v.y); ctx.scale(sc, sc); ctx.globalAlpha = fall ? 1 - fall * 0.8 : 1;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 8, PR, PR * 0.55, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = info.color; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, PR + 2, 0, 7); ctx.stroke();
      if (!drawAvatar(ctx, info.avatar, 0, 0, PR * 2.1)) { ctx.fillStyle = info.color; ctx.beginPath(); ctx.arc(0, 0, PR, 0, 7); ctx.fill(); }
      if (dash > 0) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, PR + 9, -Math.PI / 2, -Math.PI / 2 + (1 - dash) * Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      if (alive) {
        ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        ctx.strokeText(info.name, v.x, v.y - PR - 10); ctx.fillText(info.name, v.x, v.y - PR - 10);
        if (id === api.me) { ctx.fillStyle = '#ffd23f'; ctx.fillText('▼', v.x, v.y - PR - 26); }
      }
    }
  }
  api.raf((dt, now) => {
    if (snap) for (const p of snap.p) { const v = vis[p[0]]; const k = Math.min(1, dt * 24); v.x += (p[1] - v.x) * k; v.y += (p[2] - v.y) * k; }
    draw(now);
  });

  // ------------------------------------------------------------ input
  const keys = trackKeys(api, () => sendInput());
  const dirFromKeys = () => {
    let x = 0, y = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) x += 1;
    if (keys.has('ArrowUp') || keys.has('w')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('s')) y += 1;
    return [x, y];
  };
  const virt = new Set();
  let pointerDir = null, last = '';
  function keyEvent(k, down) {
    if (k === ' ') { if (down) api.toHost('dash'); return; }
    if (down) virt.add(k); else virt.delete(k);
    sendInput();
  }
  function sendInput() {
    let [x, y] = dirFromKeys();
    if (virt.has('ArrowLeft')) x -= 1; if (virt.has('ArrowRight')) x += 1; if (virt.has('ArrowUp')) y -= 1; if (virt.has('ArrowDown')) y += 1;
    if (pointerDir) [x, y] = pointerDir;
    const l = Math.hypot(x, y) || 1;
    const out = [+(x / l).toFixed(2), +(y / l).toFixed(2)];
    if (!x && !y) { out[0] = 0; out[1] = 0; }
    const key = out.join(',');
    if (key !== last) { last = key; api.toHost('in', { x: out[0], y: out[1] }); }
  }
  api.listen(window, 'keydown', (e) => { if ((e.key === ' ' || e.key === 'Shift') && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); if (!e.repeat) api.toHost('dash'); } });
  // pointer steering: move toward where you press
  const steer = (e) => {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * S, py = ((e.clientY - r.top) / r.height) * S;
    const me = vis[api.me];
    if (!me) return;
    const dx = px - me.x, dy = py - me.y, d = Math.hypot(dx, dy);
    pointerDir = d < 14 ? [0, 0] : [dx / d, dy / d];
    sendInput();
  };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); steer(e); });
  canvas.addEventListener('pointermove', (e) => { if (pointerDir) steer(e); });
  const pend = () => { pointerDir = null; sendInput(); };
  canvas.addEventListener('pointerup', pend); canvas.addEventListener('pointercancel', pend);

  // ------------------------------------------------------------ host
  if (api.isHost) {
    const G = { p: {}, t: 0, pr: R0, state: 'wait', round: 0, wins: {}, over: false, ev: [] };
    ids.forEach((id) => (G.wins[id] = 0));
    function newRound() {
      G.round++; G.t = 0; G.pr = R0; G.state = 'count';
      const n = ids.length;
      ids.forEach((id, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        G.p[id] = { id, x: CX + Math.cos(a) * 190, y: CY + Math.sin(a) * 190, vx: 0, vy: 0, ix: 0, iy: 0, alive: !api.player(id).left, fall: 0, dash: 0 };
      });
      api.broadcast('msg', { text: `Round ${G.round}\nGet ready…`, wins: G.wins });
      api.timeout(() => { G.state = 'play'; api.broadcast('msg', { text: 'SHOVE!', wins: G.wins }); api.timeout(() => api.broadcast('msg', { text: '', wins: G.wins }), 700); }, 1500);
    }
    function tick(dt) {
      G.t += dt;
      if (G.t > 10) G.pr = Math.max(RMIN, R0 - (G.t - 10) * 5.5);
      const ps = Object.values(G.p);
      for (const p of ps) {
        if (p.dash > 0) p.dash = Math.max(0, p.dash - dt / 1.3);
        if (p.fall) { p.fall += dt * 1.6; p.x += p.vx * dt; p.y += p.vy * dt; if (p.fall >= 1) p.fall = 1; continue; }
        if (!p.alive) continue;
        p.vx += p.ix * 640 * dt; p.vy += p.iy * 640 * dt;
        const damp = Math.pow(0.18, dt);
        p.vx *= damp; p.vy *= damp;
        const sp = Math.hypot(p.vx, p.vy);
        const max = 560;
        if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      // collisions
      const live = ps.filter((p) => p.alive && !p.fall);
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
        if (d < PR * 2) {
          const nx = dx / d, ny = dy / d, ov = (PR * 2 - d) / 2;
          a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
          const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (vn > 0) {
            const j2 = vn * 1.35;
            a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny;
            if (vn > 120) G.ev.push('bump');
          }
        }
      }
      for (const p of live) {
        if (Math.hypot(p.x - CX, p.y - CY) > G.pr + 6) { p.alive = false; p.fall = 0.001; G.ev.push('lose'); }
      }
      const alive = ps.filter((p) => p.alive);
      if (G.state === 'play' && alive.length <= 1 && ids.length > 1) roundOver(alive[0]);
    }
    function roundOver(w) {
      G.state = 'between';
      if (w) G.wins[w.id]++;
      const done = w && G.wins[w.id] >= winsNeeded;
      api.broadcast('msg', { text: w ? `${api.player(w.id).name} wins the round!` : 'Nobody wins!', wins: G.wins });
      api.timeout(() => {
        if (done) {
          G.over = true;
          const ranking = ids.slice().sort((a, b) => G.wins[b] - G.wins[a]).map((id) => ({ id, score: G.wins[id], note: 'round wins' }));
          return api.endGame({ title: `${api.player(w.id).name} is the sumo champion!`, ranking, winners: [w.id] });
        }
        newRound();
      }, 2500);
    }
    api.on('in', ({ x, y }, from) => { const p = G.p[from]; if (p) { p.ix = clamp(+x || 0, -1, 1); p.iy = clamp(+y || 0, -1, 1); } });
    api.on('dash', (_, from) => {
      const p = G.p[from];
      if (!p || !p.alive || p.fall || p.dash > 0 || G.state !== 'play') return;
      let dx = p.ix, dy = p.iy;
      if (!dx && !dy) { const sp = Math.hypot(p.vx, p.vy); if (sp < 5) return; dx = p.vx / sp; dy = p.vy / sp; }
      const l = Math.hypot(dx, dy);
      p.vx += (dx / l) * 470; p.vy += (dy / l) * 470; p.dash = 1; G.ev.push('shoot');
    });
    let lastT = performance.now();
    api.interval(() => {
      if (G.state === 'wait' || G.over) return;
      const now = performance.now();
      let dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      while (dt > 0) { const s = Math.min(dt, 1 / 120); if (G.state === 'play' || G.state === 'between') tick(s); dt -= s; }
      api.broadcast('snap', {
        p: ids.map((id) => { const p = G.p[id]; return [id, +p.x.toFixed(1), +p.y.toFixed(1), +p.vx.toFixed(0), +p.vy.toFixed(0), p.alive ? 1 : 0, +p.fall.toFixed(2), +p.dash.toFixed(2)]; }),
        pr: +G.pr.toFixed(1), ev: G.ev.length ? [...new Set(G.ev)] : undefined,
      });
      G.ev = [];
    }, 33);
    api.onRejoin((id) => api.sendTo(id, 'msg', { text: '', wins: G.wins }));
    api.onLeave((id) => { const p = G.p[id]; if (p) { p.alive = false; p.fall = 0.001; } });
    api.timeout(newRound, 600);
  }
}
