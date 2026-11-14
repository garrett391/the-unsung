import * as T from 'three';
import { PI, rng } from '../core/util.js';
import { toon, TEX, canvasTex } from '../gfx/materials.js';
import { DECAL, decals } from '../gfx/decals.js';
import { PZ } from '../actors/anim.js';
import { LOOKS } from '../actors/data.js';
import { wreckage } from './halls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The forecourt (prologue; owner, Nov 2026): where the game opens, in front of the building whose
// halls lead down to the vault. A walled court under a sky full of smoke; the realm's last stand was
// made here, at a barricade across the middle, and it was broken. He comes in by the north gate and
// crosses to the doors in the south front, where the Door's light shows and glass has begun to grow
// out of the stone. Lit to say where to go: red light and long shadows across the court, and the one
// cold light in it is the doorway. Local coordinates: x east, z north, the middle of the court at 0;
// everything is placed in the world at FORE. Stone and glass are the vault's kit (level.js).
export const FORE = { x: -150, z: 60 };
const R = (x0, x1, z0, z1) => ({ x0: FORE.x + x0, x1: FORE.x + x1, z0: FORE.z + z0, z1: FORE.z + z1 });
export const FCOURT = R(-10.9, 10.9, -13.05, 14.2), FGATE = R(-2.1, 2.1, 12.4, 20), FDOOR = R(-1.35, 1.35, -16.6, -11.4); // the court, the way in under the gate arch, the doorway

export function buildFore(scene, kit) {
  const obs = [], q = rng(613), Q = (a, b) => a + q() * (b - a), X = (x) => FORE.x + x, Z = (z) => FORE.z + z;
  const { tex, ashlar, paving, veinTex, cluster, shard, mIron } = kit;
  const block = (x, z, r) => obs.push({ x: X(x), z: Z(z), r });
  const V = (x, y, z) => new T.Vector3(x, y, z), M = new T.Matrix4(), qt = new T.Quaternion(), eu = new T.Euler(), ONE = V(1, 1, 1);
  // Nothing here moves, so every piece is baked into place and merged: one mesh per material.
  const bins = new Map();
  const put = (geo, mat, x, y, z, ry = 0, rx = 0, rz = 0) => { const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(M.compose(V(X(x), y, Z(z)), qt.setFromEuler(eu.set(rx, ry, rz)), ONE)); if (!bins.has(mat)) bins.set(mat, []); bins.get(mat).push(g); };
  // boxes and drums whose texture coordinates are in metres, so stone courses are one size on everything
  const tbox = (w, h, d) => { const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); } return g; };
  const tcyl = (rt, rb, h, n = 20) => { const g = new T.CylinderGeometry(rt, rb, h, n), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * PI * rb, uv.getY(i) * h); return g; };
  const box = (w, h, d, mat, x, y, z, ry, rx, rz) => put(tbox(w, h, d), mat, x, y, z, ry, rx, rz);
  const stone = (c) => toon(c, { map: tex(ashlar, 1 / 3.9, 1 / 2.6) });
  const mWall = stone(new T.Color(1.2, 1.06, 0.97)), mKeep = stone(0x988c8a), // (the vault's stone is painted dark, for its own light: out here it is lifted)
     mTrim = stone(new T.Color(1.5, 1.36, 1.24)), mSlate = toon(0x2c2830), mWood = toon(0x4a3524), mChar = toon(0x1a1513), mDark = new T.MeshBasicMaterial({ color: 0x070506 });
  const mCrate = toon(0xffffff, { map: TEX.crate }), mBarrel = toon(0xffffff, { map: TEX.barrel }), mBanner = toon(0xffffff, { map: TEX.banner, side: T.DoubleSide, alphaTest: 0.5 });

  // ---- ground: the court's paving, running out under the gate and in under the doors; a worn road outside
  const flat = (w, d, mat, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, d), mat); m.rotation.x = -PI / 2; m.position.set(X(x), y, Z(z)); m.receiveShadow = true; scene.add(m); return m; };
  flat(24.6, 33.6, toon(new T.Color(1.35, 1.22, 1.1), { map: tex(paving, 24.6 / 2.9, 33.6 / 2.9) }), 0, 0.012, -1.6);
  flat(5.2, 9, toon(0xb8aa9c, { map: tex(paving, 2, 3) }), 0, 0.012, 19.6);
  flat(7.4, 4.4, toon(0xa89c94, { map: tex(paving, 3, 2) }), 0, 0.02, -11.3); // a darker apron before the doors

  // ---- the enclosing walls: dressed stone, a walk along the top behind what is left of the battlements
  const WH = 6.4, XW = 11.6, ZN = 14.9;
  const run = (x0, z0, x1, z1, bite) => { const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) + PI / 2, ux = (x1 - x0) / len, uz = (z1 - z0) / len, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    box(len, WH, 1.2, mWall, mx, WH / 2, mz, ry); box(len, 0.9, 1.5, mKeep, mx, 0.45, mz, ry); box(len, 0.24, 1.5, mTrim, mx, WH + 0.12, mz, ry);
    for (let s = 0.7; s < len - 0.6; s += 1.7) { if (q() < 0.22 || (bite && Math.abs(s - bite) < 2.6)) continue; box(0.9, 0.8, 0.5, mWall, x0 + ux * s, WH + 0.64, z0 + uz * s, ry); } }; // merlons, with gaps where they have been knocked off
  run(-XW, -13.4, -XW, ZN + 0.6); run(XW, -13.4, XW, ZN + 0.6, 17); run(-XW - 0.6, ZN, -3.4, ZN); run(3.4, ZN, XW + 0.6, ZN);
  for (const sd of [-1, 1]) for (const z of [-6.5, 0.5, 7.5]) { box(0.7, 4.6, 1.0, mWall, sd * (XW - 0.75), 2.3, z); box(0.7, 0.9, 1.0, mKeep, sd * (XW - 0.85), 4.75, z, 0, 0, sd * 0.5); } // buttresses
  // the east wall has taken something heavy: a bite out of its top, and what came down lying at its foot
  { for (let i = 0; i < 16; i++) { const s = Q(0.3, 0.9); put(tbox(s * 1.5, s, s), mWall, XW - 1.2 - Q(0, 2.4), s * 0.4, 3.4 + Q(-2.6, 2.6), Q(0, 3), Q(-0.4, 0.4), Q(-0.4, 0.4)); } block(XW - 1.9, 3.4, 1.5); block(XW - 1.6, 1.6, 1.0); block(XW - 1.6, 5.2, 1.0); }
  // the gate: two square towers and an arch between them; one leaf hangs from a hinge, the other lies in the court
  for (const sd of [-1, 1]) { box(2.2, 8.4, 2.4, mWall, sd * 3.5, 4.2, ZN); box(2.5, 1.0, 2.7, mKeep, sd * 3.5, 0.5, ZN); box(2.5, 0.3, 2.7, mTrim, sd * 3.5, 8.55, ZN); for (const a of [-1, 1]) for (const b of [-1, 1]) if (!(sd > 0 && a > 0 && b < 0)) box(0.7, 0.7, 0.7, mWall, sd * 3.5 + a * 0.85, 9.05, ZN + b * 0.95); }
  { const sh = new T.Shape(); sh.moveTo(-2.4, 3.5); sh.absellipse(0, 3.5, 2.4, 1.5, PI, 0, true); sh.lineTo(2.4, 6.9); sh.lineTo(-2.4, 6.9); sh.lineTo(-2.4, 3.5);
    put(new T.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false, curveSegments: 18 }), mWall, 0, 0, ZN - 0.8); box(5.0, 0.26, 1.9, mTrim, 0, 7.03, ZN);
    box(2.3, 4.4, 0.14, mWood, -2.55, 2.3, ZN - 1.5, -1.05, 0, 0.07); for (const y of [0.9, 2.3, 3.7]) box(2.34, 0.12, 0.17, mIron, -2.55, y, ZN - 1.5, -1.05, 0, 0.07); // hanging open, off true
    box(2.3, 0.14, 4.4, mWood, 3.9, 0.1, 9.6, 0.5); for (const o of [-1.4, 0, 1.4]) box(2.34, 0.17, 0.12, mIron, 3.9 + Math.sin(0.5) * o, 0.12, 9.6 + Math.cos(0.5) * o, 0.5); } // torn off and thrown down

  // ---- the south front: a tall middle tower with the doors in it, a wing either side, a round turret at each end
  const ZF = -13.4, TW = 7.2, TH = 16.5, DW = 1.5, DS = 2.9; // the tower's face; the doorway's half-width and springing
  { const sh = new T.Shape(); sh.moveTo(-TW / 2, 0); sh.lineTo(TW / 2, 0); sh.lineTo(TW / 2, TH); sh.lineTo(-TW / 2, TH); sh.lineTo(-TW / 2, 0);
    const hl = new T.Path(); hl.moveTo(-DW, 0); hl.lineTo(DW, 0); hl.lineTo(DW, DS); hl.absarc(0, DS, DW, 0, PI, false); hl.lineTo(-DW, 0); sh.holes.push(hl);
    put(new T.ExtrudeGeometry(sh, { depth: 4.6, bevelEnabled: false, curveSegments: 20 }), mKeep, 0, 0, ZF - 4.6); // the doorway is a passage through its whole depth
    put(new T.TorusGeometry(DW + 0.16, 0.2, 8, 24, PI), mTrim, 0, DS, ZF + 0.04); for (const sd of [-1, 1]) { put(new T.CylinderGeometry(0.2, 0.2, DS, 12), mTrim, sd * (DW + 0.16), DS / 2, ZF + 0.04); put(new T.CylinderGeometry(0.3, 0.3, 0.3, 12), mTrim, sd * (DW + 0.16), 0.15, ZF + 0.04); }
    put(new T.TorusGeometry(DW + 0.62, 0.13, 6, 24, PI), mTrim, 0, DS, ZF + 0.03); box(0.7, 0.9, 0.5, mTrim, 0, DS + DW + 0.55, ZF + 0.1); // an outer order, and a keystone
    for (const y of [6.4, 13.2]) box(TW + 0.3, 0.3, 4.9, mTrim, 0, y, ZF - 2.3); // string courses
    for (const sd of [-1, 1]) { box(1.0, TH, 0.6, mKeep, sd * (TW / 2 - 0.42), TH / 2, ZF + 0.25); box(1.1, 1.2, 0.8, mTrim, sd * (TW / 2 - 0.45), 0.6, ZF + 0.3); } // corner pilasters
    box(TW + 0.8, 0.7, 5.4, mTrim, 0, TH + 0.35, ZF - 2.3); for (let i = 0; i < 5; i++) for (const b of [-1, 1]) box(0.9, 0.9, 0.6, mKeep, -3.2 + i * 1.6, TH + 1.15, ZF - 2.3 + b * 2.3);
    { const g = new T.ConeGeometry(4.4, 8.5, 4); g.rotateY(PI / 4); put(g, mSlate, 0, TH + 0.7 + 4.25, ZF - 2.3); put(new T.CylinderGeometry(0.05, 0.09, 1.8, 6), mIron, 0, TH + 9.9, ZF - 2.3); }
    // the round window over the doors: iron tracery, its glass gone dark, and the Usurper's glass pushing out through it
    put(new T.TorusGeometry(1.45, 0.2, 8, 28), mTrim, 0, 9.7, ZF + 0.05); for (let i = 0; i < 4; i++) box(2.9, 0.07, 0.07, mIron, 0, 9.7, ZF + 0.06, 0, 0, i * PI / 4); put(new T.TorusGeometry(0.62, 0.04, 6, 20), mIron, 0, 9.7, ZF + 0.06);
    { const m = new T.Mesh(new T.CircleGeometry(1.45, 28), new T.MeshBasicMaterial({ color: new T.Color(0.035, 0.1, 0.095) })); m.position.set(X(0), 9.7, Z(ZF + 0.03)); scene.add(m); }
    for (const [x, y, w] of [[-2.1, 14.6, 0.34], [2.1, 14.6, 0.34], [-2.1, 7.6, 0.3], [2.1, 7.6, 0.3]]) { const m = new T.Mesh(new T.PlaneGeometry(w, 1.5), mDark); m.position.set(X(x), y, Z(ZF + 0.03)); scene.add(m); } // loops
  }
  // inside the doorway: the leaves stand open against the passage walls, and past them it is dark, with the Door's light coming up from below
  for (const sd of [-1, 1]) { box(0.13, 3.6, 1.5, mWood, sd * (DW - 0.14), 1.8, ZF - 1.5, sd * 0.12); for (const y of [0.7, 1.9, 3.1]) box(0.17, 0.12, 1.52, mIron, sd * (DW - 0.14), y, ZF - 1.5, sd * 0.12); }
  { const t = canvasTex(64, (g, n) => { const gr = g.createLinearGradient(0, 0, 0, n); gr.addColorStop(0, '#020303'); gr.addColorStop(0.45, '#061413'); gr.addColorStop(0.8, '#1c5a52'); gr.addColorStop(1, '#3f9a8c'); g.fillStyle = gr; g.fillRect(0, 0, n, n);
      g.fillStyle = 'rgba(2,3,3,.55)'; for (let k = 0; k < 4; k++) g.fillRect(0, n * (0.74 + k * 0.07), n, n * 0.016); }); // the first treads of the stair down, their edges dark against the light
    const m = new T.Mesh(new T.PlaneGeometry(DW * 2, DS + DW), new T.MeshBasicMaterial({ map: t })); m.position.set(X(0), (DS + DW) / 2, Z(ZF - 3.3)); scene.add(m); }
  const doorL = new T.PointLight(0x7fe0d0, 14, 15, 2); doorL.position.set(X(0), 1.6, Z(ZF - 1.2)); doorL.userData.base = 14; scene.add(doorL);
  // the wings, with two tall windows each, and the body of the building behind
  const WGH = 9.8, ZW = -14.2;
  for (const sd of [-1, 1]) {
    box(7.0, WGH, 3.0, mKeep, sd * 7.1, WGH / 2, ZW - 1.5); box(7.0, 1.1, 0.8, mTrim, sd * 7.1, 0.55, ZW + 0.3); box(7.2, 0.3, 3.2, mTrim, sd * 7.1, WGH + 0.15, ZW - 1.5); box(7.0, 0.22, 0.3, mTrim, sd * 7.1, 6.4, ZW + 0.1);
    for (let i = 0; i < 5; i++) if (!(sd < 0 && i > 2)) box(0.9, 0.8, 0.5, mKeep, sd * (4.2 + i * 1.45), WGH + 0.7, ZW - 0.3);
    for (const wx of [5.3, 8.6]) { const sp = new T.Shape(); sp.moveTo(-0.55, 0); sp.lineTo(0.55, 0); sp.lineTo(0.55, 2.6); sp.absarc(0, 2.6, 0.55, 0, PI); sp.lineTo(-0.55, 0);
      const m = new T.Mesh(new T.ShapeGeometry(sp, 12), mDark); m.position.set(X(sd * wx), 2.4, Z(ZW + 0.04)); scene.add(m);
      put(new T.TorusGeometry(0.66, 0.11, 6, 16, PI), mTrim, sd * wx, 5.0, ZW + 0.06); for (const k of [-1, 1]) put(new T.CylinderGeometry(0.11, 0.11, 2.6, 8), mTrim, sd * wx + k * 0.66, 3.7, ZW + 0.06); box(1.6, 0.16, 0.3, mTrim, sd * wx, 2.36, ZW + 0.1);
      for (const k of [-0.2, 0.2]) box(0.045, 3.1, 0.045, mIron, sd * wx + k, 3.95, ZW + 0.05); }
  }
  box(27, 12.5, 14, mKeep, 0, 6.25, -24.6); { const sh = new T.Shape(); sh.moveTo(-7.4, 0); sh.lineTo(7.4, 0); sh.lineTo(0, 6.2); sh.lineTo(-7.4, 0); const g = new T.ExtrudeGeometry(sh, { depth: 27.4, bevelEnabled: false }); g.rotateY(PI / 2); put(g, mSlate, -13.7, 12.5, -24.6); } // the hall roof, ridge east to west
  // the turrets: the east one whole under its cap; the west one's cap is gone and glass stands out of it against the sky
  for (const sd of [-1, 1]) { const x = sd * 11.7, z = -14.7, h = sd < 0 ? 11.2 : 12.6;
    put(tcyl(2.0, 2.15, h), mKeep, x, h / 2, z); put(tcyl(2.3, 2.3, 0.9, 20), mTrim, x, 0.45, z); put(new T.CylinderGeometry(2.25, 2.0, 0.5, 20), mTrim, x, h - 2.2, z);
    if (sd > 0) { put(new T.CylinderGeometry(2.3, 2.05, 0.4, 20), mTrim, x, h + 0.2, z); put(new T.ConeGeometry(2.6, 5.2, 20), mSlate, x, h + 0.4 + 2.6, z); }
    else { for (let i = 0; i < 9; i++) { const a = i * 0.7, hh = Q(0.3, 1.5); put(tbox(0.9, hh, 0.5), mKeep, x + Math.sin(a) * 1.75, h + hh / 2 - 0.05, z + Math.cos(a) * 1.75, a); }
      cluster(X(x + 0.2), h - 0.4, Z(z + 0.3), 3.4, 0.22); cluster(X(x - 0.7), h - 0.3, Z(z - 0.2), 2.2, -0.35); cluster(X(x + 0.9), h - 0.3, Z(z + 0.9), 1.6, 0.5); }
    for (const y of [4.2, 8.2]) { const m = new T.Mesh(new T.PlaneGeometry(0.3, 1.3), mDark); m.position.set(X(x - sd * 0.9), y, Z(z + 1.96)); m.rotation.y = -sd * 0.45; scene.add(m); } }
  // more of the place beyond the walls, dark against the sky
  for (const [x, z, w, h, cap] of [[-24, -30, 5, 19, 1], [22, -34, 6, 15, 0], [31, -12, 5, 12, 1], [-30, 6, 6, 11, 0], [-21, 24, 4.5, 13, 1], [26, 18, 5, 10, 0], [14, -44, 7, 22, 1]]) {
    box(w, h, w, mSlate, x, h / 2, z, 0.3); if (cap) { const g = new T.ConeGeometry(w * 0.82, w * 1.3, 4); g.rotateY(PI / 4 + 0.3); put(g, mSlate, x, h + w * 0.65, z); } else for (let i = 0; i < 4; i++) box(w * 0.3, 0.9, w * 0.3, mSlate, x + (i % 2 ? 1 : -1) * w * 0.36, h + 0.4, z + (i < 2 ? 1 : -1) * w * 0.36, 0.3); }

  // ---- glass: out of the doorway and along the foot of the front, thickest at the doors; veins in the paving before them
  for (const [x, z, h, lean] of [[-2.1, ZF + 0.5, 1.5, 0.3], [2.2, ZF + 0.4, 1.1, -0.35], [-3.3, ZF + 0.3, 0.7, 0.2], [3.4, ZF + 0.5, 0.8, -0.15], [-5.9, ZW + 0.9, 0.9, 0.3], [7.4, ZW + 0.8, 0.6, -0.4], [-1.25, ZF - 1.0, 0.6, -0.5], [1.2, ZF - 2.0, 0.7, 0.5]]) cluster(X(x), 0.02, Z(z), h, lean);
  block(-2.1, ZF + 0.5, 0.6); block(2.2, ZF + 0.4, 0.5);
  for (let i = 0; i < 5; i++) { const a = Q(0, 6.3); shard(X(Math.cos(a) * Q(0.3, 1.2)), 9.7 + Math.sin(a) * Q(0.3, 1.2), Z(ZF + 0.08), Q(0.5, 1.1), PI / 2 + Q(-0.5, 0.5), Q(-0.6, 0.6), 0); } // through the round window
  for (const [x, y, sd] of [[-5.3, 4.4, -1], [-8.6, 3.2, -1], [5.3, 5.2, 1]]) for (let n = 0; n < 3; n++) shard(X(x + Q(-0.2, 0.2)), y + Q(-0.3, 0.3), Z(ZW + 0.08), Q(0.3, 0.7), PI / 2 + Q(-0.6, 0.1), Q(-0.5, 0.5), 0); // and the wings' windows
  { const m = new T.Mesh(new T.PlaneGeometry(9, 7), new T.MeshBasicMaterial({ map: veinTex(1024, 512, 16, 83), color: new T.Color(0.3, 0.86, 0.76), transparent: true, blending: T.AdditiveBlending, depthWrite: false })); m.rotation.x = -PI / 2; m.rotation.z = PI / 2; m.position.set(X(0), 0.03, Z(ZF + 3.6)); m.renderOrder = 1; scene.add(m); }

  // ---- what stood in the court: a pair of obelisks either side of the way to the doors. One has been broken off short.
  for (const sd of [-1, 1]) { const x = sd * 5.4, z = 5.2; box(2.0, 0.5, 2.0, mTrim, x, 0.25, z); box(1.5, 1.1, 1.5, mKeep, x, 1.05, z); box(1.7, 0.2, 1.7, mTrim, x, 1.7, z); block(x, z, 1.25);
    const ob = (h, w0, w1) => { const g = new T.CylinderGeometry(w1, w0, h, 4); g.rotateY(PI / 4); return g; };
    if (sd > 0) { put(ob(6.4, 0.72, 0.42), mWall, x, 1.8 + 3.2, z); const g = new T.ConeGeometry(0.42, 0.7, 4); g.rotateY(PI / 4); put(g, mWall, x, 8.55, z); }
    else { put(ob(1.5, 0.72, 0.65), mWall, x, 2.55, z); put(ob(2.6, 0.64, 0.52), mWall, x + 1.6, 0.42, z - 2.2, 1.18, 0, PI / 2 - 0.04); put(ob(2.0, 0.5, 0.42), mWall, x + 2.6, 0.36, z - 4.7, 1.3, 0, PI / 2); block(x + 1.6, z - 2.2, 1.0); block(x + 2.6, z - 4.7, 0.8); // it fell south-east, clear of the way down the middle
      for (let i = 0; i < 9; i++) { const s = Q(0.15, 0.45); put(new T.DodecahedronGeometry(s, 0), mWall, x + Q(0.2, 3.4), s * 0.5, z + Q(-5.6, -0.4), Q(0, 3), Q(0, 3)); } } }

  // ---- the barricade: carts, casks and stakes dragged across the court, and broken through in the middle
  const BZ = -3.4;
  const cart = (x, z, ry, mat) => { const g = new T.Group(); g.position.set(X(x), 0, Z(z)); g.rotation.set(0, ry, 0); scene.add(g); const a = (geo, m, px, py, pz) => { const o = new T.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    const b = new T.Group(); b.rotation.z = 1.15; b.position.set(0.3, 0.75, 0); g.add(b); const ab = (geo, m, px, py, pz) => { const o = new T.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; b.add(o); return o; }; // on its side
    ab(new T.BoxGeometry(1.5, 0.12, 2.8), mat, 0, 0, 0); for (const k of [-1, 1]) { ab(new T.BoxGeometry(0.08, 0.6, 2.8), mat, k * 0.72, 0.3, 0); ab(new T.BoxGeometry(0.07, 0.07, 1.9), mat, k * 0.5, 0, 2.3); }
    for (const k of [-1, 1]) { const w = ab(new T.TorusGeometry(0.62, 0.07, 6, 18), mat, k * 0.86, -0.1, 0.2); w.rotation.y = PI / 2; for (let i = 0; i < 3; i++) { const s = ab(new T.BoxGeometry(0.05, 1.2, 0.05), mat, k * 0.86, -0.1, 0.2); s.rotation.x = i * PI / 3; } }
    a(new T.BoxGeometry(0.9, 0.5, 0.7), mat, -0.9, 0.25, 0.9).rotation.y = 0.4; block(x, z, 1.5); };
  cart(4.2, BZ, 0.25, mChar); cart(-6.6, BZ + 0.5, -0.2, mWood);
  const frise = (x, z, ry, broken) => { const len = broken ? 1.5 : 3.0; put(new T.CylinderGeometry(0.1, 0.1, len, 7), mWood, x, 0.62, z, ry, 0, PI / 2); // a log set with crossed stakes
    for (let s = -len / 2 + 0.3; s < len / 2; s += 0.55) for (const k of [-1, 1]) { put(new T.CylinderGeometry(0.02, 0.05, 1.7, 5), mWood, x + Math.cos(ry) * s, 0.62, z - Math.sin(ry) * s, ry, k * 0.85, 0); } block(x, z, len * 0.42); };
  frise(-3.3, BZ, 0.1); frise(8.3, BZ - 0.3, -0.15); frise(1.9, BZ - 1.5, 1.0, true);
  for (const [x, z, s, r] of [[6.4, BZ + 0.6, 0.9, 0.3], [7.2, BZ + 0.9, 0.7, 1.1], [-9.4, BZ + 0.2, 0.9, 0.2], [-9.2, BZ + 0.1, 0.62, 0.9]]) { const top = s < 0.8 && x < 0; box(s, s, s, mCrate, x, s / 2 + (top ? 0.9 : 0), z, r); if (!top) block(x, z, s * 0.75); }
  for (const [x, z, down] of [[-8.3, BZ - 0.6, 0], [9.9, BZ + 0.3, 0], [0.6, BZ + 1.6, 1], [-1.6, BZ - 2.2, 1]]) { put(new T.CylinderGeometry(0.34, 0.3, 0.9, 12), mBarrel, x, down ? 0.33 : 0.45, z, Q(0, 3), 0, down ? PI / 2 : 0); block(x, z, 0.45); }
  for (const [x, z, ry, t] of [[-1.2, BZ + 0.4, 0.4, 0.5], [0.4, BZ - 0.6, 2.1, 0.62], [2.9, BZ + 1.6, -0.6, 0.45], [-4.8, BZ - 1.4, 1.3, 0.55], [5.6, 9.4, 0.2, 0.7], [-2.2, -9.2, 2.6, 0.5]]) put(new T.CylinderGeometry(0.02, 0.02, 2.3, 6), mWood, x, 1.0, z, ry, t, 0); // spears left standing in the ground, and in what they hit

  // ---- fire: the burnt cart, a heap of timbers by the west wall, a brazier kicked over by the gate
  const lights = [], fireAt = (x, y, z, s, li) => { kit.fire(X(x), y, Z(z), s); if (li) { const l = new T.PointLight(0xff7a30, li, 17, 2); l.position.set(X(x), y + 0.9, Z(z)); l.userData.base = li; scene.add(l); lights.push(l); } };
  fireAt(4.3, 0.9, BZ + 0.1, 1.7, 15); fireAt(3.5, 0.3, BZ + 0.9, 1.0, 0);
  for (let i = 0; i < 7; i++) put(new T.BoxGeometry(0.16, 0.16, Q(1.4, 2.4)), mChar, -8.9 + Q(-0.6, 0.6), 0.2 + i * 0.07, 9.2 + Q(-0.5, 0.5), Q(0, 3), Q(-0.25, 0.25), 0); block(-8.9, 9.2, 1.1);
  fireAt(-8.9, 0.5, 9.2, 1.4, 12); fireAt(8.6, 0.2, -10.6, 0.8, 0);
  put(new T.CylinderGeometry(0.34, 0.2, 0.36, 10, 1, true), mIron, 2.9, 0.22, 11.6, 0, 0, 1.3); for (let i = 0; i < 3; i++) put(new T.CylinderGeometry(0.02, 0.02, 0.9, 5), mIron, 3.3 + i * 0.12, 0.05, 11.3 + i * 0.3, i, 0, PI / 2);

  // ---- colours: the realm's, hanging on the front; one has come down
  for (const [x, tilt] of [[-7.1, 0], [7.1, 0.5]]) { const b = new T.Mesh(new T.PlaneGeometry(1.3, 3.4, 1, 4), mBanner); b.position.set(X(x), 7.4 - tilt * 0.6, Z(ZW + 0.12)); b.rotation.z = tilt * 0.3; b.castShadow = true; scene.add(b); box(1.7, 0.08, 0.08, mWood, x, 9.14 - tilt * 0.3, ZW + 0.14, 0, 0, tilt * 0.3); }
  { const b = new T.Mesh(new T.PlaneGeometry(1.3, 3.4, 1, 4), mBanner); b.rotation.set(-PI / 2, 0, 0.8); b.position.set(X(-3.6), 0.035, Z(-8.4)); b.receiveShadow = true; scene.add(b); }

  // ---- the dead, and what they dropped. The realm's line held the barricade with a few knights among them; they are
  // thickest there and before the doors, where the last of them fell back to.
  const { sword, piece, spear, shield, helm, body } = wreckage(scene, X, Z, Q), KNIGHT = LOOKS.captain, LINE = LOOKS.line, GLASS = LOOKS.glass, bare = (l) => ({ ...l, shield: undefined, weapon: 'none' });
  const D = PZ.d2, B = PZ.down, PR = PZ.prone;
  [ [LINE, D, -2.2, BZ + 1.3, 2.4], [LINE, B, 1.3, BZ + 0.6, -0.7], [KNIGHT, PR, -0.4, BZ - 1.2, 3.0], [GLASS, B, 2.6, BZ + 2.6, 1.2], [LINE, PZ.side, -4.6, BZ + 1.4, 0.6], [GLASS, D, -0.9, BZ + 3.1, -2.2], [bare(LINE), PZ.back2, 6.0, BZ - 1.3, 2.0],
    [LINE, PZ.crawl, -3.9, BZ - 3.4, 3.0], [KNIGHT, B, 1.9, -8.6, 2.7], [LINE, D, -1.7, -10.2, -0.4], [GLASS, PR, 0.5, -7.2, 0.3], [bare(KNIGHT), PZ.sitDead, -3.0, -12.5, 0], [LINE, PZ.sitDead, 4.3, -12.55, 0], [GLASS, PZ.side, 3.4, -10.4, 1.8],
    [LINE, B, 7.8, 2.2, 0.9], [bare(LINE), PZ.crawl, -6.6, 9.9, 0.4], [LINE, D, 1.4, 4.6, 2.9], [GLASS, B, -7.9, -7.6, -1.1], [LINE, PZ.sitDead, 10.45, -7.0, -PI / 2], [KNIGHT, D, -8.6, 1.2, 1.6], [LINE, PR, 2.3, 10.6, 0.2],
  ].forEach(([look, pose, x, z, face]) => body(look, pose, x, z, face, { scale: Q(0.96, 1.04), pool: pose === PZ.crawl ? 0.5 : 0.85 }));
  shield(-1.5, BZ + 2.3, 0.6, 2); shield(0.9, BZ - 0.2, 2.2, 2, 0.15); shield(-3.4, BZ - 1.9, 1.3, 0); shield(5.2, BZ - 2.3, -0.7, 2); shield(2.9, -9.6, 0.4, 0, 0.12); shield(-0.8, -11.3, 2.7, 2); shield(8.6, 3.2, 1.9, 2); shield(-5.4, 9.0, -1.1, 2, 0.14); shield(3.0, BZ + 3.4, 1.0, 1);
  helm(-0.2, BZ + 1.9, 0.7, LINE); helm(4.9, -8.9, 2.1, LINE); helm(-2.6, -8.1, -0.6, KNIGHT); helm(-0.3, BZ + 4.0, 1.5, GLASS); helm(6.9, 1.2, 0.3, LINE);
  sword(-2.9, BZ + 2.2, 1.1); sword(2.1, BZ - 0.9, -0.5, false, 0.4); piece(2.8, BZ - 0.3, 1.2, false, 0.5); sword(0.2, -9.4, 2.4); sword(3.5, BZ + 1.9, 0.2, true); sword(-0.4, BZ + 2.4, -1.9, true, 0.4); piece(0.5, BZ + 2.9, 0.4, true, 0.5); sword(-7.0, -6.9, 0.8, true); sword(7.0, 2.9, -2.2); sword(-1.2, -9.4, 1.6);
  spear(-5.6, BZ - 0.6, 1.2, 2.3); spear(1.2, BZ + 4.6, -0.3, 2.3); spear(-3.6, -11.2, 1.9, 1.1, false); spear(6.8, -5.9, 0.5, 2.3); spear(-7.6, 7.2, 2.2, 2.3); spear(0.9, 8.2, 0.1, 1.0, false);

  // ---- wear on the ground: soot round the fires, ash blown across the court, cracks, the tracks of the fight, blood dragged toward the doors
  { const dec = (map, color, op) => { const d = decals(map, color, op); return { at: (x, z, ...r) => d.at(X(x), Z(z), ...r), done: () => d.done(scene) }; };
    const soot = dec(DECAL.soft, 0x0c0908, 0.82), ash = dec(DECAL.soft, 0x3c3431, 0.5), crack = dec(DECAL.crack, 0x0a0808, 0.85), prints = dec(DECAL.prints, 0x1c1614, 0.6), drag = dec(DECAL.soft, 0x2a0709, 0.7);
    soot.at(4.2, BZ + 0.3, 5.6, 5.0, 0.3); soot.at(-8.9, 9.2, 4.2, 4.0, 1.0); soot.at(8.6, -10.6, 2.2, 2.2, 0); soot.at(2.9, 11.5, 1.8, 1.6, 0.4);
    for (let i = 0; i < 16; i++) ash.at(Q(-10, 10), Q(-12, 13), Q(2.5, 5.5), Q(1.6, 3.4), Q(0, 6.3));
    for (let i = 0; i < 14; i++) { const s = Q(1.4, 3.2); crack.at(Q(-9.5, 9.5), Q(-12, 13), s, s, Q(0, 6.3), 0.034); }
    for (let i = 0; i < 12; i++) prints.at(Q(-6, 6), Q(-11, 12), 0.9, 3.4, Q(-0.5, 0.5) + (i % 3 ? 0 : PI), 0.036);
    drag.at(-2.9, -10.4, 0.7, 4.0, 0.05, 0.038); drag.at(4.25, -10.8, 0.6, 3.2, -0.08, 0.038); drag.at(-5.8, 9.2, 0.5, 2.0, 0.9, 0.038);
    for (const d of [soot, ash, crack, prints, drag]) d.done(); }
  { const parts = []; for (let i = 0; i < 60; i++) { const s = Q(0.06, 0.26), g = new T.DodecahedronGeometry(s, 0), edge = q() < 0.6, x = edge ? (q() < 0.5 ? -1 : 1) * Q(9.2, 10.7) : Q(-10, 10), z = edge ? Q(-12, 13.5) : Q(-12.5, 13.5); g.applyMatrix4(M.makeRotationFromEuler(eu.set(Q(0, 3), Q(0, 3), 0)).setPosition(X(x), s * 0.5, Z(z))); parts.push(g); }
    const m = new T.Mesh(mergeGeometries(parts), mTrim); m.castShadow = m.receiveShadow = true; scene.add(m); }

  for (const [mat, gs] of bins) { const m = new T.Mesh(mergeGeometries(gs), mat); m.castShadow = m.receiveShadow = !!mat.isMeshToonMaterial; scene.add(m); }

  // ---- the air: smoke standing over the place beyond the walls, the sun low and red in it, sparks going up off the fires
  const mSmoke = new T.SpriteMaterial({ map: TEX.glow, color: 0x0e0909, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  for (const [x, z, s] of [[-34, -44, 1.2], [30, -52, 1.5], [44, 6, 1.0], [-46, 20, 1.1], [6, -70, 1.7]]) for (let k = 0; k < 4; k++) { const p = new T.Sprite(mSmoke); p.position.set(X(x + k * 5 * s), 9 + k * 13 * s, Z(z + k * 2)); p.scale.set((18 + k * 12) * s, (20 + k * 10) * s, 1); scene.add(p); }
  { const p = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: new T.Color(0.95, 0.3, 0.12), transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: T.AdditiveBlending })); p.position.set(X(-190), 205, Z(120)); p.scale.setScalar(260); p.renderOrder = -2; scene.add(p);
    const c = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: new T.Color(1.3, 0.62, 0.3), transparent: true, opacity: 0.8, depthWrite: false, fog: false, blending: T.AdditiveBlending })); c.position.copy(p.position); c.scale.setScalar(70); c.renderOrder = -2; scene.add(c); }
  const NE = 150, ep = new Float32Array(NE * 3), eb = new Float32Array(NE * 4);
  for (let i = 0; i < NE; i++) eb.set([Q(-11, 11), Q(0, 9), Q(-13, 14), Q(0, 6.3)], i * 4);
  const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(ep, 3));
  const embers = new T.Points(eg, new T.PointsMaterial({ size: 0.07, map: TEX.glow, color: new T.Color(1.6, 0.6, 0.2), transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false })); embers.frustumCulled = false; scene.add(embers);
  const update = (t) => {
    for (let i = 0; i < NE; i++) { const ph = eb[i * 4 + 3], y = (eb[i * 4 + 1] + t * (0.35 + (ph % 1) * 0.5)) % 9; ep[i * 3] = X(eb[i * 4] + Math.sin(t * 0.5 + ph) * 0.6 + y * 0.25); ep[i * 3 + 1] = 0.3 + y; ep[i * 3 + 2] = Z(eb[i * 4 + 2] + Math.cos(t * 0.4 + ph * 2) * 0.6); }
    eg.attributes.position.needsUpdate = true;
    lights.forEach((l, i) => { l.intensity = l.userData.base * (0.84 + Math.sin(t * 9 + i * 3) * 0.1 + Math.sin(t * 23 + i) * 0.06); }); doorL.intensity = doorL.userData.base * (0.85 + Math.sin(t * 1.3) * 0.15);
  };
  update(0);
  return { obs, update };
}
