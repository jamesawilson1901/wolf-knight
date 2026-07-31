// Ability gates — data-driven obstacles that open only to a specific wolf
// form (see design/SYSTEMS.md). A gate the player can't open yet must read
// as a PROMISE (distinct look + mystery log entry), never as a bug.
//
// Gate types are defined here once; rooms place them with one call.
// - boulder: Earth Wolf's stomp (rides the existing crackables system)
// - water:   Tide Wolf (region 6) — pure promise for now
// - brazier: Fire Wolf's slam lights it (dungeon mechanic; not a wall)

import * as THREE from 'three';
import { state } from './state.js';
import { audio } from './audio.js';

export const GATE_TYPES = {
  boulder: { ability: 'earth_wolf', icon: '🪨', label: 'A huge boulder blocks the way' },
  water: { ability: 'tide_wolf', icon: '💧', label: 'A rushing fire-water channel' },
};

// Big single boulder — visually distinct from cracked-rock piles (one huge
// smooth stone with faint golden veins = "a form can move this someday").
export function boulderGate(world, prepareModel, rockGltf, id, x, z) {
  if (state.flags.cracked[id]) return null; // already smashed on a return trip
  const rock = prepareModel(rockGltf.scene.clone());
  rock.traverse((n) => {
    if (!n.isMesh) return;
    n.material = n.material.clone();
    n.material.color.setHex(0x6e7076);
    n.material.emissive = new THREE.Color(0xd8b06a);
    n.material.emissiveIntensity = 0.1;
  });
  rock.scale.setScalar(3.1);
  rock.position.set(x, 0, z);
  world.add(rock);
  const collider = { x, z, r: 1.25 };
  world.circleColliders.push(collider);
  // rides the crackables list so the Earth Wolf's stomp clears it later
  world.crackables.push({ id, x, z, group: rock, collider, cracked: false });
  return rock;
}

// Water channel — animated blue band + colliders. Nothing opens it yet;
// it exists to be remembered (Tide Wolf, region 6).
export function waterGate(world, x, z, w, d) {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({
      color: 0x1d3a52, emissive: 0x3a7aa8, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.9, roughness: 0.4,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, 0.03, z);
  world.add(water);
  world.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  world.onAnimate((t) => {
    water.material.emissiveIntensity = 0.4 + 0.2 * Math.sin(t * 1.8 + x);
    water.position.y = 0.03 + Math.sin(t * 2.4) * 0.008;
  });
  return water;
}

// Brazier — a cold iron bowl the Fire Wolf's ground-slam ignites. Rooms
// wire consequences through onLit; world.igniteAt is called by the slam.
export function brazier(world, prepareModel, torchGltf, id, x, z, onLit) {
  const stand = prepareModel(torchGltf.scene.clone());
  stand.scale.setScalar(2.0);
  stand.position.set(x, 0, z);
  stand.traverse((n) => {
    if (n.isMesh && n.material.name === 'Fire') {
      n.material = n.material.clone();
      n.material.emissive = new THREE.Color(0x333333);
      n.material.emissiveIntensity = 0.2; // cold — waiting for flame
    }
  });
  world.add(stand);
  world.addCircle(x, z, 0.3);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa03a, emissiveIntensity: 2.4, roughness: 1 })
  );
  flame.position.set(x, 1.65, z);
  flame.visible = false;
  world.add(flame);
  const light = new THREE.PointLight(0xffa03a, 0, 6, 1.9);
  light.position.set(x, 1.9, z);
  world.add(light);

  const b = { id, x, z, lit: false, gutterT: 0, flame, light, onLit };
  if (!world.braziers) {
    world.braziers = [];
    // the Fire Wolf's slam calls this (hooked from player.tryGroundSlam)
    world.igniteAt = (ix, iz, r) => {
      let n = 0;
      for (const br of world.braziers) {
        if (br.lit) continue;
        const dx = br.x - ix, dz = br.z - iz;
        if (dx * dx + dz * dz > r * r) continue;
        br.lit = true;
        br.flame.visible = true;
        br.light.intensity = 5;
        audio.play('burn', { volume: 0.7 });
        if (br.onLit) br.onLit(br);
        n++;
      }
      return n;
    };
    world.onAnimate((t, dt) => {
      for (const br of world.braziers) {
        if (!br.lit) continue;
        br.flame.scale.setScalar(1 + 0.15 * Math.sin(t * 9 + br.x));
        br.light.intensity = 4.5 + Math.sin(t * 11 + br.z);
        if (br.gutterAfter) { // timed braziers die back down (the "twist")
          br.gutterT += dt;
          if (br.gutterT > br.gutterAfter) {
            br.lit = false; br.gutterT = 0;
            br.flame.visible = false; br.light.intensity = 0;
            if (br.onGutter) br.onGutter(br);
          }
        }
      }
    });
  }
  world.braziers.push(b);
  return b;
}
