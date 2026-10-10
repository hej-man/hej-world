import * as THREE from 'three';
import { ExtendedTriangle } from 'three-mesh-bvh';
import { state } from '../state.js';
import { hash1, mulberry32 } from '../noise.js';
import { canvasTexture } from './plant-looks.js';
import { litMaterial } from '../render/scene.js';
import { addObstacle, gridRemove, obstacleGrid, world } from './world.js';
import { roundedBox, shapeGeometry, sharpShape } from './shapes.js';
export { SHAPES, SHAPE_NAMES, shapeGeometry } from './shapes.js';

// ---------------------------------------------------------------------------
// Placed blocks: 1 m cells on a grid, drawn with one InstancedMesh per block type and shape
// ---------------------------------------------------------------------------
export const BLOCKS = {
  dirt:         { name: 'Dirt', colors: [0x7a5a3a], mat: 'dirt' },
  sand:         { name: 'Sand', colors: [0xd9c793], mat: 'sand' },
  log:          { name: 'Log', colors: [0x7a5532, 0xc29a64], mat: 'wood' },  // [sides, top]
  planks:       { name: 'Planks', colors: [0xb8894d], mat: 'wood' },
  stone:        { name: 'Stone', colors: [0x86837e], mat: 'stone' },
  stone_bricks: { name: 'Stone bricks', colors: [0xa19e98], mat: 'stone' },
  smooth_stone: { name: 'Smooth stone', colors: [0xb4b1ab], mat: 'stone' },
  glass:        { name: 'Glass', colors: [0xcdeaf5], mat: 'soft', glass: true },
  wool:         { name: 'Wool', colors: [0xf2efe6], mat: 'soft' },
  workbench:    { name: 'Workbench', colors: [0x5a2f1c, 0xd8bf8f], mat: 'wood', station: true },
  campfire:     { name: 'Campfire', mat: 'soft', solid: false, station: true },
  furnace:      { name: 'Furnace', mat: 'stone', station: true, facing: true },
  purifier:     { name: 'Water filter', mat: 'wood', station: true },
};
const MAX_BLOCKS = 4096;       // per block type and shape
export const blockGroups = {};         // "type|shape" -> { meshes: InstancedMesh[], keys: string[] }
export const blocks = new Map();       // "x,y,z" -> { type, shape, x, y, z, idx, obstacles }
export const blockKey = (x, y, z) => `${x},${y},${z}`;
export function resetBlocks() { blocks.clear(); for (const k in blockGroups) delete blockGroups[k]; }

// Merges [geometry, colour] pairs into one vertex-coloured geometry, keeping each part's normals.
function mergeColored(parts) {
  const pos = [], nor = [], col = [], c = new THREE.Color();
  for (const [g, hex] of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array);
    c.set(hex);
    for (let i = 0; i < ng.attributes.position.count; i++) col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// Block textures, drawn once on canvases: [side | top], 128 x 128 pixels each.
function drawBlockTexture(type) {
  return canvasTexture(256, (g, S) => {
    const rand = mulberry32(type.length * 131 + type.charCodeAt(0));
    const H = S / 2; // the canvas is square; only the top half (256 x 128) is used, stretched over v 0..1
    g.canvas.height = H;
    const speckle = (x0, w, alpha, light = false) => {
      for (let i = 0; i < w * H / 6; i++) {
        g.fillStyle = light ? `rgba(255,255,255,${alpha * rand()})` : `rgba(0,0,0,${alpha * rand()})`;
        g.fillRect(x0 + rand() * w, rand() * H, 1 + rand() * 1.5, 1 + rand() * 1.5);
      }
    };
    const planks = (x0, w, hue = 32, lit = 52) => {
      const rows = 4, bh = H / rows;
      for (let r = 0; r < rows; r++) {
        const l = lit + (rand() - 0.5) * 10;
        g.fillStyle = `hsl(${hue + (rand() - 0.5) * 6}, 42%, ${l}%)`; g.fillRect(x0, r * bh, w, bh);
        for (let k = 0; k < 9; k++) { // grain
          g.strokeStyle = `hsla(${hue - 6}, 45%, ${l - 14 - rand() * 10}%, ${0.25 + rand() * 0.35})`; g.lineWidth = 0.8 + rand();
          const y = r * bh + 2 + rand() * (bh - 4), amp = 0.6 + rand() * 1.5, ph = rand() * 6;
          g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x0 + x, y + Math.sin(x * 0.05 + ph) * amp); g.stroke();
        }
        g.fillStyle = 'rgba(30, 18, 8, 0.75)'; g.fillRect(x0, r * bh, w, 1.5);  // gap between boards
        const j = x0 + 12 + rand() * (w - 24); g.fillRect(j, r * bh, 1.5, bh);     // end joint
        g.fillStyle = 'rgba(25,20,15,0.8)'; for (const nx of [j - 5, j + 5]) g.fillRect(nx, r * bh + bh / 2 - 1, 2, 2); // nails
      }
    };
    const stoneBase = (x0, w) => {
      g.fillStyle = '#56534f'; g.fillRect(x0, 0, w, H);
      for (let i = 0; i < 22; i++) { // rounded stones with darker gaps between them
        const cx = x0 + rand() * w, cy = rand() * H, rx = 14 + rand() * 16, ry = 10 + rand() * 12, l = 46 + rand() * 18;
        g.save(); g.beginPath(); g.rect(x0, 0, w, H); g.clip();
        const grd = g.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 2, cx, cy, Math.max(rx, ry));
        grd.addColorStop(0, `hsl(30, 4%, ${l + 10}%)`); grd.addColorStop(1, `hsl(30, 4%, ${l - 8}%)`);
        g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, rx, ry, rand() * 3, 0, Math.PI * 2); g.fill(); g.restore();
      }
      speckle(x0, w, 0.25); speckle(x0, w, 0.12, true);
    };
    const halves = (fn) => { fn(0, H); fn(H, H); };
    switch (type) {
      case 'planks': halves((x0, w) => planks(x0, w)); break;
      case 'workbench': {
        // sides: dark red-brown frame with corner legs, a drawer and a tool rack, so it can't be
        // mistaken for planks; top: a pale worn slab with a carved crafting grid and a tool on it
        g.fillStyle = '#5a2f1c'; g.fillRect(0, 0, H, H);
        for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(30, 12, 6, ${0.2 + rand() * 0.3})`; g.lineWidth = 1; const y = rand() * H; g.beginPath(); g.moveTo(0, y); g.lineTo(H, y + (rand() - 0.5) * 4); g.stroke(); }
        g.fillStyle = '#3a1d10'; g.fillRect(0, 0, 14, H); g.fillRect(H - 14, 0, 14, H); g.fillRect(0, 0, H, 12); // legs and top rail
        g.fillStyle = '#7a4a2a'; g.fillRect(24, 66, H - 48, 34); g.strokeStyle = '#2a120a'; g.lineWidth = 3; g.strokeRect(24, 66, H - 48, 34); // drawer
        g.fillStyle = '#c9b48a'; g.fillRect(H / 2 - 10, 80, 20, 5); // drawer handle
        g.fillStyle = '#2b2b2e'; for (const [x, y] of [[2, 2], [H - 12, 2], [2, H - 12], [H - 12, H - 12]]) g.fillRect(x, y, 10, 10); // iron corner brackets
        g.fillStyle = '#9aa0a6'; g.fillRect(30, 22, 30, 6); g.fillStyle = '#6b3b1e'; g.fillRect(58, 20, 14, 10); // a chisel on the rack
        g.fillStyle = '#9aa0a6'; g.fillRect(84, 18, 18, 12); g.fillStyle = '#6b3b1e'; g.fillRect(91, 30, 5, 26); // and a hammer
        speckle(0, H, 0.15);
        g.fillStyle = '#d8bf8f'; g.fillRect(H, 0, H, H);
        for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(150, 110, 60, ${0.15 + rand() * 0.25})`; g.lineWidth = 1 + rand(); const y = rand() * H; g.beginPath(); g.moveTo(H, y); g.lineTo(S, y + (rand() - 0.5) * 6); g.stroke(); }
        g.strokeStyle = '#5a2f1c'; g.lineWidth = 10; g.strokeRect(H + 5, 5, H - 10, H - 10); // dark border, like the frame
        g.strokeStyle = 'rgba(90, 47, 28, 0.9)'; g.lineWidth = 3; // carved 3 x 3 crafting grid
        for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(H + 24 + k * 27, 24); g.lineTo(H + 24 + k * 27, 105); g.moveTo(H + 24, 24 + k * 27); g.lineTo(H + 105, 24 + k * 27); g.stroke(); }
        g.strokeRect(H + 24, 24, 81, 81);
        g.fillStyle = 'rgba(160, 60, 40, 0.55)'; g.fillRect(H + 53, 53, 23, 23); // a red mark in the middle square
        break;
      }
      case 'dirt': halves((x0, w) => {
        g.fillStyle = '#6e4f33'; g.fillRect(x0, 0, w, H);
        for (let i = 0; i < 260; i++) { // clods and little stones
          const l = 20 + rand() * 22, stone = rand() < 0.12;
          g.fillStyle = stone ? `hsl(30, 6%, ${45 + rand() * 20}%)` : `hsl(${24 + rand() * 10}, 38%, ${l}%)`;
          g.beginPath(); g.ellipse(x0 + rand() * w, rand() * H, stone ? 2 + rand() * 3 : 3 + rand() * 6, stone ? 2 + rand() * 2 : 2 + rand() * 4, rand() * 3, 0, Math.PI * 2); g.fill();
        }
        speckle(x0, w, 0.3);
      }); break;
      case 'sand': halves((x0, w) => {
        g.fillStyle = '#d8c48e'; g.fillRect(x0, 0, w, H);
        for (let k = 0; k < 7; k++) { // faint ripples
          g.strokeStyle = 'rgba(160, 130, 80, 0.18)'; g.lineWidth = 2;
          const y = 8 + k * 17 + rand() * 6; g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x0 + x, y + Math.sin(x * 0.07 + k) * 3); g.stroke();
        }
        speckle(x0, w, 0.18); speckle(x0, w, 0.25, true);
      }); break;
      case 'smooth_stone': halves((x0, w) => {
        const grd = g.createLinearGradient(x0, 0, x0 + w, H); grd.addColorStop(0, '#b9b6b0'); grd.addColorStop(1, '#a29f99');
        g.fillStyle = grd; g.fillRect(x0, 0, w, H);
        speckle(x0, w, 0.1); speckle(x0, w, 0.1, true);
        g.strokeStyle = 'rgba(70, 68, 64, 0.5)'; g.lineWidth = 3; g.strokeRect(x0 + 6, 6, w - 12, H - 12); // a chiselled border
      }); break;
      case 'log': {
        g.fillStyle = '#5e4129'; g.fillRect(0, 0, H, H);
        for (let i = 0; i < 26; i++) { // bark furrows
          const x = rand() * H; g.strokeStyle = `rgba(${20 + rand() * 20}, 12, 6, ${0.5 + rand() * 0.4})`; g.lineWidth = 1.5 + rand() * 3;
          g.beginPath(); for (let y = 0; y <= H; y += 8) g.lineTo(x + Math.sin(y * 0.08 + i) * 3, y); g.stroke();
        }
        speckle(0, H, 0.2, true);
        g.fillStyle = '#c99d63'; g.fillRect(H, 0, H, H);
        for (let r = 6; r < 56; r += 5 + rand() * 4) { g.strokeStyle = `rgba(120, 78, 38, ${0.4 + rand() * 0.3})`; g.lineWidth = 1 + rand(); g.beginPath(); g.arc(H * 1.5, H / 2, r, 0, Math.PI * 2); g.stroke(); }
        g.strokeStyle = '#4a3220'; g.lineWidth = 9; g.beginPath(); g.arc(H * 1.5, H / 2, 60, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 8; g.strokeRect(H + 4, 4, H - 8, H - 8);
        break;
      }
      case 'stone': halves(stoneBase); break;
      case 'stone_bricks': halves((x0, w) => {
        g.fillStyle = '#8f8b85'; g.fillRect(x0, 0, w, H);
        const rows = 4, bh = H / rows;
        for (let r = 0; r < rows; r++) for (let c = -1; c < 3; c++) {
          const bx = x0 + c * 64 + (r % 2) * 32, l = 52 + rand() * 12;
          g.save(); g.beginPath(); g.rect(x0, 0, w, H); g.clip();
          g.fillStyle = `hsl(35, 5%, ${l}%)`; g.fillRect(bx + 2, r * bh + 2, 60, bh - 4);
          g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(bx + 2, r * bh + 2, 60, 2);
          g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(bx + 2, r * bh + bh - 4, 60, 2);
          g.restore();
        }
        speckle(x0, w, 0.2);
      }); break;
      case 'wool': halves((x0, w) => {
        g.fillStyle = '#efebe1'; g.fillRect(x0, 0, w, H);
        for (let i = 0; i < 500; i++) { // little curls of fibre
          g.strokeStyle = `rgba(150, 140, 120, ${0.15 + rand() * 0.2})`; g.lineWidth = 1;
          const x = x0 + rand() * w, y = rand() * H; g.beginPath(); g.arc(x, y, 2 + rand() * 3, rand() * 6, rand() * 6 + 3); g.stroke();
        }
      }); break;
      case 'glass': halves((x0, w) => {
        g.clearRect(x0, 0, w, H);
        g.fillStyle = 'rgba(200, 230, 240, 0.18)'; g.fillRect(x0, 0, w, H);
        g.strokeStyle = 'rgba(235, 248, 255, 0.9)'; g.lineWidth = 6; g.strokeRect(x0 + 3, 3, w - 6, H - 6);
        g.strokeStyle = 'rgba(255, 255, 255, 0.35)'; g.lineWidth = 5;
        for (const o of [30, 48]) { g.beginPath(); g.moveTo(x0 + o, 12); g.lineTo(x0 + 12, o); g.stroke(); }
      }); break;
      default: halves((x0, w) => { g.fillStyle = '#999'; g.fillRect(x0, 0, w, H); speckle(x0, w, 0.2); });
    }
  });
}
const _blockMats = {};
export function blockMaterial(type) {
  if (_blockMats[type]) return _blockMats[type];
  const glass = !!BLOCKS[type].glass, map = drawBlockTexture(type);
  map.anisotropy = 8;
  return (_blockMats[type] = new THREE.MeshStandardMaterial({
    map, bumpMap: map, bumpScale: glass ? 0 : 1.6, roughness: glass ? 0.05 : type === 'smooth_stone' ? 0.55 : type === 'stone' || type === 'stone_bricks' ? 0.9 : 0.8,
    transparent: glass, depthWrite: !glass, side: glass ? THREE.DoubleSide : THREE.FrontSide,
  }));
}

function campfireParts() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push([new THREE.DodecahedronGeometry(0.12, 0).translate(Math.cos(a) * 0.36, 0.08, Math.sin(a) * 0.36), 0x77736d]);
  }
  for (let i = 0; i < 3; i++) {
    const g = new THREE.CylinderGeometry(0.05, 0.06, 0.6, 5).rotateZ(Math.PI / 2 - 0.35).rotateY((i / 3) * Math.PI);
    parts.push([g.translate(0, 0.14, 0), 0x6b4a2f]);
  }
  const base = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.55, 5).translate(0, 0.42, 0),
    new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff5a10, emissiveIntensity: 1.6 }),
  );
  return [base, flame];
}

// A stone furnace with a glowing fire door on its front (+z) and a little chimney; base at y = 0.
// Built from rounded boxes like the placed blocks.
function furnaceParts() {
  const base = new THREE.Mesh(mergeColored([
    [roundedBox(1, 0.9, 1, 0, 0.45, 0), 0x86827c], [roundedBox(1, 0.16, 1, 0, 0.92, 0), 0x6f6c67],
    [roundedBox(0.62, 0.46, 0.18, 0, 0.36, 0.43), 0x2a2522], [roundedBox(0.28, 0.36, 0.28, 0.25, 1.16, -0.2), 0x75716b],
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.02).translate(0, 0.33, 0.523), new THREE.MeshStandardMaterial({ color: 0xff8a30, emissive: 0xff5a10, emissiveIntensity: 2 }));
  return [base, glow];
}

// A water filter: a wooden barrel of sand and charcoal under a glass jar of water, with a tap; base at y = 0.
function purifierParts() {
  const base = new THREE.Mesh(mergeColored([
    [roundedBox(0.8, 0.7, 0.8, 0, 0.35, 0), 0x8a5a32], [roundedBox(0.84, 0.08, 0.84, 0, 0.18, 0), 0x55575a], [roundedBox(0.84, 0.08, 0.84, 0, 0.56, 0), 0x55575a],
    [roundedBox(0.66, 0.06, 0.66, 0, 0.71, 0), 0xd9c38f], [roundedBox(0.1, 0.1, 0.18, 0, 0.2, 0.45), 0x9aa0a6],
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  const jar = new THREE.Mesh(roundedBox(0.5, 0.5, 0.5, 0, 0.99, 0), new THREE.MeshStandardMaterial({ color: 0x8fd0f0, roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false }));
  return [base, jar];
}

// The instanced meshes for one block type in one shape, made the first time one is placed.
function blockGroup(type, shape) {
  const k = `${type}|${shape}`;
  if (blockGroups[k]) return blockGroups[k];
  const def = BLOCKS[type];
  const templates = type === 'campfire' ? campfireParts() : type === 'furnace' ? furnaceParts() : type === 'purifier' ? purifierParts() : [new THREE.Mesh(shapeGeometry(shape), blockMaterial(type))];
  const meshes = templates.map((t) => {
    const im = new THREE.InstancedMesh(t.geometry, t.material, MAX_BLOCKS);
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    im.count = 0;
    im.castShadow = !def.glass; im.receiveShadow = true;
    im.frustumCulled = false; // instances are added later, so the bounding sphere would be stale
    litMaterial(im.material);
    world.add(im);
    return im;
  });
  return (blockGroups[k] = { meshes, keys: [] });
}
export function initBlocks() {}

// Collision shapes for a placed block, in world space: boxes, or triangles for slopes and prisms.
// Boxes are given in the block's own space (-0.5..0.5) and turned with it; turns are quarter turns,
// so a turned box is still an axis-aligned box.
const LOCAL_BOXES = {
  block: [[-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]],
  slab: [[-0.5, -0.5, -0.5, 0.5, 0, 0.5]],
  pillar: [[-0.3, -0.5, -0.3, 0.3, 0.5, 0.3]],
  stairs: [[-0.5, -0.5, -0.5, 0.5, 0, 0.5], [-0.5, 0, -0.5, 0.5, 0.5, 0]], // the upper step on the local -z half
};
const _ba = new THREE.Vector3(), _bb = new THREE.Vector3();
function blockObstacles(shape, x, y, z, m) {
  if (LOCAL_BOXES[shape]) return LOCAL_BOXES[shape].map(([x0, y0, z0, x1, y1, z1]) => {
    _ba.set(x0, y0, z0).applyMatrix4(m); _bb.set(x1, y1, z1).applyMatrix4(m);
    const min = _ba.clone().min(_bb), max = _ba.clone().max(_bb);
    for (const v of [min, max]) v.set(Math.round(v.x * 1000) / 1000, Math.round(v.y * 1000) / 1000, Math.round(v.z * 1000) / 1000);
    return { type: 'box', x: x + 0.5, z: z + 0.5, min, max };
  });
  if (shape === 'slope' || shape === 'prism') {
    const p = sharpShape(shape).attributes.position, tris = [];
    for (let i = 0; i < p.count; i += 3) {
      const t = new ExtendedTriangle();
      t.a.fromBufferAttribute(p, i).applyMatrix4(m); t.b.fromBufferAttribute(p, i + 1).applyMatrix4(m); t.c.fromBufferAttribute(p, i + 2).applyMatrix4(m);
      t.needsUpdate = true;
      tris.push(t);
    }
    return [{ type: 'tris', x: x + 0.5, z: z + 0.5, tris, min: new THREE.Vector3(x, y, z), max: new THREE.Vector3(x + 1, y + 1, z + 1) }];
  }
  return blockObstacles('block', x, y, z, m);
}

// How a block can be tipped before placing (T): upright, on its side (lying along the way you look),
// or upside down. The way you look also turns it in quarter turns.
export const TILTS = ['upright', 'on its side', 'upside down'];
const _tilt = new THREE.Matrix4();

const _bm = new THREE.Matrix4(), _bc = new THREE.Color();
export function placeBlock(type, x, y, z, shape = 'block', tilt = 0) {
  const def = BLOCKS[type];
  if (def.station || def.solid === false) shape = 'block';
  const key = blockKey(x, y, z), bt = blockGroup(type, shape);
  if (blocks.has(key) || bt.keys.length >= MAX_BLOCKS) return false;
  const idx = bt.keys.length;
  // campfires get a random turn; furnaces, slopes, stairs and prisms turn with the way you look
  const facing = Math.round(state.yaw / (Math.PI / 2)) * (Math.PI / 2);
  if (def.station || def.solid === false) tilt = 0;
  const turn = type === 'campfire' ? hash1(x + z * 7) * 6 : def.facing || shape !== 'block' || tilt ? facing : 0;
  const based = type === 'campfire' || type === 'furnace' || type === 'purifier'; // these models stand on y = 0 instead of being centred
  _bm.makeRotationY(turn).multiply(_tilt.makeRotationX(tilt === 1 ? Math.PI / 2 : tilt === 2 ? Math.PI : 0)).setPosition(x + 0.5, based ? y : y + 0.5, z + 0.5);
  _bc.setScalar(0.93 + hash1(x * 7.1 + y * 3.3 + z * 1.7) * 0.1);
  for (const im of bt.meshes) {
    im.setMatrixAt(idx, _bm); im.setColorAt(idx, _bc);
    im.count = idx + 1;
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  }
  bt.keys.push(key);
  const b = { type, shape, x, y, z, idx, obstacles: def.solid === false ? [] : blockObstacles(shape, x, y, z, _bm) };
  for (const o of b.obstacles) addObstacle(o);
  blocks.set(key, b);
  return true;
}

export function removeBlock(key) {
  const b = blocks.get(key);
  if (!b) return null;
  const bt = blockGroups[`${b.type}|${b.shape}`], last = bt.keys.length - 1;
  if (b.idx !== last) { // move the last instance into the freed slot
    const lastKey = bt.keys[last];
    for (const im of bt.meshes) {
      im.getMatrixAt(last, _bm); im.setMatrixAt(b.idx, _bm);
      im.getColorAt(last, _bc); im.setColorAt(b.idx, _bc);
    }
    blocks.get(lastKey).idx = b.idx;
    bt.keys[b.idx] = lastKey;
  }
  bt.keys.pop();
  for (const im of bt.meshes) { im.count = last; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  for (const o of b.obstacles) gridRemove(obstacleGrid, o);
  blocks.delete(key);
  return b;
}

export function updateCampfires(time) {
  const bt = blockGroups['campfire|block'];
  if (!bt || !bt.keys.length) return;
  const flame = bt.meshes[1];
  bt.keys.forEach((key, i) => {
    const b = blocks.get(key);
    const f = 0.85 + Math.sin(time * 11 + i * 3) * 0.12 + Math.sin(time * 17.3 + i) * 0.08;
    _bm.makeScale(1, f, 1).setPosition(b.x + 0.5, b.y, b.z + 0.5);
    flame.setMatrixAt(i, _bm);
  });
  flame.instanceMatrix.needsUpdate = true;
}

// Walks the block grid along a ray (Amanatides & Woo). Returns the first block hit with the face normal.
export function voxelRay(o, d, t0, t1) {
  const px = o.x + d.x * t0, py = o.y + d.y * t0, pz = o.z + d.z * t0;
  let x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
  let tmx = sx ? t0 + (sx > 0 ? x + 1 - px : px - x) * tdx : Infinity;
  let tmy = sy ? t0 + (sy > 0 ? y + 1 - py : py - y) * tdy : Infinity;
  let tmz = sz ? t0 + (sz > 0 ? z + 1 - pz : pz - z) * tdz : Infinity;
  let t = t0, n = [0, 0, 0];
  for (let i = 0; i < 64 && t <= t1; i++) {
    const key = blockKey(x, y, z);
    if (blocks.has(key)) return { key, t, normal: n, cell: [x, y, z] };
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; n = [-sx, 0, 0]; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; n = [0, -sy, 0]; }
    else { z += sz; t = tmz; tmz += tdz; n = [0, 0, -sz]; }
  }
  return null;
}
