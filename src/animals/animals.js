import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { state } from '../state.js';
import { WORLD } from '../config.js';
import { mulberry32 } from '../noise.js';
import { sampleField } from '../terrain/material.js';
import { CELL, cellKey, isLoaded, obstacleGrid, terrainFns, world } from '../world/world.js';
import { groundAt } from '../world/query.js';
import { lavaAt, lavaFlows } from '../world/volcano.js';
import { fluidAt } from '../world/fluids.js';
import { FOOT_OFFSET, player } from '../player/character.js';
import { damagePlayer } from '../player/survival.js';
import { give } from '../player/interaction.js';
import { gameState } from '../ui/menu.js';
import { litMaterial } from '../render/scene.js';
import { BIOMES } from '../terrain/biomes.js';

// ---------------------------------------------------------------------------
// Animals: livestock and wildlife that wander, graze and flee, and predators that hunt you
// ---------------------------------------------------------------------------
// per: how many live on a 256 x 256 m map. shy: runs from you inside this range. hostile: chases you
// inside this range. bite: damage per attack, knock: how hard it shoves you. home 'cave' lives underground.
export const SPECIES = {
  cow:     { name: 'Cow', hp: 30, walk: 1.3, run: 4.5, r: 0.75, h: 1.5, graze: true, home: 'meadow', herd: [2, 4], per: 7, drops: [['raw_meat', 2, 3], ['leather', 1, 2]] },
  pig:     { name: 'Pig', hp: 20, walk: 1.2, run: 4.2, r: 0.55, h: 1.0, graze: true, home: 'meadow', herd: [2, 3], per: 5, drops: [['raw_meat', 2, 3]] },
  sheep:   { name: 'Sheep', hp: 20, walk: 1.2, run: 4.2, r: 0.6, h: 1.25, graze: true, home: 'meadow', herd: [3, 5], per: 8, drops: [['raw_meat', 1, 2], ['wool', 2, 3]] },
  chicken: { name: 'Chicken', hp: 8, walk: 1.0, run: 3.8, r: 0.3, h: 0.75, graze: true, home: 'meadow', herd: [3, 4], per: 7, drops: [['raw_meat', 1, 1], ['feather', 1, 2]] },
  deer:    { name: 'Deer', hp: 24, walk: 1.5, run: 8, r: 0.6, h: 1.9, graze: true, shy: 11, home: 'forest', herd: [2, 3], per: 6, drops: [['raw_meat', 2, 3], ['leather', 1, 2]] },
  rabbit:  { name: 'Rabbit', hp: 6, walk: 1.4, run: 6.5, r: 0.25, h: 0.6, shy: 6, hop: true, home: 'any', herd: [1, 2], per: 7, drops: [['raw_meat', 1, 1], ['leather', 0, 1]] },
  wolf:    { name: 'Wolf', hp: 26, walk: 1.7, run: 7.2, r: 0.5, h: 1.15, hostile: 16, bite: 11, home: 'forest', herd: [2, 4], per: 2.5, drops: [['leather', 1, 2], ['raw_meat', 0, 1]] },
  bear:    { name: 'Bear', hp: 80, walk: 1.3, run: 6.6, r: 0.95, h: 1.75, hostile: 11, bite: 24, knock: 10, attackEvery: 1.6, home: 'forest', herd: [1, 1], per: 1.2, drops: [['raw_meat', 3, 5], ['leather', 2, 3]] },
  boar:    { name: 'Boar', hp: 32, walk: 1.2, run: 7.5, r: 0.6, h: 1.0, graze: true, hostile: 4.5, bite: 13, knock: 8, home: 'forest', herd: [2, 3], per: 2, drops: [['raw_meat', 2, 3], ['leather', 1, 1]] },
  // the animals of the newer biomes (biomes.js says which live where)
  camel:   { name: 'Camel', hp: 36, walk: 1.2, run: 5, r: 0.8, h: 2.2, graze: true, home: 'any', herd: [1, 3], per: 3, drops: [['raw_meat', 2, 3], ['leather', 1, 2]] },
  zebra:   { name: 'Zebra', hp: 26, walk: 1.5, run: 8.5, r: 0.65, h: 1.6, graze: true, shy: 9, home: 'any', herd: [3, 5], per: 5, drops: [['raw_meat', 2, 3], ['leather', 1, 2]] },
  goat:    { name: 'Goat', hp: 18, walk: 1.3, run: 6, r: 0.45, h: 1.1, graze: true, home: 'any', herd: [2, 4], per: 4, drops: [['raw_meat', 1, 2], ['leather', 0, 1]] },
  fox:     { name: 'Fox', hp: 12, walk: 1.5, run: 7.5, r: 0.35, h: 0.7, shy: 8, home: 'any', herd: [1, 2], per: 4, drops: [['leather', 0, 1]] },
  parrot:  { name: 'Parrot', hp: 6, walk: 1.0, run: 4, r: 0.25, h: 0.6, shy: 5, hop: true, home: 'any', herd: [2, 3], per: 4, drops: [['feather', 1, 3]] },
  polar_bear: { name: 'Polar bear', hp: 90, walk: 1.2, run: 6.4, r: 0.95, h: 1.8, hostile: 8, bite: 22, knock: 10, attackEvery: 1.6, home: 'any', herd: [1, 2], per: 1.5, drops: [['raw_meat', 3, 5], ['leather', 2, 3]] },
  jaguar:  { name: 'Jaguar', hp: 34, walk: 1.6, run: 8.4, r: 0.55, h: 0.95, hostile: 12, bite: 14, knock: 6, home: 'any', herd: [1, 1], per: 1.5, drops: [['leather', 1, 2], ['raw_meat', 1, 2]] },
  scorpion: { name: 'Scorpion', hp: 14, walk: 1.4, run: 5.5, r: 0.4, h: 0.45, hostile: 8, bite: 9, home: 'any', herd: [1, 2], per: 2.5, drops: [['silk', 0, 1], ['raw_meat', 0, 1]] },
  spider:  { name: 'Cave spider', hp: 18, walk: 1.8, run: 6.2, r: 0.6, h: 0.6, hostile: 13, bite: 8, home: 'cave', herd: [1, 3], per: 2.5, drops: [['silk', 1, 2]] },
};
export const animals = [];
const population = {};
let animalRand = Math.random, animalRespawnTimer = 0;
// All animals share two materials (normal, and red for the moment one is hit) plus an unlit one
// for glowing eyes, and every animal of the same look shares its geometry: one mesh for the body,
// one for the head, one for the tail and one per leg. (Hundreds of separate boxes and materials made
// spawning slow and every frame heavier.)
const animalMat = litMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
const hurtMat = litMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, emissive: 0x991010 }));
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const bakedGeos = new Map();   // look -> merged geometries, in build order
const _boxGeo = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const _m4 = new THREE.Matrix4(), _col = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Vector3();

// The shape of one part: a plain box for small bits, and for bigger ones a box with its edges
// bevelled off (`bevel` metres) and its top face narrowed by `taper` (1 = straight sides), so legs
// thin toward the hoof, snouts narrow and bodies look rounded instead of cut from cardboard.
const partGeos = new Map();
function partGeo(w, h, d, taper, bevel) {
  if (taper === 1 && bevel === 0) return _boxGeo;
  const key = [w, h, d, taper, bevel].map((v) => v.toFixed(3)).join();
  let geo = partGeos.get(key);
  if (geo) return geo;
  const pts = [];
  for (const sy of [-1, 1]) {
    const t = sy > 0 ? taper : 1, hx = (w / 2) * t, hz = (d / 2) * t, y = (h / 2) * sy, b = Math.min(bevel, hx * 0.45, hz * 0.45, h * 0.3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pts.push(new THREE.Vector3(sx * hx, y - sy * b, sz * (hz - b)), new THREE.Vector3(sx * (hx - b), y - sy * b, sz * hz), new THREE.Vector3(sx * (hx - b), y, sz * (hz - b)));
    }
  }
  geo = new ConvexGeometry(pts);
  geo.scale(1 / w, 1 / h, 1 / d); // stored as a unit part: mergeBoxes scales every part by its size
  partGeos.set(key, geo);
  return geo;
}

// Merges the parts in `parts` (placeholder objects under one parent) into one geometry with colours.
// Faces turned downward are shaded a little darker, which reads as soft shadow under bellies and chins.
function mergeBoxes(parts) {
  const pos = [], nrm = [], col = [], nm = new THREE.Matrix3();
  for (const o of parts) {
    const u = o.userData, geo = partGeo(u.w, u.h, u.d, u.taper, u.bevel), P = geo.attributes.position, N = geo.attributes.normal;
    o.updateMatrix();
    _m4.copy(o.matrix).scale(_v.set(u.w, u.h, u.d));
    nm.getNormalMatrix(_m4);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m4); pos.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nrm.push(_n.x, _n.y, _n.z);
      _col.setHex(u.color);
      if (!u.glow) _col.multiplyScalar(0.8 + 0.2 * Math.min(1, _n.y + 1));
      col.push(_col.r, _col.g, _col.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
// Swaps the placeholder parts under the body, head, tail and each leg for merged meshes (geometry
// shared between animals that look the same: same kind, colours and `variant`, the pattern).
function bakeAnimal(kind, variant, roots) {
  const groups = [];
  let look = `${kind}|${variant}`;
  for (const r of roots) {
    const parts = r.children.filter((c) => c.userData.box);
    for (const glow of [false, true]) {
      const list = parts.filter((c) => !!c.userData.glow === glow);
      groups.push({ r, glow, list });
      look += '|' + list.map((c) => c.userData.color.toString(36)).join(',');
    }
    for (const c of parts) r.remove(c);
  }
  let geos = bakedGeos.get(look);
  if (!geos) bakedGeos.set(look, (geos = groups.map((q) => (q.list.length ? mergeBoxes(q.list) : null))));
  const meshes = [];
  groups.forEach((q, i) => {
    if (!geos[i]) return;
    const m = new THREE.Mesh(geos[i], q.glow ? glowMat : animalMat);
    q.r.add(m);
    if (!q.glow) meshes.push(m);
  });
  meshes[0].castShadow = true; // the body
  return meshes;
}

// Low-poly animals built from bevelled boxes. Local forward is -Z, feet at y = 0.
function buildAnimal(kind, rand) {
  const g = new THREE.Group(), legs = [], head = new THREE.Group(), tail = new THREE.Group();
  g.add(head, tail);
  let variant = 0;
  // a colour (glowing ones are unlit), and a placeholder part that bakeAnimal merges away.
  // o: { rx, ry, rz } turns it, taper narrows its top, bevel rounds its edges (default: by size).
  const M = (c) => ({ color: c, glow: false, emissive: { set() { this.glow = true; } } });
  const box = (parent, w, h, d, m, x, y, z, rx = 0, o = {}) => {
    const b = new THREE.Object3D(); b.position.set(x, y, z); b.rotation.set(rx, o.ry || 0, o.rz || 0);
    const small = Math.min(w, h, d);
    b.userData = { box: true, w, h, d, taper: o.taper ?? 1, bevel: o.bevel ?? (small > 0.09 ? small * 0.22 : 0), color: m.color, get glow() { return m.glow; } };
    parent.add(b); return b;
  };
  // a leg hanging from a hip or shoulder at (x, top, z): tapering down to a hoof or paw of `foot` colour
  const leg = (m, foot, w, len, x, top, z, o = {}) => {
    const p = new THREE.Group(); p.position.set(x, top, z);
    const fh = Math.min(0.12, len * 0.16);
    box(p, w, len - fh, w * (o.deep || 1), m, 0, -(len - fh) / 2, 0, 0, { taper: 1 / (o.taper || 0.72) });
    box(p, w * (o.footW || 0.82), fh, w * (o.footD || 1), foot, 0, -len + fh / 2, o.toe || 0);
    g.add(p); legs.push(p);
    return p;
  };
  // eyes: dark with a small bright glint (or glowing, for hunters' eyes in the dark)
  const eyes = (parent, x, y, z, s, m = M(0x1a1410), glint = true) => {
    for (const sx of [-1, 1]) {
      box(parent, 0.03, s, s, m, sx * x, y, z);
      if (glint) box(parent, 0.032, s * 0.35, s * 0.35, M(0xffffff), sx * (x + 0.002), y + s * 0.2, z - s * 0.2);
    }
  };
  const pair = (fn) => { fn(-1); fn(1); };
  switch (kind) {
    case 'cow': {
      const white = M(0xf2eee6), black = M(rand() < 0.25 ? 0x6a3e26 : 0x2b2826), pink = M(0xe8a3a0), horn = M(0xe6dcc0), hoof = M(0x3a3430), tip = M(0x4a4440);
      variant = Math.floor(rand() * 3);
      for (const [x, z] of [[-0.25, -0.5], [0.25, -0.5], [-0.25, 0.52], [0.25, 0.52]]) leg(white, hoof, 0.2, 0.66, x, 0.72, z);
      box(g, 0.8, 0.72, 1.5, white, 0, 1.0, 0.02);
      box(g, 0.74, 0.34, 0.5, white, 0, 1.24, 0.48); // hips
      box(g, 0.72, 0.4, 0.46, white, 0, 1.2, -0.5); // shoulders
      box(g, 0.36, 0.2, 0.3, pink, 0, 0.6, 0.4); // udder
      // patches, three patterns
      const spots = [[[0.41, 1.08, 0.2, 0.06, 0.4, 0.5], [-0.41, 0.98, -0.25, 0.06, 0.36, 0.42], [0, 1.37, 0.42, 0.5, 0.06, 0.4]],
        [[0.41, 1.02, -0.3, 0.06, 0.46, 0.48], [-0.41, 1.1, 0.35, 0.06, 0.32, 0.5], [0, 1.37, -0.1, 0.44, 0.06, 0.34]],
        [[0.41, 1.1, 0.4, 0.06, 0.34, 0.36], [0.41, 0.95, -0.35, 0.06, 0.3, 0.3], [-0.41, 1.05, 0.0, 0.06, 0.5, 0.6]]][variant];
      for (const [x, y, z, w, h, d] of spots) box(g, w, h, d, black, x, y, z);
      head.position.set(0, 1.25, -0.74);
      box(head, 0.2, 0.36, 0.36, white, 0, -0.06, 0.02, 0.3); // neck
      box(head, 0.46, 0.46, 0.46, white, 0, 0, -0.26);
      box(head, 0.4, 0.3, 0.26, pink, 0, -0.12, -0.54, 0, { taper: 0.85 }); // muzzle
      pair((s) => box(head, 0.06, 0.06, 0.03, M(0x6a3a3a), s * 0.09, -0.1, -0.675));
      box(head, 0.48, 0.2, 0.3, black, 0, 0.16, -0.3); // face patch
      eyes(head, 0.235, 0.06, -0.38, 0.07);
      pair((s) => { box(head, 0.2, 0.08, 0.12, white, s * 0.32, 0.1, -0.16, 0, { rz: -s * 0.3 }); box(head, 0.12, 0.07, 0.07, horn, s * 0.24, 0.26, -0.18, 0, { rz: s * 0.6 }); box(head, 0.06, 0.12, 0.06, horn, s * 0.3, 0.34, -0.18, 0, { rz: -s * 0.3 }); });
      tail.position.set(0, 1.3, 0.76);
      box(tail, 0.06, 0.62, 0.06, white, 0, -0.3, 0.04, 0.1); box(tail, 0.1, 0.16, 0.1, tip, 0, -0.64, 0.07);
      break;
    }
    case 'pig': {
      const pink = M(0xf0aaa4), dark = M(0xd8847e), snout = M(0xe89590), hoof = M(0x8a5a56);
      for (const [x, z] of [[-0.19, -0.34], [0.19, -0.34], [-0.19, 0.36], [0.19, 0.36]]) leg(pink, hoof, 0.16, 0.34, x, 0.38, z);
      box(g, 0.64, 0.56, 1.02, pink, 0, 0.62, 0, 0, { bevel: 0.16 });
      box(g, 0.56, 0.18, 0.8, pink, 0, 0.9, 0.04, 0, { bevel: 0.07 }); // round back
      head.position.set(0, 0.7, -0.5);
      box(head, 0.48, 0.44, 0.38, pink, 0, 0.02, -0.12, 0, { bevel: 0.1 });
      box(head, 0.28, 0.2, 0.12, snout, 0, -0.04, -0.36, 0, { bevel: 0.04 });
      pair((s) => box(head, 0.05, 0.07, 0.02, M(0x7a4440), s * 0.06, -0.04, -0.425));
      eyes(head, 0.13, 0.1, -0.31, 0.055);
      pair((s) => box(head, 0.16, 0.04, 0.18, dark, s * 0.17, 0.25, -0.2, -0.5, { rz: s * 0.4 })); // floppy ears
      tail.position.set(0, 0.78, 0.52);
      box(tail, 0.05, 0.05, 0.1, dark, 0, 0, 0.04); box(tail, 0.05, 0.1, 0.05, dark, 0, 0.05, 0.1); box(tail, 0.05, 0.05, 0.08, dark, 0, 0.1, 0.06);
      break;
    }
    case 'sheep': {
      const wool = M(rand() < 0.12 ? 0x4a403a : 0xf0ede4), skin = M(0x3d3532), hoof = M(0x1e1a18);
      for (const [x, z] of [[-0.2, -0.32], [0.2, -0.32], [-0.2, 0.34], [0.2, 0.34]]) leg(skin, hoof, 0.11, 0.5, x, 0.56, z);
      // a fleece made of overlapping puffs
      box(g, 0.78, 0.66, 1.02, wool, 0, 0.86, 0, 0, { bevel: 0.2 });
      for (const [x, y, z, s] of [[0, 1.16, -0.25, 0.46], [0, 1.18, 0.2, 0.5], [-0.3, 0.92, -0.3, 0.36], [0.3, 0.92, -0.3, 0.36], [-0.3, 0.95, 0.3, 0.38], [0.3, 0.95, 0.3, 0.38], [0, 0.92, 0.5, 0.42], [0, 0.95, -0.5, 0.4]]) box(g, s, s * 0.8, s, wool, x, y, z, 0, { bevel: s * 0.3 });
      head.position.set(0, 1.05, -0.56);
      box(head, 0.28, 0.32, 0.38, skin, 0, -0.02, -0.14, 0.15, { taper: 0.8 });
      box(head, 0.38, 0.2, 0.28, wool, 0, 0.18, -0.06, 0, { bevel: 0.08 }); // woolly cap
      eyes(head, 0.142, 0.03, -0.2, 0.05, M(0x0e0c0a));
      pair((s) => box(head, 0.16, 0.06, 0.1, skin, s * 0.21, 0.07, -0.08, 0, { rz: s * 0.35 }));
      tail.position.set(0, 0.95, 0.52);
      box(tail, 0.16, 0.22, 0.12, wool, 0, -0.08, 0.02, 0.2);
      break;
    }
    case 'chicken': {
      const white = M(rand() < 0.3 ? 0xb06a34 : 0xf7f5ee), yellow = M(0xe8a830), red = M(0xd8332a);
      for (const x of [-0.08, 0.08]) {
        const p = leg(yellow, yellow, 0.04, 0.26, x, 0.3, 0.02, { taper: 1 });
        for (const ry of [-0.5, 0, 0.5]) box(p, 0.025, 0.02, 0.1, yellow, Math.sin(ry) * 0.04, -0.26, -0.05, 0, { ry }); // toes
      }
      box(g, 0.34, 0.32, 0.46, white, 0, 0.44, 0.02, 0, { bevel: 0.1 });
      box(g, 0.28, 0.16, 0.3, white, 0, 0.34, 0.02, 0, { bevel: 0.06 }); // full chest
      pair((s) => box(g, 0.05, 0.22, 0.32, white, s * 0.18, 0.46, 0.04, 0.15)); // wings
      head.position.set(0, 0.62, -0.18);
      box(head, 0.08, 0.16, 0.08, white, 0, -0.06, 0.02); // neck
      box(head, 0.18, 0.2, 0.18, white, 0, 0.06, -0.04, 0, { bevel: 0.05 });
      box(head, 0.08, 0.05, 0.12, yellow, 0, 0.04, -0.17, 0, { taper: 0.5 });
      for (const [y, z] of [[0.18, -0.08], [0.2, -0.02], [0.18, 0.04]]) box(head, 0.035, 0.08, 0.06, red, 0, y, z); // comb
      box(head, 0.04, 0.08, 0.04, red, 0, -0.03, -0.13); // wattle
      eyes(head, 0.092, 0.08, -0.08, 0.035);
      tail.position.set(0, 0.52, 0.22);
      for (const [rx, y] of [[-0.9, 0.1], [-0.5, 0.14], [-0.2, 0.1]]) box(tail, 0.14, 0.04, 0.2, white, 0, y, 0.06, rx);
      break;
    }
    case 'deer': {
      const brown = M(0xa86b3c), light = M(0xeadfcc), dark = M(0x2b2420), antler = M(0xd9c9a3), hoof = M(0x2a2420);
      variant = rand() < 0.5 ? 1 : 0; // 1: a stag with antlers
      for (const [x, z] of [[-0.15, -0.44], [0.15, -0.44], [-0.15, 0.46], [0.15, 0.46]]) leg(brown, hoof, 0.11, 0.92, x, 0.94, z, { taper: 0.6 });
      box(g, 0.46, 0.5, 1.12, brown, 0, 1.14, 0, 0, { bevel: 0.12 });
      box(g, 0.34, 0.1, 0.8, light, 0, 0.9, 0); // pale belly
      box(g, 0.3, 0.3, 0.06, light, 0, 1.22, 0.57); // white rump
      head.position.set(0, 1.3, -0.5);
      box(head, 0.18, 0.56, 0.24, brown, 0, 0.18, -0.06, -0.4, { taper: 0.8 }); // neck
      box(head, 0.12, 0.3, 0.06, light, 0, 0.1, -0.16, -0.4); // throat
      box(head, 0.24, 0.24, 0.3, brown, 0, 0.44, -0.26, 0, { bevel: 0.06 });
      box(head, 0.16, 0.15, 0.22, brown, 0, 0.39, -0.48, 0, { taper: 0.8 }); // muzzle
      box(head, 0.1, 0.07, 0.04, dark, 0, 0.42, -0.6);
      eyes(head, 0.122, 0.48, -0.32, 0.05);
      pair((s) => box(head, 0.2, 0.06, 0.1, brown, s * 0.18, 0.58, -0.18, 0, { rz: -s * 0.5 }));
      if (variant) pair((s) => {
        box(head, 0.05, 0.3, 0.05, antler, s * 0.1, 0.72, -0.2, 0, { rz: -s * 0.25 });
        box(head, 0.04, 0.2, 0.04, antler, s * 0.2, 0.92, -0.16, 0, { rz: -s * 0.6 });
        box(head, 0.04, 0.16, 0.04, antler, s * 0.13, 0.88, -0.3, -0.6);
        box(head, 0.04, 0.14, 0.04, antler, s * 0.28, 1.02, -0.12, 0.3, { rz: -s * 0.2 });
      });
      tail.position.set(0, 1.32, 0.58);
      box(tail, 0.12, 0.2, 0.06, brown, 0, -0.06, 0.02, 0.4); box(tail, 0.1, 0.16, 0.03, light, 0, -0.07, 0.06, 0.4);
      break;
    }
    case 'rabbit': {
      const fur = M(rand() < 0.5 ? 0x9a8470 : 0xb8b0a4), white = M(0xf4f1ea), pink = M(0xe0a8a8);
      variant = fur.color;
      leg(fur, fur, 0.07, 0.12, -0.07, 0.14, -0.13, { taper: 1 }); leg(fur, fur, 0.07, 0.12, 0.07, 0.14, -0.13, { taper: 1 });
      leg(fur, fur, 0.09, 0.08, -0.1, 0.1, 0.12, { taper: 1, footD: 2.4, toe: -0.06 }); leg(fur, fur, 0.09, 0.08, 0.1, 0.1, 0.12, { taper: 1, footD: 2.4, toe: -0.06 });
      box(g, 0.26, 0.24, 0.34, fur, 0, 0.26, -0.02, 0, { bevel: 0.08 });
      pair((s) => box(g, 0.1, 0.2, 0.22, fur, s * 0.12, 0.22, 0.1, 0, { bevel: 0.06 })); // haunches
      box(g, 0.16, 0.08, 0.2, white, 0, 0.15, -0.06);
      head.position.set(0, 0.38, -0.18);
      box(head, 0.18, 0.17, 0.2, fur, 0, 0.02, -0.06, 0, { bevel: 0.05 });
      box(head, 0.1, 0.07, 0.04, white, 0, -0.02, -0.16);
      box(head, 0.035, 0.03, 0.02, pink, 0, 0.01, -0.175);
      eyes(head, 0.092, 0.05, -0.08, 0.04);
      pair((s) => { box(head, 0.06, 0.24, 0.035, fur, s * 0.05, 0.2, 0.0, 0.2, { rz: -s * 0.15 }); box(head, 0.03, 0.18, 0.01, pink, s * 0.05, 0.2, -0.02, 0.2, { rz: -s * 0.15 }); });
      tail.position.set(0, 0.3, 0.17);
      box(tail, 0.1, 0.1, 0.08, white, 0, 0, 0.02, 0, { bevel: 0.03 });
      break;
    }
    case 'wolf': {
      const grey = M(rand() < 0.2 ? 0x4a4644 : 0x77736e), light = M(0xc4c0b8), dark = M(0x2a2826), eye = M(0xf2c230);
      variant = grey.color;
      eye.emissive.set(0x6a4a00);
      for (const [x, z] of [[-0.14, -0.38], [0.14, -0.38], [-0.13, 0.4], [0.13, 0.4]]) leg(grey, dark, 0.12, 0.56, x, 0.6, z, { taper: 0.7 });
      box(g, 0.4, 0.42, 1.0, grey, 0, 0.78, 0.02, 0, { bevel: 0.1 });
      box(g, 0.48, 0.54, 0.4, grey, 0, 0.84, -0.32, 0, { bevel: 0.12 }); // deep chest and ruff
      box(g, 0.3, 0.2, 0.3, light, 0, 0.64, -0.42); // pale throat
      box(g, 0.28, 0.08, 0.6, light, 0, 0.56, 0.06);
      head.position.set(0, 0.98, -0.56);
      box(head, 0.34, 0.3, 0.32, grey, 0, 0, -0.1, 0, { bevel: 0.08 });
      box(head, 0.2, 0.16, 0.28, grey, 0, -0.04, -0.36, 0, { taper: 0.75 }); // long snout
      box(head, 0.18, 0.06, 0.24, light, 0, -0.11, -0.36);
      box(head, 0.08, 0.06, 0.05, dark, 0, -0.01, -0.5);
      pair((s) => box(head, 0.1, 0.16, 0.06, grey, s * 0.1, 0.22, -0.04, 0, { taper: 0.3, rz: -s * 0.15 }));
      eyes(head, 0.1, 0.05, -0.27, 0.05, eye, false);
      tail.position.set(0, 0.88, 0.5);
      box(tail, 0.13, 0.13, 0.5, grey, 0, -0.12, 0.2, 0.6, { taper: 1.3 }); box(tail, 0.1, 0.1, 0.12, light, 0, -0.29, 0.43, 0.6);
      break;
    }
    case 'bear':
    case 'polar_bear': {
      const polar = kind === 'polar_bear';
      const fur = M(polar ? 0xf2efe6 : rand() < 0.3 ? 0x3b2c22 : 0x5c4130), muzzle = M(polar ? 0xe4ded2 : 0x9a7a5c), dark = M(0x1c1612), claw = M(polar ? 0x3a3632 : 0xd8ccb4);
      variant = fur.color;
      for (const [x, z] of [[-0.3, -0.55], [0.3, -0.55], [-0.3, 0.56], [0.3, 0.56]]) {
        const p = leg(fur, fur, 0.3, 0.68, x, 0.74, z, { taper: 0.9, footD: 1.3, toe: -0.04 });
        for (const cx of [-0.08, 0, 0.08]) box(p, 0.04, 0.04, 0.06, claw, cx, -0.66, -0.22);
      }
      box(g, 0.96, 0.88, 1.66, fur, 0, 1.08, 0, 0, { bevel: 0.22 });
      if (!polar) box(g, 0.82, 0.3, 0.56, fur, 0, 1.52, -0.38, 0, { bevel: 0.12 }); // shoulder hump
      head.position.set(0, 1.28, -0.88);
      if (polar) box(head, 0.48, 0.48, 0.4, fur, 0, 0, 0.06, 0, { bevel: 0.12 }); // longer neck
      box(head, 0.56, 0.5, 0.48, fur, 0, 0, -0.16, 0, { bevel: 0.14 });
      box(head, 0.32, 0.26, 0.3, muzzle, 0, -0.1, -0.5, 0, { taper: 0.85, bevel: 0.07 });
      box(head, 0.14, 0.09, 0.06, dark, 0, -0.01, -0.66);
      pair((s) => box(head, 0.14, 0.14, 0.08, fur, s * 0.22, 0.28, -0.08, 0, { bevel: 0.04 }));
      eyes(head, 0.15, 0.08, -0.41, 0.06, dark);
      tail.position.set(0, 1.2, 0.84);
      box(tail, 0.14, 0.14, 0.1, fur, 0, 0, 0, 0, { bevel: 0.04 });
      break;
    }
    case 'boar': {
      const hide = M(0x4e3d33), bristle = M(0x2c221d), snout = M(0x8a6a5c), tusk = M(0xefe6d2), hoof = M(0x1e1814);
      for (const [x, z] of [[-0.19, -0.4], [0.19, -0.4], [-0.19, 0.42], [0.19, 0.42]]) leg(hide, hoof, 0.14, 0.4, x, 0.44, z);
      box(g, 0.58, 0.6, 1.12, hide, 0, 0.72, 0.04, 0, { bevel: 0.14 });
      box(g, 0.64, 0.66, 0.4, hide, 0, 0.78, -0.34, 0, { bevel: 0.14 }); // heavy shoulders
      for (let i = 0; i < 6; i++) box(g, 0.08, 0.16 - i * 0.015, 0.14, bristle, 0, 1.1 - i * 0.03, -0.45 + i * 0.16, -0.3); // ridge of bristles
      head.position.set(0, 0.8, -0.6);
      box(head, 0.44, 0.44, 0.44, hide, 0, 0, -0.14, 0, { bevel: 0.1 });
      box(head, 0.3, 0.26, 0.24, hide, 0, -0.08, -0.42, 0, { taper: 0.75 });
      box(head, 0.24, 0.18, 0.06, snout, 0, -0.1, -0.56);
      pair((s) => box(head, 0.05, 0.06, 0.02, M(0x3a2420), s * 0.05, -0.1, -0.595));
      pair((s) => { box(head, 0.05, 0.06, 0.12, tusk, s * 0.15, -0.16, -0.48); box(head, 0.045, 0.14, 0.05, tusk, s * 0.16, -0.08, -0.55, 0, { rz: s * 0.25 }); });
      eyes(head, 0.222, 0.08, -0.3, 0.05, M(0x120a06));
      pair((s) => box(head, 0.1, 0.14, 0.06, bristle, s * 0.15, 0.27, -0.06, 0, { taper: 0.4, rz: -s * 0.2 }));
      tail.position.set(0, 0.92, 0.6);
      box(tail, 0.04, 0.28, 0.04, hide, 0, -0.14, 0.02, 0.15); box(tail, 0.08, 0.1, 0.06, bristle, 0, -0.3, 0.05);
      break;
    }
    case 'camel': {
      const tan = M(0xc8a06a), dark = M(0x8a6a44), light = M(0xdcc094), hoof = M(0x5a4430);
      for (const [x, z] of [[-0.24, -0.55], [0.24, -0.55], [-0.24, 0.56], [0.24, 0.56]]) {
        const p = leg(tan, hoof, 0.16, 1.08, x, 1.12, z, { taper: 0.7, footW: 1.2, footD: 1.4 });
        box(p, 0.15, 0.12, 0.15, light, 0, -0.56, 0); // knobbly knee
      }
      box(g, 0.68, 0.64, 1.5, tan, 0, 1.38, 0, 0, { bevel: 0.16 });
      box(g, 0.56, 0.46, 0.66, tan, 0, 1.84, 0.05, 0, { taper: 0.7, bevel: 0.16 }); // the hump
      box(g, 0.3, 0.1, 0.34, tan, 0, 2.1, 0.05, 0, { bevel: 0.05 });
      head.position.set(0, 1.55, -0.72);
      box(head, 0.3, 0.3, 0.5, tan, 0, -0.02, -0.2, 0.35, { bevel: 0.08 }); // neck: down and forward...
      box(head, 0.24, 0.66, 0.26, tan, 0, 0.22, -0.5, -0.2, { taper: 0.8, bevel: 0.06 }); // ...then up
      box(head, 0.26, 0.26, 0.42, tan, 0, 0.6, -0.66, 0, { bevel: 0.07 });
      box(head, 0.22, 0.16, 0.18, light, 0, 0.52, -0.9, 0, { bevel: 0.05 }); // droopy lips
      eyes(head, 0.132, 0.68, -0.64, 0.05);
      pair((s) => box(head, 0.06, 0.1, 0.05, dark, s * 0.11, 0.77, -0.54, 0, { taper: 0.5 }));
      tail.position.set(0, 1.55, 0.76);
      box(tail, 0.06, 0.48, 0.06, tan, 0, -0.24, 0.04, 0.12); box(tail, 0.1, 0.14, 0.08, dark, 0, -0.5, 0.07);
      break;
    }
    case 'zebra': {
      const white = M(0xf0eee8), black = M(0x1e1c1c), hoof = M(0x2a2622);
      for (const [x, z] of [[-0.18, -0.5], [0.18, -0.5], [-0.18, 0.5], [0.18, 0.5]]) {
        const p = leg(white, hoof, 0.13, 0.86, x, 0.9, z, { taper: 0.65 });
        for (let i = 0; i < 3; i++) { const y = 0.16 + i * 0.18, w = 0.2 - 0.07 * (y / 0.74) + 0.008; box(p, w, 0.05, w, black, 0, -y, 0, 0, { bevel: 0 }); } // stripes round the legs
      }
      box(g, 0.56, 0.6, 1.3, white, 0, 1.14, 0, 0, { bevel: 0.06 });
      // stripes: painted down each flank and across the back, thinner toward the rump
      for (let i = 0; i < 6; i++) {
        const z = -0.5 + i * 0.2, w = 0.08 - i * 0.006, tilt = 0.1 * (i - 2.5);
        pair((s) => box(g, 0.02, 0.46, w, black, s * 0.281, 1.13, z, tilt, { bevel: 0 }));
        box(g, 0.46, 0.02, w, black, 0, 1.441, z, 0, { bevel: 0 });
      }
      head.position.set(0, 1.38, -0.6);
      box(head, 0.22, 0.56, 0.28, white, 0, 0.18, -0.1, -0.5, { taper: 0.8 }); // neck
      for (let i = 0; i < 3; i++) box(head, 0.23, 0.05, 0.3, black, 0, 0.04 + i * 0.13, -0.04 - i * 0.07, -0.5);
      box(head, 0.06, 0.5, 0.12, black, 0, 0.32, 0.06, -0.5); // upright mane
      box(head, 0.24, 0.26, 0.42, white, 0, 0.44, -0.4, 0.15, { bevel: 0.06 });
      box(head, 0.2, 0.18, 0.16, black, 0, 0.36, -0.64, 0.15, { bevel: 0.05 }); // dark muzzle
      eyes(head, 0.122, 0.5, -0.36, 0.05);
      pair((s) => box(head, 0.07, 0.18, 0.06, white, s * 0.09, 0.66, -0.26, 0, { taper: 0.4, rz: -s * 0.15 }));
      tail.position.set(0, 1.3, 0.66);
      box(tail, 0.05, 0.5, 0.05, white, 0, -0.25, 0.04, 0.12); box(tail, 0.1, 0.18, 0.08, black, 0, -0.56, 0.08);
      break;
    }
    case 'goat': {
      const coat = M(rand() < 0.5 ? 0xe8e2d4 : 0x8a7a68), horn = M(0x6a6058), beard = M(0xd8d0c0), hoof = M(0x2a2420);
      variant = coat.color;
      for (const [x, z] of [[-0.13, -0.3], [0.13, -0.3], [-0.13, 0.3], [0.13, 0.3]]) leg(coat, hoof, 0.1, 0.54, x, 0.56, z, { taper: 0.65 });
      box(g, 0.4, 0.42, 0.8, coat, 0, 0.76, 0, 0, { bevel: 0.1 });
      box(g, 0.42, 0.3, 0.3, coat, 0, 0.82, -0.28, 0, { bevel: 0.08 });
      head.position.set(0, 0.98, -0.42);
      box(head, 0.14, 0.3, 0.18, coat, 0, 0.06, 0.0, -0.3); // neck
      box(head, 0.22, 0.24, 0.3, coat, 0, 0.16, -0.14, 0.2, { bevel: 0.05 });
      box(head, 0.16, 0.14, 0.14, coat, 0, 0.06, -0.3, 0.2, { taper: 0.8 });
      box(head, 0.08, 0.16, 0.06, beard, 0, -0.06, -0.28, 0.2);
      eyes(head, 0.112, 0.2, -0.18, 0.045, M(0x6a5010));
      pair((s) => box(head, 0.14, 0.05, 0.08, coat, s * 0.16, 0.18, -0.08, 0, { rz: s * 0.3 }));
      pair((s) => { box(head, 0.06, 0.16, 0.06, horn, s * 0.07, 0.34, -0.06, 0.5); box(head, 0.05, 0.14, 0.05, horn, s * 0.08, 0.42, 0.04, 1.3); box(head, 0.04, 0.1, 0.04, horn, s * 0.08, 0.4, 0.12, 2.2); });
      tail.position.set(0, 0.92, 0.42);
      box(tail, 0.08, 0.16, 0.06, coat, 0, 0.04, 0.02, -0.6);
      break;
    }
    case 'fox': {
      const orange = M(0xe0702a), white = M(0xf4efe6), dark = M(0x2a1e18);
      for (const [x, z] of [[-0.09, -0.22], [0.09, -0.22], [-0.09, 0.22], [0.09, 0.22]]) leg(dark, dark, 0.07, 0.3, x, 0.32, z, { taper: 0.8 });
      box(g, 0.28, 0.26, 0.62, orange, 0, 0.44, 0, 0, { bevel: 0.07 });
      box(g, 0.2, 0.16, 0.2, white, 0, 0.4, -0.26); // white chest
      head.position.set(0, 0.54, -0.34);
      box(head, 0.26, 0.22, 0.22, orange, 0, 0.02, -0.06, 0, { bevel: 0.06 });
      pair((s) => box(head, 0.06, 0.08, 0.14, white, s * 0.1, -0.04, -0.1)); // white cheeks
      box(head, 0.12, 0.1, 0.18, orange, 0, -0.02, -0.24, 0, { taper: 0.6 }); // pointed snout
      box(head, 0.1, 0.04, 0.16, white, 0, -0.06, -0.24);
      box(head, 0.05, 0.04, 0.04, dark, 0, 0.01, -0.34);
      eyes(head, 0.1, 0.06, -0.15, 0.035, M(0x2a1404));
      pair((s) => { box(head, 0.09, 0.14, 0.04, orange, s * 0.08, 0.18, -0.03, 0, { taper: 0.3 }); box(head, 0.04, 0.05, 0.045, dark, s * 0.08, 0.235, -0.03); });
      tail.position.set(0, 0.48, 0.3);
      box(tail, 0.17, 0.17, 0.46, orange, 0, -0.08, 0.2, 0.45, { bevel: 0.06 }); box(tail, 0.14, 0.14, 0.12, white, 0, -0.2, 0.44, 0.45, { bevel: 0.04 }); // bushy tail, white tip
      break;
    }
    case 'parrot': {
      const which = Math.floor(rand() * 4);
      variant = which;
      const body = M([0xd8302a, 0x2a8ad8, 0x3cb83c, 0xe8c030][which]), wing = M([0x2050c0, 0xe8c030, 0xd8302a, 0x2a8ad8][which]), beak = M(0x2a2a2a), feathers = M([0xe8c030, 0x2a8ad8, 0x2a8ad8, 0x3cb83c][which]), face = M(0xf4f0e8);
      for (const x of [-0.05, 0.05]) { const p = leg(beak, beak, 0.035, 0.12, x, 0.14, 0, { taper: 1 }); box(p, 0.03, 0.02, 0.08, beak, 0, -0.12, -0.01); }
      box(g, 0.18, 0.28, 0.2, body, 0, 0.3, 0.02, 0.2, { bevel: 0.06 });
      pair((s) => { box(g, 0.04, 0.24, 0.16, body, s * 0.1, 0.32, 0.04, 0.25); box(g, 0.042, 0.12, 0.1, wing, s * 0.101, 0.24, 0.1, 0.25); });
      head.position.set(0, 0.46, -0.04);
      box(head, 0.15, 0.15, 0.16, body, 0, 0.03, -0.02, 0, { bevel: 0.04 });
      pair((s) => box(head, 0.02, 0.07, 0.07, face, s * 0.075, 0.03, -0.06));
      box(head, 0.06, 0.06, 0.06, beak, 0, 0.03, -0.12); box(head, 0.05, 0.07, 0.04, beak, 0, -0.01, -0.15, 0.3); // hooked beak
      eyes(head, 0.087, 0.04, -0.06, 0.025);
      tail.position.set(0, 0.2, 0.1);
      box(tail, 0.08, 0.03, 0.34, feathers, 0, -0.06, 0.13, 0.9, { taper: 0.6 });
      break;
    }
    case 'jaguar': {
      const coat = M(0xd8a040), spot = M(0x3a2a1a), belly = M(0xf0e2c0), eye = M(0x9ad030);
      eye.emissive.set(0x3a5a00);
      for (const [x, z] of [[-0.14, -0.4], [0.14, -0.4], [-0.14, 0.4], [0.14, 0.4]]) leg(coat, coat, 0.12, 0.48, x, 0.5, z, { taper: 0.75, footW: 1.1, footD: 1.4, toe: -0.03 });
      box(g, 0.4, 0.38, 1.05, coat, 0, 0.68, 0, 0, { bevel: 0.1 });
      box(g, 0.44, 0.42, 0.34, coat, 0, 0.72, -0.34, 0, { bevel: 0.1 }); // shoulders
      box(g, 0.32, 0.06, 0.8, belly, 0, 0.49, 0);
      // rosettes: dark rings with the coat showing in the middle
      for (const [y, z] of [[0.74, -0.3], [0.68, -0.02], [0.76, 0.18], [0.64, 0.36], [0.6, -0.2], [0.62, 0.14]]) pair((s) => {
        const zz = z + s * 0.05;
        for (const [dy, dz, w, h] of [[0.045, 0, 0.09, 0.025], [-0.045, 0, 0.09, 0.025], [0, 0.045, 0.025, 0.07], [0, -0.045, 0.025, 0.07]]) box(g, 0.012, h, w, spot, s * 0.2, y + dy, zz + dz, 0, { bevel: 0 });
      });
      for (const [x, z] of [[-0.08, -0.2], [0.07, 0.08], [-0.05, 0.3], [0.08, -0.42]]) box(g, 0.07, 0.012, 0.07, spot, x, 0.871, z, 0, { bevel: 0 });
      head.position.set(0, 0.82, -0.58);
      box(head, 0.32, 0.28, 0.3, coat, 0, 0, -0.1, 0, { bevel: 0.08 });
      box(head, 0.18, 0.14, 0.12, belly, 0, -0.07, -0.29, 0, { bevel: 0.04 });
      box(head, 0.07, 0.05, 0.03, M(0x8a4a40), 0, -0.01, -0.355);
      pair((s) => box(head, 0.09, 0.08, 0.04, coat, s * 0.11, 0.16, -0.04, 0, { bevel: 0.02 }));
      eyes(head, 0.08, 0.04, -0.255, 0.045, eye, false);
      tail.position.set(0, 0.78, 0.52);
      box(tail, 0.09, 0.09, 0.5, coat, 0, -0.12, 0.22, 0.5); box(tail, 0.08, 0.08, 0.32, coat, 0, -0.28, 0.58, -0.2); box(tail, 0.09, 0.09, 0.1, spot, 0, -0.24, 0.72, -0.2);
      break;
    }
    case 'scorpion': {
      const shell = M(0x8a5a2a), dark = M(0x4a2e14), sting = M(0x1a1a1a);
      for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
        const p = new THREE.Group(); p.position.set(side * 0.15, 0.24, -0.12 + i * 0.1); p.rotation.y = side * (i - 1.5) * -0.3;
        box(p, 0.18, 0.04, 0.04, dark, side * 0.09, 0.03, 0, 0, { rz: side * 0.5 });
        box(p, 0.04, 0.22, 0.04, dark, side * 0.2, -0.1, 0, 0, { rz: side * 0.3 });
        g.add(p); legs.push(p);
      }
      for (let i = 0; i < 4; i++) box(g, 0.34 - i * 0.03, 0.14, 0.14, i % 2 ? shell : dark, 0, 0.25, -0.12 + i * 0.12, 0, { bevel: 0.03 }); // plated back
      head.position.set(0, 0.24, -0.26);
      box(head, 0.24, 0.12, 0.14, shell, 0, 0, -0.04, 0, { bevel: 0.03 });
      eyes(head, 0.04, 0.07, -0.08, 0.03, M(0x0a0a0a), false);
      pair((s) => { box(head, 0.06, 0.06, 0.2, dark, s * 0.16, 0, -0.14, 0, { ry: -s * 0.3 }); box(head, 0.12, 0.09, 0.14, shell, s * 0.24, 0, -0.28, 0, { bevel: 0.03 }); box(head, 0.03, 0.04, 0.12, dark, s * 0.2, 0.02, -0.4); box(head, 0.03, 0.04, 0.1, dark, s * 0.28, 0.02, -0.39); });
      // a tail of segments curling up and over the back
      tail.position.set(0, 0.28, 0.32);
      let ty = 0, tz = 0;
      for (let i = 0; i < 5; i++) {
        const a = -0.2 - i * 0.55, len = 0.13;
        box(tail, 0.1 - i * 0.008, 0.1 - i * 0.008, len, shell, 0, ty + Math.sin(-a) * len / 2, tz + Math.cos(a) * len / 2, a, { bevel: 0.02 });
        ty += Math.sin(-a) * len; tz += Math.cos(a) * len;
      }
      box(tail, 0.07, 0.07, 0.09, shell, 0, ty + 0.02, tz - 0.04, 0, { bevel: 0.02 }); box(tail, 0.025, 0.08, 0.025, sting, 0, ty - 0.03, tz - 0.1, 0.8);
      break;
    }
    case 'spider': {
      const black = M(0x1d1b1e), hair = M(0x3a3236), mark = M(0x7a1a14), eye = M(0xff2a1a), fang = M(0x5a4a40);
      eye.emissive.set(0xc01000);
      box(g, 0.62, 0.46, 0.72, black, 0, 0.52, 0.34, 0.15, { bevel: 0.16 }); // abdomen
      box(g, 0.26, 0.04, 0.3, mark, 0, 0.765, 0.32, 0.15, { bevel: 0 }); box(g, 0.1, 0.04, 0.12, mark, 0, 0.75, 0.53, 0.15, { bevel: 0 });
      box(g, 0.46, 0.3, 0.42, hair, 0, 0.47, -0.16, 0, { bevel: 0.1 });
      // eight legs: each pivots at the body side, splayed out and down
      for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
        const p = new THREE.Group();
        p.position.set(side * 0.2, 0.52, -0.3 + i * 0.16);
        p.rotation.y = side * (i - 1.5) * -0.35; // fanned out from front to back
        box(p, 0.5, 0.08, 0.08, hair, side * 0.25, 0.12, 0, 0, { rz: side * 0.45 }); // up and out from the body
        box(p, 0.06, 0.72, 0.06, black, side * 0.5, -0.15, 0, 0, { rz: side * 0.25, taper: 0.7 }); // down to the ground
        g.add(p); legs.push(p);
      }
      head.position.set(0, 0.48, -0.42);
      box(head, 0.3, 0.24, 0.2, black, 0, 0, -0.04, 0, { bevel: 0.06 });
      pair((s) => box(head, 0.05, 0.12, 0.05, fang, s * 0.06, -0.12, -0.12, 0.3));
      for (const [x, y, sz] of [[-0.06, 0.06, 0.05], [0.06, 0.06, 0.05], [-0.12, 0.02, 0.035], [0.12, 0.02, 0.035], [-0.03, 0.1, 0.03], [0.03, 0.1, 0.03]]) box(head, sz, sz, 0.02, eye, x, y, -0.15);
      break;
    }
  }
  return { group: g, legs, head, tail, meshes: bakeAnimal(kind, variant, [g, head, tail, ...legs]) };
}

export function spawnAnimal(kind, x, y, z, rand) {
  const sp = SPECIES[kind];
  const model = buildAnimal(kind, rand);
  const a = {
    kind, sp, ...model, x, y, z, hp: sp.hp, facing: rand() * Math.PI * 2, angle: rand() * Math.PI * 2,
    mode: 'idle', timer: rand() * 3, kx: 0, kz: 0, phase: 0, hurtT: 0, flee: 0, aggro: 0, attackCd: 0, groundT: 0,
    side: rand() < 0.5 ? 1 : -1, stuckT: 0, calm: 0, herd: null,
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

// Animals live around the player (within ANIMAL_RANGE), where the ground is loaded; ones that end up
// much further away are taken out again, so herds keep turning up wherever you go.
const ANIMAL_RANGE = 220, ANIMAL_DROP = 380;
function findAnimalSpot(kind, home, rand, awayFromPlayer) {
  const T = terrainFns, S = WORLD.size, L = T.ledge, px = player.position.x, pz = player.position.z;
  for (let tries = 0; tries < (home === 'cave' ? 160 : 60); tries++) {
    const a = rand() * Math.PI * 2, d = (awayFromPlayer ? 50 : 0) + Math.sqrt(rand()) * (ANIMAL_RANGE - (awayFromPlayer ? 50 : 0));
    const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
    if (x < 10 || z < 10 || x > S - 10 || z > S - 10) continue;
    if (!isLoaded(x, z, 8)) continue; // terrain there isn't generated yet
    if (home === 'cave') {
      if (Math.hypot(x - L.x, z - L.z) < 40 || T.volcanoInfluence(x, z) > 0.2) continue; // not right at the start
      const g = caveFloorAt(x, z);
      if (g) return { x, y: g.point.y, z };
      continue;
    }
    if (!BIOMES[T.biomeAt(x, z)].animals.includes(kind)) continue; // each kind lives in its own biomes
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
  const spot = findAnimalSpot(kind, sp.home, rand, awayFromPlayer);
  if (!spot) return 0;
  const n = sp.herd[0] + Math.floor(rand() * (sp.herd[1] - sp.herd[0] + 1));
  let made = 0;
  const herd = { kind };
  for (let i = 0; i < n * 3 && made < n; i++) {
    const x = spot.x + (rand() - 0.5) * 8, z = spot.z + (rand() - 0.5) * 8;
    const g = sp.home === 'cave' ? groundAt(x, z, spot.y + 2.5) : groundAt(x, z);
    if (!g || g.point.y < terrainFns.waterAt(x, z) + 1 || g.face.normal.y < 0.7 || Math.abs(g.point.y - spot.y) > 4) continue;
    spawnAnimal(kind, x, g.point.y, z, rand).herd = herd;
    made++;
  }
  return made;
}

export function spawnAnimals(seed) {
  animalRand = mulberry32(seed * 17 + 11);
  const area = (Math.PI * ANIMAL_RANGE ** 2) / 256 ** 2; // populations are per 256 x 256 m, counted around you
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
  // stays out of poured water and lava deeper than a puddle (but can always walk out of a pool it is standing in)
  const deep = (x, y, z) => { const fl = fluidAt(x, y + 0.2, z); return fl && (fl.type === 'lava' || fl.top > y + 0.3); };
  if (deep(nx, gy, nz) && !deep(a.x, a.y, a.z)) return false;
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
  if (a.sp.hostile) { a.aggro = 20; a.calm = 0; } else a.flee = 6;
  if (a.hp <= 0) killAnimal(a);
}

function removeAnimal(a) {
  world.remove(a.group);
  animals.splice(animals.indexOf(a), 1);
  if (state.currentTarget?.animal === a) state.currentTarget = null;
}
function killAnimal(a) {
  removeAnimal(a);
  if (state.creative) return;
  const got = [];
  for (const [id, lo, hi] of a.sp.drops) {
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (n > 0) got.push([id, n]);
  }
  give(got);
}

export function updateAnimals(frameDt) {
  const px = player.position.x, pz = player.position.z, pfeet = player.position.y - FOOT_OFFSET;
  for (const a of [...animals]) {
    const sp = a.sp;
    const dx = px - a.x, dz = pz - a.z, dist = Math.hypot(dx, dz) || 1e-3, dy = pfeet - a.y;
    if (dist > 140) continue; // far away animals stay put
    // ones a little way off only think a few times a second (with the time saved up)
    let dt = frameDt;
    if (dist > 60) { a.lag = (a.lag || 0) + frameDt; if (a.lag < 0.15) continue; dt = a.lag; }
    a.lag = 0;
    a.timer -= dt; a.hurtT -= dt; a.attackCd -= dt; a.flee -= dt; a.aggro -= dt; a.calm -= dt;

    // burning in poured lava
    if (fluidAt(a.x, a.y + 0.2, a.z)?.type === 'lava') {
      a.burnT = (a.burnT || 0) - dt;
      if (a.burnT <= 0) { a.burnT = 0.5; hurtAnimal(a, 5, 0, 0); if (a.hp <= 0) continue; a.flee = 2; }
    }

    let wx = 0, wz = 0, speed = 0;
    // a predator that can't get to you (you're up on blocks, across water) gives up for a while
    const hunting = sp.hostile && a.calm <= 0 && !state.creative && gameState === 'playing' && Math.abs(dy) < 6 && (dist < sp.hostile || (a.aggro > 0 && dist < 30));
    if (!hunting && a.mode === 'chase') { a.mode = 'idle'; a.timer = 0; }
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
        else {
          a.mode = 'walk'; a.angle = animalRand() * Math.PI * 2; a.timer = 2 + animalRand() * 4;
          // herd animals that strayed head back toward the others
          const mates = a.herd ? animals.filter((b) => b.herd === a.herd && b !== a) : [];
          if (mates.length) {
            const cx = mates.reduce((t, b) => t + b.x, 0) / mates.length - a.x, cz = mates.reduce((t, b) => t + b.z, 0) / mates.length - a.z;
            if (Math.hypot(cx, cz) > 9) a.angle = Math.atan2(-cx, -cz) + (animalRand() - 0.5) * 0.8;
          }
        }
      }
      if (a.mode === 'walk') { wx = -Math.sin(a.angle); wz = -Math.cos(a.angle); speed = sp.walk; }
      else a.mode = 'idle';
    }

    // move (plus knockback), steering around things in the way
    const decay = Math.exp(-6 * dt);
    a.kx *= decay; a.kz *= decay;
    let mx = (wx * speed + a.kx) * dt, mz = (wz * speed + a.kz) * dt;
    // keep a little apart from other animals instead of walking through them
    if (speed) for (const b of animals) {
      if (b === a) continue;
      const ox = a.x - b.x, oz = a.z - b.z, gap = sp.r + b.sp.r;
      if (Math.abs(ox) > gap || Math.abs(oz) > gap || Math.abs(a.y - b.y) > 2) continue;
      const d = Math.hypot(ox, oz) || 0.01;
      if (d < gap) { mx += (ox / d) * (gap - d) * Math.min(1, dt * 4); mz += (oz / d) * (gap - d) * Math.min(1, dt * 4); }
    }
    let moved = 0;
    if (mx || mz) {
      if (tryMoveAnimal(a, mx, mz)) moved = Math.hypot(mx, mz);
      else {
        // blocked: steer around it, sticking to one side so it doesn't jitter back and forth
        let ok = false;
        for (const turn of [0.7, 1.4, 2.1, -0.7, -1.4, -2.1]) {
          const t = turn * a.side, c = Math.cos(t), s = Math.sin(t);
          if (tryMoveAnimal(a, mx * c - mz * s, mx * s + mz * c)) { ok = true; moved = Math.hypot(mx, mz); wx = (mx * c - mz * s); wz = (mx * s + mz * c); if (turn < 0) a.side = -a.side; break; }
        }
        if (!ok && a.mode === 'walk') { a.angle += Math.PI * (0.5 + animalRand()); a.timer = 1 + animalRand() * 2; }
        if (!ok && a.mode === 'flee') a.side = -a.side;
      }
    }
    // a chasing predator that makes no headway toward you for a few seconds gives up for a while
    if (a.mode === 'chase') {
      if (a.closest === undefined || dist < a.closest - 0.3 || (dist < 1.4 + sp.r && Math.abs(dy) < 1.8)) { a.closest = dist; a.stuckT = 0; }
      else if ((a.stuckT += dt) > 5) { a.calm = 8; a.aggro = 0; a.stuckT = 0; a.closest = undefined; }
    } else a.closest = undefined;
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
    // tails swish now and then (faster when running)
    a.tailT = (a.tailT || 0) + dt * (1.5 + Math.min(3, hs));
    a.tail.rotation.y = Math.sin(a.tailT * 2.2) * (0.15 + 0.2 * Math.max(0, Math.sin(a.tailT * 0.37)));
    const hop = sp.hop && hs > 0.2 ? Math.abs(Math.sin(a.phase)) * 0.25 : 0;
    a.group.position.set(a.x, a.y + hop, a.z);
    a.group.rotation.y = a.facing;
    const mat = a.hurtT > 0 ? hurtMat : animalMat;
    if (a.meshes[0].material !== mat) for (const m of a.meshes) m.material = mat;
  }

  // top populations back up now and then, out of sight (quickly while the world is still filling up)
  animalRespawnTimer -= frameDt;
  if (animalRespawnTimer <= 0) {
    const want = Object.values(population).reduce((a, b) => a + b, 0);
    animalRespawnTimer = animals.length < want * 0.7 ? 1.5 : 20;
    // animals left far behind make room for new ones near you
    for (const a of [...animals]) if (Math.hypot(a.x - player.position.x, a.z - player.position.z) > ANIMAL_DROP && a.aggro <= 0) removeAnimal(a);
    // top up the kind that is furthest below its population (every kind gets its turn, so a kind
    // that can't find a spot right now doesn't hold the others up)
    const short = Object.keys(SPECIES).map((k) => [k, animals.filter((a) => a.kind === k).length / population[k]]).filter(([, f]) => f < 1).sort((p, q) => p[1] - q[1]);
    for (const [kind] of short.slice(0, 3)) if (spawnHerd(kind, animalRand, true)) break;
  }
}
