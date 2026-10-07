# Terrain World

A low-poly 3D world in the browser: procedurally generated mountains, a river valley, big caves
and a volcano, dense forests, and a character you can walk around in first or third person,
with a hotbar and inventory ready for items.

Built with **Three.js** (r160) and **three-mesh-bvh** for collision, both loaded from the
jsDelivr CDN. No build step and no install.

## Run it

Open `index.html` in a recent Chrome, Edge or Firefox (needs internet for the CDN).
If your browser blocks it when opened as a file, serve the folder instead:

    python3 -m http.server 8000      # then open http://localhost:8000

Add `?seed=1234` to the URL to get a specific world; the current seed is shown top-left.

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
| 1–9, mouse wheel | Select hotbar slot |
| E (or I / Tab) | Open / close the inventory |
| F | Toggle the lantern (useful in caves) |
| R | Respawn at the cave mouth |
| N | Generate a new world |
| Esc | Release the mouse / pause |

In the inventory: click to pick up and drop a stack, right-click to split a stack or place one
item, shift-click to move a stack between the hotbar and the backpack.

## Settings

The `WORLD` and `PLAYER` objects at the top of the script hold the main knobs:

* `WORLD.size` – map width/depth in metres (default 256; larger takes longer to generate).
* `WORLD.height` – vertical extent (default 128 m; peaks reach ~110 m).
* `WORLD.voxel` – metres between terrain samples. Bigger means larger low-poly facets.
* `WORLD.treeSpacing` – smaller means denser forests.
* `PLAYER.maxSlopeDeg` – slopes steeper than this can't be stood on, walked up or jumped from.

## Adding items later

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

* **Terrain** is a 3D density field sampled every 2 m over 256 × 128 × 256 m:
  * domain-warped fractal noise for rolling land,
  * eroded-looking ridged multifractal mountains rising away from the valley, with crags and
    overhangs from 3D noise, rock strata on cliffs and snow above ~85 m,
  * a winding river valley carved below the water line, with beaches,
  * volcanoes: concave cones with a crater, a glowing lava lake (falling in respawns you),
    lava veins on the slopes and a smoke plume,
  * large worm caves, huge caverns with crystals, and one guaranteed tunnel into a big cavern
    starting at a flat ledge on the valley side, where you spawn,
  * a flood fill that removes floating rock.
* **Meshing** uses Surface Nets, then every triangle gets one flat colour (height, slope,
  biome, depth) for a faceted low-poly look. An indexed copy with a BVH is used for physics.
* **Vegetation**: forests of pine, oak and birch placed from a forest-density map, plus bushes
  and boulders. Trunks and boulders are solid.
* **Character**: a 1.8 m capsule. Each collision push is classified as walkable ground, a steep
  slope (pushed out sideways only, so it can't lift you) or a ceiling, so you slide down slopes
  steeper than 47° and can't jump or walk up them. Also gravity, swimming, sprinting and a
  third-person camera that pulls in when terrain is in the way.
