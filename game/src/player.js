// The human player: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never swallows the
// player. Shift walks slowly (accurate), Ctrl crouches, Space jumps. Health and armor
// live here too; damage goes through armor first, half to the vest.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const SLOW_SPEED = 2.7;
const GROUND_ACCEL = 46;
const AIR_ACCEL = 10;
const FRICTION = 10;
const GRAVITY = 21;
const JUMP_SPEED = 6.4;

export function createPlayer(collider) {
  const state = {
    position: new THREE.Vector3(0, 0, 15),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    walking: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0021) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.5, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function damage(amount) {
    if (!state.alive) return 0;
    let rest = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, rest * 0.5);
      state.armor -= absorbed;
      rest -= absorbed;
    }
    state.health -= rest;
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
    }
    return rest;
  }

  function step(dt, keys) {
    if (!state.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    state.walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (crouching && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching && !collider.overlaps(state.position.x, state.position.y, state.position.z, RADIUS, STAND_HEIGHT, 0.02)) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const speed = state.crouching ? CROUCH_SPEED : state.walking ? SLOW_SPEED : WALK_SPEED;
    const blend = Math.min(1, (state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    state.velocity.x += (wish.x * speed - state.velocity.x) * blend;
    state.velocity.z += (wish.z * speed - state.velocity.z) * blend;
    if (state.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }
    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;
    collider.moveAxis(state.position, state.velocity, dt, RADIUS, state.height);
    state.onGround = collider.ground(state.position, state.velocity, state.height);
    state.velocity.y = Math.max(-30, state.velocity.y);
  }

  function reset(x, z, yaw) {
    state.position.set(x, 0, z);
    state.velocity.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.eye = STAND_EYE;
    state.height = STAND_HEIGHT;
    state.crouching = false;
    state.health = 100;
    state.alive = true;
  }

  return {
    state,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
  };
}
