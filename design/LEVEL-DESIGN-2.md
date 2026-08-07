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

> **⚠ SUPERSEDED FOR LEVELS 1–3 (2026-08-07).** The graphs below for **Ember
> Hollow, Stoneroot and the Wild Woods are historical**. Those three levels are
> now specified in `LEVEL-MAP.md` at a much larger, non-linear scale (string of
> pearls → hub-and-spoke → loopback ring). The Frostpeak graph below is still
> current. The seven rules above remain binding and the new design satisfies
> them — including rules 4 and 5, which nothing had implemented before:
> every level now has a loop-back shortcut, and every level now has a real
> mid-dungeon twist (Ember's lava cooling · Stoneroot's three hub changes ·
> the Wild Woods blooming from the far side).
>
> **Rule 3 (tiers and one-way drops) is amended by dad's v3.18 law**: drops are
> **walked ledges you choose to step off**, never holes you fall through. The
> Echo Chasm drop-holes were removed for exactly that reason and are not coming
> back.

## Region graphs

### Ember Hollow 2.0 (rebuild pass)
```
Den ── R1 Hollow Entrance ── R1b Ash Warrens (maze, dark pockets, secret)
         │                        │ (one-way ledge drop back into R1)
         R2 Ember Causeway ── R2b Cinder Bridges (key branch)   [DONE v2.5]
         │   POST-BOSS: the R1/R2 lava pools cool to walkable dark basalt
         │   (part of the healing — user rule v3.8.2: lava stays dangerous
         │   until the victory; the Kiln's brazier order puzzle is the twist)
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

### Wild Woods  [BUILT v3.19 — seven rooms; supersedes the old "S3" sketch
###                below, which planned tier-drops and a climb the engine
###                never grew. Shipped shape, not the wish-list:]
```
W1 Thorn Gate ── W1b Mossy Dell  [pup7 + the ICE-SEALED SPRING: region 4's
   │               lock, shown a whole region before its key]
   W2 Gloomwood ── W2b Hollow Oak  [PUZZLE DOOR 1: three cold wisp-lanterns
   │               woken by Fire slams; one walled behind cracked rock, so
   │               the kids chain Earth stomp → Fire slam]
   W3 Rootbound Door  [PUZZLE DOOR 2: twin boulders, twin plates, routed
   │               through a two-gap hedge]
   W4 Bramble Heart (gauntlet + the pre-boss rest)
   W5 Sylva's Glade (boss; the Verdant Wolf + the grant-payout bramble)
```

### Frostpeak  [BUILT v3.21 — seven rooms; the first FLYING boss]
```
F1 Rime Gate ── F1b Frozen Cairn  [pup10 + ice-sealed chest: the Frost Wolf
   │               arrives at the END of this region, so every ice block on
   │               the mountain is a return trip, not a wall]
   F2 Icebound Hall ── F2b Glacier Nook  [PUZZLE DOOR 1: three braziers
   │               sealed in ice. Fire BREATH melts the shell, the fire
   │               SLAM lights the bowl — two verbs of one wolf, chained.
   │               Melted-and-left-unlit seals over again (26s, 45s gentle).]
   F3 Frozen Lake  [PUZZLE DOOR 2: the Stoneroot boulders on SLICK ice. A
   │               push skids until something stops it, so each stone is
   │               bumped sideways into a stopper rock to line up its lane,
   │               then sent north onto its plate. A low snow ridge closes
   │               every other route, which is what makes the lanes read.
   │               Kael himself never slides — deliberate kindness.]
   F4 Windscour (gauntlet + the pre-boss rest + one more ice promise)
   F5 Boreal's Eyrie (boss; the Frost Wolf + the grant-payout ice block)
```

### S3 Wild Woods (superseded design-ahead sketch, kept for its ideas)
```
W2 Hollow Oak (interior climb — tier drops, grub enemies)
W3 Deeproot Warren (maze + Wisp Key branch W3b Firefly Glade)
W4 Canopy Crossing (one-way drops, wind gusts push on bridges)
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
