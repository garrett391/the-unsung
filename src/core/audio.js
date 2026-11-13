// Sound effects are synthesized; music is the one thing loaded from a file.
let AC = null, master = null, nbuf = null;
export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => {}); return; }
  makeContext();
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
}
// Creating the context needs no gesture; it simply stays suspended (silent) until
// initAudio() runs from a tap, click or key, which is when browsers allow sound.
function makeContext() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.45; master.connect(AC.destination);
    nbuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}

// Looping music. Played through Web Audio rather than an <audio> element so the loop
// has no gap and it starts the moment the context is unlocked.
const MUSIC_VOL = 0.55;
let mus = null, musWant = false;
export function playMusic(url) {
  makeContext(); if (!AC || mus) return;
  musWant = true;
  fetch(url).then((r) => r.arrayBuffer())
    .then((b) => new Promise((ok, no) => AC.decodeAudioData(b, ok, no)))
    .then((buf) => {
      if (!musWant || mus) return;
      const src = AC.createBufferSource(), g = AC.createGain(), t = AC.currentTime;
      src.buffer = buf; src.loop = true;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(MUSIC_VOL, t + 2.5);
      src.connect(g); g.connect(AC.destination); src.start(t);
      mus = { src, g };
    })
    .catch(() => { /* no music: the game plays on without it */ });
}
export function stopMusic(fade = 2.5) {
  musWant = false;
  if (!mus || !AC) return;
  const { src, g } = mus, t = AC.currentTime; mus = null;
  try {
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade + 0.05);
  } catch (e) { /* ignore */ }
}
function tone(f, dur, type, vol, to, delay) {
  if (!AC) return;
  try {
    const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* ignore */ }
}
function noise(dur, vol, f0, f1, ft, q) {
  if (!AC) return;
  try {
    const t = AC.currentTime, s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = nbuf; s.loop = true; fl.type = ft || 'bandpass'; fl.Q.value = q || 1;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  } catch (e) { /* ignore */ }
}
// Steel on steel: a noise scrape plus a few inharmonic partials that die fast, so it
// reads as metal rather than a musical ping.
function steel(base, vol, ring) {
  noise(0.06, vol * 1.4, 4200, 1800, 'bandpass', 0.9);
  [1, 2.76, 5.4, 8.9].forEach((m, i) => tone(base * m, ring / (1 + i * 0.7), 'triangle', vol / (1 + i * 1.3), base * m * 0.985));
}
export const SFX = {
  swing: (p = 1) => noise(0.17, 0.22, 700 * p, 3000 * p, 'bandpass', 1.4),
  hit: () => { noise(0.11, 0.5, 2400, 400, 'bandpass', 0.7); tone(120, 0.13, 'triangle', 0.4, 48); },
  big: () => { noise(0.2, 0.6, 1800, 200, 'bandpass', 0.6); tone(90, 0.25, 'triangle', 0.5, 35); },
  clang: () => { steel(410, 0.09, 0.16); noise(0.09, 0.3, 900, 300, 'bandpass', 0.8); },
  parry: () => { steel(560, 0.13, 0.32); noise(0.28, 0.16, 6000, 2200, 'bandpass', 1.2); tone(140, 0.16, 'triangle', 0.25, 70); },
  roll: () => noise(0.26, 0.14, 250, 800, 'bandpass', 0.8),
  hurt: () => { tone(190, 0.28, 'sawtooth', 0.2, 70); noise(0.12, 0.3, 900, 300); },
  // an enemy draws back to strike: a short breath of cloth and leather, not a beep
  tele: () => noise(0.16, 0.12, 380, 1100, 'bandpass', 0.9),
  charged: () => { noise(0.4, 0.14, 500, 2600, 'bandpass', 2); tone(220, 0.4, 'triangle', 0.1, 330); },
  boom: () => { noise(0.55, 0.7, 500, 50, 'lowpass', 0.7); tone(74, 0.5, 'sine', 0.6, 30); },
  die: () => noise(0.7, 0.22, 2600, 160, 'bandpass', 0.5),
  blip: () => noise(0.035, 0.05, 1800, 1400, 'bandpass', 1.5),
  learn: () => { tone(98, 0.9, 'triangle', 0.16, 96); tone(147, 0.9, 'triangle', 0.08, 145, 0.04); noise(0.3, 0.12, 200, 90, 'lowpass'); },
  horn: () => { tone(110, 2.4, 'sawtooth', 0.16, 104); tone(165, 2.4, 'sawtooth', 0.1, 156, 0.05); noise(2.2, 0.08, 300, 200, 'lowpass'); },
  fall: () => { [294, 247, 196, 147].forEach((f, i) => tone(f, 0.8, 'triangle', 0.1, null, i * 0.22)); },
  dawn: () => { [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 2.2, 'sine', 0.08, null, i * 0.35)); },
  flame: () => { noise(0.9, 0.5, 200, 1800, 'bandpass', 0.6); tone(60, 0.8, 'sine', 0.4, 40); },
};
