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
