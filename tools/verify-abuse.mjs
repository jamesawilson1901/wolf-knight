// STANDING STILL MUST NEVER PAY OUT. (Post-mortem promise, 2026-08-31.)
//
// Dad's exact bug: "collect a shard over your head, and then stand in the
// circle... and get pretty much infinite shards" — 3,504 coins from doing
// nothing but standing on a filled socket. The root cause (js/carry.js): the
// retrieve and place branches were BOTH proximity-automatic with no
// cooldown, so standing still retrieved the stone one frame and re-placed it
// the next, forever, and lg3's onFill paid 20 shards on every re-place.
//
// Every suite the game had verified that filling a socket WORKS. None asked
// whether repeating the same action, from the same spot, without moving, is
// safe — the exact class of bug the fix (hysteresis: a socket must see the
// player LEAVE its radius before it will act again) exists to close. This
// suite is the guard: for every carry socket in the game (js/carry.js
// `socket()`), stand on it, let it settle once, then hold position and
// assert nothing happens again — no more state flips, no currency drift —
// until the player actually steps away.
//
// SCOPE, HONESTLY: this covers carry sockets only, because that is the one
// concrete abuse case this session found and fixed. Levers, pressure plates,
// and other proximity-automatic interactables are NOT covered here — they
// are a real gap, noted in BUILDLOG's post-mortem, and worth a suite of
// their own if a similar bug turns up in one of them.
import { launchBrowser } from './launch.mjs';
import { allRooms } from './all-rooms.mjs';

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
await page.fill('#t-name', 'ABUSE');
await page.locator('#t-start').dispatchEvent('pointerdown');
await page.waitForFunction(() => window.__game && window.__game.world, null, { timeout: 90000 });
const ROOMS = process.argv.slice(2).length ? process.argv.slice(2) : await allRooms(page);
await page.evaluate(() => { const g = window.__game;
  g.state.settings.musicVol = 0; g.state.settings.sfxVol = 0;
  g.state.formsUnlocked = ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf',
    'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'];
  g.player.iframes = 999999;
});
for (let i = 0; i < 60; i++) {
  await page.evaluate(() => { window.__game.narration.blocking = false; });
  await new Promise((r) => setTimeout(r, 33));
}

const go = async (room) => {
  for (let a = 0; a < 6; a++) {
    await page.evaluate((r) => { const g = window.__game;
      g.narration.blocking = false;
      g.state.room = r; g.player.iframes = 0; g.player.hearts = 0.5;
      g.player.hurt(99, { pierceDefend: true }); }, room);
    try {
      await page.waitForFunction((r) => {
        window.__game.narration.blocking = false;
        const g = window.__game;
        return g.world && g.world.roomId === window.__game.resolveRoom(r) && g.player.hearts > 1;
      }, room, { timeout: 45000 });
      return true;
    } catch { /* retry */ }
  }
  return false;
};

let checkedSockets = 0;
const minted = [];
for (const room of ROOMS) {
  if (!(await go(room))) { check(`${room} builds`, false); continue; }
  const hasSockets = await page.evaluate(() => (window.__game.world.sockets || []).length > 0);
  if (!hasSockets) continue;
  const results = await page.evaluate(async () => {
    const g = window.__game, w = g.world;
    g.player.iframes = 999999; g.player.hearts = 12;
    const out = [];
    for (let si = 0; si < (w.sockets || []).length; si++) {
      const s = w.sockets[si];
      // whatever the fresh-save state is, stand on it and let one action —
      // retrieve or place — settle before the abuse window starts
      g.player.root.position.set(s.x, 0, s.z);
      for (let i = 0; i < 20; i++) { g.narration.blocking = false; await new Promise((r) => requestAnimationFrame(r)); }
      const shards0 = g.state.shards;
      const filled0 = s.filled;
      let flips = 0, last = s.filled;
      for (let i = 0; i < 180; i++) {   // three seconds, standing still
        g.narration.blocking = false;
        g.player.root.position.set(s.x, 0, s.z);   // hold the exact spot
        await new Promise((r) => requestAnimationFrame(r));
        if (s.filled !== last) { flips++; last = s.filled; }
      }
      out.push({ id: s.id, flips, dShards: g.state.shards - shards0, filled0, filled1: s.filled });
    }
    return out;
  });
  for (const r of results) {
    checkedSockets++;
    const ok = r.flips === 0 && r.dShards === 0;
    if (!ok) minted.push({ room, ...r });
    check(`${room} socket "${r.id}": standing still after it settles does nothing more`, ok, r);
  }
}

check('no socket in the game pays out or re-acts while stood on', minted.length === 0,
  { checkedSockets });
console.log(errors.length ? `\n${errors.length} PROBLEM(S)`
  : `\nALL CLEAN — ${checkedSockets} socket(s) across ${ROOMS.length} rooms, none mintable by standing still.`);
await b.close();
process.exit(errors.length ? 1 : 0);
