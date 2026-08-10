// THE BEATS THE BIBLE PROMISES, ONCE PER REGION.
//
// STORY-BIBLE, "Rules for new lines", is explicit: Grimm taunts once per region
// with escalating doubt; Luna dreams once per region end with comfort and a
// destination. Only Grimm's FIRST taunt was ever written, so the villain of the
// game went silent for six regions — a child beat Stoneroot, the Woods,
// Frostpeak, Stormreach and the Vale and never heard from him again until the
// last room. And Luna counted the lights in every dream except the second.
//
// Nothing checked either, because a missing line looks exactly like a line that
// has not been reached yet. This reads the script and the wiring instead.
import { readFileSync } from 'node:fs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const narr = readFileSync('js/narration.js', 'utf8');
const main = readFileSync('js/main.js', 'utf8');

const REGIONS = 6;   // six region ENDS; the seventh is the finale itself

console.log('\n── 1. Grimm taunts once per region ──────────────────');
for (let i = 1; i <= REGIONS; i++) {
  const id = `grimm_taunt_${i}`;
  const written = new RegExp(`^\\s*${id}:`, 'm').test(narr);
  const wired = main.includes(`narration.say('${id}')`);
  check(`${id} is written and actually fires`, written && wired, { written, wired });
}

console.log('\n── 2. ...and the doubt escalates ────────────────────');
// Not a poetry review: the last taunts must stop being about Kael and start
// being about Grimm, which is the reveal arriving. Cheap proxy, but it fails
// loudly if someone writes six interchangeable sneers.
const texts = [];
for (let i = 1; i <= REGIONS; i++) {
  const m = narr.match(new RegExp(`grimm_taunt_${i}:[^\\n]*text: '([^']*)'`));
  texts.push(m ? m[1] : '');
}
check('every taunt has words in it', texts.every((t) => t.length > 20),
  texts.map((t) => t.length));
check('they are all different lines', new Set(texts).size === REGIONS);
const late = texts.slice(3).join(' ').toLowerCase();
check('by the end he is talking about himself, not about Kael',
  /\bi\b|\bme\b|\bmy\b|\bmine\b/.test(late), { late: late.slice(0, 80) });

console.log('\n── 3. Luna counts the lights, every time ────────────');
const WORDS = ['one', 'two', 'three', 'four', 'five', 'six'];
for (let i = 1; i <= REGIONS; i++) {
  const m = narr.match(new RegExp(`luna_dream_${i}:[^\\n]*text: '([^']*)'`));
  const text = m ? m[1].toLowerCase() : '';
  check(`luna_dream_${i} tells the child how many lights are lit`,
    text.includes(WORDS[i - 1]), { has: WORDS[i - 1], text: text.slice(0, 60) });
}

console.log('\n── 4. every dream is reachable ──────────────────────');
for (let i = 1; i <= REGIONS; i++) {
  check(`luna_dream_${i} is actually said somewhere`,
    main.includes(`narration.say('luna_dream_${i}')`));
}

console.log('\n' + (errors.length
  ? `✗ ${errors.length} FAILED\n` + errors.join('\n')
  : 'ALL CLEAN — he answers every region, and she counts them.'));
process.exit(errors.length ? 1 : 0);
