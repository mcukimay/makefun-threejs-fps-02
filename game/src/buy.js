// The economy: money in, money out. A kill pays $300, a round win $3250, a loss
// $1900, a plant $300. The buy menu sells the five weapons, Kevlar and grenades; the
// player starts every match with $800 and the P9. Nothing here touches the DOM — the
// HUD reads this state and renders it.
import { WEAPONS } from './weapons.js';

export const KEVLAR_PRICE = 650;
export const GRENADE_PRICE = 300;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const PLANT_REWARD = 300;

export function createEconomy() {
  const state = {
    money: START_MONEY,
    kevlar: false,
    grenades: 0,
  };

  function canAfford(price) { return state.money >= price; }

  function buyWeapon(key, weapons) {
    const def = WEAPONS[key];
    if (!def || weapons.state.owned.has(key)) return false;
    if (!canAfford(def.price)) return false;
    state.money -= def.price;
    weapons.buy(key);
    return true;
  }

  function buyKevlar(player) {
    if (state.kevlar || !canAfford(KEVLAR_PRICE)) return false;
    state.money -= KEVLAR_PRICE;
    state.kevlar = true;
    player.state.armor = 50;
    return true;
  }

  function buyGrenade() {
    if (state.grenades >= 2 || !canAfford(GRENADE_PRICE)) return false;
    state.money -= GRENADE_PRICE;
    state.grenades += 1;
    return true;
  }

  return {
    state,
    canAfford,
    buyWeapon,
    buyKevlar,
    buyGrenade,
    earn(amount) { state.money += amount; },
    reset() {
      state.money = START_MONEY;
      state.kevlar = false;
      state.grenades = 0;
    },
  };
}
