# Terrain World

A 3D survival sandbox in the browser: procedurally generated mountains, a river valley, lakes,
big caves and volcanoes with lava running down their sides, dense forests, wandering animals and
predators, and changing weather. Walk around in first or third person, chop trees, dig and add
ground, mine stone, iron and crystal, smelt iron, craft tools and armour, and build with blocks
in several shapes, while keeping an eye on your health, hunger, thirst and mana. A creative mode
is there for testing.

Built with **Three.js** (r160) and **three-mesh-bvh** for collision, both loaded from the
jsDelivr CDN. No build step: the game is plain JavaScript modules in `src/`. Ground and bark use
photo-scanned textures from [Poly Haven](https://polyhaven.com) (CC0, public domain), lit by a
sky with soft shadows and haze.

## Run it

The game is split into JavaScript modules, which browsers only load from a web server (not from
a page opened straight from disk). With [Node.js](https://nodejs.org) installed:

    npm start                          # then open http://localhost:8000

No `npm install` is needed just to play. Without Node, any static server works:

    python3 -m http.server 8000        # then open http://localhost:8000

Needs internet for the three.js CDN. Add `?seed=1234` to the URL to get a specific world; the
current seed is shown top-left. Add `?quality=low` on a slower computer or laptop (smaller
textures and shadow maps, lower resolution, fewer leaves).

To get a single file you can open without a server (or send to someone), run `npm install`
once and then `npm run build`: it writes `dist/index.html` with all the code inlined.

### Textures

The game downloads its ground textures (grass, forest floor, dirt, sand, rock, snow, bark) from
Poly Haven when it starts, which takes a few seconds; until they arrive, and whenever there is
no internet, it uses generated stand-ins. A message at the bottom says which you got. To keep
copies in the project instead:

    npm run textures                   # or: sh scripts/get-textures.sh  (about 10 MB, 1K JPGs)

They go into `assets/textures` (not committed to git) with a `manifest.json` listing them, and
the game uses them whenever it's served. Which Poly Haven texture each layer uses is listed in
`TEX_LAYERS` in `src/terrain/textures.js`; each layer has backups in case one is renamed.

## Controls

| Key               | Action                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Main menu         | Continue, new survival or creative world, a random or typed seed, quality and sound       |
| W A S D / arrows  | Move (relative to where you look)                                                         |
| Shift             | Sprint / dive when swimming                                                               |
| Space             | Jump (from walkable ground) / swim up in deep water                                       |
| Mouse             | Look around                                                                               |
| Tab (or V)        | Cycle the view: first person, behind you, in front of you                                 |
| Z                 | Cycle third-person camera distance                                                        |
| Left mouse (hold) | Break / harvest what you aim at, or attack an animal                                      |
| Right mouse       | Place a block, eat, drink, cast, wear; on a workbench, campfire or furnace, open crafting |
| 1–9, mouse wheel  | Select hotbar slot                                                                        |
| E (or I)          | Open / close the inventory (C opens it on the crafting page)                              |
| G                 | Toggle creative mode (fly with Space / Shift)                                             |
| F                 | Toggle the lantern (useful in caves)                                                      |
| B                 | Cycle the building shape: block, slab, slope, stairs, roof prism, pillar                  |
| T                 | Tip the next block: upright, on its side, upside down (it also turns the way you look)    |
| K                 | Change the weather in creative mode (clear, cloudy, rain, storm)                          |
| M                 | Sound on / off                                                                            |
| R                 | Respawn at the cave mouth                                                                 |
| Esc               | Pause (resume or go back to the main menu)                                                |

Every key except 1–9 and Esc can be changed under Keys… in the pause or main menu.

A slot holds up to 100 of an item (tools, weapons, armour and buckets one each). In the
inventory: click to pick up and drop a stack, right-click to split a stack or place one
item, shift-click to move a stack between the hotbar and the backpack. Click a recipe on the
right to craft it once, shift-click to craft as many as you can.

## Survival

What's new in each round is in [CHANGELOG.md](CHANGELOG.md): biomes, ten woods, 200 new blocks,
caves and more.

- **Breaking.** Hold the left mouse button on something within reach (5.5 m). Trees give logs,
  sticks and sometimes apples; bushes give berries and a stick; boulders give stone. The ground
  can be dug: dirt and sand by hand (faster with a shovel), stone and cave crystal only with a
  pickaxe. Iron ore (orange nuggets with metal flecks in dark rock in cliffs and caves, and rusty
  boulders studded with orange nuggets) needs a stone pickaxe or better. Axes chop wood faster;
  iron tools are the fastest. Placed blocks break back into their item.
- **Building.** Right-click with a block (dirt, sand, log, planks, stone, stone bricks, smooth
  stone, glass, wool, workbench, campfire, furnace) to place it on the face you aim at; a white
  outline shows where it goes. Press B to choose the shape: a full block, half-height slab, slope,
  stairs, roof prism or thin pillar. Slopes, stairs, prisms and furnaces turn to face the way you
  look, and you can walk up slopes and stairs. Every shape has rounded edges. Dirt and sand are
  placed as blocks too, in any shape.
- **Crafting.** Basic recipes work anywhere; tools, bricks, armour and the wand need a
  workbench within 4.5 m, cooking, glass and the mana tonic need a campfire, and smelting iron
  and smooth stone need a furnace (which also makes glass and cooks meat in batches).

  | Item                                  | Recipe                                                          |
  | ------------------------------------- | --------------------------------------------------------------- |
  | Planks ×4                             | 1 log                                                           |
  | Sticks ×4                             | 2 planks                                                        |
  | Workbench                             | 4 planks                                                        |
  | Campfire                              | 3 logs, 2 sticks                                                |
  | Wooden pickaxe / axe / shovel / sword | planks + sticks, at a workbench                                 |
  | Stone pickaxe / axe / shovel / sword  | stone + sticks, at a workbench (faster, harder hitting)         |
  | Stone bricks ×4                       | 4 stone, at a workbench                                         |
  | Leather armour                        | 5 leather, at a workbench (35% less damage)                     |
  | Furnace                               | 8 stone, at a workbench                                         |
  | Iron ingot ×2                         | 2 iron ore, 1 log, at a furnace                                 |
  | Smooth stone ×2                       | 2 stone, 1 log, at a furnace                                    |
  | Glass ×3                              | 3 sand, 1 log, at a furnace                                     |
  | Cooked meat ×3                        | 3 raw meat, 1 log, at a furnace                                 |
  | Iron pickaxe / axe / shovel / sword   | iron ingots + sticks, at a workbench (fastest, hardest hitting) |
  | Iron armour                           | 6 iron ingots, 2 leather, at a workbench (60% less damage)      |
  | Bucket                                | 3 iron ingots, at a workbench                                   |
  | Bottle ×2                             | 1 glass, at a workbench                                         |
  | Water filter                          | 4 planks, 3 sand, 1 glass, at a workbench                       |
  | Clean water                           | 1 murky water at a water filter, or + 1 stick at a campfire     |
  | Clean water ×3                        | 3 murky water, 1 log, at a furnace                              |
  | Crystal wand                          | 1 stick, 3 crystal, 1 feather, at a workbench                   |
  | Cooked meat                           | 1 raw meat, at a campfire                                       |
  | Glass                                 | 2 sand, at a campfire                                           |
  | Mana tonic                            | 1 crystal, 2 berries, at a campfire                             |
  | Bandage ×2                            | 2 wool                                                          |
  | Bandage                               | 3 silk                                                          |

  "Log" and "planks" mean any kind of wood, and the log burned at a furnace can be any fuel (logs,
  planks or coal). The hundreds of recipes for the newer blocks are easiest to find with the
  crafting page's search box and categories.

- **Biomes.** Plains, forests, birch, dark and autumn forests, cherry groves, taigas, redwood
  forests, snowy taigas and plains, ice spikes, deserts, savannas, mesas and jungles, each with its
  own ground, trees, plants and animals (the table is in CHANGELOG.md).
- **Caves** are huge: open caverns with pillars and long winding tunnels reach down near the
  bedrock under hills, with pockets of granite, marble, tuff and other stones, and coal, copper,
  iron and gold ore.
- **Animals.** Cows, pigs, sheep and chickens graze in meadows; deer and rabbits live in forests
  and fields. Deer and rabbits run when you get close, others run once hit. Predators attack:
  wolves hunt in packs of two to four, bears roam the forests and hit very hard, boars charge if
  you come close, and cave spiders lurk in caves. Animals drop raw meat, leather, wool, feathers
  and silk. Herds are topped back up over time, away from you. Herd animals drift back toward
  their herd, everything steers around walls and keeps out of poured water and lava, and a predator
  that can't get to you (you're up on blocks, or it makes no headway for a few seconds) gives up
  for a while.
- **Health, hunger, thirst, mana.** You have 150 health. Hunger and thirst drain over time
  (thirst faster when sprinting or near a volcano); at zero you start losing health, and when
  fed and watered you heal. You start with bread, apples, cooked meat and three bottles of clean
  water. Right-click on a lake or the river to drink, or with an empty bottle to fill it with
  murky water. Unpurified water makes you sick for a while (up to two minutes): thirst drains three
  times as fast, you lose health every couple of seconds and don't heal, and the thirst bar turns
  green. Purify murky water at a water filter (4 planks, 3 sand, 1 glass at a workbench), boil it
  at a campfire (with a stick) or a furnace (three at a time with a log). Falls of more
  than about 5 m hurt, also when you land on a slope. Lava burns: standing in it costs 24 health
  a second, and you keep burning for a few seconds after you step out unless you jump into water.
  Mana refills over time and powers the crystal wand's bolts. When you die you respawn at the
  cave and keep your inventory.
- **Water and lava flow.** Right-click water (or poured water) with a bucket to fill it, or a
  lava flow or crater; right-click with a full bucket to pour it. Poured fluid falls and spreads
  cell by cell (lava slower and not as far) and drains away when its source is gone. Dig a hole
  next to the sea or a lake and the water runs in. Where water meets lava, the lava turns to
  stone. Caves under land stay dry.
- **Weather** changes on its own, one step at a time: clear skies cloud over, rain only starts
  once the clouds have gathered, a thunderstorm eases back to rain, and each change builds up over
  a minute or so. It snows instead on high mountains. Rain darkens and wets the ground. In
  creative mode K steps through the weather by hand.
- **Swimming.** In deep water you float with your head out; Space swims up and Shift dives. You
  swim a front crawl when moving and tread water when still.
- **Creative mode** (G): fly, no damage or hunger, instant breaking without tools, placing
  doesn't use up items, and the inventory shows every item to take stacks from (click it again
  while holding a stack to throw that stack away). It also has a spawner for every animal:
  right-click the ground with one to make that animal appear there.

## Settings

The `WORLD` and `PLAYER` objects at the top of the script hold the main knobs:

- `WORLD.size` – map width/depth in metres (default 1024, which takes several seconds to
  generate; 256 takes about one second).
- `WORLD.height` – vertical extent (default 128 m; peaks reach ~110 m).
- `WORLD.voxel` – metres between terrain samples. Bigger means coarser ground and faster generation.
- `WORLD.treeSpacing` – smaller means denser forests.
- `PLAYER.maxSlopeDeg` – slopes steeper than this can't be stood on, walked up or jumped from.
- `PLAYER.reach`, `PLAYER.flySpeed` – how far you can break/place, and creative flying speed.
- `SPECIES` (further down) – each animal's health, speed, drops and how many live on the map.
- `RECIPES` and `defineItems()` – add or change items and recipes.

## Adding items from the console

The inventory is exposed as `window.game`:

```js
game.registerItem({ id: 'stone', name: 'Stone', color: '#8a8580' }); // colour swatch icon
game.registerItem({ id: 'apple', name: 'Apple', icon: '🍎', maxStack: 16 }); // emoji icon
game.addItem('stone', 10); // returns how many didn't fit
game.removeItem('stone', 3); // true if enough were removed
game.countItem('stone');
game.getSelectedItem(); // stack in the selected hotbar slot, or null
```

## How it works

- **Terrain** is a 3D density field sampled every 2 m over 1024 × 128 × 1024 m:
  - domain-warped fractal noise for rolling land,
  - eroded-looking ridged multifractal mountains rising away from the valley, with crags and
    overhangs from 3D noise, rock strata on cliffs and snow above ~85 m,
  - a winding river valley carved below the water line, with beaches,
  - lakes in the rolling land, each with its own water level and a muddy shore,
  - volcanoes: concave cones with a crater, a glowing lava lake, three or four lava streams
    flowing down the slopes, and a smoke plume,
  - iron ore veins in the rock,
  - large worm caves (sealed under at least 5 m of ground except at scattered cave mouths),
    huge caverns with crystals, and one guaranteed tunnel into a big cavern starting at a flat
    ledge on the valley side, where you spawn,
  - a flood fill (per chunk, over vertical runs of rock) that removes floating rock.
- **Chunks.** The map is 32 × 32 chunks of 32 m. Only those around the start are made before
  you can play (about 2 s); the rest are generated a few milliseconds per frame, nearest the
  camera first, so the far distance fills in over the first minute (the HUD shows `terrain %`
  until it's done). Trees, lava flows and animals are added as the ground under them appears.
  If you outrun the generation, the ground around you is made immediately (a short pause).
  The density field for the whole map is kept in memory (about 70 MB), so a much bigger map
  would need it stored per chunk instead.
- **Meshing** uses Surface Nets in 32 × 32 m chunks. Vertex normals come from the gradient of
  the density field, so the ground is smoothly rounded and chunk borders don't show. Each
  vertex also stores how much grass, forest floor, dirt and sand covers it (from height, biome
  and noise). The collider and the render mesh share one indexed geometry with a BVH for
  physics. Digging or adding ground edits the density field and rebuilds only the chunks it
  touches (a few milliseconds).
- **Texturing**: seven photo texture layers (colour, normal, roughness and ambient occlusion at
  1024 × 1024) are packed into two texture arrays, so the terrain shader needs only two texture
  samplers. The shader blends rock onto steep slopes and snow onto high ground, breaks up the
  borders between layers with noise, projects every texture from three sides (triplanar) so
  cliffs aren't stretched, adds large-scale colour variation to hide repetition, darkens wet
  ground at the waterline, turns volcano rock to basalt and makes lava veins, crater rims and
  cave crystals glow.
- **Lighting**: a sky dome (horizon haze to deep blue, with a sun glow) is pre-filtered once
  into an environment map that lights everything from the whole sky (image-based lighting).
  The sun casts cascaded shadows: a sharp 2048² map for the nearest ~55 m and a coarser one out
  to 220 m, faded into each other. Caves get almost no sky light. ACES tone mapping.
- **Fog** is height fog applied to every material: thick in the valleys and thinner with
  altitude, plus light haze at any height, warmer towards the sun, fading into the sky's
  horizon colour so distant hills melt into it.
- **Vegetation**: forests of pine, oak and birch placed from a forest-density map, plus bushes
  and boulders. Leaves are clumps of alpha-cut cards with a drawn leaf or needle texture around
  a dark core, with normals pointing out of the clump so it shades like a soft volume; trunks
  use the bark texture; boulders are noise-displaced spheres with the rock texture. Trunks and
  boulders are solid. Clouds and volcano smoke are soft billboards.
- **Grass** near you is real 3D tufts: crossed blade cards in 16 m patches within about 44 m,
  tinted by the ground texture under them, swaying more in wind and storms.
- **Blocks** sit on a 1 m grid, with one instanced mesh per block type and shape. Each type has a
  drawn texture with a bump map (planks, bricks, log rings and bark, stone, wool, glass). Boxes
  collide as boxes, slopes and prisms as triangles.
- **Animals** (and the bear, boar and spider) are built from boxes; they wander, graze, steer around trees and blocks, avoid
  water and steep ground, and follow the terrain with downward raycasts.
- **Water** is a smooth plane with a slow swell; ripples are computed per pixel from a few
  travelling waves and moving noise. It reflects the sky (Fresnel: clear when looking down,
  mirror-like at grazing angles) and a small height map of the lake bed makes the shallows
  turquoise and see-through, with foam at the shore. Under the surface the fog turns dense and
  blue and the screen gets a tint.

- **Distance.** On the 1024 m map, terrain chunks further than 480 m aren't drawn (the fog
  reaches the sky colour there), vegetation is grouped into 96 m tiles that switch to simpler
  trees beyond about 140 m and disappear at 440 m, and animals further than 220 m are hidden.
  With `?quality=low` these are 380, 90 and 340 m.

- **Character**: the explorer has jointed arms and legs (elbows, knees), a head that turns
  towards where you look, a backpack and hat, armour that shows when worn and the selected tool
  or block in hand. Walking, running (leaning forward), jumping, landing, swimming and swinging
  each have their own pose, and joints ease between them. In first person you see your hand and
  tool. Physically the player is a 1.8 m capsule. Each collision push is classified as walkable
  ground, a steep slope (pushed out sideways only, so it can't lift you) or a ceiling, so you
  slide down slopes steeper than 47° and can't jump or walk up them. Also gravity, swimming, sprinting and a
  third-person camera that pulls in when terrain is in the way.

### Browser limits

These were traded for speed: the water reflects the sky but not the hills or trees (that needs
rendering the scene twice); there is no screen-space ambient occlusion or global illumination;
shadows stop at 220 m, where the haze takes over; trees are leaf cards rather than modelled
branches; resolution is capped at 1.5× on high-density screens; and the textures take about
70 MB of video memory (about 18 MB with `?quality=low`). If it stutters, try `?quality=low`;
the frame rate is shown top-left.

## Development

    npm install          # once: the test browser, linter, formatter and bundler (dev only)
    npm start            # dev server on http://localhost:8000 (PORT=8080 npm start for another port)
    npm run lint         # ESLint
    npm run format       # Prettier (npm run format:check to only check)
    npm test             # quick test: loads the game headless, starts a game, generates the map
    npm run test:all     # also the gameplay and survival tests (slow: several minutes)
    npm run build        # dist/index.html, a single file with everything inlined

The first time, Playwright needs its browser: `npx playwright install chromium`.

Tests are plain scripts in `tests/` that drive the game through `window.__game` (see the end of
`src/main.js`) and print one line per check; screenshots go to `tests/shots/`. Run one with
`node tests/survival.test.mjs [seed]`.

### Code layout

| Path                          | What's in it                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `index.html`, `src/style.css` | Page, menus and HUD markup, styles                                                                     |
| `src/main.js`                 | Starts everything, the frame loop, `window.game` / `window.__game` hooks                               |
| `src/config.js`               | World size, player and quality settings, URL parameters                                                |
| `src/state.js`                | Shared game state that several modules change (view, mode, selected slot…)                             |
| `src/noise.js`                | Noise, random numbers and small maths helpers                                                          |
| `src/terrain/`                | Terrain shape and caves (`generate`), biomes, meshing (`mesh`), textures, terrain shader (`material`)  |
| `src/world/`                  | Chunks and streaming (`world`), raycasts and digging (`query`), water, volcanoes, trees, grass, blocks (`blocks`, the catalogue in `block-catalog`, textures in `block-textures`) |
| `src/render/scene.js`         | Renderer, camera, sky, lights, shadows, fog                                                            |
| `src/player/`                 | Character model, physics, animation, camera, health/hunger/thirst, breaking and placing                |
| `src/inventory/`              | Inventory UI, item and recipe definitions (`items`, `catalog-items`), drawn icons                      |
| `src/animals/`                | Animals and predators                                                                                  |
| `src/effects/`                | Underwater, weather, sound                                                                             |
| `src/ui/`                     | HUD, keyboard and mouse input, menus                                                                   |
| `scripts/`                    | Dev server, texture download, build                                                                    |
| `tests/`                      | Browser tests                                                                                          |
