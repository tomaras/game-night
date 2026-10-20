// Original artwork for the insect-tile game: eight hand-drawn insect silhouettes (top view, 72×72 box centred on 0,0)
// and a hexagonal tile built around them. Every shape is plain SVG; colours come from CSS variables
// (--ink = the insect, --face = the tile top) so one set of definitions serves both teams.

const HEX_R = 37;
const hexPts = (r, rot = 30) => Array.from({ length: 6 }, (_, i) => { const a = ((60 * i + rot) * Math.PI) / 180; return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`; }).join(' ');
export const hexPoints = hexPts;
export const TILE_R = HEX_R;

// g = filled ink · gs = ink stroke (legs…) · f = filled tile colour (details cut out) · fs = tile-coloured stroke
const L = (d) => `<path class="gs" d="${d}"/>`;
const mirror = (inner) => `<g>${inner}</g><g transform="scale(-1 1)">${inner}</g>`;

export const GLYPHS = {
  // queen bee: striped abdomen, wings, little crown
  Q: `
    ${mirror('<ellipse class="gk wing" cx="-15" cy="-4" rx="14" ry="7.5" transform="rotate(-38 -15 -4)"/>')}
    <ellipse class="gk" cx="0" cy="13" rx="11.5" ry="18"/>
    <path class="gfs" d="M-10.8 8h21.6M-11 15.5h22M-9 23h18"/>
    <circle class="gk" cx="0" cy="-5" r="8.5"/>
    <circle class="gk" cx="0" cy="-17" r="6.6"/>
    ${L('M-4 -20Q-9 -27 -14 -27M4 -20Q9 -27 14 -27')}
    <path class="gk" d="M-6.5-22.5L-6.5-31.5L-3-27.5L0-33.5L3-27.5L6.5-31.5L6.5-22.5Z" stroke-linejoin="round"/>
    <circle class="gf" cx="-2.6" cy="-16" r="1.2"/><circle class="gf" cx="2.6" cy="-16" r="1.2"/>`,
  // spider: round body, eight bent legs
  S: `
    ${mirror(`${L('M-5 -9L-17 -25L-29 -19')}${L('M-8 -3L-27 -10L-34 -1')}${L('M-8 4L-27 8L-31 21')}${L('M-5 10L-16 25L-19 35')}`)}
    <ellipse class="gk" cx="0" cy="9" rx="11.5" ry="15"/>
    <circle class="gk" cx="0" cy="-10" r="8"/>
    <circle class="gf" cx="-3" cy="-12" r="1.8"/><circle class="gf" cx="3" cy="-12" r="1.8"/>
    <path class="gfs" d="M0 2v14M-6 9h12"/>`,
  // beetle: domed shell with a seam, horned head
  B: `
    ${mirror(`${L('M-12 -6L-25 -11')}${L('M-15 5L-29 6')}${L('M-12 15L-24 23')}`)}
    <ellipse class="gk" cx="0" cy="6" rx="16.5" ry="22"/>
    <path class="gfs" d="M0 -14V27"/>
    <path class="gfs" d="M-11 -2Q-11 14 -8 22M11 -2Q11 14 8 22" style="opacity:.0"/>
    <path class="gk" d="M-9 -17Q0 -26 9 -17L7 -21Q0 -27 -7 -21Z" />
    <circle class="gk" cx="0" cy="-20" r="7.5"/>
    ${L('M-4 -25L-9 -34M4 -25L9 -34')}
    <circle class="gf" cx="-3" cy="-21" r="1.5"/><circle class="gf" cx="3" cy="-21" r="1.5"/>`,
  // grasshopper: slim body, long jointed hind legs, long antennae
  G: `
    ${mirror(`${L('M-2 -30Q-8 -35 -19 -34')}${L('M-5 -14L-16 -19L-19 -11')}${L('M-5 -7L-24 -4L-28 14L-27 31')}${L('M-4 0L-15 8L-14 20')}`)}
    <ellipse class="gk" cx="0" cy="14" rx="5.8" ry="17"/>
    <ellipse class="gk" cx="0" cy="-7" rx="7.2" ry="9"/>
    <path class="gk" d="M-5.5 -19Q-6 -29 0 -29Q6 -29 5.5 -19Q0 -15 -5.5 -19Z"/>
    <circle class="gf" cx="-3" cy="-24" r="1.5"/><circle class="gf" cx="3" cy="-24" r="1.5"/>
    <path class="gfs" d="M-5 6h10M-5 12h10M-4.6 18h9.2"/>`,
  // ant: three clear segments, elbowed antennae
  A: `
    ${mirror(`${L('M-3 -28L-9 -34L-16 -31')}${L('M-5 -9L-17 -18L-27 -13')}${L('M-6 -4L-23 -4L-31 6')}${L('M-5 1L-17 11L-23 24')}`)}
    <ellipse class="gk" cx="0" cy="17" rx="10.5" ry="14"/>
    <ellipse class="gk" cx="0" cy="-4" rx="6.4" ry="9"/>
    <circle class="gk" cx="0" cy="-21" r="7.5"/>
    ${L('M-4 -27L-7 -30M4 -27L7 -30')}
    <circle class="gf" cx="-3" cy="-22" r="1.5"/><circle class="gf" cx="3" cy="-22" r="1.5"/>`,
  // mosquito: needle nose, long thin wings and legs
  M: `
    ${mirror(`<ellipse class="gk wing" cx="-17" cy="-5" rx="17" ry="5" transform="rotate(28 -17 -5)"/>${L('M-4 -5L-22 -15L-31 4L-30 20')}${L('M-4 0L-26 2L-33 16')}${L('M-3 5L-18 17L-22 31')}`)}
    <ellipse class="gk" cx="0" cy="15" rx="4.6" ry="16"/>
    <ellipse class="gk" cx="0" cy="-5" rx="6" ry="8"/>
    <circle class="gk" cx="0" cy="-16" r="5.2"/>
    <path class="gs" d="M0 -20L0 -35" style="stroke-width:2.2"/>
    <path class="gfs" d="M-4 11h8M-4.2 17h8.4M-3.6 23h7.2"/>
    ${L('M-2 -20Q-6 -26 -10 -26M2 -20Q6 -26 10 -26')}`,
  // ladybug: round shell, spots, small head
  L: `
    ${mirror(`${L('M-14 -3L-26 -7')}${L('M-17 8L-30 10')}${L('M-13 18L-24 26')}`)}
    <circle class="gk" cx="0" cy="6" r="21"/>
    <path class="gfs" d="M0 -14V27"/>
    <circle class="gf" cx="-9.5" cy="-1" r="3.8"/><circle class="gf" cx="9.5" cy="-1" r="3.8"/>
    <circle class="gf" cx="-10.5" cy="13" r="3.4"/><circle class="gf" cx="10.5" cy="13" r="3.4"/>
    <circle class="gf" cx="0" cy="21" r="2.6"/>
    <path class="gk" d="M-9 -15Q0 -27 9 -15Q0 -11 -9 -15Z"/>
    <circle class="gk" cx="0" cy="-20" r="6.6"/>
    ${L('M-3 -25L-7 -31M3 -25L7 -31')}
    <circle class="gf" cx="-2.8" cy="-20.5" r="1.4"/><circle class="gf" cx="2.8" cy="-20.5" r="1.4"/>`,
  // pillbug: armoured, segmented oval
  P: `
    ${mirror(`${L('M-15 -8L-23 -12')}${L('M-17 0L-25 0')}${L('M-16 9L-24 13')}${L('M-12 18L-19 25')}`)}
    <ellipse class="gk" cx="0" cy="4" rx="18" ry="25"/>
    <path class="gfs" d="M-16 -11Q0 -5 16 -11M-18 -1Q0 5 18 -1M-18 9Q0 15 18 9M-14 19Q0 24 14 19"/>
    <ellipse class="gk" cx="0" cy="-24" rx="8.5" ry="6"/>
    ${L('M-3 -28L-6 -33M3 -28L6 -33')}
    <circle class="gf" cx="-3.4" cy="-24" r="1.4"/><circle class="gf" cx="3.4" cy="-24" r="1.4"/>`,
};

// shared <defs>: one <g id="hv-g-X"> per insect; styles below make --ink / --face work inside <use>
export const GLYPH_CSS = `
.hv .gk { fill:var(--ink); } .hv .gk.wing { opacity:.5; }
.hv .gs { fill:none; stroke:var(--ink); stroke-width:2.6; stroke-linecap:round; stroke-linejoin:round; }
.hv .gf { fill:var(--face); }
.hv .gfs { fill:none; stroke:var(--face); stroke-width:2.2; stroke-linecap:round; }
`;
export function glyphDefs() {
  return `<svg class="hv-defs" width="0" height="0" aria-hidden="true" style="position:absolute"><defs>${Object.entries(GLYPHS).map(([k, v]) => `<g id="hv-g-${k}">${v}</g>`).join('')}</defs></svg>`;
}

// Team palettes: tile top, tile edge (the tile's thickness), rim, and the insect colour on each.
export const TEAM = {
  w: { face: '#FFF7E3', edge: '#C9BA8F', rim: '#FFFFFF', line: '#E5D7AC' },
  b: { face: '#2B303C', edge: '#0F1218', rim: '#4D566B', line: '#444D61' },
};
export const INK = {
  w: { Q: '#F29900', S: '#F4511E', B: '#8E24AA', G: '#1E9E4A', A: '#1A73E8', M: '#0097A7', L: '#D93025', P: '#D81B7E' },
  b: { Q: '#FBBC05', S: '#FF7043', B: '#BE6BF0', G: '#4CD07D', A: '#6BA3FF', M: '#3DDAD7', L: '#FF6B5E', P: '#FF6FB5' },
};
/** Colour a type uses as its identity (for chips etc.). */
export const TYPE_COLOR = INK.w;

/** Inner markup of a tile, centred on 0,0 (edge for thickness, face, rim, insect). `lift` = how far the thickness shows. */
export function tileInner(type, col, { thick = 5, id = true } = {}) {
  const t = TEAM[col], ink = INK[col][type];
  return `<polygon class="t-edge" points="${hexPts(HEX_R)}" transform="translate(0 ${thick})" fill="${t.edge}" stroke="${t.edge}" stroke-width="4" stroke-linejoin="round"/>` +
    `<image class="t-material" href="assets/hive/tile-${col === 'w' ? 'ivory' : 'onyx'}-v2.png" x="-37" y="-37" width="74" height="74" preserveAspectRatio="xMidYMid meet"/>` +
    `<polygon class="t-face" points="${hexPts(HEX_R)}" fill="none" stroke="${t.line}" stroke-width="2.2" stroke-linejoin="round"/>` +
    // Keep the glyph inline: CSS custom properties do not reliably cross a <use> shadow tree in WebKit.
    `<g class="t-insect" transform="scale(.8)" style="--ink:${ink};--face:${t.face}">${GLYPHS[type]}</g>`;
}
/** A standalone <svg> string showing one tile (trays, log, guide). */
export function tileSVG(type, col, size = 44, cls = '') {
  const w = size, hgt = Math.round(size * 1.1);
  return `<svg class="hv-mini ${cls}" viewBox="-42 -42 84 92" width="${w}" height="${hgt}" aria-hidden="true">${tileInner(type, col, { thick: 5 })}</svg>`;
}
