import * as T from 'three';
import { G } from '../core/game.js';
import { PI, clamp, lerp, damp } from '../core/util.js';
import { Char } from '../actors/char.js';
import { buildHumanoid } from '../actors/rig.js';
import { toon, clothTex } from '../gfx/materials.js';

// The wounded being carried from the west tent, past the mouth, down the Narrows to the
// sanctum. Each stretcher is two bearers and a litter. They only move while the hold
// progresses, so they visibly stop when the captain leaves the mouth.
// The route bends twice into the Narrows and keeps clear of the rocks along its west wall.
const PATH = [[-9.2, -1.4], [-3.4, -7.0], [-1.1, -10.6], [-1.1, -27]];
const SEG = PATH.slice(1).map((p, i) => Math.hypot(p[0] - PATH[i][0], p[1] - PATH[i][1]));
const LEN = SEG.reduce((a, b) => a + b, 0);
const SPAN = 1.6; // a stretcher is on the move for this many "slots" of hold progress
const GAP = 2.9; // distance between the two bearers along the path: they hold the pole ends at their sides
const SC = 0.95;
const STEP = 4.2; // stride phase per metre: short, quick steps under a load
// Camp orderlies, not line soldiers: open helms, light shoulders, drab colours.
const LOOK = { armor: 0x6a4a3c, trim: 0x9a8a6a, under: 0x4a4038, dark: 0x2c2620, rim: 0x2c3f86, weapon: 'none', helm: 'open', pads: 0.72, legs: 1.05 };
const WOUNDED = { armor: 0x8d8168, trim: 0x6f6450, under: 0x57503f, dark: 0x3a2c22, rim: 0x2c3f86, weapon: 'none', helm: 'none', bandage: true, pads: 0.6 };
const BLANKETS = [0x7c3136, 0x4d5a74, 0x6b6a4a];
const HAIR = [0x7a5228, 0x2c2420, 0xa9844e];

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
  constructor(lead) { super({ ...LOOK, skin: lead ? 0xd9a77e : 0xb98a66, hair: lead ? 0x3a2c22 : 0x7a5228 }, SC); this.type = { name: 'BEARER' }; this.lead = lead; this.sN = 0; }
  // Arms hang straight to the pole ends at the hips and take the weight; the shoulders stay
  // square to the litter instead of swinging with the stride.
  apply(time) {
    super.apply(time); const J = this.rig.J, lf = this.lead ? 1 : -1;
    J.shL.rotation.set(0.1 * lf, 0, -0.03); J.elL.rotation.set(-0.14, 0, 0); J.haL.rotation.set(0, 0, 0);
    J.shR.rotation.set(0.1 * lf, 0, 0.03); J.elR.rotation.set(-0.14, 0, 0); J.haR.rotation.set(0, 0, 0);
    J.spine.rotation.y = -J.hips.rotation.y; J.chest.rotation.y = 0; J.chest.rotation.z = 0; J.spine.rotation.z *= 0.3;
    J.spine.rotation.x += 0.1; J.neck.rotation.y = 0;
    // the rear bearer watches the wounded; the lead watches the way ahead
    J.neck.rotation.x = this.lead ? -0.08 : 0.22 + Math.sin(time * 0.7 + this.seed) * 0.06;
  }
  grip(out) { const J = this.rig.J; this.root.updateMatrixWorld(true); J.haL.getWorldPosition(out); J.haR.getWorldPosition(tmp); return out.add(tmp).multiplyScalar(0.5); }
}
const tmp = new T.Vector3(), gA = new T.Vector3(), gB = new T.Vector3();

// Poles, a canvas bed that sags between them, and a wounded soldier under a blanket.
function litter() {
  const g = new T.Group(); g.rotation.order = 'YXZ';
  const wood = toon(0x6a4a2c), canvas = toon(0xcfc2a2, { side: T.DoubleSide, map: clothTex }), wool = toon(BLANKETS[0], { side: T.DoubleSide, map: clothTex });
  const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  for (const s of [-1, 1]) {
    add(new T.CylinderGeometry(0.026, 0.026, GAP + 0.16, 6), wood, s * 0.27, 0, 0).rotation.x = PI / 2;
    for (const z of [-0.97, 0.97]) add(new T.CylinderGeometry(0.034, 0.034, 0.05, 6), wood, s * 0.27, 0, z).rotation.x = PI / 2; // canvas lashings
  }
  for (const z of [-0.97, 0.97]) add(new T.BoxGeometry(0.54, 0.03, 0.04), wood, 0, 0, z); // spreader bars
  // the bed: a strip that hangs lowest along the middle
  const bed = new T.PlaneGeometry(0.54, 1.9, 6, 1); bed.rotateX(-PI / 2);
  const bp = bed.attributes.position; for (let i = 0; i < bp.count; i++) { const u = bp.getX(i) / 0.27; bp.setY(i, -0.07 * (1 - u * u)); }
  bed.computeVertexNormals(); add(bed, canvas, 0, 0, 0);
  // The soldier lies on their back, feet first. A full figure in the game's own style, so the
  // wounded read as people rather than cargo.
  const rig = buildHumanoid(WOUNDED), J = rig.J; rig.root.scale.setScalar(SC); rig.root.rotation.x = -PI / 2; rig.root.position.set(0, 0.13, 0.82); g.add(rig.root);
  J.thL.rotation.set(0, 0, 0.05); J.thR.rotation.set(0, 0, -0.05); J.anL.rotation.set(0.5, 0.3, 0); J.anR.rotation.set(0.5, -0.3, 0);
  J.spine.rotation.set(-0.03, 0, 0); J.shield.rotation.set(0, 0, 0);
  // blanket from the shins to the chest, arched over the body with its edges on the canvas
  const bl = new T.CylinderGeometry(0.265, 0.265, 0.9, 10, 1, true, -PI / 2, PI); bl.rotateX(PI / 2); bl.rotateZ(PI);
  add(bl, wool, 0, -0.03, 0.2).scale.set(1, 1.62, 1);
  const fl = new T.CylinderGeometry(0.275, 0.275, 0.1, 10, 1, true, -PI / 2, PI); fl.rotateX(PI / 2); fl.rotateZ(PI);
  add(fl, wool, 0, -0.03, -0.24).scale.set(1, 1.64, 1); // the turned-back top edge
  add(new T.CircleGeometry(0.265, 10, 0, PI), wool, 0, -0.03, 0.65).scale.set(1, 1.62, 1); // the end hanging over the shins
  const hairMat = rig.mats.find((m) => m.color.getHex() === 0x7a5228);
  G.scene.add(g);
  // A different casualty each trip: blanket, hair and which arm has slipped off the side.
  const dress = (k) => {
    const s = k % 2 ? -1 : 1; g.userData.side = s; wool.color.setHex(BLANKETS[k % BLANKETS.length]); if (hairMat) hairMat.color.setHex(HAIR[(k * 2) % HAIR.length]);
    const out = s > 0 ? ['shL', 'elL'] : ['shR', 'elR'], inn = s > 0 ? ['shR', 'elR'] : ['shL', 'elL'];
    J[inn[0]].rotation.set(-0.3, s * 1.15, 0); J[inn[1]].rotation.set(-1.75, 0, 0); // a hand resting on the chest
    J[out[0]].rotation.set(0.7, 0, s * 0.6); J[out[1]].rotation.set(-0.2, 0, 0);
    J.neck.rotation.set(0.06, -s * 0.45, 0);
  };
  // The hanging arm and the head give with each step.
  const sway = (time, k, move) => {
    const s = g.userData.side, a = Math.sin(time * 5.6 + k) * 0.09 * move;
    (s > 0 ? J.shL : J.shR).rotation.x = 0.7 + a; (s > 0 ? J.elL : J.elR).rotation.x = -0.2 - Math.abs(a) * 0.8;
    J.neck.rotation.y = -s * 0.45 + Math.sin(time * 2.8 + k) * 0.05 * move; J.neck.rotation.z = Math.sin(time * 5.6 + k + 1) * 0.03 * move;
  };
  return { g, dress, sway };
}

export function makeStretchers(total) {
  // Stretchers two apart never share the route, so two parties serve all of them.
  const parties = [0, 1].map(() => ({ front: new Bearer(true), back: new Bearer(false), l: litter(), idx: -1, move: 0 })), pA = {}, pB = {};
  const show = (s, on) => { s.front.setVisible(on); s.back.setVisible(on); s.l.g.visible = on; if (!on) { s.front.shadow.visible = s.back.shadow.visible = false; s.idx = -1; } };
  for (const s of parties) show(s, false);
  return {
    list: parties,
    // progress 0..1 of the hold; dt for animation
    update(progress, dt) {
      const slots = progress * total;
      for (let k = 0; k < parties.length; k++) {
        const s = parties[k]; let i = -1, u = 0;
        for (let j = k; j < total; j += parties.length) { const v = (slots - (j + 1) + SPAN) / SPAN; if (v > 0 && v < 1) { i = j; u = v; break; } } // 0 as it sets off, 1 as it reaches the sanctum
        if (i < 0) { if (s.idx >= 0) show(s, false); continue; }
        const d = u * (LEN + GAP) - GAP / 2, fresh = s.idx !== i;
        at(d + GAP / 2, pA); at(d - GAP / 2, pB);
        if (fresh) { show(s, true); s.idx = i; s.l.dress(i); s.move = 0; }
        let moving = 0;
        for (const [b, p] of [[s.front, pA], [s.back, pB]]) {
          if (fresh) { b.place(p.x, p.z, p.face); b.sN = 0; b.strafeS = 0; }
          const nx = p.x - b.pos.x, nz = p.z - b.pos.z, sp = dt > 0 ? Math.hypot(nx, nz) / dt : 0;
          b.vel.set(dt > 0 ? nx / dt : 0, 0, dt > 0 ? nz / dt : 0); b.pos.set(p.x, 0, p.z); b.turnTo(p.face, 2.6, dt);
          b.setLoco(3.2, dt); b.phase += sp * dt * (STEP - 1.72 / SC);
          b.sN = damp(b.sN, Math.min(0.24, sp * 0.13), 6, dt); b.speedN = b.sN; b.strafe = b.strafeS = 0; b.animate(dt, G.time); moving = Math.max(moving, b.sN / 0.24);
        }
        s.move = moving;
        // The litter hangs from the four hands, so it rides the bearers' steps.
        s.front.grip(gA); s.back.grip(gB); const g = s.l.g, dx = gA.x - gB.x, dy = gA.y - gB.y, dz = gA.z - gB.z;
        g.position.set((gA.x + gB.x) / 2, (gA.y + gB.y) / 2 - 0.045 * SC, (gA.z + gB.z) / 2);
        g.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), Math.sin(G.time * 5.6 + i) * 0.02 * moving);
        s.l.sway(G.time, i, moving);
      }
    },
    dispose() { for (const s of parties) { s.front.dispose(); s.back.dispose(); G.scene.remove(s.l.g); } parties.length = 0; },
  };
}
