// DOES THE GAME EVER TELL A LOST CHILD WHERE TO GO?
//
// It did not. Two independent faults, either one of which was enough:
//
//   1. updateGentleGuide returned on its first line unless `settings.easy` was
//      on — and `easy` was not in the settings defaults at all, so it was
//      undefined for every profile ever created.
//   2. guideTarget() was a switch over room ids and every id in it was RETIRED
//      (r1, r2, k1, e1, w1…). The five rebuilt regions had no entry, so even
//      with the setting on there was nowhere for Pip to run.
//
// Nothing failed, because nothing asked. This asks.
import { launchBrowser } from './launch.mjs';
import { readFileSync, readdirSync } from 'node:fs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// ── 0. the stuck-hint table covers every gate in the game ──────────────
//
// Read off the source, so it costs nothing and cannot drift. The hints used to
// name retired rooms with raw coordinates; they are keyed on the markers rooms
// publish now, and this is what stops a new gate from being added in silence.
{
  console.log('── 0. every promise gate has something to say ────────');
  const main = readFileSync('js/main.js', 'utf8');
  const table = main.slice(main.indexOf('const GATE_HINTS'), main.indexOf('const stuckHints'));
  const covered = new Set([...table.matchAll(/marker: '(\w+)'/g)].map((m) => m[1]));
  const lines = new Set([...table.matchAll(/line: '(\w+)'/g)].map((m) => m[1]));

  const published = new Set();
  for (const f of readdirSync('js').filter((f) => /^level\d+\.js$/.test(f))) {
    for (const m of readFileSync('js/' + f, 'utf8').matchAll(/markers\.(\w*[Pp]romise\w*)\s*=/g)) {
      published.add(m[1]);
    }
  }
  const orphans = [...published].filter((p) => !covered.has(p));
  check('every promise marker a level publishes has a hint', orphans.length === 0,
    { orphans, covered: covered.size, published: published.size });

  const narr = readFileSync('js/narration.js', 'utf8');
  const missing = [...lines].filter((l) => !new RegExp('^\\s*' + l + ':', 'm').test(narr));
  check('every hint names a line that actually exists', missing.length === 0, { missing });
}

const b = await launchBrowser();
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'GUIDE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
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

console.log('\n── 1. gentle mode is no longer the gate ──────────────');
check('the guide does not require a setting that is off by default',
  await page.evaluate(() => !window.__game.state.settings.easy), { easy: false });

console.log('\n── 2. every ordinary room knows the way on ───────────');
// One room per region plus both hubs and a pocket, which is where a child is
// most likely to be standing when they give up.
const SPOTS = [
  { id: 'la', region: 'Ember Hollow' }, { id: 'lc1', region: 'Ember, a side pocket' },
  { id: 'ld', region: 'Ember, the Kiln' },
  { id: 'vh', region: 'Stoneroot, the hub' }, { id: 'va1', region: 'Stoneroot' },
  { id: 't2a', region: 'The Wild Woods' }, { id: 't3p', region: 'Woods, a pocket' },
  { id: 'f2', region: 'Frostpeak' },
  { id: 's2a', region: 'Stormreach' }, { id: 's3p', region: 'Stormreach, a pocket' },
  { id: 'd3a', region: 'The Sunken Vale' }, { id: 'd2p', region: 'Vale, a pocket' },
  { id: 'xh', region: 'The Shadow Court, the hall' }, { id: 'xa2', region: 'Court, the Ash Wing' },
];
for (const s of SPOTS) {
  if (!(await go(s.id))) { check(`${s.id} builds`, false); continue; }
  const t = await page.evaluate(() => {
    const g = window.__game;
    const spot = g.guideTarget ? g.guideTarget() : null;
    return spot ? { x: +spot.x.toFixed(1), z: +spot.z.toFixed(1), to: spot.to || null } : null;
  });
  check(`${s.region} (${s.id}) has somewhere to send Pip`, !!t, t || { target: null });
  if (!t) continue;
  // and it must be somewhere a child can actually stand
  const standable = await page.evaluate((p) => {
    const w = window.__game.world;
    const s = w.resolveCircle(p.x, p.z, 0.32);
    return Math.abs(s.x - p.x) < 1e-6 && Math.abs(s.z - p.z) < 1e-6 && !w.hazardAt(p.x, p.z);
  }, t);
  check(`  ...and it is floor, not a wall or a fire`, standable, t);
}

console.log('\n── 3. the hubs answer for where the child is UP TO ────');
await go('vh');
const hub = await page.evaluate(async () => {
  const g = window.__game;
  const out = [];
  for (const [n, keys] of [[0, []], [1, ['spark']], [2, ['spark', 'drained']],
    [3, ['spark', 'drained', 'deepLantern']]]) {
    for (const k of keys) g.WS.set('vault', k, true);
    out.push({ stage: n, next: g.nextRoom ? g.nextRoom('vh') : null });
  }
  return out;
});
check('the Stoneroot hub points at a different spoke as the vault wakes up',
  new Set(hub.map((h) => h.next)).size === 4, hub);

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN — nobody gets left with nowhere to go.'));
await b.close();
process.exit(errors.length ? 1 : 0);
