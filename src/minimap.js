// North-up circular minimap in the spirit of the N64 games: layout, the captain,
// Corin, the stretchers and the objective. No enemy dots, so the blind side still bites.
import { COURT, NARROWS, OBSTACLES, CAMPFIRE, RING, MOUTH } from './world.js';

const B = { x0: -26, x1: 26, z0: -48, z1: 30 };
const PPM = 5; // static map pixels per metre

export class Minimap {
  constructor(canvas, game) {
    this.c = canvas;
    this.x = canvas.getContext('2d');
    this.g = game;
    this.t = 0;
    this.acc = 0;
    this.buildStatic();
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const css = this.c.getBoundingClientRect().width || 132;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(64, Math.round(css * dpr));
    if (this.c.width !== px) { this.c.width = px; this.c.height = px; }
  }
  buildStatic() {
    const w = (B.x1 - B.x0) * PPM, h = (B.z1 - B.z0) * PPM;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    const X = (v) => (v - B.x0) * PPM, Y = (v) => (v - B.z0) * PPM;
    // rock everywhere, then carve the walkable ground
    x.fillStyle = '#2a1d17';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#5d4a33';
    x.fillRect(X(-22), Y(COURT.z1), X(22) - X(-22), h - Y(COURT.z1)); // open desert to the south
    x.fillStyle = '#b48f5e';
    x.fillRect(X(COURT.x0), Y(COURT.z0), (COURT.x1 - COURT.x0) * PPM, (COURT.z1 - COURT.z0) * PPM);
    x.fillStyle = '#8c7b60';
    x.fillRect(X(NARROWS.x0), Y(-34), (NARROWS.x1 - NARROWS.x0) * PPM, (34 - 12) * PPM);
    x.fillStyle = '#4b3d31';
    x.fillRect(X(-4.3), Y(-46), 8.6 * PPM, 12 * PPM);
    // passage walls
    x.fillStyle = '#d6c09a';
    x.fillRect(X(NARROWS.x0) - 3, Y(-34), 3, 22 * PPM);
    x.fillRect(X(NARROWS.x1), Y(-34), 3, 22 * PPM);
    // the gate and the Mirror
    x.fillStyle = '#7fdccb';
    x.fillRect(X(-2.8), Y(-34) - 2, 5.6 * PPM, 4);
    x.beginPath();
    x.moveTo(X(0), Y(-43.6)); x.lineTo(X(1.4), Y(-42.4)); x.lineTo(X(0), Y(-41.2)); x.lineTo(X(-1.4), Y(-42.4)); x.closePath();
    x.fill();
    // sparring ring
    x.strokeStyle = 'rgba(70,48,30,0.8)';
    x.lineWidth = 2;
    x.beginPath(); x.arc(X(RING.x), Y(RING.z), RING.r * PPM, 0, Math.PI * 2); x.stroke();
    // tents and props
    for (const o of OBSTACLES) {
      if (o.r > 1.5) {
        x.fillStyle = '#ece0c2';
        x.save();
        x.translate(X(o.x), Y(o.z));
        x.rotate(Math.atan2(RING.x - o.x, RING.z - o.z));
        x.fillRect(-1.5 * PPM, -1.6 * PPM, 3 * PPM, 3.2 * PPM);
        x.restore();
      } else if (o.r > 0.3) {
        x.fillStyle = '#6e5539';
        x.beginPath(); x.arc(X(o.x), Y(o.z), Math.max(2, o.r * PPM), 0, Math.PI * 2); x.fill();
      }
    }
    // campfire
    x.fillStyle = '#ff9a3a';
    x.beginPath(); x.arc(X(CAMPFIRE.x), Y(CAMPFIRE.z), 4, 0, Math.PI * 2); x.fill();
    this.static = c;
  }
  objective() {
    const g = this.g;
    if (g.markerObj && g.markerObj.visible) return g.markerObj.position;
    if (g.hold && g.hold.active) return MOUTH;
    return null;
  }
  draw(dt) {
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const g = this.g, P = g.player, x = this.x, W = this.c.width, R = W / 2;
    const ppm = R / 22;
    const sx = (wx) => R + (wx - P.pos.x) * ppm, sy = (wz) => R + (wz - P.pos.z) * ppm;
    x.clearRect(0, 0, W, W);
    x.save();
    x.beginPath(); x.arc(R, R, R - 1, 0, Math.PI * 2); x.clip();
    const k = ppm / PPM;
    x.imageSmoothingEnabled = true;
    x.globalAlpha = 0.9;
    x.drawImage(this.static, sx(B.x0), sy(B.z0), (B.x1 - B.x0) * PPM * k, (B.z1 - B.z0) * PPM * k);
    x.globalAlpha = 1;
    const u = W / 132; // ui unit
    // stretchers
    if (g.hold && g.hold.active) {
      for (const s of g.stretchers) {
        if (!(s.u > 0 && s.u < 1)) continue;
        x.fillStyle = '#e9e1cf';
        x.fillRect(sx(s.x) - 2 * u, sy(s.group.position.z) - 3.5 * u, 4 * u, 7 * u);
      }
    }
    // Corin
    const C = g.corin;
    if (C.rig.root.visible) {
      if (C.dead) {
        x.strokeStyle = '#7fdccb';
        x.lineWidth = 1.6 * u;
        const cx = sx(C.pos.x), cy = sy(C.pos.z), d = 3 * u;
        x.beginPath(); x.moveTo(cx - d, cy - d); x.lineTo(cx + d, cy + d); x.moveTo(cx + d, cy - d); x.lineTo(cx - d, cy + d); x.stroke();
      } else {
        x.fillStyle = '#7fdccb';
        x.beginPath(); x.arc(sx(C.pos.x), sy(C.pos.z), 3.4 * u, 0, Math.PI * 2); x.fill();
      }
    }
    x.restore();
    // objective (clamped to the rim when off the map)
    const o = this.objective();
    if (o) {
      let ox = sx(o.x), oy = sy(o.z);
      const dx = ox - R, dy = oy - R, d = Math.hypot(dx, dy), lim = R - 8 * u;
      const pulse = 1 + 0.18 * Math.sin(this.t * 5);
      x.fillStyle = '#ffd27a';
      if (d > lim) {
        ox = R + (dx / d) * lim; oy = R + (dy / d) * lim;
        x.save(); x.translate(ox, oy); x.rotate(Math.atan2(dy, dx));
        x.beginPath(); x.moveTo(6 * u, 0); x.lineTo(-3 * u, -4.5 * u); x.lineTo(-3 * u, 4.5 * u); x.closePath(); x.fill();
        x.restore();
      } else {
        const s = 4.5 * u * pulse;
        x.beginPath(); x.moveTo(ox, oy - s); x.lineTo(ox + s, oy); x.lineTo(ox, oy + s); x.lineTo(ox - s, oy); x.closePath(); x.fill();
      }
    }
    // the captain
    x.save();
    x.translate(R, R);
    x.rotate(Math.PI - P.facing);
    x.fillStyle = '#eee3cc';
    x.strokeStyle = '#0b0f1d';
    x.lineWidth = 1.5 * u;
    x.beginPath(); x.moveTo(0, -7 * u); x.lineTo(5 * u, 5.5 * u); x.lineTo(0, 3 * u); x.lineTo(-5 * u, 5.5 * u); x.closePath();
    x.stroke(); x.fill();
    x.restore();
    // rim and north mark
    x.strokeStyle = 'rgba(238,227,204,0.55)';
    x.lineWidth = 1.5 * u;
    x.beginPath(); x.arc(R, R, R - 1.5 * u, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#0b0f1d';
    x.beginPath(); x.arc(R, 9 * u, 6.5 * u, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#eee3cc';
    x.font = `700 ${9 * u}px "Alegreya Sans", system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('N', R, 9.5 * u);
  }
}
