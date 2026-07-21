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

## Phase 4 — Combat (2026-07-10)

**Goal:** tap-attack with a melee arc; Shades + Ember Moths + Shadow Hound per
COMBAT-SPEC.md; ~1 s telegraphs; puff-of-smoke deaths.

### Decisions

- **Attack:** right-half quick-tap or J. Knight uses the KayKit
  `Melee_1H_Attack_Slice_Diagonal` clip (movement locked 0.55 s, hit lands 0.3 s in,
  range 1.5, ±70° arc); wolf forms bite with the Quaternius `Attack` clip (0.45 s /
  0.24 s / 1.3). Giving the wolves a bite is a small extension of the spec (COMBAT-SPEC
  names the sword as the main tool) — kids will expect the wolf to bite, and the boss
  stays sword-tuned. One-shot clips restart cleanly on repeated taps.
- **Enemies (code-built per ASSETS.md casting sheet):**
  - *Shade* — near-black translucent wisp (icosahedron, opacity .88) with 3 orbiting
    ember flecks; drifts at 1.15 u/s toward Kael inside aggro 7; hp 2; contact = 1
    heart (through the shared i-frame path).
  - *Ember Moth* — small dark body + two emissive triangle wings that flap; hovers
    around home; inside 5.2 units it pauses ~0.8 s while the wings glow ~3× brighter
    (the telegraph), then dives in a straight line at 6.5 u/s and returns home; hp 1.
  - *Shadow Hound* — the ONE wolf model, near-black tint + red emissive eyes; stalks at
    1.5 u/s, crouches ~1 s while a dark streak fades in along the charge lane, charges
    at 8.5 u/s (stops on walls), recovers 1.6 s (vulnerable); hp 3; guards the Pup #2
    branch in R2 (respawns with the room — the branch stays replayable).
  - Deaths puff into 8 expanding, fading smoke bits (not gory). Hit feedback = brief
    white emissive flash. No knockback anywhere.
- **Spawns from Phase 2's room markers:** R1 one teaching Shade; R2 two moths near the
  lava channel + a 2-Shade cluster (never swarms) + the Hound. `world.damageEnemiesAt`
  now real, so the Blood Moon one-shots grunts in its radius as specced.

### Verification

- Deterministic headless run (drives `tryAttack` directly; predicate waits instead of
  wall-clock — headless renders ~5 fps): Shade dies in exactly 2 sword hits; Moth
  telegraphs → dives → contact costs a heart; Blood Moon kills both clustered Shades
  in one cast; Hound cycles stalk → crouch (streak telegraph, screenshot) → charge and
  dies in 3 hits; zero console errors.

## Phase 5 — Hearts / HUD / death (2026-07-10)

Most of the loop already existed (5 hearts, checkpoint respawn with full hearts,
gentle fade). This phase formalized the HUD per HUD-MENU-SAVE.md: pup counter
(top-right `🐺 x/3`), pause button + pause overlay (Esc toggles; game loop freezes but
keeps rendering), "Saved ✓" toast on checkpoint touch, heartbeat pulse on the hearts
row at ≤2 hearts (the low-hearts moment Pip will voice in Phase 8). Settings and Title
land with profiles in Phase 9. Verified headless: toast, low-pulse class, pause
freezing enemies, resume. sw v0.5.0.

## Phase 6 — The Shadowgrip + Fire Wolf (2026-07-10)

**Goal:** the 3-phase boss per COMBAT-SPEC.md → free Cinder → unlock Fire Wolf
(ground-slam + burn) → shortcut opens.

### Decisions

- **Boss (all code-built per the casting sheet):** dark blob core (icosahedron) with a
  player-tracking eye, hovering over the caged Cinder ember (warm point light), three
  grip tendrils arcing over it — one visibly releases per sever.
  - *Phase 1:* tendril slams aimed at the player's feet — pulsing dark-circle telegraph
    (1.05 s) → slam (1 heart in r 1) → tendril stuck 2 s as a sword-hittable (hp 2, only
    severable in this phase). 3 severed → phase 2.
  - *Phase 2:* core sinks into reach (hittable r 1.35, HP 8 total), summons exactly 2
    Shades, and a slow rotating shadow wave (0.55 rad/s bar, damage in a ±0.16 rad
    slice between radius 1.2-6.2 — always a huge safe arc). Blood Moon is capped at 3
    damage vs boss parts, so spec math holds (~8 sword hits or ~2 moons + hits).
    Core to HP 4 → phase 3.
  - *Phase 3:* `world.bossDarkness` blacks out the room through the existing real-light
    darkness system (Dark Wolf sees; lava/campfire/Cinder still glow); slams come
    faster (0.8 s telegraph); the core opens in 2.2 s bursts between 2.0 s guarded.
  - *Defeat:* dissolve (shrink + rise), Cinder brightens and floats free, warm
    hemisphere flood + shake; sets `bossDefeated` + `shortcutOpen`, pushes `fire_wolf`
    into `formsUnlocked`. Death mid-fight = CP3 respawn; room rebuild resets the boss.
- **Live shortcut:** R3's west gap is always built but plugged with rocks + a collider;
  beating the boss removes the plug in the live room (`world.openShortcut`) — the
  backtrack starts immediately, no re-entry needed. (Caught by the automated run: the
  original build-time-only door never opened in the live room.)
- **Fire Wolf ground-slam:** special routes by form (`trySpecial`); slam = wolf Attack
  clip + expanding orange shockwave ring + flash + small shake, 2 dmg to enemies in
  r 3, `world.burnAt` r 2.6 breaks burnables apart (chunks scatter/shrink/fade,
  collider removed, `state.flags.burned[id]` set permanently), cooldown 7 s (vs Blood
  Moon 24 s — per-form `specialMax` drives the ring UI).

### Verification

- Deterministic headless full fight: 3 tendril rounds severed; phase 2 spawned exactly
  2 Shades; core 8→4 flipped phase 3 with room darkness on; burst-window hits finished
  the core; defeat granted fire_wolf + shortcut + boss flags and lifted darkness; the
  live shortcut walked the player R3→R1; fire slam burned the R1 cubby (flag set,
  collider gone — the cubby interior resolves with zero push-out); zero console errors.

## Phase 7 — Pip + pups + payoff (2026-07-10)

**Goal:** Pip (Quaternius Fox) follows and sparkles near pups; 3 pups per LEVEL-MAP
gates; all 3 = permanent +1 heart.

- Pip: fox at ×0.22, follow-behind at 1.5 units (trot 3.4 / sprint 6.2 u/s), Idle /
  Walk / Gallop clips; a pool of 7 golden octahedron sparkles orbits him and fades in
  whenever an uncollected pup is within 4.5 units. Pip has no collider (never blocks)
  and teleports to Kael's side on room changes.
- Pups: the ONE wolf model at ×0.16 playing `Idle_2_HeadLow` (a sad little pup),
  gentle head-turn sway; touch within 0.85 → golden star burst, flag in
  `state.flags.pups`, HUD counter updates. Pup #1 dark nook / #2 hound branch / #3
  cubby behind the burnable (its collider guards it until burned).
- All 3 → `state.maxHearts` 5→6, heal to full, warm flood celebration. HUD shows 6
  hearts (Pip's "all_pups" line lands in Phase 8).
- Verified headless: follow, sparkle trigger, all three collections across their
  gates (hound branch entered with i-frames, cubby after simulated burn), counter
  3/3, 6-heart HUD. sw v0.7.0.

## Phase 8 — Narration + audio (2026-07-10)

**Goal:** NARRATION-SCRIPT.md verbatim over Web Speech, captions on by default, music
ducking; local CC0 music + SFX with volume sliders.

### Decisions

- **narration.js:** the whole script as a data table (id → voice/text, verbatim).
  Character voices differ by rate/pitch (Pip 1.0/1.3, Cinder 0.85/0.8, Grimm 0.85/0.6,
  Luna 0.9/1.1) on the best available local `en` system voice. Story lines fire ONCE
  per save (`state.spoken`); if a line is already speaking, story beats queue while
  contextual chatter is dropped (story > chatter). Captions bar bottom-center shows
  "Pip: …" and auto-hides; with voice off, captions pace by text length. A safety
  timer covers TTS engines that never fire `onend`. Music ducks to 30% while speaking.
- **Triggers:** proximity/state checks in the main loop (nook mouth, burnable, geyser
  crossing, branch mouth, boss door…), room-entry lines, boss-phase lines (including
  `boss_bloodmoon` when the ultimate is ready mid-fight), defeat chain (Cinder's two
  lines + Pip's how-to queued in order), pup/all-pups, checkpoint/low-hearts/respawn/
  form-locked/enemy-group with per-line throttles, and 22-second **stuck re-hints**
  for the three teach gates. `region_complete` → Grimm taunt → Luna dream plays at a
  glowing exit portal that appears in R3 after the boss falls.
- **audio.js:** WebAudio, unlocked on first gesture; SFX bus + music bus with a duck
  gain; looped music with 0.7s crossfades (region-ember in R1/R2, boss in R3 while it
  lives, victory sting → back to region loop on defeat). 14 Kenney SFX wired: swings,
  hits, puffs, hurt, form-switch, geyser, pup chime, checkpoint tick, UI clicks,
  slam/burn, tendril slams, moon impact. `boss.wav` (21 MB) downsampled to mono
  22 kHz (5.4 MB) with Python stdlib — the bundled ffmpeg build can't read WAV.
- **Settings** (pause menu): music + SFX sliders, captions + voice toggles — live on
  `state.settings` (per-profile persistence lands in Phase 9).

### Verification

- Headless: intro caption verbatim; music `region-ember` after unlock → `boss` in R3;
  dark_nook/checkpoint/r2_enter/geyser_intro/boss_intro all fired by movement; story
  lines refuse to refire; contextual line correctly dropped while a story line spoke
  (test then cleared the race); settings UI seeded from state; zero errors.

## Phase 9 — Title / profiles / save / offline (2026-07-10)

**Goal:** title screen, named per-kid profiles, auto-save, full-offline PWA. Final phase.

### Decisions

- **Title screen:** warm volcano-gradient CSS + the app icon as logo. Profiles are
  icon-first big buttons; New Player picks a name (typed, 12 chars) + an emoji icon;
  selecting a profile offers Continue (if a save exists) / New Game. New Game over an
  existing save needs a second tap ("Start over? Tap again") — kid-proof, no modal.
  Assets stream in behind the title, so it appears instantly.
- **Save system (localStorage schema v1 as written):** `wolfknight:profiles` +
  `wolfknight:save:<id>`; parsed in try/catch, corrupt/missing → fresh. Additive
  extensions to the documented shape: `flags` (boss/shortcut/burned), `spoken`
  (narration once-per-save memory) and `form`, and `checkpoint` stores the full
  `{room,x,z,id}` object — so Continue restores the exact run. Auto-saves on:
  checkpoint, form unlock, pup collected, region complete, every settings change and
  when the app is backgrounded (`visibilitychange`).
- **Pause menu** gained a Title button — persists, then `location.reload()` (the
  simplest airtight world/state reset). Settings live in the pause menu (one place;
  reachable in-game any time). Region-complete celebration overlay: "Ember Hollow is
  free!", Fire Wolf earned, pups x/3, Onward!
- **Landscape/fullscreen:** manifest `orientation: landscape` + best-effort
  `requestFullscreen()` and `screen.orientation.lock('landscape')` on the title tap,
  plus the CSS rotate overlay from Phase 0.
- Badge now reads v1.0; service worker cache `wolfknight-v1.0.0` precaches all 60+
  files (vendor, models, audio, icons, code).

### Verification

- Headless: created profile "Milo" 🦊 → played → CP1 persisted (schema checked in
  localStorage) → enriched the save (fire wolf, pup, boss flags, volume 0.5) → reload
  → profile listed on title → Continue restored room/checkpoint/forms/pups/flags/
  settings/spoken and placed Kael at the checkpoint → region-complete overlay at the
  exit portal → **network cut → full reload offline: title, Continue, gameplay all
  served by the service worker** (64 cached entries). Zero console errors.

## v1.1 — Combat update (2026-07-10, post-slice request)

Requested additions: longer reach, a ranged attack from the start, defend/parry,
healing potions with a carry limit on the HUD, and jump/double-jump that dodges
attacks when timed well.

- **Reach:** melee range knight 1.5 → 2.0, wolves 1.3 → 1.7 (arc unchanged).
- **Ranged bolt** (✨ button / L): KayKit `Throw` clip (wolves flick their bite), a
  glowing octahedron dart tinted per form, 11 u/s, range 7.5, 1 dmg, 1.1 s cooldown
  (button dims). Bolts stop on walls; cleared on room changes.
- **Defend / parry** (🛡️ hold / Shift or I): shield up = KayKit `Melee_Blocking`
  (wolves brace low), movement ×0.35, no attacking. A blocked hit costs **half a
  heart** — the HUD now renders halves with 💔 (hearts are floats in 0.5 steps). If
  the hit lands within **0.3 s of raising the shield → parry**: zero damage, metal
  ring, small screen jolt, and stunnable attackers (Shade/Moth/Hound) are dazed 2.2 s
  (dizzy spin, no AI). Fire (lava/geysers) ignores shields. Boss slams/wave can be
  blocked/parried but the boss itself can't be stunned.
- **Potions** (🧪 HUD row / H): start 2, carry max 3, +3 hearts per drink, tap the
  flask to use. Code-built glowing flask pickups sit near each checkpoint (respawn
  with the room; pickup refuses when full).
- **Jump / double jump** (⬆️ / Space): visual Y arc over the flat-plane sim (v 6.8,
  g 21 → ~1.1 peak); pressing again mid-air = higher double jump (~2.1). While above
  0.35 height, **ground attacks miss**: shade touch, hound charges, boss tendril
  slams and the shadow wave — and small lava gaps can be hopped (the R2 bridge is
  still the safe route; hop distance ≈3 u). Moth dives are flying attacks and still
  hit.
- Damage now funnels through `player.hurt(n, {attacker, groundAttack})` so every
  source declares how it can be avoided. New Kenney SFX: `throw` (drawKnife2),
  `parry` (metalClick), `potion` (bookPlace2). sw v1.1.0.

**Verified headless:** melee hit from 2.1 u; bolt killed a shade at 5 u; blocked hit
5 → 4.5 with 💔 in the HUD; fresh-shield parry lost zero hearts and stunned the
shade; jump peak 1.26 vs double-jump 2.15; standing on a shade mid-jump took no
damage; potion drink 1→4 hearts with HUD slots updating; flask pickup respected the
carry limit; zero console errors.

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
