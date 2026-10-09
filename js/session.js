// A GameSession wires one running game to the room: it builds the `api` object every
// game receives, routes messages, and cleans everything up when the game ends.
//
// Game modules export:   export function start(api) { ... }   (optionally returns {destroy()})
//
// Messages: games talk with api.toHost / api.broadcast / api.sendTo and listen with api.on.
// The host is the single source of truth (it runs the rules); guests render what it sends.

import { makeRng } from './util.js';
import { sfx } from './audio.js';

export class GameSession {
  constructor({ room, def, mod, run, root, toast }) {
    this.room = room;
    this.def = def;
    this.run = run;
    this.runId = run.runId;
    this.root = root;
    this.dead = false;
    this._cleanups = [];
    this._handlers = new Map();
    this._leaveFns = [];
    this._changeFns = [];
    this._rejoinFns = [];

    const players = run.playerIds.map((id) => ({ ...this._info(id), left: false }));
    this.players = players;

    const self = this;
    const api = (this.api = {
      root,
      def,
      me: room.me,
      isHost: room.isHost,
      hostId: room.hostId,
      opts: run.opts || {},
      seed: run.seed,
      rng: makeRng(run.seed),
      players,
      player: (id) => players.find((p) => p.id === id),
      get activePlayers() { return players.filter((p) => !p.left); },
      get iAmPlayer() { return true; },

      on(type, fn) { self._handlers.set(type, fn); },
      toHost(k, d) { if (!self.dead) room.gToHost(k, d); },
      broadcast(k, d, except) { if (!self.dead) room.gBroadcast(k, d, except); },
      sendTo(id, k, d) { if (!self.dead) room.gSendTo(id, k, d); },

      onLeave(fn) { self._leaveFns.push(fn); },
      onRejoin(fn) { self._rejoinFns.push(fn); },
      onPlayersChanged(fn) { self._changeFns.push(fn); },

      endGame(result) { if (room.isHost && !self.dead) room.endGame(result); },
      say(text) { room.systemMessage(text); },
      sfx,
      toast: (t) => toast?.(t),

      timeout(fn, ms) { const t = setTimeout(() => { if (!self.dead) fn(); }, ms); self._cleanups.push(() => clearTimeout(t)); return t; },
      interval(fn, ms) { const t = setInterval(() => { if (!self.dead) fn(); }, ms); self._cleanups.push(() => clearInterval(t)); return t; },
      raf(fn) {
        let id = 0, last = performance.now();
        const loop = (now) => {
          if (self.dead) return;
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          fn(dt, now);
          id = requestAnimationFrame(loop);
        };
        id = requestAnimationFrame(loop);
        const stop = () => cancelAnimationFrame(id);
        self._cleanups.push(stop);
        return stop;
      },
      listen(target, ev, fn, opts) {
        target.addEventListener(ev, fn, opts);
        const off = () => target.removeEventListener(ev, fn, opts);
        self._cleanups.push(off);
        return off;
      },
      cleanup(fn) { self._cleanups.push(fn); },

      // WebRTC media for game streams (NES console, movie night). Any player can stream to any other.
      streamTo(id, stream) { const pid = room.player(id)?.pid; return pid ? room.callPeer(pid, stream, 'game') : null; },
      onStream(fn) {
        const off = room.onMediaCall((call) => {
          if (call.metadata && call.metadata.kind && call.metadata.kind !== 'game') return;
          call.answer();
          call.on('stream', (s) => fn(s, call));
        });
        self._cleanups.push(off);
      },
    });

    room.attachGame(run.runId, (k, d, from) => {
      const fn = this._handlers.get(k);
      if (fn) {
        try { fn(d, from); } catch (e) { console.error(`[${def.id}] handler ${k}`, e); }
      }
    });
    this._offLeft = room.on('left', (id) => { if (room.isHost) this._leaveFns.forEach((f) => this._safe(f, id)); });
    this._offRejoin = room.on('rejoin', (id) => { if (room.isHost) this._rejoinFns.forEach((f) => this._safe(f, id)); });

    try {
      this.instance = mod.start(api) || {};
    } catch (e) {
      console.error('game failed to start', e);
      root.textContent = 'This game crashed: ' + e.message;
    }
  }

  _safe(f, ...a) { try { f(...a); } catch (e) { console.error(e); } }

  _info(id) {
    return this.room.player(id) || { id, name: '?', avatar: '❔', color: '#888', online: false };
  }

  /** Called whenever the room state changes: keep player info (names, online, left) fresh. */
  updatePlayers() {
    let changed = false;
    const leftNow = [];
    for (const p of this.players) {
      const info = this.room.player(p.id);
      if (!info) {
        if (!p.left) { p.left = true; p.online = false; changed = true; leftNow.push(p.id); }
        continue;
      }
      if (p.name !== info.name || p.avatar !== info.avatar || p.online !== info.online) changed = true;
      p.name = info.name;
      p.avatar = info.avatar;
      p.color = info.color;
      p.online = info.online;
    }
    if (changed) this._changeFns.forEach((f) => this._safe(f, this.players));
    if (!this.room.isHost) leftNow.forEach((id) => this._leaveFns.forEach((f) => this._safe(f, id)));
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.room.detachGame();
    this._offLeft?.();
    this._offRejoin?.();
    try { this.instance?.destroy?.(); } catch (e) { console.error(e); }
    this._cleanups.forEach((f) => { try { f(); } catch { /* */ } });
    this._cleanups = [];
    this.root.textContent = '';
  }
}
