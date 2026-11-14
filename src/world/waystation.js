import * as T from 'three';
import { PI, rng } from '../core/util.js';
import { toon, TEX, canvasTex, speck } from '../gfx/materials.js';
import { DECAL, decals } from '../gfx/decals.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The waystation on the caravan road (prologue; docs/story.md): a walled yard of plastered
// mud brick, a day's walk into the desert. The house closes the south side, the gate is in the
// north wall and the road beyond it runs out into the dunes, which is where raiders come from.
// A well, a lean-to stable on the west wall, a stall on the east, a cart, palms.
// Everything is built in local coordinates (x east, z north, the yard's middle at 0, 0) inside
// one group; obstacles are returned in world coordinates. `muster` holds what the guard column
// sets up overnight (ring, clerk's table, colours) and is only shown for the muster.
export function buildWaystation(scene, ox, oz) {
  const g = new T.Group(); g.position.set(ox, 0, oz); scene.add(g);
  const muster = new T.Group(); g.add(muster);
  const obs = [], obsMuster = [], banners = [], q = rng(311), Q = (a, b) => a + q() * (b - a);
  const V = (x, y, z) => new T.Vector3(x, y, z), UP = V(0, 1, 0);
  const block = (x, z, r, list = obs) => list.push({ x: ox + x, z: oz + z, r });

  // sun-bleached plaster: soft patches, a few cracks, rain streaks, and brick showing through low down
  const adobe = canvasTex(256, (c, n) => {
    speck(c, n, [214, 186, 142], 10, q);
    for (let i = 0; i < 60; i++) { c.fillStyle = q() < 0.5 ? 'rgba(150,118,80,.10)' : 'rgba(240,220,180,.10)'; c.beginPath(); c.arc(q() * n, q() * n, 10 + q() * 44, 0, 7); c.fill(); }
    for (let k = 0; k < 12; k++) { const x = q() * n, y = q() * n * 0.5, l = 40 + q() * 90, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(120,92,62,.2)'); gr.addColorStop(1, 'rgba(120,92,62,0)'); c.fillStyle = gr; c.fillRect(x, y, 4 + q() * 8, l); }
    c.strokeStyle = 'rgba(96,72,48,.4)'; c.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) { let x = q() * n, y = q() * n; c.beginPath(); c.moveTo(x, y); for (let m = 0; m < 6; m++) { x += (q() - 0.5) * 30; y += q() * 20; c.lineTo(x, y); } c.stroke(); }
    for (let k = 0; k < 5; k++) { const x = q() * n, y = n - 20 - q() * 50; c.fillStyle = 'rgba(150,104,66,.35)'; for (let r = 0; r < 2; r++) for (let b = 0; b < 2; b++) c.fillRect(x + b * 22 + (r ? 10 : 0), y + r * 10, 20, 8); } // a patch where the plaster has fallen off the brick
  });
  // awning cloth: cream with faded indigo stripes
  const stripe = canvasTex(64, (c, n) => {
    speck(c, n, [206, 190, 158], 10, q);
    c.fillStyle = 'rgba(52,72,112,.75)'; for (let x = 6; x < n; x += 32) c.fillRect(x, 0, 12, n);
    c.fillStyle = 'rgba(52,72,112,.4)'; for (let x = 22; x < n; x += 32) c.fillRect(x, 0, 2, n);
    c.fillStyle = 'rgba(110,90,66,.10)'; for (let i = 0; i < n; i += 4) c.fillRect(0, i, n, 1);
  }, 3, 1);
  const rep = (t, rx, ry) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
  const mAdobe = toon(0xffffff, { map: adobe }), mCap = toon(0xb9966c, { map: adobe }), mWood = toon(0x6a4a2c), mWoodD = toon(0x46301e), mStone = toon(0xb09a78), mIron = toon(0x2a2c32);
  const mAwn = toon(0xffffff, { map: stripe, side: T.DoubleSide }), mCrate = toon(0xffffff, { map: TEX.crate }), mBarrel = toon(0xffffff, { map: TEX.barrel }), mSack = toon(0xa89674), mStraw = toon(0xb9a25a);
  const mJar = toon(0xb0653a), mFrond = toon(0x5d7838, { side: T.DoubleSide }), mTrunk = toon(0x7d6546), mRope = toon(0x8a7650), mIn = new T.MeshBasicMaterial({ color: 0x0c0a09 }), mWater = toon(0x2c4e58);
  const add = (geo, mat, x, y, z, ry, to = g) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = m.receiveShadow = !!mat.isMeshToonMaterial; to.add(m); return m; };
  // A box whose texture is laid at a fixed size in metres (`tile`), so long walls aren't smeared.
  const box = (w, h, d, mat, x, y, z, ry, tile, to) => {
    const geo = new T.BoxGeometry(w, h, d);
    if (tile) { const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); } }
    return add(geo, mat, x, y, z, ry, to);
  };
  const stick = (a, b, rad, mat, to = g) => { const m = add(new T.CylinderGeometry(rad, rad, a.distanceTo(b), 7), mat, 0, 0, 0, 0, to); m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); return m; };

  // packed earth in the yard and out along the road, flagstones in front of the house
  { const e = add(new T.PlaneGeometry(31, 25.4), toon(0xe2d0b0, { map: rep(TEX.sand, 12, 10) }), 0, 0.012, 0); e.rotation.x = -PI / 2; e.castShadow = false;
    const r = add(new T.PlaneGeometry(7, 26), toon(0xe2d0b0, { map: rep(TEX.sand, 2.8, 10.4) }), 0, 0.011, 25.6); r.rotation.x = -PI / 2; r.castShadow = false;
    const f = add(new T.PlaneGeometry(24, 3.6), toon(0xffffff, { map: rep(TEX.flags, 6, 1) }), 0, 0.02, -10.3); f.rotation.x = -PI / 2; f.castShadow = false; }

  // yard walls: plastered, a little uneven, with a darker coping
  const wall = (x0, z0, x1, z1, h) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3.4)), ry = Math.atan2(x1 - x0, z1 - z0) + PI / 2;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, hh = h + Q(-0.14, 0.14), x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
      box(len / n + 0.02, hh, 0.9 + Q(-0.03, 0.05), mAdobe, x, hh / 2, z, ry, 3.2); box(len / n + 0.06, 0.2, 1.06, mCap, x, hh + 0.1, z, ry, 3.2); }
  };
  wall(-15.6, 12.6, -5.3, 12.6, 3.3); wall(5.3, 12.6, 15.6, 12.6, 3.3); wall(-15.6, -12.6, -15.6, 12.6, 3.3); wall(15.6, -12.6, 15.6, 12.6, 3.3); wall(-15.6, -12.7, -11.9, -12.7, 3.3); wall(11.9, -12.7, 15.6, -12.7, 3.3);
  // the gate: two towers, a beam across, and the leaves swung back flat against the towers
  for (const s of [-1, 1]) {
    box(2.2, 5.2, 2.2, mAdobe, s * 4.3, 2.6, 12.6, 0, 3.2); box(2.5, 0.26, 2.5, mCap, s * 4.3, 5.33, 12.6, 0, 3.2);
    for (const a of [-1, 1]) for (const b of [-1, 1]) box(0.6, 0.5, 0.6, mAdobe, s * 4.3 + a * 0.9, 5.7, 12.6 + b * 0.9, 0, 3.2);
    box(3.0, 3.7, 0.14, mWood, s * 4.85, 1.9, 11.34); for (const y of [0.7, 1.9, 3.1]) box(3.02, 0.12, 0.17, mIron, s * 4.85, y, 11.34); // swung back against the tower, and a few centimetres clear of it: touching faces flicker
    box(0.2, 4.0, 0.3, mWoodD, s * 3.08, 2.0, 12.6);
  }
  box(6.8, 0.36, 0.5, mWoodD, 0, 4.2, 12.6); box(1.5, 0.5, 0.08, mWood, 0, 4.2, 12.9); // lintel and a weathered signboard, facing the road

  // the house: one long storey with roof beams poking through the front, and a domed tower at the west end
  box(24, 4.6, 5, mAdobe, 0, 2.3, -14.6, 0, 3.2); box(24.3, 0.36, 5.3, mCap, 0, 4.78, -14.6, 0, 3.2);
  for (let x = -10.6; x < 11; x += 2.36) add(new T.CylinderGeometry(0.09, 0.09, 1.0, 8), mWoodD, x, 3.95, -11.9).rotation.x = PI / 2;
  box(6, 3.3, 4.4, mAdobe, -8.6, 6.4, -14.9, 0, 3.2); box(6.3, 0.3, 4.7, mCap, -8.6, 8.15, -14.9, 0, 3.2);
  { const d = add(new T.SphereGeometry(1.9, 18, 8, 0, PI * 2, 0, PI / 2), mAdobe, -8.6, 8.28, -14.9); d.scale.y = 0.8; add(new T.ConeGeometry(0.08, 0.5, 6), mIron, -8.6, 10.0, -14.9); }
  const hole = (w, h, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), mIn); m.position.set(x, y, z); g.add(m); return m; };
  hole(1.5, 2.6, 0, 1.3, -12.07); for (const s of [-1, 1]) box(0.18, 2.75, 0.22, mWoodD, s * 0.84, 1.37, -12.05); box(2.0, 0.22, 0.26, mWoodD, 0, 2.75, -12.05); box(1.9, 0.1, 0.5, mStone, 0, 0.05, -11.95);
  for (const x of [-8.6, -4.6, 4.6, 8.6]) { hole(0.7, 0.9, x, 2.5, -12.07); box(0.9, 0.1, 0.2, mWoodD, x, 2.0, -12.04); for (const k of [-0.14, 0.14]) box(0.05, 0.9, 0.05, mWoodD, x + k, 2.5, -12.05); }
  hole(0.8, 1.2, -8.6, 6.6, -12.67); box(1.0, 0.1, 0.2, mWoodD, -8.6, 5.95, -12.65);
  // a cloth awning over the door, on two posts, and a bench under it
  const awning = (len, depth, yw, yp, x, z, ry) => { // hung along a wall at height yw, out to posts `depth` away at height yp, sagging between
    const geo = new T.PlaneGeometry(len, 1, 8, 4), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) / len + 0.5, v = p.getY(i) + 0.5, sag = Math.sin(PI * u) * Math.sin(PI * v) * 0.22 + Math.sin(PI * u) * v * 0.1; p.setXYZ(i, p.getX(i), yw + (yp - yw) * v - sag, depth * v); }
    geo.computeVertexNormals(); return add(geo, mAwn, x, 0, z, ry);
  };
  awning(6.8, 2.85, 3.8, 3.15, 0, -12.05, 0);
  for (const s of [-1, 1]) { add(new T.CylinderGeometry(0.07, 0.09, 3.2, 8), mWood, s * 3.3, 1.6, -9.2); block(s * 3.3, -9.2, 0.28); } stick(V(-3.5, 3.17, -9.2), V(3.5, 3.17, -9.2), 0.05, mWood);
  box(2.2, 0.08, 0.42, mWood, -5.6, 0.48, -11.72); for (const x of [-6.5, -4.7]) box(0.1, 0.46, 0.36, mWoodD, x, 0.23, -11.72);

  // the well, under a small pitched roof
  { const x = -6.5, z = 1.5; add(new T.CylinderGeometry(1.12, 1.24, 0.86, 18), mStone, x, 0.43, z); add(new T.TorusGeometry(1.06, 0.13, 8, 20), mStone, x, 0.86, z).rotation.x = PI / 2;
    const d = new T.Mesh(new T.CircleGeometry(0.98, 18), mIn); d.rotation.x = -PI / 2; d.position.set(x, 0.84, z); g.add(d);
    for (const s of [-1, 1]) { box(0.15, 2.5, 0.15, mWood, x + s * 1.12, 1.25, z); const r = box(2.7, 0.07, 1.0, mWoodD, x, 2.78, z + s * 0.4); r.rotation.x = s * 0.62; }
    add(new T.CylinderGeometry(0.09, 0.09, 2.5, 8), mWoodD, x, 2.1, z).rotation.z = PI / 2; stick(V(x + 1.3, 2.1, z), V(x + 1.3, 1.8, z + 0.25), 0.03, mIron);
    stick(V(x, 2.1, z), V(x, 0.7, z), 0.022, mRope); add(new T.CylinderGeometry(0.19, 0.15, 0.32, 10), mWood, x + 0.55, 1.06, z + 0.9); add(new T.TorusGeometry(0.185, 0.02, 5, 12), mIron, x + 0.55, 1.2, z + 0.9).rotation.x = PI / 2;
    block(x, z, 1.5); }

  // lean-to stable against the west wall: thatch on posts, a trough, hay
  { for (const z of [-8.5, -4.5, -0.5]) { add(new T.CylinderGeometry(0.09, 0.11, 2.5, 8), mWood, -11.7, 1.25, z); block(-11.7, z, 0.3); stick(V(-11.6, 2.48, z), V(-15.1, 3.08, z), 0.06, mWoodD); }
    const r = box(3.9, 0.14, 8.8, mStraw, -13.4, 2.86, -4.5); r.rotation.z = -0.17; stick(V(-11.7, 1.0, -8.5), V(-11.7, 1.0, -4.5), 0.05, mWood);
    box(2.4, 0.5, 0.7, mWoodD, -13.5, 0.3, -2.0); const w = box(2.2, 0.02, 0.5, mWater, -13.5, 0.5, -2.0); w.castShadow = false;
    for (const [x, y, z, ry] of [[-13.9, 0.26, -6.9, 0.2], [-13.0, 0.26, -6.2, -0.4], [-13.7, 0.78, -6.7, 0.5], [-14.2, 0.26, -4.4, 0]]) box(0.95, 0.52, 0.6, mStraw, x, y, z, ry);
    for (const z of [-7.0, -4.5, -2.0]) block(-13.6, z, 1.5); }

  // a stall on the east wall: striped cloth, a trestle with jars
  const jarG = new T.LatheGeometry([[0.1, 0], [0.2, 0.1], [0.27, 0.3], [0.24, 0.5], [0.12, 0.62], [0.11, 0.68], [0.15, 0.72]].map(([a, b]) => new T.Vector2(a, b)), 12);
  const jar = (x, z, s, y = 0) => add(jarG, mJar, x, y, z, Q(0, 3)).scale.setScalar(s);
  { awning(5.4, 3.4, 3.4, 2.75, 15.1, -4.5, -PI / 2);
    for (const z of [-7.1, -1.9]) { add(new T.CylinderGeometry(0.07, 0.09, 2.75, 8), mWood, 11.7, 1.37, z); block(11.7, z, 0.28); }
    box(1.0, 0.08, 2.8, mWood, 13.7, 0.9, -4.5); for (const z of [-5.6, -3.4]) box(0.8, 0.9, 0.08, mWoodD, 13.7, 0.45, z);
    jar(13.6, -5.3, 0.55, 0.94); jar(13.9, -4.6, 0.45, 0.94); jar(13.5, -3.8, 0.6, 0.94); jar(12.5, -6.3, 1.0); jar(12.6, -2.7, 0.85);
    block(13.6, -5.9, 1.45); block(13.6, -3.1, 1.45); }

  // a two-wheeled cart, half unloaded, its shafts on the ground
  { const c = new T.Group(); c.position.set(9.4, 0, 4.6); c.rotation.y = 0.5; g.add(c); const put = (geo, mat, x, y, z) => add(geo, mat, x, y, z, 0, c);
    box(1.5, 0.1, 2.7, mWood, 0, 0.95, 0, 0, 0, c); for (const s of [-1, 1]) { box(0.07, 0.42, 2.7, mWood, s * 0.73, 1.2, 0, 0, 0, c); box(1.5, 0.42, 0.07, mWood, 0, 1.2, s * 1.32, 0, 0, c); }
    put(new T.CylinderGeometry(0.05, 0.05, 2.0, 8), mWoodD, 0, 0.62, 0).rotation.z = PI / 2;
    for (const s of [-1, 1]) { put(new T.TorusGeometry(0.58, 0.06, 6, 20), mWoodD, s * 0.95, 0.62, 0).rotation.y = PI / 2; put(new T.CylinderGeometry(0.11, 0.11, 0.2, 10), mIron, s * 0.95, 0.62, 0).rotation.z = PI / 2;
      for (let k = 0; k < 4; k++) put(new T.BoxGeometry(0.05, 1.12, 0.06), mWood, s * 0.95, 0.62, 0).rotation.x = k * PI / 4;
      stick(V(s * 0.55, 0.92, 1.3), V(s * 0.5, 0.07, 3.5), 0.045, mWood, c); }
    for (const [x, y, z, s] of [[-0.3, 1.2, -0.7, 0.34], [0.3, 1.18, -0.2, 0.3], [-0.1, 1.42, -0.5, 0.28]]) { const k = put(new T.SphereGeometry(s, 8, 6), mSack, x, y, z); k.scale.set(1, 0.6, 0.85); k.rotation.y = Q(0, 3); }
    box(0.6, 0.55, 0.6, mCrate, 0.15, 1.28, 0.75, 0.3, 0, c);
    const cs = Math.cos(0.5), sn = Math.sin(0.5); for (const [z, r] of [[-0.6, 1.2], [0.8, 1.2], [2.5, 0.6]]) block(9.4 + sn * z, 4.6 + cs * z, r); }

  // goods about the yard
  const barrelG = new T.CylinderGeometry(0.33, 0.33, 0.9, 12, 4); { const p = barrelG.attributes.position; for (let i = 0; i < p.count; i++) { const f = 1 + 0.14 * Math.cos((p.getY(i) / 0.45) * PI / 2); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } barrelG.computeVertexNormals(); }
  const crate = (x, z, s, top) => { box(s, s, s, mCrate, x, s / 2, z, Q(0, 1.5)); block(x, z, s * 0.7); if (top) { const t = s * 0.65; box(t, t, t, mCrate, x + Q(-0.06, 0.06), s + t / 2, z + Q(-0.06, 0.06), Q(0, 1.5)); } };
  const barrel = (x, z) => { add(barrelG, mBarrel, x, 0.45, z, Q(0, 3)); block(x, z, 0.5); };
  const sack = (x, z, s = 0.3) => { const k = add(new T.SphereGeometry(s, 8, 6), mSack, x, s * 0.62, z, Q(0, 3)); k.scale.set(1, 0.7, 0.8); };
  crate(6.4, -10.7, 0.85, true); crate(7.5, -10.9, 0.7); crate(6.9, -9.8, 0.6); sack(8.3, -10.2); sack(5.5, -10.0, 0.26);
  barrel(-8.6, 10.9); barrel(-9.5, 10.6); crate(-7.6, 10.8, 0.7, true); sack(-10.3, 11.0);
  barrel(12.6, 10.7); barrel(13.5, 10.9); barrel(13.1, 10.0); sack(11.7, 11.0); sack(14.2, 9.9, 0.27);
  jar(-10.6, -10.9, 1.0); jar(-11.4, -10.6, 0.8); jar(-10.9, -10.1, 0.65); block(-10.9, -10.6, 0.8); jar(11.2, -10.9, 0.9); block(11.2, -10.9, 0.45);

  // date palms: a leaning ringed trunk and a crown of drooping fronds
  const palm = (x, z, h, lean, la, solid) => {
    const parts = [], n = 8, M = new T.Matrix4(), e = new T.Euler(); let px = 0, pz = 0;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, r0 = 0.25 - 0.11 * u, c = new T.CylinderGeometry(r0 - 0.012, r0 + 0.03, h / n + 0.04, 9), off = lean * u * u;
      px = Math.sin(la) * off; pz = Math.cos(la) * off; c.applyMatrix4(M.makeRotationFromEuler(e.set(Math.cos(la) * lean * u * 0.5, 0, -Math.sin(la) * lean * u * 0.5)).setPosition(px, h * u, pz)); parts.push(c); }
    add(mergeGeometries(parts), mTrunk, x, 0, z);
    const fr = [], tx = Math.sin(la) * lean, tz = Math.cos(la) * lean;
    for (let i = 0; i < 13; i++) {
      const L = Q(2.2, 3.1), e0 = i < 4 ? Q(0.9, 1.25) : Q(0.2, 0.7), k = Q(1.5, 2.1), f = new T.PlaneGeometry(0.62, 1, 2, 7), p = f.attributes.position, a = (i / 13) * PI * 2 + Q(-0.2, 0.2);
      for (let v = 0; v < p.count; v++) { const t = p.getY(v) + 0.5, w = p.getX(v) * Math.sin(PI * (0.1 + 0.88 * t)), out = L * (Math.sin(e0) - Math.sin(e0 - k * t)) / k, up = L * (Math.cos(e0 - k * t) - Math.cos(e0)) / k; p.setXYZ(v, w, up - Math.abs(w) * 0.45, out); }
      f.rotateY(a); f.translate(tx, h + 0.1, tz); fr.push(f);
    }
    const fg = mergeGeometries(fr); fg.computeVertexNormals(); add(fg, mFrond, x, 0, z); add(new T.SphereGeometry(0.3, 8, 6), mTrunk, x + tx, h, z + tz);
    if (solid) block(x, z, 0.5);
  };
  palm(-10.2, 6.2, 6.4, 0.9, 1.9, true); palm(-19.5, 9, 7.6, 1.2, -1.2); palm(-22, 3.5, 6.0, 0.8, 2.6); palm(19.8, -3, 7.2, 1.1, 0.6); palm(8.5, 21, 6.6, 1.0, -2.2); palm(-7.5, 24, 5.6, 0.7, 1.0); palm(21, 14, 6.3, 0.9, 3.4);

  // ---- the yard, in use: ruts where the carts come in, the earth trodden dark between gate, door and
  // well, straw by the stable, washing on a line, a ladder left against the house, a rug and baskets
  // out at the stall. Dressing only, with its own numbers.
  { const wq = rng(417), C = (a, b) => a + wq() * (b - a);
    const mCloths = [0x39507e, 0xd8ccb0, 0x9a4a30, 0xc9b98f].map((c) => toon(c, { side: T.DoubleSide })), mBasket = toon(0xa98450), mDate = toon(0x4a2a1c), mGrain = toon(0xd2b877);
    const rug = canvasTex(64, (c, n) => { speck(c, n, [142, 44, 40], 16, wq); c.fillStyle = '#2f3f66'; c.fillRect(0, 0, n, 5); c.fillRect(0, n - 5, n, 5); c.fillRect(0, 0, 4, n); c.fillRect(n - 4, 0, 4, n);
      c.fillStyle = '#d9c08a'; for (const y of [10, 31, 52]) c.fillRect(6, y, n - 12, 2); for (let k = 0; k < 3; k++) for (const y of [20, 42]) { const x = 14 + k * 18; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath(); c.fill(); }
      c.fillStyle = 'rgba(40,20,16,.12)'; for (let i = 0; i < n; i += 2) c.fillRect(0, i, n, 1); });
    rug.wrapS = rug.wrapT = T.ClampToEdgeWrapping; const mRug = toon(0xffffff, { map: rug });
    // the stall: a rug laid out in front, two more rolled, baskets of dates and grain, small jars hung from a pole between the posts
    { const r = add(new T.PlaneGeometry(1.5, 2.3), mRug, 10.75, 0.035, -4.4); r.rotation.set(-PI / 2, 0, 0.06); r.castShadow = false; }
    for (const [x, z, ry] of [[12.2, -6.75, 0.2], [12.35, -6.95, 0.05]]) add(new T.CylinderGeometry(0.13, 0.13, 1.5, 10), mRug, x, 0.14 + (ry < 0.1 ? 0.2 : 0), z).rotation.set(0, ry, PI / 2);
    const basketG = new T.LatheGeometry([[0.16, 0], [0.22, 0.1], [0.26, 0.24], [0.25, 0.3]].map(([a, b]) => new T.Vector2(a, b)), 12);
    const basket = (x, z, s, mFill) => { add(basketG, mBasket, x, 0, z, C(0, 3)).scale.setScalar(s); const f = add(new T.SphereGeometry(0.235 * s, 10, 5, 0, PI * 2, 0, PI / 2), mFill, x, 0.24 * s, z); f.scale.y = 0.4; add(new T.TorusGeometry(0.25 * s, 0.022 * s, 5, 12), mBasket, x, 0.3 * s, z).rotation.x = PI / 2; };
    basket(12.0, -5.2, 1, mDate); basket(11.95, -3.7, 1.1, mGrain); basket(12.1, -4.45, 0.85, mDate); basket(2.4, -11.4, 1.1, mGrain); basket(3.0, -11.0, 0.9, mDate);
    stick(V(11.7, 2.62, -7.1), V(11.7, 2.62, -1.9), 0.035, mWood);
    for (let k = 0; k < 6; k++) { const z = -6.5 + k * 0.82 + C(-0.1, 0.1), l = C(0.12, 0.3), sc = k % 3 === 1 ? 0.2 : 0.26; stick(V(11.7, 2.6, z), V(11.7, 2.6 - l, z), 0.008, mRope); add(jarG, mJar, 11.7, 2.6 - l - 0.7 * sc, z, C(0, 3)).scale.setScalar(sc); } // well over head height
    // a ladder against the house, a broom by the door, a bowl on the bench
    { const x = 10.1; for (const s of [-1, 1]) stick(V(x + s * 0.22, 0, -10.95), V(x + s * 0.22, 4.7, -12.0), 0.035, mWood); for (let k = 0; k < 9; k++) { const u = (k + 1) / 10; stick(V(x - 0.24, 4.7 * u, -10.95 - 1.05 * u), V(x + 0.24, 4.7 * u, -10.95 - 1.05 * u), 0.022, mWoodD); } block(x, -11.3, 0.5); }
    stick(V(-1.5, 0.1, -11.6), V(-1.42, 1.55, -11.98), 0.02, mWood); add(new T.ConeGeometry(0.11, 0.34, 8), mStraw, -1.51, 0.19, -11.57).rotation.x = 0.25;
    add(new T.CylinderGeometry(0.1, 0.06, 0.07, 10), mJar, -5.2, 0.555, -11.72);
    // washing on a line by the west wall, north of the well
    { const x = -14.1, z0 = 7.4, z1 = 11.3; for (const z of [z0, z1]) { add(new T.CylinderGeometry(0.045, 0.06, 2.9, 7), mWood, x, 1.45, z); block(x, z, 0.25); }
      const sag = (u) => 2.82 - Math.sin(PI * u) * 0.16; for (let k = 0; k < 6; k++) stick(V(x, sag(k / 6), z0 + (z1 - z0) * k / 6), V(x, sag((k + 1) / 6), z0 + (z1 - z0) * (k + 1) / 6), 0.01, mRope);
      [0.14, 0.36, 0.6, 0.84].forEach((u, k) => { const w = C(0.5, 0.8), h = C(0.6, 0.95), c = add(new T.PlaneGeometry(w, h, 2, 3), mCloths[k], x, sag(u) - h / 2, z0 + (z1 - z0) * u, PI / 2 + C(-0.06, 0.06)); c.rotation.z = C(-0.03, 0.03); }); }
    // a second bucket at the well, bundles off a pack animal by the stable, broken pots swept to the gate tower
    add(new T.CylinderGeometry(0.19, 0.15, 0.32, 10), mWood, -4.75, 0.16, 2.3, 0.4); add(new T.TorusGeometry(0.185, 0.02, 5, 12), mIron, -4.75, 0.3, 2.3).rotation.x = PI / 2;
    for (const [x, z, s] of [[-11.0, 1.2, 0.3], [-10.6, 0.5, 0.26], [-11.2, 0.45, 0.24]]) sack(x, z, s); box(0.7, 0.3, 0.4, mCloths[2], -10.3, 0.15, 1.35, 0.5); stick(V(-10.7, 0.32, 1.1), V(-9.95, 0.32, 1.6), 0.015, mRope);
    for (let k = 0; k < 7; k++) { const s = C(0.06, 0.15), p = add(new T.DodecahedronGeometry(s, 0), mJar, 2.75 + C(-0.4, 0.4), s * 0.25, 11.6 + C(-0.4, 0.3)); p.scale.y = 0.35; p.rotation.y = C(0, 3); }
    // way-marks along the road outside: cairns of three stones
    for (const [x, z] of [[4.4, 23], [-4.5, 30], [4.6, 36]]) for (let k = 0; k < 3; k++) { const s = 0.4 - k * 0.11, c = add(new T.DodecahedronGeometry(s, 0), mStone, x + C(-0.05, 0.05), [0.24, 0.62, 0.9][k], z + C(-0.05, 0.05), C(0, 3)); c.scale.y = 0.7; }
    // the ground
    const ruts = decals(DECAL.ruts, 0x46321e, 0.85), dirt = decals(DECAL.soft, 0x6e5234, 0.5), pale = decals(DECAL.soft, 0xf0dfb8, 0.3), damp = decals(DECAL.soft, 0x3a2c20, 0.8) /* strong, because the sunlit earth is far brighter than white before the grade: a faint patch on it doesn't show at all */, straw = decals(DECAL.straw, 0xd2ba6a, 0.9), prints = decals(DECAL.prints, 0x4a341e, 0.6);
    const lay = (set, pts, w, step) => { for (let i = 0; i + 1 < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], a = Math.atan2(x1 - x0, z1 - z0), L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step)); for (let k = 0; k < n; k++) { const u = (k + 0.5) / n; set.at(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, w, L / n + 0.7, a + PI, set === prints ? 0.036 : 0.03); } } };
    lay(ruts, [[0.3, 38], [-0.2, 30], [0.2, 21], [0, 12.4], [0.5, 9.6], [3.2, 7.4], [7.4, 5.6]], 2.3, 3.4); // in off the road and round to where the cart stands
    for (const p of [[[0.4, 11.2], [0.2, 3.5], [0.1, -4], [0, -9.6]], [[-0.8, -9.4], [-3.4, -3.2], [-5.2, 0.4]], [[-7.6, 0.6], [-11.2, -1.6]], [[10.6, -3.2], [5.2, 3.4], [1.6, 9.8]], [[8.2, 3.2], [7.2, -3.6], [6.6, -9.0]], [[-8.0, 9.6], [-6.2, 3.4]], [[1.2, -9.4], [9.8, -5.0]]]) lay(prints, p, 0.9, 3.2);
    for (let i = 0; i < 9; i++) dirt.at(C(-2.4, 2.4), C(7, 13), C(2.6, 4.6), C(2.6, 4.6), C(0, 6.3)); for (let i = 0; i < 8; i++) dirt.at(C(-3, 3), C(-9.4, -6.4), C(2.4, 4.2), C(2, 3.4), C(0, 6.3));
    for (let i = 0; i < 26; i++) dirt.at(C(-13.5, 13.5), C(-8, 11), C(2, 5), C(2, 5), C(0, 6.3)); for (let i = 0; i < 8; i++) dirt.at(C(-2.6, 2.6), C(14, 38), C(2.6, 4.4), C(3, 5), C(0, 6.3));
    for (let i = 0; i < 30; i++) { const k = (wq() * 4) | 0, o = C(0.5, 1.5), s = C(2, 4.4), [x, z] = k === 0 ? [C(-14, 14), 12.1 - o] : k === 1 ? [-15.1 + o, C(-11, 11)] : k === 2 ? [15.1 - o, C(-11, 11)] : [C(-14, 14), -8.6 + C(0, 1.2)]; if (k === 0 && Math.abs(x) < 3.2) continue; pale.at(x, z, s, s * C(0.45, 0.8), k === 1 || k === 2 ? PI / 2 : 0); } // sand drifted to the wall feet
    damp.at(-6.5, 1.5, 4.6, 4.4, 0.3); damp.at(-5.0, 2.5, 2.4, 2.2, 1.2); damp.at(-12.3, -1.8, 2.6, 2.4, 0); damp.at(12.5, -6.2, 1.6, 1.5, 0); damp.at(-11.0, -10.3, 1.6, 1.4, 0.8);
    for (let i = 0; i < 12; i++) straw.at(C(-12.4, -9.6), C(-9.4, 1.4), C(1.4, 2.6), C(1.4, 2.6), C(0, 6.3), 0.034); straw.at(9.2, 4.2, 2.4, 2.4, 1); straw.at(7.9, 5.6, 1.6, 1.6, 2);
    for (const d of [ruts, dirt, pale, damp, straw, prints]) d.done(g); }

  // What the guard column sets up for the muster: a bout ring, the clerk's table, and its colours.
  { const ring = new T.Mesh(new T.RingGeometry(4.0, 4.16, 48), toon(0x7a2a26)); ring.rotation.x = -PI / 2; ring.position.set(1.5, 0.03, -1.5); ring.receiveShadow = true; muster.add(ring);
    const tx = 7.6, tz = -7.6;
    box(1.8, 0.08, 0.9, mWood, tx, 0.82, tz, 0, 0, muster); for (const a of [-1, 1]) for (const b of [-1, 1]) box(0.08, 0.8, 0.08, mWoodD, tx + a * 0.8, 0.4, tz + b * 0.36, 0, 0, muster);
    box(0.5, 0.04, 0.36, toon(0xe6dcc0), tx - 0.2, 0.88, tz + 0.05, 0.1, 0, muster); add(new T.CylinderGeometry(0.04, 0.05, 0.09, 8), mIron, tx + 0.35, 0.9, tz + 0.15, 0, muster);
    block(tx, tz, 1.15, obsMuster);
    const mBanner = toon(0xffffff, { map: TEX.banner, side: T.DoubleSide, alphaTest: 0.5 }), mGold = toon(0xd9b24a);
    for (const s of [-1, 1]) { const x = tx + s * 1.9, z = tz - 1.6; add(new T.CylinderGeometry(0.045, 0.055, 4.4, 8), mWood, x, 2.2, z, 0, muster); block(x, z, 0.3, obsMuster);
      const b = new T.Group(); b.position.set(x, 4.2, z + 0.08); muster.add(b); b.add(new T.Mesh(new T.BoxGeometry(1.2, 0.08, 0.08), mWood));
      const cl = new T.Mesh(new T.PlaneGeometry(1.0, 2.6, 1, 6), mBanner); cl.position.y = -1.32; cl.castShadow = true; b.add(cl);
      for (const e of [-1, 1]) { const k = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), mGold); k.position.x = e * 0.62; b.add(k); } banners.push(b); }
  }
  muster.visible = false;
  return { group: g, muster, obs, obsMuster, banners };
}
