import * as THREE from 'three';
import { WORLD } from '../config.js';
import { smoothstep } from '../noise.js';
import { TEX_GLSL, TEX_LAYERS, initGroundTextures, texUniforms } from './textures.js';
import { terrainField } from '../world/world.js';
import { BIOMES, BIOME_IDS } from './biomes.js';
import { editedMaterialAt } from '../world/query.js';
import { STONES } from '../world/block-catalog.js';

// How each kind of stone tints the rock texture (plain stone is about 52% grey), and each ore's colour.
const STONE_TINT = { stone: [1, 1, 1] };
for (const s of STONES) {
  const c = new THREE.Color().setHSL(s.hsl[0] / 360, s.hsl[1] / 100, s.hsl[2] / 100, THREE.SRGBColorSpace);
  c.convertLinearToSRGB();
  STONE_TINT[s.id] = [c.r / 0.52, c.g / 0.52, c.b / 0.52];
}
// Ores by index, in the order the shader picks their colours (see oreRaw).
const ORE_INDEX = { iron: 0, coal: 1, copper: 2, gold: 3, titanium: 4 };
const SAND_LIKE = new Set(['sand', 'red_sand', 'gravel', 'snow']), DIRT_LIKE = new Set(['dirt', 'clay', 'mud', 'podzol']);

// ---------------------------------------------------------------------------
// Terrain surface. Per vertex (here): a smooth normal taken from the density field, so the ground
// is round instead of faceted, and how much of each ground layer (grass, forest floor, dirt, sand)
// covers it. In the shader: rock on steep slopes, snow up high, triplanar photo textures, wet
// ground at the waterline, glowing lava veins and crystals.
// ---------------------------------------------------------------------------
export function sampleField(x, y, z) {
  const { field, nx, ny, nz } = terrainField, inv = 1 / WORLD.voxel;
  const fx = Math.min(nx - 1.001, Math.max(0, x * inv)), fy = Math.min(ny - 1.001, Math.max(0, y * inv)), fz = Math.min(nz - 1.001, Math.max(0, z * inv));
  const ix = fx | 0, iy = fy | 0, iz = fz | 0, tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const sy = nx, sz = nx * ny, i = ix + sy * iy + sz * iz;
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(field[i], field[i + 1], tx), l(field[i + sy], field[i + sy + 1], tx), ty),
    l(l(field[i + sz], field[i + sz + 1], tx), l(field[i + sz + sy], field[i + sz + sy + 1], tx), ty), tz);
}
export function fieldNormal(x, y, z, out) {
  const h = WORLD.voxel * 0.5;
  out.set(sampleField(x - h, y, z) - sampleField(x + h, y, z), sampleField(x, y - h, z) - sampleField(x, y + h, z), sampleField(x, y, z - h) - sampleField(x, y, z + h));
  const len = out.length();
  return len > 1e-6 ? out.multiplyScalar(1 / len) : out.set(0, 1, 0);
}

export function buildRenderGeometry(colliderGeo, T) {
  const geo = new THREE.BufferGeometry();
  const posAttr = colliderGeo.attributes.position;
  geo.setAttribute('position', posAttr); // shared with the collider; the index is too
  geo.setIndex(colliderGeo.index);
  const pos = posAttr.array, count = pos.length / 3, flat = colliderGeo.attributes.normal;
  // most of it is kept in bytes: the ground has millions of corners
  const normals = new Int8Array(count * 3), smooth = new Int8Array(count * 3), tint = new Uint8Array(count * 3);
  const splat = new Uint8Array(count * 4), info = new Int8Array(count * 4), extra = new Float32Array(count * 3);
  // 0–1 values kept as bytes: a quarter of the memory, and caves made the meshes much bigger
  const biome = new Uint8Array(count * 4), rock = new Uint8Array(count * 3);
  const nrm = new THREE.Vector3(), face = new THREE.Vector3(), columns = new Map();

  for (let v = 0; v < count; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    // block faces light by their own flat normal; the ground's look (grass or rock) follows the
    // smooth shape of the land, so a gentle hill of steps stays grassy
    if (flat) face.fromBufferAttribute(flat, v); else fieldNormal(x, y, z, face);
    fieldNormal(x - face.x * 0.5, y - face.y * 0.5, z - face.z * 0.5, nrm);
    normals[v * 3] = face.x * 127; normals[v * 3 + 1] = face.y * 127; normals[v * 3 + 2] = face.z * 127;
    smooth[v * 3] = nrm.x * 127; smooth[v * 3 + 1] = nrm.y * 127; smooth[v * 3 + 2] = nrm.z * 127;
    const ny = nrm.y;
    const n = T.noise3(x * 0.06, y * 0.06, z * 0.06);
    // what only depends on where the column is: worked out once per column (corners stack up a lot)
    const ck = x * 2048 + z;
    let col = columns.get(ck);
    if (!col) {
      const nb = T.noise2(x * 0.03 + 50, z * 0.03 - 20); // low-frequency noise that wobbles biome borders
      const surface = T.surfaceHeight(x, z), lake = T.lakeAt(x, z, T.LAKE_EDGE + 0.15), W0 = lake ? lake.level : WORLD.waterLevel;
      col = { nb, surface, vi: T.volcanoInfluence(x, z), lake, W: surface < W0 + 2.5 ? W0 : -1000, weights: null }; // no wet waterline in caves under land
      columns.set(ck, col);
    }
    const { nb, surface, vi, lake, W } = col;
    let g = 0, f = 0, d = 0, s = 0, stone = 0, glow = 0, tr = 1, tg = 1, tb = 1;
    let snow = 0, mesa = 0, sandstone = 0, redsand = 0; // biome looks (see the shader)
    const cave = smoothstep(surface - 3, surface - 8, y);
    const edited = editedMaterialAt(x - face.x * 0.5, y - face.y * 0.5, z - face.z * 0.5);

    if (edited) {
      // ground the player dug into or added
      if (SAND_LIKE.has(edited)) { s = 1; if (edited === 'snow') snow = 1; if (edited === 'red_sand') redsand = 1; }
      else if (DIRT_LIKE.has(edited)) { d = 1; if (edited === 'dirt' && ny > 0.75 && y > surface - 3) g = 0.4; }
      else stone = 1;
    } else if (cave > 0.5) {
      stone = 1;
      if (n > 0.55) { glow = -Math.min(1, (n - 0.55) * 2.5); tr = 0.55; tg = 1.25; tb = 1.45; } // crystals
      else if (ny > 0.7 && n < -0.3) { stone = 0.3; f = 1; tr = 0.8; tb = 0.7; } // mossy cave floors
    } else if (vi > 0.02 + nb * 0.04) {
      // volcano: dark ash and basalt (the shader turns rock dark here), scorched near the crater
      d = 1;
      let near = 0;
      for (const vc of T.volcanoes) near = Math.max(near, 1 - smoothstep(vc.crater * 0.9, vc.crater * 2.2, Math.hypot(x - vc.x, z - vc.z)));
      tr = 1 + near * 0.25; tg = 1 - near * 0.35; tb = 1 - near * 0.45;
      const vein = Math.abs(T.noise2(x * 0.05 + 7, z * 0.05 - 3));
      if (vi > 0.5 && vein < 0.018 + near * 0.03) { glow = Math.max(0, 1 - vein * 20); stone = 1; }
      // blend into the grass at the foot of the volcano
      const foot = 1 - smoothstep(0.02, 0.5, vi + nb * 0.08);
      g = foot; d *= 1 - foot;
    } else if (lake && y < W + 0.7 + nb * 0.5) {
      // muddy lake shore and bed
      d = 1; s = 0.35 + 0.3 * n; f = 0.2;
      if (y < W - 0.3) { tr = tg = 0.8; tb = 0.75; }
    } else if (y < W + 1.6 + nb * 1.2) {
      s = 1;
      if (y < W - 0.5) { tr = tg = tb = 0.72; } // wet sand under the water
      d = 0.15 + 0.15 * n;
    } else {
      // the biomes' ground, blended where they meet (biomes.js)
      const w = col.weights || (col.weights = T.biomeWeights(x + nb * 12, z - nb * 12));
      for (let i = 0; i < w.length; i++) {
        if (!w[i]) continue;
        const gr = BIOMES[BIOME_IDS[i]].ground, k = w[i], t = gr.tint || [1, 1, 1];
        g += (gr.grass || 0) * k; f += (gr.forest || 0) * k; d += (gr.dirt || 0) * k; s += ((gr.sand || 0) + (gr.redsand || 0)) * k;
        snow += (gr.snow || 0) * k; mesa += (gr.terracotta || 0) * k; sandstone += (gr.sandstone || 0) * k; redsand += (gr.redsand || 0) * k;
        tr += (t[0] - 1) * k; tg += (t[1] - 1) * k; tb += (t[2] - 1) * k;
      }
      // dry grass patches on sunny open slopes, tundra higher up, bare dirt on rough ground
      const dry = smoothstep(0.35, 0.7, n + nb) * g * 0.6;
      tr *= 1 + dry * 0.35; tg *= 1 + dry * 0.12; tb *= 1 - dry * 0.45;
      const tundra = smoothstep(56, 78, y + nb * 10) * (1 - s);
      g *= 1 - tundra * 0.6; d += tundra * 0.6 + smoothstep(0.82, 0.65, ny) * 0.5 * (1 - s) + Math.max(0, n - 0.45) * 0.8 * (g + f);
      tr *= 1 + tundra * 0.1; tb *= 1 - tundra * 0.2;
    }
    // the sides of a step are earth under the grass, like a cut through the turf
    if (Math.abs(face.y) < 0.1 && g + f > 0) { d += g + f; g = f = 0; }
    // layer amounts halved into a byte (only their ratios matter), tints halved too
    const k = Math.min(1, 2 / Math.max(g, f, d, s, 0.01)) * 127.5;
    splat[v * 4] = g * k; splat[v * 4 + 1] = f * k; splat[v * 4 + 2] = d * k; splat[v * 4 + 3] = s * k;
    if (g + f + d + s < 0.01) splat[v * 4 + 2] = 2;
    info[v * 4] = cave * 127; info[v * 4 + 1] = Math.min(1, vi) * 127; info[v * 4 + 2] = glow * 127; info[v * 4 + 3] = Math.min(1, stone) * 127;
    tint[v * 3] = Math.min(255, tr * 127.5); tint[v * 3 + 1] = Math.min(255, tg * 127.5); tint[v * 3 + 2] = Math.min(255, tb * 127.5);
    // the kind of stone the rock is here, and any ore in it
    const st = STONE_TINT[vi < 0.3 ? T.stoneAt(x, y, z) : 'stone'] || STONE_TINT.stone;
    rock[v * 3] = st[0] * 127.5; rock[v * 3 + 1] = st[1] * 127.5; rock[v * 3 + 2] = st[2] * 127.5; // halved: tints reach 1.9
    const ore = vi < 0.3 && !(glow < 0) ? T.oreKind(x, y, z) : null;
    extra[v * 3] = ore ? ore[1] : 0;
    extra[v * 3 + 2] = ore ? ORE_INDEX[ore[0]] : 0;
    extra[v * 3 + 1] = W;
    biome[v * 4] = snow * 255; biome[v * 4 + 1] = mesa * 255; biome[v * 4 + 2] = sandstone * 255; biome[v * 4 + 3] = redsand * 255;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3, true));
  geo.setAttribute('snormal', new THREE.BufferAttribute(smooth, 3, true));
  geo.setAttribute('color', new THREE.BufferAttribute(tint, 3, true));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4, true));
  geo.setAttribute('tinfo', new THREE.BufferAttribute(info, 4, true));
  geo.setAttribute('extra', new THREE.BufferAttribute(extra, 3));
  geo.setAttribute('biome', new THREE.BufferAttribute(biome, 4, true));
  geo.setAttribute('rock', new THREE.BufferAttribute(rock, 3, true));
  return geo;
}

export const terrainUniforms = {
  uTime: { value: 0 },
  uRainWet: { value: 0 },  // how wet the ground is from rain, 0..1
  uPuddles: { value: 0 },  // how much rain has gathered in puddles, 0..1 (dries in the sun)
  uRaining: { value: 0 },  // how hard it's raining now (rings on the puddles)
  uSnowLine: { value: 84 },
  uVolc: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(-1e4, -1e4, 1, 0)) }, // x, z, crater radius, lava height
  uTexScale: { value: TEX_LAYERS.map((l) => 1 / l.size) },
};

export function makeTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, terrainUniforms, texUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 splat;
        attribute vec4 tinfo;
        attribute vec3 extra;
        attribute vec4 biome;
        attribute vec3 rock;
        attribute vec3 snormal;
        varying vec3 vSmooth;
        varying vec3 vRock;
        varying vec4 vSplat;
        varying vec4 vInfo;
        varying vec3 vExtra;
        varying vec4 vBiome;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vSplat = splat;
        vInfo = tinfo;
        vExtra = extra;
        vBiome = biome;
        vRock = rock * 2.0;
        vSmooth = snormal;
        vColor.rgb *= 2.0; // tints are stored halved
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${TEX_GLSL}
        uniform float uTime, uRainWet, uSnowLine, uPuddles, uRaining;
        uniform float uTexScale[${TEX_LAYERS.length}];
        uniform vec4 uVolc[4];
        varying vec4 vSplat;
        varying vec4 vInfo;
        varying vec3 vExtra; // ore amount, water level here, which ore (ORE_INDEX)
        varying vec3 vRock;  // the kind of stone: a tint for the rock layer
        varying vec4 vBiome; // snow cover, mesa terracotta, desert sandstone, red sand
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec3 vSmooth; // the land's smooth shape, for rock on steep ground
        vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wN = normalize(vWorldNormal);
        float cave = vInfo.x, volc = vInfo.y, lava = max(vInfo.z, 0.0), crystal = max(-vInfo.z, 0.0), stone = vInfo.w;
        float surf = 1.0 - cave;
        float n1 = vnoise(vWorldPos * 0.12), n2 = vnoise(vWorldPos * 0.45);

        // layer weights: grass, forest floor, dirt, sand from the vertex; rock by slope; snow by height
        float alpine = smoothstep(58.0, 82.0, vWorldPos.y + (n1 - 0.5) * 10.0);
        float edge = (n2 - 0.5) * 0.1;
        float steep = 1.0 - smoothstep(0.6 + alpine * 0.12 + edge, 0.78 + alpine * 0.1 + edge, normalize(vSmooth).y);
        float rockW = clamp(max(max(steep, stone), smoothstep(0.1, 0.45, volc) * 0.85), 0.0, 1.0);
        float snowLine = uSnowLine + (n1 - 0.5) * 10.0;
        float snowW = max(smoothstep(snowLine, snowLine + 6.0, vWorldPos.y), vBiome.x) * smoothstep(0.45, 0.7, wN.y + (n2 - 0.5) * 0.2)
                    * surf * (1.0 - smoothstep(0.1, 0.4, volc));
        vec4 sp = vSplat / max(dot(vSplat, vec4(1.0)), 1e-3);
        float W[6];
        W[0] = sp.x; W[1] = sp.y; W[2] = sp.z; W[3] = sp.w; W[4] = rockW; W[5] = snowW;
        float total = 0.0;
        for (int i = 0; i < 6; i++) {
          if (i < 4) W[i] *= 1.0 - rockW;
          if (i < 5) W[i] *= 1.0 - snowW;
          // break up the borders between layers with noise, so they don't look smeared
          W[i] = W[i] * W[i] * (0.4 + 1.2 * vnoise(vWorldPos * 0.3 + float(i) * 13.7));
          total += W[i];
        }
        vec3 dpx = dFdx(vWorldPos), dpy = dFdy(vWorldPos);
        vec3 bw = pow(abs(wN), vec3(6.0)); bw /= (bw.x + bw.y + bw.z);
        vec4 tAlb = vec4(0.0); vec3 tN = vec3(0.0); float tAO = 0.0, used = 0.0;
        for (int i = 0; i < 6; i++) {
          float wt = W[i] / max(total, 1e-4);
          if (wt < 0.03) continue;
          triplanar(float(i), uTexScale[i], vWorldPos, dpx, dpy, bw, wN, wt, tAlb, tN, tAO);
          used += wt;
        }
        tAlb /= used; tN /= used; tAO /= used;

        vec3 col = tAlb.rgb * diffuseColor.rgb;
        // large-scale colour variation hides the texture repeating in the distance
        float macro = vnoise(vWorldPos * 0.025) * 0.6 + vnoise(vWorldPos * 0.08) * 0.4;
        col *= mix(0.78, 1.15, macro);
        // basalt: rock on the volcano is nearly black
        col *= mix(vec3(1.0), vec3(0.3, 0.28, 0.27), smoothstep(0.08, 0.45, volc) * W[4] / max(total, 1e-4));
        // the kind of stone (granite, diorite, deepslate...) tints the rock
        float rockFrac = W[4] / max(total, 1e-4);
        col *= mix(vec3(1.0), srgb(vRock), rockFrac * (1.0 - smoothstep(0.08, 0.45, volc)));
        // ore: chunky nuggets with a lighter top edge and a dark rim, set in rock that's darker
        // around them, with metal flecks that catch the light (not for coal)
        float oreAmt = smoothstep(0.45, 0.62, vExtra.x) * rockFrac; // matches where mining gives ore (above 0.5)
        // small separate nuggets: a fine noise cut off high, so they're specks, not blotches
        float nn = vnoise(vWorldPos * 3.4) * 0.65 + vnoise(vWorldPos * 8.1) * 0.35;
        float nug = smoothstep(0.6, 0.66, nn), rim = smoothstep(0.55, 0.6, nn) - nug;
        float ore = oreAmt * nug;
        int oi = int(vExtra.z + 0.5);
        vec3 oreRaw = oi == 1 ? vec3(0.07, 0.07, 0.08) : oi == 2 ? vec3(0.25, 0.68, 0.55) : oi == 3 ? vec3(1.0, 0.8, 0.2) : oi == 4 ? vec3(0.82, 0.8, 0.97) : vec3(0.85, 0.42, 0.14);
        vec3 oreC = srgb(oreRaw);
        col *= 1.0 - oreAmt * (0.12 + rim * 0.45);
        float facet = 0.7 + 0.6 * smoothstep(0.3, 0.8, vnoise(vWorldPos * 3.1 + 7.0));
        col = mix(col, oreC * facet, ore);
        float shiny = oi == 1 ? 0.0 : 1.0; // coal doesn't glint
        float fleck = oreAmt * smoothstep(0.72, 0.8, vnoise(vWorldPos * 11.0)) * shiny;
        col = mix(col, mix(srgb(vec3(0.85, 0.86, 0.9)), oreC * 1.4, 0.5), fleck * 0.8);
        // biome looks: red sand, terracotta bands on mesa cliffs, sandstone strata in the desert
        float lum = dot(tAlb.rgb, vec3(0.3, 0.59, 0.11));
        float sandFrac = W[3] / max(total, 1e-4);
        col = mix(col, srgb(vec3(0.86, 0.45, 0.24)) * (0.6 + 1.4 * lum), vBiome.w * sandFrac * surf);
        if (vBiome.y > 0.01) {
          float by = floor((vWorldPos.y + (vnoise(vWorldPos * vec3(0.03, 0.0, 0.03)) - 0.5) * 5.0) / 2.3);
          float bi = by - 8.0 * floor(by / 8.0);
          vec3 band = bi < 1.0 ? vec3(0.66, 0.38, 0.26) : bi < 2.0 ? vec3(0.84, 0.58, 0.40) : bi < 3.0 ? vec3(0.78, 0.50, 0.22)
                    : bi < 4.0 ? vec3(0.88, 0.80, 0.68) : bi < 5.0 ? vec3(0.56, 0.30, 0.22) : bi < 6.0 ? vec3(0.82, 0.64, 0.26)
                    : bi < 7.0 ? vec3(0.66, 0.54, 0.50) : vec3(0.72, 0.34, 0.20);
          col = mix(col, srgb(band) * (0.7 + 0.6 * lum), vBiome.y * rockFrac * surf);
        }
        float strata = 0.86 + 0.14 * sin(vWorldPos.y * 2.6 + vnoise(vWorldPos * 0.2) * 3.0);
        col = mix(col, srgb(vec3(0.86, 0.75, 0.54)) * strata * (0.65 + 0.7 * lum), vBiome.z * rockFrac * surf);
        // wet, darker ground right at the waterline, and after rain on open ground
        float wet = (1.0 - smoothstep(vExtra.y - 0.3, vExtra.y + 0.9, vWorldPos.y)) * surf;
        float rainWet = uRainWet * surf * smoothstep(0.3, 0.8, wN.y);
        col *= mix(1.0, 0.62, wet) * mix(1.0, 0.72, rainWet);
        // puddles: rain gathers in patches on flat open ground (not on sand or snow, which soak it
        // up), dark and mirror-smooth, with rings where the drops land; they shrink as they dry
        float flatOpen = smoothstep(0.93, 0.985, wN.y) * surf * (1.0 - snowW) * (1.0 - sandFrac * 0.85) * (1.0 - rockFrac * 0.5);
        float pn = vnoise(vWorldPos * vec3(0.17, 0.0, 0.17)) * 0.7 + vnoise(vWorldPos * vec3(0.55, 0.0, 0.55)) * 0.3;
        float pLine = 1.0 - uPuddles * 0.36;
        float puddle = smoothstep(pLine, pLine + 0.025, pn) * flatOpen * step(0.005, uPuddles);
        col = mix(col, col * 0.3 + srgb(vec3(0.06, 0.08, 0.09)), puddle * 0.9);
        diffuseColor.rgb = col;
        float tRough = mix(mix(mix(tAlb.a, 0.25, wet * 0.8), 0.3, rainWet * 0.75) - ore * 0.3 - fleck * 0.6, 0.03, puddle);
        vec3 tNW = normalize(wN + tN * 1.2 * (1.0 - puddle));
        if (puddle > 0.0) {
          vec2 rp = vWorldPos.xz * 5.0;
          vec2 rip = vec2(vnoise(vec3(rp, uTime * 5.0)), vnoise(vec3(rp + 17.0, uTime * 5.0))) - 0.5;
          tNW = normalize(mix(tNW, normalize(vec3(rip.x * 0.5 * uRaining, 1.0, rip.y * 0.5 * uRaining)), puddle));
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(tRough, 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `
        normal = normalize((viewMatrix * vec4(tNW, 0.0)).xyz);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        // texture AO, and much less sky light inside caves
        float occ = tAO * mix(1.0, 0.06, cave);
        reflectedLight.indirectDiffuse *= occ;
        reflectedLight.indirectSpecular *= occ;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float pulse = 0.8 + 0.2 * sin(uTime * 1.7 + vWorldPos.y * 0.15);
        float wob = (vnoise(vec3(vWorldPos.x * 0.04, 0.0, vWorldPos.z * 0.04)) - 0.5) * 6.0;
        float band = sin((vWorldPos.y + wob) * 1.25) * 0.5 + 0.5;
        float heat = 0.0;
        for (int i = 0; i < 4; i++) {
          vec4 v = uVolc[i];
          float d = length(vWorldPos.xz - v.xy);
          float near = 1.0 - smoothstep(v.z * 0.8, v.z * 1.7, d);
          // rock bands near the crater rim glow
          heat = max(heat, near * smoothstep(0.82, 0.98, band) * (1.0 - smoothstep(v.w, v.w + 28.0, vWorldPos.y)));
        }
        vec3 lavaCol = srgb(vec3(1.0, 0.35, 0.08)) * (0.6 + 0.6 * tAlb.r);
        // thin lava veins winding down the volcano's flanks
        float vn = abs(vnoise(vec3(vWorldPos.x * 0.07, vWorldPos.y * 0.02, vWorldPos.z * 0.07)) - 0.5) + (vnoise(vWorldPos * 0.8) - 0.5) * 0.03;
        float vein = (1.0 - smoothstep(0.0, 0.025, vn)) * smoothstep(0.45, 0.7, volc) * W[4] / max(total, 1e-4);
        totalEmissiveRadiance += lavaCol * (heat * 0.5 * surf + vein * 1.6) * pulse;
        totalEmissiveRadiance += srgb(vec3(0.35, 0.8, 0.9)) * crystal * 0.6;
        // a faint glow, so ore can be spotted in dark caves too
        totalEmissiveRadiance += oreC * ore * 0.08 * shiny;`);
  };
  return mat;
}

initGroundTextures();
