// Hive in 3D: a stump-top table with hex cells carved into the wood, low bevelled ivory and onyx pieces with insects
// etched into them, clean legal-move outlines, flowing path arrows and smooth piece motion.
// Rules live in ../engines/hive-rules.js; this file only draws.
import { THREE, createTable3D, loadTexture, ease, KEY_DIR } from '../table3d.js';
import { GLYPHS, INK, TEAM } from './hive-art.js';

const A = (f) => `assets/hive3d/${f}`;
const R = 0.5, SQ3 = Math.sqrt(3);
const TH = 0.15, BEV = 0.03, TOP = TH + BEV, LV = TH + 2 * BEV + 0.002; // a stone spans -BEV .. TH+BEV around its origin
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
  g.save(); g.translate(cx, cy); g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = Math.max(3, r * .22); g.lineJoin = 'round';
  const poly = (n, rad, rot = -Math.PI / 2) => { g.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.closePath(); };
  if (shape === 'diamond') poly(4, r * 1.25); else if (shape === 'triangle') poly(3, r * 1.3);
  else if (shape === 'square') poly(4, r * 1.3, Math.PI / 4); else if (shape === 'hex') poly(6, r * 1.15, 0);
  else if (shape === 'star') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .5 : r * 1.25; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); }
  else if (shape === 'plus') { g.beginPath(); const t = r * .38, L = r * 1.1; g.rect(-t, -L, t * 2, L * 2); g.rect(-L, -t, L * 2, t * 2); }
  else { g.beginPath(); g.arc(0, 0, r, 0, 7); }
  g.stroke(); g.fill('evenodd'); g.restore();
}
/** One flat-top hex drawn as a clean glowing outline: the legal-move well, or (kind 'ring') the slim selection outline. */
const wellCache = new Map();
function wellTexture(color, shape, kind) {
  const key = `${color}|${shape}|${kind}`; if (wellCache.has(key)) return wellCache.get(key);
  const W = 512, H = Math.round(W * SQ3 / 2), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), cx = W / 2, cy = H / 2, rad = W / 2 - 14;
  const path = (r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); };
  if (kind === 'ring') {
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 18; path(rad - 12); g.stroke();
  } else {
    g.fillStyle = color; g.globalAlpha = .16; path(rad); g.fill(); g.globalAlpha = 1;
    g.lineJoin = 'round'; g.shadowColor = color; g.shadowBlur = 34; g.strokeStyle = color; g.lineWidth = 22; path(rad - 10); g.stroke(); g.stroke();
    g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; path(rad - 21); g.stroke();
    drawShape(g, shape, color, cx, cy, 30);
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
  const scenery = []; // materials that dim when a stone is in the spotlight
  const floorMat = new THREE.MeshStandardMaterial({ map: floorT, roughness: 1, alphaMap: radialAlpha(.5), transparent: true, color: 0xb9b19a });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 22.5), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true;
  scene.add(floor);
  scene.fog = new THREE.FogExp2(0x14180f, 0.012);

  const stumpW = 15.5, stumpH = stumpW * 1024 / 1536;
  const stumpMat = new THREE.MeshStandardMaterial({ map: stumpT, bumpMap: stumpT, bumpScale: 2.2, roughness: 0.82, alphaMap: radialAlpha(.62), transparent: true, color: 0xcdb9a2 });
  // The cell lattice is analytic (no texture), so the grooves stay razor sharp at any zoom and always line up with the pieces.
  stumpMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGp = vec2(position.x, -position.y);');
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
        float gw = max(0.0125, fwidth(e) * 1.6);
        float groove = 1.0 - smoothstep(0.0, gw, e);
        float pocket = smoothstep(0.0, 0.085, e);
        float groveFade = 1.0 - smoothstep(0.30, 0.46, length((vMapUv - 0.5) * vec2(1.0, 0.92)));
        groveH = (-1.7 * groove - 0.42 * (1.0 - pocket)) * groveFade;
        diffuseColor.rgb *= 1.0 - (0.5 * groove + 0.12 * (1.0 - pocket)) * groveFade;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = perturbNormalArb(-vViewPosition, normal, vec2(dFdx(groveH), dFdy(groveH)) * 0.85, faceDirection);`);
  };
  stumpMat.customProgramCacheKey = () => 'hive-stump';
  const stump = new THREE.Mesh(new THREE.PlaneGeometry(stumpW, stumpH), stumpMat);
  stump.rotation.x = -Math.PI / 2; stump.position.y = 0; stump.receiveShadow = true;
  scene.add(stump);
  scenery.push({ m: floorMat, c: floorMat.color.clone() }, { m: stumpMat, c: stumpMat.color.clone() });

  const world = new THREE.Group(); // everything that moves with the hive (shifted so the hive stays on the stump)
  scene.add(world);
  const origin = { x: 0, z: 0 };
  const setOrigin = (x, z) => { origin.x = x; origin.z = z; world.position.set(-x, 0, -z); };

  // dressing: cut-outs standing at the camera's tilt so they read like the pictures they came from
  const props = new THREE.Group(); scene.add(props);
  const shadowTex = dropShadowTexture();
  async function dress(file, x, z, w, { rot = 0, flip = false } = {}) {
    const t = await tex(file);
    const aspect = t.image.height / t.image.width;
    const geo = new THREE.PlaneGeometry(w, w * aspect); geo.translate(0, w * aspect / 2, 0);
    const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.08, roughness: 0.9, side: THREE.DoubleSide, color: 0xe6dfd2 });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.order = 'YXZ'; m.rotation.x = -(portrait ? 58 : 53) * Math.PI / 180; m.rotation.z = rot;
    if (flip) m.scale.x = -1;
    m.position.set(x, 0, z);
    props.add(m);
    scenery.push({ m: mat, c: mat.color.clone() });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.15, w * 0.55), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(x + w * 0.2, 0.004, z - w * 0.02 + 0.05); props.add(sh); // falls away from the low light on the left
  }
  const dressing = Promise.all([
    dress('fol-fern1.webp', -6.1, -0.2, 2.6), dress('fol-fern2.webp', 5.6, 3.0, 2.2, { flip: true }),
    dress('fol-moss.webp', -3.9, -2.9, 1.5), dress('prop-stone1.webp', 5.2, -2.2, 1.35), dress('prop-stone2.webp', 4.2, -3.1, 0.8),
    dress('prop-mushrooms.webp', -5.5, -2.9, 1.1), dress('prop-pinecone.webp', 4.4, 2.2, 0.8), dress('prop-acorns.webp', 3.4, 3.3, 0.7),
    dress('fol-leaves.webp', 6.0, 0.3, 1.5), dress('fol-ivy.webp', -2.2, -3.6, 1.3), dress('prop-twig.webp', 2.6, -3.7, 1.1, { rot: -0.4 }),
    dress('fol-clover.webp', -4.7, 3.4, 0.95),
  ]).catch((e) => console.warn('[hive3d] dressing', e));

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
    const m = new THREE.MeshPhysicalMaterial({
      bumpMap: e.height, bumpScale: col === 'w' ? 34 : 28, color: 0xffffff,
      roughness: col === 'w' ? 0.5 : 0.26, clearcoat: col === 'w' ? 0.28 : 0.85, clearcoatRoughness: col === 'w' ? 0.4 : 0.1,
      sheen: col === 'w' ? 0.25 : 0, sheenColor: new THREE.Color(0xffe9bf), sheenRoughness: 0.6,
    });
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
    w: new THREE.MeshPhysicalMaterial({ color: 0xd6c8a3, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.3 }),
    b: new THREE.MeshPhysicalMaterial({ color: 0x14161d, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
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
  let targetObjs = [], hoverId = null, flowMats = [];
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
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.02; hit.userData.target = t.id;
      g.add(well, hit);
      g.userData = { pulse: Math.random() * 6, well, id: t.id, pending: !!t.pending };
      targetGroup.add(g); targetObjs.push({ g, hit, id: t.id });
    }
  }

  function buildArrows(model) {
    clearGroup(arrowGroup); flowMats = [];
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
        const w = a.width || 0.034, op = a.opacity ?? 0.95, seg = Math.max(12, Math.round(dist * 18));
        const mk = (radius, mat, order) => { const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 10, false), mat); m.renderOrder = order; m.userData.own = true; arrowGroup.add(m); };
        const flat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, depthTest: false });
        mk(w * 1.75, flat(0xffffff, op * 0.92), 14);   // pale outline
        mk(w, flat(col, op), 15);                      // coloured body
        const pulse = pulseTex.clone(); pulse.needsUpdate = true; pulse.repeat.set(Math.max(1, dist * 2.2), 1);
        const pm = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: pulse, transparent: true, opacity: op * 0.9, depthWrite: false, depthTest: false });
        pm.userData.pulse = pulse; flowMats.push(pm);
        mk(w * 1.12, pm, 16);                          // light pulses travelling along it
        if (a.head === true) {
          const tan = curve.getTangent(1).normalize();
          const cone = (r, h, c, order, back) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 18), flat(c, op)); m.userData.own = true; m.position.copy(B0).addScaledVector(tan, -back); m.quaternion.setFromUnitVectors(up, tan); m.renderOrder = order; arrowGroup.add(m); };
          cone(w * 4.9, w * 8.4, 0xffffff, 17, w * 3.0); cone(w * 3.7, w * 7.4, col, 18, w * 2.6);
        }
      }
    }
  }

  function buildGhost(model) {
    clearGroup(ghostHolder);
    const g = model.ghost;
    if (!g) return;
    const mats = pieceMaterials(900 + g.type.charCodeAt(0), g.type, g.color === 0 ? 'w' : 'b');
    mats.forEach((m) => { m.transparent = true; m.opacity = 0.88; });
    const mesh = new THREE.Mesh(tileGeo, mats);
    const p = cellXZ(g.q, g.r);
    mesh.position.set(p.x, levelY(g.height || 0) + 0.1, p.z);
    mesh.rotation.y = yawFor(900 + g.type.charCodeAt(0), 0);
    mesh.castShadow = true; mesh.userData.bob = true;
    ghostHolder.add(mesh);
  }

  // ---------------- spotlight: dim the table and every other stone while one stone's moves are shown
  let dimK = 0, dimTween = null, focusSet = new Set();
  function spotObjects() { return [...[...tiles.values()].filter((e) => focusSet.has(e.mesh.userData.piece)).map((e) => e.mesh), targetGroup, arrowGroup, ghostHolder]; }
  function applyDim(k) {
    dimK = k;
    const f = 1 - 0.2 * k;
    for (const s of scenery) s.m.color.copy(s.c).multiplyScalar(f);
    for (const e of tiles.values()) {
      const v = focusSet.has(e.mesh.userData.piece) ? 1 : 1 - 0.18 * k;
      e.mesh.material[0].color.setScalar(v);
      e.mesh.material[1].color.set(e.mesh.material[1].userData.base).multiplyScalar(v);
    }
    stage.setSpotlight({ k });
  }
  function setFocus(set) {
    focusSet = set;
    const want = set.size ? 1 : 0, from = dimK;
    dimTween?.cancel();
    stage.setSpotlight({ front: spotObjects(), occluders: [...tiles.values()].map((e) => e.mesh), k: dimK });
    if (from === want) return applyDim(want);
    dimTween = stage.tween({ dur: 260, ease: ease.out, update: (k) => applyDim(from + (want - from) * k), done: () => applyDim(want) });
  }

  // ---------------- update(model)
  let lastModel = { tiles: [], targets: [], arrows: [] };
  let centred = false, fitted = false;

  function bounds(model) {
    const ts = model.tiles.length ? model.tiles : [{ q: 0, r: 0 }];
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const t of ts) { const p = cellXZ(t.q, t.r); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    return { minX: minX - 1.0, maxX: maxX + 1.0, minZ: minZ - 1.0, maxZ: maxZ + 0.8 };
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
  function animateDrop(entry, p, yaw) {
    const m = entry.mesh; entry.animating = true;
    m.position.set(p.x, p.y + 1.3, p.z); m.rotation.y = yaw + 0.5;
    stage.tween({
      dur: 520, ease: ease.out,
      update: (k) => { m.position.y = p.y + 1.3 * (1 - k) + Math.sin(k * Math.PI) * 0.06; m.rotation.y = yaw + 0.5 * (1 - k); m.scale.setScalar(1 + 0.08 * (1 - k)); },
      done: () => { entry.animating = false; m.position.copy(p); m.rotation.set(0, yaw, 0); m.scale.setScalar(1); settle(m); },
    });
  }

  function update(model) {
    settings = { ...settings, ...(model.settings || {}) };
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
        if (fresh) animateDrop(e, dest, yaw); else animateMove(e, anim.path);
      } else if (!e.animating) { e.mesh.position.copy(dest); e.mesh.rotation.set(0, yaw, 0); }
    }
    // state outlines: movable (amber), selected (white), last moved (soft gold)
    for (const t of model.tiles) {
      const e = tiles.get(t.piece); if (!e) continue;
      const sel = model.selected === t.piece, can = model.selectable?.has(t.piece), last = model.last === t.piece && !model.selected;
      e.ring.visible = !!(sel || can || last);
      e.ringMat.color.set(sel ? 0xffffff : can ? 0xffc107 : 0xffd978);
      e.ringMat.opacity = sel ? 1 : can ? 0.85 : 0.55;
      e.can = !!can;
    }
    buildTargets(model); buildArrows(model); buildGhost(model);
    setFocus(new Set(model.focus || []));
    lastModel = model;
    if (!model.keepView) {
      const b = bounds(model);
      const local = { minX: b.minX - origin.x, maxX: b.maxX - origin.x, minZ: b.minZ - origin.z, maxZ: b.maxZ - origin.z };
      if (model.refit || !fitted || offscreen(model)) { stage.fit(local, { animate: fitted && !model.instant, margin: 1.62 }); fitted = true; }
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
      if (Math.abs(proj.x) > 0.74 || proj.y > 0.7 || proj.y < -0.76) return true;
    }
    return false;
  }

  function animate(t, dt) {
    if (!ready) return false;
    let live = false;
    const s = t / 1000;
    for (const o of targetObjs) {
      const u = o.g.userData; u.pulse += dt / 1000 * (u.id === hoverId ? 5 : 2.4);
      const k = 0.5 + 0.5 * Math.sin(u.pulse);
      u.well.material.opacity = (u.pending ? 0.92 : 0.78) + k * 0.2 + (u.id === hoverId ? 0.1 : 0);
      u.well.scale.setScalar((u.pending ? 1.04 : 1) + (u.id === hoverId ? 0.025 : 0) + k * 0.012);
      live = true;
    }
    for (const m of flowMats) { m.userData.pulse.offset.x = -s * 0.8; live = true; }
    for (const g of ghostHolder.children) if (g.userData.bob) { g.position.y = levelY(lastModel.ghost?.height || 0) + 0.1 + Math.sin(s * 3.2) * 0.04; live = true; }
    for (const e of tiles.values()) if (e.ring.visible && e.can) { e.ringMat.opacity = 0.6 + 0.3 * Math.sin(s * 3.1 + e.q); live = true; }
    return live;
  }

  // ---------------- picking
  function tapAt(x, y) {
    if (!ready) return;
    const hit = stage.pick(x, y, [...targetObjs.map((o) => o.hit), ...[...tiles.values()].map((e) => e.mesh)])[0];
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
    if (hit.object.userData.target != null) return handlers.onTarget?.(hit.object.userData.target);
    const piece = hit.object.userData.piece, e = tiles.get(piece);
    const topLevel = [...tiles.values()].filter((o) => o.q === e.q && o.r === e.r).reduce((m, o) => Math.max(m, o.level), 0);
    if (e.level < topLevel) { const top = [...tiles.entries()].find(([, o]) => o.q === e.q && o.r === e.r && o.level === topLevel); return handlers.onPiece?.(top[0]); }
    handlers.onPiece?.(piece);
  }
  function hoverAt(x, y, leave) {
    if (!ready) return;
    const hit = leave ? null : stage.pick(x, y, targetObjs.map((o) => o.hit))[0];
    const id = hit ? hit.object.userData.target : null;
    if (id !== hoverId) { hoverId = id; handlers.onHover?.(id); stage.canvas.style.cursor = id != null ? 'pointer' : ''; stage.invalidate(); }
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

  await dressing;
  ready = true;
  stage.invalidate();

  return {
    stage, update, thumb,
    setHandlers(h) { Object.assign(handlers, h); },
    refit() { const b = bounds(lastModel); stage.fit({ minX: b.minX - origin.x, maxX: b.maxX - origin.x, minZ: b.minZ - origin.z, maxZ: b.maxZ - origin.z }, { margin: 1.62 }); },
    get tilesOnBoard() { return tiles.size; },
    /** Client coordinates of a cell's top surface (tests and onboarding hints use this). */
    screenOf(q, r, count = 0) {
      const p = cellXZ(q, r), v = new THREE.Vector3(p.x - origin.x, topY(count), p.z - origin.z);
      stage.camera.updateMatrixWorld(); v.project(stage.camera);
      const b = stage.canvas.getBoundingClientRect();
      return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
    },
    dispose() { stage.dispose(); tr?.dispose(); },
  };
}
