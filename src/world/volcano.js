import * as THREE from 'three';
import { lerp, mulberry32 } from '../noise.js';
import { puffTexture } from './plant-looks.js';
import { terrainFns, volcanoFx, whenLoaded, world } from './world.js';
import { groundAt } from './query.js';

export function addVolcanoEffects() {
  lavaFlows.length = 0;
  for (const v of terrainFns.volcanoes) {
    // the flows' paths are known now (so lava burns and plants avoid it from the start); each
    // flow's mesh is draped over the ground once the ground under that flow exists
    addLavaFlows(v, mulberry32(Math.round(v.x * 1000 + v.z)));
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a, side: THREE.DoubleSide });
    const lava = new THREE.Mesh(craterLakeGeometry(v), lavaMat);
    lava.position.set(v.x, v.lavaY, v.z);
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
    volcanoFx.push({ v, lava, lavaMat, light, smoke });
  }
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
    while (r < v.crater * 1.2 && T.surfaceHeight(v.x + Math.cos(a) * r, v.z + Math.sin(a) * r) < v.lavaY) r += 0.25;
    rs.push(r);
  }
  return (v.lakeR = rs);
}
function craterLakeGeometry(v) {
  const rs = lakeRadii(v), pos = [0, 0, 0], idx = [];
  for (let k = 0; k < LAKE_SIDES; k++) {
    const a = (k / LAKE_SIDES) * Math.PI * 2, r = rs[k] + 1.2;
    pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    idx.push(0, 1 + ((k + 1) % LAKE_SIDES), 1 + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// How far the crater lake reaches from the centre in the direction of (dx, dz).
function lakeRadiusToward(v, dx, dz) {
  const rs = lakeRadii(v), f = ((Math.atan2(dz, dx) / (Math.PI * 2) + 1) % 1) * LAKE_SIDES, k = Math.floor(f) % LAKE_SIDES;
  return lerp(rs[k], rs[(k + 1) % LAKE_SIDES], f - Math.floor(f));
}

// Lava flows: glowing rivers running from each crater rim down the volcano's side. Each follows the
// slope downhill (with a little wander) until the ground flattens out at the foot of the cone.
export const lavaFlows = [];   // { pts: [{x, y, z, w}], minX, maxX, minZ, maxZ }
const lavaUniforms = { uTime: { value: 0 } };
function lavaFlowMaterial() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lavaUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLavaUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLavaUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec2 vLavaUv;
        float lh(vec2 p) { p = fract(p * vec2(0.3183, 0.3679) + 0.1) * 17.0; return fract(p.x * p.y * (p.x + p.y)); }
        float ln(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // u runs across the flow (0..1), v along it in metres; the pattern slides downhill
        float along = vLavaUv.y * 0.35 - uTime * 0.5;
        float n = ln(vec2(vLavaUv.x * 4.0, along)) * 0.6 + ln(vec2(vLavaUv.x * 11.0, along * 2.7)) * 0.4;
        float middle = 1.0 - abs(vLavaUv.x - 0.5) * 2.0;
        float hot = smoothstep(0.25, 0.65, n * 0.6 + middle * 0.8);
        vec3 crust = vec3(0.16, 0.05, 0.02), glow = vec3(2.6, 0.85, 0.15), white = vec3(3.2, 2.0, 0.7);
        diffuseColor.rgb = mix(crust, mix(glow, white, smoothstep(0.85, 1.0, hot)), hot);`);
  };
  return mat;
}

// A soft additive glow over and around each flow, so lava shows up from a distance and at night.
function lavaHaloMaterial() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lavaUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLavaUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLavaUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vLavaUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float edge = 1.0 - abs(vLavaUv.x - 0.5) * 2.0;
        diffuseColor.a = edge * edge * (0.45 + 0.12 * sin(uTime * 2.0 + vLavaUv.y * 0.3));`);
  };
  return mat;
}
// Embers: sparks drifting up from the flows
const emberUniforms = { uTime: lavaUniforms.uTime };
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
  const T = terrainFns, mat = lavaFlowMaterial(), haloMat = lavaHaloMaterial();
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
    whenLoaded(flow.minX, flow.maxX, flow.minZ, flow.maxZ, () => buildFlowMesh(pts, mat, haloMat, mulberry32(Math.round(pts[0].x * 97 + pts[0].z))));
  }
}
function buildFlowMesh(pts, mat, haloMat, rand) {
  const T = terrainFns;
  // a strip of three vertices across the flow at each point, each draped on the ground; and a
  // wider glow strip a little above it
  const pos = [], uv = [], idx = [], hpos = [];
  let along = 0;
  pts.forEach((p, k) => {
    if (k) along += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z);
    const px = -p.dz, pz = p.dx;
    for (let c = 0; c < 3; c++) {
      const off = (c - 1) * p.w, cx = p.x + px * off, cz = p.z + pz * off;
      const hit = groundAt(cx, cz);
      const y = (hit ? hit.point.y : T.surfaceHeight(cx, cz)) + 0.2;
      pos.push(cx, y, cz); uv.push(c / 2, along);
      if (c === 1) p.y = y;
      hpos.push(p.x + px * off * 2.4, y + 0.35, p.z + pz * off * 2.4);
    }
    if (k) for (let c = 0; c < 2; c++) { const a = (k - 1) * 3 + c, b = k * 3 + c; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  const halo = new THREE.BufferGeometry();
  halo.setAttribute('position', new THREE.Float32BufferAttribute(hpos, 3));
  halo.setAttribute('uv', geo.attributes.uv);
  halo.setIndex(idx);
  halo.computeBoundingSphere();
  const glow = new THREE.Mesh(halo, haloMat);
  glow.renderOrder = 3;
  world.add(mesh, glow, emberPoints(pts, rand));
}

// Height of the lava lake in a crater at (x, z), or -Infinity.
export function craterLavaAt(x, z) {
  for (const v of terrainFns.volcanoes) {
    const dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz);
    if (d < v.crater * 1.3 && d < lakeRadiusToward(v, dx, dz) + 0.6) return v.lavaY;
  }
  return -Infinity;
}
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

// Are your feet actually touching lava (for burning the player)? Unlike lavaAt, which has some
// room around it for keeping trees and animals away, this only counts feet at or below the lava's
// surface: standing on a bridge or a ledge above it, or in a tunnel under a flow, is safe.
export function lavaTouching(x, feet, z) {
  const crater = craterLavaAt(x, z);
  if (feet < crater + 0.1 && feet > crater - 3) return true;
  for (const fl of lavaFlows) {
    if (x < fl.minX || x > fl.maxX || z < fl.minZ || z > fl.maxZ) continue;
    const p = fl.pts;
    for (let k = 1; k < p.length; k++) {
      const a = p[k - 1], b = p[k], ex = b.x - a.x, ez = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1)));
      const d = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t)), surface = lerp(a.y, b.y, t);
      if (d < a.w * 0.85 && feet < surface + 0.1 && feet > surface - 1.5) return true;
    }
  }
  return false;
}

export function updateVolcanoes(dt, time) {
  lavaUniforms.uTime.value = time;
  for (const fx of volcanoFx) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.7);
    fx.lavaMat.color.setRGB(2.2, 0.7 + pulse * 0.25, 0.15); // brighter than white: it glows
    fx.light.intensity = 220 + pulse * 80;
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
