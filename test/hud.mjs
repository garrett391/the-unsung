// Stills of the things the HUD hangs on the play: the waypoint pointer, the stamina and guard ring, the javelin warning.
//   npm run build && node test/hud.mjs            (writes test/shots/hud-*.png; W=390 H=780 for a phone, as hud-phone-*.png)
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), shots = join(root, 'test/shots');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (q, s) => { try { const f = join(dist, q.url === '/' ? 'index.html' : q.url.split('?')[0]); s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(await readFile(f)); } catch { s.writeHead(404); s.end(); } }).listen(0);
await mkdir(shots, { recursive: true });
const phone = (+process.env.W || 960) < 600;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: +process.env.W || 960, height: +process.env.H || 560 }, hasTouch: phone, isMobile: phone })).newPage();
page.on('pageerror', (e) => console.log(e.stack || e.message));
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${server.address().port}/`); await page.waitForTimeout(800);
const shot = async (n) => { console.log(n, await page.evaluate(() => JSON.stringify({ vis: G.player.root.visible, pos: G.player.pos.toArray().map(v => +v.toFixed(1)), cam: G.camera.position.toArray().map(v => +v.toFixed(1)), ce: G.player.controlEnabled, cin: G.cinematic, talk: G.talking, way: G.level.way, st: G.player.st, g: G.player.guarding, w: document.getElementById('way').style.transform, r: document.getElementById('way').firstChild.style.transform }))); await page.waitForTimeout(700); return page.screenshot({ path: join(shots, `hud-${phone ? 'phone-' : ''}${n}.png`) }); };
const run = (sec, js) => page.evaluate(async ([sec, js]) => { const f = js && (0, eval)(js); for (let i = 0; i < sec * 60; i++) { G.player.hp = 100; if (f) f(i); G.step(1 / 60, i < sec * 60 - 1); for (let k = 0; k < 8; k++) await null; } }, [sec, js]);
await page.evaluate(() => {
  for (const id of ['title', 'chron']) document.getElementById(id).style.display = 'none'; document.getElementById('hud').style.visibility = 'visible'; document.getElementById('fade').style.opacity = 0;
  if (matchMedia('(pointer:coarse)').matches) document.getElementById('touch').style.display = 'block';
  G.director.abort(); G.running = true; G.resetWorld({ site: 'front', sky: 'day', look: 'ranker', corin: null, player: [260, -204, 0] }); G.wayDelay = 0; G.player.setVisible(true); G.player.controlEnabled = true; G.cam.behind();
});
// the pointer: the place ahead and in view, then behind him, then round the riverbed's bend
await run(0.5, "G.level.marker(262, -186); null"); await shot('way-ahead');
await run(0.5, "G.level.goal(258, -222); null"); await shot('way-behind');
await run(0.5, "G.level.goal(254, -129); null"); await shot('way-far');
await run(0.1, "G.level.marker(null); null");
// stamina spent by a roll, then the guard up, then a blow stopped
await run(0.5, "G.keys.KeyW = true; G.press('d'); null"); await shot('ring-roll');
await run(1.2, "G.keys.KeyW = false; G.keys.ShiftLeft = true; null"); await shot('ring-guard');
// a thrower in front and one behind: the wind-up, the javelin in the air, the block
await run(0.1, "G.spawn('skirmisher', 260, -193); G.spawn('skirmisher', 266, -212); G.spawn('raider', 258, -200); null");
const until = (js, max = 12) => page.evaluate(async ([js, max]) => { for (let i = 0; i < max * 60; i++) { G.player.hp = 100; G.step(1 / 60, true); for (let k = 0; k < 8; k++) await null; if (eval(js)) break; } G.step(1 / 60); }, [js, max]);
await until("G.enemies.some(e => e.state === 'wind' && e.mv.throw && e.st > 0.12)"); await shot('throw-wind');
await until("G.missiles.length > 0"); await run(0.12); await shot('throw-flight');
await until("G.time - (G.player.blockAt || -9) < 0.08", 20); await shot('block');
// a fight puts the pointer away and restarts its clock (owner, 26 Nov 2026): the foes from above are still up
await run(0.4, "G.wayDelay = 0.2; G.level.goal(258, -222); null");
console.log(await page.evaluate(() => document.getElementById('way').style.opacity === '0' ? 'pointer in a fight: hidden' : 'FAIL: pointer shown in a fight'));
await browser.close(); server.close();
