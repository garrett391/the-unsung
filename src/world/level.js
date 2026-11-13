import * as T from 'three';
import { G } from '../core/game.js';
import { PI, clamp, lerp, rng } from '../core/util.js';
import { toon, TEX } from '../gfx/materials.js';
import { FX } from '../gfx/fx.js';

// Layout (north = +z). A walled camp in front of a cliff. Raiders come through the
// breach in the north wall and a gap in the east wall. South, a slot canyon
// ("the Narrows") runs through the rock to the sanctum gate.
export const COURT = { x0: -17, x1: 17, z0: -10, z1: 22 };
export const NARROWS = { x0: -2.8, x1: 2.8, z0: -27, z1: -9 };
export const BREACH = { x0: -3.6, x1: 3.6, z0: 21, z1: 36 };
export const EAST = { x0: 16, x1: 28, z0: -4.8, z1: -1.2 };
export const MOUTH = { x: 0, z: -8.6 };
export const RING = { x: 0, z: 6, r: 4.2 };
const FIRE = 16;
const PLAYER_AREA = [COURT, NARROWS], ALL_AREA = [COURT, NARROWS, BREACH, EAST];
export const OBSTACLES = [];

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
const inAny = (x, z, m) => ALL_AREA.some((R) => x >= R.x0 + m && x <= R.x1 - m && z >= R.z0 + m && z <= R.z1 - m);
// Pull the camera toward its target until it is no longer inside a wall.
export function clampCamera(p, look) {
  if (inAny(p.x, p.z, 0.35)) return;
  for (let k = 1; k <= 12; k++) {
    const u = 1 - k / 12, x = lerp(look.x, p.x, u), z = lerp(look.z, p.z, u);
    if (inAny(x, z, 0.35)) { p.x = x; p.z = z; p.y = lerp(look.y, p.y, 0.45 + 0.55 * u) + (1 - u) * 1.2; return; }
  }
}

const NIGHT = { zen: 0x04060f, hor: 0x1d2a55, fog: 0x121a36, hemiS: 0x5f7fe0, hemiG: 0x1c1a26, hemiI: 0.95, sun: 0x9fb6ff, sunI: 1.7, sunP: [-22, 34, 26], warm: 0 };
const DAWN = { zen: 0x35528e, hor: 0xf2a56c, fog: 0xc9907a, hemiS: 0xffd8b8, hemiG: 0x7a5038, hemiI: 1.7, sun: 0xffb27a, sunI: 3.2, sunP: [40, 14, 24], warm: 1 };

export function buildLevel() {
  const scene = G.scene, r = rng(1234), R = (a, b) => a + r() * (b - a);
  const W = { flames: [], fires: [], banners: [], dawn: 0 };
  const mBlock = toon(0xffffff, { map: TEX.block }), mRock = toon(0xffffff, { map: TEX.rock }), mStone = toon(0xb09a78), mDark = toon(0x4a3c30);
  const mWood = toon(0x5c4028), mCloth = toon(0x9c2428, { side: T.DoubleSide }), mGold = toon(0xd9b24a), mTent = toon(0xffffff, { map: TEX.canvas, side: T.DoubleSide });
  const add = (geo, mat, x, y, z, ry) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, ry) => add(new T.BoxGeometry(w, h, d), mat, x, y, z, ry);

  // ground: flat where you can walk, dunes beyond
  const gg = new T.PlaneGeometry(520, 520, 120, 120); gg.rotateX(-PI / 2); const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), dx = Math.max(-22 - x, 0, x - 30), dz = Math.max(-30 - z, 0, z - 26), d = Math.hypot(dx, dz);
    gp.setY(i, Math.min(1, d / 14) * (Math.sin(x * 0.045 + z * 0.02) * 3 + Math.sin(z * 0.06 - x * 0.03) * 2.2 + Math.sin(x * 0.13) * 0.8) - (d > 0 ? 0.2 : 0));
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
    box(x1 - x0, h, z1 - z0, mRock, (x0 + x1) / 2, h / 2 - 0.5, (z0 + z1) / 2);
    const n = Math.round(((x1 - x0) + (z1 - z0)) / 3.2);
    for (let i = 0; i < n; i++) { const s = R(1.6, 3.6); const m = add(new T.DodecahedronGeometry(s, 0), mRock, R(x0, x1), h - 0.6 + R(-0.6, 0.8), R(z0, z1)); m.rotation.set(R(0, 3), R(0, 3), 0); m.scale.y = 0.6; }
  };
  cliff(-46, -3.5, -52, -10.7, 11); cliff(3.5, 46, -52, -10.7, 11); cliff(-3.6, 3.6, -52, -28.6, 12.5);
  for (const s of [-1, 1]) for (let z = -11.5; z > -28; z -= 2.6) { const sz = R(0.8, 1.5); const m = add(new T.DodecahedronGeometry(sz, 0), mRock, s * (3.5 + R(-0.15, 0.25)), R(0.4, 6.5), z + R(-0.8, 0.8)); m.rotation.set(R(0, 3), R(0, 3), 0); }
  for (const s of [-1, 1]) { box(1.3, 6.6, 1.3, mBlock, s * 3.7, 3.3, -10.2); add(new T.CylinderGeometry(0.75, 0.75, 0.3, 10), mStone, s * 3.7, 6.75, -10.2); }
  box(9.0, 0.9, 1.5, mStone, 0, 7.3, -10.2);
  // sanctum gate at the end of the Narrows
  box(1.2, 7, 1.2, mBlock, -2.5, 3.5, -27.8); box(1.2, 7, 1.2, mBlock, 2.5, 3.5, -27.8); box(6.4, 1.1, 1.3, mStone, 0, 7.3, -27.8);
  const gateMat = new T.MeshBasicMaterial({ color: new T.Color(0.3, 0.85, 0.78), fog: false });
  const gate = new T.Mesh(new T.PlaneGeometry(3.8, 6.4), gateMat); gate.position.set(0, 3.3, -27.75); scene.add(gate);
  const gateL = new T.PointLight(0x7fe0d0, 12, 16, 2); gateL.position.set(0, 3, -25.5); scene.add(gateL);

  // columns, tents, crates, banners
  const column = (x, z, h, broken) => {
    add(new T.CylinderGeometry(0.46, 0.54, h, 12), mStone, x, h / 2, z); box(1.3, 0.35, 1.3, mBlock, x, 0.18, z);
    if (!broken) box(1.25, 0.32, 1.25, mBlock, x, h + 0.16, z);
    else { const d = add(new T.CylinderGeometry(0.46, 0.46, 1.5, 12), mStone, x + R(-1.4, 1.4), 0.46, z + R(1.2, 1.9)); d.rotation.z = PI / 2; d.rotation.y = R(0, 3); }
    OBSTACLES.push({ x, z, r: 0.75 });
  };
  for (const z of [-4, 3, 10, 17]) { column(-15.2, z, r() < 0.4 ? R(1.6, 3) : 5.4, false); column(15.2, z + 2.5, r() < 0.5 ? R(1.6, 3) : 5.4, r() < 0.5); }
  const tent = (x, z, ry) => {
    const t = add(new T.ConeGeometry(2.5, 2.9, 4, 1, true), mTent, x, 1.45, z, ry); t.castShadow = true;
    add(new T.CylinderGeometry(0.06, 0.06, 3.3, 6), mWood, x, 1.65, z); OBSTACLES.push({ x, z, r: 2.0 });
  };
  tent(-11.5, 13.5, 0.5); tent(11, 15.5, 0.9); tent(-11.5, -3.5, 0.2);
  for (let i = 0; i < 9; i++) { const x = [-8.5, 12.5, 9.5][i % 3] + R(-1.3, 1.3), z = [10.5, 11.5, -6.5][i % 3] + R(-1.3, 1.3), s = R(0.55, 0.85); box(s, s, s, mWood, x, s / 2, z, R(0, 1.5)); OBSTACLES.push({ x, z, r: s * 0.7 }); }
  const banner = (x, y, z, ry) => {
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
    const pole = new T.Mesh(new T.BoxGeometry(1.2, 0.08, 0.08), mWood); g.add(pole);
    const cl = new T.Mesh(new T.PlaneGeometry(1.0, 2.6, 1, 6), mCloth); cl.position.y = -1.32; cl.castShadow = true; g.add(cl);
    const dm = new T.Mesh(new T.BoxGeometry(0.34, 0.34, 0.03), mGold); dm.position.set(0, -1.0, 0.02); dm.rotation.z = PI / 4; g.add(dm);
    W.banners.push(g);
  };
  banner(-16.9, 4.6, 6, PI / 2); banner(-16.9, 4.6, 13.5, PI / 2); banner(16.9, 4.6, 8, -PI / 2); banner(-3.7, 6.0, -9.45, 0); banner(3.7, 6.0, -9.45, 0);

  // fire: braziers and a campfire. Flames are unlit and bright so they bloom.
  const mFlame = new T.MeshBasicMaterial({ color: new T.Color(1.9, 0.75, 0.2), transparent: true, opacity: 0.92, depthWrite: false, fog: false });
  const brazier = (x, z, lit) => {
    add(new T.CylinderGeometry(0.1, 0.2, 1.1, 8), mDark, x, 0.55, z); add(new T.CylinderGeometry(0.46, 0.24, 0.32, 10), mDark, x, 1.25, z);
    const f = new T.Mesh(new T.ConeGeometry(0.19, 0.6, 7), mFlame); f.position.set(x, 1.7, z); scene.add(f); W.flames.push(f); OBSTACLES.push({ x, z, r: 0.5 });
    if (lit) { const l = new T.PointLight(0xff8a3c, FIRE, 15, 2); l.position.set(x, 2.3, z); scene.add(l); W.fires.push(l); }
  };
  brazier(RING.x - 5.6, RING.z - 4.4, true); brazier(RING.x + 5.6, RING.z + 4.4, true); brazier(RING.x + 5.6, RING.z - 4.4, false); brazier(RING.x - 5.6, RING.z + 4.4, false);
  brazier(-4.9, -8.3, true); brazier(4.9, -8.3, false); brazier(-5.6, 20.6, false); brazier(5.6, 20.6, true);
  for (let i = 0; i < 5; i++) add(new T.CylinderGeometry(0.09, 0.09, 1.1, 6), mWood, 9 + Math.sin(i * 1.26) * 0.3, 0.18, -2.5 + Math.cos(i * 1.26) * 0.3).rotation.set(1.2, i * 1.26, 0);
  const cf = new T.Mesh(new T.ConeGeometry(0.3, 0.8, 7), mFlame); cf.position.set(9, 0.65, -2.5); scene.add(cf); W.flames.push(cf); OBSTACLES.push({ x: 9, z: -2.5, r: 0.7 });
  const cfl = new T.PointLight(0xff8a3c, FIRE, 15, 2); cfl.position.set(9, 1.6, -2.5); scene.add(cfl); W.fires.push(cfl);

  // far silhouettes
  const mFar = toon(0x2a2a40);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2 + R(0, 0.3), d = R(170, 250), h = R(18, 46); add(new T.CylinderGeometry(R(14, 30), R(26, 44), h, 7), mFar, Math.sin(a) * d, h / 2 - 3, Math.cos(a) * d, R(0, 3)).castShadow = false; }

  // sky, stars, moon
  const sg = new T.SphereGeometry(700, 24, 14); sg.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(sg.attributes.position.count * 3), 3));
  const sky = new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false })); scene.add(sky);
  const sp = new Float32Array(1100 * 3);
  for (let i = 0; i < 1100; i++) { const a = r() * PI * 2, e = Math.asin(r() * 0.96 + 0.03); sp[i * 3] = Math.cos(e) * Math.sin(a) * 650; sp[i * 3 + 1] = Math.sin(e) * 650; sp[i * 3 + 2] = Math.cos(e) * Math.cos(a) * 650; }
  const stg = new T.BufferGeometry(); stg.setAttribute('position', new T.BufferAttribute(sp, 3));
  const stars = new T.Points(stg, new T.PointsMaterial({ color: 0xdfe6ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false })); scene.add(stars);
  const moon = new T.Mesh(new T.CircleGeometry(26, 32), new T.MeshBasicMaterial({ color: new T.Color(1.5, 1.6, 1.9), fog: false, transparent: true })); scene.add(moon);

  const hemi = new T.HemisphereLight(NIGHT.hemiS, NIGHT.hemiG, NIGHT.hemiI); scene.add(hemi);
  const sun = new T.DirectionalLight(NIGHT.sun, NIGHT.sunI); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.near = 2; sc.far = 140; sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.05;
  sun.target.position.set(0, 0, 0); scene.add(sun); scene.add(sun.target);
  scene.fog = new T.Fog(NIGHT.fog, 26, 150);

  const cA = new T.Color(), cB = new T.Color(), cZ = new T.Color(), cH = new T.Color();
  const mixC = (a, b, u) => cA.set(a).lerp(cB.set(b), u);
  // u = 0 night, 1 dawn
  W.setDawn = (u) => {
    W.dawn = u; cZ.copy(mixC(NIGHT.zen, DAWN.zen, u)); cH.copy(mixC(NIGHT.hor, DAWN.hor, u));
    const p = sg.attributes.position, c = sg.attributes.color, t = new T.Color();
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 700; t.copy(cH).lerp(cZ, clamp(y * 2.2, 0, 1)); if (y < 0) t.multiplyScalar(0.6); c.setXYZ(i, t.r, t.g, t.b); }
    c.needsUpdate = true;
    scene.fog.color.copy(mixC(NIGHT.fog, DAWN.fog, u)); G.renderer.setClearColor(scene.fog.color);
    hemi.color.copy(mixC(NIGHT.hemiS, DAWN.hemiS, u)); hemi.groundColor.copy(mixC(NIGHT.hemiG, DAWN.hemiG, u)); hemi.intensity = lerp(NIGHT.hemiI, DAWN.hemiI, u);
    sun.color.copy(mixC(NIGHT.sun, DAWN.sun, u)); sun.intensity = lerp(NIGHT.sunI, DAWN.sunI, u);
    sun.position.set(lerp(NIGHT.sunP[0], DAWN.sunP[0], u), lerp(NIGHT.sunP[1], DAWN.sunP[1], u), lerp(NIGHT.sunP[2], DAWN.sunP[2], u)).multiplyScalar(1.6);
    stars.material.opacity = 1 - u; moon.material.opacity = 1 - u * 0.85;
    moon.position.set(NIGHT.sunP[0], NIGHT.sunP[1], NIGHT.sunP[2]).normalize().multiplyScalar(620); moon.lookAt(0, 0, 0);
    if (G.grade) G.grade.uniforms.uWarm.value = u;
    for (const l of W.fires) l.userData.base = FIRE * (1 - u * 0.7);
  };
  W.setDawn(0);
  W.update = (dt, t) => {
    for (let i = 0; i < W.flames.length; i++) {
      const f = W.flames[i]; f.scale.set(1 + Math.sin(t * 13 + i) * 0.16, 1 + Math.sin(t * 17 + i * 2) * 0.28, 1 + Math.cos(t * 11 + i) * 0.16); f.rotation.y += dt * 3;
      if (Math.random() < dt * 5) FX.sparks.emit(f.position, 1, 0.6, 0xff9a40, 1.1, { grav: -1.6, spread: 0.12, up: 0.6 });
    }
    for (let i = 0; i < W.fires.length; i++) W.fires[i].intensity = (W.fires[i].userData.base || FIRE) * (0.86 + Math.sin(t * 9 + i * 3) * 0.08 + Math.sin(t * 23 + i) * 0.06);
    for (let i = 0; i < W.banners.length; i++) W.banners[i].rotation.x = Math.sin(t * 1.3 + i * 1.7) * 0.06 + Math.sin(t * 2.9 + i) * 0.02;
    gateMat.color.setRGB(0.3, 0.85, 0.78).multiplyScalar(0.85 + Math.sin(t * 2.2) * 0.15);
  };
  // waypoint marker
  const mk = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 5, 20, 1, true), new T.MeshBasicMaterial({ color: new T.Color(1.6, 1.3, 0.5), transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
  mk.visible = false; scene.add(mk);
  W.marker = (x, z) => { mk.visible = x != null; if (x != null) mk.position.set(x, 2.5, z); };
  G.level = W; return W;
}
