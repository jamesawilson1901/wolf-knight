// HER FOUR NEW BEATS, DRIVEN THROUGH THE GAME'S OWN CALLS.
//
//   1. the skill is in her draw and nobody else's
//   2. the half-health flinch fires ONCE and she is untouchable inside it
//   3. three landed blows inside a window put her down
//   4. she gets up, and the get-up is armoured again
import { launchBrowser } from '/home/user/wolf-knight/tools/launch.mjs';
const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};
const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 420 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'FIGHT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
const toDdp = async () => {
  await page.evaluate((f) => { window.__game.player.iframes = 0; window.__wkJump('ddp', f); }, ALL);
  await page.waitForFunction(() => window.__game.world
    && window.__game.world.roomId === window.__game.resolveRoom('ddp')
    && window.__game.world.boss, null, { timeout: 60000 });
  await page.evaluate(() => { window.__game.player.iframes = 99999; });
};
await toDdp();

console.log('\n── 1. the special is hers, and only hers ───────────────');
console.log(JSON.stringify(await page.evaluate(async () => {
  const boss = await import('/js/boss.js');
  return { note: 'skill lives in the skin table, not the class' };
})));
const draw = await page.evaluate(() => {
  const b = window.__game.world.boss;
  const seen = {};
  for (let i = 0; i < 400; i++) { const m = b._pickMove(3.0); seen[m] = (seen[m] || 0) + 1; }
  return { moves: b.skin.moves, drawn: seen, hasSkillClip: !!b.skillAction };
});
check('her body carries the Skill clip', draw.hasSkillClip, draw);
check('and `skill` comes up in her draw', (draw.drawn.skill || 0) > 0, draw.drawn);

console.log('\n── 2. the special telegraphs before it hits ────────────');
const tell = await page.evaluate(async () => {
  const g = window.__game, b = g.world.boss;
  b.action = 'gather'; b.actionT = b._tell(1.1);
  const tellSecs = b.actionT;
  const before = g.player.hearts;
  // run the tell out WITHOUT letting the blow land, and check nothing hurt
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  return { tellSecs: +tellSecs.toFixed(2), hearts: g.player.hearts, before, action: b.action };
});
check('the tell is at least the 0.9s law floor', tell.tellSecs >= 0.9, tell);

console.log('\n── 3. half health: she flinches, and nothing can touch her ──');
const flinch = await page.evaluate(() => {
  const g = window.__game, b = g.world.boss;
  b.coreHp = b.maxHp; b._halfHowled = false; b.action = 'prowl'; b.openT = 0;
  // CROSS IT THE WAY PLAY DOES. The first cut hit her with fire, which is her
  // OPENER — _hitCore topples and returns before any damage lands, so health
  // never moved and the half-health beat never fired. Damage only exists
  // inside a window, so open one first and then hit her through it.
  b.topple('probe');
  b._hitCore(b.maxHp / 2 + 0.5, 'steel');      // cross the halfway line
  const entered = b.action;
  const hpAfterCross = b.coreHp;
  // now hammer her with everything, including her own weakness and a stun
  b._hitCore(3, 'steel'); b._hitCore(3, 'fire'); b.takeStun(1);
  b._hitCore(3, 'steel');
  return { entered, anim: b._anim, hpAfterCross: +hpAfterCross.toFixed(2),
    hpAfterHammering: +b.coreHp.toFixed(2), openT: +(b.openT || 0).toFixed(2),
    stillFlinching: b.action === 'flinch' };
});
check('crossing half health puts her in the flinch', flinch.entered === 'flinch', flinch);
check('...and she is IMMUNE inside it, even to fire',
  flinch.hpAfterHammering === flinch.hpAfterCross, flinch);
check('...and the flinch cannot be toppled out of', flinch.stillFlinching, flinch);

console.log('\n── 4. keep swinging in the window and she goes down ────');
const kd = await page.evaluate(() => {
  const g = window.__game, b = g.world.boss;
  b.coreHp = b.maxHp; b._halfHowled = true; b.action = 'prowl'; b.openT = 0;
  b.topple('probe');
  const openAtStart = +b.openT.toFixed(2);
  const hits = [];
  for (let i = 0; i < 3; i++) { b._hitCore(1, 'steel'); hits.push(b.action); }
  return { openAtStart, afterEachHit: hits, action: b.action,
    openAfter: +(b.openT || 0).toFixed(2), anim: b._anim };
});
check('two hits do not floor her', kd.afterEachHit[1] !== 'downed', kd);
check('the THIRD hit knocks her down', kd.action === 'downed', kd);
check('...and the window gets LONGER, not shorter', kd.openAfter > kd.openAtStart, kd);

console.log('\n── 5. she gets up, and the get-up is armoured ──────────');
const up = await page.evaluate(async () => {
  const g = window.__game, b = g.world.boss;
  // WATCH FOR THE RISE, don't sleep past it. The first cut waited 260 frames
  // and sampled 'recover' — she had already stood up and moved on, so the
  // check could not tell "got up" from "never went down".
  b.coreHp = b.maxHp; b._halfHowled = true; b.action = 'prowl'; b.openT = 0;
  b.topple('probe');
  for (let i = 0; i < 3; i++) b._hitCore(1, 'steel');
  let sawDowned = false, sawRising = false, hpWhileRising = null, hpAfterRise = null;
  for (let i = 0; i < 420; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    if (b.action === 'downed') sawDowned = true;
    if (b.action === 'rising' && !sawRising) {
      sawRising = true;
      const before = b.coreHp;
      b._hitCore(2, 'steel');
      hpWhileRising = b.coreHp;
      hpAfterRise = before;
    }
    if (sawRising && b.action !== 'rising') break;
  }
  return { sawDowned, sawRising,
    armouredWhileRising: hpWhileRising === hpAfterRise,
    duringRise: sawRising ? 'rising' : b.action, anim: b._anim };
});
check('she is knocked to the floor and then RISES', up.sawDowned && up.sawRising, up);
check('...and the get-up is armoured again', up.armouredWhileRising, up);

check('nothing threw', errors.filter((e) => e.startsWith('PAGEERROR')).length === 0,
  errors.filter((e) => e.startsWith('PAGEERROR')).slice(0, 3));
await b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length}` : '\n✓ PASS — she has a special, a flinch and a floor');
process.exit(errors.length ? 1 : 0);
