import * as THREE from 'three';
import {
  makeRig, resetPose, poseStance, poseBreath, poseLocomotion, applyShield, poseSlash, poseSpin, poseCharge,
  poseRoll, poseVault, poseHurt, poseKneel, poseLie, poseFallBack, poseCast, poseCrouch,
} from './rig.js';
import { angleDiff, angleTo, turnToward, clamp, lerp, damp, rand, TAU, smooth, easeOut } from './util.js';
import { projectWalkable, pushObstacles, CAMPFIRE } from './world.js';
import { Batch } from './batch.js';

export const SKILLS = {
  bash: { name: 'Shield Attack', how: 'Hold {shield}, then press {attack}. Breaks a guard.' },
  backslice: { name: 'Back Slice', how: 'Locked on, roll sideways ({side} + {roll}), then {attack}.' },
  helm: { name: 'Helm Splitter', how: 'Shield Attack, then {roll} while they reel.' },
  greatspin: { name: 'Great Spin', how: 'At full health, hold {attack} and release.' },
  ending: { name: 'Ending Blow', how: 'Press {attack} on a fallen foe.' },
};

const SHADOW_GEO = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2);
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
const _v = new THREE.Vector3();

export class Actor {
  constructor(game, kind, o = {}) {
    this.game = game;
    this.kind = kind;
    this.rig = makeRig(kind, o.rigOpts);
    this.pos = new THREE.Vector3(o.x || 0, 0, o.z || 0);
    this.vel = new THREE.Vector3();
    this.facing = o.facing || 0;
    this.radius = o.radius || 0.42;
    this.y = 0;
    this.alive = true;
    this.solid = true;
    this.state = 'idle';
    this.st = 0;
    this.phase = 0;
    this.moveAmt = 0;
    this.flashT = 0;
    this.flashOn = false;
    this.entering = false;
    this.shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    this.shadow.scale.setScalar((this.radius / 0.42) * (this.rig.scale || 1));
    this.shadow.renderOrder = 1;
    game.scene.add(this.rig.root);
    game.scene.add(this.shadow);
  }
  setState(s) { this.state = s; this.st = 0; }
  get fx() { return Math.sin(this.facing); }
  get fz() { return Math.cos(this.facing); }
  dist(o) { return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }
  angleTo(o) { return angleTo(this.pos.x, this.pos.z, o.pos.x, o.pos.z); }
  flash(t = 0.12) { this.flashT = t; }
  tickFlash(dt) {
    if (this.flashT > 0) this.flashT -= dt;
    const on = this.flashT > 0;
    if (on !== this.flashOn) {
      this.flashOn = on;
      for (const m of this.rig.mats) if (m.emissive) m.emissive.setHex(on ? 0x8a7a7a : 0x000000);
    }
  }
  integrate(dt) { this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; }
  confine() {
    if (this.entering) {
      if (this.pos.z < 20.2 && Math.abs(this.pos.x) < 16.4) this.entering = false;
      else return;
    }
    pushObstacles(this.pos, this.radius);
    projectWalkable(this.pos, this.radius);
  }
  locomotion(dt, speed) {
    this.moveAmt = damp(this.moveAmt, clamp(speed / 5, 0, 1), 10, dt);
    this.phase += dt * (speed * 4.6 + (speed > 0.1 ? 2 : 0));
  }
  sync() {
    const r = this.rig.root;
    r.position.set(this.pos.x, this.y, this.pos.z);
    r.rotation.y = this.facing;
    this.shadow.position.set(this.pos.x, 0.03, this.pos.z);
    this.shadow.visible = r.visible;
    const k = clamp(1 - this.y / 3, 0.3, 1);
    this.shadow.scale.setScalar((this.radius / 0.42) * (this.rig.scale || 1) * k);
  }
  handPos(out = _v) { return this.rig.handS.getWorldPosition(out); }
  dispose() {
    this.game.scene.remove(this.rig.root);
    this.game.scene.remove(this.shadow);
  }
  setVisible(v) { this.rig.root.visible = v; this.shadow.visible = v; }
}

// ===========================================================================
// The captain
// ===========================================================================
export class Player extends Actor {
  constructor(game) {
    super(game, 'captain', { radius: 0.42 });
    this.maxHp = 12;
    this.hp = 12;
    this.inv = 0;
    this.lock = null;
    this.controlEnabled = false;
    this.skills = new Set();
    this.combo = 0;
    this.hitSet = new Set();
    this.atkHold = false;
    this.charge = 0;
    this.sideRollEnd = -9;
    this.guard = 0;
    this.scriptPose = null;
    this.atkKind = 'h1';
    this.atkDur = 0.34;
  }
  reset(x, z, facing) {
    this.pos.set(x, 0, z);
    this.facing = facing;
    this.vel.set(0, 0, 0);
    this.y = 0;
    this.lock = null;
    this.inv = 0;
    this.combo = 0;
    this.charge = 0;
    this.alive = true;
    this.scriptPose = null;
    this.hitSet.clear();
    this.setState('idle');
  }
  update(dt) {
    const g = this.game, I = g.input;
    this.st += dt;
    if (this.inv > 0) this.inv -= dt;
    const ctrl = this.controlEnabled && this.alive && !g.ui.dialogueOpen && this.state !== 'script';
    let mx = 0, my = 0;
    if (ctrl) { mx = I.move.x; my = I.move.y; }
    const mag = Math.min(1, Math.hypot(mx, my));
    const cfx = g.cam.fwdX, cfz = g.cam.fwdZ;
    const wx = -cfz * mx + cfx * my, wz = cfx * mx + cfz * my;
    if (ctrl && I.pressed('lock')) this.toggleLock();
    if (this.lock && !this.lock.lockable()) this.retarget();
    switch (this.state) {
      case 'idle': this.sFree(dt, wx, wz, mag, ctrl); break;
      case 'shield': this.sShield(dt, wx, wz, mag, ctrl); break;
      case 'attack': this.sAttack(dt, wx, wz, mag, ctrl); break;
      case 'charge': this.sCharge(dt, wx, wz, mag, ctrl); break;
      case 'spin': this.sSpin(dt); break;
      case 'bash': this.sBash(dt, wx, wz, mag, ctrl); break;
      case 'roll': this.sRoll(dt, ctrl); break;
      case 'backslice': this.sBackSlice(dt); break;
      case 'helm': this.sHelm(dt); break;
      case 'hurt':
        this.vel.x = damp(this.vel.x, 0, 7, dt);
        this.vel.z = damp(this.vel.z, 0, 7, dt);
        if (this.st >= 0.32) this.setState('idle');
        break;
      case 'dead':
        this.vel.x = damp(this.vel.x, 0, 5, dt);
        this.vel.z = damp(this.vel.z, 0, 5, dt);
        break;
      default:
        break;
    }
    this.integrate(dt);
    if (this.state !== 'script') this.confine();
    this.animate(dt);
    this.tickFlash(dt);
    this.sync();
  }
  faceLock(dt, rate) {
    if (this.lock) this.facing = turnToward(this.facing, this.angleTo(this.lock), rate * dt);
  }
  sFree(dt, wx, wz, mag, ctrl) {
    const I = this.game.input, L = this.lock;
    if (mag > 0.1) {
      const n = Math.hypot(wx, wz) || 1;
      const dx = wx / n, dz = wz / n;
      const spd = L ? 4.3 : mag > 0.55 ? 5.6 : 2.4;
      this.vel.x = dx * spd;
      this.vel.z = dz * spd;
      if (!L) this.facing = turnToward(this.facing, Math.atan2(dx, dz), 13 * dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 14, dt);
      this.vel.z = damp(this.vel.z, 0, 14, dt);
    }
    this.faceLock(dt, 16);
    if (!ctrl) return;
    if (I.pressed('roll')) return this.startRoll(wx, wz, mag);
    if (I.down('shield')) {
      if (I.pressed('attack') && this.skills.has('bash')) return this.startBash();
      this.setState('shield');
      return;
    }
    if (I.pressed('attack')) this.startAttack();
  }
  sShield(dt, wx, wz, mag, ctrl) {
    const I = this.game.input;
    if (mag > 0.1) {
      const n = Math.hypot(wx, wz) || 1;
      this.vel.x = (wx / n) * 1.7;
      this.vel.z = (wz / n) * 1.7;
      if (!this.lock) this.facing = turnToward(this.facing, Math.atan2(wx, wz), 4 * dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 14, dt);
      this.vel.z = damp(this.vel.z, 0, 14, dt);
    }
    this.faceLock(dt, 12);
    if (!ctrl || !I.down('shield')) { this.setState('idle'); return; }
    if (I.pressed('attack') && this.skills.has('bash')) return this.startBash();
    if (I.pressed('roll')) return this.startRoll(wx, wz, mag);
  }
  softFace() {
    if (this.lock) return;
    const t = this.game.softTarget(this, 3.2, 1.25);
    if (t) this.facing = this.angleTo(t);
  }
  startAttack() {
    const g = this.game;
    if (this.lock && this.skills.has('backslice') && g.clock - this.sideRollEnd < 0.5) return this.startBackSlice();
    this.softFace();
    this.combo = 1;
    this.atkKind = 'h1';
    this.atkDur = 0.34;
    this.hitSet.clear();
    this.queued = false;
    this.atkHold = true;
    this.arcShown = false;
    this.charge = 0;
    this.setState('attack');
    g.audio.swing(0);
  }
  sAttack(dt, wx, wz, mag, ctrl) {
    const g = this.game, I = g.input, t = this.st / this.atkDur;
    if (this.atkHold && (!ctrl || !I.down('attack'))) this.atkHold = false;
    this.faceLock(dt, 10);
    const lunge = t > 0.25 && t < 0.5 ? (this.combo === 3 ? 3.4 : 2.3) : 0;
    this.vel.x = this.fx * lunge;
    this.vel.z = this.fz * lunge;
    if (t >= 0.3 && !this.arcShown) { this.arcShown = true; g.fx.arc(this, this.atkKind); }
    if (t >= 0.3 && t <= 0.56) this.sweep(2.05, this.atkKind === 'v' ? 0.8 : 1.3, this.combo === 3 ? 2 : 1, 'slash');
    if (ctrl && I.pressed('attack') && t > 0.2) this.queued = true;
    if (ctrl && I.pressed('roll') && t > 0.5) return this.startRoll(wx, wz, mag);
    if (t >= 1) {
      if (this.queued && this.combo < 3) {
        this.combo++;
        this.atkKind = this.combo === 2 ? 'h2' : 'v';
        this.atkDur = this.combo === 3 ? 0.42 : 0.34;
        this.hitSet.clear();
        this.queued = false;
        this.arcShown = false;
        this.st = 0;
        this.softFace();
        g.audio.swing(0);
        return;
      }
      if (this.atkHold) {
        this.setState('charge');
        this.charge = 0;
        g.audio.chargeStart();
        return;
      }
      this.combo = 0;
      this.setState('idle');
    }
  }
  sCharge(dt, wx, wz, mag, ctrl) {
    const g = this.game, I = g.input;
    const prev = this.charge;
    this.charge += dt;
    if (prev < 0.5 && this.charge >= 0.5) g.audio.chargeReady();
    if (mag > 0.1) {
      const n = Math.hypot(wx, wz) || 1;
      this.vel.x = (wx / n) * 1.9;
      this.vel.z = (wz / n) * 1.9;
      if (!this.lock) this.facing = turnToward(this.facing, Math.atan2(wx, wz), 6 * dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 14, dt);
      this.vel.z = damp(this.vel.z, 0, 14, dt);
    }
    this.faceLock(dt, 12);
    if (!ctrl || !I.down('attack')) {
      if (this.charge >= 0.5) return this.startSpin();
      this.setState('idle');
      return;
    }
    if (I.pressed('roll')) return this.startRoll(wx, wz, mag);
  }
  startSpin() {
    const g = this.game;
    const great = this.skills.has('greatspin') && this.hp >= this.maxHp;
    this.spinGreat = great;
    this.spinDur = great ? 0.62 : 0.46;
    this.hitSet.clear();
    this.setState('spin');
    g.audio.spin(great);
    g.fx.arc(this, 'spin', great ? 0xc8fff2 : 0xdfe9ff, great ? 3.4 : 2.4);
    if (great) {
      g.fx.shockwave(this.pos.x, this.pos.z, 4.4);
      g.callout('Great Spin');
      g.emit('greatspin');
    }
  }
  sSpin(dt) {
    const t = this.st / this.spinDur;
    this.vel.x = damp(this.vel.x, 0, 10, dt);
    this.vel.z = damp(this.vel.z, 0, 10, dt);
    if (t > 0.08 && t < 0.85) this.sweep(this.spinGreat ? 4.2 : 2.7, Math.PI, this.spinGreat ? 3 : 2, 'spin', { knock: this.spinGreat ? 6 : 3.5 });
    if (this.spinGreat && Math.random() < 0.6) this.game.fx.flame(this.pos.x + rand(-1, 1), 0.6, this.pos.z + rand(-1, 1), 0xbff5ea);
    if (t >= 1) this.setState('idle');
  }
  startBash() {
    this.setState('bash');
    this.hitSet.clear();
    this.bashDur = 0.38;
    this.rollQueued = false;
    this.game.audio.roll();
  }
  sBash(dt, wx, wz, mag, ctrl) {
    const g = this.game, t = this.st / this.bashDur;
    // a roll pressed during the bash comes out as soon as the shove lands (Helm Splitter)
    if (ctrl && g.input.pressed('roll')) this.rollQueued = true;
    if (this.rollQueued && t > 0.5) { this.rollQueued = false; return this.startRoll(wx, wz, mag); }
    const push = t < 0.35 ? 4 : 0;
    this.vel.x = this.fx * push;
    this.vel.z = this.fz * push;
    this.faceLock(dt, 12);
    if (t > 0.12 && t < 0.5) {
      for (const e of g.hittables()) {
        if (this.hitSet.has(e) || !e.alive) continue;
        const d = this.dist(e) - e.radius;
        if (d > 1.75) continue;
        if (Math.abs(angleDiff(this.facing, this.angleTo(e))) > 0.95) continue;
        this.hitSet.add(e);
        if (e.receiveBash) e.receiveBash(this);
        g.hitStop(0.07);
        g.cam.shake(0.12, 0.12);
      }
    }
    if (t >= 1) this.setState(g.input.down('shield') && this.controlEnabled ? 'shield' : 'idle');
  }
  startRoll(wx, wz, mag) {
    const g = this.game, L = this.lock;
    if (L && this.skills.has('helm') && L.canHelmSplit && L.canHelmSplit(g.clock) && this.dist(L) < 3.6) return this.startHelm();
    let kind = 'fwd', dirA = this.facing;
    if (L) {
      const toT = this.angleTo(L);
      const fX = Math.sin(toT), fZ = Math.cos(toT), rX = -fZ, rZ = fX;
      const n = Math.hypot(wx, wz) || 1;
      const along = mag > 0.2 ? (wx * fX + wz * fZ) / n : 1;
      const side = mag > 0.2 ? (wx * rX + wz * rZ) / n : 0;
      if (Math.abs(side) > 0.5) kind = side > 0 ? 'right' : 'left';
      else if (along < -0.5) kind = 'back';
      dirA = toT;
      if (kind === 'right' || kind === 'left') {
        this.orbitR = clamp(this.dist(L) * 0.85, 1.6, 2.6);
        this.orbitA0 = angleTo(L.pos.x, L.pos.z, this.pos.x, this.pos.z);
        this.orbitSign = kind === 'right' ? 1 : -1;
        this.orbitTarget = L;
      }
    } else if (mag > 0.1) dirA = Math.atan2(wx, wz);
    this.rollKind = kind;
    this.rollDir = dirA;
    this.rollDur = kind === 'back' ? 0.5 : 0.44;
    if (kind === 'fwd') this.facing = dirA;
    this.setState('roll');
    g.audio.roll();
    g.fx.dust(this.pos.x, this.pos.z, 5);
  }
  sRoll(dt, ctrl) {
    const g = this.game, t = this.st / this.rollDur;
    const side = this.rollKind === 'left' || this.rollKind === 'right';
    const L = this.orbitTarget;
    if (side && L && L.alive) {
      const a = this.orbitA0 + this.orbitSign * 2.25 * easeOut(Math.min(1, t * 1.05));
      const nx = L.pos.x + Math.sin(a) * this.orbitR, nz = L.pos.z + Math.cos(a) * this.orbitR;
      const inv = 1 / Math.max(dt, 1e-3);
      this.vel.x = (nx - this.pos.x) * inv;
      this.vel.z = (nz - this.pos.z) * inv;
      this.facing = angleTo(nx, nz, L.pos.x, L.pos.z);
    } else if (this.rollKind === 'back') {
      const sp = 6.2 * (1 - t);
      this.vel.x = -Math.sin(this.rollDir) * sp;
      this.vel.z = -Math.cos(this.rollDir) * sp;
      this.y = Math.sin(Math.PI * Math.min(1, t)) * 0.55;
    } else {
      const sp = 7.6 * (1 - t * 0.6);
      this.vel.x = Math.sin(this.rollDir) * sp;
      this.vel.z = Math.cos(this.rollDir) * sp;
    }
    if (ctrl && side && t > 0.45 && g.input.pressed('attack')) {
      this.sideRollEnd = g.clock;
      this.y = 0;
      return this.startAttack();
    }
    if (t >= 1) {
      this.y = 0;
      if (side) this.sideRollEnd = g.clock;
      this.setState('idle');
    }
  }
  startBackSlice() {
    this.setState('backslice');
    this.hitSet.clear();
    this.bsDur = 0.42;
    this.arcShown = false;
    this.game.audio.swing(0, 1.2);
  }
  sBackSlice(dt) {
    const g = this.game, t = this.st / this.bsDur, L = this.lock;
    this.faceLock(dt, 30);
    this.vel.x = damp(this.vel.x, 0, 12, dt);
    this.vel.z = damp(this.vel.z, 0, 12, dt);
    if (t > 0.25 && !this.arcShown) { this.arcShown = true; g.fx.arc(this, 'spin', 0xe8f4ff, 2.3); }
    if (t > 0.22 && t < 0.62 && L && L.alive && !this.hitSet.has(L)) {
      if (this.dist(L) - L.radius < 2.5) {
        this.hitSet.add(L);
        const behind = L.isBehind ? L.isBehind(this.pos) : true;
        const r = L.receiveHit(this, behind ? 3 : 1, 'backslice', { ignoreGuard: behind, fromBehind: behind });
        if (r === 'hit') { g.callout('Back Slice'); g.hitStop(0.08); }
      }
    }
    if (t >= 1) this.setState('idle');
  }
  startHelm() {
    const L = this.lock;
    this.helmTarget = L;
    this.helmDur = 0.78;
    this.hitSet.clear();
    this.helmFrom = this.pos.clone();
    const a = this.angleTo(L);
    this.helmTo = new THREE.Vector3(L.pos.x + Math.sin(a) * 1.5, 0, L.pos.z + Math.cos(a) * 1.5);
    this.facing = a;
    this.setState('helm');
    this.game.audio.roll();
  }
  sHelm(dt) {
    const g = this.game, t = Math.min(1, this.st / this.helmDur), L = this.helmTarget;
    const u = smooth(t);
    const nx = lerp(this.helmFrom.x, this.helmTo.x, u), nz = lerp(this.helmFrom.z, this.helmTo.z, u);
    const inv = 1 / Math.max(dt, 1e-3);
    this.vel.x = (nx - this.pos.x) * inv;
    this.vel.z = (nz - this.pos.z) * inv;
    this.y = Math.sin(Math.PI * t) * 2.1;
    if (t > 0.38 && t < 0.64 && L && L.alive && !this.hitSet.has(L)) {
      this.hitSet.add(L);
      const r = L.receiveHit(this, 4, 'helm', { ignoreGuard: true, fromBehind: true });
      if (r === 'hit') {
        g.callout('Helm Splitter');
        g.hitStop(0.1);
        _v.set(L.pos.x, 1.9 * (L.rig.scale || 1), L.pos.z);
        g.fx.sparks(_v.x, _v.y, _v.z, 14);
      }
    }
    if (t >= 1) {
      this.y = 0;
      if (L) this.facing = this.angleTo(L);
      g.fx.dust(this.pos.x, this.pos.z, 6);
      this.setState('idle');
    }
  }
  sweep(range, half, dmg, kind, o = {}) {
    const g = this.game;
    for (const t of g.hittables()) {
      if (this.hitSet.has(t) || !t.alive) continue;
      const d = this.dist(t) - t.radius;
      if (d > range) continue;
      if (half < Math.PI && Math.abs(angleDiff(this.facing, this.angleTo(t))) > half) continue;
      this.hitSet.add(t);
      const r = t.receiveHit(this, dmg, kind, o);
      if (r === 'blocked') {
        this.vel.x = -this.fx * 3;
        this.vel.z = -this.fz * 3;
        g.hitStop(0.045);
      } else if (r === 'hit') g.hitStop(kind === 'spin' ? 0.04 : 0.06);
    }
  }
  toggleLock() {
    const g = this.game;
    if (this.lock) { this.lock = null; return; }
    const t = g.findLockTarget(this);
    if (t) { this.lock = t; g.audio.lockOn(); g.emit('lock', { target: t }); }
    else g.cam.recenter();
  }
  retarget() {
    const t = this.game.findLockTarget(this, 9);
    this.lock = t || null;
  }
  receiveHit(src, dmg, o = {}) {
    const g = this.game;
    if (!this.alive || this.state === 'script' || this.state === 'helm' || this.state === 'ending' || this.inv > 0) return 'miss';
    if (this.state === 'roll') {
      const t = this.st / this.rollDur;
      if (t > 0.04 && t < 0.88) return 'miss';
    }
    const toSrc = this.angleTo(src);
    const facingOk = Math.abs(angleDiff(this.facing, toSrc)) < 1.3;
    if (!o.unblockable && facingOk && (this.state === 'shield' || this.state === 'bash')) {
      g.audio.clank(g.panOf(this.pos));
      _v.set(this.pos.x + Math.sin(toSrc) * 0.5, 1.25, this.pos.z + Math.cos(toSrc) * 0.5);
      g.fx.sparks(_v.x, _v.y, _v.z, 10);
      this.vel.x = -Math.sin(toSrc) * 2.6;
      this.vel.z = -Math.cos(toSrc) * 2.6;
      g.emit('block', { src });
      if (src.recoil) src.recoil();
      return 'blocked';
    }
    if (g.sparring) {
      this.flash(0.1);
      this.vel.x = -Math.sin(toSrc) * 3;
      this.vel.z = -Math.cos(toSrc) * 3;
      this.setState('hurt');
      g.emit('sparHit', { src });
      return 'hit';
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.inv = 0.9;
    this.flash(0.15);
    this.vel.x = -Math.sin(toSrc) * 5;
    this.vel.z = -Math.cos(toSrc) * 5;
    this.y = 0;
    this.setState('hurt');
    g.audio.hurt();
    g.ui.damage();
    g.cam.shake(0.25, 0.2);
    g.hitStop(0.05);
    g.emit('playerHurt', { dmg });
    if (this.hp <= 0) {
      this.alive = false;
      this.lock = null;
      this.setState('dead');
      g.onPlayerDeath();
    }
    return 'hit';
  }
  animate(dt) {
    const r = this.rig, S = this.state, t = this.st, g = this.game;
    resetPose(r);
    const spd = Math.hypot(this.vel.x, this.vel.z);
    const loco = S === 'idle' || S === 'shield' || S === 'charge' || S === 'script';
    this.locomotion(dt, loco ? spd : 0);
    let guard = 0, bash = 0;
    if (this.scriptPose) {
      this.scriptPose(r, this, dt);
    } else {
      switch (S) {
        case 'shield':
          guard = 1;
          poseStance(r, 1, 1);
          poseLocomotion(r, this.phase, this.moveAmt * 0.6, true);
          break;
        case 'attack':
          poseSlash(r, this.atkKind, t / this.atkDur);
          break;
        case 'charge':
          poseCharge(r, Math.min(1, this.charge / 0.4));
          poseLocomotion(r, this.phase, this.moveAmt * 0.6, true);
          break;
        case 'spin':
          poseSpin(r);
          r.body.rotation.y = -r.side * TAU * (this.spinGreat ? 2 : 1) * easeOut(t / this.spinDur);
          break;
        case 'backslice':
          poseSpin(r);
          r.body.rotation.y = -r.side * TAU * easeOut(Math.min(1, t / this.bsDur));
          break;
        case 'bash':
          guard = 1;
          bash = Math.sin(Math.PI * Math.min(1, (t / this.bashDur) * 1.6));
          poseStance(r, 1, 1);
          r.torso.rotation.x = 0.25 * bash;
          r.hipL.rotation.x = -0.4 * bash;
          r.hipR.rotation.x = 0.3 * bash;
          break;
        case 'roll':
          poseRoll(r, this.rollKind, t / this.rollDur);
          break;
        case 'helm':
          poseVault(r, t / this.helmDur);
          break;
        case 'hurt':
          poseStance(r, 1, 0.2);
          poseHurt(r, t / 0.32);
          break;
        case 'dead': {
          const k = Math.min(1, t / 0.5);
          poseKneel(r, k, 0.4);
          if (t > 0.6) poseLie(r, Math.min(1, (t - 0.6) / 0.5));
          break;
        }
        default:
          poseStance(r, 1, 0.15);
          poseLocomotion(r, this.phase, this.moveAmt, true);
          poseBreath(r, g.clock);
      }
    }
    this.guard = damp(this.guard, guard, 18, dt);
    applyShield(r, this.guard, bash);
    if (r.cape) r.cape.rotation.x = 0.1 + Math.min(1, spd / 6) * 0.65 + Math.sin(g.clock * 3) * 0.03 + (this.y > 0.2 ? 0.5 : 0);
    if (r.bladeMat) {
      const glow = S === 'charge' ? Math.min(1, this.charge / 0.5) : this.spinGreat && S === 'spin' ? 1 : 0;
      if (!this.flashOn) r.bladeMat.emissive.setRGB(glow * 0.35, glow * 0.6, glow * 0.6);
    }
  }
}

// ===========================================================================
// Corin, the squire
// ===========================================================================
export class Corin extends Actor {
  constructor(game) {
    super(game, 'squire', { radius: 0.4 });
    this.mode = 'idle';
    this.guardAmt = 0;
    this.staggerT = 0;
    this.bashedAt = -9;
    this.target = null;
    this.atkCd = 1;
    this.atkKind = 'h1';
    this.atkDur = 0.45;
    this.home = { x: 0, z: 0 };
    this.sparT = 2;
    this.dead = false;
    this.scriptPose = null;
    this.lastHint = -9;
  }
  reset(x, z, facing, mode = 'idle') {
    this.pos.set(x, 0, z);
    this.facing = facing;
    this.home = { x, z };
    this.vel.set(0, 0, 0);
    this.mode = mode;
    this.dead = false;
    this.alive = true;
    this.solid = true;
    this.staggerT = 0;
    this.scriptPose = null;
    this.setState('idle');
    this.setVisible(true);
  }
  lockable() { return this.game.sparring && this.alive && !this.dead; }
  isBehind(p) { return Math.abs(angleDiff(this.facing, angleTo(this.pos.x, this.pos.z, p.x, p.z))) > 1.3; }
  canHelmSplit(now) { return this.staggerT > 0 && now - this.bashedAt < 1.7; }
  receiveHit(src, dmg, kind, o = {}) {
    const g = this.game;
    if (!g.sparring) return 'miss';
    if (kind === 'helm') { this.flinch(src); g.emit('spar', { kind: 'helm' }); return 'hit'; }
    if (kind === 'backslice' && o.fromBehind) { this.flinch(src); g.emit('spar', { kind: 'backslice' }); return 'hit'; }
    const frontal = Math.abs(angleDiff(this.facing, this.angleTo(src))) < 1.2;
    if (this.guardAmt > 0.5 && frontal && this.staggerT <= 0) {
      g.audio.clank(g.panOf(this.pos));
      this.handPos();
      g.fx.sparks(this.pos.x + Math.sin(this.facing) * 0.5, 1.2, this.pos.z + Math.cos(this.facing) * 0.5, 9);
      g.emit('spar', { kind: 'blocked', via: kind });
      return 'blocked';
    }
    this.flinch(src);
    g.emit('spar', { kind: 'hit', via: kind });
    return 'hit';
  }
  receiveBash(src) {
    const g = this.game;
    if (!g.sparring) return 'miss';
    this.staggerT = 1.5;
    this.bashedAt = g.clock;
    const a = this.angleTo(src);
    this.vel.x = -Math.sin(a) * 3.2;
    this.vel.z = -Math.cos(a) * 3.2;
    this.setState('stagger');
    g.audio.bash(g.panOf(this.pos));
    g.fx.sparks(this.pos.x, 1.2, this.pos.z, 8);
    g.emit('spar', { kind: 'bash' });
    return 'hit';
  }
  flinch(src) {
    this.flash(0.1);
    const a = this.angleTo(src);
    this.vel.x = -Math.sin(a) * 2.5;
    this.vel.z = -Math.cos(a) * 2.5;
    if (this.state !== 'stagger') this.setState('flinch');
    this.game.audio.hit(this.game.panOf(this.pos), 0.6);
  }
  update(dt) {
    const g = this.game, P = g.player;
    this.st += dt;
    if (this.staggerT > 0) this.staggerT -= dt;
    if (this.atkCd > 0) this.atkCd -= dt;
    let spd = 0;
    if (this.state === 'dead' || this.state === 'script') {
      this.vel.set(0, 0, 0);
    } else if (this.state === 'stagger') {
      this.vel.x = damp(this.vel.x, 0, 6, dt);
      this.vel.z = damp(this.vel.z, 0, 6, dt);
      if (this.staggerT <= 0) this.setState('idle');
    } else if (this.state === 'flinch') {
      this.vel.x = damp(this.vel.x, 0, 8, dt);
      this.vel.z = damp(this.vel.z, 0, 8, dt);
      if (this.st > 0.3) this.setState('idle');
    } else if (this.state === 'attack') {
      const t = this.st / this.atkDur;
      if (this.mode === 'spar-attack' && t < 0.4) {
        this.vel.x = Math.sin(this.facing) * 2.4;
        this.vel.z = Math.cos(this.facing) * 2.4;
      } else {
        this.vel.x = damp(this.vel.x, 0, 10, dt);
        this.vel.z = damp(this.vel.z, 0, 10, dt);
      }
      if (this.target) this.facing = turnToward(this.facing, this.angleTo(this.target), 8 * dt);
      if (!this.didHit && t > 0.42) {
        this.didHit = true;
        this.doStrike();
      }
      if (t >= 1) this.setState('idle');
    } else if (this.state === 'windup') {
      this.facing = turnToward(this.facing, this.angleTo(P), 6 * dt);
      if (this.dist(P) > 1.8) {
        const a = this.angleTo(P);
        this.vel.x = Math.sin(a) * 3.2;
        this.vel.z = Math.cos(a) * 3.2;
        spd = 3.2;
      } else this.vel.set(0, 0, 0);
      if (this.st > 0.75) { this.setState('attack'); this.didHit = false; this.atkKind = 'h1'; g.audio.swing(g.panOf(this.pos), 0.8); }
    } else if (this.mode === 'battle') {
      spd = this.battle(dt);
    } else if (this.mode.startsWith('spar')) {
      spd = this.spar(dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, 10, dt);
      this.vel.z = damp(this.vel.z, 0, 10, dt);
    }
    const guardWanted = this.mode.startsWith('spar') && this.mode !== 'spar-attack' && this.state !== 'stagger' && this.state !== 'attack' && this.state !== 'windup' ? 1 : 0;
    this.guardAmt = damp(this.guardAmt, guardWanted, 12, dt);
    this.integrate(dt);
    if (this.state !== 'script' && this.state !== 'dead') this.confine();
    this.locomotion(dt, spd);
    this.animate(dt);
    this.tickFlash(dt);
    this.sync();
  }
  spar(dt) {
    const g = this.game, P = g.player;
    const back = this.mode === 'spar-back';
    this.facing = turnToward(this.facing, this.angleTo(P), (back ? 1.4 : 4) * dt);
    // drift back toward home
    const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
    let spd = 0;
    if (hd > 0.6) { this.vel.x = (hx / hd) * 1.6; this.vel.z = (hz / hd) * 1.6; spd = 1.6; }
    else { this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt); }
    if (this.mode === 'spar-attack') {
      this.sparT -= dt;
      if (this.sparT <= 0 && this.dist(P) < 7) {
        this.sparT = 2.3;
        this.setState('windup');
        g.audio.windup(g.panOf(this.pos), 0.8);
      }
    }
    return spd;
  }
  battle(dt) {
    const g = this.game, P = g.player;
    if (!this.target || !this.target.alive) this.target = g.nearestEnemy(P.pos, 7.5, this.pos);
    let gx, gz;
    if (this.target) {
      const a = angleTo(this.target.pos.x, this.target.pos.z, this.pos.x, this.pos.z);
      gx = this.target.pos.x + Math.sin(a) * 1.55;
      gz = this.target.pos.z + Math.cos(a) * 1.55;
    } else {
      const ra = P.facing - Math.PI / 2;
      gx = P.pos.x + Math.sin(ra) * 1.8;
      gz = P.pos.z + Math.cos(ra) * 1.8;
    }
    const dx = gx - this.pos.x, dz = gz - this.pos.z, d = Math.hypot(dx, dz);
    let spd = 0;
    if (d > 0.35) {
      spd = Math.min(5.2, d * 3);
      this.vel.x = (dx / d) * spd;
      this.vel.z = (dz / d) * spd;
    } else {
      this.vel.x = damp(this.vel.x, 0, 10, dt);
      this.vel.z = damp(this.vel.z, 0, 10, dt);
    }
    const look = this.target ? this.angleTo(this.target) : P.facing;
    this.facing = turnToward(this.facing, look, 8 * dt);
    if (this.target && this.dist(this.target) < 2.2 && this.atkCd <= 0) {
      this.atkCd = rand(1.2, 2.0);
      this.atkKind = Math.random() < 0.5 ? 'h1' : 'h2';
      this.didHit = false;
      this.setState('attack');
      g.audio.swing(g.panOf(this.pos), 0.6);
    }
    return spd;
  }
  doStrike() {
    const g = this.game;
    if (this.mode === 'spar-attack') {
      const P = g.player;
      if (this.dist(P) - P.radius < 2.5 && Math.abs(angleDiff(this.facing, this.angleTo(P))) < 1.1) {
        const r = P.receiveHit(this, 0);
        if (r === 'blocked') g.emit('spar', { kind: 'playerBlocked' });
        else if (r === 'hit' && g.clock - this.lastHint > 3) { this.lastHint = g.clock; g.emit('spar', { kind: 'playerHit' }); }
      }
      return;
    }
    const T = this.target;
    if (T && T.alive && this.dist(T) - T.radius < 2.0) {
      if (Math.random() < 0.6) T.receiveHit(this, 1, 'ally', {});
      else { g.audio.clank(g.panOf(T.pos), 0.6); }
    }
  }
  animate(dt) {
    const r = this.rig, S = this.state, g = this.game;
    resetPose(r);
    let guard = this.guardAmt;
    if (this.scriptPose) this.scriptPose(r, this, dt);
    else if (S === 'dead') poseLie(r, 1);
    else if (S === 'attack') poseSlash(r, this.atkKind, this.st / this.atkDur);
    else if (S === 'windup') poseSlash(r, 'h1', 0.29 * smooth(this.st / 0.75));
    else if (S === 'stagger') { poseStance(r, 0.6, 0); poseHurt(r, 0.5); guard = 0; }
    else if (S === 'flinch') { poseStance(r, 1, guard); poseHurt(r, this.st / 0.3); }
    else {
      poseStance(r, 1, guard);
      poseLocomotion(r, this.phase, this.moveAmt, true);
      poseBreath(r, g.clock + 1.3);
    }
    applyShield(r, guard, 0);
  }
}

// ===========================================================================
// Raiders and their commander
// ===========================================================================
const TYPES = {
  raider: { kind: 'raider', hp: 3, speed: 3.9, radius: 0.42, reach: 1.85, windup: 0.55, strike: 0.24, recover: 0.65, dmg: 2, guard: false, atk: 'h1' },
  shield: { kind: 'shieldRaider', hp: 4, speed: 2.9, radius: 0.5, reach: 1.85, windup: 0.72, strike: 0.26, recover: 0.8, dmg: 2, guard: true, atk: 'v' },
  vessa: { kind: 'commander', hp: 22, speed: 3.5, radius: 0.55, reach: 2.8, windup: 0.62, strike: 0.32, recover: 0.85, dmg: 3, guard: 'partial', atk: 'h2', boss: true },
};

export class Enemy extends Actor {
  constructor(game, type, x, z, o = {}) {
    const T = TYPES[type];
    super(game, T.kind, { x, z, radius: T.radius, facing: o.facing ?? Math.PI });
    this.T = T;
    this.type = type;
    this.hp = this.maxHp = T.hp;
    this.state = o.state || 'approach';
    this.circleDir = Math.random() < 0.5 ? 1 : -1;
    this.circleT = rand(1.5, 3);
    this.atkCd = rand(0.5, 1.6);
    this.staggerT = 0;
    this.guardBroken = 0;
    this.dyingT = 0;
    this.entering = !!o.entering;
    this.bashedAt = -9;
    this.frozen = false;
    this.removed = false;
    this.dissolved = false;
  }
  lockable() { return this.alive && this.rig.root.visible && this.state !== 'flee'; }
  isBehind(p) { return Math.abs(angleDiff(this.facing, angleTo(this.pos.x, this.pos.z, p.x, p.z))) > 1.3; }
  canHelmSplit(now) { return this.alive && this.staggerT > 0 && now - this.bashedAt < 1.7; }
  recoil() {
    this.staggerT = 0.45;
    this.game.releaseToken(this);
    this.setState('stagger');
    const a = this.angleTo(this.game.player);
    this.vel.x = -Math.sin(a) * 2.5;
    this.vel.z = -Math.cos(a) * 2.5;
  }
  receiveHit(src, dmg, kind, o = {}) {
    const g = this.game;
    if (!this.alive || this.state === 'downed') return 'miss';
    const fromA = this.angleTo(src);
    const frontal = Math.abs(angleDiff(this.facing, fromA)) < 1.15;
    let guarding = false;
    if (this.T.guard === true) guarding = frontal && this.guardBroken <= 0 && this.state !== 'stagger';
    else if (this.T.guard === 'partial') guarding = frontal && (this.state === 'circle' || this.state === 'approach') && Math.random() < 0.45;
    if (guarding && !o.ignoreGuard) {
      g.audio.clank(g.panOf(this.pos));
      g.fx.sparks(this.pos.x + Math.sin(this.facing) * 0.55, 1.25 * (this.rig.scale || 1), this.pos.z + Math.cos(this.facing) * 0.55, 10);
      this.facing = turnToward(this.facing, fromA, 0.5);
      g.emit('guarded', { target: this, kind, src });
      return 'blocked';
    }
    if (dmg <= 0) return 'miss';
    this.hp -= dmg;
    this.flash(0.12);
    const kb = o.knock || (this.T.boss ? 1.2 : 2.4);
    this.vel.x = -Math.sin(fromA) * kb;
    this.vel.z = -Math.cos(fromA) * kb;
    g.audio.hit(g.panOf(this.pos));
    g.fx.hitBurst(this.pos.x, 1.2 * (this.rig.scale || 1), this.pos.z);
    g.releaseToken(this);
    g.emit('enemyHit', { target: this, kind, fromBehind: !!o.fromBehind, src });
    if (this.hp <= 0) this.die();
    else if (!(this.T.boss && (this.state === 'leap' || this.state === 'burstWind'))) {
      this.staggerT = Math.max(this.staggerT, this.T.boss ? 0.25 : 0.4);
      this.setState('stagger');
      if (this.tele) { this.tele.remove(); this.tele = null; }
    }
    return 'hit';
  }
  receiveBash(src) {
    const g = this.game;
    if (!this.alive || this.state === 'downed') return 'miss';
    if (this.T.boss && (this.state === 'leap' || this.state === 'burstWind')) return 'miss';
    this.staggerT = this.T.boss ? 1.1 : 1.5;
    this.bashedAt = g.clock;
    this.guardBroken = this.T.boss ? 1.1 : 1.7;
    g.releaseToken(this);
    if (this.tele) { this.tele.remove(); this.tele = null; }
    this.setState('stagger');
    const a = this.angleTo(src);
    this.vel.x = -Math.sin(a) * 3.4;
    this.vel.z = -Math.cos(a) * 3.4;
    g.audio.bash(g.panOf(this.pos));
    g.fx.sparks(this.pos.x, 1.2, this.pos.z, this.T.guard ? 14 : 6);
    g.emit('bash', { target: this });
    return 'hit';
  }
  die() {
    const g = this.game;
    this.alive = false;
    this.hp = 0;
    this.setState('dead');
    this.dyingT = 0;
    g.releaseToken(this);
    if (this.tele) { this.tele.remove(); this.tele = null; }
    g.audio.enemyDie(g.panOf(this.pos));
    g.emit('enemyDied', { target: this });
    if (g.player.lock === this) g.player.retarget();
  }
  update(dt) {
    const g = this.game, P = g.player;
    this.st += dt;
    if (this.atkCd > 0) this.atkCd -= dt;
    if (this.staggerT > 0) this.staggerT -= dt;
    if (this.guardBroken > 0) this.guardBroken -= dt;
    if (!this.alive) {
      this.dyingT += dt;
      this.vel.x = damp(this.vel.x, 0, 5, dt);
      this.vel.z = damp(this.vel.z, 0, 5, dt);
      this.integrate(dt);
      if (this.dyingT > 1.0 && !this.dissolved) {
        this.dissolved = true;
        g.fx.ash(this.pos.x, 0.2, this.pos.z, 22, this.T.boss ? 0x3a2448 : 0x2a1e1a);
        this.setVisible(false);
      }
      if (this.dyingT > 1.6) this.removed = true;
      this.animate(dt);
      this.tickFlash(dt);
      this.sync();
      return;
    }
    if (g.freezeAI || this.frozen || this.state === 'script') {
      this.vel.set(0, 0, 0);
      this.locomotion(dt, 0);
      this.animate(dt);
      this.tickFlash(dt);
      this.sync();
      return;
    }
    const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    const aToP = Math.atan2(dx, dz);
    this.think(dt, P, d, aToP, dx, dz);
    this.integrate(dt);
    this.confine();
    const moving = this.state === 'approach' || this.state === 'circle' || this.state === 'flee' || this.state === 'idle';
    this.locomotion(dt, moving ? Math.hypot(this.vel.x, this.vel.z) : 0);
    this.animate(dt);
    this.tickFlash(dt);
    this.sync();
  }
  think(dt, P, d, aToP, dx, dz) {
    const g = this.game, T = this.T;
    const evasive = P.state === 'roll' || P.state === 'helm';
    switch (this.state) {
      case 'idle':
        this.vel.set(0, 0, 0);
        break;
      case 'approach': {
        this.vel.x = (dx / d) * T.speed;
        this.vel.z = (dz / d) * T.speed;
        this.facing = turnToward(this.facing, aToP, 8 * dt);
        if (d < 3.6 && !this.entering) this.setState('circle');
        break;
      }
      case 'circle': {
        const want = 2.9;
        const radial = clamp((d - want) * 1.6, -2, 2.5);
        const tx = (dz / d) * this.circleDir, tz = (-dx / d) * this.circleDir;
        const tan = T.speed * 0.42;
        this.vel.x = (dx / d) * radial + tx * tan;
        this.vel.z = (dz / d) * radial + tz * tan;
        this.facing = turnToward(this.facing, aToP, (evasive ? 1.3 : 5) * dt);
        this.circleT -= dt;
        if (this.circleT <= 0) { this.circleDir *= -1; this.circleT = rand(1.4, 3.2); }
        if (d > 5.5) this.setState('approach');
        else if (this.atkCd <= 0 && d < 3.8 && P.alive && g.takeToken(this)) {
          this.setState('windup');
          g.audio.windup(g.panOf(this.pos), g.volOf(this.pos));
          g.onEnemyWindup(this);
          const h = this.handPos();
          g.fx.sparks(h.x, h.y + 0.2, h.z, 5, 0xfff6c8);
        }
        break;
      }
      case 'windup': {
        this.facing = turnToward(this.facing, aToP, (evasive ? 1.5 : 6) * dt);
        if (d > T.reach + 0.3) { this.vel.x = (dx / d) * 2.6; this.vel.z = (dz / d) * 2.6; }
        else { this.vel.x = damp(this.vel.x, 0, 10, dt); this.vel.z = damp(this.vel.z, 0, 10, dt); }
        if (this.st >= T.windup) { this.setState('strike'); this.didHit = false; g.audio.swing(g.panOf(this.pos), 0.8); }
        break;
      }
      case 'strike': {
        const t = this.st / T.strike;
        const lunge = t < 0.6 ? 5.0 : 0;
        this.vel.x = this.fx * lunge;
        this.vel.z = this.fz * lunge;
        if (!this.didHit && t >= 0.45) {
          this.didHit = true;
          if (d - P.radius < T.reach && Math.abs(angleDiff(this.facing, aToP)) < 0.95) P.receiveHit(this, T.dmg);
        }
        if (t >= 1) this.setState('recover');
        break;
      }
      case 'recover': {
        this.vel.x = damp(this.vel.x, 0, 8, dt);
        this.vel.z = damp(this.vel.z, 0, 8, dt);
        if (this.st >= T.recover) {
          g.releaseToken(this);
          this.atkCd = rand(1.0, 2.6);
          this.setState('circle');
        }
        break;
      }
      case 'stagger': {
        this.vel.x = damp(this.vel.x, 0, 6, dt);
        this.vel.z = damp(this.vel.z, 0, 6, dt);
        if (this.staggerT <= 0) { this.atkCd = Math.max(this.atkCd, 0.4); this.setState('circle'); }
        break;
      }
      case 'flee': {
        this.entering = true;
        const a = Math.atan2(this.pos.x * 0.15, 1);
        this.vel.x = Math.sin(a) * 5.5;
        this.vel.z = Math.cos(a) * 5.5;
        this.facing = turnToward(this.facing, a, 8 * dt);
        if (this.pos.z > 27) { this.removed = true; this.setVisible(false); }
        break;
      }
      default:
        break;
    }
  }
  animate(dt) {
    const r = this.rig, T = this.T, S = this.state, g = this.game;
    resetPose(r);
    if (this.scriptPose) {
      this.scriptPose(r, this, dt);
      applyShield(r, T.guard === true ? 0.5 : 0, 0);
      return;
    }
    let guard = T.guard === true ? 0.9 : 0;
    switch (S) {
      case 'windup': poseSlash(r, T.atk, 0.299 * smooth(this.st / T.windup)); guard *= 0.4; break;
      case 'strike': poseSlash(r, T.atk, 0.3 + 0.22 * clamp(this.st / T.strike, 0, 1)); guard *= 0.4; break;
      case 'recover': poseSlash(r, T.atk, 0.52 + 0.48 * clamp(this.st / T.recover, 0, 1)); guard *= 0.6; break;
      case 'stagger': poseStance(r, 0.5, 0); poseHurt(r, 0.5); guard = 0.15; break;
      case 'dead': poseFallBack(r, this.dyingT / 0.55); guard = 0; break;
      default:
        poseStance(r, 1, 0);
        poseLocomotion(r, this.phase, this.moveAmt, true);
        poseBreath(r, g.clock + this.pos.x);
    }
    applyShield(r, guard, 0);
    if (r.cape) r.cape.rotation.x = 0.12 + this.moveAmt * 0.5;
  }
}

export class Vessa extends Enemy {
  constructor(game, x, z) {
    super(game, 'vessa', x, z, { state: 'idle', facing: Math.PI });
    this.phase2 = false;
    this.auraT = 0;
    this.downed = false;
    this.leapFrom = new THREE.Vector3();
    this.leapTo = new THREE.Vector3();
  }
  lockable() { return this.alive && !this.downed && this.rig.root.visible; }
  canHelmSplit(now) { return !this.downed && this.staggerT > 0 && now - this.bashedAt < 1.4; }
  die() {
    // she falls to her knees and waits for the Ending Blow
    const g = this.game;
    this.hp = 0;
    this.downed = true;
    g.releaseToken(this);
    if (this.tele) { this.tele.remove(); this.tele = null; }
    this.setState('downed');
    this.y = 0;
    g.audio.slam(g.panOf(this.pos));
    g.emit('bossDown', { target: this });
  }
  update(dt) {
    const g = this.game;
    this.auraT -= dt;
    if (this.auraT <= 0 && this.rig.root.visible) {
      this.auraT = this.downed ? 0.12 : 0.045;
      g.fx.flame(this.pos.x + rand(-0.45, 0.45), this.y + rand(0.2, 2.0), this.pos.z + rand(-0.45, 0.45));
    }
    if (this.downed) {
      this.st += dt;
      this.vel.set(0, 0, 0);
      this.animate(dt);
      this.tickFlash(dt);
      this.sync();
      return;
    }
    super.update(dt);
    this.rig.root.position.y = this.y;
  }
  think(dt, P, d, aToP, dx, dz) {
    const g = this.game;
    const S = this.state;
    if (S === 'circle' || S === 'approach' || S === 'idle') {
      if (S === 'idle') { this.setState('circle'); }
      // phase 2: drift toward the captain's blind (right) side
      let gx, gz;
      if (this.phase2) {
        const ra = P.facing - Math.PI / 2 - 0.25;
        gx = P.pos.x + Math.sin(ra) * 3.3;
        gz = P.pos.z + Math.cos(ra) * 3.3;
      } else {
        const a = angleTo(P.pos.x, P.pos.z, this.pos.x, this.pos.z) + this.circleDir * 0.5;
        gx = P.pos.x + Math.sin(a) * 3.4;
        gz = P.pos.z + Math.cos(a) * 3.4;
      }
      const mx = gx - this.pos.x, mz = gz - this.pos.z, md = Math.hypot(mx, mz);
      const sp = Math.min(this.T.speed, md * 2.5);
      if (md > 0.2) { this.vel.x = (mx / md) * sp; this.vel.z = (mz / md) * sp; }
      else { this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt); }
      this.facing = turnToward(this.facing, aToP, 5 * dt);
      this.circleT -= dt;
      if (this.circleT <= 0) { this.circleDir *= -1; this.circleT = rand(1.5, 3); }
      if (this.atkCd <= 0 && P.alive) {
        const r = Math.random();
        if (d > 5.2) this.begin('leapWind');
        else if (r < (this.phase2 ? 0.32 : 0.2)) this.begin('burstWind');
        else if (d < 4.2) this.begin('sweepWind');
        else this.begin('leapWind');
      }
      return;
    }
    switch (S) {
      case 'sweepWind': {
        this.facing = turnToward(this.facing, aToP, 4 * dt);
        if (d > 2.6) { this.vel.x = (dx / d) * 2.8; this.vel.z = (dz / d) * 2.8; }
        else { this.vel.x = damp(this.vel.x, 0, 10, dt); this.vel.z = damp(this.vel.z, 0, 10, dt); }
        if (this.st >= 0.65) { this.setState('sweep'); this.didHit = false; g.audio.swing(g.panOf(this.pos), 1.2); g.fx.arc(this, 'h2', 0xc58cff, 2.9); }
        break;
      }
      case 'sweep': {
        const t = this.st / 0.32;
        const lunge = t < 0.6 ? 4.5 : 0;
        this.vel.x = this.fx * lunge;
        this.vel.z = this.fz * lunge;
        if (!this.didHit && t >= 0.45) {
          this.didHit = true;
          if (d - P.radius < 2.9 && Math.abs(angleDiff(this.facing, aToP)) < 1.45) P.receiveHit(this, 3);
        }
        if (t >= 1) this.setState('recover');
        break;
      }
      case 'leapWind': {
        this.vel.set(0, 0, 0);
        this.facing = turnToward(this.facing, aToP, 6 * dt);
        if (this.tele) this.tele.set(P.pos.x, P.pos.z);
        if (this.st >= 0.6) {
          this.leapFrom.copy(this.pos);
          this.leapTo.set(P.pos.x - Math.sin(aToP) * 0.6, 0, P.pos.z - Math.cos(aToP) * 0.6);
          if (this.tele) this.tele.set(this.leapTo.x, this.leapTo.z);
          this.setState('leap');
          g.audio.roll();
        }
        break;
      }
      case 'leap': {
        const t = Math.min(1, this.st / 0.62);
        const nx = lerp(this.leapFrom.x, this.leapTo.x, t), nz = lerp(this.leapFrom.z, this.leapTo.z, t);
        const inv = 1 / Math.max(dt, 1e-3);
        this.vel.x = (nx - this.pos.x) * inv;
        this.vel.z = (nz - this.pos.z) * inv;
        this.y = Math.sin(Math.PI * t) * 2.6;
        if (t >= 1) {
          this.y = 0;
          if (this.tele) { this.tele.remove(); this.tele = null; }
          g.audio.slam(g.panOf(this.pos));
          g.cam.shake(0.35, 0.3);
          g.fx.dust(this.pos.x, this.pos.z, 14);
          g.fx.burst(this.pos.x, 0.3, this.pos.z, 16, 0xb46cff, 4);
          if (Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 2.0 + P.radius) P.receiveHit(this, 3, { unblockable: true });
          this.setState('recover');
        }
        break;
      }
      case 'burstWind': {
        this.vel.x = damp(this.vel.x, 0, 8, dt);
        this.vel.z = damp(this.vel.z, 0, 8, dt);
        this.facing = turnToward(this.facing, aToP, 3 * dt);
        if (this.tele) this.tele.set(this.pos.x, this.pos.z, 1 + 2.3 * Math.min(1, this.st / 1.0));
        if (Math.random() < 0.7) g.fx.flame(this.pos.x + rand(-1.5, 1.5), 0.2, this.pos.z + rand(-1.5, 1.5));
        if (this.st >= 1.0) {
          if (this.tele) { this.tele.remove(); this.tele = null; }
          g.audio.flameBurst(g.panOf(this.pos));
          g.fx.burst(this.pos.x, 0.5, this.pos.z, 40, 0xb46cff, 7);
          g.fx.shockwave(this.pos.x, this.pos.z, 3.4, 0xc58cff);
          g.cam.shake(0.25, 0.25);
          if (d < 3.3 + P.radius) P.receiveHit(this, 2, { unblockable: true });
          this.setState('recover');
        }
        break;
      }
      case 'recover': {
        this.vel.x = damp(this.vel.x, 0, 8, dt);
        this.vel.z = damp(this.vel.z, 0, 8, dt);
        if (this.st >= 0.85) {
          g.releaseToken(this);
          this.atkCd = rand(0.9, 1.9);
          this.setState('circle');
        }
        break;
      }
      case 'stagger': {
        this.vel.x = damp(this.vel.x, 0, 6, dt);
        this.vel.z = damp(this.vel.z, 0, 6, dt);
        this.y = Math.max(0, this.y - dt * 8);
        if (this.staggerT <= 0) { this.atkCd = Math.max(this.atkCd, 0.5); this.setState('circle'); }
        break;
      }
      default:
        break;
    }
  }
  begin(s) {
    const g = this.game, P = g.player;
    if (!g.takeToken(this, true)) return;
    this.setState(s);
    g.audio.windup(g.panOf(this.pos), 1.2);
    g.onEnemyWindup(this);
    if (s === 'leapWind') this.tele = g.fx.telegraph(P.pos.x, P.pos.z, 2.0);
    if (s === 'burstWind') this.tele = g.fx.telegraph(this.pos.x, this.pos.z, 1.0);
  }
  perish() {
    const g = this.game;
    this.downed = false;
    this.alive = false;
    this.scriptPose = null;
    this.setState('dead');
    this.dyingT = 0;
    g.audio.enemyDie(g.panOf(this.pos));
    g.fx.burst(this.pos.x, 1.0, this.pos.z, 30, 0xb46cff, 3);
  }
  animate(dt) {
    const r = this.rig, S = this.state, g = this.game;
    resetPose(r);
    if (this.scriptPose) { this.scriptPose(r, this, dt); return; }
    switch (S) {
      case 'sweepWind': poseSlash(r, 'h2', 0.299 * smooth(this.st / 0.65)); break;
      case 'sweep': poseSlash(r, 'h2', 0.3 + 0.22 * clamp(this.st / 0.32, 0, 1)); break;
      case 'leapWind': poseCrouch(r, smooth(this.st / 0.6)); poseSlash(r, 'v', 0.25); break;
      case 'leap': poseSlash(r, 'v', 0.3 + 0.22 * clamp(this.st / 0.62, 0, 1)); break;
      case 'burstWind': poseCast(r, smooth(this.st / 0.5)); break;
      case 'recover': poseStance(r, 1, 0); poseCrouch(r, 0.4 * (1 - this.st / 0.85)); break;
      case 'stagger': poseStance(r, 0.5, 0); poseHurt(r, 0.5); break;
      case 'downed': poseKneel(r, Math.min(1, this.st / 0.4), 0.5); r.shS.rotation.set(-0.3, 0, 0.4 * r.side); r.head.rotation.x = 0.4; break;
      case 'dead': poseFallBack(r, this.dyingT / 0.55); break;
      default:
        poseStance(r, 1, 0);
        poseLocomotion(r, this.phase, this.moveAmt, true);
        poseBreath(r, g.clock);
    }
    if (r.cape) r.cape.rotation.x = 0.12 + this.moveAmt * 0.6 + (this.y > 0.2 ? 0.6 : 0);
  }
}

// ===========================================================================
// Soldiers: scripted extras, merged statics, stretcher teams
// ===========================================================================
export class Extra extends Actor {
  constructor(game, x, z, facing = 0, kind = 'soldier') {
    super(game, kind, { x, z, facing, radius: 0.4 });
    this.goal = null;
    this.speed = 4.5;
    this.solid = false;
    this.scriptPose = null;
  }
  moveTo(x, z, speed = 4.8) {
    this.goal = { x, z };
    this.speed = speed;
  }
  update(dt) {
    let spd = 0;
    if (this.goal) {
      const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { this.goal = null; this.vel.set(0, 0, 0); }
      else {
        spd = this.speed;
        this.vel.x = (dx / d) * spd;
        this.vel.z = (dz / d) * spd;
        this.facing = turnToward(this.facing, Math.atan2(dx, dz), 10 * dt);
      }
    } else this.vel.set(0, 0, 0);
    this.integrate(dt);
    this.locomotion(dt, spd);
    const r = this.rig;
    resetPose(r);
    if (this.scriptPose) this.scriptPose(r, this, dt);
    else {
      poseLocomotion(r, this.phase, this.moveAmt, false);
      poseBreath(r, this.game.clock + this.pos.z);
    }
    this.sync();
  }
}

const STATIC_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

export function mergedFigure(kind, poseFn, B = new Batch(7), extra = null) {
  const r = makeRig(kind);
  resetPose(r);
  if (poseFn) poseFn(r);
  B.addObject(r.root, 0.02, extra);
  return B;
}

export function campSoldiers(scene) {
  const B = new Batch(31);
  const T = (x, y, z, yaw) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
  // two sitting by the fire
  const sit = (r) => {
    r.body.position.y = 0.55 - 0.48;
    r.hipL.rotation.x = r.hipR.rotation.x = -1.5;
    r.knL.rotation.x = r.knR.rotation.x = 1.45;
    r.torso.rotation.x = 0.25;
    r.shS.rotation.set(-0.7, 0, 0);
    r.shO.rotation.set(-0.7, 0, 0);
    r.elS.rotation.x = r.elO.rotation.x = -0.8;
    r.weapon.group.visible = false;
  };
  for (const k of [1, 2]) {
    const a = (k / 3) * TAU + 0.6;
    const sx = CAMPFIRE.x + Math.sin(a) * 2.3, sz = CAMPFIRE.z + Math.cos(a) * 2.3;
    mergedFigure('soldier', sit, B, T(sx, 0, sz, angleTo(sx, sz, CAMPFIRE.x, CAMPFIRE.z)));
  }
  // sentries
  mergedFigure('soldier', null, B, T(-8.2, 0, 13.5, 2.6));
  mergedFigure('soldier', null, B, T(9.0, 0, 14.8, 3.6));
  const mesh = B.build(STATIC_MAT);
  scene.add(mesh);
  return mesh;
}

export class Stretcher {
  constructor(game, i) {
    this.game = game;
    this.i = i;
    const B = new Batch(50 + i);
    const front = (r) => {
      r.shS.rotation.set(0.12, 0, 0.18 * r.side);
      r.shO.rotation.set(0.12, 0, -0.18 * r.side);
      r.weapon.group.visible = false;
    };
    const back = (r) => {
      r.shS.rotation.set(-0.5, 0, 0.12 * r.side);
      r.shO.rotation.set(-0.5, 0, -0.12 * r.side);
      r.elS.rotation.x = r.elO.rotation.x = -0.55;
      r.weapon.group.visible = false;
    };
    mergedFigure('soldier', front, B, new THREE.Matrix4().makeTranslation(0, 0, 1.2));
    mergedFigure('soldier', back, B, new THREE.Matrix4().makeTranslation(0, 0, -1.4));
    B.add(new THREE.BoxGeometry(1, 1, 1), 0x6b4a2e, [0, 0.86, -0.1], [0, 0, 0], [0.6, 0.06, 2.3], 0.08);
    B.add(new THREE.BoxGeometry(1, 1, 1), 0x8a7a62, [0, 0.9, -0.1], [0, 0, 0], [0.55, 0.03, 1.9], 0.05);
    const lie = new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, 1.06, 0.75));
    mergedFigure('soldier', (r) => { r.weapon.group.visible = false; r.shS.rotation.z = 0.25 * r.side; r.shO.rotation.z = -0.25 * r.side; }, B, lie);
    this.mat = STATIC_MAT.clone();
    this.mat.transparent = true;
    this.mesh = B.build(this.mat);
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.rotation.y = Math.PI;
    game.scene.add(this.group);
    this.x = i % 2 ? 2.25 : -2.25;
    this.z0 = -4.5;
    this.z1 = -32.4;
    this.u = 0;
  }
  setProgress(p, t) {
    const w0 = this.i * 0.22, w1 = w0 + 0.34;
    const u = clamp((p - w0) / (w1 - w0), 0, 1);
    this.u = u;
    const z = lerp(this.z0, this.z1, u);
    const cam = this.game.camera.position;
    const nearCam = Math.abs(cam.x - this.x) < 0.95 && Math.abs(cam.z - z) < 2.1;
    this.group.visible = u > 0 && u < 1 && !nearCam;
    this.mat.opacity = Math.min(1, u / 0.05, (1 - u) / 0.05);
    this.mat.depthWrite = this.mat.opacity > 0.98;
    this.group.position.set(this.x, Math.abs(Math.sin(t * 6 + this.i)) * 0.03, z);
  }
  get done() { return this.u >= 1; }
  dispose() { this.game.scene.remove(this.group); }
}
