# Depths — build checklist

A full demo game on rlkit: themed levels, save/load, varied enemies and equipment.
Survives between sessions. Engine work (Part A) is done and committed.

## Part A — engine (done)
- [x] A1 — command-dispatch registry in the session (`src/ui/commands.ts`, `session.commands`/`submit`/`dispatch`)
- [x] A2 — level transitions: `stairs` component, `transitionEffect`, `descend`/`ascend` handlers, `services.levelProvider`

## Part B — the game (`examples/depths`)
- [x] B0 — scaffold (package.json, vite.config, tsconfig, index.html)
- [x] B1 — content catalog: `registerGameContent` (themed tiles, blueprints, consumable effects, statuses, venomous mixin, despawn reactor, levelProvider)
- [x] B2 — biomes + dungeon: `makeLevel` (themed tile remap, stairs), `populate` (weighted spawn tables), `levelProvider`, `newGame`
- [x] B3 — UI: equipment screen command, custom HUD (depth/biome/HP)
- [x] B4 — save/load to localStorage (`save`/`load` commands, rebuild session)
- [x] B5 — game flow: title screen, death screen, victory on the Forgemaster
- [x] B6 — game tests: determinism run, save/load round-trip with content, descent invariant

## Verify
- [x] `cd examples/depths && npm install && npm test` green (4 tests)
- [x] `npm run typecheck` green
- [x] `npm run dev` — verified via preview: title → new game → themed FOV dungeon, movement, combat bumps, message log, HUD, save/load (no console errors)
- [x] root `npm test` still green (engine gate — 270 tests)
- [ ] follow-up (optional): nicer log names (entity ids show raw), targeted-scroll UI, deeper play-through to the boss
