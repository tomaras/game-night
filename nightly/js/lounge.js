// The Lounge call: voice/video channels that anyone online can drop into, independent of any room. It borrows the
// room call's engine (AV) by presenting the same small interface a Room does, but "who is in the call" comes from the
// Plaza's presence messages and the media runs over a separate PeerJS peer, so a Lounge call and a room call can
// be live at the same time.
import { Emitter } from './util.js';
import { openPeer } from './net.js';
import { LOUNGE_CHANNELS, CHANNEL_CAP } from './plaza.js';

export const channelName = (id) => LOUNGE_CHANNELS.find((c) => c.id === id)?.name || 'Lounge';

export class LoungeRoom extends Emitter {
  constructor(plaza, channel) {
    super();
    this.plaza = plaza;
    this.channel = channel;
    this.local = false;
    this.me = plaza.cid;
    this.number = 0;
    this.peer = null;
    this._av = { on: 0, mic: 0, cam: 0 };
    this._off = plaza.on('people', () => this.emit('state', this.state));
  }

  async open() {
    this.peer = await openPeer();
    this.peer.on('disconnected', () => { try { if (!this._closed && !this.peer.destroyed) this.peer.reconnect(); } catch { /* */ } });
    this.plaza.setPresence({ pid: this.peer.id });
  }

  get state() { return { players: this.players }; }
  get players() {
    const p = this.plaza, prof = p.profile || { name: 'You' };
    const others = p.channelMembers(this.channel).map((x) => ({ id: x.cid, name: x.name, avatar: x.avatar, color: '#888', online: true, pid: x.pid, av: { on: 1, mic: x.av.m, cam: x.av.c } }));
    return this._av.on ? [{ id: this.me, name: prof.name, avatar: prof.avatar, color: '#888', online: true, pid: this.peer?.id || '', av: { ...this._av } }, ...others] : others;
  }
  get people() { return this.players; }
  player(id) { return this.players.find((x) => x.id === id); }

  setAv(av) {
    this._av = { on: av.on ? 1 : 0, mic: av.mic ? 1 : 0, cam: av.cam ? 1 : 0 };
    this.plaza.setPresence({ ch: av.on ? this.channel : null, av: { m: av.mic ? 1 : 0, c: av.cam ? 1 : 0 }, pid: this.peer?.id || null });
    this.emit('state', this.state);
  }
  callPeer(pid, stream, kind = 'av') { try { return this.peer.call(pid, stream, { metadata: { kind, lounge: this.channel } }); } catch (e) { console.warn('lounge call failed', e); return null; } }
  onMediaCall(fn) { const h = (c) => fn(c); this.peer.on('call', h); return () => this.peer.off('call', h); }

  /** Free spots in this channel. */
  get free() { return CHANNEL_CAP - this.plaza.channelMembers(this.channel).length - (this._av.on ? 1 : 0); }

  close() {
    this._closed = true;
    this._off();
    this.plaza.setPresence({ ch: null, pid: null, av: { m: 0, c: 0 } });
    try { this.peer?.destroy(); } catch { /* */ }
  }
}
