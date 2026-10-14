import * as THREE from 'three';
import { lerp, mulberry32 } from '../noise.js';
import { puffTexture } from './plant-looks.js';
import { terrainFns, volcanoFx, whenLoaded, world } from './world.js';
import { pieceHeight, slopeDir, solidCell } from '../terrain/voxels.js';

export function addVolcanoEffects() {
  lavaFlows.length = 0;
  for (const v of terrainFns.volcanoes) {
    // the flows' paths are known now (so lava burns and plants avoid it from the start); each
    // flow's lava is laid on the ground once the ground under that flow exists
    addLavaFlows(v, mulberry32(Math.round(v.x * 1000 + v.z)));
    const lava = new THREE.InstancedMesh(cellBox, lavaMaterial(), 1600);
    lava.count = 0; lava.frustumCulled = false;
    world.add(lava);
    const light = new THREE.PointLight(0xff6a2a, 260, 45, 1.5);
    light.position.set(v.x, v.lavaY + 6, v.z);
    world.add(light);
    const smoke = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0x6f6864, transparent: true, opacity: 0.5, depthWrite: false }));
      m.userData = { t: i / 26, ox: (Math.random() - 0.5) * v.crater, oz: (Math.random() - 0.5) * v.crater, spin: Math.random() * 2 };
      world.add(m);
      smoke.push(m);
    }
    const fx = { v, lava, light, smoke, builtY: null, ready: false, wait: 0 };
    volcanoFx.push(fx);
    const r = v.crater * 1.3;
    whenLoaded(v.x - r, v.x + r, v.z - r, v.z + r, () => { fx.ready = true; });
  }
}

// Lava looks the same everywhere (crater lakes, flows): crust and glowing cracks that drift slowly,
// worked out from the world position so neighbouring blocks join up.
const lavaUniforms = { uTime: { value: 0 } };
const cellBox = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
let _lavaMat = null;
export function lavaMaterial() {
  if (_lavaMat) return _lavaMat;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lavaUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLavaP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 lp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        vLavaP = (modelMatrix * lp).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vLavaP;
        float lh(vec2 p) { p = fract(p * vec2(0.3183, 0.3679) + 0.1) * 17.0; return fract(p.x * p.y * (p.x + p.y)); }
        float ln(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 q = vLavaP.xz + vec2(vLavaP.y * 0.7, -vLavaP.y * 0.5);
        float n = ln(q * 0.55 + vec2(uTime * 0.12, uTime * 0.07)) * 0.6 + ln(q * 1.7 - vec2(uTime * 0.2, 0.0)) * 0.4;
        float hot = smoothstep(0.35, 0.75, n);
        vec3 crust = vec3(0.32, 0.07, 0.02), glow = vec3(1.0, 0.38, 0.05), white = vec3(1.0, 0.82, 0.35);
        diffuseColor.rgb = mix(crust, mix(glow, white, smoothstep(0.82, 1.0, n)), hot);`);
  };
  return (_lavaMat = mat);
}

// The crater lake: every open cell in the crater below the lava's height is lava, the top layer
// only as deep as the lava reaches. Rebuilt when the level changes (scooping, refilling) and now and
// then in case the crater was dug into.
const _cm = new THREE.Matrix4();
function buildCraterLake(fx) {
  const v = fx.v, m = fx.lava, R = Math.ceil(v.crater * 1.25), top = v.lavaY;
  const cx = Math.floor(v.x), cz = Math.floor(v.z), y0 = Math.floor(v.rim - v.depth - 3);
  let i = 0;
  for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++) {
    if (Math.hypot(x + 0.5 - v.x, z + 0.5 - v.z) > v.crater * 1.25) continue;
    for (let y = y0; y < top && i < m.instanceMatrix.count; y++) {
      if (solidCell(x, y, z)) continue;
      // only cells inside the bowl: there's crater wall around them at this height
      if (Math.hypot(x + 0.5 - v.x, z + 0.5 - v.z) > lakeRadiusToward(v, x + 0.5 - v.x, z + 0.5 - v.z) + 1.5) continue;
      _cm.makeScale(1, Math.min(1, top - y), 1).setPosition(x, y, z);
      m.setMatrixAt(i++, _cm);
    }
  }
  m.count = i;
  m.instanceMatrix.needsUpdate = true;
  fx.builtY = top;
}

// The crater lake fills the crater up to its lava height, whatever shape the crater floor has: in
// each direction it reaches out to where the slope rises above the lava (and a little under it, so
// there's no gap at the edge). The same outline decides where you burn.
const LAKE_SIDES = 48;
function lakeRadii(v) {
  if (v.lakeR) return v.lakeR;
  const T = terrainFns, rs = [];
  for (let k = 0; k < LAKE_SIDES; k++) {
    const a = (k / LAKE_SIDES) * Math.PI * 2;
    let r = 0;
    while (r < v.crater * 1.2 && T.surfaceHeight(v.x + Math.cos(a) * r, v.z + Math.sin(a) * r) < v.lavaTop) r += 0.25;
    rs.push(r);
  }
  return (v.lakeR = rs);
}
// How far the crater lake reaches from the centre in the direction of (dx, dz).
function lakeRadiusToward(v, dx, dz) {
  const rs = lakeRadii(v), f = ((Math.atan2(dz, dx) / (Math.PI * 2) + 1) % 1) * LAKE_SIDES, k = Math.floor(f) % LAKE_SIDES;
  return lerp(rs[k], rs[(k + 1) % LAKE_SIDES], f - Math.floor(f));
}

// Lava flows: glowing rivers running from each crater rim down the volcano's side. Each follows the
// slope downhill (with a little wander) until the ground flattens out at the foot of the cone. On the
// block ground a flow is a thin sheet of lava on top of each column it covers, so it steps down
// with the ground.
export const lavaFlows = [];   // { pts: [{x, y, z, w}], minX, maxX, minZ, maxZ }
// Embers: sparks drifting up from the flows
const emberUniforms = lavaUniforms;
function emberPoints(pts, rand) {
  const n = Math.min(80, pts.length), pos = [], seed = [];
  for (let i = 0; i < n; i++) {
    const p = pts[Math.floor(rand() * pts.length)];
    pos.push(p.x + (rand() - 0.5) * p.w * 1.6, p.y, p.z + (rand() - 0.5) * p.w * 1.6); seed.push(rand());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
  const mat = new THREE.PointsMaterial({ color: 0xffa040, size: 0.25, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, emberUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float seed;\nvarying float vFade;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float life = fract(uTime * (0.25 + seed * 0.2) + seed * 7.0);
        transformed += vec3(sin(seed * 40.0 + uTime) * 0.6 * life, life * 5.0, cos(seed * 30.0 + uTime) * 0.6 * life);
        vFade = 1.0 - life;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  const pts3 = new THREE.Points(g, mat);
  pts3.frustumCulled = false;
  return pts3;
}

// How far a volcano's slopes (and its lava flows) reach from its centre, in metres.
export const volcanoRadius = (v) => v.R * 1.1 + 6;
function addLavaFlows(v, rand) {
  const T = terrainFns;
  const n = 3 + Math.floor(rand() * 2);
  for (let f = 0; f < n; f++) {
    const a0 = (f / n) * Math.PI * 2 + rand() * 1.2;
    let x = v.x + Math.cos(a0) * v.crater * 1.05, z = v.z + Math.sin(a0) * v.crater * 1.05;
    let dx = Math.cos(a0), dz = Math.sin(a0);
    const pts = [];
    for (let k = 0; k < 120; k++) {
      // downhill direction from the height field, blended with the current heading so it bends smoothly
      const e = 1.5, gx = T.surfaceHeight(x + e, z) - T.surfaceHeight(x - e, z), gz = T.surfaceHeight(x, z + e) - T.surfaceHeight(x, z - e);
      const g = Math.hypot(gx, gz);
      if (k > 6 && (g < 0.12 || T.volcanoInfluence(x, z) < 0.3)) break;
      const wander = T.noise2(x * 0.05 + f * 9, z * 0.05) * 0.5;
      dx = dx * 0.6 - (gx / (g || 1)) * 0.4 + -dz * wander * 0.3; dz = dz * 0.6 - (gz / (g || 1)) * 0.4 + dx * wander * 0.3;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const w = (1.6 + rand() * 0.4) * (1 - k / 160);
      pts.push({ x, z, w, dx, dz });
      x += dx * 1.6; z += dz * 1.6;
    }
    if (pts.length < 8) continue;
    // until its mesh is built, the flow's height comes from the terrain shape
    for (const p of pts) p.y = T.surfaceHeight(p.x, p.z) + 0.2;
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    const flow = { pts, minX: Math.min(...xs) - 3, maxX: Math.max(...xs) + 3, minZ: Math.min(...zs) - 3, maxZ: Math.max(...zs) + 3 };
    lavaFlows.push(flow);
    whenLoaded(flow.minX, flow.maxX, flow.minZ, flow.maxZ, () => buildFlowMesh(pts, mulberry32(Math.round(pts[0].x * 97 + pts[0].z))));
  }
}
// The height of the ground's top in the column at (x, z), searching down from about `near`: the top
// of the highest ground block, or the middle of a slope piece sitting on it.
function columnTop(x, z, near) {
  for (let y = Math.floor(near) + 4; y > near - 12; y--) {
    if (!solidCell(x, y, z)) continue;
    const d = slopeDir(x, y + 1, z);
    return d >= 0 ? y + 1 + pieceHeight(d, 0.5, 0.5) : y + 1;
  }
  return null;
}
function buildFlowMesh(pts, rand) {
  const T = terrainFns, cols = new Map();
  for (const p of pts) {
    const r = p.w;
    for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++)
      for (let z = Math.floor(p.z - r); z <= Math.floor(p.z + r); z++) {
        if (cols.has(`${x},${z}`) || Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) > r * 0.95) continue;
        const top = columnTop(x, z, T.surfaceHeight(x + 0.5, z + 0.5));
        if (top !== null) cols.set(`${x},${z}`, [x, top, z]);
      }
    const c = cols.get(`${Math.floor(p.x)},${Math.floor(p.z)}`);
    p.y = (c ? c[1] : T.surfaceHeight(p.x, p.z)) + 0.1;
  }
  const m = new THREE.InstancedMesh(cellBox, lavaMaterial(), cols.size);
  let i = 0;
  for (const [x, top, z] of cols.values()) {
    _cm.makeScale(1, 0.2, 1).setPosition(x, top - 0.05, z);
    m.setMatrixAt(i++, _cm);
  }
  m.computeBoundingSphere();
  world.add(m, emberPoints(pts, rand));
}

// The volcano whose crater lake is at (x, z), or null.
export function craterOf(x, z) {
  for (const v of terrainFns.volcanoes) {
    const dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz);
    if (d < v.crater * 1.3 && d < lakeRadiusToward(v, dx, dz) + 0.6) return v;
  }
  return null;
}
// Height of the lava lake in a crater at (x, z), or -Infinity.
export const craterLavaAt = (x, z) => craterOf(x, z)?.lavaY ?? -Infinity;
// Is a point (feet height y) in lava: the crater lake or a flow? `margin` widens the flows (metres).
export function lavaAt(x, y, z, margin = 0) {
  if (y < craterLavaAt(x, z) + 0.4) return true;
  for (const fl of lavaFlows) {
    if (x < fl.minX || x > fl.maxX || z < fl.minZ || z > fl.maxZ) continue;
    const p = fl.pts;
    for (let k = 1; k < p.length; k++) {
      const a = p[k - 1], b = p[k], ex = b.x - a.x, ez = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1)));
      const d = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
      if (d < (a.w + margin) * 0.95 && y < lerp(a.y, b.y, t) + 0.7 + margin && y > lerp(a.y, b.y, t) - 2.5) return true;
    }
  }
  return false;
}

// How deep in lava are feet at this height (metres of lava above them), or -1 if they aren't in it.
// Unlike lavaAt, which has some room around it for keeping trees and animals away, this only counts
// feet at or below the lava's surface and above the ground the lava lies on: standing on a bridge or
// a ledge above it, or in a tunnel or cave under it, is safe, but sinking right in is not.
export function lavaDepth(x, feet, z) {
  const bed = terrainFns.surfaceHeight(x, z) - 1; // a little below: the bed under a flow is rough
  if (feet < bed) return -1;
  const crater = craterLavaAt(x, z);
  if (feet < crater + 0.1) return crater - feet;
  for (const fl of lavaFlows) {
    if (x < fl.minX || x > fl.maxX || z < fl.minZ || z > fl.maxZ) continue;
    const p = fl.pts;
    for (let k = 1; k < p.length; k++) {
      const a = p[k - 1], b = p[k], ex = b.x - a.x, ez = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1)));
      const d = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t)), surface = lerp(a.y, b.y, t);
      if (d < a.w * 0.85 && feet < surface + 0.1) return surface - feet;
    }
  }
  return -1;
}
export const lavaTouching = (x, feet, z) => lavaDepth(x, feet, z) >= -0.1;

export function updateVolcanoes(dt, time) {
  lavaUniforms.uTime.value = time;
  for (const fx of volcanoFx) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.7);
    fx.light.intensity = 220 + pulse * 80;
    // the lava lake sinks when lava is scooped out, and fills back up (world/hydro.js)
    fx.light.position.y = fx.v.lavaY + 6;
    fx.wait -= dt;
    if (fx.ready && (fx.builtY === null || Math.abs(fx.builtY - fx.v.lavaY) > 0.04 || fx.wait <= 0)) { buildCraterLake(fx); fx.wait = 3; }
    for (const s of fx.smoke) {
      const u = s.userData;
      u.t = (u.t + dt * 0.05) % 1;
      s.position.set(fx.v.x + u.ox * (1 + u.t * 2) + u.t * 25, fx.v.lavaY + 4 + u.t * 70, fx.v.z + u.oz * (1 + u.t * 2));
      s.scale.setScalar((2.5 + u.t * 9) * 2.4);
      s.material.rotation = u.t * u.spin;
      s.material.opacity = 0.55 * Math.sin(Math.PI * Math.min(1, u.t * 1.2));
    }
  }
}
