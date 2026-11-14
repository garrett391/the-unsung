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
//   follow: only ever used as the second half of a chain
// Looks for the rig (actors/rig.js), by who wears them. The captain's is his guard armour. In the
// years before the guard he is a yard hand in a quilted jerkin and a desert head-wrap (`labourer`,
// unarmed), who takes up a fallen guard's sword and iron shield (`drifter`).
const PLAIN = { armor: 0x8a7a5c, trim: 0x5e4a34, under: 0x6b6250, dark: 0x3a2c22, steel: 0xc9ccd2, rim: 0x3a2e22, /* a warm, faint rim: the blue one turns brown cloth purple in daylight */ helm: 'wrap', wrap: 0xcfc2a2, skin: 0xc99872, plain: true, pads: 0.5, legs: 1.1 };
const SOLDIER = { armor: 0x9aa0aa, trim: 0x6c727c, under: 0x26305a, dark: 0x5a3a24, steel: 0xe6e9ef, shield: 2, rim: 0x23305a, helm: 'open', tabard: true, lames: true, knees: true, legs: 1.12, pads: 1.05, eye: 0x08080c };
const WAYGUARD = { armor: 0x7a5a3c, trim: 0x8a8a86, under: 0x6b6250, dark: 0x2c2620, steel: 0xc9ccd2, rim: 0x3a2e22, helm: 'open', shield: 1, plain: true, pads: 0.8, skin: 0xb98a66, hair: 0x2c2420 };
export const LOOKS = {
  captain: { armor: 0xb3242a, trim: 0xdcae45, under: 0x40434f, dark: 0x25262e, steel: 0xe6e9ef, plume: 0xf1e7cf, cape: 0x27355e, shield: 0, rim: 0x2c3f86, legs: 1.22, pads: 0.88 },
  labourer: { ...PLAIN, weapon: 'none' }, drifter: { ...PLAIN, shield: 1 },
  // Polished steel over a navy gambeson, white tabard with the company badge, open-faced helm: the guard's line soldiers (Corin adds a crimson crest).
  soldier: SOLDIER, officer: { ...SOLDIER, trim: 0xc9a24a, plume: 0xe9e2d0, cape: 0x7a2026, shield: undefined, hair: 0x3a2c22 },
  wayguard: WAYGUARD, wayguardBare: { ...WAYGUARD, weapon: 'none', shield: undefined }, // the waystation's own gate guard, in boiled leather and an iron hat; and after his sword is taken
  drover: { ...PLAIN, armor: 0x9a6a4a, under: 0xb7a888, helm: 'none', hair: 0x7a5228, skin: 0xd9a77e, weapon: 'none', pads: 0.45 },
  // The halls above the vault: one of the realm's knights, in his colours with her face bare; and the Usurper's guard, pale plate with glass grown into it.
  knight: { armor: 0xb3242a, trim: 0xdcae45, under: 0x40434f, dark: 0x25262e, steel: 0xe6e9ef, plume: 0xf1e7cf, rim: 0x2c3f86, legs: 1.1, pads: 0.9, weapon: 'none' }, // helmed, like him (owner: the bare faces are too plain to carry a scene yet)
  line: { armor: 0x8f96a2, trim: 0x4a5a8a, under: 0x2a3050, dark: 0x25262e, steel: 0xdfe3ea, rim: 0x23305a, shield: 2 }, // the realm's line soldiers, in plain steel
  glass: { armor: 0xb4ad9c, trim: 0x7a6636, under: 0x25272c, dark: 0x101114, steel: 0xbfeee6, eye: 0x3fd0bc, rim: 0x3c8f84, glass: 1, pads: 0.92 },
  clerk: { ...PLAIN, armor: 0x3a4466, trim: 0x8a7a5c, under: 0x2a3050, helm: 'none', hair: 0x9a9690, skin: 0xd9a77e, weapon: 'none', pads: 0.4 },
};

// Raiders are desert people, not knights: leather over loose cloth, bare forearms, a dark head-wrap
// with only the eyes showing, and rust-red cloth hanging from the belt. PLATED keeps the wrap and
// puts bronze over it (shield-bearers); the big ones keep their horned helms.
const RAIDER = { armor: 0x5a4636, trim: 0x9a6a36, under: 0x9a8662, dark: 0x2a2420, steel: 0xa8a8a2, eye: 0xff9a3c, rim: 0x40281a, plain: true, helm: 'wrap', wrap: 0x2b2624, skin: 0x8a5a3c, hair: 0x1a1614, skirt: 0x6a2c22 };
const PLATED = { ...RAIDER, plain: false }, HELMED = { ...PLATED, helm: undefined, skirt: undefined };
export const TYPES = {
  raider: { name: 'RAIDER', hp: 58, speed: 3.6, poise: 1, scale: 1, look: RAIDER,
    moves: [{ style: 'slash', wind: 0.58, rec: 0.7, dmg: 16, range: 2.35, lunge: 6.5 }] },
  bulwark: { name: 'BRONZE SHIELD', hp: 84, speed: 2.8, poise: 2, scale: 1.06, shield: true,
    look: { ...PLATED, armor: 0x7a5a2c, trim: 0xc08a3a, shield: 1 },
    moves: [{ style: 'thrust', wind: 0.7, rec: 0.85, dmg: 15, range: 2.75, lunge: 8.5 }] },
  brute: { name: 'BREAKER', hp: 200, speed: 2.3, poise: 6, scale: 1.4, heavy: true,
    look: { ...HELMED, armor: 0x3e3230, trim: 0x8b3a34, steel: 0x77706a, eye: 0xff5a30, weapon: 'maul', blade: 1.0, horns: 1 },
    moves: [{ style: 'over', wind: 1.0, rec: 1.2, dmg: 30, range: 3.1, lunge: 5, slam: 1.6 }] },
  // The Usurper's guard, in the halls above the vault (prologue). The first of them is who the basics are taught on.
  glassguard: { name: 'GLASS GUARD', hp: 60, speed: 3.3, poise: 1, scale: 1.02, trail: 0x8fd8cc, look: LOOKS.glass,
    moves: [{ style: 'slash', wind: 0.62, rec: 0.75, dmg: 14, range: 2.4, lunge: 6.5 }] },
  glassshield: { name: 'GLASS SHIELD', hp: 84, speed: 2.7, poise: 2, scale: 1.06, shield: true, trail: 0x8fd8cc, look: { ...LOOKS.glass, shield: 1 },
    moves: [{ style: 'thrust', wind: 0.72, rec: 0.85, dmg: 14, range: 2.75, lunge: 8 }] },
  glasswarden: { name: 'WARDEN OF THE STAIR', hp: 210, speed: 2.9, poise: 5, scale: 1.25, heavy: true, trail: 0x8fd8cc,
    look: { ...LOOKS.glass, crown: 1, cape: 0x14282a, skirt: 0x14282a, blade: 1.15, lames: 1, knees: 1 },
    moves: [{ style: 'slash', wind: 0.65, rec: 0.85, dmg: 16, range: 2.9, lunge: 7, chain: 0.35, then: 1 }, { style: 'over', wind: 0.9, rec: 1.15, dmg: 24, range: 3.1, lunge: 6, slam: 1.5 }] },
  // Quick and lightly armed: a cut that usually runs straight on into a thrust (`follow`: never used to open).
  runner: { name: 'DUNE RUNNER', hp: 48, speed: 4.9, poise: 1, scale: 0.94,
    look: { ...RAIDER, armor: 0x6f5c44, trim: 0x2f6a70, under: 0xb09a78, wrap: 0x2c5a60, skirt: undefined, blade: 0.78 },
    moves: [{ style: 'slash', wind: 0.44, rec: 0.55, dmg: 9, range: 2.25, lunge: 8.5, chain: 0.6, then: 1 }, { style: 'thrust', wind: 0.3, rec: 0.8, dmg: 11, range: 2.5, lunge: 9.5, follow: true }] },
  // Leads the raid on the waystation: a raider's cut that can run on into an overhead with a shockwave.
  chief: { name: 'RAID LEADER', hp: 220, speed: 3.1, poise: 4, scale: 1.16, heavy: true,
    look: { ...HELMED, armor: 0x4a302a, trim: 0xb9853a, eye: 0xffb24a, horns: 1, cape: 0x5a2420, skirt: 0x5a2420, blade: 1.05, lames: 1 },
    moves: [{ style: 'slash', wind: 0.6, rec: 0.8, dmg: 15, range: 2.75, lunge: 7, chain: 0.4, then: 1 }, { style: 'over', wind: 0.8, rec: 1.1, dmg: 22, range: 3.0, lunge: 6, slam: 1.4 }] },
  // The muster's trial bout (G.blunt: nothing bleeds and nobody dies). A line soldier who knows his shield.
  sergeant: { name: 'THE SERGEANT', hp: 190, speed: 3.0, poise: 3, scale: 1.05, shield: true, tele: 0xfff0c0,
    look: { ...SOLDIER, hair: 0x9a9690, skin: 0xb98a66 },
    moves: [{ style: 'slash', wind: 0.62, rec: 0.8, dmg: 14, range: 2.4, lunge: 6.5 }, { style: 'thrust', wind: 0.7, rec: 0.9, dmg: 14, range: 2.8, lunge: 8 }] },
  // The prologue's fight at the Glass Door. The game opens on the last moments of it: he is
  // already beaten (`hurt`: hunched, panting, bleeding; see Enemy) and slow, so the first round can
  // teach the basics (the `door` stage: lock on, strike, shield). He is still dangerous: an
  // overhead cut and a quicker sweep, both telegraphed, and blows that cost a careless player.
  // (Owner, Nov 2026: a little harder than the first pass, which had one weak swing.)
  // A pale, crowned figure in bone-coloured plate, with glass (his sign) for crown and blade.
  usurper: { name: 'THE USURPER', hp: 320, speed: 2.1, poise: 3, scale: 1.2, boss: true, heavy: true, hurt: true, trail: 0x8fd8cc,
    look: { armor: 0xb4ad9c, trim: 0x7a6636, under: 0x25272c, dark: 0x101114, steel: 0xbfeee6, eye: 0x3fd0bc, rim: 0x3c8f84, blade: 1.2, crown: 'glass', glass: 1, wound: 1, cape: 0x14282a, capeLen: 5, tatter: 1, skirt: 0x14282a, pads: 0.82, lames: 1, knees: 1 },
    moves: [{ style: 'over', wind: 0.95, rec: 1.3, dmg: 16, range: 2.95, lunge: 5 }, { style: 'slash', wind: 0.76, rec: 1.1, dmg: 12, range: 2.7, lunge: 6 }] }, // a little harder again (owner, Nov 2026): he is no longer who the basics are taught on
  vessa: { name: "VESSA, THE WITCHES' HAND", hp: 820, speed: 4.2, poise: 14, scale: 1.22, boss: true, heavy: true,
    look: { armor: 0x2c2440, trim: 0xb48cff, under: 0x4a4266, dark: 0x16121e, steel: 0xd8ccff, eye: 0xc79bff, rim: 0x5a2c9a, weapon: 'glaive', blade: 1.25, crown: 1, cape: 0x3a1c5c },
    moves: [
      { style: 'slash', wind: 0.5, rec: 0.55, dmg: 16, range: 3.4, lunge: 9, chain: 0.65, then: 1 },
      { style: 'thrust', wind: 0.42, rec: 0.75, dmg: 20, range: 3.9, lunge: 13 },
      { style: 'over', wind: 0.85, rec: 1.05, dmg: 28, range: 3.6, lunge: 15, slam: 2.6, leap: true, minD: 4.6 },
    ] },
};
for (const k in TYPES) for (const m of TYPES[k].moves) m.clip = eClip(m.style, m.wind, m.rec);
