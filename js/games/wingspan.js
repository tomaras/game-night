// Skyward Sanctuary — an original bird-preserve engine builder.
// OpenAI Codex implementation: host-authoritative play, private hands, bots, solo rival and responsive UI.
import { h } from '../util.js';
import { icon, iconBtn } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { thinkMs } from '../bots.js';
import {
  Game, BIRDS, BONUS, GOALS, FOODS, AUTOMA, EGG_COST,
  autoPay, chooseBotAnswer, powerText, POWER_LABEL,
} from './wingspan-engine.js';

const HAB = [
  { name: 'Forest', action: 'Gain food', glyph: '♣', cls: 'forest' },
  { name: 'Meadow', action: 'Lay eggs', glyph: '✿', cls: 'meadow' },
  { name: 'Wetland', action: 'Draw birds', glyph: '≈', cls: 'wetland' },
];
const FOOD = {
  i: ['Bug', 'pest_control', '#7B4FB0'], s: ['Seed', 'fiber_manual_record', '#F9AB00'],
  f: ['Fish', 'water_drop', '#4285F4'], u: ['Fruit', 'favorite', '#EA4335'], r: ['Rodent', 'pets', '#5F6368'],
};
const NEST = { b: ['Bowl', '◡'], c: ['Cavity', '●'], g: ['Ground', '⌒'], p: ['Platform', '▰'], '*': ['Wild', '✦'] };
const GOAL_BY_KEY = Object.fromEntries(GOALS.map((x) => [x.k, x]));
const css = `
.ss-game{--ss-blue:#4285F4;--ss-red:#EA4335;--ss-yellow:#FBBC05;--ss-green:#34A853;--ss-purple:#A142F4;position:relative;min-height:100%;color:var(--on);background:#7fc7f0;overflow-x:hidden;padding-bottom:92px}
.ss-game *{box-sizing:border-box}.ss-scene{position:absolute;inset:0 0 auto;height:260px;overflow:hidden;pointer-events:none;background:#7fc7f0}.ss-sun{position:absolute;width:76px;height:76px;border-radius:50%;background:var(--ss-yellow);top:28px;right:7%;box-shadow:0 0 0 9px rgba(255,255,255,.32)}
.ss-cloud{position:absolute;width:116px;height:30px;border-radius:50%;background:#fff;top:48px;left:10%;box-shadow:32px -14px 0 3px #fff,-24px 4px 0 -5px #fff}.ss-cloud.two{left:auto;right:24%;top:132px;transform:scale(.72)}
.ss-hill{position:absolute;width:65%;height:155px;border-radius:50% 50% 0 0;background:#34A853;bottom:-88px;left:-9%;transform:rotate(5deg)}.ss-hill.two{background:#188038;left:auto;right:-14%;bottom:-104px;transform:rotate(-6deg)}
.ss-shell{position:relative;z-index:1;max-width:1440px;margin:auto;padding:10px 12px}.ss-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.ss-brand{display:flex;align-items:center;gap:10px;color:#102a43;text-shadow:0 1px #fff}.ss-brand-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:#fff;color:var(--ss-blue);box-shadow:var(--z2)}.ss-brand b{font-size:18px;line-height:1}.ss-brand small{display:block;font-weight:700;margin-top:4px}
.ss-players{display:flex;gap:6px;overflow-x:auto;padding:2px}.ss-player{border:0;border-radius:22px;background:var(--surface);color:var(--on);box-shadow:var(--z1);height:42px;display:flex;align-items:center;gap:5px;padding:3px 9px 3px 4px;white-space:nowrap;font:inherit}.ss-player.on{box-shadow:0 0 0 3px var(--ss-yellow),var(--z2)}.ss-player.view{box-shadow:0 0 0 3px var(--ss-blue),var(--z2)}.ss-player b{font-size:13px}.ss-player strong{color:var(--ss-blue);font-size:13px}
.ss-status{display:flex;gap:5px;align-items:center}.ss-round,.ss-turns{background:var(--surface);color:var(--on);box-shadow:var(--z1);padding:7px 10px;font-size:12px;font-weight:800;border-radius:2px}.ss-layout{display:grid;grid-template-columns:minmax(0,1fr) 272px;gap:10px;align-items:start}
.ss-board{display:grid;gap:7px;min-width:0}.ss-habitat{position:relative;display:grid;grid-template-columns:142px minmax(0,1fr);min-height:173px;box-shadow:var(--z2);overflow:hidden;border:2px solid rgba(0,0,0,.18);border-radius:2px}.ss-habitat.forest{background:#188038}.ss-habitat.meadow{background:#F9AB00}.ss-habitat.wetland{background:#0B57D0}.ss-hab-head{position:relative;padding:12px;color:#fff;display:flex;flex-direction:column;justify-content:space-between;border-right:2px solid rgba(255,255,255,.52)}.ss-hab-head b{font-size:17px}.ss-hab-head small{display:block;font-weight:700}.ss-hab-glyph{font-size:35px;line-height:1}.ss-action{border:2px solid #fff;background:#fff;color:#17415a;border-radius:3px;min-height:42px;font:800 12px var(--font);padding:6px;box-shadow:var(--z1)}.ss-action:disabled{opacity:.55}.ss-reward{display:flex;gap:3px;align-items:center;font-size:12px;font-weight:800}.ss-row{display:flex;align-items:center;gap:7px;overflow-x:auto;padding:8px;scroll-snap-type:x proximity;min-width:0}.ss-empty-slot{flex:0 0 115px;height:145px;border:2px dashed rgba(255,255,255,.62);display:grid;place-items:center;color:#fff;font-size:11px;font-weight:800;text-align:center;padding:8px}
.ss-card{position:relative;flex:0 0 128px;width:128px;height:154px;background:var(--surface);color:var(--on);border:0;border-radius:2px;box-shadow:var(--z2);padding:0;text-align:left;overflow:hidden;scroll-snap-align:start;font:inherit;transition:transform .18s,box-shadow .18s}.ss-card.can{cursor:pointer;box-shadow:0 0 0 3px var(--ss-yellow),var(--z3)}.ss-card.can:hover,.ss-card.can:focus-visible{transform:translateY(-6px);box-shadow:0 0 0 3px #fff,var(--z4)}.ss-card.selected{transform:translateY(-7px);box-shadow:0 0 0 4px var(--ss-blue),var(--z4)}.ss-card.pulse{animation:ssPulse .7s ease}.ss-card-head{height:34px;padding:5px 31px 3px 6px;font-size:10px;line-height:1.05;font-weight:900;text-transform:uppercase;letter-spacing:.02em}.ss-points{position:absolute;right:4px;top:4px;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--ss-blue);color:#fff;font:900 12px var(--font)}
.ss-bird-art{height:54px;position:relative;overflow:hidden;background:#dff3ff;border-block:1px solid var(--line);--c1:#4285F4;--c2:#FBBC05;--c3:#202124}.ss-bird-art:after{content:"";position:absolute;left:0;right:0;bottom:5px;border-bottom:2px solid #5f6368;transform:rotate(-3deg)}.ss-body{position:absolute;width:54px;height:30px;left:34px;top:16px;background:var(--c1);border-radius:55% 48% 45% 50%;transform:rotate(-5deg);box-shadow:inset -6px -5px 0 rgba(0,0,0,.13)}.ss-wing{position:absolute;width:34px;height:20px;left:48px;top:23px;background:var(--c2);border-radius:65% 30% 70% 30%;z-index:2;transform:rotate(8deg)}.ss-head{position:absolute;width:24px;height:24px;left:23px;top:11px;background:var(--c1);border-radius:50%;z-index:3}.ss-beak{position:absolute;left:14px;top:19px;width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-right:11px solid var(--c3);z-index:3}.ss-eye{position:absolute;left:30px;top:16px;width:5px;height:5px;border-radius:50%;background:#fff;z-index:4;box-shadow:inset 0 0 0 2px #202124}.ss-tail{position:absolute;width:30px;height:11px;left:80px;top:34px;background:var(--c1);clip-path:polygon(0 0,100% 28%,72% 100%,0 74%)}.ss-bird-art.hu .ss-body{width:42px}.ss-bird-art.hu .ss-tail{width:38px;transform:rotate(15deg)}.ss-bird-art.ow .ss-head{width:29px;height:27px;top:7px}.ss-bird-art.ha .ss-wing,.ss-bird-art.ea .ss-wing{width:45px;left:43px;transform:rotate(-12deg)}.ss-bird-art.du .ss-body{height:26px;top:21px}.ss-bird-art.du:after,.ss-bird-art.lo:after{border-color:#4285F4;border-width:4px}
.ss-meta{display:flex;height:20px;padding:3px 5px;gap:5px;align-items:center;font-size:9px;font-weight:800;border-bottom:1px solid var(--line)}.ss-habs{letter-spacing:-1px}.ss-power{height:45px;padding:4px 5px 3px;border-left:5px solid var(--ss-purple);font-size:8px;line-height:1.12;overflow:hidden}.ss-power.w{border-color:#fff}.ss-power.b{border-color:#9C6ADE}.ss-power.p{border-color:#EA4AAA}.ss-power b{display:block;font-size:8px;text-transform:uppercase;margin-bottom:2px}.ss-cost{position:absolute;left:4px;top:82px;display:flex;gap:2px;z-index:5}.ss-food{position:relative;width:22px;height:22px;border-radius:50%;display:inline-grid;place-items:center;background:var(--food);color:#fff;border:2px solid #fff;box-shadow:0 1px 2px #0005;font-weight:900;font-size:10px;flex:none}.ss-food .mi{width:13px;height:13px}.ss-food.wild{background:#202124}.ss-food-n{position:absolute;right:-7px;bottom:-6px;min-width:14px;height:14px;padding:0 3px;border-radius:8px;background:#202124;color:#fff;border:1px solid #fff;display:grid;place-items:center;font-size:8px}.ss-eggs{position:absolute;right:3px;top:85px;display:flex;gap:1px;z-index:5}.ss-egg{width:13px;height:17px;border-radius:50% 50% 44% 44%;background:#F7B6D2;border:1px solid #9C4670;box-shadow:0 1px 2px #0004}.ss-cache{position:absolute;right:3px;top:105px;background:#202124;color:#fff;border-radius:10px;padding:1px 5px;font-size:8px;font-weight:900}.ss-tuck{position:absolute;right:3px;top:123px;background:var(--ss-green);color:#fff;border-radius:10px;padding:1px 5px;font-size:8px;font-weight:900}
.ss-side{display:grid;gap:8px}.ss-panel{background:var(--surface);box-shadow:var(--z2);border-radius:2px;padding:9px}.ss-panel-title{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:7px}.ss-panel-title b{font-size:13px}.ss-market{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.ss-market .ss-card{width:100%;height:128px;min-width:0}.ss-market .ss-card-head{font-size:8px;height:29px}.ss-market .ss-bird-art{height:40px}.ss-market .ss-body{transform:scale(.78);transform-origin:center}.ss-market .ss-head,.ss-market .ss-beak,.ss-market .ss-eye,.ss-market .ss-wing,.ss-market .ss-tail{transform:scale(.78)}.ss-market .ss-meta{display:none}.ss-market .ss-power{height:35px;font-size:7px}.ss-market .ss-cost{top:65px}.ss-market .ss-eggs{top:67px}.ss-deck{height:38px;border:0;background:var(--ss-blue);color:#fff;border-radius:2px;font:800 11px var(--font);box-shadow:var(--z1);width:100%;margin-top:6px}.ss-feeder{display:flex;gap:5px;flex-wrap:wrap}.ss-die{width:39px;height:39px;border-radius:8px;background:#fff;border:2px solid var(--line2);box-shadow:var(--z1);display:flex;align-items:center;justify-content:center;gap:1px;color:#202124}.ss-die.can{cursor:pointer;box-shadow:0 0 0 3px var(--ss-yellow),var(--z2)}.ss-die .ss-food{width:18px;height:18px;border-width:1px}.ss-goals{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.ss-goal{min-height:62px;border:1px solid var(--line);padding:5px;text-align:center;display:grid;align-content:center;gap:2px;background:var(--s1)}.ss-goal.now{border:3px solid var(--ss-yellow);background:var(--surface)}.ss-goal b{font-size:10px;line-height:1}.ss-goal small{font-size:9px}.ss-tools{display:flex;gap:6px}.ss-tools .btn{flex:1;min-height:38px}.ss-log{max-height:150px;overflow:auto;font-size:11px;line-height:1.35}.ss-log div{padding:4px 0;border-bottom:1px solid var(--line)}
.ss-dock{position:fixed;z-index:15;left:50%;bottom:12px;transform:translateX(-50%);width:min(880px,calc(100% - 24px));background:var(--surface);color:var(--on);box-shadow:var(--z5);border-radius:2px;padding:8px 10px;display:flex;align-items:center;gap:10px}.ss-prompt{min-width:130px;flex:1}.ss-prompt b{display:block;font-size:13px}.ss-prompt small{display:block;color:var(--on2);font-size:11px;margin-top:2px}.ss-actions{display:flex;gap:6px;overflow-x:auto;padding:3px}.ss-choice{min-height:44px;border:0;border-radius:3px;background:var(--ss-blue);color:#fff;padding:7px 11px;font:800 11px var(--font);white-space:nowrap;box-shadow:var(--z1)}.ss-choice.secondary{background:var(--s2);color:var(--on)}.ss-choice.bad{background:var(--ss-red)}.ss-choice:disabled{opacity:.45}.ss-choice .mi{display:block;margin:auto}.ss-wait{display:flex;align-items:center;gap:7px;color:var(--on2);font-size:12px}.ss-dot{width:8px;height:8px;border-radius:50%;background:var(--ss-blue);animation:ssBounce 1s infinite}.ss-dot:nth-child(2){animation-delay:.15s}.ss-dot:nth-child(3){animation-delay:.3s}
.ss-overlay{position:fixed;z-index:20;inset:0;background:rgba(0,0,0,.48);display:grid;align-items:end;animation:ssFade .18s}.ss-sheet{background:var(--surface);color:var(--on);box-shadow:var(--z5);padding:14px max(14px,calc((100vw - 1050px)/2));max-height:88vh;overflow:auto;border-radius:2px 2px 0 0}.ss-sheet-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.ss-sheet-head h3{margin:0;font-size:18px}.ss-close{width:40px;height:40px;border-radius:50%;border:0;background:var(--s2);color:var(--on);display:grid;place-items:center}.ss-card-grid{display:flex;gap:10px;overflow-x:auto;padding:8px 3px 15px}.ss-card-grid .ss-card{flex-basis:152px;width:152px;height:182px}.ss-card-grid .ss-bird-art{height:68px}.ss-card-grid .ss-power{height:57px;font-size:9px}.ss-card-grid .ss-cost{top:98px}.ss-card-grid .ss-eggs{top:101px}.ss-card-grid .ss-tuck{top:145px}.ss-card-grid .ss-cache{top:126px}.ss-setup-food{display:flex;gap:9px;flex-wrap:wrap;margin:10px 0 18px}.ss-pick-food{border:2px solid transparent;background:var(--s2);color:var(--on);padding:7px 10px;border-radius:22px;display:flex;align-items:center;gap:5px;font:700 12px var(--font)}.ss-pick-food.on{border-color:var(--ss-blue);box-shadow:var(--z2)}.ss-bonus-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}.ss-bonus{border:2px solid var(--line);background:var(--surface);color:var(--on);padding:10px;text-align:left;font:inherit;border-radius:2px}.ss-bonus.on{border-color:var(--ss-blue);box-shadow:var(--z2)}.ss-bonus b{display:block}.ss-bonus small{color:var(--on2)}.ss-confirm{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:10px}.ss-confirm-actions{display:flex;gap:6px}.ss-score-table{width:100%;border-collapse:collapse;font-size:12px}.ss-score-table th,.ss-score-table td{padding:7px;border-bottom:1px solid var(--line);text-align:right}.ss-score-table th:first-child,.ss-score-table td:first-child{text-align:left}.ss-score-table tr:first-child td{font-weight:900;color:var(--ss-blue)}
.ss-overlay{--ss-blue:#4285F4;--ss-red:#EA4335;--ss-yellow:#FBBC05;--ss-green:#34A853;z-index:200}
@keyframes ssBounce{50%{transform:translateY(-5px)}}@keyframes ssFade{from{opacity:0}}@keyframes ssPulse{40%{transform:translateY(-8px);box-shadow:0 0 0 4px var(--ss-yellow),var(--z4)}}
@media(max-width:800px){.ss-game{padding-bottom:112px}.ss-shell{padding:7px}.ss-brand small{display:none}.ss-brand-mark{width:36px;height:36px}.ss-layout{display:block}.ss-side{margin-top:7px;grid-template-columns:1fr}.ss-habitat{grid-template-columns:92px minmax(0,1fr);min-height:158px}.ss-hab-head{padding:8px}.ss-hab-head b{font-size:14px}.ss-hab-glyph{font-size:25px}.ss-action{font-size:10px;min-height:38px}.ss-card{flex-basis:116px;width:116px;height:142px}.ss-card-head{font-size:9px}.ss-bird-art{height:47px}.ss-power{height:40px}.ss-cost{top:75px}.ss-eggs{top:78px}.ss-cache{top:98px}.ss-tuck{top:115px}.ss-empty-slot{height:132px;flex-basis:100px}.ss-market .ss-card{height:119px}.ss-dock{bottom:7px;display:block;padding:7px}.ss-prompt{margin:0 3px 5px}.ss-actions{width:100%}.ss-choice{flex:1}.ss-panel.logpanel{display:none}.ss-top{align-items:flex-start}.ss-status{display:none}.ss-player{height:36px}.ss-player b{display:none}.ss-player strong{font-size:11px}.ss-card-grid .ss-card{flex-basis:142px;width:142px}.ss-sheet{padding:12px;max-height:92vh}.ss-bonus-grid{grid-template-columns:1fr}.ss-confirm{align-items:flex-start;flex-direction:column}.ss-confirm-actions{width:100%}.ss-confirm-actions .ss-choice{flex:1}}
@media(max-width:430px){.ss-brand b{font-size:14px}.ss-brand-mark{display:none}.ss-players{max-width:74vw}.ss-habitat{grid-template-columns:84px minmax(0,1fr)}.ss-row{padding:6px;gap:6px}.ss-market{gap:3px}.ss-panel{padding:7px}.ss-goal{min-height:54px;padding:3px}.ss-goal b{font-size:9px}.ss-sheet-head h3{font-size:16px}}
@media(prefers-reduced-motion:reduce){.ss-game *{animation:none!important;transition:none!important}}
`;

let styled = false;
function styleOnce() {
  if (styled) return;
  styled = true;
  document.head.append(h('style', { id: 'skyward-sanctuary-css' }, css));
}

function foodToken(t, n = null) {
  if (t === 'w') return h('span.ss-food.wild', { title: 'Any food' }, '✦');
  const [name, ico, color] = FOOD[t] || FOOD.i;
  return h('span.ss-food', { title: name + (n == null ? '' : ` × ${n}`), style: { '--food': color } }, icon(ico, 'sm'), n != null ? h('b.ss-food-n', n) : null);
}

function dieEl(face, can, onclick) {
  return h('button.ss-die' + (can ? '.can' : ''), { disabled: !can, onclick, 'aria-label': `Food die: ${face === 'is' ? 'bug or seed' : FOOD[face][0]}` },
    ...(face === 'is' ? [foodToken('i'), foodToken('s')] : [foodToken(face)]));
}

function birdArt(b) {
  return h('div.ss-bird-art.' + b.fam, { style: { '--c1': b.col[0], '--c2': b.col[1], '--c3': b.col[2] } },
    h('i.ss-tail'), h('i.ss-body'), h('i.ss-wing'), h('i.ss-head'), h('i.ss-beak'), h('i.ss-eye'));
}

function birdCard(id, entry = null, opts = {}) {
  const b = BIRDS[id], p = b.pw;
  return h((opts.onClick ? 'button' : 'div') + '.ss-card' + (opts.onClick ? '.can' : '') + (opts.selected ? '.selected' : '') + (opts.pulse ? '.pulse' : ''), { onclick: opts.onClick, title: `${b.name}. ${b.pts} points. ${powerText(b) || 'No power.'}` },
    h('div.ss-card-head', b.name), h('span.ss-points', b.pts), birdArt(b),
    h('div.ss-cost', ...b.cost.n.map((t) => foodToken(t))), entry?.eggs ? h('div.ss-eggs', ...Array.from({ length: entry.eggs }, () => h('i.ss-egg'))) : null,
    entry?.cache ? h('span.ss-cache', `food ${entry.cache}`) : null, entry?.tuck ? h('span.ss-tuck', `tucked ${entry.tuck}`) : null,
    h('div.ss-meta', h('span.ss-habs', b.hab.map((x) => HAB[x].glyph).join(' ')), h('span', NEST[b.nest][1], ' ', b.eggs), h('span', `${b.ws}cm`)),
    h('div.ss-power' + (p ? '.' + p.c : ''), p ? h('b', POWER_LABEL[p.c]) : h('b', 'Quiet'), powerText(b) || 'Worth points at the end.'));
}

function bonusCard(id, on, click) {
  const b = BONUS[id];
  return h('button.ss-bonus' + (on ? '.on' : ''), { onclick: click }, h('b', b.name), h('small', b.d));
}

function myEggs(P) { return P.board.flatMap((row, hab) => row.flatMap((e, idx) => Array(e.eggs).fill([hab, idx]))); }

function legalPlays(P, forceHab = null) {
  if (!P?.hand) return [];
  const eggs = myEggs(P), out = [];
  for (const card of P.hand) {
    const b = BIRDS[card];
    for (const hab of b.hab) {
      if (forceHab != null && hab !== forceHab) continue;
      const n = P.board[hab].length, pay = autoPay(P.food, b.cost);
      if (n < 5 && pay && eggs.length >= EGG_COST[n]) out.push({ a: 'play', card, hab, food: pay, eggs: eggs.slice(0, EGG_COST[n]) });
    }
  }
  return out;
}

function eventSound(api, events = []) {
  const map = { setup: 'shuffle', play: 'deal', draw: 'slide', discard: 'card', egg: 'place', eggx: 'pop', gain: 'chip', spend: 'chip', reroll: 'dice', roll: 'dice', power: 'flip', goal: 'ding', turn: 'turn', cache: 'place', tuck: 'slide', over: 'win', automa: 'card' };
  [...new Set(events.map((e) => map[e.k]).filter(Boolean))].slice(0, 2).forEach((s, i) => setTimeout(() => api.sfx(s, i ? 0.38 : 0.58), i * 110));
}

export function start(api) {
  styleOnce();
  const root = h('div.ss-game');
  api.root.append(root);
  let S = null, selectedPid = api.me, overlay = null, lastEvent = null, ended = false;
  const closeOverlay = () => { overlay?.remove(); overlay = null; };

  function receive(v, events = []) {
    S = v; lastEvent = events.at(-1) || null; eventSound(api, events);
    if (!S.players[selectedPid]) selectedPid = api.me in S.players ? api.me : Object.keys(S.players)[0];
    render();
  }
  function answer(v) { closeOverlay(); api.toHost('answer', v); }
  function openSheet(title, content) {
    closeOverlay();
    overlay = h('div.ss-overlay', { onclick: (e) => { if (e.target === overlay) closeOverlay(); } },
      h('section.ss-sheet', h('div.ss-sheet-head', h('h3', title), iconBtn('close', 'Close', closeOverlay, 'ss-close')), content));
    document.body.append(overlay);
  }

  function showSetup(p) {
    const pick = { birds: new Set(), foods: new Set(), bonus: null }, body = h('div');
    function paint() {
      const count = pick.birds.size + pick.foods.size;
      body.replaceChildren(h('p', 'Keep any five bird cards and food tokens in total. Then keep one sanctuary objective.'),
        h('b', `Birds · ${pick.birds.size} chosen`), h('div.ss-card-grid', p.birds.map((id) => birdCard(id, null, { selected: pick.birds.has(id), onClick: () => { pick.birds.has(id) ? pick.birds.delete(id) : count < 5 && pick.birds.add(id); paint(); } }))),
        h('b', `Food · ${pick.foods.size} chosen`), h('div.ss-setup-food', FOODS.map((t) => h('button.ss-pick-food' + (pick.foods.has(t) ? '.on' : ''), { onclick: () => { pick.foods.has(t) ? pick.foods.delete(t) : count < 5 && pick.foods.add(t); paint(); } }, foodToken(t), FOOD[t][0]))),
        h('b', 'Private objective · choose one'), h('div.ss-bonus-grid', p.bonus.map((id) => bonusCard(id, pick.bonus === id, () => { pick.bonus = id; paint(); }))),
        h('div.ss-confirm', h('span', count === 5 ? 'Ready to welcome your first birds.' : `${5 - count} more item${5 - count === 1 ? '' : 's'} to choose.`), h('div.ss-confirm-actions', h('button.ss-choice', { disabled: count !== 5 || pick.bonus == null, onclick: () => answer({ keep: [...pick.birds], foods: [...pick.foods].join(''), bonus: pick.bonus }) }, 'Start sanctuary'))));
    }
    paint(); openSheet('Prepare your sanctuary', body);
  }

  function confirmPlay(act) {
    const b = BIRDS[act.card], paid = FOODS.flatMap((t) => Array(act.food[t] || 0).fill(t));
    openSheet('Welcome this bird?', h('div', h('div.ss-card-grid', birdCard(act.card, null, { selected: true })),
      h('p', h('b', HAB[act.hab].name), ` · pay ${paid.length ? paid.map((t) => FOOD[t][0].toLowerCase()).join(', ') : 'no food'}${act.eggs.length ? ` · remove ${act.eggs.length} egg${act.eggs.length > 1 ? 's' : ''}` : ''}.`),
      h('div.ss-confirm', h('span', powerText(b) || 'No power.'), h('div.ss-confirm-actions', h('button.ss-choice.secondary', { onclick: closeOverlay }, 'Cancel'), h('button.ss-choice', { onclick: () => answer(act) }, 'Play bird')))));
  }

  function showHand(forPlay = false, forceHab = null) {
    const P = S.players[api.me], plays = legalPlays(P, forceHab), playable = new Map();
    plays.forEach((x) => { if (!playable.has(x.card)) playable.set(x.card, []); playable.get(x.card).push(x); });
    const grid = h('div.ss-card-grid', ...(P.hand || []).map((id) => birdCard(id, null, { onClick: forPlay && playable.has(id) ? () => {
      const opts = playable.get(id);
      if (opts.length === 1) confirmPlay(opts[0]);
      else openSheet('Choose a habitat', h('div', h('div.ss-card-grid', birdCard(id)), h('div.ss-actions', opts.map((x) => h('button.ss-choice', { onclick: () => confirmPlay(x) }, `${HAB[x.hab].glyph} ${HAB[x.hab].name}`)))));
    } : null })));
    if (!P.hand?.length) grid.append(h('p', 'Your hand is empty. Draw birds from the wetland row.'));
    openSheet(forPlay ? 'Play a bird' : `Your hand · ${P.handN}`, h('div', grid, forPlay && !plays.length ? h('p', 'No bird can be played now. Gather food, lay eggs, or draw a new bird first.') : null, forceHab != null ? h('button.ss-choice.secondary', { onclick: () => answer(null) }, 'Skip second bird') : null));
  }

  function showScores() {
    if (!S.over) {
      const rows = Object.values(S.players).map((p) => h('tr', h('td', S.names[p.id]), h('td', p.score), h('td', p.handN), h('td', p.board.flat().length)));
      openSheet('Sanctuary standings', h('table.ss-score-table', h('thead', h('tr', h('th', 'Player'), h('th', 'Visible pts'), h('th', 'Hand'), h('th', 'Birds'))), h('tbody', rows))); return;
    }
    const cols = [['birds', 'Birds'], ['bonus', 'Objective'], ['goals', 'Goals'], ['eggs', 'Eggs'], ['cache', 'Cached'], ['tuck', 'Tucked']];
    openSheet('Final field journal', h('table.ss-score-table', h('thead', h('tr', h('th', 'Sanctuary'), ...cols.map((x) => h('th', x[1])), h('th', 'Total'))), h('tbody', S.over.rows.map((r) => h('tr', h('td', S.names[r.pid]), ...cols.map(([k]) => h('td', r[k] || 0)), h('td', r.total))))));
  }

  function promptControls() {
    const p = S.prompt, mine = p && (p.all ? p.waiting?.includes(api.me) : p.pid === api.me);
    if (!mine) return h('div.ss-wait', h('i.ss-dot'), h('i.ss-dot'), h('i.ss-dot'), S.phase === 'setup' ? 'Everyone is preparing…' : S.cur ? `${S.names[S.cur]} is choosing…` : 'Scoring the round…');
    const P = S.players[api.me];
    if (p.kind === 'setup') return h('button.ss-choice', { onclick: () => showSetup(p) }, 'Choose opening hand');
    if (p.kind === 'turn') {
      const plays = legalPlays(P);
      return [h('button.ss-choice', { onclick: () => answer({ a: 'food' }) }, HAB[0].glyph, ' Food'), h('button.ss-choice', { disabled: !P.board.flat().some((e) => e.eggs < BIRDS[e.id].eggs), onclick: () => answer({ a: 'eggs' }) }, HAB[1].glyph, ' Eggs'), h('button.ss-choice', { onclick: () => answer({ a: 'cards' }) }, HAB[2].glyph, ' Birds'), h('button.ss-choice', { disabled: !plays.length, onclick: () => showHand(true) }, icon('add', 'sm'), ' Play')];
    }
    if (p.kind === 'dice') return S.feeder.map((f, i) => { if (!p.opts.includes(i)) return null; if (f === 'is') return h('span.ss-actions', h('button.ss-choice', { onclick: () => answer({ die: i, food: 'i' }) }, 'Bug'), h('button.ss-choice', { onclick: () => answer({ die: i, food: 's' }) }, 'Seed')); return h('button.ss-choice', { onclick: () => answer({ die: i, food: f }) }, FOOD[f][0]); });
    if (p.kind === 'draw') return [h('button.ss-choice', { disabled: !p.deckOk, onclick: () => answer('d') }, `Deck · ${S.deckN}`), ...S.tray.map((id, i) => id == null ? null : h('button.ss-choice.secondary', { onclick: () => answer(i) }, BIRDS[id].name))];
    if (p.kind === 'egg') return p.cands.map(([hab, idx]) => h('button.ss-choice', { onclick: () => answer([hab, idx]) }, `${BIRDS[P.board[hab][idx].id].name} · ${P.board[hab][idx].eggs}/${BIRDS[P.board[hab][idx].id].eggs}`));
    if (p.kind === 'eggfrom') return [p.skip ? h('button.ss-choice.secondary', { onclick: () => answer(null) }, 'Skip') : null, ...myEggs(P).map(([hab, idx]) => h('button.ss-choice', { onclick: () => answer([hab, idx]) }, BIRDS[P.board[hab][idx].id].name))];
    if (p.kind === 'handcard') return [p.skip && p.purpose !== 'endDiscard' ? h('button.ss-choice.secondary', { onclick: () => answer(null) }, 'Skip') : null, ...(P.hand || []).map((id) => h('button.ss-choice', { onclick: () => answer(id) }, BIRDS[id].name))];
    if (p.kind === 'payfood') return [p.skip ? h('button.ss-choice.secondary', { onclick: () => answer(null) }, 'Skip') : null, ...FOODS.filter((t) => P.food[t]).map((t) => h('button.ss-choice', { onclick: () => answer(t) }, FOOD[t][0]))];
    if (p.kind === 'food') return p.opts.map((t) => h('button.ss-choice', { onclick: () => answer(t) }, FOOD[t][0]));
    if (p.kind === 'bonus') return p.cards.map((id) => h('button.ss-choice', { onclick: () => answer(id) }, BONUS[id].name));
    if (p.kind === 'use' || p.kind === 'reroll') return [h('button.ss-choice.secondary', { onclick: () => answer(false) }, 'No'), h('button.ss-choice', { onclick: () => answer(true) }, p.kind === 'reroll' ? 'Re-roll' : 'Use power')];
    if (p.kind === 'play2') return h('button.ss-choice', { onclick: () => showHand(true, p.hab) }, 'Choose bird');
    if (p.kind === 'pickbird') return p.cands.map(([hab, idx]) => h('button.ss-choice', { onclick: () => answer([hab, idx]) }, BIRDS[P.board[hab][idx].id].name));
    return h('span', 'Resolving…');
  }

  function promptText() {
    const p = S.prompt, mine = p && (p.all ? p.waiting?.includes(api.me) : p.pid === api.me);
    if (!mine) return S.phase === 'setup' ? ['Opening choices', 'Private choices are still being made.'] : S.cur ? [`${S.names[S.cur]}'s turn`, `Round ${S.round} · watch their sanctuary grow.`] : ['Round scoring', 'Comparing the current goal.'];
    if (p.kind === 'setup') return ['Your opening choices', 'Keep five birds and food in total, plus one objective.'];
    if (p.kind === 'turn') return ['Choose one action', `${p.left} turn${p.left === 1 ? '' : 's'} remaining this round.`];
    return [p.text || ({ dice: 'Choose a food die', draw: 'Draw a bird', egg: 'Choose a nest', bonus: 'Choose an objective', play2: 'Optional second bird' }[p.kind] || 'Make a choice'), p.skip ? 'This choice is optional.' : 'Your sanctuary is waiting.'];
  }

  function renderHabitat(P, hi) {
    const reward = [1, 1, 2, 2, 3, 3][Math.min(P.board[hi].length, 5)] + (hi === 1 ? 1 : 0);
    const isTurn = S.prompt?.kind === 'turn' && (S.prompt.pid === api.me || S.prompt.waiting?.includes(api.me));
    const act = ['food', 'eggs', 'cards'][hi];
    return h('section.ss-habitat.' + HAB[hi].cls, h('header.ss-hab-head', h('span', h('b', HAB[hi].name), h('small', HAB[hi].action)), h('span.ss-hab-glyph', HAB[hi].glyph), h('div.ss-reward', `Base ${reward}${P.board[hi].length % 2 ? ' + trade' : ''}`), h('button.ss-action', { disabled: !isTurn || selectedPid !== api.me, onclick: () => answer({ a: act }) }, HAB[hi].action)),
      h('div.ss-row', ...P.board[hi].map((e, idx) => birdCard(e.id, e, { pulse: lastEvent && ['power', 'play', 'egg', 'cache', 'tuck'].includes(lastEvent.k) && lastEvent.pid === selectedPid && lastEvent.hab === hi && lastEvent.idx === idx })), ...Array.from({ length: Math.max(1, 5 - P.board[hi].length) }, (_, i) => h('div.ss-empty-slot', i === 0 ? `${EGG_COST[P.board[hi].length]} egg cost` : 'Open habitat'))));
  }

  function playerButton(id, p) {
    const info = api.player(id);
    return h('button.ss-player' + (S.cur === id ? '.on' : '') + (selectedPid === id ? '.view' : ''), { onclick: () => { selectedPid = id; render(); } }, info ? avatarEl(info, 'xs', { still: true }) : h('span', '🐦'), h('b', S.names[id]), h('strong', `${p.score} pts`));
  }

  function render() {
    if (!S) { root.replaceChildren(h('div.ss-shell', h('div.ss-wait', h('i.ss-dot'), h('i.ss-dot'), h('i.ss-dot'), 'Opening the field journal…'))); return; }
    const P = S.players[selectedPid] || S.players[api.me], [pt, ps] = promptText();
    const players = Object.values(S.players).map((p) => playerButton(p.id, p));
    if (S.automa) players.push(h('button.ss-player' + (S.cur === AUTOMA ? '.on' : ''), h('span', '⚙️'), h('b', 'Wildkeeper'), h('strong', `${S.automa.score} pts`)));
    const marketCan = S.prompt?.kind === 'draw' && S.prompt.pid === api.me;
    const goalEls = S.goals.map((g, i) => { const result = S.goalRes[i]?.[selectedPid]; return h('div.ss-goal' + (S.round === i + 1 && S.phase !== 'over' ? '.now' : ''), h('b', `R${i + 1} · ${GOAL_BY_KEY[g].n}`), h('small', result ? `${result.count} · +${result.pts}` : 'up next')); });
    root.replaceChildren(h('div.ss-scene', h('i.ss-sun'), h('i.ss-cloud'), h('i.ss-cloud.two'), h('i.ss-hill'), h('i.ss-hill.two')),
      h('main.ss-shell', h('header.ss-top', h('div.ss-brand', h('span.ss-brand-mark', icon('pets')), h('span', h('b', 'Skyward Sanctuary'), h('small', 'Build a living refuge'))), h('div.ss-players', players), h('div.ss-status', h('span.ss-round', `Round ${S.round || '—'} / 4`), h('span.ss-turns', S.phase === 'over' ? 'Complete' : S.cur ? `${S.names[S.cur]}'s turn` : 'Preparing'))),
        h('div.ss-layout', h('div.ss-board', ...HAB.map((_, i) => renderHabitat(P, i))), h('aside.ss-side', h('section.ss-panel', h('div.ss-panel-title', h('b', 'Bird display'), h('small', `${S.deckN} in deck`)), h('div.ss-market', S.tray.map((id, i) => id == null ? h('div') : birdCard(id, null, { onClick: marketCan ? () => answer(i) : null }))), h('button.ss-deck', { disabled: !marketCan, onclick: () => answer('d') }, `Draw face-down · ${S.deckN}`)),
          h('section.ss-panel', h('div.ss-panel-title', h('b', 'Birdfeeder'), h('small', `${S.out.length} dice out`)), h('div.ss-feeder', S.feeder.map((f) => dieEl(f, false)))), h('section.ss-panel', h('div.ss-panel-title', h('b', S.goalMode === 'blue' ? 'Personal round goals' : 'Round goals'), h('small', S.goalMode)), h('div.ss-goals', goalEls)),
          h('section.ss-panel', h('div.ss-panel-title', h('b', selectedPid === api.me ? 'Your supplies' : `${S.names[selectedPid]}'s supplies`), h('small', `${P.handN} cards`)), h('div.ss-feeder', FOODS.map((t) => foodToken(t, P.food[t] || 0))), h('div.ss-tools', h('button.btn.tonal', { disabled: !S.players[api.me]?.hand, onclick: () => showHand(false) }, `My hand ${S.players[api.me]?.handN ?? 0}`), h('button.btn.tonal', { onclick: showScores }, 'Scores'))),
          h('section.ss-panel.logpanel', h('div.ss-panel-title', h('b', 'Field journal'), h('small', `${S.log.length} notes`)), h('div.ss-log', S.log.slice(-7).reverse().map((x) => h('div', x))))))),
      h('footer.ss-dock', h('div.ss-prompt', h('b', pt), h('small', ps)), h('div.ss-actions', promptControls())));
    if (S.phase === 'setup' && S.prompt?.waiting?.includes(api.me) && !overlay) api.timeout(() => { if (!overlay && S?.phase === 'setup') showSetup(S.prompt); }, 250);
    if (S.phase === 'over' && !overlay) api.timeout(() => { if (!overlay && S?.phase === 'over') showScores(); }, 700);
  }

  api.on('state', (d) => receive(d.view, d.events || []));
  if (api.isHost) {
    const players = api.players.filter((p) => !p.left).map((p) => ({ id: p.id, name: p.name, bot: api.isBot(p.id), level: p.level || api.level }));
    const options = { players, seed: api.seed, goals: api.opts.goals || 'green', automa: players.length === 1 ? (api.opts.rival || api.level || 'normal') : null };
    let game = new Game(options), history = [], timer = null, botBusy = false;
    function restore() {
      const saved = api.restore?.answers;
      if (!Array.isArray(saved) || !saved.length) return;
      try { for (const move of saved) { let r; do { r = game.step(); } while (r.t === 'beat'); if (r.t !== 'ask' || !game.answer(move.pid, move.value)) throw new Error('restore move rejected'); history.push(move); } }
      catch (e) { console.warn('[wingspan] saved game could not be restored', e); game = new Game(options); history = []; }
    }
    function publish(events = []) {
      for (const p of api.players) { const payload = { view: game.view(p.id), events }; if (p.id === api.me) receive(payload.view, events); else api.sendTo(p.id, 'state', payload); }
      for (const id of api.audience) api.sendTo(id, 'state', { view: game.view('__audience__'), events });
    }
    function record(pid, value) { history.push({ pid, value }); api.save({ answers: history }, { round: game.s.round, turn: game.s.turnNo, label: `Round ${game.s.round}` }); }
    function scheduleBot() {
      if (botBusy || !game.prompt) return;
      const p = game.prompt, ids = p.all ? p.pids.filter((id) => !(id in game.answers)) : [p.pid], id = ids.find((x) => game.isBot(x) || api.player(x)?.left);
      if (!id) return;
      botBusy = true; const level = api.player(id)?.level || api.level || 'normal';
      api.timeout(() => { botBusy = false; if (!game.prompt || !game.waitingFor(id)) return scheduleBot(); const value = chooseBotAnswer(game, game.prompt, id, level), ok = game.answer(id, value); if (ok) record(id, value); publish(); if (ok === true) pump(); else scheduleBot(); }, thinkMs(level, 380, 620));
    }
    function finish() {
      if (ended || !game.s.over) return; ended = true;
      const rows = game.s.over.rows, ranking = rows.filter((r) => r.pid !== AUTOMA).map((r) => ({ id: r.pid, score: r.total, note: `${r.birds} bird points` })), humanWinners = game.s.over.winners.filter((id) => id !== AUTOMA);
      api.timeout(() => api.endGame({ title: humanWinners.length ? `${humanWinners.map((id) => game.name(id)).join(' & ')} built the finest sanctuary!` : 'The Wildkeeper prevailed', subtitle: `${rows[0].total} points · birds, nests, goals and discoveries`, ranking, winners: humanWinners }), 4200);
    }
    function pump() { if (timer || game.done) return; const r = game.step(); publish(r.evs); if (r.t === 'beat') timer = api.timeout(() => { timer = null; pump(); }, Math.min(r.ms, 900)); else if (r.t === 'ask') scheduleBot(); else finish(); }
    api.on('answer', (value, from) => { if (!game.waitingFor(from) || game.isBot(from)) return; const ok = game.answer(from, value); if (!ok) { api.sendTo(from, 'state', { view: game.view(from), events: [] }); return; } record(from, value); publish(); if (ok === true) pump(); else scheduleBot(); });
    api.onRejoin((id) => api.sendTo(id, 'state', { view: game.view(id), events: [] }));
    api.onLeave((id) => { game.bots[id] = true; if (game.waitingFor(id)) scheduleBot(); publish(); });
    api.onPlayersChanged(() => publish()); restore(); api.timeout(pump, 350);
  }
  render();
  return { destroy: closeOverlay };
}
