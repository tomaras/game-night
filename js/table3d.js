// Shared 3D tabletop for the hex games (Hive, Cascadia, Harmonies).
// One scene, one camera rig and ONE key light, so every piece, token and tile is lit from the same direction
// and casts the same shadow wherever it sits. Renders only when something changes or moves, so an idle board costs nothing.
import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

export { THREE };

/** Direction every game light and every baked 2D shadow agrees on: from the upper left, falling to the lower right. */
export const KEY_DIR = new THREE.Vector3(-0.55, 0.78, -0.32).normalize();

const loader = new THREE.TextureLoader();
const cache = new Map();
/** Load (and share) a texture. Resolves once the image is decoded. */
export function loadTexture(url, { srgb = true, wrap = false, aniso = 8 } = {}) {
  const key = `${url}|${srgb}|${wrap}`;
  if (cache.has(key)) return cache.get(key);
  const p = loader.loadAsync(url).then((t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  });
  cache.set(key, p);
  return p;
}

export const ease = {
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => { const c = 1.45; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
};

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/**
 * createTable3D(host, { tilt, fov, onTap(clientX, clientY), onHover(clientX, clientY|null), onFrame(t, dt) -> bool keepGoing })
 * host: an element with a size. Returns the stage: { scene, camera, renderer, key, tween, invalidate, fit, pickRay, groundPoint, dispose }.
 */
export function createTable3D(host, opts = {}) {
  const reduce = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'tb3d';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
  canvas.tabIndex = -1;
  host.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let tier = 2; // 2 = shadows + full pixel ratio, 1 = shadows at 1x, 0 = no shadows
  const dpr = () => Math.min(devicePixelRatio || 1, tier >= 2 ? 2 : 1);
  renderer.setPixelRatio(dpr());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x1c2216);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;

  const key = new THREE.DirectionalLight(0xffeccf, 3.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  scene.add(key, key.target);
  const fill = new THREE.HemisphereLight(0xcfe3ff, 0x3a2a18, 0.28);
  scene.add(fill);

  /** Aim the shadow camera at a square of the table (centre cx,cz and half size r). */
  function aimLight(cx, cz, r) {
    key.target.position.set(cx, 0, cz);
    key.position.set(cx + KEY_DIR.x * 14, KEY_DIR.y * 14, cz + KEY_DIR.z * 14);
    const c = key.shadow.camera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 34;
    c.updateProjectionMatrix();
    key.target.updateMatrixWorld();
  }
  aimLight(0, 0, 7);

  // ---- camera rig: target on the table, distance, fixed tilt
  const tilt = (opts.tilt ?? 54) * Math.PI / 180;
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 24, 1, 0.1, 120);
  const rig = { x: 0, z: 0, dist: 14, min: 5, max: 30 };
  const place = () => {
    camera.position.set(rig.x, Math.sin(tilt) * rig.dist, rig.z + Math.cos(tilt) * rig.dist);
    camera.lookAt(rig.x, 0, rig.z);
    camera.updateMatrixWorld();
  };
  place();

  let W = 1, H = 1;
  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width; H = r.height;
    renderer.setPixelRatio(dpr());
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    invalidate();
    opts.onResize?.(W, H);
  }

  /** Distance that shows a ground rectangle {minX,maxX,minZ,maxZ} with margin. */
  function distanceFor(b, margin = 1.14) {
    const tanV = Math.tan(camera.fov * Math.PI / 360);
    const needW = (b.maxX - b.minX) * margin, needD = (b.maxZ - b.minZ) * margin;
    return Math.max(needW / (2 * tanV * camera.aspect), needD * Math.sin(tilt) / (2 * tanV));
  }

  // ---- tweens + demand-driven render loop
  const tweens = new Set();
  function tween({ dur = 300, delay = 0, ease: e = ease.out, update, done }) {
    const tw = { t0: performance.now() + delay, dur: reduce ? Math.min(dur, 60) : dur, e, update, done, dead: false };
    tweens.add(tw); invalidate();
    return { cancel() { tw.dead = true; } };
  }
  let raf = 0, last = 0, disposed = false, frames = 0, slow = 0;
  function invalidate() { if (!raf && !disposed) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min(100, now - last) : 16; last = now;
    let live = false;
    for (const tw of [...tweens]) {
      if (tw.dead) { tweens.delete(tw); continue; }
      const k = (now - tw.t0) / tw.dur;
      if (k < 0) { live = true; continue; }
      const c = Math.min(1, k);
      tw.update?.(tw.e(c), c);
      if (c >= 1) { tweens.delete(tw); tw.done?.(); } else live = true;
    }
    if (opts.onFrame?.(now, dt)) live = true;
    renderer.render(scene, camera);
    // If the first seconds of animation run slowly, drop to a cheaper tier before it ever feels bad.
    if (live) {
      frames++;
      if (dt > 34) slow++;
      if (frames === 45) { if (slow > 14 && tier > 0) setTier(tier - 1); frames = 0; slow = 0; }
    } else { frames = 0; slow = 0; last = 0; }
    if (live) raf = requestAnimationFrame(frame);
  }
  function setTier(n) {
    tier = n;
    renderer.shadowMap.enabled = n > 0;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    renderer.setPixelRatio(dpr());
    renderer.setSize(W, H, false);
    invalidate();
  }

  // ---- picking helpers
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function setRay(cx, cy) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray;
  }
  function groundPoint(cx, cy, out = new THREE.Vector3()) {
    setRay(cx, cy);
    return ray.ray.intersectPlane(ground, out);
  }
  function pick(cx, cy, objects) {
    setRay(cx, cy);
    return ray.intersectObjects(objects, false);
  }

  // ---- input: drag to pan, pinch / wheel to zoom, tap and hover callbacks
  const pointers = new Map();
  let gesture = null, moved = false, downAt = null;
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      moved = false; downAt = { x: e.clientX, y: e.clientY };
      gesture = { mode: 'pan', start: groundPoint(e.clientX, e.clientY, new THREE.Vector3()), rx: rig.x, rz: rig.z };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { mode: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), dist: rig.dist };
      moved = true;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) { if (e.pointerType === 'mouse') opts.onHover?.(e.clientX, e.clientY); return; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture?.mode === 'pan' && pointers.size === 1) {
      if (!moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 7) moved = true;
      if (moved && gesture.start) {
        // keep the point under the finger under the finger
        rig.x = gesture.rx; rig.z = gesture.rz; place();
        const p = groundPoint(e.clientX, e.clientY, tmpB);
        if (p) { rig.x = gesture.rx + gesture.start.x - p.x; rig.z = gesture.rz + gesture.start.z - p.z; clampRig(); place(); invalidate(); }
      }
    } else if (gesture?.mode === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      rig.dist = Math.min(rig.max, Math.max(rig.min, gesture.dist * gesture.d / Math.max(12, d)));
      place(); invalidate(); opts.onView?.();
    }
  });
  const up = (e) => {
    const was = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (!was) return;
    if (pointers.size === 0) {
      if (!moved && e.type === 'pointerup') opts.onTap?.(e.clientX, e.clientY);
      gesture = null;
    } else if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      gesture = { mode: 'pan', start: groundPoint(p.x, p.y, new THREE.Vector3()), rx: rig.x, rz: rig.z };
      downAt = { x: p.x, y: p.y }; moved = true;
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') opts.onHover?.(e.clientX, e.clientY, true); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = groundPoint(e.clientX, e.clientY, tmpA).clone();
    rig.dist = Math.min(rig.max, Math.max(rig.min, rig.dist * Math.exp(e.deltaY * .0013)));
    place();
    const after = groundPoint(e.clientX, e.clientY, tmpB);
    if (before && after) { rig.x += before.x - after.x; rig.z += before.z - after.z; clampRig(); place(); }
    invalidate(); opts.onView?.();
  }, { passive: false });

  const limit = { x: 14, z: 10 };
  function clampRig() { rig.x = Math.max(-limit.x, Math.min(limit.x, rig.x)); rig.z = Math.max(-limit.z, Math.min(limit.z, rig.z)); }

  /** Smoothly move the camera to frame a ground rectangle. */
  function fit(b, { animate = true, margin } = {}) {
    const to = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, dist: Math.min(rig.max, Math.max(rig.min, distanceFor(b, margin))) };
    if (!animate || reduce) { Object.assign(rig, to); place(); invalidate(); return; }
    const from = { x: rig.x, z: rig.z, dist: rig.dist };
    tween({ dur: 520, ease: ease.inOut, update: (k) => { rig.x = from.x + (to.x - from.x) * k; rig.z = from.z + (to.z - from.z) * k; rig.dist = from.dist + (to.dist - from.dist) * k; place(); } });
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // WebGL contexts are lost when a phone backgrounds the tab; redraw when they come back.
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); opts.onContextLost?.(); });
  canvas.addEventListener('webglcontextrestored', () => { scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); invalidate(); });

  return {
    THREE, scene, camera, renderer, key, canvas, rig, aimLight, tween, invalidate, fit, resize, groundPoint, pick, setTier,
    get tier() { return tier; }, get size() { return { w: W, h: H }; },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) [].concat(m).forEach((x) => x.dispose?.()); });
      pmrem.dispose(); renderer.dispose(); canvas.remove();
    },
  };
}
