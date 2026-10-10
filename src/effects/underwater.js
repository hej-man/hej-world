import * as THREE from 'three';
import { WORLD } from '../config.js';
import { FOG_DENSITY, camera, scene, skyColor, skyDome } from '../render/scene.js';
import { terrainFns } from '../world/world.js';
import { fluidAt } from '../world/fluids.js';

// ---------------------------------------------------------------------------
// Underwater: dense blue fog and a tint when the camera dips below the surface
// ---------------------------------------------------------------------------
const waterFogColor = new THREE.Color(0x1b5878);
const underwaterEl = document.getElementById('underwater');
export let cameraUnderwater = false;
export function updateUnderwater() {
  const p = camera.position, S = WORLD.size;
  const inside = p.x > 1 && p.z > 1 && p.x < S - 1 && p.z < S - 1, fl = inside && fluidAt(p.x, p.y, p.z);
  const under = inside && (p.y < terrainFns.waterAt(p.x, p.z) - 0.05 || (fl?.type === 'water' && p.y < fl.top - 0.05));
  if (under === cameraUnderwater) return;
  cameraUnderwater = under;
  scene.fog.color.copy(under ? waterFogColor : skyColor);
  scene.fog.density = under ? 0.075 : FOG_DENSITY; // the weather adjusts it again above water
  scene.background = under ? waterFogColor : skyColor;
  skyDome.visible = !under;
  underwaterEl.style.display = under ? 'block' : 'none';
}
