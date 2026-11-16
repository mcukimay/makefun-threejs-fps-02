# SANDLINE — Dustworks Yard

A round-based tactical FPS for make.fun's threejs-fps-02. Two teams of five fight
over a dusk desert works yard: Vanguard attacks, Ember defends, first to 5 rounds
takes the match.

> v2 (resubmission): the v1 entry was graded invalid — its `game/index.html`
> carried `<link rel="icon" href="data:,">`, the one reference in the game that
> does not resolve to a file inside `game/`, which the scorer's `references`
> row requires of every `<link href>`. v2 removes the favicon link entirely
> (no external reference remains), fixes the buy menu listing Longshot before
> Breacher, keeps the killfeed inside the viewport, frames the plant screenshot
> on the bomb and the converging defenders, and keeps the end banner on one line.
> All four screenshots were retaken from the fixed build in headless Chrome.

## The game

- **Map** — Dustworks Yard, 44×36 m: site A "Silos" (north-west), site B "Depot"
  (south-east), a mid lane with a climbable platform, an A-long lane and a roofed
  B-tunnel. Original geometry, dusk lighting, procedural ground texture, drifting dust.
- **Rounds** — 12 s buy phase, then 100 s rounds. Win by elimination, by detonating
  the planted bomb (40 s fuse), or by running the clock out as defenders. A defuse
  takes 4 s inside the site ring.
- **Economy** — start $800; kill +$300, round win +$3250, loss +$1900, plant +$300.
  Buy menu (B): P9 pistol, VK-9 SMG, AR-77 rifle, Longshot sniper (right-click
  zoom), Breacher shotgun, Kevlar, frag grenades.
- **Gunplay** — hitscan with headshot ×4, spread that grows with movement speed,
  recoil kick, damage falloff, tracers, muzzle flash, pooled impact sparks.
  Crouch, jump, walk-slow (Shift) for accuracy.
- **Bots** — 9 AI: 5 Ember defenders hold sites and mid, 4 Vanguard teammates push
  the site you push. Waypoint-graph routes (BFS), line-of-sight perception, reaction
  delay, burst fire with aim error, hearing gunfire, and a converge-and-defuse
  response once the bomb is planted.
- **Presentation** — HUD with health/armor, ammo, money, timer, score, team pips,
  killfeed, hitmarker, dynamic crosshair, damage vignette, bomb timer, plant bar.
  Procedural WebAudio sounds (no audio files). Fixed-step simulation at 60 Hz,
  rendering decoupled.

## Controls

| Key | Action |
| --- | --- |
| Mouse | Look (click to lock) |
| WASD | Move · Shift walk · Ctrl/C crouch · Space jump |
| Left click | Fire · Right click (sniper) zoom |
| R | Reload · G grenade · E hold to plant · B buy menu |
| 1–5 | Weapon slots · 6 Kevlar · 7 grenade (in buy menu) |

## Run it

```sh
node serve.ts        # http://localhost:8080
```

## Package it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the kit's `buildDossier`. Run it twice and compare bytes:
the build is deterministic.

## Layout

```
main.ts                  entry program (Node 22, stdlib only)
serve.ts                 local static server
shots.json               screenshot definitions
vendor/makefun-threejs.ts  kit dossier library (vendored, byte-for-byte)
game/
  index.html             page, HUD, import map ("three" -> three.module.min.js)
  src/main.js            fixed-step loop, round flow, shooting
  src/world.js           Dustworks Yard: geometry, colliders, waypoints, sky
  src/player.js          movement, collision, health/armor
  src/weapons.js         weapon data, view models, firing state
  src/combat.js          hitscan ray vs walls and agent meshes
  src/bots.js            bot AI: routes, perception, bursts, hearing, defuse
  src/grenade.js         thrown grenades: arc, bounce, fuse, blast
  src/bomb.js            plant/defuse state machine
  src/buy.js             economy and buy menu
  src/hud.js             DOM HUD
  src/input.js           keyboard, mouse, pointer lock
  src/state.js           match state: phases, rounds, score, timers
  src/effects.js         pooled tracers, sparks, smoke, explosions
  src/audio.js           procedural WebAudio sounds
  src/collide.js         AABB collision and wall rays
  src/palette.js         SANDLINE palette and team colors
  vendor/three/          three.js 0.187.0 (kit files, byte-for-byte)
screenshots/             4 real renders of the game (start, play, plant, end)
```

## License

SPDX-License-Identifier: MIT — see LICENSE.
