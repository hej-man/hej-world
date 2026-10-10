import * as THREE from 'three';
import { WORLD } from '../config.js';
import { sampleField } from '../terrain/material.js';
import { BLOCKS, blockKey, blocks, placeBlock } from './blocks.js';
import { terrainFns, world } from './world.js';

// ---------------------------------------------------------------------------
// Flowing water and lava on the 1 m block grid. Each cell has a level from 1 to 8; a source (from
// a bucket, or the sea/a lake running into a hole you dug) stays at 8. Fluid falls straight down
// when it can, and otherwise spreads sideways, losing level with each cell (lava spreads less and
// moves slower). A cell no longer fed from above or from a higher neighbour drains away. Water
// touching lava turns the lava cell to stone.
// ---------------------------------------------------------------------------
export const FLUIDS = {
  water: { drop: 1, every: 0.2 },
  lava: { drop: 2, every: 0.9 },
};
const MAX_CELLS = 6000;
export const fluids = new Map();   // "x,y,z" -> { type, level, src, x, y, z }
const active = { water: new Set(), lava: new Set() }, dirty = { water: false, lava: false }, timer = { water: 0, lava: 0 };
const SIDES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

export function resetFluids() {
  fluids.clear();
  for (const t in active) { active[t].clear(); dirty[t] = false; timer[t] = 0; delete meshes[t]; } // the meshes went with the old world
}

// Is a cell closed to fluid: a placed block (campfires let it through), the ground, or off the map?
export function cellSolid(x, y, z) {
  if (x < 1 || z < 1 || y < 1 || x > WORLD.size - 2 || z > WORLD.size - 2 || y > WORLD.height - 2) return true;
  const b = blocks.get(blockKey(x, y, z));
  if (b) return BLOCKS[b.type].solid !== false;
  return sampleField(x + 0.5, y + 0.5, z + 0.5) > 0;
}

// Marks a cell and its six neighbours to be looked at on the next update.
export function wake(x, y, z) {
  for (const [dx, dy, dz] of [[0, 0, 0], [0, 1, 0], [0, -1, 0], ...SIDES]) {
    const f = fluids.get(blockKey(x + dx, y + dy, z + dz));
    if (f) active[f.type].add(blockKey(f.x, f.y, f.z));
  }
}
// Wakes every fluid cell in a box around a point (after digging or breaking something).
export function wakeArea(cx, cy, cz, r) {
  for (let x = Math.floor(cx - r); x <= Math.floor(cx + r); x++)
  for (let y = Math.floor(cy - r); y <= Math.floor(cy + r); y++)
  for (let z = Math.floor(cz - r); z <= Math.floor(cz + r); z++) wake(x, y, z);
}

function setCell(type, x, y, z, level, src = false) {
  const key = blockKey(x, y, z), old = fluids.get(key);
  if (!old && fluids.size >= MAX_CELLS) return false;
  if (old && old.type !== type) dirty[old.type] = true;
  fluids.set(key, { type, level, src, x, y, z });
  dirty[type] = true;
  wake(x, y, z);
  return true;
}
export function removeFluid(x, y, z) {
  const key = blockKey(x, y, z), f = fluids.get(key);
  if (!f) return null;
  fluids.delete(key);
  dirty[f.type] = true;
  wake(x, y, z);
  return f;
}
export const addSource = (type, x, y, z) => !cellSolid(x, y, z) && setCell(type, x, y, z, 8, true);

// Water and lava meeting: the lava cell hardens into stone.
function harden(lava) {
  removeFluid(lava.x, lava.y, lava.z);
  placeBlock('stone', lava.x, lava.y, lava.z);
}

// Tries to move fluid into a cell; returns whether it could.
function flowInto(type, x, y, z, level) {
  if (level <= 0 || cellSolid(x, y, z)) return false;
  const there = fluids.get(blockKey(x, y, z));
  if (there && there.type !== type) {
    if (there.type === 'lava') harden(there); // water poured onto lava; lava reaching water hardens on its own update
    return false;
  }
  if (there && (there.src || there.level >= level)) return false;
  return setCell(type, x, y, z, level);
}

function step(type) {
  const { drop } = FLUIDS[type], list = [...active[type]];
  active[type].clear();
  for (const key of list) {
    const f = fluids.get(key);
    if (!f || f.type !== type) continue;
    const { x, y, z } = f;
    // lava next to water hardens
    if (type === 'lava' && [[0, 1, 0], [0, -1, 0], ...SIDES].some(([dx, dy, dz]) => fluids.get(blockKey(x + dx, y + dy, z + dz))?.type === 'water')) { harden(f); continue; }
    if (!f.src) {
      // how much fluid still reaches this cell: all of it from above, less from the side
      const above = fluids.get(blockKey(x, y + 1, z));
      let feed = above?.type === type ? 8 : 0;
      for (const [dx, , dz] of SIDES) {
        const n = fluids.get(blockKey(x + dx, y, z + dz));
        if (n?.type === type && n.level - drop > feed) {
          // fluid falling down a column doesn't also spread sideways from mid-air
          const under = n.src ? null : fluids.get(blockKey(n.x, y - 1, n.z));
          if (!under || under.type !== type || cellSolid(n.x, y - 1, n.z)) feed = n.level - drop;
        }
      }
      if (feed <= 0) { removeFluid(x, y, z); continue; }
      if (feed !== f.level) { f.level = feed; dirty[type] = true; wake(x, y, z); }
    }
    // fall if it can, otherwise spread sideways
    if (!cellSolid(x, y - 1, z)) {
      const below = fluids.get(blockKey(x, y - 1, z));
      if (!below || below.type !== type) { flowInto(type, x, y - 1, z, 8); continue; }
      if (!below.src && below.level < 8) { below.level = 8; dirty[type] = true; wake(x, y - 1, z); }
      continue;
    }
    for (const [dx, , dz] of SIDES) flowInto(type, x + dx, y, z + dz, f.level - drop);
  }
}

// The sea or a lake running into ground you dug next to it: every open cell below the water level
// in the dug area that touches open natural water becomes a water source.
export function floodFromNature(cx, cy, cz, r) {
  const T = terrainFns;
  for (let x = Math.floor(cx - r); x <= Math.floor(cx + r); x++)
  for (let z = Math.floor(cz - r); z <= Math.floor(cz + r); z++) {
    const level = T.waterAt(x + 0.5, z + 0.5);
    if (level < 0) continue;
    for (let y = Math.floor(cy - r); y <= Math.floor(cy + r); y++) {
      if (y + 0.5 > level || cellSolid(x, y, z) || fluids.has(blockKey(x, y, z))) continue;
      const open = SIDES.some(([dx, , dz]) => {
        const nx = x + dx, nz = z + dz;
        return !cellSolid(nx, y, nz) && T.surfaceHeight(nx + 0.5, nz + 0.5) < y + 0.5 && T.waterAt(nx + 0.5, nz + 0.5) > y + 0.5;
      });
      if (open) setCell('water', x, y, z, 8, true);
    }
  }
}

// The fluid in the cell holding a point, with the height of its surface (top of the column).
export function fluidAt(px, py, pz) {
  const x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
  const f = fluids.get(blockKey(x, y, z));
  if (!f) return null;
  let top = y, k = 0;
  while (k++ < 8 && fluids.get(blockKey(x, top + 1, z))?.type === f.type) top++;
  const t = fluids.get(blockKey(x, top, z));
  return { type: f.type, top: top + cellHeight(t) };
}
const cellHeight = (f) => (fluids.get(blockKey(f.x, f.y + 1, f.z))?.type === f.type ? 1 : f.level === 8 ? 0.9 : 0.12 + (f.level / 8) * 0.7);

// The first fluid cell along a ray (for scooping it up with a bucket).
export function fluidRay(o, d, far) {
  for (let t = 0.3; t < far; t += 0.1) {
    const f = fluids.get(blockKey(Math.floor(o.x + d.x * t), Math.floor(o.y + d.y * t), Math.floor(o.z + d.z * t)));
    if (f) return { ...f, t };
  }
  return null;
}

// Drawing: one instanced box per cell, as tall as its level
const meshes = {};
const fluidGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
function fluidMesh(type) {
  if (meshes[type]) return meshes[type];
  const mat = type === 'water'
    ? new THREE.MeshStandardMaterial({ color: 0x2b7fb2, roughness: 0.08, transparent: true, opacity: 0.62, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff4a10, emissiveIntensity: 2.4, roughness: 0.7 });
  const m = new THREE.InstancedMesh(fluidGeo, mat, MAX_CELLS);
  m.count = 0; m.frustumCulled = false; m.renderOrder = type === 'water' ? 2 : 0;
  m.receiveShadow = type === 'water';
  world.add(m);
  return (meshes[type] = m);
}
const _m = new THREE.Matrix4(), _c = new THREE.Color();
function redraw(type) {
  const m = fluidMesh(type);
  let i = 0;
  for (const f of fluids.values()) {
    if (f.type !== type) continue;
    _m.makeScale(1, cellHeight(f), 1).setPosition(f.x, f.y, f.z);
    m.setMatrixAt(i, _m);
    m.setColorAt(i, _c.setScalar(type === 'lava' ? 0.85 + ((f.x * 7 + f.z * 3 + f.y) % 5) * 0.04 : 1));
    i++;
  }
  m.count = i;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

export function updateFluids(dt, time) {
  for (const type in FLUIDS) {
    timer[type] += dt;
    if (timer[type] >= FLUIDS[type].every) { timer[type] = 0; if (active[type].size) step(type); }
    if (dirty[type]) { dirty[type] = false; redraw(type); }
  }
  if (meshes.lava) meshes.lava.material.emissiveIntensity = 2.2 + Math.sin(time * 2.3) * 0.3;
}
