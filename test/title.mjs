// The title screen with a save, closed and with each group open, on a desktop and a phone held upright.
//   npm run build && npx vite preview, then node test/title.mjs   (writes test/shots/title-*.png; URL= for another address)
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots');
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
for (const [dev, vp, touch] of [['desk', { width: 960, height: 640 }, false], ['phone', { width: 390, height: 780 }, true]]) {
  const page = await (await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch })).newPage();
  page.on('pageerror', (e) => console.log(e.stack || e.message));
  const url = process.env.URL || 'http://localhost:4173/';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.evaluate(() => { localStorage.setItem('the-unsung.checkpoint', 'muster'); localStorage.setItem('the-unsung.reached', JSON.stringify(['forecourt', 'halls', 'door', 'waystation', 'muster'])); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.waitForTimeout(2500);
  await page.screenshot({ path: join(shots, `title-${dev}.png`) });
  for (const id of ['topt', 'ttrial', 'tchapg']) {
    await page.evaluate((id) => { document.getElementById(id).open = true; }, id); await page.waitForTimeout(200);
    await page.screenshot({ path: join(shots, `title-${dev}-${id}.png`) });
  }
  // the settings are back in the pause menu once a game starts
  await page.evaluate(() => { G.auto = true; G.begin(0); for (let k = 0; k < 20; k++) G.step(1 / 30, true); G.pause(true); document.getElementById('popt').open = true; });
  await page.waitForTimeout(300); await page.screenshot({ path: join(shots, `title-${dev}-pause.png`) });
  console.log(dev, await page.evaluate(() => ({ pause: document.getElementById('popt').children.length, title: document.getElementById('topt').children.length, cont: document.getElementById('tcont').textContent })));
}
await browser.close();
