// THE DEN REBUILT (design/DEN-REBUILD.md) — Assassin's-Creed-style base
// rebuilding: spend gathered materials (js/materials.js, fed by js/nodes.js's
// mining/woodcutting) to restore a structure, then it pays out a trickle of
// something every real-time interval, forever, capped so leaving the game
// running is never a shortcut. Dad's own ask: "Tavern directly gives you
// hold coins every x amount of minutes. Forge gives ingotts every x amount
// of minutes so on and so forth."
//
// THE TIMER IDIOM is js/restoration.js's garden bed, generalized from a
// one-shot grow-then-harvest to a building that keeps paying out visit after
// visit. The garden bed derives a STAGE from elapsed real time and ratchets
// it forward-only (`stage = Math.max(stored, elapsed)`) so a wrong device
// clock can never walk it backwards. Here the same forward-only law is kept
// but the quantity it ratchets is different: `since` (the restoration
// timestamp) is written ONCE and never touched again; `total` (how many
// intervals have elapsed since `since`) is unbounded and keeps climbing
// forever, which is what lets the building keep producing rather than dying
// the moment its first `cap` intervals have passed; and `collected` is a
// forward-only HIGH-WATER MARK against `total`, not a running sum of
// payouts. A collect() pays `min(cap, total - collected)` — the same
// backlog cap either way — and then ratchets `collected` all the way up to
// the CURRENT `total`, discarding whatever lay beyond the cap rather than
// leaving it sitting there to be paid out again for free on the very next
// call with zero time passed. (An earlier draft advanced `collected` by
// only what it had just paid, `collected + n` — provably wrong: with a
// huge backlog, `total - collected` stays far above `cap` call after call,
// so every immediate re-call still computed a fresh `min(cap, …)` and paid
// the cap again, forever, for free. tools/verify-denrebuild.mjs's own §5
// caught this before ship.) Either way, `collected` only ever moves
// forward, so a wrong device clock can still never walk it backwards.
import { state } from './state.js';
import { WS } from './worldstate.js';
import { canAfford, spendMaterials, addMaterial } from './materials.js';
import { grantXp, bumpCounter } from './progress.js';

const MINUTES = 60 * 1000;
const INTERVAL_MS = 20 * MINUTES; // dad's own draft: "every x amount of minutes"
const CAP = 3;                     // the garden bed's own GARDEN_HARVEST_SHARDS
                                    // economy-freeze philosophy, generalized: a
                                    // few collections' worth of backlog, never
                                    // an infinite one from an AFK save.

export const BUILDINGS = {
  tavern: {
    id: 'tavern', name: 'The Tavern',
    // wood-heavy (it is mostly a timber hall), a little ore for the fittings.
    cost: { wood: 15, ore: 3 },
    payout: { kind: 'shards' }, amount: 6,
    intervalMs: INTERVAL_MS, cap: CAP,
  },
  forge: {
    id: 'forge', name: 'The Forge',
    // the mirror of the tavern's split — ore-heavy, a little wood for the frame.
    cost: { ore: 15, wood: 3 },
    payout: { kind: 'material', id: 'ingot' }, amount: 2,
    intervalMs: INTERVAL_MS, cap: CAP,
  },
  mill: {
    id: 'mill', name: 'The Mill',
    // "the mill pays for itself" — 10 wood + 4 ore spent once, 4 wood back
    // every interval forever after: three collections (~an hour) already
    // nets back everything spent, and every visit after that is pure
    // profit — a five-year-old can read that shape without doing the maths.
    cost: { wood: 10, ore: 4 },
    payout: { kind: 'material', id: 'wood' }, amount: 4,
    intervalMs: INTERVAL_MS, cap: CAP,
  },
  pupPen: {
    id: 'pupPen', name: 'The Pup Pen',
    // already rescued — nothing left to spend. `free` marks it as never
    // restorable-by-spend; js/restoration.js's spawnPupPen is what actually
    // arms its collection (there is no new geometry for it — see DEN-REBUILD.md).
    cost: {},
    payout: { kind: 'xp' }, amount: 4,
    intervalMs: INTERVAL_MS, cap: CAP,
    free: true,
  },
};

// Every WS key this module owns lives under the 'den' region, alongside the
// garden bed and the pen's own row flags — one namespace for everything the
// Den remembers, exactly as js/restoration.js already keeps it.
const REGION = 'den';
const restoredKey = (id) => 'bld_' + id + '_restored';
const sinceKey = (id) => 'bld_' + id + '_since';
const collectedKey = (id) => 'bld_' + id + '_collected';

// WS.get() only ever answers true/false (see js/worldstate.js) — reading a
// raw stored VALUE (a timestamp, a count) means reaching into the same flag
// bag WS.set() writes, exactly the way gardenDenFlags() does in
// js/restoration.js rather than inventing a second convention.
function denFlags() {
  return (state.flags.world && state.flags.world[REGION]) || {};
}

// The pup pen has no "restore" step of its own — it counts as restored the
// moment any pup has actually come home, so its trickle starts the same day
// a child's very first rescue does.
function pupPenHome() {
  const pups = state.flags.pups || {};
  return Object.keys(pups).some((id) => pups[id]);
}

export function isRestored(id) {
  const b = BUILDINGS[id];
  if (!b) return false;
  if (b.free) return id === 'pupPen' ? pupPenHome() : true;
  return !!denFlags()[restoredKey(id)];
}

export function canRestore(id) {
  const b = BUILDINGS[id];
  if (!b || b.free || isRestored(id)) return false;
  return canAfford(b.cost);
}

export function restore(id) {
  const b = BUILDINGS[id];
  if (!b || b.free || isRestored(id)) return false;
  if (!spendMaterials(b.cost)) return false;
  WS.set(REGION, restoredKey(id), true);
  return true;
}

// The baseline is set LAZILY, the first time anything asks — restore() only
// flips the flag and spends the cost, so a paid building and the free pup
// pen (which is never "restored" by a walk-up at all) both get their clock
// started the same way, the first time this is checked at all. Once set, it
// is never written again: see the module header for why.
function sinceFor(id) {
  const key = sinceKey(id);
  const existing = denFlags()[key];
  if (existing) return existing;
  if (!isRestored(id)) return null;
  const now = Date.now();
  WS.set(REGION, key, now);
  return now;
}

function totalIntervals(id, since) {
  return Math.floor((Date.now() - since) / BUILDINGS[id].intervalMs);
}

// How many collections are waiting right now, capped at `cap` — the number
// that keeps growing forever in the background (`totalIntervals`) minus what
// has already been paid, clamped so a save left running for a week does not
// hand back a week's worth in one visit.
export function pendingCollections(id) {
  const b = BUILDINGS[id];
  if (!b || !isRestored(id)) return 0;
  const since = sinceFor(id);
  if (!since) return 0;
  const collected = denFlags()[collectedKey(id)] || 0;
  const total = totalIntervals(id, since);
  return Math.max(0, Math.min(b.cap, total - collected));
}

// Dispenses whatever is pending and advances the forward ratchet by exactly
// that much — never resets `since`, never re-reads a live clock into the
// stored progress, so calling this twice in a row with no time passed pays
// out nothing the second time, and a device clock wound backwards can never
// re-open an interval already paid (total - collected floors at 0 instead
// of going negative).
export function collect(id) {
  const b = BUILDINGS[id];
  if (!b || !isRestored(id)) return null;
  const since = sinceFor(id);
  if (!since) return null;
  const collected = denFlags()[collectedKey(id)] || 0;
  const total = totalIntervals(id, since);
  const n = Math.max(0, Math.min(b.cap, total - collected));
  if (n <= 0) return { count: 0, amount: 0, payout: b.payout };
  // Ratchet all the way up to `total`, not merely `collected + n` — see the
  // module header for why the difference is load-bearing: anything beyond
  // the cap is forfeited HERE, at collection time, rather than left as
  // free-standing debt a second immediate call could cash in again.
  WS.set(REGION, collectedKey(id), total);
  const amount = n * b.amount;
  if (b.payout.kind === 'material') addMaterial(b.payout.id, amount);
  else if (b.payout.kind === 'shards') { state.shards += amount; bumpCounter('shardsEarned', amount); }
  else if (b.payout.kind === 'xp') grantXp(amount);
  return { count: n, amount, payout: b.payout };
}
