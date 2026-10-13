// A tiny MQTT 3.1.1 client over WebSocket (QoS 0 only) — just enough for the global "Plaza": a public room list,
// presence and global chat, using a free public broker so the game itself still needs no server of ours.
//
// Features used: retained messages (late joiners instantly see the current room list), last-will (a room
// disappears from the list by itself if its host's browser dies), wildcard subscriptions, auto-reconnect and
// failover between several brokers.
import { Emitter } from './util.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

const str = (s) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
const remLen = (n) => { const out = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0); return out; };
const packet = (first, body) => { const b = body instanceof Uint8Array ? body : Uint8Array.from(body); return Uint8Array.from([first, ...remLen(b.length), ...b]); };

/** MQTT topic filter match (+ single level, # rest). */
export function topicMatches(filter, topic) {
  const f = filter.split('/'), t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

export class Mqtt extends Emitter {
  /** @param {{urls: string[], clientId: string, will?: {topic: string, payload?: string, retain?: boolean}, keepAlive?: number}} o */
  constructor(o) {
    super();
    this.urls = o.urls;
    this.clientId = o.clientId;
    this.will = o.will || null;
    this.keepAlive = o.keepAlive || 30;
    this.subs = new Map(); // filter -> Set<handler>
    this.connected = false;
    this._closed = false;
    this._u = 0;
    this._pid = 0;
    this._buf = new Uint8Array(0);
    this._pending = [];
    this._fails = 0;
  }

  get url() { return this.urls[this._u % this.urls.length]; }

  connect() {
    if (this._closed) return;
    let ws;
    try { ws = new WebSocket(this.url, 'mqtt'); } catch (e) { return this._retry(); }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    const timeout = setTimeout(() => { try { ws.close(); } catch { /* */ } }, 9000);
    ws.onopen = () => {
      const flags = 0x02 | (this.will ? 0x04 | (this.will.retain ? 0x20 : 0) : 0);
      const body = [...str('MQTT'), 4, flags, this.keepAlive >> 8, this.keepAlive & 255, ...str(this.clientId)];
      if (this.will) { const p = enc.encode(this.will.payload || ''); body.push(...str(this.will.topic), p.length >> 8, p.length & 255, ...p); }
      ws.send(packet(0x10, body));
    };
    ws.onmessage = (ev) => {
      const add = new Uint8Array(ev.data);
      const nb = new Uint8Array(this._buf.length + add.length);
      nb.set(this._buf); nb.set(add, this._buf.length);
      this._buf = nb;
      this._parse(() => clearTimeout(timeout));
    };
    const down = () => {
      clearTimeout(timeout);
      if (this.ws !== ws) return;
      const was = this.connected;
      this.connected = false;
      clearInterval(this._ping);
      this.ws = null;
      if (was) this.emit('disconnect');
      this._retry();
    };
    ws.onclose = down;
    ws.onerror = () => { /* close follows */ };
  }

  _retry() {
    if (this._closed) return;
    this._fails++;
    this._u++; // try the next broker
    const wait = Math.min(15000, 800 * 2 ** Math.min(this._fails, 4));
    clearTimeout(this._rt);
    this._rt = setTimeout(() => this.connect(), wait);
  }

  _parse(onFirst) {
    for (;;) {
      const b = this._buf;
      if (b.length < 2) return;
      let mult = 1, len = 0, i = 1, d;
      do { if (i >= b.length) return; d = b[i++]; len += (d & 127) * mult; mult *= 128; } while (d & 128);
      if (b.length < i + len) return;
      const type = b[0] >> 4, flags = b[0] & 15, body = b.subarray(i, i + len);
      this._buf = b.slice(i + len);
      if (type === 2) { // CONNACK
        onFirst?.();
        if (body[1] !== 0) { try { this.ws.close(); } catch { /* */ } return; }
        this.connected = true;
        this._fails = 0;
        this._ping = setInterval(() => this._raw(Uint8Array.from([0xc0, 0])), this.keepAlive * 500);
        for (const f of this.subs.keys()) this._sendSub(f);
        const q = this._pending; this._pending = [];
        q.forEach((p) => this._raw(p));
        this.emit('connect', this.url);
      } else if (type === 3) { // PUBLISH
        const tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.subarray(2, 2 + tl));
        let off = 2 + tl;
        if ((flags >> 1) & 3) off += 2;
        const payload = dec.decode(body.subarray(off));
        const retained = !!(flags & 1);
        for (const [f, hs] of this.subs) if (topicMatches(f, topic)) hs.forEach((h) => { try { h(topic, payload, retained); } catch (e) { console.error('[mqtt]', e); } });
      }
    }
  }

  _raw(p) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(p); } catch { /* */ } }
  _sendSub(filter) { const id = ++this._pid & 0xffff || 1; this._raw(packet(0x82, [id >> 8, id & 255, ...str(filter), 0])); }

  /** Subscribe; returns an unsubscribe function. */
  subscribe(filter, handler) {
    let set = this.subs.get(filter);
    if (!set) { set = new Set(); this.subs.set(filter, set); if (this.connected) this._sendSub(filter); }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (!set.size) { this.subs.delete(filter); if (this.connected) { const id = ++this._pid & 0xffff || 1; this._raw(packet(0xa2, [id >> 8, id & 255, ...str(filter)])); } }
    };
  }

  /** Publish a string. Queued (latest few) until connected. */
  publish(topic, payload = '', { retain = false } = {}) {
    const body = Uint8Array.from([...str(topic), ...enc.encode(payload)]);
    const p = packet(0x30 | (retain ? 1 : 0), body);
    if (this.connected) this._raw(p);
    else { this._pending.push(p); if (this._pending.length > 20) this._pending.shift(); }
  }

  close() {
    this._closed = true;
    clearTimeout(this._rt);
    clearInterval(this._ping);
    try { if (this.ws && this.ws.readyState === 1) this.ws.send(Uint8Array.from([0xe0, 0])); } catch { /* */ }
    setTimeout(() => { try { this.ws?.close(); } catch { /* */ } }, 100);
    this.connected = false;
  }
}
