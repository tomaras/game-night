// Shared building blocks for the party games: countdown clocks, scoreboards, prompt cards, small helpers.
import { h } from './util.js';
import { avatarEl } from './avatar.js';
import { icon } from './ui.js';
import { EASE, countTo, bump } from './motion.js';

/** A countdown that every client can sync from a "ms remaining" number sent by the host. */
export function makeClock(api) {
  let deadline = 0, total = 1;
  const clock = {
    set(ms) { total = Math.max(1, ms || 1); deadline = performance.now() + (ms || 0); },
    left() { return Math.max(0, deadline - performance.now()); },
    frac() { return Math.max(0, Math.min(1, (deadline - performance.now()) / total)); },
    /** Timer bar element that keeps itself updated. */
    el() {
      const bar = h('i');
      const sec = h('span.sec');
      const el = h('div.kt-timer', h('div.bar', bar), sec);
      const upd = () => {
        const l = clock.left();
        bar.style.width = clock.frac() * 100 + '%';
        const s = String(Math.ceil(l / 1000));
        const low = l < 6000 && l > 0;
        if (sec.textContent !== s && low) bump(sec, { to: 1.35, ms: 300 });
        sec.textContent = s;
        el.classList.toggle('low', low);
      };
      upd();
      api.interval(() => { if (el.isConnected) upd(); }, 250);
      return el;
    },
  };
  return clock;
}

const pillMemo = new WeakMap(); // api -> { rects: Map(id -> DOMRect), scores: Map(id -> number) }
/** Row of player pills with scores (sorted high→low). opts.done: Set of ids who already acted.
 *  When the same scoreboard is drawn again, pills glide to their new places and changed scores count up. */
export function scorePills(api, scores, { done, sort = true, extra } = {}) {
  let list = api.players.slice();
  if (sort) list.sort((a, b) => (scores?.[b.id] || 0) - (scores?.[a.id] || 0));
  const el = h('div.kt-score', list.map((p) => h('div.kt-pill' + (done?.has(p.id) ? '.done' : '') + (p.left ? '.dim' : ''), { 'data-k': p.id }, avatarEl({ ...p, online: p.online && !p.left }, 'sm', { still: true }), p.name + (p.id === api.me ? ' (you)' : ''), scores ? h('b', scores[p.id] || 0) : null, extra ? extra(p) : null)));
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    const memo = pillMemo.get(api), rects = new Map(), now = new Map();
    for (const pill of el.children) {
      const id = pill.dataset.k, r = pill.getBoundingClientRect(), sc = pill.querySelector('b');
      rects.set(id, r); if (sc) now.set(id, +sc.textContent || 0);
      const was = memo?.rects.get(id);
      if (was) { const dx = was.left - r.left, dy = was.top - r.top; if (Math.abs(dx) > 2 || Math.abs(dy) > 2) pill.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 520, easing: EASE.out }); }
      const before = memo?.scores.get(id);
      if (sc && before !== undefined && now.get(id) !== before) { countTo(sc, now.get(id), { from: before, ms: 650 }); bump(pill, { to: 1.12, ms: 420 }); }
    }
    pillMemo.set(api, { rects, scores: now });
  });
  return el;
}

/** "Waiting for A, B…" line. */
export function waiting(api, ids, text = 'Waiting for') {
  const names = ids.map((i) => api.player(i)?.name).filter(Boolean);
  return h('div.kt-hint', names.length ? `${text} ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` +${names.length - 4}` : ''}…` : '');
}

export function promptCard(text, { label, color } = {}) {
  return h('div.kt-prompt', { style: color ? { '--pc': color } : '' }, label ? h('small', label) : null, text);
}

/** Text answer box with a send button. Returns {el, input}. */
export function answerBox({ placeholder = 'Type your answer…', max = 80, button = 'Send', multiline = false, onSubmit, value = '' }) {
  const input = h(multiline ? 'textarea.txt' : 'input.txt', { placeholder, maxlength: max, rows: multiline ? 3 : undefined, autocomplete: 'off', value, enterkeyhint: 'send' });
  const send = () => { const t = input.value.trim(); if (t) onSubmit(t); };
  const btn = h('button.btn.primary', { onclick: send }, icon('send'), button);
  if (!multiline) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  return { el: h('div.kt-field', input, btn), input, btn };
}

export const shuffled = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor((rng ? rng.next() : Math.random()) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const sample = (arr, n, rng) => shuffled(arr, rng).slice(0, n);
export const sum = (a) => a.reduce((x, y) => x + y, 0);

/** Standard final-ranking builder from a scores map. */
export function rankingFrom(api, scores, note = 'pts') {
  return api.players.slice().sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0)).map((p) => ({ id: p.id, score: scores[p.id] || 0, note }));
}

/** Host helper: enter a named phase with an optional timer; broadcasts {name, ms, ...data}. */
export function hostPhase(api, H, name, ms, onEnd, data = {}) {
  clearTimeout(H.timer);
  H.phase = name;
  H.deadline = performance.now() + (ms || 0);
  api.broadcast('phase', { name, ms: ms || 0, ...data });
  if (ms && onEnd) H.timer = setTimeout(onEnd, ms + 300);
}
export const msLeftOf = (H) => Math.max(0, (H.deadline || 0) - performance.now());
