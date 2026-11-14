import * as T from 'three';
import { G } from '../core/game.js';
import { PI, clamp, lerp, rng } from '../core/util.js';
import { toon, TEX, canvasTex, speck } from '../gfx/materials.js';
import { FX } from '../gfx/fx.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWaystation } from './waystation.js';
import { buildHalls, HALLS, GALLERY, ROTUNDA, DESCENT, PASS_E, PASS_W } from './halls.js';

// Layout (north = +z). A walled camp in front of a cliff. Raiders come through the
// breach in the north wall and a gap in the east wall. South, a slot canyon
// ("the Narrows") runs through the rock to the sanctum gate.
export const COURT = { x0: -17, x1: 17, z0: -10, z1: 22 };
export const NARROWS = { x0: -2.8, x1: 2.8, z0: -27, z1: -9 };
export const BREACH = { x0: -3.6, x1: 3.6, z0: 21, z1: 40 };
export const EAST = { x0: 16, x1: 28, z0: -4.8, z1: -1.2 };
export const MOUTH = { x: 0, z: -8.6 };
export const RING = { x: 0, z: 6, r: 4.2 };
const FIRE = 16;
// A second place, built far enough off that neither can be seen from the other: the waystation
// on the caravan road (world/waystation.js). Its yard, and the road outside its gate where
// raiders come in. A site is its walkable rectangles, its obstacles and where the sun is aimed;
// `level.setSite` switches between them.
export const WAY = { x: 0, z: 120 };
export const YARD = { x0: WAY.x - 15, x1: WAY.x + 15, z0: WAY.z - 12, z1: WAY.z + 12 };
export const WSIDE = { x0: WAY.x - 14, x1: WAY.x + 14, z0: WAY.z + 14.3, z1: WAY.z + 21 }; // along the outside of the north wall: raiders come round to the gate from here, out of sight of the yard
export const WROAD = { x0: WAY.x - 3, x1: WAY.x + 3, z0: WAY.z + 10, z1: WAY.z + 34 };
const SITES = { ruins: { at: [0, 0], player: [COURT, NARROWS], all: [COURT, NARROWS, BREACH, EAST], obs: [], sky: ['night', 'dawn'] }, way: { at: [WAY.x, WAY.z], player: [YARD], all: [YARD, WROAD, WSIDE], obs: [], sky: ['day', 'dusk'] },
  halls: { at: [HALLS.x, HALLS.z - 29], player: [GALLERY, ROTUNDA, DESCENT], all: [GALLERY, ROTUNDA, DESCENT, PASS_E, PASS_W], obs: [], sky: ['night', 'night'], indoor: true } }; // the halls above the vault (world/halls.js): under a roof, with their own light
let PLAYER_AREA = SITES.ruins.player, ALL_AREA = SITES.ruins.all;
export const OBSTACLES = []; // the current site's

// Keep a circle inside the walkable rectangles, then out of round obstacles.
export function confine(p, r, isPlayer) {
  const rects = isPlayer ? PLAYER_AREA : ALL_AREA; let inside = false, bd = 1e9, bx = p.x, bz = p.z;
  for (const R of rects) {
    if (p.x >= R.x0 + r && p.x <= R.x1 - r && p.z >= R.z0 + r && p.z <= R.z1 - r) { inside = true; break; }
    const cx = clamp(p.x, R.x0 + r, R.x1 - r), cz = clamp(p.z, R.z0 + r, R.z1 - r), d = (p.x - cx) ** 2 + (p.z - cz) ** 2;
    if (d < bd) { bd = d; bx = cx; bz = cz; }
  }
  if (!inside) { p.x = bx; p.z = bz; }
  for (const o of OBSTACLES) {
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + r;
    if (d < m && d > 1e-4) { p.x = o.x + (dx / d) * m; p.z = o.z + (dz / d) * m; }
  }
}
// Heading that takes a walker round the nearest crate, tent or column lying on the way to
// its goal (`ang`, `reach` metres off). Without this, anything walking straight at an
// obstacle is pushed straight back out by confine() and stays there.
export function steer(p, r, ang, reach) {
  const fx = Math.sin(ang), fz = Math.cos(ang); let best = null, bd = Math.min(reach, 5);
  for (const o of OBSTACLES) {
    const dx = o.x - p.x, dz = o.z - p.z, along = dx * fx + dz * fz, m = o.r + r + 0.25; if (along <= 0 || along - m > bd) continue;
    const side = dx * fz - dz * fx; if (Math.abs(side) >= m) continue;
    bd = along - m; best = { d: Math.hypot(dx, dz), a: Math.atan2(dx, dz), m, side };
  }
  if (!best) return ang;
  // aim at the tangent on the side the walker is already leaning to
  return best.a + (best.side > 0 ? -1 : 1) * Math.asin(Math.min(1, best.m / Math.max(best.d, best.m))) * 1.15;
}
// Where a walker outside the waystation's wall must head to reach someone inside it: the gate.
// (Walking straight at them would only press it against the wall.) Null when the way is clear.
export function route(p, t) {
  const s = G.level && G.level.site;
  if (s === 'way') return p.z < WAY.z + 12.6 || t.z > WAY.z + 12.6 ? null : [WAY.x, WAY.z + (Math.abs(p.x - WAY.x) > 2.3 ? 16.6 : 10.5)];
  if (s !== 'halls') return null;
  // the halls: out of a side passage by its middle, and through the arches to the gallery and the descent by theirs, not along the wall beside them
  const x = p.x - HALLS.x, z = p.z - HALLS.z, tz = t.z - HALLS.z;
  if (Math.abs(x) > 7.2 && z < -30) return [HALLS.x + Math.sign(x) * 5.6, HALLS.z - 38];
  if (z < -30.6 && z > -45.4) { if (tz > -29.5 && Math.abs(x) > 2.4) return [HALLS.x, HALLS.z - 31.2]; if (tz < -46.5 && Math.abs(x) > 1.5) return [HALLS.x, HALLS.z - 44.8]; }
  return null;
}
const inAny = (x, z, m) => ALL_AREA.some((R) => x >= R.x0 + m && x <= R.x1 - m && z >= R.z0 + m && z <= R.z1 - m);
// Pull the camera toward its target until it is no longer inside a wall.
export function clampCamera(p, look) {
  if (G.level && G.level.doorMode && p.z > -11.7) p.z = -11.7; // the vault's far wall stands inside the Narrows' walkable strip
  if (inAny(p.x, p.z, 0.35)) return;
  for (let k = 1; k <= 12; k++) {
    const u = 1 - k / 12, x = lerp(look.x, p.x, u), z = lerp(look.z, p.z, u);
    if (inAny(x, z, 0.35)) { p.x = x; p.z = z; p.y = lerp(look.y, p.y, 0.45 + 0.55 * u) + (1 - u) * 1.2; return; }
  }
}

// Skies. A site has a pair, and `setDawn(u)` runs from the first to the second: the ruins from night
// to dawn; the waystation from a hot late afternoon to dusk, or a clear morning for the muster.
const NIGHT = { zen: 0x04060f, hor: 0x1d2a55, fog: 0x121a36, hemiS: 0x5f7fe0, hemiG: 0x1c1a26, hemiI: 0.95, sun: 0x9fb6ff, sunI: 1.7, sunP: [-22, 34, 26], warm: 0, stars: 1, moon: 1, fire: 1, fogF: 150 };
const DAWN = { zen: 0x35528e, hor: 0xf2a56c, fog: 0xc9907a, hemiS: 0xffd8b8, hemiG: 0x7a5038, hemiI: 1.7, sun: 0xffb27a, sunI: 3.2, sunP: [40, 14, 24], warm: 1, stars: 0, moon: 0.15, fire: 0.3, fogF: 150 };
const DAY = { zen: 0x3a6fb4, hor: 0xd9c9a4, fog: 0xd6c19c, hemiS: 0xfff1da, hemiG: 0x8f6f4c, hemiI: 1.55, sun: 0xffe2b0, sunI: 3.1, sunP: [-34, 30, 12], warm: 0.2, stars: 0, moon: 0, fire: 0.3, fogF: 105 };
const DUSK = { zen: 0x2c3f7a, hor: 0xe9925e, fog: 0xc4927a, hemiS: 0xd9b8b4, hemiG: 0x6a4c40, hemiI: 1.35, sun: 0xffb486, sunI: 2.5, sunP: [-42, 12, 16], warm: 0.55, stars: 0, moon: 0, fire: 0.6, fogF: 105 };
const MORN = { zen: 0x4f86c8, hor: 0xf1dcc0, fog: 0xdcccb4, hemiS: 0xf4f0ea, hemiG: 0x8a7458, hemiI: 1.5, sun: 0xfff0dc, sunI: 3.1, sunP: [36, 22, -14], warm: 0.25, stars: 0, moon: 0, fire: 0.3, fogF: 105 };
const SKIES = { night: NIGHT, dawn: DAWN, day: DAY, dusk: DUSK, morning: MORN };

export function buildLevel() {
  const scene = G.scene, r = rng(1234), R = (a, b) => a + r() * (b - a);
  const dr = rng(99), D = (a, b) => a + dr() * (b - a); // dressing only: keeps the layout's own sequence unchanged
  const W = { flames: [], fires: [], banners: [], dawn: 0 };
  const mBlock = toon(0xffffff, { map: TEX.block }), mRock = toon(0xffffff, { map: TEX.rock }), mStone = toon(0xb09a78), mDark = toon(0x4a3c30);
  const mWood = toon(0x5c4028), mCloth = toon(0x9c2428, { side: T.DoubleSide }), mGold = toon(0xd9b24a), mTent = toon(0xffffff, { map: TEX.canvas, side: T.DoubleSide });
  const mCrate = toon(0xffffff, { map: TEX.crate }), mBarrel = toon(0xffffff, { map: TEX.barrel }), mCol = toon(0xffffff, { map: TEX.flute });
  const mRope = toon(0x8a7650), mSack = toon(0xa89674), mSteel = toon(0x9aa0aa), mStraw = toon(0x9a8a58), mInside = new T.MeshBasicMaterial({ color: 0x0c0a09 });
  const mBanner = toon(0xffffff, { map: TEX.banner, side: T.DoubleSide, alphaTest: 0.5 });
  const V = (x, y, z) => new T.Vector3(x, y, z), UP = V(0, 1, 0);
  // The dunes start past the walls, except along the raiders' road north of the breach, which stays level.
  const dune = (x, z) => { const road = 1 - clamp((Math.abs(x) - 5.5) / 6, 0, 1), dx = Math.max(-22 - x, 0, x - 30), dz = Math.max(-30 - z, 0, z - lerp(26, 44, road * road * (3 - 2 * road))), d = Math.min(Math.hypot(dx, dz), Math.hypot(Math.max(WAY.x - 24 - x, 0, x - WAY.x - 24), Math.max(WAY.z - 21 - z, 0, z - WAY.z - 37))); return Math.min(1, d / 14) * (Math.sin(x * 0.045 + z * 0.02) * 3 + Math.sin(z * 0.06 - x * 0.03) * 2.2 + Math.sin(x * 0.13) * 0.8) - (d > 0 ? 0.2 : 0); };
  const add = (geo, mat, x, y, z, ry) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, ry) => add(new T.BoxGeometry(w, h, d), mat, x, y, z, ry);

  // ground: flat where you can walk, dunes beyond
  const gg = new T.PlaneGeometry(520, 520, 120, 120); gg.rotateX(-PI / 2); const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    gp.setY(i, dune(gp.getX(i), gp.getZ(i)));
  }
  gg.computeVertexNormals();
  const ground = new T.Mesh(gg, toon(0xffffff, { map: TEX.sand })); ground.receiveShadow = true; scene.add(ground);
  const fl = new T.Mesh(new T.PlaneGeometry(34, 32), toon(0xffffff, { map: TEX.flags })); fl.rotation.x = -PI / 2; fl.position.set(0, 0.02, 6); fl.receiveShadow = true; scene.add(fl);
  const ring = new T.Mesh(new T.RingGeometry(RING.r - 0.16, RING.r, 48), toon(0x7a2a26)); ring.rotation.x = -PI / 2; ring.position.set(RING.x, 0.035, RING.z); ring.receiveShadow = true; scene.add(ring);

  // ruined walls: uneven blocks so the top edge reads as broken
  const wallRun = (x0, z0, x1, z1, h, t = 1.5) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.7)), ry = Math.atan2(x1 - x0, z1 - z0) + PI / 2;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, hh = h + R(-1.3, 0.7) - (r() < 0.2 ? 1.2 : 0);
      box(len / n + 0.04, hh, t + R(-0.1, 0.15), mBlock, lerp(x0, x1, u), hh / 2, lerp(z0, z1, u), ry);
      if (r() < 0.45) box(len / n * R(0.3, 0.6), 0.5, t * 0.9, mStone, lerp(x0, x1, u) + R(-0.3, 0.3), hh + 0.25, lerp(z0, z1, u), ry);
    }
  };
  wallRun(-17.8, 22.8, -4.2, 22.8, 4.6); wallRun(4.2, 22.8, 17.8, 22.8, 4.6);
  wallRun(-17.8, -10, -17.8, 22.8, 4.4); wallRun(17.8, -1, 17.8, 22.8, 4.4); wallRun(17.8, -10.6, 17.8, -5, 4.4);
  // breach: toppled blocks and half an arch
  for (let i = 0; i < 9; i++) { const s = R(0.5, 1.2); const b = box(s * 1.5, s, s, mBlock, R(-6.5, 6.5), s * 0.35, 22.8 + R(-2.2, 2.6)); b.rotation.set(R(-0.4, 0.4), R(0, 3), R(-0.4, 0.4)); if (Math.abs(b.position.x) < 3.4) b.position.x += Math.sign(b.position.x || 1) * 3.2; }
  box(1.6, 6, 1.6, mBlock, -4.6, 3, 22.8); box(1.6, 3.4, 1.6, mBlock, 4.6, 1.7, 22.8); box(3.4, 0.9, 1.5, mStone, -3.4, 6.3, 22.8).rotation.z = -0.12;

  // the cliff and the Narrows
  const cliff = (x0, x1, z0, z1, h) => {
    const body = box(x1 - x0, h, z1 - z0, mRock, (x0 + x1) / 2, h / 2 - 0.5, (z0 + z1) / 2);
    const n = Math.round(((x1 - x0) + (z1 - z0)) / 3.2);
    for (let i = 0; i < n; i++) { const s = R(1.6, 3.6); const m = add(new T.DodecahedronGeometry(s, 0), mRock, R(x0, x1), h - 0.6 + R(-0.6, 0.8), R(z0, z1)); m.rotation.set(R(0, 3), R(0, 3), 0); m.scale.y = 0.6; }
    return body;
  };
  cliff(-46, -3.5, -52, -10.7, 11); cliff(3.5, 46, -52, -10.7, 11); const endCliff = cliff(-3.6, 3.6, -52, -28.6, 12.5);
  const narrowsG = new T.Group(), nr0 = scene.children.length; // the boulders lining the Narrows: not there in the vault
  for (const s of [-1, 1]) for (let z = -11.5; z > -28; z -= 2.6) { const sz = R(0.8, 1.5); const m = add(new T.DodecahedronGeometry(sz, 0), mRock, s * (3.5 + R(-0.15, 0.25)), R(0.4, 6.5), z + R(-0.8, 0.8)); m.rotation.set(R(0, 3), R(0, 3), 0); }
  for (const m of scene.children.slice(nr0)) narrowsG.add(m); scene.add(narrowsG);
  for (const s of [-1, 1]) { box(1.3, 6.6, 1.3, mBlock, s * 3.7, 3.3, -10.2); add(new T.CylinderGeometry(0.75, 0.75, 0.3, 10), mStone, s * 3.7, 6.75, -10.2); }
  box(9.0, 0.9, 1.5, mStone, 0, 7.3, -10.2);
  // sanctum gate at the end of the Narrows
  box(1.2, 7, 1.2, mBlock, -2.5, 3.5, -27.8); box(1.2, 7, 1.2, mBlock, 2.5, 3.5, -27.8); box(6.4, 1.1, 1.3, mStone, 0, 7.3, -27.8);
  const gateMat = new T.MeshBasicMaterial({ color: new T.Color(0.3, 0.85, 0.78), fog: false });
  const gate = new T.Mesh(new T.PlaneGeometry(3.8, 6.4), gateMat); gate.position.set(0, 3.3, -27.75); scene.add(gate);
  const gateL = new T.PointLight(0x7fe0d0, 12, 16, 2); gateL.position.set(0, 3, -25.5); scene.add(gateL);
  // The archway at the end of the Narrows has two dressings that share its stone surround.
  // In play it is the sanctum gate: an open arch with lamplight inside and a raised portcullis,
  // where the wounded are carried. On the title screen it is the Glass Door, which stands
  // somewhere else in the story: leaded panes behind an iron grid, a gold seal chained to the
  // four corners, glass growing out of the rock at its foot, and a ward ring cut into the floor.
  const mIron = toon(0x23262e);
  {
    for (const s of [-1, 1]) { // surround: jambs with a gold fillet, plinth and capital on each pillar
      box(0.3, 6.5, 0.6, mStone, s * 2.04, 3.25, -27.45); box(0.1, 6.3, 0.05, mGold, s * 1.96, 3.25, -27.14); // the jamb stands a finger proud of the pillar and the fillet clear of the jamb's edge: flush faces fight for the same depth and flicker
      box(1.5, 0.45, 1.5, mStone, s * 2.5, 0.22, -27.8); box(1.42, 0.14, 1.42, mDark, s * 2.5, 0.52, -27.8); box(1.5, 0.4, 1.5, mStone, s * 2.5, 6.75, -27.8);
    }
    box(4.4, 0.32, 0.6, mStone, 0, 6.62, -27.45); box(3.9, 0.1, 0.05, mGold, 0, 6.5, -27.14);
    box(0.8, 0.95, 0.5, mStone, 0, 7.25, -27.05); box(0.3, 0.3, 0.08, mGold, 0, 7.25, -26.78).rotation.z = PI / 4;
    box(4.3, 0.1, 1.1, mStone, 0, 0.03, -27.3);
  }
  const doorG = new T.Group(), sanctumG = new T.Group(); scene.add(doorG, sanctumG);
  {
    doorG.add(gate); const n0 = scene.children.length;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const c2 = cv.getContext('2d');
    const gr = c2.createRadialGradient(64, 124, 6, 64, 124, 170); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#c9f2ea'); gr.addColorStop(1, '#6fb5ac'); c2.fillStyle = gr; c2.fillRect(0, 0, 128, 256);
    const q = rng(41); c2.strokeStyle = 'rgba(40,90,90,0.55)'; c2.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) { c2.beginPath(); let x = q() * 128, y = q() * 256; c2.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (q() - 0.5) * 60; y += (q() - 0.5) * 70; c2.lineTo(x, y); } c2.stroke(); } // old cracks, sealed over
    c2.strokeStyle = 'rgba(255,255,255,0.7)'; c2.lineWidth = 2; for (const rr of [30, 44]) { c2.beginPath(); c2.arc(64, 124, rr, 0, 7); c2.stroke(); }
    gateMat.map = new T.CanvasTexture(cv); gateMat.map.colorSpace = T.SRGBColorSpace;
    const g7 = rng(7), Q = (a, b) => a + g7() * (b - a);
    const zf = -27.68;
    for (const x of [-0.64, 0.64]) box(0.07, 6.4, 0.06, mIron, x, 3.3, zf); for (const y of [1.55, 5.05]) box(3.8, 0.07, 0.06, mIron, 0, y, zf);
    add(new T.TorusGeometry(0.86, 0.07, 8, 28), mGold, 0, 3.3, zf + 0.05); add(new T.TorusGeometry(0.6, 0.03, 6, 24), mGold, 0, 3.3, zf + 0.05);
    box(0.44, 0.44, 0.08, mGold, 0, 3.3, zf + 0.05).rotation.z = PI / 4; box(0.2, 0.2, 0.1, mIron, 0, 3.3, zf + 0.07).rotation.z = PI / 4;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { // chains from the seal to the corners, with a staple at each end
      const a = V(sx * 0.62, 3.3 + sy * 0.62, zf + 0.05), b = V(sx * 1.84, 3.3 + sy * 3.0, zf + 0.05), ch = box(0.06, a.distanceTo(b), 0.06, mIron, (a.x + b.x) / 2, (a.y + b.y) / 2, a.z);
      ch.rotation.z = -Math.atan2(b.x - a.x, b.y - a.y); box(0.2, 0.2, 0.12, mIron, b.x, b.y, b.z);
    }
    // Glass that has crept out of the Door into the stone around it: six-sided crystals, shaded
    // dark at the root and bright at the point, each face a slightly different tone.
    const xtal = (() => {
      const sh = new T.CylinderGeometry(0.1, 0.135, 0.7, 6, 1, true).toNonIndexed(), tp = new T.ConeGeometry(0.1, 0.3, 6, 1, true).toNonIndexed(); sh.translate(0, 0.35, 0); tp.translate(0, 0.85, 0);
      const g = mergeGeometries([sh, tp]); g.computeVertexNormals(); const p = g.attributes.position, nm = g.attributes.normal, c = new Float32Array(p.count * 3), L = V(0.45, 0.5, 0.74);
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), f = (0.2 + 0.62 * y * y) * (0.62 + 0.55 * Math.max(0, nm.getX(i) * L.x + nm.getY(i) * L.y + nm.getZ(i) * L.z)); c[i * 3] = 0.2 * f + 0.22 * y ** 4; c[i * 3 + 1] = 0.84 * f; c[i * 3 + 2] = 0.76 * f; }
      g.setAttribute('color', new T.Float32BufferAttribute(c, 3)); return g;
    })();
    const mGlass = new T.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false });
    const shard = (x, y, z, h, tilt, rz, ry) => { const m = new T.Mesh(xtal, mGlass); m.position.set(x, y, z); m.rotation.set(tilt, ry == null ? Q(0, 3) : ry, rz); m.scale.set(h * (0.85 + Q(0, 0.5)), h, h * (0.85 + Q(0, 0.5))); scene.add(m); return m; };
    // a cluster: one tall crystal and a few shorter ones leaning out of the same root
    const cluster = (x, y, z, h, lean) => { shard(x, y, z, h, Q(-0.12, 0.12), lean); for (let k = 0, n = 2 + ((Q(0, 1) * 3) | 0); k < n; k++) shard(x + Q(-0.12, 0.12) * h, y, z + Q(-0.22, 0.22) * h, h * Q(0.35, 0.7), Q(-0.6, 0.6), lean + Q(-0.55, 0.55)); };
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) cluster(s * Q(2.05, 2.7), 0.02, Q(-27.15, -26.7), Q(0.45, 0.95), -s * Q(0.1, 0.4));
      for (let i = 0; i < 3; i++) { const h = Q(0.22, 0.45); shard(s * Q(1.75, 2.3), 6.5, -27.1, h, PI + Q(-0.2, 0.2), s * Q(0.1, 0.5)); }
    }
    // ward ring on the floor
    const mWard = new T.MeshBasicMaterial({ color: new T.Color(0.2, 0.62, 0.56), transparent: true, opacity: 0.75, depthWrite: false, fog: false });
    const flat = (geo, x, z, ry) => { const m = new T.Mesh(geo, mWard); m.rotation.x = -PI / 2; m.rotation.z = ry || 0; m.position.set(x, 0.035, z); scene.add(m); return m; };
    flat(new T.RingGeometry(1.86, 1.96, 48), 0, -24); flat(new T.RingGeometry(1.2, 1.25, 40), 0, -24);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; flat(new T.PlaneGeometry(0.06, 0.5), Math.sin(a) * 1.58, -24 + Math.cos(a) * 1.58, -a); }
    flat(new T.RingGeometry(0.32, 0.44, 4), 0, -24, PI / 4);
    W.ward = mWard;
    // The Door stands in a vault under the ruins, not in the Narrows: a barrel-vaulted hall of
    // dressed stone, with half-columns down both walls carrying ribs across the roof. Glass has
    // spread from the Door through the joints of the stone (the veins glow, and burn with W.flare).
    const Z0 = -28.45, Z1 = -11.2, LEN = Z1 - Z0, ZC = (Z0 + Z1) / 2, HW = 2.95, SPR = 7.0, vr = rng(23); // the roof springs from the height of the Door's pillars, so its whole surround stands clear under the vault
    const ashlar = canvasTex(256, (g, n) => {
      speck(g, n, [104, 112, 128], 12, vr);
      for (let i = 0; i < 46; i++) { g.fillStyle = vr() < 0.5 ? 'rgba(40,46,60,.12)' : 'rgba(170,180,200,.08)'; g.beginPath(); g.arc(vr() * n, vr() * n, 8 + vr() * 30, 0, 7); g.fill(); }
      for (let row = 0; row < 4; row++) { // four courses of blocks of uneven length, each its own tone, with a soft lit edge and a dark joint
        const y = row * 64; let x = -(vr() * 60);
        while (x < n) { const w = 56 + vr() * 60;
          g.fillStyle = (vr() < 0.5 ? 'rgba(30,36,50,' : 'rgba(190,200,220,') + (0.04 + vr() * 0.1).toFixed(2) + ')'; g.fillRect(x + 2, y + 2, w - 3, 60);
          g.fillStyle = 'rgba(200,212,235,.14)'; g.fillRect(x + 2, y + 3, w - 3, 1.5); g.fillStyle = 'rgba(22,26,36,.6)'; g.fillRect(x, y, 2.5, 64); x += w; }
        g.fillStyle = 'rgba(22,26,36,.62)'; g.fillRect(0, y, n, 2.5);
      }
      for (let k = 0; k < 16; k++) { const x = vr() * n, y = vr() * n, l = 30 + vr() * 70, gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(24,30,42,.26)'); gr.addColorStop(1, 'rgba(24,30,42,0)'); g.fillStyle = gr; g.fillRect(x, y, 3 + vr() * 6, l); } // damp streaks
    });
    const paving = canvasTex(256, (g, n) => {
      speck(g, n, [82, 88, 102], 12, vr);
      for (let i = 0; i < 40; i++) { g.fillStyle = vr() < 0.5 ? 'rgba(30,34,46,.14)' : 'rgba(150,160,182,.08)'; g.beginPath(); g.arc(vr() * n, vr() * n, 8 + vr() * 34, 0, 7); g.fill(); }
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) { // big flags, staggered, with worn rounded corners
        const x = col * 128 + (row ? 64 : 0), y = row * 128;
        for (const xx of [x, x - 256]) { g.fillStyle = (vr() < 0.5 ? 'rgba(26,30,42,' : 'rgba(170,180,204,') + (0.05 + vr() * 0.1).toFixed(2) + ')'; g.fillRect(xx + 3, y + 3, 123, 123); g.fillStyle = 'rgba(190,202,226,.13)'; g.fillRect(xx + 3, y + 3, 123, 1.5); g.fillRect(xx + 3, y + 3, 1.5, 123);
          g.fillStyle = 'rgba(16,18,26,.7)'; g.fillRect(xx, y, 128, 3); g.fillRect(xx, y, 3, 128); for (const [cx, cy] of [[xx + 3, y + 3], [xx + 128, y + 3], [xx + 3, y + 128], [xx + 128, y + 128]]) { g.beginPath(); g.arc(cx, cy, 3 + vr() * 5, 0, 7); g.fill(); } }
      }
      g.strokeStyle = 'rgba(16,18,26,.4)'; g.lineWidth = 1.2; for (let k = 0; k < 7; k++) { let x = vr() * n, y = vr() * n; g.beginPath(); g.moveTo(x, y); for (let m = 0; m < 5; m++) { x += (vr() - 0.5) * 36; y += (vr() - 0.5) * 36; g.lineTo(x, y); } g.stroke(); }
    });
    // Veins of glass, painted once over a whole surface: thick near the Door (u = 1), thinning out along the hall.
    const veinTex = (w, h, count, seed) => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), q = rng(seed); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.lineCap = g.lineJoin = 'round';
      const run = (x, y, a, len, wd) => { const pts = [[x, y]]; for (let k = 0; k < len; k++) { a += (q() - 0.5) * 0.9; x += Math.cos(a) * 15; y += Math.sin(a) * 15; pts.push([x, y]); if (wd > 1.4 && q() < 0.2) run(x, y, a + (q() < 0.5 ? 0.9 : -0.9), (len * 0.5) | 0, wd * 0.6); }
        for (const [lw, col] of [[wd * 5, 'rgba(60,200,180,.10)'], [wd * 2.2, 'rgba(90,225,205,.32)'], [wd * 0.8, 'rgba(215,255,248,.95)']]) { g.lineWidth = lw; g.strokeStyle = col; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); } };
      for (let i = 0; i < count; i++) { const u = 1 - q() * q(); run(w * (1.02 - (1 - u) * 0.92), q() * h, PI + (q() - 0.5) * 1.6, 4 + ((q() * 10 * u) | 0), 1 + q() * 2.2 * u); }
      const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
    };
    const tex = (t, rx, ry) => { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; };
    const VEIN = new T.Color(0.3, 0.86, 0.76), veined = [];
    const vmat = (map, vein, o) => { const m = toon(0xffffff, { map, emissive: vein ? VEIN : 0x000000, emissiveMap: vein || null, ...(o || {}) }); if (vein) veined.push(m); return m; };
    const mWallW = vmat(tex(ashlar, 4.4, 2.8), veinTex(1024, 256, 30, 5)), mWallE = vmat(tex(ashlar, 4.4, 2.8), veinTex(1024, 256, 30, 6));
    const floorVein = (() => { // the floor's veins run out from the foot of the Door: the same painting, turned to lie along the hall
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 1024; const g = cv.getContext('2d'); g.translate(0, 1024); g.rotate(-PI / 2); g.drawImage(veinTex(1024, 256, 22, 9).image, 0, 0);
      const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; })();
    const mFloor = vmat(tex(paving, 2, 6), floorVein), mRoof = vmat(tex(ashlar, 4.4, 2.4), null, { side: T.BackSide }), mEnd = vmat(tex(ashlar, 1.5, 3.9), null), mVault = toon(0x7c8698), mVaultD = toon(0x4a5162);
    const still = (m) => { m.castShadow = false; return m; };
    const floor = add(new T.PlaneGeometry(HW * 2, LEN), mFloor, 0, 0.012, ZC); floor.rotation.x = -PI / 2; still(floor);
    for (const sd of [-1, 1]) { // walls: u runs toward the Door on both
      const g = new T.PlaneGeometry(LEN, SPR + 0.3); if (sd > 0) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
      still(add(g, sd < 0 ? mWallW : mWallE, sd * HW, (SPR + 0.3) / 2, ZC, -sd * PI / 2));
      still(add(new T.CylinderGeometry(0.13, 0.13, LEN, 10), mVault, sd * HW, SPR, ZC)).rotation.x = PI / 2; // string course at the springing
      still(add(new T.CylinderGeometry(0.16, 0.16, LEN, 10), mVaultD, sd * HW, 0.1, ZC)).rotation.x = PI / 2; // skirting
    }
    { const g = new T.CylinderGeometry(HW + 0.05, HW + 0.05, LEN, 28, 1, true, 0, PI); g.rotateZ(PI / 2); g.rotateY(PI / 2); still(add(g, mRoof, 0, SPR, ZC)); } // the barrel vault
    still(add(new T.PlaneGeometry(HW * 2, 10.4), mEnd, 0, 5.2, Z0)); still(add(new T.PlaneGeometry(HW * 2, 10.4), mEnd, 0, 5.2, Z1, PI));
    // half-columns and the ribs they carry
    const shaftG = new T.CylinderGeometry(0.3, 0.34, SPR - 1.0, 18), capG = new T.LatheGeometry([[0.3, 0], [0.31, 0.08], [0.36, 0.2], [0.46, 0.3], [0.48, 0.42]].map(([a, b]) => new T.Vector2(a, b)), 18);
    const baseG = new T.LatheGeometry([[0.5, 0], [0.5, 0.22], [0.44, 0.28], [0.42, 0.36], [0.38, 0.42], [0.4, 0.5], [0.34, 0.58]].map(([a, b]) => new T.Vector2(a, b)), 18), ribG = new T.TorusGeometry(HW - 0.02, 0.2, 10, 30, PI);
    for (const z of [-13.4, -17.4, -21.4, -25.3]) {
      for (const sd of [-1, 1]) { add(shaftG, mVault, sd * HW, 0.58 + (SPR - 1.0) / 2, z); add(capG, mVault, sd * HW, SPR - 0.42, z); add(baseG, mVaultD, sd * HW, 0, z); cluster(sd * (HW - 0.42), 0.02, z + Q(-0.5, 0.5), Q(0.3, 0.75) * (z < -20 ? 1.25 : 0.8), -sd * Q(0.15, 0.5)); }
      still(add(ribG, mVault, 0, SPR, z));
    }
    still(add(new T.TorusGeometry(HW - 0.1, 0.3, 10, 30, PI), mVault, 0, SPR, -27.0)); // a heavier rib over the Door, where its lintel meets the roof
    for (let i = 0; i < 9; i++) { const sd = i % 2 ? 1 : -1, z = Q(-27.2, -15), y = Q(1.2, 4.6), h = Q(0.3, 0.5) * (z < -22 ? 1.25 : 0.85); for (let k = 0; k < 3; k++) shard(sd * (HW + 0.06), y + Q(-0.1, 0.1), z + Q(-0.12, 0.12), h * (k ? Q(0.45, 0.8) : 1), Q(-0.7, 0.7), sd * Q(0.95, 1.5), 0); } // glass pushing out of the joints higher up, in knots of three
    { // the way out, at the far end: a dark arched stair
      const sp = new T.Shape(); sp.moveTo(-1, 0); sp.lineTo(1, 0); sp.lineTo(1, 2.3); sp.absarc(0, 2.3, 1, 0, PI); sp.lineTo(-1, 0);
      const d = new T.Mesh(new T.ShapeGeometry(sp, 16), mInside); d.position.set(0, 0.04, Z1 - 0.03); d.rotation.y = PI; scene.add(d);
      still(add(new T.TorusGeometry(1.12, 0.17, 8, 22, PI), mVault, 0, 2.3, Z1 - 0.05)); for (const sd of [-1, 1]) { add(new T.CylinderGeometry(0.17, 0.17, 2.3, 12), mVault, sd * 1.12, 1.15, Z1 - 0.05); add(new T.CylinderGeometry(0.24, 0.24, 0.16, 12), mVaultD, sd * 1.12, 0.08, Z1 - 0.05); }
      still(add(new T.BoxGeometry(1.9, 0.16, 0.3), mVaultD, 0, 0.08, Z1 - 0.2)); // threshold
    }
    // cold light off the glass, down the middle of the hall
    const vaultL = [[-23.2, 5], [-16.2, 3.2]].map(([z, i]) => { const l = new T.PointLight(0x9fdcd2, i, 13, 2); l.position.set(0, 4.2, z); l.userData.base = i; scene.add(l); return l; });
    W.vault = { veined, glass: mGlass, lights: vaultL };
    W.kit = { tex, ashlar, paving, veinTex, vmat, cluster, shard, mVault, mVaultD, mInside, mIron, still }; // the vault's stone and glass, for the halls that lead to it
    for (const m of scene.children.slice(n0)) doorG.add(m);
  }
  {
    const n0 = scene.children.length, zf = -27.7;
    const dark = new T.Mesh(new T.PlaneGeometry(3.8, 6.4), mInside); dark.position.set(0, 3.3, -27.76); scene.add(dark);
    // lamplight from inside, strongest at the floor
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 128; const c2 = cv.getContext('2d');
    const gr = c2.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,186,104,0.9)'); gr.addColorStop(0.28, 'rgba(200,110,54,0.4)'); gr.addColorStop(0.62, 'rgba(110,54,28,0.08)'); gr.addColorStop(1, 'rgba(60,30,20,0)'); c2.fillStyle = gr; c2.fillRect(0, 0, 32, 128);
    const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace;
    const glow = new T.Mesh(new T.PlaneGeometry(3.8, 6.4), new T.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, fog: false })); glow.position.set(0, 3.3, -27.74); scene.add(glow);
    // portcullis drawn up into the head of the arch, ready to drop
    for (let k = -3; k <= 3; k++) { box(0.09, 1.7, 0.09, mSteel, k * 0.52, 5.62, zf); add(new T.ConeGeometry(0.075, 0.26, 4), mSteel, k * 0.52, 4.64, zf).rotation.x = PI; }
    for (const y of [5.25, 6.05]) box(3.8, 0.09, 0.07, mSteel, 0, y, zf);
    // a lantern on each jamb
    const mLamp = new T.MeshBasicMaterial({ color: new T.Color(1.5, 1.0, 0.5), fog: false });
    for (const s of [-1, 1]) { box(0.3, 0.06, 0.3, mIron, s * 1.95, 3.3, -27.0); box(0.16, 0.26, 0.16, mLamp, s * 1.95, 3.1, -27.0); box(0.22, 0.05, 0.22, mIron, s * 1.95, 2.95, -27.0); box(0.05, 0.05, 0.3, mIron, s * 1.95, 3.34, -27.1); }
    for (const m of scene.children.slice(n0)) sanctumG.add(m);
  }
  W.setGate = (kind) => { const door = kind === 'door'; doorG.visible = door; sanctumG.visible = !door; W.doorMode = door; if (W.applyGate) W.applyGate(); gateL.color.setHex(door ? 0x7fe0d0 : 0xffb070); gateL.intensity = door ? 12 : 9; narrowsG.visible = !door; };
  W.setGate('sanctum');

  // columns, tents, crates, banners
  const column = (x, z, h, broken) => {
    add(new T.CylinderGeometry(0.46, 0.54, h, 16), mCol, x, h / 2, z); box(1.3, 0.35, 1.3, mBlock, x, 0.18, z);
    add(new T.CylinderGeometry(0.6, 0.64, 0.16, 16), mStone, x, 0.43, z); add(new T.TorusGeometry(0.56, 0.06, 6, 16), mStone, x, 0.56, z).rotation.x = PI / 2;
    for (let y = 1.9; y < h - 0.6; y += 1.75) add(new T.CylinderGeometry(0.5 - 0.08 * (y / h) + 0.012, 0.5 - 0.08 * (y / h) + 0.012, 0.05, 16), mDark, x, y, z);
    if (h > 5) { add(new T.TorusGeometry(0.49, 0.06, 6, 16), mStone, x, h - 0.2, z).rotation.x = PI / 2; add(new T.CylinderGeometry(0.66, 0.48, 0.2, 16), mStone, x, h - 0.06, z); }
    else { const c = add(new T.DodecahedronGeometry(0.42, 0), mCol, x, h - 0.05, z); c.scale.y = 0.45; c.rotation.y = D(0, 3); for (let k = 0; k < 3; k++) { const s = D(0.14, 0.3), q = add(new T.DodecahedronGeometry(s, 0), mStone, x + D(-1.1, 1.1), s * 0.5, z + D(-1.1, 1.1)); q.rotation.set(D(0, 3), D(0, 3), 0); } }
    if (!broken) box(1.25, 0.32, 1.25, mBlock, x, h + 0.16, z);
    else { const d = add(new T.CylinderGeometry(0.46, 0.46, 1.5, 16), mCol, x + R(-1.4, 1.4), 0.46, z + R(1.2, 1.9)); d.rotation.z = PI / 2; d.rotation.y = R(0, 3); }
    OBSTACLES.push({ x, z, r: 0.75 });
  };
  for (const z of [-4, 3, 10, 17]) { column(-15.2, z, r() < 0.4 ? R(1.6, 3) : 5.4, false); column(15.2, z + 2.5, r() < 0.5 ? R(1.6, 3) : 5.4, r() < 0.5); }
  const tent = (x, z, ry) => {
    // ridge tent: sagging slopes, a closed back, tied-back door flaps, poles, guy ropes and stakes
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(RING.x - x, RING.z - z) + ry - 0.5; scene.add(g);
    const put = (m) => { m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const hw = 1.75, H = 2.35, L = 3.5, nu = 6, nv = 4, len = Math.hypot(H, hw), pos = [], uv = [], ix = [];
    for (const s of [-1, 1]) {
      const o = pos.length / 3;
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
        const u = i / nu, v = j / nv, sag = Math.sin(PI * v) * (0.05 + 0.12 * Math.sin(u * PI));
        pos.push(s * (v * hw - sag * H / len), H * (1 - v) - sag * hw / len, (u - 0.5) * L); uv.push(u * 1.5 + (s > 0 ? 0.5 : 0), (1 - v) * 0.86);
      }
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = o + i * (nv + 1) + j, b = a + 1, c = a + nv + 1; ix.push(a, b, c, b, c + 1, c); }
    }
    const tri = (z, ...p) => { const o = pos.length / 3; for (let k = 0; k < 6; k += 2) { pos.push(p[k], p[k + 1], z); uv.push(p[k] / (hw * 2) * 0.9 + 0.5, p[k + 1] / H * 0.86); } ix.push(o, o + 1, o + 2); };
    tri(-L / 2, hw, 0, -hw, 0, 0, H); tri(L / 2, -hw, 0, -0.62, 0, 0, H); tri(L / 2, 0.62, 0, hw, 0, 0, H); tri(L / 2, -0.24, H * 0.62, 0.24, H * 0.62, 0, H);
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); tg.setIndex(ix); tg.computeVertexNormals();
    put(new T.Mesh(tg, mTent));
    const ig = new T.BufferGeometry(); ig.setAttribute('position', new T.Float32BufferAttribute([-0.7, 0, L / 2 - 0.05, 0.7, 0, L / 2 - 0.05, 0, H * 0.72, L / 2 - 0.05], 3)); g.add(new T.Mesh(ig, mInside));
    const stick = (a, b, rad, mat) => { const m = put(new T.Mesh(new T.CylinderGeometry(rad, rad, a.distanceTo(b), 5), mat)); m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); return m; };
    stick(V(0, H + 0.03, -L / 2 - 0.3), V(0, H + 0.03, L / 2 + 0.3), 0.045, mWood);
    for (const s of [-1, 1]) {
      stick(V(0, 0, s * (L / 2 + 0.02)), V(0, H + 0.22, s * (L / 2 + 0.02)), 0.05, mWood);
      stick(V(0, H, s * (L / 2 + 0.25)), V(0, 0.08, s * (L / 2 + 0.95)), 0.016, mRope); stick(V(0, 0, s * (L / 2 + 1.0)), V(0, 0.3, s * (L / 2 + 0.88)), 0.03, mWood);
      for (const e of [-1, 1]) { stick(V(e * hw * 0.98, 0.05, s * L * 0.42), V(e * (hw + 0.3), 0.02, s * L * 0.42), 0.016, mRope); stick(V(e * (hw + 0.32), 0, s * L * 0.42), V(e * (hw + 0.22), 0.26, s * L * 0.42), 0.03, mWood); }
    }
    // a bedroll and a sack by the door
    const roll = put(new T.Mesh(new T.CylinderGeometry(0.15, 0.15, 0.8, 8), mCloth)); roll.rotation.z = PI / 2; roll.position.set(-1.0, 0.15, L / 2 + 0.3);
    const sk = put(new T.Mesh(new T.SphereGeometry(0.28, 8, 6), mSack)); sk.scale.set(1, 0.75, 0.85); sk.position.set(1.05, 0.2, L / 2 + 0.25);
    OBSTACLES.push({ x, z, r: 2.0 });
  };
  tent(-11.5, 13.5, 0.5); tent(11, 15.5, 0.9); tent(-11.5, -3.5, 0.2);
  for (let i = 0; i < 9; i++) { const x = [-8.5, 12.5, 9.5][i % 3] + R(-1.3, 1.3), z = [10.5, 11.5, -6.5][i % 3] + R(-1.3, 1.3), s = R(0.55, 0.85); box(s, s, s, mCrate, x, s / 2, z, R(0, 1.5)); OBSTACLES.push({ x, z, r: s * 0.7 });
    if (dr() < 0.35) { const t = s * D(0.55, 0.7); box(t, t, t, mCrate, x + D(-0.06, 0.06), s + t / 2, z + D(-0.06, 0.06), D(0, 1.5)); }
    else if (dr() < 0.4) { const sk = add(new T.SphereGeometry(s * 0.42, 8, 6), mSack, x, s + s * 0.2, z, D(0, 3)); sk.scale.set(1, 0.55, 0.8); } }
  // barrels, sacks and a spear rack against the walls
  const barrelG = new T.CylinderGeometry(0.33, 0.33, 0.9, 12, 4); { const p = barrelG.attributes.position; for (let i = 0; i < p.count; i++) { const f = 1 + 0.14 * Math.cos((p.getY(i) / 0.45) * PI / 2); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } barrelG.computeVertexNormals(); }
  for (const [x, z] of [[-16.3, 6.9], [-16.25, 7.75], [16.3, 14.6], [16.25, 15.5], [16.3, 2.2]]) { add(barrelG, mBarrel, x, 0.45, z, D(0, 3)); OBSTACLES.push({ x, z, r: 0.5 }); }
  for (const [x, z] of [[-16.2, 8.5], [16.2, 16.3], [16.25, 3.0], [-15.9, 7.3]]) { const sk = add(new T.SphereGeometry(0.3, 8, 6), mSack, x, 0.19, z, D(0, 3)); sk.scale.set(1, 0.7, 0.8); }
  { const x = -16.45, z = -0.4; for (const s of [-1, 1]) box(0.1, 1.5, 0.1, mWood, x, 0.75, z + s * 0.8); box(0.08, 0.08, 1.8, mWood, x, 1.35, z); box(0.08, 0.08, 1.8, mWood, x, 0.45, z);
    for (let k = 0; k < 4; k++) { const sz = z - 0.54 + k * 0.36, sp = add(new T.CylinderGeometry(0.025, 0.025, 2.3, 5), mWood, x + 0.22, 1.12, sz); sp.rotation.z = -0.2; const tp = add(new T.ConeGeometry(0.06, 0.32, 4), mSteel, x - 0.03, 2.4, sz); tp.rotation.z = -0.2; }
    OBSTACLES.push({ x: -16.4, z, r: 0.75 }); }
  const banner = (x, y, z, ry) => {
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
    const pole = new T.Mesh(new T.BoxGeometry(1.2, 0.08, 0.08), mWood); g.add(pole);
    const cl = new T.Mesh(new T.PlaneGeometry(1.0, 2.6, 1, 6), mBanner); cl.position.y = -1.32; cl.castShadow = true; g.add(cl);
    for (const s of [-1, 1]) { const k = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), mGold); k.position.x = s * 0.62; g.add(k); }
    W.banners.push(g);
  };
  banner(-16.9, 4.6, 6, PI / 2); banner(-16.9, 4.6, 13.5, PI / 2); banner(16.9, 4.6, 8, -PI / 2); banner(-3.7, 6.0, -9.45, 0); banner(3.7, 6.0, -9.45, 0);
  banner(-2.5, 6.3, -27.14, 0); banner(2.5, 6.3, -27.14, 0);
  const gateBanners = W.banners.slice(-2); // the company's colours hang at the sanctum, not at the Door

  // fire: braziers and a campfire. Flames are unlit and bright so they bloom.
  const mFlame = new T.MeshBasicMaterial({ color: new T.Color(1.7, 0.5, 0.11), transparent: true, opacity: 0.85, depthWrite: false, fog: false });
  // Each fire: a ragged outer flame with two side tongues, a hotter body, a small bright core and a soft halo.
  const mMid = new T.MeshBasicMaterial({ color: new T.Color(1.9, 1.0, 0.24), transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  const mCore = new T.MeshBasicMaterial({ color: new T.Color(2.1, 1.75, 0.9), transparent: true, opacity: 0.95, depthWrite: false, fog: false });
  const mCoal = new T.MeshBasicMaterial({ color: new T.Color(1.25, 0.3, 0.06) });
  const mHalo = new T.SpriteMaterial({ map: TEX.glow, color: new T.Color(1.0, 0.4, 0.1), blending: T.AdditiveBlending, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
  const flameG = new T.LatheGeometry([[0.5, 0], [0.92, 0.1], [1, 0.26], [0.84, 0.46], [0.52, 0.68], [0.22, 0.86], [0, 1]].map(([a, b]) => new T.Vector2(a, b)), 8);
  const fire = (x, y, z, s) => {
    const ph = dr() * 6;
    const mk = (mat, w, h, ox, oz, p, order, spark) => { const f = new T.Mesh(flameG, mat); f.position.set(x + ox * s, y, z + oz * s); f.scale.set(w * s, h * s, w * s); f.renderOrder = order; f.userData = { w: w * s, h: h * s, ph: ph + p, spark }; scene.add(f); W.flames.push(f); };
    mk(mFlame, 0.21, 0.66, 0, 0, 0, 1, true); mk(mFlame, 0.12, 0.42, 0.13, 0.05, 2, 1); mk(mFlame, 0.11, 0.36, -0.09, -0.11, 4, 1); mk(mFlame, 0.09, 0.3, -0.06, 0.13, 5, 1);
    mk(mMid, 0.14, 0.46, 0, 0, 1, 2); mk(mCore, 0.075, 0.26, 0, 0, 3, 3);
    const h = new T.Sprite(mHalo); h.position.set(x, y + 0.3 * s, z); h.scale.setScalar(2.3 * s); scene.add(h);
  };
  const brazier = (x, z, lit) => {
    add(new T.CylinderGeometry(0.1, 0.2, 1.1, 8), mDark, x, 0.55, z); add(new T.CylinderGeometry(0.46, 0.24, 0.32, 10), mDark, x, 1.25, z);
    add(new T.TorusGeometry(0.46, 0.04, 6, 14), mDark, x, 1.41, z).rotation.x = PI / 2; add(new T.CylinderGeometry(0.26, 0.3, 0.06, 10), mDark, x, 0.03, z);
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5, lg = add(new T.CylinderGeometry(0.025, 0.035, 1.25, 5), mDark, x + Math.sin(a) * 0.22, 0.58, z + Math.cos(a) * 0.22); lg.rotation.set(Math.cos(a) * -0.3, 0, Math.sin(a) * 0.3); }
    const co = new T.Mesh(new T.SphereGeometry(0.38, 10, 6), mCoal); co.scale.y = 0.22; co.position.set(x, 1.36, z); scene.add(co);
    fire(x, 1.36, z, 1); OBSTACLES.push({ x, z, r: 0.5 });
    if (lit) { const l = new T.PointLight(0xff8a3c, FIRE, 15, 2); l.position.set(x, 2.3, z); scene.add(l); W.fires.push(l); }
  };
  brazier(RING.x - 5.6, RING.z - 4.4, true); brazier(RING.x + 5.6, RING.z + 4.4, true); brazier(RING.x + 5.6, RING.z - 4.4, false); brazier(RING.x - 5.6, RING.z + 4.4, false);
  brazier(-4.9, -8.3, true); brazier(4.9, -8.3, false); brazier(-5.6, 20.6, false); brazier(5.6, 20.6, true);
  for (let i = 0; i < 5; i++) add(new T.CylinderGeometry(0.09, 0.09, 1.1, 6), mWood, 9 + Math.sin(i * 1.26) * 0.3, 0.18, -2.5 + Math.cos(i * 1.26) * 0.3).rotation.set(1.2, i * 1.26, 0);
  for (let i = 0; i < 9; i++) { const a = i * 0.7 + D(-0.1, 0.1), s = D(0.14, 0.2), st = add(new T.DodecahedronGeometry(s, 0), mRock, 9 + Math.sin(a) * 0.62, s * 0.5, -2.5 + Math.cos(a) * 0.62); st.rotation.set(D(0, 3), D(0, 3), 0); }
  { const co = new T.Mesh(new T.SphereGeometry(0.42, 10, 6), mCoal); co.scale.y = 0.2; co.position.set(9, 0.1, -2.5); scene.add(co); }
  fire(9, 0.14, -2.5, 1.45); OBSTACLES.push({ x: 9, z: -2.5, r: 0.7 });
  const cfl = new T.PointLight(0xff8a3c, FIRE, 15, 2); cfl.position.set(9, 1.6, -2.5); scene.add(cfl); W.fires.push(cfl);

  // scatter: rubble at the wall feet, pebbles, dry grass. Instanced, so three draw calls in all.
  { const M = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sv = V(1, 1, 1), pv = V(0, 0, 0);
    const edge = () => { const k = (dr() * 5) | 0, o = D(0.05, 0.75) ** 1.6; return k === 0 ? [D(-17, -4.5), 22 - o] : k === 1 ? [D(4.5, 17), 22 - o] : k === 2 ? [-17 + o, D(-9.5, 22)] : k === 3 ? [17 - o, D(0, 22)] : [D(4, 17) * (dr() < 0.5 ? -1 : 1), -10 + o]; };
    const out = () => { for (;;) { const x = D(-44, 50), z = D(-8, 58); if (!inAny(x, z, -1.6) && !(Math.abs(x) < 19.5 && z < 24.4 && z > -11)) return [x, z]; } };
    const stones = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), mRock, 340); stones.receiveShadow = true;
    for (let i = 0; i < 340; i++) {
      const far = i >= 230, [x, z] = far ? out() : i < 170 ? edge() : [D(-16, 16), D(-9, 21)], s = far ? D(0.1, 0.55) : i < 170 ? D(0.05, 0.2) : D(0.03, 0.07);
      pv.set(x, (far ? dune(x, z) : 0.02) + s * 0.3, z); q.setFromEuler(e.set(D(0, 3), D(0, 3), D(0, 3))); sv.set(s, s * D(0.5, 0.8), s * D(0.7, 1.2)); stones.setMatrixAt(i, M.compose(pv, q, sv));
    }
    scene.add(stones);
    const blades = []; for (let k = 0; k < 6; k++) { const b = new T.ConeGeometry(0.035, 0.55, 3); b.translate(0, 0.27, 0); b.rotateZ(0.25 + k * 0.07); b.rotateY(k * 1.05); blades.push(b); }
    const tufts = new T.InstancedMesh(mergeGeometries(blades), mStraw, 190); tufts.receiveShadow = true;
    for (let i = 0; i < 190; i++) {
      const far = i >= 80, [x, z] = far ? out() : edge(), s = far ? D(0.8, 1.8) : D(0.5, 1.0);
      pv.set(x, far ? dune(x, z) - 0.03 : 0.02, z); q.setFromEuler(e.set(0, D(0, 6), 0)); sv.set(s, s * D(0.7, 1.3), s); tufts.setMatrixAt(i, M.compose(pv, q, sv));
    }
    scene.add(tufts); }

  // the halls above the vault, at their own site: built into the scene, then gathered into one group
  W.kit.fire = fire; const hn0 = scene.children.length, halls = buildHalls(scene, W.kit), hallsG = new T.Group(); SITES.halls.obs = halls.obs;
  for (const m of scene.children.slice(hn0)) hallsG.add(m); scene.add(hallsG);
  const warG = new T.Group(); for (const m of halls.war) warG.add(m); hallsG.add(warG); // the war's traces: not there when he walks back up
  // the waystation, at its own site
  SITES.ruins.obs = OBSTACLES.slice();
  const way = buildWaystation(scene, WAY.x, WAY.z); SITES.way.obs = way.obs; W.banners.push(...way.banners);

  // far silhouettes
  const mFar = toon(0x2a2a40);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2 + R(0, 0.3), d = R(170, 250), h = R(18, 46), rt = R(14, 30), rb = R(26, 44), ry = R(0, 3), x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (Math.hypot(x - WAY.x, z - WAY.z) > rb + 64) add(new T.CylinderGeometry(rt, rb, h, 7), mFar, x, h / 2 - 3, z, ry).castShadow = false; } // none on top of the waystation

  // sky, stars, moon
  const sg = new T.SphereGeometry(700, 24, 14); sg.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(sg.attributes.position.count * 3), 3));
  const sky = new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false })); scene.add(sky);
  const sp = new Float32Array(1100 * 3);
  for (let i = 0; i < 1100; i++) { const a = r() * PI * 2, e = Math.asin(r() * 0.96 + 0.03); sp[i * 3] = Math.cos(e) * Math.sin(a) * 650; sp[i * 3 + 1] = Math.sin(e) * 650; sp[i * 3 + 2] = Math.cos(e) * Math.cos(a) * 650; }
  const stg = new T.BufferGeometry(); stg.setAttribute('position', new T.BufferAttribute(sp, 3));
  const stars = new T.Points(stg, new T.PointsMaterial({ color: 0xdfe6ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false })); scene.add(stars);
  const bp = new Float32Array(70 * 3);
  for (let i = 0; i < 70; i++) { const a = dr() * PI * 2, e = Math.asin(dr() * 0.9 + 0.06); bp[i * 3] = Math.cos(e) * Math.sin(a) * 645; bp[i * 3 + 1] = Math.sin(e) * 645; bp[i * 3 + 2] = Math.cos(e) * Math.cos(a) * 645; }
  const bsg = new T.BufferGeometry(); bsg.setAttribute('position', new T.BufferAttribute(bp, 3));
  const bright = new T.Points(bsg, new T.PointsMaterial({ color: new T.Color(1.3, 1.35, 1.6), size: 7, map: TEX.glow, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); scene.add(bright);
  const moon = new T.Mesh(new T.CircleGeometry(26, 40), new T.MeshBasicMaterial({ color: new T.Color(1.5, 1.6, 1.9), map: TEX.moon, fog: false, transparent: true })); scene.add(moon);
  const halo = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0x7f9cff, transparent: true, opacity: 0.3, depthWrite: false, fog: false, blending: T.AdditiveBlending })); halo.scale.setScalar(210); scene.add(halo);

  const hemi = new T.HemisphereLight(NIGHT.hemiS, NIGHT.hemiG, NIGHT.hemiI); scene.add(hemi);
  const sun = new T.DirectionalLight(NIGHT.sun, NIGHT.sunI); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.near = 2; sc.far = 140; sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.05;
  sun.target.position.set(0, 0, 0); scene.add(sun); scene.add(sun.target);
  scene.fog = new T.Fog(NIGHT.fog, 26, 150);

  const cA = new T.Color(), cB = new T.Color(), cZ = new T.Color(), cH = new T.Color();
  const mixC = (a, b, u) => cA.set(a).lerp(cB.set(b), u);
  // u runs from the site's first sky to its second: at the ruins, 0 is night and 1 is dawn
  let site = SITES.ruins, SA = NIGHT, SB = DAWN;
  W.setDawn = (u) => {
    W.dawn = u; cZ.copy(mixC(SA.zen, SB.zen, u)); cH.copy(mixC(SA.hor, SB.hor, u)); const mx = (k) => lerp(SA[k], SB[k], u), warm = mx('warm');
    const p = sg.attributes.position, c = sg.attributes.color, t = new T.Color();
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 700; t.copy(cH).lerp(cZ, clamp(y * 2.2, 0, 1)); if (y < 0) t.multiplyScalar(0.6); c.setXYZ(i, t.r, t.g, t.b); }
    c.needsUpdate = true;
    scene.fog.color.copy(mixC(SA.fog, SB.fog, u)); scene.fog.far = mx('fogF'); G.renderer.setClearColor(scene.fog.color);
    hemi.color.copy(mixC(SA.hemiS, SB.hemiS, u)); hemi.groundColor.copy(mixC(SA.hemiG, SB.hemiG, u)); hemi.intensity = lerp(SA.hemiI, SB.hemiI, u);
    sun.color.copy(mixC(SA.sun, SB.sun, u)); sun.intensity = lerp(SA.sunI, SB.sunI, u);
    sun.position.set(lerp(SA.sunP[0], SB.sunP[0], u), lerp(SA.sunP[1], SB.sunP[1], u), lerp(SA.sunP[2], SB.sunP[2], u)).multiplyScalar(1.6); sun.position.x += site.at[0]; sun.position.z += site.at[1];
    stars.material.opacity = bright.material.opacity = mx('stars'); moon.material.opacity = mx('moon'); halo.material.opacity = 0.3 * mx('stars'); mHalo.opacity = 0.45 - warm * 0.2;
    moon.position.set(NIGHT.sunP[0], NIGHT.sunP[1], NIGHT.sunP[2]).normalize().multiplyScalar(620); moon.lookAt(0, 0, 0); halo.position.copy(moon.position).multiplyScalar(1.03);
    if (G.grade) G.grade.uniforms.uWarm.value = warm;
    for (const l of W.fires) l.userData.base = FIRE * mx('fire');
  };
  // In the vault the only strong light is the Door's: the "sun" is moved behind the glass and
  // shines down the hall through the doorway, so the leading of the panes falls across the floor
  // and whoever stands in front of it is rim-lit. The camp's fires are switched off down there.
  W.applyGate = () => {
    const door = W.doorMode; for (const b of gateBanners) b.visible = !door; mRock.color.setHex(door ? 0x6f86b8 : 0xffffff); mBlock.color.setHex(door ? 0x8f9bb4 : 0xffffff); mStone.color.setHex(door ? 0x7c8698 : 0xb09a78); mGold.color.setHex(door ? 0x8f7a3c : 0xd9b24a); // and its gilding is old and dull, so the thin fillets don't sparkle as the camera moves // the Door's surround is the vault's cold stone, not the camp's sandstone
    endCliff.castShadow = !door; for (const l of W.fires) l.visible = !door && site === SITES.ruins; gateL.visible = site === SITES.ruins;
    for (const m of [mBlock, mStone, mGold, mDark, mIron]) m.shadowSide = door ? T.FrontSide : null; // the Door's surround is seen from its unlit side: cast its shadow from the faces toward the light, so the faces toward us lie well inside it (cast from themselves, they speckled)
    const k = door ? 13 : 36; sc.left = -k; sc.right = k; sc.top = k; sc.bottom = -k; sc.near = door ? -1 : 2; /* behind the light, to take in the backs of the Door's pillars, which now cast */ sc.updateProjectionMatrix(); sun.target.position.set(site.at[0], 0, site.at[1] + (door ? -19 : 0));
    if (door) { sun.color.setHex(0xd2efe9); sun.intensity = 2.3; sun.position.set(0, 4.14, -29.5); /* just behind the glass, so nothing outside the vault shadows it */ hemi.color.setHex(0x7284a8); hemi.groundColor.setHex(0x1c1d26); hemi.intensity = 0.95; }
    else if (W.setDawn) W.setDawn(W.dawn);
    // Under a roof (the halls): no ground or sky to light. The one strong light is the Door's, coming up
    // the stair at the far end and down the whole length of the halls, low, so columns and the dead throw long shadows toward him.
    const ind = !!site.indoor; ground.visible = !ind; scene.fog.near = ind ? 9 : 26;
    if (ind) {
      sun.color.setHex(0xbfe6e0); sun.intensity = 2.0; sun.position.set(site.at[0], 5.5, site.at[1] - 36); hemi.color.setHex(0x6878a0); hemi.groundColor.setHex(0x1c1d26); hemi.intensity = 0.85;
      scene.fog.color.setHex(0x0a0f18); scene.fog.far = 80;
      if (W.after) { sun.color.setHex(0xffe2b8); sun.intensity = 2.3; sun.position.set(site.at[0], 7.5, site.at[1] + 40); hemi.color.setHex(0xa39c90); hemi.groundColor.setHex(0x4a443c); hemi.intensity = 1.9; scene.fog.color.setHex(0x1c1a15); } // afterwards the only light is daylight, down the stair at the other end
      G.renderer.setClearColor(scene.fog.color); sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 0.5; sc.updateProjectionMatrix();
    }
  };
  // Which place the game is in: 'ruins' (the camp, the Narrows and the vault) or 'way' (the
  // waystation). o.sky overrides the site's pair of skies with one; o.muster adds the muster's dressing.
  W.setSite = (name, o = {}) => {
    site = SITES[name]; W.site = name; PLAYER_AREA = site.player; ALL_AREA = site.all; way.group.visible = name === 'way'; way.muster.visible = !!o.muster; hallsG.visible = name === 'halls'; W.after = !!o.after; warG.visible = !W.after; // after: the halls as they are once the Usurper is sealed and his years never happened
    halls.day.material.color.setRGB(...(W.after ? [1.7, 1.4, 1.0] : [0.047, 0.04, 0.035])); halls.glow.material.color.setRGB(...(W.after ? [0.02, 0.02, 0.025] : [0.2, 0.62, 0.56]));
    OBSTACLES.length = 0; OBSTACLES.push(...site.obs, ...(o.muster ? way.obsMuster : []));
    SA = SKIES[o.sky || site.sky[0]]; SB = SKIES[o.sky || site.sky[1]];
  };
  W.applyGate();
  W.setDawn(0);
  const tmp = V(0, 0, 0);
  W.update = (dt, t) => {
    for (let i = 0; i < W.flames.length; i++) {
      const f = W.flames[i], q = f.userData, p = q.ph;
      f.scale.set(q.w * (1 + Math.sin(t * 13 + p) * 0.16), q.h * (1 + Math.sin(t * 17 + p * 2) * 0.24 + Math.sin(t * 31 + p) * 0.08), q.w * (1 + Math.cos(t * 11 + p) * 0.16));
      f.rotation.y += dt * 3; f.rotation.z = Math.sin(t * 6.3 + p) * 0.11; f.rotation.x = Math.cos(t * 5.1 + p * 1.7) * 0.09;
      if (!q.spark || !f.parent.visible || (f.parent.parent && !f.parent.parent.visible)) continue; // no sparks off a fire that isn't there
      tmp.copy(f.position).y += q.h * 0.6;
      if (Math.random() < dt * 5) FX.sparks.emit(tmp, 1, 0.6, 0xff9a40, 1.1, { grav: -1.6, spread: 0.12, up: 0.6 });
      if (Math.random() < dt * 1.5) { tmp.y += q.h * 0.5; FX.dust.emit(tmp, 1, 0.25, 0x2c2826, 1.8, { grav: -1.1, spread: 0.08, up: 0.7 }); }
    }
    for (let i = 0; i < W.fires.length; i++) W.fires[i].intensity = (W.fires[i].userData.base || FIRE) * (0.86 + Math.sin(t * 9 + i * 3) * 0.08 + Math.sin(t * 23 + i) * 0.06);
    for (let i = 0; i < W.banners.length; i++) W.banners[i].rotation.x = Math.sin(t * 1.3 + i * 1.7) * 0.06 + Math.sin(t * 2.9 + i) * 0.02;
    gateMat.color.setRGB(0.3, 0.85, 0.78).multiplyScalar(0.85 + Math.sin(t * 2.2) * 0.15);
    W.flare = Math.max(0, (W.flare || 0) - dt * 0.5); // the Door sealing: ward and glass burn bright, then settle
    W.ward.opacity = Math.min(1, 0.55 + Math.sin(t * 2.2 - 0.8) * 0.25 + W.flare);
    if (W.doorMode) {
      const fl = W.flare, pulse = 0.5 + Math.sin(t * 1.3) * 0.12 + Math.sin(t * 2.9 + 1) * 0.05; gateL.intensity = 12 + fl * 30; sun.intensity = 2.3 + fl * 3;
      for (const m of W.vault.veined) m.emissiveIntensity = pulse + fl * 3.2; W.vault.glass.color.setScalar(0.9 + pulse * 0.25 + fl * 1.6); for (const l of W.vault.lights) l.intensity = l.userData.base * (0.85 + pulse * 0.3 + fl * 4);
    }
    if (site.indoor && W.after) { for (const m of W.vault.veined) m.emissiveIntensity = 0; }
    else if (site.indoor) { const fl = W.flare, pulse = 0.5 + Math.sin(t * 1.3) * 0.12 + Math.sin(t * 2.9 + 1) * 0.05; sun.intensity = 2.0 + fl * 3;
      for (const m of W.vault.veined) m.emissiveIntensity = pulse + fl * 3.2; W.vault.glass.color.setScalar(0.9 + pulse * 0.25 + fl * 1.6);
      for (const l of halls.cold) l.intensity = l.userData.base * (0.85 + pulse * 0.3 + fl * 4); halls.lights.forEach((l, i) => { l.intensity = l.userData.base * (0.86 + Math.sin(t * 9 + i * 3) * 0.08 + Math.sin(t * 23 + i) * 0.06); }); }
    if (doorG.visible && Math.random() < dt * 2.5) FX.sparks.emit(tmp.set((Math.random() - 0.5) * 3.4, 0.4 + Math.random() * 5, -27.3), 1, 0.35, 0x9ff0e0, 1.8, { grav: -0.4, spread: 0.3 }); // motes drifting off the glass
  };
  // waypoint marker
  const mk = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 5, 20, 1, true), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.3, 0.5), transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
  mk.visible = false; scene.add(mk);
  W.marker = (x, z) => { mk.visible = x != null; if (x != null) mk.position.set(x, 2.5, z); };
  G.level = W; return W;
}
