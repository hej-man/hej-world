import * as THREE from 'three';
import { WORLD } from '../config.js';
import { terrainFns } from './world.js';

// Water: a smooth surface whose small waves and ripples are drawn per pixel. It reflects the sky,
// is clearer when you look straight down (Fresnel), and turns shallow turquoise with foam near the
// shore. Where the water is (and how deep) comes from a map of the ground's top in every 1 m column,
// so the surface stops exactly at the side of the first block that stands above it.
export const waterUniforms = { uTime: { value: 0 }, uGroundH: { value: null }, uWorld: { value: new THREE.Vector3() } };
let tops = null, topsTex = null, topsDirty = false;
// Starts the map from the terrain's shape; each chunk writes its real block tops once it's built.
function makeWaterDepthTexture() {
  const n = WORLD.size, T = terrainFns;
  tops = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    tops[i + j * n] = Math.max(0, Math.min(255, Math.floor(T.surfaceHeight(i + 0.5, j + 0.5))));
  topsTex = new THREE.DataTexture(tops, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  topsTex.magFilter = topsTex.minFilter = THREE.LinearFilter;
  topsTex.needsUpdate = true;
  return topsTex;
}
// The height of the ground's top in the column at (x, z) (whole metres).
export const groundTop = (x, z) => (tops ? tops[Math.floor(x) + Math.floor(z) * WORLD.size] : terrainFns.surfaceHeight(x, z));
// The ground's top over the columns x0 <= x < x0 + nx, z0 <= z < z0 + nz, from a solid-cell buffer
// laid out like fillSolid's (x fastest, then y, then z).
export function setGroundTops(x0, z0, nx, nz, solid) {
  if (!tops) return;
  const n = WORLD.size, H = WORLD.height;
  for (let lz = 0; lz < nz; lz++) for (let lx = 0; lx < nx; lx++) {
    const x = x0 + lx, z = z0 + lz;
    if (x < 0 || z < 0 || x >= n || z >= n) continue;
    let y = H - 1;
    while (y >= 0 && !solid[lx + nx * (y + H * lz)]) y--;
    tops[x + z * n] = y + 1;
  }
  topsDirty = true;
}
// The water surface material. `natural`: the sea, the river and lakes (a flat plane at the water
// level, cut off by the ground map); otherwise water you poured, which has its own shape. Both look
// the same from up close.
export function waterMaterial(natural) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x06303f, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.75 });
  if (natural) mat.defines = { NATURAL_WATER: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;\nvarying float vLevel;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // the plane is rotated to lie flat, so local z is world up: a gentle swell
        #ifdef NATURAL_WATER
        transformed.z += (sin(position.x * 0.11 + uTime * 0.7) + sin(position.y * 0.09 - uTime * 0.55)) * 0.05;
        #endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vLevel = (modelMatrix * vec4(position, 1.0)).y; // the still water level here`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform sampler2D uGroundH;
        uniform vec3 uWorld; // size, height, water level
        varying vec3 vWPos;
        varying float vLevel;
        float wh(vec2 p) { p = fract(p * 0.3183099 + 0.1) * 17.0; return fract(p.x * p.y * (p.x + p.y)); }
        float wnoise(vec2 x) {
          vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y);
        }
        vec2 wgrad(vec2 p) { const float e = 0.08; return vec2(wnoise(p + vec2(e, 0)) - wnoise(p - vec2(e, 0)), wnoise(p + vec2(0, e)) - wnoise(p - vec2(0, e))) / (2.0 * e); }
        vec2 wave(vec2 p, vec2 d, float k, float w, float a) { return d * (a * k * cos(dot(d, p) * k + uTime * w)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        #ifdef NATURAL_WATER
        // none over a column whose top block stands above the water (that also keeps the sea out
        // of caves below sea level); the edge falls exactly on the block's side
        float colTop = texture2D(uGroundH, (floor(vWPos.xz) + 0.5) / uWorld.x).r * 255.0;
        if (colTop > vLevel + 0.02) discard;
        // depth, smoothed between columns, for the shallows and foam
        float groundH = texture2D(uGroundH, vWPos.xz / uWorld.x).r * 255.0;
        float depth = vWPos.y - groundH;
        #else
        float depth = 1.2; // poured water: a little shallow-looking, no shore foam
        #endif
        float shallow = 1.0 - smoothstep(0.2, 3.5, depth);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.2, 0.19), shallow * 0.7);
        float foam = (1.0 - smoothstep(0.0, 0.3, depth + (wnoise(vWPos.xz * 1.7 + uTime * 0.4) - 0.5) * 0.3)) * step(-0.4, depth) * 0.7;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.9, 0.92), foam * 0.75);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 faceN = normal;
        vec2 p = vWPos.xz, g = vec2(0.0);
        g += wave(p, normalize(vec2(0.8, 0.6)), 0.55, 1.2, 0.05);
        g += wave(p, normalize(vec2(-0.4, 0.9)), 0.9, 1.7, 0.03);
        g += wave(p, normalize(vec2(0.95, -0.3)), 1.6, 2.3, 0.015);
        g += wgrad(p * 1.1 + vec2(uTime * 0.25, uTime * 0.18)) * 0.05;
        g += wgrad(p * 3.3 - vec2(uTime * 0.35, -uTime * 0.22)) * 0.022;
        g *= 1.0 - foam * 0.7;
        vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz) * faceDirection;
        #ifndef NATURAL_WATER
        // poured water has sides too: only its top gets the waves
        normal = mix(faceN, normal, step(0.7, dot(faceN, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz))));
        #endif
        // clearer straight down, mirror-like at grazing angles; see-through in the shallows
        float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
        diffuseColor.a = mix(mix(0.8, 0.97, fres), 0.3, shallow * (1.0 - fres)) + foam * 0.5;
        diffuseColor.a = clamp(diffuseColor.a, 0.0, 1.0);`);
  };
  return mat;
}

export function makeWater() {
  const S = WORLD.size - 2;
  const geo = new THREE.PlaneGeometry(S, S, Math.round(S / 4), Math.round(S / 4));
  waterUniforms.uGroundH.value?.dispose();
  waterUniforms.uGroundH.value = makeWaterDepthTexture();
  waterUniforms.uWorld.value.set(WORLD.size, WORLD.height, WORLD.waterLevel);
  const mat = waterMaterial(true);
  const water = new THREE.Mesh(geo, mat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD.size / 2, WORLD.waterLevel, WORLD.size / 2);
  water.receiveShadow = false; // shadows on a moving mirror look wrong, and cost a lookup
  water.renderOrder = 1;
  const group = new THREE.Group();
  group.add(water);
  // lakes: a flat fan following each lake's wobbly outline, a little past its shore
  for (const lk of terrainFns.lakes) {
    const n = 72, pos = [0, 0, 0], idx = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, r = terrainFns.lakeRadius(lk, a) * terrainFns.LAKE_EDGE + 4; // past the shore: the ground map cuts it off
      pos.push(Math.cos(a) * r, -Math.sin(a) * r, 0); // the plane is turned flat, so local -y is world +z
      idx.push(0, 1 + k, 1 + ((k + 1) % n));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(lk.x, lk.level, lk.z);
    m.renderOrder = 1;
    m.userData.lake = lk;
    group.add(m);
  }
  group.userData.sea = water;
  return group;
}

// The river and lakes rise and fall with the weather (world/hydro.js): move their surfaces to match.
export function updateWaterLevels(group) {
  if (!group) return;
  if (topsDirty && topsTex) { topsTex.needsUpdate = true; topsDirty = false; }
  group.userData.sea.position.y = WORLD.waterLevel + terrainFns.live.sea;
  for (const m of group.children) if (m.userData.lake) m.position.y = m.userData.lake.level + m.userData.lake.offset;
}
