// Momentary power-ups: glowing pickups that grant short, BIG buffs.
//   ⭐ Star of Luna    — 8s invincible + fast, sparkling trail
//   🔥 Ember Fury      — 10s triple damage
//   🪶 Feather         — 10s floaty triple-jump
//   🧲 Magnet Charm    — 12s drops fly to Kael
//   🌙 Moon Shard      — special recharges instantly
// Sources: golden chests, rare pot drops, boss rewards.

import * as THREE from 'three';
import { state } from './state.js';
import { audio } from './audio.js';

export const POWERUPS = {
  star: { icon: '⭐', name: 'Star of Luna', time: 8, color: 0xfff2a8 },
  fury: { icon: '🔥', name: 'Ember Fury', time: 10, color: 0xff6a2a },
  feather: { icon: '🪶', name: 'Feather', time: 10, color: 0xbfe8ff },
  magnet: { icon: '🧲', name: 'Magnet Charm', time: 12, color: 0xd88aff },
  moonshard: { icon: '🌙', name: 'Moon Shard', time: 0, color: 0xff4a5a },
};

export const powerupEvents = { onGained: null };

export function grantPowerup(player, kind) {
  const def = POWERUPS[kind];
  audio.play('pup-chime', { volume: 0.8, rate: 0.9 });
  if (kind === 'moonshard') {
    player.specialCooldown = 0;
  } else {
    player.buffs[kind] = def.time;
  }
  if (powerupEvents.onGained) powerupEvents.onGained(kind, def);
}

// A floating glowing pickup in the world.
export function spawnPowerup(world, x, z, kind) {
  const def = POWERUPS[kind];
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.24, 0),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: def.color, emissiveIntensity: 2.2, roughness: 1 })
  );
  mesh.position.set(x, 0.7, z);
  world.add(mesh);
  const glow = new THREE.PointLight(def.color, 3, 5, 1.9);
  glow.position.set(x, 0.9, z);
  world.add(glow);
  if (!world.powerups) world.powerups = [];
  world.powerups.push({ x, z, kind, mesh, glow, taken: false });
}

export function updatePowerups(world, dt, t, player) {
  if (!world.powerups) return;
  for (const p of world.powerups) {
    if (p.taken) continue;
    p.mesh.position.y = 0.7 + Math.sin(t * 2.6 + p.x) * 0.12;
    p.mesh.rotation.y = t * 2.2;
    const dx = player.root.position.x - p.x;
    const dz = player.root.position.z - p.z;
    if (dx * dx + dz * dz < 0.75 * 0.75) {
      p.taken = true;
      world.root.remove(p.mesh);
      world.root.remove(p.glow);
      grantPowerup(player, p.kind);
    }
  }
}

// Star trail + fury tint are cheap visual reminders that a buff is live.
const trailBits = [];
export function updateBuffVisuals(world, dt, t, player) {
  if (player.buffs.star > 0 && Math.sin(t * 30) > 0.5) {
    const bit = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.07, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.9 })
    );
    bit.position.copy(player.root.position);
    bit.position.y = 0.4 + Math.sin(t * 13) * 0.2;
    world.add(bit);
    trailBits.push({ mesh: bit, life: 0.5, world });
  }
  for (let i = trailBits.length - 1; i >= 0; i--) {
    const b = trailBits[i];
    b.life -= dt;
    b.mesh.material.opacity = Math.max(0, b.life * 1.8);
    b.mesh.position.y += dt * 0.8;
    if (b.life <= 0) {
      b.world.root.remove(b.mesh);
      trailBits.splice(i, 1);
    }
  }
}
