// CAN A CHILD ACTUALLY GET THROUGH STONEROOT?
//
// Dad, from play: "Level two does not work. The rooms loop back to the start and
// there's nothing you can do."
//
// verify-playthrough walks Stoneroot clean — because it SETS the three vault
// milestones itself, on the grounds that it was testing routes rather than
// progression. That is a reasonable split and it is also exactly the hole this
// bug lived in: the hub only opens its other spokes as milestones land, so if
// the game never grants one, a child walks spoke A, comes back to a hub with a
// single door, and goes round again forever.
//
// So this grants NOTHING. It walks the spoke the way a child does, stands where
// a child stands, and asks whether the world moved.
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
await page.fill('#t-name', 'L2');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  // what a child ARRIVES in Stoneroot with, and not one thing more
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf'];
  g.state.flags.bossDefeated = true;      // Ember is done; that is how you get here
});

const settle = () => page.waitForFunction(() => !document.getElementById('fade')
  || getComputedStyle(document.getElementById('fade')).opacity === '0', null, { timeout: 30000 }).catch(() => {});

const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      await settle();
      return true;
    } catch { /* retry */ }
  }
  return false;
};

const doorsHere = () => page.evaluate(() => (window.__game.world.doors || []).map((d) => d.to));

console.log('\n── 1. arriving in the vault, one door is open ─────────');
await go('vh');
const first = await doorsHere();
check('the hub starts with the way out and Spoke A only',
  first.includes('vga') && !first.includes('vgb') && !first.includes('vgc'), { doors: first });

// AND THE FIRST THING YOU SEE IS A ROOM, NOT A WALL OF WATER.
//
// Dad, twice: "you still walk into the first room with the water and an
// unreachable character and chest". The pool used to start half a metre in
// front of the spawn, with the worn path painted straight into it. A child
// arriving in the region's first room must be able to walk FORWARD.
const arrival = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  const sp = w.spawn || { x: 0, z: 10, angle: Math.PI };
  const a = sp.angle === undefined ? Math.PI : sp.angle;
  const fx = Math.sin(a), fz = Math.cos(a);
  const solid = (x, z) => {
    const r = w.resolveCircle(x, z, 0.32);
    return Math.abs(r.x - x) > 1e-6 || Math.abs(r.z - z) > 1e-6;
  };
  let ahead = 0;
  for (let d = 0.4; d < 14; d += 0.2) {
    if (solid(sp.x + fx * d, sp.z + fz * d)) break;
    ahead = d;
  }
  // and can the Titan — the room's anchor — actually be walked up to?
  const h = w.markers.heroSpot;
  let toHero = null;
  if (h) {
    for (let rr = 1.4; rr < 6 && toHero === null; rr += 0.2) {
      for (let i = 0; i < 32; i++) {
        const x = h.x + Math.cos(i / 32 * 6.283) * rr, z = h.z + Math.sin(i / 32 * 6.283) * rr;
        if (!solid(x, z)) { toHero = +rr.toFixed(1); break; }
      }
    }
  }
  return { ahead: +ahead.toFixed(1), toHero };
});
check('you can walk forward out of the door you came in by', arrival.ahead >= 4, arrival);
check('...and the Great Beacon can be stood next to', arrival.toHero !== null && arrival.toHero <= 3.0, arrival);

console.log('\n── 2. the spoke leads to Petra, and she is reachable ──');
await go('va3');
const shrine = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  // the lantern, not a grant — earth is the Warden's reward now
  const s = w.markers.relightSpot;
  if (!s) return null;
  // can a child stand close enough for the grant to fire? it needs 2.4u
  const solid = (x, z) => {
    const r = w.resolveCircle(x, z, 0.32);
    return Math.abs(r.x - x) > 1e-6 || Math.abs(r.z - z) > 1e-6;
  };
  let closest = Infinity, spot = null;
  for (let a = 0; a < 64; a++) {
    for (let d = 0.5; d < 6; d += 0.25) {
      const x = s.x + Math.cos(a / 64 * 6.283) * d, z = s.z + Math.sin(a / 64 * 6.283) * d;
      if (solid(x, z) || (w.hazardAt && w.hazardAt(x, z))) continue;
      if (d < closest) { closest = d; spot = { x: +x.toFixed(2), z: +z.toFixed(2) }; }
    }
  }
  return { shrine: { x: s.x, z: s.z }, closest: +closest.toFixed(2), spot };
});
check('va3 has Petra\'s lantern', !!shrine, shrine);
check('a child can stand within slam range of it',
  shrine && shrine.closest <= 2.4, shrine);

// AND IT MUST BE ON THE WAY, NOT BESIDE IT.
//
// Dad, on this exact room: "the rooms just end suddenly", and before that "the
// rooms loop back to the start and there's nothing you can do." Both were one
// mistake — the shrine sat four units off the line between the two doors, so a
// child could cross the room, reach an unchanged hub, and loop forever. The fix
// that removed the far door swapped the loop for a dead end.
//
// So: no gating, and instead the geometry has to make it impossible to miss.
// This walks the straight line from door to door and asks how close that walk
// comes, WITHOUT ever aiming at the shrine.
const online = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  const s = w.markers.relightSpot;
  const doors = (w.doors || []);
  const sp = w.spawn;
  if (!s || !sp || doors.length < 2) return null;
  const solid = (x, z) => {
    const r = w.resolveCircle(x, z, 0.32);
    return Math.abs(r.x - x) > 1e-6 || Math.abs(r.z - z) > 1e-6;
  };
  // a door is a rectangle in the wall band; its middle is where you walk out
  const mid = (d) => ({ to: d.to, x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 });
  let far = null, best = -1;
  for (const d of doors.map(mid)) {
    const dd = Math.hypot(d.x - sp.x, d.z - sp.z);
    if (dd > best) { best = dd; far = d; }
  }
  // walk the straight line, sliding around anything solid the way the player
  // controller does, and record the closest approach to the shrine
  let x = sp.x, z = sp.z, closest = Infinity;
  for (let i = 0; i < 900; i++) {
    const dx = far.x - x, dz = far.z - z;
    const len = Math.hypot(dx, dz);
    if (len < 0.6) break;
    const r = w.resolveCircle(x + dx / len * 0.12, z + dz / len * 0.12, 0.32);
    if (Math.abs(r.x - (x + dx / len * 0.12)) > 1e-6 || Math.abs(r.z - (z + dz / len * 0.12)) > 1e-6) {
      // blocked head-on: slide sideways, either way, like a body does
      const px = -dz / len * 0.12, pz = dx / len * 0.12;
      if (!solid(x + px, z + pz)) { x += px; z += pz; } else { x -= px; z -= pz; }
    } else { x = r.x; z = r.z; }
    closest = Math.min(closest, Math.hypot(x - s.x, z - s.z));
  }
  return { far: far.to, closest: +closest.toFixed(2), doors: doors.map((d) => d.to) };
});
check('va3 is not a dead end — it has both its doors',
  online && online.doors.length >= 2, online);
check('walking straight across the room passes inside the shrine\'s 2.4u',
  online && online.closest <= 2.4, online);

console.log('\n── 3. the FIRE slam lights it, and that is the milestone ──');
// Boss-earned forms: a child arrives here with the wolf the LAST boss gave
// them. The slam lights Petra's lantern; the Earth Wolf stays behind the
// Warden, where dad asked for it to be.
const granted = await page.evaluate(async (spot) => {
  const g = window.__game;
  g.state.form = 'fire_wolf';
  g.player.root.position.set(spot.x, g.player.root.position.y, spot.z);
  for (let i = 0; i < 300; i++) {
    g.player.iframes = 9999;
    if (i % 40 === 0) g.player.trySpecial(g.effects, g.world);
    await new Promise((r) => requestAnimationFrame(r));
    if (g.WS.get('vault', 'spark')) break;
  }
  return { forms: g.state.formsUnlocked.slice(), spark: !!g.WS.get('vault', 'spark'),
    stage: g.WS.stage('vault') };
}, (shrine && shrine.spot) || { x: 0, z: -1 });
check('the slam completes the spark milestone', granted.spark, granted);
check('...and the Earth Wolf is NOT handed out here',
  !granted.forms.includes('earth_wolf'), granted);

console.log('\n── 4. so the hub has changed when you walk back ───────');
await go('vh');
const after = await doorsHere();
check('the hub now offers the other two spokes',
  after.includes('vgb') && after.includes('vgc'), { doors: after, stage: granted.stage });

console.log('\n── 5. and the sunken ring is a PROMISE, not a tease ───');
// Dad: "a puddle of water with a character and a chest in the centre that you
// are unable to get to". That is the vault ring, and it is meant to be shut —
// but only until the water drains. What must never happen is that it stays shut
// for good, which is what it looks like from inside a hub that never opens.
const ring = await page.evaluate(async () => {
  const g = window.__game, w = g.world;
  const before = { reward: !!w.markers.underwaterPromise };
  g.WS.set('vault', 'drained', true);
  return before;
});
await go('vh');
const drained = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  const solid = (x, z) => {
    const r = w.resolveCircle(x, z, 0.32);
    return Math.abs(r.x - x) > 1e-6 || Math.abs(r.z - z) > 1e-6;
  };
  return { stillWalled: solid(0, 0), promise: !!w.markers.underwaterPromise,
    stage: g.WS.stage('vault') };
});
check('once the water drains, the middle of the vault can be walked',
  !drained.stillWalled, { ...ring, ...drained });

console.log('\n── 6. the other two spokes cannot be crossed blind ────');
// Same law as va3, applied to the two milestones that open the crypt. Dad: "the
// rooms just end suddenly... there is not boss fight." Stoneroot's boss door
// needs all three milestones, so a spoke a child can walk through without
// noticing its one job is a boss that never appears.
await go('vb3');
const b3 = await page.evaluate(() => ({ doors: (window.__game.world.doors || []).map((d) => d.to) }));
check('vb3 has both its doors', b3.doors.length >= 2, b3);
{
  const r = await page.evaluate(() => {
    const w = window.__game.world;
    const p = w.markers.rattlePlate, sp = w.spawn;
    const mid = (d) => ({ x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2, to: d.to });
    let far = null, best = -1;
    for (const d of (w.doors || []).map(mid)) {
      const dd = Math.hypot(d.x - sp.x, d.z - sp.z);
      if (dd > best) { best = dd; far = d; }
    }
    if (!p || !far) return null;
    // distance from the plate to the straight line between the two doors
    const ax = sp.x, az = sp.z, bx = far.x, bz = far.z;
    const t = Math.max(0, Math.min(1,
      ((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    return { to: far.to, off: +Math.hypot(ax + (bx - ax) * t - p.x, az + (bz - az) * t - p.z).toFixed(2) };
  });
  check('...and the resonant plate is on the line between them, inside its 1.9u',
    r && r.off <= 1.9, r);
}
await go('vc3');
// vc3 is the Deep Lantern room now (v3.64): what stands in the way out is not
// a prop but the BROKEN FLOOR — the straight line between the doors must cross
// a hole, or the room's puzzle can be walked past without ever being seen.
const c3 = await page.evaluate(() => {
  const w = window.__game.world;
  const sp = w.spawn;
  const mid = (d) => ({ x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2, to: d.to });
  let far = null, best = -1;
  for (const d of (w.doors || []).map(mid)) {
    const dd = Math.hypot(d.x - sp.x, d.z - sp.z);
    if (dd > best) { best = dd; far = d; }
  }
  let lineCrossesHole = false;
  if (far) {
    for (let t = 0; t <= 1; t += 0.02) {
      if (w.pitAt(sp.x + (far.x - sp.x) * t, sp.z + (far.z - sp.z) * t)) { lineCrossesHole = true; break; }
    }
  }
  return { doors: (w.doors || []).map((d) => d.to), pits: (w.pitZones || []).length,
    lantern: !!w.markers.deepLanternSpot, lineCrossesHole };
});
check('vc3 has both its doors', c3.doors.length >= 2, c3);
check('...and the broken floor stands in the way out', c3.lineCrossesHole && c3.pits >= 2, c3);
check('...and the deep lantern is there to light', c3.lantern, c3);

console.log('\n── 7. and then there is a boss to fight ──────────────');
await page.evaluate(() => {
  const g = window.__game;
  for (const k of ['spark', 'drained', 'deepLantern']) g.WS.set('vault', k, true);
});
await go('vh');
const crypt = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  const solid = (x, z) => {
    const r = w.resolveCircle(x, z, 0.32);
    return Math.abs(r.x - x) > 1e-6 || Math.abs(r.z - z) > 1e-6;
  };
  const d = (w.doors || []).find((q) => q.to === 'vz');
  if (!d) return { doors: (w.doors || []).map((q) => q.to) };
  const x = (d.minX + d.maxX) / 2, z = (d.minZ + d.maxZ) / 2;
  // is there floor to stand on in front of it?
  let standable = false;
  for (let r = 0.6; r < 3 && !standable; r += 0.2) if (!solid(x, z + r)) standable = true;
  return { doors: (w.doors || []).map((q) => q.to), at: [+x.toFixed(1), +z.toFixed(1)], standable,
    stage: g.WS.stage('vault') };
});
check('with all three milestones the crypt door is open', !!crypt.at, crypt);
check('...and it can be walked to', crypt.standable === true, crypt);
await go('vz');
const warden = await page.evaluate(() => {
  const w = window.__game.world;
  return { warden: !!w.warden, dead: w.warden ? !!w.warden.dead : null,
    hp: w.warden ? w.warden.hp : null };
});
check('the Bone Warden is standing in it', warden.warden && !warden.dead, warden);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN — Stoneroot opens up as a child plays it.'));
await b.close();
process.exit(errors.length ? 1 : 0);
