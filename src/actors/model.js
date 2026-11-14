import * as T from 'three';
import { PI } from '../core/util.js';
import { toon } from '../gfx/materials.js';
import { HIP } from './rig.js';

// Authored figures (glTF, in public/models): a skinned mesh hung on the same joints the
// procedural rig has, so poses, clips, locomotion and the captain's body layer drive it unchanged.
// A look names one with `model`; `buildModel` returns what `buildHumanoid` does.
//   grip: the sword's place in the fist, down the hand and across the palm (model units)
//   sword: [guard, tip] along the blade from the sword's origin    shine: the toon highlight
//   rim: how much of the look's rim light it takes (a painted texture needs far less than flat colour)
const FILES = {
  knight: { url: 'models/knight/scene.gltf', grip: [0.085, 0.0, 0.03], sword: [0.02, 1.1], hilt: 0.08, shine: 0.3, rim: 0.3 },
};
export const MODELS = {};

// Which of the model's bones each joint drives, and the bone that marks where it ends. Arms and
// legs are straightened at load to hang as the procedural rig's do at rest (the model is bound in
// an A-pose with bent elbows); the trunk, head and feet are taken as bound.
const MAP = [
  ['hips', 'spine', null], ['spine', 'stomach', 'hips'], ['chest', 'chest', 'spine'], ['neck', 'head', 'chest'],
  ['shL', 'upperarml', 'chest', 'forearml'], ['elL', 'forearml', 'shL', 'handl'], ['haL', 'handl', 'elL', 'fingersstartl'],
  ['shR', 'upperarmr', 'chest', 'forearmr'], ['elR', 'forearmr', 'shR', 'handr'], ['haR', 'handr', 'elR', 'fingersstartr'],
  ['thL', 'thighl', 'hips', 'shinl'], ['knL', 'shinl', 'thL', 'footl'], ['anL', 'footl', 'knL'],
  ['thR', 'thighr', 'hips', 'shinr'], ['knR', 'shinr', 'thR', 'footr'], ['anR', 'footr', 'knR'],
];
const FIST = ['fingersstart', 'fingersend', 'thumbstart', 'thumbend']; // closed as the file poses the right hand, which grips
const key = (n) => n.replace(/_\d+$/, '').replace(/[._]/g, '').toLowerCase();
const DOWN = new T.Vector3(0, -1, 0), ONE = new T.Matrix4(), NOQ = new T.Quaternion();

export async function loadModel(name) {
  if (MODELS[name]) return MODELS[name];
  const F = FILES[name], { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const g = await new GLTFLoader().loadAsync(F.url), skins = [];
  g.scene.updateMatrixWorld(true); g.scene.traverse((o) => o.isSkinnedMesh && skins.push(o));
  const sk = skins[0].skeleton, src = sk.bones, n = src.length, ix = {}, B = sk.boneInverses.map((m) => m.clone().invert());
  src.forEach((b, i) => (ix[key(b.name)] = i));
  const head = B.map((m) => new T.Vector3().setFromMatrixPosition(m)), par = src.map((b) => src.indexOf(b.parent));
  // where each joint sits with the limbs hanging straight, and the turn that straightens its bone
  const jp = {}, turn = {}, of = {};
  for (const [j, b, pj, tail] of MAP) {
    const i = ix[b], len = pj && of[pj].tail != null ? head[i].distanceTo(head[of[pj].i]) : 0;
    jp[j] = len ? jp[pj].clone().addScaledVector(DOWN, len) : head[i].clone(); of[j] = { i, tail: tail ? ix[tail] : null };
    turn[j] = tail ? new T.Quaternion().setFromUnitVectors(head[ix[tail]].clone().sub(head[i]).normalize(), DOWN) : new T.Quaternion();
  }
  jp.hips = new T.Vector3(0, jp.thL.y + 0.034, 0);
  // the whole figure is scaled so the straight leg is as long as the procedural one, which is what the poses' hip heights assume
  const fit = (jp.hips.y - jp.anL.y + head[ix.footl].y) / HIP, s = 1 / fit, off = {};
  for (const [j, , pj] of MAP) off[j] = pj ? jp[j].clone().sub(jp[pj]).multiplyScalar(s) : new T.Vector3(0, HIP, 0);
  const bones = src.map((b, i) => ({ name: b.name, parent: par[i], joint: null, m: par[i] < 0 ? B[i].clone() : B[par[i]].clone().invert().multiply(B[i]) }));
  for (const [j, b] of MAP) {
    const i = ix[b], at = j === 'hips' ? head[i] : jp[j];
    bones[i].joint = j;
    bones[i].m = new T.Matrix4().makeScale(s, s, s).multiply(new T.Matrix4().makeTranslation(at.x - jp[j].x, at.y - jp[j].y, at.z - jp[j].z)).multiply(new T.Matrix4().makeRotationFromQuaternion(turn[j]))
      .multiply(new T.Matrix4().makeTranslation(-head[i].x, -head[i].y, -head[i].z)).multiply(B[i]);
  }
  for (const b of bones) { b.p = new T.Vector3(); b.q = new T.Quaternion(); b.s = new T.Vector3(); b.m.decompose(b.p, b.q, b.s); }
  for (const f of FIST) { const r = ix[f + 'r'], l = ix[f + 'l']; if (r == null || l == null) continue; const q = src[r].quaternion; bones[r].q.copy(q); bones[l].q.set(q.x, -q.y, -q.z, q.w); }
  // things carried: the sword and shield go to the hand and the forearm; anything else stays on the bone it hangs from
  const props = {};
  for (const k of ['sword', 'shield', 'dagger']) {
    const o = g.scene.getObjectByName(k); if (!o) continue; let mesh = null; o.traverse((c) => c.isMesh && (mesh = c)); if (!mesh) continue;
    props[k] = { geo: mesh.geometry, bone: src.indexOf(o.parent), m: o.matrix.clone().multiply(mesh.matrix) };
  }
  // A skinned piece bound wholly to one limb bone (the knight's left pauldron, on the upper arm) is
  // made rigid and hung from the shoulder instead: straightening the arm swung it up off the body.
  const pieces = [], limbs = {}; for (const [j, b, , tail] of MAP) if (tail) limbs[ix[b]] = j;
  const flesh = skins.filter((m) => {
    const geo = m.geometry, ji = geo.attributes.skinIndex, wi = geo.attributes.skinWeight; let one = -1;
    for (let v = 0; v < ji.count; v++) { let b = 0; for (let k = 1; k < 4; k++) if (wi.getComponent(v, k) > wi.getComponent(v, b)) b = k; const bi = ji.getComponent(v, b); if (one < 0) one = bi; else if (one !== bi) return true; }
    const j = limbs[one]; if (!j) return true;
    const g = geo.clone(); g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.translate(-head[one].x, -head[one].y, -head[one].z); g.scale(s, s, s); pieces.push({ geo: g, joint: j }); return false;
  });
  const mat = skins[0].material;
  // the file asks for unfiltered, blocky texels (a retro look); here they are smoothed like every other surface
  for (const t of [mat.map]) if (t) { t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; }
  return (MODELS[name] = { ...F, bones, inverses: sk.boneInverses, skins: flesh.map((m) => m.geometry), pieces, props, map: mat.map, fit, s, off, ix });
}

export function buildModel(o) {
  const M = MODELS[o.model], s = M.s, root = new T.Group(), body = new T.Group(), J = {}, mats = [];
  body.scale.setScalar(M.fit * (o.size || 1)); root.add(body);
  for (const [j, , pj] of MAP) { const g = (J[j] = new T.Group()); g.position.copy(M.off[j]); (pj ? J[pj] : body).add(g); }
  const bones = M.bones.map((b) => { const n = new T.Bone(); n.name = b.name; n.position.copy(b.p); n.quaternion.copy(b.q); n.scale.copy(b.s); return n; });
  M.bones.forEach((b, i) => (b.joint ? J[b.joint] : b.parent >= 0 ? bones[b.parent] : J.hips).add(bones[i]));
  const skel = new T.Skeleton(bones, M.inverses);
  const mk = () => { const m = toon(0xffffff, { map: M.map, alphaTest: 0.5, side: T.DoubleSide, rim: new T.Color(o.rim == null ? 0x1c2a55 : o.rim).multiplyScalar(M.rim), shine: M.shine }); mats.push(m); return m; };
  const mB = mk(), mS = mk(); // the sword has its own, since blood and the charge tint it
  for (const geo of M.skins) { const m = new T.SkinnedMesh(geo, mB); m.bind(skel, ONE); m.castShadow = true; m.frustumCulled = false; root.add(m); }
  // rigid pieces turn with their limb by half, as a pauldron rides the shoulder rather than the arm
  const half = M.pieces.map((p) => { const pv = new T.Group(); pv.position.copy(J[p.joint].position); J[p.joint].parent.add(pv); const m = new T.Mesh(p.geo, mB); m.castShadow = true; pv.add(m); return [pv, J[p.joint]]; });
  const update = () => { for (const [pv, j] of half) pv.quaternion.slerpQuaternions(NOQ, j.quaternion, 0.5); };
  const hang = (k, parent, mat) => { const m = new T.Mesh(M.props[k].geo, mat); m.castShadow = true; parent.add(m); return m; };
  // weapon: blade along +Z of the hand, edge in the YZ plane, as on the procedural rig
  const w = new T.Group(); w.position.set(0, -M.grip[0] * s, M.grip[2] * s); J.haR.add(w);
  const armed = o.weapon !== 'none' && M.props.sword;
  if (armed) { const m = hang('sword', w, mS); m.scale.setScalar(s); m.rotation.y = PI; m.position.z = M.hilt * s; }
  const wBase = new T.Group(), wTip = new T.Group(); wBase.position.z = (M.hilt + M.sword[0] + 0.15) * s; wTip.position.z = (M.hilt + M.sword[1]) * s; w.add(wBase, wTip);
  J.shield = new T.Group(); J.shield.position.set(0.075, -0.11, 0); J.elL.add(J.shield);
  if (M.props.shield) {
    if (o.shield != null) { const m = hang('shield', J.shield, mB); m.scale.setScalar(s); m.rotation.set(0, 0, -PI / 2); m.position.set(-0.016, -0.04, 0.03); } // the forearm against the back of the board, across its middle
    else { const p = M.props.shield, m = hang('shield', bones[p.bone], mB); p.m.decompose(m.position, m.quaternion, m.scale); } // slung on the back, where the file has it
  }
  for (const k in M.props) if (k !== 'sword' && k !== 'shield') { const p = M.props[k], m = hang(k, bones[p.bone], mB); p.m.decompose(m.position, m.quaternion, m.scale); }
  return { root, J, mats, wBase, wTip, bladeMat: mS, cape: null, eye: new T.MeshBasicMaterial(), skel, update };
}
