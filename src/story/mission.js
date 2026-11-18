import * as T from 'three';
import { G } from '../core/game.js';
import { SFX, stopMusic, playMusic, preloadMusic, forgetMusic } from '../core/audio.js';
import { PI, rnd, lerp, clamp, wrap } from '../core/util.js';
import { ui } from '../ui/hud.js';
import { cam } from '../world/camera.js';
import { MOUTH, RING, WAY } from '../world/level.js';
import { HALLS } from '../world/halls.js';
import { FORE } from '../world/forecourt.js';
import { FRONT } from '../world/front.js';
import { PZ, C, P as pose, eClip } from '../actors/anim.js';
import { FX, shock, clearBlood, blood } from '../gfx/fx.js';
import { coarse, opts } from '../core/input.js';
import { makeStretchers } from './stretchers.js';
import { CL } from '../actors/anim.js';
import { Extra } from '../actors/extra.js';
import { LOOKS, TYPES } from '../actors/data.js';

// The campaign, as a list of stages: the prologue (the forecourt, the halls, the Glass Door, the road, the
// waystation, the muster), then the first night at the ruins (Act I). Stage names are what saves store, so don't rename a checkpoint. A stage's run() is its script. setup() puts
// the world in the state the stage expects and is only used when starting there
// (first load, or retrying from a checkpoint).
export const STAGES = [];
const stage = (name, o) => STAGES.push({ name, ...o });
const TAP = coarse ? 'TAP TO CONTINUE' : 'CLICK OR PRESS SPACE';
const PALE = '#cfeee8'; // the Glass Door's light, as a wash over the screen (ui.fade's colour)
const live = () => G.enemies.filter((e) => !e.dead).length;
const breach = () => [rnd(-2.6, 2.6), rnd(29, 36)]; // out on the raiders' road, beyond the wall
const east = () => [rnd(22, 26), rnd(-4, -2)];
// Act I's music ("Beneath the Flagstones"): whatever is playing fades out, then it fades in and loops
// through the night. Every Act I stage asks for it, so a retry or CONTINUE has it too; asking while it plays does nothing.
const actOne = (fight) => playMusic(fight ? 'granite' : 'flagstones', { cross: 3, fade: 4, over: true }); // the camp's music, or (fight) the night's fighting: from the first raiders until Vessa is driven off
// Turn the camera to something the player needs to know about (a wave coming in, where to go),
// hold on it for a moment, then hand it back. The captain can't act or be hurt meanwhile.
async function glance(d, x, z, o = {}) {
  const P = G.player, was = P.controlEnabled, dx = P.pos.x - x, dz = P.pos.z - z, l = Math.hypot(dx, dz) || 1, back = Math.min(o.back || 9, l * 0.8);
  const p0 = cam.pos.toArray(), l0 = cam.look.toArray();
  P.controlEnabled = false; P.inv = Math.max(P.inv, 3.8); G.cinematic = true; ui.cinematic(true);
  const cx = x + (dx / l) * back - (dz / l) * 2.2, cz = z + (dz / l) * back + (dx / l) * 2.2, gh = G.level.height; // (heights are above the ground there: it is not flat everywhere)
  cam.shot(o.from || [cx, (o.h || 3.2) + Math.max(gh(cx, cz), gh(x, z)), cz], [x, (o.y || 1.3) + gh(x, z), z], 0.9); // o.from: a fixed camera position, where the usual one could land inside something
  await d.wait(o.hold || 1.9);
  cam.shot(p0, l0, 0.6); await d.wait(0.6);
  cam.release(); G.cinematic = false; ui.cinematic(false); P.controlEnabled = was; P.buf.a = '';
}

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

// The forecourt (owner, Nov 2026): the game opens here, outside, before the building the halls are under.
// The realm's last stand was made in this court and lost; the dead and the wreck of it are all that is
// there, with one of the Usurper's sentries standing among them. Lock on and strike are taught on him,
// and nothing else: he holds the breach in the barricade, so there is no way to the doors but through him, and
// swings while he is taught on, but lightly. Two more come out of the doors, easy ones, and then he goes in. (A cutscene of him
// fighting his way to the gate could open it; tabled.)
const fx = (x, z) => [FORE.x + x, FORE.z + z], fx3 = (x, y, z) => [FORE.x + x, y, FORE.z + z];
stage('forecourt', {
  checkpoint: true,
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ site: 'fore', player: [...fx(0, 17.6), PI], corin: null });
    const P = G.player, L = G.level; G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.calm = true; G.maxAtk = 1; preloadMusic('blade', 'sealed');
    const S = G.spawn('glasssentry', ...fx(0.3, -3.1), { spare: true }); S.hold = true; S.face = PI; // in the breach of the barricade, his back to the gate
    if (!G.seenHalls) { G.seenHalls = true; await d.chronicle('Prologue', ['At the end of the war, the Usurper nearly took the realm.', 'Many tried to intervene, but only one succeeded.'], TAP); ui.chronClose(); } // two lines of footing, once; not again on a retry
    // From outside the gate, low: he walks in under the arch, and the front of the place stands over the court.
    cam.shot(fx3(0.9, 0.8, 21.4), fx3(0, 6.6, -13)); cam.shot(fx3(0.5, 1.4, 18.8), fx3(0, 5.6, -13), 7); ui.fade(0, 2.6);
    await d.wait(1.2); await stroll(d, ...fx(0, 11.4), 1.5, 7); await d.wait(0.4);
    G.cinematic = false; ui.cinematic(false); P.calm = false; cam.behind(); P.controlEnabled = true; ui.objective('Reach the doors');
    // The sentry turns when he is near. Two lessons, once (not again on a retry): he only stands there for them.
    await d.until(() => P.dist(S) < 8 || S.hp < S.maxHp); turnTo(d, S, S.angleTo(P), 0.6).catch(() => {});
    if (!G.taughtStrike) {
      // (Owner, Nov 2026.) He keeps the breach (Enemy.post) and his blows are pulled (dmgK): it looks like a fight and costs
      // little. The captain can't get by him: the barricade closes the rest of the court, and `bar` holds its line in the
      // breach, a pace in front of him. So the lock has to be found; it is no longer skipped by landing blows without it.
      const beaten = () => S.hp <= 1, line = FORE.z - 2.2; let n = 0, hp = S.hp; const hits = d.every(() => { if (S.hp < hp) n++; hp = S.hp; });
      S.post = { z: FORE.z - 3.1, x0: FORE.x - 1.5, x1: FORE.x + 2.2 }; S.dmgK = 0.4; S.hold = false; S.cd = 2.2;
      const bar = d.every(() => { if (P.pos.z < line) { P.pos.z = line; if (P.vel.z < 0) P.vel.z = 0; } });
      ui.hint('Lock on to the sentry with {k}'); await d.until(() => P.lock === S || beaten());
      if (!beaten()) { n = 0; ui.hint('Strike: {l}. Tap up to three times for a combo.'); await d.until(() => n >= 3 || beaten()); }
      hits(); bar(); ui.hint(''); G.taughtStrike = true;
    }
    S.post = null; S.dmgK = 1; S.spare = false; S.hold = false; if (S.state === 'chase' || S.state === 'circle') S.cd = 1.4;
    await d.until(() => S.dead); await d.wait(0.9);
    // Two more, out of the doors.
    G.spawn('glasssentry', ...fx(-0.4, -15.2), { hpMul: 0.75 }); G.spawn('glasssentry', ...fx(0.4, -16.1), { hpMul: 0.75 });
    await glance(d, ...fx(0, -13.2), { from: fx3(3.4, 2.3, -5.6), y: 1.5, hold: 2.3 });
    await d.until(() => live() === 0);
    ui.objective('Go in through the doors'); L.marker(...fx(0, -12.2));
    await d.until(() => P.pos.z < FORE.z - 12.0 && Math.abs(P.pos.x - FORE.x) < 1.6); // at the pillar of light, in the mouth of the doorway (it used to wait until he was well inside the passage)
    L.marker(null); ui.objective(''); P.controlEnabled = false; ui.fade(1, 1.3); await d.wait(1.5);
  },
});

// The halls above the vault (owner, Nov 2026). He comes down the stair from the forecourt into a gallery
// lined with the dead of both sides, the many who tried. The shield is taught on the first of
// the Usurper's guard he meets there (lock on and strike were taught outside; all three used to be taught at the Door).
// One of the realm's knights is still alive, and tells him what they learned: the Usurper bleeds
// and does not die, and the Door below is what he came for. Then the guard come up from the
// rotunda in waves, and the last of them hold the head of the stair. Her lines are a draft.
const hx = (x, z) => [HALLS.x + x, HALLS.z + z], hx3 = (x, y, z) => [HALLS.x + x, y, HALLS.z + z];
stage('halls', {
  checkpoint: true,
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ site: 'halls', player: [...hx(0, -0.4), PI], corin: null });
    const P = G.player, L = G.level; G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.calm = true; G.maxAtk = 1; preloadMusic('blade', 'sealed');
    const K = new Extra(LOOKS.knight, ...hx(-2.95, -25.2), PI / 2); K.play(C(0.1, [0, PZ.sit]), 0.01);
    const F = G.spawn('glassguard', ...hx(0.6, -13.4), { spare: true }); F.hold = true; // the first of them, standing over a soldier who is down and not yet dead
    const V = new Extra(LOOKS.line, ...hx(1.25, -14.45), 2.4); V.dead = true; V.play(C(0.1, [0, PZ.down]), 0.01); F.face = F.angleTo(V);
    const plead = pose({ shL: [-1.25, 0, 0.45], elL: [-0.9], neck: [-0.35, 0.3, 0], chest: [-0.12] }, PZ.down), chop = eClip('over', 0.9, 1.3);
    const stair = [G.spawn('glasswarden', ...hx(0, -55.0)), G.spawn('glassguard', ...hx(-1.4, -53.4)), G.spawn('glassguard', ...hx(1.4, -53.7))]; for (const e of stair) { e.hold = true; e.face = 0; } // and the last, at the head of the stair from the start: far off, against the Door's light
    const left = () => G.enemies.filter((e) => !e.dead && !e.hold).length, south = (z) => P.pos.z < HALLS.z + z;
    const loose = d.every(() => { if (stair[0].hold && south(-46.8)) { for (const e of stair) { e.hold = false; e.cd = rnd(1, 2); } G.boss = stair[0]; G.maxAtk = 2; } });
    // He comes down into the gallery, seen from the floor among the dead.
    cam.shot(hx3(1.9, 0.55, -8.6), hx3(-0.2, 1.5, -1.5)); cam.shot(hx3(1.5, 0.8, -7.6), hx3(-0.1, 1.45, -2.5), 6); ui.fade(0, 2.6);
    playMusic('blade', { cross: 2.5, fade: 3 }); // (owner, Nov 2026) the fight's music from the moment he is in the halls: it used to wait for the knight to die
    await d.wait(1.0); await stroll(d, ...hx(0, -3.8), 1.4, 6);
    // Down the gallery, one of the Usurper's guard is finishing a man off. (Shown, so the first foe is already someone to stop.)
    cam.shot(hx3(-1.9, 1.2, -9.4), hx3(0.9, 0.9, -14.0)); cam.shot(hx3(-1.6, 1.1, -10.2), hx3(0.9, 0.8, -14.0), 4);
    V.play(C(0.7, [0.7, plead]), 0.2); await d.wait(0.6);
    F.play(chop, 0.2); SFX.tele(); await d.wait(0.9); SFX.swing(0.5); await d.wait(0.12);
    { const at = new T.Vector3(V.pos.x, 0.35, V.pos.z), dir = new T.Vector3(V.pos.x - F.pos.x, 0, V.pos.z - F.pos.z).normalize(); SFX.big(); G.hitstop = 0.08; G.shake = 0.2; blood(at, dir, 2, true, F); V.flash = 0.8; V.play(C(0.5, [0.12, pose({ chest: [-0.3], neck: [-0.5] }, PZ.down), 'o'], [0.5, PZ.down]), 0.04); }
    await d.wait(1.5); F.stop(0.4); await d.wait(0.4);
    G.cinematic = false; ui.cinematic(false); P.calm = false; cam.behind(); P.controlEnabled = true; ui.objective('Find the way down to the vault');
    // The first guard turns from his work and comes on. The shield, once (not again on a retry): he can't be killed until two of his
    // swings have been stopped, and then a tip says what stopping them costs.
    await d.until(() => P.dist(F) < 8.5 || F.hp < F.maxHp); turnTo(d, F, F.angleTo(P), 0.5).catch(() => {});
    const beaten = () => F.hp <= 1;
    if (!G.taughtDoor) {
      let n = 0; const off = G.on((k, e) => { if (k === 'struck' && (e.result === 'block' || e.result === 'parry')) n++; });
      F.hold = false; F.cd = 1.0; ui.hint('Hold {b} to raise your shield when he swings');
      await d.until(() => n >= 2 || beaten()); off(); G.taughtDoor = true;
      const tip = 'Every blow your shield stops costs stamina'; ui.hint(n >= 2 ? tip : ''); d.wait(6).then(() => { if (ui._hint === tip) ui.hint(''); }, () => {}); // (not shown if he was beaten down without a block)
    }
    F.hold = false; F.spare = false;
    await d.until(() => F.dead);
    // Further down, someone is still alive.
    await d.until(() => south(-22.2)); await settled(d);
    P.controlEnabled = false; P.lock = null; P.calm = true; G.cinematic = true; ui.cinematic(true); ui.objective('');
    K.play(C(1.0, [1.0, PZ.sitUp]), 0.2);
    const kz = -25.2, s = P.pos.z >= K.pos.z ? 1 : -1; // he goes straight to her and stops on the side he came from (he used to walk round to her far side); the camera takes the other side
    cam.shot(hx3(1.5, 1.5, kz - 2.8 * s), hx3(-2.4, 0.8, kz + 0.4 * s)); cam.shot(hx3(0.7, 1.2, kz - 1.9 * s), hx3(-2.5, 0.8, kz + 0.5 * s), 7); // she is in the front of the shot, and he comes to stand beyond her
    await stroll(d, ...hx(-1.5, kz + 1.25 * s), 1.6, 5); await turnTo(d, P, P.angleTo(K), 0.4);
    await d.talk([
      ['Knight', 'You came. ...Then there is one of us left.'],
      ['Knight', 'We cut him. All of us. He bled like a man, and he got up like something else.'],
      ['Knight', 'He does not die. I watched him not die three times.'],
    ]);
    cam.shot(hx3(-0.5, 1.0, kz - 1.0 * s), hx3(-2.85, 0.9, kz)); cam.shot(hx3(-0.8, 0.95, kz - 0.8 * s), hx3(-2.85, 0.9, kz), 6); // close on her
    await d.talk([
      ['Knight', 'The Door, below. It is his. It is what he came down here for.'],
      ['Knight', 'Put him through it, and shut it. It is the only thing that will hold him.'],
    ]);
    // Below them the glass answers, and the guard come back up.
    SFX.boom(); G.shake = 0.2; L.flare = 0.55;
    for (const [x, z] of [[11.6, -38], [-11.6, -38.4], [11.0, -37.2]]) G.spawn('glassguard', ...hx(x, z));
    await d.wait(0.7);
    await d.talk([['Knight', 'Go. They are coming back up.']]);
    K.play(C(1.6, [1.6, PZ.sitDead]), 0.2);
    cam.shot(hx3(1.4, 1.7, -21.8), hx3(0, 1.4, -33)); cam.shot(hx3(1.2, 1.6, -22.6), hx3(0, 1.4, -33), 2.5);
    await d.wait(1.3); ui.thought('Gone. ...The Door, then.', 4.5); await d.wait(1.5); // what he thinks (owner, Nov 2026: a thought, so it is plain she has died)
    G.cinematic = false; ui.cinematic(false); P.calm = false; P.face = PI; cam.behind(); P.controlEnabled = true; ui.objective('Cut your way down to the vault');
    await d.until(() => left() === 0);
    // The rotunda: they come out of the side passages, twice.
    await d.until(() => south(-33.5));
    G.maxAtk = 2; G.spawn('glassguard', ...hx(11.6, -38)); G.spawn('glassguard', ...hx(11.0, -37.2)); G.spawn('glassshield', ...hx(-11.6, -38));
    if (stair[0].hold) await glance(d, ...hx(7.4, -38), { from: hx3(-3.5, 3.0, -33.5) });
    await d.until(() => left() === 0); await d.wait(0.8);
    G.spawn('glassguard', ...hx(-11.6, -38)); G.spawn('glassguard', ...hx(-11.0, -38.8)); G.spawn('glassshield', ...hx(11.6, -38)); G.spawn('glassguard', ...hx(11.0, -37.2));
    if (stair[0].hold) await glance(d, ...hx(-7.4, -38), { from: hx3(3.5, 3.0, -33.5) });
    await d.until(() => left() === 0);
    // The head of the stair.
    ui.objective('Go down to the vault'); L.marker(...hx(0, -56.3));
    await d.until(() => live() === 0 && Math.hypot(P.pos.x - hx(0, -56.3)[0], P.pos.z - hx(0, -56.3)[1]) < 1.7);
    loose(); L.marker(null); ui.objective(''); G.boss = null; P.controlEnabled = false; ui.fade(1, 1.3); await d.wait(1.5);
  },
});

// Prologue: the climax nobody saw. The Glass Door dressing turns the end of the Narrows into
// the vault. It opens on the end of the fight with a few cards of footing (owner's note: don't
// spell the theme out): the Usurper is cornered and already beaten (TYPES.usurper), and all that
// is left is to put him behind the glass. The first round is a short tutorial (owner, Nov 2026:
// lock on, strike, shield, and no more); after he gets up again there are no hints, only the fight.
// Two things are shown (docs/story.md, The Usurper and the Glass Door; the second is now also said, as the Door shuts): he can't
// be killed (the captain cuts him down, takes it for the end and walks away; the vault shakes and
// he gets up), and the seal takes the years he took in with him (the vault runs backwards: the
// blood lifts, the captain is unmarked).
const VAULT = -14.5; // the captain can't back out of the vault: its wall is at the canyon mouth
stage('door', {
  checkpoint: true,
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ player: [0, -17, PI], corin: null, gate: 'door' }); // behind a black screen: he has come down the stair from the halls
    const P = G.player; G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; G.freezeAI = true; G.maxAtk = 1;
    preloadMusic('blade', 'sealed');
    const U = G.spawn('usurper', 0.3, -23.2, { spare: true }); U.hp = U.maxHp * 0.75; // some of the fight is behind them; enough is left to learn on
    // (Owner, Nov 2026.) He is not alone when the captain comes off the stair: the last of the many who tried is on her knees
    // before him, and he cuts her down. Then he turns to the one who is left. (She lies where she fell through the fight, and the sealing takes her with the rest.)
    const last = new Extra({ ...LOOKS.knight, weapon: undefined }, -1.0, -22.0, 0); last.face = last.angleTo(U); U.face = U.angleTo(last); last.play(C(0.1, [0, PZ.kneel]), 0.01);
    cam.shot([1.9, 0.9, -19.9], [-0.5, 1.2, -22.9]); // from the foot of the stair, low: the two of them against the Door
    await d.wait(0.5); ui.fade(0, 2.2); cam.shot([1.5, 1.0, -20.5], [-0.5, 1.25, -22.9], 4);
    playMusic('blade', { cross: 2.5, fade: 3 }); // the title theme fades out, then the fight's own music fades in
    await d.wait(1.5); last.play(C(0.6, [0.6, pose({ neck: [-0.35, 0, 0], spine: [0.2], chest: [0.05] }, PZ.kneel)]), 0.2); await d.wait(0.7); // she lifts her head to him
    { const m = U.type.moves[0]; U.play(m.clip, 0.2); SFX.tele(); await d.wait(m.wind); SFX.swing(0.5); await d.wait(0.1);
      const dir = new T.Vector3(last.pos.x - U.pos.x, 0, last.pos.z - U.pos.z).normalize(); SFX.big(); SFX.die(); G.hitstop = 0.1; G.shake = 0.25; last.flash = 1; blood(new T.Vector3(last.pos.x, 0.8, last.pos.z), dir, 2, true, U);
      last.lie(C(0.8, [0, PZ.kneel], [0.12, PZ.kneelHit, 'o'], [0.8, PZ.down, 'i'])); } // over onto her back, away from him, at the foot of the wall
    await d.wait(1.6); U.stop(0.5); cam.shot([1.6, 1.9, -18.4], [0.1, 1.7, -23.4], 3.4); await turnTo(d, U, 0, 1.2); // and he turns from it: bent over, breathing hard, the Door at his back
    await d.wait(2.0);
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
    // (Owner, Nov 2026: the camera often sat at the body's feet, looking up between its legs.) He fell forward, along the way he
    // faced: the camera goes down on the floor at his flank, never the feet end, on whichever side leaves the captain walking away beyond him.
    const bf = [Math.sin(U.face), Math.cos(U.face)], body = [U.pos.x + bf[0] * 0.9 * U.scale, U.pos.z + bf[1] * 0.9 * U.scale]; let floorCam = null, fs = -1e9;
    for (let k = 0; k < 24; k++) { const a = (k / 24) * PI * 2, x = hall(body[0] + Math.sin(a) * 2.5), z = deep(body[1] + Math.cos(a) * 2.5), dx = x - body[0], dz = z - body[1], l = Math.hypot(dx, dz); if (l < 1.5) continue;
      const along = (dx * bf[0] + dz * bf[1]) / l, sc = Math.min(-dz / l, 0.5) - Math.max(0, -along - 0.3) * 3 - Math.max(0, along - 0.6) + l * 0.1 - (Math.hypot(x - tx, z - tz) < 2 ? 2 : 0); if (sc > fs) { fs = sc; floorCam = [x, 0.42, z]; } }
    if (!floorCam) floorCam = [hall(body[0] + 2), 0.42, deep(body[1])];
    const floorLook = [lerp(body[0], tx, 0.4), 0.95, lerp(body[1], tz, 0.4)];
    cam.shot(floorCam, floorLook); cam.shot([lerp(floorCam[0], body[0], 0.1), 0.4, lerp(floorCam[2], body[1], 0.1)], [lerp(body[0], tx, 0.5), 0.9, lerp(body[1], tz, 0.5)], 5);
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
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true; P.inv = 0; G.freezeAI = false; G.boss = U;
    // Round two (owner, Nov 2026): he gets up as often as he is cut down. The knight said what holds him:
    // it ends only if he is brought down on the ward before the Door. Anywhere else the glass has him up
    // again, in play, with less left in him. A thought says so, the objective names the Door and the ward pulses.
    ui.objective('Bring the Usurper down before the Glass Door'); let bt = 1.5; const beat = d.every((dt) => { if ((bt -= dt) <= 0) { bt = 2.6; shock(new T.Vector3(0, 0, -24), 2.0, 0x9ff0e0); } }); // a ring runs out over the ward every few seconds (the waypoint beam would hide him and the Door)
    ui.thought('He will not stay dead. ...The Door. It has to be at the Door.', 6);
    for (let ups = 0; ; ups++) {
      await d.until(() => U.hp <= 1); if (U.pos.z < -20.8) break;
      U.open = false; U.vel.set(0, 0, 0); U.trailOn = false; U.yoff = 0; U.set('down'); U.st = -1e6; U.hurtAmt = 0.3; U.play(CL.kneel, 0.25); G.slow = Math.max(G.slow, 0.5); // to his knees again
      await d.wait(1.4); if (!ups) ui.thought('Not here. At the Door.', 4.5);
      SFX.flame(); U.flash = 1; G.shake = Math.max(G.shake, 0.15); G.level.flare = Math.max(G.level.flare, 0.5); shock(U.pos, 2.6, 0x9ff0e0); FX.sparks.emit(new T.Vector3(U.pos.x, 0.4, U.pos.z), 36, 3, 0x9ff0e0, 1.1, { grav: -2, spread: 0.6, boost: 2 });
      U.stop(0.9); await d.tween(1.0, (u) => { U.hp = Math.max(U.hp, U.maxHp * 0.35 * u); }); // and the glass has him up
      U.set('circle'); U.hurtAmt = 0.55; U.cd = 0.8;
    }
    // the sealing
    keep(); beat(); ui.objective(''); ui.thought(''); P.controlEnabled = false; P.lock = null; G.freezeAI = true; G.cinematic = true; ui.cinematic(true);
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
    FX.sparks.emit(new T.Vector3(last.pos.x, 0.4, last.pos.z), 70, 1.2, 0x9ff0e0, 1.5, { grav: -1.2, vz: -3, spread: 0.7, boost: 1.8 }); last.setVisible(false); // and the one he cut down as the captain came in goes with the rest: motes, into the glass
    await d.wait(1.1); rev(); P.hp = 100; P.wet = 0;
    // He says what it has cost, from behind the glass (owner, Nov 2026: "Only you will remember this" alone was too vague; this replaces
    // the rule that the prologue never says it). A draft.
    cam.shot([0.3, 1.5, -22.2], [0, 2.9, -27.8], 9);
    await d.talk([
      ['The Usurper', 'Shut it, then. Everything I took goes in with me.'],
      ['The Usurper', 'My war. My years. Everyone who stood against me in them.'],
      ['The Usurper', 'Out there, none of it will have happened. ...Only you will remember this.'],
    ]);
    // And it is shown (owner, Nov 2026: how shutting him in turned time back). Above, the court he fought across: the
    // war lifts off it in motes that go in at the doors, the sky runs back from smoke and a red evening to a clear day,
    // and under a wash of the glass's light the dead, the fires and the barricade are gone and the place stands whole.
    await d.wait(0.6); ui.fade(1, 1.4, PALE); await d.wait(1.5);
    G.resetWorld({ site: 'fore', sky: ['ember', 'clear'], player: [FORE.x, FORE.z - 15.6, 0], corin: null }); P.setVisible(false); P.controlEnabled = false; G.cinematic = true; ui.cinematic(true);
    cam.shot(fx3(2.2, 5.4, 12.2), fx3(-0.4, 4.6, -13)); cam.shot(fx3(1.2, 4.6, 7.4), fx3(-0.2, 4.2, -13), 13); ui.fade(0, 1.6, PALE);
    const mote = new T.Vector3(), lift = d.every((dt) => { for (let i = 0; i < 7; i++) if (Math.random() < dt * 60) FX.sparks.emit(mote.set(FORE.x + rnd(-10, 10), rnd(0.1, 1.4), FORE.z + rnd(-12, 13)), 1, 0.4, 0x9ff0e0, 1.9, { grav: -1.6, vz: -5.5, spread: 0.1, boost: 2.6 }); });
    await d.wait(1.8); SFX.flame(); shock(new T.Vector3(FORE.x, 0, FORE.z - 11.5), 5, 0x9ff0e0);
    const sky = d.tween(7, (u) => G.level.setDawn(u * u * (3 - 2 * u)));
    await d.wait(2.9); ui.fade(1, 0.5, PALE); await d.wait(0.55);
    G.level.setAfter(true); lift(); ui.fade(0, 1.6, PALE);
    new Extra(LOOKS.clerk, FORE.x + 6.4, FORE.z - 9.6, 0, { scale: 0.96 }).go(FORE.x - 6.8, FORE.z - 8.8, 1.4); new Extra(LOOKS.line, FORE.x - 2.6, FORE.z - 11.6, 0.5); // somebody crossing before the doors, and one of the watch standing easy by them
    await sky; await d.wait(3.2);
    ui.fade(1, 1.8); await d.wait(2.0); P.setVisible(true);
  },
});

// Back up through the halls (owner, Nov 2026: "we walk back out the hallway and everything is
// different"). The seal has taken the Usurper's years with it, so none of it happened: no dead,
// no glass, no blood, no torches, the Door's light gone, and daylight coming down the stair he
// came in by. He says nothing. He walks out; the camera looks once at the column where the knight died.
// Then the doors, and the same court he fought across (owner, Nov 2026): whole, in daylight, the gate
// open, the watch standing easy at it and people about their day. He crosses it and goes out by the gate.
stage('ascent', {
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ site: 'halls', after: true, player: [...hx(0, -52.6), 0], corin: null });
    preloadMusic('well'); // the yard's theme, for the road cards
    const P = G.player; G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.calm = true;
    const motes = d.every((dt) => { if (Math.random() < dt * 14) FX.dust.emit(new T.Vector3(P.pos.x + rnd(-3, 3), rnd(0.4, 4.5), P.pos.z + rnd(-2, 12)), 1, 0.12, 0xd8c8a8, 3.2, { grav: 0.05, spread: 0.3 }); }); // dust hanging in the light
    cam.shot(hx3(0.9, 1.5, -49.6), hx3(0, 1.4, -57)); cam.shot(hx3(1.4, 1.7, -48.2), hx3(-0.3, 2.2, -36), 6.5); ui.fade(0, 3); // from the dark stair where the light was, round to the empty halls
    await d.wait(1.6); P.face = 0; await d.wait(4.4);
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true;
    await d.until(() => P.pos.z > HALLS.z - 43.5); ui.thought('The glass is gone. ...And the dead.', 5); // as he comes out into the rotunda
    await d.until(() => P.pos.z > HALLS.z - 27.2);
    ui.thought('She was here. ...She died here.', 5); // (owner, Nov 2026: a thought, so the look at an empty column has a reason; a draft)
    await glance(d, ...hx(-2.95, -25.2), { from: hx3(0.9, 1.5, -22.0), y: 0.7, hold: 3.2 }); // where she sat: bare stone
    await d.until(() => P.pos.z > HALLS.z - 1.4);
    P.controlEnabled = false; ui.fade(1, 2.2); await d.wait(2.4); motes();
    G.resetWorld({ site: 'fore', after: true, sky: 'clear', player: [...fx(0, -15.4), 0], corin: null });
    G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.calm = true;
    // (Owner, Nov 2026.) He can walk up to them. Nobody looks at him until he does; then they turn to him and go back to
    // their day. Second pass (owner, 17 Nov 2026): not "sir". Nobody knows his badge (the order was born in the taken
    // years), so he is a stranger in odd armour, and they are puzzled by him, casually, the way anyone would be. He asks
    // a few short, stunned things and gets blank looks back. Drafts. His lines are labelled with what he is to them,
    // a stranger (owner, 17 Nov 2026: an empty label read as the last speaker going on); later he is the yard hand.
    const HIM = 'Stranger', lineT = (text) => Math.max(2.4, 1.2 + text.length * 0.05);
    const folk = [], person = (e, lines) => { folk.push({ e, lines, home: e.face }); return e; };
    let left = false; const speak = async (lines) => { for (const [who, text] of lines) { if (left) return; ui.say(who, text, lineT(text)); await d.wait(lineT(text) + 0.5); } }; // a clear beat between speakers, so a new line reads as a new card
    for (const sd of [-1, 1]) person(new Extra(LOOKS.line, ...fx(sd * 1.95, 12.7), -sd * PI / 2), sd < 0 // the gate's watch, facing each other across the way out
      ? [['Gate watch', "Hang on. Where'd you come from? I've had this gate since sunrise."], [HIM, 'From below.'], ['Gate watch', "...Huh. Could've sworn nobody went in."]]
      : [['Gate watch', "That's a lot of steel for a day this warm."], [HIM, "Where's the glass army?"], ['Gate watch', "The what? Glass army? ...You feeling all right?"]]);
    const walk = async (e, pts, sp) => { for (;;) for (const [x, z, rest] of pts) { e.go(...fx(x, z), sp); await d.until(() => e.fixed && !e.stopped); await d.wait(rest); } }; // someone going to and fro on an errand
    walk(person(new Extra(LOOKS.line, ...fx(-9.4, 8.6), 2.2), [['Sentry', "Don't know that badge. Whose are you?"], [HIM, '...Mine.'], ['Sentry', 'Right. Well. Mind how you go.']]), [[-9.2, -8.5, 3.5], [-9.4, 8.6, 3.5]], 1.3).catch(() => {}); // a sentry pacing the west wall
    walk(person(new Extra(LOOKS.clerk, ...fx(7.4, -10.8), 0, { scale: 0.96 }), [['Clerk', 'You look a bit lost, friend.'], [HIM, 'The door down there. The glass one.'], ['Clerk', "That old thing? It's been shut as long as anyone remembers. Nobody even knows what it's for."]]), [[7.0, 11.2, 5], [7.4, -10.8, 6]], 1.5).catch(() => {}); // a clerk between the east wing and the gate
    person(new Extra(LOOKS.drover, ...fx(8.2, -5.4), 0.6), [['Carter', "Mind the sacks. ...Rough night? Looks like you slept in all that."]]); // unloading the cart under the east wall
    { const off = { ...LOOKS.line, shield: undefined, weapon: 'none' }; // two of the watch off duty, talking
      person(new Extra(off, ...fx(-7.4, -1.3), 0), [['Soldier', "...and she says the wells are good right out to the dunes this year. Oh. Can we help you?"], [HIM, 'There was a barricade. Right here.'], ['Soldier', "Here? There's never been anything here but carts."]]);
      person(new Extra(off, ...fx(-7.4, -0.1), PI, { scale: 1.03 }), null); }
    let quiet = 0; const chat = d.every(() => { if (!P.controlEnabled) return; for (const f of folk) { const e = f.e, dist = P.dist(e); // (one speaks at a time: the next waits until the one before has finished)
      if (dist < 2.7 && !e.stopped) { e.stopped = true; e.faceTo = null; e.watch = P; }
      if (e.stopped && !f.said && f.lines && G.time > quiet) { f.said = true; quiet = G.time + f.lines.reduce((s, [, t]) => s + lineT(t) + 0.5, 0.4); speak(f.lines).catch(() => {}); }
      if (e.stopped && e.to) { e.resume = e.to; e.to = null; } // whatever errand it was on waits
      if (e.stopped && dist > 3.8) { e.stopped = false; e.watch = null; if (e.resume) e.to = e.resume; else e.faceTo = f.home; e.resume = null; } } });
    cam.shot(fx3(3.4, 1.3, -6.6), fx3(0, 2.4, -13.4)); cam.shot(fx3(4.4, 1.5, -4.4), fx3(0, 2.2, -12.4), 7); ui.fade(0, 3); // on the doors: he comes out of the dark into the sun
    await d.wait(1.4); await stroll(d, ...fx(0, -10.6), 1.4, 7); await d.wait(1.2);
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true;
    await d.until(() => P.pos.z > FORE.z + 16.2); // out under the gate, onto the road
    left = true; chat(); ui.hideDialogue(); P.controlEnabled = false; ui.fade(1, 2.2); await d.wait(2.4);
  },
});

// The years between, as cards, down to the day the waystation is raided.
stage('road', {
  async run(d) {
    G.cinematic = true; ui.cinematic(true); ui.fade(1, 0); G.player.controlEnabled = false;
    playMusic('well', { cross: 3, fade: 3 }); // (owner, Nov 2026) the yard's theme comes in with the road cards and runs on into the waystation
    // (Owner, Nov 2026: tell it better.) Two pages: what he found, then the years. Things that happened, not a summary of
    // them: the armour he sells explains the yard hand's clothes, and the caravans that stop coming are the war beginning. (Owner, Nov 2026) He comes to doubt it ever happened, and his hands forget the sword: what the waystation's lessons bring back. Drafts.
    await d.chronicle('The road', [
      'At the first well he asked for news of the war. They laughed, and asked him which war.',
      'He asked again in the next town, and the next. Then he stopped asking.',
      'There is no work for a soldier of a war that was never fought. He sold the armour a piece at a time, and the sword last.',
    ], TAP);
    await d.chronicle('The years', [
      "He mended walls. He dug wells. He loaded other men's carts, and moved on before anyone thought to ask his name.",
      'The realm had its peace, and never knew what it had been spared.',
      'In time even he began to doubt it. Nobody else remembered the war; perhaps there had been nothing to remember. The Door came to him only in dreams, and less often.',
      'His hands forgot the weight of a sword. He let them.',
      'Then, out past the last wells, the caravans began to come in late. Some did not come in at all.',
      '<em>A waystation on the caravan road.</em>',
    ], TAP);
    ui.chronClose();
  },
});

// Prologue 4: the waystation. Years on, he is a yard hand. One raider comes in quietly behind the gate's
// one guard and cuts him down, and the rest come in off the road at the horn; they take him for nobody and go for the goods; he takes up the dead
// man's sword and shield. The first open fight of the game, in three waves, as the light goes:
// raiders, then quicker ones (the roll is taught), then the one who leads them (the heavy blow).
// A guard officer comes up the road behind them, in at the end, to see what he did.
// He wears a head-wrap (LOOKS.labourer / drifter): nobody here knows his face either.
stage('waystation', {
  checkpoint: true,
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ site: 'way', look: 'labourer', player: [...wy(-2.4, -9.6), 0.75], corin: null });
    const P = G.player, L = G.level, R = []; G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.calm = true; G.freezeAI = true; G.maxAtk = 1; preloadMusic('granite');
    const guard = new Extra(LOOKS.wayguard, ...wy(1.7, 9.4), PI), drover = new Extra(LOOKS.drover, ...wy(6.3, 2.4), 1.2);
    guard.play(C(0.1, [0, pose({ neck: [0.5, 0.15, 0], chest: [0.12], spine: [0.1] }, guard.cur)]), 0.01); // the one man on the gate: his back to the road, dozing on his feet
    const loot = [[6.2, 4.3, 1.45], [5.6, -1.2, 1.8], [-6.6, 9.3, -0.9]]; // at the stall, the cart and the carter's load // where the first three stand over the goods, and which way they face
    if (!G.seenWay) {
      G.seenWay = true;
      // The end of a working day. He crosses the yard, and nobody looks at him.
      cam.shot(wy3(-6.4, 2.3, -10.4), wy3(0.6, 1.5, -2)); cam.shot(wy3(-5.6, 2.0, -8.8), wy3(1.2, 1.5, 0), 7); ui.fade(0, 2.4); playMusic('well', { cross: 2, fade: 2.5 }); // the yard's own quiet theme // from beside the house door, past the awning post, up the yard to the gate
      stroll(d, ...wy(2.4, -2.2), 1.25, 9).catch(() => {});
      await d.wait(4.6);
      // (Owner, Nov 2026: it used to be a horn and a guard standing ready.) A raider comes in under the arch behind the
      // guard, alone and quietly. The yard hand sees him; the guard does not.
      R.push(G.spawn('raider', ...wy(1.4, 16.5))); const creep = march(d, R[0], ...wy(1.75, 10.8), 1.7); creep.catch(() => {});
      cam.shot(wy3(-2.8, 1.5, 4.2), wy3(1.5, 1.4, 10.6)); cam.shot(wy3(-2.3, 1.45, 5.6), wy3(1.6, 1.35, 10.8), 5);
      await d.wait(1.9);
      // On him: he stops in his stride, and his head comes round to the gate.
      P.walk = null; // (owner, Nov 2026: the yard's theme runs on, unbroken, until his hand closes on the sword)
      { const x = P.pos.x, z = P.pos.z; cam.shot([x - 0.5, 1.5, z + 2.3], [x, 1.5, z]); cam.shot([x - 0.4, 1.52, z + 1.9], [x, 1.52, z], 2); }
      turnTo(d, P, P.angleTo(guard), 0.35).catch(() => {}); await d.wait(1.1);
      // The blow, from behind. Nothing announces it.
      cam.shot(wy3(-0.9, 1.3, 7.2), wy3(1.7, 1.3, 10.4)); cam.shot(wy3(-0.7, 1.25, 7.6), wy3(1.7, 1.2, 10.2), 3);
      await creep;
      const m = R[0].type.moves[0]; R[0].face = R[0].angleTo(guard); R[0].play(m.clip, 0.12);
      await d.wait(m.wind); SFX.swing(0.8); await d.wait(0.1);
      { const dir = new T.Vector3(guard.pos.x - R[0].pos.x, 0, guard.pos.z - R[0].pos.z).normalize(); SFX.big(); SFX.die(); G.hitstop = 0.1; G.shake = 0.3; guard.flash = 1;
        blood(new T.Vector3(guard.pos.x, 1.15, guard.pos.z), dir, 2, true, R[0]); guard.lie(CL.death); guard.vel.copy(dir).multiplyScalar(2.5); }
      // He starts back from it: his hands come up and his weight goes onto his heels. (His face is wrapped: the body has to say it.)
      { const x = P.pos.x, z = P.pos.z, a = P.face + 0.5; cam.shot([x + Math.sin(a) * 2.1, 1.45, z + Math.cos(a) * 2.1], [x, 1.42, z]); cam.shot([x + Math.sin(a) * 2.6, 1.5, z + Math.cos(a) * 2.6], [x, 1.42, z], 1.8);
        const idle = new Float32Array(P.cur), start = pose({ spine: [-0.22, 0, 0], chest: [-0.14, 0, 0], neck: [0.14, 0, 0], shL: [-0.8, 0, 0.5], elL: [-1.5, 0, -0.3], shR: [-0.65, 0, -0.5], elR: [-1.4, 0, 0], pos: [0, -0.05, -0.1] }, idle);
        P.state = 'cine'; P.play(C(1.4, [0.12, start, 'o'], [0.6, start], [1.4, pose({ spine: [-0.08, 0, 0], chest: [-0.05, 0, 0], shL: [-0.3, 0, 0.3], elL: [-0.9, 0, 0], shR: [-0.25, 0, -0.3], elR: [-0.8, 0, 0] }, idle)]), 0.06); P.vel.set(-Math.sin(P.face) * 2.4, 0, -Math.cos(P.face) * 2.4); }
      await d.wait(1.4);
      // Then the horn, out in the dunes, and the rest of them come running in off the road.
      G.shake = 0.1; SFX.horn();
      for (const [x, z] of [[-1.4, 19], [0.5, 21.5]]) R.push(G.spawn('raider', ...wy(x, z)));
      cam.shot(wy3(-3.2, 1.5, 3.6), wy3(0.9, 1.5, 10.5)); cam.shot(wy3(-2.6, 1.4, 5), wy3(1.2, 1.3, 10.5), 3.5);
      drover.go(...wy(0.4, -11.2), 4.4);
      // (Owner, Nov 2026: it went straight from the kill to "leave that one"; then, that the walk up took too long.) The one who
      // killed the guard does not look round at the horn: he is already walking at the yard hand, at a stride, while the others
      // run in behind him, so he is nearly there when the camera comes back. The yard hand does not back away.
      { const k = R[0], dx = k.pos.x - P.pos.x, dz = k.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1, kx = P.pos.x + (dx / l) * 2.1, kz = P.pos.z + (dz / l) * 2.1, a = Math.atan2(dx, dz);
        k.stop(0.3); /* out of the cut he killed the guard with: he was held in its last pose and slid across the yard */ const near = march(d, k, kx, kz, 3.1); near.catch(() => {});
        march(d, R[1], ...wy(-1.6, 9.8), 5).then(() => march(d, R[1], kx + (dx / l) * 1.6 - (dz / l) * 1.3, kz + (dz / l) * 1.6 + (dx / l) * 1.3, 5), () => {}).then(() => { R[1].stop(0.3); R[1].face = R[1].angleTo(P); }, () => {}); // the second, a step behind him and to one side
        march(d, R[2], ...wy(0.2, 12.4), 5).catch(() => {});
        await d.wait(1.7); P.stop(0.5); P.state = 'loco'; drover.setVisible(false);
        turnTo(d, P, a, 0.4).catch(() => {});
        cam.shot([P.pos.x - Math.sin(a) * 1.6 + Math.cos(a) * 0.7, 1.6, P.pos.z - Math.cos(a) * 1.6 - Math.sin(a) * 0.7], [kx, 1.4, kz]); cam.shot([P.pos.x - Math.sin(a) * 1.2 + Math.cos(a) * 0.6, 1.6, P.pos.z - Math.cos(a) * 1.2 - Math.sin(a) * 0.6], [kx, 1.45, kz], 3); // over his shoulder for the last few strides
        await near; k.stop(0.3); k.face = k.angleTo(P); await d.wait(0.45); // he stops a sword's length off
        { const mx = (kx + P.pos.x) / 2, mz = (kz + P.pos.z) / 2; cam.shot([mx + Math.cos(a) * 3.4, 1.6, mz - Math.sin(a) * 3.4], [mx, 1.35, mz]); cam.shot([mx + Math.cos(a) * 3.0, 1.6, mz - Math.sin(a) * 3.0], [mx, 1.35, mz], 6); } // the two of them, side on
        await d.talk([['Raider', 'You. Are you going to give me any trouble?'], ['Second raider', "Him? He's the yard hand. He hasn't even got a knife."], ['Raider', "...Then stay out of our way, and you'll live."]]);
        // He turns away from him, and the camera goes down to what the guard dropped.
        turnTo(d, k, Math.atan2(loot[0][0] - (k.pos.x - WAY.x), loot[0][1] - (k.pos.z - WAY.z)), 0.6).catch(() => {});
        cam.shot([guard.pos.x + 2.9, 2.2, guard.pos.z - 0.5], [guard.pos.x + 0.8, 0, guard.pos.z - 0.4]); cam.shot([guard.pos.x + 2.6, 2.0, guard.pos.z - 0.5], [guard.pos.x + 0.7, 0, guard.pos.z - 0.4], 4); // from his side and above, aimed short so the body and the sword sit clear of the dialogue box
        await d.talk([['Raider', 'Load up the goods. Be quick about it.']]); }
      loot.forEach(([x, z, f], i) => march(d, R[i], ...wy(x, z), 3.6).then(() => { R[i].face = f; }, () => {}));
      // On him: he looks at the man on the ground, and at what the man dropped.
      { const x = P.pos.x, z = P.pos.z; cam.shot([x + 1.1, 1.55, z + 2.6], [x, 1.5, z]); cam.shot([x + 0.9, 1.55, z + 2.2], [x, 1.5, z], 2.5); }
      await d.wait(2.0);
      // He walks up the yard to the body, seen from the ground beside it, and goes down on one knee.
      cam.shot(wy3(3.7, 0.5, 10.9), wy3(1.2, 0.9, 7.5)); cam.shot(wy3(3.5, 0.55, 10.5), wy3(1.2, 0.8, 8.6), 5);
      await stroll(d, ...wy(0.8, 8.3), 2.7, 7); // (he fell into the yard, away from the gate: this is by his shoulders)
      await turnTo(d, P, Math.atan2(guard.pos.x - P.pos.x, guard.pos.z - 1.0 - P.pos.z), 0.4);
      P.state = 'cine'; P.play(CL.kneel, 0.35); await d.wait(1.25);
      // His hand closes on the grip, and the music comes up to its full weight.
      P.wear('drifter'); guard.dress(LOOKS.wayguardBare); SFX.learn(); playMusic('granite', { cross: 1, fade: 2.5 });
      G.slow = 0.7; P.flashCol = [1, 0.8, 0.3]; P.flash = 1; shock(P.pos, 2.4, 0xffe2a0); FX.sparks.emit(new T.Vector3(P.pos.x, 0.5, P.pos.z), 40, 3, 0xffe2a0, 1.1, { grav: -2.2, spread: 0.5, boost: 1.6 }); // and something he had put down years ago is in his hand again
      cam.shot([P.pos.x - 1.5, 0.6, P.pos.z + 1.9], [P.pos.x, 0.9, P.pos.z]); cam.shot([P.pos.x - 1.8, 1.1, P.pos.z + 2.3], [P.pos.x, 1.45, P.pos.z], 2.4);
      await d.wait(0.9); P.stop(0.7); P.state = 'loco'; P.calm = false; // he stands, and the guard comes up as it always did
      await d.wait(1.7);
    } else { // a retry starts with the sword already in his hand
      P.wear('drifter'); P.place(...wy(0.8, 8.3), 1.6); guard.lie(CL.death, true); guard.dress(LOOKS.wayguardBare); drover.setVisible(false);
      for (const [x, z, f] of loot) { const e = G.spawn('raider', ...wy(x, z)); e.face = f; R.push(e); }
      playMusic('granite', { cross: 1, fade: 2 }); ui.fade(0, 0.8);
    }
    P.flashCol = [1, 0.15, 0.1]; G.cinematic = false; ui.cinematic(false); P.calm = false; P.face = P.angleTo(R[0]); cam.behind(-PI / 2); P.controlEnabled = true; G.freezeAI = false; for (const e of R) e.cd = rnd(1.4, 2.6); // from the west, looking across him to the stall: straight behind him is the gate's leaf, which filled a phone's screen (owner, Nov 2026)
    // It comes back to him (owner, Nov 2026: the sword in his hand is where the roll and the heavy blow
    // are taught, as things remembered). One raider comes for him while the others are still at the
    // goods; each skill, the first time he uses it, returns with a flash and its name. Once, not on a retry.
    if (!G.taughtWay) {
      const foe = R[0]; for (const e of R) e.hold = e !== foe; foe.spare = true; foe.cd = 1.0; // (he can't be cut down until both have come back, so each is the objective in its turn)
      const back = async (name, thought) => { SFX.learn(); ui.banner(name, 2.2); ui.hint(''); ui.thought(thought, 4.5); P.flashCol = [1, 0.8, 0.3]; P.flash = 0.9; G.slow = Math.max(G.slow, 0.5); shock(P.pos, 2, 0xffe2a0); await d.wait(1.1); P.flashCol = [1, 0.15, 0.1]; };
      // (Owner, Nov 2026.) Only a roll counts: a step back used to pass for one. A step back gets a nudge instead.
      ui.objective('Remember how to get clear of a blade'); ui.hint('Roll: hold a direction and press {d}'); let stepped = false;
      const nudge = d.every(() => { if (P.state === 'back' && !stepped) { stepped = true; ui.hint('That was a step back. To roll, hold a direction and press {d}'); } });
      await d.until(() => P.state === 'roll'); nudge(); await back('THE ROLL', 'I know this. ...My feet never forgot it.');
      ui.objective('Remember how to end it in one blow'); ui.hint('Hold {h} to wind up a heavy blow, then let go'); await d.until(() => P.state === 'atk' && P.at && P.at.heavy && P.hitSet.size > 0); await back('THE HEAVY BLOW', 'And this. ...The weight of it.');
      G.taughtWay = true; foe.spare = false; for (const e of R) e.hold = false;
    }
    ui.objective('Drive the raiders out of the yard');
    await d.until(() => live() === 0); await d.wait(0.9);
    // More of them, and quicker, with the light going.
    d.tween(8, (u) => L.setDawn(u * 0.45)).catch(() => {});
    G.maxAtk = 2; G.spawn('runner', ...flank(1)); G.spawn('runner', ...flank(1)); G.spawn('raider', ...flank(1)); G.spawn('raider', ...flank(1));
    await d.wait(1.6); await glance(d, ...wy(0, 14), { from: wy3(-5.5, 3.4, 2.5) }); // they are at the gate by the time the camera is
    await d.until(() => live() === 0); await d.wait(0.9);
    // The one who leads them.
    d.tween(8, (u) => L.setDawn(0.45 + u * 0.55)).catch(() => {});
    const chief = G.spawn('chief', ...wy(-8.5, 17.5)); G.spawn('raider', ...flank(-1)); G.spawn('raider', ...flank(-1)); G.spawn('runner', ...flank(-1)); G.spawn('runner', ...flank(-1));
    await d.wait(1.6); await glance(d, ...wy(0, 14), { from: wy3(5.5, 3.4, 2.5) }); G.boss = chief;
    await d.until(() => live() === 0);

    // The yard is quiet. A guard column comes in at the gate: an officer and two soldiers, who stop at what they see.
    ui.objective(''); ui.hint(''); G.boss = null; playMusic('well', { cross: 5, fade: 4 }); G.slow = 0.9; // the fighting's music goes out, and the yard's comes back under the officer
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
    // (Owner, Nov 2026: he is not invited, he is taken. The column came after the fighting and saw none of it: a dead
    // guard, the gate, and a stranger holding the guard's sword. Two stations have been opened from the inside.)
    onOfficer(5);
    await d.talk([['Officer', 'What I see is a dead guard, his gate, and a stranger holding his sword.'], ['Officer', 'Two stations this month were opened from the inside.']]);
    s1.go(P.pos.x - 1.3, P.pos.z + 0.9, 2.0); s2.go(P.pos.x + 1.3, P.pos.z + 0.9, 2.0); s1.watch = P; s2.watch = P; // the two soldiers close in on either side of him
    cam.shot(wy3(-3.2, 2.2, 0.2), [P.pos.x, 1.3, P.pos.z + 1]); cam.shot(wy3(-3.0, 2.0, 0.6), [P.pos.x, 1.3, P.pos.z + 1], 5);
    { const t0 = G.time; await d.until(() => (s1.fixed && s2.fixed) || G.time - t0 > 5); } await d.wait(0.4); // let them reach him
    await d.talk([['Officer', 'Put it down.']]);
    cam.shot(wy3(-1.0, 1.55, 5.0), [P.pos.x, 1.5, P.pos.z]); cam.shot(wy3(-0.8, 1.55, 4.7), [P.pos.x, 1.5, P.pos.z], 4);
    await d.wait(0.8);
    await d.talk([['Yard hand', 'I did not open your gate.']]);
    onOfficer(6);
    await d.talk([['Officer', 'Then you can show me so in the morning, in front of my sergeant.'], ['Officer', 'Hold him.']]);
    await d.wait(0.6); ui.fade(1, 1.6); await d.wait(1.8);
  },
});

// Prologue 5: the muster, the next morning, in the same yard. He is brought out under guard: the officer
// holds him for a deserter or the raiders' man, and the bout is how the sergeant means to find out which.
// It is fought with blunted steel (G.blunt): nothing bleeds, nobody dies, and a lost bout is simply fought
// again. Then he is put on the roll whether he likes it or not, and the clerk asks his name.
stage('muster', {
  checkpoint: true,
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ site: 'way', sky: 'morning', muster: true, look: 'drifter', player: [...wy(1.5, -8.6), 0], corin: null });
    const P = G.player, ring = wy(1.5, -1.5); G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.calm = true; G.freezeAI = true; G.maxAtk = 1; G.blunt = true; playMusic('well', { cross: 2, fade: 3 }); preloadMusic('measure', 'flagstones'); // (it is already playing if he came here from the yard)
    // Two rounds (owner, Nov 2026: one bout was a few blows and over). First one of the line, then the sergeant
    // himself, who is harder and has a shield rush that a raised shield does not stop. Until his turn the sergeant
    // is an Extra at the ring's edge (an Enemy standing by could be locked on to and struck).
    const T1 = G.spawn('trooper', ...wy(1.5, 0.9), { spare: true }); T1.face = PI;
    const sgt = new Extra(TYPES.sergeant.look, ...wy(-1.2, 3.6), 2.6, { scale: TYPES.sergeant.scale }); sgt.watch = P;
    const off = new Extra(LOOKS.officer, ...wy(5.2, -6.2), -0.75), clerk = new Extra(LOOKS.clerk, ...wy(7.6, -9.3), 0, { scale: 0.96 }); clerk.watch = P;
    const co = []; for (const [a, r] of [[0.5, 6.8], [1.25, 6.8], [-0.6, 6.8], [-1.35, 5.6], [-2.3, 6.8]]) { const e = new Extra(LOOKS.soldier, ring[0] + Math.sin(a) * r, ring[1] + Math.cos(a) * r, a + PI, /* the company, standing well back from the ring */ { scale: 0.97 + Math.abs(a) * 0.02 }); e.watch = P; co.push(e); }
    const guards = [new Extra(LOOKS.soldier, ...wy(0.4, -9.5), 0), new Extra(LOOKS.soldier, ...wy(2.6, -9.5), 0)]; // his escort
    cam.shot(wy3(1.2, 1.9, -4.6), wy3(1.5, 1.3, -8.9)); cam.shot(wy3(1.4, 1.8, -5.2), wy3(1.5, 1.3, -8.9), 7); ui.fade(0, 2.2); // first on him, between his guards
    await d.wait(2.6);
    await d.talk([['Officer', 'The drover swears you killed them. The other stations swear a man on the inside opened the gate.'], ['Officer', 'A man with no name who fights like a soldier is a deserter, or he is theirs.']]);
    cam.shot(wy3(-6.5, 3.6, -10), wy3(2.5, 1.2, -2)); cam.shot(wy3(-4.5, 2.6, -8.5), wy3(2.5, 1.3, -2), 6); // then the yard, the ring and the sergeant
    await d.talk([['Sergeant', "Or both. Give him blunt steel, sir, and I'll tell you which."], ['Soldier', 'Whenever you like, yard hand.']]);
    guards[0].go(...wy(-0.6, -7.6), 1.8); guards[1].go(...wy(3.6, -7.6), 1.8); for (const g of guards) { g.watch = P; } // they walk him to the ring and stand off behind it
    await stroll(d, ...wy(1.5, -3.9), 2.0, 5);
    // A round: fought until the other yields. Beaten, he is stood up and they go again.
    const round = async (E, again) => {
      P.calm = false; P.face = P.angleTo(E); cam.behind(); P.controlEnabled = true; G.freezeAI = false; G.boss = E; E.cd = 1.6;
      for (;;) {
        await d.until(() => E.hp <= 1 || P.hp <= 1); if (E.hp <= 1) break;
        G.freezeAI = true; await settled(d, 1); await d.talk([again]); // beaten: they go again
        P.hp = 100; E.hp = E.maxHp; G.freezeAI = false; E.cd = 1.6;
      }
    };
    G.cinematic = false; ui.cinematic(false); playMusic('measure', { cross: 1.5, fade: 2 }); // the bout's own music: a contest, not a battle
    ui.objective('Make the soldier yield');
    await round(T1, ['Soldier', 'Up. Again.']);
    // The soldier yields, and the sergeant takes the ring. The change-over is behind a short dip to black.
    ui.objective(''); G.boss = null; G.slow = 0.8; await settled(d); P.controlEnabled = false; P.lock = null; P.calm = true; G.freezeAI = true;
    T1.stagDur = 1e9; T1.open = false; T1.set('stagger'); T1.vel.set(0, 0, 0); T1.trailOn = false; T1.yoff = 0; T1.play(CL.kneel, 0.3);
    await d.wait(1.2);
    await d.talk([['Soldier', 'I yield. ...Sergeant, he is not what he looks.'], ['Sergeant', 'I have eyes. Out of the ring, lad.']]);
    ui.fade(1, 0.5); await d.wait(0.7);
    T1.gone = true; sgt.setVisible(false); sgt.place(...wy(-9, 9.5), 0); /* out of everyone's way */ { const e = new Extra(LOOKS.soldier, ...wy(-1.2, 3.6), 2.6); e.watch = P; }
    const S = G.spawn('sergeant', ...wy(1.5, 0.9), { spare: true }); S.face = PI;
    P.place(...wy(1.5, -3.9), 0); P.hp = 100; P.st = 100; cam.behind(); ui.fade(0, 0.6); await d.wait(0.7);
    await d.talk([['Sergeant', 'He fights fair. I stopped doing that twenty years ago.']]);
    ui.objective('Make the sergeant yield');
    // His rush: called for here, every so often while he circles, and oftener once he is half beaten. The first
    // one comes with the one thing the player has not met before: a blow the shield will not stop.
    let rt = 5, told = false, pressed = false; const RUSH = TYPES.sergeant.moves[2];
    const offR = G.on((k) => { if (k === 'rush') rt = Math.max(rt, pressed ? 3 : 5); /* one he threw in answer to blows on his shield counts too */ if (k === 'rush' && !told) { told = true; const tip = 'His shield rush breaks a guard. Roll clear of it: a direction and {d}'; ui.hint(tip); d.wait(5).then(() => { if (ui._hint === tip) ui.hint(''); }, () => {}); } });
    const tick = d.every((dt) => {
      if (!pressed && S.hp < S.maxHp * 0.5) { pressed = true; S.phase2 = true; rt = Math.min(rt, 1.5); /* quicker on his feet, chains oftener, less time between attacks */ }
      if (G.freezeAI || G.talking || S.hp <= 1 || P.dead) return;
      if ((rt -= dt) <= 0 && S.state === 'circle' && P.dist(S) < 5.5) { rt = pressed ? rnd(4, 6) : rnd(7, 10); S.startMove(RUSH); }
    });
    await round(S, ['Sergeant', 'Yield? No. Again.']);
    // Round three (owner, Nov 2026: the sergeant was too easy to put down). Beaten, he will not yield: he calls two of
    // the line into the ring and gets up again, short of breath. Three at once, two of them may swing together. Each
    // one beaten to 1 hp yields where he stands (`kneelDown`: out of the fight and no longer a target); the soldiers
    // then get up and walk back to the line, the sergeant stays on his knees. A lost round is fought again, all three.
    G.slow = 0.8; ui.objective(''); ui.hint(''); G.boss = null; await settled(d);
    P.controlEnabled = false; P.lock = null; P.calm = true; G.freezeAI = true;
    const kneelDown = (e) => { e.dead = true; e.solid = e.fixed = true; /* still in the way: he could be walked through */ e.hold = true; e.stagDur = 1e9; e.open = false; e.set('stagger'); e.vel.set(0, 0, 0); e.trailOn = false; e.yoff = 0; e.play(CL.kneel, 0.3); e.yT = G.time; };
    kneelDown(S);
    await d.wait(1.2);
    await d.talk([['Sergeant', 'On my knees is not the same as yielding.'], ['Sergeant', 'Hale. Brann. In the ring.']]);
    const pair = [co[0], co[2]], spots = [wy(4.4, 0.2), wy(-1.4, 0.2)], /* each to the mark on his own side: they used to cross in front of the sergeant and bump */ home = pair.map((e) => [e.pos.x, e.pos.z]);
    pair.forEach((e, i) => e.go(...spots[i], 2.2, PI));
    cam.shot(wy3(-5.5, 3.2, -9.5), wy3(1.5, 1.2, 0.5)); cam.shot(wy3(-4.2, 2.6, -8.6), wy3(1.5, 1.2, 0.5), 5);
    await d.wait(2.2);
    await d.talk([['Officer', 'Sergeant.'], ['Sergeant', 'A deserter quits when it goes bad, sir. Let us see it go bad.']]);
    { const t0 = G.time; await d.until(() => pair.every((e) => !e.to) || G.time - t0 > 4); }
    const HP3 = 0.55, TROOP = 72; let out = []; // he gets up with a little over half of himself; the two fresh ones are lighter than the first soldier
    const rise = (e) => { e.dead = false; e.solid = e.fixed = false; e.hold = false; e.stagDur = 0.3; e.st = 0; e.stop(0.5); e.set('circle'); };
    const ready = () => { // the two soldiers become foes where they stand; the sergeant gets up
      const T = pair.map((x, i) => { x.setVisible(false); x.place(-200, -200 - i * 3, 0); const e = G.spawn('trooper', ...spots[i], { spare: true }); e.yoff = 0; e.set('circle'); e.face = PI; e.hp = e.maxHp = TROOP; e.home = home[i]; e.title = i ? 'BRANN' : 'HALE'; /* the two he will go on patrol with: the bar says who */ return e; });
      rise(S); S.hp = Math.round(S.maxHp * HP3); return [S, ...T];
    };
    let foes = ready(); await d.wait(0.6);
    playMusic('measure', { cross: 0.5, fade: 1 });
    const count = () => foes.filter((e) => e.dead).length;
    const obj = d.every(() => { if (!G.talking) ui.objective(`Make them yield (${count()}/3)`); });
    const walkOff = d.every(() => { for (const e of foes) if (e !== S && e.dead && !e.gone && G.time - e.yT > 1.8) { // a yielded soldier gets up and goes back to the line
      e.gone = true; const x = new Extra(e.type.look, e.pos.x, e.pos.z, e.face, { scale: e.type.scale }); x.play(CL.kneel, 0, CL.kneel.dur); x.stop(0.6); x.go(...e.home, 1.8); x.watch = P; out.push(x); } });
    G.maxAtk = 2;
    for (;;) {
      P.calm = false; P.face = P.angleTo(S); cam.behind(); P.controlEnabled = true; G.freezeAI = false; G.boss = S; foes.forEach((e, i) => { e.cd = 1.4 + i * 0.9; });
      ui.objective('Make them yield (0/3)');
      await d.until(() => { for (const e of foes) if (!e.dead && e.hp <= 1) { kneelDown(e); if (e === S) G.boss = null; } return foes.every((e) => e.dead) || P.hp <= 1; });
      if (foes.every((e) => e.dead)) break;
      G.freezeAI = true; await settled(d, 1); await d.talk([['Sergeant', 'Again. All of you.']]);
      ui.fade(1, 0.5); await d.wait(0.6); // behind a dip to black, everyone back to their marks
      for (const e of foes) if (e !== S) e.gone = true;
      for (const x of out) { x.setVisible(false); x.place(-200, -220, 0); } out = [];
      foes = ready(); S.place(...wy(1.5, 0.9), PI); P.place(...wy(1.5, -3.9), 0); P.hp = 100; P.st = 100; P.lock = null; cam.behind(); ui.fade(0, 0.6); await d.wait(0.6);
    }
    obj(); walkOff(); G.maxAtk = 1;
    // He yields. The clerk's table.
    tick(); offR(); G.slow = 0.8; ui.objective(''); ui.hint(''); G.boss = null; playMusic('well', { cross: 3, fade: 4 }); await settled(d); // and the yard's again for the clerk's table; it runs on under the Act I cards
    P.controlEnabled = false; P.lock = null; P.calm = true; G.freezeAI = true; G.cinematic = true; ui.cinematic(true);
    if (!S.dead) kneelDown(S);
    { const dx = P.pos.x - S.pos.x, dz = P.pos.z - S.pos.z, l = Math.hypot(dx, dz) || 1, mx = (P.pos.x + S.pos.x) / 2, mz = (P.pos.z + S.pos.z) / 2;
      cam.shot([mx - (dz / l) * 3.4, 1.5, mz + (dx / l) * 3.4], [mx, 1.1, mz]); cam.shot([mx - (dz / l) * 3.0, 1.4, mz + (dx / l) * 3.0], [mx, 1.1, mz], 5); }
    await d.wait(1.4);
    await d.talk([['Sergeant', 'Enough. I yield.'], ['Sergeant', "He's no deserter, sir. A deserter would have run by now."], ['Officer', 'Then he is a soldier. Put him on the roll.']]);
    cam.shot(wy3(9.9, 1.8, -3.2), wy3(7.4, 1.3, -8.2)); cam.shot(wy3(9.5, 1.7, -3.8), wy3(7.4, 1.3, -8.2), 6);
    await stroll(d, ...wy(7.2, -5.9), 2.0, 6);
    if (Math.hypot(P.pos.x - wy(7.2, -5.9)[0], P.pos.z - wy(7.2, -5.9)[1]) > 1) P.place(...wy(7.2, -5.9), PI);
    await turnTo(d, P, P.angleTo(clerk), 0.4);
    await d.talk([['Clerk', 'Name?'], ['Clerk', 'I need something for the roll.'], ['Yard hand', 'Write whatever you like.']]);
    await d.wait(0.5);
    await d.talk([['Clerk', '...Western Watch, Third Company. It is the worst posting on the frontier.'], ['Officer', 'It is where I need him.'], ['Officer', 'You belong to the Watch now. Walk away from it, and you are the deserter I took you for.']]);
    await d.wait(0.6); ui.fade(1, 1.6); await d.wait(1.8);
  },
});

// Act I opens on the frontier (owner, Nov 2026): he is a soldier of the line, before the captain's red, and the country is
// open: the site 'front' (world/front.js), where the ground has height and there are no walls. Two chapters on it.
// 'patrol': from the well picket, over the rise and up the dry riverbed, with two of the line (Hale and Brann, the two the
// sergeant called into the ring at the muster), who fight beside him (Ally; G.enlist). Raiders here lie under the sand and get
// up out of it (`rise`), so nothing has to come in by a gate. 'beacon': the patrol that went quiet is pinned under the
// beacon's rock; he gets to them, and holds the rock while one of them climbs to light it. All lines are drafts.
const fr = (x, z) => [FRONT.x + x, FRONT.z + z], fr3 = (x, y, z) => [FRONT.x + x, y + G.level.height(FRONT.x + x, FRONT.z + z), FRONT.z + z]; // (fr3: y is above the ground at that point)
const LINE = { ...LOOKS.soldier, eye: undefined };
const file = (at) => [ // the two who go with him: each has his own place behind the captain's shoulder
  G.enlist({ soldier: true, name: 'HALE', look: { ...LINE, hair: 0x4a3424 }, scale: 1.0, slot: [1.9, 1.3], at: at[0] }),
  G.enlist({ soldier: true, name: 'BRANN', look: { ...LINE, skin: 0xb98a66, hair: 0x1e1814 }, scale: 0.96, slot: [-1.9, 1.6], at: at[1] })];
// Raiders getting up out of the sand at these points; `marks` sets some of them on the soldiers instead of on him.
const ambush = (list, marks = []) => list.map(([kind, x, z], i) => { const e = G.spawn(kind, ...fr(x, z), { rise: true }); if (marks[i]) e.mark = marks[i]; return e; });
const rallyAll = () => { for (const a of G.allies) a.rally(); };
// Corin at the beacon: a runner too young for the line, years before he is the squire of the first night. No plate: the company's
// navy under a leather jack and an iron hat, and a crimson neckcloth (the colour of the crest he wears later), so he is not one more steel figure.
const BOY = LOOKS.boy, BOY_SCALE = 0.8;
const OFF = { ...LINE, shield: undefined, weapon: 'none' }; // one of the line off duty, arms laid by
// What he goes by on the frontier (owner, 16 Nov 2026: he answers his own people; asked his name, he gives his old job). His speaker label too, until he is made captain.
const ME = 'Yard hand';
// The first javelin on the frontier: one of the line shouts it (once, unless the chapter is picked again). Returns the unsubscribe.
const javelins = (who) => G.on((k) => { if (k === 'javelin' && !G.seenJav) { G.seenJav = true; ui.say(who, 'Javelins! Shields up, or get out of the way!', 3.5); } });
stage('patrol', {
  checkpoint: true, cards: true, // it opens on the Act I cards: main.js leaves the music playing under them
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ site: 'front', look: 'ranker', player: [...fr(1.2, -43.2), 0.5], corin: null }); G.carry = null;
    const P = G.player, L = G.level; G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.calm = true; G.freezeAI = true; G.maxAtk = 2; preloadMusic('flagstones', 'granite');
    if (!G.seenFront) { G.seenFront = true; await d.chronicle('Act I: The Western Watch', [
      'The Third Company held the last wells before the open dunes. Nobody had ever asked to be sent there.',
      "They gave him a soldier's steel and a place in the line. He kept his helm on, and did what he was told.",
      'The company was short of men, and the men it had were tired. Nobody asked the new one many questions.',
      '<em>The well at the edge of the dunes.</em>',
    ], TAP); ui.chronClose(); }
    actOne(); forgetMusic();
    // (owner, Nov 2026: the morning used to wear on as they went, in two ten-second runs of the sun after each fight, and every shadow
    // on the field swung round while he watched. The hour now only changes behind a black screen: at the beacon, before the corporal's scene.)
    const sgt = new Extra(TYPES.sergeant.look, ...fr(3.6, -39.4), 0, { scale: TYPES.sergeant.scale }); sgt.watch = P;
    { const e = new Extra({ ...LINE, shield: undefined, weapon: 'none' }, ...fr(7.6, -39.6), 0, { scale: 0.98 }); e.face = Math.atan2(6.4 - 7.6, -38.2 + 39.6); } // one of the picket, at the fire
    const [hale, brann] = file([[...fr(-0.6, -40.6), 1.9], [...fr(0.4, -38.6), 2.3]]);
    cam.shot(fr3(-6.5, 2.6, -48.5), fr3(2.5, 1.3, -40)); cam.shot(fr3(-4.5, 2.0, -46.5), fr3(2.8, 1.3, -40), 8); ui.fade(0, 2.4);
    await d.wait(2.2); await turnTo(d, P, P.angleTo(sgt), 0.5);
    await d.talk([
      ['Sergeant', "The beacon on the north rock should've been lit at dawn. It wasn't."],
      ['Sergeant', "We sent three up there yesterday, and we haven't heard a thing since."],
    ]);
    // Why he is out here at all (owner, Nov 2026: it went from calm to trouble with nothing said between). He asks, in few words; the
    // sergeant tells it as a soldier sees it: the caravans first, then the small things, then stations opened from inside. Nobody knows why.
    cam.shot(fr3(0.9, 1.75, -44.9), [sgt.pos.x, sgt.pos.y + 1.55, sgt.pos.z]); cam.shot(fr3(1.0, 1.7, -44.5), [sgt.pos.x, sgt.pos.y + 1.55, sgt.pos.z], 9); // over his shoulder, at the sergeant
    await d.talk([
      [ME, 'Has it always been like this out here?'],
      ['Sergeant', "Out here? Two years ago this was where they sent a man to grow old. Count the herds, walk the wells, sleep."],
      ['Sergeant', "Then the caravans started coming in late. Then short. Then not at all, and nobody could say what happened to them."],
      ['Sergeant', "This season it's raids. Small ones, all along the line, and every one a little bolder than the last. And yards like yours, opened from the inside."],
      [ME, 'Who are they?'],
      ['Sergeant', "The same desert people we've traded with for a hundred years. Only now they don't trade, and they don't run."],
      ['Sergeant', "Something's put steel in them, and nobody in the Watch can tell me what."],
      ['Sergeant', 'Hale, Brann, go and find out why that beacon is dark. Take the yard hand with you.'],
    ]);
    cam.shot(fr3(2.4, 1.6, -41.6), [hale.pos.x, hale.pos.y + 1.5, hale.pos.z]); cam.shot(fr3(2.2, 1.6, -41.9), [hale.pos.x, hale.pos.y + 1.5, hale.pos.z], 5);
    await d.talk([['Hale', "Him, Sergeant? He's been with us nine days."], ['Sergeant', 'And he put the both of you on your knees on the first one. Go.']]);
    G.cinematic = false; ui.cinematic(false); P.calm = false; P.face = 0; cam.behind(); P.controlEnabled = true; G.freezeAI = false;
    ui.objective('Go north, over the rise'); L.marker(...fr(8, -18));
    // The rise. They are under the sand along its east end, and get up as he comes over the top.
    await d.until(() => P.pos.z > FRONT.z - 21.5); L.marker(null);
    const offJ = javelins('Brann');
    const w1 = ambush([['raider', 17.5, -17], ['raider', 21, -22.5], ['raider', 24.5, -17.5], ['runner', 28, -21], ['raider', 14, -22], ['skirmisher', 32, -12.5]], [null, hale, brann]); // (owner, Nov 2026: more of them; the rest find their own fights, Enemy.share)
    G.freezeAI = true; actOne(true); SFX.tele(); ui.say('Brann', "The sand! They're coming up out of the sand!", 3.5);
    await glance(d, ...fr(21.5, -19.5), { hold: 1.7 }); G.freezeAI = false; for (const e of w1) e.cd = rnd(0.8, 2);
    ui.objective('Cut them down');
    await d.until(() => live() === 0); await d.wait(0.9); rallyAll();
    ui.say('Hale', 'They were lying in wait. For us, or for whoever came along?', 4.5);
    ui.objective('Follow the dry riverbed north'); L.marker(...fr(-9, 4));
    // The riverbed. Both ends at once, and out of the pocket on its west bank.
    await d.until(() => P.pos.z > FRONT.z + 5.5 && P.pos.x < FRONT.x - 5); L.marker(null);
    const w2 = ambush([['raider', -16.5, 19], ['bulwark', -14.5, 23.5], ['runner', -3, -1.5], ['runner', -24.5, 10], ['raider', -27, 8], ['raider', -5, -4], ['skirmisher', -22, 13], ['skirmisher', -12, 26]], [brann, hale]);
    G.freezeAI = true; SFX.tele(); ui.say('Hale', "They're at both ends! Back to back!", 3.5);
    await glance(d, ...fr(-15.5, 21), { hold: 1.7 }); G.freezeAI = false; for (const e of w2) e.cd = rnd(0.8, 2.2);
    ui.objective('Cut your way out of the riverbed');
    await d.until(() => live() === 0); await d.wait(0.9); rallyAll();
    ui.say('Brann', "Both ends of it. They knew someone would come about that beacon. ...I'm sticking close to him.", 5.5);
    ui.objective('Go on, to the beacon'); L.marker(...fr(-6, 31));
    await d.until(() => P.pos.z > FRONT.z + 29); L.marker(null);
    offJ(); G.carry = { hale, brann, run: G.runId };
  },
});

stage('beacon', {
  checkpoint: true,
  async run(d) {
    const P = G.player, L = G.level; let hale, brann;
    if (G.carry && G.carry.run === G.runId && L.site === 'front') { ({ hale, brann } = G.carry); } // straight on from the riverbed, still under the morning's sky
    else { ui.fade(1, 0); G.resetWorld({ site: 'front', sky: ['day', 'dusk'], look: 'ranker', player: [...fr(-8.5, 29.5), 0.7], corin: null }); [hale, brann] = file([[...fr(-10.5, 28), 0.7], [...fr(-9, 27), 0.7]]); cam.behind(); ui.fade(0, 0.8); }
    G.carry = null; G.maxAtk = 2; actOne(true); ui.objective(''); ui.hint('');
    // Under the rock: what is left of the patrol. Two on their feet with their backs to it, the corporal down, one more who can climb.
    const foot = fr(18.4, 42.8), post = (name, x, z, f, o) => { const a = G.enlist({ soldier: true, name, look: { ...LINE, ...o }, scale: 0.98, at: [...fr(x, z), f] }); a.post = [...fr(x, z), f]; a.hp = a.maxHp = 150; return a; };
    const p1 = post('SOLDIER', 15.4, 41.6, -2.2, { hair: 0x6a4a2a }), wren = post('WREN', 19.6, 40.2, 2.8, { skin: 0xc4926c, hair: 0x2a1c14 });
    const corp = new Extra({ ...LINE, weapon: 'none', shield: undefined, hair: 0x8a8680 }, ...fr(18.2, 44.0), -2.6); corp.play(C(0.1, [0, PZ.sit]), 0.01);
    // Corin (story, 16 Nov 2026): the corporal's kid brother and his runner, a boy, on his knees beside him. Nobody's target.
    const boy = new Extra(BOY, ...fr(19.5, 44.7), 0, { scale: BOY_SCALE, name: 'CORIN' }); boy.face = boy.angleTo(corp); boy.play(C(0.1, [0, PZ.kneelBy]), 0.01);
    G.spawn('raider', ...fr(11.5, 39.5)).mark = p1; G.spawn('raider', ...fr(14, 36.5)).mark = p1; G.spawn('raider', ...fr(21, 35.5)).mark = wren; G.spawn('bulwark', ...fr(24, 38.5)).mark = wren; G.spawn('runner', ...fr(9, 44));
    G.spawn('raider', ...fr(4, 38)); G.spawn('runner', ...fr(26, 34)); G.spawn('skirmisher', ...fr(8, 52)); G.spawn('skirmisher', ...fr(31, 37)); const offJ = javelins('Hale');
    await settled(d, 1); ui.say('Hale', "There, under the rock! They're still standing.", 4);
    await glance(d, ...foot, { from: fr3(1.5, 2.6, 34.5), y: 1.6, hold: 2.4 });
    ui.objective('Reach the patrol under the beacon');
    await d.until(() => live() === 0); await d.wait(0.8); rallyAll(); await settled(d);
    // The corporal. They cut the stair; she could not get anyone up to light it.
    P.controlEnabled = false; P.lock = null; P.calm = true; G.cinematic = true; ui.cinematic(true); G.freezeAI = true; ui.objective('');
    ui.fade(1, 0.5); await d.wait(0.6); // (wherever the fight ended, they would be standing in the shot)
    L.setSky('day', 'dusk'); L.setDawn(0); // the day has gone on (unseen: the sun is never moved in view, except slowly through the hold)
    P.place(...fr(16.4, 42.0), 0); P.face = P.angleTo(corp); P.state = 'loco'; P.stop(0.1);
    for (const [a, x, z] of [[hale, 12.4, 40.0], [brann, 15.0, 38.6], [p1, 16.8, 46.6], [wren, 20.4, 42.4]]) { a.rally(); a.place(...fr(x, z), 0); a.face = a.angleTo(corp); a.post = [...fr(x, z), a.face]; a.set('loco'); a.stop(0.1); }
    cam.shot(fr3(12.6, 1.7, 44.4), fr3(18.0, 0.9, 43.4)); cam.shot(fr3(13.2, 1.5, 44.2), fr3(18.0, 0.9, 43.4), 9); ui.fade(0, 0.7); await d.wait(0.9);
    await d.talk([
      ['Corporal', 'Three of you? I asked the sergeant for thirty.'],
      ['Corin', "Stop talking. You're bleeding through it again."],
      ['Corporal', 'My runner. He thinks he outranks me, because he is also my brother.'],
      ['Corporal', "They broke the stair the first night. We can't get up to light it, and they won't let us leave."],
      ['Wren', 'I can climb it, Corporal. I told you yesterday.'],
      ['Corporal', 'And yesterday there was no one to keep them off you while you did.'],
    ]);
    cam.shot(fr3(18.5, 1.0, 44.9), [P.pos.x, P.pos.y + 1.45, P.pos.z]); cam.shot(fr3(18.4, 1.05, 44.6), [P.pos.x, P.pos.y + 1.5, P.pos.z], 5); // from beside her, up at him
    await d.talk([['Corporal', 'You, the quiet one. Can you hold this rock until she gets it lit?']]);
    await d.wait(0.6);
    await d.talk([[ME, "Climb. I'll keep them off you."], ['Corporal', '...Well. You heard him, Wren. Go.']]);
    // She goes round the rock to climb it (an Extra from here: she is out of the fight).
    { const i = G.allies.indexOf(wren); G.allies.splice(i, 1); wren.dispose(); const w = new Extra({ ...LINE, skin: 0xc4926c, hair: 0x2a1c14, weapon: 'none', shield: undefined }, wren.pos.x, wren.pos.z, wren.face, { scale: 0.98 }); w.go(...fr(20.6, 45.4), 3.4);
      d.until(() => w.fixed).then(() => w.setVisible(false), () => {}); }
    cam.shot(fr3(12, 2.4, 36), [L.front.beacon[0], L.front.top + 6, L.front.beacon[1]], 2.5); await d.wait(2.6);
    G.cinematic = false; ui.cinematic(false); P.calm = false; cam.behind(); P.controlEnabled = true; G.freezeAI = false; hale.post = [...fr(13.6, 43.6), -1.6]; brann.post = [...fr(21.4, 39.4), 2.4];
    // The hold: about seventy seconds of it, as the light goes. They come out of the sand north and east of the basin, more of
    // them as it goes on, and some go for the soldiers. Nothing counts while he is away from the rock.
    const H = (G.hold = { progress: 0, far: false }); ui.holdBar(true); let spawnT = 1.2, brutes = 0; const SECS = 70;
    const from = () => (Math.random() < 0.5 ? [rnd(3, 14), rnd(60, 72)] : [rnd(34, 45), rnd(33, 41)]);
    const stop = d.every((dt) => {
      const far = Math.hypot(P.pos.x - foot[0], P.pos.z - foot[1]) > 17;
      if (!far && !P.dead) H.progress = Math.min(1, H.progress + dt / SECS); L.setDawn(H.progress);
      if (far !== H.far) { H.far = far; ui.hint(far ? 'Get back to the rock!' : ''); }
      ui.objective('Hold the rock until the beacon is lit');
      // (owner, Nov 2026: with three of the line beside him it was too easy: more at once, sooner, javelin throwers from a
      // fifth of the way in, and a second Breaker near the end)
      spawnT -= dt; const cap = 5 + Math.floor(H.progress * 4);
      if (spawnT <= 0 && live() < cap && H.progress < 0.97) {
        spawnT = lerp(3.2, 1.7, H.progress); const u = H.progress, r = Math.random(), jav = G.enemies.filter((e) => !e.dead && e.kind === 'skirmisher').length;
        const kind = (u > 0.5 && brutes < 1) || (u > 0.82 && brutes < 2) ? (brutes++, 'brute') : u > 0.18 && r < 0.22 && jav < 2 ? 'skirmisher' : u > 0.3 && r < 0.42 ? 'bulwark' : u > 0.12 && r < 0.7 ? 'runner' : 'raider';
        const e = G.spawn(kind, ...fr(...from()), { rise: true }), up = G.allies.filter((a) => !a.out);
        if (kind !== 'brute' && kind !== 'skirmisher' && up.length && Math.random() < 0.35) e.mark = up[(Math.random() * up.length) | 0]; // some are sent at the line; the rest pick their own fights (Enemy.share)
      }
    });
    await d.until(() => H.progress >= 1);
    stop(); offJ(); ui.holdBar(false); G.hold = null; ui.hint(''); ui.objective('');
    // It burns. Out in the dunes they see it too, and break off; and from the south, the company's horn.
    await settled(d, 1); P.controlEnabled = false; P.lock = null; P.calm = true; P.inv = 1e6; G.cinematic = true; ui.cinematic(true);
    L.front.light(true); SFX.flame(); SFX.boom(); G.shake = 0.2; for (const e of G.enemies) e.flee(); actOne(); preloadMusic('wind', 'watch'); // the picket's two tracks, for the night that follows
    cam.shot(fr3(9, 1.6, 37), [L.front.beacon[0], L.front.top + 7, L.front.beacon[1]]); cam.shot(fr3(7, 1.5, 34.5), [L.front.beacon[0], L.front.top + 8, L.front.beacon[1]], 7);
    await d.wait(3.4); SFX.horn(); await d.wait(2.4); rallyAll(); G.freezeAI = true;
    ui.fade(1, 0.6); await d.wait(0.7);
    P.place(...fr(16.4, 42.0), 0); P.face = P.angleTo(corp); P.state = 'loco'; P.stop(0.1);
    for (const [a, x, z] of [[hale, 12.4, 40.0], [brann, 15.0, 38.6], [p1, 16.8, 46.6]]) { a.place(...fr(x, z), 0); a.face = a.angleTo(corp); a.post = [...fr(x, z), a.face]; a.set('loco'); a.stop(0.1); }
    cam.shot(fr3(12.6, 1.7, 44.4), fr3(18.0, 1.4, 43.4)); cam.shot(fr3(13.2, 1.5, 44.2), fr3(18.0, 1.2, 43.4), 9); ui.fade(0, 0.8); await d.wait(1.0);
    await d.talk([
      ['Corporal', "That's the horn. The company's seen it."],
      ['Corporal', "Everyone under this rock is walking home. An hour ago I couldn't have said that."],
      ['Hale', 'That was him, Corporal. We just tried to keep up.'],
      ['Corporal', 'I saw. What do they call you, soldier?'],
    ]);
    await d.wait(1.0);
    await d.talk([[ME, 'Yard hand.'], ['Corporal', "That's a job, soldier, not a name."], [ME, "It's the one I've got."], ['Brann', "The clerk wrote something else on the roll, Corporal. None of us can read it."], ['Corporal', "Then I'll tell the captain it was the Third Company, and he can work out which one of you."]]);
    cam.shot(fr3(17.6, 1.2, 43.0), [boy.pos.x, boy.pos.y + 1.0, boy.pos.z]); cam.shot(fr3(17.4, 1.25, 42.8), [boy.pos.x, boy.pos.y + 1.0, boy.pos.z], 5);
    await d.talk([['Corin', "You can tell the captain from a bed. You've bled through it again."], ['Corporal', "Help me up, runner. ...Slowly. It's a long walk to the well."]]);
    await d.wait(0.6); ui.fade(1, 1.8); await d.wait(2.0); P.inv = 0;
  },
});

// 'picket' (story, 16 Nov 2026; docs/story.md, "After the beacon"): the night after, back at the well. The corporal is dying
// of the beacon wound, propped against the trough in the fire's light; he gives his kid brother to the man who held the rock.
// Then the morning: the boy at the stakes, looking north, and neither of them wanting the other. No fighting. He can walk up
// to Hale, Brann and Wren, who each say a line (this is where they start to be people to him). All lines are drafts.
stage('picket', {
  checkpoint: true,
  async run(d) {
    const P = G.player, L = G.level, FIRE = [6.4, -38.2];
    const loc = (a, n) => [2.85 + 0.92 * a + 0.39 * n, -41.0 - 0.39 * a + 0.92 * n]; // from where the corporal sits: a along the trough, n out from it toward the fire
    const toFire = (x, z) => Math.atan2(FIRE[0] - x, FIRE[1] - z);
    let quiet = 0; // one bystander speaks at a time, and a scene waits for the line to finish
    const company = (lines) => {
      const who = [['HALE', { hair: 0x4a3424 }, 1.0, 4.9, -37.4], ['BRANN', { skin: 0xb98a66, hair: 0x1e1814 }, 0.96, 7.9, -39.5], ['WREN', { skin: 0xc4926c, hair: 0x2a1c14 }, 0.98, 6.3, -41.0]];
      // lines[i] = [what they say, how long it stays, what he says back] (owner, 16 Nov 2026: no blank stares; he answers his own people)
      const folk = who.map(([name, o, scale, x, z], i) => ({ e: new Extra({ ...OFF, ...o }, ...fr(x, z), toFire(x, z), { scale, name }), who: name[0] + name.slice(1).toLowerCase(), line: lines[i][0], dur: lines[i][1], reply: lines[i][2] }));
      const stop = d.every(() => { if (!P.controlEnabled || G.talking) return; for (const f of folk) if (!f.said && P.dist(f.e) < 3.0 && G.time > quiet) {
        f.said = true; f.e.watch = P; ui.say(f.who, f.line, f.dur); quiet = G.time + f.dur + 0.3;
        if (f.reply) { const rd = 1.4 + f.reply.length * 0.05; quiet += rd; d.wait(f.dur).then(() => { if (!G.talking) ui.say(ME, f.reply, rd); }, () => {}); } } });
      return stop;
    };
    const take = () => { P.controlEnabled = false; P.lock = null; P.calm = true; G.cinematic = true; ui.cinematic(true); ui.objective(''); L.marker(null); ui.hideDialogue(); };
    const give = () => { G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true; };

    // ---- the night
    ui.fade(1, 0); G.resetWorld({ site: 'front', sky: 'night', look: 'ranker', player: [...fr(2.6, -28.5), PI], corin: null }); G.carry = null; G.freezeAI = true; take();
    playMusic('wind', { cross: 3, fade: 3 }); preloadMusic('watch'); // (owner, Nov 2026) "Only the Wind Remains": the walk in to the corporal and his death; loops
    const corp = new Extra({ ...OFF, hair: 0x8a8680 }, ...fr(...loc(0, 0)), 0.4); corp.unbound = true; corp.play(C(0.1, [0, PZ.sit]), 0.01); // against the trough, facing the fire
    const boy = new Extra(BOY, ...fr(...loc(0.95, 0.25)), 0, { scale: BOY_SCALE, name: 'CORIN' }); boy.unbound = true; boy.face = boy.angleTo(corp); boy.play(C(0.1, [0, PZ.kneelBy]), 0.01);
    const sgt = new Extra(TYPES.sergeant.look, ...fr(...loc(-1.7, 2.5)), 0, { scale: TYPES.sergeant.scale }); sgt.face = sgt.angleTo(corp);
    let stop = company([["He's been asking for you. ...The sergeant says he won't see the morning.", 5, "Then I won't keep him waiting."], ["Go on. I'll keep you a place by the fire.", 3.5, 'Thanks.'], ["I got the beacon lit. It didn't do him any good.", 4, 'It did the rest of us.']]);
    cam.shot(fr3(-1.5, 2.4, -33.5), fr3(4.6, 1.0, -39.6)); cam.shot(fr3(-0.6, 2.0, -34.6), fr3(4.6, 1.0, -39.8), 8); ui.fade(0, 2.6); // the picket by firelight, from the dark
    await d.wait(4.2); give();
    ui.objective('Go to the corporal'); L.marker(...fr(...loc(0.1, 1.6)));
    await d.until(() => P.dist(corp) < 2.5 && G.time > quiet);
    stop(); await settled(d, 1); take();
    await stroll(d, ...fr(...loc(0.3, 2.0)), 1.8, 5); await turnTo(d, P, P.angleTo(corp), 0.4);
    const eye = (c, h = 1.45) => [c.pos.x, c.pos.y + h, c.pos.z], c3 = (a, n, y) => { const [x, z] = loc(a, n); return fr3(x, y, z); };
    cam.shot(c3(-2.9, 1.1, 1.0), c3(0.5, 0.7, 1.0)); cam.shot(c3(-2.6, 1.0, 0.95), c3(0.5, 0.7, 1.0), 9);
    await d.talk([
      ['Corporal', "There he is. ...Closer. I can't raise my voice any more."],
      ['Corin', "You're not to talk. The sergeant said."],
      ['Corporal', 'The sergeant says a lot of things.'],
      ['Corporal', 'I told you everyone under that rock was walking home, soldier. ...I was out by one.'],
      [ME, "Then I didn't hold it well enough."],
      ['Corporal', 'You held it fine. A javelin found me the day before you ever got there.'],
    ]);
    cam.shot(c3(1.7, 2.1, 1.0), eye(boy, 0.85)); cam.shot(c3(1.6, 1.9, 0.95), eye(boy, 0.85), 6); // the boy
    await d.talk([
      ['Corin', "Don't. Don't say it like it's done."],
      ['Corporal', "He's fourteen. He told the clerk sixteen and followed me out here, so I made him my runner. It kept him behind me."],
      ['Corporal', "After tonight there's nobody for him to stand behind."],
    ]);
    cam.shot(c3(0.3, 0.4, 0.9), eye(P, 1.5)); cam.shot(c3(0.3, 0.6, 0.95), eye(P, 1.55), 6); // from beside the corporal, up at him
    await d.talk([['Corporal', "You held that rock for people you'd never met. Hold it for one more."]]);
    await d.wait(1.0);
    await d.talk([[ME, "...I'll hold it."]]);
    cam.shot(c3(1.6, 1.9, 0.95), eye(boy, 0.85)); cam.shot(c3(1.5, 1.7, 0.9), eye(boy, 0.85), 6);
    await d.talk([['Corin', "I don't want him. I don't want anybody. I want you to get up."], ['Corporal', 'I know you do.']]);
    cam.shot(c3(-2.6, 1.0, 0.95), c3(0.5, 0.7, 1.0)); cam.shot(c3(-3.2, 1.3, 1.2), c3(0.5, 0.7, 1.1), 8);
    await d.talk([['Corporal', '...Sergeant. Write it down, while I can still hear you do it.'], ['Sergeant', "It's written, Corporal. Rest now."]]);
    await d.wait(0.8); ui.fade(1, 2.4); playMusic('watch', { cross: 2.4, fade: 3.5 }); await d.wait(3.0); // the night's music goes out with the light; "A Brother's Final Watch" comes in on the morning and loops while he looks for the boy

    // ---- the morning
    G.resetWorld({ site: 'front', sky: 'morning', look: 'ranker', player: [...fr(...loc(0.1, 2.0)), 0.4 + PI], corin: null }); G.freezeAI = true; take();
    const sg = new Extra(TYPES.sergeant.look, ...fr(...loc(-2.0, 1.4)), 0, { scale: TYPES.sergeant.scale }); sg.watch = P;
    // (owner, 16 Nov 2026: he should be some way off, and found.) Out past the stakes, at the top of the rise, looking north to the beacon.
    const K = [9.0, -12.0], kid = new Extra(BOY, ...fr(...K), 0.17, { scale: BOY_SCALE, name: 'CORIN' }); kid.lookP = -0.2; // chin up: he is looking at the beacon on its rock
    stop = company([["The boy went out past the stakes as soon as we'd buried him. Somebody ought to go after him. ...It shouldn't be me.", 6, "I'll go."], ['My father had a dog like you. Never made a sound, and nothing ever got near the sheep.', 5.5, 'Was that meant kindly?'], ['Three days at the rock he carried water to all of us, and never spilled any. ...Be patient with him.', 6, "I'll try."]]);
    cam.shot(c3(1.6, 2.2, 1.1), c3(0, 0.3, 0.5)); cam.shot(c3(1.2, 2.6, 1.3), c3(0, 0.3, 0.5), 7); ui.fade(0, 2.4); // where he sat: nobody
    await d.wait(3.0);
    cam.shot(c3(1.5, 1.5, 1.6), eye(sg, 1.4)); cam.shot(c3(1.3, 1.5, 1.55), eye(sg, 1.4), 6); /* past his shoulder, at the sergeant */ await turnTo(d, P, P.angleTo(sg), 0.5);
    await d.talk([
      ['Sergeant', "He went before the light came. We've put him under the palms."],
      ['Sergeant', "The boy's on your roll now. A squire, to a man the clerk couldn't put a name to."],
      [ME, "I don't need a squire."],
      ['Sergeant', "No. He needs a soldier, and you're the one his brother picked. You don't want him, and he doesn't want you. Out here that's as good a start as anybody gets."],
      ['Sergeant', "He went out past the stakes. Up the rise, I'd guess, where he can see the beacon. Go and find him."],
    ]);
    give(); ui.objective('Find Corin');
    { const t0 = G.time; let shown = false; const late = d.every(() => { if (!shown && G.time - t0 > 40) { shown = true; L.marker(...K.map((v, i) => v + (i ? FRONT.z : FRONT.x))); } }); // no marker at first: the sergeant has said where; it comes if he is still looking after a while
      await d.until(() => P.dist(kid) < 2.6 && G.time > quiet); late(); }
    stop(); await settled(d, 1); take(); await turnTo(d, P, P.angleTo(kid), 0.3);
    { const f = kid.face, sx = Math.sin(f), cz = Math.cos(f); cam.shot(fr3(K[0] + sx * 2.6 + cz * 1.5, 1.3, K[1] + cz * 2.6 - sx * 1.5), eye(kid, 1.0)); cam.shot(fr3(K[0] + sx * 2.4 + cz * 1.2, 1.25, K[1] + cz * 2.4 - sx * 1.2), eye(kid, 1.0), 9); } // from out in front of him: the boy, and the soldier behind his shoulder
    await d.wait(1.2);
    await d.talk([['Corin', "He said you'd keep me alive. He didn't say I had to like it."], [ME, "You don't have to."]]);
    await d.wait(0.9);
    await d.talk([['Corin', "...What do I call you? 'Yard hand'? That's what you told him."], [ME, "It's what I was."], ['Corin', "That's not a name."]]);
    await d.wait(1.4); kid.watch = P; kid.lookP = -0.12; // he turns round, at last (and has to look up at him)
    await d.talk([[ME, "It's the one I've got."], ['Corin', "Fine. Then I'll keep asking until you've got a better one."]]);
    await d.wait(0.8); ui.fade(1, 1.8); await d.wait(2.0);
  },
});

stage('intro', {
  async run(d) {
    ui.fade(1, 0); G.resetWorld({ player: [0.6, 12.5, PI], corin: [RING.x, RING.z - 1.5, 0, 'guard'], spar: true }); // behind a black screen: the camp, and the captain in his guard armour
    G.cinematic = true; ui.cinematic(true); cam.shot([7, 5, 27], [0, 1.6, 8]);
    G.player.controlEnabled = false; // nothing moves until the cards are read and Corin has spoken
    await d.chronicle('The Western Watch', [
      'He stayed with the Third Company through that season and the ones after it. In time they gave him the captain\'s red, because he was the one who kept people alive.',
      'The boy from the beacon grew into his squire, and into the one soldier in the company who would not leave him alone.',
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
    actOne(); forgetMusic(); preloadMusic('granite'); // the earlier tracks are no longer needed; the fighting's is on its way
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true; // talk() holds him still, then hands control back
    await d.talk([
      ['Corin', 'Captain! You promised me one lesson before the night watch.'],
      ['Corin', "I've been drilling the guard you showed me. Try to get through it."],
    ]);
    // (Owner, Nov 2026: no tips here for moving, locking on or striking. The prologue has taught them.)
    await lesson("Strike Corin's shield", '', 'blocked', 3, 'guard');
    await d.talk([['Corin', 'Ha! Not a scratch on me. My turn.']]);
    await lesson("Block Corin's swings", '', 'playerBlocked', 2, 'attack');
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
    G.spar = false; G.shake = 0.12; ui.banner('A war horn sounds from the dunes', 2.6); SFX.horn(); playMusic('granite', { cross: 1.5, fade: 2.5 });
    await d.wait(2.8);
  },
});

stage('raid', {
  checkpoint: true,
  setup() { G.resetWorld({ player: [0.6, 8, 0], corin: [-1.4, 8.4, 0, 'battle'] }); cam.behind(); ui.fade(0, 0.6); },
  async run(d) {
    const C = G.corin; G.spar = false; G.maxAtk = 1; actOne(true);
    await d.talk([['Corin', 'Raiders at the breach!'], ['Captain', 'Corin. Guard my right side.'], ['Corin', 'Always, Captain.']]);
    C.setMode('battle'); ui.objective('Drive back the raiders'); // (no lock-on tip any more: the prologue teaches it)
    for (let i = 0; i < 3; i++) G.spawn('raider', ...breach());
    await glance(d, 0, 27);
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
    const P = G.player; G.maxAtk = 2; P.hp = 100; actOne(true);
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
    const P = G.player, C = G.corin; ui.objective(''); actOne(true);
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
    const P = G.player; G.cinematic = true; ui.cinematic(true); P.controlEnabled = false; P.lock = null; G.boss = null; actOne(); // the fighting is over: the camp's quiet music again
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
