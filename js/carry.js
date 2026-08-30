// CARRY — a physical puzzle item the player picks up by walking over it and
// bears overhead until it's set down in a matching socket (playbook §4.3's
// "carried key" pattern; the Wild Arms trade in assets/verbs.json: carrying
// disables the special — gated in player.js's trySpecial).
//
// ROOMS REBUILD ON ENTRY (project law) — every mesh a room builder creates,
// including a carryItem's ground pickup or a socket's seated stone, dies
// with that room's World the moment the player walks through a door. The
// PLAYER does not: `player.root` is added to the scene once and reused for
// the whole session (js/main.js), so the held model is parented there, not
// to `world` — it is the one visual in this system that survives a room
// rebuild for free. Every other visual (the ground copy, the seated copy)
// is rebuilt from scratch by whichever room's builder runs next, driven by
// the one thing that DOES persist: a WorldState flag for "seated where" and
// this module's own CARRYING_ID mirror of player.carrying for "in hand
// right now" — a room builder only ever sees `world`, never `player`.
import * as THREE from 'three';
import { audio } from './audio.js';
import { WS } from './worldstate.js';

const PICKUP_R = 0.75;
const SOCKET_R = 0.85;
const BOB_HZ = 1.6;
const CARRY_Y = 1.55;

// Mirrors player.carrying, read by carryItem()/socket() at ROOM-BUILD time
// (before updateCarry ever runs for that room) to decide whether to draw a
// ground copy that is actually already in the child's hands.
export let CARRYING_ID = null;

function makeMesh(prepareModel, gltf, tint, scale) {
  const model = prepareModel(gltf.scene.clone());
  model.scale.setScalar(scale);
  model.traverse((n) => {
    if (!n.isMesh) return;
    n.material = n.material.clone();
    n.material.emissive = new THREE.Color(tint);
    n.material.emissiveIntensity = 0.7;
  });
  return model;
}

function makeRing() {
  const r = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.66, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  r.rotation.x = -Math.PI / 2;
  return r;
}

// A carriable item's home spot in ITS OWN room. Skipped if it's already
// seated in a socket (any room, WS-remembered) or already in the child's
// hands (walked back through here still carrying it).
export function carryItem(world, prepareModel, gltf, opts) {
  const { id, region, x, z, tint = 0xff8a3a, scale = 1.1 } = opts;
  if (WS.get(region, 'stone_' + id) || CARRYING_ID === id) return null;
  const args = { prepareModel, gltf, tint, scale };
  const group = new THREE.Group();
  group.add(makeMesh(prepareModel, gltf, tint, scale));
  const ring = makeRing();
  ring.position.y = (world.deckY || 0) + 0.03;
  group.add(ring);
  group.position.set(x, 0, z);
  world.add(group);
  const entry = { id, region, x, z, group, ring, args, taken: false };
  (world.carryPickups || (world.carryPickups = [])).push(entry);
  return entry;
}

// A place the stone can be seated. `stoneId` names the carryItem it holds;
// `onFill`/`onEmpty` wire the consequence. Renders its OWN seated copy of
// the stone if WS says it's here already — the room that produced the
// carryItem in the first place may not even be built this session.
export function socket(world, prepareModel, gltf, opts) {
  const { id, region, x, z, stoneId, tint = 0xff8a3a, scale = 1.1, onFill, onEmpty } = opts;
  const args = { prepareModel, gltf, tint, scale };
  const deck = world.deckY || 0;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.58, 0.12, 20),
    new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.9 })
  );
  base.position.set(x, deck - 0.04, z);
  world.add(base);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 20),
    new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0x8a5a2a, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.7, roughness: 1, depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, deck + 0.03, z);
  world.add(glow);

  const filled = WS.get(region, 'stone_' + stoneId) === id;
  let seatedMesh = null;
  if (filled) {
    seatedMesh = makeMesh(prepareModel, gltf, tint, scale);
    seatedMesh.position.set(x, 0, z);
    world.add(seatedMesh);
    glow.material.emissive.setHex(0x7aff8a);
    glow.material.emissiveIntensity = 1.1;
  }
  const s = { id, region, x, z, stoneId, filled, glow, seatedMesh, args, onFill, onEmpty };
  (world.sockets || (world.sockets = [])).push(s);
  return s;
}

// Call once per frame (main.js, alongside world.updateBoulders).
export function updateCarry(world, dt, t, player) {
  if (player._carryModel) {
    player._carryModel.position.y = CARRY_Y + Math.sin(t * BOB_HZ) * 0.06;
  }

  for (const c of world.carryPickups || []) {
    if (c.taken) continue;
    c.ring.material.opacity = 0.4 + 0.25 * Math.sin(t * 2.4);
    if (player.carrying) continue; // hands full
    const dx = c.x - player.root.position.x, dz = c.z - player.root.position.z;
    if (dx * dx + dz * dz > PICKUP_R * PICKUP_R) continue;
    c.taken = true;
    world.root.remove(c.group);
    player.carrying = c.id;
    CARRYING_ID = c.id;
    player._carryModel = makeMesh(c.args.prepareModel, c.args.gltf, c.args.tint, c.args.scale);
    player._carryModel.position.set(0, CARRY_Y, 0);
    player.root.add(player._carryModel);
    audio.play('checkpoint', { volume: 0.7, rate: 1.5 });
  }

  for (const s of world.sockets || []) {
    // HYSTERESIS (2026-08-30, dad's replay: 3504 coins). Both branches below
    // are proximity-automatic, so standing ON a filled socket retrieved the
    // stone one frame and re-seated it the next — and lg3's onFill paid its
    // 20-shard bonus on every re-seat: a 600-coins-per-second mint you
    // operated by standing still in the green circle. After either action
    // the socket now waits for the child to STEP OUT of its radius before it
    // will act again — the no-ferrying-softlock rule is untouched, you just
    // can't pick and place from the same standstill.
    {
      const dx = s.x - player.root.position.x, dz = s.z - player.root.position.z;
      if (dx * dx + dz * dz > SOCKET_R * SOCKET_R) s._settleUntilExit = false;
      else if (s._settleUntilExit) continue;
    }
    if (s.filled) {
      // retrieving — always allowed (no ferrying softlock, dungeons.json)
      if (player.carrying || !s.seatedMesh) continue;
      const dx = s.x - player.root.position.x, dz = s.z - player.root.position.z;
      if (dx * dx + dz * dz > SOCKET_R * SOCKET_R) continue;
      s._settleUntilExit = true;
      world.root.remove(s.seatedMesh);
      s.seatedMesh = null;
      s.filled = false;
      s.glow.material.emissive.setHex(0x8a5a2a);
      s.glow.material.emissiveIntensity = 0.5;
      WS.set(s.region, 'stone_' + s.stoneId, null);
      player.carrying = s.stoneId;
      CARRYING_ID = s.stoneId;
      player._carryModel = makeMesh(s.args.prepareModel, s.args.gltf, s.args.tint, s.args.scale);
      player._carryModel.position.set(0, CARRY_Y, 0);
      player.root.add(player._carryModel);
      audio.play('gate-creak', { volume: 0.6, rate: 1.3 });
      if (s.onEmpty) s.onEmpty(s);
    } else {
      // placing
      if (player.carrying !== s.stoneId) continue;
      const dx = s.x - player.root.position.x, dz = s.z - player.root.position.z;
      if (dx * dx + dz * dz > SOCKET_R * SOCKET_R) continue;
      player.root.remove(player._carryModel);
      player._carryModel = null;
      player.carrying = null;
      CARRYING_ID = null;
      s.filled = true;
      s._settleUntilExit = true;
      s.seatedMesh = makeMesh(s.args.prepareModel, s.args.gltf, s.args.tint, s.args.scale);
      s.seatedMesh.position.set(s.x, 0, s.z);
      world.add(s.seatedMesh);
      s.glow.material.emissive.setHex(0x7aff8a);
      s.glow.material.emissiveIntensity = 1.1;
      WS.set(s.region, 'stone_' + s.stoneId, s.id);
      audio.play('checkpoint', { volume: 0.8, rate: 1.2 });
      if (s.onFill) s.onFill(s);
    }
  }
}
