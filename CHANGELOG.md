# Changelog

## Round 14: trees fall like dominoes, burnt trees leave ash

- A falling tree knocks over the trees it hits. Each one topples on in about the same direction
  (a little to either side), so chopping the first of a row can bring down the whole row, up to
  16 trees in one go. You get the wood from every tree that falls.
- A tree that burns down leaves a grey pile of ash around a charred stump instead of nothing.
  Break it to get 1 to 3 wood ash and sometimes a lump of coal.
- Wood ash is a fertiliser: right-click a growing sapling with it and the sapling grows into a
  tree straight away.

## Round 13: terrain from the building shapes, mouse buttons you can change

- The ground uses the new building shapes too. A one-block step with flat ground in front of it
  becomes two gentle slopes (easy to walk up), the foot of a cliff gets a steep slope, the
  outside corners of hills get corner slopes and inside corners get an inside-corner piece, so
  hillsides are smoother and no longer only 45° ramps.
- Break / attack and place / use are in Settings > Keys like every other action: put them on any
  key or mouse button, and put any action on a mouse button (left, middle, right or the side
  buttons). Item hints and the controls list name whatever you chose.
- No more paper-thin "lakes" underground: a cave mouth or pit that dips below the sea level under
  dry land showed a sheet of water you could walk through. Water now only shows where the land is
  actually low enough to hold the sea, a lake or the river.
- Fixed ground faces that could be joined to the wrong corner high up in the world (a leftover
  from making the world taller).

## Round 12, part 2: night, armour, storage, fire and a deeper world

- Day and night: a day lasts 20 minutes. The sun rises and sets, the night sky has stars and a
  moon, and the light dims to moonlight. The top right corner shows your coordinates, the day
  and the time.
- At night wolves hunt further and there are twice as many, and three night monsters come out:
  the rotwalker (a shambling brute), the hexcaller (a robed caster that throws hexes from a
  distance) and the gloomstalker (a fast, long-legged shadow). They fade away at dawn and drop
  grave dust, bones, hex shards and gloom silk.
- Magic from what they drop: arcane dust, a hex staff (a stronger, purple bolt), grave salve
  (heals 60), and three potions: the gill tonic (breathe underwater for 90 s), the swiftness
  draught (40% faster for 60 s) and the owl-eye draught (see in the dark for 3 minutes). The
  potions you're under show under the clock.
- Drowning: with your head under water an air bar counts down from 20 seconds, then you drown
  slowly. A diving helmet (copper, glass and leather) makes your air last three times as long.
  You no longer get stuck on the bottom of deep water: you float back up.
- Armour comes in four pieces you wear separately: helmet, breastplate, gauntlets and pants, in
  leather, copper, gold, iron, rose gold, steel and titanium. You see the pieces you wear on your
  character, in the metal's colour or as leather. Protection is lower than before: a whole
  leather set takes off 20%, a titanium set 48%.
- Storage: a wicker basket (9 slots), a chest (18) and a large crate (36). Right click one to
  open it; breaking it gives back what's inside.
- Wild grain grows on the plains and savanna; bake trail bread from it at a campfire or furnace.
- Milk: an empty bottle milks a cow or goat. Raw milk can make you sick; heat it at a campfire or
  furnace into pasteurised milk.
- Iron, copper, gold, titanium and coal ore can be placed as blocks. Cave iron is more common.
  Ores other than coal no longer show at the surface.
- Chopped trees fall over away from you before they disappear.
- Fire: lava poured next to trees, a campfire built under a tree or against wood, and the new fire
  starter set trees and wooden blocks alight. Fire spreads to trees and wood nearby (not in the
  rain), burns them away, and sets you on fire if you stand in it.
- New block shapes: gentle slope, steep slope and corner slope (sloping on two sides), and the
  shapes have clearer names (Full block, Half slab, Roof ridge, Round pillar). On a surface too
  steep to stand on you slide down it.
- The world is 24 m deeper: the sea is at 44 instead of 20, with more rock, caves, deepslate and
  ore under it.
- Ice spikes no longer put blocks inside the ground, and a block placed where the ground has a
  slope takes the slope out, so their faces don't flicker against each other.

## Round 12, part 1: fixes for the block world

- Volcano craters have their lava lake again, built of lava blocks that fill the crater, and the
  lava flows down the sides are thin lava sheets lying on the blocks.
- Lakes, ponds and the river reach right up to the blocky shore instead of stopping short of it.
- Poured water and lava look like natural water and lava, in block-shaped cells.
- Lava poured into a lake or the river hardens into obsidian or stone. A thin sheet of spilled
  lava slowly cools away to nothing.
- Underwater, right-click works on what you aim at instead of always drinking. You only drink
  unpurified water when what you hold has no other use and you aren't aiming at something to use.
- Every spawner has a drawn egg icon in its animal's colours (the polar bear spawner had none).
- Flowers have their own names: Goldenbell, Emberbloom, Skyblossom, Violet globe, Blush cup,
  Sunset cup, Snowbell and Moonpetal.
- Caves no longer cut holes through the sides of mountains.
- More copper (about 1.7×), gold (2.7×) and titanium (3×); far less iron near the surface.
- Animals hop up single blocks and step down drops on the block ground.
- In water or lava you can climb out onto a bank up to 2.6 m above your feet by moving toward it.
- The mesa is now the painted wastes: tall rock towers on swelling ground, with wavy cream,
  salmon, rust and lilac bands.

## Round 11: the ground is blocks

- The ground is now made of 1 m blocks, the same size and shapes as the ones you place, with
  slopes on hillsides so you can still walk up hills without jumping. Grass and forest floor
  cover the tops, and the sides of a grassy step show dirt. Trees stay as they were.
- Digging takes out exactly the one block you hit, instead of a 2 m ball of ground, so a hole is
  only as big as what you dug. Dug-out cells never fill back with a slope.
- Placing a block on a slope replaces the slope.
- Building a chunk is faster and lighter than the first try at blocks: faces are merged, vertices
  shared and the per-vertex data packed into bytes.
- Tests: `flatSpot(d)` finds ground that is also level `d` metres toward where the test aims, since
  a flat block can now sit right at the edge of a drop; the swim test swims along the river.

## Round 10: animal models, livelier weather and block ice spikes

- Ice spikes are now built from separate blocks: packed ice (with a little clear ice) stacked into
  a spire that steps in with slopes wherever it narrows and ends in a thin ice pillar. Most are
  small and a few tower over 20 blocks, the tall ones leaning slightly. Each block mines on its own
  and gives itself back; the inside of a spike is filled in as you dig into it. The ice spikes
  biome has a few fewer of them than before, and distant ones are drawn as plain sharp blocks.

- Weather changes about three times as often: a clear spell lasts 2 to 5 minutes instead of 4 to 9,
  cloudy skies more often turn to rain than back to sun, and a full round from clear through rain and
  back takes around ten minutes.
- A new world starts on random weather (usually clear, sometimes cloudy or already raining) partway
  through its spell, so the first change comes sooner.
- Cloud cover and rain drift gently while a state lasts, so clear skies gather a few clouds and
  rain comes in heavier and lighter spells instead of holding perfectly still.

- Every animal is rebuilt from bevelled boxes that taper (legs thin toward the hoof, snouts narrow,
  humps round off), with darker undersides, instead of plain sharp cubes.
- All of them have eyes with a glint (hunters' eyes still glow), and hooves, paws or claws.
- Tails are a separate part that swishes now and then, faster when the animal runs.
- New details per animal: cows have three patch patterns, horns, ears and an udder (and some are
  brown and white); pigs have floppy ears, a snout with nostrils and a curly tail; sheep have a puffy
  fleece and the odd black sheep; chickens have a comb, wattle, toes and tail feathers (some are
  brown); deer have a white rump and branching antlers on stags; rabbits have big hind feet and pink
  inner ears; wolves have a deep ruff and a bushy tail; bears have claws and a shoulder hump (polar
  bears a longer neck); boars have a bristly ridge and curved tusks; camels a long curved neck,
  knobbly knees and a round hump; zebras stripes down their flanks, legs and mane; goats curled
  horns and a beard; foxes black socks, a white chest and a white-tipped tail; parrots a hooked beak
  and coloured wing tips; jaguars ring-shaped rosettes; scorpions a plated back, jointed legs and a
  segmented tail; cave spiders fangs, six eyes and a red mark.

## Round 9: metalwork, living water, puddles and titanium

### Fixes

- **Poured water you couldn't pick back up.** In third person the bucket's reach was measured
  from the camera behind you, so a puddle at your feet was out of reach. Reach is now measured
  from the player in both views, and a bucket scoops up whatever is left of a pool (a bottle takes
  a quarter of a bucket).
- **Lava only burned at its surface.** Sinking into a crater's lava lake or a deep flow stopped
  burning once your feet were a few metres under. Now any lava between the ground it lies on and
  its surface burns, and faster the deeper you are: 24 health a second up to the knees, 36 up to
  the chest and 48 with your head under. Poured lava counts at your feet, chest and head too.
  Tunnels and caves under lava are still safe.

### Water and lava

- Poured fluid now keeps its amount instead of copying itself from a source. A bucket spreads out
  into a thin sheet over flat ground (down to a sixteenth of a block for water, a quarter for
  lava), fills holes, and runs downhill.
- Two pools that touch flow into each other until they're level and become one pool.
- Water that reaches the river or a lake joins it and raises it a little.
- Scooping from a pool takes from it; scooping from the river, a lake or a crater lowers it a
  little each time (craters slowly refill from below).
- Water meeting a lot of lava turns it to obsidian, a little lava to stone, and some water boils
  off as steam.
- Animals walk through ankle-deep water and only avoid deeper water and lava.

### Weather

- Rain fills the river and the lakes and sunshine dries them, so they rise over their banks after
  a storm and shrink to narrow streams in a dry spell. Under grey skies they drift back to normal.
- Rain leaves puddles on flat open ground that shine and ripple, and dry up again in the sun.
- Poured water out in the open fills up in the rain and slowly dries in the sun.

### Metalwork

- **Smelter, bellows and anvil**, each with its own model. The smelter melts ore in a clay
  crucible over a few seconds while you do other things; finished metal is handed over if you're
  close, otherwise it waits in the smelter until you right-click it. Up to four jobs queue per
  smelter, shown in a list on screen.
- **Casting**: molten metal goes into clay moulds (kept) for ingots, plates or rods, and the
  crucible comes back.
- **Forging**: at an anvil with a smelter close by, the smith's hammer turns ingots into plates and
  rods, and those into tools, armour, nails, chain and gears.
- **New metals**: steel (iron and coal), rose gold (copper and gold) and titanium (needs bellows),
  with their own tools and armour. Titanium tools are the fastest and its armour the strongest.
- **Metal blocks**: steel, titanium and rose gold blocks, iron bars, steel grate, treadplate,
  titanium plating, rose gold tiles, copper panels, chain, riveted iron and gear blocks.

### Ores

- **Iron veins.** Iron ore now runs through the rock in long winding veins instead of scattered
  specks, with a halo of rusty granite around them.
- **Titanium ore**: rare, deep, pale lilac flecks. It needs an iron pickaxe or better and drops raw
  titanium.

### Looks

- **Item pictures** are drawn properly: tools of every metal, ingots, plates, rods, raw ore,
  crucibles, moulds, armour, coal, gems, buckets and more, instead of coloured squares and letters.
- **Woods** each have their own planks (narrow birch boards, vertical spruce, herringbone maple,
  chevron cherry, parquet jungle wood, slatted palm and more), their own bark and their own leaf
  shapes.
- **Stones** each have their own brick and polished patterns (large granite blocks, small diorite
  bricks, basket-weave andesite, deepslate tiles, irregular tuff and blackstone, long limestone).

### Tests

- New checks for melting, casting and forging, scooping poured water back up, and rain and sun
  moving the river.

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
- The ground keeps its biome and stone colours as bytes instead of floats, which offsets some of
  the memory the bigger caves add.

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
  deep, needs a stone pickaxe or better) alongside iron. Ore is rarer than iron used to be (about
  one rock face in ten has any, iron in about one in twenty-five), and shows as small nuggets with
  a dark rim rather than big orange blotches.

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
