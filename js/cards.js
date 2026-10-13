// A proper playing card: corner indices, real pip layouts, court-card faces and a patterned back.
//   playingCard('A', 's', { w: 54 })     rank: A 2–10 (or 'T') J Q K     suit: s h d c
//   cardBack({ w: 54 })
// Size comes from the CSS variable --w, so a container can scale all of its cards at once.
import { h } from './util.js';

export const SUIT = { s: { sym: '♠', red: false, name: 'Spades' }, h: { sym: '♥', red: true, name: 'Hearts' }, d: { sym: '♦', red: true, name: 'Diamonds' }, c: { sym: '♣', red: false, name: 'Clubs' } };
const PIPS = {
  2: [[50, 0], [50, 100]], 3: [[50, 0], [50, 50], [50, 100]], 4: [[0, 0], [100, 0], [0, 100], [100, 100]],
  5: [[0, 0], [100, 0], [50, 50], [0, 100], [100, 100]], 6: [[0, 0], [100, 0], [0, 50], [100, 50], [0, 100], [100, 100]],
  7: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [0, 100], [100, 100]], 8: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [50, 75], [0, 100], [100, 100]],
  9: [[0, 0], [100, 0], [0, 33], [100, 33], [50, 50], [0, 67], [100, 67], [0, 100], [100, 100]], 10: [[0, 0], [100, 0], [50, 17], [0, 33], [100, 33], [0, 67], [100, 67], [50, 83], [0, 100], [100, 100]],
};
const FACE = { J: '♞', Q: '♛', K: '♚' };

const CSS = `
.pc { --w:50px; width:var(--w); height:calc(var(--w) * 1.4); flex:none; position:relative; border-radius:calc(var(--w) * .1); background:linear-gradient(160deg,#fff 0%,#f4f2ec 100%); color:#1b1b24; box-shadow:0 0 0 1px rgba(0,0,0,.16), 0 3px 9px rgba(0,0,0,.28); font-family:var(--font); user-select:none; transition:transform .18s, box-shadow .18s; }
.pc.r { color:#cf2a37; }
.pc .ix { position:absolute; display:flex; flex-direction:column; align-items:center; line-height:.9; font-weight:800; font-size:calc(var(--w) * .3); letter-spacing:-.04em; }
.pc .ix i { font-style:normal; font-size:.78em; margin-top:.06em; }
.pc .ix.tl { left:calc(var(--w) * .07); top:calc(var(--w) * .05); } .pc .ix.br { right:calc(var(--w) * .07); bottom:calc(var(--w) * .05); transform:rotate(180deg); }
.pc .pp { position:absolute; inset:calc(var(--w) * .2) calc(var(--w) * .2); }
.pc .pp b { position:absolute; width:0; height:0; display:grid; place-items:center; font-size:calc(var(--w) * .25); line-height:1; font-weight:400; }
.pc .pp.dense b { font-size:calc(var(--w) * .205); }
.pc .pp b.fl { transform:rotate(180deg); }
.pc .big { position:absolute; inset:0; display:grid; place-items:center; font-size:calc(var(--w) * .62); line-height:1; }
.pc .court { position:absolute; inset:calc(var(--w) * .17) calc(var(--w) * .2); border-radius:calc(var(--w) * .06); background:linear-gradient(135deg,color-mix(in srgb,currentColor 14%,#fff),color-mix(in srgb,currentColor 4%,#fff)); box-shadow:inset 0 0 0 1.5px color-mix(in srgb,currentColor 55%,transparent); display:grid; place-items:center; font-size:calc(var(--w) * .5); line-height:1; }
.pc .court i { position:absolute; font-style:normal; font-size:calc(var(--w) * .2); }
.pc .court i:first-child { left:6%; top:3%; } .pc .court i:last-child { right:6%; bottom:3%; transform:rotate(180deg); }
.pc.back { background:#fff; padding:calc(var(--w) * .05); }
.pc.back::before { content:''; position:absolute; inset:calc(var(--w) * .05); border-radius:calc(var(--w) * .06); background:repeating-linear-gradient(45deg,#2c46b8 0 calc(var(--w) * .07),#1d307f calc(var(--w) * .07) calc(var(--w) * .14)); box-shadow:inset 0 0 0 2px rgba(255,255,255,.25); }
.pc.back::after { content:''; position:absolute; inset:calc(var(--w) * .22) calc(var(--w) * .15); border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,.5),transparent 70%); }
.pc.win { box-shadow:0 0 0 3px #ffc857, 0 0 18px #ffc857, 0 3px 9px rgba(0,0,0,.28); transform:translateY(-5px); }
.pc.dim { opacity:.45; filter:grayscale(.4); }
.pc.empty { background:rgba(255,255,255,.08); box-shadow:inset 0 0 0 2px rgba(255,255,255,.12); }
.pc.deal { animation:pcdeal .35s cubic-bezier(.2,.9,.3,1.1) both; }
@keyframes pcdeal { from { opacity:0; transform:translateY(-26px) scale(.8) rotate(-8deg); } }
`;
let injected = false;
function ensureCss() { if (injected || typeof document === 'undefined') return; injected = true; document.head.append(h('style', { id: 'gn-cards' }, CSS)); }

/** @param {string} rank  'A','2'…'10' (or 'T'),'J','Q','K'   @param {'s'|'h'|'d'|'c'} suit */
export function playingCard(rank, suit, { w, cls = '', deal = false } = {}) {
  ensureCss();
  const r = rank === 'T' ? '10' : String(rank), S = SUIT[suit] || SUIT.s;
  const ix = (pos) => h('div.ix.' + pos, r, h('i', S.sym));
  let face;
  if (PIPS[r]) face = h('div.pp' + (PIPS[r].length > 6 ? '.dense' : ''), PIPS[r].map(([x, y]) => h('b' + (y > 50 ? '.fl' : ''), { style: { left: x + '%', top: y + '%' } }, S.sym)));
  else if (r === 'A') face = h('div.big', S.sym);
  else face = h('div.court', h('i', S.sym), FACE[r] || r, h('i', S.sym));
  return h('div.pc' + (S.red ? '.r' : '') + (deal ? '.deal' : '') + (cls ? '.' + cls.split(' ').join('.') : ''), { style: w ? { '--w': w + 'px' } : '', 'data-card': r + suit, role: 'img', 'aria-label': `${r} of ${S.name}` }, ix('tl'), face, ix('br'));
}
export function cardBack({ w, cls = '' } = {}) { ensureCss(); return h('div.pc.back' + (cls ? '.' + cls.split(' ').join('.') : ''), { style: w ? { '--w': w + 'px' } : '', 'aria-label': 'Face-down card' }); }
export function emptySlot({ w } = {}) { ensureCss(); return h('div.pc.empty', { style: w ? { '--w': w + 'px' } : '' }); }
