import * as THREE from 'three';
import { mulberry32 } from './util.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Collects many small pieces of geometry into one vertex-coloured mesh (one draw call).
// Each triangle gets a slight brightness jitter for a faceted N64 feel.
export class Batch {
  constructor(seed = 1) {
    this.parts = [];
    this.rng = mulberry32(seed);
  }
  addRaw(geo, color, matrix, jitter = 0.12) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const f = 1 - jitter / 2 + this.rng() * jitter;
      for (let j = 0; j < 3 && i + j < n; j++) {
        const k = (i + j) * 3;
        col[k] = color.r * f;
        col[k + 1] = color.g * f;
        col[k + 2] = color.b * f;
      }
    }
    this.parts.push({ pos: g.attributes.position.array, nor: g.attributes.normal.array, col });
    g.dispose();
  }
  add(geo, hex, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], jitter = 0.12) {
    _e.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
    this.addRaw(geo, _c.set(hex), _m, jitter);
  }
  // bake every visible mesh of an object hierarchy (relative to its root)
  addObject(root, jitter = 0.08, extra = null) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    if (extra) inv.premultiply(extra);
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let vis = true;
      for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) vis = false;
      if (!vis) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      this.addRaw(o.geometry, o.material.userData.flat || o.material.color, m, jitter);
    });
  }
  build(material) {
    let total = 0;
    for (const p of this.parts) total += p.pos.length;
    const pos = new Float32Array(total);
    const nor = new Float32Array(total);
    const col = new Float32Array(total);
    let o = 0;
    for (const p of this.parts) {
      pos.set(p.pos, o);
      nor.set(p.nor, o);
      col.set(p.col, o);
      o += p.pos.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    this.parts = [];
    return new THREE.Mesh(g, material);
  }
}

// Triangular prism (A-frame tent / roof), ridge along z, base on y = 0.
export function prismGeo(w, h, len) {
  const L = len / 2;
  const v = [
    [-w, 0, L], [w, 0, L], [0, h, L],
    [-w, 0, -L], [w, 0, -L], [0, h, -L],
  ];
  const tris = [
    [0, 1, 2], [4, 3, 5], // ends
    [0, 2, 5], [0, 5, 3], // left slope
    [1, 4, 5], [1, 5, 2], // right slope
  ];
  const arr = [];
  for (const t of tris) for (const i of t) arr.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
}
