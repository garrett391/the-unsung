import * as THREE from 'three';
import { clamp, damp, lerp, smooth } from './util.js';
import { clampCamera } from './world.js';

const _d = new THREE.Vector3();
const _l = new THREE.Vector3();

// Third-person camera: a lazy "leash" that trails the captain, a framing mode
// while locked on, and scripted shots for cutscenes.
export class CameraRig {
  constructor(game) {
    this.game = game;
    this.cam = game.camera;
    this.pos = new THREE.Vector3(0, 4, 20);
    this.look = new THREE.Vector3(0, 1.3, 0);
    this.mode = 'follow';
    this.shakeT = 0;
    this.shakeDur = 0;
    this.shakeAmp = 0;
    this.fwdX = 0;
    this.fwdZ = -1;
    this.recenterT = 0;
    this.shotFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.shotTo = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.shotT = 0;
    this.shotDur = 0;
    this.orbit = 0;
  }
  snapBehind(dist = 6.4) {
    const p = this.game.player;
    this.pos.set(p.pos.x - Math.sin(p.facing) * dist, p.pos.y + 3.0, p.pos.z - Math.cos(p.facing) * dist);
    clampCamera(this.pos);
    this.look.set(p.pos.x, 1.3, p.pos.z);
    this.mode = 'follow';
  }
  recenter() { this.recenterT = 0.35; }
  shake(amp, dur) {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT > 0 ? 1 : 0), amp);
    this.shakeT = this.shakeDur = dur;
  }
  // cut or move to a scripted shot; dur 0 = cut
  shot(pos, look, dur = 0) {
    this.mode = 'shot';
    this.shotFrom.pos.copy(this.pos);
    this.shotFrom.look.copy(this.look);
    this.shotTo.pos.set(pos[0], pos[1], pos[2]);
    this.shotTo.look.set(look[0], look[1], look[2]);
    this.shotT = 0;
    this.shotDur = dur;
    if (dur <= 0) { this.pos.copy(this.shotTo.pos); this.look.copy(this.shotTo.look); }
  }
  release() { this.mode = 'follow'; }
  update(dt) {
    const g = this.game, p = g.player;
    if (this.mode === 'follow') {
      const portrait = g.eng.portrait;
      const dist = portrait ? 8.2 : 6.4;
      const h = portrait ? 3.7 : 3.0;
      const L = p.lock;
      let dx, dz;
      if (L) {
        dx = p.pos.x - L.pos.x;
        dz = p.pos.z - L.pos.z;
        const n = Math.hypot(dx, dz) || 1;
        dx /= n; dz /= n;
        // sit over the captain's left shoulder: the target lands left of centre,
        // on the side of his good eye once the right one is gone
        const a = Math.atan2(dx, dz) - 0.22;
        dx = Math.sin(a); dz = Math.cos(a);
      } else if (this.recenterT > 0) {
        this.recenterT -= dt;
        dx = -Math.sin(p.facing);
        dz = -Math.cos(p.facing);
      } else {
        dx = this.pos.x - p.pos.x;
        dz = this.pos.z - p.pos.z;
        const n = Math.hypot(dx, dz);
        if (n < 0.01) { dx = -Math.sin(p.facing); dz = -Math.cos(p.facing); }
        else { dx /= n; dz /= n; }
      }
      _d.set(p.pos.x + dx * dist, p.pos.y + h + (L ? 0.3 : 0), p.pos.z + dz * dist);
      clampCamera(_d);
      const rate = L || this.recenterT > 0 ? 6 : 9;
      this.pos.x = damp(this.pos.x, _d.x, rate, dt);
      this.pos.y = damp(this.pos.y, _d.y, 5, dt);
      this.pos.z = damp(this.pos.z, _d.z, rate, dt);
      clampCamera(this.pos);
      if (L) _l.set(lerp(p.pos.x, L.pos.x, 0.42), 1.15, lerp(p.pos.z, L.pos.z, 0.42));
      else _l.set(p.pos.x, 1.3 + p.y * 0.5, p.pos.z);
      this.look.x = damp(this.look.x, _l.x, 10, dt);
      this.look.y = damp(this.look.y, _l.y, 10, dt);
      this.look.z = damp(this.look.z, _l.z, 10, dt);
    } else if (this.mode === 'shot') {
      if (this.shotDur > 0) {
        this.shotT += dt;
        const u = smooth(clamp(this.shotT / this.shotDur, 0, 1));
        this.pos.lerpVectors(this.shotFrom.pos, this.shotTo.pos, u);
        this.look.lerpVectors(this.shotFrom.look, this.shotTo.look, u);
      }
    } else if (this.mode === 'orbit') {
      this.orbit += dt * 0.06;
      const c = this.orbitCenter;
      this.pos.set(c.x + Math.sin(this.orbit) * 13, 5.2, c.z + Math.cos(this.orbit) * 13);
      this.look.set(c.x, 1.6, c.z - 2);
    }
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeAmp * Math.max(0, this.shakeT / this.shakeDur);
      sx = (Math.random() - 0.5) * k;
      sy = (Math.random() - 0.5) * k;
    }
    this.cam.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.cam.lookAt(this.look.x + sx * 0.5, this.look.y + sy * 0.5, this.look.z);
    const fx = this.look.x - this.pos.x, fz = this.look.z - this.pos.z;
    const n = Math.hypot(fx, fz) || 1;
    this.fwdX = fx / n;
    this.fwdZ = fz / n;
  }
}
