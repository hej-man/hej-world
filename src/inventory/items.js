import { state } from '../state.js';
import { FOOT_OFFSET, player } from '../player/character.js';
import { ITEMS, addItem, countItem, fillSlotEl, inventoryOpen, registerItem, removeItem, renderInventory, showTooltip, slots, tooltipEl } from './inventory.js';
import { BLOCKS, blocks } from '../world/blocks.js';
import { SPECIES } from '../animals/animals.js';
import { BOLT_COST } from '../player/survival.js';
import { toast } from '../ui/hud.js';
import { TAGS, defineCatalogItems } from './catalog-items.js';
import { FORGE, HAMMER, defineMetalwork } from './metalwork.js';
import { PIECE_NAMES, defineArmour } from './armour.js';

// ---------------------------------------------------------------------------
// Items and recipes
// ---------------------------------------------------------------------------
export function defineItems() {
  // look: an emoji, or a CSS background for a swatch; blocks are drawn as little cubes instead
  const reg = (id, name, look, extra = {}) =>
    registerItem({ id, name, ...(look == null ? {} : look.length > 3 ? { color: look } : { icon: look }), ...extra });
  reg('stick', 'Stick', null, { draw: 'stick' });
  for (const id of ['stone', 'dirt', 'sand', 'stone_bricks', 'smooth_stone', 'glass']) reg(id, BLOCKS[id].name, null, { place: id, block: true });
  reg('crystal', 'Crystal', null, { draw: 'gem:crystal' });
  reg('workbench', 'Workbench', '🛠️', { place: 'workbench' });
  reg('furnace', 'Furnace', '🧱', { place: 'furnace' });
  reg('iron_ore', 'Iron ore', null, { draw: 'ore:iron', place: 'iron_ore', cat: 'materials' });
  reg('iron_ingot', 'Iron ingot', null, { draw: 'ingot:iron' });
  reg('campfire', 'Campfire', '🔥', { place: 'campfire' });
  reg('apple', 'Apple', '🍎', { food: 15, drink: 6 });
  reg('berries', 'Berries', '🫐', { food: 8, drink: 4 });
  reg('raw_meat', 'Raw meat', '🥩', { food: 10 });
  reg('cooked_meat', 'Cooked meat', '🍖', { food: 35, heal: 10 });
  reg('bread', 'Trail bread', '🍞', { food: 25 });
  reg('bottle', 'Empty bottle', '🫙', {});
  reg('water_bottle', 'Clean water', '💧', { drink: 40, leaves: 'bottle' });
  reg('murky_water', 'Murky water', '🫗', { drink: 30, leaves: 'bottle', dirty: true });
  reg('purifier', 'Water filter', '⚗️', { place: 'purifier' });
  reg('basket', 'Wicker basket', '🧺', { place: 'basket' });
  reg('chest', 'Chest', '🧰', { place: 'chest' });
  reg('crate', 'Large crate', '📦', { place: 'crate' });
  reg('silk', 'Spider silk', '🕸️');
  reg('feather', 'Feather', '🪶');
  reg('leather', 'Leather', null, { draw: 'leather' });
  for (const [mat, Mat, tier, badge] of [['wood', 'Wooden', 1, '#c08a4c'], ['stone', 'Stone', 2, '#9a9893'], ['iron', 'Iron', 3, '#e4e6ea']]) {
    reg(`${mat}_pickaxe`, `${Mat} pickaxe`, null, { draw: `tool:pickaxe:${mat}`, tool: 'pickaxe', tier, badge, maxStack: 1, damage: 2 + tier });
    reg(`${mat}_axe`, `${Mat} axe`, null, { draw: `tool:axe:${mat}`, tool: 'axe', tier, badge, maxStack: 1, damage: 3 + tier });
    reg(`${mat}_shovel`, `${Mat} shovel`, null, { draw: `tool:shovel:${mat}`, tool: 'shovel', tier, badge, maxStack: 1, damage: 2 + tier });
    reg(`${mat}_sword`, `${Mat} sword`, null, { draw: `tool:sword:${mat}`, tool: 'sword', tier, badge, maxStack: 1, damage: 4 + tier * 2 });
  }
  reg('bucket', 'Bucket', '🪣', { bucket: true, maxStack: 1 });
  reg('water_bucket', 'Water bucket', '🌊', { fluid: 'water', maxStack: 1 });
  reg('lava_bucket', 'Lava bucket', '🌋', { fluid: 'lava', maxStack: 1 });
  // spawners only come from the creative item list
  const ANIMAL_ICONS = { cow: '🐄', pig: '🐖', sheep: '🐑', chicken: '🐔', deer: '🦌', rabbit: '🐇', wolf: '🐺', bear: '🐻', boar: '🐗', spider: '🕷️',
    camel: '🐫', zebra: '🦓', goat: '🐐', fox: '🦊', parrot: '🦜', polar_bear: '🐻‍❄️', jaguar: '🐆', scorpion: '🦂' };
  for (const [kind, sp] of Object.entries(SPECIES)) reg(`spawn_${kind}`, `${sp.name} spawner`, ANIMAL_ICONS[kind] || '🥚', { spawn: kind, draw: `egg:${kind}` });
  reg('crystal_wand', 'Crystal wand', '🪄', { wand: true, maxStack: 1 });
  reg('mana_tonic', 'Mana tonic', '🧪', { mana: 50 });
  reg('bandage', 'Bandage', '🩹', { heal: 30 });
  // what the night monsters drop, and the magic made from it
  reg('fire_starter', 'Fire starter', '🎇', { ignite: true, hint: 'Right click on a tree or a wooden block to set it alight. Fire spreads to trees and wood nearby!' });
  reg('grave_dust', 'Grave dust', '⚱️');
  reg('bone', 'Bone', '🦴');
  reg('hex_shard', 'Hex shard', '💠');
  reg('gloom_silk', 'Gloom silk', '🧶');
  reg('arcane_dust', 'Arcane dust', '✨');
  reg('hex_staff', 'Hex staff', '🔱', { wand: { cost: 25, damage: 24, color: 0xc070ff, size: 0.24 }, maxStack: 1 });
  reg('grave_salve', 'Grave salve', '🏺', { heal: 60 });
  reg('gill_tonic', 'Gill tonic', '🫧', { effect: 'gills', secs: 90, hint: 'Right click to drink: breathe underwater for 90 seconds' });
  reg('swift_draught', 'Swiftness draught', '🥤', { effect: 'swift', secs: 60, hint: 'Right click to drink: run 40% faster for 60 seconds' });
  reg('nighteye_draught', 'Owl-eye draught', '🦉', { effect: 'nighteye', secs: 180, hint: 'Right click to drink: see in the dark for 3 minutes' });
  defineCatalogItems(reg, RECIPES);
  defineMetalwork(reg, RECIPES);
  defineArmour(reg, (out, inp, extra = {}) => RECIPES.push({ out, in: inp, ...extra }), FORGE, HAMMER);
}

export function itemHint(def) {
  if (def.hint) return def.hint;
  if (def.id === 'campfire') return 'Right click to place. Not under a tree or against wood: it can set them alight';
  if (def.id === 'crucible') return 'Melt metal in it at a smelter';
  if (def.id.endsWith('_mould')) return 'Cast molten metal in it at a smelter (it is kept)';
  if (def.id === 'smith_hammer') return 'Forge metal at an anvil next to a smelter (it is kept)';
  if (def.id === 'tongs') return 'Needed at the anvil for chain (it is kept)';
  if (def.id === 'smelter') return 'Right click to place. Melts ore into molten metal, slowly; titanium needs bellows next to it';
  if (def.id === 'anvil') return 'Right click to place. Forge plates, rods, tools and armour on it, next to a smelter';
  if (def.id === 'bellows') return 'Right click to place next to a smelter: hot enough to melt titanium';
  if (def.id === 'raw_titanium') return 'Melt it at a smelter with bellows. Right click to place it as a block of ore';
  if (def.id === 'iron_ore') return 'Smelt it at a furnace, or melt it at a smelter. Right click to place it as a block of ore';
  if (def.id === 'raw_copper' || def.id === 'raw_gold') return 'Smelt it at a furnace, or melt it at a smelter. Right click to place it as a block of ore';
  if (def.id === 'coal') return 'Fuel for furnaces and campfires. Right click to place it as a block of ore';
  if (BLOCKS[def.place]?.storage) return `Right click to place, then right click it to store up to ${BLOCKS[def.place].storage} stacks. Breaking it gives back what's inside`;
  if (def.place) return BLOCKS[def.place]?.station ? 'Right click to place' : 'Right click to place · B changes the shape (block, slab, gentle, normal or steep slope, corner slope, stairs, roof ridge, pillar)';
  if (def.food) return `Right click to eat (+${def.food} hunger${def.drink ? `, +${def.drink} thirst` : ''})`;
  if (def.dirty === true) return `Unpurified: drinking it makes you sick. Purify it at a water filter, or boil it at a campfire or furnace`;
  if (def.dirty) return `Raw: may carry germs that make you sick. Heat it at a campfire or furnace to make it safe`;
  if (def.drink) return `Right click to drink (+${def.drink} thirst)`;
  if (def.id === 'purifier') return 'Place it, then turn murky water into clean water next to it';
  if (def.id === 'bottle') return 'Right click on water to fill it, or on a cow or goat to milk it';
  if (def.bucket) return 'Right click on water or lava (or poured fluid) to scoop it up';
  if (def.fluid) return `Right click to pour the ${def.fluid}; it flows like a liquid`;
  if (def.spawn) return `Right click on the ground to spawn a ${SPECIES[def.spawn].name.toLowerCase()}`;
  if (def.heal) return `Right click to use (+${def.heal} health)`;
  if (def.mana) return `Right click to drink (+${def.mana} mana)`;
  if (def.wand) return `Right click to cast a bolt (${def.wand.cost || BOLT_COST} mana, ${def.wand.damage || 10} damage)`;
  if (def.air) return `Right click to wear on your head: your air lasts ${def.air} times as long underwater`;
  if (def.wear) return `Right click to wear (${PIECE_NAMES[def.wear].toLowerCase()}: ${Math.round(def.armour * 100)}% less damage; a whole set adds up)`;
  if (def.tool === 'pickaxe') return def.tier >= 2 ? 'Breaks stone, iron ore, boulders and crystal' : 'Breaks stone, boulders and crystal (iron ore needs stone or better)';
  if (def.tool === 'axe') return 'Chops trees and wood faster';
  if (def.tool === 'shovel') return 'Digs dirt and sand faster';
  if (def.tool === 'sword') return `Attack: ${def.damage} damage`;
  return '';
}

// `at` names a block you need to stand near (within 4.5 m) to craft the recipe.
export const RECIPES = [
  { out: 'stick', n: 4, in: { '#planks': 2 } },
  { out: 'workbench', in: { '#planks': 4 } },
  { out: 'campfire', in: { '#logs': 3, stick: 2 } },
  { out: 'wood_pickaxe', in: { '#planks': 3, stick: 2 }, at: 'workbench' },
  { out: 'wood_axe', in: { '#planks': 3, stick: 2 }, at: 'workbench' },
  { out: 'wood_shovel', in: { '#planks': 1, stick: 2 }, at: 'workbench' },
  { out: 'wood_sword', in: { '#planks': 2, stick: 1 }, at: 'workbench' },
  { out: 'stone_pickaxe', in: { stone: 3, stick: 2 }, at: 'workbench' },
  { out: 'stone_axe', in: { stone: 3, stick: 2 }, at: 'workbench' },
  { out: 'stone_shovel', in: { stone: 1, stick: 2 }, at: 'workbench' },
  { out: 'stone_sword', in: { stone: 2, stick: 1 }, at: 'workbench' },
  { out: 'stone_bricks', n: 4, in: { stone: 4 }, at: 'workbench' },
  { out: 'furnace', in: { stone: 8 }, at: 'workbench' },
  { out: 'iron_ingot', n: 2, in: { iron_ore: 2, '#fuel': 1 }, at: 'furnace' },
  { out: 'smooth_stone', n: 2, in: { stone: 2, '#fuel': 1 }, at: 'furnace' },
  { out: 'glass', n: 3, in: { sand: 3, '#fuel': 1 }, at: 'furnace' },
  { out: 'cooked_meat', n: 3, in: { raw_meat: 3, '#fuel': 1 }, at: 'furnace' },
  { out: 'iron_pickaxe', in: { iron_ingot: 3, stick: 2 }, at: 'workbench' },
  { out: 'iron_axe', in: { iron_ingot: 3, stick: 2 }, at: 'workbench' },
  { out: 'iron_shovel', in: { iron_ingot: 1, stick: 2 }, at: 'workbench' },
  { out: 'iron_sword', in: { iron_ingot: 2, stick: 1 }, at: 'workbench' },
  { out: 'bucket', in: { iron_ingot: 3 }, at: 'workbench' },
  { out: 'bottle', n: 2, in: { glass: 1 }, at: 'workbench' },
  { out: 'basket', in: { plant_fibre: 6, stick: 2 }, at: 'workbench' },
  { out: 'basket', in: { bamboo: 4 }, at: 'workbench' },
  { out: 'chest', in: { '#planks': 8 }, at: 'workbench' },
  { out: 'crate', in: { '#planks': 12, iron_ingot: 2 }, at: 'workbench' },
  { out: 'purifier', in: { '#planks': 4, sand: 3, glass: 1 }, at: 'workbench' },
  { out: 'water_bottle', in: { murky_water: 1 }, at: 'purifier' },
  { out: 'water_bottle', in: { murky_water: 1, stick: 1 }, at: 'campfire' },
  { out: 'water_bottle', n: 3, in: { murky_water: 3, '#fuel': 1 }, at: 'furnace' },
  { out: 'crystal_wand', in: { stick: 1, crystal: 3, feather: 1 }, at: 'workbench' },
  { out: 'cooked_meat', in: { raw_meat: 1 }, at: 'campfire' },
  { out: 'glass', in: { sand: 2 }, at: 'campfire' },
  { out: 'mana_tonic', in: { crystal: 1, berries: 2 }, at: 'campfire' },
  { out: 'fire_starter', n: 2, in: { stick: 2, plant_fibre: 2, stone: 1 } },
  { out: 'arcane_dust', n: 2, in: { crystal: 1, hex_shard: 1 }, at: 'workbench' },
  { out: 'arcane_dust', in: { grave_dust: 3, crystal: 1 }, at: 'workbench' },
  { out: 'hex_staff', in: { stick: 2, hex_shard: 3, bone: 2 }, at: 'workbench' },
  { out: 'grave_salve', in: { grave_dust: 2, plant_fibre: 2, berries: 1 }, at: 'campfire' },
  { out: 'gill_tonic', in: { water_bottle: 1, arcane_dust: 1, plant_fibre: 1 }, at: 'campfire' },
  { out: 'swift_draught', in: { water_bottle: 1, arcane_dust: 1, feather: 1 }, at: 'campfire' },
  { out: 'nighteye_draught', in: { water_bottle: 1, arcane_dust: 1, gloom_silk: 1 }, at: 'campfire' },
  { out: 'bandage', n: 2, in: { '#wool': 2 } },
  { out: 'bandage', n: 2, in: { silk: 3 } },
];

// How many of an item would still fit in the inventory.
function roomFor(id) {
  const max = ITEMS[id].maxStack;
  return slots.reduce((n, s) => n + (!s ? max : s.id === id ? max - s.count : 0), 0);
}

// Stations within reach (4.5 m): which kinds, and the blocks themselves.
const nearStations = () => {
  const fx = player.position.x, fy = player.position.y - FOOT_OFFSET, fz = player.position.z, out = [];
  for (const b of blocks.values()) {
    if (BLOCKS[b.type].station && Math.hypot(b.x + 0.5 - fx, b.y + 0.5 - fy, b.z + 0.5 - fz) < 4.5) out.push(b);
  }
  return out;
};
function stationsNear() { return new Set(nearStations().map((b) => b.type)); }
const atList = (r) => (!r.at ? [] : Array.isArray(r.at) ? r.at : [r.at]);

// Ingredients: an item id, or a group of items such as '#planks' (any item tagged 'planks').
const tagged = (key) => Object.keys(ITEMS).filter((id) => ITEMS[id].tags?.includes(key.slice(1)));
const have = (key) => key[0] === '#' ? tagged(key).reduce((n, id) => n + countItem(id), 0) : countItem(key);
const ingredientName = (key) => key[0] === '#' ? TAGS[key] : ITEMS[key].name;
function take(key, n) {
  if (key[0] !== '#') { removeItem(key, n); return; }
  // from the kinds you have most of first
  for (const id of tagged(key).sort((a, b) => countItem(b) - countItem(a))) {
    const k = Math.min(n, countItem(id));
    if (k) { removeItem(id, k); n -= k; }
    if (!n) break;
  }
}
// `at`: the station (or stations) you need to be near; `keep`: items you need but don't use up
// (moulds, the smith's hammer); `time`: seconds the station works on it (see jobs below).
function canCraft(r, near) {
  if (atList(r).some((a) => !near.has(a))) return false;
  if ((r.keep || []).some((id) => !countItem(id))) return false;
  return Object.entries(r.in).every(([id, n]) => have(id) >= n);
}

export function craft(r, all) {
  const near = stationsNear();
  let made = 0;
  do {
    if (!canCraft(r, near)) break;
    if (r.time) { if (!startJob(r)) break; made++; continue; }
    if (roomFor(r.out) < (r.n || 1)) { toast('Inventory full'); break; }
    for (const [id, n] of Object.entries(r.in)) take(id, n);
    addItem(r.out, r.n || 1);
    for (const [id, n] of Object.entries(r.also || {})) addItem(id, n);
    made++;
  } while (all && made < 100);
  if (made && !r.time) toast(`Crafted ${made * (r.n || 1)} ${ITEMS[r.out].name}`);
  renderInventory();
}

// Jobs: things a station works on over time (melting at a smelter). The ingredients are taken when
// the job starts; each station works through up to four, one after another, and hands over what it
// made when it's done if you're close (otherwise it keeps it until you come and right click it).
const JOB_QUEUE = 4;
export const workingStations = new Set();   // station blocks with jobs or finished things waiting
function startJob(r) {
  const fx = player.position.x, fz = player.position.z, kind = atList(r)[0];
  const b = nearStations().filter((s) => s.type === kind).sort((a, c) => Math.hypot(a.x - fx, a.z - fz) - Math.hypot(c.x - fx, c.z - fz))[0];
  if (!b) return false;
  b.jobs ||= []; b.ready ||= [];
  if (b.jobs.length >= JOB_QUEUE) { toast(`The ${BLOCKS[kind].name.toLowerCase()} is busy (${JOB_QUEUE} things queued)`); return false; }
  for (const [id, n] of Object.entries(r.in)) take(id, n);
  b.jobs.push({ r, left: r.time });
  workingStations.add(b);
  toast(`${BLOCKS[kind].name}: ${ITEMS[r.out].name.toLowerCase()} in ${b.jobs.reduce((t, j) => t + j.left, 0).toFixed(0)} s`);
  return true;
}
// Gives what a station has finished, as far as it fits. Returns how many things were handed over.
export function collectStation(b) {
  let n = 0;
  while (b.ready?.length) {
    const r = b.ready[0];
    if (roomFor(r.out) < (r.n || 1)) { toast('Inventory full'); break; }
    b.ready.shift();
    addItem(r.out, r.n || 1);
    for (const [id, k] of Object.entries(r.also || {})) addItem(id, k);
    toast(`+${r.n || 1} ${ITEMS[r.out].name}`);
    n++;
  }
  if (!b.jobs?.length && !b.ready?.length) workingStations.delete(b);
  renderInventory();
  return n;
}
let jobsShownT = 0;
export function updateJobs(dt) {
  if (!workingStations.size) return;
  const fx = player.position.x, fz = player.position.z;
  for (const b of [...workingStations]) {
    if (!blocks.has(`${b.x},${b.y},${b.z}`)) { workingStations.delete(b); continue; } // broken: the work is lost
    const j = b.jobs[0];
    if (j && (j.left -= dt) <= 0) {
      b.jobs.shift();
      b.ready.push(j.r);
      if (Math.hypot(b.x + 0.5 - fx, b.z + 0.5 - fz) < 8) collectStation(b);
      else toast(`${ITEMS[j.r.out].name} is ready at the ${BLOCKS[b.type].name.toLowerCase()}`);
    }
    if (!b.jobs.length && !b.ready.length) workingStations.delete(b);
  }
  if (inventoryOpen && (jobsShownT -= dt) <= 0) { jobsShownT = 0.5; showJobs(); }
}
// The crafting page's line about what nearby stations are working on.
function showJobs() {
  const el = document.getElementById('jobs');
  if (!el) return;
  const near = nearStations().filter((b) => b.jobs?.length || b.ready?.length);
  el.style.display = near.length ? '' : 'none';
  el.innerHTML = near.map((b) => {
    const j = b.jobs[0], more = b.jobs.length - 1;
    const now = j ? `${ITEMS[j.r.out].name} ${Math.round((1 - j.left / j.r.time) * 100)}%${more > 0 ? `, ${more} more queued` : ''}` : '';
    const wait = b.ready.length ? `${b.ready.length} ready: right click it to take` : '';
    return `<div><b>${BLOCKS[b.type].name}:</b> ${[now, wait].filter(Boolean).join(' · ')}</div>`;
  }).join('');
}

// Kinds of item, for the filters in the crafting and item lists and for sorting the backpack.
export const CATEGORIES = [
  ['all', 'All'], ['building', 'Building'], ['nature', 'Nature'], ['tools', 'Tools and armour'], ['food', 'Food and drink'],
  ['materials', 'Materials'], ['stations', 'Stations'], ['spawners', 'Spawners'],
];
export function itemCategory(def) {
  if (def.cat) return def.cat;
  if (def.spawn) return 'spawners';
  if (def.tool || def.armour || def.wand || def.bucket || def.fluid || def.ignite) return 'tools';
  if (def.food || def.drink || def.heal || def.mana || def.effect) return 'food';
  if (def.place) return BLOCKS[def.place]?.station || BLOCKS[def.place]?.storage ? 'stations' : BLOCKS[def.place]?.natural ? 'nature' : 'building';
  return 'materials';
}

const recipesEl = document.getElementById('recipes');
const paletteEl = document.getElementById('palette');
const filter = { craft: { cat: 'all', text: '', only: false }, items: { cat: 'all', text: '' } };
const matches = (f, def) => (f.cat === 'all' || itemCategory(def) === f.cat) && (!f.text || def.name.toLowerCase().includes(f.text));
// Category buttons, shown only for the kinds that have something in the list.
function renderCats(el, f, ids, rerender) {
  const have = new Set(ids.map((id) => itemCategory(ITEMS[id])));
  el.innerHTML = CATEGORIES.filter(([k]) => k === 'all' || have.has(k)).map(([k, name]) => `<button data-cat="${k}" class="${f.cat === k ? 'on' : ''}">${name}</button>`).join('');
  el.onmousedown = (e) => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); f.cat = b.dataset.cat; rerender(); };
}
for (const [id, f] of [['craft-search', filter.craft], ['item-search', filter.items]]) {
  document.getElementById(id).addEventListener('input', (e) => { f.text = e.target.value.trim().toLowerCase(); renderCrafting(); });
}
document.getElementById('craft-only').addEventListener('change', (e) => { filter.craft.only = e.target.checked; renderCrafting(); });

let paletteBuilt = false;
export function renderCrafting() {
  if (state.creative) renderPalette();
  const near = stationsNear();
  document.getElementById('stations').textContent = (near.size ? `Near: ${[...near].map((t) => BLOCKS[t].name.toLowerCase()).join(', ')}. ` : 'Some recipes need a station nearby (a workbench, furnace, campfire…). ') + 'Click to craft one, shift-click to craft as many as you can.';
  const f = filter.craft, iconEl = document.createElement('div');
  let rows = '', ready = 0;
  renderCats(document.getElementById('craft-cats'), f, RECIPES.map((r) => r.out), renderCrafting);
  RECIPES.forEach((r, i) => {
    const ok = canCraft(r, near);
    if (ok) ready++;
    if (!matches(f, ITEMS[r.out]) || (f.only && !ok)) return;
    fillSlotEl(iconEl, { id: r.out, count: r.n || 1 });
    iconEl.className = 'slot';
    const parts = Object.entries(r.in).map(([id, n]) => `<span class="${have(id) < n ? 'miss' : ''}">${n} ${ingredientName(id)}</span>`);
    for (const a of atList(r)) parts.push(`<span class="${near.has(a) ? '' : 'miss'}">at ${/^[aeiou]/i.test(BLOCKS[a].name) ? 'an' : 'a'} ${BLOCKS[a].name.toLowerCase()}</span>`);
    for (const id of r.keep || []) parts.push(`<span class="${countItem(id) ? '' : 'miss'}">${ITEMS[id].name.toLowerCase()} (kept)</span>`);
    if (r.time) parts.push(`<span>${r.time} s</span>`);
    rows += `<div class="recipe${ok ? ' ok' : ''}" data-r="${i}">${iconEl.outerHTML}<div><b>${ITEMS[r.out].name}${r.n > 1 ? ' ×' + r.n : ''}</b><small>${parts.join(' · ')}</small></div></div>`;
  });
  recipesEl.innerHTML = rows || '<div class="none-note">No recipes match.</div>';
  showJobs();
  document.getElementById('craft-count').textContent = ready ? String(ready) : '';
}
// Creative: every item, filtered. The slots are built once and shown or hidden.
function renderPalette() {
  const f = filter.items;
  if (!paletteBuilt) {
    paletteBuilt = true;
    for (const id of Object.keys(ITEMS)) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.id = id;
      fillSlotEl(el, { id, count: 1 });
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        // holding something? clicking the list throws it away, otherwise take a full stack
        state.heldStack = state.heldStack ? null : { id, count: ITEMS[id].maxStack };
        renderInventory();
      });
      el.addEventListener('mouseenter', () => showTooltip(id));
      el.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
      paletteEl.appendChild(el);
    }
  }
  renderCats(document.getElementById('item-cats'), f, Object.keys(ITEMS), renderPalette);
  for (const el of paletteEl.children) el.style.display = matches(f, ITEMS[el.dataset.id]) ? '' : 'none';
}
recipesEl.addEventListener('mousedown', (e) => {
  const row = e.target.closest('.recipe');
  if (!row || !row.classList.contains('ok')) return;
  e.preventDefault();
  craft(RECIPES[+row.dataset.r], e.shiftKey);
});
