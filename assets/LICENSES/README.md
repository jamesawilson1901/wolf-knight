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
