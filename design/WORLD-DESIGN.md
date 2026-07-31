# WOLF KNIGHT — WORLD DESIGN (Regions 2–7)

> **CHANGELOG (2026-07-31, committed):** Adopted from the user's proposal.
> §5 has been RECONCILED with the canon STORY-BIBLE addendum (the doc's
> original §5 guessed Tidefall/Thunderreach/Hollowfrost/Highfell/Moonspire;
> canon is Wild Woods/Frostpeak/Stormreach/Sunken Vale/Shadow Court —
> structure kept, content swapped, per the doc's own instruction). §1's
> engineering decision is adopted with one surgical adaptation: region
> MANIFESTS (js/regions.js) carry the nine beats, gates, restoration and
> journal hooks with machine-checked rules — but room geometry stays in the
> proven rooms.js builders the manifests point at. Migrating the two shipped,
> verified regions to JSON would be a rewrite for zero player value; the
> manifest layer delivers the testability, validation and cheap-authoring
> goals without it. Process (user-locked): ONE REGION AT A TIME, each ends
> with explicit approval before the next begins.

**Status:** adopted, 31 July 2026. Companion to SYSTEMS.md and STORY-BIBLE.md.

**How to use this doc:** Sections 1–4 are *structural* — they define how a region is
built and hold no matter what the STORY-BIBLE addendum says about elements or
names. Section 5 is *content* — reconciled to the canon addendum. Do not let the
two docs drift; reconcile before building.

---

## 1. The one engineering decision that matters

Do **not** hand-build six regions in code. Build **one region system** and author
regions as **data**.

Implementation (adapted, see changelog): `js/regions.js` holds one manifest per
region — the nine beats, gate declarations (`requires` / `hint` /
`firstShownIn`), encounter notes, the before/after WorldState pair, the
restoration block, ripple, scar, Den-arrival and "???" hooks — validated by
`validateRegions()` at boot and in the verify scripts. Room geometry lives in
rooms.js builders the manifest references. Code changes only when a genuinely
new *kind* of thing is needed.

**Session order this implies:** schema + validation + the two shipped regions
expressed as manifests *first* (proof), then regions 3–7 are authoring passes
against a proven template.

---

## 2. The region template

Every region is built from the same nine beats, in this order. Deviating is allowed;
skipping is not.

1. **Approach route** — Pokémon-style connective road from the previous region. See §4.
2. **Threshold** — a settlement, camp or den at the region mouth. Faces, a rest
   point, a rumour about what's inside, and one NPC who reappears after the healing.
3. **The lock, visible** — within the first minute, the player *sees* the thing they
   cannot yet pass. Not signposted, just present.
4. **Ki — introduce** — a safe pocket that teaches this region's core interaction
   using an ability the player *already has*. No stakes, no death, room to fiddle.
5. **Shō — develop** — the same idea with pressure: enemies, timing, height.
6. **Ten — twist** — the region's signature moment. The known ability used a way the
   player hasn't seen. This is the bit the kids will describe to each other later.
7. **Boss** — demands the twist. Telegraph → threat → vulnerability → punish, phases,
   signature move, per existing boss doctrine.
8. **Spirit grants the ability** — the region's spirit gives the new power. It opens
   the lock from beat 3 *in this region* immediately, so the reward is felt within
   thirty seconds, not two hours later. (Shipped precedent: the Kiln shrine grants
   the form MID-dungeon — grant placement may sit anywhere that honors the
   thirty-second rule.)
9. **Restoration, witnessed** — the region heals on screen while the player stands in
   it. See §3.

The kishōtenketsu shape in beats 4–7 is the Nintendo teaching pattern: introduce a
mechanic in safety, develop it, twist it, then demand mastery of it. Applied to a
region rather than a five-minute stage, it gives each region an identity a child can
name — "the one where you freeze the waterfall".

---

## 3. The three inherited pillars, made concrete

### Zelda — lock and key

The rule to enforce everywhere: **show the lock before the key.** Every ability
granted in region N must have its lock already visible to the player in region N−1 —
as background scenery they walked past and couldn't use.

Rules for the data-driven Gate system:

- Each gate declares `requires: <abilityId>`, a `hint` (the two organic cues rule
  still applies — no markers), and a `firstShownIn: <regionId>` field.
  `validateRegions()` **fails** if a gate's ability is granted before it is first
  shown — lock-before-key is machine-checked, not a hope.
- Abilities are permanent keys that open many locks (the metroidvania model), not
  consumable small keys. (Dungeon keys like the Kiln Key stay: they are one-lock
  story beats inside a dungeon, not a resource.)
- Every ability must earn its keep in at least three places outside its home region.
  An ability used once is a cutscene with extra steps.
- Old abilities return as components of new puzzles. Fire from region 1 melts things
  in Frostpeak; that callback is the payoff for having a chain at all.

### Pokémon — the space between

Routes are not corridors. Each approach route gets:

- **An S-bend or a loop**, never a straight line.
- **A third place** — neither town nor dungeon; a lookout, a fishing shelf, a
  ruined shrine. No objective. This is where a tired kid stops.
- **Optional-but-visible** side pockets holding a heart piece, a cosmetic, or a
  "???" — reachable now or with a future ability.
- **A recurring duel** — a named rival who shows up on most routes and escalates.
  Canon fit: **Grimm's herald**, a recurring shadow-wolf duelist (Grimm himself
  taunts but is not fought until the Shadow Court; the reveal makes a shadow-wolf
  rival deeply on-theme). Exact identity decided at its first region.
- **Return hooks logged as "???"** — two per route (existing mystery log).

Difficulty on a route is *traversal and small skirmishes*, not boss-grade combat.

### Terranigma — witnessed restoration

The rule: **the player must be standing in the world when it changes.** Each
region's manifest declares a `restoration` block: ordered beats (palette shift,
prop set change, ambient/audio swap, one NPC/spirit action), a duration, and a
skippable flag. WorldState persists the result per profile.

Three additions that make restoration compound rather than repeat:

1. **Ripple.** Healing region N changes one small visible thing in region N+1's
   approach — a green shoot in the ash, one bird ahead of the others.
2. **The Den grows.** One resident (family or spirit) from each healed region moves
   into the home Den. Seven regions later the Den is full of people who remember
   what the player did. This absorbs fix-plan item 5 — the Den's first residents
   plus the template the later six follow.
3. **One thing stays broken.** A small scar per healed region that never mends.
   Total restoration reads as false to children; one broken thing makes the rest
   believable.

---

## 4. Kid-difficulty rules specific to world content

Existing rules stand (no one-shots, full hearts on respawn, boss phase checkpoints,
puzzle resets, hidden assists). Add, for open-world content:

- **No region is a dead end.** Every region has a walkable path back to the Den from
  its entrance without combat (fast travel counts once the moonstone knows it).
- **Nothing missable.** Every collectable is re-obtainable.
- **Puzzles are physical, not symbolic.** Push, burn, freeze, weigh down, light up.
  No riddles, no reading-dependent or number puzzles.
- **A stuck timer, not a marker.** ~90 seconds in one room with no progress → Pip
  does something in-world: trots toward the answer, sniffs, barks once. Organic,
  no UI, escalates only if it keeps failing. (Extends the existing stuck-hint
  lines with a physical behavior.)
- **One new idea per region.**

---

## 5. Canon region chain *(reconciled with the STORY-BIBLE addendum)*

Each region's reward is the next region's admission ticket; each lock is visible
one region early.

| # | Region | Spirit | Ability granted | Opens | Lock first shown in |
|---|--------|--------|-----------------|-------|---------------------|
| 1 | **Ember Hollow** *(built)* | Cinder | **Fire Wolf** — ground-slam, burn, ignite braziers | scorched vines, braziers; melts Frostpeak ice later | R1 (burnable cubby, minute one) |
| 2 | **Stoneroot Caverns** *(built)* | Petra | **Earth Wolf** — stomp: crack rock, stagger armour | cracked piles, boulder gates, armoured foes | Ember Hollow (gold-veined boulder, R2) ✓ shipped |
| 3 | **Wild Woods** | Sylva | **Verdant Wolf** — vine-lash: cut brambles, snare foes | bramble walls, withered trellises | Stoneroot (bramble-choked vent — to place in region 2 pass) |
| 4 | **Frostpeak** | Boreal | **Frost Wolf** — ice-howl: freeze water and enemies | frozen crossings, stilled geysers | Wild Woods |
| 5 | **Stormreach Cliffs** | Aria | **Storm Wolf** — thunder-dash: cross gaps, charge dead machinery | long gaps, the Mill's dead machinery callback | Frostpeak |
| 6 | **Sunken Vale** | Meri | **Tide Wolf** — bubble-shield water-walk | every water crossing stared at all game | Ember Hollow (R2b water gate) ✓ shipped — and deliberately everywhere |
| 7 | **The Shadow Court** | Luna's moonlight — and Grimm | **Moonlight** — reveal hidden, banish shadow | the finale and every late "???" | Region 1 onward (dark seams) |

Notes on the chain:

- **Region 6 is the payoff region.** Water-walk opens crossings the player has
  seen since region 1 (the R2b gate already ships). Place a visible water pocket
  in *every* region from now on — cheapest rule here, most likely to be forgotten.
- **Form pressure alternates** so neither Knight nor wolves go stale: R2 rewards
  Knight (armoured foes, parry), R3 Wolf (snare-and-speed), R4 Knight (shield vs
  ranged ice), R5 Wolf (dash), R6 Wolf (water mobility), R7 both — forced
  switching under pressure, where the Blood Moon Surge finds its final expression.
- **Spirits:** one per region, Cinder's role: witness the fight, grant the gift,
  appear in the restoration, then move to the Den. Seven spirits at the Den is the
  closing image.
- **The Shadow Court and Luna.** Region 7 resolves Luna's stolen moonlight; the
  final boss is Shadow-Grimm per the addendum's approved reveal (the fight FREES
  him). Relic-locked wings themed per region verb, per the addendum.

---

## 6. Build order (user-locked process: one region per pass, approval gates)

**Session A — schema.** Manifests + `validateRegions()` (lock-before-key build
failure), restoration block format, ripple/scar/Den-arrival hooks, both shipped
regions expressed as manifests as proof. Bring Ember Hollow up to the template
(witnessed restoration, ripple, scar, first Den resident). **→ STOP: approval.**

**Session B — Stoneroot to template.** Route, threshold, nine-beat audit + gap
fixes, restoration, Den arrival, ripple into Wild Woods' approach, bramble lock
placed (region 3's lock, shown in region 2). **→ STOP: approval.**

**Sessions C–G — regions 3 to 7,** one per session, mostly authoring. Region 7
will need code (finale, multi-phase). **→ STOP: approval after each.**

**Between every session:** the kids play it. The acceptance test for a region is
whether a 5-year-old finishes it without help and a 7-year-old can explain what
the region's trick was.

Per-region acceptance checks:

- The new ability opens something within 30 seconds of being granted.
- The lock for the *next* ability is visible and passed by, unremarked.
- The restoration was watched, not discovered.
- One new resident is in the Den.
- There is a path from the region entrance back to the Den with no combat.
- Something is still broken.

---

## 7. Standing risks

**Doc drift.** This file, STORY-BIBLE.md and js/regions.js must agree; the
validation pass catches gate/order drift, humans must catch story drift.

**This is a lot of game.** Six regions plus the remaining fix-plan items is a long
project. The schema-first order is what makes it survivable: if the project stops
after Session C, what exists is three complete regions and a working template, not
six half-regions.
