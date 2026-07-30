# GAME CONTRACT — binding numbers & rules. Change here first, then in code.

## Combat grammar (already true — now law)
- RED marks danger (rings/arcs/streaks), GOLD marks "act here" (strike
  windows, keyholes, chests, plates). Never mix.
- Every attack telegraphs ≥0.8s (bosses ≥0.9s). Every hit shows a damage
  number or BLOCKED. Bosses show a health bar.
- Shields blunt; perfect parry (0.3s+bonus) negates + stuns 2.2s; stunned
  takes double. Jumps dodge groundAttack sources. Fire/hazards pierce
  shields. Flyers die to bolts (full) / melee (fine), bolts chip walkers.
- Cozy (default) halves damage, min ½ heart; Brave full. Rubber-band after
  3 deaths at one checkpoint. Never more than 3 simultaneous aggro enemies
  near a kid (spawn spacing must respect this).

## Progression targets (tune toward, verify per region)
<!-- Difficulty numbers are provisional defaults: no family playtest data yet. First real session's verdicts get recorded here and become the reference. -->
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
