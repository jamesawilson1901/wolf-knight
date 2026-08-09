# Wolf Knight — Den Mini Games & Den Growth
**Design spec — draft 1**
Status: design only. No code until Level 2 hub greybox is rebuilt and metrics are locked.

---

## 1. Purpose

The den is the game's reward hub. Rescued NPCs, animals and pups live there. Talking to a rescued
character opens a mini game. As the rescue count climbs, more games unlock and the den itself
physically grows.

Three jobs this system does:

1. **Makes rescues feel worth doing** — the payoff is visible and playable, not a counter.
2. **Teaches core skills off the critical path** — every mini game is a re-skin of a combat or
   traversal skill, so kids practise without a tutorial.
3. **Gives a safe, low-stakes place to play** — no death, no fail state that blocks progress.

---

## 2. Hard rules

These are non-negotiable and should be treated as acceptance criteria.

- **All rewards are cosmetic.** No mini game gates story progression, ability unlocks, or region
  access. A stuck five-year-old must never be a stuck game.
- **No reading required.** Rules are taught by demonstration on first entry. Icons, colour and
  audio only. Captions on by default for any spoken line.
- **Per-child scores only.** Personal bests stored in that child's localStorage profile. No shared
  leaderboard between profiles — the youngest will never beat the eldest and will stop playing.
- **Exit is always one tap.** A visible exit control on screen at all times, minimum 2 cm target.
  No confirmation dialog.
- **Every game is winnable by mashing.** Skill raises the score; it does not decide pass or fail.
- **Session length 30–90 seconds.** Anything longer gets abandoned mid-round.
- **Restart is one tap from the results screen.** Replaying is the loop.

---

## 3. Shared architecture — build this first

Do not build twelve one-off games. Build one interface, then twelve small implementations.
Twelve bespoke games means twelve sets of bugs, twelve HUDs, and no reuse.

### 3.1 `MiniGame` interface

Every mini game implements the same contract:

```
init(context)     // receives den scene, player profile, difficulty band. Builds its own props.
start()           // begins the round. Called after the shared intro demo finishes.
update(dt)        // per-frame tick. Only runs while the game is active.
end(result)       // returns { score, best, isNewBest, rewardId | null }
teardown()        // removes all its props, listeners and timers. Must leave zero residue.
```

### 3.2 Shared harness owns

- Round timer and its on-screen display
- Score display
- The "how to play" demo (a scripted 3–5 second playthrough on first entry, skippable after)
- Pause and exit
- Results screen, personal best comparison, reward payout
- Audio ducking of den ambience during play
- Camera framing — the harness moves the camera to the game's declared framing volume and
  restores it on teardown

### 3.3 Difficulty bands

Three bands: **Cub / Wolf / Alpha**. Chosen per profile, changeable at any time from the results
screen using an icon selector (small/medium/large paw). Band affects speed and pattern length
only — never the number of taps needed to survive.

### 3.4 Teardown discipline

Each game must fully release its own geometry, materials, textures, timers and event listeners.
Add a dev-only assertion after teardown that scene child count and draw call count have returned
to their pre-game values. Leaks here will surface as a slow den after twenty rounds and will be
miserable to trace later.

---

## 4. Unlock tiers

Unlocks are driven by **total rescue count**, not by specific characters. This means the kids get
new content regardless of which NPCs they happened to find, and no game is orphaned by a missed
rescue.

The listed host character is who you *talk to* if they have been rescued. If the host is not yet
rescued, the game is hosted by Pip as a fallback so an unlock is never dead.

### Tier 1 — rescues 1–3 (solo, ~30 s)

| Game | Host | Skill taught | New assets |
|---|---|---|---|
| **Howl Echo** | Any pup | Element switching | Wolf howl SFX ×7 (see §7 blocker) |
| **Fetch** | Any pup | Attack timing window | None — reuses throw arc + pup rig |
| **Pip's Hide and Seek** | Pip | Observation, camera control | None — hides in existing den geometry |

**Howl Echo** — Simon-says. The den fire flashes an element colour and plays that element's howl;
the child repeats the sequence by tapping the matching element. Sequence grows by one each round.
Colour *and* howl together, so colour-blind and audio-off both still work.

**Fetch** — a stick arcs out, tap to catch on the bounce. Perfect timing = longer next throw.
The catch window is the same window as the parry, deliberately.

**Pip's Hide and Seek** — Pip hides behind existing den props. His tail flicks into view for one
second every few seconds. Tap him to win. Costs almost nothing to build.

### Tier 2 — rescues 4–8 (dexterity, ~45 s)

| Game | Host | Skill taught | New assets |
|---|---|---|---|
| **Anvil Rhythm** | Blacksmith | Parry timing | Anvil model (CC0), hammer SFX |
| **Pup Tag** | Any pup | Movement, prediction | None — reuses enemy patrol AI |
| **Lantern Run** | Lamp keeper | Route planning, dash economy | None — reuses den lanterns |

**Anvil Rhythm** — tap on the beat as the hammer falls. Same timing window as the parry.
Rewards armour tints. Music-led, so it works with the screen barely looked at.

**Pup Tag** — pups scatter across the den using the existing enemy patrol behaviour with the
aggression stripped out. Catch them all before the timer. Cheapest game in the list.

**Lantern Run** — light every den lantern on a single dash charge. Teaches route planning without
words. Difficulty scales by adding lanterns, not by shrinking the dash.

### Tier 3 — rescues 9–15 (repeatable, score-chasing)

| Game | Host | Skill taught | New assets |
|---|---|---|---|
| **Dig** | Bear cub or hound | Spatial memory | Dirt mound + dust puff VFX |
| **Herb Match** | Herbalist | Memory, pattern | Herb icon set ×8 |
| **Pup Obstacle Course** | Any pup | Level literacy | Flag prop |
| **River Tug** | Fisher | Grip and release timing | Rope prop, splash SFX |

**Dig** — a small grid of dirt patches. The animal growls warmer or colder as the child moves.
Dig to find buried cosmetics. Growl pitch does the work, no text.

**Herb Match** — colour-and-shape memory grid. The most accessible game in the set; good landing
spot for the youngest player. Shapes differ as well as colours so it is not colour-dependent.

**Pup Obstacle Course** — the child places flags around the den to set a route, then the pup runs
it. A ghost of their previous best pup runs alongside. This is the deepest replay loop in the set
and is worth building last and properly.

**River Tug** — a meter tug-of-war. Hold to pull, release before the rope frays. Mash-and-release
rhythm, forgiving fail state (rope slips, reset, keep going).

---

## 5. Den growth

### 5.1 Driven by WorldState, not by triggers

The den reads from the same serialisable `WorldState` object built for the Level 2 hub restoration.
It takes `rescuedIds` as input and derives a den tier. It does **not** get its own bespoke trigger
system, and rescue count must not be duplicated in a second place.

```
WorldState.rescuedIds  ->  denTier: 0 | 1 | 2 | 3
```

Tier thresholds: 0 rescues = tier 0, 1–3 = tier 1, 4–8 = tier 2, 9+ = tier 3.

### 5.2 Swap tier meshes, do not append per NPC

**Do not add a hut per rescued NPC.** That approach breaks the sub-100 draw call budget somewhere
around rescue ten and cannot be walked back cheaply.

Instead, author four complete den states and swap the whole set:

| Tier | Den state |
|---|---|
| 0 | Bare hollow. One small fire. Fog close. |
| 1 | Inner ring of huts. Fire larger. A few lanterns lit. |
| 2 | Outer paddock and garden added. Fence line. Most lanterns lit. |
| 3 | Upper terrace, banners, full lighting. Fog pushed right back. |

Rules:
- Repeated props — fences, huts, lanterns, crates — as `InstancedMesh`.
- Static geometry merged per tier at build time, not at runtime.
- Only one tier's geometry in the scene at a time. The transition happens on den re-entry, never
  mid-frame while the player is standing in it.
- Rescued NPCs are placed at fixed marker points defined per tier, so the population reads as
  fuller without new architecture per character.

### 5.3 Non-geometry growth cues (cheap, high impact)

These carry most of the felt progression and cost near-zero draw calls:

- **Fire** scales in size and warms in colour with each tier
- **Ambient audio** gains a layer per tier — wind, then chatter, then music, then children playing
- **Fog radius** pulls back, revealing more of the surrounding valley
- **Lantern count lit** increases at night
- **Banner colours** pick up the elements of regions already cleared

---

## 6. Rewards

All cosmetic. Suggested pools:

- Armour and fur tints for Kael's Knight and Dark Wolf forms
- Pip accessories — scarf, collar, hat
- Den decorations the child can place — the only true "ownership" reward, and likely the stickiest
- Howl variations
- Trophy props that appear on the den terrace at tier 3

Rewards drop from mini games and are stored per profile. A duplicate must never be dropped —
draw from remaining pool only, and when the pool is empty, award a small score bonus with a
different, clearly non-item flourish so it does not read as a broken reward.

---

## 7. Blockers and dependencies

| Item | Status | Notes |
|---|---|---|
| Level 2 hub greybox rebuild | **Not started** | The den lives here. Nothing below starts before this. |
| `WorldState` object | **Not built** | Den tier derives from it. Must exist first. |
| CC0 wolf howl ×7 | **Missing** | Blocks Howl Echo. Freesound CC0 filter, or Kenney audio packs. |
| Anvil, rope, herb icons | **Not sourced** | Kenney / Quaternius / KayKit only. Licence-audit before use. |
| `MiniGame` interface | **Not built** | Blocks every game. Build and validate with one game first. |

Licence rule stands: no asset enters the repo without a confirmed CC0 or CC-BY licence file.
Unknown licence is treated as blocked, not as permission. If an asset cannot be sourced clean,
stop and ask rather than substituting silently.

---

## 8. Build order

One substantive change per Claude Code session, kid-testing between sessions.

1. `MiniGame` interface + shared harness + **Fetch** only. Prove the contract end to end.
2. Kid test. Does the harness feel right? Is exit obvious? Is 30 seconds correct?
3. Tier 1 remaining games (Howl Echo, Hide and Seek) — assuming howl audio is sourced.
4. Den tier mesh swap, tiers 0–1 only, greybox. Verify draw calls.
5. Tier 2 games.
6. Den tiers 2–3, greybox, then art dressing once metrics hold.
7. Tier 3 games, Obstacle Course last.

Greybox before art at every step. Performance guardrails before dressing.

---

## 9. Open questions

- Should the den tier be visible from outside on approach, as a "look what we built" moment on
  re-entry? Likely yes, but it changes the LOD and fog work.
- Do mini games pause the world clock, or does the den have no clock at all?
- Should two children be able to pass the phone for a hot-seat round of Pup Tag, or does that
  break the per-profile score rule? Suggest deferring — it adds profile-switching complexity.
- Is 15 rescues the right ceiling for tier 3, or should it scale with total NPC count per region?

---

## 10. Build log — appended by the build, not part of the original spec

### Step 1 — `MiniGame` interface + shared harness + Fetch — **DONE** (v3.39.0)

| Piece | Where |
|---|---|
| The contract and the harness | `js/minigame.js` |
| Fetch | `js/mg-fetch.js` |
| The host ring in the den | `makeFetchHost` in `js/minigames.js` |
| HUD, demo, results screen, band picker | `#mg-*` in `index.html` |
| Per-profile bests | `state.minigames`, saved and loaded in `js/save.js` |
| Rescue count and unlock tiers | `rescueCount` / `unlockTier` in `js/worldstate.js` |
| The proof | `tools/verify-minigame.mjs`, 15 assertions |

### Two places where the build deliberately diverges from §2 and §3.2

Written down rather than silently done, because both are cases where a later
instruction overrides this document.

1. **§2, "minimum 2 cm" exit target.** That law was repealed in v3.35 after the
   controls were measured eating 45.7% of the screen; the rule since then is a
   44px floor per control and 22% of the view for all of them together
   (`design/METRICS.md`). The exit is **92px** — the same size as the attack
   button, the largest thing a child ever presses. Same intent, current law.

2. **§3.2, "the harness moves the camera to the game's declared framing
   volume".** It does not. Two standing laws say otherwise: *the camera is a
   fixed world-space offset*, and *nothing teleports the player*. Instead a game
   declares how much room it needs and the harness hands it an `area` built
   **around where the child is already standing**, so the play space is inside
   the existing frame by construction. Same outcome, no camera exception, and
   the child is never moved.

### Three smaller calls, for the record

- **The payout is score, never shards.** §6 says an empty pool pays "a small
  score bonus"; §2 says every reward is cosmetic. Shards buy potions and
  upgrades, so a round that dropped them would be a round a child could grind
  for progress. The bonus goes on the score and shows as `✨ +N`, and a verifier
  asserts a round drops nothing on the floor.
- **There is no separate pause.** §3.2 lists "pause and exit". The world is
  already frozen for the whole round — nothing can hurt anyone, nothing moves —
  and exit is one tap with no confirmation, so a second modal would be a control
  that does nothing a child can perceive. If a kid test says otherwise, it is a
  small thing to add.
- **The exit lives on the play HUD; the results screen has 🏡 instead.** Both are
  one tap, both are over the 44px floor, and both are measured against the
  viewport by the verifier — the first results layout put both of its buttons
  half off the bottom of a phone held sideways and every other assertion passed.

### The licence rule in §7 was overwritten (2026-08-09)

Dad: *"the game is only for myself and my family and will never be made public
or sold. overwrite the current rule. they can be used."* §7's closing line — no
asset enters the repo without a confirmed CC0 or CC-BY licence file, unknown
licence treated as blocked — no longer governs this build. The full record of
what that changed is in `design/ASSETS.md` and `assets/LICENSES/MANIFEST.json`.

What it changes for the games still to build: the §7 blockers are now sourcing
problems rather than licence problems. Howl Echo needs seven wolf howls that
*exist on disk*; it no longer needs them to be CC0 specifically. Same for the
anvil, the rope and the herb icons. They still have to be found and downloaded —
this environment's network policy blocks several of the asset hosts — but
"cannot confirm the licence" has stopped being a reason to stop.

`node tools/check-licences.mjs --strict` remains the gate if this ever goes
anywhere but the family.

### Left alone on purpose

- **The three existing den games** (target, shuffle, paw) are exactly what §3
  warns against — three private clocks, three scoring rules, no results screen,
  no bests, no teardown. They are untouched and still play. Migrating them onto
  the harness is its own session; breaking three things the kids already play in
  order to prove a contract is a poor trade.
- **§6 reward pools** are a content decision, not one to invent. `FETCH.rewards`
  is deliberately empty, which means every win currently takes the
  "pool exhausted" branch — so the branch that is hardest to notice is the one
  getting exercised every single round.

### What the world does during a round

`js/main.js` freezes the world while the harness is active: enemies, the den
clock and Kael all stop, and only the game's own props tick. §2 says there is no
death and no fail state, and the cheapest way to guarantee that is for nothing
else to be running.

One consequence worth knowing before writing another host: **code that runs "while
a round is live" does not run.** The first version of the Fetch host dropped its
re-arm latch inside its own update, which the freeze skips — so the ring
reopened the game on the frame the child tapped exit, with no way out. Hosts must
do their bookkeeping at the moment they open a game, not during it.
