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
  const stoneHand = G.breakTime('stone', null),
    ironHand = G.breakTime('iron', null);
  return { ingots, ironPick: count('iron_pickaxe'), stoneHand, ironHand };
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
  return out;
});
await page.waitForTimeout(400);
await shot('shapes');

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
check('bears chase and bite', R.bear?.hpLost > 0, R.bear);
check('weather turns stormy', R.storm?.state === 'storm', R.storm);
check('main menu and continue', R.menu?.inMenu === 'menu' && R.menu.after === 'playing', R.menu);
await finish();
