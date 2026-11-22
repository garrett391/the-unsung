import * as T from 'three';
import { G } from '../core/game.js';
import { damp, clamp, wrap } from '../core/util.js';
import { JI } from './rig.js';
import { Char } from './char.js';

const tmp = new T.Vector3();
const add = (o, j, x, y = 0, z = 0) => { const i = JI[j] * 3; o[i] += x; o[i + 1] += y; o[i + 2] += z; };
// Slow wandering, the same for nobody: two sines at odd rates, so it never quite repeats.
const wob = (t, s, k) => 0.6 * Math.sin(t * (0.21 + 0.07 * k) + s * (1.7 + k)) + 0.4 * Math.sin(t * (0.53 + 0.11 * k) + s * (3.1 + 2 * k));
// The living layer (see `live` above), added over whatever pose he holds.
function alive(o, { k = 1, seed = 0 }, talk) {
  const t = G.time, br = Math.sin(t * (1.55 + 0.1 * Math.sin(seed)) + seed * 5); // breathing, about every four seconds
  add(o, 'chest', -0.03 * br * k); add(o, 'spine', 0.012 * br * k); add(o, 'neck', 0.02 * br * k); add(o, 'shL', 0, 0, 0.025 * br * k); add(o, 'shR', 0, 0, -0.025 * br * k);
  // shifting: the trunk leans and turns a little, the head wanders, the arms resettle
  add(o, 'spine', 0.05 * wob(t, seed, 0) * k, 0.07 * wob(t, seed, 1) * k); add(o, 'neck', 0.06 * wob(t, seed, 2) * k, 0.16 * wob(t, seed, 3) * k);
  add(o, 'shL', 0.07 * wob(t, seed, 4) * k); add(o, 'elL', 0.1 * wob(t, seed, 5) * k); add(o, 'shR', 0.07 * wob(t, seed, 6) * k); add(o, 'elR', 0.1 * wob(t, seed, 7) * k);
  if (talk > 0.01) { // talking: the near hand comes up off the knee and moves with what he says, and the head nods
    const g = 0.65 + 0.35 * Math.sin(t * 2.4 + seed);
    add(o, 'shR', -0.22 * talk * g); add(o, 'elR', -0.55 * talk * g); add(o, 'haR', 0.25 * talk);
    add(o, 'neck', 0.07 * talk * Math.sin(t * 3.3 + seed)); add(o, 'spine', -0.06 * talk);
  }
}

// A figure that a stage script places, walks about and poses: bystanders, officers, the fallen.
// Nobody's target, and it never fights. It lives in G.extras until the world is next reset.
//   go(x, z, sp, face)  walk to a point, then turn to `face` if given
//   watch = someone     keep turned toward them while standing
//   lie()               dead on the ground (and no longer in anyone's way)
//   lookP, lookY        tip the head up (negative) or down, turn it left or right
//   live = { k, seed }  someone sitting or standing about while a scene plays: he breathes, shifts a little now and then,
//                       and while his name is the one on the dialogue box (G.speaker) he lifts a hand and nods as he talks
// Turning on the spot, the head goes first and the feet take steps (owner, Nov 2026: a half turn with still legs looked odd).
export class Extra extends Char {
  constructor(look, x, z, face, o = {}) {
    super(look, o.scale || 1); this.type = { name: o.name || '' }; this.place(x, z, face || 0); this.to = null; this.watch = null; this.faceTo = null; this.gait = 1; this.lookP = 0; this.lookY = 0; this.headY = 0; this.stepK = 0; this.out = null; this.live = null; this.talkK = 0;
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
    let turn = 0, wheel = false; // how far he still has to turn, standing; and whether the feet are stepping round
    if (!this.to) {
      this.vel.multiplyScalar(Math.exp(-8 * dt));
      if (this.faceTo != null) { turn = this.turnTo(this.faceTo, 4, dt); wheel = Math.abs(turn) > 0.3; if (Math.abs(turn) < 0.02) this.faceTo = null; }
      else if (this.watch && !this.dead) {
        // Following someone who moves (owner, Nov 2026: the company round the ring swivelled on still legs as he walked to
        // the table): the head keeps on him while the body stands; once he is well off to one side, the body comes round
        // after it in a few steps, a little past him if he is still going, and stands again.
        const w = this.watch, a = this.angleTo(w), off = wrap(a - this.face), moving = Math.hypot(w.vel.x, w.vel.z) > 0.5;
        if (!this.wheelT && Math.abs(off) > (moving ? 0.6 : 0.25)) { this.wheelT = G.time; this.wheelS = moving ? Math.sign(off) * 0.12 : 0; } // (squares up to someone standing still)
        if (this.wheelT) {
          const go = Math.abs(this.headY) > 0.25 || Math.abs(off) < 1.2 || G.time - this.wheelT > 0.35; // (a big turn waits a moment for the head)
          turn = go ? this.turnTo(a + this.wheelS, 1.7, dt) : off; wheel = go;
          if (go && Math.abs(turn) < 0.04) this.wheelT = 0;
        } else turn = off; // head only
      }
    }
    if (this.to || !this.watch) this.wheelT = 0;
    const big = !this.clip && !this.dead && wheel;
    this.headY = damp(this.headY, this.clip || this.dead ? 0 : clamp(turn, -0.9, 0.9), 7, dt); this.stepK = damp(this.stepK, big ? 1 : 0, big ? 10 : 6, dt);
    this.setLoco(4.6, dt);
    if (this.stepK > 0.02 && !this.to) { this.speedN = Math.max(this.speedN, 0.13 * this.stepK); this.phase += dt * 9.5 * this.stepK; } // short steps round, in place
    if (this.live) this.talkK = damp(this.talkK, this.type.name && G.speaker === this.type.name ? 1 : 0, 3, dt);
  }
  layer(c) {
    const y = this.lookY + this.headY, p = this.lookP; if (!y && !p && !this.live) return c;
    const o = this.out || (this.out = new Float32Array(c.length)); o.set(c);
    o[JI.neck * 3 + 1] += y * 0.7; o[JI.chest * 3 + 1] += y * 0.3; o[JI.neck * 3] += p * 0.8; o[JI.chest * 3] += p * 0.2;
    if (this.live) alive(o, this.live, this.talkK);
    return o;
  }
}
