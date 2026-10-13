// Pool graphics: the painted table and per-pixel shaded balls that really roll (each ball has an orientation, and its
// numbers, stripe and cue-ball dots turn with it).
import { W, HT, R, POCKETS, CUSH } from './pool-physics.js';

export const M = 54; // rail width
export const CW = W + M * 2, CH = HT + M * 2;
export const HEAD = { x: W * 0.25, y: HT / 2 };
export const COLORS = ['#f8f8f8', '#f2c500', '#1f58c7', '#d6281e', '#5a2a8c', '#f27f0c', '#0f8a3c', '#7a1c1c', '#161616'];
export const colorOf = (id) => (id === 0 ? COLORS[0] : id === 8 ? COLORS[8] : COLORS[((id - 1) % 8) + 1]);
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The table, painted once at k device pixels per table pixel: lacquered walnut rails with a rounded profile, mother-of-pearl
 *  sights, leather pocket liners under chrome caps, a cloth bed lit by a long lamp, and cushions with a real nose and jaws. */
export function paintTable(k) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(CW * k); cv.height = Math.round(CH * k);
  const c = cv.getContext('2d');
  c.scale(k, k);
  const rnd = rng(11);
  const { T, GC, GM, JC, JM } = CUSH;

  // ---- rails: walnut, with grain, then a rounded cross-section (dark outer edge, a long highlight, dark where it meets the cloth)
  c.save();
  c.beginPath(); c.roundRect(0, 0, CW, CH, 28); c.clip();
  c.fillStyle = '#5b3217'; c.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 260; i++) {
    const horiz = i % 2 === 0;
    c.strokeStyle = `rgba(${rnd() < 0.5 ? '20,8,2' : '160,96,52'},${0.06 + rnd() * 0.12})`; c.lineWidth = 0.5 + rnd() * 1.6;
    c.beginPath();
    if (horiz) { const y = rnd() * CH; c.moveTo(0, y); c.bezierCurveTo(CW * 0.33, y + (rnd() - 0.5) * 6, CW * 0.66, y + (rnd() - 0.5) * 6, CW, y + (rnd() - 0.5) * 5); }
    else { const x = rnd() * CW; c.moveTo(x, 0); c.bezierCurveTo(x + (rnd() - 0.5) * 6, CH * 0.33, x + (rnd() - 0.5) * 6, CH * 0.66, x + (rnd() - 0.5) * 5, CH); }
    c.stroke();
  }
  const side = (poly, x0, y0, nx, ny) => { // nx,ny point from the outer edge towards the cloth
    c.save(); c.beginPath(); c.moveTo(...poly[0]); for (const p of poly.slice(1)) c.lineTo(...p); c.closePath(); c.clip();
    const g = c.createLinearGradient(x0, y0, x0 + nx * M, y0 + ny * M);
    g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(0.12, 'rgba(0,0,0,.05)'); g.addColorStop(0.34, 'rgba(255,200,140,.12)');
    g.addColorStop(0.44, 'rgba(255,225,190,.20)'); g.addColorStop(0.6, 'rgba(255,200,140,.03)'); g.addColorStop(0.88, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
    c.fillStyle = g; c.fillRect(0, 0, CW, CH); c.restore();
  };
  side([[0, 0], [CW, 0], [CW - M, M], [M, M]], 0, 0, 0, 1);
  side([[0, CH], [CW, CH], [CW - M, CH - M], [M, CH - M]], 0, CH, 0, -1);
  side([[0, 0], [M, M], [M, CH - M], [0, CH]], 0, 0, 1, 0);
  side([[CW, 0], [CW - M, M], [CW - M, CH - M], [CW, CH]], CW, 0, -1, 0);
  // mitre joints
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1;
  for (const [a, b] of [[[0, 0], [M, M]], [[CW, 0], [CW - M, M]], [[0, CH], [M, CH - M]], [[CW, CH], [CW - M, CH - M]]]) { c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); }
  c.restore();
  // a lacquer glint along the outside edge
  c.strokeStyle = 'rgba(255,240,220,.35)'; c.lineWidth = 1.2; c.beginPath(); c.roundRect(1.5, 1.5, CW - 3, CH - 3, 27); c.stroke();

  // ---- sights: small mother-of-pearl diamonds set into the rail
  const dia = (x, y) => {
    c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
    const g = c.createLinearGradient(-4, -4, 4, 4); g.addColorStop(0, '#fffaf0'); g.addColorStop(0.5, '#e8e1d2'); g.addColorStop(1, '#bdb3a1');
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(-3.4, -2.6, 7.4, 7.4);
    c.fillStyle = g; c.fillRect(-3.6, -3.6, 7.2, 7.2); c.restore();
  };
  for (let i = 1; i < 8; i++) { if (i === 4) continue; dia(M + (W * i) / 8, M * 0.42); dia(M + (W * i) / 8, CH - M * 0.42); }
  for (let i = 1; i < 4; i++) { dia(M * 0.42, M + (HT * i) / 4); dia(CW - M * 0.42, M + (HT * i) / 4); }

  // ---- pockets cut into the rail: a black rubber liner with a soft lip of light on the far side
  for (const p of POCKETS) {
    const cx = M + p.x, cy = M + p.y, rr = p.r + 5;
    const lip = c.createRadialGradient(cx - p.x * 0.02, cy - p.y * 0.02, p.r - 2, cx, cy, rr + 1.5);
    lip.addColorStop(0, '#050505'); lip.addColorStop(0.7, '#141414'); lip.addColorStop(0.92, '#2c2c2c'); lip.addColorStop(1, 'rgba(0,0,0,.0)');
    c.fillStyle = lip; c.beginPath(); c.arc(cx, cy, rr + 1.5, 0, Math.PI * 2); c.fill();
  }

  // ---- the cloth: bed + cushions share one cloth, lit by a long lamp
  const CL = '#1d7a45';
  c.save(); c.translate(M, M);
  c.fillStyle = CL; c.fillRect(-T, -T, W + 2 * T, HT + 2 * T);
  // lamp: a wide soft ellipse of light, brighter at the middle of the table
  c.save(); c.translate(W / 2, HT / 2); c.scale(1, 0.55);
  const lamp = c.createRadialGradient(0, 0, 30, 0, 0, W * 0.62);
  lamp.addColorStop(0, 'rgba(120,255,170,.22)'); lamp.addColorStop(0.45, 'rgba(90,220,140,.10)'); lamp.addColorStop(1, 'rgba(0,30,10,.30)');
  c.fillStyle = lamp; c.fillRect(-W, -HT * 2, W * 2, HT * 4); c.restore();
  // cloth texture: fine fibres and a faint weave
  for (let i = 0; i < 16000; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,30,12'},${0.018 + rnd() * 0.035})`; c.fillRect(-T + rnd() * (W + 2 * T), -T + rnd() * (HT + 2 * T), 1, 1); }
  c.lineWidth = 0.6; for (let x = -HT; x < W; x += 3.2) { c.strokeStyle = 'rgba(0,0,0,.022)'; c.beginPath(); c.moveTo(x, -T); c.lineTo(x + HT + 2 * T, HT + T); c.stroke(); }
  // markings: head string, D and spots, very faint
  c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(HEAD.x, 6); c.lineTo(HEAD.x, HT - 6); c.stroke();
  c.beginPath(); c.arc(HEAD.x, HT / 2, 70, Math.PI / 2, Math.PI * 1.5); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.22)'; for (const [sx, sy] of [[W * 0.72, HT / 2], [HEAD.x, HT / 2]]) { c.beginPath(); c.arc(sx, sy, 2.6, 0, 7); c.fill(); }

  // pocket holes in the bed (the cushions are drawn over them, which shapes the mouths)
  for (const p of POCKETS) {
    const g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r + 3);
    g.addColorStop(0, '#000'); g.addColorStop(0.75, '#020202'); g.addColorStop(1, '#0d0d0d');
    c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); c.fill();
  }
  // cushions: each a trapezoid of cloth; the face slopes up from the nose, so it's lit along the nose and darker at the back
  const cushion = (pts, nx, ny) => {
    c.save();
    c.beginPath(); c.moveTo(...pts[0]); for (const q of pts.slice(1)) c.lineTo(...q); c.closePath();
    const [a] = pts;
    const g = c.createLinearGradient(a[0], a[1], a[0] - nx * T, a[1] - ny * T);
    g.addColorStop(0, '#23854c'); g.addColorStop(0.2, '#1e7a45'); g.addColorStop(0.7, '#196a3c'); g.addColorStop(1, '#125530');
    c.fillStyle = g; c.fill();
    c.restore();
  };
  const noseShadow = (x0, y0, x1, y1, nx, ny) => { // the cushion nose overhangs the bed: a soft shadow on the cloth
    const g = c.createLinearGradient(x0, y0, x0 + nx * 14, y0 + ny * 14); g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x1 + nx * 16, y1 + ny * 16); c.lineTo(x0 + nx * 16, y0 + ny * 16); c.closePath(); c.fill();
  };
  const noseLine = (x0, y0, x1, y1) => { c.strokeStyle = 'rgba(190,255,215,.16)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  for (const [x1, x2, j1, j2] of [[GC, W / 2 - GM, -JC, JM], [W / 2 + GM, W - GC, -JM, JC]]) {
    noseShadow(x1, 0, x2, 0, 0, 1); noseShadow(x1, HT, x2, HT, 0, -1);
    cushion([[x1, 0], [x2, 0], [x2 + j2, -T], [x1 + j1, -T]], 0, 1);
    cushion([[x1, HT], [x2, HT], [x2 + j2, HT + T], [x1 + j1, HT + T]], 0, -1);
    noseLine(x1, 0.5, x2, 0.5); noseLine(x1, HT - 0.5, x2, HT - 0.5);
  }
  noseShadow(0, GC, 0, HT - GC, 1, 0); noseShadow(W, GC, W, HT - GC, -1, 0);
  cushion([[0, GC], [0, HT - GC], [-T, HT - GC + JC], [-T, GC - JC]], 1, 0);
  cushion([[W, GC], [W, HT - GC], [W + T, HT - GC + JC], [W + T, GC - JC]], -1, 0);
  noseLine(0.5, GC, 0.5, HT - GC); noseLine(W - 0.5, GC, W - 0.5, HT - GC);
  // the rail's inner lip casts a shadow back onto the cushion tops
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 2; c.strokeRect(-T + 1, -T + 1, W + 2 * T - 2, HT + 2 * T - 2);
  c.restore();
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
