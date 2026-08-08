// A8 — THE PROMISE GATES.
//
// A "come back later" gate makes two claims to a child: the reward behind it
// is NOT reachable yet, and the tool it advertises WILL open it. Until v3.27
// both claims were false — promiseGate() registered with no gate system at
// all, and every gate sat loose in the middle of a room you could simply walk
// around. This asserts both claims, per gate, by flood-filling the room's real
// colliders from the real spawn and then driving the real verb.
//
// Nothing here removes a collider by hand.
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
await page.fill('#t-name', 'PROMISE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
  g.player.iframes = 99999;
});
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5; g.player.hurt(99, { pierceDefend: true }); }, room);
    try { await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1, room, { timeout: 45000 }); return true; } catch {}
  }
  return false;
};

// The flood fill runs in the page against world.boxColliders / circleColliders
// — the same two arrays the player's own collision resolution reads.
const REACH = `(chestX, chestZ) => {
  const w = window.__game.world;
  const R = 0.34, STEP = 0.4;
  const free = (x, z) => {
    for (const b of w.boxColliders) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < R * R) return false;
    }
    for (const c of w.circleColliders) {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + R) * (c.r + R)) return false;
    }
    return true;
  };
  const key = (i, j) => i + ',' + j;
  const si = Math.round(w.spawn.x / STEP), sj = Math.round(w.spawn.z / STEP);
  const seen = new Set([key(si, sj)]);
  const q = [[si, sj]];
  let best = 1e9;
  const LIM = 60;   // ±24u — bigger than any module
  while (q.length) {
    const [i, j] = q.pop();
    const x = i * STEP, z = j * STEP;
    const d = Math.hypot(x - chestX, z - chestZ);
    if (d < best) best = d;
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const ni = i + di, nj = j + dj;
      if (Math.abs(ni) > LIM || Math.abs(nj) > LIM) continue;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      seen.add(k);
      if (free(ni * STEP, nj * STEP)) q.push([ni, nj]);
    }
  }
  return { nearest: +best.toFixed(2), cells: seen.size };
}`;

const chestAt = (room, id) => page.evaluate((cid) => {
  const defs = window.__game.world.markers.chestDefs || [];
  const d = defs.find((c) => c.id === cid);
  return d ? { x: d.x, z: d.z } : null;
}, id);

// Drive the advertised verb from a spot a child could actually stand on:
// `standAt` is an offset from the gate, `face` the rotation to look at it.
const useVerb = (form, gx, gz, ox, oz, ry) => page.evaluate(async (a) => {
  const g = window.__game;
  const s = () => new Promise((r) => requestAnimationFrame(r));
  g.state.form = a.form;
  g.player.root.position.set(a.gx + a.ox, g.player.root.position.y, a.gz + a.oz);
  g.player.root.rotation.y = a.ry;
  g.player.specialCooldown = 0; g.player.lockTime = 0;
  // the world must have stepped at least once at this position: the frost
  // breath and the lash both read cached player state
  for (let i = 0; i < 3; i++) { g.world.animate(i * 0.05, 0.05); await s(); }
  const fired = g.player.trySpecial(g.effects, g.world);
  for (let i = 0; i < 4; i++) await s();
  return fired;
}, { form, gx, gz, ox, oz, ry });

// facings: forward is (sin ry, cos ry) — ry 0 faces +z, PI faces -z,
// PI/2 faces +x, -PI/2 faces -x.
const W = -Math.PI / 2, E = Math.PI / 2;

const GATES = [
  { room: 'la',  name: 'L1 · the cracked wall',   chest: 'l1_crack_promise', gate: 'l1_crack_gate',
    form: 'earth_wolf',   gx: -11, gz: -4, ox: 2.2, oz: 0, ry: W },
  { room: 'lb2', name: 'L1 · the scorched barricade', chest: 'l1_scorched', gate: 'l1_scorched_gate',
    form: 'fire_wolf',    gx: 1,  gz: 0,  ox: 2.2, oz: 0, ry: W },
  { room: 'vc2', name: 'L2 · the thorn tangle',   chest: 'l2_vc2_bramble', gate: 'l2_bramble_gate',
    form: 'verdant_wolf', gx: 11, gz: -3, ox: -2.4, oz: 0, ry: E },
  { room: 't1b', name: 'L3 · the thorn wall',     chest: 'l3_t1b_bramble', gate: 'w3_thorn_wall',
    form: 'verdant_wolf', gx: -11, gz: -6, ox: 2.4, oz: 0, ry: W },
  { room: 't1b', name: 'L3 · the ice-sealed spring', chest: 'l3_t1b_ice', gate: 'l3_spring_ice',
    form: 'frost_wolf',   gx: 11, gz: 4,  ox: -2.4, oz: 0, ry: E },
];

for (const G of GATES) {
  console.log('\n── ' + G.name + ' (' + G.room + ') ' + '─'.repeat(Math.max(2, 40 - G.name.length)));
  // a fresh profile-less state for each gate: no flags carried over
  await page.evaluate(() => { const g = window.__game;
    g.state.flags.cracked = {}; g.state.flags.burned = {}; g.state.flags.world = {}; g.state.flags.mysteries = {}; });
  if (!(await go(G.room))) { check('enter ' + G.room, false); continue; }

  const chest = await chestAt(G.room, G.chest);
  check('the reward is placed behind it', !!chest, chest);
  if (!chest) continue;

  const shut = await page.evaluate(([fn, cx, cz]) => eval(fn)(cx, cz), [REACH, chest.x, chest.z]);
  check('SHUT: the reward cannot be walked to', shut.nearest > 1.2, shut);

  const fired = await useVerb(G.form, G.gx, G.gz, G.ox, G.oz, G.ry);
  check('the advertised verb fires as ' + G.form, fired === true);

  const open = await page.evaluate(([fn, cx, cz]) => eval(fn)(cx, cz), [REACH, chest.x, chest.z]);
  check('OPEN: the same verb makes it reachable', open.nearest < 1.2, open);

  // ...and it has to LOOK open. flattenStatic() merges anything it does not
  // recognise as gameplay-held, so a gate whose entry names no Object3D gets
  // baked into the static batch and clears its collider while still being
  // drawn — an invisible wall's exact opposite, and just as confusing.
  // A cut or a shatter clears its own group at once; a crack or a burn hands
  // the group to World._shatter, which scatters the chunks over 0.8s and drops
  // it at the end — so this waits for the break-apart rather than assuming it
  // is instant. `world.animate` is stepped directly because the main loop's dt
  // is clamped, and at SwiftShader's ~2fps 0.8 game-seconds is ~16 frames.
  const gone = await page.evaluate(async (gid) => {
    const w = window.__game.world;
    const s = () => new Promise((r) => requestAnimationFrame(r));
    let entry = null, list = null;
    for (const key of ['crackables', 'burnables', 'cuttables', 'shatterables']) {
      const e = (w[key] || []).find((c) => c.id === gid);
      if (e) { entry = e; list = key; break; }
    }
    if (!entry) return { missing: true };
    for (let i = 0; i < 40 && entry.group && entry.group.parent; i++) {
      w.animate(i * 0.05, 0.05);
      if (i % 4 === 3) await s();
    }
    return { list, held: !!entry.group, stillDrawn: !!(entry.group && entry.group.parent) };
  }, G.gate);
  check('the gate registered with a real gate system', !gone.missing && gone.held, gone);
  check('and its geometry actually left the room', gone.stillDrawn === false, gone);

  // ...and it stays open. Re-entering must not rebuild the gate.
  await go(G.room === 't1b' ? 't1a' : (G.room === 'la' ? 'lg1' : 'lb'));
  await go(G.room);
  const again = await page.evaluate(([fn, cx, cz]) => eval(fn)(cx, cz), [REACH, chest.x, chest.z]);
  check('and it is STILL open after leaving and coming back', again.nearest < 1.2, again);
}

console.log('\n── the map remembers every promise ────────────────────');
await page.evaluate(() => { const g = window.__game;
  g.state.flags.cracked = {}; g.state.flags.burned = {}; g.state.flags.world = {}; g.state.flags.mysteries = {}; });
const MARKED = [
  ['la', 'crackPromise', 'l1_crack'], ['lb2', 'firePromise', 'l1_scorched'],
  ['vc2', 'bramblePromise', 'l2_bramble'], ['t1b', 'thornPromise', 'l3_thorn'],
  ['t1b', 'icePromise', 'l3_spring'], ['t3a', 'rootWallPromise', 'l3_rootwall'],
  ['t4a', 'logPromise', 'l3_greatlog'], ['vh', 'underwaterPromise', 'l2_sunken'],
];
for (const [room, marker, id] of MARKED) {
  if (!(await go(room))) { check('enter ' + room, false); continue; }
  const got = await page.evaluate(async (a) => {
    const g = window.__game;
    const s = () => new Promise((r) => requestAnimationFrame(r));
    const spot = g.world.markers[a.marker];
    if (!spot) return { missing: true };
    g.player.root.position.set(spot.x, g.player.root.position.y, spot.z);
    for (let i = 0; i < 8; i++) await s();
    return { logged: !!(g.state.flags.mysteries && g.state.flags.mysteries[a.id]) };
  }, { marker, id });
  check(room + ' · ' + marker + ' lands on the map as ???', got.logged === true, got);
}

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED\n' + errors.join('\n') : '✓ all promise gates open to the tool they advertise'));
await b.close();
process.exit(errors.length ? 1 : 0);
