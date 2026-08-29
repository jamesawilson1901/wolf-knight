// NO PUSHING A ROCK ONTO A PLATE FOR NOTHING.
//
// Dad, on the first cut of Ember's push-block rooms: "the puzzles don't do
// anything?! there's no reward. there's no opening the way to continue
// through the level or anything! All puzzles should either open the way or
// reward the player. no 'push this rock on the plate for no reason at all'."
//
// He is right, and the rest of the game already agreed with him — Stoneroot's
// rattle plate drains the vault, the Knot's plate opens the way north, the
// Wild Woods' pair opens a thorn gate, Frostpeak's pair opens a frost gate.
// Ember's new plates were the one place that paid out a handful of coins onto
// the floor and gated nothing, which is precisely the room he noticed.
//
// So the rule gets a ruler. For every room in the game that contains a
// pressure plate, at least one of these must be true:
//
//   * a door in that room is CONDITIONAL (`when`) — solving it opens the way;
//   * the room holds a chest — solving it opens a reward;
//   * the room registers bars//gates the plate can lift.
//
// A plate with none of the three is the thing he complained about, and this
// suite fails on it by name.
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// Every room that can hold a plate today, plus the rooms around them so a
// plate MOVED into a new room is still caught. Cheap: rooms without plates
// cost one build and one property read.
const ROOMS = [
  // Ember Hollow
  'la', 'la1', 'lg1', 'lb', 'lb1', 'lb2', 'lg2', 'lc', 'lc1', 'lg3', 'ld', 'ld1', 'lg4',
  // Stoneroot
  'vh', 'va1', 'va2', 'va3', 'vb1', 'vb2', 'vb3', 'vc1', 'vc2', 'vc3',
  // Wild Woods
  't1a', 't2a', 't3a', 'tkn', 'tc3', 't4a',
  // the older hand-built rooms that still carry gates
  'w3', 'e2', 'e2b', 'f3',
];

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'PAYOFF');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  // every form, so a room that gates on a later wolf still builds its gate
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
});

const go = async (room) => {
  for (let a = 0; a < 6; a++) {
    await page.evaluate((r) => {
      const g = window.__game;
      g.state.flags.plates = {};          // always judge the room UNSOLVED
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true });
    }, room);
    try {
      await page.waitForFunction((r) => window.__game.world
        && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1, room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

console.log('\n── every plate opens something or pays something ─────');
let plateRooms = 0;
for (const room of ROOMS) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  const s = await page.evaluate(() => {
    const w = window.__game.world;
    return {
      plates: (w.plates || []).map((p) => p.id),
      gatedDoors: (w.doors || []).filter((d) => d.when).map((d) => d.to),
      chests: (w.chests || []).length,
      chestDefs: ((w.markers && w.markers.chestDefs) || []).length,
    };
  });
  if (!s.plates.length) continue;
  plateRooms++;
  const paysOff = s.gatedDoors.length > 0 || s.chests > 0 || s.chestDefs > 0;
  check(`${room}: ${s.plates.length} plate(s) open a way or a reward`, paysOff,
    { room, ...s });
}
check('the sweep actually found plates to judge', plateRooms >= 5, { plateRooms });
check('nothing threw while building them', pageErrors.length === 0, pageErrors.slice(0, 4));

console.log(errors.length ? `\n${errors.length} PROBLEM(S):\n` + errors.join('\n')
  : `\nALL CLEAN — ${plateRooms} plate rooms, every one of them pays.`);
await b.close();
process.exit(errors.length ? 1 : 0);
