import { hash1 } from '../noise.js';
import { hideBlock, placeBlock } from './blocks.js';

// ---------------------------------------------------------------------------
// Ice spikes, built from real blocks: a tapering spire of packed ice (a little clear ice mixed in),
// stepped in by slopes wherever it narrows and finished with a thin pillar at the tip. Every block
// can be mined on its own and gives itself back, like anything you build. Most spikes are small and
// a few are huge. Blocks nobody can see (inside, or under the ground) wait in `hidden` until mining
// opens them up.
// ---------------------------------------------------------------------------
// `p`: { x, y, z, tint, rot } where the spike stands (y: the ground); `surface(x, z)`: ground height.
// Returns how many blocks it has, seen and hidden.
export function buildIceSpike(p, surface, tag) {
  const big = p.tint ** 1.6;
  const H = Math.round(6 + big * 17);                      // levels above the ground
  const R = 0.85 + big * 1.5;                              // radius at the foot, in blocks
  const lean = hash1(p.x * 1.7 + p.z) * Math.min(1.6, H / 9); // tall ones lean a little at the top
  const lx = Math.cos(p.rot), lz = Math.sin(p.rot);
  const cx = Math.floor(p.x), cz = Math.floor(p.z), y0 = Math.floor(p.y);
  // the cells of each level: within the level's radius of its (slightly leaning) centre
  const levels = [];
  for (let k = 0; k < H; k++) {
    const t = k / H, r = R * (1 - t) ** 1.25 + 0.3;
    const ox = cx + 0.5 + lx * lean * t * t, oz = cz + 0.5 + lz * lean * t * t;
    const ring = new Set(), n = Math.ceil(r) + 1;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const x = Math.floor(ox) + i, z = Math.floor(oz) + j;
      if ((x + 0.5 - ox) ** 2 + (z + 0.5 - oz) ** 2 <= r * r) ring.add(`${x},${z}`);
    }
    if (!ring.size) ring.add(`${Math.floor(ox)},${Math.floor(oz)}`);
    levels.push(ring);
  }
  const cells = new Map(); // "x,y,z" -> [type, x, y, z, shape, turn]
  const put = (type, x, y, z, shape, turn) => cells.set(`${x},${y},${z}`, [type, x, y, z, shape, turn]);
  const ice = (x, y, z) => (hash1(x * 3.7 + y * 11.3 + z * 5.1) < 0.12 ? 'ice' : 'packed_ice');
  const thin = (k) => levels[k].size === 1 && (k === H - 1 || levels[k + 1].size === 1);
  levels.forEach((layer, k) => {
    const y = y0 + k;
    for (const c of layer) {
      const [x, z] = c.split(',').map(Number);
      // the foot reaches down to the ground where it slopes away, so nothing floats
      const bottom = k === 0 ? Math.min(y, Math.floor(surface(x + 0.5, z + 0.5))) : y;
      for (let yy = bottom; yy < y; yy++) put(ice(x, yy, z), x, yy, z, 'block');
      put(ice(x, y, z), x, y, z, k === H - 1 || (thin(k) && k > H * 0.6) ? 'pillar' : 'block');
    }
    // where the spire narrows, a slope on each step, rising toward the spire
    if (k === 0 || thin(k)) return;
    for (const c of levels[k - 1]) {
      if (layer.has(c)) continue;
      const [x, z] = c.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!layer.has(`${x + dx},${z + dz}`)) continue;
        put(ice(x, y, z), x, y, z, 'slope', Math.atan2(-dx, -dz)); // a slope's high side is its local -z
        break;
      }
    }
  });
  // a full block is hidden when full blocks (or the ground) are on all six sides
  const full = (x, y, z) => cells.get(`${x},${y},${z}`)?.[4] === 'block';
  const buried = (x, y, z) => y + 1 < surface(x + 0.5, z + 0.5) - 0.3;
  for (const [type, x, y, z, shape, turn] of cells.values()) {
    const shut = shape === 'block' && (buried(x, y, z) ||
      [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].every(([dx, dy, dz]) => full(x + dx, y + dy, z + dz) || buried(x + dx, y + dy, z + dz)));
    (shut ? hideBlock : placeBlock)(type, x, y, z, shape, 0, { turn, tag });
  }
  return cells.size;
}
