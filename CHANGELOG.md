# Changelog

## Googly Goobers 1.0.0

First public release. Googly Goobers is the renamed, cleaned-up continuation of the private
"EyeBall Mod" 1.1.0 (its full history is kept in this repository).

**Minecraft versions:** 26.3, 26.2 and 1.21.11 (Fabric). Each version has its own jar.

### New
- **Minecraft 1.21.11 support**, with the same features, look, settings and menu as 26.x.
- New name, icon and logo: **Googly Goobers**.
- Commands are now `/googlygoobers` (short alias `/googly`): `eyes <players> on|off|reset`,
  `react <players>`, `expression <name>`, `status`.
- New **Confused** preview in the menu (the preview buttons are a full 3 x 3 grid now).
- The fabric.mod.json now asks for at least the Fabric API version each jar was built and tested with.

### Changed
- Settings are saved in `config/googlygoobers.json`. A settings file from EyeBall
  (`config/eyeball.json`) is moved over automatically on first launch.
- Operator-forced looks are saved in `googlygoobers_forced_looks.json` in the world folder (an
  old `eyeball_forced_looks.json` is migrated automatically).
- "Character Size" is now called **Face Size** (it scales the whole cartoon face).
- The first settings section is now called **General**; "Who Gets The Effects" is now
  **Who Gets Googly Eyes** with plain Apply to Myself / Apply to Everyone switches.
- Player Selection has a single Googly Eyes switch per player.

### Removed
- The character transformation from the private EyeBall builds, and everything that belonged to
  it (its model, fur, textures, first-person arms, animations, switch, keybind, command, previews,
  settings and multiplayer sync). Googly Goobers contains no third-party characters.

### Unchanged
Everything else from EyeBall 1.1.0: 3D googly eyes with independently wobbling pupils and
highlights, blinking, eye pops and bounces, exaggerated talking and screaming faces (eyes swell to
about 1.6x when talking and 2x when screaming, the mouth opens much wider), expressions and
eyebrows, chat and Simple Voice Chat lip sync, expression keybinds, spiral-eye hit reactions with
shocked mouth, head wobble, body stagger and orbiting stars, every setting and slider, the live
preview, Player Selection, multiplayer sync and operator commands.
