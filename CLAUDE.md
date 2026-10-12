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
  for the whole 1024 m map; ground is where the value is > 0. The ground you see is 1 m blocks
  read from it (`src/terrain/voxels.js`): a cell is ground where the interpolated field is > 0 at
  its centre, unless `edits` says the player dug or filled it. An empty cell on ground with higher
  ground beside it holds a slope (`slopeDir`); dug cells never do. `blockMesh` (`mesh.js`) meshes
  32 × 32 m chunks with greedy face merging; `fillSolid` is the fast column-at-a-time version of
  `solidCell` and must give the same answer.
- Anything that asks "is this ground?" uses `solidCell`/`solidAt`, never `sampleField > 0`
  directly: the two differ near the surface.
- Chunks are generated lazily in three stages: density filled → floating rock removed (needs the
  3 × 3 neighbours filled) → meshed (needs the 3 × 3 neighbours cleaned). `loadArea(x, z, r)`
  does it synchronously; `streamChunks(x, z, ms)` runs every frame, nearest the camera first.
- Anything placed on the ground must wait for it: use `whenLoaded(x0, x1, z0, z1, fn)`
  (vegetation tiles and lava flows do). Lava flows are registered first, so plants near a
  volcano are placed after the flows they must avoid. `isLoaded(x, z)` tells whether ground
  there is real; `groundAt` returns null and `sampleField` returns air where it isn't yet.
- Vegetation tiles (96 m) each have their own seeded random sequence, so a tile is the same no
  matter when it loads. Keep per-area randomness seeded per area for the same reason.
- `editCell`/`editTerrain` (`query.js`) change cells, not the field, and rebuild only meshed
  chunks; unmeshed ones pick up the edit when they're built. `hitCell` turns a ray hit into the
  cell it hit (the slope itself, when it hit one).
- Tests: the ground steps, so a flat cell can sit on the edge of a drop. Tests that aim a few
  metres away use `flatSpot(d)`, which also needs the ground level for `d` metres toward +x.

## Blocks and fluids

- `src/world/shapes.js` builds each buildable shape with rounded edges (shrink, then grow back by
  a sphere); collision uses the sharp shape. `src/world/blocks.js` places blocks on the 1 m grid.
  Blocks the world builds itself (ice spikes, `src/world/ice-spikes.js`) go in per-area groups
  (`placeBlock(..., { tag, turn })`, then `sealBlocks`) that are frustum culled, drawn as sharp
  shapes in the distance and hidden beyond the far trees; blocks nobody can see wait in `hidden`
  and are placed when a neighbour is removed. Instanced groups double in size when full.
- `src/world/fluids.js` runs water and lava on the same grid as an amount per cell (`m`, 1 = a
  full block, a little more when squeezed from above). Each step moves amounts down, then evens
  them out sideways, then pushes extra up; fluid is never created or lost except through rain,
  sun, steam, hardening and running into natural water. Cells with `nat` are the river or a lake
  reaching into a hole and stay full while the natural level covers them. Wake nearby cells
  (`wake`/`wakeArea`) after anything changes the grid (placing, breaking, digging), or the fluid
  won't notice. `takeFluid`/`poolAmount` are for buckets.
- `src/world/hydro.js` moves the natural levels: `terrainFns.live.sea` (river and sea), each lake's
  `offset`, each volcano's `lavaY`. Use `waterAt` for anything at play time and `baseWaterAt` for
  generation (vegetation, grass, which stone is where), or the world would change as it rains.
- Block families (woods, stones, colours…) are data in `src/world/block-catalog.js`; textures are
  drawn from each block's `tex` description by `block-textures.js`. Their items and recipes are in
  `src/inventory/catalog-items.js`. Recipe ingredients starting with `#` are item groups (tags).
- Metalwork items and recipes are in `src/inventory/metalwork.js`. A recipe can take several
  stations (`at: [...]`, all within reach), keep tools or moulds (`keep`), give extra things back
  (`also`) and take time (`time`): timed recipes are jobs queued on the nearest station
  (`startJob`/`updateJobs`/`collectStation` in `items.js`). Item pictures come from `draw` specs
  drawn by `icons.js`.
- Glowing blocks share four point lights, moved to the nearest ones each frame: adding or removing
  lights recompiles every shader, so the count must stay fixed.
- `terrainFns.waterAt` returns a very low value where the ground is well above the water, so
  caves under land stay dry; the water shader discards there too.

## Biomes and caves

- `src/terrain/biomes.js`: biomes sit at points in (temperature, humidity); `biomeWeights` blends
  the nearest. Ground, grass, trees, plants, animals and land shape all read from it.
- Caves (`caveDistance` in `generate.js`): cheese caverns, pillars and spaghetti tunnels. Under
  low ground they must stay above sea level, or the sea would show through their roofs.

## Tests

`tests/harness.mjs` starts the dev server on a random port, opens the game in headless Chromium,
serves three.js from `node_modules` when installed, blocks Poly Haven downloads, switches
rendering off (software WebGL takes seconds per frame on this map) and turns it back on only for
`shot()`. It calls `__game.loadAll()` by default so the whole map exists. Tests are plain
scripts; `check(label, ok, detail)` records a pass or failure and the exit code reflects it.
