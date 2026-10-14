import { WORLD } from '../config.js';
import { sampleField } from './material.js';
import { terrainField } from '../world/world.js';

// ---------------------------------------------------------------------------
// The ground as 1 m blocks. A cell is ground where the density field (2 m apart, smoothly
// interpolated) is positive at its centre, unless the player dug it out or filled it in (`edits`).
// On hillsides, an empty cell standing on ground with higher ground on one side holds a slope
// rising toward it (or another of the pieces below), so walking up a hill doesn't need a jump for
// every step. Dug-out cells never get a piece, so a hole is exactly as big as what you took out.
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

// The pieces of ground that fill hillside cells. An empty cell standing on ground can hold one, made
// from the same shapes you can build with:
//   slope        ground on one side: a ramp up to it (45°)
//   steep slope  at the foot of a cliff three or more blocks high (too steep to stand on)
//   gentle slope a one-block step with flat ground below it is spread over two cells: a low gentle
//                ramp up to half a metre, then a high one on to the top (27°)
//   corner slope ground only diagonally (the outside corner of a hill): slopes down on two sides
//   inner corner ground on two sides next to each other (the inside corner of a hill)
// A piece is a code: kind * 4 + turn. Slopes turn to face SLOPE_DIRS (the way they rise); corners
// to CORNERS (the way they're high). -1 is no piece.
export const SLOPE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const CORNERS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
export const PIECE = { slope: 0, steep: 1, gentleLow: 2, gentleHigh: 3, outer: 4, inner: 5 };
export const pieceKind = (code) => code >> 2;
const open = (x, y, z, solid) => !solid(x, y, z) && solid(x, y - 1, z) && !solid(x, y + 1, z) && !(edits.size && edits.has(cellIndex(x, y, z)));
// A cell with ground on exactly one side, one block high, and open on the other side: the plain
// step a gentle slope can spread out. Returns the way it rises, or -1.
function plainStep(x, y, z, solid) {
  if (!open(x, y, z, solid)) return -1;
  let d = -1;
  for (let k = 0; k < 4; k++) {
    const [dx, dz] = SLOPE_DIRS[k];
    if (solid(x + dx, y, z + dz)) { if (d >= 0) return -1; d = k; }
  }
  if (d < 0) return -1;
  const [dx, dz] = SLOPE_DIRS[d];
  return solid(x + dx, y + 1, z + dz) ? -1 : d;
}
const walls = (x, y, z, solid) => {
  let m = 0;
  for (let k = 0; k < 4; k++) if (solid(x + SLOPE_DIRS[k][0], y, z + SLOPE_DIRS[k][1])) m |= 1 << k;
  return m;
};
// A flat open cell in front of a plain step: the low half of a gentle slope rising toward it.
function gentleBelow(x, y, z, solid) {
  for (let k = 0; k < 4; k++) if (plainStep(x + SLOPE_DIRS[k][0], y, z + SLOPE_DIRS[k][1], solid) === k) return k;
  return -1;
}
// The piece in the cell at integer (x, y, z), or -1. `solid` can be a faster lookup over the same cells.
export function slopeDir(x, y, z, solid = solidCell) {
  if (!open(x, y, z, solid)) return -1;
  const m = walls(x, y, z, solid);
  if (!m) {
    const g = gentleBelow(x, y, z, solid);
    if (g >= 0) return PIECE.gentleLow * 4 + g;
    for (let c = 0; c < 4; c++) if (solid(x + CORNERS[c][0], y, z + CORNERS[c][1])) return PIECE.outer * 4 + c;
    return -1;
  }
  // two sides next to each other: an inside corner
  for (let c = 0; c < 4; c++) {
    const [sx, sz] = CORNERS[c], bx = sx > 0 ? 1 : 2, bz = sz > 0 ? 4 : 8;
    if (m === (bx | bz)) return PIECE.inner * 4 + c;
  }
  for (let d = 0; d < 4; d++) {
    if (!(m & (1 << d)) || m & (1 << (d ^ 1))) continue;
    const [dx, dz] = SLOPE_DIRS[d];
    if (solid(x + dx, y + 1, z + dz) && solid(x + dx, y + 2, z + dz)) return PIECE.steep * 4 + d;
    if (m === 1 << d && plainStep(x, y, z, solid) === d && open(x - dx, y, z - dz, solid) && gentleBelow(x - dx, y, z - dz, solid) === d && !walls(x - dx, y, z - dz, solid)) return PIECE.gentleHigh * 4 + d;
    return PIECE.slope * 4 + d;
  }
  return -1;
}
// How high the top of a piece is (0..1 of the cell) at (fx, fz) across the cell (each 0..1).
export function pieceHeight(code, fx, fz) {
  const k = code >> 2, r = code & 3;
  if (k >= PIECE.outer) {
    const [sx, sz] = CORNERS[r], tx = sx > 0 ? fx : 1 - fx, tz = sz > 0 ? fz : 1 - fz;
    return k === PIECE.outer ? Math.min(tx, tz) : Math.max(tx, tz);
  }
  const [dx, dz] = SLOPE_DIRS[r], t = dx ? (dx > 0 ? fx : 1 - fx) : dz > 0 ? fz : 1 - fz;
  return k === PIECE.slope ? t : k === PIECE.steep ? Math.max(0, 2 * t - 1) : k === PIECE.gentleLow ? t / 2 : 0.5 + t / 2;
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
