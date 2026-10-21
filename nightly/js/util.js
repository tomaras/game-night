// Small shared helpers: DOM builder, PRNG, event emitter, clipboard.
import { icon } from './ui.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hyperscript-style element builder: h('div.card#id', {onclick}, child, ...) */
export function h(tag, props, ...kids) {
  const m = /^([\w-]+)?((?:[.#][\w-]+)*)$/.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => {
    if (k === '.') el.classList.add(v);
    else el.id = v;
  });
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') el.classList.add(...String(v).split(/\s+/).filter(Boolean));
    else if (k === 'style') {
      if (typeof v === 'string') el.style.cssText += v;
      else for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendKids(el, kids);
  return el;
}
function appendKids(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) appendKids(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
export function mount(el, ...kids) {
  clear(el);
  appendKids(el, kids);
  return el;
}

export class Emitter {
  constructor() { this._l = new Map(); }
  on(ev, fn) {
    if (!this._l.has(ev)) this._l.set(ev, new Set());
    this._l.get(ev).add(fn);
    return () => this._l.get(ev)?.delete(fn);
  }
  emit(ev, ...args) {
    for (const fn of [...(this._l.get(ev) || [])]) {
      try { fn(...args); } catch (e) { console.error('[emit:' + ev + ']', e); }
    }
  }
}

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    int: (n) => Math.floor(next() * n),
    range: (a, b) => a + next() * (b - a),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const x = arr.slice();
      for (let i = x.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [x[i], x[j]] = [x[j], x[i]];
      }
      return x;
    },
  };
  return r;
}

export function shuffle(arr) {
  const x = arr.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const randInt = (n) => Math.floor(Math.random() * n);
export const uid = (n = 12) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 36).toString(36)).join('');

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Convert any pointer/touch event to canvas-local coordinates (in canvas pixel space). */
export function canvasPoint(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  const t = ev.touches?.[0] || ev.changedTouches?.[0] || ev;
  return {
    x: ((t.clientX - r.left) / r.width) * canvas.width,
    y: ((t.clientY - r.top) / r.height) * canvas.height,
  };
}

/** Keyboard state tracker for real-time games; returns {keys:Set, destroy}. */
export function trackKeys(api, onChange) {
  const keys = new Set();
  const norm = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
  api.listen(window, 'keydown', (e) => {
    if (typing(e)) return;
    const k = norm(e);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (!keys.has(k)) { keys.add(k); onChange?.(k, true, e); }
  });
  api.listen(window, 'keyup', (e) => {
    const k = norm(e);
    if (keys.delete(k)) onChange?.(k, false, e);
  });
  api.listen(window, 'blur', () => { keys.clear(); onChange?.(null, false); });
  return keys;
}

/** Fit a fixed-aspect canvas into its container (CSS size); returns observer cleanup. */
export function fitCanvas(canvas, container, aspect) {
  const fit = () => {
    const r = container.getBoundingClientRect();
    let w = r.width, hgt = w / aspect;
    if (hgt > r.height) { hgt = r.height; w = hgt * aspect; }
    canvas.style.width = Math.floor(w) + 'px';
    canvas.style.height = Math.floor(hgt) + 'px';
  };
  const ro = new ResizeObserver(fit);
  ro.observe(container);
  fit();
  return () => ro.disconnect();
}

/** On-screen touch controls: returns element. opts.actions: [{label|icon, key}] */
export function dpad(onKey, opts = {}) {
  const b = (label, key, cls = '') => {
    const el = h('button.tbtn' + (cls ? '.' + cls : ''), { 'aria-label': key }, label);
    const down = (e) => { e.preventDefault(); el.classList.add('down'); onKey(key, true); };
    const up = (e) => { e.preventDefault(); el.classList.remove('down'); onKey(key, false); };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
    return el;
  };
  const actions = (opts.actions || []).map((a) => b(a.icon ? icon(a.icon) : a.label, a.key, 'act'));
  return h('div.touch-controls', [
    h('div.dpad', [b(icon('keyboard_arrow_up', 'lg'), 'ArrowUp', 'u'), b(icon('chevron_left', 'lg'), 'ArrowLeft', 'l'), b(icon('chevron_right', 'lg'), 'ArrowRight', 'r'), b(icon('keyboard_arrow_down', 'lg'), 'ArrowDown', 'd')]),
    h('div.acts', actions),
  ]);
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

/** Make Element.replaceChildren/append/prepend ignore null/undefined/false (the DOM would insert the text "null"). */
export function installSafeDom() {
  for (const m of ['replaceChildren', 'append', 'prepend']) {
    const orig = Element.prototype[m];
    Element.prototype[m] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false)); };
  }
}
