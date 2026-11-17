import { Vector3 } from 'three';
import { G } from '../core/game.js';
import { $ } from '../core/util.js';
import { label } from '../core/input.js';
import { SFX } from '../core/audio.js';

// DOM overlay: bars, objective, hints, dialogue, the chronicle screens, fades.
let lastHp = -1, lastSt = -1, lastT = null, lastThp = -1, typing = null;
const bar = (id, v) => { $(id).style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`; };
// "{l}" in a hint becomes the right button name for this device.
const fill = (s) => s.replace(/\{(\w+)\}/g, (_, a) => `<b>${label(a)}</b>`);
const arrive = (el) => { el.classList.remove('new'); void el.offsetWidth; el.classList.add('new'); if (!G.auto) SFX.cue(); };

// A refused dodge or heavy (not enough stamina) flashes the stamina bar.
G.on((k) => { if (k !== 'tired') return; const b = $('st').parentNode; b.classList.remove('tired'); void b.offsetWidth; b.classList.add('tired'); });

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
  if (G.running && !G.cinematic && P.root.visible) {
    const fight = G.enemies.some((e) => !e.dead && !e.hold);
    if (fight) {
      for (const a of G.allies) if (a.root.visible) show(a, a.type.name, a.soldier ? a.hp / a.maxHp : null, a.out);
      const c = G.corin; if (c && c.root.visible && c.mode === 'battle') show(c, c.type.name, null);
    } else for (const e of [...G.allies, ...G.extras]) if (e.type.name && e.root.visible && !e.dead && P.dist(e) < 4.5) show(e, e.type.name, null);
  }
  for (let i = n; i < pool.length; i++) if (pool[i].style.display !== 'none') pool[i].style.display = 'none';
}

export const ui = {
  frame() {
    const p = G.player;
    if (p.hp !== lastHp) { lastHp = p.hp; bar('hp', p.hp / 100); }
    const s = Math.round(p.st); if (s !== lastSt) { lastSt = s; bar('st', s / 100); }
    const t = G.talking || G.cinematic ? null : G.boss && !G.boss.dead ? G.boss : p.lock; // no target bar under dialogue or a cutscene
    if (t !== lastT) { lastT = t; const el = $('tgt'); el.style.opacity = t ? 1 : 0; el.classList.toggle('boss', !!(t && t === G.boss)); if (t) $('tname').textContent = t.title || t.type.name; lastThp = -1; }
    if (t) { const h = t.hp / t.maxHp; if (h !== lastThp) { lastThp = h; bar('thp', h); } }
    if (G.hold) bar('holdp', G.hold.progress);
    plates();
  },
  // A new objective or hint arrives with a short gold flash and a soft cue, so it is seen (a count ticking up inside one is not new).
  objective(text) { const el = $('obj'), key = (text || '').replace(/\d+/g, ''); el.textContent = text || ''; el.style.opacity = text ? 1 : 0; if (key && key !== ui._obj) arrive(el); ui._obj = key; },
  hint(text) { const el = $('hint'); if (text) el.innerHTML = fill(text); el.style.opacity = text ? 1 : 0; if (text && text !== ui._hint) arrive(el); ui._hint = text || ''; },
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
    bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)'; if (!wait) { void bar.offsetWidth; bar.style.transition = `transform ${dur}s linear`; bar.style.transform = 'scaleX(0)'; } $('hint').style.visibility = 'hidden'; $('dwho').textContent = who || ''; const el = $('dtxt'); el.textContent = '';
    clearInterval(typing); let i = 0; ui.lineDone = false;
    typing = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typing); ui.lineDone = true; } }, 22);
    ui._full = text;
  },
  completeLine() { clearInterval(typing); $('dtxt').textContent = ui._full; ui.lineDone = true; },
  hideDialogue() { clearTimeout(ui._say); $('dlg').style.display = 'none'; $('hint').style.visibility = 'visible'; clearInterval(typing); },
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
