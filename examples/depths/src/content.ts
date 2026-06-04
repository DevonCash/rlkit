/**
 * content — the game's catalog, registered by name so it survives save/load.
 *
 * `registerGameContent(world)` is the single registration pass run for BOTH a
 * fresh game and a reloaded one (mirroring the engine's own `registerCoreContent`).
 * Anything referenced by name in saved state — themed tiles, consumable effects,
 * statuses, the venomous mixin — must be re-registered here in the same order,
 * and the level provider re-attached, or a loaded world can't resolve them.
 *
 * Every register is `has`-guarded so the pass is idempotent.
 */
import {
  get,
  changeResourceEffect,
  applyStatusEffect,
  makeMoveEffect,
  cellsIn,
  cellOf,
  pointOf,
  walkableCells,
  type World,
  type Entity,
  type Effect,
  type ActionContext,
  type Blueprint,
  type Position,
  type Statuses,
  type Mixin,
  type Reactor,
  type EventReactionCtx,
} from 'rlkit';
import { levelProvider } from './dungeon';

// --- themed tiles (registered in a fixed order; indices must match on reload) --
interface TileDef {
  id: string;
  walkable: boolean;
  transparent: boolean;
  glyph: string;
  fg: string;
  tags?: string[];
}
const THEMED_TILES: TileDef[] = [
  { id: 'stairs_up', walkable: true, transparent: true, glyph: '<', fg: '#ff4', tags: ['stairs'] },
  { id: 'cave_floor', walkable: true, transparent: true, glyph: '.', fg: '#5a4' },
  { id: 'cave_wall', walkable: false, transparent: false, glyph: '#', fg: '#473' },
  { id: 'crypt_floor', walkable: true, transparent: true, glyph: '.', fg: '#778' },
  { id: 'crypt_wall', walkable: false, transparent: false, glyph: '#', fg: '#334' },
  { id: 'sewer_floor', walkable: true, transparent: true, glyph: '.', fg: '#385' },
  { id: 'sewer_wall', walkable: false, transparent: false, glyph: '#', fg: '#223' },
  { id: 'foundry_floor', walkable: true, transparent: true, glyph: '.', fg: '#a65' },
  { id: 'foundry_wall', walkable: false, transparent: false, glyph: '#', fg: '#522' },
];

// --- blueprint builders ----------------------------------------------------
type Comp = { type: string; [k: string]: unknown };

/** "plague_zombie" → "Plague Zombie" — a display name derived from the id. */
function titleCase(id: string): string {
  return id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function monster(
  id: string,
  glyph: string,
  fg: string,
  hp: number,
  attack: number,
  extra: { defense?: number; speed?: number; sight?: number; mixins?: string[]; desc?: string } = {},
): Blueprint {
  const base: Record<string, number> = { 'max-hp': hp, attack };
  if (extra.defense) base.defense = extra.defense;
  if (extra.speed) base.speed = extra.speed;
  if (extra.sight) base['sight-radius'] = extra.sight;
  const info: Comp = { type: 'info', name: titleCase(id) };
  if (extra.desc) info.description = extra.desc;
  return {
    id,
    components: [
      { type: 'renderable', glyph, fg, layer: 5 },
      info,
      { type: 'allegiance', faction: 'monster' },
      { type: 'stats', base },
      { type: 'resources', pools: { hp: { current: hp } } },
    ],
    mixins: ['aiHunter', 'aiWanderer', ...(extra.mixins ?? [])],
  };
}

function weapon(id: string, name: string, fg: string, attack: number): Blueprint {
  return {
    id,
    components: [
      { type: 'renderable', glyph: ')', fg, layer: 3 },
      { type: 'item', name, stackable: false, qty: 1 },
      { type: 'equipment', slot: 'weapon', bonuses: { attack } },
    ],
  };
}
function armor(id: string, name: string, fg: string, defense: number): Blueprint {
  return {
    id,
    components: [
      { type: 'renderable', glyph: '[', fg, layer: 3 },
      { type: 'item', name, stackable: false, qty: 1 },
      { type: 'equipment', slot: 'armor', bonuses: { defense } },
    ],
  };
}
function ringItem(id: string, name: string, fg: string, bonuses: Record<string, number>): Blueprint {
  return {
    id,
    components: [
      { type: 'renderable', glyph: '=', fg, layer: 3 },
      { type: 'item', name, stackable: false, qty: 1 },
      { type: 'equipment', slot: 'ring', bonuses },
    ],
  };
}
function consumable(id: string, name: string, glyph: string, fg: string, effect: string): Blueprint {
  return {
    id,
    components: [
      { type: 'renderable', glyph, fg, layer: 3 },
      { type: 'item', name, stackable: false, qty: 1 },
      { type: 'consumable', uses: 1, effect },
    ],
  };
}

const PLAYER: Blueprint = {
  id: 'player',
  components: [
    { type: 'renderable', glyph: '@', fg: '#fff', layer: 10 },
    { type: 'info', name: 'Player', description: 'A delver seeking the Forgemaster in the depths.' },
    { type: 'allegiance', faction: 'player' },
    { type: 'stats', base: { 'max-hp': 30, attack: 4, defense: 1, speed: 10, 'sight-radius': 8 } },
    { type: 'resources', pools: { hp: { current: 30 } } },
    { type: 'inventory', items: [] },
    { type: 'equipped', slots: {} },
  ],
  mixins: ['equippable'],
};

const BLUEPRINTS: Blueprint[] = [
  PLAYER,
  // caves
  monster('rat', 'r', '#a86', 4, 2, { desc: 'A mangy cave rat, bold in numbers.' }),
  monster('bat', 'w', '#86a', 5, 2, { speed: 16, desc: 'A leather-winged bat that darts and weaves.' }),
  monster('spider', 's', '#6a6', 6, 3, { mixins: ['venomous'], desc: 'A cave spider; its bite leaves venom.' }),
  monster('goblin', 'g', '#6c6', 8, 3, { desc: 'A scrappy goblin scavenger.' }),
  // crypt
  monster('skeleton', 'k', '#ddd', 10, 4, { defense: 1, desc: 'Animated bones that clatter as they advance.' }),
  monster('zombie', 'Z', '#7a7', 16, 4, { speed: 6, desc: 'A shambling corpse — slow, but hard to put down.' }),
  monster('ghoul', 'G', '#9b6', 12, 5, { desc: 'A ravenous ghoul that feeds on the dead.' }),
  monster('wraith', 'W', '#aac', 10, 6, { desc: 'A cold, half-seen wraith that drains the living.' }),
  // sewers
  monster('slime', 'j', '#6cc', 14, 3, { desc: 'A quivering slime that oozes through the muck.' }),
  monster('plague_zombie', 'P', '#9c6', 18, 5, { speed: 6, mixins: ['venomous'], desc: 'A pestilent corpse wreathed in toxic fumes.' }),
  monster('croc', 'C', '#496', 20, 6, { defense: 2, desc: 'A sewer crocodile with armored hide.' }),
  // foundry
  monster('fire_beetle', 'a', '#f73', 12, 6, { desc: 'A beetle that glows with forge-heat.' }),
  monster('hellhound', 'd', '#f55', 16, 7, { speed: 16, desc: 'A fast hound wreathed in embers.' }),
  monster('iron_golem', 'I', '#99a', 30, 7, { defense: 4, speed: 6, desc: 'A hulking construct of riveted iron.' }),
  {
    ...monster('forgemaster', 'M', '#f33', 60, 10, {
      defense: 3,
      sight: 12,
      desc: 'The Forgemaster — master of the foundry and your final foe.',
    }),
    tags: ['boss'],
  },
  // weapons / armor / rings
  weapon('dagger', 'Dagger', '#ccc', 2),
  weapon('short_sword', 'Short Sword', '#cdd', 4),
  weapon('mace', 'Mace', '#dba', 6),
  weapon('warhammer', 'Warhammer', '#fc8', 9),
  armor('leather', 'Leather Armor', '#b85', 1),
  armor('chain', 'Chainmail', '#bbc', 3),
  armor('plate', 'Plate Armor', '#ccd', 5),
  ringItem('ring_vigor', 'Ring of Vigor', '#fd6', { 'max-hp': 8 }),
  // consumables
  consumable('potion_heal', 'Healing Potion', '!', '#e55', 'heal-25'),
  consumable('potion_greater', 'Greater Healing', '!', '#f7a', 'heal-50'),
  consumable('antidote', 'Antidote', '!', '#7d7', 'antidote'),
  consumable('scroll_haste', 'Scroll of Haste', '?', '#7cf', 'haste-self'),
  consumable('scroll_fire', 'Scroll of Fireball', '?', '#f83', 'fireball'),
  consumable('scroll_blink', 'Scroll of Blink', '?', '#c9f', 'blink'),
];

// --- a small effect that strips a status (for the antidote) -----------------
function cleanseEffect(actorId: string, statusId: string): Effect {
  return {
    kind: `cleanse:${statusId}`,
    validate: (w) => w.state.entities.has(actorId),
    apply(world) {
      const e = world.state.entities.get(actorId)!;
      const s = get<Statuses>(e, 'statuses');
      if (s) s.active = s.active.filter((a) => a.effectId !== statusId);
      return [{ type: 'status:cleansed', entity: actorId, effectId: statusId }];
    },
  };
}

/** Damage every other creature within a blast of the user (the fireball nova). */
function fireballEffect(ctx: ActionContext): void {
  const actorId = ctx.action.actor;
  const actor = ctx.world.state.entities.get(actorId);
  const pos = actor && get<Position>(actor, 'position');
  if (!pos) return;
  const level = ctx.world.state.levels.get(pos.levelId)!;
  const cells = cellsIn({ x: pos.x, y: pos.y }, { kind: 'blast', radius: 2 }, { width: level.width, height: level.height });
  const hit = new Set<string>();
  for (const p of cells) {
    for (const id of ctx.world.services.queries.at(cellOf(p, level.width), pos.levelId)) {
      if (id === actorId || hit.has(id)) continue;
      const e = ctx.world.state.entities.get(id);
      if (e && get(e, 'resources')) {
        hit.add(id);
        ctx.push(changeResourceEffect(id, 'hp', -12, 'fire'));
      }
    }
  }
}

/** Teleport the user to a random walkable cell on the current level. */
function blinkEffect(ctx: ActionContext): void {
  const actorId = ctx.action.actor;
  const actor = ctx.world.state.entities.get(actorId);
  const pos = actor && get<Position>(actor, 'position');
  if (!pos) return;
  const level = ctx.world.state.levels.get(pos.levelId)!;
  const palette = ctx.world.services.tiles;
  const tiles = level.layers.get('tiles') as Uint16Array;
  const cells = [...walkableCells(tiles, (i) => palette.byIndex(i).walkable)];
  if (cells.length === 0) return;
  const dest = cells[ctx.world.services.rng.int(0, cells.length - 1)]!;
  const { x, y } = pointOf(dest, level.width);
  ctx.push(makeMoveEffect(actorId, x, y));
}

/** Register the whole catalog onto a world. Idempotent; run on new + on load. */
export function registerGameContent(world: World): void {
  const reg = world.services.registries;
  const tiles = world.services.tiles;
  const blueprints = reg.blueprints!;
  const ce = reg.consumableEffects!;
  const st = reg.statuses!;
  const mixins = reg.mixins!;

  for (const t of THEMED_TILES) if (!tiles.has(t.id)) tiles.register(t);

  for (const bp of BLUEPRINTS) if (!blueprints.has(bp.id)) blueprints.register(bp.id, bp);

  const addCE = (id: string, fn: (ctx: ActionContext, item: Entity, target?: number) => void): void => {
    if (!ce.has(id)) ce.register(id, fn);
  };
  addCE('heal-25', (ctx) => ctx.push(changeResourceEffect(ctx.action.actor, 'hp', 25, 'restore')));
  addCE('heal-50', (ctx) => ctx.push(changeResourceEffect(ctx.action.actor, 'hp', 50, 'restore')));
  addCE('antidote', (ctx) => ctx.push(cleanseEffect(ctx.action.actor, 'poison')));
  addCE('haste-self', (ctx) => ctx.push(applyStatusEffect(ctx.action.actor, 'haste', 12)));
  addCE('fireball', (ctx) => fireballEffect(ctx));
  addCE('blink', (ctx) => blinkEffect(ctx));

  if (!st.has('slow')) st.register('slow', { id: 'slow', modifiers: [{ stat: 'speed', phase: 'add', amount: -5 }] });
  if (!st.has('strength')) st.register('strength', { id: 'strength', modifiers: [{ stat: 'attack', phase: 'add', amount: 3 }] });

  // The venomous mixin: when this creature lands an attack, poison the target.
  if (!mixins.has('venomous')) {
    const venomous: Mixin = {
      name: 'venomous',
      requires: ['allegiance'],
      onAction(ctx, self) {
        if (ctx.action.type !== 'attack' || ctx.action.actor !== self.id) return;
        const target = (ctx.action as { target?: string }).target;
        if (typeof target === 'string') ctx.push(applyStatusEffect(target, 'poison', 4));
      },
    };
    mixins.register('venomous', venomous);
  }

  // Despawn the dead. The engine's diedReactor only unschedules the corpse; the
  // game clears it from the world so it stops rendering and blocking its cell.
  const despawn: Reactor = {
    on: 'died',
    scope: 'global',
    phase: 'post',
    react(ctx) {
      const id = ((ctx as EventReactionCtx).event as { entity?: string }).entity;
      const e = id !== undefined ? world.state.entities.get(id) : undefined;
      if (!e || id === undefined) return;
      // Keep the player's corpse: the game's render/camera still reference the
      // player entity, and the controller shows the death screen instead.
      const alleg = e.components.get('allegiance') as { faction?: string } | undefined;
      if (alleg?.faction === 'player') return;
      world.services.queries.unindex(e);
      world.state.entities.delete(id);
    },
  };
  world.services.reactors.register(despawn);

  // Re-attach the (non-serialized) level provider so descent works after load.
  world.services.levelProvider = levelProvider;
}
