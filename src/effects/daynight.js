import * as THREE from 'three';
import { smoothstep } from '../noise.js';
import { SUN_DIR, csm, skyDome } from '../render/scene.js';

// ---------------------------------------------------------------------------
// Day and night. The clock runs from 0 to 24 hours; a whole day takes DAY_SECONDS of play (about
// 12 minutes of daylight, then dusk, a 5 minute night and dawn). The sun rises in the east (+x), goes
// over the south and sets in the west, and the moon follows on the other side of the sky. At night
// the sky goes dark blue with stars, the light turns to dim moonlight, and more predators and the
// night monsters come out (animals.js asks `isNight`).
// ---------------------------------------------------------------------------
export const DAY_SECONDS = 20 * 60;
export const day = {
  hour: 8,     // the clock, 0..24 (a new world starts in the morning)
  count: 1,    // which day it is
  light: 1,    // how much sunlight: 1 in the day, 0 at night
  twilight: 0, // 1 around sunrise and sunset (orange skies)
  frozen: false, // tests can stop the clock
};
export const moonDir = new THREE.Vector3();
export const isNight = () => day.light < 0.25;

export function setHour(h) {
  day.hour = ((h % 24) + 24) % 24;
  placeSun();
}

// Where the sun is for the current hour: rising at 6, highest at noon, setting at 18.
function placeSun() {
  const a = ((day.hour - 6) / 24) * Math.PI * 2;
  SUN_DIR.set(Math.cos(a) * 0.85, Math.sin(a), 0.42).normalize();
  moonDir.copy(SUN_DIR).negate();
  moonDir.z = Math.abs(moonDir.z);
  day.light = smoothstep(-0.1, 0.16, SUN_DIR.y);
  day.twilight = 1 - smoothstep(0.04, 0.3, Math.abs(SUN_DIR.y));
  // the shadows follow whichever is up, the sun or the moon
  csm.lightDirection.copy(day.light > 0.02 ? SUN_DIR : moonDir).negate();
  skyDome.material.uniforms.uNight.value = 1 - day.light;
}

export function updateDayNight(dt) {
  if (!day.frozen) {
    day.hour += (dt / DAY_SECONDS) * 24;
    if (day.hour >= 24) { day.hour -= 24; day.count++; }
  }
  placeSun();
}

// "Day 2, 14:05"
export function clockText() {
  const h = Math.floor(day.hour), m = Math.floor((day.hour - h) * 60);
  return `Day ${day.count}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
placeSun();
