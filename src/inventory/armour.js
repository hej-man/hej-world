// ---------------------------------------------------------------------------
// Armour comes in four pieces you wear separately: a helmet, a breastplate, gauntlets and pants.
// Each piece takes off part of the damage you take; a whole set of one material adds up to that
// material's protection (leather 20%, up to titanium 48%). The diving helmet is a helmet that makes
// your air last three times as long underwater instead.
// ---------------------------------------------------------------------------
export const PIECES = ['helmet', 'breastplate', 'gauntlets', 'pants'];
export const PIECE_NAMES = { helmet: 'Helmet', breastplate: 'Breastplate', gauntlets: 'Gauntlets', pants: 'Pants' };
// how much of a set's protection each piece gives, and how many of the material it takes
const SHARE = { helmet: 0.2, breastplate: 0.4, gauntlets: 0.15, pants: 0.25 };
const COST = { helmet: 3, breastplate: 5, gauntlets: 2, pants: 4 };
const FORGED = { helmet: 2, breastplate: 4, gauntlets: 1, pants: 3 }; // plates, for forged metals

// [id, adjective for names, protection of a whole set, colour on the character, metal?]
export const ARMOUR_SETS = [
  ['leather', 'Leather', 0.2, 0x7a4a26, false],
  ['copper', 'Copper', 0.26, 0xc87a4a, true],
  ['gold', 'Golden', 0.28, 0xe8c040, true],
  ['iron', 'Iron', 0.34, 0xa9afb7, true],
  ['rose_gold', 'Rose gold', 0.32, 0xe8a090, true],
  ['steel', 'Steel', 0.4, 0x8a96a6, true],
  ['titanium', 'Titanium', 0.48, 0xb8b4cc, true],
];

// Registers every piece of every set, and their recipes: leather, copper, gold and iron at a
// workbench from leather or ingots; rose gold, steel and titanium forged from plates at an anvil.
export function defineArmour(reg, R, forge, hammer) {
  for (const [mat, Adj, total, look, metal] of ARMOUR_SETS) {
    for (const piece of PIECES) {
      const id = `${mat}_${piece}`, armour = +(total * SHARE[piece]).toFixed(3);
      reg(id, `${Adj} ${PIECE_NAMES[piece].toLowerCase()}`, null, { draw: `armour:${mat}:${piece}`, wear: piece, armour, look, metal, maxStack: 1 });
      if (mat === 'leather') R(id, { leather: COST[piece] }, { at: 'workbench' });
      else if (['copper', 'gold', 'iron'].includes(mat)) R(id, { [`${mat}_ingot`]: COST[piece], ...(piece === 'breastplate' || piece === 'gauntlets' ? { leather: 1 } : {}) }, { at: 'workbench' });
      else R(id, { [`${mat}_plate`]: FORGED[piece], ...(piece === 'breastplate' || piece === 'gauntlets' ? { leather: 1 } : {}) }, { at: forge, keep: hammer });
    }
  }
  reg('diving_helmet', 'Diving helmet', null, { draw: 'armour:diving:helmet', wear: 'helmet', armour: 0.02, air: 3, look: 0xc8903a, metal: true, maxStack: 1 });
  R('diving_helmet', { copper_ingot: 4, glass: 2, leather: 1 }, { at: 'workbench' });
}

// Total protection of what's worn (0..1), and the slots.
export function armourOf(worn, ITEMS) {
  let a = 0;
  for (const p of PIECES) if (worn[p]) a += ITEMS[worn[p]]?.armour || 0;
  return Math.min(0.9, a);
}
