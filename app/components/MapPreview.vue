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

const props = defineProps<{
  map: SavedMap
  editable?: boolean
  zoom?: number
  activePoiMode?: boolean
  activePoiErase?: boolean
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
}>()

const MAX_MAP_WIDTH = 600
const MAX_MAP_HEIGHT = 600
const SVG_PADDING = 2

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
let poiLayer: SvgGroup = null
let hexBoundsSize: { width: number; height: number } | null = null
let migrationAttempted = false
const hexGroups = new Map<string, SvgGroup>()
const hexLookup = new Map<string, CustomHex>()
const hexClipIds = new Map<string, string>()

type Snapshot = {
  overrides: Record<string, TerrainTypes>
  overlays: Record<string, HexOverlays>
  freePois: FreePoi[]
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
      // POI mode is handled by the SVG-level listener; don't paint hexes underneath.
      if (props.activePoiMode) return
      e.preventDefault()
      isPainting.value = true
      paintedThisDrag.clear()
      paintedThisDrag.add(`${hex.q},${hex.r}`)
      emit('paint', hex.q, hex.r)
    }
    group.node.onmouseenter = () => {
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
  poiLayer = null
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

  poiLayer = drawInstance.group()
  renderFreePois()

  prevSnapshot = captureSnapshot()
  maybeMigrateLegacyPois()
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

function attachSvgPointerHandlers() {
  if (!drawInstance) return
  drawInstance.node.onmousedown = (e: MouseEvent) => {
    if (!props.editable || !props.activePoiMode) return

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
    const svgEl = drawInstance.node as SVGSVGElement
    const pt = svgEl.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svgEl.getScreenCTM()
    if (!ctm) return
    const local = pt.matrixTransform(ctm.inverse())
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

  prevSnapshot = now
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
  ],
  () => diffAndUpdate(),
  { deep: true }
)

watch(() => props.map.id, () => { migrationAttempted = false })

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
