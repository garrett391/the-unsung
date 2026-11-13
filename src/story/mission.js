import * as T from 'three';
import { G } from '../core/game.js';
import { SFX, stopMusic } from '../core/audio.js';
import { PI, rnd, lerp } from '../core/util.js';
import { ui } from '../ui/hud.js';
import { cam } from '../world/camera.js';
import { MOUTH, RING } from '../world/level.js';
import { FX, shock } from '../gfx/fx.js';
import { coarse } from '../core/input.js';
import { makeStretchers } from './stretchers.js';
import { CL } from '../actors/anim.js';

// The campaign, as a list of stages: the prologue at the Glass Door, then the first night
// at the ruins (Act I). Stage names are what saves store, so don't rename a checkpoint. A stage's run() is its script. setup() puts
// the world in the state the stage expects and is only used when starting there
// (first load, or retrying from a checkpoint).
export const STAGES = [];
const stage = (name, o) => STAGES.push({ name, ...o });
const TAP = coarse ? 'TAP TO CONTINUE' : 'CLICK OR PRESS SPACE';
const live = () => G.enemies.filter((e) => !e.dead).length;
const breach = () => [rnd(-2.6, 2.6), rnd(29, 36)]; // out on the raiders' road, beyond the wall
const east = () => [rnd(22, 26), rnd(-4, -2)];
// Turn the camera to something the player needs to know about (a wave coming in, where to go),
// hold on it for a moment, then hand it back. The captain can't act or be hurt meanwhile.
async function glance(d, x, z, o = {}) {
  const P = G.player, was = P.controlEnabled, dx = P.pos.x - x, dz = P.pos.z - z, l = Math.hypot(dx, dz) || 1, back = Math.min(o.back || 9, l * 0.8);
  const p0 = cam.pos.toArray(), l0 = cam.look.toArray();
  P.controlEnabled = false; P.inv = Math.max(P.inv, 3.8); G.cinematic = true; ui.cinematic(true);
  cam.shot([x + (dx / l) * back - (dz / l) * 2.2, o.h || 3.2, z + (dz / l) * back + (dx / l) * 2.2], [x, o.y || 1.3, z], 0.9);
  await d.wait(o.hold || 1.9);
  cam.shot(p0, l0, 0.6); await d.wait(0.6);
  cam.release(); G.cinematic = false; ui.cinematic(false); P.controlEnabled = was; P.buf.a = '';
}

// Prologue: the climax nobody saw. The Glass Door dressing turns the end of the Narrows into
// the vault. It opens on the end of the fight with one card of footing, no hints and nothing else explained
// (owner's note: don't spell the theme out, don't sneak a tutorial in): the Usurper is already
// beaten (TYPES.usurper), and all that is left is to put him behind the glass.
const VAULT = -14.5; // the captain can't back out of the vault: its wall is at the canyon mouth
stage('door', {
  checkpoint: true,
  setup() { G.resetWorld({ player: [0, -17, PI], corin: null, gate: 'door' }); },
  async run(d) {
    const P = G.player; G.cinematic = true; ui.cinematic(true); ui.fade(1, 0); P.controlEnabled = false; G.freezeAI = true; G.maxAtk = 1;
    const U = G.spawn('usurper', 0.3, -23.2, { spare: true }); U.face = 0; U.hp = U.maxHp * 0.36; // most of the fight is behind them
    if (!G.seenDoor) { G.seenDoor = true; await d.chronicle('Prologue', ['Before the war, the Usurper tried to take the realm.'], TAP); ui.chronClose(); } // one line of footing, once; not again on a retry
    cam.shot([-1.1, 1.25, -21.6], [0.3, 1.75, -23.2]); // on him first: bent over, breathing hard, the Door at his back
    await d.wait(0.5); ui.fade(0, 2.2); cam.shot([1.6, 1.9, -18.4], [0.1, 1.7, -23.4], 4.2);
    await d.wait(4);
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true; G.freezeAI = false; G.boss = U; U.cd = 2.4;
    const keep = d.every(() => { if (P.pos.z > VAULT) P.pos.z = VAULT; if (U.pos.z > VAULT + 1) U.pos.z = VAULT + 1; });
    await d.until(() => U.hp <= 1);
    // the sealing
    keep(); P.controlEnabled = false; P.lock = null; G.freezeAI = true; G.cinematic = true; ui.cinematic(true);
    U.stagDur = 99; U.open = false; U.set('stagger'); U.play(CL.stun, 0.08); U.vel.set(0, 0, 0); U.trailOn = false; U.yoff = 0; G.slow = 1.0; G.shake = 0.4;
    cam.shot([P.pos.x * 0.5 + 1.9, 1.7, Math.min(-19, U.pos.z + 5)], [0, 2.4, -27.6], 1.1);
    const x0 = U.pos.x, z0 = U.pos.z; U.face = 0;
    await d.tween(1.5, (u) => { U.pos.x = lerp(x0, 0, u); U.pos.z = lerp(z0, -26.2, u * u); });
    const at = new T.Vector3(0, 2.6, -27.2);
    SFX.flame(); SFX.boom(); G.shake = 0.7; G.level.flare = 1; shock(new T.Vector3(0, 0, -26.4), 4.5, 0x9ff0e0);
    FX.sparks.emit(at, 140, 8, 0x9ff0e0, 1.4, { grav: -1, spread: 1.2, boost: 2 });
    U.gone = true; G.boss = null;
    cam.shot([0.6, 1.6, -20.5], [0, 3.1, -27.8], 4);
    await d.wait(2.2);
    await d.talk([['The Usurper', 'Only you will remember this.']]);
    await d.wait(0.8); ui.fade(1, 1.6); await d.wait(1.8);
  },
});

// The years between, as cards. The waystation fight and the muster are to become playable
// (docs/story.md, prologue 4 and 5); until then they are told here.
stage('road', {
  async run(d) {
    G.resetWorld({ player: [0.6, 12.5, PI], corin: [RING.x, RING.z - 1.5, 0, 'guard'], spar: true }); // behind a black screen: the camp, ready for the intro
    G.cinematic = true; ui.cinematic(true); ui.fade(1, 0); G.player.controlEnabled = false; G.freezeAI = false;
    await d.chronicle('The road', [
      'He walked out into a world where nothing had happened.',
      'A caravan passed him on the road. No one looked twice.',
      'For years he took labouring work where he found it. He could not settle, and he did not fit.',
      "Then raiders came out of the desert and hit the waystation where he worked. He took up a fallen guard's sword.",
      'A guard officer saw what he did, and brought him to the muster. The clerk asked his name.',
      '<em>"Write whatever you like."</em>',
      'They sent him to the worst posting on the frontier.',
    ], TAP);
    ui.chronClose();
  },
});

stage('intro', {
  setup() { G.resetWorld({ player: [0.6, 12.5, PI], corin: [RING.x, RING.z - 1.5, 0, 'guard'], spar: true }); },
  async run(d) {
    G.cinematic = true; ui.cinematic(true); ui.fade(1, 0); cam.shot([7, 5, 27], [0, 1.6, 8]);
    G.player.controlEnabled = false; // nothing moves until the cards are read and Corin has spoken
    await d.chronicle('Act I: The Western Watch', [
      'He served on the frontier with the Third Company, and rose to captain, because he was the one who kept people alive.',
      'They gave him a squire, Corin, who would not leave him alone.',
      'The raids out of the dunes had been scattered and easily driven off. Lately they came organised.',
      '<em>The first night at the ruins.</em>',
    ], TAP);
    ui.chronClose(); ui.fade(0, 1.8); cam.shot([2.6, 3.2, 17.5], [0, 1.4, 8], 3.6);
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
    stopMusic(18); // the title theme carries through the cards and dies away as the lesson begins
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
    const C = G.corin; G.spar = false; G.maxAtk = 1;
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
    const P = G.player; G.maxAtk = 2; P.hp = 100;
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
    const P = G.player, C = G.corin; ui.objective('');
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
