// Co-Pilots — a cooperative two-player landing game (Sky-Team-style). Pilot and co-pilot roll secret dice,
// place them one at a time in the cockpit, and must land the plane without talking about their numbers!
import { h } from '../util.js';
import { icon } from '../ui.js';

const MAXR = 8, LAND_AT = 6;
const PLANES0 = [0, 0, 1, 1, 2, 1, 1]; // planes at approach spaces 1..6 (index = space)
const SLOTS = [
  { id: 'axP', grp: 'axis', seat: 0, label: 'Axis', sub: 'pilot' }, { id: 'axC', grp: 'axis', seat: 1, label: 'Axis', sub: 'co-pilot' },
  { id: 'enP', grp: 'eng', seat: 0, label: 'Engine', sub: 'pilot' }, { id: 'enC', grp: 'eng', seat: 1, label: 'Engine', sub: 'co-pilot' },
  { id: 'rd1', grp: 'radio', seat: -1, label: 'Radio', sub: 'clears space = die' }, { id: 'rd2', grp: 'radio', seat: -1, label: 'Radio', sub: 'clears space = die' },
  { id: 'gr1', grp: 'gear', seat: -1, label: 'Gear', sub: 'needs 3+' }, { id: 'gr2', grp: 'gear', seat: -1, label: 'Gear', sub: 'needs 3+' },
];
const GRP_COL = { axis: '#8e24aa', eng: '#e53935', radio: '#1e88e5', gear: '#43a047' };
const GRP_EM = { axis: '⚖️', eng: '🔥', radio: '📻', gear: '🛞' };

const CSS = `
.cp { gap:10px; max-width:640px; }
.cp-track { display:flex; gap:4px; align-items:stretch; background:linear-gradient(180deg,#81d4fa,#e1f5fe); border-radius:22px; padding:10px 8px; }
.cp-sp { flex:1; min-width:0; border-radius:12px; background:rgba(255,255,255,.65); display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:2px; padding:4px 0 4px; min-height:84px; font:700 11px var(--font); color:var(--on2); position:relative; }
.cp-sp .pl { font-size:18px; line-height:1; display:flex; flex-direction:column; align-items:center; gap:0; } .cp-sp .me { position:absolute; top:4px; font-size:26px; } .cp-sp.run { background:rgba(255,255,255,.95); box-shadow:inset 0 -5px 0 #455a64; } .cp-sp.bad { background:#ffcdd2; }
.cp-row { display:flex; gap:8px; align-items:center; justify-content:center; flex-wrap:wrap; }
.cp-axis { display:flex; gap:4px; align-items:center; } .cp-ax { width:34px; height:20px; border-radius:6px; background:var(--s3); } .cp-ax.on { background:var(--purple); } .cp-ax.edge { background:var(--red-c); } .cp-ax.edge.on { background:var(--red); }
.cp-gear { display:flex; gap:4px; } .cp-g { width:18px; height:18px; border-radius:50%; background:var(--s3); } .cp-g.on { background:var(--green); }
.cp-cock { display:grid; grid-template-columns:1fr 1fr; gap:8px; background:var(--surface); box-shadow:var(--e1); border-radius:24px; padding:10px; }
.cp-slot { border-radius:18px; border:3px dashed color-mix(in srgb, var(--gc) 50%, #fff); background:color-mix(in srgb, var(--gc) 8%, #fff); min-height:78px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; font:700 12px var(--font); color:var(--gc); cursor:default; position:relative; }
.cp-slot small { font:600 10px var(--font); color:var(--on3); } .cp-slot .em { font-size:20px; }
.cp-slot.can { border-style:solid; background:color-mix(in srgb, var(--gc) 18%, #fff); cursor:pointer; animation:pulse 1s infinite; } .cp-slot.full { border-style:solid; background:#fff; }
.cp-die { width:46px; height:46px; border-radius:13px; display:grid; place-items:center; font:800 24px var(--font); color:#fff; background:var(--dc); box-shadow:inset 0 -4px 0 rgba(0,0,0,.22), var(--e1); user-select:none; } .cp-die.big { width:58px; height:58px; font-size:30px; border-radius:16px; cursor:pointer; } .cp-die.sel { outline:4px solid var(--yellow); transform:translateY(-6px); } .cp-die.hid { background:#b0bec5; }
.cp-hint { text-align:center; font:700 15px var(--font); min-height:22px; } .cp-log { text-align:center; font:600 13px/1.4 var(--font); color:var(--on2); }
.cp-seat { display:flex; align-items:center; gap:8px; justify-content:center; font:700 14px var(--font); }
`;

export function start(api) {
  const ids = api.players.slice(0, 2).map((p) => p.id);
  const nameOf = (id) => api.player(id)?.name || '?';
  const seats = api.seed % 2 ? [ids[1], ids[0]] : ids; // seats[0] = pilot
  const mySeat = seats.indexOf(api.me);
  const dieCol = (seat) => (seat === 0 ? '#1e88e5' : '#fb8c00');
  const root = h('div.kt.wide.cp');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, pos: 0, planes: PLANES0.slice(), axis: 0, gear: 0, placed: {}, turn: 0, dice: [], others: 0, sel: null, log: [], end: null, need: 5 };

  api.on('state', (s) => { Object.assign(S, s); if (!S.dice.some((d) => d.i === S.sel)) S.sel = null; if (s.sfx) api.sfx(s.sfx); render(); });
  api.onPlayersChanged(render);

  const sharedUsed = () => Object.entries(S.placed).filter(([k, v]) => SLOTS.find((s) => s.id === k).seat === -1 && v.seat === mySeat).length;
  const slotOk = (sl) => !S.placed[sl.id] && (sl.seat === mySeat || (sl.seat === -1 && sharedUsed() < 2));
  function render() {
    const me = mySeat;
    if (S.phase === 'end' && S.end) {
      const e = S.end;
      root.replaceChildren(h('div.kt-prompt', { style: `--pc:${e.win ? '#34a853' : '#ea4335'}` }, h('small', e.win ? 'Touchdown!' : 'Mayday'), e.win ? '🛬 Smooth landing!' : '💥 ' + e.msg), h('div.kt-card', { style: 'text-align:center' }, e.detail), trackEl(), h('div.kt-hint', 'Finishing up…'));
      return;
    }
    const myTurn = S.phase === 'place' && S.turn === me;
    const seatTxt = me === 0 ? '✈️ You are the PILOT' : '🧑‍✈️ You are the CO-PILOT';
    const head = h('div.cp-seat', h('span.chip.blue', `Round ${S.round}/${MAXR}`), h('span.chip.' + (me === 0 ? 'blue' : 'yellow'), seatTxt), h('span.chip.green', icon('check', 'sm'), `Gear ${S.gear}/${S.need}`));
    const axis = h('div.cp-row', h('span', { style: 'font:700 12px var(--font);color:var(--on2)' }, 'Axis'), h('div.cp-axis', [-2, -1, 0, 1, 2].map((a) => h('div.cp-ax' + (S.axis === a ? '.on' : '') + (Math.abs(a) === 2 ? '.edge' : ''), a === S.axis ? '●' : ''))), h('span', { style: 'font:600 11px var(--font);color:var(--on3)' }, 'keep it within ±1 to land'));
    const cock = h('div.cp-cock', SLOTS.map((sl) => {
      const pl = S.placed[sl.id];
      const can = myTurn && S.sel !== null && slotOk(sl);
      const mine = sl.seat === me || sl.seat === -1;
      return h('div.cp-slot' + (can ? '.can' : '') + (pl ? '.full' : ''), { style: `--gc:${GRP_COL[sl.grp]}`, onclick: can ? () => put(sl.id) : null, title: sl.sub },
        pl ? h('div.cp-die', { style: `--dc:${dieCol(pl.seat)}` }, pl.v) : [h('span.em.emo', GRP_EM[sl.grp]), sl.label],
        h('small', pl ? (pl.seat === 0 ? 'pilot' : 'co-pilot') : sl.seat === -1 ? sl.sub : (mine ? 'your seat' : 'partner’s seat')));
    }));
    const dice = h('div.cp-row', S.phase === 'place' ? S.dice.map((d) => h('div.cp-die.big' + (S.sel === d.i ? '.sel' : ''), { style: `--dc:${dieCol(me)}`, onclick: () => { if (!myTurn) return api.toast(S.phase === 'place' ? 'Wait for your partner' : ''); S.sel = S.sel === d.i ? null : d.i; api.sfx('pop'); render(); } }, d.v)) : []);
    const partner = h('div.cp-row', h('span', { style: 'font:600 12px var(--font);color:var(--on2)' }, `${nameOf(seats[1 - me])}’s dice (secret):`), ...Array.from({ length: S.others }, () => h('div.cp-die.hid', '?')));
    let hint = '';
    if (S.phase === 'place') hint = myTurn ? (S.sel === null ? 'Your turn — pick one of your dice' : 'Now tap a glowing cockpit slot') : `${nameOf(seats[S.turn])} is placing a die…`;
    else if (S.phase === 'resolve') hint = 'Rolling the numbers…';
    root.replaceChildren(head, trackEl(), axis, cock, h('div.cp-hint', hint), dice, partner, h('div.cp-log', S.log.slice(-3).map((l) => h('div', l))), h('div.kt-hint', '🤐 Rule: you may chat — but never say your dice numbers!'));
  }
  function trackEl() {
    return h('div.cp-track', [0, 1, 2, 3, 4, 5, 6].map((i) => h('div.cp-sp' + (i === LAND_AT ? '.run' : ''), i === S.pos ? h('span.me.emo', '🛩️') : null,
      i === 0 ? h('div.pl', '') : h('div.pl', Array.from({ length: S.planes[i] || 0 }, () => h('span.emo', '✈️'))), i === LAND_AT ? '🏁 runway' : i === 0 ? 'start' : String(i))));
  }
  function put(slot) { const d = S.dice.find((x) => x.i === S.sel); if (!d) return; api.toHost('place', { i: d.i, slot }); S.sel = null; render(); }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, pos: 0, planes: PLANES0.slice(), axis: 0, gear: 0, placed: {}, turn: 0, dice: [[], []], phase: 'wait', timer: 0, log: [], need: 5, sfx: null };
    api.cleanup(() => clearTimeout(H.timer));
    const pub = (extra = {}) => seats.forEach((id, s) => api.sendTo(id, 'state', { phase: H.phase, round: H.round, pos: H.pos, planes: H.planes, axis: H.axis, gear: H.gear, placed: H.placed, turn: H.turn, dice: H.dice[s].map((v, i) => ({ v, i })).filter((d) => d.v !== null), others: H.dice[1 - s].filter((v) => v !== null).length, log: H.log, need: H.need, sfx: H.sfx, ...extra }));
    const sendPub = (extra) => { pub(extra); H.sfx = null; };
    function newRound() {
      H.round++;
      H.dice = [0, 1].map(() => Array.from({ length: 4 }, () => rng.int(6) + 1));
      H.placed = {}; H.turn = 0; H.phase = 'place'; H.log = H.round === 1 ? ['Land the plane! Place your dice in the cockpit.'] : H.log;
      sendPub();
    }
    api.on('place', ({ i, slot }, from) => {
      const s = seats.indexOf(from);
      if (H.phase !== 'place' || s !== H.turn) return;
      const sl = SLOTS.find((x) => x.id === slot);
      if (!sl || H.placed[slot] || !(i >= 0 && i < 4) || H.dice[s][i] === null) return;
      if (sl.seat !== -1 && sl.seat !== s) return;
      if (sl.seat === -1 && Object.entries(H.placed).filter(([k, v]) => v.seat === s && SLOTS.find((x) => x.id === k).seat === -1).length >= 2) return;
      H.placed[slot] = { v: H.dice[s][i], seat: s };
      H.dice[s][i] = null;
      H.sfx = 'pop';
      if (Object.keys(H.placed).length >= 8) { H.phase = 'resolve'; sendPub(); H.timer = setTimeout(resolve, 1200); return; }
      H.turn = 1 - H.turn;
      sendPub();
    });
    function lose(msg, detail) { H.phase = 'end'; H.sfx = 'lose'; sendPub({ end: { win: false, msg, detail } }); H.timer = setTimeout(() => finish(false, msg), 5000); }
    function resolve() {
      const v = (k) => H.placed[k].v;
      const log = [];
      // axis
      const d = v('axP') - v('axC');
      const shift = Math.sign(d) * Math.floor(Math.abs(d) / 2);
      H.axis += shift;
      log.push(`⚖️ Axis dice ${v('axP')} vs ${v('axC')} → ${shift === 0 ? 'steady' : `tilt ${shift > 0 ? '→' : '←'} ${Math.abs(shift)}`}`);
      // radio
      for (const k of ['rd1', 'rd2']) { const val = v(k); if (H.planes[val] > 0) { H.planes[val]--; log.push(`📻 Cleared a plane from space ${val}`); } else log.push(`📻 Radio ${val}: nothing there`); }
      // gear
      for (const k of ['gr1', 'gr2']) { if (v(k) >= 3) { H.gear++; log.push(`🛞 Gear ${v(k)} ✓`); } else log.push(`🛞 Gear ${v(k)} jammed`); }
      // engines
      const E = v('enP') + v('enC');
      const adv = E <= 4 ? 1 : E <= 8 ? 2 : 3;
      log.push(`🔥 Engines ${v('enP')}+${v('enC')} = ${E} → advance ${adv}`);
      const from = H.pos, to = H.pos + adv;
      H.log = log;
      if (Math.abs(H.axis) > 2) return lose('The plane rolled out of control!', log.join(' · '));
      for (let sp = from + 1; sp <= Math.min(to, LAND_AT); sp++) if (H.planes[sp] > 0) { H.pos = sp; return lose(`Collision with a plane at space ${sp}!`, log.join(' · ')); }
      H.pos = Math.min(to, LAND_AT);
      if (H.pos >= LAND_AT) {
        if (Math.abs(H.axis) > 1) return lose('Landed crooked — the axis was too tilted!', log.join(' · '));
        if (H.gear < H.need) return lose(`The landing gear wasn’t ready (${H.gear}/${H.need})!`, log.join(' · '));
        H.phase = 'end'; H.sfx = 'win';
        sendPub({ end: { win: true, detail: `${H.round} rounds · gear ${H.gear} · axis ${H.axis}` } });
        H.timer = setTimeout(() => finish(true), 5500);
        return;
      }
      if (H.round >= MAXR) return lose('Out of fuel — you never reached the runway!', log.join(' · '));
      H.phase = 'between';
      sendPub();
      H.timer = setTimeout(newRound, 4200);
    }
    function finish(win, msg) {
      api.endGame({ title: win ? '🛬 Perfect landing!' : 'The plane didn’t make it', subtitle: win ? 'Pilot and co-pilot saved the day' : msg, ranking: ids.map((id) => ({ id, score: win ? 'landed' : 'crashed', note: '' })), winners: win ? ids.slice() : [] });
    }
    api.onRejoin(() => sendPub());
    api.onLeave(() => { clearTimeout(H.timer); finish(false, 'A pilot left the cockpit'); });
    api.timeout(newRound, 800);
  }
  render();
}
