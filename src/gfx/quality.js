import * as T from 'three';
import { G } from '../core/game.js';
import { coarse } from '../core/input.js';

// Graphics quality: one place that says how heavy the picture is, read by everything that used to decide for itself
// (shadow maps in level.js, antialiasing and pixel ratio in renderer.js).
//
// A tier is a row of PRESET. Which tier runs:
//   1. `?gfx=low|medium|high|ultra` in the address, for testing: wins over everything, saved nowhere.
//   2. The player's pick in the pause menu (Options), if it is not AUTO.
//   3. AUTO: the device's default (a phone HIGH, a desktop ULTRA), brought down by
//        KNOWN (graphics chips whose drivers are known to fail), and by
//        a cap this device earned: its driver dropped the game with shadows on ('lost'), or it ran too slowly ('slow').
// A driver that drops the game also puts the pick back to AUTO, so a tier that crashes a device can't lock its owner out:
// the next load starts on LOW whatever was picked. Picking a tier again afterwards is honoured (and, if it crashes, undone
// the same way).
//
// To add a setting: a field in every PRESET row, and read `G.gfx.<field>` where it applies (on the 'gfx' event if it can
// change while the game runs). To handle another bad driver: a row in KNOWN.
export const TIERS = ['low', 'medium', 'high', 'ultra'];
const PRESET = {
  //        shadow map (px; 0: none)   in open country   soft edges   MSAA samples   pixel ratio at most
  low:    { shadow: 0,                 open: 0,          soft: false, msaa: 0,       pr: 1 },
  medium: { shadow: 1024,              open: 2048,       soft: false, msaa: 2,       pr: 1.25 },
  high:   { shadow: 2048,              open: 2048,       soft: true,  msaa: 2,       pr: 1.5 },  // what a phone ran before there were tiers
  ultra:  { shadow: 2048,              open: 4096,       soft: true,  msaa: 4,       pr: 1.75 }, // what a desktop ran
};
// Chips whose drivers fail above a tier. PowerVR (Pixel 10, D-Series DXT-48-1536; Nov 2026, the owner's brother): the driver
// loses the WebGL context within the first frames once many draws a frame sample a shadow map. Other three.js projects saw
// the same on that phone, and shadows off was what stopped it. Unconfirmed on the phone: nobody has tried MEDIUM there.
const KNOWN = [{ re: /PowerVR|Imagination/i, tier: 'low' }];

const PICK = 'the-unsung.gfx', CAP = 'the-unsung.gfxcap', MONTH = 30 * 864e5;
const rank = (t) => TIERS.indexOf(t);
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* storage blocked */ } };

// `pick` is what the player chose ('auto' or a tier); `tier` is what runs; `why` says what brought AUTO down ('gpu', 'lost',
// 'slow'; 'url' when the address decides; '' otherwise). The preset's fields are copied on to it.
export const gfx = { pick: 'auto', tier: 'high', why: '', gpu: '', ...PRESET.high };
G.gfx = gfx;

function resolve() {
  const q = new URLSearchParams(location.search).get('gfx'); if (rank(q) >= 0) return [q, 'url'];
  if (rank(gfx.pick) >= 0) return [gfx.pick, ''];
  let tier = coarse || Math.min(innerWidth, innerHeight) < 500 ? 'high' : 'ultra', why = '';
  for (const k of KNOWN) if (k.re.test(gfx.gpu) && rank(k.tier) < rank(tier)) { tier = k.tier; why = 'gpu'; }
  const c = load(CAP); if (c && c.gpu === gfx.gpu && rank(c.tier) >= 0 && Date.now() - c.at < MONTH && rank(c.tier) < rank(tier)) { tier = c.tier; why = c.why; }
  return [tier, why];
}
function settle() { const [tier, why] = resolve(); Object.assign(gfx, PRESET[tier], { tier, why }); }

// Before the renderer's targets are made: who the GPU is, what was picked, and so which tier.
export function startGfx(gpu) { gfx.gpu = gpu; const p = load(PICK); if (p && (p === 'auto' || rank(p) >= 0)) gfx.pick = p; settle(); }

// Put the tier into effect. `live`: the game is already drawing, so compiled shaders have to follow.
// three.js builds a material's shader again only when the set of lights changes, not when shadows are switched or their
// filter changes. So level.js turns the sun's shadow off and on with the tier (which is such a change), and when only the
// filter changes, one frame is drawn here with it off in between.
export function applyGfx(live) {
  settle();
  const r = G.renderer, c = G.composer; if (!r) return;
  const type = gfx.soft ? T.PCFSoftShadowMap : T.PCFShadowMap, retype = r.shadowMap.type !== type && r.shadowMap.enabled && gfx.shadow > 0;
  r.shadowMap.enabled = gfx.shadow > 0; r.shadowMap.type = type;
  if (c) for (const rt of [c.renderTarget1, c.renderTarget2]) if (rt.samples !== gfx.msaa) { rt.samples = gfx.msaa; rt.dispose(); } // (made again, with the new count, when next drawn into)
  if (live && retype && !r.getContext().isContextLost()) { G.emit('gfx', { ...gfx, shadow: 0, open: 0 }); c.render(); }
  G.emit('gfx', gfx);
}

// The pause menu's pick.
export function pickGfx(p) { gfx.pick = p === 'auto' || rank(p) >= 0 ? p : 'auto'; save(PICK, gfx.pick); applyGfx(true); }

// This device can't run above `tier` (for a month, on this GPU). A lost context also undoes the player's pick: see the top.
export function capGfx(tier, why) {
  const c = load(CAP); if (!(c && c.gpu === gfx.gpu && Date.now() - c.at < MONTH && rank(c.tier) <= rank(tier))) save(CAP, { gpu: gfx.gpu, tier, why, at: Date.now() });
  if (why === 'lost' && gfx.pick !== 'auto') { gfx.pick = 'auto'; save(PICK, 'auto'); }
}

// Frame rate, on AUTO only: called with each frame's real length while the game is being played. Three four-second
// stretches in a row averaging under 26 frames a second bring the tier down one step, and the device remembers it.
// It never steps back up by itself (it would only step down again); the menu can.
let warm = 0, span = 0, frames = 0, slow = 0;
export function watchGfx(dt) {
  if (gfx.pick !== 'auto' || gfx.why === 'url' || gfx.tier === 'low' || !(dt > 0) || dt > 1) return false; // (over a second: the tab was away)
  if ((warm += dt) < 6) return false; // loading and first-time shader compiles are not the frame rate
  span += dt; frames++; if (span < 4) return false;
  slow = span / frames > 1 / 26 ? slow + 1 : 0; span = frames = 0;
  if (slow < 3) return false;
  slow = 0; warm = 0; capGfx(TIERS[rank(gfx.tier) - 1], 'slow'); applyGfx(true); return true;
}
Object.assign(gfx, { pickTier: pickGfx, watch: watchGfx, apply: applyGfx });
