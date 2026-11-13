# Test results: Googly Goobers 1.0.0

Every run below launched a real Minecraft client with Fabric Loader 0.20.1 on Linux (virtual
display, CPU-only Mesa llvmpipe renderer), loaded the **release jar from `dist/`** from a normal
`mods` folder together with Fabric API (`runProductionClientGameTest`), created a singleplayer
world and a dedicated server with a second (fake) player, and ran the automated in-game suite.
The SHA-256 of each jar was recorded before the runs and checked again afterwards: the tested
jars are byte-identical to the ones in `dist/`.

| Minecraft | Java used | Fabric API | Launch 1 | Launch 2 (after restart) | With real Mod Menu + Simple Voice Chat |
| --- | --- | --- | --- | --- | --- |
| 26.3 | 25.0.5 | 0.166.2+26.3 | **141 / 141 passed** | **150 / 150 passed** | **145 / 145 passed** (Mod Menu 21.0.1, Simple Voice Chat 2.6.27+26.3 beta) |
| 26.2 | 25.0.5 | 0.161.0+26.2 | **141 / 141 passed** | **150 / 150 passed** | **145 / 145 passed** (Mod Menu 20.0.3, Simple Voice Chat 2.6.22+26.2) |
| 1.21.11 | 21.0.12 | 0.141.6+1.21.11 | **141 / 141 passed** | **150 / 150 passed** | **145 / 145 passed** (Mod Menu 17.0.1, Simple Voice Chat 1.21.11-2.6.22) |

No check failed in any of these runs, and no run crashed. Launch 2 is the same suite plus 9
checks that the settings saved by launch 1 were restored after restarting Minecraft.

Additional runs (not counted above):
- The 1.21.11 release jar also passed launch 1 (141 / 141) on Java 25.
- Development-environment runs (`runClientGameTest`) during the port: 26.3 141 / 141 and 1.21.11
  141 / 141 (Java 21), before the last test-suite additions.

## Reports

| Minecraft | Launch 1 | Launch 2 | With Mod Menu + Simple Voice Chat |
| --- | --- | --- | --- |
| 26.3 | [report](mc26.3-launch-1.md) | [report](mc26.3-launch-2-restart.md) | [report](mc26.3-with-modmenu-and-voicechat.md) |
| 26.2 | [report](mc26.2-launch-1.md) | [report](mc26.2-launch-2-restart.md) | [report](mc26.2-with-modmenu-and-voicechat.md) |
| 1.21.11 | [report](mc1.21.11-launch-1.md) | [report](mc1.21.11-launch-2-restart.md) | [report](mc1.21.11-with-modmenu-and-voicechat.md) |

Each report lists every check with its measured values and the screenshots taken. The
screenshots of the 26.3 launch-1 run are in [`../screenshots/`](../screenshots/) (file names
without the number prefix), and the key screenshots of every version's launch-1 run are in
`../screenshots/mc<version>/`.

## What the suite checks (identical for all three versions)

| Area | Checks | What is verified |
| --- | --- | --- |
| Mod loads, menu on the title screen | 1 | The menu and its preview open without a world |
| Googly eyes render | 3 | Face data is attached to the player's render state, brows on, 3D geometry built (872 quads) |
| Pupil movement | 2 | Pupils react to head turns; the two pupils move independently |
| Blinking | 3 | Forced blink closes and reopens the eyes; random blinks happen on their own |
| Talking | 19 | Eyes grow to 1.5-1.8x with a pop, mouth opens much wider and stretches, several mouth shapes, pupils keep wobbling, eyes never cover the mouth, mouth stays on the face, brows and head move, smooth shrink back, 9 chat-detected expressions |
| Screaming | 21 | Detection (and non-detection) of screams, keybind, ~2x eyes, tall oval mouth with uvula, raised brows, tiny pupils, head shake, no clipping |
| Expressions and eyebrows | 8 | Surprised, angry, confused, happy and laughing faces: eye pops, brow lift and tilt, mouth shapes, squint |
| Talking sliders | 5 | Eye Enlargement, Mouth Opening, Animation Speed, Overall Exaggeration change the measured face |
| Hit reaction | 10 | Spiral eyes appear and rotate, shocked mouth, head wobble, stagger, stars, reaction ends and eyes return to normal |
| Priority | 4 | A hit interrupts talking; talking resumes afterwards |
| Smooth transitions | 9 | Idle, talking, screaming, hit, talking, idle checked tick by tick for jumps and overlaps |
| Individual settings | 11 | Every switch and size slider changes what is drawn |
| Main switches | 3 | Googly Eyes OFF/ON and Apply to Myself apply immediately |
| Menu, preview, Player Selection | 10 | G key, switches and sliders, all 9 preview modes, zoom and rotation, Save writes the file, Reset to Defaults, Player Selection lists players |
| Optional integrations | 4 | *(only in the Mod Menu + Simple Voice Chat runs)* Mod Menu's Configure button creates the Googly Goobers menu, Mod Menu's list shows the mod, Simple Voice Chat loads the voice plugin, Voice Lip Sync becomes available |
| Multiplayer | 29 | Server detected, your look shared, `/googlygoobers eyes ... on/off/reset` and the `/googly` alias, forced looks saved with the world, a second player gets googly eyes, synced looks and Show Synced Looks, watching the other player talk and scream, server-formatted chat, relayed expressions, the other player's spiral eyes, Player Selection overrides, voice loudness path (talking, louder = wider, yelling = screaming, silence = normal) |
| Performance | 3 | 14 animated faces; CPU cost per face; faces out of view stop being simulated |
| Restart persistence | 9 | *(launch 2 only)* Eye size, spiral speed, switches, sliders, Apply to Everyone and a per-player choice survive a restart |

Measured performance on the CPU-only renderer, per face per frame (launch 1): 26.3 0.9 us submit +
82.6 us mesh, 26.2 1.1 us + 87.0 us, 1.21.11 3.5 us + 102.8 us. Faces that are off screen
cost nothing.

## Not tested

These could not be covered by the automated environment and were **not** tested:
- Real GPUs and graphics drivers, Windows and macOS (all runs: Linux, software renderer).
- A live microphone and real voice traffic through Simple Voice Chat (the tests feed recorded
  loudness through the same code path Simple Voice Chat's plugin uses).
- A second real human client. The second player is a server-side fake player; what a modded
  client sees of it is tested, but not two real clients talking to each other.
- Clicking Mod Menu's Configure button with the mouse (the test calls Mod Menu's own config-screen
  factory for the mod, which is what the button does).
- Other mods beyond Fabric API, Mod Menu and Simple Voice Chat, and servers running other plugins.
- Fabric Loader versions older than 0.20.1.
