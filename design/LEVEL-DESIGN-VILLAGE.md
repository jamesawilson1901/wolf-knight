# The Village — an epilogue capstone
**No new form. Every tool the child already owns. Clear it, and watch it wake up.**

Written before the code, same discipline as 5/6/7. This region does not exist
anywhere in STORY-BIBLE.md or WORLD-DESIGN.md — it was never part of the
canon region chain, and this doc is where it becomes one. Confirmed with the
user (2026-08-24) before any code: an **epilogue/capstone**, reached AFTER
Shadow-Grimm is freed, no 8th wolf form, no lock-and-key economy — a pure
combat-sweep-and-restore finale using the seven abilities the child already
has by the time they can reach it.

---

## 1 · What this region is for

Seven regions each taught one verb and asked for it back. Shadow Court asked
for all seven at once and ended the story. **This region asks for nothing
new — it is the victory lap**, the one place in the game where the whole
toolkit is just... available, no gate checking which one, no puzzle asking
which one applies. A child who finishes Shadow Court has *earned* a space
where every button just works.

The verb is **clear it**. Six named guardians, corrupted by the same shadow
that took Grimm (canon per STORY-BIBLE's own reveal — "every wolf form Kael
carries is a piece of his stolen strength," and the same shadow reached
further than Grimm alone). Defeat all six, the corruption lifts, the village
wakes up. No lock stops the child from any guardian at any time — "clear
all" is a checklist, not a sequence, and the checklist is the whole design.

**Why it exists causally**: Grimm is *freed, not killed* (L7's own law) —
his shadow's grip breaks, and with it, the last thing that shadow was still
holding shut: the road to a village near the Den that the shadow cut off
long before the story began. It was never hidden BY the story; it was hidden
BY Grimm's corruption specifically, so its opening is the direct, visible
consequence of freeing him — not a new plot thread bolted on after the
ending.

---

## 2 · The shape: THE OPEN SQUARE

| level | shape |
|---|---|
| 7 Shadow Court | a hub with four locked wings, and a throne |
| **The Village** | **one open square, six houses, no locks anywhere** |

No hub-and-spoke, no ring, no gated wings — every other region's shape
exists to sequence WHICH ability the child has yet. This region has nothing
to sequence, so the map doesn't pretend to: **one central square** with six
short streets/paths radiating to six named structures, each holding one
guardian. All six are reachable from the square from the moment the region
opens. The square itself carries the restoration-progress readout (see §4)
so a child always knows "how many left" without a menu.

### The rooms — 8 spaces (small on purpose: a victory lap, not a new region)

| id | module | role |
|---|---|---|
| `ysq` | arena/hub | **THE SQUARE** · arrival, restoration progress, all six paths |
| `yg1` | pocket | **THE GATE HOUSE** · Hollow Sentinel (shield-advance) |
| `yg2` | pocket | **THE MARKET ROW** · Shade Knight (mirror-kael) |
| `yg3` | pocket | **THE MILL** · Twinblade Husk (flurry) |
| `yg4` | pocket | **THE BELL TOWER** · Wraith Archer (ranged-kite) |
| `yg5` | pocket | **THE BACK ALLEY** · The Lurker (stalker) |
| `yg6` | pocket | **THE CHAPEL ROOF** · Shadow Dragonling (flying-swoop) |
| `yrw` | pocket | optional · a rescued pup, a chest — the one non-combat room |

(Room ids use the `y` prefix — `v` is already Stoneroot's, and `js/rooms.js`'s
kit-loader dispatches on a room id's first letter, so reusing one would
silently route the Village through Stoneroot's cave-kit branch.)

Every guardian room is a dead end back to `ysq` (`loopsTo`), same convention
as every other region's optional pockets — except here EVERY room is built
that way, because every room is optional-order by design. `yrw` is the one
room with no fight in it at all: a quiet payoff room, same "a reward you can
see" law as everywhere else, placed last alphabetically so it never reads as
"the missable one."

---

## 3 · The six guardians

All six roster ids tagged `region: "The Village"` in the original asset-tool
spec — already generated, already rigged, never wired (finding 14). All six
are elite or ranged tier (no trash swarm at all — every guardian is a real,
distinct 1v1-scale fight, the "boss-lite" reading a checklist of six wants),
and all six share `weakness: moon` — this region's own regional law, same
pattern as every other region's TRAITS default, and thematically exact:
these were the shadow's own touch, and moon is what the shadow always fears
in this game.

| room | guardian | class | hp | tell |
|---|---|---|---|---|
| `yg1` The Gate House | Hollow Sentinel | ShieldAdvancer | 6 | `shieldUp`-gated frontal block — the first thing a child meets, and the thing they already know from Stoneroot |
| `yg2` The Market Row | Shade Knight | MirrorKael | 7 | adapts to a repeated element under ⅓ hp — punishes button-mashing one form, rewards switching |
| `yg3` The Mill | Twinblade Husk | Flurry | 5 | one committed swing, two hits inside it |
| `yg4` The Bell Tower | Wraith Archer | RangedKiter | 3 | holds range, kites — the tower gives it real sightlines a ground room wouldn't |
| `yg5` The Back Alley | The Lurker | Stalker | 4 | unaware → suspicious → aware ambush, the one guardian that can be *approached quietly* — a callback to Shadow Court's awareness system, not a repeat of it (no watcher-gate, just one enemy that starts unaware) |
| `yg6` The Chapel Roof | Shadow Dragonling | Dragonling | 7 | roost/hover/dive — the region's one aerial fight, same grammar as the three elemental dragonlings already wired into L1/L4 |

Six distinct AI families, zero repeats, zero new classes — every behaviour
already shipped and audited (task #31, combat audit passes 1-5). This
region's whole build cost is content (rooms + dressing + wiring), not
mechanics.

---

## 4 · Clear all, witnessed

**W8 compliance is the spine of this region**: "restored" must be visible,
not a flag. `WS.stage('village')` counts guardians defeated, 0-6. The
Square (`ysq`) reads it directly:

* Each of the six streets carries a **shadow-dressing overlay** (dimmed,
  desaturated props matching the corrupted-guardian palette) that clears
  the moment ITS OWN guardian falls — one street brightens per kill, so the
  progress is spatial and immediate, not a counter tick.
* The Square's own centre — a dry well or dead tree, TBD at greybox — carries
  a **6-stage visual** (same idea as `stoneRestorationLive`, a live world-state
  change tied to `WS.stage`, not a cutscene) that fills in as each guardian
  falls, so a child glancing at the hub always knows the score without a UI
  read.
* At 6/6, the full **restoration beat** plays (same law as every other
  region: warm light floods, a calm music swap, `restored` flag set,
  revisit-reward per §5) — sunlit, per the task's own name.

No new UI. No new counter widget. The existing pattern (region completion →
warm light + music swap + Den arrival, per GAME-CONTRACT's DEN LIFE law)
already covers "what happens when a region is cleared" — this region reuses
it exactly, once, for the last time.

---

## 5 · What this region does NOT get

Written down so nobody looks for it later, same discipline as L7 §6:

* **No new wolf form, no new FORM_DEFS entry, no new moveset.** The whole
  point is "you already have everything."
* **No lock-and-key gates, no `GATE_TYPES` entry, no promise-gate.** Nothing
  here is inaccessible at any point — W4 (lock before key) doesn't apply
  because there is no lock.
* **No new enemy class.** All six AI behaviours (ShieldAdvancer, MirrorKael,
  Flurry, RangedKiter, Stalker, Dragonling) already shipped in task #31.
* **No new boss class, no HP-phase mechanic.** Six distinct elite fights
  read as a checklist finale, not a seventh boss — Shadow-Grimm already
  closed the story in L7; this region does not compete with that ending,
  it follows it.
* **No new asset.** `assets/generated/enemies/` already has all six bodies
  baked (task #31); dressing reuses an existing region kit (candidate:
  Stoneroot's stone/wood kit, or a new small "village" dress set built from
  already-vendored dungeon/cottage-style pieces — decided at greybox time
  once the space is walked).
* **No timer, no fail state, no escort.** Same L7 law: a victory lap is not
  the place to invent a new way to lose.

---

## 6 · Entry & exit

* Reached from the **Den**, not from Shadow Court directly — a new door/path
  appears at the Den once `state.flags.grimmFreed` is true (the exact flag
  L7's ending already sets), narrated by Pip in one line pointing the way,
  same "gate_promise"-style single organic cue every other gate gets.
* `ysq`'s own spawn door leads back to the Den. No onward door — this is the
  last region, and it loops to the hub like Shadow Court's own optional
  pockets do, not onward to an eighth destination.
* Save-compatible by construction: a new `state.flags.villageRestored`-style
  flag, additive, defaulted `false` for every existing save — no old save
  loses anything, and the Den door simply doesn't appear until `grimmFreed`
  regardless of when a save was started.

---

## 7 · Build order

1. `ysq` + all six guardian pockets as greybox. Verified (`verify-level*.mjs`
   pattern, a new `verify-level-village.mjs`).
2. Wire the six guardians via the existing roster-marker convention
   (`world.markers.<idCamelCase>Spots`, already read generically by
   `spawnEnemies()` — no new spawn code needed).
3. The corruption-overlay + restoration-progress system (§4).
4. Dressing (kit decision made at this step, once the greybox space is
   walked for real).
5. Den-side entry gating (`grimmFreed` flag, new door, Pip's line).
6. Full restoration beat + save flag + wiring into the existing verify
   suite family.

**Greybox before art, without exception** — same law as every region before
it.
