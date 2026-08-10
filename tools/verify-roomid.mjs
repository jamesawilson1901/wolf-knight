// THE ID STORED IS THE ROOM ON SCREEN.
//
// `buildRoom` resolves retired ids (RETIRED_ROOMS, js/state.js); `loadRoom` used
// to store the RAW one. Frostpeak's f1 door south is the case the queue named:
// it targets `w5`, which builds `tgl` — so a child arriving that way stood in
// Sylva's Glade with `state.room === 'w5'`, and every id-keyed check in main.js
// answered a question about a room that no longer exists.
//
// The assertion that matters is not "the string is right" but ROUTE
// INDEPENDENCE: the same arena must behave identically whichever door you walk
// through. So this reaches `tgl` both ways and compares.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

// --- STATIC: no id-keyed branch may name a retired room --------------------
//
// Limited to the three places this fix touched — loadRoom, updateMusic and the
// boss-victory chain. The narration and stuck-hint blocks still hold ~25
// comparisons against retired ids; they were unreachable before this change and
// are provably dead after it, and porting them is its own item.
{
  const stateSrc = readFileSync('js/state.js', 'utf8');
  const table = stateSrc.slice(stateSrc.indexOf('export const RETIRED_ROOMS'));
  const retired = new Set([...table.slice(0, table.indexOf('};')).matchAll(/(\w+):\s*'/g)].map((m) => m[1]));
  const src = readFileSync('js/main.js', 'utf8');
  const slice = (from, to) => {
    const a = src.indexOf(from);
    const b = src.indexOf(to, a);
    return a < 0 || b < 0 ? null : src.slice(a, b);
  };
  const regions = {
    loadRoom: slice('async function loadRoom(', '\n// Per-room mood'),
    updateMusic: slice('function updateMusic()', '\n}\n'),
    bossVictory: slice("spawnShards(world, world.boss.x", 'persist(); // form unlock'),
  };
  const bad = [];
  for (const [name, body] of Object.entries(regions)) {
    if (!body) { bad.push(`${name}: could not be located — the anchor moved`); continue; }
    for (const m of body.matchAll(/(?:state\.room|\bid) === '(\w+)'/g)) {
      if (retired.has(m[1])) bad.push(`${name}: '${m[1]}' is a retired id`);
    }
    for (const m of body.matchAll(/setAmbient\(\{([^}]*)\}/g)) {
      for (const k of m[1].matchAll(/(\w+):/g)) if (retired.has(k[1])) bad.push(`${name}: ambient key '${k[1]}' is retired`);
    }
  }
  check('no retired id is keyed on in loadRoom / updateMusic / the boss victory',
    bad.length === 0, bad.length ? bad : undefined);
  console.log(`  (${retired.size} retired ids in the table)`);
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 } })).newPage();
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'ROOMID');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.player.iframes = 99999;
});

// Park in a room the way verify-den does — the respawn path builds it and is
// the only route into an arbitrary room that does not go through a door.
const park = async (room) => {
  for (let a = 0; a < 8; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.state.room === r && window.__game.player.hearts > 1,
        room, { timeout: 45000 });
      await page.evaluate(() => { window.__game.player.iframes = 99999; });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

// Stand on a door and let the world tick until the room changes. Doors are read
// once per frame from the player's real position — no teleport, no shortcut.
const walkThrough = async (x, z, from) => {
  await page.evaluate(([px, pz]) => {
    const g = window.__game;
    g.player.root.position.x = px; g.player.root.position.z = pz;
  }, [x, z]);
  try {
    await page.waitForFunction((f) => window.__game.state.room !== f, from, { timeout: 60000 });
  } catch { return null; }
  await page.waitForFunction(() => !document.getElementById('fade')
    || getComputedStyle(document.getElementById('fade')).opacity === '0', null, { timeout: 30000 }).catch(() => {});
  return page.evaluate(() => {
    const g = window.__game;
    return {
      room: g.state.room,
      resolved: g.resolveRoom(g.state.room),
      // What updateMusic ASKED for. `_musicName` is only stamped after an
      // async decode, which under SwiftShader lands well after the fade — the
      // branch chosen is the thing under test, not the decoder's latency.
      music: g.audio._wantMusic && g.audio._wantMusic.name,
      region: g.state.region,
      hasBoss: !!g.world.boss,
    };
  });
};

console.log('\n── the case the queue named: f1 south, which targets `w5` ─────');
if (!await park('f1')) { check('f1 builds', false); await b.close(); process.exit(1); }
check('f1 builds', true);
// f1's south door: addDoor(-1.3, 1.3, 5.85, 7.2, 'w5', …)
const viaF1 = await walkThrough(0, 6.4, 'f1');
check('walking f1 south lands somewhere', !!viaF1, viaF1);
if (viaF1) {
  check('...and the id stored is the room built', viaF1.room === viaF1.resolved, viaF1.room);
  check('...which is Sylva\'s Glade, tgl', viaF1.room === 'tgl', viaF1.room);
  check('...with the Wild Woods region', viaF1.region === 'wildwoods', viaF1.region);
  check('...and the boss track playing', viaF1.hasBoss && /boss/.test(viaF1.music || ''), viaF1.music);
}

console.log('\n── the same arena by its own door: tc4 → tgl ─────────────────');
// The glade's own door is the conclude step: it only exists once the great
// thorn-knot is cut (`when: () => WS.get('wild3','knotCut')`).
await page.evaluate(() => window.__game.WS.set('wild3', 'knotCut'));
if (!await park('tc4')) { check('tc4 builds', false); }
const doorTo = await page.evaluate(() => {
  // find tc4's door into tgl and stand in the middle of it
  const d = (window.__game.world.doors || []).find((x) => x.to === 'tgl');
  return d ? { x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 } : null;
});
check('tc4 has a door to tgl', !!doorTo, doorTo);
let viaT4a = null; // the glade's own approach
if (doorTo) {
  viaT4a = await walkThrough(doorTo.x, doorTo.z, 'tc4');
  check('walking it lands in tgl', viaT4a && viaT4a.room === 'tgl', viaT4a);
}

console.log('\n── route independence ────────────────────────────────────────');
if (viaF1 && viaT4a) {
  check('the room reads the same by either door', viaF1.room === viaT4a.room, [viaF1.room, viaT4a.room]);
  check('the region reads the same', viaF1.region === viaT4a.region, [viaF1.region, viaT4a.region]);
  check('the music is the same', viaF1.music === viaT4a.music, [viaF1.music, viaT4a.music]);
} else {
  check('route independence could be compared', false);
}

console.log('\n── the invariant holds wherever a door leads ─────────────────');
// Every door out of the rooms we can stand in: crossing one must never leave a
// retired id in state.room. Sampled rather than exhaustive — a full sweep is
// 99 room builds under SwiftShader.
const sample = [];
for (const room of ['tgl', 'la', 'vh']) {
  if (!await park(room)) { sample.push({ room, built: false }); continue; }
  const doors = await page.evaluate(() => (window.__game.world.doors || [])
    .map((d) => ({ to: d.to, x: (d.minX + d.maxX) / 2, z: (d.minZ + d.maxZ) / 2 })));
  for (const d of doors.slice(0, 2)) {
    const got = await walkThrough(d.x, d.z, room);
    sample.push({ from: room, door: d.to, landed: got && got.room, clean: !!got && got.room === got.resolved });
    if (got) await park(room);
  }
}
check('no door crossing stores an unresolved id', sample.length > 0 && sample.every((s) => s.clean !== false), sample);

console.log('\n' + (errors.length ? '✗ ' + errors.length + ' FAILED:\n  ' + errors.join('\n  ') : '✓ ALL CLEAN'));
await b.close();
process.exit(errors.length ? 1 : 0);
