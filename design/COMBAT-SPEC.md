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
- **v3.195 (2026-09-27) — the combat package.** Dad: wolves were puzzle
  keys, not fighters ("it completely negates using the wolves in combat if
  you get good weapons"), gear and level-ups "do nothing", and the ten-face
  wheel was "very messy". Now:
  - **Gear is every form's.** A bite = the equipped weapon's dmg × the
    wolf's own multiplier, in the wolf's element. Armour soak, GUARD chance
    and weight apply in every form; in a wolf form (no raised shield) the
    shield's quality adds to the GUARD chance instead.
  - **A raised shield BLOCKS an ordinary hit** (≤1 heart) outright; only a
    heavy hit pushes the shield's `blunt` through.
  - **Weakness is ×2 plus a short stagger.** **Elemental shells** (js/shells.js)
    make some enemies need the matching wolf: steel CLANGS for 0.3×, the
    right element CRACKS it (2 hits, or 1 special / swap-in strike).
  - **Swap-in strike:** a mid-fight switch lands the new form with a free
    burst in its element (weapon power, r2.4, 0.5s daze, 4s cooldown) — on
    top of the spectacle above, so the switch is the fun move.
  - **The pack of three:** the form button cycles the Knight, the Dark Wolf
    and three chosen wolves (Pack tab, at the Den / a campfire / a rest
    flame). Never more than five faces on the ring.

## The Moon Gauge & Blood Moon Surge (CONFIG.MOON)

- A crescent HUD gauge fills from landed hits, hits TAKEN and time spent
  near enemies — pressure feeds the moon (hidden assist; pots don't
  count). No decay; survives switches, rooms and saves (state.moonGauge).
  'Quicker Moon' perk = +25%/rank fill.
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
| **Skeleton Shieldling** | minion + tower shield | advances **visibly** shield-up (front damage NULL); the shield DROPS on its own swing, when stunned, or you slip behind (slow 2 rad/s turn) | Stoneroot |
| **Bone Warden** | armored skeleton | mini-boss: tower shield front-blocks (clank + BLOCKED); flank or parry-stun to hurt | Stoneroot |
| **Cinder Shade** ⭐ | Shade, kiln-baked tint, 1.3x | RESISTS fire (0.4x + grey callout); moon shreds it | Ember (Kiln) |
| **Elder Hound** ⭐ | Hound, gold eyes, 1.3x | pack leader: hp 6, harder charge, guaranteed ember | Ember (r2b) |
| **Bone Brute** ⭐ | Minion, darkened, 1.4x | a slow walking wall: hp 5, heavier contact | Stoneroot (Quarry) |
| **Thorn Hound** ⭐ | Wolf, mossy green | hound grammar; FEARS FIRE (burn the thorns) | Wild Woods |
| **Elder Thorn Hound** ⭐ | Thorn Hound, 1.3x, gold eyes | hp 6, harder charge, guaranteed drop | Wild Woods |
| **Bramble Blob** ⭐ | Slime, deep green | splits; fears fire | Wild Woods |
| **Wisp Moth** ⭐ | Bat, pale-green glow | dive pattern; fears fire | Wild Woods |

⭐ = VARIANTS (asset-multiplication law): tint + scale + stat + element
swaps on models we already ship — the registry lives in enemies.js. This
table has fallen behind what's actually shipped (Frostpeak/Stormreach/
Shadow Court/Sunken Vale families, plus the 2026-08-23 roster expansion —
15 new AI behaviors, 32 new enemy ids across all seven regions) —
`docs/wolf-knight-combat-context.md` §1.4/§1.4a and finding 14 are the
current ground truth; re-sync this table next time it's touched for an
unrelated reason (§12's "keep it lean" applies here too).

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

## Boss 3 — Sylva, Thornbound (Sylva's Glade, Wild Woods)

The giant-wolf duel grammar in GREEN (the boss class is a skin system now):
the forest's own guardian, wrapped and maddened by Grimm's thorns. 24 hp,
~8% quicker than the Shadowgrip, same honest reads — crouch+flare = charge
(dodge; ends collapsed under gold), snarl+coil = swipe (shield/parry; a
perfect parry staggers her). Below half health (P7 unique-move law,
`skin.snares`), she gains a THIRD tell 50% of the time instead of the
swipe: she plants down, eyes flare green, thorns visibly grow from the
ground at her own feet (~1s, on-body, no ground decal, same reading time
as her charge crouch) — then a single ring check at 2.6u radius, once,
never a grinder, exactly like the charge. Her wounds persist across deaths
(flags.sylvaHp). Freed, she grants the VERDANT WOLF: vine-lash special
(cuts brambles — the e2 promise pays out), rooting thorn bolt, leaf aura.

## Boss 2 — Bone Warden (Warden's Crypt)

Shield-wall mini-boss: unhittable from the front (clank/BLOCKED feedback),
punish by flanking, jumping behind, or parry-stunning his swing. Teaches
positioning as Stoneroot's combat lesson. Since v3.198 he also casts grave
hands and raises a fire-cracked bubble from half health (see "Boss magic").
The same class carries the Rootbound Wight, Rime Warden and Ash Warden,
each with its own magic (`opts.magic`, `WARDEN_MAGIC` in js/enemies.js).

## Boss magic (v3.198, 2026-10-03)

Dad: "Boss fights all feel too similar." They did. Every duel boss drew from
the same swipe, charge and pounce with the same answers, so a child who
learned the first one had learned all seven. Each fight now carries magic
of its own, chosen by dad from an options page. The shared kit is
`js/bossmagic.js`. Every move is a row in `js/attacks.js`, and
`tools/verify-boss-magic.mjs` holds each one to the rules below in its own
arena.

**The rules every piece keeps.**
- **Tells.** Every tell is at least 1.0s: the caster's pose *and* a floor
  mark. Floor marks are allowed under the boss-lane exception to LAW 4.
- **Colours.** Danger is red or purple, never gold (LAW 5).
- **Answers.** Every move has a visible answer.
- **Shoves.** A shove never puts Kael in lava, a pit or deep water. Each
  step is checked and it stops short.
- **The Binding.**
  - It lands only if its orb touches Kael.
  - It lasts 6s, or 3s in Gentle.
  - The bound wolf still lands its blows at ×0.4 inside an open window,
    never zero.
  - It is never saved: `state.curseLock` is not in `js/save.js`, and every
  room build clears it.

| Boss | Its magic | The answer |
|---|---|---|
| The Shadowgrip (le) | **Shadow orbs**: three slow purple orbs in a fan, from range | Step off the line, or **shield** them. A shielded orb counts as a block, so it fells him (`open.by: block`). |
| Bone Warden (vz) | **Grave hands**: he taunts with his shield *down*, and three red circles fill round Kael before bone bursts up. **Cracked bubble** from half health. | Step off the circles or jump. **Fire** shatters the bubble and leaves him winded. |
| Sylva (tgl) | **The vine**: a tether creeps to Kael for the whole tell | **Jump**: in the air it snaps. On the ground it drags him in. |
| Boreal (f5) | **Ice-shard rain**: three red circles while she wheels, ice seen falling for the last half second. Never in the last 1.5s before a dive. | Step off. A jump does not help with falling ice. |
| Aria (scr) | **Thunderclap**: a purple knock ring rolls out from her | **Jump** it, or be thrown back toward the gales. |
| Meri (ddp) | **Water bubble**: up when her half-health flinch ends, back 12s after it bursts | Every blow bounces except **fire**. Fire bursts it and downs her for ×1.3 her usual window. |
| Shadow-Grimm (xth) | **Echoes**: the Shadowgrip's orbs, then Boreal's ice and the Warden's hands, then Aria's thunder, one set per third of his health. **The Binding** from half health: one slow curse orb. | Step off or shield the orb. If it lands he holds Kael in the wolf he is armoured against (steel or moon, or below a third the last element), the wolf buttons lock and the badge goes grey and chained. When it breaks, the **first switch** skips the swap-in cooldown and hits twice as hard. |

| Mini-boss | Its magic | The answer |
|---|---|---|
| Cinder Drake (lb) | **Flame bubble** from half health | A **shield-crash** out of its dive. Nothing else gets through. |
| Rootbound Wight (vr2) | **Root snare**: three red circles | Step off. If caught, Kael is held, with no damage, until he **jumps**. |
| Rime Warden (f1d) | **Ice bubble** from half health | **Fire** melts it and leaves her winded. |
| Ash Warden (s1d) | Her **spin leaves fire**: a red band, then 3s of flame round where she stood | Stay out, get **inside** the band beside her, or jump across. |
| Bone Sage (d1d) | **Orb volley** every third cast (every cast while bubbled). **Bubble** from half health. | **Shield** an orb and it flies home. Its own orb is the only thing that bursts the bubble and stuns it. Every one of its casts now tells at 1.0s, the boss floor. |
| Court Chancellor (xc2) | **Coin shockwave**: a purple knock ring | **Jump** it. |

The Village guardians were left as they were; none were picked.

## Forgiveness specifics

- Death = respawn at checkpoint, full hearts. Cozy mode (default) halves
  damage (min ½ heart); quiet rubber-band softens further after 3 deaths
  at one checkpoint. i-frames ~1s. Lava: 1 heart + bounce-back to the
  last safe footing (a deliberate jump still clears gaps).
- Boss respawn preserves the reached phase (shipped v3.10).
- Every puzzle self-resets (anti-soft-lock). Room rebuild on entry.
