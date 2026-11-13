import * as T from 'three';
import { G } from '../core/game.js';
import { SFX } from '../core/audio.js';
import { PI, rnd, lerp } from '../core/util.js';
import { ui } from '../ui/hud.js';
import { cam } from '../world/camera.js';
import { MOUTH, RING } from '../world/level.js';
import { FX, shock } from '../gfx/fx.js';
import { coarse } from '../core/input.js';
import { makeStretchers } from './stretchers.js';

// The night raid, as a list of stages. A stage's run() is its script. setup() puts
// the world in the state the stage expects and is only used when starting there
// (first load, or retrying from a checkpoint).
export const STAGES = [];
const stage = (name, o) => STAGES.push({ name, ...o });
const TAP = coarse ? 'TAP TO CONTINUE' : 'CLICK OR PRESS SPACE';
const NAME = '<span class="strike">&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;</span>';
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

stage('intro', {
  setup() { G.resetWorld({ player: [0.6, 12.5, PI], corin: [RING.x, RING.z - 1.5, 0, 'guard'], spar: true }); },
  async run(d) {
    G.cinematic = true; ui.cinematic(true); ui.fade(1, 0); cam.shot([7, 5, 27], [0, 1.6, 8]);
    G.player.controlEnabled = false; // nothing moves until the cards are read and Corin has spoken
    await d.chronicle('From the Register of the Western Watch', [
      '<em>Some names are cut into stone. Others are cut out of it.</em>',
      'The Usurper could not be killed. So the wardens sealed him alive behind the Glass Door, under the ruins at the edge of the desert.',
      'That was three years ago. Every season since, his Witches have come out of the dunes to break the Door and bring him back.',
      `One company of the Royal Guard stands in their way: the Third, under Captain ${NAME}, of the forest.`,
      '<em>What follows was never entered in the Register.</em>',
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
    ui.hint("Stay close to the Narrows. The stretchers can't move without cover."); let hintT = 6;
    const stop = d.every((dt) => {
      const far = Math.hypot(P.pos.x - MOUTH.x, P.pos.z - MOUTH.z) > 11;
      if (!far && !P.dead) H.progress = Math.min(1, H.progress + dt / 75);
      SX.update(H.progress, G.paused ? 0 : dt);
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
    const V = G.spawn('vessa', vx, vz); G.boss = V; V.face = V.angleTo(P);
    cam.shot([1.6, 1.8, MOUTH.z + 7.5], [vx, 2.0, vz], 3.2);
    await d.wait(1.6);
    await d.talk([
      ['Vessa', 'The quiet captain from the forest.'],
      ['Vessa', 'You hold a door for people who will never learn your name.'],
      ['Vessa', 'Step aside, and I will let you live long enough to be forgotten.'],
    ]);
    G.cinematic = false; ui.cinematic(false); cam.behind(); P.controlEnabled = true; G.freezeAI = false; G.maxAtk = 1; V.cd = 1.2;
    ui.objective("Defeat Vessa, the Witches' Hand"); ui.hint('Her glaive outreaches you. Parry it, or roll through and punish the recovery.');
    const t = d.every(() => { if (!V.phase2 && V.hp < V.maxHp * 0.5 && !V.dead) { V.phase2 = true; V.flash = 1; SFX.flame(); shock(V.pos, 3.4, 0xc79bff); ui.banner('SHE STOPS HOLDING BACK', 2); } });
    await d.wait(7); ui.hint('');
    await d.until(() => V.dead);
    t(); G.slow = 1.2; G.shake = 0.5; ui.objective('');
    FX.sparks.emit(new T.Vector3(V.pos.x, 1.2, V.pos.z), 120, 8, 0xb46cff, 1.4, { grav: -1, boost: 2 });
    await d.wait(1.6);
    await d.talk([['Vessa', 'They will never... sing of this.']]);
    await d.wait(1.2);
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
      "The Witches' Hand fell at the mouth of the pass, to a blade of the Third Company.",
      `Credited: Captain ${NAME}.`,
      "<em>By order of the Crown, the Third Company's part in the Sealing is not to be recorded.</em>",
      'End of the first night. More to come.',
    ], TAP);
    location.reload();
  },
});
