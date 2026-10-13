import * as THREE from 'three';
import { QUALITY, WORLD } from '../config.js';
import { hash1, mulberry32, smoothstep } from '../noise.js';
import { LAYER } from '../terrain/textures.js';
import { bambooGeometry, barkMaterial, grainGeometry, boulderGeometry, cactusGeometry, deadBushGeometry, flowerGeometries, foliageMaterials, frondGeometry, gourdGeometry,
  leafClump, mushroomGeometries, petalsGeometry, pineTier, puffTexture, triplanarMaterial } from './plant-looks.js';
import { addObstacle, addTarget, terrainFns, whenLoaded, world } from './world.js';
import { groundAt } from './query.js';
import { lavaAt, volcanoRadius } from './volcano.js';
import { litMaterial } from '../render/scene.js';
import { BIOMES, BIOME_IDS } from '../terrain/biomes.js';
import { sealBlocks } from './blocks.js';
import { buildIceSpike } from './ice-spikes.js';

export let clouds = null;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const vegStats = { trees: 0, bushes: 0, rocks: 0, plants: 0, spikes: 0, spikeBlocks: 0 };

// Tree kinds. `wood` names the logs and planks they give (see inventory/items.js), `fruit` what
// sometimes drops when you chop one down. The shapes are built in treeParts below.
export const TREE_KINDS = {
  oak:      { name: 'Oak tree', wood: 'oak', fruit: ['apple', 0.5] },
  birch:    { name: 'Birch tree', wood: 'birch' },
  pine:     { name: 'Spruce tree', wood: 'spruce', fruit: ['pinecone', 0.4] },
  dark_oak: { name: 'Dark oak tree', wood: 'dark_oak', big: true, fruit: ['apple', 0.3] },
  maple:    { name: 'Maple tree', wood: 'maple', fruit: ['maple_sap', 0.4] },
  cherry:   { name: 'Cherry tree', wood: 'cherry', fruit: ['cherries', 0.7] },
  redwood:  { name: 'Redwood tree', wood: 'redwood', big: true, fruit: ['pinecone', 0.5] },
  jungle:   { name: 'Jungle tree', wood: 'jungle', big: true, fruit: ['cocoa_beans', 0.6] },
  acacia:   { name: 'Acacia tree', wood: 'acacia' },
  palm:     { name: 'Palm tree', wood: 'palm', fruit: ['coconut', 0.7] },
};
// Small plants: what breaking one gives ([item, min, max] each).
export const PLANT_KINDS = {
  bush:       { name: 'Berry bush', drops: [['berries', 0, 3], ['stick', 1, 1]] },
  cactus:     { name: 'Cactus', drops: [['cactus', 1, 2], ['cactus_fruit', 0, 1]] },
  dead_bush:  { name: 'Dead bush', drops: [['stick', 1, 2]] },
  flowers:    { name: 'Flowers', drops: [] },   // the kind of flower is decided per plant
  ferns:      { name: 'Ferns', drops: [['plant_fibre', 1, 2]] },
  mushrooms:  { name: 'Mushrooms', drops: [] },
  pumpkins:   { name: 'Pumpkin', drops: [['pumpkin', 1, 1]] },
  melons:     { name: 'Melon', drops: [['melon_slice', 3, 5]] },
  bamboo:     { name: 'Bamboo', drops: [['bamboo', 2, 4]] },
  petals:     { name: 'Pink petals', drops: [['pink_petals', 1, 2]] },
  wild_grain: { name: 'Wild grain', drops: [['wild_grain', 2, 4]] },
};
// [item id, colour, name]: the game's own flowers
export const FLOWERS = [
  ['dandelion', 0xf2d23a, 'Goldenbell'], ['poppy', 0xd8352a, 'Emberbloom'], ['cornflower', 0x4a6ee0, 'Skyblossom'], ['allium', 0xa45ad8, 'Violet globe'],
  ['pink_tulip', 0xf09ac0, 'Blush cup'], ['orange_tulip', 0xf08a2a, 'Sunset cup'], ['lily_of_the_valley', 0xf4f4ee, 'Snowbell'], ['oxeye_daisy', 0xe8e6da, 'Moonpetal'],
];

// Vegetation is placed per square tile, once the terrain under the tile has been generated.
// Each tile has its own random sequence, so a tile looks the same whenever it's loaded.
export function placeVegetation(seed) {
  vegStats.trees = vegStats.bushes = vegStats.rocks = vegStats.plants = vegStats.spikes = vegStats.spikeBlocks = 0;
  const low = QUALITY === 'low';
  const [stemGeo, bloomGeo] = flowerGeometries(), [mStemGeo, capGeo] = mushroomGeometries();
  // Shapes: a detailed version for close up and a cheap one for the distance (same instances).
  // Small plants have no distant version: they're hidden with the near group.
  const near = {
    trunk: new THREE.CylinderGeometry(0.13, 0.27, 1, 10, 1, true).translate(0, 0.5, 0),
    pine: pineTier(1.45, 2.7, low ? 9 : 14, 1),
    crown: leafClump(1.6, 1.35, 1.6, low ? 22 : 40, 1.5, 2),
    birch: leafClump(1.15, 1.2, 1.15, low ? 16 : 28, 1.1, 3),
    frond: frondGeometry(low ? 7 : 10),
    bush: leafClump(0.95, 0.75, 0.95, low ? 10 : 18, 0.9, 4),
    rock: boulderGeometry(2), ore: new THREE.DodecahedronGeometry(0.2, 0),
    cactus: cactusGeometry(), dead_bush: deadBushGeometry(), stem: stemGeo, bloom: bloomGeo, mstem: mStemGeo, cap: capGeo,
    fern: pineTier(0.55, 0.45, low ? 6 : 9, 9), gourd: gourdGeometry(), bamboo: bambooGeometry(), petals: petalsGeometry(),
    grain: grainGeometry(),
  };
  const far = {
    trunk: new THREE.CylinderGeometry(0.13, 0.27, 1, 5, 1, true).translate(0, 0.5, 0),
    pine: pineTier(1.45, 2.7, 6, 1),
    crown: leafClump(1.6, 1.35, 1.6, 10, 1.9, 2),
    birch: leafClump(1.15, 1.2, 1.15, 8, 1.4, 3),
    frond: frondGeometry(5),
    bush: leafClump(0.95, 0.75, 0.95, 5, 1.1, 4),
    rock: boulderGeometry(1),
  };
  const plain = (params) => litMaterial(new THREE.MeshStandardMaterial({ roughness: 0.8, ...params }));
  const mats = {
    trunk: barkMaterial(), pine: foliageMaterials(true), crown: foliageMaterials(false), birch: foliageMaterials(false),
    frond: foliageMaterials(false)[1], bush: foliageMaterials(false), rock: triplanarMaterial(LAYER.rock, { color: 0xb4aea6 }, 1.3),
    // orange, slightly metallic nuggets sticking out of iron-rich boulders
    ore: litMaterial(new THREE.MeshStandardMaterial({ color: 0xe0782e, roughness: 0.35, metalness: 0.45, emissive: 0x3a1204, flatShading: true })),
    cactus: plain({ roughness: 0.6 }), dead_bush: plain({ roughness: 0.9 }), stem: plain({ color: 0x4f8a34 }), bloom: plain({ roughness: 0.6 }),
    mstem: plain({ color: 0xe8e0d0 }), cap: plain({ roughness: 0.6 }), fern: foliageMaterials(true), gourd: plain({ roughness: 0.55 }),
    bamboo: plain({ roughness: 0.45 }), petals: plain({ side: THREE.DoubleSide }), grain: plain({ roughness: 0.75 }),
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

// Picks a key of `weights` ({ key: weight }) at random.
function pick(weights, r) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let x = r * total;
  for (const k in weights) if ((x -= weights[k]) <= 0) return k;
  return Object.keys(weights)[0];
}

function placeVegTile(seed, ti, tj, kit) {
  const rand = mulberry32((seed * 13 + 5) ^ (ti * 7919 + tj * 104729));
  const T = terrainFns, L = T.ledge, W = WORLD.waterLevel;
  const trees = [], plants = [], rocks = [], spikes = [];
  const step = WORLD.treeSpacing;
  const tx0 = ti * VEG_TILE, tz0 = tj * VEG_TILE, tx1 = tx0 + VEG_TILE - 0.01, tz1 = tz0 + VEG_TILE - 0.01;
  const end = WORLD.size - step;
  for (let gz = Math.max(1, Math.ceil(tz0 / step)) * step; gz < Math.min(tz1, end); gz += step) {
    for (let gx = Math.max(1, Math.ceil(tx0 / step)) * step; gx < Math.min(tx1, end); gx += step) {
      const x = clamp(gx + (rand() - 0.5) * step * 0.9, tx0, tx1), z = clamp(gz + (rand() - 0.5) * step * 0.9, tz0, tz1);
      const fm = T.forestMask(x, z), vi = T.volcanoInfluence(x, z);
      // the biome here: where two meet, either one, more often the nearer
      const w = T.biomeWeights(x, z), rb = rand();
      let bi = 0;
      for (let acc = w[0]; acc < rb && bi < w.length - 1;) acc += w[++bi];
      const biome = BIOMES[BIOME_IDS[bi]];
      const r = rand();
      const wantTree = !!biome.trees.mix && r < fm * 0.9 + (biome.trees.density ? 0.015 : 0);
      let plant = null;
      if (!wantTree) {
        let rp = rand();
        const chances = { bush: fm * 0.08, ...biome.plants };
        for (const k in chances) { if (rp < chances[k]) { plant = k; break; } rp -= chances[k]; }
      }
      const wantRock = !wantTree && !plant && r > 0.992 - vi * 0.02;
      if (!wantTree && !plant && !wantRock) continue;
      if (Math.hypot(x - L.x, z - L.z) < L.r + 3) continue; // keep the cave mouth clear
      const hit = groundAt(x, z);
      if (!hit) continue;
      const y = hit.point.y, ny = hit.face.normal.y;
      if (Math.abs(y - T.surfaceHeight(x, z)) > 4) continue; // not on cave floors
      const wl = T.baseWaterAt(x, z);
      if (wantRock) { if (y > wl + 0.5 && ny > 0.6) rocks.push({ x, y, z, s: 0.6 + rand() * 1.4, rot: rand() * 6.28, iron: rand() < 0.14 }); continue; }
      if (ny < 0.72 || y < wl + (wl > W ? 1.0 : 1.8) || y > WORLD.lift + 76 || vi > 0.35) continue;
      if (vi > 0.2 && lavaAt(x, y, z, 1.5)) continue;
      if (plant === 'ice_spikes') { spikes.push({ x, y, z, rot: rand() * 6.28, tint: rand() }); continue; }
      if (plant) { plants.push({ kind: plant, x, y, z, s: 0.5 + rand() * 0.6, rot: rand() * 6.28, tint: rand() }); continue; }
      // pines take over up high
      let kind = pick(biome.trees.mix, rand());
      if (rand() < smoothstep(WORLD.lift + 45, WORLD.lift + 68, y) * 0.8 && kind !== 'palm' && kind !== 'acacia') kind = 'pine';
      trees.push({ x, y, z, scale: 0.75 + rand() * 0.7, kind, rot: rand() * 6.28, tint: rand(), snowy: !!biome.trees.snowy });
    }
  }
  vegStats.trees += trees.length; vegStats.plants += plants.length; vegStats.rocks += rocks.length;
  vegStats.bushes += plants.filter((p) => p.kind === 'bush').length;
  // ice spikes are made of blocks (see ice-spikes.js)
  if (spikes.length) {
    const tag = `veg${ti}_${tj}`;
    for (const p of spikes) vegStats.spikeBlocks += buildIceSpike(p, T.surfaceHeight, tag);
    vegStats.spikes += spikes.length;
    sealBlocks(tag, (ti + 0.5) * VEG_TILE, (tj + 0.5) * VEG_TILE);
  }
  if (trees.length || plants.length || rocks.length) buildVegTile({ trees, plants, rocks, i: ti, j: tj }, kit);
}

export const VEG_TILE = 96;        // metres per vegetation tile
export const vegTiles = [];        // { near: Group, far: Group, cx, cz }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler(), _top = new THREE.Vector3();
// The parts of one tree: add(part, position, quaternion, scale, colour) for each. Returns where the
// crown is (for aiming at it) and how tall the trunk is.
function treeParts(t, add) {
  const s = t.scale, k = t.kind, tint = t.tint;
  _q.setFromAxisAngle(UP, t.rot);
  const trunk = (h, r, color, tilt = 0) => {
    // a trunk from the ground up, leaning `tilt` radians; returns its top
    _q2.setFromEuler(_e.set(0, 0, tilt)).premultiply(_q);
    add('trunk', _p.set(t.x, t.y - 0.4, t.z), _q2, _s.set(r, h + 0.4, r), _c.set(color));
    return _top.set(0, h + 0.4, 0).applyQuaternion(_q2).add(_p).clone();
  };
  const clump = (part, x, y, z, sx, sy, sz, color) => add(part, _p.set(x, y, z), _q, _s.set(sx, sy, sz), color);
  const hsl = (h, sa, l) => _c.setHSL(h, sa, l);
  switch (k) {
    case 'pine': case 'redwood': {
      const big = k === 'redwood', h = (big ? 11 + tint * 5 : 2.2) * s, r = big ? s * 2.4 : s;
      trunk(h, r, big ? 0xe8a080 : 0xd8c8b8);
      const tiers = big ? 4 : 3;
      for (let l = 0; l < tiers; l++) {
        const ls = s * (big ? 1.05 - l * 0.18 : 1 - l * 0.24);
        const ly = big ? t.y + h * 0.62 + l * 1.5 * s : t.y + h * 0.45 + l * 1.25 * s;
        add('pine', _p.set(t.x, ly, t.z), _q, _s.set(ls, ls, ls), t.snowy ? hsl(0.55, 0.12, 0.78 + tint * 0.1) : big ? hsl(0.34 + tint * 0.03, 0.4, 0.18 + tint * 0.05) : hsl(0.36 + tint * 0.04, 0.45, 0.22 + tint * 0.06));
      }
      return { trunkH: h, crownY: t.y + h + 0.3 * s, r: 0.27 * r };
    }
    case 'birch': {
      const h = 4 * s;
      trunk(h, s, 0xffffff);
      for (let l = 0; l < 2; l++) clump('birch', t.x, t.y + h * (0.7 + l * 0.3), t.z, s * (0.9 - l * 0.25), s * (1.3 - l * 0.3), s * (0.9 - l * 0.25), hsl(0.2 + tint * 0.05, 0.55, 0.42 + tint * 0.06));
      return { trunkH: h, crownY: t.y + h + 0.6 * s, r: 0.27 * s };
    }
    case 'jungle': {
      const h = (7 + tint * 3) * s;
      trunk(h, s * 1.5, 0xc0b090);
      clump('crown', t.x, t.y + h + 0.6 * s, t.z, s * 1.7, s * 1.0, s * 1.7, hsl(0.3 + tint * 0.03, 0.6, 0.22 + tint * 0.05));
      for (const a of [0.5, 2.6, 4.4]) clump('crown', t.x + Math.cos(a + t.rot) * 1.4 * s, t.y + h * (0.55 + a * 0.05), t.z + Math.sin(a + t.rot) * 1.4 * s, s * 0.8, s * 0.6, s * 0.8, hsl(0.31, 0.6, 0.24 + tint * 0.05));
      return { trunkH: h, crownY: t.y + h + 0.6 * s, r: 0.27 * s * 1.5 };
    }
    case 'acacia': {
      const h = 3.6 * s, top = trunk(h, s * 0.9, 0xc8a890, 0.35 * (tint < 0.5 ? 1 : -1));
      clump('crown', top.x, top.y + 0.2 * s, top.z, s * 2.1, s * 0.42, s * 2.1, hsl(0.22 + tint * 0.03, 0.45, 0.3 + tint * 0.05));
      clump('crown', t.x - (top.x - t.x) * 0.6, t.y + h * 0.75, t.z - (top.z - t.z) * 0.6, s * 1.2, s * 0.32, s * 1.2, hsl(0.23, 0.45, 0.32));
      return { trunkH: h, crownY: top.y, r: 0.25 * s };
    }
    case 'palm': {
      const h = (5 + tint * 2) * s, top = trunk(h, s * 0.65, 0xd8c09a, 0.22 * (tint < 0.5 ? 1 : -1));
      add('frond', _p.copy(top), _q, _s.set(s, s, s), hsl(0.27 + tint * 0.03, 0.55, 0.36));
      return { trunkH: h, crownY: top.y, r: 0.2 * s };
    }
    default: {
      // oak-like: oak, dark oak, maple and cherry
      const big = k === 'dark_oak', h = (big ? 3.3 : k === 'cherry' ? 2.4 : 2.8) * s, r = big ? s * 2 : s;
      trunk(h, r, k === 'cherry' ? 0x9a7070 : big ? 0x907860 : 0xd8c8b8);
      const leaf = () => k === 'maple' ? [hsl(0.02, 0.75, 0.42), hsl(0.07, 0.8, 0.47), hsl(0.11, 0.8, 0.5)][Math.floor(tint * 2.99)]
        : k === 'cherry' ? hsl(0.93 + tint * 0.03, 0.55, 0.78 + tint * 0.06) : big ? hsl(0.3, 0.45, 0.17 + tint * 0.04) : hsl(0.26 + tint * 0.06, 0.5, 0.3 + tint * 0.08);
      const wide = big ? 1.45 : k === 'cherry' ? 1.25 : 1;
      clump('crown', t.x, t.y + h + 0.7 * s, t.z, s * wide, s * 0.85, s * wide, leaf());
      clump('crown', t.x + 0.6 * s * wide, t.y + h + 0.1, t.z + 0.3 * s * wide, s * 0.65 * wide, s * 0.6, s * 0.65 * wide, leaf());
      if (big || k === 'cherry') clump('crown', t.x - 0.7 * s * wide, t.y + h + 0.3, t.z - 0.4 * s * wide, s * 0.7 * wide, s * 0.6, s * 0.7 * wide, leaf());
      return { trunkH: h, crownY: t.y + h + 0.6 * s, r: 0.27 * r };
    }
  }
}

// The parts of one small plant.
function plantParts(p, add) {
  const s = p.s;
  _q.setFromAxisAngle(UP, p.rot);
  const one = (part, sx, sy, sz, color, dy = 0) => add(part, _p.set(p.x, p.y + dy, p.z), _q, _s.set(sx, sy, sz), color);
  switch (p.kind) {
    case 'bush':
      one('bush', s * 1.2, s * 0.8, s * 1.2, _c.setHSL(0.27 + hash1(p.x + p.z) * 0.06, 0.45, 0.25 + hash1(p.x * 3 + 7) * 0.08), 0.3 * s);
      return [p.y + 0.3 * s, 0.95 * s];
    case 'cactus': { const h = 1.6 + p.tint * 1.6; one('cactus', 1, h, 1, _c.setHSL(0.3, 0.45, 0.32 + p.tint * 0.06), -0.1); return [p.y + h * 0.5, 0.45 + h * 0.15]; }
    case 'dead_bush': one('dead_bush', s * 1.4, s * 1.2, s * 1.4, _c.set(0x8a6a44)); return [p.y + 0.3, 0.45];
    case 'flowers': {
      p.flower = FLOWERS[Math.floor(p.tint * FLOWERS.length)];
      one('stem', s * 1.6, s * 1.6, s * 1.6, _c.set(0xffffff)); one('bloom', s * 1.6, s * 1.6, s * 1.6, _c.set(p.flower[1]));
      return [p.y + 0.25, 0.45];
    }
    case 'mushrooms': {
      p.red = p.tint < 0.4;
      for (let i = 0; i < 3; i++) {
        const a = p.rot + i * 2.1, d = i ? 0.25 : 0, ms = s * (1.4 - i * 0.3);
        add('mstem', _p.set(p.x + Math.cos(a) * d, p.y, p.z + Math.sin(a) * d), _q, _s.set(ms, ms, ms), _c.set(0xffffff));
        add('cap', _p, _q, _s, _c.set(p.red ? 0xc8322a : 0x9a7050));
      }
      return [p.y + 0.15, 0.4];
    }
    case 'ferns': one('fern', s * 1.6, s * 1.4, s * 1.6, _c.setHSL(0.3, 0.5, 0.28 + p.tint * 0.08)); return [p.y + 0.3, 0.6];
    case 'pumpkins': case 'melons':
      one('gourd', 1 + s * 0.4, 1 + s * 0.3, 1 + s * 0.4, p.kind === 'pumpkins' ? _c.set(0xe08a24) : _c.set(0x5a9a3a));
      return [p.y + 0.35, 0.55];
    case 'bamboo': { const h = 3 + p.tint * 4; one('bamboo', 1.4, h, 1.4, _c.setHSL(0.24, 0.5, 0.42 + p.tint * 0.1)); return [p.y + 1, 0.6]; }
    case 'wild_grain': one('grain', 1 + s * 0.3, 0.8 + s * 0.5, 1 + s * 0.3, _c.setHSL(0.11 + p.tint * 0.03, 0.62, 0.36 + p.tint * 0.08)); return [p.y + 0.4, 0.5];
    case 'petals': one('petals', 1, 1, 1, _c.setHSL(0.93, 0.6, 0.8 + p.tint * 0.08)); return [p.y + 0.1, 0.8];
  }
  return [p.y, 0.5];
}

function buildVegTile({ trees, plants, rocks, i: ti, j: tj }, { near: nearGeo, far: farGeo, mats, farMats }) {
  // first collect every instance per part, then make one instanced mesh per part with the right count
  const inst = {};   // part -> [[matrix, colour], ...]
  const add = (part, pos, quat, scale, color) => {
    const list = inst[part] || (inst[part] = []);
    list.push([new THREE.Matrix4().compose(pos, quat, scale), color.clone()]);
    return [part, list.length - 1];
  };
  const targets = [];
  for (const t of trees) {
    const parts = [];
    const info = treeParts(t, (...a) => { const r = add(...a); parts.push(r); return r; });
    const ob = { type: 'cyl', x: t.x, z: t.z, y0: t.y - 0.5, y1: t.y + info.trunkH + 3, r: info.r };
    addObstacle(ob);
    targets.push({
      kind: 'tree', species: t.kind, x: t.x, y: t.y, z: t.z, scale: t.scale, obstacle: ob, parts,
      spheres: [[t.x, t.y + 0.6, t.z, 0.5 + info.r], [t.x, t.y + info.trunkH * 0.5, t.z, 0.5 + info.r], [t.x, info.crownY, t.z, 1.4 * t.scale]],
    });
  }
  for (const p of plants) {
    const parts = [];
    const [cy, r] = plantParts(p, (...a) => { const res = add(...a); parts.push(res); return res; });
    const tg = { kind: 'plant', plant: p.kind, x: p.x, y: p.y, z: p.z, parts, spheres: [[p.x, cy, p.z, r]] };
    if (p.flower) tg.flower = p.flower[0];
    if (p.kind === 'mushrooms') tg.red = p.red;
    // the big ones are in the way
    if (p.kind === 'cactus' || p.kind === 'bamboo') { tg.obstacle = { type: 'cyl', x: p.x, z: p.z, y0: p.y - 0.5, y1: p.y + 20, r: 0.3 }; addObstacle(tg.obstacle); }
    targets.push(tg);
  }
  const rockPos = nearGeo.rock.attributes.position, rm = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const r of rocks) {
    const parts = [];
    const col = r.iron ? _c.setHSL(0.04, 0.5, 0.4 + hash1(r.x * 3.1 + r.z) * 0.08) : _c.setHSL(0.08, 0.06, 0.62 + hash1(r.x * 3.1 + r.z) * 0.2); // rusty: iron inside
    _q.setFromEuler(_e.set(r.rot, r.rot * 2, 0));
    parts.push(add('rock', _p.set(r.x, r.y + r.s * 0.3, r.z), _q, _s.set(r.s * 1.2, r.s, r.s), col));
    rm.compose(_p, _q, _s);
    for (let k = 0; r.iron && k < 7; k++) {
      // orange nuggets sitting on the boulder's surface: at one of its vertices, in its upper part
      let vi = 0;
      for (let tries = 0; tries < 12; tries++) {
        vi = Math.floor(hash1(r.x * 1.3 + k * 7.7 + r.z + tries * 3.1) * rockPos.count);
        if (v.fromBufferAttribute(rockPos, vi).applyMatrix4(rm).y > r.y + r.s * 0.2) break;
      }
      parts.push(add('ore', v, _q2.setFromEuler(_e.set(k * 1.7, r.x + k, k * 0.9)), _s.setScalar(r.s * (0.6 + hash1(k + r.x) * 0.6)), _c.set(0xffffff)));
    }
    const ob = { type: 'sphere', x: r.x, y: r.y + r.s * 0.3, z: r.z, r: r.s * 0.95 };
    addObstacle(ob);
    targets.push({ kind: 'rock', x: r.x, y: r.y, z: r.z, s: r.s, iron: r.iron, obstacle: ob, parts, spheres: [[r.x, r.y + r.s * 0.3, r.z, r.s * 1.05]] });
  }

  const nearGroup = new THREE.Group(), farGroup = new THREE.Group(), meshes = {};
  for (const part in inst) {
    const list = inst[part], im = new THREE.InstancedMesh(nearGeo[part], mats[part], list.length);
    list.forEach(([m, c], i) => { im.setMatrixAt(i, m); im.setColorAt(i, c); });
    const small = !farGeo[part];
    im.castShadow = part !== 'petals'; im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    meshes[part] = im;
    nearGroup.add(im);
    if (small) continue;
    // the distant version shares the instance data, so chopping a tree hides it in both
    const lo = new THREE.InstancedMesh(farGeo[part], farMats[part] || mats[part], list.length);
    lo.instanceMatrix = im.instanceMatrix; lo.instanceColor = im.instanceColor;
    lo.count = im.count; lo.boundingSphere = im.boundingSphere;
    lo.castShadow = false; lo.receiveShadow = true; // distant trees: only the far shadow cascade would see them
    farGroup.add(lo);
  }
  for (const tg of targets) { tg.parts = tg.parts.map(([part, i]) => [meshes[part], i]); addTarget(tg); }
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
