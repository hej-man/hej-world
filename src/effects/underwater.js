import * as THREE from 'three';
import { WORLD } from '../config.js';
import { FOG_DENSITY, camera, scene, skyColor, skyDome } from '../render/scene.js';
import { terrainFns } from '../world/world.js';
import { fluidAt } from '../world/fluids.js';
import { craterLavaAt, lavaTouching } from '../world/volcano.js';

// ---------------------------------------------------------------------------
// Under water or lava: dense fog and a tint when the camera dips below the surface, so you can
// tell you're in it (from inside, the surface itself can't be seen)
// ---------------------------------------------------------------------------
const LOOKS = {
  water: { fog: new THREE.Color(0x1b5878), density: 0.075 },
  lava: { fog: new THREE.Color(0xff5a10), density: 0.9 },
};
const underwaterEl = document.getElementById('underwater');
export let cameraUnderwater = false;
let under = null;   // null, 'water' or 'lava'
export function updateUnderwater() {
  const p = camera.position, S = WORLD.size;
  const inside = p.x > 1 && p.z > 1 && p.x < S - 1 && p.z < S - 1, fl = inside && fluidAt(p.x, p.y, p.z);
  let now = null;
  if (inside && ((fl?.type === 'lava' && p.y < fl.top - 0.05) || p.y < craterLavaAt(p.x, p.z) - 0.05 || lavaTouching(p.x, p.y + 0.1, p.z))) now = 'lava';
  else if (inside && (p.y < terrainFns.waterAt(p.x, p.z) - 0.05 || (fl?.type === 'water' && p.y < fl.top - 0.05))) now = 'water';
  if (now === under) return;
  under = now;
  cameraUnderwater = now === 'water';
  const look = LOOKS[now];
  scene.fog.color.copy(look ? look.fog : skyColor);
  scene.fog.density = look ? look.density : FOG_DENSITY; // the weather adjusts it again above water
  scene.background = look ? look.fog : skyColor;
  skyDome.visible = !look;
  underwaterEl.style.display = look ? 'block' : 'none';
  underwaterEl.className = now === 'lava' ? 'lava' : '';
}
export const cameraIn = () => under;
