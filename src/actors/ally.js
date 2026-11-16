import * as T from 'three';
import { G } from '../core/game.js';
import { SFX } from '../core/audio.js';
import { wrap, damp, rnd } from '../core/util.js';
import { Char } from './char.js';
import { CL, eClip } from './anim.js';
import { LOOKS } from './data.js';
import { FX, Trail, blood } from '../gfx/fx.js';
import { steer, route } from '../world/level.js';

const tmpA = new T.Vector3();
const SWING = eClip('slash', 0.55, 0.6);
const HIT = { dmg: 13, knock: 3, poise: 1, stop: 0.03 };
// A soldier of the line beside him hits less hard than Corin and less often: the fight is still the player's.
const LINE = { dmg: 7, knock: 2, poise: 0.5, quiet: true };

// Someone who fights on his side. With no options this is Corin, the squire: in the ring a sparring
// partner who reports what the player did to him, in battle a fighter at the captain's shoulder.
// With `soldier` it is one of the line (G.enlist in main.js; kept in G.allies until the world is reset):
//   look, scale, name   who he is
//   slot: [back, side]  where he falls in behind the captain when there is nobody to fight
//   post = [x, z]       or a place he holds instead, fighting whoever comes within reach of it
// A soldier can be marked by an enemy (Enemy.mark), which then fights him and not the captain. He stops most
// blows; enough of them put him on one knee (`out`) until a script calls rally(). Nobody on his side dies here.
export class Ally extends Char {
  constructor(o = {}) {
    // Corin: polished steel over a navy gambeson, white Third Company tabard, open-faced helm with a
    // crimson crest: younger and brighter than the captain, and readable at a glance beside him.
    super(o.look || { ...LOOKS.soldier, eye: undefined, plume: 0xb0283c }, o.scale || 0.93);
    this.ally = true; this.soldier = !!o.soldier; this.type = { name: o.name || 'CORIN' }; this.hp = this.maxHp = o.soldier ? 90 : 1; this.mode = o.soldier ? 'battle' : 'idle'; this.want = null; this.st = 0; this.cd = rnd(0.8, 1.8); this.foe = null;
    this.trail = new Trail(0xb0d0ff); this.trail.life = 0.12; this.hitDone = false; this.guard = 1; this.slot = o.slot || [1.6, 0.8]; this.post = null; this.out = false; this.hitK = o.soldier ? LINE : HIT;
    if (o.at) { this.place(o.at[0], o.at[1], o.at[2] || 0); this.animate(0, G.time); }
  }
  set(s) { this.state = s; this.st = 0; }
  setMode(m, want) { this.mode = m; this.want = want || null; this.set('loco'); this.stop(0.2); this.open = false; this.cd = 1.0; this.trailOn = false; }
  parried() { this.set('parried'); this.open = true; this.play(CL.stun, 0.06); this.vel.set(0, 0, 0); this.trailOn = false; G.emit('spar', { kind: 'playerParried' }); }
  // An enemy's blow arrives (a soldier only: Corin is never anyone's mark). Mostly it is stopped.
  receive(e, dmg) {
    if (this.out || G.talking) return 'miss';
    const dir = tmpA.subVectors(this.pos, e.pos).setY(0).normalize(), hp = new T.Vector3().copy(this.pos).addScaledVector(dir, -0.4).setY(this.pos.y + 1.1);
    if (this.state === 'loco' && Math.random() < 0.65) { SFX.clang(); FX.sparks.emit(hp, 9, 4, 0xffe0a0, 0.25, { boost: 1.5 }); this.vel.addScaledVector(dir, 3); this.recoil = 1; this.blockT = G.time + 0.5; return 'block'; }
    SFX.hit(); this.flash = 0.8; FX.sparks.emit(hp, 8, 4, 0xff5040, 0.3); if (!G.blunt) blood(hp, dir, 1, false, e); this.hp -= dmg; this.vel.copy(dir).multiplyScalar(4); this.trailOn = false;
    if (this.hp <= 0) { this.hp = 0; this.out = true; this.set('out'); this.play(CL.kneel, 0.25); G.emit('allyDown', { ally: this }); } // to one knee, out of it until someone gets him up
    else { this.set('reel'); this.play(CL.hit, 0.05); }
    return 'hit';
  }
  rally() { if (!this.out) return; this.out = false; this.hp = this.maxHp * 0.6; this.set('loco'); this.stop(0.6); this.cd = 1.5; }
  takeHit(a, from) {
    const dir = tmpA.subVectors(this.pos, from.pos).setY(0).normalize(), hp = new T.Vector3().copy(this.pos).addScaledVector(dir, -0.4).setY(this.pos.y + 1.05);
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
  // Who to fight: the nearest raider, but not the one every other soldier is already on (and, holding a post, nobody far from it).
  pickFoe() {
    let foe = null, bs = 16;
    for (const e of G.enemies) {
      if (e.dead || e.state === 'spawn' || e.hold) continue; if (this.post && Math.hypot(e.pos.x - this.post[0], e.pos.z - this.post[1]) > 9) continue;
      let s = this.dist(e); if (e.mark === this) s -= 5; for (const a of G.allies) if (a !== this && a.foe === e && !a.out) s += 4;
      if (s < bs) { bs = s; foe = e; }
    }
    return foe;
  }
  // Walk toward a point, round whatever is in the way.
  head(x, z, sp, dt, f) {
    const via = route(this.pos, { x, z }), tx = via ? via[0] : x, tz = via ? via[1] : z, d = Math.hypot(x - this.pos.x, z - this.pos.z);
    this.turnTo(steer(this.pos, this.radius, Math.atan2(tx - this.pos.x, tz - this.pos.z), d, this), 8, dt); this.vel.x = damp(this.vel.x, f.x * sp, 6, dt); this.vel.z = damp(this.vel.z, f.z * sp, 6, dt);
  }
  update(dt) {
    this.st += dt; const P_ = G.player, f = this.fwd(tmpA); const brake = (k) => this.vel.multiplyScalar(Math.exp(-k * dt));
    this.blockW = damp(this.blockW, (this.mode === 'guard' && this.state === 'loco') || this.blockT > G.time ? 1 : 0, 14, dt);
    if (this.state === 'out') { brake(8); this.trailOn = false; }
    else if (this.state === 'reel') { brake(7); if (this.st > 0.7) { this.set('loco'); this.stop(0.2); } }
    else if (this.state === 'parried') { brake(8); if (this.st > 2.4) { this.open = false; this.set('loco'); this.stop(0.25); this.cd = 1.2; } }
    else if (this.mode === 'guard' || this.mode === 'idle') { brake(8); this.turnTo(this.angleTo(P_), 6, dt); }
    else if ((this.mode === 'attack' && G.talking) || (this.soldier && (G.freezeAI || G.talking))) { // sparring stops while anyone is speaking, and the line stands while a scene is played
      brake(8); if (this.mode === 'attack') this.turnTo(this.angleTo(P_), 6, dt); this.trailOn = false; this.cd = Math.max(this.cd, 0.9);
      if (this.state !== 'loco') { this.set('loco'); this.stop(0.2); }
    }
    else if (this.mode === 'attack' || this.mode === 'battle') {
      // Sparring swings go at the captain; in battle, at the nearest raider.
      let foe = P_;
      if (this.mode === 'battle') foe = this.soldier ? this.pickFoe() : (() => { let b = null, bd = 16; for (const e of G.enemies) { if (e.dead || e.state === 'spawn') continue; const d = this.dist(e); if (d < bd) { bd = d; b = e; } } return b; })();
      if (this.state === 'loco') {
        if (!foe) { // fall in behind the captain (each soldier in his own place), or stand at his post
          this.foe = null;
          const tx = this.post ? this.post[0] : P_.pos.x - Math.cos(P_.face) * this.slot[0] - Math.sin(P_.face) * this.slot[1], tz = this.post ? this.post[1] : P_.pos.z + Math.sin(P_.face) * this.slot[0] - Math.cos(P_.face) * this.slot[1];
          const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz), sp = d > 1 ? Math.min(6.2, d * 2.2) : 0;
          if (d > 1 && this.soldier) this.head(tx, tz, sp, dt, f);
          else { if (d > 1) this.turnTo(Math.atan2(dx, dz), 8, dt); else if (this.post && this.post[2] != null) this.turnTo(this.post[2], 4, dt); this.vel.x = damp(this.vel.x, f.x * sp, 6, dt); this.vel.z = damp(this.vel.z, f.z * sp, 6, dt); }
        } else {
          const d = this.dist(foe), want = 2.0 + foe.radius; if (this.soldier) this.foe = foe;
          const sp = d > want + 0.3 ? 4.6 : d < want - 0.5 ? -1.5 : 0;
          if (this.soldier && d > 4) this.head(foe.pos.x, foe.pos.z, sp, dt, f);
          else { this.turnTo(this.angleTo(foe), 7, dt); this.vel.x = damp(this.vel.x, f.x * sp, 6, dt); this.vel.z = damp(this.vel.z, f.z * sp, 6, dt); }
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
          else foe2.takeHit(this.hitK, this, this.hitK.dmg);
        }
        if (this.st >= 0.3 && this.state === 'strike') { this.trailOn = false; this.set('recover'); }
      } else if (this.state === 'recover') { brake(8); if (this.st >= 0.6) { this.set('loco'); this.stop(0.2); this.cd = this.mode === 'attack' ? rnd(1.3, 1.9) : this.soldier ? rnd(1.6, 3.0) : rnd(0.8, 1.8); } }
    }
    this.setLoco(4.6, dt);
  }
}
