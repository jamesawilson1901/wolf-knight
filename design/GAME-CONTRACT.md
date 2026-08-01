# GAME CONTRACT — binding numbers & rules. Change here first, then in code.

> **CHANGELOG (2026-07-31 audit):** added the "Adopted law, code catching
> up" section from the full-project audit — rules we now hold as binding
> that the code does not yet satisfy. Each maps to a fix-plan item.

## Adopted law, code catching up (audit 2026-07-31)
- ✅ DONE v3.10: Boss respawn preserves the reached phase — dying never
  restarts a boss from phase 1 (flags.bossProgress, saved per profile).
- Every hit fires layered feedback through ONE juice pipeline (hitstop,
  shake, contact particles, audio, haptics) with weight tiers; particles/
  audio pooled + preloaded — no allocation or first-play decode stutter
  mid-combat. [#1]
- ✅ DONE v3.11: Forms are distinct TOOLS (safe shielded Knight vs fast
  fragile Dark Wolf with lunge + senses; shield Knight-only); Blood Moon
  is an EARNED Moon-Gauge surge, not a cooldown button; the gauge fills
  under pressure (hits landed/taken + in-combat time — hidden assist,
  alongside the existing 3-death rubber-band). Full gauge pulses GOLD
  (act-here); the surge itself burns RED. Dials: CONFIG.FORMS,
  CONFIG.MOON, CONFIG.SWITCH_FX. [#2, #3]
- ✅ DONE v3.12 (+v3.5/v3.8 witnessed healing): the settlement has
  characterful NPCs — named villagers (Wren always; Rook when Ember
  heals; Bram when Stoneroot sings) who greet Kael, gesture, and carry
  rumors that foreshadow the next region; Biscuit the den dog wanders;
  rescued pups play by the fire. A freed region's healing is WITNESSED
  (visible sequence, persistent, revisit rewards). [#5]
- A reduce-motion setting tames shake/hitstop/flash. [polish list]

## Combat grammar (already true — now law)
- RED marks danger (rings/arcs/streaks), GOLD marks "act here" (strike
  windows, keyholes, chests, plates). Never mix.
- Every attack telegraphs ≥0.8s (bosses ≥0.9s). Every hit shows a damage
  number or BLOCKED. Bosses show a health bar.
- Shields blunt; perfect parry (0.3s+bonus) negates + stuns 2.2s; stunned
  takes double. Jumps dodge groundAttack sources. Fire/hazards pierce
  shields. Flyers die to bolts (full) / melee (fine), bolts chip walkers.
- Cozy (default) softens damage to 60%, min ½ heart; Brave full. Rubber-band
  after 3 deaths in one room (respawn = that room's entrance). Never more
  than 3 simultaneous aggro enemies near a kid (spawn spacing must respect
  this).
- ATTACK TOKENS (v3.14, CONFIG.ENGAGE): at most 1 (Gentle) / 2 (Cozy) /
  3 (Brave) enemies press the attack at once; the rest PROWL a ~3u ring,
  visibly waiting. An attack in motion always finishes. Fights are turns,
  never pile-ons — pattern-reading is the skill, not mashing.
- Telegraphs live ON THE BODY (crouches, eye flares, wind-ups, dust) —
  no floor decals under enemies (playtest verdict; boss lane telegraphs
  for room-crossing charges are the exception).
- Weakness hits announce themselves: gold flare + "SUPER!" callout; Pip
  teaches "every creature fears something" on the first one.

## Progression targets (tune toward, verify per region)
## Elements & armor (law, v3.7)
- Every strike carries an ELEMENT by source: knight sword = steel ·
  spark bolt = spark · dark wolf = moon · fire wolf = fire · earth wolf =
  earth. Steel is the only non-magical element.
- Every enemy family has a WEAKNESS (1.5x + gold flare): Grimm's
  shadow-things (Shade/Moth/Hound) fear MOON; slimes/bats and all BONE
  fear FIRE.
- ARMORED bone (skeletons, Warden) takes 0.5x from steel (clank teach)
  and 1.35x from any magic. The sword is never useless, magic is the
  answer — anti-button-mash by design.
- Enemy defense patterns are PREDICTABLE: the rogue always sidesteps the
  FIRST melee swing then is open 3.5s; the Warden front-blocks always.
- Grounded enemies obey lava exactly like Kael; flyers cross freely.

<!-- PLAYTEST VERDICTS (the reference; newest first)
  2026-08-01 — dad, session 3: boss "a little smaller but still
  intimidating" → 1.96→1.62 (~2.9x wolves). "Make it obvious when it's
  vulnerable" → THE COLLAPSE: falls over (Death clip) 2.6s + pulsing
  gold ring + thud/slow-mo + Pip callout; phase-1 severs now flinch.
  "Dark wolf same size as fire wolf" → SURGE_SCALE 1.25→1.0 (aura is
  the drama). "Blood moon attack should home" → the pierce crescent
  re-acquires the next target after each pierce. "Attack and retreat"
  → Shades dart back out of reach after striking home. "Approach with
  a shield, damage null till they drop it" → Skeleton Shieldling
  (Stoneroot): front-immune wall, slow 2 rad/s turn (flankable), opens
  on its own swing + recovery or when stunned. + dad asked for a spin:
  Knight WHIRLWIND special (KayKit Melee_2H_Attack_Spin, 6s cd, 360°).
  2026-08-01 — dad, session 2: "entering r2 feels like getting swarmed,
  just button mashing — we want skill: learn patterns, experiment with
  attack types." → ATTACK TOKENS (1/2/3 by difficulty; waiters prowl a
  ring), r2 shades moved off the doorway, weakness hits now shout
  SUPER! + Pip element lesson. "Enemy wolves cast a dark rectangular
  shadow before attacking — get rid of it" → hound charge streak decal
  DELETED; telegraph moved onto the body (deep crouch, eyes flare red,
  paw-scrape dust, low growl).
  2026-08-01 — dad, phone session: SURGE CRASHED in r1 ("Cannot set
  property x of Enemy which has only a getter") → shockwave/switch-push
  now write enemy root.position; regression suites must include LIVE
  enemies (the den-only tests never touched a real one). Lava + path
  tiles "glitching" → 16-bit mobile depth z-fight; camera near 0.1→1.5
  + tiles raised. One BLANK avatar square → player.load() consumed +
  hid the cached knight scene; clones inherited visible=false. Law:
  never mutate the shared asset cache, and pixel-check rendered
  artifacts. Cheat menu unreachable → touch-action:none on menu
  buttons ate scroll drags; pause menu items now pan-y.
  2026-07-31 — dad, session 3: "Blood Moon wildly overpowered" → 99 dmg
  nuke becomes 2.5 moon dmg (one-shots weak-to-moon grunts, elites
  survive). "Dragon windows more frequent + shorter" → tendril stick
  2.8→1.7s, gaps 1.5→0.9s, all phases pulse ~1.4-1.7s open windows.
  "Combat is button-mashing" → element/armor system above + rogue dodge.
  "Darkness should force the Dark Wolf" → r1b + e2 are now fully dark
  rooms (r1 keeps its teaching nook). Dodge roll + attack-while-moving
  added. "Two rooms and a closed gate" → the millstone puzzle IS the
  gate key; boulder now wears the gold act-here ring + the Gentle guide
  runs to it.
  2026-07-31 — daughter: "too hard" (after the v3.4.1 bump). Response
  (v3.4.3): 🌸 GENTLE MODE, per-profile, mutually exclusive with Brave:
  damage softened to 40%, enemy hp bonus skipped, and the whole enemy
  world (boss included) runs at 80% time — slower moves AND longer
  telegraphs from one lever. Difficulty is now per-kid: her profile
  Gentle, his profile Brave, default stays Cozy.
  2026-07-31 — son: "enemies are too easy, make them harder." Response
  (v3.4.1): every enemy +1 hp (grunts no longer die in 2 hits); family
  speeds +15-20% (shade skips 3.3, hound stalk 1.8 / charge 9.6, moth dive
  7.2, slime 1.2 / minis 2.0); Cozy softening 0.5 → 0.6 (floor ½ heart
  unchanged; Brave unchanged — the harder-hungry kid can also flip 🦁 Brave
  on their own profile). Telegraph floors and max-3-aggro laws untouched.
  Next session: ask both kids again and record here. -->
- Cozy (default) softens damage to 60% (was half), min ½ heart; Brave full.
- Expected level entering region N: ~1+3(N-1). XP curve stays 20+15(lvl-1).
- Perk pick every 3rd level; perk pool must stay ≥3 unmaxed choices to
  level 21 (add tiers when a pool would run dry).
- Hearts: start 5; +1 per region's pup set; +1 heart-piece set (4) per
  region. Cap 12 before endgame.
- Shards: a region yields ~120-160 (pots+chests+drops). Shop ladder per
  region tier ≈ 60/90/150/250/400. A kid who explores buys one big thing
  per region; completionists afford two.
- Playtime target: 60-80 min per region incl. branch + secrets → ~8-10h
  with endgame. If a region tests under 45 min, it ships more rooms.

## Region shipping checklist (every region, no exceptions)
- 4-6 rooms: entrance, 2+ purpose rooms, key BRANCH, boss arena; named per
  LEVEL-DESIGN-2; shaped layouts; loop-back shortcut; mid-dungeon TWIST.
- 1 key/lock, ≥1 secret per room, 3 pups, 1 new enemy family (real models,
  signature behaviors), 1 unique-verb boss, campfire+potion pre-boss.
- Region verb taught in room 1, mastered by boss. New wolf form + aura.
- Revival pass (post-boss visual change) + Den growth item + shop tier +
  2 music tracks (region + deep/boss) + narration set per STORY-BIBLE.
- Headless verify script + offline check + both branches pushed.

## Engineering law
- Saves are additive-forever; old saves must load. No code-built creatures.
  All URLs relative. SW cache bump every deploy. Nothing merges to main
  unverified.
