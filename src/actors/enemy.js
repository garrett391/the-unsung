import * as T from 'three';
import { G } from '../core/game.js';
import { SFX } from '../core/audio.js';
import { PI, clamp, lerp, sstep, wrap, damp, rnd } from '../core/util.js';
import { Char } from './char.js';
import { CL } from './anim.js';
import { TYPES } from './data.js';
import { FX, Trail, shock, blood } from '../gfx/fx.js';
import { pickLock } from './player.js';
import { steer } from '../world/level.js';

const tmpA = new T.Vector3(), tmpB = new T.Vector3();
export const attackers = () => G.enemies.reduce((n, e) => n + (e.state === 'wind' || e.state === 'strike' ? 1 : 0), 0);

export class Enemy extends Char {
  constructor(kind, x, z, o = {}) {
    const t = TYPES[kind]; super(t.look, t.scale);
    this.kind = kind; this.type = t; this.hp = this.maxHp = t.hp * (o.hpMul || 1); this.pos.set(x, 0, z); this.guard = 1;
    this.state = o.rise ? 'spawn' : 'chase'; this.yoff = o.rise ? -2 : 0; this.st = 0;
    this.cd = rnd(0.8, 2.2); this.dir = Math.random() < 0.5 ? 1 : -1; this.poise = t.poise; this.gp = 3; this.yv = 0;
    this.hitDone = false; this.stagDur = 0.45; this.mv = t.moves[0]; this.phase2 = false;
    this.trail = new Trail(t.boss ? 0xb48cff : t.heavy ? 0xff6a40 : 0xffb070); this.trail.life = 0.12;
    this.face = Math.atan2(G.player.pos.x - x, G.player.pos.z - z); this.eyeBase = new T.Color(t.look.eye);
    this.animate(0, G.time); // place the figure now: it is created after this frame's animation pass, and would be drawn once at the world origin
  }
  set(s) { this.state = s; this.st = 0; }
  parried() { this.set('parried'); this.open = true; this.play(CL.stun, 0.06); this.vel.set(0, 0, 0); this.trailOn = false; this.yoff = 0; }
  die() {
    this.dead = true; this.open = false; this.set('dead'); this.play(CL.death, 0.08); this.trailOn = false; G.kills++; SFX.die();
    if (G.player.lock === this) G.player.lock = pickLock(true);
    G.emit('kill', { enemy: this });
  }
  flee() { if (!this.dead) this.set('flee'); }
  // Returns 'block' | 'hit' | 'kill'.
  takeHit(a, from, dmg) {
    const dir = tmpA.subVectors(this.pos, from.pos).setY(0).normalize(), hp = new T.Vector3().copy(this.pos).addScaledVector(dir, -0.4).setY(1.1 * this.scale + this.yoff);
    const facing = Math.abs(wrap(Math.atan2(-dir.x, -dir.z) - this.face)) < 1.25;
    if (this.type.shield && facing && !this.open && (this.state === 'chase' || this.state === 'circle' || this.state === 'wind') && !a.crit) {
      if (a.poise < 3) {
        this.gp--; SFX.clang(); FX.sparks.emit(hp, 9, 4, 0xffe0a0, 0.25, { boost: 1.5 }); G.hitstop = Math.max(G.hitstop, 0.05); G.shake = Math.max(G.shake, 0.1);
        this.vel.addScaledVector(dir, 3); this.recoil = 1;
        if (this.gp <= 0) { this.gp = 3; this.stagDur = 1.3; this.open = true; this.set('stagger'); this.play(CL.stun, 0.08); }
        return 'block';
      }
      this.gp = 3; this.stagDur = 1.4; this.open = true; SFX.clang(); // guard broken: this hit lands
    }
    const wasOpen = this.open; dmg *= wasOpen && !a.crit ? 1.5 : 1; this.hp -= dmg; this.flash = 1;
    (a.heavy || a.crit ? SFX.big : SFX.hit)();
    FX.sparks.emit(hp, a.crit ? 34 : a.heavy ? 20 : 11, a.crit ? 8 : 5.5, a.crit ? 0xffe890 : 0xfff4d0, 0.32, { vx: dir.x * 3, vz: dir.z * 3, up: 1, boost: 1.6 });
    G.hitstop = Math.max(G.hitstop, a.stop || 0.05); G.shake = Math.max(G.shake, a.crit ? 0.5 : a.heavy ? 0.35 : 0.16); if (a.crit) G.slow = 0.4;
    this.vel.copy(dir).multiplyScalar((a.knock || 2) / (this.scale * this.scale));
    blood(hp, dir, a.crit ? 3 : a.heavy ? 2 : 1, this.hp <= 0);
    if (this.hp <= 0) { this.die(); if (a.launch) { this.yv = a.launch * 0.7; this.yoff = 0.01; } return 'kill'; }
    if (a.launch && !this.type.heavy) { this.set('air'); this.yv = a.launch; this.yoff = 0.02; this.play(CL.air, 0.08); this.open = false; this.trailOn = false; return 'hit'; }
    if (this.state === 'air') { this.yv = Math.max(this.yv, 3.5); return 'hit'; }
    if (this.state === 'down') return 'hit';
    this.poise -= a.poise || 1;
    // A boss that was just staggered can't be chained into another one.
    if (this.type.boss && G.time < (this.armorT || 0) && this.state !== 'parried') { this.poise = Math.max(this.poise, 1); return 'hit'; }
    if (this.type.boss) this.armorT = G.time + 4;
    if (this.poise <= 0 || this.state === 'parried' || this.state === 'stagger' || (this.state === 'recover' && this.type.poise < 4)) {
      this.poise = this.type.poise;
      if ((this.state !== 'parried' && this.state !== 'stagger') || a.crit) { this.stagDur = wasOpen && !a.crit ? this.stagDur : 0.5; this.set('stagger'); this.open = false; }
      this.clip = null; this.play(CL.hit, 0.05); this.trailOn = false; this.yoff = 0;
    }
    return 'hit';
  }
  pickMove(d) {
    const ms = this.type.moves; if (ms.length === 1) return ms[0];
    const far = ms.filter((m) => m.minD && d >= m.minD); if (far.length && Math.random() < 0.75) return far[0];
    const near = ms.filter((m) => !m.minD); return near[(Math.random() * near.length) | 0];
  }
  startMove(m, blend) {
    this.mv = m; this.set('wind'); this.hitDone = false; this.slam = false; this.play(m.clip, blend || 0.14); SFX.tele();
    FX.sparks.emit(this.rig.wTip.getWorldPosition(tmpB), 8, 2, this.type.look.eye, 0.4, { grav: 0, boost: 2 });
  }
  update(dt) {
    this.st += dt; const t = this.type, P_ = G.player, m = this.mv;
    const dx = P_.pos.x - this.pos.x, dz = P_.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.001, ang = Math.atan2(dx, dz), f = this.fwd(tmpA);
    const brake = (k) => this.vel.multiplyScalar(Math.exp(-k * dt)); let eye = 1;
    const speed = t.speed + (this.phase2 ? 0.8 : 0);
    if (G.freezeAI && ['chase', 'circle', 'wind', 'strike', 'recover'].includes(this.state)) { brake(8); this.trailOn = false; this.setLoco(4, dt); return; }
    switch (this.state) {
      case 'spawn':
        this.yoff = lerp(-1.9 * this.scale, 0, sstep(Math.min(1, this.st / 0.9)));
        if (Math.random() < 0.5) FX.dust.emit(this.pos, 1, 1.5, 0xb8a37c, 0.4, { flat: 1, spread: 0.4, grav: -1 });
        if (this.st >= 0.9) { this.yoff = 0; this.set('chase'); } break;
      case 'chase':
        this.turnTo(steer(this.pos, this.radius, ang, d), 6, dt); this.vel.x = damp(this.vel.x, f.x * speed, 6, dt); this.vel.z = damp(this.vel.z, f.z * speed, 6, dt);
        if (d < 3.6 * this.scale) this.set('circle'); break;
      case 'circle': {
        this.turnTo(ang, 7, dt); const want = 2.7 + this.radius, rad = clamp((d - want) * 2.2, -1.6, speed), tan = this.dir * 1.35, nx = dx / d, nz = dz / d;
        this.vel.x = damp(this.vel.x, nx * rad + nz * tan, 6, dt); this.vel.z = damp(this.vel.z, nz * rad - nx * tan, 6, dt);
        if (Math.random() < dt * 0.25) this.dir *= -1; if (d > 6.5 && !t.boss) this.set('chase'); this.cd -= dt;
        const reach = t.boss ? 12 : 4.4 * this.scale;
        if (this.cd <= 0 && d < reach && !P_.dead && attackers() < G.maxAtk) this.startMove(this.pickMove(d));
        break; }
      case 'wind': {
        this.turnTo(ang, this.st < m.wind * 0.72 ? 6 : 0.8, dt); eye = 2.6;
        let sp = 0.7;
        if (m.leap) { const u = (this.st - (m.wind - 0.2)) / 0.42; if (u > 0) { this.yoff = Math.sin(PI * clamp(u, 0, 1)) * 1.5; sp = m.lunge; } }
        this.vel.x = damp(this.vel.x, f.x * sp, 8, dt); this.vel.z = damp(this.vel.z, f.z * sp, 8, dt);
        if (this.st >= m.wind) { this.set('strike'); SFX.swing(t.heavy ? 0.45 : 0.8); } break; }
      case 'strike': {
        const sp = this.st < 0.15 ? m.lunge : 0; this.vel.x = damp(this.vel.x, f.x * sp, 25, dt); this.vel.z = damp(this.vel.z, f.z * sp, 25, dt); this.trailOn = this.st < 0.2; eye = 2.6;
        if (m.leap) this.yoff = Math.sin(PI * clamp((0.2 + this.st) / 0.42, 0, 1)) * 1.5;
        if (!this.hitDone && this.st > 0.04 && this.st < 0.17 && d < m.range && Math.abs(wrap(ang - this.face)) < 0.95) { this.hitDone = true; P_.receive(this, m.dmg); }
        if (m.slam && !this.slam && this.st > 0.1) {
          this.slam = true; const c = tmpB.copy(this.pos).addScaledVector(f, 1.6 * this.scale); shock(c, m.slam, t.boss ? 0xc79bff : 0xffe2a0); SFX.boom(); G.shake = Math.max(G.shake, 0.3);
          if (!this.hitDone && P_.pos.distanceTo(c) < m.slam + 0.3) { this.hitDone = true; P_.receive(this, m.dmg * 0.7); }
        }
        if (this.st >= 0.3 && this.state === 'strike') {
          this.trailOn = false; this.yoff = 0;
          if (m.chain && Math.random() < m.chain + (this.phase2 ? 0.2 : 0) && !P_.dead) this.startMove(t.moves[m.then], 0.1);
          else this.set('recover');
        } break; }
      case 'recover': brake(8); if (this.st >= m.rec) { this.set('circle'); this.stop(0.2); this.cd = rnd(0.9, 2.3) * (this.phase2 ? 0.45 : t.boss ? 0.7 : 1); } break;
      case 'stagger': brake(6); if (this.st >= this.stagDur) { this.open = false; this.set('circle'); this.stop(0.2); this.cd = rnd(0.5, 1.4); } break;
      case 'parried':
        brake(8); if (Math.random() < 0.3) FX.sparks.emit(tmpB.copy(this.pos).setY(2 * this.scale), 1, 0.8, 0xfff0b0, 0.4, { grav: -1 });
        if (this.st >= (t.boss ? 1.5 : 1.9)) { this.open = false; this.set('circle'); this.stop(0.25); this.cd = rnd(0.6, 1.4); } break;
      case 'air':
        this.yv -= 20 * dt; this.yoff += this.yv * dt; this.vel.multiplyScalar(Math.exp(-1 * dt));
        if (this.yoff <= 0 && this.yv < 0) { this.yoff = 0; this.set('down'); this.play(CL.down, 0.06); FX.dust.emit(this.pos, 8, 2, 0xb8a37c, 0.4, { flat: 1, grav: -1 }); G.shake = Math.max(G.shake, 0.15); } break;
      case 'down': brake(8); if (this.st >= 1.0) { this.set('getup'); this.stop(0.4); } break;
      case 'getup': brake(8); if (this.st >= 0.4) { this.set('circle'); this.cd = rnd(0.4, 1.2); } break;
      case 'flee': {
        this.turnTo(steer(this.pos, this.radius, Math.atan2(-dx, -dz), 6), 8, dt);
        this.vel.x = damp(this.vel.x, f.x * 5.5, 6, dt); this.vel.z = damp(this.vel.z, f.z * 5.5, 6, dt); if (this.st > 4) this.gone = true; break; }
      case 'dead':
        brake(5); eye = Math.max(0, 1 - this.st);
        if (this.yoff > 0 || this.yv > 0) { this.yv -= 20 * dt; this.yoff = Math.max(0, this.yoff + this.yv * dt); }
        else if (this.st > 1.0) { this.yoff -= dt * 0.9; if (Math.random() < 0.6) FX.sparks.emit(tmpB.copy(this.pos).setY(0.2), 1, 1, t.look.eye, 0.7, { spread: 0.5, grav: -2.5 }); }
        if (this.st > 2.3) this.gone = true; break;
    }
    if (this.open) eye = 0.3 + 0.3 * Math.sin(G.time * 20);
    this.rig.eye.color.copy(this.eyeBase).multiplyScalar(Math.min(3, eye * 1.6));
    this.setLoco(4, dt);
  }
}
