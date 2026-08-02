# Combat Spec — Wolf Knight (all shipped regions)

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
  everything around him, the answer to being surrounded.
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
- **FULL = gold act-here pulse. Tap the gauge** (any form; K/special button
  also works in forms without a cooldown special) → **~2.5s ceremony**:
  red vignette + a blood moon rises, ~30% time-slow at the morph, forced
  Dark Wolf, HOWL + bass + 250ms haptic, then a no-damage shockwave that
  staggers + shoves everything near (1.6s stun, 4u).
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

A big shadow wolf (~2.3x player wolves, violet eyes) that is ALIVE in
every phase (v3.16 — playtest: "it just rotates" is banned forever): it
PROWLS a circle around Kael, stalks in, and attacks with its BODY. The
hitbox and every gold ring RIDE THE WOLF — you always hit the wolf,
wherever it stands. Guarded hits clank + "BLOCKED"; every attack it
makes ends in a punish window ON its body (gold ring + chime).

- **Phase 1 — the Prowl:** the wolf circles (walk), then stalks in and
  SWIPES (0.9s on-body telegraph: deep crouch + eyes flare + growl —
  hound language, bigger) → 1.6s recover, EXPOSED. Meanwhile the cage's
  tendrils slam as before: stuck ~1.7s (gold ring = sever), 3 severs
  crack the shell → phase 2. Each sever makes the wolf FLINCH.
- **Phase 2 — the Hunt:** prowls FASTER between POUNCES (crouch 1s +
  red lane → leap → **THE COLLAPSE**: falls over (Death clip, held)
  2.6s, gold ring, thud + slow-mo blip, Pip calls it) — then gets up
  and keeps hunting from where it fell (never teleports home). Brief
  extra exposure pulses mid-prowl. Shadow wave + 2 Shades as before.
- **Phase 3 — the Dark Hunt:** whole-room darkness. The wolf circles
  with GLOWING eyes (the only thing the Knight can see; the Dark Wolf
  sees everything), then a HUGE eye-flare windup → a dash THROUGH where
  you stood → exposed recover. Slams run faster.
- Boss parts cap any single strike at 3 (surge bites hit for 2 — strong,
  never trivializing). Pip re-teaches the loop if the player flounders.
- Dying mid-fight preserves the reached phase (flags.bossProgress, saved).
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
