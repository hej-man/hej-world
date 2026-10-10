import * as THREE from 'three';
import { state } from '../state.js';
import { generating, newWorld, worldStats } from '../main.js';
import { QUALITY, urlParams } from '../config.js';
import { renderer } from '../render/scene.js';
import { player, respawn } from '../player/character.js';
import { inventoryOpen, setInventoryOpen, setInventoryTab, slots } from '../inventory/inventory.js';
import { fullStats, giveStarterKit, stats } from '../player/survival.js';
import { initSound, setSound, sound } from '../effects/sound.js';
import { menuEl, toast } from './hud.js';
import { ACTIONS, binds, kbd, keyName, resetBinds, setBind } from './keybinds.js';

// ---------------------------------------------------------------------------
// Main menu (title screen) and pause menu
// ---------------------------------------------------------------------------
export let gameState = 'menu';   // 'menu': title screen, the camera circles the world; 'playing'
let gameStarted = false;  // a game is under way that "Continue" goes back to

export const $ = (id) => document.getElementById(id);
// The controls list in the menus, written from the current key bindings
export function renderControls() {
  const html = `${kbd('forward')} ${kbd('left')} ${kbd('back')} ${kbd('right')} move &nbsp; ${kbd('sprint')} sprint &nbsp; ${kbd('jump')} jump / swim up (${kbd('sprint')} dives)<br>
    Mouse look &nbsp; ${kbd('view')} view: first person, behind, in front &nbsp; ${kbd('camDist')} camera distance<br>
    Left click: break / attack &nbsp; Right click: place / eat / drink / use<br>
    Right click on water: drink, or fill an empty bottle<br>
    <kbd>1</kbd>–<kbd>9</kbd> or wheel: hotbar &nbsp; ${kbd('inventory')} backpack &nbsp; ${kbd('crafting')} crafting<br>
    ${kbd('creative')} creative mode (fly: ${kbd('jump')} up, ${kbd('sprint')} down)<br>
    ${kbd('shape')} building shape: block, slab, slope, stairs, roof prism, pillar<br>
    ${kbd('tilt')} tip it: upright, on its side, upside down (it turns the way you look)<br>
    ${kbd('weather')} change the weather (creative) &nbsp; ${kbd('sound')} sound on / off<br>
    ${kbd('lantern')} lantern &nbsp; ${kbd('respawn')} respawn &nbsp; <kbd>Esc</kbd> pause · all keys can be changed under Keys…`;
  for (const el of document.querySelectorAll('#menu .controls')) el.innerHTML = html;
  $('inv-keys').innerHTML = `${kbd('inventory')} backpack · ${kbd('crafting')} crafting · <kbd>Esc</kbd> close`;
}
renderControls();

// Settings > Keys: click a key, then press the new one
let keysOpen = false, listening = null;   // listening: [action id, 0 or 1, button]
function renderKeys() {
  $('keys-list').innerHTML = ACTIONS.map((a) => `<span>${a.name}</span>` +
    [0, 1].map((i) => `<button class="small" data-a="${a.id}" data-i="${i}">${keyName(binds[a.id][i])}</button>`).join('')).join('');
}
function setKeysOpen(open) {
  keysOpen = open; listening = null;
  if (open) renderKeys(); else renderControls();
  updateOverlay();
}
for (const b of document.querySelectorAll('[data-open-keys]')) b.addEventListener('click', () => setKeysOpen(true));
$('btn-keys-done').addEventListener('click', () => setKeysOpen(false));
$('btn-keys-reset').addEventListener('click', () => { resetBinds(); renderKeys(); });
$('keys-list').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  renderKeys();
  listening = [b.dataset.a, +b.dataset.i];
  const now = $('keys-list').querySelector(`[data-a="${b.dataset.a}"][data-i="${b.dataset.i}"]`);
  now.classList.add('listening'); now.textContent = 'press a key…';
});
window.addEventListener('keydown', (e) => {
  if (!keysOpen || !listening) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const [id, i] = listening;
  if (e.code === 'Backspace') setBind(id, i, null);
  else if (e.code !== 'Escape' && !/^Digit[1-9]$/.test(e.code)) setBind(id, i, e.code);
  listening = null;
  renderKeys();
}, true);
$('quality-select').value = QUALITY;
$('seed-input').value = urlParams.get('seed') || '';

export function updateOverlay() {
  const hidden = gameState === 'playing' && (state.locked || inventoryOpen || state.testMode);
  menuEl.style.display = hidden ? 'none' : 'flex';
  $('title-panel').style.display = gameState === 'menu' && !keysOpen ? 'block' : 'none';
  $('pause-panel').style.display = gameState === 'playing' && !keysOpen ? 'block' : 'none';
  $('keys-panel').style.display = keysOpen ? 'block' : 'none';
  $('btn-continue').style.display = gameStarted ? 'block' : 'none';
  const ready = !!worldStats && !generating;
  for (const id of ['btn-continue', 'btn-survival', 'btn-creative', 'btn-newworld']) $(id).disabled = !ready;
  $('loading').style.display = ready ? 'none' : 'block';
  if (gameState === 'playing') $('pause-info').textContent = `${state.creative ? 'Creative' : 'Survival'} · world ${worldStats.seed}`;
  for (const id of ['hud', 'stats', 'hotbar']) $(id).style.visibility = gameState === 'playing' ? 'visible' : 'hidden';
  $('mode').style.visibility = gameState === 'playing' ? 'visible' : 'hidden';
}

function lockPointer() { renderer.domElement.requestPointerLock()?.catch?.(() => {}); }

// A fresh character: full health, empty inventory (a few supplies in survival), at the start.
export function startGame(mode) {
  if (sound.on) initSound();
  slots.fill(null); state.heldStack = null; state.selectedSlot = 0;
  Object.assign(stats, fullStats(), { armour: 0 });
  state.creative = mode === 'creative';
  document.getElementById('mode').style.display = state.creative ? 'block' : 'none';
  document.getElementById('stats').style.display = state.creative ? 'none' : 'flex';
  if (!state.creative) giveStarterKit();
  setInventoryTab(state.creative ? 'items' : 'bag');
  respawn();
  player.facing = state.yaw = state.spawnFacing; state.pitch = -0.25;
  gameStarted = true;
  enterGame();
  toast(state.creative ? 'Creative mode: fly with Space and Shift, every item is in the inventory (E)' : 'You have some food and water to start with. Press E for the inventory.');
}
function enterGame() {
  gameState = 'playing';
  updateOverlay();
  lockPointer();
}
export function toMainMenu() {
  gameState = 'menu';
  if (inventoryOpen) setInventoryOpen(false);
  document.exitPointerLock?.();
  updateOverlay();
}

$('btn-survival').addEventListener('click', () => startGame('survival'));
$('btn-creative').addEventListener('click', () => startGame('creative'));
$('btn-continue').addEventListener('click', () => { if (sound.on) initSound(); enterGame(); });
$('btn-resume').addEventListener('click', lockPointer);
$('btn-mainmenu').addEventListener('click', toMainMenu);
$('btn-random').addEventListener('click', () => { $('seed-input').value = Math.floor(Math.random() * 1e6); });
$('btn-newworld').addEventListener('click', () => {
  const seed = parseInt($('seed-input').value, 10) || Math.floor(Math.random() * 1e6);
  $('seed-input').value = seed;
  gameStarted = false;
  newWorld(seed);
});
$('seed-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-newworld').click(); });
$('quality-select').addEventListener('change', (e) => {
  // graphics quality sets texture and shadow sizes at start-up, so it reloads the page
  const url = new URL(location.href);
  if (e.target.value === 'low') url.searchParams.set('quality', 'low'); else url.searchParams.delete('quality');
  if (worldStats) url.searchParams.set('seed', worldStats.seed);
  location.href = url.toString();
});
$('sound-select').addEventListener('change', (e) => setSound(e.target.value === 'on'));
export function clampPitch() {
  state.pitch = state.thirdPerson ? THREE.MathUtils.clamp(state.pitch, -1.35, 0.6) : THREE.MathUtils.clamp(state.pitch, -1.55, 1.55);
}
