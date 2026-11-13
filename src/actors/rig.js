import * as T from 'three';
import { PI } from '../core/util.js';
import { toon, shieldTex } from '../gfx/materials.js';

// Procedural armored humanoid. Faces +Z; the sword hand is at -X.
// Joints are plain groups so the animation system only writes rotations.
export const HIP = 0.9;
export const JN = ['hips', 'spine', 'chest', 'neck', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'thL', 'knL', 'anL', 'thR', 'knR', 'anR', 'shield'];
export const JI = {}; JN.forEach((n, i) => (JI[n] = i));
export const NJ = JN.length, PL = NJ * 3 + 3;

const SEG = 14;
const shields = [0, 1, 2].map(shieldTex);
function mk(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = !!mat.isMeshToonMaterial; parent.add(m); return m;
}
function joint(parent, x, y, z) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function limb(rt, rb, h) { const g = new T.CylinderGeometry(rt, rb, h, SEG, 1); g.translate(0, -h / 2, 0); return g; }
const ball = (r) => new T.SphereGeometry(r, 12, 9);

export function buildHumanoid(o) {
  const mats = [];
  const M = (c, x) => { const m = toon(c, { rim: o.rim == null ? 0x1c2a55 : o.rim, ...(x || {}) }); mats.push(m); return m; };
  const mA = M(o.armor), mT = M(o.trim), mU = M(o.under), mD = M(o.dark || 0x24252d), mS = M(o.steel || 0xdfe3ea);
  const mEye = new T.MeshBasicMaterial({ color: o.eye || 0x08080c });
  const root = new T.Group(), J = {};
  const hips = (J.hips = joint(root, 0, HIP, 0));
  mk(new T.BoxGeometry(0.33, 0.18, 0.22), mU, hips, 0, -0.03, 0);
  const mF = M(o.armor, { side: T.DoubleSide });
  mk(new T.CylinderGeometry(0.215, 0.3, 0.27, SEG, 1, true), mF, hips, 0, -0.1, 0).scale.z = 0.8;
  mk(new T.CylinderGeometry(0.225, 0.225, 0.06, SEG), mT, hips, 0, 0.05, 0).scale.z = 0.8;
  mk(new T.BoxGeometry(0.08, 0.08, 0.04), mT, hips, 0, 0.05, 0.18);
  for (const sd of [-1, 1]) {
    mk(new T.BoxGeometry(0.16, 0.22, 0.035), mA, hips, sd * 0.125, -0.2, 0.185).rotation.x = -0.2;
    mk(new T.BoxGeometry(0.165, 0.035, 0.04), mT, hips, sd * 0.125, -0.3, 0.208).rotation.x = -0.2;
    mk(new T.BoxGeometry(0.16, 0.2, 0.035), mA, hips, sd * 0.125, -0.2, -0.185).rotation.x = 0.2;
  }
  const spine = (J.spine = joint(hips, 0, 0.07, 0));
  mk(new T.CylinderGeometry(0.2, 0.2, 0.2, SEG), mU, spine, 0, 0.1, 0).scale.z = 0.74;
  const chest = (J.chest = joint(spine, 0, 0.2, 0));
  mk(new T.CylinderGeometry(0.285, 0.2, 0.36, SEG), mA, chest, 0, 0.18, 0).scale.z = 0.8;
  mk(new T.CylinderGeometry(0.12, 0.21, 0.07, SEG), mT, chest, 0, 0.385, 0).scale.z = 0.85;
  mk(new T.BoxGeometry(0.1, 0.1, 0.03), mT, chest, 0, 0.22, 0.215).rotation.z = PI / 4;
  mk(new T.BoxGeometry(0.028, 0.28, 0.03), mT, chest, 0, 0.17, 0.2).rotation.x = 0.18;
  // helm
  const neck = (J.neck = joint(chest, 0, 0.4, 0));
  mk(new T.CylinderGeometry(0.15, 0.16, 0.24, SEG), mA, neck, 0, 0.135, 0);
  const dome = mk(new T.SphereGeometry(0.15, SEG, 8, 0, PI * 2, 0, PI / 2), mA, neck, 0, 0.255, 0); dome.scale.y = 0.75;
  mk(new T.CylinderGeometry(0.156, 0.156, 0.03, SEG), mT, neck, 0, 0.25, 0);
  mk(new T.CylinderGeometry(0.157, 0.157, 0.042, 10, 1, true, -0.95, 1.9), mEye, neck, 0, 0.165, 0);
  mk(new T.BoxGeometry(0.036, 0.19, 0.03), mT, neck, 0, 0.11, 0.15);
  mk(new T.BoxGeometry(0.22, 0.09, 0.04), mA, neck, 0, 0.03, -0.125);
  if (o.plume) {
    const mP = M(o.plume);
    mk(new T.BoxGeometry(0.05, 0.11, 0.22), mP, neck, 0, 0.4, -0.02);
    mk(new T.BoxGeometry(0.05, 0.2, 0.14), mP, neck, 0, 0.34, -0.2).rotation.x = -0.5;
    mk(new T.BoxGeometry(0.045, 0.26, 0.09), mP, neck, 0, 0.15, -0.29).rotation.x = -0.2;
  }
  if (o.horns) for (const s of [-1, 1]) mk(new T.ConeGeometry(0.045, 0.26, 8), mT, neck, s * 0.2, 0.3, 0).rotation.z = -s * 1.0;
  if (o.crown) for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.5; mk(new T.ConeGeometry(0.03, 0.16 + (i === 2 ? 0.08 : 0), 6), mT, neck, Math.sin(a) * 0.15, 0.36, Math.cos(a) * 0.15); }
  const arm = (s, a, b, c) => {
    const sh = (J[a] = joint(chest, s * 0.3, 0.3, 0));
    mk(ball(0.135), mA, sh, s * 0.02, 0.03, 0).scale.set(1.12, 0.85, 1.15);
    mk(ball(0.1), mA, sh, s * 0.05, -0.07, 0).scale.set(1, 0.7, 1.15);
    mk(limb(0.07, 0.06, 0.27), mU, sh);
    mk(new T.CylinderGeometry(0.078, 0.078, 0.03, SEG), mT, sh, 0, -0.15, 0);
    const el = (J[b] = joint(sh, 0, -0.27, 0));
    mk(limb(0.062, 0.088, 0.25), mA, el); mk(ball(0.066), mT, el, 0, 0, -0.015);
    mk(new T.CylinderGeometry(0.098, 0.098, 0.03, SEG), mT, el, 0, -0.235, 0);
    const ha = (J[c] = joint(el, 0, -0.25, 0));
    mk(new T.BoxGeometry(0.085, 0.1, 0.1), mD, ha, 0, -0.045, 0);
    return ha;
  };
  arm(1, 'shL', 'elL', 'haL'); const haR = arm(-1, 'shR', 'elR', 'haR');
  const leg = (s, a, b, c) => {
    const th = (J[a] = joint(hips, s * 0.105, -0.03, 0));
    mk(limb(0.095, 0.075, 0.42), mU, th); mk(new T.BoxGeometry(0.14, 0.22, 0.07), mA, th, 0, -0.16, 0.06);
    const kn = (J[b] = joint(th, 0, -0.42, 0));
    mk(ball(0.072), mT, kn, 0, 0, 0.035); mk(limb(0.078, 0.06, 0.38), mA, kn);
    mk(new T.BoxGeometry(0.03, 0.3, 0.03), mT, kn, 0, -0.2, 0.062);
    const an = (J[c] = joint(kn, 0, -0.38, 0));
    mk(new T.BoxGeometry(0.115, 0.09, 0.27), mD, an, 0, -0.025, 0.055); mk(new T.BoxGeometry(0.12, 0.06, 0.09), mT, an, 0, -0.04, 0.16);
  };
  leg(1, 'thL', 'knL', 'anL'); leg(-1, 'thR', 'knR', 'anR');
  // weapon: blade along +Z of the hand, edge in the YZ plane
  const w = joint(haR, 0, -0.05, 0), len = o.blade || 0.92;
  mk(new T.CylinderGeometry(0.02, 0.02, 0.24, 8), mD, w, 0, 0, -0.01).rotation.x = PI / 2;
  mk(ball(0.036), mT, w, 0, 0, -0.14);
  if (o.weapon === 'none') { /* unarmed */ } else if (o.weapon === 'maul') {
    mk(new T.CylinderGeometry(0.028, 0.028, len, 8), mD, w, 0, 0, len / 2).rotation.x = PI / 2;
    mk(new T.BoxGeometry(0.12, 0.46, 0.3), mS, w, 0, 0, len); mk(new T.BoxGeometry(0.14, 0.1, 0.34), mT, w, 0, 0, len);
  } else if (o.weapon === 'glaive') {
    mk(new T.CylinderGeometry(0.022, 0.022, len, 8), mD, w, 0, 0, len / 2 - 0.25).rotation.x = PI / 2;
    mk(new T.BoxGeometry(0.02, 0.16, 0.7), mS, w, 0, 0.03, len + 0.05);
    const tp = mk(new T.CylinderGeometry(0, 0.08, 0.26, 4), mS, w, 0, 0.03, len + 0.53); tp.rotation.x = PI / 2; tp.scale.set(0.14, 1, 1);
    mk(ball(0.05), mT, w, 0, 0, len - 0.3);
  } else {
    mk(new T.BoxGeometry(0.04, 0.26, 0.045), mT, w, 0, 0, 0.115);
    mk(ball(0.032), mT, w, 0, 0.14, 0.115); mk(ball(0.032), mT, w, 0, -0.14, 0.115);
    mk(new T.BoxGeometry(0.018, 0.062, len), mS, w, 0, 0, 0.13 + len / 2);
    mk(new T.BoxGeometry(0.022, 0.02, len * 0.62), mD, w, 0, 0, 0.15 + len * 0.31);
    const tp = mk(new T.CylinderGeometry(0, 0.031, 0.11, 4), mS, w, 0, 0, 0.13 + len + 0.055); tp.rotation.x = PI / 2; tp.scale.set(0.3, 1, 1);
  }
  const reach = o.weapon === 'glaive' ? len + 0.7 : 0.13 + len + 0.1;
  const wBase = joint(w, 0, 0, o.weapon === 'glaive' ? len - 0.3 : 0.2), wTip = joint(w, 0, 0, reach);
  // shield
  J.shield = joint(J.elL, 0.075, -0.11, 0);
  if (o.shield != null) {
    const sp = new T.Shape(); sp.moveTo(-0.22, 0.27); sp.lineTo(0.22, 0.27); sp.lineTo(0.22, -0.04); sp.lineTo(0, -0.35); sp.lineTo(-0.22, -0.04); sp.closePath();
    const sm = M(0xffffff, { map: shields[o.shield] });
    // Face out from the forearm, with the point running across the arm (not along it), so a
    // raised guard holds the shield point-down in front of the body.
    const sg = new T.ExtrudeGeometry(sp, { depth: 0.035, bevelEnabled: false }); sg.rotateY(PI / 2); sg.rotateX(PI / 2);
    mk(sg, sm, J.shield);
  }
  // cape: a short chain that swings with speed
  let cape = null;
  if (o.cape) {
    const mC = M(o.cape, { side: T.DoubleSide }); cape = [];
    let p = joint(chest, 0, 0.33, -0.15); mk(new T.BoxGeometry(0.4, 0.04, 0.03), mT, p, 0, -0.01, 0);
    for (let i = 0; i < 3; i++) {
      const wd = 0.44 + i * 0.04; mk(new T.BoxGeometry(wd, 0.3, 0.02), mC, p, 0, -0.15, 0); cape.push(p);
      if (i === 2) mk(new T.BoxGeometry(wd, 0.035, 0.024), mT, p, 0, -0.285, 0); else p = joint(p, 0, -0.3, 0);
    }
  }
  return { root, J, mats, wBase, wTip, bladeMat: mS, cape, eye: mEye };
}
