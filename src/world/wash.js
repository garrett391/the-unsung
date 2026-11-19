import * as T from 'three';
import { G } from '../core/game.js';
import { PI, clamp, lerp, rng } from '../core/util.js';
import { toon, TEX } from '../gfx/materials.js';
import { FX } from '../gfx/fx.js';
import { DECAL, decals } from '../gfx/decals.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { openArea, openSheet, rockSet } from './front.js';

// The wash (Act I, excursion 1, "the lost caravan"): a sixth site, out past the frontier on the road in from the deep desert.
// Coordinates are local: x east, z north, from WASH. Built the way the frontier is (circles of walkable ground, a heightfield,
// a router through the circles: front.js), and from its kit.
//   south   a gravel plain, where the squad comes up from the picket along the caravans' track
//   then    the track goes down into a dry wash that winds north between banks, with a pocket off its west side (the narrows)
//   north   a wider bend, and in it the caravan, stopped: three wagons, no beasts, no drivers, the goods still on them, the
//           water casks stove in. Tracks lead on north out of the wash and up over the dunes, deeper in.
export const WASH = { x: -330, z: -120 };
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));

// the wash's line, and its bays (full depth inside r, then the bank)
const LINE = [[0, -36], [-3, -24], [-1, -12], [4, -2], [8, 8], [7, 19], [2, 29], [-3, 38]];
const BAYS = [[-6.5, -14, 4.2], [12.5, 17.5, 4.8]]; // the pocket in the narrows; the bend where the caravan stopped
const LLEN = LINE.reduce((l, p, i) => (i ? l + Math.hypot(p[0] - LINE[i - 1][0], p[1] - LINE[i - 1][1]) : 0), 0);
const along = (s) => { for (let i = 1; i < LINE.length; i++) { const a = LINE[i - 1], b = LINE[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s <= l || i === LINE.length - 1) return [lerp(a[0], b[0], s / l), lerp(a[1], b[1], s / l)]; s -= l; } return LINE[0]; };
const nearLine = (x, z) => { let bd = 1e9, bs = 0, acc = 0; for (let i = 1; i < LINE.length; i++) { const a = LINE[i - 1], b = LINE[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), l = Math.sqrt(l2); if (d < bd) { bd = d; bs = acc + t * l; } acc += l; } return [bd, bs]; };
// [x, z, r], local. Neighbours overlap by well over the widest walker (see confine in level.js).
const DISCS = [[0, -52, 12], [0.5, -40, 9]]; // the plain the track comes in over
for (let s = 0; s <= LLEN + 0.1; s += 5) DISCS.push([...along(Math.min(s, LLEN)), 6.4]); // the wash
for (const [x, z, r] of BAYS) DISCS.push([x, z, r + 2.6]);
const OPEN = openArea(DISCS, WASH), outside = OPEN.outside;
export const WAREA = OPEN.area, washRoute = OPEN.route;

// Where things are, for the stage (local): the three wagons (x, z, which way the front faces, and the one on its side), the casks
export const WAGONS = [[6.2, 10.6, PI + 0.22], [12.4, 16.6, PI - 0.62], [6.2, 24.0, PI + 0.95, 1]];
export const CASKS = [7.6, 15.0];
export const TRACKS = [[3.5, 25.5], [0.5, 31], [-3.5, 38], [-6.5, 45], [-9, 53], [-12, 62]]; // the drivers and the beasts, walked away north

function land(x, z) {
  let h = 0.28 * Math.sin(x * 0.12 + 0.4) * Math.cos(z * 0.1 - 0.7) + 0.13 * Math.sin(x * 0.29 + z * 0.23 + 2.1) + 0.05 * Math.sin(x * 0.7 - z * 0.5);
  const [wd, ws] = nearLine(x, z); let e = wd - 4.8; for (const [bx, bz, br] of BAYS) e = Math.min(e, Math.hypot(x - bx, z - bz) - br);
  h -= 2.5 * sm(0, 14, ws) * (1 - sm(0, 4.4, e)); // the wash, cut in gradually from where the track comes down into it
  h -= 0.4 * gauss(x, z, 0, -50, 12); // the plain dips a little toward its middle
  const o = outside(x, z), s = 0.5 + 0.5 * Math.sin(x * 0.06 + 0.4) * Math.cos(z * 0.05 + 1.2), open = 1 - 0.7 * gauss(x, z, 0, -60, 22);
  h += sm(-1.5, 7, o) * (1.2 + 4.2 * s) * open; // the edge of the walkable ground: a bank, a dune face
  h += sm(8, 45, o) * (2.8 * Math.sin(x * 0.05 + z * 0.025) + 2.2 * Math.sin(z * 0.065 - x * 0.03 + 1) + 0.9 * Math.sin(x * 0.14) + 1.8); // and dunes beyond
  h += 3.2 * sm(40, 56, z) * gauss(x, 0, -8, 0, 22); // the big dune the tracks go up and over, north of the wash
  return h;
}

export function buildWash(scene, kit) {
  const g = new T.Group(); g.position.set(WASH.x, 0, WASH.z); scene.add(g);
  const q = rng(7272), Q = (a, b) => a + q() * (b - a), obs = [];
  const block = (x, z, r) => obs.push({ x: WASH.x + x, z: WASH.z + z, r });
  const V = (x, y, z) => new T.Vector3(x, y, z), UP = V(0, 1, 0);

  // ---- the ground: paler and stonier than the frontier's, a gravel floor in the wash, the caravans' track worn into it
  const SAND = new T.Color(0xfff4e0), GRAVEL = new T.Color(0xa89c8a), ROCK = new T.Color(0xb48a6c), PALE = new T.Color(0xfff2d8), TRACK = new T.Color(0x9a8c78), c2 = new T.Color();
  const trackD = (x, z) => { const [wd, ws] = nearLine(x, z); return ws < 0.5 ? Math.abs(x - lerp(0, 0.5, clamp((z + 64) / 24, 0, 1))) : wd + 0.4 * Math.sin(ws * 0.4); }; // where the wheels have run: up the plain, then down the bed
  const hl = openSheet(g, land, (x, z, sl, c) => {
    const [wd, ws] = nearLine(x, z), e = outside(x, z), blot = 0.5 + 0.5 * Math.sin(x * 0.27 + Math.sin(z * 0.19) * 2) * Math.cos(z * 0.31 - Math.sin(x * 0.11) * 2);
    const bed = sm(2, 14, ws) * (1 - sm(4.5, 8.5, wd));
    c.copy(SAND).lerp(PALE, 0.55 * blot * sm(2, 20, e));
    c.lerp(c2.copy(GRAVEL).multiplyScalar(0.84 + 0.22 * blot), Math.max(bed * 0.85, 0.5 * (1 - blot) * (1 - sm(-2, 6, e))));
    c.lerp(TRACK, 0.35 * (1 - sm(0.6, 1.8, trackD(x, z))) * (1 - sm(-1, 3, e)));
    c.lerp(ROCK, clamp((sl - 0.4) * 2.6, 0, 0.85) * (1 - sm(10, 30, e)));
  });
  const height = (wx, wz) => hl(wx - WASH.x, wz - WASH.z);

  // ---- rock: heavy along the wash's banks, scattered on the plain, half buried out on the dunes
  const rock = rockSet(g, hl, q, block);
  for (let i = 0; i < DISCS.length; i++) { const [cx, cz, cr] = DISCS[i], n = Math.round((cr * 2 * PI) / 2.4);
    for (let k = 0; k < n; k++) { const a = (k / n) * PI * 2 + Q(-0.1, 0.1), x = cx + Math.sin(a) * (cr + 1.3), z = cz + Math.cos(a) * (cr + 1.3); if (outside(x, z) < 1.1) continue;
      const [wd, ws] = nearLine(x, z), bank = wd < 11 && ws > 8 && !(z > 40 && x < 4); // (not across the way the tracks go out)
      if (q() > (bank ? 0.92 : 0.5)) continue;
      const r = bank ? Q(1.4, 2.7) : Q(0.7, 1.9); rock(x + Q(-0.5, 0.5), z + Q(-0.5, 0.5), r, { kind: bank ? ((q() * 2) | 0) + 2 * (q() < 0.6 ? 1 : 0) : undefined, sy: bank ? Q(0.9, 1.7) : undefined });
      if (q() < 0.45) rock(x + Math.sin(a) * r * 1.1 + Q(-1, 1), z + Math.cos(a) * r * 1.1 + Q(-1, 1), r * Q(0.4, 0.7)); } }
  // standing in the open, to fight round (each with room to pass on both sides)
  for (const [x, z, r] of [[-5, -47, 1.0], [6, -55, 1.2], [3.5, -30, 0.8], [1.8, -15.5, 0.9], [-9.2, -15.5, 1.1], [7.5, 1.5, 0.9], [-0.5, 31.5, 0.8]]) rock(x, z, r, { solid: true });
  for (let i = 0; i < 80; i++) { const a = Q(0, 6.3), d = Q(28, 95), x = Math.sin(a) * d, z = Math.cos(a) * d - 6; if (outside(x, z) > 7) rock(x, z, Q(0.6, 3.4), { sy: Q(0.5, 1.0) }); }
  rock.done();

  // ---- mesas on the skyline, and the far butte the tracks are heading for
  kit.into(g, () => {
    kit.mesa(-62, 40, 13, 21, { sx: 1.3, ry: 0.4 }); kit.mesa(58, 26, 10, 17, { sx: 1.1, ry: 1.3, tilt: 0.2, ta: 1 }); kit.mesa(-48, -40, 9, 14, { sx: 0.9, ry: 2.2 });
    kit.mesa(42, -62, 14, 15, { sx: 1.7, ry: 0.2 }); kit.mesa(-30, 104, 15, 24, { sx: 1.5, ry: 0.6, tilt: 0.2, ta: 2 }); kit.mesa(26, 96, 16, 19, { sx: 1.6, ry: -0.4, tilt: 0.25, ta: PI });
  });

  // ---- everything that never moves, merged one mesh a material
  const parts = new Map(), M4 = new T.Matrix4(), eu = new T.Euler(), qt = new T.Quaternion();
  const put = (geo, mat, m) => { if (geo.index) geo = geo.toNonIndexed(); if (m) geo.applyMatrix4(m); (parts.get(mat) || parts.set(mat, []).get(mat)).push(geo); };
  const at = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, base) => { geo = geo.clone ? geo.clone() : geo; geo.applyMatrix4(M4.makeRotationFromEuler(eu.set(rx, ry, rz, 'YXZ'))); geo.translate(x, y, z); put(geo, mat, base); };
  const stick = (a, b, rad, mat, base) => { const geo = new T.CylinderGeometry(rad, rad, a.distanceTo(b), 6); geo.applyQuaternion(qt.setFromUnitVectors(UP, b.clone().sub(a).normalize())); const m = a.clone().lerp(b, 0.5); geo.translate(m.x, m.y, m.z); put(geo, mat, base); };
  const mWood = toon(0x7a5434), mWoodD = toon(0x4c3624), mPlank = toon(0xffffff, { map: TEX.crate }), mIron = toon(0x2c2e34), mCanvas = toon(0xffffff, { map: TEX.canvas, side: T.DoubleSide }), mCrate = toon(0xffffff, { map: TEX.crate }), mBarrel = toon(0xffffff, { map: TEX.barrel, side: T.DoubleSide });
  const mSack = toon(0xb09c78), mBale = toon(0xc0ac86), mRope = toon(0x8a7650), mJar = toon(0xb4734a), mAsh = toon(0x3c3632), mLeather = toon(0x5a3a26), mStone = toon(0x8f8068), mScrub = toon(0x8a8a52), mScrubD = toon(0x6c6440), mThorn = toon(0x5a4a38);
  const CLOTH = [0x2c3f78, 0x8e2a24, 0xc9952e, 0x4f6a3a].map((c) => toon(c));

  // A four-wheeled wagon (front toward +z before it is turned): a plank bed with sides, iron-shod wheels on two axles, the pole down
  // on the ground where the team was cut loose, and hoops for a tilt. `o.tilt`: the canvas (torn: only part of it); `o.side`: on its side.
  const wagon = (x, z, ry, o = {}) => {
    const W = new T.Matrix4().compose(V(x, hl(x, z), z), new T.Quaternion().setFromEuler(new T.Euler(0, ry, 0)), V(1, 1, 1));
    if (o.side) W.multiply(new T.Matrix4().makeTranslation(0.9, 1.18, 0)).multiply(new T.Matrix4().makeRotationZ(1.47)); // rolled onto its left side: the wheels on that side lie on the ground
    const p = (geo, mat, px, py, pz, rx, ry2, rz) => at(geo, mat, px, py, pz, rx, ry2, rz, W);
    p(new T.BoxGeometry(1.7, 0.12, 3.8), mPlank, 0, 1.0, 0);
    for (const s of [-1, 1]) { p(new T.BoxGeometry(0.08, 0.46, 3.8), mPlank, s * 0.84, 1.29, 0); p(new T.BoxGeometry(1.7, 0.46, 0.08), mPlank, 0, 1.29, s * 1.88); p(new T.BoxGeometry(0.14, 0.16, 3.6), mWoodD, s * 0.55, 0.88, 0);
      for (const zz of [-1.5, -0.5, 0.5, 1.5]) p(new T.BoxGeometry(0.1, 0.56, 0.1), mWoodD, s * 0.9, 1.24, zz); }
    for (const [zz, r] of [[1.25, 0.56], [-1.25, 0.66]]) { // the axles, and wheels, smaller at the front
      p(new T.CylinderGeometry(0.06, 0.06, 2.2, 8), mIron, 0, r, zz, 0, 0, PI / 2);
      for (const s of [-1, 1]) { p(new T.TorusGeometry(r, 0.06, 6, 22), mWoodD, s * 1.06, r, zz, 0, PI / 2); p(new T.TorusGeometry(r + 0.02, 0.022, 4, 22), mIron, s * 1.06, r, zz, 0, PI / 2); p(new T.CylinderGeometry(0.12, 0.12, 0.24, 10), mWoodD, s * 1.06, r, zz, 0, 0, PI / 2);
        for (let k = 0; k < 5; k++) p(new T.BoxGeometry(0.05, r * 2 - 0.06, 0.07), mWood, s * 1.06, r, zz, k * PI / 5); } }
    if (!o.side) stick(V(0, 0.55, 1.9).applyMatrix4(W), V(Math.sin(o.pole || 0.3) * 0.6, 0.06, 4.3).applyMatrix4(W), 0.06, mWood); // the pole, dropped where the team was cut out of it
    for (const zz of [-1.45, -0.5, 0.45, 1.4]) { const hp = new T.TorusGeometry(0.84, 0.03, 5, 16, PI); p(hp, mWoodD, 0, 1.5, zz); }
    if (o.tilt) { const len = o.tilt, cv = new T.CylinderGeometry(0.87, 0.87, len, 18, 1, true, -PI / 2, PI); p(cv, mCanvas, 0, 1.5, 1.45 - len / 2 - 0.05, -PI / 2); }
    return W;
  };
  const [A, B, C] = WAGONS;
  wagon(A[0], A[1], A[2], { tilt: 2.9, pole: -0.4 }); wagon(B[0], B[1], B[2], { tilt: 1.2, pole: 0.5 }); const Wc = wagon(C[0], C[1], C[2], { side: true });
  for (const [x, z, ry] of WAGONS) { const s = Math.sin(ry), c = Math.cos(ry); for (const k of [-1.3, 0, 1.3]) block(x + s * k, z + c * k, 1.25); }
  // On the beds, what they carried: nobody has touched it.
  { const onBed = (w, list) => { const [x, z, ry] = w, W = new T.Matrix4().compose(V(x, hl(x, z), z), new T.Quaternion().setFromEuler(new T.Euler(0, ry, 0)), V(1, 1, 1));
      for (const [kind, px, pz, s, r2] of list) {
        if (kind === 'crate') at(new T.BoxGeometry(s, s, s), mCrate, px, 1.06 + s / 2, pz, 0, r2, 0, W);
        else if (kind === 'sack') { const sk = new T.SphereGeometry(s, 10, 7); sk.scale(1, 0.62, 0.8); at(sk, mSack, px, 1.06 + s * 0.5, pz, 0, r2, 0, W); }
        else if (kind === 'bale') { at(new T.BoxGeometry(0.62, 0.44, 0.9), mBale, px, 1.06 + 0.22 + s, pz, 0, r2, 0, W); for (const d of [-0.25, 0.25]) at(new T.BoxGeometry(0.64, 0.46, 0.04), mRope, px, 1.06 + 0.22 + s, pz + d, 0, r2, 0, W); }
        else if (kind === 'bolt') at(new T.CylinderGeometry(0.15, 0.15, 1.3, 10), CLOTH[r2 | 0], px, 1.06 + 0.15 + s, pz, PI / 2, 0, 0, W);
      } };
    onBed(A, [['crate', -0.4, 0.9, 0.6, 0.1], ['crate', 0.35, 0.95, 0.5, -0.2], ['crate', -0.35, 0.95, 0.45, 0.3, 0.6], ['sack', 0.35, 0.1, 0.32, 0.4], ['sack', -0.35, 0.0, 0.3, 1.1], ['sack', 0, -0.6, 0.34, 2], ['bale', 0, -1.3, 0, 0.1]]);
    onBed(B, [['bale', -0.36, 1.2, 0, 0], ['bale', 0.36, 1.2, 0, 0.06], ['bale', 0, 1.15, 0.44, -0.1], ['bolt', 0, 0.1, 0, 0], ['bolt', 0, -0.25, 0, 1], ['bolt', 0, 0.0, 0.28, 2], ['crate', 0.3, -1.1, 0.55, 0.2], ['sack', -0.4, -1.2, 0.3, 0]]); }
  // the one on its side has spilled its load across the bed of the wash
  { const [x, z, ry] = C, s = Math.sin(ry), c = Math.cos(ry), ox = -c, oz = s; // out from its bed, which faces across the wash now that it lies on its side
    const spill = (u, v) => [x + s * u + ox * v, z + c * u + oz * v];
    for (const [u, v, k, sz, r2] of [[-1.0, 1.6, 'crate', 0.55, 0.4], [0.3, 1.9, 'crate', 0.5, 1.1], [1.2, 2.2, 'sack', 0.3, 0.3], [-0.2, 2.6, 'bolt', 0, 1], [0.8, 3.0, 'bolt', 0, 3], [-1.4, 2.4, 'sack', 0.32, 2], [1.7, 1.5, 'jar', 0.55, 0], [2.1, 2.1, 'jar', 0.45, 0], [-0.6, 3.3, 'sack', 0.28, 1]]) {
      const [px, pz] = spill(u, v), y = hl(px, pz);
      if (k === 'crate') at(new T.BoxGeometry(sz, sz, sz), mCrate, px, y + sz / 2 - 0.03, pz, Q(-0.1, 0.1), r2, Q(-0.1, 0.1));
      else if (k === 'sack') { const sk = new T.SphereGeometry(sz, 10, 7); sk.scale(1, 0.55, 0.8); at(sk, mSack, px, y + sz * 0.4, pz, 0, r2, 0); }
      else if (k === 'bolt') { at(new T.CylinderGeometry(0.15, 0.15, 1.3, 10), CLOTH[r2 % 4], px, y + 0.14, pz, PI / 2, r2 + 0.4, 0); }
      else if (k === 'jar') { const jg = new T.LatheGeometry([[0.1, 0], [0.2, 0.1], [0.27, 0.3], [0.24, 0.5], [0.12, 0.62], [0.11, 0.68], [0.15, 0.72]].map(([a, b]) => new T.Vector2(a * sz * 1.6, b * sz * 1.6)), 12); at(jg, mJar, px, y + 0.25 * sz, pz, 0, 0, 1.4 + r2); }
    }
    for (const [u, v, r] of [[-0.6, 1.9, 0.75], [0.9, 2.4, 0.7]]) { const [bx, bz] = spill(u, v); block(bx, bz, r); } }
  // ---- the water: every cask stove in where it stood behind the first wagon, the staves thrown about, the hoops lying flat, and
  // a dark stain where the sand drank it
  { const [cx, cz] = CASKS, barrel = (s) => { const geo = new T.CylinderGeometry(0.33, 0.33, 0.9 * s, 12, 3, true); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const f = 1 + 0.14 * Math.cos((p.getY(i) / (0.45 * s)) * PI / 2 * s); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } geo.computeVertexNormals(); return geo; };
    for (const [x, z, s, rx, rz, ry] of [[0, 0, 0.55, 0, 0, 0], [0.9, 0.5, 0.4, 0.2, 0, 1], [-0.7, 0.7, 0.62, 0, 1.45, 0.6], [0.4, -0.9, 0.35, 0, 0, 2]]) { const y = hl(cx + x, cz + z); at(barrel(s), mBarrel, cx + x, y + (rz ? 0.3 : 0.45 * s), cz + z, rx, ry, rz); } // what is left standing of each: broken off short
    for (let k = 0; k < 22; k++) { const a = Q(0, 6.3), d = Q(0.4, 2.6), x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d; at(new T.BoxGeometry(0.09, 0.03, Q(0.5, 0.85)), mBarrel, x, hl(x, z) + 0.02, z, Q(-0.1, 0.1), Q(0, 6.3), Q(-0.2, 0.2)); }
    for (let k = 0; k < 6; k++) { const x = cx + Q(-2, 2), z = cz + Q(-1.6, 1.8); at(new T.TorusGeometry(0.36, 0.02, 4, 18), mIron, x, hl(x, z) + 0.03, z, PI / 2 + Q(-0.15, 0.15), 0, Q(-0.15, 0.15)); }
    block(cx, cz, 1.0);
    const wet = decals(DECAL.soft, 0x5a4634, 0.6, hl); wet.at(cx + 0.2, cz + 0.3, 5.2, 4.4, 0.4); wet.at(cx - 1.4, cz + 1.8, 2.6, 2.2, 1.6); wet.done(g); }
  // where they slept: a ring of stones and cold ash, a pot on its side, bedrolls, and harness lying where the team was cut out of it
  { const fx = 3.4, fz = 15.2, fy = hl(fx, fz);
    for (let i = 0; i < 8; i++) { const a = i * 0.79, s = Q(0.12, 0.18), st = new T.SphereGeometry(s, 7, 5); st.scale(1, 0.7, 1); at(st, mStone, fx + Math.sin(a) * 0.55, fy + s * 0.35, fz + Math.cos(a) * 0.55); }
    const ash = new T.SphereGeometry(0.42, 10, 6); ash.scale(1, 0.12, 1); at(ash, mAsh, fx, fy + 0.02, fz);
    const pot = new T.LatheGeometry([[0.0, 0], [0.2, 0.02], [0.26, 0.16], [0.22, 0.3], [0.2, 0.34]].map(([a, b]) => new T.Vector2(a, b)), 12); at(pot, mIron, fx + 0.9, fy + 0.22, fz - 0.4, 0, 0.5, 1.5);
    for (const [x, z, ry] of [[2.6, 12.4, 0.3], [2.2, 17.4, 2.0], [5.4, 18.2, 1.2]]) { at(new T.CylinderGeometry(0.17, 0.17, 0.8, 10), CLOTH[(q() * 4) | 0], x, hl(x, z) + 0.15, z, PI / 2, ry, 0); at(new T.BoxGeometry(0.75, 0.04, 1.7), mBale, x + Math.sin(ry) * 1.1, hl(x, z) + 0.03, z + Math.cos(ry) * 1.1, 0, ry, 0); } // bedrolls, one each, kicked open
    block(fx, fz, 0.8);
    for (const [x, z, ry] of [[A[0] + Math.sin(A[2]) * 4.6, A[1] + Math.cos(A[2]) * 4.6, A[2]], [B[0] + Math.sin(B[2]) * 4.6, B[1] + Math.cos(B[2]) * 4.6, B[2] + 0.3]]) { // a yoke beam and its traces, cut
      at(new T.CylinderGeometry(0.07, 0.07, 1.9, 8), mWoodD, x, hl(x, z) + 0.08, z, 0, ry, PI / 2);
      for (const s of [-1, 1]) { const a = V(x + Math.cos(ry) * s * 0.5, hl(x, z) + 0.04, z - Math.sin(ry) * s * 0.5), b = V(a.x + Math.sin(ry + s * 0.3) * 1.6, 0, a.z + Math.cos(ry + s * 0.3) * 1.6); b.y = hl(b.x, b.z) + 0.03; stick(a, b, 0.025, mLeather); } } }

  // ---- the tracks: many feet, and the beasts led among them, out of the bend and away north up the wash and over the dune
  { const pr = decals(DECAL.prints, 0x5a4634, 0.95, hl), drag = decals(DECAL.soft, 0x9a8a72, 0.32, hl);
    for (let i = 1; i < TRACKS.length; i++) { const [ax, az] = TRACKS[i - 1], [bx, bz] = TRACKS[i], l = Math.hypot(bx - ax, bz - az), h = Math.atan2(bx - ax, bz - az);
      for (let s = 0; s < l; s += 1.7) { const u = s / l, x = lerp(ax, bx, u), z = lerp(az, bz, u);
        for (let k = 0; k < 4; k++) { const o = (k - 1.5) * 0.85 + Q(-0.25, 0.25); pr.at(x + Math.cos(h) * o + Q(-0.2, 0.2), z - Math.sin(h) * o + Q(-0.2, 0.2), 0.9, 3.4, h + PI + Q(-0.12, 0.12), 0.04 + k * 0.004); }
        if (s % 3.4 < 1.7) drag.at(x + Q(-0.6, 0.6), z, Q(1.8, 2.8), 3.4, h + PI, 0.03); } } // trodden: many feet, and the beasts led among them
    // and around the wagons, everyone's: where they stood, and were made to walk
    for (let k = 0; k < 26; k++) { const x = Q(-1, 13), z = Q(9, 25), a = Q(0, 6.3); if (outside(x, z) > -1) continue; pr.at(x, z, 0.9, 3.4, a, 0.04); }
    pr.done(g); drag.done(g); }
  // the caravans' road: old ruts up the plain and down the bed of the wash
  { const ruts = decals(DECAL.ruts, 0x8a7a64, 0.45, hl); const pts = [[0.5, -64], [0.3, -50], [0, -40], ...LINE.slice(1, 5)];
    for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az), h = Math.atan2(bx - ax, bz - az); for (let s = 0; s < l; s += 3) ruts.at(lerp(ax, bx, s / l), lerp(az, bz, s / l), 2.3, 3.4, h + PI, 0.03); }
    ruts.done(g); }

  // ---- dry thorn trees, scrub and stones
  const thorn = (x, z, h, seed) => { const r = rng(seed), y = hl(x, z) - 0.1, R2 = (a, b) => a + r() * (b - a);
    const limb = (p, dir, len, rad, depth) => { const e = p.clone().addScaledVector(dir, len); const geo = new T.CylinderGeometry(rad * 0.62, rad, len, 6); geo.translate(0, len / 2, 0); geo.applyQuaternion(qt.setFromUnitVectors(UP, dir)); geo.translate(p.x, p.y, p.z); put(geo, mThorn);
      if (depth > 0) for (let k = 0, n = depth > 2 ? 2 : 3; k < n; k++) { const d2 = dir.clone().add(V(R2(-0.8, 0.8), R2(-0.1, 0.5), R2(-0.8, 0.8))).normalize(); if (d2.y < 0.15) d2.y = 0.15; limb(e, d2.normalize(), len * R2(0.55, 0.8), rad * 0.62, depth - 1); } };
    limb(V(x, y, z), V(R2(-0.25, 0.25), 1, R2(-0.25, 0.25)).normalize(), h * 0.4, h * 0.045, 3); block(x, z, 0.35); };
  thorn(-9.5, -44, 4.0, 41); thorn(10, -46, 3.4, 43); thorn(-9.8, 4.5, 3.6, 47); thorn(17.5, 12.5, 4.2, 53);
  { const blades = []; for (let k = 0; k < 9; k++) { const b = new T.ConeGeometry(0.03, 0.6, 3); b.translate(0, 0.3, 0); b.rotateZ(0.2 + (k % 3) * 0.16); b.rotateY(k * 0.7); blades.push(b); }
    const tuft = mergeGeometries(blades), n = 300, im = new T.InstancedMesh(tuft, mScrub, n), im2 = new T.InstancedMesh(tuft, mScrubD, n), pv = V(0, 0, 0), sv = V(1, 1, 1); let a = 0, b = 0;
    for (let i = 0; i < n * 2; i++) { const x = Q(-70, 70), z = Q(-80, 75), e = outside(x, z); if (e > 24 || (e < -1.5 && q() < 0.8)) continue; const s = Q(0.5, 1.4) * (e < 0 ? 0.7 : 1); pv.set(x, hl(x, z) - 0.04, z); qt.setFromEuler(eu.set(0, Q(0, 6.3), 0)); sv.set(s, s * Q(0.7, 1.4), s);
      if (i % 2) { if (a < n) im.setMatrixAt(a++, M4.compose(pv, qt, sv)); } else if (b < n) im2.setMatrixAt(b++, M4.compose(pv, qt, sv)); }
    im.count = a; im2.count = b; im.receiveShadow = im2.receiveShadow = true; g.add(im, im2); }
  { const n = 560, im = new T.InstancedMesh(new T.DodecahedronGeometry(1, 1), toon(0x9c8670), n), pv = V(0, 0, 0), sv = V(1, 1, 1);
    for (let i = 0; i < n; i++) { const x = Q(-55, 55), z = Q(-70, 60), [wd] = nearLine(x, z), s = wd < 7 ? Q(0.06, 0.32) : Q(0.04, 0.16); pv.set(x, hl(x, z) + s * 0.2, z); qt.setFromEuler(eu.set(Q(0, 3), Q(0, 3), Q(0, 3))); sv.set(s, s * Q(0.5, 0.8), s * Q(0.7, 1.2)); im.setMatrixAt(i, M4.compose(pv, qt, sv)); }
    im.receiveShadow = true; g.add(im); }
  for (const [mat, list] of parts) { const m = new T.Mesh(mergeGeometries(list), mat); m.castShadow = m.receiveShadow = mat.isMeshToonMaterial; g.add(m); }

  // sand on the wind, low, across wherever he is; and now and then a gust lifts it off the dune's crest
  const tmp = V(0, 0, 0);
  const update = (t, dt) => {
    const p = G.player.pos; if (Math.random() < dt * 11) FX.dust.emit(tmp.set(p.x + (Math.random() - 0.5) * 30, 0, p.z + (Math.random() - 0.5) * 30).setY(height(tmp.x, tmp.z) + 0.1 + Math.random() * 0.5), 1, 0.3, 0xdcc8a2, 2.4, { grav: -0.05, vx: 2.6, vz: -1.0, spread: 0.2, flat: 1 });
  };
  const w2 = (k) => { const [x, z, ry] = WAGONS[k]; return [WASH.x + x, WASH.z + z, ry]; };
  return { group: g, obs, height, update, reset: () => {}, banners: [], wagon: w2, Wc };
}
