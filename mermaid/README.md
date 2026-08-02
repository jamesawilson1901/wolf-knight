# Mermaid Reef — Level 1 vertical slice

A gentle underwater side-scroller for a 5-year-old: one axis of control, no
fail states, no enemies, no text, works fully offline as a home-screen PWA.

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
3. Open it once from the icon while online (precaches everything, ~4 MB).
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
  back to synthesized bell/harp sounds. All seven slots now use recordings,
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
