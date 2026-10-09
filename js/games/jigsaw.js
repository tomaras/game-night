// Jigsaw Together — a cooperative jigsaw puzzle. Everyone drags pieces on the same table at the same time;
// pieces that fit snap together. Play with a generated picture or upload your own photo. 1–10 players.
import { h, makeRng } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';

const IW = 960, IH = 640; // master picture size
const WW = 1600, WH = 1100; // table size
const OX = (WW - IW) / 2, OY = (WH - IH) / 2;
const PCOL = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#f9a825', '#6d4c41', '#d81b60', '#546e7a'];
const GRIDS = { 24: [6, 4], 48: [8, 6], 96: [12, 8] };

function artwork(seed) {
  const rng = makeRng(seed ^ 0x51ed270b);
  const cv = document.createElement('canvas'); cv.width = IW; cv.height = IH;
  const c = cv.getContext('2d');
  const hue = rng.int(360);
  const sky = c.createLinearGradient(0, 0, 0, IH * 0.7);
  sky.addColorStop(0, `hsl(${hue}, 70%, 28%)`); sky.addColorStop(0.5, `hsl(${(hue + 40) % 360}, 80%, 58%)`); sky.addColorStop(1, `hsl(${(hue + 70) % 360}, 90%, 78%)`);
  c.fillStyle = sky; c.fillRect(0, 0, IW, IH);
  for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,255,255,${rng.range(0.15, 0.8)})`; c.beginPath(); c.arc(rng.range(0, IW), rng.range(0, IH * 0.4), rng.range(0.8, 2.6), 0, 7); c.fill(); }
  const sun = { x: rng.range(240, 720), y: rng.range(150, 260), r: rng.range(60, 95) };
  const sg = c.createRadialGradient(sun.x, sun.y, 5, sun.x, sun.y, sun.r * 2.4);
  sg.addColorStop(0, 'rgba(255,250,210,1)'); sg.addColorStop(0.3, 'rgba(255,220,130,.85)'); sg.addColorStop(1, 'rgba(255,200,120,0)');
  c.fillStyle = sg; c.beginPath(); c.arc(sun.x, sun.y, sun.r * 2.4, 0, 7); c.fill();
  c.fillStyle = '#fff6c9'; c.beginPath(); c.arc(sun.x, sun.y, sun.r, 0, 7); c.fill();
  for (let k = 0; k < 4; k++) { // clouds
    const cx = rng.range(60, IW - 60), cy = rng.range(60, 300);
    c.fillStyle = 'rgba(255,255,255,.55)';
    for (let j = 0; j < 6; j++) { c.beginPath(); c.ellipse(cx + j * 28 - 70, cy + rng.range(-10, 10), rng.range(30, 60), rng.range(14, 26), 0, 0, 7); c.fill(); }
  }
  const layers = 6;
  for (let l = 0; l < layers; l++) { // hills
    const base = IH * (0.42 + l * 0.1), amp = 60 - l * 6, f1 = rng.range(0.004, 0.009), f2 = rng.range(0.011, 0.02), ph = rng.range(0, 7);
    c.fillStyle = `hsl(${(hue + 120 + l * 22) % 360}, ${50 + l * 4}%, ${50 - l * 7}%)`;
    c.beginPath(); c.moveTo(0, IH);
    for (let x = 0; x <= IW; x += 8) c.lineTo(x, base + Math.sin(x * f1 + ph) * amp + Math.sin(x * f2 + ph * 2) * amp * 0.4);
    c.lineTo(IW, IH); c.closePath(); c.fill();
    for (let i = 0; i < 26; i++) { // trees / flowers
      const x = rng.range(0, IW), y = base + Math.sin(x * f1 + ph) * amp + 12 + rng.range(0, 28);
      if (l % 2) { c.fillStyle = `hsl(${rng.int(360)},85%,62%)`; c.beginPath(); c.arc(x, y, rng.range(2, 5), 0, 7); c.fill(); }
      else { c.fillStyle = `hsl(${(hue + 150) % 360},50%,${22 + l * 4}%)`; c.beginPath(); c.moveTo(x, y - 26); c.lineTo(x - 10, y); c.lineTo(x + 10, y); c.fill(); }
    }
  }
  c.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i < 140; i++) c.fillRect(rng.range(0, IW), rng.range(0, IH), rng.range(8, 50), 2);
  return cv;
}

function edgeTo(ctx, x0, y0, x1, y1, s) {
  if (!s) { ctx.lineTo(x1, y1); return; }
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = (uy * s), ny = (-ux * s);
  const P = (a, b) => [x0 + ux * L * a + nx * L * b, y0 + uy * L * a + ny * L * b];
  const seg = (a1, b1, a2, b2, a3, b3) => { const p1 = P(a1, b1), p2 = P(a2, b2), p3 = P(a3, b3); ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]); };
  const st = P(0.38, 0); ctx.lineTo(st[0], st[1]);
  seg(0.44, 0, 0.43, 0.07, 0.40, 0.10);
  seg(0.35, 0.17, 0.43, 0.25, 0.50, 0.25);
  seg(0.57, 0.25, 0.65, 0.17, 0.60, 0.10);
  seg(0.57, 0.07, 0.56, 0, 0.62, 0);
  ctx.lineTo(x1, y1);
}

const CSS = `
.jg { flex:1; display:flex; flex-direction:column; min-height:0; padding:6px; gap:6px; }
.jg-bar { display:flex; gap:8px; align-items:center; justify-content:center; flex-wrap:wrap; font:700 13px var(--font); }
.jg-wrap { flex:1; min-height:0; position:relative; border-radius:22px; overflow:hidden; box-shadow:var(--e2); background:#3b5b4a; touch-action:none; }
.jg-wrap canvas { width:100%; height:100%; display:block; touch-action:none; }
.jg-zoom { position:absolute; right:10px; top:10px; display:flex; flex-direction:column; gap:6px; } .jg-zoom button { width:40px; height:40px; border-radius:12px; border:0; background:#fff; box-shadow:var(--e1); display:grid; place-items:center; cursor:pointer; color:var(--on); }
.jg-pick { text-align:center; display:flex; flex-direction:column; gap:12px; align-items:center; max-width:420px; margin:auto; }
.jg-pick .pv { width:100%; border-radius:20px; box-shadow:var(--e2); }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const nameOf = (id) => api.player(id)?.name || '?';
  const count = +api.opts.pieces || 48;
  const [COLS, ROWS] = GRIDS[count] || GRIDS[48];
  const PW = IW / COLS, PH = IH / ROWS, M = Math.max(PW, PH) * 0.28, TH = Math.min(PW, PH);
  const root = h('div.jg');
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d');
  const wrap = h('div.jg-wrap', canvas, h('div.jg-zoom', h('button', { 'aria-label': 'Zoom in', onclick: () => zoomBy(1.5) }, icon('add')), h('button', { 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.5) }, icon('remove')), h('button', { 'aria-label': 'Fit table', onclick: () => resetView() }, icon('crop_free'))));
  const bar = h('div.jg-bar');
  api.root.append(h('style', CSS), root);

  // ---- edges (deterministic from the seed so every client builds identical pieces)
  const er = makeRng(api.seed ^ 0x2545f491);
  const hz = Array.from({ length: ROWS - 1 }, () => Array.from({ length: COLS }, () => (er.next() < 0.5 ? 1 : -1))); // edge below piece (r,c)
  const vt = Array.from({ length: ROWS }, () => Array.from({ length: COLS - 1 }, () => (er.next() < 0.5 ? 1 : -1))); // edge right of piece (r,c)
  const idx = (r, c) => r * COLS + c;
  const sides = (r, c) => ({ top: r > 0 ? -hz[r - 1][c] : 0, right: c < COLS - 1 ? vt[r][c] : 0, bottom: r < ROWS - 1 ? hz[r][c] : 0, left: c > 0 ? -vt[r][c - 1] : 0 });

  const S = { phase: 'pick', pos: [], grp: [], z: {}, holders: {}, picked: false, done: null, t0: 0, snaps: {} };
  let master = null; const bmps = [];
  const V = { s: 1, x: 0, y: 0 };
  let cw = 300, ch = 300, inited = false;

  function setMaster(src) {
    master = src;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const sd = sides(r, c);
      const pc = document.createElement('canvas'); pc.width = Math.ceil(PW + 2 * M); pc.height = Math.ceil(PH + 2 * M);
      const g = pc.getContext('2d');
      const path = new Path2D();
      const x0 = M, y0 = M, x1 = M + PW, y1 = M + PH;
      const p = { ctx: { lineTo: (x, y) => path.lineTo(x, y), bezierCurveTo: (a, b, c2, d, e, f) => path.bezierCurveTo(a, b, c2, d, e, f) } };
      path.moveTo(x0, y0);
      edgeTo(p.ctx, x0, y0, x1, y0, sd.top); edgeTo(p.ctx, x1, y0, x1, y1, sd.right); edgeTo(p.ctx, x1, y1, x0, y1, sd.bottom); edgeTo(p.ctx, x0, y1, x0, y0, sd.left);
      path.closePath();
      g.save(); g.clip(path);
      g.drawImage(master, c * PW - M, r * PH - M, PW + 2 * M, PH + 2 * M, 0, 0, pc.width, pc.height);
      g.restore();
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = Math.max(1.5, TH * 0.04); g.stroke(path);
      g.save(); g.clip(path); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1.5, TH * 0.05); g.translate(1, 1); g.stroke(path); g.restore();
      bmps[idx(r, c)] = pc;
    }
  }

  function fitS() { return Math.min(cw / WW, ch / WH); }
  function clampV() {
    const lo = fitS() * 0.9, hi = fitS() * 8;
    V.s = Math.min(hi, Math.max(lo, V.s));
    const mw = WW * V.s, mh = WH * V.s;
    V.x = mw <= cw ? (cw - mw) / 2 : Math.min(0, Math.max(cw - mw, V.x));
    V.y = mh <= ch ? (ch - mh) / 2 : Math.min(0, Math.max(ch - mh, V.y));
  }
  function resetView() { V.s = fitS(); V.x = (cw - WW * V.s) / 2; V.y = (ch - WH * V.s) / 2; clampV(); }
  function zoomBy(f, cx = cw / 2, cy = ch / 2) { const ns = Math.min(fitS() * 8, Math.max(fitS() * 0.9, V.s * f)), k = ns / V.s; V.x = cx - (cx - V.x) * k; V.y = cy - (cy - V.y) * k; V.s = ns; clampV(); }
  function resize() {
    const r = wrap.getBoundingClientRect(); if (!r.width) return;
    cw = r.width; ch = r.height;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    if (!inited) { inited = true; resetView(); } else clampV();
  }
  const ro = new ResizeObserver(resize);
  api.cleanup(() => ro.disconnect());

  // ---- drawing
  api.raf(() => {
    if (!cw || S.phase === 'pick') return;
    const dpr = canvas.width / cw;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#3b5b4a'; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(dpr * V.s, 0, 0, dpr * V.s, dpr * V.x, dpr * V.y);
    // table + ghost outline of the finished picture
    ctx.fillStyle = '#486c58'; ctx.fillRect(0, 0, WW, WH);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3 / V.s; ctx.setLineDash([14 / V.s, 10 / V.s]); ctx.strokeRect(OX, OY, IW, IH); ctx.setLineDash([]);
    if (master && prevAlpha > 0) { ctx.globalAlpha = prevAlpha; ctx.drawImage(master, OX, OY, IW, IH); ctx.globalAlpha = 1; }
    else if (master) { ctx.globalAlpha = 0.07; ctx.drawImage(master, OX, OY, IW, IH); ctx.globalAlpha = 1; }
    const order = S.pos.map((_, i) => i).sort((a, b) => (S.z[S.grp[a]] || 0) - (S.z[S.grp[b]] || 0));
    for (const i of order) {
      const bm = bmps[i]; if (!bm) continue;
      const [x, y] = S.pos[i];
      const holder = S.holders[S.grp[i]];
      if (holder) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 14 / V.s; ctx.shadowOffsetY = 6 / V.s; }
      ctx.drawImage(bm, x - M, y - M);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      if (holder && holder !== api.me) { ctx.strokeStyle = PCOL[ids.indexOf(holder) % 10]; ctx.lineWidth = 5 / V.s; ctx.strokeRect(x, y, PW, PH); }
    }
  });
  let prevAlpha = 0;

  // ---- pointer handling
  const ptrs = new Map();
  let drag = null, pan = null, lastDist = 0;
  const toWorld = (cx, cy) => [(cx - V.x) / V.s, (cy - V.y) / V.s];
  function hit(wx, wy) {
    const order = S.pos.map((_, i) => i).sort((a, b) => (S.z[S.grp[b]] || 0) - (S.z[S.grp[a]] || 0));
    return order.find((i) => { const [x, y] = S.pos[i]; return wx >= x - 4 && wx <= x + PW + 4 && wy >= y - 4 && wy <= y + PH + 4; });
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (S.phase !== 'play') return;
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
    ptrs.set(e.pointerId, [px, py]);
    if (ptrs.size === 2) { drag = null; pan = null; lastDist = 0; return; }
    const [wx, wy] = toWorld(px, py);
    const i = hit(wx, wy);
    if (i !== undefined && !S.holders[S.grp[i]]) {
      const g = S.grp[i];
      const members = S.pos.map((_, k) => k).filter((k) => S.grp[k] === g);
      drag = { i, g, members, start: members.map((k) => [...S.pos[k]]), wx, wy, sent: 0 };
      S.holders[g] = api.me; S.z[g] = Math.max(0, ...Object.values(S.z)) + 1;
      api.toHost('grab', { i });
    } else pan = { px, py };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const r = canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [px, py]);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (lastDist) zoomBy(d / lastDist, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      lastDist = d; return;
    }
    if (drag) {
      const [wx, wy] = toWorld(px, py);
      const dx = wx - drag.wx, dy = wy - drag.wy;
      drag.members.forEach((k, n) => { S.pos[k] = [drag.start[n][0] + dx, drag.start[n][1] + dy]; });
      const now = performance.now();
      if (now - drag.sent > 45) { drag.sent = now; const p = S.pos[drag.i]; api.toHost('move', { i: drag.i, x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10 }); }
    } else if (pan) { V.x += px - prev[0]; V.y += py - prev[1]; clampV(); }
  });
  const end = (e) => {
    ptrs.delete(e.pointerId);
    if (drag) { const p = S.pos[drag.i]; api.toHost('drop', { i: drag.i, x: Math.round(p[0] * 10) / 10, y: Math.round(p[1] * 10) / 10 }); delete S.holders[drag.g]; drag = null; }
    pan = null; lastDist = 0;
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.2 : 0.83, e.clientX - r.left, e.clientY - r.top); }, { passive: false });

  // ---- network
  const decode = (url) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = url; });
  api.on('img', async (m) => {
    previewURL = m.url;
    const im = await decode(m.url);
    setMaster(im);
    render();
  });
  api.on('start', (m) => { S.phase = 'play'; S.t0 = performance.now(); applyPieces(m.p); S.z = m.z || {}; render(); requestAnimationFrame(() => { resize(); resetView(); }); });
  api.on('upd', (m) => {
    for (const [i, x, y, g] of m.p) { if (drag && drag.members.includes(i) && !m.final) continue; S.pos[i] = [x, y]; S.grp[i] = g; }
    S.holders = {}; Object.entries(m.hold || {}).forEach(([g, id]) => (S.holders[g] = id));
    if (drag) S.holders[drag.g] = api.me;
    S.z = { ...S.z, ...(m.z || {}) };
    if (m.snd) api.sfx(m.snd);
    if (m.stat) { S.snaps = m.stat; renderBar(); }
  });
  api.on('done', (m) => { S.phase = 'done'; S.done = m; api.sfx('win'); render(); });
  function applyPieces(p) { p.forEach(([i, x, y, g]) => { S.pos[i] = [x, y]; S.grp[i] = g; }); }
  api.onPlayersChanged(renderBar);

  function renderBar() {
    const groups = new Set(S.grp).size;
    bar.replaceChildren(h('span.chip.blue', icon('extension', 'sm'), `${Math.round(((count - groups) / (count - 1)) * 100)}% done`), h('span.chip.yellow', `${groups} group${groups === 1 ? '' : 's'}`),
      h('button.btn.small.tonal', { onmousedown: () => (prevAlpha = 0.95), onmouseup: () => (prevAlpha = 0), onmouseleave: () => (prevAlpha = 0), ontouchstart: (e) => { e.preventDefault(); prevAlpha = 0.95; }, ontouchend: () => (prevAlpha = 0), onclick: () => {} }, icon('visibility'), 'Hold to peek'),
      ...ids.map((id) => h('span.chip', { style: `background:${PCOL[ids.indexOf(id) % 10]}22` }, avatarEl(api.player(id), 'xs', { still: true }), nameOf(id).slice(0, 8), S.snaps[id] ? ` ${S.snaps[id]}` : '')));
  }
  function render() {
    if (S.phase === 'pick') {
      if (api.isHost) {
        root.replaceChildren(h('div.jg-pick', h('div.kt-prompt', { style: '--pc:#43a047' }, h('small', 'Jigsaw Together'), 'Choose a picture'),
          master ? h('img.pv', { src: previewURL }) : h('div.kt-hint', 'Pick a picture for the puzzle:'),
          h('div.kt-row', { style: 'justify-content:center' }, h('button.btn.tonal', { onclick: () => surprise() }, icon('shuffle'), 'Surprise me'), h('button.btn.tonal', { onclick: () => fileIn.click() }, icon('add_a_photo'), 'Use my photo')),
          master ? h('button.btn.primary.big', { onclick: () => api.toHost('begin', {}) }, icon('play_arrow'), `Start ${count}-piece puzzle`) : ''));
      } else root.replaceChildren(h('div.jg-pick', h('div.kt-prompt', { style: '--pc:#43a047' }, h('small', 'Jigsaw Together'), 'The host is choosing a picture…'), master ? h('div.kt-hint', 'Picture ready!') : ''));
      return;
    }
    if (S.phase === 'done' && S.done) {
      root.replaceChildren(h('div.jg-pick', h('div.kt-prompt', { style: '--pc:#43a047' }, h('small', 'Puzzle complete!'), `🧩 Done in ${S.done.time}`), h('img.pv', { src: previewURL || '' }), h('div.kt-hint', 'Great teamwork!')));
      return;
    }
    root.replaceChildren(bar, wrap);
    ro.disconnect(); ro.observe(wrap);
    renderBar();
  }
  let previewURL = '';
  if (window.__gnDebug) window.__jg = { S, api, COLS, ROWS, PW, PH, OX, OY, bmps, V, get master() { return master; } };
  const fileIn = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async (e) => { const f = e.target.files?.[0]; if (!f) return; const im = await decode(URL.createObjectURL(f)); const cv = document.createElement('canvas'); cv.width = IW; cv.height = IH; const g = cv.getContext('2d'); const k = Math.max(IW / im.width, IH / im.height), w = im.width * k, hh = im.height * k; g.drawImage(im, (IW - w) / 2, (IH - hh) / 2, w, hh); api.toHost('image', { url: cv.toDataURL('image/jpeg', 0.75) }); } });
  api.root.append(fileIn);
  function surprise() { api.toHost('image', { seed: Math.floor(Math.random() * 1e9) }); }

  if (api.isHost) {
    const rng = api.rng;
    const H = { pos: [], grp: [], z: {}, holders: {}, snaps: {}, zc: 1, t0: 0, phase: 'pick', imgUrl: '', dirty: new Set(), final: false, snd: null };
    ids.forEach((id) => (H.snaps[id] = 0));
    api.cleanup(() => {});
    api.on('image', async (m, from) => {
      if (from !== api.me || H.phase !== 'pick') return;
      let url = m.url;
      if (!url) { const cv = artwork(m.seed || Math.floor(Math.random() * 1e9)); url = cv.toDataURL('image/jpeg', 0.8); }
      if (typeof url !== 'string' || !url.startsWith('data:image/') || url.length > 900_000) return;
      H.imgUrl = url;
      sendImage(null);
    });
    const sendImage = (to) => { if (to) api.sendTo(to, 'img', { url: H.imgUrl }); else api.broadcast('img', { url: H.imgUrl }); };
    api.on('begin', (_, from) => {
      if (from !== api.me || H.phase !== 'pick' || !H.imgUrl) return;
      H.phase = 'play'; H.t0 = performance.now();
      const n = COLS * ROWS;
      H.pos = []; H.grp = [];
      for (let i = 0; i < n; i++) {
        let x, y, tries = 0;
        do { x = rng.range(10, WW - PW - 10); y = rng.range(10, WH - PH - 10); tries++; } while (tries < 40 && x > OX - PW && x < OX + IW && y > OY - PH && y < OY + IH);
        H.pos[i] = [x, y]; H.grp[i] = i; H.z[i] = i;
      }
      H.zc = n;
      api.broadcast('start', { p: H.pos.map((p, i) => [i, p[0], p[1], H.grp[i]]), z: H.z });
      api.interval(flush, 60);
    });
    const membersOf = (g) => H.grp.map((gg, k) => (gg === g ? k : -1)).filter((k) => k >= 0);
    const touch = (ks) => ks.forEach((k) => H.dirty.add(k));
    function flush() {
      if (!H.dirty.size && !H.final) return;
      const p = [...H.dirty].map((i) => [i, Math.round(H.pos[i][0] * 10) / 10, Math.round(H.pos[i][1] * 10) / 10, H.grp[i]]);
      api.broadcast('upd', { p, hold: H.holders, z: H.zNew, snd: H.snd, stat: H.statDirty ? H.snaps : undefined, final: H.final || undefined });
      H.dirty.clear(); H.zNew = undefined; H.snd = null; H.statDirty = false; H.final = false;
    }
    api.on('grab', ({ i }, from) => {
      if (H.phase !== 'play' || !(i >= 0 && i < H.pos.length)) return;
      const g = H.grp[i];
      if (H.holders[g] && H.holders[g] !== from) return;
      for (const [gg, id] of Object.entries(H.holders)) if (id === from) delete H.holders[gg];
      H.holders[g] = from; H.zc++; H.z[g] = H.zc; H.zNew = { ...(H.zNew || {}), [g]: H.zc }; touch([i]);
    });
    api.on('move', ({ i, x, y }, from) => {
      if (H.phase !== 'play' || !(i >= 0 && i < H.pos.length)) return;
      const g = H.grp[i];
      if (H.holders[g] !== from) return;
      const dx = x - H.pos[i][0], dy = y - H.pos[i][1];
      const ms = membersOf(g);
      ms.forEach((k) => { H.pos[k] = [H.pos[k][0] + dx, H.pos[k][1] + dy]; });
      touch(ms);
    });
    api.on('drop', ({ i, x, y }, from) => {
      if (H.phase !== 'play' || !(i >= 0 && i < H.pos.length)) return;
      let g = H.grp[i];
      if (H.holders[g] !== from) return;
      const ms0 = membersOf(g);
      const dx = x - H.pos[i][0], dy = y - H.pos[i][1];
      ms0.forEach((k) => { H.pos[k] = [H.pos[k][0] + dx, H.pos[k][1] + dy]; });
      delete H.holders[g];
      const thr = Math.min(PW, PH) * 0.3;
      let merged = 0, again = true;
      while (again) {
        again = false;
        const ms = membersOf(g);
        let best = null;
        for (const k of ms) {
          const r = Math.floor(k / COLS), c = k % COLS;
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
            const n = idx(rr, cc); if (H.grp[n] === g) continue;
            const ex = H.pos[n][0] - H.pos[k][0] - dc * PW, ey = H.pos[n][1] - H.pos[k][1] - dr * PH;
            const err = Math.hypot(ex, ey);
            if (err < thr && (!best || err < best.err)) best = { err, n, ex, ey };
          }
        }
        if (best) {
          // snap this group onto the neighbour's group, then merge
          const mv = membersOf(g); const og = H.grp[best.n];
          mv.forEach((k) => { H.pos[k] = [H.pos[k][0] + best.ex, H.pos[k][1] + best.ey]; });
          mv.forEach((k) => (H.grp[k] = og));
          g = og; merged++; again = true;
          H.zc++; H.z[g] = H.zc; H.zNew = { ...(H.zNew || {}), [g]: H.zc };
        }
      }
      const all = membersOf(g);
      touch(all); touch(ms0);
      if (merged) { H.snaps[from] += merged; H.statDirty = true; H.snd = 'good'; } else H.snd = 'pop';
      H.final = true;
      flush();
      if (new Set(H.grp).size === 1) complete();
    });
    function complete() {
      H.phase = 'done';
      const sec = Math.round((performance.now() - H.t0) / 1000);
      const time = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      api.broadcast('done', { time });
      api.timeout(() => {
        const ranking = ids.slice().sort((a, b) => H.snaps[b] - H.snaps[a]).map((id) => ({ id, score: H.snaps[id], note: 'connections' }));
        api.endGame({ title: '🧩 Puzzle complete!', subtitle: `${count} pieces in ${time}`, ranking, winners: ids.slice() });
      }, 4500);
    }
    api.onRejoin((id) => { if (H.imgUrl) sendImage(id); if (H.phase === 'play') api.sendTo(id, 'start', { p: H.pos.map((p, i) => [i, p[0], p[1], H.grp[i]]), z: H.z }); });
    api.onLeave((id) => { for (const [g, who] of Object.entries(H.holders)) if (who === id) { delete H.holders[g]; } });
  }
  render();
}
