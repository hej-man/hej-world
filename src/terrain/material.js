import * as THREE from 'three';
import { WORLD } from '../config.js';
import { smoothstep } from '../noise.js';
import { TEX_GLSL, TEX_LAYERS, initGroundTextures, texUniforms } from './textures.js';
import { terrainField } from '../world/world.js';
import { editedMaterialAt } from '../world/query.js';

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
  const pos = posAttr.array, count = pos.length / 3;
  const normals = new Float32Array(count * 3), tint = new Float32Array(count * 3);
  const splat = new Float32Array(count * 4), info = new Float32Array(count * 4), extra = new Float32Array(count * 2);
  const nrm = new THREE.Vector3();

  for (let v = 0; v < count; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    fieldNormal(x, y, z, nrm);
    normals[v * 3] = nrm.x; normals[v * 3 + 1] = nrm.y; normals[v * 3 + 2] = nrm.z;
    const ny = nrm.y;
    const n = T.noise3(x * 0.06, y * 0.06, z * 0.06);
    const nb = T.noise2(x * 0.03 + 50, z * 0.03 - 20); // low-frequency noise that wobbles biome borders
    const surface = T.surfaceHeight(x, z);
    const vi = T.volcanoInfluence(x, z);
    const lake = T.lakeAt(x, z, T.LAKE_EDGE + 0.15), W = lake ? lake.level : WORLD.waterLevel;
    let g = 0, f = 0, d = 0, s = 0, stone = 0, glow = 0, tr = 1, tg = 1, tb = 1;
    const cave = smoothstep(surface - 3, surface - 8, y);
    const edited = editedMaterialAt(x - nrm.x * 0.8, y - nrm.y * 0.8, z - nrm.z * 0.8);

    if (edited) {
      // ground the player dug into or added
      if (edited === 'sand') s = 1;
      else if (edited === 'dirt') { d = 1; if (ny > 0.75 && y > surface - 3) g = 0.4; }
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
      const fm = smoothstep(0, 1, T.forestMask(x, z) + nb * 0.25);
      g = 1 - fm; f = fm;
      // dry grass patches on sunny open slopes, tundra higher up, bare dirt on rough ground
      const dry = smoothstep(0.35, 0.7, n + nb) * (1 - fm) * 0.6;
      tr = 1 + dry * 0.35; tg = 1 + dry * 0.12; tb = 1 - dry * 0.45;
      const tundra = smoothstep(56, 78, y + nb * 10);
      g *= 1 - tundra * 0.6; d += tundra * 0.6 + smoothstep(0.82, 0.65, ny) * 0.5 + Math.max(0, n - 0.45) * 0.8;
      tr *= 1 + tundra * 0.1; tb *= 1 - tundra * 0.2;
    }
    splat[v * 4] = g; splat[v * 4 + 1] = f; splat[v * 4 + 2] = d; splat[v * 4 + 3] = s;
    if (g + f + d + s < 0.01) splat[v * 4 + 2] = 0.01;
    info[v * 4] = cave; info[v * 4 + 1] = vi; info[v * 4 + 2] = glow; info[v * 4 + 3] = stone;
    tint[v * 3] = tr; tint[v * 3 + 1] = tg; tint[v * 3 + 2] = tb;
    extra[v * 2] = vi < 0.3 && !(glow < 0) ? T.oreAt(x, y, z) : 0;
    extra[v * 2 + 1] = W;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  geo.setAttribute('tinfo', new THREE.BufferAttribute(info, 4));
  geo.setAttribute('extra', new THREE.BufferAttribute(extra, 2));
  return geo;
}

export const terrainUniforms = {
  uTime: { value: 0 },
  uRainWet: { value: 0 },  // how wet the ground is from rain, 0..1
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
        attribute vec2 extra;
        varying vec4 vSplat;
        varying vec4 vInfo;
        varying vec2 vExtra;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vSplat = splat;
        vInfo = tinfo;
        vExtra = extra;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${TEX_GLSL}
        uniform float uTime, uRainWet, uSnowLine;
        uniform float uTexScale[${TEX_LAYERS.length}];
        uniform vec4 uVolc[4];
        varying vec4 vSplat;
        varying vec4 vInfo;
        varying vec2 vExtra; // iron ore amount, water level here
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wN = normalize(vWorldNormal);
        float cave = vInfo.x, volc = vInfo.y, lava = max(vInfo.z, 0.0), crystal = max(-vInfo.z, 0.0), stone = vInfo.w;
        float surf = 1.0 - cave;
        float n1 = vnoise(vWorldPos * 0.12), n2 = vnoise(vWorldPos * 0.45);

        // layer weights: grass, forest floor, dirt, sand from the vertex; rock by slope; snow by height
        float alpine = smoothstep(58.0, 82.0, vWorldPos.y + (n1 - 0.5) * 10.0);
        float edge = (n2 - 0.5) * 0.1;
        float steep = 1.0 - smoothstep(0.6 + alpine * 0.12 + edge, 0.78 + alpine * 0.1 + edge, wN.y);
        float rockW = clamp(max(max(steep, stone), smoothstep(0.1, 0.45, volc) * 0.85), 0.0, 1.0);
        float snowLine = uSnowLine + (n1 - 0.5) * 10.0;
        float snowW = smoothstep(snowLine, snowLine + 6.0, vWorldPos.y) * smoothstep(0.45, 0.7, wN.y + (n2 - 0.5) * 0.2)
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
        // iron ore: rusty brown speckles in the rock
        float rockFrac = W[4] / max(total, 1e-4);
        float ore = vExtra.x * rockFrac * (0.45 + 0.55 * smoothstep(0.4, 0.7, vnoise(vWorldPos * 2.1)));
        col = mix(col, srgb(vec3(0.62, 0.3, 0.14)) * (0.55 + 0.9 * tAlb.r), ore * 0.85);
        // wet, darker ground right at the waterline, and after rain on open ground
        float wet = (1.0 - smoothstep(vExtra.y - 0.3, vExtra.y + 0.9, vWorldPos.y)) * surf;
        float rainWet = uRainWet * surf * smoothstep(0.3, 0.8, wN.y);
        col *= mix(1.0, 0.62, wet) * mix(1.0, 0.72, rainWet);
        diffuseColor.rgb = col;
        float tRough = mix(mix(tAlb.a, 0.25, wet * 0.8), 0.3, rainWet * 0.75) - ore * 0.25;
        vec3 tNW = normalize(wN + tN * 1.2);`)
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
        totalEmissiveRadiance += srgb(vec3(0.35, 0.8, 0.9)) * crystal * 0.6;`);
  };
  return mat;
}

initGroundTextures();
