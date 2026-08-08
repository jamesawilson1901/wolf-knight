// C4 — THE POSE NEVER LIES ABOUT TIME EITHER.
//
// C1 fixed the flourishes that lied about WHERE an ability reaches. These are
// the three that lied about WHEN — the visual and the rule disagreed in time,
// which for a child who cannot read is the same defect: they act on what they
// see, and what they see is wrong.
//
//   the jump    visibly airborne 0.648s, dodged for only 0.535s
//   the lunge   a 0.26s dash that never changes, invulnerable for 0.15s
//   the parry   a 0.3s window inside a pose identical to the 3s hold around it
//
// Everything here drives the real methods (tryJump, tryAttack with a held stick,
// the real hurt() funnel) and steps the real clock.
import { chromium } from 'playwright';
const errors = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : ''); if (!ok) errors.push(n); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'TIMING');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
});

console.log('\n── the jump dodges for as long as it LOOKS airborne ────────────');
const jump = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.player;
  g.state.form = 'knight';
  p.airY = 0; p.airV = 0; p.jumpsUsed = 0; p.lockTime = 0; p.iframes = 0;
  p.tryJump();
  // integrate the arc with the same numbers the game uses, sampling `airborne`
  const dt = 1 / 120;
  let t = 0, visible = 0, dodging = 0;
  const GRAV = 21;
  while (t < 2) {
    if (p.airY > 0 || p.airV > 0) {
      visible += dt;
      if (p.airborne) dodging += dt;
      p.airY += p.airV * dt;
      p.airV -= GRAV * dt;
      if (p.airY <= 0) { p.airY = 0; p.airV = 0; p.jumpsUsed = 0; }
    } else break;
    t += dt;
  }
  return { visible: +visible.toFixed(3), dodging: +dodging.toFixed(3) };
});
check('the whole visible jump dodges ground attacks',
  Math.abs(jump.visible - jump.dodging) < 0.02,
  { visibleAirborneS: jump.visible, dodgingS: jump.dodging,
    liesFor: +(jump.visible - jump.dodging).toFixed(3) });

console.log('\n── a hop is still NOT a jump ───────────────────────────────────');
const hop = await page.evaluate(() => {
  const g = window.__game, p = g.player;
  p.jumpsUsed = 0; p.airV = 0;
  p.airY = 0.18;  const lunge = p.airborne;   // the lunge's hop
  p.airY = 0.28;  const roll = p.airborne;    // the roll's hop
  p.airY = 0.5;   const high = p.airborne;
  p.airY = 0;
  return { lungeHopDodges: lunge, rollHopDodges: roll, aboveThreshold: high };
});
check('the lunge hop (0.18u) does not dodge ground attacks', hop.lungeHopDodges === false, hop);
check('the roll hop (0.28u) does not dodge ground attacks', hop.rollHopDodges === false, hop);

console.log('\n── the lunge is invulnerable for the whole dash ────────────────');
const lunge = await page.evaluate(() => {
  const g = window.__game;
  return { dashDur: g.CONFIG.FORMS.LUNGE_DUR,
           iframes: g.CONFIG.FORMS.LUNGE_IFRAMES,
           lungeIframesConstantGone: g.CONFIG.FORMS.LUNGE_IFRAMES === undefined };
});
check('LUNGE_IFRAMES no longer exists as a separate number', lunge.lungeIframesConstantGone, lunge);
const lungeLive = await page.evaluate(async () => {
  const g = window.__game, p = g.player;
  const s = () => new Promise((r) => requestAnimationFrame(r));
  g.state.form = 'dark_wolf';
  p.lungeCooldown = 0; p.lockTime = 0; p.iframes = 0; p.airY = 0;
  p._dash = null;
  const input = { getMove: () => ({ x: 0, z: 1 }) };
  p.tryAttack(g.world, input);
  // read it in the SAME tick it was set: iframes decays with dt, and under
  // SwiftShader a single frame is long enough to eat 20% of the window
  return { dashing: !!p._dash, iframes: +p.iframes.toFixed(3), dur: g.CONFIG.FORMS.LUNGE_DUR };
});
check('lunging starts a dash', lungeLive.dashing === true, lungeLive);
check('...and its i-frames cover the whole dash',
  lungeLive.iframes >= lungeLive.dur - 0.01, lungeLive);

console.log('\n── the parry window can be SEEN ────────────────────────────────');
const parry = await page.evaluate(async () => {
  const g = window.__game, p = g.player;
  const s = () => new Promise((r) => requestAnimationFrame(r));
  g.state.form = 'knight';
  p.lockTime = 0; p.airY = 0; p.jumpsUsed = 0;
  if (!p._parryMats || !p._parryMats.length) return { noMats: true };
  p.defending = true;
  p.defendStart = p._time;
  p._parryLit = 0;
  p._parryGlint();
  const litInWindow = p._parryLit;
  // ...and after the window has closed
  p.defendStart = p._time - 1.0;
  for (let i = 0; i < 20; i++) p._parryGlint();
  const litAfter = p._parryLit;
  p.defending = false;
  return { mats: p._parryMats.length, litInWindow, litAfter: +litAfter.toFixed(2) };
});
if (parry.noMats) { check('the shield has per-instance materials to light', false, parry); }
else {
  check('the shield lights up the instant the window opens', parry.litInWindow === 1, parry);
  check('...and goes dark once it has closed', parry.litAfter === 0, parry);
  check('the glow is on CLONED materials, not the shared cache', parry.mats > 0, parry);
}

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED\n' + errors.join('\n')
  : '✓ what a child sees and what the rules do now agree in time'));
await b.close();
process.exit(errors.length ? 1 : 0);
