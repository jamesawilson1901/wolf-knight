// LAW W2 — THE NOUN LAW: every concrete noun in narration must exist as a
// spawned, visible object in the referenced scene.
//
// Known-bad precedent (context pack §11.1, fixed in 733c53c): the shoulder
// pin's own hint line told a child "then the giant's door swings open" —
// but no giant/statue/door mesh existed anywhere; the burnable was just
// scorch-tinted bush+logStack+stump. The fix added a dedicated `titanArm()`
// prop (level2.js:1354) whose hand visibly falls when the pin burns, and
// rewrote the line to "holding the giant's hand up." That fix is why this
// ruler can't validate against LIVE code — it's fail-first tested against
// the pre-fix narration.js + level2.js instead (LAW 10).
//
// No NLP at test time, so this targets the actual failure class: a hint
// line naming a BIG, ONE-OF noun (titan, giant, arm, hand, statue, ...)
// that implies a purpose-built prop, not a generic kit reuse. Any such
// line must be backed by a function in the SAME room file (the one that
// assigns the line's marker via GATE_HINTS) whose name contains a matching
// keyword — a cheap, mechanical proxy for "a dedicated visible object
// exists," not a substitute for eyes on the room.
import { readFileSync, readdirSync } from 'fs';

const problems = [];
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => { console.log(`✗ ${m}`); problems.push(m); };

// One-off, structurally-significant nouns that cannot be satisfied by a
// generic bush/log/rock/stump kit reuse without a dedicated shape.
const BIG_NOUNS = /\b(titan|giant|colossus|statue|dragon|golem|beast|engine|machine|arm|hand|fist|creature|monster)\b/gi;
// Code often names the prop after a synonym of the narrated word (a room's
// "giant" is the code's "titan") — a noun counts as covered if either its
// own word or a known synonym appears in a function name.
const SYNONYMS = { giant: ['titan'], titan: ['giant'], colossus: ['titan', 'giant'] };

const main = readFileSync('js/main.js', 'utf8');
const narration = readFileSync('js/narration.js', 'utf8');

// LINES = { id: { ..., text: '...' }, ... } — grab id + text pairs.
const linesBlock = (narration.match(/export const LINES = \{[\s\S]*?\n\};/) || [''])[0];
const LINE_TEXT = {};
for (const m of linesBlock.matchAll(/(\w+):\s*\{[^}]*?text:\s*'((?:[^'\\]|\\.)*)'/gs)) {
  LINE_TEXT[m[1]] = m[2];
}

// GATE_HINTS = [{ marker, form, line }, ...] and PROMISES entries carry a
// `say`/`line` field pointing at a LINES id — collect (marker, lineId) pairs
// from both tables.
const pairs = [];
const gateBlock = (main.match(/const GATE_HINTS = \[[\s\S]*?\n\];/) || [''])[0];
for (const m of gateBlock.matchAll(/\{\s*marker:\s*'(\w+)'[^}]*?line:\s*'(\w+)'/g)) {
  pairs.push({ marker: m[1], lineId: m[2] });
}
const promisesBlock = (main.match(/const PROMISES = \[[\s\S]*?\n\];/) || [''])[0];
for (const m of promisesBlock.matchAll(/\{\s*marker:\s*'(\w+)'[^}]*?say:\s*'(\w+)'/gs)) {
  pairs.push({ marker: m[1], lineId: m[2] });
}

const roomFiles = readdirSync('js').filter((f) => /^level\d\.js$/.test(f) || f === 'rooms.js');
const fileSrc = {};
const read = (f) => (fileSrc[f] = fileSrc[f] ?? readFileSync(`js/${f}`, 'utf8'));

const n0 = problems.length;
let checked = 0;
for (const { marker, lineId } of pairs) {
  const text = LINE_TEXT[lineId];
  if (!text) continue;
  const nouns = [...new Set((text.match(BIG_NOUNS) || []).map((s) => s.toLowerCase()))];
  if (!nouns.length) continue;
  checked++;
  const owner = roomFiles.find((f) => new RegExp(`markers\\.${marker}\\s*=`).test(read(f)));
  if (!owner) {
    bad(`line '${lineId}' ("${text}") names [${nouns.join(', ')}] but no room file assigns markers.${marker} at all`);
    continue;
  }
  const src = read(owner);
  const candidates = nouns.flatMap((n) => [n, ...(SYNONYMS[n] || [])]);
  const hasDedicatedProp = candidates.some((n) => new RegExp(`function \\w*${n}\\w*\\s*\\(`, 'i').test(src));
  if (!hasDedicatedProp) {
    bad(`line '${lineId}' ("${text}") for marker ${marker} (${owner}) names [${nouns.join(', ')}] but no dedicated prop function matching those nouns exists in ${owner}`);
  }
}
if (problems.length === n0) ok(`every hint line naming a big one-off noun has a matching dedicated prop function (${checked} checked)`);

console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nALL CLEAN.');
process.exit(problems.length ? 1 : 0);
