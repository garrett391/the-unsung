# The Unsung

A third-person sword-combat game for the browser, built on three.js. This branch is a ground-up rebuild: an original setting, a new knight with a full combat system, and a cel-shaded night look.

## The first night

A guard captain whose name has been struck from the record holds a ruined desert camp for one night.

1. **Sparring** with Corin, the squire: strike, block, parry and riposte, shield bash, side roll.
2. **The raid**: raiders come through the breach, then bronze shields.
3. **Holding the Narrows** while the stretchers get through to the sanctum.
4. **Vessa, the Witches' Hand.**
5. **Dawn**, and the Western Watch's report.

Still to come: the two big cutscenes (Corin's last stand, the captain's wound), music, gamepad support and saved progress.

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

Combos: Strike, Heavy is a shield bash that breaks guards. Strike, Strike, Heavy is a rising cut that launches. Strike after a parry is a riposte. Strike after half a second of running is a leaping slash.

## Run it

```sh
npm install
npm run dev        # local server with hot reload
npm run build      # static build in dist/, runs from any host or folder
```

## Test

A bot plays every stage in headless Chrome and saves screenshots to `test/shots/`.

```sh
npm run build && npm test
CHROME=/path/to/chrome npm test     # if Chrome is somewhere else
node test/playtest.mjs phone        # phone-sized touch layout
```

## Layout

| Path | What it holds |
| --- | --- |
| `src/main.js` | Boot, game loop, stage runner |
| `src/core/` | Shared state (`game.js`), input, synthesized audio, helpers |
| `src/gfx/` | Renderer and post-processing, toon materials and painted textures, particles and sword trails |
| `src/actors/rig.js` | The procedural armored figure every character is built from |
| `src/actors/anim.js` | Poses, attack clips and generated locomotion |
| `src/actors/data.js` | Attack and enemy numbers: tune combat here |
| `src/actors/player.js`, `enemy.js`, `ally.js` | The captain, raiders and Vessa, Corin |
| `src/world/` | Level geometry, collision, sky and lighting; camera |
| `src/story/director.js` | Awaitable waits, tweens and dialogue for stage scripts |
| `src/story/mission.js` | The stages, written as straight-line scripts |
| `src/ui/hud.js`, `index.html` | HUD, dialogue and the chronicle screens |

The earlier proof of concept is on the `main` branch.
