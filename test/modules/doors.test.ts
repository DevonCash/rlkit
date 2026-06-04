import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/index';
import { doorsModule } from '../../src/modules/doors';
import { perform } from '../../src/sim/action';
import { createEntity, get } from '../../src/core/entity';
import type { Position } from '../../src/core/component';
import { createLevel, levelCell, setTile, tileAt, isWalkable, isTransparent } from '../../src/core/level';
import { defaultConfig } from '../../src/config/defaults';

function setup() {
  const w = createWorld({ config: defaultConfig, rng: 1, modules: [doorsModule()] });
  const lvl = createLevel('L', 5, 5, w.services.tiles.index('floor'));
  setTile(lvl, levelCell(lvl, 2, 1), w.services.tiles.index('door_closed')); // door north of (2,2)
  w.state.levels.set('L', lvl);
  const hero = createEntity('hero', [{ type: 'position', x: 2, y: 2, levelId: 'L' }]);
  w.state.entities.set('hero', hero);
  w.services.queries.index(hero);
  w.services.queries.place('hero', 'L', levelCell(lvl, 2, 2));
  return { w, lvl, hero };
}
const at = (h: ReturnType<typeof createEntity>) => get<Position>(h, 'position')!;

describe('doorsModule', () => {
  it('a closed door blocks movement and sight; an open door passes both', () => {
    const { w, lvl } = setup();
    const door = levelCell(lvl, 2, 1);
    expect(isWalkable(lvl, door, w.services.tiles)).toBe(false);
    expect(isTransparent(lvl, door, w.services.tiles)).toBe(false);
    setTile(lvl, door, w.services.tiles.index('door_open'));
    expect(isWalkable(lvl, door, w.services.tiles)).toBe(true);
    expect(isTransparent(lvl, door, w.services.tiles)).toBe(true);
  });

  it('bumping a closed door opens it (no move); then you can step through', () => {
    const { w, lvl, hero } = setup();
    const door = levelCell(lvl, 2, 1);

    const out = perform(w, { type: 'move', actor: 'hero', dir: { x: 0, y: -1 } });
    expect(out.status).toBe('done');
    expect(tileAt(lvl, door, w.services.tiles).id).toBe('door_open'); // opened
    expect({ x: at(hero).x, y: at(hero).y }).toEqual({ x: 2, y: 2 }); // stayed put (opening cost the turn)

    perform(w, { type: 'move', actor: 'hero', dir: { x: 0, y: -1 } });
    expect({ x: at(hero).x, y: at(hero).y }).toEqual({ x: 2, y: 1 }); // now walks through
  });
});
