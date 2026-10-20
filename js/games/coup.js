// Coup — a host-authoritative game of bluff, deduction and hidden influence.
// UI/session integration by OpenAI Codex. Pure rules, portrait art and bot reasoning live in the sibling modules.
import { h } from '../util.js';
import { avatarEl } from '../avatar.js';
import { botLoop } from '../bots.js';
import { flipDeep, dealIn, shake, bump, celebrate } from '../motion.js';
import * as E from './coup-engine.js';
import { Brain, PERSONALITIES, thinkTime } from './coup-bots.js';
import { roleArt, cardBackArt, coinSVG, glyph } from './coup-art.js';

const TURN_MS = 45000;
const WINDOW_MS = 16000;
const PICK_MS = 30000;

const ACTION_COPY = {
  income: ['Income', '+1 coin', 'income'],
  aid: ['Foreign aid', '+2 coins · Duchess may block', 'aid'],
  coup: ['Overthrow', '7 coins · cannot be stopped', 'coup'],
  tax: ['Collect tax', 'Claim Duchess · +3 coins', 'tax'],
  assassinate: ['Strike', 'Claim Shade · pay 3', 'assassinate'],
  steal: ['Plunder', 'Claim Corsair · take up to 2', 'steal'],
  exchange: ['Exchange', 'Claim Envoy · draw 2, choose', 'exchange'],
  swap: ['Swap', 'Claim Oracle · draw 1, choose', 'swap'],
  examine: ['Examine', 'Claim Oracle · inspect influence', 'examine'],
  convert: ['Convert', 'Pay 1 for you, 2 for a rival', 'convert'],
  embezzle: ['Embezzle', 'Claim you have no Duchess', 'embezzle'],
};

const CSS = `
.vc { --felt:#302262; --felt2:#241847; --gold:#FBBC05; width:100%; max-width:1180px; min-height:100%; margin:0 auto; padding:10px 12px calc(16px + var(--sab)); display:flex; flex-direction:column; gap:10px; color:var(--on); }
.vc *:focus-visible { outline:3px solid var(--blue); outline-offset:3px; }
.vc-table { position:relative; background:var(--felt); color:#fff; border:1px solid #473580; border-radius:2px; box-shadow:var(--z3), inset 0 0 0 5px #281C51, inset 0 0 0 6px #584699; min-height:330px; overflow:hidden; }
.vc-table::before { content:''; position:absolute; inset:7px; pointer-events:none; border:1px solid rgba(255,255,255,.12); }
.vc-opponents { position:relative; z-index:2; display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; padding:12px 12px 0; }
.vc-seat { min-width:0; padding:8px; display:grid; grid-template-columns:42px 1fr auto; grid-template-rows:auto auto; gap:2px 8px; align-items:center; background:#fff; color:#1A1820; border:2px solid transparent; border-radius:2px; box-shadow:0 3px 0 #17102F,0 7px 15px rgba(0,0,0,.24); transition:transform .2s,opacity .2s,border-color .2s; }
.vc-seat.turn { border-color:var(--gold); transform:translateY(3px); box-shadow:0 0 0 #17102F,0 3px 8px rgba(0,0,0,.22); }
.vc-seat.out { opacity:.48; filter:saturate(.25); }
.vc-seat .avwrap { grid-row:1/3; }
.vc-name { font:800 13px/1.15 var(--font); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vc-status { font:600 11px/1.2 var(--font); color:#666173; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vc-money { grid-row:1/3; display:flex; align-items:center; gap:3px; font:900 18px/1 var(--font); color:#805900; }
.vc-money svg { width:25px; height:25px; filter:drop-shadow(0 2px 1px rgba(0,0,0,.18)); }
.vc-influence { grid-column:2/4; display:flex; gap:3px; min-height:16px; }
.vc-mini-card { width:16px; height:21px; border-radius:1px; overflow:hidden; background:#2F58C9; box-shadow:0 1px 2px rgba(0,0,0,.25); }
.vc-mini-card svg { width:100%; height:100%; display:block; }
.vc-mini-card.dead { width:24px; height:30px; filter:saturate(.25); opacity:.78; transform:rotate(-4deg); }
.vc-center { position:relative; min-height:205px; padding:20px 12px 14px; display:grid; place-items:center; z-index:1; }
.vc-supply { position:absolute; left:16px; top:50%; transform:translateY(-44%); display:flex; flex-direction:column; align-items:center; gap:5px; color:#DCD5F5; font:700 10px/1 var(--font); letter-spacing:.06em; text-transform:uppercase; }
.vc-deck { position:relative; width:55px; height:70px; }
.vc-deck::before,.vc-deck::after { content:''; position:absolute; inset:0; background:#2F58C9; border:1px solid #FFC928; border-radius:1px; }
.vc-deck::before { transform:translate(-4px,4px); }.vc-deck::after { transform:translate(-2px,2px); }
.vc-deck > div { position:relative; z-index:2; width:100%; height:100%; overflow:hidden; border-radius:1px; box-shadow:0 3px 8px rgba(0,0,0,.35); }
.vc-deck svg { width:100%; height:100%; display:block; }
.vc-count { position:absolute; right:-9px; bottom:-8px; width:24px; height:24px; border-radius:50%; display:grid; place-items:center; background:#fff; color:#241847; font:900 11px var(--font); box-shadow:0 2px 5px rgba(0,0,0,.28); z-index:3; }
.vc-reserve { position:absolute; right:16px; top:50%; transform:translateY(-44%); display:flex; flex-direction:column; align-items:center; gap:4px; color:#DCD5F5; font:700 10px/1 var(--font); letter-spacing:.06em; text-transform:uppercase; }
.vc-reserve .coins { position:relative; width:56px; height:44px; }
.vc-reserve svg { position:absolute; width:31px; height:31px; filter:drop-shadow(0 2px 1px rgba(0,0,0,.25)); }
.vc-reserve svg:nth-child(1){left:2px;top:10px}.vc-reserve svg:nth-child(2){left:20px;top:2px}.vc-reserve svg:nth-child(3){left:25px;top:14px}.vc-reserve svg:nth-child(4){left:8px;top:0}
.vc-plaque { width:min(560px,calc(100% - 150px)); min-height:118px; padding:12px 14px; display:flex; align-items:center; justify-content:center; text-align:center; background:#fff; color:#1A1820; border-radius:2px; box-shadow:0 5px 0 #17102F,0 13px 25px rgba(0,0,0,.32); }
.vc-plaque-inner { display:flex; flex-direction:column; align-items:center; gap:5px; }
.vc-plaque-icon { width:44px; height:44px; border-radius:50%; display:grid; place-items:center; background:var(--pc,var(--blue)); color:#fff; }
.vc-plaque-icon svg { width:26px; height:26px; }
.vc-plaque b { font:900 20px/1.1 var(--font); }.vc-plaque p { margin:0; color:#5F596A; font:600 13px/1.35 var(--font); }
.vc-waiting { display:flex; align-items:center; gap:5px; margin-top:2px; font:650 11px var(--font); color:#7A7484; }
.vc-pulse { width:7px; height:7px; border-radius:50%; background:var(--gold); animation:vc-pulse 1.2s ease-in-out infinite; }
@keyframes vc-pulse { 50% { transform:scale(.45); opacity:.5 } }
.vc-time { position:absolute; left:7px; right:7px; bottom:7px; height:4px; background:rgba(255,255,255,.16); overflow:hidden; }
.vc-time > i { display:block; height:100%; width:100%; background:var(--gold); transition:width .2s linear; }
.vc-lower { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:10px; align-items:start; }
.vc-you,.vc-panel { background:var(--surface); border:1px solid var(--line); border-radius:2px; box-shadow:var(--z2); }
.vc-you { padding:12px; min-width:0; }
.vc-you-head { display:flex; align-items:center; gap:8px; margin-bottom:9px; }
.vc-you-head b { font:850 15px var(--font); }.vc-you-head .spacer { flex:1; }.vc-you-head .vc-money { grid-row:auto; }
.vc-hand { display:flex; gap:10px; align-items:stretch; justify-content:center; min-height:150px; }
.vc-card { --rc:var(--purple); position:relative; width:min(145px,42vw); aspect-ratio:4/5; padding:0; border:2px solid var(--surface); border-radius:2px; overflow:hidden; background:#2F58C9; color:#fff; box-shadow:0 4px 0 color-mix(in srgb,var(--rc) 65%,#000),0 8px 14px rgba(20,15,35,.18); text-align:left; cursor:default; transition:transform .16s,box-shadow .16s,opacity .16s; }
button.vc-card { cursor:pointer; }.vc-card.pickable:hover { transform:translateY(-5px); box-shadow:0 9px 0 color-mix(in srgb,var(--rc) 65%,#000),0 16px 24px rgba(20,15,35,.2); }.vc-card.selected { outline:4px solid var(--gold); outline-offset:2px; transform:translateY(-4px); }
.vc-card.dead { filter:grayscale(.72); opacity:.62; transform:rotate(-3deg) translateY(8px); }.vc-card.dead::after { content:'REVEALED'; position:absolute; left:-15%; right:-15%; top:44%; padding:5px 0; background:#1A1820; color:#fff; text-align:center; font:900 11px var(--font); letter-spacing:.12em; transform:rotate(-16deg); }
.vc-card > svg { display:block; width:100%; height:100%; }.vc-card-label { position:absolute; left:0; right:0; bottom:0; padding:7px 8px; background:#1A1820; color:#fff; }.vc-card-label b { display:block; font:900 13px/1.05 var(--font); }.vc-card-label small { display:block; margin-top:2px; font:600 9.5px/1.15 var(--font); color:#DAD6E1; }
.vc-panel { padding:12px; max-height:298px; overflow:auto; }.vc-panel h3 { margin:0 0 8px; font:850 13px var(--font); }.vc-log { display:flex; flex-direction:column; gap:7px; }.vc-log p { margin:0; padding-left:9px; border-left:3px solid var(--line2); color:var(--on2); font:550 12px/1.35 var(--font); }.vc-log p:last-child { color:var(--on); border-color:var(--blue); font-weight:700; }
.vc-actions { grid-column:1/-1; background:var(--surface); border:1px solid var(--line); border-radius:2px; box-shadow:var(--z2); padding:11px; }
.vc-actions-title { display:flex; align-items:center; gap:8px; margin-bottom:8px; }.vc-actions-title b { font:850 14px var(--font); }.vc-actions-title span { color:var(--on2); font-size:12px; }.vc-actions-title .spacer{flex:1}
.vc-action-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; }
.vc-act { --ac:var(--blue); min-width:0; min-height:64px; padding:8px 9px; border:0; border-radius:2px; background:var(--s1); color:var(--on); box-shadow:inset 0 0 0 1px var(--line),0 3px 0 var(--s3); cursor:pointer; display:grid; grid-template-columns:34px 1fr; gap:7px; align-items:center; text-align:left; font-family:var(--font); transition:transform .12s,box-shadow .12s; }.vc-act:active:not(:disabled){transform:translateY(3px);box-shadow:inset 0 0 0 1px var(--line)}.vc-act:disabled{opacity:.38;cursor:not-allowed;box-shadow:inset 0 0 0 1px var(--line)}
.vc-act .g { width:34px; height:34px; border-radius:50%; background:var(--ac); color:#fff; display:grid; place-items:center; }.vc-act .g svg{width:20px;height:20px}.vc-act b{display:block;font:800 12px/1.12 var(--font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vc-act small{display:block;margin-top:3px;color:var(--on2);font:550 10px/1.15 var(--font)}
.vc-dock { position:sticky; z-index:10; bottom:calc(8px + var(--sab)); margin:0 auto; width:min(700px,calc(100% - 8px)); padding:11px; background:var(--surface); color:var(--on); border:1px solid var(--line2); border-radius:2px; box-shadow:var(--z4); text-align:center; }.vc-dock h3{margin:0 0 3px;font:900 16px var(--font)}.vc-dock p{margin:0 0 9px;color:var(--on2);font:550 12px/1.35 var(--font)}.vc-dock-buttons{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.vc-dock .btn{min-width:120px}.vc-dock .btn svg{width:19px;height:19px}
.vc-targets { display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:8px }.vc-target { min-width:110px; min-height:48px; padding:6px 10px; border:2px solid var(--blue); border-radius:2px; background:var(--surface); color:var(--on); box-shadow:0 3px 0 var(--blue-d); font:750 13px var(--font); cursor:pointer; display:flex;align-items:center;gap:7px }.vc-target:active{transform:translateY(3px);box-shadow:none}
.vc-role-key { display:flex;gap:5px;overflow-x:auto;padding:2px 1px 5px;scrollbar-width:thin }.vc-role-chip { flex:none;display:flex;align-items:center;gap:5px;height:27px;padding:0 9px 0 4px;border-radius:99px;background:var(--s2);font:750 10px var(--font)}.vc-role-chip i{width:19px;height:19px;border-radius:50%;display:grid;place-items:center;background:var(--rc);color:#fff;font-style:normal;font-weight:900}
.vc-toastline { padding:8px 10px; text-align:center; background:var(--s2); border-radius:2px; color:var(--on2); font:650 12px var(--font); }
@media(max-width:720px){
 .vc{padding:6px 6px calc(10px + var(--sab));gap:7px}.vc-table{min-height:315px}.vc-opponents{display:flex;overflow-x:auto;justify-content:flex-start;padding:9px 9px 6px;scroll-snap-type:x proximity}.vc-seat{flex:0 0 132px;grid-template-columns:34px 1fr auto;padding:6px;gap:1px 5px;scroll-snap-align:start}.vc-seat .avwrap{transform:scale(.82);transform-origin:center}.vc-money{font-size:15px}.vc-money svg{width:21px;height:21px}.vc-center{min-height:217px;padding:10px 7px 14px}.vc-plaque{width:calc(100% - 116px);min-height:125px;padding:9px}.vc-plaque-icon{width:38px;height:38px}.vc-plaque b{font-size:17px}.vc-plaque p{font-size:11px}.vc-supply{left:9px}.vc-reserve{right:7px}.vc-deck{width:43px;height:55px}.vc-reserve .coins{transform:scale(.8)}
 .vc-lower{display:flex;flex-direction:column}.vc-you{width:100%;padding:9px}.vc-you-head{margin-bottom:6px}.vc-hand{min-height:132px;gap:7px}.vc-card{width:min(128px,40vw)}.vc-panel{width:100%;max-height:122px;order:3}.vc-actions{width:100%;order:2;padding:8px}.vc-action-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.vc-act{min-height:56px;padding:6px;grid-template-columns:30px 1fr}.vc-act .g{width:30px;height:30px}.vc-act b{font-size:11px}.vc-act small{font-size:9px}.vc-actions-title span{display:none}.vc-dock{bottom:calc(5px + var(--sab));padding:9px}.vc-dock .btn{min-width:0;flex:1 1 110px}.vc-role-key{display:none}
}
@media(max-width:390px){.vc-card{width:116px}.vc-card-label small{font-size:8.5px}.vc-plaque{width:calc(100% - 104px)}.vc-plaque b{font-size:15px}.vc-supply{left:7px}.vc-reserve{right:2px}}
@media(prefers-reduced-motion:reduce){.vc-pulse{animation:none}.vc *{scroll-behavior:auto!important}}
`;

const roleLine = (r) => {
  const d = E.ROLES[r];
  return d ? `${d.power}${d.power && d.blocks ? ' ' : ''}${d.blocks}` : '';
};

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const opts = { oracle: api.opts.court === 'oracle' || api.opts.oracle === 'on', teams: api.opts.factions === 'on' || api.opts.teams === 'on' };
  const nameOf = (id) => api.player(id)?.name || 'Unknown';
  const root = h('main.vc', { 'aria-live': 'polite' });
  api.root.append(h('style', CSS), root);

  // ---------------------------------------------------------------- host: the only copy of the true deck and every private hand
  if (api.isHost) {
    let H = E.newGame(ids, opts, api.rng);
    if (api.restore?.phase === 'turn' && Array.isArray(api.restore.players) && api.restore.players.map((p) => p.id).join('|') === ids.join('|')) {
      try { H = { ...H, ...structuredClone(api.restore), rng: api.rng, cont: null, events: [], phase: 'turn', wait: { kind: 'turn', who: [api.restore.players[api.restore.cur].id] } }; } catch (err) { console.warn('[coup] ignored bad saved state', err); }
    }
    const history = [];
    const brains = Object.fromEntries(ids.map((id, i) => [id, new Brain(id, api.player(id)?.level || api.level, PERSONALITIES[i % PERSONALITIES.length], () => api.rng.next())]));
    let seq = 0, timer = 0, deadline = 0, ended = false;

    const cleanSnapshot = () => {
      const snap = {};
      for (const k of ['opts', 'deck', 'reserve', 'cur', 'first', 'phase', 'winner', 'winners', 'players', 'claims', 'round', 'winId']) snap[k] = H[k];
      snap.wait = { kind: 'turn', who: [E.curPlayer(H).id] };
      return structuredClone(snap);
    };
    const eventText = (e) => {
      const a = ACTION_COPY[e.act]?.[0]?.toLowerCase() || e.act;
      if (e.t === 'turn') return `${nameOf(e.who)} takes the floor${e.forced ? ' and must overthrow' : ''}.`;
      if (e.t === 'declare') return `${nameOf(e.who)} declares ${a}${e.target ? ` against ${nameOf(e.target)}` : ''}.`;
      if (e.t === 'block') return `${nameOf(e.who)} blocks as ${E.ROLES[e.role]?.name}.`;
      if (e.t === 'challenge') return `${nameOf(e.by)} challenges ${nameOf(e.who)}.`;
      if (e.t === 'reveal') return e.inverse ? `${nameOf(e.who)} ${e.proved ? 'proves the claim' : 'is caught'}.` : `${nameOf(e.who)} ${e.proved ? `proves ${E.ROLES[e.role]?.name}` : 'was bluffing'}.`;
      if (e.t === 'lose') return `${nameOf(e.who)} reveals ${E.ROLES[e.role]?.name}.`;
      if (e.t === 'out') return `${nameOf(e.who)} is out of the court.`;
      if (e.t === 'blockstands') return 'The block stands.';
      if (e.t === 'blockfails') return 'The block fails.';
      if (e.t === 'steal') return `${nameOf(e.who)} takes ${e.n} coin${e.n === 1 ? '' : 's'} from ${nameOf(e.target)}.`;
      if (e.t === 'coins' && e.d > 0) return `${nameOf(e.who)} gains ${e.d} coin${e.d === 1 ? '' : 's'}.`;
      if (e.t === 'strike') return `${nameOf(e.target)} must reveal influence.`;
      if (e.t === 'exchange') return `${nameOf(e.who)} consults the court deck.`;
      if (e.t === 'exchanged') return `${nameOf(e.who)} returns cards to the court.`;
      if (e.t === 'examine') return `${nameOf(e.who)} examines ${nameOf(e.target)}'s influence.`;
      if (e.t === 'examined') return `${nameOf(e.who)} ${e.swap ? 'orders a swap' : 'keeps the card in place'}.`;
      if (e.t === 'convert') return `${nameOf(e.target)} changes faction.`;
      if (e.t === 'win') return `${nameOf(e.who)} rules the court.`;
      return '';
    };
    const waitMs = () => H.phase === 'window' ? WINDOW_MS : H.phase === 'turn' ? TURN_MS : PICK_MS;
    const secretFor = (id) => {
      if (H.phase !== 'exd' || H.wait?.who[0] !== id || H.wait.idx == null) return null;
      const target = E.P(H, H.act?.target);
      return target?.cards[H.wait.idx]?.r || null;
    };
    const publish = (only, events = []) => {
      const pub = E.publicState(H);
      for (const id of only ? [only] : ids) {
        if (!api.player(id) || api.player(id).left) continue;
        api.sendTo(id, 'state', { ...pub, mine: E.privateState(H, id), events: events.map((e) => e.priv === id ? e : E.publicEvent(e)), history: history.slice(-16), seq, ms: Math.max(0, deadline - performance.now()), secret: secretFor(id) });
      }
    };
    const finish = () => {
      if (ended) return;
      ended = true;
      const winners = H.winners || (H.winner ? [H.winner] : []);
      const ranking = H.players.slice().sort((a, b) => (Number(winners.includes(b.id)) - Number(winners.includes(a.id))) || (E.liveCards(b).length - E.liveCards(a).length) || (b.coins - a.coins)).map((p) => ({ id: p.id, score: E.liveCards(p).length, note: `${p.coins} coin${p.coins === 1 ? '' : 's'} · ${E.liveCards(p).length} influence` }));
      api.endGame({ title: winners.length > 1 ? `${winners.map(nameOf).join(' & ')} rule the court!` : `${nameOf(winners[0])} rules the court!`, subtitle: opts.teams ? 'Their faction controls every surviving seat' : 'Last influence standing', ranking, winners });
    };
    const settle = () => {
      clearTimeout(timer);
      const events = H.events.splice(0);
      for (const e of events) {
        const t = eventText(E.publicEvent(e));
        if (t && history[history.length - 1] !== t) history.push(t);
        for (const b of Object.values(brains)) b.observe(E.publicEvent(e));
      }
      seq++;
      deadline = performance.now() + waitMs();
      publish(null, events);
      if (H.phase === 'turn') api.save(cleanSnapshot(), { turn: E.curPlayer(H).id, over: false, summary: history.at(-1) || 'Coup', moves: H.round || seq });
      if (H.phase === 'over') { api.save(cleanSnapshot(), { turn: null, over: true, summary: history.at(-1) || 'Court decided', moves: seq }); api.timeout(finish, 1900); return; }
      timer = setTimeout(() => { E.timeoutStep(H); settle(); }, waitMs() + 250);
    };
    const fail = (id, text) => api.sendTo(id, 'error', text || 'That move is no longer available.');
    const run = (id, fn) => {
      if (!E.P(H, id)?.alive) return fail(id, 'You no longer have influence.');
      let r;
      try { r = fn(); } catch (err) { console.error('[coup] action', err); return fail(id, 'The court could not resolve that move.'); }
      if (r && r.ok === false) return fail(id, r.err);
      settle();
    };
    api.on('declare', (m, from) => run(from, () => E.declare(H, from, { type: m?.type, target: m?.target })));
    api.on('respond', (m, from) => run(from, () => {
      const r = E.respond(H, from, m?.r, m?.role);
      if (r.ok && (r.done || m?.r === 'challenge')) E.closeWindow(H);
      return r;
    }));
    api.on('lose', (m, from) => run(from, () => E.chooseLose(H, from, Number(m?.idx))));
    api.on('exchange', (m, from) => run(from, () => E.chooseExchange(H, from, m?.keep)));
    api.on('examine', (m, from) => run(from, () => E.chooseExamine(H, from, Number(m?.idx))));
    api.on('verdict', (m, from) => run(from, () => E.chooseExamineVerdict(H, from, !!m?.swap)));

    botLoop(api, () => {
      if (ended || H.phase === 'over') return null;
      const pub = E.publicState(H), w = H.wait;
      if (!w) return null;
      const id = w.who.find((x) => api.isBot(x) && !(H.phase === 'window' && pub.win?.elig[x]?.done));
      if (!id) return null;
      const brain = brains[id], priv = E.privateState(H, id);
      if (H.phase === 'turn') return { delay: thinkTime(brain.level, brain.t, 'act'), run: () => api.botDo(id, 'declare', brain.chooseAction(pub, priv, E.legalActions(H, id))) };
      if (H.phase === 'window') return { delay: thinkTime(brain.level, brain.t, 'resp'), run: () => api.botDo(id, 'respond', brain.respond(pub, priv)) };
      if (H.phase === 'lose') return { delay: thinkTime(brain.level, brain.t, 'pick'), run: () => api.botDo(id, 'lose', { idx: brain.chooseLose(pub, priv) }) };
      if (H.phase === 'xch') return { delay: thinkTime(brain.level, brain.t, 'pick'), run: () => api.botDo(id, 'exchange', { keep: brain.chooseExchange(pub, priv) }) };
      if (H.phase === 'exm') return { delay: thinkTime(brain.level, brain.t, 'pick'), run: () => api.botDo(id, 'examine', { idx: brain.chooseExamine(pub, priv) }) };
      if (H.phase === 'exd') return { delay: thinkTime(brain.level, brain.t, 'quick'), run: () => api.botDo(id, 'verdict', { swap: brain.examineVerdict(pub, priv, secretFor(id)) }) };
      return null;
    }, 180);
    api.onRejoin((id) => publish(id));
    api.onLeave((id) => { if (!ended && E.P(H, id)?.alive) { E.forfeit(H, id); settle(); } });
    api.timeout(settle, 450);
  }

  // ---------------------------------------------------------------- client: public table + only this player's private view
  let st = null, deadline = 0, selectedAction = null, selectedPool = [], firstRender = true, celebrated = false;
  api.on('state', (next) => {
    const prev = st;
    st = next;
    deadline = performance.now() + (next.ms || 0);
    if (!prev || prev.phase !== next.phase || prev.turn !== next.turn) { selectedAction = null; selectedPool = []; }
    playEvents(next.events || [], prev);
    render();
  });
  api.on('error', (msg) => { api.toast(msg); api.sfx('bad'); selectedAction = null; selectedPool = []; render(); });
  api.onPlayersChanged(() => st && render());
  api.interval(() => {
    const bar = root.querySelector('.vc-time>i');
    if (!bar || !st) return;
    const max = st.phase === 'window' ? WINDOW_MS : st.phase === 'turn' ? TURN_MS : PICK_MS;
    bar.style.width = `${Math.max(0, Math.min(100, (deadline - performance.now()) / max * 100))}%`;
  }, 200);

  function playEvents(events, prev) {
    if (!prev && !events.length) return;
    for (const e of events) {
      if (e.t === 'declare') api.sfx(e.cost ? 'coin' : 'card', .78);
      else if (e.t === 'coins' || e.t === 'steal') api.sfx('coin', .85);
      else if (e.t === 'challenge') api.sfx('thud', .9);
      else if (e.t === 'block') api.sfx('wood', .8);
      else if (e.t === 'reveal' || e.t === 'lose') api.sfx('flip', .82);
      else if (e.t === 'exchange' || e.t === 'replace') api.sfx('shuffle', .72);
      else if (e.t === 'turn' && e.who === api.me) api.sfx('turn', .7);
      else if (e.t === 'win') api.sfx(e.winners?.includes(api.me) ? 'win' : 'lose');
    }
  }

  const player = (id) => st?.players.find((p) => p.id === id);
  const roleCard = (r, { dead = false, pick = false, selected = false, label = true, key = '', onClick = null } = {}) => {
    const d = E.ROLES[r];
    const el = h((onClick ? 'button' : 'div') + '.vc-card' + (dead ? '.dead' : '') + (pick ? '.pickable' : '') + (selected ? '.selected' : ''), { type: onClick ? 'button' : null, 'data-k': key || null, style: { '--rc': d.color }, 'aria-label': `${d.name}. ${roleLine(r)}`, onclick: onClick, html: roleArt(r) });
    if (label) el.append(h('span.vc-card-label', h('b', d.name), h('small', roleLine(r))));
    return el;
  };
  const hiddenMini = (key) => h('span.vc-mini-card', { 'data-k': key, html: cardBackArt() });
  const deadMini = (r, key) => h('span.vc-mini-card.dead', { 'data-k': key, title: E.ROLES[r]?.name, html: roleArt(r) });
  const money = (n) => h('span.vc-money', { title: `${n} coins` }, h('span', { html: coinSVG() }), n);
  const roleColor = (r) => E.ROLES[r]?.color || 'var(--blue)';

  function renderSeat(p) {
    const meta = api.player(p.id);
    const status = !p.alive ? 'Out' : st.turn === p.id ? 'On the floor' : p.left ? 'Left' : p.team != null && st.opts.teams ? `Faction ${p.team ? 'Sun' : 'Moon'}` : `${p.hidden} influence`;
    return h('section.vc-seat' + (st.turn === p.id && p.alive ? '.turn' : '') + (!p.alive ? '.out' : ''), { 'data-k': `seat:${p.id}`, 'aria-label': `${nameOf(p.id)}, ${status}, ${p.coins} coins` },
      avatarEl({ ...meta, online: meta?.online }, 'sm', { still: st.turn !== p.id }),
      h('div.vc-name', nameOf(p.id)), money(p.coins), h('div.vc-status', status),
      h('div.vc-influence', p.dead.map((r, i) => deadMini(r, `dead:${p.id}:${i}:${r}`)), Array.from({ length: p.hidden }, (_, i) => hiddenMini(`hidden:${p.id}:${i}`))));
  }

  function centerMessage() {
    const turn = nameOf(st.turn);
    if (st.phase === 'turn') return { icon: 'hand', color: 'var(--blue)', title: st.turn === api.me ? 'Your move' : `${turn}'s move`, detail: player(st.turn)?.coins >= 10 ? '10 coins: an overthrow is mandatory' : 'Choose one action. Any character may be claimed.' };
    if (st.phase === 'window' && st.act) {
      const a = ACTION_COPY[st.act.type];
      if (st.win?.kind === 'block') return { icon: 'block', color: roleColor(st.blk?.role), title: `${nameOf(st.blk?.by)} blocks`, detail: `Claiming ${E.ROLES[st.blk?.role]?.name}. The table may challenge.` };
      return { icon: a?.[2], color: st.act.claim ? roleColor(st.act.claim) : 'var(--blue)', title: `${nameOf(st.act.actor)} declares ${a?.[0] || st.act.type}`, detail: `${st.act.target ? `Target: ${nameOf(st.act.target)}. ` : ''}${st.act.claim ? `Claiming ${E.ROLES[st.act.claim]?.name}.` : 'Waiting for the table.'}` };
    }
    if (st.phase === 'lose') return { icon: 'challenge', color: 'var(--red)', title: `${nameOf(st.wait?.who[0])} must reveal`, detail: 'One influence will remain face up for the rest of the game.' };
    if (st.phase === 'xch') return { icon: 'exchange', color: 'var(--green)', title: `${nameOf(st.wait?.who[0])} visits the court`, detail: 'Choosing which influence to keep.' };
    if (st.phase === 'exm') return { icon: 'examine', color: 'var(--teal)', title: `${nameOf(st.wait?.who[0])} chooses a card`, detail: 'Only the Oracle claimant will see it.' };
    if (st.phase === 'exd') return { icon: 'examine', color: 'var(--teal)', title: `${nameOf(st.wait?.who[0])} decides`, detail: 'Keep that influence or force a secret swap.' };
    if (st.phase === 'over') return { icon: 'coup', color: 'var(--yellow)', title: `${nameOf(st.winner)} rules the court`, detail: 'Every rival has revealed their influence.' };
    return { icon: 'hand', color: 'var(--blue)', title: 'The court gathers', detail: 'Dealing hidden influence.' };
  }

  function table() {
    const opponents = st.players.filter((p) => p.id !== api.me);
    const m = centerMessage();
    const waiting = st.wait?.who?.filter((id) => st.phase !== 'window' || !st.win?.elig[id]?.done).map(nameOf).join(', ');
    return h('section.vc-table',
      h('div.vc-opponents', opponents.map(renderSeat)),
      h('div.vc-center',
        h('div.vc-supply', h('div.vc-deck', h('div', { html: cardBackArt() }), h('span.vc-count', st.deck)), h('span', 'Court deck')),
        h('article.vc-plaque', { 'data-k': `plaque:${st.phase}:${st.win?.id || st.turn}`, style: { '--pc': m.color } }, h('div.vc-plaque-inner', h('span.vc-plaque-icon', { html: glyph(m.icon, 28) }), h('b', m.title), h('p', m.detail), waiting && st.phase !== 'turn' ? h('div.vc-waiting', h('i.vc-pulse'), `Waiting: ${waiting}`) : null)),
        h('div.vc-reserve', h('div.coins', [0, 1, 2, 3].map(() => h('span', { html: coinSVG() }))), h('span', st.opts.teams ? `${st.reserve} reserve` : 'Treasury'))),
      h('div.vc-time', h('i')));
  }

  function myHand() {
    const mine = st.mine?.cards || [];
    const choosingLoss = st.phase === 'lose' && st.wait?.who?.[0] === api.me;
    const choosingExamine = st.phase === 'exm' && st.wait?.who?.[0] === api.me;
    const me = player(api.me) || { coins: 0, hidden: 0 };
    return h('section.vc-you', h('div.vc-you-head', avatarEl(api.player(api.me), 'sm'), h('b', `${nameOf(api.me)} · your influence`), h('span.spacer'), money(me.coins)),
      h('div.vc-hand', mine.map((c, i) => roleCard(c.r, { dead: c.dead, pick: !c.dead && (choosingLoss || choosingExamine), key: `mine:${i}:${c.r}:${c.dead}`, onClick: !c.dead && choosingLoss ? () => api.toHost('lose', { idx: i }) : !c.dead && choosingExamine ? () => api.toHost('examine', { idx: i }) : null }))));
  }

  function actionPanel() {
    const mineTurn = st.phase === 'turn' && st.turn === api.me;
    const me = player(api.me) || { coins: 0 };
    const targets = st.players.filter((p) => p.alive && p.id !== api.me && (!st.opts.teams || p.team !== me.team)).map((p) => p.id);
    const publicLegal = (type) => {
      if (!mineTurn) return { ok: false, why: '' };
      if (me.coins >= 10 && type !== 'coup') return { ok: false, why: 'Overthrow required' };
      if (type === 'coup') return { ok: me.coins >= 7 && targets.length, why: 'Needs 7 coins', targets };
      if (type === 'assassinate') return { ok: me.coins >= 3 && targets.length, why: 'Needs 3 coins', targets };
      if (type === 'steal') { const rich = targets.filter((id) => player(id).coins > 0); return { ok: rich.length > 0, why: 'No coins to take', targets: rich }; }
      if (type === 'examine') return { ok: targets.length > 0, why: 'No target', targets };
      if (type === 'convert') { const all = st.players.filter((p) => p.alive && (p.id === api.me ? me.coins >= 1 : me.coins >= 2)).map((p) => p.id); return { ok: all.length > 0, why: 'Needs coins', targets: all }; }
      if (type === 'embezzle') return { ok: st.reserve > 0, why: 'Reserve empty' };
      return { ok: true, targets: null };
    };
    const types = ['income', 'aid', 'tax', 'steal', st.opts.oracle ? 'swap' : 'exchange', ...(st.opts.oracle ? ['examine'] : []), 'assassinate', 'coup', ...(st.opts.teams ? ['convert', 'embezzle'] : [])];
    const choose = (type, L) => {
      if (!L.ok) return api.toast(L.why);
      if (L.targets?.length) { selectedAction = selectedAction === type ? null : type; return render(); }
      api.toHost('declare', { type });
    };
    return h('section.vc-actions', h('div.vc-actions-title', h('b', mineTurn ? 'Choose your move' : `${nameOf(st.turn)} is choosing`), h('span', 'Claim a role whether or not you hold it'), h('span.spacer'), h('div.vc-role-key', E.rolesInPlay(st.opts).map((r) => h('span.vc-role-chip', { style: { '--rc': roleColor(r) }, title: roleLine(r) }, h('i', E.ROLES[r].short), E.ROLES[r].name)))),
      h('div.vc-action-grid', types.map((type) => {
        const L = publicLegal(type), d = ACTION_COPY[type], claim = E.ACTIONS[type]?.claim;
        return h('button.vc-act', { disabled: !L.ok, title: !L.ok ? L.why : d[1], style: { '--ac': claim ? roleColor(claim === 'envoy' && st.opts.oracle ? 'oracle' : claim) : type === 'coup' ? 'var(--red)' : 'var(--blue)' }, onclick: () => choose(type, L) }, h('span.g', { html: glyph(d[2]) }), h('span', h('b', d[0]), h('small', !L.ok && L.why ? L.why : d[1])));
      })), selectedAction ? targetPicker(selectedAction, publicLegal(selectedAction).targets || []) : null);
  }

  function targetPicker(type, targets) {
    return h('div.vc-targets', targets.map((id) => h('button.vc-target', { onclick: () => { api.toHost('declare', { type, target: id }); selectedAction = null; } }, avatarEl(api.player(id), 'sm', { still: true }), type === 'convert' && id === api.me ? 'Yourself' : nameOf(id))), h('button.btn.ghost.small', { onclick: () => { selectedAction = null; render(); } }, 'Cancel'));
  }

  function responseDock() {
    if (st.phase !== 'window') return null;
    const e = st.win?.elig?.[api.me];
    if (!e || e.done) return h('aside.vc-dock', h('h3', 'Response locked'), h('p', 'Waiting for the rest of the table.'));
    const claimant = st.win.kind === 'block' ? st.blk?.by : st.act?.actor;
    const claimRole = st.win.kind === 'block' ? st.blk?.role : st.act?.claim;
    const buttons = [];
    if (e.ch) buttons.push(h('button.btn.bad', { onclick: () => api.toHost('respond', { r: 'challenge' }) }, h('span', { html: glyph('challenge') }), 'Challenge'));
    for (const r of e.bl || []) buttons.push(h('button.btn.tonal', { onclick: () => api.toHost('respond', { r: 'block', role: r }) }, h('span', { html: glyph('block') }), `Block as ${E.ROLES[r].name}`));
    buttons.push(h('button.btn.primary', { onclick: () => api.toHost('respond', { r: 'allow' }) }, h('span', { html: glyph('ok') }), 'Allow'));
    return h('aside.vc-dock', h('h3', st.win.kind === 'block' ? 'Accept this block?' : 'Respond now'), h('p', claimRole ? `${nameOf(claimant)} claims ${E.ROLES[claimRole]?.name}. Challenge only if you think it is a bluff.` : `Allow ${nameOf(st.act.actor)}'s ${ACTION_COPY[st.act.type]?.[0].toLowerCase()}, or block it.`), h('div.vc-dock-buttons', buttons));
  }

  function exchangeDock() {
    if (st.phase !== 'xch' || st.wait?.who?.[0] !== api.me || !st.mine?.pool) return null;
    const toggle = (i) => { selectedPool = selectedPool.includes(i) ? selectedPool.filter((x) => x !== i) : selectedPool.length < st.mine.keep ? [...selectedPool, i] : selectedPool; render(); };
    return h('aside.vc-dock', h('h3', `Keep ${st.mine.keep} influence`), h('p', 'Choose from your current cards and the court draw. Unchosen cards return unseen.'), h('div.vc-hand', st.mine.pool.map((r, i) => roleCard(r, { pick: true, selected: selectedPool.includes(i), key: `pool:${i}:${r}`, onClick: () => toggle(i) }))), h('button.btn.primary.block', { disabled: selectedPool.length !== st.mine.keep, onclick: () => api.toHost('exchange', { keep: selectedPool.slice() }) }, 'Confirm choice'));
  }

  function choiceDock() {
    if (st.phase === 'lose' && st.wait?.who?.[0] === api.me) return h('aside.vc-dock', h('h3', 'Reveal one influence'), h('p', 'Tap one of your cards above. This choice cannot be undone.'));
    if (st.phase === 'exm' && st.wait?.who?.[0] === api.me) return h('aside.vc-dock', h('h3', 'Choose influence to show'), h('p', `Tap one card above. Only ${nameOf(st.act?.actor)} will see it.`));
    if (st.phase === 'exd' && st.wait?.who?.[0] === api.me) return h('aside.vc-dock', h('h3', st.secret ? `You saw ${E.ROLES[st.secret]?.name}` : 'Influence examined'), h('p', 'Leave it in place or force a secret exchange with the court deck.'), h('div.vc-dock-buttons', h('button.btn.tonal', { onclick: () => api.toHost('verdict', { swap: false }) }, 'Leave it'), h('button.btn.primary', { onclick: () => api.toHost('verdict', { swap: true }) }, 'Force swap')));
    return null;
  }

  function render() {
    if (!st) { root.replaceChildren(h('div.vc-toastline', 'The court is shuffling…')); return; }
    const log = h('aside.vc-panel', h('h3', 'Court record'), h('div.vc-log', (st.history?.length ? st.history : ['The court is ready.']).slice(-10).map((x) => h('p', x))));
    flipDeep(root, () => root.replaceChildren(table(), h('div.vc-lower', myHand(), log, actionPanel()), responseDock(), exchangeDock(), choiceDock()), { sel: '[data-k]', ms: 430, enter: !firstRender });
    if (firstRender) {
      [...root.querySelectorAll('.vc-card')].forEach((el, i) => dealIn(el, { x: 0, y: -60 }, { delay: i * 90, ms: 520 }));
      firstRender = false;
    }
    const plaque = root.querySelector('.vc-plaque');
    if ((st.events || []).some((e) => e.t === 'challenge') && plaque) shake(plaque, { deg: 2.5, ms: 420 });
    if ((st.events || []).some((e) => e.t === 'coins' || e.t === 'steal')) { const m = root.querySelector('.vc-you .vc-money'); if (m) bump(m); }
    if (st.phase === 'over' && st.winners?.includes(api.me) && !celebrated) { celebrated = true; celebrate(root, { n: 70 }); }
  }

  render();
}
