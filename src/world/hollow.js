import * as T from 'three';
import { G } from '../core/game.js';
import { PI, clamp, lerp, rng } from '../core/util.js';
import { toon } from '../gfx/materials.js';
import { FX } from '../gfx/fx.js';
import { DECAL, decals } from '../gfx/decals.js';
import { openArea, openSheet, rockSet } from './front.js';
import { bakeFigure } from '../actors/rig.js';
import { PZ, P } from '../actors/anim.js';
import { LOOKS } from '../actors/data.js';

// The hollow (Act I, "the tracks north"): a seventh site, two days into the deep desert, where the lost caravan's tracks end.
// Coordinates are local: x east, z north, from HOLLOW. Open country, built as the frontier and the wash are (front.js).
//   south   the tracks wind up through the dunes: west along a valley, north round the shoulder of a big dune, then
//           north-east and up a saddle in a crest, where the first of the drivers stands
//   north   a bowl in the dunes. The drivers are in it, in the line they walked in, more of them glass the further in;
//           the last kneel in a half ring before a door of glass that stands in the sand with no wall round it.
// (Owner, 24 Nov 2026: the track used to run straight at the door, which was in sight from the first step. It is now about
// half as long again and bends twice, and the dunes on the inside of each bend hide the door until he is climbing the crest.)
export const HOLLOW = { x: 300, z: 200 };
export const HDOOR = [0, 6.5]; // the door (local); it faces south, up the line of the drivers
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));
// The way in, from where they come over the dunes to the top of the crest (rounded off at its corners), and on into the hollow.
const chaikin = (l, n) => { for (let k = 0; k < n; k++) { const o = [l[0]]; for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(l.at(-1)); l = o; } return l; };
const lineLen = (l) => l.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0);
const alongL = (l, s) => { for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s <= d || i === l.length - 1) return [lerp(a[0], b[0], s / d), lerp(a[1], b[1], s / d)]; s -= d; } return l[0]; };
const TRACK = chaikin([[11, -89], [4, -86], [-6, -84], [-14, -77], [-17, -67], [-15, -57], [-10, -48], [-4, -41], [0.5, -36]], 2), TLEN = lineLen(TRACK);
const WAY = [...TRACK, [0.3, -29], [0, -21], [0, -13], [0, -6]], WLEN = lineLen(WAY); // and on down the line of the drivers to the door
// A point on the way in, `s` metres from its start (the track's first 7.5 m lie behind where they set out), and the way it runs there.
export const onTrack = (s) => { const [x, z] = alongL(WAY, s), [x2, z2] = alongL(WAY, s + 1); return [x, z, Math.atan2(x2 - x, z2 - z)]; };
const DISCS = [];
for (let s = 0; s <= TLEN - 2; s += 5) DISCS.push([...alongL(TRACK, s), s > TLEN - 14 ? 5 : 6.5]); // the track, narrowing to the saddle
DISCS.push([0.5, -36, 5.5], [0.3, -29, 6.5], [0, -21, 8], [0, -13, 12], [0, 1, 17]); // the saddle, down the line of the drivers, and the hollow
const SHOULDERS = [[-2, -70, 7, 7], [-11, -35, 5.5, 6]]; // the big dunes on the inside of the two bends, which hide the hollow: [x, z, spread, height]
const OPEN = openArea(DISCS, HOLLOW), outside = OPEN.outside;
export const HAREA = OPEN.area, hollowRoute = OPEN.route;
// The drivers: [x, z, facing, pose, look, how high the glass has climbed (m; 9 = all of him), scale]
const STRIDE = P({ thL: [-0.5], knL: [0.25], thR: [0.35], knR: [0.5], shL: [0.35, 0, 0.08], elL: [-0.3], shR: [-0.4, 0, -0.08], elR: [-0.45], spine: [0.08], neck: [0.1] });
const BACK = P({ chest: [0, 0.5, 0], neck: [-0.05, 0.75, 0], shL: [-1.2, 0, 0.5], elL: [-0.35] }, STRIDE); // turned to look behind him, one arm out toward the way home
const WARD = P({ shL: [-2.0, 0, -0.5], elL: [-1.5], shR: [-1.6, 0, 0.4], elR: [-1.7], neck: [0.35], spine: [0.2], thL: [-0.15], thR: [0.1] }); // both arms up before the face
const STAND = P({ neck: [0.3], spine: [0.1], shL: [0.05, 0, 0.1], shR: [0.05, 0, -0.1] }); // stopped, head down
const UPTURN = P({ neck: [-0.55], spine: [-0.08], shL: [0.1, 0, 0.25], shR: [0.1, 0, -0.25] }, PZ.kneel); // on his knees, the face lifted to the door
const BOW = P({ neck: [0.5], spine: [0.3] }, PZ.kneel);
const DRIVERS = [
  [1.3, -33.0, -2.56, BACK, 'drover', 1.15, 1.0], // on the crest, the first they come to: he had turned round, and looks back down the way they came
  [-1.6, -22.5, 0.1, STRIDE, 'carter', 0.55, 0.97], [0.9, -18.0, -0.1, STRIDE, 'labourer', 0.95, 1.02], [-0.8, -13.6, 0.05, WARD, 'drover', 1.25, 0.95],
  [1.8, -10.0, -0.2, STRIDE, 'carter', 9, 1.0], [-2.1, -7.4, 0.15, STAND, 'drover', 9, 1.03], [0.4, -5.2, 0, STRIDE, 'labourer', 9, 0.96],
  [-3.6, 2.6, 0.75, UPTURN, 'carter', 9, 1.0], [-1.9, 1.2, 0.4, BOW, 'drover', 9, 0.98], [1.9, 1.2, -0.4, UPTURN, 'labourer', 9, 1.02], [3.6, 2.6, -0.75, BOW, 'drover', 9, 0.97],
  [5.8, -3.4, 2.2, PZ.crawl || PZ.prone, 'carter', 9, 1.0], // one who broke and went to the ground crawling away
];
export const DRIVERS_AT = DRIVERS.map((d) => [d[0], d[1]]);

function land(x, z) {
  let h = 0.3 * Math.sin(x * 0.11 + 0.9) * Math.cos(z * 0.09 - 0.3) + 0.12 * Math.sin(x * 0.31 + z * 0.21 + 1.1) + 0.05 * Math.sin(x * 0.7 - z * 0.55);
  h += 2.6 * Math.exp(-(((z + 36) / 8.5) ** 2)); // the crest the tracks go over (high enough that the hollow can't be seen over it from below)
  h -= 3.1 * (1 - sm(5, 20, Math.hypot(x, z - 1))); // the hollow
  const o = outside(x, z), s = 0.5 + 0.5 * Math.sin(x * 0.07 + 1.4) * Math.cos(z * 0.06 + 0.2), open = 1 - 0.75 * gauss(x, z, 17, -99, 12); // (lower behind where they come in: they came over open sand)
  h += sm(-1.5, 8, o) * (1.4 + 4.6 * s) * open; // the edge of the walkable ground: dune faces
  h += sm(8, 45, o) * (3.2 * Math.sin(x * 0.045 + z * 0.02) + 2.4 * Math.sin(z * 0.06 - x * 0.03 + 1.7) + 1.0 * Math.sin(x * 0.13) + 2.0); // and the deep dunes beyond
  for (const [cx, cz, r, H] of SHOULDERS) h += H * gauss(x, z, cx, cz, r) * sm(0.5, 6, o); // the two the track winds round
  return h;
}

// Glass, as a figure is made of it: pale, hard-lit, a little of its own light.
const mGlassFig = () => toon(0x8fe0d2, { shine: 0.95, emissive: 0x1c6a60, emissiveIntensity: 0.55 });
// A posed figure, glass up to `lvl` metres and himself above it (the triangles of each mesh are dealt to one side or the other).
function glassFigure(look, pose, scale, lvl, mGl) {
  const fig = bakeFigure({ ...look, shield: undefined, weapon: 'none' }, pose, scale), add = [];
  for (const m of fig.children) {
    if (lvl >= 8) { m.material = mGl; continue; }
    const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, lo = [[], [], []], hi = [[], [], []];
    for (let i = 0; i < p.count; i += 3) { const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, edge = lvl + 0.07 * Math.sin(p.getX(i) * 31) * Math.cos(p.getZ(i) * 27), t = y < edge ? lo : hi; // (a ragged edge: it climbs unevenly)
      for (let k = i; k < i + 3; k++) { t[0].push(p.getX(k), p.getY(k), p.getZ(k)); t[1].push(n.getX(k), n.getY(k), n.getZ(k)); t[2].push(uv.getX(k), uv.getY(k)); } }
    const mk = (t) => { const b = new T.BufferGeometry(); b.setAttribute('position', new T.Float32BufferAttribute(t[0], 3)); b.setAttribute('normal', new T.Float32BufferAttribute(t[1], 3)); b.setAttribute('uv', new T.Float32BufferAttribute(t[2], 2)); return b; };
    m.geometry = mk(hi); if (lo[0].length) { const gm = new T.Mesh(mk(lo), mGl); gm.castShadow = gm.receiveShadow = true; add.push(gm); }
  }
  for (const m of add) fig.add(m); for (const m of fig.children) m.castShadow = true;
  return fig;
}
// Someone turned wholly to glass in the pose he died in (the stage sets one where the sergeant knelt).
export const glassMan = (look, pose, scale) => glassFigure(look, pose, scale, 9, mGlassFig());

export function buildHollow(scene, kit) {
  const g = new T.Group(); g.position.set(HOLLOW.x, 0, HOLLOW.z); scene.add(g);
  const q = rng(9191), Q = (a, b) => a + q() * (b - a), obs = [];
  const block = (x, z, r) => obs.push({ x: HOLLOW.x + x, z: HOLLOW.z + z, r });
  const [dx, dz] = HDOOR;

  // ---- the ground: deep-desert sand, paler than the wash's; in the bottom of the hollow it has run to glass
  const SAND = new T.Color(0xfff0d4), PALE = new T.Color(0xfff6e4), SHADE = new T.Color(0xe2c49a), FUSED = new T.Color(0x1f4448), SCORCH = new T.Color(0x6e6052), c2 = new T.Color();
  const hl = openSheet(g, land, (x, z, sl, c) => {
    const e = outside(x, z), blot = 0.5 + 0.5 * Math.sin(x * 0.23 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.29 - Math.sin(x * 0.13) * 2), r = Math.hypot(x - dx, z - dz + 3.5);
    c.copy(SAND).lerp(PALE, 0.6 * blot).lerp(SHADE, clamp(sl * 1.3, 0, 0.6));
    c.lerp(SCORCH, 0.75 * (1 - sm(4.5, 9.5, r + 1.2 * Math.sin(Math.atan2(x, z) * 5)))); // scorched round the pan
    c.lerp(c2.copy(FUSED).multiplyScalar(0.8 + 0.4 * blot), 0.92 * (1 - sm(3.2, 5.4, r + 0.7 * Math.sin(Math.atan2(x - dx, z - dz) * 7)))); // the pan itself
  }, { c: [-4, -38], n: 210 }); // (the fine middle of the grid moved south, between the hollow and where the track comes in)
  const height = (wx, wz) => hl(wx - HOLLOW.x, wz - HOLLOW.z);

  // ---- rock: little of it out here. A few half-buried in the dune faces, two to fight round in the hollow.
  const rock = rockSet(g, hl, q, block);
  for (let i = 0; i < 70; i++) { const a = Q(0, 6.3), d = Q(14, 95), x = Math.sin(a) * d, z = Math.cos(a) * d - 20; if (outside(x, z) > 3) rock(x, z, Q(0.5, 2.6), { sy: Q(0.45, 0.9), bed: true, shade: false }); } // (up on the dunes: no shadow, or a low sun throws it through the sand onto the track)
  for (const [x, z, r] of [[-9.5, -6.5, 1.0], [9.2, 4.5, 0.9], [-12.6, -63, 0.9]]) rock(x, z, r, { solid: true });
  rock.done();
  kit.into(g, () => { kit.mesa(-70, 60, 12, 17, { sx: 1.4, ry: 0.7 }); kit.mesa(64, 84, 15, 22, { sx: 1.3, ry: 2.0, tilt: 0.2, ta: 1 }); kit.mesa(52, -70, 11, 13, { sx: 1.6, ry: 0.3 }); });

  // ---- the drivers
  const mGl = mGlassFig(), figs = new T.Group(); g.add(figs);
  for (const [x, z, f, pose, look, lvl, sc] of DRIVERS) {
    const fig = glassFigure(LOOKS[look], pose, sc, lvl, mGl); fig.position.set(x, hl(x, z), z); fig.rotation.y = f; figs.add(fig); block(x, z, 0.5);
  }
  // glass out of the sand: at each one's feet, round the pan, and thick behind the door (kit.shard works in world coordinates)
  const wx = (x) => HOLLOW.x + x, wz = (z) => HOLLOW.z + z;
  for (const [x, z, , , , lvl] of DRIVERS) for (let k = 0, n = lvl >= 8 ? 4 : 2; k < n; k++) { const a = Q(0, 6.3), d = Q(0.35, 0.8), sx = x + Math.sin(a) * d, sz = z + Math.cos(a) * d; kit.shard(wx(sx), hl(sx, sz) - 0.03, wz(sz), Q(0.18, lvl >= 8 ? 0.6 : 0.34), Q(-0.4, 0.4), Q(-0.4, 0.4)); }
  for (let k = 0; k < 26; k++) { const a = Q(0, 6.3), d = Q(4.4, 7.2), x = dx + Math.sin(a) * d, z = dz - 3.5 + Math.cos(a) * d; if (Math.abs(x) < 2.2 && z < dz - 3) continue; /* (the way up to the door is clear) */ kit.cluster(wx(x), hl(x, z) - 0.04, wz(z), Q(0.3, 0.95), Q(-0.3, 0.3)); }
  for (let k = 0; k < 9; k++) { const x = dx + Q(-3.4, 3.4), z = dz + Q(1.0, 3.2); kit.cluster(wx(x), hl(x, z) - 0.05, wz(z), Q(0.7, 1.9), Q(-0.25, 0.25)); }
  for (const [x, z, r] of [[dx - 2.6, dz + 2.0, 1.2], [dx + 2.6, dz + 2.0, 1.2], [dx, dz + 2.4, 1.3]]) block(x, z, r);

  // ---- the door: two leaning jambs of glass that meet in a point, a sill, and between them a pane of nothing much, lit from
  // the other side. No wall. Its pieces are one group, so the stage can take it down.
  const door = new T.Group(), y0 = hl(dx, dz); scene.add(door);
  const sh = (x, y, z, h, tilt, rz, ry) => { const m = kit.shard(wx(x), y, wz(z), h, tilt, rz, ry); door.add(m); return m; };
  for (const s of [-1, 1]) {
    sh(dx + s * 1.25, y0 - 0.1, dz, 3.3, 0, s * 0.3, 0.3); sh(dx + s * 1.45, y0 - 0.1, dz + 0.12, 2.3, 0.08, s * 0.14, 1.1); sh(dx + s * 1.1, y0 - 0.1, dz - 0.1, 1.5, -0.1, s * 0.5, 2.0);
    sh(dx + s * 1.7, y0 - 0.1, dz - 0.05, 1.1, 0.2, -s * 0.3, 0.6); sh(dx + s * 0.46, y0 + 3.02, dz, 1.0, 0, s * 0.95, 0.3);
  }
  sh(dx, y0 + 3.45, dz, 0.95, 0, 0, 0.5);
  const pane = new T.Mesh(new T.ShapeGeometry(new T.Shape([[-1.12, 0], [1.12, 0], [0.5, 2.95], [0, 3.65], [-0.5, 2.95]].map(([a, b]) => new T.Vector2(a, b)))), new T.MeshBasicMaterial({ color: new T.Color(0.5, 1.5, 1.35), transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false, fog: false }));
  pane.position.set(wx(dx), y0, wz(dz)); door.add(pane);
  const lead = new T.MeshBasicMaterial({ color: new T.Color(0.75, 1.9, 1.7), fog: false }); // the leading, as on the Door: a thin bright line down the middle and one across
  for (const [w, h, x, y] of [[0.035, 3.6, 0, 1.8], [1.9, 0.035, 0, 1.45], [1.25, 0.035, 0, 2.6]]) { const m = new T.Mesh(new T.BoxGeometry(w, h, 0.02), lead); m.position.set(wx(dx + x), y0 + y, wz(dz)); door.add(m); }
  const light = new T.PointLight(0x7fe6d6, 9, 12, 1.6); light.position.set(wx(dx), y0 + 1.7, wz(dz - 0.9)); door.add(light);
  for (const s of [-1, 1]) block(dx + s * 1.35, dz, 0.55);

  // ---- the tracks in, and glass grit trodden about the pan
  { const pr = decals(DECAL.prints, 0x6a543c, 0.9, hl), drag = decals(DECAL.soft, 0xa8946e, 0.3, hl); // four abreast, down every bend of the way in
    for (let s = 0, n = 0; s < WLEN; s += 1.7, n++) { const [x0, z0, f] = onTrack(s), w = 0.6 * Math.sin(s * 0.11), px = Math.cos(f), pz = -Math.sin(f);
      for (let k = 0; k < 4; k++) { const o = w + (k - 1.5) * 0.8 + Q(-0.25, 0.25), a = Q(-0.3, 0.3); pr.at(x0 + px * o + Math.sin(f) * a, z0 + pz * o + Math.cos(f) * a, 0.9, 3.4, f + PI + Q(-0.12, 0.12), 0.04 + k * 0.004); }
      if (n % 2 === 0) { const o = w + Q(-0.5, 0.5); drag.at(x0 + px * o, z0 + pz * o, Q(1.8, 2.6), 3.4, f + PI, 0.03); } }
    pr.done(g); drag.done(g); }
  { const n = 240, im = new T.InstancedMesh(new T.OctahedronGeometry(1, 0), new T.MeshBasicMaterial({ color: new T.Color(0.42, 1.0, 0.9) }), n), M4 = new T.Matrix4(), pv = new T.Vector3(), sv = new T.Vector3(), qt = new T.Quaternion(), eu = new T.Euler();
    for (let i = 0; i < n; i++) { const a = Q(0, 6.3), d = Q(0, 1) ** 0.7 * 9, x = dx + Math.sin(a) * d, z = dz - 3.5 + Math.cos(a) * d, s = Q(0.02, 0.07); pv.set(x, hl(x, z) + s * 0.4, z); qt.setFromEuler(eu.set(Q(0, 3), Q(0, 3), Q(0, 3))); sv.set(s, s * Q(0.4, 1.6), s); im.setMatrixAt(i, M4.compose(pv, qt, sv)); }
    g.add(im); }

  // sand on the wind; motes rising off the pan toward the door
  const tmp = new T.Vector3();
  const update = (t, dt) => {
    const p = G.player.pos; if (Math.random() < dt * 9) FX.dust.emit(tmp.set(p.x + (Math.random() - 0.5) * 30, 0, p.z + (Math.random() - 0.5) * 30).setY(height(tmp.x, tmp.z) + 0.1 + Math.random() * 0.5), 1, 0.3, 0xe6d2aa, 2.4, { grav: -0.05, vx: -2.2, vz: 1.2, spread: 0.2, flat: 1 });
    if (door.visible) { pane.material.opacity = 0.26 + 0.08 * Math.sin(t * 1.7) + 0.04 * Math.sin(t * 4.3); light.intensity = 9 + 3 * Math.sin(t * 1.7);
      if (Math.random() < dt * 6) { const a = Math.random() * 6.3, d = 1 + Math.random() * 4; FX.sparks.emit(tmp.set(wx(dx) + Math.sin(a) * d, 0, wz(dz - 3.5) + Math.cos(a) * d).setY(height(tmp.x, tmp.z) + 0.1), 1, 0.3, 0x9ff0e0, 1.6, { grav: -1.2, spread: 0.1, up: 0.5 }); } }
  };
  const temp = new T.Group(); scene.add(temp); // what a stage stands in the hollow for one telling of it (cleared when the site is next set)
  return { group: g, obs, height, update, door, temp, reset: () => { door.visible = true; temp.clear(); } };
}
