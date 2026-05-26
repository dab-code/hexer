import { Orientation } from 'honeycomb-grid'
import { z } from 'zod'
import { TerrainTypes } from '~/utils/terrainGenerator'

// Terrain IDs are TerrainTypes enum values, but we accept any non-negative
// integer to keep legacy/stale maps loadable. The renderer falls back to a
// default tile when an ID has no current variant entry.
const terrainIdSchema = z
  .number()
  .int()
  .nonnegative()
  .transform((n) => n as TerrainTypes)

// Overlay indices may be persisted as a single number (legacy) or array.
const overlayIndicesSchema = z.preprocess(
  (v) => (typeof v === 'number' ? [v] : v),
  z.array(z.number().int().nonnegative()).min(1),
)

// Per-hex overlay map. Each category is independently optional so absent
// categories don't show up as undefined values in serialised output.
// 'coast' only applies to the worldhex pack; absent on hexes2 maps.
const hexOverlaysSchema = z.object({
  river: overlayIndicesSchema.optional(),
  path: overlayIndicesSchema.optional(),
  coast: overlayIndicesSchema.optional(),
  poi: overlayIndicesSchema.optional(),
})

const freePoiSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  x: z.number().finite(),
  y: z.number().finite(),
})

// Free-form pen-tool paths: an ordered list of anchor points in SVG user-space.
// Rendered as a smoothed dashed line; not associated with hex coordinates.
const trailPathSchema = z.object({
  id: z.string().min(1),
  points: z
    .array(z.object({ x: z.number().finite(), y: z.number().finite() }))
    .min(2),
})

const manualMapSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.string(),
    sizeW: z.number().int().positive().max(200),
    sizeH: z.number().int().positive().max(200),
    hexOrientation: z.enum([Orientation.FLAT, Orientation.POINTY]),
    kind: z.literal('manual').default('manual'),
    defaultTerrain: terrainIdSchema,
    overrides: z.record(z.string(), terrainIdSchema),
    overlays: z.record(z.string(), hexOverlaysSchema).optional(),
    freePois: z.array(freePoiSchema).optional(),
    // Canonical edge keys ("x1,y1|x2,y2" rounded). Identifies edges between
    // adjacent hexes that have been painted (e.g. for between-hex rivers).
    edges: z.array(z.string().min(1)).optional(),
    paths: z.array(trailPathSchema).optional(),
    variantOverrides: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
  })

export type HexOverlays = z.infer<typeof hexOverlaysSchema>
export type FreePoi = z.infer<typeof freePoiSchema>
export type TrailPath = z.infer<typeof trailPathSchema>
export type ManualMap = z.infer<typeof manualMapSchema>
export type SavedMap = ManualMap

// One entry point for "is this a valid SavedMap?", used by both storage read
// and JSON import. Unknown fields are silently stripped by the schema.
export function parseSavedMap(raw: unknown): SavedMap | null {
  if (!raw || typeof raw !== 'object') return null
  const result = manualMapSchema.safeParse({ kind: 'manual', ...raw })
  return result.success ? result.data : null
}

export { manualMapSchema }
