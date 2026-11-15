// SANDLINE — the entry point. A fixed-step simulation at 60 Hz drives the round, and
// rendering follows the display: the two never share a clock. One loop owns the order
// of play — input, player, bots, grenades, bomb, round flow, HUD — so a round always
// ends the same way no matter how fast the machine renders it.
import * as THREE from 'three';
import { createWorld, SITES, SPAWNS } from './world.js';
import { makeCollider, makeWallRay } from './collide.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createGrenades } from './grenade.js';
import { createBomb } from './bomb.js';
import { createEconomy, KILL_REWARD, WIN_REWARD, LOSS_REWARD, PLANT_REWARD } from './buy.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createMatch } from './state.js';
import { PALETTE } from './palette.js';

const FIXED = 1 / 60;
const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 7);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = createWorld(scene);
const collider = makeCollider(world.colliders);
const wallBlocked = makeWallRay(world.colliders);
const effects = createEffects(scene, camera);
const audio = createAudio();
const player = createPlayer(collider);
const weapons = createWeaponSet(camera);
const combat = createCombat(world.shootables, () => bots.hitMeshes, effects);
const bots = createBots(scene, world, collider);
const grenades = createGrenades(scene, collider, effects, audio);
const bomb = createBomb(scene, SITES);
const economy = createEconomy();
const hud = createHud();
const input = createInput(canvas);
const match = createMatch();

const rayDir = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const eyePos = new THREE.Vector3();
let prevFiring = false;
let stepSoundAt = 0;
let pushSite = 'A';
let pushCheckAt = 0;
let shotEvents = [];
let frozen = false;

function siteOf(x, z) {
  const da = Math.hypot(x - SITES.A.center.x, z - SITES.A.center.z);
  const db = Math.hypot(x - SITES.B.center.x, z - SITES.B.center.z);
  return da < db ? 'A' : 'B';
}

function startRound() {
  const seed = (match.state.round * 7919 + SEED) % 100000;
  bots.assignRound(seed);
  grenades.clear();
  bomb.reset();
  const spawn = SPAWNS.vanguard[0];
  player.reset(spawn[0], spawn[1], 0);
  weapons.refillAmmo();
  pushSite = siteOf(player.state.position.x, player.state.position.z);
  bots.assignPush(pushSite);
  match.startRound();
  hud.setHint('B — buy menu · E — plant bomb · G — grenade · R — reload');
  hud.toggleBuy(false);
}

function endRound(winner, reason) {
  match.endRound(winner, reason);
  economy.earn(winner === 'vanguard' ? WIN_REWARD : LOSS_REWARD);
  hud.banner(
    winner === 'vanguard' ? 'VANGUARD TAKES THE ROUND' : 'EMBER TAKES THE ROUND',
    `${reason} · ${match.state.scoreV}–${match.state.scoreE} · +$${winner === 'vanguard' ? WIN_REWARD : LOSS_REWARD}`,
    3600,
  );
  if (winner === 'vanguard') audio.roundWin();
  else audio.roundLose();
  if (SHOT) return; // screenshot setups freeze the round where it ends
  window.setTimeout(() => {
    if (match.state.phase !== 'roundEnd') return;
    if (!match.nextRound()) {
      hud.banner(
        match.state.scoreV > match.state.scoreE ? 'VANGUARD WINS THE MATCH' : 'EMBER WINS THE MATCH',
        `${match.state.scoreV}–${match.state.scoreE} · press R to play again`,
        8000,
      );
      return;
    }
    startRound();
  }, 4200);
}

// One buy path for the keyboard and for clicks on the buy menu: buying an owned
// weapon just switches to it, buying one you cannot afford does nothing.
function doBuy(item) {
  if (item === 'kevlar') economy.buyKevlar(player);
  else if (item === 'grenade') economy.buyGrenade();
  else {
    economy.buyWeapon(item, weapons);
    weapons.switchTo(item);
  }
  hud.buildBuy(economy, weapons, doBuy);
}

function firePlayerShot() {
  const def = weapons.def();
  weapons.pullTrigger();
  if (!weapons.takeRound()) {
    audio.dryFire();
    return;
  }
  const speed = player.groundSpeed();
  const spread = weapons.spread(speed);
  audio.shot(def.kind, 1);
  player.recoil(def.kick * 0.55, (Math.random() - 0.5) * def.kick * 0.3);
  const pellets = def.pellets || 1;
  eyePos.copy(player.state.position);
  eyePos.y += player.state.eye;
  muzzle.copy(eyePos).addScaledVector(rayDir.set(0, 0, -1).applyQuaternion(camera.quaternion), 0.6);
  for (let p = 0; p < pellets; p += 1) {
    rayDir.set(
      (Math.random() * 2 - 1) * spread,
      (Math.random() * 2 - 1) * spread,
      -1,
    ).normalize().applyQuaternion(camera.quaternion);
    const from = eyePos;
    const hit = combat.fire(from, rayDir, 90, (hit, part) => {
      const bot = hit.object.userData.agent;
      const falloff = Math.max(0.55, 1 - Math.max(0, hit.distance - def.falloff) * 0.012);
      const dmg = def.damage * (part === 'head' ? def.headMult : 1) * falloff;
      const killed = bots.damage(bot, dmg, part);
      hud.hitmarker(part === 'head');
      audio.hit(killed);
      if (killed) {
        match.state.kills += 1;
        economy.earn(KILL_REWARD);
        hud.kill('You', bot.name, part === 'head');
      }
    }, () => {});
    const end = hit ? hit.point : from.clone().addScaledVector(rayDir, 90);
    effects.tracer(muzzle, end);
    if (hit && !hit.object.userData.agent) effects.burst(hit.point, 4, 2);
  }
  shotEvents.push({ x: player.state.position.x, z: player.state.position.z });
  effects.muzzle();
}

function throwPlayerGrenade() {
  if (economy.state.grenades <= 0) return;
  economy.state.grenades -= 1;
  eyePos.copy(player.state.position);
  eyePos.y += player.state.eye;
  rayDir.set(0, 0.35, -1).normalize().applyQuaternion(camera.quaternion);
  grenades.throwGrenade(eyePos, rayDir, 15);
}

function grenadeDamageAt(pos, radius, maxDmg) {
  const check = (targetPos, eyeY, apply) => {
    const d = Math.hypot(targetPos.x - pos.x, targetPos.z - pos.z);
    if (d > radius) return;
    const from = pos.clone();
    from.y += 0.3;
    const to = targetPos.clone();
    to.y += eyeY;
    if (wallBlocked(from, to)) return;
    apply(Math.round(maxDmg * (1 - d / radius) + 8));
  };
  check(player.state.position, 1.2, (dmg) => {
    player.damage(dmg);
    hud.flashDamage();
    audio.hit(false);
  });
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    check(bot.pos, 1.3, (dmg) => {
      if (bots.damage(bot, dmg, 'torso')) {
        match.state.kills += 1;
        economy.earn(KILL_REWARD);
        hud.kill('You', bot.name, false);
      }
    });
  }
}

function step(dt) {
  match.tick(dt);
  const m = match.state;
  // shot events are heard by the bots later in this same tick
  shotEvents = [];

  if (m.phase === 'menu') {
    hud.setHint('Click to play — first to 5 rounds wins the match');
    return;
  }
  if (m.phase === 'matchEnd') {
    if (input.wasPressed('KeyR')) {
      economy.reset();
      weapons.resetMatch();
      match.startMatch();
      startRound();
    }
    return;
  }

  // Weapon timers (cooldown, reload, kick) run in every combat phase.
  weapons.step(dt);

  // --- buy phase: menu, money, movement, no firing ---
  if (m.phase === 'buy') {
    if (input.wasPressed('KeyB')) {
      const open = document.getElementById('buy-menu').style.display !== 'block';
      hud.toggleBuy(open);
      if (open) hud.buildBuy(economy, weapons, doBuy);
    }
    const buyKeys = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'shotgun', Digit5: 'sniper', Digit6: 'kevlar', Digit7: 'grenade' };
    for (const [code, item] of Object.entries(buyKeys)) {
      if (input.wasPressed(code)) doBuy(item);
    }
    const look = input.consumeLook();
    player.look(look.dx, look.dy, 0.0021);
    player.step(dt, input.keys);
    if (m.timer <= 0) {
      match.beginLive();
      bots.deploy(match.state.time);
      hud.toggleBuy(false);
      hud.banner(`ROUND ${m.round}`, pushSite === 'A' ? 'Push A · Silos' : 'Push B · Depot', 2000);
    }
  }

  // --- live phase ---
  if (m.phase === 'live') {
    const look = input.consumeLook();
    const sens = weapons.state.zoomed ? 0.0009 : 0.0021;
    player.look(look.dx, look.dy, sens);
    player.step(dt, input.keys);

    // weapon switching
    const slots = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'shotgun', Digit5: 'sniper' };
    for (const [code, key] of Object.entries(slots)) {
      if (input.wasPressed(code)) weapons.switchTo(key);
    }
    if (input.wasPressed('KeyR')) weapons.reload();
    if (input.wasPressed('KeyG')) throwPlayerGrenade();
    // sniper zoom on right mouse
    if (weapons.def().zoom && input.zooming && !weapons.state.zoomed) {
      weapons.state.zoomed = true;
      camera.fov = 28;
      camera.updateProjectionMatrix();
    } else if ((!weapons.def().zoom || !input.zooming) && weapons.state.zoomed) {
      weapons.state.zoomed = false;
      camera.fov = 75;
      camera.updateProjectionMatrix();
    }
    // firing
    const def = weapons.def();
    const edge = input.firing && !prevFiring;
    if (player.state.alive && input.firing && (def.auto || edge) && weapons.ready()) {
      firePlayerShot();
    }
    prevFiring = input.firing;

    // footsteps
    if (player.state.onGround && player.groundSpeed() > 2 && match.state.time > stepSoundAt) {
      stepSoundAt = match.state.time + (player.state.crouching ? 0.55 : 0.38);
      audio.footstep();
    }

    // bomb plant
    if (player.state.alive && bomb.state.status !== 'planted' && input.keys.has('KeyE')) {
      const planted = bomb.plantTick(dt, player.state.position.x, player.state.position.z);
      if (planted) {
        economy.earn(PLANT_REWARD);
        hud.banner('BOMB PLANTED', `${bomb.state.site === 'A' ? 'A · Silos' : 'B · Depot'} · 40 seconds`, 2400);
        audio.plantTick();
        m.planted = true;
      }
    } else {
      bomb.cancelPlant();
    }
    if (bomb.tick(dt)) {
      effects.explosion(bomb.state.pos);
      audio.explosion();
      endRound('vanguard', 'Bomb detonated');
    }

    // teammates push the site the player is pushing
    pushCheckAt -= dt;
    if (pushCheckAt <= 0) {
      pushCheckAt = 3;
      const next = siteOf(player.state.position.x, player.state.position.z);
      if (next !== pushSite) {
        pushSite = next;
        bots.assignPush(pushSite);
      }
    }

    // round end: elimination, timer, bomb. The phase guard matters: the bomb
    // explosion above already ended the round, and a second endRound would score twice.
    if (m.phase === 'live') {
      const vAlive = bots.aliveCount('vanguard') + (player.state.alive ? 1 : 0);
      const eAlive = bots.aliveCount('ember');
      if (eAlive === 0 && bomb.state.status !== 'planted') endRound('vanguard', 'Ember eliminated');
      else if (vAlive === 0 && bomb.state.status !== 'planted') endRound('ember', 'Vanguard eliminated');
      else if (m.timer <= 0 && bomb.state.status !== 'planted') endRound('ember', 'Time expired');
    }
  }

  // --- bots, grenades, effects run while the round is live. The buy phase is
  // freeze time: the bots stand at their spawns and nobody shoots, so a round can
  // never be decided before the player gets to play it. ---
  if (m.phase === 'live') {
    bots.step(dt, {
      time: m.time,
      player,
      bombPlanted: bomb.state.status === 'planted',
      bombSite: bomb.state.site,
      bombPos: bomb.state.pos,
      shots: shotEvents,
      onShot: (bot, to, weapon, hit) => {
        eyePos.set(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
        effects.tracer(eyePos, to);
        audio.shot(WEAPONS[weapon].kind, Math.max(0.15, 1 - Math.hypot(bot.pos.x - player.state.position.x, bot.pos.z - player.state.position.z) / 45));
        shotEvents.push({ x: bot.pos.x, z: bot.pos.z });
      },
      onDamagePlayer: (dmg, from) => {
        player.damage(dmg);
        hud.flashDamage();
        audio.hit(false);
        if (!player.state.alive) {
          match.state.deaths += 1;
          hud.kill(from.name, 'You', false);
        }
      },
      onKill: (killer, victim) => {
        hud.kill(killer.name, victim.name, false);
      },
      onDefuse: (bot) => {
        bomb.defuse();
        endRound('ember', `${bot.name} defused the bomb`);
      },
    });
    grenades.step(dt, grenadeDamageAt);
  }

  // --- round-end pause is handled by the setTimeout in endRound ---

  // --- camera follows the player, or stays at the death spot ---
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.y = player.state.yaw;
  camera.rotation.x = player.state.pitch;
  camera.rotation.z = 0;
  if (!player.state.alive) {
    camera.rotation.x = -0.1;
  }

  // --- HUD ---
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.state.reloadLeft > 0);
  hud.setMoney(economy.state.money);
  hud.setScore(m.scoreV, m.scoreE, m.round);
  hud.setPips(bots.aliveCount('vanguard') + (player.state.alive ? 1 : 0), bots.aliveCount('ember'));
  if (m.phase === 'buy') hud.setTimer(m.timer, false);
  else if (m.phase === 'live') hud.setTimer(bomb.state.status === 'planted' ? bomb.state.fuse : m.timer, bomb.state.status === 'planted' || m.timer < 15);
  hud.setCrosshair(weapons.spread(player.groundSpeed()) * 30 + (weapons.state.zoomed ? -0.12 : 0));
  hud.setBomb(bomb.state.status === 'planted' ? bomb.state.fuse : 0);
  hud.setPlant(bomb.state.status === 'planting' ? bomb.state.plantProgress / 3 : 0);
  hud.setSite(bomb.siteAt(player.state.position.x, player.state.position.z) || '');
  if (!player.state.alive && m.phase === 'live') hud.setHint('You are dead — your team fights on');
  effects.step(dt);
  input.endFrame();
}

function render() {
  renderer.render(scene, camera);
}

let accumulator = 0;
let last = performance.now();
function animate(now) {
  if (frozen) return;
  requestAnimationFrame(animate);
  const frameDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  accumulator += frameDt;
  let guard = 0;
  while (accumulator >= FIXED && guard < 5) {
    step(FIXED);
    accumulator -= FIXED;
    guard += 1;
  }
  if (guard === 5) accumulator = 0;
  render();
}

// --- menu: click to start the match ---
canvas.addEventListener('click', () => {
  if (match.state.phase !== 'menu') return;
  economy.reset();
  weapons.resetMatch();
  match.startMatch();
  startRound();
  input.lock();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- screenshot modes: deterministic setups, render twice, freeze, report ready ---
function setupShot(mode) {
  economy.reset();
  weapons.resetMatch();
  match.startMatch();
  if (mode === 'start') {
    startRound();
    match.state.phase = 'buy';
    player.reset(0, 16.8, 0);
    camera.position.set(0, 1.6, 16.8);
    camera.rotation.set(0, 0, 0);
    hud.buildBuy(economy, weapons, doBuy);
    hud.toggleBuy(true);
    hud.banner('SANDLINE', 'Dustworks Yard · first to 5 rounds', 60000);
  } else if (mode === 'play') {
    startRound();
    match.beginLive();
    // Behind the mid crates, 12 m behind the front line: the fight comes to the
    // player in a few seconds, but not inside the fast-forward window.
    player.reset(-2, 12, 0);
    player.state.yaw = 0.15;
    player.state.armor = 100;
    for (let i = 0; i < 180; i += 1) step(FIXED);
    // Stage the frame: if the fight killed the player during the fast-forward,
    // bring them back at the same spot. The bots, the killfeed and the map are
    // the real simulated state; the shot is a mid-fight frame, not a death cam.
    if (!player.state.alive) {
      player.reset(-2, 12, 0);
      player.state.yaw = 0.15;
      player.state.armor = 50;
      // One more tick so the HUD re-syncs to the revived player, and reset the
      // hint: the death hint is sticky and nothing clears it otherwise. A single
      // tick cannot kill a fresh 100 HP / 50 armor player.
      step(FIXED);
      hud.setHint('B — buy menu · E — plant bomb · G — grenade · R — reload');
    }
    hud.banner('', '', 1);
  } else if (mode === 'plant') {
    startRound();
    match.beginLive();
    player.reset(-15, -9, 0);
    player.state.yaw = 0;
    player.state.armor = 100;
    // Plant until the call reports planted: 180 x (1/60) sums to 2.9999… in binary,
    // one tick short of the 3 s plant time.
    for (let i = 0; i < 240 && !bomb.plantTick(FIXED, player.state.position.x, player.state.position.z); i += 1) { /* planting */ }
    for (let i = 0; i < 120; i += 1) step(FIXED);
    if (!player.state.alive) {
      player.reset(-15, -9, 0);
      player.state.yaw = 0;
      player.state.armor = 50;
      step(FIXED);
    }
  } else if (mode === 'end') {
    match.state.scoreV = 5;
    match.state.scoreE = 2;
    match.state.phase = 'matchEnd';
    player.reset(0, 12, 0);
    player.state.yaw = 0.15;
    hud.setScore(5, 2, 9);
    hud.setPips(3, 1);
    hud.setTimer(0, false);
    hud.setHealth(100, 0);
    hud.setMoney(2700);
    hud.setAmmo(12, 48, false);
    hud.banner('VANGUARD WINS THE MATCH', '5–2 · Dustworks Yard', 60000);
    // Elevated view over the yard: the shot is frozen, so the camera stays here.
    camera.position.set(0, 7, 15);
    camera.lookAt(-4, 0, -8);
  }
}

if (SHOT) {
  setupShot(SHOT);
  render();
  render();
  window.__shotReady = true;
  frozen = true;
} else {
  hud.banner('SANDLINE', 'Click to play · first to 5 rounds · B buys, E plants', 60000);
  requestAnimationFrame(animate);
}
