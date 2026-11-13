import * as T from 'three';
import { G } from '../core/game.js';
import { PI, wrap, damp, rnd, sstep } from '../core/util.js';
import { clampCamera } from './level.js';

// Third-person camera: free orbit that drifts behind the runner, a lock-on
// framing that keeps both fighters in view, and fixed shots for cutscenes.
export const cam = { yaw: PI, pitch: 0.3, pos: new T.Vector3(0, 3, -8), look: new T.Vector3(0, 1.2, 0), manualT: -9, zoom: 1, zoomT: 0, cine: null };
const cDes = new T.Vector3(), cLook = new T.Vector3();

// Hold a fixed shot; with dur > 0 it eases there from wherever the camera is.
cam.shot = (pos, look, dur = 0) => {
  cam.cine = { p0: cam.pos.clone(), l0: cam.look.clone(), p1: new T.Vector3(...pos), l1: new T.Vector3(...look), t: 0, dur };
  if (!dur) { cam.pos.copy(cam.cine.p1); cam.look.copy(cam.cine.l1); }
};
cam.release = () => { cam.cine = null; };
cam.behind = () => { cam.cine = null; cam.yaw = G.player.face + PI; cam.pitch = 0.3; updateCamera(0, true); };

export function updateCamera(dt, snap) {
  const camera = G.camera, sh = G.shake;
  if (cam.cine) {
    const c = cam.cine; c.t += dt; const u = c.dur ? sstep(Math.min(1, c.t / c.dur)) : 1;
    cam.pos.lerpVectors(c.p0, c.p1, u); cam.look.lerpVectors(c.l0, c.l1, u);
    camera.position.set(cam.pos.x + rnd(-sh, sh), cam.pos.y + rnd(-sh, sh), cam.pos.z + rnd(-sh, sh)); camera.lookAt(cam.look); return;
  }
  const p = G.player, portrait = innerWidth < innerHeight; let dist = portrait ? 5.6 : 4.6;
  cam.zoomT -= dt; cam.zoom = damp(cam.zoom, cam.zoomT > 0 ? 0.68 : 1, cam.zoomT > 0 ? 10 : 4, dt);
  if (p.lock) {
    const dx = p.lock.pos.x - p.pos.x, dz = p.lock.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz) + 0.36 * (portrait ? 0.5 : 1); cam.yaw += wrap(want - cam.yaw) * (1 - Math.exp(-(d < 1.5 ? 1.5 : 5) * dt));
    cam.pitch = damp(cam.pitch, 0.32, 4, dt); dist += Math.min(3.5, d * 0.42); cLook.set(p.pos.x + dx * 0.4, 1.25, p.pos.z + dz * 0.4);
  } else {
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > 1.5 && G.time - cam.manualT > 1.1 && p.state === 'loco') { const df = wrap(Math.atan2(p.vel.x, p.vel.z) + PI - cam.yaw); if (Math.abs(df) < 2.5) cam.yaw += df * (1 - Math.exp(-1.5 * dt)); }
    cLook.set(p.pos.x, 1.3, p.pos.z);
  }
  dist *= cam.zoom; const cp = Math.cos(cam.pitch);
  cDes.set(cLook.x + Math.sin(cam.yaw) * cp * dist, cLook.y + Math.sin(cam.pitch) * dist, cLook.z + Math.cos(cam.yaw) * cp * dist);
  clampCamera(cDes, cLook);
  cam.pos.lerp(cDes, snap ? 1 : 1 - Math.exp(-11 * dt)); cam.look.lerp(cLook, snap ? 1 : 1 - Math.exp(-13 * dt));
  camera.position.set(cam.pos.x + rnd(-sh, sh), Math.max(0.35, cam.pos.y + rnd(-sh, sh)), cam.pos.z + rnd(-sh, sh)); camera.lookAt(cam.look);
}
