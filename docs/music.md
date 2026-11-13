# Music

Owner's direction: melancholy over adventurous. Instrumental only, no singing.

## Title theme: "Nightfall Over Dunes"

- File: `public/music/title.mp3` (trimmed to a 49.75 s loop, 160 kbps). Played by `playMusic` / `stopMusic` in `src/core/audio.js`.
- Generated with an AI music tool built on MiniMax's music model (the earlier drafts' tags say MiniMax), from this prompt:

> Instrumental, no vocals. Melancholy dark fantasy title theme, desert at night. Solo duduk or cello melody, soft string drone, sparse oud, distant frame drum heartbeat. Slow, 66 BPM, D minor. One restrained swell, then a quiet return. Mournful, spacious, not heroic. Loopable ending.

- Notes from the drafts: the tool has no instrumental toggle, only the text description, so the prompt itself must keep voices out: lead with "Instrumental, no vocals" and avoid words like "lament" or "choir", which invite singing. The long form of the prompt produced only a 29 s clip with no swell.

### Long form of the prompt (kept for reference)

> Instrumental only, no vocals, no choir, no humming. Melancholy orchestral title theme for a dark fantasy game set in a ruined desert camp at night. Slow and mournful, around 66 BPM, D minor. It opens with a solo duduk, or a cello if there's no duduk, playing a simple, sorrowful melody over a soft string drone and sparse plucked oud. Low strings swell slowly underneath. A distant frame drum pulses softly, like a heartbeat. The middle builds to one restrained, aching high point with full strings and a lone French horn, then falls back to the solo melody. A wide, cold, moonlit sound with lots of space and reverb. It should feel like grief for the forgotten dead, not heroism. No big percussion, no triumphant brass, no epic battle drums. Ends quietly on the drone so it can loop.

For new tracks (in-game music, stingers for the lesson, Corin's fall, dawn), keep the same palette and key so they sit together.

## Sound effects: candidate sources (not yet used)

The current effects are synthesized in `src/core/audio.js` and sound like toy dings. Free replacements to pull from:

- Medieval Sound Effects: Weapon Impacts (CC0, real blade and haft clashes): https://opengameart.org/node/146863
- Kenney Impact Sounds (CC0): https://kenney.nl/assets/impact-sounds
- Kenney RPG Audio (CC0): https://kenney.nl/assets/rpg-audio
- 20 Sword Sound Effects (CC0, credit requested): https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes
- Sonniss GDC bundle (royalty-free, no credit): https://sonniss.com/gameaudiogdc

The session sandbox can't download from these sites; the owner downloads the zips and attaches them.
