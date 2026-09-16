# The Den Rebuilt

Dad's ask (verbatim, 2026-09-16): "I also want to change the den. I want to
change it so it's much bigger. I want it to be like the rebuilding rome in
assassin's Creed. You mine/cut/collect a certain amount of resources and you
get to rebuild the town around the den. Each building, monument, pup pen etc
restored offers benefits. Tavern directly gives you hold coins every x
amount of minutes. Forge gives ingotts every x amount of minutes so on and
so forth."

An Assassin's-Creed-style base-building meta-progression: gathered resources
(mining/woodcutting, queued; `js/materials.js`'s crafting materials, shipped
v3.171) spend on restoring buildings around the Den, each of which then
passively generates a reward over real time — the game's own garden bed
(`js/rooms.js`) already proves this exact idiom (a real-world-clock timer,
device-clock-rollback-proof, collected on visit) at a single-plant scale;
this is that mechanic generalized to a whole town.

Queued after mining & woodcutting (this needs something to spend) and
before the dragon-egg side quest, per dad's own backlog ordering.

## Still to design

Research in flight (asset inventory, the Den's current footprint, the
garden bed's exact timer mechanic, the pup pen's current benefit-or-not
status, the Village's own restoration-by-stage precedent, and whether
`js/regions.js` treating the Den as a place that deliberately never heals
would need to change). Loose open questions to resolve once that lands:

- **How much bigger, physically**: one enlarged room, or a real multi-room
  "Den town" the way every other region already is (which the Village level
  already proves works for "a ruined town restored in stages")?
- **What buildings, on what assets**: dad named tavern, forge, monument, and
  "pup pen etc" explicitly — every one has to be a REAL vendored building
  asset, reskinned/positioned the way every other prop in this game is
  (CLAUDE.md's no-code-built-creatures rule has an unwritten structures
  equivalent: nothing gets modelled out of primitives in JS). Building
  count depends entirely on what's actually sitting in the asset packs.
- **The cost ladder**: how much of which resource restores which building,
  and whether that's a flat cost or scales with how many buildings are
  already up (Rome/Ravensthorpe-style settlements usually gate later
  buildings behind earlier ones for a visible sense of a town filling in).
- **The payout ladder**: "coins every X minutes" (tavern), "ingots every X
  minutes" (forge) — needs the exact X, the cap (the garden bed caps
  accrual at some maximum so a long absence doesn't dump an unbounded
  reward), and whether every building pays the SAME two currencies or each
  pays something distinct to its theme.
- **The pup pen's place in this**: dad listed it alongside buildings/
  monuments. If it doesn't already have a restoration-for-benefit shape,
  it may need one to fit the same system rather than staying a one-off.
- **UI**: does collecting from N buildings need its own screen (a "town"
  tab), or does walking up to each building in the (bigger) Den do it the
  way the garden bed already works — walk up, tap, collect?
