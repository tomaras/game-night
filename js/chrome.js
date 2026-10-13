// App chrome outside of rooms: bottom navigation (phones), side rail (wide screens), the slide-in drawer and the
// speed-dial button. Pure UI — main.js tells it what to do through `ctx`.
import { h, mount } from './util.js';
import { icon, iconBtn, logoMark, segmented, switchEl } from './ui.js';
import { avatarEl } from './avatar.js';
import { THEMES, getThemePref, setThemePref } from './theme.js';
import { isMuted, setMuted } from './audio.js';

export const TABS = [
  { id: 'games', label: 'Games', icon: 'sports_esports', hash: '#/' },
  { id: 'rooms', label: 'Rooms', icon: 'meeting_room', hash: '#/rooms' },
  { id: 'matches', label: 'Matches', icon: 'sms', hash: '#/matches' },
  { id: 'lounge', label: 'Lounge', icon: 'forum', hash: '#/lounge' },
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
    mount(rail, h('button.navitem.menu', { onclick: openDrawer, 'aria-label': 'Menu' }, h('span.pill', icon('menu'))), ...TABS.map((t) => navButton(t)), h('div.spacer'),
      h('button.navitem', { onclick: openDrawer, 'aria-label': 'Settings' }, h('span.pill', icon('settings')), h('span.nl', 'More')));
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

  // ---------------------------------------------------------------- drawer
  let drawerEls = null;
  function openDrawer() {
    if (drawerEls) return;
    const close = () => { drawerEls.back.classList.add('out'); drawerEls.panel.classList.add('out'); const d = drawerEls; drawerEls = null; setTimeout(() => { d.back.remove(); d.panel.remove(); }, 200); removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', onKey);
    const item = (ic, label, fn, extra) => h('button.ditem', { onclick: () => { close(); fn(); } }, icon(ic), h('span', label), extra || null);
    const prof = ctx.S.profile;
    const panel = h('aside.drawer', { 'aria-label': 'Menu' },
      h('div.dhead', h('div.dlogo', logoMark()), h('div.spacer'), iconBtn('close', 'Close menu', close, 'sm')),
      h('button.dprofile', { onclick: () => { close(); ctx.editProfile(); } }, avatarEl({ avatar: prof.avatar }, 'lg'), h('div', h('b', prof.name), h('small', 'Edit name & avatar')), h('span.spacer'), icon('edit')),
      h('div.dsec', 'Go to'),
      ...TABS.map((t) => item(t.icon, t.label, () => ctx.go(t.hash), badges[t.id] ? h('span.chip.red', badges[t.id]) : null)),
      h('div.dsec', 'Appearance'),
      h('div.dtheme', segmented(THEMES.map(([v, label, ic]) => ({ value: v, label, icon: ic })), getThemePref(), (v) => setThemePref(v))),
      h('div.dsec', 'Preferences'),
      h('div.drow', icon('volume_up'), h('span', 'Sound effects'), h('span.spacer'), switchEl(!isMuted(), (on) => setMuted(!on))),
      h('div.dsec', 'More'),
      item('fiber_manual_record', 'Recordings', ctx.openRecordings),
      item('help_outline', 'How it works & app info', ctx.openAbout),
      h('div.dfoot', ctx.versionText));
    const back = h('div.drawerback', { onclick: close });
    document.body.append(back, panel);
    drawerEls = { back, panel };
  }

  paintNav();
  paintFab();
  return {
    bottom, rail, fabHost,
    setActive(id) { active = id; paintNav(); },
    setBadge(id, n) { if ((badges[id] || 0) === n) return; badges[id] = n; paintNav(); },
    setFab(items) { fabItems = items; fabOpen = false; paintFab(); },
    openDrawer,
  };
}
