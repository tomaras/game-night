// Harmonies — all the artwork, hand-written SVG: wooden tokens, cubes, hex tiles, critters and spirits.
import { BLUE, GREY, BROWN, GREEN, YELLOW, RED, COLOR_NAMES } from './harmonies-rules.js';

export const TOK = [
  { name: 'Water', top: '#47a5f0', hi: '#9fd4ff', side: '#2a74b8', ink: '#16497d' },
  { name: 'Stone', top: '#a8b0bb', hi: '#e2e7ee', side: '#6d7683', ink: '#434a55' },
  { name: 'Trunk', top: '#a8714a', hi: '#d9a273', side: '#6e4529', ink: '#43260f' },
  { name: 'Foliage', top: '#5cbf4f', hi: '#a9ee8e', side: '#357f2f', ink: '#1a4f17' },
  { name: 'Grain', top: '#f7c93c', hi: '#ffec96', side: '#c4952a', ink: '#7b5a0a' },
  { name: 'Roof', top: '#ec5a42', hi: '#ff9d86', side: '#a93725', ink: '#6a1d12' },
];
// engraved symbols, 24x24 box (so colour is never the only cue)
const ICON = [
  '<path d="M3 10c2-3 4-3 6 0s4 3 6 0 4-3 6 0M3 16c2-3 4-3 6 0s4 3 6 0 4-3 6 0" fill="none" stroke-width="2.3" stroke-linecap="round"/>',
  '<path d="M3 19 10 6l4 7 2.5-3.5L21 19z" stroke-width="1.4" stroke-linejoin="round"/>',
  '<circle cx="12" cy="12" r="8.2" fill="none" stroke-width="2.2"/><circle cx="12" cy="12" r="3.6" fill="none" stroke-width="2.2"/>',
  '<path d="M5 19C5 10 10 5 19.5 5 19.5 14 14.5 19 5 19zM5 19 13 11" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  '<path d="M12 21V8M12 12c-3 0-4.5-2-4.5-4.5 3 0 4.5 2 4.5 4.5zM12 12c3 0 4.5-2 4.5-4.5-3 0-4.5 2-4.5 4.5zM12 17c-3 0-4.5-2-4.5-4.5 3 0 4.5 2 4.5 4.5zM12 17c3 0 4.5-2 4.5-4.5-3 0-4.5 2-4.5 4.5zM12 8c-1.6-1-1.8-3-0-4.5 1.8 1.500 1.600 3.500 0 4.500z" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  '<path d="M3.5 12 12 4.500l8.500 7.500M6 10.500V20h12v-9.500M10.500 20v-5h3v5" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
];
export const icon = (k, size = 16, cls = '') => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${TOK[k].ink}" stroke="${TOK[k].ink}">${ICON[k]}</svg>`;

/** The token artwork lives in one hidden <svg><defs> so every <use> can share it. Returns the element to attach once. */
export function defs() {
  let g = '';
  TOK.forEach((t, k) => {
    g += `<radialGradient id="hmg${k}" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="${t.hi}"/><stop offset=".55" stop-color="${t.top}"/><stop offset="1" stop-color="${t.side}"/></radialGradient>`;
    // one token: 100 wide, top face ellipse centred (50,38), thickness 14. Symbol box 0 0 100 88.
    g += `<symbol id="hmt${k}" viewBox="0 0 100 88" overflow="visible">
      <ellipse cx="50" cy="80" rx="40" ry="6" fill="#000" opacity=".16" class="hm-sh"/>
      <path d="M8 38v14a42 34 0 0 0 84 0V38z" fill="${t.side}"/>
      <path d="M8 38v14a42 34 0 0 0 20 28.500" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
      <ellipse cx="50" cy="38" rx="42" ry="34" fill="url(#hmg${k})"/>
      <ellipse cx="50" cy="38" rx="35" ry="27.500" fill="none" stroke="${t.hi}" stroke-opacity=".55" stroke-width="2"/>
      <ellipse cx="50" cy="38" rx="42" ry="34" fill="none" stroke="${t.side}" stroke-opacity=".55" stroke-width="1.5"/>
      <g transform="translate(50 38) scale(1.15 .9) translate(-12 -12)" opacity=".4" stroke="#fff" fill="#fff" transform-origin="0 0"><g transform="translate(0 1.2)">${ICON[k]}</g></g>
      <g transform="translate(50 38) scale(1.15 .9) translate(-12 -12)" opacity=".62" stroke="${t.ink}" fill="${t.ink}">${ICON[k]}</g>
      <path d="M22 26c6-8 20-11 30-9" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>
    </symbol>`;
  });
  g += `<symbol id="hmcube" viewBox="0 0 40 44" overflow="visible">
    <path d="M20 4 36 12v18L20 38 4 30V12z" fill="#e2b46b"/>
    <path d="M20 4 36 12 20 20 4 12z" fill="#f6d896"/>
    <path d="M20 20 36 12v18L20 38z" fill="#b8843c"/>
    <path d="M20 4 36 12 20 20 4 12zM4 12v18l16 8V20" fill="none" stroke="#7a521e" stroke-opacity=".5" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M14 11l6 3 6-3" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round"/>
  </symbol>`;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('width', '0'); el.setAttribute('height', '0'); el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:absolute;width:0;height:0';
  el.innerHTML = `<defs>${g}</defs>`;
  return el;
}

/** A standalone token (HTML <svg>) for trays, plates, pills. `w` in px. */
export function tokenEl(k, w = 40, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 100 88'); s.setAttribute('width', w); s.setAttribute('height', Math.round(w * 0.88));
  s.setAttribute('class', 'hm-tok ' + cls); s.dataset.k = k;
  s.innerHTML = `<use href="#hmt${k}" width="100" height="88"/>`;
  return s;
}
export const tokenSvg = (k, x, y, w, extra = '') => `<use href="#hmt${k}" x="${x}" y="${y}" width="${w}" height="${w * 0.88}" ${extra}/>`;
export const cubeSvg = (x, y, w, fill) => `<g><use href="#hmcube" x="${x}" y="${y}" width="${w}" height="${w * 1.1}"/>${fill ? `<circle cx="${x + w * 0.5}" cy="${y + w * 0.52}" r="${w * 0.1}" fill="${fill}" stroke="#fff" stroke-width="${w * 0.03}"/>` : ''}</g>`;

// ------------------------------------------------------------------ critters
/** Round, friendly animals from a few parts. 100x100 box. */
export function critter(look = {}, id = 'x') {
  const L = { body: '#c9925a', belly: '#f6dcb8', ears: 'round', tail: 'short', face: 'snout', extra: 'none', spot: '#6d4c41', beak: '#ff9800', snout: '#7a4b3a', ...look };
  const dark = shade(L.body, -0.28), mid = shade(L.body, -0.12);
  let back = '', front = '';
  // tail & back extras (behind the body)
  const T = { bushy: `<path d="M70 82c18-4 22-26 10-34-2 12-8 14-18 12z" fill="${L.body}"/><path d="M80 52c4 8 2 18-6 24" fill="none" stroke="${L.belly}" stroke-width="5" stroke-linecap="round"/>`,
    curl: `<path d="M72 82c12 4 18-6 12-14-3-4-8-3-8 1" fill="none" stroke="${mid}" stroke-width="5" stroke-linecap="round"/>`,
    puff: `<circle cx="74" cy="80" r="8" fill="${L.belly}"/>`,
    flat: `<path d="M70 84c10 0 20 2 22 8-10 2-20-2-22-8z" fill="${dark}"/>`,
    short: `<ellipse cx="74" cy="82" rx="7" ry="5" fill="${mid}"/>`, none: '' };
  back += T[L.tail] || '';
  if (L.extra === 'quills') { let q = ''; for (let i = 0; i < 11; i++) { const a = Math.PI + (i / 10) * Math.PI; const x1 = 50 + Math.cos(a) * 22, y1 = 62 + Math.sin(a) * 24, x2 = 50 + Math.cos(a) * 37, y2 = 62 + Math.sin(a) * 38; q += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${L.spot}" stroke-width="5" stroke-linecap="round"/>`; } back += q; }
  if (L.extra === 'shell') back += `<ellipse cx="50" cy="70" rx="34" ry="26" fill="${L.spot}"/><path d="M26 68h48M34 55l6 28M50 50v34M66 55l-6 28" stroke="${shade(L.spot, -0.2)}" stroke-width="2.200" fill="none"/><ellipse cx="50" cy="70" rx="34" ry="26" fill="none" stroke="${shade(L.spot, -0.3)}" stroke-width="2"/>`;
  if (L.extra === 'fluff') back += `<g fill="${L.body}">${[[28, 62], [72, 62], [38, 78], [62, 78], [50, 82], [24, 76], [76, 76]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13"/>`).join('')}</g>`;
  // ears (behind head)
  const E = { round: `<circle cx="29" cy="26" r="9" fill="${L.body}"/><circle cx="71" cy="26" r="9" fill="${L.body}"/><circle cx="29" cy="26" r="5" fill="${L.belly}"/><circle cx="71" cy="26" r="5" fill="${L.belly}"/>`,
    point: `<path d="M26 34 28 8 46 24z" fill="${L.body}"/><path d="M74 34 72 8 54 24z" fill="${L.body}"/><path d="M30 28 31 15 40 24z" fill="${L.belly}"/><path d="M70 28 69 15 60 24z" fill="${L.belly}"/>`,
    long: `<ellipse cx="38" cy="14" rx="7" ry="18" fill="${L.body}" transform="rotate(-8 38 14)"/><ellipse cx="62" cy="14" rx="7" ry="18" fill="${L.body}" transform="rotate(8 62 14)"/><ellipse cx="38" cy="15" rx="3.500" ry="12" fill="${L.belly}" transform="rotate(-8 38 14)"/><ellipse cx="62" cy="15" rx="3.500" ry="12" fill="${L.belly}" transform="rotate(8 62 14)"/>`,
    tuft: `<path d="M26 34 24 10 44 24z" fill="${L.body}"/><path d="M74 34 76 10 56 24z" fill="${L.body}"/><path d="M24 10 22 2M76 10 78 2" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>`,
    horn: `<path d="M32 28c-10-4-14-14-8-22 2 8 8 10 14 12z" fill="#efe4c8" stroke="#b9a77c" stroke-width="1.500"/><path d="M68 28c10-4 14-14 8-22-2 8-8 10-14 12z" fill="#efe4c8" stroke="#b9a77c" stroke-width="1.500"/><ellipse cx="26" cy="38" rx="9" ry="5" fill="${L.body}" transform="rotate(25 26 38)"/><ellipse cx="74" cy="38" rx="9" ry="5" fill="${L.body}" transform="rotate(-25 74 38)"/>`,
    none: '' };
  back += E[L.ears] || '';
  if (L.extra === 'antler') back += `<g stroke="#8d6137" stroke-width="3.500" stroke-linecap="round" fill="none"><path d="M36 22 30 6M30 6 24 4M33 13 26 12"/><path d="M64 22 70 6M70 6 76 4M67 13 74 12"/></g>`;
  if (L.extra === 'crest') back += `<path d="M42 22c-2-8 2-14 8-16 6 2 10 8 8 16-4-4-12-4-16 0z" fill="${L.spot}"/>`;
  // body
  front += `<ellipse cx="50" cy="74" rx="27" ry="22" fill="${L.body}"/><ellipse cx="50" cy="78" rx="16" ry="15" fill="${L.belly}"/>`;
  if (L.extra === 'wing') front += `<ellipse cx="29" cy="74" rx="8" ry="14" fill="${L.spot}" transform="rotate(14 29 74)"/><ellipse cx="71" cy="74" rx="8" ry="14" fill="${L.spot}" transform="rotate(-14 71 74)"/>`;
  // feet
  front += `<ellipse cx="38" cy="94" rx="9" ry="5" fill="${mid}"/><ellipse cx="62" cy="94" rx="9" ry="5" fill="${mid}"/>`;
  // head
  front += `<circle cx="50" cy="44" r="25" fill="${L.body}"/>`;
  if (L.extra === 'stripes') front += `<path d="M40 22 42 32M50 20v12M60 22 58 32" stroke="${L.spot}" stroke-width="4.500" stroke-linecap="round"/><path d="M26 46c4-2 8-2 12 0M74 46c-4-2-8-2-12 0" stroke="${L.spot}" stroke-width="0" />`;
  if (L.extra === 'mask') front += `<ellipse cx="38" cy="45" rx="10" ry="8" fill="${L.spot}" transform="rotate(-18 38 45)"/><ellipse cx="62" cy="45" rx="10" ry="8" fill="${L.spot}" transform="rotate(18 62 45)"/>`;
  if (L.extra === 'spots') front += [[34, 30, 3.5], [60, 28, 3], [68, 40, 2.6], [30, 42, 2.4], [52, 24, 2.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${L.spot}"/>`).join('') + [[40, 70, 3], [60, 68, 3.4], [50, 84, 2.6], [32, 82, 2.6], [68, 82, 2.6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${L.spot}" opacity=".85"/>`).join('');
  if (L.extra === 'fluff') front += `<g fill="${L.body}">${[[30, 34], [70, 34], [40, 22], [60, 22], [50, 18]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`).join('')}</g><circle cx="50" cy="44" r="22" fill="#4a4a4a" opacity=".92"/>`;
  // face
  const eyeY = 45, ink = '#2b2118';
  if (L.extra !== 'mask' && L.extra !== 'fluff') front += `<ellipse cx="50" cy="55" rx="14" ry="10" fill="${L.belly}" opacity=".9"/>`;
  front += `<circle cx="39" cy="${eyeY}" r="4.400" fill="${ink}"/><circle cx="61" cy="${eyeY}" r="4.400" fill="${ink}"/><circle cx="40.500" cy="${eyeY - 1.500}" r="1.500" fill="#fff"/><circle cx="62.500" cy="${eyeY - 1.500}" r="1.500" fill="#fff"/>`;
  const F = { snout: `<ellipse cx="50" cy="54" rx="6" ry="4.500" fill="${L.snout}"/><path d="M50 58v3M45 62c3 2 7 2 10 0" stroke="${ink}" stroke-width="1.800" fill="none" stroke-linecap="round"/>`,
    beak: `<path d="M43 52h14l-7 11z" fill="${L.beak}" stroke="${shade(L.beak, -0.2)}" stroke-width="1.200" stroke-linejoin="round"/>`,
    muzzle: `<ellipse cx="50" cy="56" rx="10" ry="7.500" fill="${L.belly}"/><ellipse cx="50" cy="52" rx="4.200" ry="3" fill="${ink}"/><path d="M50 55v3M46 59c2 2 6 2 8 0" stroke="${ink}" stroke-width="1.800" fill="none" stroke-linecap="round"/>`,
    round: `<path d="M44 57c3 3 9 3 12 0" stroke="${ink}" stroke-width="2.200" fill="none" stroke-linecap="round"/>` };
  front += F[L.face] || '';
  if (L.extra === 'teeth') front += `<rect x="46" y="59" width="3.800" height="6" rx="1" fill="#fff" stroke="${ink}" stroke-width=".8"/><rect x="50.200" y="59" width="3.800" height="6" rx="1" fill="#fff" stroke="${ink}" stroke-width=".8"/>`;
  if (L.extra === 'whisk') front += `<path d="M36 55 24 52M36 58 24 60M64 55 76 52M64 58 76 60" stroke="${dark}" stroke-width="1.400" stroke-linecap="round"/>`;
  front += `<ellipse cx="32" cy="55" rx="4" ry="2.600" fill="#ff8a8a" opacity=".35"/><ellipse cx="68" cy="55" rx="4" ry="2.600" fill="#ff8a8a" opacity=".35"/>`;
  return `<svg viewBox="0 0 100 100" class="hm-critter" aria-hidden="true">${back}${front}</svg>`;
}
export function spiritArt(look = {}) {
  const c = look.glow || '#7ae582';
  let petals = '';
  for (let i = 0; i < 8; i++) petals += `<ellipse cx="50" cy="20" rx="7" ry="15" fill="${c}" opacity=".55" transform="rotate(${i * 45} 50 50)"/>`;
  return `<svg viewBox="0 0 100 100" class="hm-critter" aria-hidden="true">${petals}<circle cx="50" cy="50" r="24" fill="#fffdf4"/><circle cx="50" cy="50" r="24" fill="none" stroke="${c}" stroke-width="4"/><circle cx="42" cy="48" r="3.600" fill="#2b2118"/><circle cx="58" cy="48" r="3.600" fill="#2b2118"/><circle cx="43.200" cy="46.800" r="1.200" fill="#fff"/><circle cx="59.200" cy="46.800" r="1.200" fill="#fff"/><path d="M44 57c3 3.500 9 3.500 12 0" fill="none" stroke="#2b2118" stroke-width="2.200" stroke-linecap="round"/><path d="M50 26c-2-7 1-12 8-14-1 8-3 12-8 14z" fill="#4caf50"/></svg>`;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
export const HABITAT_TINT = { water: '#d4ecff', field: '#fff1bf', mountain: '#e3e7ec', tree: '#d7f1cf', building: '#ffd9d0' };
void BLUE; void GREY; void BROWN; void GREEN; void YELLOW; void RED; void COLOR_NAMES;
