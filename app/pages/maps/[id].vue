<script setup lang="ts">
import { TerrainTypes, packForOrientation, DefaultTerrainForPack, OverlayCategoriesForPack } from '~/utils/terrainGenerator'
import { downloadBlob, sanitizeFilename } from '~/utils/download'
import type { FreePoi, ManualMap, HexOverlays } from '~/types/map'
import type { OverlaySelection } from '~/components/OverlayPalette.vue'
import type { PaintMode } from '~/components/EditorSidebar.vue'
import type { DropdownMenuItem } from '@nuxt/ui'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { get, remove, update, exportToJson } = useMaps()

const mapId = route.params.id as string
const map = computed(() => get(mapId))

const isEditing = ref(true)
const zoom = ref(1)
const mode = ref<PaintMode>('terrain')
const eraseMode = ref(false)
const sidebarCollapsed = ref(false)
const sheetState = ref<'closed' | 'peek' | 'expanded'>('closed')
const mapPack = computed(() => map.value ? packForOrientation(map.value.hexOrientation) : 'hexes2')
const activeTerrain = ref<TerrainTypes>(TerrainTypes.Grass)
const activeOverlay = ref<OverlaySelection>({ category: 'river', index: 0 })

watch(mapPack, (pack) => {
    activeTerrain.value = DefaultTerrainForPack[pack]
}, { immediate: true })

const previewRef = ref<{
    reshuffleHex: (q: number, r: number) => void
    getPngBlob: (targetWidth?: number) => Promise<Blob>
} | null>(null)

const activePoiMode = computed(() =>
    mode.value === 'overlay' && activeOverlay.value?.category === 'poi'
)
const activePoiErase = computed(() => activePoiMode.value && eraseMode.value)

function downloadJson() {
    if (!map.value) return
    const json = exportToJson(map.value.id)
    downloadBlob(new Blob([json], { type: 'application/json' }), `${sanitizeFilename(map.value.name)}.hexer.json`)
}

async function downloadPng() {
    if (!map.value || !previewRef.value) return
    try {
        const blob = await previewRef.value.getPngBlob()
        downloadBlob(blob, `${sanitizeFilename(map.value.name)}.png`)
    } catch (error: any) {
        toast.add({ title: 'PNG export failed', description: error?.message, color: 'error' })
    }
}

async function copyJson() {
    if (!map.value) return
    try {
        await navigator.clipboard.writeText(exportToJson(map.value.id))
        toast.add({ title: 'JSON copied to clipboard', color: 'primary' })
    } catch (error: any) {
        toast.add({ title: 'Copy failed', description: error?.message, color: 'error' })
    }
}

function onDelete() {
    if (!map.value) return
    if (!confirm(`Delete "${map.value.name}"? This cannot be undone.`)) return
    remove(map.value.id)
    router.push('/maps')
}

function paintTerrain(q: number, r: number) {
    if (!map.value) return
    const key = `${q},${r}`

    if (eraseMode.value) {
        if (!(key in map.value.overrides)) return
        update(map.value.id, (m): ManualMap => {
            const overrides = { ...m.overrides }
            delete overrides[key]
            const variantOverrides = { ...(m.variantOverrides ?? {}) }
            delete variantOverrides[key]
            return { ...m, overrides, variantOverrides }
        })
        return
    }

    const current = map.value.overrides[key] ?? map.value.defaultTerrain
    if (current === activeTerrain.value) {
        previewRef.value?.reshuffleHex(q, r)
        return
    }
    update(map.value.id, (m): ManualMap => {
        const variantOverrides = { ...(m.variantOverrides ?? {}) }
        delete variantOverrides[key]
        return {
            ...m,
            overrides: { ...m.overrides, [key]: activeTerrain.value },
            variantOverrides,
        }
    })
}

function toOverlayList(v: number | number[] | undefined): number[] {
    if (v === undefined || v === null) return []
    return Array.isArray(v) ? [...v] : [v]
}

function paintOverlay(q: number, r: number) {
    if (!map.value) return
    const sel = activeOverlay.value
    if (!sel) return
    // POIs are placed free-form via placePoi/removePoi, not by hex.
    if (sel.category === 'poi') return
    const key = `${q},${r}`
    const currentForHex: HexOverlays = map.value.overlays?.[key] ?? {}
    const currentList = toOverlayList(currentForHex[sel.category] as number | number[] | undefined)

    if (eraseMode.value && currentList.length === 0) return

    update(map.value.id, (m): ManualMap => {
        const overlays = { ...(m.overlays ?? {}) }
        const prevAtKey = (overlays[key] ?? {}) as Record<string, number | number[] | undefined>
        const next: HexOverlays = {}
        for (const c of OverlayCategoriesForPack[mapPack.value]) {
            const v = prevAtKey[c]
            if (v === undefined || v === null) continue
            next[c] = Array.isArray(v) ? [...v] : [v]
        }
        if (eraseMode.value) {
            delete next[sel.category]
        } else {
            const existing = next[sel.category] ?? []
            const i = existing.indexOf(sel.index)
            const updated = i >= 0
                ? existing.filter((_, idx) => idx !== i)
                : [...existing, sel.index]
            if (updated.length === 0) delete next[sel.category]
            else next[sel.category] = updated
        }
        if (Object.keys(next).length === 0) {
            delete overlays[key]
        } else {
            overlays[key] = next
        }
        return { ...m, overlays }
    })
}

function onPaint(q: number, r: number) {
    if (mode.value === 'overlay') {
        paintOverlay(q, r)
    } else {
        paintTerrain(q, r)
    }
}

function placePoi(x: number, y: number) {
    if (!map.value) return
    const sel = activeOverlay.value
    if (!sel || sel.category !== 'poi' || eraseMode.value) return
    const poi: FreePoi = { id: crypto.randomUUID(), index: sel.index, x, y }
    update(map.value.id, (m): ManualMap => ({
        ...m,
        freePois: [...(m.freePois ?? []), poi],
    }))
}

function removePoi(id: string) {
    if (!map.value) return
    update(map.value.id, (m): ManualMap => ({
        ...m,
        freePois: (m.freePois ?? []).filter((p) => p.id !== id),
    }))
}

function migratePois(pois: FreePoi[]) {
    if (!map.value || !pois.length) return
    update(map.value.id, (m): ManualMap => {
        const overlays = m.overlays
            ? Object.fromEntries(
                Object.entries(m.overlays)
                    .map(([k, v]) => {
                        const { poi: _drop, ...rest } = v as HexOverlays
                        void _drop
                        return [k, rest as HexOverlays] as const
                    })
                    .filter(([, v]) => Object.keys(v).length > 0)
            )
            : undefined
        return {
            ...m,
            freePois: [...(m.freePois ?? []), ...pois],
            overlays,
        }
    })
}

function onVariantsPicked(variants: Record<string, number>) {
    if (!map.value) return
    update(map.value.id, (m): ManualMap => {
        const next = { ...(m.variantOverrides ?? {}) }
        let changed = false
        for (const [k, v] of Object.entries(variants)) {
            if (next[k] !== v) {
                next[k] = v
                changed = true
            }
        }
        if (!changed) return m
        return { ...m, variantOverrides: next }
    })
}

const actionMenuItems = computed<DropdownMenuItem[][]>(() => [
    [
        { label: 'Download PNG', icon: 'i-heroicons-photo', onSelect: downloadPng },
        { label: 'Download JSON', icon: 'i-heroicons-arrow-down-tray', onSelect: downloadJson },
        { label: 'Copy JSON', icon: 'i-heroicons-clipboard', onSelect: copyJson },
    ],
    [
        { label: 'Delete', icon: 'i-heroicons-trash', color: 'error', onSelect: onDelete },
    ],
])
</script>

<template>
    <div class="editor-page">
        <div v-if="!map" class="not-found">
            <UIcon name="i-heroicons-exclamation-triangle" class="text-6xl text-gray-400 mb-4" />
            <h2 class="text-xl font-semibold mb-2">Map not found</h2>
            <p class="text-gray-500 mb-4">No map with id <code>{{ mapId }}</code> exists in this browser.</p>
            <UButton to="/maps">Back to Worlds</UButton>
        </div>

        <template v-else>
            <header class="editor-topbar">
                <div class="left">
                    <UButton to="/maps" icon="i-heroicons-arrow-left" variant="ghost" size="sm">
                        <span class="hidden sm:inline">Back</span>
                    </UButton>
                    <h1 class="title">{{ map.name }}</h1>
                </div>
                <div class="right">
                    <UButton
                        :icon="isEditing ? 'i-heroicons-check' : 'i-heroicons-paint-brush'"
                        :color="isEditing ? 'primary' : 'neutral'"
                        :variant="isEditing ? 'solid' : 'soft'"
                        @click="isEditing = !isEditing"
                    >
                        {{ isEditing ? 'Done' : 'Edit' }}
                    </UButton>
                    <UDropdownMenu :items="actionMenuItems">
                        <UButton icon="i-heroicons-ellipsis-vertical" variant="soft" aria-label="More actions" />
                    </UDropdownMenu>
                </div>
            </header>

            <div class="editor-body">
                <EditorSidebar
                    v-if="isEditing"
                    v-model:tool="mode"
                    v-model:erase-mode="eraseMode"
                    v-model:active-terrain="activeTerrain"
                    v-model:active-overlay="activeOverlay"
                    v-model:collapsed="sidebarCollapsed"
                    v-model:sheet-state="sheetState"
                    :pack="mapPack"
                />

                <div class="canvas-stage" :class="`sheet-${sheetState}`">
                    <MapPreview
                        ref="previewRef"
                        :map="map"
                        :editable="isEditing"
                        :zoom="zoom"
                        :active-poi-mode="activePoiMode"
                        :active-poi-erase="activePoiErase"
                        @paint="onPaint"
                        @variants-picked="onVariantsPicked"
                        @place-poi="placePoi"
                        @remove-poi="removePoi"
                        @migrate-pois="migratePois"
                    />
                    <CanvasZoomControls v-if="isEditing" v-model="zoom" />
                </div>
            </div>
        </template>
    </div>
</template>

<style lang="scss" scoped>
.editor-page {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 64px); // header (UHeader) is ~64px
    min-height: 0;
}

.not-found {
    text-align: center;
    padding: 48px 24px;
}

.editor-topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    flex-shrink: 0;

    :where(html.dark) & {
        border-bottom-color: rgba(255, 255, 255, 0.08);
    }

    .left, .right {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .title {
        font-size: 1.125rem;
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }

    @media (min-width: 640px) {
        padding: 12px 24px;
        .title { font-size: 1.5rem; }
    }
}

.editor-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.canvas-stage {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    background: #fafafa;

    :where(html.dark) & {
        background: #14171d;
    }

    :deep(.map-container) {
        height: 100%;
        max-height: none;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
    }

    /* Prevent the flex container from shrinking the zoomed map back to fit. */
    :deep(.map-wrapper) {
        flex-shrink: 0;
    }

    /* On mobile, lift the zoom widget above the bottom sheet when it's open. */
    @media (max-width: 767px) {
        &.sheet-peek :deep(.zoom-widget) {
            bottom: calc(35vh + 12px);
        }
        &.sheet-expanded :deep(.zoom-widget) {
            display: none;
        }
    }
}
</style>
