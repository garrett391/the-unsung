import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from '../core/game.js';

// Grade: cool shadows and warm highlights, a little more contrast and colour, a vignette,
// a red pulse at the frame edge when the captain is cut (uHurt), and fine noise that
// breaks up banding in the night sky and fog.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.85 }, uWarm: { value: 0 }, uHurt: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uVig,uWarm,uHurt,uTime;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);float l=dot(c.rgb,vec3(.299,.587,.114));
      vec3 cool=vec3(.90,.97,1.10),warm=vec3(1.10,1.0,.88);
      c.rgb*=mix(mix(cool,vec3(1.),uWarm),warm,smoothstep(.15,.9,l));
      c.rgb=mix(vec3(l),c.rgb,1.12);c.rgb*=mix(.9,1.08,smoothstep(0.,.5,l));
      vec2 d=vUv-.5;float e=dot(d,d)*2.2;c.rgb*=1.-uVig*smoothstep(.25,.95,e);
      c.rgb=mix(c.rgb,vec3(.34,.02,.025)*(.35+l),uHurt*.7*smoothstep(.1,.8,e));
      float n=fract(sin(dot(gl_FragCoord.xy+uTime*61.,vec2(12.9898,78.233)))*43758.5453)-.5;
      c.rgb=max(c.rgb+n*(.0012+.014*c.rgb),0.);
      gl_FragColor=c;}`,
};

// Shadow maps crash some phones' graphics drivers. On the Pixel 10 (PowerVR D-Series, Nov 2026: the owner's brother) the
// driver loses the WebGL context within the first frames once many draws a frame sample a shadow map; Chrome then paints the
// dead canvas white while the page and its music go on, and after a few losses refuses WebGL to the site until it is
// restarted. Other three.js projects saw the same on that phone, and shadows off was what stopped it. So: no shadow maps on a
// PowerVR GPU, nor on a device that has lost its context with them on in the last month (remembered under NOSHADOW, keyed to
// the GPU's name). Figures keep their painted shadows (Char.shadow). `?shadows=0` or `?shadows=1` in the address overrides.
const NOSHADOW = 'the-unsung.noshadow', MONTH = 30 * 864e5;
function gpuName(gl) {
  try { const x = gl.getExtension('WEBGL_debug_renderer_info'); return [gl.getParameter(gl.RENDERER), x && gl.getParameter(x.UNMASKED_VENDOR_WEBGL), x && gl.getParameter(x.UNMASKED_RENDERER_WEBGL)].filter(Boolean).join(' / '); } catch (_) { return ''; }
}
function shadowsWanted(gpu) {
  const q = new URLSearchParams(location.search).get('shadows'); if (q === '0' || q === '1') return q === '1';
  if (/PowerVR|Imagination/i.test(gpu)) return false;
  try { const r = JSON.parse(localStorage.getItem(NOSHADOW) || 'null'); if (r && r.gpu === gpu && Date.now() - r.at < MONTH) return false; } catch (_) { /* storage blocked */ }
  return true;
}
// A notice over the canvas when the graphics are gone (#gpu in index.html), instead of a white screen or a title stuck on LOADING.
function notice(on, head, text) {
  const n = document.getElementById('gpu'); if (!n) return;
  if (on) { n.querySelector('h2').textContent = head; n.querySelector('p').textContent = text; }
  n.style.display = on ? 'flex' : 'none';
}
const AGAIN = 'If the screen stays blank, wait half a minute and reload again. If it still won’t start, close the browser completely and open it again.';

export function initRenderer(canvas) {
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) {
    notice(true, 'NO 3D GRAPHICS', 'The browser wouldn’t start the game’s 3D graphics. If the game crashed a moment ago, the browser may be holding them back for a while: wait half a minute and reload. If it still won’t start, close the browser completely and open it again.');
    throw e;
  }
  const gpu = gpuName(renderer.getContext());
  renderer.shadowMap.enabled = shadowsWanted(gpu); renderer.shadowMap.type = T.PCFSoftShadowMap;
  // Lost: pause, hide the canvas (Chrome paints a lost one white), say so, and remember to start this device without shadows.
  // three.js keeps the context restorable (it calls preventDefault); if the browser gives it back, carry on without shadows.
  // (A context dropped while the page was hidden, as a phone may do to a tab in the background, is not the shadows' doing.)
  let drop = false;
  canvas.addEventListener('webglcontextlost', () => {
    const had = renderer.shadowMap.enabled; drop = had && document.visibilityState === 'visible';
    if (drop) try { localStorage.setItem(NOSHADOW, JSON.stringify({ gpu, at: Date.now() })); } catch (_) { /* storage blocked */ }
    if (G.pause) G.pause(true);
    canvas.style.visibility = 'hidden';
    notice(true, 'THE GRAPHICS STOPPED', (drop ? 'This device’s graphics driver dropped the game. Shadows are now off on this device, which usually stops it.' : 'This device’s graphics driver dropped the game.') + ' Reload to carry on from your last checkpoint. ' + AGAIN);
  });
  canvas.addEventListener('webglcontextrestored', () => { if (drop) renderer.shadowMap.enabled = false; canvas.style.visibility = ''; notice(false); }); // (after three.js's own handler, which rebuilds its state)
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(54, 1, 0.1, 900);
  // The scene is drawn into the composer's own target, which is not antialiased unless asked:
  // without samples every thin edge (door leading, gilt fillets, blade) crawls as the camera moves.
  const small = Math.min(innerWidth, innerHeight) < 500;
  const composer = new EffectComposer(renderer, new T.WebGLRenderTarget(innerWidth, innerHeight, { type: T.HalfFloatType, samples: small ? 2 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.42, 0.55, 0.9);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  composer.addPass(new OutputPass());
  function resize() {
    const W = innerWidth, H = innerHeight, pr = Math.min(devicePixelRatio || 1, W < 700 || H < 500 ? 1.5 : 1.75);
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false); composer.setPixelRatio(pr); composer.setSize(W, H);
    camera.aspect = W / H; camera.fov = W < H ? 66 : 54; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();
  Object.assign(G, { renderer, scene, camera, composer, grade, bloom, gpu });
  return { renderer, scene, camera, composer };
}
