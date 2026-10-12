import * as THREE from 'three';
import { WORLD } from '../config.js';
import { solidCell } from '../terrain/voxels.js';
import { BLOCKS, blockKey, blocks, placeBlock } from './blocks.js';
import { terrainFns, world } from './world.js';
import { raycastTerrain } from './query.js';
import { pourIntoNature } from './hydro.js';

// ---------------------------------------------------------------------------
// Water and lava you pour, on the 1 m block grid. Each cell holds an amount of fluid (1 = a full
// cell, which is what a bucket holds), and the fluid is never made or lost by flowing:
//   - it falls into the cell below as far as that cell has room;
//   - it levels out with the cells beside it, so two pools that touch even out into one;
//   - a full cell under pressure (a column of fluid above, or a pool on higher ground joined to it)
//     holds a little more than 1 and pushes the extra up, so a pool fills from the bottom and joined
//     pools find one level;
//   - a thin layer stops spreading once it's only `min` deep (1/16 for water, 1/4 for lava, which is
//     thick), so a bucket of water spreads over about a dozen cells, lava over a few.
// Scooping with a bucket or a bottle takes that much out of the pool, from the top. Water running
// into the river or a lake joins it. Out in the open, rain adds to pools and sunshine dries them up.
// Water meeting lava turns the lava to stone (obsidian, if it was a full cell) and boils some of the
// water away. Cells marked `nat` are the sea or a lake running into a hole you dug: they stay full
// while the natural water is up to them.
// ---------------------------------------------------------------------------
export const FLUIDS = {
  water: { every: 0.1, min: 1 / 16 },
  lava: { every: 0.5, min: 1 / 4 },
};
const MAX_CELLS = 6000, COMPRESS = 0.02, GONE = 0.004;
export const fluids = new Map();   // "x,y,z" -> { type, m, x, y, z, nat, sky, skyT }
const active = { water: new Set(), lava: new Set() }, dirty = { water: false, lava: false }, timer = { water: 0, lava: 0 };
const SIDES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const AROUND = [[0, 1, 0], [0, -1, 0], ...SIDES];

export function resetFluids() {
  fluids.clear();
  for (const t in active) { active[t].clear(); dirty[t] = false; timer[t] = 0; delete meshes[t]; } // the meshes went with the old world
}

// Is a cell closed to fluid: a placed block (campfires let it through), the ground, or off the map?
export function cellSolid(x, y, z) {
  if (x < 1 || z < 1 || y < 1 || x > WORLD.size - 2 || z > WORLD.size - 2 || y > WORLD.height - 2) return true;
  const b = blocks.get(blockKey(x, y, z));
  if (b) return BLOCKS[b.type].solid !== false;
  return solidCell(x, y, z);
}

// Marks a cell and its six neighbours to be looked at on the next update.
export function wake(x, y, z) {
  for (const [dx, dy, dz] of [[0, 0, 0], ...AROUND]) {
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

function makeCell(type, x, y, z, m, nat = false) {
  if (fluids.size >= MAX_CELLS) return null;
  const f = { type, m, x, y, z, nat, sky: false, skyT: 0 };
  fluids.set(blockKey(x, y, z), f);
  dirty[type] = true;
  wake(x, y, z);
  return f;
}
export function removeFluid(x, y, z) {
  const key = blockKey(x, y, z), f = fluids.get(key);
  if (!f) return null;
  fluids.delete(key);
  dirty[f.type] = true;
  wake(x, y, z);
  return f;
}

// Pours an amount of fluid (1 = a bucket) into a cell. Returns whether it could.
export function pourFluid(type, x, y, z, m = 1) {
  if (cellSolid(x, y, z)) return false;
  const f = fluids.get(blockKey(x, y, z));
  if (f && f.type !== type) { meet(f, type); return true; }
  if (f) { f.m += m; dirty[type] = true; wake(x, y, z); return true; }
  return !!makeCell(type, x, y, z, m);
}
// a bucketful (the name the tests and older code use)
export const addSource = (type, x, y, z) => pourFluid(type, x, y, z, 1);

// Water and lava meeting. `f` is the cell there, `other` the fluid arriving. The lava hardens: a
// full cell into obsidian, less into stone, a thin film just cools away; the water loses some to steam.
function meet(f, other) {
  const lava = f.type === 'lava' ? f : null;
  if (lava) {
    removeFluid(lava.x, lava.y, lava.z);
    if (lava.m >= 0.95) placeBlock('obsidian', lava.x, lava.y, lava.z);
    else if (lava.m >= 0.2) placeBlock('stone', lava.x, lava.y, lava.z);
  } else if (other === 'lava') {
    // lava running into water: the water boils off a little, and the lava stops here as stone
    f.m -= 0.25; dirty.water = true; wake(f.x, f.y, f.z);
    if (f.m < GONE) removeFluid(f.x, f.y, f.z);
  }
}

// The level the natural water (the river, the sea or a lake) reaches over a cell, if the cell is
// out in that open water rather than in a cave under the land.
function natureOver(x, y, z) {
  const T = terrainFns, cx = x + 0.5, cz = z + 0.5, level = T.waterAt(cx, cz);
  return level > y + 0.5 && T.surfaceHeight(cx, cz) < y + 0.5 ? level : null;
}

// How much a cell holds when it sits under one holding `total` between them: a full cell, and any
// extra shared so the lower one holds a little more (that pressure is what pushes fluid back up).
function stableBelow(total) {
  if (total <= 1) return 1;
  if (total < 2 + COMPRESS) return (1 + total * COMPRESS) / (1 + COMPRESS);
  return (total + COMPRESS) / 2;
}

const moves = new Map(); // key -> change in amount this step
function move(from, x, y, z, amount) {
  if (amount <= 0) return;
  const to = blockKey(x, y, z), at = blockKey(from.x, from.y, from.z);
  moves.set(at, (moves.get(at) || 0) - amount);
  moves.set(to, (moves.get(to) || 0) + amount);
}

function step(type) {
  const { min } = FLUIDS[type], list = [...active[type]];
  active[type].clear();
  moves.clear();
  const get = (x, y, z) => fluids.get(blockKey(x, y, z));
  // room for new cells this step (fluid only moves into an empty cell while there is)
  let room = MAX_CELLS - fluids.size;
  const roomFor = (x, y, z, n) => { if (n || moves.has(blockKey(x, y, z))) return true; if (room <= 0) return false; room--; return true; };
  for (const key of list) {
    const f = fluids.get(key);
    if (!f || f.type !== type) continue;
    const { x, y, z } = f;
    // the river, sea or a lake keeps a cell it floods full while its water is up to it
    // (asked by the water level alone: the ground under a dug cell is gone, whatever the height map says)
    if (f.nat) { if (terrainFns.waterAt(x + 0.5, z + 0.5) > y + 0.5) f.m = Math.max(f.m, 1); else f.nat = false; }
    // poured water reaching open natural water runs into it (and raises it a little)
    if (!f.nat && natureOver(x, y, z) !== null) {
      if (type === 'water') pourIntoNature(x + 0.5, z + 0.5, f.m);
      removeFluid(x, y, z);
      if (type === 'lava') placeBlock(f.m >= 0.95 ? 'obsidian' : 'stone', x, y, z);
      continue;
    }
    // the other fluid next to it?
    const touching = AROUND.map(([dx, dy, dz]) => get(x + dx, y + dy, z + dz)).find((n) => n && n.type !== type);
    if (touching) { if (type === 'lava') meet(f, 'water'); else meet(touching, 'water'); continue; }

    let rest = f.m;
    // down: fill the cell below as far as it has room (more if this one presses down on it)
    // (a cell the natural water floods is level with it, so it never pours into open water: that would
    // pump water into the river from nothing)
    const shut = (cx, cy, cz) => cellSolid(cx, cy, cz) || (f.nat && natureOver(cx, cy, cz) !== null);
    if (!shut(x, y - 1, z)) {
      const below = get(x, y - 1, z), bm = below ? below.m : 0;
      let flow = stableBelow(rest + bm) - bm;
      flow = Math.max(0, Math.min(flow, rest));
      if (roomFor(x, y - 1, z, below)) { move(f, x, y - 1, z, flow); rest -= flow; }
    }
    if (rest <= 0) continue;
    // sideways: even out with lower neighbours; a thin layer doesn't spread onto dry cells
    for (const [dx, , dz] of SIDES) {
      const nx = x + dx, nz = z + dz;
      if (shut(nx, y, nz)) continue;
      const n = get(nx, y, nz), nm = n ? n.m : 0;
      if (!n && rest <= min) continue;
      let flow = (rest - nm) / 4;
      if (flow < 0.0005 || !roomFor(nx, y, nz, n)) continue;
      flow = Math.min(flow, rest);
      move(f, nx, y, nz, flow); rest -= flow;
    }
    if (rest <= 0) continue;
    // up: more than a full cell's worth pushes into the cell above
    if (rest > 1 && !shut(x, y + 1, z)) {
      const above = get(x, y + 1, z), am = above ? above.m : 0;
      const flow = Math.max(0, Math.min(rest - stableBelow(rest + am), rest - 1));
      if (roomFor(x, y + 1, z, above)) move(f, x, y + 1, z, flow);
    }
  }
  // apply all the moves at once, so the order cells were looked at doesn't matter
  for (const [key, dm] of moves) {
    let f = fluids.get(key);
    if (!f) {
      if (dm <= 0) continue;
      const [x, y, z] = key.split(',').map(Number);
      if (cellSolid(x, y, z)) continue; // it hardened into stone this step
      f = makeCell(type, x, y, z, 0);
    }
    f.m += dm;
    if (Math.abs(dm) > 0.0004) wake(f.x, f.y, f.z);
    if (f.m < GONE) removeFluid(f.x, f.y, f.z);
  }
  dirty[type] = true;
}

// The sea or a lake running into ground you dug next to it: every open cell below the water level
// in the dug area that touches open natural water fills, and stays full while the water is that high.
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
      if (open) makeCell('water', x, y, z, 1, true);
    }
  }
}

// How high the fluid in a cell stands (0..1): full under more of the same fluid.
const cellHeight = (f) => (fluids.get(blockKey(f.x, f.y + 1, f.z))?.type === f.type ? 1 : Math.max(0.03, Math.min(1, f.m)));
// The fluid in the cell holding a point, with the height of its surface (top of the column).
export function fluidAt(px, py, pz) {
  const x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
  const f = fluids.get(blockKey(x, y, z));
  if (!f) return null;
  let top = y, k = 0;
  while (k++ < 8 && fluids.get(blockKey(x, top + 1, z))?.type === f.type) top++;
  return { type: f.type, top: top + cellHeight(fluids.get(blockKey(x, top, z))) };
}

// Takes up to `want` of the fluid from the pool a cell belongs to, from its highest cells first
// (the way a pool goes down when you scoop from it). Returns how much it got. Cells the sea or a
// lake keeps full give nothing: scooping there takes from the natural water instead.
export function takeFluid(f, want) {
  const seen = new Set([blockKey(f.x, f.y, f.z)]), pool = [f];
  for (let i = 0; i < pool.length && pool.length < 600; i++) {
    const c = pool[i];
    for (const [dx, dy, dz] of AROUND) {
      const key = blockKey(c.x + dx, c.y + dy, c.z + dz), n = fluids.get(key);
      if (n && n.type === f.type && !seen.has(key)) { seen.add(key); pool.push(n); }
    }
  }
  const cells = pool.filter((c) => !c.nat).sort((a, b) => b.y - a.y || a.m - b.m);
  let got = 0;
  for (const c of cells) {
    if (got >= want) break;
    const k = Math.min(c.m, want - got);
    c.m -= k; got += k;
    if (c.m < GONE) removeFluid(c.x, c.y, c.z); else wake(c.x, c.y, c.z);
  }
  dirty[f.type] = true;
  return got;
}
// How much fluid the pool a cell belongs to holds in all (cells the sea keeps full count as plenty).
export function poolAmount(f) {
  const seen = new Set([blockKey(f.x, f.y, f.z)]), pool = [f];
  let total = 0;
  for (let i = 0; i < pool.length && i < 600; i++) {
    const c = pool[i];
    total += c.nat ? 99 : c.m;
    for (const [dx, dy, dz] of AROUND) {
      const key = blockKey(c.x + dx, c.y + dy, c.z + dz), n = fluids.get(key);
      if (n && n.type === f.type && !seen.has(key)) { seen.add(key); pool.push(n); }
    }
  }
  return total;
}

// The first fluid cell along a ray between t0 and t1 (for scooping it up), where the ray passes
// below the fluid's surface in that cell.
export function fluidRay(o, d, t0, t1) {
  for (let t = Math.max(0.05, t0); t < t1; t += 0.05) {
    const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
    const f = fluids.get(blockKey(Math.floor(px), Math.floor(py), Math.floor(pz)));
    if (f && py - Math.floor(py) <= cellHeight(f) + 0.05) return { ...f, cell: f, t };
  }
  return null;
}

// Rain and sun on pools out in the open (nothing over them). Checked a few cells at a time.
const _up = new THREE.Vector3(0, 1, 0), _o = new THREE.Vector3();
function openToSky(f) {
  for (let k = 1; k < 40; k++) { if (blocks.has(blockKey(f.x, f.y + k, f.z))) return false; }
  _o.set(f.x + 0.5, f.y + 0.9, f.z + 0.5);
  return !raycastTerrain(_o, _up, 0, 80);
}
let weatherT = 0;
export function weatherOnFluids(dt, rain, sun) {
  weatherT += dt;
  if (weatherT < 1) return;
  const secs = weatherT; weatherT = 0;
  let checks = 40;
  for (const f of fluids.values()) {
    if (f.type !== 'water' || f.nat) continue;
    if (fluids.get(blockKey(f.x, f.y + 1, f.z))?.type === 'water') continue; // only the top of a pool
    f.skyT -= secs;
    if (f.skyT <= 0 && checks-- > 0) { f.sky = openToSky(f); f.skyT = 8 + Math.random() * 4; }
    if (!f.sky) continue;
    // heavy rain adds about 2 mm a second; full sun dries a fifth as fast (a bucket spread thin
    // over a dozen cells dries in a couple of minutes, a deep pool takes much longer)
    const dm = (rain * 0.002 - sun * 0.0004) * secs;
    if (Math.abs(dm) < 1e-6) continue;
    f.m += dm;
    dirty.water = true; wake(f.x, f.y, f.z);
    if (f.m < GONE) removeFluid(f.x, f.y, f.z);
  }
}

// Drawing: one instanced box per cell, as tall as its fluid
const meshes = {};
const fluidGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
function fluidMesh(type) {
  if (meshes[type]) return meshes[type];
  const mat = type === 'water'
    ? new THREE.MeshStandardMaterial({ color: 0x2b7fb2, roughness: 0.08, transparent: true, opacity: 0.62, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff4a10, emissiveIntensity: 2.4, roughness: 0.7, side: THREE.DoubleSide }); // seen from inside too
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
