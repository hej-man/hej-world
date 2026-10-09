import * as THREE from 'three';
import { QUALITY } from '../config.js';
import { mulberry32, smoothstep } from '../noise.js';
import { toast } from '../ui/hud.js';

// ---------------------------------------------------------------------------
// Ground textures: real photo-scanned CC0 (public domain) materials from Poly Haven, polyhaven.com.
// Each layer lists a few Poly Haven assets and the first one that loads wins. Copies saved in
// assets/textures by get-textures.sh are used first when the page is served over http (browsers
// won't let WebGL read images from a page opened straight from disk). Until the photos arrive, or
// with no internet, generated stand-in textures are used, so the game always starts at once.
// All layers live in two texture arrays (colour + roughness, normal + ambient occlusion), so the
// terrain shader needs only two texture samplers however many layers there are.
// ---------------------------------------------------------------------------
const TEX_SIZE = QUALITY === 'low' ? 512 : 1024;
export const TEX_LAYERS = [
  // size: metres covered by one repeat of the texture
  { id: 'grass', size: 2.5, assets: ['leafy_grass', 'grass_ground', 'sparse_grass'] },
  { id: 'forest', size: 3.0, assets: ['forrest_ground_01', 'forest_leaves_02', 'brown_mud_leaves_01'] },
  { id: 'dirt', size: 3.0, assets: ['brown_mud_02', 'dry_ground_01', 'rocky_trail'] },
  { id: 'sand', size: 3.0, assets: ['coast_sand_01', 'aerial_beach_01', 'gravelly_sand'] },
  { id: 'rock', size: 6.0, assets: ['rock_face', 'aerial_rocks_02', 'rocky_terrain_02'] },
  { id: 'snow', size: 4.0, assets: ['snow_02', 'snow_field_aerial', 'snow_01'] },
  { id: 'bark', size: 1.5, assets: ['bark_brown_02', 'pine_bark', 'bark_willow_02'] },
];
export const LAYER = Object.fromEntries(TEX_LAYERS.map((l, i) => [l.id, i]));
export const texInfo = { source: 'generated', layers: {} };

// Stand-in textures, generated from tileable noise. Colours are sRGB 0..1.
export function makeTileNoise(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint16Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (i, j, p) => perm[perm[((i % p) + p) % p] + ((j % p) + p) % p] / 255;
  const noise = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let u = x - xi, v = y - yi;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    const a = h(xi, yi, p), b = h(xi + 1, yi, p), c = h(xi, yi + 1, p), d = h(xi + 1, yi + 1, p);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  // fractal noise over the unit square, tileable; base = cells across, stretch = extra cells in x
  return (u, v, base, oct = 4, sx = 1) => {
    let s = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) {
      const p = base << o;
      s += amp * noise(u * p * sx, v * p, p * sx); norm += amp; amp *= 0.5;
    }
    return s / norm;
  };
}

function generateLayer(id, G) {
  const fbm = makeTileNoise(id.length * 977 + id.charCodeAt(0) * 31);
  const col = new Float32Array(G * G * 3), hgt = new Float32Array(G * G), rough = new Float32Array(G * G);
  const mix = (a, b, t) => a + (b - a) * t;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const u = x / G, v = y / G, i = x + y * G;
    let c0, c1, t, h, r;
    if (id === 'grass') {
      const n = fbm(u, v, 4), blades = fbm(u, v, 32, 3, 4);
      t = n * 0.5 + blades * 0.7 - 0.1; h = blades; r = 0.9;
      c0 = [0.20, 0.28, 0.09]; c1 = [0.47, 0.58, 0.24];
    } else if (id === 'forest') {
      const n = fbm(u, v, 6), leaf = fbm(u, v, 40, 3), moss = smoothstep(0.45, 0.7, fbm(u, v, 3, 3));
      const litter = smoothstep(0.45, 0.75, leaf) * 0.7;
      t = n * 0.5 + litter * 0.5; h = n * 0.4 + litter * 0.6; r = 0.85;
      c0 = [0.15, 0.11, 0.07]; c1 = [0.36 - moss * 0.06, 0.27 + moss * 0.03, 0.15];
    } else if (id === 'dirt') {
      const n = fbm(u, v, 6), peb = fbm(u, v, 40, 2);
      t = n * 0.7 + (peb > 0.68 ? 0.5 : 0); h = n * 0.6 + (peb > 0.68 ? 0.4 : 0); r = 0.92;
      c0 = [0.24, 0.17, 0.11]; c1 = [0.50, 0.39, 0.27];
    } else if (id === 'sand') {
      const n = fbm(u, v, 4), grain = fbm(u, v, 64, 2);
      const ripple = Math.sin((v + n * 0.15) * Math.PI * 2 * 14) * 0.5 + 0.5;
      t = n * 0.4 + grain * 0.4 + ripple * 0.2; h = ripple * 0.6 + grain * 0.4; r = 0.95;
      c0 = [0.62, 0.53, 0.38]; c1 = [0.85, 0.77, 0.60];
    } else if (id === 'rock') {
      const n = fbm(u, v, 4, 6), grain = fbm(u, v, 48, 2), ridge = 1 - Math.abs(fbm(u, v, 6, 4) * 2 - 1);
      const crack = smoothstep(0.95, 1.0, ridge) * 0.25;
      t = n * 0.75 + grain * 0.25 - crack * 0.35; h = n * 0.8 + grain * 0.2 - crack * 0.5; r = 0.8;
      c0 = [0.22, 0.21, 0.20]; c1 = [0.50, 0.48, 0.45];
    } else if (id === 'snow') {
      const n = fbm(u, v, 4), sparkle = fbm(u, v, 64, 1);
      t = n * 0.7 + sparkle * 0.3; h = n; r = 0.55 + sparkle * 0.2;
      c0 = [0.80, 0.85, 0.92]; c1 = [0.97, 0.98, 1.0];
    } else { // bark: vertical furrows
      const n = fbm(u, v, 8, 4, 0.25), fur = fbm(u, v, 12, 3, 0.15);
      const groove = smoothstep(0.45, 0.6, fur);
      t = n * 0.5 + groove * 0.5; h = groove; r = 0.9;
      c0 = [0.14, 0.10, 0.07]; c1 = [0.45, 0.36, 0.28];
    }
    t = Math.min(1, Math.max(0, t));
    col[i * 3] = mix(c0[0], c1[0], t); col[i * 3 + 1] = mix(c0[1], c1[1], t); col[i * 3 + 2] = mix(c0[2], c1[2], t);
    hgt[i] = h; rough[i] = r;
  }
  return { col, hgt, rough };
}

// Writes a generated layer into the texture arrays, scaling it up from G to TEX_SIZE (bilinear, wrapped).
function writeGeneratedLayer(layer, G, albedo, normal) {
  const { col, hgt, rough } = generateLayer(TEX_LAYERS[layer].id, G);
  const S = TEX_SIZE, off = layer * S * S * 4, k = G / S;
  const at = (arr, x, y, c, n) => arr[(((x + G) % G) + ((y + G) % G) * G) * n + c];
  const bil = (arr, fx, fy, c, n) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = at(arr, x0, y0, c, n), b = at(arr, x0 + 1, y0, c, n), d = at(arr, x0, y0 + 1, c, n), e = at(arr, x0 + 1, y0 + 1, c, n);
    return (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = x * k, fy = y * k, o = off + (x + y * S) * 4;
    albedo[o] = bil(col, fx, fy, 0, 3) * 255; albedo[o + 1] = bil(col, fx, fy, 1, 3) * 255; albedo[o + 2] = bil(col, fx, fy, 2, 3) * 255;
    albedo[o + 3] = bil(rough, fx, fy, 0, 1) * 255;
    const dx = (bil(hgt, fx + 1, fy, 0, 1) - bil(hgt, fx - 1, fy, 0, 1)) * 2.5;
    const dy = (bil(hgt, fx, fy + 1, 0, 1) - bil(hgt, fx, fy - 1, 0, 1)) * 2.5;
    const inv = 1 / Math.hypot(dx, dy, 1);
    normal[o] = (-dx * inv * 0.5 + 0.5) * 255; normal[o + 1] = (dy * inv * 0.5 + 0.5) * 255;
    normal[o + 2] = (0.7 + 0.3 * bil(hgt, fx, fy, 0, 1)) * 255; normal[o + 3] = 255;
  }
}

function makeArrayTexture(data, srgb) {
  const t = new THREE.DataArrayTexture(data, TEX_SIZE, TEX_SIZE, TEX_LAYERS.length);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export const texUniforms = { tAlbedo: { value: null }, tNormal: { value: null } };
export function initGroundTextures() {
  const S = TEX_SIZE, L = TEX_LAYERS.length;
  const albedo = new Uint8Array(S * S * 4 * L), normal = new Uint8Array(S * S * 4 * L);
  const G = QUALITY === 'low' ? 128 : 256;
  for (let l = 0; l < L; l++) writeGeneratedLayer(l, G, albedo, normal);
  texUniforms.tAlbedo.value = makeArrayTexture(albedo, true);
  texUniforms.tNormal.value = makeArrayTexture(normal, false);
  loadPhotoTextures(albedo, normal);
}

// --- Poly Haven photos -------------------------------------------------------
const fetchTimeout = (url, ms = 25000) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal, mode: 'cors' }).finally(() => clearTimeout(timer));
};
const _texCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(TEX_SIZE, TEX_SIZE) : Object.assign(document.createElement('canvas'), { width: TEX_SIZE, height: TEX_SIZE });
const _texCtx = _texCanvas.getContext('2d', { willReadFrequently: true });
async function imagePixels(url) {
  const res = await fetchTimeout(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const blob = await res.blob();
  // no colour management: normal and roughness maps are data, not colours
  const bmp = await createImageBitmap(blob, { resizeWidth: TEX_SIZE, resizeHeight: TEX_SIZE, resizeQuality: 'high', colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  _texCtx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
  _texCtx.drawImage(bmp, 0, 0, TEX_SIZE, TEX_SIZE);
  bmp.close?.();
  return _texCtx.getImageData(0, 0, TEX_SIZE, TEX_SIZE).data;
}

// Looks up the 1K JPG download links of a Poly Haven texture through its public API.
async function polyHavenFiles(slug) {
  const res = await fetchTimeout(`https://api.polyhaven.com/files/${slug}`, 15000);
  if (!res.ok) throw new Error(`${slug}: ${res.status}`);
  const files = await res.json();
  const find = (...names) => {
    for (const k of Object.keys(files)) if (names.includes(k.toLowerCase())) {
      const url = files[k]?.['1k']?.jpg?.url;
      if (url) return url;
    }
    return null;
  };
  const urls = { diff: find('diffuse', 'diff', 'albedo', 'color'), nor: find('nor_gl', 'normal_gl', 'normal'), arm: find('arm'), rough: find('rough', 'roughness'), ao: find('ao') };
  if (!urls.diff || !urls.nor) throw new Error(`${slug}: no 1k jpg maps`);
  return urls;
}

// Layers that scripts/get-textures.sh saved into assets/textures (it writes a manifest listing them).
const localLayers = location.protocol.startsWith('http')
  ? fetch('assets/textures/manifest.json').then((r) => (r.ok ? r.json() : [])).catch(() => [])
  : Promise.resolve([]);

async function loadPhotoLayer(l, albedo, normal) {
  const layer = TEX_LAYERS[l];
  const tries = [];
  if ((await localLayers).includes(layer.id)) {
    const base = `assets/textures/${layer.id}`;
    tries.push({ name: `local ${layer.id}`, urls: { diff: `${base}_diff.jpg`, nor: `${base}_nor.jpg`, arm: `${base}_arm.jpg` } });
  }
  for (const slug of layer.assets) tries.push({ name: slug, slug });
  for (const t of tries) {
    try {
      const urls = t.urls || await polyHavenFiles(t.slug);
      const [diff, nor] = await Promise.all([imagePixels(urls.diff), imagePixels(urls.nor)]);
      let arm = null, rough = null, ao = null;
      if (urls.arm) arm = await imagePixels(urls.arm).catch(() => null);
      if (!arm && urls.rough) rough = await imagePixels(urls.rough).catch(() => null);
      if (!arm && urls.ao) ao = await imagePixels(urls.ao).catch(() => null);
      const S = TEX_SIZE, off = l * S * S * 4;
      for (let p = 0; p < S * S; p++) {
        const o = off + p * 4, q = p * 4;
        albedo[o] = diff[q]; albedo[o + 1] = diff[q + 1]; albedo[o + 2] = diff[q + 2];
        albedo[o + 3] = arm ? arm[q + 1] : rough ? rough[q] : 220;
        normal[o] = nor[q]; normal[o + 1] = nor[q + 1];
        normal[o + 2] = arm ? arm[q] : ao ? ao[q] : 255; normal[o + 3] = 255;
      }
      return t.slug ? t.slug : 'local copy';
    } catch (e) { /* try the next one */ }
  }
  return null;
}

async function loadPhotoTextures(albedo, normal) {
  const results = await Promise.all(TEX_LAYERS.map((_, l) => loadPhotoLayer(l, albedo, normal)));
  let loaded = 0;
  results.forEach((r, l) => { texInfo.layers[TEX_LAYERS[l].id] = r || 'generated'; if (r) loaded++; });
  texInfo.source = loaded === 0 ? 'generated' : loaded === TEX_LAYERS.length ? 'photo' : 'mixed';
  if (loaded) {
    texUniforms.tAlbedo.value.needsUpdate = true;
    texUniforms.tNormal.value.needsUpdate = true;
  }
  console.info('Ground textures:', texInfo.layers);
  if (typeof toast === 'function') toast(loaded ? `Loaded ${loaded} of ${TEX_LAYERS.length} photo textures from ${results.some((r) => r === 'local copy') ? 'assets/textures' : 'Poly Haven'}` : 'Using generated textures (Poly Haven not reachable)');
}

// GLSL shared by everything that samples the ground textures
export const TEX_GLSL = /* glsl */`
  precision highp sampler2DArray;
  uniform sampler2DArray tAlbedo, tNormal;
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // Triplanar sample of one layer: projects the texture along x, y and z and blends by the normal,
  // so steep cliffs don't get stretched. Explicit gradients keep mipmapping right inside branches.
  void triplanar(float layer, float sc, vec3 p, vec3 dpx, vec3 dpy, vec3 bw, vec3 wn, float wt,
                 inout vec4 alb, inout vec3 nrm, inout float ao) {
    if (bw.x > 0.01) {
      vec2 uv = p.zy * sc, gx = dpx.zy * sc, gy = dpy.zy * sc;
      vec4 n = textureGrad(tNormal, vec3(uv, layer), gx, gy);
      vec2 t = n.xy * 2.0 - 1.0;
      alb += textureGrad(tAlbedo, vec3(uv, layer), gx, gy) * bw.x * wt;
      nrm += vec3(0.0, t.y, t.x * sign(wn.x)) * bw.x * wt;
      ao += n.z * bw.x * wt;
    }
    if (bw.y > 0.01) {
      vec2 uv = p.xz * sc, gx = dpx.xz * sc, gy = dpy.xz * sc;
      vec4 n = textureGrad(tNormal, vec3(uv, layer), gx, gy);
      vec4 a = textureGrad(tAlbedo, vec3(uv, layer), gx, gy);
      vec2 t = n.xy * 2.0 - 1.0;
      // Flat ground shows a texture's repeat the most: blend in a turned, shifted copy in
      // irregular patches, so the same tile isn't seen in rows.
      float other = smoothstep(0.36, 0.64, vnoise(p * 0.09 + layer * 7.3));
      if (other > 0.01) {
        const mat2 R = mat2(0.8, 0.6, -0.6, 0.8);
        vec2 uv2 = R * uv * 0.83 + vec2(0.37, 0.71);
        vec4 n2 = textureGrad(tNormal, vec3(uv2, layer), R * gx * 0.83, R * gy * 0.83);
        vec4 a2 = textureGrad(tAlbedo, vec3(uv2, layer), R * gx * 0.83, R * gy * 0.83);
        a = mix(a, a2, other);
        t = mix(t, transpose(R) * (n2.xy * 2.0 - 1.0), other);
        n.z = mix(n.z, n2.z, other);
      }
      alb += a * bw.y * wt;
      nrm += vec3(t.x, 0.0, t.y * sign(wn.y)) * bw.y * wt;
      ao += n.z * bw.y * wt;
    }
    if (bw.z > 0.01) {
      vec2 uv = p.xy * sc, gx = dpx.xy * sc, gy = dpy.xy * sc;
      vec4 n = textureGrad(tNormal, vec3(uv, layer), gx, gy);
      vec2 t = n.xy * 2.0 - 1.0;
      alb += textureGrad(tAlbedo, vec3(uv, layer), gx, gy) * bw.z * wt;
      nrm += vec3(t.x * sign(wn.z), t.y, 0.0) * bw.z * wt;
      ao += n.z * bw.z * wt;
    }
  }
`;
