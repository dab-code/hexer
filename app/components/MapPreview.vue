<script setup lang="ts">
import { SVG } from '@svgdotjs/svg.js'
import { Grid, Orientation, rectangle } from 'honeycomb-grid'
import { createCustomHex, type CustomHex } from '~/classes/CustomHex'
import {
  TerrainTypes,
  TerrainVariants,
  getTerrainKeyByIndex,
  getTerrainVariantByIndex,
  isWorldhex72Only,
  packForOrientation,
  wrapIndex,
} from '~/utils/terrainGenerator'
import { packAdapterFor } from '~/packs'
import type { FreePoi, HexOverlays, Note, SavedMap } from '~/types/map'
import type { OverlaySelection } from '~/components/OverlayPalette.vue'
import type { PaintMode } from '~/components/EditorSidebar.vue'

const props = defineProps<{
  map: SavedMap
  editable?: boolean
  zoom?: number
  activePoiMode?: boolean
  activePoiErase?: boolean
  activeMode?: PaintMode
  activeTerrain?: TerrainTypes
  activeOverlay?: OverlaySelection | null
  eraseMode?: boolean
  // In-progress trail anchors (transient, lives on the route until finished).
  pathDraft?: { x: number; y: number }[]
  // Transient draft pin while composing a new note; rendered as a ghost marker.
  noteDraft?: { x: number; y: number } | null
}>()

const BG_COLOR = '#e9e9e9'

// Free-POI stamps render at native dimensions × this scale. The factor matches
// worldhex hex-tile-art density (60 SVG units per ~116 source-pixel polygon).
// Constant lives here because only renderFreePois needs it; the hex tile
// placement math has moved to the Pack adapter (app/packs).
// WH_SCALE matches the worldhex tile-art density and is the default for POI
// stamps. Keep per-asset exceptions here, in one place, so the render paths
// just ask for a scale and don't grow size math. These stamps read too large
// at the default density and get trimmed down:
//  - Walls: full-hex tiles reused as stamps; half size.
//  - Tower Fort: oversized fortress art; 60%.
// (overlayUrl percent-encodes filenames, so decode before matching by name.)
const WH_SCALE = 60 / 116
const WALL_SCALE = WH_SCALE * 0.5
const TOWER_FORT_SCALE = WH_SCALE * 0.6
function poiStampScale(url: string): number {
  const name = decodeURIComponent(url)
  if (/\/Wall \d/.test(name)) return WALL_SCALE
  if (name.includes('Tower Fort')) return TOWER_FORT_SCALE
  return WH_SCALE
}
const stampNativeSizes = new Map<string, { w: number; h: number }>()
const stampPendingLoads = new Set<string>()
function ensureStampSize(url: string): { w: number; h: number } | null {
  const cached = stampNativeSizes.get(url)
  if (cached) return cached
  if (stampPendingLoads.has(url)) return null
  stampPendingLoads.add(url)
  const img = new Image()
  img.onload = () => {
    stampPendingLoads.delete(url)
    stampNativeSizes.set(url, { w: img.naturalWidth, h: img.naturalHeight })
    // Re-render the free-POI layer so newly-measured stamps resize to native.
    renderFreePois()
  }
  img.onerror = () => { stampPendingLoads.delete(url) }
  img.src = url
  return null
}

// Display size for a placed or ghosted POI stamp. Worldhex stamps size to their
// native pixels at the per-asset scale; hexes2 POIs keep the hex bounding box.
// Until a worldhex stamp's native size is measured, fall back to half the hex
// bounds so it isn't visually overwhelming on first paint.
function poiStampSize(url: string, hexW: number, hexH: number): { w: number; h: number } {
  if (activeAdapter.value.id !== 'worldhex') return { w: hexW, h: hexH }
  const native = ensureStampSize(url)
  if (!native) return { w: hexW * 0.5, h: hexH * 0.5 }
  const scale = poiStampScale(url)
  return { w: native.w * scale, h: native.h * scale }
}

const emit = defineEmits<{
  hexClick: [hex: CustomHex]
  paint: [q: number, r: number]
  variantsPicked: [variants: Record<string, number>]
  placePoi: [x: number, y: number]
  removePoi: [id: string]
  migratePois: [pois: FreePoi[]]
  toggleEdge: [edgeKey: string]
  addPathAnchor: [x: number, y: number]
  removePath: [id: string]
  placeNote: [x: number, y: number]
  openNote: [id: string]
}>()

const MAX_MAP_WIDTH = 600
const MAX_MAP_HEIGHT = 600
// Padding needs to clear the widest stroke half-width plus pencil-fuzz
// displacement — otherwise edge rivers on the top/bottom rows get cropped by
// the viewBox.
const SVG_PADDING = 8

const grid = shallowRef<Grid<CustomHex> | null>(null)
const hexArray = shallowRef<CustomHex[]>([])
const boundingBox = ref<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)

function createGrid(width: number, height: number, orientation: Orientation) {
  const HexCtor = createCustomHex(orientation)
  const generated = new Grid(HexCtor, rectangle({ width, height }))

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity
  const hexes: CustomHex[] = []
  generated.traverse(rectangle({ start: [0, 0], width, height })).forEach((hex: CustomHex) => {
    hex.corners.forEach(({ x, y }) => {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    })
    hexes.push(hex)
  })

  hexArray.value = hexes
  boundingBox.value = { minX, minY, maxX, maxY }
  grid.value = markRaw(generated)
}

const mapRef = ref<HTMLElement>()
const isPainting = ref(false)
const paintedThisDrag = new Set<string>()

const variantCache = new Map<string, { terrain: TerrainTypes; variantIndex: number }>()
let pendingVariants: Record<string, number> = {}
let flushScheduled = false

function flushPendingVariants() {
  if (Object.keys(pendingVariants).length === 0) return
  const batch = pendingVariants
  pendingVariants = {}
  emit('variantsPicked', batch)
}

function queueVariantEmit(key: string, variantIndex: number) {
  pendingVariants[key] = variantIndex
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(() => {
    flushScheduled = false
    flushPendingVariants()
  })
}

function pickVariantForHex(hex: CustomHex, terrain: TerrainTypes): number {
  const key = `${hex.q},${hex.r}`
  const persisted = props.map.variantOverrides?.[key]
  const terrainKey = getTerrainKeyByIndex(terrain)
  // Legacy maps may carry terrain IDs that no longer map; getTerrainVariantByIndex
  // already falls back to a Blank tile, but we still need a non-zero variant count.
  const variantCount = TerrainVariants[terrainKey]?.files.length ?? 1
  if (persisted !== undefined) {
    const safe = wrapIndex(persisted, variantCount)
    variantCache.set(key, { terrain, variantIndex: safe })
    return safe
  }
  const cached = variantCache.get(key)
  if (cached && cached.terrain === terrain) return cached.variantIndex
  const variantIndex = Math.floor(Math.random() * variantCount)
  variantCache.set(key, { terrain, variantIndex })
  queueVariantEmit(key, variantIndex)
  return variantIndex
}

function variantPathFor(hex: CustomHex, terrain: TerrainTypes): string {
  return getTerrainVariantByIndex(terrain, pickVariantForHex(hex, terrain))
}

function effectiveTerrainFor(q: number, r: number): TerrainTypes {
  return props.map.overrides[`${q},${r}`] ?? props.map.defaultTerrain
}

function regenerate() {
  createGrid(props.map.sizeW, props.map.sizeH, props.map.hexOrientation)
}

const neighbourOffsets = [
  [+1, 0], [-1, 0], [0, +1], [0, -1], [+1, -1], [-1, +1],
] as const

const activeAdapter = computed(() => packAdapterFor(packForOrientation(props.map.hexOrientation)))

// Pins are clickable (full opacity) when reading is the intent: in view mode
// (not editable) or while the Notes tool is active. Under any painting tool
// they render ghosted and let clicks fall through to the hex beneath.
const notesInteractive = computed(() => !props.editable || props.activeMode === 'notes')

function centerOf(h: { corners: { x: number; y: number }[] }) {
  let sx = 0, sy = 0
  for (const c of h.corners) { sx += c.x; sy += c.y }
  return { x: sx / h.corners.length, y: sy / h.corners.length }
}

// svg.js types are loose; we just need handles to call .clear()/.remove()/.attr()/etc.
type SvgNode = any
type SvgGroup = any

let drawInstance: SvgNode = null
let defsInstance: SvgNode = null
let edgeLayer: SvgGroup = null
let pathLayer: SvgGroup = null
let poiLayer: SvgGroup = null
let notesLayer: SvgGroup = null
let ghostLayer: SvgGroup = null
let lastPathCursorPos: { x: number; y: number } | null = null
let currentHexGhostKey: string | null = null
let lastPoiGhostPos: { x: number; y: number } | null = null
let lastEdgeGhostKey: string | null = null
let hexBoundsSize: { width: number; height: number } | null = null
let migrationAttempted = false
const hexGroups = new Map<string, SvgGroup>()
const hexLookup = new Map<string, CustomHex>()
const hexClipIds = new Map<string, string>()
// edge key → the two corner points that compose it, in SVG user-space.
const edgeCornerLookup = new Map<string, { a: { x: number; y: number }; b: { x: number; y: number } }>()

// River-band stroke between hexes. Sized in SVG user-space; hex "dimensions" is
// 30 so a 4-unit core leaves the baked hex outline showing on either side. The
// dark border matches the inked look of the in-hex river tiles.
const ASSET_BASE_URL = useRuntimeConfig().public.assetBaseUrl as string
// Note pins use the worldhex "large white pin" extra asset so they match the map's
// art style. The large variant carries enough native pixels (35×48) to stay crisp
// at the on-screen render size; the small pin looked blurry scaled up. URL is
// encoded per path segment to match the export DPI-upgrade pattern (so exports
// swap in the crisp 300-DPI WebP automatically).
const NOTE_PIN_URL = `${ASSET_BASE_URL}/worldhex/Assets%20-%2072%20DPI/Extras/Pins%20-%20Pin%2C%20white%20(large).png`
const NOTE_PIN_ASPECT = 35 / 48

const EDGE_RIVER_COLOR = '#517184'
const EDGE_RIVER_BORDER_COLOR = '#111'
const EDGE_RIVER_WIDTH = 5
const EDGE_RIVER_BORDER_WIDTH = EDGE_RIVER_WIDTH + 1.2

// Gentle wobble along the edge — enough to read as hand-drawn but not so much
// that adjacent edges look disconnected. Pencil texture comes from the SVG
// turbulence filter (defined in defs at render time).
const EDGE_SQUIGGLE_AMPLITUDE = 0.35
const EDGE_SQUIGGLE_SEGMENTS = 18
const EDGE_PENCIL_FILTER_ID = 'edge-pencil-fuzz'
// At dangling ends of a river chain, extend the stroke a short distance past
// the corner into the next hex so the river reads as flowing in/out rather
// than stopping abruptly at the hex vertex.
const EDGE_RIVER_END_EXTENSION = 3

// Free-form pen-tool paths: dashed red trail, slightly thicker invisible
// stroke for hit-testing on touch.
const PATH_TRAIL_COLOR = '#dc2626'
const PATH_TRAIL_WIDTH = 1.6
// Dash length / gap length in SVG user units. Bumped the gap so the trail
// reads more as separated dots than a tight dashed line.
const PATH_TRAIL_DASH = '3 5'
const PATH_TRAIL_HIT_WIDTH = 10
const PATH_ANCHOR_RADIUS = 1.6
// Centripetal Catmull-Rom uses α = 0.5 in its non-uniform parameterization:
// each knot's parameter spacing equals sqrt(chord length). This shrinks the
// tangent where two anchors are close together, eliminating the overshoots
// and self-loops that plague the uniform variant when anchors are unevenly
// spaced — which is the common case for hand-placed pen-tool points.
const PATH_CATMULL_ALPHA = 0.5

function roundCoord(n: number): string {
  return (Math.round(n * 100) / 100).toString()
}

function edgeKeyFromCorners(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const ka = `${roundCoord(a.x)},${roundCoord(a.y)}`
  const kb = `${roundCoord(b.x)},${roundCoord(b.y)}`
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Build an SVG path that traces a gentle sinusoidal wobble from a to b. Endpoints
// land exactly on a and b (integer cycle count → sin(2π·n)=0), so adjacent
// painted edges meet cleanly at the shared corner.
function squigglePathBetween(
  edgeKey: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cycles = 1 + (hashString(edgeKey) % 2) // 1 or 2 gentle wiggles per edge
  const phaseShift = ((hashString(edgeKey) >> 3) % 2) === 0 ? 1 : -1
  let d = `M ${a.x} ${a.y}`
  for (let i = 1; i < EDGE_SQUIGGLE_SEGMENTS; i++) {
    const t = i / EDGE_SQUIGGLE_SEGMENTS
    const off = Math.sin(t * Math.PI * 2 * cycles) * EDGE_SQUIGGLE_AMPLITUDE * phaseShift
    const px = a.x + dx * t + nx * off
    const py = a.y + dy * t + ny * off
    d += ` L ${px} ${py}`
  }
  d += ` L ${b.x} ${b.y}`
  return d
}

type Snapshot = {
  overrides: Record<string, TerrainTypes>
  overlays: Record<string, HexOverlays>
  freePois: FreePoi[]
  edges: string[]
  paths: { id: string; points: { x: number; y: number }[] }[]
  notes: Note[]
}

let prevSnapshot: Snapshot | null = null

function captureSnapshot(): Snapshot {
  const m = props.map
  return {
    overrides: { ...m.overrides },
    overlays: m.overlays
      ? Object.fromEntries(Object.entries(m.overlays).map(([k, v]) => [
          k,
          Object.fromEntries(Object.entries(v).map(([cat, val]) => [
            cat,
            Array.isArray(val) ? [...val] : val,
          ])) as HexOverlays,
        ]))
      : {},
    freePois: m.freePois ? m.freePois.map((p) => ({ ...p })) : [],
    edges: m.edges ? [...m.edges] : [],
    paths: m.paths ? m.paths.map((p) => ({ id: p.id, points: p.points.map((pt) => ({ ...pt })) })) : [],
    notes: m.notes ? m.notes.map((n) => ({ ...n })) : [],
  }
}

function renderHex(hex: CustomHex, group: SvgGroup) {
  if (!defsInstance) return

  const adapter = activeAdapter.value
  const effectiveTerrain = effectiveTerrainFor(hex.q, hex.r)

  const key = `${hex.q},${hex.r}`
  const corners = hex.corners.map((c) => `${c.x},${c.y}`).join(' ')
  const terrainAsset = variantPathFor(hex, effectiveTerrain)

  const overlayMap = props.map.overlays ?? {}

  const xs = hex.corners.map((c) => c.x)
  const ys = hex.corners.map((c) => c.y)
  const hexBounds = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }

  // Where to put the tile image, and (for pointy) what polygon to clip it to.
  // Worldhex tiles intentionally bleed past the polygon — the painter's-algorithm
  // sort lets southern neighbours cover upper hexes' protruding ledges.
  const place = adapter.tilePlacement(terrainAsset, hexBounds)
  let clip: string | undefined
  if (adapter.needsPolygonClip) {
    let clipId = hexClipIds.get(key)
    if (!clipId) {
      clipId = `hex-clip-${hex.q}_${hex.r}`.replace(/-/g, 'n')
      hexClipIds.set(key, clipId)
      defsInstance.clip().attr('id', clipId).polygon(corners)
    }
    clip = `url(#${clipId})`
  }
  const placeArgs: { w: number; h: number; x: number; y: number; clip?: string } = { ...place, clip }

  group.polygon(corners).fill(BG_COLOR)

  const terrainImg = group
    .image(terrainAsset)
    .size(placeArgs.w, placeArgs.h)
    .move(placeArgs.x, placeArgs.y)
    .attr('class', 'terrain-image')
    // Images bleed past the hex polygon (worldhex source padding + ledge), and
    // painter's algorithm puts the southern neighbour's image on top — letting
    // images catch pointer events would route clicks to the wrong hex. The BG
    // polygon (drawn first, in this same group) catches the click instead.
    .attr('pointer-events', 'none')
  if (placeArgs.clip) terrainImg.attr('clip-path', placeArgs.clip)

  const hexOverlays = overlayMap[key]
  if (hexOverlays) {
    for (const category of adapter.overlayCategories) {
      if (category === 'poi') continue
      const indices = hexOverlays[category]
      if (!indices || !indices.length) continue
      for (const idx of indices) {
        const overlayImg = group
          .image(adapter.overlayUrl(category, idx))
          .size(placeArgs.w, placeArgs.h)
          .move(placeArgs.x, placeArgs.y)
          .attr('pointer-events', 'none')
        if (placeArgs.clip) overlayImg.attr('clip-path', placeArgs.clip)
      }
    }
  }

  if (adapter.drawsOutline) {
    group.polygon(corners).fill('none').stroke({ color: '#333', width: 0.05 })
  }

  // Use onXxx properties so a re-render REPLACES the handler instead of stacking duplicates.
  if (props.editable) {
    group.node.style.cursor = 'crosshair'
    group.node.onmousedown = (e: MouseEvent) => {
      // POI, edge, path, and notes modes are handled by SVG-level listeners — don't paint hexes underneath.
      if (props.activePoiMode || props.activeMode === 'edge' || props.activeMode === 'path' || props.activeMode === 'notes') return
      e.preventDefault()
      isPainting.value = true
      paintedThisDrag.clear()
      paintedThisDrag.add(`${hex.q},${hex.r}`)
      emit('paint', hex.q, hex.r)
    }
    group.node.onmouseenter = () => {
      // Hover preview — POI, edge, and path modes follow cursor via SVG-level mousemove instead.
      if (
        props.activeMode !== 'edge' &&
        props.activeMode !== 'path' &&
        props.activeMode !== 'notes' &&
        !(props.activeMode === 'overlay' && props.activeOverlay?.category === 'poi')
      ) {
        renderHexGhost(hex)
      }
      if (!isPainting.value) return
      const k = `${hex.q},${hex.r}`
      if (paintedThisDrag.has(k)) return
      paintedThisDrag.add(k)
      emit('paint', hex.q, hex.r)
    }
    group.node.onclick = null
  } else {
    group.node.style.cursor = ''
    group.node.onmousedown = null
    group.node.onmouseenter = null
    group.node.onclick = () => emit('hexClick', hex)
  }
}

function updateHex(q: number, r: number) {
  const key = `${q},${r}`
  const group = hexGroups.get(key)
  const hex = hexLookup.get(key)
  if (!group || !hex) return

  group.clear()
  renderHex(hex, group)
}

function render() {
  if (!mapRef.value || !hexArray.value.length || !boundingBox.value) return

  mapRef.value.innerHTML = ''
  hexGroups.clear()
  hexLookup.clear()
  hexClipIds.clear()
  edgeCornerLookup.clear()
  edgeLayer = null
  pathLayer = null
  poiLayer = null
  notesLayer = null
  ghostLayer = null
  currentHexGhostKey = null
  lastPoiGhostPos = null
  lastEdgeGhostKey = null
  lastPathCursorPos = null
  hexBoundsSize = null

  drawInstance = SVG().addTo(mapRef.value)
  const { minX, minY, maxX, maxY } = boundingBox.value
  const width = maxX - minX
  const height = maxY - minY
  const scale = Math.min(MAX_MAP_WIDTH / width, MAX_MAP_HEIGHT / height)
  const svgWidth = width * scale
  const svgHeight = height * scale

  drawInstance
    .size(svgWidth, svgHeight)
    .viewbox(minX - SVG_PADDING, minY - SVG_PADDING, width + SVG_PADDING * 2, height + SVG_PADDING * 2)
  // Strip the explicit height attribute so the viewBox aspect drives the rendered height.
  drawInstance.node.removeAttribute('height')
  // Apply layout styles inline so they take effect on this dynamically-added SVG
  // (Vue scoped CSS selectors don't match svg.js-created elements).
  drawInstance.node.style.width = '100%'
  drawInstance.node.style.height = 'auto'
  drawInstance.node.style.display = 'block'
  defsInstance = drawInstance.defs()
  ensureEdgePencilFilter()
  attachSvgPointerHandlers()

  hexArray.value.forEach((h) => hexLookup.set(`${h.q},${h.r}`, h))

  // Painter's algorithm (when the pack needs it): lower-y hexes drawn first so
  // southern neighbours cover upper hexes' protruding ledges. Pointy hexes2
  // tiles don't bleed past their polygon, so source order is fine.
  const renderOrder = activeAdapter.value.needsPainterSort
    ? [...hexArray.value].sort((a, b) => centerOf(a).y - centerOf(b).y)
    : hexArray.value

  renderOrder.forEach((hex) => {
    const group = drawInstance!.group()
    hexGroups.set(`${hex.q},${hex.r}`, group)
    renderHex(hex, group)
  })

  // Build the corner lookup for every possible edge in the grid so we can draw
  // by key without having to find the originating hex again.
  edgeCornerLookup.clear()
  for (const hex of hexArray.value) {
    for (let i = 0; i < 6; i++) {
      const a = hex.corners[i]!
      const b = hex.corners[(i + 1) % 6]!
      const key = edgeKeyFromCorners(a, b)
      if (!edgeCornerLookup.has(key)) edgeCornerLookup.set(key, { a, b })
    }
  }

  edgeLayer = drawInstance.group()
  // Filter on the layer (not per stroke): the layer's union bbox is large
  // enough that the percentage-sized filter region has enough absolute room
  // for the displacement on every painted edge, including thin horizontal
  // strokes on the top/bottom rows where the per-path bbox was previously
  // tiny enough to clip the displaced output.
  edgeLayer.attr('filter', `url(#${EDGE_PENCIL_FILTER_ID})`)
  renderEdges()
  poiLayer = drawInstance.group()
  renderFreePois()
  // Paths render above POIs so trails read continuously over city stamps and
  // other map markers — matches the convention of road overlays on tabletop maps.
  pathLayer = drawInstance.group()
  renderPaths()
  // Note pins sit above everything else so markers stay readable over tiles,
  // POI stamps, and trails.
  notesLayer = drawInstance.group()
  notesLayer.attr('class', 'notes-layer')
  renderNotes()
  ghostLayer = drawInstance.group()

  prevSnapshot = captureSnapshot()
  maybeMigrateLegacyPois()
}

function clearGhost() {
  if (ghostLayer) ghostLayer.clear()
  currentHexGhostKey = null
  lastPoiGhostPos = null
  lastEdgeGhostKey = null
}

function ghostUrlForHexMode(): string | null {
  if (!props.editable || props.eraseMode) return null
  const adapter = activeAdapter.value
  if (props.activeMode === 'terrain') {
    return getTerrainVariantByIndex(props.activeTerrain ?? props.map.defaultTerrain, 0)
  }
  if (props.activeMode === 'overlay' && props.activeOverlay && props.activeOverlay.category !== 'poi') {
    return adapter.overlayUrl(props.activeOverlay.category, props.activeOverlay.index)
  }
  return null
}

function renderHexGhost(hex: CustomHex) {
  if (!ghostLayer) return
  ghostLayer.clear()
  currentHexGhostKey = null
  lastPoiGhostPos = null
  const url = ghostUrlForHexMode()
  if (!url) return
  const adapter = activeAdapter.value
  const xs = hex.corners.map((c) => c.x)
  const ys = hex.corners.map((c) => c.y)
  const hexBounds = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
  const place = adapter.tilePlacement(url, hexBounds)
  const img = ghostLayer.image(url).size(place.w, place.h).move(place.x, place.y)
  img.node.style.opacity = '0.5'
  img.node.setAttribute('pointer-events', 'none')
  if (adapter.needsPolygonClip) {
    const clipId = hexClipIds.get(`${hex.q},${hex.r}`)
    if (clipId) img.attr('clip-path', `url(#${clipId})`)
  }
  currentHexGhostKey = `${hex.q},${hex.r}`
}

function renderPoiGhostAt(svgX: number, svgY: number) {
  if (!ghostLayer) return
  ghostLayer.clear()
  currentHexGhostKey = null
  if (!props.editable || props.eraseMode) { lastPoiGhostPos = null; return }
  if (props.activeMode !== 'overlay' || props.activeOverlay?.category !== 'poi') {
    lastPoiGhostPos = null
    return
  }
  const adapter = activeAdapter.value
  const url = adapter.overlayUrl('poi', props.activeOverlay.index)
  const { width: hexW, height: hexH } = getHexBoundsSize()
  const { w, h } = poiStampSize(url, hexW, hexH)
  const img = ghostLayer.image(url).size(w, h).move(svgX - w / 2, svgY - h / 2)
  img.node.style.opacity = '0.5'
  img.node.setAttribute('pointer-events', 'none')
  lastPoiGhostPos = { x: svgX, y: svgY }
}

function getHexBoundsSize(): { width: number; height: number } {
  if (hexBoundsSize) return hexBoundsSize
  const sample = hexArray.value[0]
  if (!sample) return { width: 0, height: 0 }
  const xs = sample.corners.map((c) => c.x)
  const ys = sample.corners.map((c) => c.y)
  hexBoundsSize = {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
  return hexBoundsSize
}

// Lazily define a turbulence-based displacement filter once per render. We
// attach it to the river layer (not per-path); the layer's union bbox is large
// enough that the filter region — sized relative to that bbox — covers the
// displacement on even the thinnest individual stroke segment.
function ensureEdgePencilFilter() {
  if (!defsInstance) return
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
  filter.setAttribute('id', EDGE_PENCIL_FILTER_ID)
  // Generous filter region: even a single thin horizontal edge has bbox height
  // ~6 SVG units, so 100% padding gives ~6 units of absolute room — enough for
  // the displacement (scale=0.9) plus the squiggle wobble without clipping.
  filter.setAttribute('x', '-100%')
  filter.setAttribute('y', '-100%')
  filter.setAttribute('width', '300%')
  filter.setAttribute('height', '300%')
  const turb = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence')
  turb.setAttribute('type', 'fractalNoise')
  turb.setAttribute('baseFrequency', '0.9')
  turb.setAttribute('numOctaves', '2')
  turb.setAttribute('seed', '7')
  turb.setAttribute('result', 'noise')
  const disp = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap')
  disp.setAttribute('in', 'SourceGraphic')
  disp.setAttribute('in2', 'noise')
  disp.setAttribute('scale', '0.9')
  disp.setAttribute('xChannelSelector', 'R')
  disp.setAttribute('yChannelSelector', 'G')
  filter.appendChild(turb)
  filter.appendChild(disp)
  defsInstance.node.appendChild(filter)
}

// Per-edge stroke (border + core). Used for the hover ghost — the main render
// path joins edges into chains so stroke-linejoin can smooth corners.
function drawEdgeStroke(layer: SvgGroup, edgeKey: string, opts?: { opacity?: number }): void {
  const corners = edgeCornerLookup.get(edgeKey)
  if (!corners) return
  const d = squigglePathBetween(edgeKey, corners.a, corners.b)
  const group = layer.group()
  const border = group
    .path(d)
    .fill('none')
    .stroke({ color: EDGE_RIVER_BORDER_COLOR, width: EDGE_RIVER_BORDER_WIDTH, linecap: 'butt', linejoin: 'round' })
  border.attr('pointer-events', 'none')
  const core = group
    .path(d)
    .fill('none')
    .stroke({ color: EDGE_RIVER_COLOR, width: EDGE_RIVER_WIDTH, linecap: 'butt', linejoin: 'round' })
  core.attr('pointer-events', 'none')
  if (opts?.opacity !== undefined) group.node.style.opacity = String(opts.opacity)
}

// Returns the L commands tracing a gentle squiggle from a to b (no initial M).
// Endpoints land exactly on a and b so chained edges meet at shared vertices.
function squiggleSegmentLCommands(
  edgeKey: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cycles = 1 + (hashString(edgeKey) % 2)
  const phaseShift = ((hashString(edgeKey) >> 3) % 2) === 0 ? 1 : -1
  let out = ''
  for (let i = 1; i < EDGE_SQUIGGLE_SEGMENTS; i++) {
    const t = i / EDGE_SQUIGGLE_SEGMENTS
    const off = Math.sin(t * Math.PI * 2 * cycles) * EDGE_SQUIGGLE_AMPLITUDE * phaseShift
    const px = a.x + dx * t + nx * off
    const py = a.y + dy * t + ny * off
    out += ` L ${px} ${py}`
  }
  out += ` L ${b.x} ${b.y}`
  return out
}

// Greedy chain-walk: turn the painted edge set into a small number of long
// continuous subpaths, so stroke-linejoin smooths vertices where adjacent
// edges meet. Branches at a 3-edge junction still result in two subpaths
// meeting at that vertex (paths don't fork), but joins along chains look clean.
function buildJoinedRiverPath(edgeKeys: string[]): string {
  const segments: { a: { x: number; y: number }; b: { x: number; y: number } }[] = []
  for (const key of edgeKeys) {
    const c = edgeCornerLookup.get(key)
    if (c) segments.push({ a: c.a, b: c.b })
  }
  if (segments.length === 0) return ''

  const vKey = (p: { x: number; y: number }) => `${roundCoord(p.x)},${roundCoord(p.y)}`
  const adjacency = new Map<string, number[]>()
  const addAdj = (k: string, idx: number) => {
    const arr = adjacency.get(k)
    if (arr) arr.push(idx)
    else adjacency.set(k, [idx])
  }
  for (let i = 0; i < segments.length; i++) {
    addAdj(vKey(segments[i]!.a), i)
    addAdj(vKey(segments[i]!.b), i)
  }

  const visited = new Set<number>()
  const subpaths: string[] = []

  const otherEnd = (i: number, atVertex: string) => {
    const s = segments[i]!
    return vKey(s.a) === atVertex ? s.b : s.a
  }

  for (let start = 0; start < segments.length; start++) {
    if (visited.has(start)) continue
    visited.add(start)
    const chain: { x: number; y: number }[] = [segments[start]!.a, segments[start]!.b]

    // Extend forward from chain[chain.length - 1].
    while (true) {
      const tail = chain[chain.length - 1]!
      const adj = adjacency.get(vKey(tail)) ?? []
      const next = adj.find((i) => !visited.has(i))
      if (next === undefined) break
      visited.add(next)
      chain.push(otherEnd(next, vKey(tail)))
    }
    // Extend backward from chain[0].
    while (true) {
      const head = chain[0]!
      const adj = adjacency.get(vKey(head)) ?? []
      const next = adj.find((i) => !visited.has(i))
      if (next === undefined) break
      visited.add(next)
      chain.unshift(otherEnd(next, vKey(head)))
    }

    const startV = chain[0]!
    const endV = chain[chain.length - 1]!
    const startIsDangling = (adjacency.get(vKey(startV)) ?? []).length === 1
    const endIsDangling = (adjacency.get(vKey(endV)) ?? []).length === 1
    const extendPast = (
      from: { x: number; y: number },
      towards: { x: number; y: number },
    ) => {
      const dx = from.x - towards.x
      const dy = from.y - towards.y
      const len = Math.hypot(dx, dy) || 1
      return {
        x: from.x + (dx / len) * EDGE_RIVER_END_EXTENSION,
        y: from.y + (dy / len) * EDGE_RIVER_END_EXTENSION,
      }
    }

    let d: string
    if (startIsDangling && chain.length >= 2) {
      const ext = extendPast(startV, chain[1]!)
      d = `M ${ext.x} ${ext.y} L ${startV.x} ${startV.y}`
    } else {
      d = `M ${startV.x} ${startV.y}`
    }
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1]!
      const b = chain[i]!
      d += squiggleSegmentLCommands(edgeKeyFromCorners(a, b), a, b)
    }
    if (endIsDangling && chain.length >= 2) {
      const ext = extendPast(endV, chain[chain.length - 2]!)
      d += ` L ${ext.x} ${ext.y}`
    }
    subpaths.push(d)
  }

  return subpaths.join(' ')
}

function renderEdges() {
  if (!edgeLayer) return
  edgeLayer.clear()
  const edges = props.map.edges
  if (!edges || edges.length === 0) return
  const d = buildJoinedRiverPath(edges)
  if (!d) return
  const border = edgeLayer
    .path(d)
    .fill('none')
    .stroke({ color: EDGE_RIVER_BORDER_COLOR, width: EDGE_RIVER_BORDER_WIDTH, linecap: 'butt', linejoin: 'round' })
  border.attr('pointer-events', 'none')
  const core = edgeLayer
    .path(d)
    .fill('none')
    .stroke({ color: EDGE_RIVER_COLOR, width: EDGE_RIVER_WIDTH, linecap: 'butt', linejoin: 'round' })
  core.attr('pointer-events', 'none')
}

// Centripetal Catmull-Rom → cubic Bezier. Open path; at the first/last segment
// the neighbour beyond the endpoint is taken to coincide with the endpoint,
// which makes the curve enter/exit tangent to that segment.
function catmullRomPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`
  if (points.length === 2) {
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`
  }
  const knot = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    return Math.pow(d, PATH_CATMULL_ALPHA)
  }
  const EPS = 1e-6
  let d = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!
    const p2 = points[i + 1]!
    // At the first/last segment, fall back to the endpoint as its own neighbour.
    // That makes t01 (or t23) zero, and the cubic naturally degenerates to a
    // straight-tangent start/end with c1 = p1 + (p2 - p1)/3.
    const p0 = i === 0 ? p1 : points[i - 1]!
    const p3 = i + 2 < points.length ? points[i + 2]! : p2
    const t01 = knot(p0, p1)
    const t12 = knot(p1, p2)
    const t23 = knot(p2, p3)
    // Avoid division by zero when consecutive anchors coincide.
    const denomStart = Math.max(t01 + t12, EPS)
    const denomEnd = Math.max(t12 + t23, EPS)
    const k1 = t12 / (3 * denomStart)
    const k2 = t12 / (3 * denomEnd)
    const c1x = p1.x + (p2.x - p0.x) * k1
    const c1y = p1.y + (p2.y - p0.y) * k1
    const c2x = p2.x - (p3.x - p1.x) * k2
    const c2y = p2.y - (p3.y - p1.y) * k2
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function renderPaths() {
  if (!pathLayer) return
  pathLayer.clear()

  // Saved trails. The visible dashed stroke is always pointer-events: none so
  // it never intercepts clicks meant for the hex underneath. A wide invisible
  // hit-test stroke is added only when we're actually in path+erase mode, so
  // trails don't block painting in other modes.
  const trails = props.map.paths
  const allowTrailErase =
    props.editable && props.activeMode === 'path' && props.eraseMode
  if (trails && trails.length > 0) {
    for (const trail of trails) {
      if (!trail.points || trail.points.length < 2) continue
      const d = catmullRomPath(trail.points)
      const g = pathLayer.group()
      g.attr('data-trail-id', trail.id)
      if (allowTrailErase) {
        const hit = g.path(d).fill('none').stroke({
          color: 'transparent',
          width: PATH_TRAIL_HIT_WIDTH,
          linecap: 'round',
          linejoin: 'round',
        })
        hit.attr('class', 'trail-hit')
        hit.attr('pointer-events', 'stroke')
        g.node.style.cursor = 'pointer'
      }
      const visible = g.path(d).fill('none').stroke({
        color: PATH_TRAIL_COLOR,
        width: PATH_TRAIL_WIDTH,
        linecap: 'round',
        linejoin: 'round',
        dasharray: PATH_TRAIL_DASH,
      })
      visible.attr('pointer-events', 'none')
    }
  }

  // In-progress draft: render the smoothed curve through current anchors plus a
  // ghost segment to the cursor (only follows real mouse movement — touch taps
  // bypass mousemove on most browsers, so this stays inert on mobile) and the
  // visible anchor dots so the user can see what they've placed.
  const draft = props.pathDraft ?? []
  if (props.editable && props.activeMode === 'path' && draft.length > 0) {
    const ghostPoints = lastPathCursorPos
      ? [...draft, lastPathCursorPos]
      : draft
    if (ghostPoints.length >= 2) {
      const d = catmullRomPath(ghostPoints)
      const draftPath = pathLayer.path(d).fill('none').stroke({
        color: PATH_TRAIL_COLOR,
        width: PATH_TRAIL_WIDTH,
        linecap: 'round',
        linejoin: 'round',
        dasharray: PATH_TRAIL_DASH,
      })
      draftPath.attr('pointer-events', 'none')
      draftPath.node.style.opacity = '0.85'
    }
    for (const pt of draft) {
      const dot = pathLayer.circle(PATH_ANCHOR_RADIUS * 2).move(pt.x - PATH_ANCHOR_RADIUS, pt.y - PATH_ANCHOR_RADIUS)
      dot.fill(PATH_TRAIL_COLOR)
      dot.attr('pointer-events', 'none')
    }
  }
}

// Find the edge key of the hex side closest to a point inside (or near) the hex.
function nearestEdgeKey(hex: CustomHex, point: { x: number; y: number }): string | null {
  let bestKey: string | null = null
  let bestDist = Infinity
  for (let i = 0; i < 6; i++) {
    const a = hex.corners[i]!
    const b = hex.corners[(i + 1) % 6]!
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = point.x - mx
    const dy = point.y - my
    const d = dx * dx + dy * dy
    if (d < bestDist) {
      bestDist = d
      bestKey = edgeKeyFromCorners(a, b)
    }
  }
  return bestKey
}

function hexAtPoint(point: { x: number; y: number }): CustomHex | null {
  const g = grid.value
  if (!g) return null
  const found = g.pointToHex(point)
  if (!found) return null
  return hexLookup.get(`${found.q},${found.r}`) ?? null
}

function renderEdgeGhostAt(svgX: number, svgY: number) {
  if (!ghostLayer) return
  ghostLayer.clear()
  currentHexGhostKey = null
  lastPoiGhostPos = null
  if (!props.editable || props.activeMode !== 'edge') { lastEdgeGhostKey = null; return }
  const hex = hexAtPoint({ x: svgX, y: svgY })
  if (!hex) { lastEdgeGhostKey = null; return }
  const key = nearestEdgeKey(hex, { x: svgX, y: svgY })
  if (!key) { lastEdgeGhostKey = null; return }
  drawEdgeStroke(ghostLayer, key, { opacity: 0.5 })
  lastEdgeGhostKey = key
}

function renderFreePois() {
  if (!poiLayer) return
  poiLayer.clear()
  const pois = props.map.freePois
  if (!pois || !pois.length) return
  const { width: hexW, height: hexH } = getHexBoundsSize()
  const adapter = activeAdapter.value
  for (const poi of pois) {
    const url = adapter.overlayUrl('poi', poi.index)
    const { w, h } = poiStampSize(url, hexW, hexH)
    const img = poiLayer
      .image(url)
      .size(w, h)
      .move(poi.x - w / 2, poi.y - h / 2)
    img.node.setAttribute('data-poi-id', poi.id)
    img.node.setAttribute('class', 'free-poi')
    // Only the erase tool needs to hit-test POIs; bounding-box catches clicks on
    // transparent pixels too. In every other mode POIs must stay pointer-transparent
    // so they don't sit above the hexes and steal hover/paint events — otherwise the
    // tile ghost lags behind on hexes crowded with stamps.
    const erasable = props.editable && props.activePoiErase
    img.node.setAttribute('pointer-events', erasable ? 'bounding-box' : 'none')
    if (erasable) img.node.style.cursor = 'pointer'
  }
}

function renderNotes() {
  if (!notesLayer) return
  notesLayer.clear()
  const notes = props.map.notes ?? []
  const draft = props.noteDraft
  if (!notes.length && !draft) return

  const { height: hexH } = getHexBoundsSize()
  // Pin height ≈ half a hex; width follows the asset's aspect. The tip is the
  // bottom-centre of the art, so anchor there on the note point.
  const h = Math.max(12, hexH * 0.5)
  const w = h * NOTE_PIN_ASPECT
  const interactive = notesInteractive.value
  const showTitle = props.activeMode === 'notes'

  const drawPin = (
    x: number,
    y: number,
    opts: { id?: string; title?: string; ghost?: boolean },
  ) => {
    const img = notesLayer!.image(NOTE_PIN_URL).size(w, h).move(x - w / 2, y - h)

    const node = img.node
    node.setAttribute('class', 'note-pin')
    if (opts.id) node.setAttribute('data-note-id', opts.id)
    // Ghost pins (draft, or any pin while a painting tool is active) are dimmed
    // and let clicks pass through to the hex below.
    const dimmed = opts.ghost || !interactive
    node.style.opacity = dimmed ? '0.5' : '1'
    node.setAttribute('pointer-events', !opts.ghost && interactive ? 'bounding-box' : 'none')
    if (!opts.ghost && interactive) node.style.cursor = 'pointer'
    // Native hover tooltip with the title, only while the Notes tool is active.
    if (showTitle && opts.title) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      t.textContent = opts.title
      node.appendChild(t)
    }
  }

  for (const note of notes) {
    drawPin(note.x, note.y, { id: note.id, title: note.title?.trim() || undefined })
  }
  if (draft) drawPin(draft.x, draft.y, { ghost: true })
}

function svgPointFromEvent(svgEl: SVGSVGElement, e: MouseEvent): { x: number; y: number } | null {
  const pt = svgEl.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const ctm = svgEl.getScreenCTM()
  if (!ctm) return null
  const local = pt.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

function attachSvgPointerHandlers() {
  if (!drawInstance) return
  const svgEl = drawInstance.node as SVGSVGElement
  drawInstance.node.onmousemove = (e: MouseEvent) => {
    if (!props.editable) return
    const isPoiMode = props.activeMode === 'overlay' && props.activeOverlay?.category === 'poi'
    if (!isPoiMode && props.activeMode !== 'edge' && props.activeMode !== 'path') return
    const local = svgPointFromEvent(svgEl, e)
    if (!local) return
    if (isPoiMode) renderPoiGhostAt(local.x, local.y)
    else if (props.activeMode === 'edge') renderEdgeGhostAt(local.x, local.y)
    else if (props.activeMode === 'path') {
      lastPathCursorPos = { x: local.x, y: local.y }
      renderPaths()
    }
  }
  drawInstance.node.onmouseleave = () => {
    clearGhost()
    if (props.activeMode === 'path') {
      lastPathCursorPos = null
      renderPaths()
    }
  }
  drawInstance.node.onmousedown = (e: MouseEvent) => {
    // Note pins are clickable to open even in view mode (read-only), so handle
    // them before the editable guard. Ghosted pins have pointer-events: none,
    // so the hit-test only matches when pins are interactive.
    if (notesInteractive.value) {
      const target = e.target as Element | null
      const hit = target?.closest?.('.note-pin') as Element | null
      const id = hit?.getAttribute('data-note-id')
      if (id) {
        e.preventDefault()
        e.stopPropagation()
        emit('openNote', id)
        return
      }
    }

    if (!props.editable) return

    // Notes tool: clicking empty space drops a draft pin at that point.
    if (props.activeMode === 'notes') {
      const local = svgPointFromEvent(svgEl, e)
      if (!local) return
      e.preventDefault()
      e.stopPropagation()
      emit('placeNote', local.x, local.y)
      return
    }

    if (props.activeMode === 'edge') {
      const local = svgPointFromEvent(svgEl, e)
      if (!local) return
      const hex = hexAtPoint(local)
      if (!hex) return
      const key = nearestEdgeKey(hex, local)
      if (!key) return
      e.preventDefault()
      e.stopPropagation()
      emit('toggleEdge', key)
      return
    }

    if (props.activeMode === 'path') {
      // Erase + path: clicking on a saved trail removes it. Empty-space clicks
      // in erase mode are a no-op (don't drop anchors while erasing).
      if (props.eraseMode) {
        const target = e.target as Element | null
        const hit = target?.closest?.('[data-trail-id]') as Element | null
        const id = hit?.getAttribute('data-trail-id')
        if (id) {
          e.preventDefault()
          e.stopPropagation()
          emit('removePath', id)
        }
        return
      }
      const local = svgPointFromEvent(svgEl, e)
      if (!local) return
      e.preventDefault()
      e.stopPropagation()
      emit('addPathAnchor', local.x, local.y)
      return
    }

    if (!props.activePoiMode) return

    // Erase: clicking a POI removes it; clicking empty space is a no-op.
    if (props.activePoiErase) {
      const target = e.target as Element | null
      const hit = target?.closest?.('.free-poi') as Element | null
      const id = hit?.getAttribute('data-poi-id')
      if (!id) return
      e.preventDefault()
      e.stopPropagation()
      emit('removePoi', id)
      return
    }
    // Place: convert screen coords to SVG user-space. Stacking on/near an
    // existing POI is allowed so the user can crowd them together.
    const local = svgPointFromEvent(svgEl, e)
    if (!local) return
    e.preventDefault()
    e.stopPropagation()
    emit('placePoi', local.x, local.y)
  }
}

function maybeMigrateLegacyPois() {
  if (migrationAttempted) return
  if (props.map.freePois !== undefined) return
  const overlays = props.map.overlays
  if (!overlays) return
  const migrated: FreePoi[] = []
  for (const [key, perHex] of Object.entries(overlays)) {
    const ids = perHex?.poi
    if (!ids || !ids.length) continue
    const hex = hexLookup.get(key)
    if (!hex) continue
    const c = centerOf(hex)
    for (const idx of ids) {
      migrated.push({ id: crypto.randomUUID(), index: idx, x: c.x, y: c.y })
    }
  }
  migrationAttempted = true
  if (migrated.length) emit('migratePois', migrated)
}

function diffAndUpdate() {
  if (!prevSnapshot) return
  const now = captureSnapshot()
  const changed = new Set<string>()

  const allKeys = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    new Set([...Object.keys(a), ...Object.keys(b)])

  for (const k of allKeys(prevSnapshot.overrides, now.overrides)) {
    if (prevSnapshot.overrides[k] !== now.overrides[k]) changed.add(k)
  }
  const asList = (v: number | number[] | undefined): number[] =>
    v === undefined ? [] : Array.isArray(v) ? v : [v]
  const sameList = (a: number | number[] | undefined, b: number | number[] | undefined) => {
    const al = asList(a)
    const bl = asList(b)
    if (al.length !== bl.length) return false
    for (let i = 0; i < al.length; i++) if (al[i] !== bl[i]) return false
    return true
  }
  const overlayCategories = activeAdapter.value.overlayCategories
  for (const k of allKeys(prevSnapshot.overlays, now.overlays)) {
    const a = prevSnapshot.overlays[k] ?? {}
    const b = now.overlays[k] ?? {}
    for (const cat of overlayCategories) {
      if (!sameList(a[cat], b[cat])) { changed.add(k); break }
    }
  }

  for (const key of changed) {
    const [qs, rs] = key.split(',')
    updateHex(Number(qs), Number(rs))
  }

  if (!sameFreePois(prevSnapshot.freePois, now.freePois)) renderFreePois()
  if (!sameEdges(prevSnapshot.edges, now.edges)) renderEdges()
  if (!samePaths(prevSnapshot.paths, now.paths)) renderPaths()
  if (!sameNotes(prevSnapshot.notes, now.notes)) renderNotes()

  prevSnapshot = now
}

function sameEdges(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function samePaths(
  a: { id: string; points: { x: number; y: number }[] }[],
  b: { id: string; points: { x: number; y: number }[] }[],
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]!
    const pb = b[i]!
    if (pa.id !== pb.id) return false
    if (pa.points.length !== pb.points.length) return false
    for (let j = 0; j < pa.points.length; j++) {
      if (pa.points[j]!.x !== pb.points[j]!.x || pa.points[j]!.y !== pb.points[j]!.y) return false
    }
  }
  return true
}

function sameNotes(a: Note[], b: Note[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const na = a[i]!
    const nb = b[i]!
    if (na.id !== nb.id || na.x !== nb.x || na.y !== nb.y || na.title !== nb.title || na.body !== nb.body) {
      return false
    }
  }
  return true
}

function sameFreePois(a: FreePoi[], b: FreePoi[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const pa = a[i]!
    const pb = b[i]!
    if (pa.id !== pb.id || pa.index !== pb.index || pa.x !== pb.x || pa.y !== pb.y) return false
  }
  return true
}

function stopPainting() {
  isPainting.value = false
  paintedThisDrag.clear()
}

function reshuffleHex(q: number, r: number) {
  const key = `${q},${r}`
  variantCache.delete(key)
  const hex = hexLookup.get(key)
  const group = hexGroups.get(key)
  if (!hex || !group) return
  const effectiveTerrain = effectiveTerrainFor(hex.q, hex.r)
  const terrainKey = getTerrainKeyByIndex(effectiveTerrain)
  const variantCount = TerrainVariants[terrainKey]?.files.length ?? 1
  const persisted = props.map.variantOverrides?.[key]
  // Pick a NEW index different from the persisted one (if multiple variants exist).
  let idx = Math.floor(Math.random() * variantCount)
  if (variantCount > 1 && persisted !== undefined) {
    let tries = 0
    while (idx === persisted && tries < 8) {
      idx = Math.floor(Math.random() * variantCount)
      tries++
    }
  }
  variantCache.set(key, { terrain: effectiveTerrain, variantIndex: idx })
  const newUrl = getTerrainVariantByIndex(effectiveTerrain, idx)
  const imgEl = group.node.querySelector('image.terrain-image') as SVGImageElement | null
  if (imgEl) {
    imgEl.setAttribute('href', newUrl)
    imgEl.setAttributeNS(XLINK_NS, 'href', newUrl)
  } else {
    updateHex(q, r)
  }
  queueVariantEmit(key, idx)
}

const XLINK_NS = 'http://www.w3.org/1999/xlink'

function getImageHref(img: SVGImageElement): string {
  return img.getAttributeNS(XLINK_NS, 'href') || img.getAttribute('href') || ''
}

async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url)
  // fetch() resolves (doesn't throw) on 404s, so a missing asset would silently
  // become a junk data URI and vanish from the export — guard explicitly.
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Worldhex tiles are 224×194 at 72 DPI; the matching 300-DPI WebP is ~933×808.
// To get ~150 effective DPI in the saved PNG we want each hex to render at
// roughly 224 × (150 / 72) ≈ 467 px wide.
const WORLDHEX_TARGET_PX_PER_HEX_150DPI = 467

function defaultExportWidth(): number {
  if (activeAdapter.value.id === 'worldhex') {
    return Math.max(2048, props.map.sizeW * WORLDHEX_TARGET_PX_PER_HEX_150DPI)
  }
  return 8192
}

async function getPngBlob(opts?: { width?: number; includePins?: boolean }): Promise<Blob> {
  if (!mapRef.value) throw new Error('Map not rendered yet')
  const original = mapRef.value.querySelector('svg')
  if (!original) throw new Error('SVG element not found')

  const vb = original.viewBox.baseVal
  const aspect = vb && vb.width > 0 ? vb.height / vb.width : 1
  const outW = Math.max(1, Math.round(opts?.width ?? defaultExportWidth()))
  const outH = Math.max(1, Math.round(outW * aspect))

  const svg = await getSvgString({ width: outW, height: outH, includePins: opts?.includePins })
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to acquire 2D canvas context')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, outW, outH)
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('Canvas toBlob failed')
    return blob
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

async function getSvgString(
  opts?: { width?: number; height?: number; includePins?: boolean },
): Promise<string> {
  if (!mapRef.value) throw new Error('Map not rendered yet')
  const original = mapRef.value.querySelector('svg')
  if (!original) throw new Error('SVG element not found')

  const clone = original.cloneNode(true) as SVGSVGElement

  // Note pins: drop the whole layer when hiding pins; otherwise keep the markers
  // but strip any <title> tooltips so the export shows pins, never note text.
  if (opts?.includePins === false) {
    clone.querySelector('.notes-layer')?.remove()
  } else {
    // Strip title tooltips (note text) and any transient draft pin (no id).
    clone.querySelectorAll('.notes-layer title').forEach((t) => t.remove())
    clone.querySelectorAll('.notes-layer .note-pin:not([data-note-id])').forEach((p) => p.remove())
  }

  const images = Array.from(clone.querySelectorAll('image'))

  // For worldhex exports, swap the 72-DPI PNG URLs to their 300-DPI WebP
  // counterparts so the saved PNG is crisp at ~150 effective DPI.
  const upgradeUrlForExport = (href: string): string => {
    if (activeAdapter.value.id !== 'worldhex') return href
    const worldhexPrefix = `${ASSET_BASE_URL}/worldhex/`
    if (!href.startsWith(worldhexPrefix)) return href
    // 72-DPI-only assets (walls, tower fort, etc.) have no 300-DPI WebP twin;
    // upgrading would point at a missing file and drop them from the export.
    const file = decodeURIComponent(href.split('/').pop() ?? '')
    if (isWorldhex72Only(file)) return href
    return href
      .replace(`${worldhexPrefix}Assets%20-%2072%20DPI`, `${worldhexPrefix}Assets%20-%20300%20DPI`)
      .replace(/\.png$/i, '.webp')
  }

  // Embed each image as a data URI, keyed by its on-screen href. Prefer the
  // 300-DPI upgrade, but if that asset is missing (no WebP twin yet, or the
  // 72-only list drifts) fall back to the 72-DPI source so it never vanishes.
  const uniqueHrefs = Array.from(new Set(images.map(getImageHref).filter(Boolean)))
  const dataUris = new Map<string, string>()
  await Promise.all(
    uniqueHrefs.map(async (href) => {
      const upgraded = upgradeUrlForExport(href)
      if (upgraded !== href) {
        const uri = await fetchAsDataUri(upgraded).catch(() => null)
        if (uri) {
          dataUris.set(href, uri)
          return
        }
        console.warn(`[export] no 300-DPI asset, exporting 72-DPI source: ${href}`)
      }
      const uri = await fetchAsDataUri(href).catch(() => null)
      if (uri) dataUris.set(href, uri)
      else console.warn(`[export] failed to embed image: ${href}`)
    })
  )

  images.forEach((img) => {
    const uri = dataUris.get(getImageHref(img))
    if (!uri) return
    img.setAttributeNS(XLINK_NS, 'href', uri)
    img.setAttribute('href', uri)
  })

  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', XLINK_NS)

  // Pin explicit pixel dimensions so the browser rasterises the SVG at the target
  // resolution rather than its on-screen size (which the canvas would then upscale).
  if (opts?.width) clone.setAttribute('width', String(opts.width))
  if (opts?.height) clone.setAttribute('height', String(opts.height))

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone)
}

watch(grid, async (newVal) => {
  if (!newVal) return
  await nextTick()
  render()
})

watch(
  [
    () => props.map.sizeW,
    () => props.map.sizeH,
    () => props.map.hexOrientation,
    () => props.map.defaultTerrain,
  ],
  () => regenerate(),
  { immediate: true }
)

watch(() => props.editable, () => render())

watch(
  [
    () => props.map.overrides,
    () => props.map.overlays,
    () => props.map.freePois,
    () => props.map.edges,
    () => props.map.paths,
    () => props.map.notes,
  ],
  () => diffAndUpdate(),
  { deep: true }
)

// In-progress draft anchors live outside the saved map; re-render the path
// layer whenever they change so the user sees the curve update as they tap.
watch(
  () => props.pathDraft,
  () => renderPaths(),
  { deep: true }
)

// The draft pin lives outside the saved map; re-render the notes layer when it
// appears or moves so the ghost marker tracks the click point.
watch(
  () => props.noteDraft,
  () => renderNotes(),
  { deep: true }
)

watch(() => props.map.id, () => { migrationAttempted = false })

watch(
  [
    () => props.activeMode,
    () => props.activeTerrain,
    () => props.activeOverlay,
    () => props.eraseMode,
    () => props.activePoiErase,
    () => props.editable,
  ],
  () => {
    // When the active mode changes, the kind of ghost being shown can change too
    // (hex, POI, edge). Clear and let the next mousemove redraw appropriately,
    // except for hex-style modes where the cursor still sits on a known hex.
    if (props.activeMode !== 'path') {
      lastPathCursorPos = null
    }
    // Path-mode visuals (anchor dots + draft curve) live on the path layer, not
    // ghostLayer, so re-render that whenever the mode changes.
    renderPaths()
    // Pin interactivity (ghosted vs clickable) and the hover tooltip depend on
    // the active mode and editable flag, so repaint the notes layer too.
    renderNotes()
    // POI pointer-events depend on whether the erase tool is active, so repaint
    // the POI layer when the mode/erase flag changes.
    renderFreePois()
    if (props.activeMode === 'terrain' || props.activeMode === 'overlay') {
      if (props.activeMode === 'overlay' && props.activeOverlay?.category === 'poi') {
        if (lastPoiGhostPos) renderPoiGhostAt(lastPoiGhostPos.x, lastPoiGhostPos.y)
        else clearGhost()
        return
      }
      if (currentHexGhostKey) {
        const hex = hexLookup.get(currentHexGhostKey)
        if (hex) renderHexGhost(hex)
        else clearGhost()
        return
      }
    }
    clearGhost()
  },
  { deep: true }
)

onMounted(() => {
  window.addEventListener('mouseup', stopPainting)
})

onBeforeUnmount(() => {
  window.removeEventListener('mouseup', stopPainting)
})

defineExpose({ regenerate, reshuffleHex, getPngBlob })
</script>

<template>
  <div class="map-container" @mouseleave="stopPainting">
    <div v-if="!grid" class="empty-state">
      <div class="text-center">
        <UIcon name="i-heroicons-map" class="w-16 h-16 mx-auto text-gray-400 mb-3" />
        <p class="text-gray-500">Generating map…</p>
      </div>
    </div>
    <div
      v-else
      ref="mapRef"
      class="map-wrapper"
      :style="{ width: `${(zoom ?? 1) * 100}%` }"
    >
      <div class="map" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.map-container {
  width: 100%;
  max-height: 80vh;
  overflow: auto;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 280px;
}

.map-wrapper {
  /* width set inline based on zoom; height follows SVG */
  margin: 0 auto;
}

svg {
  display: block;
  width: 100%;
  height: auto;
}
</style>
