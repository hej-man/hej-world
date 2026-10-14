// Shared setup for the browser tests: starts the dev server, opens the game in headless Chromium
// and returns helpers. Each test file is a plain script: `node tests/<name>.test.mjs [seed]`.
//
// Headless Chromium renders with a software GPU, which takes seconds per frame on this world, so
// rendering is switched off while tests run and only switched on for screenshots (shot()).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = path.join(root, 'node_modules');

async function startServer() {
  const port = 8100 + Math.floor(Math.random() * 800);
  const server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), String(port)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/index.html`)).ok) return { server, port };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  server.kill();
  throw new Error('dev server did not start');
}

// Options: seed, quality ('low' | 'high'), viewport, start ('survival' | 'creative' | null to stay in
// the menu), loadAll (generate the whole map first; most tests want terrain everywhere).
export async function openGame({
  seed = Number(process.argv[2]) || 12345,
  quality = 'low',
  viewport = { width: 480, height: 270 },
  start = 'survival',
  loadAll = true,
} = {}) {
  const name = path.basename(process.argv[1]).replace(/\.test\.mjs$/, '');
  const shotsDir = path.join(root, 'tests/shots');
  fs.mkdirSync(shotsDir, { recursive: true });
  const { server, port } = await startServer();
  const browser = await chromium.launch({ ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport });
  let failures = 0;
  const fail = (...msg) => {
    failures++;
    console.log('FAIL', ...msg);
  };
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('ERR_FAILED') || t.includes('404 (Not Found)')) return; // texture downloads are blocked in tests
    if (m.type() === 'error' || m.type() === 'warning') fail('[console]', m.type(), t.slice(0, 600));
  });
  page.on('pageerror', (e) => fail('[pageerror]', e.message, (e.stack || '').split('\n').slice(0, 4).join(' | ')));
  // serve three.js from node_modules when it's installed (works offline, and faster); else use the CDN
  const local = (pkg) => fs.existsSync(path.join(modules, pkg, 'package.json'));
  if (local('three'))
    await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', (r) =>
      r.fulfill({ path: path.join(modules, 'three', r.request().url().split('three@0.160.0/')[1]), contentType: 'text/javascript' }),
    );
  if (local('three-mesh-bvh'))
    await page.route('https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.3/**', (r) =>
      r.fulfill({
        path: path.join(modules, 'three-mesh-bvh', r.request().url().split('three-mesh-bvh@0.7.3/')[1]),
        contentType: 'text/javascript',
      }),
    );
  await page.route('https://api.polyhaven.com/**', (r) => r.abort()); // photo textures: slow, and not needed to test

  await page.goto(`http://localhost:${port}/index.html?quality=${quality}&seed=${seed}`);
  await page.waitForFunction(() => window.__game && window.__game.ready(), null, { timeout: 300000 });
  await page.evaluate(() => {
    const R = window.__game.renderer;
    window.__realRender = R.render.bind(R);
    R.render = () => {};
  });
  if (loadAll) await page.evaluate(() => window.__game.loadAll());
  if (start)
    await page.evaluate((mode) => {
      window.__game.setTestMode(true);
      window.__game.startGame(mode);
      window.__game.setWeather('clear', true); // the real game starts on random weather
    }, start);
  await page.waitForTimeout(500);

  const renderOn = (on) =>
    page.evaluate((on) => {
      window.__game.renderer.render = on ? window.__realRender : () => {};
    }, on);
  return {
    page,
    renderOn,
    fail,
    // runs fn in the page and prints its JSON result under a label
    async log(label, fn, arg) {
      try {
        const r = await page.evaluate(fn, arg);
        console.log(label, JSON.stringify(r));
        return r;
      } catch (e) {
        fail(label, 'threw', e.message.split('\n')[0]);
        return undefined;
      }
    },
    check(label, ok, detail) {
      if (ok) console.log('ok  ', label);
      else fail(label, detail === undefined ? '' : JSON.stringify(detail));
    },
    // Draws two frames and keeps them on screen for the picture. Leaving rendering on for a while
    // instead queues up dozens of software-GL frames of the whole world, which then take minutes to
    // drain and slow every later step to a crawl (and can run the browser out of memory).
    async shot(file) {
      await page.evaluate(
        () =>
          new Promise((res) => {
            let left = 2;
            window.__game.renderer.render = (...a) => {
              window.__realRender(...a);
              if (--left === 0) {
                window.__game.renderer.render = () => {};
                res();
              }
            };
          }),
      );
      await page.screenshot({ path: path.join(shotsDir, `${name}-${file}.png`), timeout: 600000 });
    },
    async finish() {
      await browser.close();
      server.kill();
      console.log(failures ? `${failures} failure(s)` : 'all passed');
      process.exitCode = failures ? 1 : 0;
    },
  };
}

// Helpers installed in the page (window.*) for the gameplay tests.
export async function installHelpers(page) {
  await page.evaluate(() => {
    const G = window.__game;
    window.waitGame = (sec) =>
      new Promise((res) => {
        const t0 = G.time();
        const f = () => (G.time() - t0 >= sec ? res() : requestAnimationFrame(f));
        f();
      });
    window.count = (id) => game.countItem(id);
    window.heal = () => {
      G.stats.health = G.MAX_HEALTH;
      G.stats.hunger = 100;
      G.stats.thirst = 100;
    };
    window.put = (x, y, z) => {
      G.player.position.set(x, y + 1.45, z);
      G.player.velocity.set(0, 0, 0);
    };
    // first person, looking at a world point
    window.aimAt = (x, y, z) => {
      const p = G.player.position,
        dx = x - p.x,
        dy = y - (p.y + 0.2),
        dz = z - p.z;
      G.setView(false);
      G.setLook(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    };
    // stand on walkable ground `back` metres from (x, z)
    window.standNear = (x, z, back = 2.2) => {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2,
          px = x + Math.cos(ang) * back,
          pz = z + Math.sin(ang) * back;
        const g = G.groundAt(px, pz);
        if (g && g.face.normal.y > 0.75 && g.point.y > game.WORLD.waterLevel + 0.5) {
          put(px, g.point.y, pz);
          return true;
        }
      }
      return false;
    };
    // a flat dry spot near the player
    // `around`: the ground must also be level that far toward +x, where the tests aim (the ground
    // is blocks, so a flat cell can sit right at the edge of a drop)
    window.flatSpot = (around = 0) => {
      const level = (x, z, y) =>
        [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].every((d) => {
          if (d > around) return true;
          const h = G.groundAt(x + d, z + 0.4);
          return h && Math.abs(h.point.y - y) < 0.1;
        });
      const p = G.player.position;
      for (let r = 0; r < (around ? 150 : 60); r += 3)
        for (let a = 0; a < 16; a++) {
          const x = p.x + Math.cos((a / 16) * 6.283) * r,
            z = p.z + Math.sin((a / 16) * 6.283) * r,
            g = G.groundAt(x, z);
          if (g && g.face.normal.y > 0.95 && g.point.y > G.terrain().waterAt(x, z) + 1 && (!around || level(x, z, g.point.y)))
            return { x, y: g.point.y, z };
        }
      return null;
    };
    window.holdLeft = async (ms) => {
      G.mouse.left = true;
      await waitGame(ms / 1000);
      G.mouse.left = false;
    };
  });
}
