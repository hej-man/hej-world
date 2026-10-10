// ---------------------------------------------------------------------------
// Item pictures drawn on a small canvas, for items an emoji or a flat swatch can't show well:
// buckets, bottles and ore. Each is drawn once, the first time it's shown.
// ---------------------------------------------------------------------------
const S = 48;
const FLUID = { water: ['#7fd0ff', '#2a7fd0'], lava: ['#ffd060', '#ff4a10'], murky: ['#a8b88a', '#5f6a3a'] };

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
    if (fluid === 'murky') for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(70, 60, 30, 0.6)'; g.fillRect(12 + ((i * 37) % 24), 29 + ((i * 13) % 13), 1.6, 1.6); }
    g.restore();
  }
  body();
  g.fillStyle = 'rgba(210, 235, 245, 0.25)'; g.fill();
  g.strokeStyle = 'rgba(225, 245, 255, 0.95)'; g.lineWidth = 1.8; g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, 0.7)'; g.beginPath(); g.ellipse(16, 31, 2, 6, 0.3, 0, Math.PI * 2); g.fill(); // shine
  g.fillStyle = '#b07a48'; g.fillRect(19, 3, 10, 7); g.fillStyle = '#8a5a30'; g.fillRect(19, 8, 10, 2); // cork
}

function ore(g, nugget) {
  // a rough lump of stone with metal showing through
  g.fillStyle = '#6d6a66'; g.beginPath(); g.moveTo(8, 30); g.lineTo(13, 13); g.lineTo(27, 7); g.lineTo(40, 15); g.lineTo(42, 32); g.lineTo(30, 42); g.lineTo(15, 41); g.closePath(); g.fill();
  g.fillStyle = '#8c8984'; g.beginPath(); g.moveTo(13, 13); g.lineTo(27, 7); g.lineTo(40, 15); g.lineTo(26, 21); g.closePath(); g.fill();
  g.fillStyle = '#55524e'; g.beginPath(); g.moveTo(42, 32); g.lineTo(30, 42); g.lineTo(26, 21); g.lineTo(40, 15); g.closePath(); g.fill();
  for (const [x, y, r] of [[18, 22, 4], [30, 30, 4.5], [22, 35, 3], [33, 18, 3], [14, 31, 2.5]]) {
    g.fillStyle = nugget[1]; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = nugget[0]; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.35, 0.4, 0, Math.PI * 2); g.fill();
  }
}

const DRAW = {
  bucket: (g) => bucket(g), water_bucket: (g) => bucket(g, 'water'), lava_bucket: (g) => bucket(g, 'lava'),
  bottle: (g) => bottle(g), water_bottle: (g) => bottle(g, 'water'), murky_water: (g) => bottle(g, 'murky'),
  iron_ore: (g) => ore(g, ['#ffd2a8', '#c8743a']),
};
export const hasDrawnIcon = (id) => id in DRAW;
const cache = {};
export function drawnIcon(id) {
  if (cache[id]) return cache[id];
  const c = document.createElement('canvas');
  c.width = c.height = S;
  DRAW[id](c.getContext('2d'));
  return (cache[id] = c.toDataURL());
}
