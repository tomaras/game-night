// "Watch how to play": a narrated video with real gameplay for each game. The videos live once on the site (media/videos),
// shared by both versions of the app, and are streamed on demand — nothing is downloaded until you press play.
import { h } from './util.js';
import { icon } from './ui.js';
import { channelInfo } from './channel.js';

/** The folder the videos are in, or null when running from the source tree (no videos there). */
function mediaBase() {
  const c = channelInfo();
  return c.canSwitch ? c.stableUrl + 'media/videos/' : null;
}
const known = new Map(); // id -> Promise<boolean>
export function hasVideo(id) {
  const base = mediaBase();
  if (!base) return Promise.resolve(false);
  if (!known.has(id)) known.set(id, fetch(base + id + '.vtt', { method: 'HEAD' }).then((r) => r.ok).catch(() => false));
  return known.get(id);
}

/** A card that turns into the video player when tapped. Empty (and hidden) if this game has no video. */
export function videoCard(def) {
  const box = h('div.vcard.hide');
  hasVideo(def.id).then((ok) => {
    if (!ok) return;
    const base = mediaBase();
    box.classList.remove('hide');
    const play = () => {
      const v = h('video', { controls: true, autoplay: true, playsinline: true, preload: 'auto', poster: base + def.id + '.jpg' },
        h('source', { src: base + def.id + '.mp4', type: 'video/mp4' }),
        h('track', { kind: 'captions', src: base + def.id + '.vtt', srclang: 'en', label: 'English', default: true }));
      box.replaceChildren(v);
      box.classList.add('playing');
      v.play().catch(() => {});
    };
    box.append(h('button.vposter', { type: 'button', onclick: play, 'aria-label': 'Watch how to play ' + def.name },
      h('span.vthumb', h('img', { src: base + def.id + '.jpg', alt: '', loading: 'lazy' }), h('span.vplay', icon('play_arrow'))),
      h('span.vtxt', h('b', 'Watch how to play'), h('small', 'Narrated, with real gameplay'))));
  });
  return box;
}
