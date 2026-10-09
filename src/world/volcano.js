import * as THREE from 'three';
import { lerp, mulberry32 } from '../noise.js';
import { puffTexture } from './plant-looks.js';
import { terrainFns, volcanoFx, whenLoaded, world } from './world.js';
import { groundAt } from './query.js';

export function addVolcanoEffects() {
  lavaFlows.length = 0;
  for (const v of terrainFns.volcanoes) {
    // the flows are draped over the ground, so they wait until it's generated
    const r = volcanoRadius(v);
    whenLoaded(v.x - r, v.x + r, v.z - r, v.z + r, () => addLavaFlows(v, mulberry32(Math.round(v.x * 1000 + v.z))));
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
    const lava = new THREE.Mesh(new THREE.CircleGeometry(v.crater * 0.75, 10), lavaMat);
    lava.rotation.x = -Math.PI / 2;
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

// Lava flows: glowing rivers running from each crater rim down the volcano's side. Each follows the
// slope downhill (with a little wander) until the ground flattens out at the foot of the cone.
export const lavaFlows = [];   // { pts: [{x, y, z, w}], minX, maxX, minZ, maxZ }
const lavaUniforms = { uTime: { value: 0 } };
function lavaFlowMaterial() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
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
        float hot = smoothstep(0.35, 0.75, n * 0.6 + middle * 0.7);
        vec3 crust = vec3(0.09, 0.035, 0.02), glow = vec3(1.6, 0.55, 0.1), white = vec3(2.2, 1.4, 0.5);
        diffuseColor.rgb = mix(crust, mix(glow, white, smoothstep(0.85, 1.0, hot)), hot);`);
  };
  return mat;
}

// How far a volcano's slopes (and its lava flows) reach from its centre, in metres.
export const volcanoRadius = (v) => v.R * 1.1 + 6;
function addLavaFlows(v, rand) {
  const T = terrainFns, mat = lavaFlowMaterial();
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
    // a strip of three vertices across the flow at each point, each draped on the ground
    const pos = [], uv = [], idx = [];
    let along = 0;
    pts.forEach((p, k) => {
      if (k) along += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z);
      const px = -p.dz, pz = p.dx;
      for (let c = 0; c < 3; c++) {
        const off = (c - 1) * p.w, cx = p.x + px * off, cz = p.z + pz * off;
        const hit = groundAt(cx, cz);
        const y = (hit ? hit.point.y : T.surfaceHeight(cx, cz)) + 0.12;
        pos.push(cx, y, cz); uv.push(c / 2, along);
        if (c === 1) p.y = y;
      }
      if (k) for (let c = 0; c < 2; c++) { const a = (k - 1) * 3 + c, b = k * 3 + c; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    world.add(mesh);
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    lavaFlows.push({ pts, minX: Math.min(...xs) - 3, maxX: Math.max(...xs) + 3, minZ: Math.min(...zs) - 3, maxZ: Math.max(...zs) + 3 });
  }
}

// Height of the lava lake in a crater at (x, z), or -Infinity.
export function craterLavaAt(x, z) {
  for (const v of terrainFns.volcanoes) if (Math.hypot(x - v.x, z - v.z) < v.crater * 0.8) return v.lavaY;
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

export function updateVolcanoes(dt, time) {
  lavaUniforms.uTime.value = time;
  for (const fx of volcanoFx) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.7);
    fx.lavaMat.color.setRGB(1, 0.32 + pulse * 0.12, 0.08);
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
