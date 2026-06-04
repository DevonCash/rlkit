/**
 * session — the input/UI/driver controller (§14/§15).
 *
 * The stateful glue: on each command, route to the top modal (which captures
 * input — the §22.14 routing) or translate it to a player action that feeds the
 * M7 driver through a one-shot pending slot, then advance the world and render.
 * DOM-free; `examples/web` drives it with a real `KeyboardInput`/`CanvasRenderer`.
 */
import { get } from '../core/entity';
import type { EntityId } from '../core/entity';
import type { Position, Inventory, Item } from '../core/component';
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
}

export interface Session {
  onCommand(cmd: Command): void;
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
      onSelect: (id) => advance({ type: 'useItem', actor: player, item: id }),
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

  function handleIntent(intent: string): void {
    if (intent === 'open-inventory') stack.push(inventoryModal());
    else if (intent === 'pickup') pickupHere();
    else if (intent === 'open-targeting') {
      stack.push(
        createTargetingModal({
          cursor: playerViewportCursor(),
          onConfirm: () => {},
          colors: ui.targeting,
          viewport,
        }),
      );
    }
    // 'confirm'/'cancel' with no modal open are no-ops.
  }

  const session: Session = {
    stack,
    pushModal: (m) => stack.push(m),
    onCommand(cmd) {
      const top = stack.top();
      if (top) {
        if (top.handle(cmd) === 'close') stack.pop();
        session.render();
        return;
      }
      const result = commandToAction(cmd, { player });
      if (result === undefined) return;
      if (isUIIntent(result)) handleIntent(result.ui);
      else advance(result);
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
