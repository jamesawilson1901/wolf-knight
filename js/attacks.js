// THE ATTACK CLOCK — every enemy attack's timing, in one table.
//
// WHY THIS FILE EXISTS. design/COMBAT-SPEC's telegraph floor (every attack
// >= 0.8s of windup; bosses >= 0.9s) is the single most important number in
// the game for a five-year-old: it is one whole child choice-reaction. It was
// also unenforceable, because every timing lived as a bare literal inside its
// own state machine — `if (this.stateT >= 0.7)` — where nothing could audit it
// and four attacks had quietly drifted under the floor without anyone noticing.
//
// This is LAW 7 (THE POSE NEVER LIES) extended from hitboxes to CLOCKS: the
// state machine and the verifier read the SAME number, so a telegraph cannot
// silently shrink. tools/verify-combat-laws.mjs asserts this table against the
// floors on every run of the suite, and the enemy classes derive their state
// thresholds from it — change a number here and both move together.
//
// PURE DATA, ZERO IMPORTS, on purpose: node can read it directly without the
// three.js import map, so the law check is a millisecond, not a browser boot.
//
// windup  — anticipation before the attack commits. THE LAW APPLIES HERE.
// active  — the damaging/committed window.
// recover — vulnerability after the active window, inside the same state.
// gap     — cooldown before this owner may attack again (the wider punish).

export const TELEGRAPH_FLOOR = 0.8;      // every enemy attack
export const BOSS_FLOOR = 0.9;           // bosses and mini-bosses
export const PUNISH_FLOOR = 1.0;         // recover + gap, for this audience

export const ATTACK = {
  // --- js/enemies.js -------------------------------------------------------
  minion_lunge: {
    owner: 'SkeletonMinion', tier: 'enemy', source: 'js/enemies.js',
    // 0.25s was a pounce a child could not see coming. Damage is passive
    // contact, but a 3.4 u/s burst that hurts on touch IS an attack. Raised to
    // the floor; the grunt keeps its pressure through cadence (gap 2.4 -> 2.0),
    // which is the sanctioned Axis-B lever — never a shorter tell.
    windup: 0.80, active: 0.35, recover: 0.30, gap: 2.0,
    damage: 'contact', element: 'steel',
    counterplay: ['back_off', 'shield'],
  },
  rogue_dash: {
    owner: 'SkeletonRogue', tier: 'enemy', source: 'js/enemies.js',
    // the blade-dancer's highest-commitment move telegraphed for 0.7s — under
    // the floor on the one attack that most needs reading. 0.85s, cadence
    // tightened 2.2 -> 1.9 to keep the flanker's pressure.
    windup: 0.85, active: 0.5, recover: 1.3, gap: 1.9,
    damage: 'contact', element: 'steel',
    counterplay: ['sidestep', 'shield', 'bait_the_hop'],
  },
  shield_swing: {
    owner: 'SkeletonShield', tier: 'enemy', source: 'js/enemies.js',
    // 0.55s on a Tank whose whole lesson is "flank the guard" — the child had
    // to solve position AND reaction inside half a second. 0.85s, recovery
    // held at 0.95s (state end moves with it), cadence 3.2 -> 2.8.
    windup: 0.85, active: 0.20, recover: 0.95, gap: 2.8,
    damage: 'melee', element: 'steel',
    counterplay: ['flank', 'shield', 'parry'],
  },
  spitter_spit: {
    owner: 'Spitter', tier: 'enemy', source: 'js/enemies.js',
    // 0.6s (0.75s even in Gentle) on the one enemy whose taught answer is
    // "step off the line" — you cannot step off a line you never saw. 0.85s,
    // still interruptible by anything, cadence 2.2 -> 2.0.
    windup: 0.85, active: 0.0, recover: 0.0, gap: 2.0,
    damage: 'bolt', element: 'fire',
    counterplay: ['step_off_the_line', 'interrupt'],
  },
  hound_charge: {
    owner: 'Hound', tier: 'enemy', source: 'js/enemies.js',
    windup: 1.0, active: 0.7, recover: 1.6, gap: 1.2,
    damage: 'contact', element: 'steel',
    counterplay: ['dodge_roll', 'sidestep', 'shield'],
  },
  bat_dive: {
    owner: 'Bat', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.8, active: 0.7, recover: 1.3, gap: 1.0,
    damage: 'contact', element: 'steel',
    counterplay: ['move', 'bolt_it_down'],
  },
  warden_chop: {
    owner: 'BoneWarden', tier: 'boss', source: 'js/enemies.js',
    windup: 1.1, active: 0.32, recover: 0.83, gap: 1.5,
    damage: 'melee', element: 'steel',
    counterplay: ['sidestep', 'flank', 'parry'],
  },
  warden_spin: {
    owner: 'BoneWarden', tier: 'boss', source: 'js/enemies.js',
    windup: 1.0, active: 0.45, recover: 1.0, gap: 1.7,
    damage: 'melee', element: 'steel',
    counterplay: ['run_out', 'jump'],
  },

  // --- js/boss.js (the giant-wolf duel grammar: Shadowgrip/Sylva/Aria/Grimm)
  boss_swipe: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    windup: 0.9, active: 0.55, recover: 1.6, gap: 1.4,
    damage: 'melee', element: 'steel',
    counterplay: ['shield', 'parry', 'back_off'],
  },
  boss_charge: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    windup: 1.0, active: 1.0, recover: 2.6, gap: 1.4,
    damage: 'contact', element: 'steel',
    counterplay: ['sidestep', 'dodge_roll', 'jump'],
  },
  sylva_thornburst: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    // P7 audit (2026-08-22): Sylva was a pure recolor of the L1 Shadowgrip
    // — same class, same model, same moveset, no unique move — the exact
    // "boss is nothing more than a reskinned normal enemy" failure this
    // law exists to catch. She plants down and thorns erupt in a ring
    // around her (skin.snares, below-half-health only) — telegraphed on
    // the body (root+dust particles, no ground decal, LAW 4), single hit,
    // never a grinder, same as her charge.
    // gap matches _backToProwl()'s shared enraged-cooldown (2.2s) — every
    // boss attack resets through that one function, so a bespoke longer
    // cooldown here would drift from what the code actually does the
    // moment anyone touched it. Rarity instead comes from a 50% pick
    // chance against her other options at selection time.
    windup: 1.0, active: 0.35, recover: 1.8, gap: 2.2,
    damage: 'aoe', element: 'steel',
    counterplay: ['back_off', 'dodge_roll'],
  },
  boreal_dive: {
    owner: 'Boreal', tier: 'boss', source: 'js/boss.js',
    windup: 0.9, active: 0.9, recover: 1.4, gap: 1.6,
    damage: 'contact', element: 'frost',
    counterplay: ['move_off_the_lane', 'bolt_it_down'],
  },
};

// Absolute state thresholds, so a state machine never re-adds the numbers by
// hand: windupEnd < activeEnd < stateEnd.
export const phase = (id) => {
  const a = ATTACK[id];
  return { windupEnd: a.windup, activeEnd: a.windup + a.active,
    stateEnd: a.windup + a.active + a.recover, gap: a.gap };
};
