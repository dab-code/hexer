<script setup lang="ts">
import { SVG } from '@svgdotjs/svg.js'
import { Grid, Orientation, rectangle } from 'honeycomb-grid'
import { createCustomHex, type CustomHex } from '~/classes/CustomHex'
import {
  TerrainTypes,
  TerrainVariants,
  getTerrainKeyByIndex,
  getTerrainVariantByIndex,
  packForOrientation,
  wrapIndex,
} from '~/utils/terrainGenerator'
import { packAdapterFor } from '~/packs'
import type { FreePoi, HexOverlays, SavedMap } from '~/types/map'
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
}>()

const BG_COLOR = '#e9e9e9'

// Free-POI stamps render at native dimensions × this scale. The factor matches
// worldhex hex-tile-art density (60 SVG units per ~116 source-pixel polygon).
// Constant lives here because only renderFreePois needs it; the hex tile
// placement math has moved to the Pack adapter (app/packs).
const WH_SCALE = 60 / 116
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

const emit = defineEmits<{
  hexClick: [hex: CustomHex]
  paint: [q: number, r: number]
  variantsPicked: [variants: Record<string, number>]
  placePoi: [x: number, y: number]
  removePoi: [id: string]
  migratePois: [pois: FreePoi[]]
  toggleEdge: [edgeKey: string]
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
let poiLayer: SvgGroup = null
let ghostLayer: SvgGroup = null
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
      // POI and edge modes are handled by SVG-level listeners — don't paint hexes underneath.
      if (props.activePoiMode || props.activeMode === 'edge') return
      e.preventDefault()
      isPainting.value = true
      paintedThisDrag.clear()
      paintedThisDrag.add(`${hex.q},${hex.r}`)
      emit('paint', hex.q, hex.r)
    }
    group.node.onmouseenter = () => {
      // Hover preview — POI and edge modes follow cursor via SVG-level mousemove instead.
      if (
        props.activeMode !== 'edge' &&
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
  poiLayer = null
  ghostLayer = null
  currentHexGhostKey = null
  lastPoiGhostPos = null
  lastEdgeGhostKey = null
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
  let w = hexW, h = hexH
  if (adapter.id === 'worldhex') {
    const native = ensureStampSize(url)
    if (native) { w = native.w * WH_SCALE; h = native.h * WH_SCALE }
    else { w = hexW * 0.5; h = hexH * 0.5 }
  }
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
    // Worldhex extras are small native-sized PNGs; size by their natural
    // dimensions scaled to match the worldhex tile-art density. hexes2 POIs
    // keep their existing hex-bounding-box size for back-compat.
    let w = hexW, h = hexH
    if (adapter.id === 'worldhex') {
      const native = ensureStampSize(url)
      if (native) {
        w = native.w * WH_SCALE
        h = native.h * WH_SCALE
      } else {
        // Until we know native size, render at a sensible default smaller than
        // hex bounds so the stamp isn't visually overwhelming on first paint.
        w = hexW * 0.5
        h = hexH * 0.5
      }
    }
    const img = poiLayer
      .image(url)
      .size(w, h)
      .move(poi.x - w / 2, poi.y - h / 2)
    img.node.setAttribute('data-poi-id', poi.id)
    img.node.setAttribute('class', 'free-poi')
    // bounding-box so transparent PNG pixels still register clicks for hit-testing
    img.node.setAttribute('pointer-events', 'bounding-box')
    if (props.editable) img.node.style.cursor = 'pointer'
  }
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
    if (!isPoiMode && props.activeMode !== 'edge') return
    const local = svgPointFromEvent(svgEl, e)
    if (!local) return
    if (isPoiMode) renderPoiGhostAt(local.x, local.y)
    else renderEdgeGhostAt(local.x, local.y)
  }
  drawInstance.node.onmouseleave = () => clearGhost()
  drawInstance.node.onmousedown = (e: MouseEvent) => {
    if (!props.editable) return

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

  prevSnapshot = now
}

function sameEdges(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
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

async function getPngBlob(targetWidth?: number): Promise<Blob> {
  if (!mapRef.value) throw new Error('Map not rendered yet')
  const original = mapRef.value.querySelector('svg')
  if (!original) throw new Error('SVG element not found')

  const vb = original.viewBox.baseVal
  const aspect = vb && vb.width > 0 ? vb.height / vb.width : 1
  const outW = Math.max(1, Math.round(targetWidth ?? defaultExportWidth()))
  const outH = Math.max(1, Math.round(outW * aspect))

  const svg = await getSvgString({ width: outW, height: outH })
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

async function getSvgString(opts?: { width?: number; height?: number }): Promise<string> {
  if (!mapRef.value) throw new Error('Map not rendered yet')
  const original = mapRef.value.querySelector('svg')
  if (!original) throw new Error('SVG element not found')

  const clone = original.cloneNode(true) as SVGSVGElement
  const images = Array.from(clone.querySelectorAll('image'))

  // For worldhex exports, swap the 72-DPI PNG URLs to their 300-DPI WebP
  // counterparts so the saved PNG is crisp at ~150 effective DPI.
  const upgradeUrlForExport = (href: string): string => {
    if (activeAdapter.value.id !== 'worldhex') return href
    if (!href.startsWith('/media/worldhex/')) return href
    return href
      .replace('/media/worldhex/Assets%20-%2072%20DPI', '/media/worldhex/Assets%20-%20300%20DPI')
      .replace(/\.png$/i, '.webp')
  }

  const exportHrefs = images.map((img) => upgradeUrlForExport(getImageHref(img)))
  const uniqueHrefs = Array.from(new Set(exportHrefs.filter(Boolean)))
  const dataUris = new Map<string, string>()
  await Promise.all(
    uniqueHrefs.map(async (href) => dataUris.set(href, await fetchAsDataUri(href)))
  )

  images.forEach((img, i) => {
    const exportHref = exportHrefs[i]!
    const uri = dataUris.get(exportHref)
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
  ],
  () => diffAndUpdate(),
  { deep: true }
)

watch(() => props.map.id, () => { migrationAttempted = false })

watch(
  [
    () => props.activeMode,
    () => props.activeTerrain,
    () => props.activeOverlay,
    () => props.eraseMode,
    () => props.editable,
  ],
  () => {
    // When the active mode changes, the kind of ghost being shown can change too
    // (hex, POI, edge). Clear and let the next mousemove redraw appropriately,
    // except for hex-style modes where the cursor still sits on a known hex.
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
