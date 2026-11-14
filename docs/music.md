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

## Act I, the fighting: "The Weight of Granite"

- File: `public/music/granite.mp3` (the owner's track, 128 kbps; the 2.3 s of silence at the end was cut: 2 min 58.7 s, looped). `actOne(true)` in `src/story/mission.js` plays it.
- Comes in when the war horn banner shows at the end of the spar and runs through the raid, the fall back, the hold and Vessa; "Beneath the Flagstones" returns at dawn. So the camp's theme is now only the quiet before and after. The cue points are unheard: the owner's ear decides.

## The waystation and the muster (Nov 2026)

Three tracks the owner made from the prompts below (Gemini), in the prompts' order. Each had about 2 s of silence at the end, cut so it loops (with a 60 ms fade against a click), and was re-encoded at 128 kbps. Their loudness already matched the others (about -12 LUFS), so the levels were left alone. All unheard: the owner's ear decides.

- "Twilight at the Well" (`well`, 62.4 s, looped): the yard. It comes in with the opening shot of the waystation, returns under the officer's column after the fight, and plays through the muster's talk and the clerk's table and on under the Act I cards, where "Beneath the Flagstones" takes over.
- "Iron Hinges, Silent" (`hinges`, 57.5 s, looped): from about three seconds after the horn until his hand closes on the sword. The prompt asked for a slow tightening; the measured loudness is nearly flat (about -15 dB throughout, a little up past the halfway mark), so it is a held tension, not a build.
- "The Measure of a Blade" (`measure`, 2 min 58.6 s, looped): the muster's bout. It has a quiet passage of about 10 s a little past the two-minute mark.
- The raid itself, from the sword on: "The Weight of Granite" (owner: for variety; it used to be "A Blade For The Weary").
- `musicVol(vol, dur)` in `audio.js` raises or lowers the playing track without restarting it (unused for now).

### Prompts for tracks of their own (for Gemini, or any music tool)

These made the three tracks above. Same palette and key as the rest. Each leads with "Instrumental, no vocals" and stays short, which is what has worked.

**The yard** (the waystation at the end of a working day; after the fight; the muster's talk and the clerk's table). Replaces the borrowed title theme. Loop, 60 to 90 s.

> Instrumental, no vocals. Quiet, weary desert theme for the end of a working day at a caravan waystation. Solo oud picking a slow, plain figure, a low cello holding long notes under it, soft frame drum like slow footsteps, a few notes of duduk answering near the end. 60 BPM, D minor. Warm, dusty, patient, a little lonely. No swell, no percussion hits, nothing heroic. Even volume throughout. Loopable ending.

**The horn** (from the raiders' horn until he takes up the sword: the guard is cut down and nobody looks at the yard hand). Would replace the low-volume opening of "The Weight of Granite". 40 to 60 s, need not loop.

> Instrumental, no vocals. Tense, held-breath underscore for a dark fantasy game: raiders have just come through a gate. Low string drone on D, slow frame drum pulse like a heartbeat, bowed cello harmonics, a single oud string plucked now and then. 60 BPM, D minor. Starts almost silent and tightens steadily for 45 seconds without ever breaking into a theme or a big hit. Dread, not action. Ends on an unresolved held note.

**The bout** (the muster's trial with blunt steel: a test, not a battle). Replaces "A Blade For The Weary" there. Loop, 60 to 90 s.

> Instrumental, no vocals. Brisk, wary sparring music for a trial bout between two soldiers, watched by a company. Driving oud ostinato, frame drum and hand drum in a steady 6/8, pizzicato low strings, short cello phrases that push and pull back. 100 BPM, D minor. Focused and dry, a contest of skill, not a war: no brass, no big drums, no triumphant melody. Even energy throughout. Loopable ending.

Tracks are named in `TRACKS` in `src/core/audio.js`; one plays at a time. A new one waits for the old one to fade out, then fades in. A decoded track is large (about 60 MB for the three-minute one): `forgetMusic()` drops the ones not playing, and a long track could be cut down to a loop if phones struggle.

For new tracks (in-game music, stingers for the lesson, Corin's fall, dawn), keep the same palette and key so they sit together.

## Sound effects

In use (Nov 2026): **20 Sword Sound Effects (Attacks and Clashes)** by StarNinjas, CC0, credit appreciated: https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes

- Sixteen of the twenty takes are in `public/sfx/` as short mono WAVs (24 kHz; WAV because older iPhones can't decode Ogg, and it has no encoder delay). Each was cut to start 35 ms before its strike and end where it dies away, so the sound lands with the blow.
- `hit1-5` (sword 1, 2, 3, 4, 7): a blow landing. `big1-3` (sword 5, 8, 10): heavy blows and ripostes. `clang1-4` (clash 2, 3, 4, 5): a block. `parry1-4` (clash 1, 6, 8, 10): a parry.
- `SFX.hit`, `big`, `clang` and `parry` play a random take (never the same twice running, pitch varied a little) over a low synthesized thump; the old synthesized versions remain as the fallback until the files load. Everything else (swings, rolls, the boom) is still synthesized.
- The war horn (`horn.mp3`, `SFX.horn()`): "Nordic warhorns sound effects" by fronbondi_skegs on Pixabay (file 162120; Pixabay Content License: free to use, no credit required), supplied by the owner (Nov 2026: "our war horn for now"). The download is 70 s of calls; this is the first one only, from 0.42 s to 6.92 s: about 3.5 s of horn and its dying away, faded out over the last 1.6 s, before the second call begins at 7.0 s. Normalized to -16 LUFS, 24 kHz mono, 96 kbps. It sounds when the raiders reach the waystation and at the end of the spar ("A war horn sounds from the dunes"). Its level (1.5 in `SFX.horn`) is unheard. The synthesized horn it replaces was removed earlier (owner: he would rather have none than that).
- Chosen by measurement (length, onset, decay), not by ear: the session can't listen. If a take sounds wrong, delete its file and lower the count in `TAKES`.
- `quake.mp3`: the vault shaking in the false ending, supplied by the owner (Nov 2026; source not recorded). Loudness-normalized to -16 LUFS, true peak -1.5 dB (two-pass `loudnorm`, linear), 24 kHz, 128 kbps. Twelve seconds: it hits at about 0.5 s and holds; `SFX.quake()` starts it with the first tremor and the scene fades it over 1.2 s when the Usurper lands. Its level (1.6 in `SFX.quake`) is unheard.

Other sources, not yet used:

- Medieval Sound Effects: Weapon Impacts (CC0, real blade and haft clashes): https://opengameart.org/node/146863
- Kenney Impact Sounds (CC0): https://kenney.nl/assets/impact-sounds
- Kenney RPG Audio (CC0): https://kenney.nl/assets/rpg-audio
- Sonniss GDC bundle (royalty-free, no credit): https://sonniss.com/gameaudiogdc

The session sandbox can't download from these sites; the owner downloads the zips and attaches them.
