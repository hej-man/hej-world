import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createDensityField, createTerrainFunctions, fillDensity, removeFloaters } from '../terrain/generate.js';
import { blockMesh } from '../terrain/mesh.js';
import { fillSolid, resetVoxels, slopeDir } from '../terrain/voxels.js';
import { buildRenderGeometry, makeTerrainMaterial, terrainUniforms } from '../terrain/material.js';
import { forgetMaterial, prepareLighting, scene } from '../render/scene.js';
import { makeWater } from './water.js';
import { addVolcanoEffects } from './volcano.js';
import { addClouds, placeVegetation, vegTiles } from './vegetation.js';
import { clearGrass } from './grass.js';
import { initBlocks, resetBlocks } from './blocks.js';
import { resetFluids } from './fluids.js';
import { animals, spawnAnimals } from '../animals/animals.js';
import { bolts } from '../player/interaction.js';

export const world = new THREE.Group();
scene.add(world);
// Terrain is split into chunks. Each has a smooth-shaded render mesh and an indexed collider
// copy with a BVH (used for physics and raycasts; not added to the scene).
// Chunks are generated on demand, nearest the camera first (see streamChunks), in three stages:
//   1 density: its grid cells are filled from the terrain functions
//   2 clean:   floating rock is removed (needs the 3x3 neighbours' density)
//   3 meshed:  render mesh and collider built (needs the 3x3 neighbours clean)
export const CHUNK = 16;                       // grid cells per chunk side (16 cells x 2 m = 32 m)
export let terrainField = null;                // { field, nx, ny, nz }: the editable density field
let terrainMaterial = null;
export let chunks = [], chunkCount = 0;
let meshedCount = 0, triangles = 0;
let pending = [];                              // { i0, i1, j0, j1, fn }: run fn once those chunks are meshed
export const colliders = [];                   // all chunk collider meshes, for raycasting
export let terrainFns = null;
export const volcanoFx = [];     // { v, lava, light, smoke[] }
export let waterGroup = null;    // the sea and lake surfaces (water.js)

// Obstacles (tree trunks, boulders) in a spatial hash for fast collision
export const CELL = 8;
export const obstacleGrid = new Map();
export const cellKey = (cx, cz) => cx * 73856093 ^ cz * 19349663;
export function addObstacle(o) {
  const k = cellKey(Math.floor(o.x / CELL), Math.floor(o.z / CELL));
  if (!obstacleGrid.has(k)) obstacleGrid.set(k, []);
  obstacleGrid.get(k).push(o);
}

export function gridRemove(grid, o) {
  const list = grid.get(cellKey(Math.floor(o.x / CELL), Math.floor(o.z / CELL)));
  const i = list ? list.indexOf(o) : -1;
  if (i >= 0) list.splice(i, 1);
}
// Things you can break or harvest (trees, bushes, boulders), in the same kind of spatial hash
export const targetGrid = new Map();
export function addTarget(t) {
  const k = cellKey(Math.floor(t.x / CELL), Math.floor(t.z / CELL));
  if (!targetGrid.has(k)) targetGrid.set(k, []);
  targetGrid.get(k).push(t);
}

function disposeWorld() {
  world.traverse((o) => {
    if (o.geometry) { o.geometry.disposeBoundsTree?.(); o.geometry.dispose(); }
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { forgetMaterial(m); m.dispose(); });
  });
  for (const c of chunks) c.collider?.geometry.disposeBoundsTree();
  for (const c of chunks) c.collider?.geometry.dispose();
  chunks = []; colliders.length = 0; resetVoxels();
  pending = []; meshedCount = 0; triangles = 0;
  world.clear();
  obstacleGrid.clear(); targetGrid.clear();
  volcanoFx.length = 0;
  vegTiles.length = 0;
  animals.length = 0; bolts.length = 0;
  resetBlocks(); resetFluids();
  clearGrass();
}

export const chunkWidth = () => CHUNK * WORLD.voxel;

// (Re)builds the collider + render mesh of one chunk from the current density field.
export function buildChunk(i, j) {
  const ch = chunks[i + chunkCount * j];
  if (ch.render) { world.remove(ch.render); ch.render.geometry.dispose(); ch.render = null; }
  if (ch.collider) {
    ch.collider.geometry.disposeBoundsTree(); ch.collider.geometry.dispose();
    colliders.splice(colliders.indexOf(ch.collider), 1); ch.collider = null;
  }
  const w = chunkWidth(), geo = blockMesh(i * w, (i + 1) * w, j * w, (j + 1) * w, fillSolid, slopeDir);
  if (!geo.index.count) { geo.dispose(); return 0; }
  geo.computeBoundsTree();
  ch.collider = new THREE.Mesh(geo);
  ch.collider.userData.chunk = ch;
  colliders.push(ch.collider);
  ch.render = new THREE.Mesh(buildRenderGeometry(geo, terrainFns), terrainMaterial);
  geo.deleteAttribute('normal'); // the collider only needs positions
  ch.render.castShadow = true;
  ch.render.receiveShadow = true;
  world.add(ch.render);
  return geo.index.count / 3;
}

// The collider meshes whose triangles could lie between x0..x1, z0..z1.
const _near = [];
export function chunksIn(x0, x1, z0, z1) {
  const w = chunkWidth(), vx = WORLD.voxel;
  const i0 = Math.max(0, Math.floor((x0 - 0.01) / w)), i1 = Math.min(chunkCount - 1, Math.floor((x1 + vx) / w));
  const j0 = Math.max(0, Math.floor((z0 - 0.01) / w)), j1 = Math.min(chunkCount - 1, Math.floor((z1 + vx) / w));
  _near.length = 0;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const c = chunks[i + chunkCount * j].collider;
    if (c) _near.push(c);
  }
  return _near;
}

// ---------------------------------------------------------------------------
// Chunk streaming
// ---------------------------------------------------------------------------
const chunkAt = (i, j) => chunks[i + chunkCount * j];
const forNeighbours = (i, j, fn) => {
  for (let b = Math.max(0, j - 1); b <= Math.min(chunkCount - 1, j + 1); b++)
    for (let a = Math.max(0, i - 1); a <= Math.min(chunkCount - 1, i + 1); a++) fn(a, b);
};
// grid cells owned by chunk i: [i*CHUNK, (i+1)*CHUNK), the last one also takes the final cell
const cellRange = (i, n) => [i * CHUNK, i === chunkCount - 1 ? n : (i + 1) * CHUNK];

function fillChunk(i, j) {
  const ch = chunkAt(i, j);
  if (ch.stage >= 1) return;
  const [x0, x1] = cellRange(i, terrainField.nx), [z0, z1] = cellRange(j, terrainField.nz);
  fillDensity(terrainFns, terrainField, x0, x1, z0, z1);
  ch.stage = 1;
}
function cleanChunk(i, j) {
  const ch = chunkAt(i, j);
  if (ch.stage >= 2) return;
  forNeighbours(i, j, fillChunk);
  const [x0, x1] = cellRange(i, terrainField.nx), [z0, z1] = cellRange(j, terrainField.nz);
  removeFloaters(terrainField, x0, x1, z0, z1, CHUNK);
  ch.stage = 2;
}
function meshChunk(i, j) {
  const ch = chunkAt(i, j);
  if (ch.stage >= 3) return;
  forNeighbours(i, j, cleanChunk);
  triangles += buildChunk(i, j);
  ch.stage = 3;
  meshedCount++;
}
// The next single step towards chunk (i, j) reaching `stage`, with its prerequisites done: [i, j, stage] or null.
function nextStep(i, j, stage) {
  if (chunkAt(i, j).stage >= stage) return null;
  let step = null;
  if (stage > 1) forNeighbours(i, j, (a, b) => { if (!step) step = nextStep(a, b, stage - 1); });
  return step || [i, j, stage];
}
const STAGES = [null, fillChunk, cleanChunk, meshChunk];

const chunkRange = (x0, x1, z0, z1) => {
  const w = chunkWidth(), c = (v) => Math.max(0, Math.min(chunkCount - 1, Math.floor(v / w)));
  return [c(x0), c(x1), c(z0), c(z1)];
};
function runReady() {
  if (!pending.length) return;
  const still = [];
  // in the order they were registered, so lava flows exist before the plants that avoid them
  for (const p of pending) {
    let ready = true;
    for (let j = p.j0; j <= p.j1 && ready; j++) for (let i = p.i0; i <= p.i1; i++) if (chunkAt(i, j).stage < 3) { ready = false; break; }
    if (ready) p.fn(); else still.push(p);
  }
  pending = still;
}

// Runs fn once the terrain over the rectangle (metres) is meshed: right away if it already is.
export function whenLoaded(x0, x1, z0, z1, fn) {
  const [i0, i1, j0, j1] = chunkRange(x0 - WORLD.voxel, x1 + WORLD.voxel, z0 - WORLD.voxel, z1 + WORLD.voxel);
  pending.push({ i0, i1, j0, j1, fn });
  runReady();
}
// Is the terrain within `margin` metres of (x, z) meshed?
export function isLoaded(x, z, margin = 4) {
  if (!chunks.length) return false;
  const [i0, i1, j0, j1] = chunkRange(x - margin, x + margin, z - margin, z + margin);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (chunkAt(i, j).stage < 3) return false;
  return true;
}
// Meshes every chunk within r metres of (x, z) right now (blocks the page while it works).
export function loadArea(x, z, r) {
  const [i0, i1, j0, j1] = chunkRange(x - r, x + r, z - r, z + r);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) meshChunk(i, j);
  runReady();
}
export function loadAll() { loadArea(WORLD.size / 2, WORLD.size / 2, WORLD.size); }

// Generates terrain for up to `budgetMs` milliseconds, nearest the point (x, z) first.
// Returns true while there's still terrain to generate.
export function streamChunks(x, z, budgetMs) {
  if (meshedCount === chunks.length) return false;
  const t0 = performance.now(), w = chunkWidth();
  let best = null;
  do {
    if (!best || chunkAt(best.i, best.j).stage >= 3) {
      best = null;
      let bd = Infinity;
      for (const ch of chunks) {
        if (ch.stage >= 3) continue;
        const d = ((ch.i + 0.5) * w - x) ** 2 + ((ch.j + 0.5) * w - z) ** 2;
        if (d < bd) { bd = d; best = ch; }
      }
      if (!best) return false;
    }
    const [i, j, stage] = nextStep(best.i, best.j, 3);
    STAGES[stage](i, j);
    if (stage === 3) runReady();
  } while (performance.now() - t0 < budgetMs);
  return meshedCount < chunks.length;
}
export const terrainProgress = () => ({ meshed: meshedCount, total: chunks.length, triangles });

export function generateWorld(seed) {
  disposeWorld();
  const t0 = performance.now();
  terrainFns = createTerrainFunctions(seed);
  terrainField = createDensityField();
  terrainMaterial = makeTerrainMaterial();
  chunkCount = Math.ceil((terrainField.nx - 1) / CHUNK);
  chunks = [];
  for (let j = 0; j < chunkCount; j++) for (let i = 0; i < chunkCount; i++) chunks.push({ i, j, stage: 0, collider: null, render: null });

  terrainUniforms.uVolc.value.forEach((u) => u.set(-1e4, -1e4, 1, 0));
  terrainFns.volcanoes.slice(0, 4).forEach((v, i) => terrainUniforms.uVolc.value[i].set(v.x, v.z, v.crater, v.lavaY));

  waterGroup = makeWater();
  world.add(waterGroup);
  // these wait for the terrain under them (lava flows first: plants avoid them)
  addVolcanoEffects();
  const counts = placeVegetation(seed);
  addClouds(seed);
  initBlocks();
  // the area around the start, so the title screen and the first steps have ground
  const L = terrainFns.ledge;
  loadArea(L.x, L.z, START_RADIUS);
  const animalCount = spawnAnimals(seed);
  prepareLighting(scene);

  const stats = { seed, ms: Math.round(performance.now() - t0), triangles, chunks: chunks.length, loaded: meshedCount, ...counts, animals: animalCount };
  console.log('World generated', stats);
  return stats;
}
export const START_RADIUS = 110;   // metres around the start generated before play
