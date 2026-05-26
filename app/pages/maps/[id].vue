<script setup lang="ts">
import { TerrainTypes, packForOrientation, DefaultTerrainForPack } from '~/utils/terrainGenerator'
import { downloadBlob, sanitizeFilename } from '~/utils/download'
import type { FreePoi } from '~/types/map'
import * as edits from '~/edits/mapEdits'
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

// Path tool: anchors collected so far for the in-progress trail, transient
// until the user hits "Finish". Lifted here so the sidebar's action buttons
// and the canvas-side click handlers share the same source of truth.
const pathDraft = ref<{ x: number; y: number }[]>([])

function addPathAnchor(x: number, y: number) {
    pathDraft.value = [...pathDraft.value, { x, y }]
}

function undoPathAnchor() {
    if (pathDraft.value.length === 0) return
    pathDraft.value = pathDraft.value.slice(0, -1)
}

function cancelPathDraft() {
    pathDraft.value = []
}

function finishPathDraft() {
    if (!map.value) return
    const pts = pathDraft.value
    if (pts.length < 2) return
    const id = crypto.randomUUID()
    update(map.value.id, (m) => edits.addPath(m, id, pts))
    pathDraft.value = []
}

function onRemovePath(id: string) {
    if (!map.value) return
    update(map.value.id, (m) => edits.removePath(m, id))
}

// Switching away from path mode discards an unfinished draft so it doesn't
// silently linger when the user revisits the tool.
watch(mode, (m, prev) => {
    if (prev === 'path' && m !== 'path' && pathDraft.value.length > 0) {
        pathDraft.value = []
    }
})

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

function onPaint(q: number, r: number) {
    if (!map.value) return
    if (mode.value === 'overlay') {
        const sel = activeOverlay.value
        if (!sel || sel.category === 'poi') return
        if (eraseMode.value) {
            update(map.value.id, (m) => edits.eraseOverlay(m, q, r, sel.category, mapPack.value))
        } else {
            update(map.value.id, (m) => edits.toggleOverlay(m, q, r, sel.category, sel.index, mapPack.value))
        }
        return
    }
    // Terrain mode.
    if (eraseMode.value) {
        update(map.value.id, (m) => edits.eraseTerrain(m, q, r))
        return
    }
    const current = map.value.overrides[`${q},${r}`] ?? map.value.defaultTerrain
    if (current === activeTerrain.value) {
        // Re-painting same terrain re-rolls the visual variant — UI-only.
        previewRef.value?.reshuffleHex(q, r)
        return
    }
    update(map.value.id, (m) => edits.paintTerrain(m, q, r, activeTerrain.value))
}

function placePoi(x: number, y: number) {
    if (!map.value) return
    const sel = activeOverlay.value
    if (!sel || sel.category !== 'poi' || eraseMode.value) return
    update(map.value.id, (m) => edits.placePoi(m, sel.index, x, y, crypto.randomUUID()))
}

function removePoi(id: string) {
    if (!map.value) return
    update(map.value.id, (m) => edits.removePoi(m, id))
}

function onToggleEdge(edgeKey: string) {
    if (!map.value) return
    if (eraseMode.value) {
        update(map.value.id, (m) => edits.eraseEdge(m, edgeKey))
    } else {
        update(map.value.id, (m) => edits.toggleEdge(m, edgeKey))
    }
}

function migratePois(pois: FreePoi[]) {
    if (!map.value) return
    update(map.value.id, (m) => edits.migrateLegacyPois(m, pois))
}

function onVariantsPicked(variants: Record<string, number>) {
    if (!map.value) return
    update(map.value.id, (m) => edits.recordVariants(m, variants))
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
                    :path-draft-anchor-count="pathDraft.length"
                    @finish-path="finishPathDraft"
                    @undo-path-anchor="undoPathAnchor"
                    @cancel-path="cancelPathDraft"
                />

                <div class="canvas-stage" :class="`sheet-${sheetState}`">
                    <MapPreview
                        ref="previewRef"
                        :map="map"
                        :editable="isEditing"
                        :zoom="zoom"
                        :active-poi-mode="activePoiMode"
                        :active-poi-erase="activePoiErase"
                        :active-mode="mode"
                        :active-terrain="activeTerrain"
                        :active-overlay="activeOverlay"
                        :erase-mode="eraseMode"
                        :path-draft="pathDraft"
                        @paint="onPaint"
                        @variants-picked="onVariantsPicked"
                        @place-poi="placePoi"
                        @remove-poi="removePoi"
                        @migrate-pois="migratePois"
                        @toggle-edge="onToggleEdge"
                        @add-path-anchor="addPathAnchor"
                        @remove-path="onRemovePath"
                    />
                    <CanvasZoomControls v-model="zoom" />
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
        align-items: safe center;
        justify-content: safe center;
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
