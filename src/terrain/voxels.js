import { WORLD } from '../config.js';
import { sampleField } from './material.js';
import { terrainField } from '../world/world.js';

// ---------------------------------------------------------------------------
// The ground as 1 m blocks. A cell is ground where the density field (2 m apart, smoothly
// interpolated) is positive at its centre, unless the player dug it out or filled it in (`edits`).
// On hillsides, an empty cell standing on ground with higher ground on one side holds a slope
// rising toward it, so walking up a hill doesn't need a jump for every step. Dug-out cells never
// get a slope, so a hole is exactly as big as what you took out.
// ---------------------------------------------------------------------------
const SX = WORLD.size, SY = WORLD.height;
export const cellIndex = (x, y, z) => x + SX * (y + SY * z);
export const edits = new Map();     // cell index -> 1 ground, 0 air
export const cellMat = new Map();   // cell index -> what the ground there is made of, once it's been dug next to
export function resetVoxels() { edits.clear(); cellMat.clear(); }

// Is the cell at integer (x, y, z) ground?
export function solidCell(x, y, z) {
  if (y < 0) return true;
  if (y >= SY || x < 0 || z < 0 || x >= SX || z >= SX) return false;
  if (edits.size) { const e = edits.get(cellIndex(x, y, z)); if (e !== undefined) return e === 1; }
  return sampleField(x + 0.5, y + 0.5, z + 0.5) > 0;
}
// The same for any point.
export const solidAt = (x, y, z) => solidCell(Math.floor(x), Math.floor(y), Math.floor(z));

// Which way a slope in this cell rises: 0 +x, 1 -x, 2 +z, 3 -z, or -1 for none. `solid` can be a
// faster lookup over the same cells.
export const SLOPE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function slopeDir(x, y, z, solid = solidCell) {
  if (solid(x, y, z) || !solid(x, y - 1, z) || solid(x, y + 1, z)) return -1;
  if (edits.size && edits.has(cellIndex(x, y, z))) return -1;
  for (let d = 0; d < 4; d++) {
    const [dx, dz] = SLOPE_DIRS[d];
    if (solid(x + dx, y, z + dz) && !solid(x - dx, y, z - dz)) return d;
  }
  return -1;
}

// Digging out or filling in one cell. Returns whether it changed.
export function setCell(x, y, z, ground) {
  if (y < 1 || y >= SY - 1 || x < 1 || z < 1 || x >= SX - 1 || z >= SX - 1) return false;
  const was = solidCell(x, y, z), slope = !was && slopeDir(x, y, z) >= 0;
  if (was === ground && !slope) return false;
  edits.set(cellIndex(x, y, z), ground ? 1 : 0);
  return true;
}

// Fills `out` (1 = ground) for the cells x0 <= x < x0 + nx, 0 <= y < SY, z0 <= z < z0 + nz, laid out
// x fastest, then y, then z: the same answer as solidCell, worked out a column at a time (the
// density between grid points is interpolated once per grid level, not once per cell).
const _prof = new Float32Array(129);
export function fillSolid(x0, z0, nx, nz, out) {
  const { field, nx: FX, ny: FY, nz: FZ } = terrainField, inv = 1 / WORLD.voxel, sy = FX, sz = FX * FY;
  for (let lz = 0; lz < nz; lz++) for (let lx = 0; lx < nx; lx++) {
    const x = x0 + lx, z = z0 + lz, o = lx + nx * SY * lz;
    if (x < 0 || z < 0 || x >= SX || z >= SX) { for (let y = 0; y < SY; y++) out[o + nx * y] = 0; continue; }
    const fx = Math.min(FX - 1.001, (x + 0.5) * inv), fz = Math.min(FZ - 1.001, (z + 0.5) * inv);
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
    // the density at every grid level of this column
    for (let iy = 0; iy < FY; iy++) {
      const i = ix + sy * iy + sz * iz;
      const a = field[i] + (field[i + 1] - field[i]) * tx, b = field[i + sz] + (field[i + sz + 1] - field[i + sz]) * tx;
      _prof[iy] = a + (b - a) * tz;
    }
    for (let y = 0; y < SY; y++) {
      const fy = Math.min(FY - 1.001, (y + 0.5) * inv), iy = fy | 0, t = fy - iy;
      out[o + nx * y] = _prof[iy] + (_prof[iy + 1] - _prof[iy]) * t > 0 ? 1 : 0;
    }
  }
  if (!edits.size) return;
  // the player's digging: fewer cells than the area, usually
  for (const [k, e] of edits) {
    const x = k % SX, y = Math.floor(k / SX) % SY, z = Math.floor(k / (SX * SY));
    if (x >= x0 && x < x0 + nx && z >= z0 && z < z0 + nz) out[x - x0 + nx * (y + SY * (z - z0))] = e;
  }
}
