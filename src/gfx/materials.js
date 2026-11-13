import * as T from 'three';
import { clamp, rng } from '../core/util.js';

// Four-step ramp gives the cel-shaded bands.
const ramp = new T.DataTexture(new Uint8Array([70, 135, 205, 255]), 4, 1, T.RedFormat);
ramp.minFilter = ramp.magFilter = T.NearestFilter; ramp.needsUpdate = true;

// Toon material with an optional fresnel rim, so figures read against a dark scene.
export function toon(color, o = {}) {
  const { rim, ...rest } = o;
  const m = new T.MeshToonMaterial({ color, gradientMap: ramp, ...rest });
  if (rim != null) {
    const u = { value: new T.Color(rim) };
    m.userData.rim = u;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = u;
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform vec3 uRim;\nvoid main() {')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uRim * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.6);');
    };
  }
  return m;
}

export function canvasTex(n, draw, rx, ry) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); draw(g, n);
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
  if (rx) t.repeat.set(rx, ry || rx);
  return t;
}
export function speck(g, n, b, v, r) {
  const id = g.getImageData(0, 0, n, n), d = id.data;
  for (let i = 0; i < n * n; i++) {
    const q = (r() - 0.5) * v;
    d[i * 4] = clamp(b[0] + q, 0, 255); d[i * 4 + 1] = clamp(b[1] + q, 0, 255); d[i * 4 + 2] = clamp(b[2] + q * 0.8, 0, 255); d[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
}
const R0 = rng(7);
// Soft blotches rather than hard pixels: these read as painted surfaces.
function blotch(g, n, cols, count, r0, r1) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = cols[(R0() * cols.length) | 0];
    g.beginPath(); g.arc(R0() * n, R0() * n, r0 + R0() * (r1 - r0), 0, 7); g.fill();
  }
}
export const TEX = {
  sand: canvasTex(256, (g, n) => {
    speck(g, n, [196, 168, 122], 14, R0);
    blotch(g, n, ['rgba(160,130,90,.10)', 'rgba(226,202,156,.10)'], 60, 10, 40);
    g.strokeStyle = 'rgba(150,120,84,.18)'; g.lineWidth = 2;
    for (let y = 0; y < n; y += 16) { g.beginPath(); for (let x = 0; x <= n; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 4); g.stroke(); }
  }, 40),
  flags: canvasTex(256, (g, n) => {
    speck(g, n, [168, 148, 116], 12, R0);
    blotch(g, n, ['rgba(120,100,76,.12)', 'rgba(210,190,150,.12)'], 40, 12, 44);
    const h = n / 2, q = n / 4;
    g.fillStyle = 'rgba(70,56,40,.55)';
    g.fillRect(0, 0, n, 3); g.fillRect(0, h, n, 3); g.fillRect(0, 0, 3, h); g.fillRect(h, 0, 3, h); g.fillRect(q, h, 3, h); g.fillRect(h + q, h, 3, h);
    g.strokeStyle = 'rgba(70,56,40,.35)'; g.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) { let x = R0() * n, y = R0() * n; g.beginPath(); g.moveTo(x, y); for (let m = 0; m < 5; m++) { x += (R0() - 0.5) * 40; y += (R0() - 0.3) * 30; g.lineTo(x, y); } g.stroke(); }
    blotch(g, n, ['rgba(206,180,132,.5)'], 26, 3, 12); // drifted sand
  }, 9),
  block: canvasTex(256, (g, n) => {
    speck(g, n, [176, 150, 112], 12, R0);
    blotch(g, n, ['rgba(120,96,70,.14)', 'rgba(220,196,150,.12)'], 50, 10, 40);
    g.fillStyle = 'rgba(72,56,40,.5)';
    for (let y = 0; y < n; y += 64) { g.fillRect(0, y, n, 3); for (let x = ((y / 64) % 2) * 64; x < n; x += 128) g.fillRect(x, y, 3, 64); }
  }),
  rock: canvasTex(128, (g, n) => {
    speck(g, n, [112, 92, 78], 16, R0);
    blotch(g, n, ['rgba(60,48,44,.2)', 'rgba(160,130,104,.14)'], 40, 6, 26);
  }, 3),
  canvas: canvasTex(64, (g, n) => {
    speck(g, n, [188, 170, 140], 12, R0);
    g.fillStyle = 'rgba(122,36,36,.9)'; g.fillRect(0, n - 12, n, 6);
  }, 4, 1),
  glow: canvasTex(64, (g, n) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  }),
  shadow: canvasTex(32, (g, n) => {
    const gr = g.createRadialGradient(16, 16, 2, 16, 16, 16);
    gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n);
  }),
};
// Heater-shield faces. 0: the captain's, 1: raider iron, 2: guard blue.
export function shieldTex(kind) {
  const t = canvasTex(64, (g, n) => {
    if (kind === 1) {
      speck(g, n, [70, 66, 62], 22, R0); g.strokeStyle = '#8a4a2c'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(8, 8); g.lineTo(56, 56); g.moveTo(56, 8); g.lineTo(8, 56); g.stroke();
    } else {
      g.fillStyle = kind === 0 ? '#e9dfc6' : '#c9d2e0'; g.fillRect(0, 0, n, n);
      g.fillStyle = kind === 0 ? '#a51f25' : '#2f4a80'; g.fillRect(24, 0, 16, n);
      g.fillStyle = '#d9b24a'; g.beginPath(); g.moveTo(32, 16); g.lineTo(42, 30); g.lineTo(32, 44); g.lineTo(22, 30); g.fill();
      g.strokeStyle = '#d9b24a'; g.lineWidth = 6; g.strokeRect(0, 0, n, n);
    }
  });
  t.wrapS = t.wrapT = T.ClampToEdgeWrapping; t.repeat.set(1 / 0.44, 1 / 0.62); t.offset.set(0.5, 0.35 / 0.62);
  return t;
}
