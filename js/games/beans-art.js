// Bohnanza — all artwork is drawn here, by hand, as inline SVG: eleven bean characters, coins, card backs.
// Flat, vivid shapes with a simple highlight and a dark outline; every bean has its own silhouette AND a face so the
// varieties never rely on colour alone.
import { TYPES, coinsFor } from './beans-engine.js';

const DARK = '#1F1B2D';
const eye = (x, y, r = 6, look = 0.6, lid = false) =>
  `<g><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.08}" fill="#fff" stroke="${DARK}" stroke-width="1.6"/>` +
  `<circle cx="${x + look * r * 0.35}" cy="${y + r * 0.1}" r="${r * 0.52}" fill="${DARK}"/><circle cx="${x + look * r * 0.35 + r * 0.18}" cy="${y - r * 0.18}" r="${r * 0.17}" fill="#fff"/>` +
  (lid ? `<path d="M${x - r - 1} ${y - 1}A${r + 1} ${r + 1} 0 0 1 ${x + r + 1} ${y - 1}Z" fill="var(--lid, #888)" stroke="${DARK}" stroke-width="1.6"/>` : '') + '</g>';
const brow = (x, y, dir = 1, w = 9) => `<path d="M${x - w / 2} ${y + dir * 3}L${x + w / 2} ${y - dir * 3}" stroke="${DARK}" stroke-width="3" stroke-linecap="round"/>`;
const mouth = {
  smile: (x, y, w = 11) => `<path d="M${x - w} ${y}Q${x} ${y + w * 0.9} ${x + w} ${y}" fill="none" stroke="${DARK}" stroke-width="2.8" stroke-linecap="round"/>`,
  grin: (x, y, w = 12) => `<path d="M${x - w} ${y - 1}Q${x} ${y + w * 1.25} ${x + w} ${y - 1}Z" fill="${DARK}" stroke="${DARK}" stroke-width="2" stroke-linejoin="round"/><path d="M${x - w * 0.6} ${y + w * 0.35}Q${x} ${y + w * 0.1} ${x + w * 0.6} ${y + w * 0.35}Q${x} ${y + w * 0.95} ${x - w * 0.6} ${y + w * 0.35}Z" fill="#FF6B7A"/>`,
  smirk: (x, y, w = 10) => `<path d="M${x - w} ${y + 2}Q${x} ${y + 5} ${x + w} ${y - 3}" fill="none" stroke="${DARK}" stroke-width="2.8" stroke-linecap="round"/>`,
  open: (x, y, w = 8) => `<ellipse cx="${x}" cy="${y + 2}" rx="${w * 0.8}" ry="${w}" fill="${DARK}"/><ellipse cx="${x}" cy="${y + w * 1.1}" rx="${w * 0.5}" ry="${w * 0.4}" fill="#FF6B7A"/>`,
  wavy: (x, y, w = 11) => `<path d="M${x - w} ${y}q${w / 4} -5 ${w / 2} 0t${w / 2} 0t${w / 2} 0t${w / 2} 0" fill="none" stroke="${DARK}" stroke-width="2.8" stroke-linecap="round"/>`,
  gritted: (x, y, w = 11) => `<rect x="${x - w}" y="${y - 4}" width="${w * 2}" height="9" fill="#fff" stroke="${DARK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M${x - w / 3} ${y - 4}v9M${x + w / 3} ${y - 4}v9" stroke="${DARK}" stroke-width="1.6"/>`,
  o: (x, y, w = 5) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * 1.15}" fill="${DARK}"/>`,
};
const cheeks = (x, y, gap) => `<circle cx="${x - gap}" cy="${y}" r="4.4" fill="#FF7B8F" opacity="1"/><circle cx="${x + gap}" cy="${y}" r="4.4" fill="#FF7B8F"/>`;
const shine = (d, c = '#fff', o = 0.55) => `<path d="${d}" fill="${c}" opacity="${o}"/>`;

// Every drawer returns SVG markup inside a 100x100 box (the white plate is drawn by the card).
const DRAW = {
  coffee: () =>
    `<g transform="rotate(-18 50 52)"><ellipse cx="50" cy="52" rx="28" ry="37" fill="#7A4326" stroke="#3E1F10" stroke-width="3"/>` +
        `<path d="M32 30c-2 14 0 30 6 42" stroke="#A8643A" stroke-width="5" stroke-linecap="round" fill="none"/></g>` +
        `<g transform="rotate(-18 50 52)"><path d="M52 18C40 34 64 46 50 62C42 73 55 79 50 87" fill="none" stroke="#2B140A" stroke-width="6.4" stroke-linecap="round"/><path d="M52 18C40 34 64 46 50 62C42 73 55 79 50 87" fill="none" stroke="#F4D8B0" stroke-width="3.2" stroke-linecap="round"/></g>` +
    `<path d="M25 18c3-6-3-7 0-13M38 14c3-6-3-7 0-13M70 14c3-6-3-7 0-13" fill="none" stroke="#9AA4B2" stroke-width="3" stroke-linecap="round" transform="translate(4 3)"/>` +
    `<g style="--lid:#7A4326">${eye(40, 50, 6.2, 0.2, true)}${eye(61, 47, 6.2, 0.2, true)}</g>${mouth.smile(51, 63, 7)}`,
  wax: () =>
    `<path d="M50 4C54 11 58 14 58 20C58 25 54 28 50 28C46 28 42 25 42 20C42 14 47 11 50 4Z" fill="#FF8A1F" stroke="#C25B00" stroke-width="2"/><path d="M50 14C52 17 53 19 52 22C51 24 49 24 48 22C47 19 49 17 50 14Z" fill="#FFE066"/><path d="M50 28v7" stroke="${DARK}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M28 52C28 38 38 33 50 33C62 33 72 38 72 52L72 72C72 74 70 76 69 80C69 85 65 87 64 82C63 78 60 78 59 82C58 90 53 90 52 83C51 79 48 79 47 84C46 90 41 90 40 82C39 78 36 78 35 82C34 87 30 86 31 80C30 76 28 74 28 72Z" fill="#FFF0A0" stroke="#C98F00" stroke-width="3" stroke-linejoin="round"/>` +
    shine('M33 48C33 41 38 37 44 36C38 40 36 46 36 54Z', '#fff', 0.9) +
    `${eye(42, 54, 5.6, 0.5)}${eye(59, 54, 5.6, 0.5)}${mouth.smirk(51, 67, 8)}${cheeks(50.5, 62, 15)}`,
  blue: () =>
    `<ellipse cx="50" cy="54" rx="34" ry="32" fill="#2B5BD7" stroke="#16358F" stroke-width="3"/>` +
    shine('M24 50C24 38 33 30 43 29C34 34 31 42 31 52Z', '#fff', 0.55) +
        `<g transform="translate(50 26)"><path d="M0-9L2.6-3.2 9-2.6 4.2 1.6 5.6 8 0 4.8-5.6 8-4.2 1.6-9-2.6-2.6-3.2Z" fill="#12266F" stroke="#0A1752" stroke-width="1.4" stroke-linejoin="round"/></g>` +
    `${eye(38, 53, 6.4, 0.4)}${eye(61, 53, 6.4, 0.4)}${mouth.grin(50, 67, 9)}${cheeks(50, 64, 21)}`,
  chili: () =>
    `<path d="M38 30C26 36 22 54 30 70C38 85 58 86 78 76C84 73 82 66 76 67C62 71 48 66 44 52C42 44 46 36 50 30Z" fill="#E8261B" stroke="#8E1710" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M40 27C36 20 40 13 48 12C47 17 50 22 53 27C49 31 43 31 40 27Z" fill="#2BA04F" stroke="#146B30" stroke-width="2.4" stroke-linejoin="round"/><path d="M48 12C52 8 58 8 60 6" stroke="#146B30" stroke-width="3" stroke-linecap="round" fill="none"/>` +
    shine('M33 44C31 52 33 60 38 67', '#fff', 0.7).replace('fill="#fff"', 'fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"') +
    brow(37, 46, -1) + brow(55, 47, 1) + `${eye(37, 54, 5.4, 0.6)}${eye(54, 55, 5.4, 0.6)}${mouth.gritted(46, 68, 8)}` +
    `<path d="M22 22c4 3 4 8 0 11M14 30c3 2 3 6 0 8" fill="none" stroke="#FF9F1C" stroke-width="3" stroke-linecap="round"/><path d="M77 25c4 3 4 8 0 11" fill="none" stroke="#FF9F1C" stroke-width="3" stroke-linecap="round"/>`,
  stink: () =>
    `<path d="M26 56C22 40 34 28 50 29C68 30 80 42 76 58C74 72 62 82 48 80C34 80 28 70 26 56Z" fill="#7BC043" stroke="#3F7A17" stroke-width="3" stroke-linejoin="round"/>` +
    `<circle cx="34" cy="68" r="3.4" fill="#5AA02A"/><circle cx="68" cy="45" r="3" fill="#5AA02A"/><circle cx="62" cy="70" r="2.4" fill="#5AA02A"/>` +
    shine('M31 46C32 38 38 33 45 32C38 37 36 43 36 52Z', '#fff', 0.55) +
    `<path d="M18 36c-5-6 5-9 0-16M84 38c5-6-5-9 0-16M50 20c-4-5 4-8 0-14" fill="none" stroke="#A142F4" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M34 50l9 6M43 50l-9 6" stroke="${DARK}" stroke-width="3.2" stroke-linecap="round"/><path d="M58 50l9 6M67 50l-9 6" stroke="${DARK}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<ellipse cx="50.5" cy="60" rx="4" ry="3" fill="#5AA02A" stroke="#3F7A17" stroke-width="1.6"/>${mouth.wavy(50, 71, 9)}` +
    `<g transform="translate(72 18)"><ellipse cx="0" cy="0" rx="3.6" ry="2.6" fill="${DARK}"/><ellipse cx="-3" cy="-3" rx="3" ry="1.8" fill="#fff" stroke="${DARK}" stroke-width="1"/><ellipse cx="3" cy="-3" rx="3" ry="1.8" fill="#fff" stroke="${DARK}" stroke-width="1"/></g>`,
  green: () =>
    `<path d="M24 78C12 60 18 30 40 16C50 10 60 12 58 20C56 28 44 32 40 44C36 56 44 66 48 76C50 84 32 88 24 78Z" fill="#2FA84F" stroke="#14692D" stroke-width="3" stroke-linejoin="round" transform="translate(14 4)"/>` +
        `<g transform="translate(14 4)"><path d="M52 18C58 14 66 16 68 8" fill="none" stroke="#14692D" stroke-width="3" stroke-linecap="round"/><path d="M58 28C60 34 56 42 50 48" fill="none" stroke="#7FD38E" stroke-width="3.2" stroke-linecap="round"/></g>` +
        `<g transform="translate(14 4)"><circle cx="33" cy="48" r="4.6" fill="#B8EB7C" stroke="#14692D" stroke-width="1.8"/><circle cx="42" cy="62" r="4.2" fill="#B8EB7C" stroke="#14692D" stroke-width="1.8"/></g>` +
    `<g transform="translate(14 4)">${eye(36, 38, 5.6, 0.5)}${eye(51, 40, 5.6, 0.5)}${mouth.smile(44, 50, 6.5)}</g>`,
  soy: () =>
    `<path d="M50 42C34 42 24 54 25 66C26 78 38 86 52 85C66 84 76 74 74 60C72 48 62 42 50 42Z" fill="#F2C75C" stroke="#B5851A" stroke-width="3"/>` +
    shine('M31 62C30 54 35 48 42 46C37 51 36 57 37 65Z', '#fff', 0.7) +
    `<path d="M50 42C50 34 49 28 46 22" fill="none" stroke="#2BA04F" stroke-width="3.4" stroke-linecap="round"/><path d="M46 24C36 26 28 20 26 11C37 11 45 16 46 24Z" fill="#46C168" stroke="#14692D" stroke-width="2.2" stroke-linejoin="round"/><path d="M47 22C54 14 63 12 72 15C68 24 58 27 47 22Z" fill="#46C168" stroke="#14692D" stroke-width="2.2" stroke-linejoin="round"/>` +
    `${eye(41, 62, 5.4, 0.3)}${eye(60, 62, 5.4, 0.3)}${mouth.smile(50.5, 72, 6)}${cheeks(50.5, 70, 16)}`,
  eye: () =>
    `<path d="M30 28C42 16 66 16 76 30C84 42 78 60 70 72C60 86 40 86 30 72C20 60 20 40 30 28Z" fill="#FFF1D6" stroke="#8A5ACC" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M33 40C41 33 54 34 56 44C58 56 46 66 38 62C30 58 28 48 33 40Z" fill="${DARK}"/>` +
    `<ellipse cx="44" cy="49" rx="9.4" ry="10.4" fill="#fff"/><circle cx="46" cy="51" r="5.6" fill="${DARK}"/><circle cx="48" cy="48.6" r="1.8" fill="#fff"/>` +
    shine('M62 28C68 30 72 34 73 40C69 36 65 33 59 32Z', '#fff', 0.9) +
    `${eye(65, 53, 4.6, -0.2)}${mouth.smile(62, 69, 7)}<path d="M57 44l12-3" stroke="${DARK}" stroke-width="2.6" stroke-linecap="round"/>`,
  red: () =>
    `<path d="M24 46C24 30 40 22 58 24C78 26 84 42 76 56C70 66 70 80 56 84C40 88 26 74 24 46Z" fill="#E0245E" stroke="#8C0F38" stroke-width="3" stroke-linejoin="round"/>` +
    shine('M32 40C34 32 42 28 50 28C42 34 38 40 38 50Z', '#fff', 0.65) +
        `<ellipse cx="27" cy="50" rx="3.4" ry="6" fill="#FFE1EA" stroke="#8C0F38" stroke-width="1.6" transform="rotate(-8 27 50)"/>` +
    `${eye(42, 50, 5.8, 0.4)}${eye(61, 51, 5.8, 0.4)}${mouth.grin(52, 64, 10)}`,
  garden: () =>
    Array.from({ length: 10 }, (_, i) => `<ellipse cx="50" cy="19" rx="7.4" ry="13" fill="#FFD23F" stroke="#C18A00" stroke-width="2.2" transform="rotate(${i * 36} 50 52)"/>`).join('') +
    `<circle cx="50" cy="52" r="26" fill="#F7A21B" stroke="#A45E00" stroke-width="3"/>` +
    shine('M31 46C32 38 38 33 46 32C38 37 36 43 36 52Z', '#fff', 0.5) +
    `${eye(42, 49, 5.2, 0.4)}${eye(59, 49, 5.2, 0.4)}${mouth.smile(50.5, 60, 7)}${cheeks(50.5, 58, 17)}`,
  cocoa: () =>
    `<path d="M50 10C70 14 82 34 80 56C78 76 64 90 50 90C36 90 22 76 20 56C18 34 30 14 50 10Z" fill="#E4551A" stroke="#8F2B05" stroke-width="3"/>` +
    `<path d="M50 10C42 30 42 70 50 90M50 10C58 30 58 70 50 90M50 10C30 28 28 74 50 90M50 10C70 28 72 74 50 90" fill="none" stroke="#B53A0D" stroke-width="2.6"/>` +
    shine('M28 38C30 28 36 20 43 16C36 26 34 36 34 48Z', '#fff', 0.5) +
    `<path d="M50 10C48 6 52 3 56 2C57 6 54 9 50 10Z" fill="#2BA04F" stroke="#146B30" stroke-width="2"/>` +
        `${eye(40, 50, 5.6, 0.4)}${eye(60, 50, 5.6, 0.4)}${mouth.open(50, 62, 6)}`,
};

/** Ink colour for text drawn on a type's card colour. */
export const INK = { wax: '#2B2100', stink: '#16300A', soy: '#fff' };
export const inkOf = (t) => INK[t] || '#fff';
export const colorOf = (t) => TYPES[t].c;

const svgCache = {};
/** The bean character as an SVG string (100x100). */
export function beanSvg(t) {
  return svgCache[t] || (svgCache[t] = `<svg viewBox="0 0 100 100" class="bz-bean" aria-hidden="true">${DRAW[t]()}</svg>`);
}
export function coinSvg(label = '') {
  return `<svg viewBox="0 0 40 40" class="bz-coin-svg" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#E8A100"/><circle cx="20" cy="19" r="18" fill="#FBBC05"/><circle cx="20" cy="19" r="13.4" fill="none" stroke="#E8A100" stroke-width="2"/>` +
    (label !== '' ? `<text x="20" y="25" text-anchor="middle" font-family="Outfit, Inter, sans-serif" font-weight="800" font-size="${String(label).length > 1 ? 15 : 18}" fill="#7A4A00">${label}</text>` : `<path d="M13 20C13 14 20 12 25 15C29 18 27 26 22 27C16 28 13 24 13 20Z" fill="#E8A100"/>`) +
    '</svg>';
}
/** Card back for the draw pile / hidden cards. */
export function backSvg() {
  return `<svg viewBox="0 0 100 140" class="bz-back-svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="100" height="140" fill="#1E9E57"/>` +
    `<rect x="7" y="7" width="86" height="126" fill="none" stroke="#fff" stroke-width="2.4"/>` +
    Array.from({ length: 6 }, (_, r) => Array.from({ length: 4 }, (_, c) => `<ellipse cx="${20 + c * 20 + (r % 2) * 10}" cy="${22 + r * 19}" rx="4.2" ry="6.2" fill="#fff" opacity="0.28" transform="rotate(${(r + c) % 2 ? 24 : -24} ${20 + c * 20 + (r % 2) * 10} ${22 + r * 19})"/>`).join('')).join('') +
    `<circle cx="50" cy="70" r="20" fill="#fff"/><path d="M42 60C46 54 58 56 58 66C58 78 46 86 41 78C37 72 38 64 42 60Z" fill="#1E9E57"/><path d="M45 64C46 62 49 61 51 61" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`;
}
export const meterOf = (t) => TYPES[t].v.map(([b, c]) => ({ beans: b, coins: c }));
export { coinsFor };
