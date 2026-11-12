import * as THREE from 'three';
import { lerp, smooth, easeOut, easeIn, clamp, TAU } from './util.js';
import { makeRig as buildRig, PALETTES } from './rig_build.js';

export { PALETTES };
export function makeRig(kind, opts = {}) {
  const r = buildRig(kind, opts);
  resetPose(r);
  applyShield(r, 0, 0);
  return r;
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------
export function resetPose(r) {
  r.scaler.position.set(0, 0, 0);
  r.body.position.set(0, 0.55, 0);
  r.body.rotation.set(0, 0, 0);
  r.hips.rotation.set(0, 0, 0);
  r.torso.rotation.set(0, 0, 0);
  r.head.rotation.set(0, 0, 0);
  r.shS.rotation.set(0, 0, 0.12 * r.side);
  r.shO.rotation.set(0, 0, -0.12 * r.side);
  r.elS.rotation.set(0, 0, 0);
  r.elO.rotation.set(0, 0, 0);
  r.hipL.rotation.set(0, 0, 0);
  r.hipR.rotation.set(0, 0, 0);
  r.knL.rotation.set(0, 0, 0);
  r.knR.rotation.set(0, 0, 0);
  r.root.rotation.x = 0;
  r.root.rotation.z = 0;
}

export function poseStance(r, k = 1, guard = 0) {
  const s = r.side;
  r.shS.rotation.set(-0.85 * k, 0.32 * s * k, 0.12 * s * (1 - k));
  r.elS.rotation.x = -0.35 * k - 0.1;
  r.shO.rotation.set(-0.35 - 0.95 * guard, s * 0.45 * guard, -0.12 * s * (1 - guard));
  r.elO.rotation.x = -0.35 - 0.7 * guard;
}

export function poseBreath(r, t) {
  r.torso.rotation.x += Math.sin(t * 2.1) * 0.02;
  r.head.rotation.x += Math.sin(t * 2.1 + 0.6) * 0.015;
}

export function poseLocomotion(r, phase, amt, armed = true) {
  if (amt < 0.01) return;
  const sw = Math.sin(phase), cw = Math.cos(phase);
  r.hipL.rotation.x += sw * 0.8 * amt;
  r.hipR.rotation.x -= sw * 0.8 * amt;
  r.knL.rotation.x += (Math.max(0, -cw) * 1.2 + 0.1) * amt;
  r.knR.rotation.x += (Math.max(0, cw) * 1.2 + 0.1) * amt;
  r.body.position.y += Math.abs(cw) * 0.05 * amt - 0.02 * amt;
  r.torso.rotation.x += 0.12 * amt;
  r.torso.rotation.y += sw * 0.12 * amt;
  const leftIsSword = r.side > 0;
  const kS = armed ? 0.3 : 1;
  const left = leftIsSword ? r.shS : r.shO;
  const right = leftIsSword ? r.shO : r.shS;
  left.rotation.x += -sw * 0.6 * amt * (leftIsSword ? kS : 1);
  right.rotation.x += sw * 0.6 * amt * (leftIsSword ? 1 : kS);
}

export function applyShield(r, guard, bash = 0) {
  const p = r.shieldPivot;
  if (!p) return;
  const o = -r.side;
  if (r.shieldType === 'tower') {
    p.position.set(lerp(o * 0.3, o * 0.05, guard), lerp(0.22, 0.32, guard), lerp(0.14, 0.42, guard) + bash * 0.2);
    p.rotation.set(0, lerp(o * 0.9, o * 0.08, guard), 0);
  } else {
    p.position.set(lerp(o * 0.34, o * 0.05, guard), lerp(0.3, 0.37, guard), lerp(0.0, 0.42, guard) + bash * 0.24);
    p.rotation.set(0, lerp((o * Math.PI) / 2, o * 0.12, guard), 0);
  }
}

const SL = {
  h1: { y0: 1.5, y1: -1.15, p0: -1.35, p1: -1.5, t0: 0.5, t1: -0.55, e0: -0.4, e1: -0.05, l0: 0, l1: 0.1 },
  h2: { y0: -0.95, y1: 1.45, p0: -1.5, p1: -1.4, t0: -0.45, t1: 0.5, e0: -0.6, e1: -0.05, l0: 0, l1: 0.1 },
  v: { y0: 0.2, y1: 0.05, p0: -2.9, p1: -0.45, t0: 0.15, t1: -0.05, e0: -0.5, e1: 0, l0: -0.15, l1: 0.38 },
  thrust: { y0: 0.25, y1: 0.06, p0: -1.4, p1: -1.58, t0: 0.35, t1: -0.25, e0: -1.7, e1: 0, l0: -0.1, l1: 0.35 },
};
export function poseSlash(r, kind, t, wind = 0.3, hit = 0.22) {
  const s = r.side, K = SL[kind] || SL.h1;
  const stY = 0.32 * s, stP = -0.85, stE = -0.45;
  let y, p, e, ty, l;
  if (t < wind) {
    const u = smooth(t / wind);
    y = lerp(stY, K.y0 * s, u); p = lerp(stP, K.p0, u); e = lerp(stE, K.e0, u);
    ty = lerp(0, K.t0 * s, u); l = lerp(0, K.l0, u);
  } else if (t < wind + hit) {
    const u = easeOut((t - wind) / hit);
    y = lerp(K.y0 * s, K.y1 * s, u); p = lerp(K.p0, K.p1, u); e = lerp(K.e0, K.e1, u);
    ty = lerp(K.t0 * s, K.t1 * s, u); l = lerp(K.l0, K.l1, u);
  } else {
    const u = smooth((t - wind - hit) / (1 - wind - hit));
    y = lerp(K.y1 * s, stY, u); p = lerp(K.p1, stP, u); e = lerp(K.e1, stE, u);
    ty = lerp(K.t1 * s, 0, u); l = lerp(K.l1, 0, u);
  }
  r.shS.rotation.set(p, y, 0);
  r.elS.rotation.x = e;
  r.torso.rotation.y = ty;
  r.torso.rotation.x = l;
  const lunge = t < wind ? 0 : Math.sin(clamp((t - wind) / (1 - wind), 0, 1) * Math.PI);
  r.hipL.rotation.x = -0.35 * lunge;
  r.hipR.rotation.x = 0.3 * lunge;
  r.knL.rotation.x = 0.3 * lunge;
  r.knR.rotation.x = 0.25 * lunge;
  r.body.position.y = 0.55 - 0.05 * lunge;
}

export function poseSpin(r) {
  const s = r.side;
  r.shS.rotation.set(-0.15, 0, s * 1.5);
  r.elS.rotation.x = -0.1;
  r.shO.rotation.set(-0.4, 0, -s * 0.5);
  r.elO.rotation.x = -0.6;
  r.hipL.rotation.x = -0.25;
  r.hipR.rotation.x = 0.25;
  r.knL.rotation.x = 0.35;
  r.knR.rotation.x = 0.35;
  r.body.position.y = 0.5;
  r.torso.rotation.x = 0.12;
}

export function poseCharge(r, k) {
  const s = r.side;
  r.shS.rotation.set(-0.5, 1.35 * s, 0.2 * s);
  r.elS.rotation.x = -0.3;
  r.torso.rotation.y = 0.45 * s * k;
  r.body.position.y = 0.55 - 0.06 * k;
  r.knL.rotation.x = 0.25 * k;
  r.knR.rotation.x = 0.25 * k;
}

export function poseRoll(r, kind, t) {
  const u = clamp(t, 0, 1);
  const tuck = Math.sin(Math.PI * Math.min(1, u * 1.1));
  r.hipL.rotation.x = r.hipR.rotation.x = -1.4 * tuck;
  r.knL.rotation.x = r.knR.rotation.x = 2.1 * tuck;
  r.torso.rotation.x = 0.6 * tuck;
  r.head.rotation.x = 0.3 * tuck;
  r.shS.rotation.set(-1.1 * tuck - 0.3, 0.2 * r.side, 0);
  r.elS.rotation.x = -1.2 * tuck;
  r.shO.rotation.set(-1.0 * tuck - 0.3, -0.2 * r.side, 0);
  r.elO.rotation.x = -1.2 * tuck;
  r.body.position.y = 0.55 - 0.2 * tuck;
  const a = smooth(u) * TAU;
  if (kind === 'fwd') r.body.rotation.x = a;
  else if (kind === 'back') r.body.rotation.x = -a;
  else if (kind === 'left') r.body.rotation.z = -a;
  else r.body.rotation.z = a;
}

export function poseVault(r, t) {
  const u = clamp(t, 0, 1);
  const tuck = Math.sin(Math.PI * u);
  r.body.rotation.x = smooth(u) * TAU;
  r.hipL.rotation.x = r.hipR.rotation.x = -1.0 * tuck;
  r.knL.rotation.x = r.knR.rotation.x = 1.5 * tuck;
  const sp = u < 0.35 ? lerp(-0.85, -2.8, smooth(u / 0.35)) : u < 0.6 ? lerp(-2.8, -0.4, easeOut((u - 0.35) / 0.25)) : lerp(-0.4, -0.85, smooth((u - 0.6) / 0.4));
  r.shS.rotation.set(sp, 0.1 * r.side, 0);
  r.elS.rotation.x = -0.2;
  r.shO.rotation.set(-0.6, 0, -0.5 * r.side);
}

export function poseHurt(r, t) {
  const k = Math.sin(Math.PI * clamp(t, 0, 1));
  r.torso.rotation.x += -0.4 * k;
  r.head.rotation.x += -0.3 * k;
  r.shO.rotation.z += -0.6 * r.side * k;
  r.body.position.y -= 0.05 * k;
}

export function poseKneel(r, k = 1, lean = 0.25) {
  r.body.position.y = 0.55 - 0.42 * k;
  r.hipL.rotation.x = -1.5 * k;
  r.knL.rotation.x = 1.5 * k;
  r.hipR.rotation.x = 0.15 * k;
  r.knR.rotation.x = 1.75 * k;
  r.torso.rotation.x = lean * k;
}

export function poseLie(r, k = 1) {
  r.root.rotation.x = -Math.PI / 2 * easeIn(k);
  r.scaler.position.z = 0.14 * k;
  r.shS.rotation.set(0, 0, 0.5 * r.side * k);
  r.shO.rotation.set(0, 0, -0.6 * r.side * k);
  r.head.rotation.x = -0.2 * k;
  r.hipL.rotation.z = 0.1 * k;
  r.hipR.rotation.z = -0.1 * k;
}

export function poseSheathed(r, k = 1) {
  const s = r.side;
  r.body.position.y = 0.55 - 0.18 * k;
  r.hipL.rotation.x = -0.6 * k;
  r.knL.rotation.x = 0.9 * k;
  r.hipR.rotation.x = 0.35 * k;
  r.knR.rotation.x = 0.9 * k;
  r.torso.rotation.set(0.3 * k, -0.5 * s * k, 0);
  r.shS.rotation.set(0.3 * k, -0.9 * s * k, 0);
  r.elS.rotation.x = -1.1 * k;
  r.shO.rotation.set(-0.3, 0, -0.2 * s);
}

export function poseDraw(r, t) {
  const s = r.side, u = easeOut(clamp(t, 0, 1));
  r.shS.rotation.set(lerp(0.3, -1.9, u), lerp(-0.9 * s, 1.3 * s, u), 0);
  r.elS.rotation.x = lerp(-1.1, 0, u);
  r.torso.rotation.set(lerp(0.3, -0.05, u), lerp(-0.5 * s, 0.6 * s, u), 0);
  r.hipL.rotation.x = lerp(-0.6, -0.9, u);
  r.knL.rotation.x = lerp(0.9, 0.6, u);
  r.hipR.rotation.x = lerp(0.35, 0.6, u);
  r.knR.rotation.x = 0.7;
  r.body.position.y = 0.55 - 0.18 + 0.06 * u;
  r.shO.rotation.set(-0.3, 0, -0.5 * s);
}

export function poseCast(r, k) {
  const s = r.side;
  r.shS.rotation.set(-2.7 * k, 0.2 * s, 0.3 * s * k);
  r.shO.rotation.set(-2.5 * k, -0.2 * s, -0.4 * s * k);
  r.elS.rotation.x = -0.2;
  r.elO.rotation.x = -0.3;
  r.torso.rotation.x = -0.2 * k;
  r.head.rotation.x = -0.2 * k;
}

export function poseCrouch(r, k) {
  r.body.position.y = 0.55 - 0.25 * k;
  r.hipL.rotation.x = -0.9 * k;
  r.hipR.rotation.x = -0.9 * k;
  r.knL.rotation.x = 1.4 * k;
  r.knR.rotation.x = 1.4 * k;
  r.torso.rotation.x = 0.35 * k;
}

export function poseFallBack(r, t) {
  const u = clamp(t, 0, 1);
  r.root.rotation.x = (-Math.PI / 2) * easeIn(u);
  r.scaler.position.z = 0.14 * u;
  r.shS.rotation.set(-0.4 * u, 0, 0.9 * r.side * u);
  r.shO.rotation.set(-0.4 * u, 0, -0.9 * r.side * u);
  r.knL.rotation.x = 0.3 * u;
}
