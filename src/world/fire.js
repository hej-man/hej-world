import * as THREE from 'three';
import { state } from '../state.js';
import { BLOCKS, blockKey, blocks, removeBlock } from './blocks.js';
import { fluids } from './fluids.js';
import { CELL, cellKey, gridRemove, obstacleGrid, targetGrid, world } from './world.js';
import { hiddenMatrix } from './felling.js';
import { player } from '../player/character.js';
import { weather } from '../effects/weather.js';

// ---------------------------------------------------------------------------
// Fire. Trees and wooden or leafy blocks burn: lava poured next to them sets them alight, so does a
// campfire built right under a tree or against wooden blocks, and so does a fire starter. A burning
// tree flames for a while and is gone; a burning block too. Fire spreads to trees and wooden blocks
// close by (not in the rain), and standing in it sets you on fire.
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

function burnOut(f) {
  world.remove(f.group);
  if (f.tree) {
    burningTrees.delete(f.tree);
    for (const [mesh, i] of f.tree.parts) { mesh.setMatrixAt(i, hiddenMatrix); mesh.instanceMatrix.needsUpdate = true; }
    if (f.tree.obstacle) gridRemove(obstacleGrid, f.tree.obstacle);
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
  fires.length = 0; burningTrees.clear(); burningBlocks.clear();
}
