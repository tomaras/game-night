// A chat log + input, used for both the room chat and the global (Lounge) chat.
import { h } from './util.js';
import { icon } from './ui.js';
import { avatarEl } from './avatar.js';

const hue = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${x % 360} 55% 42%)`; };

/** cfg: { placeholder, send(text), onName?(msg, anchor), empty? }. Messages: {id, mine, name, color?, avatar?, text, sys?, from?, history?}. */
export function chatView({ placeholder = 'Message…', send, onName, empty } = {}) {
  const msgs = h('div.msgs');
  const input = h('input.txt', { placeholder, maxlength: 300, autocomplete: 'off', enterkeyhint: 'send' });
  const form = h('form', {
    onsubmit: (e) => { e.preventDefault(); const t = input.value.trim(); if (t) send(t); input.value = ''; },
  }, input, h('button.chatsend', { type: 'submit', 'aria-label': 'Send' }, icon('send')));
  const hint = empty ? h('div.chatempty', empty) : null;
  const el = h('div.chat', hint, msgs, form);
  const seen = new Set();

  function add(m) {
    if (m.id && seen.has(m.id)) return;
    if (m.id) seen.add(m.id);
    hint?.remove();
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    const nameEl = m.mine || !m.name ? null : onName
      ? h('button.mname', { type: 'button', style: { color: m.color ? `color-mix(in srgb, ${m.color} 62%, #000)` : hue(m.from || m.name) }, onclick: (e) => onName(m, e.currentTarget) }, m.name)
      : h('b', { style: { color: m.color ? `color-mix(in srgb, ${m.color} 62%, #000)` : hue(m.from || m.name) } }, m.name);
    msgs.append(m.sys
      ? h('div.m.sys', h('div.bub', m.text))
      : h('div.m' + (m.mine ? '.me' : '') + (m.history ? '.hist' : ''), m.avatar ? avatarEl({ avatar: m.avatar, name: m.name }, 'sm', { still: true }) : null, h('div.bub', nameEl, m.text)));
    while (msgs.childNodes.length > 120) msgs.firstChild.remove();
    if (nearBottom || m.mine) msgs.scrollTop = msgs.scrollHeight;
  }
  function reset(list = []) { msgs.replaceChildren(); seen.clear(); if (hint && !list.length) el.insertBefore(hint, msgs); list.forEach(add); msgs.scrollTop = msgs.scrollHeight; }
  return { el, add, reset, focus: () => input.focus(), scroll: () => { msgs.scrollTop = msgs.scrollHeight; } };
}
