import * as T from 'three';
import { G } from '../core/game.js';
import { SFX } from '../core/audio.js';
import { rnd } from '../core/util.js';
import { toon } from '../gfx/materials.js';
import { FX } from '../gfx/fx.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Javelins (owner, Nov 2026: the swarms needed something besides more blades; projectiles were on his list).
// A skirmisher (TYPES.skirmisher) throws one at the end of its wind-up; it flies on a real arc, led a little toward where
// the target is going, and can hit whoever is in its way: the captain or one of the line, never another raider.
// The captain stops it like any blow: a raised shield facing it blocks it (it costs stamina), a parry knocks it aside,
// a roll's invulnerability lets it pass. One that misses sticks in the ground for a while.
// `throwJavelin(from, target, dmg)` launches one; `updateMissiles(dt)` runs them (main loop); `clearMissiles()` on a reset.

const GRAV = 13, SPEED = 17.5, LIVE = [], STUCK = [];
G.missiles = LIVE; // (for the tests)
let geo = null, mat = null;
const make = () => {
  if (!geo) {
    const shaft = new T.CylinderGeometry(0.016, 0.016, 1.6, 6); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -0.55);
    const head = new T.ConeGeometry(0.034, 0.2, 4); head.rotateX(Math.PI / 2); head.translate(0, 0, 0.32);
    const fl = new T.BoxGeometry(0.006, 0.05, 0.14); fl.translate(0, 0, -1.28); const fl2 = fl.clone(); fl2.rotateZ(Math.PI / 2);
    for (const g of [shaft, head, fl, fl2]) g.deleteAttribute('uv');
    // vertex colours: wood, iron head, rag fletching
    const tint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), col = new T.Color(c); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new T.BufferAttribute(a, 3)); return g; };
    geo = mergeGeometries([tint(shaft, 0x7a5634), tint(head, 0xc9ccd2), tint(fl, 0x8a3226), tint(fl2, 0x8a3226)]);
    mat = toon(0xffffff, { vertexColors: true });
  }
  const m = new T.Mesh(geo, mat); m.castShadow = true; G.scene.add(m); return m;
};
const tmp = new T.Vector3(), tmp2 = new T.Vector3(), look = new T.Vector3();

export function throwJavelin(from, target, dmg) {
  const o = from.rig.wTip.getWorldPosition(new T.Vector3()); o.y = Math.max(o.y, from.pos.y + 1.6 * from.scale);
  const aim = tmp.copy(target.pos); aim.y += 1.15;
  const dx = aim.x - o.x, dz = aim.z - o.z, D = Math.hypot(dx, dz) || 0.001, tf = D / SPEED;
  aim.x += target.vel.x * tf * 0.55; aim.z += target.vel.z * tf * 0.55; // a little lead: running straight across him is not safe, rolling is
  const ax = aim.x - o.x, az = aim.z - o.z, D2 = Math.hypot(ax, az) || 0.001, t2 = D2 / SPEED;
  const v = new T.Vector3((ax / D2) * SPEED, (aim.y - o.y + 0.5 * GRAV * t2 * t2) / t2, (az / D2) * SPEED);
  const mesh = make(); mesh.position.copy(o);
  LIVE.push({ mesh, pos: o, vel: v, dmg, from, age: 0, spent: false });
  SFX.swing(1.15); G.emit('javelin', { from });
}

// Who a javelin can hit: the captain and the soldiers of the line who are on their feet.
const targets = () => { const out = []; const P = G.player; if (P && !P.dead) out.push(P); for (const a of G.allies) if (a.soldier && !a.out && a.root.visible) out.push(a); return out; };
const near = (p, c) => { const y0 = c.pos.y + 0.35, y1 = c.pos.y + 1.75 * c.scale, cy = Math.min(y1, Math.max(y0, p.y)); return Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 0.48 * c.scale && Math.abs(p.y - cy) < 0.2; };

export function updateMissiles(dt) {
  for (let i = LIVE.length - 1; i >= 0; i--) {
    const j = LIVE[i]; j.age += dt; let done = false;
    for (let s = 0, n = 3, h = dt / n; s < n && !done; s++) { // three small steps a frame: a javelin covers half a metre a frame on a slow phone
      j.vel.y -= GRAV * h; j.pos.addScaledVector(j.vel, h);
      if (!j.spent) for (const c of targets()) {
        if (!near(j.pos, c)) continue;
        // the thrower stands in for "who struck": its position gives the blow's direction, and a parry knocks the javelin aside instead of stunning him
        const by = { pos: tmp2.copy(j.pos).addScaledVector(j.vel, -0.25), parried: () => {}, type: j.from.type, scale: j.from.scale, missile: true };
        const r = c === G.player ? c.receive(by, j.dmg) : c.receive(by, j.dmg * 0.8);
        if (r === 'miss') continue; // rolled through it (or nothing lands while someone talks): it flies on
        if (r === 'hit') { j.mesh.visible = false; done = true; break; }
        // stopped (block or parry): it glances off, end over end, and drops
        j.spent = true; j.vel.set(-j.vel.x * 0.18 + rnd(-1.5, 1.5), 3.2, -j.vel.z * 0.18 + rnd(-1.5, 1.5)); j.spin = rnd(10, 16) * (Math.random() < 0.5 ? -1 : 1);
        break;
      }
      const gy = G.level.height(j.pos.x, j.pos.z);
      if (!done && j.pos.y <= gy + 0.05) { // into the ground
        if (j.spent) { j.pos.y = gy + 0.03; j.mesh.position.copy(j.pos); j.mesh.rotation.set(0, Math.random() * 6.3, 0); } // (it lies along its own length)
        else { j.pos.y = gy + 0.05; j.mesh.position.copy(j.pos); look.copy(j.pos).add(j.vel); j.mesh.lookAt(look); j.mesh.translateZ(-0.35); } // sunk head first
        if (!j.spent) SFX.stick();
        FX.dust.emit(tmp.copy(j.pos).setY(gy + 0.05), 6, 1.4, 0xb8a37c, 0.5, { flat: 1, grav: -1, spread: 0.2 });
        STUCK.push({ mesh: j.mesh, t: 7 }); LIVE.splice(i, 1); done = 2; break;
      }
    }
    if (done === 2) continue; // stuck in the ground (already moved to STUCK)
    if (done || j.age > 6) { G.scene.remove(j.mesh); LIVE.splice(i, 1); continue; }
    j.mesh.position.copy(j.pos);
    if (j.spent) { j.mesh.rotation.x += j.spin * dt; } else { look.copy(j.pos).add(j.vel); j.mesh.lookAt(look); }
  }
  for (let i = STUCK.length - 1; i >= 0; i--) { const s = STUCK[i]; s.t -= dt; if (s.t <= 0) { G.scene.remove(s.mesh); STUCK.splice(i, 1); } }
}

export function clearMissiles() { for (const j of LIVE) G.scene.remove(j.mesh); for (const s of STUCK) G.scene.remove(s.mesh); LIVE.length = 0; STUCK.length = 0; }
