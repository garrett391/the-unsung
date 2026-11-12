export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => {
  t = clamp(t, 0, 1);
  return 1 - (1 - t) * (1 - t);
};
export const easeIn = (t) => {
  t = clamp(t, 0, 1);
  return t * t;
};
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
// signed shortest rotation from a to b
export const angleDiff = (a, b) => wrapAngle(b - a);
export function turnToward(cur, target, maxStep) {
  const d = angleDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}
// heading convention: 0 = +z, angle = atan2(dx, dz)
export const angleTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
export const distXZ = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
