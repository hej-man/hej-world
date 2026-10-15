import * as THREE from 'three';
import { CELL, cellKey, targetGrid } from './world.js';

// ---------------------------------------------------------------------------
// Falling trees: a chopped tree tips over away from you, slowly at first and faster as it goes,
// lands with a little bounce, lies there a moment and then shrinks away (its wood is already in
// your bag). It turns all the tree's parts (trunk, branches, leaves) about the foot of the trunk.
// A falling tree that comes down on another tree knocks it over too, the same way (a little to
// either side), and that one can knock over the next: chop the right tree and a row goes down.
// ---------------------------------------------------------------------------
const falling = [];
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Matrix4(), _t = new THREE.Matrix4(), _ti = new THREE.Matrix4();
export const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

const FALL = 1.5, LIE = 1.2, SHRINK = 0.5, LEAN = Math.PI / 2 - 0.08;
// How tall a tree is, from the spheres that make up its crown.
const heightOf = (tg) => Math.max(3, ...tg.spheres.map(([, y, , r]) => y + r - tg.y));
// The standing trees a tree falling along (dx, dz) will hit, and when: its trunk sweeps down
// through them once its top has leaned out as far as they stand.
function treesInPath(tg, dx, dz) {
  const H = heightOf(tg), hits = [];
  const c0 = Math.floor((tg.x - H) / CELL), c1 = Math.floor((tg.x + H) / CELL), d0 = Math.floor((tg.z - H) / CELL), d1 = Math.floor((tg.z + H) / CELL);
  for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
    for (const o of targetGrid.get(cellKey(i, j)) || []) {
      if (o === tg || o.kind !== 'tree') continue;
      const vx = o.x - tg.x, vz = o.z - tg.z, along = vx * dx + vz * dz, side = Math.abs(vx * dz - vz * dx);
      // close enough sideways for the trunk or the crown to catch it, on ground not far above
      if (along < 0.6 || along > H * 0.92 || side > 1.3 || o.y + heightOf(o) < tg.y + 1 || o.y > tg.y + H * Math.sqrt(1 - (along / H) ** 2) - 1) continue;
      const angle = Math.asin(Math.min(1, along / H));
      hits.push({ tree: o, t: Math.sqrt(Math.min(1, angle / LEAN)) * FALL, done: false });
    }
  }
  return hits;
}

// `tg`: the tree's target (its parts are [instanced mesh, index]); it falls away from (fromX, fromZ),
// or along `dir` ([dx, dz]) when it's given. `onHit(tree, dx, dz)` is called for each standing tree
// it comes down on, with the way that one should fall.
export function fellTree(tg, fromX, fromZ, { dir = null, onHit = null } = {}) {
  let dx = dir ? dir[0] : tg.x - fromX, dz = dir ? dir[1] : tg.z - fromZ;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= d; dz /= d; }
  // turning about up x direction tips the top toward the direction
  const axis = new THREE.Vector3(dz, 0, -dx);
  const start = tg.parts.map(([mesh, i]) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return m; });
  const hits = onHit ? treesInPath(tg, dx, dz) : [];
  falling.push({ parts: tg.parts, start, base: new THREE.Vector3(tg.x, tg.y, tg.z), axis, t: 0, dx, dz, hits, onHit });
}

export function updateFelling(dt) {
  for (let k = falling.length - 1; k >= 0; k--) {
    const f = falling[k];
    f.t += dt;
    for (const h of f.hits) {
      if (h.done || f.t < h.t) continue;
      h.done = true;
      // the struck tree goes the same way, turned up to 25° to one side
      const a = (Math.random() - 0.5) * 0.9, c = Math.cos(a), s = Math.sin(a);
      f.onHit(h.tree, f.dx * c - f.dz * s, f.dx * s + f.dz * c);
    }
    const done = f.t >= FALL + LIE + SHRINK;
    if (!done) {
      // tipping: angle grows like a falling stick (slow start), then a small bounce on the ground
      const u = Math.min(1, f.t / FALL);
      let angle = LEAN * u * u;
      if (f.t > FALL) angle -= Math.sin(Math.min(1, (f.t - FALL) / 0.35) * Math.PI) * 0.06;
      const shrink = 1 - Math.max(0, f.t - FALL - LIE) / SHRINK;
      _t.makeTranslation(f.base.x, f.base.y, f.base.z); _ti.makeTranslation(-f.base.x, -f.base.y, -f.base.z);
      _r.makeRotationAxis(f.axis, angle); _s.makeScale(shrink, shrink, shrink);
      _m.multiplyMatrices(_t, _r).multiply(_s).multiply(_ti);
    }
    f.parts.forEach(([mesh, i], n) => {
      mesh.setMatrixAt(i, done ? hiddenMatrix : _r.multiplyMatrices(_m, f.start[n]));
      mesh.instanceMatrix.needsUpdate = true;
    });
    if (done) falling.splice(k, 1);
  }
}
export function clearFelling() { falling.length = 0; }
