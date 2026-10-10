import * as THREE from 'three';
import { state } from '../state.js';
import { camera } from '../render/scene.js';
import { colliders } from '../world/world.js';
import { raycaster } from '../world/query.js';
import { EYE_OFFSET, player } from './character.js';

export const CAM_DISTANCES = [3.5, 6, 10];
const camState = { dist: 6 };

const _target = new THREE.Vector3(), _camDir = new THREE.Vector3(), _back = new THREE.Vector3();

export function updateCamera(dt) {
  _target.set(player.position.x, player.position.y + EYE_OFFSET, player.position.z);
  if (!state.thirdPerson) {
    camera.position.copy(_target);
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
    return;
  }
  const want = CAM_DISTANCES[state.camDistIndex];
  _camDir.set(-Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch));
  // front view: the camera sits out in front (where you're looking, mirrored up and down) and looks back at you
  if (state.view === 'front') _camDir.set(-_camDir.x, _camDir.y, -_camDir.z);
  raycaster.set(_target, _back.copy(_camDir).negate());
  raycaster.far = want + 0.4;
  const hit = raycaster.intersectObjects(colliders, false)[0];
  const wanted = hit ? Math.max(0.4, hit.distance - 0.35) : want;
  camState.dist = wanted < camState.dist ? wanted : camState.dist + (wanted - camState.dist) * Math.min(1, dt * 4);
  camera.position.copy(_target).addScaledVector(_camDir, -camState.dist);
  camera.lookAt(_target);
}

// Where you aim from and in which direction: the camera, except in the front view, where the camera
// looks at you, so you aim from your eyes the way you're facing.
export function aimRay(origin, dir) {
  if (state.view !== 'front') { camera.getWorldDirection(dir); origin.copy(camera.position); return; }
  dir.set(-Math.sin(state.yaw) * Math.cos(state.pitch), Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch));
  origin.set(player.position.x, player.position.y + EYE_OFFSET, player.position.z);
}
