import * as T from 'three';
import { G } from '../core/game.js';
import { damp } from '../core/util.js';
import { Char } from './char.js';

const tmp = new T.Vector3();

// A figure that a stage script places, walks about and poses: bystanders, officers, the fallen.
// Nobody's target, and it never fights. It lives in G.extras until the world is next reset.
//   go(x, z, sp, face)  walk to a point, then turn to `face` if given
//   watch = someone     keep turned toward them while standing
//   lie()               dead on the ground (and no longer in anyone's way)
export class Extra extends Char {
  constructor(look, x, z, face, o = {}) {
    super(look, o.scale || 1); this.type = { name: o.name || '' }; this.place(x, z, face || 0); this.to = null; this.watch = null; this.faceTo = null; this.gait = 1;
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
    if (!this.to) {
      this.vel.multiplyScalar(Math.exp(-8 * dt));
      if (this.faceTo != null) { if (Math.abs(this.turnTo(this.faceTo, 4, dt)) < 0.02) this.faceTo = null; }
      else if (this.watch && !this.dead) this.turnTo(this.angleTo(this.watch), 3, dt);
    }
    this.setLoco(4.6, dt);
  }
}
