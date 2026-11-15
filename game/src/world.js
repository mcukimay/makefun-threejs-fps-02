// DUSTWORKS YARD, the map of SANDLINE. A 44 x 36 m desert works yard at dusk: two
// bombsites (A Silos in the north-west, B Depot in the south-east), a mid lane, an
// A-long lane down the west wall and a roofed B-tunnel down the east. Every box is a
// collider for players and bots and a surface a bullet stops on. The waypoint graph
// at the bottom is what the bots walk; routes are hand-placed, never generated.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoints: id -> [x, z]. Edges are listed as pairs of ids.
const WAYPOINTS = {
  V0: [0, 15], V1: [-7, 14], V2: [7, 14],
  A1: [-19, 8], A2: [-19, 0], A3: [-19, -8], A4: [-15, -11], A5: [-12, -13], A6: [-18, -14],
  M1: [0, 10], M2: [0, 4], M3: [0, -4], M4: [0, -10],
  B1: [13, 8], B2: [18, 2], B3: [18, 10], B4: [15, 12], B5: [18, 14], B6: [11, 14],
  E0: [0, -15], E1: [-7, -14], E2: [7, -14],
  P1: [-8, -2], P2: [8, -2], P3: [-10, 6], P4: [10, 6],
};
const EDGES = [
  ['V0', 'V1'], ['V0', 'V2'], ['V0', 'M1'], ['V1', 'A1'], ['V2', 'B1'],
  ['A1', 'A2'], ['A2', 'A3'], ['A3', 'A4'], ['A4', 'A5'], ['A5', 'A6'], ['A3', 'M3'],
  ['M1', 'M2'], ['M2', 'M3'], ['M3', 'M4'], ['M4', 'E0'], ['M2', 'B1'], ['M2', 'P1'], ['M2', 'P2'],
  ['B1', 'B2'], ['B2', 'B3'], ['B3', 'B4'], ['B4', 'B5'], ['B5', 'B6'], ['B4', 'M1'],
  ['E0', 'E1'], ['E0', 'E2'], ['E1', 'A3'], ['E2', 'M4'], ['P1', 'A2'], ['P2', 'B2'],
  ['P3', 'V1'], ['P3', 'M1'], ['P4', 'V2'], ['P4', 'M1'], ['P1', 'M3'], ['P2', 'M3'],
];

export const SITES = {
  A: { name: 'A · Silos', center: new THREE.Vector3(-15, 0, -12), radius: 4.2 },
  B: { name: 'B · Depot', center: new THREE.Vector3(16, 0, 12.5), radius: 4.2 },
};

export const SPAWNS = {
  vanguard: [[0, 16.8], [-4, 15.5], [4, 15.5], [-8, 14], [8, 14]],
  ember: [[0, -15], [-4, -15.5], [4, -15.5], [-8, -14], [8, -14]],
};

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#b3905f';
  g.fillRect(0, 0, 512, 512);
  // concrete slabs
  g.strokeStyle = 'rgba(60,45,28,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke();
  }
  // stains and sand drifts
  for (let i = 0; i < 260; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 4 + Math.random() * 26;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(90,66,38,0.10)' : 'rgba(230,205,150,0.10)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // painted lane lines, faded
  g.strokeStyle = 'rgba(240,168,48,0.55)';
  g.lineWidth = 5;
  g.setLineDash([26, 18]);
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.stroke();
  g.setLineDash([]);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function letterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,22,28,0.72)';
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.fillStyle = color;
  g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const mat = {};
  for (const name of Object.keys(PALETTE)) {
    mat[name] = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[name]), roughness: 0.92, metalness: 0.04 });
  }
  mat.steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steel), roughness: 0.55, metalness: 0.55 });
  mat.steelDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.6, metalness: 0.5 });
  mat.ground = new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0.02 });

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  function cylinder(rTop, rBottom, h, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // --- ground and boundary: 44 x 36, walls 5 m, open to the dusk sky ---
  const floor = new THREE.Mesh(new THREE.BoxGeometry(44.4, 0.4, 36.4), mat.ground);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  box(0.5, 5, 36.4, -22.2, 2.5, 0, mat.steelDark);
  box(0.5, 5, 36.4, 22.2, 2.5, 0, mat.steelDark);
  box(44.4, 5, 0.5, 0, 2.5, -18.2, mat.steelDark);
  box(44.4, 5, 0.5, 0, 2.5, 18.2, mat.steelDark);

  // --- site A, Silos: two tall cylinders and a crate yard ---
  cylinder(1.7, 1.7, 6.4, -18.5, 3.2, -14.5, mat.steel);
  cylinder(1.7, 1.7, 5.2, -14.8, 2.6, -15.8, mat.containerTeal);
  box(2.2, 1.1, 2.2, -12.5, 0.55, -11, mat.crate);
  box(1.2, 1.1, 1.2, -16.5, 0.55, -9, mat.crate);
  box(3.2, 0.9, 1.2, -10, 0.45, -15.5, mat.containerOchre);
  box(0.6, 2.4, 4.5, -11.5, 1.2, -13.5, mat.steelDark);

  // --- site B, Depot: a U of high walls, a container and a low roof edge ---
  box(0.5, 3.4, 7, 19.5, 1.7, 12, mat.steelDark);
  box(7, 3.4, 0.5, 16, 1.7, 15.8, mat.steelDark);
  box(2.6, 2.6, 1.4, 13.5, 1.3, 13.5, mat.containerTeal);
  box(1.2, 1.1, 1.2, 17.5, 0.55, 9.5, mat.crate);
  box(3.4, 0.9, 1.2, 12.5, 0.45, 10.5, mat.containerOchre);
  box(1.1, 1.1, 1.1, 15, 0.55, 15, mat.crate);

  // --- mid: a broken wall with a gap, a platform you can climb by stacked crates ---
  box(0.5, 2.6, 5.5, -3.2, 1.3, -1, mat.steel);
  box(0.5, 2.6, 5.5, 3.2, 1.3, -1, mat.steel);
  box(1.2, 0.9, 1.2, -5.5, 0.45, 2, mat.crate);
  box(1.2, 0.9, 1.2, 5.5, 0.45, 2, mat.crate);
  box(1.1, 0.9, 1.1, 6.5, 0.45, -6.5, mat.crate);
  box(1.1, 0.9, 1.1, 6.5, 1.35, -6.5, mat.crate);
  box(3.4, 0.5, 2.6, 6.5, 1.85, -6.5, mat.steel); // platform top at 2.1 m
  box(0.9, 1.8, 0.9, -6.5, 0.9, -6.5, mat.crate);

  // --- A-long cover: containers and a pillar ---
  box(2.6, 2.6, 1.3, -19.5, 1.3, 3, mat.containerTeal);
  box(1.2, 1.1, 1.2, -17, 0.55, -3, mat.crate);
  box(1.4, 3.4, 1.4, -19.8, 1.7, -6.5, mat.steelDark);

  // --- B-tunnel: a roofed passage down the east wall ---
  box(0.4, 3, 12, 20.6, 1.5, 5, mat.steel);
  box(3.4, 0.35, 12, 19, 3.1, 5, mat.steelDark);
  box(1.2, 1.1, 1.2, 18, 0.55, -1, mat.crate);
  box(2.4, 2.4, 1.2, 17.5, 1.2, 6.5, mat.containerOchre);

  // --- scattered cover: crates, a pipe run, a barrel cluster ---
  box(2.2, 1.1, 1.2, -8, 0.55, 7, mat.crate);
  box(2.2, 1.1, 1.2, 8, 0.55, -8, mat.crate);
  box(1.2, 1.1, 2.4, -2, 0.55, 12, mat.containerTeal);
  box(1.2, 1.1, 2.4, 3, 0.55, -12, mat.containerOchre);
  cylinder(0.55, 0.55, 0.9, 11, 0.45, 0, mat.rust);
  cylinder(0.55, 0.55, 0.9, 12.2, 0.45, 0.8, mat.rust);
  cylinder(0.55, 0.55, 0.9, 11.6, 0.45, 1.4, mat.steel);
  box(0.7, 0.7, 10, -13, 0.35, 4, mat.steelDark); // low pipe run, jumpable cover

  // --- floating site markers, A and B ---
  const markers = {};
  for (const [key, site] of Object.entries(SITES)) {
    const tex = letterTexture(key, key === 'A' ? '#f0a830' : '#7fd0ff');
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.position.set(site.center.x, 4.6, site.center.z);
    sprite.scale.set(2.2, 2.2, 1);
    scene.add(sprite);
    markers[key] = sprite;
    // painted ring on the ground
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.25, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(key === 'A' ? '#f0a830' : '#7fd0ff'), transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.02, site.center.z);
    group.add(ring);
  }

  // --- sky: dusk gradient dome, low sun disc, distant skyline silhouettes ---
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.dusk), 26, 90);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c'), fog: false }),
  );
  sun.position.set(-60, 14, -70);
  sun.lookAt(0, 4, 0);
  scene.add(sun);
  const skylineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#1a2033'), fog: true });
  const skyline = [[-70, -40, 18, 26], [-45, -55, 24, 34], [-10, -60, 16, 22], [30, -52, 20, 30], [62, -38, 14, 20], [75, 10, 18, 24], [-75, 20, 16, 22]];
  for (const [x, z, w, h] of skyline) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), skylineMat);
    b.position.set(x, h / 2 - 2, z);
    scene.add(b);
  }
  // drifting dust motes
  const dustCount = 160;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = (Math.random() - 0.5) * 44;
    dustPos[i * 3 + 1] = 0.3 + Math.random() * 6;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 36;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: new THREE.Color('#e8c890'), size: 0.06, transparent: true, opacity: 0.55, depthWrite: false }));
  dust.frustumCulled = false;
  scene.add(dust);

  // --- light: warm low sun from the west, cool dusk fill from the east ---
  const hemi = new THREE.HemisphereLight(new THREE.Color('#5a6a94'), new THREE.Color('#8a6a44'), 1.1);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 2.4);
  sunLight.position.set(-26, 16, 10);
  sunLight.target.position.set(4, 0, -4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  sunLight.shadow.camera.far = 80;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight, sunLight.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d8fc9'), 0.7);
  fill.position.set(20, 12, -8);
  scene.add(fill);

  // --- waypoint graph, with BFS over the edges ---
  const adjacency = {};
  for (const id of Object.keys(WAYPOINTS)) adjacency[id] = [];
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  function nearestWaypoint(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const [id, [wx, wz]] of Object.entries(WAYPOINTS)) {
      const d = (wx - x) * (wx - x) + (wz - z) * (wz - z);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }
  function findPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = { [fromId]: null };
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adjacency[cur]) {
        if (prev[next] !== undefined) continue;
        prev[next] = cur;
        if (next === toId) {
          const path = [toId];
          let node = toId;
          while (prev[node] !== null) { node = prev[node]; path.unshift(node); }
          return path;
        }
        queue.push(next);
      }
    }
    return [fromId, toId];
  }

  return {
    colliders,
    shootables,
    group,
    markers,
    waypoints: WAYPOINTS,
    nearestWaypoint,
    findPath,
    waypointPos(id) {
      const [x, z] = WAYPOINTS[id];
      return new THREE.Vector3(x, 0, z);
    },
  };
}
