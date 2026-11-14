import * as T from 'three';
import { G } from '../core/game.js';
import { SFX, stopMusic, playMusic, preloadMusic, forgetMusic } from '../core/audio.js';
import { PI, rnd, lerp, clamp, wrap } from '../core/util.js';
import { ui } from '../ui/hud.js';
import { cam } from '../world/camera.js';
import { MOUTH, RING, WAY } from '../world/level.js';
import { FX, shock, clearBlood, blood } from '../gfx/fx.js';
import { coarse, opts } from '../core/input.js';
import { makeStretchers } from './stretchers.js';
import { CL } from '../actors/anim.js';
import { Extra } from '../actors/extra.js';
import { LOOKS } from '../actors/data.js';

// The campaign, as a list of stages: the prologue (the Glass Door, the road, the waystation,
// the muster), then the first night at the ruins (Act I). Stage names are what saves store, so don't rename a checkpoint. A stage's run() is its script. setup() puts
// the world in the state the stage expects and is only used when starting there
// (first load, or retrying from a checkpoint).
export const STAGES = [];
const stage = (name, o) => STAGES.push({ name, ...o });
const TAP = coarse ? 'TAP TO CONTINUE' : 'CLICK OR PRESS SPACE';
const live = () => G.enemies.filter((e) => !e.dead).length;
const breach = () => [rnd(-2.6, 2.6), rnd(29, 36)]; // out on the raiders' road, beyond the wall
const east = () => [rnd(22, 26), rnd(-4, -2)];
// Act I's music ("Beneath the Flagstones"): whatever is playing fades out, then it fades in and loops
// through the night. Every Act I stage asks for it, so a retry or CONTINUE has it too; asking while it plays does nothing.
const actOne = () => playMusic('flagstones', { cross: 3, fade: 4 });
// Turn the camera to something the player needs to know about (a wave coming in, where to go),
// hold on it for a moment, then hand it back. The captain can't act or be hurt meanwhile.
async function glance(d, x, z, o = {}) {
  const P = G.player, was = P.controlEnabled, dx = P.pos.x - x, dz = P.pos.z - z, l = Math.hypot(dx, dz) || 1, back = Math.min(o.back || 9, l * 0.8);
  const p0 = cam.pos.toArray(), l0 = cam.look.toArray();
  P.controlEnabled = false; P.inv = Math.max(P.inv, 3.8); G.cinematic = true; ui.cinematic(true);
  cam.shot(o.from || [x + (dx / l) * back - (dz / l) * 2.2, o.h || 3.2, z + (dz / l) * back + (dx / l) * 2.2], [x, o.y || 1.3, z], 0.9); // o.from: a fixed camera position, where the usual one could land inside something
  await d.wait(o.hold || 1.9);
  cam.shot(p0, l0, 0.6); await d.wait(0.6);
  cam.release(); G.cinematic = false; ui.cinematic(false); P.controlEnabled = was; P.buf.a = '';
}

// Prologue: the climax nobody saw. The Glass Door dressing turns the end of the Narrows into
// the vault. It opens on the end of the fight with a few cards of footing (owner's note: don't
// spell the theme out): the Usurper is cornered and already beaten (TYPES.usurper), and all that
// is left is to put him behind the glass. The first round is a short tutorial (owner, Nov 2026:
// lock on, strike, shield, and no more); after he gets up again there are no hints, only the fight.
// Two things are shown and never said (docs/story.md, The Usurper and the Glass Door): he can't
// be killed (the captain cuts him down, takes it for the end and walks away; the vault shakes and
// he gets up), and the seal takes the years he took in with him (the vault runs backwards: the
// blood lifts, the captain is unmarked).
const VAULT = -14.5; // the captain can't back out of the vault: its wall is at the canyon mouth
stage('door', {
  checkpoint: true,
  setup() { G.resetWorld({ player: [0, -17, PI], corin: null, gate: 'door' }); },
  async run(d) {
    const P = G.player; G.cinematic = true; ui.cinematic(true); ui.fade(1, 0); P.controlEnabled = false; G.freezeAI = true; G.maxAtk = 1;
    preloadMusic('blade', 'sealed');
    const U = G.spawn('usurper', 0.3, -23.2, { spare: true }); U.face = 0; U.hp = U.maxHp * 0.75; // some of the fight is behind them; enough is left to learn on
    if (!G.seenDoor) { G.seenDoor = true; await d.chronicle('Prologue', ['At the end of the war, the Usurper nearly took the realm.', 'Many tried to intervene, but only one succeeded.', 'In the vault of the Glass Door, the Usurper was cornered and near defeat.'], TAP); ui.chronClose(); } // three lines of footing, once; not again on a retry
    cam.shot([-1.1, 1.25, -21.6], [0.3, 1.75, -23.2]); // on him first: bent over, breathing hard, the Door at his back
    await d.wait(0.5); ui.fade(0, 2.2); cam.shot([1.6, 1.9, -18.4], [0.1, 1.7, -23.4], 4.2);
    playMusic('blade', { cross: 2.5, fade: 3 }); // the title theme fades out, then the fight's own music fades in
    await d.wait(4);
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true; G.boss = U; U.cd = 2.0; ui.objective('Defeat the Usurper');
    let wall = VAULT; const keep = d.every(() => { if (P.pos.z > wall) P.pos.z = wall; if (U.pos.z > VAULT + 1) U.pos.z = VAULT + 1; });
    // The first round teaches the three basics, once (not again on a retry). He is cornered and
    // spent, and only stands there while the player finds the lock and lands a few blows; then
    // he comes on, and the shield is taught against real swings. Any lesson ends early if he is beaten.
    const beaten = () => U.hp <= 1;
    if (!G.taughtDoor) {
      let n = 0, hp = U.hp; const hits = d.every(() => { if (U.hp < hp) n++; hp = U.hp; });
      ui.hint('Lock on to the Usurper with {k}'); await d.until(() => P.lock === U || n >= 3 || beaten()); // three blows without the lock: he has the idea, and the Usurper stops standing for it
      if (n < 3) { n = 0; ui.hint('Strike: {l}. Tap up to three times for a combo.'); await d.until(() => n >= 3 || beaten()); }
      hits();
      n = 0; const off = G.on((k, e) => { if (k === 'struck' && (e.result === 'block' || e.result === 'parry')) n++; });
      G.freezeAI = false; U.cd = 1.2; ui.hint(beaten() ? '' : 'Hold {b} to raise your shield when he swings');
      await d.until(() => n >= 2 || beaten()); off(); ui.hint(''); G.taughtDoor = true;
    }
    G.freezeAI = false;
    await d.until(beaten);

    // The false ending (owner, Nov 2026). He is beaten to his knees; the captain takes his time
    // over the last blow, because he thinks it is the last; he turns his back and walks away.
    // A few steps on, the vault shakes, and behind him the glass in the Usurper lights.
    // Nothing is said. Every wait on a position also has a time limit, so no shot can strand the scene.
    const hall = (x) => clamp(x, -2.25, 2.25), deep = (z) => clamp(z, -26.9, -11.9), flat = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    const pick = (...cs) => { const c = cs.find((q) => Math.abs(q[0]) <= 2.3 && q[2] <= -11.9 && q[2] >= -26.9) || cs[cs.length - 1]; return [hall(c[0]), c[1], deep(c[2])]; }; // the first camera position that is inside the hall
    const side = (x, off) => (Math.abs(x + off) <= Math.abs(x - off) ? 1 : -1); // which way to step a camera off a line so it stays nearer the middle of the hall
    const go = async (x, z, sp, max) => { const w = (P.walk = { x, z, sp }), t0 = G.time; await d.until(() => P.walk !== w || Math.hypot(P.pos.x - x, P.pos.z - z) < 0.2 || G.time - t0 > max); if (P.walk === w) P.walk = null; };
    const turn = (c, to, dur) => { const f0 = c.face, df = wrap(to - f0); return d.tween(dur, (u) => { c.face = wrap(f0 + df * u * u * (3 - 2 * u)); }); };
    ui.objective(''); P.controlEnabled = false; P.lock = null; P.inv = 1e6; P.buf.a = ''; G.cinematic = true; ui.cinematic(true); G.freezeAI = true; G.slow = 0.8; G.shake = 0.15; wall = -12.2; stopMusic(2.5); // and the music stops with him
    U.open = false; U.vel.set(0, 0, 0); U.trailOn = false; U.yoff = 0; U.stagDur = 1e9; U.set('stagger'); U.hurtAmt = 0.3; U.play(CL.kneel, 0.25); // to his knees, the sword hand on the floor
    { const nx = (P.pos.x - U.pos.x) / (flat(P, U) || 1), nz = (P.pos.z - U.pos.z) / (flat(P, U) || 1); const sd = side(U.pos.x + nx * 3.2, -nz * 2.6), at = (f, l) => [U.pos.x + nx * f - nz * l, 1.3, U.pos.z + nz * f + nx * l];
      cam.shot(pick(at(3.2, 2.6 * sd), at(3.2, -2.6 * sd), at(4.6, 1.7 * sd), at(4.6, -1.7 * sd), at(5.4, 0)), [U.pos.x, 0.95, U.pos.z], 1.8); }
    { const t0 = G.time; await d.until(() => P.state === 'loco' || G.time - t0 > 0.9); } // let the swing that did it play out
    P.state = 'loco'; P.stop(0.2); P.charge = 0; P.vel.set(0, 0, 0);
    await d.wait(1.3);
    // He steps in beside the kneeling man, a little off his front, where a falling body won't land on him.
    let spot = null; for (const a of [0.95, -0.95, 1.5, -1.5]) { const x = U.pos.x + Math.sin(U.face + a) * 1.5, z = U.pos.z + Math.cos(U.face + a) * 1.5; if (Math.abs(x) < 2.2 && z > -26.6 && z < -12.6 && (!spot || Math.hypot(x - P.pos.x, z - P.pos.z) < Math.hypot(spot[0] - P.pos.x, spot[1] - P.pos.z))) spot = [x, z]; }
    if (!spot) spot = [hall(P.pos.x), deep(P.pos.z)];
    await go(spot[0], spot[1], 1.5, 3.5);
    await turn(P, P.angleTo(U), 0.45);
    await d.wait(0.8);
    // the blow, from low beside the Usurper, looking up at it
    { const ax = (P.pos.x - U.pos.x) / (flat(P, U) || 1), az = (P.pos.z - U.pos.z) / (flat(P, U) || 1), sd = side(U.pos.x - ax * 2.1, -az * 0.9);
      const at = (f, l) => [U.pos.x + ax * f - az * l, 0.55, U.pos.z + az * f + ax * l], c = pick(at(-2.1, 0.9 * sd), at(-2.1, -0.9 * sd), at(-0.6, 2.5 * sd), at(-0.6, -2.5 * sd), at(0.75, 3 * sd), at(0.75, -3 * sd), at(4.2, 1.0));
      cam.shot(c, [P.pos.x, 1.6, P.pos.z]); cam.shot([c[0] + (P.pos.x - c[0]) * 0.1, 0.5, c[2] + (P.pos.z - c[2]) * 0.1], [P.pos.x, 1.8, P.pos.z], 2.4); }
    P.state = 'cine'; P.play(CL.raise, 0.85); SFX.tele();
    await d.tween(1.0, (u) => { P.charge = u * 0.8; });
    SFX.charged(); P.flashCol = [1, 0.8, 0.3]; P.flash = 0.6; FX.sparks.emit(P.rig.wTip.getWorldPosition(new T.Vector3()), 14, 3, 0xfff0b0, 0.4, { boost: 2 });
    await d.wait(0.7); // held at the top
    P.flashCol = [1, 0.15, 0.1]; P.cineTrail = true; P.play(CL.exec, 0.03); SFX.swing(0.45);
    { const t0 = G.time; await d.until(() => P.ct >= 0.1 || G.time - t0 > 0.5); }
    { const dir = new T.Vector3(U.pos.x - P.pos.x, 0, U.pos.z - P.pos.z).normalize(), at = new T.Vector3(U.pos.x, 0.95, U.pos.z);
      SFX.big(); SFX.boom(); G.hitstop = 0.24; G.shake = 0.35; G.slow = 1.5; U.flash = 1; P.charge = 0;
      FX.sparks.emit(at, 40, 8, 0xffe890, 0.4, { vx: dir.x * 3, vz: dir.z * 3, up: 1, boost: 1.8 }); FX.dust.emit(U.pos, 14, 2.4, 0x8a93a6, 0.7, { flat: 1, grav: -1 }); blood(at, dir, 3, true, P);
      const mid = [(P.pos.x + U.pos.x) / 2, (P.pos.z + U.pos.z) / 2], sd = side(mid[0], -dir.z * 3.3);
      const off = (l) => [mid[0] - dir.z * l, 1.05, mid[1] + dir.x * l], c = pick(off(3.3 * sd), off(-3.3 * sd), off(2.4 * sd), off(-2.4 * sd), [P.pos.x - dir.x * 2.8 - dir.z * 1.1, 1.5, P.pos.z - dir.z * 2.8 + dir.x * 1.1]);
      cam.shot(c, [mid[0], 0.85, mid[1]]); cam.shot([c[0] + (mid[0] - c[0]) * 0.1, 0.95, c[2] + (mid[1] - c[2]) * 0.1], [mid[0], 0.7, mid[1]], 3.5); }
    U.set('down'); U.st = -1e6; U.play(CL.fall, 0.04); G.boss = null; // he pitches forward and lies still
    d.tween(1.6, (u) => { U.eyeK = 1 - u; }).catch(() => {}); // and the light goes out of his eyes
    { const t0 = G.time; await d.until(() => P.ct >= 1.25 || G.time - t0 > 2); }
    P.cineTrail = false; P.calm = true; P.stop(1.0); // he straightens up over the body. It's done.
    await d.wait(2.4);
    // He walks away, seen from the floor behind the body.
    const tz = Math.min(P.pos.z + 4.2, -14.3), tx = hall(U.pos.z > P.pos.z + 0.3 ? U.pos.x + (P.pos.x >= U.pos.x ? 1.5 : -1.5) : P.pos.x * 0.5);
    const floorCam = [hall(U.pos.x + (tx >= U.pos.x ? -0.9 : 0.9)), 0.42, deep(U.pos.z - 2.5)], floorLook = [(U.pos.x + tx) / 2, 0.95, U.pos.z + 2.2];
    cam.shot(floorCam, floorLook); cam.shot([hall(U.pos.x + (tx >= U.pos.x ? -0.7 : 0.7)), 0.4, deep(U.pos.z - 2.2)], [(U.pos.x + tx) / 2, 0.9, U.pos.z + 2.6], 5);
    P.state = 'loco'; go(tx, tz, 1.3, 6).catch(() => {});
    await d.wait(2.7); // a few steps
    // The vault shakes: a tremor more than a jolt (owner: keep the camera steadier). He stops and
    // looks about him, at the wall beside him and then up into the roof, in two closer shots.
    let quake = 0.07, lit = false; const dustAt = new T.Vector3(), rumble = d.every((dt) => {
      if (lit && Math.random() < dt * 30) FX.sparks.emit(dustAt.set(U.pos.x + rnd(-0.7, 0.7), 0.25, U.pos.z + rnd(-0.7, 0.7)), 1, 0.5, 0x9ff0e0, 1.0, { grav: -2.6, spread: 0.1, boost: 1.6 });
      G.shake = Math.max(G.shake, quake); G.level.flare = Math.max(G.level.flare, quake * 3);
      if (Math.random() < dt * 30) FX.dust.emit(dustAt.set(rnd(-2.6, 2.6), rnd(6.5, 9), rnd(P.pos.z - 7, P.pos.z + 3)), 2, 0.5, 0x9aa3b6, 1.8, { grav: 6, spread: 0.25 }); // grit off the roof
    });
    const look = (y, p, dur) => { const y0 = P.lookY, p0 = P.lookP; return d.tween(dur, (u) => { const e = u * u * (3 - 2 * u); P.lookY = y0 + (y - y0) * e; P.lookP = p0 + (p - p0) * e; }); };
    const fx = Math.sin(P.face), fz = Math.cos(P.face), rel = (f, r, y) => [P.pos.x + fx * f + fz * r, y, P.pos.z + fz * f - fx * r], head = [P.pos.x, 1.62, P.pos.z]; // rel: f metres ahead of him, r to his right
    SFX.boom(); const hush = SFX.quake(); P.walk = null; // he stops where he is; the rumble runs until the Usurper lands
    { const sd = side(P.pos.x + fx * 2.2, fz * 0.8), c = pick(rel(2.2, 0.8 * sd, 1.5), rel(2.2, -0.8 * sd, 1.5), rel(1.5, 0, 1.5)); cam.shot(c, head); cam.shot([c[0] + (head[0] - c[0]) * 0.12, 1.52, c[2] + (head[2] - c[2]) * 0.12], head, 2.2);
      await d.wait(0.45); await look(0.8 * sd, 0.06, 0.45); await d.wait(0.75); // from in front: his head comes round to the wall
      SFX.boom(); quake = 0.11;
      const c2 = pick(rel(1.0, -1.7 * sd, 0.75), rel(1.0, 1.7 * sd, 0.75), rel(1.9, 0, 0.75)), up = [P.pos.x, 2.2, P.pos.z]; cam.shot(c2, up); cam.shot([c2[0], 0.7, c2[2]], [P.pos.x, 2.5, P.pos.z], 2.4);
      await look(-0.55 * sd, -0.5, 0.6); await d.wait(1.0); } // from low at his other side: up at the roof, grit coming down past him
    // Back on the floor behind the body: he has his back to it, and the glass in it lights.
    cam.shot(floorCam, [floorLook[0], 0.8, floorLook[2]]); cam.shot([floorCam[0], 0.46, floorCam[2] + 0.3], floorLook, 3);
    look(0, 0, 0.5).catch(() => {}); await d.wait(0.5);
    SFX.flame(); lit = true; U.flash = 1; shock(U.pos, 2.6, 0x9ff0e0); FX.sparks.emit(new T.Vector3(U.pos.x, 0.4, U.pos.z), 50, 3, 0x9ff0e0, 1.3, { grav: -2, spread: 0.6, boost: 2 });
    d.tween(1.2, (u) => { U.eyeK = u * 2.4; }).catch(() => {});
    await d.wait(1.3);
    // He turns. Over his shoulder: the Usurper is hauled up off the floor by the glass in him, hangs, and drops onto his feet.
    P.calm = false;
    { const ax = (U.pos.x - P.pos.x) / (flat(P, U) || 1), az = (U.pos.z - P.pos.z) / (flat(P, U) || 1), sd = side(P.pos.x - ax * 2.1, -az * 0.9);
      const cx = hall(P.pos.x - ax * 2.1 - az * 0.9 * sd), cz = deep(P.pos.z - az * 2.1 + ax * 0.9 * sd); cam.shot([cx, 1.7, cz], [U.pos.x, 0.7, U.pos.z]); cam.shot([cx + ax * 0.5, 1.65, cz + az * 0.5], [U.pos.x, 1.7, U.pos.z], 3.2); }
    turn(P, P.angleTo(U), 0.8).catch(() => {});
    U.face = U.angleTo(P); U.play(CL.rise, 0.3);
    await d.tween(2.4, (u) => { U.yoff = 0.34 * U.scale * Math.sin(Math.min(1, u / 0.85) * PI / 2); U.hp = Math.max(U.hp, U.maxHp * 0.6 * u); if (Math.random() < 0.5) FX.sparks.emit(new T.Vector3(U.pos.x + rnd(-0.9, 0.9), 0.1, U.pos.z + rnd(-0.9, 0.9)), 1, 0.6, 0x9ff0e0, 0.9, { grav: -3.5, spread: 0.1 }); });
    await d.tween(0.2, (u) => { U.yoff = 0.34 * U.scale * (1 - u * u); });
    U.yoff = 0; quake = 0; G.shake = 0.3; SFX.boom(); hush(1.2); playMusic('blade', { fade: 0.4, cross: 0.2 }); shock(U.pos, 3.4, 0x9ff0e0); FX.dust.emit(U.pos, 16, 2.6, 0x8a93a6, 0.7, { flat: 1, grav: -1 }); G.level.flare = 0.7; // he lands
    await d.wait(0.75); rumble();
    U.stop(0.3); U.set('circle'); U.hurtAmt = 0.55; U.eyeK = 1.5; U.phase2 = true; U.cd = 1.3; U.hp = Math.max(U.hp, U.maxHp * 0.6); // up again, straighter, and angrier
    P.face = P.angleTo(U); wall = Math.max(VAULT, P.pos.z + 0.05);
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true; P.inv = 0; G.freezeAI = false; G.boss = U; ui.objective('Defeat the Usurper');
    await d.until(() => U.hp <= 1);
    // the sealing
    keep(); ui.objective(''); P.controlEnabled = false; P.lock = null; G.freezeAI = true; G.cinematic = true; ui.cinematic(true);
    playMusic('sealed', { loop: false, cross: 2, fade: 1.2 }); // it opens very quietly and builds through the sealing and the cards that follow
    U.stagDur = 99; U.open = false; U.set('stagger'); U.play(CL.stun, 0.08); U.vel.set(0, 0, 0); U.trailOn = false; U.yoff = 0; G.slow = 1.0; G.shake = 0.25;
    cam.shot([P.pos.x * 0.5 + 1.9, 1.7, Math.min(-19, U.pos.z + 5)], [0, 2.4, -27.6], 1.1);
    const x0 = U.pos.x, z0 = U.pos.z; U.face = 0;
    await d.tween(1.5, (u) => { U.pos.x = lerp(x0, 0, u); U.pos.z = lerp(z0, -26.2, u * u); });
    const at = new T.Vector3(0, 2.6, -27.2);
    SFX.flame(); SFX.boom(); G.shake = 0.4; G.level.flare = 1; shock(new T.Vector3(0, 0, -26.4), 4.5, 0x9ff0e0);
    FX.sparks.emit(at, 140, 8, 0x9ff0e0, 1.4, { grav: -1, spread: 1.2, boost: 2 });
    U.gone = true; G.boss = null;
    cam.shot([0.6, 1.6, -20.5], [0, 3.1, -27.8], 4);
    // What the seal costs: the vault runs backwards. Motes stream into the glass, the blood
    // lifts off the floor and is gone, and the captain is left clean and unhurt.
    let rt = 0; const hp0 = P.hp, rev = d.every((dt) => {
      rt += dt; P.hp = lerp(hp0, 100, Math.min(1, rt / 1.6)); P.wet = Math.max(0, P.wet - dt);
      FX.sparks.emit(new T.Vector3(rnd(-2.6, 2.6), rnd(0.2, 4), rnd(-25, -17)), 2, 0.4, 0x9ff0e0, 0.9, { grav: 0, vz: -7, spread: 0.1 });
      if (opts.blood && rt < 1.3) FX.blood.emit(new T.Vector3(rnd(-2.4, 2.4), 0.06, rnd(-26, -16)), 3, 0.2, 0x5e0a0e, 1.1, { grav: -4, spread: 0.02 });
    });
    await d.wait(1.1); clearBlood();
    await d.wait(1.1); rev(); P.hp = 100; P.wet = 0;
    await d.talk([['The Usurper', 'Only you will remember this.']]);
    await d.wait(0.8); ui.fade(1, 1.6); await d.wait(1.8);
  },
});

// The years between, as cards, down to the day the waystation is raided.
stage('road', {
  async run(d) {
    G.cinematic = true; ui.cinematic(true); ui.fade(1, 0); G.player.controlEnabled = false;
    await d.chronicle('The road', [
      'He walked out into a world where nothing had happened.',
      'A caravan passed him on the road. No one looked twice.',
      'For years he took labouring work where he found it. He could not settle, and he did not fit.',
      'The realm was at peace, and did not know it had ever been otherwise.',
      'Then, out past the last wells, the desert grew restless.',
      '<em>A waystation on the caravan road.</em>',
    ], TAP);
    ui.chronClose();
  },
});

// The waystation and the muster (docs/story.md, prologue 4 and 5) are played at the second site
// (world/waystation.js). Yard coordinates: x east, z north, from the middle of the yard.
const wy = (x, z) => [WAY.x + x, WAY.z + z], wy3 = (x, y, z) => [WAY.x + x, y, WAY.z + z];
const flank = (s) => wy(s * rnd(8, 13), rnd(15.6, 19.6)); // outside the north wall, east (1) or west (-1) of the gate: out of sight from the yard, and they come round to the gate (route() in level.js)
// Walk the captain to a point under a script, and wait until he is there (or `max` seconds have gone).
async function stroll(d, x, z, sp, max = 8) { const P = G.player, w = (P.walk = { x, z, sp }), t0 = G.time; await d.until(() => P.walk !== w || Math.hypot(P.pos.x - x, P.pos.z - z) < 0.2 || G.time - t0 > max); if (P.walk === w) P.walk = null; }
const turnTo = (d, c, to, dur) => { const f0 = c.face, df = wrap(to - f0); return d.tween(dur, (u) => { c.face = wrap(f0 + df * u * u * (3 - 2 * u)); }); };
// Walk a foe to a point under a script. G.freezeAI holds its own mind still meanwhile (and
// brakes it a little every frame, which the speed here allows for).
function march(d, e, x, z, sp = 4.2) {
  const t0 = G.time, far = () => Math.hypot(x - e.pos.x, z - e.pos.z);
  const stop = d.every(() => { const l = far(); if (l < 0.3 || e.dead) return; e.face = Math.atan2(x - e.pos.x, z - e.pos.z); e.vel.set(((x - e.pos.x) / l) * sp * 1.14, 0, ((z - e.pos.z) / l) * sp * 1.14); });
  return d.until(() => far() < 0.4 || e.dead || G.time - t0 > 10).then(stop, (err) => { stop(); throw err; });
}
const settled = async (d, max = 1.5) => { const P = G.player, t0 = G.time; await d.until(() => P.state === 'loco' || G.time - t0 > max); P.state = 'loco'; P.stop(0.2); P.charge = 0; }; // let a swing play out before a scene takes him over

// Prologue 4: the waystation. Years on, he is a yard hand. Raiders come in off the road and
// cut down the one guard; they take him for nobody and go for the goods; he takes up the dead
// man's sword and shield. The first open fight of the game, in three waves, as the light goes:
// raiders, then quicker ones (the roll is taught), then the one who leads them (the heavy blow).
// A guard officer comes up the road behind them, in at the end, to see what he did.
// He wears a head-wrap (LOOKS.labourer / drifter): nobody here knows his face either.
stage('waystation', {
  checkpoint: true,
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ site: 'way', look: 'labourer', player: [...wy(-2.4, -9.6), 0.75], corin: null });
    const P = G.player, L = G.level, R = []; G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.calm = true; G.freezeAI = true; G.maxAtk = 1; preloadMusic('blade');
    const guard = new Extra(LOOKS.wayguard, ...wy(1.7, 9.4), 0), drover = new Extra(LOOKS.drover, ...wy(7.4, 2.0), 0.6);
    const loot = [[7.2, 7.2, 2.44], [11.2, 8.4, 0.68], [-6.4, 9.6, -1.04]]; // where the first three stand over the goods, and which way they face
    if (!G.seenWay) {
      G.seenWay = true;
      // The end of a working day. He crosses the yard, and nobody looks at him.
      cam.shot(wy3(-11, 2.4, -9), wy3(0, 1.3, -3)); cam.shot(wy3(-9.5, 2.0, -6.5), wy3(1.5, 1.3, -1.5), 7); ui.fade(0, 2.4);
      stroll(d, ...wy(2.4, -2.2), 1.25, 9).catch(() => {});
      await d.wait(5.2);
      // A horn, out in the dunes. At the gate, raiders come running in off the road; the guard meets them, and is cut down.
      SFX.horn(); G.shake = 0.1; stopMusic(2); P.walk = null;
      await d.wait(0.7); turnTo(d, P, 0.1, 0.7).catch(() => {});
      for (const [x, z] of [[1.2, 19], [-1.4, 21.5], [0.5, 24]]) R.push(G.spawn('raider', ...wy(x, z)));
      cam.shot(wy3(-3.2, 1.5, 3.6), wy3(0.9, 1.5, 10.5)); cam.shot(wy3(-2.6, 1.4, 5), wy3(1.2, 1.3, 10.5), 3.5);
      guard.guard = 1; drover.go(...wy(0.4, -11.2), 4.4);
      march(d, R[1], ...wy(-1.6, 9.8), 5).catch(() => {}); march(d, R[2], ...wy(0.2, 12.4), 5).catch(() => {});
      await march(d, R[0], ...wy(1.6, 11.5), 5.2);
      const m = R[0].type.moves[0]; R[0].face = R[0].angleTo(guard); R[0].play(m.clip, 0.12); SFX.tele();
      await d.wait(m.wind); SFX.swing(0.8); await d.wait(0.1);
      { const dir = new T.Vector3(guard.pos.x - R[0].pos.x, 0, guard.pos.z - R[0].pos.z).normalize(); SFX.big(); SFX.die(); G.hitstop = 0.1; G.shake = 0.3; guard.flash = 1;
        blood(new T.Vector3(guard.pos.x, 1.15, guard.pos.z), dir, 2, true, R[0]); guard.lie(CL.death); guard.vel.copy(dir).multiplyScalar(2.5); }
      await d.wait(1.0); R[0].stop(0.25); drover.setVisible(false);
      // They take the yard hand for nobody, and go for the goods.
      await d.talk([['Raider', 'Leave that one. He only carries the sacks.']]);
      loot.forEach(([x, z, f], i) => march(d, R[i], ...wy(x, z), 3.6).then(() => { R[i].face = f; }, () => {}));
      // On him: he looks at the man on the ground, and at what the man dropped.
      { const x = P.pos.x, z = P.pos.z; cam.shot([x + 1.1, 1.55, z + 2.6], [x, 1.5, z]); cam.shot([x + 0.9, 1.55, z + 2.2], [x, 1.5, z], 2.5); }
      await d.wait(2.0);
      // He walks up the yard to the body, seen from the ground beside it, and goes down on one knee.
      cam.shot(wy3(3.7, 0.5, 10.9), wy3(1.2, 0.9, 7.5)); cam.shot(wy3(3.5, 0.55, 10.5), wy3(1.2, 0.8, 8.6), 5);
      await stroll(d, ...wy(0.75, 9.0), 2.7, 7);
      await turnTo(d, P, Math.atan2(guard.pos.x - 0.4 - P.pos.x, guard.pos.z + 0.6 - P.pos.z), 0.4);
      P.state = 'cine'; P.play(CL.kneel, 0.35); await d.wait(1.25);
      // His hand closes on the grip, and the fight's music comes back for the first time since the Door.
      P.wear('drifter'); guard.dress(LOOKS.wayguardBare); SFX.learn(); playMusic('blade', { cross: 1, fade: 2.5 });
      G.slow = 0.7; P.flashCol = [1, 0.8, 0.3]; P.flash = 1; shock(P.pos, 2.4, 0xffe2a0); FX.sparks.emit(new T.Vector3(P.pos.x, 0.5, P.pos.z), 40, 3, 0xffe2a0, 1.1, { grav: -2.2, spread: 0.5, boost: 1.6 }); // and something he had put down years ago is in his hand again
      cam.shot([P.pos.x - 1.5, 0.6, P.pos.z + 1.9], [P.pos.x, 0.9, P.pos.z]); cam.shot([P.pos.x - 1.8, 1.1, P.pos.z + 2.3], [P.pos.x, 1.45, P.pos.z], 2.4);
      await d.wait(0.9); P.stop(0.7); P.state = 'loco'; P.calm = false; // he stands, and the guard comes up as it always did
      await d.wait(1.7);
    } else { // a retry starts with the sword already in his hand
      P.wear('drifter'); P.place(...wy(0.75, 9.0), 1.6); guard.lie(CL.death, true); guard.dress(LOOKS.wayguardBare); drover.setVisible(false);
      for (const [x, z, f] of loot) { const e = G.spawn('raider', ...wy(x, z)); e.face = f; R.push(e); }
      playMusic('blade', { cross: 1, fade: 2 }); ui.fade(0, 0.8);
    }
    P.flashCol = [1, 0.15, 0.1]; G.cinematic = false; ui.cinematic(false); P.calm = false; P.face = P.angleTo(R[0]); cam.behind(); P.controlEnabled = true; G.freezeAI = false; for (const e of R) e.cd = rnd(1.4, 2.6);
    // It comes back to him (owner, Nov 2026: the sword in his hand is where the roll and the heavy blow
    // are taught, as things remembered). One raider comes for him while the others are still at the
    // goods; each skill, the first time he uses it, returns with a flash and its name. Once, not on a retry.
    if (!G.taughtWay) {
      const foe = R[0]; for (const e of R) e.hold = e !== foe; foe.spare = true; foe.cd = 1.0; ui.objective('Cut down the raider');
      const back = async (name) => { SFX.learn(); ui.banner(name, 1.8); ui.hint(''); P.flashCol = [1, 0.8, 0.3]; P.flash = 0.9; G.slow = Math.max(G.slow, 0.4); shock(P.pos, 2, 0xffe2a0); await d.wait(0.9); P.flashCol = [1, 0.15, 0.1]; };
      ui.hint('Roll clear of his blade with {d}'); await d.until(() => P.state === 'roll' || P.state === 'back'); await back('THE ROLL');
      ui.hint('Hold {h} to wind up a heavy blow, then let go'); await d.until(() => P.state === 'atk' && P.at && P.at.heavy && P.hitSet.size > 0); await back('THE HEAVY BLOW');
      G.taughtWay = true; foe.spare = false; for (const e of R) e.hold = false;
    }
    ui.objective('Drive the raiders out of the yard');
    await d.until(() => live() === 0); await d.wait(0.9);
    // More of them, and quicker, with the light going.
    d.tween(8, (u) => L.setDawn(u * 0.45)).catch(() => {});
    G.maxAtk = 2; G.spawn('runner', ...flank(1)); G.spawn('runner', ...flank(1)); G.spawn('raider', ...flank(1));
    await d.wait(1.6); await glance(d, ...wy(0, 14), { from: wy3(-5.5, 3.4, 2.5) }); // they are at the gate by the time the camera is
    await d.until(() => live() === 0); await d.wait(0.9);
    // The one who leads them.
    d.tween(8, (u) => L.setDawn(0.45 + u * 0.55)).catch(() => {});
    const chief = G.spawn('chief', ...wy(-8.5, 17.5)); G.spawn('raider', ...flank(-1)); G.spawn('raider', ...flank(-1)); G.spawn('runner', ...flank(-1));
    await d.wait(1.6); await glance(d, ...wy(0, 14), { from: wy3(5.5, 3.4, 2.5) }); G.boss = chief;
    await d.until(() => live() === 0);

    // The yard is quiet. A guard column comes in at the gate: an officer and two soldiers, who stop at what they see.
    ui.objective(''); ui.hint(''); G.boss = null; stopMusic(5); G.slow = 0.9;
    await d.wait(2.2); await settled(d);
    P.controlEnabled = false; P.lock = null; P.calm = true; G.cinematic = true; ui.cinematic(true); G.freezeAI = true;
    const off = new Extra(LOOKS.officer, ...wy(0.2, 19), PI), s1 = new Extra(LOOKS.soldier, ...wy(-1.3, 21), PI), s2 = new Extra(LOOKS.soldier, ...wy(1.2, 21.6), PI);
    cam.shot(wy3(6.5, 4.4, -9.5), wy3(0, 1, 5)); cam.shot(wy3(5.5, 3.6, -7.5), wy3(0, 1.2, 6), 6);
    off.go(...wy(-0.5, 8.2), 2.3, PI); s1.go(...wy(-2.3, 10.4), 2.3, PI); s2.go(...wy(0.2, 10.9), 2.3, PI);
    await stroll(d, ...wy(0.4, 2.8), 2.2, 6);
    if (Math.hypot(P.pos.x - wy(0.4, 2.8)[0], P.pos.z - wy(0.4, 2.8)[1]) > 1) P.place(...wy(0.4, 2.8), 0); // something was in his way: the next cut covers it
    await turnTo(d, P, 0, 0.5);
    { const t0 = G.time; await d.until(() => off.fixed || G.time - t0 > 8); }
    const onOfficer = (dur) => { cam.shot(wy3(1.5, 1.55, 5.4), [off.pos.x, 1.5, off.pos.z]); cam.shot(wy3(1.3, 1.55, 5.8), [off.pos.x, 1.5, off.pos.z], dur); };
    onOfficer(5);
    await d.talk([['Officer', 'Hold.'], ['Officer', 'The third station this month. ...Who did this?']]);
    drover.place(...wy(0.4, -11), 0); drover.setVisible(true); drover.go(...wy(2.6, -0.6), 2.6); drover.watch = off;
    cam.shot(wy3(-0.6, 1.6, 5.6), wy3(1.4, 1.4, 0.6)); cam.shot(wy3(-0.5, 1.6, 5.2), wy3(1.4, 1.4, 0.6), 5);
    await d.talk([['Drover', 'Him. The yard hand.'], ['Drover', "He took the dead man's sword, and then... I don't know what I saw."]]);
    onOfficer(4);
    await d.talk([['Officer', 'Where did you learn to do that?']]);
    cam.shot(wy3(-1.0, 1.55, 5.0), [P.pos.x, 1.5, P.pos.z]); cam.shot(wy3(-0.8, 1.55, 4.7), [P.pos.x, 1.5, P.pos.z], 4);
    await d.talk([['Yard hand', "It doesn't matter."]]);
    onOfficer(6);
    await d.talk([['Officer', 'It does to me. The dunes are waking up, and I am short of soldiers.'], ['Officer', "The column musters here at first light. Stand in the line, or don't."]]);
    await d.wait(0.6); ui.fade(1, 1.6); await d.wait(1.8);
  },
});

// Prologue 5: the muster, the next morning, in the same yard. The trial bout is fought with
// blunted steel (G.blunt): nothing bleeds, nobody dies, and a lost bout is simply fought again.
// The sergeant fights from behind his shield, which is the lesson. Then the clerk asks his name.
stage('muster', {
  checkpoint: true,
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ site: 'way', sky: 'morning', muster: true, look: 'drifter', player: [...wy(1.5, -8.6), 0], corin: null });
    const P = G.player, ring = wy(1.5, -1.5); G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.calm = true; G.freezeAI = true; G.maxAtk = 1; G.blunt = true; stopMusic(2); preloadMusic('flagstones');
    const S = G.spawn('sergeant', ...wy(1.5, 0.9), { spare: true }); S.face = PI;
    const off = new Extra(LOOKS.officer, ...wy(5.2, -6.2), -0.75), clerk = new Extra(LOOKS.clerk, ...wy(7.6, -9.3), 0, { scale: 0.96 }); clerk.watch = P;
    for (const [a, r] of [[0.5, 6.8], [1.25, 6.8], [-0.6, 6.8], [-1.35, 5.6], [-2.3, 6.8]]) { const e = new Extra(LOOKS.soldier, ring[0] + Math.sin(a) * r, ring[1] + Math.cos(a) * r, a + PI, /* the company, standing well back from the ring */ { scale: 0.97 + Math.abs(a) * 0.02 }); e.watch = S; }
    cam.shot(wy3(-6.5, 3.6, -10), wy3(2.5, 1.2, -2)); cam.shot(wy3(-4.5, 2.6, -8.5), wy3(2.5, 1.3, -2), 6); ui.fade(0, 2.2);
    await d.wait(2.6);
    await d.talk([['Officer', 'You came.'], ['Officer', 'I know what I saw in this yard. I want my sergeant to see it.'], ['Sergeant', 'Blunt steel. First to yield. Whenever you like, yard hand.']]);
    await stroll(d, ...wy(1.5, -3.9), 2.0, 5);
    G.cinematic = false; ui.cinematic(false); P.calm = false; P.face = P.angleTo(S); cam.behind(); P.controlEnabled = true; G.freezeAI = false; G.boss = S; S.cd = 1.6;
    // Two objectives, so the shield is a thing to do and not a tip to read: beat it down, then win.
    ui.objective("Beat down the sergeant's shield"); ui.hint('Strike it with {l}. It gives on the third blow.'); let broke = false;
    const tick = d.every(() => { if (!broke && (S.open || S.hp < S.maxHp)) { broke = true; ui.objective('Win the bout'); ui.hint(''); } });
    for (;;) {
      await d.until(() => S.hp <= 1 || P.hp <= 1); if (S.hp <= 1) break;
      G.freezeAI = true; await settled(d, 1); await d.talk([['Sergeant', 'Yield? No. Again.']]); // beaten: they go again
      P.hp = 100; S.hp = S.maxHp; G.freezeAI = false; S.cd = 1.6;
    }
    // He yields. The clerk's table.
    tick(); G.slow = 0.8; ui.objective(''); ui.hint(''); G.boss = null; await settled(d);
    P.controlEnabled = false; P.lock = null; P.calm = true; G.freezeAI = true; G.cinematic = true; ui.cinematic(true);
    S.stagDur = 1e9; S.open = false; S.set('stagger'); S.vel.set(0, 0, 0); S.trailOn = false; S.yoff = 0; S.play(CL.kneel, 0.3);
    { const dx = P.pos.x - S.pos.x, dz = P.pos.z - S.pos.z, l = Math.hypot(dx, dz) || 1, mx = (P.pos.x + S.pos.x) / 2, mz = (P.pos.z + S.pos.z) / 2;
      cam.shot([mx - (dz / l) * 3.4, 1.5, mz + (dx / l) * 3.4], [mx, 1.1, mz]); cam.shot([mx - (dz / l) * 3.0, 1.4, mz + (dx / l) * 3.0], [mx, 1.1, mz], 5); }
    await d.wait(1.4);
    await d.talk([['Sergeant', 'Enough. I yield.'], ['Officer', 'Put him on the roll.']]);
    cam.shot(wy3(9.9, 1.8, -3.2), wy3(7.4, 1.3, -8.2)); cam.shot(wy3(9.5, 1.7, -3.8), wy3(7.4, 1.3, -8.2), 6);
    await stroll(d, ...wy(7.2, -5.9), 2.0, 6);
    if (Math.hypot(P.pos.x - wy(7.2, -5.9)[0], P.pos.z - wy(7.2, -5.9)[1]) > 1) P.place(...wy(7.2, -5.9), PI);
    await turnTo(d, P, P.angleTo(clerk), 0.4);
    await d.talk([['Clerk', 'Name?'], ['Clerk', 'I need something for the roll.'], ['Yard hand', 'Write whatever you like.']]);
    await d.wait(0.5);
    await d.talk([['Clerk', '...Western Watch, Third Company. It is the worst posting on the frontier.'], ['Officer', 'It is where I need him.']]);
    await d.wait(0.6); ui.fade(1, 1.6); await d.wait(1.8);
  },
});

stage('intro', {
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ player: [0.6, 12.5, PI], corin: [RING.x, RING.z - 1.5, 0, 'guard'], spar: true }); // behind a black screen: the camp, and the captain in his guard armour
    G.cinematic = true; ui.cinematic(true); cam.shot([7, 5, 27], [0, 1.6, 8]);
    G.player.controlEnabled = false; // nothing moves until the cards are read and Corin has spoken
    await d.chronicle('Act I: The Western Watch', [
      'He served on the frontier with the Third Company, and rose to captain, because he was the one who kept people alive.',
      'They gave him a squire, Corin, who would not leave him alone.',
      'The raids out of the dunes had been scattered and easily driven off. Lately they came organised.',
      '<em>The first night at the ruins.</em>',
    ], TAP);
    ui.chronClose(); actOne(); ui.fade(0, 1.8); cam.shot([2.6, 3.2, 17.5], [0, 1.4, 8], 3.6); // the Act I music comes in once the cards are read, with the camp
    await d.wait(3.2);
  },
});

stage('spar', {
  checkpoint: true,
  setup() { G.resetWorld({ player: [0.6, 12.5, PI], corin: [RING.x, RING.z - 1.5, 0, 'guard'], spar: true }); cam.behind(); ui.fade(0, 0.8); },
  async run(d) {
    const P = G.player, C = G.corin; let n = 0; const count = (kind) => G.on((k, e) => { if (k === 'spar' && e.kind === kind) n++; });
    const lesson = async (objective, hint, kind, need, mode, want) => {
      n = 0; C.setMode(mode, want); const off = count(kind); const tick = d.every(() => ui.objective(need > 1 ? `${objective} (${Math.min(n, need)}/${need})` : objective));
      ui.hint(hint); await d.until(() => n >= need); off(); tick(); ui.hint(''); await d.wait(0.7);
    };
    actOne(); forgetMusic(); // the earlier tracks are no longer needed
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true; // talk() holds him still, then hands control back
    await d.talk([
      ['Corin', 'Captain! You promised me one lesson before the night watch.'],
      ['Corin', "I've been drilling the guard you showed me. Try to get through it."],
    ]);
    ui.objective('Spar with Corin in the ring'); ui.hint('Move with {move}, then lock on to Corin with {k}');
    await d.until(() => P.lock === C);
    await lesson("Strike Corin's shield", 'Strike: {l}. Tap up to three times for a combo.', 'blocked', 3, 'guard');
    await d.talk([['Corin', 'Ha! Not a scratch on me. My turn.']]);
    await lesson("Block Corin's swings", 'Hold {b} to raise your shield', 'playerBlocked', 2, 'attack');
    await d.talk([['Corin', 'Anyone can hide behind a shield.'], ['Captain', 'Then stop hiding. Meet the blade as it lands.']]);
    SFX.learn(); ui.banner('PARRY', 1.6);
    await lesson('Parry a swing, then strike back', 'Tap {b} just before his sword lands, then {l} while he reels', 'riposte', 1, 'attack');
    await d.talk([['Corin', 'Ow. All right. So how do you get through a guard like mine?'], ['Captain', "You don't go around a shield. You go through it."]]);
    SFX.learn(); ui.banner('SHIELD BASH', 1.6);
    await lesson('Break his guard with a shield bash', '{l}, then {h}', 'bash', 1, 'guard', 'bash');
    await d.talk([['Corin', "Oof. But a real shield wall won't stand still for that."], ['Captain', "Then don't stand where they're looking."]]);
    SFX.learn(); ui.banner('SIDE ROLL', 1.6);
    await lesson('Roll to his flank and strike', 'Locked on: {d} while moving sideways, then {l}', 'flank', 1, 'guard', 'flank');
    ui.objective(''); C.setMode('idle'); P.lock = null;
    await d.talk([
      ['Corin', '...Captain. Where did you learn all this?'],
      ['Captain', "A long time ago. Somewhere that isn't there anymore."],
      ['Corin', 'Then teach me the Still Draw next. The one where you never draw until they strike.'],
      ['Captain', 'Not that one.'],
      ['Corin', 'Why not?'],
      ['Captain', 'The draw is the easy part. Surviving the moment after is the skill.'],
      ['Corin', 'Then teach me that part.'],
      ['Captain', 'Tomorrow.'],
    ]);
    G.spar = false; SFX.horn(); G.shake = 0.12; ui.banner('A war horn sounds from the dunes', 2.6);
    await d.wait(2.8);
  },
});

stage('raid', {
  checkpoint: true,
  setup() { G.resetWorld({ player: [0.6, 8, 0], corin: [-1.4, 8.4, 0, 'battle'] }); cam.behind(); ui.fade(0, 0.6); },
  async run(d) {
    const C = G.corin; G.spar = false; G.maxAtk = 1; actOne();
    await d.talk([['Corin', 'Raiders at the breach!'], ['Captain', 'Corin. Guard my right side.'], ['Corin', 'Always, Captain.']]);
    C.setMode('battle'); ui.objective('Drive back the raiders'); ui.hint('Lock on with {k} to keep a raider in front of you');
    for (let i = 0; i < 3; i++) G.spawn('raider', ...breach());
    await glance(d, 0, 27);
    await d.wait(6); ui.hint('');
    await d.until(() => live() === 0);
    await d.wait(0.8);
    await d.talk([['Corin', 'Bronze shields, coming through the gap!']]);
    G.maxAtk = 2; ui.hint('Shields stop light strikes from the front. Bash them ({l}, {h}), charge a heavy (hold {h}), or roll to their flank.');
    G.spawn('bulwark', ...breach()); G.spawn('raider', ...breach()); G.spawn('raider', ...breach());
    await glance(d, 0, 27);
    await d.wait(8); ui.hint('');
    await d.until(() => live() === 0);
    await d.wait(0.6);
  },
});

stage('fallback', {
  setup() { G.resetWorld({ player: [0, 8, 0], corin: [-1.4, 8.4, 0, 'battle'] }); cam.behind(); ui.fade(0, 0.5); },
  async run(d) {
    await d.talk([
      ['Soldier', 'Captain! A second column broke the east wall. We cannot hold the camp.'],
      ['Soldier', 'And the wounded are still out here.'],
      ['Captain', 'Carry them through the Narrows to the sanctum. I will hold the mouth.'],
      ['Corin', 'We will hold it.'],
    ]);
    ui.objective('Get to the mouth of the Narrows'); G.level.marker(MOUTH.x, MOUTH.z + 1);
    await glance(d, MOUTH.x, MOUTH.z + 1, { back: 10, h: 3.6, y: 2.2 });
    await d.until(() => Math.hypot(G.player.pos.x - MOUTH.x, G.player.pos.z - MOUTH.z - 1) < 2.6);
    G.level.marker(null);
  },
});

stage('hold', {
  checkpoint: true,
  setup() { G.resetWorld({ player: [0, MOUTH.z + 1.5, 0], corin: [-1.8, MOUTH.z + 1.8, 0, 'battle'] }); cam.behind(); ui.fade(0, 0.6); },
  async run(d) {
    const P = G.player; G.maxAtk = 2; P.hp = 100; actOne();
    const H = (G.hold = { progress: 0, far: false }); ui.holdBar(true); let spawnT = 0.5, brute = false, total = 8;
    const SX = (G.stretchers = makeStretchers(total));
    ui.hint('Stay close to the Narrows. No stretcher sets off without cover.'); let hintT = 6;
    const stop = d.every((dt) => {
      const far = Math.hypot(P.pos.x - MOUTH.x, P.pos.z - MOUTH.z) > 11;
      if (!far && !P.dead) H.progress = Math.min(1, H.progress + dt / 75); // 75 s of cover: also the stretchers' pace, below
      SX.update(H.progress, G.paused ? 0 : dt, total / 75);
      if (far !== H.far) { H.far = far; ui.hint(far ? 'Get back to the Narrows!' : ''); hintT = 0; }
      if (hintT > 0 && (hintT -= dt) <= 0 && !far) ui.hint('');
      ui.objective(`Hold the Narrows: ${Math.floor(H.progress * total)}/${total} stretchers through`);
      spawnT -= dt; const cap = 2 + Math.floor(H.progress * 3);
      if (spawnT <= 0 && live() < cap) {
        spawnT = lerp(4.5, 2.6, H.progress); const at = Math.random() < 0.5 ? breach() : east();
        if (H.progress > 0.55 && !brute) { brute = true; G.spawn('brute', ...at); }
        else G.spawn(H.progress > 0.25 && Math.random() < 0.3 ? 'bulwark' : 'raider', ...at);
      }
    });
    await d.until(() => H.progress >= 1);
    stop(); ui.holdBar(false); G.hold = null; ui.hint(''); SX.dispose(); G.stretchers = null;
  },
});

stage('vessa', {
  checkpoint: true,
  setup() { G.resetWorld({ player: [0, MOUTH.z + 1.5, 0], corin: null }); cam.behind(); ui.fade(0, 0.6); },
  async run(d) {
    const P = G.player, C = G.corin; ui.objective(''); actOne();
    for (const e of G.enemies) e.flee();
    if (C.root.visible) {
      await d.talk([['Soldier', 'The last stretcher is through! Captain, fall back!'], ['Captain', 'Corin. Go with them. Bar the gate behind you.'], ['Corin', 'Captain, I...'], ['Captain', 'That was not a request.']]);
      C.setMode('idle'); C.setVisible(false);
    }
    // her entrance
    G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.lock = null; G.freezeAI = true;
    const vx = 0, vz = MOUTH.z + 12; SFX.flame(); cam.shot([2.8, 2.2, MOUTH.z + 3], [vx, 1.9, vz]);
    FX.sparks.emit(new T.Vector3(vx, 1.2, vz), 90, 7, 0xb46cff, 1.1, { grav: -1.5, spread: 0.8, boost: 2 }); shock(new T.Vector3(vx, 0, vz), 4, 0xc79bff); G.shake = 0.3;
    const V = G.spawn('vessa', vx, vz, { spare: true }); G.boss = V; V.face = V.angleTo(P); // spared: she is driven off, not killed, and comes back
    cam.shot([1.6, 1.8, MOUTH.z + 7.5], [vx, 2.0, vz], 3.2);
    await d.wait(1.6);
    await d.talk([
      ['Vessa', 'The quiet captain.'],
      ['Vessa', 'You hold a door for people who will never learn your name.'],
      ['Vessa', 'Step aside, and I will let you live long enough to be forgotten.'],
    ]);
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true; G.freezeAI = false; G.maxAtk = 1; V.cd = 1.2;
    ui.objective("Drive off Vessa, the Witches' Hand"); ui.hint('Her glaive outreaches you. Parry it, or roll through and punish the recovery.');
    const t = d.every(() => { if (!V.phase2 && V.hp < V.maxHp * 0.5 && !V.dead) { V.phase2 = true; V.flash = 1; SFX.flame(); shock(V.pos, 3.4, 0xc79bff); ui.banner('SHE STOPS HOLDING BACK', 2); } });
    await d.wait(7); ui.hint('');
    await d.until(() => V.hp <= 1);
    // beaten, she withdraws with the night
    t(); G.slow = 1.2; G.shake = 0.5; ui.objective(''); ui.hint(''); P.controlEnabled = false; P.lock = null; G.freezeAI = true; G.cinematic = true; ui.cinematic(true);
    V.stagDur = 99; V.open = false; V.set('stagger'); V.play(CL.stun, 0.08); V.vel.set(0, 0, 0); V.trailOn = false; V.yoff = 0;
    const dx = P.pos.x - V.pos.x, dz = P.pos.z - V.pos.z, l = Math.hypot(dx, dz) || 1;
    cam.shot([V.pos.x + (dx / l) * 4.2 - (dz / l) * 1.6, 1.7, V.pos.z + (dz / l) * 4.2 + (dx / l) * 1.6], [V.pos.x, 1.9, V.pos.z], 1.2);
    await d.wait(1.6);
    await d.talk([['Vessa', 'Dawn. Keep your pass, captain.'], ['Vessa', 'The dunes are patient. We will come again.']]);
    SFX.flame(); shock(V.pos, 4, 0xc79bff); G.shake = 0.3;
    FX.sparks.emit(new T.Vector3(V.pos.x, 1.2, V.pos.z), 120, 8, 0xb46cff, 1.4, { grav: -1.5, spread: 0.8, boost: 2 });
    V.gone = true; G.boss = null;
    await d.wait(1.4); G.freezeAI = false;
  },
});

stage('dawn', {
  setup() { G.resetWorld({ player: [0, MOUTH.z + 4, 0], corin: null }); },
  async run(d) {
    const P = G.player; G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.lock = null; G.boss = null;
    for (const e of G.enemies) e.flee();
    SFX.dawn(); cam.shot([P.pos.x + 3.5, 1.6, P.pos.z + 5], [P.pos.x, 1.5, P.pos.z]); cam.shot([P.pos.x + 5, 2.6, P.pos.z + 8], [P.pos.x, 2.4, P.pos.z - 6], 9);
    await d.tween(7, (u) => G.level.setDawn(u));
    await d.wait(1.5); ui.fade(1, 2); await d.wait(2.2);
    await d.chronicle('Report of the Western Watch, the morning after', [
      'The Narrows held. Every stretcher reached the sanctum.',
      "The Witches' Hand was driven off at the mouth of the pass, and withdrew into the dunes at first light.",
      'Credited: the Third Company.',
      'End of the first night. More to come.',
    ], TAP);
    location.reload();
  },
});
