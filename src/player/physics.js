import * as THREE from 'three';
import { state } from '../state.js';
import { PLAYER, SLOPE_Y, WORLD } from '../config.js';
import { lantern } from '../render/scene.js';
import { CELL, cellKey, chunksIn, obstacleGrid, terrainFns } from '../world/world.js';
import { craterLavaAt, lavaTouching } from '../world/volcano.js';
import { sampleField } from '../terrain/material.js';
import { fluidAt } from '../world/fluids.js';
import { FOOT_OFFSET, player, respawn } from './character.js';
import { animateCharacter } from './animation.js';
import { inventoryOpen } from '../inventory/inventory.js';
import { damagePlayer } from './survival.js';
import { mouse, swingTime } from './interaction.js';
import { keys } from '../ui/input.js';
import { held } from '../ui/keybinds.js';

// ---------------------------------------------------------------------------
// Collision: capsule vs. terrain triangles (BVH), tree trunks and boulders.
// Each push-out is classified by its direction: walkable ground, a steep slope
// (pushed out sideways only, so it can't lift you up), or a ceiling.
// ---------------------------------------------------------------------------
const _box = new THREE.Box3(), _seg = new THREE.Line3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _off = new THREE.Vector3();
// steep: pushed sideways by a slope, wall, trunk or block; slope: by a slope too steep to stand on
export const contact = { ground: false, steep: false, slope: false, ceiling: false, steepN: new THREE.Vector3() };

function applyPush(dir, depth) {
  if (dir.y >= SLOPE_Y) {
    // walkable: resolve straight up, so standing still on a slope doesn't creep downhill
    contact.ground = true;
    _off.set(0, depth / dir.y, 0);
  } else if (dir.y > 0.05) {
    // steep: resolve the overlap horizontally, never upwards
    const h2 = Math.max(dir.x * dir.x + dir.z * dir.z, 0.2);
    _off.set(dir.x * depth / h2, 0, dir.z * depth / h2);
    contact.steep = contact.slope = true;
    contact.steepN.x += dir.x; contact.steepN.z += dir.z;
  } else {
    _off.copy(dir).multiplyScalar(depth);
    if (dir.y < -0.3) contact.ceiling = true;
    else { contact.steep = true; contact.steepN.x += dir.x; contact.steepN.z += dir.z; }
  }
  _seg.start.add(_off);
  _seg.end.add(_off);
}

function collideCapsule() {
  const r = PLAYER.radius;
  _seg.start.copy(player.position);
  _seg.end.copy(player.position).y -= PLAYER.segment;
  _box.makeEmpty();
  _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end);
  _box.min.addScalar(-r); _box.max.addScalar(r);

  for (const c of chunksIn(_box.min.x, _box.max.x, _box.min.z, _box.max.z)) {
    c.geometry.boundsTree.shapecast({
      intersectsBounds: (box) => box.intersectsBox(_box),
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(_seg, _v1, _v2);
        if (distance < r) applyPush(_v2.sub(_v1).normalize(), r - distance);
      },
    });
  }

  const gx = Math.floor(_seg.start.x / CELL), gz = Math.floor(_seg.start.z / CELL);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const list = obstacleGrid.get(cellKey(gx + dx, gz + dz));
    if (!list) continue;
    for (const o of list) {
      if (o.type === 'cyl') {
        if (_seg.end.y - r > o.y1 || _seg.start.y + r < o.y0) continue;
        const ox = _seg.start.x - o.x, oz = _seg.start.z - o.z;
        const d = Math.hypot(ox, oz), min = o.r + r;
        if (d < min && d > 1e-5) {
          _off.set(ox / d * (min - d), 0, oz / d * (min - d));
          _seg.start.add(_off); _seg.end.add(_off);
          contact.steep = true; contact.steepN.x += ox / d; contact.steepN.z += oz / d;
        }
      } else if (o.type === 'tris') {
        if (_seg.end.y - r > o.max.y || _seg.start.y + r < o.min.y) continue;
        for (const tri of o.tris) {
          const distance = tri.closestPointToSegment(_seg, _v1, _v2);
          if (distance < r) applyPush(_v2.sub(_v1).normalize(), r - distance);
        }
      } else if (o.type === 'box') {
        // closest points between the capsule segment and a placed block, found by alternating projection
        _v3.copy(_seg.start).clamp(o.min, o.max);
        for (let k = 0; k < 3; k++) { _seg.closestPointToPoint(_v3, true, _v1); _v3.copy(_v1).clamp(o.min, o.max); }
        _seg.closestPointToPoint(_v3, true, _v1);
        const d = _v1.distanceTo(_v3);
        if (d < r && d > 1e-5) applyPush(_v1.sub(_v3).divideScalar(d), r - d);
        else if (d <= 1e-5) { _v1.set(0, 1, 0); applyPush(_v1, o.max.y - _seg.end.y + r); }
      } else {
        _v3.set(o.x, o.y, o.z);
        _seg.closestPointToPoint(_v3, true, _v1);
        const d = _v1.distanceTo(_v3), min = o.r + r;
        if (d < min && d > 1e-5) applyPush(_v1.sub(_v3).divideScalar(d), min - d);
      }
    }
  }

  // keep the player inside the map
  const pad = 1.5;
  const cx = THREE.MathUtils.clamp(_seg.start.x, pad, WORLD.size - pad) - _seg.start.x;
  const cz = THREE.MathUtils.clamp(_seg.start.z, pad, WORLD.size - pad) - _seg.start.z;
  _seg.start.x += cx; _seg.end.x += cx; _seg.start.z += cz; _seg.end.z += cz;
}





// Walking into a low ledge (a slab, a stair, a crease or lump in the ground) steps up onto it instead
// of stopping you dead: try the same move from up to STEP higher, and keep it if that gets further.
const STEP = 0.55, _from = new THREE.Vector3(), _blocked = new THREE.Vector3(), _steepN = new THREE.Vector3(), _saved = { ground: false, steep: false, slope: false, ceiling: false };
function stepUp(dt) {
  const want = Math.hypot(player.velocity.x, player.velocity.z) * dt;
  if (want < 1e-4) return;
  _blocked.copy(player.position);
  _saved.ground = contact.ground; _saved.steep = contact.steep; _saved.slope = contact.slope; _saved.ceiling = contact.ceiling;
  _steepN.copy(contact.steepN);
  const gotBlocked = Math.hypot(_blocked.x - _from.x, _blocked.z - _from.z);
  // lift, move across, then settle back down onto whatever is there
  player.position.set(_from.x + player.velocity.x * dt, _from.y + STEP, _from.z + player.velocity.z * dt);
  contact.ground = contact.steep = contact.slope = contact.ceiling = false; contact.steepN.set(0, 0, 0);
  collideCapsule();
  player.position.copy(_seg.start);
  const lifted = !contact.ceiling;
  player.position.y -= STEP;
  contact.ground = contact.steep = contact.slope = contact.ceiling = false; contact.steepN.set(0, 0, 0);
  collideCapsule();
  player.position.copy(_seg.start);
  const got = Math.hypot(player.position.x - _from.x, player.position.z - _from.z);
  if (lifted && contact.ground && got > gotBlocked + want * 0.3 && player.position.y - _from.y < STEP + 0.05) return; // stepped up
  // no better: back to where the wall stopped you
  player.position.copy(_blocked);
  contact.ground = _saved.ground; contact.steep = _saved.steep; contact.slope = _saved.slope; contact.ceiling = _saved.ceiling;
  contact.steepN.copy(_steepN);
}

function stepPhysics(dt, inputDir, speed) {
  const feet = player.position.y - FOOT_OFFSET;
  // water and lava you can swim in: the sea, lakes, the crater lakes and poured fluid cells
  const fl = fluidAt(player.position.x, feet + 0.05, player.position.z);
  const W = Math.max(terrainFns.waterAt(player.position.x, player.position.z), craterLavaAt(player.position.x, player.position.z), fl ? fl.top : -Infinity);
  const depth = W - feet;
  player.inWater = depth > 0.3;
  const swimming = depth > 1.25;
  player.swimDepth = depth; player.swimming = swimming && !state.creative; // for the swimming animation

  // gravity (and buoyancy when swimming); creative mode flies
  if (state.creative) {
    const up = (held(keys, 'jump') ? 1 : 0) - (held(keys, 'sprint') ? 1 : 0);
    player.velocity.y += (up * PLAYER.flySpeed * 0.8 - player.velocity.y) * (1 - Math.exp(-10 * dt));
  } else if (swimming) {
    // you float with your head out of the water; Space swims up, Shift dives
    const dive = held(keys, 'sprint');
    const want = held(keys, 'jump') ? 3.2 : dive ? -2.6 : THREE.MathUtils.clamp((depth - 1.45) * 2.5, -2, 2.2);
    player.velocity.y += (want - player.velocity.y) * Math.min(1, dt * 3);
  } else {
    player.velocity.y += PLAYER.gravity * dt;
  }

  const k = 1 - Math.exp(-(player.onGround || state.creative ? 16 : swimming ? 5 : 3) * dt);
  player.velocity.x += (inputDir.x * speed - player.velocity.x) * k;
  player.velocity.z += (inputDir.z * speed - player.velocity.z) * k;

  _from.copy(player.position);
  player.position.addScaledVector(player.velocity, dt);
  const fallSpeed = -player.velocity.y, wasOnGround = player.onGround;

  contact.ground = contact.steep = contact.slope = contact.ceiling = false;
  contact.steepN.set(0, 0, 0);
  collideCapsule();
  player.position.copy(_seg.start);
  if (contact.steep && wasOnGround && !swimming && !state.creative && inputDir.lengthSq() > 0) stepUp(dt);

  player.onGround = contact.ground;
  // fall damage: hitting the ground faster than after about a 5 m drop hurts, on flat ground and
  // on slopes alike (sliding down a slope is capped below that speed, so it never hurts)
  if ((contact.ground || contact.slope) && fallSpeed > 16 && !player.inWater && !state.creative) damagePlayer((fallSpeed - 16) * 6, 'fell too far');
  if (contact.ground) {
    player.lastGroundTime = state.gameTime;
    if (player.velocity.y < 0) player.velocity.y = state.creative ? 0 : -2.5; // keeps you stuck to the ground going downhill
  }
  if (contact.steep) {
    // remove any velocity pushing into the steep surface (no climbing it)
    const n = contact.steepN;
    const len = Math.hypot(n.x, n.z);
    if (len > 1e-5) {
      const nx = n.x / len, nz = n.z / len;
      const into = player.velocity.x * nx + player.velocity.z * nz;
      if (into < 0) { player.velocity.x -= nx * into; player.velocity.z -= nz * into; }
    }
    if (!contact.ground) player.velocity.y = Math.max(player.velocity.y, -14); // slide down steep slopes
  }
  if (contact.ceiling && player.velocity.y > 0) player.velocity.y = 0;
}

// Collision only pushes you out of ground surfaces you touch; if the middle of your body ever ends
// up inside solid ground (the ground was changed right where you stand), lift you to open air.
function unbury() {
  const { x, z } = player.position, mid = player.position.y - PLAYER.segment * 0.5;
  if (sampleField(x, mid, z) <= 0.3) return;
  for (let dy = 0.5; dy <= 12; dy += 0.5) {
    if (sampleField(x, mid + dy, z) <= 0 && sampleField(x, player.position.y + dy + 0.4, z) <= 0 && sampleField(x, mid + dy - PLAYER.segment * 0.5 - 0.3, z) <= 0) {
      player.position.y += dy; player.velocity.set(0, 0, 0);
      return;
    }
  }
}

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _input = new THREE.Vector3();

export function updatePlayer(dt) {
  _fwd.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  _right.set(-_fwd.z, 0, _fwd.x);
  _input.set(0, 0, 0);
  if (!inventoryOpen) {
    if (held(keys, 'forward')) _input.add(_fwd);
    if (held(keys, 'back')) _input.sub(_fwd);
    if (held(keys, 'right')) _input.add(_right);
    if (held(keys, 'left')) _input.sub(_right);
  }
  const moving = _input.lengthSq() > 0;
  if (moving) _input.normalize();

  player.sprinting = held(keys, 'sprint') && moving && !state.creative && !player.swimming;
  let speed = state.creative ? PLAYER.flySpeed : player.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (player.inWater && !state.creative) speed *= 0.55;
  if (player.inLava && !state.creative) speed *= 0.5;

  // jump only from walkable ground (with a short grace period after leaving it)
  const canJump = player.onGround || state.gameTime - player.lastGroundTime < 0.12;
  if (held(keys, 'jump') && canJump && !player.inWater && !state.creative) {
    player.velocity.y = PLAYER.jumpSpeed;
    player.onGround = false;
    player.lastGroundTime = -1;
  }

  const steps = 5;
  for (let i = 0; i < steps; i++) stepPhysics(dt / steps, _input, speed);

  if (player.position.y < -20) respawn();
  unbury();
  // the view follows small steps up and down smoothly instead of jerking (not jumps, falls or teleports)
  const dy = player.position.y - player.viewY, settled = state.gameTime - player.lastGroundTime < 0.15 && player.velocity.y < 1;
  if (!settled || Math.abs(dy) > 1.2 || state.creative) player.viewY = player.position.y;
  else player.viewY += dy * Math.min(1, dt * 14);
  // lava burns while you're in it (and a little longer); creative mode just bounces you out
  const feet = player.position.y - FOOT_OFFSET;
  player.inLava = lavaTouching(player.position.x, feet, player.position.z) || fluidAt(player.position.x, feet + 0.05, player.position.z)?.type === 'lava';
  if (player.inLava) {
    if (state.creative) player.velocity.y = 12;
    else state.burning = Math.max(state.burning, 3);
  }

  // Character visuals
  if (mouse.left || mouse.right || swingTime > 0) {
    let diff = state.yaw - player.facing;
    player.facing += Math.atan2(Math.sin(diff), Math.cos(diff)) * Math.min(1, dt * 14);
  } else if (moving) {
    const target = Math.atan2(-_input.x, -_input.z);
    let diff = target - player.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.facing += diff * Math.min(1, dt * 12);
  }
  animateCharacter(dt);

  lantern.position.set(player.position.x, player.position.y + 0.3, player.position.z);
}
