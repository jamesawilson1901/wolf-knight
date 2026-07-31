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
  ATTACK_MOVE_MULT: 0.4, // movement speed retained while swinging

  // ---- form button ----
  FORM_HOLD_MS: 300,     // hold this long for the radial picker; shorter = cycle
};
