// The Plaza: the app-wide "who is around" layer — a public list of open rooms, who is online, the global chat and the
// presence behind the Lounge voice channels. It runs over a free public MQTT broker (see mqtt.js), so there is still no
// server of ours; the games and calls themselves stay peer-to-peer.
//
//   rooms/<n>            retained  a room's card, re-published by its host every 30 s (cards older than ~2 min are ignored)
//   presence/<cid>       retained  a person: name, avatar, which room / Lounge channel they are in (cleared by the last-will)
//   chat/<channel>/<cid> retained  that person's latest message in a channel (so late arrivals see the recent conversation)
//   inbox/<cid>          live      invitations sent straight to one person
//
// Everything that arrives is from strangers: it is validated, length-limited and only ever shown as text.
import { Emitter, uid } from './util.js';
import { Mqtt } from './mqtt.js';
import { CFG, PROTO } from './net.js';
import { sanitizeAvatar } from './avatar.js';

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081'];
const ROOM_TTL = 120000;
const PRES_TTL = 110000;
const CHAT_TTL = 3600000;
export const LOUNGE_CHANNELS = [
  { id: 'v1', name: 'Lounge 1' }, { id: 'v2', name: 'Lounge 2' }, { id: 'v3', name: 'Lounge 3' }, { id: 'v4', name: 'Lounge 4' },
];
export const CHANNEL_CAP = 6; // voice/video is a full mesh of WebRTC calls: more than ~6 people gets heavy

const cleanText = (t, n) => String(t ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const slimAvatar = (a) => (a ? { c: a.c, e: a.e, m: a.m, a: a.a } : null);
const num = (v, d = 0, max = 1e9) => (Number.isFinite(+v) ? Math.max(0, Math.min(max, Math.trunc(+v))) : d);
const stamp = (v) => (Number.isFinite(+v) ? Math.max(0, Math.trunc(+v)) : 0); // a millisecond timestamp

function brokerUrls() {
  const o = new URLSearchParams(location.search).get('mqtt'); // e.g. ?mqtt=ws://127.0.0.1:1884 (testing)
  return o ? [o] : BROKERS;
}

export class Plaza extends Emitter {
  constructor() {
    super();
    this.root = `squattersnights/v1/${CFG.env}/`;
    this.cid = uid(12);
    this.profile = null;
    this.mq = null;
    this.rooms = new Map(); // number -> card
    this.people = new Map(); // cid -> presence
    this.chats = new Map(); // channel -> [msg]
    this.seen = new Set();
    this.muted = new Set(JSON.parse(localStorage.getItem('gn.muted') || '[]'));
    this.me = { room: null, priv: false, ch: null, av: { m: 0, c: 0 }, pid: null };
    this.hosting = null;
    this._rate = new Map();
    this.connected = false;
  }

  // ------------------------------------------------------------------ lifecycle
  start(profile) {
    if (this.mq) return;
    this.profile = profile;
    this.mq = new Mqtt({ urls: brokerUrls(), clientId: 'sqn-' + this.cid, will: { topic: this.root + 'presence/' + this.cid, payload: '', retain: true } });
    this.mq.on('connect', () => { this.connected = true; this._announce(); this.emit('connection', true); });
    this.mq.on('disconnect', () => { this.connected = false; this.emit('connection', false); });
    const r = this.root;
    this.mq.subscribe(r + 'rooms/+', (t, p, retained) => this._onRoom(t.slice(r.length + 6), p, retained));
    this.mq.subscribe(r + 'presence/+', (t, p, retained) => this._onPresence(t.slice(r.length + 9), p, retained));
    this.mq.subscribe(r + 'chat/+/+', (t, p, retained) => { const [, ch, cid] = t.slice(r.length).split('/'); this._onChat(ch, cid, p, retained); });
    this.mq.subscribe(r + 'inbox/' + this.cid, (t, p) => this._onInbox(p));
    this.mq.connect();
    this._tick = setInterval(() => this._housekeeping(), 15000);
    this._hb = setInterval(() => this._heartbeat(), 30000);
  }
  stop() { clearInterval(this._tick); clearInterval(this._hb); this.mq?.close(); this.mq = null; this.connected = false; }

  setProfile(profile) { this.profile = profile; this._announce(); }

  // ------------------------------------------------------------------ presence
  /** Tell everyone where I am: `room` (a room number), `ch` (a Lounge voice channel), `av` ({m: mic, c: camera}), `pid` (my Lounge call peer id). */
  setPresence(patch) { Object.assign(this.me, patch); this._announce(); }
  _announce() {
    if (!this.mq || !this.profile) return;
    const m = this.me;
    this.mq.publish(this.root + 'presence/' + this.cid, JSON.stringify({ n: this.profile.name, a: slimAvatar(this.profile.avatar), r: m.room, h: m.priv ? 1 : 0, c: m.ch, v: m.av, p: m.pid, ts: Date.now() }), { retain: true });
  }
  _heartbeat() { this._announce(); if (this.hosting) this._publishRoom(); }
  _onPresence(cid, payload, retained) {
    if (cid === this.cid) return;
    if (!payload) { if (this.people.delete(cid)) this.emit('people'); return; }
    let o; try { o = JSON.parse(payload); } catch { return; }
    if (!o || typeof o !== 'object') return;
    const ts = stamp(o.ts);
    if (retained && Date.now() - ts > PRES_TTL) { if (Date.now() - ts > 3600000) this.mq.publish(this.root + 'presence/' + cid, '', { retain: true }); return; }
    this.people.set(cid, {
      cid, name: cleanText(o.n, 16) || 'Guest', avatar: sanitizeAvatar(o.a), room: o.r ? num(o.r, 0, 9999) || null : null, priv: !!o.h,
      ch: typeof o.c === 'string' ? o.c.slice(0, 8) : null, av: { m: o.v?.m ? 1 : 0, c: o.v?.c ? 1 : 0 }, pid: typeof o.p === 'string' ? o.p.slice(0, 64) : null, seen: retained ? ts : Date.now(),
    });
    this.emit('people');
  }
  /** Everyone I can see (not me), newest activity first. */
  get online() { return [...this.people.values()].filter((p) => !this.muted.has(p.cid)).sort((a, b) => b.seen - a.seen); }
  /** People in a Lounge voice channel, me included if I'm in it. */
  channelMembers(ch) { return [...this.people.values()].filter((p) => p.ch === ch); }

  // ------------------------------------------------------------------ rooms
  /** Called by a room's host: keep the room's card up to date in the list while the room exists. */
  hostRoom(room) {
    this.unhostRoom();
    const refresh = () => { clearTimeout(this._rt); this._rt = setTimeout(() => this._publishRoom(), 900); };
    this.hosting = { room, off: [room.on('state', refresh), room.on('closed', () => this.unhostRoom())] };
    this._publishRoom();
  }
  unhostRoom() {
    const h = this.hosting;
    if (!h) return;
    this.hosting = null;
    clearTimeout(this._rt);
    h.off.forEach((f) => f());
    this.mq?.publish(this.root + 'rooms/' + h.room.number, '', { retain: true });
  }
  _publishRoom() {
    const h = this.hosting;
    if (!h || !this.mq) return;
    const room = h.room, st = room.state;
    const topic = this.root + 'rooms/' + room.number;
    if (!st.pub) { this.mq.publish(topic, '', { retain: true }); return; }
    const pl = st.players.filter((p) => !p.bot).slice(0, 8).map((p) => [cleanText(p.name, 16), slimAvatar(p.avatar), p.id === st.hostId ? 1 : 0]);
    this.mq.publish(topic, JSON.stringify({
      n: room.number, g: st.game?.gameId || st.gameId || null, ph: st.phase, pl, pc: st.players.filter((p) => !p.bot).length, bc: st.players.filter((p) => p.bot).length,
      au: st.audience.length, ac: st.access, ad: st.aud ? 1 : 0, b: CFG.build, pv: PROTO, ts: Date.now(),
    }), { retain: true });
  }
  _onRoom(key, payload, retained) {
    const n = num(key, 0, 9999);
    if (!n) return;
    if (!payload) { if (this.rooms.delete(n)) this.emit('rooms'); return; }
    let o; try { o = JSON.parse(payload); } catch { return; }
    if (!o || typeof o !== 'object' || num(o.n) !== n) return;
    const ts = stamp(o.ts);
    if (retained && Date.now() - ts > ROOM_TTL) { if (Date.now() - ts > 3600000) this.mq.publish(this.root + 'rooms/' + n, '', { retain: true }); return; } // stale card from a host that vanished
    this.rooms.set(n, {
      number: n, game: typeof o.g === 'string' ? o.g.slice(0, 24) : null, phase: o.ph === 'playing' || o.ph === 'results' ? o.ph : 'lobby',
      players: (Array.isArray(o.pl) ? o.pl : []).slice(0, 8).map((x) => ({ name: cleanText(x?.[0], 16) || 'Player', avatar: sanitizeAvatar(x?.[1]), host: !!x?.[2] })),
      count: num(o.pc, 0, 99), bots: num(o.bc, 0, 99), audience: num(o.au, 0, 999), access: ['open', 'ask', 'locked'].includes(o.ac) ? o.ac : 'ask', allowAudience: !!o.ad,
      build: cleanText(o.b, 40), proto: num(o.pv, 1, 99), seen: retained ? ts : Date.now(),
    });
    this.emit('rooms');
  }
  /** Live room cards (mine included), busiest first. */
  get openRooms() { return [...this.rooms.values()].sort((a, b) => (b.count + b.audience) - (a.count + a.audience) || a.number - b.number); }

  // ------------------------------------------------------------------ chat
  chat(channel = 'lounge') { return this.chats.get(channel) || []; }
  sendChat(text, channel = 'lounge') {
    text = cleanText(text, 300);
    if (!text || !this.mq || !this.profile) return false;
    const m = { i: uid(8), n: this.profile.name, a: slimAvatar(this.profile.avatar), t: text, s: Date.now() };
    this.mq.publish(this.root + `chat/${channel}/${this.cid}`, JSON.stringify(m), { retain: true });
    return true;
  }
  _onChat(ch, cid, payload, retained) {
    if (!payload || !/^[\w-]{1,24}$/.test(ch)) return;
    let o; try { o = JSON.parse(payload); } catch { return; }
    if (!o || typeof o.i !== 'string' || this.seen.has(o.i)) return;
    const ts = stamp(o.s);
    if (retained && Date.now() - ts > CHAT_TTL) { if (Date.now() - ts > 6 * CHAT_TTL) this.mq.publish(this.root + `chat/${ch}/${cid}`, '', { retain: true }); return; }
    if (cid !== this.cid) { // a stranger: ignore muted people and anybody flooding
      if (this.muted.has(cid)) return;
      const now = Date.now(), r = (this._rate.get(cid) || []).filter((t) => now - t < 10000);
      if (r.length >= 6) return;
      r.push(now); this._rate.set(cid, r);
    }
    this.seen.add(o.i);
    if (this.seen.size > 600) this.seen.delete(this.seen.values().next().value);
    const m = { id: o.i, from: cid, mine: cid === this.cid, name: cleanText(o.n, 16) || 'Guest', avatar: sanitizeAvatar(o.a), text: cleanText(o.t, 300), ts: Math.min(ts, Date.now()), history: !!retained };
    if (!m.text) return;
    const list = this.chats.get(ch) || [];
    list.push(m);
    list.sort((a, b) => a.ts - b.ts);
    while (list.length > 120) list.shift();
    this.chats.set(ch, list);
    this.emit('chat', ch, m);
  }
  mute(cid, on = true) {
    if (on) this.muted.add(cid); else this.muted.delete(cid);
    try { localStorage.setItem('gn.muted', JSON.stringify([...this.muted])); } catch { /* */ }
    for (const [ch, list] of this.chats) this.chats.set(ch, list.filter((m) => !this.muted.has(m.from)));
    this.emit('people'); this.emit('chat', null, null);
  }

  // ------------------------------------------------------------------ invitations
  invite(cid, room, game) {
    if (!this.mq || !this.profile) return;
    this.mq.publish(this.root + 'inbox/' + cid, JSON.stringify({ k: 'invite', n: this.profile.name, a: slimAvatar(this.profile.avatar), r: num(room, 0, 9999), g: game || null, s: Date.now(), c: this.cid }));
  }
  _onInbox(payload) {
    let o; try { o = JSON.parse(payload); } catch { return; }
    if (!o || o.k !== 'invite' || !num(o.r) || this.muted.has(o.c) || Date.now() - stamp(o.s) > 120000) return;
    const now = Date.now(); // strangers can't spam invitations: one per sender per 20 s, five per minute overall
    this._inv = (this._inv || []).filter((t) => now - t.t < 60000);
    if (this._inv.length >= 5 || this._inv.some((t) => t.c === o.c && now - t.t < 20000)) return;
    this._inv.push({ c: o.c, t: now });
    this.emit('invite', { from: cleanText(o.n, 16) || 'Someone', avatar: sanitizeAvatar(o.a), room: num(o.r, 0, 9999), game: typeof o.g === 'string' ? o.g.slice(0, 24) : null });
  }

  _housekeeping() {
    const now = Date.now();
    let ch = false;
    for (const [n, r] of this.rooms) if (now - r.seen > ROOM_TTL) { this.rooms.delete(n); ch = true; }
    if (ch) this.emit('rooms');
    ch = false;
    for (const [c, p] of this.people) if (now - p.seen > PRES_TTL) { this.people.delete(c); ch = true; }
    if (ch) this.emit('people');
  }
}

export const plaza = new Plaza();
