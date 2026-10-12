import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { LAYER, TEX_GLSL, TEX_LAYERS, makeTileNoise, texUniforms } from '../terrain/textures.js';

// ---------------------------------------------------------------------------
// Vegetation, rock and cloud looks: leaf cards with a drawn leaf texture around a dark core,
// photo bark on trunks, photo rock on lumpy boulders, soft billboard clouds and smoke.
// ---------------------------------------------------------------------------
export function canvasTexture(size, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Leaves are drawn nearly white and tinted green per tree.
let _leafTex = null, _needleTex = null, _puffTex = null;
function leafTexture() {
  return _leafTex || (_leafTex = canvasTexture(256, (g, S) => {
    const rand = mulberry32(11);
    for (let i = 0; i < 260; i++) {
      // denser in the middle, so a card reads as a rounded clump of leaves
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * S * 0.42;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, len = 9 + rand() * 11;
      const l = 55 + rand() * 40;
      g.save(); g.translate(x, y); g.rotate(rand() * Math.PI * 2);
      g.fillStyle = `hsl(${70 + rand() * 25}, ${12 + rand() * 18}%, ${l}%)`;
      g.beginPath(); g.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `hsla(80, 20%, ${l - 25}%, 0.6)`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke();
      g.restore();
    }
  }));
}
function needleTexture() {
  return _needleTex || (_needleTex = canvasTexture(256, (g, S) => {
    const rand = mulberry32(17);
    for (let b = 0; b < 7; b++) {
      // a twig running down the card with needles on both sides
      const x0 = S * (0.15 + b * 0.12), y0 = S * 0.04, x1 = x0 + (rand() - 0.5) * S * 0.2, y1 = S * 0.96;
      g.strokeStyle = 'hsl(30, 25%, 35%)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      for (let t = 0; t < 1; t += 0.012) {
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, side = t * 1000 % 2 < 1 ? -1 : 1;
        const len = (10 + rand() * 9) * (1 - Math.abs(t - 0.5) * 0.8);
        g.strokeStyle = `hsl(${85 + rand() * 30}, ${15 + rand() * 15}%, ${55 + rand() * 35}%)`; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + side * len, y + len * 0.55); g.stroke();
      }
    }
  }));
}
export function puffTexture() {
  return _puffTex || (_puffTex = canvasTexture(128, (g, S) => {
    const rand = mulberry32(5);
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * S * 0.24;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.7, rad = S * (0.12 + rand() * 0.14);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, S, S);
    }
  }));
}

// Builds a geometry from quads; each quad's normals point away from `centre` so a clump of
// cards is lit like a soft round volume instead of flat planes.
function cardGeometry(quads, centre = new THREE.Vector3()) {
  const pos = [], nrm = [], uv = [], idx = [], n = new THREE.Vector3();
  for (const q of quads) {
    const base = pos.length / 3;
    q.forEach((p, k) => {
      pos.push(p.x, p.y, p.z);
      n.copy(p).sub(centre).normalize();
      n.y += 0.45; n.normalize(); // tilt up a little: light passing through leaves keeps undersides from going black
      nrm.push(n.x, n.y, n.z);
      uv.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// A rounded clump of leaf cards (rx, ry, rz radii) with a dark core so it doesn't look hollow.
export function leafClump(rx, ry, rz, cards, size, seed) {
  const rand = mulberry32(seed), quads = [];
  const axis = new THREE.Vector3(), q = new THREE.Quaternion(), c = new THREE.Vector3();
  for (let i = 0; i < cards; i++) {
    // points spread over the clump, mostly near its surface
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, r = 0.55 + 0.45 * Math.cbrt(rand());
    const s = Math.sqrt(1 - u * u);
    c.set(Math.cos(a) * s * rx * r, u * ry * r, Math.sin(a) * s * rz * r);
    axis.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    q.setFromAxisAngle(axis, rand() * Math.PI);
    const h = size * (0.8 + rand() * 0.4) / 2;
    quads.push([[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyQuaternion(q).add(c)));
  }
  const cardsGeo = cardGeometry(quads);
  const core = new THREE.IcosahedronGeometry(1, 1).scale(rx * 0.6, ry * 0.6, rz * 0.6);
  return mergeWithGroups(core, cardsGeo);
}
// One pine tier: drooping needle cards fanning out from the top, around a dark cone.
export function pineTier(radius, height, cards, seed) {
  const rand = mulberry32(seed), quads = [];
  for (let i = 0; i < cards; i++) {
    const a = (i / cards) * Math.PI * 2 + rand() * 0.3, w = radius * 0.55;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(w / 2);
    const top = new THREE.Vector3(0, height * (0.95 - rand() * 0.15), 0).addScaledVector(dir, 0.1);
    const tip = new THREE.Vector3(0, height * (0.05 + rand() * 0.1), 0).addScaledVector(dir, radius * (0.95 + rand() * 0.15));
    quads.push([top.clone().sub(side), top.clone().add(side), tip.clone().add(side), tip.clone().sub(side)].reverse());
    // a second, flatter layer of cards fills the gaps
    const a2 = a + Math.PI / cards, dir2 = new THREE.Vector3(Math.cos(a2), 0, Math.sin(a2)), side2 = new THREE.Vector3(-dir2.z, 0, dir2.x).multiplyScalar(w / 2);
    const top2 = new THREE.Vector3(0, height * 0.6, 0), tip2 = new THREE.Vector3(0, height * 0.12, 0).addScaledVector(dir2, radius * 0.85);
    quads.push([top2.clone().sub(side2), top2.clone().add(side2), tip2.clone().add(side2), tip2.clone().sub(side2)].reverse());
  }
  const cardsGeo = cardGeometry(quads, new THREE.Vector3(0, height * 0.2, 0));
  const core = new THREE.ConeGeometry(radius * 0.7, height * 0.85, 10, 1, true).translate(0, height * 0.45, 0);
  return mergeWithGroups(core, cardsGeo);
}
// Two geometries in one, as material groups 0 (core) and 1 (cards)
function mergeWithGroups(a, b) {
  a = a.index ? a.toNonIndexed() : a; b = b.index ? b.toNonIndexed() : b;
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const A = a.attributes[name].array, B = b.attributes[name].array, out = new Float32Array(A.length + B.length);
    out.set(A); out.set(B, A.length);
    g.setAttribute(name, new THREE.BufferAttribute(out, a.attributes[name].itemSize));
  }
  const na = a.attributes.position.count, nb = b.attributes.position.count;
  g.addGroup(0, na, 0); g.addGroup(na, nb, 1);
  g.computeBoundingSphere();
  return g;
}

// A lumpy boulder: a subdivided sphere pushed in and out by noise.
export function boulderGeometry(detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, v = new THREE.Vector3();
  const fbm = makeTileNoise(91);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const u = Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5, w = v.y * 0.5 + 0.5;
    const n = fbm(u, w, 3, 3) - 0.5;
    v.multiplyScalar(1 + n * 0.55);
    if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.4; // flatter underside
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Standard material that samples one ground-texture layer in world space (works with instancing).
export function triplanarMaterial(layer, params, strength = 1) {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, texUniforms);
    shader.uniforms.uTriScale = { value: 1 / TEX_LAYERS[layer].size };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 triP = vec4(transformed, 1.0);
        vec3 triN = objectNormal;
        #ifdef USE_INSTANCING
          triP = instanceMatrix * triP; triN = mat3(instanceMatrix) * triN;
        #endif
        vTriPos = (modelMatrix * triP).xyz;
        vTriN = normalize(mat3(modelMatrix) * triN);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${TEX_GLSL}
        uniform float uTriScale;
        varying vec3 vTriPos;
        varying vec3 vTriN;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 triWN = normalize(vTriN);
        vec3 triBW = pow(abs(triWN), vec3(4.0)); triBW /= triBW.x + triBW.y + triBW.z;
        vec4 triAlb = vec4(0.0); vec3 triNrm = vec3(0.0); float triAO = 0.0;
        triplanar(${layer}.0, uTriScale, vTriPos, dFdx(vTriPos), dFdy(vTriPos), triBW, triWN, 1.0, triAlb, triNrm, triAO);
        diffuseColor.rgb *= triAlb.rgb * (0.85 + 0.3 * vnoise(vTriPos * 0.7));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = triAlb.a;`)
      .replace('#include <normal_fragment_maps>', `
        normal = normalize((viewMatrix * vec4(normalize(triWN + triNrm * ${strength.toFixed(2)}), 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= triAO;`);
  };
  return mat;
}
// Bark: the texture wraps around the trunk using its UVs, repeated along its height.
export function barkMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, texUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBarkUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float trunkH = 1.0;
        #ifdef USE_INSTANCING
          trunkH = length(instanceMatrix[1].xyz);
        #endif
        vBarkUv = vec2(uv.x * 2.0, uv.y * trunkH * 0.7);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${TEX_GLSL}
        varying vec2 vBarkUv;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec4 bark = texture(tAlbedo, vec3(vBarkUv, ${LAYER.bark}.0));
        vec4 barkN = texture(tNormal, vec3(vBarkUv, ${LAYER.bark}.0));
        diffuseColor.rgb *= bark.rgb * 1.3;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = bark.a;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= barkN.z;
        reflectedLight.directDiffuse *= 0.75 + 0.25 * barkN.z;`);
  };
  return mat;
}
export const foliageMaterials = (needles, distant = false) => [
  // inner core, so clumps don't look hollow; lighter on the simpler distant trees, which have fewer cards
  new THREE.MeshStandardMaterial({ color: distant ? 0xb4bca4 : 0x7a8270, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ map: needles ? needleTexture() : leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }),
];

// ---------------------------------------------------------------------------
// Plants of the other biomes. All are drawn nearly white or grey and tinted per instance.
// ---------------------------------------------------------------------------
// Palm fronds: long drooping leaf cards fanning out from the top of the trunk.
export function frondGeometry(count = 9, length = 3.2) {
  const quads = [], rand = mulberry32(41);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.3, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    // two cards per frond: rising from the crown, then drooping towards the tip
    const p0 = new THREE.Vector3(0, 0, 0), p1 = dir.clone().multiplyScalar(length * 0.5).setY(0.45), p2 = dir.clone().multiplyScalar(length).setY(-0.7);
    for (const [a0, a1, w0, w1] of [[p0, p1, 0.25, 0.7], [p1, p2, 0.7, 0.2]]) {
      quads.push([a0.clone().addScaledVector(side, -w0), a0.clone().addScaledVector(side, w0), a1.clone().addScaledVector(side, w1), a1.clone().addScaledVector(side, -w1)]);
    }
  }
  return cardGeometry(quads, new THREE.Vector3(0, -1, 0));
}
// A saguaro-style cactus: a ribbed column with one or two arms (1 m tall before scaling).
export function cactusGeometry() {
  const parts = [], rib = (r, h) => new THREE.CylinderGeometry(r, r, h, 8, 1).translate(0, h / 2, 0);
  parts.push(rib(0.22, 1), new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1, 0));
  for (const [s, y, h] of [[1, 0.4, 0.35], [-1, 0.55, 0.28]]) {
    parts.push(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 6).rotateZ(Math.PI / 2).translate(s * 0.3, y, 0));
    parts.push(rib(0.13, h).translate(s * 0.44, y, 0), new THREE.SphereGeometry(0.13, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(s * 0.44, y + h, 0));
  }
  return mergeSimple(parts);
}
// Thin twigs sticking up out of the sand.
export function deadBushGeometry() {
  const parts = [], rand = mulberry32(7);
  for (let i = 0; i < 7; i++) {
    const g = new THREE.CylinderGeometry(0.012, 0.025, 0.55 + rand() * 0.3, 3).translate(0, 0.3, 0);
    g.rotateZ((rand() - 0.5) * 1.3).rotateY(rand() * Math.PI * 2);
    parts.push(g);
  }
  return mergeSimple(parts);
}
// Flowers: a few stems with a round head each. Returns [stems, heads] (instanced separately, so
// only the heads take the flower's colour).
export function flowerGeometries() {
  const stems = [], heads = [], rand = mulberry32(13);
  for (let i = 0; i < 4; i++) {
    const x = (rand() - 0.5) * 0.35, z = (rand() - 0.5) * 0.35, h = 0.25 + rand() * 0.15;
    stems.push(new THREE.CylinderGeometry(0.008, 0.012, h, 3).translate(x, h / 2, z));
    heads.push(new THREE.IcosahedronGeometry(0.05, 0).scale(1, 0.6, 1).translate(x, h, z));
  }
  return [mergeSimple(stems), mergeSimple(heads)];
}
// A mushroom: [pale stem, cap].
export function mushroomGeometries() {
  return [new THREE.CylinderGeometry(0.035, 0.045, 0.16, 6).translate(0, 0.08, 0),
    new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.15, 0)];
}
// Pumpkins and melons: a squashed ribbed ball.
export function gourdGeometry() {
  const g = new THREE.SphereGeometry(0.4, 14, 8), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), rib = 1 + Math.cos(a * 8) * 0.05;
    p.setXYZ(i, v.x * rib, v.y * 0.75 + 0.3, v.z * rib);
  }
  g.computeVertexNormals();
  return g;
}
// A clump of bamboo canes (1 m tall before scaling; scaled up tall).
export function bambooGeometry() {
  const parts = [], rand = mulberry32(21);
  for (let i = 0; i < 5; i++) {
    const x = (rand() - 0.5) * 0.6, z = (rand() - 0.5) * 0.6, h = 0.7 + rand() * 0.3;
    parts.push(new THREE.CylinderGeometry(0.035, 0.04, h, 5).translate(x, h / 2, z));
  }
  return mergeSimple(parts);
}
// Fallen petals: a flat scatter of little pink discs on the ground.
export function petalsGeometry() {
  const parts = [], rand = mulberry32(31);
  for (let i = 0; i < 26; i++) parts.push(new THREE.CircleGeometry(0.035 + rand() * 0.03, 5).rotateX(-Math.PI / 2).translate((rand() - 0.5) * 1.4, 0.02 + rand() * 0.01, (rand() - 0.5) * 1.4));
  return mergeSimple(parts);
}
function mergeSimple(list) {
  const out = { position: [], normal: [] };
  for (let g of list) { g = g.index ? g.toNonIndexed() : g; for (const k in out) out[k].push(...g.attributes[k].array); }
  const g = new THREE.BufferGeometry();
  for (const k in out) g.setAttribute(k, new THREE.Float32BufferAttribute(out[k], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((out.position.length / 3) * 2), 2));
  g.computeBoundingSphere();
  return g;
}
