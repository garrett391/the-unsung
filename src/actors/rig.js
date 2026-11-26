import * as T from 'three';
import { PI } from '../core/util.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, shieldTex, tabardTex, plateTex, mailTex, clothTex, tunicTex, skirtTex, wrapTex } from '../gfx/materials.js';
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
// The skirt of a tunic: it flares from the belt in soft pleats that deepen toward an uneven hem (a smooth cone read as a toy's).
const pleats = (r0, r1, len, n) => memo(`k${r0},${r1},${len},${n}`, () => {
  const g = new T.CylinderGeometry(1, 1, 1, 48, 6, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getX(i), p.getZ(i)), v = 0.5 - p.getY(i), f = Math.pow(v, 1.3), r = (r0 + (r1 - r0) * Math.sin(v * PI / 2)) * (1 + 0.08 * f * Math.cos(a * n) + 0.035 * f * Math.sin(a * 3 + 1));
    p.setXYZ(i, Math.sin(a) * r, 0.06 - v * len * (v > 0.99 ? 1 + 0.07 * Math.sin(a * 2 + 0.6) + 0.04 * Math.cos(a * n) : 1), Math.cos(a) * r); }
  g.computeVertexNormals(); return g;
});
const ballS = (r) => memo('S' + r, () => new T.SphereGeometry(r, 28, 20)); // skin: enough segments that the toon bands don't follow the facets
// Cloth turned on a profile and then creased: `fold(a, v)` swells or draws in the radius at angle `a` round the body (0 is the
// front) and `v` along the profile (0 at its first point). The seam is at the back, so the front is the middle of the texture.
const folded = (k, pts, fold, seg = 36, n = 14) => memo(k, () => {
  const g = new T.LatheGeometry(new T.SplineCurve(pts.map(([a, b]) => new T.Vector2(a, b))).getPoints(n), seg, PI), p = g.attributes.position, uv = g.attributes.uv, nm = g.attributes.normal, rows = n + 1;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), f = 1 + fold(Math.atan2(x, z), uv.getY(i)); p.setX(i, x * f); p.setZ(i, z * f); }
  if (pts[0][1] > pts[pts.length - 1][1]) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } } // a profile drawn from the top down is turned inside out: face it outward again (the sleeves were, and under a one-sided cloth the near side of the upper arm was not drawn at all)
  g.computeVertexNormals();
  for (let j = 0; j < rows; j++) { const a = j, b = seg * rows + j, x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b), l = Math.hypot(x, y, z) || 1; nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l); } // no crease down the seam
  return g;
});
const GATHER = (a) => 0.022 * Math.cos(a * 6 + 0.6) + 0.009 * Math.cos(a * 3 + 1), sat = (x) => Math.max(0, Math.min(1, x)); // how a tunic bunches at the bottom of the ribs
const turned = (k, pts, n = 10) => memo(k, () => new T.LatheGeometry(new T.SplineCurve(pts.map(([a, b]) => new T.Vector2(a, b))).getPoints(n), SEG));
const band = (r, t) => memo(`o${r},${t}`, () => new T.TorusGeometry(r, t, 6, SEG)); // one turn of a wrapping

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
  const SH = o.plain ? 0 : 0.55; // plate, trim and steel catch the light; cloth and leather don't
  const mA = M(o.armor, { map: o.plain ? tunicTex : plate, shine: SH }), mT = M(o.trim, { shine: SH }), mU = M(o.under, { map: mail }), mUF = M(o.under, { map: mail, side: T.DoubleSide }), mD = M(o.dark || 0x24252d), mS = M(o.steel || 0xdfe3ea, { shine: 0.9 });
  const mEye = new T.MeshBasicMaterial({ color: o.eye || 0x08080c });
  const PLN = !!o.plain, bare = PLN || o.helm === 'open' || o.helm === 'none' || o.helm === 'wrap', mSkin = bare ? M(o.skin || 0xd9a77e) : null, mHair = bare ? M(o.hair || 0x7a5228) : null;
  // The Usurper's glass (crown, growths, blade): unlit and just bright enough to bloom. The blade has its own material because blood tints it.
  const glass = () => new T.MeshBasicMaterial({ color: new T.Color(0.3, 0.82, 0.74) }), mGl = o.glass ? glass() : null, mBlade = o.glass || o.edge === 'glass' ? glass() : mS; // edge: 'glass' is the blade alone (the Veiled)
  const root = new T.Group(), J = {};
  const hips = (J.hips = joint(root, 0, HIP, 0));
  mk(rbox(0.33, 0.18, 0.22, 0.06), mU, hips, 0, -0.03, 0);
  const mF = M(o.armor, { side: T.DoubleSide, map: PLN ? skirtTex : plate, shine: SH }), mB = PLN ? M(o.armor, { map: clothTex, side: T.DoubleSide }) : mA; // (plain) mA carries the tunic's front, mF its skirt, mB the rest of it
  if (PLN && o.robe) mk(pleats(0.2, 0.33, 0.77, 11), mF, hips, 0, 0, 0).scale.z = 0.9; // a robe to the shins
  else if (PLN) mk(pleats(0.2, 0.275, 0.35, 9), mF, hips, 0, 0, 0).scale.z = 0.8; // the skirt of a tunic, pleated, to just above the knee
  else mk(new T.CylinderGeometry(0.215, 0.3, 0.27, SEG, 1, true), mF, hips, 0, -0.1, 0).scale.z = 0.8;
  if (o.sash) { // a cloth sash wound twice round the waist, knotted on the left hip, its ends hanging
    const mSa = M(o.sash, { map: clothTex, side: T.DoubleSide });
    mk(new T.CylinderGeometry(0.217, 0.222, 0.075, SEG), mSa, hips, 0, 0.035, 0).scale.z = 0.8; const up = mk(new T.CylinderGeometry(0.212, 0.219, 0.06, SEG), mSa, hips, 0, 0.085, 0); up.scale.z = 0.8; up.rotation.z = 0.07;
    mk(ball(0.042), mSa, hips, 0.15, 0.05, 0.13).scale.set(1.1, 0.9, 0.75);
    mk(drape(0.07, 0.1, 0.3, 0.012), mSa, hips, 0.165, 0.03, 0.142).rotation.set(-0.1, 0.5, 0.07); mk(drape(0.06, 0.08, 0.21, 0.012), mSa, hips, 0.19, 0.03, 0.118).rotation.set(-0.06, 0.95, -0.05);
  } else {
  mk(new T.CylinderGeometry(PLN ? 0.212 : 0.225, PLN ? 0.212 : 0.225, PLN ? 0.045 : 0.06, SEG), mT, hips, 0, 0.05, 0).scale.z = 0.8;
  mk(PLN ? rbox(0.05, 0.05, 0.02, 0.008) : new T.BoxGeometry(0.08, 0.08, 0.04), PLN ? mD : mT, hips, 0, 0.05, PLN ? 0.172 : 0.18);
  }
  if (!PLN) for (const sd of [-1, 1]) {
    mk(slab(0.16, 0.24, 0.035, 0.05), mA, hips, sd * 0.125, -0.2, 0.185).rotation.x = -0.2; // tassets, rounded at the corners
    mk(slab(0.13, 0.03, 0.04, 0.012), mT, hips, sd * 0.125, -0.27, 0.203).rotation.x = -0.2;
    mk(slab(0.16, 0.22, 0.035, 0.05), mA, hips, sd * 0.125, -0.2, -0.185).rotation.x = 0.2;
  }
  const spine = (J.spine = joint(hips, 0, 0.07, 0));
  if (PLN) mk(folded('waistP', [[0.2, -0.012], [0.215, 0.03], [0.204, 0.1], [0.19, 0.205]], (a, v) => (1 - v) * 0.032 * Math.cos(a * 8 + 0.6) + v * GATHER(a)), mB, spine, 0, 0, 0).scale.z = 0.76; // the tunic bloused over the belt, in gathers
  else mk(new T.CylinderGeometry(0.2, 0.2, 0.2, SEG), mU, spine, 0, 0.1, 0).scale.z = 0.74;
  const chest = (J.chest = joint(spine, 0, 0.2, 0));
  // breastplate: turned on a curve, so it swells over the ribs and draws in to the waist and collar
  if (PLN) mk(folded('chestP', [[0.188, 0], [0.194, 0.07], [0.22, 0.19], [0.236, 0.275], [0.214, 0.335], [0.15, 0.376]], (a, v) => (1 - v) * (1 - v) * GATHER(a)), mA, chest, 0, 0, 0).scale.z = 0.78; // a man's chest under cloth, not a breastplate: narrower, with the shoulders set in
  else mk(memo('chest', () => new T.LatheGeometry(new T.SplineCurve([[0.196, 0], [0.214, 0.06], [0.262, 0.17], [0.288, 0.27], [0.268, 0.335], [0.2, 0.372]].map(([a, b]) => new T.Vector2(a, b))).getPoints(12), SEG)), mA, chest, 0, 0, 0).scale.z = 0.8;
  mk(new T.CylinderGeometry(PLN ? 0.085 : 0.12, PLN ? 0.165 : 0.21, PLN ? 0.06 : 0.07, SEG), PLN ? mB : mT, chest, 0, PLN ? 0.38 : 0.385, 0).scale.z = 0.85; // the yoke: sloping shoulders up to the collar
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
  if (o.rank) { // a sergeant's sash: a broad cloth band over the left shoulder, crossing the strap, knotted on the right hip with its ends hanging
    const mR = M(o.rank, { map: clothTex, side: T.DoubleSide });
    const fr = mk(rbox(0.085, 0.62, 0.018, 0.008), mR, chest, -0.005, 0.16, 0.236); fr.rotation.set(-0.19, 0, -0.66);
    const bk = mk(rbox(0.085, 0.62, 0.018, 0.008), mR, chest, -0.005, 0.16, -0.236); bk.rotation.set(0.19, 0, 0.66);
    mk(ball(0.045), mR, hips, 0.2, 0.06, 0.13).scale.set(1.1, 0.9, 0.75);
    mk(drape(0.07, 0.09, 0.3, 0.012), mR, hips, 0.215, 0.03, 0.14).rotation.set(-0.1, 0.55, 0.08); mk(drape(0.06, 0.08, 0.24, 0.012), mR, hips, 0.235, 0.03, 0.11).rotation.set(-0.06, 0.95, -0.04);
  }
  if (o.scarf) { // a long scarf bunched round the neck and shoulders, one end down the chest and one thrown back over the shoulder
    const mSc = M(o.scarf, { map: clothTex, side: T.DoubleSide });
    const roll = mk(turned('scarf', [[0.08, 0.475], [0.135, 0.462], [0.182, 0.42], [0.192, 0.372], [0.17, 0.336], [0.12, 0.326]]), mSc, chest, 0, 0, 0.012); roll.scale.z = 0.92; roll.rotation.x = 0.1;
    const fold = mk(band(0.128, 0.036), mSc, chest, 0.01, 0.438, 0.006); fold.rotation.set(PI / 2 + 0.22, 0.2, 0); fold.scale.set(1, 0.92, 1);
    mk(drape(0.1, 0.13, 0.27, 0.02), mSc, chest, -0.075, 0.37, 0.178).rotation.set(-0.16, 0, 0.07); mk(drape(0.11, 0.14, 0.31, 0.02), mSc, chest, 0.1, 0.4, -0.165).rotation.set(0.12, PI, 0.05);
  }
  if (o.strap) { // a satchel on a strap across the body, the bag on the left hip
    const mL = M(0x5a3c24);
    mk(rbox(0.042, 0.5, 0.014, 0.005), mL, chest, 0, 0.17, 0.176).rotation.set(-0.2, 0, 0.6); mk(rbox(0.042, 0.5, 0.014, 0.005), mL, chest, 0, 0.17, -0.172).rotation.set(0.2, 0, -0.6);
    mk(rbox(0.075, 0.17, 0.2, 0.03), mL, hips, 0.232, -0.09, 0.02); mk(rbox(0.082, 0.085, 0.206, 0.02), mD, hips, 0.233, -0.04, 0.02); mk(ball(0.012), mT, hips, 0.276, -0.075, 0.02);
  }
  if (o.quiver) { // javelins slung on the back in a leather case, their heads up over the right shoulder, and the sling across the chest
    const mL = M(0x5a3c24), mW = M(0x7a5634), q = joint(chest, 0.04, 0.16, -0.21); q.rotation.set(0.14, 0, -0.42);
    mk(new T.CylinderGeometry(0.07, 0.055, 0.46, 10), mL, q, 0, 0, 0);
    for (const [x, z] of [[-0.022, 0.012], [0.026, 0.016], [0.002, -0.026]]) { mk(new T.CylinderGeometry(0.012, 0.012, 1.0, 5), mW, q, x, 0.36, z); mk(new T.ConeGeometry(0.024, 0.13, 4), mS, q, x, 0.92, z); }
    mk(rbox(0.04, 0.54, 0.014, 0.005), mL, chest, 0, 0.17, 0.176).rotation.set(-0.2, 0, -0.6);
  }
  if (o.mantle) { // a short shoulder cape, closed at the throat: it hangs over the shoulders in folds
    const mMn = M(o.mantle, { map: clothTex, side: T.DoubleSide });
    mk(folded('mantle', [[0.088, 0.418], [0.14, 0.404], [0.24, 0.372], [0.335, 0.31], [0.378, 0.2], [0.384, 0.12]], (a, v) => v * v * (0.05 * Math.cos(a * 9 + 0.4) + 0.02 * Math.cos(a * 4))), mMn, chest, 0, 0, 0).scale.z = 0.72;
    mk(band(0.092, 0.016), mMn, chest, 0, 0.416, 0).rotation.x = PI / 2; mk(ball(0.016), mT, chest, 0, 0.4, 0.108);
  }
  const mJ = o.jack ? M(o.jack, { map: plateTex }) : null, mJd = o.jack ? M(new T.Color(o.jack).multiplyScalar(0.6)) : null; // o.jack: a studded leather jack over the tunic, with shoulder caps, bracers and a sword belt across the chest
  if (mJ) {
    mk(turned('jack', [[0.206, -0.01], [0.212, 0.07], [0.237, 0.19], [0.252, 0.275], [0.232, 0.335], [0.172, 0.368]], 12), mJ, chest, 0, 0, 0).scale.z = 0.8;
    mk(new T.CylinderGeometry(0.21, 0.224, 0.215, SEG, 1, true), mJ, spine, 0, 0.1, 0).scale.z = 0.78;
    const hem = mk(band(0.224, 0.009), mJd, spine, 0, -0.005, 0); hem.rotation.x = PI / 2; hem.scale.y = 0.78;
    const col = mk(band(0.17, 0.012), mJd, chest, 0, 0.366, 0); col.rotation.x = PI / 2; col.scale.y = 0.8;
    for (const [y, z] of [[0.3, 0.19], [0.22, 0.197], [0.14, 0.184], [0.06, 0.17]]) { mk(rbox(0.07, 0.016, 0.012, 0.005), mJd, chest, 0, y, z); mk(ball(0.009), mT, chest, 0.03, y, z + 0.006); } // closed down the front with straps
    mk(rbox(0.05, 0.4, 0.014, 0.005), mJd, chest, 0.01, 0.15, 0.203).rotation.set(-0.19, 0, -0.62); mk(rbox(0.05, 0.4, 0.014, 0.005), mJd, chest, 0.01, 0.15, -0.203).rotation.set(0.19, 0, 0.62); // the sword belt, over the right shoulder to the scabbard
    mk(rbox(0.04, 0.045, 0.014, 0.006), mT, chest, 0.04, 0.19, 0.214).rotation.set(-0.19, 0, -0.62);
  }
  // helm
  const neck = (J.neck = joint(chest, 0, 0.4, 0));
  if (PLN) mk(new T.CylinderGeometry(0.075, 0.13, 0.05, SEG, 1, true), mF, neck, 0, -0.01, 0).scale.z = 0.92; // a soft collar
  else mk(new T.CylinderGeometry(o.helm === 'open' ? 0.105 : 0.158, 0.2, 0.075, SEG, 1, true), mUF, neck, 0, 0.0, 0).scale.z = 0.92; // mail collar
  if (o.helm === 'open' || o.helm === 'none' || o.helm === 'wrap') {
    // A head with a face: skull, cheeks drawing in to a chin, nose, ears, eyes set under a brow, on a neck narrower than the jaw.
    // 'open' puts a brimmed helm with cheek plates on it, 'none' leaves it bare, 'wrap' winds a desert head-wrap round it that leaves only the eyes.
    mk(new T.CylinderGeometry(0.05, 0.062, 0.13, 20), mSkin, neck, 0, 0.03, -0.008);
    mk(ballS(0.112), mSkin, neck, 0, 0.172, 0).scale.set(0.9, 1.05, 1.04);
    mk(ballS(0.09), mSkin, neck, 0, 0.112, 0.024).scale.set(0.86, 0.95, 0.98);
    mk(ballS(0.036), mSkin, neck, 0, 0.05, 0.07).scale.set(1.15, 0.8, 0.9);
    mk(rbox(0.026, 0.052, 0.03, 0.011), mSkin, neck, 0, 0.142, 0.116).rotation.x = -0.3; mk(ball(0.015), mSkin, neck, 0, 0.123, 0.126).scale.set(1.2, 0.85, 1);
    const mLip = M(new T.Color(o.skin || 0xd9a77e).multiplyScalar(0.62));
    mk(rbox(0.042, 0.009, 0.012, 0.004), mLip, neck, 0, 0.09, 0.105);
    for (const sd of [-1, 1]) {
      mk(ball(0.014), mEye, neck, sd * 0.04, 0.168, o.paint ? 0.1036 : 0.1).scale.set(o.paint ? 1.45 : 1.3, 0.72, 0.6); // (painted: a little proud of the paint)
      mk(rbox(0.05, 0.012, 0.02, 0.005), mHair, neck, sd * 0.041, 0.189, 0.102).rotation.z = -sd * 0.1;
      mk(ball(0.022), mSkin, neck, sd * 0.1, 0.153, -0.006).scale.set(0.45, 1, 0.7);
    }
    if (o.beard) { // a short full beard and moustache
      mk(ball(0.08), mHair, neck, 0, 0.055, 0.034).scale.set(0.98, 0.95, 0.98); mk(ball(0.05), mHair, neck, 0, 0.018, 0.07).scale.set(1.1, 0.9, 0.8);
      for (const sd of [-1, 1]) { mk(rbox(0.045, 0.02, 0.022, 0.008), mHair, neck, sd * 0.021, 0.104, 0.109).rotation.z = -sd * 0.28; }
    }
    if (o.paint) { // painted eyes (the Veiled): a dark band across them, skin-close, and wings of the same paint out over the cloth at the temples
      const mP = M(o.paint); mk(new T.CylinderGeometry(0.1145, 0.1145, 0.03, 24, 1, true, -1.15, 2.3), mP, neck, 0, 0.169, 0).scale.set(0.9, 1, 1.04);
      for (const sd of [-1, 1]) { const w = mk(new T.CylinderGeometry(0.134, 0.13, 0.026, 12, 1, true, sd > 0 ? 0.42 : -1.62, 1.2), mP, neck, 0, 0.176, -0.004); w.scale.set(0.98, 1, 1.12); w.rotation.z = sd * 0.1; }
    }
    if (o.helm === 'wrap') { // cloth wound over the crown with a roll at the brow, a veil over nose and mouth, a turn round the neck and a tail down the back
      const mW = M(o.wrap || 0xcfc2a2, { map: clothTex, side: T.DoubleSide });
      const top = mk(new T.SphereGeometry(0.128, SEG, 8, 0, PI * 2, 0, PI / 2), mW, neck, 0, 0.196, -0.004); top.scale.set(1, 0.9, 1.08); top.rotation.x = -0.12;
      mk(band(0.116, 0.027), mW, neck, 0, 0.203, 0.0).rotation.x = PI / 2 - 0.12;
      for (const [y, r, t, rz, ry] of [[0.236, 0.108, 0.03, 0.3, 0.4], [0.252, 0.092, 0.03, -0.28, -0.3], [0.222, 0.118, 0.022, -0.16, 0.9]]) mk(band(r, t), mW, neck, 0, y, -0.006).rotation.set(PI / 2 - 0.1, rz, ry); // further turns of the cloth, each laid across the last
      // the veil follows the face: over the nose, in under the chin, and out onto the collar (it was a straight tube)
      mk(turned('veil', [[0.106, 0.16], [0.116, 0.125], [0.113, 0.08], [0.098, 0.04], [0.096, 0.012], [0.124, -0.02], [0.168, -0.046]], 12), mW, neck, 0, 0, 0.012).scale.z = 1.27;
      mk(drape(0.18, 0.25, 0.34, 0.05), mW, neck, 0, 0.12, -0.132).rotation.set(0.12, PI, 0);
      if (o.veil) { // (the Veiled) a long veil of its own over that one, hung from under the eyes to the middle of the chest, and a longer tail behind
        const mV = M(o.veil, { map: clothTex, side: T.DoubleSide });
        const v = mk(drape(0.17, 0.28, 0.5, 0.1), mV, neck, 0, 0.158, 0.126); v.rotation.x = -0.28; v.scale.z = -1;
        mk(drape(0.22, 0.32, 0.62, 0.06), mV, neck, 0, 0.2, -0.14).rotation.set(0.16, PI, 0);
      }
    } else if (o.helm === 'none' && o.cloth) { // a head-cloth held by a cord: over the crown and down round the neck to the shoulders
      const mW = M(o.cloth, { map: clothTex, side: T.DoubleSide });
      const top = mk(new T.SphereGeometry(0.127, SEG, 8, 0, PI * 2, 0, PI / 2), mW, neck, 0, 0.19, -0.006); top.scale.set(1, 0.95, 1.08); top.rotation.x = -0.14;
      mk(new T.CylinderGeometry(0.129, 0.19, 0.27, SEG, 3, true, 1.0, PI * 2 - 2.0), mW, neck, 0, 0.07, -0.012).scale.z = 1.02;
      mk(new T.CylinderGeometry(0.128, 0.132, 0.05, SEG, 1, true), mW, neck, 0, 0.212, -0.004).rotation.x = -0.14;
      for (const y of [0.222, 0.238]) mk(band(0.127, 0.011), mD, neck, 0, y, -0.006).rotation.x = PI / 2 - 0.14;
    } else if (o.helm === 'none') {
      const cap = mk(new T.SphereGeometry(0.119, 16, 8, 0, PI * 2, 0, PI * 0.56), mHair, neck, 0, 0.178, -0.008); cap.scale.set(0.94, 1.05, 1.07); cap.rotation.x = -0.34; // hair: higher at the brow, down to the nape behind
      mk(ball(0.085), mHair, neck, 0, 0.128, -0.042).scale.set(1.02, 1, 0.8);
      if (o.hat) { // a soft felt cap: a band round the brow and a full crown pushed back and to one side
        const mHt = M(o.hat, { map: clothTex });
        const dome = mk(new T.SphereGeometry(0.126, SEG, 8, 0, PI * 2, 0, PI / 2), mHt, neck, 0, 0.2, -0.004); dome.scale.set(0.98, 0.7, 1.08); dome.rotation.x = -0.16;
        const crown = mk(ballS(0.135), mHt, neck, 0.012, 0.268, -0.03); crown.scale.set(1.08, 0.42, 1.16); crown.rotation.set(-0.22, 0, 0.14);
        mk(band(0.121, 0.017), mHt, neck, 0, 0.212, -0.004).rotation.x = PI / 2 - 0.16;
      }
      if (o.bandage) { const bd = mk(new T.CylinderGeometry(0.122, 0.122, 0.05, SEG), M(0xd8d0bc), neck, 0, 0.222, 0.004); bd.rotation.set(0.1, 0, 0.16); }
    } else if (o.kettle) { // an iron kettle hat over a padded coif: a turned bowl and a wide sloping brim with a rolled edge, rivets round the band, the coif's skirt on the shoulders
      const mI = M(o.kettle, { map: plateTex, shine: 0.5, side: T.DoubleSide }), mIt = M(new T.Color(o.kettle).multiplyScalar(0.7), { shine: 0.4 }), mCf = M(o.coif || o.under, { map: clothTex, side: T.DoubleSide });
      const cap = mk(new T.SphereGeometry(0.121, SEG, 8, 0, PI * 2, 0, PI * 0.56), mCf, neck, 0, 0.176, -0.006); cap.scale.set(0.96, 1.04, 1.08); cap.rotation.x = -0.3;
      mk(new T.CylinderGeometry(0.117, 0.124, 0.2, SEG, 2, true, 0.8, PI * 2 - 1.6), mCf, neck, 0, 0.1, -0.004).scale.z = 1.06; // down over the ears and round the jaw, open at the face
      mk(turned('coifskirt', [[0.19, -0.04], [0.15, -0.012], [0.118, 0.012], [0.106, 0.04]], 6), mCf, neck, 0, 0, -0.004); // and out onto the shoulders
      const tie = mk(new T.TorusGeometry(0.1, 0.008, 5, 12, PI), mCf, neck, 0, 0.1, 0.012); tie.rotation.set(0.5, 0, PI); tie.scale.set(1, 0.72, 1); // tied under the chin
      const hat = joint(neck, 0, 0, -0.008); hat.rotation.set(-0.1, 0, 0.05); // worn pushed back a little, and not quite straight
      mk(turned('kettle', [[0.25, 0.2], [0.215, 0.214], [0.172, 0.226], [0.15, 0.238], [0.146, 0.27], [0.126, 0.312], [0.076, 0.342], [0.003, 0.352]], 16), mI, hat, 0, 0, 0).scale.z = 1.07;
      const rim = mk(band(0.25, 0.008), mIt, hat, 0, 0.2, 0); rim.rotation.x = PI / 2; rim.scale.y = 1.07;
      const bd = mk(new T.CylinderGeometry(0.15, 0.154, 0.026, SEG, 1, true), mIt, hat, 0, 0.243, 0); bd.scale.z = 1.07;
      for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2 + 0.3; mk(ball(0.008), mI, hat, Math.sin(a) * 0.154, 0.243, Math.cos(a) * 0.165); }
      const cb = mk(new T.TorusGeometry(0.146, 0.007, 4, 12, PI), mIt, hat, 0, 0.212, 0); cb.rotation.y = PI / 2; cb.scale.set(1.07, 0.97, 1); // a low ridge over the crown
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
  if (o.rank && o.helm === 'open') { // and his crest: horsehair set across the helm from ear to ear, so he can be found in a line of crests that run front to back
    const mR = M(o.rank, { map: clothTex });
    mk(rbox(0.26, 0.03, 0.045, 0.012), mT, neck, 0, 0.345, -0.012);
    mk(memo('xcrest', () => {
      const sp = new T.Shape(); sp.moveTo(-0.12, 0.335); sp.quadraticCurveTo(-0.195, 0.36, -0.185, 0.425); sp.quadraticCurveTo(-0.12, 0.5, 0, 0.505); sp.quadraticCurveTo(0.12, 0.5, 0.185, 0.425); sp.quadraticCurveTo(0.195, 0.36, 0.12, 0.335); sp.quadraticCurveTo(0, 0.35, -0.12, 0.335);
      const g = new T.ExtrudeGeometry(sp, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 }); g.translate(0, 0, -0.0175); return g;
    }), mR, neck, 0, 0, -0.012);
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
  const LG = o.legs || 1, PD = o.pads || 1, mWr = PLN && o.wraps ? M(o.wraps, { map: wrapTex }) : null, mWd = mWr ? M(new T.Color(o.wraps).multiplyScalar(0.66)) : null; // o.wraps: forearms and shins bound in cloth strips
  const arm = (s, a, b, c) => {
    const sh = (J[a] = joint(chest, s * (PLN ? 0.255 : 0.3), PLN ? 0.292 : 0.3, 0));
    if (PLN) mk(folded('sleeve', [[0.004, 0.08], [0.052, 0.07], [0.084, 0.034], [0.091, -0.03], [0.084, -0.12], [0.079, -0.21], [0.084, -0.258], [0.064, -0.274]], (a, v) => (v < 0.93 ? 0.05 * sat((v - 0.25) / 0.35) * (0.45 + 0.55 * Math.cos(a - 0.6)) * Math.sin(v * 22 + 1.8 * Math.sin(a + 1)) : 0), 24, 18), o.robe ? mB : mU, sh, -s * 0.012, 0, 0).scale.z = 1.06; // a loose sleeve set into the shoulder, creasing toward a rolled cuff at the elbow
    else { mk(ball(0.135), mA, sh, s * 0.02, 0.03, 0).scale.set(1.12 * PD, 0.85 * PD, 1.15 * PD);
    mk(ball(0.1), mA, sh, s * 0.05, -0.07, 0).scale.set(PD, 0.7 * PD, 1.15 * PD); }
    if (mJ) { // a leather cap on the shoulder, close over the sleeve, with a stitched edge
      mk(new T.SphereGeometry(0.106, SEG, 8, 0, PI * 2, 0, PI * 0.62), mJ, sh, s * 0.004, -0.005, 0).scale.set(1.0, 1.0, 1.12);
      const e = mk(band(0.099, 0.007), mJd, sh, s * 0.004, -0.044, 0); e.rotation.x = PI / 2; e.scale.y = 1.12;
    }
    if (o.lames) { // stacked plates stepping down the upper arm
      mk(new T.SphereGeometry(0.15, SEG, 6, 0, PI * 2, 0, PI / 2.4), mA, sh, s * 0.035, 0.0, 0).scale.set(1.15, 0.8, 1.2);
      mk(new T.CylinderGeometry(0.105, 0.125, 0.06, SEG, 1, true), mA, sh, s * 0.03, -0.08, 0).scale.z = 1.15;
      mk(new T.CylinderGeometry(0.095, 0.112, 0.05, SEG, 1, true), mA, sh, s * 0.025, -0.13, 0).scale.z = 1.1;
    }
    if (!PLN) mk(limb(0.07, 0.06, 0.27), mU, sh);
    if (!PLN) mk(new T.CylinderGeometry(0.078, 0.078, 0.03, SEG), mT, sh, 0, -0.15, 0);
    if (o.stripe && s === -1) mk(new T.CylinderGeometry(0.088, 0.08, 0.09, SEG, 1, true), M(o.stripe, { map: clothTex, side: T.DoubleSide }), sh, 0, -0.215, 0); // a corporal's stripe: a band of cloth round the sword arm (the shield hides the other)
    const el = (J[b] = joint(sh, 0, -0.27, 0));
    if (PLN && o.robe) mk(folded('cuff', [[0.064, 0.012], [0.066, -0.08], [0.072, -0.2], [0.088, -0.264], [0.07, -0.27]], (a, v) => 0.045 * sat(1 - Math.abs(v - 0.45) / 0.4) * (0.45 + 0.55 * Math.cos(a + 0.8)) * Math.sin(v * 19 + 1.8 * Math.sin(a + 2)), 24, 14), mB, el); // a long sleeve, widening to the wrist
    else if (PLN && mWr) { mk(limb(0.056, 0.044, 0.25), mWr, el); mk(band(0.058, 0.02), mU, el, 0, 0.005, 0).rotation.x = PI / 2; mk(band(0.047, 0.007), mWd, el, 0, -0.236, 0).rotation.set(PI / 2 + 0.3, 0, 0); } // a rolled sleeve, and the forearm bound in cloth strips
    else if (PLN) { mk(limb(0.055, 0.043, 0.25), mSkin, el); mk(new T.CylinderGeometry(0.064, 0.06, 0.04, SEG), mU, el, 0, 0.0, 0); mk(new T.CylinderGeometry(0.049, 0.047, 0.05, SEG), mD, el, 0, -0.215, 0); } // a bare forearm below a rolled sleeve, and a leather wrist wrap
    else { mk(limb(0.062, 0.088, 0.25), mA, el); mk(ball(0.066), mT, el, 0, 0, -0.015);
    mk(new T.CylinderGeometry(0.098, 0.098, 0.03, SEG), mT, el, 0, -0.235, 0); }
    if (mJ) { mk(limb(0.063, 0.052, 0.19), mJ, el, 0, -0.035, 0); for (const y of [-0.075, -0.175]) mk(band(0.06 - (y < -0.1 ? 0.006 : 0), 0.006), mJd, el, 0, y, 0).rotation.x = PI / 2; } // a bracer, buckled twice
    if (!PLN) { const cw = mk(slab(0.1, 0.12, 0.02, 0.04), mA, el, s * 0.072, 0.0, -0.02); cw.rotation.order = 'XZY'; cw.rotation.set(0, PI / 2, s * 0.22); } // couter wing
    if (!PLN) mk(new T.CylinderGeometry(0.112, 0.092, 0.085, SEG, 1, true), mF, el, 0, -0.175, 0); // flared gauntlet cuff
    const ha = (J[c] = joint(el, 0, -0.25, 0));
    // a closed gauntlet: wrist, palm, curled fingers and a thumb (it used to be one block)
    const mH = PLN ? mSkin : mD; // a bare hand, or a gauntlet
    if (PLN) { // a bare hand, rounded: wrist, palm, the fingers curled in, the thumb forward
      mk(new T.CylinderGeometry(0.04, 0.037, 0.035, 10), mH, ha, 0, -0.012, 0); mk(ball(0.05), mH, ha, 0, -0.052, 0.002).scale.set(0.62, 0.92, 0.95);
      const fg = mk(ball(0.046), mH, ha, -s * 0.013, -0.094, 0.004); fg.scale.set(0.56, 0.78, 0.95); fg.rotation.z = -s * 0.45; const tb = mk(ball(0.02), mH, ha, -s * 0.018, -0.062, 0.052); tb.scale.set(0.85, 1.7, 0.85); tb.rotation.x = -0.5;
    } else {
    mk(new T.CylinderGeometry(0.05, 0.046, 0.03, 10), mH, ha, 0, -0.012, 0); mk(rbox(0.07, 0.06, 0.092, 0.024), mH, ha, 0, -0.05, 0);
    mk(rbox(0.066, 0.05, 0.088, 0.022), mH, ha, -s * 0.012, -0.088, 0.004).rotation.z = -s * 0.45; mk(rbox(0.03, 0.055, 0.032, 0.013), mH, ha, -s * 0.02, -0.06, 0.058).rotation.x = -0.5;
    }
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
    if (mWr) { mk(limb(0.104 * LG, 0.086 * LG, 0.42), mU, th); mk(ball(0.088 * LG), mU, th, 0, -0.37, 0.004).scale.set(1, 0.72, 1.02); } // loose trousers, gathered below the knee
    else mk(limb(0.095 * LG, 0.075 * LG, 0.42), mU, th);
    if (!PLN) mk(rbox(0.14 * LG, 0.23, 0.075 * LG, 0.034 * LG), mA, th, 0, -0.16, 0.058 * LG);
    const kn = (J[b] = joint(th, 0, -0.42, 0));
    if (mWr) { // the shin bound in cloth strips down to a low shoe
      mk(ball(0.068 * LG), mU, kn, 0, 0, 0.012 * LG); mk(limb(0.071 * LG, 0.05 * LG, 0.38), mWr, kn); mk(ball(0.062 * LG), mWr, kn, 0, -0.13, -0.022 * LG).scale.set(0.95, 1.6, 0.85);
      mk(band(0.054 * LG, 0.007), mWd, kn, 0, -0.33, -0.004).rotation.set(PI / 2 + 0.28, 0, 0); mk(band(0.074 * LG, 0.007), mWd, kn, 0, -0.045, -0.004).rotation.set(PI / 2 + 0.2, 0, 0);
    } else if (PLN) { // trousers into a tall soft boot with a turned-down top
      mk(ball(0.07 * LG), mU, kn, 0, 0, 0.012 * LG); mk(limb(0.074 * LG, 0.056 * LG, 0.38), mD, kn); mk(new T.CylinderGeometry(0.083 * LG, 0.078 * LG, 0.05, SEG), mT, kn, 0, -0.06, 0);
      mk(ball(0.066 * LG), mD, kn, 0, -0.14, -0.024 * LG).scale.set(0.95, 1.6, 0.85);
    } else {
    mk(ball(0.072 * LG), mT, kn, 0, 0, 0.035 * LG); mk(limb(0.078 * LG, 0.06 * LG, 0.38), mA, kn);
    mk(rbox(0.03, 0.3, 0.03, 0.013), mT, kn, 0, -0.2, 0.062 * LG);
    mk(ball(0.07 * LG), mA, kn, 0, -0.13, -0.028 * LG).scale.set(0.95, 1.6, 0.85); // calf
    mk(new T.CylinderGeometry(0.1 * LG, 0.1 * LG, 0.028, SEG), mT, th, 0, -0.05, 0); mk(rbox(0.146 * LG, 0.03, 0.08 * LG, 0.012), mT, th, 0, -0.265, 0.058 * LG); // thigh strap, cuisse edge
    }
    if (mJ) { mk(limb(0.082 * LG, 0.064 * LG, 0.3), mJ, kn, 0, -0.07, 0); for (const y of [-0.11, -0.3]) mk(band((y < -0.2 ? 0.068 : 0.08) * LG, 0.006), mJd, kn, 0, y, 0).rotation.x = PI / 2; mk(ball(0.074 * LG), mJ, kn, 0, 0.0, 0.03 * LG).scale.set(1, 1.05, 0.7); } // leather greaves strapped over the boots, and a knee cap
    if (o.knees) { // a knee cop with a swept wing on the outside, over a tall greave
      mk(ball(0.085 * LG), mA, kn, 0, 0.01, 0.05).scale.set(1.15, 1.05, 0.8);
      const wg = mk(slab(0.11, 0.17, 0.02, 0.045), mA, kn, s * 0.085 * LG, 0.05, 0.02); wg.rotation.order = 'XZY'; wg.rotation.set(-0.15, PI / 2, -s * 0.45);
      mk(new T.CylinderGeometry(0.095 * LG, 0.088 * LG, 0.12, SEG, 1, true), mA, kn, 0, -0.08, 0.008);
    }
    const an = (J[c] = joint(kn, 0, -0.38, 0));
    if (o.knees) mk(new T.CylinderGeometry(0.085 * LG, 0.095 * LG, 0.05, SEG), mA, an, 0, 0.03, 0.01);
    if (PLN) { mk(ball(0.06 * LG), mD, an, 0, -0.02, 0.012).scale.set(0.95, 0.8, 1.2); mk(ball(0.06 * LG), mD, an, 0, -0.034, 0.118).scale.set(0.92, 0.58, 1.5); mk(rbox(0.1 * LG, 0.018, 0.27 * LG, 0.008), mT, an, 0, -0.06, 0.058); } // a soft shoe on a leather sole, not a block
    else mk(rbox(0.115 * LG, 0.09 * LG, 0.27 * LG, 0.04 * LG), mD, an, 0, -0.025, 0.055);
    if (!PLN) mk(rbox(0.1 * LG, 0.03, 0.15 * LG, 0.013), mA, an, 0, 0.022 * LG, 0.06).rotation.x = 0.2; // sabaton plate mk(new T.BoxGeometry(0.12 * LG, 0.06 * LG, 0.09), mT, an, 0, -0.04, 0.16 * LG);
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
  } else if (o.weapon === 'javelin') { // a light throwing spear held at its middle: ash shaft, small iron head
    const mW = M(0x7a5634); mk(new T.CylinderGeometry(0.015, 0.015, 1.6, 6), mW, w, 0, 0, len / 2 - 0.25).rotation.x = PI / 2;
    const hd = mk(new T.ConeGeometry(0.032, 0.2, 4), mS, w, 0, 0, len / 2 + 0.65); hd.rotation.x = PI / 2; // (at the shaft's far end)
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
  J.shield = joint(J.elL, 0.075, -0.11, 0); let shieldMat = null;
  if (o.shield != null) {
    const sp = new T.Shape(); sp.moveTo(-0.22, 0.27); sp.lineTo(0.22, 0.27); sp.lineTo(0.22, -0.04); sp.lineTo(0, -0.35); sp.lineTo(-0.22, -0.04); sp.closePath();
    const sm = shieldMat = M(0xffffff, { map: shields[o.shield] });
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
  return { root, J, mats, shieldMat, wBase, wTip, bladeMat: o.weapon ? mS : mBlade, cape, eye: mEye };
}
