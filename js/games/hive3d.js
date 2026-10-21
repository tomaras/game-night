// Hive in 3D: a stump-top table with hex cells carved into the wood, low bevelled ivory and onyx pieces with insects
// etched into them, clean legal-move outlines, flowing path arrows and smooth piece motion.
// Rules live in ../engines/hive-rules.js; this file only draws.
import { THREE, createTable3D, loadTexture, ease, KEY_DIR } from '../table3d.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { GLYPHS, INK, TEAM } from './hive-art.js';

const A = (f) => `assets/hive3d/${f}`;
const R = 0.5, SQ3 = Math.sqrt(3);
const TH = 0.19, BEV = 0.03, TOP = TH + BEV, LV = TH + 2 * BEV + 0.002; // a stone spans -BEV .. TH+BEV around its origin
const HAVE_ART = new Set(['Q', 'A', 'S', 'G', 'B', 'M', 'L', 'P']); // insects with painted artwork; the rest fall back to the vector glyphs

const cellXZ = (q, r) => ({ x: R * 1.5 * q, z: R * SQ3 * (r + q / 2) });
const levelY = (l) => l * LV + BEV;                       // origin height of a stone sitting at stack level l
const topY = (count) => (count > 0 ? count * LV : 0);     // top surface of a cell holding `count` stones
const hash = (n) => { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

function hexShape(rad, rr = 0.06) {
  const pts = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i; return [Math.cos(a) * rad, Math.sin(a) * rad]; });
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const p0 = pts[(i + 5) % 6], p1 = pts[i], p2 = pts[(i + 1) % 6];
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const a = [p1[0] + v1[0] / l1 * rr, p1[1] + v1[1] / l1 * rr], b = [p1[0] + v2[0] / l2 * rr, p1[1] + v2[1] / l2 * rr];
    if (i === 0) s.moveTo(a[0], a[1]); else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  s.closePath();
  return s;
}

/** Canvas fallback for insects that have no painted art yet: the vector glyph, drawn once. */
function glyphEmblem(type) {
  const S = 640, ink = INK.w[type], face = TEAM.w.face;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80" width="${S}" height="${S}"><style>
    .gk{fill:${ink}} .gk.wing{opacity:.5} .gs{fill:none;stroke:${ink};stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
    .gf{fill:${face}} .gfs{fill:none;stroke:${face};stroke-width:2.2;stroke-linecap:round}</style><g>${GLYPHS[type]}</g></svg>`;
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = S;
      c.getContext('2d').drawImage(im, 0, 0, S, S);
      const h = document.createElement('canvas'); h.width = h.height = S;
      const hx = h.getContext('2d');
      hx.fillStyle = '#ececec'; hx.fillRect(0, 0, S, S);
      hx.filter = 'blur(2.5px) brightness(0)'; hx.globalAlpha = .62; hx.drawImage(im, 0, 0, S, S);
      const ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace;
      res({ color: ct, height: new THREE.CanvasTexture(h) });
    };
    im.onerror = rej;
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

function dropShadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(.6, 'rgba(0,0,0,.24)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function radialAlpha(inner = .55) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 128 * inner, 128, 128, 128);
  gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/** A small shape (circle, diamond, …) drawn in the centre of a legal-move well, so colour is never the only cue. */
function drawShape(g, shape, color, cx, cy, r) {
  g.save(); g.translate(cx, cy); g.fillStyle = color; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(1.5, r * .12); g.lineJoin = 'round';
  const poly = (n, rad, rot = -Math.PI / 2) => { g.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.closePath(); };
  if (shape === 'diamond') poly(4, r * 1.25); else if (shape === 'triangle') poly(3, r * 1.3);
  else if (shape === 'square') poly(4, r * 1.3, Math.PI / 4); else if (shape === 'hex') poly(6, r * 1.15, 0);
  else if (shape === 'star') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .5 : r * 1.25; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); }
  else if (shape === 'plus') { g.beginPath(); const t = r * .38, L = r * 1.1; g.rect(-t, -L, t * 2, L * 2); g.rect(-L, -t, L * 2, t * 2); }
  else { g.beginPath(); g.arc(0, 0, r, 0, 7); }
  g.stroke(); g.fill('evenodd'); g.restore();
}
/** One flat-top hex drawn as a fine, soft outline: the legal-move well, or (kind 'ring') the slim selection outline. */
const wellCache = new Map();
function wellTexture(color, shape, kind) {
  const key = `${color}|${shape}|${kind}`; if (wellCache.has(key)) return wellCache.get(key);
  const W = 512, H = Math.round(W * SQ3 / 2), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), cx = W / 2, cy = H / 2, rad = W / 2 - 14;
  const path = (r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); };
  g.lineJoin = 'round';
  if (kind === 'ring') {
    g.lineWidth = 7; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 12; path(rad - 12); g.stroke();
  } else {
    g.fillStyle = color; g.globalAlpha = .09; path(rad); g.fill(); g.globalAlpha = 1;
    g.shadowColor = color; g.shadowBlur = 20; g.strokeStyle = color; g.lineWidth = 9; g.globalAlpha = .9; path(rad - 8); g.stroke();
    g.shadowBlur = 0; g.globalAlpha = 1;
    drawShape(g, shape, color, cx, cy, shape === 'plus' ? 17 : 9);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.keep = true;
  wellCache.set(key, t); return t;
}

export async function createHive3D(host, handlers = {}) {
  let ready = false; // the stage can fire frames and taps while textures are still loading
  const portrait = host.clientHeight > host.clientWidth * 1.05;
  const stage = createTable3D(host, {
    tilt: portrait ? 58 : 53, fov: portrait ? 34 : 25,
    onTap: (x, y) => tapAt(x, y),
    onHover: (x, y, leave) => hoverAt(x, y, leave),
    onFrame: (t, dt) => animate(t, dt),
  });
  const { scene, rig } = stage;
  rig.min = portrait ? 9.5 : 8.5; rig.max = 30;

  // ---------------- textures (shared)
  const tex = async (f, o) => loadTexture(A(f), o);
  const [stumpT, floorT, ivoryT, onyxT] = await Promise.all([
    tex('stump.jpg'), tex('floor.jpg'), tex('ivory.jpg', { wrap: true }), tex('onyx.jpg', { wrap: true }),
  ]);
  const emblems = {};
  await Promise.all(['Q', 'A', 'S', 'G', 'B', 'M', 'L', 'P'].map(async (t) => {
    emblems[t] = HAVE_ART.has(t)
      ? { color: await tex(`insect-${t}.webp`), height: await tex(`insect-${t}-h.webp`, { srgb: false }) }
      : await glyphEmblem(t);
    emblems[t].color.anisotropy = emblems[t].height.anisotropy = 8;
  }));

  // ---------------- the table: floor, and a stump top whose hex cells are carved into the wood
  // ---------------- the ground: the forest-floor picture with real relief (height + normals derived from it), so its stones, leaves and moss
  // catch the same low light as everything else; mirrored beyond its edges so no view ever runs out of forest.
  const SLAB_T = 0.34, SLAB_B = 0.04;
  const [floorH, floorN, slabN] = await Promise.all([
    tex('floor-h.jpg', { srgb: false }), tex('floor-n.jpg', { srgb: false }), tex('slab-n.jpg', { srgb: false })]);
  const FW = 21, FH = FW * 901 / 1600;
  for (const t of [floorT, floorH, floorN]) { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(3, 3); t.offset.set(-1, -1); t.needsUpdate = true; }
  const fseg = innerWidth < 700 ? [190, 108] : [320, 180];
  const floorMat = new THREE.MeshStandardMaterial({ map: floorT, normalMap: floorN, displacementMap: floorH, displacementScale: 0.36, displacementBias: 0, roughness: 0.96, color: 0xe2dac6 });
  floorMat.normalScale.set(1.35, 1.35);
  // The ground lies over the wood and opens onto it with a ragged edge of soil, moss and stones (crisp, never faded), so the slab
  // has no outline at all: it simply shows where the forest floor gives way.
  const HOLE = { rx: 4.5, rz: 3.05 };
  floorMat.onBeforeCompile = (sh) => {
    sh.uniforms.uHole = { value: new THREE.Vector2(HOLE.rx, HOLE.rz) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      varying vec2 vWxz; uniform vec2 uHole;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
      float holeD(vec2 w, vec2 hole) { return length(w / hole) + (fbm(w * 0.75) - 0.5) * 0.42 + (fbm(w * 3.1 + 7.0) - 0.5) * 0.12; }`)
      .replace('#include <displacementmap_vertex>', `
        // soil lies on the wood: thin at the opening, building up into the forest floor further out
        vec2 wv = (modelMatrix * vec4(transformed, 1.0)).xz;
        float dv = holeD(wv, uHole), grow = smoothstep(1.0, 1.55, dv);
        float hgt = texture2D(displacementMap, vDisplacementMapUv).x;
        transformed.z += 0.012 + grow * 0.2 + (hgt - 0.45) * displacementScale * mix(0.35, 1.0, grow);`)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vWxz; uniform vec2 uHole;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
      float holeD(vec2 w, vec2 hole) { return length(w / hole) + (fbm(w * 0.75) - 0.5) * 0.42 + (fbm(w * 3.1 + 7.0) - 0.5) * 0.12; }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float dH = holeD(vWxz, uHole);
      float crumb = (fbm(vWxz * 13.0 + 3.0) - 0.5) * 0.16;          // crumbs of soil and grit along the edge
      if (dH + crumb < 1.0) discard;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(1.0, 1.12, dH));   // the soil's thin lip is darker, damp earth`);
  };
  floorMat.customProgramCacheKey = () => 'hive-floor-hole';
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW * 3, FH * 3, fseg[0], fseg[1]), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0; floor.receiveShadow = true; floor.castShadow = true;
  scene.add(floor);
  scene.fog = new THREE.FogExp2(0x161a10, 0.018);

  // ---------------- the slab: a real cross-section of a stump (your slab picture on top, bark around its rim) standing in the
  // forest floor, with the hex cells carved into its face. Plants and moss grow over its edge; nothing is faded or blurred.
  const SK = 1;
  const stumpW = 12.6, stumpH = stumpW * 1024 / 1536, SE_N = 3.4;
  // the wood runs on under the ground in every direction (mirrored beyond the picture), so wherever the soil dips, it is still wood
  for (const t of [stumpT, slabN]) { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.repeat.set(5, 5); t.offset.set(-2, -2); t.needsUpdate = true; }
  const slabGeo = new THREE.PlaneGeometry(stumpW * 5, stumpH * 5, 1, 1);
  slabGeo.rotateX(-Math.PI / 2);
  const stumpMat = new THREE.MeshStandardMaterial({ map: stumpT, normalMap: slabN, bumpMap: stumpT, bumpScale: 1.2, roughness: 0.8, color: 0xe4d4c0 });
  stumpMat.normalScale.set(1.3, 1.3);
  // The cell lattice is analytic (no texture), so the grooves stay razor sharp at any zoom and always line up with the pieces.
  stumpMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGp = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vGp;
        float hexEdge(vec2 p) {                       // distance inside the nearest flat-top cell to its edge
          const float R = 0.5;
          vec2 q = vec2(0.6666667 * p.x, -0.3333333 * p.x + 0.57735027 * p.y) / R;
          float x = q.x, z = q.y, y = -x - z;
          float rx = floor(x + 0.5), ry = floor(y + 0.5), rz = floor(z + 0.5);
          float dx = abs(rx - x), dy = abs(ry - y), dz = abs(rz - z);
          if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
          vec2 c = vec2(R * 1.5 * rx, R * 1.7320508 * (rz + rx * 0.5));
          vec2 d = abs(p - c);
          return R * 0.8660254 - max(d.y, 0.8660254 * d.x + 0.5 * d.y);
        }
        float groveH;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float e = hexEdge(vGp);
        float gw = max(0.017, fwidth(e) * 1.7);
        float groove = 1.0 - smoothstep(0.0, gw, e);
        float pocket = smoothstep(0.0, 0.085, e);
        vec2 su = abs(vMapUv * 2.0 - 1.0); float se = pow(pow(su.x, 3.4) + pow(su.y, 3.4), 1.0 / 3.4);
        float groveFade = 1.0;
        groveH = (-2.1 * groove - 0.5 * (1.0 - pocket)) * groveFade;
        diffuseColor.rgb *= 1.0 - (0.6 * groove + 0.15 * (1.0 - pocket)) * groveFade;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = perturbNormalArb(-vViewPosition, normal, vec2(dFdx(groveH), dFdy(groveH)) * 0.85, faceDirection);`);
  };
  stumpMat.customProgramCacheKey = () => 'hive-stump';
  const stump = new THREE.Mesh(slabGeo, stumpMat);
  stump.position.set(-2.3, 0, 0.35);                      // brings the cracked, split wood on the right of the slab into the play area
  stump.receiveShadow = true;
  scene.add(stump);
  /** A point on the edge of the opening in the ground: angle t, pushed out by `out` (negative = onto the wood). */
  const rimAt = (t, out = 0) => ({ x: Math.cos(t) * (HOLE.rx * 1.04 + out), z: Math.sin(t) * (HOLE.rz * 1.04 + out * 0.8) });

  const world = new THREE.Group(); // everything that moves with the hive (shifted so the hive stays on the stump)
  scene.add(world);
  const origin = { x: 0, z: 0 };
  const setOrigin = (x, z) => { origin.x = x; origin.z = z; world.position.set(-x, 0, -z); };

  // Real 3D foliage and rocks (CC0 Poly Haven models), instanced so a whole forest costs a handful of draw calls. They stream in after the board is
  // visible, and are thinned out (or skipped) on slow devices.
  const props = new THREE.Group(); scene.add(props);
  const gltf = new GLTFLoader();
  const shadowTex = dropShadowTexture();
  async function modelParts(name) {
    const g = await gltf.loadAsync(`assets/hive3d/models/${name}/${name}_1k.gltf`);
    g.scene.updateMatrixWorld(true);
    const parts = [];
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      geo.computeBoundingBox();
      const b = geo.boundingBox;
      geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);   // stand on the ground, centred
      geo.computeBoundingBox();
      const m = o.material; m.side = THREE.DoubleSide;
      // Some plants ship with a black background instead of an alpha channel: key that black out (with a soft, antialiased edge)
      if (m.userData.keyBlack === undefined) {                       // (all parts of a model share one material: decide once)
        m.userData.keyBlack = m.transparent; m.transparent = false; m.depthWrite = true;
        if (m.userData.keyBlack) { m.alphaTest = 0.5; m.alphaToCoverage = true; } else if (m.alphaTest === 0) m.alphaTest = 0.5;
      }
      const keyBlack = m.userData.keyBlack;
      parts.push({ keyBlack, geo, mat: m, size: new THREE.Vector3().subVectors(geo.boundingBox.max, geo.boundingBox.min) });
    });
    const typical = parts.map((q) => Math.max(q.size.x, q.size.z)).sort((a, b) => a - b)[Math.floor(parts.length / 2)];
    parts.forEach((q) => { q.unit = typical; });
    return parts;
  }
  /** place: [{ x, z, s (target width in cells), yaw, tilt? }] — variants are picked per placement. */
  function scatter(parts, place, { shadow = false, tint = 0xc9c2b0 } = {}) {
    const buckets = parts.map(() => []);
    place.forEach((p, i) => buckets[(i + Math.floor(hash(i * 3 + 9) * parts.length)) % parts.length].push(p));
    buckets.forEach((list, vi) => {
      if (!list.length) return;
      const part = parts[vi], mat = part.mat.clone(); mat.color.setHex(tint);
      if (part.keyBlack) { mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n        diffuseColor.a = smoothstep(0.05, 0.13, dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)));'); }; mat.customProgramCacheKey = () => 'hive-keyblack'; }
      const im = new THREE.InstancedMesh(part.geo, mat, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
      list.forEach((p, i) => {
        const k = p.s / part.unit;
        e.set(p.tilt || 0, p.yaw || 0, (p.tilt || 0) * 0.6); q.setFromEuler(e); sc.setScalar(k * (p.sy || 1)); sc.x = k; sc.z = k;
        m4.compose(v.set(p.x, p.y || 0, p.z), q, sc); im.setMatrixAt(i, m4);
      });
      im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; props.add(im);
    });
    stage.invalidate();
  }
  // Ground cover hugs the rim of the slab: tufts of moss and small plants creeping over the bark edge, ferns and rocks just outside it.
  const rimPlace = (n, inMin, outMax, size, seed) => Array.from({ length: n }, (_, i) => {
    const t = (i + hash(seed + i * 3)) / n * Math.PI * 2, o = inMin + (outMax - inMin) * hash(seed + i * 5 + 1);
    const p = rimAt(t, o);
    return { x: p.x, z: p.z, y: 0.04, s: size * (0.7 + hash(seed + i * 7 + 2) * 0.6), yaw: hash(seed + i * 11 + 3) * 6.28, tilt: (hash(seed + i * 13 + 4) - 0.5) * 0.2 };
  });
  let dressed = false;
  async function dress() {
    if (dressed) return; dressed = true;
    const phone = innerWidth < 700, t = stage.tier;
    const jobs = [
      ['moss_01', () => [...rimPlace(phone ? 60 : 80, -0.45, 0.35, 1.1, 11), ...rimPlace(phone ? 24 : 36, 0.2, 1.6, 1.5, 12)]],
      ['celandine_01', () => rimPlace(phone ? 8 : 14, -0.1, 1.0, 1.2, 31)],
      ['fern_02', () => rimPlace(phone ? 7 : 14, 0.35, 1.9, 2.4, 21)],
    ];
    for (const [name, make] of jobs) {
      if (t < 1 && name !== 'moss_01') continue;
      try { scatter(await modelParts(name), make()); } catch (e) { console.warn('[hive3d] model', name, e); }
    }
    if (t >= 2 && !phone) {
      for (const [name, ang, out, w, yaw] of [['rock_moss_set_01', 3.6, 1.0, 2.4, 0.6], ['rock_moss_set_02', 5.9, 0.9, 2.2, 2.2]]) {
        const p = rimAt(ang, out);
        try { scatter(await modelParts(name), [{ x: p.x, z: p.z, y: -0.05, s: w, yaw }], { tint: 0xb0aa9c }); } catch (e) { console.warn('[hive3d] model', name, e); }
      }
    }
  }

  // ---------------- stones
  const tileGeo = new THREE.ExtrudeGeometry(hexShape(R - 0.0015 - 0.03, 0.06), { depth: TH, bevelEnabled: true, bevelThickness: BEV, bevelSize: 0.03, bevelSegments: 4, curveSegments: 6 }); // outer wall at R: stones touch
  tileGeo.rotateX(-Math.PI / 2);
  { // cap UVs: a square, centred on the stone, as tall as the hex is
    const uv = tileGeo.attributes.uv, pos = tileGeo.attributes.position, n = tileGeo.attributes.normal, bh = SQ3 * R;
    for (let i = 0; i < uv.count; i++) if (n.getY(i) > 0.9) uv.setXY(i, pos.getX(i) / bh + 0.5, 0.5 - pos.getZ(i) / bh);
  }
  const bodyTex = { w: ivoryT, b: onyxT };
  const MATS = new Map();
  function capMaterial(type, col) {
    const k = type + col; if (MATS.has(k)) return MATS.get(k);
    const e = emblems[type];
    const m = new THREE.MeshStandardMaterial({ bumpMap: e.height, bumpScale: col === 'w' ? 34 : 28, color: 0xffffff, roughness: col === 'w' ? 0.5 : 0.36 });
    m.userData.u = { uBodyTex: { value: bodyTex[col] }, uEmb: { value: e.color }, uBody: { value: new THREE.Vector4(0, 0, 0.34, 0) }, uTint: { value: new THREE.Color(col === 'w' ? 0xf4ecd8 : 0xffffff) } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, m.userData.u);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uBodyTex; uniform sampler2D uEmb; uniform vec4 uBody; uniform vec3 uTint;`)
        .replace('#include <map_fragment>', `
          vec2 bUv = (vBumpMapUv - 0.5) * uBody.z; float bc = cos(uBody.w), bs = sin(uBody.w);
          bUv = vec2(bc * bUv.x - bs * bUv.y, bs * bUv.x + bc * bUv.y) + uBody.xy;
          diffuseColor.rgb = texture2D(uBodyTex, bUv).rgb * uTint * diffuse;
          vec4 emb = texture2D(uEmb, vBumpMapUv);
          float carve = 1.0 - texture2D(bumpMap, vBumpMapUv).x;
          diffuseColor.rgb *= 1.0 - 0.62 * smoothstep(0.02, 0.32, carve) * (1.0 - emb.a);
          diffuseColor.rgb *= 1.0 - 0.22 * smoothstep(0.3, 0.7, carve) * emb.a;
          float stoneL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(diffuseColor.rgb, emb.rgb * (0.78 + 0.55 * stoneL) * diffuse, emb.a * 0.93);
          float edge = 1.0 - abs(2.0 * emb.a - 1.0);
          diffuseColor.rgb *= 1.0 - 0.6 * edge * edge;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.34, emb.a);`);
    };
    m.customProgramCacheKey = () => 'hive-cap';
    MATS.set(k, m); return m;
  }
  const sideBase = {
    w: new THREE.MeshStandardMaterial({ color: 0xd6c8a3, roughness: 0.55 }),
    b: new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.45 }),
  };
  /** One material set per piece (the shared look with its own stone offset), so no two stones are alike and each can dim alone. */
  function pieceMaterials(piece, type, col) {
    const base = capMaterial(type, col);
    const cap = base.clone();
    const u = { ...base.userData.u, uBody: { value: new THREE.Vector4(hash(piece * 7 + 1) * 0.66, hash(piece * 7 + 2) * 0.66, 0.34, hash(piece * 7 + 3) * 6.28) } };
    cap.userData.u = u;
    cap.onBeforeCompile = (sh) => { base.onBeforeCompile(sh); sh.uniforms.uBody = u.uBody; };
    cap.customProgramCacheKey = base.customProgramCacheKey;
    const side = sideBase[col].clone(); side.userData.base = side.color.getHex();
    return [cap, side];
  }
  const outlineGeo = new THREE.PlaneGeometry(1, SQ3 / 2); outlineGeo.rotateX(-Math.PI / 2);

  const tiles = new Map(); // piece code -> { mesh, ring, q, r, level }
  let settings = { rotation: 'natural' };
  const yawFor = (piece, ply) => {
    if (settings.rotation === 'off') return 0;
    const k = Math.floor(hash(piece * 131 + ply * 7919) * 6) * Math.PI / 3;
    const jitter = settings.rotation === 'natural' ? (hash(piece * 17 + ply * 31 + 5) - 0.5) * 0.05 : 0;
    return k + jitter;
  };

  function makeTile(t) {
    const mesh = new THREE.Mesh(tileGeo, pieceMaterials(t.piece, t.type, t.color === 0 ? 'w' : 'b'));
    mesh.castShadow = true; mesh.receiveShadow = true;
    const ringMat = new THREE.MeshBasicMaterial({ map: wellTexture('#FFFFFF', 'circle', 'ring'), transparent: true, opacity: 0, depthWrite: false });
    const ring = new THREE.Mesh(outlineGeo, ringMat);
    ring.scale.set(0.98, 1, 0.98); ring.position.y = TOP + 0.003; ring.visible = false; ring.renderOrder = 5;
    mesh.add(ring);
    mesh.userData.piece = t.piece;
    world.add(mesh);
    return { mesh, ring, ringMat, q: t.q, r: t.r, level: t.level };
  }

  // ---------------- legal-move wells, arrows, ghost
  const targetGroup = new THREE.Group(); world.add(targetGroup);
  const arrowGroup = new THREE.Group(); world.add(arrowGroup);
  const hitGeo = new THREE.ShapeGeometry(hexShape(R - 0.005, 0.05)); hitGeo.rotateX(-Math.PI / 2);
  const wellGeo = new THREE.PlaneGeometry(1.0, SQ3 / 2); wellGeo.rotateX(-Math.PI / 2);
  let targetObjs = [], hoverId = null, flowMats = [], arrowParts = [];
  const ghostHolder = new THREE.Group(); world.add(ghostHolder);
  const clearGroup = (g) => { for (const o of [...g.children]) { g.remove(o); o.traverse((c) => { if (c.material && !c.material.map?.userData?.keep) c.material.dispose?.(); if (c.geometry && c.userData.own) c.geometry.dispose(); }); } };
  const pulseTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 4; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 40, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.55, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 40, 4); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t; })();

  function buildTargets(model) {
    clearGroup(targetGroup); targetObjs = [];
    for (const t of model.targets || []) {
      const g = new THREE.Group();
      const p = cellXZ(t.q, t.r);
      g.position.set(p.x, topY(t.height || 0) + 0.004, p.z);
      const colour = t.kind === 'place' ? '#34A853' : (t.color || '#FBBC05');
      const wellTex = wellTexture(colour, t.kind === 'place' ? 'plus' : (t.shape || 'circle'), 'well');
      const well = new THREE.Mesh(wellGeo, new THREE.MeshBasicMaterial({ map: wellTex, transparent: true, depthWrite: false, opacity: 0.95 }));
      well.renderOrder = 8; well.scale.setScalar(t.pending ? 1.04 : 1);
      g.userData = { pulse: Math.random() * 6, well, id: t.id, pending: !!t.pending, faint: !!t.faint };
      g.add(well);
      if (!t.faint) { const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.02; hit.userData.target = t.id; g.add(hit); targetObjs.push({ g, hit, id: t.id }); }
      else targetObjs.push({ g, hit: null, id: null });
      targetGroup.add(g);
    }
  }

  function buildArrows(model) {
    clearGroup(arrowGroup); flowMats = []; arrowParts = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const a of model.arrows || []) {
      const col = new THREE.Color(a.color || '#FBBC05');
      const pts = a.cells.map(([q, r, h]) => { const p = cellXZ(q, r); return new THREE.Vector3(p.x, topY(h || 0) + 0.07, p.z); });
      for (let i = 0; i < pts.length - 1; i++) {
        const A0 = pts[i], B0 = pts[i + 1];
        const dist = A0.distanceTo(B0), rise = Math.abs(A0.y - B0.y);
        const jump = dist > SQ3 * R * 1.5, climb = !jump && rise > 0.08;
        const peak = jump ? Math.min(1.7, 0.5 + dist * 0.45) : climb ? 0.42 : 0.025; // jumps take a high arch
        const mid = A0.clone().lerp(B0, 0.5); mid.y = Math.max(A0.y, B0.y) + peak * 2;  // quadratic control point: the apex is half this height
        const curve = new THREE.QuadraticBezierCurve3(A0, mid, B0);
        const w = a.width || 0.017, op = a.opacity ?? 0.95, seg = Math.max(12, Math.round(dist * 18));
        const part = { dests: a.dests || [], mats: [] }; arrowParts.push(part);
        const mk = (radius, mat, order) => { const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 10, false), mat); m.renderOrder = order; m.userData.own = true; arrowGroup.add(m); part.mats.push([mat, mat.opacity]); };
        const flat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, depthTest: false });
        mk(w * 2.8, flat(col, op * 0.1), 14);          // a very soft halo, no hard rim
        mk(w, flat(col, op * 0.86), 15);               // the fine line itself
        if (a.head === true) {
          const tan = curve.getTangent(1).normalize();
          const cone = (r, h, c, order, back) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 18), flat(c, op)); m.userData.own = true; m.position.copy(B0).addScaledVector(tan, -back); m.quaternion.setFromUnitVectors(up, tan); m.renderOrder = order; arrowGroup.add(m); part.mats.push([m.material, m.material.opacity]); };
          cone(w * 3.2, w * 6.8, col, 18, w * 2.1);
        }
      }
    }
  }

  const badgeCache = new Map();
  function actionTexture(kind) {
    if (badgeCache.has(kind)) return badgeCache.get(kind);
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const ok = kind === 'ok';
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
    g.fillStyle = ok ? '#FBBC05' : '#241a10'; g.beginPath(); g.arc(64, 62, 48, 0, 7); g.fill();
    g.shadowColor = 'transparent'; g.lineWidth = 5; g.strokeStyle = ok ? '#fff3c4' : '#9c6a24'; g.stroke();
    g.lineWidth = 11; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = ok ? '#2a1a05' : '#e9dcc0';
    g.beginPath(); if (ok) { g.moveTo(40, 64); g.lineTo(58, 82); g.lineTo(90, 44); } else { g.moveTo(46, 46); g.lineTo(82, 80); g.moveTo(82, 46); g.lineTo(46, 80); } g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.keep = true;
    badgeCache.set(kind, t); return t;
  }
  const projV = new THREE.Vector3();
  function buildConfirm(g) {
    const p = cellXZ(g.q, g.r), y = levelY(g.height || 0) + 0.45;
    projV.set(p.x - origin.x, y, p.z - origin.z).project(stage.camera);
    const side = projV.x > 0.55 ? -1 : 1;                              // keep the buttons on screen
    for (const [kind, ox, oz, sz] of [['ok', 0.98 * side, -0.12, 0.66], ['cancel', 0.72 * side, 0.78, 0.4]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: actionTexture(kind), depthTest: false, transparent: true }));
      sp.position.set(p.x + ox, y, p.z + oz); sp.renderOrder = 40; sp.userData = { confirm: kind, base: sz };
      sp.scale.setScalar(0.001); ghostHolder.add(sp);
      stage.tween({ dur: 320, delay: kind === 'ok' ? 80 : 160, ease: ease.outBack, update: (k) => sp.scale.setScalar(sz * k) });
    }
  }
  let ghostKey = '';
  function buildGhost(model) {
    const g = model.ghost;
    const key = g ? `${g.q},${g.r},${g.height},${g.type},${g.color},${model.confirm ? 1 : 0}` : '';
    if (key === ghostKey && ghostHolder.children.length) return;       // unchanged: keep it (and its pop-in) as it is
    ghostKey = key;
    clearGroup(ghostHolder);
    if (!g) return;
    if (model.confirm) buildConfirm(g);
    const mats = pieceMaterials(900 + g.type.charCodeAt(0), g.type, g.color === 0 ? 'w' : 'b');
    mats.forEach((m) => { m.transparent = true; m.opacity = 0.88; });
    const mesh = new THREE.Mesh(tileGeo, mats);
    const p = cellXZ(g.q, g.r);
    mesh.position.set(p.x, levelY(g.height || 0) + 0.1, p.z);
    mesh.rotation.y = yawFor(900 + g.type.charCodeAt(0), 0);
    mesh.castShadow = true;
    ghostHolder.add(mesh);
  }

  // ---------------- the reserve tray and the bag, physical objects standing on the table at the bottom of the view
  const [trL, trM, trR, tr5, tr8, bagTex] = await Promise.all([tex('tray-l.webp'), tex('tray-m.webp'), tex('tray-r.webp'), tex('tray.webp'), tex('tray8.webp'), tex('bag.webp')]);
  const BAG_MOUTH = [[0.30, 0.075], [0.455, 0.155], [0.58, 0.225], [0.72, 0.29], [0.80, 0.375], [0.86, 0.30], [0.84, 0.07], [0.52, 0.0], [0.36, 0.0]];
  const TRAY = { L: 384, M: 280, R: 376, H: 347, C: 244 }; // artwork geometry in px: caps, one well, height, first well centre
  const hud = new THREE.Group(); scene.add(hud);
  const trayTexCache = new Map();
  // Artwork geometry (px) per slot count: a dedicated 5-slot and 8-slot tray, stitched from the 5-slot art for 6 and 7.
  const trayGeo = (n) => (n >= 8 ? { W: 1879, H: 300, C: 160, M: 222.4 } : n === 5 ? { W: 1600, H: 347, C: 244, M: 280 } : { W: TRAY.L + TRAY.M * (n - 2) + TRAY.R, H: TRAY.H, C: TRAY.C, M: TRAY.M });
  function trayTexture(n) {
    if (trayTexCache.has(n)) return trayTexCache.get(n);
    if (n >= 8 || n === 5) { const t = n >= 8 ? tr8 : tr5; trayTexCache.set(n, t); return t; }
    const W = TRAY.L + TRAY.M * (n - 2) + TRAY.R, c = document.createElement('canvas'); c.width = W; c.height = TRAY.H;
    const g = c.getContext('2d');
    const piece = (im, x, w) => { // feather the left edge so the joins vanish
      const t = document.createElement('canvas'); t.width = w; t.height = TRAY.H; const tg = t.getContext('2d');
      tg.drawImage(im.image, 0, 0);
      if (x > 0) { tg.globalCompositeOperation = 'destination-in'; const gr = tg.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(16 / w, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); tg.fillStyle = gr; tg.fillRect(0, 0, w, TRAY.H); }
      g.drawImage(t, x, 0);
    };
    piece(trL, 0, TRAY.L); for (let i = 0; i < n - 2; i++) piece(trM, TRAY.L + TRAY.M * i, TRAY.M); piece(trR, TRAY.L + TRAY.M * (n - 2), TRAY.R);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    trayTexCache.set(n, t); return t;
  }
  const trayMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.72, alphaTest: 0.04 });
  const trayMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), trayMat);
  trayMesh.rotation.x = -Math.PI / 2; trayMesh.receiveShadow = true; trayMesh.renderOrder = 50; hud.add(trayMesh);
  trayMat.depthTest = false; trayMat.depthWrite = false;
  trayMesh.onAfterRender = (r) => r.clearDepth();
  const bagAspect = bagTex.image.height / bagTex.image.width;
  // Two copies of the bag picture: a full one behind the stones, and one in front that is cut away over the open mouth. The stones sit
  // between them, so they disappear into the bag along its inner edge.
  const bagFrontMask = (() => {
    const w = bagTex.image.width, h = bagTex.image.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000'; g.filter = 'blur(2px)'; g.beginPath();
    // the open mouth: everything above the front lip line (picture fractions, v measured from the top)
    for (const [u, v] of BAG_MOUTH) g.lineTo(u * w, v * h);
    g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); return t;
  })();
  const bagMat = new THREE.MeshStandardMaterial({ map: bagTex, transparent: true, alphaTest: 0.08, depthTest: false, depthWrite: false, roughness: 0.9, side: THREE.DoubleSide });
  const bagFrontMat = new THREE.MeshStandardMaterial({ map: bagTex, alphaMap: bagFrontMask, transparent: true, alphaTest: 0.5, depthTest: false, depthWrite: false, roughness: 0.9, side: THREE.DoubleSide });
  const bagGeo = new THREE.PlaneGeometry(1, bagAspect).translate(0, bagAspect / 2, 0);
  const bagMesh = new THREE.Mesh(bagGeo, bagMat), bagFront = new THREE.Mesh(bagGeo, bagFrontMat);
  bagMesh.renderOrder = 40; bagFront.renderOrder = 42;
  bagMesh.onAfterRender = (r) => r.clearDepth();           // the stones inside only need to sort among themselves
  bagMesh.rotation.x = bagFront.rotation.x = -(portrait ? 58 : 53) * Math.PI / 180; hud.add(bagMesh, bagFront);
  const bagShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 }));
  bagShadow.rotation.x = -Math.PI / 2; hud.add(bagShadow);
  let reserve = { color: 0, items: [] }, trayN = 0, reserveKey = '';
  const trayStones = new Map(), badges = new Map(), trayWell = new Map(), spill = [];
  const badgeSprite = (key, text) => {
    let b = badges.get(key);
    if (!b) { const c = document.createElement('canvas'); c.width = c.height = 96; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; b = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); b.renderOrder = 60; b.userData = { c, last: '' }; hud.add(b); badges.set(key, b); }
    if (b.userData.last !== text) {
      const g = b.userData.c.getContext('2d'); g.clearRect(0, 0, 96, 96);
      g.fillStyle = '#13100c'; g.beginPath(); g.arc(48, 48, 38, 0, 7); g.fill(); g.lineWidth = 5; g.strokeStyle = '#c9973e'; g.stroke();
      g.fillStyle = '#f4ead6'; g.font = '400 44px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 48, 52);
      b.material.map.needsUpdate = true; b.userData.last = text;
    }
    return b;
  };
  function trayStone(key, type, colour, idx) {
    let m = trayStones.get(key);
    if (!m) { m = new THREE.Mesh(tileGeo, pieceMaterials(2000 + idx, type, colour === 0 ? 'w' : 'b')); m.material.forEach((x) => { x.transparent = true; }); m.renderOrder = key.startsWith('bag:') ? 41 : 51; m.castShadow = !key.startsWith('bag:'); hud.add(m); trayStones.set(key, m); }
    return m;
  }
  const trayMeshes = () => [...trayStones.values()].filter((m) => m.visible && m.userData.reserve != null);
  const TRAY_Y = 1.25;                                     // the tray hovers well above the table
  const hudRay = new THREE.Raycaster(), hudPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc2 = new THREE.Vector2();
  const groundAt = (nx, ny, out, y = 0.03) => { hudPlane.constant = -y; hudRay.setFromCamera(ndc2.set(nx, ny), stage.camera); return hudRay.ray.intersectPlane(hudPlane, out); };
  const hA = new THREE.Vector3(), hB = new THREE.Vector3();
  let hudTime = 0;
  function placeHud() {
    const items = reserve.items;
    hud.visible = items.length > 0;
    if (!items.length) return;
    stage.camera.updateMatrixWorld();
    const n = Math.max(2, Math.min(8, items.length)), G = trayGeo(n);
    const px = G.W;
    if (!groundAt(portrait ? -0.9 : -0.6, portrait ? -0.7 : -0.72, hA, TRAY_Y) || !groundAt(0.94, portrait ? -0.7 : -0.72, hB, TRAY_Y)) return;
    const span = Math.abs(hB.x - hA.x), pitch = Math.min(0.92, span / (px / G.M)), pw = pitch / G.M;
    const wW = px * pw, hW = G.H * pw, cx = (hA.x + hB.x) / 2, cz = hA.z;
    if (trayN !== n) { trayMat.map = trayTexture(n); trayMat.needsUpdate = true; trayN = n; }
    trayMesh.position.set(cx, TRAY_Y, cz); trayMesh.scale.set(wW, hW, 1); trayMesh.visible = true; trayMesh.castShadow = true;
    const sc = pitch * 0.84, x0 = cx - wW / 2, zRow = cz - hH(hW);
    items.forEach((it, i) => {
      const wx = x0 + (G.C + G.M * i) * pw;
      trayWell.set(it.type, Object.assign(new THREE.Vector3(wx, TRAY_Y, zRow), { s: sc }));
      const show = Math.min(it.count, 3);
      for (let k = 0; k < 3; k++) {
        const m = trayStone(`${it.type}:${reserve.color}:${k}`, it.type, reserve.color, i * 3 + k);
        m.visible = k < show;
        if (!m.visible) continue;
        m.userData.reserve = it.type; m.scale.setScalar(sc);
        const lift = it.selected ? 0.18 : 0;
        m.position.set(wx, TRAY_Y + 0.02 + BEV * sc + k * LV * sc + lift, zRow);
        m.rotation.y = hash(i * 31 + k * 7 + 3) * 0.12 - 0.06;
        const v = it.active ? 1 : 0.55;
        m.material[0].color.setScalar(v); m.material[1].color.set(m.material[1].userData.base).multiplyScalar(v);
      }
      const b = badgeSprite('t' + it.type, String(it.count));
      b.visible = it.count > 0; b.scale.setScalar(pitch * 0.34); b.position.set(wx + pitch * 0.34, TRAY_Y + (show * LV + 0.1) * sc, zRow + pitch * 0.3);
    });
    for (const [key, m] of trayStones) if (!items.some((it) => key.startsWith(it.type + ':'))) m.visible = false;
    // the bag: bottom-left corner, cropped by the edge of the view, mouth towards the top right; the next stones lie in its mouth at board size
    {
      const bw = Math.min(5.0, span * 0.66), bh = bw * bagAspect, tl = (portrait ? 58 : 53) * Math.PI / 180;
      const upv = new THREE.Vector3(0, Math.cos(tl), -Math.sin(tl)), nrm = new THREE.Vector3(0, Math.sin(tl), Math.cos(tl));
      // bottom-left corner: the lowest quarter of the bag and its left edge fall outside the view
      groundAt(-1.0, -1.0, hA, 0); const x0 = hA.x; groundAt(1.0, -1.0, hB, 0);
      const k = (hB.x - x0) / 2;                                         // world units per half-screen
      groundAt(-1.0 + (bw / (2 * k)) * 0.5 * 0.9, -1.0, hA, 0);          // bag centre a little inside the left edge
      const topP = hA.clone().addScaledVector(upv, bh).project(stage.camera);
      groundAt(-1.0 + (bw / (2 * k)) * 0.5 * 0.9, -1.0 - 0.27 * Math.max(0.1, topP.y + 1.0), hA, 0);   // drop it until 27% of the bag is below the bottom edge
      bagMesh.scale.set(bw, bw, 1); bagMesh.position.set(hA.x, 0.0, hA.z);
      bagFront.scale.set(bw, bw, 1); bagFront.position.set(hA.x, 0.0, hA.z);
      bagShadow.scale.set(bw * 1.1, bw * 0.8, 1); bagShadow.position.set(hA.x + bw * 0.1, 0.004, hA.z + 0.05);
      const next = items.filter((it) => it.count > 0).slice(-3);
      const up = upv;
      const onBag = (u, v, lift) => new THREE.Vector3(hA.x + (u - 0.5) * bw, 0, hA.z).addScaledVector(up, bh * (1 - v)).addScaledVector(nrm, lift);
      const SPOTS = [[0.52, 0.27, -0.25, 0.25], [0.64, 0.31, 0.12, -0.35], [0.73, 0.355, 0.42, 0.1]];  // u, v (from the top), roll, yaw — all inside the mouth
      next.forEach((it, i) => {
        const m = trayStone(`bag:${it.type}:${reserve.color}`, it.type, reserve.color, 80 + i);
        const [u, v, roll, yaw] = SPOTS[i];
        m.visible = true; m.userData.reserve = null; m.scale.setScalar(1);               // exactly the size of the stones on the board
        m.position.copy(onBag(u, v, 0.05));
        m.rotation.order = 'YXZ'; m.rotation.set(Math.PI / 2 - tl - 0.75, yaw, roll);    // leaning back into the bag, cap towards the light
      });
      for (const [key, m] of trayStones) if (key.startsWith('bag:') && !next.some((it) => key === `bag:${it.type}:${reserve.color}`)) m.visible = false;
      const total = items.reduce((a, it) => a + it.count, 0);
      const b = badgeSprite('bag', String(total)); b.visible = true; b.scale.setScalar(bw * 0.12); b.position.copy(new THREE.Vector3(hA.x + bw * 0.04, 0, hA.z)).addScaledVector(up, bh * 0.62).addScaledVector(nrm, 0.2);
    }
  }
  const hH = (h) => h * 0.04; // the wells sit slightly above the tray's middle

  // the focused stone rises off the board (see animate); nothing else changes
  let focusSet = new Set();
  const setFocus = (set) => { focusSet = set; stage.invalidate(); };

  // ---------------- update(model)
  let lastModel = { tiles: [], targets: [], arrows: [] };
  let centred = false, fitted = false;

  function bounds(model) {
    const ts = model.tiles.length ? model.tiles : [{ q: 0, r: 0 }];
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const t of ts) { const p = cellXZ(t.q, t.r); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const b = { minX: minX - 1.0, maxX: maxX + 1.0, minZ: minZ - 1.0, maxZ: maxZ + (reserve.items.length ? 1.55 : 0.8) };
    const needW = portrait ? 4.5 : 7.4, needD = portrait ? 6.6 : 4.9, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (b.maxX - b.minX < needW) { b.minX = cx - needW / 2; b.maxX = cx + needW / 2; }
    if (b.maxZ - b.minZ < needD) { b.minZ = cz - needD / 2; b.maxZ = cz + needD / 2; }
    return b;
  }

  function animateMove(entry, path) {
    const pts = path.map(([q, r, lvl]) => { const p = cellXZ(q, r); return new THREE.Vector3(p.x, levelY(lvl), p.z); });
    if (pts.length < 2) return;
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push(d); total += d; }
    const dur = Math.min(1100, 320 + total * 190);
    const yaw0 = entry.mesh.rotation.y, yaw1 = entry.yawTarget;
    const dy = ((yaw1 - yaw0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const jumpLift = (i) => (seg[i] > SQ3 * R * 1.5 ? Math.min(1.2, 0.4 + seg[i] * 0.34) : Math.abs(pts[i + 1].y - pts[i].y) > 0.05 ? 0.38 : 0.12);
    entry.animating = true;
    stage.tween({
      dur, ease: ease.inOut,
      update: (k) => {
        let d = k * total, i = 0;
        while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
        const f = seg[i] ? Math.min(1, d / seg[i]) : 1;
        const a = pts[i], b = pts[i + 1];
        entry.mesh.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f + Math.sin(f * Math.PI) * jumpLift(i), a.z + (b.z - a.z) * f);
        entry.mesh.rotation.y = yaw0 + dy * k;
        entry.mesh.rotation.z = Math.sin(k * Math.PI) * 0.05;
      },
      done: () => { entry.animating = false; entry.mesh.position.copy(pts[pts.length - 1]); entry.mesh.rotation.set(0, yaw1, 0); settle(entry.mesh); },
    });
  }
  const settle = (mesh) => stage.tween({ dur: 170, ease: ease.out, update: (k) => { mesh.scale.y = 1 - Math.sin(k * Math.PI) * 0.03; }, done: () => { mesh.scale.y = 1; } });
  function animateDrop(entry, p, yaw, from) {
    const m = entry.mesh; entry.animating = true;
    const s0 = from ? from.s : 1, f = from ? new THREE.Vector3(from.x + origin.x, 0.2, from.z + origin.z) : new THREE.Vector3(p.x, p.y + 1.3, p.z);
    m.position.copy(f); m.rotation.y = yaw + 0.5; m.scale.setScalar(s0);
    stage.tween({
      dur: from ? 640 : 520, ease: ease.out,
      update: (k) => { m.position.set(f.x + (p.x - f.x) * k, f.y + (p.y - f.y) * k + Math.sin(k * Math.PI) * (from ? 0.9 : 0.06), f.z + (p.z - f.z) * k); m.rotation.y = yaw + 0.5 * (1 - k); m.scale.setScalar(s0 + (1 - s0) * k); },
      done: () => { entry.animating = false; m.position.copy(p); m.rotation.set(0, yaw, 0); m.scale.setScalar(1); settle(m); },
    });
  }

  function update(model) {
    settings = { ...settings, ...(model.settings || {}) };
    if (model.reserve) { reserve = model.reserve; reserveKey = JSON.stringify(reserve.items.map((it) => [it.type, it.count, it.selected ? 1 : 0, it.active ? 1 : 0])) + reserve.color; }
    // keep the hive on the stump: re-centre on a whole cell when its centre of mass drifts (the carved lattice then still lines up)
    if (model.tiles.length) {
      let sq = 0, sr = 0; for (const t of model.tiles) { sq += t.q; sr += t.r; }
      sq /= model.tiles.length; sr /= model.tiles.length;
      const x = sq, z = sr, y = -x - z;
      let rx = Math.round(x), rz = Math.round(z), ry = Math.round(y);
      const dx = Math.abs(rx - x), dz = Math.abs(rz - z), dy = Math.abs(ry - y);
      if (dx > dz && dx > dy) rx = -ry - rz; else if (dz > dy) rz = -rx - ry;
      const to = cellXZ(rx, rz);
      if (!centred || Math.hypot(to.x - origin.x, to.z - origin.z) > 2.2) {
        if (!centred || model.instant) setOrigin(to.x, to.z);
        else { const from = { x: origin.x, z: origin.z }; stage.tween({ dur: 700, ease: ease.inOut, update: (k) => setOrigin(from.x + (to.x - from.x) * k, from.z + (to.z - from.z) * k), done: () => setOrigin(to.x, to.z) }); }
        centred = true;
      }
    }
    stage.aimLight(0, 0, 9);

    const want = new Set(model.tiles.map((t) => t.piece));
    for (const [id, e] of tiles) if (!want.has(id)) { world.remove(e.mesh); tiles.delete(id); }
    const anim = model.moveAnim;
    for (const t of model.tiles) {
      let e = tiles.get(t.piece);
      const fresh = !e;
      const p = cellXZ(t.q, t.r);
      const dest = new THREE.Vector3(p.x, levelY(t.level), p.z);
      const yaw = yawFor(t.piece, t.ply ?? 0);
      if (!e) { e = makeTile(t); tiles.set(t.piece, e); }
      e.yawTarget = yaw;
      e.q = t.q; e.r = t.r; e.level = t.level;
      if (anim && anim.piece === t.piece && !model.instant) {
        if (fresh) animateDrop(e, dest, yaw, trayWell.get(t.type)); else animateMove(e, anim.path);
      } else if (!e.animating) { e.mesh.position.copy(dest); e.mesh.rotation.set(0, yaw, 0); }
    }
    // state outlines: movable (amber), selected (white), last moved (soft gold)
    for (const t of model.tiles) {
      const e = tiles.get(t.piece); if (!e) continue;
      const sel = model.selected === t.piece, can = model.selectable?.has(t.piece), last = model.last === t.piece && !model.selected;
      e.ring.visible = false; e.can = !!can;
    }
    buildTargets(model); buildArrows(model); buildGhost(model);
    setFocus(new Set(model.focus || []));
    lastModel = model;
    if (!model.keepView) {
      const b = bounds(model);
      const local = { minX: b.minX - origin.x, maxX: b.maxX - origin.x, minZ: b.minZ - origin.z, maxZ: b.maxZ - origin.z };
      if (model.refit || !fitted || offscreen(model)) { stage.fit(local, { animate: fitted && !model.instant, margin: 1.4 }); if (!fitted) setTimeout(dress, 700); fitted = true; }
    }
    stage.invalidate();
  }
  const proj = new THREE.Vector3();
  /** True when any piece sits outside the comfortable middle of the view. */
  function offscreen(model) {
    stage.camera.updateMatrixWorld(); stage.camera.updateProjectionMatrix();
    for (const t of model.tiles) {
      const p = cellXZ(t.q, t.r);
      proj.set(p.x - origin.x, levelY(t.level), p.z - origin.z).project(stage.camera);
      if (Math.abs(proj.x) > 0.74 || proj.y > 0.7 || proj.y < -0.5) return true;
    }
    return false;
  }

  let hudKey = '';
  // Only real motion keeps the renderer running (stones lifting, the camera gliding); a still board is drawn once and costs nothing.
  function animate(t, dt) {
    if (!ready) return false;
    let live = false;
    for (const o of targetObjs) {
      const u = o.g.userData, want = u.faint ? 0.32 : u.pending ? 1 : u.id === hoverId ? 1 : 0.86;
      if (u.well.material.opacity !== want) { u.well.material.opacity = want; u.well.scale.setScalar(u.pending || u.id === hoverId ? 1.04 : 1); }
    }
    for (const e of tiles.values()) {
      // the stone in the spotlight rises off the board, and settles back when it is released
      const want = focusSet.has(e.mesh.userData.piece) ? 0.17 : 0, d = want - (e.lift || 0);
      if (Math.abs(d) > 0.002) { e.lift = (e.lift || 0) + d * Math.min(1, dt / 110); live = true; } else e.lift = want;
      if (!e.animating) e.mesh.position.y = levelY(e.level) + e.lift;
    }
    // the tray and bag are glued to the view: only re-lay them when the camera or the reserve changed
    stage.camera.updateMatrixWorld();
    const k2 = stage.camera.position.x.toFixed(3) + stage.camera.position.y.toFixed(3) + stage.camera.position.z.toFixed(3) + stage.size.w + reserveKey;
    if (k2 !== hudKey) { hudKey = k2; placeHud(); live = true; }
    return live;
  }

  // ---------------- picking
  function tapAt(x, y) {
    if (!ready) return;
    const btn = stage.pick(x, y, ghostHolder.children.filter((c) => c.userData.confirm))[0];
    if (btn) return btn.object.userData.confirm === 'ok' ? handlers.onConfirm?.() : handlers.onCancel?.();
    const hit = stage.pick(x, y, [...targetObjs.filter((o) => o.hit).map((o) => o.hit), ...trayMeshes(), ...[...tiles.values()].map((e) => e.mesh)])[0];
    if (!hit) {
      const p = stage.groundPoint(x, y);
      if (p && handlers.onCell) {
        const q = (p.x + origin.x) / (R * 1.5), r = (p.z + origin.z) / (R * SQ3) - q / 2;
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(-q - r);
        const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r);
        if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
        return handlers.onCell(rq, rr);
      }
      return handlers.onEmpty?.();
    }
    if (hit.object.userData.reserve != null) return handlers.onReserve?.(hit.object.userData.reserve);
    if (hit.object.userData.target != null) return handlers.onTarget?.(hit.object.userData.target);
    const piece = hit.object.userData.piece, e = tiles.get(piece);
    if (piece == null || !e) return;
    const topLevel = [...tiles.values()].filter((o) => o.q === e.q && o.r === e.r).reduce((m, o) => Math.max(m, o.level), 0);
    if (e.level < topLevel) { const top = [...tiles.entries()].find(([, o]) => o.q === e.q && o.r === e.r && o.level === topLevel); return handlers.onPiece?.(top[0]); }
    handlers.onPiece?.(piece);
  }
  function hoverAt(x, y, leave) {
    if (!ready) return;
    const hit = leave ? null : stage.pick(x, y, targetObjs.filter((o) => o.hit).map((o) => o.hit))[0];
    const id = hit ? hit.object.userData.target : null;
    if (id !== hoverId) { hoverId = id; for (const part of arrowParts) { const on = hoverId == null || part.dests.includes(hoverId); for (const [mat, base] of part.mats) mat.opacity = base * (on ? 1 : 0.22); } handlers.onHover?.(id); stage.canvas.style.cursor = id != null ? 'pointer' : ''; stage.invalidate(); }
  }

  // ---------------- thumbnails for the trays, lit by the same light
  const thumbCache = new Map();
  let tr = null;
  function thumb(type, colour, size = 120) {
    const k = type + colour + size; if (thumbCache.has(k)) return thumbCache.get(k);
    if (!tr) {
      const c = document.createElement('canvas'); c.width = c.height = size * 2;
      tr = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
      tr.setPixelRatio(1); tr.setSize(size * 2, size * 2, false);
      tr.toneMapping = THREE.ACESFilmicToneMapping; tr.toneMappingExposure = 1.2; tr.setClearColor(0x000000, 0);
    }
    const col = colour === 0 ? 'w' : 'b';
    const sc = new THREE.Scene();
    sc.environment = scene.environment; sc.environmentIntensity = 0.7;
    const l = new THREE.DirectionalLight(0xffe6c8, 3.2); l.position.copy(KEY_DIR).multiplyScalar(8); sc.add(l);
    sc.add(new THREE.HemisphereLight(0xcfe3ff, 0x3a2a18, 0.6));
    const cap = capMaterial(type, col).clone(); cap.onBeforeCompile = capMaterial(type, col).onBeforeCompile; cap.customProgramCacheKey = () => 'hive-cap';
    const mesh = new THREE.Mesh(tileGeo, [cap, sideBase[col]]); sc.add(mesh);
    const cam = new THREE.PerspectiveCamera(13.5, 1, 0.1, 50);
    cam.position.set(0, 5.6, 3.1); cam.lookAt(0, 0.1, 0.08);
    tr.render(sc, cam);
    const url = tr.domElement.toDataURL('image/png');
    cap.dispose();
    thumbCache.set(k, url); return url;
  }

  ready = true;
  stage.invalidate();

  return {
    stage, update, thumb,
    setHandlers(h) { Object.assign(handlers, h); },
    refit() { const b = bounds(lastModel); stage.fit({ minX: b.minX - origin.x, maxX: b.maxX - origin.x, minZ: b.minZ - origin.z, maxZ: b.maxZ - origin.z }, { margin: 1.4 }); },
    /** Client coordinates of the confirm check (tests). */
    confirmScreen() {
      const sp = ghostHolder.children.find((c) => c.userData.confirm === 'ok'); if (!sp) return null;
      const v = sp.getWorldPosition(new THREE.Vector3()); stage.camera.updateMatrixWorld(); v.project(stage.camera);
      const b = stage.canvas.getBoundingClientRect();
      return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
    },
    nudgeTray() { for (const m of trayMeshes()) { const y0 = m.position.y; stage.tween({ dur: 420, ease: ease.out, update: (k) => { m.position.y = y0 + Math.sin(k * Math.PI) * 0.22; }, done: () => { m.position.y = y0; } }); } },
    get tilesOnBoard() { return tiles.size; },
    _dbg: { bagMesh, bagFront, bagFrontMat, bagFrontMask },
    /** Client coordinates of a cell's top surface (tests and onboarding hints use this). */
    screenOf(q, r, count = 0) {
      const p = cellXZ(q, r), v = new THREE.Vector3(p.x - origin.x, topY(count), p.z - origin.z);
      stage.camera.updateMatrixWorld(); v.project(stage.camera);
      const b = stage.canvas.getBoundingClientRect();
      return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
    },
    /** Client coordinates of a reserve stone in the 3D tray. */
    trayScreen(type) {
      const w = trayWell.get(type); if (!w) return null;
      const v = new THREE.Vector3(w.x, w.y + 0.1, w.z); stage.camera.updateMatrixWorld(); v.project(stage.camera);
      const b = stage.canvas.getBoundingClientRect();
      return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
    },
    dispose() { stage.dispose(); tr?.dispose(); },
  };
}
