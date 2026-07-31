// CONFIG — every game-feel tuning number in one place. Change here, not in
// the systems. Units: px = CSS pixels, u = world units, s = seconds.

export const CONFIG = {
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
  },
};
