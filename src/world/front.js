import * as T from 'three';
import { G } from '../core/game.js';
import { PI, clamp, lerp, rng } from '../core/util.js';
import { toon, TEX, canvasTex, speck } from '../gfx/materials.js';
import { FX } from '../gfx/fx.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// The frontier beyond the last wells (owner, Nov 2026: not another walled box with one way in, but open,
// varied country). A fifth site, far from the others. Coordinates here are local: x east, z north, from FRONT.
//   south   the well picket, in a hollow with palms
//   then    a stony pan, and a rise across it with a rock shelf on its east end that looks out over lower ground
//   then    down into a dry riverbed that winds north-west and back, between rock banks, with a pocket off its west side
//   north   a basin under a butte, and on the butte the beacon tower
// What can be walked on is a run of overlapping circles (FAREA), so its edge is never a straight line; the edge itself is
// made by the land: dune faces, rock, the riverbed's banks. The ground has real height (`height`), which every figure,
// shadow, stain and particle stands on (Char.animate, fx.js, level.lay). Slopes inside the circles are gentle: there is
// no foot placement, so a steep one would show.
export const FRONT = { x: 260, z: -160 };
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = (x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * s * s));

// The riverbed's line, and circles strung along it.
const WADI = [[5, -8], [-2, -2], [-9, 4], [-15, 12], [-16, 20], [-12, 27], [-4, 32]];
const WLEN = WADI.reduce((l, p, i) => (i ? l + Math.hypot(p[0] - WADI[i - 1][0], p[1] - WADI[i - 1][1]) : 0), 0);
const along = (line, s) => { for (let i = 1; i < line.length; i++) { const a = line[i - 1], b = line[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s <= l || i === line.length - 1) return [lerp(a[0], b[0], s / l), lerp(a[1], b[1], s / l)]; s -= l; } return line[0]; };
const nearLine = (line, x, z) => { let bd = 1e9, bs = 0, acc = 0; for (let i = 1; i < line.length; i++) { const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1), d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), l = Math.sqrt(l2); if (d < bd) { bd = d; bs = acc + t * l; } acc += l; } return [bd, bs]; };
// [x, z, r], local. Neighbours overlap by well over the widest walker (see confine in level.js).
// the well, the pan, the rise, the shelf on its east end, and the slope down east of that to the low ground
const DISCS = [[0, -44, 12], [3, -30, 10], [8, -17, 10], [22, -20, 9], [35, -14, 8], [47, -10, 9]];
for (let s = 0; s <= WLEN + 0.1; s += 5.5) DISCS.push([...along(WADI, Math.min(s, WLEN)), 6.3]); // the riverbed
DISCS.push([-25, 10, 7]); // a pocket off its west bank
DISCS.push([-3, 35, 10], [10, 39, 13], [8, 55, 10], [9, 68, 9], [27, 35, 9], [40, 37, 9]); // the basin, and the two ways into it off the dunes: north and east

// Finding the way: which circle leads to which. A walker whose straight line to its target leaves the walkable ground
// (the riverbed bends) heads for the overlap with the next circle on the shortest chain of them instead.
// (Any open site is built this way: `openArea` turns its circles, local to `at`, into the walkable area, the distance
// outside it, and the router.)
export function openArea(discs, at) {
  const area = discs.map(([x, z, r]) => ({ x: at.x + x, z: at.z + z, r }));
  const outside = (x, z) => { let e = 1e9; for (const d of discs) e = Math.min(e, Math.hypot(x - d[0], z - d[1]) - d[2]); return e; }; // metres outside the walkable ground (negative inside it)
  const n = discs.length, adj = discs.map((a, i) => discs.map((b, j) => i !== j && a[2] + b[2] - Math.hypot(a[0] - b[0], a[1] - b[1]) > 2.2));
  const next = discs.map((_, to) => { const nx = new Int16Array(n).fill(-1), q = [to]; nx[to] = to; while (q.length) { const c = q.shift(); for (let k = 0; k < n; k++) if (adj[c][k] && nx[k] < 0) { nx[k] = c; q.push(k); } } return nx; }); // next[to][from] = the next circle on the way
  const discOf = (x, z) => { let b = -1, bm = -1e9; discs.forEach((d, i) => { const m = d[2] - Math.hypot(x - d[0], z - d[1]); if (m > bm) { bm = m; b = i; } }); return b; };
  const route = (p, t) => {
    const px = p.x - at.x, pz = p.z - at.z, tx = t.x - at.x, tz = t.z - at.z, l = Math.hypot(tx - px, tz - pz), k0 = Math.ceil(l / 1.5);
    let clear = true; for (let k = 1; k < k0 && clear; k++) if (outside(lerp(px, tx, k / k0), lerp(pz, tz, k / k0)) > -0.5) clear = false;
    if (clear) return null;
    const a = discOf(px, pz), b = discOf(tx, tz); if (a === b) return null; const c = next[b][a]; if (c < 0 || c === a) return null;
    const A = discs[a], C = discs[c], d = Math.hypot(C[0] - A[0], C[1] - A[1]), u = (d + A[2] - C[2]) / 2 / d; let gx = lerp(A[0], C[0], u), gz = lerp(A[1], C[1], u); // the middle of the overlap of the two
    if (Math.hypot(gx - px, gz - pz) < 1.6) { gx = C[0]; gz = C[1]; } // there already: on into the next one
    return [gx + at.x, gz + at.z];
  };
  return { area, outside, route };
}
const OPEN = openArea(DISCS, FRONT), outside = OPEN.outside;
export const FAREA = OPEN.area, frontRoute = OPEN.route;

// The lie of the land.
const RA = -0.18, RNX = -Math.sin(RA), RNZ = Math.cos(RA); // the rise runs a little north of east
const BEACON = [28, 53];
function land(x, z) {
  let h = 0.3 * Math.sin(x * 0.11 + 0.7) * Math.cos(z * 0.09 - 0.4) + 0.14 * Math.sin(x * 0.27 + z * 0.21 + 1.1) + 0.06 * Math.sin(x * 0.6 - z * 0.45);
  const dr = (x - 8) * RNX + (z + 17) * RNZ, al = (x - 8) * RNZ - (z + 17) * RNX;
  h += 2.5 * (0.78 + 0.22 * Math.sin(al * 0.09 + 0.5)) * Math.exp(-(dr * dr) / (2 * 6.8 * 6.8)) * (1 - sm(36, 56, al)) * sm(-46, -26, al); // the rise
  const [wd, ws] = nearLine(WADI, x, z);
  h -= 2.3 * sm(0, 13, ws) * (1 - 0.55 * sm(WLEN - 9, WLEN, ws)) * (1 - sm(4.2, 8.4, wd)); // the riverbed, cut in gradually from its south end and opening out at the north
  h -= 0.7 * gauss(x, z, 0, -44, 9) + 1.0 * gauss(x, z, 8, 39, 13) + 3.2 * gauss(x, z, 54, -12, 18); // the well's hollow, the basin, the low ground to the east
  h += 1.3 * gauss(x, z, BEACON[0], BEACON[1], 8);
  const e = outside(x, z), s = 0.5 + 0.5 * Math.sin(x * 0.05 + 1.0) * Math.cos(z * 0.045 + 0.3), open = 1 - 0.85 * gauss(x, z, 48, -14, 20);
  h += sm(-1.5, 7, e) * (1.4 + 4.6 * s) * open; // the edge of the walkable ground: a bank, a dune face
  h += sm(8, 45, e) * (2.6 * Math.sin(x * 0.045 + z * 0.02) + 2.0 * Math.sin(z * 0.06 - x * 0.03) + 0.8 * Math.sin(x * 0.13) + 1.5); // and dunes beyond
  return h;
}

// ---- shared by every open site (the frontier, the wash)
// The ground: one sheet, fine where he walks and coarse far off (the grid's lines crowd toward the middle). `colour(x, z, slope, c)`
// sets each vertex's colour in `c`. Returns the height at a local point: exactly the sheet's own surface (each cell is two
// triangles, split along the same diagonal as the mesh), so feet meet it.
export function openSheet(g, land, colour) {
  const N = 190, warp = (u) => 92 * u + 178 * u ** 7, xs = new Float32Array(N + 1); for (let i = 0; i <= N; i++) xs[i] = warp((i / N) * 2 - 1);
  const H = new Float32Array((N + 1) * (N + 1)); for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = land(xs[i], xs[j]);
  const cell = (v) => { let a = 0, b = N; while (b - a > 1) { const m = (a + b) >> 1; if (xs[m] <= v) a = m; else b = m; } return a; };
  const hl = (x, z) => {
    x = clamp(x, xs[0], xs[N] - 1e-3); z = clamp(z, xs[0], xs[N] - 1e-3); const i = cell(x), j = cell(z), u = (x - xs[i]) / (xs[i + 1] - xs[i]), v = (z - xs[j]) / (xs[j + 1] - xs[j]), k = j * (N + 1) + i;
    const a = H[k], b = H[k + 1], c = H[k + N + 1], d = H[k + N + 2];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const pos = new Float32Array((N + 1) * (N + 1) * 3), uv = new Float32Array((N + 1) * (N + 1) * 2), col = new Float32Array((N + 1) * (N + 1) * 3), idx = [], c = new T.Color();
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = j * (N + 1) + i, x = xs[i], z = xs[j], h = H[k]; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
    colour(x, z, Math.hypot(land(x + 0.5, z) - land(x - 0.5, z), land(x, z + 0.5) - land(x, z - 0.5)), c);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    if (i < N && j < N) idx.push(k, k + N + 1, k + 1, k + 1, k + N + 1, k + N + 2);
  }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const tx = TEX.sand.clone(); tx.repeat.set(1, 1); tx.needsUpdate = true;
  const mat = toon(0xffffff, { map: tx, vertexColors: true }), ramp = new T.DataTexture(new Uint8Array([64, 92, 124, 156, 188, 216, 238, 255]), 8, 1, T.RedFormat); ramp.minFilter = ramp.magFilter = T.LinearFilter; ramp.needsUpdate = true;
  mat.gradientMap = ramp; // a soft ramp: on broad smooth slopes the four hard toon bands showed as polygons the size of the grid
  const m = new T.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
  return hl;
}
// Rock. Smooth, weathered lumps (a ball pushed about by a few octaves of noise), bedded like the mesas: four shapes,
// drawn many times over (made once, for every open site). Sand lies on their tops.
let ROCKKIT = null;
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y, z) => { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t; return L(L(L(hash(X, Y, Z), hash(X + 1, Y, Z), u), L(hash(X, Y + 1, Z), hash(X + 1, Y + 1, Z), u), v), L(L(hash(X, Y, Z + 1), hash(X + 1, Y, Z + 1), u), L(hash(X, Y + 1, Z + 1), hash(X + 1, Y + 1, Z + 1), u), v), w) * 2 - 1; };
function rockKit() {
  if (ROCKKIT) return ROCKKIT;
  const rockTex = canvasTex(256, (c, n) => { const r = rng(88);
    speck(c, n, [186, 138, 100], 16, r);
    for (let y = 0; y < n;) { const h = 6 + r() * 22; c.fillStyle = ['rgba(140,84,56,.5)', 'rgba(224,182,134,.45)', 'rgba(116,72,52,.4)', 'rgba(206,150,100,.4)'][(r() * 4) | 0]; c.fillRect(0, y, n, h); c.fillStyle = 'rgba(60,36,26,.32)'; c.fillRect(0, y + h - 1.5, n, 1.5); y += h; }
    for (let k = 0; k < 12; k++) { let x = r() * n, y = r() * n; c.strokeStyle = `rgba(62,38,28,${0.08 + r() * 0.12})`; c.lineWidth = 0.8 + r() * 1.2; c.beginPath(); c.moveTo(x, y); for (let m = 0; m < 5; m++) { x += (r() - 0.5) * 8; y += 8 + r() * 20; c.lineTo(x, y); } c.stroke(); }
    for (let i = 0; i < 40; i++) { c.fillStyle = r() < 0.5 ? 'rgba(70,44,34,.14)' : 'rgba(236,206,160,.12)'; c.beginPath(); c.arc(r() * n, r() * n, 6 + r() * 24, 0, 7); c.fill(); } });
  const rockGeo = (seed, slab) => {
    let geo = new T.IcosahedronGeometry(1, 4); geo.deleteAttribute('normal'); geo.deleteAttribute('uv'); geo = mergeVertices(geo, 1e-4);
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3), o = seed * 17.3;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = 1 + 0.3 * vnoise(x * 1.3 + o, y * 1.3, z * 1.3) + 0.14 * vnoise(x * 2.9, y * 2.9 + o, z * 2.9) + 0.05 * vnoise(x * 6.5, y * 6.5, z * 6.5 + o);
      x *= d; z *= d; y = y * d * (slab ? 0.5 : 0.82); if (slab) { const t = Math.round(y * 5) / 5; y = lerp(y, t, 0.6); } // a slab: lower, and stepped along its beds
      if (y < -0.25) y = -0.25 + (y + 0.25) * 0.2; p.setXYZ(i, x, y + 0.25, z); uv[i * 2] = (x + z) * 0.3 + seed; uv[i * 2 + 1] = y * 0.42 + seed * 0.37; }
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.computeVertexNormals(); const nm = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), top = sm(0.72, 0.95, nm.getY(i)) * sm(0.2, 0.6, y), foot = 0.62 + 0.38 * sm(0.0, 0.35, y); // sand on what faces the sky; darker where it meets the ground
      col[i * 3] = lerp(foot, 1.16, top); col[i * 3 + 1] = lerp(foot, 1.02, top * 0.9); col[i * 3 + 2] = lerp(foot * 0.98, 0.78, top); }
    geo.setAttribute('color', new T.BufferAttribute(col, 3)); return geo;
  };
  ROCKKIT = { mRock: toon(0xffffff, { map: rockTex, vertexColors: true }), ROCKS: [rockGeo(1), rockGeo(2), rockGeo(3, true), rockGeo(4, true)] };
  return ROCKKIT;
}
// A site's rocks: rock(x, z, r, o) puts one of half-width r at a local point, sunk a little into the ground (o.solid makes it
// something to walk round, through `block`; o.kind picks the shape, o.sy its height); rock.done() draws them all.
export function rockSet(g, hl, q, block) {
  const { mRock, ROCKS } = rockKit(), rockAt = ROCKS.map(() => []), Q = (a, b) => a + q() * (b - a);
  const M4 = new T.Matrix4(), qt = new T.Quaternion(), eu = new T.Euler(), sv = new T.Vector3(1, 1, 1), pv = new T.Vector3();
  const rock = (x, z, r, o = {}) => { const k = o.kind == null ? (q() * 4) | 0 : o.kind, sy = o.sy || Q(0.75, 1.25); pv.set(x, hl(x, z) - r * 0.12, z); qt.setFromEuler(eu.set(Q(-0.12, 0.12), Q(0, 6.3), Q(-0.12, 0.12))); sv.set(r * Q(0.85, 1.2), r * sy, r * Q(0.85, 1.2)); rockAt[k].push(M4.compose(pv, qt, sv).clone()); if (o.solid) block(x, z, r * 0.92); };
  rock.done = () => ROCKS.forEach((geo, k) => { const im = new T.InstancedMesh(geo, mRock, rockAt[k].length); rockAt[k].forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; g.add(im); });
  return rock;
}

export function buildFront(scene, kit) {
  const g = new T.Group(); g.position.set(FRONT.x, 0, FRONT.z); scene.add(g);
  const q = rng(5151), Q = (a, b) => a + q() * (b - a), obs = [], banners = [];
  const block = (x, z, r) => obs.push({ x: FRONT.x + x, z: FRONT.z + z, r });
  const V = (x, y, z) => new T.Vector3(x, y, z), UP = V(0, 1, 0);

  // ---- the ground
  const SAND = new T.Color(0xffffff), GRAVEL = new T.Color(0xb0a696), ROCK = new T.Color(0xb98f72), DAMP = new T.Color(0x9a9c74), PALE = new T.Color(0xfff0d2), c2 = new T.Color();
  const hl = openSheet(g, land, (x, z, sl, c) => {
    const [wd, ws] = nearLine(WADI, x, z), e = outside(x, z);
    const bed = sm(2, 13, ws) * (1 - sm(3.6, 6.2, wd)), blot = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.27 - Math.sin(x * 0.13) * 2);
    c.copy(SAND).lerp(PALE, 0.5 * blot * sm(2, 20, e)); // wind-sorted sand on the dunes
    c.lerp(c2.copy(GRAVEL).multiplyScalar(0.86 + 0.2 * blot), Math.max(bed * 0.9, 0.55 * (1 - blot) * (1 - sm(-2, 6, e)))); // gravel in the riverbed, and stony patches on the pans
    c.lerp(ROCK, clamp((sl - 0.42) * 2.6, 0, 0.8) * (1 - sm(10, 30, e))); // bared rock where a bank is steep
    c.lerp(DAMP, 0.6 * gauss(x, z, 0, -44, 6.5)); // darker and greener round the well
  });
  const height = (wx, wz) => hl(wx - FRONT.x, wz - FRONT.z);

  // ---- rock
  const M4 = new T.Matrix4(), qt = new T.Quaternion(), eu = new T.Euler(), sv = V(1, 1, 1), pv = V(0, 0, 0);
  const rock = rockSet(g, hl, q, block);
  // along the edge of the walkable ground: outcrops where the land does not rise much by itself, heavier and nearly unbroken down the riverbed's banks
  for (let i = 0; i < DISCS.length; i++) { const [cx, cz, cr] = DISCS[i], n = Math.round((cr * 2 * PI) / 2.6);
    for (let k = 0; k < n; k++) { const a = (k / n) * PI * 2 + Q(-0.1, 0.1), x = cx + Math.sin(a) * (cr + 1.4), z = cz + Math.cos(a) * (cr + 1.4); if (outside(x, z) < 1.2) continue;
      const s = 0.5 + 0.5 * Math.sin(x * 0.05 + 1.0) * Math.cos(z * 0.045 + 0.3), [wd, ws] = nearLine(WADI, x, z), bank = wd < 10 && ws > 6 && ws < WLEN - 3;
      if (q() > (bank ? 0.95 : 0.72 - s * 0.6)) continue;
      const r = bank ? Q(1.5, 2.8) : Q(0.7, 2.1); rock(x + Q(-0.5, 0.5), z + Q(-0.5, 0.5), r, { kind: bank ? ((q() * 2) | 0) + 2 * (q() < 0.6 ? 1 : 0) : undefined, sy: bank ? Q(0.9, 1.6) : undefined });
      if (q() < 0.5) rock(x + Math.sin(a) * r * 1.1 + Q(-1, 1), z + Math.cos(a) * r * 1.1 + Q(-1, 1), r * Q(0.4, 0.7)); } }
  // standing in the open, to fight round: on the pan and the rise, in the riverbed, in the basin
  // (each with room to pass on both sides: a rock close to the edge of the walkable ground makes a pocket that a walker steers into and stays in)
  for (const [x, z, r] of [[8.5, -27.5, 1.2], [0, -25, 0.8], [1.5, -16.5, 1.0], [12, -15, 1.3], [26.5, -24, 1.1], [-5.5, 0.5, 0.9], [-17.5, 15.5, 1.0], [-10, 28.5, 0.8], [-27.5, 12.5, 1.2], [3.5, 45, 1.4], [16, 32, 1.1], [-6.5, 39.5, 1.0], [12, 57.5, 1.2], [30.5, 38.5, 1.3]]) rock(x, z, r, { solid: true });
  rock(21.5, 47.2, 0.9); rock(24.2, 45.6, 0.7); // fallen from the tower, at the foot of its rock
  for (let k = 0; k < 16; k++) { const a = (k / 16) * PI * 2 + Q(-0.15, 0.15), d = Q(7.6, 9.6), x = BEACON[0] + Math.sin(a) * d, z = BEACON[1] + Math.cos(a) * d; if (outside(x, z) < 0.8) continue; rock(x, z, Q(1.6, 3.0), { kind: (q() * 4) | 0, sy: Q(0.9, 1.7) }); } // heaped against the foot of the beacon's rock, so it does not stand on the sand like a drum
  // out on the dunes, half buried
  for (let i = 0; i < 70; i++) { const a = Q(0, 6.3), d = Q(30, 95), x = Math.sin(a) * d + 4, z = Math.cos(a) * d + 4; if (outside(x, z) > 7) rock(x, z, Q(0.6, 3.2), { sy: Q(0.5, 1.0) }); }
  rock.done();

  // ---- mesas and buttes on the skyline (the waystation's), and the butte the beacon stands on
  const TOP = 7.2; // how high the beacon's rock stands
  kit.into(g, () => {
    kit.mesa(BEACON[0], BEACON[1], 6.6, TOP + 3 /* its foot is sunk 3 m */, { sx: 1.15, ry: 0.7 });
    kit.mesa(-58, 30, 12, 19, { sx: 1.3, ry: 0.5 }); kit.mesa(-44, -34, 9, 15, { sx: 0.9, ry: 1.2 }); kit.mesa(64, 62, 14, 23, { sx: 1.4, ry: -0.3, tilt: 0.22, ta: 2 });
    kit.mesa(78, -44, 12, 17, { sx: 1.2 }); kit.mesa(-20, 88, 15, 21, { sx: 1.7, ry: 0.2, tilt: 0.25, ta: PI }); kit.mesa(40, 84, 7, 22, { sx: 0.85 }); kit.mesa(-78, -6, 10, 24, { sx: 0.9, ry: 2 }); kit.mesa(20, -84, 14, 14, { sx: 1.9, ry: 0.1 });
  });
  // palms by the well, stood on the hollow's floor
  { const c0 = g.children.length; kit.into(g, () => { kit.palm(-5.5, -49.5, 7.4, 1.2, 2.2); kit.palm(4.8, -52, 6.4, 0.9, -0.8); kit.palm(-9, -43, 5.8, 0.8, 1.2); kit.palm(7.5, -46.5, 8.0, 1.3, 0.4); kit.palm(-2, -55.5, 6.8, 1.0, 3.0); });
    for (const m of g.children.slice(c0)) m.position.y += hl(m.position.x, m.position.z) - 0.1; }
  for (const [x, z] of [[-5.5, -49.5], [4.8, -52], [-9, -43], [7.5, -46.5]]) block(x, z, 0.5);

  // ---- things built: shared materials, and a way to stand them on the ground
  const mStone = toon(0xffffff, { map: TEX.block }), mStoneD = toon(0x8f8068), mWood = toon(0x5c4028), mWoodD = toon(0x3e2c1c), mIron = toon(0x2a2c32), mRope = toon(0x8a7650), mCrate = toon(0xffffff, { map: TEX.crate }), mSack = toon(0xa89674), mWater = toon(0x27444c), mCoal = new T.MeshBasicMaterial({ color: new T.Color(1.25, 0.3, 0.06) }), mDark = new T.MeshBasicMaterial({ color: 0x0c0a09 });
  const mBanner = toon(0xffffff, { map: TEX.banner, side: T.DoubleSide, alphaTest: 0.5 }), mScrub = toon(0x8a8a52), mScrubD = toon(0x6c6440), mThorn = toon(0x5a4a38);
  const parts = new Map(), put = (geo, mat, x, y, z, ry, rx, rz) => { if (rx || rz || ry) geo.applyMatrix4(M4.makeRotationFromEuler(eu.set(rx || 0, ry || 0, rz || 0, 'YXZ'))); geo.translate(x, y, z); if (geo.index) geo = geo.toNonIndexed(); (parts.get(mat) || parts.set(mat, []).get(mat)).push(geo); }; // everything that never moves is merged, one mesh a material
  const on = (x, z) => hl(x, z);
  const stick = (a, b, rad, mat) => { const geo = new T.CylinderGeometry(rad, rad, a.distanceTo(b), 6); geo.applyQuaternion(qt.setFromUnitVectors(UP, b.clone().sub(a).normalize())); const m = a.clone().lerp(b, 0.5); put(geo, mat, m.x, m.y, m.z); };

  // the well picket: the well, a trough, the stores, a fire with somewhere to sit, a line of stakes to the north, the company's colours
  { const wx = -1.5, wz = -45.5, y = on(wx, wz); // (the well's wall is turned with an inside as well as an outside: it was one open cylinder, and from above its far side was missing)
    put(new T.LatheGeometry([[1.12, 0.2], [1.12, 0.82], [1.25, 0.85], [1.35, -0.03]].map(([a, b]) => new T.Vector2(a, b)), 20), mStone, wx, y - 0.03, wz); put(new T.TorusGeometry(1.25, 0.16, 8, 20), mStoneD, wx, y + 0.84, wz, 0, PI / 2); put(new T.CylinderGeometry(1.75, 1.9, 0.14, 20), mStoneD, wx, y + 0.05, wz);
    { const w = new T.Mesh(new T.CircleGeometry(1.12, 18), mWater); w.rotation.x = -PI / 2; w.position.set(wx, y + 0.3, wz); g.add(w); }
    for (const s of [-1, 1]) put(new T.CylinderGeometry(0.07, 0.08, 2.3, 8), mWood, wx + s * 1.3, y + 1.15, wz); put(new T.CylinderGeometry(0.06, 0.06, 2.9, 8), mWood, wx, y + 2.2, wz, 0, 0, PI / 2); put(new T.CylinderGeometry(0.13, 0.13, 0.8, 10), mWoodD, wx, y + 2.2, wz, 0, 0, PI / 2);
    stick(V(wx, y + 2.1, wz), V(wx, y + 1.0, wz), 0.014, mRope); put(new T.CylinderGeometry(0.17, 0.13, 0.3, 10), mWood, wx, y + 0.9, wz); block(wx, wz, 1.75);
    const tx = 2.6, tz = -41.6, ty = on(tx, tz); put(new T.BoxGeometry(2.2, 0.36, 0.7), mWoodD, tx, ty + 0.3, tz, 0.4); put(new T.BoxGeometry(2.0, 0.04, 0.5), mWater, tx, ty + 0.47, tz, 0.4); for (const s of [-1, 1]) put(new T.BoxGeometry(0.12, 0.3, 0.7), mWoodD, tx + s * 0.8 * Math.cos(0.4), ty + 0.13, tz - s * 0.8 * Math.sin(0.4), 0.4); block(tx, tz, 1.0);
    for (const [x, z, s, ry] of [[-7.6, -38.2, 0.8, 0.3], [-8.5, -38.8, 0.65, 1.1], [-7.9, -39.3, 0.7, 0.7]]) { const yy = on(x, z); put(new T.BoxGeometry(s, s, s), mCrate, x, yy + s / 2, z, ry); }
    put(new T.BoxGeometry(0.5, 0.5, 0.5), mCrate, -7.7, on(-7.7, -38.3) + 1.05, -38.3, 0.9); block(-8.0, -38.8, 1.1);
    for (const [x, z] of [[-6.7, -39.6], [-9.2, -37.9], [-6.9, -37.5]]) { const sk = new T.SphereGeometry(0.3, 10, 7); sk.scale(1, 0.7, 0.85); put(sk, mSack, x, on(x, z) + 0.18, z, Q(0, 3)); }
    const fx = 6.4, fz = -38.2, fy = on(fx, fz); // the picket's fire
    for (let i = 0; i < 9; i++) { const a = i * 0.7, s = Q(0.13, 0.2), st = new T.SphereGeometry(s, 7, 5); st.scale(1, 0.7, 1); put(st, mStoneD, fx + Math.sin(a) * 0.6, fy + s * 0.4, fz + Math.cos(a) * 0.6); }
    for (let i = 0; i < 5; i++) put(new T.CylinderGeometry(0.07, 0.08, 1.0, 6), mWoodD, fx + Math.sin(i * 1.26) * 0.25, fy + 0.16, fz + Math.cos(i * 1.26) * 0.25, i * 1.26, 1.2);
    { const co = new T.Mesh(new T.SphereGeometry(0.4, 10, 6), mCoal); co.scale.y = 0.2; co.position.set(fx, fy + 0.08, fz); g.add(co); }
    kit.fire(FRONT.x + fx, fy + 0.12, FRONT.z + fz, 1.2); block(fx, fz, 0.7);
    for (const [x, z, ry] of [[8.1, -37.6, 1.23], [5.6, -36.5, -0.44]]) { /* each log lies across the fire's line, so whoever sits on it faces the fire (the campfire in 'tracks') */ put(new T.CylinderGeometry(0.2, 0.23, 1.7, 10), mWood, x, on(x, z) + 0.2, z, ry, 0, PI / 2); block(x, z, 0.5); }
    for (let k = 0; k < 13; k++) { const x = -9 + k * 1.5, z = -33.2 + Math.sin(k * 1.3) * 0.5; if (Math.abs(x - 2.5) < 2.4) continue; /* the way out */ put(new T.CylinderGeometry(0.02, 0.08, 2.0, 5), mWood, x, on(x, z) + 0.6, z, Q(-0.2, 0.2), 0.95); }
    const bx = 3.2, bz = -47.6, by = on(bx, bz); put(new T.CylinderGeometry(0.05, 0.06, 4.6, 8), mWood, bx, by + 2.3, bz); block(bx, bz, 0.3);
    const b = new T.Group(); b.position.set(bx, by + 4.4, bz + 0.08); g.add(b); b.add(new T.Mesh(new T.BoxGeometry(1.2, 0.08, 0.08), mWood)); const cl = new T.Mesh(new T.PlaneGeometry(1.0, 2.6, 1, 6), mBanner); cl.position.y = -1.32; cl.castShadow = true; b.add(cl); banners.push(b);
    // a spear rack
    { const x = -4.8, z = -40.2, yy = on(x, z); for (const s of [-1, 1]) put(new T.BoxGeometry(0.1, 1.5, 0.1), mWood, x + s * 0.8, yy + 0.75, z); put(new T.BoxGeometry(1.8, 0.08, 0.08), mWood, x, yy + 1.35, z); put(new T.BoxGeometry(1.8, 0.08, 0.08), mWood, x, yy + 0.45, z);
      for (let k = 0; k < 4; k++) { const sx = x - 0.54 + k * 0.36; put(new T.CylinderGeometry(0.025, 0.025, 2.3, 5), mWood, sx, yy + 1.12, z + 0.2, 0, -0.2); put(new T.ConeGeometry(0.06, 0.32, 4), mIron, sx, yy + 2.38, z - 0.04, 0, -0.2); } block(x, z, 0.9); }
  }
  // the beacon: a round watchtower on the butte, its head broken on one side, an iron basket for the fire, and at the rock's
  // foot what is left of the stair up to it
  const bx = BEACON[0], bz = BEACON[1], bt = TOP - 0.15;
  { put(new T.CylinderGeometry(2.0, 2.5, 7.4, 22), mStone, bx, bt + 3.7, bz); put(new T.CylinderGeometry(2.7, 2.7, 0.3, 22), mStoneD, bx, bt + 0.15, bz); put(new T.CylinderGeometry(2.3, 2.05, 0.5, 22), mStoneD, bx, bt + 7.5, bz);
    for (let k = 0; k < 10; k++) { if (k === 3 || k === 4) continue; const a = (k / 10) * PI * 2; put(new T.BoxGeometry(0.8, 0.7 - (k === 5 ? 0.3 : 0), 0.4), mStone, bx + Math.sin(a) * 2.05, bt + 8.05, bz + Math.cos(a) * 2.05, a); } // merlons, some gone
    for (const [a, y] of [[2.6, 3.0], [-2.3, 5.2]]) put(new T.BoxGeometry(0.34, 0.9, 0.2), mDark, bx + Math.sin(a) * 2.24, bt + y, bz + Math.cos(a) * 2.24, a); // loops, toward the basin
    for (let k = 0; k < 3; k++) { const a = k * 2.094; stick(V(bx + Math.sin(a) * 0.7, bt + 7.7, bz + Math.cos(a) * 0.7), V(bx + Math.sin(a) * 0.5, bt + 9.2, bz + Math.cos(a) * 0.5), 0.05, mIron); }
    put(new T.CylinderGeometry(0.75, 0.5, 0.5, 12, 1, true), mIron, bx, bt + 9.3, bz); put(new T.TorusGeometry(0.75, 0.05, 6, 14), mIron, bx, bt + 9.55, bz, 0, PI / 2);
    for (let k = 0; k < 6; k++) { const x = 20.6 + k * 0.62, z = 46.6 + k * 0.55; put(new T.BoxGeometry(1.5, 0.3, 0.7), mStoneD, x, on(20.6, 46.6) + 0.1 + k * 0.42, z, 0.85); } // the first steps of the stair, which ends in air
  }
  // dry thorn trees, and scrub
  const thorn = (x, z, h, seed) => { const r = rng(seed), y = on(x, z) - 0.1, R2 = (a, b) => a + r() * (b - a);
    const limb = (p, dir, len, rad, depth) => { const e = p.clone().addScaledVector(dir, len); const geo = new T.CylinderGeometry(rad * 0.62, rad, len, 6); geo.translate(0, len / 2, 0); geo.applyQuaternion(qt.setFromUnitVectors(UP, dir)); put(geo, mThorn, p.x, p.y, p.z);
      if (depth > 0) for (let k = 0, n = depth > 2 ? 2 : 3; k < n; k++) { const d2 = dir.clone().add(V(R2(-0.8, 0.8), R2(-0.1, 0.5), R2(-0.8, 0.8))).normalize(); if (d2.y < 0.15) d2.y = 0.15; limb(e, d2.normalize(), len * R2(0.55, 0.8), rad * 0.62, depth - 1); } };
    limb(V(x, y, z), V(R2(-0.25, 0.25), 1, R2(-0.25, 0.25)).normalize(), h * 0.4, h * 0.045, 3); block(x, z, 0.35); };
  thorn(-12.5, -26.5, 4.2, 3); thorn(17.5, -31, 3.6, 5); thorn(-28.5, 6.5, 4.6, 8); thorn(20.5, 27.5, 4.0, 13); thorn(-11.5, 41, 3.4, 21); thorn(27.5, -6.5, 3.8, 34);
  { const blades = []; for (let k = 0; k < 9; k++) { const b = new T.ConeGeometry(0.03, 0.6, 3); b.translate(0, 0.3, 0); b.rotateZ(0.2 + (k % 3) * 0.16); b.rotateY(k * 0.7); blades.push(b); }
    const tuft = mergeGeometries(blades), n = 420, im = new T.InstancedMesh(tuft, mScrub, n), im2 = new T.InstancedMesh(tuft, mScrubD, n); let a = 0, b = 0;
    for (let i = 0; i < n * 2; i++) { const x = Q(-70, 70), z = Q(-75, 80), e = outside(x, z); if (e > 26 || (e < -1.5 && q() < 0.75)) continue; const s = Q(0.5, 1.5) * (e < 0 ? 0.7 : 1); pv.set(x, hl(x, z) - 0.04, z); qt.setFromEuler(eu.set(0, Q(0, 6.3), 0)); sv.set(s, s * Q(0.7, 1.4), s);
      if (i % 2) { if (a < n) im.setMatrixAt(a++, M4.compose(pv, qt, sv)); } else if (b < n) im2.setMatrixAt(b++, M4.compose(pv, qt, sv)); }
    im.count = a; im2.count = b; im.receiveShadow = im2.receiveShadow = true; g.add(im, im2); }
  // pebbles and small stones, everywhere
  { const n = 520, im = new T.InstancedMesh(new T.DodecahedronGeometry(1, 1), toon(0x9c8468), n);
    for (let i = 0; i < n; i++) { const x = Q(-60, 60), z = Q(-65, 72), [wd] = nearLine(WADI, x, z), s = (wd < 6 ? Q(0.06, 0.3) : Q(0.04, 0.16)); pv.set(x, hl(x, z) + s * 0.2, z); qt.setFromEuler(eu.set(Q(0, 3), Q(0, 3), Q(0, 3))); sv.set(s, s * Q(0.5, 0.8), s * Q(0.7, 1.2)); im.setMatrixAt(i, M4.compose(pv, qt, sv)); }
    im.receiveShadow = true; g.add(im); }
  for (const [mat, list] of parts) { const m = new T.Mesh(mergeGeometries(list), mat); m.castShadow = m.receiveShadow = mat.isMeshToonMaterial; g.add(m); }

  // ---- the beacon's fire: unlit until a stage lights it (`light`)
  const n0 = scene.children.length; kit.fire(FRONT.x + bx, bt + 9.45, FRONT.z + bz, 3.4); const beaconG = new T.Group(); for (const m of scene.children.slice(n0)) beaconG.add(m); scene.add(beaconG);
  const bl = new T.PointLight(0xff8a3c, 0, 70, 1.6); bl.position.set(FRONT.x + bx, bt + 10.5, FRONT.z + bz); scene.add(bl);
  let lit = 0;
  const light = (on2) => { beaconG.visible = !!on2; lit = on2 ? 1 : 0; if (!on2) bl.intensity = 0; };
  const reset = () => light(false);
  const tmp = V(0, 0, 0);
  const update = (t, dt) => {
    if (lit) { bl.intensity = 60 * (0.86 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.06); if (Math.random() < dt * 8) FX.dust.emit(tmp.set(FRONT.x + bx + (Math.random() - 0.5), bt + 11.5, FRONT.z + bz + (Math.random() - 0.5)), 1, 0.4, 0x2c2826, 3.5, { grav: -1.6, spread: 0.3, up: 0.8 }); } // and its smoke
    // sand on the wind, low, across wherever he is
    const p = G.player.pos; if (Math.random() < dt * 9) FX.dust.emit(tmp.set(p.x + (Math.random() - 0.5) * 30, 0, p.z + (Math.random() - 0.5) * 30).setY(height(tmp.x, tmp.z) + 0.1 + Math.random() * 0.5), 1, 0.3, 0xd8c29a, 2.4, { grav: -0.05, vx: 2.2, vz: -0.8, spread: 0.2, flat: 1 });
  };
  light(false);
  return { group: g, obs, height, update, reset, light, banners, beacon: [FRONT.x + bx, FRONT.z + bz], top: bt };
}
