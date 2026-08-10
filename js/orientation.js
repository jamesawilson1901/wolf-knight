// THE HARD LANDSCAPE LOCK.
//
// index.html has always shown a "please turn your device sideways" card in
// portrait, and js/title.js has always asked the browser for a landscape
// lock. Neither was doing what it looked like:
//
//   * The card is an OPAQUE overlay with nothing behind it stopping. The
//     joystick and keyboard listeners live on `window`, so pointer events
//     reached them through the card, and the animation loop had no idea the
//     phone had turned. A child holding the phone upright could walk, swing
//     and be killed by something they could not see.
//   * The lock was fired in the same tick as requestFullscreen() rather than
//     after it. Every browser that implements Screen Orientation requires
//     fullscreen FIRST and rejects otherwise, so the request was rejected
//     essentially always — and the .catch(() => {}) swallowed the reason.
//
// So the lock is two things, and the second one carries it: ASK the browser
// properly, and HALT when the browser cannot help. iOS Safari has no
// orientation lock at all, which makes the halt the only real mechanism on
// the device most likely to be in a child's hands.
//
// Tunables: CONFIG.ORIENTATION.

import { CONFIG } from './config.js';

const query = () => window.matchMedia(CONFIG.ORIENTATION.QUERY);

// True while the device is portrait AND we are treating that as a stop.
// One reader (main.js's loop) and one writer (the media-query listener), so
// this cannot drift from what the card on screen is saying.
export function isPortrait() {
  return CONFIG.ORIENTATION.HALT && query().matches;
}

// Ask for the lock. Safe to call repeatedly — a browser that refuses simply
// refuses again, and one that has already granted it is a no-op.
//
// Must be chained onto the fullscreen request, never fired beside it: the
// Screen Orientation spec requires the document be fullscreen before lock()
// will resolve. Both branches still try, because a fullscreen REJECTION on
// desktop should not cost us a lock that might have worked anyway.
export function lockLandscape() {
  const ask = () => {
    try {
      if (window.screen && screen.orientation && screen.orientation.lock) {
        const p = screen.orientation.lock(CONFIG.ORIENTATION.ASK);
        if (p && p.catch) p.catch(() => {}); // iOS/desktop: no lock, no error noise
      }
    } catch (e) { /* not supported here; HALT is the fallback */ }
  };
  let fs = null;
  try {
    const el = document.documentElement;
    if (el && el.requestFullscreen) fs = el.requestFullscreen();
  } catch (e) { /* fall through to the bare ask */ }
  if (fs && fs.then) fs.then(ask, ask);
  else ask();
}

// Wire the halt. `onChange(portrait)` fires on every turn of the device so
// the caller can drop whatever the child was holding down — a joystick still
// pushed north when the screen went dark must not be pushing it when the
// screen comes back, and a button pressed blind must not be banked and fired
// on the way out.
//
// Re-asks for the lock whenever we re-enter fullscreen, because the one shot
// at profile-select is lost the moment a child swipes away and back.
export function initOrientation(onChange) {
  const mq = query();
  const fire = () => onChange(isPortrait());
  // Safari < 14 has no addEventListener on MediaQueryList
  if (mq.addEventListener) mq.addEventListener('change', fire);
  else if (mq.addListener) mq.addListener(fire);
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) lockLandscape();
  });
  fire();
}
