// Can every kind of raider get from where it spawns to the captain? Spawns each kind at each entrance
// (the breach and the east gap at the camp; both flanks at the waystation; the doors at the forecourt), steps the game, and reports
// any that are still far from him.   npm run build && node test/paths.mjs
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (q, s) => { try { const f = join(dist, q.url === '/' ? 'index.html' : q.url.split('?')[0]); s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(await readFile(f)); } catch { s.writeHead(404); s.end(); } }).listen(0);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 480, height: 280 } })).newPage();
page.on('pageerror', (e) => console.log(e.stack || e.message));
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${server.address().port}/`); await page.waitForTimeout(800);
const run = (name, world, at, spawns, secs = 30) => page.evaluate(async ([name, world, at, spawns, secs]) => {
  for (const id of ['title', 'hud', 'chron']) document.getElementById(id).style.display = 'none';
  const bad = [];
  for (const [kind, pts] of spawns) for (const [x, z] of pts) {
    G.director.abort(); G.running = true; G.resetWorld(world); G.player.controlEnabled = false; G.player.inv = 1e9; G.maxAtk = 0; G.freezeAI = false; G.player.place(at[0], at[1], 0);
    const e = G.spawn(kind, x, z);
    for (let k = 0; k < secs * 60; k++) { G.step(1 / 60, true); G.player.inv = 1e9; if (k % 600 === 0) await null; }
    const d = Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z);
    if (d > 6) bad.push(`${name}: ${kind} from ${x},${z} stuck at ${e.pos.x.toFixed(1)},${e.pos.z.toFixed(1)} (${d.toFixed(1)} m off)`);
  }
  return bad;
}, [name, world, at, spawns, secs]);
const KINDS = ['raider', 'runner', 'bulwark', 'chief', 'brute'], each = (pts) => KINDS.map((k) => [k, pts]);
const BREACH = [[-2.6, 29], [2.6, 36], [0, 32]], EAST = [[22, -4], [26, -2], [24, -3], [26, -4], [22, -2]];
let bad = []; const ONLY = process.env.ONLY; // ONLY=front: just the frontier
if (!ONLY) for (const at of [[0, 6], [0, -7.1], [-12, 16], [12, -6], [-1.8, -6.8], [9, 9], [-13, -6], [6, -8.5], [0, -20]]) bad = bad.concat(await run(`camp, captain at ${at}`, { player: [0, 8, 0], corin: null }, at, each([...BREACH, ...EAST])));
const WAY = [[8, 135.6], [13, 139.6], [-8, 135.6], [-13, 139.6], [-8.5, 137.5], [10, 137]];
if (!ONLY) for (const at of [[0, 120], [-9, 112], [10, 128], [0, 110.5]]) bad = bad.concat(await run(`yard, captain at ${at}`, { site: 'way', sky: 'day', player: [0, 120, 0], corin: null }, at, each(WAY)));
if (!ONLY) for (const at of [[-150, 71], [-158, 66], [-141, 50], [-150, 62], [-144, 55.5]]) bad = bad.concat(await run(`forecourt, captain at ${at}`, { site: 'fore', player: [-150, 60, 0], corin: null }, at, [['glasssentry', [[-150.4, 44.8], [-149.6, 43.9]]]]));
// The frontier: open ground made of circles, with a riverbed that bends. From every place raiders get up out of the sand, to him anywhere on it.
const FR = [[17.5, -17], [28, -21], [-16.5, 19], [-27, 8], [-3, -1.5], [9, 70], [42, 38], [11.5, 39.5]].map(([x, z]) => [260 + x, -160 + z]);
if (!ONLY || ONLY === 'front') for (const at of [[0, -40], [8, -17], [-15, 12], [18, 43], [-25, 10], [47, -10]]) bad = bad.concat(await run(`frontier, captain at ${at}`, { site: 'front', player: [260, -200, 0], corin: null }, [260 + at[0], -160 + at[1]], [['raider', FR], ['brute', FR]], 75)); // (75 s: a Breaker walks, and it is a long way)
console.log(bad.length ? bad.join('\n') : 'every spawn reaches the captain'); await browser.close(); server.close(); process.exit(bad.length ? 1 : 0);
