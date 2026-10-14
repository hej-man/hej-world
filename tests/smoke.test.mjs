// Quick check: the game loads without errors, the area around the start is ready at once and the
// rest of the map streams in, and the title screen and gameplay render.
import { openGame } from './harness.mjs';

const { log, check, shot, finish, renderOn } = await openGame({ loadAll: false, start: null });
const start = await log('start', () => ({ ...window.__game.worldStats(), terrain: window.__game.terrainProgress() }));
check('only the start area is generated up front', start?.terrain.meshed > 0 && start.terrain.meshed < start.terrain.total, start?.terrain);
await shot('menu');

const play = await log('play', async () => {
  const G = window.__game;
  G.setTestMode(true);
  G.startGame('survival');
  // let a second of game time pass (headless frames are slow, so wait on game time, not the clock)
  const t0 = G.time();
  await new Promise((res) => {
    const f = () => (G.time() - t0 >= 1 ? res() : requestAnimationFrame(f));
    f();
  });
  return {
    state: G.state(),
    ground: G.player.onGround,
    slots: game.slots.filter(Boolean).length,
    grass: G.grassPatches.size,
    health: G.stats.health,
  };
});
check('playing, standing on the ground', play?.state === 'playing' && play.ground, play);
check('grass grows around the start', play?.grass > 0, play);

const all = await log('loadAll', () => {
  const G = window.__game,
    t0 = performance.now();
  G.loadAll();
  const { trees, bushes, rocks } = G.vegStats;
  return {
    ms: Math.round(performance.now() - t0),
    terrain: G.terrainProgress(),
    trees,
    bushes,
    rocks,
    animals: G.animals.length,
    lavaFlows: G.lavaFlows.length,
  };
});
check('the whole map generates', all?.terrain.meshed === all?.terrain.total, all);
check('forests, bushes and rocks', all?.trees > 1000 && all.bushes > 100 && all.rocks > 100, all);
check('animals fill the map', all?.animals > 100, all);
check('volcanoes have lava flows', all?.lavaFlows > 0, all);
// stop drawing the whole map between checks: software-GL frames of it pile up and run the browser
// out of memory (the picture at the end still draws its two frames)
await renderOn(false);

// ice spikes are built of blocks; taking one out of a spike shows the ice behind it, not a hole
const spikes = await log('iceSpikes', () => {
  const G = window.__game,
    ice = [...G.blocks.values()].filter((b) => b.type.includes('ice'));
  const shapes = {};
  for (const b of ice) shapes[b.shape] = (shapes[b.shape] || 0) + 1;
  // a seen block with a hidden one next to it
  const [hk] = [...G.hiddenBlocks.entries()].find(([, h]) => G.blocks.has(`${h[1] + 1},${h[2]},${h[3]}`)) || [];
  const [hx, hy, hz] = hk ? hk.split(',').map(Number) : [];
  const taken = hk && G.removeBlock(`${hx + 1},${hy},${hz}`);
  return {
    spikes: G.vegStats.spikes,
    blocks: ice.length,
    hidden: G.hiddenBlocks.size,
    shapes,
    took: taken?.type,
    revealed: hk ? G.blocks.has(hk) : null,
  };
});
check(
  'ice spikes are made of ice blocks and slopes',
  spikes?.spikes > 20 && spikes.shapes.block > spikes.spikes * 5 && spikes.shapes.slope > spikes.spikes,
  spikes,
);
check('mining into a spike uncovers the ice inside', spikes?.revealed === true, spikes);
await shot('game');
await finish();
