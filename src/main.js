import * as T from 'three';
import { G } from './core/game.js';
import { PI, $ } from './core/util.js';
import { initAudio, playMusic, stopMusic } from './core/audio.js';
import { I, keys, press, initInput, pollInput, coarse, showTouch, opts, setSens, setBlood, setModel, releaseAll } from './core/input.js';
import { initRenderer } from './gfx/renderer.js';
import { gfx, pickGfx, watchGfx, TIERS } from './gfx/quality.js';
import { initFx, updateFx, clearBlood } from './gfx/fx.js';
import { buildLevel, confine } from './world/level.js';
import { updateMissiles, clearMissiles } from './actors/missile.js';
import { cam, updateCamera } from './world/camera.js';
import { Player } from './actors/player.js';
import { Enemy } from './actors/enemy.js';
import { Ally } from './actors/ally.js';
import { ATK, LOOKS } from './actors/data.js';
import { Extra } from './actors/extra.js';
import { loadModel } from './actors/model.js';
import { CL, PZ, C } from './actors/anim.js';
import { ui } from './ui/hud.js';
import { Director } from './story/director.js';
import { STAGES } from './story/mission.js';

let last = 0; // the time of the last frame (set again whenever a long pause should not count as one)
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
let lockSpin = 0;

G.spawn = (kind, x, z, o) => { const e = new Enemy(kind, x, z, o); G.enemies.push(e); return e; };
G.clearEnemies = () => { clearMissiles(); for (const e of G.enemies) e.dispose(); G.enemies.length = 0; for (const e of G.extras) e.dispose(); G.extras.length = 0; for (const e of G.allies) e.dispose(); G.allies.length = 0; };
G.enlist = (o) => { const a = new Ally(o); G.allies.push(a); return a; }; // a soldier who fights beside him (actors/ally.js)
// Put the world in a known state for the start of a stage.
G.resetWorld = (o) => {
  G.clearEnemies(); if (G.stretchers) { G.stretchers.dispose(); G.stretchers = null; } player.wear(o.look || 'captain'); player.reset(...o.player); G.blunt = false; G.spar = !!o.spar; G.boss = null; G.hold = null; G.freezeAI = false; G.cinematic = false; G.hitstop = G.slow = G.hurt = 0; G.focus = 0; clearBlood();
  ui.holdBar(false); ui.objective(''); ui.hint(''); ui.thought(''); ui.hideDialogue(); ui.cinematic(false); level.marker(null); level.setSite(o.site || 'ruins', o); level.setDawn(0); level.flare = 0; level.setGate(o.gate || 'sanctum');
  if (o.corin) { corin.setVisible(true); corin.place(o.corin[0], o.corin[1], o.corin[2]); corin.setMode(o.corin[3]); } else corin.setVisible(false);
};

// Saved progress: the latest checkpoint reached, kept in this browser under the stage's
// name, so adding or reordering stages never moves a save. (Saves from before the prologue
// existed were stage numbers: OLD maps them.) The first checkpoint is where a new game starts.
const SAVE = 'the-unsung.checkpoint', OLD = { 2: 'raid', 4: 'hold', 5: 'vessa' };
const loadSave = () => { try { const v = localStorage.getItem(SAVE), k = STAGES.findIndex((s) => s.name === (OLD[v] || v)); return k > 0 && STAGES[k].checkpoint ? k : 0; } catch (_) { return 0; } };
// Chapters reached, for replaying them (title and pause menu). Every checkpoint up to the saved one counts as reached, so
// saves from before this list existed open the chapters already played.
const REACHED = 'the-unsung.reached';
const loadReached = () => { const r = new Set([STAGES[0].name]); try { for (const n of JSON.parse(localStorage.getItem(REACHED) || '[]')) r.add(n); const v = localStorage.getItem(SAVE), k = STAGES.findIndex((s) => s.name === (OLD[v] || v)); for (let i = 0; i <= k; i++) if (STAGES[i].checkpoint) r.add(STAGES[i].name); } catch (_) { /* storage blocked */ } return r; };
const reached = loadReached();
const writeSave = (k) => { reached.add(STAGES[k].name); try { localStorage.setItem(SAVE, STAGES[k].name); localStorage.setItem(REACHED, JSON.stringify([...reached])); } catch (_) { /* storage blocked: play on without saving */ } if (G.drawChapters) G.drawChapters(); };
G.finish = () => { if (G.auto) return; try { localStorage.removeItem(SAVE); } catch (_) { /* storage blocked */ } }; // chapters reached are kept
const LESSONS = { taughtStrike: 'forecourt', taughtDoor: 'halls', taughtWay: 'waystation' }; // which chapter teaches what
const LABEL = { forecourt: 'the forecourt', halls: 'the halls', door: 'the Glass Door', waystation: 'the waystation', muster: 'the muster', patrol: 'the patrol', beacon: 'the beacon', picket: 'the well picket', caravan: 'the lost caravan', tracks: 'the tracks north', spar: 'the ruins', raid: 'the raid', hold: 'the Narrows', vessa: 'Vessa' };

// Play the stages in order starting at i. Retrying a checkpoint calls this again.
G.runFrom = async (i) => {
  director.abort(); const id = ++G.runId;
  for (const f in LESSONS) if (i > STAGES.findIndex((s) => s.name === LESSONS[f])) G[f] = true; // what an earlier chapter taught has been learned, wherever this run starts (a chapter picked from the list, or CONTINUE after a reload)
  for (let k = i; k < STAGES.length; k++) {
    const s = STAGES[k]; G.stage = k; if (s.checkpoint) { G.checkpoint = k; if (k > 0 && !G.auto) writeSave(k); }
    if (k === i && s.setup) s.setup();
    if (s.checkpoint) G.drawChapters();
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
  // A tip that has to be read mid-fight (ui.tip): the fight runs at a tenth while the picture dims and goes soft.
  G.focusK += ((G.focus ? 1 : 0) - G.focusK) * Math.min(1, rdt * 7); if (G.focusK < 0.003) G.focusK = 0; G.grade.uniforms.uFocus.value = G.focusK; dt *= 1 - 0.9 * G.focusK;
  G.shake = Math.max(0, G.shake - rdt * 1.6) * Math.exp(-6 * rdt);
  G.hurt = Math.max(0, G.hurt - rdt * 1.5); G.grade.uniforms.uHurt.value = opts.blood ? G.hurt * G.hurt * (3 - 2 * G.hurt) : 0; G.grade.uniforms.uTime.value = G.clock % 64;
  if (dt > 0) {
    G.time += dt;
    if (G.running) {
      player.update(dt);
      if (corin.root.visible) corin.update(dt);
      for (const a of G.allies) a.update(dt);
      for (const e of G.enemies) e.update(dt);
      for (const e of G.extras) e.update(dt);
      updateMissiles(dt);
      const all = [player, ...(corin.root.visible ? [corin] : []), ...G.allies, ...G.enemies, ...G.extras];
      for (const c of all) c.pos.addScaledVector(c.vel, dt);
      // bodies push each other apart; a rolling player slips through
      const ghost = player.state === 'roll' || (player.at === ATK.sa && player.state === 'atk');
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j]; if ((a.dead && !a.solid) || (b.dead && !b.solid) || b.state === 'spawn' || a.state === 'spawn' || (a.fixed && b.fixed)) continue; if (i === 0 && ghost) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 0.001, m = a.radius + b.radius + 0.12;
        if (d < m) { const o = m - d, wa = a.fixed ? 0 : b.fixed ? 1 : i === 0 ? 0.65 : 0.5; /* a bystander standing still (an Extra) is not shoved about */ a.pos.x -= (dx / d) * o * wa; a.pos.z -= (dz / d) * o * wa; b.pos.x += (dx / d) * o * (1 - wa); b.pos.z += (dz / d) * o * (1 - wa); }
      }
      for (let i = 0; i < all.length; i++) if (!all[i].unbound) confine(all[i].pos, all[i].radius, i === 0 || all[i] === corin || all[i].ally);
      for (const c of all) c.animate(dt, G.time);
      for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].gone) { G.enemies[i].dispose(); G.enemies.splice(i, 1); }
    } else { player.animate(dt, G.time); if (corin.root.visible) corin.animate(dt, G.time); }
    updateFx(dt); level.update(dt, G.time);
  }
  if (G.running) director.update(rdt);
  const t = player.lock; lockRing.visible = lockRing2.visible = !!t;
  if (t) { lockSpin += rdt * 2.2; level.lay(lockRing, t.pos.x, t.pos.z, 0.08, lockSpin); level.lay(lockRing2, t.pos.x, t.pos.z, 0.08); const s = t.scale * (1 + Math.sin(G.time * 6) * 0.05); lockRing.scale.setScalar(s); lockRing2.scale.setScalar(s); }
  updateCamera(rdt, false); level.skyAt(G.camera.position); ui.frame(); if (!noRender) G.composer.render();
}

// Draw the frame that is about to be shown, and wait for the graphics card to finish it, before a fade lifts (ui.fade
// calls this). The first time a place is seen its shaders are compiled and its textures sent to the card, which can take
// a second on a fresh browser; the fade is a CSS transition and does not wait, so it used to lift on the last frame
// drawn (the camera wherever it was before) and then jump (owner, Nov 2026, on the hosted build). After the world has
// changed (`stale`) everything showing is drawn once whether or not it is in view, so turning round later finds it ready.
let stale = true;
for (const f of ['setSite', 'setAfter', 'setGate']) { const fn = level[f]; level[f] = (...a) => { stale = true; return fn(...a); }; }
G.warm = () => {
  if (G.auto) return; // the playtest steps without drawing
  const off = [];
  if (stale) { stale = false; G.scene.traverseVisible((o) => { if (o.frustumCulled) { o.frustumCulled = false; off.push(o); } }); }
  try { updateCamera(0, false); level.skyAt(G.camera.position); G.composer.render(); const gl = G.renderer.getContext(); G.renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); /* reading a pixel back blocks until the frame is really done */ } catch (_) { /* a lost context: carry on */ }
  for (const o of off) o.frustumCulled = true;
  last = performance.now();
};

// title screen
const rows = coarse
  ? [['Left thumb', 'Move'], ['Drag right side', 'Camera'], ['STRIKE', 'Tap up to three times'], ['HEAVY', 'Hold to charge, or finish a combo'], ['GUARD', 'Hold to block; tap late to parry'], ['DODGE', 'Roll, side roll, backstep'], ['LOCK', 'Target an enemy']]
  : [['W A S D', 'Move'], ['J / Click', 'Strike, up to three'], ['K / Right-click', 'Heavy: hold to charge, or finish a combo'], ['L / Shift', 'Guard: tap late to parry'], ['Space', 'Dodge: roll, side roll, backstep'], ['F / Tab', 'Lock on'], ['Q E / Mouse', 'Camera']];
const help = rows.map((r) => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('') + (coarse ? '' : '<dt>Esc / P</dt><dd>Pause</dd>');
$('phelp').innerHTML = help;
$('dmore').textContent = coarse ? 'TAP \u25B8' : 'SPACE / CLICK \u25B8';
function begin(from = 0) {
  if (G.running) return; initAudio(); if (from && !STAGES[from].cards) stopMusic(4); // a new game keeps the title theme through the opening cards, and so does a chapter that opens on cards (owner, Nov 2026: no silence under them); the chapter's own music takes over from it
  $('title').style.display = 'none'; menus(false); $('hud').style.visibility = 'visible'; if (coarse) showTouch();
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
// Replaying a chapter plays it as if for the first time: the cutscenes and lessons that a retry skips are shown again.
// (Its own lessons, that is: runFrom marks the earlier chapters' as learned. Picking the Glass Door used to teach lock, strike and shield over again.)
const fresh = () => { G.seenHalls = G.seenWay = G.seenFront = G.seenJav = G.seenCaravan = G.seenTracks = G.taughtStrike = G.taughtDoor = G.taughtWay = false; };
// The list is grouped by act, numbered, and quiet: rows of text, not a column of boxed buttons. A chapter not yet reached
// shows no name (some are spoilers); the one being played is marked (on the title, the one CONTINUE goes to).
const ACTS = [['Prologue', ['forecourt', 'halls', 'door']], ['The years between', ['waystation', 'muster']], ['The Western Watch', ['patrol', 'beacon', 'picket', 'caravan', 'tracks']], ['The first night', ['spar', 'raid', 'hold', 'vessa']]], ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const CHAPTERS = STAGES.map((s, k) => [s, k]).filter(([s]) => s.checkpoint);
const chapName = (s) => { const l = LABEL[s.name] || s.name; return l[0].toUpperCase() + l.slice(1); };
const actOf = (s) => (ACTS.find(([, names]) => names.includes(s.name)) || ['Later'])[0];
const saved = loadSave();
// From the title a picked chapter fades in like NEW GAME; from the pause menu it cuts in under a short fade.
// (A chapter that opens on cards keeps whatever is playing under them: STAGES[k].cards.)
const pick = (k) => {
  fresh(); if (!G.running) { leave(k); return; }
  G.pause(false); ui.fade(1, 0.3); if (k === 0) playMusic('title', { cross: 1 }); else if (!STAGES[k].cards) stopMusic(1.5); setTimeout(() => G.runFrom(k), 350);
};
G.drawChapters = () => {
  const box = $('pchap'), here = G.running ? G.checkpoint : saved || -1; box.innerHTML = ''; let act = null;
  CHAPTERS.forEach(([s, k], n) => {
    const a = actOf(s), open = reached.has(s.name);
    if (a !== act) { act = a; const h = document.createElement('div'); h.className = 'act'; h.textContent = a; box.appendChild(h); }
    const b = document.createElement('button'), num = document.createElement('i'); b.className = 'chap' + (open && here === k ? ' now' : ''); num.textContent = ROMAN[n] || n + 1;
    b.append(num, open ? chapName(s) : '· · ·'); b.disabled = !open; b.addEventListener('click', () => pick(k)); box.appendChild(b);
  });
  $('pchapg').style.display = G.running || reached.size > 1 ? '' : 'none'; // on the title, nothing to replay until a second chapter has been reached
};
G.drawChapters();
// The title (owner, 27 Nov 2026: it was crowded): three panels under the name, one at a time. The menu: CONTINUE, NEW GAME,
// MORE. The question CONTINUE asks, which says where it continues from (it used to be a line under the button). And MORE,
// which borrows the pause menu's groups (Chapters, Options, Controls, Trials) while it is open, so each control exists once;
// they go back to the pause menu when MORE is left or a game starts. Esc goes back to the menu.
const menus = (title) => { const to = title ? $('tmorep') : $('pause'); for (const g of document.querySelectorAll('#pause>details, #tmorep>details')) if (g.parentNode !== to) to.insertBefore(g, title ? $('tmback') : null); };
const panel = (id) => {
  for (const p of ['tmenu', 'tconf', 'tmorep']) $(p).hidden = p !== id;
  menus(id === 'tmorep'); for (const g of $('tmorep').querySelectorAll('details')) g.open = false;
  if (id === 'tconf') $('tgo').focus({ preventScroll: true }); else document.activeElement?.blur?.(); // so Enter answers the question (Tab and Space are the game's)
};
if (saved) {
  const s = STAGES[saved], n = CHAPTERS.findIndex(([, k]) => k === saved);
  $('tcname').textContent = chapName(s); $('tcact').textContent = (n >= 0 ? `Chapter ${ROMAN[n] || n + 1} · ` : '') + actOf(s);
  $('tcont').style.display = ''; $('tcont').addEventListener('click', () => panel('tconf')); $('tgo').addEventListener('click', () => leave(saved));
  $('tplay').className = 'btn';
}
$('tplay').textContent = saved || reached.size > 1 ? 'NEW GAME' : 'PLAY'; $('tplay').addEventListener('click', () => leave(0));
$('tmore').addEventListener('click', () => panel('tmorep'));
for (const id of ['tback', 'tmback']) $(id).addEventListener('click', () => panel('tmenu'));
addEventListener('keydown', (e) => { if (e.code === 'Escape' && !G.running && !leaving) panel('tmenu'); });

// pause menu: RESUME, RESTART CHECKPOINT and QUIT TO TITLE stay in view; everything else is in groups that open one at a time
// (Options, Controls, Trials: index.html). A new setting goes in a group, not on the top level.
const bloodBtn = $('pblood'), bloodLabel = () => (bloodBtn.textContent = `BLOOD: ${opts.blood ? 'ON' : 'OFF'}`);
bloodLabel(); bloodBtn.addEventListener('click', () => { setBlood(!opts.blood); bloodLabel(); });
// A trial of authored models (actors/model.js): the captain as a downloaded, textured knight
// in place of the figure built in code. The file is only fetched when this is on.
const modelBtn = $('pmodel'), modelLabel = () => (modelBtn.textContent = `CAPTAIN: ${opts.model ? 'KNIGHT MODEL' : 'BUILT IN CODE'}`);
G.setModel = async (on) => {
  setModel(on); modelLabel(); LOOKS.captain.model = on ? 'knight' : undefined;
  if (on) try { await loadModel('knight'); } catch (e) { console.warn('model not loaded', e); }
  if (player.look === 'captain') player.dress(LOOKS.captain);
};
modelLabel(); modelBtn.addEventListener('click', () => G.setModel(!opts.model)); if (opts.model) G.setModel(true);
// Graphics tier (gfx/quality.js): AUTO, or one the player picks. The button steps through them and the pick takes effect
// half a second after the last press, so stepping past a tier doesn't run it. The note says what AUTO is running, and why if it is lower than usual.
const gfxBtn = $('pgfx'), gfxNote = $('pgfxn'), GFX = ['auto', ...TIERS]; let gfxWant = gfx.pick, gfxT = 0;
const WHY = { gpu: 'Shadows are off: this device’s graphics driver is known to stop the game with them on.', lost: 'Lowered because this device’s graphics driver stopped the game.', slow: 'Lowered to keep the game running smoothly.', url: 'Set by the page’s address.' };
const gfxLabel = () => { const set = gfxWant === gfx.pick; gfxBtn.textContent = `GRAPHICS: ${gfxWant.toUpperCase()}`; gfxNote.textContent = set ? [gfx.pick === 'auto' && `Running at ${gfx.tier.toUpperCase()}.`, WHY[gfx.why]].filter(Boolean).join(' ') : ''; gfxNote.style.display = gfxNote.textContent ? '' : 'none'; };
gfxLabel(); G.on((kind) => { if (kind === 'gfx') { if (!gfxT) gfxWant = gfx.pick; gfxLabel(); } });
gfxBtn.addEventListener('click', () => { gfxWant = GFX[(GFX.indexOf(gfxWant) + 1) % GFX.length]; gfxLabel(); clearTimeout(gfxT); gfxT = setTimeout(() => { gfxT = 0; pickGfx(gfxWant); }, 500); });
const sens = $('psens'); sens.value = opts.sens; sens.addEventListener('input', () => setSens(+sens.value));
G.pause = (on) => {
  if (!G.running || on === !!G.paused) return;
  G.paused = on; releaseAll(); $('pause').style.display = on ? 'flex' : 'none'; G.confirm = false; if (on) for (const g of document.querySelectorAll('#pause details')) g.open = false;
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
for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, initAudio, { passive: true, capture: true }); // (capture: a control that stops the event still wakes the sound)

// rdt is clamped at zero: the first frame can carry a timestamp earlier than this one.
last = performance.now();
const watched = !navigator.webdriver; // (a browser driven by a test is no measure of a player's device)
function frame(now) { const rdt = Math.max(0, Math.min(0.05, (now - last) / 1000)); if (watched && G.running && !G.paused && !G.manual && !G.auto && document.visibilityState === 'visible') watchGfx((now - last) / 1000); last = now; if (G.manual) G.composer.render(); else step(rdt); requestAnimationFrame(frame); } // G.manual: the playtest steps the game itself, and this loop only draws
requestAnimationFrame(frame);
// The title's buttons come up once the first frame is drawn and the title's typeface is in (or after 1.5 s without it).
Promise.race([document.fonts ? document.fonts.ready : null, new Promise((r) => setTimeout(r, 1500))]).then(() => $('title').classList.remove('loading'));

// handles for the headless playtest and for poking at things in the console
Object.assign(G, { step, begin, I, keys, press, cam, CL, PZ, C, director, STAGES, opts, Extra, LOOKS });
window.G = G; G.ui = ui;
