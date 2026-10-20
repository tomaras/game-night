// App chrome outside of rooms: bottom navigation (phones), side rail (wide screens), the slide-in drawer and the
// speed-dial button. Pure UI — main.js tells it what to do through `ctx`.
import { h, mount } from './util.js';
import { icon, iconBtn, logoMark, segmented, switchEl } from './ui.js';
import { avatarEl } from './avatar.js';
import { THEMES, getThemePref, setThemePref } from './theme.js';
import { isMuted, setMuted } from './audio.js';
import { channelInfo } from './channel.js';
import { CFG } from './net.js';

export const TABS = [
  { id: 'games', label: 'Games', icon: 'sports_esports', hash: '#/', color: 'var(--m-blue)' },
  { id: 'rooms', label: 'Rooms', icon: 'meeting_room', hash: '#/rooms', color: 'var(--m-red)' },
  { id: 'matches', label: 'Matches', icon: 'sms', hash: '#/matches', color: 'var(--m-amber)' },
  { id: 'lounge', label: 'Lounge', icon: 'forum', hash: '#/lounge', color: 'var(--m-green)' },
];

export function createChrome(ctx) {
  const badges = {};
  let active = 'games';
  const bottom = h('nav.bottomnav', { 'aria-label': 'Main' });
  const rail = h('nav.rail', { 'aria-label': 'Main' });
  const fabHost = h('div.fabhost');
  let fabItems = null;
  let fabOpen = false;

  const navButton = (t, cls) => h('button.navitem' + (t.id === active ? '.on' : ''), { onclick: () => ctx.go(t.hash), 'aria-label': t.label, 'aria-current': t.id === active ? 'page' : null },
    h('span.pill', icon(t.icon)), h('span.nl', t.label), badges[t.id] ? h('span.dot', badges[t.id] > 9 ? '9+' : badges[t.id]) : null);

  function paintNav() {
    mount(bottom, ...TABS.map((t) => navButton(t)));
    mount(rail, ...TABS.map((t) => navButton(t)), h('div.spacer'),
      h('button.navitem', { onclick: toggleDrawer, 'aria-label': 'Settings' }, h('span.pill', icon('settings')), h('span.nl', 'Settings')));
  }

  // ---------------------------------------------------------------- speed dial
  function paintFab() {
    if (!fabItems) { mount(fabHost); fabHost.classList.add('hide'); return; }
    fabHost.classList.remove('hide');
    mount(fabHost,
      fabOpen ? h('div.fabscrim', { onclick: () => toggleFab(false) }) : null,
      h('div.fabwrap' + (fabOpen ? '.open' : ''),
        fabOpen ? h('div.fabitems', fabItems.map((it, i) => h('button.fabitem', { style: { '--i': i }, onclick: () => { toggleFab(false); it.onClick(); } }, h('span.lbl', it.label), h('span.mini', icon(it.icon))))) : null,
        h('button.fabmain', { onclick: () => toggleFab(), 'aria-label': fabOpen ? 'Close menu' : 'Play options', 'aria-expanded': String(fabOpen) }, icon(fabOpen ? 'close' : 'add'))));
  }
  function toggleFab(v) { fabOpen = v ?? !fabOpen; paintFab(); }

  // ---------------------------------------------------------------- the die: menu button that rolls into a red cross and back
  const xMark = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'xm'); s.innerHTML = '<circle cx="12" cy="12" r="11" fill="var(--field)"/><path d="M8 8l8 8M16 8l-8 8" fill="none" stroke="var(--on)" stroke-width="2.2" stroke-linecap="round"/>'; return s; };
  const die = h('button.diebtn', { 'aria-label': 'Menu', 'aria-expanded': 'false', onclick: () => toggleDrawer() },
    h('span.dieface', logoMark()), h('span.diex', xMark()), CFG.env === 'nightly' ? h('span.moon', { 'aria-hidden': 'true' }, '🌙') : null);
  const setDie = (open) => { die.classList.toggle('open', open); die.classList.remove('rolling'); void die.offsetWidth; die.classList.add('rolling'); die.setAttribute('aria-expanded', String(open)); };

  // ---------------------------------------------------------------- drawer
  let drawerEls = null;
  const toggleDrawer = () => (drawerEls ? drawerEls.close() : openDrawer());
  function openDrawer() {
    if (drawerEls) return;
    setDie(true);
    const close = () => { if (!drawerEls) return; setDie(false); drawerEls.back.classList.add('out'); drawerEls.panel.classList.add('out'); const d = drawerEls; drawerEls = null; setTimeout(() => { d.back.remove(); d.panel.remove(); }, 200); removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', onKey);
    const item = (ic, label, fn, extra, tc) => h('button.ditem', { onclick: () => { close(); fn(); }, 'data-tc': tc || null, style: tc ? { '--tc': tc } : null }, icon(ic), h('span', label), extra || null);
    const prof = ctx.S.profile;
    const panel = h('aside.drawer', { 'aria-label': 'Menu' },
      h('button.dprofile', { onclick: () => { close(); ctx.editProfile(); } }, avatarEl({ avatar: prof.avatar }, 'lg'), h('div', h('b', prof.name), h('small', 'Edit name & avatar')), h('span.spacer'), icon('edit')),
      h('div.dsec', 'Go to'),
      ...TABS.map((t) => item(t.icon, t.label, () => ctx.go(t.hash), badges[t.id] ? h('span.chip.red', badges[t.id]) : null, t.color)),
      h('div.dsec', 'Appearance'),
      h('div.dtheme', segmented(THEMES.map(([v, label, ic]) => ({ value: v, label, icon: ic })), getThemePref(), (v) => setThemePref(v))),
      h('div.dsec', 'Preferences'),
      h('div.drow', icon('volume_up'), h('span', 'Sound effects'), h('span.spacer'), switchEl(!isMuted(), (on) => setMuted(!on))),
      h('div.drow', icon('chat_bubble'), h('span', 'Chat on the game screen'), h('span.spacer'), switchEl(ctx.getOverlay(), (on) => ctx.setOverlay(on))),
      ...channelRows(),
      h('div.dsec', 'More'),
      item('videocam', 'Recordings', ctx.openRecordings),
      item('help_outline', 'How it works & app info', ctx.openAbout),
      h('div.dfoot', ctx.versionText));
    const back = h('div.drawerback', { onclick: close });
    document.body.append(back, panel);
    drawerEls = { back, panel, close };
  }

  /** The "Early access" switch (only on the deployed site): on = newest version, off = the tried-and-tested one. Flipping it reloads into the other version. */
  function channelRows() {
    const info = channelInfo();
    if (!info.canSwitch) return [];
    const sw = switchEl(info.current === 'nightly', async (on) => { if (!(await ctx.switchChannel(on ? 'nightly' : 'stable'))) { sw.querySelector('input').checked = !on; } });
    return [h('div.drow', icon('new_releases'), h('span', 'Early access'), h('span.spacer'), sw),
      h('div.dnote', 'Rooms are separate between the two versions.')];
  }

  paintNav();
  paintFab();
  return {
    bottom, rail, fabHost,
    setActive(id) { active = id; paintNav(); },
    setBadge(id, n) { if ((badges[id] || 0) === n) return; badges[id] = n; paintNav(); },
    setFab(items) { fabItems = items; fabOpen = false; paintFab(); },
    openDrawer, toggleDrawer, die,
  };
}
