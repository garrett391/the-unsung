import * as T from 'three';
import { PI } from '../core/util.js';
import { toon, shieldTex, tabardTex, plateTex, mailTex, clothTex } from '../gfx/materials.js';

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
  const mA = M(o.armor, { map: plateTex }), mT = M(o.trim), mU = M(o.under, { map: mailTex }), mUF = M(o.under, { map: mailTex, side: T.DoubleSide }), mD = M(o.dark || 0x24252d), mS = M(o.steel || 0xdfe3ea);
  const mEye = new T.MeshBasicMaterial({ color: o.eye || 0x08080c });
  // The Usurper's glass (crown, growths, blade): unlit and just bright enough to bloom. The blade has its own material because blood tints it.
  const glass = () => new T.MeshBasicMaterial({ color: new T.Color(0.3, 0.82, 0.74) }), mGl = o.glass ? glass() : null, mBlade = o.glass ? glass() : mS;
  const root = new T.Group(), J = {};
  const hips = (J.hips = joint(root, 0, HIP, 0));
  mk(new T.BoxGeometry(0.33, 0.18, 0.22), mU, hips, 0, -0.03, 0);
  const mF = M(o.armor, { side: T.DoubleSide, map: plateTex });
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
  mk(new T.CylinderGeometry(0.212, 0.203, 0.045, SEG), mT, chest, 0, 0.03, 0).scale.z = 0.8; // waist band of the breastplate
  if (!o.tabard && !o.cape) mk(new T.BoxGeometry(0.03, 0.27, 0.03), mT, chest, 0, 0.18, -0.2).rotation.x = -0.18; // backplate ridge
  // belt pouch, and a scabbard on the left hip for sword-bearers
  mk(new T.BoxGeometry(0.1, 0.1, 0.06), mD, hips, -0.17, -0.05, -0.19); mk(new T.BoxGeometry(0.105, 0.035, 0.065), mT, hips, -0.17, -0.005, -0.19);
  if (!o.weapon) {
    const sc = joint(hips, 0.255, 0.0, -0.02); sc.rotation.set(-0.62, 0.1, 0);
    mk(new T.BoxGeometry(0.03, 0.075, 0.66), mD, sc, 0, 0, -0.3); mk(new T.BoxGeometry(0.036, 0.085, 0.07), mT, sc, 0, 0, 0.0); mk(new T.BoxGeometry(0.036, 0.085, 0.08), mT, sc, 0, 0, -0.6);
  }
  if (!o.tabard) {
    mk(new T.BoxGeometry(0.1, 0.1, 0.03), mT, chest, 0, 0.22, 0.215).rotation.z = PI / 4;
    mk(new T.BoxGeometry(0.028, 0.28, 0.03), mT, chest, 0, 0.17, 0.2).rotation.x = 0.18;
  }
  if (o.tabard) {
    // White tabard front and back, a leather belt with a brass buckle, and a strap across the chest.
    const mTop = M(0xffffff, { map: tabardTex('top'), alphaTest: 0.5, side: T.DoubleSide }), mLow = M(0xffffff, { map: tabardTex('low'), alphaTest: 0.5, side: T.DoubleSide }), mMid = M(0xffffff, { map: tabardTex('mid'), alphaTest: 0.5, side: T.DoubleSide });
    const mLeather = M(0x6a4428), mBrass = M(0xd9b24a);
    for (const sd of [1, -1]) {
      const tp = mk(new T.PlaneGeometry(0.3, 0.4), mTop, chest, 0, 0.17, sd * 0.214); tp.rotation.set(-sd * 0.19, sd < 0 ? PI : 0, 0);
      const lw = mk(new T.PlaneGeometry(0.3, 0.46), mLow, hips, 0, -0.19, sd * 0.248); lw.rotation.set(sd * 0.14, sd < 0 ? PI : 0, 0);
      const md = mk(new T.PlaneGeometry(0.3, 0.26), mMid, spine, 0, 0.1, sd * 0.172); md.rotation.y = sd < 0 ? PI : 0;
    }
    const belt = mk(new T.CylinderGeometry(0.236, 0.236, 0.055, SEG), mLeather, hips, 0, 0.055, 0); belt.scale.z = 0.82;
    mk(new T.BoxGeometry(0.075, 0.06, 0.02), mBrass, hips, 0, 0.055, 0.2);
    const strap = mk(new T.BoxGeometry(0.045, 0.56, 0.02), mLeather, chest, 0.01, 0.17, 0.226); strap.rotation.set(-0.19, 0, 0.62);
    const back = mk(new T.BoxGeometry(0.045, 0.56, 0.02), mLeather, chest, 0.01, 0.17, -0.226); back.rotation.set(0.19, 0, -0.62);
  }
  // helm
  const neck = (J.neck = joint(chest, 0, 0.4, 0));
  mk(new T.CylinderGeometry(o.helm === 'open' ? 0.125 : 0.158, 0.2, 0.075, SEG, 1, true), mUF, neck, 0, 0.0, 0).scale.z = 0.92; // mail collar
  if (o.helm === 'open' || o.helm === 'none') {
    // Open-faced helm with a brim and cheek plates: the face shows. 'none' is a bare head.
    const mSkin = M(o.skin || 0xd9a77e), mHair = M(o.hair || 0x7a5228);
    mk(new T.CylinderGeometry(0.1, 0.13, 0.1, SEG), mU, neck, 0, 0.03, 0);
    const face = mk(ball(0.118), mSkin, neck, 0, 0.15, 0.02); face.scale.set(0.95, 1.12, 1);
    for (const sd of [-1, 1]) mk(new T.BoxGeometry(0.026, 0.02, 0.012), mEye, neck, sd * 0.042, 0.165, 0.128);
    mk(new T.BoxGeometry(0.05, 0.012, 0.012), M(0x8a5a40), neck, 0, 0.098, 0.124);
    mk(new T.BoxGeometry(0.024, 0.045, 0.03), mSkin, neck, 0, 0.135, 0.135).rotation.x = -0.25;
    for (const sd of [-1, 1]) mk(new T.BoxGeometry(0.042, 0.01, 0.012), mHair, neck, sd * 0.042, 0.186, 0.127).rotation.z = -sd * 0.12;
    for (const sd of [-1, 1]) mk(new T.BoxGeometry(0.035, 0.16, 0.06), mHair, neck, sd * 0.12, 0.13, -0.01);
    if (o.helm === 'none') {
      const cap = mk(new T.SphereGeometry(0.126, 12, 6, 0, PI * 2, 0, PI / 1.9), mHair, neck, 0, 0.165, -0.005); cap.rotation.x = -0.25;
      if (o.bandage) { const bd = mk(new T.CylinderGeometry(0.124, 0.124, 0.05, SEG), M(0xd8d0bc), neck, 0, 0.215, 0.012); bd.rotation.set(0.1, 0, 0.16); }
    } else {
    const dome = mk(new T.SphereGeometry(0.168, SEG, 8, 0, PI * 2, 0, PI / 2), mA, neck, 0, 0.215, -0.01); dome.scale.y = 0.85;
    const brim = mk(new T.CylinderGeometry(0.2, 0.235, 0.025, SEG), mA, neck, 0, 0.215, 0.015); brim.rotation.x = 0.16;
    mk(new T.CylinderGeometry(0.172, 0.172, 0.03, SEG), mT, neck, 0, 0.235, -0.01);
    mk(new T.BoxGeometry(0.02, 0.06, 0.24), mT, neck, 0, 0.36, -0.01);
    for (const sd of [-1, 1]) { const ck = mk(new T.BoxGeometry(0.03, 0.15, 0.13), mA, neck, sd * 0.155, 0.12, 0.02); ck.rotation.z = sd * 0.12; }
    mk(new T.BoxGeometry(0.26, 0.12, 0.05), mA, neck, 0, 0.13, -0.135);
    }
  } else {
    mk(new T.CylinderGeometry(0.15, 0.16, 0.24, SEG), mA, neck, 0, 0.135, 0);
    const dome = mk(new T.SphereGeometry(0.15, SEG, 8, 0, PI * 2, 0, PI / 2), mA, neck, 0, 0.255, 0); dome.scale.y = 0.75;
    mk(new T.CylinderGeometry(0.156, 0.156, 0.03, SEG), mT, neck, 0, 0.25, 0);
    mk(new T.CylinderGeometry(0.157, 0.157, 0.042, 10, 1, true, -0.95, 1.9), mEye, neck, 0, 0.165, 0);
    mk(new T.BoxGeometry(0.036, 0.19, 0.03), mT, neck, 0, 0.11, 0.15);
    mk(new T.BoxGeometry(0.22, 0.09, 0.04), mA, neck, 0, 0.03, -0.125);
    // a comb over the crown, a brow plate above the slit and breaths cut in the cheeks
    const comb = mk(new T.TorusGeometry(0.152, 0.013, 4, 10, PI), mT, neck, 0, 0.255, 0); comb.rotation.y = PI / 2; comb.scale.y = 0.78;
    mk(new T.CylinderGeometry(0.168, 0.162, 0.03, 10, 1, true, -1.05, 2.1), mF, neck, 0, 0.2, 0);
    for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) mk(new T.BoxGeometry(0.012, 0.05, 0.014), mD, neck, sd * (0.075 + k * 0.035), 0.075, 0.14 - k * 0.022);
  }
  if (o.plume && o.helm === 'open') {
    // a tall feathered crest rising from the crown and sweeping back
    const mP = M(o.plume);
    mk(new T.CylinderGeometry(0.03, 0.04, 0.08, 8), mT, neck, 0, 0.39, -0.03);
    const tuft = (y, z, rx, w, h) => { const m = mk(ball(1), mP, neck, 0, y, z); m.scale.set(w, h, 0.07); m.rotation.x = rx; };
    tuft(0.47, 0.0, -0.3, 0.085, 0.1); tuft(0.5, -0.1, -0.8, 0.1, 0.12); tuft(0.46, -0.21, -1.2, 0.09, 0.11); tuft(0.39, -0.29, -1.5, 0.07, 0.09);
  } else if (o.plume) {
    const mP = M(o.plume);
    mk(new T.BoxGeometry(0.05, 0.11, 0.22), mP, neck, 0, 0.4, -0.02);
    mk(new T.BoxGeometry(0.05, 0.2, 0.14), mP, neck, 0, 0.34, -0.2).rotation.x = -0.5;
    mk(new T.BoxGeometry(0.045, 0.26, 0.09), mP, neck, 0, 0.15, -0.29).rotation.x = -0.2;
  }
  if (o.horns) for (const s of [-1, 1]) mk(new T.ConeGeometry(0.045, 0.26, 8), mT, neck, s * 0.2, 0.3, 0).rotation.z = -s * 1.0;
  if (o.crown === 'glass') { // a ring of glass shards on an iron band, some broken short
    mk(new T.CylinderGeometry(0.164, 0.164, 0.045, SEG), mT, neck, 0, 0.3, 0);
    [0.3, 0.1, 0.22, 0.16, 0.06, 0.2, 0.26, 0.12, 0.34].forEach((h, i, hs) => {
      const a = (i / hs.length) * PI * 2 - 0.35, m = mk(new T.ConeGeometry(0.024, h * 1.15, 4), mGl, neck, Math.sin(a) * 0.155, 0.31 + h / 2, Math.cos(a) * 0.155); m.rotation.set(Math.cos(a) * 0.07, 0, -Math.sin(a) * 0.07);
    });
  } else if (o.crown) for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.5; mk(new T.ConeGeometry(0.03, 0.16 + (i === 2 ? 0.08 : 0), 6), mT, neck, Math.sin(a) * 0.15, 0.36, Math.cos(a) * 0.15); }
  // o.legs thickens the leg armor and o.pads scales the pauldrons: proportions that put the
  // visual weight lower on the body.
  const LG = o.legs || 1, PD = o.pads || 1;
  const arm = (s, a, b, c) => {
    const sh = (J[a] = joint(chest, s * 0.3, 0.3, 0));
    mk(ball(0.135), mA, sh, s * 0.02, 0.03, 0).scale.set(1.12 * PD, 0.85 * PD, 1.15 * PD);
    mk(ball(0.1), mA, sh, s * 0.05, -0.07, 0).scale.set(PD, 0.7 * PD, 1.15 * PD);
    if (o.lames) { // stacked plates stepping down the upper arm
      mk(new T.SphereGeometry(0.15, SEG, 6, 0, PI * 2, 0, PI / 2.4), mA, sh, s * 0.035, 0.0, 0).scale.set(1.15, 0.8, 1.2);
      mk(new T.CylinderGeometry(0.105, 0.125, 0.06, SEG, 1, true), mA, sh, s * 0.03, -0.08, 0).scale.z = 1.15;
      mk(new T.CylinderGeometry(0.095, 0.112, 0.05, SEG, 1, true), mA, sh, s * 0.025, -0.13, 0).scale.z = 1.1;
    }
    mk(limb(0.07, 0.06, 0.27), mU, sh);
    mk(new T.CylinderGeometry(0.078, 0.078, 0.03, SEG), mT, sh, 0, -0.15, 0);
    const el = (J[b] = joint(sh, 0, -0.27, 0));
    mk(limb(0.062, 0.088, 0.25), mA, el); mk(ball(0.066), mT, el, 0, 0, -0.015);
    mk(new T.CylinderGeometry(0.098, 0.098, 0.03, SEG), mT, el, 0, -0.235, 0);
    mk(new T.BoxGeometry(0.02, 0.12, 0.1), mA, el, s * 0.072, 0.0, -0.02).rotation.z = s * 0.22; // couter wing
    mk(new T.CylinderGeometry(0.112, 0.092, 0.085, SEG, 1, true), mF, el, 0, -0.175, 0); // flared gauntlet cuff
    const ha = (J[c] = joint(el, 0, -0.25, 0));
    // a closed gauntlet: wrist, palm, curled fingers and a thumb (it used to be one block)
    mk(new T.CylinderGeometry(0.05, 0.046, 0.03, 10), mD, ha, 0, -0.012, 0); mk(new T.BoxGeometry(0.07, 0.06, 0.092), mD, ha, 0, -0.05, 0);
    mk(new T.BoxGeometry(0.066, 0.05, 0.088), mD, ha, -s * 0.012, -0.088, 0.004).rotation.z = -s * 0.45; mk(new T.BoxGeometry(0.03, 0.055, 0.032), mD, ha, -s * 0.02, -0.06, 0.058).rotation.x = -0.5;
    mk(new T.BoxGeometry(0.022, 0.085, 0.108), mA, ha, s * 0.05, -0.04, 0); mk(new T.BoxGeometry(0.03, 0.02, 0.11), mT, ha, s * 0.05, -0.085, 0); // back-of-hand plate and knuckles
    return ha;
  };
  arm(1, 'shL', 'elL', 'haL'); const haR = arm(-1, 'shR', 'elR', 'haR');
  if (o.glass) { // glass growing out of the left shoulder and the back, and a wound across the breastplate
    for (const [x, y, z, h, rx, rz] of [[0.05, 0.17, 0, 0.3, 0, -0.3], [0.1, 0.1, 0.04, 0.17, 0.3, -0.75], [0.03, 0.12, -0.07, 0.2, -0.45, -0.15]]) mk(new T.ConeGeometry(h * 0.16, h, 4), mGl, J.shL, x, y, z).rotation.set(rx, 0, rz);
    const mW = M(0x3d0a0d); mk(new T.BoxGeometry(0.26, 0.035, 0.02), mW, chest, -0.02, 0.2, 0.222).rotation.set(0.18, 0, 0.75); mk(new T.BoxGeometry(0.05, 0.12, 0.02), mW, chest, -0.09, 0.08, 0.2).rotation.z = 0.2;
  }
  if (o.skirt) { // long cloth panels hanging from the belt, front and back
    const mK = M(o.skirt, { side: T.DoubleSide, map: clothTex });
    for (const sd of [1, -1]) { mk(new T.BoxGeometry(0.26, 0.52, 0.016), mK, hips, 0, -0.38, sd * 0.235).rotation.x = -sd * 0.1; mk(new T.BoxGeometry(0.27, 0.03, 0.02), mT, hips, 0, -0.63, sd * 0.262); }
  }
  const leg = (s, a, b, c) => {
    const th = (J[a] = joint(hips, s * 0.105, -0.03, 0));
    mk(limb(0.095 * LG, 0.075 * LG, 0.42), mU, th); mk(new T.BoxGeometry(0.14 * LG, 0.22, 0.07 * LG), mA, th, 0, -0.16, 0.06 * LG);
    const kn = (J[b] = joint(th, 0, -0.42, 0));
    mk(ball(0.072 * LG), mT, kn, 0, 0, 0.035 * LG); mk(limb(0.078 * LG, 0.06 * LG, 0.38), mA, kn);
    mk(new T.BoxGeometry(0.03, 0.3, 0.03), mT, kn, 0, -0.2, 0.062 * LG);
    mk(ball(0.07 * LG), mA, kn, 0, -0.13, -0.028 * LG).scale.set(0.95, 1.6, 0.85); // calf
    mk(new T.CylinderGeometry(0.1 * LG, 0.1 * LG, 0.028, SEG), mT, th, 0, -0.05, 0); mk(new T.BoxGeometry(0.146 * LG, 0.03, 0.075 * LG), mT, th, 0, -0.265, 0.06 * LG); // thigh strap, cuisse edge
    if (o.knees) { // a knee cop with a swept wing on the outside, over a tall greave
      mk(ball(0.085 * LG), mA, kn, 0, 0.01, 0.05).scale.set(1.15, 1.05, 0.8);
      const wg = mk(new T.BoxGeometry(0.02, 0.17, 0.11), mA, kn, s * 0.085 * LG, 0.05, 0.02); wg.rotation.z = -s * 0.45; wg.rotation.x = -0.15;
      mk(new T.CylinderGeometry(0.095 * LG, 0.088 * LG, 0.12, SEG, 1, true), mA, kn, 0, -0.08, 0.008);
    }
    const an = (J[c] = joint(kn, 0, -0.38, 0));
    if (o.knees) mk(new T.CylinderGeometry(0.085 * LG, 0.095 * LG, 0.05, SEG), mA, an, 0, 0.03, 0.01);
    mk(new T.BoxGeometry(0.115 * LG, 0.09 * LG, 0.27 * LG), mD, an, 0, -0.025, 0.055); mk(new T.BoxGeometry(0.1 * LG, 0.03, 0.15 * LG), mA, an, 0, 0.022 * LG, 0.06).rotation.x = 0.2; // sabaton plate mk(new T.BoxGeometry(0.12 * LG, 0.06 * LG, 0.09), mT, an, 0, -0.04, 0.16 * LG);
  };
  leg(1, 'thL', 'knL', 'anL'); leg(-1, 'thR', 'knR', 'anR');
  // weapon: blade along +Z of the hand, edge in the YZ plane
  const w = joint(haR, 0, -0.05, 0), len = o.blade || 0.92;
  if (o.weapon !== 'none') {
    mk(new T.CylinderGeometry(0.02, 0.02, 0.24, 8), mD, w, 0, 0, -0.01).rotation.x = PI / 2;
    mk(ball(0.036), mT, w, 0, 0, -0.14);
    for (const z of [-0.07, 0.0]) mk(new T.CylinderGeometry(0.024, 0.024, 0.012, 8), mT, w, 0, 0, z).rotation.x = PI / 2; // grip bindings
  }
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
    mk(new T.BoxGeometry(0.018, 0.062, len), mBlade, w, 0, 0, 0.13 + len / 2);
    mk(new T.BoxGeometry(0.022, 0.02, len * 0.62), mD, w, 0, 0, 0.15 + len * 0.31);
    const tp = mk(new T.CylinderGeometry(0, 0.031, 0.11, 4), mBlade, w, 0, 0, 0.13 + len + 0.055); tp.rotation.x = PI / 2; tp.scale.set(0.3, 1, 1);
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
    // a metal rim behind the face, and a boss on the plain iron shield
    const rp = new T.Shape(), k = 1.09; rp.moveTo(-0.22 * k, 0.27 * k + 0.004); rp.lineTo(0.22 * k, 0.27 * k + 0.004); rp.lineTo(0.22 * k, -0.04 * k); rp.lineTo(0, -0.35 * k); rp.lineTo(-0.22 * k, -0.04 * k); rp.closePath();
    const rg = new T.ExtrudeGeometry(rp, { depth: 0.021, bevelEnabled: false }); rg.translate(0, 0, 0.007); rg.rotateY(PI / 2); rg.rotateX(PI / 2);
    mk(rg, o.shield === 1 ? mD : mT, J.shield);
    if (o.shield === 1) { const c = new T.Box3().setFromBufferAttribute(sg.attributes.position).getCenter(new T.Vector3()); mk(ball(0.065), mS, J.shield, c.x, c.y, c.z).scale.x = 0.55; }
  }
  // cape: a short chain that swings with speed
  let cape = null;
  if (o.cape) {
    const mC = M(o.cape, { side: T.DoubleSide, map: clothTex }); cape = [];
    let p = joint(chest, 0, 0.33, -0.15); mk(new T.BoxGeometry(0.4, 0.04, 0.03), mT, p, 0, -0.01, 0);
    const n = o.capeLen || 3; // o.tatter: the last length hangs in torn strips, with no hem
    for (let i = 0; i < n; i++) {
      const wd = 0.44 + Math.min(i, 3) * 0.04, last = i === n - 1; cape.push(p);
      if (last && o.tatter) [0.3, 0.12, 0.24, 0.07, 0.2].forEach((h, k) => mk(new T.BoxGeometry(wd / 5 - 0.01, h, 0.02), mC, p, (k - 2) * (wd / 5), -h / 2, 0));
      else mk(new T.BoxGeometry(wd, 0.3, 0.02), mC, p, 0, -0.15, 0);
      if (last) { if (!o.tatter) mk(new T.BoxGeometry(wd, 0.035, 0.024), mT, p, 0, -0.285, 0); } else p = joint(p, 0, -0.3, 0);
    }
  }
  return { root, J, mats, wBase, wTip, bladeMat: o.weapon ? mS : mBlade, cape, eye: mEye };
}
