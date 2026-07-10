# Build Log — Wolf Knight

Decisions made during the build, phase by phase. Specs live in `./design`; this file
records where judgement calls were made.

## Phase 0 — Scaffold (2026-07-09)

**Goal:** static-file scaffold (no bundler), vendored three.js + import map, PWA shell
(manifest + service worker), one lit volcanic test room from real kit pieces, fixed 3/4
camera. Deployable to GitHub Pages from the repo root.

### Decisions

- **three.js 0.185.1** (latest stable at build time), vendored from the official npm
  tarball into `./vendor`. The min build is split since r167: `three.module.min.js`
  imports `./three.core.min.js`, so both are vendored side by side. `GLTFLoader.js`
  imports `three`, `../utils/BufferGeometryUtils.js` and `../utils/SkeletonUtils.js`,
  so both utils are vendored under `vendor/addons/utils/`. Import map in `index.html`
  maps `three` → `./vendor/three.module.min.js` and `three/addons/` → `./vendor/addons/`
  (the standard three.js addon prefix). Verified the import graph is closed — no other
  external imports.
- **All URLs are relative** (`./…`) everywhere — index.html, import map, sw.js precache,
  manifest `start_url`/`scope` — because GitHub Pages serves project sites from a
  subpath (`/<repo>/`). Nothing may assume a root path.
- **Test room built from real kit pieces** (hard rule: no invented paths; all filenames
  inspected after extracting the zips to `./asset-raw`, which is gitignored):
  - Kenney **Nature Kit** `ground_grass.glb` → `assets/env/floor-tile.glb` (1×1 m tile);
    `rock_large[A-C].glb`, `rock_small[A-B].glb` → boulders; `cliff_block_rock.glb` →
    wall ring.
  - Kenney **Castle Kit** `wall-pillar.glb` → `assets/env/pillar.glb`. Castle GLBs
    reference an external `Textures/colormap.png`, so that texture is copied alongside
    at `assets/env/Textures/colormap.png` (GLTFLoader resolves it relative to the GLB).
    Nature Kit GLBs are fully self-contained (plain colored materials, no textures).
- **Volcanic retint in code:** Kenney's meadow-green materials are retinted by material
  name (`grass`→ashen moss, `dirt`→scorched earth, `stone`→basalt, castle `colormap`
  texture multiplied darker). One shared tinted material instance per name (cached),
  so draw-call state stays small. This implements the "dark volcanic materials" spec
  without touching the asset files.
- **Floor and wall ring are `InstancedMesh`** (one draw call each: 192 floor tiles,
  60 wall blocks) — phone-friendly from day one. Tiles/blocks get deterministic 90°
  rotation + height variation (no `Math.random`, so every load looks identical).
- **Light rig per spec:** hemisphere fill + one warm key directional with a tight
  1024² shadow map (PCFSoft). Plus a pulsing emissive **lava pool** with an orange
  point light — a Phase-0 taste of the region's signature "lava lights the cave" look
  (ASSETS.md calls for exactly this technique).
- **Camera:** perspective 50° FOV, pitched 50° down, fixed on the room (smooth-follow
  arrives with Kael in Phase 1).
- **Renderer:** `devicePixelRatio` capped at 2, antialias on.
- **Service worker:** cache-first with a versioned cache name (`wolfknight-vX.Y.Z` —
  bump on every deploy), full precache of vendor/js/assets, runtime caching of
  same-origin GETs, offline navigation falls back to `index.html`. `skipWaiting` +
  `clients.claim` so phase updates roll out on next reload.
- **PWA icons** generated as original art (ember crescent moon over volcanic ridge,
  512/192/180 px) with a small pure-Node PNG writer — no creature art, no asset-pack
  content, so no licence concerns.
- **Landscape-only** is enforced softly for now: manifest `orientation: landscape` +
  a CSS "rotate your device" overlay in portrait. (Hard lock where supported comes
  with the polish phase.)
- **Error surfacing:** a visible error overlay catches window errors and asset-load
  failures — makes phone verification much easier than a blank screen.

## Phase 1 — Kael + movement (2026-07-09)

**Goal:** playable Kael — KayKit Knight with idle/walk/run animation states, virtual
joystick + WASD, smooth-follow 3/4 camera, flat-plane collisions, lava that hurts.

### Decisions

- **Knight + animation libraries:** KayKit Adventurers `Knight.glb` (texture embedded,
  no clips of its own) + KayKit Character Animations 1.1 `Rig_Medium_*` GLTF libraries.
  Clip names inspected from the real files: `Idle_A`, `Walking_A`, `Running_A` (plus
  `Melee_1H_*`, `Hit_A`, `Death_A`, `Spawn_Ground` for later phases). The library clips
  bind directly to the knight's skeleton — verified zero `PropertyBinding` warnings at
  runtime. Knight scaled ×0.5 (raw height 2.54 → ~1.27 in-world vs 1-unit floor tiles).
- **Code split into modules** (still no bundler, plain ES modules): `assets.js`
  (loader + shared volcanic material pass), `input.js` (hand-rolled floating joystick on
  the left half via pointer events + WASD/arrows; right-half taps and J/K already queue
  attack/special for Phase 4), `world.js` (room build + collision world), `player.js`
  (Kael), `main.js` (bootstrap/camera/loop).
- **Flat-plane collision:** player = circle (r 0.32); world = box colliders (wall rows)
  + circle colliders (rocks, pillars). Resolution = project-out with slide (boxes:
  closest-point push-out, or least-penetration axis if fully inside); no impulses, no
  knockback anywhere. Lava = rectangular damage zones, never blocks movement: 1 heart
  on contact, ~1s i-frames (red flicker on Kael), re-tick while standing. At 0 hearts:
  soft fade, respawn at spawn point with full hearts (the Phase 5 checkpoint system
  will take this over).
- **Camera:** smooth-follow with exponential damping (framerate-independent), same 50°
  pitch; key light + its shadow frustum track the player so shadows stay tight in
  bigger rooms later.
- **dt clamped to 50 ms** — on very slow devices the game slows down instead of
  characters tunneling through walls.
- **Temporary hearts readout** (emoji, top-left) so lava damage is visible before the
  real HUD lands in Phase 5. A `window.__game` hook exposes player/world for automated
  browser tests.

### Verification

- Headless-Chromium gameplay test with position-feedback keyboard steering: wall stops
  the body at exactly x = 7.68 (8 − body radius); lava entry 5→4 hearts, standing tick
  4→3; walked out cleanly; defeat → fade → respawn at spawn with 5 hearts; zero console
  errors, zero animation-binding warnings. Screenshots confirm idle/walk poses, red
  cape reading nicely, camera following.

## Phase 2 — Ember Hollow rooms (2026-07-10)

**Goal:** all 3 rooms per LEVEL-MAP.md with connections, checkpoints, the dark nook,
burnable props, geysers, and room-reset-on-re-entry.

### Decisions

- **Room manager:** one room live at a time; walking into a door zone fades out,
  disposes the room's scene graph (shared cached geometry is NOT disposed), rebuilds
  the target room, fades in. Rebuilding fresh on every entry IS the anti-soft-lock
  reset. Permanent facts (boss defeated, burned obstacles, collected pups) live in
  `state.flags` and are applied at build time.
- **`rooms.js` layouts** (16×12 R1, 20×12 R2, 16×16 R3): shells built by a helper that
  cuts door gaps into both the wall instancing AND the wall colliders (split into
  segments around gaps). R1: two lava patches + pillars, SE dark nook (Pup #1 spot),
  SW burnable cubby (Pup #3 spot), CP1 at exit; R2: full-width lava channel crossed by
  a real Kenney stone bridge (with rails so kids can't corner-cut into lava), 3-geyser
  crossing, SE branch pocket (Shadow Hound + Pup #2 markers), CP2 before the boss door;
  R3: lava rim arena, 4 pillars, CP3, floating caged-Cinder ember at center, sealed
  shortcut (rock plug) in the west wall that Phase 6 replaces with a door to R1.
- **Dark zones = real lighting:** standing in a dark-zone rect as the Knight lerps the
  global hemisphere/key rig down ~95%; lava pools and campfires are point lights so
  they keep glowing — exactly the ASSETS.md trick. A translucent dark veil hovers over
  the nook so the darkness is visible from outside. Dark Wolf (Phase 3) will zero the
  darkness + see through the veil.
- **Geysers:** 3.5 s cycle — 2.0 s dormant → 0.5 s glow telegraph → 1.0 s erupting
  column (emissive cylinder) that turns its damage circle on. Same damage path as lava
  (1 heart, i-frames).
- **Burnables:** scorched clumps kit-bashed from real pieces (bushLarge ×2 + logStack +
  stump, materials lerped toward char-black), circle collider, keyed by id in
  `state.flags.burned` so Phase 6's fire slam can remove them permanently.
- **Checkpoints:** Kenney campfire + cone flame + warm light; touching one sets the
  respawn point (room + position) and brightens the fire. Defeat → fade → rebuild the
  checkpoint's room → respawn there with full hearts.
- **markers** on each world carry Phase 4-7 spots (shades, moths, hound, pups, boss) so
  later phases only consume them.

### Verification

- Headless Chromium: R1→R2→R3 door round-trip with correct entry points; CP1/CP3 both
  registered by touch; geyser eruption damaged 5→4; death in R3's lava rim respawned at
  CP3 (full hearts, same room); burnable collider blocks the cubby (stops at exactly
  collider+body radius) and is present again after re-entry; dark nook blacks out the
  room while lava/campfire stay lit (screenshot-confirmed); zero console errors.

## Phase 3 — Forms (2026-07-10)

**Goal:** radial form picker; Dark Wolf (tinted wolf GLTF, see-in-the-dark, Blood Moon
ultimate on cooldown); Fire Wolf slot visible but locked.

### Decisions

- **One Quaternius Wolf** (`assets/chars/wolf.gltf`, self-contained, 12 clips) serves
  every wolf form, cloned via `SkeletonUtils.clone` and tinted per the ASSETS.md
  casting sheet (dark 0x4a3b6b, fire 0xff5a2b built now but locked). `Main_Light`
  belly gets the tint lightened 30%; eyes get a soft emissive glow per form (moonlit
  blue / ember gold). Wolf scaled ×0.35 (raw height 2.67). Clip map: Idle / Walk /
  Gallop (run) / `Idle_2` as the howl (no dedicated howl clip in the pack — the
  head-raise pose sells it; spec explicitly allows "howl/idle clip").
- **Form picker:** press-and-hold (420 ms, ≤14 px drift) ANYWHERE opens a radial
  HTML/CSS picker centered on the finger — works mid-joystick (the held pointer is
  taken over). Drag highlights, release selects; releasing on the locked Fire Wolf
  shakes the form badge (Pip's "form_locked" line arrives in Phase 8). Keyboard: Tab
  cycles unlocked forms, K = special. Right-half attack taps moved to pointer-UP
  (quick-tap only) so holds never fire attacks.
- **Blood Moon** (~3 s, cooldown 24 s): howl (movement locked 1.15 s) while a red
  hemisphere wash rises → a glowing red moon (emissive icosahedron + red point light)
  falls with x² acceleration onto a point 2.4 units ahead of Kael → impact: screen
  shake, expanding ring decal, `world.damageEnemiesAt(x, z, r=3, 99)` hook that Phase
  4's enemies will register (one-shots grunts per COMBAT-SPEC).
- **See in the dark:** Dark Wolf carries a moonlit point light (intensity eases 2.2
  normal → 9 inside dark zones); dark-zone dimming (Phase 2) is skipped entirely for
  the wolf, veils go near-transparent.
- **UI:** special button (bottom-right, conic-gradient cooldown ring, glows when
  ready) + active-form badge. Emoji iconography (⚔️🌙🔥) — zero image assets, reads
  instantly for pre-readers.

### Verification

- Headless Chromium: Tab switches to Dark Wolf; lamp intensity ≈9 in the dark nook
  (screenshot shows the wolf lighting the nook while the room stays dark); Blood Moon
  fires via K — screenshots at moon-fall (y≈12) and impact (red wash + ring + landed
  moon); cooldown gates a second cast; radial picker opens on hold, drag-selects
  Knight, Fire Wolf shows locked and selecting it keeps the current form; zero
  console errors. (Headless runs ~5 fps so the sequence was captured by polling the
  moon's height, not wall-clock waits.)

## Phase 0 verification (recorded)

- Served locally and screenshot-tested in headless Chromium (desktop + phone-landscape
  viewport): room renders lit, no console errors, service worker registers and
  precaches all 21 URLs, manifest parses.
- Two real bugs caught by screenshot iteration: Kenney GLBs export `metallicFactor: 1`
  (fully metallic renders black away from direct light — forced `metalness = 0` in the
  material pass), and multi-material Kenney GLBs are multi-primitive (instancing only
  the first mesh dropped the cliff blocks' side faces — instancing now covers every
  primitive).
- Two more caught by an adversarial multi-agent review pass: (1) `cache.addAll` fetches
  through the browser HTTP cache (GitHub Pages serves `max-age=600`), so a deploy could
  fill a fresh cache version with stale files — precache requests now use
  `cache: 'reload'`; (2) the pillars were lifted 0.6 units into the air because the GLB
  bounds were read from the NORMAL accessor (±1) instead of POSITION (0..1.31) — the
  pillar base already sits at y=0. Lesson recorded: when inspecting GLB bounds, filter
  accessors to the POSITION attribute only.
