# ROOM STANDARD — what a room has to be

Written 2026-08-08 from dad's answers after the first real playthrough of the
rebuilt levels. His verdict, in his words: the levels *"are largely filled with
nothing… big but bare… they aren't like a Zelda game or Terranigma game or even
a Pokémon game that uses space effectively."*

He was right, and the numbers agree:

| | measured |
|---|---|
| dungeon props available to Level 1 | 25 |
| dungeon props Level 1 uses | **3** (Arch_bars, Column, Torch) |
| forest models available to Level 3 | 14 |
| forest models Level 3 uses | **0** — it uses two generic Kenney nature trees |
| distinct models across all three rebuilt levels | 33 of 115 vendored |
| floor | one Kenney tile, one flat tint per district |

The previous work built a system that *places* things and then never populated
it. Every topology assertion passed while the rooms were empty boxes. **A
verifier cannot tell you a room is boring.** That is the lesson this file
exists to prevent repeating.

---

## THE STANDARD

### 1 · Density — "busy but clear"
Something to look at everywhere: edges, corners, and mid-room clusters. Open
ground kept where fights happen. Zelda screens are dense and you can still
always swing.

### 2 · Structure — the room is shaped, not a box
Interior walls, ruins, rock formations, buildings. You navigate *around* things.

- **Big things block.** Ruins, rocks, trees, walls, furniture.
- **Small things don't.** Grass, flowers, debris, scatter — walk straight through.

### 3 · Height — ledges you climb, gaps you jump
Low platforms (~1 u) reached by ramps and steps, with drops you can walk off.
Some gaps must be jumped.

> **THE FIVE-YEAR-OLD RULE.** A required route is ALWAYS walkable. Jumps only
> ever reach *optional* things — a secret alcove, a shortcut, a chest. The nine
> year old gets a real mechanic; the five year old never hits a wall she cannot
> pass. This sits alongside the existing laws (nothing teleports the player, no
> dead ends).

### 4 · Things to do — all four kinds of secret
- **Break things open** — pots, crates, barrels, for shards and hearts.
- **Hidden alcoves** — nooks behind ruins and rock, found by exploring off-path.
- **Only the Dark Wolf sees** — rewards a form they already own, teaches switching.
- **Under and behind** — beneath liftable things, behind foliage.

### 5 · Life — the world is inhabited
Creatures that scatter and react, AND survivors to free. Freeing a survivor is a
real mechanic with a real reward: a wolf pup, a heart piece, shards, and they
turn up back in the Den afterwards. **Keep their dialogue to a line or two** —
dad: *"too much dialogue will be clicked through."*

### 6 · Floors — never one flat colour
- Real texture detail: cracks, cobbles, grass tufts, dirt.
- Several materials meeting inside one room — path into grass into dirt.
- A pattern per district, not just a tint.
- Worn paths that guide you toward the way onward.

### 7 · Mood — Zelda's density, Terranigma's melancholy
Dense hand-placed screens with secrets everywhere, in spaces that feel lived-in
and a little sad.

**Ember Hollow is RUINED AND SAD** — somewhere people *lived* before it burned.
Broken homes, abandoned belongings, a settlement with a past. That is what the
unused Barrel, Crate, Vase, Banner_wall, Woodfire, Pedestal and Statue_Horse are
for.

---

## PROCESS

1. `la` — the first room of the game — is rebuilt to this standard first.
2. Dad approves or corrects it.
3. Only then does it get applied to the other 51 spaces.

Existing vendored assets only. Anything genuinely missing gets listed and
vendored after the showcase room proves the standard.

---

## ALSO RAISED IN THE PLAYTEST

- **Buttons are too big** and eat the screen. Fix: smaller AND contextual —
  jump/defend/ranged appear only when usable.
- **The computer voice.** Keep TTS but choose the voice deliberately (the picker
  currently prefers `localService`, which on Android is usually the worst one)
  and tune rate/pitch per character.
- **A floating archway in `la`** — two pillars standing, the third lying
  sideways at head height resting on nothing. `js/level1.js`, the `gate` hero
  prop. It is in the first room of the game.
- It **played** well otherwise.


---

## PROGRESS (2026-08-09)

All 52 dressed spaces across the three built regions have been rebuilt to this
standard. `tools/verify-density.mjs` measures every one of them at its own spawn
point, in the arrival frame.

| | before | after |
|---|---|---|
| distinct models used, all three levels | 33 of 115 | **all 14 forest models, all 25 dungeon props, in use** |
| Level 1 dungeon props used | 3 of 25 | 25 |
| Level 3 forest models used | **0 of 14** | 14 |
| floor | one Kenney tile, one flat tint per district | painted per room: pattern, patches, worn path |
| draw calls, worst room | 85 (empty) | 111 (dressed) against a 125 ceiling |

### What §1–§2, §4, §6 and §7 got

Density, structure, secrets, floors and mood are done. The vocabulary is
`js/dressing.js` — clusters, not props: `ruinedHome`, `cartWreck`, `wayshrine`,
`fallenColumn`, `lowWall`, `rubbleField`, `aftermath`, `coldHearth`, and the
forest half `grove` / `thicket` / `blight` / `mossyRuin`. Every cluster obeys
§2: big things take colliders, small things take none.

Two room types are dressed at the **perimeter only**, and this is a rule rather
than an omission — it is written beside each one in code:

* **puzzle rooms** (`ld1`, `vb3`, `tkn`) — the mechanic is a thing you have to
  spot, and clutter competes with it
* **boss arenas** (`le`, `vz`, `tgl`) — anything you can snag on mid-arena turns
  a readable dodge into an unfair hit

### What is NOT done, and is the next work

* **§3 HEIGHT — ledges you climb, gaps you jump. Not started.** The player has
  an `airY` used for jump arcs over a flat plane; nothing in the world can drive
  a walkable `y`. This is engine work across movement, collision and the shadow
  box, not a dressing pass, and doing it badly would break the five-year-old
  rule everywhere at once. It is the largest remaining item in this file.
* **§5 LIFE — creatures that scatter, and survivors to free. Not started.**
  `js/npcs.js` populates the Den only; there is no ambient-creature system and
  no rescue mechanic in the levels. Dad's steer on this is already recorded:
  a mechanic with a reward, and *"too much dialogue will be clicked through"*.
* **Stoneroot reads too dark.** The dressing is there and the measurements pass,
  but `vh` in particular is hard to see. That is a lighting problem, not a
  content one, and it wants a pass of its own.


---

## THE SEAM (v3.37.0)

Dad, after the dressing pass: *"what are your thoughts... instead of going
through 'doors' to the next room, just making it all flow on from one another
except for boss areas and locked areas."*

The answer taken was **yes to the feeling, no to the rewrite**. Zelda,
Terranigma and Hollow Knight are all room-based underneath; rooms are what make
this game authorable, and every system here (enemy budgets, draw calls,
checkpoints, the map, WorldState, 52 build functions) assumes one room is one
world. What needed fixing was the SEAM, not the topology.

### The law a door now obeys

| where it leads | what it costs |
|---|---|
| within a district | **90 ms** — barely a blink |
| between districts | **170 ms** — a beat, because colour and music change |
| into a boss arena | **300 ms** — the full ceremony |

So a door means something again. Before this, all 52 doorways made the same
promise and 48 of them broke it. The rule a five-year-old ends up learning is:
**if the screen takes its time, something is about to happen.**

### What crosses with the child

Position along the doorway, heading, velocity and camera look-ahead. Leave three
units left of the arch, arrive three units left of the arch. Their own heading
is kept unless they scraped through sideways.

### Seeing the next room

Each doorway spills the destination district's colour — a fan on the floor and
the opening standing lit in the wall (`thresholdGlow`, one draw call per room,
colour on the vertices). It self-selects: a door between two rooms of the same
district shows nothing, which is correct.

### Still deliberately NOT done

* **Enemies do not follow you through a door.** Retreating into the last room is
  how a five-year-old survives a fight she is losing. Making the world flow must
  not quietly delete that.
* **The chokes are still rooms.** They are compression and rest between islands.
  Removing the *interruption* is right; removing the *beat* is not.
* **Zone merging** (islands + their choke built as one world) is the real
  continuous option and is only worth doing if the above still feels chopped
  once the kids have played it.
