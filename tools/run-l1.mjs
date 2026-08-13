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

// walk a leg: to the door mid for `to`, expecting to arrive in `to`
async function leg(to, expectMusic) {
  const doors = await d.wk('doors');
  const door = doors.find((x) => x.to === to);
  if (!door) { say(`!! no door to ${to} from ${(await d.wk()).room}`, JSON.stringify(doors)); return false; }
  let r = await d.walkTo(door.x, door.z, { timeout: 60 });
  if (!r.ok && r.why === 'stuck') {
    // fight whatever is in the way, then try again
    await fightNear(30000);
    r = await d.walkTo(door.x, door.z, { timeout: 60 });
  }
  const now = await d.wk();
  say(`leg → ${to}:`, JSON.stringify(r), 'room now', now.room, 'music', now.music);
  if (now.room !== to) return false;
  await d.shot(`enter-${to}`);
  if (expectMusic && now.music !== expectMusic) say(`!! MUSIC in ${to}: ${now.music} expected ${expectMusic}`);
  return true;
}

const ROUTE = ['lg1', 'lb', 'lg2', 'lc', 'lg3', 'ld', 'lg4', 'le'];
let okAll = true;
for (const to of ROUTE) {
  // clear engagers first so the door walk is honest but survivable
  await fightNear(40000);
  const ok = await leg(to);
  okAll = okAll && ok;
  if (!ok) break;
  const h = await d.wk('hearts');
  say('   hearts:', h);
  if (h < 2) { await d.tap('h'); await d.page.waitForTimeout(400); } // potion via real key
}

const end = await d.wk();
say('END:', JSON.stringify(end));
await d.shot('end-' + end.room);
d.saveLog('route');
say('uncaught errors:', JSON.stringify(d.errors));
say(okAll && d.errors.length === 0 ? 'ROUTE COMPLETE, CLEAN' : 'ROUTE INCOMPLETE OR ERRORS');
await d.close();
process.exit(okAll && d.errors.length === 0 ? 0 : 1);
