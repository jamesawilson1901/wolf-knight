// WHERE CAN A BODY ACTUALLY STAND?
//
// Ask the LIVE, fully-built room — props solidified, enemies spawned — the
// only question that matters for a placement: does resolveCircle move a body
// of enemy radius off this point? Anything else (world.blocked, a mesh dump,
// reading the builder) answers a different question. blocked() reads
// keep-clear RESERVES, which mean "no props here", not "no creatures".
//
// WK_SPOTS='room:x,z;x,z|room:x,z' checks named points and, for any that is
// occupied, prints the nearest free one. WK_ROOMS='a,b' dumps the free grid.
import { chromium } from 'playwright';

// The LARGEST roster body radius (ashen-vanguard, 0.44), so a spot this says
// is clear is clear for anything placed on it. NOT resolveCircle: that answers
// "would a body be pushed off here", which is a different and weaker question
// — it cannot push a body out of a circle it is exactly centred in, so it
// calls a brazier's own centre clear. verify-spawn-clear asks for overlap, and
// overlap is what a placement has to satisfy, so that is what this asks too.
const R = 0.44;
const SPOTS = (process.env.WK_SPOTS || '').split('|').filter(Boolean).map((s) => {
  const [room, pts] = s.split(':');
  return { room, pts: pts.split(';').map((p) => p.split(',').map(Number)) };
});
const ROOMS = SPOTS.length ? SPOTS.map((s) => s.room)
  : (process.env.WK_ROOMS || 'dtp').split(',');

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await b.newContext({ viewport: { width: 640, height: 360 } })).newPage();
page.on('pageerror', (e) => console.error('ERR', e.message));
await page.goto('http://localhost:8901/index.html', { waitUntil: 'load' });
await page.waitForSelector('#title', { state: 'visible', timeout: 20000 });
await page.locator('.profile-btn.new').dispatchEvent('pointerdown');
await page.fill('#t-name', 'FREE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  g.state.settings.captions = false; g.state.settings.voice = false; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf'];
  g.player.iframes = 99999;
  g.WS.set('wild3', 'rootCut', true); g.WS.set('wild3', 'logDown', true);
});
const go = async (room) => {
  for (let a = 0; a < 6; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => window.__game.world
        && window.__game.world.roomId === window.__game.resolveRoom(r)
        && window.__game.player.hearts > 1, room, { timeout: 40000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

let bad = 0;
for (const id of ROOMS) {
  if (!await go(id)) { console.log(id, 'FAILED TO BUILD'); bad++; continue; }
  const want = (SPOTS.find((s) => s.room === id) || {}).pts || null;
  const r = await page.evaluate(({ want, R }) => {
    const w = window.__game.world;
    const freeAt = (x, z) => {
      for (const c of w.boxColliders) {
        const cx = Math.max(c.minX, Math.min(x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) return false;
      }
      for (const c of w.circleColliders) {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + R) ** 2) return false;
      }
      return true;
    };
    const grid = [];
    for (let x = -(w.halfW - 1); x <= w.halfW - 1; x += 0.5)
      for (let z = -(w.halfD - 1); z <= w.halfD - 1; z += 0.5)
        if (freeAt(x, z)) grid.push([+x.toFixed(1), +z.toFixed(1)]);
    const checked = (want || []).map(([x, z]) => {
      if (freeAt(x, z)) return { x, z, ok: true };
      let best = null, bd = Infinity;
      for (const [gx, gz] of grid) {
        const d = Math.hypot(gx - x, gz - z);
        if (d < bd) { bd = d; best = [gx, gz]; }
      }
      return { x, z, ok: false, nearest: best, d: +bd.toFixed(2) };
    });
    return { half: [w.halfW, w.halfD], nFree: grid.length, checked,
      grid: want ? null : grid };
  }, { want, R });
  if (!want) {
    console.log(`== ${id}  half ${r.half}  free ${r.nFree}`);
    console.log('   ' + r.grid.map((p) => p.join(',')).join(' '));
    continue;
  }
  for (const c of r.checked) {
    if (c.ok) console.log(`  ok   ${id} (${c.x}, ${c.z})`);
    else { bad++; console.log(`  BAD  ${id} (${c.x}, ${c.z}) → nearest free (${c.nearest}) ${c.d}u away`); }
  }
}
console.log(bad ? `\n${bad} occupied` : '\nall clear');
await b.close();
