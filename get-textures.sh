#!/bin/sh
# Downloads the ground and bark textures from Poly Haven (polyhaven.com, CC0 / public domain)
# into assets/textures, so the game doesn't fetch them from the internet each time.
# Run it from anywhere:  sh get-textures.sh
# The game only reads these files when the folder is served over http (see README), because
# browsers block WebGL from reading images of a page opened straight from disk.
cd "$(dirname "$0")" || exit 1
mkdir -p assets/textures

get() { # layer, then Poly Haven texture names to try in order
  layer=$1; shift
  for slug in "$@"; do
    json=$(curl -fsSL "https://api.polyhaven.com/files/$slug") || continue
    urls=$(printf '%s' "$json" | grep -o '"url": *"[^"]*_1k\.jpg"' | sed 's/.*"\(http[^"]*\)"$/\1/')
    diff=$(printf '%s\n' "$urls" | grep '_diff_1k' | head -n 1)
    nor=$(printf '%s\n' "$urls" | grep '_nor_gl_1k' | head -n 1)
    arm=$(printf '%s\n' "$urls" | grep '_arm_1k' | head -n 1)
    if [ -z "$diff" ] || [ -z "$nor" ]; then continue; fi
    curl -fsSL "$diff" -o "assets/textures/${layer}_diff.jpg" || continue
    curl -fsSL "$nor" -o "assets/textures/${layer}_nor.jpg" || continue
    if [ -n "$arm" ]; then curl -fsSL "$arm" -o "assets/textures/${layer}_arm.jpg"; fi
    echo "$layer: $slug"
    return 0
  done
  echo "$layer: none of $* could be downloaded; the game will use a generated texture"
}

# keep in step with TEX_LAYERS in index.html
get grass leafy_grass aerial_grass_rock sparse_grass
get forest forrest_ground_01 forest_leaves_02 brown_mud_leaves_01
get dirt brown_mud_02 dry_ground_01 rocky_trail
get sand coast_sand_01 aerial_beach_01 gravelly_sand
get rock rock_face aerial_rocks_02 rocky_terrain_02
get snow snow_02 snow_field_aerial snow_01
get bark bark_brown_02 pine_bark bark_willow_02
echo "Done. Serve the folder (python3 -m http.server 8000) and open http://localhost:8000"
