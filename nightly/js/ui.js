// Material-style UI helpers: icons, ripples, bottom sheets / dialogs / menus, snackbars.
import { h } from './util.js';
import { ICONS } from './icons_data.js';

const NS = 'http://www.w3.org/2000/svg';
ICONS.eraser = 'M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 0 1-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0M4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z';

/** Material icon as an <svg>. name: key from icons_data.js */
export function icon(name, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.help || '');
  svg.appendChild(p);
  return svg;
}

export function iconBtn(name, title, onclick, cls = '') {
  return h('button.iconbtn' + (cls ? '.' + cls.split(' ').join('.') : ''), { title, 'aria-label': title, onclick }, icon(name));
}

/** The Game Night logo mark: four round Google-coloured dice faces (one to four pips). */
export function logoMark() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', 'mark');
  const dots = [[12, 12, '#4285F4'], [36, 12, '#EA4335'], [12, 36, '#FBBC05'], [36, 36, '#34A853']];
  const pips = [[12, 12], [32, 8], [40, 16], [8, 32], [12, 36], [16, 40], [32, 32], [40, 32], [32, 40], [40, 40]];
  svg.innerHTML = dots.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="11" fill="${c}"/>`).join('') +
    pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="#fff"/>`).join('');
  return svg;
}

// ------------------------------------------------------------------ ink
// Material ink: a ripple grows from the finger while it's down and fades when it lifts.
// Round controls (icon buttons, the FAB) get a ripple that fills the circle from its centre.
const INK = '.btn, .iconbtn, .gcard, .fchip, .cchip, .menu button, .seg button, .navitem, .ditem, .dprofile, .numchip, .kt-choice, .rcard, .mmain, .mcard, .ptab, .csb, .avarrow, .fabmain, .fabitem .mini, .chatsend, .codechip, .pfilter, .vposter, .joinpill .go, .profilechip, [data-ink]';
const ROUND = '.iconbtn, .fabmain, .fabitem .mini, .chatsend, .avarrow';
export function installRipples() {
  document.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest?.(INK);
    if (!el || el.disabled || el.closest('[data-noink]')) return;
    const r = el.getBoundingClientRect();
    const round = el.matches(ROUND);
    const x = round ? r.width / 2 : e.clientX - r.left, y = round ? r.height / 2 : e.clientY - r.top;
    const size = round ? Math.max(r.width, r.height) : 2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
    const s = h('span.ink', { style: { width: size + 'px', height: size + 'px', left: x - size / 2 + 'px', top: y - size / 2 + 'px' } });
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    if (!round && cs.overflow !== 'hidden') el.style.overflow = 'hidden';
    el.appendChild(s);
    const born = performance.now();
    const up = () => {
      removeEventListener('pointerup', up); removeEventListener('pointercancel', up); el.removeEventListener('pointerleave', up);
      setTimeout(() => { s.classList.add('up'); setTimeout(() => s.remove(), 900); }, Math.max(0, 160 - (performance.now() - born)));
    };
    addEventListener('pointerup', up); addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  }, { passive: true });
}

// ------------------------------------------------------------------ snackbar
export function toast(text, kind = '') {
  const host = document.getElementById('toasts');
  const t = h('div.toast' + (kind ? '.' + kind : ''), text);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 3200);
}

/** A card that slides in at the top of the screen and waits for a decision (join requests, invitations).
 *  `actions`: [{label, primary?, onClick}]. Returns {close}. `ttl` auto-dismisses it (ms). */
export function notice({ avatar, icon: ic, title, text, actions = [], ttl = 0, key }) {
  let host = document.getElementById('notices');
  if (!host) { host = h('div#notices'); document.body.append(host); }
  if (key) host.querySelector(`[data-key="${key}"]`)?.remove();
  const close = () => { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  const el = h('div.notice', { 'data-key': key || '', role: 'alert' },
    avatar || (ic ? h('div.nic', icon(ic)) : null),
    h('div.nbody', h('b', title), text ? h('div.nt', text) : null,
      h('div.nact', actions.map((a) => h('button.btn.small' + (a.primary ? '.primary' : '.tonal'), { onclick: () => { close(); a.onClick?.(); } }, a.label)))));
  host.append(el);
  if (ttl) setTimeout(close, ttl);
  return { close };
}

// ------------------------------------------------------------------ sheets (bottom sheet on phones, dialog on desktop)
export function openSheet(content, { wide, onClose, closable = true, cls = '' } = {}) {
  const back = h('div.scrim', { onclick: (e) => { if (e.target === back && closable) close(); } });
  const grab = h('div.grab');
  const x = closable ? h('button.iconbtn.x', { onclick: () => close(), 'aria-label': 'Close' }, icon('close')) : null;
  const sheet = h('div.sheet' + (wide ? '.wide' : '') + (cls ? '.' + cls : ''), grab, x, content);
  back.append(sheet);
  document.body.append(back);
  const onKey = (e) => { if (e.key === 'Escape' && closable) close(); };
  addEventListener('keydown', onKey);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', onKey);
    sheet.style.transition = 'transform .18s, opacity .18s';
    sheet.style.transform = 'translateY(40px)'; sheet.style.opacity = '0'; back.style.opacity = '0'; back.style.transition = 'opacity .18s';
    setTimeout(() => back.remove(), 180);
    onClose?.();
  }
  // swipe down on the grab handle to dismiss (phones)
  let sy = null;
  grab.style.touchAction = 'none';
  grab.addEventListener('pointerdown', (e) => { sy = e.clientY; grab.setPointerCapture(e.pointerId); });
  grab.addEventListener('pointermove', (e) => { if (sy !== null) sheet.style.transform = `translateY(${Math.max(0, e.clientY - sy)}px)`; });
  grab.addEventListener('pointerup', (e) => { if (sy !== null && e.clientY - sy > 90 && closable) close(); else sheet.style.transform = ''; sy = null; });
  return { close, el: sheet };
}

/** Small centred dialog. actions: [{label, value, kind}] — resolves with the clicked value (or undefined if dismissed). */
export function openDialog({ title, text, content, actions }) {
  return new Promise((resolve) => {
    const back = h('div.scrim.center', { onclick: (e) => { if (e.target === back) done(undefined); } });
    const done = (v) => { removeEventListener('keydown', onKey); back.classList.add('out'); setTimeout(() => back.remove(), 200); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(undefined); };
    addEventListener('keydown', onKey);
    back.append(h('div.dialog', [
      title ? h('h3', title) : null,
      text ? h('p', text) : null,
      content || null,
      h('div.actions', actions.map((a) => h('button.btn' + (a.kind ? '.' + a.kind : ''), { onclick: () => done(a.value) }, a.label))),
    ]));
    document.body.append(back);
  });
}

export async function confirmDialog(title, text, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  const r = await openDialog({ title, text, actions: [{ label: cancel, value: false }, { label: ok, value: true, kind: danger ? 'bad' : 'primary' }] });
  return r === true;
}

// ------------------------------------------------------------------ popup menu
export function openMenu(anchor, items) {
  const r = anchor.getBoundingClientRect();
  const close = () => { m.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', key); };
  const away = (e) => { if (!m.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  const m = h('div.menu', items.map((it) => (it === '-' ? h('hr') : h('button' + (it.danger ? '.danger' : ''), { onclick: () => { close(); it.onClick?.(); } }, it.icon ? icon(it.icon) : null, it.label))));
  document.body.append(m);
  const w = m.offsetWidth, hh = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = Math.max(8, Math.min(innerHeight - hh - 8, r.bottom + 4)) + 'px';
  setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', key); }, 0);
  return close;
}

/** M3 segmented button group. options: [{value,label}] */
export function segmented(options, value, onChange) {
  const el = h('div.seg');
  const paint = () => el.replaceChildren(...options.map((o) => h('button' + (String(o.value) === String(value) ? '.on' : ''), { type: 'button', title: o.title || '', onclick: () => { value = o.value; onChange(o.value); paint(); } }, o.icon ? icon(o.icon, 'sm') : null, o.label)));
  paint();
  el.set = (v) => { value = v; paint(); };
  return el;
}

/** A small floating panel anchored to a button (filters, quick settings). Closes on outside tap / Escape. */
export function openPopover(anchor, content, { align = 'left', width } = {}) {
  const r = anchor.getBoundingClientRect();
  const close = () => { m.remove(); removeEventListener('pointerdown', away, true); removeEventListener('keydown', key); };
  const away = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  const m = h('div.popover', { style: width ? { width: width + 'px' } : '' }, content);
  document.body.append(m);
  const w = m.offsetWidth, hh = m.offsetHeight;
  const left = align === 'right' ? r.right - w : r.left;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, left)) + 'px';
  m.style.top = Math.max(8, Math.min(innerHeight - hh - 8, r.bottom + 6)) + 'px';
  setTimeout(() => { addEventListener('pointerdown', away, true); addEventListener('keydown', key); }, 0);
  return close;
}

export function switchEl(checked, onChange) {
  return h('label.switch', h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }), h('span'));
}
