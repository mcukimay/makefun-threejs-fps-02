// SANDLINE's entry program (Node 22, standard library only): the game is this
// directory's game/ folder — plain static files the browser loads as ES modules, with
// three.js 0.187.0 from the import map in game/index.html — and the screenshots are
// this directory's screenshots/ folder. The program copies both to /output (or
// MAKEFUN_OUTPUT_DIR outside the grader's container) and writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The dossier build refuses exactly where the scorer would: more than 4 screenshots
// or one over 256 KiB, more than 993 files in game/ or 48 MiB of game files, a dossier
// text over 163,840 bytes. A clean run here is a clean gate there.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

// Report what landed, so a failed gate shows up here instead of on the server.
const dossierBytes = statSync(join(out, 'dossier.json')).size;
const shotNames = existsSync(join(out, 'screenshots')) ? readdirSync(join(out, 'screenshots')) : [];
console.log(`SANDLINE packaged into ${out} (dossier.json ${dossierBytes} bytes, ${shotNames.length} screenshots)`);
