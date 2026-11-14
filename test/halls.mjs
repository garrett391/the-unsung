// A walk through the empty halls, for judging their dressing: the dead, what they dropped, the wear on the stone.
//   npm run build && node test/halls.mjs   (writes test/shots/halls-*.png)
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
await page.evaluate(async () => {
  for (const id of ['title', 'hud', 'chron']) document.getElementById(id).style.display = 'none'; document.getElementById('fade').style.opacity = 0;
  G.director.abort(); G.running = true; G.resetWorld({ site: 'halls', player: [-110, -0.4, Math.PI], corin: null }); G.player.setVisible(false); G.player.controlEnabled = false; G.freezeAI = true;
});
// [name, camera, target], in the halls' own coordinates (x east, z north from the entrance)
const SHOTS = [['gallery', [1.2, 1.7, 0.2], [0, 1.2, -12]], ['slid-down', [0.4, 1.3, -4.6], [-3.2, 0.5, -6.6]], ['curled', [1.6, 1.5, -6.2], [-1.2, 0.2, -8.6]], ['mid', [-1.8, 1.6, -9.5], [0.5, 0.6, -18]], ['floor', [0.5, 2.6, -15], [-1.5, 0, -20]],
  ['east-wall', [-1.5, 1.4, -22.5], [3.2, 0.6, -25]], ['rotunda', [-2.5, 2.2, -31.5], [3, 0.8, -42]], ['crawl', [3.6, 1.5, -40.2], [6.6, 0.2, -43.6]], ['west', [1.5, 1.6, -38], [-5.5, 0.3, -35]], ['back', [-0.6, 1.5, -41.5], [-3.2, 0.2, -44.2]], ['descent', [0.4, 1.6, -45.5], [0, 1.0, -56]]];
for (const [n, from, to] of SHOTS) {
  await page.evaluate(async ([from, to]) => { G.cam.shot([from[0] - 110, from[1], from[2]], [to[0] - 110, to[1], to[2]]); for (let k = 0; k < 8; k++) { G.step(1 / 60, true); await null; } G.step(1 / 60); }, [from, to]);
  await page.screenshot({ path: join(shots, `halls-${n}.png`) });
}
await browser.close(); server.close();
