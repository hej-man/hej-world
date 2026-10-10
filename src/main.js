import * as THREE from 'three';
import { state } from './state.js';
import { PLAYER, QUALITY, WORLD, urlParams } from './config.js';
import { lerp } from './noise.js';
import { texInfo } from './terrain/textures.js';
import { terrainUniforms } from './terrain/material.js';
import { VEG_FAR, VEG_NEAR, VIEW_DIST, camera, csm, prepareLighting, renderer, scene, skyDome } from './render/scene.js';
import { chunkWidth, chunks, generateWorld, isLoaded, loadAll, loadArea, streamChunks, targetGrid, terrainFns, terrainProgress } from './world/world.js';
import { waterUniforms } from './world/water.js';
import { editTerrain, groundAt } from './world/query.js';
import { lavaAt, lavaFlows, updateVolcanoes } from './world/volcano.js';
import { VEG_TILE, clouds, vegStats, vegTiles } from './world/vegetation.js';
import { grassPatches, updateGrass } from './world/grass.js';
import { FOOT_OFFSET, character, findSpawn, player, respawn } from './player/character.js';
import { contact, updatePlayer } from './player/physics.js';
import { viewModel } from './player/animation.js';
import { ITEMS, addItem, countItem, getSelectedItem, inventoryOpen, registerItem, removeItem, selectSlot, setInventoryOpen, slots } from './inventory/inventory.js';
import { RECIPES, craft, defineItems } from './inventory/items.js';
import { blockGroups, blocks, placeBlock, updateCampfires } from './world/blocks.js';
import { addSource, fluidAt, fluids, updateFluids } from './world/fluids.js';
import { MAX_HEALTH, damagePlayer, renderStats, setCreative, stats, updateStats } from './player/survival.js';
import { animals, spawnAnimal, spawnAnimals, updateAnimals } from './animals/animals.js';
import { aimWater, breakTime, doBreak, mouse, pickTarget, updateBolts, updateInteraction, useItem, useWater } from './player/interaction.js';
import { cameraUnderwater, updateUnderwater } from './effects/underwater.js';
import { WEATHER, cycleWeather, nextWeather, setWeather, updateWeather, weather } from './effects/weather.js';
import { crosshair, hud } from './ui/hud.js';
import { $, clampPitch, gameState, startGame, toMainMenu, updateOverlay } from './ui/menu.js';
import { keys, setView } from './ui/input.js';
import { updateCamera } from './player/camera.js';
import './terrain/generate.js';
import './terrain/mesh.js';
import './world/plant-looks.js';
import './effects/sound.js';

defineItems();

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
export let worldStats = null, generating = false;
// Generating takes a few seconds and blocks the page, so show the message first and start a frame later.
export function newWorld(seed) {
  generating = true;
  updateOverlay();
  setTimeout(() => {
    worldStats = generateWorld(seed);
    state.spawnFacing = findSpawn();
    player.facing = state.yaw = state.spawnFacing;
    respawn();
    setWeather('clear', true);
    const url = new URL(location.href);
    url.searchParams.set('seed', seed);
    history.replaceState(null, '', url);
    $('seed-input').value = seed;
    generating = false;
    updateOverlay();
  }, 40);
}

// Title screen: the camera slowly circles the starting point, high enough to clear the hills.
let menuCamY = null;
function updateMenuCamera(dt) {
  const c = player.spawn, a = state.gameTime * 0.035, r = 75;
  const x = THREE.MathUtils.clamp(c.x + Math.cos(a) * r, 5, WORLD.size - 5), z = THREE.MathUtils.clamp(c.z + Math.sin(a) * r, 5, WORLD.size - 5);
  let ground = 0;
  for (let k = 0; k <= 4; k++) ground = Math.max(ground, terrainFns.surfaceHeight(lerp(x, c.x, k / 6), lerp(z, c.z, k / 6)));
  const want = Math.max(c.y + 28, ground + 16);
  menuCamY = menuCamY === null ? want : menuCamY + (want - menuCamY) * Math.min(1, dt * 0.8);
  camera.position.set(x, menuCamY, z);
  camera.lookAt(c.x, c.y + 4, c.z);
}

const initialSeed = Number(urlParams.get('seed')) || Math.floor(Math.random() * 1e6);


const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, fps = 0, litCheck = 0;
// Skips what's too far away to see through the fog: terrain chunks, vegetation tiles (simpler
// shapes in the middle distance) and animals.
function updateCulling() {
  const cx = camera.position.x, cz = camera.position.z, w = chunkWidth();
  const away = (x, z, half) => Math.hypot(Math.max(0, Math.abs(cx - x) - half), Math.max(0, Math.abs(cz - z) - half));
  for (const ch of chunks) if (ch.render) ch.render.visible = away((ch.i + 0.5) * w, (ch.j + 0.5) * w, w / 2) < VIEW_DIST;
  for (const t of vegTiles) {
    const d = away(t.cx, t.cz, VEG_TILE / 2);
    t.near.visible = d < VEG_NEAR;
    t.far.visible = d >= VEG_NEAR && d < VEG_FAR;
  }
  for (const a of animals) a.group.visible = Math.hypot(a.x - cx, a.z - cz) < 220;
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (generating || !worldStats) return;
  // paused: in a game with the menu showing (not in the inventory, which keeps the world going)
  const paused = gameState === 'playing' && !state.locked && !inventoryOpen && !state.testMode;
  if (paused) { renderer.render(scene, camera); return; }
  state.gameTime += dt;
  // generate more terrain, nearest the camera first; the ground under the player can't wait
  const px = player.position.x, pz = player.position.z;
  if (gameState === 'playing' && !isLoaded(px, pz, 12)) loadArea(px, pz, 40);
  streamChunks(camera.position.x, camera.position.z, gameState === 'playing' ? 5 : 12);
  if (gameState === 'playing') {
    updatePlayer(dt);
    updateCamera(dt);
    updateInteraction(dt);
    updateStats(dt);
    renderStats();
  } else {
    updateMenuCamera(dt);
  }
  updateAnimals(dt);
  updateBolts(dt);
  updateUnderwater();
  updateWeather(dt);
  viewModel.update(dt);
  updateGrass(camera.position.x, camera.position.z, gameState === 'playing' ? 2 : 1);
  updateCampfires(state.gameTime);
  updateVolcanoes(dt, state.gameTime);
  updateFluids(dt, state.gameTime);
  terrainUniforms.uTime.value = state.gameTime;
  waterUniforms.uTime.value = state.gameTime;
  crosshair.style.display = (state.locked || state.testMode) && !inventoryOpen && state.view !== 'front' ? 'block' : 'none';
  if (clouds) clouds.position.x = (clouds.position.x + dt * 1.2) % (WORLD.size * 0.5);

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
  const feet = player.position.y - FOOT_OFFSET;
  const underground = feet < terrainFns.surfaceHeight(player.position.x, player.position.z) - 4;
  const terrain = terrainProgress();
  const motion = state.creative ? 'flying' : player.inLava ? 'IN LAVA' : player.onGround ? 'grounded' : contact.steep ? 'sliding' : player.inWater ? 'in water' : 'airborne';
  hud.textContent =
    `${{ first: 'First person', back: 'Third person', front: 'Front view' }[state.view]}  ·  ${state.creative ? 'Creative' : 'Survival'}  ·  ${fps} fps  ·  seed ${worldStats.seed}  ·  map ${WORLD.size} m  ·  ${WEATHER[weather.state].name}\n` +
    `pos ${player.position.x.toFixed(1)}, ${feet.toFixed(1)}, ${player.position.z.toFixed(1)}  ·  ${motion}${underground ? '  ·  in a cave' : ''}` +
    `${stats.armour ? `  ·  armour ${Math.round(stats.armour * 100)}%` : ''}  ·  ${animals.length} animals` +
    (terrain.meshed < terrain.total ? `  ·  terrain ${Math.round((terrain.meshed / terrain.total) * 100)}%` : '');

  if (++litCheck % 30 === 0) prepareLighting(scene); // new animals, blocks, campfires
  if (litCheck % 8 === 0) updateCulling();
  skyDome.position.copy(camera.position);
  camera.updateMatrixWorld();
  csm.update();
  renderer.render(scene, camera);
}

// let the loading text paint before the (synchronous) generation runs
requestAnimationFrame(() => setTimeout(() => {
  newWorld(initialSeed);
  // Public hooks, for adding items later and for testing
  window.game = { registerItem, addItem, removeItem, countItem, getSelectedItem, slots, ITEMS, WORLD, PLAYER };
  window.__game = {
    player, keys, contact, worldStats: () => worldStats, terrain: () => terrainFns, groundAt,
    setView: (v) => setView(v === true ? 'back' : v === false ? 'first' : v), setLook: (y, p) => { state.yaw = y; state.pitch = p; clampPitch(); },
    setInventoryOpen, selectSlot, setCamDistance: (i) => { state.camDistIndex = i; },
    mouse, stats, animals, blocks, chunks: () => chunks, editTerrain, pickTarget, doBreak, useItem, placeBlock, craft, RECIPES,
    setCreative, isCreative: () => state.creative, setTestMode: (on) => { state.testMode = on; }, target: () => state.currentTarget,
    spawnAnimal: (kind, x, z) => { const g = groundAt(x, z); return g && spawnAnimal(kind, x, g.point.y, z, Math.random); },
    underwater: () => cameraUnderwater, time: () => state.gameTime, damagePlayer, targets: () => [...targetGrid.values()].flat(),
    renderer, scene, camera, csm, texInfo, QUALITY,
    startGame, toMainMenu, state: () => gameState, ready: () => !!worldStats && !generating, weather, setWeather, nextWeather, cycleWeather, WEATHER, updateWeather,
    aimWater: () => aimWater, useWater, grassPatches, MAX_HEALTH, updateGrass,
    loadAll: () => { loadAll(); spawnAnimals(worldStats.seed); }, terrainProgress, vegStats,
    lavaFlows, lavaAt, burning: () => state.burning, setShape: (sh) => { state.buildShape = sh; }, blockGroups, character, breakTime,
    fluids, addSource, fluidAt,
  };
  frame();
}, 30));
