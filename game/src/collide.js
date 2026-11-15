// Axis-aligned collision, shared by the player, the bots and the grenades. One job:
// answer "does this box overlap a world collider" and "slide along it". The world hands
// in its collider list; nothing here knows about three.js meshes, only Box3s.
import * as THREE from 'three';

// A moving body is a vertical box: half-width r, height h, feet at y. Returns the first
// collider it overlaps, or null. lift keeps the feet and the crown out of the horizontal
// tests, so standing on the floor is not read as walking into a wall.
export function makeCollider(colliders) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, r, h, lift) {
    probe.min.set(x - r, y + lift, z - r);
    probe.max.set(x + r, y + h - lift, z + r);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }
  // Move one axis at a time; a blocked axis stops that axis only, so the body slides.
  function moveAxis(pos, vel, dt, r, h) {
    const nx = pos.x + vel.x * dt;
    if (!overlaps(nx, pos.y, pos.z, r, h, 0.04)) pos.x = nx;
    else vel.x = 0;
    const nz = pos.z + vel.z * dt;
    if (!overlaps(pos.x, pos.y, nz, r, h, 0.04)) pos.z = nz;
    else vel.z = 0;
    pos.y += vel.y * dt;
  }
  // Resolve the vertical axis against the floor and ceilings after the horizontal move.
  function ground(pos, vel, h) {
    const hit = overlaps(pos.x, pos.y, pos.z, 0.3, h, 0);
    if (hit && vel.y <= 0) {
      pos.y = hit.max.y;
      vel.y = 0;
      return true;
    }
    if (hit) {
      pos.y = hit.min.y - h;
      vel.y = 0;
    }
    if (pos.y < 0) {
      pos.y = 0;
      vel.y = 0;
      return true;
    }
    return false;
  }
  return { overlaps, moveAxis, ground };
}

// Ray against the world colliders only (no agents): true when a wall blocks the
// segment from `from` to `to`, false when the line of sight is clear. Used for bot
// line-of-sight so a wall always blocks a shot.
export function makeWallRay(colliders) {
  const ray = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  return function wallBlocked(from, to) {
    tmp.copy(to).sub(from);
    const dist = tmp.length();
    if (dist < 0.001) return false;
    tmp.multiplyScalar(1 / dist);
    ray.set(from, tmp);
    for (let i = 0; i < colliders.length; i += 1) {
      // intersectBox ignores the raycaster's far: a wall past the target must not
      // count, so the hit point has to lie within the segment.
      const p = ray.ray.intersectBox(colliders[i], hitPoint);
      if (p && p.distanceToSquared(from) <= dist * dist + 1e-6) return true;
    }
    return false;
  };
}
