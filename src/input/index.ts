// input — key/pointer → command → action (§14).
export type { Command, InputSource, Keymap } from './command';
export { mapKey } from './keymap';
export { KeyboardInput, keyComboOf } from './input';
export type { KeyLikeEvent, EventTargetLike } from './input';
export { PointerInput } from './pointer';
export type { PointerLikeEvent, PointerTargetLike, PointerInputOptions } from './pointer';
export { commandToAction, isUIIntent } from './command-to-action';
export type { UIIntent, CommandContext } from './command-to-action';
