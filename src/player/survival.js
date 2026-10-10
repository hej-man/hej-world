import { state } from '../state.js';
import { terrainFns } from '../world/world.js';
import { player, respawn } from './character.js';
import { addItem, renderInventory } from '../inventory/inventory.js';
import { flashDamage, toast } from '../ui/hud.js';
import { gameState } from '../ui/menu.js';

// ---------------------------------------------------------------------------
// Health, hunger, thirst and mana
// ---------------------------------------------------------------------------

export const MAX_HEALTH = 150;
export const stats = { health: MAX_HEALTH, hunger: 100, thirst: 100, mana: 100, armour: 0, sick: 0 };
export const fullStats = () => ({ health: MAX_HEALTH, hunger: 100, thirst: 100, mana: 100, sick: 0 });
let regenTimer = 0, starveTimer = 0, thirstTimer = 0, burnTimer = 0, sickTimer = 0;

// Drinking unpurified water (straight from a lake or the sea, or a bottle of murky water) makes you
// sick for a while: thirst drains three times as fast and you lose health every couple of seconds.
// Each drink adds to how long it lasts, up to two minutes.
export function drankDirtyWater(seconds) {
  if (state.creative) return;
  stats.sick = Math.min(120, stats.sick + seconds);
  damagePlayer(3, 'got sick from dirty water');
}
export const BOLT_COST = 15;

export function damagePlayer(amount, reason) {
  if (state.creative || amount <= 0 || stats.health <= 0 || gameState !== 'playing') return;
  stats.health -= amount * (1 - stats.armour);
  flashDamage();
  if (stats.health <= 0) die(reason);
}

function die(reason) {
  state.burning = 0;
  toast(`You ${reason}. Back to the start, you keep your things.`);
  Object.assign(stats, fullStats());
  respawn();
}

// Starting supplies for a new survival game
export function giveStarterKit() {
  addItem('bread', 4); addItem('apple', 3); addItem('cooked_meat', 2); addItem('water_bottle', 3);
}

export function updateStats(dt) {
  if (state.creative) { Object.assign(stats, fullStats()); return; }
  // food: about 15 minutes from full to empty standing still; sprinting burns it 3x faster
  const drain = (player.sprinting ? 3 : 1) * (player.inWater ? 1.5 : 1) * 100 / 900;
  stats.hunger = Math.max(0, stats.hunger - drain * dt);
  // water: about 10 minutes; faster when sprinting or near a volcano's heat
  const heat = terrainFns.volcanoInfluence(player.position.x, player.position.z) > 0.3 ? 2 : 1;
  const sick = stats.sick > 0 ? 3 : 1;
  stats.thirst = Math.max(0, stats.thirst - (player.sprinting ? 2 : 1) * heat * sick * (100 / 600) * dt);
  if (stats.sick > 0) {
    stats.sick = Math.max(0, stats.sick - dt);
    sickTimer += dt;
    if (sickTimer > 2) { sickTimer = 0; damagePlayer(1, 'got sick from dirty water'); }
    if (stats.sick === 0) toast('You feel better');
  }
  stats.mana = Math.min(100, stats.mana + 3 * dt);
  if (stats.hunger <= 0) {
    starveTimer += dt;
    if (starveTimer > 1.5) { starveTimer = 0; damagePlayer(2, 'starved'); }
  }
  // fire: 24 health a second in lava, 6 a second while still burning after stepping out; water puts it out
  if (player.inWater && !player.inLava) state.burning = 0;
  if (state.burning > 0) {
    state.burning -= dt; burnTimer += dt;
    if (burnTimer > 0.25) { burnTimer = 0; damagePlayer(player.inLava ? 6 : 1.5, 'burned to death in the lava'); }
  }
  if (stats.thirst <= 0) {
    thirstTimer += dt;
    if (thirstTimer > 1.5) { thirstTimer = 0; damagePlayer(2, 'died of thirst'); }
  }
  if (stats.hunger > 45 && stats.thirst > 30 && !stats.sick && stats.health < MAX_HEALTH) {
    regenTimer += dt; // a well-fed, watered player heals slowly
    if (regenTimer > 0.6) { regenTimer = 0; stats.health = Math.min(MAX_HEALTH, stats.health + 1); stats.hunger -= 0.25; stats.thirst -= 0.15; }
  }
}

const statEls = { hp: document.querySelector('#hp i'), hpText: document.querySelector('#hp span'), food: document.querySelector('#food i'), water: document.querySelector('#water i'), waterBar: document.getElementById('water'), waterText: document.querySelector('#water span'), mana: document.querySelector('#mana i') };
export function renderStats() {
  statEls.hp.style.width = `${Math.max(0, stats.health) / MAX_HEALTH * 100}%`;
  statEls.hpText.textContent = `Health ${Math.max(0, Math.ceil(stats.health))}`;
  statEls.food.style.width = `${stats.hunger}%`;
  statEls.water.style.width = `${stats.thirst}%`;
  const sick = stats.sick > 0;
  if (statEls.waterBar.classList.contains('sick') !== sick) {
    statEls.waterBar.classList.toggle('sick', sick);
    statEls.waterText.textContent = sick ? 'Thirst · sick' : 'Thirst';
  }
  statEls.mana.style.width = `${stats.mana}%`;
}

export function setCreative(on) {
  state.creative = on;
  if (on) Object.assign(stats, fullStats());
  document.getElementById('stats').style.display = on ? 'none' : 'flex';
  document.getElementById('mode').style.display = on ? 'block' : 'none';
  if (!on) player.velocity.y = 0;
  toast(on ? 'Creative mode: fly with Space and Shift, instant breaking, all items in the inventory' : 'Survival mode');
  renderInventory();
}
