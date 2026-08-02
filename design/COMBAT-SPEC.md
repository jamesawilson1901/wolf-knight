# Combat Spec — Wolf Knight (all shipped regions)

> **CHANGELOG (2026-08-02, v3.18):** The Shadowgrip is REWRITTEN as a pure
> wolf duel (no tendrils/phases — dad's law: bosses fight like their
> family, bigger). The Blood Moon now CRASHES down on the nearest enemy
> and belongs to the Dark Wolf only. The Knight's whirlwind uses the true
> 0.67s spin clip (the old 2.4s clip never visibly turned). Boulders push
> in clean cardinal steps and snap onto plates. Stoneroot: one puzzle
> room (Deep Hall, lit), Echo Chasm teleports and all fake machinery gone.
> **CHANGELOG (2026-08-01, v3.11):** Form identity + Moon Gauge Surge are
> BUILT — the "approved, not yet built" section below is now the as-built
> spec. The Dark Wolf is the fast fragile hunter (lunge, senses, +30%
> damage taken); the shield is Knight-only; Blood Moon is an EARNED
> gauge surge, not a cooldown. Boss notes refreshed (wolf body, phase-
> preserving respawn — both shipped earlier).
> **CHANGELOG (2026-07-31 doc-truth pass):** Rewritten to match the shipped
> game. The original file described the v1 slice (3 enemies, code-built
> blob boss, Fire Wolf granted after the boss, "no knockback"). All of that
> is superseded: real-model enemies only, the Shadowgrip, the
> Fire Wolf granted mid-dungeon at the Kiln shrine (user-approved), and
> body knockback/separation. The binding NUMBERS live in GAME-CONTRACT.md;
> this file is the behavior spec.

Design rules: young kids, so **forgiving and readable**. Combat grammar is
law (GAME-CONTRACT.md): RED marks danger, GOLD marks "act here"; every
attack telegraphs ≥0.8s (bosses ≥0.9s); every hit shows a damage number or
BLOCKED; bosses show a health bar. Pip coaches telegraphs aloud.

## Kael's tools (current)

Forms are distinct TOOLS, not skins (FORM_DEFS is the data sheet; all
identity dials in CONFIG.FORMS):

- **Knight — the safe tool.** Sword slash + thrust combo (2nd tap within
  0.7s = longer, narrower stab), throwing spark (auto-aim + homing),
  **the only form with the shield** (hold = blunted damage; fresh raise
  ≤0.3s = perfect parry: negates + stuns 2.2s), jump/double-jump.
  Special: **WHIRLWIND** (6s cd) — a full-circle spin that strikes
  everything around him, the answer to being surrounded. (v3.18: uses
  the 0.67s `Melee_2H_Attack_Spinning` clip — a true 360° body spin.)
- **Dark Wolf — the fast fragile hunter.** From minute one. 6.7u/s (knight
  4.6), 1.35x turn rate, **+30% damage taken** (applied before kid-mode
  softening, so Gentle still protects). Quick bite chain (0.34s lock) with
  a small STEP-IN each snap; **LUNGE** = tap attack while the stick is
  pushed → ~2.5u dash-bite with 150ms dodge frames (1.1s cooldown, free
  while surging). **Wolf senses**: hidden things (unburned cubbies,
  cracked rock, unopened chests) shimmer moonlight nearby. See-in-the-dark
  lamp. No cooldown special — its Blood Moon is EARNED (below).
- **Fire Wolf** — earned at the Kiln shrine MID-dungeon (region 1).
  Ground-slam: AoE damage + ignites braziers + burns scorched obstacles.
  Fire-breath cone as its throw. Keeps legacy stats for now.
- **Earth Wolf** — earned in Stoneroot (region 2). Stone-stomp: AoE + stun
  + cracks rock piles. Hits harder, runs a touch slower. Legacy stats.
- All wolf forms wear elemental auras; soft lock-on + input buffering +
  generous hitboxes apply to every melee (CONFIG). Dodge roll (shield-tap
  while moving) works in EVERY form; standing shield is Knight-only.
- A switch requested mid-attack QUEUES and lands the instant the swing
  ends. Every ordinary switch is a small spectacle (CONFIG.SWITCH_FX):
  120ms self-hitstop, form-colored burst, adjacent enemies nudged (no
  damage), 4% camera punch, per-form audio sting, 400ms morph i-frames.

## The Moon Gauge & Blood Moon Surge (CONFIG.MOON)

- A crescent HUD gauge fills from landed hits, hits TAKEN and time spent
  near enemies — pressure feeds the moon (hidden assist; pots don't
  count). No decay; survives switches, rooms and saves (state.moonGauge).
  'Quicker Moon' perk = +25%/rank fill; Moon Shard powerup fills it whole.
- **The Blood Moon belongs to the DARK WOLF (v3.18):** the gauge fills in
  every form, but the moon button, the "moon is full" nags and the
  trigger only exist while wearing the Dark Wolf.
- **FULL = gold act-here pulse. Tap the gauge** → **~2.5s ceremony**:
  red vignette + a blood moon rises, ~30% time-slow at the morph, HOWL +
  bass + 250ms haptic, a no-damage shockwave that staggers + shoves
  everything near (1.6s stun, 4u) — **then THE CRASH (v3.18):** the risen
  moon DIVES out of the sky and slams into the nearest enemy (2 moon
  damage in a 2.4u blast + 1.4s stun, red impact ring, hit-stop).
- **~10s SURGE:** locked into a 1.25x-scale Dark Wolf, red aura/trail,
  every hit lands one juice tier heavier (juice.weightBoost), bite damage
  x2, bites stagger, lunge is free, regen ½ heart/s, gauge drains as the
  timer, warning flicker at 2s, then an exhale revert to the prior form.
- Unavailable during scripted beats/transitions (main guards the trigger).
  Death ends it quietly, no refund. Surge start/end fire player events.

## Enemy families (all REAL models — code-built creatures are banned)

| Enemy | Model | Signature behavior | Region |
|---|---|---|---|
| **Shade** | shadow-tinted slime | slow lurching skips toward Kael; contact damage | Ember |
| **Ember Moth** | tinted bat | bobs, pauses+glows ~0.8s, then DOUBLE-dives | Ember |
| **Shadow Hound** | black-tinted wolf | crouch ~1s + streak telegraph, straight charge, slow recover | Ember (elite) |
| **Slime** | slime | splits into 2 minis on death | Stoneroot |
| **Cave Bat** | bat | dive then crash-lands grounded (vulnerable) | Stoneroot |
| **Skeleton Minion / Rogue** | skeletons | minion swarms slowly; rogue circles + lunges | Stoneroot |
| **Skeleton Shieldling** | minion + tower shield | advances shield-up (front damage NULL); opens on its own swing, from behind (slow 2 rad/s turn), or stunned | Stoneroot |
| **Bone Warden** | armored skeleton | mini-boss: tower shield front-blocks (clank + BLOCKED); flank or parry-stun to hurt | Stoneroot |
| **Cinder Shade** ⭐ | Shade, kiln-baked tint, 1.3x | RESISTS fire (0.4x + grey callout); moon shreds it | Ember (Kiln) |
| **Elder Hound** ⭐ | Hound, gold eyes, 1.3x | pack leader: hp 6, harder charge, guaranteed ember | Ember (r2b) |
| **Bone Brute** ⭐ | Minion, darkened, 1.4x | a slow walking wall: hp 5, heavier contact | Stoneroot (Mill) |

⭐ = VARIANTS (asset-multiplication law): tint + scale + stat + element
swaps on models we already ship — the registry lives in enemies.js.

Deaths puff into smoke (not gory). Never more than 3 simultaneous aggro
enemies near a kid. Enemies have solid bodies (no walking through each
other or Kael); a raised shield physically bumps basic enemies back.

## Boss 1 — The Shadowgrip (Heart of the Hollow)

v3.18 (dad's law): **a giant shadow hound, nothing else.** No tendrils,
no waves, no phases, no room-darkness — it fights EXACTLY like the
little shadow hounds the kids already read, just bigger (~2.3x), much
tougher (20 hp) and harder-hitting (1.5 hearts). Always hittable —
every swing counts (single strikes cap at 3). The hitbox and the gold
ring RIDE THE WOLF.

- **The duel loop:** it PROWLS a circle (walk) → then either
  **CHARGES** — 1.0s on-body telegraph (deep crouch, eyes FLARE, claws
  scrape dust — hound language, boss-sized), then a straight run through
  where you stood. Answer: dodge/roll aside. Every charge ends in **THE
  COLLAPSE** — it falls over (Death clip, held) 2.6s under a pulsing
  gold ring: the big free-hits window; or
  **SWIPES** — when close: 0.9s snarl + coil windup, then one huge paw
  arc. Answer: shield it (blunted), or perfect-parry to STAGGER the
  wolf for 2.2s, or jump it.
- **At half health** it HOWLS and hunts harder (faster prowl, shorter
  gaps, brighter eyes) — a readable midpoint, not a new ruleset.
- Its wounds PERSIST across deaths (flags.bossHp, saved): a kid who got
  it to half never faces a full-health wolf again. (Legacy saves that
  reached old "phase 2/3" resume at 60% hp.)
- Cinder's caged light sits at the arena heart; the smothering shadow
  shell visibly THINS as the wolf weakens — the room shows the score.
- Defeat is DRAMATIC (staggered shockwaves, smoke dissolve, howl) →
  Cinder freed → the Hollow heals live around the player → shortcut opens.

## Boss 2 — Bone Warden (Warden's Crypt)

Shield-wall mini-boss: unhittable from the front (clank/BLOCKED feedback),
punish by flanking, jumping behind, or parry-stunning his swing. Teaches
positioning as Stoneroot's combat lesson.

## Forgiveness specifics

- Death = respawn at checkpoint, full hearts. Cozy mode (default) halves
  damage (min ½ heart); quiet rubber-band softens further after 3 deaths
  at one checkpoint. i-frames ~1s. Lava: 1 heart + bounce-back to the
  last safe footing (a deliberate jump still clears gaps).
- Boss respawn preserves the reached phase (shipped v3.10).
- Every puzzle self-resets (anti-soft-lock). Room rebuild on entry.
