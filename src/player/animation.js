import * as THREE from 'three';
import { state } from '../state.js';
import { PLAYER } from '../config.js';
import { smoothstep } from '../noise.js';
import { camera, prepareLighting, scene } from '../render/scene.js';
import { terrainFns } from '../world/world.js';
import { FOOT_OFFSET, character, heldItemModel, player } from './character.js';
import { slots } from '../inventory/inventory.js';
import { stats } from './survival.js';
import { mouse, swingTime } from './interaction.js';
import { gameState } from '../ui/menu.js';

// Poses the character each frame: walk and run cycles with bending knees and elbows, a forward lean
// when sprinting, jumping and landing, swimming strokes, tool swings, breathing and head turns.
// Every joint eases towards its target angle, so moving between poses is smooth.
export function animateCharacter(dt) {
  const C = character.userData, [legL, legR] = C.legs, [armL, armR] = C.arms;
  const grounded = state.gameTime - player.lastGroundTime < 0.15;
  const hSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  const depth = terrainFns.waterAt(player.position.x, player.position.z) - (player.position.y - FOOT_OFFSET);
  const swimming = !state.creative && depth > 1.1, flying = state.creative && !grounded;
  const walk = Math.min(1, hSpeed / 4), run = smoothstep(PLAYER.walkSpeed, PLAYER.sprintSpeed, hSpeed);
  if (!grounded) C.air += dt; else { if (C.air > 0.35) C.land = 0.22; C.air = 0; }
  C.land = Math.max(0, C.land - dt);
  C.phase += dt * (grounded ? hSpeed * 1.75 : swimming ? 3.5 : 0);
  const p = C.phase, t = state.gameTime;
  const attacking = swingTime > 0 || (mouse.left && (state.locked || state.testMode));
  if (attacking) C.swing = (C.swing + dt * 3.2) % 1; else C.swing = 0;

  // targets (radians): + on x swings a limb forward, - bends a knee back
  const T = { rootX: 0, rootY: 0, spineX: 0, spineY: 0, headX: 0, headY: 0,
    hip: [0, 0], knee: [0, 0], ankle: [0, 0], shX: [0, 0], shZ: [0.08, -0.08], elbow: [0.15, 0.15] };
  if (swimming) {
    const moving = hSpeed > 0.5;
    T.rootX = moving ? -1.2 : -0.25;
    for (let i = 0; i < 2; i++) {
      const s = Math.sin(t * 7 + i * Math.PI);
      T.hip[i] = s * 0.35; T.knee[i] = -0.25 - Math.max(0, s) * 0.3;
      T.shX[i] = moving ? -2.4 + Math.sin(p) * 0.9 : 0.4 + Math.sin(t * 2 + i) * 0.4;
      T.shZ[i] = (i ? -1 : 1) * (moving ? 0.5 + Math.cos(p) * 0.4 : 0.9);
      T.elbow[i] = 0.4;
    }
    T.headX = moving ? 0.9 : 0;
  } else if (flying) {
    T.spineX = -0.15; T.hip = [0.15, -0.1]; T.knee = [-0.35, -0.2]; T.shZ = [0.35, -0.35]; T.elbow = [0.3, 0.3];
  } else if (!grounded) {
    // jumping or falling: knees up, arms out for balance
    const fall = player.velocity.y < 0 ? 1 : 0.5;
    T.hip = [0.75, -0.15]; T.knee = [-1.1, -0.55 * fall]; T.ankle = [0.3, 0.2];
    T.shX = [-0.5, -0.9]; T.shZ = [0.55, -0.55]; T.elbow = [0.4, 0.5]; T.spineX = 0.05;
  } else {
    const amp = walk * (0.5 + run * 0.35);
    for (let i = 0; i < 2; i++) {
      const ph = p + i * Math.PI, s = Math.sin(ph);
      T.hip[i] = s * amp;
      T.knee[i] = -Math.max(0, Math.sin(ph - 1.2)) * (0.75 + run * 0.75) * walk - 0.04;   // knee bends as the leg swings forward
      T.ankle[i] = Math.max(0, -Math.cos(ph)) * 0.25 * walk;
      T.shX[i] = -s * (0.45 + run * 0.4) * walk;                                         // arms swing opposite the legs
      T.elbow[i] = 0.15 + walk * (0.25 + run * 0.9);
      T.shZ[i] = (i ? -1 : 1) * (0.06 + 0.02 * Math.sin(t * 1.6));
    }
    T.spineX = -0.06 * walk - 0.22 * run;
    T.spineY = Math.sin(p) * 0.12 * walk;
    if (C.land > 0) { const k = C.land / 0.22; T.hip = [0.5 * k, 0.5 * k]; T.knee = [-1 * k, -1 * k]; T.spineX -= 0.25 * k; }
  }
  // the head turns and tilts towards where the camera looks (within what a neck can do)
  const look = Math.atan2(Math.sin(state.yaw - player.facing), Math.cos(state.yaw - player.facing));
  T.headY += THREE.MathUtils.clamp(look, -1, 1) * 0.8;
  T.headX += THREE.MathUtils.clamp(state.pitch + 0.25, -0.5, 0.5) * 0.7;
  // swinging a tool: the right arm comes down from over the shoulder, the body twists into it
  if (attacking) {
    const k = C.swing < 0.35 ? C.swing / 0.35 : 1 - (C.swing - 0.35) / 0.65, e = k * k * (3 - 2 * k);
    T.shX[1] = THREE.MathUtils.lerp(-2.7, 0.3, 1 - e); T.elbow[1] = 0.3 + 0.5 * e; T.shZ[1] = -0.15;
    T.spineY += -0.35 * e + 0.2;
  }
  // breathing
  C.spine.scale.y = 1 + Math.sin(t * 2.1) * 0.012;

  const k = 1 - Math.exp(-dt * (attacking ? 22 : 13)), ease = (o, axis, v) => { o.rotation[axis] += (v - o.rotation[axis]) * k; };
  ease(C.root, 'x', T.rootX); ease(C.spine, 'x', T.spineX); ease(C.spine, 'y', T.spineY); ease(C.head, 'x', T.headX); ease(C.head, 'y', T.headY);
  [legL, legR].forEach((L, i) => { ease(L.hip, 'x', T.hip[i]); ease(L.knee, 'x', T.knee[i]); ease(L.ankle, 'x', T.ankle[i]); });
  [armL, armR].forEach((A, i) => { ease(A.shoulder, 'x', T.shX[i]); ease(A.shoulder, 'z', T.shZ[i]); ease(A.elbow, 'x', T.elbow[i]); });

  // body height: a little bob when walking, crouch on landing; lifted when swimming so the head is above water
  const bob = grounded ? Math.abs(Math.sin(p)) * 0.045 * walk - (C.land / 0.22) * 0.12 : 0;
  C.root.position.y = swimming ? 0.7 : bob;
  character.position.set(player.position.x, player.position.y - FOOT_OFFSET, player.position.z);
  character.rotation.y = player.facing;
  character.visible = state.thirdPerson;

  // what's in the right hand, and armour when worn
  const id = slots[state.selectedSlot]?.id || null;
  if (id !== C.heldId) {
    C.heldId = id;
    C.held.clear();
    const m = heldItemModel(id);
    if (m) { m.rotation.x = -Math.PI / 2 + 0.25; C.held.add(m); prepareLighting(m); }
    viewModel.setItem(id);
  }
  const arm = stats.armour;
  C.armour.visible = arm > 0;
  if (arm > 0) { C.armour.material.color.set(arm >= 0.5 ? 0xa9afb7 : 0x7a4a26); C.armour.material.metalness = arm >= 0.5 ? 0.75 : 0; C.armour.material.roughness = arm >= 0.5 ? 0.35 : 0.85; }
}

// First person: your right hand and the held item at the bottom right of the view, swinging when you use it.
export const viewModel = (() => {
  const g = new THREE.Group();
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: 0xf0c49a, roughness: 0.8 }));
  fist.position.set(0, -0.02, 0.06);
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: 0xc8463d, roughness: 0.8 }));
  sleeve.position.set(0, -0.02, 0.26);
  const item = new THREE.Group();
  g.add(fist, sleeve, item);
  g.position.set(0.3, -0.27, -0.45);
  g.visible = false;
  camera.add(g);
  scene.add(camera);
  let t = 0;
  return {
    group: g,
    setItem(id) { item.clear(); const m = heldItemModel(id); if (m) { m.rotation.set(-Math.PI / 2 + 0.6, 0.3, 0); m.position.set(0, 0, -0.03); m.scale.setScalar(0.6); item.add(m); prepareLighting(m); } },
    update(dt) {
      g.visible = !state.thirdPerson && gameState === 'playing';
      if (!g.visible) return;
      const hs = Math.hypot(player.velocity.x, player.velocity.z), grounded = player.onGround;
      t += dt * (grounded ? hs * 1.75 : 0);
      const attacking = swingTime > 0 || (mouse.left && (state.locked || state.testMode));
      const sw = attacking ? Math.sin((state.gameTime * 3.2 % 1) * Math.PI) : 0;
      g.position.set(0.3 + Math.cos(t) * 0.012 * Math.min(1, hs / 4), -0.27 + Math.abs(Math.sin(t)) * 0.012 * Math.min(1, hs / 4) - sw * 0.05, -0.45 - sw * 0.08);
      g.rotation.set(-sw * 0.9, 0.08, sw * 0.2);
    },
  };
})();
