// Graphics tiers (gfx/quality.js): what happens on a graphics chip that can't take shadow maps, when the graphics are lost
// or refused (gfx/renderer.js), when the player picks a tier, and when the frame rate is poor.
//   npm run build && node test/gpu.mjs   (writes test/shots/gpu-*.png; fails loudly if a check does not hold)
// Six runs: tiers picked while the game draws (shaders follow, the pick is kept); a slow device on AUTO (steps down, remembers);
// then: an ordinary GPU (shadows on); a PowerVR one, as on the Pixel 10, faked through WEBGL_debug_renderer_info (shadows
// off, no program samples a shadow map); the context lost and given back (a notice, the flag remembered, then the scene again
// without shadows, and a reload that starts without them); and a browser that refuses WebGL (a notice, not LOADING forever).
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), shots = join(root, 'test/shots');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (q, s) => { try { const u = q.url.split('?')[0], f = join(dist, u === '/' ? 'index.html' : u), b = await readFile(f); s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(b); } catch { s.writeHead(404); s.end(); } }).listen(0);
const url = `http://localhost:${server.address().port}/`;
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
let bad = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) bad++; };
async function open(init) {
  const ctx = await browser.newContext({ viewport: { width: +process.env.W || 390, height: +process.env.H || 780 } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); page.on('pageerror', (e) => console.log('  page error: ' + e.message));
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  return page;
}
// Shaders in use that read a shadow map: everything in view is drawn once (nothing culled), then each drawn material's current
// program is looked at, for materials that take light (the others carry the flag but have no shadow code). (three.js keeps a material's earlier programs by it after a change of tier; they are not run.)
const samplers = () => {
  const gl = G.renderer.getContext(), seen = new Set(), off = [];
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  G.scene.traverse((o) => { if (o.material && shown(o)) { if (o.frustumCulled) { o.frustumCulled = false; off.push(o); } for (const m of [].concat(o.material)) seen.add(m); } });
  G.composer.render(); for (const o of off) o.frustumCulled = true;
  let n = 0; window.__soft = 0; for (const m of seen) { const mp = G.renderer.properties.get(m), p = mp.needsLights && mp.currentProgram; if (p && gl.getAttachedShaders(p.program).some((s) => /#define USE_SHADOWMAP/.test(gl.getShaderSource(s)))) { n++; if (gl.getAttachedShaders(p.program).some((s) => /#define SHADOWMAP_TYPE_PCF_SOFT/.test(gl.getShaderSource(s)))) window.__soft++; } }
  return n;
};
const notice = () => { const n = document.getElementById('gpu'); return n.style.display === 'flex' ? n.querySelector('h2').textContent : ''; };
const POWERVR = () => {
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const get = C.prototype.getParameter;
    C.prototype.getParameter = function (p) { return p === 0x9245 ? 'Imagination Technologies' : p === 0x9246 ? 'ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536, OpenGL ES 3.2)' : get.call(this, p); };
  }
};

{ // tiers picked while the game is drawing
  const page = await open(); await page.goto(url); await page.waitForTimeout(2500);
  const state = `({ tier: G.gfx.tier, pick: G.gfx.pick, on: G.renderer.shadowMap.enabled, n: (${samplers})(), soft: G.renderer.shadowMap.type === 2, softN: window.__soft, msaa: G.composer.renderTarget1.samples, pr: G.renderer.getPixelRatio() })`;
  const want = { low: [false, false, 0], medium: [true, false, 2], high: [true, true, 2], ultra: [true, true, 4] };
  for (const t of ['low', 'ultra', 'medium', 'high', 'low', 'medium']) {
    await page.evaluate((t) => G.gfx.pickTier(t), t); await page.waitForTimeout(700);
    const r = await page.evaluate(state), [on, soft, msaa] = want[t];
    check(r.tier === t && r.on === on && (on ? r.n > 0 && r.soft === soft && r.softN === (soft ? r.n : 0) : r.n === 0) && r.msaa === msaa, `picked ${t}: ${JSON.stringify(r)}`);
    await page.screenshot({ path: join(shots, `gpu-tier-${t}.png`) });
  }
  // the pause menu's button: three presses from MEDIUM go round to AUTO, and only the last takes effect
  await page.evaluate(() => { for (let k = 0; k < 3; k++) document.getElementById('pgfx').click(); }); await page.waitForTimeout(900);
  let r = await page.evaluate(`({ pick: G.gfx.pick, label: document.getElementById('pgfx').textContent, note: document.getElementById('pgfxn').textContent })`);
  check(r.pick === 'auto' && r.label === 'GRAPHICS: AUTO' && /^Running at /.test(r.note), `the menu's button steps through to AUTO (${r.label}; ${r.note})`);
  await page.evaluate(() => { G.auto = true; G.begin(0); for (let k = 0; k < 40; k++) G.step(1 / 30, true); G.pause(true); document.querySelector('#pause details').open = true; }); await page.waitForTimeout(300); await page.screenshot({ path: join(shots, 'gpu-menu.png') });
  await page.evaluate(() => G.gfx.pickTier('medium')); await page.reload(); await page.waitForTimeout(2000);
  r = await page.evaluate(state); check(r.tier === 'medium' && r.pick === 'medium' && r.on && !r.soft, 'the pick is kept over a reload');
  await page.context().close();
}
{ // a slow device on AUTO
  const page = await open(); await page.goto(url); await page.waitForTimeout(2000);
  const t0 = await page.evaluate('G.gfx.tier');
  let r = await page.evaluate(() => { let n = 0; for (let k = 0; k < 2000 && !n; k++) if (G.gfx.watch(1 / 60)) n++; return n; });
  check(r === 0, 'sixty frames a second changes nothing');
  r = await page.evaluate(() => { let k = 0; while (k < 2000 && !G.gfx.watch(1 / 15)) k++; return { k, tier: G.gfx.tier, why: G.gfx.why, cap: localStorage.getItem('the-unsung.gfxcap') }; });
  check(r.tier !== t0 && r.why === 'slow' && !!r.cap, `fifteen frames a second steps AUTO down from ${t0} after ${(r.k / 15).toFixed(0)} s (${r.tier})`);
  await page.evaluate(() => G.gfx.pickTier('ultra')); r = await page.evaluate(() => { for (let k = 0; k < 2000; k++) if (G.gfx.watch(1 / 15)) return true; return false; });
  check(!r, 'a tier the player picked is left alone');
  await page.context().close();
}
{ // an ordinary GPU
  const page = await open(); await page.goto(url); await page.waitForTimeout(2500);
  const r = await page.evaluate(`({ gpu: G.gpu, on: G.renderer.shadowMap.enabled, n: (${samplers})() })`);
  console.log('  gpu: ' + r.gpu); check(r.on && r.n > 0, `ordinary GPU keeps shadows (${r.n} programs sample the map)`);
  await page.screenshot({ path: join(shots, 'gpu-0-ordinary.png') }); await page.context().close();
}
{ // PowerVR
  const page = await open(POWERVR); await page.goto(url); await page.waitForTimeout(2500);
  const r = await page.evaluate(`({ gpu: G.gpu, on: G.renderer.shadowMap.enabled, n: (${samplers})(), notice: (${notice})() })`);
  console.log('  gpu: ' + r.gpu); check(!r.on && r.n === 0 && !r.notice, 'PowerVR starts without shadows, and no program samples a shadow map');
  await page.screenshot({ path: join(shots, 'gpu-1-powervr-title.png') });
  // into the forecourt, past the cards, to see the place without shadows
  await page.evaluate(() => { G.auto = true; G.begin(0); });
  await page.evaluate(async () => { for (let k = 0; k < 900 && !G.player.controlEnabled; k++) { G.step(1 / 30, true); if (k % 30 === 0) await new Promise((r) => setTimeout(r, 0)); } G.auto = false; for (let k = 0; k < 20; k++) G.step(1 / 30, true); G.step(1 / 60); document.getElementById('fade').style.opacity = 0; for (const id of ['chron', 'title']) document.getElementById(id).style.display = 'none'; });
  await page.waitForTimeout(400);
  check(await page.evaluate(`(${samplers})() === 0`), 'still no shadow-sampling program in play');
  await page.screenshot({ path: join(shots, 'gpu-2-powervr-forecourt.png') }); await page.context().close();
}
{ // lost and restored, then a reload (with a tier picked beforehand: the loss must undo the pick, or it would crash every load)
  const page = await open(); await page.goto(url); await page.waitForTimeout(2500);
  await page.evaluate(() => G.gfx.pickTier('high')); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__lose = G.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  await page.waitForTimeout(500);
  let r = await page.evaluate(`({ notice: (${notice})(), hidden: document.getElementById('c').style.visibility, flag: localStorage.getItem('the-unsung.gfxcap') })`);
  check(r.notice === 'THE GRAPHICS STOPPED' && r.hidden === 'hidden' && !!r.flag, `a lost context shows the notice, hides the canvas and remembers (${r.flag})`);
  await page.screenshot({ path: join(shots, 'gpu-3-lost.png') });
  await page.evaluate(() => window.__lose.restoreContext()); await page.waitForTimeout(1500);
  r = await page.evaluate(`({ notice: (${notice})(), on: G.renderer.shadowMap.enabled, n: (${samplers})(), lost: G.renderer.getContext().isContextLost() })`);
  check(!r.notice && !r.on && r.n === 0 && !r.lost, 'restored: notice gone, drawing again without shadows');
  await page.screenshot({ path: join(shots, 'gpu-4-restored.png') });
  await page.reload(); await page.waitForTimeout(2500);
  r = await page.evaluate(`({ on: G.renderer.shadowMap.enabled, n: (${samplers})() })`);
  check(!r.on && r.n === 0, 'after a reload the same GPU starts without shadows');
  r = await page.evaluate('({ pick: G.gfx.pick, tier: G.gfx.tier, why: G.gfx.why })'); check(r.pick === 'auto' && r.tier === 'low' && r.why === 'lost', `the pick is back on AUTO, capped (${JSON.stringify(r)})`);
  await page.goto(url + '?gfx=high'); await page.waitForTimeout(2000);
  check(await page.evaluate('G.renderer.shadowMap.enabled'), '?gfx=high overrides the remembered cap');
  await page.context().close();
}
{ // WebGL refused
  const page = await open(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, o) { return /webgl/.test(k) ? null : get.call(this, k, o); }; });
  await page.goto(url); await page.waitForTimeout(2000);
  check((await page.evaluate(notice)) === 'NO 3D GRAPHICS', 'a refused context shows the notice');
  await page.screenshot({ path: join(shots, 'gpu-5-refused.png') }); await page.context().close();
}
await browser.close(); server.close();
if (bad) { console.log(bad + ' check(s) failed'); process.exit(1); }
