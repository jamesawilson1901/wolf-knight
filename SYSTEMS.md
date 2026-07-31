# SYSTEMS.md — the reusable region-building systems (plain English)

Written for future region builds. Each system is data-driven: adding content
means adding entries/placements, not new engine code.

## Ability Gates (js/gates.js)
Obstacles that only a specific wolf form opens. A gate the player can't open
yet must read as a PROMISE (distinct look + mystery entry), never a bug.
- `boulderGate(world, prepareModel, rockGltf, id, x, z)` — one huge smooth
  gold-veined stone. The Earth Wolf's stomp clears it (it rides the existing
  crackables list, so no new code paths). Skipped at build if already smashed.
- `waterGate(world, x, z, w, d)` — animated water band + collider. Opens in
  the Tide Wolf's region (6). Until then it just blocks and glitters.
- `brazier(world, prepareModel, torchGltf, id, x, z, onLit)` — a cold bowl
  the Fire Wolf's slam ignites (the slam calls `world.igniteAt`). Wire any
  consequence through `onLit`. Optional `b.gutterAfter = seconds` makes it
  die back down (timed puzzles). This is the Kiln's whole puzzle language.
To add a gate to a new room: one call + a marker for the hint system.

## WorldState (js/worldstate.js)
Named per-region flags persisted in the save (`state.flags.world`):
`WS.set('ember', 'kiln_doorB')` / `WS.get(...)`. Rooms read them at build
time to decide what exists (opened doors, healed ground, calmed vents).
Because rooms rebuild on entry, a flag flip = a visibly changed world.

## Mystery Log (js/worldstate.js + map screen)
`logMystery(id, icon, label)` the first time the player SEES a locked thing
(returns true once → show the "🗺️ Added to the map: ???" toast).
`resolveMystery(id)` when it's opened. Unresolved ones render as ??? cards
on the map screen. This is the "reasons to come back" memory for kids.

## The hint rule (no quest markers)
Every secret gets at least two organic pointers: it can be stumbled onto,
AND an NPC line / Pip sparkle / visual cue points at it. Locked gates use
Pip's `gate_promise` line + the mystery toast.

## Dungeon pattern (the Kiln is the template)
Hub with 3 doors: A open, B locked by the region mechanic, C locked by the
dungeon key. A grants the region's wolf form at a shrine mid-dungeon, then
teach → test (twist) → combine (with combat). B is a puzzle in the mechanic
language, yields the key, and opens a far-side shortcut to the overworld.
C is the boss. Campfire + potion in the hub. Every puzzle self-resets.
