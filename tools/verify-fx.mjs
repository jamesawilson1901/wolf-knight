// FX (design/FX.md) — the Kenney Particle Pack's three sprites actually
// load and drive real effects: the pooled hit-burst carries a real texture
// now instead of a flat square, a weakness hit pops a one-off flare
// sprite that grows/fades/disposes on schedule, and a heavy hit pops a
// one-off flash the same way. Ticked directly via juice.update(dt) in one
// synchronous step rather than waiting on real animation frames — this
// session's own lesson from tools/verify-materials.mjs, since the real
// render loop can gate updates behind !transitioning/!narration.blocking
// for reasons unrelated to the thing under test.
import { launch } from './wk-drive.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('FXPROBE');
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

// 1. the pooled burst material carries a real texture now.
const burstMat = await wk.page.evaluate(() => {
  const g = window.__game;
  return { hasMap: !!g.juice._points.material.map, alphaTest: g.juice._points.material.alphaTest };
});
check('the pooled hit-burst points carry a real texture (not a flat square)',
  burstMat.hasMap && burstMat.alphaTest > 0, burstMat);

// 2. a weakness hit pops a flare sprite into the scene.
await wk.page.evaluate((f) => window.__wkJump('lc', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'lc' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
const flareInfo = await wk.page.evaluate(() => {
  const g = window.__game;
  const before = g.juice._oneOffs.length;
  const before3d = g.scene.children.filter((c) => c.isSprite).length;
  g.juice.flare(0, 1, 0, 0xffe14a);
  const after = g.juice._oneOffs.length;
  const after3d = g.scene.children.filter((c) => c.isSprite).length;
  return { before, after, before3d, after3d,
    scale0: g.juice._oneOffs[g.juice._oneOffs.length - 1].sprite.scale.x };
});
check('juice.flare() adds one THREE.Sprite to the live scene and tracks it',
  flareInfo.after === flareInfo.before + 1 && flareInfo.after3d === flareInfo.before3d + 1, flareInfo);

// 3. it grows and fades over its lifetime, then disposes and leaves the scene.
const flareLifecycle = await wk.page.evaluate(() => {
  const g = window.__game;
  const o = g.juice._oneOffs[g.juice._oneOffs.length - 1];
  const s0 = o.sprite.scale.x, op0 = o.mat.opacity;
  g.juice.update(o.life * 0.5); // halfway through its life, one synchronous tick
  const sMid = o.sprite.scale.x, opMid = o.mat.opacity;
  const stillIn = g.juice._oneOffs.includes(o);
  g.juice.update(o.life * 0.6); // past the end
  const stillInAfter = g.juice._oneOffs.includes(o);
  const stillInScene = g.scene.children.includes(o.sprite);
  return { s0, op0, sMid, opMid, stillIn, stillInAfter, stillInScene };
});
check('the flare grows and fades partway through its life',
  flareLifecycle.sMid > flareLifecycle.s0 && flareLifecycle.opMid < flareLifecycle.op0
    && flareLifecycle.stillIn, flareLifecycle);
check('once its life is spent, the flare is removed from tracking AND the scene (disposed, not leaked)',
  !flareLifecycle.stillInAfter && !flareLifecycle.stillInScene, flareLifecycle);

// 4. a heavy hit (juice.onHit('heavy', ...)) pops a flash sprite too.
const heavyInfo = await wk.page.evaluate(() => {
  const g = window.__game;
  const before = g.juice._oneOffs.length;
  g.juice.onHit('heavy', { x: 0, y: 1, z: 0 });
  const after = g.juice._oneOffs.length;
  return { before, after };
});
check('juice.onHit("heavy", ...) also pops a one-off flash sprite',
  heavyInfo.after === heavyInfo.before + 1, heavyInfo);

// 5. a light/medium hit does NOT pop a flash — the biggest blows only.
const lightInfo = await wk.page.evaluate(() => {
  const g = window.__game;
  const before = g.juice._oneOffs.length;
  g.juice.onHit('light', { x: 0, y: 1, z: 0 });
  const after = g.juice._oneOffs.length;
  return { before, after };
});
check('a light hit does not pop a flash (only heavy hits get the extra flourish)',
  lightInfo.after === lightInfo.before, lightInfo);

// 6. an actual real weakness hit in combat (not a direct juice.flare() call)
// really does fire the flare — the wiring in js/enemies.js, not just the
// standalone juice.js function.
await wk.page.evaluate(() => {
  const g = window.__game;
  const foe = (g.world.enemies || []).find((e) => !e.scenery && e.weakness);
  if (foe) { foe._wkTestWeakness = foe.weakness; }
});
const wiredWeak = await wk.page.evaluate(() => {
  const g = window.__game;
  const foe = (g.world.enemies || []).find((e) => !e.scenery && e._wkTestWeakness);
  if (!foe) return { found: false };
  const before = g.juice._oneOffs.length;
  foe.takeDamage(1, foe.weakness);
  const after = g.juice._oneOffs.length;
  return { found: true, before, after };
});
check('a real weakness-element hit in combat fires the flare through the actual game code path',
  wiredWeak.found && wiredWeak.after > wiredWeak.before, wiredWeak);

console.log('\nERRORS', JSON.stringify(wk.errors.slice(0, 5)));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : '\n✓ PASS — the FX pass loads real textures and fires real, disposing sprites');
await wk.b.close();
process.exit(errs.length ? 1 : 0);
