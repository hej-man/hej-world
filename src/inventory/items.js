import { state } from '../state.js';
import { FOOT_OFFSET, player } from '../player/character.js';
import { ITEMS, addItem, countItem, fillSlotEl, registerItem, removeItem, renderInventory, showTooltip, slots, tooltipEl } from './inventory.js';
import { BLOCKS, blocks } from '../world/blocks.js';
import { SPECIES } from '../animals/animals.js';
import { BOLT_COST } from '../player/survival.js';
import { toast } from '../ui/hud.js';

// ---------------------------------------------------------------------------
// Items and recipes
// ---------------------------------------------------------------------------
const SWATCH = {
  stick: 'linear-gradient(45deg, transparent 40%, #9a6a3a 40%, #9a6a3a 60%, transparent 60%)',
  planks: 'repeating-linear-gradient(0deg, #c89a5e 0 5px, #9c7140 5px 6px)',
  stone: 'radial-gradient(circle at 35% 30%, #a3a09b, #6f6c68)',
  bricks: 'linear-gradient(#5c5a56 0 0) 0 8px / 100% 1px no-repeat, linear-gradient(#5c5a56 0 0) 0 17px / 100% 1px no-repeat, linear-gradient(#5c5a56 0 0) 12px 0 / 1px 8px no-repeat, linear-gradient(#5c5a56 0 0) 6px 9px / 1px 8px no-repeat, linear-gradient(#5c5a56 0 0) 18px 9px / 1px 8px no-repeat, #a29f99',
  glass: 'linear-gradient(135deg, rgba(220,245,255,0.85) 0 30%, rgba(160,210,235,0.45) 30% 100%)',
  wool: 'radial-gradient(circle at 40% 35%, #ffffff, #dcd8cc)',
  leather: 'linear-gradient(160deg, #a8703c, #6e4421)',
  dirt: 'radial-gradient(circle at 35% 30%, #8d6a46, #5e4228)',
  sand: 'radial-gradient(circle at 35% 30%, #eadbb0, #c7b07c)',
  smooth_stone: 'linear-gradient(#6f6c67 0 0) 3px 3px / calc(100% - 6px) 1px no-repeat, linear-gradient(#6f6c67 0 0) 3px calc(100% - 4px) / calc(100% - 6px) 1px no-repeat, linear-gradient(135deg, #c2bfb9, #9c9993)',
  iron_ore: 'radial-gradient(circle at 30% 35%, #ff9a4a 0 4px, transparent 5px), radial-gradient(circle at 68% 60%, #e8772e 0 4px, transparent 5px), radial-gradient(circle at 45% 75%, #ffb070 0 3px, transparent 4px), radial-gradient(circle at 72% 25%, #d86a28 0 3px, transparent 4px), radial-gradient(circle at 35% 30%, #8a8680, #55524e)',
  iron_ingot: 'linear-gradient(160deg, #f1f2f4 0%, #b9bcc2 45%, #8b8f96 100%)',
};
export function defineItems() {
  const reg = (id, name, look, extra = {}) =>
    registerItem({ id, name, ...(look.length > 3 ? { color: look } : { icon: look }), ...extra });
  reg('log', 'Log', '🪵', { place: 'log' });
  reg('planks', 'Planks', SWATCH.planks, { place: 'planks' });
  reg('stick', 'Stick', SWATCH.stick, { flat: true });
  reg('stone', 'Stone', SWATCH.stone, { place: 'stone' });
  reg('dirt', 'Dirt', SWATCH.dirt, { place: 'dirt' });
  reg('sand', 'Sand', SWATCH.sand, { place: 'sand' });
  reg('crystal', 'Crystal', '💎');
  reg('stone_bricks', 'Stone bricks', SWATCH.bricks, { place: 'stone_bricks' });
  reg('smooth_stone', 'Smooth stone', SWATCH.smooth_stone, { place: 'smooth_stone' });
  reg('glass', 'Glass', SWATCH.glass, { place: 'glass' });
  reg('wool', 'Wool', SWATCH.wool, { place: 'wool' });
  reg('workbench', 'Workbench', '🛠️', { place: 'workbench' });
  reg('furnace', 'Furnace', '🧱', { place: 'furnace' });
  reg('iron_ore', 'Iron ore', SWATCH.iron_ore);
  reg('iron_ingot', 'Iron ingot', SWATCH.iron_ingot);
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
  reg('silk', 'Spider silk', '🕸️');
  reg('feather', 'Feather', '🪶');
  reg('leather', 'Leather', SWATCH.leather);
  for (const [mat, Mat, tier, badge] of [['wood', 'Wooden', 1, '#c08a4c'], ['stone', 'Stone', 2, '#9a9893'], ['iron', 'Iron', 3, '#e4e6ea']]) {
    reg(`${mat}_pickaxe`, `${Mat} pickaxe`, '⛏️', { tool: 'pickaxe', tier, badge, maxStack: 1, damage: 2 + tier });
    reg(`${mat}_axe`, `${Mat} axe`, '🪓', { tool: 'axe', tier, badge, maxStack: 1, damage: 3 + tier });
    reg(`${mat}_shovel`, `${Mat} shovel`, '🪏', { tool: 'shovel', tier, badge, maxStack: 1, damage: 2 + tier });
    reg(`${mat}_sword`, `${Mat} sword`, '🗡️', { tool: 'sword', tier, badge, maxStack: 1, damage: 4 + tier * 2 });
  }
  reg('bucket', 'Bucket', '🪣', { bucket: true, maxStack: 1 });
  reg('water_bucket', 'Water bucket', '🌊', { fluid: 'water', maxStack: 1 });
  reg('lava_bucket', 'Lava bucket', '🌋', { fluid: 'lava', maxStack: 1 });
  // spawners only come from the creative item list
  const ANIMAL_ICONS = { cow: '🐄', pig: '🐖', sheep: '🐑', chicken: '🐔', deer: '🦌', rabbit: '🐇', wolf: '🐺', bear: '🐻', boar: '🐗', spider: '🕷️' };
  for (const [kind, sp] of Object.entries(SPECIES)) reg(`spawn_${kind}`, `${sp.name} spawner`, ANIMAL_ICONS[kind] || '🥚', { spawn: kind });
  reg('crystal_wand', 'Crystal wand', '🪄', { wand: true, maxStack: 1 });
  reg('mana_tonic', 'Mana tonic', '🧪', { mana: 50 });
  reg('bandage', 'Bandage', '🩹', { heal: 30 });
  reg('leather_armour', 'Leather armour', '🦺', { armour: 0.35, maxStack: 1 });
  reg('iron_armour', 'Iron armour', '🛡️', { armour: 0.6, maxStack: 1 });
}

export function itemHint(def) {
  if (def.place) return BLOCKS[def.place]?.station ? 'Right click to place' : 'Right click to place · B changes the shape (block, slab, slope, stairs, prism, pillar)';
  if (def.food) return `Right click to eat (+${def.food} hunger${def.drink ? `, +${def.drink} thirst` : ''})`;
  if (def.dirty) return `Unpurified: drinking it makes you sick. Purify it at a water filter, or boil it at a campfire or furnace`;
  if (def.drink) return `Right click to drink (+${def.drink} thirst)`;
  if (def.id === 'purifier') return 'Place it, then turn murky water into clean water next to it';
  if (def.id === 'bottle') return 'Right click on water to fill it';
  if (def.id === 'iron_ore') return 'Smelt it at a furnace';
  if (def.bucket) return 'Right click on water or lava (or poured fluid) to scoop it up';
  if (def.fluid) return `Right click to pour the ${def.fluid}; it flows like a liquid`;
  if (def.spawn) return `Right click on the ground to spawn a ${SPECIES[def.spawn].name.toLowerCase()}`;
  if (def.heal) return `Right click to use (+${def.heal} health)`;
  if (def.mana) return `Right click to drink (+${def.mana} mana)`;
  if (def.wand) return `Right click to cast a bolt (${BOLT_COST} mana)`;
  if (def.armour) return `Right click to wear (takes ${Math.round(def.armour * 100)}% less damage)`;
  if (def.tool === 'pickaxe') return def.tier >= 2 ? 'Breaks stone, iron ore, boulders and crystal' : 'Breaks stone, boulders and crystal (iron ore needs stone or better)';
  if (def.tool === 'axe') return 'Chops trees and wood faster';
  if (def.tool === 'shovel') return 'Digs dirt and sand faster';
  if (def.tool === 'sword') return `Attack: ${def.damage} damage`;
  return '';
}

// `at` names a block you need to stand near (within 4.5 m) to craft the recipe.
export const RECIPES = [
  { out: 'planks', n: 4, in: { log: 1 } },
  { out: 'stick', n: 4, in: { planks: 2 } },
  { out: 'workbench', in: { planks: 4 } },
  { out: 'campfire', in: { log: 3, stick: 2 } },
  { out: 'wood_pickaxe', in: { planks: 3, stick: 2 }, at: 'workbench' },
  { out: 'wood_axe', in: { planks: 3, stick: 2 }, at: 'workbench' },
  { out: 'wood_shovel', in: { planks: 1, stick: 2 }, at: 'workbench' },
  { out: 'wood_sword', in: { planks: 2, stick: 1 }, at: 'workbench' },
  { out: 'stone_pickaxe', in: { stone: 3, stick: 2 }, at: 'workbench' },
  { out: 'stone_axe', in: { stone: 3, stick: 2 }, at: 'workbench' },
  { out: 'stone_shovel', in: { stone: 1, stick: 2 }, at: 'workbench' },
  { out: 'stone_sword', in: { stone: 2, stick: 1 }, at: 'workbench' },
  { out: 'stone_bricks', n: 4, in: { stone: 4 }, at: 'workbench' },
  { out: 'furnace', in: { stone: 8 }, at: 'workbench' },
  { out: 'iron_ingot', n: 2, in: { iron_ore: 2, log: 1 }, at: 'furnace' },
  { out: 'smooth_stone', n: 2, in: { stone: 2, log: 1 }, at: 'furnace' },
  { out: 'glass', n: 3, in: { sand: 3, log: 1 }, at: 'furnace' },
  { out: 'cooked_meat', n: 3, in: { raw_meat: 3, log: 1 }, at: 'furnace' },
  { out: 'iron_pickaxe', in: { iron_ingot: 3, stick: 2 }, at: 'workbench' },
  { out: 'iron_axe', in: { iron_ingot: 3, stick: 2 }, at: 'workbench' },
  { out: 'iron_shovel', in: { iron_ingot: 1, stick: 2 }, at: 'workbench' },
  { out: 'iron_sword', in: { iron_ingot: 2, stick: 1 }, at: 'workbench' },
  { out: 'leather_armour', in: { leather: 5 }, at: 'workbench' },
  { out: 'bucket', in: { iron_ingot: 3 }, at: 'workbench' },
  { out: 'iron_armour', in: { iron_ingot: 6, leather: 2 }, at: 'workbench' },
  { out: 'bottle', n: 2, in: { glass: 1 }, at: 'workbench' },
  { out: 'purifier', in: { planks: 4, sand: 3, glass: 1 }, at: 'workbench' },
  { out: 'water_bottle', in: { murky_water: 1 }, at: 'purifier' },
  { out: 'water_bottle', in: { murky_water: 1, stick: 1 }, at: 'campfire' },
  { out: 'water_bottle', n: 3, in: { murky_water: 3, log: 1 }, at: 'furnace' },
  { out: 'crystal_wand', in: { stick: 1, crystal: 3, feather: 1 }, at: 'workbench' },
  { out: 'cooked_meat', in: { raw_meat: 1 }, at: 'campfire' },
  { out: 'glass', in: { sand: 2 }, at: 'campfire' },
  { out: 'mana_tonic', in: { crystal: 1, berries: 2 }, at: 'campfire' },
  { out: 'bandage', n: 2, in: { wool: 2 } },
  { out: 'bandage', n: 2, in: { silk: 3 } },
];

// How many of an item would still fit in the inventory.
function roomFor(id) {
  const max = ITEMS[id].maxStack;
  return slots.reduce((n, s) => n + (!s ? max : s.id === id ? max - s.count : 0), 0);
}

function stationsNear() {
  const near = new Set();
  const fx = player.position.x, fy = player.position.y - FOOT_OFFSET, fz = player.position.z;
  for (const b of blocks.values()) {
    if (BLOCKS[b.type].station && Math.hypot(b.x + 0.5 - fx, b.y + 0.5 - fy, b.z + 0.5 - fz) < 4.5) near.add(b.type);
  }
  return near;
}

function canCraft(r, near) {
  if (r.at && !near.has(r.at)) return false;
  return Object.entries(r.in).every(([id, n]) => countItem(id) >= n);
}

export function craft(r, all) {
  const near = stationsNear();
  let made = 0;
  do {
    if (!canCraft(r, near)) break;
    if (roomFor(r.out) < (r.n || 1)) { toast('Inventory full'); break; }
    for (const [id, n] of Object.entries(r.in)) removeItem(id, n);
    addItem(r.out, r.n || 1);
    made++;
  } while (all && made < 100);
  if (made) toast(`Crafted ${made * (r.n || 1)} ${ITEMS[r.out].name}`);
  renderInventory();
}

const recipesEl = document.getElementById('recipes');
const paletteEl = document.getElementById('palette');
export function renderCrafting() {
  const title = document.getElementById('craft-title');
  if (state.creative) {
    title.firstChild.textContent = 'All items ';
    document.getElementById('stations').textContent = 'click to take a stack';
    recipesEl.style.display = 'none';
    paletteEl.style.display = 'grid';
    if (!paletteEl.children.length) {
      for (const id of Object.keys(ITEMS)) {
        const el = document.createElement('div');
        el.className = 'slot';
        fillSlotEl(el, { id, count: 1 });
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          // holding something? clicking the palette throws it away, otherwise take a full stack
          state.heldStack = state.heldStack ? null : { id, count: ITEMS[id].maxStack };
          renderInventory();
        });
        el.addEventListener('mouseenter', () => showTooltip(id));
        el.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });
        paletteEl.appendChild(el);
      }
    }
    return;
  }
  title.firstChild.textContent = 'Crafting ';
  recipesEl.style.display = 'flex';
  paletteEl.style.display = 'none';
  const near = stationsNear();
  document.getElementById('stations').textContent = near.size ? `near: ${[...near].map((t) => BLOCKS[t].name.toLowerCase()).join(', ')}` : 'shift-click crafts all';
  const iconEl = document.createElement('div');
  recipesEl.innerHTML = RECIPES.map((r, i) => {
    const ok = canCraft(r, near);
    fillSlotEl(iconEl, { id: r.out, count: r.n || 1 });
    iconEl.className = 'slot';
    const parts = Object.entries(r.in).map(([id, n]) => {
      const have = countItem(id);
      return `<span class="${have < n ? 'miss' : ''}">${n} ${ITEMS[id].name}</span>`;
    });
    if (r.at) parts.push(`<span class="${near.has(r.at) ? '' : 'miss'}">at a ${BLOCKS[r.at].name.toLowerCase()}</span>`);
    return `<div class="recipe${ok ? ' ok' : ''}" data-r="${i}">${iconEl.outerHTML}<div><b>${ITEMS[r.out].name}${r.n > 1 ? ' ×' + r.n : ''}</b><small>${parts.join(' · ')}</small></div></div>`;
  }).join('');
}
recipesEl.addEventListener('mousedown', (e) => {
  const row = e.target.closest('.recipe');
  if (!row || !row.classList.contains('ok')) return;
  e.preventDefault();
  craft(RECIPES[+row.dataset.r], e.shiftKey);
});
