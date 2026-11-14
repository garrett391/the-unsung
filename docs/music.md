# Music

Owner's direction: melancholy over adventurous. Instrumental only, no singing.

## Title theme: "Nightfall Over Dunes"

- File: `public/music/title.mp3` (trimmed to a 49.75 s loop, 160 kbps). Played by `playMusic` / `stopMusic` in `src/core/audio.js`.
- Generated with an AI music tool built on MiniMax's music model (the earlier drafts' tags say MiniMax), from this prompt:

> Instrumental, no vocals. Melancholy dark fantasy title theme, desert at night. Solo duduk or cello melody, soft string drone, sparse oud, distant frame drum heartbeat. Slow, 66 BPM, D minor. One restrained swell, then a quiet return. Mournful, spacious, not heroic. Loopable ending.

- Notes from the drafts: the tool has no instrumental toggle, only the text description, so the prompt itself must keep voices out: lead with "Instrumental, no vocals" and avoid words like "lament" or "choir", which invite singing. The long form of the prompt produced only a 29 s clip with no swell.

### Long form of the prompt (kept for reference)

> Instrumental only, no vocals, no choir, no humming. Melancholy orchestral title theme for a dark fantasy game set in a ruined desert camp at night. Slow and mournful, around 66 BPM, D minor. It opens with a solo duduk, or a cello if there's no duduk, playing a simple, sorrowful melody over a soft string drone and sparse plucked oud. Low strings swell slowly underneath. A distant frame drum pulses softly, like a heartbeat. The middle builds to one restrained, aching high point with full strings and a lone French horn, then falls back to the solo melody. A wide, cold, moonlit sound with lots of space and reverb. It should feel like grief for the forgotten dead, not heroism. No big percussion, no triumphant brass, no epic battle drums. Ends quietly on the drone so it can loop.

## The fight at the Glass Door: "A Blade For The Weary"

- File: `public/music/blade.mp3` (the owner's track, whole, re-encoded at 128 kbps; 2 min 56 s, looped). `playMusic('blade')`.
- Starts as the cold open fades up, taking over from the title theme. It stops when the Usurper drops to his knees, so the false ending plays in silence, and comes back as he lands on his feet.

## The sealing: "Beneath the Sealed Glass"

- File: `public/music/sealed.mp3` (the owner's track, whole, 128 kbps; 59 s, played once). `playMusic('sealed', { loop: false })`.
- Starts when the Usurper is beaten the second time and is dragged to the Door. It opens very quietly and builds, so it carries the sealing, the parting line and the cards of the road; whatever is left fades as the spar begins.

## Act I: "Beneath the Flagstones"

- File: `public/music/flagstones.mp3` (the owner's track, 128 kbps; the 1.5 s of silence at the start and 2.1 s at the end were cut so it loops without a gap: 57.55 s, looped). `actOne()` in `src/story/mission.js` plays it.
- Fades in over the Act I cards and loops through the whole first night, the Vessa fight and the dawn report included. Every Act I stage asks for it, so CONTINUE and retries from a checkpoint have it too.

Tracks are named in `TRACKS` in `src/core/audio.js`; one plays at a time. A new one waits for the old one to fade out, then fades in. A decoded track is large (about 60 MB for the three-minute one): `forgetMusic()` drops the ones not playing, and a long track could be cut down to a loop if phones struggle.

For new tracks (in-game music, stingers for the lesson, Corin's fall, dawn), keep the same palette and key so they sit together.

## Sound effects

In use (Nov 2026): **20 Sword Sound Effects (Attacks and Clashes)** by StarNinjas, CC0, credit appreciated: https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes

- Sixteen of the twenty takes are in `public/sfx/` as short mono WAVs (24 kHz; WAV because older iPhones can't decode Ogg, and it has no encoder delay). Each was cut to start 35 ms before its strike and end where it dies away, so the sound lands with the blow.
- `hit1-5` (sword 1, 2, 3, 4, 7): a blow landing. `big1-3` (sword 5, 8, 10): heavy blows and ripostes. `clang1-4` (clash 2, 3, 4, 5): a block. `parry1-4` (clash 1, 6, 8, 10): a parry.
- `SFX.hit`, `big`, `clang` and `parry` play a random take (never the same twice running, pitch varied a little) over a low synthesized thump; the old synthesized versions remain as the fallback until the files load. Everything else (swings, rolls, the boom, the horn) is still synthesized.
- Chosen by measurement (length, onset, decay), not by ear: the session can't listen. If a take sounds wrong, delete its file and lower the count in `TAKES`.
- `quake.mp3`: the vault shaking in the false ending, supplied by the owner (Nov 2026; source not recorded). Loudness-normalized to -16 LUFS, true peak -1.5 dB (two-pass `loudnorm`, linear), 24 kHz, 128 kbps. Twelve seconds: it hits at about 0.5 s and holds; `SFX.quake()` starts it with the first tremor and the scene fades it over 1.2 s when the Usurper lands. Its level (1.6 in `SFX.quake`) is unheard.

Other sources, not yet used:

- Medieval Sound Effects: Weapon Impacts (CC0, real blade and haft clashes): https://opengameart.org/node/146863
- Kenney Impact Sounds (CC0): https://kenney.nl/assets/impact-sounds
- Kenney RPG Audio (CC0): https://kenney.nl/assets/rpg-audio
- Sonniss GDC bundle (royalty-free, no credit): https://sonniss.com/gameaudiogdc

The session sandbox can't download from these sites; the owner downloads the zips and attaches them.
