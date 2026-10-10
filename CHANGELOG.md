# Changelog

## Round 8: biomes, woods, caves and 270 new items

### Fixes

- **Lava you couldn't see.** Lava flows and crater lakes were only drawn from above, so from
  inside them (or from below) they vanished. Both are now drawn from both sides. Being inside lava
  tints the view orange and shows IN LAVA on the HUD. Lava flows are also built as soon as their
  ground is ready, instead of waiting on other things.
- **Crater lakes** now fill the crater to its rim shape instead of a plain circle, so lava no
  longer floats past the crater walls or leaves gaps.
- **Iron nuggets on boulders** were never drawn (a missing shape). They show again.
- **Cave generation.** Caves used to stop dead at one height just above sea level, which gave
  them flat floors cut straight through the rock. They now reach down to just above the bedrock
  under hills and mountains, with rounded floors (see Caves below).

### Faster loading

- Animals and hostile mobs share two materials and reuse the same merged shapes for every
  animal that looks alike, instead of hundreds of separate boxes each. Spawning a hundred animals
  takes milliseconds, and each frame draws far fewer objects.
- Animals more than 60 m away update a few times a second instead of every frame.

### Inventory

- The inventory window is split into pages with tabs: **Backpack** (your items, what you're
  wearing and a description of the item under the mouse, plus a Sort button), **Crafting**
  (recipes, with category buttons, a search box and a "only what I can make" filter, and a count
  of recipes you can make on the tab) and **All items** in creative mode (every item, with
  categories and search). The hotbar stays along the bottom on every page.
- Blocks show as small 3D cubes drawn from their own textures. Buckets, bottles and iron ore have
  new drawn pictures.
- Recipes can take "any planks", "any logs", "any wool" or "fuel" (logs, planks or coal), so every
  kind of wood works for sticks, tools and workbenches.

### Controls

- **Tab** (or V) cycles the view: first person, behind you, and a new **in front** view that
  looks back at your face. You can still aim and build in the front view.
- **C** opens crafting.
- **Every key can be changed**: Esc > Keys… (or the Keys… button on the main menu). Click a key
  and press the new one; Backspace clears it, Esc cancels. Each action can have two keys, and the
  layout is remembered in this browser. 1–9 and Esc stay fixed.

### Biomes

Fifteen biomes, picked by temperature and humidity and blended at their borders:

| Biome              | Ground                       | Trees and plants                                         | Animals                          |
| ------------------ | ---------------------------- | -------------------------------------------------------- | -------------------------------- |
| Plains             | grass, flat                  | a few oaks and birches, flowers                          | cows, pigs, sheep, chickens      |
| Forest             | forest floor                 | oaks, birches, spruces, mushrooms                        | deer, boars, wolves, bears       |
| Birch forest       | grass and forest floor       | birches, flowers                                         | deer, chickens, foxes            |
| Dark forest        | dark forest floor            | dense dark oaks, mushrooms                               | wolves, bears, boars             |
| Autumn forest      | orange-tinted grass          | red and orange maples, pumpkins                          | deer, foxes, boars               |
| Cherry grove       | grass, rolling hills         | pink cherry trees, fallen petals                         | sheep, rabbits, deer             |
| Taiga              | podzol                       | spruces, ferns                                           | wolves, foxes, deer, bears       |
| Old redwood forest | needles and dirt             | giant redwoods, ferns                                    | deer, wolves, bears, foxes       |
| Snowy taiga        | snow                         | snow-covered spruces                                     | wolves, foxes, polar bears       |
| Snowy plains       | snow, flat                   | the odd spruce and ice spike                             | polar bears, rabbits             |
| Ice spikes         | snow                         | tall spikes of packed ice                                | polar bears                      |
| Desert             | sand and sandstone, dunes    | cacti, dead bushes, rare palms                           | camels, scorpions                |
| Savanna            | golden grass, flat           | flat-topped acacias                                      | zebras, cows, chickens           |
| Mesa               | red sand, terracotta terraces in coloured bands | dead bushes, cacti                    | goats, scorpions                 |
| Jungle             | lush grass, hills            | huge jungle trees, palms, bamboo, melons, ferns, bushes  | parrots, jaguars, chickens, pigs |

- The start area is always temperate (forest or plains), so there's wood and food nearby.
- Each biome tints its grass and ground, and shapes its land: desert dunes, mesa terraces, flat
  plains and savanna, hilly jungles and cherry groves.
- Digging gives the biome's ground: sand and sandstone in the desert, red sand and terracotta on
  mesas, snow in snowy biomes, podzol in taigas, clay under lakes.

### New trees and plants

- Ten kinds of tree, each with its own shape: oak, birch, spruce, dark oak (big), maple, cherry,
  redwood (huge), jungle (huge), acacia (tilted trunk, flat top) and palm (curved trunk, fronds).
- Chopping one gives that tree's logs (twice as many from big trees), sticks, sometimes saplings
  and leaves, and fruit: apples (oak), pinecones (spruce, redwood), maple sap, cherries, cocoa
  beans (jungle) and coconuts (palm).
- New plants: eight kinds of flower (dandelion, poppy, cornflower, allium, pink and orange tulips,
  lily of the valley, oxeye daisy), ferns, red and brown mushrooms, cacti, dead bushes, bamboo,
  pumpkins, melons, pink petals and ice spikes. Cacti, bamboo and ice spikes are solid.
- **Saplings** can be planted and grow into a tree of log and leaf blocks after a minute or two.

### New blocks (200)

- **Woods** (10 kinds: oak, birch, spruce, dark oak, maple, cherry, redwood, jungle, acacia,
  palm): log, planks, stripped log, leaves (see-through), sapling, fence and bookshelf of each.
- **Stones** (12 kinds: granite, diorite, andesite, deepslate, tuff, calcite, marble, limestone,
  sandstone, red sandstone, basalt, blackstone): rough, polished and bricks of each.
- **Other stone**: cobblestone, mossy cobblestone, mossy and cracked stone bricks, bricks, mud
  bricks, obsidian, chiselled sandstone, stone tiles.
- **Ground**: red sand, gravel, clay, mud, podzol, coarse dirt, snow, ice, packed ice, blue ice,
  moss, terracotta, cactus, hay bale, pumpkin, jack o'lantern, melon.
- **Metal**: blocks of coal, copper, iron and gold, and a glowing crystal lamp.
- **Colours** (16: white, light grey, grey, black, brown, red, orange, yellow, lime, green, cyan,
  light blue, blue, purple, magenta, pink): wool, stained glass, terracotta and concrete of each.
- **Light**: torches and lanterns. Torches, lanterns, jack o'lanterns, crystal lamps, campfires
  and furnaces light up what's around them (the four nearest the camera at a time).
- Blocks are drawn from short texture descriptions (`src/world/block-textures.js`), so each has
  its own look: bark and rings, board grain, mossy cobbles, marble veins, basalt columns, riveted
  metal, books on shelves and so on.

### New items (70)

- **Ores and metal**: coal, raw copper, raw gold, copper and gold ingots, bricks.
- **Copper and golden tools** (pickaxe, axe, shovel, sword): copper digs a bit faster than stone,
  gold is very fast but doesn't hit hard. **Copper and golden armour**.
- **Dyes** in all 16 colours, from flowers, cocoa beans, coal, cactus and petals, and mixed
  from each other (red + yellow = orange, blue + white = light blue, and so on).
- **Food and drink**: cactus fruit, melon slices, coconuts, cherries, maple sap, mushroom stew,
  chocolate, pumpkin pie, cherry pie, fruit salad, roasted pine nuts, maple syrup, coconut milk,
  melon juice.
- **Plants**: the eight flowers, pink petals, cactus, bamboo, plant fibre, pinecones, cocoa beans,
  mushrooms.
- Paper (from bamboo) and books (for bookshelves).
- Spawners for the eight new animals (creative mode).

About 250 new recipes go with them; the crafting page's search and categories help find them.

### New animals

- **Camel** (desert), **zebra** (savanna, shy), **goat** (mesa), **fox** (taigas and birch
  forests, shy), **parrot** (jungle, in four colours), **polar bear** (snowy biomes, attacks if
  you get close), **jaguar** (jungle, hunts you) and **scorpion** (desert and mesa, stings).
- Every animal now lives only in its own biomes.

### Caves (Caves and Cliffs style)

- **Huge caverns**: big open "cheese" caves, wider than tall, with stone pillars standing from
  floor to roof.
- **Long winding tunnels** ("spaghetti" caves) that get wider and narrower as they go.
- Caves reach down to just above the bedrock under hills and mountains (about 15 m below sea
  level), with rounded floors, and open out of cliff faces and hillsides. Under low ground they
  stay above the sea so they don't flood.
- **Underground stone**: pockets of granite, diorite, andesite, tuff, calcite, marble, limestone,
  sandstone and basalt at the depths each is found, deepslate and blackstone near the bottom.
  Digging gives that stone.
- **Ores**: coal (common, higher up), copper (middle depths, green-blue specks), gold (rare,
  deep, needs a stone pickaxe or better) alongside iron. Ore shows as small nuggets with a dark
  rim, rather than big orange blotches.

### Water

- Scooping any part of a poured pool with a bucket takes its source, and the rest drains away (you
  used to have to find the exact source cell). Empty bottles fill from poured water too.

### Movement and the player

- **Steps**: walking into a low ledge up to about half a metre (a slab, a stair, a lump in the
  ground) steps up onto it instead of stopping you.
- The camera and body follow small steps and bumps smoothly instead of jerking.
- The walk and run cycles match how far you move, so the feet no longer slide over the ground.
- The model has rounded hip, knee and elbow joints, so no gaps show when limbs bend. Copper and
  gold armour show in their own colours.

### For developers

- `src/world/block-catalog.js` lists the families of blocks; `src/inventory/catalog-items.js`
  their items and recipes. `src/terrain/biomes.js` defines the biomes.
- `terrainFns.stoneAt`, `oreKind`, `biomeAt`, `biomeWeights` and `blend` are new.
- `updateCampfires` is now `updateBlocks` (lights, saplings and campfire flames).
