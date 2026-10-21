// A small QR code generator (byte mode, error-correction level M, versions 1–6 = up to 106 characters) — enough for a
// room invite link. Returns an SVG string. No dependencies, works offline.
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsEc(data, n) {
  let g = [1];
  for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; }
  const res = new Array(n).fill(0);
  for (const d of data) { const f = d ^ res[0]; res.shift(); res.push(0); if (f) for (let i = 0; i < n; i++) res[i] ^= mul(g[i + 1], f); }
  return res;
}
// level M: [data codewords per block, EC codewords per block, blocks]
const VER = [null, [16, 10, 1], [28, 16, 1], [44, 26, 1], [32, 18, 2], [43, 24, 2], [27, 16, 4]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];
const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (((r / 2) | 0) + ((c / 3) | 0)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0];

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= 6 && bytes.length > Math.floor((VER[ver][0] * VER[ver][2] * 8 - 12) / 8)) ver++;
  if (ver > 6) throw new Error('QR: text too long');
  const [dpb, epb, nb] = VER[ver];
  // ---- data bits
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8));
  const cap = dpb * nb * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; data.length < dpb * nb; p++) data.push(p % 2 ? 0x11 : 0xec);
  // ---- blocks + error correction, interleaved
  const blocks = [], ecs = [];
  for (let b = 0; b < nb; b++) { const d = data.slice(b * dpb, (b + 1) * dpb); blocks.push(d); ecs.push(rsEc(d, epb)); }
  const out = [];
  for (let i = 0; i < dpb; i++) blocks.forEach((b) => out.push(b[i]));
  for (let i = 0; i < epb; i++) ecs.forEach((e) => out.push(e[i]));
  const stream = out.flatMap((v) => Array.from({ length: 8 }, (_, i) => (v >> (7 - i)) & 1));
  // ---- matrix with function patterns
  const n = 17 + 4 * ver;
  const grid = Array.from({ length: n }, () => new Int8Array(n));
  const fn = Array.from({ length: n }, () => new Uint8Array(n));
  const set = (r, c, v) => { if (r >= 0 && r < n && c >= 0 && c < n) { grid[r][c] = v; fn[r][c] = 1; } };
  const finder = (r0, c0) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) set(r0 + i, c0 + j, ((i >= 0 && i <= 6 && (j === 0 || j === 6)) || (j >= 0 && j <= 6 && (i === 0 || i === 6)) || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) ? 1 : 0); };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 ? 0 : 1); set(i, 6, i % 2 ? 0 : 1); }
  const al = ALIGN[ver];
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (c === 6 && r === al[al.length - 1])) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0);
  }
  for (let i = 0; i < 9; i++) { fn[8][i] = 1; fn[i][8] = 1; }
  for (let i = 0; i < 8; i++) { fn[8][n - 1 - i] = 1; fn[n - 1 - i][8] = 1; }
  set(n - 8, 8, 1);
  // ---- place the data (zig-zag), then pick the mask with the lowest penalty
  const cells = [];
  for (let c = n - 1, up = true; c > 0; c -= 2, up = !up) {
    if (c === 6) c--;
    for (let k = 0; k < n; k++) { const r = up ? n - 1 - k : k; for (const cc of [c, c - 1]) if (!fn[r][cc]) cells.push([r, cc]); }
  }
  const make = (mask) => {
    const g = grid.map((row) => Int8Array.from(row));
    cells.forEach(([r, c], i) => { g[r][c] = (stream[i] || 0) ^ (MASKS[mask](r, c) ? 1 : 0); });
    const d = mask; let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412, bit = (i) => (f >>> i) & 1;
    const s = (r, c, v) => { g[r][c] = v; };
    for (let i = 0; i <= 5; i++) s(i, 8, bit(i));
    s(7, 8, bit(6)); s(8, 8, bit(7)); s(8, 7, bit(8));
    for (let i = 9; i < 15; i++) s(8, 14 - i, bit(i));
    for (let i = 0; i < 8; i++) s(8, n - 1 - i, bit(i));
    for (let i = 8; i < 15; i++) s(n - 15 + i, 8, bit(i));
    return g;
  };
  const penalty = (g) => {
    let p = 0, dark = 0;
    for (let a = 0; a < n; a++) for (const rowMode of [true, false]) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        const cur = rowMode ? g[a][b] : g[b][a], prev = rowMode ? g[a][b - 1] : g[b - 1][a];
        if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
      }
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      dark += g[r][c];
      if (r + 1 < n && c + 1 < n && g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) p += 3;
    }
    const pat = [1, 0, 1, 1, 1, 0, 1];
    const hit = (get) => { for (let i = 0; i + 7 <= n; i++) if (pat.every((v, k) => get(i + k) === v)) { const L = (j) => j < 0 || j >= n || get(j) === 0; if ([1, 2, 3, 4].every((k) => L(i - k)) || [7, 8, 9, 10].every((k) => L(i + k))) p += 40; } };
    for (let a = 0; a < n; a++) { hit((i) => g[a][i]); hit((i) => g[i][a]); }
    p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return p;
  };
  let best = null, bs = 1e9;
  for (let m = 0; m < 8; m++) { const g = make(m), s = penalty(g); if (s < bs) { bs = s; best = g; } }
  return best;
}

/** An SVG string for `text`. `fg`/`bg` are CSS colours (a QR code always needs a light quiet zone, so the background stays solid). */
export function qrSvg(text, { fg = '#000', bg = '#fff', quiet = 3 } = {}) {
  const m = qrMatrix(text), n = m.length, size = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}
