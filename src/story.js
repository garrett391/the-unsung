import * as THREE from 'three';
import { poseStance, poseSlash, poseKneel, poseLie, poseHurt, poseSheathed, poseDraw, poseLocomotion, poseCrouch, resetPose } from './rig.js';
import { angleTo, lerp, smooth, easeOut, rand } from './util.js';

// ---------------------------------------------------------------------------
// Director: awaitable conditions, timers and tweens driven by the game loop.
// ---------------------------------------------------------------------------
export class Director {
  constructor(game) {
    this.game = game;
    this.waiters = [];
    this.tweens = [];
  }
  until(fn) { return new Promise((res, rej) => this.waiters.push({ fn, res, rej })); }
  wait(sec) {
    const end = this.game.clock + sec;
    return this.until(() => this.game.clock >= end);
  }
  later(sec, fn) { this.wait(sec).then(fn).catch(() => {}); }
  tween(dur, fn, scaled = true) {
    return new Promise((res, rej) => this.tweens.push({ t: 0, dur, fn, scaled, res, rej }));
  }
  update() {
    if (!this.waiters.length) return;
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) {
      let ok = false;
      try { ok = w.fn(); } catch (e) { w.rej(e); continue; }
      if (ok) w.res(); else this.waiters.push(w);
    }
  }
  updateTweens(sdt, rdt) {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (!tw) continue;
      tw.t += tw.scaled ? sdt : rdt;
      const u = Math.min(1, tw.t / tw.dur);
      try { tw.fn(u); } catch (e) { console.error(e); }
      if (u >= 1) {
        const k = this.tweens.indexOf(tw);
        if (k >= 0) this.tweens.splice(k, 1);
        tw.res();
      }
    }
  }
  abort(reason) {
    const ws = this.waiters, ts = this.tweens;
    this.waiters = [];
    this.tweens = [];
    for (const w of ws) w.rej(reason);
    for (const t of ts) t.rej(reason);
  }
  async talk(lines) {
    const g = this.game;
    for (const [who, text] of lines) {
      g.ui.showLine(who, text, 'who-' + (who || 'none').toLowerCase().replace(/[^a-z]/g, ''));
      g.audio.blip();
      if (g.autoAdvance) { await this.wait(0.04); continue; }
      await this.until(() => {
        if (g.autoAdvance) return true;
        if (!g.confirmTap) return false;
        g.confirmTap = false;
        if (!g.ui.lineComplete()) { g.ui.completeLine(); return false; }
        return true;
      });
    }
    g.ui.hideDialogue();
  }
  async chronicle(head, lines, opts = {}) {
    const g = this.game;
    g.ui.chronicleOpen(head);
    for (const html of lines) {
      const p = g.ui.chronicleLine(html);
      const red = p.querySelector('.redact:not(.struck)');
      if (red) {
        await this.wait(g.autoAdvance ? 0.05 : 1.5);
        red.classList.add('struck');
        g.audio.noise(0.5, { filter: 'bandpass', ff: 900, q: 0.6, vol: 0.12 });
      }
      if (g.autoAdvance) { await this.wait(0.04); continue; }
      await this.wait(0.3);
      g.confirmTap = false;
      await this.until(() => { if (g.confirmTap) { g.confirmTap = false; return true; } return false; });
    }
    if (!opts.keepOpen) g.ui.chronicleClose();
  }
  async cards(list) {
    const g = this.game;
    for (const text of list) {
      g.ui.card(text);
      const end = g.clock + (g.autoAdvance ? 0.05 : 5.5);
      await this.wait(g.autoAdvance ? 0.01 : 0.8);
      g.confirmTap = false;
      await this.until(() => g.clock > end || (g.confirmTap && !(g.confirmTap = false)));
      g.ui.card(null);
      await this.wait(g.autoAdvance ? 0.01 : 0.7);
    }
  }
}

const ALL4 = ['bash', 'backslice', 'helm', 'greatspin'];
// where Corin's body lies: feet at C.pos, head along -facing
const body = (C) => {
  const dx = -Math.sin(C.facing), dz = -Math.cos(C.facing);
  return { tx: C.pos.x + dx * 0.9, tz: C.pos.z + dz * 0.9, hx: C.pos.x + dx * 1.75, hz: C.pos.z + dz * 1.75 };
};
const KNOWN3 = ['bash', 'backslice', 'helm'];

// ---------------------------------------------------------------------------
// Stages. Checkpoint stages can be rebuilt from scratch by setup().
// ---------------------------------------------------------------------------
export const STAGES = [];
const stage = (name, o) => STAGES.push({ name, ...o });

stage('intro', {
  setup(g) {
    g.resetWorld({ player: [0.6, 11.5, Math.PI], corin: [0, 2.6, 0, 'spar-guard'], soldiers: true, music: 'camp' });
  },
  async run(g, d) {
    g.setCinematic(true);
    g.cam.shot([5.5, 4.2, 21], [0, 1.6, 4], 0);
    g.ui.fade(1, 0);
    await d.wait(0.3);
    await d.chronicle('Register of the Western Watch', [
      '<em>He saved Hyrule twice. Nobody remembers either time.</em>',
      'Third year of the Sealing. The traitor Ganondorf survived his own execution, and the sages sealed him beyond the Mirror in the desert ruins.',
      'His loyalists, led by the witches Twinrova, raid out of the dunes to set him free.',
      'Holding the Mirror: the Third Company of the Royal Guard, under Captain <span class="redact struck">Link</span>, of the forest.',
    ]);
    g.ui.fade(0, 1.6);
    g.cam.shot([2.4, 3.3, 16.2], [0, 1.4, 5.5], 3.4);
    await d.wait(2.6);
  },
});

stage('tutorial', {
  checkpoint: true,
  setup(g) {
    g.resetWorld({ player: [0.6, 11.5, Math.PI], corin: [0, 2.6, 0, 'spar-guard'], soldiers: true, music: 'camp' });
    g.cam.snapBehind();
  },
  async run(g, d) {
    const P = g.player, C = g.corin;
    g.sparring = true;
    g.ui.fade(0, 0.8);
    g.setCinematic(false);
    P.controlEnabled = false;
    await d.talk([
      ['Corin', 'Captain! You promised me one lesson before the night watch.'],
      ['Corin', "I've been drilling the guard you showed me. Try to get through it."],
    ]);
    g.cam.release();
    P.controlEnabled = true;
    g.ui.objective('Spar with Corin in the ring');
    g.ui.hint('Move {move}, then lock on to Corin with {lock}');
    await d.until(() => P.lock === C);

    let n = 0;
    g.onStage('spar', (e) => {
      if (e.kind === 'blocked' && n < 3) { n++; g.ui.objective(`Strike Corin's shield (${n}/3)`); }
    });
    g.ui.objective("Strike Corin's shield (0/3)");
    g.ui.hint('Sword: {attack}');
    await d.until(() => n >= 3);
    g.ui.hint('');
    await d.wait(0.5);
    await d.talk([['Corin', 'Ha! Not a scratch on me. My turn.']]);

    C.mode = 'spar-attack';
    C.sparT = 1.0;
    let b = 0;
    g.onStage('spar', (e) => {
      if (e.kind === 'playerBlocked' && b < 2) { b++; g.ui.objective(`Block Corin's swings (${b}/2)`); }
      if (e.kind === 'playerHit') g.say('Corin', 'Shield up, Captain!', 1.6);
    });
    g.ui.objective("Block Corin's swings (0/2)");
    g.ui.hint('Hold {shield} to raise your shield');
    await d.until(() => b >= 2);
    C.mode = 'spar-guard';
    g.ui.hint('');
    await d.wait(0.6);
    await d.talk([
      ['Corin', 'So how do you get through a guard like mine?'],
      ['Link', "You don't go around a shield. You go through it."],
    ]);
    g.learn('bash');
    C.mode = 'spar-bash';
    let bash = 0;
    g.onStage('spar', (e) => { if (e.kind === 'bash') bash++; });
    g.ui.objective('Shield Attack Corin');
    g.ui.hint('Hold {shield}, then press {attack}');
    await d.until(() => bash >= 1);
    await d.wait(1.0);
    g.ui.hint('');
    await d.talk([
      ['Corin', 'Oof. All right, all right.'],
      ['Corin', "But a real shield wall won't stand still for that."],
      ['Link', "Then don't stand where they're looking."],
    ]);
    g.learn('backslice');
    C.mode = 'spar-back';
    let bs = 0;
    g.onStage('spar', (e) => { if (e.kind === 'backslice') bs++; });
    g.ui.objective('Back Slice Corin');
    g.ui.hint('Lock on {lock}, roll sideways ({side} + {roll}), then {attack} as you land');
    await d.until(() => bs >= 1);
    await d.wait(0.8);
    g.ui.hint('');
    await d.talk([
      ['Corin', 'Where did you even go?'],
      ['Link', 'One more. Break the guard, then go over it.'],
    ]);
    g.learn('helm');
    C.mode = 'spar-helm';
    let hs = 0;
    g.onStage('spar', (e) => { if (e.kind === 'helm') hs++; });
    g.ui.objective('Helm Splitter Corin');
    g.ui.hint('Locked on: Shield Attack ({shield} + {attack}), then {roll} while he reels');
    await d.until(() => hs >= 1);
    await d.wait(1.0);
    g.ui.hint('');
    g.ui.objective('');
    P.controlEnabled = false;
    P.lock = null;
    C.mode = 'idle';
    C.facing = C.angleTo(P);
    await d.talk([
      ['Corin', '...Captain. Where did you learn all this?'],
      ['Link', "A long time ago. Somewhere that isn't there anymore."],
      ['Corin', 'Then teach me the Mortal Draw next. The one where you never draw until they strike.'],
      ['Link', 'Not that one.'],
      ['Corin', 'Why not?'],
      ['Link', 'The draw is the easy part. Surviving the moment after is the skill.'],
      ['Corin', 'Then teach me that part.'],
      ['Link', 'Tomorrow.'],
    ]);
    g.sparring = false;
    g.audio.horn();
    g.cam.shake(0.08, 2.6);
    g.say('', 'A war horn sounds from the dunes.', 2.6);
    await d.wait(2.6);
  },
});

stage('raid', {
  checkpoint: true,
  setup(g) {
    g.resetWorld({ player: [0, 2.6, 0], corin: [-1.8, 2.9, 0, 'battle'], soldiers: false, music: 'battle', skills: KNOWN3 });
    g.cam.snapBehind();
  },
  async run(g, d) {
    const P = g.player, C = g.corin;
    g.sparring = false;
    g.ui.fade(0, 0.5);
    g.setCinematic(false);
    g.campSoldiers(false);
    g.audio.setMusic('battle');
    P.controlEnabled = false;
    P.lock = null;
    const m = g.addExtra(8, 17, Math.PI);
    m.moveTo(1.6, 6.5, 6.5);
    await d.until(() => !m.goal);
    await d.talk([
      ['Soldier', 'Raiders on the dunes! They are coming for the ruins!'],
      ['Link', 'Corin. Guard my right side.'],
      ['Corin', 'Always, Captain.'],
    ]);
    m.moveTo(-15, 7, 6.5);
    C.mode = 'battle';
    P.controlEnabled = true;
    g.ui.objective('Drive back the raiders');
    g.ui.hint('Lock on {lock} to keep a raider in front of you');
    g.spawn('raider', -5, 25, { entering: true });
    g.spawn('raider', 0, 27, { entering: true });
    g.spawn('raider', 5, 25.5, { entering: true });
    d.later(6, () => { if (g.stageIndex === STAGES.indexOf(RAID)) g.ui.hint(''); });
    await d.wait(1);
    await d.until(() => g.liveEnemies() === 0);
    g.removeExtra(m);
    g.ui.hint('');
    await d.wait(0.6);
    await d.talk([['Corin', 'Bronze shields, coming through the gap!']]);
    g.ui.hint('Shields block from the front. Back Slice past them, or Shield Attack, then Helm Splitter.');
    g.spawn('shield', 0, 26, { entering: true });
    g.spawn('raider', -6, 25, { entering: true });
    g.spawn('raider', 6, 26.5, { entering: true });
    await d.wait(1);
    await d.until(() => g.liveEnemies() === 0);
    g.ui.hint('');
  },
});
const RAID = STAGES[STAGES.length - 1];

stage('fallback', {
  setup(g) {
    g.resetWorld({ player: [0, 2.6, 0], corin: [-1.8, 2.9, 0, 'battle'], soldiers: false, music: 'battle', skills: KNOWN3 });
    g.cam.snapBehind();
    g.ui.fade(0, 0.4);
  },
  async run(g, d) {
    const P = g.player;
    const m = g.addExtra(-15, 5, Math.PI / 2);
    m.moveTo(P.pos.x - 2.4, P.pos.z + 1.2, 7);
    await d.until(() => !m.goal);
    P.controlEnabled = false;
    P.lock = null;
    await d.talk([
      ['Soldier', 'Captain! A second column broke through the east wall. We cannot hold the camp.'],
      ['Soldier', 'And the wounded are still out here.'],
      ['Link', 'Carry them through the Narrows to the sanctum. I will hold the mouth.'],
      ['Corin', 'We will hold it.'],
    ]);
    m.moveTo(-1.2, -16, 7);
    P.controlEnabled = true;
    g.ui.objective('Get to the mouth of the Narrows');
    g.marker(0, -10.4);
    await d.until(() => Math.hypot(P.pos.x, P.pos.z + 10.4) < 2.4);
    g.marker(null);
    g.removeExtra(m);
  },
});

stage('hold', {
  checkpoint: true,
  setup(g) {
    g.resetWorld({ player: [0, -10.2, 0], corin: [-1.8, -10.0, 0, 'battle'], soldiers: false, music: 'battle', skills: KNOWN3 });
    g.cam.snapBehind();
  },
  async run(g, d) {
    const P = g.player;
    g.ui.fade(0, 0.5);
    g.setCinematic(false);
    g.corin.mode = 'battle';
    P.controlEnabled = true;
    P.hp = P.maxHp;
    if (!P.skills.has('greatspin')) g.learn('greatspin');
    g.startHold(0);
    g.spawn('raider', -6, 8);
    g.spawn('raider', 5, 10);
    g.ui.objective('Hold the mouth of the Narrows');
    g.ui.hint("Stay close to the Narrows. The stretchers can't move without cover.");
    d.later(6, () => { if (!g.hold.far) g.ui.hint(''); });
    await d.until(() => g.hold.progress >= 0.55);
  },
});

stage('corinFalls', {
  setup(g) {
    g.resetWorld({ player: [0, -10.2, 0], corin: [-1.8, -10.0, 0, 'battle'], soldiers: false, music: 'battle', skills: ALL4 });
    g.startHold(0.55);
    g.cam.snapBehind();
    g.ui.fade(0, 0.3);
  },
  async run(g, d) {
    const P = g.player, C = g.corin;
    g.hold.paused = true;
    g.freezeAI = true;
    P.controlEnabled = false;
    P.lock = null;
    g.setCinematic(true);
    // clear the shot
    for (const e of g.enemies) if (e.alive && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < 6) e.setVisible(false);
    g.tokens.clear();
    P.setState('script');
    P.vel.set(0, 0, 0);
    P.y = 0;
    P.pos.set(0.2, 0, -9.4);
    P.facing = 0.1;
    let fight = 0;
    P.scriptPose = (r) => { fight += 0.016; poseSlash(r, fight % 2 < 1 ? 'h1' : 'h2', fight % 1); };
    C.setState('script');
    C.pos.set(-1.7, 0, -8.6);
    C.facing = 0.3;
    C.scriptPose = (r) => { poseStance(r, 1, 0.6); };
    const L = g.spawn('raider', -7.0, -10.8, {});
    L.setState('script');
    L.facing = angleTo(L.pos.x, L.pos.z, P.pos.x, P.pos.z);
    const S = g.spawn('raider', -3.4, -3.6, {});
    S.setState('script');
    S.facing = angleTo(S.pos.x, S.pos.z, C.pos.x, C.pos.z);
    let ph = 0;
    const run = (r) => { ph += 0.3; poseStance(r, 1, 0); poseLocomotion(r, ph, 1, true); };
    L.scriptPose = run;

    // Shot A: the leaper comes along the cliff toward the captain's back
    g.cam.shot([3.2, 2.4, -4.0], [-2.6, 1.1, -9.6], 0);
    const l0 = L.pos.clone(), l1 = new THREE.Vector3(-2.9, 0, -9.9);
    g.say('Corin', 'Captain, your right!', 2.2);
    d.tween(0.55, (u) => { C.facing = lerp(0.3, -1.45, smooth(u)); C.scriptPose = (r) => poseSheathed(r, smooth(u)); });
    await d.tween(1.0, (u) => { L.pos.lerpVectors(l0, l1, u); });
    // Slow motion: the leap and the draw
    g.timeScale = 0.28;
    g.cam.shot([0.2, 1.1, -6.4], [-2.4, 1.3, -9.3], 0.9);
    L.scriptPose = (r) => { poseStance(r, 1, 0); poseSlash(r, 'v', 0.28); poseCrouch(r, 0.3); };
    const j0 = L.pos.clone(), j1 = new THREE.Vector3(-1.3, 0, -9.5);
    let drawn = false;
    await d.tween(0.55, (u) => {
      L.pos.lerpVectors(j0, j1, u);
      L.y = Math.sin(Math.PI * u) * 1.3;
      if (u > 0.42 && !drawn) {
        drawn = true;
        g.audio.draw();
        d.tween(0.16, (k) => { C.scriptPose = (r) => poseDraw(r, k); }).catch(() => {});
      }
    });
    L.y = 0;
    L.scriptPose = null;
    L.flash(0.2);
    g.fx.sparks(L.pos.x, 1.4, L.pos.z, 18, 0xffffff);
    g.audio.hit(0);
    L.die();
    g.timeScale = 1;
    g.ui.flash('rgba(255,255,255,0.6)', 0.4);
    await d.wait(0.7);
    // the moment after
    g.cam.shot([1.0, 1.7, -5.2], [-1.9, 1.0, -8.4], 0);
    S.scriptPose = run;
    const s0 = S.pos.clone(), s1 = new THREE.Vector3(C.pos.x - 0.2, 0, C.pos.z + 1.05);
    await d.tween(0.6, (u) => { S.pos.lerpVectors(s0, s1, u); S.facing = angleTo(S.pos.x, S.pos.z, C.pos.x, C.pos.z); });
    d.tween(0.3, (u) => { S.scriptPose = (r) => poseSlash(r, 'thrust', 0.3 + 0.22 * u); }).catch(() => {});
    await d.wait(0.14);
    g.audio.hit(-0.3, 1.3);
    g.fx.hitBurst(C.pos.x, 1.1, C.pos.z);
    C.flash(0.3);
    g.cam.shake(0.18, 0.3);
    await d.tween(0.5, (u) => { C.scriptPose = (r) => { poseDraw(r, 1 - u * 0.3); poseHurt(r, u); }; });
    // the captain turns and cuts the raider down
    fight = 0;
    const p0 = P.pos.clone(), p1 = new THREE.Vector3(S.pos.x + 1.1, 0, S.pos.z + 0.4);
    P.facing = angleTo(P.pos.x, P.pos.z, S.pos.x, S.pos.z);
    P.scriptPose = (r) => { poseStance(r, 1, 0); poseLocomotion(r, (fight += 0.35), 1, true); };
    await d.tween(0.3, (u) => { P.pos.lerpVectors(p0, p1, u); P.facing = angleTo(P.pos.x, P.pos.z, S.pos.x, S.pos.z); });
    g.audio.swing(0, 1.3);
    await d.tween(0.34, (u) => { P.scriptPose = (r) => poseSlash(r, 'h1', u); if (u > 0.45 && S.alive) { S.scriptPose = null; S.flash(0.2); g.audio.hit(0); S.die(); } });
    await d.tween(0.6, (u) => { C.scriptPose = (r) => poseKneel(r, smooth(u), 0.5); });
    await d.tween(0.5, (u) => { C.scriptPose = (r) => { poseLie(r, smooth(u)); }; });
    C.scriptPose = null;
    C.setState('dead');
    C.dead = true;
    C.solid = false;
    // the captain kneels beside him
    const B = body(C);
    const k0 = P.pos.clone(), k1 = new THREE.Vector3(B.tx, 0, B.tz - 0.9);
    P.scriptPose = (r) => { poseStance(r, 1, 0); poseLocomotion(r, (fight += 0.25), 0.7, true); };
    await d.tween(0.6, (u) => { P.pos.lerpVectors(k0, k1, u); P.facing = angleTo(P.pos.x, P.pos.z, B.tx, B.tz); });
    await d.tween(0.5, (u) => { P.scriptPose = (r) => { poseKneel(r, smooth(u), 0.45); r.shS.rotation.set(-0.3, 0, 0.3 * r.side); }; });
    g.audio.setMusic('grief');
    g.cam.shot([B.tx + 2.0, 1.3, B.tz + 2.4], [B.tx, 0.5, B.tz - 0.3], 0);
    g.cam.shot([B.tx + 1.5, 1.05, B.tz + 1.8], [B.tx, 0.45, B.tz - 0.3], 7);
    await d.wait(1.0);
    await d.talk([
      ['Corin', 'Captain... did I draw it right?'],
      ['Link', 'You did.'],
      ['Corin', 'Then tomorrow... you teach me the rest.'],
    ]);
    await d.wait(1.6);
    await d.tween(0.6, (u) => { P.scriptPose = (r) => { poseKneel(r, 1 - smooth(u), 0.45); poseStance(r, u, 0); }; });
    P.scriptPose = null;
    P.setState('idle');
    P.facing = 0;
    for (const e of g.enemies) e.setVisible(e.alive || !e.dissolved);
    g.cam.snapBehind();
    g.setCinematic(false);
  },
});

stage('hold2', {
  checkpoint: true,
  setup(g) {
    g.resetWorld({ player: [0, -10.2, 0], corin: 'dead', soldiers: false, music: 'grief', skills: ALL4 });
    g.startHold(0.55);
    g.cam.snapBehind();
  },
  async run(g, d) {
    const P = g.player;
    g.ui.fade(0, 0.5);
    g.setCinematic(false);
    g.audio.setMusic('grief');
    g.freezeAI = false;
    g.hold.paused = false;
    P.controlEnabled = true;
    g.ui.objective('Hold the mouth of the Narrows');
    await d.until(() => g.hold.progress >= 1);
    g.stopHold();
  },
});

stage('vessa', {
  checkpoint: true,
  setup(g) {
    g.resetWorld({ player: [0, -10.2, 0], corin: 'dead', soldiers: false, music: 'boss', skills: ALL4 });
    g.cam.snapBehind();
  },
  async run(g, d) {
    const P = g.player;
    g.ui.fade(0, 0.5);
    for (const e of g.enemies) if (e.alive) { e.setState('flee'); g.releaseToken(e); }
    P.controlEnabled = false;
    P.lock = null;
    let V;
    if (!g.flags.vessaMet) {
      g.setCinematic(true);
      await d.talk([['Soldier', 'The last stretcher is through! Captain, fall back!']]);
      g.audio.flameBurst(0);
      g.cam.shot([2.6, 2.2, -7.2], [0, 1.8, 2.5], 0);
      for (let i = 0; i < 40; i++) g.fx.flame(rand(-1, 1), rand(0, 2.4), 2.5 + rand(-1, 1));
      g.fx.burst(0, 0.5, 2.5, 30, 0xb46cff, 5);
      V = g.spawnVessa(0, 2.5);
      g.cam.shot([1.6, 1.9, -4.4], [0, 2.0, 2.5], 3.5);
      await d.wait(1.4);
      g.audio.setMusic('boss');
      await d.talk([
        ['Vessa', 'The quiet captain from the forest.'],
        ['Vessa', 'You hold a door for people who will never learn your name.'],
        ['Vessa', 'Step aside, and I will let you live long enough to be forgotten.'],
      ]);
      g.flags.vessaMet = true;
      g.save();
      g.cam.snapBehind();
      g.setCinematic(false);
    } else {
      V = g.spawnVessa(0, 2.5);
      g.audio.setMusic('boss');
      g.setCinematic(false);
    }
    P.controlEnabled = true;
    V.setState('circle');
    V.atkCd = 1.4;
    g.ui.objective("Defeat Vessa, the Witches' Hand");
    g.bossBar(true);
    await d.until(() => V.hp <= V.maxHp * 0.62 || V.downed);
  },
});

stage('eyeWound', {
  setup(g) {
    g.resetWorld({ player: [0, -8.5, 0], corin: 'dead', soldiers: false, music: 'boss', skills: ALL4 });
    const V = g.spawnVessa(0, -5.5);
    V.hp = Math.round(V.maxHp * 0.62);
    g.bossBar(true);
    g.cam.snapBehind();
    g.ui.fade(0, 0.3);
  },
  async run(g, d) {
    const P = g.player, V = g.vessa;
    g.freezeAI = true;
    P.controlEnabled = false;
    P.lock = null;
    g.tokens.clear();
    if (V.tele) { V.tele.remove(); V.tele = null; }
    g.setCinematic(true);
    P.setState('script');
    P.y = 0;
    P.vel.set(0, 0, 0);
    V.setState('script');
    V.y = 0;
    const a = angleTo(P.pos.x, P.pos.z, V.pos.x, V.pos.z);
    V.pos.set(P.pos.x + Math.sin(a) * 2.4, 0, P.pos.z + Math.cos(a) * 2.4);
    P.facing = a;
    V.facing = a + Math.PI;
    P.scriptPose = (r) => poseStance(r, 1, 1);
    V.scriptPose = (r) => poseSlash(r, 'thrust', 0.25);
    const mx = (P.pos.x + V.pos.x) / 2, mz = (P.pos.z + V.pos.z) / 2;
    const side = a + Math.PI / 2;
    g.cam.shot([mx + Math.sin(side) * 3.4, 1.75, mz + Math.cos(side) * 3.4], [mx, 1.5, mz], 0);
    await d.wait(0.7);
    // feint low; the shield follows it down
    await d.tween(0.3, (u) => {
      V.scriptPose = (r) => poseSlash(r, 'thrust', 0.25 + 0.27 * u);
      P.scriptPose = (r) => { poseStance(r, 1, 1); r.shO.rotation.x += 0.7 * u; r.torso.rotation.x = 0.2 * u; };
    });
    g.timeScale = 0.3;
    g.audio.swing(0, 1.4);
    const hitAt = { done: false };
    await d.tween(0.36, (u) => {
      V.scriptPose = (r) => poseSlash(r, 'h2', 0.3 + 0.22 * u);
      if (u > 0.55 && !hitAt.done) {
        hitAt.done = true;
        g.fx.arc(V, 'h2', 0xc58cff, 2.6);
      }
    });
    g.timeScale = 1;
    g.audio.eyeSlash();
    g.ui.flash('#fff', 0.15);
    g.ui.fade(1, 0.05);
    P.rig.scar.visible = true;
    g.cam.shake(0.4, 0.4);
    await d.wait(1.0);
    g.audio.heartbeat(1);
    await d.wait(0.9);
    g.audio.heartbeat(0.8);
    P.scriptPose = (r) => { poseKneel(r, 1, 0.5); r.shO.rotation.set(-2.4, -0.4 * r.side, 0); r.elO.rotation.x = -1.6; };
    V.scriptPose = (r) => poseStance(r, 1, 0);
    const v0 = V.pos.clone();
    V.pos.set(P.pos.x + Math.sin(a) * 4.2, 0, P.pos.z + Math.cos(a) * 4.2);
    g.cam.shot([P.pos.x + Math.sin(a - 2.4) * 3.0, 1.2, P.pos.z + Math.cos(a - 2.4) * 3.0], [P.pos.x, 0.9, P.pos.z], 0);
    g.blind(true);
    g.ui.fade(0, 1.6);
    await d.wait(1.2);
    g.say('Vessa', 'Now you will see the world the way it sees you. By half.', 3.2);
    await d.wait(2.4);
    await d.tween(0.7, (u) => { P.scriptPose = (r) => { poseKneel(r, 1 - smooth(u), 0.5); poseStance(r, u, 0.5 * u); }; });
    P.scriptPose = null;
    P.setState('idle');
    V.scriptPose = null;
    void v0;
  },
});

stage('vessa2', {
  checkpoint: true,
  setup(g) {
    g.resetWorld({ player: [0, -9.5, 0], corin: 'dead', soldiers: false, music: 'boss2', skills: ALL4, blind: true, scar: true });
    const V = g.spawnVessa(0, -4.6);
    V.hp = Math.round(V.maxHp * 0.62);
    g.cam.snapBehind();
  },
  async run(g, d) {
    const P = g.player, V = g.vessa;
    g.ui.fade(0, 0.6);
    g.setCinematic(false);
    g.freezeAI = false;
    g.blind(true);
    P.rig.scar.visible = true;
    V.phase2 = true;
    V.scriptPose = null;
    V.setState('circle');
    V.atkCd = 1.6;
    P.controlEnabled = true;
    P.setState('idle');
    g.audio.setMusic('boss2');
    g.bossBar(true);
    g.ui.objective("Defeat Vessa, the Witches' Hand");
    g.ui.hint('Your right eye is gone. Lock on {lock} to keep her in your good eye, and listen for her on your blind side.');
    d.later(8, () => g.ui.hint(''));
    await d.until(() => V.downed);
    g.freezeAI = true;
    P.lock = null;
    g.bossBar(false);
    g.ui.objective('');
    g.learn('ending');
    g.ui.hint('Ending Blow: get close to her and press {attack}');
    await d.until(() => g.autoAdvance || (P.dist(V) < 3.4 && g.input.pressed('attack') && P.controlEnabled));
    g.ui.hint('');
    // the Ending Blow
    g.setCinematic(true);
    P.controlEnabled = false;
    P.setState('script');
    const a = angleTo(P.pos.x, P.pos.z, V.pos.x, V.pos.z);
    P.facing = a;
    const from = P.pos.clone(), to = new THREE.Vector3(V.pos.x - Math.sin(a) * 0.95, 0, V.pos.z - Math.cos(a) * 0.95);
    const side = a + Math.PI / 2;
    g.cam.shot([V.pos.x + Math.sin(side) * 4.2 - Math.sin(a) * 1.5, 2.2, V.pos.z + Math.cos(side) * 4.2 - Math.cos(a) * 1.5], [V.pos.x, 1.4, V.pos.z], 0);
    g.audio.swing(0, 1.4);
    g.timeScale = 0.6;
    await d.tween(0.55, (u) => {
      P.pos.lerpVectors(from, to, smooth(u));
      P.y = Math.sin(Math.PI * u) * 1.7;
      P.scriptPose = (r) => { poseCrouch(r, 0.4 * Math.sin(Math.PI * u)); r.shS.rotation.set(lerp(-2.9, -0.15, easeOut(u)), 0, 0); r.elS.rotation.x = -0.2; r.torso.rotation.x = 0.35 * u; };
    });
    g.timeScale = 1;
    P.y = 0;
    g.audio.slam(0);
    g.ui.flash('rgba(233,216,255,0.85)', 0.9);
    g.cam.shake(0.35, 0.4);
    g.fx.burst(V.pos.x, 0.8, V.pos.z, 40, 0xb46cff, 5);
    P.scriptPose = (r) => { poseKneel(r, 1, 0.55); r.shS.rotation.set(-0.35, 0, 0); r.elS.rotation.x = -0.1; };
    await d.wait(1.2);
    await d.talk([['Vessa', 'They will never... sing of this.']]);
    V.perish();
    for (const e of g.enemies) if (e.alive && e !== V) e.setState('flee');
    await d.wait(2.0);
  },
});

stage('dawn', {
  setup(g) {
    g.resetWorld({ player: [0, -9.5, 0], corin: 'dead', soldiers: false, music: 'dawn', skills: [...ALL4, 'ending'], scar: true });
  },
  async run(g, d) {
    const P = g.player, C = g.corin;
    g.setCinematic(true);
    g.ui.fade(1, 1.8);
    await d.wait(2.0);
    g.clearEnemies();
    g.blind(false);
    g.bossBar(false);
    g.ui.objective('');
    g.world.setDawn(1);
    g.audio.setMusic('dawn');
    C.rig.weapon.group.visible = false;
    const B = body(C);
    g.plantSword(B.hx + 0.55, B.hz - 0.55);
    P.setState('script');
    P.pos.set(B.tx, 0, B.tz - 0.9);
    P.facing = angleTo(P.pos.x, P.pos.z, B.tx, B.tz);
    P.scriptPose = (r) => { poseKneel(r, 1, 0.4); r.shS.rotation.set(-0.2, 0, 0.2 * r.side); r.head.rotation.x = 0.35; };
    g.cam.shot([B.tx + 3.4, 1.5, B.tz + 3.2], [B.tx + 0.2, 0.7, B.tz - 0.4], 0);
    g.cam.shot([B.tx + 2.5, 2.1, B.tz + 2.4], [B.tx + 0.2, 0.8, B.tz - 0.4], 12);
    g.ui.fade(0, 2.6);
    await d.wait(2.8);
    await d.cards([
      'By dawn the raiders were gone. The Mirror was never reached.',
      "He carried Corin's sword home.",
      'He never taught the sword again.',
    ]);
    g.ui.fade(1, 1.4);
    await d.wait(1.5);
    await d.chronicle('Report of the Western Watch', [
      'Border skirmish at the desert ruins. The sanctum held.',
      'Losses: eleven, among them Corin, squire, of Castle Town.',
      'Commanding officer: Captain <span class="redact">Link</span>, of the forest.',
      'Commendation: none recorded.',
    ], { keepOpen: true });
    g.showEnd();
  },
});

export async function runStory(g, startIndex = 0) {
  const d = g.director;
  let i = startIndex;
  let needSetup = true;
  while (i < STAGES.length) {
    const S = STAGES[i];
    g.stageIndex = i;
    if (S.checkpoint) { g.checkpointIndex = i; g.save(); }
    g.clearStageListeners();
    try {
      if (needSetup && S.setup) S.setup(g);
      needSetup = false;
      g.ui.card(null);
      await S.run(g, d);
      i++;
    } catch (e) {
      if (e && e.respawn) {
        g.clearStageListeners();
        i = e.jump != null ? e.jump : g.checkpointIndex;
        needSetup = true;
        continue;
      }
      if (e && e.quit) { g.clearStageListeners(); return; }
      console.error(e);
      throw e;
    }
  }
  g.clearStageListeners();
}
export const stageIndex = (name) => STAGES.findIndex((s) => s.name === name);
void resetPose;
