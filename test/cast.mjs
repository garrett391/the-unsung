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
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; // ONLY=labourer,drover node test/cast.mjs
const names = await page.evaluate(async () => {
  for (const id of ['title', 'hud', 'chron']) document.getElementById(id).style.display = 'none'; document.getElementById('fade').style.opacity = 0;
  G.director.abort(); G.running = true; G.resetWorld({ site: 'way', sky: 'morning', player: [0, 130, 0], corin: null }); G.player.setVisible(false); G.player.controlEnabled = false; G.freezeAI = true;
  return [...Object.keys(G.LOOKS).filter((k) => k !== 'veiled'), 'raider', 'runner', 'bulwark', 'skirmisher', 'chief', 'sergeant', 'veiled'];
});
// one at a time, in the open middle of the yard (the yard was rebuilt, and a row of them stood behind its dressing)
for (const name of names) { if (ONLY && !ONLY.includes(name)) continue;
  await page.evaluate((k) => { if (window._c) { if (window._c.dispose) { window._c.gone = true; window._c.dead = true; } window._c.setVisible ? window._c.setVisible(false) : (window._c.root.visible = false); }
    window._c = G.LOOKS[k] ? new G.Extra(G.LOOKS[k], 0.5, 122, 0) : G.spawn(k, 0.5, 122); window._c.face = 0; }, name);
  for (const [n, a, r, h] of [['front', 0.45, 2.7, 1.1], ['back', 2.6, 2.7, 1.1], ['face', 0.5, 0.95, 1.62]]) {
    await page.evaluate(async ([a, r, h]) => { const x = 0.5, z = 122; G.cam.shot([x + Math.sin(a) * r, h + 0.1, z + Math.cos(a) * r], [x, h, z]); for (let k = 0; k < 8; k++) { G.step(1 / 60, true); await null; } G.step(1 / 60); }, [a, r, h]);
    await page.screenshot({ path: join(shots, `cast-${name}-${n}.png`) });
  }
}
await browser.close(); server.close();
