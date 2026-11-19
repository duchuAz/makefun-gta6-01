// PALMA VISTA entrypoint: assemble the browser game and the dossier the judge reads.
//
// The grader mounts the repository read-only at /bot (MAKEFUN_BOT_DIR) and a writable
// directory at /output; locally MAKEFUN_OUTPUT_DIR stands in for it, and with neither
// set the build lands in ./out beside this file. game/ is copied whole, screenshots/
// whole, and dossier.json is the canonical summary produced by the vendored library.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const sourceRoot = process.env.MAKEFUN_BOT_DIR ?? repoRoot;
const outputDir =
  process.env.MAKEFUN_OUTPUT_DIR ?? (process.env.MAKEFUN_BOT_DIR ? '/output' : join(repoRoot, 'out'));

// The game's static files and the renders live beside the repository's main.ts.
const gameSource = join(sourceRoot, 'game');
const shotsSource = join(sourceRoot, 'screenshots');

if (!existsSync(gameSource)) {
  throw new Error(`main.ts: no game/ directory at ${gameSource}`);
}
if (!existsSync(shotsSource)) {
  throw new Error(`main.ts: no screenshots/ directory at ${shotsSource}`);
}

mkdirSync(outputDir, { recursive: true });
cpSync(gameSource, join(outputDir, 'game'), { recursive: true });
cpSync(shotsSource, join(outputDir, 'screenshots'), { recursive: true });

// These are the scorer's caps (reference/gate.json). Only text_max_bytes trims the
// dossier's text; the remaining limits make the build refuse anything the scorer
// would refuse, so a bad entry fails here instead of at the gate.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, caps));
console.log(`main.ts: staged game/ and screenshots/ and wrote dossier.json in ${outputDir}`);
