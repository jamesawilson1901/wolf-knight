// TOUCH TARGET AUDIT — is every control at least 2cm x 2cm on a real phone?
//
// "2cm" is a physical measurement and a browser only knows CSS pixels, so the
// conversion has to be pinned to a stated device rather than guessed:
//
//   Samsung Galaxy A54 / Pixel 7a class, the mid-range Android this game is
//   built for. 6.4", 1080 x 2340 physical, ~403 ppi, devicePixelRatio 3.
//   In LANDSCAPE the long edge is horizontal:
//       physical width  = 2340 px / 403 ppi = 5.81 in = 14.75 cm
//       CSS viewport    = 2340 / 3 = 780 CSS px wide
//   =>  1 CSS px = 14.75 / 780 = 0.01891 cm
//   =>  2.00 cm  = 105.8 CSS px
//
// Anything that measures under that on a 780x360 viewport is too small for a
// five-year-old's thumb, full stop.
//
// It also checks THUMB OCCLUSION: in landscape a child holds the phone with
// both thumbs over the bottom corners. Anything the game needs them to READ
// must not live under a thumb.
import { chromium } from 'playwright';

const CM_PER_CSS_PX = 14.75 / 780;
const MIN_CM = 2.0;
const MIN_PX = MIN_CM / CM_PER_CSS_PX;

const errors = [];
const warn = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
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
// the reveal animation scales a button up to 1.3x mid-flight; measuring
// during it reports a size the button never actually rests at
await page.waitForTimeout(1200);

console.log(`\nDevice model: 780x360 CSS landscape, 1 CSS px = ${CM_PER_CSS_PX.toFixed(5)} cm`);
console.log(`Minimum touch target: ${MIN_CM} cm = ${MIN_PX.toFixed(1)} CSS px\n`);

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
for (const c of controls.controls) {
  const wcm = c.w * CM_PER_CSS_PX, hcm = c.h * CM_PER_CSS_PX;
  const ok = c.w >= MIN_PX && c.h >= MIN_PX;
  console.log(`  ${ok ? '  ' : '!!'} ${String(c.id).padEnd(22)} ${c.w.toFixed(0).padStart(4)}x${c.h.toFixed(0).padStart(4)} px  =  ${wcm.toFixed(2)} x ${hcm.toFixed(2)} cm`);
  if (!ok) tooSmall.push({ id: c.id, cm: `${wcm.toFixed(2)}x${hcm.toFixed(2)}` });
}
check(`\nevery control is at least ${MIN_CM}cm x ${MIN_CM}cm`, tooSmall.length === 0, { tooSmall });

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
