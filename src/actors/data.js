import { CL, eClip } from './anim.js';

// Player attacks. Times are seconds into the clip.
//   act: window in which the blade can hit      cancel: earliest time a follow-up may start
//   move: [from, to, speed] forward drive        poise: stagger power (9 breaks anything)
//   next: which attack Strike (l) or Heavy (h) chains into
export const ATK = {
  l1: { clip: 'l1', act: [0.1, 0.2], cancel: 0.23, dmg: 14, range: 2.3, arc: 1.3, move: [0, 0.17, 5.5], knock: 3, poise: 1, stop: 0.055, next: { l: 'l2', h: 'f1' }, snd: 1 },
  l2: { clip: 'l2', act: [0.1, 0.2], cancel: 0.23, dmg: 15, range: 2.3, arc: 1.3, move: [0, 0.17, 4.5], knock: 3, poise: 1, stop: 0.055, next: { l: 'l3', h: 'f2' }, snd: 1.18 },
  l3: { clip: 'l3', act: [0.15, 0.27], cancel: 0.45, dmg: 24, range: 2.9, arc: 0.6, move: [0.08, 0.23, 11], knock: 9, poise: 2, stop: 0.09, next: {}, snd: 1.4 },
  // Strike > Heavy: shield bash. Little damage, breaks any guard.
  f1: { clip: 'f1', act: [0.1, 0.2], cancel: 0.3, dmg: 8, range: 1.9, arc: 1.0, move: [0, 0.17, 9], knock: 7, poise: 9, stop: 0.08, next: { l: 'l1' }, snd: 0.6, bash: 1, st: 8 },
  // Strike > Strike > Heavy: rising cut that launches.
  f2: { clip: 'f2', act: [0.14, 0.26], cancel: 0.5, dmg: 20, range: 2.4, arc: 1.1, move: [0.1, 0.22, 4], knock: 1.5, poise: 9, stop: 0.09, next: {}, snd: 0.85, launch: 8.2, st: 10 },
  hs: { clip: 'hs', act: [0.06, 0.17], cancel: 0.48, dmg: 32, range: 2.6, arc: 0.8, move: [0, 0.12, 6], knock: 7, poise: 9, stop: 0.11, next: {}, snd: 0.55, heavy: 1, st: 16 },
  // Fully charged heavy: adds a shockwave.
  hc: { clip: 'hs', act: [0.06, 0.17], cancel: 0.52, dmg: 58, range: 2.8, arc: 0.9, move: [0, 0.12, 7], knock: 11, poise: 9, stop: 0.15, next: {}, snd: 0.45, heavy: 1, st: 28, aoe: 3.6 },
  sa: { clip: 'sa', act: [0.28, 0.4], cancel: 0.6, dmg: 26, range: 2.6, arc: 0.9, move: [0, 0.3, 10.5], knock: 8, poise: 3, stop: 0.1, next: {}, snd: 0.7, st: 10, heavy: 1 },
  ra: { clip: 'l3', t0: 0.07, act: [0.15, 0.27], cancel: 0.45, dmg: 20, range: 2.9, arc: 0.6, move: [0.08, 0.23, 10], knock: 8, poise: 2, stop: 0.08, next: { l: 'l1' }, snd: 1.4 },
  rp: { clip: 'rp', act: [0.2, 0.3], cancel: 0.72, dmg: 80, range: 3.2, arc: 1.2, move: [0.12, 0.22, 6], knock: 12, poise: 9, stop: 0.17, next: {}, snd: 1.5, crit: 1 },
};
for (const k in ATK) { ATK[k].key = k; ATK[k].dur = CL[ATK[k].clip].dur; }

// Enemy kinds. Each has one or more moves; a move picks its clip from style.
//   wind: telegraph time   rec: recovery   lunge: forward speed during the strike
//   minD: only used beyond this range      chain: chance to follow straight into `then`
const RAIDER = { armor: 0x5a4636, trim: 0x9a6a36, under: 0x8c7a60, dark: 0x2a2420, steel: 0xa8a8a2, eye: 0xff9a3c, rim: 0x40281a };
export const TYPES = {
  raider: { name: 'RAIDER', hp: 58, speed: 3.6, poise: 1, scale: 1, look: RAIDER,
    moves: [{ style: 'slash', wind: 0.58, rec: 0.7, dmg: 16, range: 2.35, lunge: 6.5 }] },
  bulwark: { name: 'BRONZE SHIELD', hp: 84, speed: 2.8, poise: 2, scale: 1.06, shield: true,
    look: { ...RAIDER, armor: 0x7a5a2c, trim: 0xc08a3a, shield: 1 },
    moves: [{ style: 'thrust', wind: 0.7, rec: 0.85, dmg: 15, range: 2.75, lunge: 8.5 }] },
  brute: { name: 'BREAKER', hp: 200, speed: 2.3, poise: 6, scale: 1.4, heavy: true,
    look: { ...RAIDER, armor: 0x3e3230, trim: 0x8b3a34, steel: 0x77706a, eye: 0xff5a30, weapon: 'maul', blade: 1.0, horns: 1 },
    moves: [{ style: 'over', wind: 1.0, rec: 1.2, dmg: 30, range: 3.1, lunge: 5, slam: 1.6 }] },
  // The prologue's fight at the Glass Door. The game opens on the last moments of it: he is
  // already beaten (`hurt`: hunched, panting, bleeding; see Enemy) and slow, so the first round can
  // teach the basics (the `door` stage: lock on, strike, shield). He is still dangerous: an
  // overhead cut and a quicker sweep, both telegraphed, and blows that cost a careless player.
  // (Owner, Nov 2026: a little harder than the first pass, which had one weak swing.)
  // A pale, crowned figure in bone-coloured plate, with glass (his sign) for crown and blade.
  usurper: { name: 'THE USURPER', hp: 280, speed: 1.9, poise: 3, scale: 1.2, boss: true, heavy: true, hurt: true, trail: 0x8fd8cc,
    look: { armor: 0xb4ad9c, trim: 0x7a6636, under: 0x25272c, dark: 0x101114, steel: 0xbfeee6, eye: 0x3fd0bc, rim: 0x3c8f84, blade: 1.2, crown: 'glass', glass: 1, cape: 0x14282a, capeLen: 5, tatter: 1, skirt: 0x14282a, pads: 0.82, lames: 1, knees: 1 },
    moves: [{ style: 'over', wind: 1.0, rec: 1.45, dmg: 13, range: 2.95, lunge: 4.5 }, { style: 'slash', wind: 0.82, rec: 1.25, dmg: 10, range: 2.7, lunge: 5.5 }] },
  vessa: { name: "VESSA, THE WITCHES' HAND", hp: 820, speed: 4.2, poise: 14, scale: 1.22, boss: true, heavy: true,
    look: { armor: 0x2c2440, trim: 0xb48cff, under: 0x4a4266, dark: 0x16121e, steel: 0xd8ccff, eye: 0xc79bff, rim: 0x5a2c9a, weapon: 'glaive', blade: 1.25, crown: 1, cape: 0x3a1c5c },
    moves: [
      { style: 'slash', wind: 0.5, rec: 0.55, dmg: 16, range: 3.4, lunge: 9, chain: 0.65, then: 1 },
      { style: 'thrust', wind: 0.42, rec: 0.75, dmg: 20, range: 3.9, lunge: 13 },
      { style: 'over', wind: 0.85, rec: 1.05, dmg: 28, range: 3.6, lunge: 15, slam: 2.6, leap: true, minD: 4.6 },
    ] },
};
for (const k in TYPES) for (const m of TYPES[k].moves) m.clip = eClip(m.style, m.wind, m.rec);
