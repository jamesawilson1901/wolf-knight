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
