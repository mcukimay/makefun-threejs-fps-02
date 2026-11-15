// Tracers, muzzle flash, impact sparks and explosions. Everything is pooled: no
// object is created during a frame, only reused. The pool sizes are fixed at build
// time, so a long firefight costs the same as a quiet one.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 240;
const SMOKE = 60;

export function createEffects(scene, camera) {
  // --- tracers: thin fading lines, one pool slot per shot in flight ---
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracerPool = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const line = new THREE.Line(tracerGeo.clone(), tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, life: 0 });
  }
  let tracerNext = 0;

  // --- sparks: one Points cloud, particles recycled by index ---
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.95, depthWrite: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkNext = 0;

  // --- smoke puffs: soft dark spheres that grow and fade ---
  const smokeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a5148'), transparent: true, opacity: 0.4, depthWrite: false });
  const smokeGeo = new THREE.SphereGeometry(1, 10, 8);
  const smokePool = [];
  for (let i = 0; i < SMOKE; i += 1) {
    const mesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    smokePool.push({ mesh, life: 0, grow: 1 });
  }
  let smokeNext = 0;

  // --- explosion flash: one light + one expanding shell, reused ---
  const boomLight = new THREE.PointLight(new THREE.Color('#ff9a3c'), 0, 26);
  scene.add(boomLight);
  const boomShell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb35c'), transparent: true, opacity: 0, depthWrite: false }),
  );
  boomShell.visible = false;
  scene.add(boomShell);
  let boomLife = 0;

  // --- muzzle flash on the camera, same trick as the starter ---
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);
  let flashLeft = 0;

  const tmpV = new THREE.Vector3();

  function tracer(from, to) {
    const slot = tracerPool[tracerNext];
    tracerNext = (tracerNext + 1) % TRACERS;
    const attr = slot.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    slot.line.visible = true;
    slot.line.material.opacity = 0.85;
    slot.life = 0.07;
  }

  function burst(point, count, speed, up = 0.5) {
    for (let n = 0; n < count; n += 1) {
      const i = sparkNext;
      sparkNext = (sparkNext + 1) % SPARKS;
      sparkPos[i * 3] = point.x;
      sparkPos[i * 3 + 1] = point.y;
      sparkPos[i * 3 + 2] = point.z;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      sparkVel[i * 3] = Math.cos(a) * Math.cos(e) * speed * (0.4 + Math.random() * 0.6);
      sparkVel[i * 3 + 1] = (Math.sin(e) + up) * speed * 0.6;
      sparkVel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * speed * (0.4 + Math.random() * 0.6);
      sparkLife[i] = 0.25 + Math.random() * 0.35;
    }
    sparkGeo.getAttribute('position').needsUpdate = true;
  }

  function puff(point, scale) {
    const slot = smokePool[smokeNext];
    smokeNext = (smokeNext + 1) % SMOKE;
    slot.mesh.position.copy(point);
    slot.mesh.scale.setScalar(0.3 * scale);
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 0.42;
    slot.life = 1.1;
    slot.grow = scale;
  }

  function explosion(point) {
    boomLight.position.copy(point);
    boomLight.position.y += 1;
    boomLight.intensity = 60;
    boomShell.position.copy(point);
    boomShell.scale.setScalar(0.4);
    boomShell.visible = true;
    boomShell.material.opacity = 0.85;
    boomLife = 0.45;
    burst(point, 60, 7, 0.8);
    for (let i = 0; i < 5; i += 1) {
      tmpV.copy(point);
      tmpV.x += (Math.random() - 0.5) * 2;
      tmpV.y += Math.random() * 1.5;
      tmpV.z += (Math.random() - 0.5) * 2;
      puff(tmpV, 1.6);
    }
  }

  function step(dt) {
    for (const slot of tracerPool) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.line.material.opacity = Math.max(0, slot.life / 0.07) * 0.85;
      if (slot.life <= 0) slot.line.visible = false;
    }
    let anySpark = false;
    for (let i = 0; i < SPARKS; i += 1) {
      if (sparkLife[i] <= 0) continue;
      anySpark = true;
      sparkLife[i] -= dt;
      sparkVel[i * 3 + 1] -= 9 * dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt;
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      if (sparkPos[i * 3 + 1] < 0.02) { sparkPos[i * 3 + 1] = 0.02; sparkVel[i * 3 + 1] *= -0.3; }
      if (sparkLife[i] <= 0) { sparkPos[i * 3 + 1] = -10; }
    }
    if (anySpark) sparkGeo.getAttribute('position').needsUpdate = true;
    for (const slot of smokePool) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const s = slot.mesh.scale.x + slot.grow * dt * 1.4;
      slot.mesh.scale.setScalar(s);
      slot.mesh.material.opacity = Math.max(0, slot.life / 1.1) * 0.42;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const t = 1 - Math.max(0, boomLife) / 0.45;
      boomShell.scale.setScalar(0.4 + t * 6);
      boomShell.material.opacity = Math.max(0, 0.85 * (1 - t));
      boomLight.intensity = Math.max(0, 60 * (1 - t * 1.4));
      if (boomLife <= 0) { boomShell.visible = false; boomLight.intensity = 0; }
    }
    if (flashLeft > 0) {
      flashLeft -= dt;
      flash.visible = flashLeft > 0;
      flash.rotation.z = flashLeft * 40;
      flashLight.intensity = flashLeft > 0 ? 18 : 0;
    }
  }

  return {
    tracer,
    burst,
    puff,
    explosion,
    step,
    muzzle() { flashLeft = 0.06; },
  };
}
