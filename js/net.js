// Peer-to-peer room networking on top of PeerJS (WebRTC data channels).
//
// * There is no game server. Room N is simply the PeerJS id "<prefix>N".
//   Creating a room claims the lowest free N (1, 2, 3 ...), so room numbers count
//   up from 1 and are re-used as soon as a room closes.
// * The creator is the HOST: it owns the room state and is the authority for games.
//   Everybody else is a GUEST with a single connection to the host (star topology).
// * Guests that lose their connection (phone locks, wifi blip, page reload) get a
//   grace period to reconnect and keep their seat.

import { Emitter, sleep, uid } from './util.js';
import { sanitizeAvatar } from './avatar.js';

/** Wire-protocol version. Bump it ONLY when a change makes old and new clients unable to play together
 *  (message shapes, game rules the host and guests must agree on). People on different protocol versions
 *  are asked to update instead of joining a broken room; same protocol + different build is fine. */
export const PROTO = 1;

export const CFG = Object.assign(
  {
    env: 'local', // 'local' | 'dev' | 'prod' — stamped by scripts/build.mjs
    build: 'local', // build id, e.g. 20261009.0412-ab12cd3
    prefix: 'gnight-local-v1-', // room namespace; prod uses 'gnight-v1-' (set in config.js)
    maxRooms: 999,
    maxPlayers: 12,
    graceMs: 45000,
    peer: {}, // custom PeerJS server: {host, port, path, secure, key}
  },
  window.GAME_NIGHT_CONFIG || {}
);

export const COLORS = [
  '#ff5c7a', '#4cc9f0', '#ffd166', '#06d6a0', '#b388ff', '#ff9f43',
  '#2ec4b6', '#f15bb5', '#9ef01a', '#5b8cff', '#ff7b54', '#c3b1e1',
];

// RTCDataChannel messages above ~16 KB are silently dropped by some peers, so big payloads (drawings, photos)
// are split into small 'ch' frames and reassembled on arrival.
const CHUNK = 5000;
function sendConn(conn, msg) {
  if (!conn || !conn.open) return;
  const s = JSON.stringify(msg);
  if (s.length <= CHUNK) { conn.send(msg); return; }
  const id = Math.random().toString(36).slice(2, 9), n = Math.ceil(s.length / CHUNK);
  for (let i = 0; i < n; i++) conn.send({ t: 'ch', id, i, n, s: s.slice(i * CHUNK, (i + 1) * CHUNK) });
}
const asm = new Map();
function unchunk(key, msg) {
  if (msg.t !== 'ch') return msg;
  const k = key + ':' + msg.id;
  let a = asm.get(k);
  if (!a) {
    a = { n: msg.n, parts: [], c: 0, ts: Date.now() };
    asm.set(k, a);
    for (const [kk, v] of asm) if (Date.now() - v.ts > 60000) asm.delete(kk);
  }
  if (a.parts[msg.i] === undefined) { a.parts[msg.i] = msg.s; a.c++; }
  if (a.c < a.n) return null;
  asm.delete(k);
  try { return JSON.parse(a.parts.join('')); } catch { return null; }
}

export class RoomError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function peerOptions() {
  const o = { debug: 0, ...CFG.peer };
  const sig = new URLSearchParams(location.search).get('signal'); // e.g. ?signal=localhost:9000 (dev/testing)
  if (sig) {
    const [host, port] = sig.split(':');
    Object.assign(o, { host, port: +port || 9000, path: '/', secure: false });
  }
  return o;
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    if (typeof window.Peer !== 'function') return reject(new RoomError('browser', 'PeerJS failed to load'));
    let peer;
    try {
      peer = id ? new window.Peer(id, peerOptions()) : new window.Peer(peerOptions());
    } catch (e) {
      return reject(new RoomError('browser', e.message));
    }
    const done = () => { clearTimeout(to); peer.off('open', onOpen); peer.off('error', onErr); };
    const to = setTimeout(() => {
      done();
      try { peer.destroy(); } catch { /* */ }
      reject(new RoomError('network', 'Could not reach the matchmaking server'));
    }, 12000);
    const onOpen = () => { done(); resolve(peer); };
    const onErr = (e) => {
      done();
      try { peer.destroy(); } catch { /* */ }
      const code = e.type === 'unavailable-id' ? 'taken' : ['network', 'socket-error', 'socket-closed', 'server-error'].includes(e.type) ? 'network' : e.type || 'peer';
      reject(new RoomError(code, e.message || String(e)));
    };
    peer.on('open', onOpen);
    peer.on('error', onErr);
  });
}

/** Claim the lowest free room number. Probes a few numbers in parallel for speed. */
async function claimRoom() {
  const B = 3;
  for (let base = 1; base <= CFG.maxRooms; base += B) {
    const tries = [];
    for (let n = base; n < base + B && n <= CFG.maxRooms; n++) {
      tries.push(openPeer(CFG.prefix + n).then((peer) => ({ n, peer }), (err) => ({ n, err })));
    }
    const res = await Promise.all(tries);
    const ok = res.filter((r) => r.peer).sort((a, b) => a.n - b.n);
    if (ok.length) {
      ok.slice(1).forEach((r) => { try { r.peer.destroy(); } catch { /* */ } });
      return { peer: ok[0].peer, number: ok[0].n };
    }
    const fatal = res.find((r) => r.err && r.err.code !== 'taken');
    if (fatal) throw fatal.err;
  }
  throw new RoomError('full', 'All rooms are busy right now');
}

export function getClientId() {
  try {
    let id = sessionStorage.getItem('gn.cid');
    if (!id) { id = uid(16); sessionStorage.setItem('gn.cid', id); }
    return id;
  } catch { return uid(16); }
}

export function roomLink(n) {
  return location.origin + location.pathname + '#/room/' + n;
}

/** Accepts "5", "#5", "room 5" or a full invite link; returns the room number or null. */
export function parseRoomInput(text) {
  if (!text) return null;
  text = String(text).trim();
  let m = /room\/(\d{1,4})/i.exec(text);
  if (!m) m = /^\D{0,12}(\d{1,4})\D*$/.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);

export class Room extends Emitter {
  constructor() {
    super();
    this.isHost = false;
    this.me = null;
    this.number = 0;
    this.state = null;
    this.chat = [];
    this.rtt = 0;
    this.connected = true;
    this._leaving = false;
    this._gBuf = [];
    this._gHandler = null;
  }

  get players() { return this.state?.players || []; }
  player(id) { return this.players.find((p) => p.id === id); }
  get hostId() { return this.state?.hostId || 'p1'; }
  get runId() { return this.state?.game?.runId || 0; }

  // ---------------------------------------------------------------- creating / joining
  static async create(profile) {
    const { peer, number } = await claimRoom();
    const room = new Room();
    room.isHost = true;
    room.peer = peer;
    room.number = number;
    room.profile = profile;
    room.clientId = getClientId();
    room.recs = new Map();
    room.conns = new Map();
    room.kicked = new Set();
    room._seq = 0;
    room._v = 0;
    room._runSeq = 0;
    room._players = [];
    room._st = { number, hostId: 'p1', gameId: null, opts: {}, locked: false, phase: 'lobby', game: null, results: null };
    const me = room._addPlayer(room.clientId, profile);
    me.pid = peer.id;
    room.me = me.id;
    room._publish();
    room._hostInit();
    return room;
  }

  static async join(number, profile) {
    const room = new Room();
    room.number = number;
    room.profile = profile;
    room.clientId = getClientId();
    room.peer = await openPeer();
    room.peer.on('disconnected', () => { try { if (!room._leaving && !room.peer.destroyed) room.peer.reconnect(); } catch { /* */ } });
    try {
      await room._connectToHost(true);
    } catch (e) {
      try { room.peer.destroy(); } catch { /* */ }
      throw e;
    }
    room._guestInit();
    return room;
  }

  // ---------------------------------------------------------------- host side
  _addPlayer(clientId, prof) {
    const id = 'p' + (++this._seq);
    const used = new Set(this._players.map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[this._seq % COLORS.length];
    let name = cleanName(prof.name) || 'Player ' + this._seq;
    const base = name;
    for (let i = 2; this._players.some((p) => p.name === name); i++) name = base + ' ' + i;
    const p = { id, name, avatar: sanitizeAvatar(prof.avatar), color, online: true, pid: '', av: { on: 0, mic: 0, cam: 0 } };
    this._players.push(p);
    this.recs.set(id, { clientId, lastSeen: Date.now(), timer: null, p });
    return p;
  }

  _hostInit() {
    this.peer.on('connection', (conn) => this._onConn(conn));
    this.peer.on('disconnected', () => { try { if (!this._leaving && !this.peer.destroyed) this.peer.reconnect(); } catch { /* */ } });
    this.peer.on('error', (e) => console.warn('[peer]', e.type, e.message));
    this._hb = setInterval(() => this._hostTick(), 3000);
  }

  _onConn(conn) {
    let pid = null;
    const t = setTimeout(() => { if (!pid) try { conn.close(); } catch { /* */ } }, 10000);
    conn.on('data', (raw) => {
      if (!raw || typeof raw !== 'object') return;
      const msg = unchunk(conn.peer, raw);
      if (!msg) return;
      if (!pid) {
        if (msg.t === 'hello') pid = this._onHello(conn, msg);
        return;
      }
      const rec = this.recs.get(pid);
      if (rec) rec.lastSeen = Date.now();
      if (this.conns.get(pid) === conn) this._onGuestMsg(pid, msg);
    });
    conn.on('close', () => { clearTimeout(t); if (pid) this._onConnClosed(pid, conn); });
    conn.on('error', () => {});
  }

  _send(conn, msg) {
    try { sendConn(conn, msg); } catch (e) { console.warn('send failed', e); }
  }

  _onHello(conn, msg) {
    // Different wire-protocol versions can't play together: tell the guest which side is older.
    if ((msg.v || 1) !== PROTO) { this._send(conn, { t: 'denied', reason: 'version', v: PROTO, b: CFG.build }); setTimeout(() => conn.close(), 200); return null; }
    const cid = String(msg.cid || '').slice(0, 40);
    if (!cid || this.kicked.has(cid)) { this._send(conn, { t: 'denied', reason: 'kicked' }); setTimeout(() => conn.close(), 200); return null; }
    let rec = [...this.recs.values()].find((r) => r.clientId === cid);
    if (rec) {
      const old = this.conns.get(rec.p.id);
      if (old && old !== conn) { this.conns.delete(rec.p.id); try { old.close(); } catch { /* */ } }
      this.conns.set(rec.p.id, conn);
      clearTimeout(rec.timer);
      rec.lastSeen = Date.now();
      rec.p.online = true;
      rec.p.pid = conn.peer;
      const nm = cleanName(msg.name);
      if (nm && nm !== rec.p.name && !this._players.some((p) => p !== rec.p && p.name === nm)) rec.p.name = nm;
      this._send(conn, { t: 'welcome', id: rec.p.id, state: this._buildState(), chat: this.chat.slice(-30), v: PROTO, b: CFG.build });
      this._publish();
      const g = this._st.game;
      if (this._st.phase !== 'lobby' && g && g.playerIds.includes(rec.p.id)) {
        setTimeout(() => this.emit('rejoin', rec.p.id), 150);
      }
      this._sys(rec.p.name + ' reconnected');
      return rec.p.id;
    }
    if (this._st.locked) { this._send(conn, { t: 'denied', reason: 'locked' }); setTimeout(() => conn.close(), 200); return null; }
    if (this._players.length >= CFG.maxPlayers) { this._send(conn, { t: 'denied', reason: 'full' }); setTimeout(() => conn.close(), 200); return null; }
    const p = this._addPlayer(cid, msg);
    p.pid = conn.peer;
    this.conns.set(p.id, conn);
    this._send(conn, { t: 'welcome', id: p.id, state: this._buildState(), chat: this.chat.slice(-30), v: PROTO, b: CFG.build });
    this._publish();
    this._sys(p.name + ' joined');
    this.emit('joined', p.id);
    return p.id;
  }

  _onConnClosed(pid, conn) {
    if (this.conns.get(pid) !== conn) return;
    this.conns.delete(pid);
    const rec = this.recs.get(pid);
    if (!rec) return;
    rec.p.online = false;
    clearTimeout(rec.timer);
    rec.timer = setTimeout(() => this._removePlayer(pid), CFG.graceMs);
    this._publish();
  }

  _removePlayer(pid, why) {
    const rec = this.recs.get(pid);
    if (!rec || pid === this.me) return;
    clearTimeout(rec.timer);
    this.recs.delete(pid);
    const conn = this.conns.get(pid);
    this.conns.delete(pid);
    if (conn) try { conn.close(); } catch { /* */ }
    this._players = this._players.filter((p) => p.id !== pid);
    this._sys(rec.p.name + (why === 'kick' ? ' was removed' : ' left'));
    this._publish();
    this.emit('left', pid);
  }

  _hostTick() {
    const now = Date.now();
    for (const [pid, conn] of this.conns) {
      const rec = this.recs.get(pid);
      if (rec && now - rec.lastSeen > 15000) {
        this._onConnClosed(pid, conn);
        try { conn.close(); } catch { /* */ }
      }
    }
  }

  _onGuestMsg(pid, msg) {
    switch (msg.t) {
      case 'ping': this._send(this.conns.get(pid), { t: 'pong', ts: msg.ts }); break;
      case 'chat': this._chat(pid, msg.text); break;
      case 'g': this._deliverG(msg.k, msg.d, pid, msg.r); break;
      case 'profile': {
        const p = this.recs.get(pid)?.p;
        if (!p) break;
        const nm = cleanName(msg.name);
        if (nm && !this._players.some((q) => q !== p && q.name === nm)) p.name = nm;
        if (msg.avatar && typeof msg.avatar === 'object') p.avatar = sanitizeAvatar(msg.avatar);
        this._publish();
        break;
      }
      case 'av': {
        const p = this.recs.get(pid)?.p;
        if (!p) break;
        p.av = { on: msg.on ? 1 : 0, mic: msg.mic ? 1 : 0, cam: msg.cam ? 1 : 0 };
        this._publish();
        break;
      }
      case 'bye': this._removePlayer(pid); break;
      default: break;
    }
  }

  _buildState() {
    return { ...this._st, players: this._players.map((p) => ({ ...p })), v: ++this._v };
  }

  _publish() {
    this.state = this._buildState();
    const msg = { t: 'state', state: this.state };
    for (const conn of this.conns.values()) this._send(conn, msg);
    this.emit('state', this.state);
  }

  _bcast(msg, exceptId) {
    for (const [pid, conn] of this.conns) if (pid !== exceptId) this._send(conn, msg);
  }

  // ---- host controls (lobby)
  setGame(gameId) {
    if (!this.isHost || this._st.phase !== 'lobby') return;
    this._st.gameId = gameId;
    this._st.opts = {};
    this._publish();
  }
  setOpt(key, value) {
    if (!this.isHost || this._st.phase !== 'lobby') return;
    this._st.opts = { ...this._st.opts, [key]: value };
    this._publish();
  }
  setLocked(b) {
    if (!this.isHost) return;
    this._st.locked = !!b;
    this._publish();
  }
  kick(pid) {
    if (!this.isHost || pid === this.me) return;
    const rec = this.recs.get(pid);
    if (!rec) return;
    this.kicked.add(rec.clientId);
    this._send(this.conns.get(pid), { t: 'kick' });
    this._removePlayer(pid, 'kick');
  }
  startGame(gameId, opts, playerIds) {
    if (!this.isHost) return;
    const st = this._st;
    st.gameId = gameId;
    st.opts = { ...opts };
    st.phase = 'playing';
    st.results = null;
    st.game = { runId: ++this._runSeq, gameId, opts: { ...opts }, seed: (Math.random() * 2 ** 32) >>> 0, playerIds: [...playerIds] };
    this._publish();
  }
  endGame(result) {
    if (!this.isHost || this._st.phase !== 'playing') return;
    this._st.phase = 'results';
    this._st.results = result || {};
    this._publish();
  }
  toLobby() {
    if (!this.isHost) return;
    this._st.phase = 'lobby';
    this._st.game = null;
    this._st.results = null;
    this._publish();
  }

  // ---------------------------------------------------------------- guest side
  _connectToHost(first) {
    return new Promise((resolve, reject) => {
      let conn;
      try {
        conn = this.peer.connect(CFG.prefix + this.number, { reliable: true, serialization: 'json' });
      } catch (e) {
        return reject(new RoomError('network', e.message));
      }
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(to);
        this.peer.off('error', onPeerErr);
        if (err) { try { conn.close(); } catch { /* */ } reject(err); } else resolve();
      };
      const to = setTimeout(() => finish(new RoomError('timeout', `Room ${this.number} did not respond`)), 12000);
      const onPeerErr = (e) => {
        if (e.type === 'peer-unavailable') finish(new RoomError('notfound', `Room ${this.number} doesn't exist (anymore)`));
      };
      this.peer.on('error', onPeerErr);
      conn.on('open', () => {
        conn.send({ t: 'hello', cid: this.clientId, name: this.profile.name, avatar: this.profile.avatar, v: PROTO, b: CFG.build });
      });
      conn.on('data', (raw) => {
        if (!raw || typeof raw !== 'object') return;
        this._lastRx = Date.now();
        const msg = unchunk('host', raw);
        if (!msg) return;
        if (!settled) {
          if (msg.t === 'welcome') {
            this.conn = conn;
            this.me = msg.id;
            this.state = msg.state;
            this.chat = msg.chat || [];
            finish();
            this.emit('state', this.state);
          } else if (msg.t === 'denied') {
            const why = msg.reason === 'locked' ? 'This room is locked by the host' : msg.reason === 'full' ? 'This room is full'
              : msg.reason === 'version' ? ((msg.v || 1) > PROTO ? 'This room runs a newer version of the game. Reload the page to update, then join again.' : 'This room’s host is on an older version. Ask them to reload the page, then join again.')
              : 'You cannot join this room';
            const err = new RoomError('denied:' + msg.reason, why);
            if (msg.reason === 'version') err.hostNewer = (msg.v || 1) > PROTO;
            finish(err);
          }
          return;
        }
        if (this.conn === conn) this._onHostMsg(msg);
      });
      conn.on('close', () => {
        if (!settled) finish(new RoomError('closed', 'Connection closed'));
        else if (this.conn === conn) this._onHostLost();
      });
      conn.on('error', () => {});
    });
  }

  _guestInit() {
    this._lastRx = Date.now();
    this._hb = setInterval(() => {
      if (this._leaving || !this.connected) return;
      this._sendHost({ t: 'ping', ts: Date.now() });
      if (Date.now() - this._lastRx > 14000) this._onHostLost();
    }, 4000);
  }

  _sendHost(msg) {
    try { sendConn(this.conn, msg); } catch (e) { console.warn('send failed', e); }
  }

  _onHostMsg(msg) {
    switch (msg.t) {
      case 'state':
        if (msg.state.v < (this.state?.v || 0)) break;
        this.state = msg.state;
        // drop buffered game messages from older runs
        this._gBuf = this._gBuf.filter((m) => m.r >= this.runId);
        this.emit('state', this.state);
        break;
      case 'chat': this._pushChat(msg.m); break;
      case 'g': this._deliverG(msg.k, msg.d, msg.f, msg.r); break;
      case 'pong': this.rtt = Date.now() - msg.ts; break;
      case 'kick': this._closeRoom('kicked'); break;
      case 'closed': this._closeRoom('host-left'); break;
      default: break;
    }
  }

  _onHostLost() {
    if (this._leaving || this._reconnecting) return;
    this._reconnecting = true;
    this.connected = false;
    try { this.conn?.close(); } catch { /* */ }
    this.emit('conn', false);
    (async () => {
      const t0 = Date.now();
      while (!this._leaving && Date.now() - t0 < CFG.graceMs) {
        try {
          if (this.peer.destroyed) break;
          if (this.peer.disconnected) this.peer.reconnect();
          await this._connectToHost(false);
          this.connected = true;
          this._reconnecting = false;
          this._lastRx = Date.now();
          this.emit('conn', true);
          return;
        } catch (e) {
          if (String(e.code).startsWith('denied')) break;
          await sleep(1500);
        }
      }
      this._reconnecting = false;
      if (!this._leaving) this._closeRoom('lost');
    })();
  }

  _closeRoom(reason) {
    if (this._closed) return;
    this._closed = true;
    this._leaving = true;
    clearInterval(this._hb);
    for (const r of this.recs?.values() || []) clearTimeout(r.timer);
    try { this.peer.destroy(); } catch { /* */ }
    this.emit('closed', reason);
  }

  // ---------------------------------------------------------------- chat
  _pushChat(m) {
    this.chat.push(m);
    if (this.chat.length > 100) this.chat.shift();
    this.emit('chat', m);
  }
  _chat(pid, text) {
    text = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
    const p = this.recs.get(pid)?.p;
    if (!text || !p) return;
    const m = { id: ++this._seq + ':' + Date.now(), from: pid, name: p.name, color: p.color, text, ts: Date.now() };
    this._pushChat(m);
    this._bcast({ t: 'chat', m });
  }
  _sys(text) {
    if (!this.isHost) return;
    const m = { id: 's' + Date.now() + Math.random(), sys: true, text, ts: Date.now() };
    this._pushChat(m);
    this._bcast({ t: 'chat', m });
  }
  sendChat(text) {
    if (this.isHost) this._chat(this.me, text);
    else this._sendHost({ t: 'chat', text });
  }
  setProfile(profile) {
    this.profile = profile;
    if (this.isHost) this._onGuestMsg(this.me, { t: 'profile', ...profile });
    else this._sendHost({ t: 'profile', ...profile });
  }
  /** Tell everyone whether I'm in the voice/video call and whether my mic / camera are live. */
  setAv(av) {
    if (this.isHost) this._onGuestMsg(this.me, { t: 'av', ...av });
    else this._sendHost({ t: 'av', ...av });
  }
  /** Host-side system message (game events) */
  systemMessage(text) { this._sys(text); }

  // ---------------------------------------------------------------- game message transport
  /** Guest -> host (or loop back locally if we are the host) */
  gToHost(k, d) {
    if (this.isHost) this._deliverG(k, d, this.me, this.runId);
    else this._sendHost({ t: 'g', k, d, r: this.runId });
  }
  /** Host -> everyone (including itself) */
  gBroadcast(k, d, exceptId) {
    if (!this.isHost) return;
    this._bcast({ t: 'g', k, d, f: this.me, r: this.runId }, exceptId);
    if (exceptId !== this.me) this._deliverG(k, d, this.me, this.runId);
  }
  gSendTo(id, k, d) {
    if (!this.isHost) return;
    if (id === this.me) return this._deliverG(k, d, this.me, this.runId);
    this._send(this.conns.get(id), { t: 'g', k, d, f: this.me, r: this.runId });
  }
  _deliverG(k, d, from, r) {
    const cur = this.runId;
    if (r < cur) return; // stale
    if (r > cur || !this._gHandler || this._gHandler.runId !== r) {
      if (this._gBuf.length < 800) this._gBuf.push({ k, d, from, r });
      return;
    }
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

  // ---------------------------------------------------------------- media (WebRTC audio/video)
  /** Call another room member's peer id with `stream`. kind: 'av' (voice/video chat) or 'game' (a game's stream). */
  callPeer(peerId, stream, kind = 'game') {
    try { return this.peer.call(peerId, stream, { metadata: { kind, r: this.runId } }); } catch (e) { console.warn('call failed', e); return null; }
  }
  /** Be notified of incoming media calls. Returns an unsubscribe function. */
  onMediaCall(fn) {
    const handler = (call) => fn(call);
    this.peer.on('call', handler);
    return () => this.peer.off('call', handler);
  }

  // ---------------------------------------------------------------- leaving
  leave() {
    if (this._leaving) return;
    this._leaving = true;
    clearInterval(this._hb);
    if (this.isHost) {
      this._bcast({ t: 'closed' });
    } else {
      this._sendHost({ t: 'bye' });
    }
    setTimeout(() => { try { this.peer.destroy(); } catch { /* */ } }, 350);
  }
}
