# LEVEL-DESIGN-TRIAL.md — the Trial of the Ten, and two branches

Dad, 2026-09-02, picking three from a shortlist:

> "The Trial of the Ten — behind the Spire. each room is an old boss themed to
> the wolf you choose and are locked into to fight. you then fight another in
> the next room and so on and so forth. they are all much more difficult then
> they originally were. it's essentially a guantlaut beating one after the
> next, roomby room choosing a new element"
>
> "The Drowned Market — a branch off the Vale"
>
> "Ember Deep — burn gates only twice in the entire game."

Read GAME-CONTRACT.md first; this file only records what is different about
these three. The region shipping checklist there applies **except where this
file says otherwise and says why** — none of the three is a region in the sense
that checklist means, and pretending otherwise would break the ending.

---

## Why none of these three grants a wolf

The form ladder is FINISHED. Ten forms, and the tenth — the Elemental Wolf — is
the finale's gift. The checklist asks every region for a "new wolf form + aura"
because that is how regions 1-7 were built, but an eleventh wolf would take the
last thing the ending has to give away and hand it to a side quest.

So: **no new forms, no new world verbs.** All three levels are built out of the
ten wolves and four verbs a child already owns. That is not a compromise. The
Trial in particular is only possible BECAUSE the ladder is complete — it is the
exam for it.

---

## 1. THE TRIAL OF THE TEN — room prefix `g`

Behind the Spire, opened when Shadow-Grimm is freed. Post-game.

### The shape

A ring of ten arches around a central plinth. Through each arch a child can SEE
the boss waiting — the foreshadowing law from LEVEL-DESIGN-2 applies to threats
exactly as it does to rewards, and it is what makes the choice below a choice
rather than a guess.

**At each arch you spend one wolf.** Step in, pick from the wolves you have not
spent yet, and you are LOCKED into it until that boss falls. Ten wolves, ten
bosses, each spent once.

That is the whole design, and everything else follows from it:

- **Each boss is weak to exactly one wolf.** Spend the right one and the fight
  is a fair duel. Spend a wrong one and it is long and grinding — never
  unwinnable, because a five-year-old who mis-drafts must not be dead-ended,
  but plainly harder.
- **So the strategy is the draft, not the fight.** A child can see all ten
  bosses from the ring before spending anything. The lesson the whole game has
  been teaching — every wolf has its moment — becomes the thing they are
  actually scored on.
- **It cannot be beaten by a child who only learned one wolf.** Same law
  Shadow-Grimm's `adapts` enforces in one fight, spread over ten.

### Difficulty, and not being cruel about it

Ten boss fights back to back is a lot for this age band. Per CONFIG.DIFFICULTY:

- **Gentle** — a fall restarts the room AND refunds the wolf. Nobody is ever
  stuck behind their own bad draft. Campfire + potion between every fight.
- **Cozy** (default) — a fall restarts the room and the wolf STAYS SPENT. The
  draft keeps its teeth; the ring keeps its progress. Campfire every second.
- **Brave** — a fall restarts the TRIAL from the ring. Campfire every third.

Progress saves per arch on every profile, so a child can leave and come back
without losing the ring.

### The bosses — ten of them, out of six

There are five `SKINS` rows and Boreal. Ten arches needs ten fights, and
`SKINS` is a pure data table, so the missing ones are rows — but the P7 audit
law (GAME-CONTRACT, "same boss, no different moves, recoloured") is exactly
what that temptation looks like, so every Trial boss needs a real reason to
exist. Two things supply it:

1. **The form lock IS the new mechanic.** "Beat Sylva with only the Frost Wolf"
   is a different fight from the one in the Wild Woods, in the way that
   matters: what the child can do about it.
2. **The unique-move flags compose.** `snares`, `gales`, `floods`, `adapts` and
   `legacyPhases` are independent switches on the same class. A Trial boss
   takes an old skin's silhouette and a move it never had.

Draft (arch → boss → the wolf it answers to). Order in the ring is fixed; the
child chooses which wolf to spend, not which boss to face:

**Dad's calls, 2026-09-02.** Bosses are RE-KEYED FOR THE TRIAL ONLY — a Trial
boss is a re-themed fight already, and the shipped Vale/Woods/Ember bosses keep
the weaknesses they have always had. And the Knight OPENS the Trial: arch one
locks a child into plain Kael, sword and shield, no element and no special,
just the parry the game taught him first. That is what makes the ten genuinely
ten — ten FORMS, not nine wolves and a spare.

| arch | boss | base skin | new move | locked form |
|---|---|---|---|---|
| g1 | The First Lesson | shadowgrip | — (no element answers it) | **knight** |
| g2 | The Shadowgrip, Rekindled | shadowgrip | legacyPhases | dark_wolf (moon) |
| g3 | Aria, Unbound | aria | gales, faster | earth |
| g4 | Sylva, Rooted Deeper | sylva | snares + gales | fire |
| g5 | Meri, Full Tide | meri | floods from the start | verdant |
| g6 | Boreal, Wingbroken | boreal | grounded phases | frost |
| g7 | The Gale Remade | aria | snares | storm |
| g8 | The Drowned Crown | meri | adapts | tide |
| g9 | The Hollow Warden | sylva | adapts | ghost |
| g10 | Shadow-Grimm's Shadow | grimm | adapts + snares | elemental |

g1 answers to no element at all: the Knight has none, so the fight is carried
by gear and the parry, which is the correct opening statement for a trial about
what a child has actually learned.

### Reward

No form, no heart. The Trial pays in the only currency left: the best gear in
the game as one prize, a Den trophy that is visible from the fire, and a
sticker. It is the thing a child does after the game is finished.

### Room prefix

`g` — free. Taken: `d l m s t v x y`, retired `e k r w`.

---

## 2. THE DROWNED MARKET — a branch off the Vale, prefix `d`

Two or three rooms hanging off the Sunken Vale, entered from `d2b`.

**Why it exists:** tide is the least-used verb in the game. Counting promise
gates across every level file: `crack` 4, `shatter` 3, `burn` 2, `cut` 2, and
tide's own gate is the single `system: 'none'` in `level5.js`. A child earns
the Tide Wolf and then rarely needs it.

**What it is:** the market the Vale drowned. Built entirely from props already
vendored and licence-cleared in `assets/env/village` (RG Poly Small Props Pack,
CC0) — `BoatFrame_A`, `FishingRod_A`, `DriedFish_1_A`, `SkinHang_A`, `Basin_A`,
`Trough_1_A`, `Cart_1_A`. A waterside town under the water. **No new
downloads.**

**The verb, mastered:** stalls and walkways that are only reachable on foot
over deep water, so the whole branch is walking on water — the thing the Tide
Wolf is for. One key/lock, three pups, a gold chest at the end.

**No boss.** A branch is not a region; it ends in a reward, not a duel. That
keeps the Vale's own boss the Vale's climax.

---

## 3. EMBER DEEP — a branch off Ember Hollow, prefix `l`

**Why it exists:** the same imbalance, worse. Fire is the FIRST wolf a child
earns and it gates two things in the entire game. The Kiln taught burning and
then the game stopped asking.

**What it is:** under the Kiln. Two or three rooms of burnable growth, charred
bridges to relight, and a heat that rises as you descend — the fire verb used
for traversal rather than as a lock on a door.

**Built from:** the Ember kit already in `level1.js`. No new assets at all.

**No boss**, same reasoning as the Market.

---

## What all three must still do (checklist, honestly applied)

Kept, because they are what makes a place worth walking:

- shaped layouts, loop-back, ≥1 secret per room, 3 pups per branch
- campfire + potion before every Trial fight
- a headless verify script each, and both branches pushed
- narration lines per STORY-BIBLE; a `?dev=1`-drivable route

Waived, with the reason:

- **new wolf form + aura** — see the top of this file
- **new enemy family** — the Trial's whole point is old enemies re-met; the two
  branches are traversal, not new bestiary
- **new world verb** — all four are already taught
- **new music track** — the Trial reuses the boss track; the branches reuse
  their parent region's
