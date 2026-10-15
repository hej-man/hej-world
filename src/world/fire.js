import * as THREE from 'three';
import { state } from '../state.js';
import { BLOCKS, blockKey, blocks, removeBlock } from './blocks.js';
import { fluids } from './fluids.js';
import { CELL, addTarget, cellKey, gridRemove, obstacleGrid, targetGrid, world } from './world.js';
import { hiddenMatrix } from './felling.js';
import { player } from '../player/character.js';
import { weather } from '../effects/weather.js';

// ---------------------------------------------------------------------------
// Fire. Trees and wooden or leafy blocks burn: lava poured next to them sets them alight, so does a
// campfire built right under a tree or against wooden blocks, and so does a fire starter. A burning
// tree flames for a while and is gone; a burning block too. Fire spreads to trees and wooden blocks
// close by (not in the rain), and standing in it sets you on fire. A tree that burns down leaves a
// grey pile of ash around a charred stump; break it to scoop up the ash (and maybe a lump of coal).
// ---------------------------------------------------------------------------
const fires = [];             // { tree | key, spots: [[x, y, z, r]], t, life, group }
const burningTrees = new Set(), burningBlocks = new Set();
const MAX_FIRES = 40;         // so a dry forest can't burn away the whole map at once
const flameGeo = new THREE.ConeGeometry(0.35, 1.1, 6).translate(0, 0.45, 0);
const flameMats = [0xffb040, 0xff7020, 0xffd060].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false }));

export const flammable = (type) => BLOCKS[type] && (BLOCKS[type].mat === 'wood' || BLOCKS[type].mat === 'plant') && !BLOCKS[type].station;

function flames(spots) {
  const g = new THREE.Group();
  let n = 0;
  for (const [x, y, z, r] of spots) {
    const k = Math.max(2, Math.round(r * 3));
    for (let i = 0; i < k; i++, n++) {
      const m = new THREE.Mesh(flameGeo, flameMats[n % 3]);
      const a = (i / k) * Math.PI * 2 + n, d = r * (0.3 + 0.6 * ((n * 0.37) % 1));
      m.position.set(x + Math.cos(a) * d, y - r * 0.3 + ((n * 0.61) % 1) * r * 0.6, z + Math.sin(a) * d);
      m.userData.base = 0.6 + ((n * 0.53) % 1) * 0.8;
      g.add(m);
    }
  }
  world.add(g);
  return g;
}

// Sets a tree (its target) alight. Returns whether it caught.
export function igniteTree(tg) {
  if (burningTrees.has(tg) || fires.length >= MAX_FIRES) return false;
  burningTrees.add(tg);
  fires.push({ tree: tg, spots: tg.spheres, t: 0, life: 14 + Math.random() * 8, group: flames(tg.spheres) });
  return true;
}
// Sets a placed block alight, if it burns.
export function igniteBlock(key) {
  const b = blocks.get(key);
  if (!b || !flammable(b.type) || burningBlocks.has(key) || fires.length >= MAX_FIRES) return false;
  burningBlocks.add(key);
  const spots = [[b.x + 0.5, b.y + 0.6, b.z + 0.5, 0.5]];
  fires.push({ key, spots, t: 0, life: 8 + Math.random() * 5, group: flames(spots) });
  return true;
}

// Ash piles: a flat mound of grey ash, a black stump and a few charred bits, sized to the tree.
const ashes = [];
const ashMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 1 });
const charMat = new THREE.MeshStandardMaterial({ color: 0x1c1816, roughness: 0.9 });
const moundGeo = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const stumpGeo = new THREE.CylinderGeometry(0.16, 0.24, 0.5, 7).translate(0, 0.25, 0);
const bitGeo = new THREE.BoxGeometry(0.5, 0.09, 0.11);
function addAsh(tg) {
  const size = Math.min(1.6, 0.7 + (tg.scale || 1) * 0.45), g = new THREE.Group();
  const mound = new THREE.Mesh(moundGeo, ashMat);
  mound.scale.set(size, 0.16 * size, size * 0.9);
  mound.receiveShadow = true;
  g.add(mound, new THREE.Mesh(stumpGeo, charMat));
  for (let i = 0; i < 5; i++) {
    const bit = new THREE.Mesh(bitGeo, charMat), a = i * 2.4 + tg.x, d = size * (0.35 + ((i * 0.37) % 0.5));
    bit.position.set(Math.cos(a) * d, 0.06 * size, Math.sin(a) * d);
    bit.rotation.set(0, a * 1.7, 0.15);
    g.add(bit);
  }
  g.position.set(tg.x, tg.y - 0.05, tg.z);
  world.add(g);
  const ash = { kind: 'ash', x: tg.x, y: tg.y, z: tg.z, group: g, spheres: [[tg.x, tg.y + 0.1, tg.z, size * 0.75]] };
  ashes.push(ash);
  addTarget(ash);
}
// Scoops up an ash pile (interaction.js gives what's in it).
export function removeAsh(ash) {
  world.remove(ash.group);
  const i = ashes.indexOf(ash);
  if (i >= 0) ashes.splice(i, 1);
}

function burnOut(f) {
  world.remove(f.group);
  if (f.tree) {
    burningTrees.delete(f.tree);
    for (const [mesh, i] of f.tree.parts) { mesh.setMatrixAt(i, hiddenMatrix); mesh.instanceMatrix.needsUpdate = true; }
    if (f.tree.obstacle) gridRemove(obstacleGrid, f.tree.obstacle);
    // only a tree still standing leaves ash where it stood (one knocked down meanwhile is gone)
    if ((targetGrid.get(cellKey(Math.floor(f.tree.x / CELL), Math.floor(f.tree.z / CELL))) || []).includes(f.tree)) addAsh(f.tree);
    gridRemove(targetGrid, f.tree);
  } else {
    burningBlocks.delete(f.key);
    if (blocks.has(f.key)) removeBlock(f.key);
  }
}

// trees whose trunk is within `r` (sideways) of a point, and not far above or below it
function treesNear(x, y, z, r, out = []) {
  const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL), d0 = Math.floor((z - r) / CELL), d1 = Math.floor((z + r) / CELL);
  for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
    for (const tg of targetGrid.get(cellKey(i, j)) || []) {
      if (tg.kind === 'tree' && Math.hypot(tg.x - x, tg.z - z) < r && y > tg.y - 3 && y < tg.y + 12) out.push(tg);
    }
  }
  return out;
}
// the flammable blocks in the 3 x 3 x 3 cells around a cell
function blocksNear(x, y, z, out = []) {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const k = blockKey(x + dx, y + dy, z + dz), b = blocks.get(k);
    if (b && flammable(b.type)) out.push(k);
  }
  return out;
}

let tick = 0;
export function updateFire(dt) {
  const rain = weather.rain > 0.3;
  // flames flicker; fires burn down (faster in the rain) and spread
  for (let k = fires.length - 1; k >= 0; k--) {
    const f = fires[k];
    f.t += dt * (rain ? 3 : 1);
    const fade = Math.min(1, f.t / 1.5, (f.life - f.t) / 2);
    f.group.children.forEach((m, i) => {
      const s = Math.max(0.01, fade * m.userData.base * (0.8 + 0.25 * Math.sin(state.gameTime * 9 + i * 1.7)));
      m.scale.set(s, s * (1 + 0.3 * Math.sin(state.gameTime * 13 + i)), s);
    });
    if (f.t >= f.life) { burnOut(f); fires.splice(k, 1); }
  }
  // standing in the flames sets you on fire
  const p = player.position;
  for (const f of fires) for (const [x, y, z, r] of f.spots) {
    if (Math.hypot(p.x - x, p.y - 0.5 - y, p.z - z) < r + 0.6) state.burning = Math.max(state.burning, 1.5);
  }
  tick += dt;
  if (tick < 1) return;
  tick = 0;
  // once a second: spreading, and what lava and campfires set alight
  if (!rain) for (const f of [...fires]) {
    if (f.t < 3) continue;
    const [x, y, z] = f.spots[0];
    for (const tg of treesNear(x, y, z, 5.5)) if (Math.random() < 0.1) igniteTree(tg);
    for (const k of blocksNear(Math.floor(x), Math.floor(y), Math.floor(z))) if (Math.random() < 0.25) igniteBlock(k);
  }
  for (const c of fluids.values()) {
    if (c.type !== 'lava') continue;
    for (const tg of treesNear(c.x + 0.5, c.y, c.z + 0.5, 3)) if (Math.random() < 0.5) igniteTree(tg);
    for (const k of blocksNear(c.x, c.y, c.z)) if (Math.random() < 0.5) igniteBlock(k);
  }
  if (rain) return;
  for (const b of blocks.values()) {
    if (b.type !== 'campfire') continue;
    // a campfire right next to a trunk or under the branches, or against wood, catches it sometimes
    for (const tg of treesNear(b.x + 0.5, b.y, b.z + 0.5, 2.4)) if (Math.random() < 0.08) igniteTree(tg);
    for (const k of blocksNear(b.x, b.y, b.z)) if (Math.random() < 0.06) igniteBlock(k);
  }
}

export const firesBurning = () => fires.length;
export function clearFire() {
  for (const f of fires) world.remove(f.group);
  for (const a of ashes) world.remove(a.group);
  fires.length = 0; ashes.length = 0; burningTrees.clear(); burningBlocks.clear();
}
