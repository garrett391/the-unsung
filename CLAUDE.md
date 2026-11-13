# The Unsung: notes for Claude

A third-person sword-combat game for the browser, in three.js. Read `README.md` for controls, scripts and the file layout. This file is the context a new session needs.

## Where things stand

- Active branch: `rebuild`. `main` holds the old proof of concept; it will be tagged `poc` and replaced by `rebuild` after the owner's playthrough.
- First playable slice: one night at a ruined desert camp. Stages in `src/story/mission.js`: intro, spar (tutorial), raid, fallback, hold (the Narrows), vessa (boss), dawn.
- Verified only by the headless bot (`npm run build && npm test`) with god mode on. Not yet hand-played. Difficulty, parry timing and the Vessa fight are untuned.

## Decisions already made

- **Original IP only.** The story began as Zelda fan fiction; it was deliberately rewritten. The captain is unnamed (his name is struck from the record, a theme). Never reintroduce Nintendo names, characters, places or move names (no Link, Hyrule, Ganondorf, Twinrova, Mortal Draw, etc.). Current names: the Usurper, the Glass Door, the Witches of the dunes, the Still Draw, the Western Watch, the Third Company. Corin (squire) and Vessa (the Witches' Hand, boss) are original.
- **Browser only**, phones included. Every feature needs touch controls and must run acceptably on a phone.
- **Look:** stylized, cel-shaded (`toon()` in `src/gfx/materials.js`), rim-lit figures, bloom, grade and vignette (`src/gfx/renderer.js`). Not N64/low-poly retro, not realism. Bright emissive colors (>1) are what bloom; keep them sparing.
- **Combat feel is the core asset.** The owner likes the current movement and fighting. Change feel deliberately and in small steps, not as a side effect of other work.
- Characters are built in code (`src/actors/rig.js`) and animated with keyed poses plus generated locomotion (`src/actors/anim.js`). Moving to Blender/glTF models later is expected; the procedural torso/lean layer should survive that.
- Collision is simple rectangles plus circles (`confine` in `src/world/level.js`). Add Rapier when levels get slopes, stairs or real geometry.

## How the code fits together

- `G` in `src/core/game.js` is the shared state; systems import it rather than each other. `G.emit` / `G.on` carry events (`kill`, `playerDead`, `spar`).
- Combat numbers live in `src/actors/data.js` (`ATK` for the player, `TYPES` for enemies). Tune there first.
- Poses are flat `Float32Array`s (3 Euler angles per joint in `JN` order, then a hip offset). `P({...}, base)` builds one; `C(dur, [t, pose, ease], ...)` builds a clip.
- Stages are async scripts driven by `Director` (`src/story/director.js`): `talk`, `wait`, `until`, `tween`, `every`. `setup()` only runs when a stage is started directly (first load or retry from a checkpoint), so it must build the whole world state for that stage.
- `G.auto = true` makes dialogue and waits skip; the playtest uses it. `G.step(dt, true)` advances one frame without rendering.

## Next up (owner's call on order)

- Owner's playthrough feedback, then merge `rebuild` into `main`.
- The two cutscenes not yet built: Corin's last stand (the Still Draw) during the hold, and the captain's eye wound mid-Vessa fight, which leaves him blind on the right side for phase two.
- Art pass (tents and crates are weakest), music, gamepad, saved progress.

## Working rules

- Run `npm run build && npm test` after changes; look at the screenshots in `test/shots/`, don't just check for errors.
- Keep the playtest passing as stages change; update its bot or `until` conditions when a stage's flow changes.
