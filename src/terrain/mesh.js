import * as THREE from 'three';
import { WORLD } from '../config.js';
import { PIECE, pieceHeight } from './voxels.js';

// ---------------------------------------------------------------------------
// Meshing: naive Surface Nets (smooth isosurface, one vertex per surface cell).
// The world is meshed in chunks so digging and building only rebuild the chunks they touch.
// A chunk owns the faces of grid points x0 <= x < x1, z0 <= z < z1; it computes its own copy of
// the border vertices, which come out identical in the neighbour, so there are no cracks.
// ---------------------------------------------------------------------------
export function surfaceNets(field, nx, ny, nz, scale, x0 = 1, x1 = nx - 1, z0 = 1, z1 = nz - 1) {
  const cy = ny - 1;
  x0 = Math.max(1, x0); z0 = Math.max(1, z0); x1 = Math.min(nx - 1, x1); z1 = Math.min(nz - 1, z1);
  const bx = x0 - 1, bz = z0 - 1, wx = x1 - bx, wz = z1 - bz;
  const cellVert = new Int32Array(wx * cy * wz).fill(-1);
  const positions = [];
  const indices = [];
  const F = (x, y, z) => field[x + nx * (y + ny * z)];
  const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const v = new Float32Array(8);

  for (let z = bz; z < z1; z++) for (let y = 0; y < cy; y++) for (let x = bx; x < x1; x++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const [dx, dy, dz] = corners[c];
      v[c] = F(x + dx, y + dy, z + dz);
      if (v[c] > 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] > 0) === (v[b] > 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      const ca = corners[a], cb = corners[b];
      sx += ca[0] + (cb[0] - ca[0]) * t;
      sy += ca[1] + (cb[1] - ca[1]) * t;
      sz += ca[2] + (cb[2] - ca[2]) * t;
      n++;
    }
    cellVert[(x - bx) + wx * (y + cy * (z - bz))] = positions.length / 3;
    positions.push((x + sx / n) * scale, (y + sy / n) * scale, (z + sz / n) * scale);
  }

  const C = (x, y, z) => cellVert[(x - bx) + wx * (y + cy * (z - bz))];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let z = z0; z < z1; z++) for (let y = 1; y < cy; y++) for (let x = x0; x < x1; x++) {
    const s0 = F(x, y, z) > 0;
    if (s0 !== (F(x + 1, y, z) > 0)) quad(C(x, y - 1, z - 1), C(x, y, z - 1), C(x, y, z), C(x, y - 1, z), !s0);
    if (s0 !== (F(x, y + 1, z) > 0)) quad(C(x - 1, y, z - 1), C(x - 1, y, z), C(x, y, z), C(x, y, z - 1), !s0);
    if (s0 !== (F(x, y, z + 1) > 0)) quad(C(x - 1, y - 1, z), C(x, y - 1, z), C(x, y, z), C(x - 1, y, z), !s0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

// ---------------------------------------------------------------------------
// Block meshing: the ground as 1 m cubes and the slope pieces between them (see voxels.js). Faces
// between ground and air are joined into rectangles of up to MERGE x MERGE cells (fewer triangles;
// the ground's look is still worked out per corner). Each piece is drawn from its height at the
// corners and middles of the cell (PIECE_GRID): its top, and each side that isn't against ground
// or against the same side of the piece next to it.
// Covers cells x0 <= x < x1, z0 <= z < z1 (metres); every face belongs to the cell it bounds, so
// neighbouring chunks never draw the same face.
// ---------------------------------------------------------------------------
const MERGE = 8;
export function blockMesh(x0, x1, z0, z1, fillSolid, slopeDir) {
  pieceTables();
  // pieces depend on cells up to three away, and the cells next to the chunk need theirs
  const M = 5, W = x1 - x0, D = z1 - z0, LX = W + 2 * M, LZ = D + 2 * M, H = WORLD.height;
  // ground (1), a piece (2 + its code) or air (0), for the chunk plus a border
  const solid = new Uint8Array(LX * H * LZ), at = (lx, y, lz) => lx + LX * (y + H * lz);
  fillSolid(x0 - M, z0 - M, LX, LZ, solid);
  let yTop = 0;
  for (let i = solid.length - 1; i >= 0; i--) if (solid[i]) { const y = Math.floor(i / LX) % H; if (y > yTop) yTop = y; }
  const S = (lx, y, lz) => (y < 0 ? 1 : y >= H || lx < 0 || lz < 0 || lx >= LX || lz >= LZ ? 0 : solid[at(lx, y, lz)] === 1);
  const occ = new Uint8Array(solid.length);
  for (let lz = 1; lz < LZ - 1; lz++) for (let lx = 1; lx < LX - 1; lx++) for (let y = 0; y <= Math.min(H - 1, yTop + 1); y++) {
    const i = at(lx, y, lz);
    if (solid[i]) { occ[i] = 1; continue; }
    if (lx < M - 1 || lz < M - 1 || lx > LX - M || lz > LZ - M) continue;
    if (!solid[at(lx, Math.max(0, y - 1), lz)] && y > 0) continue;
    const d = slopeDir(x0 + lx - M, y, z0 + lz - M, (x, yy, z) => S(x - x0 + M, yy, z - z0 + M));
    if (d >= 0) occ[i] = 2 + d;
  }
  const O = (x, y, z) => (y < 0 ? 1 : y >= H ? 0 : occ[at(x - x0 + M, y, z - z0 + M)]); // world cell coords

  // corners shared by faces with the same normal are one vertex (key: position and normal)
  const pos = [], nor = [], idx = [], seen = new Map();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
  const vert = (q, n) => {
    // positions are on a half-metre grid; normals told apart to about 1/8
    const nk = (Math.round(n[0] * 8) + 8) * 289 + (Math.round(n[1] * 8) + 8) * 17 + Math.round(n[2] * 8) + 8;
    const key = q[0] * 2 + 2051 * (q[1] * 2 + 2 * (H + 2) * (q[2] * 2 + 2051 * nk));
    let v = seen.get(key);
    if (v === undefined) { v = pos.length / 3; seen.set(key, v); pos.push(q[0], q[1], q[2]); nor.push(n[0], n[1], n[2]); }
    return v;
  };
  const facing = (p, n) => {
    _a.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]); _b.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
    return _n.crossVectors(_a, _b).dot(_b.set(n[0], n[1], n[2])) > 0;
  };
  const quad = (p, n) => { // p: 4 corners in order around the quad
    const [a, b, c, d] = p.map((q) => vert(q, n));
    if (facing(p, n)) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  // the lowest air in the area: below it every cell is buried ground with no faces
  let yLow = yTop + 1;
  for (let lz = 1; lz < LZ - 1 && yLow > 0; lz++) for (let lx = 1; lx < LX - 1; lx++) {
    for (let y = 0; y < yLow; y++) if (!solid[at(lx, y, lz)]) { yLow = y; break; }
  }
  const yMax = Math.min(H - 1, yTop + 1), yMin = Math.max(0, yLow - 1);
  // the six directions as (axis of the normal, sign); u, v are the face's two other axes. A ground
  // cell shows a face toward air, or toward a piece unless the piece covers it (stands on it with
  // its whole bottom, or leans on it with a whole side).
  for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const n = [0, 0, 0]; n[ax] = sg;
    const off = n[0] + LX * (n[1] + H * n[2]);
    // which side of the piece faces this ground face
    const side = ax === 1 ? -1 : ax === 0 ? (sg > 0 ? 1 : 0) : sg > 0 ? 3 : 2;
    const covers = (t) => (side < 0 ? sg > 0 && t - 2 >> 2 !== PIECE.steep : PIECE_FULL[(t - 2) * 4 + side]);
    const [ua, va] = ax === 0 ? [2, 1] : ax === 1 ? [0, 2] : [0, 1];
    const lo = [x0, yMin, z0], hi = [x1, yMax + 1, z1];
    const nu = hi[ua] - lo[ua], nv = hi[va] - lo[va];
    const mask = new Uint8Array(nu * nv), stride = [1, LX, LX * H], su = stride[ua], sv = stride[va];
    const base = [x0 - x0 + M, 0, z0 - z0 + M]; // local coordinates of lo
    for (let k = lo[ax]; k < hi[ax]; k++) {
      let any = false;
      const p0 = [base[0], lo[1], base[2]]; p0[ax] = ax === 1 ? k : k - lo[ax] + M;
      const i0 = p0[0] + LX * (p0[1] + H * p0[2]);
      const edgeY = ax === 1 && (k + sg < 0 || k + sg >= H);
      for (let v = 0; v < nv; v++) {
        let i = i0 + v * sv;
        for (let u = 0; u < nu; u++, i += su) {
          let show = 0;
          if (occ[i] === 1) {
            const t = edgeY ? (sg < 0 ? 1 : 0) : occ[i + off];
            show = t === 0 || (t >= 2 && !covers(t)) ? 1 : 0;
            if (show) any = true;
          }
          mask[u + nu * v] = show;
        }
      }
      if (!any) continue;
      for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
        if (!mask[u + nu * v]) continue;
        let w = 1, h = 1;
        while (w < MERGE && u + w < nu && mask[u + w + nu * v]) w++;
        grow: while (h < MERGE && v + h < nv) {
          for (let i = 0; i < w; i++) if (!mask[u + i + nu * (v + h)]) break grow;
          h++;
        }
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) mask[u + i + nu * (v + j)] = 0;
        const plane = k + (sg > 0 ? 1 : 0), U0 = lo[ua] + u, V0 = lo[va] + v;
        const corner = (du, dv) => { const p = [0, 0, 0]; p[ax] = plane; p[ua] = U0 + du; p[va] = V0 + dv; return p; };
        quad([corner(0, 0), corner(w, 0), corner(w, h), corner(0, h)], n);
      }
    }
  }
  // pieces: the top as two triangles over each quarter of the cell (split the way the shape
  // creases), then the sides, a column for each half of the side
  const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
  const face = (p) => { // triangle with a normal of its own, facing out (the corners go round anticlockwise seen from outside)
    _c.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]); _d.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
    _e.crossVectors(_c, _d);
    const l = _e.length();
    if (l < 1e-6) return;
    _e.divideScalar(l);
    const nn = [_e.x, _e.y, _e.z];
    idx.push(vert(p[0], nn), vert(p[1], nn), vert(p[2], nn));
  };
  const done = new Uint8Array(occ.length), D_ = (x, y, z) => at(x - x0 + M, y, z - z0 + M);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) for (let y = Math.max(1, yMin); y <= yMax; y++) {
    const t = O(x, y, z);
    if (t < 2) continue;
    const code = t - 2, g = PIECE_GRID[code], hp = (i, j) => [x + i / 2, y + g[i + 3 * j], z + j / 2];
    const kind = code >> 2, alongX = (code & 3) < 2;
    // most tops are one flat quad or two triangles over the whole cell; a steep slope's isn't. A
    // row of the same plain or gentle slope side by side is one quad.
    const a0 = g[0], b0 = g[2], c0 = g[8], d0 = g[6], mid = g[4];
    if (kind === PIECE.slope || kind === PIECE.gentleLow || kind === PIECE.gentleHigh) {
      let len = done[D_(x, y, z)] ? 0 : 1; // 0: already part of a row drawn before
      if (len)
      while (len < MERGE && (alongX ? z + len < z1 && O(x, y, z + len) === t && !done[D_(x, y, z + len)] : x + len < x1 && O(x + len, y, z) === t && !done[D_(x + len, y, z)])) len++;
      for (let k = 1; k < len; k++) done[alongX ? D_(x, y, z + k) : D_(x + k, y, z)] = 1;
      if (len) {
        const ex = alongX ? 1 : len, ez = alongX ? len : 1;
        const P00 = [x, y + a0, z], P10 = [x + ex, y + b0, z], P11 = [x + ex, y + c0, z + ez], P01 = [x, y + d0, z + ez];
        face([P00, P01, P11]); face([P00, P11, P10]);
      }
    } else if (Math.abs((a0 + c0) / 2 - mid) < 1e-6 && Math.abs(g[1] - (a0 + b0) / 2) < 1e-6 && Math.abs(g[7] - (c0 + d0) / 2) < 1e-6) {
      face([hp(0, 0), hp(0, 2), hp(2, 2)]); face([hp(0, 0), hp(2, 2), hp(2, 0)]);
    } else if (Math.abs((b0 + d0) / 2 - mid) < 1e-6 && Math.abs(g[1] - (a0 + b0) / 2) < 1e-6 && Math.abs(g[7] - (c0 + d0) / 2) < 1e-6) {
      face([hp(0, 0), hp(0, 2), hp(2, 0)]); face([hp(2, 0), hp(0, 2), hp(2, 2)]);
    } else for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const a = g[i + 3 * j], b = g[i + 1 + 3 * j], c = g[i + 1 + 3 * (j + 1)], d = g[i + 3 * (j + 1)];
      if (a + b + c + d === 0) continue;
      const m = pieceHeight(code, (i + 0.5) / 2, (j + 0.5) / 2);
      const P = [hp(i, j), hp(i + 1, j), hp(i + 1, j + 1), hp(i, j + 1)];
      // anticlockwise from above is a, d, c, b
      if (Math.abs((a + c) / 2 - m) < 1e-6) { face([P[0], P[3], P[2]]); face([P[0], P[2], P[1]]); }
      else { face([P[0], P[3], P[1]]); face([P[1], P[3], P[2]]); }
    }
    for (let sd = 0; sd < 4; sd++) {
      const [dx, dz] = SLOPE_DIRS4[sd], o = O(x + dx, y, z + dz);
      if (o === 1) continue;
      const mine = PIECE_SIDE[code * 4 + sd];
      if (o >= 2) { const theirs = PIECE_SIDE[(o - 2) * 4 + (sd ^ 1)]; if (mine[0] === theirs[0] && mine[1] === theirs[1] && mine[2] === theirs[2]) continue; }
      // the side's three heights run along +z (on an x side) or +x (on a z side)
      const X = dx ? x + (dx > 0 ? 1 : 0) : 0, Z = dz ? z + (dz > 0 ? 1 : 0) : 0;
      const pt = (k, h) => (dx ? [X, y + h, z + k / 2] : [x + k / 2, y + h, Z]);
      // outward normal is +x/-x/+z/-z; flip the winding for the sides where k runs the other way round
      const flip = dx > 0 || dz < 0;
      // one piece where the side's top is straight, else a column for each half
      const straight = Math.abs(mine[1] - (mine[0] + mine[2]) / 2) < 1e-6, step = straight ? 2 : 1;
      for (let k = 0; k < 2; k += step) {
        const h0 = mine[k], h1 = mine[k + step];
        if (h0 + h1 === 0) continue;
        const q = [pt(k, 0), pt(k + step, 0), pt(k + step, h1), pt(k, h0)];
        if (flip) { face([q[0], q[2], q[1]]); face([q[0], q[3], q[2]]); }
        else { face([q[0], q[1], q[2]]); face([q[0], q[2], q[3]]); }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}
const SLOPE_DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// Every piece's height at the 3 x 3 corners and middles of its cell (x fastest), the heights along
// each of its sides (+x, -x, +z, -z; along z for x sides, along x for z sides), and whether a side
// is a whole square (covering the ground face behind it).
// (Filled in on first use: voxels.js and this module import each other.)
const PIECE_GRID = [], PIECE_SIDE = [], PIECE_FULL = [];
function pieceTables() {
  if (PIECE_GRID.length) return;
  for (let code = 0; code < 24; code++) {
  const g = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) g.push(pieceHeight(code, i / 2, j / 2));
  PIECE_GRID[code] = g;
  const sides = [[2, 5, 8], [0, 3, 6], [6, 7, 8], [0, 1, 2]].map((ix) => ix.map((k) => g[k]));
  for (let sd = 0; sd < 4; sd++) { PIECE_SIDE[code * 4 + sd] = sides[sd]; PIECE_FULL[code * 4 + sd] = sides[sd].every((h) => h === 1); }
  }
}
