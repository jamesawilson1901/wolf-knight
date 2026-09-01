// CAN A REGION BE FINISHED?
//
// Nothing in tools/ asked this. Every level verifier asserts that a region's
// rooms CONNECT — the loop closes, the spokes return, no dead ends — and all of
// them were green while the three region-completion flags could never be set.
//
// `state.spoken.region_complete` / `stone_complete` / `wild_complete` are the
// record of which NARRATION LINES have been heard, and fast travel, the pup
// counter and the map screen all read them as "is this region finished". Each
// line needed BOTH a retired room id AND a marker only that retired room's
// builder publishes (r3 + exitSpot, e3 + petraSpot, w5 + sylvaShrine) while
// js/state.js RETIRED_ROOMS redirects r3→le, e3→vz, w5→tgl. So none of the
// three could ever fire: Luna's moonstone never grew a destination, the sticker
// book said x/3 forever, and the map never showed Stoneroot.
//
// This drives both halves. The PROGRESSION half is checked with the narration
// record deliberately wiped, because that is the fault: what a child can travel
// to must not depend on a line of dialogue. The NARRATION half stands Kael on
// each rebuilt arena's real marker and asserts the line still speaks.
import { launchBrowser } from './launch.mjs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'DONE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.sfxVol = 0; g.state.settings.musicVol = 0;
  g.state.settings.greybox = false;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf'];
  g.player.iframes = 999999;
});

// ---- 1. progression, with the narration record WIPED ----------------------
//
// Luna's moonstone is rendered, not re-implemented: a second Menus renders into
// the real #map-menu, so this counts the destinations a child would actually
// see rather than a copy of the predicate.
const ladder = await page.evaluate(async () => {
  const g = window.__game;
  const { Menus } = await import('./js/menus.js');
  const menus = new Menus({
    player: g.player, onPauseGame: () => {}, onResumeGame: () => {}, onTravel: () => {},
  });
  const flags = ['bossDefeated', 'wardenDefeated', 'sylvaDefeated'];
  const rows = [];
  for (const id of flags) g.state.flags[id] = false;
  const sample = (label) => {
    // the record of heard lines is wiped every time: progression must not be
    // reading it
    g.state.spoken.region_complete = false;
    g.state.spoken.stone_complete = false;
    g.state.spoken.wild_complete = false;
    menus.showTravel();
    const dest = [...document.querySelectorAll('#map-menu .map-rooms > *')].length;
    menus.renderInventory();
    // Read the published number, not the sentence around it: the Armoury
    // reworded this footer from "pups 0/3" to "0/3 pups" and the old regex
    // silently started returning null for every row — a check that reports
    // nothing looks exactly like a check that passed nothing.
    const stat = document.querySelector('#inv-menu [data-pup-total]');
    const pups = stat ? [null, stat.getAttribute('data-pup-total')] : null;
    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('inv-menu').style.display = 'none';
    rows.push({ label, dest, pupTotal: pups ? Number(pups[1]) : null });
  };
  sample('nothing beaten');
  g.state.flags.bossDefeated = true; sample('Shadowgrip down');
  g.state.flags.wardenDefeated = true; sample('Warden down');
  g.state.flags.sylvaDefeated = true; sample('Sylva down');
  return rows;
});

console.log('');
console.log('Luna\'s moonstone and the pup count, with state.spoken wiped each time');
console.log('state              destinations   pups shown');
console.log('─'.repeat(52));
for (const r of ladder) {
  console.log(`${r.label.padEnd(18)} ${String(r.dest).padStart(12)}   ${String('x/' + r.pupTotal).padStart(10)}`);
}
console.log('');

// baseline is 2, not 1: the Den is now ALWAYS the first destination (a child
// must be able to travel home to spend coin regardless of progress), so every
// stage carries one more entry than it used to — the +1-per-region growth is
// unchanged, only the floor moved.
check('the moonstone grows one destination per region beaten',
  ladder.map((r) => r.dest).join(',') === '2,3,4,5', { got: ladder.map((r) => r.dest) });
check('the pup total grows 3 → 6 → 9 → 12',
  ladder.map((r) => r.pupTotal).join(',') === '3,6,9,12', { got: ladder.map((r) => r.pupTotal) });

// ---- 2. the three lines speak, in the rebuilt arenas -----------------------
const go = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => {
      const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true });
    }, room);
    try {
      // state.room flips the INSTANT a jump is requested, before the async
      // rebuild that follows it even starts — world.roomId is stamped by the
      // room's own builder as that rebuild's last step, so it is the one
      // identity a race can't forge. Reading state.room here could pass
      // while `world` was still the PREVIOUS room, exactly the false failure
      // verify-level3.mjs diagnosed and fixed the same way.
      await page.waitForFunction((r) => window.__game.world && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1, room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

const LINES = [
  { room: 'le', marker: 'heroSpot', flag: 'bossDefeated', line: 'region_complete', spirit: 'Cinder' },
  { room: 'vz', marker: 'petraSpot', flag: 'wardenDefeated', line: 'stone_complete', spirit: 'Petra' },
  { room: 'tgl', marker: 'sylvaSpot', flag: 'sylvaDefeated', line: 'wild_complete', spirit: 'Sylva' },
];

for (const L of LINES) {
  if (!await go(L.room)) { check(`${L.room} builds`, false); continue; }
  const r = await page.evaluate(async (L) => {
    const g = window.__game;
    g.state.flags[L.flag] = true;
    g.state.spoken[L.line] = false;
    const m = g.world.markers[L.marker];
    if (!m) return { marker: false };
    // stand on the spirit's own spot and let the world tick: the trigger runs
    // in the real narration pass, never called directly
    g.player.root.position.set(m.x, g.player.root.position.y, m.z);
    const wait = (n) => new Promise((res) => {
      let i = 0;
      const step = () => (++i >= n ? res() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
    await wait(20);
    return { marker: true, spoke: !!g.state.spoken[L.line] };
  }, L);
  check(`${L.spirit}'s arena (${L.room}) publishes ${L.marker}`, r.marker === true);
  check(`"${L.line}" speaks in ${L.room} once its boss is down`, r.spoke === true, r);
}

// ---- 3. the fault itself cannot come back ---------------------------------
const reads = await page.evaluate(async () => {
  const out = {};
  for (const f of ['js/main.js', 'js/menus.js']) {
    const src = await (await fetch('./' + f)).text();
    // a completion flag read OUTSIDE a narration.say(...) call is the fault
    out[f] = (src.match(/state\.spoken\.(region|stone|wild)_complete/g) || []).length;
  }
  return out;
});
check('no progression read hangs off the narration record any more',
  reads['js/main.js'] === 0 && reads['js/menus.js'] === 0, reads);

await b.close();
console.log('');
console.log(errors.length ? `✗ ${errors.length} FAILED: ${errors.join(' · ')}` : '✓ ALL CLEAN');
process.exit(errors.length ? 1 : 0);
