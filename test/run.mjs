// Headless playtest: serves dist/, maps the three.js CDN to the local copy,
// drives the game through its stages and saves screenshots.
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('dist');
const THREE = readFileSync(path.resolve('node_modules/three/build/three.module.min.js'));
const OUT = path.resolve(process.argv[2] || 'test/shots');
const MODE = process.argv[3] || 'full';
const VW = Number(process.argv[4] || 1280), VH = Number(process.argv[5] || 720);
const TOUCH = process.argv[6] === 'touch';
mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  let body = null;
  try { body = readFileSync(p); } catch { body = null; }
  if (body) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(body); }
  else { res.writeHead(404); res.end(); }
}).listen(Number(process.env.PORT || 8123));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--disable-sync', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: VW, height: VH, hasTouch: TOUCH, isMobile: TOUCH, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.setRequestInterception(true);
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('cdn.jsdelivr.net/npm/three@0.170.0')) return r.respond({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: THREE });
  if (u.includes('fonts.googleapis') || u.includes('fonts.gstatic')) return r.respond({ status: 200, contentType: 'text/css', body: '' });
  r.continue();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('shot', name); };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const stage = () => ev(() => window.__unsung.stages[window.__unsung.game.stageIndex]);
const waitFor = async (fn, ms = 20000, label = '') => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(fn)) return true; await sleep(100); }
  console.log('TIMEOUT waiting for', label);
  return false;
};
const press = async (b, hold = 60) => { await ev((b) => window.__unsung.game.input.virtual(b, true), b); await sleep(hold); await ev((b) => window.__unsung.game.input.virtual(b, false), b); };
const move = (x, y) => ev((x, y) => { window.__unsung.game.input.virtMove = [x, y]; }, x, y);
const info = () => ev(() => {
  const g = window.__unsung.game, P = g.player;
  return { stage: window.__unsung.stages[g.stageIndex], obj: document.getElementById('obj-text').textContent, hp: P.hp, st: P.state, lock: !!P.lock, enemies: g.enemies.filter((e) => e.alive).length, prog: +g.hold.progress.toFixed(2), skills: [...P.skills].join(',') };
});
const startBot = () => ev(() => {
  const g = window.__unsung.game, I = g.input;
  window.__bot = setInterval(() => {
    const P = g.player;
    if (!P.controlEnabled || g.ui.dialogueOpen) { I.virtMove = null; return; }
    if (!P.lock) { I.virtual('lock', true); setTimeout(() => I.virtual('lock', false), 30); }
    const L = P.lock;
    if (L) {
      const d = P.dist(L);
      I.virtMove = d > 2.0 ? [0, 1] : null;
      if (d < 2.6) { I.virtual('attack', true); setTimeout(() => I.virtual('attack', false), 40); }
    } else I.virtMove = null;
    if (P.hp < 6) P.hp = 12; // the bot is here to test flow, not to die
  }, 110);
});
const stopBot = () => ev(() => { clearInterval(window.__bot); window.__unsung.game.input.virtMove = null; });

try {
  await page.goto('http://localhost:' + (process.env.PORT || 8123) + '/', { waitUntil: 'load' });
  await waitFor(() => !!window.__unsung, 15000, 'boot');
  await sleep(2500);
  await shot('01-title');
  if (MODE === 'title') throw 'done';
  if (MODE === 'phone') {
    await page.click('#btn-begin');
    await ev(() => { window.__unsung.game.autoAdvance = true; });
    await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'tutorial' && window.__unsung.game.player.controlEnabled, 30000, 'tutorial');
    await sleep(1500);
    await shot('p2-tutorial');
    await ev(() => window.__unsung.jump('hold'));
    await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'hold' && window.__unsung.game.player.controlEnabled, 10000, 'hold');
    await sleep(4000);
    await shot('p3-hold');
    await ev(() => window.__unsung.jump('vessa2'));
    await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'vessa2' && window.__unsung.game.player.controlEnabled, 10000, 'vessa2');
    await sleep(3000);
    await shot('p4-blind');
    console.log(await info(), await ev(() => window.__unsung.game.input.device));
    throw 'done';
  }
  await page.click('#btn-begin');
  await ev(() => { window.__unsung.game.autoAdvance = true; });
  await sleep(1200);
  await shot('02-intro-page');
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'tutorial' && window.__unsung.game.player.controlEnabled, 30000, 'tutorial control');
  await sleep(300);
  console.log('tutorial', await info());
  // walk to Corin and lock on
  await move(0, 1);
  await waitFor(() => window.__unsung.game.player.dist(window.__unsung.game.corin) < 3.2, 8000, 'reach corin');
  await move(0, 0);
  await press('lock');
  await sleep(300);
  console.log('locked', await info());
  for (let i = 0; i < 10; i++) {
    if (await ev(() => window.__unsung.game.player.dist(window.__unsung.game.corin) > 2.2)) { await move(0, 1); await sleep(250); await move(0, 0); }
    await press('attack'); await sleep(550); if ((await info()).obj.includes('Block')) break;
  }
  await sleep(300);
  await shot('03-spar-strike');
  console.log('after strikes', await info());
  // block Corin's swings
  await ev(() => window.__unsung.game.input.virtual('shield', true));
  await waitFor(() => !document.getElementById('obj-text').textContent.includes('Block'), 14000, 'blocks');
  await ev(() => window.__unsung.game.input.virtual('shield', false));
  console.log('after blocks', await info());
  await waitFor(() => document.getElementById('obj-text').textContent.includes('Shield Attack'), 8000, 'bash step');
  await sleep(400);
  await shot('04-toast-shield-attack');
  // real mouse: hold right (shield), click left (attack)
  if (await ev(() => window.__unsung.game.player.dist(window.__unsung.game.corin) > 2.2)) { await move(0, 1); await sleep(300); await move(0, 0); }
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'right' });
  await sleep(200);
  await page.mouse.down({ button: 'left' });
  await sleep(60);
  console.log('mouse chord state', await ev(() => window.__unsung.game.player.state));
  await page.mouse.up({ button: 'left' });
  await sleep(300);
  await page.mouse.up({ button: 'right' });
  const okMouse = await waitFor(() => document.getElementById('obj-text').textContent.includes('Back Slice'), 10000, 'backslice step (mouse chord)');
  console.log('MOUSE CHORD SHIELD ATTACK', okMouse ? 'PASS' : 'FAIL');
  console.log('bs step', await info());
  for (let i = 0; i < 6; i++) {
    if (!(await ev(() => !!window.__unsung.game.player.lock))) await press('lock');
    await move(1, 0);
    await press('roll', 50);
    await move(0, 0);
    await sleep(260);
    await press('attack');
    await sleep(700);
    if ((await info()).obj.includes('Helm')) break;
  }
  console.log('after backslice', await info());
  await waitFor(() => document.getElementById('obj-text').textContent.includes('Helm'), 10000, 'helm step');
  for (let i = 0; i < 6; i++) {
    if (!(await ev(() => !!window.__unsung.game.player.lock))) await press('lock');
    if (await ev(() => window.__unsung.game.player.dist(window.__unsung.game.corin) > 2.6)) { await move(0, 1); await sleep(300); await move(0, 0); }
    await ev(() => window.__unsung.game.input.virtual('shield', true));
    await sleep(120);
    await press('attack');
    await sleep(250);
    await ev(() => window.__unsung.game.input.virtual('shield', false));
    await press('roll');
    await sleep(320);
    await shot('05-helm-splitter');
    await sleep(700);
    if (!(await info()).obj.includes('Helm')) break;
  }
  console.log('after helm', await info());
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'raid', 30000, 'raid');
  await waitFor(() => window.__unsung.game.player.controlEnabled, 15000, 'raid control');
  await startBot();
  await sleep(5000);
  await shot('06-raid');
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'fallback', 120000, 'raid cleared');
  console.log('raid done', await info());
  await stopBot();
  await ev(() => window.__unsung.jump('hold'));
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'hold' && window.__unsung.game.player.controlEnabled, 10000, 'hold');
  await startBot();
  await sleep(9000);
  await shot('07-hold');
  console.log('hold', await info());
  await ev(() => { window.__unsung.game.hold.progress = 0.56; });
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'corinFalls', 15000, 'corin');
  await stopBot();
  await sleep(1300);
  await shot('08-corin-a');
  await sleep(1500);
  await shot('09-corin-draw');
  await sleep(2600);
  await shot('10-corin-hit');
  await waitFor(() => window.__unsung.game.ui.dialogueOpen, 20000, 'corin dialogue');
  await ev(() => { window.__unsung.game.autoAdvance = false; });
  await sleep(1500);
  await shot('11-corin-dialogue');
  await ev(() => { window.__unsung.game.autoAdvance = true; });
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'hold2', 25000, 'hold2');
  await startBot();
  await sleep(3000);
  await ev(() => { window.__unsung.game.hold.progress = 1; });
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'vessa', 15000, 'vessa');
  await stopBot();
  await waitFor(() => window.__unsung.game.vessa && window.__unsung.game.player.controlEnabled, 20000, 'vessa fight');
  await startBot();
  await sleep(6000);
  await shot('12-vessa');
  console.log('vessa', await info(), await ev(() => window.__unsung.game.vessa.hp));
  await ev(() => { const v = window.__unsung.game.vessa; v.hp = Math.min(v.hp, Math.floor(v.maxHp * 0.62)); });
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'eyeWound', 15000, 'eye');
  await stopBot();
  await sleep(1150);
  await shot('13-eye-slash');
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'vessa2', 20000, 'vessa2');
  await waitFor(() => window.__unsung.game.player.controlEnabled, 10000, 'vessa2 ctl');
  await startBot();
  await sleep(5000);
  await shot('14-blind-fight');
  console.log('vessa2', await info(), await ev(() => window.__unsung.game.vessa.hp));
  await ev(() => { window.__unsung.game.vessa.hp = 1; });
  await waitFor(() => window.__unsung.game.vessa && window.__unsung.game.vessa.downed, 20000, 'downed');
  await stopBot();
  await sleep(1500);
  await shot('15-ending-blow-prompt');
  await waitFor(() => window.__unsung.stages[window.__unsung.game.stageIndex] === 'dawn', 30000, 'dawn');
  await sleep(4500);
  await shot('16-dawn');
  await waitFor(() => document.getElementById('end').classList.contains('show'), 40000, 'end');
  await sleep(800);
  await ev(() => document.getElementById('end').classList.remove('show'));
  await ev(() => document.getElementById('chronicle').classList.add('show'));
  await sleep(1200);
  await shot('17-report');
  await ev(() => document.getElementById('end').classList.add('show'));
  await sleep(600);
  await shot('18-end');
} catch (e) {
  if (e !== 'done') { console.log('TEST ERROR', e && e.stack ? e.stack : e); await shot('zz-error').catch(() => {}); }
}
console.log('--- console errors/warnings (' + errors.length + ') ---');
for (const e of errors.slice(0, 40)) console.log(e);
await browser.close();
server.close();
