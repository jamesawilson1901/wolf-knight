// STONEROOT'S HUB, PLAYED RATHER THAN SET.
//
// Dad could not finish Level 2, and the first cause found was narration — the
// line teaching hold-to-change was wired to a retired path. This is the second,
// and it is worse: js/main.js called `juice.shake(0.5, 0.5)` on the rattle
// plate. `juice` has no shake; the shake lives on `effects`. The line threw
// every time a child stomped on the plate, and it threw BEFORE the WS.complete
// under it — so the dam could not be brought down by playing the game and the
// hub could never reach stage 2.
//
// verify-level2-progress passes. It sets `drained` with WS.set and then checks
// where the plate SITS. Every suite that needed a milestone wrote it directly,
// so the one line that earns it had never been run by anything, ever.
//
// This plays them. Real form, real special button, real markers.
import { chromium } from 'playwright';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'VAULT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  // FIRE ONLY. Under boss-earned forms a child reaches every pre-boss room of
  // Stoneroot with the wolf the LAST boss gave them — if any milestone here
  // needs earth, the region is a door locked with the key behind it, and this
  // suite must be the thing that says so.
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf'];
  g.player.iframes = 999999;
});
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

console.log('\n── 1. the rattle plate brings the dam down ───────────');
await page.evaluate(() => { window.__game.WS.set('vault', 'drained', false); });
check('the Rattle builds', await go('vb3'));
const rattle = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const p = w.markers.rattlePlate;
  if (!p) return { err: 'no rattlePlate marker' };
  g.state.form = 'fire_wolf';   // the slam is also a stomp — player.js says why
  g.player.root.position.set(p.x, g.player.root.position.y, p.z);
  // THE REAL BUTTON. trySpecial is what the round action button calls, and for
  // the Earth Wolf it is the stomp — the same path a child's thumb takes.
  for (let i = 0; i < 300; i++) {
    g.player.iframes = 9999;
    g.player.root.position.set(p.x, g.player.root.position.y, p.z);
    if (i % 40 === 0) g.player.trySpecial(g.effects, w);
    await new Promise((r) => requestAnimationFrame(r));
    if (g.WS.get('vault', 'drained')) break;
  }
  return { plate: { x: p.x, z: p.z }, stomped: !!g.player.stompedAt,
    drained: !!g.WS.get('vault', 'drained') };
});
check('standing on the plate and stomping drains the vault', rattle.drained === true, rattle);
check('...and nothing threw while it happened',
  !pageErrors.some((e) => /shake|is not a function/.test(e)), pageErrors.slice(0, 3));

console.log('\n── 1b. the shoulder pin BURNS — no earth required ────');
await page.evaluate(() => { const g = window.__game;
  g.WS.set('vault', 'handDown', false);
  delete g.state.flags.burned.l2_vc3_pin; });
check('the Pin builds', await go('vc3'));
const pin = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const b = (w.burnables || []).find((x) => x.id === 'l2_vc3_pin');
  if (!b) return { err: 'no burnable pin in vc3' };
  g.state.form = 'fire_wolf';
  g.player.root.position.set(b.x + 1.2, g.player.root.position.y, b.z);
  for (let i = 0; i < 300; i++) {
    g.player.iframes = 9999;
    if (i % 40 === 0) g.player.trySpecial(g.effects, w);
    await new Promise((r) => requestAnimationFrame(r));
    if (g.state.flags.burned.l2_vc3_pin) break;
  }
  return { burned: !!g.state.flags.burned.l2_vc3_pin,
    handDown: !!g.WS.get('vault', 'handDown') };
});
check('the fire slam burns the pin', pin.burned === true, pin);

console.log('\n── 2. the hub opens as its milestones are earned ─────');
const stages = [];
for (const [n, keys] of [[0, []], [1, ['spark']], [2, ['spark', 'drained']],
                         [3, ['spark', 'drained', 'handDown']]]) {
  await page.evaluate((k) => { const g = window.__game;
    for (const key of ['spark', 'drained', 'handDown']) g.WS.set('vault', key, k.includes(key));
  }, keys);
  await go('vh');
  stages.push(await page.evaluate((n) => ({ n,
    doors: (window.__game.world.doors || []).map((d) => d.to).sort() }), n));
}
check('with nothing earned the hub shows one spoke',
  stages[0].doors.filter((d) => d.startsWith('vg')).length === 1, stages[0]);
check('the spark opens the other two spokes',
  stages[1].doors.filter((d) => d.startsWith('vg')).length === 3, stages[1]);
check('and every stage keeps the way back', stages.every((s) => s.doors.length >= 2), stages);

console.log('\n── 3. no stage of the hub ever throws ────────────────');
check('nothing threw across the whole hub sweep', pageErrors.length === 0, pageErrors.slice(0, 5));

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n') : '\nALL CLEAN — the vault can be drained by playing it.');
await b.close();
process.exit(errors.length ? 1 : 0);
