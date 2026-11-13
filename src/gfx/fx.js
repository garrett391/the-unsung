import * as T from 'three';
import { G } from '../core/game.js';
import { PI, rnd, rng } from '../core/util.js';
import { TEX, canvasTex } from './materials.js';
import { opts } from '../core/input.js';

const V3 = T.Vector3;
const EASE_OUT = (u) => 1 - Math.pow(1 - u, 3);

// Pooled point sprites. Additive ones fade by dimming; the rest just expire.
export class Parts {
  constructor(n, size, add, opacity = 0.5, map = TEX.glow) {
    this.n = n; this.add = add; this.i = 0; this.onLand = null; // onLand(x, z): called once when a falling particle reaches the ground, which then ends it
    this.pos = new Float32Array(n * 3).fill(-999); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.base = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3)); g.setAttribute('color', new T.BufferAttribute(this.col, 3));
    this.pts = new T.Points(g, new T.PointsMaterial({ size, map, vertexColors: true, blending: add ? T.AdditiveBlending : T.NormalBlending,
      transparent: true, depthWrite: false, fog: !add, opacity: add ? 1 : opacity }));
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
      if (this.pos[j + 1] < 0.03 && this.grav[i] > 0) {
        if (this.onLand) { this.onLand(this.pos[j], this.pos[j + 2]); this.life[i] = 0; this.pos[j + 1] = -999; continue; }
        this.pos[j + 1] = 0.03; this.vel[j + 1] *= -0.3;
      }
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

// Painted blood shapes, white on clear so the instance tint colours them. Three splats (a
// ragged pool with fingers and satellite drops) and one streak (cast-off: a thin tail that
// fattens to a head, drawn head-down so it lies along +Z).
const BR = rng(41);
function splatTex() {
  return canvasTex(128, (g, n) => {
    g.clearRect(0, 0, n, n); g.fillStyle = '#fff'; const c = n / 2, dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    for (let i = 0; i < 9; i++) { const a = BR() * 7, d = BR() * 13; dot(c + Math.cos(a) * d, c + Math.sin(a) * d, 15 + BR() * 11); }
    for (let i = 0, k = 6 + ((BR() * 5) | 0); i < k; i++) { // fingers thrown out of the pool, each ending in a bead
      const a = (i / k) * PI * 2 + BR() * 0.6, l = 34 + BR() * 20, w = 3 + BR() * 4, x = c + Math.cos(a) * l, y = c + Math.sin(a) * l, px = -Math.sin(a) * w, py = Math.cos(a) * w;
      g.beginPath(); g.moveTo(c + px * 2.4, c + py * 2.4); g.lineTo(x + px * 0.3, y + py * 0.3); g.lineTo(x - px * 0.3, y - py * 0.3); g.lineTo(c - px * 2.4, c - py * 2.4); g.fill(); dot(x, y, w * (0.5 + BR() * 0.5));
    }
    for (let i = 0; i < 12; i++) { const a = BR() * 7, d = 40 + BR() * 21; dot(c + Math.cos(a) * d, c + Math.sin(a) * d, 0.8 + BR() * 2.6); }
  });
}
function streakTex() {
  return canvasTex(128, (g, n) => {
    g.clearRect(0, 0, n, n); g.fillStyle = '#fff'; const c = n / 2, dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
    g.beginPath(); g.moveTo(c - 1, 6); g.quadraticCurveTo(c - 22, 84, c - 15, 104); g.quadraticCurveTo(c, 124, c + 15, 104); g.quadraticCurveTo(c + 22, 84, c + 1, 6); g.fill();
    for (let i = 0; i < 9; i++) dot(c + (BR() - 0.5) * 60, 30 + BR() * 92, 1.5 + BR() * 4.5);
  });
}
const FRESH = new T.Color(0x720810), DRIED = new T.Color(0x30070a);
// Blood on the ground: pooled flat decals. Each lands fresh and bright, darkens as it dries,
// then fades out. A pool with `grow` spreads to its size over that many seconds.
class Stains {
  constructor(per) {
    this.sets = [splatTex(), splatTex(), splatTex(), streakTex()].map((map, v) => {
      const n = v === 3 ? Math.round(per * 0.75) : per, g = new T.PlaneGeometry(2, 2); g.rotateX(-PI / 2);
      const tint = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4); g.setAttribute('aTint', tint);
      const mat = new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      mat.onBeforeCompile = (sh) => { // per-instance colour and opacity
        sh.vertexShader = 'attribute vec4 aTint;varying vec4 vTint;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint=aTint;');
        sh.fragmentShader = 'varying vec4 vTint;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor*=vTint;');
      };
      const mesh = new T.InstancedMesh(g, mat, n); mesh.frustumCulled = false; mesh.renderOrder = 1; G.scene.add(mesh);
      const d = []; for (let k = 0; k < n; k++) { d.push({ x: 0, z: 0, sx: 0, sz: 0, r: 0, age: 1e9, life: 0, grow: 0 }); mesh.setMatrixAt(k, ZERO); }
      return { mesh, tint, d, n, i: 0, y: 0.046 + v * 0.004 };
    });
  }
  // `dir` (optional) lays a streak along the way the blood was thrown.
  add(x, z, size, life = 20, grow = 0, dir = null) {
    const s = this.sets[dir ? 3 : (Math.random() * 3) | 0], k = (s.i = (s.i + 1) % s.n), d = s.d[k];
    d.x = x; d.z = z; d.age = 0; d.life = life; d.grow = grow;
    if (dir) { d.sx = size * rnd(0.3, 0.5); d.sz = size * rnd(0.9, 1.4); d.r = Math.atan2(dir.x, dir.z) + rnd(-0.35, 0.35); }
    else { d.sx = size * rnd(1.3, 1.9); d.sz = size * rnd(1.3, 1.9); d.r = rnd(0, PI * 2); }
  }
  clear() { for (const s of this.sets) for (const d of s.d) if (d.age <= d.life) d.age = d.life; }
  update(dt) {
    for (const s of this.sets) {
      let any = false; const t = s.tint.array;
      for (let k = 0; k < s.n; k++) {
        const d = s.d[k]; if (d.age > d.life) continue; any = true; d.age += dt;
        const a = d.age, L = d.life, j = k * 4;
        if (a > L) { s.mesh.setMatrixAt(k, ZERO); t[j + 3] = 0; continue; }
        const f = d.grow ? 0.25 + 0.75 * EASE_OUT(Math.min(1, a / d.grow)) : 0.5 + 0.5 * EASE_OUT(Math.min(1, a / 0.14));
        tmpM.makeRotationY(d.r).scale(tmpS.set(d.sx * f, 1, d.sz * f)).setPosition(d.x, s.y + k * 0.0002, d.z); s.mesh.setMatrixAt(k, tmpM);
        const dry = Math.min(1, a / (7 + d.grow * 2)); tmpC.copy(FRESH).lerp(DRIED, dry * dry * (3 - 2 * dry));
        t[j] = tmpC.r; t[j + 1] = tmpC.g; t[j + 2] = tmpC.b; t[j + 3] = 0.92 * Math.min(1, (L - a) / 4);
      }
      if (any) { s.mesh.instanceMatrix.needsUpdate = true; s.tint.needsUpdate = true; }
    }
  }
}
const ZERO = new T.Matrix4().makeScale(0, 0, 0), tmpM = new T.Matrix4(), tmpC = new T.Color();
const tmpS = new V3();
export const FX = { sparks: null, dust: null, blood: null, gouts: null, stains: null, shocks: [] };
export function initFx() {
  FX.sparks = new Parts(500, 0.22, true); FX.dust = new Parts(200, 0.5, false);
  // drops are small hard-edged beads, not soft glows, so they read as paint with the cel look
  const drop = canvasTex(32, (g, n) => { g.clearRect(0, 0, n, n); g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 13, 0, 7); g.fill(); });
  FX.blood = new Parts(360, 0.085, false, 1, drop); FX.blood.pts.material.alphaTest = 0.5;
  FX.gouts = new Parts(90, 0.15, false, 1, drop); FX.gouts.pts.material.alphaTest = 0.5;
  FX.stains = new Stains(40);
  FX.blood.onLand = (x, z) => { if (Math.random() < 0.7) FX.stains.add(x, z, rnd(0.04, 0.1)); };
  FX.gouts.onLand = (x, z) => FX.stains.add(x, z, rnd(0.1, 0.19), 26);
}
const BLOOD = 0x8e0d14, tmpD = new V3();
// A cut that lands. `dir` is the way the blow travelled; `k` scales it (1 light, 2 heavy, 3
// riposte or killing blow); `by` is whoever struck, whose blade comes away wet. Stylised:
// flat dark red beads thrown along the cut, a few heavier gouts, splats where they land
// that dry and fade, and cast-off streaks on the ground from heavy blows. A kill throws a
// wider burst and leaves a pool that spreads where the body falls. Off when opts.blood is false.
export function blood(p, dir, k = 1, kill = false, by = null) {
  if (!opts.blood) return;
  const v = 1.7 + k * 0.7;
  FX.blood.emit(p, 7 + Math.round(k * 6), 1.5 + k * 0.6, BLOOD, 0.9, { vx: dir.x * v, vz: dir.z * v, up: 0.7 + k * 0.3, spread: 0.06 });
  FX.gouts.emit(p, 1 + Math.round(k), 1.0 + k * 0.4, BLOOD, 1.0, { vx: dir.x * v * 0.8, vz: dir.z * v * 0.8, up: 1.0 + k * 0.25, spread: 0.05 });
  if (k >= 2 || kill) for (let i = 0, n = kill ? 3 : 1; i < n; i++) { // cast-off along the cut
    const r = rnd(0.7, 1.9), side = rnd(-0.35, 0.35); tmpD.set(dir.x - dir.z * side, 0, dir.z + dir.x * side);
    FX.stains.add(p.x + tmpD.x * r, p.z + tmpD.z * r, rnd(0.22, 0.4) * (kill ? 1.2 : 1), 26, 0, tmpD);
  }
  if (kill) {
    FX.blood.emit(p, 16, 3.4, BLOOD, 1.0, { vx: dir.x * 2.4, vz: dir.z * 2.4, up: 1.9, spread: 0.1 });
    FX.gouts.emit(p, 4, 2.2, BLOOD, 1.0, { vx: dir.x * 1.6, vz: dir.z * 1.6, up: 1.6, spread: 0.08 });
    FX.stains.add(p.x + dir.x * 0.75, p.z + dir.z * 0.75, rnd(0.34, 0.46), 38, 3.2); // the pool under the body
    FX.stains.add(p.x + dir.x * rnd(0.3, 1.1) + rnd(-0.4, 0.4), p.z + dir.z * rnd(0.3, 1.1) + rnd(-0.4, 0.4), rnd(0.14, 0.22), 30);
  }
  if (by) by.wet = Math.min(1, (by.wet || 0) + 0.2 + k * 0.12);
}
// A bead running off a wet blade.
export function drip(p) { if (opts.blood) FX.blood.emit(p, 1, 0.15, BLOOD, 1.2, { spread: 0.01 }); }
export const clearBlood = () => FX.stains.clear();
export function shock(p, r, color = 0xffe2a0) {
  const m = new T.Mesh(new T.RingGeometry(0.72, 1, 40), new T.MeshBasicMaterial({ color, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
  m.position.set(p.x, 0.07, p.z); m.rotation.x = -PI / 2; G.scene.add(m); FX.shocks.push({ m, r, t: 0 });
  FX.sparks.emit(new V3(p.x, 0.15, p.z), 26, r * 2.2, color, 0.45, { flat: 1, up: 2 });
  FX.dust.emit(new V3(p.x, 0.1, p.z), 12, r * 1.2, 0xb8a37c, 0.5, { flat: 1, grav: -1, up: 0.5 });
}
export function updateFx(dt) {
  FX.sparks.update(dt); FX.dust.update(dt); FX.blood.update(dt); FX.gouts.update(dt); FX.stains.update(dt);
  for (let i = FX.shocks.length - 1; i >= 0; i--) {
    const s = FX.shocks[i]; s.t += dt; const u = s.t / 0.45;
    s.m.scale.setScalar(s.r * EASE_OUT(Math.min(1, u))); s.m.material.opacity = 1 - u;
    if (u >= 1) { G.scene.remove(s.m); FX.shocks.splice(i, 1); }
  }
}
