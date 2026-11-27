// The title screen, on a desktop and a phone held upright: with a save (the menu, the question CONTINUE asks and the chapters
// under it, More closed and with Options open), a chapter picked from there and the pause menu once it has started (the groups
// are back in it, in order); then a first visit, and a finished game (no save, chapters reached).
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
const open = async (dev, vp, touch, mode) => {
  const page = await (await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch })).newPage();
  page.on('pageerror', (e) => fail.push(`${dev}: ${e.message}`));
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.evaluate((mode) => {
    localStorage.clear(); if (mode === 'new') return;
    localStorage.setItem('the-unsung.reached', JSON.stringify(['forecourt', 'halls', 'door', 'waystation', 'muster']));
    if (mode === 'save') localStorage.setItem('the-unsung.checkpoint', 'muster');
  }, mode);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !document.getElementById('title').classList.contains('loading'), null, { timeout: 180000 });
  await page.waitForTimeout(800);
  return page;
};
const shot = async (page, name) => { await page.mouse.move(2, 2); await page.waitForTimeout(450); await page.screenshot({ path: join(shots, `title-${name}.png`) }); };
const seen = (page, id) => page.evaluate((id) => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
const pauseOrder = (page) => page.evaluate(() => [...document.querySelectorAll('#pause>details')].map((d) => d.id || d.querySelector('summary').textContent).join());
for (const [dev, vp, touch] of [['desk', { width: 960, height: 640 }, false], ['phone', { width: 390, height: 780 }, true]]) {
  const page = await open(dev, vp, touch, 'save');
  await shot(page, dev);
  check(`${dev}: menu shows CONTINUE, NEW GAME, More`, (await page.evaluate(() => ['tcont', 'tplay', 'tmore'].map((id) => document.getElementById(id).textContent).join())) === 'CONTINUE,NEW GAME,More');
  check(`${dev}: no Chapters link with a save`, !(await seen(page, 'tchaps')));
  await page.click('#tcont'); await shot(page, `${dev}-continue`);
  check(`${dev}: CONTINUE asks where from`, (await page.evaluate(() => document.getElementById('tcname').textContent)) === 'The muster');
  check(`${dev}: the question's CONTINUE has focus`, await page.evaluate(() => document.activeElement?.id === 'tgo'));
  await page.click('#tchapg summary'); await shot(page, `${dev}-continue-chapters`);
  check(`${dev}: the chapter CONTINUE goes to is marked`, (await page.evaluate(() => document.querySelector('#tchap .chap.now')?.textContent)) === 'VThe muster');
  await page.keyboard.press('Escape'); check(`${dev}: Esc goes back`, await seen(page, 'tmenu'));
  await page.click('#tmore'); await shot(page, `${dev}-more`);
  check(`${dev}: More holds Options, Controls, Trials`, (await page.evaluate(() => [...document.querySelectorAll('#tmorep>details')].map((d) => d.querySelector('summary').textContent).join())) === 'Options,Controls,Trials');
  await page.click('#popt summary'); await shot(page, `${dev}-more-options`);
  await page.click('#ptrial summary');
  check(`${dev}: one group open at a time`, (await page.evaluate(() => document.querySelectorAll('#tmorep>details[open]').length)) === 1);
  await page.click('#tmback'); check(`${dev}: Back returns the groups to the pause menu, in order`, (await pauseOrder(page)) === 'popt,Controls,ptrial,pchapg');
  // start from a chapter picked under CONTINUE, after a visit to More, and look at the pause menu
  await page.click('#tmore'); await page.click('#tmback'); await page.click('#tcont'); await page.click('#tchapg summary');
  await page.click('#tchap .chap:nth-of-type(2)'); // the halls
  await page.waitForFunction(() => G.running, null, { timeout: 30000 });
  await page.evaluate(() => { G.pause(true); document.getElementById('popt').open = true; });
  await shot(page, `${dev}-pause`);
  check(`${dev}: the pause menu has its groups, in order`, (await pauseOrder(page)) === 'popt,Controls,ptrial,pchapg');
  check(`${dev}: the picked chapter is running`, (await page.evaluate(() => G.STAGES[G.checkpoint].name)) === 'halls');
  await page.context().close();
}
// a first visit: PLAY and More only
let page = await open('first', { width: 960, height: 640 }, false, 'new');
await shot(page, 'first');
check('first: PLAY, no CONTINUE, no Chapters', (await page.evaluate(() => document.getElementById('tplay').textContent)) === 'PLAY' && !(await seen(page, 'tcont')) && !(await seen(page, 'tchaps')));
await page.context().close();
// a finished game: no save, chapters reached; a quiet Chapters link opens only the list
page = await open('done', { width: 960, height: 640 }, false, 'done');
await shot(page, 'done');
check('done: NEW GAME and a Chapters link', (await page.evaluate(() => document.getElementById('tplay').textContent)) === 'NEW GAME' && (await seen(page, 'tchaps')) && !(await seen(page, 'tcont')));
await page.click('#tchaps'); await shot(page, 'done-chapters');
check('done: the list, without the question', (await seen(page, 'tchap')) && !(await seen(page, 'tfrom')));
await browser.close(); server.close();
console.log(fail.length ? `FAILED\n  ${fail.join('\n  ')}` : 'title: all checks passed');
process.exit(fail.length ? 1 : 0);
