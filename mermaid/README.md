# Mermaid Reef

A gentle underwater side-scroller for a 5-year-old: one axis of control, no
fail states, no text, works fully offline as a home-screen PWA.

Twelve levels across the pack's eight scenes, each denser and faster than
the last (172 → 292 px/s). The difficulty design follows what good kids'
games do: one new element per level, difficulty from navigation and density
rather than punishment (an "ouch" costs a red flash and a little bump —
nothing else), every level completable even with no input, and the same
reliable end-of-level ritual (chest → sparkles → rescued fish friend).
Finishing a level advances to the next; after level 12 it wraps around.
Rescued friends and all menu choices persist on the device.

| # | scene | what's new |
|---|---|---|
| 1 | shipwreck reef | learn to swim |
| 2 | coral reef | magnet, first obstacles |
| 3 | sunken ruins | spike gates, lionfish |
| 4 | rocky canyon | **trapped chest — shark chase** |
| 5 | gem cave | roaming sharks, tunnels |
| 6 | kelp forest | dark and dense |
| 7 | pebble cove | four gates, two sharks |
| 8 | dragon graveyard | **trapped chest — shark chase** |
| 9–11 | coral / canyon / gems | a harder second lap |
| 12 | dragon graveyard | **finale — trapped chest, then the crown** |

The menu is the customise screen: tap one of the three mermaids to play as
her, tap a shimmer pearl for a tint, tap play. Icon-only, no text. In-browser
play goes fullscreen on the first tap (Android); on iOS, fullscreen comes
from Add to Home Screen — Safari has no fullscreen API.

Dev helpers: `?level=5` forces a level (1–12), `?t0=7000` jumps into the
scroll, `?scheme=a|b|c` forces a control scheme.

To wipe progress and start from level 1, clear the site data for the page
(or run `localStorage.clear()` in a desktop console).

## Running it

```bash
npm install
npm run dev        # local dev server
npm run build      # static build -> dist/ (committed, drop on any static host)
```

`dist/` is self-contained and relative-pathed — serve it from any folder on
any static host over **HTTPS** (service workers require it; GitHub Pages is
fine). `npm run assets` / `npm run audio` regenerate `public/assets/` from
`assets-source/` (gitignored, ~270 MB Craftpix source art) — the outputs are
committed, so a fresh clone builds without the source art.

## Install on her phone

1. Open the hosted URL in Safari (iOS) or Chrome (Android).
2. Share → **Add to Home Screen**.
3. Open it once from the icon while online (precaches everything, ~8 MB).
4. Verify for real: aeroplane mode → cold-launch from the icon → play through.

**iOS silent switch:** if the phone's physical mute switch is on, iOS mutes
all web audio and a web app cannot detect or override it. Since audio is the
main feedback channel, check the switch before handing her the phone.

## Control schemes (the thing to test on her actual phone)

Three are built; which one she handles better is an empirical question:

- **Scheme A — hold to rise:** touch anywhere, she swims up; release, she
  sinks gently.
- **Scheme B — relative drag:** wherever her thumb lands is the zero point;
  drag up/down from there.
- **Scheme C — finger-follow** (default): she swims to the finger's height,
  offset upward so the thumb never covers her. Lifting holds height a
  moment, then she drifts down slowly.

Toggle while testing: **4 quick taps in the top-left corner** (or `C` on a
keyboard). Dots flash: one = A, two = B, three = C. The choice persists. You
can also force it via `?scheme=a` / `?scheme=b` / `?scheme=c`.

## Magic

Each mermaid has her own power, cast by tapping with the **second thumb**
(Space on desktop), with a ~7 s recharge shown as a golden star in the HUD:
redhead calls every nearby pearl to her, the middle mermaid conjures a
shield bubble, the third does a starlight dash (2 s surge, un-ouchable).
Quick pearl streaks rise in pitch. Finishing all seven levels earns a crown
she wears forever after.

## Enemies, helpers and the trapped chest

Everything ouchy costs the same: Hurt animation, red flash, a small backwards
bump, then two seconds of grace. Never a life, never a fail.

- **Ouchy:** sea urchins (also stacked into spike gates and tunnels),
  patrolling crabs, stinging jellyfish, lionfish that lean toward her, and
  sharks that genuinely chase — slower than she can swim, and they lose
  interest after about nine seconds.
- **Obstacles:** rocks, spires, masts, anchors, barrels and weed, standing on
  the floor or hanging from the ceiling, to weave around.
- **Helpers:** dolphins shadow roughly half the sharks and charge in to drive
  one off; turtles drift about and hand out a shield plus a pearl-pull when
  she swims into one.
- **Powerups:** magnet, shield, boost (speed surge) and heart (every ouchy
  creature politely swims out of her way for seven seconds).
- **Levels 4, 8 and 12 hide a shark in the chest.** It bursts out, drives her
  back the way she came, a rockfall crashes down and sees it off, and the
  real chest — with the fish friend in it — waits beyond the original start.

**Art note:** the pack has no dolphin or turtle, so those two render as
recoloured, upscaled friendly fish. Swapping in real sprites is a one-line
change in `src/entities/Helper.ts` (the `LOOK` table).

## Ouch and friends

- Sea urchins drift mid-water and two slow crabs patrol the sand. Touching
  one flashes her red for a second with an "ouch" sound — no health, no
  loss, no fail state; the level carries on.
- The chest holds a trapped fish friend: each finished run rescues one, and
  rescued friends (persisted on the device) swim in a chain behind her on
  every later run, up to six.

Dev helpers: `?test=controls` is the plain-rectangle control test scene;
`?t0=7000` starts partway through the level (the chest arrives at 7800).

## What's where

- `scripts/build-assets.ts` — normalises the Craftpix pack (renames the three
  Cyrillic-С chest files, kebab-case), composites every mermaid animation
  onto a centroid-aligned common canvas so animation swaps never jump, packs
  atlases, verifies background layers tile before relying on it, generates
  the icon set.
- `scripts/build-audio.ts` — audio pipeline. Drop a recording at
  `audio-source/<slot>.mp3` (slots: `ambient`, `tap`, `pearl`, `coin`, `joy`,
  `chest`, `complete`) and `npm run audio` decodes, monos, trims, normalises
  and (for ambient) loop-crossfades it to WAV; slots without a recording fall
  back to synthesized bell/harp sounds. Slots: `ambient`, `tap`, `pearl`,
  `coin`, `joy`, `chest`, `complete`, `ouch`, `power`, `pop`, `danger`,
  `rumble`, plus an optional `music` loop — music has **no** synthesized
  fallback, so the game simply plays no music until a loop is supplied.
  Good CC0 / no-attribution sources for replacements:
  [Pixabay music](https://pixabay.com/music/search/underwater/),
  [Pixabay SFX](https://pixabay.com/sound-effects/search/underwater/),
  [Kenney audio](https://kenney.nl/assets/category:Audio),
  [FreePD](https://freepd.com/), and
  [Freesound filtered to CC0](https://freesound.org/search/?q=underwater&f=license:%22Creative+Commons+0%22).
  Seven slots use recordings,
  all from Pixabay: underwater ambience #6201, water drop #85731 and chime
  #74910 (freesound_community — chime unused, kept as a spare), harp
  glissando #103885 (Serge Quadrado), fairy sparkle #451415 (HumorDome),
  sparkle #355937 (KoiRoylers), magic twinkle #244951 (UNIVERSFIELD),
  success #340660 (Meldix).
- `src/level.ts` — level 1 hardcoded by design; no level format yet.
- Portrait handling: pure-CSS overlay (`#rotate` in `index.html`) plus a
  `matchMedia` pause/resume in `src/main.ts`. No Screen Orientation API.

## Still needs a real device

Headless Chromium verified: touch controls, collection, ending, replay,
portrait pause/resume, and offline boot with zero network requests. What it
cannot verify: 60 fps on a mid-range phone, iOS Safari standalone quirks,
safe-area insets on a notched phone, audio unlock timing, and — most
importantly — which control scheme a 5-year-old actually gets on with.
