// TOUCH TARGET AUDIT — big enough to hit, small enough to see past.
//
// Until v3.34 this file asserted a 2cm x 2cm minimum on every control. Dad
// played it on a phone and the verdict was blunt: "the buttons are way too big
// and take up too much of the screen." He is right, and the law was wrong.
// 2cm was borrowed from a touch-accessibility guideline written for banking
// forms, where a mis-tap costs money and nothing is behind the button. Here
// everything is behind the button — the room, the enemy, the thing you are
// aiming at — and a 106px pad on a 780px screen eats a seventh of the width
// before you count the one next to it.
//
// So the 2cm figure stays in the OUTPUT, because knowing the physical size is
// genuinely useful, and leaves the ASSERTIONS. What is asserted now:
//
//   1. a hard floor of 44 CSS px (0.83cm) — the size below which a thumb
//      genuinely cannot land, and the one number every platform agrees on
//   2. the controls together cover no more than 22% of the screen — this is
//      the complaint, made measurable
//   3. no two controls overlap — a fat thumb on a shared edge presses both
//   4. nothing a child must READ sits under a landscape thumb
//
// 2 and 4 are the ones that were never checked, and 2 is the one that failed.
//
// The device model is pinned rather than guessed:
//
//   Samsung Galaxy A54 / Pixel 7a class, the mid-range Android this game is
//   built for. 6.4", 1080 x 2340 physical, ~403 ppi, devicePixelRatio 3.
//   In LANDSCAPE the long edge is horizontal:
//       physical width  = 2340 px / 403 ppi = 5.81 in = 14.75 cm
//       CSS viewport    = 2340 / 3 = 780 CSS px wide
//   =>  1 CSS px = 14.75 / 780 = 0.01891 cm
import { launchBrowser } from './launch.mjs';

const CM_PER_CSS_PX = 14.75 / 780;
const FLOOR_PX = 44;             // the hard floor: below this a thumb misses
const MAX_HUD_FRACTION = 0.22;   // the controls may cover this much of the screen

const errors = [];
const warn = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
// the device model above, exactly
const page = await (await b.newContext({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'THUMB');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf'];
  g.player.iframes = 99999;
});
// give every conditional control a reason to exist
await page.evaluate(() => {
  const g = window.__game;
  g.state.potions = 3; g.player.potions = 3; g.player.moon = 1;
  // reveal every progressively-unlocked control so the audit measures the FULL
  // late-game HUD, which is the most crowded it will ever be
  for (const id of ['btn-ranged', 'btn-defend', 'btn-jump', 'form-badge', 'special-btn']) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('revealed'); el.style.display = 'flex'; }
  }
});
// THE REVEAL ANIMATION SCALES A BUTTON UP TO 1.3x MID-FLIGHT, and measuring
// during it reports a size the button never actually rests at — a 60px badge
// reads as 80px and "overlaps" its neighbour. A flat 1200ms wait was enough on
// an idle machine and NOT enough on a loaded one, which made this suite fail
// intermittently for reasons that had nothing to do with the change in flight
// (2026-08-31: it false-failed once on `btn-attack ∩ form-badge`, passed on the
// re-run, and cost a stash-and-bisect to clear). Wait for the geometry to stop
// moving instead of guessing how long that takes.
// ASK THE BROWSER WHEN IT HAS STOPPED ANIMATING, then confirm it held still.
//
// Polling for a stable width was not enough on its own: the poll can settle on
// eight identical readings BEFORE the reveal animation has started, and then
// the measurement lands mid-pop anyway (2026-09-01: form-badge measured 79px
// against a resting 60px and "overlapped" btn-attack, twice, on a change that
// moved neither of them). getAnimations() is the browser's own answer to "is
// anything still moving", so wait on that first and keep the stability poll as
// the belt to its braces.
await page.waitForFunction(
  () => document.getAnimations().every((a) => a.playState !== 'running'),
  null, { timeout: 15000, polling: 50 }).catch(() => {});
await page.waitForFunction(() => {
  const ids = ['btn-ranged', 'btn-defend', 'btn-jump', 'form-badge', 'special-btn', 'btn-attack'];
  const now = ids.map((id) => {
    const el = document.getElementById(id);
    return el ? Math.round(el.getBoundingClientRect().width) : 0;
  }).join(',');
  const stable = window.__touchStable || (window.__touchStable = { last: null, n: 0 });
  if (now === stable.last) stable.n++; else { stable.last = now; stable.n = 0; }
  return stable.n >= 8;          // ~8 consecutive rAF-ish polls with no change
}, null, { timeout: 15000, polling: 50 });
await page.waitForTimeout(250);  // one more beat, so nothing is measured on the last frame of a transition

console.log(`\nDevice model: 780x360 CSS landscape, 1 CSS px = ${CM_PER_CSS_PX.toFixed(5)} cm`);
console.log(`Hard floor: ${FLOOR_PX} CSS px = ${(FLOOR_PX * CM_PER_CSS_PX).toFixed(2)} cm`);
console.log(`Screen budget: controls may cover ${(MAX_HUD_FRACTION * 100).toFixed(0)}% of the view\n`);

const controls = await page.evaluate(() => {
  const out = [];
  // everything a thumb is expected to hit
  const sels = ['#joy-base', '#joy-knob', '#btn-attack', '#btn-defend', '#btn-jump',
    '#btn-ranged', '#form-badge', '#inv-btn', '#map-btn', '#pause-btn', '#cheat-btn',
    '.potion-slot', '#special-btn'];
  const seen = new Set();
  for (const sel of sels) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) continue;
      if (cs.pointerEvents === 'none') continue;   // feedback, not a target
      out.push({ id: el.id || el.className || el.tagName, w: r.width, h: r.height,
        x: r.left, y: r.top, right: r.right, bottom: r.bottom });
    }
  }
  return { controls: out, vw: innerWidth, vh: innerHeight };
});

console.log(`viewport ${controls.vw}x${controls.vh}, ${controls.controls.length} visible controls\n`);
const tooSmall = [];
let hudArea = 0;
for (const c of controls.controls) {
  const wcm = c.w * CM_PER_CSS_PX, hcm = c.h * CM_PER_CSS_PX;
  const ok = c.w >= FLOOR_PX && c.h >= FLOOR_PX;
  hudArea += c.w * c.h;
  console.log(`  ${ok ? '  ' : '!!'} ${String(c.id).padEnd(22)} ${c.w.toFixed(0).padStart(4)}x${c.h.toFixed(0).padStart(4)} px  =  ${wcm.toFixed(2)} x ${hcm.toFixed(2)} cm`);
  if (!ok) tooSmall.push({ id: c.id, px: `${c.w.toFixed(0)}x${c.h.toFixed(0)}` });
}
check(`\nevery control clears the ${FLOOR_PX}px thumb floor`, tooSmall.length === 0, { tooSmall });

// THE COMPLAINT, MEASURED. The joystick base is excluded from the budget: it
// lives on the left thumb and only draws where that thumb already is. Everything
// else competes with the room for the child's eyes.
const screen = controls.vw * controls.vh;
const joy = controls.controls.filter((c) => String(c.id).includes('joy'))
  .reduce((a, c) => a + c.w * c.h, 0);
const frac = (hudArea - joy) / screen;
console.log(`\ncontrols cover ${(frac * 100).toFixed(1)}% of the screen ` +
  `(${Math.round(hudArea - joy)} of ${screen} px², joystick excluded)`);
check(`the controls leave the room ${(100 - MAX_HUD_FRACTION * 100).toFixed(0)}% of the screen`,
  frac <= MAX_HUD_FRACTION, { covered: `${(frac * 100).toFixed(1)}%`, budget: `${(MAX_HUD_FRACTION * 100).toFixed(0)}%` });

// THUMB OCCLUSION. Landscape, two-handed: a child's thumbs cover roughly the
// bottom 45% of each outer 22% of the screen. Nothing they must READ may sit
// there — buttons are fine (that is where the thumb already is), text is not.
const zones = await page.evaluate(() => {
  const W = innerWidth, H = innerHeight;
  const inThumb = (r) => {
    const underLeft = r.left < W * 0.22 && r.bottom > H * 0.55;
    const underRight = r.right > W * 0.78 && r.bottom > H * 0.55;
    return underLeft || underRight;
  };
  const readables = [];
  for (const sel of ['#hearts', '#shards', '#level-badge', '#xp-bar', '#boss-bar',
    '#boss-name', '#caption', '#toast', '#moon-gauge', '#potion-count', '#pip-count']) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) continue;
      readables.push({ id: el.id || el.className, occluded: inThumb(r),
        box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
    }
  }
  return readables;
});
console.log('\nTHUMB OCCLUSION — readable HUD under a landscape thumb:');
for (const r of zones) console.log(`  ${r.occluded ? '!!' : '  '} ${String(r.id).padEnd(22)} [${r.box.join(', ')}]`);
check('no readable HUD element sits under a landscape thumb',
  zones.every((r) => !r.occluded), { occluded: zones.filter((r) => r.occluded).map((r) => r.id) });

// and controls must not overlap each other — a fat thumb on a shared edge
// presses the wrong one
const overlaps = [];
const cs = controls.controls;
for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
  const a = cs[i], c = cs[j];
  if (a.id === 'stick' || c.id === 'stick' || String(a.id).includes('knob') || String(c.id).includes('knob')) continue;
  const ox = Math.min(a.right, c.right) - Math.max(a.x, c.x);
  const oy = Math.min(a.bottom, c.bottom) - Math.max(a.y, c.y);
  if (ox > 0 && oy > 0) overlaps.push(`${a.id} ∩ ${c.id}`);
}
check('no two controls overlap', overlaps.length === 0, { overlaps });

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n') : '\nALL CLEAN.');
await b.close();
