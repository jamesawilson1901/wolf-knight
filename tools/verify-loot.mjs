// DOES BREAKING A POT SHOW YOU ANYTHING?
//
// Dad, from play: "There is no coin appearing when you smash things. Sometimes
// you'll smash it and you'll hear the coin sound and the counter will go up but
// nothing is visible."
//
// He was describing a reward that existed, was counted, was heard, and was
// never drawn. Shards spawn AT the pot, and the child is standing next to the
// pot they just hit, so the pickup test — which runs on the very first frame —
// found them inside its 0.45u radius and swallowed the lot instantly.
//
// A counter going up is not a reward. Being SHOWN the coin is the reward. So
// this measures the thing that matters: after a pot breaks, is there a coin on
// screen, for long enough to see, before it is taken.
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
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'LOOT');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.player.iframes = 999999;
});

console.log('\n── 1. a smashed pot puts coins on the floor ──────────');
// Spawn shards right on top of the player — the worst case, and exactly what
// happens when a child breaks a pot they are standing beside.
const seen = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const mod = await import('/js/loot.js');
  const p = g.player.root.position;
  w.shards = [];
  mod.spawnShards(w, p.x, p.z, 4);
  // MEASURE THE TIME THE COIN IS ON SCREEN, NOT THE FRAME COUNT. Headless under
  // SwiftShader this runs at about five frames a second, so "1200ms" was six
  // frames and the coins had not finished their arc, let alone been collected.
  let visibleFor = 0, maxDist = 0;
  const before = g.state.shards;
  let last = performance.now();
  const start = last;
  while (performance.now() - start < 25000) {
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now();
    const dt = (now - last) / 1000; last = now;
    const live = (w.shards || []).filter((s) => !s.taken);
    if (!live.length) break;
    visibleFor += dt;
    for (const s of live) maxDist = Math.max(maxDist, Math.hypot(s.x - p.x, s.z - p.z));
  }
  return { visibleFor: +visibleFor.toFixed(2), maxDist: +maxDist.toFixed(2),
    left: (w.shards || []).filter((s) => !s.taken).length, gained: g.state.shards - before };
});
check('the coins stay on screen long enough to be seen', seen.visibleFor > 0.4, seen);
check('...and they arc clear of the player before being taken', seen.maxDist > 0.35, seen);
check('...and they are all collected in the end', seen.left === 0 && seen.gained > 0, seen);

console.log('\n── 2. a coin reads as gold, wherever it lands ────────');
const gold = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const mod = await import('/js/loot.js');
  w.shards = [];
  mod.spawnShards(w, g.player.root.position.x + 30, g.player.root.position.z + 30, 1);
  await new Promise((r) => requestAnimationFrame(r));
  const s = (w.shards || [])[0];
  let colour = null, emissive = 0;
  s.mesh.traverse((n) => { if (!n.isMesh) return;
    for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
      colour = '#' + m.color.getHexString();
      if (m.emissive) emissive = Math.max(emissive, m.emissive.r + m.emissive.g + m.emissive.b);
    } });
  return { colour, emissive: +emissive.toFixed(2), scale: s.mesh.scale.x };
});
check('a coin is gold', gold.colour === '#ffc843', gold);
check('...and lit from inside, so a dark cave cannot hide it', gold.emissive > 0.2, gold);

console.log('\n── 3. breakables sometimes hold a potion ─────────────');
const potion = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const mod = await import('/js/loot.js');
  await mod.preloadPotionDrop();
  w.shards = [];
  const ok = mod.spawnPotionDrop(w, g.player.root.position.x + 30, g.player.root.position.z + 30);
  const s = (w.shards || [])[0];
  return { ok, kind: s && s.kind, arm: s && s.arm, hasMesh: !!(s && s.mesh) };
});
check('a potion can be dropped', potion.ok && potion.kind === 'potion', potion);
check('...and it waits to be seen like a coin does', potion.arm > 0, potion);

// and picking one up must actually heal the belt
const healed = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const mod = await import('/js/loot.js');
  g.player.potions = 0;
  w.shards = [];
  const p = g.player.root.position;
  mod.spawnPotionDrop(w, p.x + 0.2, p.z + 0.2);
  const start = performance.now();
  while (performance.now() - start < 25000 && g.player.potions === 0) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { potions: g.player.potions };
});
check('walking over it puts a potion on the belt', healed.potions > 0, healed);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN — you can see what you broke it for.'));
await b.close();
process.exit(errors.length ? 1 : 0);
