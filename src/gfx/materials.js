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
    // lit crest under each ripple, then scattered grit
    g.strokeStyle = 'rgba(238,216,172,.16)'; g.lineWidth = 1.5;
    for (let y = 0; y < n; y += 16) { g.beginPath(); for (let x = 0; x <= n; x += 8) g.lineTo(x, y + 3 + Math.sin(x * 0.05 + y) * 4); g.stroke(); }
    for (let i = 0; i < 110; i++) {
      const x = R0() * n, y = R0() * n, s = 0.7 + R0() * 1.6;
      g.fillStyle = 'rgba(104,82,58,.38)'; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
      g.fillStyle = 'rgba(240,222,184,.3)'; g.beginPath(); g.arc(x - s * 0.4, y - s * 0.4, s * 0.45, 0, 7); g.fill();
    }
  }, 40),
  flags: canvasTex(256, (g, n) => {
    speck(g, n, [168, 148, 116], 12, R0);
    blotch(g, n, ['rgba(120,100,76,.12)', 'rgba(210,190,150,.12)'], 40, 12, 44);
    const h = n / 2, q = n / 4;
    g.fillStyle = 'rgba(70,56,40,.55)';
    g.fillRect(0, 0, n, 3); g.fillRect(0, h, n, 3); g.fillRect(0, 0, 3, h); g.fillRect(h, 0, 3, h); g.fillRect(q, h, 3, h); g.fillRect(h + q, h, 3, h);
    // each slab its own tone, a lit lip under every joint, worn corners
    const tone = () => (R0() < 0.5 ? 'rgba(84,66,46,' : 'rgba(232,212,170,') + (0.05 + R0() * 0.1).toFixed(2) + ')';
    g.fillStyle = tone(); g.fillRect(3, 3, h - 3, h - 3); g.fillStyle = tone(); g.fillRect(h + 3, 3, h - 3, h - 3);
    g.fillStyle = tone(); g.fillRect(q + 3, h + 3, h - 3, h - 3); g.fillStyle = tone(); g.fillRect(h + q + 3, h + 3, q - 3, h - 3); g.fillRect(0, h + 3, q, h - 3);
    g.fillStyle = 'rgba(236,216,176,.22)';
    g.fillRect(0, 3, n, 1.5); g.fillRect(0, h + 3, n, 1.5); g.fillRect(3, 0, 1.5, h); g.fillRect(h + 3, 0, 1.5, h); g.fillRect(q + 3, h, 1.5, h); g.fillRect(h + q + 3, h, 1.5, h);
    for (let i = 0; i < 70; i++) { const x = R0() * n, y = R0() * n; g.fillStyle = 'rgba(60,46,34,.28)'; g.fillRect(x, y, 1 + R0() * 2, 1 + R0() * 2); }
    g.strokeStyle = 'rgba(70,56,40,.35)'; g.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) { let x = R0() * n, y = R0() * n; g.beginPath(); g.moveTo(x, y); for (let m = 0; m < 5; m++) { x += (R0() - 0.5) * 40; y += (R0() - 0.3) * 30; g.lineTo(x, y); } g.stroke(); }
    blotch(g, n, ['rgba(206,180,132,.5)'], 26, 3, 12); // drifted sand
  }, 9),
  block: canvasTex(256, (g, n) => {
    speck(g, n, [176, 150, 112], 12, R0);
    blotch(g, n, ['rgba(120,96,70,.14)', 'rgba(220,196,150,.12)'], 50, 10, 40);
    g.fillStyle = 'rgba(72,56,40,.5)';
    for (let y = 0; y < n; y += 64) { g.fillRect(0, y, n, 3); for (let x = ((y / 64) % 2) * 64; x < n; x += 128) g.fillRect(x, y, 3, 64); }
    // per-block tone, a lit edge under the mortar, cracks, chipped corners, streaks
    for (let y = 0; y < n; y += 64) for (let x = ((y / 64) % 2) * 64 - 128; x < n; x += 128) {
      g.fillStyle = (R0() < 0.5 ? 'rgba(80,62,44,' : 'rgba(234,212,168,') + (0.04 + R0() * 0.12).toFixed(2) + ')'; g.fillRect(x + 3, y + 3, 125, 61);
      g.fillStyle = 'rgba(238,216,174,.24)'; g.fillRect(x + 3, y + 3, 125, 1.5); g.fillRect(x + 3, y + 3, 1.5, 61);
      g.fillStyle = 'rgba(52,40,30,.5)';
      for (let k = 0; k < 3; k++) { const cx = x + (R0() < 0.5 ? 3 : 128), cy = y + (R0() < 0.5 ? 3 : 64), s = 2 + R0() * 5; g.beginPath(); g.arc(cx, cy, s, 0, 7); g.fill(); }
    }
    g.strokeStyle = 'rgba(56,42,30,.45)'; g.lineWidth = 1.2;
    for (let k = 0; k < 9; k++) { let x = R0() * n, y = R0() * n; g.beginPath(); g.moveTo(x, y); for (let m = 0; m < 5; m++) { x += (R0() - 0.5) * 22; y += R0() * 16; g.lineTo(x, y); } g.stroke(); }
    for (let k = 0; k < 14; k++) { const x = R0() * n, y = R0() * n, l = 20 + R0() * 50, gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(60,46,36,.22)'); gr.addColorStop(1, 'rgba(60,46,36,0)'); g.fillStyle = gr; g.fillRect(x, y, 3 + R0() * 5, l); }
    for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(58,44,32,.3)'; g.fillRect(R0() * n, R0() * n, 1 + R0() * 2, 1 + R0() * 2); }
  }),
  rock: canvasTex(128, (g, n) => {
    speck(g, n, [112, 92, 78], 16, R0);
    blotch(g, n, ['rgba(60,48,44,.2)', 'rgba(160,130,104,.14)'], 40, 6, 26);
  }, 3),
  // Tent cloth: weave, sewn seams, weather stains and a red hem band along the bottom edge.
  canvas: canvasTex(256, (g, n) => {
    speck(g, n, [190, 172, 142], 10, R0);
    g.fillStyle = 'rgba(120,100,74,.10)'; for (let i = 0; i < n; i += 4) { g.fillRect(i, 0, 1, n); g.fillRect(0, i, n, 1); }
    blotch(g, n, ['rgba(110,90,66,.10)', 'rgba(226,210,180,.10)'], 40, 10, 46);
    for (let k = 0; k < 10; k++) { const x = R0() * n, l = 50 + R0() * 120, gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(88,70,52,.2)'); gr.addColorStop(1, 'rgba(88,70,52,0)'); g.fillStyle = gr; g.fillRect(x, 0, 6 + R0() * 14, l); }
    for (let x = 0; x < n; x += 128) { g.fillStyle = 'rgba(96,78,58,.5)'; g.fillRect(x + 62, 0, 2, n); g.fillStyle = 'rgba(236,224,196,.5)'; for (let y = 2; y < n; y += 9) g.fillRect(x + 58, y, 10, 1.5); }
    const sh = g.createLinearGradient(0, n - 90, 0, n); sh.addColorStop(0, 'rgba(90,70,50,0)'); sh.addColorStop(1, 'rgba(90,70,50,.3)'); g.fillStyle = sh; g.fillRect(0, n - 90, n, 90);
    g.fillStyle = '#8a2a2a'; g.fillRect(0, n - 34, n, 16); g.fillStyle = '#c9a24a'; g.fillRect(0, n - 38, n, 3); g.fillRect(0, n - 17, n, 3);
    g.fillStyle = 'rgba(70,54,40,.55)'; g.fillRect(0, n - 5, n, 5);
  }),
  // Crate face: planks inside a nailed frame with a diagonal brace.
  crate: canvasTex(128, (g, n) => {
    speck(g, n, [124, 90, 56], 14, R0);
    g.strokeStyle = 'rgba(60,40,22,.35)'; g.lineWidth = 1;
    for (let k = 0; k < 46; k++) { const y = R0() * n, x = R0() * n; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + R0() * 50, y + (R0() - 0.5) * 3); g.stroke(); }
    g.fillStyle = 'rgba(40,26,14,.7)'; for (let y = 32; y < n; y += 32) g.fillRect(0, y - 1, n, 2.5);
    const board = (path) => { g.fillStyle = '#8c6438'; path(); g.fill(); g.strokeStyle = 'rgba(40,26,14,.75)'; g.lineWidth = 2; g.stroke(); };
    board(() => { g.beginPath(); g.moveTo(14, 26); g.lineTo(26, 14); g.lineTo(114, 102); g.lineTo(102, 114); g.closePath(); });
    for (const [x, y, w, h] of [[0, 0, n, 16], [0, n - 16, n, 16], [0, 0, 16, n], [n - 16, 0, 16, n]]) board(() => { g.beginPath(); g.rect(x + 1, y + 1, w - 2, h - 2); });
    g.fillStyle = 'rgba(236,206,150,.22)'; g.fillRect(2, 2, n - 4, 2); g.fillRect(2, n - 14, n - 4, 2);
    g.fillStyle = '#2c2420'; for (const x of [8, n - 8]) for (const y of [8, 40, 88, n - 8]) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
    for (const x of [44, 84]) for (const y of [8, n - 8]) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
  }),
  // Barrel side: staves under two iron hoops.
  barrel: canvasTex(64, (g, n) => {
    speck(g, n, [118, 82, 50], 12, R0);
    for (let x = 0; x < n; x += 8) { g.fillStyle = 'rgba(40,26,14,.6)'; g.fillRect(x, 0, 1.5, n); g.fillStyle = 'rgba(226,190,130,.16)'; g.fillRect(x + 2, 0, 1.5, n); }
    for (const y of [9, 47]) { g.fillStyle = '#3a3634'; g.fillRect(0, y, n, 8); g.fillStyle = 'rgba(190,190,200,.35)'; g.fillRect(0, y + 1, n, 1.5); }
  }),
  // Column shaft: shallow flutes, with bands of weathering.
  flute: canvasTex(128, (g, n) => {
    speck(g, n, [180, 158, 122], 10, R0);
    for (let x = 0; x < n; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(60,46,34,.42)'); gr.addColorStop(0.45, 'rgba(240,222,184,.2)'); gr.addColorStop(1, 'rgba(60,46,34,.42)'); g.fillStyle = gr; g.fillRect(x, 0, 16, n); }
    blotch(g, n, ['rgba(96,76,56,.14)', 'rgba(226,204,160,.12)'], 30, 6, 22);
    g.fillStyle = 'rgba(56,42,30,.5)'; g.fillRect(0, 62, n, 2.5); g.fillStyle = 'rgba(236,216,176,.25)'; g.fillRect(0, 65, n, 1.5);
  }, 3, 1),
  // Wall banner: crimson with a gold border, swallowtail cut and the company's diamond and bar.
  banner: canvasTex(128, (g, n) => {
    g.clearRect(0, 0, n, n);
    const cut = (m) => { g.beginPath(); g.moveTo(m, 0); g.lineTo(n - m, 0); g.lineTo(n - m, n - m * 1.2); g.lineTo(n / 2, n * 0.85 - m * 0.6); g.lineTo(m, n - m * 1.2); g.closePath(); };
    g.fillStyle = '#c9a24a'; cut(0); g.fill(); g.fillStyle = '#8f2226'; cut(10); g.fill();
    g.save(); cut(10); g.clip();
    g.fillStyle = 'rgba(40,10,14,.22)'; for (let y = 6; y < n; y += 18) g.fillRect(0, y, n, 5);
    g.fillStyle = 'rgba(255,200,180,.07)'; for (let x = 0; x < n; x += 3) g.fillRect(x, 0, 1, n);
    g.restore();
    g.fillStyle = '#c9a24a'; g.fillRect(0, 0, n, 5);
    g.beginPath(); g.moveTo(64, 26); g.lineTo(94, 40); g.lineTo(64, 54); g.lineTo(34, 40); g.closePath(); g.fill();
    g.fillStyle = '#8f2226'; g.beginPath(); g.moveTo(64, 31); g.lineTo(83, 40); g.lineTo(64, 49); g.lineTo(45, 40); g.closePath(); g.fill();
    g.fillStyle = '#c9a24a'; g.fillRect(36, 60, 56, 4);
  }),
  moon: canvasTex(128, (g, n) => {
    g.fillStyle = '#f2f4ff'; g.fillRect(0, 0, n, n);
    for (const [x, y, s, a] of [[44, 44, 17, 0.2], [72, 38, 11, 0.16], [80, 66, 15, 0.18], [52, 80, 10, 0.14], [36, 64, 7, 0.12], [92, 48, 6, 0.12]]) { g.fillStyle = `rgba(110,124,170,${a})`; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); }
    for (let i = 0; i < 16; i++) { const x = 20 + R0() * 88, y = 20 + R0() * 88, s = 1.5 + R0() * 3; g.fillStyle = 'rgba(110,124,170,.2)'; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x + s * 0.3, y + s * 0.3, s * 0.6, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(64, 64, 40, 64, 64, 64); gr.addColorStop(0, 'rgba(150,165,215,0)'); gr.addColorStop(1, 'rgba(150,165,215,.5)'); g.fillStyle = gr; g.fillRect(0, 0, n, n);
  }),
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
// Character surfaces. Near-white, so they tint with the material color.
// plate: brushed metal with a rolled, riveted edge and a few scratches.
export const plateTex = canvasTex(128, (g, n) => {
  speck(g, n, [236, 236, 236], 9, R0);
  for (let i = 0; i < 40; i++) { g.fillStyle = R0() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.025)'; g.fillRect(R0() * n, 0, 1 + R0() * 2, n); }
  blotch(g, n, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.07)'], 26, 6, 22);
  for (const y of [0, n - 9]) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, y, n, 9); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, y === 0 ? 8 : y, n, 1.5); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, y === 0 ? 10 : y - 2, n, 1.5); }
  for (let x = 8; x < n; x += 16) for (const y of [16, n - 16]) { g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x - 0.7, y - 0.7, 1, 0, 7); g.fill(); }
  g.lineWidth = 1;
  for (let k = 0; k < 16; k++) { const x = R0() * n, y = 22 + R0() * (n - 44), l = 6 + R0() * 18, a = R0() * 3; g.strokeStyle = R0() < 0.6 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
});
// mail: offset rows of small rings.
export const mailTex = canvasTex(32, (g, n) => {
  g.fillStyle = '#b9b9b9'; g.fillRect(0, 0, n, n); g.lineWidth = 1.3;
  for (let r = -1; r < 5; r++) for (let c = -1; c < 5; c++) {
    const x = c * 8 + (r % 2 ? 4 : 0), y = r * 8 + 4;
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.65)'; g.beginPath(); g.arc(x, y, 3.2, 3.6, 5.4); g.stroke();
  }
}, 9, 7);
// cloth: a fine weave with soft vertical folds.
export const clothTex = canvasTex(64, (g, n) => {
  speck(g, n, [232, 232, 232], 8, R0);
  g.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < n; i += 2) g.fillRect(0, i, n, 1);
  for (const [x, w, a] of [[6, 9, 0.22], [24, 7, 0.16], [40, 10, 0.24], [56, 6, 0.14]]) { const gr = g.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - w, 0, w * 2, n); g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x + w, 0, 2, n); }
});
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

// Corin's tabard: off-white cloth with a blue edge. 'top' carries the Third Company badge
// (a gold-edged red diamond over a gold bar); 'low' is the hanging skirt, cut to a point.
// Transparent outside the cloth, so use with alphaTest.
export function tabardTex(part) {
  return canvasTex(128, (g, n) => {
    g.clearRect(0, 0, n, n);
    const cloth = (path) => { g.fillStyle = '#2f4f8f'; path(0); g.fill(); g.fillStyle = '#e8e2d2'; path(9); g.fill(); };
    if (part === 'mid') cloth((m) => g.rect(m, 0, n - 2 * m, n));
    else if (part === 'top') {
      cloth((m) => g.rect(m, 0, n - 2 * m, n));
      g.fillStyle = '#d9b24a'; g.fillRect(34, 86, 60, 8);
      g.beginPath(); g.moveTo(64, 22); g.lineTo(90, 52); g.lineTo(64, 82); g.lineTo(38, 52); g.closePath(); g.fill();
      g.fillStyle = '#a51f25'; g.beginPath(); g.moveTo(64, 30); g.lineTo(83, 52); g.lineTo(64, 74); g.lineTo(45, 52); g.closePath(); g.fill();
      g.fillStyle = '#e8e2d2'; g.fillRect(61, 44, 6, 16);
    } else {
      cloth((m) => { g.beginPath(); g.moveTo(m, 0); g.lineTo(n - m, 0); g.lineTo(n - m, n * 0.72 - m * 0.4); g.lineTo(n / 2, n - m * 1.4); g.lineTo(m, n * 0.72 - m * 0.4); g.closePath(); });
      g.strokeStyle = 'rgba(47,79,143,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 58); g.lineTo(64, 76); g.lineTo(88, 58); g.stroke();
    }
  });
}
