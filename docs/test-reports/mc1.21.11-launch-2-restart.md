# Googly Goobers - in-game test report

| | |
| --- | --- |
| Googly Goobers | 1.0.0+mc1.21.11 |
| Minecraft | 1.21.11 |
| Fabric Loader | 0.20.1 |
| Fabric API | 0.141.6+1.21.11 |
| Java | 21.0.12.1 (Ubuntu) |
| Environment | production: release jar in a mods folder (runProductionClientGameTest) |
| Other mods | none |

Passed: 150, failed: 0

### Settings persist after restarting Minecraft
- PASS eye size restored (loaded 1.35)
- PASS spiral speed restored (loaded 2.25)
- PASS cartoon stars switch restored (loaded false)
- PASS blinking switch restored (loaded false)
- PASS eye enlargement restored (loaded 1.4)
- PASS mouth opening restored (loaded 0.8)
- PASS overall exaggeration restored (loaded 1.25)
- PASS apply-to-everyone restored (loaded false)
- PASS per-player choice restored (googly=false)

### Menu on the title screen (no world loaded)
- PASS menu opens without a world, with preview

### Googly eyes render
- PASS face attached to the player's render state (googly=true)
- PASS eyebrows enabled on the googly face
- PASS 3D face geometry built (872 quads per face)

### Pupils move
- PASS pupils react to head turning (max shift 1.22 eye radii)
- PASS the two pupils move independently (left (-0.34, 0.11) right (-0.55, 0.12))

### Eyes blink
- PASS blink closes the eyes (min openness 0.07)
- PASS eyes open again after the blink (openness 1.00)
- PASS random blinking happens on its own (2 blinks in 8 seconds)

### Talking animation: big eyes, wide mouth
- Idle face: eye radius 2.45 px, mouth 4.30 px wide x 0.40 px open (head is 8 x 8 px)
- PASS eyes grow to 1.5x-1.8x while talking (average x1.64, range x1.53 - x1.74 (was x1.05 before))
- PASS eyes pop when talking starts (first half second peaks at x1.88, then about x1.64)
- PASS pupils keep wobbling independently (pupil travel 1.76 eye radii in 2 s, max difference between the eyes 0.28)
- PASS mouth opens much wider (up to 4.55 px tall (idle 0.40 px, the old maximum was 1.56 px))
- PASS mouth stretches sideways (up to 5.96 px wide (idle 4.30 px))
- PASS several mouth shapes while talking (width 2.82 - 5.96 px, flat-top amount 0.03 - 0.50)
- PASS big eyes never cover the mouth (smallest eye-mouth gap 0.31 px)
- PASS eyes stay put while the mouth flaps (no bobbing) (eyes move at most 0.52 px per tick while the mouth moves up to 4.15 px per tick)
- PASS wide mouth stays on the face (lowest point -4.30 px (chin limit -4.30))
- PASS eyebrows bounce while talking (brow lift -0.00 -> 1.12 px)
- PASS head nods and sways while talking (nod up to 0.128 rad, sway up to 0.060 rad)
- PASS eyes shrink back smoothly when talking stops (x1.73 -> x1.00 in 1.5 s, never below x1.00, biggest step per tick 0.123)
- PASS mouth closes again after talking (open 0.00)
- PASS chat "hahahaha that is so funny" gives a laughing face (got LAUGHING)
- PASS chat "WHAT ARE YOU DOING" gives a wide_open face (got WIDE_OPEN)
- PASS chat "wow no way?!" gives a surprised face (got SURPRISED)
- PASS chat "ok" gives a small_talk face (got SMALL_TALK)
- PASS chat "grr I am so mad" gives a angry face (got ANGRY)
- PASS chat "yay lets go!!" gives a excited face (got EXCITED)

### Screaming
- PASS "AAAAAAHHHHHH" is detected as screaming (got SCREAMING)
- PASS "NOOOOOOO" is detected as screaming (got SCREAMING)
- PASS "eeeeek a spider" is detected as screaming (got SCREAMING)
- PASS "HELP ME!!" is detected as screaming (got SCREAMING)
- PASS "RUN AWAYYYY" is detected as screaming (got SCREAMING)
- PASS "😱" is detected as screaming (got SCREAMING)
- PASS "WHAT ARE YOU DOING" is not a scream (got WIDE_OPEN)
- PASS "aah ok" is not a scream (got SMALL_TALK)
- PASS "no" is not a scream (got SMALL_TALK)
- PASS "Hello there" is not a scream (got TALKING)
- PASS chat "AAAAAAAAHHHHHHH A CREEPER" makes a screaming face (mood SCREAMING)
- PASS eyes and mouth swell into the scream over several ticks (no snap) (eyes x1.00 -> x2.05 in 3 ticks, mouth 0.40 -> 5.33 px in 5 ticks)
- PASS screaming eyes are very large (x2.05 on average (x2.01 - x2.09, trembling))
- PASS mouth opens into a huge oval (5.44 px tall x 3.95 px wide at its widest, never under 5.27 px tall)
- PASS uvula shows in the screaming mouth (uvula 1.00)
- PASS eyebrows shoot up (lift 2.06 px)
- PASS tiny terrified pupils (pupil scale 0.50)
- PASS head shakes and is thrown back (shake up to 0.100 rad, head tilted back -0.140 rad)
- PASS screaming face never clips (smallest eye-mouth gap 0.59 px, lowest mouth point -4.30 px)
- PASS face calms down after screaming (mood NEUTRAL, eyes x1.00, mouth 0.00)
- PASS "Make a Face: Screaming" key screams (mood SCREAMING, eyes x2.01)

### Expressions and eyebrows
- PASS surprised: eyes pop bigger (0.96 -> 1.30)
- PASS surprised: eyebrows shoot up (lift 1.45)
- PASS surprised: round open mouth (open 0.50 width 0.62)
- PASS angry: brows tilt down to the middle (angle 0.50 rad)
- PASS angry: bared teeth and frown (teeth 1.00 smile -0.75)
- PASS confused: one brow up, one down (1.30 vs -0.27)
- PASS happy: smiling (smile 0.85)
- PASS laughing: happy squint (openness 0.63)

### Talking sliders (Eye Enlargement, Mouth Opening, Animation Speed, Overall Exaggeration)
- PASS Eye Enlargement 0: eyes stay normal size (x1.05)
- PASS Eye Enlargement 2: eyes grow even more (x2.24 (default x1.62))
- PASS Mouth Opening changes how wide the mouth opens (0.50x: 1.81 px, 1.00x: 4.56 px, 1.80x: 6.05 px)
- PASS Overall Exaggeration scales everything (0.50x: eyes x1.34, mouth 1.81 px, sway 0.030 rad | 1.80x: eyes x2.10, mouth 5.93 px, sway 0.108 rad)
- PASS Animation Speed changes how fast the face moves (eyes back to normal after talking in 22 ticks at 0.50x, 11 at 1.00x, 6 at 2.00x)

### Hit reaction: spiral eyes
- PASS damage applied (20.0 -> 19.0)
- PASS spiral eyes appear immediately
- PASS eyes become bigger (peak x1.45)
- PASS shocked open mouth (2.50 px open)
- PASS spirals rotate (0.00 -> 2.83 rad)
- PASS head wobbles (wobble z 0.019 y 0.137)
- PASS body staggers (lean 0.003)
- PASS cartoon stars appear (stars 1.00)
- PASS reaction finishes (reacting=false spiral=false)
- PASS face returns to normal (eye x0.96 mouth 0.00 stars 0.00)

### Animation priority (hit while talking)
- PASS talking is paused by the hit (hit has priority) (TALKING -> DIZZY)
- PASS talking resumes after the hit when still talking (after hit: TALKING, talk ticks left during hit: 103)
- PASS then the normal face returns (mood NEUTRAL)
- PASS short talk that ended during the hit goes straight back to normal (mood NEUTRAL)

### Smooth transitions: idle -> talking -> screaming -> hit -> talking -> idle
- PASS every animation played in priority order ([TALKING, SCREAMING, DIZZY, TALKING, NEUTRAL])
- PASS eye size never jumps (largest change in one tick: x0.300 (includes the deliberate scream tremble and hit pop))
- PASS eyes never jump around (largest move in one tick: 1.12 px)
- PASS mouth opens into the scream over several ticks (5.31 px scream mouth reached in 4 ticks)
- PASS mouth shrinks to the shocked mouth over several ticks when hit (5.31 px -> 2.43 px in 5 ticks)
- Largest mouth change in one tick: 3.79 px (ordinary talking flaps up to 4.15 px per tick)
- PASS eyebrows never move faster than their ordinary talking bounce (largest change in one tick: 0.55 px (talking bounce: up to 0.50 px per tick))
- PASS eyes never overlap the mouth in any of them (smallest gap 0.42 px)
- PASS mouth never hangs off the chin (lowest point -4.30 px)
- PASS back to the normal face at the end (eyes x1.00, mouth 0.00)

### Individual settings
- PASS Spiral Eyes OFF: reaction without spirals (reacting=true spiral=false)
- PASS Cartoon Stars OFF: no stars (stars 0.00)
- PASS Head Wobble OFF: no wobble or stagger
- PASS spirals still shown
- PASS Hit Reactions OFF: no reaction
- PASS Talking Animations OFF: mouth stays shut (max open 0.00)
- PASS Eyebrows OFF: brows hidden
- PASS Eyebrow Animations OFF: brows stay still (lift -0.00)
- PASS Eye Movement OFF: pupils stay centred (pupil (0.09, -0.10))
- PASS Blinking OFF: no blinks for 7 seconds (min openness 1.00)
- PASS size sliders reach the renderer

### Main ON/OFF switches
- PASS Googly Eyes OFF: effect disappears immediately
- PASS Googly Eyes ON: effect returns immediately
- PASS Apply to Myself OFF hides it on me

### Menu, preview and player selection (in a world)
- PASS G key opens the Googly Goobers menu
- PASS menu switch turns Googly Eyes OFF
- PASS menu switch turns it back ON
- PASS menu has Eye Enlargement, Mouth Opening, Animation Speed and Overall Exaggeration sliders
- PASS moving the Eye Enlargement slider changes the setting
- PASS Save Settings writes the config file
- PASS Reset to Defaults restores defaults
- PASS Player Selection button in the menu
- PASS Player Selection lists the players (1 row(s))
- PASS Done closes the menu
- Mod Menu and Simple Voice Chat are not installed in this run (their integrations are checked in a run with both installed).

### Multiplayer (dedicated server with Googly Goobers)
- PASS client detects Googly Goobers on the server
- PASS your chosen look is shared with the server (server sees googly eyes)
- PASS turning Apply to Myself off is shared too (server sees normal)
- PASS /googlygoobers eyes @a on forces googly eyes on a player
- PASS /googly alias: eyes @a off forces them off (even with Apply to Myself on)
- PASS forced looks are saved with the world (googlygoobers_forced_looks.json written)
- PASS /googlygoobers eyes @a reset gives control back
- PASS second player visible to the client
- PASS other players get googly eyes (Apply to Everyone)

### Watching another player talk
- PASS other player's eyes swell up while they talk (x1.64 on average, up to x1.75)
- PASS other player's mouth opens wide (up to 4.06 px (idle 0.40 px))
- PASS other player's face never clips (smallest eye-mouth gap 0.39 px)
- PASS server-formatted chat makes the other player talk (mood LAUGHING)

### Watching another player scream
- PASS other player screams from chat (mood SCREAMING, eyes x2.04, mouth 5.28 x 3.91 px)

### Talking with Simple Voice Chat (loudness path)
- PASS voice makes the other player talk (mood TALKING)
- PASS eyes swell while speaking (x1.72)
- PASS mouth follows the voice volume (loud: 3.02 px, quiet: 1.21 px)
- PASS yelling into the microphone turns into a scream (screaming after 7 ticks of yelling)
- PASS voice scream has huge eyes and mouth (eyes x2.07, mouth 4.73 px)
- PASS silence returns to the normal face (mood NEUTRAL, eyes x1.00, mouth 0.00)
- PASS expressions are relayed between modded players (mood SURPRISED)
- PASS other player's spiral eyes when they get hit
- PASS Apply to Everyone OFF: the other player looks normal
- PASS server-synced googly look shows on the other player
- PASS Show Synced Looks OFF hides it again
- PASS Player Selection can remove googly eyes from one player
- PASS ... without affecting anyone else
- PASS Player Selection lists both players (2 rows)
- PASS clicking a player's switch stores a per-player choice

### Performance
- PASS 14 animated faces rendered (13 faces simulated per tick)
- PASS CPU cost per face is small (6.5 us to submit + 87.8 us to build the mesh per face per frame, 2067 faces measured, 872 quads in the last face)
- Frame rate with 14 animated faces on a software renderer (no GPU): 28 FPS
- PASS faces out of view stop being simulated (0 faces simulated while looking away)

### Screenshots
- `0000_menu_title_screen.png`: Settings menu opened from the title screen; preview uses the default skin
- `0001_googly_idle.png`: Idle googly face: rimmed 3D eyes, pupils with highlights, brows, mouth
- `0002_talking.png`: Talking (chat): eyes swollen to about 1.6x, mouth wide open, brows up
- `0003_talk_laughing.png`: Talking expression from chat: laughing
- `0004_talk_wide_open.png`: Talking expression from chat: wide_open
- `0005_screaming.png`: Screaming: enormous trembling eyes, huge oval mouth with uvula, brows up, head shaking
- `0006_expr_surprised.png`: Surprised expression (keybind): huge eyes, raised brows, O mouth
- `0007_expr_angry.png`: Angry expression: slanted brows, gritted teeth
- `0008_expr_laughing.png`: Laughing expression: squinting eyes, big D-shaped mouth
- `0009_hit_spiral.png`: Hit reaction: huge spinning spiral eyes, shocked mouth, wobble, stars
- `0010_hit_spiral_2.png`: Hit reaction a moment later (spirals have rotated, stars orbit)
- `0011_hit_recovered.png`: After the reaction: normal googly eyes again
- `0012_setting_spiral_off.png`: Spiral Eyes OFF: still shocked and dizzy, but normal eyes
- `0013_setting_brows_off.png`: Eyebrows OFF
- `0014_setting_big_eyes.png`: Eye Size 1.8x, Pupil 1.4x, Mouth 1.5x, Eyebrow 1.6x
- `0015_setting_eye_spacing.png`: Eye Spacing 1.35x
- `0016_all_off.png`: Googly Eyes OFF: plain vanilla player
- `0017_menu.png`: The Googly Goobers menu with live preview
- `0018_menu_talking_sliders.png`: The new Talking & Expressions sliders
- `0019_preview_googly.png`: Preview: Googly Eyes
- `0020_preview_talking.png`: Preview: Talking
- `0021_preview_screaming.png`: Preview: Screaming
- `0022_preview_blinking.png`: Preview: Blinking
- `0023_preview_surprised.png`: Preview: Surprised
- `0024_preview_angry.png`: Preview: Angry
- `0025_preview_laughing.png`: Preview: Laughing
- `0026_preview_confused.png`: Preview: Confused
- `0027_preview_spiral.png`: Preview: Spiral Hit
- `0028_preview_zoom_rotated.png`: Preview zoomed in and rotated (drag / scroll)
- `0029_player_selection_singleplayer.png`: Player Selection in singleplayer
- `0030_mp_other_player.png`: Another player on the server with googly eyes, seen in first person
- `0031_mp_other_player_talking.png`: The other player talking: eyes about 1.6x, mouth wide open
- `0032_mp_other_player_laughing.png`: The other player laughing after their chat message
- `0033_mp_other_player_screaming.png`: The other player screaming
- `0034_mp_voice_talking.png`: The other player talking on voice chat
- `0035_mp_voice_scream.png`: The other player yelling on voice chat: screaming face
- `0036_mp_other_player_hit.png`: The other player getting hit: spiral eyes
- `0037_mp_other_player_synced.png`: The other player's googly eyes, synced from the server
- `0038_player_selection_multiplayer.png`: Player Selection with another player (custom choice)
- `0039_perf_crowd.png`: A crowd of 13 other players, all with animated googly eyes
