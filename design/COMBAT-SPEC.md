# Combat Spec — Wolf Knight (all shipped regions)

> **CHANGELOG (2026-07-31 doc-truth pass):** Rewritten to match the shipped
> game. The original file described the v1 slice (3 enemies, code-built
> blob boss, Fire Wolf granted after the boss, "no knockback"). All of that
> is superseded: real-model enemies only, the dragon-bodied Shadowgrip, the
> Fire Wolf granted mid-dungeon at the Kiln shrine (user-approved), and
> body knockback/separation. The binding NUMBERS live in GAME-CONTRACT.md;
> this file is the behavior spec.

Design rules: young kids, so **forgiving and readable**. Combat grammar is
law (GAME-CONTRACT.md): RED marks danger, GOLD marks "act here"; every
attack telegraphs ≥0.8s (bosses ≥0.9s); every hit shows a damage number or
BLOCKED; bosses show a health bar. Pip coaches telegraphs aloud.

## Kael's tools (current)

- **Knight** — sword slash + thrust combo (2nd tap within 0.7s = longer,
  narrower stab), throwing spark (auto-aim + homing), shield (hold =
  blunted damage; fresh raise ≤0.3s = perfect parry: negates + stuns 2.2s),
  jump/double-jump (dodges groundAttack sources).
- **Dark Wolf** — from minute one. Faster bite, see-in-the-dark lamp,
  **Blood Moon** special (currently a 24s-cooldown crashing-moon AoE).
- **Fire Wolf** — earned at the Kiln shrine MID-dungeon (region 1).
  Ground-slam: AoE damage + ignites braziers + burns scorched obstacles.
- **Earth Wolf** — earned in Stoneroot (region 2). Stone-stomp: AoE + stun
  + cracks rock piles. Hits harder, runs a touch slower.
- All wolf forms wear elemental auras; soft lock-on + input buffering +
  generous hitboxes apply to every melee (CONFIG).

**APPROVED, NOT YET BUILT (see fix plan):** form identity pass — Knight =
safe/shielded tool, Dark Wolf = fast fragile hunter (+speed, +damage
taken, lunge, wolf senses); Blood Moon converts from cooldown to an
earned **Moon Gauge surge**. When built, this section gets rewritten.

## Enemy families (all REAL models — code-built creatures are banned)

| Enemy | Model | Signature behavior | Region |
|---|---|---|---|
| **Shade** | shadow-tinted slime | slow lurching skips toward Kael; contact damage | Ember |
| **Ember Moth** | tinted bat | bobs, pauses+glows ~0.8s, then DOUBLE-dives | Ember |
| **Shadow Hound** | black-tinted wolf | crouch ~1s + streak telegraph, straight charge, slow recover | Ember (elite) |
| **Slime** | slime | splits into 2 minis on death | Stoneroot |
| **Cave Bat** | bat | dive then crash-lands grounded (vulnerable) | Stoneroot |
| **Skeleton Minion / Rogue** | skeletons | minion swarms slowly; rogue circles + lunges | Stoneroot |
| **Bone Warden** | armored skeleton | mini-boss: tower shield front-blocks (clank + BLOCKED); flank or parry-stun to hurt | Stoneroot |

Deaths puff into smoke (not gory). Never more than 3 simultaneous aggro
enemies near a kid. Enemies have solid bodies (no walking through each
other or Kael); a raised shield physically bumps basic enemies back.

## Boss 1 — The Shadowgrip (Heart of the Hollow)

Dragon model, shadow-tinted, hovering over the caged ember (Cinder) in a
dark icosahedral shell. Core is ALWAYS targetable but only takes damage
when EXPOSED (gold strike ring + chime); guarded hits clank + "BLOCKED".

- **Phase loop:** tendrils rise and slam telegraphed spots (red rings,
  ≥0.9s) → a slammed tendril STICKS ~2.8s (gold ring = sever it, 1 hit)
  → severing exposes the core (gold strike ring, cage cracks per sever).
- Later phases: faster slams, shadow wave sweeps (always a safe arc),
  2 Shades max as adds, brief darkness beat (Dark Wolf sight payoff).
- Blood Moon counts as 3 sword hits on boss parts (cap), so the ultimate
  is great but never trivializes. Pip re-teaches the loop if the player
  flounders ~22s.
- Defeat → Cinder freed (story climax; the FORM was already granted at the
  shrine) → region heals (calm music + revival flags) → shortcut opens.

## Boss 2 — Bone Warden (Warden's Crypt)

Shield-wall mini-boss: unhittable from the front (clank/BLOCKED feedback),
punish by flanking, jumping behind, or parry-stunning his swing. Teaches
positioning as Stoneroot's combat lesson.

## Forgiveness specifics

- Death = respawn at checkpoint, full hearts. Cozy mode (default) halves
  damage (min ½ heart); quiet rubber-band softens further after 3 deaths
  at one checkpoint. i-frames ~1s. Lava: 1 heart + bounce-back to the
  last safe footing (a deliberate jump still clears gaps).
- Boss deaths currently reset the whole fight — **flagged as a flaw**; the
  fix plan makes respawn preserve the reached phase.
- Every puzzle self-resets (anti-soft-lock). Room rebuild on entry.
