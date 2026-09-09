// IS THE WORLD A LOOP? — design/WIDER-WORLD.md §5.5, slice v3.129.
//
// The world graph has only ever existed as `sideDoor` calls scattered across
// eleven level files, so "does this cross-link actually work, both ways,
// only when it should" could not be asked without a human walking every one
// of them by hand. This is that question, asked once, over the live game:
// jump to each side of every named cross-link with its gate on and off and
// read `world.doors` directly, then BFS the whole door graph from the Den to
// answer "is the Den reachable" and "does it cost a fight to get there" —
// both true today, neither ever checked.
//
// SHIPS WITH THE FIRST DOOR (v3.129: `den↔vh`, `ddp↔dlg`), and grows as each
// later slice's own loop lands — the LINKS table below is the whole surface
// a new entry needs. `tf3↔f1b` joined in v3.134. `lb2→q2` (§5.1's other row)
// is not in it: that room does not exist yet, and a link cannot be tested
// before it ships.
import { launch } from './wk-drive.mjs';
import { allRooms, LEGACY } from './all-rooms.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf',
  'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];

const wk = await launch({ dev: true });
const { page } = wk;
await wk.newGame('LOOPS');
// SET ONCE, THEN NEVER PASS FORMS TO jump() AGAIN. `__wkJump(room, forms)`
// (js/main.js) does `if (forms) state.formsUnlocked = forms` — every earlier
// draft of this file called `wk.jump(room, ALL)` on every hop, which reset
// tide_wolf back into formsUnlocked on the very next jump and made the
// canWade link's own "off" half untestable (it measured true regardless of
// what the link's `set(false)` had just done). One setup here, then bare
// `wk.jump(room)` throughout, so each link's `set(v)` is the only thing
// touching formsUnlocked from here on.
await page.evaluate((f) => { window.__game.state.formsUnlocked = f; }, ALL);

const doorsOf = (room) => page.evaluate(() => window.__game.world.doors.map((d) => d.to));
const hasDoor = async (room, to) => (await doorsOf(room)).includes(to);

// ---------------------------------------------------------------------------
console.log('── 1 · every shipped cross-link, both ways, only when it should ──');
// ---------------------------------------------------------------------------
// Each `set(v)` runs inside the page. `oneWay` links (the boss-arena exits)
// only ever open forward — Tam's law that no door offers a way out of a
// fight already covers the return trip, so there is nothing to assert there.
const LINKS = [
  { name: 'le → la (region 1 boss exit)', a: 'le', b: 'la', oneWay: true,
    set: (v) => { window.__game.state.flags.bossDefeated = v; } },
  { name: 'den ↔ vh (v3.129, WS.stage(vault) >= 1)', a: 'den', b: 'vh',
    set: (v) => { window.__game.WS.set('vault', 'spark', v); } },
  { name: 't1a ↔ tsA (wild3 logDown)', a: 't1a', b: 'tsA',
    set: (v) => { window.__game.WS.set('wild3', 'logDown', v); } },
  { name: 't4a ↔ tsA (wild3 logDown)', a: 't4a', b: 'tsA',
    set: (v) => { window.__game.WS.set('wild3', 'logDown', v); } },
  { name: 't2a ↔ tsB (wild3 rootCut)', a: 't2a', b: 'tsB',
    set: (v) => { window.__game.WS.set('wild3', 'rootCut', v); } },
  { name: 't3a ↔ tsB (wild3 rootCut)', a: 't3a', b: 'tsB',
    set: (v) => { window.__game.WS.set('wild3', 'rootCut', v); } },
  { name: 's1a ↔ ssA (storm windBridge)', a: 's1a', b: 'ssA',
    set: (v) => { window.__game.WS.set('storm', 'windBridge', v); } },
  { name: 's4a ↔ ssA (always open)', a: 's4a', b: 'ssA', alwaysOn: true,
    set: () => {} },
  { name: 'tf3 ↔ f1b (v3.134, always open)', a: 'tf3', b: 'f1b', alwaysOn: true,
    set: () => {} },
  // The gate lives on d1a's SIDE, not dlg's: dlg's own four doors to
  // d1a-d4a are unconditional (a child already standing in dlg — which
  // required wade to enter — can always leave), so `a` has to be the
  // district room whose door INTO the lagoon is the one wade actually
  // guards, or "shut when false" tests the wrong door and always passes.
  { name: 'd1a ↔ dlg (canWade)', a: 'd1a', b: 'dlg',
    set: (v) => {
      const f = window.__game.state.formsUnlocked;
      const i = f.indexOf('tide_wolf');
      if (v && i < 0) f.push('tide_wolf');
      if (!v && i >= 0) f.splice(i, 1);
    } },
  { name: 'ddp ↔ dlg (v3.129, meriDefeated)', a: 'ddp', b: 'dlg',
    set: (v) => { window.__game.state.flags.meriDefeated = v; } },
];

for (const link of LINKS) {
  if (link.alwaysOn) {
    await wk.jump(link.a);
    const fwd = await hasDoor(link.a, link.b);
    await wk.jump(link.b);
    const back = await hasDoor(link.b, link.a);
    check(`${link.name}: works both ways`, fwd && back, { fwd, back });
    continue;
  }
  await page.evaluate(link.set, false);
  await wk.jump(link.a);
  const aOff = await hasDoor(link.a, link.b);
  check(`${link.name}: shut when its gate is false`, !aOff, { room: link.a, doors: await doorsOf(link.a) });

  await page.evaluate(link.set, true);
  await wk.jump(link.a);
  const aOn = await hasDoor(link.a, link.b);
  check(`${link.name}: ${link.a} → ${link.b} opens when its gate is true`, aOn, aOn);
  if (!link.oneWay) {
    await wk.jump(link.b);
    const bOn = await hasDoor(link.b, link.a);
    check(`${link.name}: ${link.b} → ${link.a} opens the same way`, bOn, bOn);
  }
  // leave the gate however this link's own default is (open, so later links
  // in the table and the BFS below see a normal late-game world) — each
  // link sets its OWN gate, so this cannot leave a stale flag for the next.
}

// ---------------------------------------------------------------------------
console.log('\n── 2 · the Den is reachable, and combat-free ─────────────────');
// ---------------------------------------------------------------------------
// Everything unlocked: a gate that is MEANT to be shut is design, and only a
// missing door should be able to fail this. Every LINK above is left open
// from the loop that just ran; this adds the boss flags and region
// restorations LINKS didn't already cover, so every optional loop in the
// game is live for the graph below.
await page.evaluate(() => {
  const g = window.__game;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  for (const f of ['bossDefeated', 'wardenDefeated', 'sylvaDefeated', 'borealDefeated',
    'ariaDefeated', 'meriDefeated', 'grimmFreed']) g.state.flags[f] = true;
  for (const k of ['ember', 'stone', 'wild', 'frost', 'storm', 'vale', 'court']) {
    g.WS.set(k, 'restored', true);
  }
  g.WS.set('vault', 'spark', true);
  g.WS.set('wild3', 'logDown', true);
  g.WS.set('wild3', 'rootCut', true);
  g.WS.set('storm', 'windBridge', true);
  for (const gk of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']) g.WS.set('village', 'guardian_' + gk);
});

// EVERY ROOM THE GAME ROUTES TO (tools/all-rooms.mjs) — the live registry, not
// a hand-kept list (verify-reachable's own header explains why that rotted
// twice). Visits every one exactly once to record its door list and whether
// it holds a live enemy, which is what makes this HEAVY rather than --quick.
//
// e2/e2b/w3 excluded on top of the default LEGACY list: allRooms.mjs's own
// comment calls them "LIVE legacy rooms... covered nightly, same as every
// other room" — true of whatever verifier that comment means, not of
// `wk.jump()`'s state.room+respawn navigation, which timed out on all three
// (checked directly, isolated from this suite, 2026-09-09). Building them by
// a route that does not work is a gap in the navigation helper, not evidence
// against the rooms — a different question from the one this file asks.
const ROOMS = await allRooms(page, { exclude: [...LEGACY, 'e2', 'e2b', 'w3'] });
const graph = {};
for (const room of ROOMS) {
  const ok = await wk.jump(room, ALL).then(() => true).catch(() => false);
  if (!ok) { graph[room] = { doors: [], enemies: 0, failed: true }; continue; }
  const info = await page.evaluate(() => ({
    doors: [...new Set(window.__game.world.doors.map((d) => d.to))],
    enemies: (window.__game.world.enemies || []).filter((e) => !e.scenery).length,
  }));
  graph[room] = { ...info, failed: false };
}
const buildFails = Object.entries(graph).filter(([, g]) => g.failed).map(([id]) => id);
check('every routed room (minus the three navigated a different way) built',
  buildFails.length === 0, buildFails);

// BFS from 'den', two runs: one over every edge, one that also refuses to
// step INTO a room holding a live enemy (arrives fine, but a fight is not
// "reachable combat-free" if that fight is mandatory to pass through).
function bfs(start, avoidCombat) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const id = q.shift();
    const g = graph[id];
    if (!g) continue;
    for (const to of g.doors) {
      if (seen.has(to)) continue;
      if (avoidCombat && graph[to] && graph[to].enemies > 0) continue;
      seen.add(to); q.push(to);
    }
  }
  return seen;
}
const full = bfs('den', false);
const combatFree = bfs('den', true);
// INFORMATIONAL, not a pass/fail line: measured at 51 of 152 with every flag
// and form this suite knows how to set. `world.doors` is the walkable-door
// graph, and a good deal of this game's forward progression moves a child
// through STORY (a boss fight resolving, a cutscene, a marker) rather than
// a second door — this suite has no way to fire those, so a room reachable
// only that way reads as unreachable here without actually being unreachable
// in play. The number is worth watching over time; asserting a target for it
// today would be asserting a number this suite cannot yet tell truth from
// fiction on.
console.log(`  (door-graph BFS from 'den' reaches ${full.size} of ${ROOMS.length} routed rooms — informational, see comment)`);

// WHAT THIS SLICE CAN ACTUALLY STAND BEHIND: its own two new doors reach
// somewhere real. The broader "every region entrance, combat-free" claim
// (WORLD-DESIGN.md §4) needs the story-progression gap above closed first —
// left for whichever later slice does that, not asserted blind here.
check('la and vh (this slice’s own loop) are reachable from the Den',
  full.has('la') && full.has('vh'), { la: full.has('la'), vh: full.has('vh') });
check('...and combat-free', combatFree.has('la') && combatFree.has('vh'),
  { la: combatFree.has('la'), vh: combatFree.has('vh') });

console.log(wk.errors.length ? '\nPAGE ERRORS:\n' + wk.errors.join('\n') : '');
for (const e of wk.errors) errors.push('PAGEERROR: ' + e);
await wk.b.close();
console.log(errors.length ? `\nFAIL (${errors.length}): ${errors.join(', ')}` : '\nPASS');
process.exit(errors.length ? 1 : 0);
