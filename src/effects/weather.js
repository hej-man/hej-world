import * as THREE from 'three';
import { state } from '../state.js';
import { QUALITY } from '../config.js';
import { mulberry32, smoothstep } from '../noise.js';
import { terrainUniforms } from '../terrain/material.js';
import { FOG_DENSITY, bakeSkyLight, camera, csm, scene, sky, skyColor, skyDome } from '../render/scene.js';
import { raycastTerrain } from '../world/query.js';
import { cloudMats, clouds } from '../world/vegetation.js';
import { grassUniforms } from '../world/grass.js';
import { voxelRay } from '../world/blocks.js';
import { cameraIn } from './underwater.js';
import { sound, thunder } from './sound.js';

// ---------------------------------------------------------------------------
// Weather: clear, cloudy, rain and thunderstorms come and go on their own, one step at a time (clear
// skies cloud over before it rains, a storm eases back to rain), building up and clearing over a
// minute or so. In creative mode K steps through them by hand. Clouds grey the sky and dim the sun,
// rain falls around the camera (snow up in the mountains), fog thickens, the ground gets wet and
// dark, and storms flash and rumble. Rain stops where something is over your head (a cave, a roof).
// ---------------------------------------------------------------------------
// last: how long it lasts, in seconds (min, max). next: what it can turn into, with weights.
// (A whole round, clear to rain and back, takes about ten minutes, so you see the weather change
// within a normal play session; it used to take half an hour and looked stuck.)
export const WEATHER = {
  clear:  { name: 'Clear', cloud: 0.12, rain: 0, storm: 0, wind: 0.2, last: [120, 280], next: { cloudy: 1 } },
  cloudy: { name: 'Cloudy', cloud: 0.68, rain: 0, storm: 0, wind: 0.45, last: [70, 170], next: { clear: 0.4, rain: 0.6 } },
  rain:   { name: 'Rain', cloud: 0.9, rain: 0.7, storm: 0, wind: 0.6, last: [90, 200], next: { cloudy: 0.7, storm: 0.3 } },
  storm:  { name: 'Thunderstorm', cloud: 1, rain: 1, storm: 1, wind: 1, last: [50, 120], next: { rain: 1 } },
};
const ORDER = ['clear', 'cloudy', 'rain', 'storm'];
// A new world starts in any weather but a storm, part way through it.
export function startWeather() {
  setWeather(['clear', 'clear', 'cloudy', 'rain'][Math.floor(Math.random() * 4)], true);
  weather.timer *= 0.3 + Math.random() * 0.4;
  weather.manual = false;
}
export const weather = { state: 'clear', timer: 200, cloud: 0.1, rain: 0, storm: 0, wind: 0.2, sun: 1, puddles: 0, snow: 0, covered: 0, coverT: 0, flash: 0, nextBolt: 6, baked: 0.1 };
const skyClear = { zenith: sky.zenith.clone(), horizon: sky.horizon.clone(), sun: sky.sun.clone(), ground: sky.ground.clone() };
const skyStorm = { zenith: new THREE.Color(0x4a525c), horizon: new THREE.Color(0x7d858d), sun: new THREE.Color(0x9aa0a8), ground: new THREE.Color(0x2c2e2c) };
const cloudColors = { top: [new THREE.Color(0xffffff), new THREE.Color(0x8d939b)], under: [new THREE.Color(0xc4ccd6), new THREE.Color(0x5c636c)] };
const flashEl = document.getElementById('flash');
const flashLight = new THREE.HemisphereLight(0xdde6ff, 0x50505a, 0);
scene.add(flashLight);

export function setWeather(state, quick = false) {
  const [lo, hi] = WEATHER[state].last;
  weather.state = state;
  weather.timer = lo + Math.random() * (hi - lo);
  if (quick) Object.assign(weather, { cloud: WEATHER[state].cloud, rain: WEATHER[state].rain, storm: WEATHER[state].storm });
}
// the natural next step from the current weather
export function nextWeather() {
  const next = WEATHER[weather.state].next, total = Object.values(next).reduce((a, b) => a + b, 0);
  let r = Math.random() * total, pick = Object.keys(next)[0];
  for (const [k, w] of Object.entries(next)) { r -= w; if (r < 0) { pick = k; break; } }
  setWeather(pick);
  weather.manual = false;
}
// creative mode: K steps clear -> cloudy -> rain -> storm -> clear, changing quickly
export function cycleWeather() {
  setWeather(ORDER[(ORDER.indexOf(weather.state) + 1) % ORDER.length]);
  weather.manual = true;
}

// Rain: streaks that fall through a box around the camera. Each drop keeps its place in the world
// (the box just wraps around you), so walking doesn't drag the rain along.
const RAIN_DROPS = QUALITY === 'low' ? 3500 : 9000, SNOW_FLAKES = QUALITY === 'low' ? 2500 : 6000;
const precipUniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWindXZ: { value: new THREE.Vector2(2, 1) }, uAlpha: { value: 0 } };
function makePrecipitation(count, snow) {
  const rand = mulberry32(snow ? 77 : 33);
  const verts = snow ? 1 : 2, pos = new Float32Array(count * verts * 3), end = new Float32Array(count * verts);
  for (let i = 0; i < count; i++) {
    const x = rand(), y = rand(), z = rand();
    for (let v = 0; v < verts; v++) { pos.set([x, y, z], (i * verts + v) * 3); end[i * verts + v] = v; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const box = snow ? [50, 30, 50] : [56, 34, 56], speed = snow ? 1.6 : 22, len = 0.6;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...precipUniforms, uAlpha: { value: 0 } },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `
      uniform float uTime; uniform vec3 uCam; uniform vec2 uWindXZ;
      attribute float aEnd;
      varying float vFade;
      void main() {
        vec3 box = vec3(${box.map((b) => b.toFixed(1)).join(', ')});
        vec3 vel = vec3(uWindXZ.x, -${speed.toFixed(1)}, uWindXZ.y);
        vec3 p = position * box + vel * uTime;
        ${snow ? 'p.x += sin(uTime * 0.9 + position.y * 40.0) * 0.6; p.z += cos(uTime * 0.7 + position.x * 40.0) * 0.6;' : ''}
        vec3 lo = uCam - box * 0.5;
        p = lo + mod(p - lo, box);
        ${snow ? '' : `p -= normalize(vel) * ${len.toFixed(2)} * aEnd; // the streak's tail`}
        float d = length(p - uCam);
        vFade = (1.0 - smoothstep(box.x * 0.3, box.x * 0.5, d)) * smoothstep(0.5, 2.0, d);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        ${snow ? 'gl_PointSize = clamp(90.0 / -mv.z, 1.0, 9.0);' : ''}
      }`,
    fragmentShader: `
      uniform float uAlpha;
      varying float vFade;
      void main() {
        ${snow ? 'vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.2, length(c));' : 'float a = 1.0;'}
        gl_FragColor = vec4(${snow ? 'vec3(1.0)' : 'vec3(0.72, 0.76, 0.82)'}, a * vFade * uAlpha);
      }`,
  });
  const obj = snow ? new THREE.Points(geo, mat) : new THREE.LineSegments(geo, mat);
  obj.frustumCulled = false;
  obj.renderOrder = 2;
  obj.userData.count = count; obj.userData.verts = verts;
  return obj;
}
const rainFx = makePrecipitation(RAIN_DROPS, false), snowFx = makePrecipitation(SNOW_FLAKES, true);
scene.add(rainFx, snowFx);

const _up = new THREE.Vector3(0, 1, 0);
export function updateWeather(dt) {
  weather.timer -= dt;
  if (weather.timer <= 0) nextWeather();
  // natural changes build up slowly, clouds first and rain once they've gathered (and the rain
  // stops before the clouds clear); a change picked by hand happens within seconds
  const tgt = WEATHER[weather.state], slow = weather.manual ? 0.15 : 1;
  // the sky is never quite still: clouds thicken and thin and showers come and go in waves
  weather.driftT = (weather.driftT || 0) + dt;
  const wave = Math.sin(weather.driftT * 0.021) * 0.6 + Math.sin(weather.driftT * 0.053 + 1.3) * 0.4;
  const cloudTo = Math.min(1, Math.max(0, tgt.cloud + wave * (weather.state === 'storm' ? 0 : 0.12)));
  const rainTo = tgt.rain * (1 + wave * 0.25 * (weather.state === 'rain' ? 1 : 0)) * smoothstep(0.6, 0.85, weather.cloud), stormTo = tgt.storm * smoothstep(0.4, 0.9, weather.rain);
  const ease = (key, to, secs) => { weather[key] += (to - weather[key]) * (1 - Math.exp(-dt / (secs * slow))); };
  ease('cloud', cloudTo, cloudTo > weather.cloud ? 30 : 45);
  ease('rain', rainTo, rainTo > weather.rain ? 18 : 10);
  ease('storm', stormTo, 15);
  ease('wind', tgt.wind, 25);
  const c = smoothstep(0.15, 1, weather.cloud), cam = camera.position;

  // sky, sun and fog
  for (const key of ['zenith', 'horizon', 'sun', 'ground']) sky[key].copy(skyClear[key]).lerp(skyStorm[key], c * 0.9);
  if (weather.flash > 0) sky.horizon.lerp(new THREE.Color(0xd8e0f0), weather.flash * 0.5);
  skyDome.material.uniforms.uSunGlow.value = 1 - c * 0.85;
  for (const l of csm.lights) l.intensity = 3.4 * (1 - 0.7 * c);
  if (!cameraIn()) {
    scene.fog.color.copy(skyColor);
    scene.fog.density = FOG_DENSITY * (1 + c * 0.6 + weather.rain * 1.4);
  }
  if (Math.abs(c - weather.baked) > 0.04) { weather.baked = c; bakeSkyLight(); }
  if (cloudMats.top) {
    cloudMats.top.color.copy(cloudColors.top[0]).lerp(cloudColors.top[1], c);
    cloudMats.under.color.copy(cloudColors.under[0]).lerp(cloudColors.under[1], c);
    const n = clouds.children.length, show = Math.round(n * (0.3 + 0.7 * weather.cloud));
    clouds.children.forEach((g, i) => { g.visible = i < show; });
  }

  // is something over the camera's head? (checked a few times a second)
  weather.coverT -= dt;
  if (weather.coverT <= 0) {
    weather.coverT = 0.25;
    const above = !!raycastTerrain(cam, _up, 0, 60) || !!voxelRay(cam, _up, 0, 24);
    weather.coveredTarget = above || cameraIn() ? 1 : 0;
  }
  weather.covered += ((weather.coveredTarget || 0) - weather.covered) * Math.min(1, dt * 4);
  weather.snow = smoothstep(58, 74, cam.y);
  const open = 1 - weather.covered;
  precipUniforms.uTime.value = state.gameTime;
  precipUniforms.uCam.value.copy(cam);
  precipUniforms.uWindXZ.value.set(1 + weather.wind * 5, 0.5 + weather.wind * 2);
  rainFx.material.uniforms.uAlpha.value = 0.38 * open * (1 - weather.snow);
  snowFx.material.uniforms.uAlpha.value = 0.9 * open * weather.snow;
  rainFx.geometry.setDrawRange(0, Math.floor(rainFx.userData.count * weather.rain) * 2);
  snowFx.geometry.setDrawRange(0, Math.floor(snowFx.userData.count * weather.rain));
  rainFx.visible = weather.rain > 0.01 && weather.snow < 0.99;
  snowFx.visible = weather.rain > 0.01 && weather.snow > 0.01;
  terrainUniforms.uRainWet.value += ((weather.rain > 0.2 ? 1 : 0) - terrainUniforms.uRainWet.value) * Math.min(1, dt / (weather.rain > 0.2 ? 25 : 60));
  // sunshine (dries puddles, pools and the river): clear skies with no rain
  weather.sun = (1 - smoothstep(0.25, 0.85, weather.cloud)) * (1 - smoothstep(0.05, 0.3, weather.rain));
  // puddles gather in hollows over a minute or two of rain and dry up in the sun, slowly under cloud
  weather.puddles = Math.min(1, Math.max(0, weather.puddles + (weather.rain * 0.012 - weather.sun * 0.006 - 0.0008) * dt));
  terrainUniforms.uPuddles.value = weather.puddles;
  terrainUniforms.uRaining.value = weather.rain * (1 - weather.snow);
  grassUniforms.uWind.value = weather.wind;

  // lightning
  if (weather.storm > 0.6) {
    weather.nextBolt -= dt;
    if (weather.nextBolt <= 0) {
      weather.nextBolt = 4 + Math.random() * 12;
      weather.flash = 1;
      const dist = Math.random();
      thunder(0.3 + dist * 2.5, 1 - dist * 0.6);
    }
  }
  weather.flash = Math.max(0, weather.flash - dt * 4);
  const flicker = weather.flash > 0 ? weather.flash * (0.6 + 0.4 * Math.sin(state.gameTime * 60)) : 0;
  flashLight.intensity = flicker * 5 * open;
  flashEl.style.opacity = (flicker * 0.35 * open).toFixed(3);

  if (sound.rain) sound.rain.gain.setTargetAtTime(sound.on ? weather.rain * (1 - weather.snow) * (0.12 + 0.18 * open) : 0, sound.ctx.currentTime, 0.4);
}
