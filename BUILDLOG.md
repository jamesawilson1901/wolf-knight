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

## v1.1.1 — Arm the knight (2026-07-10)

The KayKit Knight ships empty-handed; weapons are separate pack props meant for the
rig's `handslot` bones. Attached `sword_1handed` (right) + `shield_badge` (left) from
the Adventurers pack — they ride the hand bones through every clip (slice, block,
jump). Gotcha for the record: three.js's GLTFLoader strips dots from node names
(`handslot.r` → `handslotr`), so the first name-match silently attached nothing —
verified fixed by runtime bone inspection + screenshots. sw v1.1.1.

## v1.2 — Game-design update (2026-07-10)

All 12 items from the design review, implemented and verified:

1. **Progressive controls:** shield/bolt/jump buttons and the form badge start
   hidden; each pops in (scale animation) when Pip teaches it — shield when a Shade
   closes to 3.5 u, bolt when a moth is near, jump at the geyser crossing, badge at
   the dark-nook lesson. Reveals persist via the narration once-per-save memory.
   Three new Pip teach lines (additive to the script; existing lines untouched).
2. **Parry taught + rewarded:** the shield line teaches the timing; first successful
   parry gets Pip's praise line; stunned enemies take **double damage**.
3. **R1 funnel:** the teaching Shade moved onto the critical path (2.5, −0.5) —
   its aggro drift guarantees every kid meets it before the exit.
4. **Way-finding:** every door gap now has a torch-lit doorway (flanking pillars,
   flickering flames, glowing floor strip) and real Kenney `ground_pathTile`s lay a
   trampled dirt path along each room's critical route (auto-skips lava cells; the
   bridges carry it). Path tiles use dedicated brighter tints so they pop.
5. **Branch dressing:** the hound pocket sits in a dark ground shadow with a
   pulsing red glow + drifting embers — tempting-but-scary, pup visible beyond.
6. **Pillar cover works:** the boss's shadow wave is blocked when a pillar lies on
   the core→player line (segment/circle test vs `markers.pillars`).
7. **Ember drops:** slain enemies drop a glowing spark 35% of the time (elite hound:
   always) that heals half a heart; fizzles after 12 s with a blink warning.
8. **Juice:** 70 ms hit-stop on melee connect (90 ms on parry), scale-pop on every
   enemy hit, and the camera punches in ~14% during the Blood Moon.
9. **Bolt balance:** full damage vs flyers (moths — their counter), half vs grounded
   enemies, so sword and spark each have a job.
10. **Potions persist** — moved into run state and the save schema.
11. **Geyser reward:** a potion tucked past the crossing pays off the timing skill.
12. **Ambient rumble:** generated brown-noise low-pass loop under the music (no
    asset, works offline), per-room intensity. Also fixed en route: R3's west lava
    rim used to cross the shortcut walkway — now split around it.

Verified end-to-end headless: reveal flow + persistence across reload, funnel drift,
parry→stun→one-hit kill, chip-damage numbers, drop heal 3→3.5, cover true/false at
the right spots, potion save/restore, ambient live, zero console errors; screenshots
confirm paths/doorways/branch dressing.

## v2.0 / S1 — The systems expansion (overnight build)

The template for the 10-hour game: every core system, built into Ember Hollow first.

- **Ember shards** (currency): real Kenney coin models scatter with hop physics from
  crates/barrels/chests/boss, fly to Kael when near (Magnet buff: from far), HUD
  counter. **Breakables** (Survival Kit crates/barrels) are enemy-shaped so swords,
  bolts, slams and the Blood Moon all smash them (wood debris + shards; every ~9th
  pot hides a power-up). Den training barrels give nothing (no farming).
- **Chests**: wooden (Survival Kit) and golden (Pirate Kit treasure chest, glowing).
  Walk-close to open — hop + shard burst + loot toast; opened chests persist per save
  and sit dark. Contents: shards, potions, gear, power-ups, **heart pieces** (4 = +1
  permanent heart). Placed: R1 ×2 (incl. inside the burn cubby), R2 branch + golden
  past the geysers (heart piece), R3 golden after the boss.
- **Inventory + gear**: 6 weapons / 3 shields (KayKit Adventurers + Fantasy Weapons
  Bits), each changing *feel* — dagger fast, spear long, hammer slow-but-WHAM;
  shields trade block strength vs parry window. Equipped models mount on the
  knight's hand bones. 🎒 button → tap-to-equip grid.
- **The Moonlit Den**: a green glade off R1 south (the one uncorrupted place) —
  campfire checkpoint, tents, trees/flowers (natural colors, not volcanic tints),
  **Maren the trader** (KayKit Mage, idling by her Fantasy-Town cart; walk up → shop),
  training barrels, and **every rescued pup lives here**, romping in circles.
  Peaceful Village theme plays; no lava rumble.
- **Shop**: potions (15) + the gear ladder (70–300 shards); affordability graying,
  auto-equip on purchase, gear leaves stock once owned.
- **XP + levels**: enemies grant XP (shade 5 → hound 20, boss 60); level-up = toast,
  warm flood, +1 heart heal; every 3rd level a **pick-one-of-two perk card**
  (deterministic pair per level): sharper sword / brighter spark / faster special /
  swift paws. Enemy hp scales +8%/level (cap ×2.2) so numbers keep pace while
  behaviors carry difficulty.
- **Power-ups** (timed, big, visible): ⭐ Star of Luna (8s invincible+fast, sparkle
  trail), 🔥 Ember Fury (10s triple damage), 🪶 Feather (floaty triple-jump), 🧲
  Magnet, 🌙 Moon Shard (instant special). Sources: golden chests, pot luck, boss
  victory gift. HUD chips show active buffs.
- **Map screen** (pause → 🗺️): Den—R1—R2—R3 chain with you-are-here; **sticker book**
  (pause → 📒): 14 kid-achievements earned from play counters (kills, parries, pots,
  chests, shards, jumps, levels…), pop as toasts.
- **Music**: HydroGene arrives in-game — Den = Peaceful Village, R2 = Volcanic
  Crater, boss = **Battle Theme II with a true intro→loop** (sample-accurate
  scheduling), boss.wav retired. Save schema extended additively (shards, inventory,
  xp/level/perks, counters, stickers, chests).

Verified end-to-end headless (fresh profile): smash→scatter→collect; chest open +
persist; level 1→3 with perk card picked; Den entry (music swap) → shop opened by
walking to Maren → bought potion + Swift Fang (auto-equip, attack config reflects
dagger stats) → re-equipped via inventory; feather triple-jump gate; map + sticker
book render (2 earned); full reload restore. Zero console errors. Kit-texture
collisions solved by per-kit Textures folders (survival/pirate/platformer/town).

## Overnight notes (for the morning debug session)

- **Cozy/Brave**: new settings toggle (default Cozy = enemy hits halved, min half a
  heart; lava stays 1 — it's the teaching hazard). Quiet rubber-band: 3 defeats at
  the same checkpoint halves damage again until the next checkpoint is reached.
- Worth checking on a real phone tomorrow: shop/inventory card sizes with fat
  thumbs, den tent readability (it reads a bit skeletal from the top-down angle —
  easy to swap for a second campfire/log circle if it looks off), TTS voice quality,
  and whether shard pickup sounds get too chattery when 15 fly in after the boss.
- ~~Not built yet (next session): S2 Stoneroot Caverns~~ — built later the same
  night, see the v2.1 section below.

## v2.1 — S2: Stoneroot Caverns (overnight, second block)

Region 2 is in: a three-room cavern arc behind the R3 portal, on the S1 systems
template. All headless-verified (verify-s2 + S1 regression + offline), zero errors.

- **Region gate**: once the Part C celebration has played, the R3 portal ring
  becomes a real door (doors now take an optional `when()` predicate). Entering
  an `e*` room flips `state.region` to `stoneroot`; pups in saves are now
  flattened across regions so travel never loses them.
- **The rooms** — Quaternius Modular Dungeon pieces, converted OBJ→GLB offline
  with obj2gltf (runtime stays pure GLTF, no new loaders):
  - **E1 Cavern Gate**: entry arch, torch columns, cobwebs/skulls, two Skeleton
    Minions sleeping ON the critical path (the wake-up beat is the lesson),
    cracked-rock alcove for the Earth Wolf backtrack (gold chest, heart piece).
  - **E2 Deep Hall**: spike-trap gauntlet (rest → click + peek → up; rides the
    geyser hazard list so jumps clear it), the boulder puzzle (pushable rock →
    pressure plate → portcullis bars rise), two Skeleton Rogues + a minion.
  - **E3 Warden's Crypt**: Bone Warden mini-boss (axe + tower shield, chop with
    danger-arc telegraph, 360° spin when hugged, wheeze window after 3 swings) →
    Petra freed → **Earth Wolf** (tint 0x8b6b3d per casting sheet; Stone Stomp
    stuns grounded enemies + smashes cracked rocks). Marble horse statues,
    banners, Petra's crystal caged in a dark shell until the fight ends.
- **Skeletons**: KayKit Skeletons share Rig_Medium with the knight, so the whole
  existing animation library retargets directly; Rig_Medium_Special.glb adds the
  Skeletons_* clips (awaken/walk/idle). Gear (blade/axe/shield) mounts on the
  sanitized handslot bones like the knight's. Bone-clatter SFX from Kenney
  impact pack (`bones.ogg`).
- **Cavern mood**: per-room `lightScale` (0.42) + darker bg/fog color — torches
  carry the light. Dungeon-kit floors/walls replace the Kenney shell in `e*`
  rooms (same collider layout).
- **Music**: hidden-cavern → `region-stone` (E1/E2), dwarven-mine → `stone-deep`
  (E3). Victory sting reused on the warden.
- **Map**: two-region layout (Ember Hollow / Stoneroot Caverns); Stoneroot
  appears once the celebration has played. Perk-picker fan re-centered for 4
  forms.
- **Bug found by test**: the warden's death XP can level you up mid-celebration;
  the perk card pauses the loop, so a polled defeat check never ran. The
  celebration now fires from the warden's death hook (synchronous), not a poll.
- New narration lines (Pip/Grimm/Luna + new voice Petra 0.82/0.95) — additive,
  same style as the script; save schema adds `flags.cracked/plates/wardenDefeated`.
- SW cache v2.1.0, 165 precached files; badge v2.1. Offline verified into E2.

### Morning-check additions (S2)
- Map screen: the "You are here" card text can clip on narrow room names
  (Warden's Crypt) — worth a small font/width pass.
- Warden difficulty is untuned beyond paper numbers (hp 14, chop 1.5, Cozy
  halves it) — worth a real playthrough feel pass.
- E2 gate bars rise over ~1.6s; on very slow devices the collider removal
  lags the visual slightly (cosmetic only).
- Not built yet: FBXLoader for the Quaternius animated monsters
  (Bat/Slime/Dragon for region 3+), S3 Wild Woods.

## v2.1.1 — Den fast travel (overnight, third block)

Luna's moonstone now stands in the Den (gray waystone + floating moonlit orb,
near the tents). Walk up to it and a travel menu opens: Ember Hollow always,
Stoneroot Caverns once the celebration has played. Picking a destination plays
the moonstone chime and loads that region's entrance — no more walking the full
R1→R2→R3 chain to reach the caverns. New Pip line (`moonstone_intro`) teaches
it on first approach. Headless-verified (menu opens, both options, travel to
e1, zero errors). SW v2.1.1.

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

## v2.1.2 — Fixed joystick (user request, morning session)

The movement stick no longer floats to wherever the touch lands — it is
anchored bottom-left, always visible (dim at rest, bright while steering).
Touches within ~130px grab it, with the knob offset measured from the fixed
base center; touches elsewhere no longer steer. Resting a thumb on the stick
does NOT open the form picker any more (hold-to-transform still works
anywhere else on screen). Verified headless: parked position, drag steering,
knob reset on release, no drift from far touches, picker behavior. SW v2.1.2.

## v2.1.3 — Pausing hints, compact overlays, thrust combo (morning session)

- **Story hints now freeze the game** while they play (Narration.blocking read
  by the main loop). Contextual repeatable chatter never blocks. Tapping the
  caption bubble skips the line (queued lines follow, each skippable). No
  pause if both captions and voice are off. Note: on engines where TTS errors
  out instantly the pause is effectively skipped — captions-only mode gives
  the sustained pause.
- **Smaller overlays**: caption bar shrunk (15px, 62vw max, skip arrow);
  big-toast moved to the top of the screen and halved in size.
- **Thrust combo**: knight only — a second tap within 0.7s of a slash ending
  plays Melee_1H_Attack_Stab with +0.55 reach, ±32° arc (vs ±70°), 1.3×
  damage. Slash sweeps crowds, thrust pokes the one. Works with every owned
  weapon. New Pip line (learn_thrust) after the first kill.
- Enemy vetting contact sheet generated for the art review (scratchpad).

## v2.2 — Stoneroot finished: real monsters, revival, cavern pups

User rules now in force: no code-built creatures; finish the region with
in-hand assets. Terranigma named as the design touchstone — its core loop
(free a region → the world visibly heals) is now mechanical, not just narrated.

- **FBX unlock**: the Quaternius Animated Monsters pack (FBX-only, why it sat
  unused) converts cleanly with the FBX2glTF native binary (npm fbx2gltf ships
  it under bin/Linux — the .bin/ shim is broken, call the binary directly).
  All four monsters verified in-engine with animations. Slime + Bat shipped;
  Dragon reserved to replace the Shadowgrip boss; Skeleton redundant (KayKit).
- **New enemies**: Cave Slime (scale 0.26, hp 2, hops close + squelch attack,
  natural green) in E2; Cave Bat (scale 0.13, flying, roost → hover →
  fast-flap telegraph → dive, the bolt's prey) roosting at E1/E2 cobweb
  corners. Both use their own animation clips (Armature|Slime_*, BatArmature|Bat_*).
- **Terranigma revival**: `cavernMood` reads `wardenDefeated` — lightScale
  0.42 → 0.6, warmer fog, and glowing mushroom patches (Kenney nature kit,
  emissive clones + soft green lights) sprout across all three rooms.
- **Cavern pups**: pup4 (E2 dark nook — new darkZone, Dark Wolf's job),
  pup5 (past the spike gauntlet), pup6 (crypt corner). HUD shows /6 once
  Stoneroot is open; all six = a 7th heart + new Pip line (all_pups_stone).
  Den pup orbit re-laid in two rows so six pups fit the glade.
- Verified headless: slimes/bats spawn, bat wakes+dives, pups 4-6 collect,
  6/6 → 7 hearts, revival mood + mushrooms in E1/E3, zero errors. SW v2.2.0.

## v2.2.1 — Ember pass: no more code-built creatures anywhere

- **Shade** is now the Slime model tinted deep violet (ember eyes) — same
  chase behavior, slightly quicker than its cave cousin. The boss's phase-2
  summons use it too (gltf threaded through the Shadowgrip constructor).
- **Ember Moth** is now the Bat model in fire dress: dark body, ember-glow
  wings that burn brighter through the 0.8s dive telegraph (glowMats hook in
  the shared Bat logic). Starts hovering (never roosts) near the lava.
- **Shadowgrip** wears the Quaternius Dragon: shadow-violet tint, glowing
  purple eyes (the same exposed/guarded signal), Flying loop + Attack lash on
  every slam. All fight logic untouched — tendril severing, wave, phase-3
  darkness, dissolve. Cage tendrils slimmed into talons clutching the ember.
- Verified: full 3-phase fight to defeat with zero errors; Shade/Moth
  behaviors + narration triggers intact (class names preserved). SW v2.2.1.

## v2.2.2 — Boss cage readability (user feedback)

"Why does the dragon have a yellow ball and two black triangles?" — the ball
is Cinder (story-critical), the triangles were the old cage-tendril cylinders
reading as nonsense from top-down. Replaced with the Petra visual language: a
dark shadow-shell smothering Cinder's glow. Each severed tendril cracks it
(thinner, smaller, brighter light + a pop); phase 2 shatters it. Dissolve and
idle animation updated; full-fight verify unchanged.

## v2.2.6 — Fix batch + the Den grows (build-while-testing session)

- Map cards widened (106px, min-height) — "You are here" no longer clips.
- E2 gate collider now clears the instant the plate clicks (visual bars still
  rise after) — no more invisible-wall lag on slow devices.
- Den growth, Terranigma-style: once the Warden falls, glowing cavern
  mushrooms take root in the glade and a third tent stands. Pattern to extend
  per region freed.
- QUEUED NEXT (in order): economy/XP balance pass (shard income vs shop
  ladder, perk tiers past level 12), Maren tier-2 stock after Stoneroot,
  hard landscape lock, then S3 Wild Woods once the user downloads a
  Quaternius forest/monster pack in glTF format.

## v2.3 — Enemy variety pass (Terranigma rule: every foe has a signature)

- Shade: lurching stop-start skips (rest 0.8s, 2.8-speed burst 0.4s).
- Cave Slime: steady squelch, and SPLITS into two fast minis when smashed.
- Cave Bat: crash-lands winded after its dive (flying=false, sword window).
- Ember Moth: double-dive — swoops, wheels, swoops again; never lands.
- Bone Warden: tower-shield FRONT-BLOCK while advancing (clank, no damage);
  flank or parry-stun for full hits. New Pip hint (warden_block) on first
  blocked swing. Punish windows (tired/stunned/mid-swing) unchanged.
- Bosses now play completely differently: Shadowgrip = arena mechanics
  (slam dodges, wave cover, darkness); Warden = positional melee duel.

## v2.4 — Damage clarity (the Terranigma bar)

User's north star: "there was never any questioning whether you were doing
damage." Two answers, straight from that game's playbook:
- Floating damage numbers on every hit (gold; big at 2+; grey BLOCKED text on
  warden front-blocks and the dragon's guarded armor). DOM pool projected
  through the camera, ~1s life.
- Boss health bar (top-center) for the Shadowgrip and the Bone Warden
  (appears when the warden wakes). Progress is never a mystery.
Also this session: strike-window gold rings + chime (v2.3.2), dragon always
sword-targetable with clank/red-flash feedback + spark auto-aim/homing
(v2.3.1), per-enemy signature behaviors (v2.3), solid bodies + shield wall
(v2.2.7).

## v2.5 — Level-design expansion, part 1: the Ember Key loop

User verdict: "two basic rooms then a boss plays more as a partial demo."
Correct. Terranigma-grade dungeon structure begins here.

- **Key/lock system**: state.flags.keys (persisted), chest loot can carry
  { key, keyName }, giveLoot grants it with a toast + Pip line and unseals
  live via world.openBossDoor.
- **R2's boss door is now SEALED** by shadow-dark rocks with a pulsing gold
  keyhole (gold = go language). Pip: "Sealed by shadow! …east of here, past
  the broken bridges."
- **New room R2b — Cinder Bridges** (east of the Causeway): zigzag bridge
  crossings over twin lava channels under moth fire, geysers on the lanes,
  and a Shadow Hound guarding the golden key chest between pillars. Map
  updated. Region flow is now: R1 → R2 → (branch R2b, fight, key) → R3.

### EXPANSION PLAN — remaining (next blocks, in order)
1. R1b "Ash Warrens" — maze burrow east of R1: tight corridors, dark
   pockets, shade ambushes, secret burnable chest. One-way ledge back to R1.
2. E1b "Echo Chasm" — Dark-Wolf dark cavern branch off E1; bats, cracked
   secrets. E2b "The Mill" — two-boulder double-plate puzzle + spike maze +
   Stone Key for a crypt treasure vault.
3. Loops & secrets pass: one-way drops, shortcut doors that open backwards,
   2-3 hidden rooms behind burnables/crackables.
4. S8 endgame: final region + final boss (multi-phase, all forms required)
   once regions 3+ exist. Every region boss keeps a unique verb.

## v2.5.3 — THE boss-damage fix (real cause found)

User report "still can't damage the first boss" — reproduced with real
sword-swing simulation (earlier fight tests called takeDamage directly and
hid this). Cause: stuck tendrils needed TWO hits inside a 2.0s window, and
the hittable was recreated fresh each slam — one hit per window = zero
progress forever, phase 1 never ends, the dragon never opens. Fixes:
- TENDRIL_HP 2 → 1: one clean hit always rips a tendril free.
- Stuck window 2.0s → 2.8s.
- Pip re-teaches "when a tendril gets stuck, hit it!" every ~22s while
  phase 1 lingers (stuck-hint machinery).
Verified: one real tryAttack swing at the stuck tendril severs it.
Lesson recorded: boss verification must drive the PLAYER's attack path,
never the damage functions directly.

## v2.6 — Game-feel + HUD overhaul (user's structured spec)

All tuning in js/config.js (single CONFIG object). Changes:
- Floating joystick (left 40%, spawns under the thumb, hides on release,
  dashed idle hint ghost), 70px radius, 10% dead zone, magnitude clamped,
  never detaches. Reverses the earlier fixed-stick decision at user request.
- Movement: velocity ramp (100ms accel / 80ms decel), facing turn 14 rad/s.
- Attacks: soft lock-on (nearest enemy ≤4u in a 120° cone, facing snaps),
  150ms input buffer in the swing tail, +0.2u hitbox pad, and swings allow
  40% movement drift (specials still root). Facing holds during a swing so
  lock-on aim isn't steered away.
- Camera: CONFIG damping + 1.5u smoothed look-ahead into travel direction.
- Form button: #form-badge (58px) tap = cycle form, hold 300ms = radial
  picker. Hold-anywhere picker REMOVED (no more tap-spam conflicts). New
  dedicated ⚔️ attack button (80px) bottom-right; right-half taps still work.
- HUD: safe-area insets on all corners; persistent = hearts + form badge +
  special cooldown only; potions/shards/XP/pups fade in on change and fade
  out after ~3.5s (potions resurface when hurt below half). All ≥48px.
- Fixed two self-inflicted bugs pre-ship: camera double-lerp junk line and
  ctxShow(el.parentElement) which faded the whole <body>.
Verified headless: stick spawn/deadzone/ramp/release, lock-on snap+hit,
buffer refire, form tap-cycle + hold-picker, attack button, HUD fade,
zero console errors. SW v2.6.0.

## v3.0 — Ember Hollow 2.0: the Kiln dungeon + gates + mysteries (pillar pass A)

Per the user's four-pillar spec (Zelda/Terranigma/Pokémon/lived-in world),
pass A of the Ember rework. New reusable systems (SYSTEMS.md): gates.js
(boulder/water promises + braziers), worldstate.js (WS flags + mystery log).
- THE KILN: hub K1 (3 doors, campfire) + spoke KA (guard fight → fire
  shrine grants FIRE WOLF MID-DUNGEON [user-approved bible override] →
  brazier teach/timed-pair test/combat combine → one-way drop home) + spoke
  KB (numbered-brazier order puzzle, wrong = self-reset → KILN KEY → far-
  side shortcut ledge to R2). Door C = Kiln Key → R3 boss. R2's sealed door
  now leads to the dungeon; R3 entered from the hub.
- "NOT YET" gates: gold-veined mega-boulder (R2, Earth Wolf) and water
  channel (R2b, Tide Wolf) bracketing visible heart-piece chests; both log
  ??? mysteries on the map with a toast; Earth stomp resolves the boulder.
- Landmark: the Kiln volcano cone + ember tip glows on the northern skyline
  of R1/R2 (kilnLandmark helper; extend to remaining ember rooms in pass B).
- Music: kiln.mp3 (volcanic-crater) in the dungeon; ember-calm.ogg
  (peaceful-village) replaces region-ember everywhere once the boss falls.
- Verified end-to-end with REAL fire-slams: key→hub→shrine→teach→pair→
  combine→drop→door B→order (incl. wrong-order reset)→key→shortcut→door C→
  boss; mystery log + map ??? cards. Zero errors. SW v3.0.0.
- QUEUED pass B: settlement NPCs, 5 vignettes, mid-region restorations ×2,
  witnessed healing sequence, S-bend route rework, ambient critters,
  atmosphere crossfades, LEVEL-MAP SVG.

## v3.0.1 — playtest fix pass (buttons / lava / shrine re-check)
- STABLE BUTTON LAYOUT: the special button never appears/disappears again —
  it lives permanently in the bottom-right corner and is dimmed (30%
  opacity, grayscale, ignores taps) as the Knight. Attack sits beside it,
  form badge beside that; ranged/defend/jump hold a fixed upper row. Fixes
  "all the buttons are now mixed up, especially when you turn into the
  wolf" — the root cause was #special-btn toggling display:none/flex per
  form, which shoved the whole cluster around.
  Bug caught in review: hasSpecial omitted earth_wolf, which would have
  dimmed the Earth Wolf's stomp button. Fixed before ship.
- LAVA BOUNCE-BACK: touching lava now deals 1 heart AND hops Kael back to
  the last safe footing (tracked every frame on solid ground), zeroing
  momentum — the classic Zelda ouch-bounce. A deliberate JUMP over lava
  still works (airborne skips the check).
- SHRINE GRANT RE-VERIFIED: the KA fire shrine grants Fire Wolf on both a
  fresh profile and an old-save-shaped profile (dark-wolf-only unlocks +
  already-spoken story flags) — the grant keys off formsUnlocked, not
  spoken lines, so old saves cannot get stuck.
- Verified headless: button rects byte-identical across all four forms;
  special visible-always with correct per-form icon; lava hit = 5→4 hearts
  + hop + return to safe tile; old-save shrine grant. Zero page errors.
  SW bumped to v3.0.1.

## v3.1.0 — audit fix plan item 1: the juice pipeline (foundation)
- Full-project audit ran first (docs vs code vs player experience); user
  resolved the region-roster conflict: THE ADDENDUM IS CANON (Wild Woods/
  Frostpeak/Stormreach/Sunken Vale/Shadow Court). Doc-truth pass committed
  separately: COMBAT-SPEC rewritten, ASSETS casting corrected (real models
  law), BUILD-PROMPT + old LEVEL-MAP marked historical, HUD-MENU-SAVE
  schema v2, narration.js declared canonical, GAME-CONTRACT gained the
  "adopted law, code catching up" list, SYSTEMS.md is now the full index.
- NEW js/juice.js — the ONE hit-feedback pipeline (CONFIG.JUICE tiers):
  onHit(weight) drives hitstop + shake + pooled contact particles +
  haptics together; onHurt() for damage taken (gentle shake, red burst,
  60ms buzz); weightBoost is the surge's future global-promotion hook.
- Pooled particles: one preallocated 256-slot THREE.Points ring buffer,
  additive, parked at y=-99 when dead — combat allocates NOTHING.
- Haptics: navigator.vibrate (Android), silent when SFX muted, guarded.
- Audio: every SFX decodes right after the context unlocks (no first-hit
  decode hiccup); play() gained pitch `vary` (hits ±8%).
- Wired: melee connect = medium (kill = heavy), parry = heavy cold-spark,
  player hurt = onHurt. Old direct hitStop calls for these routed through.
- Verified headless: real-attack-path burst (10 parts, medium), cloud
  hides when spent, 720 spawns cap at 256 (pool proof), 19 buffers
  preloaded, hurt path clean, zero errors. SW v3.1.0.

## v3.2.0 — WORLD-DESIGN adopted; Session A + Region 1 to template
- design/WORLD-DESIGN.md committed: the region-building playbook (nine-beat
  template, lock-before-key as a machine-checked rule, routes, witnessed
  restoration + ripple/Den-growth/one-scar, kid rules, canon region chain
  reconciled to the STORY-BIBLE addendum). Process locked: ONE region per
  pass, user approval gates each.
- NEW js/regions.js: per-region data manifests (beats, gates with
  requires/hint/firstShownIn, restoration blocks, ripple/scar/Den hooks) +
  validateRegions() — errors fail verify scripts, boot logs loudly.
  Current: 0 errors; 2 honest warnings pointing at Session B work.
- WITNESSED RESTORATION (Ember): the moment the Shadowgrip falls, green
  sprouts rise around the arena while the player stands in it and Cinder's
  ember climbs to the north ridge (~9s, non-blocking). Persisted as
  WS ember.restored; on rebuild r1/r2/r3 keep the regrowth.
- COMPOUND HOOKS live: RIPPLE (two green shoots at Stoneroot's cave mouth
  + Pip line), DEN ARRIVAL (Cinder's ember settles by the campfire — first
  of seven spirits home), ONE SCAR (an ash patch by the Den stairs that
  never heals + Pip line). 5 new narration lines.
- Verified headless end-to-end through the production _defeat() path:
  restoration plays + persists + survives save round-trip; healed dressing
  in r1/r2; scar/den/ripple markers + lines all fire; zero errors.
  (Test gotcha logged: the +60xp celebration can level a fresh profile to
  a perk-pick pause — tests pre-level to 4. Playwright waitForFunction
  needs null arg before options.)
- SW v3.2.0 (precache regions.js). AWAITING user approval of Region 1
  before Session B (Stoneroot to template).

## v3.2.1 — lava ouch-leap (visible backwards jump)
- Touching lava: 1 heart + sizzle SFX + an ANIMATED backwards leap (0.32s
  arc, facing the lava the whole way) back to the last safe footing —
  replaces the v3.0.1 instant teleport, which read as a blink, not a jump.
  Input locked during the leap; i-frames unchanged; deliberate jumps still
  clear lava gaps. NOTE: r1/r2 pools cooled by the Ember Key are basalt by
  design (the mid-dungeon twist) — they never hurt; hot lava lives in
  r2b/kiln/r3 and pre-key rooms. Verified headless: damage 5→4, bounce
  state mid-flight, lands on safe ground facing the pool, zero errors.

## v3.3.0 — playtest fixes: entry flash, Dark Wolf intro, per-wolf ranged, solid lava, talk toggle
- RED FLASH BUG: the hurt-flicker keyed off i-frames, and room entry grants
  0.6s grace i-frames — so every door made Kael flash red like a hit. Now a
  separate hurtFlashT only set by REAL damage drives the flicker; grace
  windows (entry, respawn, parry) protect without flashing.
- DARK WOLF INTRO: Luna's gift now gets introduced ON the critical path —
  right after the first Shade falls, Pip teaches the wolf badge (new
  darkwolf_intro line) and the badge reveals. Before, the intro lived only
  in the optional dark nook, so kids could reach the Kiln shrine never
  knowing wolves existed ("you get both fire and dark for some reason").
- PER-FORM RANGED (FORM_DEFS.rangedKind): knight = spark dart · dark wolf
  = moon CRESCENT that pierces through up to 3 in a line (stops homing at
  the first pierced foe) · fire wolf = ember spit that BURSTS (small AoE
  splash) · earth wolf = slow lobbed ROCK, +0.5 dmg, dazes 0.9s. Bolts now
  substep on long frames so they can't tunnel through small enemies on a
  slow phone.
- LAVA IMPASSABLE: the bounce-back now fires on EVERY grounded touch, not
  only when i-frames are down — you can no longer walk across a pool
  during the 1s damage grace. Damage still ticks at most once per second;
  deliberate jumps still clear gaps.
- "🦊 PIP TALKS" master toggle at the top of the pause menu: one switch
  flips voice+captions together and instantly cuts the line playing right
  now (clears the queue too). Fine-grained captions/voice toggles remain.
- Verified headless: no flash on entry + flash on damage; darkwolf_intro
  after first real kill + badge reveal; crescent pierced two pinned shades
  in a probed clear lane; rock landed + 0.85s daze; lava double-touch =
  one damage, two bounces, ends on land; talk toggle silences + clears.
  SW v3.3.0.

## v3.3.1 — pause menu could trap you
- On short landscape phones the pause menu (now ~10 rows) overflowed the
  screen, and its CENTERED layout clipped "Keep Playing" off the TOP with
  no way to scroll to it — settings became a one-way door. Fixes:
  (1) menu is top-aligned + scrollable with safe-area padding, gap
  tightened; (2) a big ✕ close button pinned to the top-right corner that
  is ALWAYS visible regardless of scroll. Verified headless at 740×360:
  menu opens with Keep Playing + ✕ both on-screen, scrolls, ✕ closes even
  when scrolled to the bottom. SW v3.3.1.

## v3.3.2 — picker stuck open on phones, wolf identity readability
- FORM PICKER STUCK: on touch screens the pressed element implicitly
  captures the pointer, so the release event fired on the form badge —
  whose handler called stopPropagation, starving the picker's window
  pointerup that selects an option and closes the ring. Badge release no
  longer stops propagation (hand-wired, documented). Verified via a
  captured-release simulation: option picked, ring closes, form switches.
- WOLF RANGED WAS INVISIBLE-IN-PRACTICE: (a) the throw button only
  appeared after the moth lesson — now ANY wolf form reveals it; (b) each
  throw now SOUNDS distinct (crescent = deep whoosh + shimmer, ember =
  crackle, rock = heavy lob) and LOOKS distinct (wide flat crescent,
  1.35x stone chunk, pooled colour trails on all wolf projectiles).
- BITE SFX: wolves no longer swing with sword audio — new bite.ogg
  (Kenney RPG Audio chop, CC0, pack already credited) with per-form
  pitch: dark 0.9 / fire 1.0 / earth 0.72, ±8% variance.
- SW v3.3.2 (bite.ogg precached).

## v3.3.3 — jump button always visible
- The jump button was gated behind Pip's geyser lesson at one spot in R2 —
  never stood there, never got a jump button ("there is no jump"). Jump is
  a core verb (lava gaps, dodging ground attacks) so the button now shows
  from minute one; the geyser line still teaches the timing. Tap = jump,
  tap again mid-air = higher double jump (feather powerup = triple).
  Verified headless on a fresh save via the real button: visible, jump,
  double jump, clean landing. SW v3.3.3.
- LESSON (progressive reveal): three complaints in a row ("no ranged",
  "no jump") came from teach-gated buttons reading as missing features.
  Core verbs stay visible; only advanced/contextual controls may reveal.

## v3.4.0 — entrance respawn, always-on HUD, Ghost Wolf canonised
- RESPAWN RULE (user): dying now respawns you at the ENTRANCE of the room
  you fell in — never back through earlier rooms. Room rebuilds (enemies
  reset), keys/burns/chests persist, full hearts, rubber-band now keyed
  per-room. Checkpoints remain as save/travel points.
- HUD: the contextual fade is retired — shards/potions/level/pup counters
  stay visible the whole time (user rule; the fade read as options
  disappearing).
- GHOST WOLF (user-approved, canon): region 7's Moonlight gift is now THE
  GHOST WOLF — a white wolf that fades translucent; unaware enemies carry
  on normally until Kael attacks, breaks something, or bumps one (contact
  both ways). The Shadow Court's wings become sneak-or-stir levels on a
  new enemy-awareness system (Session G engine work). Written into
  STORY-BIBLE addendum, WORLD-DESIGN §5, regions.js manifest.
- Verified headless: die deep in R2 → respawn at R2 entrance, full
  hearts, same room; faded-class HUD counter renders at opacity 1;
  region validation still 0 errors. SW v3.4.0.

## v3.4.1 — first family playtest verdict: harder enemies
- Verdict recorded in GAME-CONTRACT (the playtest log is now live): son
  says enemies are too easy. Changes:
  - Every enemy +1 hp (CONFIG.DIFFICULTY.ENEMY_HP_BONUS) — shades now take
    3 sword hits, not 2. Slime minis stay 1 (cleanup chip).
  - Family speeds +15-20%, signatures kept: shade skip 3.3, hound stalk
    1.8 / charge 9.6, moth dive 7.2, slime 1.2 / minis 2.0.
  - Cozy softening 0.5 → 0.6 (CONFIG.DIFFICULTY.COZY_SOFTEN); ½-heart
    floor and Brave unchanged. Telegraph floors + max-3-aggro untouched.
- Verified headless: shade hp 3 / speed 3.3; a 2-damage hit costs 1 heart
  in Cozy (was ½). SW v3.4.1.

## v3.4.2 — bridge decks are solid ground, not lava
- The impassable-lava change exposed a latent engine gap: bridges were
  only VISUAL meshes sitting on top of lava rectangles, so hazardAt still
  said "lava" on the deck — and since v3.3 that meant damage + bounce on
  the Cinder Bridges' decks, making R2b (and the Ember Key) impossible.
- Engine: world.safeZones + world.addSafe(rect) — safe platform footprints
  that OVERRIDE hazards underneath; hazardAt checks them first. Registered
  for the R2 stone bridge, both R2b zigzag decks, and the R3 entry walkway.
- Verified headless: both r2b decks hazard-free with the pools beside them
  still hot; standing on a deck for 4s = full hearts, no bounce; r2 deck
  safe/pool hot via the real door. SW v3.4.2.

## v3.4.3 — 🌸 Gentle mode (per-profile easy)
- Daughter's verdict ("too hard" after the v3.4.1 bump) recorded in the
  GAME-CONTRACT playtest log. New 🌸 Gentle mode toggle in the pause menu,
  per profile, mutually exclusive with 🦁 Brave (both off = Cozy):
  - incoming damage softened to 40% (min ½ heart unchanged)
  - the enemy hp bonus is skipped (shades back to 2 hp)
  - enemies AND bosses run at 80% time — slower movement and longer
    telegraphs from one lever (CONFIG.DIFFICULTY.GENTLE_ENEMY_TIME)
- Difficulty is now truly per-kid: her profile Gentle, his Brave, default
  Cozy. Verified headless: toggles mutually exclude via the real
  checkboxes, gentle shade hp 2, 1-dmg hit costs ½ heart, setting
  persists in the profile save. SW v3.4.3.

## v3.5.0 — 🌸 Gentle guide: Pip runs ahead when a kid is lost
- On a Gentle profile, if there's NO PROGRESS for 20s (same room, no
  kills/chests/keys/pups/burns/cracks/unlocks — CONFIG GUIDE_IDLE_S),
  Pip cheers "This way, Kael!", sprints ahead to the room's next
  objective leaving a trail of glowing, slowly-fading paw dots, does a
  little "over HERE" spin, then trots back to Kael. Re-arms after a
  cooldown. In-world cue, zero UI markers (WORLD-DESIGN §4 rule).
- Destinations follow the same flags as the stuck-hints: den→stairs,
  r1→Causeway exit, r2→Bridges until the Ember Key then the Kiln,
  k1→door A/B/C by progress, ka→shrine, kb→brazier one, r3→boss (or the
  shortcut once freed), Stoneroot rooms→deeper. Trail dots parent into
  the current world so room changes sweep them naturally; dots are
  pooled (26, recycled).
- CONFIG now exposed on the __game debug hook for tuning/tests.
- Verified headless: idle Gentle player → guide run fires, Pip ends at
  the R1 exit with the trail still fading behind him, run completes back
  to follow mode, and Cozy/Brave profiles never trigger it. SW v3.5.0.

## v3.6.0 — SESSION B: Stoneroot to the full region template
- THRESHOLD (beat 2): a camp at the Cavern Gate mouth — OLD BRAM the
  prospector (mage model in earth-brown work clothes) by a woodfire with
  his crate. Rumour line on arrival ("something rattles down in the Deep
  Hall"); a NEW line once the region heals — the NPC who reappears
  changed. dkit gained the Woodfire piece (was on disk, never loaded).
- THE MILL WAKES (beat 6, the twist): rolling the millstone onto the
  Deep Hall plate now wakes the OLD MACHINERY region-wide (WS
  stone.mill): millstone wheels start turning in e1 AND e2, and the
  rusted grate in the Cavern Gate grinds open (gold chest behind it).
  The grate is a ??? mystery from the moment a kid walks past it.
- REGION 3'S LOCK, SHOWN EARLY: a thorny BRAMBLE tangle (new brambleGate
  type, dark-tinted bush cluster + green glint) chokes the Deep Hall's
  SE treasure corner — visible gold chest behind it, gate_promise line +
  ??? card. Only the Verdant Wolf will cut it. validateRegions: 0
  errors, 0 warnings — lock-before-key fully machine-verified.
- WITNESSED RESTORATION (beat 9): the Bone Warden falls → glow-moss
  BLOOMS live around the crypt (emissive mushroom clusters + soft green
  lights scaling in one by one) while Petra's heart flares. Persistent:
  e1/e2/e3 rebuild with glow-moss forever after.
- COMPOUND HOOKS: RIPPLE = a living vine through the crypt's NE wall
  (the Wild Woods calling; ??? wildwoods_way) · SCAR = one floor crack
  in the Deep Hall never closes · DEN ARRIVAL = Petra's stone-heart hums
  beside the moonstone (second spirit home). Campfire+potion now
  directly before the boss door (contract law). 9 new narration lines +
  the Bram voice.
- Verified headless end-to-end: camp + rumour, grate mystery + blocked,
  bramble blocked + promise, mill twist opens the grate on rebuild,
  warden death (production path) → live restoration + WS persist, vine +
  scar + healed dressing + Bram's healed line + Petra at the Den. Zero
  errors. SW v3.6.0. AWAITING user approval of Region 2.

## v3.7.0 — combat depth overhaul (dad's session-3 verdicts)
- BLOOD MOON NERF: 99-damage nuke → 2.5 MOON damage. Shadow-things are
  weak to moon so grunts still one-shot (3.75), but elites survive — a
  crowd-clearer, not a delete button.
- DRAGON RHYTHM: windows more frequent, each shorter. Tendril stick
  2.8→1.7s, gap between slams 1.5→0.9s (phase 3: 0.6s); phase 2 core now
  PULSES 1.7s open/1.2s guarded (was always-open); phase 3 bursts
  1.4/1.4 (was 2.2/2.0).
- ELEMENTS + ARMOR (anti-button-mash, law in GAME-CONTRACT): every strike
  carries its form's element (steel/spark/moon/fire/earth). Weaknesses:
  shadow-things fear MOON, slimes/bats/bones fear FIRE (1.5x + gold
  flare + bigger pop). ARMORED bone: steel 0.5x with a clank teach,
  magic 1.35x. Rogue now SIDESTEPS the first melee swing (predictable:
  'DODGE' text, then open 3.5s; bolts/AoE/stuns always land).
- DODGE ROLL: tap shield WHILE moving = 0.32s tumble in the stick
  direction with 0.4s i-frames (hold-while-still still blocks/parries).
  ATTACK_MOVE_MULT 0.4→0.75 — attacking barely slows you now.
- ENEMY LAVA RULE: grounded enemies can no longer walk across lava
  (same restriction as Kael); flyers cross freely. All movement routed
  through a hazard-aware step.
- FULL-ROOM DARKNESS: the Ash Warrens (r1b) and the Deep Hall (e2) are
  now dark wall-to-wall — the Dark Wolf is the way through. R1 keeps its
  small teaching nook so minute-one isn't a black screen.
- "TWO ROOMS AND A CLOSED GATE": that gate is the millstone puzzle
  (Stoneroot has 3 rooms; the crypt is behind it). Made discoverable:
  the boulder now wears the pulsing GOLD act-here ring (contract
  grammar) and the Gentle guide runs straight to it before the plate is
  solved. The mechanics verified sound.
- Verified headless: moon-weakness math (1/1.5), armored math (0.5
  steel / 2.0 fire-bolt), rogue first-swing dodge, roll travel+i-frames
  via synthetic input, grounded enemy refusing lava, warrens full-dark
  zone, blood moon fires. Zero errors. SW v3.7.0.

## v3.8.0 — the Shadowgrip reborn, fire breath, Stoneroot grows to 5 rooms
- BOSS BODY SWAP (user + canon): the off-style dragon is gone. The
  Shadowgrip is now a GIANT SHADOW WOLF — the same Quaternius wolf as
  Kael's forms at 3.5x their size (1.96), near-black with burning violet
  eyes. A dark echo of the first great wolf: the Grimm reveal, made flesh.
- THE POUNCE (phase 2 signature, fixed readable loop): rest (pulsing core
  windows) → crouch + flashing RED LANE (1.0s) → leap down the lane →
  crashes TIRED for 2.0s with the core FORCE-OPEN (the big window) → pads
  back. Deep snarl wind-up, crash shake, spark burst. Every beat
  telegraphed; the loop repeats on a steady 5s rhythm kids can learn.
- DRAMATIC DEFEAT: triple expanding shockwave rings (orange/violet/gold),
  a 12-point spark ring, heavy shake + freeze-frame, then the dissolve
  sheds SMOKE and embers every fraction of a second as the shadow lifts
  away and burns out. Cinder's light floods up through it.
- FIRE BREATH: the Fire Wolf's throw is now a roaring CONE OF FLAME —
  instant fan (3.4u, ±38°), fire damage to everything in it, rolling
  pooled flame bursts + crackle. Braziers still demand the slam (the
  region verb stays sacred).
- STONEROOT = 5 ROOMS, each a different test (Terranigma base, Pokémon
  puzzle, Zelda combat):
  e1 Cavern Gate (camp + intro combat) · e1b ECHO CHASM [NEW]: Pokémon
  fall-hole maze in full dark — 3 holes to 3 sealed pockets (ambush /
  treasure / cracked heart-piece secret), gold climb rings back up, jump
  clears holes · e2 Deep Hall (spike timing + millstone plate, full dark)
  · e2b THE MILL [NEW]: push TWO millstones through a spike-guarded gap
  onto twin plates while rogues ambush — both plates open the treasure
  vault (heart piece) · e3 Warden's Crypt (boss). Drop-hole/climb engine
  is generic (world.holes) for future regions.
- Verified headless: breath cone hits with fire element; wolf boss builds
  at 1.96 scale; full pounce cycle crouch→charge→tired(core exposed)→
  rest; dramatic defeat clean; e1→chasm door, hole drop + climb return;
  e2→Mill door, twin plates open the vault. Zero errors. SW v3.8.0.

## v3.8.1 — 🎮 the backdoor
- A faint 🎮 button at the bottom of the pause menu pops up a retro
  controller overlay (d-pad + △○□✕ face buttons, WOLF·STATION). Enter
  ↑ ↑ ↓ ↓ ○ □ □ ✕... no — ↑ ↑ ↓ ↓ ○ □ □ ○ — each correct press lights a
  gold lamp + rising chirp; a wrong press buzzes and resets. Full code =
  unlock chime → LEVEL SELECT: all 14 rooms, one tap warps straight
  there (production loadRoom). Verified headless: wrong-input reset,
  full code, 14 levels, warp to the Echo Chasm. Zero errors. SW v3.8.1.

## v3.8.2 — lava cools AFTER the boss, not before
- The coolable r1/r2 pools were turning to basalt on collecting the Ember
  Key — mid-dungeon, before the boss (the old "twist"). User rule: lava
  stays dangerous until the victory. Cooling now keys off bossDefeated
  and reads as part of the region's healing; Pip's lava_cooled line
  updated ("with the shadow gone…") and retriggered accordingly. The
  Kiln's brazier order puzzle remains Ember's mid-dungeon twist. Docs
  (LEVEL-DESIGN-2, regions manifest) updated. Verified headless: key
  held + boss alive → pools still burn; boss down → basalt + line.
  SW v3.8.2.

## v3.9.0 — the audio pass (the world finally makes sound)
- 10 new SFX vendored from packs we ALREADY OWN (Kenney RPG Audio +
  Impact Sounds, both credited): 3 stone + 3 grass footsteps, chest
  latch, coin jingle, gate creak, cloth whoosh.
- FOOTSTEPS: cadence follows real speed; grass in the Den, stone
  everywhere else; wolves patter (lighter, quicker, higher). Silent
  while airborne/rolling/locked.
- WIRED: chests = latch click THEN chime · shards = coin jingle (pitch
  varied) · dodge roll = real cloth whoosh · gates/vault/crypt bars =
  old iron GROANS as they rise · the millstone GRINDS as it rolls
  (distance-throttled) · level-up = synthesized C-E-G-C FANFARE.
- THE HOWL (synthesized — no CC0 howl exists in our packs): two detuned
  voices glide up, hold with vibrato, fall away through a low-pass.
  rate scales the wolf: Kael's Blood Moon howl (1.15), the boss answers
  the severs (0.75), deepest at phase 3 (0.6), and a long dying howl on
  defeat. Ready for the future Surge.
- Verified headless: all 10 files decode, synths run clean, footstep
  cycle advances under real movement. Zero errors. SW v3.9.0
  (all new files precached — offline still complete).

## v3.10.0 — the LIVING title screen + real 3D avatars + boss phase respawn
- NEW js/titlescene.js: the title is now a live 3D campfire diorama —
  the Dark and Fire Wolves and Pip resting at a flickering woodfire under
  a pale moon, drifting embers, slow camera sway. It drives its own
  render loop until a profile is chosen (the game loop isn't installed
  yet — that was the first bug: a black canvas), then hands the renderer
  back. The menu becomes a translucent veil over it; the tableau is
  framed LEFT so the centered menu never covers it. Gameplay HUD is
  hidden while titling (body.titling) — it was bleeding through the veil.
- REAL 3D AVATARS: six character portraits (Kael, Dark/Fire/Earth Wolf,
  Pip, a pup) rendered once at boot by a small offscreen renderer
  (auto-framed on each model's bounds, warm key + violet rim light) and
  used as profile pictures — in the picker, the profile list, and the
  detail card. Legacy emoji profiles still render fine.
- BOSS PHASE RESPAWN (contract law ✅): dying to the Shadowgrip no longer
  restarts the fight — flags.bossProgress records the reached phase (set
  in the production phase transitions, saved per profile, cleared on
  victory) and the rebuilt boss RESUMES there, severs pre-done, shell
  shattered.
- Verified headless: diorama live + own loop, all 6 portraits render into
  the picker, HUD hidden while titling and restored in-game, boot into a
  run works, die-in-phase-2 → rebuilt boss resumes at phase 2, defeat
  clears the flag. Screenshots reviewed. Zero errors. SW v3.10.0.

## v3.11.0 — FORM IDENTITY + the MOON GAUGE SURGE (audit items #2 + #3)
- FORMS ARE TOOLS NOW. The Dark Wolf is the fast fragile hunter: 6.7u/s
  (knight 4.6), 1.35x turn rate, +30% damage taken (applied BEFORE the
  kid-difficulty softening so Gentle still protects), a quicker bite
  chain that STEPS IN with every snap, and the LUNGE — tap attack while
  the stick is pushed for a ~2.5u dash-bite with 150ms dodge frames
  (1.1s cooldown). Wolf senses: hidden cubbies/cracked rock/unopened
  chests shimmer moonlight near the Dark Wolf. The SHIELD is Knight-only
  (wolves dodge, never hide) — the dodge roll still works in every form.
  Fire/Earth keep their familiar stats for now; FORM_DEFS carries the
  identity fields so the seven later wolves slot in as data.
- BLOOD MOON REBUILT: no longer a 24s cooldown button. A crescent MOON
  GAUGE fills from hits landed, hits taken and time in combat (pressure
  feeds the moon — the struggling kid reaches it sooner; pots don't
  count). Full = GOLD act-here pulse (contract color law; first draft
  pulsed red and was corrected in review). Tap it → a 2.5s ceremony:
  the world dims red, a blood moon RISES, time bends ~30%, Kael is
  forced into the Dark Wolf mid-howl (bass + 250ms haptic), and a
  no-damage shockwave staggers everything nearby. Then ~10 seconds of
  SURGE: 1.25x-scale wolf, red aura trail, every hit one juice tier
  heavier (the weightBoost hook finally earns its keep), x2 staggering
  bites, free lunges, ½-heart/s regen, the gauge draining as the timer,
  a 2s warning flicker, and an exhale back to whichever form you wore.
  'Quicker Moon' perk now boosts gauge fill; Moon Shard fills it whole.
  The gauge persists in the save (additive field — old saves load).
- ORDINARY SWITCHES got the Layer-C spectacle: 120ms self-hitstop,
  form-colored burst, adjacent enemies shoved (no damage), 4% camera
  punch, per-form audio stings, 400ms morph i-frames, badge flourish.
  Mid-attack switches QUEUE and land the instant the swing ends.
- LESSON: world.enemies contains POTS (Breakables) so swords can smash
  them — the first gauge build let a den pot trickle-charge the surge.
  Anything decorative in the enemies list now wears `scenery = true`,
  and the gauge/shockwave/switch-push all skip it.
- Verified headless (16 checks, real input paths): identity numbers,
  +30% hurt math under Brave, shield knight-only via held key, step-in
  vs lunge dash, switch queue, gauge fill from a real sword fight,
  perk boost math, tap-to-surge ceremony → morph → shockwave → surge
  (x2 dmg, weightBoost, deny switch, free lunge) → regen → exhale
  revert, save round-trip, Moon Shard, scenery pots. v3.8 boss/breath
  regression suite still green. Screenshots reviewed (740x360).
  Zero page errors. SW v3.11.0, badge v3.11.

## v3.12.0 — DEN LIFE: villagers, rumors, and a dog named Biscuit
- The Moonlit Den has FACES now (contract law #5 ✅). New js/npcs.js:
  villagers are DATA (model, spot, arrival condition) using the KayKit
  Adventurers models — they share the Knight's Rig_Medium skeleton, so
  the existing rig-library clips bind by bone name for free. Each one
  idles, breathes an occasional gesture (Idle_B / Interact), stands
  SOLID, and turns to greet Kael when he walks up.
- THE DEN GROWS with the healed world (Terranigma rule, home edition):
  · WREN the hooded wanderer (Rogue_Hooded) waits by the far tent from
    minute one — her repeatable rumour foreshadows the thorny Wild
    Woods, seeding region 3 before it exists.
  · ROOK the ranger (Ranger) arrives once Ember Hollow is freed — he
    watched the smoke stop from this hill.
  · OLD BRAM (Barbarian) climbs up from his cavern camp once Stoneroot
    sings — the same Bram voice the kids met at the e1 campfire.
  · BISCUIT the husky (Quaternius Husky, own Idle/Walk/Eating clips)
    trots her sniff-rounds between five spots, snacks sometimes, and
    turns to look when Kael comes close — dogs always know. Pip:
    "She guards the den. Well… mostly she guards her dinner."
- Narration: two new voices (Wren, Rook), intro lines once per save,
  gentle repeatable chat throttled 45s, all mirrored in
  NARRATION-SCRIPT.md; den arrival beats updated in regions.js
  (validateRegions still 0 errors / 0 warnings).
- Verified headless: precache list vs disk (194 files, all present),
  fresh den = Wren + Biscuit only, ember-restored save adds Rook,
  stone-restored save seats all three (plus Petra's heart + pup
  playtime), Biscuit provably wanders through the real update loop,
  Wren's intro fires from proximity and she turns to face Kael
  (facing delta 0.03 rad). Screenshot reviewed. Zero page errors.
  SW v3.12.0 (new models + npcs.js precached — offline complete).

## v3.13.0 — DEN GAMES: the villagers host a little fairground
- Asked-for feature ("could we make the den into some sort of mini game
  or series of mini games?"): every den villager now HOSTS one, each
  behind a pulsing GOLD ring (act-here law). Step into the ring to play;
  only one game runs at a time; all infinitely retryable — campfire
  games, not exams. New js/minigames.js, dials in CONFIG.DEN_GAMES.
  · 🎯 ROOK'S SHARP EYE (arrives with Rook once Ember heals): gold
    targets pop up around the den one at a time — hit the lot before
    his clock runs out. Bolt, bite, breath or blade all count, so
    every form (and every kid) has a way to play it.
  · 📦 WREN'S SHUFFLE: a coin drops into one of three crates, the
    crates dance their swaps, smash the right one. Wrong crate =
    "watch closer" and a fresh shuffle — no fail state, ever.
  · 🐾 PIP'S PAW PATH: four glowing paw-pads chime a pattern (each pad
    its own note — the sequence is a little song); step it back, one
    more paw per round. Three slips = "great try!" + consolation
    sparkle.
- REWARDS: shards — a real pocketful on a game's FIRST win, pocket
  change on repeats (kids can play forever without breaking the shop
  economy) — plus three new sticker-book stickers (Sharp Eye / Never
  Fooled / Paw Path Pro). Gentle profiles get longer clocks, slower
  swaps and shorter patterns from the same difficulty lever as the
  rest of the game. #mg-chip shows live score/round at top-center.
- ENGINEERING: game props (targets, crates) ride world.enemies with
  scenery=true so every real attack path can hit them while the moon
  gauge, shockwaves and the body-resolver all ignore them (the
  resolver now keys off the scenery flag, not class names). One sword
  swing can clip TWO crates — pick candidates collect for a frame and
  the crate NEAREST the player wins, so the kid's aim decides, never
  array order.
- Verified headless through real play: ring entry starts each game,
  real pad-stepping wins Paw Path (sticker + shard shower), a real
  sword swing smashes the coin crate, real melee pops Rook's targets
  and the enemies list comes out clean, busy-exclusion holds, chip
  shows during rounds, precache complete (195 files). Screenshot
  reviewed. Zero page errors. SW v3.13.0, badge v3.13.

## v3.13.1 — phone playtest fix pass (dad's session, four bugs)
- SURGE CRASH ("Cannot set property x of Enemy which has only a getter",
  player.js:687): enemies expose x/z as getters over root.position — the
  surge shockwave and the form-switch push assigned them directly. Both
  now write e.root.position. WHY TESTS MISSED IT: the surge and switch
  suites ran in the enemy-free den, so the push paths never touched a
  real Enemy. The regression suite now stages both beside LIVE Shades
  in r1.
- LAVA + PATH-TILE FLICKER: the light-brown Kenney path tiles (y 0.02)
  and lava sheets z-fight the floor on phones with 16-bit depth buffers
  (precision at 11u ≈ 0.018 — right at our offsets). Camera near plane
  0.1 → 1.5 (nothing ever comes closer than ~8u; precision improves
  ~15x) and path tiles raised to 0.035. Ordering (bridges OVER lava)
  untouched.
- BLANK AVATAR SQUARE = Kael's portrait, and he was also silently
  MISSING from the title campfire. Two stacked causes: (1) player.load()
  consumed the CACHED knight.glb scene and the form machine set it
  visible=false — every later SkeletonUtils.clone inherited the hidden
  flag (wolves never broke because the player clones those). The player
  now clones too — the shared cache is never mutated. (2) the v3.10
  "frame the tableau left" reframe left the knight's diorama spot ~44°
  off-axis with ~38° of half-view — off-frame even when visible. He now
  sits AT the fire, in frame. LESSON: pixel-check rendered artifacts;
  "the img element exists" proved nothing.
- CHEAT MENU UNREACHABLE: touch-action:none on .menu-btn ate every
  vertical drag that started on a button, and the pause menu is mostly
  buttons — nothing below the fold (the faint 🎮 included) could be
  scrolled to on a phone. Pause-menu items are now touch-action:pan-y
  and the menu container is a .ui element (the joystick can never grab
  drags through it). Verified: the full ↑↑↓↓○□□○ code still opens the
  level select.
- Verified headless: all 6 portraits pixel-checked (knight 34% opaque),
  switch-push shoves a real Shade, surge shockwave stuns beside live
  Shades with zero page errors, pause rows report pan-y, cheat pad +
  code + level grid work end-to-end. Title screenshot reviewed — the
  whole cast is finally at the fire. SW v3.13.1.

## v3.13.2 — the haunted cheat pad (ghost taps)
- Dad's phone: entering ↑↑↓↓ the code kept RESETTING mid-sequence.
  Chromium touch emulation entered all 8 cleanly, so this is a device
  quirk: some phones deliver pointerdown TWICE for one physical touch.
  With a double-press code, one ghost on the first ↓ silently advances
  the counter — the kid's real second ↓ then compares against 'circle'
  and wipes everything. Looked possessed, was just a duplicate event.
- Fixes: (1) GHOST-TAP GUARD — a same-key press within 90ms of the
  last is dropped (a human double-press measures 150ms+; ghosts arrive
  within ~30ms). Verified both ways with real touch injection: a
  10ms duplicate counts once, a deliberate 170ms ↑↑ counts twice.
  (2) preventDefault on pad presses suppresses compat mouse events.
  (3) a wrong key now RESTARTS from a stray ↑ instead of always
  clearing, and the code lights BLINK RED on a reset — a reset must
  never look like a glitch. (4) the pad overlays get touch-action:none
  + user-select:none so no zoom/select can interrupt a code entry.
- Verified with real touchscreen input end-to-end: ghost mid-code,
  full unlock, fast doubles, wrong-key restart + red blink. SW v3.13.2.

## v3.14.0 — combat readability: attack tokens, body telegraphs, SUPER!
- Playtest: "entering r2 feels like getting swarmed and it's just button
  mashing — we want skill: learn enemy patterns, experiment with attack
  types." r2 actually fields FIVE foes (2 shades camped ON the doorway,
  2 moths, the branch hound) and nothing stopped them all converging.
- ATTACK TOKENS (CONFIG.ENGAGE): every frame the closest few enemies
  get to press the attack; everyone else PROWLS a ~3u ring around Kael —
  sideways drift, eyes locked on, visibly waiting their turn (classic
  brawler engagement management). The cap is a difficulty lever: Gentle
  duels ONE at a time, Cozy two, Brave three — the same per-kid profiles
  as everything else. Attacks in motion always finish (a charge never
  fizzles mid-lane); boss choreography is exempt. Wired through Shades,
  Slimes, Bats, Moths, Hounds and Skeleton Minions; Rogues already
  circle by design, the Warden duels solo.
- r2's doorway shades moved deep into the room and apart — the room now
  introduces its residents one pattern at a time (verified: zero enemies
  within 4u of the entrance).
- HOUND TELEGRAPH REBUILT (playtest: "enemy wolves cast a dark shadow
  rectangular shape before they attack — get rid of it"): the charge-lane
  floor decal is DELETED. The ~1s telegraph now lives entirely on the
  wolf's body — it sinks into a deep crouch, its red eyes FLARE (up to
  ~4x glow through the charge), its paws scrape up dust, and it lets out
  a low growl. Same timing, honest read, no ugly rectangle. New contract
  law: telegraphs live ON THE BODY; lane decals are boss-only.
- EXPERIMENTATION MADE LOUD: a weakness hit now shouts "SUPER!" in gold
  above the damage number (on top of the existing flare), and Pip
  teaches it once: "every creature fears something — try all your
  forms!" (element_teach, fires on the first weakness hit anywhere).
- Verified headless: doorway clear, token caps hold per difficulty
  (2 free attackers Cozy / 1 Gentle with 3 waiting), a waiting shade
  provably prowls without closing in, the hound runs crouch→charge with
  no streak mesh and 2.6x eye glow, a real moon bite on a Shade fires
  SUPER! + the teach line. Boss + dungeon regression suite green.
  SW v3.14.0, badge v3.14.

## v3.14.1 — the code was never the code
- MYSTERY SOLVED on the "glitched" cheat pad: dad's fingers were entering
  ↑↑↓↓←→○□□○ (with the d-pad ← →), but the pad shipped with the shorter
  ↑↑↓↓○□□○ from the original request — so his ← was scored as a WRONG
  key and wiped the lights every single time. Not a bug, a password
  mismatch (the ghost-tap guard from v3.13.2 was still worth having).
- The code is now his 10-press version: ↑ ↑ ↓ ↓ ← → ○ □ □ ○.
  The lights row sizes itself from the code, so it shows ten.
- Verified with real touch: ten lights, the OLD 8-key code no longer
  unlocks (dies at the 5th press, red blink), the full 10-key code opens
  the level grid, and a level button warps to the Kiln Hub. SW v3.14.1.

## v3.15.0 — playtest round: the collapse, the shieldling, the whirlwind
- BOSS RESIZED 1.96 → 1.62 (~2.9x the player wolves — "a little smaller
  but still intimidating") and its vulnerability is now UNMISSABLE: when
  the pounce ends the wolf visibly FALLS OVER (the Death clip plays and
  holds — best-practice "whole body is the tell"), a big GOLD ring
  pulses beneath it, the crash lands with a thud + dust + a breath of
  slow-motion (which also stretches the window for small hands), the
  window grew 2.0→2.6s, and Pip shouts "It FELL! Now, Kael!". Severing
  a tendril in phase 1 now makes the giant FLINCH. It hauls itself back
  up through the same animation in reverse fade.
- SURGE SIZE: the blood-moon wolf no longer grows (SURGE_SCALE 1.0) —
  same size as the Fire Wolf, exactly as asked; the red aura, trail and
  vignette carry the drama.
- THE CRESCENT HUNTS: the Dark Wolf's moon crescent now re-acquires the
  nearest fresh target after every pierce — it genuinely homes from foe
  to foe (up to its 3-pierce limit).
- SHADES HIT-AND-RUN: the moment a shade strikes home it darts BACK out
  of reach (still facing Kael), watches, then comes again — intercept it
  on the way in or chase it down. First of the "attack and retreat"
  behaviors.
- NEW ENEMY — SKELETON SHIELDLING (Stoneroot: Cavern Gate + Deep Hall):
  a slow wall of bone behind a tower shield. Every frontal hit CLANKS
  off with BLOCKED — damage is NULL until it commits to its slow chop
  (shield down for the whole wind-up + recovery), until you slip BEHIND
  it (it turns at only 2 rad/s — circling works for real), or until you
  stun it (parry/rock/stomp). Pip teaches all three on first approach.
  Built from the vendored Minion + tower shield + blade — no new assets.
- KNIGHT WHIRLWIND (dad asked mid-build "do you have a spin?"): YES —
  KayKit's Melee_2H_Attack_Spin was already in our vendored rig library,
  no downloads needed. It's now the Knight's special (his button was the
  only dimmed one): a full-circle sword sweep (360° arc, 1.2x damage,
  6s cooldown, spark ring + whoosh) — the answer to being surrounded.
- Verified headless end-to-end: whirlwind hits a shade BEHIND Kael,
  shade retreats after touching, crescent pierces A then curves into B,
  surging wolf measures 0.56 = fire wolf, shieldling blocks frontal /
  takes flank + stunned damage + Pip line, boss at 1.62 collapses with
  ring+slowmo+exposure and gets back up. Zero page errors. SW v3.15.0.

## v3.16.0 — THE WOLF UNCHAINED (boss rework) + ten new asset packs staged
- Playtest verdict, deserved: "still too big. all he does is rotate to
  look at the player. doesn't move at all." True — in phase 1 the wolf
  was a statue that faced you while abstract tendrils did the fighting.
  Worse, underneath: the boss HITBOX and gold strike ring were anchored
  to the ARENA CENTER — during the collapse the ring said "hit the
  wolf" while damage only landed on the empty middle of the room.
- THE REWORK: the wolf is a LIVING HUNTER in every phase, driven by one
  state machine (prowl → stalk → windup → attack → recover):
  · It PROWLS a circle around Kael constantly (Walk anim, radius ~4u,
    flips direction unpredictably) — never a statue, never idle.
  · PHASE 1: it stalks in and SWIPES — 0.9s on-body telegraph (deep
    crouch, eyes flare, growl — the hound language writ large), then a
    big frontal paw arc (jumpable), then 1.6s of EXPOSED recovery.
    The cage's tendril slams continue underneath: sever 3 to crack the
    shell exactly as before. Aggressive kids also chip the boss early
    by punishing swipes — both play styles progress the fight.
  · PHASE 2: it hunts faster between POUNCES and the COLLAPSE window
    (unchanged read: falls over, gold ring, thud, slow-mo) — and gets
    up where it fell and keeps hunting. No more teleport-home rest.
  · PHASE 3: it circles in its own darkness, eyes glowing (the only
    visible thing for the Knight — the Dark Wolf sees all), then a
    HUGE eye flare → a dash through where you stood → exposed recover.
  · The HITBOX + strike ring + collapse ring all RIDE THE WOLF now.
    New law in the contract: a boss is a creature, never a turret.
  · Smaller again: 1.62 → 1.3 (~2.3x the player wolves) and its paws
    are ON THE GROUND (it used to hover slightly, a dragon leftover).
- Found + fixed while verifying: the exposure law read the STALE action
  from the top of the frame, so every punish window opened one frame
  late (and the in-page frame sampler caught it). Windows now open the
  same frame their action begins.
- NEW ASSET PACKS staged in asset-raw (gitignored, vendored per need):
  RPG Tools Bits, Character Animations 1.1 (adds MovementAdvanced /
  CombatRanged / Tools / Simulation rigs), Skeletons, Halloween Bits
  (crypt dressing for e3), Forest Nature Pack (the Wild Woods region),
  Resource Bits, Block Bits, Fantasy Weapons Bits, Medieval Hexagon
  (2-part zip joined — world-map material), Kenney Digital Audio.
  Mage Animations turned out to be a Godot-only .res — unusable here.
- Verified headless (in-page frame sampling): the wolf provably TRAVELS
  while prowling, full swipe cycle with flare/crouch/exposed-ring-on-
  body, sword damage lands ON the wolf wherever it is, severing intact,
  collapse ring+hitbox on the fallen wolf + Pip line, it resumes the
  hunt where it fell, phase-3 dash covers real distance behind a 5.5x
  eye flare. Screenshot reviewed: paws on the ground, in Kael's face.
  Zero page errors. SW v3.16.0, badge v3.16.

## v3.16.1 — the spin was fine; the UPDATE ritual wasn't
- "Spinning attack doesn't work, no animation, no anything" — reproduced
  with real touch on the CURRENT build: it fires perfectly (animation,
  sparks, cooldown ring). The phone was running an older cached version
  where the knight's special button existed but was dead. Root cause is
  the PWA update dance: a new version installs on launch but the page
  keeps running the old code until the NEXT full restart.
- FIXED THE DISEASE: the page now listens for the new service worker
  taking control and — only while still on the TITLE screen, never
  mid-game, never on a first install — reloads itself once. The first
  launch after any deploy now self-updates before play begins. The
  "close it fully and reopen" ritual is dead.
- And the whirlwind is now UNMISSABLE anyway: a steel-blue shockwave
  ring sweeps out to the spin's full reach + camera punch on top of the
  animation, sparks and dual swing sounds. Screenshot reviewed — you
  cannot miss it. SW v3.16.1.

## v3.17.0 — ASSET MULTIPLICATION (dad's standing rule made law + code)
- The rule, now in GAME-CONTRACT + ASSETS.md: use the old tricks
  relentlessly — every model is MANY monsters (recolor, resize, restat,
  re-element), every weapon prop is a STYLE. Prefer a variant over a new
  model whenever the silhouette still reads.
- ENEMY VARIANTS (VARIANTS registry in enemies.js; spawn markers opt in
  with `variant: 'name'`; per-instance tint/scale/hp/speed/element with
  a shared-material guard so skeleton recolors never leak into the
  loader cache):
  · CINDER SHADE (Kiln hub + shrine): kiln-baked, 1.3x, hp 4.5 — and it
    RESISTS FIRE. The Fire Wolf's home-turf advantage vanishes and the
    grey "RESIST" callout (the new counterpart to SUPER!) says why:
    0.4x + fizzle sound. Switch to moon and it melts. Experimentation
    taught by the world, both directions.
  · ELDER HOUND (the r2b branch): the pack leader — 1.3x, hp 6, harder
    charge, burning gold eyes, always drops its ember.
  · BONE BRUTE (the Mill): 1.4x darkened minion, hp 5, lumbers slowly,
    hits 1.5 — a walking wall guarding the twin-plate vault.
- WEAPON STYLES (items.js fields flow through attackConfig into every
  swing, thrust AND the whirlwind):
  · arc — swing width: the Long Spear is now a true ±36° POKE (was the
    same wide sweep as a sword).
  · stun — the Boulder Hammer leaves targets DIZZY 0.6s (and a hammer
    whirlwind is a 360° daze — worth every shard of its 300 price).
  · element — the Ember Blade strikes as FIRE, the Moon Sword as MOON:
    the KNIGHT can now hit elemental weaknesses if he buys the right
    blade. A shop with real decisions instead of a stat ladder.
- Verified headless through real combat: cinder shade takes 0.5 from
  fire / 1.5 from moon at 1.3x scale, elder hound + brute spawn with
  their stats in their rooms, a real hammer swing leaves a shade
  stunned, the Moon Sword scores SUPER! for the knight, the spear's
  arc math is exact. Zero page errors. SW v3.17.0, badge v3.17.

## v3.18.0 — The wolf duel + the buried-plate hunt (2026-08-02)

Dad's six-complaint playtest round, all root-caused:

- **Boss rewritten as a pure wolf duel** (boss.js, ~40% smaller): tendrils,
  slam telegraphs, shadow wave, phases and room-darkness all DELETED. The
  Shadowgrip now fights exactly like the little hounds — prowl, crouch-and-
  charge (dodge it; ends in a 2.6s gold-ring collapse), snarl-and-swipe
  (shield/parry it; a perfect parry staggers the boss). 20 hp, 3-per-hit
  cap, 1.5-heart hits, half-health howl enrage. Wounds persist across
  deaths via flags.bossHp (old "phase 2/3" saves resume at 60%).
- **Blood Moon**: the risen moon now DIVES and CRASHES into the nearest
  enemy at ceremony end (2 moon dmg, 2.4u blast, 1.4s stun; aim resolves
  at dive time). The whole feature is Dark-Wolf-only now: button, nags,
  trigger (dad: "the button is there no matter what form you're in").
- **Whirlwind root cause**: `Melee_2H_Attack_Spin` is 2.4s with 0.6s of
  dead wind-up — our 0.75s lock cut it before the body ever turned, so the
  spin NEVER visibly played. Swapped to `Melee_2H_Attack_Spinning` (0.67s
  true 360°), bone-verified rotating >85° mid-lock.
- **Boulders**: continuous free-rolling replaced with cardinal STEP-SLIDE —
  lean a beat, boulder rolls one clean 1.2u step (dominant axis), stops
  when blocked, SNAPS dead-center onto a plate and locks. Sokoban clarity.
- **"There is no pressure plate" — three stacked causes**: (1) the plate
  decals sat BELOW the stone floor tiles' top surface (y≈0.17) — invisible
  since Stoneroot shipped (HEIGHT LAW added; boulder ring + e2 scar raised
  too); (2) the plate sat in the south-wall camera BLIND STRIP (~2u of
  floor the tall wall hides — BLIND-STRIP LAW; plate/checkpoints/chests/
  potions moved north); (3) the room was fully dark (dark zone now covers
  only the north half). Plate rebuilt as a round stone plinth + gold disc
  + pulsing gold act-here ring (the dungeon-kit trap grid read as DANGER).
- **Room redesign, one puzzle per level**: e1's fake machinery grate +
  code-built millstone discs deleted (they were dad's "plates on the
  wall"), alcove open; the region-wide "mill wakes" fiction removed
  everywhere; e1b Echo Chasm drop-hole teleports deleted (NO-TELEPORT
  LAW) — now the Hidden Hollow, a simple pitch-dark cave; e2b Mill is now
  the Old Quarry, a combat room whose vault opens when the ambush is
  cleared (flags.e2bCleared; old twin-plate saves honored).
- **Voice recording**: design/VOICE-RECORDING-SCRIPT.md generated from
  narration.js (87 lines, grouped by character, file-per-line naming) —
  dad is recording custom audio; wiring will prefer assets/voice/<id>.
- Verified: 13-check headless suite (spin bone rotation, dark-wolf-only
  gating, crash damage, boss loop/persistence/parry, boulder step + plate
  snap + gate, room redesigns) + eyeball screenshots incl. a real-input
  walk to the plate. SW cache wolfknight-v3.18.0.

## v3.18.1 — Photo-playtest fixes (2026-08-02)

- **Post-boss lava cools EVERYWHERE** (dad's photo: Cinder Bridges still
  glowing): r2b's channels, the Kiln hub strips and the boss arena moat
  are now `coolable` like r1's pools — once the Shadowgrip falls, every
  Ember pool sleeps as walkable black basalt.
- **"The chest is unobtainable" (Old Quarry vault)**: root cause — all
  FIVE quarry skeletons spawn asleep, lying flat and nearly invisible in
  the dim room; one un-found sleeper stalled the clear-check forever with
  no feedback. Now the whole ambush RISES AT ONCE the moment Kael steps
  onto the quarry floor (bones rattle), and a HUD chip counts down
  "🦴 N left — clear the quarry!" until the vault opens. Chip clears on
  room change. The vault chest also sat visually sunk into the NE corner
  wall blocks — moved to (6.8, -5.0).
- **Whirlwind sped up significantly**: clip timeScale 1.7x (SPIN_TIMESCALE,
  player.js), lock 0.75→0.5s, hit at 0.22s — a whip-fast blur.
- Verified: 6-check headless run (three rooms' lava zones empty post-boss,
  mass wake + counter + vault open + chest position, spin 1.7x bone-verified
  rotating inside the 0.5s lock). SW cache wolfknight-v3.18.1.

## v3.18.2 — The Bone Warden, giant-sized (2026-08-02)

- Dad's call: "make the second boss bigger like the wolf boss was." The
  Warden grows 0.68 → 1.1 scale (2.2x his minions — the same ratio the
  Shadowgrip holds over the little wolves), radius 0.52 → 0.8, with
  boss-sized reach: attack trigger 3.0u, chop range 2.9, spin sweep 2.6,
  danger ring outer radius 1.35 → 2.0.
- Same buried-decal family as the plate: his red telegraph rings sat at
  y 0.05 — UNDER the crypt's stone floor tiles, invisible since Stoneroot
  shipped. Raised to y 0.19 (height law).
- hp base unchanged (14 + pre-existing level scaling).
- Verified headless (scale/radius/reach/ring height + chop telegraph
  firing) + crypt screenshot. SW cache wolfknight-v3.18.2.

## v3.18.3 — The secret menu skips LEVELS, not rooms (2026-08-02)

- Dad: the cheat menu "skips to rooms instead of the beginning of a level,
  and doesn't unlock the previous wolves needed to continue." The old menu
  was a 14-entry developer room list that granted nothing. It is now three
  LEVEL entries — Moonlit Den, Level 1 (Ember Hollow, r1), Level 2
  (Stoneroot Caverns, e1) — and each jump grants the whole journey up to
  that point: Level 2 unlocks the Fire Wolf and marks Ember complete
  (bossDefeated, shortcut, both keys) — never the Earth Wolf, which is
  earned INSIDE Level 2. The checkpoint follows the jump so Continue and
  respawns use the level start, and the jump persists immediately.
- Verified headless: 3 entries; Level 1 grants nothing extra and doesn't
  spoil Ember; Level 2 lands on e1's spawn with fire wolf + completion
  flags. SW cache wolfknight-v3.18.3.

## v3.19.0 — THE WILD WOODS (region 3) + the Verdant Wolf (2026-08-02)

Dad's go-word: "more rooms, slightly more difficult puzzles, lantern
lighting for one door and boulder pressure points for the second —
building on the skills previously learned."

- **Seven rooms** (Stoneroot had five): w1 Thorn Gate → w2 Gloomwood →
  w3 Rootbound Door → w4 Bramble Heart → w5 Sylva's Glade, with two
  optional branches (w1b Mossy Dell, w2b Hollow Oak). Entry: a living
  vine doorway in the Warden's Crypt that opens once Stoneroot sings.
- **Forest tech**: 14 KayKit Forest Nature models vendored (260 KB);
  buildForestShell — mossy ground, instanced tree borders with door gaps,
  LOW bushes/rocks on the south edge (blind-strip law), grass tufts,
  drifting wisp-motes; thornGate (bushes that tear away = the woods'
  rising bars).
- **PUZZLE DOOR 1 (w2 Gloomwood)**: three cold wisp-lanterns in a
  twilight-dark room — Fire Wolf slams light them; the third is walled
  behind CRACKED ROCK (Earth stomp first). Skills from regions 1+2
  braided, exactly as briefed. Persisted via WS wild.lanterns.
- **PUZZLE DOOR 2 (w3 Rootbound Door)**: TWIN boulders onto TWIN plates
  through a two-gap hedge — line each boulder up with its gap, push it
  through, then the final turn onto the plate. The Stoneroot skill with
  real routing. Wrong-gap mistakes reset on re-entry (anti-soft-lock).
- **Enemy family by the asset-multiplication law** (no new models):
  Thorn Hound / Elder Thorn Hound (wolf, mossy green, fire-weak),
  Bramble Blob (slime), Wisp Moth (bat) — ALL fear fire: the region's
  element lesson. Spawners now take hound packs + variants on every type.
- **Sylva, Thornbound (w5)**: the boss class is now a parameterized
  giant-wolf-duel SKIN system — Sylva is the Shadowgrip grammar in
  green: 24 hp, 8% quicker, same charge→collapse / swipe→parry reads
  (bosses fight like their family). Her wounds persist (flags.sylvaHp).
  Freed → the VERDANT WOLF is earned.
- **The Verdant Wolf**: 5th form (green tint, leaf aura, 5.4 speed);
  special = VINE-LASH (7s cd): a forward corridor of damage that CUTS
  bramble tangles — pays out the e2 bramble promise from region 2, and
  a tangle in the glade itself feeds the grant30s law. Thrown thorn
  bolt ROOTS its target (1.2s).
- Wiring: region flag, music (causeway loop for now — custom woods track
  on the polish list), travel stone + cheat Level 3 (grants fire+earth +
  both completions), pups 7–9 (9/9 = 8th heart), 18 narration lines +
  Sylva's voice, regions.js manifest validates clean, saves additive
  (sylvaHp/sylvaDefeated; WS wild.* rides flags.world).
- Verified: 11-check headless suite (region validation, level-3 skip,
  vine door, both puzzle doors through real crack/ignite/step-slide
  systems, gauntlet, Sylva duel + grant, vine-lash cuts in w5 AND e2)
  + four screenshots. SW cache wolfknight-v3.19.0, badge v3.19,
  VOICE-RECORDING-SCRIPT regenerated (104 lines).

## v3.19.1 — The shield-bearers actually hold their shields (2026-08-02)

- Dad: "the skeletons and the bone warden don't have a shield holding up
  animation." Two separate gaps, both real:
  (1) the **Bone Warden had NO block clip at all** — he front-blocked
  every hit while strolling with the tower shield at his hip;
  (2) the **Shieldling only posed within 2.4u**, but its guard rule was
  true for the whole chase — so it walked in normally while hits clanked
  off it. The pose and the damage rule disagreed.
- Root problem: the rig's `Melee_Blocking` clip poses the WHOLE body, so
  playing it outright would freeze the legs mid-advance. Fix: a **guard
  LAYER** — `upperBodyClip()` strips the clip to spine/chest/head/arms and
  `_setupGuard()` plays it as a second action at weight 8 against the walk
  clip's 1 (~89% guard on the arms, legs 100% walk). `_guard(up, dt)` eases
  it in/out in ~0.1s, driven every frame by the enemy's own `shieldUp`
  getter — which the Warden's `takeDamage` now reads too, so the pose and
  the hitbox can never drift apart again.
- Result: both shield-bearers advance with the shield braced and visibly
  DROP it for every swing, every stun and every recovery — the three
  taught openings now read on the body, not just in the damage numbers.
- Verified: 6-check headless suite (guard raised while walking, dropped
  mid-swing, dropped when stunned, both enemies, front-block/back-hurt
  rule intact) + crypt screenshots. SW cache wolfknight-v3.19.1.

## v3.20.0 — Retrofitting the earlier regions with the new laws (2026-08-07)

Dad asked whether the previous sections had been brought up to date with
everything learned in v3.18/v3.19. They had not. Built a data-driven audit
that walks all 21 rooms and checks the laws mechanically, then fixed what
it found — evidence first, no guessing.

**The audit** (`audit-rooms.mjs`): per room, measures the true floor top,
lists every ground decal, and flags decals below the floor, interactives in
the south camera blind strip, and puzzle pieces inside dark zones. A second
pass (`verify-blind.mjs`) converts the blind-strip heuristic into a
MEASUREMENT — rebuilding the real camera transform and raycasting at each
item. A third (`try-moves.mjs`) proves every proposed new position is free
of colliders, not a hazard, and genuinely visible before anything moved.

**Fixed:**
- **Buried decals 31 → 0.** Root cause generalised: `world.deckY` now
  carries each room's measured floor top and every decal offsets from it.
  Biggest catch: `stoneDoorway`'s glowing threshold sat at y 0.1 under
  Stoneroot's 0.185 floor — **every doorway's "way out" cue was invisible
  in all five Stoneroot rooms** since the region shipped. Same fix stops
  the Wild Woods' plates and boulder rings hovering above the grass, which
  the v3.18.1 stone-specific constants had caused.
- **Blind strip:** 7 measured-hidden items moved and re-proved — the Kiln
  Key chest (progression-critical), the e3 pre-boss checkpoint AND potion
  (contract law: rest before a boss), r2's potion + pup, r2b's potion, and
  Wren + Bram in the den, who both stood behind the south wall.
- **Dark puzzle:** the Gloomwood's three cold lanterns are the region's main
  door but sat unlit in a dark room — the same failure mode as the buried
  plate. Unlit braziers now wear a pulsing gold act-here ring that vanishes
  the moment they catch, so lit and unlit never read alike.
- The Bone Warden's telegraph rings are deckY-aware too.

**Deliberately not moved** (measured, reported, left alone): r1's cubby
burnable and two pups sit in a congested south strip where every candidate
position was inside geometry or still occluded — moving them means
redesigning a room the kids know. r1b's secret burnable and e1b's cracked
rock are hidden ON PURPOSE (wolf-senses reveal them). e1's camp and e2's
bramble gate "occlude" only themselves — a false positive of the method.

Verified: audit re-run clean on buried decals across all 21 rooms, no page
errors, plus screenshots of the doorway glow, a forest plate resting flush
on grass, and a cold lantern's ring readable in the dark. SW cache
wolfknight-v3.20.0, badge v3.20.

## v3.21.0 — FROSTPEAK (region 4) + the Frost Wolf + the first flying boss (2026-08-07)

Dad: "do frostpeak next."

### The design call: Boreal FLIES

Before designing the boss I read what the model can actually do.
`Dragon.glb` ships five clips — `Dragon_Flying`, `_Attack`, `_Attack2`,
`_Hit`, `_Death`. **There is no walk cycle at all.** A third giant-wolf
duel would have meant a dragon sliding around the floor in a flying pose,
which breaks THE POSE NEVER LIES. So Frostpeak's guardian is the first
boss that stays airborne — and that finally makes a law from region 1 pay
out: bolts do full damage to flyers, half to everything on the ground.
Kids who never bothered throwing suddenly need to.

The fight: she wheels overhead, picks a lane (0.9 s on-body rear-up plus a
RED ground lane), dives once, then **crashes** for a 2.6 s grounded window
under the gold act-here ring — where she counts as a ground target and a
sword does its worst. Below half health she chains two dives before
landing. 22 hp, 1.5-heart hits, wounds remembered across deaths
(`flags.borealHp`).

### The two puzzle doors (each builds on a learned verb)

- **f2 The Icebound Hall** — three braziers sealed in ice shells. The Fire
  Wolf's *breath* melts a shell; the Fire *slam* lights the bowl. Two
  verbs of one wolf, chained, and the game proves the chain by refusing a
  slam on an iced brazier. Anything melted and left unlit seals over again
  after 26 s (45 s in gentle mode). Deliberately a BRIGHT room: a timer
  plus darkness is cruelty, not difficulty.
- **f3 The Frozen Lake** — Stoneroot's boulders on slick ice. A push no
  longer takes one polite 1.2 u step; the stone **skids** at 5.5 u/s until
  a wall, a rock or a plate stops it. Each boulder must be bumped sideways
  into a stopper rock — which parks it at exactly x = ∓3.0, dead in front
  of a gap — then sent north up that lane onto its plate. A low snow ridge
  closes every other route, which is what makes the lanes readable at a
  glance. **Kael himself never slides**: a kid must never lose control of
  their own wolf.

### The Frost Wolf arrives LAST — on purpose

Boreal grants it at the summit, so every ice block down the mountain
(f1b, f4, the eyrie itself) is a return trip rather than a wall — and the
ice-sealed spring planted back in w1b a whole region earlier finally
opens. New verb: a frost-breath cone that shatters ice and FREEZES foes;
a frozen foe's next hit does **double** and prints `SHATTER!`.

### What the measurements changed

- **A flying boss must stay in frame.** A wheel around the *arena* centre
  at height 2.6 / radius 4.2 sailed off the top corner of a phone screen —
  the screenshot showed a shadow and a cropped wing. Fixed by projecting
  her world position to NDC every frame at 740×360 from four player
  positions: she now circles **Kael** (centre eases at 1.1/s, biased 0.9 u
  north of him, radius 2.5, height 1.9) and her dive is bounded to ±6.6.
  Result: 130/130 samples on screen, |x| ≤ 0.26, |y| ≤ 0.95.
- **A crash window needs clear ground.** She landed on top of a standing
  stone and buried her own gold punish ring. The eyrie's cover moved to
  the rim.
- **Shared-atlas packs need renamed materials.** Every piece in the Kenney
  Holiday Kit names its material `colormap`, and `assets.js` caches
  prepared materials *by name* — so recolouring the snow rocks did
  nothing at all, silently, until the clone was renamed first. The rocks
  were dirt-brown on snow and the snow ridge rendered as a wall of coal.
- **The warm light rig made the snow pink.** Rooms can now publish
  `world.lightTint`; Frostpeak asks for a pale-blue bounce and a
  white-blue sun. Nothing else in the game changes.

### Verified headlessly (all through real input paths)

Region manifest validation · Level-4 cheat skip grants the whole journey ·
w5's treeline opens north · both puzzle doors solved by calling
`tryRanged`/`trySpecial` and by leaning on boulders · the skid measured
(4.03 u travelled, stops at x = −2.97 against a lane at −3.0) · Kael's
drift on ice = 0 · Boreal flies, dives, crashes and becomes a ground
target · bolt damage 1.0 vs 0.5 · the grant-payout ice shatters · the
region-3 spring backtrack pays out · BRITTLE doubles damage and spends the
freeze · **a save with no `boreal*` keys loads as a fresh mountain.**
Room-law audit over all seven rooms: 0 buried decals, 0 blind-strip items,
0 dark puzzles.

### Also

Pups 10–12 (HUD/menu totals and the 9th heart at twelve), fast travel and
the cheat menu both gain Frostpeak, `design/VOICE-RECORDING-SCRIPT.md` is
now **generated from `js/narration.js`** rather than hand-kept (125 lines,
10 voices — the hand-kept version had drifted to 104).

## v3.21.1 — Paying the blind-strip debt, with a ruler that works (2026-08-07)

Dad: "leave the flags, lets get back to the game."

The outstanding debt from v3.20 was six interactives in **room one** sitting
in the strip of floor the camera can never see over the south wall —
including both pups and the tutorial burnable that Pip points at in minute
one. A teaching moment the camera hides teaches nothing.

### First: the audit tool was lying

Before fixing anything I re-read the tool and found it derived each room's
south edge from *the largest flat mesh* — which is the ground plane, and
every shell builds that as `(w + 8, d + 8)`. So for ground-plane rooms
(Wild Woods, Frostpeak) the blind-strip test used an edge **4 units too
generous**. The Frostpeak "0 blind-strip items" result reported one commit
earlier was measured with a broken ruler.

The edge now comes from the southernmost box collider — interior walls are
all north of it by construction. Re-run honestly: **16 blind-strip items**,
three of them mine in Frostpeak (`cp_f2`, its potion, `cp_f3`).

### Then: fix all sixteen

- **r1** — pup1 moved into the north half of the dark nook (still hidden by
  darkness, which the Dark Wolf solves; no longer hidden by the camera,
  which nothing solves). The burnable cubby was rebuilt ~1.6u north with its
  mouth re-cut, taking the burnable, pup3 and the reward chest with it.
- **r1b** — the secret nook now has a real east wall and sits 2u north.
- **r2 / ka / e1** — hound spawn, the combat brazier, and Old Bram's whole
  camp (fire, crate, Bram) pulled north.
- **e2** — the bramble alcove was the SE *corner*, which put a promise meant
  to be remembered for a whole region, and its visible reward, where they
  could never be seen. It is now built from two short walls further north,
  with the pre-boss rest moved west out of its way.
- **f2 / f3** — my own two checkpoints.

Result: **0 blind-strip items across all 28 rooms**, measured properly. The
6 remaining "dark puzzles" are all deliberate (the Gloomwood lanterns wear
gold waiting rings; the Warrens and the Echo Chasm are dark by design).

### Moving walls needs a different kind of proof

Nudging a coordinate is safe; moving a wall can orphan a chest or seal a
door. So reachability is now flood-filled from the spawn point through the
real `resolveCircle` solver, asking whether Kael can physically walk to
every interactive and every door — and for gated things, twice: sealed
before, reachable after opening it through its own system.

It found two things a screenshot never would:

- **The Ash Warrens' "secret" was not a secret.** The comment said the
  burnable clump "walls off the treasure nook". Geometrically it never did —
  the whole south band was open from the west, so the clump was decoration
  and the chest was free. The lower run now spans wall-to-gap and the clump
  is genuinely the only way through. Comments are not colliders.
- **A Frozen Lake chest was inside a boulder** — centre 0.72u into a rock of
  radius 0.95, placed by me last commit, invisible in a screenshot, and
  impossible to open. The rock moved.

It also cried wolf three times before it earned its keep: a 1.25u tolerance
fails props whose own collider is wider than that (a bramble tangle is
~1.15u across), and it flagged `ka` as soft-locked when that room's bars are
*supposed* to be shut until each guard pack is cleared. Both were fixed in
the tool, not papered over in the game — and the legacy `verify-region1`
script was given the retry loop the newer suites already had.

Re-verified after all of it: the Frostpeak suite, the Wild Woods suite, the
28-room audit, and a direct r3 health check (boss spawns, doors right, no
page errors) all clean.

## v3.21.2 — 6.6 MB the phones were downloading twice (2026-08-07)

Dad: "fix the duplicate music files."

Scanned every asset by content hash rather than trusting the two pairs I had
already spotted, and found **five** duplicate groups, not two:

| files | size |
|---|---|
| `den.ogg` = `ember-calm.ogg` | 3.4 MB each |
| `causeway.mp3` = `kiln.mp3` | 3.3 MB each |
| `puff.ogg` = `whoosh.ogg` | 13 KB |
| `hit.ogg` = `bite.ogg` | 9 KB |
| the Kenney survival atlas, in two folders | 7 KB |

**6.6 MB — about 11% of the whole download** — was the same two music tracks
and two sound effects shipped under two names each. Nobody noticed because
both copies worked perfectly.

### The fix is aliasing, not deleting

The game's vocabulary is worth keeping: rooms ask for `kiln` and
`ember-calm`, and those names carry meaning even when the audio behind them
is shared today. So the second name now points at the first file in
`MUSIC_FILES` / `SFX_FILES`, and the duplicate is gone from disk. `_buffer`
already caches by URL, so this is one fetch and one decode with no other
change.

Two things had to move with it:

- **`sw.js` PRECACHE.** `cache.addAll` rejects *entirely* if any single URL
  404s, so deleting an asset without removing its precache line would have
  silently killed offline play — the exact failure a kid on a train would
  hit and nobody would reproduce. Verified by installing the real service
  worker headlessly: 231 files cached, zero failed requests.
- **The "already playing" test.** It compared the track NAME, so with two
  names for one file, walking from the Den into the healed Hollow would fade
  a track out and fade the identical track back in. It now compares the
  resolved URL — the music simply continues — while still recording the
  requested name so `then:` chaining is unaffected.

The Kenney atlas pair stays: a glTF resolves `"uri":"Textures/colormap.png"`
relative to its own folder, so two model folders genuinely need a copy each.
Checked in the binaries rather than assumed. 7 KB, and the alternative is
rewriting GLB files.

### Made unrepeatable

`tools/check-duplicates.mjs` hashes every asset and fails on any avoidable
duplicate, with the unavoidable one listed and reasoned. Proved it works by
planting a copied file (caught, exit 1) and removing it again (clean) —
a checker nobody has watched fail is not yet a checker.

### Noted, not fixed

`hit` and `bite` now share a file, as do `puff` and `whoosh` — which means a
sword landing and a wolf biting make the *identical* sound, and so do a dust
puff and a whoosh. That is a design smell rather than a bug, and the Kenney
RPG Audio pack already on disk has plenty of alternatives. Left alone
because it changes how the game sounds, which is dad's call, not mine.

## v3.21.3 — A bite that isn't a sword (2026-08-07)

Dad: "yes change it."

Deduping the audio in v3.21.2 exposed that a sword landing and a wolf's jaws
made the *identical* sound, as did a dust puff and an air-whoosh. Fixed —
but the interesting part is why `bite` couldn't simply be swapped.

### `bite` was doing two jobs

Reading the call sites before touching anything: `bite` plays at **rate
0.42–0.6** in the boss, the hounds and the Fire Wolf's breath — those are
**growls**, made by pitching the chop right down — and at **rate 0.72–1.2**
for actual jaws. One name, two events. Giving `bite` a real bite sound would
have wrecked every growl in the game.

So the growls moved to their own name. `growl` still points at the chop file,
because that IS how this game has always made a growl and no pack on disk has
an animal sound — but that alias is honest in a way the old one wasn't: the
**pitch ranges never overlap** (growl tops out at 0.6, hit starts at 0.75),
so they cannot sound alike. Six call sites moved.

### Chosen by measurement, not by filename

Decoded every candidate and compared duration, loudness, brightness
(zero-crossing rate) and where the energy sits:

| cue | file | secs | rms | brightness |
|---|---|---|---|---|
| hit (unchanged) | Kenney `chop` | 0.26 | 0.116 | **3.5** |
| **bite (new)** | Kenney `impactSoft_medium_001` | 0.20 | 0.171 | **0.1** |
| puff (unchanged) | Kenney `cloth3` | 0.50 | 0.034 | 0.9 |
| **whoosh (new)** | Kenney `cloth1` | 0.68 | 0.065 | 1.9 |

The bite is the darkest and most front-loaded thing in the packs — half its
energy inside the first 7 ms, brightness 0.1 against the chop's 3.5. That is
a snap, not a blade. The whoosh is longer, louder and brighter than the dust
puff, so a dragon's dive moves real air while `puff` stays small.

Both come from Kenney packs whose licences are already in `assets/LICENSES/`,
so this adds no new licence gap — checked before choosing.

### The test had a blind spot, and said so

The first version of the pitch-overlap check only read *literal* rates and
therefore missed the per-form bite table, where the Earth Wolf chomps at a
heavier 0.72. Widened to parse the table too — 0.72 still clears the growl
ceiling of 0.6, so the separation holds. A check that quietly skips the one
case you'd get wrong is worse than no check.

Verified: no 404s, all five cues decode, both pairs measurably different, the
pitch ranges provably disjoint, and the service worker still precaches
cleanly (233 files, offline intact).

## v3.21.4 — Making the update actually arrive (2026-08-07)

Dad: "how do I get the update working."

Checked the deploy first: GitHub Pages built and published `2b3ac1a` (v3.21.3)
successfully. The build was live; it was the installed app that would not go
looking for it. Three separate reasons, all in `index.html`.

**1. The update-checker was reading from the HTTP cache.** `register()` was
called with default options, so `updateViaCache` was `'imports'` — meaning
`sw.js` *itself* is subject to normal HTTP caching. GitHub Pages serves it
with `max-age=600`, so for ten minutes after a deploy the browser compares the
new build against a cached copy of the very file it is trying to update and
concludes nothing changed. Now registered with `updateViaCache: 'none'`.

**2. Nothing ever asked.** Browsers check for a new worker on *navigation*. An
installed PWA resumed from the background performs no navigation, so if the
kids never fully close the app, no check ever happens and it can sit on an old
build indefinitely. Now it calls `reg.update()` explicitly on load, and again
whenever the app returns to the foreground (throttled to once a minute).

**3. A mid-game update was swallowed for the whole session.** The
`controllerchange` handler set its `reloaded` flag *before* checking whether a
game was in progress. `controllerchange` fires once, so an update landing
mid-play marked itself handled and never reloaded — leaving the kid running
old JavaScript against new files until they closed the app. The flag is now
set only when a reload actually happens, and a deferred reload retries when
they return to the title, when the app regains focus, and on a 5s tick.

### Proved it, rather than reasoned about it

`scratchpad/verify-update.mjs` installs the app, then rewrites `sw.js` on disk
exactly as a deploy would, and watches what the running page does:

- an update found on the title screen installs and takes over ✓
- the old cache is deleted, so no stale file can be served ✓
- an update landing **mid-game does not yank the floor out** — play continues ✓
- and the deferred reload lands the moment play stops ✓

One red on the first run was my own fixed 3-second wait: `activate` (which
prunes old caches) only runs after `install` has fetched all 233 precache
entries, which under SwiftShader takes longer than that. Changed to poll for
the condition — the same lesson this project keeps relearning: wait on state,
never on the clock.

### The catch

This fix can only help from the *next* update onward — getting v3.21.4 itself
onto the phone still depends on the old path. Manual steps went to dad, with
the warning that Android's "Clear storage" wipes localStorage and would delete
the kids' save files; "Clear cache" is the safe one, and usually unnecessary.

## v3.22.0 — Level 1 rebuilt: greybox, guardrails, and 2cm thumbs (2026-08-07)

Dad's brief: *"LEVEL-MAP.md now contains an approved larger, non-linear design
for Level 1. Build it. Level 1 only."* Six steps, in his order.

### Step 1 — the metrics, locked
`design/METRICS.md` and the **Metrics Zoo** (🎮 → 📏), a walkable scene showing
a 1u tile, Kael's 0.64u body, the 2.4u door / 3.0u choke / 2.0u corridor /
0.64u absolute-minimum gaps side by side, the 32×26 island footprint with the
camera's real 16.1u view drawn inside it, the 2.5u blind strip, and all five
hero-prop silhouettes judged from directly above.

### Step 2 — greybox, before a single art asset
`js/proto.js` — a checkerboard where **one square is exactly one world unit**,
hairline every square, bright line every four. Deliberately not flat colour: a
flat surface gives the eye no scale reference, so a room greyboxed in flat grey
looks the same size at any dimension.

`js/level1.js` describes all 14 spaces **once, as data**, and renders them
either as greybox or dressed. One description, two costumes — the greybox that
gets walked and approved is provably the same layout that ships.

`tools/verify-level1.mjs` walks the door graph **read out of the built world**,
not out of the spec table that generated it, and asserts: the spine
la→lg1→lb→lg2→lc→lg3→ld→lg4→le is traversable *both ways*, all five optional
pockets loop back onto their island, no dead ends, no door to a room that does
not exist, the four-step teach is laid out in order, and no interactive sits in
the blind strip. Clean in both costumes.

### Step 3 — performance guardrails, with the answer BEFORE dressing
Dad: *"If the level cannot hit the draw call budget, tell me before dressing
it, not after."* So it was measured first. The shipping rooms turned out to be
**far over budget already**: r1 173 calls, r2 155, e1 265, w1 112, r3 105,
against a ceiling of 100.

Breaking the frame down (`tools/probe-drawcalls.mjs`):

| | |
|---|---|
| flat overhead in EVERY room | **40 calls** — 23 the player rig, ~18 Pip + effects |
| so a room's own budget is | **60 calls** |
| shadow pass | doubles every caster |

Merging loose static meshes alone took r1 173 → 135: not enough. Folding the
InstancedMesh groups in as well took it to 108, and dropping shadow-casting on
clutter under 1.4u took it to **99**. That is the whole difference between
"Level 1 can be dressed" and "it cannot", so it became `js/batch.js` rather
than a one-off. `flattenStatic()` runs at the end of a room build and protects
skinned characters, anything on a gameplay list, transparent objects, sprites,
hidden meshes, and anything a builder marked with the new `world.keepLoose()`.

### Step 4 — dressed, GREEN packs only
Kenney Nature Kit 2.1, Kenney Castle Kit 2.0 and the Quaternius LowPoly Modular
Dungeon — all three carry a verified CC0 licence file in
`assets/LICENSES/MANIFEST.json`. Nothing came from an UNKNOWN pack. One kit
becomes five districts by material-name recolouring (asset-multiplication law).

Three things the first dressed pass got wrong, all caught by looking at it:
- **interior walls were still greybox slabs** in a dressed room — exactly the
  drift greyboxing exists to prevent. Now `wallRun()` dispatches like the shell.
- **floor and wall tints were within ~15 % luminance** and the Kiln read as one
  flat brown field. Wall tints are now about half their floor's value.
- **the camera saw the void past a 1.9u wall** — a third of the screen. Rooms
  now build three tiles of ground *outside* the wall (same InstancedMesh, same
  one draw call).

**THE GREAT CHAIN → THE BROKEN SPAN.** Cinder Bridges' hero prop was written as
a colossal chain. No chain model exists in any GREEN pack, and NO FAKE FICTION
forbids naming a thing the game does not show, so it is a collapsed stone
bridge built from real `bridge-stone.glb` sections. `LEVEL-MAP.md` updated.

**Result: worst room 88 of 100 draw calls, 41k of 500,000 triangles.** Under
budget dressed, with the guardrail doing the work.

### Step 5 — 2cm thumbs
`tools/verify-touch.mjs` pins "2cm" to a stated device instead of guessing:
a 6.4" 1080×2340 Android at DPR 3 gives a 780×360 CSS landscape viewport over
14.75cm, so **1 CSS px = 0.0189cm and 2cm = 105.8 CSS px**.

Every control failed. Attack was 1.44cm, jump 1.06, form badge 1.10, pause
0.91, inventory 0.87. All are now **108px = 2.04cm**, and the level badge and
XP bar moved out of the left thumb zone. The honest cost is in METRICS.md: with
every control revealed the HUD takes about half the screen, and the potion row
alone is 6.4cm of a 14.75cm phone. Recommendation flagged, not taken: collapse
it to one potion button with a count badge.

### Not done, deliberately
- **r1/r2/r3 are untouched.** They are what the kids are playing; a greybox is
  not something you ship to a child, and the new Level 1 lives beside them
  behind the cheat menu until dad walks it and says go.
- **`flattenStatic` was not applied to the shipping rooms.** It would take r1
  from 173 to 99, but that is a rendering change to a live game and belongs in
  its own pass with its own playtest.
- **Enemies still come from the two UNKNOWN-licence Quaternius packs** (wolf,
  fox, monsters). They are the same models already shipping in every room, so
  this adds no new exposure — but Level 1 cannot be enemy-free, and the rule
  says stop and ask, so it is flagged here rather than silently accepted.

## v3.23.0 — Level 2 rebuilt: a hub that changes (2026-08-07)

Dad's brief: build the approved hub-and-spoke Level 2, Level 2 only. Seven
steps, in his order.

### Step 1 — metrics INHERITED, not derived
Body radius 0.32u, grid snap 1.0u, door 2.4u, corridor minimums, camera
framing: all read from the Level 1 lock and used unchanged. Level 2 adds
exactly **one** new module — the **36 × 28 hub** — because the Great Vault is
crossed six times and needs to hold five doorways with 18u between the two
that share the north wall. Same grid, same even-integer rule, same door
widths: a new *size*, not a new *system*. It is drawn concentric with the
32 × 26 island in the metrics zoo, because the only honest way to judge how
much bigger a module feels is to walk the border between them.

### The shared kit — js/levelkit.js
Level 1 owned private copies of the shell, the door, the wall run and the
scatter. Two copies of "greybox and dressed must agree" is a guarantee they
eventually will not, so the vocabulary moved into one module both levels
import. Level 1's verifier was re-run after the extraction and reports the
identical per-room draw calls it did before — the refactor is behaviourally
invisible, which is the only acceptable outcome for a level the kids have
already played.

### Step 3 — the WorldState system (built before the geometry that needs it)
`defineRestoration(region, milestones)` declares a region's milestones in
order; `WS.stage(region)` counts how many are done from the front of the list;
`WS.complete()` records one and returns true only the first time. The vault's
three are `spark → drained → handDown`.

Every piece of hub geometry, lighting and door layout is a **function of
`WS.stage('vault')`**. Nothing is toggled by what happened earlier in the
session, which is what makes "quit after the water drains, come back tomorrow"
correct by construction rather than by remembering to handle it. The state
lives under `state.flags.world`, which the save file already round-trips, so
an old profile reads stage 0 and the additive-forever law holds.

**The save now fails loudly.** Every localStorage write in save.js used to end
`catch (e) {}`. Fine for a read — a corrupt profile should start fresh. It is
indefensible for a write: quota exceeded or private browsing, and a child
plays a whole evening and loses it while the game says nothing. Writes now
report through the error overlay, and `persist()` reads the value back before
believing the write succeeded.

### Step 5 — dressed from GREEN packs, zero new download
Kenney Nature 2.1, Kenney Castle 2.0, Quaternius LowPoly Modular Dungeon,
KayKit Adventurers — all four already vendored for Level 1 or the shipping
Stoneroot rooms, all four with a verified CC0 licence file in
`assets/LICENSES/MANIFEST.json`. **Level 2 adds no bytes to the download.**
Five districts come out of the same geometry by material-name recolouring.

The Stone Titan is KayKit's barbarian at 3.4×, granite grey, slumped — a real
pack model, not code geometry, because a titan is a *being*
(no-code-built-creatures law).

### Design deviation, flagged
**The Rattle is on Spoke B's critical path, not in an optional pocket.** The
bubble diagram draws it dotted. Two rules collided: "the four-step teach is
laid out in order" and "the critical path is completable without any optional
content" cannot both hold if the twist sits in a pocket — a child could reach
the Warden having been taught three quarters of an ability, never finding out
that the stomp is a *sound*. It is also now the spoke's terminus: ringing the
chamber cracks the dam, and the dam draining is hub change 2. One room, one
idea, one consequence. Spoke B keeps an optional pocket (The Chalk Seam) so
the branch count is unchanged. `LEVEL-MAP.md` records the deviation.

### Step 4/7 — the numbers Level 2 actually landed on

| | greybox | dressed |
|---|---|---|
| worst draw calls | 102 (vc1) | 112 (vc1) · 106 (vc2) |
| worst triangles | 40,286 | 49,633 |
| 20x hub entry | geom +0, tex +0, programs +0 | — |

**The hub memory test passed cleanly**, which was the specific risk dad named:
a hub is revisited constantly, so a leak there compounds across a session. It
was +40 geometries over 40 builds before the fix and is 0 now. The cause was an
ENGINE bug, not a Level 2 one — `World.dispose()` called `InstancedMesh.dispose()`
and returned, but that method frees the instance matrix and colour buffers and
NOTHING ELSE. Invisible for kit props (their geometry is SHARED and must not be
freed) and one leaked geometry per room for anything that builds its own, which
the breadcrumb trails do. Level 1 had the same bug with enough headroom to hide it.

**vc1 and vc2 are still over the 100-call ceiling and that is not hidden here.**
Measured breakdown of vc1's original 106:

    persistent 40  +  room geometry 23  +  three characters 43

A `SkeletonShield` is ~16 calls on its own — body, shield and blade, each
redrawn for the shadow map. Cutting a third enemy from the room saved **zero**
calls, which killed the "trim enemies" theory. The real lever is shadow-casting
on skinned characters, and that is a whole-game visual trade-off rather than a
Level 2 decision, so it is flagged rather than taken.

### Three wrong turns on the draw-call budget, kept here because the rule matters

1. Merge by material — defeated by `scatter()` giving every prop a *continuous*
   random tint, so every rock got its own material and nothing could merge.
2. Fix the tints — **worse** (115 → 120). Merged meshes had `frustumCulled = false`,
   so making more things mergeable meant more geometry that always draws.
3. Merge per spatial cell — **much worse** (→ 164). It shattered the
   InstancedMeshes: a 120-block perimeter wall that cost ONE draw came back as
   nine, one per cell.

**The rule that fell out: instancing and merging solve the same problem, and
expanding an InstancedMesh to re-merge it can only lose.** `flattenStatic` now
leaves them alone and merges only loose meshes, per cell, with a minimum bucket
of three. That took the dressed hub from 131 to 82.

## v3.24.0 — Level 3 rebuilt: the ring (2026-08-07)

21 spaces: 4 districts x 2 + 4 pockets + 4 ring legs + shrine + puzzle + glade
+ 2 chords. The docs say 18; their own component list adds to 21.

**One new module**, the 26 x 20 RING LEG, in the metrics zoo before use. A ring
leg is deliberately not a 14 x 10 chokepoint: a choke reads as compression, and
a ring needs its legs to read as TRAVEL, or the outward journey never feels long
enough for the way back to be a relief.

    ✓ the ring is walkable clockwise and RETURNS TO ITS START  (15 hops, t1a → t1a)
    ✓ the ring is also walkable anticlockwise
    ✓ every branch reconnects · no dead ends · every space reachable
    ✓ the four-step teach is met in order round the ring  (positions 5, 6, 9, 12)
    ✓ the twist is ON the ring, not in an optional pocket
    ✓ before they are earned, neither chord exists at the near end
    ✓ worst draw calls: greybox 80, dressed 83 · worst triangles 36,764

Level 3 is the cheapest of the three despite being the largest — it inherited
every batching lesson the other two paid for.

### TWO THINGS FLAGGED, NOT FIXED (dad's call)

**1. A junction landmark is invisible when approached from the NORTH.**
Identical at all four junctions:

    t1a from tgl  → IN FRAME      ndc(-0.62,  0.84)
    t1a from tsA  → IN FRAME      ndc(-0.98, -0.03)
    t1a from t1b  → NOT VISIBLE   ndc( 0.00, -4.06)

Structural, not a placement slip. `camGoal.copy(player.root.position).add(CAM_OFFSET)`
— the camera is a fixed world-space offset that never rotates with facing, so
"12.8 u ahead" always means NORTH and only 4.6 u of the world south of you is
ever on screen. A landmark at room centre is visible from the south, east and
west doors and sits 10 u behind you entering from the north. **No single
position satisfies both**; moving it only swaps which approach fails.

Options: a second smaller landmark at each junction's north end; a large
district floor-inlay under the prop extending north (the floor fills the frame
from every approach — cheapest, and free once merged); or accept a ~5 u delay
before recognition. Recommended: the floor inlay.

**2. The second chord is only 37 % shorter.** `tsA` (the fallen log) saves 75 %
— 81 u against 319 u, a real relief after the long lap. `tsB` (the cut
root-wall) is 81 u against 128 u, because t3a and t2a are only five ring-hops
apart. It is shorter, but it is a minor convenience rather than a shortcut, and
its real value is skipping the DARK Gloomwood stretch rather than the distance.

### Full-sequence check, all three levels

    baseline after one full pass: geom 126, tex 83
    after a second full lap:      geom 126, tex 83
    ✓ a full 1 → 2 → 3 lap does not accumulate memory  (geom 0, tex 0)
    ✓ save at lb / vh / t3a all round-trip with world state intact

The per-level intermediate deltas oscillate about +/-6 because each group ends
with a different room resident; that is a live-set difference, not a leak, and
the suite now reports them as informational rather than failing on them.

### Download size

**Levels 2 and 3 added zero bytes.** Both are built entirely from packs already
vendored for Level 1 or the shipping rooms — Kenney Nature 2.1, Kenney Castle
2.0, Quaternius LowPoly Modular Dungeon, KayKit Forest Nature, KayKit
Adventurers, all GREEN with verified CC0 licence files. Total assets: **39 MB
across 216 files** (audio 20 MB, characters 13 MB, animations 3.3 MB,
environment 2.5 MB). Five districts in Level 2 and five in Level 3 come out of
the same geometry by material-name recolouring.

## v3.27.0 — The promises the game could not keep (A8) (2026-08-08)

The fix plan's A8 was scoped as signposting: the rebuilt levels place eight
"come back later" gates and register none of them in the mystery log, where the
shipping rooms register six. Wiring the log turned up two faults underneath it,
both worse than the item as written.

### The gates could never be opened

`promiseGate()` in `js/levelkit.js` drew the obstacle, called `world.addBox()`
and stopped. It registered with **no gate system at all** — not `crackables`,
not `burnables`, not `cuttables`, not `shatterables`. Four gates were therefore
permanent walls with a chest plainly visible behind them:

| gate | room | advertises | actually opened by |
|---|---|---|---|
| the cracked wall | `la` (L1) | Earth Wolf's stomp | nothing |
| the scorched barricade | `lb2` (L1) | Fire Wolf's slam | nothing |
| the thorn tangle | `vc2` (L2) | Verdant Wolf's lash | nothing |
| the ice-sealed spring | `t1b` (L3) | Frost Wolf's breath | nothing |

This is the failure the promise-gate idea exists to prevent. A gate that reads
as "later" and then never opens is worse than a plain wall, because the child
who remembered it comes back with the right form and is told, wordlessly, that
they were wrong.

`promiseGate` now takes a required `{system, id, region}` and rides the same
system the shipping rooms use — including the "already opened on an earlier
visit" check, so a broken gate stays broken across a save.

### ...and it did not matter, because you could walk round them

The flood fill written to verify the fix immediately failed its FIRST
assertion, not its second: with every gate still standing, the reward was
already reachable. All five promise obstacles (the four above plus Thornedge's
bramble wall) sat loose in the middle of a 32×26 island or a 20×16 pocket, with
open floor on every side. `visibleReward()` — "the reward you can SEE but not
reach yet" — was reachable in all five.

Each now has an alcove: two `wallRun`s with the gate as the only mouth.
Measured nearest-approach with the gate shut is 3.2–5.2u; after the verb, 0.8u.

One knock-on. Level 1's pup #3 sat at `(-6, 0)`, inside the scorched alcove, so
walling it properly would have locked a collectible behind a form two levels
away. The pup moved to `(-6, -6)`, outside the gate. Worth stating plainly
because it is the shape of mistake this whole exercise is about: the fix for a
fiction problem quietly created a progression problem.

### Two supporting changes

- **`world.shatterAt` is a World method** rather than something `iceGate()`
  defined lazily on first use. Exactly the bug class already fixed once for
  `cuttables` in v3.24 — a room with ice built any other way had no shatter
  verb at all. `world.shatterables` is a constructor field now, like every
  other gate list.
- **`hitR` on a gate entry.** `burnAt`/`crackAt`/`cutAt`/`shatterAt` all
  measured from a single registered point, so the 8u-deep scorched barricade
  only answered to a slam within 2.6u of its exact centre. A gate now carries
  half its own span as extra catch radius: a blow landing anywhere ALONG a wall
  breaks it, which is how a child expects a wall to work.

### The map

`js/main.js` gained a `PROMISES` table — one row per gate, carrying the marker,
the map entry and the condition that closes it — replacing what was becoming
six near-identical `if` blocks. `done` reads the same flag the gate is built
from, so the map cannot claim a wall is open while the wall is standing. All
eight promises now land as ??? and resolve when opened.

### Verification

`tools/verify-promises.mjs` — flood-fills each room's real `boxColliders` and
`circleColliders` from its real `world.spawn`, asserts the chest is
**unreachable**, drives the real `player.trySpecial()` in the advertised form,
asserts it is **reachable**, then leaves and returns and asserts it is still
open. Nothing in it removes a collider by hand. 25 assertions, all green.

## v3.28.0 — Saying the junction's name twice (A6) (2026-08-08)

Level 3 is a ring, and a ring is walked in both directions. The verifier's
disorientation check projects each junction's landmark into the camera frustum
from every door in turn, and all four junctions failed the same approach:

    t1a from tgl  → IN FRAME      ndc(-0.62,  0.84)
    t1a from tsA  → IN FRAME      ndc(-0.98, -0.03)
    t1a from t1b  → NOT VISIBLE   ndc( 0.00, -4.06)

### Why no placement fixes it

The camera is a fixed world-space offset that never rotates with facing
(`js/main.js` — `camGoal.copy(player.root.position).add(CAM_OFFSET)`), sitting
7.07 u SOUTH of the player. Every ring leg returns to its junction through the
junction's north door, arriving at `z = -10` facing south. The centre landmark
at `z = 0` is not clipped and not small — it is **2.9 u behind the camera
itself**. No height and no scale reaches it.

Moving the landmark north only swaps which approach fails: an island is 26 u
deep and the camera covers 17.4 u of ground in total (12.8 ahead, 4.6 behind),
so no single point is visible from both ends of the room.

### What was built

A pair of half-size copies of the junction's own landmark, just inside its
north door at `z = -11.2`, `x = ±3.6` — 1.2 u ahead of where a child lands, so
the silhouette is at the top of the frame the instant they arrive. The big one
at the centre is still the payoff when they turn round.

Deliberately not the district floor-inlay the audit recommended. The inlay
would have made the check pass by weakening what it asks: the question is "is
the LANDMARK in frame", and a coloured floor is not a landmark. Repeating the
silhouette answers it as asked, and reads as architecture rather than as a
patch — the ring's north gates are marked gates. Dad had already ruled out a
HUD marker, and he was right to.

`heroProp()` gained a `scale`, which meant every collider it drops had to go
through one helper, since colliders are placed in world space and do not come
along when a group is scaled. The Watching Tree's glowing eyes moved inside the
group so a half-size copy gets half-size eyes; the Bloomfall's 60 drifting
petals are skipped on gate copies, because a gatepost needs the silhouette and
60 more instances buy nothing a child can read.

### Thornedge cost 40 draw calls to say twice

`t1a` went from 79 dressed draw calls to **119**. The Leaning Shrine is a real
knight model (`assets/chars/knight.glb`) — a character rig, and a character rig
never merges into the static batch, so each copy costs ~20 calls on its own.

Its gate markers are now smaller stones set at the same lean, in the same grey,
on the same base. Cheaper, and the truer fiction: there was one wolf-knight
before Kael, not three. `t1a` is 85 dressed and is the worst room in Level 3
with it — the other three junctions use tree, arch and blossom props that merge
normally and cost 2-4 calls for the pair.

### The verifier was asking a slightly wrong question

It projected one object. A junction may legitimately say its name more than
once, and a child reads the silhouette, not the instance. It now projects every
landmark instance recorded in `world.heroMarks` and reports which one was seen
(`centre` or `gate`). `heroMarks` sits on the World rather than in `markers`,
because the blind-strip law is a census of spots gameplay acts on and these are
scenery a child reads.

Also settled: the `tsB is shorter than walking round` assertion had been failing
against a threshold of `0.5` that was an unmeasured guess when the verifier was
written. Both legs measure `0.63` — 81 u against 128 u, a 37% saving — which
dad accepted as plainly shorter on the walk. The bar is now the accepted figure
with a little room (`0.7`), so a future edit that erodes the saving still trips.

Level 3 verifies ALL CLEAN, dressed and greybox.

## v3.29.0 — The weakest thing in the game (A9) (2026-08-08)

The audit item said Level 3 has too few enemies per room and needs an encounter
pass. It does, and it got one. But the head count was the smaller half.

### Every enemy in the Wild Woods had opted out of difficulty

`applyVariant()` in `js/enemies.js` did `e.hp = v.hp` — a flat overwrite of the
number `Enemy`'s constructor had computed one line earlier. So a varianted enemy
ignored both difficulty levers the rest of the game runs on: `enemyScale()`
(+8% hp per player level) and the Gentle-mode hp relief.

Levels 1 and 2 barely use variants, so nobody saw it. Level 3 is made of nothing
else — every hound is `thorn` or `elderthorn`, every moth is `wisp`:

    player level        1     4     8    12    16
    L2 skeleton       3.0   3.5   4.5   5.5   6.5   (scales)
    plain hound       4.0   5.0   6.0   7.5   9.0   (scales)
    THORN HOUND       3.5   3.5   3.5   3.5   3.5   (did not)

A child reaches the woods at about level 5-7. The corrupted, supposedly tougher
forest creature was **the weakest thing in the game**, by a wide margin, and no
amount of adding more of them would have fixed that. A Thorn Hound now runs
about 6.5 hp on arrival instead of 3.5, and Gentle mode reaches the woods for the
first time.

Frostpeak's rime family and Level 1's one Elder Hound were frozen the same way
and start scaling too.

### Level 2's shield-bearers were worth nothing

`SkeletonShield` was missing from `XP_VALUES`. `die()` guards with `|| 0` so no
save was ever corrupted — it just quietly starved the level curve, and a child
walked into the woods under-levelled. After the fix above, that made Level 3
*easier* still, since its enemies now scale off player level. Added at 12,
matching the Rogue it sits between in toughness.

### The pass itself

Written against the LEVEL-MAP beat chart rather than against a target number.
**25 placements over 21 rooms = 1.19 per room**, against Level 2's 1.18. Parity,
deliberately — the step up in difficulty is carried by the hp fix, not by
crowding rooms. Changing two difficulty levers hard at once would have made the
playtest unreadable.

- **`t1a` lost its only hound.** The chart's opening row is "the woods are wrong
  (quiet dread, **no fight**)" at intensity 1, and `t1b` next door is labelled
  "first Thorn Hounds". One placement contradicted both, and made the level open
  on a fight instead of on the feeling that something is off.
- **Every rest beat stays empty** — `tc1`, `tc3`, `tc4`, the shrine, both
  shortcut legs, and the two teach rooms that are not the twist. The shortcuts
  especially: they are the reward for the long walk round, and a fight on the
  way home would spend the relief they exist to create.
- **The Bramble Blob is back.** `bramble` was written for this region in v3.19,
  and every live placement of it vanished when the `w*` rooms retired into `t*`
  rooms. Reviving it cost **zero lines** in `enemies.js` — the purest form of
  the asset-multiplication law — and gives Level 3 a third body shape. It had
  two, and three of its four districts threw the same thing at you.
- **`t4a` is a pack again**: two elders and three of the pack, per the chart's
  intensity-4 "the pack — Elder Thorn Hounds". It reads as a pack rather than a
  pile-on because `CONFIG.ENGAGE` only ever hands out two attack tokens (one on
  Gentle, three on Brave) — everyone else prowls a waiting ring, so a child
  meets one pattern at a time however many are in the room. That cap is what
  makes density a safe lever at all.

### A room is not busiest when you walk into it

`tools/probe-encounters.mjs` measures each room with and without its cast — one
enemy costs about 5.7 draw calls, and character rigs never merge into the static
batch, so that cost is permanent. Under that model every room came in under the
100-call budget and the pass looked finished.

It wasn't. `tools/probe-peak-calls.mjs` kills everything through the real damage
path and watches every frame, and **`t3b` arrived at 86 and peaked at 102**. A
Bramble Blob costs ~17 calls at its peak, not 5: it splits into two minis when it
dies and their drops land on top of the room's existing drops. Ordinary drops
turn out to be nearly free — `t4a`'s peak equals its arrival — but splitting is
not. The blob moved to `t2p`, which arrives at 54 and peaks at 74.

Worst frame anywhere in Level 3 is now **94**, measured through the fight rather
than on arrival. Level 3 verifies ALL CLEAN.

### The audit's own numbers were wrong

Recounted from source, confirmed against a live probe: Level 1 has 8 placements
(not 13), Level 2 has 20, Level 3 had 16 (not 13). Only the Level 2 row was
right — the earlier count missed multi-line arrays and double-counted a
conditional. The finding held anyway, and the gap it described was real.

## v3.30.0 — One character, one shadow (B1) (2026-08-08)

`vc1` and `vc2` were the last two rooms over the 100 draw-call ceiling. The audit
had already established that the cause is characters rather than geometry, and
that the lever is shadow-casting — and had flagged it as a whole-game visual
trade-off rather than a Level 2 decision, so it went unfixed.

It is a whole-game change. It is not a trade-off.

### The line

`prepareCharacter()` in `js/assets.js` set `castShadow = true` on **every mesh of
every character**. A cast mesh is submitted twice — once to the shadow depth
pass, once to the beauty pass — and a character is not one mesh:

    knight    9 skinned parts (body, head, 2 arms, 2 legs, helmet, visor, cape)
              + sword + shield
    skeleton  9 skinned parts, + shield + blade on a shield-bearer

Skinned meshes are also the one thing `js/batch.js` can never merge, so that
cost is permanent, and it is paid in every room in the game by the player alone,
whether or not there is an enemy in it. Measured in `vc1`: **32 of 112 draw
calls were characters entering the shadow map.**

A character now casts from its LARGEST skinned mesh only — the body, which is
what the silhouette is made of. Held items come through the same function as
their own root with no skinned mesh in them, so they stop casting too.

### Proving it is invisible rather than asserting it

The first diff was useless: two renders of the Bloomfall differed by 3.5% of
pixels whether the shadow policy changed or not, because the characters are
animating between shots. With the animation mixers frozen and a control pair of
identical renders to establish the noise floor:

    control (same policy, two shots)   2.40% of pixels differ >8/255
    body-only casting                  2.49%   <- inside the noise
    no character shadows at all        3.26%   <- visibly different

Body-only is indistinguishable from full per-mesh shadows. Turning character
shadows off entirely buys only 5 more calls and is measurably visible, so it was
not taken. Without the control shot the first number would have looked like
evidence of a regression that was not there.

### What it did to the whole game

Worst-case, sweeping a grid of standing positions per room rather than sampling
once at the spawn — the frustum decides what gets submitted, and the Den varies
between 89 and 113 depending on where you stand:

    vc1                              110  ->  82
    vc2                              105  ->  83
    vh                                88  ->  82
    vb2 / vb3                         90  ->  58 / 60
    Level 3 worst frame IN A FIGHT    94  ->  77

Every room in the three rebuilt levels is now at or under 86. Level 2 verifies
ALL CLEAN — that assertion has been red since the audit. Triangles fell with the
calls, since shadow-pass triangles count too.

### The Den is now the last room over the ceiling

113 worst-case, and characters are no longer why. Its static geometry casts 18
calls' worth of shadow, and it is hand-built in `js/rooms.js` — **the shipping
rooms never call `flattenStatic()`**; only the three rebuilt levels do. Logged
as B3 rather than fixed here: batching a room with villagers in it is a
different job from a shadow policy.

One prerequisite went in now, because it is a trap otherwise: `world.npcs` is in
`flattenStatic`'s protected-key list. It changes nothing today — no room with
NPCs calls the function — but without it the villagers would be merged into the
scenery and stop moving, which is precisely the failure that function's own
comment warns about.

### Correction, same day: the sweep was not wide enough the first time

The paragraph above originally claimed "every room at or under 86". That came
from sweeping nine rooms, and it understated the worst case. Two of the three
design agents run for A9 independently pointed out the same methodological hole
in `tools/probe-encounters.mjs` — it samples only the spawn point, and moving the
camera around a room finds up to +19 calls in the same space. They measured
`t1b` 105, `t2a` 107 and `t3a` 106 dressed, at the worst camera position, before
this fix.

All 52 rebuilt-level rooms have now been swept over a grid of standing
positions:

    Level 1 (14 rooms)   worst  lb2   96
    Level 2 (17 rooms)   worst  vb2   97
    Level 3 (21 rooms)   worst  t3a   90

Every one is under the ceiling, and the three rooms the agents flagged came down
to 87, 83 and 90. But the true headroom in the worst rooms is 3-4 calls, not 14
— worth knowing before anything else is added to `vb2`, `lb2` or `vb1`.

## v3.31.0 — The pose never lies, including on the floor (C1) (2026-08-08)

The fix plan asked for the juice layer to be retuned because the rooms got
bigger. It did not need that, and the reason is worth recording: **the camera is
a fixed world-space offset with a constant CAM_DIST, so the visible ground is
21.2u wide, 12.9u ahead and 4.5u behind in EVERY room** — measured identically in
a 14x10 choke and the 36x28 hub, to the decimal. Bigger rooms do not put more
world on screen. Screen shake does not read weaker in them, and nothing in the
feedback layer needed to scale with room size. The shake numbers are unchanged.

What was wrong was different, and it was everywhere.

### Every flourish drew the same circle

`effects.groundSlam()` took no radius, so all six callers got a ~4u ring:

    knight spin      drew 4.0u   really 2.3u   (its own comment claimed the ring
                                                "sweeps out to the spin's reach")
    fire slam        drew 4.0u   really 3.0u
    stone stomp      drew 4.0u   really 3.2u
    Blood Moon       drew 4.0u   really 2.6u
    vine lash        drew a 4.0u CIRCLE for a 3.8 x 0.9 corridor
    frost breath     drew a 4.0u CIRCLE for a 40-degree cone

The two shape cases were the worst of it: a disc told a child the breath reached
0.6u BEHIND them, which is the one direction the fixed camera barely shows.

`groundSlam` now takes the true reach, and an optional cone that draws a wedge
out of the same primitive — RingGeometry has thetaStart/thetaLength, so a cone
costs no new geometry type and no extra draw call. The growth eases OUT so the
ring arrives at its extent and lingers while it fades, rather than still
expanding as it vanishes; that is what makes an honest radius legible instead of
merely correct. Ceremony keeps the full 4u, having no hitbox to lie about, so
transformations and boss deaths are now visibly the biggest rings in the game.

### One ability, one number

Two secondary radii disagreed with their own rings. The stone stomp cracked rock
at `SLAM_BURN_RADIUS` — **the fire wolf's constant, in the earth wolf's move** —
2.6u against a 3.2u ring and 3.2u of damage. The fire slam burned and ignited at
2.6u against a 3.0u ring. So a brazier at 2.8u sat inside the orange ring and
refused to light, and a cracked rock at 3u was swept by the brown ring and did
nothing. Both now use their own ability's radius. `SLAM_BURN_RADIUS` is deleted.

### The part that actually mattered

Auditing every flourish against its hitbox turned up two bugs of the same shape
in the place where the law matters most — a child standing in a boss arena,
dodging by a red mark on the floor.

**The Bone Warden's chop arc pointed the wrong way.** The mark is laid flat with
`rotation.x = -PI/2` and then steered with `rotation.z = -rotation.y + ...`,
which MIRRORS the heading instead of rotating it: three.js Euler XYZ applies Rz
in the ring's own plane first, so a local vertex at angle a ends up at world
(cos(a+z), -sin(a+z)) and the sign has to follow the facing. Measured across
seven facings before the fix:

    warden faces    red arc points at    error
        0 deg            -18 deg          -18
       45 deg            -63 deg         -108
       90 deg           -108 deg          162
      135 deg           -153 deg           72
      171 deg            171 deg            0
      270 deg             72 deg          162

Correct at exactly one facing, and up to 162 degrees wrong — the arc pointing
almost directly away from the swing. A child dodging by it was being sent into
the axe. Now zero error at every facing.

**Boreal's dive lane had the identical sign error**, lying perpendicular to the
dive at diagonals. And worse: at the end of the 0.9s windup she threw `diveDir`
away and re-aimed at the child, so the one floor decal a boss charge is allowed
to draw was decoration and stepping off it did nothing. A telegraph you cannot
act on is worse than no telegraph. She now dives where the lane said.

Three more of the same family: the Warden's chop arc stopped 0.9u short of the
axe (2.0 drawn, 2.9 hit); his spin — the attack you cannot step out of sideways —
was signposted with a 162-degree wedge implying a safe side, and is now a full
ring at its real 2.6u; and both marks faded to nothing BEFORE the damage frame
(chop invisible 3 frames early, spin 6). The chop arc and the hit test now read
one shared `CHOP_ARC` constant so they cannot drift apart again.

### Verification

- `tools/verify-pose.mjs` — fires each ability through the real input path, finds
  the ring in the scene, measures its world radius and wedge angle. All five
  match within 0.02u; the cone and corridor draw 80 and 26 degrees as intended.
  It also intercepts `burnAt`/`crackAt` to assert one ability really is one
  number.
- `tools/verify-telegraphs.mjs` — transforms the Warden's arc centre vertex by
  its real matrixWorld and compares the bearing with his forward, at seven
  facings including non-cardinals.
- `verify-l2-warden.mjs` and `verify-l3-lash.mjs` both still ALL CLEAN.

One caught mistake worth recording: the first pose run reported the cone as 40
degrees and the wedge as 13, and failed. The game was right — my verifier
converted radians to degrees with 90/PI instead of 180/PI and reported half the
angle. The measurement was wrong, not the thing measured.

## v3.31.1 — The fire breath, and what the verifier caught (2026-08-08)

The adversarial pass over the C1 audit rejected six of its own claims as stale —
they described the code before the C1 fixes, which landed while the audit was
running — and independently re-derived the Bone Warden mirror bug in node against
the vendored three.js, reaching the same numbers measured in the browser. It also
confirmed one thing C1 had missed, in C1's own subject.

**The fire breath was the frost breath's twin and got none of the treatment.**
Both are a 38-40 degree cone; C1 gave the frost one an honest wedge and left fire
as the only ability in the game with no ground mark at all. Its three flame puffs
spread ±0.3/±0.6/±0.9 against a real cone half-width of ±2.19u at the far step —
2.4x too narrow, and stopping 0.96u short of the reach. And its `meltAt` probes
used a flat 1.6u radius starting 1.13u out, so the breath could melt a frozen
brazier 0.47u BEHIND Kael. That is the Frostpeak gate verb — breath to melt, slam
to light — firing backwards.

It now draws the same cone from the same constants the hit test uses, the puffs
spread to the cone's true half-width at each step, and the probe radius is
clamped to its own reach. Measured at runtime: 76 degrees drawn, 3.4u reach.

### Nearly shipped broken

The first version called `effects.groundSlam(...)`. `tryRanged(world)` takes no
`effects` parameter — it would have been a ReferenceError the first time a child
breathed fire, and `node --check` passes it without complaint because it is a
scope error, not a syntax one. Caught by checking the enclosing signature rather
than trusting the syntax check, and fixed to `juice.effects`, which is the handle
`js/boss.js` already uses. The runtime probe now asserts "no page errors" as well
as the geometry, so the next one cannot pass silently.

### Logged, not fixed: C4

Three confirmed defects where the pose lies about TIME rather than distance —
the jump is visibly airborne for 0.648s but dodges for 0.535s; the Dark Wolf
lunge has i-frames for 58% of an unchanging dash; the parry window has no visible
state at all and 40% of it elapses during the shield's crossfade. Plus weapon
`arc` varying 2.3x with one shared animation clip.

These are combat-feel changes, not feedback fixes: each alters what a child can
survive, so each needs a playtest rather than a measurement. Written up as C4
with the derivations rather than folded into C1.

## v3.32.0 — When the dodge works (C4) (2026-08-08)

C1 fixed the flourishes that lied about WHERE an ability reaches. These are the
ones that lied about WHEN. For a child who cannot read it is the same defect:
they act on what they see, and what they saw was wrong.

**The jump.** Visibly airborne for 0.648s, dodging for 0.535s. The 0.35u
`AIRBORNE_DODGE_Y` threshold is crossed twice, so 56ms at each end — 17.4% of
the jump, up to a third of Kael's own height off the floor — read as airborne
and took the hit. And not as a rare mistime: enemy `contact()` defaults to
`{ground: true}` and re-tests every frame of overlap, so the landing window is
sampled continuously. A child has exactly one cue for "jump the sweep", and
being hit there teaches that jumping does not work.

`airborne` now returns true for the whole arc when the arc is a JUMP —
`jumpsUsed` is set only by `tryJump` and cleared on landing, so it is precisely
"this is a jump" — while hops keep the threshold. The roll's 0.28u and the
lunge's 0.18u are not jumps, they carry their own i-frames, and making them free
dodges of every ground attack would be a different game. Measured after: 0.658s
visible, 0.658s dodging.

**The lunge.** `LUNGE_DUR` 0.26 against `LUNGE_IFRAMES` 0.15 — 42% of an
unchanging blur was hittable, on the one form that also takes +30% damage and
whose whole design is "an attack AND an escape". The separate constant is
deleted; the dodge reads `LUNGE_DUR`, so they cannot drift apart again.

**The parry.** One `block` pose, crossfaded over 0.12s, pixel-identical during
the 0.3s window and for the whole hold after it — and `defendStart` is stamped
when the button registers, so 40% of the window elapsed while the shield was
still coming up. The shield now glints pale blue for exactly the window, snapping
on at `defendStart` and easing off as it closes. The materials are cloned on
mount: tinting the shared loader cache would have lit up every shield in the
game, including the skeletons'.

**The weapon arc.** `js/items.js` gives weapons an arc from 36 to 82 degrees — a
2.3x difference in swing width — and every one played the same wide diagonal
slice. A narrow weapon now plays the stab clip, which was already loaded as the
combo follow-up. The Long Spear looks like what it hits.

### `node --check` is not a syntax check for this codebase

It exits 0 on `js/player.js` containing a broken if/else chain, because a `.js`
file parses as CommonJS, hits the `import` on line 5 and stops. It gave a false
pass twice in one session: once on the fire breath's ReferenceError, and once
here on a real syntax error — I had inserted `this._parryGlint()` between an
`else if` and its `else`, and the game did not boot at all.

`tools/verify-boot.mjs` now does the cheap real check: load the page, start a
game, report any page error or console error. It runs in about twenty seconds
and should go first, before any of the long verifiers.

One more measurement lesson: the i-frame assertion first failed at 0.204 against
0.26. The game was right — the test had waited two frames before reading, and
under SwiftShader one frame is long enough to eat 20% of the window. A decaying
counter has to be sampled in the tick it is set.

## v3.33.0 — The Den joins the budget (B3) (2026-08-08)

After B1 the Den was the only room in the game over the 100 draw-call ceiling —
113 worst-case — and characters were no longer why. Its own static geometry cast
18 calls of shadow, because the hand-built shipping rooms never call
`flattenStatic()` while all three rebuilt levels do from `finish()`.

One line at the end of `buildDen`, and 113 → **95**.

The care went into not freezing the room. Batching bakes world transforms, so
anything merged keeps the pose it had at build time forever. Four categories had
to be safe:

- **Skinned meshes** — the three villagers, Biscuit, the shopkeeper, the wolf pup.
  `flattenStatic` skips these outright.
- **The checkpoint flame** — `checkpoints` is already a protected gameplay key.
- **`world.npcs`** — added to the protected keys during B1, specifically so this
  change could be made later without merging the villagers into the scenery.
- **The three floating spirit-stones** — Petra's heart, Cinder's ember and the
  moonstone orb are moved by `onAnimate` hooks and are not skinned, so they are
  the ones that would actually have frozen. Marked `keepLoose` where they are
  built.

`tools/verify-den.mjs` is the check that matters: it turns on both spirit homes
so the Den holds the most it ever holds, samples every animated object across 90
frames, and asserts each one changed — then sweeps standing positions for the
worst frame. Villagers animating, Biscuit animating, stones bobbing, 95 calls.

Every room in the game is now under the ceiling.

## v3.34.0 — The docs catch up, and one of them was wrong (C3, C2, B2)

### METRICS.md had the camera width mislabelled, and everything sized levels by it

The framing table read "**Visible width at Kael's own depth: 16.1 u**". It is
not. Re-measured at the documented aspect, 16.1 u is the width at the **near
edge** of the screen — the bottom, 4.5 u behind Kael, closest to the camera and
therefore the narrowest part of the fan. The width at Kael is **22.2 u**.

The table's own "~39.6 u at the far edge" is what gives it away: 16.1 / 22.2 /
39.6 are the near, middle and far widths of a single frustum fan, and the row had
labelled the near one as the middle. Geometry agrees with the measurement
exactly: 2 × 11 × tan(25°) × 2.16 = 22.2.

Two things the table never said, both of which later sessions kept re-deriving,
are now in it:

- **Width scales with aspect ratio; ahead and behind do not.** 21.1 u at aspect
  2.06, 22.2 u at 2.16 — but 12.9 u ahead and 4.5 u behind on every device.
  Anything reasoning about what a child can see BEHIND them (the blind-strip law,
  A6's junction landmarks, C1's flourishes) depends only on the stable pair.
- **None of it changes with room size.** A 14 × 10 choke and the 36 × 28 hub
  frame identical ground, to the decimal, because the camera is a fixed offset.
  That is the fact C1 was written against, now recorded where it will be found.

The header was also internally inconsistent — "740 × 360, aspect 2.16", when
740/360 is 2.06.

### The rest of C3

LEVEL-MAP said Level 3 is 18 spaces; 21 are built, and the doc's own component
list adds to 21. The COMBAT-SPEC row about the missing stomp stagger is stale —
A4 shipped it in v3.26.1. The remaining drift was already annotated in place.

### C2 and B2 closed on measurement

**C2** — dad's call: 37% is fine, keep the chord. The verifier still asserts the
saving, now against the accepted figure rather than the unmeasured 0.5 guess.

**B2 (LOD)** — closed as not needed. Every room in the game is under the ceiling
after B1 and B3, and the worst triangle count anywhere is ~50k against a 500,000
budget: two orders of magnitude of headroom, because this is a low-poly kit game.
LOD would add a system, an authoring step and pop-in to solve a measured
non-problem. If more headroom is ever wanted, the remaining hand-built Frostpeak
rooms (f2 99, f4 97, f3 96) still never call flattenStatic — one line each, worth
15-18 calls, far more than LOD for far less machinery.

## v3.41.1 — Maren's stock grows with the world (2026-08-09)

The FIX-PLAN status table is closed end to end, so this run took the first
unfinished entry from the newest QUEUED NEXT list (v2.2.6, line 681):
**"Maren tier-2 stock after Stoneroot"**.

The item ahead of it in that queue — the economy/XP balance pass — was SKIPPED
under the standing rule: shard income against the shop ladder is a difficulty
judgement and needs the kids, not a headless run.

### What was wrong

`SHOP_STOCK` was one flat list. Every weapon and shield in the game was on
Maren's cart at the Den before a child had walked into Ember — including the
Boulder Hammer (3 damage, 0.6s daze) at 300 shards, buyable at level 1 by
anyone who smashed enough pots. GAME-CONTRACT's economy line asks for the
opposite: "shop ladder per region tier ~ 60/90/150/250/400 — a kid who explores
buys one big thing per region."

So the shop was a fixed catalogue: read once, and there was never a reason to
look again.

### What it is now

Four rungs, each arriving when a region is HEALED. `CONFIG.SHOP.TIERS` holds
the ladder, `tier` on each `SHOP_STOCK` line says which rung it rides, and
`shopStock()` / `nextShopTier()` in `js/items.js` are the only two things the
menu asks.

| rung | arrives | new stock | cheapest new | contract target |
|---|---|---|---|---|
| 1 | the first visit | potion 15, Round Guard 70, Swift Fang 80 | 70 | ~60 |
| 2 | Stoneroot healed | Ember Blade 90, Long Spear 120 | 90 | ~90 |
| 3 | Wild Woods healed | Tower Shield 180, Moon Sword 200 | 180 | ~150 |
| 4 | Frostpeak healed | Boulder Hammer 300 | 300 | ~250 |

Measured against the contract: rungs 1 and 2 land on it, rung 3 is 30 over,
rung 4 is 50 over. Nothing was repriced — the ladder was already latent in the
prices and the queue item is about WHEN each rung appears, not what it costs.
Repricing is the economy pass, which is the item I skipped.

The `after` keys are the RUNTIME WorldState ids — `stone`, `wild`, `frost` —
not the long names in `js/regions.js`. The two vocabularies disagree and always
have (`js/main.js` writes `WS.set('stone', 'restored')`; `regions.js` calls the
same region `stoneroot`). Gating on the wrong one would have produced a shop
that never restocked and no error anywhere, so it is called out in the CONFIG
comment.

### Judgement calls

- **One teaser card, not a silently shorter shelf.** A shop that quietly grows
  is a shop a child stops checking, so the next locked rung shows as a dashed
  `📦 New stock — Maren is off gathering, back when Stoneroot sings again`. It
  names the region and never the route, which keeps it a promise rather than a
  quest marker. It disappears when the ladder is done. One card, `pointer-events:
  none`, no draw calls — the shop is DOM.
- **The Ember Blade sits on the Stoneroot rung, not the Ember one.** Its blurb
  says "forged in the Hollow", so by fiction it wants to arrive when Ember
  heals. The queue line says tier 2 arrives after Stoneroot, and the Ember
  Blade is the natural 90-shard rung. Off-fiction by one region, one line to
  reverse. AWAITING dad's call.
- **An unknown tier stays SHUT.** `shopTierOpen` returns false for a tier not
  in the table. A typo should hide one card, not hand a five-year-old the
  Boulder Hammer.
- **A missing `tier` is treated as 1.** A future line that forgets the field
  lands in the opening stock rather than vanishing.

### Verified

Nothing in `tools/` touched the shop, so `tools/verify-shop.mjs` was written
BEFORE the fix and run against the unfixed code first: **6 of 17 assertions
failed**, which is what makes the other 11 worth anything. After the fix, ALL
CLEAN, and `verify-boot`, `verify-density` and `verify-den` are green with it.

It drives the real thing — walks Kael into Maren's ring so `main.js`'s own
proximity edge opens the shop, reads the cards out of the DOM, heals one region
at a time and re-reads. Reading `SHOP_STOCK` out of the module would have
proven the data and none of the wiring.

The last assertion is the one that will matter in six months: a profile that
already OWNS a tier-4 weapon keeps it through a real localStorage round-trip
with nothing healed. The tier gate decides what Maren OFFERS, never what a
child HAS — additive-forever applies to gear too. Measured: owns `hammer_a`,
still equipped, and Maren does not offer it back.

**A frozen loop cost a whole suite run.** The first verifier closed the panel
with `display = 'none'`. `_open()` calls `onPauseGame()` and `main.js:1595`
returns before the world update while a menu is up, so hiding the panel by hand
left the game frozen: the player never moved, the proximity edge never reset,
and every later read returned the render before it. The failures looked like
the gate not working. It closes through the '✓ Done' button now, the way a
child does.

### Not bumped

`sw.js` stays at `wolfknight-v3.41.0` — this is not a deploy. `index.html`,
`js/config.js`, `js/items.js` and `js/menus.js` are all cached files, so
**the next deploy to main must bump CACHE_NAME** or a returning child gets the
old flat shop out of the service worker.

### AWAITING dad's call

- **The branch.** The standing overnight instruction says work on `overnight`,
  cut from main. This session was assigned `claude/ecstatic-hawking-fdmjue` by
  the harness and told never to push elsewhere. Both are off main, which is the
  part that matters, so I used the assigned branch rather than stopping. Say
  which one overnight work should live on and I will stay there.
- **The Ember Blade's rung**, above.

### For the queue — three things found, none fixed (one item per run)

1. **BUILDLOG has a seven-version hole.** The last entry before this one is
   v3.34.0; `sw.js` says the build is **v3.41.0**. Stormreach, the Sunken Vale,
   the Tide Wolf, the mini-game harness and the Den rebuild all shipped with no
   entry here — "Stormreach" appears in this whole file once. The overnight
   process is told the repo is the only record, and for seven versions it is
   not. Worth a reconstruction pass from `git log` before more history is lost.
2. **`js/regions.js` says `sunkenvale: { built: false }`** and gives it no
   rooms, gates or restoration block, but the level shipped (twenty rooms,
   Meri, the Tide Wolf). `validateRegions()` machine-checks that manifest, so
   it is currently checking a region that no longer matches the game.
3. **`GRANTED_IN` declares `storm_wolf: 'stormreach'` twice** — harmless today
   (the second write wins with the same value) and exactly the kind of thing
   that stops being harmless when someone edits one of the two lines.
4. **Maren has four rungs and six built regions.** The contract ladder has five
   (~400 at the top) and there is nothing new to sell after Frostpeak, so
   Stormreach and the Sunken Vale both end with a trip home to an unchanged
   cart. A rung 5 wants new stock, which is an asset question, not a code one.

<!-- MERGED HISTORY: everything below to the end of this section was written on
the `overnight` branch, which ran for two days without a path back to main. The
entries are kept verbatim because the overnight process is told the repo is the
only record, and deleting the branch would have made that false. -->

No code changed tonight. This entry is the record of a wasted run and the two
things worth keeping out of it.

### What went wrong

The run instructions say *"Work on branch `overnight`, cut from main; create it
if absent."* It was **not** absent — `origin/overnight` already carried Q2
(Maren's stall, 25e3027). I read "cut from main" as the instruction and created
`overnight` fresh from `1f91829`, which silently discarded that history from my
view. Every document I then read was main's copy: FIX-PLAN with all rows
shipped, and BUILDLOG's newest QUEUED NEXT list being the v2.2.6 one — whose
first non-feel entry is *"Maren tier-2 stock after Stoneroot"*.

So I picked the item that had already been done, and rebuilt it a second way:
five region tiers gated on the DEFEAT flags, locked stock shown greyed on the
counter, and a second `tools/verify-shop.mjs`. It went green — 5 verifiers, 0
failures — and it was worthless, because the item was shipped.

The push is what caught it: `origin/overnight` rejected a non-fast-forward. Had
the branch not existed remotely, or had I force-pushed, Q2 would have been
deleted. My commit is **not** pushed and the branch is exactly `25e3027`.

**RULE FOR EVERY LATER RUN: `git fetch origin overnight` FIRST, and if the
branch exists, check it out. Cut from main only if it genuinely does not exist.**
The repo is the only record, and half the record was on a branch I never
fetched. A verifier suite passing 5/5 says nothing about whether the work needed
doing.

### Q2 re-checked, and it holds

Before discarding my version I checked the one thing that could have made it
worth keeping — whether Q2's gate flag is ever actually set in play. It is:
`WS.set('stone', 'restored')` fires in `world.onWardenDefeated`
(`js/main.js:1157`), the real Warden-defeat path, as well as from the cheat
menu's `stoneDone`. Q2's ladder opens for a child who beats Stoneroot. Nothing
to fix.

### The one finding worth salvaging: three region-completion lines are DEAD

Measured while choosing a gate flag, and it is a live progression fault that
neither run has touched. `state.spoken.region_complete`, `stone_complete` and
`wild_complete` can never be set on the shipping path. Each needs BOTH a retired
room id AND a marker published only by that retired room's builder:

    region_complete   state.room === 'r3'  + markers.exitSpot     (buildR3)
    stone_complete    state.room === 'e3'  + markers.petraSpot    (buildE3)
    wild_complete     state.room === 'w5'  + markers.sylvaShrine  (buildW5)

`RETIRED_ROOMS` redirects `r3→le`, `e3→vz`, `w5→tgl` (js/state.js:60), so none
of those three builders ever runs and none of those markers exists. `vz` does
publish a `petraSpot` of its own (level2.js:1158), but the guard still names
`e3`. `exitSpot` exists in exactly one place in the codebase — `buildR3`.

What that breaks, all of it silent:

- **Fast travel never grows.** `js/menus.js:194-196` adds Stoneroot, the Wild
  Woods and Frostpeak to Luna's moonstone only on those three flags. A child who
  beats Stoneroot cannot travel to the Wild Woods.
- **The pup counter is stuck at 3** (`js/main.js:216-217`, `js/menus.js:99`) —
  it reads the same flags for the total, so the sticker book says `x/3` forever.
- Any later gate that reaches for the obvious "region complete" flag inherits
  the fault. Q2 avoided it by using WorldState instead; that was the right
  instinct and it should not have to be an instinct.

A related smaller one, same family: `loadRoom` stores the RAW id
(`state.room = id`, js/main.js:1240) while building the RESOLVED one, so
Frostpeak's `f1` door back to `w5` leaves `state.room === 'w5'` with `tgl` on
screen (`js/rooms.js:3607`).

### AWAITING dad's call

- Nothing to approve — no code changed. Q2 stands as pushed.
- Its own AWAITING list (the tier split, Maren's promise line) is still open
  above and unaffected.

- QUEUED NEXT (in order):
  1. **The three dead region-completion lines** (measured above): move each
     trigger onto the rebuilt room and a marker that room actually publishes,
     and fix the fast-travel and pup-count reads that hang off them. Verifier
     first — nothing in `tools/` currently asserts that a region can be
     *completed*, only that its rooms connect.
  2. `loadRoom` storing the raw room id rather than the resolved one — same
     family, probably the same session.
  3. Shop tiers 3+ for the Wild Woods, Frostpeak, Stormreach and the Sunken
     Vale. The mechanism from Q2 is general; the bands need prices, so this
     wants the economy pass first.
  4. Economy/XP balance pass (shard income vs shop ladder, perk tiers past
     level 12) — **needs the kids. Do not do this overnight.**
  5. Hard landscape lock (still best-effort only; see BUILDLOG line 56).

## v3.42.0 — Three regions that could never be finished (2026-08-09, overnight)

Head of the newest QUEUED NEXT list, measured and logged by the previous run:
**the three region-completion lines are dead.** They are, and what hung off
them is worse than a missed line of dialogue.

`state.spoken.region_complete` / `stone_complete` / `wild_complete` are the
record of which NARRATION LINES a save has heard. Each needed BOTH a retired
room id AND a marker only that retired room's builder publishes:

    region_complete   m.exitSpot                          (buildR3 — the only
                                                           exitSpot in the repo)
    stone_complete    state.room === 'e3'  + petraSpot    (buildE3)
    wild_complete     state.room === 'w5'  + sylvaShrine  (buildW5)

`RETIRED_ROOMS` redirects `r3→le`, `e3→vz`, `w5→tgl`, so none of those three
builders ever runs. All three flags were unreachable, and three progression
systems read them as *"is this region finished"*:

- **Luna's moonstone never grew a destination.** A child who beat Stoneroot
  could not fast-travel to the Wild Woods.
- **The pup counter was stuck at 3.** The HUD and the sticker book both compute
  the TOTAL from these flags, so it read `x/3` for the whole game while twelve
  pups exist.
- **The map screen never showed Stoneroot** — the same read, at menus.js:268.

### The fix is that a region is finished when its BOSS IS DOWN

`regionCleared(region)` in js/state.js, keyed off the defeat flag the boss's own
death sets (`bossDefeated`, `wardenDefeated`, `sylvaDefeated`, and the three
later regions' flags while the table is being written). A save flag set by the
defeat path cannot drift apart from a line of dialogue, and **what a child can
travel to should not depend on whether they stood close enough to hear Pip say
so.** All six progression reads now go through it.

The three lines themselves moved onto the rebuilt arenas and the markers those
arenas really publish — each keyed to the spirit the line is ABOUT:

    region_complete   le  + heroSpot   (Cinder's cage) + bossDefeated
    stone_complete    vz  + petraSpot                  + wardenDefeated
    wild_complete     tgl + sylvaSpot                  + sylvaDefeated

`petraSpot` and `sylvaSpot` are published by exactly one live room each, so
those two need no room guard at all. `heroSpot` is published by every Level 1
room, so `region_complete` keeps a room guard — through `resolveRoom`, not the
raw id, because `state.room` stores the raw one (queue item 2, untouched).

### Measured

`tools/verify-completion.mjs` is new, and nothing in `tools/` asked this
question before: every level verifier asserts a region's rooms CONNECT, and all
of them were green while no region could be COMPLETED.

It renders Luna's moonstone and the inventory footer from the real `Menus`
class rather than re-implementing the predicate, and it **wipes the narration
record before every sample**, because that is precisely the fault:

| state | destinations | pups shown |
|---|---|---|
| nothing beaten | 1 | x/3 |
| Shadowgrip down | 2 | x/6 |
| Warden down | 3 | x/9 |
| Sylva down | 4 | x/12 |

Then it stands Kael on each rebuilt arena's own marker, lets the world tick, and
asserts the line speaks through the real narration pass — never by calling the
trigger directly. Last, it reads main.js and menus.js back over HTTP and asserts
**zero** remaining `state.spoken.*_complete` progression reads, so the fault
cannot come back by the same door.

**Run against the old code it fails 6 of 9** (destinations 1,1,1,1 · pups
3,3,3,3 · all three lines silent · 10 narration-record reads). A verifier that
cannot fail is the thing this repo has been bitten by twice, so it was checked
by stashing the fix rather than assumed.

`verify-all.sh verify-completion verify-progression verify-den`: all green.

### AWAITING dad's call

Nothing needs approving — this restores behaviour the game always intended. One
judgement call worth naming: `region_complete` also fires `showCompleteScreen()`,
and it now fires when Kael stands at Cinder's cage after the Shadowgrip falls,
which is a few seconds earlier in the beat than the old portal-side trigger.
The celebration lands on the freed spirit rather than on the door out. If that
reads wrong on a playthrough it is one line to move.

### A run that nearly wasted itself the same way the last one did

The previous entry ends with a rule in bold: *fetch `origin/overnight` FIRST*.
This run did not, cut `overnight` from main exactly as that run did, read main's
stale documents, and picked from the v2.2.6 queue — landing on the economy/XP
pass, which the real queue lists at **#4 and marked "needs the kids, do not do
this overnight."** The work was built and verified green (perk tiers, 128
pick-paths, a `verify-economy.mjs`) before `git push` rejected the
non-fast-forward and the branch's real history appeared.

It was **discarded**, unpushed, the same way the last run discarded its
duplicate Q2 — the item was not mine to take. The findings are kept below,
because they are measurements and the code was not.

The rule needs to be stronger than a sentence in the log, because the log is
what a fresh session reads last and the mistake happens first. Suggested for the
run prompt itself: *"git fetch origin overnight && git checkout overnight before
reading anything; cut from main only if the branch does not exist on the
remote."*

### Salvaged: what the economy measurements found

Kept as measurements for whoever takes queue item 4 with the kids in the room.

**The perk pool has run dry, and the law cannot see it.** GAME-CONTRACT says the
pool must hold ≥3 unmaxed choices to level 21 and to *"add tiers when a pool
would run dry"*. Perks have no rank cap — `applyPerk` is a bare `+1` — so no
perk is ever "maxed", "≥3 unmaxed" is trivially true, and the pool can run dry
without anything being able to say so. It has: four perks offered two at a time
means every card after level 12 is one the child has already taken. And the
uncapped counter feeds the maths — `cdMult = 1 - 0.15 * ranks` reaches **-0.05**
at seven ranks of Quicker Moon, a negative cooldown multiplier that leaves the
special permanently ready. Not reachable by level 21 (the rotation offers
`cooldown` four times in seven picks) but plainly reachable in a long game.
Five perks × 3 ranks is the smallest pool that satisfies the law; the fifth
should not be a damage lever.

**Shard income per region**, counted from the level modules (`markers.breakables`
entries × the `shards = 2` default in js/loot.js, plus `visibleReward` and
`markers.chestDefs` payloads), against the contract's 120-160:

| region | rooms | pots | chests | shards | vs 120-160 |
|---|---|---|---|---|---|
| 1 Ember Hollow | 14 | 47 | 5 | 182 | over by 22 |
| 2 Stoneroot | 17 | 50 | 6 | 234 | **over by 74** |
| 3 Wild Woods | 21 | **0** | 4 | **92** | **under by 28** |
| 4 Frostpeak | 7 | 8 | 9 | 204 | over by 44 |
| 5 Stormreach | 20 | **0** | 7 | 176 | over by 16 |
| 6 Sunken Vale | 20 | **0** | 7 | 182 | over by 22 |

**62 of the 99 live rooms contain no smashable pot.** Levels 3, 5 and 6 never
write `world.markers.breakables` at all — not one, in three whole regions. Pip's
shop line is *"Smash pots and beat shadows for shards"*, the sticker book has a
Pot Smasher at five, and a child who reaches the Wild Woods never smashes
another one. Region 3 is under the contract floor as a direct consequence: its
entire income is four chests.

Two corrections to the contract's own wording, both measured: "pots+chests+
drops" is **two** sources, not three — enemies drop ember hearts, not coins
(`js/enemies.js die()`), and the Den mini-games now pay in score. And every
spawnable enemy family **is** priced in XP_VALUES (9 of 9), so the A9 hole has
not reopened; the table also prices `SkeletonWarrior` and `SkeletonMage`, which
no longer exist.

### QUEUED NEXT (in order)

1. `loadRoom` stores the RAW room id while building the RESOLVED one
   (`state.room = id`, js/main.js), so Frostpeak's `f1` door back to `w5` leaves
   `state.room === 'w5'` with `tgl` on screen. Same family as tonight's item and
   the reason `region_complete` still needs a `resolveRoom` guard.
2. **Pots for Levels 3, 5 and 6** — 62 rooms with no breakable in them, and the
   reason region 3 is under the shard floor. Level design, one region per
   session, against ROOM-STANDARD.
3. Shop tiers 3+ for the Wild Woods, Frostpeak, Stormreach and the Sunken Vale.
   The mechanism from Q2 is general; the bands need prices, so this wants the
   economy pass first.
4. Economy/XP balance pass — **needs the kids. Do not do this overnight.** The
   perk-tier half is law conformance rather than taste and the measurements
   above are ready to build against, but the caps and a fifth perk change what a
   child gets, so dad decides.
5. Hard landscape lock (still best-effort only).

## 2026-08-10 — The branch is settled: `overnight`

Dad's call, asked and answered: **`overnight` is the trunk.** Cut from main, and
from here it is the branch that carries this work. This entry exists because the
question was not cosmetic — it has now cost three builds of the same item.

### Maren's stall has been built three times

| when | where | outcome |
|---|---|---|
| 2026-08-09 12:09 | `claude/ecstatic-hawking-klzrgo` → `overnight` | **Q2, shipped** (25e3027) |
| 2026-08-09 15:23 | `overnight` cut fresh from main | rebuilt, rejected on push, discarded |
| 2026-08-09 ~23:00 | `claude/ecstatic-hawking-fdmjue` | rebuilt a third time, **and pushed** (b07e632) |

The 15:23 run diagnosed this exactly right and wrote the rule — *fetch
`origin/overnight` first* — and then the very next run broke it in a way that
rule did not cover. It was not cutting from main by choice: the harness pinned
it to a fresh `claude/*` branch and told it never to push anywhere else, so it
never had `overnight` in view at all. It read main's documents, found
FIX-PLAN's table all-closed and the newest QUEUED NEXT list to be the v2.2.6
one, whose first non-feel entry is "Maren tier-2 stock after Stoneroot" — and
shipped it, green, with its own `tools/verify-shop.mjs`, having no way to know.

**Any session that starts from main's documents will pick that same item.** That
is the defect, and it is a property of the documents, not of the run. Two things
fix it, and both are now true: the branch is settled here in writing, and the
first act of a run is `git fetch origin overnight && git checkout overnight`,
BEFORE reading SYSTEMS.md — because which branch you read the documents from
decides what work you think exists. If a harness pins a different branch, merge
`overnight` in first or stop; do not read main and proceed.

### What is kept from the third build: none of the code

Its ladder had four rungs (stone / wild / frost) against Q2's two. That is not a
better Q2 — it is **queue item 3** (shop tiers 3+), done early and without the
prices, which the queue says wants the economy pass first. Q2 stands as shipped.

One piece is worth salvaging when item 3 is built: that run's verifier asserts
that a profile which already OWNS a locked-tier weapon keeps it through a real
localStorage round-trip — the tier gate decides what Maren OFFERS, never what a
child HAS. Additive-forever applies to gear, and no current verifier checks it.
The commit is `b07e632` on `claude/ecstatic-hawking-fdmjue`.

### The stray branch is left alone

`claude/ecstatic-hawking-fdmjue` still exists on the remote carrying that third
implementation. It is NOT deleted — deleting a pushed branch is dad's call, not
a run's — but nothing should build on it. If two branches disagree, `overnight`
is right.

## 2026-08-10 — The id stored is the room on screen (queue item 1)

Head of the queue, and the item Q5 explicitly left standing. `buildRoom` has
always resolved retired ids through `RETIRED_ROOMS`; `loadRoom` stored the RAW
one. js/save.js already resolves and says why in a comment — *"so state.room and
the room actually built are the same string — main.js compares room ids in a
dozen places and a mismatch would silently disable those checks"* — and
`loadRoom` was the hole in that invariant.

### It is not a cosmetic string

Frostpeak's `f1` south door targets `w5`, which builds `tgl`. So the same arena
answered to two different names depending on the door a child walked through,
and every id-keyed branch in main.js picked a different answer for each. Walked
both ways and measured:

| arriving in Sylva's Glade | `state.room` | music |
|---|---|---|
| from Frostpeak (`f1` south → `w5`) | `w5` | `boss-loop` |
| by its own door (`tc4` north → `tgl`) | `tgl` | **`region-ember`** |

**The Wild Woods boss arena played Ember Hollow's overworld music by the route a
child actually takes.** Sylva's whole victory branch — `sylva_defeat`, the
Verdant howto, `WS.set('wild','restored')`, `luna_dream_3` — is keyed
`state.room === 'w5'`, so it ran only for a child who had already been to
Frostpeak and walked back down. By the normal route the region fell through to
the Shadowgrip's `else` and Kael was congratulated on freeing Ember Hollow.

### The fix

`loadRoom(rawId)` resolves once at the top and everything downstream — the
build, `state.room`, `state.region`, the checkpoint stamp — uses that one id.
Then the branches that named retired rooms were repointed at the rooms that
exist:

    loadRoom intros   r2 → lb        r3 → le        w5 → tgl
    boss victory                                    w5 → tgl
    updateMusic       boss set: r3/w5/f5 → le/tgl/f5
                      prefix 'w' → 't'   ·   'e' → 'v'   ·   e3 → vz
                      the Kiln is ld/ld1 by id (it lives inside Level 1's
                      'l' prefix, so no prefix rule can find it)
                      r2 → lb
                      ambient table  r1/r2/r3/e1/e2/e3/k1/ka/kb → la/lb/le/
                      vh/vb1/vz/ld/ld1

Every one of those branches had been dead: the rebuilt levels fell past all of
them to the Ember default. Stoneroot now plays `region-stone` again, the Wild
Woods `causeway`, the Kiln `kiln`, and the two reachable wolf-duel arenas the
boss track.

### Judgement calls

- **Scope held at resolution.** Stormreach (`s*`) and the Sunken Vale (`d*`)
  still have no music branch at all and fall through to `region-ember`, and the
  `vz`/`scr`/`ddp` arenas get no boss track. Neither is a retired-id fault —
  those ids resolve to themselves — so both are logged below rather than fixed
  here.
- **The ~25 dead retired-id comparisons are left alone.** The narration and
  stuck-hint blocks in main.js (`state.room === 'r1'`, `'e2'`, `'w1'`, `'k1'`…)
  were reachable only through a raw retired entry and are provably unreachable
  now. Porting that narration onto the rebuilt rooms is a content job with its
  own verification, not a rename — queued.
- **No CONFIG numbers were touched**; this is entirely id plumbing.

### Measured

`tools/verify-roomid.mjs` is new. Nothing in tools/ asked whether a room agrees
with itself: every level verifier walks the door graph, and the graph was always
right — it is what the doors LEFT BEHIND that was wrong. It walks Kael through
f1's real south door and through `tc4`'s real north door (opening the thorn-knot
first, since that door is the conclude step) and compares the two arrivals, then
crosses six more doors out of `tgl`, `la` and `vh` asserting no crossing leaves
an unresolved id. A static pass reads the 20-entry `RETIRED_ROOMS` table out of
state.js and asserts none of those ids is keyed on inside `loadRoom`,
`updateMusic` or the boss-victory chain.

Checked by stashing the fix rather than assumed: **5 of its checks fail against
the old code**, including the two-routes-two-answers row above.

One thing it got wrong first, worth keeping: it read `audio._musicName` and saw
`stone-deep` in a room playing the boss track. `_musicName` is stamped only
after the buffer decodes, which under SwiftShader lands well after the fade. The
branch chosen is the thing under test, so it reads `_wantMusic.name`, which
`playMusic` sets synchronously on entry.

`verify-all.sh verify-roomid verify-completion verify-progression`: 5 passed,
0 failed.

### AWAITING dad's call

Nothing needs approving — this restores behaviour the game already intended, and
the one audible change (the right music in three regions) is what the code was
always asking for.

### QUEUED NEXT (in order)

1. **Pots for Levels 3, 5 and 6** — 62 of 99 rooms hold no breakable, three
   whole regions never write `markers.breakables`, and it is why region 3 sits
   under the shard floor at 92. Level design, one region per session, against
   ROOM-STANDARD.
2. **Music and ambience for Stormreach and the Sunken Vale.** `updateMusic` has
   no branch for `s*` or `d*`, so both regions play `region-ember`, and the
   `vz`, `scr` and `ddp` boss arenas play no boss track. Measured this session.
3. **Port the retired-room narration onto the rebuilt rooms.** ~25 comparisons
   in main.js against `r1`/`r2`/`e1`/`e2`/`w1`…/`k1` are now provably dead: the
   pup hints, the dark-cave line, the Kiln lines, the Wild Woods stuck hints.
   Each needs a live room id and a marker that room really publishes — the shape
   Q5 used.
4. Shop tiers 3+ for the Wild Woods, Frostpeak, Stormreach and the Sunken Vale.
   The mechanism from Q2 is general; the bands need prices, so this wants the
   economy pass first. Salvage the owned-gear-survives-the-gate assertion from
   `b07e632` when it is built.
5. Economy/XP balance pass — **needs the kids. Do not do this overnight.**
6. Hard landscape lock (still best-effort only).


---

## 2026-08-10 (overnight) — the game had eighteen green suites and an unreachable boss

Dad reported it from play: *"There is no boss fight available in level one. I
searched every room and there's nothing. You come to a complete impasse."* He was
exactly right, and every suite in the repo was green while he said it.

**The Forge Heart — the Kiln's own hero prop — is a 5.2-radius solid at (0, -8).
The north wall's inner face is at z = -12.5, so at the wall it still covers
x ±3.2, and a doorway is 2.4u wide.** The gap was sealed. The only route to the
Shadowgrip, and so into the rest of the game, was behind it. Coming back was
wrong too: lg4's south door dropped the player at (0, -10), inside the forge.

Shipped as **v3.44.1**. The door moved to x = -6 and the worn path bends around
the forge — which reads better than the original: you come up the Hollow, the
great forge fills the way ahead, and you go round it.

### Why nothing caught it, which is the more important half

`verify-level1` proved every room BUILDS and that the door GRAPH has no dead
ends. `verify-route`, written the same morning, walked the spine but PLACED the
player on each door trigger — teleporting straight through the collider that was
the bug. **Graph connectivity is not physical reachability**, and the gap between
them is exactly where a progression blocker lives.

`verify-all.sh` also ran three of thirty-two suites.

### What was built overnight (dev branch, NOT shipped)

Fifteen commits on `claude/wolfknight-reassemble-extract-5p9m8b`:

1. **`verify-reachable.mjs`** — flood-fills the walkable floor of all 108 rooms
   and asserts every doorway has floor a player can reach. 218 doors. Three are
   shut by design and named with reasons.
2. **`verify-playthrough.mjs`** — walks the game with REAL input (`input.move`,
   the field the joystick writes), never placing the player. All seven regions.
3. **Wayfinding, in three layers, all of which were dead.** `settings.easy` was
   not in the defaults, so Pip's stuck-guide has never run for anyone;
   `guideTarget()` named only RETIRED rooms, so five of seven regions had no
   target; and sixteen teaching-line triggers keyed on demolished rooms.
   `js/route.js` answers "which room is next" and asks the room where that door
   is, so moving a door moves the guide.
4. **Stuck hints rebuilt on promise markers** — thirteen gates across six
   regions, one rule instead of a list of room ids that rotted twice.
5. **Pots in levels 3, 5, 6 and 7**, which had none. `potSpots()` places them.
6. **The `suspicious` awareness state**, declared since region 7 was written and
   never entered — and `eyeMat` was never assigned anywhere, so the awareness
   pose has never been visible at all.
7. **Grimm's five missing taunts** (the bible says once per region; only the
   first was ever written) and Luna's missing count after Stoneroot.
8. **`verify-all.sh` runs all 32 suites** and fails if a suite exists that it
   does not run.

New suites: reachable, playthrough, route, guide, awareness, story-beats.

### AWAITING dad — two things

**Shipping.** Fifteen commits are unshipped. The rule is reachable + playthrough
+ boot + density green before main. Reachable, boot and density are green.
The playthrough reports NO FAILURES BUT NOT A CLEAN RUN — see below. That is a
judgement call, so it was left rather than reinterpreted at 4am.

**Grimm's five new taunts are the only words a child will hear that were written
overnight.** Tone is dad's call, not mine. They are five lines, easy to change.

### The caveat, stated plainly

`s1a → s1b` — Stormreach's landing — **is not walked by the harness.** Kael
slides along the rocks east of the spawn (the movement code doing its job) and
ends up beside a pot with the route's waypoints behind him. Re-planning,
sidestepping and a wider arrival radius all failed. **Four diagnoses were wrong**
before it was instrumented properly.

What IS established: `verify-reachable`'s flood fill reaches that doorway, and
driving Kael east BY HAND from the exact stuck point walks him clean across the
room. **The route is open; the follower is too simple for that one room.** It is
listed by name in `CANNOT_WALK` with its evidence, the run says how many legs
went untested because of it (13), and it no longer prints ALL CLEAN when it
skipped something — a suite that reports a clean run it did not have is how this
whole night started.

### The final gate, with real numbers

`verify-playthrough.mjs`, full run, after the final-stride fix:

    60 legs walked, 0 failures, 1 leg this harness cannot walk.

Ember Hollow (8), Stoneroot (16, three spokes and a hub that opens a stage at a
time), the Wild Woods (14), Frostpeak (4), the Sunken Vale (14) and the Shadow
Court (4) all walk end to end.

**Stormreach walks NOTHING.** Its unwalkable leg is its FIRST one — s1a → s1b —
so the run stops there and the other thirteen legs go untested. That is the
worst-covered region in the game and it is also one of the three that no child
has ever played. `verify-reachable` covers its doors geometrically and every
other suite covers it, but the walk does not, and it should not be described as
if it does.

### Still unverified by a human

Everything. No child has played any of it. The wayfinding, the awareness window,
the taunts and the pots have been measured, not watched. **A playtest would tell
us more than the next ten items on the queue.**


---

## The Moonlit Spire, and the Elemental Wolf (2026-08-29)

Dad, after playing: *"I want to add another level at the end. You get the
'Elemental wolf' essentially the avatar of the wolves. He's an overpowered
wolf with the ranged attack randomly alternating. New animations for their
attacks and the wolf has all the elements swirling around in. Add this as the
last thing you build."* And, separately: *"Currently there is no reason to use
the jump button either. It doesn't dodge attacks, nowhere requires the user to
jump over anything."*

Both are one item, because the second one needed somewhere to live.

### The form

**New animations, without inventing a frame.** `assets/chars/wolf.gltf` ships
twelve clips and the game had only ever used seven. `Jump_ToIdle` (a rearing
recovery) and `Idle_HitReact1` (a whipping recoil) are real, rigged, unused
clips — so the Elemental Wolf's bite and its ranged throw look like nothing
else in the game and nothing was built in code. That is the same rule the
models follow, applied to animation.

**The swirl is seven elements, not one aura.** Each orbiter is the element's
own shape in its own colour — the Fire Wolf's flame, the Earth Wolf's chip,
Sylva's leaf, Boreal's icicle, Aria's bolt, Meri's droplet, Luna's ring — on
seven orbits, each tilted by its own angle so the paths braid rather than
reading as one hoop. A child who has played this far can name all seven going
past. One light cycles through their hues underneath.

**The ranged attack rolls, it does not invent.** Six shipped projectile kinds,
one picked per throw, never the same twice running. Every existing weakness
reaction, every hit puff and every enemy resist comes free; a seventh bolt type
would have needed all of that written again.

**The ELEMENT STORM** strikes each enemy with the element it is *weak* to, and
fires every wolf's world-verb at once (quench, crack, cut, burn). Unashamedly
overpowered — dad asked for overpowered — and safe to be, because it is granted
after Grimm is beaten and the Village is restored. There is no difficulty curve
left to protect.

### The level

Four rooms behind the `m` prefix, in Ember's own kit re-tinted cold: a tower is
made of the same masonry a ruin is, and nothing new was vendored for four
rooms. `m1` the broken ascent, `m2` the hall of sigils, `ma`/`mb` two trials,
`m3` the crown. It opens on the Square once every Village guardian is down.

**The jump button gets its reason in `m1`.** The stair fell; three pieces of it
still stand over a void that spans the room wall to wall, so going round is not
available and the button stops being decoration. The gaps are 1.8u, 1.8u and
1.6u against ~3.0u of carry at the SLOWEST form's speed — 40% margin at the
worst case. It could not honestly have been retrofitted into a verified room:
Level 2's own comment says *"this is a SEEING puzzle, not a platforming one,
and a five-year-old must never fail it for being half a unit off."* And the
cost of a miss was already solved and already gentle — `world.pitAt` puts a
child back on the near shore and takes nothing (`A HOLE IN THE FLOOR COSTS THE
WALK, NOT A HEART`). `world.pitReturn` is set to the shore, three steps back,
not the door.

### What playing it caught

`tools/run-spire.mjs` walks the whole level through real key events. It found
three things reading the source would not have:

1. **The Trial of Stone's first layout was a trap.** The block sat west of the
   plate and wanted an eastward push — and the walk in from the east door
   leaned on its east face the whole way, shoving it two steps *away* from the
   plate before the plate had been seen.
2. **Flipped round, an approach half a metre off the lane pushed it sideways**,
   because a lean picks the cardinal direction of greatest offset.
3. **Walling the lane into a corridor fixed (2) and caused something worse:**
   once the wolf was west of the block inside a corridor it could not squeeze
   back past it, and the room was dead until the child left and came back.

What shipped is the open room with the shortest push in the game — two steps,
block between the door and the plate, floor open all round. A mis-push is
always recoverable (the 1.2u step grid means one shove puts a knocked-aside
block exactly back on the lane) and re-entering rebuilds it where it started.
**Making the room impossible to get wrong was worth less than making it
impossible to get stuck.**

Also caught, and fixed: `refreshBadge()` reads `FORM_META` unguarded and threw
on the very first switch to a form that was not in the table.

---

## The night of the audit, and the door that opens where you stand (2026-08-29 → 30)

The overnight board (A: debt, B: look, C: feel/close) is done. What shipped,
v3.72.0 → v3.74.1:

### The look (B)

All 137 rooms were screenshotted at their arrival frame and reviewed by eye.
The game held up better than expected — Stormreach is the strongest region in
the game — and the audit came back with exactly three real offenders, all
fixed:

- **t1p/t3p**: a grove planted across the camera's sight line filled the whole
  arrival frame with canopy. `world.reserve('cameraLane')` now holds the
  spawn's sight line clear before dressing; grove() already asked blocked()
  per trunk, so the fix was one reserved circle, not a new system.
- **lc**: the lava channel was a bare emissive plane — a flat orange
  rectangle. It wears a drifting canvas crust now, same single draw call.
- **m1/m3**: the Spire's void gradient had been invisible under pit()'s own
  black lid at +0.05 all along (two re-shots to find), and the crown's seven
  gems were three pixels of dark octahedron. The gradient sits above the lid
  now; the gems are bigger, hotter, and each pours a pool of its element's
  light on the stone. verify-spire + run-spire green on the result.

### The sound (B3)

Six regions have their own music — Superpowers Medieval Fantasy themes, CC0,
licence file on disk, the first formally-licensed music in the game. Cast by
decoded-audio character, then stormreach↔shadowcourt swapped on the numbers
(the storm deserved the busier theme), and MUSIC_TRIM levels the unmastered
files against each other (sunkenvale sat ~14 dB under spire). **Dad's ear has
final cut on all of it** — re-casting is one file copy per region.

### The feel (C)

- A real Space press lands with an ash puff and a soft thump (probe-verified
  through the actual key path).
- The Elemental Wolf announces itself in all seven colours (probe-verified).
- **The walker learned to look**: s1a→s1b — the one leg the playthrough
  harness could never walk — walks now, via hand-laid via points drawn from
  an ASCII solidity map of the room. Stormreach's fourteen legs are walked
  for the first time, and CANNOT_WALK is empty.

### The door that opens where you stand (dad's request, next morning)

*"Is it possible that at the end of the boss fight the door to the next level
opens without having to walk out the room and back again? could we do a smoke
poof animation and have it appear?"*

Three arenas rebuild-gated their onward door: f5 (Boreal → Stormreach), scr
(Aria → the Vale), ddp (Meri → the Court). Each now cuts the gap at build
time and plugs it with region rocks (levelkit `onwardPlug`); the kill removes
plug + collider and adds the door trigger in the live room, a beat and a half
later — shard shower first, then the poof, then the door is simply there.
The countdown runs on game time via the arena's animate list, because
headless verification caught wall-clock setTimeout firing a different subset
of rooms per run (throttled page timers).

Verified by the real fight suites (bolts, dodges, shield timing, 1x): all
three report "the way on opened IN PLACE: true", each with a screenshot.

What the verification dug up along the way, all fixed:

- fight-aria/meri had never received EITHER half of task #32's lesson
  (gates-settling wait, past-the-centre door aiming) — their historic passes
  at 4x were momentum and luck.
- **ddp's throne ring stood a column at (0, ±9.8) — dead centre of both
  doorway lanes.** Harmless while the north door only existed on a rebuild;
  the moment the door opened live, the child's first walk to it met a column
  square in the lane. The telemetry tell was symmetry: the walker stalled at
  |z| 8.4 in both directions. The ring is rotated 22.5°; same crown, clear
  lanes. (v3.74.1)

### Still true in the morning

No human has played the Spire, Stormreach's full walk is new, and the music
casting is a blind man describing colours. **A playtest tells us more than
the next ten queue items.**

### The sweep's verdicts (added at dawn)

The closing `verify-all --par` sweep, plus the seven suites the rot guard
caught (shipped with their features, never added to the sweep list — so no
nightly run had ever executed them): **every suite in tools/ now holds a
green serial verdict from tonight, a first for the project.** Getting there
surfaced three real defects, every one of them in ground the test net had
only just grown eyes on, all fixed and shipped:

- **f3→f2 and f4→f3 landed a child inside a shut frost gate's keep-out**
  (pushed 0.47u on arrival). The landing sweep measured 226 landings before
  the legacy rooms joined the registry, 285 after — the first sweep that
  could see Frostpeak's landings failed them. Moved clear. (v3.74.2)
- **f1's crossing was free**: both hounds stood 4u off the 13u sprint line
  and a blind dash crossed in 2.6s untouched — against the gauntlet law.
  The hounds now bracket the line; the sprint costs half a heart, a weaving
  child still gets through clean. (v3.74.3)
- **Half the coins got two hops, not "a few"**: run the bounce numbers on
  the shipped restitution/cutoff pair and coins launched at vy 3 settled
  after two hops. verify-smash guarded the promise and caught it the first
  night it ever ran. Every coin hops three times now. (v3.74.4)

## 2026-08-31 — Replay batch 2 verified and shipped (v3.76.0)

Dad's second replay batch, item by item, this time with the measurements
attached (the batch's own lesson: say what was measured, not what was hoped).

- **The infinite-shard mint is dead, live-verified.** Standing on the lg3
  socket performs exactly one action per visit (hysteresis: you must step
  out of the circle before it acts again) and the ember-seal bonus pays
  once per save. Probe: 240 frames standing still = one fill, zero payout
  repeats.
- **Breakables were never empty** — measured 6 smashes, coins spawned every
  time (2,2,1,3,1,2) and all 11 collectable. What dad saw was the payout
  being invisible: head-height arcs + instant magnet. Coins are now
  cartoon-big, arc at chest height, and audibly triple-bounce.
- **Dragonling vs shield, live-verified through the real input path**: hold
  the shield as it dives and it crashes, lies floored for ~2.4s, and takes
  melee hits while down.
- **"Objects outside in the black" was three real bugs.** (1) coldHearth had
  two coordinate frames, both wrong: lone hearths all drew at the room
  ORIGIN (stacking into the "weird floating rock structure"), and hearths
  nested in ruined homes DOUBLED their coordinates, throwing stone rings
  past the walls. One function, both of dad's screenshots. (2) The la1 dodo
  is a skinned mesh whose bind-space bounds lie about where it renders — it
  stood 2.2u past the south wall; recentred by the measured offset.
  (3) la's ash-nook alcove (screen wall + chest) read as "a random wall and
  chest" — removed at dad's order; the l1_ash_nook save flag stays honoured.
  The out-of-bounds probe now sweeps clean on la/la1/lb/lg1/lg4/ld1.
- **Skeleton animation: could not reproduce, and now permanently guarded.**
  Every skeleton-family class in Ember and the Village measured with moving
  leg bones (quaternion deltas 0.14-0.27 vs 0.000 for a frozen mesh), with
  rendered-pixel confirmation for the wretch and the marauder. Clip names,
  bone names, skin joints and all 32 generated bodies audit clean. New
  suite `verify-motion.mjs` (in the sweep list) fails if any rigged enemy
  ever glides in bind pose. If dad still sees it: suspect his phone's
  service-worker cache mid-upgrade — a full reload should tell us.
- Chests/barrels/crates ~15% smaller, boulders 2.5x, every chest pop is a
  real model (potion mesh, heart piece, shield badge, key, sword) — zero
  emoji anywhere in loot.

Post-mortem for "work out what went wrong": the suites verified promises,
never abuse, never motion, never geometry against the shell; "all green"
was reported as "debugged" with more confidence than the coverage earned.
verify-motion.mjs is the first structural fix; the out-of-bounds probe is
next in line for promotion to a suite.

## The night dad went to bed — the Armoury, and a coin that never paid (2026-08-31, v3.77.0 → v3.78.1)

Dad's brief, at bedtime: *"I'm putting you on autopilot while I sleep. keep
going until you finish everything or I tell you to stop... also the backpack
changed and the whole equipping thing changed, it feels too kindergarten. it
should feel adventure game. even have it come up like split screen and have
the character on one side slowly rotating... and if you pick up a red axe, it
has to be a red axe in the player's hand when equipped."*

**The three mechanics he asked for already worked.** Before touching anything,
`scratchpad/gearid.mjs` measured the whole gear system through the real
equip path: every weapon mounts its own file to the hand bone, every tint
lands, all six armours recolour the plate. A red axe *was* a red axe in his
hand. What was NOT true was the **screen**: the backpack drew each item as an
emoji, so the Cinder Axe — a real red axe in the world and in his hand — was
a 🔥 in the bag. That reframed the whole job, and it is the one screen where
"the thing is the thing" was false.

**The Armoury** (`js/equipscene.js`, new). A split layout: the knight on the
left turning on the spot on a plinth, racks of real gear on the right, and
tapping a piece changes him in front of you. Two renderers, split by cost —
`itemThumb()` renders one still frame of a model through the game's OWN
renderer into a cached PNG (thirty items must not cost thirty live scenes),
while `EquipPreview` owns one small second context for the only thing that
has to move. Indexed in SYSTEMS.md.

Three things that cost real time and are worth remembering:

- **A WebGLRenderer is welded to its canvas.** The preview worked on first
  open and was dead on every reopen, because `renderInventory()` built a
  fresh `<canvas>` each time while the renderer stayed bound to the first.
  Found by testing the REOPEN path, not the first open. The canvas is kept
  and re-parented now, and `verify-armoury.mjs` opens it three times.
- **`buildPotionMesh()` returns `{ group, liquid }`, not an Object3D.** I
  passed the record where a group was wanted and it threw — then found the
  same mistake in SHIPPED code at `giveLoot()`, where `pm.scale.setScalar()`
  threw and **killed the rest of the function**. Any chest holding a potion
  AND anything else silently dropped everything after the potion. Verified
  fixed with a chest holding potion + gear + armour + heart + key: all five
  delivered, eight pops, no page errors.
- **Armour was popping `shield_badge.gltf`**, so finding Kiln Plate looked
  exactly like finding a shield. Dad's rule cuts both ways: if a tower shield
  must be a tower shield, armour must not pretend to be one. It pops a jewel
  in the armour's own colour now (measured: mesh `jewel_1`, material
  `#d8763a`, toast "Kiln Plate").

**The HUD stopped speaking emoji.** The potion slot was a science-lab test
tube, the shard counter an orange lozenge, the pup counter an emoji wolf
face — three art styles for three things that exist as models three feet away
in the world. All three now render through the Armoury's own trick. A wolf is
not a sword, though: the default weapon framing turned the pup into a smudge,
and picking an angle from a 110px comparison strip fooled me into choosing
one that reads as a lump at the size a child actually sees. Re-rendered at
38px, 0.75π stood clear. `renderThumb()` grew an optional pose, and now frames
the model AFTER posing it rather than before — which had been quietly
mis-framing every tilted thumbnail since it shipped.

**A pushed boulder makes a noise.** Kenney Foley, one grind per slide and one
settle per stop. The first attempt fired on shove-START and played 42 times
for a three-step push, because a blocked step ends instantly and the lean
re-attempts about seven times a second against a wall. It fires on the first
actual movement now: three steps, three grinds, three settles.

**And the one that matters most — a coin that bounces forever never pays.**
`verify-loot` had been failing for weeks and had been written off as
pre-existing. It was telling the truth. Traced: four coins from one pot,
three still bouncing after 25 seconds, hops 21 and climbing, `settled` still
false. The settle test was speed-only (`vy < 0.7`) and that is **frame-rate
dependent** — gravity adds `12*dt` to the fall each frame, so on a slow frame
(dt clamped at 0.05, i.e. any device under ~20fps) the bounce converges on a
limit cycle at vy ≈ 0.77, permanently just above the threshold. `settled`
gates the pull that walks a coin to the player, so a coin that never settles
is never pulled, and unless the child steps within 0.45u of it its 25-second
life runs out and it is **deleted without paying**. They watch a coin come
out of a pot and get nothing — on exactly the cheap tablets this game is for,
because it takes a slow frame to trigger. Fixed with a hop cap (frame-rate
independent, and what the comment above it already promised) plus a pull
radius of 3.2, because the outermost coin of a four-coin scatter settles at
2.22u — a hand's width outside the old 2.2.

Two suites were also lying, and both now say what they mean:

- `verify-touch` measured button geometry 1200ms after triggering a reveal
  animation that scales buttons to 1.3x. Enough on an idle machine, not
  enough on a loaded one — it false-failed on "btn-attack overlaps
  form-badge" (a 60px badge caught mid-reveal reporting 80px) and passed on
  the re-run. It waits for the geometry to STOP MOVING now.
- `verify-loot`'s coin probe never cleared `narration.blocking`, and a story
  hint freezes the world — so whether a Pip line happened to be up decided
  whether the check passed. That is why the same code read "left 4, gained 0"
  one run and "left 2, gained 2" the next. It holds narration open now, and
  gained a check that asserts the property directly: no coin may bounce more
  than six times or end unsettled.

**Deliberately not done, and why.** The remaining emoji are in the form badge
and picker, the perk/sticker/mystery cards and the level-select labels. Every
one of them is a pictogram for an ABSTRACT concept — fire, ice, a lock, a map
— and there is no model in any vendored pack to substitute. Kenney Game Icons
(checked, 425 icons) is a UI-control set: buttons, arrows, gamepad glyphs, no
elements and no creatures. Swapping the ten form badges for ten tinted wolves
would make them all the same shape and LOSE the element information a
non-reader depends on. Where an emoji stands in for something the game
already models, it is now gone; where it is genuinely the best pictogram
available, it stays. Dad's call if he disagrees.

---

## The five weapons that were in the game and not in the world (2026-09-01)

`verify-gear` failed the post-ship sweep on v3.83.0 with one line:

```
✗ no item is unobtainable — all are bought, found, or start on you
  {"unreachable":["sword_legion","spear_legion","cleaver_orc","staff_bone",
                  "shield_iron"],"total":33}
```

All five had been verified the day before — they load, they mount in the right
hand, the gauges read correctly, the Armoury shows Kael holding the cleaver. What
was never checked is the only question a child would ever ask: **where is it?**
They were in `WEAPONS`/`SHIELDS`, in no chest, and in no shop line. A weapon
nobody can pick up is a table entry, not a weapon, and "it equips" is not the
same claim as "it exists in the game".

They are spoil by design, not stock, so the fix is chests — and the five
foreshadowed **promise gates** are exactly the right five chests. Each of those
gates shows a child a reward through a barrier they cannot pass yet, and until
now every one of them paid out in coins alone. A remembered place that pays a
handful of coins on the return trip teaches that remembering is not worth much.

| gate | room | opens with | prize | chest |
|---|---|---|---|---|
| `l1_crack_gate` | `la` | Stoneroot's crack | Legion Blade 190 | wood |
| `l1_scorched_gate` | `lb2` | fire | Iron Wall 300 | gold |
| `l2_va1_a` (cracked pile) | `va1` | Stoneroot's crack | Bonecap Staff 260 | silver |
| `l2_bramble_gate` | `vc2` | Wild Woods' cut | Legion Pike 240 | silver |
| `d3b_ghost` | `d3b` | the Shadow Court's dark | Iron Cleaver 350 | gold |

**Chest tier now tracks the prize's worth** — wood under 220, silver under 300,
gold above. That is the only signal a non-reader gets about what is behind a
gate before they cross it, and it costs nothing: the chest kit already ships all
three. `verify-density` re-measured afterwards (worst room `lb`, 123 of 125), so
the two new gold chests fit inside the draw budget.

Verified by real play, not by re-reading the tables: a probe set each gate's own
already-opened flag (`promiseGate()` then builds no geometry at all, exactly as
it does on a return visit), walked the player into each alcove on real WASD
events, and read the bag afterwards. Five for five, no page errors.

### ...and two of them were the wrong size (same day)

Measuring the five in the real hand to check they looked like their prices
turned up something else: two models contradicted the stat they carry.

```
spear_a       1.55u   range 2.7
spear_legion  0.83u   range 3.0   ← longest reach in the game, shortest polearm
shield_c      0.71u   blunt 0.25
shield_iron   0.60u   blunt 0.20  ← best block in the game, smallest shield
```

Reach is the one weapon stat a child can read off the geometry, and size is
the one thing that says "tower shield". Both were saying the opposite. New
opt-in `scale` field on the item def, honoured in the two places gear mounts
at true size — `player.equipGear()` and the Armoury's live preview (the
thumbnails auto-frame, so they neither need it nor notice it). The pike goes
to 1.66u and is now the longest thing Kael can hold; the Iron Wall goes to
0.83u and is now the biggest shield. From the game camera the pike was
previously invisible behind him and now reads as a polearm.

**`sword_legion` (0.64u) and `cleaver_orc` (0.52u) were deliberately left
alone.** The tempting rule — heavier weapon, bigger model — is not a rule this
game has: `hammer_a` ships at 0.61u with the highest damage in the game (3.0).
Small-and-heavy is an established look in this art, so those two are inside
the range the game already ships and nothing they advertise disagrees with
their geometry. `scale` is for contradictions, not for taste.

---

## The skeletons walking with their legs in the floor (2026-09-02)

Dad, on Level 1's Ember Wretches: *"the skeletons is animated but his legs are
partially in the ground."* Right on both counts, and it was two bugs, not one.

Measured on a woken minion, lowest foot BONE against a floor at y=0 — with Kael
standing on the same floor in the same frame as the control:

```
la   Ember Wretch   -0.0384        Kael  +0.0082
la1  Cinder Imp     -0.0685        Kael  +0.0034
```

**Both bugs hid behind the same three.js quirk.** `AnimationAction.isRunning()`
is `enabled && !paused && ...`, so it answers FALSE for a paused action AND for
a finished `LoopOnce` clamped at its last frame — while both of those still
pose the rig at **weight 1**. Every debug dump of "what is running on this
skeleton" said "only the walk"; the mixer's own `_actions` list showed a second
clip sitting beside it at full weight.

1. **The sleeping pose was paused, never retired.** `inactive` is played and
   paused so a sleeping skeleton holds its bone-pile pose, and `_current` was
   left `null` — so the first `_play()` found no outgoing action and skipped
   its `crossFadeTo`. Every skeleton then walked, idled and punched with
   `Skeletons_Inactive_Floor_Pose` — *a body lying flat on the ground* — mixed
   in at weight 1 for the rest of its life. That is the legs in the floor.
2. **Twelve attack states end with `_current = null`** to push the next
   `_play('walk')` past its own early-return. Same skipped crossfade, so every
   finished lunge stayed clamped at weight 1 on top of everything after it.

Fixed centrally in `_play` rather than at twelve call sites: a null `_current`
now fades out every action of ours that still has weight and fades the new clip
in against it, so a null `_current` means the same thing as a named one.

**And a second, independent fault in the same area.** `awakenTime` — how long a
skeleton stays in the get-up state before it may chase — is hardcoded per
subclass, and two of the four were SHORTER than the clip they were waiting on:

```
SkeletonMinion  Skeletons_Awaken_Floor     2.30s clip, awakenTime 1.9   0.4s short
SkeletonShield  Skeletons_Awaken_Floor     2.30s clip, awakenTime 1.9   0.4s short
SkeletonRogue   Skeletons_Awaken_Standing  1.00s clip, awakenTime 1.1   fine
BoneWarden      Skeletons_Awaken_Standing  1.00s clip, awakenTime 1.3   fine
```

Exactly the two that rise OUT OF THE FLOOR were short, which is not a
coincidence: the floor clip is the only one a skeleton plays that spends time
below y=0 (lowest toe -0.044; walk, idle and the punch are all positive). The
clip's own duration is the floor now, so the number cannot drift from the asset
again; a subclass value still wins where it is longer, which is what the two
standing wakers use for their telegraph.

Result, same measurement: `la` **+0.0099**, `la1` **+0.0100**, `vb2` -0.0016 —
all at or above Kael's own worst.

**A method note worth keeping.** `Box3.setFromObject` reads a SkinnedMesh's
BIND pose and cannot see an animation at all, so the first three measurements
of this bug were meaningless — one of them reported the floor pose and the walk
cycle as identical. Bone world positions are the only honest answer for a
skinned character, and `tools/verify-footing.mjs` uses them: it wakes each
skeleton class through real key presses and watches the lowest foot bone from
asleep into the settled chase. Kael is its control, and the tolerance is 5mm on
a body 1.08 units tall — under a pixel at any zoom a child plays at.

---

## Two packs, and a pack that turned out to be one we already had (2026-09-02)

Ten packs arrived. Three of them (craftpix's desert mountains, winter mountains
and shields) ship only a link to `craftpix.net/file-licenses`, which forbids
redistributing the asset files — and this repo is PUBLIC, so every `.glb` in it
is directly downloadable. Dad's call, asked and answered: leave those three out.

### The weapons pack was already vendored

The KayKit Fantasy Weapons Bits upload turned out to be the pack the game has
been using since the beginning. Not "similar" — `cmp` says the gltf files are
**byte-identical** to the ones in `assets/gear`, and the atlas beside them is
the same `weapons_bits_texture.png`. So there was no style match to judge and
no licence to trace: the CC0 claim in MANIFEST.json already covers
`assets/gear`. What the upload actually offered was the thirteen pieces the
game never took.

Nine of those were left on the floor, because they repeat a silhouette the game
already owns — another axe, another dagger, another sword. More rows in the
Armoury, no new information for a child who reads a weapon by its shape. Four
were shapes the game did not have:

- **Warden's Halberd** (330) — fills the hole between the Legion Pike (reach,
  little damage) and the Iron Cleaver (damage, no reach).
- **Bearded Axe** (210) and **Bell Maul** (380) — distinct heads, sold by Maren.
- **bow_A_withString** and **wand_A** — not player gear at all. Every ranged
  class in `enemies.js` shot **from empty hands**, so a child watching a fight
  could not tell who was about to shoot at them from who was about to run at
  them — the single most important thing to read in a room. Archers
  (`wraith-archer`, `thornstalker`, `quiverbones`) now hold a bow; the caster
  (`stormcaller`) holds a wand. Deliberately opposite silhouettes: long-and-low
  reads as "shoots", short-and-high as "throws magic". Verified on four real
  spawns across four rooms — a 700-triangle mesh under `_handL` at 1.0 span on
  a 1.34 body.

**A suite hole, found the hard way.** The three weapons were pasted against a
`shield_iron:` anchor and landed in the SHIELDS registry. `verify-gear` stayed
green through all of it — they equipped, they mounted, they counted as
obtainable — because it only ever asked "does something with this id exist".
Maren's shelf asks `WEAPONS[id]`, got undefined, and silently dropped all three;
only `verify-shop` noticed. `verify-gear` now also asserts that a stock line's
`kind` matches the registry the item actually lives in.

### The props pack, and 12.3MB of the same image

RG Poly's Small Props Pack (CC0) is a workshop-and-yard set — carts, troughs,
washing, firewood, a practice target, an armour mannequin. That is exactly the
Village's gap: a restored village of huts and walls and nothing people OWN
reads as a model of a village rather than a place someone came back to. Twenty-
one picked out of 115, one per family, biased to the ones that say somebody
lives here.

They arrived at **12.3MB for 13,000 triangles**. The geometry was never the
problem — `Cart_1_A` is 2,828 triangles, right next to this project's own
`campfire.glb` at 264 — the problem is that every prop embedded its own copy of
the pack's ONE 541KB atlas. Twenty-one copies, verified byte-identical by
sha256. `tools/deduct-atlas.mjs` lifts the atlas out once and repoints each GLB
at it by URI, which is how the KayKit gear next door has always named
`weapons_bits_texture.png`: **1.5MB for the same pixels and the same geometry.**

That fixes a rendering cost too, but only with a second step. `loadGLB` caches
per FILE, so twenty-one GLBs naming one PNG still build twenty-one
`THREE.Texture` objects — and `tintedModel` keys its material cache on
`map.uuid`, so that is twenty-one materials `flattenStatic` can never merge.
The new `shareTexture()` in levelkit points them all at one object. Measured in
the built square: a single `kit_Atlas 1` material, and the whole village's
clutter is one batched draw call. Rooms sit at 46-57 of the 125 budget.

**And every prop is grounded by construction.** `centre: true` fixes the X/Z
pivot problem this file already had a scar from (Vase.glb), but says nothing
about Y — and this pack contains props modelled to HANG from a hook, whose
geometry sits entirely below their origin. Placed at y=0 the rope coil and the
drying skin measured **1.77u under the floor**, buried whole and invisible.
`clutter()` now measures each placed group and lifts it until its lowest point
rests on the ground, so no future addition can be buried by an authoring
convention nobody checked. Lowest prop in all seven dressed rooms: exactly 0.

### ...and two of them in the Den (same day)

Maren sells weapons and armour at (5.9, -3.7) and the Den had nothing beside
her that said so. An armour stand and a straw target now flank her counter —
a child who cannot read the sign can still see what lives there.

Budget, written down because it is tight: those two took the Den's worst case
from 131 to **133 draw calls against its 135 ceiling**. Each prop is its own
geometry, so each is its own instanced call however much material they share.
Two spare, in a room that measured 170 the day it was rebuilt at 24x18. If
anything else has to go in there, the practice target is the one to drop — the
armour stand is the stronger signal, standing next to a shop that sells armour.
Both sit at exactly y=0.

### verify-grounded caught the three that were hung, and was right

The first Village pass HUNG two props — the rope coil at 1.6u and the drying
skin at 1.2u — on the reasoning that they are modelled to hang from a hook.
`verify-grounded` failed three rooms for it immediately (`yhs`, `ylw`, `yg4`;
worst offender `Rope_1_A`, gap 1.6 on a 1.77u prop).

It was right, and the tempting fix was the wrong one. That suite carries an
ALLOWED list for things meant to be off the ground — `banner|torch|cobweb|
flame|…` — and adding `rope|skinhang` to it would have made the red go away
without making the village any better. **Nothing in this game hangs from
nothing.** A coil floating 1.6u up with no peg under it is the same defect dad
reported as "floating rocks" in Ember Hollow, which is the reason that suite
exists at all. Both are on the floor now: a coil of rope on the ground and a
hide stretched on its own frame read fine, and the check keeps its teeth.
`base` above 0 stays in `clutter()` for a prop hung on something that is
actually there.

Then it caught a twenty-first thing, and the answer there was to drop the prop.
`Pitchfork_A` is **two separate top-level objects** — a head and a shaft — that
only make sense assembled, and assembled the shaft starts 0.42u off the ground
with the head beneath it. `clutter()` grounds the group it places, so the
assembly sits on the floor correctly; `verify-grounded` reads each top-level
object on its own and sees a shaft hanging in the air. Special-casing one prop
inside a suite that exists to catch exactly that shape of thing would have been
the wrong trade for a prop no street needs, so it is simply not placed. Twenty
props, not twenty-one.

---

## EMBER DEEP — the burn branch under the Kiln (2026-09-02)

Dad picked it off a shortlist, and the reason he gave for scrapping the level
alongside it is the more useful half: **post-game content is the wrong target —
the kids are not finishing the game yet.** That is now a standing rule in
design/LEVEL-DESIGN-BRANCHES.md: build where the players actually are. Ember
Deep is Level 1. They will walk into it.

**Why it exists, measured rather than felt.** Counting promise gates across
every level file: `crack` 4, `shatter` 3, `burn` 2, `cut` 2. Fire is the FIRST
wolf a child earns and it gates two things in the whole game. The Kiln taught
burning — introduce, then develop — and the game then stopped asking.

Three rooms west off the Kiln, the one wall that room had left:

```
lk1  THE UNDERSTAIR   pocket   the road is GROWN OVER — burn west, + a secret
lk2  THE CHARRED SPAN island   the floor is gone; two burnable nooks
lk3  THE BANKED FIRE  pocket   a cold hearth, five lamps, gold
```

**The idea is fire as WALKING, not fire as a key**, and that came out of reading
the room next door rather than out of the design. `ld1` is already "dark hall,
braziers, light them in the order their pilot flames flicker" — TEACH 3's
twist. The first draft of `lk1` was a second dark brazier hall, which a child
would have read as the first one done again. Ember Deep has no dark zone at
all now; it is burning to make ground.

### Two things caught before they shipped

**The rooms hung forever with no error.** Every room must be declared in the
`L1` spec table (size, district, label) and the three new ones were not, so
`base()` read `spec.district` off undefined — inside an async builder, whose
rejection `pageerror` does not see. `transitioning` stayed true and the console
stayed empty. The same unhandled-rejection blind spot this codebase has been
bitten by before; calling the builder directly in the page and catching gave
the answer in one shot.

**NO BRANCH MAY CARRY PUPS.** The branch had three, per the region checklist.
But the extra-heart awards in `main.js onPupCollected()` key on a GLOBAL RUNNING
COUNT — 3 pups is Ember's heart, 6 is Stoneroot's, 9 the Wild Woods', 12
Frostpeak's. Three pups in a branch off region 1 would have handed a child
Stoneroot's heart **before they reached Stoneroot** and fired `all_pups_stone`
in the wrong region. The branch pays in shards, gear, a heart piece and a potion
instead, and the rule is written into the design file for the next one.

Draw calls 91 / 67 / 96 against the 125 budget. `tools/verify-emberdeep.mjs`
holds it: the Kiln's door exists, all three rooms build with content, and the
Fire Wolf's slam — through a real key press — burns the road open.

### verify-level1 found two more, and one of them was the suite

**"no door leads to a room that does not exist" — and the door was fine.**
`verify-level1` kept THREE hand-kept lists: every Level 1 room id, which of
them are the spine, and which pocket hangs off which host. Ember Deep made all
three wrong at once, and the way that surfaced was the suite calling a correct
level broken. Appending three strings would have fixed today and rotted again
at the next room, so the lists are now DERIVED from `L1` — the room table the
builders themselves read, which already carries `spine: true` and `loopsTo`.
A room cannot exist without this suite knowing about it now. Same fix the
game-wide suites already took ("kill the hand-kept-list rot").

**Two breakables in the blind strip**, and that one was real. The last 2.5u
before a room's edge is the band the fixed camera cannot show, so an
interactive thing in it is a thing a child never learns is there. `lk3`'s jar
and box sat at z 6.2 and 6.4 against an edge of 8.5. Moved to 5.4 and 5.6.

`verify-level1` ALL CLEAN afterwards, seventeen rooms.

## Treasures — the reward that is not a wolf (2026-09-02)

Dad: "we are going to add a new level that doesn't reward a wolf but something
else inbetween all existing levels." The levels between regions cannot pay in
wolves — the ladder is finished at ten and the tenth is the ending's gift — so
they pay in **keepsakes**: one object per place, kept forever, worth nothing in
a fight and everything to a child who is collecting.

**`state.inventory.treasures` had been in the save file since the beginning.**
Declared in the default state, deep-copied by `persist()` on every write, and
read by *absolutely nothing*. A whole reward channel already plumbed through
the save and completely empty. `js/treasures.js` is the thing that was missing,
not a system bolted on.

Four rules, and `tools/verify-treasures.mjs` holds all four:

1. **Found, never bought** — nothing here goes in `SHOP_STOCK`.
2. **A treasure does nothing.** No stat, no slot, no unlock. The moment one
   grants a heart, a child who wants to keep up has to hunt them, and the whole
   point is that they are optional. The suite rejects any entry carrying a
   stat, a price or a grant.
3. **The registry may not run ahead of the world.** An entry with no home shows
   in the collection as a `???` that can never be filled, which teaches a
   non-reader they missed something that was never there. The suite reads the
   level sources for `treasure: 'id'` the same way verify-gear reads them for
   gear — the world is the authority, not the table. This is why the table
   starts at ONE entry: six are designed, one is built.
4. **One per level**, so the collection reads as a map of where you have been.

The first is **The Banked Ember**, in Ember Deep's gold chest. The branch is
about fire as something you carry, so what you carry out is a piece of the
hearth that was cold when you got there.

**A save bug that would have thrown, not degraded.** `load()` does
`state.inventory = data.inventory` — the whole object, replaced. `equipped` and
`armours` are patched back afterwards for old profiles; `treasures` was not. A
profile written before this existed would have arrived without the array and
`addTreasure()` would have pushed onto `undefined` — a crash on the first
keepsake found, not a quiet miss. One line, and the suite tests it by deleting
the field and finding one anyway.

**Two art defects, caught by looking.** The first render came out muddy red: I
had tinted the topaz to the Kiln's orange, and every model in
`assets/loot/treasure` is a single white material over a shared ATLAS — the
colour lives in the map, so a tint multiplies rather than replaces. Rendered
untinted it is already an ember. Pick the right model instead of recolouring
the wrong one; the rest of the set reads the same way for the levels to come
(diamond is frost, emerald is the woods). The second was the tile itself: an
`<img>` at `height:100%` grew the frame and pushed the NAME out of the bottom,
so the first version showed a picture with no label — for a non-reader, the
entire point of the screen missing. It paints as a `background-image` on a
fixed 44px frame now, exactly as the Armoury does for gear.

Also: a new module has to join `sw.js`'s precache list or the PWA is missing it
offline. Easy to forget, invisible until someone plays on a train.

## The Drowned Market — the first interstitial (2026-09-03)

Dad: "make the drowned market a mid game level. we are going to add a new level
that doesn't reward a wolf but something else inbetween all existing levels."

Two rooms ON the road between Frostpeak and Stormreach — `f5`'s north door used
to open straight onto Stormreach's cliffs and now opens onto a harbour first.
It does the two things a road between two places can do that neither place can:

- **Graduates the verb you just earned.** You come down off the summit with the
  Frost Wolf and nothing else new, so the whole town is under ice and every
  stall worth opening is sealed in it.
- **Shows the lock for the one ahead.** The black channels are deep water — a
  hard wall until Meri's gift in region SIX — with the far quay and its goods in
  plain sight the whole way through. Two regions of wanting it.

**It moved regions because of dad's own reasoning.** Designed as a branch off
the Sunken Vale, and the sentence that killed the Trial of the Ten — "post-game
content is the wrong target, the kids are not finishing the game yet" — kills a
region-6 branch just as dead. Frozen instead of drowned it lands at region four,
and every prop still fits: a fishing town reads the same under ice as under
water. Nothing new was vendored; `loadGLB` caches by URL, so the Village's props
come back as the same objects, already atlas-shared.

Built from three systems that already existed: `world.slickFloor` (the Frozen
Lake's), `iceGate`, and `waterZone({deep:true})` — which is a box collider until
the Tide Wolf, so it stops Kael with no special case in movement.

### A new room prefix has to be NAMED, or it is greybox forever

`rooms.js` dispatches kit loading on the room id's first letter, and `q` was in
none of the branches, so the market fell through to the default and built in
plain boxes. The tell was not a crash: `visibleReward` hands back a proto cube
in greybox instead of registering a chest, so **the market's first run had no
loot in it at all** and nothing anywhere said so. The suite caught it as
`chests: 0`.

### verify-density had never looked at 26 live rooms

It keeps a hand-written room list with a `kind` beside each id, and unlike
verify-level1's lists that one cannot be derived — the kind is a JUDGEMENT (a
boss arena is SUPPOSED to have an empty middle). What CAN be checked is whether
the list covers the live registry, and it did not: **the whole Moonlit Spire,
the whole Village, the Den and all of Frostpeak** were never measured. Ember
Deep had shipped that morning and was not in it either.

A missing room is not a failure, it is SILENCE — the suite prints ALL CLEAN over
content it never opened. There is a completeness check now that turns that
silence into a failure.

**It found twenty real defects on its first run.** All seven Frostpeak rooms
measure floor sigma 0 — a completely flat floor — and `yrw`, `yg6` and `yg4`
show 0, 1 and 2 things in the arrival frame. Pre-existing: Frostpeak's builders
have not been touched, and this session only ADDED props to the Village.
Recorded in `tools/known-fail.txt` with that proof and queued as its own job
rather than folded into the commit that surfaced it.

### The third hand-kept list of the session, in a suite two hours old

`verify-treasures` rule 3 — the registry may not run ahead of the world —
reported the market's keepsake as homeless. The keepsake was placed; the scan
was reading a hand-written list of level modules that had never heard of
`js/levelMarket.js`. Both it and `verify-gear` read **sw.js's precache array**
now, which is the one list that cannot be incomplete: a JS file missing from it
is missing from the PWA offline, so the deploy rule already forces it to be
total.

## Frostpeak had no floor (2026-09-03)

Seven rooms, since the day the region shipped, laid a bare `PlaneGeometry` in a
single pale blue with **no texture at all** — while every other region in the
game calls `ground()`, which paints a canvas per room: snow grain, drift
patches, and **a worn route out of every doorway**, which is the cheapest and
most-used piece of wayfinding the game has. Frostpeak had none of it. Measured
floor sigma: **0.0, in all seven**.

`snowfield` was a real `GROUND_STYLES` entry the whole time — pattern 'snow',
wear 0.30, a strong 1.10 path — authored and never once drawn.

It survived because `verify-density` kept a hand-written room list and every
f-room was missing from it, so the suite printed ALL CLEAN over them for months.
The completeness check added the day before is what found it. One call, seven
rooms fixed, and the sweep went from twenty failures to fifteen with every
remaining one being arrival density rather than floor.

**And the same class of miss in code one day old.** The Drowned Market's
district named `ground: 'snow'`. There is no style called `snow`. A district
naming a style that does not exist falls back to generic earth with nothing but
a console warning — so the frozen harbour was drawing a dirt floor, and the only
reason it measured a healthy sigma was that the fallback is textured. Caught by
reading `ground.js` while fixing Frostpeak, not by any suite: the check asks
whether a floor VARIES, not whether it is the floor you asked for.

## The Night Road — the interstitial the kids will actually walk (2026-09-03)

Dad's own sentence, from scrapping the Trial of the Ten: *"post-game content is
the wrong target — the kids are not finishing the game yet."* The Drowned
Market shipped the day before at gap FOUR, between Frostpeak and Stormreach,
which is already further than they have got. This one is gap ONE.

Two rooms of moor at night, `n1`/`n2`, on the road out of Ember Hollow. `le`'s
north door used to hand a child straight from the Shadowgrip's arena into
Stoneroot's Great Vault; it opens onto the road now, and `n2`'s north door is
the one that reaches `vh`.

### Why the Dark Wolf

At gap one a child owns exactly two wolves. Fire, which Ember spent five rooms
teaching — and the DARK WOLF, which the Den hands over in the first ten minutes
and the game then barely mentions again. Its senses (hidden things shimmer,
`player.js` FORM_DEFS.senses) and its sight (dark zones black the light rig out
for every other form) are the most interesting tools a beginner owns and the
least used. `ld1`, the Order Hall, is the only room in the game built on them,
and it is a 20x16 pocket.

So the road is unlit wall to wall past the camp: the biggest dark zone in the
game. A washout across the middle of `n1`, a thorn nook off the road to burn,
and a chest out in the heather with **nothing in front of it at all** — no gate,
no wall, no puzzle, just somewhere a child in the wrong shape walks straight
past and a child in the right one sees from ten units away. That is the whole
lesson of the level in one object.

### ...and nothing is locked behind it

The failure mode of a "you must be the Dark Wolf" room is a five-year-old
stranded on the road out of level one, which is the worst place in the game to
strand somebody. So: the road is walkable in any form, the washout's pale rim is
drawn with an UNLIT material (`MeshBasicMaterial` — it ignores the blacked-out
rig, which is why the edge stays findable in the dark), and a fall costs the walk
and never a heart. `tools/verify-nightroad.mjs` walks it BOTH ways for that
reason: once measuring that the dark is real and the wolf lifts it, and once
walking the whole road as the Knight, in the black, to the far door.

Keepsake: **The Wayfarer's Key** (`js/treasures.js`), an old iron key with no
lock left in the world that fits it — and the plainest read in the treasure set,
which matters most for the first keepsake a child is ever handed.

Nothing new was vendored. It wears Ember's kit pulled cold and blue through
`emberKitRef()`, exactly as the Spire does.

### Three things a new level has to be NAMED in, and two nobody had noticed

The Market's lesson held: `rooms.js` dispatches its art-kit load on a room id's
first letter, so `n` had to be named there or the road builds in greybox forever
with proto cubes for chests. It also has to join `sw.js`'s precache list, and
`verify-density`'s ROOMS with its kind.

Two more that the Market itself had missed, found while wiring this one:

- **`regionOf()` in main.js.** Both roads fell through its final `return
  'ember_hollow'`.
- **`updateMusic()`.** Same hole one paragraph later: neither road was routed,
  so both fell to the `bossDefeated` branch — always true by the time a child
  can reach either — and the frozen harbour and the night moor both played the
  DEN'S LULLABY. Both are `stone-deep` now, the game's darkest loop, and nothing
  adjacent to either uses it. `verify-music`'s region walk includes both roads
  now, which is where the "no two adjacent places sound the same" rule has to
  hold hardest: a road exists to make a change of place felt.

### What the walk found that reading the code did not

Four real defects, all in the first cut, all caught by driving the room rather
than by looking at it:

1. **The painted path ran through the hole.** `ground()`'s path spline went
   (-8,-2) → (-4,-9), which clips the washout's west corner. A floor that draws
   a road across a pit is the exact lie `vh`'s own path comment warns about, and
   the Knight walking the west lane fell twice and never reached the far door.
2. **The thorn nook was open at the back.** The mouth was walled and nothing
   else, and the room's north strip runs the full width — so the chest could be
   taken by walking round the wall along z -11, without burning anything. A
   promise gate has to be the only way in or it is decoration. Found by
   flood-filling from the spawn: the nook's floor came back reachable with the
   thorn still standing.
3. **The east lane was three units wide.** A fallen column plus a ruin left a
   gap a flood-fill calls connected and a five-year-old on a joystick calls a
   wall — the driver wedged in it twice. The column moved and the ruin went into
   the corner; the lane is seven units now.
4. **A torch stood in the middle of the west lane, in the pitch dark.** 0.42u of
   collider on a 2.8u road, at the one point in the game where a child cannot
   see what stopped them.

And one design rule that came out of it rather than out of a suite: **what you
fight in the dark has to be visible in the dark.** A Shade is near-black by
design (colour 0x241a38 over emissive 0x2a1b3a at 0.35) and simply vanishes in a
blacked-out rig; a Moth carries emissive 0xffb25a at 1.4 and reads as a pair of
burning wings whatever the light is doing. The shades stand on the lit side of
the line and the dark half is patrolled by the things that glow.

### Two tools that were lying

- **`wk-drive`'s wedge diagnostic read `g.state.clock`, which does not exist.**
  Every stuck report therefore said `clockMoved: false` — "the world is frozen"
  — for what was always ordinary geometry, and it cost two passes chasing the
  wrong thing. It reads `player._time` now, which is the clock the 'dead'
  verdict two lines above it already uses.
- **`verify-nightroad` killed its own bot.** Section 4 dropped the player's
  iframes to prove a fall costs nothing — but a pit deals no damage in the first
  place, so all that achieved was letting the moths kill the bot in the dark and
  stall the run in the respawn path.

### And one hand-kept list, again

`verify-level1`'s "no door leads to a room that does not exist" compared against
`[...SPACES, 'zoo', 'den']` — a set one level wide. Every door Level 1 has that
LEAVES Level 1 was a dangling door by that definition, and it only stayed green
because the onward door needs `bossDefeated`. It reads the live `ROOMS` registry
now. Same fix, fourth time.

`verify-density` also learned to take room ids on the command line
(`node tools/verify-density.mjs n1 n2`), which turns a twenty-minute suite into
a twenty-second one while dressing a room. The completeness check still runs on
the whole registry, so a filtered run can still tell you a room is missing.

## QUEUED NEXT — the whole board, in order (2026-09-03, after v3.95.0)

Every item below was checked against the code today, not carried forward from
an older list. Items from the previous queues that are DONE and are therefore
not repeated: pots for regions 3/5/6 (every level file writes
`markers.breakables` now), music for Stormreach and the Sunken Vale, the
retired-room narration port (no dead `state.room === 'r1'`-style comparisons
survive in main.js), and shop tiers 3-5 (`CONFIG.SHOP.TIERS` runs to five rungs
gated on `WS.get(region,'restored')`).

### A · Wrong in the game a child is playing

1. ~~**`state.room` keeps the RAW room id.**~~ **Struck the same day — it was
   already fixed, and this entry was wrong.** I read `state.room = id` at
   `js/main.js:1721` without the line above it, `const id = resolveRoom(rawId)`
   (Q6, with its own comment saying exactly why). Walked it for real to be sure:
   `f1` → its `'w5'` door → `state.room` reads `tgl`, `world.roomId` reads
   `tgl`, `state.region` reads `wildwoods`. Left here struck rather than deleted
   so the next reader does not re-derive the same false alarm from the same
   grep.
2. **The map screen is two regions and one rebuild out of date**
   (`js/menus.js:463-482`). Ember's rows are `r1/r1b/r2/r2b/k1/r3` — all
   retired — so the ⭐ can never light up in Level 1; Stoneroot is the only
   other region listed. The Wild Woods, Frostpeak, Stormreach, the Sunken Vale,
   the Shadow Court, the Village, the Spire and both roads are simply absent.
3. **The `vgb` frozen-bot intermittent** (PROGRESS.md "Intermittents flagged"):
   one unreproduced occurrence, zero movement across three 60s tries, and a
   live probe walked the same spot freely. Flagged MUST-re-examine if it fires
   again; the run-l2 tripwire is in place.

### B · The safety net

4. **The nightly sweep has not gone green since at least 2026-08-31** — 31 Aug
   failure, 1 Sep failure (shard 4/8 only, seven shards green), 2 Sep cancelled.
   The 1 Sep failure is on `85f4515`, which predates the Frostpeak-floor and
   Village fixes, so it may already be stale — what is missing is one confirmed
   green run. A permanently red nightly teaches everyone to ignore it, which is
   docs/TESTING.md §1's own lesson.
5. **Three arrival-density rooms below the floor** — `ysq` 30/32, `f1` 26/32,
   `f4` 29/32 (tools/known-fail.txt, down from twenty on 2026-09-03). Two of the
   three are Frostpeak's, so item 6 subsumes them.

### C · Content, where the players actually are

6. **Frostpeak was never rebuilt.** It is the only region still hand-built in
   `rooms.js` (f1, f1b, f2, f2b, f3, f4, f5 — seven rooms) against 17-21 for
   every rebuilt region, with no `level4.js`, no spec table, no district
   palette, and doors pointing at retired ids. It is region FOUR: the kids will
   walk into it, and both remaining density failures live there.
7. **Interstitial gap 2 — Stoneroot → Wild Woods.** Earth is the freshest verb
   at that point and the Wild Woods is region three, so this is the next road by
   the same "build where the players are" law that put the Night Road first.
8. **Interstitial gap 3 — Wild Woods → Frostpeak.**
9. **Interstitials gaps 5 and 6** (Stormreach → Vale, Vale → Court). Region five
   and six: worth building, worth building last.

Each road adds its keepsake to `js/treasures.js` **the day its rooms ship** —
rule 3 of that file, enforced by `verify-treasures`.

### D · Consistency and polish

10. **Emoji are still on screen in six places**: the form badge and radial
    picker (`js/ui.js:88,132`), perk cards (`menus.js:366`), the sticker book
    (`421`), mystery cards (`496`), the map rows, and the shop's fallback icon
    when a 3D thumbnail fails (`310-311`). The RPG-signs pack was dropped for a
    missing licence; the Kenney Game Icons are already vendored and cleared.
11. **Three of the four spirit lights never arrive at the Den.** `regions.js`
    carries "polish list: Sylva's leaf-light / Boreal's rime-light / Aria's
    stormlight / Meri's tidelight joining the den fire" — Cinder's ember is the
    only one built. Four small, warm set pieces in the room a child returns to
    most.
12. **Two music "tracks" are aliases** (`js/audio.js`): `kiln` is
    `causeway.mp3` and `ember-calm` is `den.ogg`, and the Wild Woods shares
    `causeway` with the Kiln. Nothing is silent; three places are just wearing
    another place's sound.
13. **Profile isolation has never been checked** (PROGRESS.md item 3, TODO since
    RUN 3): two children's saves, proven not to bleed into each other.

### E · Dad's call / needs the kids

14. **Economy and XP balance pass.** Marked in two previous queues as *needs the
    kids — do not do this overnight*: the caps and a fifth perk change what a
    child gets.
15. **Recorded voice for Pip.** `design/VOICE-RECORDING-SCRIPT.md` is written
    and every line is grouped by character with recording instructions; the game
    still speaks through browser TTS. One file per line id, and the wiring is
    already shaped for it.
16. **Hard landscape lock** — still best-effort (CSS and layout only).


## The map reads the game now (2026-09-03, v3.96.0)

Board item 2. The map screen kept a hand list of rooms and it had rotted two
rebuilds ago: Ember's rows named `r1/r1b/r2/r2b/k1/r3` — retired ids that
`resolveRoom` redirects — so "you are here" could never light up in Level 1, and
the Wild Woods, Frostpeak, Stormreach, the Vale, the Court, the Village, the
Spire and both roads were simply not on it. Every row was also emoji.

**It derives from the level tables now.** `districts.js` already received every
level's spec table at load (for doorway colour bleed); it records the room's
label, kind, spine flag and district colour at the same moment, and
`registeredRooms()` hands the map the whole world in authoring order. Grouping
uses `regionOf`, which moved from main.js to state.js so the map and the music
answer the same question the same way. Each region shows its SPINE, plus the
room the child is standing in if that is a pocket; each card wears its district
colour as a swatch — the game's own wayfinding, no icons — and rows appear only
once the boss before them is beaten, so a five-year-old is never shown eleven
rows of places they cannot go.

**Frostpeak is the one exception,** named by hand from its builders' headers,
because it has no table — it is the region that was never rebuilt (board item
6) — and that block goes away with the rebuild.

**Found on the suite's first run: the Drowned Market never called
`registerDistrictTints`.** Every other level does. Its doorways have bled no
colour since it shipped, and it was the one place missing from the new map.
`verify-map.mjs` holds the map to the registry both ways (nothing drawn that
does not exist, every spine room drawn), lights "you are here" in eleven rooms
through the real map button, and checks the gating and the absence of emoji.

## Frostpeak rebuilt — the last region out of rooms.js (2026-09-03, v3.97.0)

Board item 6. Frostpeak was the one region never rebuilt: seven hand-built
rooms of 18x12 and smaller in rooms.js, no spec table, no district palette,
no dressers, and — until three days ago — no textured floor. It is region
FOUR, the kids will walk into it, and both of the game's remaining
arrival-density failures lived there.

**What is kept, exactly.** The v3.21 design is good and dad has played it, so
`js/level4.js` keeps the seven-room graph, both puzzle doors, Boreal, every
room id (nothing joins RETIRED_ROOMS) and every world-state key — a child
half-way up the mountain on an old save is exactly as far up it on the new
one. The Frozen Lake's stopper arithmetic is copied to the decimal: lanes at
x ±3.0 with a true 2.0u collider corridor, stoppers at (±1.6, 1.6) r 0.75 so a
boulder rests at x ∓3.0, plates at (±3.0, −4.6). A skid ends at a wall, a rock
or a plate (world.js), so the plates catch the boulders whatever the room's
height — the room is bigger, the puzzle is not.

**What changes.** Module sizes (island 32x26, pocket 20x16, arena 26x26),
the shared shell/door/dresser vocabulary, a five-district palette that cools
as you climb, `ground()` snowfield with ice patches and worn routes, and the
mountain INSIDE the room: fir stands with colliders, drifts, outcrops, falling
snow, and what the mountain's people left — gateposts at the Rime GATE,
two rows of columns in the Icebound HALL, standing stones on the eyrie.
Campfires and floor potions stay (the rebuilt levels dropped them; the
rest-before-the-boss law and the fires are how a child remembers the mountain).

**Measured:** arrival density f1 50, f1b 33, f2 53, f2b 34, f3 33, f4 41,
f5 33 against floors of 32/20/14 — f1 was 26 and f4 29 the day before. Draw
calls 67–114. 738 lines left rooms.js.

### Three promise gates that never sealed anything

Flood-filling each room from its spawn on the real colliders — the fill
`verify-reachable` uses — showed the ice in f1b, f4 and f5 standing BESIDE its
chest on open ground. In v3.21 every one of those chests could be walked to
round the block; `f_cairn`, `f_scour` and `f_eyrie` are in regions.js as
frost-wolf gates and were decoration. Each sits in a real nook now — ridge on
two sides, cliff on the others, the ice's 1.0u collider in a 2.8u mouth that
leaves slivers narrower than Kael — and `verify-level4` proves all three
unreachable with the ice up and `f_scour` reachable once frost breath breaks it.

### The driver, again

`verify-level4` walks both puzzles with real keys, and three of its four
failures on the way to green were the driver's. A breath is a cone, so Kael
has to face the bowl (the last step of the walk does that). A skid begins
0.12s of LEAN after the key, not on it, so waiting for "nothing sliding" the
instant the key came up read the stone's old position. And at 1x speed the
lean takes the best part of a second to accrue (Kael jitters against the
collider at 0.94u, the lean resets past 1.04u — measured 0.11s at 900ms), so a
fixed 600ms hold pushed the west stone by luck and the east one not at all;
the key is held until the stone commits now.

**Not done here:** `tools/run-l4.mjs`, the real-play route driver, is written
against the old room coordinates and needs re-porting to the new layout.

## The Greenway — the road out of the stone (2026-09-03, v3.98.0)

Board item 7, and the second of the three interstitials: the gap between
Stoneroot Caverns and the Wild Woods. Two rooms, `g1` and `g2`, prefix `g`,
spliced in between `vz` (the Warden's crypt) and `t1a` (Thornedge). Like the
Night Road it rewards no wolf — an interstitial's job is to make the wolf you
already have feel like *yours* before the next region asks for a new one.

### What it is for

Stoneroot teaches the stone-stomp in a side room and then never asks for it
again on the critical path. The Greenway is the graduation: **the road north
out of `g1` is cracked rock wall to wall**, so the stomp a child learned as a
detour is now the way they walk. Two more piles off the road, one each side,
each with something behind it, so stomping becomes a thing you go *looking*
to do rather than a thing a room makes you do.

`g2` is the handover to the Wild Woods: the first bramble in the game seals a
spoil there, visible and unopenable, and it stays shut until Sylva hands over
the Verdant Wolf two rooms later. A lock you meet before you meet the key.

### Decisions

- **The rockfall is walled to the pile.** The first cut left 2.4u either side
  of the rock and a flood-fill walked straight round it. A gate that is not
  the only way in is decoration. `wallRun` pads its box collider 0.5u past
  each end, so runs to ±1.8 reach ±1.3 and the big pile's 1.2u collider closes
  the rest. Proved by flood-filling the real colliders (`resolveCircle`) from
  the spawn, standing and stomped: `reach:false` then `reach:true`.
- **The keepsake is the Rootstone** (`gem-emerald.glb`), behind the third
  crack in a walled east nook — a treasure a child can open *today* with the
  wolf they already have, which is rule 3 of `js/treasures.js`.
- **The vine is geometry, and it is not kept loose.** A green line of leaning
  stones runs the length of the road, so the way on reads without a word. Left
  out of the static batch it cost `g1` its whole draw budget (132 calls against
  125); allowed to batch it is 117.
- **`registerDistrictTints(LG, DISTRICTS)`**, so the Greenway colours its own
  doorways and shows up on the rebuilt map screen without a hand-kept list.

### What the suite caught that reading the source did not

`tools/verify-greenway.mjs` walks it with real keys, and two of its three
failures were the *driver* misreading a level that was already right:

- **The stomp has an eight-second cooldown.** The helper pressed the key five
  times 600ms apart — three seconds — so every press after the first landed
  inside the cooldown of the one before. The second pile in a run never broke,
  and the suite reported it as "the chest gave nothing", which is exactly the
  shape of a real bug. It now waits the cooldown out before each press.
- **A straight line into the east nook drives into the rockfall wall.** The
  wall spans the room at z −4 with one 2.6u mouth at x 0; the driver now walks
  the waypoints a child would.
- The one real defect: the nook walls, which is the item above.


## Chests that never opened (2026-09-03, v3.99.0)

Dad, on three screenshots of three different rooms: *"all of these types of
chests through every level do not open or give anything. fix it."*

Two separate causes, and neither of them was in the chest code.

### 1. The game had two chests with two different grammars

The **standing** chests (`assets/env/props/chest-kit.glb`, `world.chests`)
open when a child walks within 1.1u. The **breakable** chests
(`chest-wood.glb`, `chest-gold.glb`, kinds `chest`/`goldchest` in
`potSpots`) are pots that happen to be chest-shaped: they had to be HIT.
There are 32 of them, roughly one in every third room from the Wild Woods
onward, and they look exactly like treasure.

A five-year-old walks up to a chest. They do not square up and swing. So a
chest-shaped breakable now **opens on touch as well as on a hit**, rings the
same reward chime the standing ones do, and carries the same pulsing glow —
a reward you cannot see is not a reward. One grammar for every chest in the
game: walk into it, it opens.

### 2. lc1's vault was sealed by the block that unlocked it

The Ketsu — Ember Hollow's push-block conclusion — ran a two-metre corridor
wall to wall, deliberately, so the long push could not be fumbled. The plate
sat in the middle of that corridor at x 2.2 and the chest a metre and a half
further west. **A block is 1.24u across and a child is 0.64u; two metres
holds one or the other, not both.** So the child pushed the block the whole
length of the tunnel, the bars went up in front of them, and the prize was
sealed behind the very thing that opened it — permanently, silently, with the
puzzle flag set and the room reporting success.

The corridor now steps south west of x 3.5 (three metres instead of two), so
the parked block has a lane beside it. The bars grew to match: bars sealing
two metres of a three-metre mouth are a decoration with a gap in it. The push
itself is unchanged — the narrow half is the half that carries the long leg.

`tools/probe-ketsu.mjs` drives the whole beat on real keys: north leg, corner,
west leg, plate, bars, then walks ROUND the parked block and opens the vault.

### The suite that should have existed

`tools/verify-chests.mjs` asks the only question that matters of every chest
in every room: **can a child get to it?** Reachability is a flood-fill from
the spawn over the real colliders, run twice — once as the room builds, and
once over a REBUILD of the room with every flag map answering true, every
wolf granted, and every gate, crack, burn, cut, ice, watcher and water
collider cleared. Unreachable in the second pass is a bug; unreachable only
in the first is the design. It found exactly one: the Ketsu.

Both chest systems had tests before this. Both tests put the player where the
chest was, which is the one thing a child cannot always do.


## Coins, the top-left strip, and one buff fewer (2026-09-03, v3.100.0)

Three more from the same play-test message.

### The counter and the badge sat on top of each other

Dad's first screenshot: "Lv 1" printed over the coin count. The coin chip, the
level badge and the buff row each carried their own hand-measured `left` —
200, 262, 370 — and those numbers were chosen when the counter read "0". At
three digits the chip is 95px wide and runs to 295. Numbers grow; a layout
built out of three guesses does not.

They are one flex row now (`#hud-top`), so they cannot collide whatever the
child is carrying. `tools/verify-hud.mjs` measures the real DOM rectangles at
0, 7, 148 and 99999 coins and asserts nothing in the HUD overlaps anything
else — including the hearts and the potion belt.

### Shards were already coins everywhere except in words

The currency has been a struck gold coin since v3.76; the *word* was still
"shards" in the armoury footer, the shop, every price, the chest payout line
and the sticker book, and the HUD's fallback glyph was 🔸 — an orange diamond
standing in for a coin, and an emoji, which is against the house rule twice
over. All of it now says coins.

**And a coin is one eighth of Kael**, which was dad's number. Written as a
ratio of his measured height (1.265u → 0.158u across) rather than as a typed
span, so it survives a rescale. The three coin models are discs in XY and thin
in Z — they stand upright, which is why the existing `rotation.y` spin reads as
a coin turning rather than a plate rotating. The hop was already right: out on
an arc, three or four bounces, then it settles and walks itself to the child.

`verify-hud` measures the coin against the knight standing next to it and
waits for it to settle rather than sleeping a fixed time — headless on
SwiftShader the game can run at two frames a second, and a coin's half-second
arc takes ten wall-clock seconds there.

### The Magnet Charm is gone

Dad: "get rid of the magnet in the game." It was the one buff with nothing to
look at and nothing to do — coins already walk themselves to a child inside
3.2u, so twelve seconds of Magnet was a power-up whose entire effect was that
the same thing happened slightly further away. Four buffs that change how Kael
moves and hits; no fifth that changes an invisible number.


## The way on opens where you beat the boss (2026-09-03, v3.101.0)

Dad, from play: *"at the end of the boss fight the doorway to the next level
should appear. it doesn't."*

He is describing a shape this codebase already had a name for. An arena's
onward door was REBUILD-GATED: the gap in the wall was cut and the door hung at
build time, gated on the defeated flag. So the room a child stood in the moment
they won was a room whose reward had not arrived — they had to walk back the
way they came and return before the way on existed.

Three arenas were fixed for it in v3.76 (`f5`, `scr`, `ddp`). **The three the
kids reach first were not** — Ember's `le`, Stoneroot's `vz`, the Wild Woods'
`tgl`. And `vz` could not have been, because the v3.76 fix hung off
`world.boss.onDefeated` and the Bone Warden is the one boss in the game not
stored as `world.boss` at all. Exactly the failure mode `BOSS_ROOMS`' own
comment warned about: *"a new arena can never again be a boss room for one
system and an ordinary room for the other."* It could, and it was.

### What changed

- `openTheWayOn(arena)` in main.js is now one function, called from the boss
  death hook AND from `onWardenDefeated`.
- `le`, `vz` and `tgl` cut their onward gaps always and plug them with region
  rock while the boss lives, the same shape `scr` uses.
- `onwardPlug` CHAINS. Ember's arena has two ways out the Shadowgrip holds —
  the road on and the walked loop-back home — and a second call used to
  overwrite the first, leaving one of them a rock pile forever. `onwardSpot`
  stays the last registered, so the smoke lands on the door that matters.
- The Shadow Court throne (`xth`) has no onward door, and the suite says so out
  loud rather than leaving a hole in its coverage: the ending is the way on.

### Two things the suite had to learn

- **`narration.blocking` is a getter.** Every driver that "quieted" narration
  with `narration.blocking = false` was writing to a read-only property and
  silently doing nothing. The dismiss is `narration.skip()` (plus captions off),
  which is what tapping the caption bubble does.
- **Winning levels you up, and the perk card pauses the world.** The plug's
  countdown is in GAME time on purpose, so it waits there — exactly as it does
  for a child reading the three cards. The suite picks one, the way they would.

`tools/verify-onward.mjs` asks every boss room whether the way on is shut while
the boss lives, whether the room carries a live opener, whether pulling it hangs
the door, whether the live result matches what a returning child sees on a
rebuild — and then fires the real defeat hook and **walks through the new door
on real keys**.


## The creature batch, measured before it was believed (2026-09-03, v3.103.0)

Fourteen models arrived with "see what fits the build, what works enlarged as a
boss or shrunk down to work as a everyday minion enemy." So the first thing
built was not a boss — it was two tools:

- **`tools/probe-newassets.mjs`** measures each candidate against the three
  things CLAUDE.md's 2026-08-23 amendment actually asks: is it a real mesh
  (tris, meshes, materials), does it sit in the low-poly register (textures,
  texture size, vertex colours, draw cost), and is it *rigged with the same
  clip vocabulary* — idle / walk / attack / death — so it animates to the same
  standard rather than being a static prop wearing a monster's shape. It prints
  `wolf.gltf`, `Slime.glb`, `Dragon.glb` and `Skeleton_Warrior.glb` on the same
  scale underneath, so "does it fit" is a comparison rather than an opinion.
- **`tools/probe-assetshots.mjs`** renders each one at a fixed three-quarter
  angle, normalised to Kael's own height, because a triangle count cannot tell
  you whether something looks like it belongs next to a wolf.

### What the measurements said

| model | verdict |
|---|---|
| **minotaur** | **IN.** 3,234 tris, six flat materials in exactly the Quaternius register, and its own idle / Walk / Attack / **Attack Double** / Death / Jump. The best asset in the batch by a distance. |
| **cartoony wasp** | **IN.** 1,606 tris, Idle_Flying / Attacking / Death, and already near game scale. |
| griffin | **OUT, and it hurt.** 670 tris, beautifully faceted, perfect for a sky guardian — and its only clip is a 7.8-second near-idle. Rendered six frames across it (`asset-raw/…/strips/`): nothing moves. It would be a statue in a fight. |
| skeleton dragon | **HELD.** Full attack/fly/dive/walk/idle vocabulary and a superb blocky look — and **394 separate meshes** against a 125 draw-call ceiling. It cannot ship as it is. |
| young dragon | held — 1,920 tris, one clip (`cyclewalk`). A whelp minion if it ever gets an attack. |
| 4 stylized dragons | out on budget: 15k, 24k, 48.8k and 49.1k tris. The whole game's smashables cost one draw call each on purpose. |
| bennu, orc archer, rhino rider, low-poly dragon, fantasy owl | out as creatures — no rig or no clips at all. The orc archer's vertex-coloured look is the closest thing in the batch to the shipped kits; all five are noted as **statue/monument** candidates for a dressing pass. |

### Seven bosses, seven creatures

Dad: *"every boss fight should be a different asset… the first boss is a giant
wolf, no more giant wolf bosses after that."* The count was worse than it
looked: **four of the seven wore `wolf.gltf`** — the Shadowgrip, Sylva, Aria
and Shadow-Grimm — and Meri's slime body was hard-coded in the *spawner* while
the skin table said nothing about it, so the table lied about a third of what
it described.

A skin now names its own `body`: which model, how tall it stands, which of its
materials are eyes, which to leave alone, and whether it hovers.

- **Sylva, Thornbound** is the minotaur, green-hided with her leaf-light in her
  eyes; horns and hooves keep their modelled colour so she reads as a creature
  with a coat rather than a silhouette painted one flat colour.
- **Aria, the Galebound** wears the Quaternius dragon — the body Boreal used to
  wear before Frostpeak's rebuild moved her onto the wyrm, so it costs the
  build nothing new — and she **hovers**: a thing that never touches the stone
  has no walk cycle to play, which is why `Dragon.glb` having only `Flying` is
  exactly right for her.
- **Shadow-Grimm stays a wolf on purpose.** He IS the great wolf; the
  Shadowgrip was a piece of him and every form Kael carries is a piece of his
  stolen strength. The first fight and the last being the same animal is the
  bookend the story rests on. `tools/verify-bosses.mjs` names that pair
  explicitly so it stays a decision instead of drifting back into an oversight.

### The evening this cost, written down so it is not spent twice

The minotaur went in and rendered as **nothing**: present in the scene graph,
`visible: true`, a correct-looking bounding box, and simply not there.

`THREE.Box3.setFromObject` walks a `SkinnedMesh` through
`SkinnedMesh.computeBoundingBox()`, which poses every vertex through the
**current** skeleton. On a fresh `SkeletonUtils.clone` whose bone matrices have
not been updated yet, those matrices are garbage — so she measured **19,372
units tall instead of 193**, the scale came out a hundred times too small, and
the skinning collapsed. The fix is to measure the loaded gltf's own scene,
which has settled matrices and is never posed by a mixer. It is the same
lesson as the chest, the crate and the vase — *measure the model* — with a new
edge on it: **measure the ruler, not the puppet.**

### And the Ember Wasp

`ember-dragonling` is gone; `ember-wasp` replaces it, keeping the `Dragonling`
class so the hover / red-lane / dive / grounded-by-a-shield grammar is
unchanged. `frost-dragonling` and `shadow-dragonling` keep the dragon body on
purpose: Frostpeak's boss IS a dragon, so its region's flyer sharing that
family is the law working rather than being worked around.


## Bosses you cannot mash through (2026-09-03, v3.104.0)

Dad: *"boss fights are far too easy and are all beatable by spamming the attack
button. there needs to be multiple different attacks, different attack
patterns, different timing, different openings. difficulty of bosses should
scale with the increasing levels."*

He is right, and the reason was structural rather than a number being too low.
Read the old machine: `prowl` ran 2.2–3.2 seconds and did nothing but circle,
`recover` was 1.6s of panting and `tired` 2.6s of lying down — so the great
majority of the fight WAS a free-hit window, and a child standing next to the
boss swinging never had to read anything. `tools/fight-sylva.mjs` proved it in
its own log: **twenty of her twenty-four health came off during `prowl`.**

### What changed, and what could not

Four changes, and every one respects §2 of `docs/wolf-knight-combat-context.md`:

1. **A guard between openings.** While a boss is up and watching, hits land for
   a fraction and ring off with a clang — the Bone Warden's shield grammar,
   which the kids already read, applied to the whole duel family. It is a
   REDUCTION, never immunity: a five-year-old who only swings still gets there,
   just slowly, and a child who waits for the gold ring gets there fast.
2. **A third shared attack, the pounce** (`boss_pounce` in js/attacks.js): rear
   up, leap onto where you stood, land with a 2.4u shockwave. Its opening is a
   different SHAPE — 1.4s dazed on its feet and right next to you, against the
   charge's 2.6s collapse across the arena. Different openings was half of what
   was asked for.
3. **A no-repeat picker.** The old chooser was a distance test and two coin
   flips, so it settled into swipe / charge / swipe / charge and a child learned
   the whole fight in one cycle. `_pickMove` never plays the same move twice
   running, and drops whatever the current distance makes nonsense.
4. **Pacing by region.** `tier` is the region number. Guard rises with it
   (0.35 → 0.75), the gap between attacks falls (3.2s → 1.9s), the move list
   grows, and the tell multiplier walks down to the floor.

**What is NOT scaled, because §2 forbids it:** no telegraph goes below the 0.9s
boss floor (LAW 1 — a child's choice reaction is around 800ms) and no punish
window below 1.0s (LAW 6). `tellMult` only ever makes an EARLY boss telegraph
*longer* than the floor. Difficulty is spent on what a child has to DO, never
on taking their reading time away.

### The measurement, because "harder" is a claim

`tools/probe-masher.mjs` walks at the boss and presses the attack key. Nothing
else: no reading, no dodging, no shield. It is the only honest test of "beatable
by spamming the attack button", and it found two things the reasoning missed.

- **The guard alone did not fix it.** A masher still took the Shadowgrip down in
  ninety seconds. So the boss now ANSWERS when crowded (`attackIn` drains 2.5x
  faster inside 2.4u): press your face into a wolf and the wolf is on you
  sooner.
- **The first idea made it EASIER.** The wolf originally backed off when
  crowded, and the retreat carried the child out of the swipe cone — a masher
  lost one heart in ninety seconds instead of eating the paw. Measured, reverted,
  and the note is in the code so nobody tries it again.

Where it landed, per `tools/verify-bosses.mjs` §9, which now runs the masher as
part of the suite:

| | bar per second | hits taken |
|---|---|---|
| the Shadowgrip (region 1) | 0.0151 | 3 |
| Shadow-Grimm (region 7) | 0.0083 | 4 |

Region one is still winnable by a child who only swings — it has to be, or the
game stops at its first boss — and it now costs three of five hearts. Region
seven **kills a masher**: a 150-second run took Grimm to half health and died
once doing it. A reader still beats Sylva with no deaths at all
(`tools/fight-sylva.mjs`), which is the shape that was wanted: mashing works and
hurts, reading works and doesn't.

## Four rooms that looked wrong (2026-09-03, v3.104.0)

The same play-test, and none of these was a bug in any system — they were rooms
LOOKING wrong, which nothing in the suite set could see.

- **"keep the pitfalls but remove the grey geometric marks on them."** A
  four-segment `RingGeometry` rotated 45° — a grey diamond painted round every
  pit, there for a real reason (the Dark Wolf needs a findable edge) and looking
  like a debug gizmo. The cue moved INTO the hole: one plane carrying a soft
  radial falloff with a crumbled lip, so the washout fades to nothing at its rim
  the way a real hole does. One draw call fewer than the hole-plus-ring.
- **"do not have random dark spots partially in a room."** Two zones were
  islands: n2's east corner and vc3's band, which stopped five metres short of
  the north wall. Both now run wall to wall from the far end back — a threshold,
  which is the thing a child understands.
- **"the lamps do nothing when lit."** Every brazier in the game has a real job
  wired to it; the problem was that lighting one LOOKED like nothing — a 16cm
  flame on a two-metre stand, lit at intensity 5 over a six-metre falloff. Real
  flame, a pool of light you can stand in, and when the LAST lamp in a room
  catches, the room itself lifts over a beat and a bit.
- **"that object needs to be removed. replace it with some sort of cool markings
  on the ground to stomp."** The Rattle's resonant plate was a kit pedestal
  squashed to (2.4, 0.5, 2.4) — furniture, climbed onto rather than stomped
  into. It is a struck-stone sigil now (`stompSigil`, js/gates.js): concentric
  rings, eight chevrons pointing in, a cracked star where the paw lands, flush
  with the floor and pulsing gold like every other act-here mark.
- **"the roots need to look bigger and more menacing and be blocking entrance to
  the boss."** tc4's boss door was `when`-gated on `knotCut` — the doorway was
  cut in the wall and the trigger simply did not fire, so a child walked up to
  an open arch and nothing happened. Nothing was ever in the way. Five bare
  trees now lie across the mouth at almost twice the region's scale, blight-black
  with a sick green glow, behind a real box collider.
- **"breakables should be clean of other objects. not half through them."**
  `potSpots` refused a spot inside a collider — but only for the spots it CHOSE.
  Every hand-authored `world.markers.breakables` in the game bypassed it. Every
  breakable is now tested at spawn, whoever picked the spot, and nudged out
  rather than dropped.

`tools/verify-looks.mjs` holds all of it: 146 rooms, no dark island, no pot
standing inside anything, no low-segment ring painted on any floor.

