// Stills of a tip the fight is slowed for (ui.tip): the sergeant winding up his shield rush at the muster.
//   npm run build && node test/tip.mjs            (writes test/shots/tip-*.png; W=390 H=780 for a phone)
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
const shot = async (n) => { await page.waitForTimeout(700); return page.screenshot({ path: join(shots, `tip-${phone ? 'phone-' : ''}${n}.png`) }); };
const run = (sec, js) => page.evaluate(async ([sec, js]) => { const f = js && (0, eval)(js); for (let i = 0; i < sec * 60; i++) { G.player.hp = 100; if (f) f(i); G.step(1 / 60, i < sec * 60 - 1); for (let k = 0; k < 8; k++) await null; } }, [sec, js]);
await page.evaluate(() => {
  for (const id of ['title', 'chron']) document.getElementById(id).style.display = 'none'; document.getElementById('hud').style.visibility = 'visible'; document.getElementById('fade').style.opacity = 0;
  if (matchMedia('(pointer:coarse)').matches) document.getElementById('touch').style.display = 'block';
  G.director.abort(); G.running = true; G.resetWorld({ site: 'way', sky: 'morning', muster: true, look: 'drifter', corin: null, player: [1.5, 120 - 2.4, 0] }); G.blunt = true; G.player.setVisible(true); G.player.controlEnabled = true;
  const S = G.spawn('sergeant', 1.5, 120 + 1.6, { spare: true }); S.face = Math.PI; G.boss = S; G.player.lock = S; G.cam.behind(); window.S = S;
  G.ui.objective('Make the sergeant yield');
});
const TIP = 'His shield rush breaks a guard. Roll clear of it: a direction and {d}';
await run(1.2, "G.freezeAI = true; null");
await page.evaluate(() => { G.freezeAI = false; S.startMove(S.type.moves[2]); });
await run(0.3); await shot('0-before');
await page.evaluate((t) => { G.grade.uniforms.uBlur.value = 0; G.ui.tip(t); }, TIP);
await run(0.5); await shot('1-dim');
await page.evaluate(() => { G.grade.uniforms.uBlur.value = 0.011; });
await run(0.1); await shot('2-blur');
await page.evaluate(() => { G.grade.uniforms.uBlur.value = 0.022; });
await run(0.1); await shot('3-blur-strong');
await browser.close(); server.close();
