// The title screen, on a desktop and a phone held upright: with a save (the menu, the question CONTINUE asks, MORE closed
// and with Options and Chapters open), the pause menu once a game has started (the groups are back in it), and a first visit.
//   npm run build && node test/title.mjs   (writes test/shots/title-*.png)
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), shots = join(root, 'test/shots');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (q, s) => { try { const f = join(dist, q.url === '/' ? 'index.html' : q.url.split('?')[0]); s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(await readFile(f)); } catch { s.writeHead(404); s.end(); } }).listen(0);
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const url = `http://localhost:${server.address().port}/`, fail = [];
const check = (what, ok) => { if (!ok) fail.push(what); };
const open = async (dev, vp, touch, save) => {
  const page = await (await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch })).newPage();
  page.on('pageerror', (e) => fail.push(`${dev}: ${e.message}`));
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.evaluate((save) => { localStorage.clear(); if (save) { localStorage.setItem('the-unsung.checkpoint', 'muster'); localStorage.setItem('the-unsung.reached', JSON.stringify(['forecourt', 'halls', 'door', 'waystation', 'muster'])); } }, save);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !document.getElementById('title').classList.contains('loading'), null, { timeout: 180000 });
  await page.waitForTimeout(800);
  return page;
};
const shot = async (page, name) => { await page.waitForTimeout(450); await page.screenshot({ path: join(shots, `title-${name}.png`) }); };
const seen = (page, id) => page.evaluate((id) => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
for (const [dev, vp, touch] of [['desk', { width: 960, height: 640 }, false], ['phone', { width: 390, height: 780 }, true]]) {
  const page = await open(dev, vp, touch, true);
  await shot(page, dev);
  check(`${dev}: menu shows CONTINUE, NEW GAME, MORE`, (await page.evaluate(() => ['tcont', 'tplay', 'tmore'].map((id) => document.getElementById(id).textContent).join())) === 'CONTINUE,NEW GAME,MORE');
  await page.click('#tcont'); await shot(page, `${dev}-continue`);
  check(`${dev}: CONTINUE asks where from`, (await page.evaluate(() => document.getElementById('tcname').textContent + ' / ' + document.getElementById('tcact').textContent)) === 'The muster / Chapter V · The years between');
  check(`${dev}: the question's CONTINUE has focus`, await page.evaluate(() => document.activeElement?.id === 'tgo'));
  await page.keyboard.press('Escape'); check(`${dev}: Esc goes back`, await seen(page, 'tmenu'));
  await page.click('#tmore'); await shot(page, `${dev}-more`);
  check(`${dev}: MORE holds the four groups`, (await page.evaluate(() => document.querySelectorAll('#tmorep>details').length)) === 4);
  await page.click('#popt summary'); await shot(page, `${dev}-more-options`);
  await page.click('#pchapg summary'); await shot(page, `${dev}-more-chapters`);
  check(`${dev}: one group open at a time`, (await page.evaluate(() => document.querySelectorAll('#tmorep>details[open]').length)) === 1);
  await page.click('#tmback'); check(`${dev}: BACK returns the groups to the pause menu`, (await page.evaluate(() => document.querySelectorAll('#pause>details').length)) === 4);
  // a game started from MORE (as a chapter picked there would be) takes the groups back to the pause menu
  await page.click('#tmore');
  await page.evaluate(() => { G.auto = true; G.begin(0); for (let k = 0; k < 20; k++) G.step(1 / 30, true); G.pause(true); document.getElementById('popt').open = true; });
  await shot(page, `${dev}-pause`);
  check(`${dev}: the pause menu has its groups back`, (await page.evaluate(() => document.querySelectorAll('#pause>details').length)) === 4);
  await page.context().close();
}
// a first visit: PLAY and MORE, and no Chapters in MORE until a second chapter has been reached
const page = await open('first', { width: 960, height: 640 }, false, false);
await shot(page, 'first');
check('first: PLAY, no CONTINUE', (await page.evaluate(() => document.getElementById('tplay').textContent)) === 'PLAY' && !(await seen(page, 'tcont')));
await page.click('#tmore'); await shot(page, 'first-more');
check('first: no Chapters in MORE', !(await seen(page, 'pchapg')));
await browser.close(); server.close();
console.log(fail.length ? `FAILED\n  ${fail.join('\n  ')}` : 'title: all checks passed');
process.exit(fail.length ? 1 : 0);
