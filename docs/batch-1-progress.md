# Batch 1 progress (R0–R7) — COMPLETE

Implemented per the approved plan. Full suite green;
`npm run build`/`typecheck`/`lint` all pass.

| Item | Code | Tests | Docs |
|---|---|---|---|
| R0 — structural refactors + shared primitives | ☑ | ☑ | ☑ |
| R1 — tile-flag system + bulk stepper | ☑ | ☑ | ☑ |
| R2 — setTile effect + tile:changed | ☑ | ☑ | ☑ |
| R3 — cell-network connectivity | ☑ | ☑ | ☑ |
| R4 — per-tick events + canViewerSee | ☑ | ☑ | ☑ |
| R5 — useOn + ActionMap/EventMap seam | ☑ | ☑ | ☑ |
| R7 — bump-interaction dispatch | ☑ | ☑ | ☑ |
| R6 — per-player view payload | ☑ | ☑ | ☑ |
| docs + public surface + final verify | ☑ | — | ☑ |

## What shipped

- **R0** `sim/ai/field.ts` → `sim/field.ts`; `ensure*Layer` + `core/graph.ts`
  (`reachable`/`labelComponents`); transient-layer save skip.
- **R1** `core/flags.ts` FlagRegistry (+ `Services.flags`); `TileType.flags` +
  palette `flagBits`; `tileFlags` component; `sim/flags.ts` FlagIndex (maintained
  `flags` layer, `flags:changed`, `invalidateCell`); `sim/stepper.ts`
  `registerStepper`. Atmosphere acceptance test green (sealed/door/breach/determinism).
- **R2** `tile:changed`/`flags:changed` events; `core/tile-effect.ts`
  `setTileEffect`; doors delegate to it.
- **R3** `sim/network.ts` `createNetworkManager` (flag-backed + `{layer}` hatch,
  min-cell reps, lazy relabel).
- **R4** `EventBus.onAny`; `canViewerSee`; `ServerUpdate.events` + `GameServer.canViewerSee`.
- **R5** real `ActionMap`/`EventMap` merge interfaces; `useOn` round-trip test;
  netcoop decoder map (move + useOn).
- **R7** `core/bump.ts` registry + `Services.bumpInteractions`; `sim/bump.ts`
  default attack rule; move handler delegates; golden run byte-identical.
- **R6** generic `PlayerView<E>`/`GameServer<E>` + `viewExtra`.

## Tracked follow-up (out of scope)

Extract the AI batteries (goal/scent/influence producers, `DesireAI`, autoexplore)
into an opt-in `ai` module that registers producers + a field-driving stepper;
`FieldStore.tick` is then mechanic-driven, not core. Until then, per-turn AI fields
are not auto-stepped (no behavior change this batch).
