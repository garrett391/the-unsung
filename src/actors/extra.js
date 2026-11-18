import * as T from 'three';
import { G } from '../core/game.js';
import { damp, clamp, wrap } from '../core/util.js';
import { JI } from './rig.js';
import { Char } from './char.js';

const tmp = new T.Vector3();

// A figure that a stage script places, walks about and poses: bystanders, officers, the fallen.
// Nobody's target, and it never fights. It lives in G.extras until the world is next reset.
//   go(x, z, sp, face)  walk to a point, then turn to `face` if given
//   watch = someone     keep turned toward them while standing
//   lie()               dead on the ground (and no longer in anyone's way)
//   lookP, lookY        tip the head up (negative) or down, turn it left or right
// Turning on the spot, the head goes first and the feet take steps (owner, Nov 2026: a half turn with still legs looked odd).
export class Extra extends Char {
  constructor(look, x, z, face, o = {}) {
    super(look, o.scale || 1); this.type = { name: o.name || '' }; this.place(x, z, face || 0); this.to = null; this.watch = null; this.faceTo = null; this.gait = 1; this.lookP = 0; this.lookY = 0; this.headY = 0; this.stepK = 0; this.out = null;
    G.extras.push(this); this.animate(0, G.time);
  }
  get fixed() { return !this.to; } // standing still, the others walk round it
  go(x, z, sp = 1.6, face = null) { this.to = { x, z, sp, face }; return this; }
  lie(clip, done) { this.dead = true; this.to = null; this.vel.set(0, 0, 0); this.play(clip, 0.08); if (done) this.ct = clip.dur; }
  update(dt) {
    const t = this.to;
    if (t) {
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z, l = Math.hypot(dx, dz);
      if (l < 0.15) { this.to = null; this.faceTo = t.face; }
      else { this.turnTo(Math.atan2(dx, dz), 7, dt); const f = this.fwd(tmp), sp = Math.min(t.sp, l * 3 + 0.3); this.vel.x = damp(this.vel.x, f.x * sp, 8, dt); this.vel.z = damp(this.vel.z, f.z * sp, 8, dt); }
      this.gait = t.sp < 2.5 ? 2.4 : 1; // a walk takes real steps (see Char.setLoco)
    }
    let turn = 0; // how far he still has to turn, standing
    if (!this.to) {
      this.vel.multiplyScalar(Math.exp(-8 * dt));
      if (this.faceTo != null) { turn = this.turnTo(this.faceTo, 4, dt); if (Math.abs(turn) < 0.02) this.faceTo = null; }
      else if (this.watch && !this.dead) { const a = this.angleTo(this.watch), far = Math.abs(wrap(a - this.face)) > 0.3; turn = this.turnTo(a, far && Math.abs(this.headY) < 0.25 ? 0.5 : 2.6, dt); } // (the body waits a moment for the head)
    }
    const big = !this.clip && !this.dead && Math.abs(turn) > 0.3;
    this.headY = damp(this.headY, this.clip || this.dead ? 0 : clamp(turn, -0.9, 0.9), 7, dt); this.stepK = damp(this.stepK, big ? 1 : 0, big ? 10 : 6, dt);
    this.setLoco(4.6, dt);
    if (this.stepK > 0.02 && !this.to) { this.speedN = Math.max(this.speedN, 0.13 * this.stepK); this.phase += dt * 9.5 * this.stepK; } // short steps round, in place
  }
  layer(c) {
    const y = this.lookY + this.headY, p = this.lookP; if (!y && !p) return c;
    const o = this.out || (this.out = new Float32Array(c.length)); o.set(c);
    o[JI.neck * 3 + 1] += y * 0.7; o[JI.chest * 3 + 1] += y * 0.3; o[JI.neck * 3] += p * 0.8; o[JI.chest * 3] += p * 0.2; return o;
  }
}
