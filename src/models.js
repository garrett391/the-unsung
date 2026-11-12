// Geometry and texture helpers for N64-style character models: shaped limb
// segments (lathes and ellipsoids), Gouraud smooth shading, small painted textures.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const GEO = new Map();
const TEX = new Map();
const _v = new THREE.Vector3();

export function cgeo(key, make) {
  let g = GEO.get(key);
  if (!g) { g = make(); GEO.set(key, g); }
  return g;
}

// compute normals, then average them across duplicated seam vertices
export function smoothSeams(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 2000) + ',' + Math.round(p.getY(i) * 2000) + ',' + Math.round(p.getZ(i) * 2000);
    let e = groups.get(k);
    if (!e) { e = [0, 0, 0, []]; groups.set(k, e); }
    e[0] += n.getX(i); e[1] += n.getY(i); e[2] += n.getZ(i);
    e[3].push(i);
  }
  for (const e of groups.values()) {
    if (e[3].length < 2) continue;
    const l = Math.hypot(e[0], e[1], e[2]) || 1;
    for (const i of e[3]) n.setXYZ(i, e[0] / l, e[1] / l, e[2] / l);
  }
  n.needsUpdate = true;
  return g;
}

function deformAll(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    fn(_v);
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
}

// Profile points [radius, y], listed bottom to top. Seam at the back; u = 0.5 faces +z.
export function lathe(pts, sides = 8, o = {}) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0006), y)), sides, o.phiStart ?? Math.PI, o.phiLength ?? Math.PI * 2);
  const sx = o.sx ?? 1, sz = o.sz ?? 1;
  deformAll(g, (v) => { v.x *= sx; v.z *= sz; if (o.deform) o.deform(v); });
  return smoothSeams(g);
}

// Seam at the back; u = 0.5 faces +z.
export function ellipsoid(rx, ry, rz, w = 9, h = 7, o = {}) {
  const g = new THREE.SphereGeometry(1, w, h, o.p0 ?? -Math.PI / 2, o.pl ?? Math.PI * 2, o.t0 ?? 0, o.tl ?? Math.PI);
  deformAll(g, (v) => { v.x *= rx; v.y *= ry; v.z *= rz; if (o.deform) o.deform(v); });
  return smoothSeams(g);
}

export function roundedBox(w, h, d, k = 0.6, seg = 3, deform = null) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const hw = w / 2, hh = h / 2, hd = d / 2;
  deformAll(g, (v) => {
    const nx = v.x / hw, ny = v.y / hh, nz = v.z / hd;
    const l = Math.hypot(nx, ny, nz) || 1;
    v.x += (nx / l * hw - v.x) * k;
    v.y += (ny / l * hh - v.y) * k;
    v.z += (nz / l * hd - v.z) * k;
    if (deform) deform(v);
  });
  return smoothSeams(g);
}

// flat 2D outline in the XY plane, extruded along z and centred
export function extrude(pts, depth) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function sheet(w, h, ws, hs, deform) {
  const g = new THREE.PlaneGeometry(w, h, ws, hs);
  if (deform) deformAll(g, deform);
  return smoothSeams(g);
}

// ---------------------------------------------------------------------------
// Textures (painted once, shared). Canvas top = texture v 1 = top of a lathe.
// ---------------------------------------------------------------------------
const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const RGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
export const css = (h, k = 1, a = 1) => {
  const [r, g, b] = RGB(h);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
};
function ctex(key, w, h, draw) {
  let t = TEX.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h, mulberry32(hashStr(key)));
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  TEX.set(key, t);
  return t;
}
function speckle(x, w, h, rng, base, amt = 0.16, n = 220, size = 2) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = css(base, 1 + (rng() - 0.5) * amt * 2, 0.55);
    x.fillRect(rng() * w, rng() * h, size * (0.5 + rng()), size * (0.5 + rng()));
  }
}
function wrapShade(x, w, h, dark = 0.35) {
  // darker toward the back of a lathe (u = 0 and 1), as N64 vertex lighting often looked
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, `rgba(0,0,0,${dark})`);
  g.addColorStop(0.3, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${dark})`);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
}

export const texFabric = (base, trim = null, o = {}) => ctex(`fab|${base}|${trim}|${o.emblem ?? ''}|${o.hem ? 1 : 0}|${o.trimH ?? 8}`, 64, 64, (x, w, h, rng) => {
  x.fillStyle = css(base);
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 3) { x.fillStyle = css(base, 0.88, 0.45); x.fillRect(i, 0, 1, h); }
  for (let j = 0; j < h; j += 4) { x.fillStyle = css(base, 1.1, 0.22); x.fillRect(0, j, w, 1); }
  // soft fold lines
  for (let i = 0; i < 5; i++) {
    const fx = rng() * w;
    const g = x.createLinearGradient(fx - 4, 0, fx + 4, 0);
    g.addColorStop(0, css(base, 1, 0));
    g.addColorStop(0.5, css(base, 0.7, 0.5));
    g.addColorStop(1, css(base, 1, 0));
    x.fillStyle = g;
    x.fillRect(fx - 4, h * 0.3, 8, h * 0.7);
  }
  speckle(x, w, h, rng, base, 0.14, 160, 2);
  if (o.hem) {
    const g = x.createLinearGradient(0, h * 0.55, 0, h);
    g.addColorStop(0, css(base, 1, 0));
    g.addColorStop(1, css(base, 0.45, 0.9));
    x.fillStyle = g;
    x.fillRect(0, h * 0.55, w, h * 0.45);
  }
  if (trim != null) {
    const th = o.trimH ?? 8;
    x.fillStyle = css(trim);
    x.fillRect(0, h - th, w, th);
    x.fillStyle = css(trim, 0.55);
    x.fillRect(0, h - th - 1, w, 1);
    x.fillRect(0, h - 2, w, 1);
    for (let i = 2; i < w; i += 6) { x.fillStyle = css(trim, 1.3); x.fillRect(i, h - th + 3, 3, 2); }
  }
  if (o.emblem != null) {
    const cx = w / 2, cy = h * 0.3;
    x.fillStyle = css(o.emblem, 0.6);
    x.beginPath(); x.moveTo(cx, cy - 9); x.lineTo(cx + 7, cy); x.lineTo(cx, cy + 9); x.lineTo(cx - 7, cy); x.closePath(); x.fill();
    x.fillStyle = css(o.emblem);
    x.beginPath(); x.moveTo(cx, cy - 7); x.lineTo(cx + 5, cy); x.lineTo(cx, cy + 7); x.lineTo(cx - 5, cy); x.closePath(); x.fill();
    x.fillStyle = css(base);
    x.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  }
  wrapShade(x, w, h, 0.25);
});

export const texMetal = (base, o = {}) => ctex(`met|${base}|${o.rivets ? 1 : 0}`, 64, 32, (x, w, h, rng) => {
  const g = x.createLinearGradient(0, 0, w, 0);
  [[0, 0.45], [0.2, 0.7], [0.36, 1.2], [0.43, 1.75], [0.5, 1.2], [0.64, 0.9], [0.82, 0.6], [1, 0.45]].forEach(([s, k]) => g.addColorStop(s, css(base, k)));
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const g2 = x.createLinearGradient(0, 0, 0, h);
  g2.addColorStop(0, 'rgba(255,255,255,0.22)');
  g2.addColorStop(0.45, 'rgba(255,255,255,0)');
  g2.addColorStop(1, 'rgba(0,0,0,0.18)');
  x.fillStyle = g2;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) { x.fillStyle = `rgba(255,255,255,${0.05 + rng() * 0.08})`; x.fillRect(rng() * w, rng() * h, 1, 2 + rng() * 5); }
  if (o.rivets) {
    for (let i = 3; i < w; i += 9) for (const yy of [3, h - 5]) {
      x.fillStyle = css(base, 0.45); x.fillRect(i, yy, 3, 3);
      x.fillStyle = css(base, 1.9); x.fillRect(i, yy, 1, 1);
    }
  }
});

export const texMail = (base) => ctex(`mail|${base}`, 64, 64, (x, w, h) => {
  x.fillStyle = css(base, 0.4);
  x.fillRect(0, 0, w, h);
  x.lineWidth = 1;
  for (let j = 0; j < h; j += 3) {
    for (let i = (j / 3) % 2 ? 1.5 : 0; i < w; i += 3) {
      x.strokeStyle = css(base, 1.2);
      x.beginPath(); x.arc(i + 1.5, j + 1.5, 1.15, Math.PI, Math.PI * 2); x.stroke();
      x.strokeStyle = css(base, 0.75);
      x.beginPath(); x.arc(i + 1.5, j + 1.5, 1.15, 0, Math.PI); x.stroke();
    }
  }
  wrapShade(x, w, h, 0.35);
});

export const texLeather = (base) => ctex(`lea|${base}`, 64, 64, (x, w, h, rng) => {
  x.fillStyle = css(base);
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const r = 2 + rng() * 6;
    x.fillStyle = css(base, 0.8 + rng() * 0.35, 0.35);
    x.beginPath(); x.ellipse(rng() * w, rng() * h, r, r * 0.6, rng() * 3, 0, Math.PI * 2); x.fill();
  }
  for (let i = 1; i < w; i += 4) { x.fillStyle = css(base, 1.45, 0.8); x.fillRect(i, 3, 2, 1); x.fillRect(i, h - 5, 2, 1); }
  x.fillStyle = css(base, 0.6, 0.6);
  x.fillRect(0, h - 3, w, 3);
  wrapShade(x, w, h, 0.3);
});

export const texSkin = (base) => ctex(`skin|${base}`, 32, 32, (x, w, h, rng) => {
  x.fillStyle = css(base);
  x.fillRect(0, 0, w, h);
  speckle(x, w, h, rng, base, 0.06, 60, 2);
  wrapShade(x, w, h, 0.22);
});

export const texHair = (base) => ctex(`hair|${base}`, 64, 32, (x, w, h, rng) => {
  x.fillStyle = css(base);
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 1 + Math.floor(rng() * 2)) {
    x.fillStyle = css(base, 0.65 + rng() * 0.75, 0.6);
    x.fillRect(i, 0, 1, h * (0.5 + rng() * 0.5));
  }
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
});

export const texWood = (base) => ctex(`wood|${base}`, 64, 64, (x, w, h, rng) => {
  x.fillStyle = css(base);
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 2) { x.fillStyle = css(base, 0.75 + rng() * 0.5, 0.5); x.fillRect(i, 0, 1, h); }
  for (let i = 0; i < w; i += 16) { x.fillStyle = css(base, 0.5, 0.8); x.fillRect(i, 0, 1, h); }
  x.fillStyle = css(0x55595f);
  x.fillRect(0, h - 6, w, 6);
  x.fillStyle = css(0x55595f, 1.6);
  x.fillRect(0, h - 6, w, 1);
});

// Polar sunburst for a lathe-built round shield: u = around, v = rim (bottom) to centre (top).
export const texSun = (field, gold, rim) => ctex(`sun|${field}|${gold}|${rim}`, 128, 64, (x, w, h, rng) => {
  x.fillStyle = css(field);
  x.fillRect(0, 0, w, h);
  speckle(x, w, h, rng, field, 0.25, 160, 2);
  for (let k = 0; k < 8; k++) {
    const uc = ((k + 0.5) / 8) * w;
    x.fillStyle = css(gold);
    x.beginPath(); x.moveTo(uc - 6, 0); x.lineTo(uc + 6, 0); x.lineTo(uc, h * 0.66); x.closePath(); x.fill();
    const ud = (k / 8) * w;
    x.fillStyle = css(gold, 0.8);
    x.beginPath(); x.moveTo(ud - 3, 0); x.lineTo(ud + 3, 0); x.lineTo(ud, h * 0.42); x.closePath(); x.fill();
  }
  x.fillStyle = css(gold, 1.1);
  x.fillRect(0, 0, w, h * 0.16);
  x.fillStyle = css(rim);
  x.fillRect(0, h * 0.86, w, h * 0.14);
  x.fillStyle = css(rim, 1.6);
  x.fillRect(0, h * 0.86, w, 1);
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(rng() * w, h * 0.2 + rng() * h * 0.6, 3 + rng() * 6, 1); }
});

// Face painted around a sphere head: face centred at u = 0.5. Styles: stern, young, plain.
export const texFace = (skin, eye, brow, style = 'plain', lips = null) => ctex(`face|${skin}|${eye}|${brow}|${style}`, 128, 64, (x, w, h, rng) => {
  x.fillStyle = css(skin);
  x.fillRect(0, 0, w, h);
  speckle(x, w, h, rng, skin, 0.05, 80, 2);
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.3)');
  g.addColorStop(0.32, 'rgba(0,0,0,0.05)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(0.68, 'rgba(0,0,0,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const cx = w / 2;
  const young = style === 'young';
  const ey = young ? 31.5 : 31;
  // brow ridge shadow
  x.fillStyle = css(skin, 0.82, 0.6);
  x.fillRect(cx - 17, ey - 6, 34, 3);
  // cheeks
  for (const s of [-1, 1]) {
    const cg = x.createRadialGradient(cx + s * 13, ey + 9, 1, cx + s * 13, ey + 9, 7);
    cg.addColorStop(0, `rgba(200,80,70,${young ? 0.28 : 0.14})`);
    cg.addColorStop(1, 'rgba(200,80,70,0)');
    x.fillStyle = cg;
    x.fillRect(cx + s * 13 - 8, ey + 1, 16, 16);
  }
  for (const s of [-1, 1]) {
    const ex = cx + s * 9.5;
    const ew = young ? 4.6 : 4.2, eh = young ? 3.2 : 2.5;
    x.fillStyle = '#f2ece2';
    x.beginPath(); x.ellipse(ex, ey, ew, eh, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = css(eye);
    x.beginPath(); x.ellipse(ex + s * 0.2, ey + 0.2, young ? 2.6 : 2.2, eh, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#120d0b';
    x.beginPath(); x.ellipse(ex + s * 0.2, ey + 0.3, 1.1, 1.5, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.9)';
    x.fillRect(ex - 1.2, ey - 1.2, 1, 1);
    x.strokeStyle = css(brow, 0.6);
    x.lineWidth = 1.3;
    x.beginPath(); x.ellipse(ex, ey + 0.3, ew + 0.2, eh + 0.3, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
    // brows
    x.fillStyle = css(brow);
    x.beginPath();
    if (style === 'stern') {
      x.moveTo(cx + s * 3.5, ey - 4.2); x.lineTo(cx + s * 14.5, ey - 6.8); x.lineTo(cx + s * 14.5, ey - 5.2); x.lineTo(cx + s * 3.5, ey - 2.4);
    } else if (young) {
      x.moveTo(cx + s * 5, ey - 6.2); x.quadraticCurveTo(cx + s * 9.5, ey - 8.4, cx + s * 14, ey - 6.4); x.lineTo(cx + s * 14, ey - 5.4); x.quadraticCurveTo(cx + s * 9.5, ey - 7.2, cx + s * 5, ey - 5.2);
    } else {
      x.moveTo(cx + s * 4.5, ey - 5); x.lineTo(cx + s * 14, ey - 6); x.lineTo(cx + s * 14, ey - 4.8); x.lineTo(cx + s * 4.5, ey - 3.8);
    }
    x.closePath();
    x.fill();
  }
  // nose shading and nostrils
  x.fillStyle = css(skin, 0.8, 0.6);
  x.beginPath(); x.moveTo(cx - 0.5, ey - 1); x.lineTo(cx - 3, ey + 8); x.lineTo(cx + 1, ey + 8); x.closePath(); x.fill();
  x.fillStyle = css(skin, 0.55);
  x.fillRect(cx - 2.6, ey + 8, 1.4, 1);
  x.fillRect(cx + 1.4, ey + 8, 1.4, 1);
  // mouth
  const my = ey + 13;
  x.strokeStyle = css(lips ?? skin, lips ? 1 : 0.52);
  x.lineWidth = 1.4;
  x.beginPath();
  if (young) { x.moveTo(cx - 5, my - 0.5); x.quadraticCurveTo(cx, my + 2.2, cx + 5, my - 0.8); }
  else { x.moveTo(cx - 5, my); x.lineTo(cx + 5, my); }
  x.stroke();
  x.fillStyle = css(skin, 1.1, 0.5);
  x.fillRect(cx - 3, my + 2, 6, 1);
  if (style === 'stern') {
    // stubble along the jaw
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI, rr = 12 + rng() * 4;
      x.fillStyle = css(brow, 1, 0.35);
      x.fillRect(cx + Math.cos(a) * rr * 1.1, my - 4 + Math.sin(a) * rr * 0.55, 1, 1);
    }
  }
  if (young) {
    for (let i = 0; i < 16; i++) {
      x.fillStyle = 'rgba(150,70,40,0.55)';
      const s = rng() < 0.5 ? -1 : 1;
      x.fillRect(cx + s * (8 + rng() * 9), ey + 4 + rng() * 6, 1, 1);
    }
  }
});

// cloth face wrap with a dark band across the eyes (raiders)
export const texWrap = (base) => ctex(`wrap|${base}`, 128, 64, (x, w, h, rng) => {
  x.fillStyle = css(base);
  x.fillRect(0, 0, w, h);
  for (let j = 0; j < h; j += 5) { x.fillStyle = css(base, 1.35, 0.4); x.fillRect(0, j, w, 1); }
  speckle(x, w, h, rng, base, 0.3, 120, 2);
  x.fillStyle = 'rgba(0,0,0,0.75)';
  x.fillRect(w * 0.32, 25, w * 0.36, 11);
  wrapShade(x, w, h, 0.4);
});

export const texMask = (bone, paint) => ctex(`mask|${bone}|${paint}`, 64, 64, (x, w, h, rng) => {
  x.fillStyle = css(bone);
  x.fillRect(0, 0, w, h);
  speckle(x, w, h, rng, bone, 0.12, 90, 2);
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.4)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const cx = w / 2, ey = h * 0.47;
  for (const s of [-1, 1]) {
    x.fillStyle = '#060408';
    x.beginPath(); x.moveTo(cx + s * 4, ey + 2); x.lineTo(cx + s * 17, ey - 3); x.lineTo(cx + s * 17, ey + 1); x.lineTo(cx + s * 4, ey + 5); x.closePath(); x.fill();
    x.fillStyle = css(paint);
    x.fillRect(cx + s * 11, ey + 4, 2, 14);
    x.fillRect(cx + s * 7, ey + 5, 1.5, 9);
  }
  x.fillStyle = css(paint);
  x.beginPath(); x.moveTo(cx, ey - 16); x.lineTo(cx + 4, ey - 10); x.lineTo(cx, ey - 4); x.lineTo(cx - 4, ey - 10); x.closePath(); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.6)';
  x.fillRect(cx - 6, ey + 17, 12, 1.5);
});
