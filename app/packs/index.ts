import {
  DefaultTerrainForPack,
  OverlayCategoriesForPack,
  OverlayVariantsByPack,
  type TerrainTypes,
  getOverlayPath,
  getTerrainVariantByIndex,
  groupDirectionalOverlays,
  groupExtras,
  terrainGroupsForPack,
  type ExtraGroup,
  type OverlayCategory,
  type OverlayPatternGroup,
  type OverlayVariantEntry,
  type Pack,
} from '~/utils/terrainGenerator'

// Shape the overlay palette wants for a category. The renderer picks based on
// `kind`. Adapters return one of these from `overlayPaletteShape(category)`.
export type OverlayPaletteShape =
  | { kind: 'flat'; entries: OverlayVariantEntry[] }
  | { kind: 'directional'; groups: OverlayPatternGroup[] }
  | { kind: 'extras'; groups: ExtraGroup[] }

// Bounding box of a hex polygon in SVG user-space units.
export interface HexBounds {
  x: number
  y: number
  width: number
  height: number
}

// Placement for a tile image inside its hex's bounds. Worldhex tiles inscribe
// a polygon inside transparent padding + a south ledge, so they sit at a
// scale/offset relative to the hex; hexes2 tiles fit the hex bounds directly.
export interface TilePlacement {
  x: number
  y: number
  w: number
  h: number
}

// One interface, two adapters. Callers stop switching on the Pack string and
// ask the adapter directly.
export interface PackAdapter {
  readonly id: Pack
  readonly defaultTerrain: TerrainTypes
  readonly overlayCategories: readonly OverlayCategory[]
  // Worldhex tiles overlap by design — south neighbours draw on top of north
  // neighbours' protruding ledge — so render order matters. Pointy tiles are
  // clipped to a polygon and don't care about draw order.
  readonly needsPainterSort: boolean
  // Pointy maps get an SVG stroke on each polygon. Worldhex tiles bake their
  // own outline into the art; stroking on top would clash visually.
  readonly drawsOutline: boolean
  // Whether the renderer must clip the tile image to the hex polygon. Pointy
  // tiles fit exactly so they're clipped; worldhex tiles intentionally bleed.
  readonly needsPolygonClip: boolean
  terrainUrl(type: TerrainTypes, variantIndex: number): string
  overlayUrl(category: OverlayCategory, index: number): string
  terrainGroups(): ReturnType<typeof terrainGroupsForPack>
  overlayPaletteShape(category: OverlayCategory): OverlayPaletteShape
  // Where to place a tile image inside its hex bounds. `asset` is the tile URL
  // so adapters can apply per-tile placement quirks (see worldhex peak-mountain).
  tilePlacement(asset: string, bounds: HexBounds): TilePlacement
}

// ----------------------------------------------------------------------------
// Worldhex tile geometry. Source tiles are 224×194 PNGs with the hex polygon
// inscribed inside transparent padding. Measured pixel bounds (alpha > 16):
// art at x=[54,169], y=[46,156]. The hex polygon (without the south ledge)
// sits at roughly x=[54,170], y=[46,146]; the bottom ~10 px is the dark ledge
// that protrudes below the polygon's bottom edge.
// ----------------------------------------------------------------------------
const WH_IMG_W = 224
const WH_IMG_H = 194
const WH_POLY_LEFT = 54
const WH_POLY_TOP = 46
const WH_POLY_W = 116
const WH_POLY_H = 100
// Small upscale on tile rendering so adjacent tile art overlaps by ~1 px on
// each side — masks the gray seam visible at anti-aliased edges and sub-pixel
// rounding boundaries.
const WH_TILE_BLEED = 1.025

// Peak Mountain tiles ("peak (lush)" / "peak (snowy)" / "peak (rocky)") are
// authored with the polygon shifted ~11 px left inside the source PNG
// (polygon at x=[43,158] instead of the standard x=[54,169]). URLs are
// %-encoded so the comma after "Mountains" lands as %2C — match either form.
function worldhexPolyLeftForUrl(url: string): number {
  return /peak%20\(|peak\s\(/i.test(url) ? 43 : WH_POLY_LEFT
}

function worldhexTilePlacement(asset: string, b: HexBounds): TilePlacement {
  const sx = (b.width / WH_POLY_W) * WH_TILE_BLEED
  const sy = (b.height / WH_POLY_H) * WH_TILE_BLEED
  const polyLeft = worldhexPolyLeftForUrl(asset)
  // Source-polygon centre is at (polyLeft + WH_POLY_W/2, WH_POLY_TOP + WH_POLY_H/2)
  // in source pixels; centre that on the SVG hex centre.
  const srcPolyCx = polyLeft + WH_POLY_W / 2
  const srcPolyCy = WH_POLY_TOP + WH_POLY_H / 2
  const hexCx = b.x + b.width / 2
  const hexCy = b.y + b.height / 2
  return {
    w: WH_IMG_W * sx,
    h: WH_IMG_H * sy,
    x: hexCx - srcPolyCx * sx,
    y: hexCy - srcPolyCy * sy,
  }
}

interface AdapterFlags {
  needsPainterSort: boolean
  drawsOutline: boolean
  needsPolygonClip: boolean
  tilePlacement: PackAdapter['tilePlacement']
}

function makeAdapter(id: Pack, flags: AdapterFlags): PackAdapter {
  return {
    id,
    defaultTerrain: DefaultTerrainForPack[id],
    overlayCategories: OverlayCategoriesForPack[id],
    needsPainterSort: flags.needsPainterSort,
    drawsOutline: flags.drawsOutline,
    needsPolygonClip: flags.needsPolygonClip,
    terrainUrl: (t, n) => getTerrainVariantByIndex(t, n),
    overlayUrl: (c, n) => getOverlayPath(c, n, id),
    terrainGroups: () => terrainGroupsForPack(id),
    overlayPaletteShape(category) {
      if (id === 'worldhex') {
        if (category === 'poi') return { kind: 'extras', groups: groupExtras(id) }
        if (category === 'river' || category === 'path' || category === 'coast') {
          return { kind: 'directional', groups: groupDirectionalOverlays(id, category) }
        }
      }
      const list = OverlayVariantsByPack[id]?.[category]
      return { kind: 'flat', entries: list?.files ?? [] }
    },
    tilePlacement: flags.tilePlacement,
  }
}

export const hexes2Adapter: PackAdapter = makeAdapter('hexes2', {
  needsPainterSort: false,
  drawsOutline: true,
  needsPolygonClip: true,
  tilePlacement: (_asset, b) => ({ x: b.x, y: b.y, w: b.width, h: b.height }),
})

export const worldhexAdapter: PackAdapter = makeAdapter('worldhex', {
  needsPainterSort: true,
  drawsOutline: false,
  needsPolygonClip: false,
  tilePlacement: worldhexTilePlacement,
})

const ADAPTERS: Record<Pack, PackAdapter> = {
  hexes2: hexes2Adapter,
  worldhex: worldhexAdapter,
}

export function packAdapterFor(pack: Pack): PackAdapter {
  return ADAPTERS[pack]
}
