import * as T from 'three';
import { G } from '../core/game.js';
import { I, opts } from '../core/input.js';
import { SFX } from '../core/audio.js';
import { PI, clamp, lerp, wrap, damp } from '../core/util.js';
import { JI, NJ, PL } from './rig.js';
import { Char } from './char.js';
import { CL } from './anim.js';
import { ATK } from './data.js';
import { FX, Trail, shock } from '../gfx/fx.js';
import { cam } from '../world/camera.js';

const tmpA = new T.Vector3(), tmpB = new T.Vector3();
const LEGS = [[JI.thL, JI.knL, JI.anL, 1], [JI.thR, JI.knR, JI.anR, -1]];
const RUN = 6.3;

export class Player extends Char {
  constructor() {
    super({ armor: 0xb3242a, trim: 0xdcae45, under: 0x40434f, dark: 0x25262e, steel: 0xe6e9ef, plume: 0xf1e7cf, cape: 0x27355e, shield: 0, rim: 0x2c3f86, legs: 1.22, pads: 0.88 });
    this.trail = new Trail(0xffe9b0); this.flashCol = [1, 0.15, 0.1]; this.rollDir = new T.Vector3(); this.reset(0, 0, 0);
  }
  reset(x, z, face) {
    this.hp = 100; this.st = 100; this.stDelay = 0; this.state = 'loco'; this.aT = 0; this.at = null; this.hitSet = new Set(); this.buf = { a: '', t: -9 }; this.inv = 0; this.lock = null;
    this.blockT = -9; this.charge = 0; this.runT = 0; this.dead = false; this.clip = null; this.blend = 1; this.hitDur = 0.4; this.wasBlock = false; this.sideT = -9;
    this.controlEnabled = true; this.place(x, z, face); this.stW = 1; this.leadW = 0;
  }
  // Body layer over every pose (clips and locomotion), so the weight sits in the legs and hips:
  // a lower, wider base; swings that turn from the hips with the torso following; and more
  // pelvis turn and contact dip when running. Off when opts.stance is false (pause menu).
  layer(src) {
    if (!opts.stance) return src;
    const o = this._lay || (this._lay = new Float32Array(PL)); o.set(src);
    const w = this.stW, hp = NJ * 3;
    if (w > 0.001) {
      let drop = 0;
      for (const [th, kn, an, sd] of LEGS) {
        // Bend less where the pose already bends deep, so lunges don't fold in half.
        const a = 0.33 * w * clamp(1 - o[kn * 3] / 1.5, 0.25, 1);
        o[th * 3] -= a; o[kn * 3] += 2 * a; o[an * 3] -= a; o[th * 3 + 2] += sd * 0.08 * w;
        drop = Math.max(drop, 0.8 * (1 - Math.cos(a)));
      }
      o[hp + 1] -= drop + 0.012 * w; o[JI.spine * 3] += 0.07 * w; o[JI.neck * 3] -= 0.05 * w;
    }
    // Swings: move a share of the torso's yaw down into the hips; the legs counter-turn so the feet stay put.
    const lw = this.leadW;
    if (lw > 0.001) {
      const ty = o[JI.spine * 3 + 1] + o[JI.chest * 3 + 1], d = 0.38 * ty * lw;
      o[JI.hips * 3 + 1] += d; o[JI.spine * 3 + 1] -= d * 0.6; o[JI.chest * 3 + 1] -= d * 0.4;
      o[JI.thL * 3 + 1] -= d; o[JI.thR * 3 + 1] -= d;
    }
    // Running: the pelvis turns with each stride against the shoulders, and dips as a foot lands.
    if (!this.clip && w > 0.001) {
      const run = clamp(this.speedN, 0, 1) * w, sn = Math.sin(this.phase), r = sn * 0.13 * run;
      o[JI.hips * 3 + 1] += r; o[JI.spine * 3 + 1] -= r * 0.8; o[JI.thL * 3 + 1] -= r; o[JI.thR * 3 + 1] -= r;
      o[JI.hips * 3 + 2] += Math.cos(this.phase) * 0.05 * run;
      o[hp + 1] -= Math.max(0, Math.cos(this.phase * 2)) * 0.03 * run;
    }
    return o;
  }
  take(a, win) { if (this.buf.a === a && G.time - this.buf.t < (win || 0.3)) { this.buf.a = ''; return true; } return false; }
  // Camera-relative stick as a world direction; returns its strength.
  stick(out) {
    if (!this.controlEnabled) { out.set(0, 0, 0); return 0; }
    const m = Math.hypot(I.mx, I.my); if (m < 0.18) { out.set(0, 0, 0); return 0; }
    const k = Math.min(1, (m - 0.18) / 0.72) / m, sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    out.set(cy * I.mx * k - sy * I.my * k, 0, -sy * I.mx * k - cy * I.my * k); return Math.min(1, (m - 0.18) / 0.72);
  }
  toggleLock() { this.lock = this.lock ? null : pickLock(false); }
  // Snap toward the lock target, or the best enemy near where the stick points.
  aim() {
    if (this.lock) { this.face = this.angleTo(this.lock); return; }
    const d = tmpA, m = this.stick(d); const dir = m > 0.3 ? Math.atan2(d.x, d.z) : this.face; let best = null, bs = 1.15;
    for (const e of G.targets()) {
      if (e.dead) continue; const ds = this.dist(e); if (ds > 5) continue;
      const an = Math.abs(wrap(this.angleTo(e) - dir)) + ds * 0.06; if (an < bs) { bs = an; best = e; }
    }
    this.face = best ? this.angleTo(best) : dir;
  }
  startAtk(k) {
    const a = ATK[k];
    if (a.st) { if (this.st < a.st * 0.5 && k !== 'hs' && k !== 'hc') return this.startAtk('l1'); this.st = Math.max(0, this.st - a.st); this.stDelay = 0.7; }
    this.aim(); this.at = a; this.state = 'atk'; this.aT = a.t0 || 0; this.hitSet.clear(); this.aoeDone = false; this.sw = false;
    const c = CL[a.clip]; this.play(c, k === 'hs' || k === 'hc' ? 0.03 : Math.max(0.05, c.keys[0].t - (a.t0 || 0)), a.t0 || 0);
    if (a.crit) { this.inv = a.dur; cam.zoomT = 0.75; }
  }
  ripTarget() { let b = null, bd = 4.2; for (const e of G.targets()) { if (e.dead || !e.open) continue; const d = this.dist(e); if (d < bd) { bd = d; b = e; } } return b; }
  riposte(e) {
    const d = tmpA.subVectors(e.pos, this.pos).setY(0), l = d.length() || 1; d.multiplyScalar(1 / l);
    if (l > 2.1) this.pos.copy(e.pos).addScaledVector(d, -2.0);
    const lk = this.lock; this.lock = e; this.startAtk('rp'); this.lock = lk;
  }
  startDodge() {
    const d = tmpA, m = this.stick(d); this.st -= 20; this.stDelay = 0.6; this.aT = 0; this.charge = 0; SFX.roll();
    if (m > 0.3) {
      this.rollDir.copy(d).normalize(); const la = wrap(Math.atan2(d.x, d.z) - this.face); this.state = 'roll'; this.inv = Math.max(this.inv, 0.4);
      // Sideways while locked or guarding: tumble across without turning away.
      if ((this.lock || I.block) && Math.abs(la) > 0.7 && Math.abs(la) < 2.45) { this.play(la > 0 ? CL.sideL : CL.sideR, 0.06); this.sideT = G.time; }
      else { this.face = Math.atan2(d.x, d.z); this.play(CL.roll, 0.06); }
    } else { this.state = 'back'; this.play(CL.back, 0.05); this.inv = Math.max(this.inv, 0.26); }
    FX.dust.emit(this.pos, 5, 1.2, 0xb8a37c, 0.4, { flat: 1, grav: -1, up: 0.4 });
  }
  // An enemy's blow arrives. Returns 'miss' | 'parry' | 'block' | 'hit'.
  receive(e, dmg) {
    if (this.dead || this.inv > 0) return 'miss';
    const dir = tmpA.subVectors(this.pos, e.pos).setY(0).normalize(), ang = Math.abs(wrap(Math.atan2(-dir.x, -dir.z) - this.face));
    const hp = tmpB.copy(this.pos).addScaledVector(dir, -0.5).setY(1.15);
    if (this.state === 'loco' && I.block && this.controlEnabled && ang < 1.7) {
      if (G.time - this.blockT < 0.24) {
        SFX.parry(); FX.sparks.emit(hp, 26, 6, 0xfff0b0, 0.4, { up: 1, boost: 2 }); G.hitstop = 0.13; G.slow = 0.28; G.shake = 0.25;
        e.parried(); this.state = 'parry'; this.aT = 0; this.play(CL.par, 0.04); this.inv = 0.5; this.st = Math.min(100, this.st + 25); return 'parry';
      }
      const cost = dmg * 1.35;
      if (this.st >= cost) {
        this.st -= cost; this.stDelay = 0.9; SFX.clang(); FX.sparks.emit(hp, 10, 4, 0xffd890, 0.25, { boost: 1.5 });
        this.vel.addScaledVector(dir, 4.5 + dmg * 0.12); this.recoil = 1; G.shake = 0.12; G.hitstop = 0.04; return 'block';
      }
      this.st = 0; this.stDelay = 1.4; dmg *= 0.5; this.hitDur = 0.95; SFX.clang();
    } else this.hitDur = 0.42;
    this.hp -= dmg; this.flash = 1; SFX.hurt(); FX.sparks.emit(hp, 12, 4, 0xff5040, 0.3); G.shake = 0.3 + dmg * 0.01; G.hitstop = 0.07;
    this.vel.copy(dir).multiplyScalar(6 + dmg * 0.15); this.charge = 0; this.trailOn = false;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.state = 'dead'; this.aT = 0; this.play(CL.death, 0.1); this.lock = null; SFX.fall(); G.emit('playerDead'); return 'hit'; }
    this.state = 'hit'; this.aT = 0; this.inv = 0.7; this.play(this.hitDur > 0.6 ? CL.stun : CL.hit, 0.05); return 'hit';
  }
  doHits(a) {
    for (const e of G.targets()) {
      if (e.dead || e.state === 'spawn' || this.hitSet.has(e)) continue;
      const d = this.dist(e); if (d > a.range + e.radius) continue;
      if (d > 1 && Math.abs(wrap(this.angleTo(e) - this.face)) > a.arc) continue;
      this.hitSet.add(e); e.takeHit(a, this, a.dmg * (a === ATK.hs ? 1 + (this.lastCharge || 0) * 0.3 : 1));
    }
  }
  update(dt) {
    const now = G.time; this.inv -= dt; this.aT += dt;
    const blockHeld = I.block && this.controlEnabled;
    if (this.stDelay > 0) this.stDelay -= dt; else this.st = Math.min(100, this.st + (blockHeld && this.state === 'loco' ? 12 : 30) * dt);
    if (this.lock && (this.lock.dead || this.dist(this.lock) > 24 || !this.lock.root.visible)) this.lock = pickLock(true);
    if (!this.controlEnabled) this.buf.a = '';
    const sd = tmpB, mag = this.stick(sd); this.trailOn = false;
    let near = false; for (const e of G.targets()) if (!e.dead && this.dist(e) < 9) { near = true; break; }
    const S_ = this.state;
    this.stW = damp(this.stW, S_ === 'roll' || S_ === 'back' || S_ === 'dead' ? 0 : 1, 14, dt);
    this.leadW = damp(this.leadW, S_ === 'atk' || S_ === 'wind' || S_ === 'parry' ? 1 : 0, 10, dt);
    if (S_ === 'loco') {
      if (blockHeld && !this.wasBlock) this.blockT = now; this.wasBlock = blockHeld;
      const maxSp = blockHeld ? 2.4 : this.lock ? 4.7 : RUN;
      const k = 1 - Math.exp(-(mag > 0 ? 11 : 14) * dt); this.vel.x = lerp(this.vel.x, sd.x * maxSp, k); this.vel.z = lerp(this.vel.z, sd.z * maxSp, k);
      let d = 0;
      if (this.lock) d = this.turnTo(this.angleTo(this.lock), 11, dt);
      else if (blockHeld && near) { const e = nearest(); if (e) d = this.turnTo(this.angleTo(e), 9, dt); }
      else if (mag > 0.05) d = this.turnTo(Math.atan2(sd.x, sd.z), 13, dt);
      this.turnLean = damp(this.turnLean, this.lock ? 0 : clamp(-d * 0.45, -0.3, 0.3) * Math.min(1, this.speedN), 9, dt);
      this.setLoco(RUN, dt);
      this.runT = this.speedN > 0.9 && !this.lock && !blockHeld ? this.runT + dt : 0;
      this.guard = damp(this.guard, this.lock || blockHeld || near ? 1 : 0, 7, dt); this.blockW = damp(this.blockW, blockHeld ? 1 : 0, 24, dt);
      if (this.speedN > 0.75 && Math.sin(this.phase) * Math.sin(this.phase - dt * 11) < 0) FX.dust.emit(this.pos, 1, 0.5, 0xb8a37c, 0.35, { flat: 1, grav: -1.2, up: 0.3 });
      if (this.take('d')) { if (this.st >= 12) this.startDodge(); else G.emit('tired'); }
      else if (this.take('l')) { const r = this.ripTarget(); if (r) this.riposte(r); else this.startAtk(this.runT > 0.5 && this.st >= 10 ? 'sa' : 'l1'); }
      else if (this.take('h')) { if (this.st < 8) G.emit('tired'); else { this.state = 'wind'; this.aT = 0; this.charge = 0; this.fullCue = false; this.aim(); this.play(CL.hw, 0.22); } }
    } else if (S_ === 'atk') {
      const a = this.at, f = this.fwd(tmpA); let sp = this.aT >= a.move[0] && this.aT < a.move[1] ? a.move[2] : 0;
      // Don't drive through whoever is directly ahead.
      if (sp > 0 && a !== ATK.sa) for (const e of G.targets()) { if (e.dead) continue; const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z; if (dx * f.x + dz * f.z > 0 && Math.hypot(dx, dz) < 1.35 + e.radius) { sp = 0; break; } }
      const k = 1 - Math.exp(-30 * dt); this.vel.x = lerp(this.vel.x, f.x * sp, k); this.vel.z = lerp(this.vel.z, f.z * sp, k);
      this.trailOn = this.aT >= a.act[0] - 0.06 && this.aT <= a.act[1] + 0.05;
      if (!this.sw && this.aT >= a.act[0] - 0.04) { this.sw = true; SFX.swing(a.snd); }
      if (this.aT >= a.act[0] && this.aT <= a.act[1]) this.doHits(a);
      if (a.aoe && !this.aoeDone && this.aT >= a.act[0] + 0.06) {
        this.aoeDone = true; const c = tmpB.copy(this.pos).addScaledVector(f, 1.7); shock(c, a.aoe); SFX.boom(); G.shake = 0.55;
        for (const e of G.targets()) { if (e.dead || this.hitSet.has(e) || e.state === 'spawn') continue; if (e.pos.distanceTo(c) < a.aoe + e.radius) { this.hitSet.add(e); e.takeHit(a, this, a.dmg * 0.6); } }
      }
      if (this.aT >= a.cancel) {
        if (a.next.l && this.take('l', 0.45)) this.startAtk(a.next.l);
        else if (a.next.h && this.take('h', 0.45)) this.startAtk(a.next.h);
        else if (this.take('d', 0.3)) { if (this.st >= 12) this.startDodge(); else G.emit('tired'); }
        else if (this.take('l', 0.2) && this.aT >= a.dur - 0.12) this.startAtk('l1');
      }
      if (this.state === 'atk' && this.aT >= a.dur) { this.state = 'loco'; this.stop(0.14); }
      this.speedN = 0;
    } else if (S_ === 'wind') {
      this.vel.multiplyScalar(Math.exp(-12 * dt)); this.speedN = 0;
      if (this.lock) this.turnTo(this.angleTo(this.lock), 6, dt); else if (mag > 0.3) this.turnTo(Math.atan2(sd.x, sd.z), 5, dt);
      this.charge = clamp((this.aT - 0.32) / 0.62, 0, 1);
      if (this.charge > 0 && Math.random() < 0.5) FX.sparks.emit(this.rig.wTip.getWorldPosition(tmpA), 1, 1.2, 0xffd070, 0.3, { grav: -2 });
      if (this.charge >= 1 && !this.fullCue) { this.fullCue = true; SFX.charged(); this.flashCol = [1, 0.8, 0.3]; this.flash = 0.7; FX.sparks.emit(this.rig.wTip.getWorldPosition(tmpA), 14, 3, 0xfff0b0, 0.35, { boost: 2 }); }
      const held = I.heavy && this.controlEnabled;
      if (this.take('d')) { if (this.st >= 12) { this.flashCol = [1, 0.15, 0.1]; this.startDodge(); } else G.emit('tired'); }
      else if ((!held && this.aT >= 0.3) || this.aT > 2.2) { this.lastCharge = this.charge; this.flashCol = [1, 0.15, 0.1]; this.startAtk(this.charge >= 1 ? 'hc' : 'hs'); this.charge = 0; }
    } else if (S_ === 'roll') {
      const sp = this.aT < 0.36 ? 9.4 : lerp(9.4, 3, (this.aT - 0.36) / 0.2); this.vel.copy(this.rollDir).multiplyScalar(sp); this.speedN = 0;
      if (this.aT > 0.3 && this.take('l', 0.4)) this.startAtk('ra');
      else if (this.aT >= 0.56) { this.state = 'loco'; this.stop(0.1); }
    } else if (S_ === 'back') {
      const f = this.fwd(tmpA), sp = this.aT < 0.2 ? -8.5 : -1.5; this.vel.set(f.x * sp, 0, f.z * sp); this.speedN = 0;
      if (this.aT > 0.2 && this.take('l', 0.4)) this.startAtk('ra');
      else if (this.aT >= 0.36) { this.state = 'loco'; this.stop(0.1); }
    } else if (S_ === 'hit') {
      this.vel.multiplyScalar(Math.exp(-7 * dt)); this.speedN = 0; if (this.aT >= this.hitDur) { this.state = 'loco'; this.stop(0.16); }
    } else if (S_ === 'parry') {
      this.vel.multiplyScalar(Math.exp(-10 * dt)); this.speedN = 0;
      if (this.take('l', 0.5)) { const r = this.ripTarget(); if (r) this.riposte(r); else this.startAtk('l1'); }
      else if (this.aT >= 0.34) { this.state = 'loco'; this.stop(0.12); }
    } else if (S_ === 'dead') { this.vel.multiplyScalar(Math.exp(-6 * dt)); this.speedN = 0; }
    const gl = this.charge * 2.5; this.rig.bladeMat.emissive.setRGB(gl, gl * 0.7, gl * 0.2);
  }
}

export function nearest() { const p = G.player; let b = null, bd = 1e9; for (const e of G.targets()) { if (e.dead) continue; const d = e.pos.distanceToSquared(p.pos); if (d < bd) { bd = d; b = e; } } return b; }
export function pickLock(auto) {
  const p = G.player; let b = null, bs = 1e9; const fy = cam.yaw + PI;
  for (const e of G.targets()) {
    if (e.dead || !e.root.visible) continue; const d = p.dist(e); if (d > (auto ? 12 : 18)) continue;
    const s = d + (auto ? 0 : Math.abs(wrap(p.angleTo(e) - fy)) * 5); if (s < bs) { bs = s; b = e; }
  }
  return b;
}
