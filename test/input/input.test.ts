import { describe, it, expect, vi } from 'vitest';
import { mapKey } from '../../src/input/keymap';
import { KeyboardInput, keyComboOf, type KeyLikeEvent, type EventTargetLike } from '../../src/input/input';
import { commandToAction, isUIIntent } from '../../src/input/command-to-action';
import { defaultConfig } from '../../src/config/defaults';

const keymap = defaultConfig.keymap;

describe('mapKey (§22.14)', () => {
  it('maps keys to commands per the keymap', () => {
    expect(mapKey(keymap, 'ArrowUp')).toEqual({ type: 'move-north' });
    expect(mapKey(keymap, 'k')).toEqual({ type: 'move-north' });
    expect(mapKey(keymap, '8')).toEqual({ type: 'move-north' });
    expect(mapKey(keymap, 'i')).toEqual({ type: 'open-inventory' });
    expect(mapKey(keymap, 'Escape')).toEqual({ type: 'cancel' });
    expect(mapKey(keymap, 'z')).toBeUndefined();
  });

  it('keyComboOf prefixes ctrl/alt but not shift', () => {
    expect(keyComboOf({ key: 'k' })).toBe('k');
    expect(keyComboOf({ key: 's', ctrlKey: true })).toBe('ctrl+s');
    expect(keyComboOf({ key: 'K', shiftKey: true })).toBe('K');
  });
});

describe('commandToAction (§22.14)', () => {
  it('movement → bump in the DIRS8 direction', () => {
    expect(commandToAction({ type: 'move-north' }, { player: 'p' })).toEqual({
      type: 'bump',
      actor: 'p',
      dir: { x: 0, y: -1 },
    });
    expect(commandToAction({ type: 'move-se' }, { player: 'p' })).toEqual({
      type: 'bump',
      actor: 'p',
      dir: { x: 1, y: 1 },
    });
  });

  it('wait → wait; UI commands → a UI intent', () => {
    expect(commandToAction({ type: 'wait' }, { player: 'p' })).toEqual({ type: 'wait', actor: 'p' });
    const intent = commandToAction({ type: 'open-inventory' }, { player: 'p' });
    expect(isUIIntent(intent)).toBe(true);
    expect(intent).toEqual({ ui: 'open-inventory' });
    expect(commandToAction({ type: 'nope' }, { player: 'p' })).toBeUndefined();
  });
});

describe('KeyboardInput (§22.14) — key → command via a fake target', () => {
  it('emits the mapped command on keydown and preventDefaults bound keys', () => {
    let handler: ((ev: KeyLikeEvent) => void) | undefined;
    const target: EventTargetLike = {
      addEventListener: (type, fn) => {
        if (type === 'keydown') handler = fn;
      },
    };
    const input = new KeyboardInput(target, keymap);
    const spy = vi.fn();
    input.onCommand(spy);

    const prevent = vi.fn();
    handler!({ key: 'ArrowUp', preventDefault: prevent });
    expect(spy).toHaveBeenCalledWith({ type: 'move-north' });
    expect(prevent).toHaveBeenCalledOnce();

    handler!({ key: 'z' }); // unbound → no command, no throw
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
