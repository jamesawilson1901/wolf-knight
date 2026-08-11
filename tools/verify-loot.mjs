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

console.log('\n── 4. seven kinds of smashable, all the right size ───');
// Dad, twice: "Smashable items should be replaced with chests, jars, crates,
// barrels etc" — and before that, "they are so small whatever they are you can
// barely see them". Both are one measurement: every kind in the kit loads, and
// every kind ends up a thing a child can see from across a room and standing on
// the floor rather than sunk into it or hovering over it.
const kit = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const mod = await import('/js/loot.js');
  const THREE = await import('three');
  const out = [];
  for (const kind of mod.BREAKABLE_KINDS) {
    const before = w.enemies.length;
    // far from anything, so nothing else is measured by accident
    const at = { x: 200 + out.length * 8, z: 200 };
    await mod.spawnBreakables(w, [{ ...at, kind }]);
    const b = w.enemies[before];
    if (!b) { out.push({ kind, built: false }); continue; }
    const bb = new THREE.Box3().setFromObject(b.root);
    out.push({ kind, built: true,
      h: +(bb.max.y - bb.min.y).toFixed(2),
      sits: +bb.min.y.toFixed(3),
      wide: +Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z).toFixed(2),
      // how far the drawn thing is from the spot the level asked for
      off: +Math.hypot((bb.min.x + bb.max.x) / 2 - at.x, (bb.min.z + bb.max.z) / 2 - at.z).toFixed(2),
      radius: +b.radius.toFixed(2), shards: b.shardCount });
  }
  return out;
});
check('every kind in the kit actually loads', kit.every((k) => k.built), kit.filter((k) => !k.built));
check('there are at least seven of them', kit.length >= 7, { kinds: kit.map((k) => k.kind) });
// 0.65 is roughly knee-high on Kael and 0.55 was ankle-high clutter; nothing
// should tower over him either.
check('none is too small to see', kit.every((k) => !k.built || k.h >= 0.65),
  kit.filter((k) => k.built && k.h < 0.65));
check('...and none is a monolith', kit.every((k) => !k.built || k.h <= 1.4),
  kit.filter((k) => k.built && k.h > 1.4));
// AN ABSOLUTE BOUND, NOT A RATIO. The first version of this check compared the
// collider to the model's own width, so it happily passed a `crate` that had
// come out SEVEN METRES ACROSS — the model under that name is a stack of planks
// nine centimetres tall, and scaling it to a sensible height made a pancake. A
// relative check cannot catch a thing that is uniformly wrong.
check('nothing is wider than a doorway', kit.every((k) => !k.built || k.wide <= 1.6),
  kit.filter((k) => k.built && k.wide > 1.6));
check('...and nothing is a smear on the floor',
  kit.every((k) => !k.built || k.h > k.wide * 0.4),
  kit.filter((k) => k.built && k.h <= k.wide * 0.4));
check('every one sits on the floor', kit.every((k) => !k.built || Math.abs(k.sits) < 0.06),
  kit.filter((k) => k.built && Math.abs(k.sits) >= 0.06));
// AND IT IS DRAWN WHERE IT WAS PUT. Vase.glb is modelled 1.09u off its own
// origin, so every vase in the game stood over a metre from the spot the level
// gave it and the collider a child bumped into was somewhere else entirely.
check('every one is drawn where the level put it',
  kit.every((k) => !k.built || k.off < 0.12), kit.filter((k) => k.built && k.off >= 0.12));
check('the collider matches the model it is drawn as',
  kit.every((k) => !k.built || (k.radius > k.wide * 0.35 && k.radius < k.wide * 0.95)),
  kit.map((k) => ({ kind: k.kind, wide: k.wide, radius: k.radius })));
check('a chest is worth more than a jar',
  (kit.find((k) => k.kind === 'chest') || {}).shards > (kit.find((k) => k.kind === 'jar') || {}).shards,
  kit.map((k) => [k.kind, k.shards]));

// and rooms have to actually SPEND the kit — three kinds across a hundred rooms
// is how every room came to look the same
const spread = await page.evaluate(async () => {
  const lk = await import('/js/levelkit.js');
  const g = window.__game, w = g.world;
  const seen = {};
  for (const label of ['t1a', 't2b', 't3a', 't4b', 's1a', 's2b', 's3a', 'd1a', 'd2b', 'd3a',
    'xa1', 'xr2', 'xm3', 'xg1']) {
    for (const p of lk.potSpots(w, 14, 11, { label })) seen[p.kind] = (seen[p.kind] || 0) + 1;
  }
  return seen;
});
check('a sweep of rooms uses more than three shapes', Object.keys(spread).length > 3, spread);
check('...and chests turn up, but are not everywhere',
  spread.chest > 0 && spread.chest < 14, spread);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN — you can see what you broke it for.'));
await b.close();
process.exit(errors.length ? 1 : 0);
