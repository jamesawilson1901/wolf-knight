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
