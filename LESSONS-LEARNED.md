# LESSONS-LEARNED.md — Wolf Knight, as a black box

This document is not a history of what Wolf Knight *is*. BUILDLOG.md already
does that, room by room, version by version. This is a history of what it
*cost* to get there — every mistake this project made, why it made it, what
stopped it happening again, and what that implies for the next game built
the same way: one dad, one kid audience, one AI doing most of the typing,
no formal QA team, no second engineer to catch what the first one missed.

**Method, aviation-style.** An incident is read for its systemic cause, not
its blame. "A model was the wrong size" is not a lesson; "nothing in the
pipeline ever measured a model against its own declared pivot before
placing it" is. Every entry below follows that shape: what happened, why it
was *possible* for it to happen, what changed so that whole *class* of
mistake became harder to make again — not just that one instance of it.

The raw material is exhaustive: the full CLAUDE.md standing-rules list (each
rule already carries its own incident citation), all 5,702 lines of
BUILDLOG.md, docs/TESTING.md in full, tools/known-fail.txt, the design docs'
own changelogs, and several dozen git commit bodies pulled for postmortem
language across 712 commits. Section 0 below is the one finding worth
reading even if nothing else is. Section 9 is the part meant to be lifted
wholesale into the next project's own CLAUDE.md on day one.

---

## 0. The one meta-lesson, stated once

**Reading the code, or running one narrow check, is not evidence that
something works. Only driving the real thing through its real path and
measuring the real result is evidence.**

Every category below is a specialization of this one failure mode:

- Code review can't see a 9cm-tall "crate" (it's really a stack of planks —
  §5), a boss telegraph mirrored 162° off at six of seven facings (§4), or a
  boulder puzzle geometrically unsolvable by 0.24 units (§4).
- A unit test that calls a function directly instead of driving player input
  can pass while the real player path is broken (§7).
- A green test suite is a claim about what the suite *asked*, not about the
  game. Eighteen green suites and one unreachable boss coexisted for real
  (§3.1). Six real bugs shipped behind an entirely green sweep in one batch
  alone (§3.5).
- A screenshot of a rough/pre-restoration render can look like a bug and
  not be one (§7); a screenshot at the exact wrong moment (mid-transition)
  can look broken and not be (§3.1).

The project's own standing description of the antidote, verbatim from
CLAUDE.md: *"Verify fixes via real input paths (actual room jumps, real key
presses through the `?dev=1` harness), not by inference from source alone."*
Every section that follows is what happens when that discipline is
missing, and what closed the gap once it was found missing.

---

## 1. Table of contents

1. [The one meta-lesson](#0-the-one-meta-lesson-stated-once)
2. This table of contents
3. [Testing & verification philosophy](#3-testing--verification-philosophy)
4. [Documentation & registry discipline](#4-documentation--registry-discipline)
5. [Room & level design pitfalls](#5-room--level-design-pitfalls)
6. [Collision, physics & asset measurement](#6-collision-physics--asset-measurement)
7. [Caching, deployment & build pipeline](#7-caching-deployment--build-pipeline)
8. [Human–AI collaboration process](#8-humanai-collaboration-process)
9. [Asset & content pipeline discipline](#9-asset--content-pipeline-discipline)
10. [The framework — set this up on day one of the next build](#10-the-framework--set-this-up-on-day-one-of-the-next-build)

---

## 3. Testing & verification philosophy

This is the largest category in the project's history by a wide margin —
not because testing was neglected, but because testing a *game* (real-time,
async, physically simulated, AI-vs-human-input) breaks in ways unit testing
a web form never does, and every one of those ways had to be discovered by
being burned by it once.

### 3.1 A green suite answers the question it asked, not "does the game work"

The single most expensive discovery in the project. Dad reported: *"There is
no boss fight available in level one. I searched every room and there's
nothing... a complete impasse"* — reported while every existing suite was
green. Root cause: the level's own hero prop (a 5.2-radius hearth) sealed
the only doorway to the boss arena. The suite that "proved" the level had no
dead ends walked the door *graph*; nothing walked the physical room with
real collision. A companion suite ran only 3 of 32 suites that existed on
disk, because its manifest was a hand-kept list that had silently fallen
behind — the same rot described in §4.

A later batch of dad's own replay testing shipped **six real bugs** behind
an entirely green sweep. The finding wasn't that six bugs existed — it's
that every suite up to that point asked *"does this feature work"* and none
asked whole-game questions. Four permanent, full-registry suites came out
of naming those questions explicitly:

- Does repeating an action without moving ever act again? (A shard socket
  paid out every single frame a child stood still on it — 3,504 coins from
  doing nothing.)
- Does every rigged enemy's body actually *move*? (A skinned mesh gliding in
  bind pose passes every damage check and every screenshot.)
- Does every prop sit inside its own room, on the floor? (A wrong coordinate
  frame put campfires at room origin; screenshot audits only ever review
  the arrival frame, never the whole room.)
- Does a door put you down somewhere you can actually stand? (A *static*
  regex scan suggested ~30 doors faced a wall; the *dynamic* version —
  actually resolving a body circle against the real built room — found the
  true number: one, out of 261. Static analysis of a physical property is
  not physical analysis.)

A follow-up batch, from twenty playtest screenshots, added four more
behavioral classes worth asking of *any* interactive world: can a child
*reach* the reward (not just "is it placed"); does the reward arrive where
the child is *standing* (not just "is the flag set"); do the rooms *look*
like places (not just "does the topology check pass"); is a difficulty
claim actually *measurable* (drive a masher bot with no reading/dodging and
watch the numbers, don't guess).

**The rule now:** a report says *"N new invariants now run automatically,
and here is what still needs your eyes,"* never *"content complete, all
green."* Coverage is a floor, not a verdict.

### 3.2 Graph connectivity, predicate logic, and door-existence are not the property you actually care about

Three separate, structurally identical bugs:

- A door-graph BFS proved no dead ends while a physical collider sealed the
  one real path (§3.1).
- A puzzle-door suite ran six checks, all against the door's logical
  `when()` predicate — none against the actual doorway with real collision.
  When a physical bar collider was added, the suite would have stayed green
  whether or not the bar ever opened, or opened behind an invisible wall.
- A "does this open the reward" chest test placed the player *at* the
  chest — the one thing a five-year-old cannot always do. A flood-fill from
  spawn found a vault permanently sealed by the very block that was
  supposed to unlock it, with the success flag already set.

**The rule now:** test the concrete physical effect (a collider gone, a
body able to stand somewhere, a flood-fill reaching a point from spawn),
never the abstraction that's supposed to produce it (a boolean flag, a
graph edge, a placed-at-target proof). If a check can be green while the
underlying mechanism is broken, it will eventually be green while the
underlying mechanism is broken.

### 3.3 A probe can measure a frozen, wrong, or paused game and report a confident number anyway

Recurring, and each instance independently discovered before the pattern
was named:

- `state.room` updates the instant a jump is *requested*, before the async
  rebuild starts — a probe reading it "passes" while the previous room is
  still on screen. Wait on `world.roomId`, stamped as the *last* step of the
  builder, instead.
- Under a slow/headless renderer the game clamps its own delta-time, so
  wall-clock sampling of physics can catch an object mid-arc and "prove" it
  never moved. Drive the real update function with a fixed deterministic
  dt instead of sampling real time.
- A coin-bounce probe reported "2 collected" one run and "0" the next on
  identical code, because it never held narration open, and the main loop
  returns early while a story line plays — the probe was measuring a paused
  game and calling the result truth.
- A UI-animation check waited a flat, guessed duration before measuring
  geometry. Correct on an idle machine, wrong on a loaded one — sent a real
  debugging session chasing a phantom regression. Poll until the
  measurement stops changing across consecutive samples; never wait a
  guessed duration for anything that animates.
- Headless Chromium died mid-suite at a different point every retry, with
  every completed room reporting clean geometry — the inconsistency itself
  was the tell that this was environment starvation (`/dev/shm` at its
  default 64MB, OOM-killing a renderer), not a regression.

**The rule now:** before trusting any measurement, ask what state the game
was actually in when it was taken — was it mid-transition, paused by a
dialogue line, running at a clamped clock, or a process that had silently
died and restarted mid-log. A number with no state check behind it is a
number that happened to be true this once.

### 3.4 Zero is not evidence of absence; it's often evidence the probe never fired

A projectile-shape probe reported zero results for every form — the bug was
in the probe: a `Tab` keypress never actually cycled forms because an
earlier form-grant in the same script had only granted one form. A
screenshot that reads as flat black is not necessarily a render failure —
it may be a genuine mid-fade frame; the fix was a mechanical "flat-frame
rule" (a real 740×360 frame compresses to roughly 200KB; anything far below
that throws as invalid evidence rather than being silently accepted).

**The rule now:** a null or zero result needs the same scrutiny as a
positive one. Confirm the action you expected to trigger the measurement
actually fired, through the same real input path everything else is held
to.

### 3.5 A test using the wrong tool for the job produces a confident, wrong answer

- A pup-reachability sweep used `world.blocked()` (the *prop keep-out
  register*, which deliberately answers "true" at every correct pup spot,
  since it reserves standing room there) and flagged every long-shipped,
  definitely-collectable pup as broken. Walkability checks need
  `resolveCircle()` + `hazardAt()`, not the placement-reservation system.
- `node --check` on this codebase's ES modules exits 0 even with a broken
  `if/else` chain further down, because CommonJS parsing simply stops at
  the first `import` statement. It gave two false passes in one session,
  including a syntax error that meant the game didn't boot at all.
- The stuck-bot wedge diagnostic read a field (`g.state.clock`) that didn't
  exist, silently returning `undefined` (read as falsy), producing a
  plausible-looking *wrong* diagnosis ("the world is frozen") for what was
  always ordinary geometry-wedging — two full debugging passes were spent
  chasing the wrong cause before the diagnostic itself was found broken.

**The rule now:** know what a function or tool is actually *for*, not what
its name suggests, before trusting its answer. `node --check` is not a
syntax check for ESM. A keep-out register is not a walkability oracle. A
diagnostic script is exactly as trustworthy as its own code, and its own
code is exactly as untested as everything else until proven otherwise.

### 3.6 A test's own infrastructure needs the same rigor as the game it tests

- The shared "walk to a point" test helper drove straight-line real keys
  with no path-planning — any prop between the bot and its target wedged it
  dead. This was independently misdiagnosed as "the game is broken" in at
  least two different rooms before anyone recognized it as one root cause
  in the shared driver. Fixed once (pathfinding added to the driver, not
  worked around per-suite) rather than chased forever as separate
  mysteries.
- A rotation-degrees-conversion bug *inside a verifier* (`90/π` instead of
  `180/π`) reported a correct 40° cone as failing. The game was right; the
  measurement was wrong. Recorded explicitly as its own lesson: trust
  the thing under test only as far as you trust the thing measuring it.
- A sampling ring for "can you see the door from here" placed fixed-radius
  points; in one mountainous room every point happened to land inside solid
  fill, silently collapsing a 24-point check back into the single-point
  version it was built to replace — while still printing a plausible
  finding. The fix: assert the sample count itself, don't just trust it.
- A suite verified by first running it against the pre-fix code and
  confirming it actually fails there. *"A verifier that cannot fail is the
  thing this repo has been bitten by twice."* Treat a new check the same
  way you'd treat new game code: prove it can say no before trusting it to
  say yes.

**The rule now:** test tooling is code, and code has bugs. A wedged bot, a
failing check, or a confident negative result is exactly as likely to be
the *tooling's* fault as the game's — check the tool before re-diagnosing
the game for the third time.

### 3.7 Environment and process failures dress up as game bugs

- `pgrep -f "node tools/verify-x"` matches any process whose full command
  line contains that text — including its own wrapper heredoc — so a
  `pkill` with the same pattern could kill the orchestrator, its own
  watchers, and the caller's shell in one swing. Cost roughly an hour of
  phantom wedges. Fix: record `$!` and wait on the actual PID, or run
  stages sequentially with `timeout` guards so there's nothing left to
  pattern-match against.
- A long-running background suite was silently *restarted* under the
  session rather than continuing — the log kept replaying from its first
  line while wall-clock minutes passed, and three separate "hangs" chased
  in one afternoon were actually three fresh, silently-relaunched runs.
  Fix: run drivers in the foreground under a hard timeout, and design each
  suite to be short enough to fit inside it — a constraint on the suite,
  not a workaround for the symptom.
- Suites run three-at-a-time can fail purely from CPU contention. Standing
  rule: any parallel-mode failure must be re-run serially before it's
  trusted, and two browser-driving suites should never be run by hand at
  the same time. CI sidesteps the whole problem by sharding across separate
  *machines* — serial within a shard, parallel only between machines —
  which the project calls "the shape parallel verification should always
  have had."

**The rule now:** before debugging the game, rule out the harness. A hang,
a flaky failure, or an impossible-looking result is disproportionately
likely to be a process-management or resource-contention problem, and those
have their own, much shorter, diagnostic path once you know to look for it.

### 3.8 A finding without a measurement attached is a wasted morning, twice

An arrival-view check fired on one room across two consecutive sweeps,
printing only the offending prop's *name* — no distance, no hit point, no
spawn coordinate. Reproducing it cost an afternoon of probing; the finding
then simply stopped reproducing, with no code change able to explain why,
across a 146-room registry with too much state to isolate by hand.

**The rule now:** a check reports the *measurement* (distance, hit point,
exact coordinates), never just a verdict — every hour spent later is spent
recovering information the check already had in its hand and discarded.
And a bug that stops reproducing is not a bug that's fixed: it stays open
on the tracking board, because "it went away" is how a bug comes back.

### 3.9 A constantly-firing check is functionally a silent one

A "rot guard" correctly printed the same eighteen missing-suite names on
every single CI run, for long enough that the red became scenery and
nobody acted on it. **The rule now:** when a guard fires *every* time,
that's not evidence the guard is thorough — it's evidence the underlying
hole should be closed structurally (derive the list live) instead of
watched forever. A check that always fails teaches nothing; delete it and
fix the actual gap.

### 3.10 What a real playtest batch is actually good for

Across three separate real playtest batches, 13 of 22 total findings were
"something looking wrong in a place" — the exact class of bug a green
automated sweep structurally cannot catch, and a single screenshot always
will. The standing practice that resulted: a playtest report needs exactly
**three things** — a room id, one screenshot, one sentence. Deliberately
not enough detail to guess from; deliberately requiring the reporter to
point at the real, reproducible thing. This directly feeds the "look at the
room" contact-sheet requirement described in §10.

---

## 4. Documentation & registry discipline

If §3 is the largest category by lesson count, this is the single most
*repeated* root cause in the whole project: **a hand-typed list will rot,
every single time, because nothing forces it to stay in sync with the thing
it describes.** It happened to room lists, door lists, item lists, module
lists, and design docs, independently, at least a dozen separate times.

### 4.1 The recurring bug class, named explicitly in the project's own testing doc

Documented verbatim as *"the recurring lesson of the whole batch, for the
fourth time"*: a door-landing suite carried a 130-name array that had
already rotted once (documented in its own header) and rotted again past
three entirely new regions — the suite whose whole job was "does a door put
you down somewhere you can stand" had no opinion at all about six brand-new
rooms. In the same sweep: a dangling-door check's two-name neighbor list
flagged a real, working door as broken the moment a new room shipped beside
it; a room-density suite's list missed an entire region, an entire town
hub, the home base, and another whole region — four separate silent gaps at
once; a "no door to a nonexistent room" check compared against a
one-level-wide set, so every door *leaving* that level read as dangling and
only stayed accidentally green by coincidence; two unrelated suites both
read hand-copied lists of level modules that had simply never heard of a
newer level file.

**What changed:** one function — call it `allRooms(page)` — imports the
*live* room registry from the already-running game, and every full-registry
suite is required to use it instead of maintaining its own copy. Several
suites additionally switched to reading the deploy pipeline's own generated
asset manifest (guaranteed complete by construction) rather than keeping a
third independent copy of "every file in the game."

### 4.2 A missing entry doesn't fail — it goes silent, and silence is worse than a failure

A completeness check (comparing a hand-kept list against the live registry)
found an entire town hub, the home base, and a whole region had *never once
been measured* by the density suite that was supposed to cover every room
in the game. One of those region's rooms had a completely flat, untextured
floor — since the region shipped — and survived specifically *because* it
was invisible to the one check that should have caught it. **"A missing
room is not a failure, it is silence — the suite prints ALL CLEAR over
content it never opened."**

The same shape recurs for a "narrowed" test run: once a landing-check suite
accepted a room-name filter (a genuine performance need — a full run cost
an hour), a filtered run could quietly skip checking a destination room
that had never been built, silently reintroducing the exact "skip and call
it clean" failure the full-registry rewrite had just fixed. **The fix:** a
narrowed run must still be able to *answer* the question for everything it
touches — pull in one hop of destinations automatically, and fail loudly
if something it depends on was never built. A performance shortcut that can
quietly narrow what's actually checked is the same rot in a faster wrapper.

### 4.3 New content needs registering in more places than anyone remembers, and none of them fail loudly on their own

At least four independent instances of the same structural gap: a room-id
prefix dispatch system falling through to a silent plain-box default with
no crash and no error when a new prefix wasn't registered (so a whole new
town's first playtest had literally no loot in it, and nothing anywhere
said why); a ground-texture style name that didn't exist falling back to
generic dirt with only a console warning (an entire frozen-harbor region
drew as bare earth and only "passed" its own floor-variance check because
the *fallback* happened to have texture variance); new rooms needing manual
addition to the offline-cache precache list or vanishing entirely when a
device is offline; new rooms needing manual addition to a density suite's
hand-kept list or never being measured at all.

**The rule now:** every one of these has been progressively replaced with
either a completeness check (silence becomes a hard failure) or, better,
derivation from one real source of truth (the actual import graph, the
actual live room registry) instead of one more manual step to remember.
When in doubt: don't add a checklist item for a human to remember — remove
the thing that needed remembering.

### 4.4 A flag can be written faithfully for months and never once read

A boss-defeat handler wrote a "region restored" flag on every single boss
kill since the feature's introduction. A `grep -c` across every level file
in the game found **zero** real reads of it anywhere — the one hit that
came up was a comment. A child could beat a region's boss and walk back
through a region that had not visibly changed by a single pixel, for
months, because the write-side of a feature shipped and the read-side never
did. **The rule now:** a state flag with no consumer is not a completed
feature with a bug in it — it's an *unbuilt* feature that happens to
compile. Grep for real reads of anything you write, not just for the write
site itself.

### 4.5 Two code paths answering the same question independently will eventually disagree

As rooms were rebuilt under new ids, old ids were redirected through a
lookup table. But a dozen separate systems — narration triggers, the
music-routing table, the pup counter, fast-travel unlocks, the map screen —
each independently keyed off *either* the raw pre-redirect id or the
resolved one, depending on which was convenient at that call site. Result:
three region-completion narration lines were structurally dead (could never
fire, ever); fast-travel destinations never unlocked; a boss arena played
the *previous* region's music depending on which of two doors a child
happened to use to walk in.

**The rule now:** resolve an identity question exactly once, as early as
possible (a single `loadRoom(rawId)` that resolves once at the top), and
have every downstream system consume that one resolved value. The moment
two code paths can each independently decide "which room is this," they
will eventually decide it differently.

### 4.6 Design docs need one arbiter, not a vote

A full-project audit found the shipped region roster disagreeing with
several design documents at once. The resolution was a single explicit
ruling (the newest addendum is canonical over the older doc) applied once,
in writing, rather than negotiated per-document. Two related standing
practices: `GAME-CONTRACT.md` keeps an explicit "adopted law, code catching
up" section — rules the team has *already* agreed to that the code doesn't
satisfy *yet* — so drift is tracked as a to-do, not silently lived with;
and a hand-kept voice-line transcript was replaced by generating it
straight from the actual narration data table, closing the drift
permanently instead of re-syncing it by hand each time.

**The rule now:** when two documents can describe the same ground truth,
name one arbiter explicitly (a ruling, or a canonical generated source)
rather than letting both keep existing as equally-plausible truth.

---

## 5. Room & level design pitfalls

Distinct from §3/§4 (which are about *detecting* problems): this section is
about what actually goes wrong when placing content in 3D space for a
non-reading five-year-old to navigate with a joystick, under a fixed
camera.

### 5.1 A verifier cannot tell you a room is boring

Dad's verdict on the earliest rebuilt levels: *"largely filled with
nothing… big but bare… not like Zelda or Terranigma."* Measured
afterward: one level used 3 of 25 available dungeon props; another used
*zero* of 14 available forest-specific models, reaching instead for two
generic placeholder trees; only 33 of 115 vendored models were in use
across three fully "shipped" levels. Every topology and reachability
assertion passed the entire time — nothing had ever measured density or
variety, because "is this room boring" isn't a question graph traversal can
answer. **What changed:** an explicit room-content standard, written from
dad's own specific answers about what a room should carry, checked by
density suites *and* by human eyes on a contact sheet (§10).

### 5.2 The camera has a permanent blind zone, and it will eat anything placed in it

A fixed 3/4-angle camera cannot show roughly the last 2.5 units of floor
before a room's south wall — a real, mechanically measurable dead zone.
Interactive content (tutorial props, checkpoints, NPCs) was repeatedly
placed inside it and was therefore invisible to a child who was, in
principle, standing right next to it. First attempt to measure this
mechanically was itself wrong (it derived the wall edge from the largest
flat mesh in the room, which is the ground plane, overestimating the safe
zone by several units) — re-derived from the actual southernmost solid
collider instead, which immediately found sixteen violations where the
first pass had found none.

**The rule now:** know your camera's real, fixed geometry (it does not
rotate with the player and does not scale with room size) and check every
placement against it mechanically — "a teaching moment the camera hides
teaches nothing."

### 5.3 Connectivity is the floor, not the bar

A flood-fill proving two points are topologically connected does not prove
a five-year-old can actually drive a joystick through the gap — a lane
measured "connected" at three units wide between two obstacles still wedged
the project's own automated test driver, twice. **The rule now, stated
exactly:** "connectivity is the floor, not the bar." Widen for a child's
actual control precision, not for the minimum a flood-fill will accept.

### 5.4 A locked door built without its unlocking mechanism is worse than a wall

A "promise gate" system drew the visual obstacle and registered a
collision box, but for four gates across three levels was never actually
wired into any of the four verb systems (fire/cut/stone/ice) that were
supposed to open it — a permanent wall, advertising a form-verb that would
never work, with a visible reward behind it forever. **This is worse than a
plain wall**, because a child who remembers the promise and returns with
the right ability is told, wordlessly, that they were wrong to trust it.
Fixed by requiring every promise gate to register with a real gate system
at creation time — no visual promise can exist without its mechanical
payoff wired in the same commit.

Immediately after that fix shipped, the very first live verification found
a second, related bug in the same feature: with the gate still standing,
every reward behind it was *already reachable by walking around it* — five
separate obstacles all stood loose in open rooms with no alcove forcing the
approach through the gate itself. **A gate with open floor on every side is
not a gate.** Fixed by rebuilding each one inside a proper two-wall alcove
— which then bumped into a *third* problem: a piece of collectible content
that had been sitting inside one of those alcoves had to be relocated, "the
shape of mistake this whole exercise is about: the fix for a fiction
problem quietly created a progression problem." Fixing one bug can create
the next one; re-verify the whole feature after any structural change to
it, not just the specific defect you targeted.

### 5.5 Progression-critical content placed slightly off the line a child actually walks might as well not exist

Two separate real incidents, same shape: a region's entire progression
hinged on a single unlit shrine sitting four units off the worn path — dad
reported *"the rooms just end suddenly."* Separately, a hub-and-spoke
region's progression trigger for each spoke sat a few units off the walked
line while a shortcut straight back to the hub sat directly on it — dad
reported *"the rooms loop back to the start and there's nothing you can
do."* Both were provably reachable by every flood-fill/topology tool the
project had; neither was reachable by a child following the path their own
feet actually wear into a level.

**What changed:** progression-critical props got made impossible to miss
(the brightest light source in the room, visible from the doorway); a
"walk the straight line door-to-door, aiming at nothing" check was added to
measure how close the natural line comes to the actual objective; a
shortcut door was changed to open only once its spoke's milestone lands,
so the loop's own repetition becomes the signal something was missed,
rather than an escape from ever noticing.

### 5.6 A reward with no travel time teaches nothing was ever collected

Coins spawned exactly on top of the pot a child just smashed, and the
pickup-radius check ran on the very first frame — so by the time anything
was drawn on screen, it had already, silently, been "collected." Dad's
report: *"you'll smash it and hear the coin sound and the counter goes up
but nothing is visible."* Fixed by giving every dropped item real visible
flight — launch, arc under gravity, land, *then* become collectible.
**The general rule:** any reward whose grant and whose visual appearance
aren't the same event will eventually be reported as "nothing happened,"
because to the player, nothing did.

### 5.7 Two visually-identical interaction grammars in the same game is a trap for a non-reader

Standing chests opened on proximity; a second, visually near-identical
chest-shaped breakable required being physically struck instead — roughly
one in three rooms from partway through the game onward. Dad's report:
*"all these types of chests through every level do not open or give
anything."* A five-year-old walks up to a chest; they don't square up and
swing at it. **The rule now:** one visual grammar, one interaction. If two
systems happen to produce the same silhouette, they must behave the same
way, or one of them needs a different silhouette.

### 5.8 A puzzle's own solved state can seal its own reward

A push-block corridor measured exactly two meters wide; the block itself
is 1.24 units across and a child's body 0.64 — two meters holds one or the
other, never both at once. Solving the puzzle (pushing the block to the far
end) permanently parked it across the only way to the reward chest behind
it, "silently, with the puzzle flag set and the room reporting success."
**The rule now:** measure a puzzle's corridor against *solved state plus
standing room*, not just against the puzzle piece in isolation.

### 5.9 Copy-pasted coordinates carry their old room's assumptions with them

Three doors were written using an island-room's landing coordinates on
doors that actually opened into much smaller pocket rooms — arriving
players materialized outside the walkable floor entirely, in some cases
permanently. Separately, an entire prop-placement layout (seven items) was
authored against one room size and then reused, unmodified, as a template
across several differently-scaled rooms, rendering props outside the
smaller rooms' actual walls. In both cases the first hypothesis (a pivot
bug in the new asset, a rendering fault) was tested and specifically
disproven by measurement before the real, boring cause (coordinates from
the wrong size class, copy-pasted) was found.

**The rule now:** a landing coordinate should be measured against *this*
room's own `spawn`/extent, not typed from memory or another room's
template; and any layout meant to be reused as a template should be
clamped to each room's real extents at build time, not hand-retyped per
room ("fixes today's room and none of tomorrow's").

### 5.10 Guessing the cause from reading the room builder gives a confident wrong answer

A door landing pushed the player 0.92 units off target. First hypothesis,
from reading the source: a decoration placed at the same coordinates as the
door gap. That was fixed (moved the decoration) and the push persisted at
*exactly* the same 0.92 units. The actual cause, found only by directly
querying the collision system rather than the source: an entirely
unrelated hero-prop collider 1.5 meters away. **The rule now, same shape as
§0:** when a physical symptom needs explaining, ask the physics system what
is actually there, don't infer it from reading the builder function that
placed things.

### 5.11 A boss is a creature, never a turret

A boss rework revealed the previous version's damage hitbox and "hit here"
telegraph ring were both anchored to a fixed point at the arena's center,
while the boss itself visually prowled around the room — during its
vulnerable state, the ring told a child to hit the middle of the empty
room. **The rule, verbatim:** "a boss is a creature, never a turret" — any
visual effect or hitbox belonging to something that moves must be computed
from its live position, every frame, never from a fixed reference point
convenient at authoring time.

### 5.12 A mirrored rotation is invisible from a static read and catastrophic in play

Two separate bosses used the same rotation-composition pattern for their
telegraph decals, which *mirrors* a heading instead of rotating it (three.js
composes its Euler axes in a specific order, and the wrong one was chosen).
Measured across seven facings: correct at exactly one of them, up to 162°
wrong at the others — a child dodging by the decal at most facings was
being pointed directly into the attack. One boss additionally re-aimed its
actual attack at the end of its windup, discarding the direction the
(already wrong) decal had shown, making the one floor telegraph a boss
attack is required to draw pure decoration. **Only found by measuring real
angles at multiple facings** — a single test at one convenient angle would
have shown it working.

### 5.13 Timing can lie exactly the same way geometry can

Multiple dodge/invincibility windows didn't match their own visible
duration: a jump animation visibly airborne for 0.648 seconds granted
invincibility for only 0.535 of it (17% of the visible arc looked safe and
wasn't, sampled every single frame of overlap); a dash's i-frames covered
only 58% of its own unchanging visual duration; a parry window had *no*
visible cue at all, with 40% of its active window elapsing during the
shield's own raise animation. **The general law this produced:** "the pose
never lies, including in time" — an ability's protective window must be
derived from, or tied to, the same constant that drives its visible
animation, so the two literally cannot drift apart again.

### 5.14 Performance measured at one point, or one moment, understates the real cost

An initial "every room under budget" claim came from sampling nine rooms at
their spawn point only; sweeping a grid of standing positions across the
same rooms found up to nineteen more draw calls in some of them, moving
three rooms from "under budget" to genuinely over it — the camera frustum
changes with position, and one sample point cannot represent a whole room.
Separately, a *static* (enemies-at-rest) draw-call estimate proved
meaningfully lower than the *peak* draw calls measured during an actual
fight, once a splitting enemy's stacked loot drops were accounted for —
gameplay effects that only exist in motion aren't visible to a resting
snapshot. **The rule now:** performance is a property of the whole space
under real play, not of one convenient measurement point or moment.

### 5.15 A stat overwritten one line after it was correctly computed silently disables a difficulty system

A "reskin an enemy with different numbers" system did a flat overwrite of
an enemy's HP *after* the constructor had already computed the correct,
scaled value one line earlier — so any enemy built this way silently
ignored both difficulty levers (player-level scaling, easy-mode relief) the
rest of the game respected. One heavily-varianted level's "supposedly
tougher, corrupted" enemies were, measurably, the weakest thing in the
entire game at the point a child would actually meet them — because
"tougher-looking" and "actually tougher" had quietly come apart. A sibling
bug in the same feature: a new enemy class was simply absent from the
game's XP-reward table, and the death handler defaulted missing entries to
zero with no error — silently starving players of levels every single time
that enemy died, compounding with the HP bug in the opposite direction.

**The rule now:** any late-stage value overwrite needs to be checked
against what it's overwriting, not just what it's setting; and any new
enemy/item class needs to be checked against *every* parallel data table it
should appear in (XP, loot, difficulty scaling), not just the one table it
was added to.

---

## 6. Collision, physics & asset measurement

### 6.1 Skinned-mesh bounding boxes are bind pose, not render pose — the single most-repeated root cause in the project

`Box3.setFromObject()` on a `SkinnedMesh` measures the mesh's *bind* pose
(or, worse, garbage pre-update matrices on a freshly cloned rig whose
skeleton hasn't been posed even once yet) — never what's actually rendered
on screen. This one fact independently caused, by count, at least six
distinct bugs across the project's life: a correctly-anchored chest
incorrectly flagged as misplaced by an early version of a bounds checker; a
skeleton enemy diagnosed as having "legs in the floor," where the
diagnosis was initially meaningless because bind-pose and walk-cycle bounds
read as numerically identical; an enemy standing 2.2 units past its own
room's wall because its bind-space bounds lied about its real position; and
most dramatically, a boss model that rendered as literally nothing at all
— its fresh clone's un-posed bone matrices produced a measured height of
19,372 units instead of 193, so the auto-scale computed a factor 100 times
too small.

**The rule now, extending the project's older "measure the model, not the
filename" law:** never measure a skinned/posed object before its pose
matrices have been computed at least once ("measure the ruler, not the
puppet"), and never trust mesh geometry bounds for anything animated —
measure real bone world positions instead.

### 6.2 An `AnimationAction.isRunning()` check is not a check for "is this posing the rig"

`isRunning()` returns false for a deliberately paused pose *and* for a
finished one-shot action clamped at its last frame — while both are still
actively posing the skeleton at full weight underneath whatever the
"current" animation appears to be. Every debug dump of "what's playing"
said "only the walk cycle" while the mixer's real internal action list
showed a second clip still mixed in underneath it, sinking the character's
legs into the floor. Fixed once, centrally, in the shared play-animation
function, rather than patched at each of a dozen-plus call sites
individually.

### 6.3 A model's origin, pivot, and native scale are facts to measure, never facts to assume

- A model placed 1.09 units off its own declared pivot silently displaced
  every instance of it, and every item that dropped out of it, across the
  whole game.
- A model universally called "crate" for the entire project turned out to
  actually be a stack of planks nine centimeters tall — no scale value
  turns a plank stack into a box; the label was simply wrong from the
  sourcing stage, and nobody had rendered it at scale to check.
- A "2.2" typed as a scale multiplier for a model whose *native* height
  happened to also be close to 2.19 units rendered an altar taller than
  the room's own ceiling — target-size and multiplier are easy to confuse
  exactly when the model's real size makes the wrong interpretation look
  plausible in the source.
- Props modelled to hang from a hook (geometry entirely below their own
  origin) were placed at ground level by code that corrected X/Z pivot but
  said nothing about Y — buried 1.77 units underground, invisible.

**The rule now:** a dedicated measurement tool reports a model's true size
and where its own origin sits inside it *before* anyone hand-types a scale
or placement number against it. Every one of the above shipped because
nothing had ever done that.

### 6.4 Material and texture caching, keyed the wrong way, silently no-ops a change

- A texture-prepare cache keyed by material *name* meant an entire pack
  that followed a common naming convention (every material called
  `colormap`) silently returned an already-cached material from a
  *different* pack — a recolor request did precisely nothing, and nobody
  noticed because nothing errored.
- A separate cache, for the same reason at a different layer, keyed
  textures by *file*, so 21 files that all embedded a copy of one shared
  atlas image loaded as 21 distinct texture objects — and a downstream
  material-merge cache keyed by texture object identity therefore treated
  21 visually-identical materials as 21 different ones, defeating the
  entire draw-call-merging optimization they were meant to benefit from.

**The rule now:** a cache key has to actually identify the thing being
cached uniquely — a human-chosen name or a filename is a *convention*, not
an identity, and will collide the moment two unrelated things happen to
share one.

### 6.5 A visual "solid ground over a hazard" needs its own entry in the hazard system, or it's a lie

Bridge decks over lava were purely visual meshes layered on top of a lava
damage rectangle; the actual hazard check underneath still reported lava.
It shipped fine only because lava had, until a later design change, always
been passable — the moment lava became truly impassable, every bridge deck
in the game started damaging the player standing on it, on their intended
safe crossing. **The rule now:** any visual "this covers the hazard"
feature needs an explicit, checked entry in the collision/hazard system
that overrides it — a bridge is not safe because it looks like a bridge, it
is safe because something told the hazard check to say so.

### 6.6 Collider padding gaps produce false positives and false negatives with equal confidence

Manual box colliders placed to match visual geometry, verified only by eye,
produced both directions of the same error at different times: gates whose
collider didn't quite reach their visual pile could be walked around
entirely; conversely, once a batch pass gave solid props correct colliders
for the first time, some newly-correct colliders accidentally sealed
doorways that had always been *visually* open. **The rule now:** pad
wall-run colliders past their specified endpoints so they reliably meet
adjoining geometry, and verify every gate/doorway by flood-fill from spawn
(both standing and after the relevant verb is used) rather than by eye —
this became the project's standard proof technique for "is this actually
open."

### 6.7 Fixing a real bug can retroactively expose bugs it had been hiding

After fixing a collider-origin bug (colliders finally landing where props
actually were), a previously-*passing* reachability suite started failing
— a doorway that had, it turned out, always been sealed from its own
arrival side was only now being detected, because the earlier broken
version of the code had never been capable of sealing anything correctly
there in the first place. Similarly, more "enemy spawned standing inside a
solid prop" cases surfaced than had ever been caught before.

**The rule now:** when fixing a bug causes new test failures, don't assume
the fix introduced a regression — check whether it just turned on a light
in a room that was always broken. Two explicit standing laws came out of
this specific incident: "if it looks like it blocks, it blocks" (visual and
physical solidity must always agree), and a blanket collider-adding pass
must never be allowed to seal a doorway or place an enemy's spawn point
under solid geometry — it has to give back space near doors and check
spawn points explicitly, every time it runs.

---

## 7. Caching, deployment & build pipeline

This is a static, no-build-step, service-worker-cached PWA. Its entire
class of deployment bugs comes from one shape: **two facts that are
supposed to always agree, kept in sync by hand.**

### 7.1 CACHE_NAME/badge drift — the canonical instance of the whole category

The version badge shown in the UI and the service worker's actual cache
version key were two independent hand-typed strings. They drifted, and
chasing the resulting "phantom" stale-asset bug — the game serving old
files while claiming to be a new version — cost real debugging time before
the cause was found. **What changed, and this became the template for
every fix in this section:** a single script now regenerates *both* the
displayed badge and the service worker's actual precache list from the
game's real import graph, and the boot check fails outright if they ever
disagree again. One generated source of truth, not two hand-kept facts
that happen to usually match.

### 7.2 A hand-typed precache list will always miss something, and what it misses breaks offline play specifically

The offline asset list was typed by hand and silently missed several
modules — three of which were imported by *every single level file in the
game* — meaning a child opening the app just after an update, while
offline, could reach the title screen and then fail to build any room at
all. A later, separate pass found the same class of miss again, at larger
scale (dozens of assets absent). **What changed:** the precache list is now
generated by walking the game's actual static and dynamic import graph from
its entry point — deliberately *not* by listing every file in a directory
(which would also catch genuinely dead, unused files and precache them for
nothing).

### 7.3 The browser's own HTTP cache can quietly defeat a fresh deploy

Two separate, compounding bugs: the hosting platform serves files with a
ten-minute cache lifetime, so filling a brand-new service-worker cache
version with `cache.addAll` could pull stale files through the *browser's*
HTTP cache instead of the network — fixed by forcing `cache: 'reload'` on
every precache fetch. Separately, the update-checker's own request for the
service worker file itself was, by a wrong default option, subject to that
same ten-minute HTTP cache — meaning for up to ten minutes after every real
deploy, the browser was comparing the new build against a cached copy of
the very file whose job is to detect that a new build exists. Fixed with an
explicit `updateViaCache: 'none'`.

### 7.4 An installed PWA that's never fully closed can run stale code forever

Browsers only check for a new service worker on navigation; an installed
app resumed from the background performs none. If a child never fully
closes the app, it can run arbitrarily old code indefinitely with no
mechanism ever prompting a check. Fixed with explicit, throttled
`update()` calls on load and on every foreground resume. A related, sharper
bug: the "we already reloaded for this update" flag was being set
*before* confirming a reload actually happened, so an update landing
mid-play could mark itself "handled" and simply never reload — fixed by
only setting the flag on an actual reload, with the deferred reload itself
retried on return-to-menu, on refocus, and on a periodic tick.

### 7.5 Verifying an update mechanism needs to wait on real completion, not a guessed duration

The first version of the update-verification script used a fixed 3-second
wait for the service worker's activation; under a slow renderer, fetching
the full precache set took longer than that and produced a false failure.
Same lesson as §3.3, in a different subsystem: **poll for the actual
condition, never wait a fixed duration for anything asynchronous.**

### 7.6 A content-hash audit found what spot-checking a "does it play" test could never find

A systematic hash comparison of every shipped audio file — not a
spot-check — found five pairs of files that were byte-different names for
the same audio, roughly 11% of the total download, shipped silently because
each copy individually "worked perfectly" when played. **The rule now:** a
dedicated duplicate-detection tool hashes every asset and fails on
avoidable duplication, and it was itself verified the same way everything
else in this document insists on — by planting a known duplicate and
confirming the tool caught it, then removing it and confirming clean.
"A checker nobody has watched fail is not yet a checker" applies to build
tooling as much as to game logic.

### 7.7 Deleting a duplicate without touching every place it's referenced breaks everything, not just the duplicate

The precache-fetching API used by this project's service worker rejects
its *entire* batch if even one URL 404s — meaning removing a duplicate
asset file without also removing its now-dangling precache entry would have
silently broken offline play for every asset in the batch, not just the
one that was deleted. Verified before shipping by actually installing the
real service worker headlessly and confirming every remaining file cached
with zero failed requests.

---

## 8. Human–AI collaboration process

Wolf Knight's development loop — one non-engineer product owner giving
plain-language feedback, one AI agent doing the diagnosis and
implementation, autonomous overnight sessions running unattended — produced
its own distinct category of failure, separate from anything a purely
technical postmortem would surface.

### 8.1 Reproduce and root-cause the literal complaint; don't guess at "the real issue"

The dominant working pattern across the entire project, stated explicitly
in the testing doc: *"the reported symptom is the start, not the
diagnosis."* Nearly every BUILDLOG entry opens with dad's exact words in
quotes and closes by explaining specifically why those words were true,
not by explaining a plausible-sounding adjacent issue. This discipline is
also what caught the cases where the complaint turned out to be correct but
the earlier assumed cause was wrong (§8.3 below) — because "prove the exact
words true" doesn't stop at the first plausible-looking cause.

### 8.2 A damage/feedback test that calls the function directly instead of driving player input can hide a real bug from the player's own path

An early boss-verification test called the damage function directly rather
than going through the actual attack input pipeline — which hid a genuine
design bug where a telegraph state required two hits inside a timing
window, but the hittable target object was recreated fresh each cycle, so
in real play only one hit per window could ever land. The direct-call test
"passed" throughout. **Standing rule recorded afterward, in nearly these
words:** boss verification must drive the *player's* attack path, never the
damage function underneath it directly — this is the same lesson as §0
applied specifically to combat.

### 8.3 A reported "bug" can be a spec mismatch, not a defect — and the earlier fix can still be worth keeping

A secret input sequence kept "resetting mid-entry," first diagnosed and
fixed as a hardware double-tap issue. It kept happening. The real cause,
found only by comparing the exact keys pressed against the exact sequence
shipped: the person entering it was, correctly by their own memory,
entering a *longer* sequence than the one the game actually expected — not
a bug at all, a silent mismatch between two independently-evolving
definitions of "the code." The earlier double-tap fix was real and worth
keeping regardless; it just wasn't the whole explanation.

**The rule now:** when a fix doesn't make a reported problem go away,
consider that the two sides of the conversation may be describing two
different things that happen to look similar, not that the first fix must
have been wrong.

### 8.4 Progressive-reveal UI is for advanced verbs, never for core ones

Three separate complaints in a row — "there's no ranged attack," "there's
no jump" — traced to controls that only became *visible* after a specific
in-game teaching moment fired, which required physically standing in a
specific spot first. A child who never stood there concluded, reasonably,
that the ability simply didn't exist. **The rule now:** core,
always-available verbs stay visible from the first minute of play;
progressive reveal is reserved for genuinely contextual or advanced
controls, never for anything a player might need at any time.

### 8.5 A subjective creative call is not a bug to autonomously fix

After discovering two unrelated sound effects were literally the same
audio file reused for conceptually different actions, one pair was
corrected immediately once confirmed with dad ("yes, change it") — but the
broader pattern (several other reused sounds) was explicitly logged as *not*
fixed, in these words: *"because it changes how the game sounds, which is
dad's call, not mine."* Distinct from a difficulty/economy tuning pass that
was explicitly and repeatedly deferred with the note *"needs the kids —
do not do this overnight,"* precisely because it required judgment from
real play with the real audience that no amount of autonomous
implementation work could substitute for.

**The rule now:** some decisions are genuinely subjective, personal, or
require the real audience's real reaction. Recognize that class explicitly
and defer it, rather than making a plausible autonomous call and moving on.

### 8.6 Post-game content was scrapped for content where the players actually are

A planned late-game bonus dungeon was cancelled outright, with the
reasoning stated once and then cited repeatedly afterward as a standing
design law: *"post-game content is the wrong target — the kids are not
finishing the game yet."* That single sentence redirected substantial
planned work into early-game interstitial content instead (short road
levels between the *first* few regions, not the last few) and turned a
planned late-game branch into an early-game one. **The general rule:**
match development effort to where the actual players currently are, not to
where the content roadmap assumes they'll eventually be.

### 8.7 A rule written down once, in one log entry, is not load-bearing — and a harness constraint can defeat a repo-level rule entirely

An overnight session was told to work on a specific shared branch, "cut
from main; create it if absent." The branch was *not* absent — it already
carried real, previously-shipped work. The session created a fresh one from
main anyway, silently discarding that history from its own point of view,
read main's now-stale planning documents, and rebuilt a queue item that had
already been completed. Nothing was actually lost (a non-fast-forward push
rejection caught it), but the session wrote a clear rule afterward: *fetch
the shared branch first.*

**The very next overnight session repeated an equivalent mistake anyway** —
this time because the automation harness itself had pinned it to an
isolated branch it was told never to push elsewhere, so it had no way to
even *see* the shared branch, read main's stale documents again, and this
time picked and fully built the one item explicitly marked "needs the kids
— do not do this overnight." Both wasted sessions were logged in full,
including explicitly what was salvageable from the discarded work and what
wasn't — never silently deleted.

**What this actually says, stated as generally as the project itself
states it:** *"any session that starts from main's documents will pick
[already-done or forbidden] work — that is a property of the documents, not
of the run."* A rule stated once in a log entry is not load-bearing if
nobody is guaranteed to read that specific entry before acting, and a
harness-level constraint can silently defeat a repo-level rule that assumes
a capability (seeing the shared branch) the harness never actually granted.
**What finally worked:** the branch policy was settled as a top-level,
unambiguous decision, and the instruction was moved from a sentence
somewhere in a log to a first-turn imperative — fetch and check out the
correct shared branch *before* reading any planning documents at all, or
stop and ask.

### 8.8 Wasted work gets logged with the same rigor as successful work

Both discarded overnight sessions above produced full log entries
documenting what happened and why the work was worthless, explicitly
labeled along the lines of *"no code changed tonight — this entry is the
record of a wasted run,"* including what (if anything) was still worth
salvaging. This is a deliberate practice, not an accident: a project run
this way needs its failures recorded as carefully as its successes,
specifically so the same mistake doesn't recur invisibly to whoever reads
the log next.

### 8.9 A visual judgment made from a partial or rough-state render can be simply wrong

A "corrupted" town read, from a rough-pass review, as broken (unlit black
building slabs). A real screenshot of the actual, restored in-game state
showed the buildings were correct and the darkness was the *intentional*
pre-restoration visual — not a bug at all. **Standing practice:** always
look at a real screenshot of the actual game state as a final step, even
after every measured/automated check has already passed — some things are
only wrong, or only correct, in a way that a number can't capture.

---

## 9. Asset & content pipeline discipline

### 9.1 A house style is a constraint that has to be enforced, not just stated

The project's standing rule against code-built creatures exists because
the earliest enemies genuinely *were* bare procedural geometry
(icosahedrons, triangles) rather than real assets — a visible, deliberate
violation of the visual consistency the rest of the game was already
committed to, fixed in a dedicated pass once named as a problem, and later
extended (rather than relaxed) to explicitly allow real, properly-rigged
assets brought in via an animation pipeline while still banning procedural
creature geometry outright.

### 9.2 A visually appealing asset can still fail every real constraint the project has

A batch of new creature models was measured — not eyeballed — against
triangle count, material/draw-call cost, and specifically its actual
*animation clip vocabulary*, before any of it was integrated. Concrete
rejections that measurement alone caught: a genuinely beautiful model whose
only clip was a 7.8-second near-idle loop (confirmed, not assumed, by
rendering frames across the clip and observing nothing moved — "it would be
a statue in a fight"); a model with a complete attack/fly/dive/walk/idle
vocabulary but 394 separate meshes against a 125-draw-call room ceiling;
several stylized models rejected purely on triangle budget against the
project's established low-poly, one-draw-call-per-object convention.

**The rule now:** run every new asset through measurement tooling —
triangle count, draw calls, and specifically its real animation clips —
before any gameplay work is built on top of it. A model can be visually
perfect for the project's style and still be structurally unusable.

### 9.3 A data table describing "what body does this creature wear" can itself be wrong

Dad's explicit rule: every boss should be visually distinct, no more reused
bodies after the first. An audit found four of seven bosses secretly
sharing one body model, and — separately — one boss's body was hardcoded
directly in the spawner code while the table meant to *describe* what body
every boss wears said nothing about it at all, meaning the table was simply
incorrect for roughly a third of the roster it claimed to document. Fixed
by having every boss definition name its own body explicitly (including
height, which materials are its eyes, whether it hovers), with the one
deliberate exception (a final boss narratively reusing an earlier body)
called out by name in the verification suite specifically so it reads as a
choice, not as drift back into the original oversight.

### 9.4 "Free" does not mean "redistributable," and a public repo makes the distinction load-bearing

Of ten newly-supplied asset packs, three shipped only a license *link*
rather than actual redistribution rights — and because this project's
repository is public (every asset file directly downloadable by anyone),
that distinction genuinely mattered rather than being a formality. All
three were excluded entirely on an explicit call, despite being otherwise
perfectly usable, and a verified-license manifest became a hard
prerequisite gate for any asset pack used from that point forward.

### 9.5 Check for exact duplication before doing any integration work at all

A newly-supplied weapons pack was checked with a binary diff against
already-vendored files *before* any style-matching or licensing work began
on it, and found byte-identical to files already in the project — avoiding
an entire unnecessary integration pass. The only real value in the new
upload was the handful of pieces the game had genuinely never taken from
that source before.

### 9.6 Functional correctness (an ability works) is a different claim from readability (a player can tell it's about to happen)

Every ranged/caster-type enemy in the game held no visible weapon at all —
functionally, they fired projectiles correctly; visually, "a child watching
a fight could not tell who was about to shoot at them from who was about to
run at them," named explicitly as *"the single most important thing to read
in a room."* Fixed by giving archer- and caster-type enemies real,
deliberately opposite silhouettes (long-and-low reads as ranged,
short-and-high reads as a caster) so the distinction is legible at a
glance, without reading a health bar or a label.

### 9.7 An error silently swallowed on write is a different, worse problem than one swallowed on read

Every local-storage write in the save system ended in an empty catch
block — a reasonable pattern for a corrupt-*read* fallback, disastrous for
a *write*, since it meant a storage-quota error or a private-browsing
restriction could let a child play an entire evening and lose all of it
while the game reported nothing wrong. **The rule now:** write failures
surface through the UI, and the save path reads its own value back
immediately after writing to confirm it actually landed, rather than
trusting the write call's return value.

### 9.8 An inconsistent return type from one shared helper can silently kill everything downstream of it in the same function

One loot-mesh builder returned a wrapper object (`{group, liquid}`) where
every other similar helper in the codebase returned a plain mesh directly.
New code that assumed the common convention threw when it hit this one
exception — and the exact same mistake was found already present, and
already shipped, inside the main loot-granting function: a thrown error
mid-loop silently truncated the *entire rest of that function*, meaning any
chest containing a potion alongside anything else had been quietly
discarding every reward listed after the potion, for as long as that code
had been live. **The rule now:** return-type consistency across a family of
similar helpers isn't a style preference — an exception to it can silently
truncate a caller's entire remaining work with no error a player would ever
see, especially in fire-and-forget code paths where nothing is watching for
a thrown error at all (see §3.4's related point about unhandled promise
rejections being invisible to a standard error listener too).

### 9.9 "It equips correctly" is not the same claim as "a player can ever obtain it"

A completeness check ("every item is bought, found, or starts on you") found
five weapons and shields that existed fully, correctly implemented — right
stats, right mount point, even rendering correctly in a preview screen —
but were placed in zero shops and zero chests anywhere in the actual game.
**"A weapon nobody can pick up is a table entry, not a weapon."** Related,
found while placing those same five items: two of them had visual scale
that directly contradicted the stat they were supposed to represent to a
non-reading child — the "longest reach" weapon in the game rendered
*shorter* than an ordinary one; the "best block" shield rendered
*smallest* of all shields. Fixed by reserving an explicit scale-override
field specifically for cases where a model's stock size would otherwise
contradict its own gameplay claim — "scale is for contradictions, not for
taste," i.e., don't use it to express an opinion, only to fix a lie.

### 9.10 A new save-schema field needs the same backward-compatibility treatment as every existing one, immediately, not eventually

The save-load path replaces a whole section of state from the save file
wholesale, then explicitly patches two known older fields back in for
profiles that predate them. A newly-added field was *not* added to that
same patch-back step — meaning an old save loading without it present would
crash the moment anything tried to use it, rather than degrading
gracefully like every other field the pattern was built to protect.
Separately, a dedicated cross-profile save-isolation test found that
several entire late-game state fields (boss-defeated flags, boss HP,
end-game completion) had simply never been wired into the save/load
functions at all, for as long as that content had shipped — proven by
stashing the fix, confirming the check failed with exactly those missing
field names, then fixing it.

**The rule, stated as a standing architectural law in the project's own
top-level rules file:** *saves are additive-forever — never remove a field
a save might still read.* Every new field needs its backward-compatibility
path written in the same commit that adds it, checked by a real
old-shaped-save test, not assumed to be fine because a fresh save works.

### 9.11 An identity check on a cloned object can silently reject every clone in the game

A character-cloning utility builds a separate skeleton instance per cloned
mesh even when the underlying bone hierarchy is genuinely shared — so any
code performing a reference-identity check on "is this the same skeleton"
rejected every single cloned character, failing with no error at all, just
silently wrong behavior (an optimization that was supposed to merge shared
work "did nothing at all," undetected until someone specifically asked why
it wasn't saving anything). **The rule now:** compare the actual
underlying data (bone list, element-wise) rather than object identity, for
anything that goes through a cloning utility whose exact identity semantics
you haven't personally verified.

---

## 10. The framework — set this up on day one of the next build

This is the part meant to be copied, not just read. If the next project is
built the same way — one product owner giving plain-language feedback, one
AI agent implementing, limited or no dedicated QA — these are the concrete
practices that this project discovered it needed the hard way, presented as
things to simply already have from the start.

**1. A `verify-boot`-equivalent, run first, before anything else, every
time.** Load the real page, start a real session, assert zero console/page
errors including unhandled promise rejections. Takes seconds. Catches
scope errors and syntax mistakes that a plain syntax checker on ES modules
will not (`node --check` stops parsing at the first `import`).

**2. One real source of truth per fact, never two hand-kept copies of the
same list.** Room lists, door lists, item lists, asset manifests: derive
every one of them from the actual live registry / actual import graph at
verification time, not from a list someone typed once. If two independent
places need to agree on a fact, that's the signal one of them should be
generated from the other, not that both need careful maintenance.

**3. A completeness check turns "nothing said anything" into a hard
failure.** For every registry-style list your other suites depend on
("check every room," "check every door"), also assert that the list itself
covers everything that actually exists. Silence is the most dangerous
possible test result, because it looks identical to success.

**4. Verify through the real input path, never by calling the underlying
function directly.** Drive real key/pointer input through the actual game
loop for anything gameplay-facing (damage, movement, interaction). A
direct function call proves the function works in isolation; it does not
prove a player can ever reach the state that calls it.

**5. Measure geometry; never trust a typed-in number.** Model scale,
pivot, and placement all get checked against a real measurement of the
loaded asset (bounding box, real bone positions post-pose) before anything
is built on top of an assumed value. This alone would have prevented a
large fraction of every bug in §6.

**6. A known-fail manifest for genuinely pre-existing, already-diagnosed
failures — and nothing else goes in it.** If a suite has been red for more
than one session, the very next action is to find out what it's actually
telling you, not to route around it or assume it's flaky. Something only
earns a spot in the manifest once its root cause is understood and proven
unrelated to current work; it doesn't get to sit there un-investigated.

**7. Any parallel test run's failures get re-run serially before being
trusted.** Shared-CPU contention produces real-looking false failures.
Shard across separate machines for real parallelism; run serially within a
machine.

**8. A playtest report needs exactly three things: a room/place id, one
screenshot, one sentence.** No more — enough to reproduce, deliberately not
enough to guess from. This is the fastest way to surface the class of bug
(visual, positional, "something looks wrong here") that automated checks
structurally cannot find.

**9. A contact sheet — one arrival-frame screenshot per room/scene, on one
page — reviewed by human eyes before anything that touches content ships.**
No automated check can tell you a space is boring, badly lit, or simply
looks wrong. This is not a replacement for automated verification; it's the
one class of defect automated verification cannot ever cover.

**10. Saves (or any persisted state) are additive-forever from the very
first field.** Never remove a field old state might still read; every new
field gets a backward-compatibility patch-back path in the same commit
that adds it, proven against an old-shaped save, not assumed safe because a
fresh save works.

**11. Root-cause the literal, verbatim complaint — don't guess at "the real
issue" and build a plausible-sounding fix for that instead.** Reproduce the
exact words. If the fix doesn't make the reported problem go away, consider
that you and the reporter may be describing two different things that look
similar (a spec mismatch, not a bug), rather than assuming the first fix
must have been wrong.

**12. Some decisions are the human's, explicitly, and get logged as
deferred rather than autonomously decided.** Subjective creative calls,
anything needing the real audience's real reaction, anything the product
owner has flagged as "needs the kids" or equivalent — name that class
explicitly up front, and defer to it every time, rather than making a
plausible call and moving on.

**13. A rule stated once in a log entry is not load-bearing.** If a process
rule matters (which branch is shared trunk, which steps are mandatory
before autonomous work starts), it goes at the *top* of the instructions
the next session actually reads first — not buried as a sentence in
history that assumes someone will find it. And check whether your
automation harness actually grants the capability a rule assumes it has
(e.g., "fetch the shared branch first" is meaningless if the harness never
lets that session see the shared branch at all).

**14. Log wasted or discarded work with the same rigor as shipped work,
including why it was wasted.** Never silently delete the record of a
mistake — the next session (human or AI) needs to be able to find out it
already happened.

**15. Write this document's next chapter as you go, not at the end.**
Wolf Knight's own testing doc opens by saying it was written from
practice, so nobody pays for the same trap twice — and CLAUDE.md's
standing rules each carry their own incident citation, not just the rule
itself. Do the same from the first session: when something costs real
time to diagnose, write down what happened, why it was possible, and what
changed — while it's still fresh, not reconstructed from a git log months
later.
