// WHAT EACH ROOM SOUNDS LIKE.
//
// Nothing has ever checked this, and two real bugs were living in it: the three
// newest regions fell through to Ember Hollow's loop, and the boss-music branch
// named r3, w5 and f5 — two of which are RETIRED rooms. The arenas the kids
// actually fight in (le, vz, tgl) had been fighting to region music since the
// levels were rebuilt.
//
// Music is the one thing in this game a child experiences with their eyes shut,
// so it is worth a verifier of its own.
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
await page.fill('#t-name', 'MUSIC');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false;
  g.state.settings.greybox = false;
  g.state.settings.musicVol = 0.01;      // audible to the code, not to the room
  g.state.flags.borealDefeated = true;
  g.state.flags.ariaDefeated = true;
  g.state.flags.meriDefeated = true;
  for (const r of ['ember', 'thorn', 'tide', 'moon']) g.WS.set('court', 'relic_' + r);
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
const trackIn = async (room) => {
  if (!(await go(room))) return null;
  return page.evaluate(async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    return window.__game.audio._musicName;
  });
};

// one ordinary room per region, in the order a child walks them
const REGIONS = [
  { id: 'la',  region: 'Ember Hollow' },
  { id: 'va1', region: 'Stoneroot' },
  { id: 't1b', region: 'Wild Woods' },
  { id: 'f1',  region: 'Frostpeak' },
  { id: 's1b', region: 'Stormreach' },
  { id: 'd1b', region: 'Sunken Vale' },
  { id: 'x1',  region: 'Shadow Court' },
  // the two capstones — never in this list, and both fell through to the
  // bossDefeated branch, so the monster-overrun Village played the Den's
  // lullaby until 2026-08-29. Fresh profile = guardians standing = corrupted.
  { id: 'ysq', region: 'The Village (corrupted)' },
  { id: 'm1',  region: 'The Moonlit Spire' },
];

console.log('\n── 1. every region has music ─────────────────────────');
const played = [];
for (const r of REGIONS) {
  const track = await trackIn(r.id);
  played.push({ ...r, track });
  check(`${r.region} plays something`, !!track, { room: r.id, track });
}

console.log('\n── 2. no two ADJACENT regions sound the same ─────────');
// Five loops exist for seven regions, so reuse is forced. What a child can
// actually notice is walking out of one region into another and hearing no
// change at all — so the rule is about NEIGHBOURS, not about uniqueness.
const clashes = [];
for (let i = 0; i < played.length - 1; i++) {
  if (played[i].track && played[i].track === played[i + 1].track) {
    clashes.push(`${played[i].region} → ${played[i + 1].region} (both ${played[i].track})`);
  }
}
check('walking from one region to the next always changes the music',
  clashes.length === 0, { clashes, order: played.map((p) => `${p.region}:${p.track}`) });

console.log('\n── 3. every boss arena plays boss music ──────────────');
// The arenas the kids actually fight in. r3/w5/f5 are the RETIRED rooms and are
// deliberately not in this list — naming them was the original bug.
const ARENAS = [
  { id: 'le',  who: 'the Shadowgrip' },
  { id: 'vz',  who: 'the Bone Warden' },
  { id: 'tgl', who: 'Sylva' },
  { id: 'f5',  who: 'Boreal' },
  { id: 'scr', who: 'Aria' },
  { id: 'ddp', who: 'Meri' },
  { id: 'xth', who: 'Shadow-Grimm' },
];
// The doors above needed these flags set; an arena needs them CLEAR, or the
// boss is already beaten, does not spawn, and the room correctly plays region
// music. The first run of this file reported four false failures that way.
await page.evaluate(() => {
  const f = window.__game.state.flags;
  f.borealDefeated = false; f.ariaDefeated = false; f.meriDefeated = false;
  f.grimmFreed = false; f.sylvaDefeated = false; f.bossDefeated = false;
  f.wardenDefeated = false;
});
for (const a of ARENAS) {
  const track = await trackIn(a.id);
  check(`${a.who} fights to boss music`, track === 'boss-loop', { room: a.id, track });
}

console.log('\n── 4. a DISTRICT with its own track keeps it ─────────');
// One room per region is not enough. The Kiln has its own loop and three live
// rooms (ld, ld1, lg4), and every one of them was playing the ordinary Ember
// loop because the branch keyed on `k` — a RETIRED prefix. Nothing noticed,
// because section 1 only ever samples `la`.
for (const id of ['ld', 'ld1', 'lg4']) {
  const track = await trackIn(id);
  check(`the Kiln room ${id} plays the Kiln's own track`, track === 'kiln', { room: id, track });
}

console.log('\n── 5. the Den is the Den, wherever you came from ─────');
check('the Den plays its own theme', (await trackIn('den')) === 'den');

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN.'));
await b.close();
process.exit(errors.length ? 1 : 0);
