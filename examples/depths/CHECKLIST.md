# Depths — build checklist

A full demo game on rlkit: themed levels, save/load, varied enemies and equipment.
Survives between sessions. Engine work (Part A) is done and committed.

## Part A — engine (done)
- [x] A1 — command-dispatch registry in the session (`src/ui/commands.ts`, `session.commands`/`submit`/`dispatch`)
- [x] A2 — level transitions: `stairs` component, `transitionEffect`, `descend`/`ascend` handlers, `services.levelProvider`

## Part B — the game (`examples/depths`)
- [x] B0 — scaffold (package.json, vite.config, tsconfig, index.html)
- [ ] B1 — content catalog: `registerGameContent` (themed tiles, blueprints, consumable effects, statuses, venomous mixin, levelProvider)
- [ ] B2 — biomes + dungeon: `makeLevel` (themed tile remap, stairs), `populate` (weighted spawn tables), `levelProvider`, `newGame`
- [ ] B3 — UI: equipment screen command, HUD (depth/biome/HP), log templates
- [ ] B4 — save/load to localStorage (`save`/`load` commands, rebuild session)
- [ ] B5 — game flow: title screen, death screen, victory on the Forgemaster
- [ ] B6 — game tests: golden determinism run, save/load round-trip with content, descent invariant

## Verify
- [ ] `cd examples/depths && npm install && npm test` green
- [ ] `npm run typecheck` green
- [ ] `npm run dev` — play a full descent, equip gear, drink potions, save/reload, reach the boss
- [ ] root `npm test` still green (engine gate)
