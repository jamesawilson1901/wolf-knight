# SYSTEMS.md — plain-English index of every runtime system

> **CHANGELOG (2026-07-31 doc-truth pass):** expanded from the gates/
> worldstate notes into the full index the audit called for: every system,
> what it does, which file owns it, where its tunables live. A fresh
> session starts HERE, then GAME-CONTRACT.md (binding numbers),
> LEVEL-DESIGN-2.md (layout rules), STORY-BIBLE.md (canon = the addendum),
> COMBAT-SPEC.md (behaviors), BUILDLOG.md (history + queued work).

Tunables rule: game-feel numbers live in the single `CONFIG` object
(js/config.js), grouped and commented. System-specific constants sit at the
top of their owning file. Change numbers there, never inline.

## Input (js/input.js)
Floating joystick (left 40% of screen, dead zone, idle hint), stable
button cluster, form button (tap = cycle, hold = radial picker), keyboard
fallback. Edge-triggered presses consumed per frame — input responds within
one frame. Tunables: CONFIG JOY_*, FORM_HOLD_MS.

## Player & forms (js/player.js)
Kael's movement (velocity ramp: CONFIG ACCEL/DECEL/TURN_SPEED), jump/
double-jump, shield+parry (KNIGHT-ONLY — FORM_DEFS.shield), potions,
i-frames, lava bounce-back. FORM_DEFS is the form-identity data sheet
(speed/turnMult/hurtMult/stepIn/lunge/senses per form — the seven later
wolves slot in here); wolves are ONE model tinted per form (WOLF_TINTS)
with elemental auras. Dark Wolf = fast fragile hunter (CONFIG.FORMS):
6.7u/s, +30% damage taken, step-in bites, LUNGE dash-bite, wolf-senses
shimmer on hidden things. Melee: soft lock-on, input buffering, thrust
combo, generous hitboxes (CONFIG combat block). Mid-attack switches
queue to the swing's end. Specials: ground-slam (fire), stone-stomp
(earth); the Dark Wolf's Blood Moon is the MOON GAUGE SURGE (below).

## Moon Gauge & Blood Moon Surge (js/player.js + ui.js, CONFIG.MOON)
state.moonGauge (0..1, persisted) fills from hits landed/taken +
in-combat time (pots excluded via Breakable.scenery); Quicker Moon perk
boosts fills, Moon Shard fills instantly. Full = gold act-here pulse on
the HUD crescent; tap → 2.5s ceremony (red vignette #surge-vignette,
rising blood moon, time-slow via effects.timeScale, forced morph, howl +
bass + haptics, no-damage shockwave stun) → 10s surge (locked 1.25x Dark
Wolf, juice.weightBoost 1, x2 staggering bites, free lunge, regen,
gauge-as-timer, 2s warning flicker, exhale revert). main.triggerSurge
guards scripted beats/transitions.

## Effects & juice (js/effects.js)
Self-contained updaters: screen shake, hitstop, camera zoom punch
(punch), time-slow (slow/timeScale — main scales enemy+boss dt),
ground-slam ring, warm flood, surge ceremony (rising blood moon + red
wash). main.js applies shakeOffset/zoom to the camera and freezes world
updates during hitstop. js/juice.js is the ONE hit pipeline (tiers in
CONFIG.JUICE, weightBoost = surge tier promotion, pooled particles,
haptics).

## Enemies (js/enemies.js)
All REAL models (code-built creatures banned — ASSETS.md casting sheet).
Each family has a signature behavior (see COMBAT-SPEC.md). Shared: solid-
body separation (resolveBodies), shield-wall bump, hit-flash, damage
numbers via world.onDmgNum, puff deaths, max-3-aggro spacing rule.

## Bosses (js/boss.js + rooms)
Shadowgrip: exposure-gated core (gold strike rings, clank/BLOCKED when
guarded), one-hit stuck tendrils, phase escalation, health bar. Bone
Warden (enemies.js): front-block shield mini-boss. Law: telegraph ≥0.9s,
red = danger / gold = act. Boss verification must drive the PLAYER's real
attack path, never damage functions directly (BUILDLOG lesson).

## Ability gates (js/gates.js)
Data-driven obstacles keyed to wolf verbs; unopenable ones read as
PROMISES (distinct look + mystery entry). boulderGate (Earth stomp),
waterGate (Tide, region 6), brambleGate (Verdant vine-lash, region 3 —
thorny tangle + green glint), brazier (Fire slam ignites; optional
gutterAfter for timed puzzles — the Kiln's whole puzzle language).
One call + a hint marker adds a gate to any room.

## WorldState & mysteries (js/worldstate.js)
WS.get/set per-region flags persisted in the save; rooms read them at
build time, so a flag flip = a visibly changed world (rooms rebuild on
entry). logMystery/resolveMystery drive the map screen's ??? cards — the
"reasons to come back" memory. The hint rule: every secret has ≥2 organic
pointers (stumble + Pip sparkle/NPC line/visual cue); never quest markers.

## Dungeon pattern (the Kiln is the template)
Hub + 3 doors: A open → shrine grants the region form MID-dungeon →
teach → test (twist) → combine; B locked by the region mechanic → puzzle
→ dungeon key + far-side overworld shortcut; C key-locked → boss.
Campfire + potion in the hub. Every puzzle self-resets.

## Rooms & world (js/rooms.js, js/world.js)
ROOMS registry builds each room from kit pieces; flat-plane collisions
(XZ circles/AABBs), hazards (hazardAt), burnables/crackables, doors with
`when()` predicates, one-way ledge drops, checkpoints, landmark helpers
(kilnLandmark). Region = room id prefix. LEVEL-DESIGN-2.md holds the
seven layout rules + region graphs.

## Den villagers (js/npcs.js)
spawnDenNpcs(world) populates the Den from VILLAGERS data (id, model,
spot, arrival condition): Wren (Rogue_Hooded, always) · Rook (Ranger,
after ember restored) · Bram (Barbarian, after stone restored) — KayKit
Rig_Medium models bound to the rig-library clips (Idle_A + occasional
Idle_B/Interact gesture), solid colliders, smooth face-Kael greeting.
Biscuit the Husky (world.dog) wanders DOG_STOPS with Idle/Walk/Eating.
main calls world.updateNpcs(dt, t, player); markers (<id>Spot, dogSpot)
drive the narration greetings in main's den trigger block.

## Den minigames (js/minigames.js, CONFIG.DEN_GAMES)
Each villager hosts a game behind a gold act-here ring (step in to play;
one game runs at a time): 🎯 Rook's Sharp Eye (timed pop-up targets, any
attack pops them — appears with Rook once Ember heals) · 📦 Wren's
Shuffle (coin under a crate, watch the swaps, smash the right one —
frame-collected pick candidates resolve to the crate nearest the player)
· 🐾 Pip's Paw Path (Simon-style pad memory, chimes pitched per pad).
Game props ride world.enemies with scenery=true (hittable, never fed to
the moon gauge or body-resolver). Rewards: shards (REWARD_FIRST once,
REWARD_REPEAT after) + first-win stickers (gameRook/gameWren/gamePip
counters). Gentle profiles get longer clocks, slower swaps, shorter
patterns. #mg-chip is the live score readout; main calls
world.updateMinigames(dt, t, player).

## Narration (js/narration.js) — CANONICAL line table
Data table {id, voice, text}; Web Speech per-character rate/pitch;
captions; music ducking; once-per-save vs repeatable; stuck hints.
NARRATION-SCRIPT.md keeps the style rules + slice script.

## Audio (js/audio.js)
WebAudio SFX + crossfading looped music (intro→loop, one-shot→then),
generated brown-noise lava ambient, narration ducking, per-profile
volume settings. Buffers currently decode lazily on first play (fix
plan #1 preloads combat-critical ones).

## Save (js/save.js)
localStorage per-kid profiles, schema v2 (HUD-MENU-SAVE.md). Law:
additive-forever — old saves always load; new fields get safe defaults.

## Progression & menus (js/progress.js, js/menus.js, js/loot.js)
XP/levels (GAME-CONTRACT curve), perk picks every 3rd level, shards +
shop, stickers, map screen (regions + mysteries), fast travel via Luna's
moonstone, pause/settings. Maren's stock is TIERED (items.js SHOP_STOCK
`tier` + SHOP_TIERS): tier 1 (15-90) from the start, tier 2 (120-300) once
Stoneroot is restored, with a line under the grid naming what unlocks the
next tier. Tiers are WHEN a row sells, never what it costs.

## Difficulty assists (scattered, all quiet)
Cozy default halves damage (min ½ heart); rubber-band after 3 deaths at
one checkpoint; full-hearts respawn; Pip re-teach lines; max-3 aggro.
Coming: phase-preserving boss respawn (#4), gauge-fills-under-pressure
(#3), extended telegraphs after deaths (polish).

## PWA shell (index.html, sw.js, manifest.json)
Vendored three.js via import map, no bundler, cache-first service worker.
LAW: bump CACHE_NAME every deploy; add every new file to PRECACHE; all
URLs relative; verify offline before pushing main.

## Headless verification (scratchpad *.mjs, Playwright)
Chromium + SwiftShader drives window.__game. Slow renderer → predicate
waits, never fixed sleeps. Tests must use the player's real input path.
Every region ships with a verify script (GAME-CONTRACT checklist).
