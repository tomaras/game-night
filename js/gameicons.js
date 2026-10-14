// Game icons: one hand-drawn round SVG per game in assets/gameicons/<id>.svg (48×48, transparent background).
// gameIcon(def, size) returns an <img>; if the file can't load it swaps itself for the game's emoji.
import { h } from './util.js';

const BASE = new URL('../assets/gameicons/', import.meta.url).href;

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const css = '.gicon{display:block;flex:none;max-width:none;object-fit:contain;-webkit-user-drag:none;user-select:none;-webkit-user-select:none;pointer-events:none}'
    + '.waitscreen .gicon{margin:0 auto}'
    + '.gicon-emo{display:grid;place-items:center;flex:none;line-height:1}';
  document.head.append(h('style', { id: 'gameicons-css' }, css));
}

/** The icon for a game definition (from js/games/index.js) at `size` CSS pixels. */
export function gameIcon(def, size = 48) {
  injectStyle();
  const fallback = () => h('span.emo.gicon-emo', { style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.78) + 'px' }, 'aria-hidden': 'true' }, def?.emoji || '🎲');
  if (!def?.id) return fallback();
  const img = h('img.gicon', { src: BASE + def.id + '.svg', alt: '', width: size, height: size, draggable: 'false', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}
