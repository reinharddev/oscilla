import { z } from "zod";

/**
 * A warehouse layout is data stored on the warehouse row. The 3D scene, the zone panel and
 * the fleet list are all drawn from it, so a new site is a new JSON document, not new code.
 * Monitored machines come from the `assets` table; an entity links to one by serial number.
 */
const num = z.number().finite();

export const MotionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rect"), x0: num, x1: num, z0: num, z1: num, y: num.optional(), r: num.optional(), cw: z.boolean().optional() }),
  z.object({ kind: z.literal("lissajous"), cx: num, cz: num, ax: num, az: num, y: num, n: z.number().int().min(8).optional(), phase: num.optional() }),
  // Drives in along the road, parks at a dock bay, then leaves.
  z.object({ kind: z.literal("truck"), bayZ: num }),
]);

export const EntitySchema = z.object({
  /** serial number of a monitored asset, or an id for a scene-only actor (worker, truck). */
  serial: z.string().optional(),
  id: z.string().optional(),
  label: z.string().optional(),
  model: z.enum(["forklift", "agv", "drone", "worker", "truck"]),
  style: z.record(z.string(), z.string()).optional(),
  motion: MotionSchema,
  duration: num.positive(),
  offset: num.optional(),
  /** Demo only: starting wear of a monitored machine (0 new, 1 failed). */
  demoWear: num.min(0).max(0.95).optional(),
}).refine((e) => e.serial || e.id, "entity needs a serial or an id");

export const LayoutSchema = z.object({
  floor: z.object({ x0: num, x1: num, z0: num, z1: num }),
  zones: z.array(z.object({ id: z.string(), name: z.string(), color: z.string(), x: num, z: num, w: num.positive(), d: num.positive() })),
  racks: z.array(z.object({ z: num, x0: num, bays: z.number().int().min(1).max(20), levels: z.number().int().min(1).max(5).optional() })),
  conveyors: z.array(z.object({ id: z.string(), label: z.string(), z: num, x0: num, x1: num, serial: z.string().optional() })),
  arms: z.array(z.object({ x: num, z: num, rot: num })),
  dock: z.object({ wallX: num, roadX: num, bays: z.array(num).min(1) }).optional(),
  entities: z.array(EntitySchema),
});

export type MotionSpec = z.infer<typeof MotionSchema>;
export type EntitySpec = z.infer<typeof EntitySchema>;
export type WarehouseLayout = z.infer<typeof LayoutSchema>;
