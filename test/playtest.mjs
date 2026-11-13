// Headless playtest: a simple bot plays every stage and saves screenshots to test/shots/.
//   npm run build && npm test            (CHROME=/path/to/chrome if it is not at the default)
//   node test/playtest.mjs phone         (390x800 touch layout)
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), shots = join(root, 'test/shots');
const phone = process.argv[2] === 'phone', ORDER = ['door', 'road', 'intro', 'spar', 'raid', 'fallback', 'hold', 'vessa', 'dawn'], only = process.env.FROM ? ORDER.indexOf(process.env.FROM) : 0, at = (n) => only <= ORDER.indexOf(n); // FROM=raid starts at that stage
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (q, s) => {
  try { const f = join(dist, q.url === '/' ? 'index.html' : q.url.split('?')[0]), d = await readFile(f); s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(d); }
  catch { s.writeHead(404); s.end(); }
}).listen(0);
const port = server.address().port;
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await (await browser.newContext({ viewport: phone ? { width: 390, height: 800 } : { width: 960, height: 560 }, hasTouch: phone })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(800);
const shot = (n) => page.screenshot({ timeout: 120000, path: join(shots, (phone ? 'phone-' : '') + n + '.png') });
await shot('00-title');

// Simulate `sec` seconds. The bot locks the nearest foe, closes in and swings; `god` keeps it alive.
const play = (sec, o = {}) => page.evaluate(async ({ sec, o }) => {
  const p = G.player; let f = 0;
  for (let i = 0; i < sec * 60; i++) {
    if (o.bot && p.controlEnabled) {
      const foes = G.targets().filter((e) => !e.dead && e.root.visible && (!o.home || Math.hypot(e.pos.x - o.home[0], e.pos.z - o.home[1]) < 8)); let e = null, bd = 1e9;
      for (const x of foes) { const d = p.dist(x); if (d < bd) { bd = d; e = x; } }
      if (e && bd > 20) { p.lock = null; G.cam.yaw = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z) + Math.PI; G.cam.manualT = 1e9; G.keys.KeyW = true; } // too far to lock: run at it
      else if (e) { p.lock = e; G.keys.KeyW = bd > 2.3; if (bd < 2.9 && f++ % 14 === 0) G.press(o.heavy && f % 3 === 0 ? 'h' : 'l'); } else { G.keys.KeyW = false; }
      if (o.home && !e && Math.hypot(p.pos.x - o.home[0], p.pos.z - o.home[1]) > 2) o.to = o.home; else if (o.home) o.to = null;
      if (o.to) { p.lock = null; const a = Math.atan2(o.to[0] - p.pos.x, o.to[1] - p.pos.z); G.cam.yaw = a + Math.PI; G.cam.manualT = 1e9; G.keys.KeyW = true; }
    }
    if (o.god) p.hp = 100;
    G.step(1 / 60, true);
    for (let k = 0; k < 24; k++) await null; // let the stage script's awaits run
    if (o.until && eval(o.until)) break;
  }
  G.keys.KeyW = false;
  return { stage: G.STAGES[G.stage].name, hp: p.hp | 0, enemies: G.enemies.filter((e) => !e.dead).length, state: p.state, hold: G.hold && +G.hold.progress.toFixed(2), boss: G.boss && (G.boss.hp | 0), pos: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)], foes: G.enemies.map((e) => [e.kind, e.state, e.pos.x.toFixed(1), e.pos.z.toFixed(1)]).slice(0, 4) };
}, { sec, o });
const log = (label, r) => console.log(label.padEnd(18), JSON.stringify(r));

await page.evaluate((from) => { G.auto = true; if (from) { document.getElementById('title').style.display = 'none'; document.getElementById('hud').style.visibility = 'visible'; G.running = true; G.runFrom(from); } else G.begin(); }, only);
if (!only) {
  log('door opens', await play(4, {})); await shot('00a-door');
  log('usurper', await play(60, { bot: true, god: true, until: "G.boss&&G.boss.hp<=70" })); await shot('00b-usurper');
  await page.evaluate(() => { G.auto = false; }); // real timing for the sealing, so the shots catch it
  log('sealing', await play(60, { bot: true, god: true, until: "G.level.flare>0" })); await play(0.25); await shot('00c-sealing');
  await play(3.2); await shot('00d-sealed'); await page.evaluate(() => { G.auto = true; });
  log('road', await play(8, { until: "G.STAGES[G.stage].name==='spar'" }));
}
if (at('spar')) {
  log('intro', await play(6)); await shot('01-spar-start');
  log('lock+strike', await play(14, { bot: true, until: "G.corin.mode==='attack'" })); await shot('02-spar-strike');
  for (const kind of ['playerBlocked', 'playerBlocked', 'riposte', 'bash', 'flank']) { await play(1.5); await page.evaluate((k) => G.emit('spar', { kind: k }), kind); }
  log('lessons', await play(6, { until: "G.STAGES[G.stage].name==='raid'" }));
}
if (at('raid')) {
  log('raid wave 1', await play(5, { bot: true, god: true })); await shot('03-raid');
  log('raid', await play(90, { bot: true, god: true, heavy: true, until: "G.STAGES[G.stage].name==='fallback'" })); await shot('04-raid-done');
}
if (at('fallback')) { log('fallback', await play(20, { bot: true, god: true, to: [0, -7.6], until: "G.STAGES[G.stage].name==='hold'" })); await shot('05-mouth'); }
if (at('hold')) {
  log('hold 20s', await play(20, { bot: true, god: true, heavy: true, home: [0, -7] })); await shot('06-hold');
  log('hold', await play(120, { bot: true, god: true, heavy: true, home: [0, -7], until: "G.STAGES[G.stage].name==='vessa'" }));
}
if (at('vessa')) {
  log('vessa enters', await play(4, {})); await shot('07-vessa');
  log('vessa 10s', await play(10, { bot: true, god: true })); await shot('08-vessa-fight');
  log('vessa', await play(240, { bot: true, god: true, heavy: true, until: "G.boss&&G.boss.hp<=1" }));
  await page.evaluate(() => { G.auto = false; }); await play(3.6); await shot('08b-vessa-beaten'); await page.evaluate(() => { G.auto = true; });
  log('vessa leaves', await play(20, { until: "G.STAGES[G.stage].name==='dawn'" }));
}
await page.evaluate(() => { G.auto = false; });
log('dawn', await play(9.5, {})); await shot('09-dawn');
await page.evaluate(() => { G.auto = true; });
log('end', await play(6, {})); await shot('10-report');
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
