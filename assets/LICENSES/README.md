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

These came in as a batch of downloads rather than from a pack page with a
licence file next to it, so this records exactly what IS known. Two of them
need a source link from James before this repo can claim a licence for them;
the game does not depend on that being resolved, and any of them can be
removed with one `git rm` and a cache bump.

- **Treasure pack** (`assets/loot/treasure/*`) — coins, gems, keys, a scroll.
  Shipped as a folder named "Free" with **no licence file and no named
  author**. Used as the game's currency and chest loot. ACTION: James to
  confirm the source page so the terms can be recorded here.
- **`assets/chars/monsters/wyrm.glb`** — the dragon. The glTF asset block
  carries `"copyright": "bocdagla"`, so the author is at least named, but the
  download had **no licence file**. ACTION: James to confirm the source page
  and whether attribution is required; if it is, the credit goes here and in
  the game's credits.
- **Jampot 3D Chests (Free)** — shipped a full royalty-free commercial
  licence, no attribution required. NOT USED: measured at 7,000-9,800
  triangles with 2 materials and 4 PBR textures each, against the 232-322
  triangles and single flat texture of the chests already in the game. It is
  a realistic baked-PBR set and this is a flat-shaded low-poly game; next to
  `wolf.gltf` they would read as a different product. Its licence also
  restricts redistribution of the models "on their own", which a public
  repository sits awkwardly against.
- **Army / Orc / Skeletons / Wizard character packs** — NOT USED as
  characters. Every one of the fourteen is rigged but ships **zero animation
  clips**, and their rigs are Blender Rigify (`hand.L`, `spine.001..006`)
  where this game's animation library is KayKit (`hand.l`, `spine`, `chest`),
  so the existing clips cannot simply be retargeted onto them. Shipping them
  would put unanimated bodies in the world — the exact defect
  `tools/verify-motion.mjs` exists to catch. Their static weapon props are
  usable and are considered separately.
