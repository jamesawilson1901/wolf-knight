// THE MAP IS A REAL MAP, AND IT TELLS THE TRUTH (js/mapview.js, js/mapdata.js).
//
// Dad, 2026-09-26: "The whole map is confusing to me as an adult. A child has
// no chance of understanding. It needs to be a real map and when things are
// marked to come back later, actually have to be marked on the map."
//
// The rows-of-cards map this suite used to hold (one row per region, no emoji)
// is gone; its three old promises survive and four new ones join them:
//
//   0. the door graph the layout is built from (js/mapgraph.js) is not stale,
//      and EVERY room the levels register has a place on the map;
//   1. a fresh save sees the Den and Ember and nothing beyond — fog — with the
//      room Kael stands in marked;
//   2. every room drawn exists in the live registry, and every spine room of
//      every open region is drawn once the guardians are down;
//   3. "you are here" lights in every region, through the real map button;
//   4. a tap on a place lifts a GO button, and GO really travels there — the
//      card map's travel rule, kept;
//   5. the Ash Vault shows on the map only once its cracked wall is broken;
//   6. A COME-BACK-LATER GATE THE CHILD HAS SEEN IS MARKED ON ITS ROOM, with
//      the wolf that opens it: dim before that wolf is owned, bright after,
//      and gone once the gate is open — driven with the real verb;
//   7. the map pans under a finger and zooms with its buttons;
//   8. where he has been and what he has seen survive a save, and a save from
//      before the map existed opens onto the world it has walked, not fog.
import { spawnSync } from 'child_process';
import { launch } from './wk-drive.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

console.log('\n── 0. the door graph is current ─────────────────────────');
const gen = spawnSync(process.execPath, ['tools/gen-mapgraph.mjs'], { encoding: 'utf8' });
check('js/mapgraph.js matches the level files (else: node tools/gen-mapgraph.mjs --write)',
  gen.status === 0, gen.stdout.trim());

const wk = await launch({ timescale: 1 });
const { page } = wk;
await wk.newGame('MAP');
await page.evaluate(() => { const g = window.__game; g.player.iframes = 1e9; g.state.settings.captions = false; });
const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
const go = async (room, forms) => {
  await page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: forms });
  await page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
};
const mapUp = () => page.evaluate(() => getComputedStyle(document.getElementById('map-menu')).display !== 'none');
// open the map the way a thumb does: pause, then the Map button
const openMap = async () => {
  await page.locator('#pause-btn').dispatchEvent('pointerdown');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('pause-menu')).display !== 'none');
  await page.locator('#map-btn').dispatchEvent('pointerdown');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('map-menu')).display !== 'none');
  await page.waitForTimeout(150);
};
const closeMap = async () => {
  await page.locator('#map-menu .menu-btn').last().dispatchEvent('pointerdown');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('map-menu')).display === 'none');
  if (await page.evaluate(() => getComputedStyle(document.getElementById('pause-menu')).display !== 'none')) {
    await page.locator('#resume-btn').dispatchEvent('pointerdown');
  }
};
const readMap = () => page.evaluate(() => {
  const el = document.getElementById('map-menu');
  return {
    tiles: [...el.querySelectorAll('.map-tile')].map((t) => t.dataset.room),
    visited: [...el.querySelectorAll('.map-tile.visited')].map((t) => t.dataset.room),
    travel: [...el.querySelectorAll('.map-room:not(.here)')].map((t) => t.dataset.room),
    here: [...el.querySelectorAll('.map-tile.here')].map((t) => t.dataset.room),
    you: el.querySelectorAll('.map-you').length,
    marks: [...el.querySelectorAll('.map-mark')].map((m) => ({
      room: m.dataset.room, form: m.dataset.form, can: m.classList.contains('can') })),
  };
});
const withMap = async (fn) => { await openMap(); const r = await fn(); await closeMap(); return r; };
// A real tap on a tile (pointer down + up, no drag), then a real tap on GO.
const tapTravel = async (id) => {
  await openMap();
  const at = await page.evaluate((id) => {
    const t = document.querySelector(`#map-menu .map-tile[data-room="${id}"] .map-hit`);
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
  if (!at) { await closeMap(); return 'no tile'; }
  await page.mouse.click(at.x, at.y);
  const goBtn = page.locator(`#map-menu .map-go[data-room="${id}"]`);
  if (!(await goBtn.count())) { await closeMap(); return 'no GO button'; }
  await goBtn.dispatchEvent('pointerdown');
  await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === r
    && window.__game.player.hearts > 1 && !window.__wk.gates.transitioning, id, { timeout: 45000 });
  return 'travelled';
};

console.log('\n── 0b. every registered room has a place on the map ─────');
const cover = await page.evaluate(async () => {
  const { registeredRooms } = await import('/js/districts.js');
  const { mapLayout, mapRooms } = await import('/js/mapdata.js');
  const { DOORS } = await import('/js/mapgraph.js');
  const pos = mapLayout();
  const ids = mapRooms().map((r) => r.id);
  const cells = new Map();
  for (const id of ids) { const p = pos.get(id); if (p) cells.set(p.x + ',' + p.y, (cells.get(p.x + ',' + p.y) || []).concat(id)); }
  return {
    count: ids.length,
    noPos: ids.filter((id) => !pos.has(id)),
    notInGraph: registeredRooms().map((r) => r.id).filter((id) => !DOORS[id]),
    stacked: [...cells.values()].filter((l) => l.length > 1),
  };
});
check(`all ${cover.count} rooms have a map position`, cover.noPos.length === 0, cover.noPos);
check('every registered room is in the door graph', cover.notInGraph.length === 0, cover.notInGraph);
check('no two rooms share a map cell', cover.stacked.length === 0, cover.stacked);

console.log('\n── 1. a fresh save: the Den and Ember, fog beyond ───────');
await go('la');
let m = await withMap(readMap);
const regionOfAll = await page.evaluate(async (ids) => {
  const { mapRegion } = await import('/js/mapdata.js');
  return ids.map(mapRegion);
}, m.tiles);
check('only the Den and Ember Hollow are drawn', regionOfAll.every((r) => r === 'den' || r === 'ember_hollow'),
  [...new Set(regionOfAll)]);
check('standing in la marks la, with Kael on it', m.here.length === 1 && m.here[0] === 'la' && m.you === 1, m);
check('la is drawn walked; rooms ahead are drawn faint, not walked',
  m.visited.includes('la') && m.tiles.includes('lg1') && !m.visited.includes('lg1'), { visited: m.visited });
check('no dungeon room shows before its wall breaks', !m.tiles.includes('lv1'), m.tiles);

console.log('\n── 2. every drawn room is real; every open spine room is drawn ──');
const live = await page.evaluate(async () => {
  const { ROOMS } = await import('/js/rooms.js');
  const { registeredRooms } = await import('/js/districts.js');
  return { ids: Object.keys(ROOMS), spine: registeredRooms().filter((r) => r.spine).map((r) => r.id) };
});
await page.evaluate(() => {
  const f = window.__game.state.flags;
  f.bossDefeated = f.wardenDefeated = f.sylvaDefeated = f.borealDefeated = true;
  f.ariaDefeated = f.meriDefeated = f.grimmFreed = true;
});
m = await withMap(readMap);
const ghosts = m.tiles.filter((id) => !live.ids.includes(id));
check('every room on the map exists in the live registry', ghosts.length === 0, { ghosts });
// The Spire opens on the Village being RESTORED (six guardians down), which is
// world state rather than a flag — its rooms are the one legitimate absence.
const missing = live.spine.filter((id) => !m.tiles.includes(id) && id[0] !== 'm');
check('every spine room of every open region is on the map', missing.length === 0, { missing, drawn: m.tiles.length });

console.log('\n── 3. "you are here" works in every region ─────────────');
for (const room of ['n1', 'vh', 'g1', 't1a', 'c1', 'f3', 'q2', 's1a', 'p1', 'd1a', 'h1', 'x1', 'ysq', 'lk1', 'm1']) {
  await go(room, FORMS);
  const r = await withMap(readMap);
  check(`${room} lights up`, r.here.length === 1 && r.here[0] === room && r.you === 1, r.here);
}

console.log('\n── 4. tap, GO, and really travel ────────────────────────');
await page.evaluate(() => {
  const f = window.__game.state.flags;
  f.bossDefeated = f.wardenDefeated = f.sylvaDefeated = f.borealDefeated = false;
  f.ariaDefeated = f.meriDefeated = f.grimmFreed = false;
});
await go('la');
check('from la, tap the Den, tap GO: in the Den', (await tapTravel('den')) === 'travelled');
await page.evaluate(() => { window.__game.state.flags.bossDefeated = true; });
check('from the Den, tap the Ashfall, tap GO: at la', (await tapTravel('la')) === 'travelled');
// a tap is not a trip: the first tap only offers
await openMap();
const offered = await page.evaluate(() => {
  const t = document.querySelector('#map-menu .map-tile[data-room="lg1"] .map-hit');
  const r = t.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(offered.x, offered.y);
await page.waitForTimeout(300);
check('one tap offers GO and goes nowhere', await mapUp()
  && (await page.locator('#map-menu .map-go[data-room="lg1"]').count()) === 1
  && (await page.evaluate(() => window.__game.world.roomId)) === 'la');
await closeMap();

console.log('\n── 5. the Ash Vault joins the map when its wall breaks ──');
await page.evaluate(() => { window.__game.state.flags.cracked.l1_crack_gate = false; });
m = await withMap(readMap);
check('no Ash Vault tile before the crack breaks', !m.tiles.includes('lv1'), m.tiles);
await page.evaluate(() => { window.__game.state.flags.cracked.l1_crack_gate = true; });
await go('la');
check('after it breaks, the Understair Cellar is a place to travel to', (await tapTravel('lv1')) === 'travelled');
await page.evaluate(() => { window.__game.state.flags.cracked.l1_crack_gate = false; });

console.log('\n── 6. a gate seen is marked, brightens, and goes ────────');
// Kael walks up to the Scorched Cubby's barricade without the Fire Wolf. The
// game's own per-frame pass notices him there — nothing here writes a mark.
// (The Shadowgrip still standing: beating him is what hands over the Fire Wolf.)
await page.evaluate(() => { window.__game.state.flags.bossDefeated = false; });
await go('lb2', ['knight', 'dark_wolf']);
await page.evaluate(() => { const g = window.__game;
  g.state.flags.burned.l1_scorched_gate = false;
  const p = g.player.root.position; p.set(3.4, p.y, 0); });
await page.waitForFunction(() => Object.keys(window.__game.state.flags.mapMarks || {}).includes('lb2:l1_scorched_gate'),
  null, { timeout: 20000 }).catch(() => {});
await go('lb');
m = await withMap(readMap);
let mk = m.marks.filter((x) => x.room === 'lb2');
check('the barricade is marked on the Scorched Cubby, with the Fire Wolf', mk.length === 1 && mk[0].form === 'fire_wolf', m.marks);
check('...dim: he does not have the Fire Wolf yet', mk.length === 1 && !mk[0].can, mk);
await page.evaluate(() => { const s = window.__game.state; s.formsUnlocked = [...s.formsUnlocked, 'fire_wolf']; });
m = await withMap(readMap);
mk = m.marks.filter((x) => x.room === 'lb2');
check('...bright once the Fire Wolf is his', mk.length === 1 && mk[0].can, mk);
// burn it with the Fire Wolf's own slam, as verify-promises drives every gate
await go('lb2');
const burned = await page.evaluate(async () => {
  const g = window.__game, p = g.player;
  p.root.position.set(3.2, p.root.position.y, 0); p.root.rotation.y = -Math.PI / 2;
  g.state.form = 'fire_wolf'; p.specialCooldown = 0; p.lockTime = 0;
  p.trySpecial(g.effects, g.world);
  for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
  return !!g.state.flags.burned.l1_scorched_gate;
});
check('the Fire Wolf\'s slam burns the barricade', burned);
m = await withMap(readMap);
check('...and its mark is gone from the map', !m.marks.some((x) => x.room === 'lb2'), m.marks);

console.log('\n── 7. drag pans, the buttons zoom ───────────────────────');
await openMap();
const tf = () => page.evaluate(() => document.querySelector('#map-menu .map-world').getAttribute('transform'));
const t0 = await tf();
await page.mouse.move(300, 200); await page.mouse.down();
await page.mouse.move(360, 240, { steps: 6 }); await page.mouse.up();
const t1 = await tf();
check('a drag moves the map', t1 !== t0, { t0, t1 });
check('...and a drag is not a tap: no GO offered', (await page.locator('#map-menu .map-go').count()) === 0);
await page.locator('#map-menu .map-zoom-in').dispatchEvent('pointerdown');
const t2 = await tf();
const sc = (t) => Number((/scale\(([\d.]+)\)/.exec(t) || [])[1]);
check('+ zooms in', sc(t2) > sc(t1), { before: sc(t1), after: sc(t2) });
await page.locator('#map-menu .map-zoom-out').dispatchEvent('pointerdown');
await page.locator('#map-menu .map-zoom-out').dispatchEvent('pointerdown');
check('− zooms out', sc(await tf()) < sc(t2));
await closeMap();

console.log('\n── 8. the map\'s memory is in the save, and old saves seed it ──');
const saved = await page.evaluate(async () => {
  const g = window.__game;
  g.persist();
  const raw = JSON.parse(localStorage.getItem('wolfknight:save:' + g.state.profileId));
  const out = { visitedLa: !!(raw.flags.visited && raw.flags.visited.la),
    markSaved: !!(raw.flags.mapMarks && raw.flags.mapMarks['lb2:l1_scorched_gate']) };
  // round trip: what was saved is what comes back
  g.applySave(g.state.profileId, g.state.profileName, JSON.parse(JSON.stringify(raw)));
  out.visitedBack = !!g.state.flags.visited.la;
  out.markBack = !!g.state.flags.mapMarks['lb2:l1_scorched_gate'];
  // a save from before the map existed: no `visited`, no `mapMarks` — it must
  // load, and open onto the world it has walked rather than onto fog
  const old = JSON.parse(JSON.stringify(raw));
  delete old.flags.visited; delete old.flags.mapMarks;
  old.flags.wardenDefeated = false; old.flags.bossDefeated = true;
  old.checkpoint = { room: 'vh', x: 0, z: 0, id: 'spawn' };
  g.applySave(g.state.profileId, g.state.profileName, old);
  out.legacyNull = g.state.flags.visited === null;
  const { mapModel } = await import('/js/mapdata.js');
  const model = mapModel();
  const v = model.tiles.filter((t) => t.visited).map((t) => t.id);
  out.legacySeeded = ['la', 'lg1', 'lb', 'le', 'n1', 'n2', 'den'].every((id) => v.includes(id));
  out.legacyMarks = typeof g.state.flags.mapMarks === 'object';
  return out;
});
check('visited rooms and seen gates are written to the save', saved.visitedLa && saved.markSaved, saved);
check('...and read back by applySave', saved.visitedBack && saved.markBack, saved);
check('a save from before the map loads, and is seeded from its own progress',
  saved.legacyNull && saved.legacySeeded && saved.legacyMarks, saved);

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — the map is a map, and it tells the truth');
process.exit(errors.length ? 1 : 0);
