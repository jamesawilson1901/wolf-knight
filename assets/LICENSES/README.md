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

These ship in the build **now** and are not cleared:

| Pack | What it is in the game | How to clear it |
|---|---|---|
| Quaternius — Ultimate Animated Animals | Kael's four wolf forms, every hound, both giant-wolf bosses, Pip, Biscuit | download from [quaternius.com](https://quaternius.com/packs/ultimateanimatedanimals.html) → save its `License.txt` here as `quaternius-ultimate-animated-animals.txt` |
| Quaternius — Animated Monster Pack | Slimes, bats, and the Dragon that is Boreal | download from [quaternius.com](https://quaternius.com) → save as `quaternius-animated-monsters.txt` |
| Kenney — Holiday Kit | Frostpeak's snow, firs and rocks | download from [kenney.nl](https://kenney.nl/assets/holiday-kit) → save as `kenney-holiday-kit.txt` |
| OpenGameArt music (3 tracks) | Ember theme, boss theme, victory sting | OGA licences vary **per track** — open each submission page, record the licence in `MANIFEST.json`, and save any licence text here |

Then add the filename to that pack's `licence` field in `MANIFEST.json` and
re-run the checker.

**Why they are not already done:** this build environment's network policy
refuses `quaternius.com`, `*.itch.io`, `opengameart.org` and `kenney.nl`
(the proxy answers `CONNECT 403`); only GitHub hosts are reachable. The
downloads have to happen from a machine with normal internet, or the hosts
have to be added to the environment's allowlist.

The OpenGameArt row is the one that could actually bite: OGA hosts CC0,
CC-BY and GPL side by side, and a CC-BY track needs visible credit in the
game while a GPL track would not be usable at all. The other three are very
likely CC0 — but "very likely" is exactly what this folder exists to stop.
