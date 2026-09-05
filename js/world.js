// The World: one room's static geometry + flat-plane gameplay data. All
// collision runs in 2D on the XZ plane — circles (dynamic bodies) vs static
// AABBs and circles, plus damage zones (lava rects, geyser circles).

import * as THREE from 'three';
import { state } from './state.js';
import { audio } from './audio.js';
import { isShared } from './assets.js';

const _rollAxis = new THREE.Vector3();

// The solid volume of a shut doorway: as wide as the opening, and 1.4 deep
// across it so a body running flat at it is stopped rather than tunnelling
// through on a slow frame.
function doorwayBox(d) {
  const w = Math.max(d.maxX - d.minX, 0.4), h = Math.max(d.maxZ - d.minZ, 0.4);
  const acrossX = w >= h;                          // which way the opening runs
  const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
  const halfW = (acrossX ? w : 1.4) / 2, halfD = (acrossX ? 1.4 : h) / 2;
  return { minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfD, maxZ: cz + halfD };
}

// Axis-of-least-penetration push-out, lifted out of resolveCircle so a doorway
// and a wall are stopped by the same arithmetic rather than by two copies of it.
function pushOutOfBox(x, z, r, b) {
  const nx = Math.max(b.minX, Math.min(x, b.maxX));
  const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - nx, dz = z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return { x, z };
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * r, z: nz + (dz / d) * r };
  }
  const left = x - b.minX, right = b.maxX - x;
  const top = z - b.minZ, bottom = b.maxZ - z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: b.minX - r, z };
  if (m === right) return { x: b.maxX + r, z };
  if (m === top) return { x, z: b.minZ - r };
  return { x, z: b.maxZ + r };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.boxColliders = [];    // {minX, maxX, minZ, maxZ}
    this.circleColliders = []; // {x, z, r}
    this.lavaZones = [];       // {minX, maxX, minZ, maxZ}
    this.safeZones = [];       // {minX, maxX, minZ, maxZ} — bridge decks etc.
                               // that OVERRIDE hazards underneath them
    this.geysers = [];         // {x, z, r, active} — managed by room animate
    this.darkZones = [];       // {minX, maxX, minZ, maxZ} — always the whole room
    this.roomDark = false;     // a room is dark or it is not; see darknessAt
    // A HOLE IN THE FLOOR. Not a hazard: falling in costs no hearts, it puts
    // the child back at `pitReturn` (the room's entry) and they walk it again.
    // That is the whole punishment, and it is the right one for five-year-olds
    // — the cost of a mistake is the walk, never the run.
    this.pitZones = [];        // {minX, maxX, minZ, maxZ}
    this.pitReturn = null;     // {x, z} — where a fall puts you; defaults to spawn
    this.doors = [];           // {minX, maxX, minZ, maxZ, to, entry:{x,z,angle}}
    this.checkpoints = [];     // {id, x, z, r, flame, light}
    this.markers = {};         // named spots for later phases (pups, boss, enemies)
    // Where this room ANNOUNCES ITSELF: every landmark instance that says
    // "you are at the Thornedge crossroads". Not part of `markers`, because
    // these are scenery a child reads, not spots gameplay acts on — and the
    // blind-strip law is a census of the latter.
    this.heroMarks = [];       // [{x, z}]
    this.burnables = [];       // {id, x, z, group, collider, burned}
    this.crackables = [];      // {id, x, z, group, collider, cracked} — Earth Wolf
    // Cuttables were the ONE gate list not created here, so gates.js built it
    // lazily and world.cutAt existed in some rooms and not others — anything
    // reading world.cuttables in a room with no brambles hit undefined.
    this.cuttables = [];       // {id, x, z, clear, cut} — Verdant Wolf lash
    // ...and the same for ice. world.shatterAt used to be defined lazily by
    // iceGate(), so a room with ice-sealed geometry built any other way had
    // no shatter verb at all and its ice could never be broken.
    this.shatterables = [];    // {id, x, z, clear, broken} — Frost Wolf breath
    // STORMREACH (region 5). A gale lane pushes; it never damages. It is also
    // the region's lock — see js/wind.js for why a wind you can lean into is a
    // better closed door than a wall a child has to be told about.
    this.galeLanes = [];       // {minX,maxX,minZ,maxZ, px,pz, strength, dir, id}
    // SUNKEN VALE (region 6). Shallow water slows; deep water is a wall you can
    // see across until the Tide Wolf carries you over it — see js/water.js.
    this.waterZones = [];      // {minX,maxX,minZ,maxZ, deep, collider}
    this.quenchables = [];     // {x, z, id, out, quench} — the splash puts these out
    // SHADOW COURT (region 7). A watcher is solid while it can see you.
    this.watchers = [];        // {x, z, blind, collider}
    this.player = null;        // set by main.js — watchers and mirrors ask it
                               // whether Kael is ghosted, every frame
    this.vanes = [];           // {x, z, r, dir, lane, group} — dash to turn
    this.boulders = [];        // {x, z, r, group, collider} — pushable
    this.potionSpots = [];     // {x, z, group, taken}
    this.boss = null;
    this.bossDarkness = false; // boss phase 3 blacks out the whole room
    this.spawn = { x: 0, z: 0, angle: Math.PI };
    // HEIGHT LAW (v3.20): the top surface of THIS room's floor. Ground decals
    // (plates, act-here rings, doorway glows, scars) must sit above it or they
    // are drawn INSIDE the floor and become invisible — which is exactly how
    // the Deep Hall's pressure plate hid itself for two regions. Each shell
    // builder sets its own value; 0 is a bare ground plane.
    this.deckY = 0;
    // SLICK FLOOR (v3.21, Frostpeak): on ice a pushed boulder does not take
    // one polite step — it SKIDS until something stops it. Kael himself never
    // slides (deliberate: a kid must never lose control of their own wolf),
    // so the ice is a puzzle, not a punishment.
    this.slickFloor = false;
    // Per-room LIGHT COLOUR (v3.21). The global rig is warm — firelight and
    // ember — which turned Frostpeak's snow pink. A room may ask for its own
    // sky/ground/key hues; null keeps the warm default every earlier region
    // was tuned against.
    this.lightTint = null;     // {sky, ground, key} hex
    this._animateHooks = [];
  }

  add(obj) { this.root.add(obj); return obj; }

  addBox(minX, maxX, minZ, maxZ) {
    this.boxColliders.push({ minX, maxX, minZ, maxZ });
  }

  // `tag` marks who owns this collider. Only 'decor' is ever swept away — see
  // sweepKeepClear. Everything else (a gate, a landmark, a boulder, a wall) is
  // gameplay or structure and is never touched.
  addCircle(x, z, r, tag = null) {
    this.circleColliders.push({ x, z, r, tag });
  }

  // --- KEEP-OUT: where scenery may not stand -------------------------------
  //
  // Dressing the levels to ROOM-STANDARD put hundreds of new colliders into
  // rooms that already had gameplay in them, and two of them landed badly: an
  // enemy in t1b spawned inside a tree, and the chest behind vc2's thorn gate
  // ended up 2.06u out of reach — you cut the bramble, solve the puzzle, and
  // still cannot take the reward.
  //
  // Both are the same bug. A prop builder knows where it wants to put a rock;
  // it does not know that a hound spawns there, or that the only approach to a
  // chest runs through that square. So the world keeps a register of the places
  // gameplay OWNS, and the builders ask before they place anything solid.
  //
  // `reserve` is for things a room states explicitly (a doorway, an alcove).
  // `blocked` also consults the markers LIVE, because nearly every build
  // function sets its spawn points and chests before it dresses, and reading
  // them at placement time means fifty-two builders did not each have to
  // remember to declare the same thing twice.
  reserve(x, z, r = 1.2, tag = 'reserved') {
    (this._keepClear || (this._keepClear = [])).push({ x, z, r, tag });
  }

  // WATER IS PAINT, NOT A COLLIDER — `blocked()` never sees it (ground.js's
  // `patches` only tint the floor texture; the separate js/water.js system
  // is what actually blocks a body, and only for `deep` zones, in a
  // completely different this.waterZones array — see world.js's own field
  // comment). So nothing placing decoration ever knew a `kind:'water'`
  // patch was there, and a room author's hand-picked coordinates for a
  // campfire or a ruin could land dead centre in one (real-play report:
  // "random objects like campfires... in the middle of water. rocks only
  // in water."). `shell()` records every water PATCH (this room's own
  // ground-paint shape, in world.waterPatches — deliberately a different
  // name/shape than the gameplay this.waterZones) as it builds; anything
  // that shouldn't stand in water asks this before it places.
  nearWater(x, z, pad = 0) {
    for (const w of (this.waterPatches || [])) {
      const dx = x - w.x, dz = z - w.z;
      if (dx * dx + dz * dz < (w.r + pad) * (w.r + pad)) return true;
    }
    return false;
  }

  // `why` — when true, returns the NAME of what claimed the ground instead of
  // just true. The sweep reports it, because "5 colliders dropped" tells you a
  // number and "dropped at (-7.2, 3.9), claimed by restSpot" tells you which
  // line to move.
  blocked(x, z, r = 0.6, why = false) {
    // Tally of what this register actually REFUSED, per room. A keep-out that
    // rejects a handful of props is doing its job; one that rejects dozens is
    // quietly emptying rooms, which is precisely how the Great Vault went from
    // 55 things in its arrival frame to 9 without a single check failing.
    const tally = (tag) => {
      if (!why) {
        const t = (this._blockedBy || (this._blockedBy = {}));
        t[tag] = (t[tag] || 0) + 1;
      }
      return why ? tag : true;
    };
    for (const k of (this._keepClear || [])) {
      const dx = x - k.x, dz = z - k.z;
      if (dx * dx + dz * dz < (k.r + r) * (k.r + r)) return tally(k.tag || 'reserved');
    }
    const m = this.markers || {};
    // KEEP-CLEAR PROTECTS STANDING ROOM, NOTHING ELSE.
    //
    // The first attempt protected every marker and the sweep fired in twelve of
    // seventeen rooms — almost all of it false. A marker can mean three quite
    // different things:
    //
    //   * where a BODY must stand or walk — a spawn point, a hound's post, a
    //     chest's approach. Scenery here is a bug; this is what to protect.
    //   * where a PROP IS — heroSpot is the fallen gate, ringSpot is the sunken
    //     ring. Protecting these made the sweep drop the hero prop's own
    //     collider, so you could walk through the Kiln and through Cinder's cage.
    //   * where an INTERACTABLE is — cageBraziers, the order-hall braziers, the
    //     practice cracks. They own their colliders too, for the same reason.
    //
    // So the list is positive and short. Anything not named here is ignored,
    // which fails safe: the worst case is a prop standing somewhere slightly
    // awkward, not a gate you cannot open or an enemy you cannot fight.
    const STANDING_ROOM =
      /(shade|hound|moth|geyser|slime|bat|minion|shield|pup|stalactite|enemy|boulder)\w*Spots?$/i;
    const ALSO = /^(restSpot|potionSpot|chestDefs)$|Promise$/;
    const near = (p, pad) => {
      if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') return false;
      const dx = x - p.x, dz = z - p.z;
      return dx * dx + dz * dz < (pad + r) * (pad + r);
    };
    // the spawn, and enough room around it to land and turn around
    if (near(this.spawn, 2.4)) return tally('spawn');
    for (const key of Object.keys(m)) {
      const v = m[key];
      if (!v || !(STANDING_ROOM.test(key) || ALSO.test(key))) continue;
      // A CHEST NEEDS ITS APPROACH, not just its square: 2.2u so a child can
      // walk up to it from any side. Everything else needs standing room.
      // A BODY IS ABOUT 0.7u ACROSS. 1.6u of standing room plus a cluster's own
      // 1.2u query radius excluded nearly three units around every marker, and
      // once the markers moved above the dressing that started REJECTING props
      // rather than merely sweeping their colliders — the Great Vault lost most
      // of its arrival dressing overnight, from 55 things in frame to 9.
      //
      // 1.1u is ample room to stand and turn. Chests and gates keep the wider
      // margin because an approach you cannot walk is a broken reward, and that
      // is the failure this whole register exists to prevent.
      const pad = /chest|reward|Promise/i.test(key) ? 2.2 : 1.1;
      if (Array.isArray(v)) { for (const p of v) if (near(p, pad)) return tally(key); }
      else if (near(v, pad)) return tally(key);
    }
    for (const d of (this.doors || [])) {
      const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
      if (near({ x: cx, z: cz }, 2.6)) return tally('door→' + d.to);
    }
    return false;
  }

  // Last line of defence, run at the end of every dressed build. A builder that
  // placed before its markers existed cannot have consulted them, so anything
  // still sitting on a gameplay square has its COLLIDER dropped here and says
  // so. A prop you can walk through is a blemish; an enemy stuck inside one, or
  // a chest you cannot reach, is a broken game.
  // ONLY SCENERY IS EVER SWEPT.
  //
  // The first version filtered every circle collider in the room and started
  // dropping the wrong ones the moment it had good data: the Kiln cone (radius
  // 4.6), the Forge Heart (5.2), the Great Vault's ring (7.5) — landmarks whose
  // colliders naturally overlap half the markers in the room. Dropping them
  // means walking through a volcano. And in va1 it dropped the cracked pile
  // that GUARDS a chest, because the chest's own approach reservation claimed
  // the ground the gate stands on.
  //
  // A prop the dressing placed is tagged 'decor' and may be swept. Anything
  // else belongs to the room's design and is left alone, whatever it overlaps.
  // IF IT LOOKS LIKE IT BLOCKS, IT BLOCKS.
  //
  // Dad, from play: "it's not solid, the player should have to jump over the
  // column"; "rumble should be solid"; "no asset is actually blocking the
  // chest"; and three times, "a jar is inside something — check all the jars
  // in the game." Those are one bug.
  //
  // dressing.js `place()` is the single funnel every prop in every room goes
  // through, and it registers no collider at all. Colliders are added by hand
  // afterwards, helper by helper — so `fallenColumn` and `lowWall` remember
  // and `rubbleField` and `aftermath` do not, and a ruin's doorway arch, a
  // Stoneroot bush and a waist-high rock are all things a child walks straight
  // through. Measured across the whole game before this went in: 563 drawn
  // obstacles with nothing solid under them.
  //
  // The jars are the same bug wearing a different face. The pot placer pushes
  // pots out of COLLIDERS (resolveCircle), so a prop with no collider is
  // invisible to it — the jar is placed inside the arch and the check that
  // exists for exactly this ("no pot stands inside something else") passes,
  // because as far as the collision world is concerned nothing is there.
  //
  // So the register is built from what is DRAWN, once, after the room is
  // dressed. Rules, each one there to stop this from making the game sticky:
  //
  //   * per placed MODEL, never per group — a rubble field is nine rocks a
  //     child steps between, not one four-metre block in the middle of a room;
  //   * knee-height and up (0.9), because anything lower reads as ground;
  //   * standing on the floor — a hanging banner or a lamp on a bracket has
  //     air under it and is not an obstacle at knee height;
  //   * inset to 0.78 of the drawn footprint, so a child brushes the silhouette
  //     rather than being stopped short of it by an axis-aligned box around a
  //     prop that is turned;
  //   * nothing added where something solid already is;
  //   * nothing added across a doorway, ever.
  //
  // Tagged 'decor', so sweepKeepClear() — which runs straight after — still
  // takes back anything that landed on gameplay ground. Props already standing
  // on reserved ground never get a collider in the first place; they are
  // counted on the world as `_solidified.onReserved` so a suite can name them.
  solidifyProps() {
    // The same escape hatch flattenStatic has (`window.__noBatch`), for the
    // same reason: a probe needs to be able to measure the room WITHOUT this
    // pass to say what it cost. Never set in the game.
    if (typeof window !== 'undefined' && window.__noSolid) return 0;
    // POSE THE ROOM BEFORE MEASURING IT.
    //
    // This runs at the end of a room BUILD, and a freshly built room has never
    // been rendered — so nothing has called updateMatrixWorld on it and most
    // of its props still report a matrixWorld of identity. Box3.setFromObject
    // reads matrixWorld, so without this line it measures prop after prop
    // sitting at the ORIGIN and drops a collider there: an invisible post in
    // the middle of the floor, in every room, at (0,0).
    //
    // It was caught in the Great Vault, where the post landed exactly on the
    // sunken ring's centre and re-broke the promise dad raised twice ("a
    // puddle of water with a character and a chest in the centre that you are
    // unable to get to") — verify-level2-progress §5, which passes on main and
    // failed here. The measurement: with this pass and no posing, a decor
    // circle r0.33 sat at (0,0) and resolveCircle pushed a body 0.538u; with
    // the pass off, nothing. No prop is anywhere near the middle of that room.
    //
    // The same call was needed in tools/verify-looks.mjs for the same reason,
    // and this is the more serious half of it: that one only made a test lie,
    // this one put real colliders in the shipped game.
    this.root.updateMatrixWorld(true);
    const bb = new THREE.Box3();
    const deck = this.deckY || 0;
    const onReserved = [];
    const mine = [];          // only what this pass added — see unsealDoors()
    let added = 0;
    const overlapsDoor = (minX, maxX, minZ, maxZ) => this.doors.some((d) =>
      maxX > d.minX - 1.2 && minX < d.maxX + 1.2
      && maxZ > d.minZ - 1.2 && minZ < d.maxZ + 1.2);

    const consider = (o) => {
      bb.setFromObject(o);
      if (!isFinite(bb.min.x)) return;
      const h = bb.max.y - bb.min.y;
      if (h < 0.9) return;                       // ground, not an obstacle
      if (bb.min.y > deck + 0.55) return;        // hanging: nothing to walk into
      const fx = bb.max.x - bb.min.x, fz = bb.max.z - bb.min.z;
      if (fx > 7 || fz > 7) return;              // a wall or a room-scale piece
      if (fx < 0.35 || fz < 0.35) return;        // a post a child slips past
      const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      const hx = (fx / 2) * 0.78, hz = (fz / 2) * 0.78;
      if (overlapsDoor(cx - hx, cx + hx, cz - hz, cz + hz)) return;
      const r = Math.max(0.3, Math.min(hx, hz));

      // STANDING ON RESERVED GROUND: COUNTED, NOT REMOVED.
      //
      // lg1 is where this got interesting. Dad tapped a column there — "it's
      // not solid, the player should have to jump over it" — and the first cut
      // of this pass DID make it solid, and then sweepKeepClear took the
      // collider straight back off, because the column stands on the reserved
      // lane the push-block rolls down. Nothing changed, and the reason was
      // invisible.
      //
      // The obvious next move was to remove the PROP as well: ground that has
      // to stay clear should be clear of the thing you can see, not just of the
      // thing you can bump into. Measured across all 146 rooms before trusting
      // it, that would have removed 79 props from f1, 63 from f4, 57 from f5
      // and 44 from f3 — Frostpeak and the Market gutted, because `blocked()`
      // answers for every gameplay MARKER too and whole regions are dressed
      // around them at radii that overlap.
      //
      // So it counts and says so. A room dressing dozens of props onto its own
      // reserved ground is a real problem, but it is a level-design problem to
      // be fixed room by room with the count in hand, not something to solve
      // by emptying the rooms in the dark.
      const claim = this.blocked(cx, cz, r, true);
      if (claim) { onReserved.push(`${claim} @ (${cx.toFixed(1)}, ${cz.toFixed(1)})`); return; }

      // ...AND NOTHING STANDS INSIDE IT, which is the other half of the rule
      // this pass is named for. Enemies are placed AFTER it runs (rooms.js
      // calls spawnEnemies once the builder has returned), so the pass cannot
      // see a creature — but it can see the MARKER the creature will be born
      // on, because the builder writes those before finish(). Without this,
      // making a prop solid quietly walls a mook inside it: measured at 8
      // enemies inside geometry on main and 11 here, three of them newly
      // stood in a prop that had just become real.
      if (this._standsHere(cx, cz, r)) {
        onReserved.push(`enemy @ (${cx.toFixed(1)}, ${cz.toFixed(1)})`);
        return;
      }

      // Already solid? Probe the middle with a body-sized circle.
      const solved = this.resolveCircle(cx, cz, 0.35);
      if (Math.hypot(solved.x - cx, solved.z - cz) > 0.02) return;
      // A CIRCLE, because that is what sweepKeepClear can take back, and
      // because a turned prop under an axis-aligned box blocks its own corners
      // that are not there. The radius is the SHORT half-axis, so a fallen
      // column is a line of stone a child walks along rather than a slab.
      this.addCircle(cx, cz, r, 'decor');
      mine.push(this.circleColliders[this.circleColliders.length - 1]);
      added++;
    };

    // Top-level props are groups of placed models; the models are the things.
    // A model that is itself a leaf mesh (a single-piece prop) counts as one.
    for (const child of this.root.children) {
      if (child.isInstancedMesh) continue;        // the shell's wall cells
      if (this._keepLoose && this._keepLoose.includes(child)) continue;
      const kids = child.children || [];
      if (child.isMesh || !kids.length) consider(child);
      else for (const model of [...kids]) consider(model);
    }
    const sealed = this.unsealDoors(mine);
    this._solidified = { added: added - sealed, onReserved: onReserved.length,
      unsealed: sealed, claims: onReserved };
    return this._solidified;
  }

  // Every spot a creature is going to be born on, from the markers a room
  // builder publishes: `<family>Spots` arrays and the singular `wardenSpot` /
  // `bossSpot` / `houndSpot` shapes both. Kept here rather than in the levels
  // so a new family costs nothing — it is named `...Spot(s)` or it is not an
  // enemy placement.
  _standsHere(x, z, r) {
    const near = (p) => p && typeof p.x === 'number' && typeof p.z === 'number'
      && Math.hypot(p.x - x, p.z - z) < r + 0.55;
    for (const [key, val] of Object.entries(this.markers || {})) {
      if (!/Spots?$/.test(key)) continue;
      if (Array.isArray(val)) { if (val.some(near)) return true; }
      else if (near(val)) return true;
    }
    return false;
  }

  // A PROP MAY BLOCK. IT MAY NEVER SEAL THE WAY ON.
  //
  // levelkit already names this law in prose — level2's crypt stair carries
  // "NO collider on purpose: a solid stair here would seal the only route into
  // the boss room (levelkit's 'prop plugs a gap' law)" — but it was a thing
  // authors had to remember per prop. solidifyProps is a BLANKET pass, so it
  // cannot remember: it makes every qualifying prop solid and has no idea
  // which of them happens to be standing in the only gap.
  //
  // It bit immediately. With the origin bug fixed the pass places colliders
  // where the props really are, and xa1's seven new ones closed the Ash
  // Barrows' way to xa2 — verify-reachable: "the doorway is open but walled
  // off from where the player arrives", passing on main and failing here.
  //
  // So the law is mechanical now. Flood the room from the arrival point using
  // the same ruler the game moves a body with, and if a doorway cannot be
  // reached, give back the colliders THIS PASS added, nearest the door first,
  // until it can. It only ever takes back its own: a gate, a boulder or a
  // dressing collider placed on purpose is never touched, so a door that was
  // already unreachable stays that way and stays reported.
  unsealDoors(mine) {
    if (!mine.length || !this.spawn || !(this.doors || []).length) return 0;
    const STEP = 0.5, BODY = 0.32;
    const halfW = this.halfW || 20, halfD = this.halfD || 20;
    const nx = Math.max(1, Math.floor((halfW * 2) / STEP));
    const nz = Math.max(1, Math.floor((halfD * 2) / STEP));
    const at = (i, j) => ({ x: -halfW + (i + 0.5) * STEP, z: -halfD + (j + 0.5) * STEP });
    const free = (x, z) => {
      const r = this.resolveCircle(x, z, BODY);
      return Math.abs(r.x - x) < 1e-6 && Math.abs(r.z - z) < 1e-6;
    };
    // flood from the arrival point
    const reach = () => {
      const seen = new Uint8Array(nx * nz);
      const si = Math.min(nx - 1, Math.max(0, Math.round((this.spawn.x + halfW) / STEP - 0.5)));
      const sj = Math.min(nz - 1, Math.max(0, Math.round((this.spawn.z + halfD) / STEP - 0.5)));
      const stack = [si + sj * nx];
      seen[si + sj * nx] = 1;
      while (stack.length) {
        const k = stack.pop();
        const i = k % nx, j = (k - i) / nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
          const m = a + b * nx;
          if (seen[m]) continue;
          const p = at(a, b);
          if (!free(p.x, p.z)) continue;
          seen[m] = 1; stack.push(m);
        }
      }
      return seen;
    };
    const doorReached = (seen, d) => {
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          if (!seen[i + j * nx]) continue;
          const p = at(i, j);
          if (p.x >= d.minX - STEP && p.x <= d.maxX + STEP
            && p.z >= d.minZ - STEP && p.z <= d.maxZ + STEP) return true;
        }
      }
      return false;
    };

    let given = 0;
    let seen = reach();
    for (const d of this.doors) {
      if (doorReached(seen, d)) continue;
      const cx = (d.minX + d.maxX) / 2, cz = (d.minZ + d.maxZ) / 2;
      const order = mine.filter((c) => this.circleColliders.includes(c))
        .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
      for (const c of order) {
        const i = this.circleColliders.indexOf(c);
        if (i < 0) continue;
        this.circleColliders.splice(i, 1);
        given++;
        seen = reach();
        if (doorReached(seen, d)) break;
      }
    }
    return given;
  }

  sweepKeepClear() {
    const hits = [];
    this.circleColliders = this.circleColliders.filter((c) => {
      if (c.tag !== 'decor') return true;
      const claim = this.blocked(c.x, c.z, c.r, true);
      if (!claim) return true;
      hits.push(`(${c.x.toFixed(1)}, ${c.z.toFixed(1)}) r${c.r.toFixed(2)} → ${claim}`);
      return false;
    });
    if (hits.length) {
      console.warn(`[keepclear] dropped ${hits.length} collider(s) standing on gameplay `
        + `ground: ${hits.join('; ')}`);
    }
    return hits.length;
  }

  addLava(minX, maxX, minZ, maxZ) {
    this.lavaZones.push({ minX, maxX, minZ, maxZ });
  }

  // A walkable platform footprint (bridge deck, walkway) — anywhere inside
  // is SAFE even if a lava/geyser zone lies underneath it.
  addSafe(minX, maxX, minZ, maxZ) {
    this.safeZones.push({ minX, maxX, minZ, maxZ });
  }

  addDoor(minX, maxX, minZ, maxZ, to, entry, when = null) {
    this.doors.push({ minX, maxX, minZ, maxZ, to, entry, when });
  }

  onAnimate(fn) { this._animateHooks.push(fn); }

  // "Do not fold this into the static batch." A builder marks anything it will
  // move, animate or hand to gameplay later; flattenStatic() leaves it and
  // everything under it exactly as placed. (js/batch.js)
  keepLoose(obj) { (this._keepLoose || (this._keepLoose = [])).push(obj); return obj; }

  animate(t, dt) {
    for (const fn of this._animateHooks) fn(t, dt);
  }

  // ROOM TEARDOWN (rewritten v3.22). This used to remove the scene graph and
  // nothing else, on the reasoning that "geometries/materials are shared via
  // the asset cache". Half true: GLB geometry and the tint cache ARE shared —
  // but every room also builds its own PlaneGeometry floors, RingGeometry
  // decals, BoxGeometry walls, CanvasTextures and dozens of `.clone()`d
  // materials, and none of those were ever freed. Undisposed GPU resources are
  // the standard three.js leak, and it matters here because the kids play for
  // an hour and cross fifty rooms doing it.
  //
  // The rule is now: dispose everything this room OWNS, keep everything in the
  // SHARED identity registry (assets.js). A registry rather than a flag,
  // because Material.clone() deep-copies userData — a per-room clone of a
  // shared material would inherit the flag and never be freed.
  dispose() {
    this.scene.remove(this.root);
    const freed = { geometries: 0, materials: 0, textures: 0 };

    const killTexture = (t) => {
      if (!t || isShared(t)) return;
      t.dispose();
      freed.textures++;
    };
    const killMaterial = (m) => {
      if (!m || isShared(m)) return;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap',
                       'emissiveMap', 'aoMap', 'alphaMap', 'lightMap']) {
        killTexture(m[k]);
      }
      m.dispose();
      freed.materials++;
    };

    this.root.traverse((n) => {
      // An InstancedMesh reuses SHARED geometry and material but owns its own
      // instance buffers — dispose() frees exactly those and nothing else.
      // INSTANCED MESHES. `InstancedMesh.dispose()` frees the instance matrix
      // and colour buffers and NOTHING ELSE — not the geometry, not the
      // material. This used to `return` straight after it, which was invisible
      // for kit props (their geometry comes from the GLB cache and is SHARED,
      // so it must not be freed anyway) but leaked one geometry per room for
      // anything that builds its own: the breadcrumb trails do exactly that,
      // and Level 2's hub is entered six times a playthrough. Measured at
      // exactly +1 geometry per build over 40 hub entries before this.
      if (n.isInstancedMesh || n.isBatchedMesh) {
        n.dispose();
        if (n.geometry && !isShared(n.geometry)) { n.geometry.dispose(); freed.geometries++; }
        if (n.material && !Array.isArray(n.material)) killMaterial(n.material);
        else if (Array.isArray(n.material)) n.material.forEach(killMaterial);
        return;
      }
      // SKINNED CHARACTERS: every SkeletonUtils.clone() builds a fresh Skeleton,
      // and three uploads a DataTexture of the bone matrices for GPU skinning.
      // That texture hangs off the skeleton, NOT off a material or geometry, so
      // it is invisible to any census that walks materials — which is exactly
      // why this leak survived the first two attempts at fixing it. Measured at
      // ~16 textures per room build: every enemy, pup and NPC in the room.
      if (n.isSkinnedMesh && n.skeleton && !isShared(n.skeleton)) {
        n.skeleton.dispose();
        freed.textures++;
      }
      if (n.isLight && n.shadow && n.shadow.map) { n.shadow.map.dispose(); n.shadow.map = null; }
      if (n.geometry && !isShared(n.geometry)) { n.geometry.dispose(); freed.geometries++; }
      if (!n.material) return;
      if (Array.isArray(n.material)) n.material.forEach(killMaterial);
      else killMaterial(n.material);
    });

    this.root.clear();
    this._animateHooks.length = 0;
    // these arrays are populated by other modules (enemies.js sets world.enemies)
    for (const k of ['enemies', 'boulders', 'burnables', 'crackables', 'pups',
                     'plates', 'braziers', 'shatterables', 'cuttables', 'checkpoints']) {
      if (Array.isArray(this[k])) this[k].length = 0;
    }
    this._lastFreed = freed;   // read by the headless leak test
    return freed;
  }

  // True while standing somewhere that hurts (lava, erupting geyser).
  hazardAt(x, z) {
    // bridge decks first: standing ON the crossing is never "in the lava"
    for (const s of this.safeZones) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return false;
    }
    for (const l of this.lavaZones) {
      if (x >= l.minX && x <= l.maxX && z >= l.minZ && z <= l.maxZ) return true;
    }
    for (const g of this.geysers) {
      if (!g.active) continue;
      const dx = x - g.x, dz = z - g.z;
      if (dx * dx + dz * dz < g.r * g.r) return true;
    }
    return false;
  }

  // Verdant Wolf vine-lash: cut every uncut tangle in range. Unlike burnAt and
  // crackAt this does not shatter a group itself — a cuttable owns its own
  // `clear()`, because a bramble across a doorway and a rope holding a log up
  // need to do very different things when they part.
  // `hitR` (optional, on the entry) widens the catch: a tangle that spans a
  // whole doorway is caught by a blow landing anywhere ALONG it, not only
  // within reach of its centre point. Without it a long gate reads as broken
  // the moment a child squares up to one end of it.
  cutAt(x, z, r) {
    let n = 0;
    for (const c of this.cuttables) {
      if (c.cut) continue;
      const rr = r + (c.hitR || 0);
      const dx = c.x - x, dz = c.z - z;
      if (dx * dx + dz * dz > rr * rr) continue;
      c.cut = true;
      c.clear();
      n++;
    }
    return n;
  }

  // Frost Wolf breath: shatter every unbroken ice mass in range. Like a
  // cuttable, an ice mass owns its own `clear()` — a frozen mound and an
  // ice-sealed spring want different things to happen when they break.
  shatterAt(x, z, r) {
    let n = 0;
    for (const c of this.shatterables) {
      if (c.broken) continue;
      const rr = r + (c.hitR || 0);
      const dx = c.x - x, dz = c.z - z;
      if (dx * dx + dz * dz > rr * rr) continue;
      c.broken = true;
      c.clear();
      n++;
    }
    return n;
  }

  // Fire Wolf ground-slam: burn every unburned obstacle in range. The clump
  // breaks apart — chunks scatter, shrink and fade — and its collider goes.
  burnAt(x, z, r) {
    return this._shatter(this.burnables, 'burned', state.flags.burned, x, z, r);
  }

  // Earth Wolf stone-stomp: the same break-apart for cracked rock piles.
  crackAt(x, z, r) {
    return this._shatter(this.crackables, 'cracked', state.flags.cracked, x, z, r);
  }

  _shatter(list, doneKey, flagMap, x, z, r) {
    let burned = 0;
    for (const b of list) {
      if (b[doneKey]) continue;
      const rr = r + (b.hitR || 0);
      const dx = b.x - x, dz = b.z - z;
      if (dx * dx + dz * dz > rr * rr) continue;
      b[doneKey] = true;
      flagMap[b.id] = true;
      burned++;
      // Most burnables and crackables are rock CLUMPS with a circle collider,
      // so the default is to drop that circle. A gate that spans a doorway is
      // a wall, not a clump: it blocks with a box, and it supplies its own
      // `clear()` to take that box (and anything else it drew) away.
      if (b.clear) {
        b.clear();
      } else {
        const i = this.circleColliders.indexOf(b.collider);
        if (i >= 0) this.circleColliders.splice(i, 1);
      }
      const chunks = [...b.group.children];
      for (const c of chunks) {
        const a = Math.atan2(c.position.x + 0.01, c.position.z + 0.01);
        c.userData.v = { x: Math.sin(a) * 1.6, y: 2.2, z: Math.cos(a) * 1.6 };
        c.traverse((n) => {
          if (n.isMesh) { n.material.transparent = true; }
        });
      }
      let life = 0.8;
      this.onAnimate((t, dt) => {
        if (life <= 0) return;
        life -= dt;
        const f = Math.max(0, life / 0.8);
        for (const c of chunks) {
          c.position.x += c.userData.v.x * dt;
          c.position.y += c.userData.v.y * dt;
          c.position.z += c.userData.v.z * dt;
          c.userData.v.y -= dt * 7;
          c.scale.multiplyScalar(Math.max(0.0001, 1 - dt * 1.6));
          c.traverse((n) => { if (n.isMesh) n.material.opacity = f; });
        }
        if (life <= 0) this.root.remove(b.group);
      });
    }
    return burned;
  }

  // Pushable boulders — v3.18 playtest law: PREDICTABLE. Lean on a boulder
  // for a beat and it rolls ONE clean step in the straight direction you
  // pushed (snapped to north/south/east/west), then stops and waits. Push
  // from the side you want it to LEAVE. If a step carries it over a pressure
  // plate the boulder SNAPS onto the plate with a click and stays forever.
  _moveBoulder(b, nx, nz) {
    const mx = nx - b.x, mz = nz - b.z;
    const moved = Math.hypot(mx, mz);
    b.x = b.collider.x = nx;
    b.z = b.collider.z = nz;
    b.group.position.set(nx, 0, nz);
    if (moved > 1e-5 && b.mesh) {
      // roll the rock about the axis perpendicular to its motion
      _rollAxis.set(mz / moved, 0, -mx / moved);
      b.mesh.rotateOnWorldAxis(_rollAxis, moved / b.r);
      b._rollAcc = (b._rollAcc || 0) + moved;
      if (b._rollAcc > 0.55) {
        b._rollAcc = 0;
        audio.play('gate-creak', { volume: 0.3, rate: 0.55, vary: 0.15 });
      }
    }
    return moved;
  }

  _boulderPlateAt(x, z, r = 0.6) {
    for (const p of (this.plates || [])) {
      const px = p.x - x, pz = p.z - z;
      if (px * px + pz * pz < r * r) return p;
    }
    return null;
  }

  updateBoulders(dt, player) {
    for (const b of this.boulders) {
      // a step in flight advances on its own — the player just watches it land
      if (b._slide) {
        const s = b._slide;
        const step = Math.min(s.remaining, (s.speed || 2.4) * dt);
        const i = this.circleColliders.indexOf(b.collider);
        if (i >= 0) this.circleColliders.splice(i, 1);
        const solved = this.resolveCircle(b.x + s.dx * step, b.z + s.dz * step, b.r);
        if (i >= 0) this.circleColliders.splice(i, 0, b.collider);
        const moved = this._moveBoulder(b, solved.x, solved.z);
        s.movedTotal = (s.movedTotal || 0) + moved;
        // THE GRIND FOLLOWS THE STONE, NOT THE SHOVE. Playing it when the push
        // STARTS meant a boulder held against a wall ground away about seven
        // times a second forever, because a blocked step ends instantly and the
        // lean immediately starts another. It fires on the first frame the
        // thing has actually travelled, once per slide — so leaning on a stuck
        // rock is silent, which is also the honest signal that it will not go.
        if (!s.sounded && s.movedTotal > 0.06) {
          s.sounded = true;
          b._dragFlip = !b._dragFlip;
          audio.play(b._dragFlip ? 'stone-drag' : 'stone-drag2',
            { volume: 0.55, rate: this.slickFloor ? 0.85 : 1, vary: 0.08 });
        }
        s.remaining -= step;
        if (moved < step * 0.35) s.remaining = 0; // hit something — stop clean
        // rolling onto a plate ends the step immediately: CLICK, locked in
        const plate = this._boulderPlateAt(b.x, b.z, 0.55);
        if (plate) s.remaining = 0;
        if (s.remaining <= 0) {
          b._slide = null;
          // IT LANDS. A dull settle wherever it stops, and a harder one when it
          // drops onto a plate — that thud is the "you solved it" beat, so it
          // arrives before the plate's own reaction rather than under it. Only
          // if it actually travelled, for the same reason as the grind above.
          if (s.sounded) {
            audio.play('stone-settle',
              { volume: plate ? 0.75 : 0.5, rate: plate ? 0.9 : 1.05, vary: 0.06 });
          }
          if (plate) {
            this._moveBoulder(b, plate.x, plate.z); // snap dead-center
            b._locked = true;                        // it holds the weight forever
            if (!plate.pressed) {
              plate.pressed = true;
              state.flags.plates[plate.id] = true;
              if (plate.onPressed) plate.onPressed();
            }
          }
        }
        continue;
      }
      if (b._locked) continue;

      // leaning: standing against the boulder starts the next step
      const dx = b.x - player.root.position.x;
      const dz = b.z - player.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > b.r + 0.32 + 0.1 || d < 1e-4) { b._lean = 0; continue; }
      b._lean = (b._lean || 0) + dt;
      if (b._lean < 0.12) continue; // a brief lean, so a stray bump can't shove it
      b._lean = 0;
      // snap the push to the dominant axis: one clean cardinal step
      const dir = Math.abs(dx) > Math.abs(dz)
        ? { dx: Math.sign(dx), dz: 0 }
        : { dx: 0, dz: Math.sign(dz) };
      // on bare stone: one clean 1.2u step. On ice: a long fast skid that only
      // ends at a wall, a rock, or a plate — so the kid must PLAN the lane.
      b._slide = this.slickFloor
        ? { ...dir, remaining: 26, speed: 5.5 }
        : { ...dir, remaining: 1.2, speed: 2.4 };
    }
  }

  doorAt(x, z) {
    // DOORS ARE ALWAYS OPEN. The encounter seal lived here for one version —
    // rooms with a fight in them locked until it was won — and dad pulled it
    // after playing it: "don't force the player by locking them in the room
    // until all enemies are defeated. terranigma and Zelda never did that and
    // that's what we've been modelling this off of." He is right about both
    // games. The difficulty he asked for lives in the enemies now — they
    // intercept, lunge and shoot — and the only doors with conditions on them
    // are boss doors and puzzle gates, which is what `when` is for.
    for (const d of this.doors) {
      if (d.when && !d.when()) continue;
      if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d;
    }
    return null;
  }

  // THE ENCOUNTER SEAL LIVED HERE, for exactly one version. Rooms with a fight
  // in them locked their doors until it was won. Dad pulled it after playing
  // it: "don't force the player by locking them in the room until all enemies
  // are defeated. terranigma and Zelda never did that and that's what we've
  // been modelling this off of." The difficulty he wanted is in the enemies
  // now — interception, lunges, spitters — and doors stay open, always.

  // The wind at a point, in units per second, summed over every lane covering
  // it. Summed rather than "the strongest wins" because two lanes crossing is a
  // real thing the Vanes room can produce, and the honest answer there is the
  // resultant — a child pushed diagonally out of a crossing has been told the
  // truth about what is happening to them.
  windAt(x, z) {
    let wx = 0, wz = 0;
    for (const l of this.galeLanes) {
      if (x < l.minX || x > l.maxX || z < l.minZ || z > l.maxZ) continue;
      wx += l.px; wz += l.pz;
    }
    return (wx || wz) ? { x: wx, z: wz } : null;
  }

  // The strongest lane covering a point, for anything that needs to ask "am I
  // standing in a gale" rather than "which way am I being pushed".
  galeAt(x, z) {
    let best = null, mag = 0;
    for (const l of this.galeLanes) {
      if (x < l.minX || x > l.maxX || z < l.minZ || z > l.maxZ) continue;
      const m = Math.hypot(l.px, l.pz);
      if (m > mag) { mag = m; best = l; }
    }
    return best;
  }

  // Turn a weathervane if the dash passed through one. Returns how many turned.
  turnVanesAt(x, z, r) {
    let n = 0;
    for (const v of this.vanes) {
      if (Math.hypot(v.x - x, v.z - z) > (v.r || 1.2) + r) continue;
      if (v.turn) { v.turn(); n++; }
    }
    return n;
  }

  // What is underfoot: null, 'shallow' or 'deep'. Deep wins where they overlap,
  // which happens at every shoreline because the shallow band is authored to
  // run UNDER the deep one — a hard edge between them reads as a cliff in the
  // water, and there is no such thing.
  waterAt(x, z) {
    let found = null;
    for (const w of this.waterZones) {
      if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
      if (w.deep) return 'deep';
      found = 'shallow';
    }
    return found;
  }

  // Put out anything burning within reach. Returns how many went out.
  quenchAt(x, z, r) {
    let n = 0;
    for (const q of this.quenchables) {
      if (q.out) continue;
      if (Math.hypot(q.x - x, q.z - z) > r) continue;
      if (q.quench()) n++;
    }
    return n;
  }

  // A ROOM IS DARK OR IT IS NOT.
  //
  // This used to test the point against each zone rectangle, so a room could be
  // dark down one end and lit down the other. Dad has now said the same thing
  // twice from play — "do not have random dark spots partially in a room" and
  // then, of the Night Road, "rooms either need to be full dark or light, not
  // half and half" — and he is right for a reason worth writing down: darkness
  // in this game is the LIGHT RIG dimming, which is a global effect with no
  // edge, so drawing an edge for it meant painting one on the floor, and a
  // painted edge is what he kept photographing.
  //
  // So the rectangle is gone as a test. `darkZone()` marks the room, the room
  // is uniformly dark, and the only lit things in it are real lights — a
  // campfire, a brazier, a lava pool — which is what a dark room ought to look
  // like anyway. The rect is still recorded on the zone because tools measure
  // it, but nothing reads it to decide whether a square of floor is in shadow.
  darknessAt(x, z) {          // eslint-disable-line no-unused-vars
    return this.roomDark ? 1 : 0;
  }

  // Is this square open floor or a hole? Bridge decks win here exactly as they
  // do over lava — a plank laid across a pit is floor.
  pitAt(x, z) {
    if (!this.pitZones.length) return false;
    for (const s of this.safeZones) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return false;
    }
    for (const p of this.pitZones) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) return true;
    }
    return false;
  }

  // Push a circle body (x, z, r) out of every static collider. Returns the
  // resolved position. Axis-of-least-penetration for boxes keeps sliding
  // along walls smooth; no impulses, no knockback — this is a kids' game.
  resolveCircle(x, z, r) {
    // A DOOR THAT WILL NOT OPEN IS A WALL, NOT A GAP.
    //
    // tools/probe-openholes.mjs swept all 218 doorways asking the general form
    // of dad's bug — "if the trigger will not fire here, is there something
    // solid instead?" — and found two that predate the seal entirely: the Knot's
    // way on to tc3, and tc4's way to the Grove. Both are `when()` doors that
    // stay shut until their puzzle is solved, and a doorway has no wall in it,
    // so a child who had not solved the Knot could stroll out of the opening and
    // into the void exactly as dad described.
    //
    // Rather than wall those two by hand, the rule the probe checks becomes the
    // rule the world keeps: while a door's condition is unmet, its opening is
    // solid. It costs at most four box tests, the boxes are built once and
    // cached on the door, and the day someone adds a nineteenth gated door it is
    // already handled.
    for (const d of this.doors) {
      if (!d.when || d.when()) continue;
      const b = d._shutBox || (d._shutBox = doorwayBox(d));
      const p = pushOutOfBox(x, z, r, b);
      x = p.x; z = p.z;
    }
    for (const b of this.boxColliders) {
      const nx = Math.max(b.minX, Math.min(x, b.maxX));
      const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        const left = x - b.minX, right = b.maxX - x;
        const top = z - b.minZ, bottom = b.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.minX - r;
        else if (m === right) x = b.maxX + r;
        else if (m === top) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
    for (const c of this.circleColliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      // DEAD CENTRE IS STILL INSIDE (2026-09-05). This branch used to `continue`
      // on d2 < 1e-9 — a body at the exact centre of a circle collider has no
      // direction to be pushed in, so it was left there. The box branch above
      // already handles its own degenerate case by axis of least penetration;
      // the circle branch just gave up, and a body dead centre in a brazier, a
      // boulder or a solidified prop walked around inside it until it drifted
      // off-centre by chance. Found when verify-spawn-clear called a placement
      // at dtp (0,-5) stuck while resolveCircle called the same point clear:
      // the collider's centre was (0,-5) exactly. Any direction will do as long
      // as it is the SAME one every frame, or the body jitters.
      if (d2 < 1e-9) { x = c.x + rr; continue; }
      const d = Math.sqrt(d2);
      x = c.x + (dx / d) * rr;
      z = c.z + (dz / d) * rr;
    }
    return { x, z };
  }
}
