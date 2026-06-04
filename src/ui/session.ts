/**
 * session — the input/UI/driver controller (§14/§15).
 *
 * The stateful glue: on each command, route to the top modal (which captures
 * input — the §22.14 routing) or dispatch it through the **command registry** to
 * a handler that translates it into the player's `Action`, feeds the M7 driver
 * through a one-shot pending slot, advances the world, and re-renders. The
 * default table reproduces the built-in behavior; games extend it via
 * `SessionOptions.commands` (descend/save/load/…). The inventory modal dispatches
 * an `item-default` command through the same table instead of hardcoding a use —
 * one mechanism for keystrokes and menu selections alike.
 * DOM-free; `examples/web` drives it with a real `KeyboardInput`/`CanvasRenderer`.
 */
import { get } from '../core/entity';
import type { EntityId } from '../core/entity';
import type { Position, Inventory, Item, Equipment, Equipped, Consumable } from '../core/component';
import type { Action } from '../core/action';
import type { World } from '../core/world';
import { cellOf } from '../core/coords';
import { buildFrame } from '../render/frame';
import { viewportOrigin, type Camera, type Viewport } from '../render/camera';
import type { Renderer } from '../render/renderer';
import { step } from '../sim/driver';
import type { Command } from '../input/command';
import { commandToAction, isUIIntent } from '../input/command-to-action';
import { createUIStack, type UIStack, type Modal } from './stack';
import { composite } from './composite';
import { createHud, type Hud } from './hud';
import { createMessageLog, type MessageLog } from './log';
import { createLogView, type LogView } from './log-view';
import { createListModal } from './modals/list-modal';
import { createTargetingModal } from './modals/targeting-modal';
import type { CommandCtx, CommandTable } from './commands';

export interface SessionOptions {
  world: World;
  player: EntityId;
  renderer?: Renderer;
  viewport?: Viewport;
  camera?: Camera;
  hud?: Hud;
  ui?: UIStack;
  /** Message-log model; defaults to one subscribed to the bus via config templates. */
  log?: MessageLog;
  /** On-screen log view; defaults to one using the config height/color. */
  logView?: LogView;
  /** Extra command handlers, merged over (and overriding) the built-in defaults. */
  commands?: CommandTable;
}

export interface Session {
  onCommand(cmd: Command): void;
  /** Feed an action straight to the driver (advance one turn) and re-render. */
  submit(action: Action): void;
  /** Route a command through the command table (bypassing the modal check). */
  dispatch(cmd: Command): void;
  render(): void;
  pushModal(modal: Modal): void;
  readonly stack: UIStack;
}

export function createSession(opts: SessionOptions): Session {
  const { world, player } = opts;
  const viewport: Viewport = opts.viewport ?? { width: 80, height: 24 };
  const camera: Camera = opts.camera ?? { centerOn: player };
  const ui = world.services.config.ui;
  const stack = opts.ui ?? createUIStack();
  const hud = opts.hud ?? createHud(ui.hud.enabled, ui.hud.fg);
  const log = opts.log ?? createMessageLog(world.services.bus, world.services.config.log.templates);
  const logView = opts.logView ?? createLogView(ui.log.height, ui.log.fg);

  // One-shot slot the M7 driver's actionProvider reads.
  let pending: Action | undefined;
  const actionProvider = (): Action | undefined => {
    const a = pending;
    pending = undefined;
    return a;
  };
  const advance = (action: Action): void => {
    pending = action;
    step(world, { player, actionProvider });
  };

  function playerViewportCursor(): { x: number; y: number } {
    const e = world.state.entities.get(player);
    const pos = e && get<Position>(e, 'position');
    const level = pos && world.state.levels.get(pos.levelId);
    if (!pos || !level) return { x: viewport.width >> 1, y: viewport.height >> 1 };
    const o = viewportOrigin(world, level, viewport, camera);
    return { x: pos.x - o.x, y: pos.y - o.y };
  }

  function inventoryModal(): Modal {
    const e = world.state.entities.get(player);
    const inv = e && get<Inventory>(e, 'inventory');
    const items = (inv?.items ?? []).map((id) => {
      const it = world.state.entities.get(id);
      const item = it && get<Item>(it, 'item');
      return { label: item?.name ?? id, value: id };
    });
    return createListModal<EntityId>({
      title: 'Inventory',
      items,
      // Dispatch through the registry so a selection is just another command —
      // the default `item-default` handler equips gear / uses consumables.
      onSelect: (id) => dispatch({ type: 'item-default', item: id }),
      colors: ui.modal,
    });
  }

  function pickupHere(): void {
    const e = world.state.entities.get(player);
    const pos = e && get<Position>(e, 'position');
    const level = pos && world.state.levels.get(pos.levelId);
    if (!pos || !level) return;
    for (const id of world.services.queries.at(cellOf({ x: pos.x, y: pos.y }, level.width), pos.levelId)) {
      const item = world.state.entities.get(id);
      if (item && get<Item>(item, 'item')) {
        advance({ type: 'pickup', actor: player, item: id });
        return;
      }
    }
  }

  /** The default item interaction: toggle-equip gear, otherwise use a consumable. */
  function itemDefault(cmd: Command): void {
    const itemId = (cmd as { item?: string }).item;
    if (typeof itemId !== 'string') return;
    const item = world.state.entities.get(itemId);
    if (!item) return;
    const eq = get<Equipment>(item, 'equipment');
    if (eq) {
      const pl = world.state.entities.get(player);
      const equipped = pl && get<Equipped>(pl, 'equipped');
      if (equipped && equipped.slots[eq.slot] === itemId) advance({ type: 'unequip', actor: player, slot: eq.slot });
      else advance({ type: 'equip', actor: player, item: itemId });
      return;
    }
    if (get<Consumable>(item, 'consumable')) advance({ type: 'useItem', actor: player, item: itemId });
  }

  // --- the command table: built-in defaults, then game overrides ------------
  const moveLike = (cmd: Command): void => {
    const r = commandToAction(cmd, { player });
    if (r !== undefined && !isUIIntent(r)) advance(r);
  };
  const defaults: CommandTable = {
    wait: moveLike,
    'move-north': moveLike,
    'move-ne': moveLike,
    'move-east': moveLike,
    'move-se': moveLike,
    'move-south': moveLike,
    'move-sw': moveLike,
    'move-west': moveLike,
    'move-nw': moveLike,
    'open-inventory': () => stack.push(inventoryModal()),
    pickup: () => pickupHere(),
    'open-targeting': () =>
      stack.push(
        createTargetingModal({
          cursor: playerViewportCursor(),
          onConfirm: () => {},
          colors: ui.targeting,
          viewport,
        }),
      ),
    'item-default': (cmd) => itemDefault(cmd),
  };
  const table: CommandTable = { ...defaults, ...opts.commands };

  const ctx: CommandCtx = {
    world,
    player,
    submit: advance,
    pushModal: (m) => stack.push(m),
    dispatch: (cmd) => dispatch(cmd),
    render: () => session.render(),
  };

  /** Route a command through the table (no modal check — programmatic entry). */
  function dispatch(cmd: Command): void {
    const handler = table[cmd.type];
    if (handler) handler(cmd, ctx);
  }

  const session: Session = {
    stack,
    pushModal: (m) => stack.push(m),
    submit: advance,
    dispatch,
    onCommand(cmd) {
      const top = stack.top();
      if (top) {
        if (top.handle(cmd) === 'close') stack.pop();
        session.render();
        return;
      }
      dispatch(cmd);
      session.render();
    },
    render() {
      if (!opts.renderer) return;
      const top = stack.top();
      const topFrame = top?.render(viewport);
      if (topFrame && !Array.isArray(topFrame)) {
        opts.renderer.draw(topFrame); // full-screen modal replaces the world
        return;
      }
      const world0 = buildFrame(world, viewport, camera);
      const overlays = [
        ...logView.render(log, viewport),
        ...hud.render(world, player, viewport),
        ...(Array.isArray(topFrame) ? topFrame : []),
      ];
      opts.renderer.draw(composite(world0, overlays));
    },
  };

  return session;
}
