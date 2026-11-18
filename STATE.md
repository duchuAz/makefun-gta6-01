# PALMA VISTA — build state

Original make.fun gta6-01 entry. A third-person open-world crime game in the browser, built
from scratch in this repo. No starter game code is used; three.js is the only vendored library.

- Competition: `gta6-01` — Make GTA 6
- Game title: **PALMA VISTA**
- Repo: `duchuAz/makefun-gta6-01`
- Entrypoint: `main.ts` copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
- Everything ships under `game/`; `serve.ts` and `game/vendor/makefun-game.ts` are unchanged.

## Run it

```bash
cd ~/makefun-hunter/work/gta6-game/entry
~/.local/node22/bin/node serve.ts --port 8080
# open http://127.0.0.1:8080/
```

Build/stage check (uses `out/` as a stand-in for `/output`):

```bash
MAKEFUN_OUTPUT_DIR=out ~/.local/node22/bin/node --experimental-strip-types main.ts
```

Controls: **WASD** move/drive, **mouse** look, **Shift** sprint, **Space** jump/handbrake,
**E** interact/enter-exit vehicle, **LMB** fire, **RMB** aim, **1/2/3** pistol/SMG/fists,
**R** reload, **F** horn, **[ ]** radio station, **M** map, **Esc** pause, **F5/F9** save/load.

## What works

- **City** — Palma Vista: 48-block pastel grid, boulevards, sidewalks, crosswalks, instanced
  buildings/windows/shopfronts, palms, lamps, beach props, marina, lighthouse, pier, Ferris
  wheel, hotels, neon arch, seawall, animated water, hills, gradient sky, sun, clouds.
- **Player** — Rico Valdez model (teal jacket, gold trim, bag, shades, pistol/SMG), third-person
  orbit camera with wall pull-in, sprint, jump, aim, reload, health/armor, cash, hospital/police
  respawns, wasted/busted screens.
- **Vehicles** — seven car kinds with arcade acceleration, braking, steering, drift/grip,
  collision damage, smoke and explosion; enter/exit; parked, traffic and mission cars.
- **Traffic and pedestrians** — lane-following traffic that turns at intersections, sidewalk and
  beach pedestrians, panic/flinch reactions, carjacking, damage/knockdown, population upkeep.
- **Wanted and police** — 0–5 stars, heat, PVPD cruisers that spawn, pursue, shoot and deploy
  officers; on-foot cops, gang actors, busted hold, 20-second evade per star, siren audio.
- **Combat** — hitscan pistol/SMG, melee fists, tracers, muzzle flashes, sparks, stylized
  explosions, damage against cars, police, gang, pedestrians and mission crates. No gore.
- **Five-mission story** — FIRST DELIVERY, MINT CONDITION, BADGE PROBLEMS, THE DROP,
  VISTA FINALE. Dialogue, objectives, goto/steal/deliver/destroy/kill/evade steps, crates, gang
  ambushes, rewards ($250/$400/$600/$900/$2,000), mission-complete and finale cards.
- **HUD and map** — health/armor, cash, wanted stars, clock/weather, district, mission panel,
  subtitles, toasts, interaction prompt, radio, weapon/ammo, speedometer, circular minimap,
  full-screen city map with districts/objective/police dots, title/pause/settings/controls.
- **Persistence** — localStorage save/load (F5/F9 and pause menu), autosave after deaths and
  mission completion, saved player position/health/armor/cash/weapons/mission/stats/settings.
- **Audio** — fully procedural WebAudio: engine, skids, siren, gunshots, punch, explosions,
  impacts, UI, cash, wanted/busted stingers, mission-complete stinger, four-step-sequenced radio
  stations (Vista FM, Neon 88, Costa Wave, Radio Sol). No audio files or network.
- **Screenshots** — four real 1280×720 JPEG renders in `screenshots/`, captured from `?shot=`
  scenes that stage the live city/cars/peds/police through the same renderer:
  `1-cover.jpg`, `2-chase.jpg`, `3-mission.jpg`, `4-drive.jpg`. All under 256 KiB.

### Verification performed

- Preflight confirmed the sealed recording, scaffold commit and toolchain before building.
- `?shot=cover|chase|mission|drive` each report `errors: []`, ready flag, and render correctly.
- `?smoke=1` **PASS**: title → play → enter car → drive (car speed 13.28) → fire/ammo drop →
  wanted/cruiser spawn → mission accepted with cafe marker. `errors: []`.
- Full mission chain driven end-to-end through all 5 missions: final cash **$4,900**, all mission
  cards, no page errors.
- Save/load: F5 writes save, reload enables Continue, loading restores cash/state.
- Pause and full map open/close; title → New Game reaches gameplay with zero console errors.
- Build/stage with `MAKEFUN_OUTPUT_DIR=out` succeeds with all four screenshots and dossier.

## Stubs / deliberate limits

- Combat is on foot only; there is no drive-by shooting. Cars are weapons by collision.
- No swimming, boats/aircraft as player vehicles, or interiors; water and map edges are bounded.
- No crouch/cover, weapon pickups, shops, or economy beyond mission rewards and respawn costs.
- Missions are a linear chain; no replay/selector or side jobs. Finishing mission 5 ends the story.
- NPCs and police use arcade steering/avoidance, not a full navmesh; collisions can be approximate.
- Radio/dialogue are synthesized/text only; no voice acting or licensed music.
- Save data is localStorage only (per browser profile).
- Draw calls are roughly 588 with ~83k triangles; fine on a desktop GPU, but the city is not
  aggressively merged/instanced beyond the current batching.

## Exact next steps (if continuing)

1. Test the busted and wasted respawn paths end-to-end in a real browser (code inspected and
   wired; the screens and respawn functions are present).
2. Add drive-by shooting and a dedicated cover/crouch state for combat depth.
3. Merge static city meshes / instance repeated props to cut draw calls below ~250.
4. Add a mission select/replay and a post-finale free-roam state.
5. Capture a replacement cover once the player/car staging gets a closer hero angle.

## Repo hygiene

- `game/vendor/three.module.min.js` is the pinned r160 build; `serve.ts` and
  `vendor/makefun-game.ts` were not modified.
- Do not run `makefun record`, `makefun init`, or `makefun submit`; the operator owns submission.
- `out/`, `dist/`, `node_modules/`, logs and `screenshots/raw/` are ignored.

