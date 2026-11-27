import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from '../core/game.js';
import { gfx, startGfx, applyGfx, capGfx } from './quality.js';

// Grade: cool shadows and warm highlights, a little more contrast and colour, a vignette,
// a red pulse at the frame edge when the captain is cut (uHurt), and fine noise that
// breaks up banding in the night sky and fog.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.85 }, uWarm: { value: 0 }, uHurt: { value: 0 }, uTime: { value: 0 }, uFocus: { value: 0 }, uBlur: { value: 0.011 }, uAsp: { value: 1 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uVig,uWarm,uHurt,uTime,uFocus,uBlur,uAsp;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);
      // A tip that stops the fight to be read (uFocus, ui.tip): the picture goes soft, here, in the pass that is drawn anyway.
      if(uFocus>.004&&uBlur>0.){vec3 a=c.rgb;for(int i=1;i<24;i++){float f=float(i),r=sqrt(f/24.)*uBlur*uFocus*min(1.,uAsp),t=f*2.39996;
        a+=texture2D(tDiffuse,vUv+r*vec2(cos(t)/uAsp,sin(t))).rgb;}c.rgb=a/24.;}
      float l=dot(c.rgb,vec3(.299,.587,.114));
      vec3 cool=vec3(.90,.97,1.10),warm=vec3(1.10,1.0,.88);
      c.rgb*=mix(mix(cool,vec3(1.),uWarm),warm,smoothstep(.15,.9,l));
      c.rgb=mix(vec3(l),c.rgb,1.12);c.rgb*=mix(.9,1.08,smoothstep(0.,.5,l));
      vec2 d=vUv-.5;float e=dot(d,d)*2.2;c.rgb*=1.-uVig*smoothstep(.25,.95,e);
      c.rgb=mix(c.rgb,vec3(.34,.02,.025)*(.35+l),uHurt*.7*smoothstep(.1,.8,e));
      c.rgb=mix(c.rgb,vec3(dot(c.rgb,vec3(.299,.587,.114)))*vec3(.93,.97,1.06),uFocus*.55)*(1.-uFocus*.5);
      float n=fract(sin(dot(gl_FragCoord.xy+uTime*61.,vec2(12.9898,78.233)))*43758.5453)-.5;
      c.rgb=max(c.rgb+n*(.0012+.014*c.rgb),0.);
      gl_FragColor=c;}`,
};

function gpuName(gl) {
  try { const x = gl.getExtension('WEBGL_debug_renderer_info'); return [gl.getParameter(gl.RENDERER), x && gl.getParameter(x.UNMASKED_VENDOR_WEBGL), x && gl.getParameter(x.UNMASKED_RENDERER_WEBGL)].filter(Boolean).join(' / '); } catch (_) { return ''; }
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
  // How heavy the picture is (shadow maps, antialiasing, pixel ratio) is decided in quality.js, from the GPU's name, what the
  // player picked and what this device has shown it can't run.
  const gpu = gpuName(renderer.getContext()); startGfx(gpu);
  renderer.shadowMap.enabled = gfx.shadow > 0; renderer.shadowMap.type = gfx.soft ? T.PCFSoftShadowMap : T.PCFShadowMap;
  // Lost: pause, hide the canvas (Chrome paints a lost one white) and say so. Some phones' drivers drop the context when many
  // draws sample a shadow map (see KNOWN in quality.js), and after a few losses the browser refuses WebGL to the site until
  // it is restarted: so a context lost with shadows on, while the page was in view, caps this device at LOW from now on.
  // (One dropped while the page was hidden, as a phone may do to a tab in the background, is not the shadows' doing.)
  // three.js keeps the context restorable (it calls preventDefault); if the browser gives it back, carry on at the new tier.
  canvas.addEventListener('webglcontextlost', () => {
    const drop = renderer.shadowMap.enabled && document.visibilityState === 'visible';
    if (drop) capGfx('low', 'lost');
    if (G.pause) G.pause(true);
    canvas.style.visibility = 'hidden';
    notice(true, 'THE GRAPHICS STOPPED', (drop ? 'This device’s graphics driver dropped the game. Shadows are now off on this device, which usually stops it.' : 'This device’s graphics driver dropped the game.') + ' Reload to carry on from your last checkpoint. ' + AGAIN);
  });
  canvas.addEventListener('webglcontextrestored', () => { applyGfx(false); canvas.style.visibility = ''; notice(false); }); // (after three.js's own handler, which rebuilds its state)
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(54, 1, 0.1, 900);
  // The scene is drawn into the composer's own target, which is not antialiased unless asked:
  // without samples every thin edge (door leading, gilt fillets, blade) crawls as the camera moves.
  const composer = new EffectComposer(renderer, new T.WebGLRenderTarget(innerWidth, innerHeight, { type: T.HalfFloatType, samples: gfx.msaa }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new T.Vector2(256, 256), 0.42, 0.55, 0.9);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader); composer.addPass(grade);
  composer.addPass(new OutputPass());
  function resize() {
    const W = innerWidth, H = innerHeight, pr = Math.min(devicePixelRatio || 1, gfx.pr);
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false); composer.setPixelRatio(pr); composer.setSize(W, H); grade.uniforms.uAsp.value = W / H;
    camera.aspect = W / H; camera.fov = W < H ? 66 : 54; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize(); G.on((kind) => { if (kind === 'gfx') resize(); });
  Object.assign(G, { renderer, scene, camera, composer, grade, bloom, gpu });
  return { renderer, scene, camera, composer };
}
