// Behaviour: animal AI (steering round walls, giving up, keeping out of poured lava), swimming
// (floating, the crawl and treading water) and natural weather changes.
import { installHelpers, openGame } from './harness.mjs';

const { page, log, check, shot, finish } = await openGame();
await installHelpers(page);
await page.evaluate(() => {
  const G = window.__game;
  G.setTestMode(true);
  // park the wild animals far away so they don't join in
  for (const a of G.animals) {
    a.x = 5;
    a.z = 5;
  }
  const s = flatSpot();
  put(s.x, s.y, s.z);
});
const R = {};

// 1. a wolf on the far side of a wall goes around it and bites
R.wall = await log('wall', async () => {
  const G = window.__game,
    p = G.player.position;
  heal();
  const bx = Math.floor(p.x),
    by = Math.floor(p.y - 1.45),
    bz = Math.floor(p.z);
  for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 3; dy++) G.placeBlock('stone', bx + 3, by + dy, bz + dz);
  const w = G.spawnAnimal('wolf', bx + 7.5, bz + 0.5);
  const h0 = G.stats.health;
  let t = 0,
    bitten = false;
  while (t < 15 && !bitten) {
    await waitGame(0.5);
    t += 0.5;
    bitten = G.stats.health < h0;
  }
  heal();
  const res = { bitten, seconds: t, wolf: w && { dx: +(w.x - p.x).toFixed(1), dz: +(w.z - p.z).toFixed(1), mode: w.mode } };
  w.x = 5;
  w.z = 5;
  return res;
});

// 2. a wolf that can't reach you up on blocks gives up instead of pacing below forever
R.tower = await log('tower', async () => {
  const G = window.__game,
    p = G.player.position;
  heal();
  const bx = Math.floor(p.x) - 6,
    bz = Math.floor(p.z) - 6,
    by = Math.floor(G.groundAt(bx + 0.5, bz + 0.5).point.y);
  for (let dy = 0; dy < 3; dy++) G.placeBlock('stone', bx, by + dy, bz);
  put(bx + 0.5, by + 3, bz + 0.5);
  await waitGame(0.5);
  const w = G.spawnAnimal('wolf', bx + 6.5, bz + 0.5);
  const h0 = G.stats.health;
  let chased = false;
  for (let i = 0; i < 30 && !(w.calm > 0); i++) {
    await waitGame(0.5);
    chased ||= w.mode === 'chase';
  }
  const res = { chased, hurt: G.stats.health < h0, mode: w.mode, calm: +w.calm.toFixed(1), dy: +(p.y - 1.4 - w.y).toFixed(1) };
  w.x = 5;
  w.z = 5;
  return res;
});

// 3. a cow walking toward poured lava stops at its edge (a thin film of water it would just walk through)
R.water = await log('water', async () => {
  const G = window.__game,
    s = flatSpot(),
    x = Math.floor(s.x),
    z = Math.floor(s.z);
  put(x + 0.5, s.y, z - 10);
  for (let up = 0; up < 3; up++) {
    const g = G.groundAt(x + 0.5, z + 12.5);
    if (G.addSource('lava', x, Math.floor(g.point.y + 0.3) + up, z + 12)) break;
  }
  await waitGame(3);
  const c = G.spawnAnimal('cow', x + 0.5, z + 0.5);
  let entered = false;
  for (let i = 0; i < 24; i++) {
    c.mode = 'walk';
    c.angle = Math.PI; // walk toward +z, at the lava
    c.timer = 5;
    await waitGame(0.5);
    if (G.fluidAt(c.x, c.y + 0.2, c.z)) entered = true;
  }
  return { entered, cowZ: +(c.z - z).toFixed(1), cells: G.fluids.size };
});

// 4. swimming: float with the head out, a front crawl while moving, treading water when still
R.swim = await log('swim', async () => {
  const G = window.__game,
    T = G.terrain(),
    W = game.WORLD,
    C = G.character.userData;
  let x = 60,
    z = T.riverZ(60);
  for (let i = 10; i < 250; i += 3) {
    const g = G.groundAt(i, T.riverZ(i));
    if (g && g.point.y < W.waterLevel - 4) {
      x = i;
      z = T.riverZ(i);
      break;
    }
  }
  G.setView(true);
  G.player.position.set(x, W.waterLevel - 2.5 + 1.4, z);
  G.player.velocity.set(0, 0, 0);
  await waitGame(3);
  const level = T.waterAt(G.player.position.x, G.player.position.z);
  const floatDepth = +(level - (G.player.position.y - 1.4)).toFixed(2);
  const head = new G.player.position.constructor();
  C.head.getWorldPosition(head);
  const treadHead = +(head.y - level).toFixed(2),
    treadLean = +C.root.rotation.x.toFixed(2);
  // swim along the river, not into its bank (the banks are steps of ground blocks now)
  G.setLook(Math.atan2(-1, -(T.riverZ(x + 1) - z)), 0);
  G.keys.KeyW = true;
  let lo = 9,
    hi = -9,
    off = 0;
  for (let i = 0; i < 12; i++) {
    await waitGame(0.25);
    const a = C.arms[1].shoulder.rotation.x;
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
    const chest = new G.player.position.constructor();
    C.spine.getWorldPosition(chest);
    off = Math.max(off, Math.hypot(chest.x - G.player.position.x, chest.z - G.player.position.z));
  }
  const crawlLean = +C.root.rotation.x.toFixed(2);
  G.keys.KeyW = false;
  // Shift dives, back where it's deep
  G.player.position.set(x, level + 0.2, z);
  G.player.velocity.set(0, 0, 0);
  await waitGame(0.5);
  G.keys.ShiftLeft = true;
  await waitGame(1.5);
  G.keys.ShiftLeft = false;
  const dived = +(level - (G.player.position.y - 1.4)).toFixed(2);
  await waitGame(0.5);
  await new Promise((r) => setTimeout(r, 50));
  return { floatDepth, treadHead, treadLean, crawlLean, armSweep: +(hi - lo).toFixed(2), bodyOff: +off.toFixed(2), dived };
});
await shot('swim');
await page.evaluate(() => {
  const s = flatSpot();
  put(s.x, s.y, s.z);
});

// 5. weather: natural changes go one step at a time and build up slowly; K only works in creative
R.weather = await log('weather', async () => {
  const G = window.__game,
    order = ['clear', 'cloudy', 'rain', 'storm'];
  let jumps = 0;
  G.setWeather('clear', true);
  for (let i = 0; i < 200; i++) {
    const from = order.indexOf(G.weather.state);
    G.nextWeather();
    if (Math.abs(order.indexOf(G.weather.state) - from) !== 1) jumps++;
  }
  // from clear to rain: the clouds build before the rain starts
  G.setWeather('cloudy', true);
  G.setWeather('rain');
  G.updateWeather(5);
  const after5 = { cloud: +G.weather.cloud.toFixed(2), rain: +G.weather.rain.toFixed(2) };
  G.setWeather('clear', true);
  G.setCreative(false);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' }));
  const survivalK = G.weather.state;
  G.setCreative(true);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' }));
  const creativeK = G.weather.state;
  G.setCreative(false);
  G.setWeather('clear', true);
  return { jumps, after5, survivalK, creativeK };
});

// 6. dirty water makes you sick; a water filter (or boiling) purifies it
R.purify = await log('purify', async () => {
  const G = window.__game,
    p = G.player.position;
  heal();
  game.addItem('murky_water', 2);
  const slot = game.slots.findIndex((s) => s && s.id === 'murky_water');
  const tmp = game.slots[2];
  game.slots[2] = game.slots[slot];
  game.slots[slot] = tmp;
  G.selectSlot(2);
  G.stats.thirst = 50;
  const h0 = G.stats.health;
  G.useItem(null);
  const sick = +G.stats.sick.toFixed(1),
    t0 = G.stats.thirst;
  await waitGame(6);
  const drained = +(t0 - G.stats.thirst).toFixed(2),
    lost = +(h0 - G.stats.health).toFixed(1),
    bar = document.getElementById('water').classList.contains('sick');
  G.stats.sick = 0;
  heal();
  // filter the other bottle at a water filter
  G.placeBlock('purifier', Math.floor(p.x) + 2, Math.floor(p.y - 1.4), Math.floor(p.z));
  const r = G.RECIPES.find((x) => x.out === 'water_bottle' && x.at === 'purifier');
  const clean0 = count('water_bottle');
  G.craft(r, false);
  return { sick, drained, lost, bar, cleaned: count('water_bottle') - clean0, murky: count('murky_water') };
});
await shot('purifier');

// 7. stacks hold 100
R.stack = await log('stack', () => {
  const before = game.slots.filter((x) => x && x.id === 'sand').map((x) => x.count);
  game.removeItem('sand', count('sand'));
  game.addItem('sand', 150);
  const stacks = game.slots.filter((x) => x && x.id === 'sand').map((x) => x.count);
  return { before, stacks, bottle: game.ITEMS.bottle.maxStack, pickaxe: game.ITEMS.wood_pickaxe.maxStack };
});

// 8. tipping shapes: a pillar on its side lies along the way you look, a slab upside down sits on top
R.tilt = await log('tilt', () => {
  const G = window.__game,
    p = G.player.position,
    x = Math.floor(p.x) + 3,
    y = Math.floor(p.y) + 3,
    z = Math.floor(p.z) + 3;
  const size = (b) => {
    const o = b.obstacles[0];
    return [o.max.x - o.min.x, o.max.y - o.min.y, o.max.z - o.min.z].map((v) => +v.toFixed(2));
  };
  const at = (bx, by, bz) => [...G.blocks.values()].find((b) => b.x === bx && b.y === by && b.z === bz);
  G.setLook(Math.PI / 2, 0); // looking along -x
  G.placeBlock('stone', x, y, z, 'pillar', 1);
  G.placeBlock('stone', x, y, z + 2, 'slab', 2);
  G.placeBlock('stone', x, y, z + 4, 'pillar', 0);
  const slab = at(x, y, z + 2).obstacles[0];
  return { side: size(at(x, y, z)), up: size(at(x, y, z + 4)), slabBottom: +(slab.min.y - y).toFixed(2) };
});

// 9. standing on a block over a lava flow doesn't burn; stepping down into it does
R.overLava = await log('overLava', async () => {
  const G = window.__game,
    fl = G.lavaFlows[0],
    pt = fl.pts[Math.floor(fl.pts.length / 2)],
    x = Math.floor(pt.x),
    y = Math.floor(pt.y + 0.5),
    z = Math.floor(pt.z);
  heal();
  G.placeBlock('stone', x, y, z);
  put(x + 0.5, y + 1, z + 0.5);
  await waitGame(2);
  const onBlock = { burning: +G.burning().toFixed(1), hp: Math.round(G.stats.health), above: +(y + 1 - pt.y).toFixed(2) };
  put(pt.x + 0.3, pt.y, pt.z + 0.3);
  await waitGame(1);
  const inLava = +G.burning().toFixed(1);
  put(x + 0.5, y + 30, z + 0.5);
  G.setCreative(true);
  await waitGame(0.2);
  G.setCreative(false);
  const s = flatSpot();
  put(s.x, s.y, s.z);
  await waitGame(4);
  heal();
  return { onBlock, inLava };
});

check('a wolf goes around a wall to bite', R.wall?.bitten, R.wall);
check('a wolf gives up on a player it cannot reach', R.tower?.chased && !R.tower.hurt && R.tower.calm > 0, R.tower);
check('a cow stays out of poured lava', R.water && !R.water.entered && R.water.cells > 0, R.water);
check(
  'you float with your head out of the water',
  R.swim && R.swim.floatDepth > 1.25 && R.swim.floatDepth < 1.7 && R.swim.treadHead > -0.05,
  R.swim,
);
check('treading water upright, front crawl flat', R.swim && R.swim.treadLean > -0.4 && R.swim.crawlLean < -1.1, R.swim);
check('crawl arms go round, body stays on the player', R.swim && R.swim.armSweep > 3 && R.swim.bodyOff < 0.6, R.swim);
check('Shift dives', R.swim?.dived > 2, R.swim);
check('weather changes one step at a time', R.weather?.jumps === 0, R.weather);
check('rain waits for the clouds', R.weather && R.weather.after5.rain < 0.3, R.weather);
check('K sets the weather only in creative', R.weather?.survivalK === 'clear' && R.weather.creativeK === 'cloudy', R.weather);
check('murky water makes you sick', R.purify?.sick > 0 && R.purify.lost >= 3 && R.purify.bar, R.purify);
check('being sick drains thirst faster', R.purify?.drained > 2, R.purify);
check('a water filter purifies murky water', R.purify?.cleaned === 1 && R.purify.murky === 0, R.purify);
check('stacks hold 100 (tools 1)', R.stack?.stacks.join() === '100,50' && R.stack.bottle === 100 && R.stack.pickaxe === 1, R.stack);
check('a pillar on its side lies along the look', R.tilt?.side.join() === '1,0.6,0.6' && R.tilt.up.join() === '0.6,1,0.6', R.tilt);
check('an upside-down slab sits in the top half', R.tilt?.slabBottom === 0.5, R.tilt);
check('no burning on a block above lava', R.overLava?.onBlock.burning === 0 && R.overLava.inLava > 0, R.overLava);
await finish();
