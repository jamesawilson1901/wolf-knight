// THE NEW CRITTERS, WALKED. js/enemies.js's MONSTER_ROSTER (v3.167): three
// tint-only reskins (gloom-slime, toxin-slime) traded for real Spider/Frog
// bodies, plus a brand-new cellar-rat — all riding the same Hopper class,
// now generalised (a `clips` override, the same "a body brings its own clip
// names" law Dragonling already proved) so a body that isn't Slime.glb gets
// its own idle/attack clips instead of a silent, empty animation lookup.
//
// The scale-sanity check guards a real bug this slice found and fixed: a
// freshly cloned SkinnedMesh's first Box3 read caches its bounding box from
// an unposed skeleton (every bone still at the identity), so `fitHeight`
// came out 680x too tall for Rat.glb until the constructor reads gltf.scene
// itself first. A scale outside a sane range is that regression coming back.
import { launchBrowser } from './launch.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'CRITTERS');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

const SANE_SCALE = [0.05, 1.0];

// lk1 — cellar-rat, in situ: its own real room, real markers, no synthetic setup.
if (await go('lk1')) {
  const rat = await page.evaluate(() => {
    const g = window.__game;
    const e = g.world.enemies.find((x) => x.constructor.name === 'Hopper' && Math.abs(x.x + 6.5) < 1 && Math.abs(x.z - 5.5) < 1);
    if (!e) return null;
    return { hp: e.hp, hasIdleAction: !!(e.actions && e.actions.idle),
      hasAttackAction: !!(e.actions && e.actions.attack), scaleY: e.model.scale.y };
  });
  check('lk1 spawns the cellar-rat Hopper with real clips', !!rat && rat.hasIdleAction && rat.hasAttackAction, rat);
  check('cellar-rat scale is sane (fitHeight bind-pose regression guard)',
    !!rat && rat.scaleY > SANE_SCALE[0] && rat.scaleY < SANE_SCALE[1], rat);
}

// xa2 — gloom-slime's own real room (js/level7.js), Spider.glb since v3.167.
if (await go('xa2')) {
  const spider = await page.evaluate(() => {
    const g = window.__game;
    const e = g.world.enemies.find((x) => x.constructor.name === 'Hopper' && Math.abs(x.x - 3) < 1 && Math.abs(x.z + 4) < 1);
    if (!e) return null;
    return { hp: e.hp, weakness: e.weakness, scaleY: e.model.scale.y };
  });
  check('xa2 spawns gloom-slime as the Spider body with its own weakness', !!spider && spider.weakness === 'moon', spider);
  check('gloom-slime scale is sane', !!spider && spider.scaleY > SANE_SCALE[0] && spider.scaleY < SANE_SCALE[1], spider);
}

// t2a — toxin-slime's own real room (js/level3.js), Frog.glb since v3.167.
if (await go('t2a')) {
  const frog = await page.evaluate(() => {
    const g = window.__game;
    const e = g.world.enemies.find((x) => x.constructor.name === 'Hopper' && Math.abs(x.x + 7) < 1 && Math.abs(x.z + 1) < 1);
    if (!e) return null;
    return { hp: e.hp, scaleY: e.model.scale.y };
  });
  check('t2a spawns toxin-slime as the Frog body', !!frog, frog);
  check('toxin-slime scale is sane', !!frog && frog.scaleY > SANE_SCALE[0] && frog.scaleY < SANE_SCALE[1], frog);
}

// a plain, untouched Slime (any slimeSpots room) still gets the old 0.26 —
// the generalised constructor must be a strict no-op for every existing caller.
if (await go('lk1')) {
  const plain = await page.evaluate(async () => {
    const g = window.__game;
    g.world.markers.slimeSpots = [{ x: 0, z: -6 }];
    const { spawnEnemies } = await import('/js/enemies.js');
    await spawnEnemies(g.world);
    const e = g.world.enemies.find((x) => Math.abs(x.x) < 0.5 && Math.abs(x.z + 6) < 0.5);
    return e ? { scaleY: e.model.scale.y } : null;
  });
  check('an ordinary slimeSpots Slime is untouched (still scale 0.26)', !!plain && Math.abs(plain.scaleY - 0.26) < 1e-6, plain);
}

console.log('\nERRORS', JSON.stringify(errs.slice(0, 10)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the new critters hold together');
await b.close();
process.exit(errs.length ? 1 : 0);
