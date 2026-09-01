# Asset licences

Every third-party pack vendored into this game keeps **its own licence file
here, verbatim as the pack shipped it**. Nothing in this folder is written by
hand — a licence you typed yourself is not evidence of anything.

`MANIFEST.json` maps each pack to the files it covers, quotes the line of its
licence that grants the right, and records where to re-fetch it.

## The rule (v3.21)

> **A pack does not ship until its own licence file is in this folder.**
> Not the creator's reputation, not another pack by the same creator, not a
> blog post — the file that came in the download.

This exists because the v3.20 audit found packs in the shipping build whose
CC0 status was asserted in `CREDITS.md` and backed by nothing on disk. Two of
them are Kael himself and half the bestiary.

## Check it

```sh
node tools/check-licences.mjs           # every asset dir must be claimed
node tools/check-licences.mjs --strict  # ...and nothing may be PENDING
```

Run the plain form in normal development; run `--strict` before anything
that looks like a commercial release. `--strict` currently fails, on purpose.

## Still pending (4 packs)

These ship in the build **now** and are not cleared. Ordered by how much it
would actually hurt to be wrong.

| Pack | What it is in the game | How to clear it |
|---|---|---|
| **HydroGene — 16-bit RPG Music** | **8 of the game's 10 tracks** — boss, den, causeway, kiln, Stoneroot, Frostpeak | The pack's readme is on file (`hydrogene-16bit-rpg-music-README.txt`) and says *"credits are not mandatory, so feel free to use it in any way you want"* — a real permission, but not a named licence, and it defers to the itch.io page. Open [the page](https://hydrogene.itch.io/high-quality-16-bit-music), read its licence statement, record it in `MANIFEST.json`. |
| OpenGameArt — Cave Theme, Victory Fanfare | the Ember region loop and the victory sting | OGA licences vary **per submission**. Open each page, record the licence in `MANIFEST.json`, save any licence text here. |
| Quaternius — Ultimate Animated Animals | Kael's four wolf forms, every hound, both giant-wolf bosses, Pip, Biscuit | download from [quaternius.com](https://quaternius.com/packs/ultimateanimatedanimals.html) → save its `License.txt` here as `quaternius-ultimate-animated-animals.txt` |
| Quaternius — Animated Monster Pack | slimes, bats, and the Dragon that is Boreal | download from [quaternius.com](https://quaternius.com) → save as `quaternius-animated-monsters.txt` |

Then add the filename to that pack's `licence` field in `MANIFEST.json` and
re-run the checker.

**Why they are not already done:** this build environment's network policy
refuses `quaternius.com`, `*.itch.io`, `opengameart.org` and `kenney.nl`
(the proxy answers `CONNECT 403`); only GitHub hosts are reachable. The
downloads have to happen from a machine with normal internet, or the hosts
have to be added to the environment's allowlist.

**Why the music sits at the top.** It was assumed to be three OpenGameArt
tracks with HydroGene held back as an unused bonus. Md5-matching every file
in `assets/audio/music` against the packs on disk showed the opposite: eight
tracks are HydroGene, and the Juhani Junkala track credited for a year is not
in the build at all. So the largest single licence exposure in the game is a
pack whose strongest written permission is a friendly sentence in a readme.
The two Quaternius packs are very likely CC0 — but "very likely" is exactly
what this folder exists to stop.

## 2026-09-01 — assets supplied by James, and what is known about each

Sources traced 2026-09-01. Every pack below is also claimed in MANIFEST.json,
which `tools/check-licences.mjs` enforces; this file is the prose version.

- **`assets/chars/monsters/wyrm.glb` — the dragon Boreal wears. SETTLED, WITH
  A CONDITION.** It is bocdagla's *Low Poly Dragon Model 3D*,
  https://bocdagla.itch.io/low-poly-dragon, released under **Creative Commons
  Attribution**: *"You can use this file however you want as long as you give
  credit."* Commercial use is fine; **credit is required**, and this is it —

      Dragon model by bocdagla (https://bocdagla.itch.io/low-poly-dragon)

  Recorded here rather than on the credits screen by James's decision: that
  screen is the kids' ending and runs on the game's no-reading rule, so a line
  of text aimed at adults does not belong on it.

  One caveat kept deliberately: the licence page could not be opened from the
  build machine — every itch.io domain is blocked by its egress proxy — so the
  wording above is quoted from search results, not read first-hand. The
  identification is not in doubt (the model's own glTF asset block carries
  `copyright: "bocdagla"`), but the exact terms are worth one human glance.

- **`assets/loot/treasure/*` — the coins, gems, keys and scroll that became the
  game's currency in v3.80.0. IDENTIFIED, LICENCE STILL UNREAD.** It is
  Binbun's *Treasure* pack, free tier, https://binbun3d.itch.io/treasure.
  Identified by contents rather than metadata (the files carry none): the free
  tier is documented as 15 gems, 8 rings, 14 coins, 9 scrolls and a chest with
  a variation, and the files on disk count 15 / 8 / 14 / 9 / a 3-part chest —
  61 models against the listed "60+". Five of six categories match exactly.

  **OUTSTANDING:** read the licence box on that page. The search result that
  found it had the licence text truncated, and guessing at it would be worse
  than leaving this line here.

- **`assets/gear/{sword_legion,spear_legion,cleaver_orc,staff_bone,shield_tower_iron}.glb`
  — LICENCE UNREAD.** The static weapon props out of the Army, Orc and
  Skeleton character packs. Those downloads shipped no licence files and no
  store page was identified. **OUTSTANDING:** find the source pages.

- **The fourteen CHARACTERS in those same packs — NOT USED, and not a
  licensing decision.** Every one is rigged but ships **zero animation clips**,
  on a Blender Rigify skeleton (`hand.L`, `spine.001..006`) where this game's
  animation library is KayKit (`hand.l`, `spine`, `chest`) — so the clips it
  already owns cannot simply be retargeted onto them. Shipping them would put
  unanimated bodies in the world, which is the exact defect
  `tools/verify-motion.mjs` exists to catch.

- **Jampot 3D Chests (Free) — NOT USED.** It shipped a full royalty-free
  commercial licence, no attribution required, so the licence was never the
  problem: the style was. Measured at 7,000-9,800 triangles with two materials
  and four PBR textures each, against the 232-322 triangles and single flat
  texture of the chests already in the game. It is a realistic baked-PBR set
  and this is a flat-shaded low-poly game.
