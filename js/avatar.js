// Avatars: skribbl-style animated blobs (color + eyes + mouth + accessory) or an uploaded photo.
// avatar = { c, e, m, a, img? }   (img is a small JPEG data-URL)
import { h } from './util.js';
import { icon } from './ui.js';

export const BODY_COLORS = ['#ffd23f', '#ff9f43', '#ff6b6b', '#f368e0', '#b388ff', '#7c8cff', '#4cc9f0', '#2ec4b6', '#7bd97b', '#b8e04a', '#c9a27a', '#e8e8f0', '#8d99ae', '#ff8fab', '#5ee6a8', '#ffb86b'];
const N_EYES = 12, N_MOUTH = 12, N_ACC = 12;
export const AV_PARTS = { c: BODY_COLORS.length, e: N_EYES, m: N_MOUTH, a: N_ACC };

const rnd = (n) => Math.floor(Math.random() * n);
export function randomAvatar() {
  return { c: rnd(BODY_COLORS.length), e: rnd(N_EYES), m: rnd(N_MOUTH), a: Math.random() < 0.55 ? rnd(N_ACC) : 0 };
}
export function sanitizeAvatar(a) {
  if (!a || typeof a !== 'object') return randomAvatar();
  const ok = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
  if (!ok(a.c, BODY_COLORS.length) || !ok(a.e, N_EYES) || !ok(a.m, N_MOUTH) || !ok(a.a, N_ACC)) return randomAvatar();
  const out = { c: a.c, e: a.e, m: a.m, a: a.a };
  if (typeof a.img === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.img) && a.img.length < 9000) out.img = a.img;
  return out;
}

function shade(hex, f) {
  const v = parseInt(hex.slice(1), 16);
  const ch = (x) => Math.max(0, Math.min(255, Math.round(f < 0 ? x * (1 + f) : x + (255 - x) * f)));
  return '#' + [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => ch(x).toString(16).padStart(2, '0')).join('');
}

const K = '#1d1830';
const stroke = (d, w = 4, c = K) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const star = (cx, cy, r) => {
  const pts = [];
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r; const an = -Math.PI / 2 + (i * Math.PI) / 5; pts.push((cx + rr * Math.cos(an)).toFixed(1) + ',' + (cy + rr * Math.sin(an)).toFixed(1)); }
  return `<polygon points="${pts.join(' ')}" fill="#ffd23f" stroke="${K}" stroke-width="1.5" stroke-linejoin="round"/>`;
};
const heart = (cx, cy, s) => `<path d="M${cx} ${cy + s * 0.9} C${cx - s * 1.6} ${cy - s * 0.2} ${cx - s * 0.5} ${cy - s * 1.1} ${cx} ${cy - s * 0.3} C${cx + s * 0.5} ${cy - s * 1.1} ${cx + s * 1.6} ${cy - s * 0.2} ${cx} ${cy + s * 0.9}Z" fill="#ff3b6b"/>`;

const EYES = [
  () => `<circle cx="37" cy="52" r="8" fill="#fff"/><circle cx="63" cy="52" r="8" fill="#fff"/><circle cx="39" cy="53" r="4.2" fill="${K}"/><circle cx="65" cy="53" r="4.2" fill="${K}"/>`,
  () => `<circle cx="36" cy="51" r="11" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="64" cy="51" r="11" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="38" cy="53" r="6" fill="${K}"/><circle cx="62" cy="53" r="6" fill="${K}"/><circle cx="40" cy="50" r="2" fill="#fff"/><circle cx="64" cy="50" r="2" fill="#fff"/>`,
  () => stroke('M28 55 Q36 43 44 55') + stroke('M56 55 Q64 43 72 55'),
  () => stroke('M29 52 L45 52') + stroke('M55 52 L71 52') + stroke('M31 58 L43 58', 2) + stroke('M57 58 L69 58', 2),
  () => `<circle cx="37" cy="53" r="7" fill="#fff"/><circle cx="63" cy="53" r="7" fill="#fff"/><circle cx="38" cy="54" r="3.6" fill="${K}"/><circle cx="62" cy="54" r="3.6" fill="${K}"/>` + stroke('M27 42 L46 48', 4) + stroke('M73 42 L54 48', 4),
  () => `<circle cx="37" cy="52" r="4.8" fill="${K}"/><circle cx="63" cy="52" r="4.8" fill="${K}"/>`,
  () => star(37, 52, 10) + star(63, 52, 10),
  () => heart(37, 51, 7) + heart(63, 51, 7),
  () => `<circle cx="37" cy="52" r="8" fill="#fff"/><circle cx="39" cy="53" r="4.2" fill="${K}"/>` + stroke('M56 54 Q64 44 72 54'),
  () => stroke('M30 46 L44 58') + stroke('M44 46 L30 58') + stroke('M56 46 L70 58') + stroke('M70 46 L56 58'),
  () => `<circle cx="50" cy="51" r="14" fill="#fff" stroke="${K}" stroke-width="2"/><circle cx="52" cy="53" r="7" fill="${K}"/><circle cx="55" cy="50" r="2.4" fill="#fff"/>`,
  () => `<rect x="24" y="44" width="23" height="15" rx="6" fill="${K}"/><rect x="53" y="44" width="23" height="15" rx="6" fill="${K}"/><rect x="46" y="48" width="8" height="3" fill="${K}"/><path d="M28 47 L36 47" stroke="#fff" stroke-width="2" opacity=".6"/><path d="M57 47 L65 47" stroke="#fff" stroke-width="2" opacity=".6"/>`,
];
const MOUTHS = [
  () => stroke('M34 68 Q50 84 66 68'),
  () => `<path d="M33 66 Q50 92 67 66 Z" fill="#5a1620" stroke="${K}" stroke-width="3" stroke-linejoin="round"/><path d="M40 77 Q50 72 60 77 Q50 84 40 77Z" fill="#ff7a8a"/>`,
  () => stroke('M40 72 L60 72'),
  () => `<ellipse cx="50" cy="73" rx="6" ry="8" fill="#5a1620" stroke="${K}" stroke-width="3"/>`,
  () => stroke('M34 68 Q50 82 66 68') + `<path d="M44 76 Q50 92 56 76 Z" fill="#ff7a8a" stroke="${K}" stroke-width="2.5" stroke-linejoin="round"/>`,
  () => `<rect x="34" y="67" width="32" height="14" rx="5" fill="#fff" stroke="${K}" stroke-width="3"/>` + stroke('M42 67 L42 81', 2) + stroke('M50 67 L50 81', 2) + stroke('M58 67 L58 81', 2) + stroke('M34 74 L66 74', 2),
  () => stroke('M36 78 Q50 62 64 78'),
  () => stroke('M36 72 Q52 78 66 64'),
  () => stroke('M34 70 Q42 80 50 70 Q58 80 66 70'),
  () => stroke('M32 72 L39 65 L46 74 L54 65 L61 74 L68 67', 3.5),
  () => stroke('M36 74 Q50 84 64 74') + `<path d="M30 68 Q40 60 50 67 Q60 60 70 68 Q60 72 50 70 Q40 72 30 68Z" fill="#5b3a1e"/>`,
  () => stroke('M34 68 Q50 84 66 68') + `<path d="M40 73 L44 82 L48 76Z" fill="#fff" stroke="${K}" stroke-width="1.5" stroke-linejoin="round"/><path d="M60 73 L56 82 L52 76Z" fill="#fff" stroke="${K}" stroke-width="1.5" stroke-linejoin="round"/>`,
];
const ACCS = [
  () => '',
  () => `<polygon points="50,0 33,30 67,30" fill="#ff5c9d" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M40 18 L60 18" stroke="#ffd23f" stroke-width="3"/><circle cx="50" cy="2" r="4.5" fill="#ffd23f" stroke="${K}" stroke-width="1.5"/>`,
  () => `<polygon points="32,30 32,10 42,19 50,5 58,19 68,10 68,30" fill="#ffc83d" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="20" r="2.6" fill="#ff4d6d"/>`,
  () => `<path d="M28 32 Q50 2 72 32 Z" fill="#e63946" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M66 29 L90 34 L66 36Z" fill="#c1121f" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>`,
  () => `<path d="M60 26 L76 16 L76 36Z" fill="#ff5c9d" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M60 26 L44 16 L44 36Z" fill="#ff5c9d" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><circle cx="60" cy="26" r="5" fill="#ff2e83" stroke="${K}" stroke-width="2"/>`,
  () => `<path d="M17 40 Q50 8 83 40" fill="none" stroke="#4cc9f0" stroke-width="7" stroke-linecap="round"/>` + star(50, 18, 8),
  () => `<path d="M30 33 L24 12 L40 27Z" fill="#e63946" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M70 33 L76 12 L60 27Z" fill="#e63946" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>`,
  () => `<path d="M50 28 L50 10" stroke="${K}" stroke-width="3"/><circle cx="50" cy="8" r="6" fill="#ff4d6d" stroke="${K}" stroke-width="2"/>`,
  () => `<ellipse cx="50" cy="14" rx="19" ry="5" fill="none" stroke="#ffd23f" stroke-width="5"/>`,
  () => `<rect x="35" y="2" width="30" height="26" rx="3" fill="#2b2b3a" stroke="${K}" stroke-width="2"/><rect x="26" y="26" width="48" height="7" rx="3" fill="#2b2b3a" stroke="${K}" stroke-width="2"/><rect x="35" y="19" width="30" height="5" fill="#e63946"/>`,
  () => `<g transform="translate(66 24)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-7" rx="4.5" ry="7" fill="#ff8fab" stroke="${K}" stroke-width="1.5" transform="rotate(${a})"/>`).join('')}<circle r="4" fill="#ffd23f" stroke="${K}" stroke-width="1.5"/></g>`,
  () => `<ellipse cx="50" cy="30" rx="36" ry="6" fill="#a9743d" stroke="${K}" stroke-width="2"/><path d="M34 30 Q34 6 50 10 Q66 6 66 30Z" fill="#b98448" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>`,
];

const cache = new Map();
export function avatarSVG(a) {
  const key = `${a.c}.${a.e}.${a.m}.${a.a}`;
  if (cache.has(key)) return cache.get(key);
  const col = BODY_COLORS[a.c] || BODY_COLORS[0];
  const dark = shade(col, -0.28), light = shade(col, 0.4);
  const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<g class="av-body"><ellipse cx="50" cy="94" rx="26" ry="4" fill="#000" opacity=".25"/>
<circle cx="50" cy="60" r="36" fill="${col}" stroke="${dark}" stroke-width="3"/>
<path d="M20 70 Q50 100 80 70 Q78 92 50 96 Q22 92 20 70Z" fill="${dark}" opacity=".28"/>
<ellipse cx="34" cy="38" rx="9" ry="5" fill="${light}" opacity=".55" transform="rotate(-30 34 38)"/>
<g class="av-eyes">${EYES[a.e]()}</g><g class="av-mouth">${MOUTHS[a.m]()}</g>${ACCS[a.a]()}</g></svg>`;
  cache.set(key, svg);
  return svg;
}

const imgCache = new Map();
/** An <img> of the avatar for drawing on a canvas (cached; may still be loading on first call). */
export function avatarImage(a) {
  a = a && typeof a === 'object' ? a : { c: 0, e: 0, m: 0, a: 0 };
  const key = a.img ? a.img : `${a.c}.${a.e}.${a.m}.${a.a}`;
  let im = imgCache.get(key);
  if (!im) {
    im = new Image();
    im.src = a.img ? a.img : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSVG(a).replace('<svg ', '<svg width="200" height="200" '));
    imgCache.set(key, im);
  }
  return im;
}
/** Draw an avatar centred at (x,y) with the given size on a 2D context. Photos are clipped to a circle. */
export function drawAvatar(ctx, a, x, y, size) {
  const im = avatarImage(a);
  if (!im.complete || !im.naturalWidth) return false;
  if (a && a.img) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(im, x - size / 2, y - size / 2, size, size);
    ctx.restore();
  } else ctx.drawImage(im, x - size / 2, y - size / 2, size, size);
  return true;
}

/** Render an avatar as an element. p: {avatar, color?, online?, name?}; cls: 'sm' | 'lg' | 'xl' | 'xs' ... */
export function avatarEl(p, cls = '', { still = false } = {}) {
  const a = p.avatar && typeof p.avatar === 'object' ? p.avatar : { c: 0, e: 0, m: 0, a: 0 };
  const el = h('div.av' + (cls ? '.' + cls.split(' ').join('.') : '') + (p.online === false ? '.off' : '') + (still ? '.still' : '') + (a.img ? '.photo' : ''), {
    style: { '--c': p.color || '', '--d': -(Math.random() * 3).toFixed(2) + 's' },
    title: p.name || '',
  });
  if (a.img) el.append(h('img', { src: a.img, alt: '', draggable: 'false' }));
  else el.innerHTML = avatarSVG(a);
  return el;
}

// ------------------------------------------------------------------ photo upload
export function fileToAvatarImage(file, size = 72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const s = Math.min(img.width, img.height);
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        let q = 0.72, data = cv.toDataURL('image/jpeg', q);
        while (data.length > 8500 && q > 0.2) { q -= 0.1; data = cv.toDataURL('image/jpeg', q); }
        resolve(data);
      } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image I can read')); };
    img.src = url;
  });
}

// ------------------------------------------------------------------ the editor (like skribbl.io's)
/** Returns {el, get(), set()}; calls onChange(avatar) on every edit. */
export function avatarEditor(initial, onChange) {
  let av = { ...sanitizeAvatar(initial) };
  const stage = h('div.avedit-stage');
  const rows = h('div.avedit-rows');
  const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });

  const draw = () => {
    stage.replaceChildren(avatarEl({ avatar: av, color: BODY_COLORS[av.c] }, 'xl bounce'));
    const row = (label, key, n) => h('div.avedit-row', [
      h('button.avarrow', { 'aria-label': label + ' previous', onclick: () => { av = { ...av, [key]: (av[key] + n - 1) % n }; delete av.img; change(); } }, icon('chevron_left')),
      h('span', label),
      h('button.avarrow', { 'aria-label': label + ' next', onclick: () => { av = { ...av, [key]: (av[key] + 1) % n }; delete av.img; change(); } }, icon('chevron_right')),
    ]);
    rows.replaceChildren(
      row('Colour', 'c', BODY_COLORS.length), row('Eyes', 'e', N_EYES), row('Mouth', 'm', N_MOUTH), row('Hat', 'a', N_ACC),
      h('div.row', { style: 'justify-content:center;flex-wrap:wrap;margin-top:6px' }, [
        h('button.btn.small.tonal', { onclick: () => { av = randomAvatar(); change(); } }, icon('casino'), 'Randomize'),
        h('button.btn.small.tonal', { onclick: () => file.click() }, icon('image'), 'Use a photo'),
        av.img ? h('button.btn.small.ghost', { onclick: () => { delete av.img; change(); } }, icon('close'), 'Remove photo') : null,
      ])
    );
  };
  const change = () => { draw(); onChange?.({ ...av }); };
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try { av = { ...av, img: await fileToAvatarImage(f) }; change(); } catch (e) { alert(e.message); }
  });
  draw();
  return { el: h('div.avedit', [stage, rows, file]), get: () => ({ ...av }) };
}
