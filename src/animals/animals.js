import * as THREE from 'three';
import { state } from '../state.js';
import { WORLD } from '../config.js';
import { mulberry32 } from '../noise.js';
import { sampleField } from '../terrain/material.js';
import { CELL, cellKey, isLoaded, obstacleGrid, terrainFns, world } from '../world/world.js';
import { groundAt } from '../world/query.js';
import { lavaAt, lavaFlows } from '../world/volcano.js';
import { FOOT_OFFSET, player } from '../player/character.js';
import { damagePlayer } from '../player/survival.js';
import { give } from '../player/interaction.js';
import { gameState } from '../ui/menu.js';

// ---------------------------------------------------------------------------
// Animals: livestock and wildlife that wander, graze and flee, and predators that hunt you
// ---------------------------------------------------------------------------
// per: how many live on a 256 x 256 m map. shy: runs from you inside this range. hostile: chases you
// inside this range. bite: damage per attack, knock: how hard it shoves you. home 'cave' lives underground.
const SPECIES = {
  cow:     { name: 'Cow', hp: 30, walk: 1.3, run: 4.5, r: 0.75, h: 1.5, graze: true, home: 'meadow', herd: [2, 4], per: 7, drops: [['raw_meat', 2, 3], ['leather', 1, 2]] },
  pig:     { name: 'Pig', hp: 20, walk: 1.2, run: 4.2, r: 0.55, h: 1.0, graze: true, home: 'meadow', herd: [2, 3], per: 5, drops: [['raw_meat', 2, 3]] },
  sheep:   { name: 'Sheep', hp: 20, walk: 1.2, run: 4.2, r: 0.6, h: 1.25, graze: true, home: 'meadow', herd: [3, 5], per: 8, drops: [['raw_meat', 1, 2], ['wool', 2, 3]] },
  chicken: { name: 'Chicken', hp: 8, walk: 1.0, run: 3.8, r: 0.3, h: 0.75, graze: true, home: 'meadow', herd: [3, 4], per: 7, drops: [['raw_meat', 1, 1], ['feather', 1, 2]] },
  deer:    { name: 'Deer', hp: 24, walk: 1.5, run: 8, r: 0.6, h: 1.9, graze: true, shy: 11, home: 'forest', herd: [2, 3], per: 6, drops: [['raw_meat', 2, 3], ['leather', 1, 2]] },
  rabbit:  { name: 'Rabbit', hp: 6, walk: 1.4, run: 6.5, r: 0.25, h: 0.6, shy: 6, hop: true, home: 'any', herd: [1, 2], per: 7, drops: [['raw_meat', 1, 1], ['leather', 0, 1]] },
  wolf:    { name: 'Wolf', hp: 26, walk: 1.7, run: 7.2, r: 0.5, h: 1.15, hostile: 16, bite: 11, home: 'forest', herd: [2, 4], per: 2.5, drops: [['leather', 1, 2], ['raw_meat', 0, 1]] },
  bear:    { name: 'Bear', hp: 80, walk: 1.3, run: 6.6, r: 0.95, h: 1.75, hostile: 11, bite: 24, knock: 10, attackEvery: 1.6, home: 'forest', herd: [1, 1], per: 1.2, drops: [['raw_meat', 3, 5], ['leather', 2, 3]] },
  boar:    { name: 'Boar', hp: 32, walk: 1.2, run: 7.5, r: 0.6, h: 1.0, graze: true, hostile: 4.5, bite: 13, knock: 8, home: 'forest', herd: [2, 3], per: 2, drops: [['raw_meat', 2, 3], ['leather', 1, 1]] },
  spider:  { name: 'Cave spider', hp: 18, walk: 1.8, run: 6.2, r: 0.6, h: 0.6, hostile: 13, bite: 8, home: 'cave', herd: [1, 3], per: 2.5, drops: [['silk', 1, 2]] },
};
export const animals = [];
const population = {};
let animalRand = Math.random, animalRespawnTimer = 0;
const _boxGeos = new Map();
const boxGeo = (w, h, d) => {
  const k = `${w},${h},${d}`;
  if (!_boxGeos.has(k)) _boxGeos.set(k, new THREE.BoxGeometry(w, h, d));
  return _boxGeos.get(k);
};

// Low-poly animals built from boxes. Local forward is -Z, feet at y = 0.
function buildAnimal(kind, rand) {
  const g = new THREE.Group(), mats = [], legs = [];
  const M = (c) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }); mats.push(m); return m; };
  const box = (parent, w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(boxGeo(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; parent.add(b); return b; };
  const leg = (m, w, len, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); box(p, w, len, w, m, 0, -len / 2, 0); g.add(p); legs.push(p); };
  const head = new THREE.Group();
  g.add(head);
  let body;
  switch (kind) {
    case 'cow': {
      const white = M(0xf2eee6), black = M(0x2b2826), pink = M(0xe8a3a0), horn = M(0xe0d4b4);
      for (const [x, z] of [[-0.27, -0.5], [0.27, -0.5], [-0.27, 0.5], [0.27, 0.5]]) leg(white, 0.2, 0.62, x, 0.62, z);
      body = box(g, 0.8, 0.7, 1.45, white, 0, 0.95, 0);
      box(g, 0.82, 0.4, 0.45, black, 0, 1.08, 0.25); box(g, 0.82, 0.3, 0.3, black, 0, 0.9, -0.4);
      head.position.set(0, 1.2, -0.72);
      box(head, 0.48, 0.48, 0.5, white, 0, 0, -0.22); box(head, 0.5, 0.26, 0.2, black, 0, 0.12, -0.3);
      box(head, 0.4, 0.22, 0.14, pink, 0, -0.12, -0.5);
      box(head, 0.08, 0.16, 0.08, horn, -0.21, 0.3, -0.18); box(head, 0.08, 0.16, 0.08, horn, 0.21, 0.3, -0.18);
      break;
    }
    case 'pig': {
      const pink = M(0xeba4a0), dark = M(0xd0807e);
      for (const [x, z] of [[-0.2, -0.36], [0.2, -0.36], [-0.2, 0.36], [0.2, 0.36]]) leg(pink, 0.17, 0.34, x, 0.34, z);
      body = box(g, 0.62, 0.52, 1.0, pink, 0, 0.6, 0);
      head.position.set(0, 0.72, -0.48);
      box(head, 0.46, 0.42, 0.38, pink, 0, 0, -0.14); box(head, 0.24, 0.17, 0.1, dark, 0, -0.06, -0.36);
      box(head, 0.1, 0.1, 0.06, dark, -0.16, 0.24, -0.12); box(head, 0.1, 0.1, 0.06, dark, 0.16, 0.24, -0.12);
      box(g, 0.06, 0.06, 0.14, dark, 0, 0.75, 0.55, -0.6);
      break;
    }
    case 'sheep': {
      const wool = M(0xf0ede4), skin = M(0x3d3532);
      for (const [x, z] of [[-0.2, -0.34], [0.2, -0.34], [-0.2, 0.34], [0.2, 0.34]]) leg(skin, 0.13, 0.45, x, 0.45, z);
      body = box(g, 0.74, 0.66, 1.0, wool, 0, 0.85, 0);
      box(g, 0.66, 0.2, 0.86, wool, 0, 1.2, 0);
      head.position.set(0, 1.0, -0.52);
      box(head, 0.3, 0.34, 0.4, skin, 0, 0, -0.14); box(head, 0.36, 0.14, 0.26, wool, 0, 0.2, -0.06);
      box(head, 0.14, 0.06, 0.08, skin, -0.2, 0.06, -0.06); box(head, 0.14, 0.06, 0.08, skin, 0.2, 0.06, -0.06);
      break;
    }
    case 'chicken': {
      const white = M(0xf7f5ee), yellow = M(0xe8b030), red = M(0xd8332a);
      leg(yellow, 0.05, 0.26, -0.08, 0.26, 0); leg(yellow, 0.05, 0.26, 0.08, 0.26, 0);
      body = box(g, 0.32, 0.32, 0.44, white, 0, 0.42, 0);
      box(g, 0.2, 0.22, 0.1, white, 0, 0.56, 0.22, 0.4);
      box(g, 0.06, 0.2, 0.3, white, -0.18, 0.44, 0); box(g, 0.06, 0.2, 0.3, white, 0.18, 0.44, 0);
      head.position.set(0, 0.62, -0.18);
      box(head, 0.2, 0.24, 0.2, white, 0, 0.04, -0.04); box(head, 0.1, 0.06, 0.12, yellow, 0, 0.02, -0.2);
      box(head, 0.04, 0.1, 0.12, red, 0, 0.19, -0.04); box(head, 0.04, 0.08, 0.04, red, 0, -0.06, -0.15);
      break;
    }
    case 'deer': {
      const brown = M(0xa86b3c), light = M(0xe8dcc8), antler = M(0xd9c9a3);
      for (const [x, z] of [[-0.16, -0.45], [0.16, -0.45], [-0.16, 0.45], [0.16, 0.45]]) leg(brown, 0.11, 0.85, x, 0.85, z);
      body = box(g, 0.48, 0.52, 1.15, brown, 0, 1.1, 0);
      box(g, 0.36, 0.1, 0.8, light, 0, 0.84, 0);
      box(g, 0.14, 0.18, 0.08, light, 0, 1.25, 0.6, -0.4);
      head.position.set(0, 1.3, -0.5);
      box(head, 0.2, 0.42, 0.22, brown, 0, 0.12, -0.08, -0.45);
      box(head, 0.24, 0.24, 0.4, brown, 0, 0.36, -0.28); box(head, 0.13, 0.11, 0.1, M(0x2b2420), 0, 0.31, -0.5);
      box(head, 0.12, 0.08, 0.04, brown, -0.13, 0.48, -0.18); box(head, 0.12, 0.08, 0.04, brown, 0.13, 0.48, -0.18);
      if (rand() < 0.5) {
        for (const s of [-1, 1]) {
          box(head, 0.05, 0.34, 0.05, antler, s * 0.1, 0.62, -0.2);
          box(head, 0.05, 0.05, 0.2, antler, s * 0.1, 0.68, -0.29);
          box(head, 0.18, 0.05, 0.05, antler, s * 0.18, 0.78, -0.2);
        }
      }
      break;
    }
    case 'rabbit': {
      const fur = M(rand() < 0.5 ? 0x9a8470 : 0xb8b0a4), white = M(0xf4f1ea), pink = M(0xe0a8a8);
      for (const [x, z] of [[-0.08, -0.12], [0.08, -0.12], [-0.09, 0.13], [0.09, 0.13]]) leg(fur, 0.08, 0.12, x, 0.12, z);
      body = box(g, 0.28, 0.28, 0.42, fur, 0, 0.25, 0);
      box(g, 0.12, 0.12, 0.1, white, 0, 0.3, 0.24);
      head.position.set(0, 0.4, -0.2);
      box(head, 0.2, 0.2, 0.22, fur, 0, 0, -0.05);
      box(head, 0.06, 0.24, 0.04, fur, -0.05, 0.2, 0.02); box(head, 0.06, 0.24, 0.04, fur, 0.05, 0.2, 0.02);
      box(head, 0.04, 0.04, 0.02, pink, 0, -0.02, -0.17);
      break;
    }
    case 'wolf': {
      const grey = M(0x6f6d6a), light = M(0xb8b4ad), dark = M(0x3a3836), eye = M(0xf2c230);
      eye.emissive.set(0x6a4a00);
      for (const [x, z] of [[-0.14, -0.38], [0.14, -0.38], [-0.14, 0.38], [0.14, 0.38]]) leg(grey, 0.13, 0.5, x, 0.5, z);
      body = box(g, 0.42, 0.45, 1.0, grey, 0, 0.75, 0);
      box(g, 0.46, 0.5, 0.36, grey, 0, 0.8, -0.32);
      box(g, 0.3, 0.12, 0.7, light, 0, 0.53, 0);
      box(g, 0.12, 0.12, 0.48, grey, 0, 0.8, 0.66, -0.55);
      head.position.set(0, 0.92, -0.55);
      box(head, 0.34, 0.32, 0.34, grey, 0, 0, -0.1); box(head, 0.18, 0.16, 0.26, light, 0, -0.06, -0.36);
      box(head, 0.08, 0.06, 0.06, dark, 0, -0.02, -0.5);
      box(head, 0.08, 0.14, 0.06, dark, -0.1, 0.22, -0.02); box(head, 0.08, 0.14, 0.06, dark, 0.1, 0.22, -0.02);
      box(head, 0.06, 0.04, 0.02, eye, -0.09, 0.05, -0.27); box(head, 0.06, 0.04, 0.02, eye, 0.09, 0.05, -0.27);
      break;
    }
    case 'bear': {
      const fur = M(rand() < 0.3 ? 0x3b2c22 : 0x5c4130), muzzle = M(0x9a7a5c), dark = M(0x1c1612), eye = M(0x120c08);
      for (const [x, z] of [[-0.32, -0.55], [0.32, -0.55], [-0.32, 0.55], [0.32, 0.55]]) leg(fur, 0.28, 0.62, x, 0.62, z);
      body = box(g, 0.96, 0.86, 1.65, fur, 0, 1.05, 0);
      box(g, 0.9, 0.3, 0.6, fur, 0, 1.52, -0.38); // shoulder hump
      head.position.set(0, 1.3, -0.88);
      box(head, 0.6, 0.54, 0.52, fur, 0, 0, -0.14); box(head, 0.32, 0.26, 0.3, muzzle, 0, -0.1, -0.5);
      box(head, 0.12, 0.08, 0.06, dark, 0, -0.02, -0.66);
      box(head, 0.14, 0.14, 0.08, fur, -0.22, 0.32, -0.04); box(head, 0.14, 0.14, 0.08, fur, 0.22, 0.32, -0.04);
      box(head, 0.06, 0.06, 0.02, eye, -0.14, 0.08, -0.41); box(head, 0.06, 0.06, 0.02, eye, 0.14, 0.08, -0.41);
      break;
    }
    case 'boar': {
      const hide = M(0x4e3d33), bristle = M(0x2c221d), snout = M(0x8a6a5c), tusk = M(0xefe6d2);
      for (const [x, z] of [[-0.2, -0.4], [0.2, -0.4], [-0.2, 0.4], [0.2, 0.4]]) leg(hide, 0.15, 0.38, x, 0.38, z);
      body = box(g, 0.6, 0.62, 1.15, hide, 0, 0.7, 0);
      box(g, 0.14, 0.18, 0.9, bristle, 0, 1.06, -0.05);
      head.position.set(0, 0.78, -0.58);
      box(head, 0.44, 0.44, 0.42, hide, 0, 0, -0.14); box(head, 0.26, 0.2, 0.14, snout, 0, -0.08, -0.4);
      box(head, 0.05, 0.14, 0.05, tusk, -0.15, -0.04, -0.42); box(head, 0.05, 0.14, 0.05, tusk, 0.15, -0.04, -0.42);
      box(head, 0.1, 0.12, 0.06, bristle, -0.16, 0.26, -0.06); box(head, 0.1, 0.12, 0.06, bristle, 0.16, 0.26, -0.06);
      break;
    }
    case 'spider': {
      const black = M(0x1d1b1e), hair = M(0x3a3236), eye = M(0xff2a1a);
      eye.emissive.set(0xc01000);
      body = box(g, 0.62, 0.42, 0.7, black, 0, 0.5, 0.32);
      box(g, 0.46, 0.32, 0.42, hair, 0, 0.45, -0.18);
      // eight legs: each pivots at the body side, splayed out and down
      for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
        const p = new THREE.Group();
        p.position.set(side * 0.22, 0.52, -0.3 + i * 0.2);
        p.rotation.y = side * (i - 1.5) * -0.35; // fanned out from front to back
        box(p, 0.5, 0.07, 0.07, black, side * 0.25, 0.12, 0).rotation.z = side * 0.45; // up and out from the body
        box(p, 0.06, 0.7, 0.06, black, side * 0.5, -0.15, 0).rotation.z = side * 0.25;  // down to the ground
        g.add(p); legs.push(p);
      }
      head.position.set(0, 0.48, -0.42);
      box(head, 0.3, 0.24, 0.2, black, 0, 0, -0.04);
      for (const [x, y] of [[-0.07, 0.05], [0.07, 0.05], [-0.12, 0.0], [0.12, 0.0]]) box(head, 0.045, 0.045, 0.02, eye, x, y, -0.15);
      break;
    }
  }
  body.castShadow = true;
  return { group: g, legs, head, mats };
}

export function spawnAnimal(kind, x, y, z, rand) {
  const sp = SPECIES[kind];
  const model = buildAnimal(kind, rand);
  const a = {
    kind, sp, ...model, x, y, z, hp: sp.hp, facing: rand() * Math.PI * 2, angle: rand() * Math.PI * 2,
    mode: 'idle', timer: rand() * 3, kx: 0, kz: 0, phase: 0, hurtT: 0, flee: 0, aggro: 0, attackCd: 0, groundT: 0,
  };
  world.add(a.group);
  animals.push(a);
  return a;
}

// A spot on a cave floor under (x, z), or null: scans up from the cave floor for air with ground below.
function caveFloorAt(x, z) {
  const T = terrainFns, top = T.surfaceHeight(x, z) - 6;
  for (let y = WORLD.caveFloor + 1.5; y < top; y += 1.5) {
    if (sampleField(x, y, z) < -0.6 && sampleField(x, y + 1.5, z) < -0.6) {
      const g = groundAt(x, z, y);
      if (g && y - g.point.y < 6 && g.face.normal.y > 0.7) return g;
      return null;
    }
  }
  return null;
}

function findAnimalSpot(home, rand, awayFromPlayer) {
  const T = terrainFns, S = WORLD.size, L = T.ledge;
  for (let tries = 0; tries < (home === 'cave' ? 160 : 50); tries++) {
    const x = 10 + rand() * (S - 20), z = 10 + rand() * (S - 20);
    if (awayFromPlayer && Math.hypot(x - player.position.x, z - player.position.z) < 50) continue;
    if (!isLoaded(x, z, 8)) return null; // terrain there isn't generated yet: try again later
    if (home === 'cave') {
      if (Math.hypot(x - L.x, z - L.z) < 40 || T.volcanoInfluence(x, z) > 0.2) continue; // not right at the start
      const g = caveFloorAt(x, z);
      if (g) return { x, y: g.point.y, z };
      continue;
    }
    const W = T.waterAt(x, z);
    const g = groundAt(x, z);
    if (!g) continue;
    const y = g.point.y;
    if (y < W + 1.5 || y > 72 || g.face.normal.y < 0.8 || Math.abs(y - T.surfaceHeight(x, z)) > 3 || T.volcanoInfluence(x, z) > 0.25) continue;
    const fm = T.forestMask(x, z);
    if (home === 'meadow' && fm > 0.45) continue;
    if (home === 'forest' && fm < 0.4) continue;
    if (home === 'forest' && Math.hypot(x - L.x, z - L.z) < 45) continue; // keep wolves away from the starting ledge
    return { x, y, z };
  }
  return null;
}

function spawnHerd(kind, rand, awayFromPlayer) {
  const sp = SPECIES[kind];
  const spot = findAnimalSpot(sp.home, rand, awayFromPlayer);
  if (!spot) return 0;
  const n = sp.herd[0] + Math.floor(rand() * (sp.herd[1] - sp.herd[0] + 1));
  let made = 0;
  for (let i = 0; i < n * 3 && made < n; i++) {
    const x = spot.x + (rand() - 0.5) * 8, z = spot.z + (rand() - 0.5) * 8;
    const g = sp.home === 'cave' ? groundAt(x, z, spot.y + 2.5) : groundAt(x, z);
    if (!g || g.point.y < terrainFns.waterAt(x, z) + 1 || g.face.normal.y < 0.7 || Math.abs(g.point.y - spot.y) > 4) continue;
    spawnAnimal(kind, x, g.point.y, z, rand);
    made++;
  }
  return made;
}

export function spawnAnimals(seed) {
  animalRand = mulberry32(seed * 17 + 11);
  const area = (WORLD.size / 256) ** 2;
  for (const [kind, sp] of Object.entries(SPECIES)) {
    population[kind] = Math.max(1, Math.round(sp.per * area));
    for (let tries = 0; tries < 12 && animals.filter((a) => a.kind === kind).length < population[kind]; tries++) spawnHerd(kind, animalRand, false);
  }
  return animals.length;
}

// Moves an animal if the spot is walkable: on land, not too steep, no step over 0.9 m, no tree, rock or block in the way.
function tryMoveAnimal(a, mx, mz) {
  const S = WORLD.size, nx = a.x + mx, nz = a.z + mz;
  if (nx < 3 || nz < 3 || nx > S - 3 || nz > S - 3) return false;
  const g = groundAt(nx, nz, a.y + 2.2);
  if (!g || g.point.y < terrainFns.waterAt(nx, nz) + 0.2 || g.face.normal.y < 0.6 || Math.abs(g.point.y - a.y) > 0.9) return false;
  const gy = g.point.y;
  if (lavaFlows.length && terrainFns.volcanoInfluence(nx, nz) > 0.25 && lavaAt(nx, gy, nz, 0.5)) return false;
  const list = obstacleGrid.get(cellKey(Math.floor(nx / CELL), Math.floor(nz / CELL)));
  if (list) for (const o of list) {
    if (o.min) { if (nx > o.min.x - a.sp.r * 0.5 && nx < o.max.x + a.sp.r * 0.5 && nz > o.min.z - a.sp.r * 0.5 && nz < o.max.z + a.sp.r * 0.5 && gy + 0.3 < o.max.y && gy + a.sp.h > o.min.y) return false; }
    else if (Math.hypot(nx - o.x, nz - o.z) < o.r + a.sp.r * 0.6 && (o.type !== 'sphere' || o.y + o.r > gy + 0.3)) return false;
  }
  a.x = nx; a.z = nz; a.y = gy;
  return true;
}

export function hurtAnimal(a, dmg, dx, dz) {
  a.hp -= dmg;
  a.hurtT = 0.25;
  const len = Math.hypot(dx, dz) || 1;
  a.kx = dx / len * 6; a.kz = dz / len * 6;
  if (a.sp.hostile) a.aggro = 20; else a.flee = 6;
  if (a.hp <= 0) killAnimal(a);
}

function killAnimal(a) {
  world.remove(a.group);
  a.mats.forEach((m) => m.dispose());
  animals.splice(animals.indexOf(a), 1);
  if (state.currentTarget?.animal === a) state.currentTarget = null;
  if (state.creative) return;
  const got = [];
  for (const [id, lo, hi] of a.sp.drops) {
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (n > 0) got.push([id, n]);
  }
  give(got);
}

export function updateAnimals(dt) {
  const px = player.position.x, pz = player.position.z, pfeet = player.position.y - FOOT_OFFSET;
  for (const a of [...animals]) {
    const sp = a.sp;
    const dx = px - a.x, dz = pz - a.z, dist = Math.hypot(dx, dz) || 1e-3, dy = pfeet - a.y;
    if (dist > 140) continue; // far away animals stay put
    a.timer -= dt; a.hurtT -= dt; a.attackCd -= dt; a.flee -= dt; a.aggro -= dt;

    let wx = 0, wz = 0, speed = 0;
    const hunting = sp.hostile && !state.creative && gameState === 'playing' && Math.abs(dy) < 6 && (dist < sp.hostile || (a.aggro > 0 && dist < 30));
    if (hunting) {
      a.mode = 'chase'; wx = dx / dist; wz = dz / dist; speed = sp.run;
      if (dist < 1.3 + sp.r && Math.abs(dy) < 1.8 && a.attackCd <= 0) {
        a.attackCd = sp.attackEvery || 1.1;
        damagePlayer(sp.bite, `were killed by a ${sp.name.toLowerCase()}`);
        const k = sp.knock || 6;
        player.velocity.x += dx / dist * k; player.velocity.z += dz / dist * k; player.velocity.y = Math.max(player.velocity.y, 3);
      }
      if (dist < 1.1 + sp.r) speed = 0;
    } else if (a.flee > 0 || (sp.shy && dist < sp.shy && Math.abs(dy) < 5)) {
      a.mode = 'flee'; wx = -dx / dist; wz = -dz / dist; speed = sp.run;
    } else {
      if (a.timer <= 0) {
        if (animalRand() < 0.45) { a.mode = 'idle'; a.timer = 2 + animalRand() * 5; }
        else { a.mode = 'walk'; a.angle = animalRand() * Math.PI * 2; a.timer = 2 + animalRand() * 4; }
      }
      if (a.mode === 'walk') { wx = -Math.sin(a.angle); wz = -Math.cos(a.angle); speed = sp.walk; }
      else a.mode = 'idle';
    }

    // move (plus knockback), steering around things in the way
    const decay = Math.exp(-6 * dt);
    a.kx *= decay; a.kz *= decay;
    let mx = (wx * speed + a.kx) * dt, mz = (wz * speed + a.kz) * dt;
    let moved = 0;
    if (mx || mz) {
      if (tryMoveAnimal(a, mx, mz)) moved = Math.hypot(mx, mz);
      else {
        let ok = false;
        for (const turn of [0.8, -0.8, 1.6, -1.6]) {
          const c = Math.cos(turn), s = Math.sin(turn);
          if (tryMoveAnimal(a, mx * c - mz * s, mx * s + mz * c)) { ok = true; moved = Math.hypot(mx, mz); wx = (mx * c - mz * s); wz = (mx * s + mz * c); break; }
        }
        if (!ok && a.mode === 'walk') { a.angle += Math.PI * (0.5 + animalRand()); a.timer = 1 + animalRand() * 2; }
        if (!ok && a.mode === 'flee') a.flee = Math.min(a.flee, 0.5);
      }
    }
    if (!moved) {
      // settle onto the ground (it might have been dug away)
      a.groundT -= dt;
      if (a.groundT <= 0) {
        a.groundT = 0.4;
        const g = groundAt(a.x, a.z, a.y + 1.2);
        if (g) a.y = g.point.y; else a.y -= 1;
      }
    }

    // face where it's going
    if (wx || wz) {
      const target = Math.atan2(-wx, -wz);
      const diff = Math.atan2(Math.sin(target - a.facing), Math.cos(target - a.facing));
      a.facing += diff * Math.min(1, dt * 6);
    }

    // animation: legs swing in diagonal pairs, grazers lower their heads while idle, rabbits hop
    const hs = moved / Math.max(dt, 1e-4);
    a.phase += dt * hs * (sp.hop ? 3 : 6) / Math.max(0.6, sp.h);
    const sw = Math.sin(a.phase) * Math.min(1, hs / 2) * 0.7;
    a.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3) ? sw : -sw; });
    const headDown = a.mode === 'idle' && sp.graze && Math.sin(a.timer * 0.9) > -0.3 ? -0.7 : 0;
    a.head.rotation.x += (headDown - a.head.rotation.x) * Math.min(1, dt * 4);
    const hop = sp.hop && hs > 0.2 ? Math.abs(Math.sin(a.phase)) * 0.25 : 0;
    a.group.position.set(a.x, a.y + hop, a.z);
    a.group.rotation.y = a.facing;
    const flash = a.hurtT > 0 ? 0.6 : 0;
    for (const m of a.mats) if (m.userData.flash !== flash) { m.userData.flash = flash; m.emissive.setRGB(flash, 0, 0); }
  }

  // top populations back up now and then, out of sight (quickly while the world is still filling up)
  animalRespawnTimer -= dt;
  if (animalRespawnTimer <= 0) {
    const want = Object.values(population).reduce((a, b) => a + b, 0);
    animalRespawnTimer = animals.length < want * 0.7 ? 1.5 : 20;
    for (const kind of Object.keys(SPECIES)) {
      if (animals.filter((a) => a.kind === kind).length < population[kind]) { spawnHerd(kind, animalRand, true); break; }
    }
  }
}
