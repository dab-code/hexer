<script setup lang="ts">
import { TerrainTypes } from '~/utils/terrainGenerator'
import { downloadBlob, sanitizeFilename } from '~/utils/download'
import type { FreePoi, ManualMap, HexOverlays } from '~/types/map'
import type { OverlaySelection } from '~/components/OverlayPalette.vue'
import type { PaintMode } from '~/components/PaintToolbar.vue'
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
const activeTerrain = ref<TerrainTypes>(TerrainTypes.Grass)
const activeOverlay = ref<OverlaySelection>({ category: 'river', index: 0 })

const previewRef = ref<{
    reshuffleHex: (q: number, r: number) => void
    getPngBlob: (targetWidth?: number) => Promise<Blob>
} | null>(null)

const activePoiMode = computed(() => mode.value === 'overlay' && activeOverlay.value?.category === 'poi')
const activePoiErase = computed(() => activePoiMode.value && activeOverlay.value !== null && 'erase' in activeOverlay.value)

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

    if ('erase' in sel) {
        if (currentList.length === 0) return
    }

    update(map.value.id, (m): ManualMap => {
        const overlays = { ...(m.overlays ?? {}) }
        const prevAtKey = (overlays[key] ?? {}) as Record<string, number | number[] | undefined>
        const next: HexOverlays = {}
        for (const c of ['river', 'path', 'poi'] as const) {
            const v = prevAtKey[c]
            if (v === undefined || v === null) continue
            next[c] = Array.isArray(v) ? [...v] : [v]
        }
        if ('erase' in sel) {
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
    if (!sel || sel.category !== 'poi' || 'erase' in sel) return
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
    <UContainer class="py-4 !max-w-none">
        <div v-if="!map" class="text-center py-12">
            <UIcon name="i-heroicons-exclamation-triangle" class="text-6xl text-gray-400 mb-4" />
            <h2 class="text-xl font-semibold mb-2">Map not found</h2>
            <p class="text-gray-500 mb-4">No map with id <code>{{ mapId }}</code> exists in this browser.</p>
            <UButton to="/maps">Back to Worlds</UButton>
        </div>

        <div v-else>
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6">
                <div class="flex items-center gap-3 min-w-0">
                    <UButton to="/maps" icon="i-heroicons-arrow-left" variant="ghost" size="sm">
                        <span class="hidden sm:inline">Back</span>
                    </UButton>
                    <div class="min-w-0">
                        <h1 class="text-xl sm:text-2xl font-bold truncate">{{ map.name }}</h1>
                    </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
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
            </div>

            <UCard :ui="{ body: 'p-0' }">
                <div v-if="isEditing" class="p-3 sm:p-4">
                    <PaintToolbar
                        v-model:mode="mode"
                        v-model:active-terrain="activeTerrain"
                        v-model:active-overlay="activeOverlay"
                        v-model:zoom="zoom"
                    />
                </div>

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
            </UCard>
        </div>
    </UContainer>
</template>
