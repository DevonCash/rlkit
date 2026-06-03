// adapters — swappable edges injected at the top (§17, §3). rotJS FOV +
// pathfinding wrappers, the pure-rand RNG, and storage (memory/localStorage/
// indexeddb, devalue-encoded). The ONLY place rotJS is allowed to be imported.
export { makeRng } from './rng';
export { makeRotFov, type RotFovOptions } from './rot-fov';
export { makeRotPath, type RotPathOptions } from './rot-path';
export {
  encodeState,
  decodeState,
  createMemoryStorage,
  createStorage,
  type StorageLike,
  type Storage,
} from './storage';
