import * as THREE from 'three';

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
