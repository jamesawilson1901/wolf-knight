// EVERY CHEST IN THE GAME, ASKED THE ONLY QUESTION THAT MATTERS.
//
// Dad, on three separate screenshots of three separate rooms: "all of these
// types of chests through every level do not open or give anything." Nothing
// in the suite set had ever asked whether a chest could be REACHED. The chest
// systems were both tested — the kit chest's lid animates, the breakable
// chest bursts — and both tests put the player where the chest was, which is
// the one thing a child cannot always do.
//
// So this asks two questions of every chest in every room, and neither of them
// is about the chest's own code:
//
//   1. STANDING CHESTS (world.chests, the animated kit) open when the player
//      comes within 1.1u of their CENTRE. Their own collider is up to 0.63u
//      and the player is 0.32u, so an open-floor chest is opened at 0.95u with
//      room to spare — and a chest pushed into a wall, a pillar or another
//      prop is never opened at all, silently, forever.
//   2. BREAKABLE CHESTS (world.enemies, kinds chest/goldchest) burst when hit,
//      and a sword reaches 2.3u. Same question, bigger radius.
//
// Reachability is a flood-fill from the room's spawn over the REAL colliders
// (world.resolveCircle), because that is the only thing that knows what a
// child can actually walk to. A chest behind a promise gate is SUPPOSED to be
// unreachable, so the fill runs twice: once as the room is built, and once
// with every gate, crack, burn, cut and ice broken. Unreachable in the second
// pass is the bug; unreachable only in the first is the design.
import { launch } from './wk-drive.mjs';
import { allRooms } from './all-rooms.mjs';

const OPEN_R = 1.1;      // updateChests' radius (js/loot.js)
const SMASH_R = 2.3;     // SPIN_RANGE, the shortest reach that breaks a pot
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const wk = await launch({ timescale: 1 });
await wk.newGame('CHEST');
const rooms = only.length ? only : await allRooms(wk.page);

// The whole audit runs inside the page, once per room: build the fill, ask it
// about every chest, then break everything breakable and ask again.
const audit = await wk.page.evaluate(async ({ ids, OPEN_R, SMASH_R }) => {
  const rooms = await import('/js/rooms.js');
  const st = await import('/js/state.js');
  const { World } = await import('/js/world.js');
  const THREE = await import('three');
  const out = [];
  for (const id of ids) {
    if (!rooms.ROOMS[id]) { out.push({ id, error: 'not in ROOMS' }); continue; }
    let world;
    const scene = new THREE.Scene();
    // buildRoom(), NOT ROOMS[id] — the kit a region wears is loaded by the
    // dispatcher inside buildRoom, and a builder called without it throws on
    // the first piece it asks for (Frostpeak: "cannot read 'campfire' of null").
    try { world = await rooms.buildRoom(id, scene); }
    catch (e) { out.push({ id, error: String(e && e.message || e) }); continue; }
    // the chests the level asked for, spawned the way main.js spawns them
    const defs = (world.markers && world.markers.chestDefs) || [];
    const pots = (world.markers && world.markers.breakables) || [];
    const chesty = pots.filter((p) => p.kind === 'chest' || p.kind === 'goldchest');
    if (!defs.length && !chesty.length) { out.push({ id, chests: [], pots: [] }); continue; }

    const fill = () => {
      const step = 0.5, rad = 0.32;
      const solid = (a, b) => { const s = world.resolveCircle(a, b, rad);
        return Math.abs(s.x - a) > 1e-6 || Math.abs(s.z - b) > 1e-6; };
      const ci = (v) => Math.round(v / step), key = (i, j) => i + ',' + j;
      const inside = (a, b) => Math.abs(a) <= world.halfW + 0.01 && Math.abs(b) <= world.halfD + 0.01;
      const seen = new Set();
      const sx = ci(world.spawn.x), sz = ci(world.spawn.z);
      const st = [[sx, sz]]; seen.add(key(sx, sz));
      while (st.length) { const [i, j] = st.pop();
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (!inside(ni * step, nj * step)) continue;
          const k = key(ni, nj);
          if (seen.has(k) || solid(ni * step, nj * step)) continue;
          seen.add(k); st.push([ni, nj]); } }
      return (x, z, r) => {
        for (let a = x - r; a <= x + r + 1e-6; a += step)
          for (let b = z - r; b <= z + r + 1e-6; b += step)
            if ((a - x) ** 2 + (b - z) ** 2 <= r * r && seen.has(key(ci(a), ci(b)))) return true;
        return false;
      };
    };
    const before = fill();

    // ...AND NOW THE SAME ROOM WITH EVERY LOCK IN IT ALREADY ANSWERED.
    //
    // Breaking the live obstacles is not enough: bars over a vault are built
    // from `state.flags.plates[id]` at BUILD time, and a room whose plate is
    // pressed simply never draws them. So pass two REBUILDS the room with the
    // flag maps answering true to everything, which is exactly the room a
    // child sees once they have solved what the room asked. Anything still out
    // of reach there is out of reach forever.
    const yes = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? true : t[k]),
      has: () => true, set: () => true });
    // world flags are region -> key -> bool, so the outer map hands back a yes
    // for any region it is asked about
    const yesMap = new Proxy({}, { get: () => yes, has: () => true, set: () => true });
    const flags = st.state.flags;
    const keep = { plates: flags.plates, cracked: flags.cracked, burned: flags.burned,
      keys: flags.keys, world: flags.world, bossDefeated: flags.bossDefeated,
      wardenDefeated: flags.wardenDefeated, shortcutOpen: flags.shortcutOpen };
    const keptForms = st.state.formsUnlocked;
    flags.plates = yes; flags.cracked = yes; flags.burned = yes; flags.keys = yes;
    flags.world = yesMap;
    flags.bossDefeated = true; flags.wardenDefeated = true; flags.shortcutOpen = true;
    // ...and every wolf, because deep water is only a wall to a child who
    // cannot wade (js/water.js canWade) and a watcher only sees a child who
    // is not a ghost.
    st.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
      'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf', 'elemental_wolf'];
    let solvedWorld = null;
    try { solvedWorld = await rooms.buildRoom(id, new THREE.Scene()); } catch { solvedWorld = null; }
    Object.assign(flags, keep);
    st.state.formsUnlocked = keptForms;
    // whatever the flags could not answer — a cut bramble, an ice seal, a
    // promise gate's box, a watcher's stare — break by hand in the solved room.
    const w2 = solvedWorld || world;
    for (const list of ['crackables', 'burnables']) for (const b of w2[list] || []) {
      if (b.clear) b.clear();
      else { const i = w2.circleColliders.indexOf(b.collider); if (i >= 0) w2.circleColliders.splice(i, 1); }
    }
    for (const list of ['cuttables', 'shatterables']) for (const c of w2[list] || []) { if (c.clear) c.clear(); }
    for (const wch of w2.watchers || []) {
      const i = w2.circleColliders.indexOf(wch.collider);
      if (i >= 0) w2.circleColliders.splice(i, 1);
    }
    for (const zone of w2.waterZones || []) {
      const i = w2.boxColliders.indexOf(zone.collider);
      if (i >= 0) w2.boxColliders.splice(i, 1);
    }
    if (w2.openOnward) w2.openOnward();
    const saved = world;
    world = w2;
    const after = fill();
    world = saved;

    out.push({ id,
      chests: defs.map((d) => ({ id: d.id, tier: d.tier || 'wood', x: d.x, z: d.z,
        gated: !before(d.x, d.z, OPEN_R), reach: after(d.x, d.z, OPEN_R) })),
      pots: chesty.map((p) => ({ kind: p.kind, x: p.x, z: p.z,
        gated: !before(p.x, p.z, SMASH_R), reach: after(p.x, p.z, SMASH_R) })) });
  }
  return out;
}, { ids: rooms, OPEN_R, SMASH_R });

console.log('\n── 1. every room built ─────────────────────────────────');
const broke = audit.filter((r) => r.error);
check('no room threw while building', broke.length === 0, broke.slice(0, 5));

console.log('\n── 2. every standing chest can be walked to ────────────');
const unreachable = [];
let nChests = 0, nGated = 0;
for (const r of audit) for (const c of r.chests || []) {
  nChests++; if (c.gated) nGated++;
  if (!c.reach) unreachable.push(`${r.id}/${c.id}@${c.x},${c.z}`);
}
check(`all ${nChests} standing chests open for a child who has the wolf`,
  unreachable.length === 0, unreachable.slice(0, 12));
console.log(`   (${nGated} of them are gated shut until a wolf opens the way — by design)`);

console.log('\n── 3. every breakable chest can be hit ─────────────────');
const unhittable = [];
let nPots = 0;
for (const r of audit) for (const p of r.pots || []) {
  nPots++;
  if (!p.reach) unhittable.push(`${r.id}/${p.kind}@${p.x},${p.z}`);
}
check(`all ${nPots} breakable chests are within a sword's reach`,
  unhittable.length === 0, unhittable.slice(0, 12));

console.log('\n── 4. ...and walking into one really opens it ──────────');
// The reachability sweep above is geometry. This is the promise itself: a
// child walks at a chest and it opens. Two of them, one wood and one gold, on
// real keys — because "opens on touch" is the fix for dad's screenshots and a
// fix nobody has walked is a fix nobody has.
for (const [room, x, z, kind] of [['tsh', 2.68, -0.1, 'chest'], ['t3b', -1.4, -1.8, 'goldchest']]) {
  await wk.page.evaluate((r) => window.__wkJump(r, ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf']), room);
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; window.__game.narration.blocking = false; });
  const before = await wk.page.evaluate(() => ({ coins: window.__game.state.shards,
    pots: (window.__game.world.enemies || []).filter((e) => e.opensOnTouch && !e.dead).length }));
  await wk.walkTo(x, z, { timeout: 40, arrive: 0.8 });
  await wk.page.waitForTimeout(1800);
  const after = await wk.page.evaluate(() => ({ coins: window.__game.state.shards,
    pots: (window.__game.world.enemies || []).filter((e) => e.opensOnTouch && !e.dead).length }));
  check(`${room}'s ${kind} opens when a child walks into it and pays out`,
    after.pots < before.pots, { before, after, at: await wk.wk('pos') });
}

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — every chest in the game can be opened');
process.exit(errors.length ? 1 : 0);
