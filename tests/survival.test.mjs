// Survival checks: fall damage on slopes, lava, thirst and drinking, iron and the furnace,
// block shapes, bears, the character's animation, weather, and the menu.
import { installHelpers, openGame } from './harness.mjs';

const { page, log, check, shot, finish } = await openGame();
await installHelpers(page);
const R = {};
R.world = await log('world', () => ({
  ...window.__game.worldStats(),
  terrain: window.__game.terrainProgress(),
  ground: window.__game.player.onGround,
}));

R.start = await log('start', () => ({
  state: window.__game.state(),
  stats: { ...window.__game.stats },
  max: window.__game.MAX_HEALTH,
  kit: game.slots.filter(Boolean).map((s) => s.id + 'x' + s.n),
}));

// 1. falling onto a steep slope must still hurt
R.slopeFall = await log('slopeFall', async () => {
  const G = window.__game,
    T = G.terrain(),
    p0 = G.player.position.clone();
  let spot = null;
  for (let r = 10; r < 400 && !spot; r += 4)
    for (let a = 0; a < 24 && !spot; a++) {
      const x = p0.x + Math.cos((a / 24) * 6.283) * r,
        z = p0.z + Math.sin((a / 24) * 6.283) * r,
        g = G.groundAt(x, z);
      if (g && g.face.normal.y > 0.35 && g.face.normal.y < 0.6 && g.point.y > T.waterAt(x, z) + 2) spot = g.point.clone();
    }
  if (!spot) return 'no slope';
  heal();
  const res = {};
  for (const h of [8, 30]) {
    heal();
    put(spot.x, spot.y + h, spot.z);
    await waitGame(h > 10 ? 3 : 2);
    res['drop' + h] = Math.round(G.MAX_HEALTH - G.stats.health);
  }
  heal();
  put(spot.x, spot.y + 30, spot.z);
  G.setCreative(false);
  return res;
});

// 2. lava flows exist; standing in one burns, and you keep burning after leaving until it wears off
R.lava = await log('lava', async () => {
  const G = window.__game,
    fl = G.lavaFlows;
  if (!fl.length) return 'no flows';
  const pt = fl[0].pts[Math.floor(fl[0].pts.length / 2)];
  heal();
  put(pt.x, pt.y + 0.1, pt.z);
  await waitGame(1);
  const inside = { hp: Math.round(G.stats.health), burning: +G.burning().toFixed(1), lavaHere: G.lavaAt(pt.x, pt.y + 0.2, pt.z) };
  const f = flatSpot();
  heal();
  put(f.x, f.y, f.z);
  await waitGame(1);
  const after = Math.round(G.MAX_HEALTH - G.stats.health);
  await waitGame(2.5);
  return { flows: fl.length, inside, damageWhileBurning: after, burningLeft: +G.burning().toFixed(1) };
});
await page.evaluate(() => {
  const G = window.__game,
    pt = G.lavaFlows[0].pts[2];
  G.setCreative(true);
  G.player.position.set(pt.x + 10, pt.y + 8, pt.z + 10);
  G.setView(true);
  G.setLook(Math.atan2(10, 10), -0.5);
});
await page.waitForTimeout(500);
await shot('lava');
await page.evaluate(() => window.__game.setCreative(false));

// 3. thirst: drink a water bottle, get an empty bottle back
R.drink = await log('drink', async () => {
  const G = window.__game,
    f = flatSpot();
  put(f.x, f.y, f.z);
  heal();
  G.stats.thirst = 20;
  const i = game.slots.findIndex((s) => s && s.id === 'water_bottle');
  G.selectSlot(i);
  const b0 = count('water_bottle');
  G.useItem(null);
  return { thirst: Math.round(G.stats.thirst), bottles: count('water_bottle') - b0, empty: count('bottle') };
});

// 4. iron: furnace smelting, iron pickaxe, mining speed tiers
R.iron = await log('iron', async () => {
  const G = window.__game,
    R = G.RECIPES,
    find = (id) => R.find((r) => r.out === id),
    p = G.player.position;
  const fx = Math.floor(p.x) + 2,
    fz = Math.floor(p.z),
    fy = Math.floor(G.groundAt(fx + 0.5, fz + 0.5).point.y);
  G.placeBlock('workbench', fx, fy, fz);
  G.placeBlock('furnace', fx, fy, fz + 2);
  game.addItem('iron_ore', 6);
  game.addItem('log', 3);
  game.addItem('stick', 2);
  G.craft(find('iron_ingot'), true);
  const ingots = count('iron_ingot');
  G.craft(find('iron_pickaxe'), false);
  // the furnace's other recipes
  game.addItem('stone', 2);
  game.addItem('sand', 3);
  game.addItem('log', 2);
  G.craft(
    R.find((r) => r.out === 'smooth_stone'),
    false,
  );
  G.craft(
    R.find((r) => r.out === 'glass' && r.at === 'furnace'),
    false,
  );
  const smooth = count('smooth_stone'),
    glass = count('glass');
  const stoneHand = G.breakTime('stone', null),
    ironHand = G.breakTime('iron', null);
  return { ingots, ironPick: count('iron_pickaxe'), smooth, glass, stoneHand, ironHand };
});
await page.evaluate(() => {
  const G = window.__game;
  G.setView(true);
  G.setLook(G.player.facing + 2.4, -0.35);
});
await page.waitForTimeout(400);
await shot('furnace');

// 5. shapes: build one of each, then walk up a slope
R.shapes = await log('shapes', async () => {
  const G = window.__game,
    f = flatSpot();
  put(f.x, f.y, f.z);
  const bx = Math.floor(f.x) - 4,
    bz = Math.floor(f.z) - 4,
    by = Math.floor(f.y);
  const out = {};
  ['block', 'slab', 'slope', 'stairs', 'prism', 'pillar'].forEach((sh, i) => {
    out[sh] = G.placeBlock(i % 2 ? 'planks' : 'stone_bricks', bx + i * 2, by, bz, sh);
  });
  // stand on top of the slope and on the slab
  put(bx + 4.5, by + 3, bz + 0.5);
  await waitGame(1);
  out.onSlope = +(G.player.position.y - 1.45 - by).toFixed(2);
  put(bx + 2.5, by + 3, bz + 0.5);
  await waitGame(1);
  out.onSlab = +(G.player.position.y - 1.45 - by).toFixed(2);
  put(bx + 5, by + 1, bz + 4);
  G.setView(true);
  G.setLook(Math.PI, -0.3);
  out.groups = Object.keys(G.blockGroups).length;
  // every shape is drawn with rounded edges (many more triangles than a sharp box's 12)
  out.tris = Object.fromEntries(
    Object.entries(G.blockGroups).map(([k, g]) => [k.split('|')[1], g.meshes[0].geometry.attributes.position.count / 3]),
  );
  return out;
});
await page.waitForTimeout(400);
await shot('shapes');

// 5a. no water under land: caves below sea level under a hill are dry, the open sea isn't
R.dryCaves = await log('dryCaves', () => {
  const T = window.__game.terrain();
  let hill = null,
    sea = null;
  for (let x = 20; x < 1000 && !(hill && sea); x += 16)
    for (let z = 20; z < 1000 && !(hill && sea); z += 16) {
      const h = T.surfaceHeight(x, z);
      if (!hill && h > 40) hill = { x, z, h, water: T.waterAt(x, z) };
      if (!sea && T.waterAt(x, z) > h + 1) sea = { x, z, h, water: T.waterAt(x, z) };
    }
  return { hill, sea };
});

// 5b. dirt is placed as a block in the chosen shape, and a player buried in the ground is lifted out
R.dirt = await log('dirt', async () => {
  const G = window.__game,
    f = flatSpot();
  put(f.x, f.y, f.z);
  await waitGame(0.3);
  game.addItem('dirt', 4);
  const slot = game.slots.findIndex((s) => s && s.id === 'dirt'),
    tmp = game.slots[1];
  game.slots[1] = game.slots[slot];
  game.slots[slot] = tmp;
  G.selectSlot(1);
  G.setShape('slope');
  aimAt(f.x + 2.5, f.y, f.z + 0.3);
  await waitGame(0.2);
  const before = G.blocks.size;
  G.useItem(G.target());
  const placed = [...G.blocks.values()].filter((b) => b.type === 'dirt').map((b) => b.shape);
  G.setShape('block');
  // bury the player 3 m under the ground and see that they come back up
  put(f.x, f.y - 3, f.z);
  await waitGame(0.5);
  const feet = G.player.position.y - 1.45;
  return { added: G.blocks.size - before, placed, feetAboveGround: +(feet - f.y).toFixed(2) };
});

// 5c. liquids: poured water spreads and drains, lava flows slower and hardens where water meets it,
// and creative spawners make animals
R.liquids = await log('liquids', async () => {
  const G = window.__game,
    f = flatSpot();
  put(f.x, f.y, f.z);
  const x = Math.floor(f.x) + 6,
    z = Math.floor(f.z),
    y = Math.floor(G.groundAt(x + 0.5, z + 0.5).point.y) + 1;
  G.addSource('water', x, y, z);
  await waitGame(2.5);
  const water = [...G.fluids.values()].filter((c) => c.type === 'water').length;
  G.addSource('lava', x + 3, y + 1, z);
  await waitGame(3);
  const lava = [...G.fluids.values()].filter((c) => c.type === 'lava').length;
  const stone = [...G.blocks.values()].filter((b) => b.type === 'stone' && Math.abs(b.x - x) < 8 && Math.abs(b.z - z) < 8).length;
  return { water, lava, stone };
});
R.spawn = await log('spawn', async () => {
  const G = window.__game,
    before = G.animals.length;
  G.setCreative(true);
  game.addItem('spawn_cow', 1);
  const slot = game.slots.findIndex((s) => s && s.id === 'spawn_cow'),
    tmp = game.slots[1];
  game.slots[1] = game.slots[slot];
  game.slots[slot] = tmp;
  G.selectSlot(1);
  const p = G.player.position;
  aimAt(p.x + 3, p.y - 1.45, p.z + 0.5);
  await waitGame(0.2);
  G.useItem(G.target());
  G.setCreative(false);
  return { added: G.animals.length - before, last: G.animals[G.animals.length - 1]?.kind };
});

// 6. a bear attacks
R.bear = await log('bear', async () => {
  const G = window.__game,
    p = G.player.position;
  heal();
  const b = G.spawnAnimal('bear', p.x + 2, p.z);
  await waitGame(3);
  const hp = Math.round(G.stats.health);
  return { mode: b && b.mode, hpLost: G.MAX_HEALTH - hp };
});
await page.evaluate(() => {
  const G = window.__game;
  heal();
  G.setLook(G.player.facing, -0.25);
});
await page.waitForTimeout(300);
await shot('bear');
await page.evaluate(() => {
  for (const a of window.__game.animals) if (['bear', 'wolf', 'boar'].includes(a.kind)) a.hp = -1;
  heal();
});

// 7. character: walking, running and swinging
R.character = await log('character', async () => {
  const G = window.__game,
    C = G.character.userData;
  G.setView(true);
  G.keys.KeyW = true;
  await waitGame(1.2);
  const walkKnee = +C.legs[0].knee.rotation.x.toFixed(2),
    walkHip = +C.legs[0].hip.rotation.x.toFixed(2);
  G.keys.KeyW = false;
  G.mouse.left = true;
  await waitGame(0.4);
  const swing = +C.arms[1].shoulder.rotation.x.toFixed(2);
  G.mouse.left = false;
  return { walkKnee, walkHip, swing, held: C.heldId };
});
await page.evaluate(() => {
  const G = window.__game;
  G.keys.KeyW = true;
  G.setLook(G.player.facing + 2.2, -0.2);
});
await page.waitForTimeout(700);
await shot('character');
await page.evaluate(() => {
  window.__game.keys.KeyW = false;
});

// 8. weather: a storm
R.storm = await log('storm', async () => {
  const G = window.__game;
  G.setWeather('storm', true);
  await waitGame(2);
  return { state: G.weather.state, rain: +G.weather.rain.toFixed(2), wet: G.weather.covered };
});
await page.evaluate(() => {
  const G = window.__game;
  G.setLook(G.player.facing + 2.2, 0.05);
});
await page.waitForTimeout(400);
await shot('storm');

// 9. back to the main menu and continue
R.menu = await log('menu', async () => {
  const G = window.__game;
  G.toMainMenu();
  await new Promise((r) => setTimeout(r, 300));
  const st = G.state();
  document.getElementById('btn-continue').click();
  await new Promise((r) => setTimeout(r, 300));
  return { inMenu: st, after: G.state() };
});

check('starting kit has food and water', R.start?.kit?.length >= 4, R.start);
check('falling onto a slope hurts', R.slopeFall?.drop8 > 0 && R.slopeFall.drop30 > R.slopeFall.drop8, R.slopeFall);
check('lava flows burn', R.lava?.flows > 0 && R.lava.inside?.burning > 0 && R.lava.damageWhileBurning > 0, R.lava);
check('drinking restores thirst', R.drink?.thirst > 50, R.drink);
check('smelting iron and an iron pickaxe', R.iron?.ingots > 0 && R.iron.ironPick === 1, R.iron);
check('every block shape places', R.shapes && ['block', 'slab', 'slope', 'stairs', 'prism', 'pillar'].every((k) => R.shapes[k]), R.shapes);
check('every shape has rounded edges', R.shapes?.tris && Object.values(R.shapes.tris).every((n) => n > 60), R.shapes?.tris);
check('furnace makes smooth stone and glass', R.iron?.smooth > 0 && R.iron.glass > 0, R.iron);
check('dirt places as a shaped block', R.dirt?.added === 1 && R.dirt.placed.includes('slope'), R.dirt);
check('no water under hills', R.dryCaves?.hill?.water < -100 && R.dryCaves.sea?.water > 0, R.dryCaves);
check('poured water spreads', R.liquids?.water > 5, R.liquids);
check('water hardens lava into stone', R.liquids?.stone > 0, R.liquids);
check('creative spawner makes an animal', R.spawn?.added === 1 && R.spawn.last === 'cow', R.spawn);
check('a buried player is lifted out', R.dirt?.feetAboveGround > -0.5, R.dirt);
check('bears chase and bite', R.bear?.hpLost > 0, R.bear);
check('weather turns stormy', R.storm?.state === 'storm', R.storm);
check('main menu and continue', R.menu?.inMenu === 'menu' && R.menu.after === 'playing', R.menu);
await finish();
