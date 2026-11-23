// A few stills of one place, for looking at a change without running a whole tour.
//   npm run build && WORLD='{"site":"way"}' SHOTS='[["palm",[0,2,125],[-9,5,128]]]' node test/shot.mjs   (writes test/shots/shot-<name>.png)
// WORLD is what resetWorld takes; EVAL is a script run after it (e.g. 'G.level.front.camp({ night: true })'); each shot is [name, camera position, look-at] in world coordinates. W and H set the window (a phone: W=390 H=780).
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
const page = await (await browser.newContext({ viewport: { width: +process.env.W || 960, height: +process.env.H || 560 } })).newPage();
page.on('pageerror', (e) => console.log(e.stack || e.message));
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${server.address().port}/`); await page.waitForTimeout(800);
await page.evaluate(async (o) => {
  for (const id of ['title', 'hud', 'chron']) document.getElementById(id).style.display = 'none'; document.getElementById('fade').style.opacity = 0;
  G.director.abort(); G.running = true; const { eval: _e, ...w } = o; G.resetWorld({ corin: null, ...w }); G.player.setVisible(false); G.player.controlEnabled = false; G.freezeAI = true;
  if (o.eval) (0, eval)(o.eval);
}, { ...JSON.parse(process.env.WORLD || '{}'), eval: process.env.EVAL || '' });
for (const [n, from, to] of JSON.parse(process.env.SHOTS || '[]')) {
  await page.evaluate(async ([from, to]) => { G.cam.shot(from, to); for (let k = 0; k < 8; k++) { G.step(1 / 60, true); await null; } G.step(1 / 60); }, [from, to]);
  await page.screenshot({ path: join(shots, `shot-${n}.png`) });
}
await browser.close(); server.close();
