import * as T from 'three';
import { G } from '../core/game.js';
import { PI, rnd } from '../core/util.js';
import { TEX } from './materials.js';

const V3 = T.Vector3;
const EASE_OUT = (u) => 1 - Math.pow(1 - u, 3);

// Pooled point sprites. Additive ones fade by dimming; the rest just expire.
export class Parts {
  constructor(n, size, add) {
    this.n = n; this.add = add; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-999); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.base = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3)); g.setAttribute('color', new T.BufferAttribute(this.col, 3));
    this.pts = new T.Points(g, new T.PointsMaterial({ size, map: TEX.glow, vertexColors: true, blending: add ? T.AdditiveBlending : T.NormalBlending,
      transparent: true, depthWrite: false, fog: !add, opacity: add ? 1 : 0.5 }));
    this.pts.frustumCulled = false; G.scene.add(this.pts);
  }
  emit(p, n, sp, color, life, o = {}) {
    const c = new T.Color(color);
    for (let k = 0; k < n; k++) {
      const i = (this.i = (this.i + 1) % this.n), a = Math.random() * PI * 2, e = (Math.random() - 0.5) * PI * (o.flat ? 0.25 : 1), s = sp * (0.35 + Math.random() * 0.65);
      const sx = o.spread || 0;
      this.pos[i * 3] = p.x + rnd(-sx, sx); this.pos[i * 3 + 1] = p.y + rnd(-sx, sx) * (o.flat ? 0 : 1); this.pos[i * 3 + 2] = p.z + rnd(-sx, sx);
      this.vel[i * 3] = Math.cos(a) * Math.cos(e) * s + (o.vx || 0); this.vel[i * 3 + 1] = Math.abs(Math.sin(e)) * s + (o.up || 0); this.vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s + (o.vz || 0);
      const v = 0.7 + Math.random() * 0.3, b = o.boost || 1;
      this.base[i * 3] = c.r * v * b; this.base[i * 3 + 1] = c.g * v * b; this.base[i * 3 + 2] = c.b * v * b;
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.4); this.grav[i] = o.grav == null ? 9 : o.grav;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0) { this.pos[j + 1] = -999; continue; }
      this.vel[j + 1] -= this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.03 && this.grav[i] > 0) { this.pos[j + 1] = 0.03; this.vel[j + 1] *= -0.3; }
      const f = this.add ? this.life[i] / this.max[i] : 1;
      this.col[j] = this.base[j] * f; this.col[j + 1] = this.base[j + 1] * f; this.col[j + 2] = this.base[j + 2] * f;
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

// Ribbon that follows the blade through a swing.
export class Trail {
  constructor(color) {
    this.N = 30; this.life = 0.16; this.pts = []; this.c = new T.Color(color);
    const g = new T.BufferGeometry(); this.p = new Float32Array(this.N * 6); this.cl = new Float32Array(this.N * 6);
    g.setAttribute('position', new T.BufferAttribute(this.p, 3)); g.setAttribute('color', new T.BufferAttribute(this.cl, 3));
    const ix = []; for (let i = 0; i < this.N - 1; i++) { const a = i * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(ix);
    this.mesh = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, blending: T.AdditiveBlending, side: T.DoubleSide, transparent: true, depthWrite: false, fog: false }));
    this.mesh.frustumCulled = false; G.scene.add(this.mesh);
  }
  add(a, b) { this.pts.unshift({ a: a.clone(), b: b.clone(), age: 0 }); if (this.pts.length > this.N) this.pts.pop(); }
  update(dt) {
    for (const q of this.pts) q.age += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].age > this.life) this.pts.pop();
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const q = this.pts[i], f = Math.pow(1 - q.age / this.life, 1.4) * 1.6, j = i * 6;
      this.p[j] = q.a.x; this.p[j + 1] = q.a.y; this.p[j + 2] = q.a.z; this.p[j + 3] = q.b.x; this.p[j + 4] = q.b.y; this.p[j + 5] = q.b.z;
      this.cl[j] = this.c.r * f * 0.1; this.cl[j + 1] = this.c.g * f * 0.1; this.cl[j + 2] = this.c.b * f * 0.1;
      this.cl[j + 3] = this.c.r * f; this.cl[j + 4] = this.c.g * f; this.cl[j + 5] = this.c.b * f;
    }
    const g = this.mesh.geometry; g.setDrawRange(0, Math.max(0, n - 1) * 6); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}

export const FX = { sparks: null, dust: null, shocks: [] };
export function initFx() { FX.sparks = new Parts(500, 0.22, true); FX.dust = new Parts(200, 0.5, false); }
export function shock(p, r, color = 0xffe2a0) {
  const m = new T.Mesh(new T.RingGeometry(0.72, 1, 40), new T.MeshBasicMaterial({ color, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
  m.position.set(p.x, 0.07, p.z); m.rotation.x = -PI / 2; G.scene.add(m); FX.shocks.push({ m, r, t: 0 });
  FX.sparks.emit(new V3(p.x, 0.15, p.z), 26, r * 2.2, color, 0.45, { flat: 1, up: 2 });
  FX.dust.emit(new V3(p.x, 0.1, p.z), 12, r * 1.2, 0xb8a37c, 0.5, { flat: 1, grav: -1, up: 0.5 });
}
export function updateFx(dt) {
  FX.sparks.update(dt); FX.dust.update(dt);
  for (let i = FX.shocks.length - 1; i >= 0; i--) {
    const s = FX.shocks[i]; s.t += dt; const u = s.t / 0.45;
    s.m.scale.setScalar(s.r * EASE_OUT(Math.min(1, u))); s.m.material.opacity = 1 - u;
    if (u >= 1) { G.scene.remove(s.m); FX.shocks.splice(i, 1); }
  }
}
