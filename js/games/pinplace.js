// Pin the Place — a GeoGuessr-style world map guessing game. A famous place is named; drop a pin where you think it is.
// The closer your pin, the more points. Clues get easier as the clock runs down. 1–10 players.
import { h } from '../util.js';
import { icon } from '../ui.js';
import { avatarEl } from '../avatar.js';
import { makeClock } from '../kit.js';

// [name, lat, lon, kind, continent, flag]
const PLACES = [
  ['Eiffel Tower', 48.858, 2.294, 'landmark', 'Europe', '🇫🇷'], ['Statue of Liberty', 40.689, -74.045, 'landmark', 'North America', '🇺🇸'], ['Taj Mahal', 27.175, 78.042, 'landmark', 'Asia', '🇮🇳'],
  ['Great Pyramid of Giza', 29.979, 31.134, 'landmark', 'Africa', '🇪🇬'], ['Sydney Opera House', -33.857, 151.215, 'landmark', 'Oceania', '🇦🇺'], ['Colosseum', 41.89, 12.492, 'landmark', 'Europe', '🇮🇹'],
  ['Machu Picchu', -13.163, -72.545, 'landmark', 'South America', '🇵🇪'], ['Christ the Redeemer', -22.952, -43.21, 'landmark', 'South America', '🇧🇷'], ['Big Ben', 51.5, -0.125, 'landmark', 'Europe', '🇬🇧'],
  ['Golden Gate Bridge', 37.82, -122.479, 'landmark', 'North America', '🇺🇸'], ['Mount Fuji', 35.361, 138.727, 'nature', 'Asia', '🇯🇵'], ['Burj Khalifa', 25.197, 55.274, 'landmark', 'Asia', '🇦🇪'],
  ['Angkor Wat', 13.412, 103.867, 'landmark', 'Asia', '🇰🇭'], ['Petra', 30.329, 35.444, 'landmark', 'Asia', '🇯🇴'], ['Great Wall of China (Badaling)', 40.36, 116.02, 'landmark', 'Asia', '🇨🇳'],
  ['Mount Everest', 27.988, 86.925, 'nature', 'Asia', '🇳🇵'], ['Table Mountain', -33.963, 18.41, 'nature', 'Africa', '🇿🇦'], ['Niagara Falls', 43.083, -79.071, 'nature', 'North America', '🇨🇦'],
  ['Mount Kilimanjaro', -3.067, 37.355, 'nature', 'Africa', '🇹🇿'], ['Stonehenge', 51.179, -1.826, 'landmark', 'Europe', '🇬🇧'], ['Acropolis of Athens', 37.971, 23.726, 'landmark', 'Europe', '🇬🇷'],
  ['Sagrada Família', 41.404, 2.174, 'landmark', 'Europe', '🇪🇸'], ['Easter Island Moai', -27.125, -109.35, 'landmark', 'South America', '🇨🇱'], ['Chichén Itzá', 20.683, -88.568, 'landmark', 'North America', '🇲🇽'],
  ['Hagia Sophia', 41.008, 28.98, 'landmark', 'Europe', '🇹🇷'], ['Red Square, Moscow', 55.754, 37.62, 'landmark', 'Europe', '🇷🇺'], ['Victoria Falls', -17.925, 25.857, 'nature', 'Africa', '🇿🇼'],
  ['Uluru (Ayers Rock)', -25.345, 131.036, 'nature', 'Oceania', '🇦🇺'], ['Grand Canyon', 36.107, -112.113, 'nature', 'North America', '🇺🇸'], ['Galápagos Islands', -0.953, -90.966, 'nature', 'South America', '🇪🇨'],
  ['Santorini', 36.393, 25.461, 'nature', 'Europe', '🇬🇷'], ['Marina Bay Sands, Singapore', 1.283, 103.861, 'landmark', 'Asia', '🇸🇬'], ['Forbidden City', 39.916, 116.397, 'landmark', 'Asia', '🇨🇳'],
  ['Tokyo', 35.676, 139.65, 'city', 'Asia', '🇯🇵'], ['Cairo', 30.044, 31.236, 'city', 'Africa', '🇪🇬'], ['Nairobi', -1.292, 36.822, 'city', 'Africa', '🇰🇪'], ['Lagos', 6.524, 3.379, 'city', 'Africa', '🇳🇬'],
  ['Mexico City', 19.433, -99.133, 'city', 'North America', '🇲🇽'], ['Buenos Aires', -34.604, -58.382, 'city', 'South America', '🇦🇷'], ['Toronto', 43.653, -79.383, 'city', 'North America', '🇨🇦'],
  ['Reykjavik', 64.147, -21.942, 'city', 'Europe', '🇮🇸'], ['Moscow', 55.756, 37.617, 'city', 'Europe', '🇷🇺'], ['Mumbai', 19.076, 72.878, 'city', 'Asia', '🇮🇳'], ['Bangkok', 13.756, 100.502, 'city', 'Asia', '🇹🇭'],
  ['Seoul', 37.566, 126.978, 'city', 'Asia', '🇰🇷'], ['Jakarta', -6.2, 106.846, 'city', 'Asia', '🇮🇩'], ['Auckland', -36.848, 174.763, 'city', 'Oceania', '🇳🇿'], ['Honolulu', 21.307, -157.858, 'city', 'Oceania', '🇺🇸'],
  ['Anchorage', 61.218, -149.9, 'city', 'North America', '🇺🇸'], ['Santiago', -33.449, -70.669, 'city', 'South America', '🇨🇱'], ['Bogotá', 4.711, -74.072, 'city', 'South America', '🇨🇴'],
  ['Istanbul', 41.008, 28.978, 'city', 'Europe', '🇹🇷'], ['Delhi', 28.614, 77.209, 'city', 'Asia', '🇮🇳'], ['Perth', -31.95, 115.86, 'city', 'Oceania', '🇦🇺'], ['Addis Ababa', 9.03, 38.74, 'city', 'Africa', '🇪🇹'],
  ['Havana', 23.113, -82.367, 'city', 'North America', '🇨🇺'], ['Lisbon', 38.722, -9.139, 'city', 'Europe', '🇵🇹'], ['Vienna', 48.208, 16.373, 'city', 'Europe', '🇦🇹'], ['Stockholm', 59.329, 18.069, 'city', 'Europe', '🇸🇪'],
  ['Lake Baikal', 53.5, 108.2, 'nature', 'Asia', '🇷🇺'], ['Great Barrier Reef', -18.29, 147.7, 'nature', 'Oceania', '🇦🇺'], ['Iguazú Falls', -25.695, -54.436, 'nature', 'South America', '🇦🇷'],
  ['Mont Blanc', 45.833, 6.865, 'nature', 'Europe', '🇫🇷'], ['Mount Rushmore', 43.879, -103.459, 'landmark', 'North America', '🇺🇸'], ['Lake Titicaca', -15.84, -69.33, 'nature', 'South America', '🇵🇪'],
  ['Torres del Paine', -50.94, -73.4, 'nature', 'South America', '🇨🇱'], ['Dead Sea', 31.5, 35.5, 'nature', 'Asia', '🇮🇱'], ['Lake Victoria', -1.0, 33.0, 'nature', 'Africa', '🇺🇬'],
  ['Yellowstone', 44.43, -110.59, 'nature', 'North America', '🇺🇸'], ['Cape Town', -33.925, 18.424, 'city', 'Africa', '🇿🇦'], ['Casablanca', 33.573, -7.589, 'city', 'Africa', '🇲🇦'],
  ['Hong Kong', 22.32, 114.17, 'city', 'Asia', '🇭🇰'], ['Vancouver', 49.283, -123.121, 'city', 'North America', '🇨🇦'], ['Rio de Janeiro', -22.907, -43.173, 'city', 'South America', '🇧🇷'],
  ['Kathmandu', 27.717, 85.324, 'city', 'Asia', '🇳🇵'], ['Marrakesh', 31.629, -7.981, 'city', 'Africa', '🇲🇦'], ['Edinburgh Castle', 55.949, -3.201, 'landmark', 'Europe', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
  ['Neuschwanstein Castle', 47.557, 10.75, 'landmark', 'Europe', '🇩🇪'], ['Leaning Tower of Pisa', 43.723, 10.396, 'landmark', 'Europe', '🇮🇹'], ['Blue Lagoon', 63.88, -22.45, 'nature', 'Europe', '🇮🇸'],
];
const KIND = { landmark: ['🏛️', 'A famous landmark'], city: ['🏙️', 'A big city'], nature: ['🏔️', 'A natural wonder'] };
const MAP_W = 1800, LAT_TOP = 84, LAT_SPAN = 142, MAP_H = (MAP_W * LAT_SPAN) / 360;
const proj = (lat, lon) => [((lon + 180) / 360) * MAP_W, ((LAT_TOP - lat) / LAT_SPAN) * MAP_H];
const unproj = (x, y) => [LAT_TOP - (y / MAP_H) * LAT_SPAN, (x / MAP_W) * 360 - 180];
const PCOL = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#f9a825', '#6d4c41', '#d81b60', '#546e7a'];
const km = (a, b) => { const R = 6371, rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const points = (d) => Math.round(5000 * Math.exp(-d / 1500));

let LAND = null; // Path2D cache in map coords
async function loadLand() {
  if (LAND) return LAND;
  const topo = await (await fetch(new URL('../../vendor/countries-110m.json', import.meta.url))).json();
  const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
  const ring = (idxs) => { const pts = []; for (const i of idxs) { const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse(); pts.push(...(pts.length ? a.slice(1) : a)); } return pts; };
  const land = new Path2D(), borders = new Path2D();
  for (const g of topo.objects.countries.geometries) {
    if (g.properties?.name === 'Antarctica') continue;
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    for (const poly of polys) for (const r of poly) {
      const pts = ring(r);
      // unwrap longitudes so rings that cross the antimeridian stay continuous, then draw shifted copies
      let off = 0, prev = pts[0][0];
      const un = pts.map(([lon, lat]) => { if (lon - prev > 180) off -= 360; else if (lon - prev < -180) off += 360; prev = lon; return [lon + off, lat]; });
      const sub = new Path2D();
      un.forEach(([lon, lat], k) => { const [px, py] = proj(lat, lon); if (k === 0) sub.moveTo(px, py); else sub.lineTo(px, py); });
      sub.closePath();
      for (const dx of [0, -MAP_W, MAP_W]) { land.addPath(sub, new DOMMatrix().translate(dx, 0)); borders.addPath(sub, new DOMMatrix().translate(dx, 0)); }
    }
  }
  LAND = { land, borders };
  return LAND;
}

const CSS = `
.pp { gap:8px; max-width:900px; }
.pp-mapwrap { position:relative; flex:1 1 280px; min-height:260px; border-radius:24px; overflow:hidden; box-shadow:var(--e2); background:#cfe9ff; touch-action:none; }
.pp-mapwrap canvas { width:100%; height:100%; display:block; cursor:crosshair; }
.pp-zoom { position:absolute; right:10px; top:10px; display:flex; flex-direction:column; gap:6px; }
.pp-zoom button { width:40px; height:40px; border-radius:12px; border:0; background:#fff; box-shadow:var(--e1); display:grid; place-items:center; cursor:pointer; color:var(--on); }
.pp-clue { text-align:center; background:var(--surface); box-shadow:var(--e1); border-radius:22px; padding:10px 14px; display:flex; flex-direction:column; gap:2px; }
.pp-name { font:800 clamp(22px,6vw,30px)/1.15 var(--font); } .pp-sub { font:600 13px var(--font); color:var(--on2); }
.pp-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; }
.pp-res { display:flex; align-items:center; gap:8px; background:var(--surface); box-shadow:var(--e1); border-radius:16px; padding:6px 12px 6px 8px; font:700 14px var(--font); } .pp-res .pts { margin-left:auto; font:800 17px var(--font); color:var(--blue); } .pp-res small { display:block; font:600 11px var(--font); color:var(--on2); }
.pp-list { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px,1fr)); gap:6px; }
`;

export function start(api) {
  const ids = api.players.map((p) => p.id);
  const N = ids.length;
  const nameOf = (id) => api.player(id)?.name || '?';
  const clock = makeClock(api);
  const rounds = +api.opts.rounds || 5;
  const root = h('div.kt.wide.pp');
  api.root.append(h('style', CSS), root);
  const S = { phase: 'wait', round: 1, place: null, clue: 1, guessed: new Set(), scores: {}, res: null, my: null, locked: false, pin: null };
  const canvas = h('canvas');
  const ctx = canvas.getContext('2d');
  const wrap = h('div.pp-mapwrap', canvas, h('div.pp-zoom', h('button', { 'aria-label': 'Zoom in', onclick: () => zoomBy(1.6) }, icon('add')), h('button', { 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.6) }, icon('remove')), h('button', { 'aria-label': 'Whole world', onclick: () => { resetView(); } }, icon('public'))));
  let land = null;
  const V = { s: 1, x: 0, y: 0 }; // view: screen = map * s + (x, y) in CSS px
  let cw = 300, ch = 300, inited = false;
  function fitScale() { return Math.max(cw / MAP_W, 0.0001); }
  function resetView() { V.s = fitScale(); V.x = 0; V.y = (ch - MAP_H * V.s) / 2; clamp(); draw(); }
  function clamp() {
    const minS = fitScale(), maxS = fitScale() * 14;
    V.s = Math.min(maxS, Math.max(minS, V.s));
    const mw = MAP_W * V.s, mh = MAP_H * V.s;
    V.x = mw <= cw ? (cw - mw) / 2 : Math.min(0, Math.max(cw - mw, V.x));
    V.y = mh <= ch ? (ch - mh) / 2 : Math.min(0, Math.max(ch - mh, V.y));
  }
  function zoomBy(f, cx = cw / 2, cy = ch / 2) { const ns = Math.min(fitScale() * 14, Math.max(fitScale(), V.s * f)), k = ns / V.s; V.x = cx - (cx - V.x) * k; V.y = cy - (cy - V.y) * k; V.s = ns; clamp(); draw(); }
  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width) return;
    const first = !inited; inited = true;
    cw = r.width; ch = r.height;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    if (first) resetView(); else { clamp(); draw(); }
  }
  const ro = new ResizeObserver(resize);
  api.cleanup(() => ro.disconnect());
  loadLand().then((l) => { land = l; draw(); });

  function marker(lat, lon, color, label, big) {
    const [mx, my] = proj(lat, lon);
    const x = mx * V.s + V.x, y = my * V.s + V.y;
    ctx.beginPath(); ctx.arc(x, y, big ? 11 : 9, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    if (label) { ctx.fillStyle = '#fff'; ctx.font = '800 11px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + 0.5); }
    return [x, y];
  }
  function draw() {
    if (!cw) return;
    const dpr = canvas.width / cw;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#cfe9ff'; ctx.fillRect(0, 0, cw, ch);
    // graticule
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) { const [x] = proj(0, lon); ctx.beginPath(); ctx.moveTo(x * V.s + V.x, V.y); ctx.lineTo(x * V.s + V.x, V.y + MAP_H * V.s); ctx.stroke(); }
    for (let lat = -60; lat <= 80; lat += 20) { const [, y] = proj(lat, 0); ctx.beginPath(); ctx.moveTo(V.x, y * V.s + V.y); ctx.lineTo(V.x + MAP_W * V.s, y * V.s + V.y); ctx.stroke(); }
    if (land) {
      ctx.save(); ctx.setTransform(dpr * V.s, 0, 0, dpr * V.s, dpr * V.x, dpr * V.y);
      ctx.fillStyle = '#f3efe0'; ctx.fill(land.land);
      ctx.lineWidth = 0.9 / V.s; ctx.strokeStyle = '#b5b9a8'; ctx.lineJoin = 'round'; ctx.stroke(land.borders);
      ctx.restore();
    } else { ctx.fillStyle = '#5f6b7a'; ctx.font = '600 14px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Loading map…', cw / 2, ch / 2); }
    const r = S.res;
    if (S.phase === 'reveal' && r) {
      const [tx, ty] = proj(r.place[1], r.place[2]);
      ids.forEach((id, i) => { const g = r.g[id]; if (!g) return; const [gx, gy] = proj(g.lat, g.lon); ctx.strokeStyle = PCOL[i % 10]; ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(gx * V.s + V.x, gy * V.s + V.y); ctx.lineTo(tx * V.s + V.x, ty * V.s + V.y); ctx.stroke(); ctx.setLineDash([]); });
      ids.forEach((id, i) => { const g = r.g[id]; if (g) marker(g.lat, g.lon, PCOL[i % 10], nameOf(id)[0].toUpperCase()); });
      const [sx, sy] = [tx * V.s + V.x, ty * V.s + V.y];
      ctx.fillStyle = '#fdd835'; ctx.strokeStyle = '#212121'; ctx.lineWidth = 3; star(ctx, sx, sy, 15, 7, 5); ctx.fill(); ctx.stroke();
    } else if (S.pin) marker(S.pin[0], S.pin[1], PCOL[ids.indexOf(api.me) % 10], '', true);
  }
  function star(c, x, y, R, r, n) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (Math.PI / n) * i - Math.PI / 2, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }

  // pointer handling: drag to pan, pinch/wheel to zoom, tap to drop the pin
  const ptrs = new Map();
  let tapStart = null, lastDist = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); tapStart = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; lastDist = 0; });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { V.x += e.clientX - prev[0]; V.y += e.clientY - prev[1]; clamp(); draw(); }
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = canvas.getBoundingClientRect();
      if (lastDist) zoomBy(d / lastDist, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      lastDist = d; tapStart = null;
    }
  });
  const up = (e) => {
    if (tapStart && ptrs.size === 1 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 8 && performance.now() - tapStart.t < 500) {
      const r = canvas.getBoundingClientRect();
      onTap(e.clientX - r.left, e.clientY - r.top);
    }
    ptrs.delete(e.pointerId); tapStart = null; lastDist = 0;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); tapStart = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  function onTap(x, y) {
    if (S.phase !== 'guess' || S.locked) return;
    const [lat, lon] = unproj((x - V.x) / V.s, (y - V.y) / V.s);
    if (lat > LAT_TOP || lat < LAT_TOP - LAT_SPAN || lon < -180 || lon > 180) return;
    S.pin = [lat, lon]; api.sfx('pop'); draw(); render();
  }

  api.on('state', (s) => {
    const was = S.phase + ':' + S.round;
    Object.assign(S, s);
    S.guessed = new Set(s.guessed || []);
    if (s.ms !== undefined) clock.set(s.ms);
    if (s.phase === 'guess' && (was !== 'guess:' + S.round)) { S.pin = null; S.locked = false; S.res = null; requestAnimationFrame(() => { resize(); resetView(); }); }
    if (s.phase === 'reveal') fitReveal();
    if (s.sfx) api.sfx(s.sfx);
    render(); draw();
  });
  function fitReveal() {
    const r = S.res; if (!r) return;
    const pts = [[r.place[1], r.place[2]], ...ids.map((id) => r.g[id]).filter(Boolean).map((g) => [g.lat, g.lon])].map(([la, lo]) => proj(la, lo));
    const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const s = Math.min((cw - 90) / Math.max(x1 - x0, 1), (ch - 90) / Math.max(y1 - y0, 1), fitScale() * 7);
    V.s = Math.max(fitScale(), s); V.x = cw / 2 - ((x0 + x1) / 2) * V.s; V.y = ch / 2 - ((y0 + y1) / 2) * V.s; clamp();
  }
  api.onPlayersChanged(render);

  function render() {
    const me = api.me;
    const head = h('div.pp-bar', h('span.chip.blue', `Round ${S.round}/${rounds}`), S.phase === 'guess' ? clock.el() : null);
    const parts = [head];
    if (S.phase === 'guess' && S.place) {
      const k = KIND[S.place.kind];
      parts.push(h('div.pp-clue', h('div.pp-name', S.place.name), h('div.pp-sub', `${k[0]} ${k[1]}${S.clue >= 2 ? ' · ' + S.place.cont : ' · …more clues soon'}${S.clue >= 3 ? ' · ' + S.place.flag : ''}`)));
    } else if (S.phase === 'reveal' && S.res) parts.push(h('div.pp-clue', h('div.pp-name', S.res.place[0]), h('div.pp-sub', `${S.res.place[5]} ${S.res.place[4]}`)));
    parts.push(wrap);
    if (S.phase === 'guess') {
      parts.push(h('div.pp-bar', ids.map((id) => h('span.chip' + (S.guessed.has(id) ? '.green' : ''), avatarEl(api.player(id), 'xs', { still: true }), nameOf(id).slice(0, 9), S.guessed.has(id) ? icon('check', 'sm') : ''))),
        h('button.btn.primary.big', { disabled: !S.pin || S.locked, onclick: () => { S.locked = true; api.toHost('guess', { lat: S.pin[0], lon: S.pin[1] }); api.sfx('good'); render(); } }, icon('pin_drop'), S.locked ? 'Locked in ✓' : S.pin ? 'Lock in guess' : 'Tap the map to place your pin'));
    } else if (S.phase === 'reveal' && S.res) {
      parts.push(h('div.pp-list', ids.slice().sort((a, b) => (S.res.g[b]?.pts || 0) - (S.res.g[a]?.pts || 0)).map((id) => { const g = S.res.g[id]; return h('div.pp-res', avatarEl(api.player(id), 'sm', { still: true }), h('div', nameOf(id) + (id === me ? ' (you)' : ''), h('small', g ? `${Math.round(g.d).toLocaleString()} km away` : 'no guess')), h('span.pts', `+${g?.pts || 0}`, h('small', `${S.scores[id] || 0} total`))); })));
    }
    root.replaceChildren(...parts);
    requestAnimationFrame(() => { ro.disconnect(); ro.observe(wrap); });
  }

  if (api.isHost) {
    const rng = api.rng;
    const H = { round: 0, place: null, guesses: {}, scores: {}, order: rng.shuffle(PLACES.map((_, i) => i)), phase: 'wait', timer: 0, sfx: null, clue: 1 };
    ids.forEach((id) => (H.scores[id] = 0));
    const secs = +api.opts.time || 45;
    api.cleanup(() => clearTimeout(H.timer));
    const pubPlace = () => ({ name: H.place[0], kind: H.place[3], cont: H.place[4], flag: H.place[5] });
    const pub = (extra = {}) => { api.broadcast('state', { phase: H.phase, round: H.round, place: H.phase === 'guess' ? pubPlace() : undefined, clue: H.clue, guessed: Object.keys(H.guesses), scores: H.scores, sfx: H.sfx, ...extra }); H.sfx = null; };
    function nextRound() {
      H.round++; H.place = PLACES[H.order[H.round - 1]]; H.guesses = {}; H.phase = 'guess'; H.clue = 1;
      pub({ ms: secs * 1000 });
      clearTimeout(H.timer);
      H.timer = setTimeout(() => { H.clue = 2; pub({ ms: undefined }); H.timer = setTimeout(() => { H.clue = 3; pub({ ms: undefined }); H.timer = setTimeout(reveal, (secs * 1000) / 3 + 500); }, (secs * 1000) / 3); }, (secs * 1000) / 3);
    }
    api.on('guess', ({ lat, lon }, from) => {
      if (H.phase !== 'guess' || H.guesses[from] || !(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return;
      H.guesses[from] = { lat, lon };
      if (ids.filter((i) => !api.player(i).left).every((i) => H.guesses[i])) { clearTimeout(H.timer); H.timer = setTimeout(reveal, 700); } else pub({ ms: undefined });
    });
    function reveal() {
      clearTimeout(H.timer);
      if (H.phase !== 'guess') return;
      const g = {};
      ids.forEach((id) => { const x = H.guesses[id]; if (!x) return; const d = km([H.place[1], H.place[2]], [x.lat, x.lon]); const p = points(d); H.scores[id] += p; g[id] = { lat: x.lat, lon: x.lon, d, pts: p }; });
      H.phase = 'reveal'; H.sfx = 'win';
      pub({ res: { place: H.place, g } });
      H.timer = setTimeout(() => { if (H.round >= rounds) finish(); else nextRound(); }, 9000);
    }
    function finish() {
      const ranking = ids.slice().sort((a, b) => H.scores[b] - H.scores[a]).map((id) => ({ id, score: H.scores[id], note: 'pts' }));
      const top = ranking[0].score;
      api.endGame({ title: `${ranking.filter((r) => r.score === top).map((r) => nameOf(r.id)).join(' & ')} is the best navigator!`, subtitle: `${top.toLocaleString()} points`, ranking, winners: ranking.filter((r) => r.score === top).map((r) => r.id) });
    }
    api.onRejoin(() => pub({ ms: undefined }));
    api.onLeave(() => { if (ids.filter((i) => !api.player(i).left).length < 1) return; if (H.phase === 'guess' && ids.filter((i) => !api.player(i).left).every((i) => H.guesses[i])) reveal(); });
    api.timeout(nextRound, 800);
  }
  render();
}
