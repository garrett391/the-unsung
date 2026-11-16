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
// The caravan road north of the gate (yard coordinates): straight out past the cairns, then round to the
// east and out of sight behind a mesa. The dunes are levelled along it (roadOff, used by level.js).
export const ROAD = [[0, 12.6], [0, 26], [0.5, 38], [3, 50], [9, 62], [19, 74], [35, 84], [57, 90], [90, 93], [130, 92]];
export const lineOff = (line, x, z) => { // metres from a line of points
  let m = 1e9; for (let i = 0; i + 1 < line.length; i++) { const [ax, az] = line[i], bx = line[i + 1][0] - ax, bz = line[i + 1][1] - az, u = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz))); m = Math.min(m, Math.hypot(x - ax - bx * u, z - az - bz * u)); }
  return m;
};
export const roadOff = (x, z) => lineOff(ROAD, x, z); // metres from the road's line

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
  const mAdobe = toon(0xffffff, { map: adobe }), mCap = toon(0xa8937a, { map: adobe }), mWood = toon(0x6a4a2c), mWoodD = toon(0x46301e), mStone = toon(0xb09a78), mIron = toon(0x2a2c32);
  const mAwn = toon(0xffffff, { map: stripe, side: T.DoubleSide }), mCrate = toon(0xffffff, { map: TEX.crate }), mBarrel = toon(0xffffff, { map: TEX.barrel }), mSack = toon(0xa89674), mStraw = toon(0xb9a25a);
  const mJar = toon(0xb0653a), mFrond = toon(0x5d7838, { side: T.DoubleSide }), mTrunk = toon(0x7d6546), mRope = toon(0x8a7650), mIn = new T.MeshBasicMaterial({ color: 0x0c0a09 }), mWater = toon(0x2c4e58);
  let dest = null, mesaFn = null; // (dest: the frontier borrows the palm and the mesa, and has them built into its own group)
  const add = (geo, mat, x, y, z, ry, to = dest || g) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = m.receiveShadow = !!mat.isMeshToonMaterial; to.add(m); return m; };
  // A box whose texture is laid at a fixed size in metres (`tile`), so long walls aren't smeared.
  const box = (w, h, d, mat, x, y, z, ry, tile, to) => {
    const geo = new T.BoxGeometry(w, h, d);
    if (tile) { const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); } }
    return add(geo, mat, x, y, z, ry, to);
  };
  const stick = (a, b, rad, mat, to = g) => { const m = add(new T.CylinderGeometry(rad, rad, a.distanceTo(b), 7), mat, 0, 0, 0, 0, to); m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); return m; };

  // ---- The yard is small and closed in: 22 m by 24 between walls well over head height, so that from anywhere
  // in it the eye runs down two walls to the gatehouse, as it runs down the halls to the Door. What stands in it
  // is gathered into corners that are each somebody's (the stable, the well, the stall, the stores) and the
  // middle is left as trodden earth. XW: the side walls' inner faces. The house front is at z = -12.1 and the
  // north wall's inner face at z = 12.
  const XW = 11.2, mBase = toon(0xb8a288, { map: adobe }), mSand = toon(0xc4a97c, { map: TEX.sand }), mShade = toon(0x8f7c62, { side: T.DoubleSide });
  // packed earth: darker and redder than the sand outside, pebbled, cracked where it dries
  const earth = canvasTex(256, (c, n) => {
    speck(c, n, [176, 138, 98], 12, q);
    for (let i = 0; i < 70; i++) { c.fillStyle = q() < 0.55 ? 'rgba(112,80,52,.10)' : 'rgba(226,196,150,.09)'; c.beginPath(); c.arc(q() * n, q() * n, 8 + q() * 40, 0, 7); c.fill(); }
    for (let i = 0; i < 160; i++) { const x = q() * n, y = q() * n, r = 0.6 + q() * 1.6; c.fillStyle = 'rgba(70,48,32,.35)'; c.beginPath(); c.arc(x + 0.6, y + 0.6, r, 0, 7); c.fill(); c.fillStyle = 'rgba(214,190,156,.55)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(84,58,38,.28)'; c.lineWidth = 0.9; for (let k = 0; k < 9; k++) { let x = q() * n, y = q() * n; c.beginPath(); c.moveTo(x, y); for (let m = 0; m < 5; m++) { x += (q() - 0.5) * 34; y += (q() - 0.5) * 34; c.lineTo(x, y); } c.stroke(); }
  });
  const flat = (geo, mat, x, y, z) => { const m = add(geo, mat, x, y, z); m.rotation.x = -PI / 2; m.castShadow = false; return m; };
  { flat(new T.PlaneGeometry(XW * 2 + 1.4, 25.4), toon(0xf2e2c8, { map: rep(earth, 7, 8) }), 0, 0.012, 0);
    // the road: a ribbon along ROAD, narrowing a little as it goes (it used to stop dead a few metres out)
    { const cv = new T.CatmullRomCurve3(ROAD.map(([x, z]) => V(x, 0, z))), n = 90, pts = cv.getSpacedPoints(n), L = cv.getLength(), pos = [], uv = [], nor = [], idx = [];
      for (let i = 0; i <= n; i++) { const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), w = (7 - 1.6 * Math.min(1, (i / n) * 2)) / 2;
        pos.push(p.x - (dz / l) * w, 0, p.z + (dx / l) * w, p.x + (dz / l) * w, 0, p.z - (dx / l) * w); uv.push(0, (i / n) * L / 2.5, 2.8, (i / n) * L / 2.5); nor.push(0, 1, 0, 0, 1, 0);
        if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
      const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); rg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); rg.setIndex(idx);
      add(rg, toon(0xe2d0b0, { map: rep(TEX.sand, 1, 1) }), 0, 0.011, 0).castShadow = false; }
    // stone where people stand: flags before the house, under the gate and fanning a little way in, and round the well
    flat(new T.PlaneGeometry(22.4, 3.6), toon(0xffffff, { map: rep(TEX.flags, 6, 1) }), 0, 0.02, -10.3);
    flat(new T.PlaneGeometry(6.4, 5.6), toon(0xd9cdb8, { map: rep(TEX.flags, 2, 2) }), 0, 0.02, 12.2);
    flat(new T.CircleGeometry(2.9, 28), toon(0xe0d4be, { map: rep(TEX.flags, 2, 2) }), -6.0, 0.018, 5.4); }

  // walls: thick plastered mud brick on a battered footing. The tops have weathered: every length stands at its
  // own height, some have lost a course, and the brick shows where the plaster has gone.
  const pierG = new T.CylinderGeometry(0.44, 0.74, 1, 4); pierG.rotateY(PI / 4);
  const wall = (x0, z0, x1, z1, h, t) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.6)), ry = Math.atan2(x1 - x0, z1 - z0) + PI / 2;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, hh = h + Q(-0.28, 0.22) - (q() < 0.22 ? Q(0.3, 0.6) : 0), x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u, w = len / n;
      box(w + 0.02, hh, t + Q(-0.04, 0.06), mAdobe, x, hh / 2, z, ry, 3.2); box(w + 0.05, 0.7, t + 0.34, mBase, x, 0.35, z, ry, 3.2);
      box(w * Q(0.55, 0.98), 0.2, t * 0.82, mCap, x + Q(-0.1, 0.1), hh + 0.1, z, ry, 3.2); // what is left of the coping
      if (q() < 0.6) { const s = Q(0.16, 0.3), l = add(new T.DodecahedronGeometry(s, 0), mCap, x + (x1 - x0) / len * Q(-0.9, 0.9), hh + 0.2 + s * 0.3, z + (z1 - z0) / len * Q(-0.9, 0.9), Q(0, 3)); l.scale.y = 0.6; } }
  };
  const pier = (x, z, h) => { const m = add(pierG, mAdobe, x, h / 2, z); m.scale.set(1.5, h, 1.5); add(new T.BoxGeometry(0.9, 0.16, 0.9), mCap, x, h + 0.06, z); };
  const WH = 4.4;
  wall(-12.6, 12.6, -5.8, 12.6, WH, 1.2); wall(5.8, 12.6, 12.6, 12.6, WH, 1.2); wall(-XW - 0.7, -12.6, -XW - 0.7, 12.0, WH, 1.4); wall(XW + 0.7, -12.6, XW + 0.7, 12.0, WH, 1.4);
  for (const s of [-1, 1]) { box(1.9, WH + 0.7, 1.9, mAdobe, s * (XW + 0.7), (WH + 0.7) / 2, 12.6, 0, 3.2); box(2.1, 0.22, 2.1, mCap, s * (XW + 0.7), WH + 0.81, 12.6, 0, 3.2); // corner piers
    for (const z of [-3.4, 7.2]) pier(s * (XW + 0.35), z, WH - 0.7); pier(s * 8.6, 12.3, WH - 0.7); }
  // The gatehouse: two towers and an arch between them, deep enough to walk through in shadow. It is the
  // tallest thing in the yard and the only opening, with the road and the mesas lit beyond it.
  { const TW = 2.6, TD = 3.2, TH = 7.2, TX = 4.5;
    for (const s of [-1, 1]) {
      box(TW, TH, TD, mAdobe, s * TX, TH / 2, 12.6, 0, 3.2); box(TW + 0.4, 1.0, TD + 0.4, mBase, s * TX, 0.5, 12.6, 0, 3.2); box(TW + 0.3, 0.26, TD + 0.3, mCap, s * TX, TH + 0.13, 12.6, 0, 3.2);
      for (const a of [-1, 1]) for (const b of [-1, 1]) { if (s * a > 0 && b < 0 && s > 0) continue; /* one has fallen */ const mh = Q(0.4, 0.62); box(0.62, mh, 0.7, mAdobe, s * TX + a * 0.98, TH + 0.26 + mh / 2, 12.6 + b * 1.2, 0, 3.2); }
      for (const z of [11.5, 12.6, 13.7]) add(new T.CylinderGeometry(0.08, 0.08, 0.9, 7), mWoodD, s * (TX - TW / 2 - 0.1) , 5.9, z).rotation.z = PI / 2; // beam ends
      for (const y of [3.0, 4.6]) { const m = new T.Mesh(new T.PlaneGeometry(0.22, 0.8), mIn); m.position.set(s * TX, y, 10.99); m.rotation.y = PI; g.add(m); const o = new T.Mesh(new T.PlaneGeometry(0.22, 0.8), mIn); o.position.set(s * TX, y, 14.21); g.add(o); } // loops
      // the leaves, swung in and back against the passage walls (a few centimetres clear of them: touching faces flicker)
      box(0.14, 3.6, 2.9, mWood, s * 3.06, 1.85, 12.6); for (const y of [0.6, 1.85, 3.1]) box(0.17, 0.12, 2.92, mIron, s * 3.06, y, 12.6);
    }
    const sh = new T.Shape(); sh.moveTo(-3.2, 3.3); sh.absellipse(0, 3.3, 3.2, 1.3, PI, 0, true); sh.lineTo(3.2, 6.6); sh.lineTo(-3.2, 6.6); sh.lineTo(-3.2, 3.3);
    add(new T.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: false, curveSegments: 18 }), toon(0xffffff, { map: rep(adobe, 1 / 3.2, 1 / 3.2) }), 0, 0, 11.3);
    box(6.5, 0.22, 2.8, mCap, 0, 6.71, 12.6, 0, 3.2); for (const x of [-2.3, -0.8, 0.8, 2.3]) for (const z of [11.5, 13.7]) box(0.7, Q(0.34, 0.5), 0.5, mAdobe, x, 7.03, z, 0, 3.2);
    for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) for (const z of [11.2, 14.0]) add(new T.CylinderGeometry(0.075, 0.075, 0.7, 7), mWoodD, x, 5.45, z).rotation.x = PI / 2;
    box(1.6, 0.5, 0.08, mWood, 0, 5.95, 14.0); // a weathered signboard, facing the road
    // a pole on the west tower with a long faded pennant
    add(new T.CylinderGeometry(0.035, 0.05, 3.4, 6), mWoodD, -TX, TH + 1.9, 12.6);
    { const b = new T.Group(); b.position.set(-TX, TH + 3.3, 12.6); g.add(b); const pg = new T.PlaneGeometry(2.2, 0.5, 6, 1), pp = pg.attributes.position; for (let i = 0; i < pp.count; i++) { const u = pp.getX(i) / 2.2 + 0.5; pp.setY(i, pp.getY(i) * (1 - u * 0.75) - u * u * 0.5); } pg.translate(1.1, -0.2, 0); pg.computeVertexNormals(); const c = new T.Mesh(pg, toon(0x8a3a2c, { side: T.DoubleSide })); c.rotation.y = -0.5; c.castShadow = true; b.add(c); banners.push(b); } }

  // the house: one long storey with roof beams poking through the front, and a domed tower at the west end
  box(25.2, 4.6, 5, mAdobe, 0, 2.3, -14.6, 0, 3.2); box(25.5, 0.36, 5.3, mCap, 0, 4.78, -14.6, 0, 3.2); box(22.4, 0.6, 0.5, mBase, 0, 0.3, -12.0, 0, 3.2);
  for (let x = -10.6; x < 11; x += 2.36) add(new T.CylinderGeometry(0.09, 0.09, 1.0, 8), mWoodD, x, 3.95, -11.9).rotation.x = PI / 2;
  box(6, 3.3, 4.4, mAdobe, -8.6, 6.4, -14.9, 0, 3.2); box(6.3, 0.3, 4.7, mCap, -8.6, 8.15, -14.9, 0, 3.2);
  { const d = add(new T.SphereGeometry(1.9, 18, 8, 0, PI * 2, 0, PI / 2), mAdobe, -8.6, 8.28, -14.9); d.scale.y = 0.8; add(new T.ConeGeometry(0.08, 0.5, 6), mIron, -8.6, 10.0, -14.9); }
  box(5.2, 1.5, 4.0, mAdobe, 8.4, 5.5, -15.0, 0, 3.2); box(5.5, 0.26, 4.3, mCap, 8.4, 6.38, -15.0, 0, 3.2); // a low upper room at the east end
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

  // the well, west of the way in, under a small pitched roof, on its own round of stone
  { const x = -6.0, z = 5.4; add(new T.CylinderGeometry(1.12, 1.24, 0.86, 18), mStone, x, 0.43, z); add(new T.TorusGeometry(1.06, 0.13, 8, 20), mStone, x, 0.86, z).rotation.x = PI / 2;
    const d = new T.Mesh(new T.CircleGeometry(0.98, 18), mIn); d.rotation.x = -PI / 2; d.position.set(x, 0.84, z); g.add(d);
    for (const s of [-1, 1]) { box(0.15, 2.5, 0.15, mWood, x + s * 1.12, 1.25, z); const r = box(2.7, 0.07, 1.0, mWoodD, x, 2.78, z + s * 0.4); r.rotation.x = s * 0.62; }
    add(new T.CylinderGeometry(0.09, 0.09, 2.5, 8), mWoodD, x, 2.1, z).rotation.z = PI / 2; stick(V(x + 1.3, 2.1, z), V(x + 1.3, 1.8, z + 0.25), 0.03, mIron);
    stick(V(x, 2.1, z), V(x, 0.7, z), 0.022, mRope); add(new T.CylinderGeometry(0.19, 0.15, 0.32, 10), mWood, x + 0.55, 1.06, z + 0.9); add(new T.TorusGeometry(0.185, 0.02, 5, 12), mIron, x + 0.55, 1.2, z + 0.9).rotation.x = PI / 2;
    block(x, z, 1.5); }

  // lean-to stable against the west wall: thatch on posts, a trough, hay
  { const o = 4.4; for (const z of [-8.5, -4.5, -0.5]) { add(new T.CylinderGeometry(0.09, 0.11, 2.5, 8), mWood, -11.7 + o, 1.25, z); block(-11.7 + o, z, 0.3); stick(V(-11.6 + o, 2.48, z), V(-15.55 + o, 3.14, z), 0.06, mWoodD); }
    const r = box(4.1, 0.14, 8.8, mStraw, -13.5 + o, 2.88, -4.5); r.rotation.z = -0.17; stick(V(-11.7 + o, 1.0, -8.5), V(-11.7 + o, 1.0, -4.5), 0.05, mWood);
    box(2.4, 0.5, 0.7, mWoodD, -13.5 + o, 0.3, -2.0); const w = box(2.2, 0.02, 0.5, mWater, -13.5 + o, 0.5, -2.0); w.castShadow = false;
    for (const [x, y, z, ry] of [[-13.9, 0.26, -6.9, 0.2], [-13.0, 0.26, -6.2, -0.4], [-13.7, 0.78, -6.7, 0.5], [-14.2, 0.26, -4.4, 0]]) box(0.95, 0.52, 0.6, mStraw, x + o, y, z, ry);
    for (const z of [-7.0, -4.5, -2.0]) block(-13.6 + o, z, 1.5); }

  // a stall on the east wall, by the gate: striped cloth, a trestle with jars. SX, SZ: where it stands (the dressing below uses them too).
  const SX = -3.9, SZ = 8.3;
  const jarG = new T.LatheGeometry([[0.1, 0], [0.2, 0.1], [0.27, 0.3], [0.24, 0.5], [0.12, 0.62], [0.11, 0.68], [0.15, 0.72]].map(([a, b]) => new T.Vector2(a, b)), 12);
  const jar = (x, z, s, y = 0) => add(jarG, mJar, x, y, z, Q(0, 3)).scale.setScalar(s);
  { awning(5.4, 3.4, 3.4, 2.75, 15.1 + SX, -4.5 + SZ, -PI / 2);
    for (const z of [-7.1, -1.9]) { add(new T.CylinderGeometry(0.07, 0.09, 2.75, 8), mWood, 11.7 + SX, 1.37, z + SZ); block(11.7 + SX, z + SZ, 0.28); }
    box(1.0, 0.08, 2.8, mWood, 13.7 + SX, 0.9, -4.5 + SZ); for (const z of [-5.6, -3.4]) box(0.8, 0.9, 0.08, mWoodD, 13.7 + SX, 0.45, z + SZ);
    jar(13.6 + SX, -5.3 + SZ, 0.55, 0.94); jar(13.9 + SX, -4.6 + SZ, 0.45, 0.94); jar(13.5 + SX, -3.8 + SZ, 0.6, 0.94); jar(12.5 + SX, -6.3 + SZ, 1.0); jar(12.6 + SX, -2.7 + SZ, 0.85);
    block(13.6 + SX, -5.9 + SZ, 1.45); block(13.6 + SX, -3.1 + SZ, 1.45); }

  // a two-wheeled cart drawn up beside the stall, half unloaded, its shafts on the ground
  const CX = 8.0, CZ = -1.7, CR = 0.35;
  { const c = new T.Group(); c.position.set(CX, 0, CZ); c.rotation.y = CR; g.add(c); const put = (geo, mat, x, y, z) => add(geo, mat, x, y, z, 0, c);
    box(1.5, 0.1, 2.7, mWood, 0, 0.95, 0, 0, 0, c); for (const s of [-1, 1]) { box(0.07, 0.42, 2.7, mWood, s * 0.73, 1.2, 0, 0, 0, c); box(1.5, 0.42, 0.07, mWood, 0, 1.2, s * 1.32, 0, 0, c); }
    put(new T.CylinderGeometry(0.05, 0.05, 2.0, 8), mWoodD, 0, 0.62, 0).rotation.z = PI / 2;
    for (const s of [-1, 1]) { put(new T.TorusGeometry(0.58, 0.06, 6, 20), mWoodD, s * 0.95, 0.62, 0).rotation.y = PI / 2; put(new T.CylinderGeometry(0.11, 0.11, 0.2, 10), mIron, s * 0.95, 0.62, 0).rotation.z = PI / 2;
      for (let k = 0; k < 4; k++) put(new T.BoxGeometry(0.05, 1.12, 0.06), mWood, s * 0.95, 0.62, 0).rotation.x = k * PI / 4;
      stick(V(s * 0.55, 0.92, 1.3), V(s * 0.5, 0.07, 3.5), 0.045, mWood, c); }
    for (const [x, y, z, s] of [[-0.3, 1.2, -0.7, 0.34], [0.3, 1.18, -0.2, 0.3], [-0.1, 1.42, -0.5, 0.28]]) { const k = put(new T.SphereGeometry(s, 8, 6), mSack, x, y, z); k.scale.set(1, 0.6, 0.85); k.rotation.y = Q(0, 3); }
    box(0.6, 0.55, 0.6, mCrate, 0.15, 1.28, 0.75, 0.3, 0, c);
    const cs = Math.cos(CR), sn = Math.sin(CR); for (const [z, r] of [[-0.6, 1.2], [0.8, 1.2], [2.5, 0.6]]) block(CX + sn * z, CZ + cs * z, r); }

  // goods, each lot in its own corner: the house's stores under a shade cloth in the south-east, water and oil by the
  // gate on the stall's side, a carter's load set down in the north-west, the big jars by the stable
  const barrelG = new T.CylinderGeometry(0.33, 0.33, 0.9, 12, 4); { const p = barrelG.attributes.position; for (let i = 0; i < p.count; i++) { const f = 1 + 0.14 * Math.cos((p.getY(i) / 0.45) * PI / 2); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } barrelG.computeVertexNormals(); }
  const crate = (x, z, s, top) => { box(s, s, s, mCrate, x, s / 2, z, Q(0, 1.5)); block(x, z, s * 0.7); if (top) { const t = s * 0.65; box(t, t, t, mCrate, x + Q(-0.06, 0.06), s + t / 2, z + Q(-0.06, 0.06), Q(0, 1.5)); } };
  const barrel = (x, z) => { add(barrelG, mBarrel, x, 0.45, z, Q(0, 3)); block(x, z, 0.5); };
  const sack = (x, z, s = 0.3, y = 0) => { const k = add(new T.SphereGeometry(s, 8, 6), mSack, x, y + s * 0.62, z, Q(0, 3)); k.scale.set(1, 0.7, 0.8); };
  crate(10.2, -10.8, 0.85, true); crate(9.15, -11.0, 0.7); crate(10.35, -9.75, 0.6); crate(9.2, -10.1, 0.5); sack(8.3, -11.2); sack(10.3, -8.9, 0.28); sack(8.6, -10.5, 0.26); sack(9.2, -10.95, 0.24, 0.7);
  barrel(-8.4, 11.0); barrel(-9.3, 10.75); barrel(-10.2, 11.1); crate(-7.4, 11.0, 0.7, true); sack(-8.8, 10.0); sack(-9.9, 10.2, 0.27); sack(-7.9, 10.2, 0.25);
  barrel(9.4, 11.0); barrel(10.3, 11.05); barrel(9.9, 10.15); barrel(10.45, 9.3); sack(8.5, 11.2); sack(9.0, 10.1, 0.27); crate(8.3, 10.4, 0.55);
  jar(-10.3, -10.9, 1.0); jar(-9.5, -10.7, 0.8); jar(-10.1, -10.1, 0.65); jar(-9.2, -10.0, 0.5); block(-9.9, -10.5, 0.9);
  box(1.9, 0.08, 0.4, mWood, 9.0, 0.46, -6.2, PI / 2); for (const z of [-7.0, -5.4]) box(0.34, 0.44, 0.1, mWoodD, 10.4 - 1.4, 0.22, z); block(9.0, -6.2, 0.6); // a bench in the east wall's shade
  // sand, blown over the walls and banked against their feet, deepest in the corners
  { const parts = [], M = new T.Matrix4(), drift = (x, z, l, d, h, ry) => { const s = new T.SphereGeometry(1, 12, 6, 0, PI * 2, 0, PI / 2); s.applyMatrix4(M.makeRotationY(ry).multiply(new T.Matrix4().makeScale(l, h, d))); s.translate(x, 0, z); parts.push(s); };
    for (const s of [-1, 1]) { drift(s * (XW - 0.1), 11.6, 1.6, 2.6, 0.5, 0.5 * s); drift(s * (XW + 0.1), 3.4 + s, 0.9, 2.4, 0.34, 0); drift(s * 7.4, 12.05, 1.9, 0.8, 0.3, 0); drift(s * (XW + 0.1), -6.4 * (s > 0 ? 1 : 0) - 1.0, 0.8, 1.8, 0.26, 0); }
    drift(XW, -11.9, 1.3, 1.1, 0.3, 0); drift(-XW + 0.1, 9.0, 0.9, 1.7, 0.4, 0); drift(-5.2, 14.3, 2.6, 1.3, 0.55, 0.2); drift(6.4, 14.4, 3.0, 1.4, 0.6, -0.1); drift(-13.1, 6, 1.4, 5, 0.7, 0); drift(13.2, -2, 1.5, 6, 0.8, 0); drift(-9, 13.6, 4, 1.4, 0.7, 0); drift(10, 13.7, 3.4, 1.3, 0.6, 0);
    const m = add(mergeGeometries(parts), mSand, 0, 0, 0); m.castShadow = false; }

  // date palms (owner, Nov 2026: they were blocky). The trunk is one swept surface, ringed with old leaf scars and swelling at
  // the foot; the fronds are cut out of a painted leaf (a rib and its leaflets) and stand in three tiers, upright in the
  // heart of the crown and arching and drooping round it, over a skirt of dead ones and the stubs they broke from.
  const frondTex = canvasTex(256, (c, n) => { const r = rng(91), cx = n / 2;
    for (let y = 5; y < n - 3; y += 7) { const t = 1 - y / n, len = (n / 2 - 5) * Math.pow(Math.sin(PI * (0.05 + 0.92 * t)), 0.55);
      for (const sd of [-1, 1]) { const sh = 185 + r() * 70, d = r() * 8; c.strokeStyle = `rgb(${(sh * 0.93) | 0},${sh | 0},${(sh * 0.78) | 0})`; c.lineWidth = 3.4 + r() * 1.6; c.beginPath(); c.moveTo(cx, y); c.quadraticCurveTo(cx + sd * len * 0.55, y - len * 0.3, cx + sd * len, y - len * 0.22 + d); c.stroke(); } }
    c.strokeStyle = 'rgb(214,200,150)'; c.lineWidth = 6; c.beginPath(); c.moveTo(cx, n); c.lineTo(cx, 0); c.stroke(); });
  const barkTex = canvasTex(128, (c, n) => { const r = rng(92); speck(c, n, [206, 198, 186], 30, r);
    for (let row = 0; row < 8; row++) { const y = row * 16; c.fillStyle = 'rgba(0,0,0,.34)'; c.fillRect(0, y, n, 2.5); c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(0, y + 2.5, n, 1.5);
      for (let k = 0; k < 4; k++) { const x = k * 32 + (row % 2 ? 16 : 0) + r() * 6; c.strokeStyle = `rgba(0,0,0,${0.2 + r() * 0.2})`; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - 9, y + 3); c.lineTo(x, y + 13); c.lineTo(x + 9, y + 3); c.stroke(); } }
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`; c.fillRect(r() * n, r() * n, 1.2, 4 + r() * 10); } });
  mTrunk.map = barkTex; mFrond.map = frondTex; mFrond.alphaTest = 0.3; const mDry = toon(0x9a8250, { side: T.DoubleSide, map: frondTex, alphaTest: 0.3 }), pq = rng(4242), PQ = (a, b) => a + pq() * (b - a);
  const palm = (x, z, h, lean, la, solid) => {
    for (let i = 0; i < 52; i++) q(); // (the old palm drew its numbers from the yard's own: keep everything after it where it was)
    const NS = 34, NR = 14, pos = [], uv = [], idx = [], tx = Math.sin(la) * lean, tz = Math.cos(la) * lean;
    for (let i = 0; i <= NS; i++) { const u = i / NS, off = lean * u * u, r = (0.25 - 0.1 * u) * (1 + 0.55 * Math.exp(-u * 13)) * (i % 2 ? 1.07 : 0.96) * (1 + 0.5 * Math.max(0, u - 0.93) * 6);
      for (let j = 0; j <= NR; j++) { const a = (j / NR) * PI * 2; pos.push(Math.sin(la) * off + Math.cos(a) * r, h * u - 0.3, Math.cos(la) * off + Math.sin(a) * r); uv.push((j / NR) * 3, u * h * 1.1); }
      if (i < NS) for (let j = 0; j < NR; j++) { const k = i * (NR + 1) + j; idx.push(k, k + NR + 1, k + 1, k + 1, k + NR + 1, k + NR + 2); } }
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
    { const nm = tg.attributes.normal; for (let i = 0; i <= NS; i++) { const a2 = i * (NR + 1), b2 = a2 + NR, nx = nm.getX(a2) + nm.getX(b2), ny = nm.getY(a2) + nm.getY(b2), nz = nm.getZ(a2) + nm.getZ(b2), l = Math.hypot(nx, ny, nz); nm.setXYZ(a2, nx / l, ny / l, nz / l); nm.setXYZ(b2, nx / l, ny / l, nz / l); } }
    add(tg, mTrunk, x, 0, z);
    const stubs = [], M = new T.Matrix4(), e = new T.Euler(); // the stubs of old fronds, under the crown
    for (let i = 0; i < 14; i++) { const a = (i / 14) * PI * 2 + PQ(-0.2, 0.2), L = PQ(0.35, 0.6), c = new T.ConeGeometry(0.06, L, 5); c.translate(0, L / 2, 0); c.applyMatrix4(M.makeRotationFromEuler(e.set(PQ(0.5, 0.95), a, 0, 'YXZ')).setPosition(tx + Math.sin(a) * 0.12, h - PQ(0.15, 0.6), tz + Math.cos(a) * 0.12)); stubs.push(c); }
    const heart = new T.SphereGeometry(0.3, 10, 8); heart.scale(1, 1.25, 1); heart.translate(tx, h - 0.05, tz); stubs.push(heart); add(mergeGeometries(stubs), mTrunk, x, 0, z);
    const frond = (list, a, L, e0, k, W) => { const f = new T.PlaneGeometry(1, 1, 2, 10), p = f.attributes.position, tw = PQ(-0.25, 0.25);
      for (let v = 0; v < p.count; v++) { const t = p.getY(v) + 0.5, w = p.getX(v) * W, out = L * (Math.sin(e0) - Math.sin(e0 - k * t)) / k, up = L * (Math.cos(e0 - k * t) - Math.cos(e0)) / k; p.setXYZ(v, w * Math.cos(tw * t), up - Math.abs(w) * (0.35 + 0.3 * t) + w * Math.sin(tw * t), out); }
      f.rotateY(a); f.translate(tx, h + 0.05, tz); list.push(f); };
    const fr = [], dry = [];
    for (let i = 0; i < 6; i++) frond(fr, (i / 6) * PI * 2 + PQ(-0.3, 0.3), PQ(2.0, 2.6), PQ(1.15, 1.45), PQ(1.1, 1.6), 0.95);
    for (let i = 0; i < 11; i++) frond(fr, (i / 11) * PI * 2 + PQ(-0.25, 0.25), PQ(2.7, 3.4), PQ(0.6, 1.0), PQ(1.6, 2.1), 1.2);
    for (let i = 0; i < 9; i++) frond(fr, (i / 9) * PI * 2 + 0.3 + PQ(-0.25, 0.25), PQ(2.5, 3.1), PQ(0.1, 0.42), PQ(1.3, 1.75), 1.15);
    for (let i = 0; i < 8; i++) frond(dry, (i / 8) * PI * 2 + PQ(-0.3, 0.3), PQ(1.5, 2.1), PQ(-0.75, -0.35), PQ(0.6, 0.9), 0.85);
    const fg = mergeGeometries(fr); fg.computeVertexNormals(); add(fg, mFrond, x, 0, z); const dg = mergeGeometries(dry); dg.computeVertexNormals(); add(dg, mDry, x, -0.25, z);
    if (solid) block(x, z, 0.5);
  };
  palm(-9.4, 7.6, 7.0, 1.1, 1.9, true); palm(-15.6, 9, 7.6, 1.2, -1.2); palm(-17.5, 3.5, 6.0, 0.8, 2.6); palm(15.4, -3, 7.8, 1.1, 0.6); palm(8.5, 21, 6.6, 1.0, -2.2); palm(-7.5, 24, 5.6, 0.7, 1.0); palm(15.6, 15, 6.3, 0.9, 3.4); palm(14.2, 6.5, 8.4, 1.3, -1.3);

  // ---- the yard, in use: ruts where the carts come in, the earth trodden dark between gate, door and
  // well, straw by the stable, cloth hung across the corners, a ladder left against the house, a rug and
  // baskets out at the stall. Dressing only, with its own numbers.
  { const wq = rng(417), C = (a, b) => a + wq() * (b - a);
    const mCloths = [0x39507e, 0xd8ccb0, 0x9a4a30, 0xc9b98f, 0x6a3a52, 0x4c6a5a].map((c) => toon(c, { side: T.DoubleSide })), mBasket = toon(0xa98450), mDate = toon(0x4a2a1c), mGrain = toon(0xd2b877);
    const rug = canvasTex(64, (c, n) => { speck(c, n, [142, 44, 40], 16, wq); c.fillStyle = '#2f3f66'; c.fillRect(0, 0, n, 5); c.fillRect(0, n - 5, n, 5); c.fillRect(0, 0, 4, n); c.fillRect(n - 4, 0, 4, n);
      c.fillStyle = '#d9c08a'; for (const y of [10, 31, 52]) c.fillRect(6, y, n - 12, 2); for (let k = 0; k < 3; k++) for (const y of [20, 42]) { const x = 14 + k * 18; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath(); c.fill(); }
      c.fillStyle = 'rgba(40,20,16,.12)'; for (let i = 0; i < n; i += 2) c.fillRect(0, i, n, 1); });
    rug.wrapS = rug.wrapT = T.ClampToEdgeWrapping; const mRug = toon(0xffffff, { map: rug });
    // the stall: a rug laid out in front, two more rolled, baskets of dates and grain, small jars hung from a pole between the posts
    { const r = add(new T.PlaneGeometry(1.5, 2.3), mRug, 10.75 + SX, 0.035, -4.4 + SZ); r.rotation.set(-PI / 2, 0, 0.06); r.castShadow = false; }
    for (const [x, z, ry] of [[12.2, -6.75, 0.2], [12.35, -6.95, 0.05]]) add(new T.CylinderGeometry(0.13, 0.13, 1.5, 10), mRug, x + SX, 0.14 + (ry < 0.1 ? 0.2 : 0), z + SZ).rotation.set(0, ry, PI / 2);
    const basketG = new T.LatheGeometry([[0.16, 0], [0.22, 0.1], [0.26, 0.24], [0.25, 0.3]].map(([a, b]) => new T.Vector2(a, b)), 12);
    const basket = (x, z, s, mFill) => { add(basketG, mBasket, x, 0, z, C(0, 3)).scale.setScalar(s); const f = add(new T.SphereGeometry(0.235 * s, 10, 5, 0, PI * 2, 0, PI / 2), mFill, x, 0.24 * s, z); f.scale.y = 0.4; add(new T.TorusGeometry(0.25 * s, 0.022 * s, 5, 12), mBasket, x, 0.3 * s, z).rotation.x = PI / 2; };
    basket(12.0 + SX, -5.2 + SZ, 1, mDate); basket(11.95 + SX, -3.7 + SZ, 1.1, mGrain); basket(12.1 + SX, -4.45 + SZ, 0.85, mDate); basket(2.4, -11.4, 1.1, mGrain); basket(3.0, -11.0, 0.9, mDate); basket(8.9, -9.3, 1.0, mGrain);
    stick(V(11.7 + SX, 2.62, -7.1 + SZ), V(11.7 + SX, 2.62, -1.9 + SZ), 0.035, mWood);
    for (let k = 0; k < 6; k++) { const z = -6.5 + k * 0.82 + C(-0.1, 0.1) + SZ, l = C(0.12, 0.3), sc = k % 3 === 1 ? 0.2 : 0.26; stick(V(11.7 + SX, 2.6, z), V(11.7 + SX, 2.6 - l, z), 0.008, mRope); add(jarG, mJar, 11.7 + SX, 2.6 - l - 0.7 * sc, z, C(0, 3)).scale.setScalar(sc); } // well over head height
    // what came off the cart, between it and the stall
    for (const [x, z, s2] of [[6.9, -0.2, 0.3], [7.3, 0.5, 0.26], [6.6, 0.45, 0.24]]) sack(x, z, s2); add(barrelG, mBarrel, 6.3, 0.45, -2.9, 1); block(6.3, -2.9, 0.5);
    // a ladder against the house, a broom by the door, a bowl on the bench
    { const x = 7.3; for (const s of [-1, 1]) stick(V(x + s * 0.22, 0, -10.95), V(x + s * 0.22, 4.7, -12.0), 0.035, mWood); for (let k = 0; k < 9; k++) { const u = (k + 1) / 10; stick(V(x - 0.24, 4.7 * u, -10.95 - 1.05 * u), V(x + 0.24, 4.7 * u, -10.95 - 1.05 * u), 0.022, mWoodD); } block(x, -11.3, 0.5); }
    stick(V(-1.5, 0.1, -11.6), V(-1.42, 1.55, -11.98), 0.02, mWood); add(new T.ConeGeometry(0.11, 0.34, 8), mStraw, -1.51, 0.19, -11.57).rotation.x = 0.25;
    add(new T.CylinderGeometry(0.1, 0.06, 0.07, 10), mJar, -5.2, 0.555, -11.72);
    // Cloth overhead, where nobody walks under it with a camera: lines of dyed lengths across the two corners by the
    // gate, and a patched shade cloth over the stores. Looking up the yard they hang in the top of the picture, either side of the gatehouse.
    const line = (a, b, sagM, n, lo) => { const pt = (u) => a.clone().lerp(b, u).setY(a.y + (b.y - a.y) * u - Math.sin(PI * u) * sagM); for (let k = 0; k < 8; k++) stick(pt(k / 8), pt((k + 1) / 8), 0.012, mRope);
      const ry = Math.atan2(b.x - a.x, b.z - a.z) - PI / 2; for (let k = 0; k < n; k++) { const u = (k + 0.8 + C(-0.15, 0.15)) / (n + 0.6), p = pt(u), w = C(0.6, 1.0), h = C(0.8, lo), cg = new T.PlaneGeometry(w, h, 2, 4), cp = cg.attributes.position; for (let i = 0; i < cp.count; i++) cp.setZ(i, Math.sin((cp.getY(i) / h + 0.5) * 2.4 + k) * 0.05 * (0.5 - cp.getY(i) / h)); cg.computeVertexNormals();
        const c = add(cg, mCloths[(k + n) % mCloths.length], p.x, p.y - h / 2, p.z, ry + C(-0.08, 0.08)); c.rotation.z = C(-0.03, 0.03); } };
    line(V(-5.9, 4.9, 11.3), V(-XW, 4.25, 4.6), 0.3, 6, 1.5); line(V(5.9, 5.0, 11.3), V(XW, 4.3, 7.4), 0.25, 4, 1.3); line(V(-XW, 4.2, -9.6), V(-4.4, 4.4, -12.0), 0.25, 5, 1.2);
    { const a = V(5.8, 4.5, -12.0), b = V(XW, 4.5, -12.0), c = V(XW, 4.2, -6.8), sg = new T.PlaneGeometry(1, 1, 8, 8), sp = sg.attributes.position; // a three-cornered shade cloth: house, corner, east wall
      for (let i = 0; i < sp.count; i++) { const u = sp.getX(i) + 0.5, v = sp.getY(i) + 0.5, p = a.clone().multiplyScalar(1 - u).addScaledVector(b, u * (1 - v)).addScaledVector(c, u * v); p.y -= Math.sin(PI * u) * (0.25 + 0.35 * Math.sin(PI * v)); sp.setXYZ(i, p.x, p.y, p.z); }
      sg.computeVertexNormals(); add(sg, mShade, 0, 0, 0); stick(a, a.clone().setY(4.75), 0.02, mRope); }
    // a second bucket at the well, bundles off a pack animal by the stable, broken pots swept to the gate tower
    add(new T.CylinderGeometry(0.19, 0.15, 0.32, 10), mWood, -4.2, 0.16, 6.3, 0.4); add(new T.TorusGeometry(0.185, 0.02, 5, 12), mIron, -4.2, 0.3, 6.3).rotation.x = PI / 2;
    for (const [x, z, s] of [[-6.6, 1.2, 0.3], [-6.2, 0.5, 0.26], [-6.8, 0.45, 0.24]]) sack(x, z, s); box(0.7, 0.3, 0.4, mCloths[2], -5.9, 0.15, 1.35, 0.5); stick(V(-6.3, 0.32, 1.1), V(-5.55, 0.32, 1.6), 0.015, mRope);
    for (let k = 0; k < 7; k++) { const s = C(0.06, 0.15), p = add(new T.DodecahedronGeometry(s, 0), mJar, 3.6 + C(-0.4, 0.4), s * 0.25, 10.4 + C(-0.4, 0.3)); p.scale.y = 0.35; p.rotation.y = C(0, 3); }
    // way-marks along the road outside: cairns of three stones
    for (const [x, z] of [[4.4, 23], [-4.5, 30], [4.6, 36], [-1.6, 47], [12.5, 58], [13, 73], [36, 79.5]]) for (let k = 0; k < 3; k++) { const s = 0.4 - k * 0.11, c = add(new T.DodecahedronGeometry(s, 0), mStone, x + C(-0.05, 0.05), [0.24, 0.62, 0.9][k], z + C(-0.05, 0.05), C(0, 3)); c.scale.y = 0.7; }
    // the ground: every way people go is worn into it
    const ruts = decals(DECAL.ruts, 0x46321e, 0.85), dirt = decals(DECAL.soft, 0x5e4630, 0.4), pale = decals(DECAL.soft, 0xd9c092, 0.45), damp = decals(DECAL.soft, 0x3a2c20, 0.8) /* strong, because the sunlit earth is far brighter than white before the grade: a faint patch on it doesn't show at all */, straw = decals(DECAL.straw, 0xd2ba6a, 0.9), prints = decals(DECAL.prints, 0x4a341e, 0.6), crack = decals(DECAL.crack, 0x4a3422, 0.5);
    const lay = (set, pts, w, step) => { for (let i = 0; i + 1 < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], a = Math.atan2(x1 - x0, z1 - z0), L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step)); for (let k = 0; k < n; k++) { const u = (k + 0.5) / n; set.at(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, w, L / n + 0.7, a + PI, set === prints ? 0.036 : 0.03); } } };
    const PATHS = [[[0.3, 11.6], [0.2, 3.5], [0.1, -4], [0, -9.6]], [[-0.8, -9.4], [-3.0, -2.2], [-4.6, 3.6]], [[-5.4, -0.6], [-7.2, -3.4]], [[6.6, 3.6], [3.4, 7.2], [1.2, 10.4]], [[6.4, 2.2], [5.6, -4.6], [5.0, -9.2]], [[-7.6, 9.6], [-5.4, 7.4]], [[1.2, -9.4], [6.2, -2.6]], [[-3.8, 6.6], [-0.8, 9.8]]];
    lay(ruts, [[57, 90], [35, 84], [19, 74], [9, 62], [3, 50], [0.3, 38], [-0.2, 30], [0.2, 21], [0, 12.4], [0.5, 8.6], [2.6, 5.0], [5.6, 1.6], [7.2, -1.2]], 2.3, 3.4); // in off the road and round to where the cart stands
    for (const p of PATHS) { lay(prints, p, 0.9, 3.2); lay(dirt, p, 2.6, 2.2); } // trodden dark along every path, with the prints on top
    for (let i = 0; i < 10; i++) dirt.at(C(-2.6, 2.6), C(6.5, 13.5), C(2.6, 4.6), C(2.6, 4.6), C(0, 6.3)); for (let i = 0; i < 8; i++) dirt.at(C(-3, 3), C(-9.4, -6.4), C(2.4, 4.2), C(2, 3.4), C(0, 6.3));
    for (let i = 0; i < 7; i++) { const a = C(0, 6.3); dirt.at(-6 + Math.sin(a) * 3.1, 5.4 + Math.cos(a) * 3.1, C(1.8, 3), C(1.8, 3), C(0, 6.3)); } for (let i = 0; i < 8; i++) dirt.at(C(-2.6, 2.6), C(14, 38), C(2.6, 4.4), C(3, 5), C(0, 6.3));
    for (let i = 0; i < 44; i++) { const k = (wq() * 4) | 0, o = C(0.3, 1.5), s = C(2, 4.4), [x, z] = k === 0 ? [C(-10.5, 10.5), 11.9 - o] : k === 1 ? [-XW + o, C(-11, 11)] : k === 2 ? [XW - o, C(-11, 11)] : [C(-10.5, 10.5), -8.6 + C(0, 1.2)]; if (k === 0 && Math.abs(x) < 3.4) continue; pale.at(x, z, s, s * C(0.45, 0.8), k === 1 || k === 2 ? PI / 2 : 0); } // sand drifted to the wall feet
    for (let i = 0; i < 7; i++) pale.at(C(-2.8, 2.8), C(9.6, 15.5), C(2.4, 4), C(1.6, 2.6), C(0, 6.3), 0.032); // and blown in through the gate over the stone
    for (let i = 0; i < 9; i++) { const s = C(1.6, 3.2); crack.at(C(-4, 9), C(-7, 8), s, s, C(0, 6.3), 0.031); }
    damp.at(-6.0, 5.4, 4.6, 4.4, 0.3); damp.at(-4.5, 6.4, 2.4, 2.2, 1.2); damp.at(-7.9, -1.8, 2.6, 2.4, 0); damp.at(8.7, 1.9, 1.6, 1.5, 0); damp.at(-9.8, -10.3, 1.8, 1.5, 0.8); damp.at(9.8, 10.4, 2.2, 1.9, 0.4);
    for (let i = 0; i < 12; i++) straw.at(C(-8.0, -5.2), C(-9.4, 1.4), C(1.4, 2.6), C(1.4, 2.6), C(0, 6.3), 0.034); straw.at(7.8, -2.1, 2.4, 2.4, 1); straw.at(6.5, -0.7, 1.6, 1.6, 2);
    for (const d of [ruts, dirt, pale, damp, straw, prints, crack]) d.done(g); }

  // ---- light and air. Lanterns at the gate and the house door, which come up as the day goes (`update`); dust
  // hanging in the yard; and a low glow in the sky where the sun stands.
  const mLamp = new T.MeshBasicMaterial({ color: new T.Color(0.3, 0.2, 0.1), fog: false }), lamps = [];
  for (const [x, y, z] of [[-3.75, 3.1, 10.75], [3.75, 3.1, 10.75], [1.35, 2.5, -11.8]]) { box(0.26, 0.05, 0.26, mIron, x, y + 0.2, z); add(new T.BoxGeometry(0.15, 0.26, 0.15), mLamp, x, y, z); box(0.2, 0.04, 0.2, mIron, x, y - 0.16, z); stick(V(x, y + 0.22, z), V(x, y + 0.5, z + (z > 0 ? 0.25 : -0.25)), 0.014, mIron);
    const l = new T.PointLight(0xff9a4c, 0, 11, 2); l.position.set(x, y - 0.1, z + (z > 0 ? -0.5 : 0.5)); g.add(l); lamps.push(l); }
  const NM = 220, mp = new Float32Array(NM * 3), mb = new Float32Array(NM * 4), aq = rng(88);
  for (let i = 0; i < NM; i++) mb.set([(aq() * 2 - 1) * (XW - 0.4), 0.3 + aq() * 4.2, -11.5 + aq() * 25, aq() * 6.3], i * 4);
  const moteG = new T.BufferGeometry(); moteG.setAttribute('position', new T.BufferAttribute(mp, 3));
  const motes = new T.Points(moteG, new T.PointsMaterial({ size: 0.06, map: TEX.glow, color: new T.Color(1.0, 0.78, 0.5), transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false })); motes.frustumCulled = false; g.add(motes);
  const glow = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: new T.Color(1.0, 0.6, 0.3), transparent: true, opacity: 0.5, depthWrite: false, fog: false, blending: T.AdditiveBlending })); glow.scale.setScalar(330); g.add(glow);
  // t: time; u: how far the day has gone (level.setDawn); sx, sy, sz: where the sun stands from the yard
  const update = (t, u, sx, sy, sz) => {
    for (let i = 0; i < NM; i++) { const ph = mb[i * 4 + 3]; mp[i * 3] = mb[i * 4] + Math.sin(t * 0.11 + ph) * 0.6; mp[i * 3 + 1] = mb[i * 4 + 1] + Math.sin(t * 0.08 + ph * 1.7) * 0.4; mp[i * 3 + 2] = mb[i * 4 + 2] + Math.cos(t * 0.1 + ph * 2.3) * 0.6; } moteG.attributes.position.needsUpdate = true;
    const k = u * u, fl = 0.9 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.04; mLamp.color.setRGB(0.3 + 0.95 * k, 0.2 + 0.55 * k, 0.1 + 0.2 * k); lamps.forEach((l) => { l.intensity = 6 * k * fl; });
    const l = Math.hypot(sx, sy, sz) || 1, low = Math.max(0, 1 - sy / l / 0.6); glow.position.set(sx / l * 420, sy / l * 420, sz / l * 420); glow.material.opacity = 0.6 * low;
  };
  update(0, 0, -6, 15, 40);

  // ---- the country round about: mesas and buttes of banded rock standing out of the dunes, a scree
  // slope at each foot, and a tilted one (a cuesta) to the north. The road bends behind the nearest.
  { const mq = rng(733), C = (a, b) => a + mq() * (b - a);
    const strata = canvasTex(256, (c, n) => {
      speck(c, n, [198, 140, 94], 14, mq);
      for (let y = 0; y < n;) { const h = 5 + mq() * 24; c.fillStyle = ['rgba(150,84,52,.55)', 'rgba(228,184,132,.5)', 'rgba(122,72,50,.45)', 'rgba(214,150,96,.4)', 'rgba(240,210,164,.4)'][(mq() * 5) | 0]; c.fillRect(0, y, n, h); c.fillStyle = 'rgba(62,36,26,.3)'; c.fillRect(0, y + h - 1.5, n, 1.5); y += h; } // beds of different rock, a shadow under each
      for (let k = 0; k < 30; k++) { let x = mq() * n, y = mq() * n; c.strokeStyle = `rgba(66,38,28,${0.2 + mq() * 0.25})`; c.lineWidth = 0.8 + mq() * 1.6; c.beginPath(); c.moveTo(x, y); for (let m = 0; m < 5; m++) { x += (mq() - 0.5) * 7; y += 8 + mq() * 22; c.lineTo(x, y); } c.stroke(); } // joints down the face
      for (let k = 0; k < 14; k++) { const x = mq() * n, w = 8 + mq() * 26, gr = c.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(50,28,22,0)'); gr.addColorStop(0.5, 'rgba(50,28,22,.16)'); gr.addColorStop(1, 'rgba(50,28,22,0)'); c.fillStyle = gr; c.fillRect(x, 0, w, n); }
    });
    const mMesa = toon(0xffffff, { map: strata, vertexColors: true });
    const PROF = [[0, 1.55, 0], [0.1, 1.4, 0], [0.22, 1.22, 0], [0.31, 1.08, 0.5], [0.35, 1.01, 1], [0.58, 1.0, 1], [0.61, 0.95, 1], [0.92, 0.93, 1], [0.97, 0.87, 1], [1, 0.8, 1]]; // [height, radius, 1 on the cliff / 0 on the scree]
    const mesa = (x, z, r, h, o = {}) => {
      const N = 44, ph = [C(0, 6), C(0, 6), C(0, 6), C(0, 6)], sx = o.sx || 1, tilt = o.tilt || 0, ta = o.ta || 0, pos = [], col = [], uv = [], idx = [], rows = PROF.length, ur = Math.max(2, Math.round((r * sx) / 6));
      const out = (a, k) => 1 + 0.2 * Math.sin(2 * a + ph[0]) + 0.12 * Math.sin(3 * a + ph[1]) + 0.06 * Math.sin(5 * a + ph[2]) + k * (0.035 * Math.sin(13 * a + ph[3]) + 0.02 * Math.sin(23 * a + ph[0])); // an uneven outline, and buttresses on the cliff
      PROF.forEach(([t, rf, k], j) => { for (let i = 0; i <= N; i++) { const a = (i / N) * PI * 2, R = r * rf * out(a, k), y = t * h * (1 + (t > 0.3 ? tilt * Math.cos(a - ta) * rf : 0)) - 3;
        pos.push(Math.sin(a) * R * sx, y, Math.cos(a) * R); uv.push((i / N) * ur, y / 13); const s = 1 - k; col.push(1 + s * 0.08, 1 - s * 0.04, 1 - s * 0.2); // the scree is paler and sandier
        if (j < rows - 1 && i < N) { const p = j * (N + 1) + i; idx.push(p, p + 1, p + N + 1, p + 1, p + N + 2, p + N + 1); } } });
      const top = pos.length / 3, last = (rows - 1) * (N + 1); pos.push(0, h - 3, 0); uv.push(0.5, 0.5); col.push(1.1, 1.02, 0.86); for (let i = 0; i < N; i++) idx.push(top, last + i, last + i + 1);
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const nr = geo.attributes.normal; for (let j = 0; j < rows; j++) { const p = j * (N + 1), q2 = p + N, nx = nr.getX(p) + nr.getX(q2), ny = nr.getY(p) + nr.getY(q2), nz = nr.getZ(p) + nr.getZ(q2), l = Math.hypot(nx, ny, nz) || 1; nr.setXYZ(p, nx / l, ny / l, nz / l); nr.setXYZ(q2, nx / l, ny / l, nz / l); } // close the seam
      const m = add(geo, mMesa, x, 0, z, o.ry); m.castShadow = m.receiveShadow = false; return m;
    };
    mesaFn = mesa;
    mesa(44, 56, 11, 17, { sx: 1.2, ry: 0.4 }); // the one the road goes behind
    mesa(-17, 60, 6.5, 21, { sx: 0.85, ry: 1.1 }); // a butte close on the west of the road: it stands in the gate's arch from inside the yard
    mesa(-36, 70, 9, 24, { sx: 0.9 }); mesa(-52, 60, 6, 15); // two buttes to the north-west
    mesa(-40, 112, 16, 20, { sx: 1.6, ry: 0.2, tilt: 0.28, ta: PI }); // a cuesta, far up the road's old line
    mesa(84, 44, 13, 21, { sx: 1.3, ry: -0.5 }); mesa(-74, 8, 14, 16, { sx: 1.4, ry: 1.4, tilt: 0.25, ta: 1.2 });
    mesa(62, -48, 13, 19, { sx: 1.3 }); mesa(-48, -64, 16, 22, { sx: 1.5, ry: 0.6 }); mesa(10, -84, 13, 15, { sx: 1.8, tilt: 0.2, ta: 0.5 }); }

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
  const into = (grp, fn) => { dest = grp; try { fn(); } finally { dest = null; } };
  return { group: g, muster, obs, obsMuster, banners, update, kit: { palm, mesa: mesaFn, into } };
}
