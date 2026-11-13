# Publishing Googly Goobers on Modrinth

Nothing has been uploaded. This is the checklist and the exact values to use when you do it.

## 1. Before you publish: open items (decide these first)

These are not technical problems with the jars, but Modrinth can reject or remove the project if
they are not resolved. Modrinth's Content Rules were checked on 2026-11-13 (last modified
2026-08-13): https://modrinth.com/legal/rules

1. **AI-generated content (Content Rules section 6).**
   - Rule 6.2: *"No images uploaded to a gallery, icon, description, or any other part of a
     project page may be created or derived from generative AI output."* If the icon artwork
     (`branding/source/googly-goobers-artwork.webp`) was made with an AI image generator, it can't
     be used as the Modrinth icon, the gallery or in the description, even though it is fine as
     the in-game icon. In that case use a hand-made icon instead.
   - The logo/banner (`branding/logo.png`, `branding/banner.png`) is drawn by a Python script
     (`tools/make_branding.py`), not by an image-generation model, but the script itself was
     written with an AI coding assistant. Decide whether you consider that acceptable.
   - Rule 6.1: tick **"Contains AI-generated content"** if a substantial portion of the code is AI
     output. Most of this mod's code was written with an AI coding assistant (see the git history).
   - Rule 6.2 also says projects *"may not be published publicly if the contents are primarily or
     entirely a product of AI output."* Read the rule yourself and decide whether, and how, you
     publish.
   - The in-game screenshots in `docs/screenshots/` are real captures of the mod running in
     Minecraft, not generated images.
2. **License.** No license has been chosen. Modrinth asks for one when you create the project, and
   the license you pick must match the repository (rule 5.1). Add a `LICENSE` file to the
   repository first (for example MIT, or "All Rights Reserved"), then pick the same on Modrinth.
3. **Icon content.** The icon artwork shows Minecraft-style characters (a Steve-like player, a
   Creeper and a Sheep). Modrinth's rules don't mention Mojang characters specifically; Mojang's
   usage guidelines decide whether that is allowed. Never imply the mod is official.
4. **Links.** The source/issues links point to the public GitHub repository. Merge the release
   branch into your default branch first, and check the links work (rule 5.4). The images in
   `description.md` point at the release branch on GitHub; after uploading the gallery images,
   you can switch them to the Modrinth gallery URLs.

## 2. Create the project

| Field | Value |
| --- | --- |
| Project type | Mod |
| Name | Googly Goobers |
| URL / slug | `googly-goobers` (it was not taken when checked on 2026-11-13) |
| Summary | Huge 3D googly eyes, bouncy eyebrows and talking mouths for every player, with screaming faces and spinning spiral-eye hit reactions. |
| Client-side | Required |
| Server-side | Optional |
| Categories | Social, Cursed (Modrinth has no "cosmetic" category; these are the closest of its 19 mod categories) |
| Additional categories | Decoration (optional) |
| Icon | `branding/modrinth-icon.png` (400 x 400 PNG, 233 KiB; Modrinth's limit is 256 KiB) - see item 1 above |
| Description | contents of `docs/modrinth/description.md` |
| Source code | https://github.com/torzzzzzzzz/Googly-Goobers---By-NotTorzz |
| Issues | https://github.com/torzzzzzzzz/Googly-Goobers---By-NotTorzz/issues |
| License | your choice (item 2) |

**Gallery** (all real in-game captures from the automated tests):

| File | Title |
| --- | --- |
| `branding/banner.png` | Googly Goobers (set as featured, only if item 1 allows) |
| `docs/screenshots/faces_strip.png` | Idle, talking, screaming and hit |
| `docs/screenshots/talking.png` | Talking: big eyes, wide-open mouth |
| `docs/screenshots/screaming.png` | Screaming |
| `docs/screenshots/hit_spiral.png` | Hit reaction: spiral eyes and stars |
| `docs/screenshots/mp_other_player_talking.png` | Another player talking on a server |
| `docs/screenshots/menu.png` | The settings menu with live preview |
| `docs/screenshots/menu_talking_sliders.png` | Talking & Expressions sliders |
| `docs/screenshots/player_selection_multiplayer.png` | Player Selection |
| `docs/screenshots/perf_crowd.png` | A crowd of players with googly eyes |

## 3. Upload the three versions

Upload each jar as its own version. Don't upload the `-sources` jars as the primary file
(rule 5.7 allows source jars only as additional files).

| | 26.3 | 26.2 | 1.21.11 |
| --- | --- | --- | --- |
| File | `dist/googly-goobers-1.0.0-mc26.3.jar` | `dist/googly-goobers-1.0.0-mc26.2.jar` | `dist/googly-goobers-1.0.0-mc1.21.11.jar` |
| Version number | `1.0.0+mc26.3` | `1.0.0+mc26.2` | `1.0.0+mc1.21.11` |
| Version name | Googly Goobers 1.0.0 for 26.3 | Googly Goobers 1.0.0 for 26.2 | Googly Goobers 1.0.0 for 1.21.11 |
| Release channel | Release | Release | Release |
| Loaders | Fabric | Fabric | Fabric |
| Game versions | 26.3 | 26.2 | 1.21.11 |
| Required dependency | Fabric API | Fabric API | Fabric API |
| Optional dependencies | Mod Menu, Simple Voice Chat | Mod Menu, Simple Voice Chat | Mod Menu, Simple Voice Chat |

Changelog for each version: the "Googly Goobers 1.0.0" section of `CHANGELOG.md`.

The version numbers match the `version` field inside each jar's `fabric.mod.json`. Only select the
one game version each jar was built for: each jar refuses to load on other Minecraft versions
(`"minecraft": "~26.3"`, `"~26.2"` and `"1.21.11"`).

Before uploading, verify the files: `cd dist && sha256sum -c SHA256SUMS.txt`.

## 4. After uploading

- Modrinth checks that each file is a valid Fabric mod. Then the project goes to moderation;
  answer moderator messages from the project page.
- Download each version from Modrinth once and check its SHA-256 matches `dist/SHA256SUMS.txt`.
