// CONFIG — every game-feel tuning number in one place. Change here, not in
// the systems. Units: px = CSS pixels, u = world units, s = seconds.

export const CONFIG = {
  // ---- dev harness (overnight play-testing) ----
  // Build-time half of the gate: the harness also needs ?dev=1 on the URL.
  // With this false, or without the query flag, nothing initialises and the
  // game is byte-for-byte the kids' game. The harness itself lives in main.js:
  // a READ-ONLY state view (window.__wk), a level jump, and a timescale — all
  // three inert without both halves of the gate.
  DEV_HARNESS: true,

  // ---- joystick (floating, left 40% of screen) ----
  JOY_RADIUS: 70,        // px, knob travel (magnitude clamps here)
  JOY_DEADZONE: 0.10,    // fraction of radius ignored (resting-thumb wobble)
  JOY_ZONE: 0.40,        // fraction of screen width that accepts stick touches
  JOY_HINT_OPACITY: 0.22,// idle hint ghost at the classic resting spot

  // ---- movement ----
  ACCEL_TIME: 0.10,      // s from standstill to full speed
  DECEL_TIME: 0.08,      // s from full speed to stop
  TURN_SPEED: 14,        // rad/s facing turn (shortest-angle)
  DT_CLAMP: 0.05,        // s, max delta per frame (hitch protection)

  // ---- camera ----
  CAM_DAMPING: 6,        // higher = tighter follow
  LOOKAHEAD_DIST: 1.5,   // u, camera leads into the direction of travel
  LOOKAHEAD_SMOOTH: 3,   // how quickly the lead direction itself settles

  // ---- combat feel ----
  LOCKON_RANGE: 4,       // u, soft lock-on search radius on attack
  LOCKON_COS: Math.cos((120 / 2) * Math.PI / 180), // 120° forward cone
  BUFFER_WINDOW: 0.15,   // s, attack taps in the tail of a swing are queued
  HITBOX_PAD: 0.2,       // u, hits are more generous than the visual arc
  ATTACK_MOVE_MULT: 0.75, // attacks barely slow you — fight on the move

  // ---- dodge roll (tap shield WHILE moving; hold while still = block) ----
  ROLL_SPEED: 7.5,
  ROLL_DUR: 0.32,
  ROLL_IFRAMES: 0.4, // movement speed retained while swinging

  // ---- form button ----
  FORM_HOLD_MS: 300,     // hold this long for the radial picker; shorter = cycle

  // ---- FORM IDENTITY (the Dark Wolf is the fast, fragile hunter) ----
  FORMS: {
    DARK_SPEED: 6.7,       // u/s (knight 4.6 — the wolf RUNS, +45%)
    DARK_TURN_MULT: 1.35,  // snappier facing turns
    DARK_HURT_MULT: 1.3,   // +30% damage taken — fast but fragile
    LUNGE_DIST: 2.5,       // u, tap attack while the stick is pushed
    LUNGE_DUR: 0.26,       // s, dash-bite travel time
    // LUNGE_IFRAMES removed in C4: the dodge now reads LUNGE_DUR directly, so
    // the invulnerable window is exactly the dash a child can see. A separate
    // number here meant 42% of the blur was hittable and looked identical.
    LUNGE_COOLDOWN: 1.1,   // s between lunges (0 while surging)
    SENSE_RANGE: 7,        // u, hidden things shimmer for wolf senses
  },

  // ---- MOON GAUGE (fills under pressure; full = the Blood Moon Surge) ----
  // All fills are fractions of the full gauge. The 'cooldown' perk
  // (Quicker Moon) adds +25%/rank to every fill.
  MOON: {
    PER_HIT: 0.055,        // each landed melee swing
    PER_BOLT: 0.03,        // each landed bolt / breath
    PER_HURT: 0.10,        // each hit Kael takes — pressure feeds the moon
    COMBAT_PER_S: 0.016,   // trickle while enemies are close (hidden assist)
    PERK_MULT: 0.25,       // Quicker Moon: fill bonus per rank
    CEREMONY: 2.5,         // s, the transformation ceremony
    SURGE_DUR: 10,         // s of Blood Moon Surge
    WARN: 2,               // s left when the warning flicker starts
    SURGE_SCALE: 1.0,      // same size as every wolf (playtest) — the red
                           // aura, trail and vignette carry the drama
    SURGE_DMG: 2,          // bite damage multiplier while surging
    SURGE_STAGGER: 0.9,    // s of stagger every surge bite inflicts
    SURGE_REGEN: 0.5,      // hearts/s while surging
    SHOCK_RADIUS: 4,       // u, transformation shockwave
    SHOCK_STUN: 1.6,       // s enemies reel from the shockwave
  },

  // ---- ENGAGEMENT (anti-swarm: fights are turns, not pile-ons) ----
  // At most MAX enemies actively press the attack; the rest PROWL a ring
  // around Kael, visibly waiting their turn. Difficulty moves the cap:
  // Gentle duels one at a time, Brave lets a third join.
  ENGAGE: {
    // Raised one across the board when the encounter seal came out — dad wants
    // the danger in the crossing, not in a locked door, and two pressers could
    // not make a room dangerous to walk. Gentle keeps a real duel feel at two.
    MAX: 3,
    MAX_GENTLE: 2,
    MAX_BRAVE: 4,
    HOLD_DIST: 3.0,      // u, the waiting ring around Kael
    HOLD_SPEED: 0.95,    // u/s sideways prowl while waiting
  },

  // ---- DEN GAMES (the villagers' minigames — js/minigames.js) ----
  DEN_GAMES: {
    TARGET_COUNT: 6,     // Rook: targets to hit (Gentle plays 5)
    TARGET_TIME: 45,     // s on Rook's clock (Gentle gets 60)
    SHUFFLE_SWAPS: 5,    // Wren: crate swaps to follow (Gentle 4)
    SWAP_TIME: 0.42,     // s per swap (Gentle 0.55 — easier to track)
    PAW_ROUNDS: 5,       // Pip: memory rounds to win (Gentle 4)
    PAW_STEP_TIME: 0.55, // s each paw lights during playback (Gentle 0.75)
    REWARD_FIRST: 12,    // shards for a game's FIRST win
    REWARD_REPEAT: 5,    // shards for wins after that
  },

  // ---- SHOP (Maren's stock ladder — BUILDLOG queue: "tier-2 after Stoneroot") ----
  // Maren's stock GROWS with the world instead of standing fully stocked on
  // day one. Each rung arrives when a region is HEALED, so walking home after
  // a boss is worth a trip to the Trading Post — and the shard income of the
  // region just finished is sized against the rung it just unlocked
  // (GAME-CONTRACT's ladder: ~60/90/150/250/400 per region tier).
  //
  // `after` is the RUNTIME WorldState region key ('stone', 'wild', 'frost') —
  // the short ids js/main.js actually writes on a boss defeat, NOT the long
  // names in js/regions.js. Those two vocabularies disagree and always have.
  // `after: null` is the opening stock. `blurb` is what Maren promises while
  // the rung is still locked; it names the region so the card is a POINTER,
  // never a nag. Items carry their rung as `tier` in js/items.js.
  SHOP: {
    TIERS: [
      { tier: 1, after: null,    blurb: '' },
      { tier: 2, after: 'stone', blurb: 'when Stoneroot sings again' },
      { tier: 3, after: 'wild',  blurb: 'when the Wild Woods bloom' },
      { tier: 4, after: 'frost', blurb: 'when the storm lifts off Frostpeak' },
      // A FIFTH RUNG, because five lines were put on one that did not exist.
      // The full weapon rack added `staff_moon`, `sword_storm`, `shield_moon`,
      // `hammer_earth` and Moonplate at tier 5 when the ladder stopped at four —
      // so all five were in the shop table and could never once be offered.
      // verify-gear called them obtainable because it checked that a stock line
      // existed, not that its rung could ever open. It checks the rung now.
      { tier: 5, after: 'vale',  blurb: 'when the Vale drains' },
    ],
  },

  // ---- SWITCH FX (every ordinary form change is a tiny spectacle) ----
  SWITCH_FX: {
    STOP: 0.12,            // s self-hitstop on the morph
    PUNCH: 0.3,            // camera punch-in amount (~4% of the frame)
    PUNCH_T: 0.25,         // s the punch releases over
    IFRAMES: 0.4,          // s of morph i-frames (no hurt flash)
    PUSH_RADIUS: 1.6,      // u, adjacent enemies get nudged (no damage)
  },

  // ---- DIFFICULTY (first family playtest verdict 2026-07-31: "too easy") ----
  // Flat hp bonus on every enemy (grunts stop dying in 2 hits) and how much
  // Cozy mode softens incoming damage (was 0.5 = half; floor ½ heart stays).
  // Per-family speeds were also raised in enemies.js (+15-20%, signatures kept).
  DIFFICULTY: {
    ENEMY_HP_BONUS: 1,     // skipped entirely in Gentle mode
    COZY_SOFTEN: 0.6,
    // 🌸 Gentle mode (per-profile; daughter verdict 2026-07-31 "too hard"):
    GENTLE_SOFTEN: 0.4,      // hits cost even less
    GENTLE_ENEMY_TIME: 0.8,  // enemies live at 80% speed — moves AND
                             // telegraphs slow down (more time to read)
    GUIDE_IDLE_S: 20,        // no progress this long → Pip runs ahead
                             // leaving a glowing trail (Gentle only)
  },

  // ---- JUICE (hit-feedback tiers; js/juice.js routes every hit here) ----
  // stop = hitstop s · shake = strength/duration · parts = burst particles ·
  // buzz = haptic ms (0 = none). The surge will promote tiers via weightBoost.
  JUICE: {
    light:  { stop: 0.00, shake: 0.06, shakeT: 0.10, parts: 5,  buzz: 0 },
    medium: { stop: 0.07, shake: 0.14, shakeT: 0.20, parts: 10, buzz: 20 },
    heavy:  { stop: 0.12, shake: 0.28, shakeT: 0.35, parts: 16, buzz: 45 },
    hurtBuzz: 60,        // haptic ms when KAEL takes a hit
    // Kael TAKING a hit: gentler on screen than dealing one, stronger in the
    // hand. These were hardcoded in juice.js — the only two feedback numbers in
    // the game that did not live here. The magnitude is deliberately unchanged:
    // the camera is a fixed offset, so 21.2u of ground is visible in EVERY room
    // whatever its size, and a shake that read correctly in a 14x10 choke reads
    // identically in the 36x28 hub. Measured, not assumed.
    hurtShake: 0.12, hurtShakeT: 0.18,
  },

  // ---- ACCESSIBILITY (state.settings.reduceMotion gates these) ----
  // Camera shake and the punch-in zoom are the two vestibular-motion
  // triggers in the juice pipeline (WCAG 2.3.3-style concern); hitstop,
  // particles and haptics are NOT camera motion and stay full-strength so a
  // hit still reads as weighty. 0 = off outright, not just dampened.
  ACCESSIBILITY: {
    REDUCE_MOTION_SHAKE_SCALE: 0,
    REDUCE_MOTION_PUNCH_SCALE: 0,
    // Hitstop still freezes briefly (a hit must still read as landing) but
    // far shorter — GAME-CONTRACT's polish item asks to TAME hitstop, not
    // remove the "did that connect?" cue entirely.
    REDUCE_MOTION_HITSTOP_SCALE: 0.4,
    // Dims one-off light-burst flashes (ground-slam impact glow, the Blood
    // Moon Surge's red wash/moon glow) without cutting them to nothing.
    REDUCE_MOTION_FLASH_SCALE: 0.35,
  },
};
