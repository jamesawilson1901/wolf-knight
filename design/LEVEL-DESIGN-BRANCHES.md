# LEVEL-DESIGN-BRANCHES.md — two branches off shipped regions

Dad, 2026-09-02:

> "The Drowned Market — a branch off the Vale"
>
> "Ember Deep — burn gates only twice in the entire game."

## THE LAW THAT CAME OUT OF SCRAPPING IT

Dad, asked why the Trial went: **post-game content is the wrong target — the
kids are not finishing the game yet.**

That is the most useful sentence in this file and it outranks every clever
idea. A level nobody reaches is worth nothing however good it is, and this
project has one real audience whose progress is known. So, standing rule for
every level proposal from here:

**Build where the players actually are.** Region 1-3 content beats region 6-7
content beats post-game content, every time, regardless of which is the more
interesting design problem.

It has an immediate consequence this file has to be honest about. **Ember Deep
is Level 1 — the kids will walk into it.** The Drowned Market is off the Vale,
which is REGION 6, and by dad's own reasoning is nearly as unreachable as the
Trial was. Its premise still holds (tide is the least-used verb in the game)
but its audience problem is the same one that killed the Trial. Ember Deep is
therefore first, and the Market should be re-examined against a cheaper
mid-game alternative before it is built rather than after.

## SCRAPPED: the Trial of the Ten

A third level was specced here and dad scrapped it before any of it was built:
a post-game gauntlet behind the Spire, ten arches, one old boss per arch, the
player locked into one form per fight. **Do not rebuild it from this file** —
it is gone on purpose and the reasoning below was written for three levels, not
two.

One piece of it survives because it is generally useful and already tested:
`formsAvailable()` in js/state.js and `state.formLock`, which lock the player
into a single form from every direction that can change one (setForm, the tap
cycle, Tab, the radial picker). It is inert — `formLock` is null everywhere in
the shipped game — and covered by tools/verify-formlock.mjs. Any future design
that wants "you may only be the Fire Wolf in here" has it ready.

Read GAME-CONTRACT.md first; this file only records what is different about
these two. The region shipping checklist there applies **except where this file
says otherwise and says why** — neither is a region in the sense that checklist
means.

---

## Why neither branch grants a wolf

The form ladder is FINISHED. Ten forms, and the tenth — the Elemental Wolf — is
the finale's gift. The checklist asks every region for a "new wolf form + aura"
because that is how regions 1-7 were built, but an eleventh wolf would take the
last thing the ending has to give away and hand it to a side quest.

So: **no new forms, no new world verbs.** Both branches are built out of the
ten wolves and four verbs a child already owns.

---


## 1. THE DROWNED MARKET — a branch off the Vale, prefix `d`

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
Wolf is for. One key/lock, a gold chest at the end, and NO PUPS (see below).

**No boss.** A branch is not a region; it ends in a reward, not a duel. That
keeps the Vale's own boss the Vale's climax.

---

## 2. EMBER DEEP — a branch off Ember Hollow, prefix `l`

**Why it exists:** the same imbalance, worse. Fire is the FIRST wolf a child
earns and it gates two things in the entire game. The Kiln taught burning and
then the game stopped asking.

**What it is:** under the Kiln. Two or three rooms of burnable growth, charred
bridges to relight, and a heat that rises as you descend — the fire verb used
for traversal rather than as a lock on a door.

**Built from:** the Ember kit already in `level1.js`. No new assets at all.

**No boss**, same reasoning as the Market.

---

## What both branches must still do (checklist, honestly applied)

Kept, because they are what makes a place worth walking:

- shaped layouts, loop-back, ≥1 secret per room
- a headless verify script each, and both branches pushed
- narration lines per STORY-BIBLE; a `?dev=1`-drivable route

**NO BRANCH MAY CARRY PUPS.** Found building Ember Deep, 2026-09-02, before it
shipped. The extra-heart awards in main.js `onPupCollected()` are keyed on a
GLOBAL RUNNING COUNT — 3 pups is Ember's heart, 6 is Stoneroot's, 9 the Wild
Woods', 12 Frostpeak's. Three pups in a branch off region 1 would have handed a
child Stoneroot's heart before they reached Stoneroot and fired
`all_pups_stone` in the wrong region. While that counter is global, a branch
pays in shards, gear, heart pieces and potions — never pups.

Waived, with the reason:

- **new wolf form + aura** — see the top of this file
- **new enemy family** — both branches are traversal, not new bestiary
- **new world verb** — all four are already taught
- **new music track** — each branch reuses its parent region's
