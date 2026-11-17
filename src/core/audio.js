// Most sound effects are synthesized. Music, and the steel of blows landing and being stopped, are loaded from files.
let AC = null, master = null, nbuf = null;
// Called on every tap, click and key. It wakes the context whenever it is not running: not only the
// 'suspended' of a fresh page but iOS's 'interrupted', which is what switching away from Safari leaves it in
// (owner, Nov 2026: on a phone the music stopped when he left the browser and never came back; only
// 'suspended' used to be resumed). If iOS won't wake it, the context is rebuilt and the music started again.
let waking = 0;
export function initAudio() {
  if (!AC) makeContext();
  if (!AC || AC.state === 'running' || document.hidden) return;
  try { const p = AC.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  const ctx = AC; clearTimeout(waking);
  waking = setTimeout(() => { if (AC === ctx && AC.state !== 'running' && !document.hidden) rebuild(); }, 900); // a tap should wake it at once: still asleep after one, it is dead
}
// Leaving the page: let the music rest (phones stop it anyway). Coming back: wake it where the browser
// allows it without a tap (desktop, Android); on iOS the next tap does it.
document.addEventListener('visibilitychange', () => {
  if (!AC) return;
  if (document.hidden) { if (AC.state === 'running') AC.suspend().catch(() => {}); }
  else AC.resume().catch(() => {});
});
// A new context in place of one that will not wake. Decoded buffers carry over; the track that was wanted starts again from its top.
function rebuild() {
  const old = AC, w = want; try { old.close(); } catch (e) { /* ignore */ }
  AC = null; mus = null; quietAt = 0; makeContext(); if (!AC) return;
  try { AC.resume().catch(() => {}); } catch (e) { /* ignore */ }
  if (w) { want = { ...w, at: 0, fade: 1.5 }; AC.addEventListener('statechange', startMusic); loadTrack(w.name).then(startMusic); }
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
    if (!takes.hit) loadTakes(); if (!Object.keys(longs).length) loadLongs(); // (a rebuilt context keeps what was already decoded)
  } catch (e) { AC = null; }
}

// Music. Played through Web Audio rather than an <audio> element so loops have no gap. A
// track is decoded when first asked for, and only started once the context is really running:
// a source started while it is still suspended stutters as the context wakes. One track plays
// at a time; asking for another fades the current one out first, and the new one fades in after it.
const BASE = import.meta.env.BASE_URL, MUSIC_VOL = 0.55;
export const TRACKS = { title: 'music/title.mp3', blade: 'music/blade.mp3', sealed: 'music/sealed.mp3', flagstones: 'music/flagstones.mp3', granite: 'music/granite.mp3', well: 'music/well.mp3', hinges: 'music/hinges.mp3', measure: 'music/measure.mp3', wind: 'music/wind.mp3', watch: 'music/watch.mp3' };
const bufs = new Map(); // name -> AudioBuffer, or the promise of one
let mus = null, want = null, quietAt = 0; // quietAt: when the last track faded out will be silent
function loadTrack(name) {
  if (!bufs.has(name)) bufs.set(name, fetch(BASE + TRACKS[name]).then((r) => r.arrayBuffer())
    .then((b) => new Promise((ok, no) => AC.decodeAudioData(b, ok, no)))
    .then((buf) => { bufs.set(name, buf); return buf; })
    .catch(() => { bufs.delete(name); /* no music: the game plays on without it */ }));
  return Promise.resolve(bufs.get(name));
}
function startMusic() {
  if (!want || mus || !AC || AC.state !== 'running') return;
  const buf = bufs.get(want.name); if (!buf || !buf.getChannelData) return;
  const src = AC.createBufferSource(), g = AC.createGain(), w = want, t = Math.max(AC.currentTime + 0.25, w.at); // a beat for the output to settle, and the old track gone
  src.buffer = buf; src.loop = w.loop;
  g.gain.setValueAtTime(0, AC.currentTime); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(MUSIC_VOL * w.vol, t + w.fade);
  src.connect(g); g.connect(AC.destination); src.start(t);
  mus = { src, g, name: w.name };
  if (!w.loop) src.onended = () => { if (mus && mus.src === src) { mus = null; want = null; } };
}
function fadeOut(fade) { // returns when the track will be silent
  if (!mus || !AC) return quietAt;
  const { src, g } = mus, t = AC.currentTime; mus = null;
  try {
    // Fade from wherever the volume is now, including part-way through the fade-in. Not
    // cancelAndHoldAtTime: in Chrome it drops a finished fade-in to half volume at once.
    const v = g.gain.value; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(v, t);
    g.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade + 0.05);
  } catch (e) { /* ignore */ }
  return (quietAt = t + fade);
}
// playMusic('blade', { loop, fade: seconds to come in, cross: seconds for the old track to go out first, over: overlap the two instead, vol })
export function playMusic(name, o = {}) {
  makeContext(); if (!AC || (want && want.name === name)) return;
  const q = fadeOut(o.cross == null ? 2 : o.cross), at = o.over ? 0 : q; // over: the new track comes in while the old goes out (a true crossfade, no gap)
  want = { name, at, loop: o.loop !== false, fade: o.fade == null ? 3 : o.fade, vol: o.vol == null ? 1 : o.vol };
  AC.removeEventListener('statechange', startMusic); AC.addEventListener('statechange', startMusic);
  loadTrack(name).then(startMusic);
}
// Raise or lower the track that is playing (or on its way in) without restarting it: vol is 0 to 1 of the music's level.
export function musicVol(vol, dur = 2) {
  if (want) want.vol = vol; if (!mus || !AC) return;
  try { const g = mus.g.gain, t = AC.currentTime, v = g.value; g.cancelScheduledValues(t); g.setValueAtTime(v, t); g.linearRampToValueAtTime(MUSIC_VOL * vol, t + dur); } catch (e) { /* ignore */ }
}
export function preloadMusic(...names) { makeContext(); if (AC) for (const n of names) loadTrack(n); }
export function stopMusic(fade = 2.5) { want = null; fadeOut(fade); }
// Drop decoded tracks that are not playing (a few minutes of stereo is tens of megabytes).
export function forgetMusic() { for (const k of [...bufs.keys()]) if (!(mus && mus.name === k) && !(want && want.name === k)) bufs.delete(k); }

// Recorded steel for the blows that land or are stopped (docs/music.md has the source). Each
// kind has a few takes; one is picked at random, never the same twice running, at a slightly
// varied pitch. Until they have loaded, or if they fail to, the synthesized versions play.
const TAKES = { hit: 5, big: 3, clang: 4, parry: 4 }, takes = {}, lastTake = {};
function loadTakes() {
  for (const k in TAKES) { takes[k] = []; for (let i = 1; i <= TAKES[k]; i++) fetch(`${BASE}sfx/${k}${i}.wav`).then((r) => r.arrayBuffer()).then((b) => new Promise((ok, no) => AC.decodeAudioData(b, ok, no))).then((buf) => takes[k].push(buf)).catch(() => {}); }
}
// Longer recorded effects that a scene starts and stops: SFX.quake() returns a stop(fade).
const LONG = { quake: 'sfx/quake.mp3', horn: 'sfx/horn.mp3' }, longs = {};
function loadLongs() { for (const k in LONG) fetch(BASE + LONG[k]).then((r) => r.arrayBuffer()).then((b) => new Promise((ok, no) => AC.decodeAudioData(b, ok, no))).then((buf) => { longs[k] = buf; }).catch(() => {}); }
function long(name, vol) {
  const none = () => {}; if (!AC || !longs[name]) return none;
  try {
    const s = AC.createBufferSource(), g = AC.createGain(); s.buffer = longs[name]; g.gain.value = vol; s.connect(g); g.connect(master); s.start();
    return (fade = 1) => { try { const t = AC.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); s.stop(t + fade + 0.05); } catch (e) { /* ignore */ } };
  } catch (e) { return none; }
}
function take(kind, vol, rate = 1) {
  const list = takes[kind]; if (!AC || !list || !list.length) return false;
  try {
    let i = (Math.random() * list.length) | 0; if (list.length > 1 && i === lastTake[kind]) i = (i + 1) % list.length; lastTake[kind] = i;
    const s = AC.createBufferSource(), g = AC.createGain(); s.buffer = list[i]; s.playbackRate.value = rate * (0.94 + Math.random() * 0.12); g.gain.value = vol;
    s.connect(g); g.connect(master); s.start(); return true;
  } catch (e) { return false; }
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
  hit: () => { if (!take('hit', 0.85)) noise(0.11, 0.5, 2400, 400, 'bandpass', 0.7); tone(120, 0.13, 'triangle', 0.3, 48); }, // the recorded cut, over a low thump for weight
  big: () => { if (!take('big', 1.0, 0.92)) noise(0.2, 0.6, 1800, 200, 'bandpass', 0.6); tone(90, 0.25, 'triangle', 0.45, 35); },
  clang: () => { if (!take('clang', 0.8)) { steel(410, 0.09, 0.16); noise(0.09, 0.3, 900, 300, 'bandpass', 0.8); } },
  parry: () => { if (!take('parry', 1.0, 1.06)) { steel(560, 0.13, 0.32); noise(0.28, 0.16, 6000, 2200, 'bandpass', 1.2); } tone(140, 0.16, 'triangle', 0.22, 70); },
  roll: () => noise(0.26, 0.14, 250, 800, 'bandpass', 0.8),
  // The captain is struck: a dull blow to the body and a shiver of mail. No pitched tone (owner, Nov 2026: the old falling sawtooth sounded like an 8-bit game).
  hurt: () => { noise(0.2, 0.6, 420, 80, 'lowpass', 0.9); noise(0.1, 0.1, 5600, 3200, 'bandpass', 1.4); },
  // A javelin striking home: the point knocking on plate (a recorded clang, pitched well down and quiet) over a hard short thud.
  pierce: () => { if (!take('clang', 0.32, 0.55)) noise(0.06, 0.3, 2600, 900, 'bandpass', 1.2); noise(0.08, 0.5, 1400, 160, 'lowpass', 1); },
  // A javelin that misses goes into the sand with a soft thunk.
  stick: () => { noise(0.1, 0.22, 600, 120, 'lowpass', 1); noise(0.07, 0.06, 2400, 1200, 'bandpass', 1); },
  // an enemy draws back to strike: a short breath of cloth and leather, not a beep
  tele: () => noise(0.16, 0.12, 380, 1100, 'bandpass', 0.9),
  charged: () => { noise(0.4, 0.14, 500, 2600, 'bandpass', 2); tone(220, 0.4, 'triangle', 0.1, 330); },
  quake: () => long('quake', 1.6), // the vault shaking; the file is normalized to -16 LUFS, quieter than the blows, so it is lifted here
  horn: () => long('horn', 1.5), // a war horn, far off: one long call that dies away (docs/music.md). Normalized like the quake, so lifted the same way
  boom: () => { noise(0.55, 0.7, 500, 50, 'lowpass', 0.7); tone(74, 0.5, 'sine', 0.6, 30); },
  die: () => noise(0.7, 0.22, 2600, 160, 'bandpass', 0.5),
  cue: () => { tone(587, 0.3, 'sine', 0.05); tone(880, 0.45, 'sine', 0.04, null, 0.1); }, // a new objective or hint: two soft notes
  blip: () => noise(0.035, 0.05, 1800, 1400, 'bandpass', 1.5),
  learn: () => { tone(98, 0.9, 'triangle', 0.16, 96); tone(147, 0.9, 'triangle', 0.08, 145, 0.04); noise(0.3, 0.12, 200, 90, 'lowpass'); },
  fall: () => { [294, 247, 196, 147].forEach((f, i) => tone(f, 0.8, 'triangle', 0.1, null, i * 0.22)); },
  dawn: () => { [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 2.2, 'sine', 0.08, null, i * 0.35)); },
  flame: () => { noise(0.9, 0.5, 200, 1800, 'bandpass', 0.6); tone(60, 0.8, 'sine', 0.4, 40); },
};
