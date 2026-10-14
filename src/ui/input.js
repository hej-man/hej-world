import { state } from '../state.js';
import { camera, csm, lantern, renderer } from '../render/scene.js';
import { player, respawn } from '../player/character.js';
import { inventoryOpen, inventoryTab, selectSlot, setInventoryOpen, setInventoryTab } from '../inventory/inventory.js';
import { SHAPES, SHAPE_NAMES, TILTS } from '../world/blocks.js';
import { setCreative } from '../player/survival.js';
import { mouse } from '../player/interaction.js';
import { WEATHER, cycleWeather, weather } from '../effects/weather.js';
import { setSound, sound } from '../effects/sound.js';
import { toast } from './hud.js';
import { $, clampPitch, gameState, updateOverlay } from './menu.js';
import { CAM_DISTANCES } from '../player/camera.js';
import { actionOf, binds, held, keyName } from './keybinds.js';

export const keys = {};

document.addEventListener('pointerlockchange', () => {
  state.locked = document.pointerLockElement === renderer.domElement;
  if (!state.locked) { mouse.left = mouse.right = false; for (const k in keys) if (k.startsWith('Mouse')) keys[k] = false; }
  updateOverlay();
});
document.addEventListener('pointerlockerror', updateOverlay);
document.addEventListener('mousemove', (e) => {
  if (!state.locked) return;
  state.yaw -= e.movementX * 0.0022;
  state.pitch -= e.movementY * 0.0022;
  clampPitch();
});
// Mouse buttons are bound like keys (Mouse0 left, Mouse2 right...), so any of them can do any action.
document.addEventListener('mousedown', (e) => {
  if (!state.locked || inventoryOpen || gameState !== 'playing') return;
  if (e.button === 1) e.preventDefault(); // middle click would start scrolling
  press(`Mouse${e.button}`, e);
});
document.addEventListener('mouseup', (e) => release(`Mouse${e.button}`));
// break / attack and place / use follow whichever keys or buttons they're on
function syncMouse() {
  mouse.left = held(keys, 'attack');
  mouse.right = held(keys, 'use');
}
document.addEventListener('contextmenu', (e) => { if (state.locked) e.preventDefault(); });
window.addEventListener('wheel', (e) => {
  if (!state.locked || inventoryOpen) return;
  selectSlot(state.selectedSlot + Math.sign(e.deltaY));
}, { passive: true });
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (gameState !== 'playing') return;
  press(e.code, e);
});
function press(code, e) {
  const act = actionOf(code);
  if (code === 'Tab' || act === 'view') e.preventDefault(); // Tab would move the focus
  if (act === 'inventory' || act === 'crafting') {
    if (e.repeat) return;
    const tab = act === 'crafting' ? 'craft' : state.creative ? 'items' : 'bag';
    // the key for the page you're on closes it; the other key switches page
    if (inventoryOpen && (inventoryTab === tab || (act === 'inventory' && inventoryTab !== 'craft'))) setInventoryOpen(false);
    else if (inventoryOpen) setInventoryTab(tab);
    else setInventoryOpen(true, tab);
    return;
  }
  if (inventoryOpen) { if (code === 'Escape') setInventoryOpen(false); return; }
  keys[code] = true;
  if (act === 'attack' || act === 'use') {
    if (act === 'use' && !mouse.right) state.useCd = Math.min(state.useCd, 0);
    syncMouse();
  }
  if (code === 'Space' || act === 'jump') e.preventDefault();
  if (e.repeat) return;
  if (code.startsWith('Digit') && code !== 'Digit0') selectSlot(+code.slice(5) - 1);
  switch (act) {
    case 'view': cycleView(); break;
    case 'creative': setCreative(!state.creative); break;
    case 'camDist': state.camDistIndex = (state.camDistIndex + 1) % CAM_DISTANCES.length; break;
    case 'lantern': state.lanternOn = !state.lanternOn; lantern.visible = state.lanternOn; break;
    case 'respawn': respawn(); break;
    case 'shape':
      state.buildShape = SHAPES[(SHAPES.indexOf(state.buildShape) + 1) % SHAPES.length];
      toast(`Building shape: ${SHAPE_NAMES[state.buildShape]} (${keyName(binds.shape[0])} to change, ${keyName(binds.tilt[0])} to tip it)`);
      break;
    case 'tilt':
      state.buildTilt = (state.buildTilt + 1) % TILTS.length;
      toast(`Place blocks ${TILTS[state.buildTilt]} (they also turn the way you look)`);
      break;
    case 'weather':
      if (state.creative) { cycleWeather(); toast(`Weather: ${WEATHER[weather.state].name}`); }
      else toast('The weather changes on its own in survival (you can set it in creative)');
      break;
    case 'sound': setSound(!sound.on); $('sound-select').value = sound.on ? 'on' : 'off'; toast(sound.on ? 'Sound on' : 'Sound off'); break;
  }
}

// First person, then the camera behind you, then in front of you looking back at you.
export function cycleView() {
  const order = ['first', 'back', 'front'], next = order[(order.indexOf(state.view) + 1) % order.length];
  if (state.view === 'first') state.yaw = player.facing;
  setView(next);
  toast({ first: 'First person', back: 'Third person', front: 'Front view' }[next]);
}
export function setView(view) {
  state.view = view;
  state.thirdPerson = view !== 'first';
  clampPitch();
}
function release(code) {
  if (!keys[code]) return;
  keys[code] = false;
  syncMouse();
}
window.addEventListener('keyup', (e) => release(e.code));
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.left = mouse.right = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  csm.updateFrustums();
});
