# Terrain World

A 3D survival sandbox in the browser: procedurally generated mountains, a river valley,
big caves and a volcano, dense forests and wandering animals. Walk around in first or third
person, chop trees, dig and add ground, mine stone and crystal, craft tools and build with blocks,
while keeping an eye on your health, hunger and mana. A creative mode is there for testing.

Built with **Three.js** (r160) and **three-mesh-bvh** for collision, both loaded from the
jsDelivr CDN. No build step and no install. Ground and bark use photo-scanned textures from
[Poly Haven](https://polyhaven.com) (CC0, public domain), lit by a sky with soft shadows and haze.

## Run it

Open `index.html` in a recent Chrome, Edge or Firefox (needs internet for the CDN).
If your browser blocks it when opened as a file, serve the folder instead:

    python3 -m http.server 8000      # then open http://localhost:8000

Add `?seed=1234` to the URL to get a specific world; the current seed is shown top-left.
Add `?quality=low` on a slower computer or laptop (smaller textures and shadow maps, lower
resolution, fewer leaves).

### Textures

The game downloads its ground textures (grass, forest floor, dirt, sand, rock, snow, bark) from
Poly Haven when it starts, which takes a few seconds; until they arrive, and whenever there is
no internet, it uses generated stand-ins. A message at the bottom says which you got. To keep
copies in the project instead:

    sh get-textures.sh                 # saves 1K JPGs into assets/textures (about 10 MB)
    python3 -m http.server 8000        # local copies are only used when the folder is served

Browsers don't let WebGL read images from a page opened straight from disk, so with `index.html`
opened as a file the textures always come from Poly Haven. Which Poly Haven texture each layer
uses is listed in `TEX_LAYERS` near the top of the terrain code; each layer has backups in case
one is renamed. All of them are CC0, so no credit is required, but it's nice to give it.

## Controls

| Key | Action |
|-----|--------|
| Click | Capture the mouse and start |
| W A S D / arrows | Move (relative to where you look) |
| Shift | Sprint |
| Space | Jump (from walkable ground) / swim up in deep water |
| Mouse | Look around |
| V (or C) | Switch first / third person |
| Z | Cycle third-person camera distance |
| Left mouse (hold) | Break / harvest what you aim at, or attack an animal |
| Right mouse | Place a block or ground, eat, drink, cast, wear; on a workbench or campfire, open crafting |
| 1–9, mouse wheel | Select hotbar slot |
| E (or I / Tab) | Open / close the inventory and crafting |
| G | Toggle creative mode (fly with Space / Shift) |
| F | Toggle the lantern (useful in caves) |
| R | Respawn at the cave mouth |
| N | Generate a new world |
| Esc | Release the mouse / pause |

In the inventory: click to pick up and drop a stack, right-click to split a stack or place one
item, shift-click to move a stack between the hotbar and the backpack. Click a recipe on the
right to craft it once, shift-click to craft as many as you can.

## Survival

* **Breaking.** Hold the left mouse button on something within reach (5.5 m). Trees give logs,
  sticks and sometimes apples; bushes give berries and a stick; boulders give stone. The ground
  can be dug: dirt and sand by hand (faster with a shovel), stone and cave crystal only with a
  pickaxe. Axes chop wood faster. Placed blocks break back into their item.
* **Building.** Right-click with a block (log, planks, stone, stone bricks, glass, wool,
  workbench, campfire) to place it on the face you aim at; a white outline shows where it goes.
  Right-click with dirt or sand to add ground to the terrain.
* **Crafting.** Basic recipes work anywhere; tools, bricks, armour and the wand need a
  workbench within 4.5 m, and cooking, glass and the mana tonic need a campfire.

  | Item | Recipe |
  |------|--------|
  | Planks ×4 | 1 log |
  | Sticks ×4 | 2 planks |
  | Workbench | 4 planks |
  | Campfire | 3 logs, 2 sticks |
  | Wooden pickaxe / axe / shovel / sword | planks + sticks, at a workbench |
  | Stone pickaxe / axe / shovel / sword | stone + sticks, at a workbench (faster, harder hitting) |
  | Stone bricks ×4 | 4 stone, at a workbench |
  | Leather armour | 5 leather, at a workbench (35% less damage) |
  | Crystal wand | 1 stick, 3 crystal, 1 feather, at a workbench |
  | Cooked meat | 1 raw meat, at a campfire |
  | Glass | 2 sand, at a campfire |
  | Mana tonic | 1 crystal, 2 berries, at a campfire |
  | Bandage ×2 | 2 wool |
* **Animals.** Cows, pigs, sheep and chickens graze in meadows; deer, wolves and rabbits live
  in forests and fields. Deer and rabbits run when you get close, others run once hit, and wolves
  chase and bite you. Animals drop raw meat, leather, wool and feathers. Herds are topped back up
  over time, away from you.
* **Health, hunger, mana.** Hunger drains slowly (faster when sprinting or swimming); at zero
  you start losing health, and when well fed you heal. Food and bandages restore them. Falls of
  more than about 5 m hurt, and lava kills. Mana refills over time and powers the crystal wand's
  bolts. When you die you respawn at the cave and keep your inventory.
* **Creative mode** (G): fly, no damage or hunger, instant breaking without tools, placing
  doesn't use up items, and the inventory shows every item to take stacks from (click it again
  while holding a stack to throw that stack away).

## Settings

The `WORLD` and `PLAYER` objects at the top of the script hold the main knobs:

* `WORLD.size` – map width/depth in metres (default 1024, which takes several seconds to
  generate; 256 takes about one second).
* `WORLD.height` – vertical extent (default 128 m; peaks reach ~110 m).
* `WORLD.voxel` – metres between terrain samples. Bigger means coarser ground and faster generation.
* `WORLD.treeSpacing` – smaller means denser forests.
* `PLAYER.maxSlopeDeg` – slopes steeper than this can't be stood on, walked up or jumped from.
* `PLAYER.reach`, `PLAYER.flySpeed` – how far you can break/place, and creative flying speed.
* `SPECIES` (further down) – each animal's health, speed, drops and how many live on the map.
* `RECIPES` and `defineItems()` – add or change items and recipes.

## Adding items from the console

The inventory is exposed as `window.game`:

```js
game.registerItem({ id: 'stone', name: 'Stone', color: '#8a8580' });       // colour swatch icon
game.registerItem({ id: 'apple', name: 'Apple', icon: '🍎', maxStack: 16 }); // emoji icon
game.addItem('stone', 10);   // returns how many didn't fit
game.removeItem('stone', 3); // true if enough were removed
game.countItem('stone');
game.getSelectedItem();      // stack in the selected hotbar slot, or null
```

## How it works

* **Terrain** is a 3D density field sampled every 2 m over 1024 × 128 × 1024 m:
  * domain-warped fractal noise for rolling land,
  * eroded-looking ridged multifractal mountains rising away from the valley, with crags and
    overhangs from 3D noise, rock strata on cliffs and snow above ~85 m,
  * a winding river valley carved below the water line, with beaches,
  * volcanoes: concave cones with a crater, a glowing lava lake (falling in respawns you),
    lava veins on the slopes and a smoke plume,
  * large worm caves, huge caverns with crystals, and one guaranteed tunnel into a big cavern
    starting at a flat ledge on the valley side, where you spawn,
  * a flood fill that removes floating rock.
* **Meshing** uses Surface Nets in 32 × 32 m chunks. Vertex normals come from the gradient of
  the density field, so the ground is smoothly rounded and chunk borders don't show. Each
  vertex also stores how much grass, forest floor, dirt and sand covers it (from height, biome
  and noise). The collider and the render mesh share one indexed geometry with a BVH for
  physics. Digging or adding ground edits the density field and rebuilds only the chunks it
  touches (a few milliseconds).
* **Texturing**: seven photo texture layers (colour, normal, roughness and ambient occlusion at
  1024 × 1024) are packed into two texture arrays, so the terrain shader needs only two texture
  samplers. The shader blends rock onto steep slopes and snow onto high ground, breaks up the
  borders between layers with noise, projects every texture from three sides (triplanar) so
  cliffs aren't stretched, adds large-scale colour variation to hide repetition, darkens wet
  ground at the waterline, turns volcano rock to basalt and makes lava veins, crater rims and
  cave crystals glow.
* **Lighting**: a sky dome (horizon haze to deep blue, with a sun glow) is pre-filtered once
  into an environment map that lights everything from the whole sky (image-based lighting).
  The sun casts cascaded shadows: a sharp 2048² map for the nearest ~55 m and a coarser one out
  to 220 m, faded into each other. Caves get almost no sky light. ACES tone mapping.
* **Fog** is height fog applied to every material: thick in the valleys and thinner with
  altitude, plus light haze at any height, warmer towards the sun, fading into the sky's
  horizon colour so distant hills melt into it.
* **Vegetation**: forests of pine, oak and birch placed from a forest-density map, plus bushes
  and boulders. Leaves are clumps of alpha-cut cards with a drawn leaf or needle texture around
  a dark core, with normals pointing out of the clump so it shades like a soft volume; trunks
  use the bark texture; boulders are noise-displaced spheres with the rock texture. Trunks and
  boulders are solid. Clouds and volcano smoke are soft billboards.
* **Blocks** are 1 m cubes on a grid, one instanced mesh per block type, with box collision.
* **Animals** are built from boxes; they wander, graze, steer around trees and blocks, avoid
  water and steep ground, and follow the terrain with downward raycasts.
* **Water** is a smooth plane with a slow swell; ripples are computed per pixel from a few
  travelling waves and moving noise. It reflects the sky (Fresnel: clear when looking down,
  mirror-like at grazing angles) and a small height map of the lake bed makes the shallows
  turquoise and see-through, with foam at the shore. Under the surface the fog turns dense and
  blue and the screen gets a tint.

* **Distance.** On the 1024 m map, terrain chunks further than 480 m aren't drawn (the fog
  reaches the sky colour there), vegetation is grouped into 96 m tiles that switch to simpler
  trees beyond about 140 m and disappear at 440 m, and animals further than 220 m are hidden.
  With `?quality=low` these are 380, 90 and 340 m.

### Browser limits

These were traded for speed: the water reflects the sky but not the hills or trees (that needs
rendering the scene twice); there is no screen-space ambient occlusion or global illumination;
shadows stop at 220 m, where the haze takes over; trees are leaf cards rather than modelled
branches; resolution is capped at 1.5× on high-density screens; and the textures take about
70 MB of video memory (about 18 MB with `?quality=low`). If it stutters, try `?quality=low`;
the frame rate is shown top-left.
* **Character**: a 1.8 m capsule. Each collision push is classified as walkable ground, a steep
  slope (pushed out sideways only, so it can't lift you) or a ceiling, so you slide down slopes
  steeper than 47° and can't jump or walk up them. Also gravity, swimming, sprinting and a
  third-person camera that pulls in when terrain is in the way.
