# BUILD PROMPT — Wolf Knight 3D (paste into Claude Code)

Pre-flight (human does this BEFORE pasting):
1) Download every pack in design/ASSETS.md into ./asset-downloads (browser, manual — see checklist).
2) Start from a FRESH repo folder (keep the old Phaser repo as an archive; don't build on top of it).
3) Specs live in ./design (STORY-BIBLE, COMBAT-SPEC, LEVEL-MAP + SVG, HUD-MENU-SAVE,
   NARRATION-SCRIPT, ASSETS). They are the source of truth.

Copy everything inside the fence into Claude Code:

---

```
You are building a vertical slice of a personal 3D web game for my kids. You are running as Claude Code on the web
in a cloud sandbox on this repository; the repo ALREADY contains design/ and asset-downloads/.
Read ./design/*.md first (BUILD notes below override only where 3D differs). Work ONE phase at a
time: build it, commit + push, then STOP and wait — I will verify each phase on the live GitHub
Pages URL before you continue.

=== PROJECT ===
"Wolf Knight" — a 3/4 top-down action-adventure for young children, in chunky soft-shaded LOW-POLY
3D (Quaternius/KayKit/Kenney style). This slice builds ONLY "Ember Hollow" (volcano region):
knight Kael + Dark Wolf playable from the start, Fire Wolf earned at the climax. Story, combat,
rooms, narration lines and save design are all specified in ./design — follow them.

=== ENGINE & ARCHITECTURE (locked) ===
- three.js, VENDORED locally (download three.module.min.js + the GLTFLoader addon into ./vendor and
  wire them with an import map in index.html — check the vendored version's own docs for exact
  addon paths; do NOT hotlink a CDN at runtime; game must work offline).
- NO bundler. Plain static files (index.html + /js + /assets + /vendor) served directly.
  Deploy: GitHub Pages from main /(root). Live URL must work after Phase 0.
- PWA: manifest.json + a service worker caching EVERYTHING (vendor, models, audio). Landscape only.
- FLAT-PLANE GAMEPLAY: all logic runs in 2D on the XZ plane (positions, velocities, circle/AABB
  collisions, aggro ranges). The Y axis is visual only. Do not build 3D physics.
- Camera: perspective, pitched ~50° behind/above Kael (classic 3/4 view), smooth-follow.
- Rendering: cap devicePixelRatio at 2, antialias on, one hemisphere/ambient + key directional
  light as the base rig. Low-poly must stay crisp and bright on phones.
- Animation: GLTF AnimationMixer per character; map clips to states (idle/walk/attack/die) by
  inspecting the ACTUAL clip names in each file; crossfade transitions.

=== ASSETS (hard rules) ===
- Real packs are in ./asset-downloads (zips, plus the animal models already extracted at
  ./asset-downloads/quaternius_animated-animals/glTF/ — self-contained .gltf incl. Wolf and Fox).
  Extract the zips to ./asset-raw, INSPECT real filenames, copy chosen .gltf/.glb (+ textures)
  into ./assets with clear names. Keep the repo tidy: don't commit ./asset-raw. NEVER generate placeholder
  geometry for characters/creatures; NEVER invent file paths. If a model is missing, use the
  casting-sheet workaround in design/ASSETS.md and tell me.
- Casting sheet (design/ASSETS.md) is binding: KayKit Knight = Kael; ONE Quaternius Wolf with
  per-form material tints (colours listed there); Fox = Pip; scaled Wolf = pups; black-tinted
  Wolf = Shadow Hound; tinted monsters = Shades/Moths; Shadowgrip boss + Cinder are built in code.
- Environment: kit-bash Kenney Nature/Castle (+ Quaternius) modules per design/LEVEL-MAP.md's
  3 rooms; dark volcanic materials; lava = emissive orange planes that light the scene.
- Record every pack + licence in CREDITS.md (all CC0; three.js MIT).

=== 3D ADAPTATION NOTES (override 2D wording in specs) ===
- Dark zones & boss Phase-3 darkness = real lighting: unlit rooms; Dark Wolf attaches a light to
  Kael / raises ambient. As the Knight, dark rooms are near-black.
- Blood Moon = cooldown ultimate: howl (use howl/idle clip), a glowing red sphere with a red point
  light descends and impacts (AoE damage + screen shake). Make it feel BIG.
- Fire ground-slam = radial shockwave ring + brief emissive flash; burnable obstacles = scorched-
  vine/rock props that break apart (scale/fade chunks) when slammed.
- Controls (touch-first): HAND-ROLLED virtual joystick via pointer events (two circles, left half
  of screen) — the old rex plugin is Phaser-only, do not use it. Tap right side = attack;
  press-and-hold anywhere = radial form picker (HTML/CSS overlay is fine); special button with
  cooldown ring. Keyboard fallback: WASD + J attack + K special + Tab form picker.
- HUD/menus/profiles/save: implement HUD-MENU-SAVE.md as an HTML/CSS overlay (hearts, pup counter,
  captions bar, pause, settings, named per-kid profiles, localStorage schema v1 as written).
- Narration: NARRATION-SCRIPT.md verbatim — Web Speech API, per-character rate/pitch, captions on
  by default, duck music while speaking.

=== PHASES (each ends with: browser-verify with me, commit, push) ===
0. Scaffold: index.html + import map + vendored three, manifest.json, service worker; render one
   lit test room (kit floor + a few rocks) with an orbit-less fixed camera. Live on GitHub Pages.
1. Kael + movement: load Knight GLTF, idle/walk clips, virtual joystick + keyboard, camera follow,
   wall collisions (flat-plane), lava planes that hurt (1 heart, i-frames, knockback-free).
2. Ember Hollow rooms: build all 3 rooms + connections + checkpoints + dark nook + burnable props
   per LEVEL-MAP.md; room-reset-on-re-entry (anti-soft-lock).
3. Forms: radial picker; Dark Wolf (wolf GLTF, dark tint, see-in-the-dark lighting, Blood Moon
   ultimate w/ cooldown); locked Fire Wolf slot visible.
4. Combat: tap-attack (Knight sword clip, melee arc), Shades + Ember Moths per COMBAT-SPEC.md
   (telegraphs ~1s, puff-of-smoke deaths), Shadow Hound guarding Pup #2 branch.
5. Hearts/checkpoints/death: 5 hearts, HUD, gentle respawn at checkpoint with full hearts.
6. Boss: the Shadowgrip 3 phases per COMBAT-SPEC.md (tendril slams w/ ground-circle telegraphs,
   core exposure, Phase-3 darkness forcing Dark Wolf) → free Cinder → UNLOCK Fire Wolf
   (fire tint, ground-slam, burn obstacles) → shortcut opens.
7. Collectibles + payoff: Pip (Fox) follows + sparkles near pups; 3 pups placed per LEVEL-MAP.md
   (one behind a burnable); all 3 = permanent +1 heart.
8. Narration + audio: full NARRATION-SCRIPT.md wiring + captions + CC0 music/SFX with volume
   sliders (vendor audio locally).
9. Title/profiles/save + polish/offline: title screen, named per-kid profiles, settings, auto-save;
   service worker caches all; installs as PWA; plays fully offline; landscape lock. Final push.

=== SUCCESS CRITERIA ===
Live GitHub Pages URL; installable offline PWA; smooth on a phone. Playable slice exactly per the
design files: joystick movement, Knight + Dark Wolf from the start (Blood Moon + see-in-the-dark),
enemies + telegraphs, 5-hearts/checkpoints/gentle respawn, Shadowgrip → Cinder → Fire Wolf →
burn-backtrack → 3 pups → +1 heart, talking Pip with captions, per-kid saves. BUILDLOG.md records
decisions; CREDITS.md lists real packs/licences.

Make sensible calls yourself and log them; only ask me about child-experience or art-taste
questions. Never mark a phase done without me seeing it in the browser.
```
