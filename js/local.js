// LocalRoom: a one-device "room" for playing against the computer (or pass-and-play) — same interface as the
// networked Room, but there is no network at all. It works offline and starts instantly, and every game runs
// completely unchanged because games only ever talk to the room through the session `api`.
import { Emitter } from './util.js';
import { sanitizeAvatar } from './avatar.js';
import { makeBot } from './bots.js';
import { CFG, COLORS, wireCopy } from './net.js';

export class LocalRoom extends Emitter {
  /** `players` + `me` let a turn-by-turn match put two real people in the room while only one of them is on this device. */
  constructor(profile, { autopilot, players, me } = {}) {
    super();
    this.local = true;
    this.isHost = true;
    this.me = me || 'p1';
    this.number = 0;
    this.chat = [];
    this.rtt = 0;
    this.connected = true;
    this.peer = null;
    this.profile = profile;
    this.autopilot = CFG.env !== 'prod' && autopilot ? autopilot : false; // test hook: the human (or, with 'me', just this device's seat) is driven by the same brain as the bots
    this._seq = 1;
    this._v = 0;
    this._runSeq = 0;
    this._gBuf = [];
    this._gHandler = null;
    this._players = players
      ? players.map((p, i) => ({ id: p.id, name: p.name, avatar: sanitizeAvatar(p.avatar), color: COLORS[i], online: true, pid: '', av: { on: 0, mic: 0, cam: 0 }, ...(p.bot ? { bot: true, level: p.level || 'normal' } : {}) }))
      : [{ id: 'p1', name: String(profile.name || 'You').slice(0, 16), avatar: sanitizeAvatar(profile.avatar), color: COLORS[0], online: true, pid: '', av: { on: 0, mic: 0, cam: 0 } }];
    this._seq = Math.max(this._seq, this._players.length);
    this._st = { number: 0, hostId: 'p1', gameId: null, opts: {}, locked: false, phase: 'lobby', game: null, results: null, botLevel: 'normal' };
    this._publish();
  }

  get players() { return this.state?.players || []; }
  get audience() { return []; }
  get people() { return this.players; }
  get isAudience() { return false; }
  player(id) { return this.players.find((p) => p.id === id); }
  person(id) { return this.player(id); }
  get hostId() { return this.me; }
  get runId() { return this.state?.game?.runId || 0; }

  _publish() {
    this.state = { ...this._st, players: this._players.map((p) => ({ ...p })), v: ++this._v };
    this.emit('state', this.state);
  }

  // ---- computer players
  addBot(level) {
    const id = 'b' + (++this._seq);
    const b = makeBot(this._players, id, level || this._st.botLevel);
    const used = new Set(this._players.map((p) => p.color));
    b.color = COLORS.find((c) => !used.has(c)) || b.color;
    this._players.push(b);
    this._publish();
    return id;
  }
  removeBot(id) {
    const i = this._players.findIndex((p) => p.id === id && p.bot);
    if (i < 0) return;
    this._players.splice(i, 1);
    this._publish();
  }
  setBotLevel(level) {
    this._st.botLevel = level;
    for (const p of this._players) if (p.bot) p.level = level;
    this._publish();
  }

  // ---- host controls (same names as Room)
  setGame(gameId) { if (this._st.phase !== 'lobby') return; this._st.gameId = gameId; this._st.opts = {}; this._publish(); }
  setOpt(key, value) { if (this._st.phase !== 'lobby') return; this._st.opts = { ...this._st.opts, [key]: value }; this._publish(); }
  setLocked() { /* nobody else can join */ }
  setSetting() { /* online-only settings */ }
  approve() {} deny() {} promote() {} askToPlay() {}
  kick(id) { this.removeBot(id); }
  startGame(gameId, opts, playerIds, extra = {}) {
    const st = this._st;
    st.gameId = gameId;
    st.opts = { ...opts };
    st.phase = 'playing';
    st.results = null;
    st.game = { runId: ++this._runSeq, gameId, opts: { ...opts }, seed: (Math.random() * 2 ** 32) >>> 0, playerIds: [...playerIds], ...extra };
    this._publish();
  }
  endGame(result) { if (this._st.phase !== 'playing') return; this._st.phase = 'results'; this._st.results = result || {}; this._publish(); }
  toLobby() { this._st.phase = 'lobby'; this._st.game = null; this._st.results = null; this._publish(); }

  // ---- chat (just you, but the panel still works)
  sendChat(text) {
    text = String(text || '').trim().slice(0, 300);
    if (!text) return;
    const p = this._players.find((x) => x.id === this.me) || this._players[0];
    const m = { id: ++this._seq + ':' + Date.now(), from: this.me, name: p.name, color: p.color, text, ts: Date.now() };
    this.chat.push(m);
    this.emit('chat', m);
  }
  systemMessage() { /* no system chatter offline */ }
  setProfile(profile) {
    this.profile = profile;
    const p = this._players.find((x) => x.id === this.me) || this._players[0];
    p.name = String(profile.name || p.name).slice(0, 16);
    if (profile.avatar) p.avatar = sanitizeAvatar(profile.avatar);
    this._publish();
  }
  setAv() { /* no calls offline */ }

  // ---- game message transport (everything is local, delivered synchronously like the host's own messages)
  gToHost(k, d) { this._deliverG(k, wireCopy(d), this.me, this.runId); }
  gBroadcast(k, d, exceptId) { if (exceptId !== this.me) this._deliverG(k, wireCopy(d), this.me, this.runId); }
  gSendTo(id, k, d) { if (id === this.me) this._deliverG(k, wireCopy(d), this.me, this.runId); }
  _deliverG(k, d, from, r) {
    const cur = this.runId;
    if (r < cur) return;
    if (r > cur || !this._gHandler || this._gHandler.runId !== r) { if (this._gBuf.length < 800) this._gBuf.push({ k, d, from, r }); return; }
    try { this._gHandler.fn(k, d, from); } catch (e) { console.error('[game msg]', k, e); }
  }
  attachGame(runId, fn) {
    this._gHandler = { runId, fn };
    const buf = this._gBuf;
    this._gBuf = [];
    for (const m of buf) {
      if (m.r === runId) this._deliverG(m.k, m.d, m.from, m.r);
      else if (m.r > runId) this._gBuf.push(m);
    }
  }
  detachGame() { this._gHandler = null; }

  // ---- no media offline
  callPeer() { return null; }
  onMediaCall() { return () => {}; }

  leave() { if (this._left) return; this._left = true; }
}
