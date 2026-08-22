// LAW P7 — BOSS UNIQUENESS: bosses keep family grammar (LAW: bosses fight
// like their family) but every boss must add >=1 unique, named tell/move
// the family mook doesn't have. A boss may never be a pure tint+stat copy
// of a PREVIOUS BOSS — same class + same model + same moveset + new skin.
//
// Known-bad (context pack §11.9, STILL LIVE): Sylva (Wild Woods, L3) is the
// Shadowgrip class + wolf.gltf + skin:'sylva' with only `speedMult` set —
// the exact same fields every other SKINS entry carries, no unique
// mechanic. Compare Aria (`gales`, js/boss.js:59), Meri (`floods`, :81) and
// Grimm (`adapts`, :108) — each SHARES Shadowgrip's class too (the file's
// own comments defend this explicitly: "bosses fight like their family"),
// but each also carries a genuine, named, documented unique mechanic field
// Sylva doesn't have.
//
// Mechanical proxy for "has a unique move": a SKINS entry key beyond the
// baseline fields every entry carries regardless of uniqueness. Cheap,
// precise, and directly matches how this codebase already signals a
// boss's special mechanic (a dedicated field the fight code reads), not a
// guess at animation names.
import { readFileSync } from 'fs';

const problems = [];
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => { console.log(`✗ ${m}`); problems.push(m); };

const BASELINE = new Set(['name', 'body', 'glow', 'eyes', 'burst', 'maxHp', 'dmg', 'saveKey', 'legacyPhases', 'cinder', 'speedMult']);

const src = readFileSync('js/boss.js', 'utf8');
const skinsBlock = (src.match(/const SKINS = \{[\s\S]*?\n\};/) || [''])[0];
if (!skinsBlock) { console.log('✗ could not find SKINS — ruler is broken, stopping'); process.exit(1); }

// top-level `name: {` entries within SKINS (2-space indent, matching the
// codebase's own formatting), and every key inside each entry's braces.
const skins = [];
for (const m of skinsBlock.matchAll(/^ {2}(\w+):\s*\{([\s\S]*?)\n {2}\},/gm)) {
  const [, id, body] = m;
  // any `key:` anywhere in the entry body, not just line-starts — multiple
  // fields often share one physical line (e.g. `body: X, glow: Y, eyes: Z,`).
  const keys = new Set([...body.matchAll(/(?:^|[,\s{])(\w+):/gm)].map((k) => k[1]));
  skins.push({ id, keys });
}
console.log(`SKINS entries found: [${skins.map((s) => s.id).join(', ')}]`);

const n0 = problems.length;
// shadowgrip is the ORIGINAL — LAW P7 is about not copying a PREVIOUS boss,
// so it has nothing to be unique from and is exempt by definition.
for (const s of skins) {
  if (s.id === 'shadowgrip') continue;
  const extra = [...s.keys].filter((k) => !BASELINE.has(k));
  if (!extra.length) {
    bad(`${s.id}: shares Shadowgrip's class/model with only baseline fields [${[...s.keys].join(', ')}] — no unique mechanic, the Sylva pattern (P7 violation)`);
  }
}
if (problems.length === n0) {
  ok(`every non-original boss has a unique mechanic field beyond the baseline: ${skins.filter((s) => s.id !== 'shadowgrip').map((s) => `${s.id}=[${[...s.keys].filter((k) => !BASELINE.has(k)).join(',')}]`).join(', ')}`);
}

// LAW P6 — ROSTER VARIETY (informational census, not asserted): each region
// should introduce >=1 new body OR a >=2-axis variant beyond tint. Calling
// "genuinely new" vs "just another palette-swap" needs a human judgment
// this ruler doesn't try to make — logged as NOTES per region instead,
// matching check-materials.mjs's same call on the same kind of ambiguity.
console.log('\n── LAW P6 roster census (informational) ──');
const BASE_CLASS_SPOTS = {
  houndSpots: 'Hound', slimeSpots: 'Slime', spitterSpots: 'Spitter',
  batSpots: 'Bat', mothSpots: 'Moth', shieldSpots: 'SkeletonShield',
  rogueSpots: 'SkeletonRogue', minionSpots: 'SkeletonMinion',
};
const REGION_FILES = { L1: 'level1.js', L2: 'level2.js', L3: 'level3.js', L5: 'level5.js', L6: 'level6.js', L7: 'level7.js' };
for (const [region, file] of Object.entries(REGION_FILES)) {
  const s = readFileSync(`js/${file}`, 'utf8');
  const classes = new Set();
  for (const [spot, cls] of Object.entries(BASE_CLASS_SPOTS)) if (s.includes(`markers.${spot}`)) classes.add(cls);
  const variants = new Set([...s.matchAll(/variant:\s*'([a-zA-Z0-9_]+)'/g)].map((m) => m[1]));
  console.log(`  ${region}: base classes [${[...classes].join(', ') || 'none'}], variants [${[...variants].join(', ') || 'none'}]`);
}
console.log('  (eight monster models sit unused on disk per §1.8 — werewolf/rat-pack/owl/dodo/kregger/');
console.log('   oceanic-juggernaut/robot-a8lot/a second dragon — candidates for a genuinely new region-5+ body)');

console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nALL CLEAN.');
process.exit(problems.length ? 1 : 0);
