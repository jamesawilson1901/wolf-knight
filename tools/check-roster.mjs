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
import { readFileSync, existsSync } from 'fs';

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

// MINI_ROSTER (v3.136, design/WIDER-WORLD.md §2.6) — every entry's body must
// actually exist on disk and bind the shared Rig_Medium clip library, the
// same guarantee KAYKIT_ROSTER already has by construction (spawnEnemies
// loads it from assets/generated/enemies/<body> and passes the shared
// rig-medium anims array — see js/enemies.js). Checked here as "the file
// exists" rather than parsed for a skin/skeleton, matching how this file
// already checks P7 by regexing the source rather than loading three.js.
console.log('\n── MINI_ROSTER bodies ──');
const enemiesSrc = readFileSync('js/enemies.js', 'utf8');
const miniBlock = (enemiesSrc.match(/const MINI_ROSTER = \{[\s\S]*?\n\};/) || [''])[0];
if (!miniBlock) {
  bad('could not find MINI_ROSTER in js/enemies.js');
} else {
  const bodies = [...miniBlock.matchAll(/body:\s*'([^']+)'/g)].map((m) => m[1]);
  if (!bodies.length) {
    bad('MINI_ROSTER has no entries with a body: — ruler is broken');
  } else {
    for (const body of bodies) {
      const path = `assets/generated/enemies/${body}`;
      if (existsSync(path)) ok(`MINI_ROSTER body exists: ${path}`);
      else bad(`MINI_ROSTER names a body that does not exist on disk: ${path}`);
    }
  }
}

// Every `variant:` string found anywhere in js/level*.js must be a real key
// in VARIANTS (js/enemies.js) — the P6 census above already extracts these
// strings per region file but only PRINTS them; this is that same regex,
// now asserted. Catches the exact class of silent no-op the design doc
// names: levelClimb.js's `variant: 'frost'`, which is not a VARIANTS key and
// therefore has applied nothing, in any region, since the day it was typed.
console.log('\n── variant: strings vs VARIANTS ──');
const variantsBlock = (enemiesSrc.match(/export const VARIANTS = \{[\s\S]*?\n\};/) || [''])[0];
if (!variantsBlock) {
  bad('could not find VARIANTS in js/enemies.js — ruler is broken');
} else {
  const variantKeys = new Set(
    [...variantsBlock.matchAll(/^ {2}(\w+):\s*\{/gm)].map((m) => m[1])
  );
  console.log(`VARIANTS keys found: [${[...variantKeys].join(', ')}]`);
  const { readdirSync } = await import('fs');
  const levelFiles = readdirSync('js').filter((f) => /^level.*\.js$/.test(f));
  const n1 = problems.length;
  for (const file of levelFiles) {
    // strip //-comments first — a comment MENTIONING a variant string (e.g.
    // explaining a fix) is not a live marker and must not be scanned as one.
    const s = readFileSync(`js/${file}`, 'utf8').replace(/\/\/.*$/gm, '');
    for (const m of s.matchAll(/variant:\s*'([a-zA-Z0-9_]+)'/g)) {
      const v = m[1];
      if (!variantKeys.has(v)) bad(`js/${file} sets variant: '${v}', which is not a key in VARIANTS — silent no-op`);
    }
  }
  if (problems.length === n1) ok('every variant: string in js/level*.js is a real VARIANTS key');
}

console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nALL CLEAN.');
process.exit(problems.length ? 1 : 0);
