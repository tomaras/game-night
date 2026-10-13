// Pool graphics: the painted table and per-pixel shaded balls that really roll (each ball has an orientation, and its
// numbers, stripe and cue-ball dots turn with it).
import { W, HT, R, POCKETS } from './pool-physics.js';

export const M = 44; // rail width
export const CW = W + M * 2, CH = HT + M * 2;
export const HEAD = { x: W * 0.25, y: HT / 2 };
export const COLORS = ['#f8f8f8', '#f2c500', '#1f58c7', '#d6281e', '#5a2a8c', '#f27f0c', '#0f8a3c', '#7a1c1c', '#161616'];
export const colorOf = (id) => (id === 0 ? COLORS[0] : id === 8 ? COLORS[8] : COLORS[((id - 1) % 8) + 1]);
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The table, painted once at k device pixels per table pixel. */
export function paintTable(k) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(CW * k); cv.height = Math.round(CH * k);
  const c = cv.getContext('2d');
  c.scale(k, k);
  const rnd = rng(7);
  // wood rails
  const wood = c.createLinearGradient(0, 0, 0, CH);
  wood.addColorStop(0, '#9a6137'); wood.addColorStop(0.45, '#6e3f1f'); wood.addColorStop(1, '#3f230d');
  c.fillStyle = wood; c.beginPath(); c.roundRect(0, 0, CW, CH, 30); c.fill();
  for (let i = 0; i < 120; i++) { // grain
    c.strokeStyle = `rgba(${i % 2 ? '28,12,3' : '255,210,150'},${0.035 + rnd() * 0.05})`; c.lineWidth = 0.6 + rnd() * 1.1;
    const y = rnd() * CH; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(CW * 0.3, y + (rnd() - 0.5) * 9, CW * 0.7, y + (rnd() - 0.5) * 9, CW, y + (rnd() - 0.5) * 7); c.stroke();
  }
  const bevel = (inset, w, a, col = '255,226,185') => { c.strokeStyle = `rgba(${col},${a})`; c.lineWidth = w; c.beginPath(); c.roundRect(inset, inset, CW - inset * 2, CH - inset * 2, Math.max(4, 30 - inset)); c.stroke(); };
  bevel(1.5, 2.5, 0.42); bevel(9, 1.5, 0.12, '0,0,0'); bevel(M - 9, 3, 0.45, '0,0,0');
  c.strokeStyle = 'rgba(255,230,190,.18)'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(M - 6, M - 6, W + 12, HT + 12, 6); c.stroke();
  // sights (diamonds)
  const dia = (x, y) => { c.save(); c.translate(x, y); c.rotate(Math.PI / 4); const g = c.createLinearGradient(-5, -5, 5, 5); g.addColorStop(0, '#fff7df'); g.addColorStop(1, '#c9b27d'); c.fillStyle = g; c.fillRect(-4.2, -4.2, 8.4, 8.4); c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 0.8; c.strokeRect(-4.2, -4.2, 8.4, 8.4); c.restore(); };
  for (let i = 1; i < 8; i++) { if (i === 4) continue; dia(M + (W * i) / 8, M / 2 - 1); dia(M + (W * i) / 8, CH - M / 2 + 1); }
  for (let i = 1; i < 4; i++) { dia(M / 2 - 1, M + (HT * i) / 4); dia(CW - M / 2 + 1, M + (HT * i) / 4); }

  c.save(); c.translate(M, M);
  // felt
  c.fillStyle = '#0c5a2e'; c.fillRect(-18, -18, W + 36, HT + 36);
  const felt = c.createRadialGradient(W * 0.46, HT * 0.42, 40, W / 2, HT / 2, W * 0.66);
  felt.addColorStop(0, '#2fa862'); felt.addColorStop(0.55, '#1d8a4d'); felt.addColorStop(1, '#136a3a');
  c.fillStyle = felt; c.fillRect(0, 0, W, HT);
  for (let i = 0; i < 6500; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,40,20'},${0.02 + rnd() * 0.04})`; c.fillRect(rnd() * W, rnd() * HT, 1.2, 1.2); }
  c.lineWidth = 1; for (let x = -HT; x < W; x += 5) { c.strokeStyle = 'rgba(0,0,0,.018)'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + HT, HT); c.stroke(); }
  // the lamp over the table
  const lamp = c.createRadialGradient(W * 0.5, HT * 0.4, 20, W * 0.5, HT * 0.5, W * 0.5);
  lamp.addColorStop(0, 'rgba(255,255,230,.16)'); lamp.addColorStop(1, 'rgba(255,255,230,0)');
  c.fillStyle = lamp; c.fillRect(0, 0, W, HT);
  // markings
  c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(HEAD.x, 8); c.lineTo(HEAD.x, HT - 8); c.stroke();
  c.beginPath(); c.arc(HEAD.x, HT / 2, 58, Math.PI / 2, Math.PI * 1.5); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.26)'; for (const [sx, sy] of [[W * 0.72, HT / 2], [HEAD.x, HT / 2]]) { c.beginPath(); c.arc(sx, sy, 3, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.065)'; c.font = '800 26px sans-serif'; c.textAlign = 'center'; c.fillText('GAME NIGHT', W * 0.5, HT / 2 + 9);
  // cushions: rubber trapezoids with angled mouths, a highlight on the nose and a soft shadow cast onto the cloth
  const T = 17, GAP_C = 33, GAP_M = 25;
  const cushion = (pts, nx, ny) => {
    const [a, b] = [pts[0], pts[1]];
    c.save();
    const g = c.createLinearGradient(a[0], a[1], a[0] - nx * T, a[1] - ny * T);
    g.addColorStop(0, '#2c9a58'); g.addColorStop(0.18, '#1b7f45'); g.addColorStop(1, '#0a4a26');
    c.fillStyle = g; c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke();
    c.restore();
  };
  const shadowAlong = (x0, y0, x1, y1, nx, ny) => { const g = c.createLinearGradient(x0, y0, x0 + nx * 20, y0 + ny * 20); g.addColorStop(0, 'rgba(0,0,0,.34)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x1 + nx * 20, y1 + ny * 20); c.lineTo(x0 + nx * 20, y0 + ny * 20); c.closePath(); c.fill(); };
  for (const [x1, x2] of [[GAP_C, W / 2 - GAP_M], [W / 2 + GAP_M, W - GAP_C]]) {
    shadowAlong(x1, 0, x2, 0, 0, 1); shadowAlong(x1, HT, x2, HT, 0, -1);
    cushion([[x1, 0], [x2, 0], [x2 + 13, -T], [x1 - 13, -T]], 0, 1);
    cushion([[x1, HT], [x2, HT], [x2 + 13, HT + T], [x1 - 13, HT + T]], 0, -1);
  }
  for (const [y1, y2] of [[GAP_C, HT - GAP_C]]) {
    shadowAlong(0, y1, 0, y2, 1, 0); shadowAlong(W, y1, W, y2, -1, 0);
    cushion([[0, y1], [0, y2], [-T, y2 + 13], [-T, y1 - 13]], 1, 0);
    cushion([[W, y1], [W, y2], [W + T, y2 + 13], [W + T, y1 - 13]], -1, 0);
  }
  // pockets: dark leather throat, brass plate, deep hole
  for (const p of POCKETS) {
    const corner = p.r > 20;
    const throat = c.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.r + 12);
    throat.addColorStop(0, '#000'); throat.addColorStop(0.62, '#070707'); throat.addColorStop(0.82, '#1d130b'); throat.addColorStop(1, '#3a2514');
    c.fillStyle = throat; c.beginPath(); c.arc(p.x, p.y, p.r + 12, 0, 7); c.fill();
    const rim = c.createLinearGradient(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
    rim.addColorStop(0, '#f1d28a'); rim.addColorStop(0.5, '#a9803a'); rim.addColorStop(1, '#e6c476');
    c.strokeStyle = rim; c.lineWidth = corner ? 3.2 : 2.6; c.beginPath(); c.arc(p.x, p.y, p.r + 10, 0, 7); c.stroke();
    c.fillStyle = '#000'; c.beginPath(); c.arc(p.x, p.y, p.r - 2, 0, 7); c.fill();
    const hole = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    hole.addColorStop(0, 'rgba(0,0,0,1)'); hole.addColorStop(1, 'rgba(25,18,10,.9)');
    c.fillStyle = hole; c.beginPath(); c.arc(p.x, p.y, p.r - 2, 0, 7); c.fill();
  }
  c.restore();
  // the room's light on the wood, and a vignette
  const sheen = c.createLinearGradient(0, 0, CW, CH);
  sheen.addColorStop(0, 'rgba(255,255,255,.09)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,.16)');
  c.fillStyle = sheen; c.beginPath(); c.roundRect(0, 0, CW, CH, 30); c.fill();
  return cv;
}

// ---------------------------------------------------------------- balls
const TW = 256, TH = 128;
const textures = new Map();
const numberSprites = new Map();
function numberSprite(id) {
  if (numberSprites.has(id)) return numberSprites.get(id);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#000'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 ${id > 9 ? 31 : 40}px sans-serif`;
  c.fillText(String(id), 32, 35);
  if (id === 6 || id === 9) c.fillRect(24, 53, 16, 3.5); // so 6 and 9 can be told apart
  const d = c.getImageData(0, 0, 64, 64).data;
  const a = new Uint8Array(64 * 64); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  numberSprites.set(id, a);
  return a;
}
const DOTS = [[0.62, 0.55, 0.56], [-0.7, 0.3, -0.65], [0.1, -0.95, 0.3], [-0.3, 0.9, 0.3], [0.9, -0.1, -0.42], [-0.85, -0.35, 0.4]].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
function texture(id) {
  if (textures.has(id)) return textures.get(id);
  const data = new Uint8ClampedArray(TW * TH * 3);
  const col = rgb(colorOf(id)), stripe = id > 8, paper = [247, 244, 235];
  const num = id > 0 ? numberSprite(id) : null;
  const rad = 0.5, prj = Math.sin(rad), sm = 0.035;
  for (let ty = 0; ty < TH; ty++) {
    const lat = ((ty + 0.5) / TH) * Math.PI - Math.PI / 2, cl = Math.cos(lat), by = Math.sin(lat);
    for (let tx = 0; tx < TW; tx++) {
      const lon = ((tx + 0.5) / TW - 0.5) * Math.PI * 2, bx = cl * Math.sin(lon), bz = cl * Math.cos(lon);
      let r, g, b;
      if (id === 0) [r, g, b] = [250, 248, 240];
      else if (stripe) [r, g, b] = Math.abs(by) < 0.5 ? col : paper;
      else [r, g, b] = col;
      if (id > 0) {
        const front = bz >= 0, ang = Math.acos(Math.min(1, Math.abs(bz)));
        const inside = Math.max(0, Math.min(1, (rad - ang) / sm));
        if (inside > 0) {
          r += (paper[0] - r) * inside; g += (paper[1] - g) * inside; b += (paper[2] - b) * inside;
          const u = ((front ? bx : -bx) / prj) * 0.5 + 0.5, v = (by / prj) * 0.5 + 0.5;
          if (u >= 0 && u < 1 && v >= 0 && v < 1) { const al = (num[(v * 64 | 0) * 64 + (u * 64 | 0)] / 255) * inside; r *= 1 - al * 0.93; g *= 1 - al * 0.93; b *= 1 - al * 0.93; }
        }
      } else {
        for (const d of DOTS) { const dist = Math.acos(Math.max(-1, Math.min(1, bx * d[0] + by * d[1] + bz * d[2]))); const t = Math.max(0, Math.min(1, (0.13 - dist) / 0.03)); if (t > 0) { r += (206 - r) * t; g += (36 - g) * t; b += (36 - b) * t; } }
      }
      const o = (ty * TW + tx) * 3; data[o] = r; data[o + 1] = g; data[o + 2] = b;
    }
  }
  textures.set(id, data);
  return data;
}

export const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** Turn an orientation matrix (row-major, body -> world) by angular velocity (wx, wy, wz) over dt. */
export function spinBy(m, wx, wy, wz, dt) {
  const w = Math.hypot(wx, wy, wz), th = w * dt;
  if (th < 1e-5) return false;
  const kx = wx / w, ky = wy / w, kz = wz / w, c = Math.cos(th), s = Math.sin(th), t = 1 - c;
  const r = [c + kx * kx * t, kx * ky * t - kz * s, kx * kz * t + ky * s, ky * kx * t + kz * s, c + ky * ky * t, ky * kz * t - kx * s, kz * kx * t - ky * s, kz * ky * t + kx * s, c + kz * kz * t];
  const o = m.slice();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] = r[i * 3] * o[j] + r[i * 3 + 1] * o[3 + j] + r[i * 3 + 2] * o[6 + j];
  // keep it a proper rotation (cheap Gram-Schmidt on the first two columns)
  const n0 = Math.hypot(m[0], m[3], m[6]); m[0] /= n0; m[3] /= n0; m[6] /= n0;
  const d = m[0] * m[1] + m[3] * m[4] + m[6] * m[7]; m[1] -= d * m[0]; m[4] -= d * m[3]; m[7] -= d * m[6];
  const n1 = Math.hypot(m[1], m[4], m[7]); m[1] /= n1; m[4] /= n1; m[7] /= n1;
  m[2] = m[3] * m[7] - m[6] * m[4]; m[5] = m[6] * m[1] - m[0] * m[7]; m[8] = m[0] * m[4] - m[3] * m[1];
  return true;
}
export function randomOrientation(id) {
  const m = identity();
  const a = Math.random() * Math.PI * 2;
  if (id === 0) { spinBy(m, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() * 6); return m; }
  spinBy(m, 0, 0, 1, a); spinBy(m, Math.random() - 0.5, Math.random() - 0.5, 0, 0.9);
  return m;
}

/** One ball's sprite, shaded per pixel. `light` is the unit direction towards the light, in table coordinates (z toward the viewer). */
export function makeSprite(k) {
  const S = Math.ceil(2 * R * k) + 4;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const img = c.createImageData(S, S);
  return { cv, c, img, S, k };
}
export function drawSprite(sp, id, m, light) {
  const { S, img, k } = sp, d = img.data, tex = texture(id), cen = S / 2, rp = R * k;
  const [lx, ly, lz] = light;
  const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz);
  const Hx = hx / hl, Hy = hy / hl, Hz = hz / hl;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const o = (py * S + px) * 4;
      const dx = (px + 0.5 - cen) / rp, dy = (py + 0.5 - cen) / rp, r2 = dx * dx + dy * dy, rr = Math.sqrt(r2);
      const cover = Math.max(0, Math.min(1, (1 - rr) * rp + 0.5));
      if (cover <= 0) { d[o + 3] = 0; continue; }
      let nx = dx, ny = dy, nz;
      if (r2 >= 1) { nx /= rr; ny /= rr; nz = 0; } else nz = Math.sqrt(1 - r2);
      const bx = m[0] * nx + m[3] * ny + m[6] * nz, by = m[1] * nx + m[4] * ny + m[7] * nz, bz = m[2] * nx + m[5] * ny + m[8] * nz;
      const lon = Math.atan2(bx, bz), lat = Math.asin(by > 1 ? 1 : by < -1 ? -1 : by);
      let tx = ((lon / (Math.PI * 2) + 0.5) * TW) | 0, ty = ((lat / Math.PI + 0.5) * TH) | 0;
      if (tx >= TW) tx = TW - 1; if (ty >= TH) ty = TH - 1; if (ty < 0) ty = 0;
      const t = (ty * TW + tx) * 3;
      const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
      let shade = 0.34 + 0.8 * diff;
      shade *= 0.74 + 0.26 * nz; // the edge turns away from the light
      const hd = Math.max(0, nx * Hx + ny * Hy + nz * Hz);
      const spec = Math.pow(hd, 46) * 0.9 + Math.pow(hd, 9) * 0.12;
      const bounce = Math.max(0, -(nx * lx + ny * ly)) * 0.22 * (1 - nz); // cloth bounces a little green light up under the ball
      d[o] = Math.min(255, tex[t] * shade + spec * 255 + 10 * bounce);
      d[o + 1] = Math.min(255, tex[t + 1] * shade + spec * 255 + 46 * bounce);
      d[o + 2] = Math.min(255, tex[t + 2] * shade + spec * 255 + 22 * bounce);
      d[o + 3] = cover * 255;
    }
  }
  sp.c.putImageData(img, 0, 0);
  return sp.cv;
}
