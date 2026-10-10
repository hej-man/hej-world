# Terrain World: notes for working on the code

A browser 3D survival sandbox: Three.js r160 + three-mesh-bvh, plain ES modules, no build step to
run it. See README.md for features, controls and the code layout table.

## Running and checking

- `npm start` serves the folder on http://localhost:8000. Modules don't load from `file://`, so
  always go through a server (or `python3 -m http.server`).
- `npm run lint` (ESLint 9 flat config, `eslint.config.js`) should report nothing.
- `npm test` is the quick headless check (about a minute plus load time); `npm run test:all`
  adds the gameplay, survival and behaviour scripts (several minutes, headless rendering is slow).
- `tests/behaviour.test.mjs` covers animal AI, swimming, weather changes, dirty water and stack
  size; it's the quickest way to check those.
- `npm run build` writes `dist/index.html`, one file with the code inlined, that opens from disk.
- Prettier formats tests, scripts and docs. `src/` is deliberately excluded: the game code is
  hand-formatted in a dense style. Match the surrounding style there instead of reformatting.

## Conventions

- **Shared mutable state** goes in `src/state.js` (`state.yaw`, `state.creative`, …). ES module
  imports are read-only bindings, so a `let` exported from one module can't be assigned from
  another. Constants and things only one module changes stay in that module.
- Modules import each other freely, including in cycles. That's fine as long as top-level code
  only touches imports _inside functions_ (called after everything has loaded). Don't run
  top-level code that reads another module's exports at import time unless that module is
  clearly loaded first (config, noise, state, render/scene).
- Comments explain why or what something is for, in plain words. Keep them short.
- Test and debug hooks are on `window.__game` (end of `src/main.js`); add to it rather than
  reaching into modules from tests. `window.game` is the public item API.

## Terrain and chunks (`src/world/world.js`)

- One global density field (`terrainField`, Float32Array of 513 × 65 × 513 points, 2 m apart)
  for the whole 1024 m map; ground is where the value is > 0. Surface Nets meshes it per chunk
  (16 × 16 cells = 32 m).
- Chunks are generated lazily in three stages: density filled → floating rock removed (needs the
  3 × 3 neighbours filled) → meshed (needs the 3 × 3 neighbours cleaned). `loadArea(x, z, r)`
  does it synchronously; `streamChunks(x, z, ms)` runs every frame, nearest the camera first.
- Anything placed on the ground must wait for it: use `whenLoaded(x0, x1, z0, z1, fn)`
  (vegetation tiles and lava flows do). Lava flows are registered first, so plants near a
  volcano are placed after the flows they must avoid. `isLoaded(x, z)` tells whether ground
  there is real; `groundAt` returns null and `sampleField` returns air where it isn't yet.
- Vegetation tiles (96 m) each have their own seeded random sequence, so a tile is the same no
  matter when it loads. Keep per-area randomness seeded per area for the same reason.
- `editTerrain` changes the field and rebuilds only meshed chunks; unmeshed ones pick up the
  edit when they're built.

## Blocks and fluids

- `src/world/shapes.js` builds each buildable shape with rounded edges (shrink, then grow back by
  a sphere); collision uses the sharp shape. `src/world/blocks.js` places blocks on the 1 m grid.
- `src/world/fluids.js` runs water and lava on the same grid: levels 1–8, sources at 8, falls then
  spreads, drains when unfed. Wake nearby cells (`wake`/`wakeArea`) after anything changes the
  grid (placing, breaking, digging), or the fluid won't notice.
- `terrainFns.waterAt` returns a very low value where the ground is well above the water, so
  caves under land stay dry; the water shader discards there too.

## Tests

`tests/harness.mjs` starts the dev server on a random port, opens the game in headless Chromium,
serves three.js from `node_modules` when installed, blocks Poly Haven downloads, switches
rendering off (software WebGL takes seconds per frame on this map) and turns it back on only for
`shot()`. It calls `__game.loadAll()` by default so the whole map exists. Tests are plain
scripts; `check(label, ok, detail)` records a pass or failure and the exit code reflects it.
