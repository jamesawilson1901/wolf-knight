# Level 6 — THE SUNKEN VALE
**Meri, the Drowned · the TIDE WOLF · the bubble-shield**

Written before the code, same as `LEVEL-DESIGN-5.md`. Where it departs from an
earlier document it says so and gives the reason.

---

## 1 · The promise this region keeps

There is a water gate in **Ember Hollow**, in `r2b`, visible in the first ten
minutes of the game. Four regions have walked past it. `js/gates.js` has carried
`water: { ability: 'tide_wolf' }` since before any of this was built.

This is the region that opens it. That is not a detail — it is the strongest
thing the game can say to a child who has been remembering that gate since they
were five minutes old: *we told you we would come back, and we did.*

---

## 2 · The shape: THE LAGOON — a hub that does not exist yet

| level | shape | what it teaches |
|---|---|---|
| 1 · Ember Hollow | string of pearls | islands and chokes; the order is obvious |
| 2 · Stoneroot | hub and spoke | returning somewhere is progress |
| 3 · Wild Woods | a ring | the level itself is a place |
| 5 · Stormreach | a switchback | the level goes UP |
| **6 · Sunken Vale** | **a lagoon** | **the level CHANGES when you are given the gift** |

Four shores around one great flooded bowl. Until the Tide Wolf, the water in the
middle is a wall you can see across, and you walk the rim from shore to shore the
long way. After it, **the lagoon is the road**: every shore is one crossing from
every other, and the level a child has been walking around for twenty minutes
turns inside out.

Level 2 taught that returning somewhere is progress. This is the same lesson at
the scale of a whole region, and it is the last new shape the game needs — region
7 is a different kind of thing altogether.

**The hidden spine still holds.** The rim is a complete walkable loop, so a child
who never works out what the lagoon is for still finishes the region. The
crossing is a shortcut, never a requirement — except into the Deep, which is the
boss door and is *supposed* to need the gift.

### The rooms — 20 spaces

| id | module | shore | role |
|---|---|---|---|
| `d1a` | island | The Shallows (east) | arrival · junction · the drowned gate |
| `d1b` | island | The Shallows | first Tide Blobs · THE LOCK IS SHOWN |
| `d1p` | pocket | The Shallows | optional · pup |
| `dg1` | rim | The Shallows | rest · the rim path north |
| `d2a` | island | The Reedbeds (north) | junction · the fisher's ruin |
| `d2b` | island | The Reedbeds | deeper water · the eels |
| `d2p` | pocket | The Reedbeds | optional · chest |
| `dsh` | pocket | The Reedbeds | **MERI'S SPRING** · TIDE WOLF · *introduce* |
| `dg2` | rim | The Reedbeds | *develop* · three depths |
| `d3a` | island | The Drowned Town (west) | junction · the sunken hall |
| `d3b` | island | The Drowned Town | the pack, waist-deep |
| `d3p` | pocket | The Drowned Town | optional · pup |
| `dtp` | island | The Drowned Town | **THE TIDE POOLS** · the puzzle room · *twist* |
| `dg3` | rim | The Drowned Town | rest |
| `d4a` | island | The Salt Flats (south) | junction · the whale-bones |
| `d4b` | island | The Salt Flats | **THE LOCK GATE** · *conclude* |
| `d4p` | pocket | The Salt Flats | optional · chest |
| `dg4` | rim | The Salt Flats | rest · before the deep |
| `dlg` | lagoon | The Lagoon | **the water itself** — the hub that unlocks |
| `ddp` | arena | Meri's Deep | **MERI, THE DROWNED** |

One new module: the **LAGOON**, 34 × 30 — the biggest space in the game, and it
has to be, because its whole job is to be a distance you could not cross.
Straight into the metrics zoo before it is used, same rule as the hub, the ring
leg and the stair.

---

## 3 · The water

Two depths, and they are not the same kind of thing at all.

| depth | before the gift | after it | how it reads |
|---|---|---|---|
| **shallow** | walk through it, slower | the same | ripples at the ankle, the floor visible through it |
| **deep** | a wall you can see across | walk on it inside a bubble | dark, moving, no bottom in sight |

**Deep water is a wall you can see through**, which is the best kind of locked
door this game has found: better than Ember's boulder (opaque), better than the
Wild Woods' brambles (opaque), and the equal of Stormreach's gale — except that a
gale pushes you back while water simply says *no* and lets you stand there
looking at what you cannot reach yet.

### Why this is not a per-frame system

Deep water is **colliders at build time**. A room asks whether the child has the
Tide Wolf and either lays the colliders or does not, exactly the way every gate
in the game already works. No tide clock, no rising and falling, nothing to
resynchronise on a reload. The region's fiction is a vale that drowned long ago
and stayed drowned — not a tide table.

### The bubble

The Tide Wolf's special is not an attack. Holding it up:

* lets Kael **stand on deep water** — the bubble carries him
* **soaks whatever is inside it** — enemies in the bubble are slowed and lose
  their footing, which is the region's answer to being swarmed in the water
* and **puts out fire**, which is the first time one gift has ever undone
  another's work. That is the joke, and it is also how the Tide Pools puzzle
  works.

Cooldown 6s, duration 4s. It is the first special with a DURATION rather than an
instant, and the HUD has to say so.

---

## 4 · The four-step teach

| step | where | what |
|---|---|---|
| **introduce** | `dsh` — Meri's Spring | The spring grants the form. One channel of deep water between it and the door. Nothing else in the room. |
| **grant + 30s** | `dsh` | A second channel with a gold chest on an islet, visible from the spring. |
| **develop** | `dg2` — the north rim | Shallow, then deep, then shallow again — the same walk answering all three, so a child learns depth is a thing to LOOK at rather than a thing to fear. |
| **twist** | `dtp` — THE TIDE POOLS | The bubble puts fires OUT. Three braziers burn on three islets and the doors they hold shut open when they are quenched — so the tool the region gave is used against the tool region ONE gave. |
| **conclude** | `d4b` + `ddp` | The lock gate: a deep channel with the pack waiting on the far side, so the crossing has to be done under pressure. Then Meri, in water too deep to stand in. |

**One puzzle room per level** — `dtp` is it.

---

## 5 · The enemies — the Tide family

| variant | model | reads as |
|---|---|---|
| `tide` | Slime | a blob of standing water; the region's baseline |
| `deeptide` | Slime | bigger, darker, splits the pack's attention |
| `gull` | Bat | wheels over the lagoon and dives at anything crossing it |
| `drowned` | Skeleton Minion | what is left of the people who lived here |

**Weakness: storm.** Region 5's gift, one region later — the same courtesy
Stormreach paid Stoneroot with its cracked stone. Water conducts, and a child who
still has the thunder-dash in their pocket finds it is the answer here.

---

## 6 · The boss — MERI, THE DROWNED

Three wolf-shaped bosses (the Shadowgrip, Sylva, Aria) is enough wolf-shaped
bosses. Meri's family is the **Tide Blobs**, and she fights like them: an
enormous one.

* **She HOPS.** A deep crouch, a red landing ring, and a slam that soaks the
  arena. The tell is the same crouch a blob makes, at four times the size.
* **She is exposed after she lands**, under the gold ring, exactly like every
  collapse window in the game.
* **She floods the floor** as she loses health — the standing ground shrinks and
  the deep water grows, so the bubble stops being optional.

28 hp, one above Aria's 26. Her wounds persist across deaths. She is **freed, not
killed**, and the vale drains — the last thing a child sees is the drowned town
standing up out of the water.

---

## 7 · What it pays, and what it keeps promising

**Pays, at last:** the Ember water gate in `r2b`, promised in the first ten
minutes of the game and four regions old. Also the sea cave at Stormreach's
Landing, one region old.

**Seeds:** one gate for the Shadow Court's ghost-walk, in the drowned town — a
door with nothing behind it but dark, which is exactly what region 7 is.

---

## 8 · Build order

1. The water system + the Tide Wolf + the bubble.
2. All 20 rooms as **greybox**. Verified.
3. Dressing and painted floors to ROOM-STANDARD.
4. The Tide Pools.
5. Meri.
6. Wiring: the region entry, the door from Aria's Crown, narration, the map, and
   **the Ember gate finally opening**.
7. Verifiers, the full suite, screenshots.

**Greybox before art, without exception.**
