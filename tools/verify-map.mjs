// THE MAP SCREEN TELLS THE TRUTH (js/menus.js showMap).
//
// It kept a hand list of rooms for two rebuilds: Ember's rows were r1/r2/k1/r3
// — retired ids that resolveRoom redirects — so "you are here" could never light
// in Level 1, and seven regions plus both roads were not on it at all. It reads
// the live level tables now, and this holds it to three things:
//
//   1. every room it draws EXISTS in the live registry, and every spine room
//      the registry knows in an open region is drawn;
//   2. standing in a room lights that room, in every region, through the real
//      map button;
//   3. a fresh save sees the Den and Ember and nothing else — a child must not
//      be shown eleven rows of places they cannot go — and beating a boss opens
//      the next row.
//
// And no emoji: the cards wear district colour, not pictures.
import { launch } from './wk-drive.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};
// Unicode's own definition of a picture-character. '✓' (the Done button) is
// not one; '✔', '⭐' and every colour glyph the old map used are.
const EMOJI = /\p{Extended_Pictographic}/u;

const wk = await launch({ timescale: 1 });
await wk.newGame('MAP');
const FORMS = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
const go = async (room) => {
  await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: FORMS });
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
};
// open the map the way a thumb does, read it, close it the way a thumb does
const readMap = async () => {
  await wk.page.locator('#map-btn').dispatchEvent('pointerdown');
  await wk.page.waitForFunction(() => getComputedStyle(document.getElementById('map-menu')).display !== 'none');
  const out = await wk.page.evaluate(() => {
    const el = document.getElementById('map-menu');
    return {
      regions: [...el.querySelectorAll('.map-title')].map((t) => t.textContent.trim()),
      rooms: [...el.querySelectorAll('.map-room[data-rooms]')].flatMap((d) => d.dataset.rooms.split(' ')),
      here: [...el.querySelectorAll('.map-room.here')].map((d) => d.dataset.room),
      text: el.textContent,
    };
  });
  await wk.page.locator('#map-menu .menu-btn').last().dispatchEvent('pointerdown');
  await wk.page.waitForFunction(() => getComputedStyle(document.getElementById('map-menu')).display === 'none');
  return out;
};

console.log('\n── 1. a fresh save sees only where it can go ───────────');
await go('la');
let m = await readMap();
check('Den and Ember Hollow, nothing else', m.regions.length === 2
  && m.regions[0].startsWith('The Moonlit Den') && m.regions[1].startsWith('Ember Hollow'), m.regions);
check('standing in la lights la', m.here.length === 1 && m.here[0] === 'la', m.here);
check('no emoji anywhere on the map', !EMOJI.test(m.text));

console.log('\n── 2. every drawn room is real; every spine room is drawn ──');
const live = await wk.page.evaluate(async () => {
  const { ROOMS } = await import('/js/rooms.js');
  const { registeredRooms } = await import('/js/districts.js');
  return { ids: Object.keys(ROOMS), spine: registeredRooms().filter((r) => r.spine).map((r) => r.id) };
});
// open the whole world, then read once
await wk.page.evaluate(() => {
  const f = window.__game.state.flags;
  f.bossDefeated = f.wardenDefeated = f.sylvaDefeated = f.borealDefeated = true;
  f.ariaDefeated = f.meriDefeated = f.grimmFreed = true;
});
m = await readMap();
const ghosts = m.rooms.filter((id) => !live.ids.includes(id));
check('every room on the map exists in the live registry', ghosts.length === 0, { ghosts });
// The Spire opens on the Village being RESTORED (six guardians down), which is
// world state rather than a flag, so with every boss flag set it is the one row
// still hidden — and its rooms are the one legitimate absence here.
const missing = live.spine.filter((id) => !m.rooms.includes(id) && id[0] !== 'm');
check('every spine room the levels declare is on the map', missing.length === 0, { missing, drawn: m.rooms.length });
check('all eleven places show once every boss is beaten (the Spire waits for the Village)',
  m.regions.length === 11, m.regions);
check('no emoji with every row showing', !EMOJI.test(m.text));

console.log('\n── 3. "you are here" works in every region ─────────────');
for (const room of ['n1', 'vh', 't1a', 'f3', 'q2', 's1a', 'd1a', 'x1', 'ysq', 'lk1', 'm1']) {
  await go(room);
  const r = await readMap();
  // lk1 is a POCKET off Ember's spine: it is drawn only because the child is in it;
  // m1 is in the Spire, whose row is hidden until the child is standing in it
  check(`${room} lights up`, r.here.length === 1 && r.here[0] === room, r.here);
}

check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();
console.log(errors.length ? `\n✗ FAIL — ${errors.length} problem(s)` : '\n✓ PASS — the map reads the game');
process.exit(errors.length ? 1 : 0);
