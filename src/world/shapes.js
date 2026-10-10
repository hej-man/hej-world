import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

// ---------------------------------------------------------------------------
// Block shapes: the geometry of a 1 m cell in each buildable shape, centred on the origin
// ---------------------------------------------------------------------------
// Shapes you can build with; B switches the shape of the blocks you place. Slopes, stairs and roof
// prisms turn to face the way you look (a slope rises away from you).
export const SHAPES = ['block', 'slab', 'slope', 'stairs', 'prism', 'pillar'];
export const SHAPE_NAMES = { block: 'Block', slab: 'Half slab', slope: 'Slope', stairs: 'Stairs', prism: 'Roof prism', pillar: 'Pillar' };


// Triangles [[a, b, c], ...] -> geometry with flat normals; each triangle is turned to face away from
// `inside`, so the faces don't have to be listed in a particular winding order.
function trianglesGeometry(tris, inside) {
  const pos = [], A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (const [a, b, c] of tris) {
    A.fromArray(a); B.fromArray(b); C.fromArray(c);
    n.subVectors(C, B).cross(m.subVectors(A, B));
    m.copy(A).add(B).add(C).divideScalar(3).sub(inside);
    if (n.dot(m) < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
export function mergeGeometries(list) {
  const out = { position: [], normal: [] };
  for (let g of list) { g = g.index ? g.toNonIndexed() : g; for (const k in out) out[k].push(...g.attributes[k].array); }
  const g = new THREE.BufferGeometry();
  for (const k in out) g.setAttribute(k, new THREE.Float32BufferAttribute(out[k], 3));
  return g;
}
// Texture coordinates projected along each face's main axis; sides use the left half of a block's
// texture and tops/bottoms the right half (a log's rings, a workbench's top).
export function boxUVs(g) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(b.clone().sub(a)).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      let u, w, top = false;
      if (ay >= 0.75) { u = v.x + 0.5; w = v.z + 0.5; top = true; }
      else if (ax > az) { u = v.z + 0.5; w = v.y + 0.5; }
      else { u = v.x + 0.5; w = v.y + 0.5; }
      u = 0.01 + Math.min(1, Math.max(0, u)) * 0.98;
      uv[(i + k) * 2] = top ? 0.5 + u * 0.5 : u * 0.5; uv[(i + k) * 2 + 1] = Math.min(1, Math.max(0, w));
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// Every shape has rounded edges: the shape is shrunk by EDGE and grown back by a sphere of radius
// EDGE (a Minkowski sum), so flat faces stay flat and edges and corners become smooth curves.
const EDGE = 0.07;
const _sphereDirs = (() => {
  const d = [];
  for (const a of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) d.push(new THREE.Vector3(...a));
  const n = 40; // plus an even spread of directions (Fibonacci sphere)
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), t = i * 2.39996;
    d.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r));
  }
  return d;
})();
// Rounded convex solid from the corner points of a convex shape.
function roundedConvex(points) {
  // the shape's face planes (outward normal n, offset w: n.p <= w), from its convex hull
  const hull = new ConvexGeometry(points), hp = hull.attributes.position, planes = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const mid = points.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(points.length);
  for (let i = 0; i < hp.count; i += 3) {
    a.fromBufferAttribute(hp, i); b.fromBufferAttribute(hp, i + 1); c.fromBufferAttribute(hp, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(c.clone().sub(a)).normalize();
    if (n.dot(a.clone().sub(mid)) < 0) n.negate();
    if (!planes.some((q) => q.n.dot(n) > 0.9999)) planes.push({ n, w: n.dot(a) });
  }
  // shrink: move every plane in by EDGE and find the new corners where three planes meet
  const inner = [], m = new THREE.Matrix3(), v = new THREE.Vector3();
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const [P, Q, R] = [planes[i], planes[j], planes[k]];
    m.set(P.n.x, P.n.y, P.n.z, Q.n.x, Q.n.y, Q.n.z, R.n.x, R.n.y, R.n.z);
    if (Math.abs(m.determinant()) < 1e-6) continue;
    v.set(P.w - EDGE, Q.w - EDGE, R.w - EDGE).applyMatrix3(m.invert());
    if (planes.every((q) => q.n.dot(v) <= q.w - EDGE + 1e-5) && !inner.some((u) => u.distanceToSquared(v) < 1e-8)) inner.push(v.clone());
  }
  // grow back: each inner corner plus a sphere of directions; a hull point's normal is its direction
  const pts = [], dirs = new Map(), key = (p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
  for (const q of inner) for (const d of [..._sphereDirs, ...planes.map((pl) => pl.n)]) {
    const p = q.clone().addScaledVector(d, EDGE);
    pts.push(p); dirs.set(key(p), d);
  }
  const g = new ConvexGeometry(pts), pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const d = dirs.get(key(a.fromBufferAttribute(pos, i)));
    if (d) nor.setXYZ(i, d.x, d.y, d.z);
  }
  return g;
}
// Rounding pulls sharp (less than 90 degree) edges in, so a slope's tip and toe would stop short of
// the cell's sides; stretch the shape back out to fill the cell, so neighbours still meet.
function fillCell(g) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, sc = new THREE.Vector3(1 / (max.x - min.x), 1 / (max.y - min.y), 1 / (max.z - min.z));
  const pos = g.attributes.position, nor = g.attributes.normal, n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, (pos.getX(i) - min.x) * sc.x - 0.5, (pos.getY(i) - min.y) * sc.y - 0.5, (pos.getZ(i) - min.z) * sc.z - 0.5);
    n.fromBufferAttribute(nor, i).divide(sc).normalize(); // normals take the inverse stretch
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}
const boxPoints = (x0, y0, z0, x1, y1, z1) => [[x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1]].map((p) => new THREE.Vector3(...p));
export const roundedBox = (w, h, d, x = 0, y = 0, z = 0) => roundedConvex(boxPoints(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2));

// The sharp version of each shape, used for collision.
const _sharpGeos = {};
export function sharpShape(shape) {
  if (_sharpGeos[shape]) return _sharpGeos[shape];
  const l = -0.5, h = 0.5;
  // bottom corners A B (front) C D (back); top edge E F: at the back for a slope, along the middle for a prism
  const A = [l, l, h], B = [h, l, h], C = [h, l, l], D = [l, l, l];
  const zt = shape === 'slope' ? l : 0, E = [l, h, zt], F = [h, h, zt];
  const tris = [[A, B, C], [A, C, D], [A, B, F], [A, F, E], [D, C, F], [D, F, E], [A, D, E], [B, C, F]];
  return (_sharpGeos[shape] = trianglesGeometry(tris, new THREE.Vector3(0, -0.2, shape === 'slope' ? -0.2 : 0)));
}

const _shapeGeos = {};
export function shapeGeometry(shape) {
  if (_shapeGeos[shape]) return _shapeGeos[shape];
  const l = -0.5, h = 0.5;
  let g;
  if (shape === 'slab') g = roundedBox(1, 0.5, 1, 0, -0.25, 0);
  else if (shape === 'pillar') {
    const pts = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; for (const y of [l, h]) pts.push(new THREE.Vector3(Math.cos(a) * 0.3, y, Math.sin(a) * 0.3)); }
    g = roundedConvex(pts);
  } else if (shape === 'stairs') g = mergeGeometries([roundedBox(1, 0.5, 1, 0, -0.25, 0), roundedBox(1, 0.5, 0.5, 0, 0.25, -0.25)]);
  else if (shape === 'slope' || shape === 'prism') {
    const zt = shape === 'slope' ? l : 0;
    g = fillCell(roundedConvex([[l, l, h], [h, l, h], [h, l, l], [l, l, l], [l, h, zt], [h, h, zt]].map((p) => new THREE.Vector3(...p))));
  } else g = roundedBox(1, 1, 1);
  return (_shapeGeos[shape] = boxUVs(g));
}
