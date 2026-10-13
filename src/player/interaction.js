import * as THREE from 'three';
import { state } from '../state.js';
import { PLAYER, WORLD } from '../config.js';
import { scene } from '../render/scene.js';
import { CELL, cellKey, gridRemove, obstacleGrid, targetGrid, terrainFns, world } from '../world/world.js';
import { cellMaterial, editCell, editedMaterialAt, hitCell, raycastTerrain } from '../world/query.js';
import { solidCell } from '../terrain/voxels.js';
import { EYE_OFFSET, player } from './character.js';
import { aimRay } from './camera.js';
import { ITEMS, addItem, inventoryOpen, renderInventory, setInventoryOpen, slots } from '../inventory/inventory.js';
import { BLOCKS, blockKey, blocks, placeBlock, removeBlock, voxelRay } from '../world/blocks.js';
import { PLANT_KINDS, TREE_KINDS } from '../world/vegetation.js';
import { BOLT_COST, MAX_HEALTH, drankDirtyWater, stats } from './survival.js';
import { animals, hurtAnimal, spawnAnimal } from '../animals/animals.js';
import { fluidRay, floodFromNature, poolAmount, pourFluid, removeFluid, takeFluid, wakeArea } from '../world/fluids.js';
import { craterLavaAt, craterOf, lavaAt } from '../world/volcano.js';
import { takeCraterLava, takeFromNature } from '../world/hydro.js';
import { cameraUnderwater } from '../effects/underwater.js';
import { toast } from '../ui/hud.js';
import { collectStation } from '../inventory/items.js';
import { gameState } from '../ui/menu.js';

// ---------------------------------------------------------------------------
// Interaction: aim, break, attack, place, eat, cast
// ---------------------------------------------------------------------------
export const mouse = { left: false, right: false };

export let swingTime = 0, breakProgress = 0, breakKey = null, attackCd = 0, warnCd = 0;
export let aimWater = null;
const _underWater = { t: 0, point: new THREE.Vector3(), under: true };
const _aimO = new THREE.Vector3(), _aimD = new THREE.Vector3(), _eye = new THREE.Vector3(), _tv = new THREE.Vector3();

const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }),
);
outline.visible = false;
scene.add(outline);

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c;
  if (h < 0) return null;
  const sq = Math.sqrt(h);
  return -b - sq >= 0 ? -b - sq : -b + sq >= 0 ? 0 : null;
}

// The aim ray (into _aimO, _aimD) and the stretch of it within reach: in third person it starts
// level with the player rather than at the camera behind them. Returns t0 (t0 + reach is the end).
function aimRange() {
  aimRay(_aimO, _aimD);
  _eye.set(player.position.x, player.position.y + EYE_OFFSET, player.position.z);
  return Math.max(0, _tv.subVectors(_eye, _aimO).dot(_aimD));
}

// What's under the crosshair, within reach of the player: terrain, a block, a tree/bush/boulder, or an animal.
export function pickTarget() {
  const t0 = aimRange(), t1 = t0 + PLAYER.reach;
  let best = null;
  const th = raycastTerrain(_aimO, _aimD, t0, t1);
  if (th) best = { kind: 'terrain', t: th.distance, point: th.point.clone(), normal: th.face.normal.clone(), hit: th };
  const bh = voxelRay(_aimO, _aimD, t0, best ? best.t : t1);
  if (bh) best = { kind: 'block', t: bh.t, key: bh.key, cell: bh.cell, normal: new THREE.Vector3(...bh.normal), type: blocks.get(bh.key).type };
  const gx = Math.floor(player.position.x / CELL), gz = Math.floor(player.position.z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = targetGrid.get(cellKey(gx + i, gz + j));
    if (list) for (const tg of list) for (const [cx, cy, cz, r] of tg.spheres) {
      const t = raySphere(_aimO, _aimD, cx, cy, cz, r);
      if (t !== null && t >= t0 - r && t <= (best ? best.t : t1)) best = { kind: tg.kind, t, target: tg };
    }
  }
  for (const a of animals) {
    if (Math.abs(a.x - player.position.x) > PLAYER.reach + 3 || Math.abs(a.z - player.position.z) > PLAYER.reach + 3) continue;
    const t = raySphere(_aimO, _aimD, a.x, a.y + a.sp.h * 0.55, a.z, Math.max(0.35, a.sp.r));
    if (t !== null && t >= t0 - 1 && t <= (best ? best.t : t1)) best = { kind: 'animal', t, animal: a };
  }
  return best;
}

// Where the aim ray first meets a water surface (sea or a lake) from above, or null.
function waterRay(o, d, t0, t1) {
  if (d.y > -1e-3) return null;
  const T = terrainFns, levels = [WORLD.waterLevel + T.live.sea];
  for (const lk of T.lakes) if (Math.abs(lk.x - o.x) < lk.R * 2 + t1 && Math.abs(lk.z - o.z) < lk.R * 2 + t1) levels.push(lk.level + lk.offset);
  let best = null;
  for (const L of levels) {
    const t = (L - o.y) / d.y;
    if (t < t0 || t > t1 || (best && t > best.t)) continue;
    const x = o.x + d.x * t, z = o.z + d.z * t;
    if (Math.abs(T.waterAt(x, z) - L) > 0.01) continue;
    best = { t, point: new THREE.Vector3(x, L, z) };
  }
  return best;
}

function terrainMaterialAt(hit) {
  const [x, y, z] = hitCell(hit.point, hit.face.normal);
  const edited = editedMaterialAt(x + 0.5, y + 0.5, z + 0.5);
  if (edited) return edited;
  const ch = hit.object.userData.chunk;
  const g = ch.render.geometry, vi = g.index.getX(hit.faceIndex * 3);
  if (g.attributes.tinfo.getZ(vi) < -0.5) return 'crystal';
  // a slope is the ground it stands on
  return cellMaterial(x, solidCell(x, y, z) ? y : y - 1, z);
}

// What the natural ground can be made of: [how it breaks, what you get, name]. Anything not listed
// (granite, diorite and the other stones) breaks like stone and gives itself.
const GROUND = {
  dirt: ['dirt', 'dirt', 'Dirt'], sand: ['sand', 'sand', 'Sand'], stone: ['stone', 'stone', 'Stone'], crystal: ['crystal', 'crystal', 'Crystal'],
  iron: ['iron', 'iron_ore', 'Iron ore'], coal: ['stone', 'coal', 'Coal ore'], copper: ['stone', 'raw_copper', 'Copper ore'], gold: ['iron', 'raw_gold', 'Gold ore'],
  red_sand: ['sand', 'red_sand', 'Red sand'], gravel: ['sand', 'gravel', 'Gravel'], clay: ['dirt', 'clay', 'Clay'], snow: ['sand', 'snow_block', 'Snow'],
  podzol: ['dirt', 'podzol', 'Podzol'], mud: ['dirt', 'mud', 'Mud'], ice: ['ice', 'ice', 'Ice'],
  titanium: ['iron', 'raw_titanium', 'Titanium ore'],
};
const ground = (m) => GROUND[m] || ['stone', m, BLOCKS[m]?.name || m];

function materialOf(t) {
  switch (t.kind) {
    case 'tree': return 'wood';
    case 'plant': return PLANT_KINDS[t.target.plant].tool === 'pickaxe' ? 'ice' : 'plant';
    case 'rock': return 'stone';
    case 'block': return BLOCKS[t.type].mat;
    case 'terrain': return ground(t.material || (t.material = terrainMaterialAt(t.hit)))[0];
  }
  return 'soft';
}

const nice = (id) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
function targetName(t) {
  switch (t.kind) {
    case 'tree': return TREE_KINDS[t.target.species].name;
    case 'plant': return t.target.flower ? (ITEMS[t.target.flower]?.name || nice(t.target.flower)) : t.target.plant === 'mushrooms' ? (t.target.red ? 'Red mushroom' : 'Brown mushroom') : PLANT_KINDS[t.target.plant].name;
    case 'rock': return t.target.iron ? 'Iron-rich boulder' : 'Boulder';
    case 'block': { const b = blocks.get(t.key); return BLOCKS[t.type].name + (b?.plantedAt !== undefined ? ' (growing)' : ''); }
    case 'animal': return `${t.animal.sp.name}  ${Math.max(0, Math.ceil(t.animal.hp))}/${t.animal.sp.hp}`;
    case 'terrain': materialOf(t); return ground(t.material)[2];
  }
  return '';
}

// The pickaxe tier something needs: placed blocks say so; deepslate and blackstone in the ground
// need the same as their blocks.
function needTier(t) {
  if (t.kind === 'block') return BLOCKS[t.type].tier || 0;
  if (t.kind === 'terrain') { materialOf(t); return t.material === 'titanium' ? 3 : BLOCKS[t.material]?.tier || 0; }
  return 0;
}

// Seconds to break something with the item in hand (Infinity = can't). `need` is the pickaxe tier
// some blocks need (obsidian, deepslate).
export function breakTime(mat, def, need = 0) {
  if (state.creative) return 0.12;
  const tool = def?.tool, tier = def?.tier || 0, speed = def?.speed ?? [1, 1, 1.6, 2.6][tier];
  if (need > 1 && !(tool === 'pickaxe' && tier >= need)) return Infinity;
  switch (mat) {
    case 'wood': return tool === 'axe' ? 1.1 / speed : 2.6;
    case 'plant': return 0.35;
    case 'soft': return 0.5;
    case 'glass': return 0.4;
    case 'dirt': case 'sand': return tool === 'shovel' ? 0.4 / speed : 0.9;
    case 'ice': return tool === 'pickaxe' ? 0.6 / speed : 1.6;
    case 'stone': case 'crystal': return tool === 'pickaxe' ? 1.4 * (need === 3 ? 4 : 1) / speed : Infinity;
    case 'iron': case 'metal': return tool === 'pickaxe' && tier >= 2 ? 2 / speed : Infinity;
  }
  return 1;
}

// Adds [[id, count], ...] to the inventory and shows what you got.
export function give(list) {
  if (state.creative) return;
  const got = [];
  let lost = 0;
  for (const [id, n] of list) {
    if (n <= 0) continue;
    const left = addItem(id, n);
    lost += left;
    if (n - left > 0) got.push(`+${n - left} ${ITEMS[id].name}`);
  }
  if (got.length || lost) toast(got.join('  ') + (lost ? '  (inventory full)' : ''));
}

const _hide = new THREE.Matrix4().makeScale(0, 0, 0);
function harvest(tg) {
  for (const [mesh, i] of tg.parts) { mesh.setMatrixAt(i, _hide); mesh.instanceMatrix.needsUpdate = true; }
  if (tg.obstacle) gridRemove(obstacleGrid, tg.obstacle);
  gridRemove(targetGrid, tg);
  const r = Math.random, between = (a, b) => a + Math.floor(r() * (b - a + 1));
  if (tg.kind === 'tree') {
    const kind = TREE_KINDS[tg.species], wood = kind.wood, [fruit, chance] = kind.fruit || [];
    give([
      [wood === 'oak' ? 'log' : `${wood}_log`, Math.round((2 + tg.scale * 2) * (kind.big ? 2 : 1))],
      ['stick', between(1, 2) + (tg.species === 'pine' ? 1 : 0)],
      [`${wood}_sapling`, r() < 0.55 ? between(1, 2) : 0],
      [`${wood}_leaves`, r() < 0.4 ? between(1, 3) : 0],
      [fruit, fruit && r() < chance ? between(1, 2) : 0],
    ]);
  } else if (tg.kind === 'plant') {
    if (tg.flower) give([[tg.flower, between(1, 2)]]);
    else if (tg.plant === 'mushrooms') give([[tg.red ? 'red_mushroom' : 'brown_mushroom', between(1, 2)]]);
    else give(PLANT_KINDS[tg.plant].drops.map(([id, a, b]) => [id, between(a, b)]));
  } else if (tg.kind === 'rock') {
    give(tg.iron ? [['stone', 1 + Math.round(tg.s)], ['iron_ore', 1 + Math.round(tg.s * 1.5)]] : [['stone', 2 + Math.round(tg.s * 2)]]);
  }
}

export function doBreak(t) {
  if (t.kind === 'tree' || t.kind === 'plant' || t.kind === 'rock') { harvest(t.target); return; }
  if (t.kind === 'block') { const b = removeBlock(t.key); if (b) { give([[b.type, 1]]); wakeArea(b.x, b.y, b.z, 1); } return; }
  if (t.kind === 'terrain') {
    materialOf(t);
    const mat = t.material;
    const [cx, cy, cz] = hitCell(t.point, t.normal);
    if (!editCell(cx, cy, cz)) return;
    // water and lava nearby can now flow into the hole, and the sea or a lake right next to it does
    wakeArea(cx + 0.5, cy + 0.5, cz + 0.5, 2);
    floodFromNature(cx + 0.5, cy + 0.5, cz + 0.5, 1.5);
    // plants standing on the removed block come down with it
    for (const tg of [...(targetGrid.get(cellKey(Math.floor(cx / CELL), Math.floor(cz / CELL))) || [])]) {
      if (Math.floor(tg.x) === cx && Math.floor(tg.z) === cz && tg.y > cy - 0.1 && tg.y < cy + 2.2) harvest(tg);
    }
    const drop = ground(mat)[1], ore = ['iron', 'coal', 'copper', 'gold', 'titanium'].includes(mat);
    give(mat === 'crystal' ? [['crystal', 1 + Math.floor(Math.random() * 2)]] : ore ? [[drop, mat === 'coal' ? 1 + Math.floor(Math.random() * 2) : 1], ['stone', Math.random() < 0.5 ? 1 : 0]] : [[drop, 1]]);
  }
}

// Where a block would go: the empty cell in front of the face you're looking at.
function placementCell(t) {
  if (!t || (t.kind !== 'terrain' && t.kind !== 'block')) return null;
  if (t.kind === 'block') return [t.cell[0] + t.normal.x, t.cell[1] + t.normal.y, t.cell[2] + t.normal.z];
  // a block put on a slope takes the slope's place
  const [x, y, z] = hitCell(t.point, t.normal);
  if (!solidCell(x, y, z)) return [x, y, z];
  return [Math.floor(t.point.x + t.normal.x * 0.5), Math.floor(t.point.y + t.normal.y * 0.5), Math.floor(t.point.z + t.normal.z * 0.5)];
}

const _bmin = new THREE.Vector3(), _bmax = new THREE.Vector3(), _sg = new THREE.Line3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
function cellFree([x, y, z]) {
  if (x < 1 || z < 1 || y < 1 || x > WORLD.size - 2 || z > WORLD.size - 2 || y > WORLD.height - 2) return false;
  if (blocks.has(blockKey(x, y, z))) return false;
  // not inside the player
  _bmin.set(x, y, z); _bmax.set(x + 1, y + 1, z + 1);
  _sg.start.copy(player.position); _sg.end.copy(player.position); _sg.end.y -= PLAYER.segment;
  _p2.copy(_sg.start).clamp(_bmin, _bmax);
  for (let k = 0; k < 3; k++) { _sg.closestPointToPoint(_p2, true, _p1); _p2.copy(_p1).clamp(_bmin, _bmax); }
  _sg.closestPointToPoint(_p2, true, _p1);
  if (_p1.distanceTo(_p2) < PLAYER.radius - 0.02) return false;
  // not inside an animal
  return !animals.some((a) => a.x + a.sp.r * 0.6 > x && a.x - a.sp.r * 0.6 < x + 1 && a.z + a.sp.r * 0.6 > z && a.z - a.sp.r * 0.6 < z + 1 && a.y < y + 1 && a.y + a.sp.h > y);
}

function consumeSelected() {
  if (state.creative) return;
  const s = slots[state.selectedSlot];
  if (!s) return;
  if (!--s.count) slots[state.selectedSlot] = null;
  renderInventory();
}

// Right click on water: fill an empty bottle, or drink a few sips
export function useWater() {
  const s = slots[state.selectedSlot];
  if (s?.id === 'bottle') {
    if (aimWater) takeFromNature(aimWater.point.x, aimWater.point.z, 0.25);
    consumeSelected();
    give([['murky_water', 1]]);
    state.useCd = 0.4;
    return;
  }
  if (stats.thirst > 99 && !state.creative) { toast("You're not thirsty"); return; }
  stats.thirst = Math.min(100, stats.thirst + 15);
  drankDirtyWater(15);
  toast('Drank unpurified water. You feel sick (purify it at a water filter, or boil it at a campfire)');
  state.useCd = 0.6;
}

// Does a right click on water drink it? Only with nothing in hand that has a use of its own (a block
// to place, a bucket, food...) and nothing you can use in front of you (a workbench, a furnace...).
const hasUse = (def) => !!(def && (def.place || def.bucket || def.fluid || def.spawn || def.food || def.drink || def.heal || def.mana || def.armour || def.wand));
const usable = (t) => t?.kind === 'block' && !!BLOCKS[t.type].station;
function drinksWater(t, def) { return !hasUse(def) && !usable(t) && def?.id !== 'bottle'; }

// Right click
export function useItem(t) {
  const s = slots[state.selectedSlot], def = s && ITEMS[s.id];
  // water in front of whatever you're aiming at: drink or fill a bottle, unless you're building
  // an empty bottle fills from poured water too (a quarter of a bucket)
  if (s?.id === 'bottle' && !aimWater) {
    const t0 = aimRange(), f = fluidRay(_aimO, _aimD, t0, t0 + PLAYER.reach);
    if (f?.type === 'water' && (!t || f.t < t.t + 0.3)) {
      if (!f.nat && poolAmount(f.cell) < 0.15) { toast('Too little water here to fill the bottle'); return; }
      if (f.nat) takeFromNature(f.x + 0.5, f.z + 0.5, 0.25); else takeFluid(f.cell, 0.25);
      useWater(); return;
    }
  }
  if (aimWater && drinksWater(t, def)) { useWater(); return; }
  if (t?.kind === 'block' && BLOCKS[t.type].station && !(def && def.place)) {
    // take anything the station finished, then open the crafting page
    const b = blocks.get(t.key);
    if (b?.ready?.length && collectStation(b)) { state.useCd = 0.4; return; }
    setInventoryOpen(true); return;
  }
  if (!def) return;
  if (def.place) {
    const cell = placementCell(t);
    if (!cell || !cellFree(cell)) return;
    if (placeBlock(def.place, ...cell, state.buildShape, state.buildTilt)) {
      consumeSelected();
      // a block put into a pool pushes its water up out of the way
      const gone = removeFluid(...cell);
      if (gone) pourFluid(gone.type, cell[0], cell[1] + 1, cell[2], gone.m);
      wakeArea(cell[0], cell[1], cell[2], 1);
    }
  } else if (def.bucket) {
    // scoop up poured fluid (a bucketful out of its pool), the river or a lake (which go down a
    // little), or lava from a crater (which sinks, then fills back up) or a flow
    const t0 = aimRange(), f = fluidRay(_aimO, _aimD, t0, t0 + PLAYER.reach);
    let got = null;
    if (f && (!t || f.t < t.t + 0.3)) {
      if (f.nat) takeFromNature(f.x + 0.5, f.z + 0.5);
      else if (poolAmount(f.cell) < 0.6) { toast(`Too little ${f.type} here to fill the bucket`); return; }
      else takeFluid(f.cell, 1);
      got = f.type;
    } else if (aimWater) { got = 'water'; takeFromNature(aimWater.point.x, aimWater.point.z); }
    else if (t?.kind === 'terrain' && (lavaAt(t.point.x, t.point.y - 0.2, t.point.z, 0.3) || t.point.y < craterLavaAt(t.point.x, t.point.z) + 1)) {
      got = 'lava';
      const v = craterOf(t.point.x, t.point.z);
      if (v && t.point.y < v.lavaY + 1) takeCraterLava(v);
    }
    if (!got) { toast('Aim at water or lava to fill the bucket'); return; }
    consumeSelected(); addItem(`${got}_bucket`, 1); renderInventory();
    toast(`Filled the bucket with ${got}`); state.useCd = 0.4;
  } else if (def.fluid) {
    const cell = placementCell(t);
    if (!cell || blocks.has(blockKey(...cell)) || !pourFluid(def.fluid, ...cell)) return;
    consumeSelected(); if (!state.creative) addItem('bucket', 1); renderInventory();
    state.useCd = 0.4;
  } else if (def.spawn) {
    if (!t || (t.kind !== 'terrain' && t.kind !== 'block')) { toast('Aim at the ground to spawn it'); return; }
    const p = t.kind === 'terrain' ? t.point : new THREE.Vector3(t.cell[0] + 0.5, t.cell[1] + 1, t.cell[2] + 0.5);
    spawnAnimal(def.spawn, p.x, p.y, p.z, Math.random);
    consumeSelected();
    state.useCd = 0.3;
  } else if (def.food) {
    if (stats.hunger > 99 && !state.creative) { toast("You're not hungry"); return; }
    stats.hunger = Math.min(100, stats.hunger + def.food);
    if (def.drink) stats.thirst = Math.min(100, stats.thirst + def.drink);
    if (def.heal) stats.health = Math.min(MAX_HEALTH, stats.health + def.heal);
    consumeSelected();
    if (def.leaves && !state.creative) addItem(def.leaves, 1);
    toast(`Ate ${def.name.toLowerCase()}`);
    state.useCd = 0.5;
  } else if (def.drink) {
    if (stats.thirst > 99 && !state.creative) { toast("You're not thirsty"); return; }
    stats.thirst = Math.min(100, stats.thirst + def.drink);
    consumeSelected();
    if (def.leaves && !state.creative) addItem(def.leaves, 1);
    if (def.dirty) drankDirtyWater(30);
    toast(def.dirty ? `Drank ${def.name.toLowerCase()}. You feel sick` : `Drank ${def.name.toLowerCase()}`);
    state.useCd = 0.5;
  } else if (def.heal) {
    if (stats.health >= MAX_HEALTH) { toast('Health is already full'); return; }
    stats.health = Math.min(MAX_HEALTH, stats.health + def.heal);
    consumeSelected();
    state.useCd = 0.5;
  } else if (def.mana) {
    if (stats.mana >= 100) { toast('Mana is already full'); return; }
    stats.mana = Math.min(100, stats.mana + def.mana);
    consumeSelected();
    state.useCd = 0.5;
  } else if (def.wand) {
    castBolt();
  } else if (def.armour) {
    if (stats.armour >= def.armour) { toast('Already wearing armour'); return; }
    stats.armour = def.armour; stats.armourLook = def.look;
    consumeSelected();
    toast(`Wearing ${def.name.toLowerCase()}`);
  }
}

// Wand bolts
export const bolts = [];
const boltGeo = new THREE.IcosahedronGeometry(0.16, 0);
const boltMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
const _bd = new THREE.Vector3();
function castBolt() {
  if (stats.mana < BOLT_COST && !state.creative) { toast('Not enough mana'); return; }
  if (!state.creative) stats.mana -= BOLT_COST;
  aimRay(_tv, _bd);
  const m = new THREE.Mesh(boltGeo, boltMat);
  m.position.set(player.position.x, player.position.y + EYE_OFFSET - 0.25, player.position.z).addScaledVector(_bd, 0.7);
  world.add(m);
  bolts.push({ mesh: m, vel: _bd.clone().multiplyScalar(30), life: 1.5 });
  state.useCd = 0.35;
}

export function updateBolts(dt) {
  for (const b of [...bolts]) {
    b.life -= dt;
    const step = b.vel.length() * dt;
    _bd.copy(b.vel).normalize();
    let done = b.life <= 0 || !!raycastTerrain(b.mesh.position, _bd, 0, step);
    if (!done) {
      b.mesh.position.addScaledVector(b.vel, dt);
      const p = b.mesh.position;
      if (blocks.has(blockKey(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)))) done = true;
      for (const a of animals) {
        if (Math.hypot(p.x - a.x, p.y - (a.y + a.sp.h * 0.55), p.z - a.z) < a.sp.r + 0.35) { hurtAnimal(a, 10, b.vel.x, b.vel.z); done = true; break; }
      }
      b.mesh.rotation.x += dt * 10; b.mesh.rotation.y += dt * 7;
    }
    if (done) { world.remove(b.mesh); bolts.splice(bolts.indexOf(b), 1); }
  }
}

const targetEl = document.getElementById('target');
const breakbarEl = document.getElementById('breakbar');
const breakFillEl = breakbarEl.firstElementChild;

function targetId(t) {
  if (!t) return null;
  if (t.kind === 'terrain') return `g${Math.floor(t.point.x / 2)},${Math.floor(t.point.y / 2)},${Math.floor(t.point.z / 2)}`;
  if (t.kind === 'block') return t.key;
  return t.target || t.animal;
}

export function updateInteraction(dt) {
  swingTime = Math.max(0, swingTime - dt);
  attackCd -= dt; state.useCd -= dt; warnCd -= dt;
  const active = (state.locked || state.testMode) && !inventoryOpen && gameState === 'playing';
  state.currentTarget = active ? pickTarget() : null;
  const t = state.currentTarget;
  // water between you and what you're aiming at (only from above the surface)
  aimWater = null;
  if (active && !cameraUnderwater) {
    const t0 = aimRange();
    aimWater = waterRay(_aimO, _aimD, t0, t ? Math.min(t.t, t0 + PLAYER.reach) : t0 + PLAYER.reach);
  } else if (active && terrainFns.waterAt(_aimO.x, _aimO.z) > _aimO.y) {
    // under the river, the sea or a lake the water is all around you: a bottle or bucket fills from
    // it, and you can drink it, but anything you aim at (a block to build on, a chest) comes first
    _underWater.point.copy(_aimO);
    aimWater = _underWater;
  }
  const held = slots[state.selectedSlot], def = held && ITEMS[held.id];

  // outline: where a held block would go, otherwise the block you're looking at
  const placeCell = def?.place ? placementCell(t) : null;
  if (placeCell && cellFree(placeCell)) {
    outline.position.set(placeCell[0] + 0.5, placeCell[1] + 0.5, placeCell[2] + 0.5);
    outline.material.color.set(0xffffff); outline.visible = true;
  } else if (t?.kind === 'block') {
    outline.position.set(t.cell[0] + 0.5, t.cell[1] + 0.5, t.cell[2] + 0.5);
    outline.material.color.set(0x000000); outline.visible = true;
  } else outline.visible = false;
  const waterNote = !aimWater ? null : held?.id === 'bottle' ? 'Water: right click to fill the bottle'
    : drinksWater(t, def) ? 'Water: right click to drink (unpurified, makes you sick)' : null;
  targetEl.textContent = (aimWater?.under || !waterNote) && t ? targetName(t) : waterNote || '';

  if (active && mouse.left) {
    if (t?.kind === 'animal') {
      breakProgress = 0;
      if (attackCd <= 0) {
        attackCd = 0.45; swingTime = 0.25;
        hurtAnimal(t.animal, def?.damage ?? 2, t.animal.x - player.position.x, t.animal.z - player.position.z);
      }
    } else if (t) {
      const id = targetId(t);
      if (id !== breakKey) { breakKey = id; breakProgress = 0; }
      const need = needTier(t), time = breakTime(materialOf(t), def, need);
      if (!isFinite(time)) {
        if (warnCd <= 0) {
          const m = materialOf(t), name = targetName(t);
          toast(def?.tool === 'pickaxe' || m === 'iron' || m === 'metal' ? `${name} needs a ${need >= 3 ? 'iron' : 'stone or better'} pickaxe` : `You need a pickaxe to break ${name.toLowerCase()}`);
          warnCd = 2.5;
        }
        breakProgress = 0;
      } else {
        breakProgress += dt / time;
        if (breakProgress >= 1) { doBreak(t); breakProgress = 0; breakKey = null; }
      }
    } else { breakProgress = 0; breakKey = null; }
  } else { breakProgress = 0; breakKey = null; }

  if (active && mouse.right && state.useCd <= 0) { state.useCd = 0.25; swingTime = 0.2; useItem(t); }

  breakbarEl.style.display = breakProgress > 0 ? 'block' : 'none';
  breakFillEl.style.width = `${Math.min(1, breakProgress) * 100}%`;
}
