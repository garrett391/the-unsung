# The Unsung

A third-person sword-combat game for the browser, built on three.js. This is a ground-up rebuild: an original setting, a new knight with a full combat system, and a cel-shaded night look.

## The story so far

A man nobody knows saves the realm, and nobody sees it. Years later he is a guard captain on the desert frontier. The full outline is in `docs/story.md`.

**Prologue.** The fight at the Glass Door, then the years on the road.

**Act I, the first night at the ruins.**

1. **Sparring** with Corin, the squire: strike, block, parry and riposte, shield bash, side roll.
2. **The raid**: raiders come through the breach, then bronze shields.
3. **Holding the Narrows** while the stretchers get through to the sanctum.
4. **Vessa, the Witches' Hand**, who is driven off and will be back.
5. **Dawn**, and the Western Watch's report.

Still to come: the waystation and the muster as playable missions, the rest of Act I, in-game music and gamepad support.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | W A S D | Left thumb |
| Camera | Mouse, or Q / E | Drag the right side |
| Strike (chain up to three) | J or left click | STRIKE |
| Heavy (hold to charge; ends a combo) | K or right click | HEAVY |
| Guard (tap just before a hit to parry) | L or Shift | GUARD |
| Dodge (roll, side roll, backstep) | Space | DODGE |
| Lock on | F or Tab | LOCK |
| Pause (camera sensitivity is in here) | Esc or P | II, top right |

Combos: Strike, Heavy is a shield bash that breaks guards. Strike, Strike, Heavy is a rising cut that launches. Strike after a parry is a riposte. Strike after half a second of running is a leaping slash.

## Run it

```sh
npm install
npm run dev        # local server with hot reload
npm run build      # static build in dist/, runs from any host or folder
```

Every push to `main` builds the game and publishes it to GitHub Pages (`.github/workflows/pages.yml`). One-time setup: Settings → Pages → Source: GitHub Actions.

## Test

A bot plays every stage in headless Chrome and saves screenshots to `test/shots/`.

```sh
npm run build && npm test
CHROME=/path/to/chrome npm test     # if Chrome is somewhere else
FROM=raid npm test                  # start at a stage (door, spar, raid, fallback, hold, vessa)
TO=door npm test                    # stop after the prologue
node test/playtest.mjs phone        # phone-sized touch layout
node test/look.mjs                  # close-up turnarounds of the opening foe and the captain
```

## Layout

| Path | What it holds |
| --- | --- |
| `src/main.js` | Boot, game loop, stage runner |
| `src/core/` | Shared state (`game.js`), input, synthesized sound effects and title music, helpers |
| `public/music/` | Music files, copied as-is into the build |
| `src/gfx/` | Renderer and post-processing, toon materials and painted textures, particles and sword trails |
| `src/actors/rig.js` | The procedural armored figure every character is built from |
| `src/actors/anim.js` | Poses, attack clips and generated locomotion |
| `src/actors/data.js` | Attack and enemy numbers: tune combat here |
| `src/actors/player.js`, `enemy.js`, `ally.js` | The captain, raiders and Vessa, Corin |
| `src/world/` | Level geometry, collision, sky and lighting; camera |
| `src/story/director.js` | Awaitable waits, tweens and dialogue for stage scripts |
| `src/story/mission.js` | The stages, written as straight-line scripts |
| `src/story/stretchers.js` | The stretcher bearers crossing the Narrows during the hold |
| `src/ui/hud.js`, `index.html` | HUD, dialogue and the chronicle screens |

Development happens on `main`. The earlier proof of concept is kept on the `proof-of-concept` branch.
