import { G } from '../core/game.js';
import { $ } from '../core/util.js';
import { label } from '../core/input.js';

// DOM overlay: bars, objective, hints, dialogue, the chronicle screens, fades.
let lastHp = -1, lastSt = -1, lastT = null, lastThp = -1, typing = null;
const bar = (id, v) => { $(id).style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`; };
// "{l}" in a hint becomes the right button name for this device.
const fill = (s) => s.replace(/\{(\w+)\}/g, (_, a) => `<b>${label(a)}</b>`);

// A refused dodge or heavy (not enough stamina) flashes the stamina bar.
G.on((k) => { if (k !== 'tired') return; const b = $('st').parentNode; b.classList.remove('tired'); void b.offsetWidth; b.classList.add('tired'); });

export const ui = {
  frame() {
    const p = G.player;
    if (p.hp !== lastHp) { lastHp = p.hp; bar('hp', p.hp / 100); }
    const s = Math.round(p.st); if (s !== lastSt) { lastSt = s; bar('st', s / 100); }
    const t = G.talking || G.cinematic ? null : G.boss && !G.boss.dead ? G.boss : p.lock; // no target bar under dialogue or a cutscene
    if (t !== lastT) { lastT = t; const el = $('tgt'); el.style.opacity = t ? 1 : 0; el.classList.toggle('boss', !!(t && t === G.boss)); if (t) $('tname').textContent = t.type.name; lastThp = -1; }
    if (t) { const h = t.hp / t.maxHp; if (h !== lastThp) { lastThp = h; bar('thp', h); } }
    if (G.hold) bar('holdp', G.hold.progress);
  },
  objective(text) { const el = $('obj'); el.textContent = text || ''; el.style.opacity = text ? 1 : 0; },
  hint(text) { const el = $('hint'); if (text) el.innerHTML = fill(text); el.style.opacity = text ? 1 : 0; },
  holdBar(on) { $('hold').style.display = on ? 'block' : 'none'; },
  banner(text, dur = 2) { const b = $('banner'); b.textContent = text; b.classList.toggle('long', text.length > 16); b.style.opacity = 1; clearTimeout(ui._bh); ui._bh = setTimeout(() => (b.style.opacity = 0), dur * 1000); },
  fade(to, sec = 1) { const f = $('fade'); f.style.transitionDuration = sec + 's'; f.style.opacity = to; },
  cinematic(on) { $('bars').style.opacity = on ? 0 : 1; if (on) { ui.objectiveHidden = true; $('obj').style.visibility = 'hidden'; } else $('obj').style.visibility = 'visible'; },
  // dialogue
  showLine(who, text) {
    $('dlg').style.display = 'block'; $('hint').style.visibility = 'hidden'; $('dwho').textContent = who || ''; const el = $('dtxt'); el.textContent = '';
    clearInterval(typing); let i = 0; ui.lineDone = false;
    typing = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(typing); ui.lineDone = true; } }, 22);
    ui._full = text;
  },
  completeLine() { clearInterval(typing); $('dtxt').textContent = ui._full; ui.lineDone = true; },
  hideDialogue() { $('dlg').style.display = 'none'; $('hint').style.visibility = 'visible'; clearInterval(typing); },
  // chronicle: full-screen text between scenes. Every entry is laid out up front and
  // revealed in turn, so nothing on the page moves as new lines appear.
  chronOpen(head, lines, tap) {
    $('chead').textContent = head; const box = $('clines'); box.innerHTML = ''; $('ctap').textContent = tap; $('ctap').style.visibility = 'hidden'; $('chron').style.display = 'flex';
    return lines.map((html) => { const p = document.createElement('p'); p.innerHTML = html; box.appendChild(p); return p; });
  },
  chronShow(el) { el.classList.add('on'); $('ctap').style.visibility = 'visible'; },
  chronClose() { $('chron').style.display = 'none'; },
};
