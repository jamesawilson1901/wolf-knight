# Asset Plan — Wolf Knight 3D

> **CHANGELOG (2026-07-31 doc-truth pass):** The casting sheet's code-built
> workarounds (blob Shades, triangle-wing Moths, blob Shadowgrip) are DEAD —
> the monsters pack landed and the standing rule is now **no code-built
> creatures, ever**: every being uses a real pack model (Shade = tinted
> slime, Ember Moth = tinted bat, Shadowgrip = tinted Dragon). Wolf tint
> list updated to the canon addendum forms. Pack list unchanged.

All packs below are **CC0** (public domain) and **verified to exist with the creatures we need**.
Style family: chunky soft-shaded low-poly (Quaternius / KayKit / Kenney 3D — deliberately matching).

> **HARD RULE (learned the hard way):** the human downloads these packs manually in a browser and
> drops the zips into ./asset-downloads. The build agent NEVER generates placeholder geometry for
> characters/creatures and NEVER invents file paths — it extracts the real packs, inspects the real
> filenames, and loads those. Prefer .gltf/.glb files; if a needed model has no glTF, say so
> instead of silently substituting.

## The packs (download checklist)

| Pack | Gives us | Source |
|---|---|---|
| **Quaternius — Ultimate Animated Animal Pack** | **Wolf** (Kael's forms), **Fox** (Pip), Husky/Shiba (pup options) — 12 animals, 12+ animations each (Attack, Death, Walk, Run, Jump…), glTF included | https://quaternius.com/packs/ultimateanimatedanimals.html |
| **KayKit — Character Pack: Adventurers** (free tier) | **Knight = Kael**, rigged; + other heroes for later NPCs | https://kaylousberg.itch.io/kaykit-adventurers |
| **KayKit — Character Animations** (free, CC0) | 161 humanoid animations for KayKit rigs: idle/walk/run/dodge, melee (1-h, 2-h, blocking), hit/death/spawn — FBX + GLTF | https://kaylousberg.itch.io/kaykit-character-animations — grab the **Free** file (skip "Source Files"); do NOT use the old "(Legacy)" page at /kaykit-animations |
| **Quaternius — LowPoly Animated Monsters** | Enemy bodies (become Shades/Moths via dark tint) | https://quaternius.itch.io/lowpoly-animated-monsters |
| **Kenney — Nature Kit** (330 pieces) | Rocks, terrain, trees, props — Ember Hollow's bones | https://kenney.nl/assets/nature-kit |
| **Kenney — Castle Kit** | Walls, pillars, ruins — boss arena + structure | https://kenney.nl/assets/castle-kit |
| *(optional)* Quaternius dungeon/nature packs | Extra cave/dungeon modules, same style | browse https://quaternius.com (Nature / Buildings categories) |
| **Kenney — Particle Pack** | Fire/smoke/magic/spark/heart sprites → Pip's sparkle, death puffs, Blood Moon + slam FX, lava embers | https://kenney.nl/assets/particle-pack |
| **Quaternius — Modular Dungeon Pack** | Cave walls/interiors for Ember Hollow (FBX/OBJ — no glTF; fine for static pieces, flag don't improvise) | https://quaternius.itch.io/lowpoly-modular-dungeon-pack |
| **Kenney — RPG Audio** (SFX) | Sword swings, hits, footsteps | https://kenney.nl/assets/rpg-audio |
| **Kenney — UI Audio** (SFX) | Clicks, toggles, chimes (pup-found, checkpoint) | https://kenney.nl/assets/ui-audio |
| **Kenney — Impact Sounds** (SFX) | Heavy thumps for Blood Moon / ground-slam | https://kenney.nl/assets/impact-sounds |
| **Kenney — UI Pack** | Heart icons + button graphics for the HTML HUD | https://kenney.nl/assets/ui-pack |
| Music — region loop | "Cave Theme" (Brandon Morris, CC0) → rename `region-ember` | https://opengameart.org/content/cave-theme |
| Music — boss loop | "Boss Battle Music" (Juhani Junkala, CC0, seamless) → rename `boss` | https://opengameart.org/content/boss-battle-music |
| Music — victory sting | "Victory Fanfare Short" (cynicmusic, CC0) → rename `victory` | https://opengameart.org/content/victory-fanfare-short |
| *(bonus, regions 2–7)* HydroGene 16-bit RPG Music | 28 CC0 seamless RPG loops, future region music | https://hydrogene.itch.io/high-quality-16-bit-music |
| *(if it exists on his page)* KayKit — Dungeon Pack Remastered | Style-matched cave interiors (same artist as the knight) | look on https://kaylousberg.itch.io |

Audio + narration plan is unchanged from HUD-MENU-SAVE.md (CC0 Kenney SFX packs, CC0 music,
Web Speech API narration).

## Casting sheet (model → role, with workarounds)

- **Kael (knight form):** KayKit Adventurers Knight.
- **Wolf forms ×7 (canon addendum):** ONE Quaternius Wolf model; per-form **material colour
  tint** in code (dark 0x4a3b6b · fire 0xff5a2b · earth 0x8b6b3d · verdant ~0x6fae4a ·
  frost ~0x9be3ff · storm ~0xf2f2ff · tide ~0x3aa0ff — later four provisional until built).
  No extra models, ever.
- **Pip:** Quaternius Fox.
- **Lost wolf pups:** the Wolf model **scaled down** and recoloured. No pup model needed.
- **Shade (grunt):** Quaternius monster **Slime, shadow-tinted** (real model — the blob
  workaround is banned).
- **Ember Moth:** Quaternius **Bat, ember-tinted** with glowing wings.
- **Shadow Hound (elite):** **the Wolf model tinted black** — a dark mirror of Kael.
- **The Shadowgrip (boss):** Quaternius **Dragon, shadow-tinted**, hovering over the caged
  Cinder (code builds only the cage shell/rings — never the creature).
- **Stoneroot roster:** Slime, Bat, Skeleton Minion/Rogue, armored skeleton = Bone Warden —
  all real pack models, tinted per role.
- **Den shopkeeper:** KayKit Adventurers **Mage** (rig-library Idle_A).
- **Den villagers (v3.12):** KayKit Adventurers, same Rig_Medium skeleton as the
  Knight so the rig-library clips bind by bone name — **Wren the wanderer** =
  Rogue_Hooded (there from the start) · **Rook the ranger** = Ranger (arrives once
  Ember Hollow is healed) · **Old Bram** = Barbarian (visits once Stoneroot sings —
  same Bram as the e1 camp voice). Idle_A base + occasional Idle_B/Interact gesture.
- **Biscuit the den dog:** Quaternius **Husky** (own clips: Idle/Walk/Eating),
  wandering waypoints around the campfire.
- **Cinder (freed spirit):** glowing ember-orange sphere/flame with a strong warm point light,
  gentle float animation. Code, not a model.
- **Lava:** flat plane with emissive orange material (+ slow UV scroll if easy). It genuinely
  lights the cave — a free 3D win.
- **Dark zones / Dark Wolf "see in the dark":** real lighting — dark rooms are simply unlit;
  Dark Wolf form attaches a light to Kael / raises ambient. Boss Phase 3 uses the same trick.

## Wild Woods casting (v3.19)
- **Flora:** KayKit Forest Nature Pack — 14 vendored pieces (trees ×6,
  bushes ×3, rocks ×3, grass ×2) + forest_texture.png, in assets/env/forest.
- **Thorn Hound / Elder Thorn Hound:** the Wolf model, mossy-green tints.
- **Bramble Blob:** Slime, deep green. **Wisp Moth:** Bat, pale-green glow.
- **Sylva, Thornbound (boss):** the giant-wolf duel class in its 'sylva'
  skin — green body, leaf-light instead of Cinder's ember. NO new models
  anywhere in the region (the asset-multiplication law at full stretch).
- **Verdant Wolf:** the one wolf model, tint 0x6fae4a, leaf aura in code.
- Music: reusing the causeway loop for now — a dedicated woods track is on
  the download list (HydroGene 16-bit RPG Music, CC0).

## Asset multiplication (standing rule)
One model, many monsters: tint + scale + stats + elements make variants
(VARIANTS registry in enemies.js — Cinder Shade / Elder Hound / Bone
Brute shipped as the pattern). Weapon props from the gear packs become
distinct STYLES via arc/stun/element fields in items.js. Prefer a new
variant over a new model whenever the silhouette still reads.

## Licence notes
Everything above is CC0 → CREDITS.md still lists sources as courtesy. three.js is MIT — include
its licence line in CREDITS.md.
