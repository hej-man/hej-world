import { terrainFns } from './world.js';

// ---------------------------------------------------------------------------
// The river, the lakes and the volcanoes' lava lakes go up and down. Rain fills the river and the
// lakes (a storm faster), and sunshine slowly dries them: in a long dry spell the river shrinks to a
// narrow stream between dry banks, after heavy rain it spills a little over them. Scooping water or
// lava out takes a little from them each time, and water you pour into them adds to them. A crater
// refills on its own, slowly, from below.
//
// The levels live on the terrain functions (terrainFns.live.sea, each lake's `offset`, each
// volcano's `lavaY`), so everything that asks waterAt or craterLavaAt sees the current level.
// ---------------------------------------------------------------------------
export const RIVER = { low: -2.6, high: 0.9 };   // metres from the level the land was shaped for
export const LAKE = { low: -1.4, high: 0.35 };
export const LAVA_LOW = 3;                         // how far a crater's lava can be scooped down

// Each bucket takes or adds this much (metres), a bottle a quarter of it.
const RIVER_PER_BUCKET = 0.01, LAKE_PER_BUCKET = 0.02, LAVA_PER_BUCKET = 0.06;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function updateHydro(dt, rain, sun) {
  const T = terrainFns;
  if (!T?.live) return;
  // rain raises the water about a centimetre a second in a storm; sun lowers it a third as fast;
  // under grey skies it creeps back toward its usual level
  const still = rain < 0.05 && sun < 0.2;
  const drift = (v) => (still ? -Math.sign(v) * Math.min(Math.abs(v), 0.0005 * dt) : 0);
  T.live.sea = clamp(T.live.sea + (rain * 0.009 - sun * 0.003) * dt + drift(T.live.sea), RIVER.low, RIVER.high);
  for (const lk of T.lakes) lk.offset = clamp(lk.offset + (rain * 0.006 - sun * 0.002) * dt + drift(lk.offset), LAKE.low, LAKE.high);
  for (const v of T.volcanoes) if (v.lavaY < v.lavaTop) v.lavaY = Math.min(v.lavaTop, v.lavaY + 0.01 * dt);
}

// Scooping from the river, the sea or a lake at (x, z): `amount` is 1 for a bucket.
export function takeFromNature(x, z, amount = 1) {
  const T = terrainFns, lk = T.lakeAt(x, z);
  if (lk) lk.offset = Math.max(LAKE.low, lk.offset - LAKE_PER_BUCKET * amount);
  else T.live.sea = Math.max(RIVER.low, T.live.sea - RIVER_PER_BUCKET * amount);
}
// Water you pour that runs into the river or a lake.
export function pourIntoNature(x, z, amount = 1) {
  const T = terrainFns, lk = T.lakeAt(x, z);
  if (lk) lk.offset = Math.min(LAKE.high, lk.offset + LAKE_PER_BUCKET * amount);
  else T.live.sea = Math.min(RIVER.high, T.live.sea + RIVER_PER_BUCKET * amount);
}
// Scooping lava from a crater lake.
export function takeCraterLava(v) {
  v.lavaY = Math.max(v.lavaTop - LAVA_LOW, v.lavaY - LAVA_PER_BUCKET);
}
