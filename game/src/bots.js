// The bots: nine of them, five Ember defenders and four Vanguard teammates. One state
// machine each: route along the waypoint graph, hold an angle, engage what they see,
// investigate a sound, or converge on a planted bomb to defuse it. Perception is
// staggered so nine bots never raycast on the same tick; aim error grows with distance
// and target speed, so a still target at close range dies and a sprinting one lives.
import * as THREE from 'three';
import { PALETTE, TEAM_COLOR } from './palette.js';
import { WEAPONS } from './weapons.js';

const BOT_NAMES = {
  ember: ['Rook', 'Vex', 'Sable', 'Krait', 'Onyx'],
  vanguard: ['Ash', 'Bram', 'Cole', 'Dusk'],
};
const BOT_WEAPONS = { ember: ['rifle', 'rifle', 'smg', 'shotgun', 'sniper'], vanguard: ['rifle', 'rifle', 'smg', 'shotgun'] };
const BOT_SPEED = 3.9;
const PERCEIVE_EVERY = 0.14;
const MAX_RANGE = 44;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBots(scene, world, collider) {
  const wallBlocked = (() => {
    const ray = new THREE.Raycaster();
    const tmp = new THREE.Vector3();
    const hitPoint = new THREE.Vector3();
    return function blocked(from, to) {
      tmp.copy(to).sub(from);
      const dist = tmp.length();
      if (dist < 0.001) return false;
      tmp.multiplyScalar(1 / dist);
      ray.set(from, tmp);
      for (let i = 0; i < world.colliders.length; i += 1) {
        const p = ray.ray.intersectBox(world.colliders[i], hitPoint);
        if (p && p.distanceToSquared(from) <= dist * dist + 1e-6) return true;
      }
      return false;
    };
  })();

  const hitMeshes = [];
  const list = [];
  const torsoGeo = new THREE.BoxGeometry(0.56, 0.8, 0.32);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.22);
  const gunGeo = new THREE.BoxGeometry(0.08, 0.1, 0.62);
  const discGeo = new THREE.CircleGeometry(0.16, 12);

  function buildBot(team, index) {
    const color = new THREE.Color(TEAM_COLOR[team]);
    const dark = new THREE.Color(PALETTE.steelDark);
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 }));
    torso.position.y = 1.05;
    const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color('#d9b48a'), roughness: 0.6 }));
    head.position.y = 1.62;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.6 }));
    helmet.position.y = 1.64;
    const legL = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8 }));
    legL.position.set(-0.14, 0.36, 0);
    const legR = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: dark, roughness: 0.8 }));
    legR.position.set(0.14, 0.36, 0);
    const gun = new THREE.Mesh(gunGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.5, metalness: 0.4 }));
    gun.position.set(0.2, 1.15, -0.25);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    disc.position.y = 1.95;
    disc.rotation.x = -Math.PI / 2;
    group.add(torso, head, helmet, legL, legR, gun, disc);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    scene.add(group);
    const bot = {
      id: `${team}-${index}`,
      name: BOT_NAMES[team][index],
      team,
      group,
      torso,
      head,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0,
      hp: 100,
      armor: 0,
      alive: true,
      weapon: BOT_WEAPONS[team][index],
      state: 'route',
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      target: null,
      lastSeen: null,
      reactionAt: 0,
      burstLeft: 0,
      nextShotAt: 0,
      thinkAt: Math.random() * PERCEIVE_EVERY,
      speed: BOT_SPEED * (0.92 + Math.random() * 0.16),
      fall: 0,
      investigateAt: null,
      defusing: 0,
      kills: 0,
    };
    torso.userData.agent = bot;
    torso.userData.part = 'torso';
    head.userData.agent = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    list.push(bot);
    return bot;
  }

  for (let i = 0; i < 5; i += 1) buildBot('ember', i);
  for (let i = 0; i < 4; i += 1) buildBot('vanguard', i);

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();

  function eyeOf(bot) {
    tmpA.set(bot.pos.x, bot.pos.y + 1.55, bot.pos.z);
    return tmpA;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    let rest = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, rest * 0.5);
      bot.armor -= absorbed;
      rest -= absorbed;
    }
    bot.hp -= rest;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.state = 'dead';
      bot.fall = 0;
      return true;
    }
    return false;
  }

  function setPath(bot, toId) {
    const fromId = world.nearestWaypoint(bot.pos.x, bot.pos.z);
    bot.path = world.findPath(fromId, toId);
    bot.pathIndex = 0;
    bot.state = 'route';
  }

  // Defenders hold a site; attackers push the site the player is nearest to.
  function assignRound(seed) {
    const rng = mulberry32(seed);
    const ember = list.filter((b) => b.team === 'ember');
    ember[0].holdSpot = 'A4';
    ember[1].holdSpot = 'A5';
    ember[2].holdSpot = 'B4';
    ember[3].holdSpot = 'B5';
    ember[4].holdSpot = rng() < 0.5 ? 'M2' : 'M3';
    for (const bot of list) {
      bot.hp = 100;
      bot.armor = bot.team === 'ember' ? 25 : 0;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.target = null;
      bot.lastSeen = null;
      bot.defusing = 0;
      bot.investigateAt = null;
      bot.deployAt = 0;
      const spawn = SPAWN_SPOT[bot.team][list.filter((b) => b.team === bot.team).indexOf(bot)];
      bot.pos.set(spawn[0], 0, spawn[1]);
      bot.yaw = bot.team === 'ember' ? Math.PI : 0;
      bot.group.position.copy(bot.pos);
      bot.group.rotation.y = bot.yaw;
      if (bot.team === 'ember') {
        setPath(bot, bot.holdSpot);
        bot.state = 'route';
      } else {
        bot.state = 'route';
        bot.path = [];
      }
    }
  }

  // Vanguard bots take the four spots the player does not: the player spawns at
  // SPAWNS.vanguard[0], so the first bot must not stand in the player's view.
  const SPAWN_SPOT = {
    vanguard: [[-4, 15.5], [4, 15.5], [-8, 14], [8, 14]],
    ember: [[0, -15], [-4, -15.5], [4, -15.5], [-8, -14], [8, -14]],
  };

  function moveToward(bot, dt, x, z, speed) {
    tmpB.set(x - bot.pos.x, 0, z - bot.pos.z);
    const dist = tmpB.length();
    if (dist < 0.05) return true;
    tmpB.multiplyScalar(1 / dist);
    const wantYaw = Math.atan2(-tmpB.x, -tmpB.z);
    let dyaw = wantYaw - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dyaw));
    bot.vel.set(tmpB.x * speed, 0, tmpB.z * speed);
    collider.moveAxis(bot.pos, bot.vel, dt, 0.34, 1.72);
    bot.vel.y = 0;
    return dist < 0.7;
  }

  // ctx: { time, player, bombPlanted, bombPos, shots: [{x,z}], onShot(from, to, weapon), onDamagePlayer(amount, from), onKill(killer, victim), onDefuse(bot) }
  function step(dt, ctx) {
    // The player object is the stable target identity: perceive compares targets by
    // reference, so a fresh wrapper object every tick would reset every reaction.
    ctx.player.isPlayer = true;
    for (const bot of list) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.group.rotation.x = -bot.fall * 1.45;
        }
        continue;
      }
      bot.group.position.copy(bot.pos);
      bot.group.rotation.y = bot.yaw;

      // --- deploy delay: the bot stands at its spawn until the round's deploy time ---
      if (bot.deployAt && ctx.time < bot.deployAt) continue;

      // --- perception, staggered ---
      bot.thinkAt -= dt;
      if (bot.thinkAt <= 0) {
        bot.thinkAt = PERCEIVE_EVERY;
        perceive(bot, ctx);
      }

      // --- defuse: an Ember bot at the planted bomb channels the defuse ---
      if (ctx.bombPlanted && bot.team === 'ember' && bot.state !== 'engage') {
        const siteWp = ctx.bombSite === 'A' ? 'A4' : 'B4';
        if (bot.pathTarget !== siteWp && bot.state !== 'defuse') {
          setPath(bot, siteWp);
          bot.pathTarget = siteWp;
        }
        const d = Math.hypot(bot.pos.x - ctx.bombPos.x, bot.pos.z - ctx.bombPos.z);
        if (d < 1.6) {
          bot.state = 'defuse';
          bot.defusing += dt;
          if (bot.defusing >= 4) {
            bot.defusing = 0;
            ctx.onDefuse(bot);
            return;
          }
        } else if (bot.state === 'defuse') {
          bot.defusing = 0;
          bot.state = 'route';
        }
      }

      // --- movement by state ---
      if (bot.state === 'engage' && bot.target) {
        const t = bot.target;
        const tp = t.isPlayer ? t.state.position : t.pos;
        const dist = Math.hypot(tp.x - bot.pos.x, tp.z - bot.pos.z);
        if (dist > 14) {
          moveToward(bot, dt, tp.x, tp.z, bot.speed * 0.7);
        } else {
          // strafe slowly while fighting
          const strafe = Math.sin(ctx.time * 0.7 + bot.id.length) > 0 ? 1 : -1;
          tmpB.set(tp.x - bot.pos.x, 0, tp.z - bot.pos.z).normalize();
          const px = -tmpB.z * strafe;
          const pz = tmpB.x * strafe;
          bot.vel.set(px * 1.1, 0, pz * 1.1);
          collider.moveAxis(bot.pos, bot.vel, dt, 0.34, 1.72);
          bot.yaw = Math.atan2(-tmpB.x, -tmpB.z);
        }
        fight(bot, ctx, dt);
      } else if (bot.state === 'route' && bot.path.length) {
        const wp = world.waypointPos(bot.path[bot.pathIndex]);
        const arrived = moveToward(bot, dt, wp.x, wp.z, bot.speed);
        if (arrived) {
          bot.pathIndex += 1;
          if (bot.pathIndex >= bot.path.length) {
            bot.state = 'hold';
            bot.holdUntil = ctx.time + 2.5 + Math.random() * 4;
            if (bot.team === 'ember') bot.yaw = bot.team === 'ember' ? Math.PI : 0;
          }
        }
      } else if (bot.state === 'hold') {
        bot.vel.set(0, 0, 0);
        // scan: slow yaw sweep
        bot.yaw += Math.sin(ctx.time * 0.5 + bot.id.length * 1.3) * 0.25 * dt;
        if (ctx.time > bot.holdUntil) {
          if (bot.team === 'ember') {
            setPath(bot, bot.holdSpot);
          } else {
            bot.state = 'route';
          }
        }
      } else if (bot.state === 'investigate' && bot.investigateAt) {
        const arrived = moveToward(bot, dt, bot.investigateAt.x, bot.investigateAt.z, bot.speed * 1.1);
        if (arrived) {
          bot.state = 'hold';
          bot.holdUntil = ctx.time + 3;
          bot.investigateAt = null;
        }
      }

      // --- hearing: a shot nearby pulls the bot to look (not its own muzzle) ---
      for (const s of ctx.shots) {
        const d = Math.hypot(s.x - bot.pos.x, s.z - bot.pos.z);
        if (d < 1.5) continue;
        if (d < 26 && bot.state !== 'engage' && bot.state !== 'defuse') {
          bot.investigateAt = { x: s.x, z: s.z };
          bot.state = 'investigate';
        }
      }
    }
  }

  function perceive(bot, ctx) {
    // pick the nearest visible enemy: the player or a bot of the other team
    let best = null;
    let bestD = Infinity;
    const eye = eyeOf(bot);
    const candidates = [];
    if (ctx.player.state.alive && ctx.player.state.health > 0 && bot.team === 'ember') {
      candidates.push({ target: ctx.player, pos: ctx.player.state.position, eyeY: 1.5 });
    }
    for (const other of list) {
      if (other.team === bot.team || !other.alive) continue;
      candidates.push({ target: other, pos: other.pos, eyeY: 1.4 });
    }
    for (const c of candidates) {
      const dx = c.pos.x - bot.pos.x;
      const dz = c.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > MAX_RANGE || dist >= bestD) continue;
      // Facing cone: a bot only sees what is in front of it (about 115 degrees),
      // unless the enemy is close enough to hear. A bot walking down a lane does
      // not snap to a target behind it, and a firing squad has to turn to form.
      if (dist > 6) {
        let dyaw = Math.atan2(-dx, -dz) - bot.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        if (Math.abs(dyaw) > 1.0) continue;
      }
      tmpC.set(c.pos.x, c.pos.y + c.eyeY, c.pos.z);
      if (wallBlocked(eye, tmpC)) continue;
      best = c.target;
      bestD = dist;
    }
    if (best) {
      if (bot.target !== best) {
        bot.reactionAt = ctx.time + 0.5 + Math.random() * 0.5;
        bot.burstLeft = 0;
      }
      bot.target = best;
      bot.lastSeen = { time: ctx.time, dist: bestD };
      bot.state = 'engage';
    } else if (bot.target) {
      // lost sight: keep the last position for a moment, then give up
      if (!bot.lastSeen || ctx.time - bot.lastSeen.time > 1.2) {
        bot.target = null;
        if (bot.state === 'engage') {
          bot.state = bot.team === 'ember' ? 'route' : 'route';
          if (bot.team === 'ember') setPath(bot, bot.holdSpot);
        }
      }
    }
  }

  function fight(bot, ctx, dt) {
    if (!bot.target || ctx.time < bot.reactionAt) return;
    const t = bot.target;
    const tp = t.isPlayer ? t.state.position : t.pos;
    const eye = eyeOf(bot);
    tmpC.set(tp.x, tp.y + 1.35, tp.z);
    if (wallBlocked(eye, tmpC)) return;
    const dist = Math.hypot(tp.x - bot.pos.x, tp.z - bot.pos.z);
    const def = WEAPONS[bot.weapon];
    if (ctx.time < bot.nextShotAt) return;
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(Math.random() * 3);
    }
    bot.burstLeft -= 1;
    bot.nextShotAt = bot.burstLeft <= 0
      ? ctx.time + 0.5 + Math.random() * 0.5
      : ctx.time + def.gap * (def.kind === 'sniper' ? 3 : 1);
    // aim with error that grows with distance and target speed; forward is -z, so the
    // direction is (-sin yaw, sin pitch, -cos yaw).
    const targetSpeed = t.isPlayer ? Math.hypot(t.state.velocity.x, t.state.velocity.z) : 2;
    const err = 0.04 + dist * 0.0016 + targetSpeed * 0.004;
    const aimYaw = Math.atan2(-(tp.x - bot.pos.x), -(tp.z - bot.pos.z)) + (Math.random() * 2 - 1) * err * 2;
    const aimPitch = Math.atan2((tp.y + 1.35) - (bot.pos.y + 1.55), dist) + (Math.random() * 2 - 1) * err * 2;
    tmpB.set(-Math.sin(aimYaw) * Math.cos(aimPitch), Math.sin(aimPitch), -Math.cos(aimYaw) * Math.cos(aimPitch));
    // does the shot reach the target, or a wall first?
    const reach = Math.min(dist + 2, 60);
    tmpC.copy(eye).addScaledVector(tmpB, reach);
    if (wallBlocked(eye, tmpC)) {
      ctx.onShot(bot, tmpC, bot.weapon, false);
      return;
    }
    // hit: head when the error is small. Bot damage is scaled to 0.6 so a firefight
    // lasts long enough to play: a bot still wins a duel against a player standing
    // still in the open, but not in a single burst.
    const head = Math.random() < 0.14;
    const falloff = Math.max(0.55, 1 - Math.max(0, dist - def.falloff) * 0.012);
    const dmg = def.damage * (head ? def.headMult : 1) * falloff * 0.6;
    ctx.onShot(bot, tmpC, bot.weapon, true);
    if (t.isPlayer) ctx.onDamagePlayer(dmg, bot);
    else if (damage(t, dmg, head ? 'head' : 'torso')) ctx.onKill(bot, t);
  }

  return {
    list,
    hitMeshes,
    assignRound,
    step,
    damage,
    setPath,
    // Mark the round live: bots deploy 2.5 s from `now`, so the first contact is
    // a push, not a spawn firing squad.
    deploy(now) {
      for (const bot of list) bot.deployAt = now + 2.5;
    },
    // Send the Vanguard teammates at a site; called at round start and when the
    // player pushes the other site.
    assignPush(siteKey) {
      const spots = siteKey === 'A' ? ['A4', 'A5', 'A6'] : ['B4', 'B5', 'B6'];
      const vanguard = list.filter((b) => b.team === 'vanguard' && b.alive);
      vanguard.forEach((bot, i) => {
        if (bot.state === 'engage' || bot.state === 'defuse') return;
        setPath(bot, spots[i % spots.length]);
      });
    },
    aliveCount(team) {
      return list.filter((b) => b.team === team && b.alive).length;
    },
  };
}
