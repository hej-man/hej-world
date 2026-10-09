import * as THREE from 'three';
import { worldStats } from '../main.js';
import { QUALITY, WORLD } from '../config.js';
import { mulberry32, smoothstep } from '../noise.js';
import { LAYER, TEX_LAYERS, texUniforms } from '../terrain/textures.js';
import { fieldNormal, sampleField, terrainUniforms } from '../terrain/material.js';
import { canvasTexture } from './plant-looks.js';
import { litMaterial } from '../render/scene.js';
import { editedMat, isLoaded, terrainFns } from './world.js';
import { editedMaterialAt } from './query.js';

// ---------------------------------------------------------------------------
// Grass blades: tufts of crossed cards around the player, swaying in the wind and shrinking away
// with distance. They take their colour from the grass texture under them, so they blend into the
// ground, and are built in 16 m patches as you walk (and rebuilt when you dig).
// ---------------------------------------------------------------------------
const GRASS_PATCH = 16, GRASS_RADIUS = QUALITY === 'low' ? 28 : 44, GRASS_PER_PATCH = QUALITY === 'low' ? 320 : 620;
export const grassGroup = new THREE.Group();
export const grassPatches = new Map();  // "i,j" -> InstancedMesh
export const grassUniforms = { uWind: { value: 0.3 }, uGrassCam: { value: new THREE.Vector3() } };
let grassGeo = null, grassMat = null;

function grassTexture() {
  return canvasTexture(128, (g, S) => {
    const rand = mulberry32(23);
    for (let i = 0; i < 46; i++) {
      // a blade: a thin curved wedge, darker at its root
      const x0 = S * (0.08 + rand() * 0.84), h = S * (0.45 + rand() * 0.53), lean = (rand() - 0.5) * S * 0.3, w = 2.2 + rand() * 2.6;
      const grd = g.createLinearGradient(0, S, 0, S - h);
      const l = 62 + rand() * 30;
      grd.addColorStop(0, `hsl(85, 20%, ${l * 0.45}%)`); grd.addColorStop(1, `hsl(${70 + rand() * 20}, 25%, ${l}%)`);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x0 - w, S);
      g.quadraticCurveTo(x0 - w * 0.5 + lean * 0.3, S - h * 0.6, x0 + lean, S - h);
      g.quadraticCurveTo(x0 + w * 0.5 + lean * 0.3, S - h * 0.6, x0 + w, S);
      g.fill();
    }
  });
}

// three cards crossed at 60 degrees; normals point up, so the tufts are lit like the ground they stand on
function grassGeometry() {
  const pos = [], uv = [], nrm = [], idx = [], W = 0.42, H = 0.55;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI, c = Math.cos(a) * W, sn = Math.sin(a) * W, b = pos.length / 3;
    pos.push(-c, 0, -sn, c, 0, sn, c, H, sn, -c, H, -sn);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let v = 0; v < 4; v++) nrm.push(0, 1, 0);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function grassMaterial() {
  const mat = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92 });
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, texUniforms, grassUniforms, { uTime: terrainUniforms.uTime });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray tAlbedo;
        uniform float uTime, uWind;
        uniform vec3 uGrassCam;
        varying vec3 vGrassCol;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 root = instanceMatrix[3].xyz;
        // shrink away towards the edge of the grass area, so patches don't pop in
        float fade = 1.0 - smoothstep(${(GRASS_RADIUS * 0.6).toFixed(1)}, ${GRASS_RADIUS.toFixed(1)}, length(root.xz - uGrassCam.xz));
        transformed *= fade;
        float gust = sin(uTime * 1.7 + root.x * 0.35 + root.z * 0.27) + 0.5 * sin(uTime * 3.3 + root.x * 0.9 - root.z * 0.4);
        transformed.xz += vec2(0.9, 0.5) * gust * (0.06 + uWind * 0.2) * uv.y * uv.y;
        // the colour of the grass texture under this tuft (a blurry mip, so a smooth average)
        vGrassCol = textureLod(tAlbedo, vec3(root.xz * ${(1 / TEX_LAYERS[LAYER.grass].size).toFixed(4)}, ${LAYER.grass}.0), 5.0).rgb;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb *= vGrassCol * 1.6;`)
      // both sides of a card face up (a back face would otherwise get a downward normal and go dark)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`);
  };
  return mat;
}

// Ground height under (x, z) from the density field (where it crosses zero), or null.
function fieldSurfaceY(x, z) {
  const h = terrainFns.surfaceHeight(x, z);
  let hi = h + 3, lo = h - 3;
  if (sampleField(x, hi, z) > 0 || sampleField(x, lo, z) < 0) return null; // overhang, or dug away
  for (let k = 0; k < 9; k++) { const mid = (hi + lo) * 0.5; if (sampleField(x, mid, z) > 0) lo = mid; else hi = mid; }
  return (hi + lo) * 0.5;
}

// How much grass grows here (0..1), following the same rules as the ground texture.
const _gn = new THREE.Vector3();
function grassAmount(x, y, z) {
  const T = terrainFns;
  if (y < T.waterAt(x, z) + 1.3 || y > 74) return 0;
  if (T.volcanoInfluence(x, z) > 0.02) return 0;
  fieldNormal(x, y, z, _gn);
  if (_gn.y < 0.8) return 0;
  if (editedMat.size && editedMaterialAt(x, y - 0.8, z)) return 0; // dug or built ground stays bare
  const nb = T.noise2(x * 0.03 + 50, z * 0.03 - 20);
  const forest = smoothstep(0, 1, T.forestMask(x, z) + nb * 0.25);
  return (1 - forest * 0.75) * (1 - smoothstep(50, 70, y)) * smoothstep(0.8, 0.9, _gn.y);
}

function buildGrassPatch(i, j) {
  if (!grassGeo) { grassGeo = grassGeometry(); grassMat = grassMaterial(); }
  const rand = mulberry32((i * 7919 + j * 104729) ^ (worldStats?.seed || 1));
  const im = new THREE.InstancedMesh(grassGeo, grassMat, GRASS_PER_PATCH);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const T = terrainFns;
  let n = 0;
  for (let k = 0; k < GRASS_PER_PATCH * 1.5 && n < GRASS_PER_PATCH; k++) {
    const x = (i + rand()) * GRASS_PATCH, z = (j + rand()) * GRASS_PATCH, r = rand();
    if (x < 2 || z < 2 || x > WORLD.size - 2 || z > WORLD.size - 2) continue;
    const y = fieldSurfaceY(x, z);
    if (y === null || r > grassAmount(x, y, z)) continue;
    const size = 0.7 + rand() * 0.6, tall = 0.8 + rand() * 0.7;
    m.compose(p.set(x, y - 0.08, z), q.setFromAxisAngle(up, rand() * Math.PI), sc.set(size, size * tall, size));
    im.setMatrixAt(n, m);
    // dry, yellower grass on open sunny patches, as on the ground texture
    const dry = smoothstep(0.35, 0.7, T.noise3(x * 0.06, y * 0.06, z * 0.06) + T.noise2(x * 0.03 + 50, z * 0.03 - 20)) * 0.6;
    const v = 0.85 + rand() * 0.3;
    im.setColorAt(n, c.setRGB(v * (1 + dry * 0.35), v * (1 + dry * 0.1), v * (1 - dry * 0.45)));
    n++;
  }
  im.count = n;
  im.castShadow = false; im.receiveShadow = true;
  im.frustumCulled = true;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  if (im.boundingSphere) im.boundingSphere.radius += 1;
  return im;
}

// Keeps patches built around (cx, cz); builds at most `budget` new ones per call, nearest first.
export function updateGrass(cx, cz, budget = 2) {
  grassUniforms.uGrassCam.value.set(cx, 0, cz);
  const R = GRASS_RADIUS + GRASS_PATCH * 0.75, P = GRASS_PATCH;
  for (const [key, im] of grassPatches) {
    const [i, j] = key.split(',').map(Number);
    if (Math.hypot((i + 0.5) * P - cx, (j + 0.5) * P - cz) > R + P) { grassGroup.remove(im); im.dispose(); grassPatches.delete(key); }
  }
  const want = [];
  for (let j = Math.floor((cz - R) / P); j <= Math.floor((cz + R) / P); j++) for (let i = Math.floor((cx - R) / P); i <= Math.floor((cx + R) / P); i++) {
    if (i < 0 || j < 0 || i * P >= WORLD.size || j * P >= WORLD.size || grassPatches.has(`${i},${j}`)) continue;
    if (!isLoaded((i + 0.5) * P, (j + 0.5) * P, P / 2 + 2)) continue; // no ground there yet
    const d = Math.hypot((i + 0.5) * P - cx, (j + 0.5) * P - cz);
    if (d < R) want.push([d, i, j]);
  }
  want.sort((a, b) => a[0] - b[0]);
  for (const [, i, j] of want.slice(0, budget)) {
    const im = buildGrassPatch(i, j);
    litMaterial(im.material);
    grassPatches.set(`${i},${j}`, im);
    grassGroup.add(im);
  }
}
// Drop the patches over an area (rebuilt next frame), after digging or filling ground there.
export function invalidateGrass(x0, x1, z0, z1) {
  for (const [key, im] of grassPatches) {
    const [i, j] = key.split(',').map(Number);
    if ((i + 1) * GRASS_PATCH < x0 - 1 || i * GRASS_PATCH > x1 + 1 || (j + 1) * GRASS_PATCH < z0 - 1 || j * GRASS_PATCH > z1 + 1) continue;
    grassGroup.remove(im); im.dispose(); grassPatches.delete(key);
  }
}
export function clearGrass() { invalidateGrass(-Infinity, Infinity, -Infinity, Infinity); }
