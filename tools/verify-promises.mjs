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
import { launchBrowser } from './launch.mjs';
const errors = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : ''); if (!ok) errors.push(n); };

const b = await launchBrowser();
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
    try { await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1, room, { timeout: 45000 }); return true; } catch {}
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
const W = -Math.PI / 2, E = Math.PI / 2, N = Math.PI;

const GATES = [
  // `la`'s own crack ('l1_crack_gate') USED to belong here: stomp it, and the
  // reward sat immediately behind it in the same room. v3.130
  // (design/WIDER-WORLD.md §2.4) made it a DOOR to the Ash Vault instead —
  // `l1_crack_promise` now lives in `lv1`, a different room, so this table's
  // own claim ("the verb makes THIS ROOM'S reward reachable") no longer
  // holds. The gate itself still gets driven, generically, by the roll-call
  // fallback below; the door it opens is `verify-ashvault.mjs`'s claim now.
  { room: 'lb2', name: 'L1 · the scorched barricade', chest: 'l1_scorched', gate: 'l1_scorched_gate',
    form: 'fire_wolf',    gx: 1,  gz: 0,  ox: 2.2, oz: 0, ry: W },
  { room: 'vc2', name: 'L2 · the thorn tangle',   chest: 'l2_vc2_bramble', gate: 'l2_bramble_gate',
    form: 'verdant_wolf', gx: 11, gz: -3, ox: -2.4, oz: 0, ry: E },
  { room: 't1b', name: 'L3 · the thorn wall',     chest: 'l3_t1b_bramble', gate: 'w3_thorn_wall',
    form: 'verdant_wolf', gx: -11, gz: -6, ox: 2.4, oz: 0, ry: W },
  { room: 't1b', name: 'L3 · the ice-sealed spring', chest: 'l3_t1b_ice', gate: 'l3_spring_ice',
    form: 'frost_wolf',   gx: 11, gz: 4,  ox: -2.4, oz: 0, ry: E },
  // THE NIGHT ROAD's two, added the day it shipped (js/levelNight.js). This
  // list is hand-kept and cannot be derived — the approach geometry (where a
  // child stands and which way they face to swing) is nowhere in the game
  // data — so the only defence against it rotting is adding the entry with the
  // gate. Ember Deep's burn nooks are still missing from it.
  { room: 'n1', name: 'Night Road · the thorn nook', chest: 'n1_thorn_prize', gate: 'n1_thorn',
    form: 'fire_wolf',    gx: 13.5, gz: -7, ox: 0, oz: 2.2, ry: N },
  { room: 'n2', name: 'Night Road · the wardstone crack', chest: 'n2_crack_prize', gate: 'n2_wardstone_crack',
    form: 'earth_wolf',   gx: -11.5, gz: -1, ox: 2.4, oz: 0, ry: W },
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

// ---------------------------------------------------------------------------
console.log('\n── l1_crack resolves on the dungeon, not the gate (v3.130) ────');
// design/WIDER-WORLD.md §2.4: cracking la's wall used to BE the promise. It
// is the door to the Ash Vault now, so the ??? card must stay open until the
// dungeon behind it is actually cleared — main.js's PROMISES row for
// `l1_crack` was rewritten from `state.flags.cracked.l1_crack_gate` to
// `WS.get('ember','dungeon')` for exactly this, and nothing above exercises
// a `done()` condition on its own — every other check here is about the gate
// opening, not the mystery card resolving.
await page.evaluate(() => { const g = window.__game;
  g.state.flags.cracked = {}; g.state.flags.world = {}; g.state.flags.mysteries = {}; });
if (await go('la')) {
  await page.evaluate(() => {
    const g = window.__game;
    g.state.flags.cracked.l1_crack_gate = true;   // the gate breaks...
    const spot = g.world.markers.crackPromise;
    g.player.root.position.set(spot.x, g.player.root.position.y, spot.z);
  });
  await page.waitForTimeout(300);   // narrationTriggers() logs the ??? card
  const afterGate = await page.evaluate(() => {
    const g = window.__game;
    return { logged: !!(g.state.flags.mysteries && g.state.flags.mysteries.l1_crack),
      found: !!(g.state.flags.mysteries && g.state.flags.mysteries.l1_crack
        && g.state.flags.mysteries.l1_crack.found) };
  });
  check('the ??? card is logged once the gate breaks', afterGate.logged, afterGate);
  check('...but NOT resolved by the gate alone', afterGate.found === false, afterGate);

  await page.evaluate(() => { window.__game.WS.complete('ember', 'dungeon'); });
  await page.waitForTimeout(300);
  const afterDungeon = await page.evaluate(() => {
    const g = window.__game;
    return !!(g.state.flags.mysteries && g.state.flags.mysteries.l1_crack
      && g.state.flags.mysteries.l1_crack.found);
  });
  check('...and IS resolved once the dungeon is cleared', afterDungeon === true);
} else check('enter la', false);

// ---------------------------------------------------------------------------
console.log('\n── the roll call: is every gate in the game in this file? ──');
// The GATES table above cannot be derived — the approach geometry (where a
// child stands and which way they face to swing) is nowhere in the game data —
// and its own comment already recorded it rotting once. A list that cannot be
// derived can still be CHECKED. js/levelkit.js's promiseGate signs a register
// (`world.promiseGates`) as it builds; this walks the whole live room registry
// and names anything in that register the table above has never heard of.
const { allRooms } = await import('./all-rooms.mjs');
const everyGate = await page.evaluate(async (ids) => {
  const rooms = await import('/js/rooms.js');
  const THREE = await import('three');
  const st = await import('/js/state.js');
  // built with NOTHING opened, so a gate that only exists while shut is seen
  for (const k of Object.keys(st.state.flags)) {
    if (typeof st.state.flags[k] === 'boolean') st.state.flags[k] = false;
  }
  st.state.flags.cracked = {}; st.state.flags.burned = {}; st.state.flags.world = {};
  const out = [];
  for (const id of ids) {
    let w;
    try { w = await rooms.buildRoom(id, new THREE.Scene()); } catch { continue; }
    for (const g of (w.promiseGates || [])) out.push({ room: id, id: g.id, system: g.system });
  }
  return out;
}, await allRooms(page));
const named = new Set(GATES.map((g) => g.gate));
// 'none' gates open by being walked (Stormreach's sea cave is water, not a
// verb) — there is no tool to drive, so they are outside this suite's remit.
const undriven = everyGate.filter((g) => g.system !== 'none' && !named.has(g.id));
for (const g of everyGate) console.log(`   ${g.room.padEnd(5)} ${g.system.padEnd(8)} ${g.id}${named.has(g.id) ? '   (driven in full above)' : g.system === 'none' ? '   (opens by walking — not a verb)' : ''}`);

// ---------------------------------------------------------------------------
console.log('\n── ...and the other ' + undriven.length + ', driven automatically ──');
//
// THE HAND-KEPT TABLE STOPPED BEING THE ONLY WAY IN (2026-09-08).
//
// GATES above drives seven gates in FULL — the reward behind each one is
// unreachable, the verb makes it reachable, the geometry leaves the room, it
// stays open after a rebuild. That needs the chest id and the exact spot a
// child stands, neither of which is anywhere in the game data, so it is
// hand-kept and it has rotted once already. There were twenty gates and seven
// entries, and this suite has been a red line in tools/known-fail.txt on
// account of the thirteen.
//
// The thirteen do not need the hand data for the part that matters. Everything
// promiseGate() itself knows — where the gate is, how big it is, which system
// it belongs to — it writes into `world.promiseGates`, and the verb follows
// from the system. So the approach is COMPUTED: stand off the gate's short
// axis on whichever side the room has floor, face it, swing. If the geometry
// goes, the gate is wired to the tool it advertises, which is this file's
// entire claim.
//
// It is a weaker check than the seven above and it is deliberately not
// pretending otherwise — no chest, no before/after reachability. It is the
// difference between thirteen gates checked shallowly and thirteen gates not
// checked at all.
const VERB = { crack: 'earth_wolf', burn: 'fire_wolf', cut: 'verdant_wolf', shatter: 'frost_wolf' };
const ALL_FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
for (const g of undriven) {
  const form = VERB[g.system];
  if (!form) { check(`${g.id}: has a verb this suite can drive`, false, g); continue; }
  await page.evaluate((f) => { const gg = window.__game;
    gg.state.formsUnlocked = f;
    gg.state.flags.cracked = {}; gg.state.flags.burned = {}; gg.state.flags.world = {};
  }, ALL_FORMS);
  if (!(await go(g.room))) { check(`enter ${g.room} for ${g.id}`, false); continue; }
  const out = await page.evaluate(async (a) => {
    const gg = window.__game, w = gg.world;
    const s = () => new Promise((r) => requestAnimationFrame(r));
    const gate = (w.promiseGates || []).find((x) => x.id === a.id);
    if (!gate) return { missing: 'gate' };
    let entry = null;
    for (const key of ['crackables', 'burnables', 'cuttables', 'shatterables']) {
      const e = (w[key] || []).find((c) => c.id === a.id);
      if (e) { entry = e; break; }
    }
    if (!entry) return { missing: 'register' };
    // stand off the SHORT axis — the way through a gate is across its thin
    // dimension — and try both sides, because which one the room has floor on
    // is a per-room fact and nothing records it.
    const thinX = gate.w <= gate.d;
    const off = (thinX ? gate.w : gate.d) / 2 + 1.9;
    const sides = thinX
      ? [[off, 0, -Math.PI / 2], [-off, 0, Math.PI / 2]]
      : [[0, off, Math.PI], [0, -off, 0]];
    let fired = false;
    for (const [ox, oz, ry] of sides) {
      gg.state.form = a.form;
      gg.player.root.position.set(gate.x + ox, gg.player.root.position.y, gate.z + oz);
      gg.player.root.rotation.y = ry;
      gg.player.specialCooldown = 0; gg.player.lockTime = 0;
      for (let i = 0; i < 3; i++) { w.animate(i * 0.05, 0.05); await s(); }
      if (gg.player.trySpecial(gg.effects, w)) fired = true;
      for (let i = 0; i < 4; i++) await s();
      // a crack or a burn scatters its chunks over 0.8s before the group drops
      for (let i = 0; i < 40 && entry.group && entry.group.parent; i++) {
        w.animate(i * 0.05, 0.05);
        if (i % 4 === 3) await s();
      }
      if (!(entry.group && entry.group.parent)) break;
    }
    return { fired, stillDrawn: !!(entry.group && entry.group.parent) };
  }, { id: g.id, form });
  check(`${g.room} · ${g.id} (${g.system}) opens to the ${form.replace('_', ' ')}`,
    !out.missing && out.stillDrawn === false, out);
}
check(`every promise gate in the game is driven (${everyGate.length} found, `
  + `${GATES.length} in full, ${undriven.length} automatically)`, true);

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED\n' + errors.join('\n') : '✓ all promise gates open to the tool they advertise'));
await b.close();
process.exit(errors.length ? 1 : 0);
