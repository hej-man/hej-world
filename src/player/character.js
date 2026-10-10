import * as THREE from 'three';
import { PLAYER, SLOPE_Y, WORLD } from '../config.js';
import { scene } from '../render/scene.js';
import { loadArea, terrainFns } from '../world/world.js';
import { groundAt } from '../world/query.js';
import { grassGroup } from '../world/grass.js';
import { ITEMS } from '../inventory/inventory.js';
import { BLOCKS, blockMaterial, shapeGeometry } from '../world/blocks.js';

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------
// The explorer: jointed arms (shoulder, elbow) and legs (hip, knee, ankle), a body that leans and
// twists, a head that turns towards where you look, a backpack and hat, armour that shows when
// worn, and the selected tool or block in the right hand. Feet at y = 0, facing -Z.
function buildCharacter() {
  const g = new THREE.Group(), root = new THREE.Group();
  g.add(root);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const skin = mat(0xf0c49a), shirt = mat(0xc8463d), pants = mat(0x34507e), boots = mat(0x3b2a1e), hair = mat(0x3a2618);
  const dark = mat(0x1a1a1a), pack = mat(0x8a6a3a), strap = mat(0x5a4326), belt = mat(0x2e2218), white = mat(0xf4f1ea), hatM = mat(0x9c7a46);
  const M = (geo, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
  const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };

  // legs: hip -> thigh -> knee -> shin -> ankle -> boot
  const legs = [-1, 1].map((side) => {
    const hip = joint(root, side * 0.115, 0.93, 0);
    M(cap(0.085, 0.28), pants, 0, -0.22, 0, hip);
    const knee = joint(hip, 0, -0.44, 0);
    M(cap(0.075, 0.27), pants, 0, -0.2, 0, knee);
    const ankle = joint(knee, 0, -0.42, 0);
    M(new THREE.BoxGeometry(0.15, 0.12, 0.28), boots, 0, -0.01, -0.05, ankle);
    M(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 10), boots, 0, 0.06, 0, ankle);
    return { hip, knee, ankle };
  });
  M(new THREE.BoxGeometry(0.36, 0.2, 0.22), pants, 0, 0.98, 0, root); // pelvis

  // upper body: everything above the waist turns and leans together
  const spine = joint(root, 0, 1.02, 0);
  const chest = M(cap(0.19, 0.24), shirt, 0, 0.26, 0, spine);
  chest.scale.set(1.18, 1, 0.78);
  M(new THREE.BoxGeometry(0.38, 0.06, 0.24), belt, 0, 0.04, 0, spine);
  M(new THREE.BoxGeometry(0.07, 0.06, 0.03), mat(0xc9a64a, { metalness: 0.6, roughness: 0.4 }), 0, 0.04, -0.125, spine); // buckle
  const armour = M(cap(0.205, 0.2), mat(0x7a4a26), 0, 0.28, 0, spine);
  armour.scale.set(1.2, 1, 0.82); armour.visible = false;
  // backpack with a bedroll on top, and its straps
  M(new THREE.BoxGeometry(0.34, 0.4, 0.17), pack, 0, 0.28, 0.21, spine);
  M(new THREE.BoxGeometry(0.26, 0.14, 0.05), strap, 0, 0.2, 0.31, spine);
  M(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 10).rotateZ(Math.PI / 2), mat(0x5d7a52), 0, 0.53, 0.2, spine);
  for (const side of [-1, 1]) M(new THREE.BoxGeometry(0.05, 0.36, 0.03), strap, side * 0.1, 0.32, -0.15, spine);

  // head: neck, face, hair and the explorer's hat
  M(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin, 0, 0.5, 0, spine);
  const head = joint(spine, 0, 0.56, 0);
  M(new THREE.SphereGeometry(0.135, 16, 12), skin, 0, 0.1, 0, head).scale.set(1, 1.1, 1);
  const hairCap = M(new THREE.SphereGeometry(0.142, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.115, 0.012, head);
  hairCap.rotation.x = 0.25;
  for (const side of [-1, 1]) {
    M(new THREE.SphereGeometry(0.024, 8, 6), white, side * 0.05, 0.12, -0.118, head);
    M(new THREE.SphereGeometry(0.013, 6, 4), dark, side * 0.05, 0.12, -0.137, head);
    M(new THREE.BoxGeometry(0.05, 0.012, 0.012), hair, side * 0.05, 0.158, -0.128, head);    // brows
    M(new THREE.SphereGeometry(0.03, 8, 6), skin, side * 0.135, 0.1, 0, head).scale.set(0.5, 1, 0.8); // ears
  }
  M(new THREE.BoxGeometry(0.03, 0.04, 0.035), skin, 0, 0.085, -0.14, head); // nose
  M(new THREE.BoxGeometry(0.05, 0.008, 0.01), mat(0x9a4a40), 0, 0.045, -0.128, head); // mouth
  M(new THREE.CylinderGeometry(0.24, 0.25, 0.025, 20), hatM, 0, 0.22, 0, head);
  M(new THREE.CylinderGeometry(0.12, 0.15, 0.12, 16), hatM, 0, 0.29, 0, head);
  M(new THREE.CylinderGeometry(0.152, 0.152, 0.03, 16), strap, 0, 0.25, 0, head);

  // arms: shoulder -> upper arm -> elbow -> forearm -> hand (the right hand holds things)
  const arms = [-1, 1].map((side) => {
    const shoulder = joint(spine, side * 0.255, 0.42, 0);
    M(new THREE.SphereGeometry(0.075, 10, 8), shirt, 0, -0.01, 0, shoulder);
    M(cap(0.065, 0.2), shirt, 0, -0.15, 0, shoulder);
    const elbow = joint(shoulder, 0, -0.29, 0);
    M(cap(0.056, 0.18), skin, 0, -0.12, 0, elbow);
    const hand = joint(elbow, 0, -0.27, 0);
    M(new THREE.SphereGeometry(0.062, 10, 8), skin, 0, 0, 0, hand).scale.set(0.9, 1.1, 0.9);
    return { shoulder, elbow, hand };
  });
  const held = joint(arms[1].hand, 0, -0.02, 0);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { root, spine, head, legs, arms, held, armour, heldId: null, phase: 0, land: 0, air: 0, swing: 0 };
  return g;
}

// A simple model of a held item: tools by type and material, blocks as a small textured cube.
const TIER_COLOR = [0x9c6b3c, 0x9c6b3c, 0x8d8a85, 0xdfe3e8];
export function heldItemModel(id) {
  const def = id && ITEMS[id];
  if (!def) return null;
  const g = new THREE.Group();
  const M = (geo, color, x, y, z, metal = false) => {
    const o = new THREE.Mesh(geo, color.isMaterial ? color : new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.35 : 0.8, metalness: metal ? 0.7 : 0 }));
    o.position.set(x, y, z); o.castShadow = true; g.add(o); return o;
  };
  const head = TIER_COLOR[def.tier || 0], metal = def.tier === 3;
  if (def.tool) {
    if (def.tool === 'sword') {
      M(new THREE.BoxGeometry(0.03, 0.12, 0.03), 0x5a3c22, 0, 0, 0);
      M(new THREE.BoxGeometry(0.16, 0.03, 0.04), 0x5a3c22, 0, 0.07, 0);
      M(new THREE.BoxGeometry(0.06, 0.55, 0.015), head, 0, 0.36, 0, metal);
    } else {
      M(new THREE.CylinderGeometry(0.018, 0.02, 0.6, 6), 0x7a5230, 0, 0.2, 0);
      if (def.tool === 'pickaxe') { const b = M(new THREE.BoxGeometry(0.42, 0.05, 0.05), head, 0, 0.47, 0, metal); b.scale.y = 1; }
      if (def.tool === 'axe') M(new THREE.BoxGeometry(0.03, 0.16, 0.14), head, 0, 0.44, -0.07, metal);
      if (def.tool === 'shovel') M(new THREE.BoxGeometry(0.13, 0.17, 0.02), head, 0, 0.56, 0, metal);
    }
  } else if (def.wand) {
    M(new THREE.CylinderGeometry(0.012, 0.016, 0.4, 6), 0x6b4a2f, 0, 0.12, 0);
    const c = M(new THREE.OctahedronGeometry(0.05), 0x9fe8ff, 0, 0.35, 0);
    c.material.emissive.set(0x3aa8d0);
  } else if (def.place && BLOCKS[def.place] && !BLOCKS[def.place].station) {
    const b = M(shapeGeometry('block'), blockMaterial(def.place), 0, 0.08, -0.04);
    b.scale.setScalar(0.2);
  } else return null;
  return g;
}

export const character = buildCharacter();
scene.add(character, grassGroup);

// `player.position` is the centre of the top sphere of the capsule.
export const player = {
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  onGround: false,
  lastGroundTime: -1,
  facing: 0,
  walkPhase: 0,
  spawn: new THREE.Vector3(),
  inWater: false,
  swimming: false,
  swimDepth: 0,
};
export const FOOT_OFFSET = PLAYER.segment + PLAYER.radius;
export const EYE_OFFSET = 0.2;

export function findSpawn() {
  // stand on the ledge in front of the big cave, facing into it
  const t = terrainFns.tunnel;
  loadArea(t[0].x, t[0].z, 24);
  const dir = new THREE.Vector3().subVectors(t[2], t[0]).setY(0).normalize();
  for (const back of [7, 6, 8, 5, 9, 4, 10]) {
    const x = t[0].x - dir.x * back, z = t[0].z - dir.z * back;
    const hit = groundAt(x, z);
    if (hit && hit.point.y > terrainFns.waterAt(x, z) + 0.3 && hit.face.normal.y > SLOPE_Y) {
      player.spawn.set(x, hit.point.y + FOOT_OFFSET + 0.3, z);
      return Math.atan2(-dir.x, -dir.z);
    }
  }
  loadArea(WORLD.size / 2, WORLD.size / 2, 8);
  const hit = groundAt(WORLD.size / 2, WORLD.size / 2);
  player.spawn.set(WORLD.size / 2, (hit ? hit.point.y : WORLD.height) + FOOT_OFFSET + 1, WORLD.size / 2);
  return 0;
}

export function respawn() {
  loadArea(player.spawn.x, player.spawn.z, 40);
  player.position.copy(player.spawn);
  player.velocity.set(0, 0, 0);
}
