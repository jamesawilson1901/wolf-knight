# LEVEL-DESIGN-2 — Modern Terranigma Layouts (binding spec)

Why Terranigma dungeons worked, translated to our flat-plane room engine.
Every region built or rebuilt from here follows these rules.

## The seven rules

1. **Every dungeon has a CONCEPT, every room a PURPOSE.** Never "room 2" —
   it's the Millhouse, the Nest, the Drowned Stair. The room's layout, props
   and enemies all serve its name.
2. **Shape rooms, not boxes.** Interior wall runs (blockRow) carve L-shapes,
   T-shapes, donuts around a central hazard, and split chambers with two
   mouths. A room's silhouette should be recognizable on the map.
3. **Tiers and one-way drops.** Raised platforms (visual y-offset floor
   tiles + ramp gaps) with LEDGE DROPS: walk off the edge to drop down
   (one-way door zones) — used for shortcuts home and secret access. The
   drop is the modern version of Terranigma's cliff descents.
4. **The loop-back.** Deep progress opens a shortcut back near the entrance
   (we do this once — R3→R1; every dungeon gets one). The player should
   never re-walk a cleared dungeon the long way.
5. **The mid-dungeon TWIST.** Halfway through, the dungeon changes state and
   earlier rooms read differently: lava cools to walkable basalt after the
   key; cavern water drains; the woods bloom lantern-fruit that lights dark
   paths. One flag, rebuilt rooms, world feels alive (our revival system
   already does this post-boss — the twist does it MID-dungeon).
6. **Cadence: fight → puzzle → breather → secret → boss.** Never two
   identical beats in a row. Campfire + potion always directly before the
   boss door. Secrets (burnable/crackable/dark) at a rate of ~1 per room,
   found by LOOKING, not by luck.
7. **Boss doors are EARNED** (key, switch pair, or escort) and every boss
   has a unique verb the dungeon taught for the previous 20 minutes.

## Region graphs

### Ember Hollow 2.0 (rebuild pass)
```
Den ── R1 Hollow Entrance ── R1b Ash Warrens (maze, dark pockets, secret)
         │                        │ (one-way ledge drop back into R1)
         R2 Ember Causeway ── R2b Cinder Bridges (key branch)   [DONE v2.5]
         │   TWIST: with the Ember Key, the R1/R2 lava pools cool to
         │   walkable dark basalt — new shortcuts + one secret reachable
         R3 Heart of the Hollow (boss; shortcut back to R1)     [exists]
```

### Stoneroot 2.0  [BUILT v3.8 — five rooms, each a different test]
```
E1 Cavern Gate ── E1b Echo Chasm  [BUILT: Pokémon fall-hole maze in full
   │                 dark — 3 holes / 3 pockets (ambush · treasure · cracked
   │                 secret), gold climb rings back up, bat nests]
   E2 Deep Hall ── E2b The Mill   [BUILT: TWO millstones → TWIN plates
   │                 through a spike-guarded gap, rogue ambush mid-push,
   │                 both plates open the treasure vault (heart piece)]
   E3 Warden's Crypt (mini-boss)
   TWIST: the E2 millstone plate wakes the machinery — wheels turn in
   E1/E2/E2b, the E1 grate grinds open.  [BUILT v3.6]
```

### S3 Wild Woods (design-ahead)
Concept: a living forest that physically GROWS as you free it.
```
W1 Bramble Edge (tutorial verb: cuttable brambles)
W2 Hollow Oak (interior climb — tier drops, grub enemies)
W3 Deeproot Warren (maze + Wisp Key branch W3b Firefly Glade)
W4 Canopy Crossing (one-way drops, wind gusts push on bridges)
TWIST at W3: freeing the wisps lights lantern-fruit across W1-W2 dark spots.
W5 Heartwood (boss: unique verb = the arena itself grows/changes cover).
```

### Endgame (S8) — the Shadow Court
Multi-wing final dungeon; each wing locked by a region relic and themed on
that region's verb, converging on a final boss with phases that demand
Knight parry, Dark sight, Fire slam, Earth stomp (+ later forms) in turn.

## Build order
1. Ember TWIST (lava cools) + R1b Ash Warrens
2. E1b Echo Chasm + E2b Mill + Stoneroot twist
3. Loops/secrets/tier-drop engine work (one-way door zones, raised tiles)
4. S3 Wild Woods to this spec once packs land
