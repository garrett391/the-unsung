// All sound is synthesized: no audio files to load.
let AC = null, master = null, nbuf = null;
export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.45; master.connect(AC.destination);
    nbuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
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
export const SFX = {
  swing: (p = 1) => noise(0.17, 0.22, 700 * p, 3000 * p, 'bandpass', 1.4),
  hit: () => { noise(0.11, 0.5, 2400, 400, 'bandpass', 0.7); tone(120, 0.13, 'triangle', 0.4, 48); },
  big: () => { noise(0.2, 0.6, 1800, 200, 'bandpass', 0.6); tone(90, 0.25, 'triangle', 0.5, 35); },
  clang: () => { [640, 1012, 1630].forEach((f) => tone(f, 0.16, 'square', 0.05)); noise(0.05, 0.3, 5000, 2500); },
  parry: () => { tone(1568, 0.55, 'sine', 0.22); tone(2349, 0.7, 'sine', 0.15); tone(3136, 0.4, 'sine', 0.08); noise(0.04, 0.3, 7000, 6000); },
  roll: () => noise(0.26, 0.14, 250, 800, 'bandpass', 0.8),
  hurt: () => { tone(190, 0.28, 'sawtooth', 0.2, 70); noise(0.12, 0.3, 900, 300); },
  tele: () => tone(990, 0.1, 'square', 0.045, 1480),
  charged: () => { tone(1175, 0.35, 'sine', 0.16); tone(1760, 0.45, 'sine', 0.1, null, 0.05); },
  boom: () => { noise(0.55, 0.7, 500, 50, 'lowpass', 0.7); tone(74, 0.5, 'sine', 0.6, 30); },
  die: () => noise(0.7, 0.22, 2600, 160, 'bandpass', 0.5),
  blip: () => tone(520, 0.05, 'triangle', 0.05),
  learn: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.5, 'triangle', 0.09, null, i * 0.09)); },
  horn: () => { tone(110, 2.4, 'sawtooth', 0.16, 104); tone(165, 2.4, 'sawtooth', 0.1, 156, 0.05); noise(2.2, 0.08, 300, 200, 'lowpass'); },
  fall: () => { [294, 247, 196, 147].forEach((f, i) => tone(f, 0.8, 'triangle', 0.1, null, i * 0.22)); },
  dawn: () => { [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 2.2, 'sine', 0.08, null, i * 0.35)); },
  flame: () => { noise(0.9, 0.5, 200, 1800, 'bandpass', 0.6); tone(60, 0.8, 'sine', 0.4, 40); },
};
