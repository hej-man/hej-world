import { state } from '../state.js';
import { camera, csm, lantern, renderer } from '../render/scene.js';
import { player, respawn } from '../player/character.js';
import { inventoryOpen, selectSlot, setInventoryOpen } from '../inventory/inventory.js';
import { SHAPES, SHAPE_NAMES, TILTS } from '../world/blocks.js';
import { setCreative } from '../player/survival.js';
import { mouse } from '../player/interaction.js';
import { WEATHER, cycleWeather, weather } from '../effects/weather.js';
import { setSound, sound } from '../effects/sound.js';
import { toast } from './hud.js';
import { $, clampPitch, gameState, updateOverlay } from './menu.js';
import { CAM_DISTANCES } from '../player/camera.js';

export const keys = {};

document.addEventListener('pointerlockchange', () => {
  state.locked = document.pointerLockElement === renderer.domElement;
  if (!state.locked) mouse.left = mouse.right = false;
  updateOverlay();
});
document.addEventListener('pointerlockerror', updateOverlay);
document.addEventListener('mousemove', (e) => {
  if (!state.locked) return;
  state.yaw -= e.movementX * 0.0022;
  state.pitch -= e.movementY * 0.0022;
  clampPitch();
});
document.addEventListener('mousedown', (e) => {
  if (!state.locked || inventoryOpen || gameState !== 'playing') return;
  if (e.button === 0) mouse.left = true;
  if (e.button === 2) { mouse.right = true; state.useCd = Math.min(state.useCd, 0); }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.left = false;
  if (e.button === 2) mouse.right = false;
});
document.addEventListener('contextmenu', (e) => { if (state.locked) e.preventDefault(); });
window.addEventListener('wheel', (e) => {
  if (!state.locked || inventoryOpen) return;
  selectSlot(state.selectedSlot + Math.sign(e.deltaY));
}, { passive: true });
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (gameState !== 'playing') return;
  if (e.code === 'Tab') e.preventDefault();
  if (e.code === 'KeyE' || e.code === 'KeyI' || e.code === 'Tab') { if (!e.repeat) setInventoryOpen(!inventoryOpen); return; }
  if (inventoryOpen) { if (e.code === 'Escape') setInventoryOpen(false); return; }
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  if (e.code.startsWith('Digit') && e.code !== 'Digit0') selectSlot(+e.code.slice(5) - 1);
  if (e.code === 'KeyV' || e.code === 'KeyC') {
    state.thirdPerson = !state.thirdPerson;
    if (!state.thirdPerson) state.yaw = player.facing;
    clampPitch();
  }
  if (e.code === 'KeyG') setCreative(!state.creative);
  if (e.code === 'KeyZ') state.camDistIndex = (state.camDistIndex + 1) % CAM_DISTANCES.length;
  if (e.code === 'KeyF') { state.lanternOn = !state.lanternOn; lantern.visible = state.lanternOn; }
  if (e.code === 'KeyR') respawn();
  if (e.code === 'KeyB') {
    state.buildShape = SHAPES[(SHAPES.indexOf(state.buildShape) + 1) % SHAPES.length];
    toast(`Building shape: ${SHAPE_NAMES[state.buildShape]} (B to change, T to tip it)`);
  }
  if (e.code === 'KeyT') {
    state.buildTilt = (state.buildTilt + 1) % TILTS.length;
    toast(`Place blocks ${TILTS[state.buildTilt]} (T to change; they also turn the way you look)`);
  }
  if (e.code === 'KeyK') {
    if (state.creative) { cycleWeather(); toast(`Weather: ${WEATHER[weather.state].name}`); }
    else toast('The weather changes on its own in survival (K sets it in creative)');
  }
  if (e.code === 'KeyM') { setSound(!sound.on); $('sound-select').value = sound.on ? 'on' : 'off'; toast(sound.on ? 'Sound on' : 'Sound off'); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.left = mouse.right = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  csm.updateFrustums();
});
