// ---------------------------------------------------------------------------
// Block textures drawn from a short description, so the many kinds of wood, stone, ground,
// coloured and metal blocks each get their own look without a hand-written drawing each.
// A texture is 256 x 128: the side of the block on the left half, the top on the right.
//
//   { kind: 'planks', hsl }                  boards with grain, gaps and nails
//   { kind: 'log', bark, ring }              furrowed bark on the sides, growth rings on top
//   { kind: 'stripped', hsl }                smooth wood with long grain, rings on top
//   { kind: 'leaves', hsl }                  leaves with gaps you can see through
//   { kind: 'stone', hsl, spots, style }     natural stone: 'speckle', 'banded', 'veined', 'porous', 'columns', 'smooth'
//   { kind: 'polished', hsl }                smooth cut stone with a bevelled border
//   { kind: 'bricks', hsl, rows, moss, cracks } bricks with mortar, perhaps mossy or cracked
//   { kind: 'cobble', hsl, moss }            rounded cobbles
//   { kind: 'tiles', hsl }                   square tiles
//   { kind: 'grainy', hsl, pebbles }         sand, gravel, dirt and the like
//   { kind: 'solid', hsl, noise }            an even colour with a little noise (terracotta, concrete)
//   { kind: 'wool', hsl }                    soft fibres
//   { kind: 'glass', hsl }                   tinted glass with a frame (drawn see-through)
//   { kind: 'ice', hsl, cracks }             icy blue with cracks and bubbles
//   { kind: 'snow', hsl }                    white with soft shading and sparkle
//   { kind: 'metal', hsl }                   riveted plates
//   { kind: 'ore', hsl, nugget }             stone with coloured nuggets
//   { kind: 'moss', hsl }                    a soft green mat
//   { kind: 'bookshelf', hsl }               shelves of books (planks on top)
//   { kind: 'gourd', hsl, face }             pumpkin or melon rind (a carved face for jack o'lanterns)
//   { kind: 'cactus', hsl }                  ribbed green with spines
//
// hsl colours are [hue 0..360, saturation %, lightness %].
// ---------------------------------------------------------------------------
const col = ([h, s, l], dl = 0, a = 1) => `hsla(${h}, ${s}%, ${Math.max(0, Math.min(100, l + dl))}%, ${a})`;

export function drawTexture(g, W, H, tex, rand) {
  const speckle = (x0, w, alpha, light = false, n = (w * H) / 6) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = light ? `rgba(255,255,255,${alpha * rand()})` : `rgba(0,0,0,${alpha * rand()})`;
      g.fillRect(x0 + rand() * w, rand() * H, 1 + rand() * 1.5, 1 + rand() * 1.5);
    }
  };
  const halves = (fn) => { fn(0, W / 2); fn(W / 2, W / 2); };
  const clip = (x0, w, fn) => { g.save(); g.beginPath(); g.rect(x0, 0, w, H); g.clip(); fn(); g.restore(); };
  const fill = (x0, w, c) => { g.fillStyle = c; g.fillRect(x0, 0, w, H); };
  const rings = (x0, w, wood, barkCol) => {
    fill(x0, w, col(wood, 6));
    for (let r = 6; r < 56; r += 5 + rand() * 4) { g.strokeStyle = col(wood, -18, 0.4 + rand() * 0.3); g.lineWidth = 1 + rand(); g.beginPath(); g.arc(x0 + w / 2, H / 2, r, 0, Math.PI * 2); g.stroke(); }
    if (barkCol) { g.strokeStyle = barkCol; g.lineWidth = 9; g.beginPath(); g.arc(x0 + w / 2, H / 2, 60, 0, Math.PI * 2); g.stroke(); g.lineWidth = 8; g.strokeRect(x0 + 4, 4, w - 8, H - 8); }
  };
  const planks = (x0, w, c) => {
    const rows = 4, bh = H / rows;
    for (let r = 0; r < rows; r++) {
      const dl = (rand() - 0.5) * 10;
      g.fillStyle = col([c[0] + (rand() - 0.5) * 6, c[1], c[2] + dl]); g.fillRect(x0, r * bh, w, bh);
      for (let k = 0; k < 9; k++) { // grain
        g.strokeStyle = col(c, dl - 14 - rand() * 10, 0.25 + rand() * 0.35); g.lineWidth = 0.8 + rand();
        const y = r * bh + 2 + rand() * (bh - 4), amp = 0.6 + rand() * 1.5, ph = rand() * 6;
        g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x0 + x, y + Math.sin(x * 0.05 + ph) * amp); g.stroke();
      }
      g.fillStyle = 'rgba(30, 18, 8, 0.75)'; g.fillRect(x0, r * bh, w, 1.5);  // gap between boards
      const j = x0 + 12 + rand() * (w - 24); g.fillRect(j, r * bh, 1.5, bh);     // end joint
      g.fillStyle = 'rgba(25,20,15,0.8)'; for (const nx of [j - 5, j + 5]) g.fillRect(nx, r * bh + bh / 2 - 1, 2, 2); // nails
    }
  };
  const bricks = (x0, w, c, rows = 4) => {
    fill(x0, w, col(c, -18));
    const bh = H / rows, bw = (w / 2);
    clip(x0, w, () => {
      for (let r = 0; r < rows; r++) for (let k = -1; k < 3; k++) {
        const bx = x0 + k * bw + (r % 2) * bw / 2, dl = (rand() - 0.5) * 12;
        g.fillStyle = col(c, dl); g.fillRect(bx + 2, r * bh + 2, bw - 4, bh - 4);
        g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(bx + 2, r * bh + 2, bw - 4, 2);
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(bx + 2, r * bh + bh - 4, bw - 4, 2);
      }
    });
    speckle(x0, w, 0.18);
  };
  // rounded stones with darker gaps between them
  const cobble = (x0, w, c) => {
    fill(x0, w, col(c, -12));
    clip(x0, w, () => {
      for (let i = 0; i < 22; i++) {
        const cx = x0 + rand() * w, cy = rand() * H, rx = 14 + rand() * 16, ry = 10 + rand() * 12, dl = (rand() - 0.5) * 18;
        const grd = g.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 2, cx, cy, Math.max(rx, ry));
        grd.addColorStop(0, col(c, dl + 10)); grd.addColorStop(1, col(c, dl - 8));
        g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, rx, ry, rand() * 3, 0, Math.PI * 2); g.fill();
      }
    });
    speckle(x0, w, 0.25); speckle(x0, w, 0.12, true);
  };
  // moss creeping over a block, thickest at the top
  const moss = (x0, w, c) => {
    for (let i = 0; i < 260; i++) {
      const y = Math.pow(rand(), 1.8) * H;
      g.fillStyle = col(c, (rand() - 0.5) * 20, 0.85); g.beginPath(); g.ellipse(x0 + rand() * w, y, 2 + rand() * 4, 1.5 + rand() * 3, 0, 0, Math.PI * 2); g.fill();
    }
  };
  const cracks = (x0, w) => {
    g.strokeStyle = 'rgba(20, 18, 16, 0.75)'; g.lineWidth = 1.4;
    for (let k = 0; k < 5; k++) { let x = x0 + rand() * w, y = rand() * H; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 5; s++) { x += (rand() - 0.5) * 22; y += (rand() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }
  };
  const stone = (x0, w, t) => {
    const c = t.hsl, style = t.style || 'speckle';
    fill(x0, w, col(c));
    clip(x0, w, () => {
      if (style === 'banded' || style === 'columns') {
        // horizontal layers (sandstone, limestone, tuff) or vertical cracks (basalt, deepslate)
        const vertical = style === 'columns';
        for (let k = 0; k < 9; k++) {
          const p = rand() * (vertical ? w : H), th = 3 + rand() * 9;
          g.fillStyle = col(c, (rand() - 0.5) * 14, 0.6);
          if (vertical) g.fillRect(x0 + p, 0, th, H); else g.fillRect(x0, p, w, th);
        }
        g.strokeStyle = col(c, -22, 0.5); g.lineWidth = 1.2;
        for (let k = 0; k < 6; k++) { const p = rand() * (vertical ? w : H); g.beginPath(); if (vertical) { g.moveTo(x0 + p, 0); g.lineTo(x0 + p + (rand() - 0.5) * 6, H); } else { g.moveTo(x0, p); g.lineTo(x0 + w, p + (rand() - 0.5) * 4); } g.stroke(); }
      } else if (style === 'veined') {
        // marble and calcite: pale with thin wandering veins
        for (let k = 0; k < 5; k++) {
          g.strokeStyle = col(t.spots?.[0] || c, -25, 0.35 + rand() * 0.3); g.lineWidth = 0.8 + rand() * 1.5;
          let x = x0 + rand() * w, y = 0; g.beginPath(); g.moveTo(x, y);
          while (y < H) { x += (rand() - 0.5) * 18; y += 6 + rand() * 10; g.lineTo(x, y); }
          g.stroke();
        }
      } else if (style === 'porous') {
        for (let i = 0; i < 70; i++) { g.fillStyle = col(c, -20 - rand() * 10, 0.6); g.beginPath(); g.ellipse(x0 + rand() * w, rand() * H, 1 + rand() * 3, 1 + rand() * 2.5, 0, 0, Math.PI * 2); g.fill(); }
      } else if (style === 'smooth') {
        const grd = g.createLinearGradient(x0, 0, x0 + w, H); grd.addColorStop(0, col(c, 4)); grd.addColorStop(1, col(c, -6)); g.fillStyle = grd; g.fillRect(x0, 0, w, H);
      } else {
        // speckled stones (granite, diorite, andesite): blotches in a couple of colours
        for (let i = 0; i < 22; i++) {
          const cx = x0 + rand() * w, cy = rand() * H, rx = 10 + rand() * 16, ry = 8 + rand() * 12;
          g.fillStyle = col(c, (rand() - 0.5) * 16, 0.55); g.beginPath(); g.ellipse(cx, cy, rx, ry, rand() * 3, 0, Math.PI * 2); g.fill();
        }
      }
      for (const sp of t.spots || []) for (let i = 0; i < 160; i++) { g.fillStyle = col(sp, (rand() - 0.5) * 10); g.fillRect(x0 + rand() * w, rand() * H, 1.5 + rand() * 2.5, 1.5 + rand() * 2.5); }
    });
    speckle(x0, w, 0.22); speckle(x0, w, 0.1, true);
  };

  const t = tex;
  switch (t.kind) {
    case 'planks': halves((x0, w) => planks(x0, w, t.hsl)); break;
    case 'log': {
      fill(0, W / 2, col(t.bark));
      for (let i = 0; i < 26; i++) { // bark furrows
        const x = rand() * W / 2; g.strokeStyle = col(t.bark, -15 - rand() * 12, 0.5 + rand() * 0.4); g.lineWidth = 1.5 + rand() * 3;
        g.beginPath(); for (let y = 0; y <= H; y += 8) g.lineTo(x + Math.sin(y * 0.08 + i) * 3, y); g.stroke();
      }
      if (t.marks) for (let i = 0; i < 14; i++) { g.fillStyle = col(t.marks, (rand() - 0.5) * 10, 0.85); g.fillRect(rand() * W / 2, rand() * H, 6 + rand() * 14, 2 + rand() * 3); } // birch's dark marks
      speckle(0, W / 2, 0.2, true);
      rings(W / 2, W / 2, t.ring, col(t.bark, -6));
      break;
    }
    case 'stripped': {
      fill(0, W / 2, col(t.hsl));
      for (let i = 0; i < 40; i++) { const x = rand() * W / 2; g.strokeStyle = col(t.hsl, -10 - rand() * 8, 0.3 + rand() * 0.3); g.lineWidth = 0.6 + rand() * 1.2; g.beginPath(); for (let y = 0; y <= H; y += 8) g.lineTo(x + Math.sin(y * 0.05 + i) * 1.5, y); g.stroke(); }
      rings(W / 2, W / 2, t.hsl, col(t.hsl, -14));
      break;
    }
    case 'leaves': halves((x0, w) => {
      g.clearRect(x0, 0, w, H);
      for (let i = 0; i < 420; i++) {
        const x = x0 + rand() * w, y = rand() * H, len = 4 + rand() * 6;
        g.save(); g.translate(x, y); g.rotate(rand() * Math.PI * 2);
        g.fillStyle = col(t.hsl, (rand() - 0.5) * 22); g.beginPath(); g.ellipse(0, 0, len, len * 0.45, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      if (t.blossom) for (let i = 0; i < 70; i++) { g.fillStyle = col(t.blossom, (rand() - 0.5) * 10); g.beginPath(); g.arc(x0 + rand() * w, rand() * H, 1.5 + rand() * 2, 0, Math.PI * 2); g.fill(); }
    }); break;
    case 'stone': halves((x0, w) => stone(x0, w, t)); break;
    case 'polished': halves((x0, w) => {
      const grd = g.createLinearGradient(x0, 0, x0 + w, H); grd.addColorStop(0, col(t.hsl, 6)); grd.addColorStop(1, col(t.hsl, -4));
      g.fillStyle = grd; g.fillRect(x0, 0, w, H);
      speckle(x0, w, 0.08); speckle(x0, w, 0.08, true);
      g.strokeStyle = col(t.hsl, -22, 0.6); g.lineWidth = 3; g.strokeRect(x0 + 6, 6, w - 12, H - 12);
      g.strokeStyle = col(t.hsl, 14, 0.5); g.lineWidth = 1.5; g.strokeRect(x0 + 9, 9, w - 18, H - 18);
    }); break;
    case 'bricks': halves((x0, w) => { bricks(x0, w, t.hsl, t.rows); if (t.cracks) cracks(x0, w); if (t.moss) moss(x0, w, t.moss); }); break;
    case 'cobble': halves((x0, w) => { cobble(x0, w, t.hsl); if (t.moss) moss(x0, w, t.moss); }); break;
    case 'tiles': halves((x0, w) => {
      fill(x0, w, col(t.hsl, -20));
      const n = 4, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { g.fillStyle = col(t.hsl, (rand() - 0.5) * 10); g.fillRect(x0 + i * s + 2, j * (H / 2) + 2, s - 4, H / 2 - 4); }
      speckle(x0, w, 0.12);
    }); break;
    case 'grainy': halves((x0, w) => {
      fill(x0, w, col(t.hsl));
      for (let i = 0; i < (t.pebbles ? 160 : 60); i++) {
        g.fillStyle = col(t.pebbles && rand() < 0.5 ? t.pebbles : t.hsl, (rand() - 0.5) * 24);
        g.beginPath(); g.ellipse(x0 + rand() * w, rand() * H, 2 + rand() * (t.pebbles ? 6 : 3), 1.5 + rand() * (t.pebbles ? 4 : 2), rand() * 3, 0, Math.PI * 2); g.fill();
      }
      if (t.needles) for (let i = 0; i < 60; i++) { g.strokeStyle = col(t.needles, (rand() - 0.5) * 12, 0.8); g.lineWidth = 1; const x = x0 + rand() * w, y = rand() * H, a = rand() * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); g.stroke(); }
      speckle(x0, w, 0.25); speckle(x0, w, 0.15, true);
    }); break;
    case 'solid': halves((x0, w) => {
      fill(x0, w, col(t.hsl));
      for (let i = 0; i < 40; i++) { g.fillStyle = col(t.hsl, (rand() - 0.5) * (t.noise ?? 8), 0.5); g.beginPath(); g.ellipse(x0 + rand() * w, rand() * H, 6 + rand() * 14, 4 + rand() * 8, rand() * 3, 0, Math.PI * 2); g.fill(); }
      speckle(x0, w, 0.12);
    }); break;
    case 'wool': halves((x0, w) => {
      fill(x0, w, col(t.hsl));
      for (let i = 0; i < 500; i++) { g.strokeStyle = col(t.hsl, -18 - rand() * 10, 0.2 + rand() * 0.2); g.lineWidth = 1; const x = x0 + rand() * w, y = rand() * H; g.beginPath(); g.arc(x, y, 2 + rand() * 3, rand() * 6, rand() * 6 + 3); g.stroke(); }
    }); break;
    case 'glass': halves((x0, w) => {
      g.clearRect(x0, 0, w, H);
      g.fillStyle = col(t.hsl, 0, 0.35); g.fillRect(x0, 0, w, H);
      g.strokeStyle = col(t.hsl, 18, 0.95); g.lineWidth = 6; g.strokeRect(x0 + 3, 3, w - 6, H - 6);
      g.strokeStyle = 'rgba(255, 255, 255, 0.35)'; g.lineWidth = 5;
      for (const o of [30, 48]) { g.beginPath(); g.moveTo(x0 + o, 12); g.lineTo(x0 + 12, o); g.stroke(); }
    }); break;
    case 'ice': halves((x0, w) => {
      const grd = g.createLinearGradient(x0, 0, x0 + w, H); grd.addColorStop(0, col(t.hsl, 10)); grd.addColorStop(1, col(t.hsl, -8));
      g.fillStyle = grd; g.fillRect(x0, 0, w, H);
      g.strokeStyle = col(t.hsl, 25, 0.7); g.lineWidth = 1;
      for (let k = 0; k < (t.cracks ?? 6); k++) { let x = x0 + rand() * w, y = rand() * H; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (rand() - 0.5) * 30; y += (rand() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(x0 + rand() * w, rand() * H, 0.8 + rand() * 1.6, 0, Math.PI * 2); g.fill(); }
    }); break;
    case 'snow': halves((x0, w) => {
      fill(x0, w, col(t.hsl));
      for (let i = 0; i < 30; i++) { g.fillStyle = col(t.hsl, -6 - rand() * 6, 0.35); g.beginPath(); g.ellipse(x0 + rand() * w, rand() * H, 10 + rand() * 18, 6 + rand() * 10, 0, 0, Math.PI * 2); g.fill(); }
      speckle(x0, w, 0.6, true, 140);
    }); break;
    case 'metal': halves((x0, w) => {
      const grd = g.createLinearGradient(x0, 0, x0 + w, H); grd.addColorStop(0, col(t.hsl, 12)); grd.addColorStop(0.5, col(t.hsl)); grd.addColorStop(1, col(t.hsl, -12));
      g.fillStyle = grd; g.fillRect(x0, 0, w, H);
      g.strokeStyle = col(t.hsl, -25, 0.7); g.lineWidth = 2; g.strokeRect(x0 + 2, 2, w - 4, H - 4); g.beginPath(); g.moveTo(x0, H / 2); g.lineTo(x0 + w, H / 2); g.stroke();
      g.fillStyle = col(t.hsl, -30); for (const [x, y] of [[8, 8], [w - 10, 8], [8, H - 10], [w - 10, H - 10], [8, H / 2 + 6], [w - 10, H / 2 + 6]]) g.fillRect(x0 + x, y, 3, 3);
      speckle(x0, w, 0.06, true);
    }); break;
    case 'ore': halves((x0, w) => {
      stone(x0, w, { hsl: t.hsl || [30, 4, 50] });
      for (let i = 0; i < 9; i++) { const x = x0 + 10 + rand() * (w - 20), y = 10 + rand() * (H - 20); g.fillStyle = col(t.nugget, (rand() - 0.5) * 16); g.beginPath(); g.ellipse(x, y, 4 + rand() * 5, 3 + rand() * 4, rand() * 3, 0, Math.PI * 2); g.fill(); g.fillStyle = col(t.nugget, 25, 0.8); g.fillRect(x - 1, y - 2, 2, 2); }
    }); break;
    case 'moss': halves((x0, w) => {
      fill(x0, w, col(t.hsl, -6));
      for (let i = 0; i < 600; i++) { g.fillStyle = col(t.hsl, (rand() - 0.5) * 24, 0.8); g.fillRect(x0 + rand() * w, rand() * H, 1.5, 2 + rand() * 3); }
    }); break;
    case 'bookshelf': {
      planks(W / 2, W / 2, t.hsl);
      fill(0, W / 2, col(t.hsl, -10));
      for (const y0 of [6, H / 2 + 4]) {
        let x = 6;
        while (x < W / 2 - 10) {
          const bw = 6 + rand() * 6, bh = H / 2 - 14 - rand() * 10;
          g.fillStyle = `hsl(${rand() * 360}, ${35 + rand() * 30}%, ${25 + rand() * 25}%)`; g.fillRect(x, y0 + (H / 2 - 10 - bh), bw, bh);
          g.fillStyle = 'rgba(255, 230, 160, 0.5)'; g.fillRect(x + 1, y0 + (H / 2 - 10 - bh) + 4, bw - 2, 2);
          x += bw + 1;
        }
        g.fillStyle = col(t.hsl, -25); g.fillRect(0, y0 + H / 2 - 10, W / 2, 4);
      }
      break;
    }
    case 'gourd': halves((x0, w) => {
      fill(x0, w, col(t.hsl));
      for (let k = 0; k < 8; k++) { g.fillStyle = col(t.hsl, -14, 0.6); g.fillRect(x0 + k * (w / 8), 0, 3, H); }
      if (t.stripes) for (let k = 0; k < 6; k++) { g.fillStyle = col(t.stripes, 0, 0.7); g.fillRect(x0 + rand() * w, 0, 5 + rand() * 6, H); }
      speckle(x0, w, 0.15);
      if (t.face && x0 === 0) { g.fillStyle = 'rgb(255, 190, 60)'; g.beginPath(); g.moveTo(30, 50); g.lineTo(44, 34); g.lineTo(54, 50); g.fill(); g.beginPath(); g.moveTo(74, 50); g.lineTo(84, 34); g.lineTo(98, 50); g.fill(); g.fillRect(34, 76, 60, 14); }
    }); break;
    case 'cactus': halves((x0, w) => {
      fill(x0, w, col(t.hsl));
      for (let k = 0; k < 6; k++) { g.fillStyle = col(t.hsl, -12, 0.8); g.fillRect(x0 + 4 + k * (w / 6), 0, 4, H); }
      for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(250, 240, 200, 0.9)'; g.fillRect(x0 + rand() * w, rand() * H, 1, 3); }
    }); break;
    default: halves((x0, w) => { fill(x0, w, '#999'); speckle(x0, w, 0.2); });
  }
}

// A small picture of a block for the inventory: a cube seen from above, with its top (the right half
// of the texture) and two sides (the left half), the sides shaded. Returns a data URL.
const ICON = 48;
export function blockIconURL(src) {
  const c = document.createElement('canvas');
  c.width = c.height = ICON;
  const g = c.getContext('2d'), k = 22 / 128;
  // [texture x, u axis, v axis, origin, shade]
  const faces = [
    [128, [k, -k / 2], [k, k / 2], [2, 13], 0],      // top
    [0, [k, k / 2], [0, k], [2, 13], 0.22],           // left side
    [0, [k, -k / 2], [0, k], [24, 24], 0.4],          // right side
  ];
  for (const [sx, u, v, o, shade] of faces) {
    g.setTransform(u[0], u[1], v[0], v[1], o[0], o[1]);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(src, sx, 0, 128, 128, 0, 0, 128, 128);
    if (shade) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(0, 0, 0, ${shade})`; g.fillRect(0, 0, 128, 128); }
  }
  return c.toDataURL();
}
