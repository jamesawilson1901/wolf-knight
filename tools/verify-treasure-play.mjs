// THE WHOLE PATH, WALKED. Light Ember Deep's ring, go through the vault door it
// opens, open the chest by walking onto it, and check the keepsake is in the
// bag and survives a save.
//
// UPDATED 2026-09-26: this used to jump to lk3 and walk to (0, -5.6), where the
// banked-fire chest once stood — and never lit the ring its own header named.
// Dad's play-test #19 ("lighting all torches needs to unlock something... put
// the door in this room") moved `lk3_banked` (same id, same keepsake) into the
// new vault room lk4 behind the ring's door (js/level1.js buildLk4), so the
// suite had been failing on a stale premise, not on a broken game. It now
// walks the path a child walks: ring → door → chest.
import { launch } from './wk-drive.mjs';
const FORMS = ['knight', 'dark_wolf', 'earth_wolf', 'fire_wolf'];
const wk = await launch({ timescale: 1 });
await wk.newGame('KEEP');
await wk.page.evaluate((f) => window.__wkJump('lk3', f), FORMS);
await wk.page.waitForFunction(() => window.__wk.room === 'lk3' && window.__wk.hearts > 1
  && !window.__wk.gates.transitioning, null, { timeout: 60000 });
await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

const before = await wk.page.evaluate(() => [...window.__game.state.inventory.treasures]);

// 1. LIGHT THE RING through the same call the Fire Wolf's slam makes
//    (js/gates.js world.igniteAt, hooked from player.tryGroundSlam)
const ring = await wk.page.evaluate(() => {
  const w = window.__game.world;
  const brs = (w.braziers || []).filter((b) => /^lk3_ring/.test(b.id));
  for (const b of brs) w.igniteAt(b.x, b.z, 0.5);
  return { n: brs.length, lit: brs.filter((b) => b.lit).length, flag: !!window.__game.state.flags.lk3RingLit };
});
console.log('RING  ', JSON.stringify(ring));

// 2. THE DOOR IT OPENS — live, in this visit (onwardPlug), then walk through it
await wk.page.waitForFunction(() => window.__game.world.doors.some((d) => d.to === 'lk4'),
  null, { timeout: 15000 }).catch(() => {});
const door = await wk.page.evaluate(() => {
  const d = window.__game.world.doors.find((x) => x.to === 'lk4');
  return d ? { x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 } : null;
});
console.log('DOOR  ', JSON.stringify(door));
if (door) {
  const w0 = await wk.walkTo(door.x, door.z + 1.2, { timeout: 40, arrive: 0.8 });
  console.log('TODOOR', JSON.stringify(w0));
  // then INTO the doorway (walkTo reports the room change) — a fixed-length
  // key hold from beside the jamb sometimes stopped short of the door zone
  if (w0.room === 'lk3') await wk.walkTo(door.x, door.z - 0.6, { timeout: 12, arrive: 0.4 });
  await wk.page.waitForFunction(() => window.__wk.room === 'lk4' && !window.__wk.gates.transitioning,
    null, { timeout: 20000 }).catch(() => {});
}
const room = await wk.page.evaluate(() => window.__wk.room);
console.log('ROOM  ', room);

// 3. WALK ONTO THE CHEST — 1.1u pickup radius, so aim close
if (room === 'lk4') {
  await wk.page.evaluate(() => { window.__game.narration.blocking = false; });
  // the Kiln Plate's chest (-4.5, 2.0) stands on the straight line from the
  // door to the keepsake, so go round it through the gap between the chests
  await wk.walkTo(-2.0, 0.2, { timeout: 25, arrive: 0.5 });
  // aim INTO the chest: its collider holds a body at 0.95u, inside the 1.1u
  // opening radius, so pressing against it always opens it
  const w1 = await wk.walkTo(-4.1, -3.0, { timeout: 12, arrive: 0.3 });
  console.log('WALK  ', JSON.stringify(w1));
  await wk.page.waitForTimeout(2500);
}
await wk.page.evaluate(() => { window.__game.narration.blocking = false; });
const after = await wk.page.evaluate(() => ({
  treasures: [...window.__game.state.inventory.treasures],
  chests: (window.__game.world.chests || []).map((c) => ({ id: c.id, opened: !!c.opened })),
}));
console.log('BEFORE', JSON.stringify(before), '\nAFTER ', JSON.stringify(after));

// 4. and it must survive a write/read of the save
const persisted = await wk.page.evaluate(async () => {
  const g = window.__game;
  const save = await import('/js/save.js');
  save.persist();
  const raw = JSON.stringify(localStorage).includes('banked_ember');
  return { wroteIt: raw, inState: [...g.state.inventory.treasures] };
});
console.log('SAVED ', JSON.stringify(persisted));
const ok = ring.n === 5 && ring.flag && room === 'lk4'
  && after.treasures.includes('banked_ember') && persisted.wroteIt;
console.log('ERRORS', JSON.stringify(wk.errors.slice(0, 3)));
console.log(ok ? '\n✓ PASS — lit the ring, walked through its door, got the keepsake, and it is in the save file'
                : '\n✗ FAIL');
await wk.b.close();
process.exit(ok ? 0 : 1);
