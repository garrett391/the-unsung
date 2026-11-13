import * as T from 'three';
import { G } from '../core/game.js';
import { PI, clamp, lerp } from '../core/util.js';
import { Char } from '../actors/char.js';
import { toon } from '../gfx/materials.js';

// The wounded being carried from the west tent, past the mouth, down the Narrows to the
// sanctum. Each stretcher is two bearers and a litter. They only move while the hold
// progresses, so they visibly stop when the captain leaves the mouth.
const PATH = [[-9.2, -1.4], [-2.1, -8.4], [-2.1, -27]];
const SEG = PATH.slice(1).map((p, i) => Math.hypot(p[0] - PATH[i][0], p[1] - PATH[i][1]));
const LEN = SEG.reduce((a, b) => a + b, 0);
const SPAN = 1.6; // a stretcher is on the move for this many "slots" of hold progress
const GAP = 2.6; // distance between the two bearers' centers along the path
const LOOK = { armor: 0x6e2024, trim: 0x9a8a6a, under: 0x4a4038, dark: 0x25262e, rim: 0x2c3f86, weapon: 'none' };

function at(d, out) {
  d = clamp(d, 0, LEN);
  for (let i = 0; i < SEG.length; i++) {
    if (d <= SEG[i] || i === SEG.length - 1) {
      const a = PATH[i], b = PATH[i + 1], u = SEG[i] ? Math.min(1, d / SEG[i]) : 0;
      out.x = lerp(a[0], b[0], u); out.z = lerp(a[1], b[1], u); out.face = Math.atan2(b[0] - a[0], b[1] - a[1]); return out;
    }
    d -= SEG[i];
  }
  return out;
}

class Bearer extends Char {
  constructor() { super(LOOK, 0.95); this.type = { name: 'BEARER' }; }
  // Arms reach forward and down to the litter poles instead of swinging.
  apply(time) {
    super.apply(time); const J = this.rig.J, lf = this.lead ? -1 : 1;
    J.shL.rotation.set(-0.55 * lf, 0, 0.12); J.elL.rotation.set(-0.35, 0, 0);
    J.shR.rotation.set(-0.55 * lf, 0, -0.12); J.elR.rotation.set(-0.35, 0, 0);
    J.spine.rotation.x += 0.08;
  }
}

function litter() {
  const g = new T.Group(), wood = toon(0x6a4a2c), cloth = toon(0xcfc2a2, { side: T.DoubleSide }), body = toon(0x5a3a32), skin = toon(0xc99a78);
  for (const s of [-1, 1]) { const p = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 2.2, 6), wood); p.rotation.x = PI / 2; p.position.x = s * 0.27; g.add(p); }
  const c = new T.Mesh(new T.BoxGeometry(0.56, 0.03, 1.45), cloth); g.add(c);
  const torso = new T.Mesh(new T.BoxGeometry(0.34, 0.16, 0.9), body); torso.position.set(0, 0.1, -0.1); g.add(torso);
  const head = new T.Mesh(new T.SphereGeometry(0.11, 10, 8), skin); head.position.set(0, 0.13, 0.48); g.add(head);
  const blanket = new T.Mesh(new T.BoxGeometry(0.44, 0.06, 0.75), cloth); blanket.position.set(0, 0.2, -0.22); g.add(blanket);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  G.scene.add(g); return g;
}

export function makeStretchers(total) {
  const list = [], pA = {}, pB = {};
  for (let i = 0; i < total; i++) {
    const front = new Bearer(), back = new Bearer(); front.lead = true;
    const l = litter(); list.push({ front, back, l, done: false });
    front.setVisible(false); back.setVisible(false); l.visible = false;
  }
  return {
    list,
    // progress 0..1 of the hold; dt for animation
    update(progress, dt) {
      const slots = progress * total;
      for (let i = 0; i < total; i++) {
        const s = list[i], u = (slots - (i + 1) + SPAN) / SPAN; // 0 when it sets off, 1 as it reaches the sanctum
        const on = u > 0 && u < 1; s.front.setVisible(on); s.back.setVisible(on); s.l.visible = on;
        if (!on) { s.front.shadow.visible = s.back.shadow.visible = false; continue; }
        const d = u * (LEN + GAP) - GAP / 2;
        at(d + GAP / 2, pA); at(d - GAP / 2, pB);
        for (const [b, p] of [[s.front, pA], [s.back, pB]]) {
          const nx = p.x - b.pos.x, nz = p.z - b.pos.z, sp = dt > 0 ? Math.hypot(nx, nz) / dt : 0;
          b.vel.set(dt > 0 ? nx / dt : 0, 0, dt > 0 ? nz / dt : 0); b.pos.set(p.x, 0, p.z); b.face = p.face;
          b.setLoco(3.2, dt); b.speedN = Math.min(0.55, sp / 3.2); b.animate(dt, G.time);
        }
        s.l.position.set((pA.x + pB.x) / 2, 0.82 + Math.sin(G.time * 9 + i) * 0.015, (pA.z + pB.z) / 2);
        s.l.rotation.y = Math.atan2(pA.x - pB.x, pA.z - pB.z);
      }
    },
    dispose() { for (const s of list) { s.front.dispose(); s.back.dispose(); G.scene.remove(s.l); } list.length = 0; },
  };
}
