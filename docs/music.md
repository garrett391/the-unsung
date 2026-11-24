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
- Comes in when the "Raiders in the dunes" banner shows at the end of the spar and runs through the raid, the fall back, the hold and Vessa; "Beneath the Flagstones" returns at dawn. So the camp's theme is now only the quiet before and after. The cue points are unheard: the owner's ear decides.

## The waystation and the muster (Nov 2026)

Three tracks the owner made from the prompts below (Gemini), in the prompts' order. Each had about 2 s of silence at the end, cut so it loops (with a 60 ms fade against a click), and was re-encoded at 128 kbps. Their loudness already matched the others (about -12 LUFS), so the levels were left alone. All unheard: the owner's ear decides.

- "Twilight at the Well" (`well`, 62.4 s, looped): the yard. It comes in with the opening shot of the waystation, returns under the officer's column after the fight, and plays through the muster's talk and the clerk's table and on under the Act I cards, where "Beneath the Flagstones" takes over.
- "Iron Hinges, Silent" (`hinges`, 57.5 s, looped): not used (owner, Nov 2026: the switch from the yard's theme was unnecessary; "Twilight at the Well" now runs on until his hand closes on the sword). It used to play from about three seconds after the horn until the sword. The prompt asked for a slow tightening; the measured loudness is nearly flat (about -15 dB throughout, a little up past the halfway mark), so it is a held tension, not a build.
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

## The picket: the corporal's death (Nov 2026)

Two tracks the owner made with Gemini from the prompts below. Neither had silence at the start; the 1.7 s and 2.6 s of silence at their ends were cut so they loop (with a 60 ms fade against a click), and both were re-encoded at 128 kbps. Loudness already matched the others (-12.3 and -12.0 LUFS after the cut), so the levels were left alone. Unheard: the owner's ear decides.

- "Only the Wind Remains" (`wind`, 63.3 s): no longer played (owner, 19 Nov 2026: he didn't like it). The file and its `TRACKS` entry are kept.
- "A Brother's Final Watch" (`watch`, 64.0 s, looped): the whole chapter. It takes over from "Beneath the Flagstones" as the picket fades up, runs while he walks in past Hale, Brann and Wren to the corporal and through the corporal's death, carries on across the dip to black into the morning, while he talks to the sergeant, looks for Corin on the rise and finds him, and under the next chapter's cards until `actOne()` crossfades to the camp's theme.
- It is preloaded once the beacon is lit, so it is ready when the picket starts.

**The night** ("Only the Wind Remains"):

> For a video game cut scene. Instrumental, no vocals, no choir, no humming. Sincere, simple elegy for a dark fantasy war game: a soldier has died, and his comrades stand over him. Solo duduk playing a slow, plain, legato melody, long breaths and held notes, over warm low strings sustaining soft chords. A cello joins in the second half, doubling the melody an octave below. 50 BPM, D minor. Earnest and grave, like a war film elegy. No plucked strings, no staccato, no waltz, no music box, no celesta, no bells, nothing quirky, whimsical or spooky. No percussion. About 50 seconds. Ends on a held low string chord that fades to silence

**The morning** ("A Brother's Final Watch"):

> Make a song to this spec for a video game scene. Instrumental, no vocals, no choir, no humming. Short, intimate, grieving piece for a dark fantasy game: a soldier dies of his wounds at a desert camp at dawn, and his young brother is left behind. Solo cello playing a slow, plain, broken melody, with a single plucked oud answering in the gaps. One soft, sustained string note underneath, and nothing else. 54 BPM, D minor. No percussion. It stays quiet and close, with one small rise near the middle, as if someone is holding back tears, then falls away. Warm and dusty, not epic, not heroic. About 50 seconds. Ends on one held cello note that fades to silence

Notes from these: the long "no ..." lists (no plucked strings, no music box, nothing whimsical) are what kept earlier drafts from turning quirky; keep them for other quiet cues.

Tracks are named in `TRACKS` in `src/core/audio.js`; one plays at a time. A new one waits for the old one to fade out, then fades in. A decoded track is large (about 60 MB for the three-minute one): `forgetMusic()` drops the ones not playing, and a long track could be cut down to a loop if phones struggle.

For new tracks (in-game music, stingers for the lesson, Corin's fall, dawn), keep the same palette and key so they sit together.

## The lost caravan (prompts written 21 Nov 2026; both tracks made by the owner with Gemini the same day)

Owner: the Act I pair ("Beneath the Flagstones", "The Weight of Granite") is carrying the patrol, the beacon and the caravan, and is getting repetitive. Two prompts for tracks of the caravan's own. As made, and placed by the owner (21 Nov 2026): "Midday Vigil" (`vigil`, 89.04 s, looped; the faster one, a placeholder he doesn't like much) plays from the picket scene through the old road, the search and the drover; "The Unceasing Gait" (`gait`, 89.45 s, looped) from the first fight at the bend to the end of the chapter, the Veiled and the after-scene included. No Act I track plays in the caravan. Each had about 2.1 s of silence at the end, cut so it loops (with a 60 ms fade against a click), re-encoded at 128 kbps; loudness already matched the others (about -13 and -12 LUFS). `wash()` in `mission.js` switches between them.

1. The wash, searching (replaces "Beneath the Flagstones" in the caravan):

> Instrumental, no vocals, no choir. A slow, uneasy desert piece for searching an abandoned caravan at midday. Sparse and dry: a lone low oud or nylon guitar picking a hesitant minor figure, long pauses between phrases, a bowed cello drone far underneath, soft frame drum struck only now and then like a slow heartbeat. High, faint glassy harmonics (bowed glass or a glass harmonica, very quiet) that drift in and out and never resolve. Melancholy and watchful rather than frightening; no melody that swells, no percussion build. About 70 bpm, D minor, 90 seconds, ends as quietly as it starts so it can loop.

2. The Veiled (replaces "The Weight of Granite" for the fight in the narrows):

> Instrumental, no vocals, no choir. Cold, relentless combat music for silent enemies who do not shout or run. Low strings in a driving ostinato, heavy frame drums and a deep tom on an uneven pulse (7/8 or a limping 4/4), no brass fanfare, no heroics. Over it a brittle, glassy lead: struck glass, celesta or high bowed metal playing a short falling figure that repeats like something that will not stop. Tension without triumph, melancholy underneath the drive. About 120 bpm, D minor to match the piece above, 90 seconds, steady intensity start to finish with no intro and no fade so it can loop.

## The tracks north: the drivers and the door (prompt written 24 Nov 2026; track not made yet)

Owner: from the first driver on the crest to the door, the chapter borrows "Beneath the Sealed Glass", which is the sealing's music (the Usurper beaten and shut in). A prompt for a track of its own. It would play from the first glass driver (`deep('sealed')` after the crest trigger in the `tracks` stage, and on a retry before the door) through the hollow, the walk down among the drivers and the talk at the door, until the Veiled get up and "The Unceasing Gait" takes over: about a minute and a half if he doesn't dawdle, so it loops. Suggested key `hollow` in `TRACKS`. Recommendation: keep "Beneath the Sealed Glass" for the sergeant's death after the fight, where the Usurper speaks through him; hearing the sealing's music again there is the callback.

> Instrumental, no vocals, no choir, no humming. Slow, cold, hushed dread for a dark fantasy game. Soldiers come over a dune in the deep desert and find the drivers of a lost caravan standing in a line, turned to glass. At the bottom of the hollow there is a door of glass standing in the sand with no wall around it. One of them has seen a door like it before and hoped he never would again. A low string drone on D that hardly moves. Bowed glass or a glass harmonica holding high, pale notes that drift slightly against each other. A solo cello playing a few slow, falling phrases, with long silences between them. Near the end, one duduk holds three or four long notes, then stops. Now and then a single soft, deep drum stroke, far away. 52 BPM, D minor. Still and uneasy: recognition, not surprise. No melody that swells, no build, no rhythm, no brass, no climax, nothing heroic. No music box, no celesta, no chimes, no bells, nothing whimsical or spooky. Even volume throughout. About 80 seconds. Loopable ending.

Notes: the long "no ..." list is what kept the picket's quiet cues from turning quirky; keep it. If the glass comes out as a twinkly celesta anyway, drop "glass harmonica" and ask for "high violin harmonics, sul ponticello" instead. If the duduk turns into a lament or a melody, cut that sentence.

## Sound effects

In use (Nov 2026): **20 Sword Sound Effects (Attacks and Clashes)** by StarNinjas, CC0, credit appreciated: https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes

- Sixteen of the twenty takes are in `public/sfx/` as short mono WAVs (24 kHz; WAV because older iPhones can't decode Ogg, and it has no encoder delay). Each was cut to start 35 ms before its strike and end where it dies away, so the sound lands with the blow.
- `hit1-5` (sword 1, 2, 3, 4, 7): a blow landing. `big1-3` (sword 5, 8, 10): heavy blows and ripostes. `clang1-4` (clash 2, 3, 4, 5): a block. `parry1-4` (clash 1, 6, 8, 10): a parry.
- `SFX.hit`, `big`, `clang` and `parry` play a random take (never the same twice running, pitch varied a little) over a low synthesized thump; the old synthesized versions remain as the fallback until the files load. Everything else (swings, rolls, the boom) is still synthesized.
- The war horn: removed (owner, 19 Nov 2026: it didn't sound good). `horn.mp3` and `SFX.horn()` are gone; the waystation, the beacon and the end of the spar play no horn. It was "Nordic warhorns sound effects" by fronbondi_skegs on Pixabay.
- Chosen by measurement (length, onset, decay), not by ear: the session can't listen. If a take sounds wrong, delete its file and lower the count in `TAKES`.
- `quake.mp3`: the vault shaking in the false ending, supplied by the owner (Nov 2026; source not recorded). Loudness-normalized to -16 LUFS, true peak -1.5 dB (two-pass `loudnorm`, linear), 24 kHz, 128 kbps. Twelve seconds: it hits at about 0.5 s and holds; `SFX.quake()` starts it with the first tremor and the scene fades it over 1.2 s when the Usurper lands. Its level (1.6 in `SFX.quake`) is unheard.

Other sources, not yet used:

- Medieval Sound Effects: Weapon Impacts (CC0, real blade and haft clashes): https://opengameart.org/node/146863
- Kenney Impact Sounds (CC0): https://kenney.nl/assets/impact-sounds
- Kenney RPG Audio (CC0): https://kenney.nl/assets/rpg-audio
- Sonniss GDC bundle (royalty-free, no credit): https://sonniss.com/gameaudiogdc

The session sandbox can't download from these sites; the owner downloads the zips and attaches them.
