import * as THREE from 'three';
import { WORLD } from '../config.js';
import { lerp, makeNoise, mulberry32, smax, smoothstep } from '../noise.js';
import { BIOMES, BIOME_IDS, makeBiomes } from './biomes.js';
import { STONES } from '../world/block-catalog.js';

// ---------------------------------------------------------------------------
// Terrain: height functions + 3D density field (positive = rock, negative = air)
// All coordinates are in metres.
// ---------------------------------------------------------------------------
export function createTerrainFunctions(seed) {
  const { noise2, noise3 } = makeNoise(seed);
  const rand = mulberry32(seed * 7 + 3);
  const S = WORLD.size, W = WORLD.waterLevel, H = WORLD.height;

  const fbm2 = (x, z, oct) => { let a = 1, f = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { s += a * noise2(x * f, z * f); n += a; a *= 0.5; f *= 2; } return s / n; };
  // ridged multifractal: sharp crests, with detail suppressed in valleys (looks eroded)
  const ridged2 = (x, z, oct) => {
    let a = 1, f = 1, s = 0, n = 0, weight = 1;
    for (let o = 0; o < oct; o++) {
      let r = 1 - Math.abs(noise2(x * f + 31.7, z * f - 11.3));
      r *= r * weight;
      weight = Math.min(1, r * 1.6);
      s += a * r; n += a; a *= 0.5; f *= 2.05;
    }
    return s / n;
  };

  // The river winds across the map along X.
  const riverPhase = rand() * 100;
  const riverZ = (x) => S * 0.5 + noise2(x * 0.006, riverPhase) * S * 0.24;
  const riverDist = (x, z) => Math.abs(z - riverZ(x));

  // domain warp makes features less blobby and more natural
  const warpX = (x, z) => x + noise2(x * 0.004 + 11, z * 0.004 - 7) * 28;
  const warpZ = (x, z) => z + noise2(x * 0.004 - 31, z * 0.004 + 5) * 28;

  function mountainMask(x, z) {
    const m = smoothstep(0.02, 0.5, noise2(warpX(x, z) * 0.0045 + 100, warpZ(x, z) * 0.0045 - 50));
    return m * smoothstep(25, 75, riverDist(x, z));
  }

  // Biomes (see biomes.js). The start area is kept temperate; `home` is set when the start is chosen.
  const home = { x: 0, z: 0, r: 0 };
  const biomes = makeBiomes(noise2, mountainMask, home);
  const SHAPE = (k) => Float32Array.from(BIOME_IDS, (id) => (BIOMES[id].shape === k ? 1 : 0));
  const FLAT = SHAPE('flat'), HILLS = SHAPE('hills'), DUNES = SHAPE('dunes'), HOODOOS = SHAPE('hoodoos');
  const TREES = Float32Array.from(BIOME_IDS, (id) => BIOMES[id].trees.density);
  const sumW = (w, k) => { let v = 0; for (let i = 0; i < w.length; i++) v += w[i] * k[i]; return v; };

  // How thickly trees grow here (0..1): the biome's density, with clearings.
  function forestMask(x, z) {
    const dens = sumW(biomes.biomeWeights(x, z), TREES);
    return dens * smoothstep(-0.35, 0.1, fbm2(x * 0.009 + 400, z * 0.009 - 120, 3));
  }

  // Painted wastes: low swells of pale sand broken by hoodoos, lone towers of soft rock a few metres
  // across and up to twenty high, worn narrower at the waist, standing in loose clusters. Each 26 m
  // square of the map may hold one, placed and sized by noise, so they're the same every time.
  const HOODOO = 26;
  function hoodoos(x, z) {
    let h = (fbm2(x * 0.013 + 61, z * 0.013 - 17, 3) * 0.5 + 0.5) * 6;
    const cx = Math.floor(x / HOODOO), cz = Math.floor(z / HOODOO);
    for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      const keep = noise2(i * 7.31 + 0.5, j * 7.31 + 0.5);
      if (keep < -0.05) continue;
      const px = (i + 0.5 + noise2(i * 3.7 + 11.5, j * 3.7) * 0.7) * HOODOO, pz = (j + 0.5 + noise2(i * 3.7, j * 3.7 - 11.5) * 0.7) * HOODOO;
      const d = Math.hypot(x - px, z - pz), r = 2.2 + (noise2(i * 5.1 - 3.3, j * 5.1 + 2.2) * 0.5 + 0.5) * 3;
      if (d > r * 1.6) continue;
      const tall = 8 + (keep + 0.05) * 22 + noise2(i * 9.9, j * 9.9 + 4.4) * 4;
      // a flared foot, a straight stem and a rounded cap
      h = Math.max(h, tall * (1 - smoothstep(r * 0.75, r, d)) + 3 * (1 - smoothstep(r, r * 1.6, d)));
    }
    return h;
  }
  // Desert dunes: long ridges with a gentle side and a steeper one.
  function dunes(x, z) {
    const r = 1 - Math.abs(noise2(x * 0.018 + noise2(x * 0.005, z * 0.005) * 2, z * 0.007));
    return r * r * 6 + noise2(x * 0.05, z * 0.05) * 0.8;
  }

  function landHeight(x, z) {
    const wx = warpX(x, z), wz = warpZ(x, z), w = biomes.biomeWeights(x, z);
    const flat = sumW(w, FLAT), hills = sumW(w, HILLS), dune = sumW(w, DUNES), mesa = sumW(w, HOODOOS);
    let h = 34 + fbm2(wx * 0.007, wz * 0.007, 5) * 12 * (1 - flat * 0.55);  // rolling land
    if (hills > 0.01) h += hills * (fbm2(wx * 0.016 + 30, wz * 0.016, 3) + 0.3) * 12;
    if (dune > 0.01) h += dune * dunes(x, z);
    if (mesa > 0.01) h += mesa * hoodoos(x, z);
    const mm = mountainMask(x, z);
    if (mm > 0) {
      // tall ridged mountains; the ridges only reach full height in the middle of a range, so the
      // edges are walkable foothills rather than cliffs
      const ridge = ridged2(wx * 0.0052, wz * 0.0052, 5);
      h += (mm * mm * (3 - 2 * mm)) * (0.2 + 0.8 * ridge * smoothstep(0.15, 0.85, mm)) * 80;
    }
    const v = 1 - smoothstep(5, 46, riverDist(x, z));
    return lerp(h, W - 3.5, v);                                      // river valley
  }

  // Volcanoes: concave cones with a crater and a lava lake, far from the river.
  const volcanoes = [];
  for (let n = 0; n < WORLD.volcanoes; n++) {
    const R = Math.min(64, S * 0.24);
    let best = null, bestScore = -Infinity;
    for (let t = 0; t < 60; t++) {
      const x = R * 0.8 + rand() * (S - R * 1.6), z = R * 0.8 + rand() * (S - R * 1.6);
      let score = Math.min(riverDist(x, z), 90);
      for (const v of volcanoes) score = Math.min(score, Math.hypot(x - v.x, z - v.z) - R * 1.5);
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    const peak = Math.min(H - 14, 112), base = 26, crater = R * 0.2, depth = 17;
    const rim = base + (peak - base) * Math.pow(1 - crater / R, 1.7);
    volcanoes.push({ ...best, R, peak, base, crater, depth, rim, lavaY: rim - depth + 3, lavaTop: rim - depth + 3 }); // lavaY drops as lava is scooped out
  }

  function volcanoHeight(v, x, z) {
    const d = Math.hypot(x - v.x, z - v.z);
    if (d > v.R) return -Infinity;
    if (d < v.crater) { const t = d / v.crater; return v.rim - v.depth * (1 - t * t); }
    const p = 1 - d / v.R;
    const gullies = Math.abs(noise2(Math.atan2(z - v.z, x - v.x) * 3.2, d * 0.02)) * 4 * p;
    return v.base + (v.peak - v.base) * Math.pow(p, 1.7) - gullies;
  }

  function volcanoInfluence(x, z) {
    let m = 0;
    for (const v of volcanoes) m = Math.max(m, 1 - smoothstep(v.R * 0.55, v.R * 1.05, Math.hypot(x - v.x, z - v.z)));
    return m;
  }

  // The guaranteed cave mouth needs a flat ledge in front of it; filled in below.
  const ledge = { x: 0, z: 0, y: 0, r: 0 };

  // Lakes: bowls in the rolling land above the sea, each with its own water level. A lake's
  // radius wobbles with the direction, so the shore isn't a perfect circle.
  const lakes = [];
  const lakeRadius = (lk, a) => lk.R * (1 + 0.28 * noise2(Math.cos(a) * 1.1 + lk.seed, Math.sin(a) * 1.1 - lk.seed));
  // distance from the lake's centre as a fraction of its radius in that direction (9 = far away)
  function lakeShape(lk, x, z) {
    const dx = x - lk.x, dz = z - lk.z;
    if (Math.abs(dx) > lk.R * 1.9 || Math.abs(dz) > lk.R * 1.9) return 9;
    return Math.hypot(dx, dz) / lakeRadius(lk, Math.atan2(dz, dx));
  }
  const DRY_ABOVE = 2.5, NO_WATER = -1000; // see waterAt
  const LAKE_EDGE = 1.3; // the water surface reaches this far (in lake radii)
  function lakeAt(x, z, reach = LAKE_EDGE) {
    for (const lk of lakes) if (lakeShape(lk, x, z) < reach) return lk;
    return null;
  }
  // Height of the water surface over this point: the sea level outside the lakes. Only open water
  // counts: where the ground above is well over the water (caves and tunnels under hills), it's dry.
  // The river (the sea) and the lakes rise in rain and sink in sunshine (world/hydro.js): `live.sea`
  // and each lake's `offset` say by how much. baseWaterAt is the level the land was shaped for, which
  // is what anything worked out once when the world is made (plants, shore colours) must use.
  const live = { sea: 0 };
  function waterAt(x, z) {
    const lk = lakes.length ? lakeAt(x, z) : null, level = lk ? lk.level + lk.offset : W + live.sea;
    return surfaceHeight(x, z) < level + DRY_ABOVE ? level : NO_WATER;
  }
  function baseWaterAt(x, z) {
    const lk = lakes.length ? lakeAt(x, z) : null, level = lk ? lk.level : W;
    return surfaceHeight(x, z) < level + DRY_ABOVE ? level : NO_WATER;
  }

  function surfaceHeight(x, z) {
    let h = landHeight(x, z);
    for (const v of volcanoes) { const vh = volcanoHeight(v, x, z); if (vh > -Infinity) h = smax(h, vh, 8); }
    if (ledge.r) {
      const d = Math.hypot(x - ledge.x, z - ledge.z);
      h = lerp(h, ledge.y, 1 - smoothstep(ledge.r * 0.6, ledge.r, d));
    }
    for (const lk of lakes) {
      const d = lakeShape(lk, x, z);
      if (d < LAKE_EDGE) {
        const bowl = lk.level - 0.6 - lk.depth * Math.max(0, 1 - d * d);
        h = Math.min(h, lerp(bowl, h, smoothstep(0.8, LAKE_EDGE, d)));
      }
    }
    return Math.min(h, H - 6);
  }

  // A guaranteed big cave: a tunnel from the valley side into the hills, ending in a large cavern.
  const tunnel = [];
  {
    let caveX = S * 0.5, side = 1, z0 = riverZ(caveX) + 8;
    for (let attempt = 0; attempt < 40; attempt++) {
      caveX = S * (0.2 + rand() * 0.6);
      side = rand() < 0.5 ? -1 : 1;
      z0 = riverZ(caveX) + side * 8;
      Object.assign(home, { x: caveX, z: z0 + side * 30, r: 1 }); biomes.forgetCache();
      while (Math.abs(z0 - S / 2) < S * 0.42 && surfaceHeight(caveX, z0) < W + 11) z0 += side * 2;
      const farFromVolcano = volcanoes.every((v) => Math.hypot(caveX - v.x, z0 - v.z) > v.R + 20);
      if (farFromVolcano && Math.abs(z0 - S / 2) < S * 0.42) break;
    }
    // keep the start temperate around where it really ended up (z0 moves uphill above)
    Object.assign(home, { x: caveX, z: z0 + side * 10, r: 1 }); biomes.forgetCache();
    Object.assign(ledge, { x: caveX, z: z0 - side * 6, y: W + 3, r: 10 });
    const y0 = ledge.y + 2.6;
    const yEnd = W + 7;
    const len = Math.max(20, Math.min(56, side > 0 ? S - 24 - z0 : z0 - 24));
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      tunnel.push(new THREE.Vector3(
        caveX + Math.sin(t * 4.2) * 8,
        lerp(y0, yEnd, smoothstep(0.1, 0.9, t)),
        z0 + side * (t * len - 3),
      ));
    }
  }
  const cavern = tunnel[tunnel.length - 1].clone().add(new THREE.Vector3(0, 3, 0));

  // Pick the lakes: flat-ish open land, away from the river, volcanoes, the cave and each other.
  {
    const want = Math.max(1, Math.round(7 * (S / 1024) ** 2));
    for (let tries = 0; tries < 600 && lakes.length < want; tries++) {
      const R = 15 + rand() * 20;
      const x = R * 2.2 + rand() * (S - R * 4.4), z = R * 2.2 + rand() * (S - R * 4.4);
      if (riverDist(x, z) < R * 1.5 + 40 || mountainMask(x, z) > 0.12) continue;
      if (volcanoes.some((v) => Math.hypot(x - v.x, z - v.z) < v.R + R * 1.5 + 20)) continue;
      if (tunnel.some((p) => Math.hypot(x - p.x, z - p.z) < R * 1.5 + 30)) continue;
      if (lakes.some((l) => Math.hypot(x - l.x, z - l.z) < (l.R + R) * 1.6 + 20)) continue;
      const lk = { x, z, R, seed: rand() * 100, depth: 2.5 + rand() * 4 };
      // the water comes up to just below the lowest point of the shore
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 72; k++) {
        const a = (k / 72) * Math.PI * 2, r = lakeRadius(lk, a) * LAKE_EDGE;
        const h = surfaceHeight(x + Math.cos(a) * r, z + Math.sin(a) * r);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      if (hi - lo > 9 || lo < W + 6 || hi > 66) continue;
      lk.level = lo - 1.8; // the ground has small 3D bumps, up to about a metre lower than the height
      lk.offset = 0;
      lakes.push(lk);
    }
  }

  // Ores. Iron forms long winding veins, the way it does in real rock: a seam where two smooth
  // noise fields both cross zero (like the spaghetti tunnels), only in some regions, thickest in the
  // middle of one. Around the ore the rock is rusty granite, so a vein shows as a red-brown band in a
  // cliff or cave wall with the ore in its core. The other ores are clusters with their own noise
  // fields and depths: coal is common and fairly high up, copper in the middle, gold rare and deep,
  // and titanium rarest and deepest, next to the deepslate.
  // ironVein gives 0..1 (1 in the core, above 0.5 is ore, 0.12..0.5 the rusty rock around it).
  let veinX = NaN, veinY = NaN, veinZ = NaN, veinV = 0;
  let ironX = NaN, ironZ = NaN, ironSurf = 0;
  function ironVein(x, y, z) {
    if (x === veinX && y === veinY && z === veinZ) return veinV; // oreKind and stoneAt ask for the same point
    veinX = x; veinY = y; veinZ = z; veinV = 0;
    if (y < 6 || y > 96) return 0;
    const region = noise3(x * 0.006 + 71, y * 0.01, z * 0.006 - 33);
    if (region < 0.02) return 0;
    const a = noise3(x * 0.021 + 500, y * 0.028, z * 0.021 - 200), b = noise3(x * 0.021 - 140, y * 0.028 + 60, z * 0.021 + 310);
    const r = Math.sqrt(a * a + b * b), th = 0.03 + 0.05 * smoothstep(0.02, 0.4, region);
    // veins thin out towards the surface: plenty down in the caves, little in the top few metres of
    // a hillside (the surface height is worked out once per column)
    if (x !== ironX || z !== ironZ) { ironX = x; ironZ = z; ironSurf = surfaceHeight(x, z); }
    const deep = 0.6 + 0.4 * smoothstep(3, 16, ironSurf - y);
    return (veinV = (1 - smoothstep(th * 0.5, th * 1.9, r)) * deep);
  }
  const oreAt = (x, y, z) => smoothstep(0.62, 0.74, ironVein(x, y, z));
  const ORES = [
    // [kind, offset, threshold, lowest y, highest y]
    ['coal', 900, 0.75, 16, 128], ['copper', 1700, 0.74, 6, 72], ['gold', 2500, 0.82, 4, 34], ['titanium', 3300, 0.84, 3, 28],
  ];
  // Returns null or [kind, amount]; the array is reused by the next call.
  const _ore = ['', 0];
  function oreKind(x, y, z) {
    const iron = oreAt(x, y, z);
    if (iron > 0.5) { _ore[0] = 'iron'; _ore[1] = iron; return _ore; }
    for (const [kind, o, th, y0, y1] of ORES) {
      if (y < y0 || y > y1) continue;
      const a = smoothstep(th - 0.08, th + 0.06, noise3(x * 0.1 + o, y * 0.12 - o * 0.3, z * 0.1 - o));
      if (a > 0.5) { _ore[0] = kind; _ore[1] = a; return _ore; }
    }
    return null;
  }
  // Stone: plain stone, with pockets of other stones (granite, marble, tuff...) at the depths each
  // is found (block-catalog.js), and deepslate and blackstone near the bottom.
  const STONES_AT = Array.from({ length: WORLD.height + 1 }, (_, y) => STONES.filter((s) => y >= s.depth[0] && y <= s.depth[1] && s.id !== 'deepslate' && s.id !== 'blackstone'));
  function stoneAt(x, y, z) {
    if (y < 10 + noise2(x * 0.05 + 3, z * 0.05 - 8) * 3) return y < 6.5 ? 'blackstone' : 'deepslate';
    if (ironVein(x, y, z) > 0.12) return 'granite'; // the rusty rock around an iron vein
    const blob = noise3(x * 0.035 + 41, y * 0.05, z * 0.035 - 17);
    if (blob < 0.3) return 'stone';
    const choices = STONES_AT[Math.max(0, Math.min(STONES_AT.length - 1, Math.round(y)))];
    const pickN = noise3(x * 0.012 - 300, y * 0.02 + 5, z * 0.012 + 120) * 0.5 + 0.5;
    return choices.length ? choices[Math.min(choices.length - 1, Math.floor(pickN * choices.length))].id : 'stone';
  }
  const _seg = new THREE.Line3(), _p = new THREE.Vector3(), _c = new THREE.Vector3();
  const tMin = new THREE.Vector3(Infinity, Infinity, Infinity), tMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of tunnel) { tMin.min(p); tMax.max(p); }
  tMin.subScalar(24); tMax.addScalar(24);

  function tunnelDistance(x, y, z) {
    if (x < tMin.x || y < tMin.y || z < tMin.z || x > tMax.x || y > tMax.y || z > tMax.z) return 50;
    _p.set(x, y, z);
    let best = Infinity;
    for (let i = 0; i < tunnel.length - 1; i++) {
      _seg.set(tunnel[i], tunnel[i + 1]);
      _seg.closestPointToPoint(_p, true, _c);
      best = Math.min(best, _c.distanceTo(_p) - 3.6);
    }
    const dx = (x - cavern.x) / 17, dy = (y - cavern.y) / 8, dz = (z - cavern.z) / 17;
    return Math.min(best, (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * 8);
  }

  // Caves, in the style of Minecraft's Caves and Cliffs update. Three kinds overlap:
  //   cheese caves: huge open caverns where a slow 3D noise is high, with stone pillars left
  //                 standing from floor to roof where a column noise is high;
  //   spaghetti:    long winding tunnels where two noise fields are both near zero (the line
  //                 where two surfaces cross), wider in some places than others;
  //   the guaranteed cave near the start (tunnelDistance).
  // Caves reach down to just above the bedrock under hills and mountains. Under low ground they
  // stay above the sea, since the sea would show through their roofs (see waterAt).
  const BEDROCK = 4;
  // Per column (x, z) values, worked out once for all the heights in the column.
  let colX = NaN, colZ = NaN, colFloor = 0, colPillar = 0, colMouth = 0, colRoof = 0;
  function caveDistance(x, y, z, h) {
    if (x !== colX || z !== colZ) {
      colX = x; colZ = z;
      // the roof is measured from the lowest ground nearby, not just straight up: under a steep
      // mountainside the ground a few metres away is much lower, and a cave measured only from the
      // peak above would break out through the side and hollow the mountain
      let low = h;
      for (const r of [5, 11]) for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + r;
        low = Math.min(low, surfaceHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) + r * 0.35);
      }
      const mm = mountainMask(x, z);
      colRoof = low - mm * 6;
      // how deep caves may go here: right down where the ground is high, only to sea level where it's low
      colFloor = lerp(W + 1, WORLD.caveFloor, smoothstep(W + DRY_ABOVE + 3, W + DRY_ABOVE + 14, h));
      colPillar = noise2(x * 0.09 + 13, z * 0.09 - 71);
      // cave mouths open in low hills, not in the mountains
      colMouth = smoothstep(0.45, 0.6, noise2(x * 0.012 - 77, z * 0.012 + 41)) * (1 - smoothstep(0.05, 0.25, mm));
    }
    const floor = colFloor, pillar = colPillar, mouth = colMouth, roof = colRoof;
    if (y < floor) return 30;
    // cheese: big rounded caverns, flattened a little so they're wider than tall
    const c = noise3(x * 0.0105 + 200, y * 0.02, z * 0.0105 - 300) + noise3(x * 0.03 - 50, y * 0.04, z * 0.03 + 80) * 0.18;
    let cave = (0.32 - c) * 60;
    // pillars: thin columns of rock left standing in the caverns
    if (pillar > 0.55) cave = Math.max(cave, (pillar - 0.55) * 80 - 2);
    // spaghetti tunnels, thicker where `thick` is high
    const a = noise3(x * 0.016, y * 0.022, z * 0.016), b = noise3(x * 0.016 + 57.1, y * 0.022 - 13.7, z * 0.016 + 91.3);
    const thick = 0.07 + 0.06 * noise3(x * 0.007 - 9, y * 0.01, z * 0.007 + 4);
    cave = Math.min(cave, (Math.sqrt(a * a + b * b) - thick) * 55);
    // a roof of at least 6 m under the lowest ground nearby (more over the big caverns, and more in
    // the mountains), except where a cave mouth is allowed to open to the sky
    cave += Math.max(0, y - (roof - 6)) * 6 * (1 - mouth) + Math.max(0, y - (roof - 14)) * 2.5 * (1 - mouth) * smoothstep(0.3, 0.5, c);
    cave = Math.min(cave, tunnelDistance(x, y, z));
    // fade out towards the floor, so caves get rounded bottoms instead of flat cut-offs (and
    // never reach below the floor, which under low ground is just above the sea)
    return cave + Math.max(0, floor + 3 - y) * 15;
  }

  function density(x, y, z, h, mm, vi, lake) {
    let d = h - y;
    // 3D detail: overhangs and crags on mountains, gentle lumps elsewhere
    d += noise3(x * 0.045, y * 0.045, z * 0.045) * (1.0 + mm * 3.5);
    if (y > BEDROCK + 1 && vi < 0.75 && !lake) d = Math.min(d, caveDistance(x, y, z, h)); // no caves under lakes, or they would drain
    return Math.max(d, BEDROCK - y); // solid bedrock floor
  }

  return {
    surfaceHeight, landHeight, mountainMask, forestMask, volcanoInfluence, ...biomes, density, tunnel, cavern, riverZ, ledge, volcanoes,
    lakes, lakeAt, lakeRadius, waterAt, baseWaterAt, live, oreAt, ironVein, oreKind, stoneAt, LAKE_EDGE, noise2, noise3,
  };
}

// The density field covers the whole map, one sample every WORLD.voxel metres. It starts as air
// and is filled in chunk by chunk as the world streams in (see world/world.js).
export function createDensityField() {
  const vx = WORLD.voxel;
  const nx = Math.round(WORLD.size / vx) + 1, ny = Math.round(WORLD.height / vx) + 1, nz = nx;
  const field = new Float32Array(nx * ny * nz).fill(-1);
  return { field, nx, ny, nz };
}

// Fills the grid columns ix0 <= ix < ix1, iz0 <= iz < iz1 from the terrain functions.
export function fillDensity(T, { field, nx, ny, nz }, ix0, ix1, iz0, iz1) {
  const vx = WORLD.voxel;
  for (let iz = iz0; iz < iz1; iz++) {
    for (let ix = ix0; ix < ix1; ix++) {
      const x = ix * vx, z = iz * vx;
      const h = T.surfaceHeight(x, z);
      const mm = T.mountainMask(x, z);
      const vi = T.volcanoInfluence(x, z);
      const lake = !!T.lakeAt(x, z, 1.7);
      for (let iy = 0; iy < ny; iy++) {
        const idx = ix + nx * (iy + ny * iz), y = iy * vx;
        // borders are air, so the terrain is a closed block
        if (ix === 0 || iz === 0 || iy === 0 || ix === nx - 1 || iz === nz - 1 || iy === ny - 1) { field[idx] = -1; continue; }
        if (y > h + 12) { field[idx] = h - y; continue; } // well above ground: skip noise
        field[idx] = T.density(x, y, z, h, mm, vi, lake);
      }
    }
  }
}

// Drops floating rock in the columns ix0 <= ix < ix1, iz0 <= iz < iz1: flood-fills solid rock from
// the bedrock within a window `margin` cells wider on each side, and clears any solid cell the fill
// doesn't reach. Rock touching the window's sides counts as connected, since it may rest on ground
// outside the window; so only floating pieces smaller than the margin are found, which is nearly all.
// The fill works on vertical runs of solid cells rather than single cells, which is much faster.
export function removeFloaters({ field, nx, ny, nz }, ix0, ix1, iz0, iz1, margin) {
  const wx0 = Math.max(0, ix0 - margin), wx1 = Math.min(nx, ix1 + margin);
  const wz0 = Math.max(0, iz0 - margin), wz1 = Math.min(nz, iz1 + margin);
  const W = wx1 - wx0, D = wz1 - wz0;
  // runs[] holds y0, y1 (inclusive) per run; column c's runs are runStart[c] .. runStart[c + 1]
  const runStart = new Int32Array(W * D + 1), runs = [];
  for (let lz = 0; lz < D; lz++) for (let lx = 0; lx < W; lx++) {
    runStart[lx + W * lz] = runs.length / 2;
    const base = lx + wx0 + nx * ny * (lz + wz0);
    let y0 = -1;
    for (let y = 0; y <= ny; y++) {
      const solid = y < ny && field[base + nx * y] > 0;
      if (solid && y0 < 0) y0 = y;
      else if (!solid && y0 >= 0) { runs.push(y0, y - 1); y0 = -1; }
    }
  }
  runStart[W * D] = runs.length / 2;
  const visited = new Uint8Array(runs.length / 2), stack = [];
  const visit = (r) => { if (!visited[r]) { visited[r] = 1; stack.push(r); } };
  for (let lz = 0; lz < D; lz++) for (let lx = 0; lx < W; lx++) {
    const c = lx + W * lz;
    const side = (lx === 0 && wx0 > 0) || (lx === W - 1 && wx1 < nx) || (lz === 0 && wz0 > 0) || (lz === D - 1 && wz1 < nz);
    for (let r = runStart[c]; r < runStart[c + 1]; r++) if (side || runs[r * 2] <= 1) visit(r);
  }
  const colOf = new Int32Array(runs.length / 2);
  for (let c = 0; c < W * D; c++) for (let r = runStart[c]; r < runStart[c + 1]; r++) colOf[r] = c;
  while (stack.length) {
    const r = stack.pop(), c = colOf[r], lx = c % W, lz = (c - lx) / W, y0 = runs[r * 2], y1 = runs[r * 2 + 1];
    const link = (c2) => { for (let q = runStart[c2]; q < runStart[c2 + 1]; q++) if (runs[q * 2] <= y1 && runs[q * 2 + 1] >= y0) visit(q); };
    if (lx > 0) link(c - 1);
    if (lx < W - 1) link(c + 1);
    if (lz > 0) link(c - W);
    if (lz < D - 1) link(c + W);
  }
  for (let z = iz0; z < iz1; z++) for (let x = ix0; x < ix1; x++) {
    const c = (x - wx0) + W * (z - wz0), base = x + nx * ny * z;
    for (let r = runStart[c]; r < runStart[c + 1]; r++) {
      if (visited[r]) continue;
      for (let y = runs[r * 2]; y <= runs[r * 2 + 1]; y++) field[base + nx * y] = -0.5;
    }
  }
}
