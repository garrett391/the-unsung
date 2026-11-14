import * as T from 'three';
import { PI, rng } from '../core/util.js';
import { toon, canvasTex } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Painted patches laid on the ground out of doors (the camp, the waystation): drifted sand, ash,
// damp, cracks, footprints, wheel ruts, scattered straw. Each texture is white on clear, so one
// painting serves any colour; a set of patches is merged into a single lit, shadow-receiving mesh.
// (The halls have their own unlit version, for walls as well as floors: world/halls.js.)
const q = rng(203), Q = (a, b) => a + q() * (b - a);
const dtex = (draw) => { const t = canvasTex(128, (g, n) => { g.clearRect(0, 0, n, n); draw(g, n); }); t.wrapS = t.wrapT = T.ClampToEdgeWrapping; return t; };
export const DECAL = {
  // an uneven soft-edged patch, worn through in spots
  soft: dtex((g) => { for (let i = 0; i < 20; i++) { const x = Q(36, 92), y = Q(36, 92), r = Q(14, 34), gr = g.createRadialGradient(x, y, 0, x, y, r), a = Q(0.45, 0.8); gr.addColorStop(0, `rgba(255,255,255,${a.toFixed(2)})`); gr.addColorStop(0.6, `rgba(255,255,255,${(a * 0.85).toFixed(2)})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
    g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 50; i++) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(Q(10, 118), Q(10, 118), Q(1, 5), 0, 7); g.fill(); } }),
  crack: dtex((g) => { g.lineCap = g.lineJoin = 'round'; g.strokeStyle = 'rgba(255,255,255,.9)';
    const run = (x, y, a, n, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < n; k++) { a += Q(-0.7, 0.7); x = Math.max(8, Math.min(120, x + Math.cos(a) * 11)); y = Math.max(8, Math.min(120, y + Math.sin(a) * 11)); g.lineTo(x, y); if (w > 1 && q() < 0.3) { g.stroke(); run(x, y, a + (q() < 0.5 ? 1 : -1), (n / 2) | 0, w * 0.6); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); } } g.stroke(); };
    for (let i = 0; i < 3; i++) run(Q(50, 78), Q(50, 78), Q(0, 6.3), 6, 2); }),
  // five boot prints walking up the texture (lay it 0.9 m wide by 3.4 m long)
  prints: dtex((g) => { for (let i = 0; i < 5; i++) { const x = 64 + (i % 2 ? 11 : -11) + Q(-2, 2), y = 114 - i * 25 + Q(-2, 2); g.fillStyle = `rgba(255,255,255,${Q(0.45, 0.9).toFixed(2)})`;
    g.beginPath(); g.ellipse(x, y, 7, 4.2, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x, y + 6.6, 5.6, 2.3, 0, 0, 7); g.fill(); } }),
  // a pair of wheel ruts running up the texture, with hoof marks between (lay it 2.3 m wide)
  ruts: dtex((g) => { g.lineCap = 'round';
    for (const sx of [-1, 1]) for (const [w, a] of [[15, 0.3], [10, 0.4], [5, 0.4]]) { g.lineWidth = w; g.strokeStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.moveTo(64 + sx * 52, 2); g.lineTo(64 + sx * 52, 126); g.stroke(); } // broad and soft: pressed earth, not a cut
    for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(Q(40, 88), Q(8, 120), 3.6, 1.8, 0, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'destination-in'; const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.1, '#000'); gr.addColorStop(0.9, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }),
  // loose straw: short strokes every way, thinning toward the edge
  straw: dtex((g) => { g.lineCap = 'round'; for (let i = 0; i < 120; i++) { const a = Q(0, 6.3), d = Q(0, 1) ** 0.7 * 52, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, b = Q(0, 3.2), l = Q(3, 8); g.lineWidth = Q(0.9, 1.6); g.strokeStyle = `rgba(255,255,255,${Q(0.6, 1).toFixed(2)})`; g.beginPath(); g.moveTo(x - Math.cos(b) * l, y - Math.sin(b) * l); g.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); g.stroke(); } }),
};
// const sand = decals(DECAL.soft, 0xd8c090, 0.7); sand.at(x, z, w, h, ry); ... sand.done(parent)
// The top of the texture points along -z, turned by ry (so prints and ruts heading at angle a take ry = a + PI).
export function decals(map, color, opacity) {
  const parts = [];
  return {
    at(x, z, w, h, ry = 0, y = 0.03) { const g = new T.PlaneGeometry(w, h); g.rotateX(-PI / 2); g.rotateY(ry); g.translate(x, y, z); parts.push(g); },
    done(parent) {
      if (!parts.length) return null;
      const m = new T.Mesh(mergeGeometries(parts), toon(color, { map, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.receiveShadow = true; m.renderOrder = -1; /* under blood and the other transparent things */ parent.add(m); return m;
    },
  };
}
