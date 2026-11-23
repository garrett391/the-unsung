// The well picket with its people (front.js for the tents and the rest, `camp` in mission.js for who is about):
// plays a chapter up to where he is given control, then takes stills round the camp, and walks him up to one of them so a
// passing line shows.   npm run build && node test/camp.mjs   (writes test/shots/camp-*.png; ONLY=patrol for one chapter)
// It takes a few minutes.
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
page.on('pageerror', (e) => console.log('PAGE ERROR', e.stack || e.message));
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${server.address().port}/`); await page.waitForTimeout(800);

const F = [260, -160], w = (x, y, z) => [F[0] + x, y, F[1] + z]; // local to the frontier (y is left to the ground: see `cam` below)
const step = (sec, until) => page.evaluate(async ({ sec, until }) => { for (let i = 0; i < sec * 60; i++) { G.confirm = true; G.step(1 / 60, true); for (let k = 0; k < 24; k++) await null; if (until && eval(until)) break; } }, { sec, until });
const still = async (n, from, to) => { await page.evaluate(async ([from, to]) => { const h = (p) => [p[0], p[1] + G.level.height(p[0], p[2]), p[2]]; G.cinematic = true; G.cam.shot(h(from), h(to)); for (let k = 0; k < 8; k++) { G.step(1 / 60, true); await null; } G.step(1 / 60); }, [from, to]); await page.screenshot({ path: join(shots, `camp-${n}.png`) }); };
// walk him to a local point (he is placed a few metres short and walks the rest, so the line fires the way it would in play)
const walkUp = async (n, x, z, face) => { await page.evaluate(([x, z, face]) => { const P = G.player; G.cinematic = false; P.place(x - Math.sin(face) * 3.4, z - Math.cos(face) * 3.4, face); G.cam.behind(); P.walk = { x, z, sp: 1.6 }; }, [F[0] + x, F[1] + z, face]);
  await step(4); await page.evaluate(() => { G.player.walk = null; }); await step(0.6); await page.screenshot({ path: join(shots, `camp-${n}.png`) }); };

const only = process.env.ONLY;
const run = async (stage, fn) => { if (only && only !== stage) return;
  await page.evaluate((name) => { G.manual = true; G.auto = true; document.getElementById('title').style.display = 'none'; document.getElementById('hud').style.visibility = 'visible'; G.running = true; G.player.setVisible(true); G.runFrom(G.STAGES.findIndex((s) => s.name === name)); }, stage);
  await step(120, 'G.player.controlEnabled'); await page.evaluate(() => { G.auto = false; }); await step(2); await fn(); };

await run('patrol', async () => { // by day: the walker sets off once he is free to walk
  await step(6);
  await still('day-east', w(9.5, 1.7, -36.5), w(15.5, 0.8, -42));
  await still('day-west', w(-6.5, 1.8, -40.5), w(-13.5, 0.8, -38.5));
  await still('day-wheel', w(-8.6, 1.4, -46.6), w(-10.6, 0.7, -45.2));
  await still('day-lookout', w(8.0, 1.6, -34.2), w(10.6, 1.0, -31.6));
  await still('day-wide', w(-2, 5.5, -27), w(4, 0, -44));
  await walkUp('say-cook', -11.9, -37.4, -2.2);
});
await run('picket', async () => { // by night
  await still('night-east', w(8.5, 1.7, -33.5), w(14, 0.6, -40));
  await still('night-hearth', w(-8.6, 1.5, -36.6), w(-11.6, 0.6, -36.6));
  await still('night-wide', w(-2, 5.5, -27), w(4, 0, -44));
  await walkUp('say-lookout', 10.6, -33.1, 0);
});
await browser.close(); server.close();
