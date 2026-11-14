import * as T from 'three';
import { PI } from '../core/util.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, shieldTex, tabardTex, plateTex, mailTex, clothTex } from '../gfx/materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural armored humanoid. Faces +Z; the sword hand is at -X.
// Joints are plain groups so the animation system only writes rotations.
export const HIP = 0.9;
export const JN = ['hips', 'spine', 'chest', 'neck', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'thL', 'knL', 'anL', 'thR', 'knR', 'anR', 'shield'];
export const JI = {}; JN.forEach((n, i) => (JI[n] = i));
export const NJ = JN.length, PL = NJ * 3 + 3;

const SEG = 20;
// Shapes are shared between figures (nothing disposes them), so a raider spawning mid-fight
// builds no geometry of its own for these.
const GC = new Map(), memo = (k, f) => { let g = GC.get(k); if (!g) GC.set(k, (g = f())); return g; };
// A box with its edges and corners rounded off: hands, feet, plates. `r` defaults to a third of the thinnest side.
const rbox = (w, h, d, r) => memo(`b${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r == null ? Math.min(w, h, d) * 0.33 : r));
// A flat plate with rounded corners and a soft edge (tassets, cheek plates, wings), centred.
const slab = (w, h, t, cr) => memo(`p${w},${h},${t},${cr}`, () => {
  const sp = new T.Shape(), x = w / 2, y = h / 2, c = Math.min(cr == null ? Math.min(w, h) * 0.3 : cr, x, y);
  sp.moveTo(-x + c, -y); sp.lineTo(x - c, -y); sp.quadraticCurveTo(x, -y, x, -y + c); sp.lineTo(x, y - c); sp.quadraticCurveTo(x, y, x - c, y); sp.lineTo(-x + c, y); sp.quadraticCurveTo(-x, y, -x, y - c); sp.lineTo(-x, -y + c); sp.quadraticCurveTo(-x, -y, -x + c, -y);
  const b = Math.min(t * 0.3, 0.008), g = new T.ExtrudeGeometry(sp, { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 5 }); g.translate(0, 0, -t / 2 + b); return g;
});
// Hanging cloth: a panel bowed across its width (edges curling toward the body), wider at the
// foot than the head, hung from its top edge. Smooth normals, so it shades as one soft sheet.
const drape = (w0, w1, h, bow) => memo(`d${w0},${w1},${h},${bow}`, () => {
  const g = new T.PlaneGeometry(1, h, 8, 3), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i) * 2, v = 0.5 - p.getY(i) / h; p.setXYZ(i, p.getX(i) * (w0 + (w1 - w0) * v), p.getY(i) - h / 2, bow * u * u * (0.6 + 0.4 * v)); }
  g.computeVertexNormals(); return g;
});
// A sword blade: diamond in section, tapering, with the point built in. Flat-shaded, as steel is.
function bladeGeo(len, w, t, tip) {
  const w1 = w * 0.7, t1 = t * 0.75, P = [[0, w / 2, 0], [t / 2, 0, 0], [0, -w / 2, 0], [-t / 2, 0, 0], [0, w1 / 2, len], [t1 / 2, 0, len], [0, -w1 / 2, len], [-t1 / 2, 0, len], [0, 0, len + tip]], pos = [];
  const tri = (a, b, c) => { // wind each face outward from the blade's axis
    const A = new T.Vector3(...P[a]), B = new T.Vector3(...P[b]), C = new T.Vector3(...P[c]), n = B.clone().sub(A).cross(C.clone().sub(A)), m = A.clone().add(B).add(C).multiplyScalar(1 / 3); m.z = 0;
    for (const q of n.dot(m) >= 0 ? [A, B, C] : [A, C, B]) pos.push(q.x, q.y, q.z);
  };
  for (let k = 0; k < 4; k++) { const a = k, b = (k + 1) % 4; tri(a, b, 4 + b); tri(a, 4 + b, 4 + a); tri(4 + a, 4 + b, 8); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); g.computeVertexNormals(); return g;
}
const shields = [0, 1, 2].map(shieldTex);
function mk(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = !!mat.isMeshToonMaterial; parent.add(m); return m;
}
function joint(parent, x, y, z) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
// An arm or leg segment hanging from its joint: a slight swell along its length and rounded ends, not a straight tube.
function limb(rt, rb, h) {
  return memo(`l${rt},${rb},${h}`, () => {
    const pts = [], n = 12;
    for (let i = 0; i <= n; i++) { const u = i / n, e = Math.min(u, 1 - u) / 0.1, cap = e < 1 ? 0.55 + 0.45 * Math.sqrt(1 - (1 - e) * (1 - e)) : 1; pts.push(new T.Vector2((rb + (rt - rb) * u) * (1 + 0.1 * Math.sin(PI * u)) * cap, -h + h * u)); }
    return new T.LatheGeometry(pts, SEG);
  });
}
const ball = (r) => memo('s' + r, () => new T.SphereGeometry(r, 16, 12));

// A figure that will never move again (the dead in the halls): built, set in `pose`, and merged
// into one mesh per material, so a body costs a handful of draw calls instead of a hundred and fifty.
export function bakeFigure(look, pose, scale = 1) {
  const rig = buildHumanoid(look), J = rig.J, by = new Map(), out = new T.Group();
  for (let i = 0; i < NJ; i++) J[JN[i]].rotation.set(pose[i * 3], pose[i * 3 + 1], pose[i * 3 + 2]);
  J.hips.position.set(pose[NJ * 3], HIP + pose[NJ * 3 + 1], pose[NJ * 3 + 2]); rig.root.scale.setScalar(scale); rig.root.updateMatrixWorld(true);
  rig.root.traverse((m) => {
    if (!m.isMesh) return; const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.applyMatrix4(m.matrixWorld); if (!by.has(m.material)) by.set(m.material, []); by.get(m.material).push(g);
  });
  for (const [mat, gs] of by) { const mesh = new T.Mesh(mergeGeometries(gs), mat); mesh.castShadow = !!mat.isMeshToonMaterial; mesh.receiveShadow = true; out.add(mesh); }
  return out;
}

export function buildHumanoid(o) {
  const mats = [];
  const M = (c, x) => { const m = toon(c, { rim: o.rim == null ? 0x1c2a55 : o.rim, ...(x || {}) }); mats.push(m); return m; };
  const plate = o.plain ? clothTex : plateTex, mail = o.plain ? clothTex : mailTex; // o.plain: quilted cloth and leather, not plate over mail
  const mA = M(o.armor, { map: plate }), mT = M(o.trim), mU = M(o.under, { map: mail }), mUF = M(o.under, { map: mail, side: T.DoubleSide }), mD = M(o.dark || 0x24252d), mS = M(o.steel || 0xdfe3ea);
  const mEye = new T.MeshBasicMaterial({ color: o.eye || 0x08080c });
  const PLN = !!o.plain, bare = PLN || o.helm === 'open' || o.helm === 'none' || o.helm === 'wrap', mSkin = bare ? M(o.skin || 0xd9a77e) : null, mHair = bare ? M(o.hair || 0x7a5228) : null;
  // The Usurper's glass (crown, growths, blade): unlit and just bright enough to bloom. The blade has its own material because blood tints it.
  const glass = () => new T.MeshBasicMaterial({ color: new T.Color(0.3, 0.82, 0.74) }), mGl = o.glass ? glass() : null, mBlade = o.glass ? glass() : mS;
  const root = new T.Group(), J = {};
  const hips = (J.hips = joint(root, 0, HIP, 0));
  mk(rbox(0.33, 0.18, 0.22, 0.06), mU, hips, 0, -0.03, 0);
  const mF = M(o.armor, { side: T.DoubleSide, map: plate });
  if (PLN) mk(memo('tunic', () => new T.LatheGeometry(new T.SplineCurve([[0.2, 0.06], [0.215, -0.04], [0.245, -0.16], [0.262, -0.25]].map(([a, b]) => new T.Vector2(a, b))).getPoints(8), SEG)), mF, hips, 0, 0, 0).scale.z = 0.8; // the skirt of a tunic, flaring to mid-thigh
  else mk(new T.CylinderGeometry(0.215, 0.3, 0.27, SEG, 1, true), mF, hips, 0, -0.1, 0).scale.z = 0.8;
  mk(new T.CylinderGeometry(PLN ? 0.212 : 0.225, PLN ? 0.212 : 0.225, PLN ? 0.045 : 0.06, SEG), mT, hips, 0, 0.05, 0).scale.z = 0.8;
  mk(PLN ? rbox(0.05, 0.05, 0.02, 0.008) : new T.BoxGeometry(0.08, 0.08, 0.04), PLN ? mD : mT, hips, 0, 0.05, PLN ? 0.172 : 0.18);
  if (!PLN) for (const sd of [-1, 1]) {
    mk(slab(0.16, 0.24, 0.035, 0.05), mA, hips, sd * 0.125, -0.2, 0.185).rotation.x = -0.2; // tassets, rounded at the corners
    mk(slab(0.13, 0.03, 0.04, 0.012), mT, hips, sd * 0.125, -0.27, 0.203).rotation.x = -0.2;
    mk(slab(0.16, 0.22, 0.035, 0.05), mA, hips, sd * 0.125, -0.2, -0.185).rotation.x = 0.2;
  }
  const spine = (J.spine = joint(hips, 0, 0.07, 0));
  mk(new T.CylinderGeometry(PLN ? 0.19 : 0.2, PLN ? 0.196 : 0.2, 0.2, SEG), PLN ? mA : mU, spine, 0, 0.1, 0).scale.z = 0.74;
  const chest = (J.chest = joint(spine, 0, 0.2, 0));
  // breastplate: turned on a curve, so it swells over the ribs and draws in to the waist and collar
  if (PLN) mk(memo('chestP', () => new T.LatheGeometry(new T.SplineCurve([[0.188, 0], [0.194, 0.07], [0.22, 0.19], [0.236, 0.275], [0.214, 0.335], [0.15, 0.376]].map(([a, b]) => new T.Vector2(a, b))).getPoints(12), SEG)), mA, chest, 0, 0, 0).scale.z = 0.78; // a man's chest under cloth, not a breastplate: narrower, with the shoulders set in
  else mk(memo('chest', () => new T.LatheGeometry(new T.SplineCurve([[0.196, 0], [0.214, 0.06], [0.262, 0.17], [0.288, 0.27], [0.268, 0.335], [0.2, 0.372]].map(([a, b]) => new T.Vector2(a, b))).getPoints(12), SEG)), mA, chest, 0, 0, 0).scale.z = 0.8;
  mk(new T.CylinderGeometry(PLN ? 0.085 : 0.12, PLN ? 0.165 : 0.21, PLN ? 0.06 : 0.07, SEG), PLN ? mA : mT, chest, 0, PLN ? 0.38 : 0.385, 0).scale.z = 0.85; // the yoke: sloping shoulders up to the collar
  if (!PLN) mk(new T.CylinderGeometry(0.212, 0.203, 0.045, SEG), mT, chest, 0, 0.03, 0).scale.z = 0.8; // waist band of the breastplate
  if (!o.tabard && !o.cape && !o.plain) mk(new T.BoxGeometry(0.03, 0.27, 0.03), mT, chest, 0, 0.18, -0.2).rotation.x = -0.18; // backplate ridge
  // belt pouch, and a scabbard on the left hip for sword-bearers
  mk(rbox(0.1, 0.1, 0.06, 0.02), mD, hips, -0.17, -0.05, -0.19); mk(rbox(0.105, 0.035, 0.065, 0.012), mT, hips, -0.17, -0.005, -0.19);
  if (!o.weapon) {
    const sc = joint(hips, 0.255, 0.0, -0.02); sc.rotation.set(-0.62, 0.1, 0);
    mk(new T.BoxGeometry(0.03, 0.075, 0.66), mD, sc, 0, 0, -0.3); mk(new T.BoxGeometry(0.036, 0.085, 0.07), mT, sc, 0, 0, 0.0); mk(new T.BoxGeometry(0.036, 0.085, 0.08), mT, sc, 0, 0, -0.6);
  }
  if (!o.tabard && !o.plain) {
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
  if (PLN) mk(new T.CylinderGeometry(0.075, 0.13, 0.05, SEG, 1, true), mF, neck, 0, -0.01, 0).scale.z = 0.92; // a soft collar
  else mk(new T.CylinderGeometry(o.helm === 'open' ? 0.105 : 0.158, 0.2, 0.075, SEG, 1, true), mUF, neck, 0, 0.0, 0).scale.z = 0.92; // mail collar
  if (o.helm === 'open' || o.helm === 'none' || o.helm === 'wrap') {
    // A head with a face: skull, cheeks drawing in to a chin, nose, ears, eyes set under a brow, on a neck narrower than the jaw.
    // 'open' puts a brimmed helm with cheek plates on it, 'none' leaves it bare, 'wrap' winds a desert head-wrap round it that leaves only the eyes.
    mk(new T.CylinderGeometry(0.05, 0.062, 0.13, 12), mSkin, neck, 0, 0.03, -0.008);
    mk(ball(0.112), mSkin, neck, 0, 0.172, 0).scale.set(0.9, 1.05, 1.04);
    mk(ball(0.09), mSkin, neck, 0, 0.112, 0.024).scale.set(0.86, 0.95, 0.98);
    mk(ball(0.036), mSkin, neck, 0, 0.05, 0.07).scale.set(1.15, 0.8, 0.9);
    mk(rbox(0.026, 0.052, 0.03, 0.011), mSkin, neck, 0, 0.142, 0.116).rotation.x = -0.3; mk(ball(0.015), mSkin, neck, 0, 0.123, 0.126).scale.set(1.2, 0.85, 1);
    const mLip = M(new T.Color(o.skin || 0xd9a77e).multiplyScalar(0.62));
    mk(rbox(0.042, 0.009, 0.012, 0.004), mLip, neck, 0, 0.09, 0.105);
    for (const sd of [-1, 1]) {
      mk(ball(0.014), mEye, neck, sd * 0.04, 0.168, 0.1).scale.set(1.3, 0.72, 0.6);
      mk(rbox(0.05, 0.012, 0.02, 0.005), mHair, neck, sd * 0.041, 0.189, 0.102).rotation.z = -sd * 0.1;
      mk(ball(0.022), mSkin, neck, sd * 0.1, 0.153, -0.006).scale.set(0.45, 1, 0.7);
    }
    if (o.helm === 'wrap') { // cloth wound over the crown with a roll at the brow, a veil over nose and mouth, a turn round the neck and a tail down the back
      const mW = M(o.wrap || 0xcfc2a2, { map: clothTex, side: T.DoubleSide });
      const top = mk(new T.SphereGeometry(0.128, SEG, 8, 0, PI * 2, 0, PI / 2), mW, neck, 0, 0.196, -0.004); top.scale.set(1, 0.9, 1.08); top.rotation.x = -0.12;
      mk(new T.TorusGeometry(0.116, 0.027, 8, SEG), mW, neck, 0, 0.203, 0.0).rotation.x = PI / 2 - 0.12;
      const veil = mk(new T.CylinderGeometry(0.112, 0.12, 0.125, SEG, 1, true), mW, neck, 0, 0.094, 0.014); veil.scale.z = 1.24;
      mk(new T.CylinderGeometry(0.1, 0.16, 0.09, SEG, 1, true), mW, neck, 0, 0.005, 0).scale.z = 0.95;
      mk(drape(0.18, 0.25, 0.34, 0.05), mW, neck, 0, 0.12, -0.132).rotation.set(0.12, PI, 0);
    } else if (o.helm === 'none') {
      const cap = mk(new T.SphereGeometry(0.119, 16, 8, 0, PI * 2, 0, PI * 0.56), mHair, neck, 0, 0.178, -0.008); cap.scale.set(0.94, 1.05, 1.07); cap.rotation.x = -0.34; // hair: higher at the brow, down to the nape behind
      mk(ball(0.085), mHair, neck, 0, 0.128, -0.042).scale.set(1.02, 1, 0.8);
      if (o.bandage) { const bd = mk(new T.CylinderGeometry(0.122, 0.122, 0.05, SEG), M(0xd8d0bc), neck, 0, 0.222, 0.004); bd.rotation.set(0.1, 0, 0.16); }
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
    // a horsehair crest: one swept shape that rises off the brow, arcs over the crown and falls behind in a tail
    mk(memo('crest', () => {
      const sp = new T.Shape(); sp.moveTo(0.13, 0.3); sp.quadraticCurveTo(0.16, 0.42, 0.06, 0.46); sp.quadraticCurveTo(-0.1, 0.52, -0.24, 0.4); sp.quadraticCurveTo(-0.37, 0.27, -0.33, 0.02);
      sp.quadraticCurveTo(-0.27, 0.14, -0.21, 0.22); sp.quadraticCurveTo(-0.15, 0.3, -0.06, 0.34); sp.quadraticCurveTo(0.04, 0.36, 0.13, 0.3);
      const g = new T.ExtrudeGeometry(sp, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.014, bevelSegments: 3, curveSegments: 10 }); g.translate(0, 0, -0.015); g.rotateY(-PI / 2); return g;
    }), mP, neck, 0, 0, 0);
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
    const sh = (J[a] = joint(chest, s * (PLN ? 0.255 : 0.3), PLN ? 0.292 : 0.3, 0));
    if (PLN) mk(ball(0.08), mA, sh, -s * 0.012, 0.0, 0).scale.set(1.05, 1, 1.1); // the shoulder of a jerkin, no plate
    else { mk(ball(0.135), mA, sh, s * 0.02, 0.03, 0).scale.set(1.12 * PD, 0.85 * PD, 1.15 * PD);
    mk(ball(0.1), mA, sh, s * 0.05, -0.07, 0).scale.set(PD, 0.7 * PD, 1.15 * PD); }
    if (o.lames) { // stacked plates stepping down the upper arm
      mk(new T.SphereGeometry(0.15, SEG, 6, 0, PI * 2, 0, PI / 2.4), mA, sh, s * 0.035, 0.0, 0).scale.set(1.15, 0.8, 1.2);
      mk(new T.CylinderGeometry(0.105, 0.125, 0.06, SEG, 1, true), mA, sh, s * 0.03, -0.08, 0).scale.z = 1.15;
      mk(new T.CylinderGeometry(0.095, 0.112, 0.05, SEG, 1, true), mA, sh, s * 0.025, -0.13, 0).scale.z = 1.1;
    }
    mk(limb(0.07, 0.06, 0.27), mU, sh);
    if (!PLN) mk(new T.CylinderGeometry(0.078, 0.078, 0.03, SEG), mT, sh, 0, -0.15, 0);
    const el = (J[b] = joint(sh, 0, -0.27, 0));
    if (PLN) { mk(limb(0.055, 0.043, 0.25), mSkin, el); mk(new T.CylinderGeometry(0.064, 0.06, 0.04, SEG), mU, el, 0, 0.0, 0); mk(new T.CylinderGeometry(0.049, 0.047, 0.05, SEG), mD, el, 0, -0.215, 0); } // a bare forearm below a rolled sleeve, and a leather wrist wrap
    else { mk(limb(0.062, 0.088, 0.25), mA, el); mk(ball(0.066), mT, el, 0, 0, -0.015);
    mk(new T.CylinderGeometry(0.098, 0.098, 0.03, SEG), mT, el, 0, -0.235, 0); }
    if (!PLN) { const cw = mk(slab(0.1, 0.12, 0.02, 0.04), mA, el, s * 0.072, 0.0, -0.02); cw.rotation.order = 'XZY'; cw.rotation.set(0, PI / 2, s * 0.22); } // couter wing
    if (!PLN) mk(new T.CylinderGeometry(0.112, 0.092, 0.085, SEG, 1, true), mF, el, 0, -0.175, 0); // flared gauntlet cuff
    const ha = (J[c] = joint(el, 0, -0.25, 0));
    // a closed gauntlet: wrist, palm, curled fingers and a thumb (it used to be one block)
    const mH = PLN ? mSkin : mD; // a bare hand, or a gauntlet
    mk(new T.CylinderGeometry(0.05, 0.046, 0.03, 10), mH, ha, 0, -0.012, 0).scale.setScalar(PLN ? 0.88 : 1); mk(rbox(0.07, 0.06, 0.092, 0.024), mH, ha, 0, -0.05, 0);
    mk(rbox(0.066, 0.05, 0.088, 0.022), mH, ha, -s * 0.012, -0.088, 0.004).rotation.z = -s * 0.45; mk(rbox(0.03, 0.055, 0.032, 0.013), mH, ha, -s * 0.02, -0.06, 0.058).rotation.x = -0.5;
    if (!PLN) { mk(rbox(0.024, 0.085, 0.108, 0.011), mA, ha, s * 0.05, -0.04, 0); mk(rbox(0.03, 0.022, 0.11, 0.01), mT, ha, s * 0.05, -0.085, 0); } // back-of-hand plate and knuckles
    return ha;
  };
  arm(1, 'shL', 'elL', 'haL'); const haR = arm(-1, 'shR', 'elR', 'haR');
  if (o.glass) { // glass growing out of the left shoulder and the back, and (o.wound) a wound across the breastplate
    for (const [x, y, z, h, rx, rz] of [[0.05, 0.17, 0, 0.3, 0, -0.3], [0.1, 0.1, 0.04, 0.17, 0.3, -0.75], [0.03, 0.12, -0.07, 0.2, -0.45, -0.15]]) mk(new T.ConeGeometry(h * 0.16, h, 4), mGl, J.shL, x, y, z).rotation.set(rx, 0, rz);
    const mW = M(0x3d0a0d); if (o.wound) mk(new T.BoxGeometry(0.26, 0.035, 0.02), mW, chest, -0.02, 0.2, 0.222).rotation.set(0.18, 0, 0.75); if (o.wound) mk(new T.BoxGeometry(0.05, 0.12, 0.02), mW, chest, -0.09, 0.08, 0.2).rotation.z = 0.2;
  }
  if (o.skirt) { // long cloth panels hanging from the belt, front and back
    const mK = M(o.skirt, { side: T.DoubleSide, map: clothTex });
    for (const sd of [1, -1]) { const pn = mk(drape(0.25, 0.3, 0.52, -0.035), mK, hips, 0, -0.12, sd * 0.222); pn.rotation.set(-sd * 0.1, sd < 0 ? PI : 0, 0); mk(rbox(0.3, 0.03, 0.02, 0.008), mT, hips, 0, -0.63, sd * 0.266); }
  }
  const leg = (s, a, b, c) => {
    const th = (J[a] = joint(hips, s * 0.105, -0.03, 0));
    mk(limb(0.095 * LG, 0.075 * LG, 0.42), mU, th); if (!PLN) mk(rbox(0.14 * LG, 0.23, 0.075 * LG, 0.034 * LG), mA, th, 0, -0.16, 0.058 * LG);
    const kn = (J[b] = joint(th, 0, -0.42, 0));
    if (PLN) { // trousers into a tall soft boot with a turned-down top
      mk(ball(0.07 * LG), mU, kn, 0, 0, 0.012 * LG); mk(limb(0.074 * LG, 0.056 * LG, 0.38), mD, kn); mk(new T.CylinderGeometry(0.083 * LG, 0.078 * LG, 0.05, SEG), mT, kn, 0, -0.06, 0);
      mk(ball(0.066 * LG), mD, kn, 0, -0.14, -0.024 * LG).scale.set(0.95, 1.6, 0.85);
    } else {
    mk(ball(0.072 * LG), mT, kn, 0, 0, 0.035 * LG); mk(limb(0.078 * LG, 0.06 * LG, 0.38), mA, kn);
    mk(rbox(0.03, 0.3, 0.03, 0.013), mT, kn, 0, -0.2, 0.062 * LG);
    mk(ball(0.07 * LG), mA, kn, 0, -0.13, -0.028 * LG).scale.set(0.95, 1.6, 0.85); // calf
    mk(new T.CylinderGeometry(0.1 * LG, 0.1 * LG, 0.028, SEG), mT, th, 0, -0.05, 0); mk(rbox(0.146 * LG, 0.03, 0.08 * LG, 0.012), mT, th, 0, -0.265, 0.058 * LG); // thigh strap, cuisse edge
    }
    if (o.knees) { // a knee cop with a swept wing on the outside, over a tall greave
      mk(ball(0.085 * LG), mA, kn, 0, 0.01, 0.05).scale.set(1.15, 1.05, 0.8);
      const wg = mk(slab(0.11, 0.17, 0.02, 0.045), mA, kn, s * 0.085 * LG, 0.05, 0.02); wg.rotation.order = 'XZY'; wg.rotation.set(-0.15, PI / 2, -s * 0.45);
      mk(new T.CylinderGeometry(0.095 * LG, 0.088 * LG, 0.12, SEG, 1, true), mA, kn, 0, -0.08, 0.008);
    }
    const an = (J[c] = joint(kn, 0, -0.38, 0));
    if (o.knees) mk(new T.CylinderGeometry(0.085 * LG, 0.095 * LG, 0.05, SEG), mA, an, 0, 0.03, 0.01);
    mk(rbox(0.115 * LG, 0.09 * LG, 0.27 * LG, 0.04 * LG), mD, an, 0, -0.025, 0.055); if (!PLN) mk(rbox(0.1 * LG, 0.03, 0.15 * LG, 0.013), mA, an, 0, 0.022 * LG, 0.06).rotation.x = 0.2; // sabaton plate mk(new T.BoxGeometry(0.12 * LG, 0.06 * LG, 0.09), mT, an, 0, -0.04, 0.16 * LG);
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
    mk(rbox(0.04, 0.26, 0.045, 0.016), mT, w, 0, 0, 0.115);
    mk(ball(0.032), mT, w, 0, 0.14, 0.115); mk(ball(0.032), mT, w, 0, -0.14, 0.115);
    mk(memo('blade' + len, () => bladeGeo(len, 0.066, 0.026, 0.12)), mBlade, w, 0, 0, 0.13);
    mk(rbox(0.028, 0.016, len * 0.6, 0.007), mD, w, 0, 0, 0.15 + len * 0.3); // fuller
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
    const mC = M(o.cape, { side: T.DoubleSide, map: clothTex }); cape = []; const mH = M(o.trim, { side: T.DoubleSide });
    let p = joint(chest, 0, 0.35, -0.212); // hung clear of the backplate mk(rbox(0.4, 0.04, 0.03, 0.012), mT, p, 0, -0.01, 0);
    const n = o.capeLen || 3; // o.tatter: the last length hangs in torn strips, with no hem
    for (let i = 0; i < n; i++) {
      const wd = 0.44 + Math.min(i, 3) * 0.04, last = i === n - 1; cape.push(p);
      const w1 = 0.44 + Math.min(i + 1, 3) * 0.04, BOW = 0.07; // each length widens into the next and overlaps it a little, so the hinges don't show as steps
      if (last && o.tatter) [0.3, 0.12, 0.24, 0.07, 0.2].forEach((h, k) => { const x = (k - 2) * (wd / 5), u = (x / wd) * 2; mk(drape(wd / 5 - 0.01, wd / 5 - 0.03, h, 0), mC, p, x, 0, BOW * u * u * 0.8).rotation.y = -u * 0.3; });
      else mk(drape(wd, last ? wd : w1, last ? 0.3 : 0.33, BOW), mC, p, 0, 0, 0);
      if (last) { if (!o.tatter) mk(drape(wd + 0.004, wd + 0.004, 0.035, BOW), mH, p, 0, -0.27, -0.003); } else p = joint(p, 0, -0.3, 0);
    }
  }
  return { root, J, mats, wBase, wTip, bladeMat: o.weapon ? mS : mBlade, cape, eye: mEye };
}
