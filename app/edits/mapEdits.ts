import type { FreePoi, HexOverlays, SavedMap } from '~/types/map'
import {
  OverlayCategoriesForPack,
  type OverlayCategory,
  type Pack,
  type TerrainTypes,
} from '~/utils/terrainGenerator'

// Pure SavedMap → SavedMap edits. The route translates UI events into edits;
// edits know nothing about Vue, refs, the preview, or storage.

export function paintTerrain(
  map: SavedMap,
  q: number,
  r: number,
  terrain: TerrainTypes,
): SavedMap {
  const key = `${q},${r}`
  const current = map.overrides[key] ?? map.defaultTerrain
  if (current === terrain) return map
  return {
    ...map,
    overrides: { ...map.overrides, [key]: terrain },
    variantOverrides: stripKey(map.variantOverrides, key),
  }
}

export function eraseTerrain(map: SavedMap, q: number, r: number): SavedMap {
  const key = `${q},${r}`
  if (!(key in map.overrides)) return map
  const overrides = { ...map.overrides }
  delete overrides[key]
  return {
    ...map,
    overrides,
    variantOverrides: stripKey(map.variantOverrides, key),
  }
}

export function toggleOverlay(
  map: SavedMap,
  q: number,
  r: number,
  category: OverlayCategory,
  index: number,
  pack: Pack,
): SavedMap {
  const key = `${q},${r}`
  const next = cloneHexOverlays(map.overlays?.[key] ?? {}, pack)
  const existing = next[category] ?? []
  const i = existing.indexOf(index)
  const updated = i >= 0
    ? existing.filter((_, idx) => idx !== i)
    : [...existing, index]
  if (updated.length === 0) delete next[category]
  else next[category] = updated
  return writeHexOverlays(map, key, next)
}

export function eraseOverlay(
  map: SavedMap,
  q: number,
  r: number,
  category: OverlayCategory,
  pack: Pack,
): SavedMap {
  const key = `${q},${r}`
  const current = map.overlays?.[key]
  const existing = current?.[category]
  if (!existing || existing.length === 0) return map
  const next = cloneHexOverlays(current, pack)
  delete next[category]
  return writeHexOverlays(map, key, next)
}

export function placePoi(
  map: SavedMap,
  index: number,
  x: number,
  y: number,
  id: string,
): SavedMap {
  const poi: FreePoi = { id, index, x, y }
  return { ...map, freePois: [...(map.freePois ?? []), poi] }
}

export function removePoi(map: SavedMap, id: string): SavedMap {
  return {
    ...map,
    freePois: (map.freePois ?? []).filter((p) => p.id !== id),
  }
}

// One-time migration: pre-FreePoi maps stored POIs inside hex overlays as
// `overlays[hex].poi = [...]`. After migration those POIs become FreePois and
// the `poi` field is removed from each per-hex overlay map. Hex overlay
// entries that end up empty are dropped to keep storage tidy.
export function migrateLegacyPois(map: SavedMap, pois: FreePoi[]): SavedMap {
  if (!pois.length) return map
  const overlays = map.overlays
    ? Object.fromEntries(
        Object.entries(map.overlays)
          .map(([k, v]) => {
            const { poi: _drop, ...rest } = v
            void _drop
            return [k, rest as HexOverlays] as const
          })
          .filter(([, v]) => Object.keys(v).length > 0),
      )
    : undefined
  return {
    ...map,
    freePois: [...(map.freePois ?? []), ...pois],
    overlays,
  }
}

export function recordVariants(
  map: SavedMap,
  variants: Record<string, number>,
): SavedMap {
  const next = { ...(map.variantOverrides ?? {}) }
  let changed = false
  for (const [k, v] of Object.entries(variants)) {
    if (next[k] !== v) {
      next[k] = v
      changed = true
    }
  }
  if (!changed) return map
  return { ...map, variantOverrides: next }
}

// --- private helpers ---

function stripKey(
  rec: Record<string, number> | undefined,
  key: string,
): Record<string, number> {
  if (!rec || !(key in rec)) return rec ?? {}
  const next = { ...rec }
  delete next[key]
  return next
}

function cloneHexOverlays(src: HexOverlays, pack: Pack): HexOverlays {
  const out: HexOverlays = {}
  for (const c of OverlayCategoriesForPack[pack]) {
    const v = src[c]
    if (v && v.length) out[c] = [...v]
  }
  return out
}

function writeHexOverlays(
  map: SavedMap,
  key: string,
  next: HexOverlays,
): SavedMap {
  const overlays = { ...(map.overlays ?? {}) }
  if (Object.keys(next).length === 0) {
    delete overlays[key]
  } else {
    overlays[key] = next
  }
  return { ...map, overlays }
}
