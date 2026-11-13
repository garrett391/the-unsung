// Close-up turnaround of the first foe in the current opening stage, for judging a figure's look:
//   npm run build && node test/look.mjs      (writes test/shots/look-*.png)
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), shots = join(root, 'test/shots');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (q, s) => { try { const f = join(dist, q.url === '/' ? 'index.html' : q.url.split('?')[0]); s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(await readFile(f)); } catch { s.writeHead(404); s.end(); } }).listen(0);
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 700, height: 700 } })).newPage();
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${server.address().port}/`); await page.waitForTimeout(800);
await page.evaluate(async () => { G.auto = true; G.begin(); for (let i = 0; i < 100; i++) { G.auto = i < 10; // auto just long enough to pass the opening card
    G.step(1 / 60, true); for (let k = 0; k < 24; k++) await null; } G.freezeAI = true; document.getElementById('hud').style.visibility = 'hidden'; });
for (const [n, a] of [['front', 0], ['side', 1.4], ['back', 3.14], ['three-quarter', -0.7]]) {
  await page.evaluate(async (a) => { const e = G.enemies[0], h = 1.25 * e.scale, r = 3.1; G.cam.shot([e.pos.x + Math.sin(e.face + a) * r, h + 0.3, e.pos.z + Math.cos(e.face + a) * r], [e.pos.x, h, e.pos.z]); for (let i = 0; i < 20; i++) { G.step(1 / 60, true); await null; } G.step(1 / 60); }, a);
  await page.screenshot({ path: join(shots, `look-${n}.png`) });
}
await browser.close(); server.close();
