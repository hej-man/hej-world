import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Falling trees: a chopped tree tips over away from you, slowly at first and faster as it goes,
// lands with a little bounce, lies there a moment and then shrinks away (its wood is already in
// your bag). It turns all the tree's parts (trunk, branches, leaves) about the foot of the trunk.
// ---------------------------------------------------------------------------
const falling = [];
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Matrix4(), _t = new THREE.Matrix4(), _ti = new THREE.Matrix4();
export const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

// `tg`: the tree's target (its parts are [instanced mesh, index]); it falls away from (fromX, fromZ).
export function fellTree(tg, fromX, fromZ) {
  let dx = tg.x - fromX, dz = tg.z - fromZ;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= d; dz /= d; }
  // turning about up x direction tips the top toward the direction
  const axis = new THREE.Vector3(dz, 0, -dx);
  const start = tg.parts.map(([mesh, i]) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); return m; });
  falling.push({ parts: tg.parts, start, base: new THREE.Vector3(tg.x, tg.y, tg.z), axis, t: 0 });
}

const FALL = 1.5, LIE = 1.2, SHRINK = 0.5;
export function updateFelling(dt) {
  for (let k = falling.length - 1; k >= 0; k--) {
    const f = falling[k];
    f.t += dt;
    const done = f.t >= FALL + LIE + SHRINK;
    if (!done) {
      // tipping: angle grows like a falling stick (slow start), then a small bounce on the ground
      const u = Math.min(1, f.t / FALL);
      let angle = (Math.PI / 2 - 0.08) * u * u;
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
