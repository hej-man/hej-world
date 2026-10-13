import { BLOCKS } from '../world/blocks.js';
import { COLOURS, STONES, WOODS, colourBlock, woodBlock } from '../world/block-catalog.js';
import { FLOWERS } from '../world/vegetation.js';

// ---------------------------------------------------------------------------
// Items and recipes for the block catalogue (woods, stones, ground, metals, colours), plus the
// plants, foods, ores and tools that go with them. Called from defineItems in items.js.
//
// Recipe ingredients starting with # are groups: '#planks' is any kind of planks (see TAGS).
// `also` gives back items as well as the result (an emptied bucket or bottle).
// ---------------------------------------------------------------------------
export const TAGS = {
  '#planks': 'any planks', '#logs': 'any logs', '#fuel': 'fuel (logs, planks or coal)', '#wool': 'any wool',
  '#mushrooms': 'any mushroom', '#terracotta': 'terracotta',
};

// Which dye each flower or plant gives, and which dyes mix into others.
const DYE_FROM = {
  dandelion: 'yellow', poppy: 'red', cornflower: 'blue', allium: 'magenta', pink_tulip: 'pink', orange_tulip: 'orange',
  lily_of_the_valley: 'white', oxeye_daisy: 'light_gray', cocoa_beans: 'brown', coal: 'black', cactus: 'green', pink_petals: 'pink',
};
const DYE_MIX = [
  ['orange', 'red', 'yellow'], ['light_blue', 'blue', 'white'], ['pink', 'red', 'white'], ['lime', 'green', 'white'], ['cyan', 'blue', 'green'],
  ['purple', 'red', 'blue'], ['magenta', 'purple', 'pink'], ['gray', 'black', 'white'], ['light_gray', 'gray', 'white'],
];

export function defineCatalogItems(reg, RECIPES) {
  const R = (out, inp, extra = {}) => RECIPES.push({ out, in: inp, ...extra });
  // Every catalogue block is an item that places it (drawn as a little cube in the inventory).
  const block = (id, extra = {}) => reg(id, BLOCKS[id].name, null, { place: id, block: true, ...extra });

  // --- Woods: log, planks, stripped log, leaves, sapling, fence and bookshelf of each
  for (const w of WOODS) {
    const log = woodBlock(w, 'log'), planks = woodBlock(w, 'planks'), stripped = `stripped_${w.id}_log`;
    block(log, { tags: ['logs', 'fuel'] });
    block(planks, { tags: ['planks', 'fuel'] });
    block(stripped, { tags: ['logs', 'fuel'] });
    block(`${w.id}_leaves`);
    reg(`${w.id}_sapling`, BLOCKS[`${w.id}_sapling`].name, '🌱', { place: `${w.id}_sapling` });
    block(`${w.id}_fence`);
    block(`${w.id}_bookshelf`);
    R(planks, { [log]: 1 }, { n: 4 });
    R(planks, { [stripped]: 1 }, { n: 4 });
    R(stripped, { [log]: 1 }, { at: 'workbench' });
    R(`${w.id}_fence`, { [planks]: 4, stick: 2 }, { n: 3, at: 'workbench' });
    R(`${w.id}_bookshelf`, { [planks]: 6, book: 3 }, { at: 'workbench' });
  }

  // --- Stones: rough, polished and bricks
  for (const s of STONES) {
    block(s.id); block(`polished_${s.id}`); block(`${s.id}_bricks`);
    R(`polished_${s.id}`, { [s.id]: 4 }, { n: 4, at: 'workbench' });
    R(`${s.id}_bricks`, { [`polished_${s.id}`]: 4 }, { n: 4, at: 'workbench' });
  }
  R('sandstone', { sand: 4 }, { at: 'workbench' });
  R('red_sandstone', { red_sand: 4 }, { at: 'workbench' });
  for (const id of ['cobblestone', 'mossy_cobblestone', 'mossy_stone_bricks', 'cracked_stone_bricks', 'clay_bricks', 'mud_bricks', 'obsidian', 'chiseled_sandstone', 'stone_tiles']) block(id);
  R('cobblestone', { stone: 1 }, { at: 'workbench' });
  R('mossy_cobblestone', { cobblestone: 1, plant_fibre: 1 }, { at: 'workbench' });
  R('mossy_stone_bricks', { stone_bricks: 1, plant_fibre: 1 }, { at: 'workbench' });
  R('cracked_stone_bricks', { stone_bricks: 1, '#fuel': 1 }, { at: 'furnace' });
  R('clay_bricks', { brick: 4 }, { at: 'workbench' });
  R('mud_bricks', { mud: 2, plant_fibre: 1 }, { n: 2, at: 'workbench' });
  R('obsidian', { lava_bucket: 1, water_bucket: 1 }, { at: 'workbench', also: { bucket: 2 } });
  R('chiseled_sandstone', { polished_sandstone: 1 }, { at: 'workbench' });
  R('stone_tiles', { smooth_stone: 4 }, { n: 4, at: 'workbench' });

  // --- Ground and plant blocks
  for (const id of ['red_sand', 'gravel', 'clay', 'mud', 'podzol', 'coarse_dirt', 'snow_block', 'ice', 'packed_ice', 'blue_ice', 'moss_block', 'cactus_block', 'hay_bale', 'pumpkin', 'jack_o_lantern', 'melon']) block(id);
  block('terracotta', { tags: ['terracotta'] });
  R('mud', { dirt: 2, murky_water: 1 }, { n: 2, also: { bottle: 1 } });
  R('coarse_dirt', { dirt: 2, gravel: 2 }, { n: 4 });
  R('ice', { snow_block: 4, water_bucket: 1 }, { n: 4, at: 'workbench', also: { bucket: 1 } });
  R('packed_ice', { ice: 4 }, { at: 'workbench' });
  R('blue_ice', { packed_ice: 4 }, { at: 'workbench' });
  R('moss_block', { dirt: 1, plant_fibre: 4 });
  R('terracotta', { clay: 1, '#fuel': 1 }, { at: 'furnace' });
  R('cactus_block', { cactus: 4 }, { at: 'workbench' });
  R('hay_bale', { plant_fibre: 6 }, { at: 'workbench' });
  R('jack_o_lantern', { pumpkin: 1, torch: 1 });
  R('melon', { melon_slice: 9 });
  R('glass', { red_sand: 3, '#fuel': 1 }, { n: 3, at: 'furnace' });

  // --- Ores, metals and metal blocks
  reg('coal', 'Coal', null, { draw: 'coal', tags: ['fuel'], place: 'coal', cat: 'materials' });
  reg('raw_copper', 'Raw copper', null, { draw: 'raw:copper', place: 'raw_copper', cat: 'materials' });
  reg('raw_gold', 'Raw gold', null, { draw: 'raw:gold', place: 'raw_gold', cat: 'materials' });
  reg('copper_ingot', 'Copper ingot', null, { draw: 'ingot:copper' });
  reg('gold_ingot', 'Gold ingot', null, { draw: 'ingot:gold' });
  reg('brick', 'Brick', null, { draw: 'brick' });
  R('copper_ingot', { raw_copper: 2, '#fuel': 1 }, { n: 2, at: 'furnace' });
  R('gold_ingot', { raw_gold: 2, '#fuel': 1 }, { n: 2, at: 'furnace' });
  R('brick', { clay: 1, '#fuel': 1 }, { n: 4, at: 'furnace' });
  for (const [blockId, item] of [['coal_block', 'coal'], ['copper_block', 'copper_ingot'], ['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot']]) {
    block(blockId, blockId === 'coal_block' ? { tags: ['fuel'] } : {});
    R(blockId, { [item]: 9 }, { at: 'workbench' });
    R(item, { [blockId]: 1 }, { n: 9 });
  }
  block('crystal_block');
  R('crystal_block', { crystal: 4, glass: 1 }, { at: 'workbench' });

  // --- Copper and gold tools (copper digs a little faster than stone; gold is very
  //     fast but doesn't hit hard)
  for (const [mat, Mat, speed, badge, head, hit] of [['copper', 'Copper', 2, '#d27a48', 0xd27a48, 1], ['gold', 'Golden', 3.2, '#f0c63a', 0xf0c63a, 0]]) {
    const ingot = `${mat}_ingot`;
    reg(`${mat}_pickaxe`, `${Mat} pickaxe`, null, { draw: `tool:pickaxe:${mat}`, tool: 'pickaxe', tier: 2, speed, badge, head, maxStack: 1, damage: 3 + hit });
    reg(`${mat}_axe`, `${Mat} axe`, null, { draw: `tool:axe:${mat}`, tool: 'axe', tier: 2, speed, badge, head, maxStack: 1, damage: 4 + hit });
    reg(`${mat}_shovel`, `${Mat} shovel`, null, { draw: `tool:shovel:${mat}`, tool: 'shovel', tier: 2, speed, badge, head, maxStack: 1, damage: 3 + hit });
    reg(`${mat}_sword`, `${Mat} sword`, null, { draw: `tool:sword:${mat}`, tool: 'sword', tier: 2, speed, badge, head, maxStack: 1, damage: 7 + hit * 2 });
    R(`${mat}_pickaxe`, { [ingot]: 3, stick: 2 }, { at: 'workbench' });
    R(`${mat}_axe`, { [ingot]: 3, stick: 2 }, { at: 'workbench' });
    R(`${mat}_shovel`, { [ingot]: 1, stick: 2 }, { at: 'workbench' });
    R(`${mat}_sword`, { [ingot]: 2, stick: 1 }, { at: 'workbench' });
  }

  // --- Light: torches and lanterns
  reg('torch', 'Torch', '🕯️', { place: 'torch' });
  reg('lantern', 'Lantern', '🏮', { place: 'lantern' });
  R('torch', { stick: 1, coal: 1 }, { n: 4 });
  R('torch', { stick: 1, '#logs': 1 }, { n: 2, at: 'campfire' });
  R('lantern', { iron_ingot: 2, torch: 1 }, { at: 'workbench' });

  // --- Plants gathered in the biomes
  for (const [id, hex, name] of FLOWERS) {
    reg(id, name, null, { color: `radial-gradient(circle at 50% 38%, #${hex.toString(16).padStart(6, '0')} 0 7px, transparent 8px), linear-gradient(90deg, transparent 46%, #3f7a2a 46% 54%, transparent 54%)`, flat: true, cat: 'nature' });
  }
  const plant = (id, name, look, extra = {}) => reg(id, name, look, { cat: 'nature', ...extra });
  plant('pink_petals', 'Pink petals', '🌸');
  plant('cactus', 'Cactus', '🌵');
  plant('bamboo', 'Bamboo', '🎋');
  plant('plant_fibre', 'Plant fibre', '🌿');
  plant('wild_grain', 'Wild grain', '🌾');
  plant('pinecone', 'Pinecone', null, { color: 'radial-gradient(ellipse at 50% 55%, #8a5a30 0 9px, transparent 10px)', flat: true });
  plant('cocoa_beans', 'Cocoa beans', null, { color: 'radial-gradient(ellipse at 40% 45%, #7a4422 0 6px, transparent 7px), radial-gradient(ellipse at 64% 60%, #5e321a 0 6px, transparent 7px)', flat: true });
  plant('red_mushroom', 'Red mushroom', '🍄', { tags: ['mushrooms'] });
  plant('brown_mushroom', 'Brown mushroom', '🟤', { tags: ['mushrooms'] });
  reg('cactus_fruit', 'Cactus fruit', '🍐', { food: 6, drink: 10 });
  reg('melon_slice', 'Melon slice', '🍉', { food: 6, drink: 8 });
  reg('coconut', 'Coconut', '🥥', { food: 8, drink: 14 });
  reg('cherries', 'Cherries', '🍒', { food: 7, drink: 3 });
  reg('maple_sap', 'Maple sap', '🍯', { drink: 8, food: 2 });

  // --- Food and drink made from them
  reg('mushroom_stew', 'Mushroom stew', '🍲', { food: 30, heal: 5 });
  reg('chocolate', 'Chocolate', '🍫', { food: 18 });
  reg('pumpkin_pie', 'Pumpkin pie', '🥧', { food: 40 });
  reg('cherry_pie', 'Cherry pie', '🥮', { food: 40, heal: 5 });
  reg('fruit_salad', 'Fruit salad', '🥗', { food: 35, drink: 10 });
  reg('pine_nuts', 'Roasted pine nuts', '🌰', { food: 6 });
  reg('maple_syrup', 'Maple syrup', '🧴', { drink: 15, food: 12, leaves: 'bottle' });
  // milk from a cow or goat (right click it with an empty bottle): raw milk can carry germs, so
  // drinking it may make you sick like dirty water; heat it at a campfire or furnace to make it safe
  reg('raw_milk', 'Raw milk', null, { draw: 'bottle:rawmilk', drink: 30, leaves: 'bottle', dirty: 0.4 });
  reg('milk', 'Pasteurised milk', null, { draw: 'bottle:milk', drink: 40, leaves: 'bottle' });
  R('milk', { raw_milk: 1, stick: 1 }, { at: 'campfire' });
  R('milk', { raw_milk: 3, '#fuel': 1 }, { n: 3, at: 'furnace' });
  reg('coconut_milk', 'Coconut milk', '🥛', { drink: 35, leaves: 'bottle' });
  reg('melon_juice', 'Melon juice', '🧃', { drink: 45, leaves: 'bottle' });
  R('bread', { wild_grain: 3 }, { at: 'campfire' });
  R('bread', { wild_grain: 6, '#fuel': 1 }, { n: 2, at: 'furnace' });
  R('mushroom_stew', { '#mushrooms': 2 }, { at: 'campfire' });
  R('chocolate', { cocoa_beans: 2, maple_sap: 1 }, { at: 'campfire' });
  R('pumpkin_pie', { pumpkin: 1, maple_sap: 1 }, { n: 2, at: 'furnace' });
  R('cherry_pie', { cherries: 3, bread: 1 }, { n: 2, at: 'furnace' });
  R('fruit_salad', { apple: 1, berries: 2, cherries: 1 });
  R('pine_nuts', { pinecone: 1 }, { n: 2, at: 'campfire' });
  R('maple_syrup', { maple_sap: 3, bottle: 1 }, { at: 'campfire' });
  R('coconut_milk', { coconut: 1, bottle: 1 });
  R('melon_juice', { melon_slice: 3, bottle: 1 });

  // --- Paper and books (for bookshelves)
  reg('paper', 'Paper', null, { draw: 'paper' });
  reg('book', 'Book', '📕');
  R('paper', { bamboo: 3 }, { n: 3, at: 'workbench' });
  R('book', { paper: 3, leather: 1 }, { at: 'workbench' });

  // --- Dyes, and coloured wool, glass, terracotta and concrete
  for (const c of COLOURS) {
    const [h, s, l] = c.hsl;
    reg(`${c.id}_dye`, `${c.name} dye`, null, { color: `radial-gradient(circle at 40% 35%, hsl(${h}, ${s}%, ${Math.min(95, l + 15)}%), hsl(${h}, ${s}%, ${l}%) 60%, hsl(${h}, ${s}%, ${Math.max(5, l - 15)}%))` });
    for (const kind of ['wool', 'stained_glass', 'terracotta', 'concrete']) block(colourBlock(c, kind), kind === 'wool' ? { tags: ['wool'] } : kind === 'terracotta' ? { tags: ['terracotta'] } : {});
    R(colourBlock(c, 'wool'), { '#wool': 1, [`${c.id}_dye`]: 1 });
    R(colourBlock(c, 'stained_glass'), { glass: 4, [`${c.id}_dye`]: 1 }, { n: 4, at: 'workbench' });
    R(colourBlock(c, 'terracotta'), { '#terracotta': 4, [`${c.id}_dye`]: 1 }, { n: 4, at: 'workbench' });
    R(colourBlock(c, 'concrete'), { sand: 4, gravel: 4, [`${c.id}_dye`]: 1 }, { n: 8, at: 'workbench' });
  }
  for (const [from, dye] of Object.entries(DYE_FROM)) R(`${dye}_dye`, { [from]: 1 }, { n: 2 });
  for (const [out, a, b] of DYE_MIX) R(`${out}_dye`, { [`${a}_dye`]: 1, [`${b}_dye`]: 1 }, { n: 2 });
}
