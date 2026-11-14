// Close-ups of the cast in daylight, for judging figures: every look in LOOKS and every enemy type,
// stood in the waystation yard.   npm run build && node test/cast.mjs   (writes test/shots/cast-*.png)
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
const page = await (await browser.newContext({ viewport: { width: 520, height: 700 } })).newPage();
page.on('pageerror', (e) => console.log(e.stack || e.message));
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${server.address().port}/`); await page.waitForTimeout(800);
const names = await page.evaluate(async () => {
  for (const id of ['title', 'hud', 'chron']) document.getElementById(id).style.display = 'none'; document.getElementById('fade').style.opacity = 0;
  G.director.abort(); G.running = true; G.resetWorld({ site: 'way', sky: 'morning', player: [0, 130, 0], corin: null }); G.player.setVisible(false); G.player.controlEnabled = false; G.freezeAI = true;
  const out = []; let i = 0;
  for (const k of Object.keys(G.LOOKS)) { new G.Extra(G.LOOKS[k], -12 + (i % 9) * 3, i < 9 ? 118 : 126, 0); out.push(k); i++; }
  for (const k of ['raider', 'runner', 'bulwark', 'chief', 'sergeant']) { const e = G.spawn(k, -12 + (i % 9) * 3, i < 9 ? 118 : 126); e.face = 0; out.push(k); i++; }
  return out;
});
for (let i = 0; i < names.length; i++) for (const [n, a, r, h] of [['front', 0.35, 2.6, 1.15], ['face', 0.5, 0.95, 1.62]]) {
  await page.evaluate(async ([i, a, r, h]) => { const x = -12 + (i % 9) * 3, z = i < 9 ? 118 : 126; G.cam.shot([x + Math.sin(a) * r, h + 0.1, z + Math.cos(a) * r], [x, h, z]); for (let k = 0; k < 8; k++) { G.step(1 / 60, true); await null; } G.step(1 / 60); }, [i, a, r, h]);
  await page.screenshot({ path: join(shots, `cast-${names[i]}-${n}.png`) });
}
await browser.close(); server.close();
