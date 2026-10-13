// A proper die: ivory body, real pip layout, optional red pips (wild ones), and a roll animation.
//   dieEl(5, { w: 44, cls: 'hit' })        size comes from --w so a container can scale all its dice
import { h } from './util.js';

const CELLS = { 1: ['e'], 2: ['a', 'i'], 3: ['a', 'e', 'i'], 4: ['a', 'c', 'g', 'i'], 5: ['a', 'c', 'e', 'g', 'i'], 6: ['a', 'c', 'd', 'f', 'g', 'i'] };
const CSS = `
.dc { --w:44px; width:var(--w); height:var(--w); flex:none; border-radius:calc(var(--w) * .2); background:linear-gradient(145deg,#fffdf6 0%,#ece6d4 100%); box-shadow:inset 0 -3px 0 rgba(0,0,0,.14), inset 0 2px 2px rgba(255,255,255,.9), 0 0 0 1px rgba(0,0,0,.14), 0 3px 7px rgba(0,0,0,.3); display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); grid-template-areas:'a b c' 'd e f' 'g h i'; padding:calc(var(--w) * .13); position:relative; transition:transform .2s, box-shadow .2s, opacity .2s; }
.dc b { border-radius:50%; background:radial-gradient(circle at 35% 30%, #4a4a52, #15151a 70%); margin:14%; box-shadow:inset 0 1px 1px rgba(255,255,255,.18); }
.dc.red b, .dc.one b { background:radial-gradient(circle at 35% 30%, #ff6b6b, #c0161f 72%); }
.dc.one b { margin:12%; }
.dc.hit { box-shadow:inset 0 -3px 0 rgba(0,0,0,.12), 0 0 0 3px #ffc857, 0 0 16px rgba(255,200,87,.8); transform:translateY(-3px); }
.dc.dim { opacity:.4; }
.dc.roll { animation:dcroll .65s cubic-bezier(.3,.9,.4,1) both; }
@keyframes dcroll { 0% { transform:translateY(-34px) rotate(-200deg) scale(.6); opacity:0; } 60% { transform:translateY(4px) rotate(14deg) scale(1.04); opacity:1; } 100% { transform:none; } }
`;
let injected = false;
export function dieEl(v, { w, cls = '', roll = false, wild = false } = {}) {
  if (!injected && typeof document !== 'undefined') { injected = true; document.head.append(h('style', { id: 'gn-dice' }, CSS)); }
  const n = Math.max(1, Math.min(6, v | 0));
  return h('div.dc' + (wild && n === 1 ? '.one' : '') + (roll ? '.roll' : '') + (cls ? '.' + cls.split(' ').join('.') : ''), { style: w ? { '--w': w + 'px' } : '', role: 'img', 'aria-label': 'Die showing ' + n }, CELLS[n].map((c) => h('b', { style: { gridArea: c } })));
}
