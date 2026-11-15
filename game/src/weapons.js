// Weapons, data-driven. Each definition is one row: damage, headshot multiplier, how
// fast it fires, how wide it sprays standing still and on the move, magazine, reload
// time, price and the sound it makes. One weapon instance owns its view model, its
// ammo and its timers; main.js owns the ray and the damage. Spread punishes moving
// and firing fast: stopping to aim pays, spraying on the run does not.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P9 Sidearm', kind: 'pistol', price: 0, damage: 26, headMult: 4, mag: 12, reserve: 48, auto: false, gap: 0.22, reload: 1.4, spreadStill: 0.005, spreadMove: 0.028, kick: 0.011, falloff: 14 },
  smg: { name: 'VK-9 SMG', kind: 'smg', price: 1500, damage: 24, headMult: 4, mag: 30, reserve: 120, auto: true, gap: 0.075, reload: 1.8, spreadStill: 0.007, spreadMove: 0.034, kick: 0.007, falloff: 16 },
  rifle: { name: 'AR-77 Rifle', kind: 'rifle', price: 2700, damage: 33, headMult: 4, mag: 30, reserve: 90, auto: true, gap: 0.096, reload: 2.1, spreadStill: 0.003, spreadMove: 0.03, kick: 0.009, falloff: 30 },
  sniper: { name: 'Longshot', kind: 'sniper', price: 4750, damage: 88, headMult: 2.5, mag: 5, reserve: 15, auto: false, gap: 1.1, reload: 2.8, spreadStill: 0.0008, spreadMove: 0.02, kick: 0.05, falloff: 60, zoom: true },
  shotgun: { name: 'Breacher', kind: 'shotgun', price: 1700, damage: 9, headMult: 3, mag: 6, reserve: 24, auto: false, gap: 0.85, reload: 2.6, spreadStill: 0.028, spreadMove: 0.04, kick: 0.03, falloff: 10, pellets: 8 },
};

const VIEW = {
  pistol: { len: 0.24, barrel: 0.12, grip: true },
  smg: { len: 0.42, barrel: 0.2, grip: true },
  rifle: { len: 0.55, barrel: 0.34, grip: true },
  sniper: { len: 0.68, barrel: 0.5, grip: false },
  shotgun: { len: 0.52, barrel: 0.4, grip: false },
};

export function createWeaponSet(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });

  const models = {};
  for (const [key, def] of Object.entries(WEAPONS)) {
    const v = VIEW[def.kind];
    const model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.1, v.len), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, v.barrel), gripMat);
    barrel.position.set(0, 0.03, -v.len / 2 - v.barrel / 2 + 0.08);
    model.add(receiver, barrel);
    if (v.grip) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.2), gripMat);
      stock.position.set(0, -0.03, v.len / 2);
      model.add(stock);
    }
    if (def.kind === 'sniper') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), gripMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      model.add(scope);
    }
    if (def.kind === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.18), accentMat);
      pump.position.set(0, -0.03, -v.len / 2 + 0.1);
      model.add(pump);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.1), accentMat);
    stripe.position.set(0, 0.055, 0.05);
    model.add(stripe);
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    models[key] = model;
  }

  const state = {
    current: 'pistol',
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    kick: 0,
    shotsFired: 0,
    owned: new Set(['pistol']),
    zoomed: false,
  };
  models.pistol.visible = true;

  function def() { return WEAPONS[state.current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 13);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.4;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = d.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.kick = 0.05 + def().kick;
      state.shotsFired += 1;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return;
      state.reloadLeft = d.reload;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove;
    },
    switchTo(key) {
      if (!state.owned.has(key) || key === state.current) return false;
      models[state.current].visible = false;
      state.current = key;
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0.3;
      state.reloadLeft = 0;
      state.zoomed = false;
      models[key].visible = true;
      return true;
    },
    buy(key) {
      if (state.owned.has(key)) return false;
      state.owned.add(key);
      return true;
    },
    refillAmmo() {
      for (const key of state.owned) {
        if (key === state.current) {
          state.mag = WEAPONS[key].mag;
          state.reserve = WEAPONS[key].reserve;
        }
      }
    },
    resetMatch() {
      models[state.current].visible = false;
      state.current = 'pistol';
      state.owned = new Set(['pistol']);
      state.mag = WEAPONS.pistol.mag;
      state.reserve = WEAPONS.pistol.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.zoomed = false;
      models.pistol.visible = true;
    },
  };
}
