// App shell: home, name/avatar gate, lobby, in-room chrome (app bar, chat, calls, rules), results, routing.
import { h, mount, clear, copyText, pick, installSafeDom } from './util.js';
import { Room, parseRoomInput, roomLink, CFG, PROTO } from './net.js';
import { pwa, onPwaChange, initPwa, promptInstall, isIOS } from './pwa.js';
import { GAMES, GAME_BY_ID, CATEGORIES } from './games/index.js';
import { GameSession } from './session.js';
import { sfx, isMuted, setMuted, audioContext } from './audio.js';
import { avatarEl, avatarEditor, sanitizeAvatar } from './avatar.js';
import { createAvUI } from './avui.js';
import { Comms } from './comms.js';
import { createCommsButtons, openCommsSheet, channelList, createMiniCall } from './commsui.js';
import { chatView } from './chatview.js';
import { Recorder } from './recorder.js';
import { openRecordings } from './recui.js';
import { icon, iconBtn, logoMark, installRipples, toast, openSheet, confirmDialog, openMenu, openPopover, switchEl, segmented, notice } from './ui.js';
import { plaza } from './plaza.js';
import { createRoomPanel, gameName } from './roompanel.js';
import { channelName } from './lounge.js';
import { maybeRedirect, switchChannel, channelInfo, channelLabel, otherChannel } from './channel.js';
import { initTheme, THEMES, getThemePref, setThemePref, onTheme } from './theme.js';
import { createChrome } from './chrome.js';
import { LocalRoom } from './local.js';
import { LEVELS, makeBot } from './bots.js';
import { listMatches, getMatch, putMatch, deleteMatch, myTurnCount, newMatchId, encodeMatch, decodeMatch, matchLink, smsUrl, shareText, nativeShare } from './matches.js';
import { randomAvatar } from './avatar.js';

installSafeDom();
installRipples();
initTheme();

// Non-production builds are tagged everywhere so a test copy can never be mistaken for the real thing.
const ENV_TAG = CFG.env === 'prod' ? '' : CFG.env === 'nightly' ? '[NIGHTLY]' : '[LOCAL]';
const setTitle = (t) => { document.title = (ENV_TAG ? ENV_TAG + ' ' : '') + t; };

const $app = document.getElementById('app');
const wideMQ = matchMedia('(min-width: 1000px)');
export { toast };

// ------------------------------------------------------------------ state
const S = {
  profile: loadProfile(),
  room: null,
  session: null,
  mode: 'none', // none | lobby | game | wait
  runId: 0,
  filter: 'All',
  query: '',
  tab: 'games',
  players: null, // filter: show games playable with exactly this many players
  withBots: readPref('gn.withBots') !== '0',
  favs: new Set(readJSON('gn.favs', [])),
  recent: readJSON('gn.recent', []), // game ids, most recently played first
  joining: false,
  token: 0,
  ui: null,
  chat: null,
  unread: 0,
  unreadG: 0, // unread messages in the global (Lounge) chat while in a room
  comms: null,
  loungeUI: null,
  sheetOpen: false,
  chatCollapsed: readPref('gn.chatCollapsed') === '1',
  resultsFor: 0,
  offs: [],
};

function readJSON(k, d) { try { return JSON.parse(localStorage.getItem(k) || ''); } catch { return d; } }
function readPref(k) { try { return localStorage.getItem(k); } catch { return null; } }
function writePref(k, v) { try { localStorage.setItem(k, v); } catch { /* */ } }
function randomName() {
  return pick(['Sneaky', 'Happy', 'Brave', 'Lucky', 'Sleepy', 'Jolly', 'Mighty', 'Zesty', 'Cosmic', 'Wild', 'Tiny', 'Fuzzy', 'Spicy', 'Silly']) + ' ' +
    pick(['Fox', 'Panda', 'Otter', 'Koala', 'Gecko', 'Moose', 'Llama', 'Tiger', 'Yeti', 'Owl', 'Newt', 'Bison']);
}
function loadProfile() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('gn.profile') || '{}'); } catch { /* */ }
  const prof = { name: String(p.name || '').slice(0, 16) || randomName(), avatar: sanitizeAvatar(typeof p.avatar === 'object' ? p.avatar : null) };
  saveProfile(prof);
  return prof;
}
function saveProfile(p) { try { localStorage.setItem('gn.profile', JSON.stringify(p)); } catch { /* storage full (big photo) */ } }

function fillOpts(def, opts) {
  const o = { ...opts };
  for (const op of def.options || []) if (o[op.key] === undefined) o[op.key] = op.default;
  return o;
}
const playersLabel = (def) => (def.min === def.max ? `${def.min} players` : `${def.min}–${def.max} players`);

// ------------------------------------------------------------------ profile (name + avatar)
function askProfile({ title = 'Your profile', sub = '', confirm = 'Save' } = {}) {
  return new Promise((resolve) => {
    let name = S.profile.name;
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const input = h('input.txt', {
      value: name, maxlength: 16, placeholder: 'Your name', autocomplete: 'off', style: 'flex:1;font-size:18px;font-weight:600',
      oninput: (e) => { name = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') save(); },
    });
    const editor = avatarEditor(S.profile.avatar, () => {});
    const save = () => {
      name = name.trim().slice(0, 16);
      if (!name) { input.focus(); return toast('Please type a name', 'bad'); }
      S.profile = { name, avatar: editor.get() };
      saveProfile(S.profile);
      finish(S.profile);
      sheet.close();
    };
    const sheet = openSheet(
      h('div.col', { style: 'gap:14px' }, [
        h('div', [h('h2', title), sub ? h('div.muted', { style: 'margin-top:2px' }, sub) : null]),
        editor.el,
        h('div.row', [input, h('button.iconbtn.tonal', { title: 'Random name', 'aria-label': 'Random name', onclick: () => { name = randomName(); input.value = name; } }, icon('casino'))]),
        h('button.btn.primary.big.block', { onclick: save }, confirm),
      ]),
      { onClose: () => finish(null) }
    );
    setTimeout(() => { input.focus(); input.select(); }, 80);
  });
}

async function editProfile() {
  const p = await askProfile({ title: 'Edit your profile', sub: 'Everyone in the room sees changes instantly.' });
  if (p) {
    S.room?.setProfile(p);
    plaza.setProfile(p);
    renderHeader();
    toast('Profile updated', 'good');
  }
}

// ------------------------------------------------------------------ rules / how to play
function openRules(def) {
  if (!def) return toast('Pick a game first to see its rules');
  const help = def.help || {};
  const steps = help.steps || def.howto || [];
  const sect = (title, list, ordered) => (list && list.length ? [h('h4', title), h(ordered ? 'ol' : 'ul', list.map((x) => h('li', { style: { '--c': def.color } }, x)))] : []);
  openSheet(h('div.help', { style: { '--gc': def.color } }, [
    h('h2', def.name),
    h('div.hd', [
      h('div.tile.emo', def.emoji),
      h('div', [h('div.muted', { style: 'margin-bottom:6px' }, def.tagline), h('div.row.wrap', { style: 'gap:6px' }, [h('span.chip.blue', icon('group'), playersLabel(def)), h('span.chip', def.cat), ...(def.tags || []).slice(0, 2).map((t) => h('span.chip', t))])]),
    ]),
    h('div.goal', help.goal || def.desc),
    ...sect('How to play', steps, true),
    help.controls && help.controls.length ? [h('h4', 'Controls'), h('div.keys', help.controls.map((c) => h('span', h('kbd', c[0]), ' ' + c[1])))] : [],
    ...sect('Tips', help.tips, false),
  ].flat()));
}
const currentDef = () => { const st = S.room?.state; return GAME_BY_ID[st?.game?.gameId || st?.gameId]; };

function openAbout() {
  openSheet(h('div.help', { style: { '--gc': '#1a73e8' } }, [
    h('h2', 'How Game Night works'),
    h('h4', 'Play in 3 steps'),
    h('ol', [
      'Pick a game and tap Create room. You get a room number — 1, 2, 3 … the lowest free one.',
      'Send friends the invite link, or tell them the number. They enter it on the home screen and pick a name and avatar.',
      'The host presses Start. Tap the ? button any time to see the rules, and 🎤 / 📹 to talk or show your face.',
    ].map((x) => h('li', x))),
    h('h4', 'Good to know'),
    h('ul', [
      'Everything runs peer-to-peer between your browsers. There is no game server and nothing is stored.',
      'Lose connection? Reopen the link within 45 seconds and you’ll get your seat (and game) back.',
      'Works best on a phone in portrait. Keep the screen awake — the host’s device runs the game.',
    ].map((x) => h('li', { style: { '--c': '#34a853' } }, x))),
    h('h4', 'This app'),
    appSection(),
  ].flat()));
}

/** Version, update and install controls (shown in the About sheet). */
function appSection() {
  const box = h('div.appbox');
  const paint = () => {
    const rows = [];
    rows.push(h('div.sw-row', h('span', 'Version'), h('code', (CFG.env === 'prod' ? '' : CFG.env + ' · ') + CFG.build + ' · p' + PROTO)));
    if (pwa.ready) rows.push(h('div.sw-row', h('span', '✨ A new version is ready'), h('button.btn.primary.small', { onclick: () => pwa.applyUpdate?.(true) }, 'Update now')));
    else if (pwa.supported && CFG.env !== 'local') rows.push(h('div.sw-row', h('span', 'You’re on the latest version'), h('button.btn.tonal.small', { onclick: async (e) => { e.target.textContent = 'Checking…'; const r = await pwa.checkNow?.(); e.target.textContent = r ? 'Update found!' : 'Up to date ✓'; } }, 'Check for updates')));
    if (!pwa.standalone) {
      if (pwa.installEvent) rows.push(h('div.sw-row', h('span', 'Install it like an app'), h('button.btn.primary.small', { onclick: () => promptInstall() }, icon('download'), 'Install')));
      else if (isIOS()) rows.push(h('div.sw-row.col', h('span', 'Install on iPhone / iPad'), h('small.muted', 'Open this page in Safari, tap the Share button, then “Add to Home Screen”.')));
      else rows.push(h('div.sw-row.col', h('span', 'Install as an app'), h('small.muted', 'Use your browser menu → “Install app” / “Add to Home screen”.')));
    }
    mount(box, ...rows);
  };
  paint();
  const off = onPwaChange(() => { if (box.isConnected) paint(); else off(); });
  return box;
}

// ------------------------------------------------------------------ header / app bar
function renderHeader() {
  const room = S.room;
  document.body.dataset.tab = room ? 'room' : S.tab;
  if (S.comms) { S.comms.hidden = !!room || (S.tab === 'lounge' && S.mode === 'none'); S.mini?.paint(); }
  document.getElementById('app')?.classList.toggle('inroom', !!room);
  if (!room) {
    mount(S.headerEl,
      iconBtn('menu', 'Menu', () => S.chrome.openDrawer(), 'hide-wide'),
      h('a.logo', { href: '#/', 'aria-label': 'Home' }, logoMark()),
      CFG.env === 'nightly' ? h('span.chantag', { title: 'You are on the Nightly version' }, icon('bolt', 'sm'), 'Nightly') : null,
      joinPill(),
      h('div.spacer'),
      ...(S.comms?.loungeAV ? S.commsBtns.buttons : []),
      iconBtn(resolvedThemeIcon(), 'Theme', (e) => openThemePopover(e.currentTarget)),
      h('button.profilechip', { onclick: editProfile, title: 'Edit your name & avatar' }, avatarEl({ avatar: S.profile.avatar }, 'sm'), h('span.n', S.profile.name))
    );
    return;
  }
  const st = room.state;
  const def = GAME_BY_ID[st.game?.gameId || st.gameId];
  const inGame = S.mode === 'game' || S.mode === 'wait';
  const ids = st.game ? st.game.playerIds : st.players.map((p) => p.id);
  mount(S.headerEl,
    iconBtn('arrow_back', 'Leave room', () => requestLeave()),
    h('div.tb-title', h('b', inGame && def ? def.name : room.local ? 'Solo' : 'Lobby'), room.isAudience ? h('span.codechip.static', icon('visibility', 'sm'), 'Room ' + room.number) : room.match ? h('span.codechip.static', icon('sms', 'sm'), room.match.mode === 'cpu' ? 'vs computer' : room.match.mode === 'local' ? 'Pass & play' : 'By message') : room.local ? h('span.codechip.static', icon('smart_toy', 'sm'), 'vs computer') : h('button.codechip', { onclick: copyInvite, title: 'Copy invite link' }, 'Room ' + room.number, icon('content_copy'))),
    h('div.tb-players', ids.map((id) => room.player(id)).filter(Boolean).slice(0, 10).map((p) => avatarEl(p, 'sm', { still: true }))),
    h('div.spacer'),
    S.rec?.active ? h('button.recpill', { onclick: () => openRecordings(S.rec, { toast }), title: 'Recording — tap to save a clip' }, icon('fiber_manual_record', 'sm'), 'REC') : null,
    ...S.commsBtns.buttons,
    S.peopleBtn ? (S.peopleBtn.querySelector('.dot')?.remove(), room.requests.length ? S.peopleBtn.append(h('span.dot', room.requests.length)) : null, S.peopleBtn) : null,
    S.chatBtn,
    iconBtn('help_outline', 'Rules & how to play', () => openRules(currentDef()), 'hide-narrow'),
    iconBtn('more_vert', 'More', (e) => openRoomMenu(e.currentTarget))
  );
  updateChatBadge();
}

const resolvedThemeIcon = () => THEMES.find((t) => t[0] === getThemePref())[2];
function openThemePopover(anchor) {
  const seg = segmented(THEMES.map(([v, label, ic]) => ({ value: v, label, icon: ic })), getThemePref(), (v) => { setThemePref(v); renderHeader(); });
  openPopover(anchor, h('div', h('h4', 'Theme'), seg), { align: 'right', width: 290 });
}

/** The small "room number / link" box in the app bar (built once so typing survives header repaints). */
function joinPill() {
  if (S.joinEl) return S.joinEl;
  const input = h('input', { placeholder: 'Room # or link', autocomplete: 'off', inputmode: 'text', enterkeyhint: 'go', 'aria-label': 'Room number or invite link' });
  const el = h('div.joinpill', icon('login'), input, h('button.go', { type: 'button', 'aria-label': 'Join room', onclick: () => go() }, icon('arrow_forward')));
  const go = () => {
    const n = parseRoomInput(input.value);
    if (!n) return toast('Type a room number (like 3) or paste an invite link', 'bad');
    input.value = ''; el.classList.remove('has'); input.blur();
    location.hash = '#/room/' + n;
  };
  input.addEventListener('input', () => el.classList.toggle('has', !!input.value.trim()));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  input.addEventListener('paste', () => setTimeout(() => { if (parseRoomInput(input.value) && /room\/\d/.test(input.value)) go(); }, 0));
  S.joinEl = el; S.joinInput = input;
  return el;
}

function openRoomMenu(anchor) {
  const room = S.room;
  const st = room.state;
  openMenu(anchor, [
    room.match && room.match.mode === 'link' ? { icon: 'sms', label: 'Send my move again', onClick: () => { if (room.match.snap) matchBar(room.match); else toast('Make a move first'); } } : null,
    !room.local && room.isHost && currentDef()?.async && S.session?.lastSave ? { icon: 'sms', label: 'Continue by message…', onClick: convertToMatch } : null,
    room.local ? null : { icon: 'link', label: 'Copy invite link', onClick: copyInvite },
    { icon: 'person', label: 'Edit name & avatar', onClick: editProfile },
    { icon: isMuted() ? 'volume_off' : 'volume_up', label: isMuted() ? 'Turn sound on' : 'Turn sound off', onClick: () => { setMuted(!isMuted()); toast(isMuted() ? 'Sound off' : 'Sound on'); } },
    { icon: 'menu_book', label: 'Rules & how to play', onClick: () => openRules(currentDef()) },
    room.local ? null : { icon: 'headset', label: 'Voice, video & chat…', onClick: openComms },
    S.rec?.active ? { icon: 'save_alt', label: `Save last ${S.rec.settings.minutes} min as a clip`, onClick: async () => { try { const r = await S.rec.save(); toast(r.stitched ? 'Stitched onto your earlier clip ✓' : 'Clip saved ✓', 'good'); } catch (e) { toast(e.message, 'bad'); } } } : { icon: 'fiber_manual_record', label: 'Record…', onClick: () => openRecordings(S.rec, { toast }) },
    room.local ? null : { icon: 'tune', label: 'Room settings & invite', onClick: () => openPanel('room') },
    room.isHost && st.phase !== 'lobby' ? { icon: 'stop', label: 'End game → back to lobby', onClick: async () => { if (await confirmDialog('End this game?', 'Everyone goes back to the lobby.', { ok: 'End game', danger: true })) room.toLobby(); } } : null,
    '-',
    { icon: 'logout', label: 'Leave room', danger: true, onClick: () => requestLeave() },
  ].filter(Boolean));
}

async function copyInvite() {
  if (!S.room) return;
  const ok = await copyText(roomLink(S.room.number));
  toast(ok ? 'Invite link copied!' : 'Copy failed — select the link manually', ok ? 'good' : 'bad');
}

// ------------------------------------------------------------------ home
const fitsPlayers = (def, n, withBots) => n == null || (n >= def.min && n <= def.max) || (withBots && !!def.bots && n >= 1 && n <= def.max) || (!!def.solo && n === 1);
const saveFavs = () => writePref('gn.favs', JSON.stringify([...S.favs]));
const RECENT = '🕘 Recent';
/** Remember that this game was just played (shown first under the Recent filter). */
function touchRecent(id) {
  S.recent = [id, ...S.recent.filter((x) => x !== id)].slice(0, 12);
  writePref('gn.recent', JSON.stringify(S.recent));
}

function gameCard(def, onPick) {
  const fav = h('button.fav' + (S.favs.has(def.id) ? '.on' : ''), {
    'aria-label': (S.favs.has(def.id) ? 'Remove from' : 'Add to') + ' favourites', title: 'Favourite',
    onclick: (e) => { e.stopPropagation(); if (S.favs.has(def.id)) S.favs.delete(def.id); else S.favs.add(def.id); saveFavs(); fav.classList.toggle('on', S.favs.has(def.id)); fav.replaceChildren(icon(S.favs.has(def.id) ? 'star' : 'star_border')); },
  }, icon(S.favs.has(def.id) ? 'star' : 'star_border'));
  return h('div.gcard', { role: 'button', tabindex: 0, style: { '--gc': def.color }, onclick: () => onPick(def), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(def); } } }, [
    fav,
    h('div.tile.emo', def.emoji),
    h('h3', def.name),
    h('p', def.tagline),
    h('div.meta', [h('span.chip', icon('group'), def.min === def.max ? def.min : `${def.min}–${def.max}`), def.bots ? h('span.chip.green', icon('smart_toy', 'sm'), 'vs computer') : def.solo ? h('span.chip.green', icon('person', 'sm'), 'solo') : h('span.chip', def.cat), def.async ? h('span.chip.purple', icon('sms', 'sm')) : null]),
  ]);
}

/** Search + player-count filter + category chips + the game grid. `opts` lets the same UI serve as a picker. */
function gameBrowser({ onPick, only = null, fixedPlayers, compact = false }) {
  const grid = h('div.grid' + (compact ? '.picker' : ''));
  const chips = h('div.filters');
  const info = h('div.filterinfo');
  const local = { query: compact ? '' : S.query, players: fixedPlayers !== undefined ? fixedPlayers : S.players, filter: compact ? 'All' : S.filter };
  const search = h('input', { placeholder: `Search ${GAMES.length} games`, value: local.query, 'aria-label': 'Search games', oninput: (e) => { local.query = e.target.value; if (!compact) S.query = local.query; paint(); } });
  const clear = h('button.iconbtn.sm.hide', { type: 'button', 'aria-label': 'Clear search', onclick: () => { search.value = ''; local.query = ''; if (!compact) S.query = ''; paint(); search.focus(); } }, icon('close'));
  const pf = h('button.pfilter', { type: 'button', 'aria-label': 'Filter by number of players', onclick: () => openPlayersPopover() });
  const setPlayers = (n) => { local.players = n; if (!compact) S.players = n; paint(); };
  function openPlayersPopover() {
    let close;
    const chip = (n) => h('button.numchip' + (local.players === n ? '.on' : ''), { onclick: () => { setPlayers(n); close(); } }, n);
    const box = h('div', h('h4', 'How many players?'),
      h('div.numgrid', h('button.numchip.any' + (local.players == null ? '.on' : ''), { onclick: () => { setPlayers(null); close(); } }, 'Any'), ...Array.from({ length: 12 }, (_, i) => chip(i + 1))),
      h('div.sw-row', h('span', 'Include games with computer players'), switchEl(S.withBots, (v) => { S.withBots = v; writePref('gn.withBots', v ? '1' : '0'); paint(); })),
      h('div.muted', { style: 'font-size:12.5px;margin-top:8px;line-height:1.4' }, 'Shows only the games that work with exactly this many people. 1 = games you can play alone.'));
    close = openPopover(pf, box, { align: 'right', width: 300 });
  }
  function paint() {
    const q = local.query.trim().toLowerCase();
    const cats = ['All', ...(S.recent.some((id) => GAME_BY_ID[id]) ? [RECENT] : []), ...(S.favs.size && !compact ? ['★ Favourites'] : []), ...CATEGORIES];
    if (!cats.includes(local.filter)) local.filter = 'All';
    mount(chips, cats.map((c) => h('button.fchip' + (c === local.filter ? '.on' : ''), { onclick: () => { local.filter = c; if (!compact) S.filter = c; paint(); } }, c)));
    const list = GAMES.filter((g) => (!only || only(g)) && fitsPlayers(g, local.players, S.withBots)
      && (local.filter === 'All' || (local.filter === RECENT ? S.recent.includes(g.id) : local.filter === '★ Favourites' ? S.favs.has(g.id) : g.cat === local.filter))
      && (!q || (g.name + ' ' + g.tagline + ' ' + (g.tags || []).join(' ') + ' ' + g.cat).toLowerCase().includes(q)));
    if (local.filter === RECENT) list.sort((a, b) => S.recent.indexOf(a.id) - S.recent.indexOf(b.id));
    mount(grid, list.length ? list.map((g) => gameCard(g, onPick)) : h('div.empty', local.players != null ? `No games for ${local.players} player${local.players === 1 ? '' : 's'}${S.withBots ? '' : ' (computer players off)'} — try another number.` : 'No games match — try another search.'));
    clear.classList.toggle('hide', !local.query);
    pf.classList.toggle('on', local.players != null);
    mount(pf, icon('group'), local.players == null ? 'Players' : String(local.players));
    mount(info, local.players != null ? [h('span', `${list.length} game${list.length === 1 ? '' : 's'} for ${local.players} player${local.players === 1 ? '' : 's'}`), h('button.btn.small.ghost', { onclick: () => setPlayers(null) }, 'Clear')] : []);
    info.classList.toggle('hide', local.players == null);
  }
  paint();
  return { el: h('div', h('div.searchrow', h('div.searchbox', icon('search'), search, clear, pf)), chips, info, grid), list: () => GAMES.filter((g) => (!only || only(g)) && fitsPlayers(g, local.players, S.withBots)), setPlayers, paint };
}

function renderGamesTab() {
  S.mode = 'none';
  S.tab = 'games';
  setTitle('Game Night — play with friends');
  renderHeader();
  S.chrome.setActive('games');
  const browser = gameBrowser({ onPick: openGameSheet });
  mount(S.view, h('div.home', [browser.el, installChip(), h('div.footnote', 'Rooms are peer-to-peer: nothing is stored on a server. Retro Console uses jsnes and free homebrew by Damian Yerrick.')]));
  S.chrome.setFab([
    { label: 'Create a room', icon: 'add_circle', onClick: () => pickGame({ title: 'Create a room', onPick: (d) => createRoom(d.id) }) },
    { label: 'Quick play', icon: 'casino', onClick: () => { const l = browser.list(); if (!l.length) return toast('No games match your filter'); const d = pick(l); toast('How about ' + d.name + '?'); openGameSheet(d); } },
    { label: 'Join with a code', icon: 'login', onClick: () => { S.joinInput?.focus(); } },
  ]);
}
const renderHome = renderGamesTab;

/** A bottom-sheet game chooser (create room, solo, turn-by-turn, or the host changing game in a lobby). */
function pickGame({ title, only, players, onPick }) {
  let sheet;
  const b = gameBrowser({ onPick: (d) => { sheet.close(); onPick(d); }, only, fixedPlayers: players, compact: true });
  sheet = openSheet(h('div.col', [h('h2', title), b.el]), { wide: true });
}

/** A small "Install app" pill on the home screen when the browser can install us (Android/desktop Chrome, or iOS how-to). */
function installChip() {
  const el = h('div.installchip');
  const paint = () => {
    if (pwa.standalone || CFG.env === 'local') { mount(el); return; }
    if (pwa.installEvent) mount(el, h('button.btn.tonal', { onclick: () => promptInstall() }, icon('download'), 'Install app'));
    else if (isIOS()) mount(el, h('button.btn.tonal', { onclick: openAbout }, icon('download'), 'Add to Home Screen'));
    else mount(el);
  };
  paint();
  const off = onPwaChange(() => { if (el.isConnected) paint(); else off(); });
  return el;
}

function openGameSheet(def) {
  const help = def.help || {};
  const sheet = openSheet(h('div.help', { style: { '--gc': def.color } }, [
    h('h2', def.name),
    h('div.hd', [h('div.tile.emo', def.emoji), h('div', [h('div.muted', { style: 'margin-bottom:6px' }, def.tagline), h('div.row.wrap', { style: 'gap:6px' }, [h('span.chip.blue', icon('group'), playersLabel(def)), h('span.chip', def.cat), ...(def.tags || []).slice(0, 2).map((t) => h('span.chip', t))])])]),
    h('div.goal', help.goal || def.desc),
    h('h4', 'How to play'),
    h('ol', (help.steps || def.howto).map((x) => h('li', x))),
    help.controls && help.controls.length ? [h('h4', 'Controls'), h('div.keys', help.controls.map((c) => h('span', h('kbd', c[0]), ' ' + c[1])))] : null,
    h('div.sticky', [
      h('button.btn.primary.big.block', { onclick: () => { sheet.close(); createRoom(def.id); } }, icon('add'), 'Create a room'),
      def.bots || def.solo || def.async ? h('div.row.wrap', { style: 'justify-content:center;margin-top:10px;gap:8px' }, [
        def.bots || def.solo ? h('button.btn.tonal', { onclick: () => { sheet.close(); startSolo(def); } }, icon('smart_toy'), def.bots ? 'Play vs computer' : 'Play alone') : null,
        def.async ? h('button.btn.tonal', { onclick: () => { sheet.close(); startMatch(def); } }, icon('sms'), 'Turn by turn') : null,
      ]) : null,
    ]),
  ].flat().filter(Boolean)));
}

/** Setup sheet for playing against the computer, then an offline local room that starts immediately. */
function startSolo(def) {
  if (S.room || S.joining) return;
  const minBots = Math.max(0, def.min - 1), maxBots = Math.max(minBots, def.max - 1);
  const cfg = { bots: def.bots ? Math.max(minBots, Math.min(maxBots, def.soloBots !== undefined ? def.soloBots : Math.max(1, minBots))) : 0, level: 'normal', opts: fillOpts(def, {}) };
  const body = h('div.col', { style: 'gap:14px' });
  const paint = () => mount(body,
    h('div.gsel', { style: { '--gc': def.color } }, [h('div.tile.emo', def.emoji), h('div.grow', [h('h2', def.name), h('div.muted', def.bots ? 'You vs the computer — works offline' : 'Just you — works offline')])]),
    def.bots && (maxBots > minBots || minBots === 0) ? h('label.opt', 'Computer opponents', h('div.numgrid', { style: 'grid-template-columns:repeat(auto-fill,minmax(44px,1fr))' }, Array.from({ length: maxBots - minBots + 1 }, (_, i) => minBots + i).map((n) => h('button.numchip' + (cfg.bots === n ? '.on' : ''), { onclick: () => { cfg.bots = n; paint(); } }, n)))) : null,
    !def.bots || def.botLevels === false ? null : h('label.opt', 'Difficulty', segmented(LEVELS, cfg.level, (v) => { cfg.level = v; })),
    ...(def.options || []).map((op) => {
      const choices = op.choices.map((c) => (typeof c === 'object' ? c : { value: c, label: String(c) }));
      return h('label.opt', op.label, h('select.txt', { onchange: (e) => { cfg.opts[op.key] = choices.find((x) => String(x.value) === e.target.value).value; } }, choices.map((c) => h('option', { value: c.value, selected: String(c.value) === String(cfg.opts[op.key]) }, c.label))));
    }),
    h('button.btn.primary.big.block', { onclick: () => { sheet.close(); launchSolo(def, cfg); } }, icon('play_arrow'), 'Start'));
  paint();
  const sheet = openSheet(body);
}

function launchSolo(def, cfg) {
  const room = new LocalRoom(S.profile, { autopilot: new URLSearchParams(location.search).has('autopilot') });
  room.setBotLevel(cfg.level);
  for (let i = 0; i < cfg.bots; i++) room.addBot(cfg.level);
  room.setGame(def.id);
  enterRoom(room);
  history.replaceState(null, '', '#/solo');
  def.load().then(() => {
    if (S.room !== room) return;
    const ids = room.state.players.map((p) => p.id);
    if (ids.length < Math.min(def.min, def.solo ? 1 : def.min) || ids.length > def.max) { toast('Wrong number of players for this game', 'bad'); return; }
    sfx('good');
    room.startGame(def.id, cfg.opts, ids);
  }).catch((e) => toast('Failed to load the game: ' + e.message, 'bad'));
}
// ------------------------------------------------------------------ turn-by-turn matches
const refreshBadges = () => S.chrome?.setBadge('matches', myTurnCount());
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const otherOf = (m) => m.players.find((p) => p.id !== m.mine) || m.players[1];

/** Setup sheet: who are you playing, and by what means? */
function startMatch(def) {
  if (S.room || S.joining) return;
  const cfg = { mode: 'link', level: 'normal', name: '', opts: fillOpts(def, {}) };
  const body = h('div.col', { style: 'gap:14px' });
  const MODES = [['link', 'sms', 'A friend, by message', 'Play whenever you like — each move is sent as a link by text.'], ['cpu', 'smart_toy', 'The computer', 'Offline; pick up where you left off any time.'], ['local', 'groups', 'Pass & play', 'Two people, one phone — hand it over after each move.']];
  const paint = () => mount(body,
    h('div.gsel', { style: { '--gc': def.color } }, [h('div.tile.emo', def.emoji), h('div.grow', [h('h2', def.name), h('div.muted', 'Turn by turn')])]),
    h('div.mcards', MODES.map(([v, ic, t, d]) => h('button.mcard' + (cfg.mode === v ? '.on' : ''), { onclick: () => { cfg.mode = v; paint(); } }, icon(ic), h('div', h('b', t), h('small', d))))),
    cfg.mode === 'cpu' ? h('label.opt', 'Difficulty', segmented(LEVELS, cfg.level, (v) => { cfg.level = v; })) : h('label.opt', cfg.mode === 'local' ? 'Second player’s name' : 'Your friend’s name (optional)', h('input.txt', { placeholder: cfg.mode === 'local' ? 'Player 2' : 'Friend', maxlength: 16, value: cfg.name, oninput: (e) => { cfg.name = e.target.value; } })),
    ...(def.options || []).filter((op) => cfg.mode !== 'link' || op.key !== 'time').map((op) => {
      const choices = op.choices.map((c) => (typeof c === 'object' ? c : { value: c, label: String(c) }));
      return h('label.opt', op.label, h('select.txt', { onchange: (e) => { cfg.opts[op.key] = choices.find((x) => String(x.value) === e.target.value).value; } }, choices.map((c) => h('option', { value: c.value, selected: String(c.value) === String(cfg.opts[op.key]) }, c.label))));
    }),
    h('button.btn.primary.big.block', { onclick: () => { sheet.close(); createMatch(def, cfg); } }, icon('play_arrow'), 'Start'));
  paint();
  const sheet = openSheet(body);
}
function createMatch(def, cfg) {
  const me = { id: 'p1', name: S.profile.name, avatar: S.profile.avatar };
  const other = cfg.mode === 'cpu' ? { ...makeBot([me], 'p2', cfg.level), id: 'p2' } : { id: 'p2', name: cfg.name.trim() || (cfg.mode === 'local' ? 'Player 2' : 'Friend'), avatar: randomAvatar() };
  const m = { id: newMatchId(), game: def.id, opts: cfg.opts, seed: ((Math.random() * 2 ** 32) >>> 1) << 1 >>> 0, created: Date.now(), players: [me, other], snap: null, turn: null, over: false, summary: '', moves: 0, mode: cfg.mode, mine: 'p1', level: cfg.level };
  putMatch(m);
  openMatch(m, 'p1');
}

/** Enter (or re-enter) a match as `meId`: an offline room with the game resumed from the saved position. */
async function openMatch(m, meId = m.mine) {
  const def = GAME_BY_ID[m.game];
  if (!def?.async) return toast('That game isn’t available in this version.', 'bad');
  if (S.room) teardownRoom();
  S.joining = true;
  try { await def.load(); } catch (e) { S.joining = false; return toast('Failed to load the game: ' + e.message, 'bad'); }
  S.joining = false;
  m.mine = meId;
  const room = new LocalRoom(S.profile, { players: m.players, me: meId, autopilot: new URLSearchParams(location.search).get('autopilot') === 'me' ? 'me' : false });
  room.match = m;
  if (m.mode === 'cpu') room.setBotLevel(m.level || 'normal');
  S.match = m;
  enterRoom(room);
  history.replaceState(null, '', '#/solo');
  room.startGame(def.id, m.opts, m.players.map((p) => p.id), { seed: m.seed, restore: m.snap || undefined, async: m.mode !== 'cpu' });
  putMatch(m);
  if (m.mode === 'link' && !m.over && m.snap && m.turn === meId) toast(`Your turn vs ${otherOf(m).name}!`, 'good');
  if (m.mode === 'link') setTimeout(() => { if (S.match === m && S.ui) matchBar(m); }, 400);
}

/** Called by the running game after every move: remember it, then offer to send it. */
function onGameSave(snap, meta) {
  const m = S.match;
  if (!m || !S.room?.match) return;
  Object.assign(m, { snap: JSON.parse(JSON.stringify(snap)), turn: meta.turn || null, over: !!meta.over, summary: meta.summary || '', moves: meta.moves || m.moves + 1 });
  putMatch(m);
  refreshBadges();
  if (m.mode === 'link') offerShare(m, true);
  else if (m.mode === 'local' && !m.over) setTimeout(() => { if (S.match === m && S.ui) passDevice(m); }, 900);
}

/** The "send your move" strip at the bottom of a message match. */
async function matchBar(m, note) {
  if (!S.ui || S.match !== m) return;
  S.ui.matchBar?.remove();
  const def = GAME_BY_ID[m.game], me = m.players.find((p) => p.id === m.mine);
  const token = await encodeMatch(m);
  const link = matchLink(token);
  const them = otherOf(m);
  const mineToMove = !m.over && m.turn === m.mine;
  const text = shareText(m, def, link, me.name);
  const bar = h('div.matchbar' + (mineToMove ? '.mine' : ''),
    h('div.mt', note || (m.over ? `Game over — ${m.summary}` : mineToMove ? `Your move vs ${them.name}` : m.snap ? `Move saved ✓ — send it so ${them.name} can play` : `Make the first move, then send it to ${them.name}`)),
    !mineToMove && m.snap ? h('div.row', { style: 'gap:6px;flex-wrap:wrap' },
      navigator.share ? h('button.btn.small.primary', { onclick: async () => { await nativeShare(m, def, link, me.name); } }, icon('share'), 'Send') : null,
      h('a.btn.small.tonal', { href: smsUrl(text) }, icon('sms'), 'Text'),
      h('button.btn.small.tonal', { onclick: async () => { toast((await copyText(text)) ? 'Copied — paste it anywhere' : 'Copy failed', 'good'); } }, icon('content_copy'), 'Copy')) : null,
    h('button.iconbtn.sm', { 'aria-label': 'Hide', onclick: () => bar.remove() }, icon('close')));
  S.ui.matchBar = bar;
  S.ui.roommain.insertBefore(bar, S.ui.bar);
}
async function offerShare(m, auto) {
  await matchBar(m);
  if (!auto || readPref('gn.autoShare') === '0' || !navigator.share) return;
  const def = GAME_BY_ID[m.game], me = m.players.find((p) => p.id === m.mine);
  const link = matchLink(await encodeMatch(m));
  const r = await nativeShare(m, def, link, me.name); // works straight after a tap; otherwise the bar's Send button is one tap away
  if (r === true) toast('Sent! 🎉', 'good');
}
function passDevice(m) {
  const next = m.players.find((p) => p.id === m.turn);
  if (!next || !S.ui) return;
  const back = h('div.passback', h('div.passcard', avatarEl(next, 'xl'), h('h2', `Pass the phone to ${next.name}`), h('div.muted', 'No peeking at the board 😉'), h('button.btn.primary.big', { onclick: () => { back.remove(); openMatch(m, next.id); } }, `I’m ${next.name}`)));
  S.ui.stage.append(back);
  sfx('good');
}
/** Turn a live game (host only) into a message match so everyone can carry on at their own pace. */
async function convertToMatch() {
  const room = S.room, ss = S.session;
  const def = currentDef(), g = room?.state.game;
  if (!ss?.lastSave || !def?.async || !g || g.playerIds.length !== 2) return toast('Make a move first, then you can continue by message.');
  const ps = g.playerIds.map((id, i) => ({ id: 'p' + (i + 1), name: room.player(id).name, avatar: room.player(id).avatar }));
  const turnIdx = ss.lastSave.meta.turn ? g.playerIds.indexOf(ss.lastSave.meta.turn) : -1;
  const m = { id: newMatchId(), game: def.id, opts: g.opts, seed: g.seed, created: Date.now(), players: ps, snap: JSON.parse(JSON.stringify(ss.lastSave.snapshot)), turn: turnIdx >= 0 ? 'p' + (turnIdx + 1) : null, over: !!ss.lastSave.meta.over, summary: ss.lastSave.meta.summary || '', moves: ss.lastSave.meta.moves || 1, mode: 'link', mine: 'p' + (g.playerIds.indexOf(room.me) + 1), level: 'normal' };
  if (!(await confirmDialog('Continue by message?', 'The live game ends and the position is saved as a turn-by-turn match you can send to your opponent.', { ok: 'Save as match' }))) return;
  putMatch(m);
  teardownRoom();
  openMatch(m, m.mine);
}

function renderMatchesTab() {
  S.mode = 'none'; S.tab = 'matches';
  setTitle('Matches — Game Night');
  renderHeader();
  S.chrome.setActive('matches');
  refreshBadges();
  const all = listMatches().filter((m) => GAME_BY_ID[m.game]);
  const mineMove = (m) => !m.over && m.turn === m.mine;
  const groups = [
    ['Your turn', all.filter((m) => m.mode !== 'local' && mineMove(m))],
    ['Waiting for them', all.filter((m) => m.mode === 'link' && !m.over && !mineMove(m))],
    ['Pass & play', all.filter((m) => m.mode === 'local' && !m.over)],
    ['Finished', all.filter((m) => m.over)],
  ].filter(([, l]) => l.length);
  const card = (m) => {
    const def = GAME_BY_ID[m.game], them = otherOf(m);
    const status = m.over ? h('span.chip', icon('check', 'sm'), m.summary || 'Finished') : m.mode === 'local' ? h('span.chip', 'Pass & play') : mineMove(m) ? h('span.chip.green', icon('play_arrow', 'sm'), 'Your move') : m.mode === 'cpu' ? h('span.chip', 'Computer’s move') : h('span.chip.yellow', icon('hourglass_empty', 'sm'), 'Waiting for ' + them.name);
    return h('div.mrow', { style: { '--gc': def.color } },
      h('button.mmain', { onclick: () => openMatch(m, m.mine) }, h('div.tile.emo', def.emoji), h('div.grow', h('b', def.name), h('div.muted', { style: 'font-size:13px' }, `${m.mode === 'local' ? m.players.map((p) => p.name).join(' vs ') : 'vs ' + them.name} · ${ago(m.updated)}`), status)),
      h('div.mact',
        m.mode === 'link' && m.snap ? iconBtn('share', 'Send again', async () => { const me = m.players.find((p) => p.id === m.mine); const link = matchLink(await encodeMatch(m)); if (!(await nativeShare(m, def, link, me.name))) { await copyText(shareText(m, def, link, me.name)); toast('Link copied', 'good'); } }, 'sm') : null,
        iconBtn('delete', 'Delete match', async () => { if (await confirmDialog('Delete this match?', 'It’s only removed from this device.', { ok: 'Delete', danger: true })) { deleteMatch(m.id); renderMatchesTab(); } }, 'sm')));
  };
  mount(S.view, h('div.home',
    all.length ? groups.map(([t, l]) => h('div.msec', h('div.kt-title', t), h('div.mlist', l.map(card)))) : h('div.empty', h('div', { style: 'font-size:54px' }, '💬'), h('p', 'No matches yet. Start one with the + button — then text your move to a friend.'))));
  S.chrome.setFab([
    { label: 'New match', icon: 'add_circle', onClick: () => pickGame({ title: 'Turn-by-turn match', only: (g) => g.async, onPick: (d) => startMatch(d) }) },
  ]);
}

/** Opening a match link someone sent you. */
async function importMatch(token) {
  let inc;
  try { inc = await decodeMatch(token); } catch (e) { toast('That match link looks broken.', 'bad'); history.replaceState(null, '', '#/matches'); return renderMatchesTab(); }
  const have = getMatch(inc.id);
  const m = have && have.moves >= inc.moves ? have : { ...inc, mode: 'link', mine: have?.mine || (inc.turn && !inc.over ? inc.turn : 'p2'), level: 'normal' };
  if (have && m !== have) m.mine = have.mine;
  if (!GAME_BY_ID[m.game]?.async) { toast('This match needs a newer version — reload the page.', 'bad'); history.replaceState(null, '', '#/'); return renderGamesTab(); }
  const seat = m.players.find((p) => p.id === m.mine); // whoever opens the link is the person it was sent to: put their real name and face in that seat
  if (seat) { seat.name = S.profile.name; seat.avatar = S.profile.avatar; }
  putMatch(m);
  refreshBadges();
  openMatch(m, m.mine);
}

// ------------------------------------------------------------------ connecting
function showBusy(text, { sub = 'Connecting peer-to-peer…', cancel } = {}) {
  S.mode = 'none';
  mount(S.view, h('div.waitscreen', h('div', [h('div.spinner'), h('h3', { style: 'font-size:20px' }, text), h('p.muted', { style: 'margin-top:6px' }, sub), cancel ? h('button.btn.tonal', { style: 'margin-top:18px', onclick: cancel }, 'Cancel') : null])));
}

async function createRoom(gameId) {
  if (S.room || S.joining) return;
  S.joining = true;
  try {
    const prof = await askProfile({ title: 'Create a room', sub: 'Pick a name and look — your friends will see them.', confirm: 'Create room' });
    if (!prof) return;
    showBusy('Finding a free room…');
    const room = await Room.create(S.profile);
    if (gameId) room.setGame(gameId);
    enterRoom(room);
    history.replaceState(null, '', '#/room/' + room.number);
  } catch (e) {
    toast(friendlyError(e), 'bad');
    renderHome();
  } finally {
    S.joining = false;
  }
}

/** `role`: 'player' | 'audience'. `via`: 'code' (typed it / invite link) or 'dir' (picked from the room list, where the host may want to approve you). */
async function joinRoom(n, { role = 'player', via = 'code' } = {}) {
  if (S.room || S.joining) return;
  S.joining = true;
  let cancelled = false;
  const ref = {};
  try {
    const watch = role === 'audience';
    const prof = await askProfile({ title: watch ? `Watch room ${n}` : `Join room ${n}`, sub: watch ? 'You’ll see the game and the chat, without playing.' : 'Pick a name and a look — you can change them any time.', confirm: watch ? 'Watch' : 'Join room' });
    if (!prof) { history.replaceState(null, '', '#/'); renderHome(); return; }
    plaza.setProfile(prof);
    const cancel = () => { cancelled = true; ref.cancel?.(); };
    showBusy(watch ? `Opening room ${n}…` : `Joining room ${n}…`, { cancel });
    const room = await Room.join(n, S.profile, { role, via, ref, onPending: () => showBusy('Waiting for the host…', { sub: `Room ${n}’s host has been asked to let you in.`, cancel }) });
    if (cancelled) { room.leave(); return; }
    enterRoom(room);
    history.replaceState(null, '', '#/room/' + n + (watch ? '/watch' : ''));
  } catch (e) {
    if (!cancelled) toast(friendlyError(e), 'bad');
    history.replaceState(null, '', '#/');
    renderHome();
  } finally {
    S.joining = false;
  }
}

function friendlyError(e) {
  if (e.code === 'denied:version' && e.hostNewer) pwa.checkNow?.(); // we're the old one: fetch the new version now
  if (e.code === 'network') return 'Could not reach the matchmaking server. Check your internet connection.';
  if (e.code === 'notfound') return e.message + (channelInfo().canSwitch ? ` Friends on ${channelLabel(otherChannel())}? Rooms are separate — switch in the menu.` : '');
  if (e.code === 'timeout') return e.message + '. Is the host still there?';
  return e.message || 'Something went wrong';
}

// ------------------------------------------------------------------ room shell + chat
function enterRoom(room) {
  S.room = room;
  keepAwake();
  S.mode = 'none';
  S.unread = 0;
  S.unreadG = 0;
  S.sheetOpen = false;
  S.resultsFor = 0;
  S.chat = createChat(room);
  S.panel = room.local ? null : createRoomPanel({ room, chatEl: S.chat.el, plaza, toast, copyInvite, onRecord: () => openRecordings(S.rec, { toast }), openComms });
  S.paneEl = S.panel ? S.panel.el : S.chat.el;
  S.panel?.onChange(() => updateChatBadge());
  const ui = (S.ui = {
    stage: h('div.stage'),
    roommain: null,
    matchBar: null,
    lobby: null,
    float: h('div.chatfloat'),
    side: h('aside.chatside'),
    sheet: h('div.chatsheet'),
    sheetBack: h('div.sheetback', { onclick: () => toggleSheet(false) }),
  });
  S.chatBtn = iconBtn('chat_bubble', 'Chat & people', () => openPanel(room.isHost && room.requests.length ? 'people' : 'chat'), 'chat-btn');
  S.chatBtn.classList.add('hide-wide');
  S.peopleBtn = room.local ? null : iconBtn('group', 'People & room', () => openPanel('people'), 'people-btn hide-narrow');
  ui.barInput = h('input.txt', { placeholder: S.comms.scope.chat === 'global' ? 'Say something to everyone…' : 'Say something…', maxlength: 300, autocomplete: 'off', enterkeyhint: 'send' });
  ui.bar = h('form.chatbar', {
    onsubmit: (e) => {
      e.preventDefault();
      const t = ui.barInput.value.trim();
      if (t) { if (S.comms.scope.chat === 'global') plaza.sendChat(t); else room.sendChat(t); }
      ui.barInput.value = '';
    },
  }, ui.barInput, h('button.chatsend', { type: 'submit', 'aria-label': 'Send' }, icon('send')));
  S.av = S.comms.attachRoom(room); // null for offline rooms
  S.avUI = S.av ? createAvUI(room, S.av, { toast }) : { dock: h('div.hide'), destroy() {} };
  S.dockStack = h('div.avstack');
  mount(S.dockStack, S.avUI.dock, S.loungeUI ? S.loungeUI.dock : null);
  document.body.append(ui.sheetBack, ui.sheet);
  ui.roommain = h('div.roommain', ui.stage, ui.float, ui.bar);
  mount(S.view, h('div.roomwrap', ui.roommain, S.dockStack, ui.side));
  const onMQ = () => applyChatLayout();
  wideMQ.addEventListener('change', onMQ);
  S.offs = [
    () => wideMQ.removeEventListener('change', onMQ),
    room.on('state', onState),
    room.on('chat', onChatMsg),
    room.on('closed', (why) => {
      toast(why === 'kicked' ? 'You were removed from the room' : why === 'lost' ? 'Lost connection to the room' : 'The host closed the room', 'bad');
      teardownRoom();
      history.replaceState(null, '', '#/');
      renderHome();
    }),
    room.on('conn', (ok) => setBanner(ok ? null : 'Connection lost — reconnecting…')),
    room.on('joined', () => sfx('join')),
    room.on('requests', onRequests),
    plaza.on('chat', onGlobalChat),
    S.comms.on('scope', (kind) => { if (kind === 'chat' && S.chat) { S.chat.show(S.comms.scope.chat); updateChatBadge(); S.chat.focus(); } renderHeader(); }),
    () => { reqNotices.forEach((n) => n.close()); reqNotices.clear(); S.panel?.destroy(); },
  ];
  if (!room.local) { syncPresence(); S.offs.push(room.on('state', syncPresence)); if (room.isHost) plaza.hostRoom(room); }
  applyChatLayout();
  onState();
}

const reqNotices = new Map();
/** Host: somebody wants in — show a card with Let in / Decline wherever the host is (lobby or mid-game). */
function onRequests(list) {
  const room = S.room;
  if (!room) return;
  for (const r of list) {
    if (reqNotices.has(r.key)) continue;
    reqNotices.set(r.key, notice({ key: 'req-' + r.key, avatar: avatarEl({ avatar: r.avatar, name: r.name }, 'sm'), title: `${r.name} ${r.kind === 'play' ? 'wants to play' : 'wants to join'}`,
      actions: [{ label: 'Let in', primary: true, onClick: () => room.approve(r.key) }, { label: 'Decline', onClick: () => room.deny(r.key) }] }));
    sfx('join');
  }
  for (const [k, n] of [...reqNotices]) if (!list.some((r) => r.key === k)) { n.close(); reqNotices.delete(k); }
  renderHeader();
}

/** The chat for a room: a Room / Global switch on top of two logs (the room's and the Lounge's). */
/** Others online may see which room I'm in only if the room is listed; a hidden room shows as "in a private room". */
function syncPresence() {
  const room = S.room;
  if (!room || room.local) return;
  const pub = !!room.state?.pub;
  if (plaza.me.room !== (pub ? room.number : null) || plaza.me.priv !== !pub) plaza.setPresence({ room: pub ? room.number : null, priv: !pub });
}

function createChat(room) {
  const norm = (m) => ({ id: m.id, mine: m.from === room.me, name: m.name, color: m.color, avatar: room.person(m.from)?.avatar, text: m.text, sys: m.sys, from: m.from });
  const roomView = chatView({ placeholder: 'Message the room…', send: (t) => room.sendChat(t) });
  room.chat.forEach((m) => roomView.add(norm(m)));
  const globalView = chatView({ placeholder: 'Message everyone online…', send: (t) => plaza.sendChat(t), onName: globalNameMenu, empty: 'Say hi to everyone who’s online 👋' });
  globalView.reset(plaza.chat('lounge'));
  const wrap = h('div.chatwrap');
  const tabs = h('div.cscope');
  const body = h('div.cbody');
  wrap.append(tabs, body);
  let shown = null;
  function paintTabs() {
    const cur = S.comms.scope.chat;
    mount(tabs, [['room', 'meeting_room', 'Room', S.unread], ['global', 'public', 'Global', S.unreadG]].map(([v, ic, label, n]) =>
      h('button.csb' + (cur === v ? '.on' : ''), { type: 'button', onclick: () => S.comms.setScope('chat', v) }, icon(ic, 'sm'), label, n && cur !== v ? h('span.dot.static', n > 9 ? '9+' : n) : null)));
  }
  function show(scope) {
    if (shown !== scope) { shown = scope; mount(body, scope === 'room' ? roomView.el : globalView.el); (scope === 'room' ? roomView : globalView).scroll(); }
    paintTabs();
  }
  show(S.comms.scope.chat);
  const view = () => (S.comms.scope.chat === 'room' ? roomView : globalView);
  return {
    el: wrap, show, paintTabs,
    add: (m) => roomView.add(norm(m)),
    addGlobal: (m) => globalView.add(m),
    resetGlobal: () => globalView.reset(plaza.chat('lounge')),
    focus: () => view().focus(),
    scroll: () => view().scroll(),
  };
}

/** Tap a name in the global chat. */
function globalNameMenu(m, anchor) {
  const person = plaza.people.get(m.from);
  openMenu(anchor, [
    person?.room && !S.room ? { icon: 'login', label: `Join their room (${person.room})`, onClick: () => { location.hash = '#/room/' + person.room; } } : null,
    S.room && !S.room.local && !S.room.isAudience ? { icon: 'person_add', label: 'Invite to my room', onClick: () => { plaza.invite(m.from, S.room.number, S.room.state.gameId); toast('Invitation sent', 'good'); } } : null,
    { icon: 'block', label: 'Mute ' + m.name, danger: true, onClick: () => { plaza.mute(m.from); toast(m.name + ' is muted'); } },
  ].filter(Boolean));
}

function applyChatLayout() {
  const ui = S.ui;
  if (!ui) return;
  const wide = wideMQ.matches;
  ui.bar.classList.toggle('hide', wide || S.mode !== 'lobby');
  if (wide) {
    toggleSheet(false, true);
    ui.float.replaceChildren();
    ui.side.classList.toggle('collapsed', S.chatCollapsed);
    const head = h('div.chathead', [
      S.chatCollapsed ? null : h('span', 'Chat'),
      h('div.spacer'),
      iconBtn(S.chatCollapsed ? 'chat_bubble' : 'chevron_right', S.chatCollapsed ? 'Open chat' : 'Collapse chat', () => { S.chatCollapsed = !S.chatCollapsed; writePref('gn.chatCollapsed', S.chatCollapsed ? '1' : '0'); if (!S.chatCollapsed) S.unread = 0; applyChatLayout(); }, 'sm'),
    ]);
    if (S.chatCollapsed) {
      mount(ui.side, head);
      if (S.unread) ui.side.append(h('span.dot.static', S.unread > 9 ? '9+' : S.unread));
    } else {
      mount(ui.side, head, S.paneEl);
      S.chat.scroll();
    }
  } else {
    ui.side.classList.remove('collapsed');
    ui.side.replaceChildren();
    if (S.sheetOpen) mount(ui.sheet, h('div.grab'), h('div.chathead', [h('span', S.panel ? 'Room ' + S.room.number : 'Chat'), h('div.spacer'), iconBtn('close', 'Close', () => toggleSheet(false), 'sm')]), S.paneEl);
  }
  updateChatBadge();
}

function openComms() {
  openCommsSheet(S.comms, { inRoom: !!S.room && !S.room.local, roomNumber: S.room?.number, goLounge: S.room ? null : () => { location.hash = '#/lounge'; } });
}

/** Keep the Lounge call's tiles in sync with the call (they show beside the room's tiles, or on the Lounge tab). */
function syncLounge() {
  const av = S.comms.loungeAV;
  if (!av) { S.loungeUI?.destroy(); S.loungeUI = null; }
  else if (!S.loungeUI || S.loungeUI.av !== av) {
    S.loungeUI?.destroy();
    S.loungeUI = createAvUI(S.comms.lounge, av, { toast, label: channelName(S.comms.channel), onLeave: () => S.comms.leaveChannel() });
    S.loungeUI.av = av;
  }
  if (S.dockStack && S.avUI) mount(S.dockStack, S.avUI.dock, S.loungeUI ? S.loungeUI.dock : null);
  if (S.loungeHost?.isConnected) mount(S.loungeHost, S.loungeUI ? S.loungeUI.dock : null);
  if (!S.room) renderHeader();
}

/** Open the side panel (wide screens) or the bottom sheet (phones) on a tab. */
function openPanel(tab = 'chat') {
  if (!S.ui) return;
  S.panel?.show(tab);
  if (wideMQ.matches) { if (S.chatCollapsed) { S.chatCollapsed = false; writePref('gn.chatCollapsed', '0'); S.unread = 0; applyChatLayout(); } }
  else toggleSheet(true);
}

function toggleSheet(force, silent) {
  const ui = S.ui;
  if (!ui) return;
  const open = force ?? !S.sheetOpen;
  S.sheetOpen = open && !wideMQ.matches;
  ui.sheet.classList.toggle('open', S.sheetOpen);
  ui.sheetBack.classList.toggle('open', S.sheetOpen);
  if (S.sheetOpen) {
    S.unread = 0;
    ui.float.replaceChildren();
    applyChatLayout();
    S.chat.scroll();
    setTimeout(() => S.chat.focus(), 280);
  } else if (!silent) {
    setTimeout(() => { if (!S.sheetOpen && S.ui) S.ui.sheet.replaceChildren(); }, 280);
    updateChatBadge();
  }
}

function updateChatBadge() {
  if (chatVisible('room')) S.unread = 0;
  if (chatVisible('global')) S.unreadG = 0;
  const n = S.unread + S.unreadG + (S.room?.isHost ? S.room.requests.length : 0); // join requests count too (the People button is folded into this one on phones)
  if (S.chatBtn) {
    S.chatBtn.querySelector('.dot')?.remove();
    if (n > 0 && !wideMQ.matches) S.chatBtn.append(h('span.dot', n > 9 ? '9+' : n));
  }
  const ui = S.ui;
  if (ui && wideMQ.matches && S.chatCollapsed) {
    ui.side.querySelector('.dot')?.remove();
    if (n > 0) ui.side.append(h('span.dot.static', n > 9 ? '9+' : n));
  }
  S.chat?.paintTabs();
}

/** Is the chat for `scope` on screen right now? */
function chatVisible(scope) {
  const open = wideMQ.matches ? !S.chatCollapsed : S.sheetOpen;
  return open && (!S.panel || S.panel.active === 'chat') && S.comms.scope.chat === scope;
}
function floatMsg(m) {
  if (wideMQ.matches || S.sheetOpen || !S.ui) return;
  const who = m.avatar ? { avatar: m.avatar } : m.from ? S.room.person(m.from) : null;
  const f = h('div.fm' + (m.sys ? '.sys' : ''), m.sys ? m.text : [who ? avatarEl(who, 'xs', { still: true }) : null, h('b', m.name), h('span', m.text)]);
  S.ui.float.append(f);
  while (S.ui.float.childNodes.length > 3) S.ui.float.firstChild.remove();
  setTimeout(() => f.remove(), 7000);
}

function onChatMsg(m) {
  if (!S.ui) return;
  S.chat.add(m);
  const mine = m.from === S.room.me;
  floatMsg(m);
  if (!mine && !m.sys) {
    if (!chatVisible('room')) { S.unread++; updateChatBadge(); }
    sfx('msg');
  }
}
/** A message from the global (Lounge) chat arrived while I'm in a room. */
function onGlobalChat(ch, m) {
  if (!S.ui || !S.chat) return;
  if (!m) { S.chat.resetGlobal(); return; }
  S.chat.addGlobal(m);
  if (m.mine || m.history) return;
  if (S.comms.scope.chat === 'global') floatMsg(m);
  if (!chatVisible('global')) { S.unreadG++; updateChatBadge(); }
  sfx('msg');
}

function setBanner(text) {
  S.ui?.stage.querySelector('.banner')?.remove();
  if (text && S.ui) S.ui.stage.append(h('div.banner', text));
}

function teardownRoom() {
  S.token++;
  destroySession();
  S.offs.forEach((f) => f());
  S.offs = [];
  S.ui?.sheet.remove();
  S.ui?.sheetBack.remove();
  S.avUI?.destroy(); S.comms.detachRoom();
  plaza.unhostRoom(); plaza.setPresence({ room: null, priv: false });
  S.avUI = null; S.av = null; S.dockStack = null; S.chatBtn = null; S.peopleBtn = null; S.panel = null; S.paneEl = null;
  S.ui = null;
  S.chat = null;
  S.match = null;
  const r = S.room;
  S.room = null;
  S.mode = 'none';
  try { wakeLock?.release(); } catch { /* */ }
  wakeLock = null;
  try { r?.leave(); } catch { /* */ }
  renderHeader();
}

async function requestLeave() {
  if (!S.room) return;
  const st = S.room.state;
  const host = S.room.isHost;
  const local = S.room.local;
  const busy = st.phase !== 'lobby' || (host && !local && S.room.players.length > 1);
  if (busy) {
    const ok = local
      ? await confirmDialog('Leave this game?', 'Your game against the computer will end.', { ok: 'Leave', danger: true })
      : await confirmDialog(host ? 'Close this room?' : 'Leave this room?', host ? 'You are the host — leaving closes the room for everyone.' : 'You’ll leave the game and the room.', { ok: host ? 'Close room' : 'Leave', danger: true });
    if (!ok) return;
  }
  teardownRoom();
  if (location.hash !== '#/') location.hash = '#/';
  else renderHome();
}

function destroySession() {
  S.token++;
  if (S.session) { S.session.destroy(); S.session = null; }
}

function onState() {
  const room = S.room;
  if (!room || !S.ui) return;
  const st = room.state;
  const g = st.game;
  if (st.phase === 'lobby' || !g) {
    if (S.mode !== 'lobby') showLobby();
    renderHeader();
    updateLobby();
    if (st.gameId && GAME_BY_ID[st.gameId]) GAME_BY_ID[st.gameId].load().catch(() => {});
    return;
  }
  const mine = g.playerIds.includes(room.me) || room.isAudience; // the audience sees the game too (read-only)
  if (!mine) {
    if (S.mode !== 'wait' || S.runId !== g.runId) showWait(g);
    renderHeader();
    return;
  }
  if (S.mode !== 'game' || S.runId !== g.runId) startSession(g);
  else S.session?.updatePlayers();
  renderHeader();
  updateResults();
}

// ------------------------------------------------------------------ lobby
function showLobby() {
  destroySession();
  S.mode = 'lobby';
  S.runId = 0;
  const L = (S.ui.lobby = { invite: h('div.panel.invite'), players: h('div.panel'), game: h('div.panel'), start: h('div.startbar') });
  setTitle(S.room.local ? 'Solo — Game Night' : `Room ${S.room.number} — Game Night`);
  mount(S.ui.stage, h('div.lobby', [h('div.colL', [L.invite, L.players]), h('div.colR', [L.game]), L.start]));
  S.ui.lobby.start.style.gridColumn = '1 / -1';
  applyChatLayout();
}

function updateLobby() {
  const room = S.room;
  const L = S.ui.lobby;
  const st = room.state;
  const link = roomLink(room.number);

  if (room.local) {
    mount(L.invite, h('div.lbl', 'Playing offline'), h('div', { style: 'font:800 28px var(--font);margin:6px 0' }, 'You vs the computer'), h('div.muted', { style: 'font-size:14px' }, 'No internet needed. Want friends to join? Create an online room from the home screen.'));
  } else mount(L.invite,
    h('div.lbl', 'Room code'),
    h('div.bignum', room.number),
    h('div.muted', { style: 'font-size:14px' }, 'Friends enter this number — or open your link:'),
    h('div.link', link),
    h('div.row.wrap', [
      h('button.btn.primary', { onclick: copyInvite }, icon('link'), 'Copy link'),
      navigator.share ? h('button.btn.tonal', { onclick: () => navigator.share({ title: 'Game Night', text: `Join my game room ${room.number}!`, url: link }).catch(() => {}) }, icon('share'), 'Share') : null,
      h('button.btn.tonal', { onclick: async () => { await copyText(String(room.number)); toast('Room number copied', 'good'); } }, icon('content_copy'), 'Code'),
    ]),
    room.isHost
      ? h('div.sw-row', h('span.row', icon('lock'), 'Lock room (no new players)'), switchEl(st.locked, (v) => room.setLocked(v)))
      : st.locked ? h('div.row', { style: 'margin-top:12px;color:var(--on2);font-size:13px' }, icon('lock', 'sm'), 'Room is locked') : null
  );

  mount(L.players,
    h('div.row', { style: 'margin-bottom:12px' }, h('h3', { style: 'font:700 18px var(--font)' }, 'Players'), h('span.chip.blue', st.players.length), h('div.spacer'), h('button.btn.small.tonal', { onclick: editProfile }, icon('edit'), 'Edit me')),
    botControls(),
    st.audience?.length ? h('div.watchrow', icon('visibility', 'sm'), h('span', `${st.audience.length} watching`), h('div.row', { style: 'gap:2px' }, st.audience.slice(0, 8).map((p) => avatarEl(p, 'xs', { still: true })))) : null,
    h('div.plist', st.players.map((p) => h('div.prow', [
      h('div.avwrap', avatarEl(p, 'lg'), p.id === st.hostId ? h('span.crown', icon('star')) : null),
      h('div.grow', [h('div.pname', p.name + (p.id === room.me ? ' (you)' : '')), p.bot ? h('div.tag', 'Computer · ' + ((LEVELS.find((l) => l.value === (p.level || st.botLevel)) || {}).label || 'Normal')) : !p.online ? h('div.tag', 'reconnecting…') : p.id === st.hostId ? h('div.tag', 'Host') : null]),
      room.isHost && p.bot ? h('button.iconbtn.sm', { title: 'Remove computer', 'aria-label': 'Remove ' + p.name, onclick: () => room.removeBot(p.id) }, icon('close'))
        : room.isHost && p.id !== room.me ? h('button.iconbtn.sm', { title: 'Remove player', 'aria-label': 'Remove ' + p.name, onclick: async () => { if (await confirmDialog(`Remove ${p.name}?`, 'They can rejoin with the link unless you lock the room.', { ok: 'Remove', danger: true })) room.kick(p.id); } }, icon('close')) : null,
    ])))
  );

  const def = GAME_BY_ID[st.gameId];
  if (!def) {
    mount(L.game,
      h('h2', { style: 'font-size:22px' }, 'Pick a game'),
      h('p.muted', { style: 'margin:6px 0 14px' }, room.isHost ? 'What are we playing tonight?' : 'The host is choosing a game…'),
      room.isHost ? h('button.btn.primary.big', { onclick: openPicker }, icon('sports_esports'), 'Choose a game') : h('div.spinner')
    );
    mount(L.start);
    return;
  }
  const online = st.players.filter((p) => p.online).length;
  const opts = fillOpts(def, st.opts);
  let problem = null;
  if (online < def.min) problem = `Needs at least ${def.min} players — you have ${online}. Share the invite link!`;
  else if (online > def.max) problem = `This game supports up to ${def.max} players — there are ${online} in the room.`;
  mount(L.game,
    h('div.gsel', { style: { '--gc': def.color } }, [
      h('div.tile.emo', def.emoji),
      h('div.grow', [h('h2', def.name), h('div.muted', def.tagline)]),
    ]),
    h('div.row.wrap', { style: 'margin-top:12px;gap:6px' }, [h('span.chip.blue', icon('group'), playersLabel(def)), h('span.chip', def.cat), ...(def.tags || []).slice(0, 3).map((t) => h('span.chip', t))]),
    h('p', { style: 'margin-top:12px;line-height:1.5;color:var(--on2)' }, def.desc),
    h('div.row.wrap', { style: 'margin-top:14px' }, [
      h('button.btn.tonal', { onclick: () => openRules(def) }, icon('menu_book'), 'How to play'),
      room.isHost ? h('button.btn.outline', { onclick: openPicker }, icon('swap_horiz'), 'Change game') : null,
    ]),
    def.options && def.options.length
      ? h('div.opts', def.options.map((op) => {
        const choices = op.choices.map((c) => (typeof c === 'object' ? c : { value: c, label: String(c) }));
        const cur = choices.find((c) => String(c.value) === String(opts[op.key])) || choices[0];
        return h('label.opt', [
          op.label,
          room.isHost
            ? h('select.txt', { onchange: (e) => room.setOpt(op.key, choices.find((x) => String(x.value) === e.target.value).value) }, choices.map((c) => h('option', { value: c.value, selected: String(c.value) === String(cur.value) }, c.label)))
            : h('div.ro', cur.label),
        ]);
      }))
      : null,
    problem ? h('div.warnbox', { style: 'margin-top:14px' }, icon('info'), problem) : null
  );
  mount(L.start,
    room.isHost
      ? h('button.btn.primary.big.block', { disabled: !!problem, onclick: hostStart }, icon('play_arrow'), 'Start game')
      : room.isAudience ? h('div.panel.row', { style: 'padding:12px 14px;justify-content:space-between' }, h('span.row', icon('visibility'), h('span.muted', 'You’re watching')), h('button.btn.small.primary', { onclick: () => { room.askToPlay(); toast('Asked the host for a seat', 'good'); } }, icon('sports_esports', 'sm'), 'Ask to play'))
      : h('div.panel', { style: 'text-align:center;padding:14px' }, h('span.muted', problem ? 'Waiting for more players…' : 'Waiting for the host to start…'))
  );
}

/** Lobby: add / remove computer players (host only; only for games that have a computer brain). */
function botControls() {
  const room = S.room, st = room.state;
  const def = GAME_BY_ID[st.gameId];
  if (!room.isHost || !def?.bots) return null;
  const nBots = st.players.filter((p) => p.bot).length;
  const can = st.players.length < def.max;
  return h('div.botctl', h('button.btn.small.tonal', { disabled: !can, onclick: () => room.addBot() }, icon('smart_toy'), 'Add computer'),
    nBots ? h('div.row', { style: 'gap:6px' }, h('span.muted', { style: 'font-size:12.5px' }, 'Difficulty'), segmented(LEVELS, st.botLevel || 'normal', (v) => room.setBotLevel(v))) : null);
}

function openPicker() {
  const room = S.room;
  if (!room?.isHost) return;
  const n = room.state.players.filter((p) => p.online).length;
  pickGame({ title: 'Choose a game', players: n > 0 ? n : undefined, onPick: (d) => room.setGame(d.id) });
}

function hostStart() {
  const room = S.room;
  const st = room.state;
  const def = GAME_BY_ID[st.gameId];
  if (!def) return;
  const ids = st.players.filter((p) => p.online).map((p) => p.id);
  if (ids.length < def.min || ids.length > def.max) return toast('Wrong number of players for this game', 'bad');
  def.load().catch(() => {});
  sfx('good');
  room.startGame(def.id, fillOpts(def, st.opts), ids);
}

// ------------------------------------------------------------------ waiting (joined mid-game)
function showWait(g) {
  destroySession();
  S.mode = 'wait';
  S.runId = g.runId;
  applyChatLayout();
  const def = GAME_BY_ID[g.gameId];
  mount(S.ui.stage, h('div.waitscreen', h('div', [
    h('div.emo', { style: 'font-size:72px' }, def?.emoji || '🎮'),
    h('h2', `${def?.name || 'A game'} is in progress`),
    h('p.muted', { style: 'margin:8px 0 18px' }, 'You’ll be dealt in when the host starts the next round. Say hi in the chat!'),
    h('div.spinner'),
  ])));
}

// ------------------------------------------------------------------ game
async function startSession(g) {
  destroySession();
  const room = S.room;
  const token = ++S.token;
  const def = GAME_BY_ID[g.gameId];
  S.mode = 'game';
  S.runId = g.runId;
  S.resultsFor = 0;
  S.ui.resultsEl = null;
  applyChatLayout();
  setTitle(room.local ? `${def.name} — vs computer` : `${def.name} — Room ${room.number}`);
  if (room.isAudience && def.watch === false) { // private screens: nothing to draw for someone without a seat
    mount(S.ui.stage, h('div.game-root', standIn(def, g)));
    S.ui.stage.append(h('div.specbadge', icon('visibility', 'sm'), 'Watching'));
    updateResults();
    return;
  }
  const root = h('div.game-root', h('div.waitscreen', h('div', h('div.spinner'), h('p.muted', 'Loading ' + def.name + '…'))));
  mount(S.ui.stage, root);
  let mod;
  try {
    mod = await def.load();
  } catch (e) {
    console.error(e);
    toast('Failed to load the game: ' + e.message, 'bad');
    return;
  }
  if (token !== S.token || S.room !== room) return;
  clear(root);
  if (!room.isAudience) touchRecent(def.id);
  S.session = new GameSession({ room, def, mod, run: g, root, toast, onSave: onGameSave });
  S.session.updatePlayers();
  if (room.isAudience) watchOnly(root, def);
  updateResults();
  // first time in this game on this device? show the rules briefly
  const seen = readPref('gn.seen.' + def.id);
  if (!seen) { writePref('gn.seen.' + def.id, '1'); setTimeout(() => { if (S.session && S.mode === 'game') toast('Tip: tap the ? button any time for the rules'); }, 1200); }
}

/** The audience sees what the players see, but can't touch it. If a game can't draw itself without a seat, show a friendly stand-in. */
function watchOnly(root, def) {
  root.classList.add('spectating');
  if (S.session?.failed) { clear(root); root.append(standIn(def, S.room.state.game)); }
  else { // some games draw nothing until they have something to say to *you*: after a moment, check and cover the gap
    const room = S.room, session = S.session;
    const blank = () => !root.innerText.trim() && !root.querySelector('canvas, video, img, svg');
    setTimeout(() => { if (S.session === session && S.room === room && blank()) { const cover = h('div.spec-cover', standIn(def, room.state.game)); root.append(cover); const iv = setInterval(() => { if (S.session !== session || !cover.isConnected) return clearInterval(iv); if (!blank_(root, cover)) { cover.remove(); clearInterval(iv); } }, 2500); } }, 3500);
  }
  S.ui.stage.querySelector('.specbadge')?.remove();
  S.ui.stage.append(h('div.specbadge', icon('visibility', 'sm'), 'Watching'));
}
/** Is the game's own picture empty (ignoring our stand-in cover)? */
function blank_(root, cover) { cover.hidden = true; const empty = !root.innerText.trim() && !root.querySelector('canvas, video, img, svg'); cover.hidden = false; return empty; }

/** What the audience sees when a game has nothing it can show them. */
function standIn(def, g) {
  const room = S.room;
  const ps = (g?.playerIds || []).map((id) => room.player(id)).filter(Boolean);
  return h('div.waitscreen', h('div', [
    h('div.emo', { style: 'font-size:72px' }, def.emoji),
    h('h2', `${def.name} is being played`),
    h('div.row.wrap', { style: 'justify-content:center;gap:6px;margin-top:10px' }, ps.map((p) => h('span.chip', avatarEl(p, 'xs', { still: true }), p.name))),
    h('p.muted', { style: 'margin:12px 0 18px;max-width:320px' }, 'Everyone has a private screen in this game, so there’s nothing to show here. You’ll see the results when it ends — chat with the room meanwhile!'),
    h('div.spinner'),
  ]));
}

// ------------------------------------------------------------------ results overlay
function updateResults() {
  const room = S.room;
  const st = room.state;
  const ui = S.ui;
  if (st.phase !== 'results') {
    if (ui.resultsEl) { ui.resultsEl.remove(); ui.resultsEl = null; }
    S.resultsFor = 0;
    return;
  }
  const runId = st.game.runId;
  if (S.resultsFor === runId) return;
  S.resultsFor = runId;
  ui.resultsEl?.remove();
  const res = st.results || {};
  const ranking = res.ranking || [];
  const winners = res.winners || (ranking[0] ? [ranking[0].id] : []);
  const iWon = winners.includes(room.me);
  const el = h('div.resultsback', h('div.results', [
    h('div.trophy', icon(iWon ? 'emoji_events' : 'celebration')),
    h('h2', res.title || 'Game over!'),
    res.subtitle ? h('div.sub', res.subtitle) : null,
    ...ranking.map((r, i) => {
      const p = room.player(r.id) || { name: r.name || '?', color: '#888' };
      return h('div.rrow' + (i === 0 ? '.first' : ''), [
        h('div.rk', i + 1),
        avatarEl(p, winners.includes(r.id) ? 'lg dance' : 'lg'),
        h('div.pname', p.name + (r.id === room.me ? ' (you)' : '')),
        h('div.sc', r.score !== undefined ? String(r.score) : '', r.note ? h('small', r.note) : null),
      ]);
    }),
    h('div.row.wrap', { style: 'margin-top:20px;justify-content:center' },
      room.match
        ? [h('button.btn.primary', { onclick: () => { teardownRoom(); location.hash = '#/matches'; renderMatchesTab(); } }, icon('sms'), 'Back to matches')]
        : room.isHost
        ? [
          h('button.btn.primary', { onclick: () => playAgain() }, icon('replay'), 'Play again'),
          h('button.btn.tonal', { onclick: () => room.toLobby() }, icon('home'), 'Lobby'),
        ]
        : [h('div.muted', 'Waiting for the host…')]),
  ]));
  ui.resultsEl = el;
  ui.stage.append(el);
  if (iWon) { sfx('win'); confetti(ui.stage); } else sfx('good');
}

function playAgain() {
  const room = S.room;
  const g = room.state.game;
  const ids = room.state.players.filter((p) => p.online).map((p) => p.id);
  const def = GAME_BY_ID[g.gameId];
  if (ids.length < def.min || ids.length > def.max) {
    toast('Not enough players for another round — back to the lobby', 'bad');
    return room.toLobby();
  }
  room.startGame(g.gameId, g.opts, ids);
}

function confetti(container) {
  const colors = ['#ea4335', '#fbbc04', '#34a853', '#4285f4', '#e5399b', '#f57c00'];
  for (let i = 0; i < 80; i++) {
    const c = h('div.confetti', {
      style: {
        left: Math.random() * 100 + '%',
        background: colors[i % colors.length],
        animationDuration: 2 + Math.random() * 2.5 + 's',
        animationDelay: Math.random() * 0.6 + 's',
        transform: `rotate(${Math.random() * 360}deg)`,
      },
    });
    container.append(c);
    setTimeout(() => c.remove(), 5500);
  }
}

// ------------------------------------------------------------------ routing
async function route() {
  if (S.joining) return;
  const hash = location.hash || '#/';
  if (hash === '#/solo' && S.room?.local) return;
  if (/^#\/m\//.test(hash) && S.room && !(await confirmDialog('Leave this game?', 'Open the match from the link instead.', { ok: 'Open match', danger: true }))) { history.replaceState(null, '', '#/solo'); return; }
  if (/^#\/m\//.test(hash) && S.room) teardownRoom();
  const m = /^#\/room\/(\d+)(\/watch)?/.exec(hash);
  if (m) {
    const n = +m[1];
    if (S.room) {
      if (S.room.number === n) return;
      if (!(await confirmDialog(`Leave room ${S.room.number}?`, `Join room ${n} instead.`, { ok: 'Switch rooms', danger: true }))) { history.replaceState(null, '', '#/room/' + S.room.number); return; }
      teardownRoom();
    }
    return joinRoom(n, { role: m[2] ? 'audience' : 'player', via: 'code' });
  }
  if (S.room) {
    if (!(await confirmDialog(`Leave room ${S.room.number}?`, 'You’ll go back to the home screen.', { ok: 'Leave', danger: true }))) { history.replaceState(null, '', '#/room/' + S.room.number); return; }
    teardownRoom();
  }
  const mm = /^#\/m\/([\w-]+)/.exec(hash);
  if (mm) return importMatch(mm[1]);
  const tab = /^#\/(rooms|matches|lounge)\b/.exec(hash);
  if (tab) return renderTab(tab[1]);
  renderGamesTab();
  const g = /^#\/game\/([\w-]+)/.exec(hash);
  if (g && GAME_BY_ID[g[1]]) openGameSheet(GAME_BY_ID[g[1]]);
}

// ------------------------------------------------------------------ Rooms tab (the public room list)
const joinable = (r) => r.access !== 'locked';
function updateRoomsBadge() { S.chrome?.setBadge('rooms', plaza.openRooms.filter((r) => r.number !== S.room?.number && joinable(r)).length); }

function roomCard(r) {
  const def = GAME_BY_ID[r.game];
  const phase = r.phase === 'playing' ? 'Playing now' : r.phase === 'results' ? 'Wrapping up' : 'In the lobby';
  return h('button.rcard', { style: { '--gc': def?.color || '#1a73e8' }, onclick: () => openRoomSheet(r) },
    h('div.tile.emo', def?.emoji || '🎲'),
    h('div.grow', h('b', def ? def.name : 'Picking a game…'), h('div.muted', { style: 'font-size:13px' }, `Room ${r.number} · ${phase}`),
      h('div.row.rpl', r.players.slice(0, 5).map((p) => avatarEl(p, 'xs', { still: true })), r.count > 5 ? h('span.muted', '+' + (r.count - 5)) : null, r.bots ? h('span.chip', icon('smart_toy', 'sm'), r.bots) : null)),
    h('div.rmeta', r.audience ? h('span.chip', icon('visibility', 'sm'), r.audience) : null, r.access === 'locked' ? h('span.chip.yellow', icon('lock', 'sm')) : r.access === 'ask' ? h('span.chip', icon('front_hand', 'sm')) : h('span.chip.green', icon('login', 'sm'))));
}

function openRoomSheet(r) {
  const def = GAME_BY_ID[r.game];
  const old = r.proto !== PROTO;
  const go = (role) => { sheet.close(); joinRoom(r.number, { role, via: 'dir' }); };
  const sheet = openSheet(h('div.col', { style: 'gap:14px' },
    h('div.gsel', { style: { '--gc': def?.color || '#1a73e8' } }, h('div.tile.emo', def?.emoji || '🎲'), h('div.grow', h('h2', def ? def.name : 'Room ' + r.number), h('div.muted', `Room ${r.number} · ${r.phase === 'playing' ? 'playing now' : r.phase === 'results' ? 'wrapping up' : 'in the lobby'}`))),
    h('div.rplist', r.players.map((p) => h('div.pp-row', avatarEl(p, 'sm'), h('div.pp-name', h('b', p.name), p.host ? h('div.pp-tags', h('span.chip.blue', 'Host')) : null)))),
    r.bots || r.audience ? h('div.muted', `${r.bots ? r.bots + ' computer player' + (r.bots > 1 ? 's' : '') : ''}${r.bots && r.audience ? ' · ' : ''}${r.audience ? r.audience + ' watching' : ''}`) : null,
    old ? h('div.warnbox', icon('info'), 'This room runs a different version of the game — reload the page to update, or ask them to.') : null,
    r.access === 'locked' ? h('div.warnbox', icon('lock'), 'The host has locked this room.') : r.access === 'ask' ? h('div.muted', { style: 'font-size:13px' }, 'The host will be asked to let you in.') : null,
    h('div.row.wrap', { style: 'gap:8px' },
      r.access !== 'locked' ? h('button.btn.primary.big.grow', { disabled: old, onclick: () => go('player') }, icon('login'), r.access === 'ask' ? 'Ask to join' : 'Join') : null,
      r.allowAudience ? h('button.btn.tonal.big.grow', { disabled: old, onclick: () => go('audience') }, icon('visibility'), 'Watch') : null)));
}

function renderRoomsTab() {
  S.mode = 'none';
  S.tab = 'rooms';
  setTitle('Open rooms');
  renderHeader();
  S.chrome.setActive('rooms');
  const status = h('div.rstatus');
  const list = h('div.rlist');
  const paint = () => {
    const rooms = plaza.openRooms.filter((r) => r.number !== S.room?.number);
    const online = plaza.online.length + 1;
    mount(status,
      h('span.chip' + (plaza.connected ? '.green' : '.yellow'), icon(plaza.connected ? 'public' : 'sync', 'sm'), plaza.connected ? `${online} online` : 'Connecting…'),
      h('span.muted', rooms.length ? `${rooms.length} open room${rooms.length === 1 ? '' : 's'}` : ''));
    mount(list, rooms.length ? rooms.map(roomCard) : h('div.empty', h('div', { style: 'font-size:54px' }, '🏜️'),
      h('p', plaza.connected ? 'No public rooms right now. Start one and friends can find it here.' : 'Looking for rooms…'),
      h('button.btn.primary', { onclick: () => pickGame({ title: 'Create a room', onPick: (d) => createRoom(d.id) }) }, icon('add'), 'Create a room')));
  };
  const el = h('div.home', status, list);
  const subs = ['rooms', 'people', 'connection'].map((ev) => plaza.on(ev, () => { if (el.isConnected) paint(); else subs.forEach((f) => f?.()); }));
  paint();
  mount(S.view, el);
  S.chrome.setFab([
    { label: 'Create a room', icon: 'add_circle', onClick: () => pickGame({ title: 'Create a room', onPick: (d) => createRoom(d.id) }) },
    { label: 'Join with a code', icon: 'login', onClick: () => S.joinInput?.focus() },
  ]);
}

// ------------------------------------------------------------------ Lounge tab (global chat, voice channels, who's online)
function renderLoungeTab() {
  S.mode = 'none';
  S.tab = 'lounge';
  setTitle('Lounge');
  S.loungeUnseen = 0;
  S.chrome.setBadge('lounge', 0);
  renderHeader();
  S.chrome.setActive('lounge');
  S.chrome.setFab(null);
  const pane = h('div.lpane');
  const chat = chatView({ placeholder: 'Message everyone online…', send: (t) => plaza.sendChat(t), onName: globalNameMenu, empty: 'Nobody has said anything yet — be the first 👋' });
  chat.reset(plaza.chat('lounge'));
  const el = h('div.lounge');
  const subs = [plaza.on('chat', (ch, m) => { if (!el.isConnected) return subs.forEach((f) => f?.()); if (m) chat.add(m); else chat.reset(plaza.chat('lounge')); }), plaza.on('people', () => { if (el.isConnected && S.loungeSec === 'people') paintPeople(); })];
  const peopleEl = h('div.lpeople');
  function paintPeople() {
    const rows = plaza.online;
    const mutedList = [...plaza.muted];
    mount(peopleEl,
      h('div.kt-title', { style: 'padding:4px 6px' }, `Online now · ${rows.length + 1}`),
      h('div.pp-row', avatarEl({ avatar: S.profile.avatar }, 'sm'), h('div.pp-name', h('b', S.profile.name + ' (you)'))),
      ...rows.map((p) => h('div.pp-row', avatarEl(p, 'sm'), h('div.pp-name', h('b', p.name), h('div.pp-tags', p.room ? h('span.chip.blue', icon('meeting_room', 'sm'), 'Room ' + p.room) : p.priv ? h('span.chip', icon('lock', 'sm'), 'Private room') : null, p.ch ? h('span.chip.green', icon('headset', 'sm'), channelName(p.ch)) : null, !p.room && !p.priv && !p.ch ? h('span.muted', { style: 'font-size:12.5px' }, 'browsing') : null)),
        h('span.spacer'),
        p.room && !S.room ? h('button.btn.small.tonal', { onclick: () => { const r = plaza.rooms.get(p.room); if (r) openRoomSheet(r); else location.hash = '#/room/' + p.room; } }, 'Join') : null,
        S.room && !S.room.local && !S.room.isAudience && !p.room ? h('button.btn.small.tonal', { onclick: (e) => { plaza.invite(p.cid, S.room.number, S.room.state.gameId); e.currentTarget.textContent = 'Sent ✓'; e.currentTarget.disabled = true; } }, 'Invite') : null,
        iconBtn('block', 'Mute ' + p.name, () => { plaza.mute(p.cid); toast(p.name + ' is muted'); }, 'sm'))),
      mutedList.length ? h('div.pp-row', h('div.pp-name', h('span.muted', `${mutedList.length} muted`)), h('span.spacer'), h('button.btn.small.ghost', { onclick: () => { mutedList.forEach((c) => plaza.mute(c, false)); paintPeople(); } }, 'Unmute all')) : null,
      !rows.length ? h('div.empty', { style: 'padding:24px 0' }, plaza.connected ? 'Nobody else is online right now.' : 'Connecting…') : null);
  }
  function paintPane() {
    const sec = S.loungeSec || 'chat';
    if (sec === 'chat') mount(pane, chat.el);
    else if (sec === 'voice') {
      S.loungeHost = h('div.lvhost');
      mount(pane, h('div.lvoice.col', { style: 'gap:12px' },
        h('div.row.wrap', { style: 'gap:8px' }, h('button.btn.tonal', { onclick: openComms }, icon('tune'), 'Mic, camera & chat settings')),
        channelList(S.comms), S.loungeHost));
      syncLounge();
    } else { paintPeople(); mount(pane, peopleEl); }
    if (sec === 'chat') setTimeout(() => chat.scroll(), 0);
  }
  const seg = segmented([{ value: 'chat', label: 'Chat', icon: 'forum' }, { value: 'voice', label: 'Voice', icon: 'headset' }, { value: 'people', label: 'People', icon: 'groups' }], S.loungeSec || 'chat', (v) => { S.loungeSec = v; paintPane(); });
  mount(el, seg, pane);
  mount(S.view, el);
  paintPane();
}

/** Rooms / Matches / Lounge tabs (filled in by their own modules). */
function renderTab(id) {
  if (id === 'matches') return renderMatchesTab();
  if (id === 'rooms') return renderRoomsTab();
  if (id === 'lounge') return renderLoungeTab();
  S.mode = 'none';
  S.tab = id;
  renderHeader();
  S.chrome.setActive(id);
  S.chrome.setFab(null);
  const label = { rooms: 'Open rooms', matches: 'Turn-by-turn matches', lounge: 'Lounge' }[id];
  setTitle(label + ' — Game Night');
  mount(S.view, h('div.home', h('div.tabhead', h('h2', label)), h('div.empty', 'Coming right up…')));
}

// Keep phones awake while in a room — a sleeping screen drops the connection.
let wakeLock = null;
async function keepAwake() {
  try { if (S.room && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* not allowed */ }
}

function boot() {
  S.headerEl = h('header.top');
  S.view = h('main#view');
  S.chrome = createChrome({
    S, switchChannel: async (to) => { if (S.room) { toast('Leave the room first', 'bad'); return false; } const ok = await switchChannel(to); if (!ok) toast(channelLabel(to) + ' isn’t available right now', 'bad'); return ok; }, go: (hash) => { if ((location.hash || '#/') === hash) route(); else location.hash = hash; }, editProfile, openAbout, openRecordings: () => openRecordings(S.rec, { toast }),
    versionText: (CFG.env === 'prod' ? '' : CFG.env + ' · ') + CFG.build + ' · p' + PROTO,
  });
  mount($app, S.headerEl, h('div.body', S.chrome.rail, S.view), S.chrome.bottom, S.chrome.fabHost);
  renderHeader();
  onTheme(() => { if (!S.room) renderHeader(); });
  addEventListener('hashchange', route);
  addEventListener('pagehide', () => { if (S.room?.isHost) S.room.leave(); });
  addEventListener('beforeunload', (e) => {
    if (S.room && S.room.state.phase !== 'lobby') { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('pointerdown', () => { audioContext(); keepAwake(); }, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
  window.__pwa = pwa;
  S.comms = new Comms({ plaza, toast });
  S.rec = new Recorder({ remoteStreams: () => [...(S.comms.roomAV?.remote.values() || []), ...(S.comms.loungeAV?.remote.values() || [])] });
  S.rec.on('state', () => { renderHeader(); });
  S.commsBtns = createCommsButtons(S.comms, { toast });
  S.comms.on('avs', syncLounge);
  S.mini = createMiniCall(S.comms, { go: () => { location.hash = '#/lounge'; } });
  document.body.append(S.mini.el);
  plaza.start(S.profile);
  plaza.on('rooms', updateRoomsBadge);
  plaza.on('chat', (ch, m) => { if (m && !m.mine && !m.history && !S.room && S.tab !== 'lounge') { S.loungeUnseen = (S.loungeUnseen || 0) + 1; S.chrome.setBadge('lounge', S.loungeUnseen); } });
  plaza.on('invite', (inv) => notice({ key: 'inv-' + inv.room, avatar: avatarEl({ avatar: inv.avatar, name: inv.from }, 'sm'), title: `${inv.from} invited you`, text: `Room ${inv.room}${inv.game ? ' · ' + gameName(inv.game) : ''}`, ttl: 25000,
    actions: [{ label: 'Join', primary: true, onClick: () => { if (S.room) toast('Leave your current room first'); else location.hash = '#/room/' + inv.room; } }, { label: 'Not now' }] }));
  if (ENV_TAG) document.body.append(h('div.envpill', ENV_TAG.replace(/[\[\]]/g, '') + ' · ' + CFG.build));
  // reload for a waiting update only when nobody is in the middle of anything
  refreshBadges();
  initPwa(() => !S.room && !S.joining && !document.querySelector('.sheet, .dialog, .scrim') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || ''));
  route();
}

window.__gn = S; // handy for debugging in the console
maybeRedirect().then((leaving) => { if (!leaving) boot(); }, () => boot());
