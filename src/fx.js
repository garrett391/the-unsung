import * as THREE from 'three';
import { rand, TAU } from './util.js';

const _o = new THREE.Object3D();
const _c = new THREE.Color();

class Pool {
  constructor(scene, max, material) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.p = [];
  }
  emit(q) {
    if (this.p.length >= this.max) this.p.shift();
    q.max = q.life;
    q.rot = q.rot ?? Math.random() * 6;
    this.p.push(q);
  }
  update(dt) {
    const p = this.p;
    let n = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[i];
      q.life -= dt;
      if (q.life <= 0) continue;
      q.vy -= (q.g || 0) * dt;
      const dr = Math.exp(-(q.drag || 0) * dt);
      q.vx *= dr; q.vy *= dr; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.03 && (q.g || 0) > 0) { q.y = 0.03; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      const k = q.life / q.max;
      const s = q.size * (0.25 + 0.75 * k);
      _o.position.set(q.x, q.y, q.z);
      _o.rotation.set(q.rot + q.life * 3, q.rot * 2, 0);
      _o.scale.setScalar(s);
      _o.updateMatrix();
      this.mesh.setMatrixAt(n, _o.matrix);
      _c.setHex(q.color);
      this.mesh.setColorAt(n, _c);
      p[n++] = q;
    }
    p.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  clear() {
    this.p.length = 0;
    this.mesh.count = 0;
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new Pool(scene, 420, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.solid = new Pool(scene, 260, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
    this.trans = [];
  }
  clear() {
    this.glow.clear();
    this.solid.clear();
    for (const t of this.trans) this.scene.remove(t.mesh);
    this.trans.length = 0;
  }
  sparks(x, y, z, n = 10, color = 0xffe7a0) {
    for (let i = 0; i < n; i++)
      this.glow.emit({ x, y, z, vx: rand(-4, 4), vy: rand(1, 5), vz: rand(-4, 4), g: 14, drag: 1, life: rand(0.18, 0.38), size: rand(0.04, 0.08), color });
  }
  hitBurst(x, y, z) {
    for (let i = 0; i < 7; i++)
      this.glow.emit({ x, y, z, vx: rand(-3, 3), vy: rand(0, 3), vz: rand(-3, 3), g: 6, drag: 2, life: rand(0.12, 0.25), size: rand(0.06, 0.1), color: 0xfff1d6 });
    for (let i = 0; i < 5; i++)
      this.solid.emit({ x, y, z, vx: rand(-2, 2), vy: rand(0.5, 2.5), vz: rand(-2, 2), g: 9, drag: 1, life: rand(0.3, 0.5), size: rand(0.06, 0.1), color: 0x3a2a22 });
  }
  dust(x, z, n = 6) {
    for (let i = 0; i < n; i++)
      this.solid.emit({ x: x + rand(-0.3, 0.3), y: 0.1, z: z + rand(-0.3, 0.3), vx: rand(-1, 1), vy: rand(0.3, 1.2), vz: rand(-1, 1), g: 0.6, drag: 3, life: rand(0.4, 0.7), size: rand(0.1, 0.18), color: 0xc8a676 });
  }
  ash(x, y, z, n = 22, color = 0x2a1e1a) {
    for (let i = 0; i < n; i++)
      this.solid.emit({ x: x + rand(-0.35, 0.35), y: y + rand(0, 1.4), z: z + rand(-0.35, 0.35), vx: rand(-0.6, 0.6), vy: rand(0.4, 1.8), vz: rand(-0.6, 0.6), g: -0.3, drag: 1.2, life: rand(0.7, 1.4), size: rand(0.06, 0.13), color });
  }
  ember(x, y, z) {
    this.glow.emit({ x: x + rand(-0.25, 0.25), y, z: z + rand(-0.25, 0.25), vx: rand(-0.3, 0.3), vy: rand(1, 2.4), vz: rand(-0.3, 0.3), g: -0.2, drag: 0.6, life: rand(0.8, 1.6), size: rand(0.03, 0.05), color: 0xff9a3a });
  }
  flame(x, y, z, color = 0xb46cff) {
    this.glow.emit({ x, y, z, vx: rand(-0.3, 0.3), vy: rand(0.8, 1.8), vz: rand(-0.3, 0.3), g: -0.5, drag: 1, life: rand(0.35, 0.7), size: rand(0.08, 0.16), color });
  }
  burst(x, y, z, n, color, speed = 5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      this.glow.emit({ x, y, z, vx: Math.sin(a) * speed * rand(0.5, 1), vy: rand(0.5, 3), vz: Math.cos(a) * speed * rand(0.5, 1), g: 3, drag: 2, life: rand(0.4, 0.8), size: rand(0.08, 0.16), color });
    }
  }
  _add(mesh, dur, fn) {
    this.scene.add(mesh);
    const t = { mesh, t: 0, dur, fn };
    this.trans.push(t);
    return t;
  }
  // slash trail; kind: h1 | h2 | v | spin
  arc(actor, kind, color = 0xdfe9ff, radius = 1.95) {
    const s = actor.rig.side;
    let g;
    if (kind === 'v') {
      g = new THREE.RingGeometry(radius * 0.45, radius, 14, 1, -0.6, 2.5);
      g.rotateY(-Math.PI / 2);
    } else {
      let a = -1.15 * s, b = 1.5 * s;
      if (kind === 'h2') { a = -0.95 * s; b = 1.45 * s; }
      if (a > b) [a, b] = [b, a];
      if (kind === 'spin') { a = -Math.PI; b = Math.PI; }
      g = new THREE.RingGeometry(radius * 0.38, radius, kind === 'spin' ? 28 : 14, 1, Math.PI / 2 - b, b - a);
      g.rotateX(Math.PI / 2);
    }
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    const sc = actor.rig.scale || 1;
    m.position.set(actor.pos.x, (actor.y || 0) + (kind === 'v' ? 1.42 : 1.2) * sc, actor.pos.z);
    m.rotation.y = actor.facing;
    m.scale.setScalar(sc);
    this._add(m, 0.17, (u) => { mat.opacity = 0.5 * (1 - u); });
  }
  shockwave(x, z, r, color = 0xbff5ea) {
    const g = new THREE.RingGeometry(0.82, 1, 36);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, 0.08, z);
    this._add(m, 0.5, (u) => { m.scale.setScalar(0.4 + r * Math.sqrt(u)); mat.opacity = 0.7 * (1 - u); });
  }
  // persistent ground telegraph; returns handle with .remove()
  telegraph(x, z, r, color = 0xc070ff) {
    const g = new THREE.RingGeometry(0.88, 1, 32);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, 0.07, z);
    m.scale.setScalar(r);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    fill.position.y = -0.01;
    m.add(fill);
    const h = this._add(m, 1e9, () => {});
    h.fn = (u, t) => { mat.opacity = 0.35 + 0.25 * Math.sin(t * 18); };
    h.remove = () => { h.dur = 0; };
    h.set = (nx, nz, nr) => { m.position.x = nx; m.position.z = nz; if (nr) m.scale.setScalar(nr); };
    return h;
  }
  update(dt) {
    this.glow.update(dt);
    this.solid.update(dt);
    for (let i = this.trans.length - 1; i >= 0; i--) {
      const t = this.trans[i];
      t.t += dt;
      const u = Math.min(1, t.t / Math.max(t.dur, 1e-6));
      t.fn(u, t.t);
      if (t.t >= t.dur) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        this.trans.splice(i, 1);
      }
    }
  }
}
