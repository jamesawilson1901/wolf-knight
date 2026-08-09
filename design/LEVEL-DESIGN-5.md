# Level 5 — STORMREACH CLIFFS
**Aria, the Galebound · the STORM WOLF · the thunder-dash**

Written before the code, to the same standard as `LEVEL-MAP.md` for levels 1–3 and
`ROOM-STANDARD.md` for their dressing. Everything here is derived from laws already in
force; where it invents, it says so and gives the reason.

---

## 1 · Why this region exists

Regions 1–4 gave the kids four ways to **break the world**: burn it, crack it, cut it,
freeze it. Every gift so far is a verb aimed at an obstacle. Region 5 gives the first gift
aimed at **Kael himself** — a way to move that he did not have before.

That is the escalation the game needs at the halfway point, and it is the reason this
region is worth building before Sunken Vale: a movement verb changes how every room after
it is authored, so it should arrive while there are still two regions left to use it.

---

## 2 · The shape: THE SWITCHBACK

| level | shape | what it teaches |
|---|---|---|
| 1 · Ember Hollow | string of pearls | islands and chokes; the order is obvious |
| 2 · Stoneroot | hub and spoke | returning somewhere is progress |
| 3 · Wild Woods | a ring | the level itself is a place |
| **5 · Stormreach** | **a switchback** | **the level goes UP** |

Four terraces stacked up a cliff face, joined by stairs that alternate direction — east
across the first terrace, west across the second, east across the third. A child who has
walked a line, a hub and a ring now walks a **climb**.

There is no height engine. The climb is sold entirely by things that already work:

* **The stairs alternate.** Every stair choke reverses your heading. Nothing else in the
  game does that, and the zigzag is legible on the map screen at a glance.
* **The palette rises out of the storm.** The Landing is dark, wet slate under cloud; the
  Open Sky is pale gold and blue. Four districts, one gradient, bottom to top.
* **The wind changes with altitude.** Weak and gusty at the bottom, a constant roar at the
  top. It is the same system the whole way, turned up.
* **You can see where you came from.** Each terrace's south edge is an open drop with the
  district colour of the terrace below spilling up over the lip.

**The hidden spine still holds** (LEVEL-MAP's founding rule): a child who visits every
room they can see always finds the way up. The pockets hang off the spine; the shortcut
opens from the top.

### The rooms — 20 spaces

| id | module | district | role |
|---|---|---|---|
| `s1a` | island | The Landing | arrival · junction · the wrecked winch |
| `s1b` | island | The Landing | first Gale Hounds · the first weak gust |
| `s1p` | pocket | The Landing | optional · pup |
| `sc1` | stair | The Landing | **THE FIRST STAIR** · rest · travel |
| `s2a` | island | The Gale Stair | junction · the sail-wrecks |
| `s2b` | island | The Gale Stair | storm bats · the gale lane you cannot cross |
| `s2p` | pocket | The Gale Stair | optional · chest |
| `ssh` | pocket | The Gale Stair | **ARIA'S SPARK** · STORM WOLF · *introduce* |
| `sc2` | stair | The Gale Stair | *develop* · three lanes in a row |
| `s3a` | island | The Thunderhead | junction · the lightning-struck mast |
| `s3b` | island | The Thunderhead | the pack · lanes that carry enemies |
| `s3p` | pocket | The Thunderhead | optional · pup |
| `svn` | island | The Thunderhead | **THE VANES** · the puzzle room · *twist* |
| `sc3` | stair | The Thunderhead | rest · travel |
| `s4a` | island | The Open Sky | junction · above the cloud |
| `s4b` | island | The Open Sky | **the great sail-gate** · *conclude* |
| `s4p` | pocket | The Open Sky | optional · chest |
| `sc4` | stair | The Open Sky | rest · before the crown |
| `scr` | arena | Aria's Crown | **ARIA, THE GALEBOUND** |
| `ssA` | stair | The Open Sky | **SHORTCUT** · the wind bridge, `s4a → s1a` |

One new module: the **STAIR**, 24 × 12. Narrower than a Level 3 ring leg and longer than a
Level 1 choke, because a stair should feel like a passage with a direction, not a room you
stop in. It goes into the metrics zoo before it is used at scale — the rule Level 2 set for
the hub and Level 3 followed for the ring leg.

---

## 3 · The wind

The region's whole identity, and the only new world system.

A **gale lane** is a rectangle with a direction and a strength. Standing in one pushes you
along it. It is not a hazard — it never damages anyone, because the region already has
enemies for that and a five-year-old should be able to stand in the weather and look
around.

| strength | what it does | how it reads |
|---|---|---|
| `breeze` | pushes gently; you can walk against it, slowly | grass and banners lean, a few motes drift |
| `gust` | pushes hard; you can cross it sideways but not walk INTO it | debris streams past, the sound rises |
| `gale` | you cannot make headway at all; it carries you back out | a wall of streaming air, the floor scoured pale |

**A gale lane is the region's locked door.** It is the same idea as Ember's boulder and the
Wild Woods' brambles, except you can walk right up to it, lean into it, and be pushed back
— which teaches "not yet" without a single word, and better than any wall.

### THE POSE NEVER LIES applies to the weather

Every lane is drawn as what it does: streaks along its own axis, moving at a speed
proportional to its strength, in the direction it pushes. The floor under a gale is scoured
paler than the rock beside it. A lane that pushes north looks like it pushes north.

### The thunder-dash

The Storm Wolf's special. A short, very fast burst along Kael's facing:

* **Wind does not touch him during it.** That is the gate-opener — a gale lane is crossed by
  dashing, and by nothing else.
* **It hurts what it passes through**, and stuns it. Thunder, not a shove.
* **It spins a weathervane** it hits — the puzzle-room twist, and permanent thereafter.
* Cooldown 5s, and it is the shortest cooldown in the game because a movement verb that
  makes you wait is a movement verb children stop using.

It is *not* a jump, not a teleport, and it never moves Kael through a wall — NOTHING
TELEPORTS THE PLAYER still holds. It is a fast run with i-frames, resolved against
colliders exactly like walking.

---

## 4 · The four-step teach

| step | where | what |
|---|---|---|
| **introduce** | `ssh` — Aria's Spark | The shrine grants the form. One short gale lane stands between the shrine and the door. Nothing else in the room. Dash. |
| **grant + 30s** | `ssh` | A second lane, right there, with a visible gold chest behind it. The new verb pays out before the child leaves the room that gave it. |
| **develop** | `sc2` — the second stair | Three lanes in a row with standing room between them, then one lane that runs ALONG the stair instead of across it — so the same tool answers "cross it" and "ride it". |
| **twist** | `svn` — THE VANES | The dash does not only carry Kael, it PUSHES. Dashing into a great weathervane spins it, and the vane redirects the gale lane it stands in. Three vanes, three sails to open. The tool moves the world, not just you. |
| **conclude** | `s4b` + `scr` | The great sail-gate needs two lanes redirected at once. Then Aria fights with gales of her own, and the only way to reach her is through them. |

**One puzzle room per level** (dad's law) — `svn` is it. The introduce and develop steps are
inline obstacles measured in seconds, and conclude happens inside the boss fight, exactly as
Level 3 did it.

### The Vanes, in detail

Three vanes stand in three gale lanes. Each vane has four faces; dashing into one turns it
90°, and its lane turns with it. Three sail-gates around the room open when the lane
pointing at them blows the right way. Turning one vane changes the room, so the child has to
look, not just try — but nothing can be made unsolvable, nothing is timed, and dashing a
vane again always keeps going round. There is no fail state and no reset button, because a
reset button is an admission that a child can get stuck.

---

## 5 · The enemies

The **Gale Hound** family, so the boss has a family to fight like.

| variant | model | reads as |
|---|---|---|
| `gale` | wolf | storm-grey hound, white eyes; the region's baseline |
| `eldergale` | wolf | the pack leader; bigger, faster charge |
| `stormbat` | Bat | blown along the lanes, dives when you cross |
| `sparkblob` | Slime | crackling; sits in lanes and drifts |

**Weakness: earth.** Every region so far has had one element that undoes it, taught by its
puzzles. Stormreach's creatures are of the air, and the Earth Wolf's stomp — a tool the kids
have owned since region 2 — drops them out of it. It is the first region whose weakness is
NOT fire, which matters: four regions of "burn it" was becoming the only answer.

---

## 6 · The boss — ARIA, THE GALEBOUND

**BOSSES FIGHT LIKE THEIR FAMILY** (dad's law). Aria is a Gale Hound, enormous: the same
crouch, the same charge, the same red lane the kids have read since the Shadowgrip in region
one. She is not a machine of tendrils and phases.

What is new is the weather.

* **Phase 1 — the charge.** Exactly the fight they already know. Dodge the lane, punish the
  recovery. No wind. This phase exists to say *you already know how to do this*.
* **Phase 2 — the gale.** She howls up a gale lane across the arena and charges down it.
  Walking out is impossible; dashing out is not. The tool earned two districts ago is now
  the only answer to the fight in front of them.
* **Phase 3 — the crown.** Two crossing lanes and a shorter charge telegraph. Same answers,
  faster hands.

24 hp — one step above Boreal's 22. Her wounds persist across deaths, like every boss since
v3.18. She is **freed, not killed**: the gale drops, the cliff goes quiet, and her light
rests on the crown stones.

---

## 7 · What the region promises, and what it pays

**Pays off, at last:** nothing in earlier regions gates on the Storm Wolf today, so
Stormreach opens two of its own gates with the dash and seeds ONE for the Tide Wolf (region
6) — a sea-cave mouth at the Landing, flooded, with a chest visible inside it. The Ember
water gate stays where it is; it is region 6's to open, and it has waited four regions
already.

**Seeds:** the Landing's flooded cave (`tide_wolf`), and a cracked stone in the
Thunderhead that the Earth Wolf opens now — a REWARD for a tool they already have, because
a region that only rewards its own gift teaches children to stop carrying the others.

---

## 8 · Build order

1. The wind system + the Storm Wolf + the thunder-dash, provable in one room.
2. All 20 rooms as **greybox** — shells, doors, markers, topology. Verified.
3. Dressing and painted floors to ROOM-STANDARD.
4. The Vanes.
5. Aria.
6. Wiring: the region entry, the door from Frostpeak's summit, narration, music, the map.
7. Verifiers, the full suite, screenshots.

**Greybox before art, without exception.**
