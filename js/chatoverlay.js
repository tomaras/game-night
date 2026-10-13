// Chat on top of the game: the last few messages float over the play area (how many, and where, depends on how much of the
// screen the game uses) and fade away. Tap one to reply — with quick reactions — without leaving the game.
import { h } from './util.js';
import { avatarEl } from './avatar.js';
import { icon } from './ui.js';

const QUICK = ['👍', '😂', '😮', '👏', '🔥', 'GG'];

/** `send(text)` posts to whichever chat (room / global) is currently selected. */
export function createChatOverlay({ send }) {
  const list = h('div.cmsgs');
  const input = h('input.txt', { maxlength: 300, autocomplete: 'off', enterkeyhint: 'send', placeholder: 'Reply…' });
  const reply = h('form.creply.hide', { onsubmit: (e) => { e.preventDefault(); const t = input.value.trim(); if (t) { send(replyTo ? `@${replyTo} ${t}` : t); } close(); } },
    h('div.cquick', QUICK.map((q) => h('button', { type: 'button', onclick: () => { send(q); close(); } }, q))),
    h('div.crow2', input, h('button.chatsend', { type: 'submit', 'aria-label': 'Send' }, icon('send')), h('button.iconbtn.sm', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close'))));
  const el = h('div.cover', { 'data-at': 'bottom' }, list, reply);
  let cfg = { n: 3, at: 'bottom', life: 9000 }, replyTo = null, enabled = true;

  function close() { replyTo = null; input.value = ''; reply.classList.add('hide'); input.blur(); el.classList.remove('replying'); }
  function open(name) { replyTo = name || null; input.placeholder = name ? `Reply to ${name}…` : 'Say something…'; reply.classList.remove('hide'); el.classList.add('replying'); setTimeout(() => input.focus(), 30); }
  const trim = () => { while (list.childNodes.length > cfg.n) list.firstChild.remove(); };
  function fade(b, ms) { setTimeout(() => { if (el.classList.contains('replying')) return fade(b, 3000); b.classList.add('out'); setTimeout(() => b.remove(), 400); }, ms); }

  return {
    el,
    /** m: {name, text, avatar, mine, sys} */
    push(m) {
      if (!enabled || m.sys || !m.text) return;
      const b = h('div.cb' + (m.mine ? '.me' : ''), { onclick: () => open(m.mine ? null : m.name) },
        m.avatar ? avatarEl({ avatar: m.avatar, name: m.name }, 'xs', { still: true }) : null,
        h('div.ct', m.mine ? null : h('b', m.name), h('span', m.text)));
      list.append(b);
      trim();
      fade(b, m.mine ? 3500 : cfg.life);
    },
    /** { n: how many messages at most, at: 'top' | 'bottom', life: ms } */
    configure(c) { cfg = { ...cfg, ...c }; el.dataset.at = cfg.at; trim(); },
    setEnabled(v) { enabled = !!v; el.classList.toggle('hide', !enabled); if (!enabled) { list.replaceChildren(); close(); } },
    clear() { list.replaceChildren(); close(); },
    compose() { open(null); },
  };
}
