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


  // One board: a rectangle of wood with grain running along it, a lit top edge and a dark gap.
  const board = (x, y, bw, bh, c, alongY = false) => {
    const dl = (rand() - 0.5) * 12;
    g.fillStyle = col([c[0] + (rand() - 0.5) * 6, c[1], c[2] + dl]); g.fillRect(x, y, bw, bh);
    const len = alongY ? bh : bw, across = alongY ? bw : bh;
    for (let k = 0; k < Math.max(3, across / 3); k++) {
      g.strokeStyle = col(c, dl - 14 - rand() * 10, 0.22 + rand() * 0.3); g.lineWidth = 0.7 + rand();
      const o = 1.5 + rand() * (across - 3), amp = 0.5 + rand() * 1.4, ph = rand() * 6;
      g.beginPath();
      for (let d = 0; d <= len; d += 4) { const wob = Math.sin(d * 0.05 + ph) * amp; if (alongY) g.lineTo(x + o + wob, y + d); else g.lineTo(x + d, y + o + wob); }
      g.stroke();
    }
    if (rand() < 0.35) { // a knot
      const kx = x + rand() * bw, ky = y + rand() * bh;
      g.fillStyle = col(c, -26, 0.75); g.beginPath(); g.ellipse(kx, ky, alongY ? 2 : 3.5, alongY ? 3.5 : 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = col(c, -18, 0.5); g.lineWidth = 0.8; g.beginPath(); g.ellipse(kx, ky, alongY ? 3.5 : 6, alongY ? 6 : 3.5, 0, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(255, 240, 210, 0.12)'; if (alongY) g.fillRect(x, y, 1.5, bh); else g.fillRect(x, y, bw, 1.5);
    g.fillStyle = 'rgba(30, 18, 8, 0.7)'; if (alongY) g.fillRect(x + bw - 1.5, y, 1.5, bh); else g.fillRect(x, y + bh - 1.5, bw, 1.5);
  };
  // Planks laid out in each wood's own pattern, so the woods differ by more than colour.
  const planksStyled = (x0, w, c, style = 'boards') => {
    clip(x0, w, () => {
      switch (style) {
        case 'narrow': { // birch: many thin boards, staggered joints
          const rows = 7, bh = H / rows;
          for (let r = 0; r < rows; r++) { const j = rand() * w; board(x0 - w + j, r * bh, w, bh, c); board(x0 + j, r * bh, w, bh, c); }
          break;
        }
        case 'vertical': { // spruce: upright tongue-and-groove boards
          const n = 5, bw = w / n;
          for (let i = 0; i < n; i++) board(x0 + i * bw, 0, bw, H, c, true);
          g.fillStyle = 'rgba(20, 12, 6, 0.55)'; for (let i = 1; i < n; i++) g.fillRect(x0 + i * bw - 2.5, 0, 1, H);
          break;
        }
        case 'wide': { // dark oak: three heavy boards held by iron studs
          const rows = 3, bh = H / rows;
          for (let r = 0; r < rows; r++) board(x0, r * bh, w, bh, c);
          for (let r = 0; r < rows; r++) for (const sx of [10, w - 14]) {
            g.fillStyle = '#2a2a2c'; g.beginPath(); g.arc(x0 + sx, r * bh + bh / 2, 3.2, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0 + sx - 1.5, r * bh + bh / 2 - 2, 1.5, 1.5);
          }
          break;
        }
        case 'herringbone': { // maple: boards two units long, zigzagging (the whole pattern turned 45 degrees)
          const u = 11;
          g.save(); g.translate(x0 + w / 2, H / 2); g.rotate(Math.PI / 4);
          for (let m = -8; m <= 8; m++) for (let k = -12; k <= 12; k++) {
            const hx = k + 2 * m, hy = k - 2 * m;
            board(hx * u, hy * u, 2 * u, u, c);           // across
            board(hx * u, (hy + 1) * u, u, 2 * u, c, true); // and up
          }
          g.restore();
          break;
        }
        case 'chevron': { // cherry: boards meeting in V shapes down the middle
          const bl = 44, bt = 14;
          for (let row = -1; row < H / bt + 2; row++) for (let i = -1; i < w / bt + 2; i++) {
            const left = i * bt < w / 2;
            g.save(); g.translate(x0 + i * bt, row * bt * 2);
            g.rotate(left ? Math.PI / 4 : -Math.PI / 4);
            board(0, 0, bl, bt, c);
            g.restore();
          }
          break;
        }
        case 'parquet': { // jungle: squares of three boards, turned alternately
          const n = 4, sq = w / n;
          for (let i = 0; i < n; i++) for (let j = 0; j < H / sq; j++) for (let k = 0; k < 3; k++) {
            if ((i + j) % 2) board(x0 + i * sq + k * sq / 3, j * sq, sq / 3, sq, c, true);
            else board(x0 + i * sq, j * sq + k * sq / 3, sq, sq / 3, c);
          }
          break;
        }
        case 'offset': { // acacia: short boards of different lengths, with dark knots
          const rows = 5, bh = H / rows;
          for (let r = 0; r < rows; r++) { let x = -rand() * 30; while (x < w) { const bw = 24 + rand() * 40; board(x0 + x, r * bh, bw, bh, c); x += bw; } }
          break;
        }
        case 'slats': { // palm: slats with dark gaps between them
          fill(x0, w, 'rgba(25, 16, 8, 1)');
          const rows = 6, bh = H / rows;
          for (let r = 0; r < rows; r++) board(x0, r * bh + 1.5, w, bh - 4, c);
          break;
        }
        case 'rough': { // redwood: wide rough-sawn boards with curved saw marks
          const rows = 3, bh = H / rows;
          for (let r = 0; r < rows; r++) {
            board(x0, r * bh, w, bh, c);
            g.strokeStyle = col(c, -18, 0.25); g.lineWidth = 1;
            for (let k = 0; k < 7; k++) { const cx = x0 + rand() * w; g.beginPath(); g.arc(cx, r * bh + bh * 3, bh * 2.8, -Math.PI * 0.62, -Math.PI * 0.38); g.stroke(); }
          }
          break;
        }
        default: planks(x0, w, c);
      }
    });
  };
  // Bark in each wood's own style.
  const bark = (x0, w, t) => {
    const b = t.bark;
    fill(x0, w, col(b));
    clip(x0, w, () => {
      switch (t.barkStyle) {
        case 'scaly': // spruce: overlapping plates
          for (let i = 0; i < 90; i++) { const x = x0 + rand() * w, y = rand() * H; g.fillStyle = col(b, (rand() - 0.5) * 16); g.beginPath(); g.ellipse(x, y, 6 + rand() * 5, 3 + rand() * 3, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = col(b, -16, 0.6); g.lineWidth = 1; g.beginPath(); g.ellipse(x, y + 1, 6, 3, 0, 0, Math.PI); g.stroke(); }
          break;
        case 'ridged': // dark oak: deep, nearly black ridges
          for (let i = 0; i < 16; i++) { const x = x0 + (i / 16) * w + rand() * 4; g.strokeStyle = col(b, -12, 0.9); g.lineWidth = 3 + rand() * 3; g.beginPath(); for (let y = 0; y <= H; y += 6) g.lineTo(x + Math.sin(y * 0.11 + i) * 2.5, y); g.stroke(); g.strokeStyle = col(b, 10, 0.4); g.lineWidth = 1; g.beginPath(); for (let y = 0; y <= H; y += 6) g.lineTo(x + 3 + Math.sin(y * 0.11 + i) * 2.5, y); g.stroke(); }
          break;
        case 'shaggy': // maple: strips peeling away
          for (let i = 0; i < 40; i++) { const x = x0 + rand() * w, y = rand() * H, l = 12 + rand() * 24; g.fillStyle = col(b, (rand() - 0.3) * 18, 0.85); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y + l); g.lineTo(x + 6 + rand() * 3, y + l * 0.7); g.lineTo(x + 4, y); g.fill(); }
          break;
        case 'banded': // cherry: smooth with horizontal lenticels
          for (let i = 0; i < 26; i++) { g.fillStyle = col(b, 18, 0.55); g.fillRect(x0 + rand() * w, rand() * H, 6 + rand() * 12, 1.5); }
          for (let k = 0; k < 4; k++) { g.fillStyle = col(b, -8, 0.4); g.fillRect(x0, rand() * H, w, 3); }
          break;
        case 'fibrous': // redwood: long soft stringy fibres
          for (let i = 0; i < 70; i++) { const x = x0 + rand() * w; g.strokeStyle = col(b, (rand() - 0.5) * 20, 0.6); g.lineWidth = 1 + rand() * 2; g.beginPath(); for (let y = 0; y <= H; y += 10) g.lineTo(x + Math.sin(y * 0.03 + i) * 4, y); g.stroke(); }
          break;
        case 'vines': // jungle: furrows with moss and climbing vines
          for (let i = 0; i < 20; i++) { const x = x0 + rand() * w; g.strokeStyle = col(b, -14, 0.6); g.lineWidth = 2; g.beginPath(); for (let y = 0; y <= H; y += 8) g.lineTo(x + Math.sin(y * 0.08 + i) * 3, y); g.stroke(); }
          for (let v = 0; v < 3; v++) { let x = x0 + rand() * w; g.strokeStyle = 'hsl(105, 45%, 28%)'; g.lineWidth = 2; g.beginPath(); for (let y = 0; y <= H; y += 6) { x += (rand() - 0.5) * 5; g.lineTo(x, y); } g.stroke(); for (let y = 4; y < H; y += 9) { g.fillStyle = `hsl(${100 + rand() * 20}, 50%, ${28 + rand() * 12}%)`; g.beginPath(); g.ellipse(x + (rand() - 0.5) * 8, y, 3.5, 2, rand() * 3, 0, Math.PI * 2); g.fill(); } }
          break;
        case 'smooth': // acacia: smooth grey bark with darker patches
          for (let i = 0; i < 18; i++) { g.fillStyle = col(b, -10 + rand() * 6, 0.5); g.beginPath(); g.ellipse(x0 + rand() * w, rand() * H, 6 + rand() * 12, 4 + rand() * 9, rand() * 3, 0, Math.PI * 2); g.fill(); }
          break;
        case 'ringed': // palm: stacked rings left by old fronds
          for (let y = 0; y < H; y += 9 + rand() * 3) { g.fillStyle = col(b, -16, 0.8); g.fillRect(x0, y, w, 2.5); g.fillStyle = col(b, 10, 0.4); g.fillRect(x0, y + 2.5, w, 1.5); for (let k = 0; k < 5; k++) { g.fillStyle = col(b, -8, 0.6); g.fillRect(x0 + rand() * w, y - 3, 1.5, 6); } }
          break;
        default: // furrowed (oak and birch)
          for (let i = 0; i < 26; i++) {
            const x = x0 + rand() * w; g.strokeStyle = col(b, -15 - rand() * 12, 0.5 + rand() * 0.4); g.lineWidth = 1.5 + rand() * 3;
            g.beginPath(); for (let y = 0; y <= H; y += 8) g.lineTo(x + Math.sin(y * 0.08 + i) * 3, y); g.stroke();
          }
      }
      if (t.marks) for (let i = 0; i < 14; i++) { g.fillStyle = col(t.marks, (rand() - 0.5) * 10, 0.85); g.fillRect(x0 + rand() * w, rand() * H, 6 + rand() * 14, 2 + rand() * 3); } // birch's dark marks
    });
    speckle(x0, w, 0.2, true);
  };
  // Leaves of each wood's shape.
  const leaf = (x, y, c, shape) => {
    g.save(); g.translate(x, y); g.rotate(rand() * Math.PI * 2);
    g.fillStyle = col(c, (rand() - 0.5) * 22);
    switch (shape) {
      case 'needles': case 'sprays':
        g.strokeStyle = g.fillStyle; g.lineWidth = shape === 'sprays' ? 1.2 : 1;
        for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(0, k * 1.6); g.lineTo(5, k * 1.6 + (shape === 'sprays' ? 2 : 0)); g.moveTo(0, k * 1.6); g.lineTo(-5, k * 1.6 + (shape === 'sprays' ? 2 : 0)); g.stroke(); }
        break;
      case 'star': // maple
        g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, r = k % 2 ? 2.4 : 6.5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
        break;
      case 'broad': // jungle
        g.beginPath(); g.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = col(c, 14, 0.5); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.stroke();
        break;
      case 'fronds': // palm
        g.strokeStyle = g.fillStyle; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); g.stroke();
        for (let k = -10; k <= 10; k += 2.5) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 2, -5); g.moveTo(k, 0); g.lineTo(k + 2, 5); g.stroke(); }
        break;
      case 'tiny': // acacia
        for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(k * 2.5 - 4, (k % 2) * 2 - 1, 1.6, 1, 0, 0, Math.PI * 2); g.fill(); }
        break;
      case 'small': // birch
        g.beginPath(); g.ellipse(0, 0, 3.2, 2.6, 0, 0, Math.PI * 2); g.fill();
        break;
      case 'lobed': // oak
        for (const [dx, dy, r] of [[0, 0, 3], [3, -1.8, 2.2], [3, 1.8, 2.2], [-3, -1.6, 2], [-3, 1.6, 2], [5.5, 0, 1.8]]) { g.beginPath(); g.arc(dx, dy, r, 0, Math.PI * 2); g.fill(); }
        break;
      default: { const len = 4 + rand() * 6; g.beginPath(); g.ellipse(0, 0, len, len * 0.45, 0, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
  };
  // Cut stone laid in courses, keeping the stone's own pattern on every block (drawn first, under
  // the mortar), so granite bricks look like granite and marble bricks like marble.
  const masonry = (x0, w, t, layout = 'running') => {
    const c = t.hsl, cells = [];
    const rowsOf = (rows, per, offset = true) => { const bh = H / rows, bw = w / per; for (let r = 0; r < rows; r++) for (let k = -1; k <= per; k++) cells.push([k * bw + (offset && r % 2 ? bw / 2 : 0), r * bh, bw, bh]); };
    switch (layout) {
      case 'large': rowsOf(2, 1.5); break;
      case 'small': rowsOf(6, 4); break;
      case 'long': rowsOf(5, 1); break;
      case 'tiles': rowsOf(4, 4, false); break;
      case 'basket': { const s2 = w / 4; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { if ((i + j) % 2) { cells.push([i * s2, j * s2, s2 / 2, s2], [i * s2 + s2 / 2, j * s2, s2 / 2, s2]); } else { cells.push([i * s2, j * s2, s2, s2 / 2], [i * s2, j * s2 + s2 / 2, s2, s2 / 2]); } } break; }
      case 'irregular': { let y = 0; while (y < H) { const bh = 18 + rand() * 22; let x = -rand() * 20; while (x < w) { const bw = 20 + rand() * 36; cells.push([x, y, bw, bh]); x += bw; } y += bh; } break; }
      default: rowsOf(t.rows || 4, 2);
    }
    stone(x0, w, t);
    clip(x0, w, () => {
      for (const [x, y, bw, bh] of cells) {
        const dl = (rand() - 0.5) * 0.16;
        g.fillStyle = dl > 0 ? `rgba(255,255,255,${dl})` : `rgba(0,0,0,${-dl})`; g.fillRect(x0 + x, y, bw, bh);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0 + x + 2, y + 2, bw - 4, 2); g.fillRect(x0 + x + 2, y + 2, 2, bh - 4);
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x0 + x + 2, y + bh - 4, bw - 4, 2); g.fillRect(x0 + x + bw - 4, y + 2, 2, bh - 4);
        g.strokeStyle = col(c, -26, 0.95); g.lineWidth = 2.5; g.strokeRect(x0 + x, y, bw, bh);
      }
    });
  };
  // Metal surfaces.
  const metalBase = (x0, w, t) => {
    const c = t.hsl, grd = g.createLinearGradient(x0, 0, x0 + w, H);
    grd.addColorStop(0, col(c, 12)); grd.addColorStop(0.5, col(c)); grd.addColorStop(1, col(c, -12));
    g.fillStyle = grd; g.fillRect(x0, 0, w, H);
    if (t.brushed) for (let i = 0; i < 160; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'; g.fillRect(x0 + rand() * w, rand() * H, 20 + rand() * 60, 1); }
    if (t.anodised) { const a = g.createLinearGradient(x0, H, x0 + w, 0); a.addColorStop(0, col(t.anodised, 0, 0)); a.addColorStop(0.5, col(t.anodised, 0, 0.3)); a.addColorStop(1, col([200, 40, 70], 0, 0.2)); g.fillStyle = a; g.fillRect(x0, 0, w, H); }
  };
  const rivet = (x, y, c) => { g.fillStyle = col(c, -30); g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); g.fillStyle = col(c, 25, 0.8); g.fillRect(x - 1.5, y - 1.8, 1.5, 1.5); };

  const t = tex;
  switch (t.kind) {
    case 'planks': halves((x0, w) => planksStyled(x0, w, t.hsl, t.style)); break;
    case 'log': {
      bark(0, W / 2, t);
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
      const n = { broad: 150, fronds: 120, needles: 520, sprays: 420, tiny: 520, small: 600, star: 300, lobed: 300 }[t.shape] || 420;
      for (let i = 0; i < n; i++) leaf(x0 + rand() * w, rand() * H, t.hsl, t.shape);
      if (t.blossom) for (let i = 0; i < 70; i++) { g.fillStyle = col(t.blossom, (rand() - 0.5) * 10); g.beginPath(); g.arc(x0 + rand() * w, rand() * H, 1.5 + rand() * 2, 0, Math.PI * 2); g.fill(); }
    }); break;
    case 'stone': halves((x0, w) => stone(x0, w, t)); break;
    case 'polished': halves((x0, w) => {
      // the stone's own pattern, ground smooth and glossy
      stone(x0, w, t);
      const grd = g.createLinearGradient(x0, 0, x0 + w, H); grd.addColorStop(0, col(t.hsl, 10, 0.45)); grd.addColorStop(0.5, col(t.hsl, 0, 0.2)); grd.addColorStop(1, col(t.hsl, -6, 0.45));
      g.fillStyle = grd; g.fillRect(x0, 0, w, H);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w * 0.45, 0); g.lineTo(x0, H * 0.7); g.fill(); // a gloss highlight
      g.strokeStyle = col(t.hsl, -22, 0.6); g.lineWidth = 3; g.strokeRect(x0 + 6, 6, w - 12, H - 12);
      g.strokeStyle = col(t.hsl, 14, 0.5); g.lineWidth = 1.5; g.strokeRect(x0 + 9, 9, w - 18, H - 18);
    }); break;
    case 'bricks': halves((x0, w) => { if (t.layout || t.style || t.spots) masonry(x0, w, t, t.layout); else bricks(x0, w, t.hsl, t.rows); if (t.cracks) cracks(x0, w); if (t.moss) moss(x0, w, t.moss); }); break;
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
      metalBase(x0, w, t);
      if (t.rivets === 'dense') { for (let x = 8; x < w; x += 16) for (let y = 8; y < H; y += 16) rivet(x0 + x, y, t.hsl); speckle(x0, w, 0.08); return; }
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
    case 'bars': halves((x0, w) => { // see-through: bars between two rails
      g.clearRect(x0, 0, w, H);
      const n = 5, c = t.hsl;
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + 0.5) * (w / n), grd = g.createLinearGradient(x - 4, 0, x + 4, 0);
        grd.addColorStop(0, col(c, -20)); grd.addColorStop(0.4, col(c, 25)); grd.addColorStop(1, col(c, -25));
        g.fillStyle = grd; g.fillRect(x - 4, 0, 8, H);
      }
      for (const y of [4, H - 12]) { g.fillStyle = col(c, -8); g.fillRect(x0, y, w, 8); g.fillStyle = col(c, 20, 0.6); g.fillRect(x0, y, w, 2); }
    }); break;
    case 'grate': halves((x0, w) => { // see-through: a diamond mesh in a frame
      g.clearRect(x0, 0, w, H);
      const c = t.hsl; g.strokeStyle = col(c); g.lineWidth = 3.5;
      clip(x0, w, () => { for (let k = -H; k < w + H; k += 16) { g.beginPath(); g.moveTo(x0 + k, 0); g.lineTo(x0 + k + H, H); g.moveTo(x0 + k + H, 0); g.lineTo(x0 + k, H); g.stroke(); } });
      g.strokeStyle = col(c, 15); g.lineWidth = 8; g.strokeRect(x0 + 4, 4, w - 8, H - 8);
    }); break;
    case 'tread': halves((x0, w) => { // raised lozenges in alternating directions
      metalBase(x0, w, { hsl: t.hsl, brushed: true });
      for (let x = 6; x < w; x += 16) for (let y = 6; y < H; y += 16) {
        const a = ((x + y) / 16) % 2 ? 0.6 : -0.6;
        g.save(); g.translate(x0 + x, y); g.rotate(a);
        g.fillStyle = col(t.hsl, -22, 0.8); g.fillRect(-6, 0, 12, 3.5); g.fillStyle = col(t.hsl, 28, 0.85); g.fillRect(-6, -1.5, 12, 2);
        g.restore();
      }
    }); break;
    case 'plating': halves((x0, w) => { // big panels with seams and hex bolts, a little heat tint
      metalBase(x0, w, { hsl: t.hsl, anodised: [255, 35, 65] });
      g.strokeStyle = col(t.hsl, -30, 0.8); g.lineWidth = 2;
      g.strokeRect(x0 + 1, 1, w - 2, H - 2); g.beginPath(); g.moveTo(x0 + w * 0.58, 0); g.lineTo(x0 + w * 0.58, H); g.moveTo(x0, H * 0.42); g.lineTo(x0 + w * 0.58, H * 0.42); g.stroke();
      for (const [x, y] of [[8, 8], [w - 9, 8], [8, H - 9], [w - 9, H - 9], [w * 0.58 - 8, H * 0.42 + 8], [w * 0.58 + 8, H / 2]]) {
        g.fillStyle = col(t.hsl, -25); g.beginPath(); for (let k = 0; k < 6; k++) g.lineTo(x0 + x + Math.cos(k * 1.047) * 3.6, y + Math.sin(k * 1.047) * 3.6); g.fill();
        g.fillStyle = col(t.hsl, 25, 0.7); g.fillRect(x0 + x - 1, y - 2, 2, 1.5);
      }
    }); break;
    case 'metaltiles': halves((x0, w) => { // small square tiles with polished bevels
      fill(x0, w, col(t.hsl, -30));
      const s4 = w / 4;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        const x = x0 + i * s4 + 2, y = j * (H / 2) + 2, sw = s4 - 4, sh = H / 2 - 4, grd = g.createLinearGradient(x, y, x + sw, y + sh);
        grd.addColorStop(0, col(t.hsl, 18)); grd.addColorStop(0.5, col(t.hsl, (i + j) % 2 ? 4 : -4)); grd.addColorStop(1, col(t.hsl, -14));
        g.fillStyle = grd; g.fillRect(x, y, sw, sh);
        g.strokeStyle = col(t.hsl, 30, 0.6); g.lineWidth = 1; g.strokeRect(x + 3, y + 3, sw - 6, sh - 6);
      }
    }); break;
    case 'panels': halves((x0, w) => { // copper sheets going green where rain runs down them
      metalBase(x0, w, t);
      g.strokeStyle = col(t.hsl, -25, 0.8); g.lineWidth = 2; for (const x of [0, w / 2]) g.strokeRect(x0 + x + 1, 1, w / 2 - 2, H - 2);
      for (let i = 0; i < 26; i++) {
        const x = x0 + rand() * w, y = rand() * H * 0.4, l = 20 + rand() * 70, th = 3 + rand() * 9, grd = g.createLinearGradient(0, y, 0, y + l);
        grd.addColorStop(0, col(t.patina, 0, 0.75)); grd.addColorStop(1, col(t.patina, 10, 0));
        g.fillStyle = grd; g.fillRect(x, y, th, l);
      }
      for (let i = 0; i < 60; i++) { g.fillStyle = col(t.patina, (rand() - 0.5) * 16, 0.6); g.beginPath(); g.arc(x0 + rand() * w, rand() * H, 1 + rand() * 3, 0, Math.PI * 2); g.fill(); }
      for (const x of [6, w / 2 - 6, w / 2 + 6, w - 6]) for (const y of [6, H - 6]) rivet(x0 + x, y, t.hsl);
    }); break;
    case 'chains': halves((x0, w) => { // see-through: chains hanging down
      g.clearRect(x0, 0, w, H);
      for (const cx of [w * 0.27, w * 0.73]) for (let y = -6, k = 0; y < H + 8; y += 11, k++) {
        g.strokeStyle = col(t.hsl, -25); g.lineWidth = 5; g.beginPath(); if (k % 2) g.ellipse(x0 + cx, y, 2, 8, 0, 0, Math.PI * 2); else g.ellipse(x0 + cx, y, 6, 8, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = col(t.hsl, k % 2 ? 0 : 20); g.lineWidth = 3; g.beginPath(); if (k % 2) g.ellipse(x0 + cx, y, 2, 8, 0, 0, Math.PI * 2); else g.ellipse(x0 + cx, y, 6, 8, 0, 0, Math.PI * 2); g.stroke();
      }
    }); break;
    case 'gears': halves((x0, w) => { // brass gears meshing on a dark backplate
      fill(x0, w, col(t.back));
      clip(x0, w, () => {
        for (const [cx, cy, r, teeth] of [[0.3, 0.38, 30, 12], [0.72, 0.62, 24, 10], [0.62, 0.12, 16, 8], [0.12, 0.92, 18, 8]]) {
          const x = x0 + cx * w, y = cy * H;
          g.beginPath(); for (let k = 0; k < teeth * 4; k++) { const a = (k / (teeth * 4)) * Math.PI * 2, rr = k % 4 < 2 ? r : r * 0.8; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath();
          const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r); grd.addColorStop(0, col(t.hsl, 25)); grd.addColorStop(1, col(t.hsl, -12));
          g.fillStyle = grd; g.fill(); g.strokeStyle = col(t.hsl, -30); g.lineWidth = 1.2; g.stroke();
          g.fillStyle = col(t.back, -10); g.beginPath(); g.arc(x, y, r * 0.25, 0, Math.PI * 2); g.fill();
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; g.fillStyle = col(t.back, 5); g.beginPath(); g.arc(x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52, r * 0.12, 0, Math.PI * 2); g.fill(); }
        }
      });
      speckle(x0, w, 0.12);
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
