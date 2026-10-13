// Small motion toolkit shared by the games: everything uses the Web Animations API, so it is cheap, interruptible and
// honours "reduce motion". Nothing here touches layout, only transform / opacity / filter.
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const dur = (ms) => (reduced() ? 1 : ms);

export const EASE = {
  out: 'cubic-bezier(.22,1,.36,1)', // fast start, long soft landing
  spring: 'cubic-bezier(.34,1.56,.64,1)', // overshoots a little and settles
  inout: 'cubic-bezier(.65,0,.35,1)',
};

/** Move an absolutely-placed element between two spots (in its own units, as translate), lifting it off the board on the way. */
export function glide(el, from, to, { ms = 320, delay = 0, lift = 1.16, unit = '%', easing = EASE.out } = {}) {
  const pos = (p) => `${p.x}${unit} ${p.y}${unit}`;
  el.style.translate = pos(to);
  const d = dur(ms);
  const a = el.animate([{ translate: pos(from) }, { translate: pos(to) }], { duration: d, delay, easing });
  if (lift) {
    el.classList.add('flying');
    el.animate([{ scale: 1 }, { scale: lift, offset: 0.35 }, { scale: 0.96, offset: 0.9 }, { scale: 1 }], { duration: d, delay, easing: 'ease-in-out' });
    a.finished.catch(() => {}).then(() => el.classList.remove('flying'));
  }
  return a;
}

export function popIn(el, { ms = 260, delay = 0, from = 0.45 } = {}) {
  return el.animate([{ opacity: 0, scale: from }, { opacity: 1, scale: 1 }], { duration: dur(ms), delay, easing: EASE.spring, fill: 'backwards' });
}
/** Shrink away and remove. */
export function popOut(el, { ms = 220, delay = 0, to = 0.5 } = {}) {
  const a = el.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: to }], { duration: dur(ms), delay, easing: 'ease-in', fill: 'forwards' });
  a.finished.catch(() => {}).then(() => el.remove());
  return a;
}
export function shake(el, { ms = 420, deg = 8, delay = 0 } = {}) {
  return el.animate([{ rotate: '0deg' }, { rotate: `${-deg}deg` }, { rotate: `${deg}deg` }, { rotate: `${-deg * 0.6}deg` }, { rotate: `${deg * 0.3}deg` }, { rotate: '0deg' }], { duration: dur(ms), delay, easing: 'ease-in-out' });
}
export function bump(el, { ms = 280, to = 1.12 } = {}) {
  return el.animate([{ scale: 1 }, { scale: to, offset: 0.4 }, { scale: 1 }], { duration: dur(ms), easing: EASE.out });
}
export function jolt(el, { ms = 360, px = 6 } = {}) {
  return el.animate([{ translate: '0 0' }, { translate: `${-px}px 0` }, { translate: `${px}px 0` }, { translate: `${-px / 2}px 0` }, { translate: '0 0' }], { duration: dur(ms), easing: 'ease-out' });
}

/** A burst of small particles from a point inside `host` (host must be position:relative/absolute). */
export function burst(host, x, y, { n = 14, colors = ['#fbbc04', '#ea4335', '#34a853', '#4285f4'], size = 7, spread = 70, ms = 700 } = {}) {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const a = Math.random() * Math.PI * 2, r = spread * (0.45 + Math.random() * 0.75), s = size * (0.6 + Math.random() * 0.8);
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px;border-radius:${Math.random() < 0.5 ? '50%' : '2px'};background:${colors[i % colors.length]};pointer-events:none;z-index:50`;
    host.append(p);
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px,${dy + 18}px) scale(.3) rotate(${Math.random() * 360}deg)`, opacity: 0 }], { duration: ms * (0.7 + Math.random() * 0.6), easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }).finished.catch(() => {}).then(() => p.remove());
  }
}

/** Count a number up (or down) to a target. */
export function countTo(el, to, { ms = 600, from = Number(el.textContent) || 0, fmt = (v) => String(Math.round(v)) } = {}) {
  if (reduced() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/** Run a screen change inside a View Transition (a soft cross-fade of the main area) where the browser supports it. */
export function swap(fn) {
  if (reduced() || !document.startViewTransition) return fn();
  try { return document.startViewTransition(() => fn()).updateCallbackDone; } catch { return fn(); }
}

/** FLIP: remember where the keyed children are, change the DOM, then slide every child that moved from its old spot. New ones pop in. */
export function flip(container, mutate, { ms = 420, key = (el) => el.dataset.k, stagger = 18 } = {}) {
  const before = new Map();
  for (const el of container.children) { const k = key(el); if (k) before.set(k, el.getBoundingClientRect()); }
  mutate();
  let n = 0;
  for (const el of container.children) {
    const k = key(el); if (!k) continue;
    const was = before.get(k);
    if (!was) { popIn(el, { ms: 340, delay: Math.min(n++, 14) * stagger, from: 0.85 }); continue; }
    const now = el.getBoundingClientRect();
    const dx = was.left - now.left, dy = was.top - now.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: dur(ms), easing: EASE.out });
  }
}

/** Confetti: two cannons from the bottom corners plus a shower from above, with gravity, drag and tumbling paper. */
export function celebrate(host, { n = 110, colors = ['#ea4335', '#fbbc04', '#34a853', '#4285f4', '#e5399b', '#f57c00', '#ffffff'] } = {}) {
  if (reduced()) return;
  const r = host.getBoundingClientRect(), w = r.width || innerWidth, hgt = r.height || innerHeight;
  const g = 1500;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const cannon = i < n * 0.6, left = i % 2 === 0;
    const x0 = cannon ? (left ? 0 : w) : Math.random() * w, y0 = cannon ? hgt * 0.95 : -20;
    const ang = cannon ? (left ? -1 : -Math.PI + 1) * (0.55 + Math.random() * 0.5) + (left ? 0 : 0) : Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    const sp = cannon ? 650 + Math.random() * 700 : 80 + Math.random() * 160;
    let vx = Math.cos(ang) * sp * (cannon && !left ? 1 : 1), vy = Math.sin(ang) * sp;
    if (cannon) { vx = (left ? 1 : -1) * Math.abs(Math.cos(ang)) * sp; vy = -Math.abs(Math.sin(ang)) * sp * 1.1; }
    const s = 6 + Math.random() * 7, ribbon = Math.random() < 0.4;
    p.style.cssText = `position:absolute;left:0;top:0;width:${ribbon ? s * 0.45 : s}px;height:${ribbon ? s * 1.9 : s * 0.62}px;background:${colors[i % colors.length]};border-radius:${Math.random() < 0.3 ? '50%' : '1.5px'};pointer-events:none;z-index:1;will-change:transform`;
    host.append(p);
    const T = 2.4 + Math.random() * 1.6, steps = 28, frames = [];
    const rot0 = Math.random() * 360, spin = (Math.random() - 0.5) * 900, flipS = 1 + Math.random() * 4;
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * T, drag = Math.exp(-1.1 * t);
      const x = x0 + (vx / 1.1) * (1 - drag) + Math.sin(t * flipS * 2) * (cannon ? 6 : 16);
      const y = y0 + vy * (1 - drag) / 1.1 + 0.5 * g * t * t * 0.32 + 80 * t * (1 - drag) * 0;
      frames.push({ transform: `translate(${x}px,${y}px) rotate(${rot0 + spin * t}deg) rotateX(${t * flipS * 220}deg)`, opacity: k > steps - 5 ? (steps - k) / 5 : 1 });
    }
    p.animate(frames, { duration: T * 1000, delay: Math.random() * 350, easing: 'linear', fill: 'both' }).finished.catch(() => {}).then(() => p.remove());
  }
}

/** Fly an element (a chip, a card) between two points inside `host`, optionally along an arc, then remove it. */
export function fly(host, node, from, to, { ms = 600, delay = 0, scale = [1, 1], arc = 0, easing = EASE.out, opacity = [1, 1], keep = false, rotate = [0, 0] } = {}) {
  node.style.cssText += ';position:absolute;left:0;top:0;pointer-events:none;z-index:40;will-change:transform';
  host.append(node);
  const at = (p, s, o, r) => ({ transform: `translate(${p.x}px,${p.y}px) translate(-50%,-50%) scale(${s}) rotate(${r}deg)`, opacity: o });
  const frames = [at(from, scale[0], opacity[0], rotate[0])];
  if (arc) frames.push({ ...at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - arc }, (scale[0] + scale[1]) / 2 + 0.08, 1, (rotate[0] + rotate[1]) / 2), offset: 0.5 });
  frames.push(at(to, scale[1], opacity[1], rotate[1]));
  const a = node.animate(frames, { duration: dur(ms), delay, easing, fill: 'both' });
  if (!keep) a.finished.catch(() => {}).then(() => node.remove());
  return a;
}

/** A card being dealt: slides in from `from` (px offset), turning over as it lands. */
export function dealIn(el, from = { x: 0, y: -80 }, { delay = 0, ms = 520, flipOver = true } = {}) {
  const frames = [
    { translate: `${from.x}px ${from.y}px`, scale: 0.55, opacity: 0, transform: `perspective(500px) rotateY(${flipOver ? 100 : 0}deg) rotate(-12deg)` },
    { translate: '0 0', scale: 1, opacity: 1, transform: 'perspective(500px) rotateY(0deg) rotate(0deg)' },
  ];
  return el.animate(frames, { duration: dur(ms), delay, easing: EASE.out, fill: 'backwards' });
}

/** Make an element appear to travel from where it used to be (a DOMRect, or any {left, top, width, height}) to where it is now. */
export function from(el, rect, { ms = 520, delay = 0, rotate = 0, scale = 1, easing = EASE.out, opacity = 1 } = {}) {
  const r = el.getBoundingClientRect();
  const dx = rect.left + rect.width / 2 - (r.left + r.width / 2), dy = rect.top + rect.height / 2 - (r.top + r.height / 2);
  return el.animate([{ translate: `${dx}px ${dy}px`, rotate: `${rotate}deg`, scale, opacity }, { translate: '0 0', rotate: '0deg', scale: 1, opacity: 1 }], { duration: dur(ms), delay, easing, fill: 'backwards' });
}

/** FLIP for elements anywhere inside `root` that carry a unique data-k: whatever moved slides from its old place, new ones pop in. */
export function flipDeep(root, mutate, { sel = '[data-k]', ms = 460, enter = true, easing = EASE.out } = {}) {
  root.dataset.motion = 'own'; // this screen animates itself: skip the generic section fade
  const before = new Map();
  for (const el of root.querySelectorAll(sel)) before.set(el.dataset.k, el.getBoundingClientRect());
  mutate();
  if (!before.size && !enter) return;
  let n = 0;
  for (const el of root.querySelectorAll(sel)) {
    const was = before.get(el.dataset.k);
    if (!was) { if (enter && before.size) popIn(el, { ms: 320, delay: Math.min(n++, 10) * 30, from: 0.6 }); continue; }
    const now = el.getBoundingClientRect();
    const dx = was.left - now.left, dy = was.top - now.top;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: dur(ms), easing });
  }
}

// A signature of what a section SAYS, blind to numbers and inline styles, so a ticking clock or a score going up is not a "change".
const sig = (el) => el.outerHTML.replace(/ style="[^"]*"/g, '').replace(/\d+(\.\d+)?/g, '#');
/**
 * Generic motion for the party games: whenever a game redraws its screen (a plain replaceChildren on a .kt column),
 * the sections that actually changed ease in; the ones that look the same stay perfectly still.
 */
export function autoMotion(root) {
  if (reduced() || typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.target;
      if (!m.addedNodes.length || !t.classList || !t.classList.contains('kt') || t.dataset.motion === 'own') continue;
      const old = [...m.removedNodes].filter((n) => n.nodeType === 1).map(sig);
      const fresh = [...m.addedNodes].filter((n) => n.nodeType === 1);
      let k = 0;
      fresh.forEach((el, i) => {
        if (old.length && old[i] === sig(el)) return;
        el.animate([{ opacity: 0, translate: '0 12px', scale: 0.985 }, { opacity: 1, translate: '0 0', scale: 1 }], { duration: 380, delay: Math.min(k++, 6) * 45, easing: EASE.out, fill: 'backwards' });
      });
    }
  });
  mo.observe(root, { childList: true, subtree: true });
  return () => mo.disconnect();
}
