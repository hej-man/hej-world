# Terrain World

A small voxel-style 3D world in the browser: procedurally generated mountains, a river valley
and caves, plus a character you can walk around in first or third person.

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
| Space | Jump |
| Mouse | Look around |
| V (or C) | Switch first / third person |
| Mouse wheel | Third-person camera distance |
| F | Toggle the lantern (useful in caves) |
| R | Respawn at the cave mouth |
| N | Generate a new world |
| Esc | Release the mouse / pause |

## How it works

* **Terrain** is a 3D density field on a 96 × 64 × 96 grid (1 sample per metre):
  * rolling hills from fractal simplex noise,
  * ridged-noise mountains that rise away from the valley (with snow above ~40 m),
  * a winding river valley carved down below the water line,
  * 3D noise near the surface for overhangs,
  * "worm" caves (where two 3D noise fields are both near zero) plus one guaranteed tunnel
    and cavern that starts at a flat ledge on the valley side, where you spawn,
  * a flood fill that removes any floating rock.
* **Meshing** uses Surface Nets (a smooth isosurface method in the marching-cubes family),
  then vertex colours by height, slope and depth (sand, grass, rock, snow, cave stone, minerals).
* **Character**: a capsule (1.8 m tall) collides against the terrain triangles via a BVH
  shapecast, with gravity, jumping, sliding along walls, slower movement in water, tree-trunk
  collision and a boundary at the map edge. The third-person camera pulls in when terrain is
  in the way so it never ends up inside a cave wall.

Tweak sizes and physics in the `WORLD` and `PLAYER` objects at the top of the script.
