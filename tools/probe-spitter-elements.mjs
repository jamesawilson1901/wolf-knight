// THE FIRE-SPITTER'S ELEMENTAL LESSON, MEASURED.
// Dad's call: a thing that spits fire shrugs off fire and fears water and ice.
// Drive the real damage pipeline on a real spawned Spitter and check the
// multipliers land in the documented order (resist 0.4x, weakness 1.5x,
// rounded to 0.5 with a 0.5 floor so RESIST is never immunity).
import { launch } from './wk-drive.mjs';

const d = await launch({ evidenceDir: 'test-evidence/combat/spitter', timescale: 1 });
const say = (...a) => console.log(...a);
let ok = true;

await d.newGame('SPIT');
await d.jump('vb3', ['knight', 'dark_wolf', 'fire_wolf']);   // Stoneroot: The Rattle
await d.page.waitForFunction(() => !window.__game.narration.speaking, null, { timeout: 20000 }).catch(() => {});

const probe = await d.page.evaluate(() => {
  const w = window.__game.world;
  const s = (w.enemies || []).find((e) => e.constructor.name === 'Spitter');
  if (!s) return { found: false };
  const out = { found: true, weakness: s.weakness, resist: s.resist, hits: {} };
  for (const el of ['steel', 'fire', 'frost', 'tide', 'moon']) {
    s.hp = 999; s.dead = false; s.stunned = 0; s.frozen = 0;
    const before = s.hp;
    s.takeDamage(5, el, 'melee');
    out.hits[el] = +(before - s.hp).toFixed(2);
  }
  return out;
});
say('spitter:', JSON.stringify(probe));
if (!probe.found) { say('FAIL: no Spitter in vb3'); await d.close(); process.exit(1); }

const H = probe.hits;
const chk = (label, cond, detail) => { say(`${cond ? '✓' : '✗'} ${label} ${detail}`); if (!cond) ok = false; };
chk('fire RESISTS (0.4x of 5 = 2.0)', H.fire === 2, `got ${H.fire}`);
chk('frost is SUPER (1.5x of 5 = 7.5)', H.frost === 7.5, `got ${H.frost}`);
chk('tide is SUPER (1.5x of 5 = 7.5)', H.tide === 7.5, `got ${H.tide}`);
chk('steel is neutral (5.0)', H.steel === 5, `got ${H.steel}`);
chk('moon is neutral (5.0)', H.moon === 5, `got ${H.moon}`);
chk('RESIST is never immunity (fire > 0)', H.fire > 0, `got ${H.fire}`);

say('errors:', JSON.stringify(d.errors));
ok = ok && d.errors.length === 0;
say(ok ? 'SPITTER ELEMENTS: PASS' : 'SPITTER ELEMENTS: FAIL');
await d.close();
process.exit(ok ? 0 : 1);
