import * as THREE from 'three';
import { QUALITY, WORLD } from '../config.js';
import { hash1, mulberry32, smoothstep } from '../noise.js';
import { LAYER } from '../terrain/textures.js';
import { barkMaterial, boulderGeometry, foliageMaterials, leafClump, pineTier, puffTexture, triplanarMaterial } from './plant-looks.js';
import { addObstacle, addTarget, terrainFns, whenLoaded, world } from './world.js';
import { groundAt } from './query.js';
import { lavaAt, volcanoRadius } from './volcano.js';
import { litMaterial } from '../render/scene.js';

export let clouds = null;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const vegStats = { trees: 0, bushes: 0, rocks: 0 };

// Vegetation is placed per square tile, once the terrain under the tile has been generated.
// Each tile has its own random sequence, so a tile looks the same whenever it's loaded.
export function placeVegetation(seed) {
  vegStats.trees = vegStats.bushes = vegStats.rocks = 0;
  // Shapes: a detailed version for close up and a cheap one for the distance (same instances)
  const low = QUALITY === 'low';
  const near = {
    trunk: new THREE.CylinderGeometry(0.13, 0.27, 1, 10, 1, true).translate(0, 0.5, 0),
    pine: pineTier(1.45, 2.7, low ? 9 : 14, 1),
    crown: leafClump(1.6, 1.35, 1.6, low ? 22 : 40, 1.5, 2),
    birch: leafClump(1.15, 1.2, 1.15, low ? 16 : 28, 1.1, 3),
    bush: leafClump(0.95, 0.75, 0.95, low ? 10 : 18, 0.9, 4),
    rock: boulderGeometry(2),
  };
  const far = {
    trunk: new THREE.CylinderGeometry(0.13, 0.27, 1, 5, 1, true).translate(0, 0.5, 0),
    pine: pineTier(1.45, 2.7, 6, 1),
    crown: leafClump(1.6, 1.35, 1.6, 10, 1.9, 2),
    birch: leafClump(1.15, 1.2, 1.15, 8, 1.4, 3),
    bush: leafClump(0.95, 0.75, 0.95, 5, 1.1, 4),
    rock: boulderGeometry(1),
    ore: new THREE.DodecahedronGeometry(0.2, 0),
  };
  const mats = {
    trunk: barkMaterial(), pine: foliageMaterials(true), crown: foliageMaterials(false), birch: foliageMaterials(false),
    bush: foliageMaterials(false), rock: triplanarMaterial(LAYER.rock, { color: 0xb4aea6 }, 1.3),
    // orange, slightly metallic nuggets sticking out of iron-rich boulders
    ore: litMaterial(new THREE.MeshStandardMaterial({ color: 0xe0782e, roughness: 0.35, metalness: 0.45, emissive: 0x3a1204, flatShading: true })),
  };
  const farMats = { pine: foliageMaterials(true, true), crown: foliageMaterials(false, true), birch: foliageMaterials(false, true), bush: foliageMaterials(false, true) };

  const kit = { near, far, mats, farMats };

  const n = Math.ceil(WORLD.size / VEG_TILE);
  for (let tj = 0; tj < n; tj++) for (let ti = 0; ti < n; ti++) {
    let x0 = ti * VEG_TILE, x1 = Math.min(WORLD.size, x0 + VEG_TILE), z0 = tj * VEG_TILE, z1 = Math.min(WORLD.size, z0 + VEG_TILE);
    // near a volcano, wait for all of it: its lava flows decide where plants can't grow
    for (const v of terrainFns.volcanoes) {
      const r = volcanoRadius(v);
      if (v.x + r < x0 || v.x - r > x1 || v.z + r < z0 || v.z - r > z1) continue;
      x0 = Math.min(x0, v.x - r); x1 = Math.max(x1, v.x + r); z0 = Math.min(z0, v.z - r); z1 = Math.max(z1, v.z + r);
    }
    whenLoaded(x0, x1, z0, z1, () => placeVegTile(seed, ti, tj, kit));
  }
  return vegStats;
}

function placeVegTile(seed, ti, tj, kit) {
  const rand = mulberry32((seed * 13 + 5) ^ (ti * 7919 + tj * 104729));
  const T = terrainFns, L = T.ledge, W = WORLD.waterLevel;
  const trees = [], bushes = [], rocks = [];
  const step = WORLD.treeSpacing;
  const tx0 = ti * VEG_TILE, tz0 = tj * VEG_TILE, tx1 = tx0 + VEG_TILE - 0.01, tz1 = tz0 + VEG_TILE - 0.01;
  const end = WORLD.size - step;
  for (let gz = Math.max(1, Math.ceil(tz0 / step)) * step; gz < Math.min(tz1, end); gz += step) {
    for (let gx = Math.max(1, Math.ceil(tx0 / step)) * step; gx < Math.min(tx1, end); gx += step) {
      const x = clamp(gx + (rand() - 0.5) * step * 0.9, tx0, tx1), z = clamp(gz + (rand() - 0.5) * step * 0.9, tz0, tz1);
      const fm = T.forestMask(x, z), vi = T.volcanoInfluence(x, z);
      const r = rand();
      const wantTree = r < 0.05 + fm * 0.85;
      const wantBush = !wantTree && r < 0.08 + fm * 0.12;
      const wantRock = !wantTree && !wantBush && r > 0.992 - vi * 0.02;
      if (!wantTree && !wantBush && !wantRock) continue;
      if (Math.hypot(x - L.x, z - L.z) < L.r + 3) continue; // keep the cave mouth clear
      const hit = groundAt(x, z);
      if (!hit) continue;
      const y = hit.point.y, ny = hit.face.normal.y;
      if (Math.abs(y - T.surfaceHeight(x, z)) > 4) continue; // not on cave floors
      const wl = T.waterAt(x, z);
      if (wantRock) { if (y > wl + 0.5 && ny > 0.6) rocks.push({ x, y, z, s: 0.6 + rand() * 1.4, rot: rand() * 6.28, iron: rand() < 0.14 }); continue; }
      if (ny < 0.72 || y < wl + (wl > W ? 1.0 : 1.8) || y > 76 || vi > 0.35) continue;
      if (vi > 0.2 && lavaAt(x, y, z, 1.5)) continue;
      const scale = 0.75 + rand() * 0.7;
      if (wantBush) { bushes.push({ x, y, z, s: 0.5 + rand() * 0.6 }); continue; }
      // pines dominate up high, mixed forest lower down
      const pineChance = smoothstep(35, 60, y) * 0.8 + 0.25 + T.noise2(x * 0.02, z * 0.02) * 0.3;
      const kind = rand() < pineChance ? 0 : rand() < 0.75 ? 1 : 2; // 0 pine, 1 oak, 2 birch
      trees.push({ x, y, z, scale, kind, rot: rand() * 6.28, tint: rand() });
    }
  }
  vegStats.trees += trees.length; vegStats.bushes += bushes.length; vegStats.rocks += rocks.length;
  if (trees.length || bushes.length || rocks.length) buildVegTile({ trees, bushes, rocks, i: ti, j: tj }, kit.near, kit.far, kit.mats, kit.farMats);
}

export const VEG_TILE = 96;        // metres per vegetation tile
export const vegTiles = [];        // { near: Group, far: Group, cx, cz }
function buildVegTile({ trees, bushes, rocks, i: ti, j: tj }, nearGeo, farGeo, mats, farMats) {
  const nPine = trees.filter((t) => t.kind === 0).length;
  const nOak = trees.filter((t) => t.kind === 1).length;
  const nBirch = trees.length - nPine - nOak;
  const make = (key, count) => new THREE.InstancedMesh(nearGeo[key], mats[key], Math.max(1, count));
  const trunks = make('trunk', trees.length), pines = make('pine', nPine * 3), crowns = make('crown', nOak * 2);
  const birches = make('birch', nBirch * 2), bushMesh = make('bush', bushes.length), rockMesh = make('rock', rocks.length);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  let pi = 0, ci = 0, bi = 0;
  trees.forEach((t, i) => {
    const partsOf = [];
    q.setFromAxisAngle(up, t.rot);
    const trunkH = (t.kind === 0 ? 2.2 : t.kind === 1 ? 2.8 : 4.0) * t.scale;
    m.compose(p.set(t.x, t.y - 0.4, t.z), q, s.set(t.scale, trunkH + 0.4, t.scale));
    trunks.setMatrixAt(i, m);
    trunks.setColorAt(i, col.set(t.kind === 2 ? 0xffffff : 0xd8c8b8));
    if (t.kind === 0) {
      for (let l = 0; l < 3; l++) {
        const ls = t.scale * (1 - l * 0.24);
        m.compose(p.set(t.x, t.y + trunkH * 0.45 + l * 1.25 * t.scale, t.z), q, s.set(ls, ls, ls));
        partsOf.push([pines, pi]);
        pines.setMatrixAt(pi, m);
        pines.setColorAt(pi++, col.setHSL(0.36 + t.tint * 0.04, 0.45, 0.22 + t.tint * 0.06));
      }
    } else if (t.kind === 1) {
      m.compose(p.set(t.x, t.y + trunkH + 0.7 * t.scale, t.z), q, s.set(t.scale, t.scale * 0.85, t.scale));
      partsOf.push([crowns, ci]);
      crowns.setMatrixAt(ci, m);
      crowns.setColorAt(ci++, col.setHSL(0.26 + t.tint * 0.06, 0.5, 0.3 + t.tint * 0.08));
      m.compose(p.set(t.x + 0.6 * t.scale, t.y + trunkH + 0.1, t.z + 0.3 * t.scale), q, s.set(t.scale * 0.65, t.scale * 0.6, t.scale * 0.65));
      partsOf.push([crowns, ci]);
      crowns.setMatrixAt(ci, m);
      crowns.setColorAt(ci++, col.setHSL(0.27 + t.tint * 0.05, 0.5, 0.27 + t.tint * 0.08));
    } else {
      for (let l = 0; l < 2; l++) {
        m.compose(p.set(t.x, t.y + trunkH * (0.7 + l * 0.3), t.z), q, s.set(t.scale * (0.9 - l * 0.25), t.scale * (1.3 - l * 0.3), t.scale * (0.9 - l * 0.25)));
        partsOf.push([birches, bi]);
        birches.setMatrixAt(bi, m);
        birches.setColorAt(bi++, col.setHSL(0.2 + t.tint * 0.05, 0.55, 0.42 + t.tint * 0.06));
      }
    }
    const ob = { type: 'cyl', x: t.x, z: t.z, y0: t.y - 0.5, y1: t.y + trunkH + 3, r: 0.27 * t.scale };
    addObstacle(ob);
    const crownY = t.y + trunkH + (t.kind === 0 ? 0.3 : 0.6) * t.scale;
    addTarget({
      kind: 'tree', species: ['pine', 'oak', 'birch'][t.kind], x: t.x, y: t.y, z: t.z, scale: t.scale, obstacle: ob,
      parts: [[trunks, i], ...partsOf], spheres: [[t.x, t.y + 0.6, t.z, 0.5], [t.x, t.y + trunkH * 0.5, t.z, 0.5], [t.x, crownY, t.z, 1.4 * t.scale]],
    });
  });
  bushes.forEach((b, i) => {
    m.compose(p.set(b.x, b.y + 0.3 * b.s, b.z), q.setFromAxisAngle(up, b.x), s.set(b.s * 1.2, b.s * 0.8, b.s * 1.2));
    bushMesh.setMatrixAt(i, m);
    bushMesh.setColorAt(i, col.setHSL(0.27 + hash1(b.x + b.z) * 0.06, 0.45, 0.25 + hash1(b.x * 3 + 7) * 0.08));
    addTarget({ kind: 'bush', x: b.x, y: b.y, z: b.z, parts: [[bushMesh, i]], spheres: [[b.x, b.y + 0.3 * b.s, b.z, 0.95 * b.s]] });
  });
  const oreMesh = make('ore', rocks.filter((r) => r.iron).length * 7);
  const rockPos = nearGeo.rock.attributes.position, rm = new THREE.Matrix4(), v = new THREE.Vector3();
  let oi = 0;
  rocks.forEach((r, i) => {
    if (r.iron) rockMesh.setColorAt(i, col.setHSL(0.04, 0.5, 0.4 + hash1(r.x * 3.1 + r.z) * 0.08)); // rusty: iron inside
    else rockMesh.setColorAt(i, col.setHSL(0.08, 0.06, 0.62 + hash1(r.x * 3.1 + r.z) * 0.2));
    q.setFromEuler(new THREE.Euler(r.rot, r.rot * 2, 0));
    rm.compose(p.set(r.x, r.y + r.s * 0.3, r.z), q, s.set(r.s * 1.2, r.s, r.s));
    rockMesh.setMatrixAt(i, rm);
    const ores = [];
    for (let k = 0; r.iron && k < 7; k++) {
      // orange nuggets sitting on the boulder's surface: at one of its vertices, in its upper part
      let vi = 0;
      for (let tries = 0; tries < 12; tries++) {
        vi = Math.floor(hash1(r.x * 1.3 + k * 7.7 + r.z + tries * 3.1) * rockPos.count);
        if (v.fromBufferAttribute(rockPos, vi).applyMatrix4(rm).y > r.y + r.s * 0.2) break;
      }
      m.compose(v, q.setFromEuler(new THREE.Euler(k * 1.7, r.x + k, k * 0.9)), s.setScalar(r.s * (0.6 + hash1(k + r.x) * 0.6)));
      oreMesh.setMatrixAt(oi, m); ores.push([oreMesh, oi++]);
    }
    const ob = { type: 'sphere', x: r.x, y: r.y + r.s * 0.3, z: r.z, r: r.s * 0.95 };
    addObstacle(ob);
    addTarget({ kind: 'rock', x: r.x, y: r.y, z: r.z, s: r.s, iron: r.iron, obstacle: ob, parts: [[rockMesh, i], ...ores], spheres: [[r.x, r.y + r.s * 0.3, r.z, r.s * 1.05]] });
  });
  pines.count = pi; crowns.count = ci; birches.count = bi;
  trunks.count = trees.length; bushMesh.count = bushes.length; rockMesh.count = rocks.length;

  const nearGroup = new THREE.Group(), farGroup = new THREE.Group();
  for (const [key, im] of [['trunk', trunks], ['pine', pines], ['crown', crowns], ['birch', birches], ['bush', bushMesh], ['rock', rockMesh]]) {
    if (!im.count) continue;
    im.castShadow = true; im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    nearGroup.add(im);
    // the distant version shares the instance data, so chopping a tree hides it in both
    const lo = new THREE.InstancedMesh(farGeo[key], farMats[key] || mats[key], im.count);
    lo.instanceMatrix = im.instanceMatrix; lo.instanceColor = im.instanceColor;
    lo.count = im.count; lo.boundingSphere = im.boundingSphere;
    lo.castShadow = false; lo.receiveShadow = true; // distant trees: only the far shadow cascade would see them
    farGroup.add(lo);
  }
  if (oi) { oreMesh.count = oi; oreMesh.castShadow = true; oreMesh.instanceMatrix.needsUpdate = true; oreMesh.computeBoundingSphere(); nearGroup.add(oreMesh); }
  farGroup.visible = false;
  world.add(nearGroup, farGroup);
  vegTiles.push({ near: nearGroup, far: farGroup, cx: (ti + 0.5) * VEG_TILE, cz: (tj + 0.5) * VEG_TILE });
}

export const cloudMats = { top: null, under: null };
export function addClouds(seed) {
  const rand = mulberry32(seed * 31 + 9);
  clouds = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: puffTexture(), color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  const shade = new THREE.SpriteMaterial({ map: puffTexture(), color: 0xc4ccd6, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  cloudMats.top = mat; cloudMats.under = shade;
  const n = Math.min(160, Math.round(22 * (WORLD.size / 256) ** 2));
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    const parts = 6 + Math.floor(rand() * 8), len = 14 + rand() * 22;
    for (let j = 0; j < parts; j++) {
      // a greyer layer underneath, bright puffs on top
      const under = j < parts * 0.35;
      const s = new THREE.Sprite(under ? shade : mat);
      const size = 14 + rand() * 16;
      s.position.set((rand() - 0.5) * len, under ? -2 + rand() * 2 : rand() * 5, (rand() - 0.5) * len * 0.6);
      s.scale.set(size, size * 0.65, 1);
      c.add(s);
    }
    c.position.set(rand() * WORLD.size * 1.6 - WORLD.size * 0.3, WORLD.height + 30 + rand() * 30, rand() * WORLD.size * 1.6 - WORLD.size * 0.3);
    clouds.add(c);
  }
  world.add(clouds);
}
