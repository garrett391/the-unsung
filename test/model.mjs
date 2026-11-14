// The authored knight model on the captain, beside the figure built in code, for judging it:
// turnarounds, the fighting poses and a run, in the waystation's daylight.
//   npm run build && node test/model.mjs      (writes test/shots/model-*.png)
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), shots = join(root, 'test/shots');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mp3': 'audio/mpeg', '.png': 'image/png', '.gltf': 'model/gltf+json' };
const server = http.createServer(async (q, s) => { try { const f = join(dist, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(await readFile(f)); } catch { s.writeHead(404); s.end(); } }).listen(0);
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 760, height: 700 } })).newPage();
page.on('pageerror', (e) => console.log(e.stack || e.message)); page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log(m.text()); });
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${server.address().port}/`); await page.waitForTimeout(800);
await page.evaluate(async () => {
  for (const id of ['title', 'hud', 'chron']) document.getElementById(id).style.display = 'none'; document.getElementById('fade').style.opacity = 0;
  G.director.abort(); G.running = true; G.manual = true; G.resetWorld({ site: 'way', sky: 'morning', player: [0, 122, 0], corin: null }); G.freezeAI = true;
  await G.setModel(true); const P = G.player; P.setVisible(true); P.controlEnabled = false; P.state = 'cine'; P.calm = true;
  window.twin = new G.Extra({ ...G.LOOKS.captain, model: undefined }, 1.5, 122, 0); // the figure built in code, beside him
});
const shoot = async (name, a, r = 3.1, h = 1.05, cx = 0.75, dt = 1 / 60) => {
  await page.evaluate(async ([a, r, h, cx, dt]) => { const P = G.player; G.cam.shot([P.pos.x + cx + Math.sin(a) * r, h + 0.25, P.pos.z + Math.cos(a) * r], [P.pos.x + cx, h, P.pos.z]); for (let i = 0; i < 14; i++) { G.step(dt, true); await null; } G.step(dt); }, [a, r, h, cx, dt]);
  await page.screenshot({ path: join(shots, `model-${name}.png`) });
};
const pose = (k) => page.evaluate((k) => { for (const c of [G.player, window.twin]) { c.guard = 0; if (k) c.play(G.C(1, [0, G.PZ[k]]), 0.01); else c.stop(0.01); } }, k);
for (const [n, a] of [['front', 0], ['three-quarter', -0.7], ['side', -1.5], ['back', 3.14], ['left', 1.5]]) await shoot('stand-' + n, a);
await shoot('face', 0.3, 1.1, 1.5, 0); await shoot('shield', 1.2, 1.3, 1.1, 0); await shoot('hand', 0.5, 0.8, 0.7, -0.3); await shoot('shoulder', 1.1, 1.2, 1.35, 0); await shoot('shoulder-back', 2.4, 1.2, 1.35, 0); await shoot('shield-top', 1.6, 1.0, 1.9, 0);
for (const k of ['guard', 'block', 'l1w', 'l1s', 'l2s', 'ths', 'hw', 'hs', 'bs', 'us', 'r0', 'hit', 'kneel', 'd2']) { await pose(k); await shoot('pose-' + k, -0.6); if (k === 'guard' || k === 'block' || k === 'hs') await shoot('pose-' + k + '-back', 2.6); if (k === 'guard' || k === 'block') await shoot('pose-' + k + '-left', 1.3, 1.6, 1.2, 0); }
// a run across the yard, the camera alongside
await pose(null);
await page.evaluate(async () => { const P = G.player; P.state = 'loco'; P.calm = true; window.twin.dispose(); G.extras.length = 0; P.walk = { x: P.pos.x, z: P.pos.z + 30, sp: 6.3 }; for (let i = 0; i < 40; i++) { G.step(1 / 60, true); await null; } });
for (let i = 0; i < 4; i++) { await page.evaluate(async () => { for (let i = 0; i < 4; i++) { G.step(1 / 60, true); await null; } }); await shoot('run-' + i, -1.2, 3, 1.05, 0, 1e-5); }
await browser.close(); server.close();
