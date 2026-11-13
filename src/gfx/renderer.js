import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from '../core/game.js';

// Vignette plus a gentle grade: cool shadows, warm highlights.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.85 }, uWarm: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float uVig,uWarm;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);float l=dot(c.rgb,vec3(.299,.587,.114));
      vec3 cool=vec3(.90,.97,1.10),warm=vec3(1.10,1.0,.88);
      c.rgb*=mix(mix(cool,vec3(1.),uWarm),warm,smoothstep(.15,.9,l));
      vec2 d=vUv-.5;c.rgb*=1.-uVig*smoothstep(.25,.95,dot(d,d)*2.2);
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
