import { Orientation } from 'honeycomb-grid'
import { OverlayCategoriesForPack, type OverlayCategory } from '~/utils/terrainGenerator'

// Union of every category any pack knows about — used when normalizing stored
// overlays so we don't silently drop categories that belong to a different
// pack (e.g. 'coast', which only exists in worldhex).
const ALL_OVERLAY_CATEGORIES: readonly OverlayCategory[] = Array.from(
  new Set([
    ...OverlayCategoriesForPack.hexes2,
    ...OverlayCategoriesForPack.worldhex,
  ])
)
import { TerrainTypes } from '~/utils/terrainGenerator'

export type HexOverlays = Partial<Record<OverlayCategory, number[]>>

export interface FreePoi {
  id: string
  index: number
  x: number
  y: number
}

interface BaseMap {
  id: string
  name: string
  createdAt: string
  sizeW: number
  sizeH: number
  hexOrientation: Orientation
  overlays?: Record<string, HexOverlays>
  freePois?: FreePoi[]
  variantOverrides?: Record<string, number>
}

export interface ManualMap extends BaseMap {
  kind: 'manual'
  defaultTerrain: TerrainTypes
  overrides: Record<string, TerrainTypes>
}

export type SavedMap = ManualMap

function normalizeOverlays(raw: any): Record<string, HexOverlays> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, HexOverlays> = {}
  for (const [hexKey, perHex] of Object.entries(raw)) {
    if (!perHex || typeof perHex !== 'object') continue
    const normalized: HexOverlays = {}
    for (const cat of ALL_OVERLAY_CATEGORIES) {
      const v = (perHex as any)[cat]
      if (v === undefined || v === null) continue
      if (typeof v === 'number') normalized[cat] = [v]
      else if (Array.isArray(v)) {
        const arr = v.filter((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0)
        if (arr.length) normalized[cat] = arr
      }
    }
    if (Object.keys(normalized).length) out[hexKey] = normalized
  }
  return Object.keys(out).length ? out : undefined
}

function normalizeFreePois(raw: any): FreePoi[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: FreePoi[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const { id, index, x, y } = entry as Partial<FreePoi>
    if (typeof id !== 'string' || !id) continue
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) continue
    if (typeof x !== 'number' || !Number.isFinite(x)) continue
    if (typeof y !== 'number' || !Number.isFinite(y)) continue
    out.push({ id, index, x, y })
  }
  return out.length ? out : undefined
}

export function normalizeSavedMap(raw: any): SavedMap | null {
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.name) return null
  if (raw.kind && raw.kind !== 'manual') return null
  const overlays = normalizeOverlays(raw.overlays)
  const freePois = normalizeFreePois(raw.freePois)
  const { colorOverrides: _drop, noiseConfig: _drop2, ...rest } = raw
  void _drop; void _drop2
  return { ...rest, kind: 'manual', overlays, freePois } as ManualMap
}
