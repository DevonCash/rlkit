/**
 * hud — heads-up display (§15).
 *
 * Subscribes to nothing of its own — it reads world state on render and emits a
 * status line as `Overlay[]` (hp from the `Resources` pool, max from the stat
 * pipeline). Layout/enablement is config. The session composites it over the
 * world frame.
 */
import { get } from '../core/entity';
import type { Resources } from '../core/component';
import type { ReadonlyWorld } from '../core/world';
import type { EntityId } from '../core/entity';
import type { Viewport } from '../render/camera';
import type { Overlay } from '../render/frame';
import { deriveStats } from '../sim/stats';
import { textOverlays } from './composite';

export interface Hud {
  render(world: ReadonlyWorld, player: EntityId, viewport: Viewport): Overlay[];
}

export function createHud(enabled = true): Hud {
  return {
    render(world, player, viewport): Overlay[] {
      if (!enabled) return [];
      const e = world.state.entities.get(player);
      if (!e) return [];
      const stats = deriveStats(e, world);
      const res = get<Resources>(e, 'resources');
      const hp = res?.pools.hp?.current ?? 0;
      const maxHp = stats['max-hp'] ?? 0;
      return textOverlays(`HP ${hp}/${maxHp}`, 0, viewport.height - 1, viewport, '#fff');
    },
  };
}
