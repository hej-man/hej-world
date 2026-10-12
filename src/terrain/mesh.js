import * as THREE from 'three';
import { WORLD } from '../config.js';

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
// Block meshing: the ground as 1 m cubes and slopes (see voxels.js). Faces between ground and air
// are joined into rectangles of up to MERGE x MERGE cells (fewer triangles; the ground's look is
// still worked out per corner), and each slope is a ramp with a triangle on each open side.
// Covers cells x0 <= x < x1, z0 <= z < z1 (metres); every face belongs to the cell it bounds, so
// neighbouring chunks never draw the same face.
// ---------------------------------------------------------------------------
const MERGE = 8;
export function blockMesh(x0, x1, z0, z1, fillSolid, slopeDir) {
  const M = 2, W = x1 - x0, D = z1 - z0, LX = W + 2 * M, LZ = D + 2 * M, H = WORLD.height;
  // ground (1), slope rising +x/-x/+z/-z (2..5) or air (0), for the chunk plus a border
  const solid = new Uint8Array(LX * H * LZ), at = (lx, y, lz) => lx + LX * (y + H * lz);
  fillSolid(x0 - M, z0 - M, LX, LZ, solid);
  let yTop = 0;
  for (let i = solid.length - 1; i >= 0; i--) if (solid[i]) { const y = Math.floor(i / LX) % H; if (y > yTop) yTop = y; }
  const S = (lx, y, lz) => (y < 0 ? 1 : y >= H || lx < 0 || lz < 0 || lx >= LX || lz >= LZ ? 0 : solid[at(lx, y, lz)] === 1);
  const occ = new Uint8Array(solid.length);
  for (let lz = 1; lz < LZ - 1; lz++) for (let lx = 1; lx < LX - 1; lx++) for (let y = 0; y <= Math.min(H - 1, yTop + 1); y++) {
    const i = at(lx, y, lz);
    if (solid[i]) { occ[i] = 1; continue; }
    if (!solid[at(lx, Math.max(0, y - 1), lz)] && y > 0) continue;
    const d = slopeDir(x0 + lx - M, y, z0 + lz - M, (x, yy, z) => S(x - x0 + M, yy, z - z0 + M));
    if (d >= 0) occ[i] = 2 + d;
  }
  const O = (x, y, z) => (y < 0 ? 1 : y >= H ? 0 : occ[at(x - x0 + M, y, z - z0 + M)]); // world cell coords

  // corners shared by faces with the same normal are one vertex (key: position and normal)
  const pos = [], nor = [], idx = [], seen = new Map();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
  const vert = (q, n) => {
    const key = q[0] + 1025 * (q[1] + 130 * (q[2] + 1025 * ((Math.sign(n[0]) + 1) * 9 + (Math.sign(n[1]) + 1) * 3 + Math.sign(n[2]) + 1)));
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
  const tri = (p, n) => {
    const [a, b, c] = p.map((q) => vert(q, n));
    if (facing(p, n)) idx.push(a, b, c); else idx.push(a, c, b);
  };
  // the lowest air in the area: below it every cell is buried ground with no faces
  let yLow = yTop + 1;
  for (let lz = 1; lz < LZ - 1 && yLow > 0; lz++) for (let lx = 1; lx < LX - 1; lx++) {
    for (let y = 0; y < yLow; y++) if (!solid[at(lx, y, lz)]) { yLow = y; break; }
  }
  const yMax = Math.min(H - 1, yTop + 1), yMin = Math.max(0, yLow - 1);
  // the six directions as (axis of the normal, sign); u, v are the face's two other axes. A ground
  // cell shows a face toward air, or toward a slope unless the slope stands on it or leans on it.
  for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const n = [0, 0, 0]; n[ax] = sg;
    const off = n[0] + LX * (n[1] + H * n[2]);
    const hides = ax === 1 ? -1 : 2 + SLOPE_DIRS4.findIndex(([dx, dz]) => dx === -n[0] && dz === -n[2]);
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
            show = t === 0 || (t >= 2 && ax !== 1 && t !== hides) ? 1 : 0;
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
  // slopes: a ramp from the open side up to the high side, and a triangle on each open flank.
  // A row of slopes facing the same way side by side is one ramp.
  const R = Math.SQRT1_2, done = new Uint8Array(occ.length);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) for (let y = Math.max(1, yMin); y <= yMax; y++) {
    const t = O(x, y, z);
    if (t < 2 || done[at(x - x0 + M, y, z - z0 + M)]) continue;
    const d = t - 2, [dx, dz] = SLOPE_DIRS4[d];
    // run sideways (along z for a slope rising along x, and the other way round) while it continues
    let len = 1;
    while (len < MERGE && (dx ? z + len < z1 && O(x, y, z + len) === t : x + len < x1 && O(x + len, y, z) === t)) len++;
    for (let k = 0; k < len; k++) done[at(x - x0 + M + (dx ? 0 : k), y, z - z0 + M + (dx ? k : 0))] = 1;
    if (dx) {
      const lowA = x + (dx > 0 ? 0 : 1), highA = x + (dx > 0 ? 1 : 0);
      quad([[lowA, y, z], [lowA, y, z + len], [highA, y + 1, z + len], [highA, y + 1, z]], [-dx * R, R, 0]);
      for (const [sz, nz, side] of [[z, z - 1, -1], [z + len, z + len, 1]]) {
        const o = O(x, y, nz);
        if (o === 1 || o === t) continue;
        tri([[lowA, y, sz], [highA, y, sz], [highA, y + 1, sz]], [0, 0, side]);
      }
    } else {
      const lowB = z + (dz > 0 ? 0 : 1), highB = z + (dz > 0 ? 1 : 0);
      quad([[x, y, lowB], [x + len, y, lowB], [x + len, y + 1, highB], [x, y + 1, highB]], [0, R, -dz * R]);
      for (const [sx, nx, side] of [[x, x - 1, -1], [x + len, x + len, 1]]) {
        const o = O(nx, y, z);
        if (o === 1 || o === t) continue;
        tri([[sx, y, lowB], [sx, y, highB], [sx, y + 1, highB]], [side, 0, 0]);
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
