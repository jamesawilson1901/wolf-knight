// THE MASHER. Walk at the boss and hold the attack button — nothing else, no
// reading, no dodging. Dad's complaint was that this WINS; the guard is meant
// to make it slow rather than impossible. This measures which.
import { launch } from './wk-drive.mjs';

const room = process.argv[2] || 'le';
const forms = { le: ['knight', 'dark_wolf', 'fire_wolf'],
  tgl: ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf'],
  xth: ['knight', 'dark_wolf', 'fire_wolf', 'earth_wolf', 'verdant_wolf', 'frost_wolf', 'storm_wolf', 'tide_wolf', 'ghost_wolf'] }[room];
const SECONDS = +(process.argv[3] || 90);

const wk = await launch({ timescale: 1 });
await wk.newGame('MASH');
await wk.page.evaluate(({ r, f }) => window.__wkJump(r, f), { r: room, f: forms });
await wk.page.waitForFunction((r) => window.__wk.room === r && !window.__wk.gates.transitioning, room, { timeout: 60000 });
// NO INVULNERABILITY. The first cut of this probe set iframes to 999999 and
// then reported "five hearts left" as if that meant something — a masher who
// cannot be hurt is not a masher, it is a measuring stick with the interesting
// half sawn off. The whole question is what mashing COSTS.
await wk.page.evaluate(() => { window.__game.state.settings.captions = false;
  window.__game.narration.skip(); });

const boss = () => wk.page.evaluate(() => {
  const b = window.__game.world.boss;
  return b ? { hp: +b.coreHp.toFixed(2), action: b.action } : null;
});
const start = await boss();
console.log('start', JSON.stringify(start));
const seen = {};
const t0 = Date.now();
let taps = 0, hits = 0, deaths = 0;
let lastH = await wk.wk('hearts');
while ((Date.now() - t0) / 1000 < SECONDS) {
  const b = await boss();
  if (!b) { console.log('boss gone'); break; }
  seen[b.action] = (seen[b.action] || 0) + 1;
  const p = await wk.wk('pos');
  const bx = await wk.page.evaluate(() => { const w = window.__game.world.boss;
    return { x: w.x + w.core.position.x, z: w.z + w.core.position.z }; });
  const d = Math.hypot(bx.x - p.x, bx.z - p.z);
  if (d > 1.7) await wk.walkTo(bx.x, bx.z, { timeout: 2, arrive: 1.5 });
  await wk.page.keyboard.press('j'); taps++;
  const h = await wk.wk('hearts');
  if (h < lastH) { hits++; console.log(`  took a hit during ${b.action}: ${lastH} -> ${h} (d ${d.toFixed(2)})`); }
  if (h <= 0.5) { deaths++; console.log('  DIED'); await wk.page.waitForTimeout(4000); }
  lastH = await wk.wk('hearts');
  await wk.page.waitForTimeout(120);
}
const end = await boss();
const dt = (Date.now() - t0) / 1000;
console.log(JSON.stringify({ room, seconds: +dt.toFixed(1), taps,
  from: start && start.hp, to: end && end.hp,
  dealt: +(((start && start.hp) || 0) - ((end && end.hp) || 0)).toFixed(2),
  perSecond: +((((start && start.hp) || 0) - ((end && end.hp) || 0)) / dt).toFixed(3),
  heartsLeft: (await wk.wk('hearts')), hitsTaken: hits, deaths, actionsSeen: seen }));
console.log('errors', wk.errors.slice(0, 3));
await wk.b.close();
