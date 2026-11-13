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

export function initRenderer(canvas) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(54, 1, 0.1, 900);
  const composer = new EffectComposer(renderer);
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
  Object.assign(G, { renderer, scene, camera, composer, grade, bloom });
  return { renderer, scene, camera, composer };
}
