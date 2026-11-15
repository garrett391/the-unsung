// The forecourt, empty, for judging its dressing, as the war left it and whole (after); the stair mouth at the head of the gallery, in the war and after; and the pause menu.
//   npm run build && node test/fore.mjs   (writes test/shots/fore-*.png, stair-*.png, pause*.png)
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
const setup = (o) => page.evaluate(async (o) => {
  for (const id of ['title', 'hud', 'chron']) document.getElementById(id).style.display = 'none'; document.getElementById('fade').style.opacity = 0;
  G.director.abort(); G.running = true; G.resetWorld(o); G.player.setVisible(false); G.player.controlEnabled = false; G.freezeAI = true;
}, o);
const shoot = async (pre, list, ox, oz) => { for (const [n, from, to] of list) {
  await page.evaluate(async ([from, to, ox, oz]) => { G.cam.shot([from[0] + ox, from[1], from[2] + oz], [to[0] + ox, to[1], to[2] + oz]); for (let k = 0; k < 8; k++) { G.step(1 / 60, true); await null; } G.step(1 / 60); }, [from, to, ox, oz]);
  await page.screenshot({ path: join(shots, `${pre}-${n}.png`) }); } };
// the court's own coordinates (x east, z north from its middle); it stands at (-150, 60)
const FORE = [['gate', [1.0, 1.4, 18.6], [0, 5.6, -13]], ['in', [0.6, 1.9, 12], [0, 3.5, -13]], ['mid', [-1.2, 1.8, 3.5], [0.5, 2.2, -13]], ['barricade', [-2.5, 1.7, 0.5], [3.5, 0.6, -4]], ['doors', [1.2, 1.7, -7.5], [0, 2.2, -14]], ['door-close', [-1.6, 1.5, -10.8], [0.3, 1.6, -15]],
  ['cypress', [-1.0, 1.7, -2.0], [-3.5, 2.5, -4.5]], ['cypress-far', [0.5, 1.8, 5], [-3.5, 2.2, -2]], ['west', [3, 1.8, 6], [-8.5, 1.2, 8.5]], ['east', [-3, 1.8, 0], [10, 2.5, 3.4]], ['back', [0.5, 1.8, -9], [0, 3, 15]], ['turret', [4, 1.7, 2], [-11.5, 12, -14.5]], ['over', [9, 17, 20], [0, 0, -3]], ['over-s', [-8, 15, -8], [2, 0, 4]]];
const OUT = [['road', [0.4, 1.7, 13], [0.3, 2.2, 40]], ['road-out', [0.8, 1.8, 19.5], [1, 2.6, 45]], ['road-back', [3, 2.2, 44], [0, 4, 14]], ['road-bend', [2, 1.8, 40], [20, 2.5, 66]], ['road-over', [-16, 20, 16], [8, 0, 46]], ['tree', [1, 1.6, 27], [7.5, 3, 26]]];
if (!process.env.AFTER) { await setup({ site: 'fore', player: [-150, 60, 0], corin: null }); await shoot('fore', [...FORE, ...OUT], -150, 60); }
await setup({ site: 'fore', after: true, sky: 'clear', player: [-150, 60, 0], corin: null }); await shoot('fore-after', [...FORE, ...OUT], -150, 60);
const STAIR = [['mouth', [0.8, 1.6, -7], [0, 1.8, 1.4]], ['close', [0.3, 1.5, -2.2], [0, 2.2, 4]]];
await setup({ site: 'halls', player: [-110, -0.4, Math.PI], corin: null }); await shoot('stair', STAIR, -110, 0);
await setup({ site: 'halls', after: true, player: [-110, -0.4, Math.PI], corin: null }); await shoot('stair-after', STAIR, -110, 0);
await page.evaluate(() => { document.getElementById('hud').style.display = ''; G.pause(true); }); await page.screenshot({ path: join(shots, 'pause.png') });
await page.evaluate(() => { document.querySelectorAll('#pause details')[0].open = true; }); await page.screenshot({ path: join(shots, 'pause-options.png') });
await browser.close(); server.close();
