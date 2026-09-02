// DOES A SKELETON STAND ON THE FLOOR, OR IN IT?
//
// Dad, on Level 1's Ember Wretches: "the skeletons is animated but his legs
// are partially in the ground."
//
// He was right twice over. The bodies were animating, and they were sunk —
// a woken minion's lowest foot bone measured -0.069 against a floor at 0
// while Kael, standing on the same floor in the same frame, never went below
// +0.007. Two causes, both in SkeletonBase:
//
//   1. The sleeping pose was PAUSED, never retired. `inactive` is played and
//      paused so a sleeping skeleton holds its bone-pile pose, and `_current`
//      was left null, so the first _play() skipped its crossFadeTo. A paused
//      action is a still frame held at WEIGHT 1 — so every skeleton walked,
//      idled and punched with Skeletons_Inactive_Floor_Pose (a body lying flat
//      on the ground) mixed in at full weight for the rest of its life.
//   2. Twelve attack states end with `_current = null` to re-trigger the walk,
//      which hit the same skipped crossfade and left each finished LoopOnce
//      lunge clamped at weight 1 on top of everything after it.
//
// Both hid behind AnimationAction.isRunning(), which is `enabled && !paused`
// and answers FALSE for a paused hold AND for a clamped one-shot. Every debug
// dump of "what is running on this skeleton" said "only the walk".
//
// So this suite does not ask what is running. It asks where the FEET are —
// bone world positions, because Box3.setFromObject reads a SkinnedMesh's BIND
// pose and cannot see an animation at all. It wakes each skeleton through real
// key presses and watches it from asleep into the settled chase.
//
// TOLERANCE. Kael is the control: he is on the same floor, on the same rig,
// and he looks right, so "no worse than Kael, less a hair" is the honest bar
// rather than a hard zero. FLOOR_EPS is 0.005 — five millimetres on a body
// 1.08 units tall, well under a pixel at any zoom a child plays at — which
// leaves room for the blend frames of a crossfade without letting a shin back
// underground.
import { launch } from './wk-drive.mjs';

const FLOOR_EPS = -0.005;

// One room per skeleton class that a child can actually reach.
// SkeletonRogue is deliberately absent: its only spawns are in rooms.js e2b/e2,
// both of them RETIRED_ROOMS redirects, so nothing in the shipped game builds it.
const ROOMS = [
  { room: 'la',  what: 'SkeletonMinion (Ember Wretch, roster body)' },
  { room: 'la1', what: 'SkeletonMinion (Cinder Imp, roster body)' },
  { room: 'vb2', what: 'SkeletonShield' },
  { room: 'vc1', what: 'SkeletonShield' },
];

const errors = [];
const check = (n, ok, d) => {
  console.log((ok ? '✓ ' : '✗ ') + n, d !== undefined ? JSON.stringify(d) : '');
  if (!ok) errors.push(n);
};

const wk = await launch({ timescale: 1 });
await wk.newGame('FOOTING');

let woke = 0;
for (const { room, what } of ROOMS) {
  await wk.page.evaluate((r) => window.__wkJump(r, ['knight', 'dark_wolf']), room);
  await wk.page.waitForFunction((r) => window.__wk.room === r && window.__wk.hearts > 1
    && !window.__wk.gates.transitioning, room, { timeout: 60000 });
  await wk.page.evaluate(() => { window.__game.player.iframes = 999999; });

  const foes = await wk.page.evaluate(() => window.__wk.foes.filter((f) => /Skeleton/.test(f.kind)));
  if (!foes.length) { check(`${room} has a skeleton to test`, false, { what }); continue; }
  // walk ONTO it, so it definitely wakes — a skeleton that never wakes proves
  // nothing, and a probe that measures a sleeping bone pile passes for free
  await wk.walkTo(foes[0].x, foes[0].z, { timeout: 50, arrive: 1.4 });

  const trail = [];
  for (let i = 0; i < 40; i++) {
    const s = await wk.page.evaluate(async () => {
      const THREE = await import('three');
      const g = window.__game;
      g.narration.blocking = false;           // a story line freezes the world
      const v = new THREE.Vector3();
      const lowestFoot = (model, rootY) => {
        let lo = 9;
        model.traverse((b) => {
          if (!b.isBone || !/toe|foot/i.test(b.name)) return;
          b.getWorldPosition(v);
          lo = Math.min(lo, v.y - rootY);
        });
        return lo;
      };
      const e = g.world.enemies.find((x) => /Skeleton/.test(x.constructor.name) && !x.dead);
      if (!e) return null;
      const pm = g.player.form && g.player.form.model;
      return { st: e.state, kind: e.constructor.name,
        foot: +lowestFoot(e.model, e.root.position.y).toFixed(4),
        kael: pm ? +lowestFoot(pm, g.player.root.position.y).toFixed(4) : null };
    });
    if (s) trail.push(s);
    await wk.page.waitForTimeout(200);
  }

  // Only the settled states are under test. `sleep` and `awaken` are MEANT to
  // be in the floor — Skeletons_Awaken_Floor is the one clip a skeleton plays
  // that goes below y=0 (lowest toe -0.044), because it is climbing out.
  const settled = trail.filter((s) => s.st !== 'sleep' && s.st !== 'awaken');
  if (!settled.length) {
    check(`${room}: the skeleton woke up`, false,
      { what, states: [...new Set(trail.map((s) => s.st))] });
    continue;
  }
  woke++;
  const worst = Math.min(...settled.map((s) => s.foot));
  const kael = Math.min(...trail.map((s) => s.kael).filter((n) => n !== null));
  check(`${room}: ${what} keeps its feet on the floor once it is up`,
    worst >= FLOOR_EPS, { worstFoot: +worst.toFixed(4), kaelWorstFoot: +kael.toFixed(4),
      samples: settled.length, eps: FLOOR_EPS });
}

check('at least one skeleton actually woke and was measured', woke > 0, { rooms: woke });
check('nothing threw during the run', wk.errors.length === 0, wk.errors.slice(0, 3));
await wk.b.close();

console.log(errors.length
  ? `\n✗ FAIL — ${errors.length} problem(s)`
  : '\n✓ PASS — every woken skeleton walks on top of the floor, not through it');
process.exit(errors.length ? 1 : 0);
