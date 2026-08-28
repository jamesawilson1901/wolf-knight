// BREAKING SOMETHING MUST SOUND AND LOOK LIKE BREAKING SOMETHING.
//
// Dad, from play: "whether it's an item, weapon, armour, coins or something
// else, there should be a sound effect when the crate, chest, barrel they are
// in is smashed or opened. There should also be an animation on that item
// bounce out on the floor a few times."
//
// Two faults. Every breakable in the game played ONE sound — `burn` at rate
// 1.3, a fire hiss borrowed because it was to hand — so a crate and a clay jar
// broke identically and neither sounded like breaking. And a coin flew one arc
// and stuck to the floor dead, which reads as a sprite being placed rather
// than a thing being thrown.
//
// The bounce is stepped with a fixed 1/60 dt rather than sampled off the wall
// clock: under SwiftShader a frame can take 200ms and main.js clamps dt to
// 0.05, so a real-time sample catches the coin still on its first rise and
// "proves" there is no bounce.
import { launchBrowser } from './launch.mjs';

const b = await launchBrowser();
const page = await b.newPage({ viewport: { width: 740, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto('http://localhost:8901/index.html?dev=1', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'SMASH');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__wk && window.__wk.room, null, { timeout: 90000 });
await page.waitForTimeout(600);

// Record every sound the game asks for, by wrapping the real audio.play.
await page.evaluate(() => {
  const g = window.__game;
  window.__sfx = [];
  const orig = g.audio.play.bind(g.audio);
  g.audio.play = (n, o) => { window.__sfx.push(n); return orig(n, o); };
});

// Smash a real breakable through its real takeDamage path.
const kinds = await page.evaluate(() => {
  const w = window.__game.world;
  return (w.enemies || []).filter((e) => e.constructor.name === 'Breakable')
    .map((e) => e.kind);
});
console.log('breakables in this room:', JSON.stringify(kinds));

const smash = await page.evaluate(() => {
  const w = window.__game.world;
  window.__sfx.length = 0;
  const br = (w.enemies || []).find((e) => e.constructor.name === 'Breakable');
  if (!br) return { err: 'no breakable' };
  const before = (w.shards || []).length;
  br.takeDamage(99, 'steel', 'melee');
  return { kind: br.kind, sfxOnSmash: [...window.__sfx],
    shardsBefore: before, shardsAfter: (w.shards || []).length };
});
console.log('SMASH:', JSON.stringify(smash));

// DRIVE THE PHYSICS DIRECTLY. Under SwiftShader a frame can take 200ms and
// main.js clamps dt to 0.05, so the world runs at a fraction of real time and
// a wall-clock sample catches the coin still on its first rise. Step the real
// updateShards with a fixed 60fps dt instead: same code, deterministic clock.
const bounce = await page.evaluate(async () => {
  const g = window.__game;
  const { updateShards } = await import('./js/loot.js');
  const w = g.world;
  // park the player far away so the magnet/pickup cannot eat the coin mid-test
  const px = g.player.root.position.x, pz = g.player.root.position.z;
  g.player.root.position.set(px + 60, 0, pz + 60);
  const s = (w.shards || []).find((q) => !q.taken);
  if (!s) return { err: 'no shard' };
  const ys = [];
  for (let i = 0; i < 240; i++) {          // 4 simulated seconds
    updateShards(w, 1 / 60, i / 60, g.player);
    ys.push(+s.y.toFixed(3));
    if (s.settled) break;
  }
  g.player.root.position.set(px, 0, pz);
  return { ys, hops: s.hops || 0, settled: !!s.settled };
});
const ys = bounce.ys || [];
let reversals = 0;
for (let i = 2; i < ys.length; i++) if (ys[i] > ys[i - 1] && ys[i - 1] <= ys[i - 2]) reversals++;
console.log('coin height (every 6th sample):', JSON.stringify(ys.filter((_, i) => i % 6 === 0)));
console.log('hops recorded:', bounce.hops, ' settled:', bounce.settled);
console.log('upward reversals seen (bounces):', reversals);

const sfxAfter = await page.evaluate(() => [...window.__sfx]);
console.log('all sfx during smash+bounce:', JSON.stringify(sfxAfter));

const ok = smash.sfxOnSmash && smash.sfxOnSmash.length >= 2
  && sfxAfter.includes("coin") && reversals >= 2 && bounce.hops >= 3 && bounce.settled;
console.log(ok ? '\n✓ PASS — material smash sound + coins audibly bounce'
  : '\n✗ FAIL');
await b.close();
process.exit(ok ? 0 : 1);
