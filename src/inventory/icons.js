// ---------------------------------------------------------------------------
// Item pictures drawn on a small canvas: tools in the colours of what they're made of, ingots,
// plates and rods, ores, crucibles and moulds, buckets and bottles, and the like. An item names its
// picture with `draw` (for example 'tool:pickaxe:steel', 'ingot:gold', 'molten:titanium'); a few
// older items are looked up by id. Each picture is drawn once, at twice the size it's shown so it
// stays sharp on high-resolution screens. Coordinates below are on a 48 x 48 grid.
// ---------------------------------------------------------------------------
const S = 48, SCALE = 2;

// light, mid, dark
export const MATERIAL_COLORS = {
  wood: ['#e2b47c', '#b07a44', '#6a4020'], stone: ['#cfccc6', '#8f8c86', '#4f4c48'],
  iron: ['#f4f5f7', '#b7bbc2', '#6f747c'], copper: ['#ffc8a0', '#d27a48', '#7e3f1e'], gold: ['#fff6c0', '#f0c63a', '#9a700c'],
  steel: ['#dfe6ee', '#8a96a6', '#46505e'], titanium: ['#f2f0fa', '#b8b4cc', '#6c6884'], rose_gold: ['#ffe2d8', '#e8a090', '#9a5a50'],
  leather: ['#d29a62', '#9a6232', '#5a3418'], crystal: ['#e0fbff', '#7fdcff', '#2a7fa8'],
};
// what each metal looks like white hot
const MOLTEN = { iron: '#ffb040', copper: '#ff8a50', gold: '#ffe070', steel: '#ffc860', titanium: '#fff4dc', rose_gold: '#ffa088' };
const FLUID = { water: ['#7fd0ff', '#2a7fd0'], lava: ['#ffd060', '#ff4a10'], murky: ['#a8b88a', '#5f6a3a'], milk: ['#ffffff', '#e4e8f0'], rawmilk: ['#fff4d8', '#e0cfa0'] };

const metalGrad = (g, c, x0, y0, x1, y1) => {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, c[0]); gr.addColorStop(0.45, c[1]); gr.addColorStop(1, c[2]);
  return gr;
};
const outline = (g, c = 'rgba(20, 18, 16, 0.75)', w = 1.4) => { g.strokeStyle = c; g.lineWidth = w; g.stroke(); };
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }

// A wooden handle from (x0, y0) to (x1, y1), with a darker grip wrap near the bottom.
function handle(g, x0, y0, x1, y1, w = 4.5) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = '#3a2412'; g.lineWidth = w + 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = '#a06a38'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = 'rgba(255, 220, 170, 0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.stroke();
  g.strokeStyle = '#5a3418'; g.lineWidth = w + 0.6; // grip wrap
  for (let k = 0; k < 3; k++) { const t = 0.08 + k * 0.07; g.beginPath(); g.moveTo(x0 + dx * t, y0 + dy * t); g.lineTo(x0 + dx * (t + 0.035), y0 + dy * (t + 0.035)); g.stroke(); }
  g.restore();
}

function tool(g, kind, mat) {
  const c = MATERIAL_COLORS[mat] || MATERIAL_COLORS.iron;
  const shine = (pts) => { g.save(); poly(g, pts); g.clip(); g.fillStyle = 'rgba(255, 255, 255, 0.35)'; g.fillRect(0, 0, S, 14); g.restore(); };
  switch (kind) {
    case 'pickaxe': {
      handle(g, 9, 42, 33, 15);
      // a curved head across the top of the handle, pointed at both ends
      g.beginPath(); g.moveTo(9, 13); g.quadraticCurveTo(27, 1, 45, 21); g.quadraticCurveTo(29, 9, 10, 17); g.closePath();
      g.fillStyle = metalGrad(g, c, 10, 4, 40, 22); g.fill(); outline(g);
      g.fillStyle = c[2]; g.beginPath(); g.ellipse(32, 14, 4, 3.4, 0.7, 0, Math.PI * 2); g.fill(); // the socket
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(13, 12); g.quadraticCurveTo(26, 4, 38, 13); g.stroke();
      break;
    }
    case 'axe': {
      handle(g, 10, 43, 32, 9);
      poly(g, [27, 8, 33, 3, 44, 6, 46, 18, 41, 27, 33, 22, 30, 15]);
      g.fillStyle = metalGrad(g, c, 30, 4, 46, 26); g.fill(); outline(g);
      g.strokeStyle = c[0]; g.lineWidth = 2; g.beginPath(); g.moveTo(44, 7); g.quadraticCurveTo(48, 16, 42, 26); g.stroke(); // the sharp edge
      shine([27, 8, 33, 3, 44, 6, 46, 18, 41, 27, 33, 22, 30, 15]);
      break;
    }
    case 'shovel': {
      handle(g, 9, 43, 31, 17);
      g.save(); g.translate(36, 11); g.rotate(-0.86);
      g.beginPath(); g.moveTo(-7, -3); g.lineTo(7, -3); g.lineTo(7, 7); g.quadraticCurveTo(0, 17, -7, 7); g.closePath();
      g.fillStyle = metalGrad(g, c, -7, -3, 7, 14); g.fill(); outline(g);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(0, -2); g.lineTo(0, 10); g.stroke();
      g.restore();
      break;
    }
    case 'sword': {
      // blade, guard, grip and pommel along the diagonal
      poly(g, [16, 30, 39, 5, 44, 4, 43, 9, 20, 33]);
      g.fillStyle = metalGrad(g, c, 18, 30, 44, 5); g.fill(); outline(g);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(19, 29); g.lineTo(41, 6); g.stroke();
      g.lineCap = 'round';
      g.strokeStyle = '#2b2622'; g.lineWidth = 6; g.beginPath(); g.moveTo(11, 24); g.lineTo(24, 37); g.stroke();
      g.strokeStyle = c[1]; g.lineWidth = 4; g.beginPath(); g.moveTo(11, 24); g.lineTo(24, 37); g.stroke();
      handle(g, 7, 41, 16, 32, 4);
      g.fillStyle = c[1]; g.beginPath(); g.arc(7, 41, 3.2, 0, Math.PI * 2); g.fill(); outline(g);
      break;
    }
  }
}

function hammer(g) {
  handle(g, 10, 43, 30, 14, 4.5);
  g.save(); g.translate(31, 13); g.rotate(0.62);
  const c = MATERIAL_COLORS.steel;
  g.beginPath(); g.rect(-13, -6, 26, 12); g.fillStyle = metalGrad(g, c, -13, -6, 13, 6); g.fill(); outline(g);
  g.fillStyle = c[2]; g.fillRect(-13, -6, 4, 12); g.fillRect(9, -6, 4, 12);
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(-9, -5, 18, 2);
  g.restore();
}
function tongs(g) {
  const c = MATERIAL_COLORS.iron;
  g.lineCap = 'round';
  for (const [a, b] of [[[8, 42], [30, 12]], [[14, 44], [34, 14]]]) {
    g.strokeStyle = '#2b2622'; g.lineWidth = 4.5; g.beginPath(); g.moveTo(...a); g.quadraticCurveTo(24, 26, ...b); g.stroke();
    g.strokeStyle = c[1]; g.lineWidth = 3; g.beginPath(); g.moveTo(...a); g.quadraticCurveTo(24, 26, ...b); g.stroke();
  }
  g.fillStyle = c[2]; g.beginPath(); g.arc(23, 27, 3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2b2622'; g.lineWidth = 3; g.beginPath(); g.moveTo(30, 12); g.lineTo(38, 7); g.moveTo(34, 14); g.lineTo(42, 11); g.stroke();
}

// An ingot: a bar seen from above at an angle, its top lighter than its sides.
function ingot(g, c) {
  const top = [10, 22, 26, 14, 40, 20, 24, 28], front = [10, 22, 24, 28, 24, 36, 8, 29], side = [24, 28, 40, 20, 42, 28, 24, 36];
  poly(g, front); g.fillStyle = c[1]; g.fill(); outline(g);
  poly(g, side); g.fillStyle = c[2]; g.fill(); outline(g);
  poly(g, top); g.fillStyle = metalGrad(g, c, 12, 14, 38, 28); g.fill(); outline(g);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(14, 21); g.lineTo(26, 16); g.stroke();
}
// A plate: a thin square sheet with a rivet hole at each corner.
function plate(g, c) {
  poly(g, [5, 26, 24, 16, 43, 25, 24, 35]); g.fillStyle = metalGrad(g, c, 6, 16, 42, 34); g.fill(); outline(g);
  poly(g, [5, 26, 24, 35, 24, 38, 5, 29]); g.fillStyle = c[2]; g.fill();
  poly(g, [24, 35, 43, 25, 43, 28, 24, 38]); g.fillStyle = c[1]; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(12, 25); g.lineTo(24, 19); g.lineTo(36, 25); g.stroke();
  g.fillStyle = 'rgba(20, 18, 16, 0.7)';
  for (const [x, y] of [[11, 26], [24, 20], [37, 25], [24, 31]]) { g.beginPath(); g.ellipse(x, y, 1.6, 1, 0, 0, Math.PI * 2); g.fill(); }
}
// Rods: two bars lying across each other.
function rod(g, c) {
  for (const [x0, y0, x1, y1] of [[8, 36, 40, 10], [12, 41, 44, 17]]) {
    g.lineCap = 'round';
    g.strokeStyle = '#1e1c1a'; g.lineWidth = 6.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = c[1]; g.lineWidth = 4.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = c[0]; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 - 1, y0 - 1.5); g.lineTo(x1 - 1, y1 - 1.5); g.stroke();
  }
}
// A rough lump of rock with metal showing through it (ore as it comes out of the ground).
function raw(g, c, rock = ['#8c8984', '#6d6a66', '#55524e']) {
  poly(g, [8, 30, 13, 13, 27, 7, 40, 15, 42, 32, 30, 42, 15, 41]); g.fillStyle = rock[1]; g.fill();
  poly(g, [13, 13, 27, 7, 40, 15, 26, 21]); g.fillStyle = rock[0]; g.fill();
  poly(g, [42, 32, 30, 42, 26, 21, 40, 15]); g.fillStyle = rock[2]; g.fill();
  poly(g, [8, 30, 13, 13, 27, 7, 40, 15, 42, 32, 30, 42, 15, 41]); outline(g);
  for (const [x, y, r] of [[18, 22, 4.5], [30, 30, 5], [22, 35, 3.2], [33, 18, 3.4], [14, 31, 2.6]]) {
    g.fillStyle = c[2]; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = c[1]; g.beginPath(); g.ellipse(x - r * 0.15, y - r * 0.15, r * 0.75, r * 0.6, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = c[0]; g.beginPath(); g.ellipse(x - r * 0.35, y - r * 0.35, r * 0.35, r * 0.25, 0.4, 0, Math.PI * 2); g.fill();
  }
}
// A fired clay crucible, empty or full of glowing molten metal.
function crucible(g, glow) {
  // a squat graphite-clay pot, wide at the mouth and narrow at the foot
  g.beginPath(); g.moveTo(9, 16); g.lineTo(39, 16); g.quadraticCurveTo(37, 34, 31, 41); g.quadraticCurveTo(24, 44, 17, 41); g.quadraticCurveTo(11, 34, 9, 16); g.closePath();
  const side = g.createLinearGradient(9, 0, 39, 0);
  side.addColorStop(0, '#3e3834'); side.addColorStop(0.35, '#8a817a'); side.addColorStop(1, '#2e2a27');
  g.fillStyle = side; g.fill(); outline(g);
  g.fillStyle = 'rgba(255, 255, 255, 0.18)'; g.beginPath(); g.ellipse(17, 27, 2, 7, 0.15, 0, Math.PI * 2); g.fill(); // shine
  g.fillStyle = '#1e1a18'; g.beginPath(); g.ellipse(24, 16, 15, 4.6, 0, 0, Math.PI * 2); g.fill();
  if (glow) {
    const m = g.createRadialGradient(22, 15, 1, 24, 16, 14);
    m.addColorStop(0, '#fffbe8'); m.addColorStop(0.4, glow); m.addColorStop(1, '#c03a08');
    g.fillStyle = m; g.beginPath(); g.ellipse(24, 16.5, 13, 3.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255, 140, 40, 0.35)'; g.beginPath(); g.ellipse(24, 12, 16, 7, 0, 0, Math.PI * 2); g.fill(); // heat haze
  }
  g.strokeStyle = '#a49a92'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(24, 16, 15, 4.6, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#8a817a'; poly(g, [38, 14, 44, 11, 43, 15, 38, 18]); g.fill(); // the pouring lip
}
// A clay mould with a hollow in the shape of what it makes.
function mould(g, kind) {
  poly(g, [4, 24, 24, 13, 44, 24, 24, 35]); g.fillStyle = '#b7836a'; g.fill(); outline(g);
  poly(g, [4, 24, 24, 35, 24, 41, 4, 30]); g.fillStyle = '#7e5240'; g.fill(); outline(g);
  poly(g, [24, 35, 44, 24, 44, 30, 24, 41]); g.fillStyle = '#986450'; g.fill(); outline(g);
  g.fillStyle = '#4a2c20';
  if (kind === 'ingot') poly(g, [14, 24, 24, 19, 34, 24, 24, 29]);
  else if (kind === 'plate') poly(g, [10, 24, 24, 17, 38, 24, 24, 31]);
  else poly(g, [12, 28, 33, 17, 36, 19, 15, 30]);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.3)';
  if (kind === 'rod') poly(g, [14, 25, 34, 15, 36, 17, 16, 27]); else if (kind === 'ingot') poly(g, [14, 24, 24, 19, 26, 20, 16, 25]); else poly(g, [10, 24, 24, 17, 26, 18, 12, 25]);
  g.fill();
}
// A chest plate in the colour of what it's made of.
function armour(g, c) {
  g.beginPath();
  g.moveTo(14, 8); g.lineTo(20, 8); g.quadraticCurveTo(24, 13, 28, 8); g.lineTo(34, 8); g.lineTo(43, 15); g.lineTo(38, 23);
  g.lineTo(35, 21); g.lineTo(35, 40); g.quadraticCurveTo(24, 44, 13, 40); g.lineTo(13, 21); g.lineTo(10, 23); g.lineTo(5, 15); g.closePath();
  g.fillStyle = metalGrad(g, c, 8, 8, 40, 42); g.fill(); outline(g);
  g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(24, 14); g.lineTo(24, 41); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(16, 14); g.quadraticCurveTo(18, 26, 16, 36); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.35)'; for (const y of [18, 26, 34]) { g.beginPath(); g.arc(19, y, 1, 0, 7); g.arc(29, y, 1, 0, 7); g.fill(); }
}
// The four armour pieces (and the diving helmet, copper with a round window).
function armourPiece(g, m, piece = 'breastplate') {
  const c = MATERIAL_COLORS[m === 'diving' ? 'copper' : m];
  if (piece === 'breastplate') return armour(g, c);
  g.fillStyle = metalGrad(g, c, 8, 8, 40, 42);
  if (piece === 'helmet') {
    g.beginPath(); g.moveTo(8, 34); g.bezierCurveTo(8, 6, 40, 6, 40, 34); g.lineTo(40, 40); g.lineTo(8, 40); g.closePath(); g.fill(); outline(g);
    if (m === 'diving') {
      g.fillStyle = '#9fd8f0'; g.beginPath(); g.arc(24, 26, 8, 0, 7); g.fill(); outline(g, '#5a3a18', 2.5);
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(21, 23, 2, 3, 0.4, 0, 7); g.fill();
    } else {
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(12, 25, 24, 4); // the eye slit
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(24, 10); g.lineTo(24, 24); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(13, 30); g.quadraticCurveTo(13, 16, 20, 12); g.stroke();
  } else if (piece === 'gauntlets') {
    for (const [x, flip] of [[13, -1], [31, 1]]) {
      g.save(); g.translate(x, 25); g.scale(flip, 1);
      poly(g, [-7, 16, 7, 16, 8, -2, 6, -12, 2, -15, -2, -14, -5, -10, -9, -4, -8, 2]); g.fillStyle = metalGrad(g, c, -8, -14, 8, 16); g.fill(); outline(g);
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; for (const y of [-6, 0, 8]) { g.beginPath(); g.moveTo(-6, y); g.lineTo(6, y); g.stroke(); }
      g.restore();
    }
  } else if (piece === 'pants') {
    poly(g, [11, 6, 37, 6, 40, 43, 28, 43, 24, 18, 20, 43, 8, 43]); g.fill(); outline(g);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(11, 6, 26, 4); // the belt
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(14, 14); g.lineTo(12, 40); g.stroke();
  }
}
function coal(g) {
  for (const [x, y, r, a] of [[19, 28, 11, 0.3], [31, 22, 9, -0.4], [30, 34, 7, 0.8]]) {
    g.save(); g.translate(x, y); g.rotate(a);
    poly(g, [-r, 0, -r * 0.4, -r * 0.8, r * 0.6, -r * 0.7, r, 0.1 * r, r * 0.5, r * 0.8, -r * 0.6, r * 0.7]);
    g.fillStyle = '#2a2a2e'; g.fill(); outline(g, '#0c0c0e');
    poly(g, [-r * 0.4, -r * 0.8, r * 0.6, -r * 0.7, r * 0.2, 0, -r * 0.5, -r * 0.1]); g.fillStyle = '#46464c'; g.fill();
    g.restore();
  }
  g.fillStyle = 'rgba(200, 210, 230, 0.8)'; for (const [x, y] of [[16, 24], [33, 19], [27, 33]]) g.fillRect(x, y, 1.5, 1.5);
}
function stick(g) { handle(g, 12, 41, 36, 8, 4.5); g.fillStyle = '#6a4020'; g.beginPath(); g.ellipse(27, 21, 2.5, 1.2, -0.9, 0, 7); g.fill(); }
function leather(g) {
  g.beginPath(); g.moveTo(10, 12); g.quadraticCurveTo(24, 6, 38, 12); g.quadraticCurveTo(44, 18, 39, 24); g.quadraticCurveTo(44, 32, 38, 38);
  g.quadraticCurveTo(24, 44, 10, 38); g.quadraticCurveTo(4, 32, 9, 24); g.quadraticCurveTo(4, 18, 10, 12); g.closePath();
  const c = MATERIAL_COLORS.leather; g.fillStyle = metalGrad(g, c, 8, 8, 40, 42); g.fill(); outline(g, '#3a200c');
  g.setLineDash([2, 2]); g.strokeStyle = 'rgba(255, 230, 190, 0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(12, 16); g.quadraticCurveTo(24, 11, 36, 16); g.stroke(); g.setLineDash([]);
}
function brick(g) {
  const c = ['#e08a6a', '#b6553a', '#6e2c1a'];
  poly(g, [6, 22, 26, 14, 42, 21, 22, 29]); g.fillStyle = c[0]; g.fill(); outline(g);
  poly(g, [6, 22, 22, 29, 22, 38, 6, 31]); g.fillStyle = c[1]; g.fill(); outline(g);
  poly(g, [22, 29, 42, 21, 42, 30, 22, 38]); g.fillStyle = c[2]; g.fill(); outline(g);
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (const [x, y] of [[14, 22], [24, 19], [30, 23]]) g.fillRect(x, y, 2, 1.5);
}
function gem(g, c) {
  poly(g, [24, 5, 38, 16, 24, 44, 10, 16]); g.fillStyle = metalGrad(g, c, 10, 5, 38, 44); g.fill(); outline(g, c[2]);
  g.fillStyle = 'rgba(255,255,255,0.5)'; poly(g, [24, 5, 30, 16, 24, 20, 18, 16]); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(10, 16); g.lineTo(38, 16); g.moveTo(24, 20); g.lineTo(24, 44); g.stroke();
}
function paper(g) {
  for (const [dx, a] of [[3, 0.08], [0, -0.06]]) {
    g.save(); g.translate(24 + dx, 25); g.rotate(a);
    g.fillStyle = '#f7f2e2'; g.fillRect(-12, -16, 24, 32); g.strokeStyle = '#a89c80'; g.lineWidth = 1; g.strokeRect(-12, -16, 24, 32);
    g.strokeStyle = 'rgba(80, 90, 140, 0.35)'; for (let y = -10; y < 14; y += 5) { g.beginPath(); g.moveTo(-8, y); g.lineTo(8, y); g.stroke(); }
    g.restore();
  }
}
function nails(g) {
  const c = MATERIAL_COLORS.iron;
  for (const [x, y, a] of [[14, 12, 0.5], [24, 10, -0.1], [33, 14, -0.6], [20, 20, 0.2]]) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = c[2]; g.fillRect(-1.2, 2, 2.4, 22); g.fillStyle = c[1]; g.fillRect(-1.2, 2, 1.2, 22);
    poly(g, [-1.2, 24, 1.2, 24, 0, 28]); g.fill();
    g.fillStyle = c[1]; g.beginPath(); g.ellipse(0, 2, 3.4, 1.4, 0, 0, 7); g.fill(); outline(g, '#2b2622', 0.8);
    g.restore();
  }
}
function chain(g) {
  const c = MATERIAL_COLORS.iron;
  for (let k = 0; k < 5; k++) {
    const x = 10 + k * 7, y = 38 - k * 7.5, a = -0.85 + (k % 2) * 1.5;
    g.save(); g.translate(x, y); g.rotate(a);
    g.strokeStyle = '#2b2622'; g.lineWidth = 4; g.beginPath(); g.ellipse(0, 0, 6, 3.4, 0, 0, 7); g.stroke();
    g.strokeStyle = k % 2 ? c[2] : c[1]; g.lineWidth = 2.4; g.beginPath(); g.ellipse(0, 0, 6, 3.4, 0, 0, 7); g.stroke();
    g.restore();
  }
}
function gear(g, c = MATERIAL_COLORS.steel) {
  g.beginPath();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, r = k % 3 === 0 || k % 3 === 1 ? 19 : 14.5;
    g.lineTo(24 + Math.cos(a) * r, 24 + Math.sin(a) * r);
  }
  g.closePath(); g.fillStyle = metalGrad(g, c, 6, 6, 42, 42); g.fill(); outline(g);
  g.fillStyle = '#1e1c1a'; g.beginPath(); g.arc(24, 24, 5, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(24, 24, 10, 3.6, 5.2); g.stroke();
}

function bucket(g, fluid) {
  // a tin pail, seen a little from above, with a handle
  g.strokeStyle = '#7d848c'; g.lineWidth = 2.5; g.beginPath(); g.arc(24, 18, 15, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  const side = g.createLinearGradient(9, 0, 39, 0);
  side.addColorStop(0, '#6f767e'); side.addColorStop(0.35, '#dfe4e9'); side.addColorStop(1, '#5d636a');
  g.fillStyle = side; g.beginPath(); g.moveTo(8, 18); g.lineTo(13, 43); g.quadraticCurveTo(24, 47, 35, 43); g.lineTo(40, 18); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(40, 44, 50, 0.6)'; g.lineWidth = 1.2;
  for (const y of [27, 36]) { g.beginPath(); g.moveTo(9.8 + (y - 18) * 0.2, y); g.quadraticCurveTo(24, y + 3.5, 38.2 - (y - 18) * 0.2, y); g.stroke(); }
  // the rim, and what's inside
  g.fillStyle = '#4a5058'; g.beginPath(); g.ellipse(24, 18, 16, 5.5, 0, 0, Math.PI * 2); g.fill();
  if (fluid) {
    const [hi, lo] = FLUID[fluid], in_ = g.createRadialGradient(20, 17, 1, 24, 18, 15);
    in_.addColorStop(0, hi); in_.addColorStop(1, lo);
    g.fillStyle = in_; g.beginPath(); g.ellipse(24, 18.5, 13.5, 4.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.55)'; g.beginPath(); g.ellipse(19, 17.5, 4, 1.1, -0.1, 0, Math.PI * 2); g.fill();
  } else { g.fillStyle = '#2c3036'; g.beginPath(); g.ellipse(24, 18.5, 13.5, 4.2, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#c9cfd6'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(24, 18, 16, 5.5, 0, 0, Math.PI * 2); g.stroke();
}

function bottle(g, fluid) {
  // a round glass flask with a cork, filled part way
  const body = () => { g.beginPath(); g.moveTo(20, 8); g.lineTo(20, 18); g.bezierCurveTo(8, 21, 7, 44, 24, 44); g.bezierCurveTo(41, 44, 40, 21, 28, 18); g.lineTo(28, 8); g.closePath(); };
  if (fluid) {
    g.save(); body(); g.clip();
    const [hi, lo] = FLUID[fluid], w = g.createLinearGradient(0, 24, 0, 44);
    w.addColorStop(0, hi); w.addColorStop(1, lo);
    g.fillStyle = w; g.fillRect(0, 25, S, 20);
    g.fillStyle = 'rgba(255, 255, 255, 0.35)'; g.fillRect(0, 25, S, 1.5); // the water's surface
    if (fluid === 'murky' || fluid === 'rawmilk') for (let i = 0; i < 12; i++) { g.fillStyle = fluid === 'murky' ? 'rgba(70, 60, 30, 0.6)' : 'rgba(150, 120, 60, 0.45)'; g.fillRect(12 + ((i * 37) % 24), 29 + ((i * 13) % 13), 1.6, 1.6); }
    if (fluid === 'milk') { g.fillStyle = '#3a8ad0'; g.fillRect(0, 33, S, 5); g.fillStyle = '#ffffff'; g.fillRect(22, 34, 4, 3); } // a blue label
    g.restore();
  }
  body();
  g.fillStyle = 'rgba(210, 235, 245, 0.25)'; g.fill();
  g.strokeStyle = 'rgba(225, 245, 255, 0.95)'; g.lineWidth = 1.8; g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, 0.7)'; g.beginPath(); g.ellipse(16, 31, 2, 6, 0.3, 0, Math.PI * 2); g.fill(); // shine
  g.fillStyle = '#b07a48'; g.fillRect(19, 3, 10, 7); g.fillStyle = '#8a5a30'; g.fillRect(19, 8, 10, 2); // cork
}

// The metalwork stations, small.
function station(g, kind) {
  if (kind === 'smelter') {
    poly(g, [6, 18, 24, 10, 42, 18, 42, 40, 24, 46, 6, 40]); g.fillStyle = '#9a4a32'; g.fill(); outline(g);
    poly(g, [24, 26, 42, 18, 42, 40, 24, 46]); g.fillStyle = '#7a3624'; g.fill();
    g.strokeStyle = 'rgba(40, 14, 8, 0.6)'; g.lineWidth = 1; for (const y of [24, 31, 38]) { g.beginPath(); g.moveTo(6, y); g.lineTo(24, y + 7); g.lineTo(42, y - 1); g.stroke(); }
    g.fillStyle = '#ff9a30'; poly(g, [10, 30, 20, 34, 20, 42, 10, 38]); g.fill();
    crucibleTop(g);
  } else if (kind === 'anvil') {
    g.fillStyle = '#6b4a2f'; g.fillRect(14, 30, 20, 14); outline(g);
    const c = ['#7d838c', '#3d4045', '#1e2024'];
    poly(g, [4, 14, 36, 14, 44, 18, 36, 22, 30, 22, 28, 28, 34, 32, 14, 32, 20, 28, 18, 22, 10, 22]); g.fillStyle = metalGrad(g, c, 4, 12, 40, 32); g.fill(); outline(g);
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(8, 14, 26, 2);
  } else {
    poly(g, [6, 30, 30, 18, 42, 26, 18, 40]); g.fillStyle = '#8a5a32'; g.fill(); outline(g);
    poly(g, [6, 22, 30, 10, 42, 18, 18, 32]); g.fillStyle = '#a06a38'; g.fill(); outline(g);
    g.fillStyle = '#6e4421'; poly(g, [6, 22, 18, 32, 18, 40, 6, 30]); g.fill(); outline(g);
    g.strokeStyle = '#3a200c'; g.lineWidth = 1; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(8, 25 + k * 3); g.lineTo(17, 34 + k * 2); g.stroke(); }
    g.fillStyle = '#4a4d52'; poly(g, [38, 30, 46, 34, 44, 36, 36, 33]); g.fill();
  }
}
// Spawner eggs: an egg in the creature's colours, with spots (so every spawner has a picture, even
// where the emoji for that animal isn't in the font).
const EGG = {
  cow: ['#f2efe8', '#3a2c22'], pig: ['#f4b6b0', '#c46a6a'], sheep: ['#f0ece2', '#c9b9a0'], chicken: ['#fbfaf4', '#d8402c'],
  deer: ['#b07a48', '#f2e2c4'], rabbit: ['#c9b49a', '#f6efe4'], wolf: ['#9a9a9e', '#4a4a50'], bear: ['#6a4428', '#3a2414'],
  boar: ['#5a4232', '#c9b08a'], spider: ['#2c2626', '#c0202a'], camel: ['#d8b07a', '#9a7040'], zebra: ['#f4f4f0', '#1c1c1c'],
  goat: ['#e8e2d4', '#8a7a62'], fox: ['#e0782c', '#f8f2e8'], parrot: ['#2cb04a', '#e83a2a'], polar_bear: ['#f4f6f8', '#9ab4c8'],
  jaguar: ['#e8b048', '#3a2a14'], scorpion: ['#3a2c1e', '#c8a040'],
};
function egg(g, kind) {
  let c = EGG[kind];
  if (!c) { let h = 0; for (const ch of kind) h = (h * 31 + ch.charCodeAt(0)) % 360; c = [`hsl(${h} 45% 62%)`, `hsl(${(h + 150) % 360} 55% 32%)`]; }
  g.save();
  g.beginPath(); g.moveTo(24, 5);
  g.bezierCurveTo(37, 5, 41, 26, 40, 32); g.bezierCurveTo(39, 41, 32, 45, 24, 45);
  g.bezierCurveTo(16, 45, 9, 41, 8, 32); g.bezierCurveTo(7, 26, 11, 5, 24, 5); g.closePath();
  const gr = g.createRadialGradient(18, 16, 2, 24, 28, 24);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, c[0]); gr.addColorStop(1, c[0]);
  g.fillStyle = gr; g.fill();
  g.clip();
  g.fillStyle = c[1];
  for (const [x, y, r] of [[30, 14, 4], [16, 26, 5], [31, 32, 4.5], [21, 40, 3.5], [36, 23, 2.5], [14, 14, 2.5]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(0, 0, 0, 0.18)'; g.beginPath(); g.ellipse(30, 34, 14, 13, 0, 0, 7); g.fill();
  g.restore();
  g.beginPath(); g.moveTo(24, 5);
  g.bezierCurveTo(37, 5, 41, 26, 40, 32); g.bezierCurveTo(39, 41, 32, 45, 24, 45);
  g.bezierCurveTo(16, 45, 9, 41, 8, 32); g.bezierCurveTo(7, 26, 11, 5, 24, 5); g.closePath();
  outline(g);
}

function crucibleTop(g) { g.fillStyle = '#ffd070'; g.beginPath(); g.ellipse(24, 14, 7, 2.6, 0, 0, 7); g.fill(); }

// Pictures by item id, for items that don't name one with `draw`.
const BY_ID = {
  bucket: 'bucket', water_bucket: 'bucket:water', lava_bucket: 'bucket:lava',
  bottle: 'bottle', water_bottle: 'bottle:water', murky_water: 'bottle:murky',
  iron_ore: 'ore:iron',
};
const DRAW = {
  tool: (g, kind, mat) => tool(g, kind, mat),
  hammer: (g) => hammer(g), tongs: (g) => tongs(g),
  ingot: (g, m) => ingot(g, MATERIAL_COLORS[m]), plate: (g, m) => plate(g, MATERIAL_COLORS[m]), rod: (g, m) => rod(g, MATERIAL_COLORS[m]),
  raw: (g, m) => raw(g, MATERIAL_COLORS[m]), ore: (g) => raw(g, ['#ffd2a8', '#c8743a', '#7a3a14']),
  molten: (g, m) => crucible(g, MOLTEN[m]), crucible: (g) => crucible(g), mould: (g, k) => mould(g, k),
  armour: (g, m, piece) => armourPiece(g, m, piece), coal: (g) => coal(g), stick: (g) => stick(g), leather: (g) => leather(g), brick: (g) => brick(g),
  gem: (g, m) => gem(g, MATERIAL_COLORS[m]), paper: (g) => paper(g), nails: (g) => nails(g), chain: (g) => chain(g), gear: (g) => gear(g),
  bucket: (g, f) => bucket(g, f), bottle: (g, f) => bottle(g, f), station: (g, k) => station(g, k),
  egg: (g, k) => egg(g, k),
};
export const iconSpec = (def) => def.draw || BY_ID[def.id] || null;
const cache = {};
export function drawnIcon(spec) {
  if (cache[spec]) return cache[spec];
  const [kind, ...args] = spec.split(':');
  const c = document.createElement('canvas');
  c.width = c.height = S * SCALE;
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  DRAW[kind](g, ...args);
  return (cache[spec] = c.toDataURL());
}
