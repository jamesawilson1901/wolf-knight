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
  // ShieldAdvancer (task #31) deliberately runs the identical numbers —
  // "the same law as SkeletonShield" per its own design note — but owns a
  // separate table row so per-class coverage checks (verify-combat-laws.mjs
  // #8/#9) actually see it; reusing shield_swing's row hid it from both
  // (audit 2026-08-24, which is also how ShieldAdvancer's missing TRAITS
  // armor entry went undetected).
  shieldadvancer_swing: {
    owner: 'ShieldAdvancer', tier: 'enemy', source: 'js/enemies.js',
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
  // THE THIRD SHARED MOVE (2026-09-03), added because two attacks and a coin
  // flip is a fight a child solves in one cycle. Rear up, leap onto where they
  // stood, land with a 2.4u shockwave — and the opening it leaves is a
  // different SHAPE from the charge's: 1.4s dazed ON ITS FEET and right next
  // to them, rather than 2.6s collapsed across the arena. Different openings
  // was half of what dad asked for.
  boss_pounce: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    windup: 1.0, active: 0.70, recover: 1.4, gap: 1.6,
    damage: 'aoe', element: 'steel',
    counterplay: ['dodge_roll', 'keep_moving', 'jump'],
  },
  boreal_dive: {
    owner: 'Boreal', tier: 'boss', source: 'js/boss.js',
    windup: 0.9, active: 0.9, recover: 1.4, gap: 1.6,
    damage: 'contact', element: 'frost',
    counterplay: ['move_off_the_lane', 'bolt_it_down'],
  },

  // --- Roster expansion (task #31) — 15 new AI behaviors for the 32-enemy
  // roster. Same law as everything above: every timing lives here first, the
  // state machines in js/enemies.js only ever read it.
  flanker_strike: {
    owner: 'Flanker', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.85, active: 0.30, recover: 0.90, gap: 1.8,
    damage: 'melee', element: 'steel',
    counterplay: ['sidestep', 'shield', 'watch_the_orbit'],
  },
  stalker_pounce: {
    owner: 'Stalker', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.85, active: 0.50, recover: 1.30, gap: 1.6,
    damage: 'contact', element: 'steel',
    counterplay: ['dodge_roll', 'shield', 'stay_moving'],
  },
  ranged_kite_shot: {
    owner: 'RangedKiter', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.85, active: 0.0, recover: 0.0, gap: 2.0,
    damage: 'bolt', element: 'steel',
    counterplay: ['step_off_the_line', 'close_the_gap'],
  },
  ranged_lob_throw: {
    owner: 'RangedLobber', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.90, active: 0.0, recover: 0.0, gap: 2.2,
    damage: 'bolt', element: 'verdant',
    counterplay: ['step_off_the_line', 'close_the_gap'],
  },
  ranged_bolt_shot: {
    owner: 'RangedBolter', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.80, active: 0.0, recover: 0.0, gap: 1.8,
    damage: 'bolt', element: 'storm',
    counterplay: ['step_off_the_line', 'interrupt'],
  },
  dash_strike: {
    owner: 'DashStriker', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.85, active: 0.50, recover: 1.30, gap: 1.8,
    damage: 'contact', element: 'storm',
    counterplay: ['sidestep', 'shield', 'parry'],
  },
  duellist_swing: {
    owner: 'Duellist', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.85, active: 0.25, recover: 1.00, gap: 2.0,
    damage: 'melee', element: 'steel',
    counterplay: ['shield', 'parry', 'back_off'],
  },
  heavy_swing: {
    owner: 'HeavySwinger', tier: 'enemy', source: 'js/enemies.js',
    // the biggest single hit any mook throws — a full 1.1s wind-up, the
    // longest of any non-boss attack, so the reward for reading it is real
    windup: 1.10, active: 0.35, recover: 1.20, gap: 2.0,
    damage: 'melee', element: 'steel',
    counterplay: ['sidestep', 'shield', 'flank'],
  },
  mirror_swing: {
    owner: 'MirrorKael', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.85, active: 0.30, recover: 1.00, gap: 1.9,
    damage: 'melee', element: 'moon',
    counterplay: ['shield', 'parry', 'switch_element'],
  },
  flurry_strikes: {
    owner: 'Flurry', tier: 'enemy', source: 'js/enemies.js',
    // twin blades, ONE committed swing with two hits inside it — never an
    // open-ended combo string (LAW: bosses/mooks never grind), just a wider
    // active window than a single-hit swing
    windup: 0.85, active: 0.50, recover: 1.10, gap: 2.0,
    damage: 'melee', element: 'steel',
    counterplay: ['shield', 'parry', 'back_off'],
  },
  commander_swing: {
    owner: 'Commander', tier: 'enemy', source: 'js/enemies.js',
    windup: 1.00, active: 0.30, recover: 1.10, gap: 2.2,
    damage: 'melee', element: 'earth',
    counterplay: ['shield', 'parry', 'flank'],
  },
  commander_rally: {
    owner: 'Commander', tier: 'enemy', source: 'js/enemies.js',
    // the buff-allies cast — long gap on purpose, this is a support move,
    // not pressure, and it must not be spammable
    windup: 1.00, active: 0.0, recover: 0.50, gap: 5.0,
    damage: 'aoe', element: 'earth',
    counterplay: ['kill_the_commander_first', 'interrupt'],
  },
  stomp_slam: {
    owner: 'SlowStomper', tier: 'enemy', source: 'js/enemies.js',
    windup: 1.10, active: 0.30, recover: 1.20, gap: 2.0,
    damage: 'aoe', element: 'earth',
    counterplay: ['back_off', 'jump'],
  },
  hop_leap: {
    owner: 'Hopper', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.85, active: 0.40, recover: 0.90, gap: 1.6,
    damage: 'contact', element: 'steel',
    counterplay: ['sidestep', 'shield'],
  },
  dragonling_dive: {
    owner: 'Dragonling', tier: 'enemy', source: 'js/enemies.js',
    windup: 0.90, active: 0.70, recover: 1.40, gap: 1.3,
    damage: 'contact', element: 'fire',
    counterplay: ['move', 'bolt_it_down'],
  },
  // THE CINDER DRAKE (lb, 2026-09-26) — the Dragonling family at mini-boss
  // scale, so the BOSS floor applies. Its dive is the same grammar with a
  // longer tell; a raised shield still crashes it (3.0s floored, gold ring).
  // `recover` is the low climb back to hover — hittable — when it is NOT met.
  drake_dive: {
    owner: 'DrakeGuardian', tier: 'boss', source: 'js/enemies.js',
    windup: 1.10, active: 0.75, recover: 1.40, gap: 1.6,
    damage: 'contact', element: 'fire',
    counterplay: ['shield', 'move', 'bolt_it_down'],
  },
  // Every third attack: a red lane on the floor (the boss-lane exception to
  // LAW 4), fire down it, then it lands winded — floored, gold ring, the
  // second shape of opening in the fight.
  drake_flame: {
    owner: 'DrakeGuardian', tier: 'boss', source: 'js/enemies.js',
    windup: 1.20, active: 0.60, recover: 1.80, gap: 1.6,
    damage: 1, element: 'fire',
    counterplay: ['move', 'shield'],
  },

  // --- BOSS MAGIC (2026-10-03, js/bossmagic.js; design/COMBAT-SPEC.md "Boss
  // magic"). Dad: "boss fights all feel too similar". Each boss gets a move no
  // other fight has, each with its own visible answer. The tells are the
  // caster's pose AND a floor mark (the boss-lane exception to LAW 4), never
  // under 1.0s — a tenth over the boss floor, because these are NEW reads.
  shadow_orbs: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    // three slow purple orbs in a fan; a raised shield pops them, and for the
    // Shadowgrip a popped orb counts as a block — it falls over (open.by)
    windup: 1.1, active: 0.0, recover: 1.2, gap: 1.6,
    damage: 'bolt', element: 'moon',
    counterplay: ['shield', 'step_off_the_line'],
  },
  sylva_vine: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    // a vine creeps to Kael for the whole tell; in the air it snaps, on the
    // ground it drags him in (no damage — the swipe that follows is the cost)
    windup: 1.0, active: 0.4, recover: 1.2, gap: 2.2,
    damage: 'pull', element: 'verdant',
    counterplay: ['jump'],
  },
  aria_thunder: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    // a thunderclap ring rolls out from her; jump it or be thrown back toward
    // the gales (never into a hazard — js/player.js shove())
    windup: 1.0, active: 1.2, recover: 1.2, gap: 2.2,
    damage: 'aoe', element: 'storm',
    counterplay: ['jump'],
  },
  grave_hands: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    // Shadow-Grimm's borrowed copy of the Bone Warden's grave hands
    windup: 1.2, active: 0.3, recover: 1.2, gap: 1.6,
    damage: 'aoe', element: 'earth',
    counterplay: ['move_off_the_circle', 'jump'],
  },
  ice_shards: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    // Shadow-Grimm's borrowed copy of Boreal's ice rain (hers: boreal_shards)
    windup: 1.2, active: 0.3, recover: 1.2, gap: 1.6,
    damage: 'aoe', element: 'frost',
    counterplay: ['move_off_the_circle'],
  },
  grimm_binding: {
    owner: 'Shadowgrip', tier: 'boss', source: 'js/boss.js',
    // one slow curse orb; if it touches Kael he is held in the wolf Grimm is
    // armoured against for 6s (3s Gentle). Step off its line or shield it.
    windup: 1.2, active: 0.0, recover: 1.2, gap: 2.0,
    damage: 'curse', element: 'moon',
    counterplay: ['step_off_the_line', 'shield'],
  },
  boreal_shards: {
    owner: 'Boreal', tier: 'boss', source: 'js/boss.js',
    // three red circles round Kael while she wheels; ice falls into them —
    // seen falling for the last half second. Only stepping off answers it.
    windup: 1.2, active: 0.3, recover: 0.0, gap: 4.6,
    damage: 'aoe', element: 'frost',
    counterplay: ['move_off_the_circle'],
  },
  warden_hands: {
    owner: 'BoneWarden', tier: 'boss', source: 'js/enemies.js',
    // he taunts, the shield comes DOWN, and red circles fill where hands will
    // burst from the grave floor — jump them or step off. His lowered shield
    // is the punish.
    windup: 1.2, active: 0.3, recover: 0.9, gap: 1.5,
    damage: 'aoe', element: 'earth',
    counterplay: ['move_off_the_circle', 'jump'],
  },
  wight_snare: {
    owner: 'BoneWarden', tier: 'boss', source: 'js/enemies.js',
    // the Rootbound Wight's version: roots, not hands — no damage, but held
    // where you stand until you jump
    windup: 1.2, active: 0.3, recover: 0.9, gap: 1.5,
    damage: 'snare', element: 'verdant',
    counterplay: ['move_off_the_circle', 'jump'],
  },
  ash_firering: {
    owner: 'BoneWarden', tier: 'boss', source: 'js/enemies.js',
    // the Ash Warden's spin leaves a band of fire round where he stood: red
    // for a second, then burning for three. Inside the band is safe; so is a
    // jump across it.
    windup: 1.0, active: 3.0, recover: 0.0, gap: 1.7,
    damage: 'aoe', element: 'fire',
    counterplay: ['stay_out', 'get_inside', 'jump'],
  },
  sage_orbs: {
    owner: 'RangedBolter', tier: 'boss', source: 'js/enemies.js',
    // the Bone Sage's volley: bat an orb back with the shield and it flies
    // home — the only thing that pops its bubble
    windup: 1.0, active: 0.0, recover: 0.6, gap: 2.4,
    damage: 'bolt', element: 'tide',
    counterplay: ['shield', 'step_off_the_line'],
  },
  chancellor_coins: {
    owner: 'Duellist', tier: 'boss', source: 'js/enemies.js',
    // the Court Chancellor slams his coin-purse: a shockwave rolls out. Jump.
    windup: 1.0, active: 1.0, recover: 1.0, gap: 2.6,
    damage: 'aoe', element: 'steel',
    counterplay: ['jump'],
  },
};

// Absolute state thresholds, so a state machine never re-adds the numbers by
// hand: windupEnd < activeEnd < stateEnd.
export const phase = (id) => {
  const a = ATTACK[id];
  return { windupEnd: a.windup, activeEnd: a.windup + a.active,
    stateEnd: a.windup + a.active + a.recover, gap: a.gap };
};
