// NOTHING STANDS IN ANYTHING — AS THE CHILD WALKS IN (2026-10-10).
//
// Dad, looking at the broken-bridge islands: "They also have items
// overlapping in them. We had a rule that was meant to prevent this... there
// are items in some of those screenshots that intersect and go through others
// making it look poorly placed and quite amateurish. We had a rule to prevent
// that also."
//
// We did — tools/verify-interpenetration.mjs — and it was blind to half the
// room. It calls buildRoom() and measures what the room's own builder placed.
// Everything main.js adds AFTERWARDS (setupRoomExtras: chests, pots, rocks and
// trees, the broken-bridge islands, dragon shrines, settlers, the pup pen, the
// garden) was never in the room it measured, and anything marked keepLoose was
// skipped even when it was. So a rock could be planted through a cart, or a
// pit dug under a stack of crates, and the gate stayed green.
//
// This one walks into every room the way a child does — window.__wkJump, the
// real pipeline, every late spawner — with batching off so each prop keeps its
// own bounds, and measures EVERYTHING standing there:
//
//   1. no two separately placed things share space (the same footprint ruler
//      and the same 0.12u whisker as verify-interpenetration, so one rule);
//   2. nothing stands in a pit — not on a pier, not on a bridge, IN the hole.
//
// Things that move (enemies, the player, pups) are left out: where they stand
// at the instant of arrival is not a placement.
import { launch } from './wk-drive.mjs';
import { allRooms } from './all-rooms.mjs';

const errs = [];
const check = (n, ok, d) => { console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errs.push(n); };

const PEN = 0.12;
// Deliberate compositions placed in separate calls, one at a time with a
// reason each (the same list verify-interpenetration keeps).
const ALLOWED = [
  { room: 'f2', x: -5.4, z: -1.2, r: 0.5, why: 'freezeBrazier(): the ice shell around brazier f2_b1' },
  { room: 'f2', x: 0, z: -4.2, r: 0.5, why: 'freezeBrazier(): the ice shell around brazier f2_b2' },
  { room: 'f2', x: 5.4, z: -1.2, r: 0.5, why: 'freezeBrazier(): the ice shell around brazier f2_b3' },
];

const wk = await launch({ timescale: 1 });
await wk.page.addInitScript(() => { window.__noBatch = true; });
await wk.page.reload({ waitUntil: 'load' });
await wk.page.waitForSelector('#title', { state: 'visible', timeout: 30000 });
await wk.newGame('PLACEMENT');
await wk.page.evaluate(() => setInterval(() => { const n = window.__game.narration; if (n && n.speaking) n.skip(); }, 80));
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const rooms = ONLY.length ? ONLY : await allRooms(wk.page);
const ALL = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];

const results = [];
for (const room of rooms) {
  let ok = false;
  for (let a = 0; a < 3 && !ok; a++) {
    try {
      await wk.page.evaluate(({ r, f }) => { window.__game.player.iframes = 0; window.__wkJump(r, f); }, { r: room, f: ALL });
      await wk.page.waitForFunction((r) => window.__wk.room === r && !window.__wk.gates.transitioning
        && window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r), room, { timeout: 45000 });
      ok = true;
    } catch { /* retry */ }
  }
  if (!ok) { results.push({ room, error: 'never arrived' }); continue; }
  const r = await wk.page.evaluate(({ PEN, ALLOWED, room }) => {
    const w = window.__game.world, P = window.__game.player;
    // enemies move; pots and crates (Breakables, `scenery`) are placed, and stay
    const movers = new Set([P.root, ...(w.enemies || []).filter((e) => !e.scenery).map((e) => e.root)].filter(Boolean));
    for (const p of (w.pups || [])) if (p.root) movers.add(p.root);
    const keep = w._keepLoose;
    w._keepLoose = [];                       // measure the loose things too
    let props;
    try { props = w.propFootprints(); } finally { w._keepLoose = keep; }
    props = props.filter((p) => {
      const m = p.model;
      if (!m || movers.has(m) || m.isSprite || m.isLight) return false;
      let skip = false;
      m.traverse((n) => { if (n.userData && (n.userData.pitArt || n.userData.fx)) skip = true; if (n.isSprite) skip = true; });
      return !skip;
    });
    // say WHAT each thing is, so a report can be acted on
    const label = (m) => {
      const node = (w.nodes || []).find((n) => n.root === m);
      if (node) return 'node:' + node.kind + '@' + node.x + ',' + node.z;
      if ((w.chests || []).some((c) => c.mesh === m)) return 'chest';
      const e = (w.enemies || []).find((k) => k.root === m);
      if (e) return (e.constructor.name || 'enemy') + (e.kind ? ':' + e.kind : '');
      let nm = m.name;
      if (!nm || nm === 'Scene') m.traverse((n) => { if (!nm && n.name && n.name !== 'Scene') nm = n.name; });
      return nm || m.type;
    };
    for (const p of props) p.label = label(p.model);
    const hits = [];
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        const a = props[i], b = props[j];
        if (a.comp === b.comp) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        const pen = (a.r + b.r) - d;
        if (pen <= PEN) continue;
        const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
        if (ALLOWED.some((k) => k.room === room && Math.hypot(k.x - x, k.z - z) <= k.r)) continue;
        hits.push({ x: +x.toFixed(1), z: +z.toFixed(1), pen: +pen.toFixed(2),
          a: a.label, b: b.label });
      }
    }
    // IN A PIT: any footprint point that is pit and not pier, bridge or safe
    const inPit = [];
    if ((w.pitZones || []).length) {
      for (const p of props) {
        let n = 0, tot = 0;
        for (let fx = -0.8; fx <= 0.81; fx += 0.4) for (let fz = -0.8; fz <= 0.81; fz += 0.4) {
          tot++;
          if (w.pitAt(p.x + fx * p.hx, p.z + fz * p.hz)) n++;
        }
        if (n / tot > 0.12) inPit.push({ x: +p.x.toFixed(1), z: +p.z.toFixed(1), share: +(n / tot).toFixed(2), what: p.label });
      }
    }
    hits.sort((p, q) => q.pen - p.pen);
    return { props: props.length, hits: hits.length, worst: hits.slice(0, 6), inPit: inPit.slice(0, 6), pitCount: inPit.length };
  }, { PEN, ALLOWED, room });
  results.push({ room, ...r });
  if (r.hits || r.pitCount) console.log(`   ${room.padEnd(6)} ${r.hits} overlap(s), ${r.pitCount} in a pit  ${JSON.stringify(r.worst.slice(0, 3))} ${JSON.stringify(r.inPit.slice(0, 2))}`);
}

const broke = results.filter((r) => r.error);
const overl = results.filter((r) => r.hits > 0);
const pits = results.filter((r) => r.pitCount > 0);
check('every room was walked into', broke.length === 0, broke.slice(0, 5));
check('nothing stands inside anything, everything placed included', overl.length === 0,
  { rooms: overl.length, pairs: overl.reduce((n, r) => n + r.hits, 0), list: overl.map((r) => r.room) });
check('nothing stands in a pit', pits.length === 0, { rooms: pits.map((r) => r.room) });
check('no page errors', wk.errors.length === 0, wk.errors.slice(0, 4));
console.log(errs.length ? `\n✗ FAIL — ${errs.length}` : `\n✓ PASS — ${results.length} rooms, as a child walks into them`);
await wk.b.close();
process.exit(errs.length ? 1 : 0);
