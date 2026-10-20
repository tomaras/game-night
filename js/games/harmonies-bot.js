// Harmonies — the computer players (pure). A bot looks at each of the central spaces, searches (beam search) where its
// three tokens would do the most good, settles any animals that become possible, then picks the card that fits best.
// Evaluation = real landscape score + credit for things that are one token from scoring + progress on its animal habitats.
import { cardOf, ANIMALS } from './harmonies-cards.js';
import { GREY, BROWN, GREEN, RED, BLUE, YELLOW, CELLS, canPlace, legalCells, cloneCells, kindOf, scoreBoard, scorePlayer, findHabitats, bestFit, cardPts, spiritScore, emptyCount, HAND_MAX } from './harmonies-rules.js';

const ORDER = [GREY, BROWN, GREEN, RED, BLUE, YELLOW];

/** How good is this board + hand? (higher = better). `lvl` shapes how much foresight it has. */
export function evaluate(cells, hand, side, lvl = 'normal') {
  const sc = scoreBoard(cells, side);
  let v = sc.total;
  if (lvl === 'easy') return v;
  const kinds = cells.map((c) => kindOf(c.s));
  for (const c of CELLS) {
    const k = kinds[c.i];
    const hasRoom = c.nb.some((j) => !cells[j].s.length);
    switch (k.t) {
      case 'empty': v += 0.55; break;
      case 'trunk': v += k.h === 2 ? 3.4 : 1.5; break;
      case 'mountain': {
        if (!c.nb.some((j) => kinds[j].t === 'mountain')) v += (k.h === 3 ? 2.4 : k.h === 2 ? 1.3 : 0.5) * (hasRoom || c.nb.some((j) => kinds[j].t === 'empty') ? 1 : 0.3);
        break;
      }
      case 'field': if (!c.nb.some((j) => kinds[j].t === 'field')) v += hasRoom ? 1.9 : 0.2; break;
      case 'roof': v += hasRoom ? 0.9 : 0.1; break;
      case 'building': {
        const cols = new Set(c.nb.map((j) => (cells[j].s.length ? cells[j].s[cells[j].s.length - 1] : -1)).filter((x) => x >= 0)).size;
        if (cols < 3) v += cols === 2 ? 2.8 : cols === 1 ? 1.4 : 0.5;
        break;
      }
      case 'water': break;
      default: break;
    }
  }
  if (side === 'A') { // water that is not part of the best river is still half useful
    let w = 0; for (const k of kinds) if (k.t === 'water') w++;
    v += Math.max(0, w - sc.river) * 0.35;
  }
  // progress on the animals it holds
  for (const e of hand) {
    const card = cardOf(e.id);
    if (e.p >= card.k) continue;
    const gain = card.spirit ? 9 : cardPts(card, e.p + 1) - cardPts(card, e.p);
    const f = bestFit(cells, card);
    const ratio = f.need ? f.have / f.need : 0;
    v += gain * (f.ok ? 0.1 + 0.8 * ratio * ratio : 0.04) * 0.75;
  }
  return v;
}

/** Spend every cube that is worth spending right now (greedy by what the board looks like afterwards). Mutates cells/hand copies. */
function settle(cells, hand, side, lvl, acts) {
  for (let guard = 0; guard < 8; guard++) {
    let best = null, base = null;
    for (const e of hand) {
      const card = cardOf(e.id);
      if (e.p >= card.k) continue;
      const spots = findHabitats(cells, card);
      if (!spots.length) continue;
      if (base === null) base = evaluate(cells, hand, side, lvl);
      for (const t of new Set(spots.map((m) => m.target))) {
        cells[t].c = 1; e.p++;
        const gain = card.spirit ? spiritScore(card, cells, side) * 0.9 : 0;
        const val = evaluate(cells, hand, side, lvl) + gain;
        cells[t].c = 0; e.p--;
        if (!best || val > best.val) best = { val, card: e.id, c: t };
      }
    }
    if (!best) break;
    const e = hand.find((x) => x.id === best.card);
    cells[best.c].c = 1; e.p++;
    acts.push({ t: 'cube', card: e.id, c: best.c });
    if (e.p >= cardOf(e.id).k) hand.splice(hand.indexOf(e), 1);
  }
}
const cloneHand = (h) => h.map((e) => ({ id: e.id, p: e.p }));

function planTokens(cells, tokens, hand, side, lvl, W, noise, rnd) {
  const toks = tokens.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  let beam = [{ cells, acts: [], v: 0 }];
  for (const k of toks) {
    const next = [];
    for (const st of beam) {
      const opts = legalCells(st.cells, k);
      if (!opts.length) { next.push({ cells: st.cells, acts: [...st.acts, { t: 'drop', k }], v: st.v - 2 }); continue; }
      for (const c of opts) {
        const cs = cloneCells(st.cells); cs[c].s.push(k);
        next.push({ cells: cs, acts: [...st.acts, { t: 'tok', k, c }], v: evaluate(cs, hand, side, lvl) + (noise ? (rnd() - 0.5) * noise : 0) });
      }
    }
    next.sort((a, b) => b.v - a.v);
    beam = next.slice(0, W);
  }
  return beam;
}

/**
 * Decide a whole turn for `id`. Returns the acts list for applyTurn.
 * levels: easy = sloppy and short-sighted, normal = competent, hard = wide search and animal planning.
 */
export function botTurn(G, id, level = 'normal', rnd = Math.random) {
  const pl = G.P[id];
  const W = level === 'hard' ? 9 : level === 'normal' ? 5 : 1;
  const noise = level === 'easy' ? 6 : level === 'normal' ? 0.9 : 0;
  const acts = [];
  const opp = G.ids.filter((x) => x !== id);
  const oppBest = opp.length ? Math.max(...opp.map((x) => scorePlayer(G.P[x], G.side).total)) : 0;

  // 1) maybe take a card first (hard bots plan their tokens around it)
  const rowOpts = (G.row || []).filter(() => pl.hand.length < HAND_MAX);
  const cardScore = (cells, hand, cid) => {
    const card = cardOf(cid);
    const f = bestFit(cells, card);
    const ratio = f.need ? f.have / f.need : 0;
    const top = card.spirit ? 10 : card.vals[card.vals.length - 1];
    return top * (f.ok ? 0.1 + 0.9 * ratio * ratio : 0.03) - (hand.length >= 3 ? 1.5 : 0) + (card.spirit ? 0 : card.k * 0.2);
  };
  let preCard = null;
  if (level === 'hard' && rowOpts.length) {
    const sc = rowOpts.map((cid) => ({ cid, s: cardScore(pl.cells, pl.hand, cid) })).sort((a, b) => b.s - a.s)[0];
    if (sc.s > (pl.hand.length ? 2.2 : 0.5)) preCard = sc.cid;
  }

  const tryVariant = (cardFirst) => {
    const baseHand = cloneHand(pl.hand);
    if (cardFirst !== null) baseHand.push({ id: cardFirst, p: 0 });
    let best = null;
    G.central.forEach((tk, s) => {
      if (!tk || !tk.length) return;
      const beam = planTokens(pl.cells, tk, baseHand, G.side, level, W, noise, rnd);
      for (const st of beam.slice(0, level === 'hard' ? 3 : 2)) {
        const cells = cloneCells(st.cells), hand = cloneHand(baseHand), more = [];
        if (!(level === 'easy' && rnd() < 0.25)) settle(cells, hand, G.side, level, more);
        let v = evaluate(cells, hand, G.side, level);
        // ending the game: good when ahead, bad when behind (solo: never rush it)
        if (emptyCount(cells) <= 2) {
          const mine = scoreBoard(cells, G.side).total + scorePlayer({ cells, hand, done: [] }, G.side).animals;
          v += G.solo ? -6 : (mine > oppBest + 4 ? 4 : -8);
        }
        v += (level === 'easy' ? (rnd() - 0.5) * 8 : 0);
        if (!best || v > best.v) best = { v, s, acts: [{ t: 'take', s }, ...st.acts, ...more], cells, hand };
      }
    });
    return best;
  };
  let plan = tryVariant(preCard);
  if (preCard !== null) { const alt = tryVariant(null); if (alt && (!plan || alt.v > plan.v + 3)) { plan = alt; preCard = null; } }
  if (!plan) return [];
  // acts so far, with the card (taken first so its cube can go down this turn)
  if (preCard !== null) acts.push({ t: 'card', id: preCard });
  acts.push(...plan.acts);
  // 2) a card after the tokens (normal & easy; hard if it didn't already)
  const handNow = plan.hand;
  if (preCard === null && (G.row || []).length && handNow.length < HAND_MAX) {
    let pick = null;
    if (level === 'easy') { if (rnd() < 0.4) pick = G.row[Math.floor(rnd() * G.row.length)]; }
    else {
      const sc = G.row.map((cid) => ({ cid, s: cardScore(plan.cells, handNow, cid) + (level === 'normal' ? (rnd() - 0.5) * 1.2 : 0) })).sort((a, b) => b.s - a.s)[0];
      if (sc && sc.s > (handNow.length >= 3 ? 2.6 : handNow.length >= 2 ? 1.4 : 0.4)) pick = sc.cid;
    }
    if (pick !== null && pick !== undefined) {
      // taking it may allow an immediate cube; replay settle with it
      const cells = cloneCells(plan.cells), hand = cloneHand(handNow); hand.push({ id: pick, p: 0 });
      const more = [];
      settle(cells, hand, G.side, level, more);
      acts.push({ t: 'card', id: pick }, ...more);
    }
  }
  if (G.solo && !acts.some((a) => a.t === 'card') && G.row.length && G.deck.length) {
    // solo: no card taken, so refresh the row by discarding the least promising card
    const worst = G.row.map((cid) => ({ cid, s: cardScore(plan.cells, handNow, cid) })).sort((a, b) => a.s - b.s)[0];
    if (worst && worst.s < 1.2) acts.push({ t: 'swap', id: worst.cid });
  }
  return acts;
}

/** Which of its two offered spirits suits an empty board? (the one with the more forgiving rule) */
export function botSpirit(G, id) {
  const p = G.P[id];
  const order = ['seasons', 'grove', 'hearth', 'waters', 'meadow', 'oldwood', 'harvest', 'peaks', 'steppes', 'stillness'];
  return p.offer.slice().sort((a, b) => order.indexOf(cardOf(a).key) - order.indexOf(cardOf(b).key))[0];
}
void ANIMALS; void canPlace;
