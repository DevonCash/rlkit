/**
 * producers — the field producers barrel (§11.3.2).
 *
 * Goal (Dijkstra + flee), scent (wall-aware diffusion), and influence (falloff).
 * Field *descriptors* are content (faction-relative goal sets encode their
 * selector in the params), so they are registered by the game, not here.
 */
export { goalProducer, type GoalParams } from './goal';
export { scentProducer, type ScentParams } from './scent';
export { influenceProducer, type InfluenceParams } from './influence';
