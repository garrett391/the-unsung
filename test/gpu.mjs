// What happens on a graphics chip that can't take shadow maps, and when the graphics are lost or refused (gfx/renderer.js).
//   npm run build && node test/gpu.mjs   (writes test/shots/gpu-*.png; fails loudly if a check does not hold)
// Four runs: an ordinary GPU (shadows on); a PowerVR one, as on the Pixel 10, faked through WEBGL_debug_renderer_info (shadows
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
// Programs three.js has compiled that read a shadow map.
const samplers = () => { const gl = G.renderer.getContext(); return G.renderer.info.programs.filter((p) => gl.getAttachedShaders(p.program).some((s) => /#define USE_SHADOWMAP/.test(gl.getShaderSource(s)))).length; };
const notice = () => { const n = document.getElementById('gpu'); return n.style.display === 'flex' ? n.querySelector('h2').textContent : ''; };
const POWERVR = () => {
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const get = C.prototype.getParameter;
    C.prototype.getParameter = function (p) { return p === 0x9245 ? 'Imagination Technologies' : p === 0x9246 ? 'ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536, OpenGL ES 3.2)' : get.call(this, p); };
  }
};

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
{ // lost and restored, then a reload
  const page = await open(); await page.goto(url); await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__lose = G.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
  await page.waitForTimeout(500);
  let r = await page.evaluate(`({ notice: (${notice})(), hidden: document.getElementById('c').style.visibility, flag: localStorage.getItem('the-unsung.noshadow') })`);
  check(r.notice === 'THE GRAPHICS STOPPED' && r.hidden === 'hidden' && !!r.flag, `a lost context shows the notice, hides the canvas and remembers (${r.flag})`);
  await page.screenshot({ path: join(shots, 'gpu-3-lost.png') });
  await page.evaluate(() => window.__lose.restoreContext()); await page.waitForTimeout(1500);
  r = await page.evaluate(`({ notice: (${notice})(), on: G.renderer.shadowMap.enabled, n: (${samplers})(), lost: G.renderer.getContext().isContextLost() })`);
  check(!r.notice && !r.on && r.n === 0 && !r.lost, 'restored: notice gone, drawing again without shadows');
  await page.screenshot({ path: join(shots, 'gpu-4-restored.png') });
  await page.reload(); await page.waitForTimeout(2500);
  r = await page.evaluate(`({ on: G.renderer.shadowMap.enabled, n: (${samplers})() })`);
  check(!r.on && r.n === 0, 'after a reload the same GPU starts without shadows');
  await page.goto(url + '?shadows=1'); await page.waitForTimeout(2000);
  check(await page.evaluate('G.renderer.shadowMap.enabled'), '?shadows=1 overrides the remembered flag');
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
