// Core gameplay: chopping, crafting, digging, building, block collision, animals, combat,
// eating, creative flight, underwater, and how fast a dig rebuilds the terrain.
import { installHelpers, openGame } from './harness.mjs';

const { page, log, check, shot, finish } = await openGame();
await installHelpers(page);
const R = {};
R.world = await log('world', () => ({
  ...window.__game.worldStats(),
  terrain: window.__game.terrainProgress(),
  ground: window.__game.player.onGround,
}));

// 1. chop the nearest tree by hand
R.tree = await log('tree', async () => {
  const G = window.__game,
    p = G.player.position;
  const trees = G.targets()
    .filter((t) => t.kind === 'tree')
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  let best = null;
  for (const tg of trees.slice(0, 20))
    if (standNear(tg.x, tg.z, 1.6)) {
      best = { target: tg };
      break;
    }
  if (!best) return 'no tree found';
  const tg = best.target;
  // any kind of log (each tree gives its own wood)
  const logs = () => game.slots.reduce((n, s) => n + (s && game.ITEMS[s.id]?.tags?.includes('logs') ? s.count : 0), 0);
  const before = logs();
  G.mouse.left = false;
  aimAt(tg.x, tg.y + 1.0, tg.z);
  await waitGame(0.1);
  const aimed = G.target()?.kind;
  // hold the button until the tree comes down (or 10 s of game time)
  G.mouse.left = true;
  for (let i = 0; i < 50 && logs() === before; i++) await waitGame(0.2);
  G.mouse.left = false;
  return { aimed, species: tg.species, logsBefore: before, logs: logs(), sticks: count('stick'), apples: count('apple') };
});

// 2. craft: planks, sticks, workbench; place workbench; craft a wooden pickaxe
R.craft = await log('craft', async () => {
  const G = window.__game,
    R = G.RECIPES,
    find = (id) => R.find((r) => r.out === id);
  game.addItem('log', 6); // top up so the test doesn't depend on tree size
  G.craft(find('planks'), true);
  const planks = count('planks');
  G.craft(find('stick'), false);
  G.craft(find('workbench'), false);
  const pickBefore = count('wood_pickaxe');
  G.craft(find('wood_pickaxe'), false); // should fail: no workbench nearby
  const pickWithout = count('wood_pickaxe');
  // place the workbench on the ground in front
  const slot = game.slots.findIndex((s) => s && s.id === 'workbench');
  game.slots[0] && slot !== 0 && ([game.slots[0], game.slots[slot]] = [game.slots[slot], game.slots[0]]);
  if (slot !== 0 && !game.slots[0]) {
    game.slots[0] = game.slots[slot];
    game.slots[slot] = null;
  }
  G.selectSlot(0);
  let t = null;
  const built = () => [...G.blocks.values()].filter((b) => !b.group.split('|')[2]); // not the world's own (ice spikes)
  for (let a = 0; a < 12 && built().length === 0; a++) {
    G.setView(false);
    G.setLook((a / 12) * 6.283, -0.9);
    await waitGame(0.1);
    t = G.target();
    if (t && t.kind === 'terrain') G.useItem(t);
  }
  const placed = built().map((b) => b.type);
  G.craft(find('wood_pickaxe'), false);
  return { planks, sticks: count('stick'), pickBefore, pickWithout, placed, target: t?.kind, pickaxe: count('wood_pickaxe') };
});
await page.evaluate(() => window.__game.setView(true));
await page.waitForTimeout(400);
await shot('workbench');

// 3. inventory + crafting panel screenshot
await page.evaluate(() => {
  game.addItem('stone', 5);
  game.addItem('raw_meat', 3);
  game.addItem('crystal', 3);
  game.addItem('feather', 1);
  window.__game.setInventoryOpen(true);
});
await page.waitForTimeout(300);
await shot('inventory');
await page.evaluate(() => window.__game.setInventoryOpen(false));

// 4. dig ground: hand on dirt, and stone needs a pickaxe
R.dig = await log('dig', async () => {
  const G = window.__game;
  G.setView(false);
  G.setLook(G.player.facing + 1.5, -1.2);
  await waitGame(0.2);
  const t = G.target();
  const dirtBefore = count('dirt') + count('sand') + count('stone');
  G.selectSlot(8);
  await holdLeft(1200);
  const t2 = G.target();
  return {
    kind: t?.kind,
    name: document.getElementById('target').textContent,
    gained: count('dirt') + count('sand') + count('stone') - dirtBefore,
    after: t2 && t2.point && t2.point.toArray().map((v) => +v.toFixed(1)),
    before: t && t.point && t.point.toArray().map((v) => +v.toFixed(1)),
  };
});

// 5. build: place 3 stone blocks and some dirt
R.build = await log('build', async () => {
  const G = window.__game;
  game.addItem('stone', 3);
  const slot = game.slots.findIndex((s) => s && s.id === 'stone');
  const tmp = game.slots[1];
  game.slots[1] = game.slots[slot];
  game.slots[slot] = tmp;
  G.selectSlot(1);
  const f = flatSpot(3.5); // on level ground (not beside a slope, which can put the cell in front inside you)
  put(f.x, f.y, f.z);
  await waitGame(0.3);
  aimAt(f.x + 2, f.y, f.z + 0.4);
  await waitGame(0.1);
  const aimed = G.target() && {
    kind: G.target().kind,
    point: G.target()
      .point?.toArray()
      .map((v) => +v.toFixed(2)),
    normal: G.target()
      .normal?.toArray()
      .map((v) => +v.toFixed(2)),
  };
  for (let i = 0; i < 3; i++) {
    G.useItem(G.target());
    await waitGame(0.15);
  }
  return {
    aimed,
    feet: G.player.position.toArray().map((v, i) => +(v - (i === 1 ? 1.45 : 0)).toFixed(2)),
    blocks: [...G.blocks.values()].filter((b) => !b.group.split('|')[2]).map((b) => b.type),
    stoneLeft: count('stone'),
  };
});
await page.evaluate(() => window.__game.setView(true));
await page.waitForTimeout(300);
await shot('build');

// 6. stand on a placed block (collision)
R.standOnBlock = await log('standOnBlock', async () => {
  const G = window.__game;
  const b = [...G.blocks.values()].find((b) => b.type === 'stone');
  if (!b) return 'no block';
  G.player.position.set(b.x + 0.5, b.y + 1 + 1.45 + 0.5, b.z + 0.5);
  G.player.velocity.set(0, 0, 0);
  await waitGame(1.0);
  return { feet: +(G.player.position.y - 1.4).toFixed(2), blockTop: b.y + 1, ground: G.player.onGround };
});

// 7. animals: counts and a close-up of each species
R.animals = await log('animals', () => {
  const G = window.__game,
    by = {};
  for (const a of G.animals) by[a.kind] = (by[a.kind] || 0) + 1;
  return by;
});
await page.evaluate(() => {
  const G = window.__game,
    T = G.terrain(),
    L = T.ledge;
  const kinds = ['cow', 'pig', 'sheep', 'chicken', 'deer', 'rabbit', 'wolf'];
  standNear(L.x, L.z, 0.01);
  const p = G.player.position;
  G.setCreative(true);
  kinds.forEach((k, i) => G.spawnAnimal(k, p.x - 3 + i * 1.6, p.z - 6));
  G.setView(false);
  G.setLook(0, -0.25);
});
await page.waitForTimeout(400);
await shot('animals');

// 8. attack: kill a chicken with a sword
R.attack = await log('attack', async () => {
  const G = window.__game;
  G.setCreative(false);
  game.addItem('stone_sword', 1);
  const slot = game.slots.findIndex((s) => s && s.id === 'stone_sword');
  const tmp = game.slots[2];
  game.slots[2] = game.slots[slot];
  game.slots[slot] = tmp;
  G.selectSlot(2);
  const c = G.animals
    .filter((a) => a.kind === 'chicken')
    .sort(
      (a, b) =>
        Math.hypot(a.x - G.player.position.x, a.z - G.player.position.z) - Math.hypot(b.x - G.player.position.x, b.z - G.player.position.z),
    )[0];
  standNear(c.x, c.z, 1.8);
  const meat0 = count('raw_meat'),
    feathers0 = count('feather');
  for (let i = 0; i < 10 && G.animals.includes(c); i++) {
    aimAt(c.x, c.y + 0.4, c.z);
    G.mouse.left = true;
    await waitGame(0.3);
  }
  G.mouse.left = false;
  return { killed: !G.animals.includes(c), meat: count('raw_meat') - meat0, feathers: count('feather') - feathers0 };
});

// 9. eat, health/hunger/mana, wolf bite
R.survival = await log('survival', async () => {
  const G = window.__game;
  G.stats.hunger = 50;
  const slot = game.slots.findIndex((s) => s && s.id === 'raw_meat');
  const tmp = game.slots[3];
  game.slots[3] = game.slots[slot];
  game.slots[slot] = tmp;
  G.selectSlot(3);
  G.useItem(null);
  const hungerAfter = Math.round(G.stats.hunger);
  const h0 = G.stats.health;
  G.damagePlayer(20, 'test');
  const h1 = G.stats.health;
  // wolf next to the player should bite
  const p = G.player.position;
  const w = G.spawnAnimal('wolf', p.x + 1.2, p.z);
  await waitGame(2.5);
  return { hungerAfter, h0, h1, afterWolf: Math.round(G.stats.health), wolfMode: w && w.mode };
});
await page.evaluate(() => {
  for (const a of [...window.__game.animals]) if (a.kind === 'wolf') a.hp = -1;
});

// 10. creative flight
R.creative = await log('creative', async () => {
  const G = window.__game;
  G.setCreative(true);
  const y0 = G.player.position.y;
  G.keys.Space = true;
  await waitGame(1.0);
  G.keys.Space = false;
  const y1 = G.player.position.y;
  await waitGame(0.6);
  const y2 = G.player.position.y;
  G.setInventoryOpen(true);
  return {
    y0: +y0.toFixed(1),
    up: +(y1 - y0).toFixed(1),
    hover: +(y2 - y1).toFixed(2),
    palette: document.getElementById('palette').children.length,
  };
});
await page.waitForTimeout(200);
await shot('creative');
await page.evaluate(() => {
  window.__game.setInventoryOpen(false);
  window.__game.setCreative(false);
});

// 11. underwater
R.underwater = await log('underwater', async () => {
  const G = window.__game,
    T = G.terrain();
  let x = 60,
    z = T.riverZ(60);
  for (let i = 10; i < 250; i += 3) {
    const g = G.groundAt(i, T.riverZ(i));
    if (g && g.point.y < game.WORLD.waterLevel - 4) {
      x = i;
      z = T.riverZ(i);
      break;
    }
  }
  G.setCreative(true);
  G.player.position.set(x, game.WORLD.waterLevel - 2.2, z);
  G.player.velocity.set(0, 0, 0);
  G.setView(false);
  G.setLook(1.2, 0.15);
  await waitGame(0.3);
  return { under: G.underwater(), fog: document.getElementById('underwater').style.display };
});
await shot('underwater');
await page.evaluate(() => {
  const G = window.__game;
  G.setLook(1.2, 0.9);
});
await page.waitForTimeout(200);
await shot('underwater_up');

// 12. dig speed: chunk rebuild timing
R.rebuild = await log('rebuild', () => {
  const G = window.__game,
    p = G.player.position;
  const t0 = performance.now();
  const n = G.editTerrain({ x: p.x + 6, y: p.y - 3, z: p.z }, 1.9, false);
  return { flipped: n, ms: Math.round(performance.now() - t0) };
});

check('player starts on the ground', R.world?.ground);
check('chopping a tree gives logs', R.tree?.logs > 0, R.tree);
check('crafting makes a wooden pickaxe', R.craft?.pickaxe === 1, R.craft);
check('digging gives ground material', R.dig?.gained > 0, R.dig);
check('placing stone blocks', R.build?.blocks?.filter((b) => b === 'stone').length >= 1, R.build);
// the blocks may stack, so the player can be on top of a higher one
const onTop = R.standOnBlock && R.standOnBlock.feet - R.standOnBlock.blockTop;
check('standing on a block', R.standOnBlock?.ground && onTop > -0.2 && Math.abs(onTop - Math.round(onTop)) < 0.2, R.standOnBlock);
check('animals of several kinds', R.animals && Object.keys(R.animals).length >= 6, R.animals);
check('wolves and bears roam the forests', R.animals?.wolf > 0 && R.animals?.bear > 0, R.animals);
check('killing a chicken drops meat', R.attack?.killed && R.attack.meat > 0, R.attack);
check('creative flight goes up', R.creative?.up > 1, R.creative);
check('underwater detected', R.underwater?.under, R.underwater);
check('a dig rebuilds terrain quickly', R.rebuild?.flipped > 0 && R.rebuild.ms < 400, R.rebuild);
await finish();
