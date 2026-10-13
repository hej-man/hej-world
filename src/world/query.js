import * as THREE from 'three';
import { WORLD } from '../config.js';
import { CHUNK, buildChunk, chunkCount, chunks, chunksIn, colliders, terrainFns } from './world.js';
import { cellIndex, cellMat, setCell, slopeDir, solidCell } from '../terrain/voxels.js';
import { fieldNormal } from '../terrain/material.js';
import { invalidateGrass } from './grass.js';

export const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const DOWN = new THREE.Vector3(0, -1, 0);
const _rayO = new THREE.Vector3();

export function groundAt(x, z, fromY = WORLD.height + 5) {
  raycaster.set(_rayO.set(x, fromY, z), DOWN);
  raycaster.near = 0;
  raycaster.far = fromY + 10;
  return raycaster.intersectObjects(chunksIn(x, x, z, z), false)[0] || null;
}

// First terrain hit along a ray, or null.
export function raycastTerrain(origin, dir, near, far) {
  raycaster.set(origin, dir);
  raycaster.near = near; raycaster.far = far;
  const hit = raycaster.intersectObjects(colliders, false)[0] || null;
  raycaster.near = 0;
  return hit;
}

// ---------------------------------------------------------------------------
// Terrain editing: the ground is 1 m blocks (voxels.js); digging takes out whole cells and the
// chunks around them are rebuilt.
// ---------------------------------------------------------------------------
export function editedMaterialAt(x, y, z) {
  if (!cellMat.size) return null;
  return cellMat.get(cellIndex(Math.floor(x), Math.floor(y), Math.floor(z))) || null;
}
// What the untouched ground of a cell is made of (steep ground is bare rock, like it looks).
const _sn = new THREE.Vector3();
const natural = (x, y, z) => naturalMaterial(x + 0.5, y + 0.5, z + 0.5, fieldNormal(x + 0.5, y + 0.5, z + 0.5, _sn).y);
// What a ground cell is made of: what it was given, or what the ground there naturally is.
export const cellMaterial = (x, y, z) => editedMaterialAt(x + 0.5, y + 0.5, z + 0.5) || natural(x, y, z);
// The ground cell a ray hit on the terrain: the block behind the face, or the slope it hit.
export function hitCell(point, normal) {
  const x = Math.floor(point.x - normal.x * 0.01), y = Math.floor(point.y - normal.y * 0.01), z = Math.floor(point.z - normal.z * 0.01);
  if (solidCell(x, y, z) || slopeDir(x, y, z) >= 0) return [x, y, z];
  return [Math.floor(point.x - normal.x * 0.5), Math.floor(point.y - normal.y * 0.5), Math.floor(point.z - normal.z * 0.5)];
}

// What the natural ground is made of at a point (used for drops and to colour dug ground).
// Rock gives its ore or the kind of stone; the top few metres depend on the biome.
export function naturalMaterial(x, y, z, ny = 1) {
  const T = terrainFns;
  if (T.volcanoInfluence(x, z) > 0.3) return 'basalt';
  const surf = T.surfaceHeight(x, z), b = T.biomeAt(x, z);
  const rock = () => T.oreKind(x, y, z)?.[0] || (b === 'mesa' && y > surf - 14 ? 'terracotta' : b === 'desert' && y > surf - 14 ? 'sandstone' : T.stoneAt(x, y, z));
  if (y < surf - 3.5 || y > WORLD.lift + 72 || ny < 0.5) return rock();
  if (y < T.baseWaterAt(x, z) + 1.8) return T.lakeAt(x, z) && y < T.baseWaterAt(x, z) ? 'clay' : 'sand';
  switch (b) {
    case 'desert': return y > surf - 2.5 ? 'sand' : 'sandstone';
    case 'mesa': return y > surf - 1.5 ? 'red_sand' : 'terracotta';
    case 'snowy_plains': case 'ice_spikes': case 'snowy_taiga': return y > surf - 1.2 ? 'snow' : 'dirt';
    case 'taiga': case 'redwood_forest': return y > surf - 1.2 ? 'podzol' : 'dirt';
    case 'savanna': return y > surf - 1.2 && T.noise2(x * 0.1, z * 0.1) > 0.3 ? 'gravel' : 'dirt';
  }
  return 'dirt';
}

// Rebuilds the chunks whose blocks or slopes a change to cells x0..x1, z0..z1 can affect.
function rebuildAround(x0, x1, z0, z1) {
  const w = WORLD.voxel * CHUNK;
  invalidateGrass(x0 - 1, x1 + 2, z0 - 1, z1 + 2);
  const i0 = Math.max(0, Math.floor((x0 - 2) / w)), i1 = Math.min(chunkCount - 1, Math.floor((x1 + 2) / w));
  const j0 = Math.max(0, Math.floor((z0 - 2) / w)), j1 = Math.min(chunkCount - 1, Math.floor((z1 + 2) / w));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (chunks[i + chunkCount * j].stage >= 3) buildChunk(i, j);
}
// The ground around a cell that was just opened up keeps showing what it's made of.
function remember(x, y, z) {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const k = cellIndex(x + dx, y + dy, z + dz);
    if (!cellMat.has(k) && solidCell(x + dx, y + dy, z + dz)) cellMat.set(k, natural(x + dx, y + dy, z + dz));
  }
}
// Digs out (or fills in, with `material`) one 1 m cell of ground. Returns whether it changed.
export function editCell(x, y, z, ground = false, material = 'dirt') {
  if (!ground) { const k = cellIndex(x, y, z); if (!cellMat.has(k)) cellMat.set(k, natural(x, y, z)); }
  if (!setCell(x, y, z, ground)) return false;
  if (ground) cellMat.set(cellIndex(x, y, z), material); else remember(x, y, z);
  rebuildAround(x, x, z, z);
  return true;
}
// Takes the terrain slope out of a cell that a block is placed in: its sides would show through
// the block's sides, flickering, where both lie in the same plane.
export function clearSlope(x, y, z) {
  if (slopeDir(x, y, z) < 0 || !setCell(x, y, z, false)) return;
  rebuildAround(x, x, z, z);
}
// Digs out (or fills in) every cell whose centre is within `radius` of a point, in one rebuild.
// Returns how many cells changed.
export function editTerrain(center, radius, add, material = 'dirt') {
  let changed = 0;
  const r = Math.ceil(radius), cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
  for (let z = cz - r; z <= cz + r; z++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y, z + 0.5 - center.z) > radius) continue;
    if (!add) { const k = cellIndex(x, y, z); if (!cellMat.has(k) && solidCell(x, y, z)) cellMat.set(k, natural(x, y, z)); }
    if (!setCell(x, y, z, add)) continue;
    changed++;
    if (add) cellMat.set(cellIndex(x, y, z), material); else remember(x, y, z);
  }
  if (changed) rebuildAround(cx - r, cx + r, cz - r, cz + r);
  return changed;
}
