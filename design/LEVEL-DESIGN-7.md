# Level 7 — THE SHADOW COURT
**Luna's stolen moonlight · the GHOST WOLF · Shadow-Grimm, and the ending**

The last region. Written before the code, same as 5 and 6.

---

## 1 · What this region is for

Six regions have each taught one verb and then asked for it. This one asks for
**all of them**, and then ends the story.

Two things are new, and only two — a finale is not the place to introduce a
system a child has to learn from scratch:

* **The Ghost Wolf**, Luna's own gift, which makes Kael unseen.
* **Awareness**: shadows that have not noticed him. Every enemy in the game so
  far either sees you or is dead; here they can be *unaware*, and staying that
  way is a choice the child makes.

Everything else in the Court is a question about something they already own.

---

## 2 · The shape: THE COURT

| level | shape |
|---|---|
| 1 Ember | string of pearls |
| 2 Stoneroot | hub and spoke |
| 3 Wild Woods | a ring |
| 5 Stormreach | a switchback |
| 6 Sunken Vale | a lagoon that becomes a hub |
| **7 Shadow Court** | **a hub with four locked wings, and a throne** |

Level 2's hub, returned to at the end of the game with every tool in hand. That
is deliberate: the shape a child learned second is the shape they finish on, and
it means the finale needs no explaining at all.

**Four wings. Each is opened by one verb and solved with a second** — the
"combine your tools" lesson the whole game has been building toward. Each ends in
a **relic**. Four relics open the throne.

| wing | opened by | solved with | relic |
|---|---|---|---|
| **The Ash Wing** | Fire — burn the barred door | Earth — crack the vault | THE EMBER RELIC |
| **The Root Wing** | Verdant — cut the tangle | Frost — freeze the spring | THE THORN RELIC |
| **The Gale Wing** | Storm — dash the gale | Tide — quench the fires | THE TIDE RELIC |
| **The Mirror Wing** | Ghost — walk past the watchers | any | THE MOON RELIC |

### The rooms — 20 spaces

| id | module | role |
|---|---|---|
| `x1` | island | arrival · the court gate · a watcher, seen and not passable |
| `xsh` | pocket | **LUNA'S LIGHT** · GHOST WOLF · *introduce* |
| `xh` | hub | **THE GREAT HALL** · four wing doors and the throne stair |
| `xa1` `xa2` `xa3` | island/pocket/island | The Ash Wing → the Ember Relic |
| `xr1` `xr2` `xr3` | island/pocket/island | The Root Wing → the Thorn Relic |
| `xg1` `xg2` `xg3` | island/pocket/island | The Gale Wing → the Tide Relic |
| `xm1` `xm2` `xm3` | island/pocket/island | The Mirror Wing → the Moon Relic · *twist* |
| `xp1` `xp2` | pocket | optional · a pup and a chest |
| `xst` | rim | the throne stair · rest before the end |
| `xth` | arena | **SHADOW-GRIMM** |

---

## 3 · Awareness

The one new world system, and it is small on purpose.

Every enemy gains an `alert` state: **unaware → suspicious → aware**. Today's
enemies are all born aware and nothing changes that, so the whole game before
this region behaves exactly as it did.

While Kael is **ghosted**:

* unaware enemies do not chase, do not attack, and carry on their patrol
* **attacking, breaking something, or BUMPING one** snaps it to aware — contact
  works both ways, which is the rule dad approved
* an aware enemy calms back to unaware after a few seconds out of contact,
  because a child who makes one mistake should not have to leave the room

**A watcher** is the region's lock: a shadow sentinel standing in a doorway that
is solid while it can see you and steps aside when it cannot. Not a puzzle — a
thing you walk past once you can. The first one is in the first room, blocking
something plainly worth having.

### THE POSE NEVER LIES applies to attention

An unaware shadow is **dim, slow and looking elsewhere**. A suspicious one stops
and turns toward Kael with a rising note. An aware one burns at the eyes and
comes. A child reads the state off the body, never off a meter.

---

## 4 · The four-step teach

| step | where | what |
|---|---|---|
| **introduce** | `xsh` — Luna's Light | The gift, and one watcher between it and the door. |
| **develop** | `xh` — the Great Hall | Two watchers pacing the hall, and four doors to reach past them. |
| **twist** | `xm1`–`xm3` — the Mirror Wing | Ghosting does not only hide Kael, it makes him *pass* — the mirrors that block the wing are shadow, and shadow does not stop a ghost. |
| **conclude** | `xth` — the throne | Shadow-Grimm sees everything. Ghosting buys one moment of it, and the fight is fought with all six of the other verbs. |

**One puzzle room per level**: the Mirror Wing's middle room (`xm2`) is it.

---

## 5 · Shadow-Grimm

**He was the FIRST guardian** — the great wolf whose heart the shadow took first,
and every wolf form Kael carries is a piece of his stolen strength in a kinder
bearer. That is canon (STORY-BIBLE §"The reveal"), and it decides the fight:

He wears the **same class as the Shadowgrip**, because the Shadowgrip *was* a
piece of him. A child fights the region-one boss again, enormous, at the end of
the game, and everything they learned on it still works.

**Three phases, and each one changes what hurts him**, so the fight demands every
form the child owns:

| phase | he is armoured against | the answer |
|---|---|---|
| 1 | nothing | the fight they already know |
| 2 | steel and moon | one of the six elements — any |
| 3 | whatever hit him last | *keep changing* |

Phase 3 is the whole game in one mechanic: a child who only ever learned one
wolf cannot finish it, and a child who has been switching all along barely
notices it is happening.

32 hp. Wounds persist across deaths, like every boss since v3.18.

### He is FREED, not killed

The ending, per the bible: the shadow is driven off and Grimm is left — old,
tired, and himself. He does not die. Kael gives back what was taken. Luna's
moonlight returns, and the last thing the game shows is **the Den, full**.

---

## 6 · What this region does NOT get

Written down so nobody looks for it later:

* **No new asset.** Every model is already vendored.
* **No stealth failure.** Being seen is never a loss condition — the shadows
  simply fight you, which is a thing the child has done for six regions.
* **No escort, no timer, no instant death.** A finale is not the place to
  invent a way to lose that the game has never had.

---

## 7 · Build order

1. Awareness + the Ghost Wolf + watchers.
2. All 20 rooms as greybox. Verified.
3. Dressing, using the Vale's shared dresser.
4. The relics and the four wing locks.
5. Shadow-Grimm and the ending.
6. Wiring, verifiers, the full suite.

**Greybox before art, without exception.**
