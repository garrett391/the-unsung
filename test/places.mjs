// The camp (by night and at dawn) and the waystation yard, empty, for judging their dressing.
//   npm run build && node test/places.mjs   (writes test/shots/camp-*.png and yard-*.png)
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
const page = await (await browser.newContext({ viewport: { width: 960, height: 560 } })).newPage();
page.on('pageerror', (e) => console.log(e.stack || e.message));
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${server.address().port}/`); await page.waitForTimeout(800);
const setup = (o, dawn) => page.evaluate(async ([o, dawn]) => {
  for (const id of ['title', 'hud', 'chron']) document.getElementById(id).style.display = 'none'; document.getElementById('fade').style.opacity = 0;
  G.director.abort(); G.running = true; G.resetWorld(o); G.player.setVisible(false); G.player.controlEnabled = false; G.freezeAI = true; if (dawn != null) G.level.setDawn(dawn);
}, [o, dawn]);
const shoot = async (pre, list, dz = 0) => { for (const [n, from, to] of list) {
  await page.evaluate(async ([from, to, dz]) => { G.cam.shot([from[0], from[1], from[2] + dz], [to[0], to[1], to[2] + dz]); for (let k = 0; k < 8; k++) { G.step(1 / 60, true); await null; } G.step(1 / 60); }, [from, to, dz]);
  await page.screenshot({ path: join(shots, `${pre}-${n}.png`) }); } };
const CAMP = [['fire', [5.2, 1.9, 0.6], [9, 0.8, -2.6]], ['ring', [3, 3.4, 16], [-4, 0.5, 5]], ['table', [-3.4, 1.8, 14.6], [-7.4, 0.7, 17.4]], ['mouth', [-4.4, 1.8, -5.2], [-8.2, 0.8, -9.8]], ['breach', [0.5, 2.2, 15.5], [0.5, 0.6, 24.5]], ['over', [10, 15, 26], [0, 0, 5]]];
await setup({ player: [0, 8, 0], corin: null }); await shoot('camp', CAMP);
await setup({ player: [0, 8, 0], corin: null }, 1); await shoot('camp-dawn', CAMP);
// the yard's own coordinates (x east, z north from its middle); it stands at z = 120
await setup({ site: 'way', sky: 'day', player: [0, 120, 0], corin: null });
await shoot('yard', [['gate', [0.8, 1.8, 3], [0.3, 0.4, 12]], ['stall', [7.2, 1.9, -1.6], [12.4, 0.9, -5]], ['well', [-1.6, 2.2, 6.2], [-8.5, 0.8, 3.6]], ['door', [4.6, 1.8, -5.4], [0.5, 1.0, -11.6]], ['stable', [-6.2, 1.9, -1.2], [-12, 0.6, -5]], ['ladder', [6.2, 1.8, -6.6], [10, 1.6, -11.6]], ['road', [1.5, 2.4, 40], [0, 1, 14]], ['over', [9, 15, 22], [0, 0, 0]]], 120);
await browser.close(); server.close();
