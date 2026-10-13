import * as THREE from 'three';
import { ExtendedTriangle } from 'three-mesh-bvh';
import { state } from '../state.js';
import { hash1, mulberry32 } from '../noise.js';
import { canvasTexture } from './plant-looks.js';
import { litMaterial, scene } from '../render/scene.js';
import { PLAYER } from '../config.js';
import { solidCell } from '../terrain/voxels.js';
import { clearSlope } from './query.js';
import { FOOT_OFFSET, player } from '../player/character.js';
import { addObstacle, gridRemove, obstacleGrid, world } from './world.js';
import { WEDGES, boxUVs, mergeGeometries, roundedBox, shapeGeometry, sharpShape } from './shapes.js';
import { catalogBlocks } from './block-catalog.js';
import { blockIconURL, drawTexture } from './block-textures.js';
export { SHAPES, SHAPE_NAMES, shapeGeometry } from './shapes.js';

// ---------------------------------------------------------------------------
// Placed blocks: 1 m cells on a grid, drawn with one InstancedMesh per block type and shape
// ---------------------------------------------------------------------------
export const BLOCKS = {
  dirt:         { name: 'Dirt', mat: 'dirt', natural: true },
  sand:         { name: 'Sand', mat: 'sand', natural: true },
  stone:        { name: 'Stone', mat: 'stone', natural: true },
  stone_bricks: { name: 'Stone bricks', mat: 'stone' },
  smooth_stone: { name: 'Smooth stone', mat: 'stone' },
  glass:        { name: 'Glass', mat: 'glass', glass: true },
  workbench:    { name: 'Workbench', mat: 'wood', station: true },
  campfire:     { name: 'Campfire', mat: 'soft', solid: false, station: true, glow: 0xff8a30 },
  furnace:      { name: 'Furnace', mat: 'stone', station: true, facing: true, glow: 0xff7a30 },
  purifier:     { name: 'Water filter', mat: 'wood', station: true },
  // storage: right click to put things in; `storage` is how many stacks it holds
  basket:       { name: 'Wicker basket', mat: 'wood', model: 'basket', storage: 9, facing: true },
  chest:        { name: 'Chest', mat: 'wood', model: 'chest', storage: 18, facing: true },
  crate:        { name: 'Large crate', mat: 'wood', model: 'crate', storage: 36, facing: true },
  // woods, stones, ground, metal and coloured blocks, torches and lanterns (see block-catalog.js)
  ...catalogBlocks(),
};
const MAX_BLOCKS = 4096;       // per block type and shape, to start with; a full group doubles
export const blockGroups = {};         // "type|shape" (or "type|shape|area") -> { meshes, keys, area }
export const blocks = new Map();       // "x,y,z" -> { type, shape, x, y, z, idx, obstacles }
export const blockKey = (x, y, z) => `${x},${y},${z}`;
export function resetBlocks() { blocks.clear(); hidden.clear(); for (const k in areas) delete areas[k]; glowing.clear(); saplings.clear(); for (const k in blockGroups) delete blockGroups[k]; }
// Blocks the world builds but nobody can see yet (inside an ice spike, or under the ground): kept
// aside and only placed when a neighbour is taken away, so they cost nothing to draw until then.
export const hidden = new Map();       // "x,y,z" -> [type, x, y, z, shape, tilt, opts]
export function hideBlock(type, x, y, z, shape = 'block', tilt = 0, opts = {}) {
  const key = blockKey(x, y, z);
  if (blocks.has(key) || hidden.has(key)) return false;
  hidden.set(key, [type, x, y, z, shape, tilt, opts]);
  return true;
}
function revealAround(x, y, z) {
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const k = blockKey(x + dx, y + dy, z + dz), h = hidden.get(k);
    if (h) { hidden.delete(k); placeBlock(...h); }
  }
}

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
// A block's texture: catalogue blocks are drawn from their description, the first few by hand above.
const _blockTex = {};
function blockTexture(type) {
  if (_blockTex[type]) return _blockTex[type];
  const tex = BLOCKS[type].tex;
  let t;
  if (tex) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    drawTexture(c.getContext('2d'), 256, 128, tex, mulberry32(hashString(type)));
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
  } else t = drawBlockTexture(type);
  t.anisotropy = 8;
  return (_blockTex[type] = t);
}
const hashString = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
// A little picture of the block for the inventory, made the first time it's shown.
const _icons = {};
export const blockIcon = (type) => _icons[type] || (_icons[type] = blockIconURL(blockTexture(type).image));
export const hasBlockIcon = (type) => !!_icons[type];

const _blockMats = {};
export function blockMaterial(type) {
  if (_blockMats[type]) return _blockMats[type];
  const def = BLOCKS[type], glass = !!def.glass, map = blockTexture(type);
  const rough = { glass: 0.05, ice: 0.12, metal: 0.35, stone: 0.85 }[def.mat] ?? 0.8;
  const m = new THREE.MeshStandardMaterial({
    map, bumpMap: glass || def.cutout ? null : map, bumpScale: 1.6, roughness: type === 'smooth_stone' || type.startsWith('polished_') ? 0.5 : rough,
    metalness: def.mat === 'metal' ? 0.55 : 0,
    transparent: glass, depthWrite: !glass, side: glass || def.cutout ? THREE.DoubleSide : THREE.FrontSide,
    alphaTest: def.cutout ? 0.5 : 0,
  });
  if (def.glow) { m.emissive.set(0xffffff); m.emissiveMap = map; m.emissiveIntensity = 0.7; }
  return (_blockMats[type] = m);
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

// A young tree: a thin stem with a few leaves; base at y = 0.
function saplingParts(def) {
  const leaf = new THREE.Color().setHSL(def.leaves[0] / 360, def.leaves[1] / 100, def.leaves[2] / 100).getHex();
  const parts = [[new THREE.CylinderGeometry(0.025, 0.04, 0.5, 5).translate(0, 0.25, 0), 0x6b4a2f]];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push([new THREE.IcosahedronGeometry(0.11 + (i % 2) * 0.03, 0).scale(1, 0.7, 1).translate(Math.cos(a) * 0.1, 0.42 + (i % 3) * 0.07, Math.sin(a) * 0.1), leaf]);
  }
  return [new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }))];
}
// A fence: a post with two rails running sideways across the cell (it turns with the way you look),
// textured with the wood's planks; centred like a block.
function fenceParts(type) {
  const box = (w, h, d, y) => new THREE.BoxGeometry(w, h, d).translate(0, y, 0);
  const geo = boxUVs(mergeGeometries([box(0.24, 1, 0.24, 0), box(1, 0.12, 0.1, 0.25), box(1, 0.12, 0.1, -0.12)]));
  return [new THREE.Mesh(geo, blockMaterial(type))];
}
// A torch on a stick, and a lantern: an iron cage around a glowing light; base at y = 0.
function torchParts() {
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.55, 6).translate(0, 0.275, 0), new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }));
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0).scale(1, 1.6, 1).translate(0, 0.62, 0), new THREE.MeshStandardMaterial({ color: 0xffc060, emissive: 0xff8a20, emissiveIntensity: 2 }));
  return [stick, flame];
}
function lanternParts() {
  const cage = new THREE.Mesh(mergeColored([
    [roundedBox(0.36, 0.06, 0.36, 0, 0.03, 0), 0x3a3c40], [roundedBox(0.3, 0.06, 0.3, 0, 0.47, 0), 0x3a3c40], [new THREE.TorusGeometry(0.06, 0.012, 4, 10).translate(0, 0.54, 0), 0x3a3c40],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => [new THREE.BoxGeometry(0.03, 0.4, 0.03).translate(x * 0.15, 0.24, z * 0.15), 0x3a3c40]),
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }));
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.24).translate(0, 0.24, 0), new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xffa040, emissiveIntensity: 1.8, transparent: true, opacity: 0.85 }));
  return [cage, light];
}
// A smelter: a squat brick kiln with a roaring fire mouth on the front (+z), a crucible glowing on
// top under a hood, and a chimney; base at y = 0.
function smelterParts() {
  const brick = 0x9a4a32, dark = 0x5e2c1e;
  const base = new THREE.Mesh(mergeColored([
    [roundedBox(1, 0.7, 1, 0, 0.35, 0), brick], [roundedBox(1.02, 0.1, 1.02, 0, 0.12, 0), dark], [roundedBox(1.02, 0.1, 1.02, 0, 0.66, 0), dark],
    [roundedBox(0.5, 0.36, 0.14, 0, 0.32, 0.45), 0x1c1512],
    [new THREE.CylinderGeometry(0.3, 0.42, 0.22, 10).translate(0, 0.82, 0), brick],
    [roundedBox(0.2, 0.5, 0.2, 0.3, 1.05, -0.3), dark],
    [new THREE.CylinderGeometry(0.17, 0.13, 0.2, 10).translate(0, 0.98, 0), 0xb8a890],
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const hot = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff5a10, emissiveIntensity: 2.2 });
  const fire = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.02).translate(0, 0.3, 0.525), hot);
  const melt = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 10).translate(0, 1.075, 0), hot);
  return [base, fire, melt];
}
// An anvil on a tree stump: a heavy dark iron body with a horn pointing sideways; base at y = 0.
function anvilParts() {
  const iron = 0x3b3e43;
  const stump = new THREE.Mesh(mergeColored([
    [new THREE.CylinderGeometry(0.34, 0.38, 0.42, 9).translate(0, 0.21, 0), 0x6b4a2f], [new THREE.CylinderGeometry(0.3, 0.3, 0.02, 9).translate(0, 0.425, 0), 0xb08a5a],
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const body = new THREE.Mesh(mergeColored([
    [roundedBox(0.56, 0.12, 0.36, 0, 0.49, 0), iron], [roundedBox(0.3, 0.18, 0.22, 0, 0.64, 0), iron], [roundedBox(0.72, 0.16, 0.32, -0.04, 0.8, 0), iron],
    [new THREE.ConeGeometry(0.11, 0.34, 8).rotateZ(-Math.PI / 2).scale(1, 0.9, 1).translate(0.48, 0.81, 0), iron],
    [new THREE.BoxGeometry(0.68, 0.01, 0.28).translate(-0.04, 0.885, 0), 0x9aa0a8], // the worn, shiny face
  ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.7 }));
  return [stump, body];
}
// Bellows: two wooden boards with pleated leather between them and an iron nozzle at the front (+z),
// on a little stand; base at y = 0.
function bellowsParts() {
  const wood = 0x8a5a32, leather = 0x6e4421;
  const parts = [
    [roundedBox(0.7, 0.12, 0.18, 0, 0.06, -0.2), 0x5a3a20], [roundedBox(0.7, 0.12, 0.18, 0, 0.06, 0.2), 0x5a3a20],
    [new THREE.BoxGeometry(0.62, 0.05, 0.8).translate(0, 0.2, 0), wood],
    [new THREE.BoxGeometry(0.62, 0.05, 0.8).rotateX(-0.28).translate(0, 0.5, -0.06), wood],
    [new THREE.BoxGeometry(0.1, 0.05, 0.4).rotateX(-0.28).translate(0, 0.62, -0.5), wood], // handle
    [new THREE.CylinderGeometry(0.05, 0.08, 0.32, 8).rotateX(Math.PI / 2).translate(0, 0.28, 0.52), 0x4a4d52],
  ];
  for (let k = 0; k < 4; k++) parts.push([new THREE.BoxGeometry(0.6 - k * 0.02, 0.07, 0.72 - k * 0.12).translate(0, 0.25 + k * 0.065, -0.04 - k * 0.04), k % 2 ? leather : 0x8a5a3a]);
  return [new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }))];
}

// Storage, base at y = 0. A wicker basket woven of light bands with two handles; a wooden chest
// with iron bands, corners and a lock on the front (+z); a big crate of rough boards with cross
// braces, as high as a block.
function basketParts() {
  const parts = [];
  for (let k = 0; k < 6; k++) parts.push([new THREE.CylinderGeometry(0.33 + k * 0.01, 0.32 + k * 0.01, 0.075, 12).translate(0, 0.04 + k * 0.075, 0), k % 2 ? 0xb88a50 : 0xd2a868]);
  parts.push([new THREE.CylinderGeometry(0.32, 0.32, 0.02, 12).translate(0, 0.02, 0), 0x8a6638]);
  for (const s of [-1, 1]) parts.push([new THREE.TorusGeometry(0.11, 0.022, 5, 10, Math.PI).translate(s * 0.3, 0.44, 0).rotateY(Math.PI / 2), 0xa07840]);
  return [new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }))];
}
function chestParts() {
  const wood = 0x9a6a3a, band = 0x45484d;
  const parts = [
    [roundedBox(0.86, 0.5, 0.62, 0, 0.25, 0), wood], [roundedBox(0.88, 0.22, 0.64, 0, 0.6, 0), 0xa87440],
    [new THREE.BoxGeometry(0.89, 0.025, 0.65).translate(0, 0.5, 0), 0x3a2a18],
    [roundedBox(0.12, 0.16, 0.04, 0, 0.47, 0.33), 0xc8a050],
  ];
  for (const x of [-0.3, 0.3]) parts.push([new THREE.BoxGeometry(0.07, 0.74, 0.66).translate(x, 0.36, 0), band]);
  return [new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 }))];
}
function crateParts() {
  const board = 0xb08858, brace = 0x8a6a40, parts = [[roundedBox(0.98, 0.98, 0.98, 0, 0.49, 0), board]];
  for (const [ax, s] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
    const g = (k) => new THREE.BoxGeometry(0.98, 0.1, 0.03).rotateZ(k);
    for (const geo of [g(0).translate(0, 0.07, 0), g(0).translate(0, 0.91, 0), g(Math.PI / 4.4).scale(0.97, 1, 1).translate(0, 0.49, 0)]) {
      geo.translate(0, 0, s * 0.5);
      if (ax) geo.rotateY(Math.PI / 2);
      parts.push([geo, brace]);
    }
  }
  return [new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }))];
}

// Blocks drawn with their own model stand on the bottom of their cell instead of being centred.
const BASED = new Set(['campfire', 'furnace', 'purifier', 'smelter', 'anvil', 'bellows']);
const isBased = (type) => BASED.has(type) || ['sapling', 'torch', 'lantern', 'basket', 'chest', 'crate'].includes(BLOCKS[type].model);
function blockTemplates(type, shape) {
  const def = BLOCKS[type];
  switch (def.model || type) {
    case 'campfire': return campfireParts();
    case 'furnace': return furnaceParts();
    case 'purifier': return purifierParts();
    case 'smelter': return smelterParts();
    case 'anvil': return anvilParts();
    case 'bellows': return bellowsParts();
    case 'sapling': return saplingParts(def);
    case 'fence': return fenceParts(type);
    case 'torch': return torchParts();
    case 'lantern': return lanternParts();
    case 'basket': return basketParts();
    case 'chest': return chestParts();
    case 'crate': return crateParts();
  }
  return [new THREE.Mesh(shapeGeometry(shape), blockMaterial(type))];
}

// The instanced meshes for one block type in one shape, made the first time one is placed. Blocks
// the world builds itself (ice spikes) go in groups of their own per area (`tag`), so a group that's
// out of view is skipped as a whole.
function blockGroup(type, shape, tag) {
  const k = tag ? `${type}|${shape}|${tag}` : `${type}|${shape}`;
  if (blockGroups[k]) return blockGroups[k];
  const def = BLOCKS[type];
  const templates = blockTemplates(type, shape);
  const meshes = templates.map((t) => {
    const im = new THREE.InstancedMesh(t.geometry, t.material, tag ? 256 : MAX_BLOCKS);
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    im.count = 0;
    im.castShadow = !def.glass; im.receiveShadow = true;
    im.frustumCulled = false; // instances are added later, so the bounding sphere would be stale (see sealBlocks)
    litMaterial(im.material);
    world.add(im);
    return im;
  });
  return (blockGroups[k] = { meshes, keys: [], key: k, shape, area: tag && areas[tag] });
}
// A full group moves into meshes twice the size.
function growGroup(bt) {
  bt.meshes = bt.meshes.map((im) => {
    const big = new THREE.InstancedMesh(im.geometry, im.material, im.instanceMatrix.count * 2);
    big.setColorAt(0, _bc.setScalar(1));
    big.instanceMatrix.array.set(im.instanceMatrix.array); big.instanceColor.array.set(im.instanceColor.array);
    big.count = im.count;
    big.castShadow = im.castShadow; big.receiveShadow = im.receiveShadow; big.frustumCulled = im.frustumCulled;
    if (big.frustumCulled) big.computeBoundingSphere();
    im.parent.add(big); im.removeFromParent(); im.dispose();
    return big;
  });
}
// Once the world has built the blocks of an area (centred on cx, cz), its groups can be culled when
// out of view (the player only takes blocks out of them, so the bounds stay big enough), and are
// hidden in the distance like trees (`area`, see updateCulling in main.js).
const areas = {};
// In the distance an area's blocks are drawn as plain sharp shapes: the rounded edges can't be seen
// from there, and they cost fifteen times the triangles.
const _farGeos = {};
export function farBlockGeometry(shape) {
  if (_farGeos[shape]) return _farGeos[shape];
  const g = WEDGES[shape] ? sharpShape(shape).clone()
    : shape === 'pillar' ? new THREE.CylinderGeometry(0.3, 0.3, 1, 8).toNonIndexed()
    : shape === 'block' ? new THREE.BoxGeometry(1, 1, 1).toNonIndexed() : null;
  return (_farGeos[shape] = g ? boxUVs(g) : shapeGeometry(shape));
}
export function sealBlocks(tag, cx, cz) {
  areas[tag] = { cx, cz };
  for (const k in blockGroups) {
    if (!k.endsWith(`|${tag}`)) continue;
    blockGroups[k].area = areas[tag];
    for (const im of blockGroups[k].meshes) { im.computeBoundingSphere(); im.frustumCulled = true; }
  }
}
export function initBlocks() {}

// Collision shapes for a placed block, in world space: boxes, or triangles for slopes and prisms.
// Boxes are given in the block's own space (-0.5..0.5) and turned with it; turns are quarter turns,
// so a turned box is still an axis-aligned box.
const LOCAL_BOXES = {
  block: [[-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]],
  slab: [[-0.5, -0.5, -0.5, 0.5, 0, 0.5]],
  pillar: [[-0.3, -0.5, -0.3, 0.3, 0.5, 0.3]],
  fence: [[-0.5, -0.5, -0.14, 0.5, 0.5, 0.14]],  // turned with the fence
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
  if (WEDGES[shape]) {
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
// `turn` (optional) faces it a given way instead of the way you look; `tag` puts it in an area's group.
export function placeBlock(type, x, y, z, shape = 'block', tilt = 0, { turn: setTurn, tag } = {}) {
  const def = BLOCKS[type];
  if (def.station || def.solid === false || def.model) shape = 'block';
  const key = blockKey(x, y, z);
  if (blocks.has(key)) return false;
  hidden.delete(key);
  if (def.solid !== false) clearSlope(x, y, z);
  const bt = blockGroup(type, shape, tag);
  if (bt.keys.length >= bt.meshes[0].instanceMatrix.count) growGroup(bt);
  const idx = bt.keys.length;
  // campfires get a random turn; furnaces, slopes, stairs and prisms turn with the way you look
  const facing = setTurn ?? Math.round(state.yaw / (Math.PI / 2)) * (Math.PI / 2);
  if (def.station || def.solid === false || def.model) tilt = 0;
  const turn = type === 'campfire' || def.model === 'sapling' ? hash1(x + z * 7) * 6 : def.facing || def.model === 'fence' || shape !== 'block' || tilt ? facing : 0;
  const based = isBased(type); // these models stand on y = 0 instead of being centred
  _bm.makeRotationY(turn).multiply(_tilt.makeRotationX(tilt === 1 ? Math.PI / 2 : tilt === 2 ? Math.PI : 0)).setPosition(x + 0.5, based ? y : y + 0.5, z + 0.5);
  _bc.setScalar(0.93 + hash1(x * 7.1 + y * 3.3 + z * 1.7) * 0.1);
  for (const im of bt.meshes) {
    im.setMatrixAt(idx, _bm); im.setColorAt(idx, _bc);
    im.count = idx + 1;
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  }
  bt.keys.push(key);
  const b = { type, shape, x, y, z, idx, group: bt.key, obstacles: def.solid === false ? [] : blockObstacles(def.model === 'fence' ? 'fence' : shape, x, y, z, _bm) };
  for (const o of b.obstacles) addObstacle(o);
  blocks.set(key, b);
  if (def.glow) glowing.add(b);
  if (def.model === 'sapling') { b.plantedAt = state.gameTime; saplings.add(b); }
  if (def.storage) b.items = new Array(def.storage).fill(null);
  return true;
}

export function removeBlock(key) {
  const b = blocks.get(key);
  if (!b) return null;
  const bt = blockGroups[b.group], last = bt.keys.length - 1;
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
  glowing.delete(b); saplings.delete(b);
  if (hidden.size) revealAround(b.x, b.y, b.z);
  return b;
}

// Torches, lanterns, campfires and other glowing blocks light up what's around them. Lights are
// expensive (and adding one makes every material rebuild its shader), so there's a small fixed set,
// made the first time something glowing is placed and moved each frame to the glowing blocks
// nearest the camera.
const glowing = new Set(), saplings = new Set();
const LIGHTS = 4, blockLights = [];
const _near = new Array(LIGHTS).fill(null), _nearD = new Float32Array(LIGHTS);
function updateBlockLights(time, cam) {
  if (!glowing.size && !blockLights.length) return;
  // lights belong to the scene, not the world group, so they survive making a new world
  if (!blockLights.length) for (let i = 0; i < LIGHTS; i++) { const l = new THREE.PointLight(0xffb060, 0, 11, 1.6); scene.add(l); blockLights.push(l); }
  // the LIGHTS nearest glowing blocks within 50 m (insertion into a small sorted list)
  _near.fill(null); _nearD.fill(50 * 50);
  for (const b of glowing) {
    const d = (b.x + 0.5 - cam.x) ** 2 + (b.y + 0.5 - cam.y) ** 2 + (b.z + 0.5 - cam.z) ** 2;
    if (d >= _nearD[LIGHTS - 1]) continue;
    let k = LIGHTS - 1;
    while (k > 0 && _nearD[k - 1] > d) { _nearD[k] = _nearD[k - 1]; _near[k] = _near[k - 1]; k--; }
    _nearD[k] = d; _near[k] = b;
  }
  blockLights.forEach((l, i) => {
    const b = _near[i];
    if (!b) { l.intensity = 0; return; }
    l.color.set(BLOCKS[b.type].glow);
    l.position.set(b.x + 0.5, b.y + (isBased(b.type) ? 0.7 : 0.5), b.z + 0.5);
    l.intensity = (b.type === 'campfire' || b.type === 'torch' ? 9 + Math.sin(time * 9 + i) * 1.2 : 8);
  });
}

// Saplings grow into trees of blocks after a while, if there's room.
const GROW_AFTER = 60; // seconds, plus up to the same again
function growSaplings(time) {
  for (const b of [...saplings]) {
    if (time - b.plantedAt < GROW_AFTER * (1 + hash1(b.x * 3.1 + b.z * 1.7))) continue;
    const def = BLOCKS[b.type], w = def.wood, big = w === 'dark_oak' || w === 'redwood' || w === 'jungle';
    const log = w === 'oak' ? 'log' : `${w}_log`, leaves = `${w}_leaves`;
    const h = (big ? 6 : 4) + Math.floor(hash1(b.x + b.z * 13) * 3);
    // the trunk needs open air all the way up, and not you standing in it; otherwise try again later
    let room = true;
    for (let k = 1; k < h + 2 && room; k++) room = cellOpen(b.x, b.y + k, b.z);
    if (!room || !cellOpen(b.x, b.y, b.z, true)) { b.plantedAt = time; continue; }
    removeBlock(blockKey(b.x, b.y, b.z));
    for (let k = 0; k < h; k++) placeBlock(log, b.x, b.y + k, b.z);
    const top = b.y + h, r = big ? 3 : 2;
    for (let dy = -2; dy <= 1; dy++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      const rr = r - (dy === 1 ? 1 : 0);
      if (dx * dx + dz * dz > rr * rr + 1 || (dx === 0 && dz === 0 && dy < 0)) continue;
      if (hash1(b.x + dx * 7 + (top + dy) * 3 + dz * 11) < 0.12) continue; // a few gaps
      if (cellOpen(b.x + dx, top + dy, b.z + dz)) placeBlock(leaves, b.x + dx, top + dy, b.z + dz); // leaves only where there's room
    }
  }
}
// Is a cell free for a growing tree: no block, no ground, and not where the player is?
// (`self`: the sapling's own cell, which only needs to be clear of the player.)
function cellOpen(x, y, z, self = false) {
  if (!self && (blocks.has(blockKey(x, y, z)) || solidCell(x, y, z))) return false;
  const p = player.position, feet = p.y - FOOT_OFFSET;
  return !(p.x + PLAYER.radius > x && p.x - PLAYER.radius < x + 1 && p.z + PLAYER.radius > z && p.z - PLAYER.radius < z + 1 && feet < y + 1 && p.y + PLAYER.radius > y);
}
let _growTimer = 0; // saplings are checked a couple of times a second, not every frame

export function updateBlocks(time, dt, cam) {
  updateBlockLights(time, cam);
  if ((_growTimer += dt) > 0.5) { _growTimer = 0; growSaplings(time); }
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
