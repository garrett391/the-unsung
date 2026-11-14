import * as T from 'three';
import { G } from '../core/game.js';
import { SFX } from '../core/audio.js';
import { wrap, damp, rnd } from '../core/util.js';
import { Char } from './char.js';
import { CL, eClip } from './anim.js';
import { LOOKS } from './data.js';
import { FX, Trail } from '../gfx/fx.js';

const tmpA = new T.Vector3();
const SWING = eClip('slash', 0.55, 0.6);
const HIT = { dmg: 13, knock: 3, poise: 1, stop: 0.03 };

// Corin, the squire. In the ring he is a sparring partner who reports what the
// player did to him; in battle he fights beside the captain.
export class Ally extends Char {
  constructor() {
    // Polished steel over a navy gambeson, white Third Company tabard, open-faced helm with a
    // crimson crest: younger and brighter than the captain, and readable at a glance beside him.
    super({ ...LOOKS.soldier, eye: undefined, plume: 0xb0283c }, 0.93);
    this.type = { name: 'CORIN' }; this.hp = this.maxHp = 1; this.mode = 'idle'; this.want = null; this.st = 0; this.cd = 1.2; this.foe = null;
    this.trail = new Trail(0xb0d0ff); this.trail.life = 0.12; this.hitDone = false; this.guard = 1;
  }
  set(s) { this.state = s; this.st = 0; }
  setMode(m, want) { this.mode = m; this.want = want || null; this.set('loco'); this.stop(0.2); this.open = false; this.cd = 1.0; this.trailOn = false; }
  parried() { this.set('parried'); this.open = true; this.play(CL.stun, 0.06); this.vel.set(0, 0, 0); this.trailOn = false; G.emit('spar', { kind: 'playerParried' }); }
  takeHit(a, from) {
    const dir = tmpA.subVectors(this.pos, from.pos).setY(0).normalize(), hp = new T.Vector3().copy(this.pos).addScaledVector(dir, -0.4).setY(1.05);
    const front = Math.abs(wrap(Math.atan2(-dir.x, -dir.z) - this.face)) < 1.3;
    const land = (kind) => {
      SFX.hit(); this.flash = 0.8; FX.sparks.emit(hp, 12, 5, 0xfff4d0, 0.3, { boost: 1.6 }); G.hitstop = Math.max(G.hitstop, 0.07); G.shake = Math.max(G.shake, 0.2);
      this.vel.copy(dir).multiplyScalar(a.knock * 0.6); this.open = false; this.set('reel'); this.play(CL.hit, 0.05); G.emit('spar', { kind }); return 'hit';
    };
    if (this.open && a.crit) return land('riposte');
    if (this.want === 'bash' && a.bash) return land('bash');
    if (this.want === 'flank' && (!front || G.time - from.sideT < 1.3)) return land('flank');
    if (this.want === 'charged' && a.aoe) return land('charged');
    SFX.clang(); FX.sparks.emit(hp, 9, 4, 0xffe0a0, 0.25, { boost: 1.5 }); G.hitstop = Math.max(G.hitstop, 0.05); G.shake = Math.max(G.shake, 0.1);
    this.vel.addScaledVector(dir, 2.5); this.recoil = 1; G.emit('spar', { kind: 'blocked' }); return 'block';
  }
  update(dt) {
    this.st += dt; const P_ = G.player, f = this.fwd(tmpA); const brake = (k) => this.vel.multiplyScalar(Math.exp(-k * dt));
    this.blockW = damp(this.blockW, this.mode === 'guard' && this.state === 'loco' ? 1 : 0, 14, dt);
    if (this.state === 'reel') { brake(7); if (this.st > 0.7) { this.set('loco'); this.stop(0.2); } }
    else if (this.state === 'parried') { brake(8); if (this.st > 2.4) { this.open = false; this.set('loco'); this.stop(0.25); this.cd = 1.2; } }
    else if (this.mode === 'guard' || this.mode === 'idle') { brake(8); this.turnTo(this.angleTo(P_), 6, dt); }
    else if (this.mode === 'attack' && G.talking) { // sparring stops while anyone is speaking
      brake(8); this.turnTo(this.angleTo(P_), 6, dt); this.trailOn = false; this.cd = Math.max(this.cd, 0.9);
      if (this.state !== 'loco') { this.set('loco'); this.stop(0.2); }
    }
    else if (this.mode === 'attack' || this.mode === 'battle') {
      // Sparring swings go at the captain; in battle, at the nearest raider.
      let foe = P_;
      if (this.mode === 'battle') {
        foe = null; let bd = 16; for (const e of G.enemies) { if (e.dead || e.state === 'spawn') continue; const d = this.dist(e); if (d < bd) { bd = d; foe = e; } }
      }
      if (this.state === 'loco') {
        if (!foe) { // fall in at the captain's shoulder
          const tx = P_.pos.x - Math.cos(P_.face) * 1.6 - Math.sin(P_.face) * 0.8, tz = P_.pos.z + Math.sin(P_.face) * 1.6 - Math.cos(P_.face) * 0.8;
          const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz), sp = d > 1 ? Math.min(6.2, d * 2.2) : 0;
          if (d > 1) this.turnTo(Math.atan2(dx, dz), 8, dt); this.vel.x = damp(this.vel.x, f.x * sp, 6, dt); this.vel.z = damp(this.vel.z, f.z * sp, 6, dt);
        } else {
          const d = this.dist(foe), want = 2.0 + foe.radius; this.turnTo(this.angleTo(foe), 7, dt);
          const sp = d > want + 0.3 ? 4.6 : d < want - 0.5 ? -1.5 : 0; this.vel.x = damp(this.vel.x, f.x * sp, 6, dt); this.vel.z = damp(this.vel.z, f.z * sp, 6, dt);
          this.cd -= dt;
          if (this.cd <= 0 && d < want + 0.8) { this.set('wind'); this.hitDone = false; this.foe = foe; this.play(SWING, 0.14); if (this.mode === 'attack') SFX.tele(); }
        }
      } else if (this.state === 'wind') {
        brake(8); if (this.foe && !this.foe.dead) this.turnTo(this.angleTo(this.foe), 5, dt);
        if (this.st >= 0.55) { this.set('strike'); SFX.swing(0.9); }
      } else if (this.state === 'strike') {
        const sp = this.st < 0.15 ? 5.5 : 0; this.vel.x = damp(this.vel.x, f.x * sp, 25, dt); this.vel.z = damp(this.vel.z, f.z * sp, 25, dt); this.trailOn = this.st < 0.2;
        const foe2 = this.foe;
        if (!this.hitDone && foe2 && !foe2.dead && this.st > 0.04 && this.st < 0.17 && this.dist(foe2) < 2.5 + foe2.radius && Math.abs(wrap(this.angleTo(foe2) - this.face)) < 1.0) {
          this.hitDone = true;
          if (foe2 === P_) { const r = P_.receive(this, 0); G.emit('spar', { kind: r === 'block' ? 'playerBlocked' : r === 'hit' ? 'playerHit' : r }); }
          else foe2.takeHit(HIT, this, HIT.dmg);
        }
        if (this.st >= 0.3 && this.state === 'strike') { this.trailOn = false; this.set('recover'); }
      } else if (this.state === 'recover') { brake(8); if (this.st >= 0.6) { this.set('loco'); this.stop(0.2); this.cd = this.mode === 'attack' ? rnd(1.3, 1.9) : rnd(0.8, 1.8); } }
    }
    this.setLoco(4.6, dt);
  }
}
