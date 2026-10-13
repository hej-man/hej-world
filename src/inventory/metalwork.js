import { BLOCKS } from '../world/blocks.js';

// ---------------------------------------------------------------------------
// Metalwork: melting, casting and forging. Called from defineItems in items.js.
//
//   1. Melt: at a smelter, ore (or ingots, or the metals for an alloy) goes into a fired clay
//      crucible with fuel. This takes time (`time` in seconds): the smelter works on it while you do
//      other things, and hands you the crucible of molten metal when it's done. Titanium only melts
//      with bellows next to the smelter blowing air into the fire.
//   2. Cast: pour the molten metal into a clay mould (kept for next time) to get ingots, plates or
//      rods, and the empty crucible back.
//   3. Forge: at an anvil, with the smelter's fire close by to heat the metal, hammer ingots into
//      plates and rods, and plates and rods into tools, armour and hardware. The smith's hammer is
//      needed but not used up.
//
// Steel (iron with coal) and rose gold (copper with gold) are alloys made in the crucible.
// ---------------------------------------------------------------------------

// Each metal: colours light to dark (icons, blocks), where its molten metal comes from, how long it
// takes to melt, and what its tools are like (tier: pickaxe strength; speed: how fast they dig).
export const METALS = [
  { id: 'iron', name: 'Iron', ore: 'iron_ore', colors: ['#f4f5f7', '#b7bbc2', '#6f747c'], melt: 8 },
  { id: 'copper', name: 'Copper', ore: 'raw_copper', colors: ['#ffc8a0', '#d27a48', '#7e3f1e'], melt: 6 },
  { id: 'gold', name: 'Gold', ore: 'raw_gold', colors: ['#fff6c0', '#f0c63a', '#9a700c'], melt: 6 },
  { id: 'steel', name: 'Steel', alloy: { iron_ingot: 3, coal: 2 }, colors: ['#dfe6ee', '#8a96a6', '#46505e'], melt: 10, tool: { tier: 3, speed: 3.6, hit: 2 } },
  { id: 'titanium', name: 'Titanium', ore: 'raw_titanium', blast: true, colors: ['#f2f0fa', '#b8b4cc', '#6c6884'], melt: 14, tool: { tier: 4, speed: 5, hit: 3 } },
  { id: 'rose_gold', name: 'Rose gold', alloy: { copper_ingot: 2, gold_ingot: 1 }, colors: ['#ffe2d8', '#e8a090', '#9a5a50'], melt: 8, tool: { tier: 2, speed: 4.2, hit: 0 } },
];
export const METAL = Object.fromEntries(METALS.map((m) => [m.id, m]));

// what forging needs: an anvil and a smelter within reach, and the smith's hammer (kept)
export const FORGE = ['anvil', 'smelter'], HAMMER = ['smith_hammer'];

export function defineMetalwork(reg, RECIPES) {
  const R = (out, inp, extra = {}) => RECIPES.push({ out, in: inp, ...extra });

  // the stations and tools
  reg('smelter', 'Smelter', null, { place: 'smelter', draw: 'station:smelter' });
  reg('bellows', 'Bellows', null, { place: 'bellows', draw: 'station:bellows' });
  reg('anvil', 'Anvil', null, { place: 'anvil', draw: 'station:anvil' });
  reg('smith_hammer', "Smith's hammer", null, { draw: 'hammer', tool: 'hammer', head: 0x8a96a6, maxStack: 1, damage: 6, cat: 'tools' });
  reg('tongs', 'Tongs', null, { draw: 'tongs', maxStack: 1, cat: 'tools' });
  reg('crucible', 'Crucible', null, { draw: 'crucible', maxStack: 16 });
  for (const [k, Name] of [['ingot', 'Ingot'], ['plate', 'Plate'], ['rod', 'Rod']]) reg(`${k}_mould`, `${Name} mould`, null, { draw: `mould:${k}`, maxStack: 1 });
  R('smelter', { clay_bricks: 4, furnace: 1, iron_ingot: 2 }, { at: 'workbench' });
  R('bellows', { leather: 3, '#planks': 3, iron_ingot: 1 }, { at: 'workbench' });
  R('anvil', { iron_block: 1, iron_ingot: 4 }, { at: 'workbench' });
  R('smith_hammer', { iron_ingot: 2, stick: 1 }, { at: 'workbench' });
  R('tongs', { iron_ingot: 2 }, { at: 'workbench' });
  R('crucible', { clay: 3, '#fuel': 1 }, { at: 'furnace' });
  for (const k of ['ingot', 'plate', 'rod']) R(`${k}_mould`, { clay: 2, sand: 2, '#fuel': 1 }, { at: 'furnace' });

  reg('raw_titanium', 'Raw titanium', null, { draw: 'raw:titanium', place: 'raw_titanium', cat: 'materials' });

  for (const m of METALS) {
    const ingot = `${m.id}_ingot`, molten = `molten_${m.id}`, plate = `${m.id}_plate`, rod = `${m.id}_rod`;
    if (!['iron', 'copper', 'gold'].includes(m.id)) reg(ingot, `${m.name} ingot`, null, { draw: `ingot:${m.id}` });
    reg(molten, `Molten ${m.name.toLowerCase()}`, null, { draw: `molten:${m.id}`, maxStack: 4, hint: 'Pour it into a mould at the smelter: ingots, plates or rods' });
    reg(plate, `${m.name} plate`, null, { draw: `plate:${m.id}` });
    reg(rod, `${m.name} rod`, null, { draw: `rod:${m.id}` });
    // melt
    const fuel = m.blast ? { coal: 3 } : { '#fuel': 2 };
    const at = m.blast ? ['smelter', 'bellows'] : 'smelter';
    if (m.ore) R(molten, { crucible: 1, [m.ore]: 3, ...fuel }, { at, time: m.melt });
    if (m.alloy) R(molten, { crucible: 1, ...m.alloy, '#fuel': 1 }, { at, time: m.melt });
    if (m.ore) R(molten, { crucible: 1, [ingot]: 3, '#fuel': 1 }, { at, time: Math.round(m.melt * 0.6) }); // melting ingots down again
    // cast
    R(ingot, { [molten]: 1 }, { n: 3, at: 'smelter', keep: ['ingot_mould'], also: { crucible: 1 } });
    R(plate, { [molten]: 1 }, { n: 2, at: 'smelter', keep: ['plate_mould'], also: { crucible: 1 } });
    R(rod, { [molten]: 1 }, { n: 4, at: 'smelter', keep: ['rod_mould'], also: { crucible: 1 } });
    // forge
    R(plate, { [ingot]: 2 }, { at: FORGE, keep: HAMMER });
    R(rod, { [ingot]: 1 }, { n: 2, at: FORGE, keep: HAMMER });
  }

  // forged tools for the new metals (their armour is in armour.js) (iron, copper and gold ones are made at the workbench)
  for (const m of METALS.filter((m) => m.tool)) {
    const { tier, speed, hit } = m.tool, plate = `${m.id}_plate`, rod = `${m.id}_rod`, badge = m.colors[1];
    const tool = (kind, Name, dmg, inp) => {
      reg(`${m.id}_${kind}`, `${m.name} ${Name}`, null, { draw: `tool:${kind}:${m.id}`, tool: kind, tier, speed, badge, head: parseInt(badge.slice(1), 16), maxStack: 1, damage: dmg + hit });
      R(`${m.id}_${kind}`, inp, { at: FORGE, keep: HAMMER });
    };
    tool('pickaxe', 'pickaxe', 4, { [plate]: 2, [rod]: 1, stick: 1 });
    tool('axe', 'axe', 5, { [plate]: 2, [rod]: 1, stick: 1 });
    tool('shovel', 'shovel', 4, { [plate]: 1, [rod]: 1, stick: 1 });
    tool('sword', 'sword', 9, { [plate]: 2, [rod]: 1 });
  }

  // hardware and metal building blocks
  reg('nails', 'Nails', null, { draw: 'nails' });
  reg('chain', 'Chain', null, { draw: 'chain' });
  reg('gear', 'Gear', null, { draw: 'gear' });
  R('nails', { iron_rod: 1 }, { n: 12, at: FORGE, keep: HAMMER });
  R('chain', { iron_rod: 2 }, { n: 3, at: FORGE, keep: ['smith_hammer', 'tongs'] });
  R('gear', { steel_plate: 1 }, { n: 2, at: FORGE, keep: HAMMER });
  const block = (id, extra = {}) => reg(id, BLOCKS[id].name, null, { place: id, block: true, ...extra });
  for (const id of ['steel_block', 'titanium_block', 'rose_gold_block']) {
    const ingot = id.replace('_block', '_ingot');
    block(id);
    R(id, { [ingot]: 9 }, { at: 'workbench' });
    R(ingot, { [id]: 1 }, { n: 9 });
  }
  for (const id of ['iron_bars', 'steel_grate', 'steel_treadplate', 'titanium_plating', 'rose_gold_tiles', 'copper_panels', 'iron_chain', 'riveted_iron', 'gear_block']) block(id);
  R('iron_bars', { iron_rod: 3 }, { n: 8, at: FORGE, keep: HAMMER });
  R('steel_grate', { steel_rod: 3 }, { n: 6, at: FORGE, keep: HAMMER });
  R('steel_treadplate', { steel_plate: 2 }, { n: 4, at: FORGE, keep: HAMMER });
  R('titanium_plating', { titanium_plate: 2 }, { n: 4, at: FORGE, keep: HAMMER });
  R('rose_gold_tiles', { rose_gold_plate: 2 }, { n: 4, at: FORGE, keep: HAMMER });
  R('copper_panels', { copper_plate: 2 }, { n: 4, at: FORGE, keep: HAMMER });
  R('iron_chain', { chain: 4 }, { n: 2, at: 'workbench' });
  R('riveted_iron', { iron_plate: 2, nails: 4 }, { n: 4, at: 'workbench' });
  R('gear_block', { gear: 4, steel_plate: 1 }, { n: 2, at: 'workbench' });
}
