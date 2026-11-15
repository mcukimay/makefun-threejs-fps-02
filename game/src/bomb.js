// The bomb: one device, carried by the player, planted at A or B. Hold E for 3 s
// inside a site ring to plant; a 40 s fuse starts; Ember bots converge to defuse and
// a 4 s channel anywhere inside the ring defuses it. Elimination or the round timer
// end the round too, but only a detonation or a defuse settles a planted bomb.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3;
export const DEFUSE_TIME = 4;
export const FUSE_TIME = 40;

export function createBomb(scene, sites) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.4 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4030') }),
  );
  light.position.set(0.12, 0.12, 0);
  const wire = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.03, 0.03),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6 }),
  );
  wire.position.set(0, 0.11, 0);
  group.add(body, light, wire);
  group.visible = false;
  scene.add(group);

  const state = {
    status: 'carried', // carried | planting | planted | defused | exploded
    site: null,
    plantProgress: 0,
    fuse: 0,
    pos: new THREE.Vector3(),
  };

  function siteAt(x, z) {
    for (const [key, site] of Object.entries(sites)) {
      const d = Math.hypot(x - site.center.x, z - site.center.z);
      if (d < site.radius) return key;
    }
    return null;
  }

  return {
    state,
    group,
    siteAt,
    // planting: called every tick while E is held inside a site. Returns true on plant.
    plantTick(dt, x, z) {
      if (state.status !== 'carried' && state.status !== 'planting') return false;
      const site = siteAt(x, z);
      if (!site) {
        state.status = 'carried';
        state.plantProgress = 0;
        return false;
      }
      state.status = 'planting';
      state.site = site;
      state.plantProgress += dt;
      if (state.plantProgress >= PLANT_TIME) {
        state.status = 'planted';
        state.fuse = FUSE_TIME;
        state.pos.copy(sites[site].center);
        group.position.copy(state.pos);
        group.position.y = 0.12;
        group.visible = true;
        return true;
      }
      return false;
    },
    cancelPlant() {
      if (state.status === 'planting') {
        state.status = 'carried';
        state.plantProgress = 0;
        state.site = null;
      }
    },
    tick(dt) {
      if (state.status === 'planted') {
        state.fuse -= dt;
        light.material.color.setHex(Math.sin(state.fuse * 6) > 0 ? '#ff4030' : '#400000');
        if (state.fuse <= 0) {
          state.status = 'exploded';
          group.visible = false;
          return true;
        }
      }
      return false;
    },
    defuse() {
      state.status = 'defused';
      group.visible = false;
    },
    reset() {
      state.status = 'carried';
      state.site = null;
      state.plantProgress = 0;
      state.fuse = 0;
      group.visible = false;
    },
  };
}
