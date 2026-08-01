# HUD, Menus, Save & Audio — Wolf Knight

> **CHANGELOG (2026-07-31 doc-truth pass):** Controls recap updated to the
> v2.6+ scheme (floating joystick, form button, stable button cluster,
> contextual HUD fading). Save schema updated from v1 to the shipped v2
> shape — js/save.js is authoritative; the rule that matters is
> **additive-forever: old saves must always load**. Menus now also include
> map/mysteries, shop, perks, stickers, and fast travel (js/menus.js).

Choices locked: **named profiles** (each kid their own save), **captions on by default** (toggle),
**music + SFX** (CC0). Design for landscape touch, young kids: big targets, icon-first, minimal
text, thumb-friendly zones.

## In-game HUD (overlay)
- **Hearts** — top-left, large, clear full/empty states. Max grows 5 → 6 after all pups.
- **Pup counter** — top-right: `🐺 x / 3` for the current region.
- **Form badge** — small active-form icon (Knight / Dark Wolf / Fire Wolf) with its tint, near the
  action buttons so kids see what they are.
- **Special cooldown** — a small radial/bar by the special button showing when Blood Moon (or a
  form special) is ready; greyed while cooling down.
- **Caption bar** — bottom-center: shows the current narration line as large high-contrast text.
  **On by default**, toggle in Settings; auto-hides a moment after the line ends.
- **Pause** — top-right corner button.

## Controls overlay (recap — v2.6+)
- **Floating joystick**: appears wherever the thumb lands in the left 40%
  of the screen (dead zone 10%, idle ghost hint at the classic spot).
- **Stable right-hand cluster** (never moves or vanishes, safe-area aware):
  special (corner, dimmed when the form has none) · attack · form button.
  Upper row: spark · shield · jump (revealed as they're taught).
- **Form button**: tap = cycle unlocked forms; hold 300ms = radial picker.
- Right-half taps also attack. Keyboard fallback: WASD + J/K/Shift/Space.
- Only hearts/form/special stay persistent; counters fade in contextually.

## Menus
**Title screen** — logo + warm volcano art. Shows **profiles**; pick one to play, or **New Player**.
Big icon-first buttons: Continue · New Game · Settings.
**Profile create** — typed name entry (on-screen-keyboard friendly) + pick a color/wolf icon. Each
kid gets their own save.
**Pause** — Resume · Settings · Title (back to profile select).
**Settings** — Captions on/off (default ON) · Narration voice on/off (+ slight rate control) ·
**Music volume** slider · **SFX volume** slider · (optional) Big-text toggle. Settings are
per-profile so each kid's prefs stick.
**Gentle respawn (no harsh "Game Over")** — at 0 hearts: soft fade, Pip reassures
("Let's try again, Kael"), respawn at the last checkpoint with full hearts. No lives, no score.
**Region complete** — celebratory screen: Fire Wolf earned, pups `x/3`, then "Onward!" → Luna dream
→ next region. (For the slice, an end-of-slice summary.)

## Save system (localStorage — auto-save, kids never manage it)
Save on: each **checkpoint**, **form unlock**, **pup collected**, **region complete**, and
**settings change**. Show a small "saved ✓" tick at checkpoints. Continue resumes at the last
checkpoint with saved forms / pups / max hearts.

**Keys & schema (v1)** — version the keys; parse in try/catch; if missing/corrupt, start fresh.
```
localStorage["wolfknight:profiles"] = [ {id, name, icon, updatedAt}, ... ]

localStorage["wolfknight:save:<id>"] = {   // v2 (shipped) — js/save.js is authoritative
  profileId, name, region, room, checkpoint: {room,x,z,id},
  maxHearts, potions, formsUnlocked: [...], form,
  pups: { region: [ids] }, shards, xp, level,
  moonGauge,                               // v3.11: Blood Moon Surge charge (0..1)
  perks: { sword, cooldown, ... }, stickers: { id: count },
  gear: { weapon, shield }, spoken: { lineId: true },
  flags: { bossDefeated, bossProgress, shortcutOpen, wardenDefeated, burned,
           cracked, plates, chests, keys, world, mysteries },
  settings: { captions, voice, musicVol, sfxVol, voiceRate, brave },
  updatedAt
}
```
**Engineering law:** additive-forever. New features add fields with safe
defaults on load; existing kid profiles must NEVER fail to load. If a
breaking change is truly unavoidable, ship a migration in save.js.

## Audio (all CC0) — sources + moments
**SFX (Kenney, CC0):** RPG Audio (https://kenney.nl/assets/rpg-audio), Impact Sounds
(https://kenney.nl/assets/impact-sounds), UI Audio (https://kenney.nl/assets/ui-audio).
**Music (CC0):** OpenGameArt filtered to CC0 (fantasy/ambient loops) or Kenney's audio category
(https://kenney.nl/assets/category:Audio). Pick: a calm mysterious **Ember Hollow** loop, a tense
**boss** loop, a warm **victory** sting.
**SFX moments:** sword swing/hit, enemy puff, lava sizzle (hurt), geyser, footstep, form-switch
whoosh, Blood Moon impact, pup-found chime, checkpoint tick, UI click/toggle.
- Wire volume to the Settings sliders; respect mute. **Vendor audio files locally** and cache them
  in the service worker so the PWA still plays offline. List tracks/SFX in CREDITS.md.
