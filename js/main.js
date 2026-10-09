// App shell: home, name/avatar gate, lobby, in-room chrome (app bar, chat, calls, rules), results, routing.
import { h, mount, clear, copyText, pick, installSafeDom } from './util.js';
import { Room, parseRoomInput, roomLink, CFG, PROTO } from './net.js';
import { pwa, onPwaChange, initPwa, promptInstall, isIOS } from './pwa.js';
import { GAMES, GAME_BY_ID, CATEGORIES } from './games/index.js';
import { GameSession } from './session.js';
import { sfx, isMuted, setMuted, audioContext } from './audio.js';
import { avatarEl, avatarEditor, sanitizeAvatar } from './avatar.js';
import { AV } from './av.js';
import { createAvUI } from './avui.js';
import { icon, iconBtn, logoMark, installRipples, toast, openSheet, confirmDialog, openMenu, switchEl } from './ui.js';

installSafeDom();
installRipples();

// Non-production builds are tagged everywhere so a test copy can never be mistaken for the real thing.
const ENV_TAG = CFG.env === 'prod' ? '' : CFG.env === 'dev' ? '[DEV]' : '[LOCAL]';
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
  joining: false,
  token: 0,
  ui: null,
  chat: null,
  unread: 0,
  sheetOpen: false,
  chatCollapsed: readPref('gn.chatCollapsed') === '1',
  resultsFor: 0,
  offs: [],
};

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
  if (!room) {
    mount(S.headerEl,
      h('a.logo', { href: '#/' }, logoMark(), h('span', 'Game ', h('b', 'Night'))),
      h('div.spacer'),
      iconBtn('help_outline', 'How it works', openAbout),
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
    h('div.tb-title', h('b', inGame && def ? def.name : 'Lobby'), h('button.codechip', { onclick: copyInvite, title: 'Copy invite link' }, 'Room ' + room.number, icon('content_copy'))),
    h('div.tb-players', ids.map((id) => room.player(id)).filter(Boolean).slice(0, 10).map((p) => avatarEl(p, 'sm', { still: true }))),
    h('div.spacer'),
    ...S.avUI.buttons,
    S.chatBtn,
    iconBtn('help_outline', 'Rules & how to play', () => openRules(currentDef())),
    iconBtn('more_vert', 'More', (e) => openRoomMenu(e.currentTarget))
  );
  updateChatBadge();
}

function openRoomMenu(anchor) {
  const room = S.room;
  const st = room.state;
  openMenu(anchor, [
    { icon: 'link', label: 'Copy invite link', onClick: copyInvite },
    navigator.share ? { icon: 'share', label: 'Share invite…', onClick: () => navigator.share({ title: 'Game Night', text: `Join my game room ${room.number}!`, url: roomLink(room.number) }).catch(() => {}) } : null,
    { icon: 'person', label: 'Edit name & avatar', onClick: editProfile },
    { icon: isMuted() ? 'volume_off' : 'volume_up', label: isMuted() ? 'Turn sound on' : 'Turn sound off', onClick: () => { setMuted(!isMuted()); toast(isMuted() ? 'Sound off' : 'Sound on'); } },
    room.isHost ? { icon: st.locked ? 'lock_open' : 'lock', label: st.locked ? 'Unlock room' : 'Lock room (no new players)', onClick: () => room.setLocked(!st.locked) } : null,
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
function gameCard(def, onPick) {
  return h('button.gcard', { style: { '--gc': def.color }, onclick: () => onPick(def) }, [
    h('div.tile.emo', def.emoji),
    h('h3', def.name),
    h('p', def.tagline),
    h('div.meta', [h('span.chip', icon('group'), def.min === def.max ? def.min : `${def.min}–${def.max}`), h('span.chip', def.cat)]),
  ]);
}

function renderHome() {
  S.mode = 'none';
  setTitle('Game Night — play with friends');
  renderHeader();
  const input = h('input', {
    placeholder: 'Room number or link', autocomplete: 'off', inputmode: 'text', enterkeyhint: 'go',
    onkeydown: (e) => { if (e.key === 'Enter') go(); },
  });
  const go = () => {
    const n = parseRoomInput(input.value);
    if (!n) return toast('Type a room number (like 3) or paste an invite link', 'bad');
    location.hash = '#/room/' + n;
  };
  const grid = h('div.grid');
  const chips = h('div.filters');
  const paint = () => {
    mount(chips, ['All', ...CATEGORIES].map((c) => h('button.fchip' + (c === S.filter ? '.on' : ''), { onclick: () => { S.filter = c; paint(); } }, c)));
    const q = S.query.trim().toLowerCase();
    const list = GAMES.filter((g) => (S.filter === 'All' || g.cat === S.filter) && (!q || (g.name + ' ' + g.tagline + ' ' + (g.tags || []).join(' ') + ' ' + g.cat).toLowerCase().includes(q)));
    mount(grid, list.length ? list.map((g) => gameCard(g, openGameSheet)) : h('div.empty', 'No games match — try another search.'));
  };
  paint();
  const search = h('input', { placeholder: `Search ${GAMES.length} games`, value: S.query, oninput: (e) => { S.query = e.target.value; paint(); } });
  mount(S.view,
    h('div.home', [
      h('div.hero', [
        h('h1', 'Game night,', h('br'), h('span.g', 'anywhere.')),
        h('p', 'Pick a game, make a room, send the link. Play with friends on any phone — no installs, no accounts.'),
        h('div.joincard', icon('login'), input, h('button.btn.primary', { onclick: go }, 'Join')),
        h('div.searchbar', icon('search'), search),
      ]),
      chips,
      grid,
      installChip(),
      h('div.footnote', [
        h('p', 'Rooms are peer-to-peer: the first player to create a room becomes its host and gets the lowest free number (1, 2, 3 …). Nothing is stored on a server. Tap 🎤 / 📹 inside a room to talk and show your face. Retro Console uses jsnes and free homebrew by Damian Yerrick.'),
      ]),
    ])
  );
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
  const input = h('input.txt', {
    placeholder: 'Room #', inputmode: 'numeric', style: 'width:110px', enterkeyhint: 'go',
    onkeydown: (e) => { if (e.key === 'Enter') join(); },
  });
  const join = () => {
    const n = parseRoomInput(input.value);
    if (!n) return toast('Enter a room number', 'bad');
    sheet.close();
    location.hash = '#/room/' + n;
  };
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
      h('div.row.wrap', { style: 'justify-content:center;margin-top:12px' }, [h('span.muted', 'Or join a friend’s room:'), input, h('button.btn.tonal', { onclick: join }, 'Join')]),
    ]),
  ].flat().filter(Boolean)));
}

// ------------------------------------------------------------------ connecting
function showBusy(text) {
  S.mode = 'none';
  mount(S.view, h('div.waitscreen', h('div', [h('div.spinner'), h('h3', { style: 'font-size:20px' }, text), h('p.muted', { style: 'margin-top:6px' }, 'Connecting peer-to-peer…')])));
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

async function joinRoom(n) {
  if (S.room || S.joining) return;
  S.joining = true;
  try {
    const prof = await askProfile({ title: `Join room ${n}`, sub: 'Pick a name and a look — you can change them any time.', confirm: 'Join room' });
    if (!prof) { history.replaceState(null, '', '#/'); renderHome(); return; }
    showBusy(`Joining room ${n}…`);
    const room = await Room.join(n, S.profile);
    enterRoom(room);
  } catch (e) {
    toast(friendlyError(e), 'bad');
    history.replaceState(null, '', '#/');
    renderHome();
  } finally {
    S.joining = false;
  }
}

function friendlyError(e) {
  if (e.code === 'denied:version' && e.hostNewer) pwa.checkNow?.(); // we're the old one: fetch the new version now
  if (e.code === 'network') return 'Could not reach the matchmaking server. Check your internet connection.';
  if (e.code === 'notfound') return e.message;
  if (e.code === 'timeout') return e.message + '. Is the host still there?';
  return e.message || 'Something went wrong';
}

// ------------------------------------------------------------------ room shell + chat
function enterRoom(room) {
  S.room = room;
  keepAwake();
  S.mode = 'none';
  S.unread = 0;
  S.sheetOpen = false;
  S.resultsFor = 0;
  S.chat = createChat(room);
  const ui = (S.ui = {
    stage: h('div.stage'),
    lobby: null,
    float: h('div.chatfloat'),
    side: h('aside.chatside'),
    sheet: h('div.chatsheet'),
    sheetBack: h('div.sheetback', { onclick: () => toggleSheet(false) }),
  });
  S.chatBtn = iconBtn('chat_bubble', 'Chat', () => toggleSheet(true), 'chat-btn');
  S.chatBtn.classList.add('hide-wide');
  ui.barInput = h('input.txt', { placeholder: 'Say something…', maxlength: 300, autocomplete: 'off', enterkeyhint: 'send' });
  ui.bar = h('form.chatbar', {
    onsubmit: (e) => {
      e.preventDefault();
      const t = ui.barInput.value.trim();
      if (t) room.sendChat(t);
      ui.barInput.value = '';
    },
  }, ui.barInput, h('button.chatsend', { type: 'submit', 'aria-label': 'Send' }, icon('send')));
  S.av = new AV(room);
  S.avUI = createAvUI(room, S.av, { toast });
  document.body.append(ui.sheetBack, ui.sheet);
  mount(S.view, h('div.roomwrap', h('div.roommain', ui.stage, ui.float, ui.bar), S.avUI.dock, ui.side));
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
  ];
  applyChatLayout();
  onState();
}

function createChat(room) {
  const msgs = h('div.msgs');
  const input = h('input.txt', { placeholder: 'Message…', maxlength: 300, autocomplete: 'off', enterkeyhint: 'send' });
  const form = h('form', {
    onsubmit: (e) => {
      e.preventDefault();
      const t = input.value.trim();
      if (t) room.sendChat(t);
      input.value = '';
    },
  }, input, h('button.chatsend', { type: 'submit', 'aria-label': 'Send' }, icon('send')));
  const el = h('div.chat', msgs, form);
  const add = (m) => {
    const nearBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    const who = m.from ? room.player(m.from) : null;
    const mine = m.from === room.me;
    msgs.append(
      m.sys
        ? h('div.m.sys', h('div.bub', m.text))
        : h('div.m' + (mine ? '.me' : ''), who ? avatarEl(who, 'sm', { still: true }) : null, h('div.bub', mine ? null : h('b', { style: { color: `color-mix(in srgb, ${m.color} 62%, #000)` } }, m.name), m.text))
    );
    while (msgs.childNodes.length > 120) msgs.firstChild.remove();
    if (nearBottom || mine) msgs.scrollTop = msgs.scrollHeight;
  };
  room.chat.forEach(add);
  return { el, add, focus: () => input.focus(), scroll: () => { msgs.scrollTop = msgs.scrollHeight; } };
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
      mount(ui.side, head, S.chat.el);
      S.chat.scroll();
    }
  } else {
    ui.side.classList.remove('collapsed');
    ui.side.replaceChildren();
    if (S.sheetOpen) mount(ui.sheet, h('div.grab'), h('div.chathead', [h('span', 'Chat'), h('div.spacer'), iconBtn('close', 'Close chat', () => toggleSheet(false), 'sm')]), S.chat.el);
  }
  updateChatBadge();
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
  if (S.chatBtn) {
    S.chatBtn.querySelector('.dot')?.remove();
    if (S.unread > 0 && !wideMQ.matches) S.chatBtn.append(h('span.dot', S.unread > 9 ? '9+' : S.unread));
  }
  const ui = S.ui;
  if (ui && wideMQ.matches && S.chatCollapsed) {
    ui.side.querySelector('.dot')?.remove();
    if (S.unread > 0) ui.side.append(h('span.dot.static', S.unread > 9 ? '9+' : S.unread));
  }
}

function onChatMsg(m) {
  if (!S.ui) return;
  S.chat.add(m);
  const mine = m.from === S.room.me;
  if (wideMQ.matches) {
    if (S.chatCollapsed && !mine && !m.sys) { S.unread++; updateChatBadge(); }
  } else if (!S.sheetOpen) {
    const who = m.from ? S.room.player(m.from) : null;
    const f = h('div.fm' + (m.sys ? '.sys' : ''), m.sys ? m.text : [who ? avatarEl(who, 'xs', { still: true }) : null, h('b', m.name), h('span', m.text)]);
    S.ui.float.append(f);
    while (S.ui.float.childNodes.length > 3) S.ui.float.firstChild.remove();
    setTimeout(() => f.remove(), 7000);
    if (!mine && !m.sys) { S.unread++; updateChatBadge(); }
  }
  if (!m.sys && !mine) sfx('msg');
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
  S.avUI?.destroy(); S.av?.dispose();
  S.avUI = null; S.av = null; S.chatBtn = null;
  S.ui = null;
  S.chat = null;
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
  const busy = st.phase !== 'lobby' || (host && S.room.players.length > 1);
  if (busy) {
    const ok = await confirmDialog(host ? 'Close this room?' : 'Leave this room?', host ? 'You are the host — leaving closes the room for everyone.' : 'You’ll leave the game and the room.', { ok: host ? 'Close room' : 'Leave', danger: true });
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
  const mine = g.playerIds.includes(room.me);
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
  setTitle(`Room ${S.room.number} — Game Night`);
  mount(S.ui.stage, h('div.lobby', [h('div.colL', [L.invite, L.players]), h('div.colR', [L.game]), L.start]));
  S.ui.lobby.start.style.gridColumn = '1 / -1';
  applyChatLayout();
}

function updateLobby() {
  const room = S.room;
  const L = S.ui.lobby;
  const st = room.state;
  const link = roomLink(room.number);

  mount(L.invite,
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
    h('div.plist', st.players.map((p) => h('div.prow', [
      h('div.avwrap', avatarEl(p, 'lg'), p.id === st.hostId ? h('span.crown', icon('star')) : null),
      h('div.grow', [h('div.pname', p.name + (p.id === room.me ? ' (you)' : '')), !p.online ? h('div.tag', 'reconnecting…') : p.id === st.hostId ? h('div.tag', 'Host') : null]),
      room.isHost && p.id !== room.me ? h('button.iconbtn.sm', { title: 'Remove player', 'aria-label': 'Remove ' + p.name, onclick: async () => { if (await confirmDialog(`Remove ${p.name}?`, 'They can rejoin with the link unless you lock the room.', { ok: 'Remove', danger: true })) room.kick(p.id); } }, icon('close')) : null,
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
      : h('div.panel', { style: 'text-align:center;padding:14px' }, h('span.muted', problem ? 'Waiting for more players…' : 'Waiting for the host to start…'))
  );
}

function openPicker() {
  const room = S.room;
  if (!room?.isHost) return;
  const sheet = openSheet(
    h('div.col', [
      h('h2', 'Choose a game'),
      h('div.grid.picker', GAMES.map((g) => gameCard(g, (d) => { room.setGame(d.id); sheet.close(); }))),
    ]),
    { wide: true }
  );
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
  setTitle(`${def.name} — Room ${room.number}`);
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
  S.session = new GameSession({ room, def, mod, run: g, root, toast });
  S.session.updatePlayers();
  updateResults();
  // first time in this game on this device? show the rules briefly
  const seen = readPref('gn.seen.' + def.id);
  if (!seen) { writePref('gn.seen.' + def.id, '1'); setTimeout(() => { if (S.session && S.mode === 'game') toast('Tip: tap the ? button any time for the rules'); }, 1200); }
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
      room.isHost
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
  const m = /^#\/room\/(\d+)/.exec(hash);
  if (m) {
    const n = +m[1];
    if (S.room) {
      if (S.room.number === n) return;
      if (!(await confirmDialog(`Leave room ${S.room.number}?`, `Join room ${n} instead.`, { ok: 'Switch rooms', danger: true }))) { history.replaceState(null, '', '#/room/' + S.room.number); return; }
      teardownRoom();
    }
    return joinRoom(n);
  }
  if (S.room) {
    if (!(await confirmDialog(`Leave room ${S.room.number}?`, 'You’ll go back to the home screen.', { ok: 'Leave', danger: true }))) { history.replaceState(null, '', '#/room/' + S.room.number); return; }
    teardownRoom();
  }
  renderHome();
  const g = /^#\/game\/([\w-]+)/.exec(hash);
  if (g && GAME_BY_ID[g[1]]) openGameSheet(GAME_BY_ID[g[1]]);
}

// Keep phones awake while in a room — a sleeping screen drops the connection.
let wakeLock = null;
async function keepAwake() {
  try { if (S.room && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* not allowed */ }
}

function boot() {
  S.headerEl = h('header.top');
  S.view = h('main#view');
  mount($app, S.headerEl, S.view);
  renderHeader();
  addEventListener('hashchange', route);
  addEventListener('pagehide', () => { if (S.room?.isHost) S.room.leave(); });
  addEventListener('beforeunload', (e) => {
    if (S.room && S.room.state.phase !== 'lobby') { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('pointerdown', () => { audioContext(); keepAwake(); }, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
  window.__pwa = pwa;
  if (ENV_TAG) document.body.append(h('div.envpill', ENV_TAG.replace(/[\[\]]/g, '') + ' · ' + CFG.build));
  // reload for a waiting update only when nobody is in the middle of anything
  initPwa(() => !S.room && !S.joining && !document.querySelector('.sheet, .dialog, .scrim') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || ''));
  route();
}

window.__gn = S; // handy for debugging in the console
boot();
