// ---------------------------------------------------------------------------
// The families of blocks: woods, stones, ground, metals and coloured blocks. Each entry becomes
// one or more placeable blocks (world/blocks.js) and items with recipes (inventory/catalog-items.js).
// Textures are described here and drawn by world/block-textures.js. Colours are [hue, sat %, light %].
//
// This module imports nothing, so blocks.js can read it while it is being set up.
// ---------------------------------------------------------------------------

// Ten woods, each with its own look: how its planks are laid (style), its bark and its leaves.
// Oak keeps the old ids 'log' and 'planks' so saved worlds and recipes still work.
export const WOODS = [
  { id: 'oak', name: 'Oak', planks: [33, 45, 52], bark: [28, 32, 30], ring: [35, 45, 62], leaves: [100, 45, 32], style: 'boards', barkStyle: 'furrowed', leafShape: 'lobed' },
  { id: 'birch', name: 'Birch', planks: [45, 45, 74], bark: [40, 8, 88], marks: [30, 10, 18], ring: [45, 40, 78], leaves: [80, 45, 45], style: 'narrow', barkStyle: 'furrowed', leafShape: 'small' },
  { id: 'spruce', name: 'Spruce', planks: [28, 40, 36], bark: [22, 32, 22], ring: [30, 40, 50], leaves: [145, 30, 24], style: 'vertical', barkStyle: 'scaly', leafShape: 'needles' },
  { id: 'dark_oak', name: 'Dark oak', planks: [25, 40, 24], bark: [22, 28, 16], ring: [28, 35, 34], leaves: [110, 40, 22], style: 'wide', barkStyle: 'ridged', leafShape: 'lobed' },
  { id: 'maple', name: 'Maple', planks: [22, 48, 52], bark: [18, 22, 30], ring: [26, 45, 62], leaves: [16, 85, 48], style: 'herringbone', barkStyle: 'shaggy', leafShape: 'star' },
  { id: 'cherry', name: 'Cherry', planks: [355, 42, 74], bark: [340, 18, 24], ring: [355, 40, 70], leaves: [330, 72, 80], blossom: [340, 80, 90], style: 'chevron', barkStyle: 'banded', leafShape: 'small' },
  { id: 'redwood', name: 'Redwood', planks: [10, 52, 40], bark: [8, 45, 27], ring: [14, 50, 50], leaves: [135, 30, 28], style: 'rough', barkStyle: 'fibrous', leafShape: 'sprays' },
  { id: 'jungle', name: 'Jungle', planks: [26, 50, 48], bark: [35, 28, 30], ring: [28, 48, 58], leaves: [100, 62, 30], style: 'parquet', barkStyle: 'vines', leafShape: 'broad' },
  { id: 'acacia', name: 'Acacia', planks: [18, 62, 48], bark: [20, 6, 38], ring: [20, 60, 52], leaves: [75, 40, 38], style: 'offset', barkStyle: 'smooth', leafShape: 'tiny' },
  { id: 'palm', name: 'Palm', planks: [40, 40, 62], bark: [35, 25, 44], ring: [40, 38, 66], leaves: [95, 50, 38], style: 'slats', barkStyle: 'ringed', leafShape: 'fronds' },
];
// Block ids for each part of a wood.
export const woodBlock = (w, part) => w.id === 'oak' && (part === 'log' || part === 'planks') ? part : `${w.id}_${part}`;

// Stones found in pockets underground (and on the surface in some biomes). Each comes rough,
// polished and as bricks; `layout` is how its bricks are laid.
export const STONES = [
  { id: 'granite', name: 'Granite', hsl: [12, 35, 52], spots: [[14, 45, 40], [30, 15, 82]], depth: [8, 60], layout: 'large' },
  { id: 'diorite', name: 'Diorite', hsl: [0, 0, 82], spots: [[0, 0, 38]], depth: [8, 60], layout: 'small' },
  { id: 'andesite', name: 'Andesite', hsl: [0, 0, 55], spots: [[0, 0, 44], [0, 0, 68]], depth: [8, 70], layout: 'basket' },
  { id: 'deepslate', name: 'Deepslate', hsl: [220, 6, 27], style: 'columns', depth: [0, 22], layout: 'tiles' },
  { id: 'tuff', name: 'Tuff', hsl: [80, 8, 42], style: 'porous', depth: [0, 30], layout: 'irregular' },
  { id: 'calcite', name: 'Calcite', hsl: [40, 15, 92], style: 'veined', spots: [[40, 10, 75]], depth: [10, 40], layout: 'running' },
  { id: 'marble', name: 'Marble', hsl: [210, 10, 93], style: 'veined', spots: [[210, 15, 55]], depth: [14, 50], layout: 'large' },
  { id: 'limestone', name: 'Limestone', hsl: [45, 30, 78], style: 'banded', depth: [20, 80], layout: 'long' },
  { id: 'sandstone', name: 'Sandstone', hsl: [42, 45, 72], style: 'banded', depth: [20, 80], layout: 'running' },
  { id: 'red_sandstone', name: 'Red sandstone', hsl: [18, 60, 50], style: 'banded', depth: [20, 80], layout: 'long' },
  { id: 'basalt', name: 'Basalt', hsl: [220, 5, 30], style: 'columns', depth: [0, 40], layout: 'tiles' },
  { id: 'blackstone', name: 'Blackstone', hsl: [260, 8, 15], depth: [0, 18], layout: 'irregular' },
];

// Ground and natural blocks.
export const GROUND = [
  { id: 'red_sand', name: 'Red sand', mat: 'sand', tex: { kind: 'grainy', hsl: [18, 62, 50] } },
  { id: 'gravel', name: 'Gravel', mat: 'sand', tex: { kind: 'grainy', hsl: [30, 5, 50], pebbles: [20, 6, 38] } },
  { id: 'clay', name: 'Clay', mat: 'dirt', tex: { kind: 'solid', hsl: [215, 12, 64], noise: 6 } },
  { id: 'mud', name: 'Mud', mat: 'dirt', tex: { kind: 'solid', hsl: [20, 22, 22], noise: 10 } },
  { id: 'podzol', name: 'Podzol', mat: 'dirt', tex: { kind: 'grainy', hsl: [24, 40, 26], needles: [30, 45, 40] } },
  { id: 'coarse_dirt', name: 'Coarse dirt', mat: 'dirt', tex: { kind: 'grainy', hsl: [26, 32, 34], pebbles: [26, 10, 46] } },
  { id: 'snow_block', name: 'Snow', mat: 'sand', tex: { kind: 'snow', hsl: [210, 30, 95] } },
  { id: 'ice', name: 'Ice', mat: 'ice', tex: { kind: 'ice', hsl: [205, 70, 78], cracks: 4 } },
  { id: 'packed_ice', name: 'Packed ice', mat: 'ice', tex: { kind: 'ice', hsl: [212, 60, 72], cracks: 10 } },
  { id: 'blue_ice', name: 'Blue ice', mat: 'ice', tex: { kind: 'ice', hsl: [218, 75, 62], cracks: 7 } },
  { id: 'moss_block', name: 'Moss', mat: 'dirt', tex: { kind: 'moss', hsl: [95, 45, 36] } },
  { id: 'terracotta', name: 'Terracotta', mat: 'stone', tex: { kind: 'solid', hsl: [18, 38, 50] } },
  { id: 'cactus_block', name: 'Cactus', mat: 'plant', tex: { kind: 'cactus', hsl: [110, 45, 32] } },
  { id: 'hay_bale', name: 'Hay bale', mat: 'plant', tex: { kind: 'wool', hsl: [46, 70, 52] } },
  { id: 'pumpkin', name: 'Pumpkin', mat: 'plant', tex: { kind: 'gourd', hsl: [28, 85, 50] } },
  { id: 'jack_o_lantern', name: "Jack o'lantern", mat: 'plant', glow: 0xffa040, tex: { kind: 'gourd', hsl: [28, 85, 50], face: true } },
  { id: 'melon', name: 'Melon', mat: 'plant', tex: { kind: 'gourd', hsl: [100, 50, 34], stripes: [90, 55, 22] } },
];

// Other stone blocks.
export const STONE_EXTRAS = [
  { id: 'cobblestone', name: 'Cobblestone', tex: { kind: 'cobble', hsl: [30, 4, 50] } },
  { id: 'mossy_cobblestone', name: 'Mossy cobblestone', tex: { kind: 'cobble', hsl: [30, 4, 50], moss: [95, 40, 34] } },
  { id: 'mossy_stone_bricks', name: 'Mossy stone bricks', tex: { kind: 'bricks', hsl: [36, 4, 60], moss: [95, 40, 34] } },
  { id: 'cracked_stone_bricks', name: 'Cracked stone bricks', tex: { kind: 'bricks', hsl: [36, 4, 58], cracks: true } },
  { id: 'clay_bricks', name: 'Bricks', tex: { kind: 'bricks', hsl: [8, 50, 42], rows: 5 } },
  { id: 'mud_bricks', name: 'Mud bricks', tex: { kind: 'bricks', hsl: [28, 30, 46], rows: 5 } },
  { id: 'obsidian', name: 'Obsidian', tier: 3, tex: { kind: 'stone', hsl: [265, 35, 10], style: 'smooth', spots: [[275, 50, 30]] } },
  { id: 'chiseled_sandstone', name: 'Chiselled sandstone', tex: { kind: 'tiles', hsl: [42, 45, 70] } },
  { id: 'stone_tiles', name: 'Stone tiles', tex: { kind: 'tiles', hsl: [30, 4, 62] } },
];

// Ores found in the ground. Each is an item you dig up that you can also place as a block of rock
// with the ore in it (the block has the item's id, so breaking it gives the same item back).
export const ORE_BLOCKS = [
  { id: 'coal', name: 'Coal ore', nugget: [0, 0, 9] },
  { id: 'iron_ore', name: 'Iron ore', nugget: [22, 62, 52] },
  { id: 'raw_copper', name: 'Copper ore', nugget: [20, 66, 48] },
  { id: 'raw_gold', name: 'Gold ore', nugget: [48, 88, 56] },
  { id: 'raw_titanium', name: 'Titanium ore', nugget: [255, 22, 80], tier: 2 },
];
// The metal blocks made from them.
export const METAL_BLOCKS = [
  { id: 'coal_block', name: 'Block of coal', mat: 'stone', tex: { kind: 'solid', hsl: [0, 0, 12], noise: 10 } },
  { id: 'copper_block', name: 'Block of copper', mat: 'metal', tex: { kind: 'metal', hsl: [20, 60, 52] } },
  { id: 'iron_block', name: 'Block of iron', mat: 'metal', tex: { kind: 'metal', hsl: [210, 6, 80] } },
  { id: 'gold_block', name: 'Block of gold', mat: 'metal', tex: { kind: 'metal', hsl: [48, 85, 55] } },
  { id: 'crystal_block', name: 'Crystal lamp', mat: 'stone', glow: 0x7fdcff, tex: { kind: 'glass', hsl: [195, 80, 70] }, glass: true },
  // metalwork (inventory/metalwork.js)
  { id: 'steel_block', name: 'Block of steel', mat: 'metal', tex: { kind: 'metal', hsl: [214, 14, 56], brushed: true } },
  { id: 'titanium_block', name: 'Block of titanium', mat: 'metal', tier: 3, tex: { kind: 'metal', hsl: [250, 12, 76], anodised: [265, 40, 70] } },
  { id: 'rose_gold_block', name: 'Block of rose gold', mat: 'metal', tex: { kind: 'metal', hsl: [10, 55, 74] } },
  { id: 'iron_bars', name: 'Iron bars', mat: 'metal', cutout: true, tex: { kind: 'bars', hsl: [210, 6, 52] } },
  { id: 'steel_grate', name: 'Steel grate', mat: 'metal', cutout: true, tex: { kind: 'grate', hsl: [214, 12, 48] } },
  { id: 'steel_treadplate', name: 'Steel tread plate', mat: 'metal', tex: { kind: 'tread', hsl: [214, 10, 60] } },
  { id: 'titanium_plating', name: 'Titanium plating', mat: 'metal', tier: 3, tex: { kind: 'plating', hsl: [250, 12, 72] } },
  { id: 'rose_gold_tiles', name: 'Rose gold tiles', mat: 'metal', tex: { kind: 'metaltiles', hsl: [10, 50, 70] } },
  { id: 'copper_panels', name: 'Weathered copper panels', mat: 'metal', tex: { kind: 'panels', hsl: [20, 60, 50], patina: [165, 45, 52] } },
  { id: 'iron_chain', name: 'Hanging chains', mat: 'metal', cutout: true, tex: { kind: 'chains', hsl: [210, 6, 45] } },
  { id: 'riveted_iron', name: 'Riveted iron', mat: 'metal', tex: { kind: 'metal', hsl: [210, 5, 66], rivets: 'dense' } },
  { id: 'gear_block', name: 'Gearwork', mat: 'metal', tex: { kind: 'gears', hsl: [32, 30, 46], back: [214, 10, 30] } },
];

// Stations for metalwork, drawn with their own models (world/blocks.js).
export const METAL_STATIONS = {
  smelter: { name: 'Smelter', mat: 'stone', station: true, facing: true, glow: 0xff7a30 },
  bellows: { name: 'Bellows', mat: 'wood', station: true, facing: true },
  anvil: { name: 'Anvil', mat: 'metal', station: true, facing: true },
};

// Sixteen colours, for dyes and coloured wool, glass, terracotta and concrete.
export const COLOURS = [
  { id: 'white', name: 'White', hsl: [40, 10, 93] }, { id: 'light_gray', name: 'Light grey', hsl: [0, 0, 66] },
  { id: 'gray', name: 'Grey', hsl: [0, 0, 38] }, { id: 'black', name: 'Black', hsl: [240, 6, 11] },
  { id: 'brown', name: 'Brown', hsl: [25, 45, 32] }, { id: 'red', name: 'Red', hsl: [358, 65, 42] },
  { id: 'orange', name: 'Orange', hsl: [28, 90, 52] }, { id: 'yellow', name: 'Yellow', hsl: [50, 90, 55] },
  { id: 'lime', name: 'Lime', hsl: [90, 65, 50] }, { id: 'green', name: 'Green', hsl: [110, 55, 30] },
  { id: 'cyan', name: 'Cyan', hsl: [185, 60, 40] }, { id: 'light_blue', name: 'Light blue', hsl: [205, 70, 62] },
  { id: 'blue', name: 'Blue', hsl: [230, 60, 40] }, { id: 'purple', name: 'Purple', hsl: [280, 55, 40] },
  { id: 'magenta', name: 'Magenta', hsl: [310, 60, 52] }, { id: 'pink', name: 'Pink', hsl: [340, 70, 75] },
];
// White wool keeps the old id 'wool'.
export const colourBlock = (c, kind) => kind === 'wool' && c.id === 'white' ? 'wool' : `${c.id}_${kind}`;
const COLOUR_KINDS = {
  wool: (c) => ({ name: `${c.name} wool`, mat: 'soft', tex: { kind: 'wool', hsl: c.hsl } }),
  stained_glass: (c) => ({ name: `${c.name} stained glass`, mat: 'glass', glass: true, tex: { kind: 'glass', hsl: c.hsl } }),
  terracotta: (c) => ({ name: `${c.name} terracotta`, mat: 'stone', tex: { kind: 'solid', hsl: [c.hsl[0], c.hsl[1] * 0.45, c.hsl[2] * 0.75 + 12] } }),
  concrete: (c) => ({ name: `${c.name} concrete`, mat: 'stone', tex: { kind: 'solid', hsl: c.hsl, noise: 3 } }),
};

// Every catalogue block, as BLOCKS entries.
//   mat:     what it's made of, for breaking (see player/interaction.js breakTime)
//   tex:     how it's drawn; cutout: leaves, with holes; glass: see-through; glow: gives off light
//   model:   drawn with its own shape instead of a cube ('sapling', 'fence', 'torch', 'lantern')
//   natural: listed under Nature in the inventory
export function catalogBlocks() {
  const B = {};
  for (const w of WOODS) {
    B[woodBlock(w, 'log')] = { name: `${w.name} log`, mat: 'wood', wood: w.id, natural: true, tex: { kind: 'log', bark: w.bark, ring: w.ring, marks: w.marks, barkStyle: w.barkStyle } };
    B[woodBlock(w, 'planks')] = { name: `${w.name} planks`, mat: 'wood', wood: w.id, tex: { kind: 'planks', hsl: w.planks, style: w.style } };
    B[`stripped_${w.id}_log`] = { name: `Stripped ${w.name.toLowerCase()} log`, mat: 'wood', wood: w.id, tex: { kind: 'stripped', hsl: w.ring } };
    B[`${w.id}_leaves`] = { name: `${w.name} leaves`, mat: 'plant', natural: true, cutout: true, tex: { kind: 'leaves', hsl: w.leaves, blossom: w.blossom, shape: w.leafShape } };
    B[`${w.id}_sapling`] = { name: `${w.name} sapling`, mat: 'plant', natural: true, model: 'sapling', solid: false, wood: w.id, leaves: w.leaves };
    B[`${w.id}_fence`] = { name: `${w.name} fence`, mat: 'wood', model: 'fence', wood: w.id, tex: { kind: 'planks', hsl: w.planks, style: w.style } };
    B[`${w.id}_bookshelf`] = { name: `${w.name} bookshelf`, mat: 'wood', tex: { kind: 'bookshelf', hsl: w.planks } };
  }
  for (const s of STONES) {
    const tier = s.id === 'blackstone' || s.id === 'deepslate' ? 2 : 1;
    B[s.id] = { name: s.name, mat: 'stone', tier, natural: true, tex: { kind: 'stone', hsl: s.hsl, spots: s.spots, style: s.style } };
    B[`polished_${s.id}`] = { name: `Polished ${s.name.toLowerCase()}`, mat: 'stone', tier, tex: { kind: 'polished', hsl: s.hsl, spots: s.spots, style: s.style } };
    B[`${s.id}_bricks`] = { name: `${s.name} bricks`, mat: 'stone', tier, tex: { kind: 'bricks', hsl: s.hsl, spots: s.spots, style: s.style, layout: s.layout } };
  }
  for (const g of GROUND) B[g.id] = { natural: true, ...g };
  for (const g of STONE_EXTRAS) B[g.id] = { mat: 'stone', ...g };
  for (const m of METAL_BLOCKS) B[m.id] = { ...m };
  for (const o of ORE_BLOCKS) B[o.id] = { name: o.name, mat: 'stone', natural: true, tier: o.tier || 1, tex: { kind: 'ore', nugget: o.nugget } };
  for (const c of COLOURS) for (const [kind, make] of Object.entries(COLOUR_KINDS)) B[colourBlock(c, kind)] = { colour: c.id, ...make(c) };
  Object.assign(B, METAL_STATIONS);
  B.torch = { name: 'Torch', mat: 'soft', model: 'torch', solid: false, glow: 0xffb050 };
  B.lantern = { name: 'Lantern', mat: 'soft', model: 'lantern', solid: false, glow: 0xffc070 };
  return B;
}
