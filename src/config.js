import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export const urlParams = new URLSearchParams(location.search);
// ?quality=low: smaller textures and shadow maps, lower resolution, for slower computers
export const QUALITY = urlParams.get('quality') === 'low' ? 'low' : 'high';

// ---------------------------------------------------------------------------
// Settings: change the map size here
// ---------------------------------------------------------------------------
export const WORLD = {
  size: 1024,        // width and depth of the map in metres (256 generates in about a second; 1024 takes longer)
  height: 128,       // vertical extent in metres
  voxel: 2,          // metres between terrain samples; bigger = coarser ground, faster generation
  waterLevel: 20,
  treeSpacing: 2.6,  // smaller = denser forests
};
WORLD.caveFloor = WORLD.waterLevel + 1;                                // caves stay above the water
WORLD.volcanoes = Math.min(4, Math.max(1, Math.round((WORLD.size / 512) ** 2)));  // about one per 512 x 512 m, at most 4

export const PLAYER = {
  radius: 0.4,
  segment: 1.0,        // capsule segment; total height = segment + 2 * radius = 1.8 m
  walkSpeed: 5.5,
  sprintSpeed: 10,
  jumpSpeed: 8.5,
  gravity: -25,
  maxSlopeDeg: 47,     // steeper than this you can't stand, walk up or jump from
  flySpeed: 14,        // creative mode
  reach: 5.5,          // how far away you can break and place things
};
export const SLOPE_Y = Math.cos(THREE.MathUtils.degToRad(PLAYER.maxSlopeDeg));
