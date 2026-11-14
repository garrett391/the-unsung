import * as T from 'three';
import { PI, rng } from '../core/util.js';
import { toon, TEX } from '../gfx/materials.js';
import { bakeFigure } from '../actors/rig.js';
import { PZ, P } from '../actors/anim.js';
import { LOOKS } from '../actors/data.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The halls above the vault (prologue; docs/story.md): the way down to the Glass Door, where
// the many who tried made their stand. Three spaces on one axis, walked from north to south:
//   the gallery   a long barrel-vaulted hall, lined with the dead of both sides
//   the rotunda   a domed chamber with a side passage east and west, where the Usurper's guard come from
//   the descent   a narrower hall, thick with glass, ending at the head of the stair to the vault
// It is built from the vault's own kit (level.js: dressed stone, paving, glass veins and crystals),
// so it reads as the same building, and the glass thickens the nearer the Door. Local coordinates:
// x east, z north, the gallery's entrance at 0; everything is placed in the world at HALLS.
export const HALLS = { x: -110, z: 0 };
const R = (x0, x1, z0, z1) => ({ x0: HALLS.x + x0, x1: HALLS.x + x1, z0: HALLS.z + z0, z1: HALLS.z + z1 });
export const GALLERY = R(-3.6, 3.6, -31.3, 1.4), ROTUNDA = R(-8, 8, -46, -30), DESCENT = R(-2.6, 2.6, -57.6, -44.7), PASS_E = R(6.7, 12.4, -39.8, -36.2), PASS_W = R(-12.4, -6.7, -39.8, -36.2);

PZ.sit = P({ hips: [-0.32, 0, 0], pos: [0, -0.77, 0], spine: [0.2], chest: [0.12], neck: [0.5, 0.25, 0.1], thL: [-1.22, 0, 0.12], knL: [0.1], anL: [0.35], thR: [-1.0, 0, -0.2], knR: [1.05], anR: [0.1],
  shL: [-0.2, -1.05, 0], elL: [-1.5], shR: [0.2, 0, -0.32], elR: [-0.25], haR: [0.9], shield: [-1.3] }); // slumped against a column, a hand pressed to the wound
PZ.sitUp = P({ neck: [-0.12, 0.5, 0], spine: [0.1], chest: [0.05] }, PZ.sit); // the head lifted to speak
PZ.sitDead = P({ neck: [0.75, -0.2, 0.25], spine: [0.3], shL: [0.25, 0, 0.3], elL: [-0.3] }, PZ.sit); // and gone: the head down, the hand fallen from the wound

export function buildHalls(scene, kit) {
  const obs = [], q = rng(57), Q = (a, b) => a + q() * (b - a), X = (x) => HALLS.x + x, Z = (z) => HALLS.z + z;
  const { tex, ashlar, paving, veinTex, vmat, cluster, shard, mVault, mVaultD, mInside, mIron, still } = kit;
  const add = (geo, mat, x, y, z, ry) => { const m = new T.Mesh(geo, mat); m.position.set(X(x), y, Z(z)); if (ry) m.rotation.y = ry; m.castShadow = m.receiveShadow = !!mat.isMeshToonMaterial; scene.add(m); return m; };
  const block = (x, z, r) => obs.push({ x: X(x), z: Z(z), r });
  const V2 = (a, b) => new T.Vector2(a, b), mStoneD = toon(0x4f5666, { map: tex(ashlar, 1.2, 1.2) });
  const capG = new T.LatheGeometry([[0.3, 0], [0.31, 0.08], [0.36, 0.2], [0.46, 0.3], [0.48, 0.42]].map(([a, b]) => V2(a, b)), 18);
  const baseG = new T.LatheGeometry([[0.5, 0], [0.5, 0.22], [0.44, 0.28], [0.42, 0.36], [0.38, 0.42], [0.4, 0.5], [0.34, 0.58]].map(([a, b]) => V2(a, b)), 18);
  const veins = (len, count, seed) => veinTex(1024, 256, count, seed);
  const floorVein = (count, seed) => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 1024; const g = cv.getContext('2d'); g.translate(0, 1024); g.rotate(-PI / 2); g.drawImage(veinTex(1024, 256, count, seed).image, 0, 0);
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };

  // A barrel-vaulted hall running from z0 (north) to z1 (south): paved floor, dressed walls, half-columns
  // carrying ribs. The veins are painted to run out from the south end, where the Door is.
  const hall = (z0, z1, hw, spr, o) => {
    const len = z0 - z1, zc = (z0 + z1) / 2;
    const fl = add(new T.PlaneGeometry(hw * 2, len), vmat(tex(paving, hw / 1.45, len / 2.9), floorVein(o.veins, o.seed)), 0, 0.012, zc); fl.rotation.x = -PI / 2; still(fl);
    for (const sd of [-1, 1]) {
      const g = new T.PlaneGeometry(len, spr + 0.3); if (sd > 0) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
      still(add(g, vmat(tex(ashlar, len / 3.9, (spr + 0.3) / 2.6), veins(len, o.veins, o.seed + 1 + sd)), sd * hw, (spr + 0.3) / 2, zc, -sd * PI / 2));
      still(add(new T.CylinderGeometry(0.13, 0.13, len, 10), mVault, sd * hw, spr, zc)).rotation.x = PI / 2;
      still(add(new T.CylinderGeometry(0.16, 0.16, len, 10), mVaultD, sd * hw, 0.1, zc)).rotation.x = PI / 2;
    }
    { const g = new T.CylinderGeometry(hw + 0.05, hw + 0.05, len, 28, 1, true, 0, PI); g.rotateZ(PI / 2); g.rotateY(PI / 2); still(add(g, vmat(tex(ashlar, len / 3.9, 2.4), null, { side: T.BackSide }), 0, spr, zc)); }
    const shaftG = new T.CylinderGeometry(0.3, 0.34, spr - 1.0, 18), ribG = new T.TorusGeometry(hw - 0.02, 0.2, 10, 30, PI);
    for (const z of o.bays) {
      for (const sd of [-1, 1]) { add(shaftG, mVault, sd * hw, 0.58 + (spr - 1.0) / 2, z); add(capG, mVault, sd * hw, spr - 0.42, z); add(baseG, mVaultD, sd * hw, 0, z); }
      still(add(ribG, mVault, 0, spr, z));
    }
  };
  // A flat wall `w` wide and `h` high with an arched opening cut in it (half-width hw, springing spr), standing at (x, z) and turned by ry.
  const wall = (w, h, hw, spr, x, z, ry, mat) => {
    const s = new T.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
    if (hw) { const hl = new T.Path(); hl.moveTo(-hw, 0); hl.lineTo(hw, 0); hl.lineTo(hw, spr); hl.absarc(0, spr, hw, 0, PI, false); hl.lineTo(-hw, 0); s.holes.push(hl); }
    const m = still(add(new T.ShapeGeometry(s, 20), mat, x, 0, z, ry));
    if (hw) { const a = still(add(new T.TorusGeometry(hw + 0.12, 0.17, 8, 24, PI), mVault, x, spr, z, ry)); a.position.x += Math.sin(ry || 0) * 0.04; a.position.z += Math.cos(ry || 0) * 0.04; } // a moulding round the arch
    return m;
  };
  const mWall = () => toon(0xffffff, { map: tex(ashlar, 1 / 3.9, 1 / 2.6) }); // for shape walls, whose texture coordinates are in metres

  let day, glow; // the stair he came down by (dark; daylight once the war is undone) and the stair to the vault (the Door's light; dark afterwards)
  // ---- the gallery
  const GH = 3.6, GS = 4.6;
  hall(1.4, -30, GH, GS, { veins: 7, seed: 31, bays: [-2.5, -7.5, -12.5, -17.5, -22.5, -27.5] });
  { // the north end: the stair he came down, dark
    still(add(new T.PlaneGeometry(GH * 2, GS + GH + 0.4), toon(0xffffff, { map: tex(ashlar, 1.8, 3.2) }), 0, (GS + GH + 0.4) / 2, 1.4, PI));
    const sp = new T.Shape(); sp.moveTo(-1.1, 0); sp.lineTo(1.1, 0); sp.lineTo(1.1, 2.4); sp.absarc(0, 2.4, 1.1, 0, PI); sp.lineTo(-1.1, 0);
    day = new T.Mesh(new T.ShapeGeometry(sp, 16), new T.MeshBasicMaterial({ color: 0x0c0a09, fog: false })); day.position.set(X(0), 0.04, Z(1.37)); day.rotation.y = PI; scene.add(day);
    still(add(new T.TorusGeometry(1.22, 0.17, 8, 22, PI), mVault, 0, 2.4, 1.35)); for (const sd of [-1, 1]) add(new T.CylinderGeometry(0.17, 0.17, 2.4, 12), mVault, sd * 1.22, 1.2, 1.35);
  }
  // ---- the rotunda: four walls with their openings, a ceiling with a dome let into it, four standing columns
  const RW = 8, RH = 8.9, RC = -38;
  { const fl = add(new T.PlaneGeometry(RW * 2, 16), vmat(tex(paving, 5.5, 5.5), floorVein(16, 44)), 0, 0.012, RC); fl.rotation.x = -PI / 2; still(fl); }
  wall(RW * 2, RH, GH, GS, 0, -30, PI, mWall()); wall(RW * 2, RH, 2.6, 4.0, 0, -46, 0, mWall());
  wall(16, RH, 1.6, 2.5, RW, RC, -PI / 2, mWall()); wall(16, RH, 1.6, 2.5, -RW, RC, PI / 2, mWall());
  { const s = new T.Shape(); s.moveTo(-RW, -8); s.lineTo(RW, -8); s.lineTo(RW, 8); s.lineTo(-RW, 8); s.lineTo(-RW, -8); const h = new T.Path(); h.absarc(0, 0, 6.2, 0, PI * 2, true); s.holes.push(h);
    const c = still(add(new T.ShapeGeometry(s, 40), mWall(), 0, RH, RC)); c.rotation.x = PI / 2;
    const dome = still(add(new T.SphereGeometry(6.2, 36, 12, 0, PI * 2, 0, PI / 2), vmat(tex(ashlar, 6, 2), null, { side: T.BackSide }), 0, RH, RC)); dome.scale.y = 0.62;
    still(add(new T.TorusGeometry(6.2, 0.24, 10, 48), mVault, 0, RH, RC)).rotation.x = PI / 2;
    for (let i = 0; i < 8; i++) { const a = i * PI / 4, rib = still(add(new T.TorusGeometry(6.1, 0.13, 6, 16, PI / 2), mVault, 0, RH, RC)); rib.scale.y = 0.62; rib.rotation.y = a; } // ribs up to the crown
    add(new T.CylinderGeometry(0.5, 0.7, 0.3, 12), mVaultD, 0, RH + 6.2 * 0.62 - 0.2, RC);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = sx * 4.7, z = RC + sz * 4.7, broken = sx > 0 && sz > 0, h = broken ? 2.6 : RH - 1.0;
      add(new T.CylinderGeometry(0.42, 0.48, h, 20), mVault, x, 0.58 + h / 2, z); add(baseG, mVaultD, x, 0, z).scale.setScalar(1.35);
      if (!broken) add(capG, mVault, x, RH - 0.56, z).scale.setScalar(1.35);
      else { const drum = add(new T.CylinderGeometry(0.42, 0.42, 2.6, 20), mVault, x - 1.9, 0.42, z + 1.5, 0.5); drum.rotation.z = PI / 2; block(x - 1.9, z + 1.5, 1.0); add(new T.CylinderGeometry(0.4, 0.42, 1.3, 20), mVault, x + 1.3, 0.4, z - 1.6, 2.1).rotation.z = PI / 2; }
      block(x, z, 0.72); }
    for (const sd of [-1, 1]) still(add(new T.CylinderGeometry(0.16, 0.16, 16, 10), mVaultD, sd * RW, 0.1, RC)).rotation.x = PI / 2;
    still(add(new T.CylinderGeometry(0.14, 0.14, 16, 10), mVault, 0, RH - 0.1, -30.05)).rotation.z = PI / 2; still(add(new T.CylinderGeometry(0.14, 0.14, 16, 10), mVault, 0, RH - 0.1, -45.95)).rotation.z = PI / 2;
  }
  // the side passages: short, unlit, ending in the dark
  for (const sd of [-1, 1]) {
    const x0 = sd * RW, x1 = sd * 12.6, xc = (x0 + x1) / 2, len = Math.abs(x1 - x0);
    const fl = still(add(new T.PlaneGeometry(len, 3.6), toon(0x70788a, { map: tex(paving, 1.6, 1.2) }), xc, 0.012, RC)); fl.rotation.x = -PI / 2;
    for (const k of [-1, 1]) still(add(new T.PlaneGeometry(len, 4.4), mStoneD, xc, 2.2, RC + k * 1.8, k > 0 ? PI : 0));
    const cl = still(add(new T.PlaneGeometry(len, 3.6), mStoneD, xc, 4.25, RC)); cl.rotation.x = PI / 2;
    const end = new T.Mesh(new T.PlaneGeometry(3.6, 4.4), mInside); end.position.set(X(x1 - sd * 0.02), 2.2, Z(RC)); end.rotation.y = -sd * PI / 2; scene.add(end);
  }
  // ---- the descent, and the head of the stair
  hall(-46, -58, 2.6, 4.0, { veins: 30, seed: 71, bays: [-48.5, -52.5, -56.2] });
  { still(add(new T.PlaneGeometry(5.2, 7), toon(0xffffff, { map: tex(ashlar, 1.3, 2.7) }), 0, 3.5, -58));
    const sp = new T.Shape(); sp.moveTo(-1.25, 0); sp.lineTo(1.25, 0); sp.lineTo(1.25, 2.5); sp.absarc(0, 2.5, 1.25, 0, PI); sp.lineTo(-1.25, 0);
    glow = new T.Mesh(new T.ShapeGeometry(sp, 16), new T.MeshBasicMaterial({ color: new T.Color(0.2, 0.62, 0.56), fog: false })); glow.position.set(X(0), 0.04, Z(-57.96)); scene.add(glow); // the stair down: the Door's light comes up it
    still(add(new T.TorusGeometry(1.38, 0.19, 8, 22, PI), mVault, 0, 2.5, -57.93)); for (const sd of [-1, 1]) { add(new T.CylinderGeometry(0.19, 0.19, 2.5, 12), mVault, sd * 1.38, 1.25, -57.93); add(new T.CylinderGeometry(0.26, 0.26, 0.16, 12), mVaultD, sd * 1.38, 0.08, -57.93); }
    for (let k = 0; k < 3; k++) still(add(new T.BoxGeometry(2.4, 0.16, 0.4), mVaultD, 0, 0.06 - k * 0.1, -57.75 + k * 0.1)); }

  // Everything from here on is the war: glass, light, wreckage and the dead. It is all gone when he walks back up (`war`, hidden by level.setSite's `after`).
  const w0 = scene.children.length;
  // ---- glass: almost none at the entrance, thick by the stair
  const glassAt = (z) => Math.max(0, Math.min(1, (-z - 6) / 50));
  for (let i = 0; i < 26; i++) { const z = -Q(8, 57), k = glassAt(z), sd = i % 2 ? 1 : -1, hw = z > -30 ? GH : z > -46 ? RW : 2.6; if (q() > 0.25 + k) continue; cluster(X(sd * (hw - 0.4)), 0.02, Z(z), (0.3 + k * 0.9) * Q(0.7, 1.2), -sd * Q(0.15, 0.5)); }
  for (let i = 0; i < 22; i++) { const z = -Q(20, 57.5), k = glassAt(z), sd = i % 2 ? 1 : -1, hw = z > -30 ? GH : z > -46 ? RW : 2.6, y = Q(1.2, 4), h = (0.25 + k * 0.5) * Q(0.8, 1.2); for (let n = 0; n < 3; n++) shard(X(sd * (hw + 0.06)), y + Q(-0.1, 0.1), Z(z + Q(-0.12, 0.12)), h * (n ? Q(0.45, 0.8) : 1), Q(-0.7, 0.7), sd * Q(0.95, 1.5), 0); }
  cluster(X(-4.4), 0.02, Z(-45.2), 1.5, 0.25); cluster(X(4.6), 0.02, Z(-45.3), 1.2, -0.3); block(-4.4, -45.2, 0.7); block(4.6, -45.3, 0.6); // either side of the way down
  cluster(X(-1.9), 0.02, Z(-55.5), 1.1, 0.4); cluster(X(2.0), 0.02, Z(-53.8), 0.9, -0.4);
  // a ward cut into the rotunda floor, like the one before the Door, and broken
  const mWard = new T.MeshBasicMaterial({ color: new T.Color(0.16, 0.5, 0.45), transparent: true, opacity: 0.6, depthWrite: false, fog: false });
  const flat = (geo, x, z, rz) => { const m = new T.Mesh(geo, mWard); m.rotation.x = -PI / 2; m.rotation.z = rz || 0; m.position.set(X(x), 0.035, Z(z)); scene.add(m); };
  flat(new T.RingGeometry(3.0, 3.12, 64, 1, 0.4, 5.2), 0, RC); flat(new T.RingGeometry(2.1, 2.16, 48, 1, 2.2, 5.3), 0, RC); flat(new T.RingGeometry(0.5, 0.66, 4), 0, RC, PI / 4);
  for (let i = 0; i < 12; i++) { if (i === 3 || i === 4) continue; const a = (i / 12) * PI * 2; flat(new T.PlaneGeometry(0.07, 0.6), Math.sin(a) * 2.6, RC + Math.cos(a) * 2.6, -a); }

  // ---- light: torches still burning on the gallery's columns, colder the further in; the stair's own glow
  const sconce = (x, z, lit) => {
    const sd = Math.sign(x); add(new T.BoxGeometry(0.34, 0.05, 0.05), mIron, x - sd * 0.17, 2.55, z); add(new T.CylinderGeometry(0.09, 0.05, 0.26, 8), mIron, x - sd * 0.36, 2.62, z); add(new T.TorusGeometry(0.09, 0.016, 5, 10), mIron, x - sd * 0.36, 2.75, z).rotation.x = PI / 2;
    if (!lit) return; kit.fire(X(x - sd * 0.36), 2.74, Z(z), 0.55);
    const l = new T.PointLight(0xff8a3c, 9, 13, 2); l.position.set(X(x - sd * 0.7), 3.0, Z(z)); l.userData.base = 9; scene.add(l); lights.push(l);
  };
  const lights = [];
  sconce(-3.3, -2.5, true); sconce(3.3, -7.5, false); sconce(3.3, -12.5, true); sconce(-3.3, -17.5, false); sconce(-3.3, -22.5, true); sconce(3.3, -27.5, false);
  const cold = [[RC, 6.5, 7, 22], [-52, 3.2, 8, 14], [-57, 2.4, 8, 16]].map(([z, y, i, d]) => { const l = new T.PointLight(0x8fdcd0, i, d, 2); l.position.set(X(0), y, Z(z)); l.userData.base = i; scene.add(l); return l; });

  // ---- what the fight left: banners, rubble, dropped arms, blood, and the dead of both sides
  const mBanner = toon(0xffffff, { map: TEX.banner, side: T.DoubleSide, alphaTest: 0.5 });
  for (const [x, z, tilt] of [[-3.5, -5, 0], [3.5, -15, 0.5], [-3.5, -20, 0]]) { const sd = Math.sign(x), b = add(new T.PlaneGeometry(1.0, 2.6, 1, 4), mBanner, x - sd * 0.07, 3.6, z, -sd * PI / 2); b.rotation.z = tilt * 0.3; b.position.y -= tilt * 0.5; add(new T.BoxGeometry(0.08, 0.08, 1.2), toon(0x5c4028), x - sd * 0.07, 4.92 - tilt * 0.3, z).rotation.x = tilt * 0.3; }
  { const b = add(new T.PlaneGeometry(1.0, 2.6, 1, 4), mBanner, 1.6, 0.03, -23.4, 0.7); b.rotation.x = -PI / 2; b.rotation.z = 0.7; b.castShadow = false; } // one torn down and trodden on
  { const M = new T.Matrix4(), e = new T.Euler(), parts = [];
    for (let i = 0; i < 46; i++) { const z = -Q(1, 57), hw = (z > -30 ? GH : z > -46 ? RW : 2.6) - 0.3, x = (q() < 0.7 ? (q() < 0.5 ? -1 : 1) * (hw - Q(0, 0.8)) : Q(-hw, hw)), s = Q(0.06, 0.24), g = new T.DodecahedronGeometry(s, 0);
      g.applyMatrix4(M.makeRotationFromEuler(e.set(Q(0, 3), Q(0, 3), 0)).setPosition(X(x), s * 0.5, Z(z))); parts.push(g); }
    const m = new T.Mesh(mergeGeometries(parts), mVault); m.castShadow = m.receiveShadow = true; scene.add(m); }
  const mSteel = toon(0xc9ccd2), mGrip = toon(0x3a2c22), mGl = new T.MeshBasicMaterial({ color: new T.Color(0.3, 0.82, 0.74) });
  const sword = (x, z, ry, glass) => { const g = new T.Group(); g.position.set(X(x), 0.035, Z(z)); g.rotation.y = ry; scene.add(g);
    const b = new T.Mesh(new T.BoxGeometry(0.06, 0.016, 0.95), glass ? mGl : mSteel); b.position.z = 0.55; const c = new T.Mesh(new T.BoxGeometry(0.26, 0.03, 0.04), mGrip); c.position.z = 0.07; const h = new T.Mesh(new T.BoxGeometry(0.035, 0.03, 0.2), mGrip); h.position.z = -0.04; g.add(b, c, h); for (const m of [b, c, h]) m.castShadow = !glass; };
  const mBlood = new T.MeshBasicMaterial({ color: 0x2a0709, transparent: true, opacity: 0.86, depthWrite: false });
  const pool = (x, z, s) => { for (let k = 0; k < 3; k++) { const m = new T.Mesh(new T.CircleGeometry(s * Q(0.35, 0.7), 14), mBlood); m.rotation.x = -PI / 2; m.scale.set(1, Q(0.6, 1), 1); m.rotation.z = Q(0, 3); m.position.set(X(x + (k ? Q(-0.5, 0.5) * s : 0)), 0.02 + k * 0.001, Z(z + (k ? Q(-0.5, 0.5) * s : 0))); m.renderOrder = 1; scene.add(m); } };
  // Looks: the realm's knights wear what he wears (he is one of them); its line soldiers are in plain steel; the Usurper's guard in pale plate with glass in it.
  const KNIGHT = LOOKS.captain, LINE = LOOKS.line, GLASS = LOOKS.glass;
  const body = (look, pose, x, z, face, o = {}) => { const f = bakeFigure(look, pose, o.scale || 1); f.position.set(X(x), 0, Z(z)); f.rotation.y = face; scene.add(f); if (!o.dry) pool(x + Math.sin(face) * 0.5, z + Math.cos(face) * 0.5, o.pool || 0.9); };
  const D = PZ.d2, B = PZ.down, PR = PZ.prone;
  [ [KNIGHT, D, -2.3, -3.6, 2.2], [GLASS, B, 1.9, -5.2, 0.6], [LINE, D, 2.6, -9.4, -1.9], [LINE, B, -2.6, -10.6, 1.1], [GLASS, PR, 0.9, -11.8, 2.8], [GLASS, D, -1.4, -15.8, -0.5],
    [KNIGHT, B, 2.5, -17.2, -2.4], [LINE, D, -2.7, -19.6, 0.4], [GLASS, B, 2.4, -22.0, 1.9], [GLASS, D, 0.4, -20.6, -2.9], [KNIGHT, PR, 1.7, -27.3, 3.0], [GLASS, D, -1.6, -28.8, 1.4],
    [GLASS, B, -4.6, -33.2, 0.9], [LINE, D, 5.4, -34.6, -2.2], [KNIGHT, D, -5.6, -41.5, 2.6], [GLASS, PR, 3.1, -42.6, -0.8], [GLASS, B, -1.2, -36.2, 2.0], [KNIGHT, B, 1.5, -49.5, 3.0], [LINE, PR, -1.5, -53.2, 2.9],
  ].forEach(([look, pose, x, z, face]) => body(look, pose, x, z, face));
  sword(-0.9, -4.6, 0.8); sword(2.1, -13.3, 2.6); sword(1.0, -6.6, 1.7, true); sword(-2.0, -17.0, -1.2, true); sword(-0.6, -24.6, 2.2); sword(3.4, -37.6, 0.3, true); sword(-3.9, -39.7, -2.0); sword(0.8, -51.0, 1.1);
  return { obs, lights, cold, day, glow, war: scene.children.slice(w0) };
}
