import { G } from '../core/game.js';
import { SFX } from '../core/audio.js';
import { ui } from '../ui/hud.js';

// Lets a stage be written as a straight-line async script:
//   await d.talk([...]); await d.until(() => enemiesDead()); await d.wait(1);
// Everything is polled from the game loop, so aborting a stage is just rejecting what's pending.
export class Director {
  constructor() { this.waiters = []; this.tweens = []; this.ticks = new Set(); }
  until(fn) { return new Promise((res, rej) => this.waiters.push({ fn, res, rej })); }
  wait(sec) { const end = G.clock + (G.auto ? Math.min(sec, 0.05) : sec); return this.until(() => G.clock >= end); }
  tween(dur, fn) { return new Promise((res, rej) => this.tweens.push({ t: 0, dur: G.auto ? 0.05 : dur, fn, res, rej })); }
  // Run fn(dt) every frame until the returned function is called or the stage ends.
  every(fn) { this.ticks.add(fn); return () => this.ticks.delete(fn); }
  update(dt) {
    for (const fn of [...this.ticks]) fn(dt);
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]; tw.t += dt; const u = Math.min(1, tw.t / tw.dur); tw.fn(u);
      if (u >= 1) { this.tweens.splice(i, 1); tw.res(); }
    }
    const ws = this.waiters; this.waiters = [];
    for (const w of ws) { let ok = false; try { ok = w.fn(); } catch (e) { w.rej(e); continue; } if (ok) w.res(); else this.waiters.push(w); }
  }
  abort() {
    const ws = this.waiters, ts = this.tweens; this.waiters = []; this.tweens = []; this.ticks.clear();
    for (const w of ws) w.rej('abort'); for (const t of ts) t.rej('abort');
  }
  confirmed() { if (G.auto) return true; if (G.confirm) { G.confirm = false; return true; } return false; }
  async talk(lines) {
    const p = G.player, was = p.controlEnabled; p.controlEnabled = false;
    for (const [who, text] of lines) {
      ui.showLine(who, text); SFX.blip(); G.confirm = false;
      if (G.auto) { await this.wait(0.03); continue; }
      await this.wait(0.15);
      await this.until(() => { if (!this.confirmed()) return false; if (!ui.lineDone) { ui.completeLine(); return false; } return true; });
    }
    ui.hideDialogue(); G.confirm = false; p.controlEnabled = was; p.buf.a = '';
  }
  async chronicle(head, lines, tap) {
    ui.chronOpen(head, tap);
    for (const html of lines) {
      const el = ui.chronLine(html); const s = el.querySelector('.strike');
      if (s) { await this.wait(1.4); s.classList.add('done'); }
      await this.wait(0.5); G.confirm = false;
      await this.until(() => this.confirmed());
    }
  }
}
