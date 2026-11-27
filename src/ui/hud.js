import { Vector3 } from 'three';
import { G } from '../core/game.js';
import { $ } from '../core/util.js';
import { label, coarse } from '../core/input.js';
import { route } from '../world/level.js';
import { SFX } from '../core/audio.js';

// DOM overlay: bars, objective, hints, dialogue, the chronicle screens, fades.
let lastHp = -1, lastT = null, lastThp = -1, lastL = null, lastLhp = -1, typing = null;
// A spared foe's health stops at 1 (the stage ends the fight there), so his bar is measured down to 1: it empties instead of leaving a sliver.
const frac = (t) => (t.spare ? (t.hp - 1) / (t.maxHp - 1) : t.hp / t.maxHp);
const bar = (id, v) => { $(id).style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`; };
// "{l}" in a hint becomes the right button name for this device.
const fill = (s) => s.replace(/\{(\w+)\}/g, (_, a) => `<b>${label(a)}</b>`);
const arrive = (el) => { el.classList.remove('new'); void el.offsetWidth; el.classList.add('new'); if (!G.auto) SFX.cue(); };


// Nameplates (owner, 16 Nov 2026: the soldiers who grow with him and die need their names over their health in a fight).
// In a fight every soldier on his side has his name and health above his head, and Corin in battle his name. Out of one,
// anyone named (a soldier, or an Extra made with `name`) has the name alone when he is near. Hidden in cutscenes. A small pool of elements, moved by transform.
const pv = new Vector3(), pool = [];
function plates() {
  const box = $('plates'); if (!box) return; let n = 0; const P = G.player, cam = G.camera, W = innerWidth, H = innerHeight;
  const show = (c, name, hp, dim) => {
    pv.set(c.pos.x, c.pos.y + 2.12 * (c.scale || 1), c.pos.z); const d = pv.distanceTo(cam.position); if (d > 30) return;
    pv.project(cam); if (pv.z > 1 || Math.abs(pv.x) > 1.05 || Math.abs(pv.y) > 1.05) return;
    let el = pool[n]; if (!el) { el = pool[n] = document.createElement('div'); el.className = 'plate'; el.innerHTML = '<span></span><div class="bar"><i></i></div>'; box.appendChild(el); el._n = el._h = el._o = null; }
    n++; if (el._n !== name) el.firstChild.textContent = el._n = name;
    const h = hp == null ? -1 : Math.max(0, Math.min(1, hp)); if (el._h !== h) { el._h = h; el.lastChild.style.display = h < 0 ? 'none' : ''; el.lastChild.firstChild.style.transform = `scaleX(${Math.max(h, 0)})`; el.classList.toggle('low', h >= 0 && h < 0.35); }
    const o = (dim ? 0.45 : 1) * Math.max(0.35, Math.min(1, (30 - d) / 12)); if (el._o !== o) el.style.opacity = el._o = o;
    el.style.display = ''; el.style.transform = `translate(${((pv.x + 1) / 2 * W).toFixed(1)}px,${((1 - pv.y) / 2 * H).toFixed(1)}px) translate(-50%,-100%)`;
  };
  // Owner, 16 Nov 2026: good in a fight, distracting while walking about. So names and bars over his side only while a fight is on;
  // otherwise a name alone, and only over someone he is standing near.
  if (G.running && !G.cinematic && !G.talking && P.root.visible) { // not under dialogue either, like the target bar
    const fight = G.enemies.some((e) => !e.dead && !e.hold);
    if (fight) {
      for (const a of G.allies) if (a.root.visible) show(a, a.type.name, a.soldier ? a.hp / a.maxHp : null, a.out);
      const c = G.corin; if (c && c.root.visible && c.mode === 'battle') show(c, c.type.name, null);
    } else for (const e of [...G.allies, ...G.extras]) if (e.type.name && e.root.visible && !e.dead && P.dist(e) < 4.5) show(e, e.type.name, null);
  }
  for (let i = n; i < pool.length; i++) if (pool[i].style.display !== 'none') pool[i].style.display = 'none';
}

// ---- Three things that follow the play (friends' playthrough, 26 Nov 2026: where to go was hard to tell on a phone, the guard
// was too small to see, javelins came without warning, and stamina wanted to be nearer the eye). All are placed by transform each frame.
const cv = new Vector3(), tag = (el, k, on) => { if (el['_' + k] !== on) { el['_' + k] = on; el.classList.toggle(k, on); } };
const kick = (el, k) => { el.classList.remove(k); void el.offsetWidth; el.classList.add(k); el['_' + k] = true; };
const live = () => G.running && !G.cinematic && !G.talking && G.player.controlEnabled && !G.player.dead && G.player.root.visible;

// The waypoint pointer. `G.level.way` is the place (set by level.marker or level.goal). In view, an arrow stands over it; out of
// view, the arrow sits on an oval inside the screen's edge (clear of the bars and, on a phone, the buttons) and points the way.
// It leads by the same router the raiders use, so round a bend it points along the ground he can walk, not through a dune.
// (Friends' note, 26 Nov 2026: only when the player needs help.) A new place's pointer waits `G.wayDelay` seconds (20; it was 30 until the owner lowered it, 26 Nov 2026) of play
// before it shows: the clock runs only while he has control (not in cutscenes, dialogue or the pause menu), restarts when the place
// moves by more than a metre, and the pointer then stays until the place is cleared. (Owner, 26 Nov 2026: in the halls it came up during
// the second wave, while he had his hands full.) The clock also restarts whenever he is in a fight, which puts away a pointer that was up.
// The beam, where there is one, shows at once as before. The look, a gold double chevron, was the owner's pick from samples (26 Nov 2026).
G.wayDelay = 20;
const wp = { x: 0, y: 0, on: false, d: -1, rot: 9, kx: NaN, kz: NaN, wait: 0, t: 0 };
// in a fight: any foe up and not held back (the Warden on the stair, a soldier who has yielded), or down and getting up again, and not running off
const fighting = () => G.enemies.some((e) => (!e.dead || e.downed) && !e.hold && !e.gone && e.state !== 'flee');
function wayPoint() {
  const el = $('way'), w = G.level && G.level.way, P = G.player, cam = G.camera, W = innerWidth, H = innerHeight;
  const now = G.time, step = Math.min(0.25, Math.max(0, now - wp.t)); wp.t = now;
  if (!w) wp.kx = NaN; else if (!(Math.hypot(w.x - wp.kx, w.z - wp.kz) < 1)) { wp.kx = w.x; wp.kz = w.z; wp.wait = 0; } else if (fighting()) wp.wait = 0; else if (live()) wp.wait += step;
  const d = w ? Math.hypot(w.x - P.pos.x, w.z - P.pos.z) : 0, show = !!w && live() && d > 3.5 && wp.wait >= G.wayDelay;
  if (show !== wp.on) { el.style.opacity = show ? 1 : 0; if (show && !wp.on) wp.d = -1, wp.snap = true; wp.on = show; }
  if (!show) return;
  const via = route(P.pos, w), far = via && Math.hypot(via[0] - P.pos.x, via[1] - P.pos.z) > 2.5, tx = far ? via[0] : w.x, tz = far ? via[1] : w.z;
  cv.set(tx, G.level.height(tx, tz) + (far ? 1.6 : 3.1), tz).applyMatrix4(cam.matrixWorldInverse); const front = cv.z < -0.3;
  let x, y, rot, dx = cv.x, dy = -cv.y;
  if (front) { cv.applyMatrix4(cam.projectionMatrix); dx = cv.x * W; dy = -cv.y * H; }
  const cx = W / 2, cy = H * (coarse ? 0.44 : 0.5), rx = W / 2 - (coarse ? 38 : 64), ry = coarse ? H * 0.27 : H / 2 - 96;
  const ex = dx / 2 / rx, ey = (dy / 2 + (H / 2 - cy)) / ry;
  if (front && !far && ex * ex + ey * ey < 1) { x = W / 2 + dx / 2; y = H / 2 + dy / 2; rot = Math.PI; } // in view, and it is the place itself: stand over it, pointing down
  else { // otherwise as a compass does: by where it lies on the ground from him, ahead being up the screen (so a place behind him is at the bottom)
    const e = cam.matrixWorld.elements, fl = Math.hypot(e[8], e[10]) || 1, gx = tx - P.pos.x, gz = tz - P.pos.z; dx = gx * e[0] + gz * e[2]; dy = (gx * e[8] + gz * e[10]) / fl; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; const k = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2); x = cx + dx * k; y = cy + dy * k; rot = Math.atan2(dx, -dy); }
  if (wp.snap) { wp.x = x; wp.y = y; wp.snap = false; } else { wp.x += (x - wp.x) * 0.22; wp.y += (y - wp.y) * 0.22; }
  el.style.transform = `translate(${wp.x.toFixed(1)}px,${wp.y.toFixed(1)}px)`;
  if (Math.abs(rot - wp.rot) > 0.01) { wp.rot = rot; el.firstChild.style.transform = `rotate(${rot.toFixed(2)}rad)`; el.lastChild.style.top = Math.cos(rot) < -0.3 ? '-4px' : '40px'; } // the distance under the arrow, or over it when it points down
  const m = Math.round(d); if (m !== wp.d) { wp.d = m; el.lastChild.textContent = m + ' m'; }
}

// Stamina and guard, in a ring at his side. It shows while stamina is short of full or his shield is up, and fades when neither.
// The shield in it lights when the guard is up (and only when a blow would really be stopped: not mid-swing or mid-roll),
// flashes when a blow is stopped, bursts on a parry and goes red when the guard is broken.
const rg = { st: -1, bl: 0, pa: 0, br: 0 };
G.on((k) => { if (k === 'tired') kick($('ring'), 'tired'); });
function ring() {
  const el = $('ring'), P = G.player, cam = G.camera, ok = live() || (G.running && !G.cinematic && !G.talking && P.root.visible && !P.dead && P.st < 99.5);
  const recent = G.time - Math.max(P.blockAt || -9, P.parryAt || -9, P.breakAt || -9) < 0.7, on = ok && (P.st < 99.5 || P.guarding || recent);
  if (el._on !== on) { el._on = on; el.style.opacity = on ? 1 : 0; }
  tag(el, 'guard', ok && !!P.guarding);
  if (!on && !el._vis) return; el._vis = on;
  const e = cam.matrixWorld.elements; cv.set(P.pos.x + e[0] * 0.62, P.pos.y + 1.22, P.pos.z + e[2] * 0.62).project(cam);
  el.style.transform = `translate(${((cv.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - cv.y) / 2 * innerHeight).toFixed(1)}px)`;
  const s = Math.round(P.st); if (s !== rg.st) { rg.st = s; $('ringf').style.strokeDashoffset = 100 - s; tag(el, 'low', s < 25); }
  if ((P.blockAt || 0) !== rg.bl) { rg.bl = P.blockAt || 0; kick(el, 'hit'); } if ((P.parryAt || 0) !== rg.pa) { rg.pa = P.parryAt || 0; kick(el, 'parry'); } if ((P.breakAt || 0) !== rg.br) { rg.br = P.breakAt || 0; kick(el, 'broke'); }
}

// Javelins. A red mark on a circle round him, on the side the throw is coming from (so it is read without finding the thrower):
// it pulses while a thrower winds up at him, and burns steady while the javelin is in the air.
const tpool = [];
function threats() {
  const box = $('threats'), P = G.player, cam = G.camera; let n = 0;
  if (live()) {
    const e = cam.matrixWorld.elements, rx = e[0], rz = e[2], fl = Math.hypot(e[8], e[10]) || 1, fx = -e[8] / fl, fz = -e[10] / fl; // the camera's right, and its forward along the ground
    cv.set(P.pos.x, P.pos.y + 1.1, P.pos.z).project(cam); const cx = (cv.x + 1) / 2 * innerWidth, cy = (1 - cv.y) / 2 * innerHeight, R = Math.max(92, Math.min(132, Math.min(innerWidth, innerHeight) * 0.2));
    const mark = (p, fly) => {
      if (n >= 5) return; const dx = p.x - P.pos.x, dz = p.z - P.pos.z, a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      let el = tpool[n]; if (!el) { el = tpool[n] = document.createElement('div'); el.className = 'threat'; el.innerHTML = '<svg viewBox="0 0 60 26"><path d="M5 23Q30 3 55 23"/><path d="M30 0l8 10h-16z"/></svg>'; box.appendChild(el); }
      n++; tag(el, 'fly', fly); tag(el, 'wind', !fly); if (el._d !== 1) { el._d = 1; el.style.display = 'block'; }
      el.style.transform = `translate(${(cx + Math.sin(a) * R).toFixed(1)}px,${(cy - Math.cos(a) * R).toFixed(1)}px) rotate(${a.toFixed(2)}rad)`;
    };
    for (const j of G.missiles || []) if (!j.spent && j.at === P) mark(cv.set(P.pos.x - j.vel.x, 0, P.pos.z - j.vel.z), true); // (the side it is flying in from, not where it is: one about to pass him would read as behind)
    for (const f of G.enemies) if (!f.dead && f.state === 'wind' && f.mv && f.mv.throw && !f.marked()) mark(f.pos, false);
  }
  for (let i = n; i < tpool.length; i++) if (tpool[i]._d !== 0) { tpool[i]._d = 0; tpool[i].style.display = 'none'; }
}

// The tip the fight is slowed for (ui.tip), if one is up.
let tipS = null;
function unfocus() { if (!G.focus && !tipS) return; G.focus = 0; $('hint').classList.remove('tip'); $('hud').classList.remove('focus'); const s = tipS; tipS = null; if (s) s.res(); }
function focus() {
  const s = tipS; if (!s) return; s.t += G.rdt || 0; const p = G.player;
  if (!G.focus || s.t > s.dur || (s.t > 0.8 && s.done && s.done()) || G.talking || G.cinematic || (p && p.dead) || ui._hint !== s.text) unfocus();
}
export const ui = {
  frame() {
    const p = G.player;
    if (p.hp !== lastHp) { lastHp = p.hp; bar('hp', p.hp / 100); }
    const t = G.talking || G.cinematic ? null : G.boss && !G.boss.dead ? G.boss : p.lock; // no target bar under dialogue or a cutscene
    if (t !== lastT) { lastT = t; const el = $('tgt'); el.style.opacity = t ? 1 : 0; el.classList.toggle('boss', !!(t && t === G.boss)); if (t) $('tname').textContent = t.title || t.type.name; lastThp = -1; }
    if (t) { const h = frac(t); if (h !== lastThp) { lastThp = h; bar('thp', h); } }
    // With a boss on the field the main bar is his. Locked on to someone else (his guards, the two called into the ring), that foe gets the small bar at the top.
    const l = t && t === G.boss && p.lock && p.lock !== t && !p.lock.dead ? p.lock : null;
    if (l !== lastL) { lastL = l; $('lk').style.opacity = l ? 1 : 0; if (l) $('lname').textContent = l.title || l.type.name; lastLhp = -1; }
    if (l) { const h = frac(l); if (h !== lastLhp) { lastLhp = h; bar('lhp', h); } }
    if (G.hold) bar('holdp', G.hold.progress);
    plates(); wayPoint(); ring(); threats(); focus();
  },
  // A new objective or hint arrives with a short gold flash and a soft cue, so it is seen (a count ticking up inside one is not new).
  objective(text) { const el = $('obj'), key = (text || '').replace(/\d+/g, ''); el.textContent = text || ''; el.style.opacity = text ? 1 : 0; if (key && key !== ui._obj) arrive(el); ui._obj = key; },
  // A tip that must be read while a foe is loose (friends' playthrough, Nov 2026: they were hit while reading): the hint, larger and
  // up the screen, with the fight at a tenth speed and the picture dimmed and soft behind it (G.focus, main.js). It lifts when
  // `done()` says the player has done the thing (not in the first 0.8 s), or when the time to read it is up, or when a scene takes
  // over; the text then stays as an ordinary hint until the stage clears it. Resolves when it lifts. The test bot (G.auto) gets a plain hint.
  tip(text, done) {
    ui.hint(text, true); if (!text || G.auto) return Promise.resolve();
    $('hint').classList.add('tip'); $('hud').classList.add('focus'); G.focus = 1;
    return new Promise((res) => { tipS = { text, done, t: 0, dur: Math.min(7.5, 2 + text.replace(/<[^>]*>|[{}]/g, '').length * 0.055), res }; });
  },
  hint(text, keep) { if (!keep || !text) unfocus(); const el = $('hint'); if (text) el.innerHTML = fill(text); el.style.opacity = text ? 1 : 0; if (text && text !== ui._hint) arrive(el); ui._hint = text || ''; },
  // What the captain thinks: a plain line of italic text above the hint, no box. It stays only as long as it takes to read (dur is a ceiling), stops nothing and gives way to dialogue.
  // A bystander's line, said as he comes near: the dialogue box, but it stops nothing, asks for no click and goes by itself.
  // It looks different from a line that waits for a tap (owner, Nov 2026: in play it wasn't clear which was which): no prompt, lighter, and a bar that runs down to show it goes by itself.
  say(who, text, dur = 4.5) { ui.showLine(who, text, dur); ui._say = setTimeout(() => { if (!G.talking) ui.hideDialogue(); }, dur * 1000); },
  thought(text, dur = 5) { const el = $('thought'); clearTimeout(ui._th); el.classList.remove('on'); if (!text) return; el.textContent = text; void el.offsetWidth; el.classList.add('on'); ui._th = setTimeout(() => el.classList.remove('on'), Math.min(dur, 1.4 + text.length * 0.045) * 1000); },
  holdBar(on) { $('hold').style.display = on ? 'block' : 'none'; },
  banner(text, dur = 2) { const b = $('banner'); b.textContent = text; b.classList.toggle('long', text.length > 16); b.style.opacity = 1; clearTimeout(ui._bh); ui._bh = setTimeout(() => (b.style.opacity = 0), dur * 1000); },
  fade(to, sec = 1, col) { const f = $('fade'); if (to < 1 && ui._fade !== 0 && G.warm) G.warm(); ui._fade = to; /* coming up from a covered screen: the frame about to be shown is drawn first (main.js) */ if (col || ui._fc) f.style.background = (ui._fc = col) || ''; f.style.transitionDuration = sec + 's'; f.style.opacity = to; }, // col: a wash of some other colour than the dark (it stays until a fade without one)
  cinematic(on) { $('bars').style.opacity = on ? 0 : 1; if (on) { ui.objectiveHidden = true; $('obj').style.visibility = 'hidden'; } else $('obj').style.visibility = 'visible'; },
  // dialogue
  // showLine(who, text): a line that waits for a tap, with a plain prompt. showLine(who, text, dur): a passing line (say).
  showLine(who, text, dur) {
    const d = $('dlg'), bar = $('dtime'), wait = dur == null;
    clearTimeout(ui._say); ui.thought(''); $('dmore').style.visibility = wait ? 'visible' : 'hidden'; d.classList.toggle('say', !wait); d.classList.toggle('wait', wait); d.style.display = 'block';
    bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)'; if (!wait) { void bar.offsetWidth; bar.style.transition = `transform ${dur}s linear`; bar.style.transform = 'scaleX(0)'; } $('hint').style.visibility = 'hidden'; $('dwho').textContent = who || ''; G.speaker = (who || '').toUpperCase(); const el = $('dtxt'); el.textContent = '';
    clearInterval(typing); let i = 0; ui.lineDone = false;
    typing = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typing); ui.lineDone = true; } }, 22);
    ui._full = text;
  },
  completeLine() { clearInterval(typing); $('dtxt').textContent = ui._full; ui.lineDone = true; },
  hideDialogue() { G.speaker = ''; clearTimeout(ui._say); $('dlg').style.display = 'none'; $('hint').style.visibility = 'visible'; clearInterval(typing); },
  // chronicle: full-screen text between scenes. Every entry is laid out up front and
  // revealed in turn, so nothing on the page moves as new lines appear.
  chronOpen(head, lines, tap) {
    $('chead').textContent = head; const box = $('clines'); box.innerHTML = ''; $('ctap').textContent = tap; $('ctap').classList.remove('on');
    const c = $('chron'); c.classList.remove('on', 'out'); c.style.display = 'flex'; void c.offsetWidth; c.classList.add('on'); // the reflow lets the header fade in, not just appear
    return lines.map((html) => { const p = document.createElement('p'); p.innerHTML = html; box.appendChild(p); return p; });
  },
  chronShow(el) { void el.offsetWidth; el.classList.add('on'); $('ctap').classList.add('on'); }, // the prompt fades in once the first line is in
  chronFade() { $('chron').classList.add('out'); }, // the page fades to the dark behind it before it is closed
  chronClose() { $('chron').style.display = 'none'; },
};
