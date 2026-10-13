import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { QUALITY, WORLD } from '../config.js';
import { texUniforms } from '../terrain/textures.js';

// ---------------------------------------------------------------------------
// Renderer / scene: sky, sunlight with cascaded shadows, light from the sky (image-based), height fog
// ---------------------------------------------------------------------------
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// full retina resolution costs a lot with these shaders; 1.5x is nearly as sharp
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY === 'low' ? 1 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);
for (const t of [texUniforms.tAlbedo, texUniforms.tNormal]) if (t.value) t.value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

export const scene = new THREE.Scene();
// towards the sun; it moves through the day (effects/daynight.js)
export const SUN_DIR = new THREE.Vector3(0.62, 0.52, 0.38).normalize();
export const sky = {
  zenith: new THREE.Color(0x2f6cc0),
  horizon: new THREE.Color(0xb9cfe2),
  ground: new THREE.Color(0x4a4a3c), // what the lower half of the sky light looks like (bounce from the ground)
  sun: new THREE.Color(0xfff1dc),
};
export const skyColor = sky.horizon; // fog fades into the horizon, so far hills melt into the sky
export const FOG_DENSITY = 0.0024;
// Beyond this distance terrain isn't drawn at all; the fog reaches the sky colour there.
// Vegetation switches to simpler shapes at VEG_NEAR and stops at VEG_FAR.
export const VIEW_DIST = QUALITY === 'low' ? 380 : 480, VEG_NEAR = QUALITY === 'low' ? 90 : 140, VEG_FAR = VIEW_DIST - 40;
scene.background = skyColor;
scene.fog = new THREE.FogExp2(skyColor, FOG_DENSITY);

// Height fog for every material: thick in the valleys, thinning with altitude, a little haze
// everywhere, and warmer when looking towards the sun. Underwater (dense fog) it is plain fog.
function installHeightFog() {
  const s = SUN_DIR, sunFog = new THREE.Color(0xffe0b4).convertLinearToSRGB();
  const f = (v) => v.toFixed(4);
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
    varying vec3 vFogWorldPos;
  #endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
    vFogWorldPos = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;
  #endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying vec3 vFogWorldPos;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
  #endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
    vec3 fogRay = vFogWorldPos - cameraPosition;
    float fogDist = length(fogRay);
    vec3 fogDir = fogRay / max(fogDist, 1e-4);
    vec3 fogCol = fogColor;
    #ifdef FOG_EXP2
      float fogFactor;
      if (fogDensity > 0.02) {
        fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDist * fogDist);
      } else {
        const float falloff = 0.045;
        float h0 = max(cameraPosition.y - ${f(WORLD.waterLevel)}, -5.0);
        float k = fogDir.y * falloff * fogDist;
        float layer = abs(k) < 1e-3 ? fogDist : (1.0 - exp(-k)) / (fogDir.y * falloff);
        float amount = fogDensity * (exp(-h0 * falloff) * layer * 1.3 + fogDist * 0.5);
        fogFactor = max(1.0 - exp(-amount), smoothstep(${f(VIEW_DIST * 0.62)}, ${f(VIEW_DIST)}, fogDist));
        float toSun = pow(max(dot(fogDir, vec3(${f(s.x)}, ${f(s.y)}, ${f(s.z)})), 0.0), 6.0);
        fogCol = mix(fogColor, vec3(${f(sunFog.r)}, ${f(sunFog.g)}, ${f(sunFog.b)}), toSun * 0.35);
      }
    #else
      float fogFactor = smoothstep(fogNear, fogFar, fogDist);
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogFactor);
  #endif`;
}
installHeightFog();

export const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 1000);

// Sky dome: a gradient from the horizon haze to deep blue overhead, with a glow around the sun.
function makeSkyMaterial(disc) {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR }, uZenith: { value: sky.zenith }, uHorizon: { value: sky.horizon }, uGround: { value: disc ? sky.horizon : sky.ground }, uSunCol: { value: sky.sun }, uDisc: { value: disc ? 1 : 0 }, uSunGlow: { value: 1 }, uNight: { value: 0 } },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 uSun, uZenith, uHorizon, uGround, uSunCol; uniform float uDisc, uSunGlow, uNight;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.55));
        col = mix(col, uGround, smoothstep(0.0, -0.2, d.y));
        float s = max(dot(d, uSun), 0.0), up = smoothstep(-0.12, 0.02, uSun.y);
        col += uSunCol * (0.12 * pow(s, 6.0) + 0.45 * pow(s, 90.0)) * (0.4 + 0.6 * uDisc) * uSunGlow * up;
        col += uSunCol * smoothstep(0.99965, 0.9998, s) * 30.0 * uDisc * uSunGlow * uSunGlow * up;
        // at night: stars, and the moon opposite the sun
        if (uNight > 0.01 && uDisc > 0.5 && d.y > 0.0) {
          vec3 cell = floor(d * 260.0);
          float st = step(0.9965, hash(cell)) * smoothstep(0.0, 0.25, d.y);
          col += vec3(0.9, 0.92, 1.0) * st * uNight * (0.5 + 0.5 * hash(cell + 7.0));
          vec3 m = normalize(vec3(-uSun.x, -uSun.y, abs(uSun.z)));
          float md = dot(d, m);
          col += vec3(0.85, 0.88, 1.0) * (smoothstep(0.99955, 0.9997, md) * 2.2 + pow(max(md, 0.0), 60.0) * 0.12) * uNight;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  });
}
export const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), makeSkyMaterial(true));
skyDome.scale.setScalar(900);
skyDome.frustumCulled = false;
skyDome.renderOrder = -10;
scene.add(skyDome);

// Light from the whole sky (image-based lighting): the dome without the sun disc, pre-filtered.
// Re-made when clouds change the sky's colours.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = makeSkyMaterial(false);
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), envSky));
let envTarget = null;
export function bakeSkyLight() {
  const old = envTarget;
  envTarget = pmrem.fromScene(envScene, 0, 0.1, 1000);
  scene.environment = envTarget.texture;
  old?.dispose();
}
bakeSkyLight();

// Sunlight with cascaded shadow maps: a sharp map near the player and a coarser one further out.
export const csm = new CSM({
  camera, parent: scene, cascades: 2, maxFar: 220, mode: 'practical',
  shadowMapSize: QUALITY === 'low' ? 1024 : 2048, lightDirection: SUN_DIR.clone().negate(),
  lightIntensity: 3.4, lightNear: 1, lightFar: 1400, lightMargin: 180, shadowBias: -0.00015,
});
csm.fade = true;
for (const l of csm.lights) { l.color.copy(sky.sun); l.shadow.normalBias = 0.05; }
// Every lit material has to know about the cascades, or it would be lit once per cascade.
const litMaterials = new WeakSet();
export function litMaterial(mat) {
  if (litMaterials.has(mat) || !(mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial)) return mat;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey();
  csm.setupMaterial(mat);
  const csmHook = mat.onBeforeCompile;
  mat.onBeforeCompile = function (shader, r) { prev.call(this, shader, r); csmHook.call(this, shader, r); };
  mat.customProgramCacheKey = () => prevKey + '|csm';
  litMaterials.add(mat);
  mat.needsUpdate = true;
  return mat;
}
export function prepareLighting(root) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) litMaterial(m);
  });
}
export function forgetMaterial(m) { csm.shaders.delete(m); }

// Lantern carried by the player (helps in caves)
export const lantern = new THREE.PointLight(0xffc27a, 22, 20, 1.6);
scene.add(lantern);
