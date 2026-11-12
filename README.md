# The Unsung

A fan-made vertical slice about the Hero of Time after Majora's Mask: one night as a captain of the Royal Guard, holding the ruins around the Mirror of Twilight against Twinrova's raiders. Built in Three.js to run in a browser on phones and computers.

Fan-made and non-commercial. Not affiliated with or endorsed by Nintendo.

## What's in the slice

- Sparring with Corin, the squire, who learns Shield Attack, Back Slice and Helm Splitter alongside the player
- The raid, then holding the mouth of the Narrows while stretcher teams carry the wounded to the sanctum
- Corin's Mortal Draw, and the moment after
- Vessa, the Witches' Hand: the eye wound, the blind right side, the Ending Blow
- Dawn, and the Western Watch's report that strikes the captain's name

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | WASD or arrows | Left stick | Left thumb |
| Sword (hold to charge a spin) | J or left click | B | Sword |
| Shield (hold) | K or right click | RT | Shield |
| Roll | Space | A | Roll |
| Lock on | L or Tab | LT | Lock |
| Pause | Esc | Start | II |

## Build

```sh
npm install
npm run build        # bundles src/ into dist/index.html (three.js loads from jsDelivr)
```

Open `dist/index.html` through any static server (module scripts don't run from `file://`).

## Test

The playtest drives the whole slice in headless Chrome with simulated input, then saves screenshots to `test/shots/`.

```sh
CHROME=/path/to/chrome npm test
npm run test:phone   # 844x390 touch layout
```

## Layout

| Path | What it holds |
| --- | --- |
| `src/main.js` | Game object, loop, world control, screens |
| `src/story.js` | Director (awaitable waits, tweens, dialogue) and the stages |
| `src/actors.js` | Captain, Corin, raiders, Vessa, soldiers, stretchers |
| `src/rig_build.js`, `src/models.js` | N64-style character models and painted textures |
| `src/rig.js` | Procedural poses and animation |
| `src/world.js` | Level geometry, collision, sky and lighting |
| `src/camera.js`, `src/input.js`, `src/ui.js`, `src/minimap.js`, `src/audio.js`, `src/fx.js` | Camera, controls, HUD, minimap, synthesized audio, particles |
| `template.html` | Page markup and styles; the build inlines the bundle here |
