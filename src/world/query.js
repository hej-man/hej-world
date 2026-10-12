import * as THREE from 'three';
import { WORLD } from '../config.js';
import { CHUNK, buildChunk, chunkCount, chunks, chunksIn, colliders, editedMat, terrainField, terrainFns } from './world.js';
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
// Terrain editing: dig (carve a sphere out of the density field) or add ground (fill one in),
// then rebuild only the chunks that changed.
// ---------------------------------------------------------------------------
const gridIndexAt = (x, y, z) => {
  const { nx, ny, nz } = terrainField, vx = WORLD.voxel;
  const ix = Math.round(x / vx), iy = Math.round(y / vx), iz = Math.round(z / vx);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return -1;
  return ix + nx * (iy + ny * iz);
};
export function editedMaterialAt(x, y, z) {
  if (!editedMat.size) return null;
  return editedMat.get(gridIndexAt(x, y, z)) || null;
}

// What the natural ground is made of at a point (used for drops and to colour dug ground).
// Rock gives its ore or the kind of stone; the top few metres depend on the biome.
export function naturalMaterial(x, y, z, ny = 1) {
  const T = terrainFns;
  if (T.volcanoInfluence(x, z) > 0.3) return 'basalt';
  const surf = T.surfaceHeight(x, z), b = T.biomeAt(x, z);
  const rock = () => T.oreKind(x, y, z)?.[0] || (b === 'mesa' && y > surf - 14 ? 'terracotta' : b === 'desert' && y > surf - 14 ? 'sandstone' : T.stoneAt(x, y, z));
  if (y < surf - 3.5 || y > 72 || ny < 0.5) return rock();
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

// Returns how many grid points flipped between ground and air.
export function editTerrain(center, radius, add, material = 'dirt') {
  const { field, nx, ny, nz } = terrainField, vx = WORLD.voxel;
  const lo = (v, n) => Math.max(1, Math.ceil((v - radius - 2) / vx)), hi = (v, n) => Math.min(n - 2, Math.floor((v + radius + 2) / vx));
  let flipped = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let iz = lo(center.z, nz); iz <= hi(center.z, nz); iz++)
  for (let iy = Math.max(add ? 1 : 3, lo(center.y, ny)); iy <= hi(center.y, ny); iy++)
  for (let ix = lo(center.x, nx); ix <= hi(center.x, nx); ix++) {
    const x = ix * vx, y = iy * vx, z = iz * vx;
    const d = Math.hypot(x - center.x, y - center.y, z - center.z);
    const idx = ix + nx * (iy + ny * iz);
    const before = field[idx];
    if (add) {
      if (d > radius) continue;
      field[idx] = Math.max(before, radius - d);
      if (before <= 0 && field[idx] > 0) { flipped++; editedMat.set(idx, material); }
    } else {
      if (d <= radius) {
        field[idx] = Math.min(before, d - radius);
        if (before > 0 && field[idx] <= 0) flipped++;
      }
      // remember what the newly exposed ground around the hole is made of
      if (d <= radius + vx * 1.2 && field[idx] > 0 && !editedMat.has(idx)) editedMat.set(idx, naturalMaterial(x, y, z));
    }
    minX = Math.min(minX, ix); maxX = Math.max(maxX, ix); minZ = Math.min(minZ, iz); maxZ = Math.max(maxZ, iz);
  }
  if (minX === Infinity) return 0;
  invalidateGrass(minX * vx, maxX * vx, minZ * vx, maxZ * vx);
  // a changed grid point affects the faces owned by its neighbours too
  const i0 = Math.max(0, Math.floor((minX - 1) / CHUNK)), i1 = Math.min(chunkCount - 1, Math.floor((maxX + 1) / CHUNK));
  const j0 = Math.max(0, Math.floor((minZ - 1) / CHUNK)), j1 = Math.min(chunkCount - 1, Math.floor((maxZ + 1) / CHUNK));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (chunks[i + chunkCount * j].stage >= 3) buildChunk(i, j);
  return flipped;
}
