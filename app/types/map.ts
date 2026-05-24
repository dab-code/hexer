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

const manualMapSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.string(),
    sizeW: z.number().int().positive(),
    sizeH: z.number().int().positive(),
    hexOrientation: z.enum([Orientation.FLAT, Orientation.POINTY]),
    kind: z.literal('manual').default('manual'),
    defaultTerrain: terrainIdSchema,
    overrides: z.record(z.string(), terrainIdSchema),
    overlays: z.record(z.string(), hexOverlaysSchema).optional(),
    freePois: z.array(freePoiSchema).optional(),
    variantOverrides: z
      .record(z.string(), z.number().int().nonnegative())
      .optional(),
  })
  .strict()

export type HexOverlays = z.infer<typeof hexOverlaysSchema>
export type FreePoi = z.infer<typeof freePoiSchema>
export type ManualMap = z.infer<typeof manualMapSchema>
export type SavedMap = ManualMap

// One entry point for "is this a valid SavedMap?", used by both storage read
// and JSON import. Strips known-legacy fields and defaults kind before parse.
export function parseSavedMap(raw: unknown): SavedMap | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const {
    colorOverrides: _legacyColors,
    noiseConfig: _legacyNoise,
    ...rest
  } = obj
  void _legacyColors
  void _legacyNoise
  const result = manualMapSchema.safeParse({ kind: 'manual', ...rest })
  return result.success ? result.data : null
}

export { manualMapSchema }
