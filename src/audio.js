// Everything here is synthesized with Web Audio. All melodies are original.
import { clamp } from './util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const _ = null;

const SONGS = {
  camp: {
    bpm: 72,
    drone: [38, 45],
    droneType: 'triangle', droneVol: 0.05, droneCut: 420,
    lead: [74, _, _, 69, _, _, 72, _, 74, _, 76, _, 77, _, 76, _, 74, _, _, _, 72, _, 69, _, 67, _, _, _, 69, _, _, _],
    leadVol: 0.1, leadType: 'triangle', pluck: true,
  },
  battle: {
    bpm: 112,
    drone: [50, 53, 57],
    droneType: 'sawtooth', droneVol: 0.022, droneCut: 700,
    bass: [38, 38, 41, 38, 43, 38, 41, 40],
    bassVol: 0.11,
    drums: { kick: [0, 3, 6], snare: [4], tom: [7] },
    lead: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, 74, _, _, 72, _, _, 69, _, 70, _, _, _, 69, _, _, _],
    leadVol: 0.05, leadType: 'square', leadCut: 1400,
  },
  grief: {
    bpm: 56,
    drone: [38, 45, 50],
    droneType: 'sine', droneVol: 0.06, droneCut: 900,
    lead: [81, _, _, _, _, _, _, _, 79, _, _, _, _, _, _, _, 77, _, _, _, _, _, _, _, 76, _, _, _, 74, _, _, _],
    leadVol: 0.06, leadType: 'sine', slow: true,
  },
  boss: {
    bpm: 96,
    drone: [38, 44],
    droneType: 'sawtooth', droneVol: 0.025, droneCut: 520,
    bass: [38, 38, 44, 38, 38, 43, 44, 41],
    bassVol: 0.12,
    drums: { kick: [0, 4], snare: [], tom: [6, 7] },
  },
  boss2: {
    bpm: 96,
    drone: [38, 44],
    droneType: 'sine', droneVol: 0.05, droneCut: 300,
    bass: [38, _, _, _, 44, _, _, _],
    bassVol: 0.08,
    heart: true,
  },
  dawn: {
    bpm: 76,
    drone: [50, 54, 57],
    droneType: 'triangle', droneVol: 0.035, droneCut: 900,
    lead: [78, _, 76, _, 74, _, 69, _, 71, _, 74, _, 76, _, _, _, 78, _, 81, _, 79, _, 78, _, 76, _, _, _, _, _, _, _,
      74, _, 76, _, 78, _, 74, _, 71, _, _, _, 69, _, _, _, 74, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    leadVol: 0.09, leadType: 'triangle', pluck: true,
  },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mode = 'none';
    this.drone = null;
  }
  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    if (c.state !== 'running') c.resume().catch(() => {});
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.mus = c.createGain();
    this.mus.gain.value = 0.55;
    this.mus.connect(this.master);
    this.musIn = c.createGain();
    this.musIn.connect(this.mus);
    const delay = c.createDelay(1.0);
    delay.delayTime.value = 0.37;
    const fb = c.createGain();
    fb.gain.value = 0.33;
    const wet = c.createGain();
    wet.gain.value = 0.4;
    this.musIn.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(this.mus);
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.startWind();
    this.nextT = c.currentTime + 0.1;
    this.step = 0;
    this.crackle = 0;
    this.timer = setInterval(() => this.schedule(), 40);
    const m = this.mode;
    this.mode = 'none';
    this.setMusic(m);
  }
  setMuted(v) {
    this.muted = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  _out(dest, pan) {
    if (pan == null || !this.ctx.createStereoPanner) return dest;
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(dest);
    return p;
  }
  tone(f, dur, o = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = (o.when ?? c.currentTime) + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + (o.glide || dur));
    const g = c.createGain();
    const v = Math.max(0.0002, o.vol ?? 0.3);
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, a + 0.01));
    let node = osc;
    if (o.filter) {
      const f2 = c.createBiquadFilter();
      f2.type = o.filter;
      f2.frequency.value = o.ff || 1200;
      f2.Q.value = o.q || 0.7;
      osc.connect(f2);
      node = f2;
    }
    node.connect(g);
    g.connect(this._out(o.dest || this.sfx, o.pan));
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  noise(dur, o = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t0 = (o.when ?? c.currentTime) + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.ff || 1000, t0);
    if (o.ffTo) f.frequency.exponentialRampToValueAtTime(o.ffTo, t0 + dur);
    f.Q.value = o.q || 0.8;
    const g = c.createGain();
    const v = Math.max(0.0002, o.vol ?? 0.3);
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, a + 0.01));
    src.connect(f);
    f.connect(g);
    g.connect(this._out(o.dest || this.sfx, o.pan));
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }
  // ---- effects
  swing(pan, vol = 1) { this.noise(0.17, { ff: 2600, ffTo: 700, q: 1.3, vol: 0.22 * vol, pan }); }
  clank(pan, vol = 1) {
    for (const [f, v] of [[1180, 0.1], [1730, 0.08], [2650, 0.06], [3990, 0.03]]) this.tone(f, 0.28, { type: 'triangle', vol: v * vol, pan });
    this.noise(0.06, { filter: 'highpass', ff: 3000, vol: 0.22 * vol, pan });
  }
  hit(pan, vol = 1) {
    this.tone(150, 0.14, { to: 55, vol: 0.45 * vol, pan });
    this.noise(0.09, { filter: 'lowpass', ff: 1600, vol: 0.3 * vol, pan });
  }
  bash(pan) {
    this.tone(95, 0.2, { to: 45, vol: 0.5, pan });
    this.noise(0.13, { filter: 'lowpass', ff: 900, vol: 0.4, pan });
    this.clank(pan, 0.6);
  }
  roll() { this.noise(0.3, { filter: 'lowpass', ff: 520, ffTo: 260, vol: 0.16 }); }
  chargeStart() { this.tone(320, 0.5, { to: 880, type: 'triangle', vol: 0.05, attack: 0.05 }); }
  chargeReady() { this.tone(1320, 0.3, { vol: 0.1 }); this.tone(1980, 0.3, { vol: 0.05, delay: 0.04 }); }
  spin(great) {
    this.noise(great ? 0.6 : 0.45, { ff: 500, ffTo: 3200, q: 1.1, vol: 0.3 });
    if (great) {
      this.tone(55, 0.7, { vol: 0.5 });
      [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.5, { vol: 0.05, delay: 0.05 + i * 0.05 }));
    }
  }
  hurt() {
    this.tone(220, 0.25, { to: 110, type: 'square', filter: 'lowpass', ff: 900, vol: 0.16 });
    this.noise(0.12, { filter: 'lowpass', ff: 700, vol: 0.35 });
  }
  enemyDie(pan) {
    this.noise(0.55, { ff: 900, ffTo: 180, vol: 0.22, pan });
    this.tone(180, 0.45, { to: 55, type: 'sawtooth', filter: 'lowpass', ff: 600, vol: 0.1, pan });
  }
  windup(pan, vol = 1) {
    this.noise(0.22, { ff: 3600, q: 9, vol: 0.14 * vol, pan });
    this.tone(1800, 0.2, { to: 2500, type: 'triangle', vol: 0.03 * vol, pan });
  }
  heart() { this.tone(988, 0.12, { type: 'triangle', vol: 0.12 }); this.tone(1319, 0.22, { type: 'triangle', vol: 0.12, delay: 0.08 }); }
  lockOn() { this.tone(660, 0.07, { type: 'square', filter: 'lowpass', ff: 1800, vol: 0.05 }); this.tone(990, 0.08, { type: 'square', filter: 'lowpass', ff: 1800, vol: 0.04, delay: 0.05 }); }
  blip() { this.tone(880, 0.03, { type: 'square', filter: 'lowpass', ff: 1500, vol: 0.025 }); }
  chime() {
    [74, 81, 86].forEach((m, i) => this.tone(mtof(m), 1.1, { type: 'triangle', vol: 0.14, delay: i * 0.1, dest: this.musIn || this.sfx }));
  }
  horn() {
    if (!this.ctx) return;
    for (let k = 0; k < 2; k++) {
      const d = k * 1.5;
      this.tone(146.8, 1.25, { type: 'sawtooth', filter: 'lowpass', ff: 800, vol: 0.2, attack: 0.18, delay: d });
      this.tone(220, 1.25, { type: 'sawtooth', filter: 'lowpass', ff: 900, vol: 0.12, attack: 0.22, delay: d + 0.05 });
    }
  }
  heartbeat(vol = 1) {
    this.tone(58, 0.14, { vol: 0.55 * vol });
    this.tone(52, 0.16, { vol: 0.45 * vol, delay: 0.19 });
  }
  eyeSlash() {
    this.noise(0.3, { filter: 'highpass', ff: 2600, vol: 0.5 });
    this.tone(75, 1.3, { to: 30, vol: 0.7 });
    this.tone(5200, 4.0, { vol: 0.045, attack: 0.5 });
  }
  flameBurst(pan) {
    this.noise(0.8, { filter: 'lowpass', ff: 700, ffTo: 200, vol: 0.35, pan });
    this.tone(110, 0.7, { to: 50, vol: 0.3, pan });
  }
  slam(pan) {
    this.tone(70, 0.5, { to: 32, vol: 0.7, pan });
    this.noise(0.4, { filter: 'lowpass', ff: 500, vol: 0.5, pan });
  }
  draw() {
    this.noise(0.12, { filter: 'highpass', ff: 5000, vol: 0.3 });
    this.tone(3200, 0.6, { vol: 0.04, delay: 0.05 });
  }
  // ---- ambience
  startWind() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420;
    f.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 0.05;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 0.03;
    lfo.connect(lg);
    lg.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    lfo.start();
  }
  // ---- music
  setMusic(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this.ctx) return;
    const c = this.ctx;
    if (this.drone) {
      const old = this.drone;
      old.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
      setTimeout(() => old.oscs.forEach((o) => { try { o.stop(); } catch (e) {} }), 2500);
      this.drone = null;
    }
    const S = SONGS[mode];
    this.step = 0;
    this.nextT = c.currentTime + 0.15;
    if (!S) return;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(S.droneVol, c.currentTime, 0.8);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = S.droneCut;
    f.connect(g);
    g.connect(this.musIn);
    const oscs = [];
    for (const m of S.drone) {
      for (const det of [-6, 6]) {
        const o = c.createOscillator();
        o.type = S.droneType;
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(f);
        o.start();
        oscs.push(o);
      }
    }
    this.drone = { g, oscs };
  }
  schedule() {
    if (!this.ctx) return;
    const c = this.ctx;
    // campfire crackle
    if (this.crackle > 0.02 && Math.random() < 0.35 * this.crackle)
      this.noise(0.03, { filter: 'highpass', ff: 2500 + Math.random() * 3000, vol: 0.05 * this.crackle, when: c.currentTime + Math.random() * 0.04 });
    const S = SONGS[this.mode];
    if (!S) return;
    const spb = 60 / S.bpm / 2;
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.16) {
      this.playStep(S, this.step, this.nextT, spb);
      this.step++;
      this.nextT += spb;
    }
  }
  playStep(S, step, t, spb) {
    const d = this.musIn;
    if (S.lead) {
      const n = S.lead[step % S.lead.length];
      if (n != null) {
        if (S.slow) this.tone(mtof(n), spb * 7, { type: S.leadType, vol: S.leadVol, attack: 0.6, when: t, dest: d });
        else if (S.pluck) {
          this.tone(mtof(n), spb * 3.2, { type: S.leadType, vol: S.leadVol, attack: 0.008, when: t, dest: d, filter: 'lowpass', ff: 2200 });
          this.tone(mtof(n + 12), spb * 1.2, { type: 'sine', vol: S.leadVol * 0.25, attack: 0.005, when: t, dest: d });
        } else this.tone(mtof(n), spb * 2.6, { type: S.leadType, vol: S.leadVol, attack: 0.02, when: t, dest: d, filter: 'lowpass', ff: S.leadCut || 1600 });
      }
    }
    if (S.bass) {
      const n = S.bass[step % S.bass.length];
      if (n != null) this.tone(mtof(n), spb * 0.9, { type: 'sawtooth', vol: S.bassVol, attack: 0.01, when: t, dest: d, filter: 'lowpass', ff: 420, q: 2 });
    }
    if (S.drums) {
      const k = step % 8;
      if (S.drums.kick.includes(k)) this.tone(110, 0.22, { to: 40, vol: 0.5, when: t, dest: d, glide: 0.12 });
      if (S.drums.snare.includes(k)) this.noise(0.14, { filter: 'bandpass', ff: 1800, q: 0.7, vol: 0.18, when: t, dest: d });
      if (S.drums.tom.includes(k) && step % 16 >= 8) this.tone(180, 0.2, { to: 90, vol: 0.28, when: t, dest: d });
    }
    if (S.heart && step % 8 === 0) {
      this.tone(58, 0.14, { vol: 0.42, when: t, dest: d });
      this.tone(52, 0.16, { vol: 0.32, when: t + 0.19, dest: d });
    }
  }
}
