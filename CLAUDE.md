# The Unsung: notes for Claude

A third-person sword-combat game for the browser, in three.js. Read `README.md` for controls, scripts and the file layout. This file is the context a new session needs.

## Where things stand

- Work happens on `main` (the rebuild). The old proof of concept is preserved on the `proof-of-concept` branch; don't build on it.
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
- Input: mouse buttons use `mousedown`/`mouseup` (pointer events drop chorded buttons), and Shift/heavy state is resynced from every event, because a lost release once left the guard stuck up. `releaseAll()` clears held input on blur, pause and pointer-lock loss. `G.talking` is true during dialogue: clicks and keys then only advance it.
- `G.paused` freezes `step()` entirely (sim, director, `G.clock`). Losing pointer lock pauses on desktop.
- `G.auto = true` makes dialogue and waits skip; the playtest uses it. `G.step(dt, true)` advances one frame without rendering.

## Next up (owner's call on order)

- Captain top-heaviness, step 1 done: `Player.layer()` adds a lower, wider base, hip-led swings and running pelvis turn over every pose; thicker legs and smaller pads via rig `legs`/`pads`. The pause menu toggles old/new movement for comparison; remove the toggle once the owner settles it. Step 2 done (run only): the stride twist was backwards (the hip trailed its own leg and the same-side shoulder led), which splayed the legs and turned the trailing foot in; the captain now reverses it (`twistK`, read by `locoPose`), keeps his feet down the line of travel, sinks over the planted foot and rises in flight, and leans less. Corin and enemies still use the old twist (`twistK` defaults to 1): flip theirs only if the owner asks. Next steps if wanted: footwork (planting, push-off), then the attack clips themselves.
- Corin redesigned (owner's reference: a polished-steel royal guardsman): steel plate, white tabard with the Third Company badge, leather belt and strap, open-faced brimmed helm with a crimson crest, layered pauldrons, winged knee cops. Rig options `helm: 'open'`, `tabard`, `lames`, `knees`. The reference was another franchise's soldier: keep borrowing only generic armor features, never its crest or gear.
- Owner's playthrough feedback (Nov 2026), still open: flames and tents need an art pass; allied soldiers who fight; enemy variety, including more shield-bearers; a full story (the owner has the arc; ask for it before writing any). The owner is unsure about the struck-out captain name but it stays for now.
- The two cutscenes not yet built: Corin's last stand (the Still Draw) during the hold, and the captain's eye wound mid-Vessa fight, which leaves him blind on the right side for phase two.
- Environment art pass done (Nov 2026): ridge tents with ropes and flaps, layered flames with halos and smoke, plank crates, barrels, spear rack, fluted columns, richer stone/sand/cloth textures, instanced rubble and grass, textured moon. Dressing uses its own `dr` rng in `buildLevel` so the layout rng (and obstacles) stay stable.
- Character art pass done (Nov 2026), geometry and textures only, no joint or pose changes: riveted plate and mail textures (`plateTex`, `mailTex`, `clothTex`), mail collar, helm comb/brow/breaths, couters, gauntlet cuffs and hand plates, calves, sabatons, belt pouch, scabbard for sword-bearers, shield rims (boss on the iron one), Corin's nose and brows. Adds roughly 30 small meshes per figure: watch phone frame rate and merge per-joint geometry if it suffers.
- Saved progress done: reaching the raid, hold or Vessa checkpoint stores it in localStorage (`the-unsung.checkpoint`, skipped when `G.auto`); the title then shows CONTINUE plus NEW GAME.
- GitHub Pages: `.github/workflows/pages.yml` builds and deploys on every push to `main`, so the game has a fixed URL where saves persist (the Claude artifact frame may not keep localStorage).
- Music, gamepad.

## Working rules

- Run `npm run build && npm test` after changes; look at the screenshots in `test/shots/`, don't just check for errors.
- Keep the playtest passing as stages change; update its bot or `until` conditions when a stage's flow changes.
