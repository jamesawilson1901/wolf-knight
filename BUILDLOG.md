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
