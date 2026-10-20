// Hive in 3D: a stump-top table with carved cells, bevelled ivory and onyx pieces with insects etched into them,
// legal-move wells, flowing path arrows and smooth piece motion. Rules live in ../engines/hive-rules.js; this file only draws.
import { THREE, createTable3D, loadTexture, ease, KEY_DIR } from '../table3d.js';
import { GLYPHS, INK, TEAM } from './hive-art.js';

const A = (f) => `assets/hive3d/${f}`;
const R = 0.5, GAP = 0.012, SQ3 = Math.sqrt(3);
const TH = 0.26, BEV = 0.035, TOP = TH + BEV, LV = TOP + 0.012;
const HAVE_ART = new Set(['Q', 'A', 'S', 'G', 'B']); // insects with painted artwork; the rest fall back to the vector glyphs
const DEST_COLORS = ['#FBBC05', '#4285F4', '#EA4335', '#34A853', '#A142F4', '#12B5CB', '#FF6D00', '#F538A0'];
const SHAPES = ['circle', 'diamond', 'triangle', 'square', 'star', 'hex', 'plus', 'ring'];

const cellXZ = (q, r) => ({ x: R * 1.5 * q, z: R * SQ3 * (r + q / 2) });
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
const ringGeometry = (outer, inner, depth = 0.008) => {
  const sh = hexShape(outer, 0.06);
  sh.holes.push(new THREE.Path(hexShape(inner, 0.045).getPoints(10)));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
};

/** Canvas fallback for insects that have no painted art yet: the vector glyph, drawn once. */
function glyphEmblem(type, THREEref) {
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
      const ct = new THREEref.CanvasTexture(c); ct.colorSpace = THREEref.SRGBColorSpace;
      const ht = new THREEref.CanvasTexture(h);
      res({ color: ct, height: ht });
    };
    im.onerror = rej;
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

function dropShadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(.6, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
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
function shapeSprite(shape, color) {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d'); g.translate(48, 48);
  g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineJoin = 'round';
  const poly = (n, r, rot = -Math.PI / 2) => { g.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
  if (shape === 'circle') { g.beginPath(); g.arc(0, 0, 26, 0, 7); }
  else if (shape === 'diamond') poly(4, 32);
  else if (shape === 'triangle') poly(3, 34);
  else if (shape === 'square') poly(4, 34, Math.PI / 4);
  else if (shape === 'hex') poly(6, 30, 0);
  else if (shape === 'star') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 14 : 33; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }
  else if (shape === 'plus') { g.beginPath(); g.rect(-9, -28, 18, 56); g.rect(-28, -9, 56, 18); }
  else { g.beginPath(); g.arc(0, 0, 26, 0, 7); g.moveTo(14, 0); g.arc(0, 0, 14, 0, 7, true); }
  g.stroke(); g.fill('evenodd');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  rig.min = portrait ? 7.5 : 7; rig.max = 28;

  // ---------------- textures (shared)
  const tex = async (f, o) => loadTexture(A(f), o);
  const [stumpT, floorT, ivoryT, onyxT] = await Promise.all([
    tex('stump.jpg'), tex('floor.jpg'), tex('ivory.jpg', { wrap: true }), tex('onyx.jpg', { wrap: true }),
  ]);
  const emblems = {};
  await Promise.all(['Q', 'A', 'S', 'G', 'B', 'M', 'L', 'P'].map(async (t) => {
    emblems[t] = HAVE_ART.has(t)
      ? { color: await tex(`insect-${t}.webp`), height: await tex(`insect-${t}-h.webp`, { srgb: false }) }
      : await glyphEmblem(t, THREE);
    emblems[t].color.anisotropy = emblems[t].height.anisotropy = 8;
  }));

  // ---------------- the world: floor, stump top, carved cells, dressing
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 22.5),
    new THREE.MeshStandardMaterial({ map: floorT, roughness: 1, alphaMap: radialAlpha(.5), transparent: true, color: 0xb9b19a }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true;
  scene.add(floor);
  scene.fog = new THREE.FogExp2(0x1c2216, 0.012);

  const stumpW = 15.5, stumpH = stumpW * 941 / 1672;
  const stump = new THREE.Mesh(
    new THREE.PlaneGeometry(stumpW, stumpH),
    new THREE.MeshStandardMaterial({ map: stumpT, bumpMap: stumpT, bumpScale: 2.2, roughness: 0.82, alphaMap: radialAlpha(.62), transparent: true, color: 0xd2bfa8 }));
  stump.rotation.x = -Math.PI / 2; stump.position.y = 0; stump.receiveShadow = true;
  scene.add(stump);

  const world = new THREE.Group(); // everything that moves with the hive (shifted so the hive stays on the stump)
  scene.add(world);
  const origin = { x: 0, z: 0 };
  const setOrigin = (x, z) => { origin.x = x; origin.z = z; world.position.set(-x, 0, -z); };

  // carved cells (instanced hex outlines)
  const cellGeo = ringGeometry(R - GAP, R - GAP - 0.017, 0.006);
  const cellMat = new THREE.MeshStandardMaterial({ color: 0x2a190d, roughness: 0.8, transparent: true, opacity: 0.4 });
  const CELL_RAD = 8;
  const cellOffsets = [];
  for (let q = -CELL_RAD; q <= CELL_RAD; q++) for (let r = -CELL_RAD; r <= CELL_RAD; r++) if (Math.abs(q + r) <= CELL_RAD) cellOffsets.push([q, r]);
  const cells = new THREE.InstancedMesh(cellGeo, cellMat, cellOffsets.length);
  cells.receiveShadow = true;
  scene.add(cells);
  let gridCentre = { q: 0, r: 0 };
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), qn = new THREE.Quaternion();
  function layoutCells() {
    let n = 0;
    for (const [dq, dr] of cellOffsets) {
      const { x, z } = cellXZ(gridCentre.q + dq, gridCentre.r + dr);
      const px = x - origin.x, pz = z - origin.z;
      const inside = Math.abs(px) < stumpW / 2 - 1.2 && Math.abs(pz) < stumpH / 2 - 0.75;
      m4.compose(v3.set(px, inside ? 0.002 : -5, pz), qn, sc);
      cells.setMatrixAt(n++, m4);
    }
    cells.instanceMatrix.needsUpdate = true;
  }

  // dressing: cut-outs standing at the camera's tilt so they read like the pictures they came from
  const props = new THREE.Group(); scene.add(props);
  const shadowTex = dropShadowTexture();
  async function dress(file, x, z, w, { rot = 0, flip = false } = {}) {
    const t = await tex(file);
    const aspect = t.image.height / t.image.width;
    const geo = new THREE.PlaneGeometry(w, w * aspect); geo.translate(0, w * aspect / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.08, roughness: 0.9, side: THREE.DoubleSide, color: 0xf2ece0 }));
    const tl = (portrait ? 58 : 53) * Math.PI / 180;
    m.rotation.x = -tl; m.rotation.y = 0; m.rotation.order = 'YXZ'; m.rotation.z = rot;
    if (flip) m.scale.x = -1;
    m.position.set(x, 0, z); m.castShadow = false; m.receiveShadow = false;
    props.add(m);
    // soft contact shadow falling away from the key light
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, w * 0.55), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8 }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(x + w * 0.13, 0.004, z - w * 0.02 + 0.05); props.add(sh);
  }
  const dressing = Promise.all([
    dress('bag.webp', -4.9, 2.3, 2.7), dress('fol-fern1.webp', -6.1, -0.2, 2.6), dress('fol-fern2.webp', 5.6, 3.0, 2.2, { flip: true }),
    dress('fol-moss.webp', -3.9, -2.9, 1.5), dress('prop-stone1.webp', 5.2, -2.2, 1.35), dress('prop-stone2.webp', 4.2, -3.1, 0.8),
    dress('prop-mushrooms.webp', -5.5, -2.9, 1.1), dress('prop-pinecone.webp', 4.4, 2.2, 0.8), dress('prop-acorns.webp', 3.4, 3.3, 0.7),
    dress('fol-leaves.webp', 6.0, 0.3, 1.5), dress('fol-ivy.webp', -2.2, -3.6, 1.3), dress('prop-twig.webp', 2.6, -3.7, 1.1, { rot: -0.4 }),
    dress('fol-clover.webp', -4.7, 3.4, 0.95),
  ]).catch((e) => console.warn('[hive3d] dressing', e));

  // ---------------- tiles
  const tileGeo = new THREE.ExtrudeGeometry(hexShape(R - GAP * 2, 0.07), { depth: TH, bevelEnabled: true, bevelThickness: BEV, bevelSize: 0.03, bevelSegments: 4, curveSegments: 6 });
  tileGeo.rotateX(-Math.PI / 2);
  { // cap UVs: a square, centred on the tile, as tall as the hex is
    const uv = tileGeo.attributes.uv, pos = tileGeo.attributes.position, n = tileGeo.attributes.normal, bh = SQ3 * R;
    for (let i = 0; i < uv.count; i++) if (n.getY(i) > 0.9) uv.setXY(i, pos.getX(i) / bh + 0.5, 0.5 - pos.getZ(i) / bh);
  }
  const bodyTex = { w: ivoryT, b: onyxT };
  const MATS = new Map();
  function capMaterial(type, col) {
    const k = type + col; if (MATS.has(k)) return MATS.get(k);
    const e = emblems[type];
    const m = new THREE.MeshPhysicalMaterial({
      bumpMap: e.height, bumpScale: col === 'w' ? 11 : 9, color: 0xffffff,
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
          diffuseColor.rgb = texture2D(uBodyTex, bUv).rgb * uTint;
          vec4 emb = texture2D(uEmb, vBumpMapUv);
          float carve = 1.0 - texture2D(bumpMap, vBumpMapUv).x;
          diffuseColor.rgb *= 1.0 - 0.62 * smoothstep(0.02, 0.32, carve) * (1.0 - emb.a);
          diffuseColor.rgb *= 1.0 - 0.22 * smoothstep(0.3, 0.7, carve) * emb.a;
          diffuseColor.rgb = mix(diffuseColor.rgb, emb.rgb * 0.96, emb.a);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.34, emb.a);`);
    };
    m.customProgramCacheKey = () => 'hive-cap';
    MATS.set(k, m); return m;
  }
  const sideMats = {
    w: new THREE.MeshPhysicalMaterial({ color: 0xd6c8a3, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.3 }),
    b: new THREE.MeshPhysicalMaterial({ color: 0x14161d, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
  };
  /** One material instance per piece (a clone of the shared look with its own stone offset), so no two stones are alike. */
  function pieceMaterials(piece, type, col) {
    const base = capMaterial(type, col);
    const cap = base.clone();
    cap.onBeforeCompile = base.onBeforeCompile; cap.customProgramCacheKey = base.customProgramCacheKey;
    const u = { ...base.userData.u, uBody: { value: new THREE.Vector4(hash(piece * 7 + 1) * 0.66, hash(piece * 7 + 2) * 0.66, 0.34, hash(piece * 7 + 3) * 6.28) } };
    cap.userData.u = u;
    cap.onBeforeCompile = (sh) => { base.onBeforeCompile(sh); sh.uniforms.uBody = u.uBody; };
    return [cap, sideMats[col]];
  }
  const ringGeoTile = ringGeometry(R - GAP * 2 - 0.02, R - GAP * 2 - 0.085, 0.01);

  const tiles = new Map(); // piece code -> { mesh, ring, q, r, level, rot }
  let settings = { rotation: 'natural' };
  const yawFor = (piece, ply) => {
    if (settings.rotation === 'off') return 0;
    const k = Math.floor(hash(piece * 131 + ply * 7919) * 6) * Math.PI / 3;
    const jitter = settings.rotation === 'natural' ? (hash(piece * 17 + ply * 31 + 5) - 0.5) * 0.05 : 0;
    return k + jitter;
  };
  const tileXZ = (q, r) => cellXZ(q, r);

  function makeTile(t) {
    const mesh = new THREE.Mesh(tileGeo, pieceMaterials(t.piece, t.type, t.color === 0 ? 'w' : 'b'));
    mesh.castShadow = true; mesh.receiveShadow = true;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc107, transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(ringGeoTile, ringMat);
    ring.position.y = TOP + 0.002; ring.visible = false;
    mesh.add(ring);
    mesh.userData.piece = t.piece;
    world.add(mesh);
    return { mesh, ring, ringMat, q: t.q, r: t.r, level: t.level, yaw: 0 };
  }

  // ---------------- targets, arrows, ghost
  const targetGroup = new THREE.Group(); world.add(targetGroup);
  const arrowGroup = new THREE.Group(); world.add(arrowGroup);
  const wellGeo = ringGeometry(R - GAP * 2 + 0.005, R - GAP * 2 - 0.07, 0.012);
  const hitGeo = new THREE.ShapeGeometry(hexShape(R - GAP, 0.05)); hitGeo.rotateX(-Math.PI / 2);
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 192;
  { const g = glowCanvas.getContext('2d'), gr = g.createRadialGradient(96, 96, 6, 96, 96, 96); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.45, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 192, 192); }
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const glowGeo = new THREE.PlaneGeometry(1.45, 1.45); glowGeo.rotateX(-Math.PI / 2);
  const spriteTex = new Map();
  const sprite = (shape, color) => { const k = shape + color; if (!spriteTex.has(k)) spriteTex.set(k, shapeSprite(shape, color)); return spriteTex.get(k); };
  let targetObjs = [];
  let hoverId = null;
  const dashTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 4; const g = c.getContext('2d'); g.clearRect(0, 0, 64, 4); g.fillStyle = '#fff'; g.beginPath(); g.roundRect?.(2, 0, 38, 4, 2); g.fill(); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t; })();
  let flowMats = [];

  const ghostHolder = new THREE.Group(); world.add(ghostHolder);

  function clearGroup(g) { for (const o of [...g.children]) { g.remove(o); o.traverse((c) => { if (c.isSprite) c.material.dispose(); }); } }

  const topY = (heightCount) => (heightCount > 0 ? (heightCount - 1) * LV + TOP : 0); // heightCount = pieces in the cell

  function buildTargets(model) {
    clearGroup(targetGroup); targetObjs = [];
    for (const t of model.targets || []) {
      const g = new THREE.Group();
      const p = tileXZ(t.q, t.r), y = topY(t.height || 0);
      g.position.set(p.x, y + 0.004, p.z);
      const col = new THREE.Color(t.kind === 'place' ? '#34A853' : (t.color || '#FBBC05'));
      const ringM = new THREE.Mesh(wellGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 }));
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: t.pending ? 0.95 : 0.55 }));
      glow.position.y = 0.01;
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(hexShape(R - GAP * 2 - 0.07, 0.04)), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: t.pending ? 0.35 : 0.14, depthWrite: false }));
      fill.rotation.x = -Math.PI / 2; fill.position.y = 0.006;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite(t.kind === 'place' ? 'plus' : (t.shape || 'circle'), '#' + col.getHexString()), depthTest: false, transparent: true }));
      sp.scale.set(0.3, 0.3, 1); sp.position.y = 0.34; sp.renderOrder = 20;
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.02; hit.userData.target = t.id;
      g.add(glow, fill, ringM, sp, hit);
      g.userData = { pulse: Math.random() * 6, glow, ringM, sp, id: t.id, pending: !!t.pending };
      targetGroup.add(g); targetObjs.push({ g, hit, id: t.id });
    }
  }

  function buildArrows(model) {
    clearGroup(arrowGroup); flowMats = [];
    const seen = new Set();
    for (const a of model.arrows || []) {
      const col = new THREE.Color(a.color || '#FBBC05');
      const pts = a.cells.map(([q, r, h]) => { const p = tileXZ(q, r); return new THREE.Vector3(p.x, topY(h || 0) + 0.07, p.z); });
      for (let i = 0; i < pts.length - 1; i++) {
        const A0 = pts[i], B0 = pts[i + 1];
        const key = `${a.cells[i]}>${a.cells[i + 1]}|${a.shared ? 's' : a.id}`;
        if (a.shared && seen.has(key)) continue; seen.add(key);
        const dist = A0.distanceTo(B0), jump = dist > SQ3 * R * 1.5 || Math.abs(A0.y - B0.y) > 0.12;
        const mid = A0.clone().lerp(B0, 0.5); mid.y += jump ? Math.min(1.1, 0.42 + dist * 0.3) : 0.045;
        const curve = new THREE.QuadraticBezierCurve3(A0, mid, B0);
        const last = i === pts.length - 2;
        const tubeGeo = new THREE.TubeGeometry(curve, 14, a.width || 0.032, 8, false);
        const dash = dashTex.clone(); dash.needsUpdate = true; dash.repeat.set(Math.max(1, dist * 3.2), 1);
        const mat = new THREE.MeshBasicMaterial({ color: col, alphaMap: dash, transparent: true, depthWrite: false, depthTest: false, opacity: a.opacity ?? 0.95 });
        mat.userData.dash = dash;
        flowMats.push(mat);
        const tube = new THREE.Mesh(tubeGeo, mat); tube.renderOrder = 15; arrowGroup.add(tube);
        if (a.head === true) {
          const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 14), new THREE.MeshBasicMaterial({ color: col, depthWrite: false, depthTest: false, opacity: a.opacity ?? 1, transparent: true }));
          const tan = curve.getTangent(1).normalize();
          head.position.copy(B0).addScaledVector(tan, -0.05); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan); head.renderOrder = 16;
          arrowGroup.add(head);
        }
      }
    }
  }

  function buildGhost(model) {
    clearGroup(ghostHolder);
    const g = model.ghost;
    if (!g) return;
    const mats = pieceMaterials(900 + g.type.charCodeAt(0), g.type, g.color === 0 ? 'w' : 'b').map((m) => { const c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = () => 'ghost-' + (m.customProgramCacheKey?.() || ''); c.transparent = true; c.opacity = 0.88; return c; });
    const mesh = new THREE.Mesh(tileGeo, mats);
    const p = tileXZ(g.q, g.r);
    mesh.position.set(p.x, (g.height || 0) * LV + 0.1, p.z);
    mesh.rotation.y = yawFor(900 + g.type.charCodeAt(0), 0);
    mesh.castShadow = true;
    mesh.userData.bob = true;
    ghostHolder.add(mesh);
  }

  // ---------------- update(model)
  let lastModel = { tiles: [], targets: [], arrows: [] };
  let centred = false;
  function levelY(l) { return l * LV; }

  function bounds(model) {
    const ts = model.tiles.length ? model.tiles : [{ q: 0, r: 0 }];
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const t of ts) { const p = tileXZ(t.q, t.r); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    return { minX: minX - 0.95, maxX: maxX + 0.95, minZ: minZ - 0.95, maxZ: maxZ + 0.7 };
  }

  function animateMove(entry, path, t) {
    const pts = path.map(([q, r, lvl]) => { const p = tileXZ(q, r); return new THREE.Vector3(p.x, levelY(lvl), p.z); });
    if (pts.length < 2) return;
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push(d); total += d; }
    const dur = Math.min(1100, 320 + total * 190);
    const yaw0 = entry.mesh.rotation.y, yaw1 = entry.yawTarget;
    let dy = ((yaw1 - yaw0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const jumpLift = (i) => (seg[i] > SQ3 * R * 1.5 ? Math.min(0.9, 0.3 + seg[i] * 0.26) : Math.abs(pts[i + 1].y - pts[i].y) > 0.05 ? 0.4 : 0.14);
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
      done: () => {
        entry.animating = false;
        const e = pts[pts.length - 1];
        entry.mesh.position.copy(e); entry.mesh.rotation.set(0, yaw1, 0);
        settle(entry.mesh);
      },
    });
  }
  function settle(mesh) {
    stage.tween({ dur: 170, ease: ease.out, update: (k) => { mesh.scale.y = 1 - Math.sin(k * Math.PI) * 0.03; } , done: () => { mesh.scale.y = 1; } });
  }
  function animateDrop(entry, p, yaw) {
    const m = entry.mesh; entry.animating = true;
    m.position.set(p.x, p.y + 1.35, p.z); m.rotation.y = yaw + 0.5;
    stage.tween({
      dur: 520, ease: ease.out,
      update: (k) => { m.position.y = p.y + 1.35 * (1 - k) + Math.sin(k * Math.PI) * 0.06; m.rotation.y = yaw + 0.5 * (1 - k); m.scale.setScalar(1 + 0.08 * (1 - k)); },
      done: () => { entry.animating = false; m.position.copy(p); m.rotation.set(0, yaw, 0); m.scale.setScalar(1); settle(m); },
    });
  }

  function update(model) {
    settings = { ...settings, ...(model.settings || {}) };
    const prevOrigin = { x: origin.x, z: origin.z };
    // keep the hive on the stump: re-centre the table when its centre of mass drifts
    if (model.tiles.length) {
      let sx = 0, sz = 0; for (const t of model.tiles) { const p = tileXZ(t.q, t.r); sx += p.x; sz += p.z; }
      sx /= model.tiles.length; sz /= model.tiles.length;
      if (!centred || Math.hypot(sx - origin.x, sz - origin.z) > 2.6) {
        const to = { x: sx, z: sz };
        if (!centred || model.instant) setOrigin(to.x, to.z);
        else {
          const from = { x: origin.x, z: origin.z };
          stage.tween({ dur: 700, ease: ease.inOut, update: (k) => { setOrigin(from.x + (to.x - from.x) * k, from.z + (to.z - from.z) * k); layoutCells(); } });
        }
        centred = true;
      }
    }
    gridCentre = { q: 0, r: 0 };
    layoutCells();
    stage.aimLight(0, 0, 8);

    const want = new Set(model.tiles.map((t) => t.piece));
    for (const [id, e] of tiles) if (!want.has(id)) { world.remove(e.mesh); tiles.delete(id); }
    const anim = model.moveAnim;
    for (const t of model.tiles) {
      let e = tiles.get(t.piece);
      const fresh = !e;
      const p = tileXZ(t.q, t.r);
      const dest = new THREE.Vector3(p.x, levelY(t.level), p.z);
      const yaw = yawFor(t.piece, t.ply ?? 0);
      if (!e) { e = makeTile(t); tiles.set(t.piece, e); }
      e.yawTarget = yaw;
      const moved = !fresh && (e.q !== t.q || e.r !== t.r || e.level !== t.level);
      e.q = t.q; e.r = t.r; e.level = t.level;
      e.mesh.userData.q = t.q; e.mesh.userData.r = t.r;
      if (anim && anim.piece === t.piece && !model.instant) {
        if (fresh) animateDrop(e, dest, yaw);
        else animateMove(e, anim.path, t);
      } else if (!e.animating) {
        e.mesh.position.copy(dest); e.mesh.rotation.set(0, yaw, 0);
      }
      e.mesh.castShadow = true;
    }
    // state rings: movable (amber), selected (white), last moved (gold)
    for (const t of model.tiles) {
      const e = tiles.get(t.piece); if (!e) continue;
      const sel = model.selected === t.piece, can = model.selectable?.has(t.piece), last = model.last === t.piece && !model.selected;
      e.ring.visible = !!(sel || can || last);
      e.ringMat.color.set(sel ? 0xffffff : can ? 0xffc107 : 0xffd978);
      e.ringMat.opacity = sel ? 0.95 : can ? 0.8 : 0.5;
      e.can = !!can;
    }
    buildTargets(model); buildArrows(model); buildGhost(model);
    lastModel = model;
    if (!model.keepView) {
      const b = bounds(model);
      const local = { minX: b.minX - origin.x, maxX: b.maxX - origin.x, minZ: b.minZ - origin.z, maxZ: b.maxZ - origin.z };
      if (model.refit || !fitted || offscreen(model)) { stage.fit(local, { animate: fitted && !model.instant, margin: 1.22 }); fitted = true; }
    }
    stage.invalidate();
  }
  let fitted = false;
  const proj = new THREE.Vector3();
  /** True when any piece sits outside the comfortable middle of the view (or the view is far tighter than the hive needs). */
  function offscreen(model) {
    stage.camera.updateMatrixWorld(); stage.camera.updateProjectionMatrix();
    for (const t of model.tiles) {
      const p = tileXZ(t.q, t.r);
      proj.set(p.x - origin.x, t.level * LV, p.z - origin.z).project(stage.camera);
      if (Math.abs(proj.x) > 0.78 || proj.y > 0.74 || proj.y < -0.8) return true;
    }
    return false;
  }

  function animate(t, dt) {
    if (!ready) return false;
    let live = false;
    const s = t / 1000;
    for (const o of targetObjs) {
      const u = o.g.userData; u.pulse += dt / 1000 * (u.id === hoverId ? 5 : 2.6);
      const k = 0.5 + 0.5 * Math.sin(u.pulse);
      u.glow.material.opacity = (u.pending ? 0.9 : 0.4) + k * 0.28 + (u.id === hoverId ? 0.25 : 0);
      u.ringM.material.opacity = 0.78 + k * 0.22;
      u.sp.position.y = 0.34 + Math.sin(u.pulse * 1.3) * 0.025;
      live = true;
    }
    for (const m of flowMats) { m.userData.dash.offset.x = -s * 0.9; live = true; }
    for (const g of ghostHolder.children) if (g.userData.bob) { g.position.y = (lastModel.ghost?.height || 0) * LV + 0.1 + Math.sin(s * 3.2) * 0.04; live = true; }
    for (const e of tiles.values()) if (e.ring.visible && e.can) { e.ringMat.opacity = 0.55 + 0.25 * Math.sin(s * 3.1 + e.q); live = true; }
    return live;
  }

  // ---------------- picking
  function tapAt(x, y) {
    if (!ready) return;
    const hit = stage.pick(x, y, [...targetObjs.map((o) => o.hit), ...[...tiles.values()].map((e) => e.mesh)])[0];
    if (!hit) {
      const p = stage.groundPoint(x, y);
      if (p && handlers.onCell) {
        const gx = (p.x + origin.x) / (R * 1.5), q = gx, r = (p.z + origin.z) / (R * SQ3) - q / 2;
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(-q - r);
        const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r);
        if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
        return handlers.onCell(rq, rr);
      }
      return handlers.onEmpty?.();
    }
    if (hit.object.userData.target != null) return handlers.onTarget?.(hit.object.userData.target);
    // a tile only reports itself if it is the top piece of its stack
    const piece = hit.object.userData.piece;
    const e = tiles.get(piece);
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

  // ---------------- thumbnails for the reserve trays, lit by the same light
  const thumbCache = new Map();
  let tr = null;
  function thumb(type, colour, size = 120) {
    const k = type + colour + size; if (thumbCache.has(k)) return thumbCache.get(k);
    if (!tr) {
      const c = document.createElement('canvas'); c.width = c.height = size * 2;
      tr = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
      tr.setPixelRatio(1); tr.setSize(size * 2, size * 2, false);
      tr.toneMapping = THREE.ACESFilmicToneMapping; tr.toneMappingExposure = 1.25; tr.setClearColor(0x000000, 0);
    }
    const col = colour === 0 ? 'w' : 'b';
    const sc = new THREE.Scene();
    sc.environment = scene.environment; sc.environmentIntensity = 0.7;
    const l = new THREE.DirectionalLight(0xffeccf, 3.6); l.position.copy(KEY_DIR).multiplyScalar(8); sc.add(l);
    sc.add(new THREE.HemisphereLight(0xcfe3ff, 0x3a2a18, 0.55));
    const cap = capMaterial(type, col).clone(); cap.onBeforeCompile = capMaterial(type, col).onBeforeCompile; cap.customProgramCacheKey = () => 'hive-cap';
    const mesh = new THREE.Mesh(tileGeo, [cap, sideMats[col]]); sc.add(mesh);
    const cam = new THREE.PerspectiveCamera(13.5, 1, 0.1, 50);
    cam.position.set(0, 5.6, 3.1); cam.lookAt(0, 0.12, 0.08);
    tr.render(sc, cam);
    const url = tr.domElement.toDataURL('image/png');
    cap.dispose();
    thumbCache.set(k, url); return url;
  }

  layoutCells();
  await dressing;
  ready = true;
  stage.invalidate();

  return {
    stage, update, thumb,
    setHandlers(h) { Object.assign(handlers, h); },
    refit() { stage.fit({ ...(() => { const b = bounds(lastModel); return { minX: b.minX - origin.x, maxX: b.maxX - origin.x, minZ: b.minZ - origin.z, maxZ: b.maxZ - origin.z }; })() }); },
    get tilesOnBoard() { return tiles.size; },
    /** Client coordinates of a cell's top surface (tests and onboarding hints use this). */
    screenOf(q, r, count = 0) {
      const p = tileXZ(q, r), v = new THREE.Vector3(p.x - origin.x, count ? (count - 1) * LV + TOP : 0, p.z - origin.z);
      stage.camera.updateMatrixWorld(); v.project(stage.camera);
      const b = stage.canvas.getBoundingClientRect();
      return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
    },
    dispose() { stage.dispose(); tr?.dispose(); },
  };
}
