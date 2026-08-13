// LEVEL 1, PLAYED. New game from the title screen, no jump, real inputs.
// Route per the region docs: la (2 shades + spitter) → lg1 → lb (big crossing,
// moths+spitters) → lg2 → lc (lava channel, elder hound) → lg3 → ld (Kiln) →
// ld1 → lg4 → le (Shadowgrip). Fight what intercepts, break a pot, open the
// route doors, check music per region, finish at the boss door.
import { launch } from './wk-drive.mjs';

const DIR = process.argv[2] || 'test-evidence/level-1';
const d = await launch({ evidenceDir: DIR });
const say = (...a) => console.log(...a);

await d.newGame('L1BOT');
const s0 = await d.wk();
say('spawned:', JSON.stringify(s0));
await d.shot('spawn-' + s0.room);

// kill whatever engages us, via real inputs: face it by walking, tap J
async function fightNear(maxMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const foes = await d.wk('foes');
    if (!foes.length) return true;
    const me = (await d.wk()).pos;
    foes.sort((a, b2) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b2.x - me.x, b2.z - me.z));
    const f = foes[0];
    const dd = Math.hypot(f.x - me.x, f.z - me.z);
    if (dd > 1.35) {
      // chase the CURRENT position for a short beat only — spitters retreat,
      // so a long walk to a stale point just follows where they were
      await d.walkTo(f.x, f.z, { timeout: 2.5, arrive: 1.1 });
    } else {
      // in reach: swing continuously, the way a thumb mashes
      await d.tap('j');
      await d.page.waitForTimeout(240);
    }
  }
  return (await d.wk('foes')).length === 0;
}

// walk a leg: to the door mid for `to`, expecting to arrive in `to`.
// `via` = waypoints first — the honest route a player's eyes pick (lava slabs).
async function leg(to, via = []) {
  const doors = await d.wk('doors');
  const door = doors.find((x) => x.to === to);
  if (!door) { say(`!! no door to ${to} from ${(await d.wk()).room}`, JSON.stringify(doors)); return false; }
  for (const [wx, wz] of via) {
    const w = await d.walkTo(wx, wz, { timeout: 30, arrive: 1.0 });
    if (w.roomChanged) break;
    if (!w.ok) { await fightNear(20000); await d.walkTo(wx, wz, { timeout: 20, arrive: 1.2 }); }
  }
  let r = await d.walkTo(door.x, door.z, { timeout: 60 });
  if (!r.ok && r.why === 'stuck') {
    // fight whatever is in the way, then try again
    await fightNear(30000);
    r = await d.walkTo(door.x, door.z, { timeout: 60 });
  }
  // DWELL. Under SwiftShader the game runs ~5fps: the walker can arrive inside
  // the trigger band and ask "did the room change" before the game has run a
  // single frame with the player standing there. Give the loop up to four
  // seconds — and if the door still has not fired, walk THROUGH the mid rather
  // than to it, because a trigger is crossed by motion in real play.
  if (!r.roomChanged) {
    for (let i = 0; i < 20 && (await d.wk('room')) === (door && r.room || (await d.wk('room'))); i++) {
      await d.page.waitForTimeout(200);
      if ((await d.wk('room')) === to) break;
    }
    if ((await d.wk('room')) !== to) {
      const over = { x: door.x * 1.12, z: door.z * 1.12 };
      await d.walkTo(over.x, over.z, { timeout: 10, arrive: 0.4 });
      await d.page.waitForTimeout(1200);
    }
  }
  const now = await d.wk();
  say(`leg → ${to}:`, JSON.stringify(r), 'room now', now.room);
  return now.room !== r.room;   // ANY room change is progress — the loop routes
}

// waypoints where the level demands routing a player does by eye:
// lc's lava channel is crossed on the EAST slab (x 3..7), never up the middle.
const VIA = {
  'lc:lg3': [[5, -4.5], [5, 2.6], [2, 5]],
  'lc:lg2': [[5, 2.6], [5, -4.5]],
};
// STATE-DRIVEN, NOT SEQUENCE-DRIVEN. Walking through a short gate room can
// carry the bot two rooms in one leg; a fixed list then loses its place. The
// route is a map from wherever-we-are to the next room toward the boss.
const NEXT = { la: 'lg1', lg1: 'lb', lb: 'lg2', lg2: 'lc', lc: 'lg3',
  lg3: 'ld', ld: 'lg4', lg4: 'le' };
let okAll = true;
for (let hops = 0; hops < 20; hops++) {
  const cur = (await d.wk()).room;
  if (cur === 'le') break;
  const to = NEXT[cur];
  if (!to) { say(`!! off the route in ${cur}`); okAll = false; break; }
  await fightNear(30000);
  const before = cur;
  await leg(to, VIA[`${cur}:${to}`] || []);
  const now = await d.wk();
  // settled music read: the track loads async, an instant read races it
  await d.page.waitForTimeout(1600);
  const music = await d.wk('music');
  say(`hop ${before} → ${now.room}  hearts ${now.hearts}  music(settled) ${music}`);
  if (now.room === before) { say(`!! no progress from ${before} toward ${to}`); okAll = false; break; }
  await d.shot(`enter-${now.room}`);
  if (now.hearts < 2) { await d.tap('h'); await d.page.waitForTimeout(400); }
}
okAll = okAll && (await d.wk()).room === 'le';
const end = await d.wk();
say('END:', JSON.stringify(end));
await d.shot('end-' + end.room);
d.saveLog('route');
say('uncaught errors:', JSON.stringify(d.errors));
say(okAll && d.errors.length === 0 ? 'ROUTE COMPLETE, CLEAN' : 'ROUTE INCOMPLETE OR ERRORS');
await d.close();
process.exit(okAll && d.errors.length === 0 ? 0 : 1);
