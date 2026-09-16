# The Den Rebuilt

Dad's ask (verbatim, 2026-09-16): "I also want to change the den. I want to
change it so it's much bigger. I want it to be like the rebuilding rome in
assassin's Creed. You mine/cut/collect a certain amount of resources and you
get to rebuild the town around the den. Each building, monument, pup pen etc
restored offers benefits. Tavern directly gives you hold coins every x
amount of minutes. Forge gives ingotts every x amount of minutes so on and
so forth."

An Assassin's-Creed-style base-building meta-progression: gathered resources
spend on restoring buildings around the Den, each of which then passively
generates a reward over real time. Queued after mining & woodcutting (this
needs ore/wood to spend) and before the dragon-egg side quest.

## What's already true (researched, not yet built on)

- **The Den today**: `js/rooms.js` `buildDen()`, ONE hand-built room
  (24x18 — not on the shared `MODULES`/`shell()`/`sideDoor()` toolkit every
  region uses), already near its own draw-call ceiling (135 max, 137
  measured with everything present). **"Bigger" has to mean a real
  multi-room Den TOWN built on that same shared toolkit** (`M.hub` square +
  1-3 `M.pocket` districts, exactly the pattern `js/levelVillage.js` already
  uses), not cramming more buildings into the current room.
- **The reusable timer idiom** (`js/restoration.js`'s garden bed,
  1020-1167): a raw `Date.now()` timestamp (`WS.set('den','gardenPlanted',
  Date.now())`), a stage DERIVED from elapsed real time
  (`Math.floor((Date.now()-planted)/DAY_MS)`), and a ratchet that only ever
  writes the stage FORWARD (`stage = Math.max(stored, elapsed)`) so a wrong
  device clock can't walk it backwards. No numeric countdown UI anywhere —
  progress is shown diegetically (the plant visibly grows). **This is the
  exact mechanic a building's payout timer reuses**, generalized from one
  planting to N buildings.
- **Building assets**: no tavern/forge/monument-specific model exists
  anywhere vendored. What DOES exist and is already proven: `houses-pack.glb`
  is split into individually-placeable, individually-tintable buildings by
  `js/levelVillage.js`'s `splitBuildings()` (union-find over overlapping
  AABBs) — the Village's whole town is built this way. `hut.glb`,
  `tower-2.glb`, `tower-3.glb`, `walls-pack.glb`, `wagons.glb` are all
  already loaded by that same kit and unused elsewhere. **A Den-town reuses
  this exact kit and this exact split-and-retint technique** — one split
  building retinted warm/hearth-coloured reads as a tavern, another retinted
  dark/iron reads as a forge, purely through `tintedModel()`'s
  corrupt→restored colour blend (the SAME idiom gear/enemies already use) —
  no new geometry, per the standing rule. `FirePlace_1_1_A.glb` (village
  prop set) dresses a tavern's hearth; `Grinder_A.glb`/`Wheel_A.glb` dress a
  forge/mill.
- **The pup pen is decorative only today** (`js/restoration.js`
  `spawnPupPen`, 955-1018): filling a region's row flips a WorldState flag
  and fires a narration/toast callback, no resource payout. Dad named it
  alongside buildings, so it needs the SAME payout hook the others get.
- **The Village's `guardiansDown()`/`blend` model** (continuous 0-6 progress
  driving a corrupt→restored colour mix and a growing flower ring as the
  ONLY progress readout, `js/levelVillage.js`) is the right template for
  "how many of N things are restored" — closer to what a Den-town needs than
  `growthStage()` (which is combat/exploration-driven, per-region weather
  healing). This should be its OWN stage function, resource-spend-driven,
  the same way `guardiansDown()` is its own function rather than reusing
  `growthStage`. `healKeyOf('den') === null` (the Den has no weather/enemies
  to heal) is orthogonal to this and does not need to change.
- **Resources**: `js/materials.js`'s `MATERIALS`/`canAfford(cost)`/
  `spendMaterials(cost)` are already generic multi-line-cost primitives —
  directly reusable for "N ore + M wood restores the tavern." Ore and wood
  themselves don't exist yet; they arrive with the mining/woodcutting system
  this is queued behind.

## v3.176 — one new room, three buildings, the pup pen's first real payout (SHIPPED)

**The scope decision, made before any code**: the current `den` room
(`js/rooms.js` `buildDen()`) measured 137 draw calls against a 135 ceiling
and is not built on the shared toolkit — rewriting or expanding it in place
was judged too risky for a first slice. So this ships as **one new room,
`dr`** ("the Outer Camp"), reached through an always-open door on the Den's
own west wall (mirrored back), built on `js/levelkit.js`'s `shell()`/
`sideDoor()`/`gap()` toolkit at `MODULES.pocket` (20x16) — the same toolkit
`js/levelVillage.js` proved for a multi-building town, an `M.pocket` rather
than a full hub since three buildings do not need one. A bigger multi-
district town is still deferred (see "still to design" below); this is the
same "one proven room first" shape mining/woodcutting shipped with.

**The economy** (`js/denRebuild.js`, mirroring `js/nodes.js`/
`js/materials.js`'s own leaf-module style): a `BUILDINGS` registry, one entry
per structure, each a `spendMaterials()`-gated cost plus a real-time payout
timer. Numbers shipped exactly as drafted, with one addition (the Mill's
own "pays for itself" framing, spelled out below) and one visual fix (the
Mill's restored tint, below):

| structure | asset | cost | payout | interval | cap |
|---|---|---|---|---|---|
| Tavern | split `houses-pack` building, warm retint (`0xd88a4a`), `FirePlace_1_1_A` nearby | 15 wood + 3 ore | 6 shards (coins) | 20 min | 3 |
| Forge | split `houses-pack` building, iron retint (`0x565a62`), `Grinder_A` + `Wheel_A` nearby | 15 ore + 3 wood | 2 `ingot` (new material — feeds future crafting/ultimate recipes) | 20 min | 3 |
| Mill | split `houses-pack` building, pale wheat retint (`0xd9c48a`) | 10 wood + 4 ore | 4 wood | 20 min | 3 |
| Pup Pen | the EXISTING pen in `den` (`js/restoration.js` `spawnPupPen`) — no new geometry | free — already rescued the pups | 4 xp | 20 min | 3 |

Every unrestored building renders in one shared `RUIN_TINT` (`0x716c5e`,
plain unpainted timber) at build time, then in its own theme once
`isRestored()` — the same "next visit reflects the change" contract
`guardiansDown()`'s corrupt/warm split already keeps, generalized to a
timer instead of a kill count. No live re-tint mid-visit (flattenStatic has
already merged the room by the time a child could see it) — restoring or
collecting gets a `js/juice.js` burst instead, the same "small juice moment,
no new VFX" idiom every other system this session shipped.

**The Mill's own "pays for itself" idiom**: 10 wood + 4 ore spent once, 4
wood back every 20 minutes forever after — three collections (~an hour)
already nets back everything spent, and every visit after that is pure
profit, a shape a five-year-old can read without doing the maths.

**The timer is NOT the garden bed's exact formula, and the module header
says why.** The garden bed grows to a capped stage once and stays there
until harvested-and-replanted by hand. A building here has to recur forever
("Forge gives ingots every x amount of minutes so on and so forth" — dad's
own words), so the generalization keeps the garden bed's forward-ratchet
LAW (a device clock can only ever push progress forward, never backward)
but applies it to a different quantity: `since` (the restoration timestamp)
is written once and never touched again; `total` (intervals elapsed since
`since`) is unbounded and keeps climbing forever, which is what lets the
building keep producing rather than dying the moment its first `cap`
intervals have passed; `collected` is a forward-only high-water mark against
`total`, and a `collect()` call pays `min(cap, total - collected)` then
ratchets `collected` all the way up to the CURRENT `total` — discarding
whatever backlog lay beyond the cap rather than leaving it payable again for
free on an immediate second call. An earlier draft advanced `collected` by
only what it had just paid (`collected + n`); `tools/verify-denrebuild.mjs`
caught that this lets a huge backlog (an AFK save) be re-cashed at the cap
again and again with zero real time passing between calls, which is exactly
the exploit the cap exists to prevent. Fixed before ship, and the suite's
own §5 asserts it stays fixed.

**The pup pen** (`js/restoration.js` `spawnPupPen`) needed no new geometry —
`isRestored('pupPen')` is true the moment any pup has ever come home (no
"restore" walk-up, per the design doc), and its own timer starts the first
time anything asks about it. The payout check is piggybacked onto the SAME
`world.updateGrazers` hook the herd's wander/graze animation already runs
every frame in `den` (which only exists at all once a pup is home — the
same condition, so the two never disagree), rather than adding a second
per-frame hook: a nearSpot+edge-flag hysteresis check centred on the six
wander spots' own middle, collecting through `denRebuild.js`'s
`collect('pupPen')` with the same small juice burst every other building
gets.

**The interaction model** is this game's only one — walk into it, nothing
else (`js/nodes.js`'s own header: no tap-to-target anywhere). Each building
carries an approach spot just outside its own footprint; walking into it
either restores (if affordable — unaffordable is silent, `js/nodes.js`'s own
"no tool = does nothing" precedent) or collects (if something is pending).
No new UI, no numeric countdown, no narration line added (a nice-to-have
the brief allowed skipping, and skipped here rather than guessing at the
narration API under time pressure).

**A visual fix caught in the pre-ship look-over**: the Mill's first restored
tint (`0x9a8a6a`, "plain workaday timber") read almost the same as
`RUIN_TINT` on screen — a real screenshot comparison (not inference) showed
the "restored" Mill barely different from the "ruined" one, which defeats
the whole point of a visible before/after. Moved to a pale wheat/cream
(`0xd9c48a`), visibly lighter in a side-by-side shot. The Tavern's warm
orange and the Forge's cool iron grey were both already distinct enough
from `RUIN_TINT` and needed no change.

**`ingot`** is a new `js/materials.js` id (added the same way `ore`/`wood`
were), in the same shared bucket every other material already uses — no
recipe consumes it yet (that is future crafting work, noted below).

Verified: `tools/verify-denrebuild.mjs` (new, 22 checks) — `canRestore`
false/true across the affordability line, `restore()` actually spends and
flips the flag exactly once (a second `restore()` on an already-restored
building refuses and spends nothing further), the forward-ratchet timer
(elapsed time simulated by rewriting the stored WS timestamp directly,
never by waiting), cap enforcement against a manufactured 100-interval
backlog, an adverse clock jump forward never producing a negative-pending
read or a re-pay, `collect()` dispensing the right material/xp and never
double-paying on an immediate second call, the pup pen's own free-restore
and xp payout, and a real room jump (`window.__wkJump`) proving `den` has a
door to `dr`, `dr` has a door back, and `dr` really wires its own
walk-into trigger. `sh tools/lint.sh`, `node tools/verify-boot.mjs`
(precache/badge resynced via `tools/sync-cache.mjs --write` for the two new
modules) and `sh tools/verify-all.sh --quick` all green. A real Playwright
screenshot pass (arrival, each building both un/restored, from multiple
standing spots) confirmed no floating/buried/overlapping geometry before
shipping the tint fix above — the same human-eye-on-the-room law this
project holds every room-contents change to, though the human pass proper
is still owed before this merges to `main`.

## Still to design

- **A bigger, multi-district Den town.** This slice is deliberately ONE
  room with THREE buildings — dad's own "much bigger... rebuild the town
  around the den" ask is only partly answered. A real rollout (more
  buildings, a monument or two, maybe a second room) is a future increment,
  the same "one proven room first" shape mining/woodcutting took before its
  own promised regional rollout.
- **More buildings and monuments.** Dad named "each building, monument, pup
  pen etc" — a monument (a pure milestone/cosmetic reward, no payout) is
  the obvious next structure once the town has room to hold one.
- **A small "town status" HUD element**, the way the sticker book gives
  collection systems their own screen — left out of v1 because a walk-up
  check already answers "is anything ready" without one, and the design
  doc's own original open question (whether collecting needs a HUD) is
  answered "not yet" rather than "no."
- **Tuning** — costs/intervals/caps are a first, reasonable guess (round
  numbers, modest scope, matching the garden bed's own economy-freeze
  philosophy) and are explicitly open to retuning once real play against
  `GAME-CONTRACT.md`'s shard economy says whether 20 minutes/cap 3 feels
  right for a five-year-old's actual play sessions.
- **`ingot` has no recipe yet.** It exists as a material the Forge can pay
  out; a crafting recipe that actually spends it (an "ultimate" upgrade, or
  a new tier) is future `js/crafting.js` work, not this slice's.
- **Visual tool-swap and a live restore moment**, the same open item
  mining/woodcutting already carries forward (`design/MINING.md`'s own
  "still to design"): seeing something happen in-hand or a bigger flourish
  than a juice burst, if it ever earns the extra draw calls.
