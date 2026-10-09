// Quick check: the game loads without errors, the area around the start is ready at once and the
// rest of the map streams in, and the title screen and gameplay render.
import { openGame } from './harness.mjs';

const { log, check, shot, finish } = await openGame({ loadAll: false, start: null });
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
await shot('game');
await finish();
