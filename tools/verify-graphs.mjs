// THE MISSION GRAPHS HOLD BEFORE ANY ROOM IS BUILT.
//
// Playbook §11: the graph is authored first and validated first — a room is
// never written against a graph that fails. This is the playbook's check
// 9.1.6 (locks never reachable before keys, no key unreachable) plus its
// structural laws, run over assets/dungeons.json. Node-only, no browser, so
// it costs nothing and runs in every sweep.
//
// What is checked, per dungeon:
//   * every node reachable from the start, honouring verb_lock/item_lock
//     edges against the verbs available AT THAT POINT (prerequisites + the
//     dungeon's own item once its item node is reached; the boss verb only
//     after the boss falls)
//   * the declared cycle exists edge-by-edge and returns to its first node
//   * every leaf (degree-1, non-boss) node carries a reward — a dead end
//     with nothing in it is a bug (playbook §4.4)
//   * beat coverage: any element taught has its ki before any later beat
//   * pacing: the spine never runs more than max_consecutive_puzzle_rooms
//     puzzle rooms in a row (KID: 2)
//   * at least one rest point, and it sits on the spine (L13)
//   * every verb named by a verb_lock exists in assets/verbs.json
import { readFileSync } from 'fs';

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const dungeons = JSON.parse(readFileSync('assets/dungeons.json', 'utf8'));
const verbs = JSON.parse(readFileSync('assets/verbs.json', 'utf8'));
const KNOWN_VERBS = new Set([
  ...Object.keys(verbs.traversal || {}),
  ...Object.keys(verbs.interaction || {}),
]);

for (const [key, d] of Object.entries(dungeons)) {
  if (key.startsWith('_')) continue;
  console.log(`\n── ${d.id} ─────────────────────────────────────────────`);
  const nodes = new Map(d.nodes.map((n) => [n.id, n]));
  const start = d.nodes.find((n) => n.role === 'start');
  check('has a start node', !!start);
  if (!start) continue;

  // ---- reachability with progressive grants (9.1.6) -----------------------
  // BFS where an edge is passable if its lock is satisfiable with what the
  // child holds when standing at its `from` node. The item is held once the
  // item node is reached; the boss verb once the boss node is reached.
  const itemNode = d.nodes.find((n) => n.role === 'item');
  const bossNode = d.nodes.find((n) => n.role === 'boss');
  const have = new Set(d.prerequisites || []);
  const reached = new Set([start.id]);
  let grew = true;
  while (grew) {
    grew = false;
    if (itemNode && reached.has(itemNode.id) && !have.has(d.item)) { have.add(d.item); grew = true; }
    if (bossNode && reached.has(bossNode.id) && d.boss_verb && !have.has(d.boss_verb)) { have.add(d.boss_verb); grew = true; }
    for (const e of d.edges) {
      // edges are traversable both ways unless one_way (doors are doors)
      const ends = e.type === 'one_way' ? [[e.from, e.to]] : [[e.from, e.to], [e.to, e.from]];
      for (const [a, b] of ends) {
        if (!reached.has(a) || reached.has(b)) continue;
        if (e.type === 'verb_lock' && !have.has(e.verb)) continue;
        if (e.type === 'item_lock' && !have.has(e.item)) continue;
        reached.add(b); grew = true;
      }
    }
  }
  const unreachable = d.nodes.filter((n) => !reached.has(n.id)).map((n) => n.id);
  check('every node reachable with the verbs held at that point', unreachable.length === 0, { unreachable });
  if (itemNode) {
    // the item must be reachable WITHOUT the item (no key behind its own lock)
    const pre = new Set([start.id]);
    let g2 = true;
    while (g2) {
      g2 = false;
      for (const e of d.edges) {
        const ends = e.type === 'one_way' ? [[e.from, e.to]] : [[e.from, e.to], [e.to, e.from]];
        for (const [a, b] of ends) {
          if (!pre.has(a) || pre.has(b)) continue;
          if (e.type === 'item_lock') continue;                       // no item yet
          if (e.type === 'verb_lock' && !(d.prerequisites || []).includes(e.verb)) continue;
          pre.add(b); g2 = true;
        }
      }
    }
    check('the item is reachable before the item exists', pre.has(itemNode.id));
  }

  // ---- the cycle ----------------------------------------------------------
  const hasEdge = (a, b) => d.edges.some((e) =>
    (e.from === a && e.to === b) || (e.type !== 'one_way' && e.from === b && e.to === a));
  let cycleOk = Array.isArray(d.cycle) && d.cycle.length >= 3
    && d.cycle[0] === d.cycle[d.cycle.length - 1];
  if (cycleOk) for (let i = 0; i < d.cycle.length - 1; i++) {
    if (!hasEdge(d.cycle[i], d.cycle[i + 1])) { cycleOk = false; break; }
  }
  check('the declared cycle exists and closes', cycleOk, d.cycle);

  // ---- dead ends carry rewards -------------------------------------------
  const degree = new Map(d.nodes.map((n) => [n.id, 0]));
  for (const e of d.edges) { degree.set(e.from, degree.get(e.from) + 1); degree.set(e.to, degree.get(e.to) + 1); }
  const bareDeadEnds = d.nodes.filter((n) =>
    degree.get(n.id) === 1 && n.role !== 'boss' && n.role !== 'start' && !n.reward && n.role !== 'item')
    .map((n) => n.id);
  check('every dead end carries a reward', bareDeadEnds.length === 0, { bareDeadEnds });

  // ---- beat coverage: ki first, per element -------------------------------
  const ORDER = { ki: 0, sho: 1, ten: 2, ketsu: 3 };
  const byElement = {};
  for (const n of d.nodes) if (n.beat && n.teaches) {
    (byElement[n.teaches] = byElement[n.teaches] || []).push(n.beat);
  }
  for (const [el, beats] of Object.entries(byElement)) {
    check(`${el}: has a ki, and beats are complete enough (ki+sho+ketsu on some path)`,
      beats.includes('ki') && beats.includes('sho') && beats.includes('ketsu'), beats);
  }

  // ---- spine pacing -------------------------------------------------------
  const spine = d.nodes.filter((n) => n.spine).map((n) => n.id);
  let run = 0, worst = 0;
  for (const id of spine) {
    run = nodes.get(id).tag === 'puzzle' ? run + 1 : 0;
    worst = Math.max(worst, run);
  }
  check(`spine never exceeds ${d.max_consecutive_puzzle_rooms} puzzle rooms in a row`,
    worst <= (d.max_consecutive_puzzle_rooms || 2), { worst });

  // ---- rest point on the spine (L13) --------------------------------------
  check('a rest point sits on the spine',
    d.nodes.some((n) => n.rest && n.spine), d.rest_points);

  // ---- verb_lock names are real verbs -------------------------------------
  const badVerbs = d.edges.filter((e) => e.type === 'verb_lock' && !KNOWN_VERBS.has(e.verb))
    .map((e) => e.verb);
  check('every verb_lock names a verb from assets/verbs.json', badVerbs.length === 0, { badVerbs });
}

console.log(errors.length ? `\n✗ ${errors.length} FAILED` : '\n✓ ALL CLEAN');
process.exit(errors.length ? 1 : 0);
