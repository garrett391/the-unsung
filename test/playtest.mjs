// Headless playtest: a simple bot plays every stage and saves screenshots to test/shots/.
//   npm run build && npm test            (CHROME=/path/to/chrome if it is not at the default)
//   node test/playtest.mjs phone         (390x800 touch layout)
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), shots = join(root, 'test/shots');
const phone = process.argv[2] === 'phone', ORDER = ['forecourt', 'halls', 'door', 'ascent', 'road', 'waystation', 'muster', 'patrol', 'beacon', 'picket', 'caravan', 'intro', 'spar', 'raid', 'fallback', 'hold', 'vessa', 'dawn'], only = process.env.FROM ? ORDER.indexOf(process.env.FROM) : 0, at = (n) => only <= ORDER.indexOf(n); // FROM=raid starts at that stage
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
page.on('pageerror', (e) => { errors.push(e.stack || e.message); console.log('PAGE ERROR', (e.stack || e.message).slice(0, 600)); });
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(800);
if (process.env.MODEL) await page.evaluate(() => G.setModel(true)); // MODEL=1: the captain wears the authored knight model (actors/model.js)
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
      if (o.roll && e && f % 45 === 30) { G.keys.KeyW = true; G.press('d'); } // with a direction held: a roll, not a step back (only a roll passes the waystation's lesson)
      if (o.home && !e && Math.hypot(p.pos.x - o.home[0], p.pos.z - o.home[1]) > 2) o.to = o.home; else if (o.home) o.to = null;
      if (o.to) { p.lock = null; const a = Math.atan2(o.to[0] - p.pos.x, o.to[1] - p.pos.z); G.cam.yaw = a + Math.PI; G.cam.manualT = 1e9; G.keys.KeyW = true; }
    }
    if (o.god) p.hp = 100;
    if (o.tap) G.confirm = true; // click through dialogue and cards at their real pace
    G.step(1 / 60, true);
    for (let k = 0; k < 24; k++) await null; // let the stage script's awaits run
    if (o.until && eval(o.until)) break;
  }
  G.keys.KeyW = false;
  return { stage: G.STAGES[G.stage].name, hp: p.hp | 0, enemies: G.enemies.filter((e) => !e.dead).length, state: p.state, hold: G.hold && +G.hold.progress.toFixed(2), boss: G.boss && (G.boss.hp | 0), pos: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)], foes: G.enemies.map((e) => [e.kind, e.state, e.pos.x.toFixed(1), e.pos.z.toFixed(1)]).slice(0, 4) };
}, { sec, o });
const stageIs = (n) => `G.STAGES[G.stage].name==='${n}'`;
const log = (label, r) => console.log(label.padEnd(18), JSON.stringify(r));

await page.evaluate(([from, real]) => { G.manual = true; /* the game's own frame loop stops stepping: only play() advances it, so nothing happens during a screenshot */ G.auto = !real; if (from) { document.getElementById('title').style.display = 'none'; document.getElementById('hud').style.visibility = 'visible'; G.running = true; G.player.setVisible(true); G.runFrom(from); } else G.begin(); }, [only, ['halls', 'waystation', 'muster', 'patrol', 'beacon', 'picket', 'caravan'].includes(ORDER[only])]);
if (!only) {
  await play(0.3); await page.evaluate(() => { G.auto = false; }); // past the opening cards, then real timing through the prologue so the shots catch it
  await play(3.4); await page.waitForTimeout(2500); await shot('0000a-forecourt'); /* the fade is a CSS transition, on the real clock */ await play(30, { until: "G.player.controlEnabled" }); await play(0.3); await shot('0000b-forecourt');
  log('sentry', await play(60, { bot: true, god: true, until: "G.taughtStrike" })); await shot('0000c-lesson');
  log('from the doors', await play(60, { bot: true, god: true, until: "G.cinematic" })); await play(2.2); await shot('0000d-doors');
  log('court cleared', await play(120, { bot: true, god: true, until: "document.getElementById('obj').textContent.startsWith('Go in')" })); await shot('0000e-cleared');
  log('in', await play(40, { bot: true, god: true, to: [-150, 44.6], until: stageIs('halls') }));
}
if (at('halls')) {
  await play(3.2); await page.waitForTimeout(2500); await shot('000a-gallery'); /* the fade is a CSS transition, on the real clock */ await play(30, { until: "G.enemies[0].clip" }); await play(1.1); await shot('000a2-finishing'); await play(30, { until: "G.player.controlEnabled" }); await play(0.3); await shot('000b-gallery');
  log('first guard', await play(60, { bot: true, god: true, until: "G.taughtDoor" })); await shot('000c-lesson');
  log('the knight', await play(90, { bot: true, god: true, until: "G.cinematic" })); await play(3.2); await shot('000d-knight');
  await play(60, { tap: true, until: "G.enemies.length>4" }); await play(0.6); await shot('000e-knight-close');
  log('they come', await play(60, { tap: true, until: "G.player.controlEnabled" })); await play(1.2); await page.waitForTimeout(1000); await shot('000f-they-come'); // (the wait lets the thought's CSS fade finish)
  log('rotunda', await play(180, { bot: true, god: true, heavy: true, until: "G.player.pos.z<-34" })); await play(2.2); await shot('000g-rotunda'); await play(8, { bot: true, god: true, heavy: true }); await shot('000h-rotunda-fight');
  log('waves', await play(300, { bot: true, god: true, heavy: true, until: "document.getElementById('obj').textContent.startsWith('Go down')" }));
  log('the stair', await play(30, { bot: true, god: true, to: [-110, -48.5], until: "G.boss" })); await play(1.5, { bot: true, god: true }); await shot('000i-warden');
  log('cleared', await play(300, { bot: true, god: true, heavy: true, until: "!G.enemies.some(e=>!e.dead)" }));
  log('down', await play(40, { bot: true, god: true, to: [-110, -56.3], until: stageIs('door') }));
}
if (at('door')) {
  await play(3.4); await shot('00a-door'); await play(30, { until: "G.extras[0].dead" }); await play(0.5); await shot('00a2-cut-down'); // the last of the many, on her knees before him, and cut down
  log('door opens', await play(30, { until: "G.player.controlEnabled" })); await play(0.3); await shot('00b-usurper');
  log('usurper', await play(6, { bot: true, god: true, until: "G.player.lock" })); await play(0.4); await shot('00b1-lesson'); // the lessons: the bot locks and strikes; he stands until it has
  log('unleashed', await play(20, { bot: true, god: true, until: "G.boss&&G.boss.state==='wind'" })); await play(0.9); await shot('00b2-swing');
  log('to his knees', await play(60, { bot: true, god: true, until: "G.boss&&G.boss.hp<=1" })); await play(2.2); await shot('00b3-kneels');
  await play(60, { until: "G.player.state==='cine'" }); await play(1.5); await shot('00b4-the-blow-raised');
  await play(60, { until: "G.enemies[0].state==='down'" }); await play(0.5); await shot('00b5-the-blow'); await play(2.6); await shot('00b6-done');
  await play(60, { until: "G.player.calm&&G.player.walk" }); await play(1.5); await shot('00b7-walks-away'); await play(0.45); await shot('00b7b-walks-away');
  await play(60, { until: "G.level.flare>0.15" }); await play(1.2); await shot('00b8a-looks-round'); await play(1.7); await shot('00b8b-looks-up'); await play(2.3); await shot('00b8c-the-glass-lights'); await play(3.2); await shot('00b9-rises');
  log('round two', await play(60, { until: "G.player.controlEnabled" })); await play(0.3); await page.waitForTimeout(1000); await shot('00b10-up-again');
  log('sealing', await play(240, { bot: true, god: true, home: [0, -25.5], until: "G.level.flare>0.9" })); // he only stays down on the ward before the Door, so the bot fights there await play(0.6); await shot('00c-sealing');
  await play(3.4); await shot('00d-sealed');
  await play(60, { tap: true, until: "G.level.site==='fore'" }); await play(3.2); await page.waitForTimeout(2000); await shot('00d2-the-court-runs-back'); // the war lifting off the court
  await play(30, { until: "G.level.after" }); await play(2.6); await page.waitForTimeout(2000); await shot('00d3-the-court-whole'); await page.evaluate(() => { G.auto = true; });
  log('sealed', await play(8, { until: stageIs('ascent') })); await page.evaluate(() => { G.auto = false; });
  await play(4); await page.waitForTimeout(4500); await shot('00e-after'); await play(30, { until: "G.player.controlEnabled" }); await play(0.3); await shot('00f-after-descent');
  await play(30, { bot: true, to: [-110, -20], until: "G.player.pos.z>-40" }); await shot('00g-after-rotunda');
  await play(30, { bot: true, to: [-110, -20], until: "G.cinematic" }); await play(1.6); await shot('00h-she-is-gone');
  await play(30, { until: "G.player.controlEnabled" }); await play(10, { bot: true, to: [-110, 0.5], until: "G.player.pos.z>-8" }); await shot('00i-after-gallery');
  log('out', await play(40, { bot: true, to: [-110, 0.5], until: "G.level.site==='fore'" }));
  await play(4); await page.waitForTimeout(4500); await shot('00j-the-court-after'); await play(30, { until: "G.player.controlEnabled" }); await play(0.3); await shot('00k-the-court-after');
  await play(20, { bot: true, to: [-150, 78], until: "G.player.pos.z>66" }); await shot('00l-to-the-gate'); await play(20, { bot: true, to: [-150, 78], until: "document.getElementById('dlg').style.display==='block'" }); await play(0.8); await shot('00l2-the-watch-speaks');
  log('the gate', await play(40, { bot: true, to: [-150, 78], until: stageIs('road') }));
  log('road', await play(30, { tap: true, until: stageIs('waystation') }));
}
if (process.env.TO === 'door') { console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors'); await browser.close(); server.close(); process.exit(errors.length ? 1 : 0); } // TO=door stops after the prologue
if (at('waystation')) { // real timing through the opening, so the shots catch it
  await play(4); await shot('0e-yard');
  await play(30, { until: "G.enemies.length" }); await play(1.7); await shot('0f-raiders');
  await play(30, { until: "G.extras[0].dead" }); await play(0.5); await shot('0g-guard-falls'); await play(0.7); await shot('0g2-he-starts-back');
  await play(30, { until: "G.talking" }); await play(0.3); await shot('0g3-sized-up'); // the one who killed the guard has walked up to him
  await play(30, { tap: true, until: "G.talking&&document.getElementById('dtxt').textContent.includes('goods')" }); await play(1.5); await shot('0g4-the-sword'); // and the camera goes down to what the guard dropped
  await play(30, { tap: true, until: "!G.talking&&G.enemies[0].vel.length()>3" }); await play(1.6); await shot('0h-he-sees');
  await play(30, { until: "G.player.walk" }); await play(2.2); await shot('0i-to-the-body');
  await play(30, { until: "G.player.look==='drifter'" }); await play(0.4); await shot('0j-takes-the-sword'); await play(2.2); await shot('0j2-stands');
  log('yard fight', await play(30, { until: "G.player.controlEnabled" })); await play(0.4); await shot('0k-fight');
  log('it comes back', await play(90, { bot: true, god: true, heavy: true, roll: true, until: "G.taughtWay" })); await play(0.3); await page.waitForTimeout(1200); await shot('0k2-it-comes-back');
  log('wave 2', await play(90, { bot: true, god: true, until: "G.enemies.some(e=>e.kind==='runner')" })); await play(2.0); await shot('0l-wave-2');
  log('wave 3', await play(120, { bot: true, god: true, heavy: true, until: "G.enemies.some(e=>e.kind==='chief')" })); await play(2.0); await shot('0m-leader'); await play(6, { bot: true, god: true }); await shot('0m2-leader-fight');
  log('column', await play(180, { bot: true, god: true, heavy: true, until: "G.extras.length>2" })); await play(4.5); await shot('0n-column');
  await play(30, { until: "G.talking" }); await play(1); await shot('0o-officer');
  await play(30, { tap: true, until: "G.talking&&G.extras[1].root.visible" }); await play(1.5); await shot('0o2-drover');
  await play(30, { tap: true, until: "G.extras.some(e=>e.watch===G.player&&Math.hypot(e.pos.x-G.player.pos.x,e.pos.z-G.player.pos.z)<1.8)" }); await play(1.2); await shot('0o3-held'); // the soldiers close in on him
  log('to muster', await play(60, { tap: true, until: stageIs('muster') }));
}
if (at('muster')) {
  await play(3.2); await shot('0p-muster');
  log('bout', await play(40, { tap: true, until: "G.player.controlEnabled" })); await play(0.5); await shot('0q-bout');
  await play(6, { bot: true, god: true }); await shot('0q2-bout');
  log('round two', await play(180, { bot: true, god: true, heavy: true, tap: true, until: "G.enemies.some(e=>e.kind==='sergeant')&&G.player.controlEnabled&&!G.talking" })); await play(1.0); await shot('0q3-sergeant'); // the soldier yields, and the sergeant takes the ring
  log('rush', await play(40, { bot: true, god: true, until: "G.enemies[0].mv.rush&&G.enemies[0].state==='strike'" })); await shot('0q4-rush');
  log('round three', await play(240, { bot: true, god: true, heavy: true, tap: true, until: "G.enemies.filter(e=>e.kind==='trooper').length===2&&G.player.controlEnabled&&!G.talking" })); await play(1.0); await shot('0q5-three'); // he calls two of the line into the ring
  log('yields', await play(300, { bot: true, god: true, heavy: true, until: "G.cinematic" })); await play(2.0); await shot('0r-yields');
  await play(30, { tap: true, until: "G.talking&&document.getElementById('dtxt').textContent.includes('Then he is')" }); await play(1.5); await shot('0r2-officer'); // the officer answers the sergeant
  await play(30, { tap: true, until: "G.player.walk" }); await play(40, { until: "G.talking" }); await play(1.2); await shot('0s-clerk');
  log('to act one', await play(60, { tap: true, until: stageIs('patrol') }));
}
// The frontier is open country: the bot walks it by a line of points (it only ever heads straight for one).
const walk = async (pts, until) => { let r; for (const [x, z] of pts) { r = await play(25, { bot: true, god: true, to: [260 + x, -160 + z], until: `(${until})||Math.hypot(G.player.pos.x-(${260 + x}),G.player.pos.z-(${-160 + z}))<1.6` }); if (await page.evaluate(until)) break; } return r; };
const clear = "!G.enemies.some(e=>!e.dead)", foes = "G.enemies.some(e=>!e.dead)";
if (at('patrol')) {
  log('picket', await play(60, { tap: true, until: "G.talking" })); await play(1.2); await page.waitForTimeout(2500); await shot('0t-picket');
  await play(30, { tap: true, until: "G.talking&&document.getElementById('dtxt').textContent.includes('grow old')" }); await play(1.5); await page.waitForTimeout(2500); await shot('0t1-asks'); // he asks what has been going on out here
  await play(60, { tap: true, until: "G.player.controlEnabled" }); await play(0.5); await shot('0t2-sets-out');
  log('the rise', await walk([[3, -30], [8, -17]], foes)); await play(1.5); await shot('0u-out-of-the-sand');
  await play(20, { until: "G.player.controlEnabled" }); await play(6, { bot: true, god: true }); await shot('0u2-on-the-rise');
  log('wave 1', await play(180, { bot: true, god: true, heavy: true, until: clear })); await play(1.5); await page.waitForTimeout(600); await shot('0u3-cleared');
  log('riverbed', await walk([[8, -17], [5, -8], [-2, -2], [-9, 4], [-13, 9], [-15, 12]], foes)); await play(1.5); await shot('0v-riverbed');
  await play(20, { until: "G.player.controlEnabled" }); await play(6, { bot: true, god: true }); await shot('0v2-ambush');
  log('wave 2', await play(240, { bot: true, god: true, heavy: true, until: clear })); await play(1.5);
  log('to the basin', await walk([[-9, 4], [-15, 12], [-16, 20], [-12, 27], [-4, 32], [0, 35]], stageIs('beacon')));
}
if (at('beacon')) {
  await play(2.2); await shot('0w-under-the-rock'); await play(20, { until: "G.player.controlEnabled" }); await play(0.4); await shot('0w2-basin');
  log('to the patrol', await play(240, { bot: true, god: true, heavy: true, until: "G.cinematic" })); await play(40, { until: "G.talking" }); await play(1.0); await shot('0x-corporal');
  await play(60, { tap: true, until: "G.hold" }); await play(0.5); await shot('0x2-hold');
  log('hold 25s', await play(25, { bot: true, god: true, heavy: true, home: [278.4, -117.2] })); await shot('0x3-hold');
  log('hold', await play(240, { bot: true, god: true, heavy: true, home: [278.4, -117.2], until: "!G.hold" })); await shot('0x4-dusk');
  await play(30, { until: "G.cinematic" }); await play(3.0); await shot('0y-lit'); await play(30, { until: "G.talking" }); await play(1.0); await shot('0y2-after');
  log('to the picket', await play(60, { tap: true, until: stageIs('picket') }));
}
if (at('picket')) { // the night at the well and the morning after: no fighting, he walks up to the corporal, then to the boy
  await play(30, { until: "G.player.controlEnabled" }); await play(0.5); await shot('0z-picket-night');
  log('to the corporal', await walk([[2.8, -34], [2.85, -41]], "G.cinematic")); await play(40, { until: "G.talking" }); await play(1.0); await shot('0z2-corporal');
  await play(20, { tap: true, until: "/fourteen/.test(document.getElementById('dtxt').textContent)" }); await play(0.6); await shot('0z3-the-boy'); await play(8, { tap: true, until: "/never met/.test(document.getElementById('dtxt').textContent)" }); await play(0.6); await shot('0z3b-asked');
  await play(60, { tap: true, until: "G.extras.length<6&&G.talking" }); await play(0.8); await shot('0z3c-sergeant'); await play(90, { tap: true, until: "G.level.site==='front'&&G.player.controlEnabled&&!G.cinematic&&G.extras.length<6" }); await play(0.5); await shot('0z4-morning');
  log('to the boy', await walk([[2.6, -33], [3, -28], [6, -20], [9, -12]], "G.cinematic")); await play(40, { until: "G.talking" }); await play(1.0); await shot('0z5-squire'); // he is out on the rise: the bot walks out past the stakes to him
  await play(30, { tap: true, until: "/one I've got/.test(document.getElementById('dtxt').textContent)" }); await play(0.8); await shot('0z6-a-name');
  log('to the caravan', await play(60, { tap: true, until: stageIs('caravan') }));
}
// The wash (excursion 1): open country again, at its own place.
const walkW = async (pts, until) => { let r; for (const [x, z] of pts) { r = await play(25, { bot: true, god: true, to: [-330 + x, -120 + z], until: `(${until})||Math.hypot(G.player.pos.x-(${-330 + x}),G.player.pos.z-(${-120 + z}))<1.6` }); if (await page.evaluate(until)) break; } return r; };
const dtxt = (re) => `${re}.test(document.getElementById('dtxt').textContent)`, obj = (re) => `${re}.test(document.getElementById('obj').textContent)`;
if (at('caravan')) { // the stripe at the picket, the old road, the stopped caravan and the drover under it; then the ambush in the narrows on the way back
  await play(60, { tap: true, until: "G.talking" }); await play(1.0); await page.waitForTimeout(2500); await shot('1a-picket');
  await play(30, { tap: true, until: dtxt('/It was his/') }); await play(1.0); await shot('1b-the-stripe');
  await play(30, { tap: true, until: dtxt("/brother's/") }); await play(1.0); await shot('1c-corin');
  await play(30, { tap: true, until: dtxt('/getting used/') }); await play(1.0); await shot('1c2-corporal');
  log('the old road', await play(90, { tap: true, until: "G.level.site==='wash'" })); await play(2.6); await page.waitForTimeout(1500); await shot('1d-the-old-road');
  await play(20, { until: "G.player.controlEnabled" }); await play(0.5); await shot('1e-sets-out');
  log('the wash', await walkW([[0.5, -52], [0.3, -40], [-2.5, -26], [-1.2, -14], [3.5, -4], [6.5, 3]], "G.cinematic")); await play(20, { until: "G.cinematic" }); await play(1.6); await shot('1f-the-caravan');
  await play(20, { until: "G.player.controlEnabled" }); await play(0.5); await shot('1f2-the-caravan');
  for (const [k, pts] of [[1, [[8.6, 7.5], [8.3, 10.4]]], [2, [[8.9, 13.4]]], [3, [[5.6, 18.6], [2.6, 21.5], [3.0, 27]]]]) { await walkW(pts, obj(`/${k}\\/3/`)); log(`found ${k}`, await play(20, { until: obj(`/\\(${k}\\/3/`) })); if (k === 2) { await play(2.2); await shot('1g-casks'); } }
  log('under the wagon', await walkW([[3.0, 27], [2.6, 21.5], [6.4, 19.2], [9.9, 15.0]], "G.cinematic")); await play(40, { until: "G.talking" }); await play(0.8); await shot('1h-under-the-wagon');
  await play(30, { tap: true, until: dtxt('/yard hand/') }); await play(0.8); await shot('1h2-yard-hand'); await play(10, { tap: true, until: dtxt('/^I was/') }); await play(0.8); await shot('1h2b-i-was');
  await play(30, { tap: true, until: dtxt('/never said a word/') }); await play(0.8); await shot('1h3-never-a-word');
  log('raiders', await play(60, { tap: true, until: "G.enemies.length>0&&G.cinematic" })); await play(1.6); await shot('1i-raiders'); // they were waiting at the caravan
  await play(20, { until: "G.player.controlEnabled" }); await play(6, { bot: true, god: true }); await shot('1i2-raiders-fight');
  log('they break', await play(300, { bot: true, god: true, heavy: true, until: "G.enemies.some(e=>e.state==='flee')||/back to the picket/.test(document.getElementById('obj').textContent)" })); await play(3.5); await shot('1j-they-break'); // and go back under the sand
  log('the way back', await play(60, { tap: true, until: obj('/back to the picket/') })); await play(1.0); await shot('1j2-the-way-back');
  if (await page.evaluate(() => G.player.pos.z > -120 + 18)) await walkW([[1.4, 23], [3.0, 17.5]], 'false'); // (the fight may end up the wash, behind the overturned wagon: the bot does not steer round things)
  await walkW([[3.4, 12.5], [8.6, 7.5]], 'G.enemies.length>0');
  for (let k = 0; k < 160 && !(await page.evaluate("G.enemies.length>0")); k++) { const p = await page.evaluate(() => [G.extras[0].pos.x, G.extras[0].pos.z]); await play(0.6, { bot: true, god: true, to: p, until: `G.enemies.length>0||Math.hypot(G.player.pos.x-(${p[0]}),G.player.pos.z-(${p[1]}))<3` }); await play(0.4, { until: "G.enemies.length>0" }); }
  await play(20, { until: "G.cinematic" }); await play(2.2); await shot('1k-the-veiled'); // in the narrows: they get up and stand there
  await play(20, { until: "G.player.controlEnabled" }); await play(6, { bot: true, god: true }); await shot('1l-fight');
  log('getting up', await play(200, { bot: true, god: true, heavy: true, until: "G.enemies.some(e=>e.state==='rising')" })); await play(0.9, { bot: true, god: true }); await shot('1m-getting-up');
  log('narrows won', await play(400, { bot: true, god: true, heavy: true, until: obj('/back to the picket/') })); await play(1.0); await shot('1n-on-again');
  for (let k = 0; k < 200 && !(await page.evaluate("G.cinematic")); k++) { const p = await page.evaluate(() => [G.extras[0].pos.x, G.extras[0].pos.z]); await play(0.6, { bot: true, god: true, to: p, until: `G.cinematic||Math.hypot(G.player.pos.x-(${p[0]}),G.player.pos.z-(${p[1]}))<3` }); await play(0.4, { until: "G.cinematic" }); }
  await play(2.0); await shot('1n2-last-wave'); // out on the plain: both kinds, all round
  await play(20, { until: "G.player.controlEnabled" }); await play(8, { bot: true, god: true }); await shot('1n3-last-fight');
  log('cleared', await play(500, { bot: true, god: true, heavy: true, until: "G.talking" })); await play(1.0); await shot('1o-after');
  await play(30, { tap: true, until: dtxt('/not hurt/') }); await play(0.8); await shot('1p-not-hurt');
  log('to the camp', await play(60, { tap: true, until: stageIs('intro') }));
  await page.evaluate(() => { G.auto = true; });
}
if (process.env.TO === 'caravan') { console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors'); await browser.close(); server.close(); process.exit(errors.length ? 1 : 0); } // TO=caravan stops after the excursion
if (process.env.TO === 'beacon') { console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors'); await browser.close(); server.close(); process.exit(errors.length ? 1 : 0); } // TO=beacon stops after the frontier
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
