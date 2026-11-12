import * as THREE from 'three';
import { Batch, prismGeo } from './batch.js';
import { mulberry32, clamp, lerp, TAU } from './util.js';

// ---------------------------------------------------------------------------
// Layout (north = -z). Courtyard camp in front of a cliff; a ruined passage
// ("the Narrows") cuts north through the rock to the sanctum gate and the Mirror.
// Raiders come in from the open desert to the south.
// ---------------------------------------------------------------------------
export const COURT = { x0: -17, x1: 17, z0: -12, z1: 21 };
export const NARROWS = { x0: -3.4, x1: 3.4, z0: -32.5, z1: -10 };
export const MOUTH = { x: 0, z: -11.2 };
export const CAMPFIRE = { x: 7.5, z: -2.5 };
export const RING = { x: 0, z: 3.2, r: 4.2 };
export const OBSTACLES = [];

function rectDist(R, x, z) {
  const dx = Math.max(R.x0 - x, 0, x - R.x1);
  const dz = Math.max(R.z0 - z, 0, z - R.z1);
  return Math.hypot(dx, dz);
}
export const outsideDist = (x, z) => Math.min(rectDist(COURT, x, z), rectDist(NARROWS, x, z));

// Keep a circle of radius r inside the union of the courtyard and the Narrows.
export function projectWalkable(p, r) {
  const A = COURT, B = NARROWS;
  const inA = p.x >= A.x0 + r && p.x <= A.x1 - r && p.z >= A.z0 + r && p.z <= A.z1 - r;
  const inB = p.x >= B.x0 + r && p.x <= B.x1 - r && p.z >= B.z0 + r && p.z <= B.z1 - r;
  if (inA || inB) return false;
  const ax = clamp(p.x, A.x0 + r, A.x1 - r), az = clamp(p.z, A.z0 + r, A.z1 - r);
  const bx = clamp(p.x, B.x0 + r, B.x1 - r), bz = clamp(p.z, B.z0 + r, B.z1 - r);
  const da = (p.x - ax) ** 2 + (p.z - az) ** 2, db = (p.x - bx) ** 2 + (p.z - bz) ** 2;
  if (da <= db) { p.x = ax; p.z = az; } else { p.x = bx; p.z = bz; }
  return true;
}
export function pushObstacles(p, r) {
  for (const o of OBSTACLES) {
    const dx = p.x - o.x, dz = p.z - o.z;
    const d = Math.hypot(dx, dz), m = o.r + r;
    if (d < m && d > 1e-4) { p.x = o.x + (dx / d) * m; p.z = o.z + (dz / d) * m; }
  }
}
// camera may not enter rock
export function clampCamera(p) {
  if (p.z < -11.6) {
    p.x = clamp(p.x, -2.9, 2.9);
    p.z = Math.max(p.z, -32.8);
  }
  p.x = clamp(p.x, -17.2, 17.2);
  p.z = Math.min(p.z, 34);
  p.y = Math.max(p.y, 1.1);
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  rock: new THREE.DodecahedronGeometry(1, 0),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  flame: new THREE.ConeGeometry(1, 1, 5),
};

const NIGHT = {
  zenith: new THREE.Color(0x060a1a), horizon: new THREE.Color(0x2b3566), ground: new THREE.Color(0x141a33),
  fog: new THREE.Color(0x1a2140), fogNear: 24, fogFar: 125,
  hemiSky: new THREE.Color(0x8090c8), hemiGround: new THREE.Color(0x4a3828), hemiI: 1.7,
  sunCol: new THREE.Color(0xbfccff), sunI: 2.3, sunPos: new THREE.Vector3(-30, 50, 45),
};
const DAWN = {
  zenith: new THREE.Color(0x34508a), horizon: new THREE.Color(0xf0a06a), ground: new THREE.Color(0x8a5a4a),
  fog: new THREE.Color(0xc98f78), fogNear: 30, fogFar: 150,
  hemiSky: new THREE.Color(0xffd2b0), hemiGround: new THREE.Color(0x7a5038), hemiI: 2.1,
  sunCol: new THREE.Color(0xffb27a), sunI: 3.0, sunPos: new THREE.Vector3(55, 14, 30),
};

export function buildWorld(scene) {
  const rng = mulberry32(1234);
  const R = (a, b) => a + rng() * (b - a);
  const B = new Batch(99);
  const W = { flames: [], lights: {} };
  OBSTACLES.length = 0;

  // ---- ground: flat play area, dunes beyond
  const gg = new THREE.PlaneGeometry(240, 240, 80, 80);
  gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    const out = outsideDist(x, z);
    let h = 0;
    if (out > 0.5) {
      const k = Math.min(1, (out - 0.5) / 14);
      h = k * k * (3.2 + 2.2 * Math.sin(x * 0.07 + Math.cos(z * 0.05) * 2.2) + 1.4 * Math.cos(z * 0.11 - x * 0.05));
      if (z > 19 && Math.abs(x) < 22) h *= clamp((z - 32) / 24, 0, 1);
      if (z < -12) h += k * 6;
    }
    gp.setY(i, Math.max(0, h));
  }
  B.add(gg, 0xc29d68, undefined, undefined, undefined, 0.14);
  // trampled patches
  B.add(G.cyl8, 0xa98658, [RING.x, 0.012, RING.z], [0, 0.3, 0], [RING.r + 0.6, 0.02, RING.r + 0.6], 0.06);
  B.add(G.cyl8, 0x9c7a50, [CAMPFIRE.x, 0.014, CAMPFIRE.z], [0, 0, 0], [2.8, 0.02, 2.8], 0.06);
  B.add(G.box, 0xae8b5c, [0, 0.01, -4], [0, 0, 0], [3.6, 0.02, 14], 0.05);

  const ROCKS = [0x9c6a45, 0xa87650, 0x8a5b3a, 0xb2805a, 0x94643f];
  const rockCol = () => ROCKS[Math.floor(rng() * ROCKS.length)];
  const rock = (x, y, z, sx, sy, sz, tilt = 0.08) =>
    B.add(G.rock, rockCol(), [x, y, z], [R(-tilt, tilt), R(0, TAU), R(-tilt, tilt)], [sx, sy, sz], 0.22);

  // north cliff face either side of the Narrows
  for (const s of [-1, 1]) {
    let x = 4.7;
    while (x < 64) {
      const sx = R(2.2, 3.4), sz = R(2.2, 3.2), sy = R(4.5, 8.5), m = Math.max(sx, sz);
      const cx = x + m;
      rock(s * cx, sy * 0.5, -12.4 - m, sx, sy, sz, 0.06);
      rock(s * (cx + R(-1, 1)), sy * 0.9 + 2, -19 - R(0, 3), R(3.2, 4.6), R(6, 9), R(3.2, 4.6), 0.06);
      x = cx + m * R(0.55, 0.85);
    }
  }
  // canyon walls behind the ruin walls of the Narrows
  for (const s of [-1, 1]) {
    for (let z = -12; z > -48; z -= R(3, 4.2)) {
      const sx = R(2.4, 3.4), sz = R(2.6, 3.6), sy = R(7, 12), m = Math.max(sx, sz);
      rock(s * (4.7 + m + R(0, 1.2)), sy * 0.45, z, sx, sy, sz, 0.05);
    }
  }
  // courtyard east / west edges
  for (const s of [-1, 1]) {
    for (let z = -12; z < 32; z += R(3, 4.5)) {
      const sx = R(1.8, 3), sz = R(1.8, 3), sy = R(2.5, 6), m = Math.max(sx, sz);
      rock(s * (17.4 + m), sy * 0.4, z, sx, sy, sz, 0.1);
    }
  }
  // far mesas on the horizon
  for (let i = 0; i < 14; i++) {
    const a = R(-1.9, 1.9) + (i % 2 ? Math.PI : 0) * 0;
    const d = R(70, 105);
    const x = Math.sin(a) * d, z = Math.cos(a) * d + 10;
    const r = R(6, 13), h = R(6, 13);
    B.add(G.cyl6, rockCol(), [x, h / 2 - 2, z], [0, R(0, TAU), 0], [r, h, r * R(0.7, 1.2)], 0.2);
  }

  // ---- the Narrows: ruined walls, columns, lintels, floor
  const STONE = [0xb79b76, 0xa98d68, 0xc2a682];
  for (const s of [-1, 1]) {
    for (let z = -12; z > -33.5; z -= 2.4) {
      const h = R(4.4, 6.2);
      B.add(G.box, STONE[Math.floor(rng() * 3)], [s * 4.0, h / 2, z - 1.2], [0, 0, 0], [1.2, h, 2.4], 0.12);
    }
    for (let z = -12.8; z > -33; z -= 3.6) {
      B.add(G.cyl8, 0xcab08a, [s * 3.72, 2.7, z], [0, 0, 0], [0.34, 5.4, 0.34], 0.1);
      B.add(G.box, 0xb69a74, [s * 3.72, 5.5, z], [0, 0, 0], [0.9, 0.35, 0.9], 0.1);
      B.add(G.box, 0xb69a74, [s * 3.72, 0.15, z], [0, 0, 0], [0.8, 0.3, 0.8], 0.1);
    }
  }
  for (const z of [-16, -25]) B.add(G.box, 0xb39874, [0, 5.9, z], [0, 0, 0], [9.4, 0.9, 1.3], 0.1);
  for (let z = -10.8; z > -33; z -= 1.45)
    for (let x = -2.9; x <= 2.95; x += 1.45)
      B.add(G.box, rng() < 0.5 ? 0x9d8a6e : 0x8f7d62, [x + R(-0.05, 0.05), 0.025, z], [0, R(-0.05, 0.05), 0], [1.36, 0.05, 1.36], 0.08);

  // ---- sanctum gate and the Mirror
  B.add(G.box, 0xbfa27a, [-3.75, 4.4, -34], [0, 0, 0], [1.9, 8.8, 2.0]);
  B.add(G.box, 0xbfa27a, [3.75, 4.4, -34], [0, 0, 0], [1.9, 8.8, 2.0]);
  B.add(G.box, 0xb0936c, [0, 9.4, -34], [0, 0, 0], [9.8, 1.6, 2.4]);
  B.add(G.box, 0xc9ae86, [0, 10.45, -34], [0, 0, 0], [7.2, 0.5, 2.0]);
  B.add(G.box, 0x4f4034, [0, 0.03, -40], [0, 0, 0], [9, 0.06, 12]);
  B.add(G.box, 0x5e4c3b, [-4.9, 4.5, -40], [0, 0, 0], [1.2, 9, 12]);
  B.add(G.box, 0x5e4c3b, [4.9, 4.5, -40], [0, 0, 0], [1.2, 9, 12]);
  B.add(G.box, 0x4f3f31, [0, 4.5, -46.2], [0, 0, 0], [11, 9, 1.2]);
  B.add(G.box, 0x7d6a55, [0, 0.18, -42], [0, 0, 0], [5.2, 0.36, 3.4]);
  B.add(G.box, 0x8a765f, [0, 0.5, -42.4], [0, 0, 0], [4.0, 0.3, 2.4]);
  B.add(G.box, 0x4a3b2e, [0, 2.75, -42.9], [0, 0, 0], [3.2, 4.4, 0.5]);
  B.add(G.box, 0x101219, [0, 2.75, -42.62], [0, 0, 0], [2.6, 3.8, 0.12], 0.02);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x63d6c4, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  const mirrorGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.7), glowMat);
  mirrorGlow.position.set(0, 2.75, -42.5);
  scene.add(mirrorGlow);
  const wardMat = new THREE.MeshBasicMaterial({ color: 0x5fd0c0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ward = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 8.2), wardMat);
  ward.position.set(0, 4.1, -33.1);
  scene.add(ward);

  // ---- camp
  const TENT = prismGeo(1.5, 2.0, 3.2);
  const tent = (x, z, c1 = 0xd6c9aa, c2 = 0x2b3e66) => {
    const yaw = Math.atan2(RING.x - x, RING.z - z);
    B.add(TENT, c1, [x, 0, z], [0, yaw, 0], [1, 1, 1], 0.1);
    B.add(G.box, c2, [x + Math.sin(yaw) * 1.62, 0.66, z + Math.cos(yaw) * 1.62], [0, yaw, 0], [0.9, 1.3, 0.04], 0.04);
    B.add(G.cyl6, 0x5a3e28, [x, 2.15, z], [Math.PI / 2, yaw, 0, 'YXZ'], [0.05, 3.5, 0.05], 0.05);
    OBSTACLES.push({ x, z, r: 1.85 });
  };
  tent(-12.5, -6.5);
  tent(-13.2, 2.5, 0xcdbf9c);
  tent(-11.6, 11.2);
  tent(13.2, -7.2, 0xcdbf9c);
  tent(13.6, 3.4);
  tent(11.6, 11.6, 0xcdbf9c, 0x6b2228);

  // campfire: stones, logs, seats
  const cf = CAMPFIRE;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    B.add(G.rock, 0x6a625a, [cf.x + Math.sin(a) * 0.85, 0.1, cf.z + Math.cos(a) * 0.85], [rng() * 3, rng() * 3, rng() * 3], [0.22, 0.17, 0.22], 0.2);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3;
    B.add(G.cyl6, 0x3f2b1e, [cf.x, 0.2, cf.z], [Math.PI / 2 - 0.3, a, 0, 'YXZ'], [0.09, 1.25, 0.09], 0.15);
  }
  B.add(G.cyl8, 0x7a2a12, [cf.x, 0.05, cf.z], [0, 0, 0], [0.55, 0.08, 0.55], 0.1);
  OBSTACLES.push({ x: cf.x, z: cf.z, r: 0.95 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.6;
    const x = cf.x + Math.sin(a) * 2.3, z = cf.z + Math.cos(a) * 2.3;
    B.add(G.cyl6, 0x5b3f29, [x, 0.22, z], [Math.PI / 2, a + Math.PI / 2, 0, 'YXZ'], [0.22, 1.7, 0.22], 0.12);
    OBSTACLES.push({ x, z, r: 0.55 });
  }

  // sparring ring stones
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    B.add(G.rock, 0x8d8072, [RING.x + Math.sin(a) * RING.r, 0.08, RING.z + Math.cos(a) * RING.r], [rng() * 3, rng() * 3, 0], [0.2, 0.14, 0.2], 0.2);
  }

  // crates, barrels, weapon rack
  const crate = (x, z, s = 0.8, yaw = R(0, 1)) => {
    B.add(G.box, 0x7a5a38, [x, s / 2, z], [0, yaw, 0], [s, s, s], 0.12);
    B.add(G.box, 0x5e4229, [x, s + 0.001, z], [0, yaw, 0], [s * 0.96, 0.02, s * 0.2], 0.05);
    OBSTACLES.push({ x, z, r: s * 0.62 });
  };
  const barrel = (x, z) => {
    B.add(G.cyl8, 0x6b4a2c, [x, 0.5, z], [0, 0, 0], [0.38, 1.0, 0.38], 0.12);
    B.add(G.cyl8, 0x3e3a36, [x, 0.8, z], [0, 0, 0], [0.4, 0.06, 0.4], 0.05);
    B.add(G.cyl8, 0x3e3a36, [x, 0.2, z], [0, 0, 0], [0.4, 0.06, 0.4], 0.05);
    OBSTACLES.push({ x, z, r: 0.45 });
  };
  crate(-9.6, -3.4); crate(-9.9, -2.3, 0.6); barrel(-10.6, -4.4);
  crate(10.6, 7.6); crate(9.7, 8.2, 0.65); barrel(10.2, 0.4); barrel(10.9, 1.2);
  crate(-14.4, 7.2); barrel(-8.4, 14.6); crate(15.2, -1.4, 0.7);
  // weapon rack
  {
    const x = -6.6, z = -10.4;
    B.add(G.box, 0x5a3e28, [x - 0.9, 0.7, z], [0, 0, 0], [0.12, 1.4, 0.12]);
    B.add(G.box, 0x5a3e28, [x + 0.9, 0.7, z], [0, 0, 0], [0.12, 1.4, 0.12]);
    B.add(G.box, 0x5a3e28, [x, 1.3, z], [0, 0, 0], [1.9, 0.1, 0.1]);
    for (let i = 0; i < 5; i++) B.add(G.cyl6, 0x6e5034, [x - 0.7 + i * 0.35, 1.1, z + 0.15], [0.25, 0, 0.05 * (i - 2)], [0.03, 2.2, 0.03]);
    OBSTACLES.push({ x, z, r: 1.0 });
  }
  // banners flanking the Narrows
  for (const s of [-1, 1]) {
    const x = s * 6.2, z = -11.0;
    B.add(G.cyl6, 0x4a3524, [x, 2.4, z], [0, 0, 0], [0.07, 4.8, 0.07]);
    B.add(G.box, 0x223a6a, [x, 3.5, z], [0, 0, 0], [0.95, 1.9, 0.05], 0.06);
    B.add(G.box, 0xc9a440, [x, 4.25, z + 0.01], [0, 0, 0], [0.97, 0.12, 0.06], 0.04);
    B.add(G.box, 0xc9a440, [x, 3.1, z + 0.03], [0, Math.PI / 4, 0, 'XYZ'], [0.04, 0.4, 0.02], 0.02);
    OBSTACLES.push({ x, z, r: 0.25 });
  }
  // broken columns in the courtyard
  const column = (x, z) => {
    const h = R(1.4, 4.4);
    B.add(G.box, 0xa58c6a, [x, 0.2, z], [0, R(0, 1), 0], [1.25, 0.4, 1.25], 0.12);
    B.add(G.cyl8, 0xc4aa84, [x, 0.4 + h / 2, z], [0, R(0, 1), 0], [0.48, h, 0.48], 0.12);
    B.add(G.box, 0xb59b76, [x + 0.1, 0.5 + h, z], [R(-0.3, 0.3), R(0, 1), R(-0.3, 0.3)], [0.7, 0.32, 0.6], 0.12);
    OBSTACLES.push({ x, z, r: 0.72 });
  };
  column(-9.6, -9.9); column(10.6, -10.3); column(-12.8, 16.6); column(13.2, 15.6); column(-5.6, 17.8);
  // fallen column pieces
  B.add(G.cyl8, 0xbba17c, [4.8, 0.45, 16.6], [Math.PI / 2, 0.7, 0, 'YXZ'], [0.45, 2.6, 0.45], 0.12);
  OBSTACLES.push({ x: 4.4, z: 16.2, r: 0.6 }, { x: 5.4, z: 17.2, r: 0.6 });
  // south palisade (broken), gap in the middle
  for (let x = -17; x <= 17; x += 0.62) {
    if (Math.abs(x) < 7.4 || rng() < 0.18) continue;
    B.add(G.cone4, 0x6a4c30, [x, 0.75, 20.8 + R(-0.1, 0.1)], [-0.35, R(0, 1), R(-0.1, 0.1)], [0.11, 1.7, 0.11], 0.15);
  }

  // torch sconces at the mouth of the Narrows
  for (const s of [-1, 1]) {
    B.add(G.box, 0x3a2c22, [s * 4.0, 2.25, -11.86], [0, 0, 0], [0.18, 0.4, 0.18]);
    B.add(G.cyl6, 0x4a3524, [s * 4.0, 2.55, -11.8], [0.25, 0, 0], [0.06, 0.6, 0.06]);
  }

  const staticMesh = B.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  scene.add(staticMesh);

  // ---- flames
  const flameOuter = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameInner = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const makeFlame = (x, y, z, s) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const outer = new THREE.Mesh(G.flame, flameOuter);
    const inner = new THREE.Mesh(G.flame, flameInner);
    g.add(outer, inner);
    scene.add(g);
    W.flames.push({ g, outer, inner, s, seed: rng() * 10 });
    return g;
  };
  makeFlame(cf.x, 0.05, cf.z, 0.75);
  makeFlame(-4.0, 2.86, -11.72, 0.28);
  makeFlame(4.0, 2.86, -11.72, 0.28);

  // ---- atmosphere
  const sky = new THREE.Group();
  scene.add(sky);
  const skyGeo = new THREE.SphereGeometry(200, 24, 14);
  skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  const skyMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  skyMesh.renderOrder = -10;
  sky.add(skyMesh);
  const starPos = [];
  for (let i = 0; i < 520; i++) {
    const u = rng() * TAU, v = 0.06 + Math.pow(rng(), 0.7) * 0.94;
    const y = v, r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(u) * r * 185, y * 185, Math.sin(u) * r * 185);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xe8ecff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9;
  sky.add(stars);
  const moonDir = new THREE.Vector3(-0.42, 0.5, 0.76).normalize();
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xf4efdc, fog: false, transparent: true, depthWrite: false });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(6, 20), moonMat);
  moon.position.copy(moonDir).multiplyScalar(170);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -8;
  sky.add(moon);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x9fb0e8, fog: false, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(17, 24), haloMat);
  halo.position.copy(moonDir).multiplyScalar(172);
  halo.lookAt(0, 0, 0);
  halo.renderOrder = -8;
  sky.add(halo);

  scene.fog = new THREE.Fog(NIGHT.fog.clone(), NIGHT.fogNear, NIGHT.fogFar);
  scene.background = NIGHT.zenith.clone();
  const hemi = new THREE.HemisphereLight(NIGHT.hemiSky.clone(), NIGHT.hemiGround.clone(), NIGHT.hemiI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(NIGHT.sunCol.clone(), NIGHT.sunI);
  sun.position.copy(NIGHT.sunPos);
  scene.add(sun);
  const fire = new THREE.PointLight(0xff8840, 32, 15, 1.7);
  fire.position.set(cf.x, 1.3, cf.z);
  scene.add(fire);
  const torchL = new THREE.PointLight(0xffa050, 16, 11, 1.6);
  torchL.position.set(-3.6, 3.0, -11.2);
  const torchR = torchL.clone();
  torchR.position.x = 3.6;
  scene.add(torchL, torchR);
  const mirrorLight = new THREE.PointLight(0x5fd8c6, 28, 26, 1.5);
  mirrorLight.position.set(0, 4, -37.5);
  scene.add(mirrorLight);
  W.lights = { hemi, sun, fire, torchL, torchR, mirrorLight };

  const tmp = new THREE.Color();
  W.dawn = -1;
  W.setDawn = (k) => {
    if (Math.abs(k - W.dawn) < 1e-4) return;
    W.dawn = k;
    const pos = skyGeo.attributes.position, col = skyGeo.attributes.color;
    const z0 = tmp.clone(), h0 = tmp.clone(), g0 = tmp.clone();
    z0.copy(NIGHT.zenith).lerp(DAWN.zenith, k);
    h0.copy(NIGHT.horizon).lerp(DAWN.horizon, k);
    g0.copy(NIGHT.ground).lerp(DAWN.ground, k);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 200;
      let c;
      if (y >= 0) c = tmp.copy(h0).lerp(z0, Math.pow(y, 0.55));
      else c = tmp.copy(h0).lerp(g0, Math.min(1, -y * 4));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    scene.fog.color.copy(NIGHT.fog).lerp(DAWN.fog, k);
    scene.fog.near = lerp(NIGHT.fogNear, DAWN.fogNear, k);
    scene.fog.far = lerp(NIGHT.fogFar, DAWN.fogFar, k);
    scene.background.copy(z0);
    hemi.color.copy(NIGHT.hemiSky).lerp(DAWN.hemiSky, k);
    hemi.groundColor.copy(NIGHT.hemiGround).lerp(DAWN.hemiGround, k);
    hemi.intensity = lerp(NIGHT.hemiI, DAWN.hemiI, k);
    sun.color.copy(NIGHT.sunCol).lerp(DAWN.sunCol, k);
    sun.intensity = lerp(NIGHT.sunI, DAWN.sunI, k);
    sun.position.copy(NIGHT.sunPos).lerp(DAWN.sunPos, k);
    starMat.opacity = 0.9 * (1 - k);
    moonMat.opacity = 1 - k * 0.85;
    haloMat.opacity = 0.12 * (1 - k);
    W.lightScale = 1 - k * 0.7;
  };
  W.lightScale = 1;
  W.setDawn(0);

  W.update = (t, camPos) => {
    sky.position.copy(camPos);
    for (const f of W.flames) {
      const n = Math.sin(t * 9.1 + f.seed) * 0.5 + Math.sin(t * 15.3 + f.seed * 2) * 0.3 + Math.sin(t * 23.7 + f.seed * 3) * 0.2;
      const s = f.s;
      f.outer.scale.set(0.55 * s, (1.15 + 0.22 * n) * s, 0.55 * s);
      f.outer.position.y = 0.57 * s * (1 + 0.1 * n);
      f.outer.rotation.y = t * 1.3 + f.seed;
      f.inner.scale.set(0.3 * s, (0.75 + 0.15 * n) * s, 0.3 * s);
      f.inner.position.y = 0.36 * s;
      f.inner.rotation.y = -t * 2 + f.seed;
    }
    const L = W.lights, ls = W.lightScale;
    L.fire.intensity = (30 + 6 * Math.sin(t * 11.3) + 4 * Math.sin(t * 17.9)) * ls;
    L.torchL.intensity = (15 + 3 * Math.sin(t * 13.1 + 1)) * ls;
    L.torchR.intensity = (15 + 3 * Math.sin(t * 12.7 + 2)) * ls;
    glowMat.opacity = 0.26 + 0.1 * Math.sin(t * 1.7);
    wardMat.opacity = 0.05 + 0.03 * Math.sin(t * 2.3) + 0.015 * Math.sin(t * 7.1);
    L.mirrorLight.intensity = 26 + 5 * Math.sin(t * 1.7);
  };
  return W;
}
