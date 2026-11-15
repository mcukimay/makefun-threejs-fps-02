// Hitscan shooting, one job: a ray from a muzzle, the nearest thing it meets, and what
// happens there. The caller owns damage and sound; this module owns the ray. Walls are
// tested against agent meshes separately so no array is allocated per shot: the two
// nearest hits are compared by distance.
import * as THREE from 'three';

export function createCombat(walls, getAgents, effects) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;

  // from: eye position (Vector3, read only). dir: normalized direction. range: metres.
  // onAgent(hit, part): the ray met a living agent's hit mesh. onWall(hit): it met the map.
  function fire(from, dir, range, onAgent, onWall) {
    raycaster.set(from, dir);
    raycaster.far = range;
    const wallHit = raycaster.intersectObjects(walls, false)[0] || null;
    const agentHit = raycaster.intersectObjects(getAgents(), false)[0] || null;
    if (agentHit && (!wallHit || agentHit.distance < wallHit.distance)) {
      onAgent(agentHit, agentHit.object.userData.part || 'torso');
      return agentHit;
    }
    if (wallHit) {
      onWall(wallHit);
      effects.burst(wallHit.point, 5, 2.2);
      return wallHit;
    }
    return null;
  }

  return { fire };
}
