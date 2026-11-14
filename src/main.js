import * as T from 'three';
import { G } from './core/game.js';
import { PI, $ } from './core/util.js';
import { initAudio, playMusic, stopMusic } from './core/audio.js';
import { I, keys, press, initInput, pollInput, coarse, showTouch, opts, setSens, setBlood, releaseAll } from './core/input.js';
import { initRenderer } from './gfx/renderer.js';
import { initFx, updateFx, clearBlood } from './gfx/fx.js';
import { buildLevel, confine } from './world/level.js';
import { cam, updateCamera } from './world/camera.js';
import { Player } from './actors/player.js';
import { Enemy } from './actors/enemy.js';
import { Ally } from './actors/ally.js';
import { ATK } from './actors/data.js';
import { CL, PZ, C } from './actors/anim.js';
import { ui } from './ui/hud.js';
import { Director } from './story/director.js';
import { STAGES } from './story/mission.js';

const canvas = $('c');
initRenderer(canvas); initFx();
const level = buildLevel();
const player = (G.player = new Player());
const corin = (G.corin = new Ally());
const director = new Director();
G.clock = 0;
initInput(canvas, cam);

// lock-on reticle on the ground under the target
const ringMat = new T.MeshBasicMaterial({ color: new T.Color(2, 1.5, 0.5), transparent: true, opacity: 0.95, depthWrite: false, fog: false, side: T.DoubleSide });
const lockRing = new T.Mesh(new T.RingGeometry(0.78, 0.9, 4), ringMat), lockRing2 = new T.Mesh(new T.RingGeometry(0.52, 0.57, 28), ringMat);
for (const m of [lockRing, lockRing2]) { m.rotation.x = -PI / 2; m.visible = false; G.scene.add(m); }

G.spawn = (kind, x, z, o) => { const e = new Enemy(kind, x, z, o); G.enemies.push(e); return e; };
G.clearEnemies = () => { for (const e of G.enemies) e.dispose(); G.enemies.length = 0; };
// Put the world in a known state for the start of a stage.
G.resetWorld = (o) => {
  G.clearEnemies(); if (G.stretchers) { G.stretchers.dispose(); G.stretchers = null; } player.reset(...o.player); G.spar = !!o.spar; G.boss = null; G.hold = null; G.freezeAI = false; G.cinematic = false; G.hitstop = G.slow = G.hurt = 0; clearBlood();
  ui.holdBar(false); ui.objective(''); ui.hint(''); ui.hideDialogue(); ui.cinematic(false); level.marker(null); level.setDawn(0); level.flare = 0; level.setGate(o.gate || 'sanctum');
  if (o.corin) { corin.setVisible(true); corin.place(o.corin[0], o.corin[1], o.corin[2]); corin.setMode(o.corin[3]); } else corin.setVisible(false);
};

// Saved progress: the latest checkpoint reached, kept in this browser under the stage's
// name, so adding or reordering stages never moves a save. (Saves from before the prologue
// existed were stage numbers: OLD maps them.) The first checkpoint is where a new game starts.
const SAVE = 'the-unsung.checkpoint', OLD = { 2: 'raid', 4: 'hold', 5: 'vessa' };
const loadSave = () => { try { const v = localStorage.getItem(SAVE), k = STAGES.findIndex((s) => s.name === (OLD[v] || v)); return k > 0 && STAGES[k].checkpoint ? k : 0; } catch (_) { return 0; } };
const writeSave = (k) => { try { localStorage.setItem(SAVE, STAGES[k].name); } catch (_) { /* storage blocked: play on without saving */ } };
const LABEL = { spar: 'the Western Watch', raid: 'the raid', hold: 'the Narrows', vessa: 'Vessa' };

// Play the stages in order starting at i. Retrying a checkpoint calls this again.
G.runFrom = async (i) => {
  director.abort(); const id = ++G.runId;
  for (let k = i; k < STAGES.length; k++) {
    const s = STAGES[k]; G.stage = k; if (s.checkpoint) { G.checkpoint = k; if (k > 0 && !G.auto) writeSave(k); }
    if (k === i && s.setup) s.setup();
    try { await s.run(director); } catch (e) { if (e === 'abort') return; throw e; }
    if (id !== G.runId) return;
  }
};
G.on((kind) => {
  if (kind !== 'playerDead') return; const id = G.runId;
  setTimeout(() => { if (id === G.runId) ui.fade(1, 0.8); }, 1700);
  setTimeout(() => { if (id === G.runId) G.runFrom(G.checkpoint); }, 2700);
});

function step(rdt, noRender) {
  if (G.paused) { if (!noRender) G.composer.render(); return; }
  G.rdt = rdt; G.clock += rdt; pollInput(cam);
  let dt = rdt * G.timeScale;
  if (G.hitstop > 0) { G.hitstop -= rdt; dt = 0; } else if (G.slow > 0) { G.slow -= rdt; dt *= 0.3; }
  G.shake = Math.max(0, G.shake - rdt * 1.6) * Math.exp(-6 * rdt);
  G.hurt = Math.max(0, G.hurt - rdt * 1.5); G.grade.uniforms.uHurt.value = opts.blood ? G.hurt * G.hurt * (3 - 2 * G.hurt) : 0; G.grade.uniforms.uTime.value = G.clock % 64;
  if (dt > 0) {
    G.time += dt;
    if (G.running) {
      player.update(dt);
      if (corin.root.visible) corin.update(dt);
      for (const e of G.enemies) e.update(dt);
      const all = [player, ...(corin.root.visible ? [corin] : []), ...G.enemies];
      for (const c of all) c.pos.addScaledVector(c.vel, dt);
      // bodies push each other apart; a rolling player slips through
      const ghost = player.state === 'roll' || (player.at === ATK.sa && player.state === 'atk');
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j]; if (a.dead || b.dead || b.state === 'spawn' || a.state === 'spawn') continue; if (i === 0 && ghost) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 0.001, m = a.radius + b.radius + 0.12;
        if (d < m) { const o = m - d, wa = i === 0 ? 0.65 : 0.5; a.pos.x -= (dx / d) * o * wa; a.pos.z -= (dz / d) * o * wa; b.pos.x += (dx / d) * o * (1 - wa); b.pos.z += (dz / d) * o * (1 - wa); }
      }
      for (let i = 0; i < all.length; i++) confine(all[i].pos, all[i].radius, i === 0 || all[i] === corin);
      for (const c of all) c.animate(dt, G.time);
      for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].gone) { G.enemies[i].dispose(); G.enemies.splice(i, 1); }
    } else { player.animate(dt, G.time); if (corin.root.visible) corin.animate(dt, G.time); }
    updateFx(dt); level.update(dt, G.time);
  }
  if (G.running) director.update(rdt);
  const t = player.lock; lockRing.visible = lockRing2.visible = !!t;
  if (t) { lockRing.position.set(t.pos.x, 0.08, t.pos.z); lockRing2.position.copy(lockRing.position); lockRing.rotation.z += rdt * 2.2; const s = t.scale * (1 + Math.sin(G.time * 6) * 0.05); lockRing.scale.setScalar(s); lockRing2.scale.setScalar(s); }
  updateCamera(rdt, false); ui.frame(); if (!noRender) G.composer.render();
}

// title screen
const rows = coarse
  ? [['Left thumb', 'Move'], ['Drag right side', 'Camera'], ['STRIKE', 'Tap up to three times'], ['HEAVY', 'Hold to charge, or finish a combo'], ['GUARD', 'Hold to block; tap late to parry'], ['DODGE', 'Roll, side roll, backstep'], ['LOCK', 'Target an enemy']]
  : [['W A S D', 'Move'], ['J / Click', 'Strike, up to three'], ['K / Right-click', 'Heavy: hold to charge, or finish a combo'], ['L / Shift', 'Guard: tap late to parry'], ['Space', 'Dodge: roll, side roll, backstep'], ['F / Tab', 'Lock on'], ['Q E / Mouse', 'Camera']];
const help = rows.map((r) => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('') + (coarse ? '' : '<dt>Esc / P</dt><dd>Pause</dd>');
$('thelp').innerHTML = $('phelp').innerHTML = help;
$('dmore').textContent = coarse ? 'TAP \u25B8' : 'SPACE / CLICK \u25B8';
function begin(from = 0) {
  if (G.running) return; initAudio(); if (from) stopMusic(4); // a new game keeps the title theme through the opening cards
  $('title').style.display = 'none'; $('hud').style.visibility = 'visible'; if (coarse) showTouch();
  player.setVisible(true); G.running = true; G.confirm = false; G.runFrom(from);
  if (!coarse) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* refused */ } }
}
// NEW GAME and CONTINUE fade the title out to black before the game starts, so the first
// card (or the checkpoint) comes up out of the dark instead of cutting in.
let leaving = false;
function leave(from) {
  if (leaving || G.running) return; leaving = true; initAudio();
  const t = $('title'); t.style.transition = 'opacity .9s'; t.style.opacity = 0; t.style.pointerEvents = 'none'; ui.fade(1, 0.9);
  if (!coarse) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* refused */ } } // asked for now, while the click still counts
  setTimeout(() => begin(from), 1000);
}
$('tplay').addEventListener('click', () => leave(0));
const saved = loadSave();
if (saved) {
  const b = $('tcont'); b.style.display = ''; b.textContent = 'CONTINUE'; $('tcwhere').textContent = 'from ' + (LABEL[STAGES[saved].name] || STAGES[saved].name);
  $('tplay').textContent = 'NEW GAME'; $('tplay').className = 'btn'; b.addEventListener('click', () => leave(saved));
}

// pause menu
const bloodBtn = $('pblood'), bloodLabel = () => (bloodBtn.textContent = `BLOOD: ${opts.blood ? 'ON' : 'OFF'}`);
bloodLabel(); bloodBtn.addEventListener('click', () => { setBlood(!opts.blood); bloodLabel(); });
const sens = $('psens'); sens.value = opts.sens; sens.addEventListener('input', () => setSens(+sens.value));
G.pause = (on) => {
  if (!G.running || on === !!G.paused) return;
  G.paused = on; releaseAll(); $('pause').style.display = on ? 'flex' : 'none'; G.confirm = false;
  if (on) { if (document.pointerLockElement) document.exitPointerLock(); }
  else { last = performance.now(); if (!I.touch && !coarse) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* refused */ } } }
};
G.togglePause = () => G.pause(!G.paused);
$('presume').addEventListener('click', () => G.pause(false));
$('pretry').addEventListener('click', () => { G.pause(false); ui.fade(1, 0.3); setTimeout(() => G.runFrom(G.checkpoint), 350); });
$('pquit').addEventListener('click', () => location.reload());
// The title shows the Glass Door, drifting closer; nobody is on stage yet. (It borrows the
// archway at the end of the Narrows, which is the sanctum gate once the game starts.)
G.resetWorld({ player: [0.6, 12.5, PI], corin: null, gate: 'door' }); player.setVisible(false); player.shadow.visible = false;
 cam.shot([0.5, 1.5, -11.5], [0, 3.2, -27.8]); cam.shot([-0.3, 1.7, -18], [0, 3.3, -27.8], 70); ui.fade(0, 1.5);
// Title music. Browsers keep sound off until the player first taps, clicks or presses a
// key, so it is queued now and fades in on that first touch; PLAY / CONTINUE fade it out.
playMusic('title');
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, initAudio, { passive: true });

// rdt is clamped at zero: the first frame can carry a timestamp earlier than this one.
let last = performance.now();
function frame(now) { const rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; step(rdt); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// handles for the headless playtest and for poking at things in the console
Object.assign(G, { step, begin, I, keys, press, cam, CL, PZ, C, director, STAGES, opts });
window.G = G;
