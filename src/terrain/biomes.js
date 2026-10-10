// ---------------------------------------------------------------------------
// Biomes. Two slow noise fields give every point a temperature and a humidity (mountains are
// colder); each biome sits at a spot in that climate space and the nearest one wins, blending
// into its neighbours over a short distance so the borders aren't hard lines.
//
// Per biome:
//   at:      [temperature, humidity], both 0..1
//   ground:  the surface it's covered with: weights for grass, forest floor, dirt and sand, plus
//            snow, sandstone, red sand and terracotta bands; tint multiplies the ground colour
//   grass:   how much grass grows (0..1) and its colour
//   trees:   how dense the trees are (0..1) and which kinds, by weight (see world/vegetation.js)
//   plants:  small things growing on the ground, as chances per spot
//   animals: which kinds live here (see animals/animals.js)
//   shape:   changes to the land: 'dunes', 'terraces' (mesa plateaus), 'flat', 'hills'
// ---------------------------------------------------------------------------
export const BIOMES = {
  plains: {
    name: 'Plains', at: [0.58, 0.32],
    ground: { grass: 1, tint: [1.02, 1.04, 0.92] }, grass: { amount: 1, color: [1, 1.04, 0.86] },
    trees: { density: 0.05, mix: { oak: 3, birch: 1 } }, plants: { flowers: 0.05, bush: 0.02 },
    animals: ['cow', 'pig', 'sheep', 'chicken', 'rabbit'], shape: 'flat',
  },
  forest: {
    name: 'Forest', at: [0.58, 0.68],
    ground: { grass: 0.3, forest: 0.7 }, grass: { amount: 0.35, color: [0.95, 1.02, 0.9] },
    trees: { density: 0.85, mix: { oak: 5, birch: 2, pine: 1 } }, plants: { bush: 0.05, flowers: 0.01, mushrooms: 0.01 },
    animals: ['deer', 'boar', 'wolf', 'bear', 'rabbit'],
  },
  birch_forest: {
    name: 'Birch forest', at: [0.5, 0.52],
    ground: { grass: 0.6, forest: 0.4, tint: [1.04, 1.04, 0.96] }, grass: { amount: 0.7, color: [1.05, 1.08, 0.85] },
    trees: { density: 0.65, mix: { birch: 6, oak: 1 } }, plants: { flowers: 0.04, bush: 0.03 },
    animals: ['deer', 'rabbit', 'chicken', 'fox'],
  },
  dark_forest: {
    name: 'Dark forest', at: [0.6, 0.95],
    ground: { forest: 1, tint: [0.78, 0.8, 0.72] }, grass: { amount: 0.15, color: [0.8, 0.9, 0.75] },
    trees: { density: 1, mix: { dark_oak: 6, oak: 1 } }, plants: { mushrooms: 0.06, bush: 0.02 },
    animals: ['wolf', 'bear', 'boar', 'spider'],
  },
  autumn_forest: {
    name: 'Autumn forest', at: [0.42, 0.42],
    ground: { grass: 0.35, forest: 0.65, tint: [1.18, 0.92, 0.66] }, grass: { amount: 0.5, color: [1.25, 1.0, 0.6] },
    trees: { density: 0.7, mix: { maple: 5, birch: 2, oak: 1 } }, plants: { pumpkins: 0.006, mushrooms: 0.02, bush: 0.03 },
    animals: ['deer', 'fox', 'boar', 'rabbit'],
  },
  cherry_grove: {
    name: 'Cherry grove', at: [0.5, 0.2],
    ground: { grass: 1, tint: [1.08, 1.02, 0.98] }, grass: { amount: 0.9, color: [1.05, 1.08, 0.9] },
    trees: { density: 0.3, mix: { cherry: 1 } }, plants: { petals: 0.12, flowers: 0.04 },
    animals: ['rabbit', 'sheep', 'deer'], shape: 'hills',
  },
  taiga: {
    name: 'Taiga', at: [0.32, 0.58],
    ground: { grass: 0.25, forest: 0.6, dirt: 0.15, tint: [0.9, 0.92, 0.82] }, grass: { amount: 0.4, color: [0.85, 0.95, 0.8] },
    trees: { density: 0.8, mix: { pine: 6, birch: 1 } }, plants: { bush: 0.05, ferns: 0.06, mushrooms: 0.01 },
    animals: ['wolf', 'fox', 'deer', 'rabbit', 'bear'],
  },
  redwood_forest: {
    name: 'Old redwood forest', at: [0.36, 0.88],
    ground: { forest: 0.7, dirt: 0.3, tint: [1.0, 0.82, 0.68] }, grass: { amount: 0.25, color: [0.9, 0.95, 0.75] },
    trees: { density: 0.55, mix: { redwood: 4, pine: 2 } }, plants: { ferns: 0.12, mushrooms: 0.02 },
    animals: ['deer', 'wolf', 'bear', 'fox'],
  },
  snowy_taiga: {
    name: 'Snowy taiga', at: [0.18, 0.62],
    ground: { forest: 0.3, snow: 0.85 }, grass: { amount: 0.05, color: [0.8, 0.9, 0.85] },
    trees: { density: 0.6, mix: { pine: 1 }, snowy: true }, plants: { bush: 0.02 },
    animals: ['wolf', 'fox', 'rabbit', 'polar_bear'],
  },
  snowy_plains: {
    name: 'Snowy plains', at: [0.06, 0.28],
    ground: { snow: 1 }, grass: { amount: 0 },
    trees: { density: 0.02, mix: { pine: 1 }, snowy: true }, plants: { ice_spikes: 0.0015 },
    animals: ['polar_bear', 'rabbit'], shape: 'flat',
  },
  ice_spikes: {
    name: 'Ice spikes', at: [0.04, 0.78],
    ground: { snow: 1, tint: [0.92, 0.97, 1.08] }, grass: { amount: 0 },
    trees: { density: 0 }, plants: { ice_spikes: 0.03 },
    animals: ['polar_bear'],
  },
  desert: {
    name: 'Desert', at: [0.92, 0.1],
    ground: { sand: 1, sandstone: 1, tint: [1.06, 1.0, 0.86] }, grass: { amount: 0 },
    trees: { density: 0.004, mix: { palm: 1 } }, plants: { cactus: 0.012, dead_bush: 0.012 },
    animals: ['camel', 'scorpion', 'rabbit'], shape: 'dunes',
  },
  savanna: {
    name: 'Savanna', at: [0.78, 0.3],
    ground: { grass: 0.8, dirt: 0.2, tint: [1.22, 1.06, 0.7] }, grass: { amount: 0.9, color: [1.4, 1.15, 0.55] },
    trees: { density: 0.07, mix: { acacia: 1 } }, plants: { bush: 0.015, dead_bush: 0.004 },
    animals: ['zebra', 'cow', 'chicken', 'rabbit'], shape: 'flat',
  },
  mesa: {
    name: 'Mesa', at: [0.96, 0.34],
    ground: { redsand: 1, terracotta: 1 }, grass: { amount: 0 },
    trees: { density: 0.004, mix: { acacia: 1 } }, plants: { dead_bush: 0.02, cactus: 0.004 },
    animals: ['goat', 'scorpion', 'rabbit'], shape: 'terraces',
  },
  jungle: {
    name: 'Jungle', at: [0.86, 0.82],
    ground: { grass: 0.55, forest: 0.45, tint: [0.86, 1.12, 0.78] }, grass: { amount: 0.85, color: [0.75, 1.25, 0.6] },
    trees: { density: 1, mix: { jungle: 5, palm: 1 } }, plants: { bush: 0.12, ferns: 0.1, melons: 0.006, bamboo: 0.02, flowers: 0.02 },
    animals: ['parrot', 'jaguar', 'chicken', 'pig'], shape: 'hills',
  },
};
export const BIOME_IDS = Object.keys(BIOMES);
const CENTERS = BIOME_IDS.map((id) => BIOMES[id].at);
const BLEND = 0.05; // how far (in climate units) one biome blends into the next

// Builds the climate and biome functions for one world. `home` is the start area, kept temperate
// (forest or plains) so there's always wood and food near where you begin.
export function makeBiomes(noise2, mountainMask, home) {
  const fbm = (x, z, o) => noise2(x, z) * 0.6 + noise2(x * 2.1 + o, z * 2.1 - o) * 0.3 + noise2(x * 4.3 - o, z * 4.3 + o) * 0.1;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const _th = [0, 0]; // climate's result, reused
  function climate(x, z) {
    let t = clamp01(0.5 + fbm(x * 0.0028 + 900, z * 0.0028 - 400, 7) * 1.25 - mountainMask(x, z) * 0.32);
    let h = clamp01(0.5 + fbm(x * 0.0031 - 700, z * 0.0031 + 250, 13) * 1.25);
    if (home.r) {
      const k = 1 - Math.min(1, Math.max(0, (Math.hypot(x - home.x, z - home.z) - 90) / 90));
      t += (0.57 - t) * k; h += (0.56 - h) * k;
    }
    _th[0] = t; _th[1] = h;
    return _th;
  }
  // Weights of every biome here (they add up to 1), in BIOME_IDS order.
  // (The returned array is reused by the next call.)
  const weights = new Float32Array(BIOME_IDS.length), dist = new Float32Array(BIOME_IDS.length);
  let lastX = NaN, lastZ = NaN;
  function biomeWeights(x, z) {
    if (x === lastX && z === lastZ) return weights;
    lastX = x; lastZ = z;
    const [t, h] = climate(x, z);
    let best = Infinity, sum = 0;
    for (let i = 0; i < CENTERS.length; i++) { dist[i] = Math.hypot(t - CENTERS[i][0], h - CENTERS[i][1]); best = Math.min(best, dist[i]); }
    for (let i = 0; i < dist.length; i++) {
      // a biome counts while it's nearly as close as the nearest one
      const w = Math.max(0, 1 - (dist[i] - best) / BLEND);
      weights[i] = w * w; sum += weights[i];
    }
    for (let i = 0; i < weights.length; i++) weights[i] /= sum;
    return weights;
  }
  function biomeAt(x, z) {
    const w = biomeWeights(x, z);
    let bi = 0;
    for (let i = 1; i < w.length; i++) if (w[i] > w[bi]) bi = i;
    return BIOME_IDS[bi];
  }
  // A biome property blended over the biomes here: get(biome) gives a number.
  function blend(x, z, get) {
    const w = biomeWeights(x, z);
    let v = 0;
    for (let i = 0; i < w.length; i++) if (w[i]) v += w[i] * get(BIOMES[BIOME_IDS[i]]);
    return v;
  }
  // home moves while the start is being chosen: the last point's weights may be out of date then
  const forgetCache = () => { lastX = NaN; };
  return { climate, biomeWeights, biomeAt, blend, forgetCache };
}
