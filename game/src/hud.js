// The HUD: one DOM update per frame, no layout thrash — every element is cached by
// id once and only its text or width changes. Health and armor bars, ammo, money,
// round timer, score, team alive pips, killfeed, hitmarker, a crosshair that opens
// with spread, a red damage vignette, the buy menu, plant/defuse progress and the
// round and match banners.
import { WEAPONS } from './weapons.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    health: $('health-fill'),
    healthText: $('health-text'),
    armor: $('armor-fill'),
    ammo: $('ammo'),
    money: $('money'),
    timer: $('timer'),
    scoreV: $('score-v'),
    scoreE: $('score-e'),
    round: $('round'),
    pipsV: $('pips-v'),
    pipsE: $('pips-e'),
    killfeed: $('killfeed'),
    hitmarker: $('hitmarker'),
    crosshair: $('crosshair'),
    vignette: $('vignette'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    buy: $('buy-menu'),
    buyItems: $('buy-items'),
    bomb: $('bomb-timer'),
    plant: $('plant-bar'),
    plantFill: $('plant-fill'),
    hint: $('hint'),
    site: $('site'),
  };
  let lastAmmo = '';
  let lastTimer = '';
  let lastMoney = '';
  let lastScore = '';
  let lastPips = '';

  function show(elName, on) {
    el[elName].style.display = on ? '' : 'none';
  }

  return {
    setHealth(hp, armor) {
      el.health.style.width = `${Math.max(0, hp)}%`;
      el.healthText.textContent = String(Math.ceil(hp));
      el.armor.style.width = `${Math.max(0, armor)}%`;
      el.armor.style.display = armor > 0 ? '' : 'none';
    },
    setAmmo(mag, reserve, reloading) {
      const text = reloading ? 'RELOADING' : `${mag} / ${reserve}`;
      if (text !== lastAmmo) { el.ammo.textContent = text; lastAmmo = text; }
    },
    setMoney(m) {
      const text = `$${m}`;
      if (text !== lastMoney) { el.money.textContent = text; lastMoney = text; }
    },
    setTimer(seconds, urgent) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (text !== lastTimer) {
        el.timer.textContent = text;
        el.timer.style.color = urgent ? '#ff5a4a' : '';
        lastTimer = text;
      }
    },
    setScore(v, e, round) {
      const text = `${v}-${e}|${round}`;
      if (text !== lastScore) {
        el.scoreV.textContent = String(v);
        el.scoreE.textContent = String(e);
        el.round.textContent = `ROUND ${round}`;
        lastScore = text;
      }
    },
    setPips(vAlive, eAlive) {
      const text = `${vAlive}|${eAlive}`;
      if (text !== lastPips) {
        el.pipsV.textContent = '●'.repeat(vAlive) + '○'.repeat(5 - vAlive);
        el.pipsE.textContent = '●'.repeat(eAlive) + '○'.repeat(5 - eAlive);
        lastPips = text;
      }
    },
    setCrosshair(spreadPx) {
      el.crosshair.style.setProperty('--gap', `${4 + spreadPx * 26}px`);
    },
    hitmarker(head) {
      el.hitmarker.style.display = 'block';
      el.hitmarker.style.borderColor = head ? '#ff4030' : '#ffffff';
      window.setTimeout(() => { el.hitmarker.style.display = 'none'; }, 90);
    },
    kill(killer, victim, head) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<span class="feed-k">${killer}</span> <span class="feed-x">${head ? '◉' : '✕'}</span> <span class="feed-v">${victim}</span>`;
      el.killfeed.prepend(row);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      window.setTimeout(() => row.remove(), 6000);
    },
    flashDamage() {
      el.vignette.style.opacity = '0.85';
      window.setTimeout(() => { el.vignette.style.opacity = '0'; }, 160);
    },
    banner(title, sub, ms = 2600) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub;
      el.banner.style.display = 'flex';
      window.setTimeout(() => { el.banner.style.display = 'none'; }, ms);
    },
    hideBanner() { el.banner.style.display = 'none'; },
    setHint(text) { el.hint.textContent = text; },
    setSite(text) { el.site.textContent = text; },
    setBomb(seconds) {
      if (seconds > 0) {
        el.bomb.style.display = 'block';
        el.bomb.textContent = `BOMB ${seconds.toFixed(1)}`;
        el.bomb.style.color = seconds < 10 ? '#ff5a4a' : '#ffb35c';
      } else {
        el.bomb.style.display = 'none';
      }
    },
    setPlant(frac) {
      if (frac > 0) {
        el.plant.style.display = 'block';
        el.plantFill.style.width = `${Math.min(100, frac * 100)}%`;
      } else {
        el.plant.style.display = 'none';
      }
    },
    buildBuy(economy, weapons, onBuy) {
      el.buyItems.innerHTML = '';
      const rows = [];
      for (const [key, def] of Object.entries(WEAPONS)) {
        const owned = weapons.state.owned.has(key);
        const afford = economy.canAfford(def.price);
        rows.push(`<div class="buy-row ${owned ? 'owned' : ''} ${afford || owned ? '' : 'poor'}" data-buy="${key}">
          <span class="buy-key">${key === 'pistol' ? '1' : key === 'smg' ? '2' : key === 'rifle' ? '3' : key === 'shotgun' ? '4' : '5'}</span>
          <span class="buy-name">${def.name}</span>
          <span class="buy-dmg">${def.damage} dmg</span>
          <span class="buy-price">${owned ? 'OWNED' : '$' + def.price}</span></div>`);
      }
      rows.push(`<div class="buy-row ${economy.state.kevlar ? 'owned' : ''}" data-buy="kevlar">
        <span class="buy-key">6</span><span class="buy-name">Kevlar Vest</span>
        <span class="buy-dmg">+50 armor</span>
        <span class="buy-price">${economy.state.kevlar ? 'OWNED' : '$650'}</span></div>`);
      rows.push(`<div class="buy-row" data-buy="grenade">
        <span class="buy-key">7</span><span class="buy-name">Frag Grenade</span>
        <span class="buy-dmg">${economy.state.grenades}/2 held</span>
        <span class="buy-price">$300</span></div>`);
      el.buyItems.innerHTML = rows.join('');
      el.buyItems.onclick = (e) => {
        const row = e.target.closest('[data-buy]');
        if (row && onBuy) onBuy(row.dataset.buy);
      };
    },
    toggleBuy(on) { el.buy.style.display = on ? 'block' : 'none'; },
    show,
  };
}
