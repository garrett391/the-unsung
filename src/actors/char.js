import * as T from 'three';
import { G } from '../core/game.js';
import { PI, clamp, lerp, sstep, wrap, damp } from '../core/util.js';
import { buildHumanoid, JN, NJ, PL, HIP } from './rig.js';
import { sample, locoPose } from './anim.js';
import { TEX } from '../gfx/materials.js';
import { drip } from '../gfx/fx.js';

const tmpA = new T.Vector3(), tmpB = new T.Vector3(), GORE = new T.Color(0x470a0d);

// Shared body: transform, pose blending, locomotion phase, trail and hit flash.
export class Char {
  constructor(look, scale) {
    this.rig = buildHumanoid(look); this.root = this.rig.root; this.scale = scale || 1; this.root.scale.setScalar(this.scale); G.scene.add(this.root);
    this.pos = new T.Vector3(); this.vel = new T.Vector3(); this.face = 0; this.yoff = 0; this.radius = 0.44 * this.scale;
    this.cur = new Float32Array(PL); this.snap = new Float32Array(PL); this.tgt = new Float32Array(PL);
    this.blend = 1; this.blendDur = 0.1; this.clip = null; this.ct = 0;
    this.phase = Math.random() * 6; this.speedN = 0; this.strafe = 0; this.strafeS = 0; this.guard = 0; this.blockW = 0; this.recoil = 0; this.turnLean = 0; this.seed = Math.random() * 9;
    this.pvx = 0; this.pvz = 0; this.pface = 0; this.accF = 0; this.accS = 0; this.twist = 0;
    this.flash = 0; this.flashCol = [1, 1, 1]; this.trail = null; this.trailOn = false; this.dead = false; this.open = false; this.state = 'loco';
    this.shadow = new T.Mesh(new T.PlaneGeometry(1.5, 1.5), new T.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.5 }));
    this.shadow.rotation.x = -PI / 2; G.scene.add(this.shadow);
    this.wet = 0; this._wet = false; this.bladeBase = this.rig.bladeMat.color.clone(); // wet: blood on the blade, 0..1, set by blood() in fx.js
    locoPose(this.cur, this, 0);
  }
  _snap() { for (let i = 0; i < PL; i++) { let v = this.cur[i]; if (i < NJ * 3) v = wrap(v); this.snap[i] = v; } this.blend = 0; }
  play(clip, blend, t0) { this._snap(); this.blendDur = blend == null ? clip.keys[0].t || 0.08 : blend; this.clip = clip; this.ct = t0 || 0; }
  stop(blend) { if (!this.clip) return; this._snap(); this.blendDur = blend || 0.16; this.clip = null; }
  // Feed locomotion from current velocity: stride phase, strafe angle, inertia leans.
  setLoco(maxSp, dt) {
    const sp = Math.hypot(this.vel.x, this.vel.z); this.speedN = sp / maxSp;
    const sa = sp > 0.4 ? wrap(Math.atan2(this.vel.x, this.vel.z) - this.face) : 0; let f = sa, bk = 1;
    if (Math.abs(sa) > 1.9) { f = wrap(sa - PI); bk = -1; }
    if (dt > 0) {
      const sf = Math.sin(this.face), cf = Math.cos(this.face), ax = (this.vel.x - this.pvx) / dt, az = (this.vel.z - this.pvz) / dt;
      this.accF = damp(this.accF, clamp((ax * sf + az * cf) * 0.007, -0.2, 0.2), 8, dt);
      this.accS = damp(this.accS, clamp((ax * cf - az * sf) * 0.007, -0.16, 0.16), 8, dt);
      this.twist = damp(this.twist, clamp((-wrap(this.face - this.pface) / dt) * 0.04, -0.32, 0.32), 10, dt);
      this.pvx = this.vel.x; this.pvz = this.vel.z; this.pface = this.face;
    }
    this.strafe = sa; this.strafeS = damp(this.strafeS, f, 12, dt); this.phase += (sp * 1.72 * dt * bk * (this.gait || 1)) / this.scale; // gait > 1: more steps for the ground covered (a slow scripted walk, which otherwise glides)
  }
  animate(dt, time) {
    this.root.position.set(this.pos.x, this.yoff, this.pos.z); this.root.rotation.y = this.face;
    const n = this.trailOn && this.trail && this.clip ? 3 : 1, t0 = this.ct;
    this.blend = Math.min(1, this.blend + dt / this.blendDur); const w = sstep(this.blend);
    for (let k = 1; k <= n; k++) {
      if (this.clip) sample(this.clip, t0 + (dt * k) / n, this.tgt); else locoPose(this.tgt, this, time);
      for (let i = 0; i < PL; i++) this.cur[i] = w >= 1 ? this.tgt[i] : lerp(this.snap[i], this.tgt[i], w);
      this.apply(time);
      if (this.trailOn && this.trail) { this.root.updateMatrixWorld(true); this.trail.add(this.rig.wBase.getWorldPosition(tmpA), this.rig.wTip.getWorldPosition(tmpB)); }
    }
    this.ct += dt;
    if (this.trail) this.trail.update(dt);
    this.recoil = damp(this.recoil, 0, 9, dt);
    if (this.flash > 0 || this._fl) {
      this.flash = Math.max(0, this.flash - dt * 7); this._fl = this.flash > 0; const f = this.flash * 1.4;
      for (const m of this.rig.mats) m.emissive.setRGB(f * this.flashCol[0], f * this.flashCol[1], f * this.flashCol[2]);
    }
    if (this.wet > 0 || this._wet) { // a blade that has cut stays red for a while and drips
      this.wet = Math.max(0, this.wet - dt / 16); this._wet = this.wet > 0;
      this.rig.bladeMat.color.copy(this.bladeBase).lerp(GORE, Math.min(1, this.wet * 1.6) * 0.78);
      if (this.wet > 0.25 && !this.dead && Math.random() < dt * this.wet * 5) drip(this.rig.wBase.getWorldPosition(tmpA).lerp(this.rig.wTip.getWorldPosition(tmpB), 0.3 + Math.random() * 0.7));
    }
    const ss = clamp(1 - this.yoff * 0.25, 0.3, 1) * this.scale;
    this.shadow.position.set(this.pos.x, 0.045, this.pos.z); this.shadow.scale.setScalar(ss); this.shadow.visible = this.yoff > -0.5 && this.root.visible;
  }
  apply(time) {
    const J = this.rig.J, c = this.layer ? this.layer(this.cur) : this.cur;
    for (let i = 0; i < NJ; i++) J[JN[i]].rotation.set(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
    J.hips.position.set(c[NJ * 3], HIP + c[NJ * 3 + 1], c[NJ * 3 + 2]);
    const cp = this.rig.cape;
    if (cp) {
      const s = Math.min(1.2, this.speedN), lean = c[0], long = cp.length > 3, pitch = c[0] + c[3] + c[6];
      const lie = long ? clamp((pitch - 0.9) / 0.5, 0, 1) : 0, up = 1 - lie; // face down on the floor: a long cape settles along the back and legs, and stops stirring
      cp[0].rotation.x = clamp(0.1 * up + s * 0.6 - lean * 0.6 + Math.sin(time * 3.1) * 0.04 * (1 + s * 2) * up, -0.2 * up, 1.4);
      cp[1].rotation.x = 0.08 * up + s * 0.3 + Math.sin(time * 3.1 - 1.1) * 0.06 * (1 + s * 2) * up;
      const droop = long ? Math.max(0, pitch) * 0.55 * up : 0; // a long cape on a bent back lies along it, then falls from the hips
      for (let k = 2; k < cp.length; k++) cp[k].rotation.x = 0.06 * up + s * 0.22 + Math.sin(time * 3.1 - 1.1 * k) * 0.08 * (1 + s * 2) * up - (k > 2 ? droop + lie * 0.12 : 0);
      if (long) { // and it is kept off the floor: a length that would dip under it is bent back to trail along it (higher when he is down, over his own legs)
        const ch = cp[0].parent, q = cp[0].position; ch.updateWorldMatrix(true, false);
        const e = ch.matrixWorld.elements, uy = e[5], uz = e[9], R = Math.hypot(uy, uz), ph = Math.atan2(uz, uy), L = 0.3;
        const fl = (0.05 + 0.15 * clamp(-c[NJ * 3 + 1] / 0.4, 0, 1)) * this.scale;
        let h = e[1] * q.x + uy * q.y + uz * q.z + e[13], a = 0;
        if (h > fl) for (let k = 0; k < cp.length; k++) {
          a += cp[k].rotation.x; let dy = -(Math.cos(a) * uy + Math.sin(a) * uz) * L;
          if (h + dy < fl) { let a2 = ph + Math.acos(clamp((h - fl) / (L * R), -1, 1)); a2 += PI * 2 * Math.ceil((a - a2) / (PI * 2)); cp[k].rotation.x += a2 - a; a = a2; dy = fl - h; }
          h += dy;
        }
      }
    }
  }
  fwd(v) { return (v || new T.Vector3()).set(Math.sin(this.face), 0, Math.cos(this.face)); }
  turnTo(a, rate, dt) { const d = wrap(a - this.face); this.face = wrap(this.face + clamp(d, -rate * dt, rate * dt)); return d; }
  angleTo(o) { return Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }
  dist(o) { return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }
  place(x, z, face) { this.pos.set(x, 0, z); this.vel.set(0, 0, 0); if (face != null) this.face = this.pface = face; this.yoff = 0; }
  setVisible(v) { this.root.visible = v; }
  dispose() { G.scene.remove(this.root); G.scene.remove(this.shadow); if (this.trail) G.scene.remove(this.trail.mesh); }
}
