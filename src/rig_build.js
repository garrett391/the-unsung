import * as THREE from 'three';
import { TAU } from './util.js';
import {
  cgeo, lathe, ellipsoid, roundedBox, extrude, sheet,
  texFabric, texMetal, texMail, texLeather, texSkin, texHair, texWood, texSun, texFace, texWrap, texMask,
} from './models.js';

// ---------------------------------------------------------------------------
// N64-style humanoids: rigid shaped segments per joint (like the era's models),
// Gouraud smooth shading and small painted textures. Local forward is +z, so a
// character's left side is +x. rig.side = +1 means the sword arm is on +x.
// ---------------------------------------------------------------------------
export const PALETTES = {
  captain: { skin: 0xc8946c, hair: 0x3b2618, brow: 0x2b1b12, iris: 0x4d6878, armor: 0x9aa4ae, tunic: 0x5a1a1e, tabard: 0x7d1f26, leather: 0x4a3222, sleeve: 0x6f757d, forearm: 0x9aa3ad, hand: 0x35271c, leg: 0x34323a, boot: 0x3a2a1e, cape: 0x1f2b4a, capeHem: 0x141c33, blade: 0xd6dde6, gold: 0xc29a45, wood: 0x5b3b24, iron: 0x6a7078, steel: 0xa9b1bb, scar: 0x2a1a14, field: 0x1d2a4f },
  squire: { skin: 0xdba57e, hair: 0x9a4a22, brow: 0x7a3a18, iris: 0x5b6a3a, armor: 0x8a6440, tunic: 0x56657a, tunicHem: 0x3c4658, leather: 0x5a3e2a, sleeve: 0x56657a, forearm: 0x7a5636, hand: 0xdba57e, leg: 0x45454e, boot: 0x4a3322, blade: 0xcfd6de, gold: 0x9a8458, wood: 0x8a6034, iron: 0x6a6f75, steel: 0x9aa1aa },
  raider: { skin: 0x8a5a3c, armor: 0xa6865a, tunic: 0x8f7048, leather: 0x4a3526, sleeve: 0x9a7a50, forearm: 0x3a2a20, hand: 0x7a4e34, leg: 0x5a4632, boot: 0x3b2c22, robe: 0xa6865a, robeDark: 0x6e5236, wrap: 0x2a1e1a, sash: 0x6a1e2a, glow: 0xffb347, blade: 0xc9c9c0, gold: 0x9a7a3a, wood: 0x4a3322 },
  shieldRaider: { skin: 0x8a5a3c, armor: 0x9a6b34, tunic: 0x6e5236, leather: 0x3e2c20, sleeve: 0x7a5c3a, forearm: 0x9a6b34, hand: 0x7a4e34, leg: 0x4a3a2a, boot: 0x3b2c22, robe: 0x7a5c3a, robeDark: 0x5a4028, wrap: 0x2a1e1a, sash: 0x6a1e2a, glow: 0xffb347, blade: 0xb8b4a8, gold: 0xb07c3a, bronze: 0xa8743a, wood: 0x5a3a22 },
  commander: { skin: 0x6e4a36, armor: 0x2e2232, tunic: 0x241a28, leather: 0x1e1620, sleeve: 0x2e2234, forearm: 0x3e2e44, hand: 0x5e3e2e, leg: 0x1e1620, boot: 0x1c1418, robe: 0x2c2032, robeDark: 0x1c1422, wrap: 0x161018, sash: 0x7a3a9a, glow: 0xc58cff, bone: 0xd8cfbf, blade: 0xbab2c8, gold: 0x7a5a32, wood: 0x2a1e18 },
  soldier: { skin: 0xc08a64, hair: 0x2a1c12, brow: 0x2a1c12, iris: 0x3d2c1e, armor: 0x7b818b, tunic: 0x223a6a, tabard: 0x223a6a, leather: 0x3e2c20, sleeve: 0x6f757e, forearm: 0x6f757e, hand: 0x3a2a1e, leg: 0x3a3a40, boot: 0x3a2a1e, steel: 0x9aa2ac, wood: 0x6b4a2e, blade: 0xcfd6de, gold: 0xc9a440 },
};
const SIDES = { captain: 1, squire: -1, raider: -1, shieldRaider: -1, commander: -1, soldier: -1 };
const SCALES = { captain: 1, squire: 0.93, raider: 0.98, shieldRaider: 1.05, commander: 1.2, soldier: 1 };

const PI = Math.PI;
const raggedHem = (bottom, amp = 0.035) => (v) => {
  if (v.y < bottom + 0.015) {
    const a = Math.atan2(v.x, v.z);
    v.y += amp * Math.sin(a * 7) + amp * 0.55 * Math.sin(a * 13 + 1);
  }
};
const scallop = (bottom) => (v) => {
  if (v.y < bottom + 0.015) v.y += 0.025 * Math.abs(Math.sin(Math.atan2(v.x, v.z) * 4));
};

// shared geometry
const G = {
  abdomen: () => cgeo('abdomen', () => lathe([[0.165, -0.04], [0.172, 0.06], [0.16, 0.16], [0.172, 0.27]], 10, { sx: 1.12, sz: 0.8 })),
  chest: () => cgeo('chest', () => lathe([[0.168, 0.2], [0.2, 0.3], [0.212, 0.41], [0.198, 0.5], [0.15, 0.57], [0.065, 0.615]], 10, { sx: 1.16, sz: 0.8, deform: (v) => { if (v.z > 0 && v.y > 0.27 && v.y < 0.5) v.z *= 1.08; } })),
  neck: () => cgeo('neck', () => lathe([[0.056, 0.54], [0.05, 0.7]], 7)),
  gorget: () => cgeo('gorget', () => lathe([[0.1, 0.545], [0.112, 0.575], [0.085, 0.625]], 9, { sx: 1.05 })),
  pelvis: () => cgeo('pelvis', () => ellipsoid(0.165, 0.1, 0.12, 9, 6)),
  shoulderBall: () => cgeo('shBall', () => ellipsoid(0.072, 0.07, 0.072, 7, 5)),
  upperArm: () => cgeo('uarm', () => lathe([[0.054, -0.31], [0.061, -0.2], [0.067, -0.08], [0.064, 0.0], [0.045, 0.045]], 7)),
  upperArmWide: () => cgeo('uarmW', () => lathe([[0.072, -0.32], [0.084, -0.2], [0.079, -0.06], [0.068, 0.03], [0.045, 0.06]], 7)),
  elbow: () => cgeo('elbow', () => ellipsoid(0.055, 0.055, 0.055, 7, 5)),
  forearm: () => cgeo('farm', () => lathe([[0.045, -0.27], [0.051, -0.2], [0.059, -0.08], [0.057, 0.0], [0.04, 0.03]], 7)),
  vambrace: () => cgeo('vamb', () => lathe([[0.056, -0.25], [0.061, -0.2], [0.069, -0.08], [0.066, -0.025]], 8)),
  palm: () => cgeo('palm', () => roundedBox(0.085, 0.1, 0.062, 0.65, 2)),
  thumb: () => cgeo('thumb', () => ellipsoid(0.02, 0.036, 0.02, 6, 4)),
  glovecuff: () => cgeo('gcuff', () => lathe([[0.055, -0.04], [0.067, 0.0], [0.06, 0.022]], 7)),
  thigh: () => cgeo('thigh', () => lathe([[0.062, -0.45], [0.072, -0.32], [0.084, -0.14], [0.083, 0.0], [0.07, 0.045]], 8)),
  thighWide: () => cgeo('thighW', () => lathe([[0.07, -0.45], [0.09, -0.3], [0.097, -0.12], [0.09, 0.0], [0.072, 0.05]], 8)),
  knee: () => cgeo('knee', () => ellipsoid(0.064, 0.064, 0.068, 7, 5)),
  kneeCop: () => cgeo('kcop', () => ellipsoid(0.074, 0.08, 0.052, 7, 5, { p0: PI / 2 - 1.25, pl: 2.5 })),
  shin: () => cgeo('shin', () => lathe([[0.052, -0.43], [0.058, -0.32], [0.07, -0.17], [0.065, -0.05], [0.06, 0.02]], 8)),
  bootCuff: () => cgeo('bcuff', () => lathe([[0.071, -0.15], [0.087, -0.07], [0.094, -0.02], [0.088, 0.0]], 8)),
  wrapBand: () => cgeo('wband', () => lathe([[0.062, -0.3], [0.072, -0.17], [0.066, -0.06]], 8)),
  foot: () => cgeo('foot', () => roundedBox(0.125, 0.09, 0.255, 0.7, 3, (v) => {
    if (v.z > 0) { v.y -= Math.max(0, v.y + 0.01) * (v.z / 0.128) * 0.55; v.x *= 1 - (v.z / 0.128) * 0.12; }
    if (v.y < -0.03) v.y = -0.03 + (v.y + 0.03) * 0.3;
  })),
  head: () => cgeo('head', () => ellipsoid(0.122, 0.145, 0.13, 12, 9, { deform: (v) => {
    if (v.y < 0) { const t = Math.min(1, -v.y / 0.145); v.x *= 1 - 0.3 * t; v.z *= 1 - 0.08 * t; }
    if (v.z > 0.095) v.z = 0.095 + (v.z - 0.095) * 0.55;
  } })),
  nose: () => cgeo('nose', () => { const g = new THREE.ConeGeometry(0.021, 0.052, 4); g.rotateY(PI / 4); g.rotateX(PI / 2 + 0.3); return g; }),
  ear: () => cgeo('ear', () => ellipsoid(0.017, 0.033, 0.024, 6, 4)),
  lock: () => cgeo('lock', () => lathe([[0.001, -0.1], [0.026, -0.03], [0.03, 0.0], [0.02, 0.02]], 5)),
};

export function makeRig(kind, opts = {}) {
  const P = { ...PALETTES[kind], ...(opts.palette || {}) };
  const mats = [];
  const cache = {};
  const M = (key, o = {}) => {
    const id = key + '|' + (o.id || '');
    if (cache[id]) return cache[id];
    const base = o.color ?? P[key] ?? 0xff00ff;
    let m;
    if (o.basic) m = new THREE.MeshBasicMaterial({ color: base, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
    else m = new THREE.MeshLambertMaterial({ color: o.map ? 0xffffff : base, map: o.map || null, flatShading: !!o.flat, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
    m.userData.flat = new THREE.Color(base);
    cache[id] = m;
    mats.push(m);
    return m;
  };
  const fab = (key, trim = null, o = {}) => M(key, { map: texFabric(P[key], trim == null ? null : P[trim] ?? trim, { emblem: o.emblem, hem: o.hem, trimH: o.trimH }), id: `fab${trim}${o.emblem ?? ''}${o.hem ? 'h' : ''}${o.double ? 'd' : ''}`, double: o.double });
  const met = (key, o = {}) => M(key, { map: texMetal(P[key], o), id: `met${o.rivets ? 'r' : ''}${o.double ? 'd' : ''}`, double: o.double, flat: o.flat });
  const mail = (key) => M(key, { map: texMail(P[key]), id: 'mail' });
  const lea = (key) => M(key, { map: texLeather(P[key]), id: 'lea' });
  const skin = () => M('skin', { map: texSkin(P.skin), id: 'skin' });
  const hairM = () => M('hair', { map: texHair(P.hair), id: 'hair' });
  const glow = () => M('glow', { basic: true, id: 'glow' });
  const add = (parent, g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    return mesh;
  };

  const side = SIDES[kind] ?? -1;
  const scale = opts.scale ?? SCALES[kind] ?? 1;
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const scaler = new THREE.Group();
  scaler.scale.setScalar(scale);
  if (kind === 'shieldRaider') { scaler.scale.x *= 1.08; scaler.scale.z *= 1.08; }
  root.add(scaler);
  const body = new THREE.Group();
  body.position.y = 0.55;
  scaler.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.37;
  body.add(hips);
  const torso = new THREE.Group();
  torso.rotation.order = 'YXZ';
  hips.add(torso);
  const head = new THREE.Group();
  head.position.y = 0.58;
  torso.add(head);

  const robed = kind === 'raider' || kind === 'shieldRaider' || kind === 'commander';

  // ---- torso
  const pickM = (map, dflt) => (map[kind] || dflt)();
  const abdomenM = pickM({ captain: () => fab('tunic'), squire: () => fab('tunic'), soldier: () => mail('armor') }, () => fab('robe'));
  const chestM = pickM({ captain: () => met('armor'), squire: () => lea('armor'), soldier: () => mail('armor'), shieldRaider: () => met('bronze') }, () => fab('robe'));
  add(torso, G.abdomen(), abdomenM);
  add(torso, G.chest(), chestM);
  add(torso, G.neck(), robed ? fab('wrap') : skin());
  add(hips, G.pelvis(), fab('leg'), 0, -0.04, 0);
  if (kind === 'captain' || kind === 'soldier') {
    add(torso, G.gorget(), met(kind === 'captain' ? 'steel' : 'armor'));
    const front = cgeo('tabFront', () => lathe([[0.226, -0.01], [0.207, 0.1], [0.224, 0.3], [0.222, 0.45]], 7, { phiStart: -0.52, phiLength: 1.04, sx: 1.14, sz: 0.86 }));
    const back = cgeo('tabBack', () => lathe([[0.226, -0.01], [0.207, 0.1], [0.224, 0.3], [0.222, 0.45]], 7, { phiStart: PI - 0.52, phiLength: 1.04, sx: 1.14, sz: 0.86 }));
    add(torso, front, fab('tabard', 'gold', { emblem: kind === 'captain' ? P.gold : undefined, double: true }));
    add(torso, back, fab('tabard', 'gold', { double: true }));
    add(torso, cgeo('beltWide', () => lathe([[0.232, -0.02], [0.24, 0.015], [0.232, 0.05]], 10, { sx: 1.08, sz: 0.86 })), lea('leather'));
    add(torso, cgeo('buckle', () => roundedBox(0.055, 0.05, 0.022, 0.4, 2)), met('gold'), 0, 0.015, 0.205);
  } else if (kind === 'squire') {
    add(torso, cgeo('belt', () => lathe([[0.18, -0.02], [0.188, 0.015], [0.18, 0.05]], 10, { sx: 1.12, sz: 0.83 })), lea('leather'));
    add(torso, cgeo('buckleS', () => roundedBox(0.045, 0.04, 0.02, 0.4, 2)), met('gold'), 0, 0.015, 0.152);
    add(torso, cgeo('pouch', () => roundedBox(0.075, 0.08, 0.045, 0.55, 2)), lea('leather'), -0.13, -0.02, 0.11);
    // tunic collar at the neck of the jerkin
    add(torso, cgeo('collar', () => lathe([[0.09, 0.55], [0.1, 0.58], [0.075, 0.625]], 9)), fab('tunic'));
  } else {
    add(torso, cgeo('scarf', () => lathe([[0.25, 0.47], [0.255, 0.53], [0.2, 0.6], [0.09, 0.64]], 10, { sx: 1.1, sz: 0.9, deform: (v) => { v.y += 0.012 * Math.sin(Math.atan2(v.x, v.z) * 5); } })), fab('robeDark'));
    add(torso, cgeo('sash', () => lathe([[0.18, -0.03], [0.192, 0.015], [0.182, 0.06]], 10, { sx: 1.12, sz: 0.84 })), fab('sash'));
    add(torso, cgeo('sashTail', () => sheet(0.07, 0.3, 1, 3, (v) => { v.z = -0.01 * (v.y + 0.15) ** 2; })), fab('sash', null, { double: true }), 0.14 * side, -0.12, 0.1, 0, 0.5 * side, 0.1);
  }

  // ---- head
  const faceStyle = { captain: 'stern', squire: 'young', soldier: 'plain' }[kind];
  const faceM = faceStyle
    ? M('skin', { map: texFace(P.skin, P.iris, P.brow, faceStyle), id: 'face' })
    : M('wrap', { map: texWrap(P.wrap), id: 'wrapface' });
  add(head, G.head(), faceM, 0, 0.19, 0);
  if (faceStyle) {
    add(head, G.nose(), skin(), 0, 0.168, 0.117);
    for (const s of [1, -1]) add(head, G.ear(), skin(), s * 0.12, 0.185, -0.005, 0, 0, -s * 0.15);
  }
  let scar = null;
  if (kind === 'captain') {
    add(head, cgeo('nape', () => ellipsoid(0.13, 0.13, 0.138, 10, 7, { p0: -PI / 2 - 1.1, pl: 2.2, t0: PI * 0.3, tl: PI * 0.42 })), hairM(), 0, 0.19, -0.004);
    const helm = cgeo('kettle', () => lathe([[0.238, 0.212], [0.17, 0.262], [0.156, 0.3], [0.15, 0.35], [0.126, 0.4], [0.075, 0.432], [0.001, 0.444]], 12));
    add(head, helm, met('steel', { double: true }));
    add(head, cgeo('comb', () => roundedBox(0.024, 0.05, 0.25, 0.5, 2, (v) => { v.y += -1.4 * v.z * v.z; })), met('steel'), 0, 0.445, 0);
    scar = new THREE.Group();
    add(scar, cgeo('patch', () => ellipsoid(0.036, 0.031, 0.014, 8, 5)), M('scar', { id: 'scar' }), -0.052, 0.196, 0.112, 0, -0.3, 0);
    add(scar, cgeo('strap', () => { const g = new THREE.TorusGeometry(0.133, 0.007, 3, 20); g.rotateX(PI / 2); return g; }), M('scar', { id: 'scar' }), 0, 0.205, 0, 0, 0, 0.22);
    scar.visible = false;
    head.add(scar);
  } else if (kind === 'squire') {
    add(head, cgeo('hairCap', () => ellipsoid(0.134, 0.126, 0.14, 12, 7, { t0: 0, tl: PI * 0.56, deform: (v) => { if (v.z > 0) v.y += 0.055 * (v.z / 0.14); } })), hairM(), 0, 0.205, -0.008);
    const locks = [
      [-0.075, 0.29, 0.1, 2.5, 0.25], [-0.03, 0.3, 0.115, 2.45, -0.05], [0.02, 0.3, 0.115, 2.55, 0.1], [0.07, 0.29, 0.1, 2.4, -0.25],
      [-0.12, 0.23, 0.03, 3.0, 0.3], [0.12, 0.23, 0.03, 3.0, -0.3],
      [-0.06, 0.24, -0.11, 3.6, 0.2], [0.05, 0.24, -0.115, 3.7, -0.2], [0.0, 0.31, -0.08, 3.9, 0.0],
    ];
    for (const [x, y, z, rx, rz] of locks) add(head, G.lock(), hairM(), x, y, z, rx, 0, rz);
  } else if (kind === 'soldier') {
    add(head, cgeo('nape', () => ellipsoid(0.13, 0.13, 0.138, 10, 7, { p0: -PI / 2 - 1.1, pl: 2.2, t0: PI * 0.3, tl: PI * 0.42 })), hairM(), 0, 0.19, -0.004);
    add(head, cgeo('cone', () => lathe([[0.158, 0.25], [0.152, 0.31], [0.127, 0.38], [0.07, 0.44], [0.001, 0.495]], 10)), met('steel'));
    add(head, cgeo('coneBrim', () => lathe([[0.176, 0.238], [0.182, 0.252], [0.16, 0.27]], 10)), met('steel', { double: true }));
    add(head, cgeo('nasal', () => roundedBox(0.026, 0.1, 0.02, 0.5, 2)), met('steel'), 0, 0.215, 0.128);
  } else {
    const tall = kind === 'commander' ? 1.12 : 1;
    const hood = cgeo('hood' + tall, () => lathe([[0.2, -0.05], [0.166, 0.04], [0.158, 0.16], [0.16, 0.26], [0.136, 0.35 * tall], [0.076, 0.41 * tall], [0.001, 0.43 * tall]], 11, { phiStart: 0.5, phiLength: TAU - 1.0 }));
    add(head, hood, fab('robeDark', null, { double: true }));
    if (kind !== 'commander') add(head, cgeo('hoodTip', () => lathe([[0.06, 0], [0.04, 0.08], [0.001, 0.17]], 6, { deform: (v) => { v.z -= v.y * v.y * 2.5; } })), fab('robeDark'), 0, 0.38, -0.07, -0.5, 0, 0);
    if (kind === 'commander') {
      add(head, cgeo('mask', () => ellipsoid(0.133, 0.155, 0.14, 10, 8, { p0: PI / 2 - 0.95, pl: 1.9, t0: PI * 0.15, tl: PI * 0.66, deform: (v) => { if (v.y < 0) v.x *= 1 - 0.25 * Math.min(1, -v.y / 0.15); if (v.z > 0.1) v.z = 0.1 + (v.z - 0.1) * 0.6; } })), M('bone', { map: texMask(P.bone, P.sash), id: 'mask', double: true }), 0, 0.19, 0.006);
      for (const s of [1, -1]) {
        add(head, cgeo('horn', () => lathe([[0.034, 0], [0.027, 0.1], [0.017, 0.21], [0.001, 0.32]], 6, { deform: (v) => { v.z -= v.y * v.y * 1.4; } })), met('gold'), s * 0.09, 0.4, -0.04, -0.25, 0, -s * 0.45);
        add(head, cgeo('eyeSlit', () => roundedBox(0.05, 0.012, 0.01, 0.2, 1)), glow(), s * 0.052, 0.198, 0.138, 0, 0, s * -0.2);
      }
    } else {
      for (const s of [1, -1]) add(head, cgeo('eyeGlow', () => roundedBox(0.032, 0.016, 0.01, 0.3, 1)), glow(), s * 0.05, 0.2, 0.122);
    }
    if (kind === 'shieldRaider') {
      add(head, cgeo('bronzeHelm', () => lathe([[0.18, 0.24], [0.176, 0.3], [0.146, 0.38], [0.075, 0.46], [0.001, 0.56]], 9)), met('bronze'));
      add(head, cgeo('bronzeBrim', () => lathe([[0.2, 0.226], [0.205, 0.242], [0.18, 0.258]], 9)), met('bronze', { double: true }));
    }
  }

  // ---- arms
  const arm = (sx) => {
    const sh = new THREE.Group();
    sh.rotation.order = 'YXZ';
    sh.position.set(sx * 0.31, 0.53, 0);
    torso.add(sh);
    const upperM = pickM({ captain: () => M('sleeve', { map: texMail(P.sleeve), id: 'mail' }), soldier: () => mail('sleeve') }, () => fab('sleeve'));
    add(sh, G.shoulderBall(), upperM);
    add(sh, robed ? G.upperArmWide() : G.upperArm(), upperM);
    if (kind === 'captain' || kind === 'soldier' || kind === 'shieldRaider') {
      const k = kind === 'shieldRaider' ? 'bronze' : 'steel';
      add(sh, cgeo('pauldron', () => ellipsoid(0.112, 0.1, 0.118, 9, 5, { tl: PI * 0.55 })), met(k, { double: true }), sx * 0.012, 0.025, 0, 0, 0, -sx * 0.3);
      if (kind === 'captain') add(sh, cgeo('pauldron2', () => ellipsoid(0.104, 0.09, 0.11, 9, 4, { t0: PI * 0.42, tl: PI * 0.2 })), met(k, { double: true }), sx * 0.01, 0.0, 0, 0, 0, -sx * 0.3);
    }
    const el = new THREE.Group();
    el.position.y = -0.29;
    sh.add(el);
    add(el, G.elbow(), upperM);
    const foreM = pickM({ captain: () => met('forearm'), squire: () => lea('forearm'), soldier: () => lea('forearm'), shieldRaider: () => met('bronze') }, () => fab('forearm'));
    add(el, G.forearm(), kind === 'captain' ? fab('tunic') : kind === 'shieldRaider' ? fab('sleeve') : foreM);
    if (kind === 'captain' || kind === 'shieldRaider') add(el, G.vambrace(), foreM);
    if (robed && kind !== 'shieldRaider') add(el, G.wrapBand(), fab('forearm'));
    const hand = new THREE.Group();
    hand.position.y = -0.29;
    el.add(hand);
    const gloved = kind === 'captain' || kind === 'soldier';
    const handM = gloved ? lea('hand') : skin();
    add(hand, G.palm(), robed ? M('hand', { map: texSkin(P.hand), id: 'hand' }) : handM, 0, -0.045, 0.004);
    add(hand, G.thumb(), robed ? M('hand', { map: texSkin(P.hand), id: 'hand' }) : handM, -sx * 0.042, -0.035, 0.028, 0.3, 0, sx * 0.5);
    if (gloved) add(hand, G.glovecuff(), lea('hand'));
    return { sh, el, hand };
  };
  const A1 = arm(side);
  const A2 = arm(-side);

  // ---- legs
  const leg = (sx) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.11, 0, 0);
    hips.add(hip);
    add(hip, robed ? G.thighWide() : G.thigh(), fab('leg'));
    const kn = new THREE.Group();
    kn.position.y = -0.44;
    hip.add(kn);
    add(kn, G.knee(), fab('leg'));
    if (kind === 'captain') add(kn, G.kneeCop(), met('steel', { double: true }), 0, 0.005, 0.03);
    const bootM = robed ? fab('boot') : lea('boot');
    add(kn, G.shin(), bootM);
    if (!robed) add(kn, G.bootCuff(), bootM);
    else add(kn, G.wrapBand(), fab('boot'), 0, -0.04, 0);
    add(kn, G.foot(), lea('boot'), 0, -0.445, 0.05);
    return { hip, kn };
  };
  const LL = leg(1);
  const LR = leg(-1);

  // ---- skirts
  if (kind === 'captain') add(hips, cgeo('tabSkirt', () => lathe([[0.275, -0.4], [0.24, -0.22], [0.2, -0.05], [0.18, 0.03]], 12, { sx: 1.1, sz: 0.92, deform: scallop(-0.4) })), fab('tabard', 'gold', { double: true }));
  if (kind === 'soldier') add(hips, cgeo('solSkirt', () => lathe([[0.262, -0.36], [0.232, -0.2], [0.2, -0.05], [0.18, 0.03]], 12, { sx: 1.1, sz: 0.92 })), fab('tabard', 'gold', { double: true }));
  if (kind === 'squire') add(hips, cgeo('tunSkirt', () => lathe([[0.25, -0.3], [0.222, -0.18], [0.19, -0.04], [0.178, 0.03]], 12, { sx: 1.08, sz: 0.92, deform: scallop(-0.3) })), fab('tunic', 'tunicHem', { double: true }));
  if (kind === 'raider') add(hips, cgeo('robeSkirt', () => lathe([[0.33, -0.62], [0.29, -0.45], [0.23, -0.2], [0.2, 0.0], [0.19, 0.06]], 12, { deform: raggedHem(-0.62) })), fab('robe', null, { hem: true, double: true }));
  if (kind === 'shieldRaider') add(hips, cgeo('robeShort', () => lathe([[0.3, -0.42], [0.25, -0.25], [0.2, 0.0], [0.19, 0.06]], 12, { deform: raggedHem(-0.42, 0.025) })), fab('robe', null, { hem: true, double: true }));
  if (kind === 'commander') add(hips, cgeo('robeLong', () => lathe([[0.37, -0.86], [0.31, -0.6], [0.24, -0.3], [0.2, 0.0], [0.19, 0.06]], 12, { deform: raggedHem(-0.86, 0.04) })), fab('robe', 'sash', { hem: true, double: true, trimH: 6 }));

  // ---- cape
  let cape = null;
  if (kind === 'captain' || kind === 'commander') {
    cape = new THREE.Group();
    cape.position.set(0, 0.56, -0.15);
    torso.add(cape);
    const tattered = kind === 'commander';
    const L = tattered ? 0.98 : 0.84;
    const g = cgeo('cape' + kind, () => {
      const s = sheet(0.5, L, 4, 6, (v) => {
        v.y -= L / 2;
        const t = -v.y / L;
        v.x *= 1 + t * 0.4;
        v.z = 0.06 * (v.x / 0.25) ** 2 - 0.04 * t;
        if (tattered && t > 0.9) v.y += 0.06 * Math.sin(v.x * 40) - 0.02;
      });
      return s;
    });
    add(cape, g, tattered ? fab('robeDark', 'sash', { double: true, trimH: 5 }) : fab('cape', 'capeHem', { double: true, trimH: 6 }));
  }

  // ---- weapons
  const bladeM = () => M('blade', { map: texMetal(P.blade), id: 'blade', flat: true });
  let weapon = null;
  const holder = (hand) => { const w = new THREE.Group(); w.position.y = -0.045; hand.add(w); return w; };
  if (kind === 'captain' || kind === 'squire') {
    const len = kind === 'captain' ? 0.86 : 0.7;
    const w = holder(A1.hand);
    add(w, cgeo('grip', () => lathe([[0.019, -0.09], [0.022, 0], [0.019, 0.09]], 6)), lea('leather'));
    add(w, cgeo('pommel', () => ellipsoid(0.031, 0.029, 0.031, 7, 5)), met('gold'), 0, 0.11, 0);
    add(w, cgeo('xguard', () => roundedBox(0.25, 0.034, 0.052, 0.5, 2, (v) => { v.y += 0.6 * v.x * v.x; })), met('gold'), 0, -0.1, 0);
    add(w, cgeo('blade' + len, () => lathe([[0.001, -0.24 - len], [0.035, -0.1 - len], [0.039, -0.4], [0.037, -0.12]], 4, { sz: 0.24 })), bladeM());
    weapon = { group: w };
  } else if (kind === 'soldier') {
    const w = new THREE.Group();
    A1.hand.add(w);
    add(w, cgeo('pole', () => lathe([[0.021, -0.85], [0.024, 0.5], [0.022, 1.45]], 6)), M('wood', { map: texWood(P.wood), id: 'wood' }));
    add(w, cgeo('spearTip', () => lathe([[0.024, 1.43], [0.05, 1.56], [0.001, 1.8]], 4, { sz: 0.35 })), bladeM());
    weapon = { group: w };
  } else if (kind === 'raider') {
    const w = holder(A1.hand);
    add(w, cgeo('rgrip', () => lathe([[0.018, -0.08], [0.02, 0.08]], 6)), lea('leather'));
    add(w, cgeo('rguard', () => roundedBox(0.16, 0.03, 0.045, 0.5, 2)), met('gold'), 0, -0.09, 0);
    add(w, cgeo('scimitar', () => {
      const N = 9, e = [], s = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, y = -0.1 - 0.84 * t, xc = 0.17 * t * t;
        const wd = (0.06 + 0.04 * Math.sin(PI * t * 0.9)) * (1 - t ** 5);
        e.push([xc + wd * 0.62, y]);
        s.push([xc - wd * 0.38, y]);
      }
      return extrude([...e, ...s.reverse()], 0.016);
    }), bladeM());
    weapon = { group: w };
  } else if (kind === 'shieldRaider') {
    const w = holder(A1.hand);
    add(w, cgeo('axePole', () => lathe([[0.024, -0.66], [0.026, 0.12]], 6)), M('wood', { map: texWood(P.wood), id: 'wood' }));
    add(w, cgeo('axeHead', () => { const g = extrude([[0, 0.06], [0.1, 0.12], [0.2, 0.15], [0.21, 0.0], [0.2, -0.15], [0.1, -0.12], [0, -0.06]], 0.025); g.rotateY(-PI / 2); return g; }), bladeM(), 0, -0.56, 0);
    weapon = { group: w };
  } else if (kind === 'commander') {
    const w = holder(A1.hand);
    add(w, cgeo('glPole', () => lathe([[0.027, -1.4], [0.031, 0.5]], 6)), M('wood', { map: texWood(P.wood), id: 'wood' }));
    add(w, cgeo('glBand', () => lathe([[0.042, -1.42], [0.046, -1.36], [0.04, -1.32]], 6)), glow());
    add(w, cgeo('glBlade', () => {
      const N = 8, e = [], s = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, y = -1.4 - 0.62 * t, xc = 0.2 * t * t;
        const wd = (0.07 + 0.05 * Math.sin(PI * t)) * (1 - t ** 4);
        e.push([xc + wd * 0.7, y]);
        s.push([xc - wd * 0.3, y]);
      }
      return extrude([...e, ...s.reverse()], 0.02);
    }), bladeM());
    weapon = { group: w };
  }

  // ---- shields
  let shieldPivot = null, shieldType = null;
  if (kind === 'captain' || kind === 'squire') {
    const r = kind === 'captain' ? 0.34 : 0.27;
    shieldPivot = new THREE.Group();
    torso.add(shieldPivot);
    const bodyG = cgeo('shield' + r, () => { const g = lathe([[r, -0.03], [r + 0.006, 0.0], [r * 0.95, 0.025], [r * 0.7, 0.048], [r * 0.35, 0.062], [0.001, 0.066]], 14); g.rotateX(PI / 2); return g; });
    const faceTex = kind === 'captain' ? texSun(P.field, P.gold, P.iron) : texWood(P.wood);
    add(shieldPivot, bodyG, M('shieldFace', { map: faceTex, id: 'shf', color: kind === 'captain' ? P.field : P.wood }));
    add(shieldPivot, cgeo('shieldBack' + r, () => { const g = new THREE.CircleGeometry(r, 14); g.rotateY(PI); g.translate(0, 0, -0.028); return g; }), M('shieldBack', { map: texWood(P.wood), id: 'shb', color: P.wood }));
    add(shieldPivot, cgeo('rim' + r, () => new THREE.TorusGeometry(r, 0.022, 5, 20)), met('iron'));
    add(shieldPivot, cgeo('boss', () => ellipsoid(0.07, 0.07, 0.05, 9, 6, { tl: PI * 0.5, deform: (v) => { const y = v.y; v.y = -v.z; v.z = y; } })), met(kind === 'captain' ? 'gold' : 'iron'), 0, 0, 0.05);
    shieldType = 'round';
  } else if (kind === 'shieldRaider') {
    shieldPivot = new THREE.Group();
    torso.add(shieldPivot);
    add(shieldPivot, cgeo('tower', () => { const g = lathe([[0.62, -0.47], [0.62, 0.43]], 6, { phiStart: -0.46, phiLength: 0.92 }); g.translate(0, -0.02, -0.57); return g; }), met('bronze', { double: true, rivets: true }));
    add(shieldPivot, cgeo('towerBoss', () => ellipsoid(0.08, 0.08, 0.05, 8, 5, { tl: PI * 0.5, deform: (v) => { const y = v.y; v.y = -v.z; v.z = y; } })), met('gold'), 0, -0.03, 0.05);
    shieldType = 'tower';
  }

  const rig = {
    kind, side, scale, root, scaler, body, hips, torso, head,
    shS: A1.sh, elS: A1.el, handS: A1.hand, shO: A2.sh, elO: A2.el, handO: A2.hand,
    hipL: LL.hip, knL: LL.kn, hipR: LR.hip, knR: LR.kn,
    shieldPivot, shieldType, cape, weapon, scar, mats,
    bladeMat: cache['blade|blade'] || null,
  };
  return rig;
}
