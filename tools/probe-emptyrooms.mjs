// IS THERE ANYTHING TO DO IN THIS ROOM?
//
// Dad, on Stoneroot: "rocks everywhere nothing to do throught the level." He was
// right and it was measurable the whole time — the Great Vault and all three of
// its mouths held not one creature, so the rooms a child crosses most often were
// scenery with a door at each end.
//
// verify-density already asks "is this room FURNISHED" and every one of those
// rooms passed it, because they were full of rubble. Furniture is not content. A
// room earns its place if a child can DO something in it: fight, break, open,
// cut, smash, read a shrine, meet someone. This counts those, and only those.
import { chromium } from 'playwright';
import { allRooms } from './all-rooms.mjs';

const ONLY = process.argv.slice(2);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'EMPTY');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
// EVERY ROOM THE GAME ROUTES TO, ASKED OF THE GAME (tools/all-rooms.mjs).
// This was a literal array and had never heard of the Village's ten rooms, the
// Spire's five, or the three shortcut rooms in the Wild Woods and Stormreach.
// Read AFTER the page has navigated: it imports the live js/rooms.js registry,
// which does not exist until the page has loaded the game's modules.
const ROOMS = ONLY.length ? ONLY : await allRooms(page);
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.musicVol = 0; g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
});
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r) && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

// Markers that represent something a child can act on. Deliberately explicit:
// a list you have to add to is a list that tells the truth, and an "anything
// with Spot in the name" rule would have counted heroSpot and lanternSpot —
// scenery with a label — and called Stoneroot's empty rooms full.
const DOING = ['breakables', 'chestDefs', 'crackSpot', 'teachCrack', 'practiceCracks',
  'developCracks', 'pinSpot', 'rattlePlate', 'sparkSpot', 'shrineSpot', 'teachBrazier',
  'gutterSpots', 'orderSpots', 'teachBramble', 'brambleSpots', 'iceSpots', 'vaneSpots',
  'plateSpots', 'mirrorSpots', 'pupSpot', 'pup4Spot', 'pup6Spot', 'restSpot',
  'potionSpot', 'shopSpot', 'wardenSpot', 'bossSpot', 'minigameSpot', 'moonstoneSpot',
  // THE SHADOW COURT'S OWN VOCABULARY. The first run of this called xg2 and xm1
  // EMPTY — xg2 holds three braziers you douse as the Tide Wolf and xm1 three
  // watchers and a ghost-lock. Both rooms are fine; the LIST was short. A probe
  // that only knows the markers I happened to remember will keep inventing
  // findings, which is worse than finding nothing.
  'wingSolve', 'wingLock', 'poolBraziers', 'relicSocket', 'mirrorPair',
  'lanternPair', 'damSpot', 'bellStone', 'bramblePromise', 'underwaterPromise',
  'deepPromise', 'crackPromise', 'firePromise', 'icePromise', 'thornPromise'];

console.log('room   foes  break  things  verdict');
const rows = [];
for (const room of ROOMS) {
  if (!(await go(room))) { console.log(room.padEnd(6), 'BUILD FAILED'); continue; }
  const r = await page.evaluate((doing) => {
    const g = window.__game, w = g.world;
    // WATCHERS ARE NOT IN world.enemies. The Court's watchers live in their own
    // list, so counting only `enemies` reported its wings as barren when they
    // are the one region built around standing still and being seen.
    const foes = (w.enemies || []).filter((e) => !e.dead && !e.scenery && e.takeStun).length
      + (w.watchers || []).filter((e) => !e.dead).length
      + (w.pups || []).filter((e) => !e.dead).length;
    const breakables = (w.enemies || []).filter((e) => e.scenery && !e.dead).length;
    const m = w.markers || {};
    const things = doing.filter((k) => {
      const v = m[k];
      return Array.isArray(v) ? v.length > 0 : !!v;
    });
    return { foes, breakables, things, boss: !!w.boss || !!w.warden };
  }, DOING);
  rows.push({ room, ...r });
  const score = r.foes + r.breakables + r.things.length + (r.boss ? 5 : 0);
  const verdict = score === 0 ? 'EMPTY — nothing to do at all'
    : score <= 1 ? 'nearly empty'
    : '';
  console.log(room.padEnd(6), String(r.foes).padEnd(5), String(r.breakables).padEnd(6),
    String(r.things.length).padEnd(7), verdict);
}
const empty = rows.filter((r) => r.foes + r.breakables + r.things.length + (r.boss ? 5 : 0) === 0);
const thin = rows.filter((r) => r.foes + r.breakables + r.things.length + (r.boss ? 5 : 0) === 1);
console.log(`\n${empty.length}/${rows.length} rooms have NOTHING to do in them.`);
if (empty.length) console.log('empty: ' + empty.map((r) => r.room).join(' '));
console.log(`${thin.length}/${rows.length} have exactly one thing.`);
if (thin.length) console.log('thin: ' + thin.map((r) => `${r.room}(${r.things.join('+') || r.foes + ' foes'})`).join(' '));
// and the rooms with no LIVING thing in them, which is a different question
const noFoes = rows.filter((r) => r.foes === 0 && !r.boss);
console.log(`\n${noFoes.length}/${rows.length} rooms hold no creature at all.`);
console.log('  ' + noFoes.map((r) => r.room).join(' '));
await b.close();
