// Frag grenades: thrown on an arc, bounce once or twice off the world, then a 1.6 s
// fuse and a 6 m blast that falls off with distance and needs line of sight. One live
// grenade at a time per thrower is enough for a round this size; the mesh is a small
// dark sphere with a blinking fuse light.
import * as THREE from 'three';

const GRAVITY = 12;
const RADIUS = 6;
const MAX_DAMAGE = 95;

export function createGrenades(scene, collider, effects, audio) {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262e'), roughness: 0.5, metalness: 0.5 });
  const live = [];

  function throwGrenade(from, dir, speed) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    live.push({
      mesh,
      vel: dir.clone().multiplyScalar(speed),
      fuse: 2.2,
      bounced: 0,
    });
    audio.beep(1200);
  }

  // step returns an array of { pos } explosions this tick (usually zero or one)
  function step(dt, damageAt) {
    const explosions = [];
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.vel.y -= GRAVITY * dt;
      const before = g.mesh.position.clone();
      g.mesh.position.addScaledVector(g.vel, dt);
      if (collider.overlaps(g.mesh.position.x, g.mesh.position.y, g.mesh.position.z, 0.09, 0.18, 0)) {
        g.mesh.position.copy(before);
        // bounce: kill the dominant velocity component, keep the rest
        if (Math.abs(g.vel.x) > Math.abs(g.vel.z)) g.vel.x *= -0.4;
        else g.vel.z *= -0.4;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.bounced += 1;
        if (g.bounced > 2) g.vel.multiplyScalar(0.4);
      }
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        explosions.push({ pos: g.mesh.position.clone() });
        effects.explosion(g.mesh.position);
        audio.explosion();
        scene.remove(g.mesh);
        live.splice(i, 1);
        damageAt(g.mesh.position, RADIUS, MAX_DAMAGE);
      }
    }
    return explosions;
  }

  function clear() {
    for (const g of live) scene.remove(g.mesh);
    live.length = 0;
  }

  return { throwGrenade, step, clear, live };
}
