<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { list, remove, importFromJson } = useMaps()
const toast = useToast()

const showImport = ref(false)
const importText = ref('')

const createMenuItems = computed<DropdownMenuItem[]>(() => [
    { label: 'Import…', icon: 'i-heroicons-arrow-up-tray', onSelect: () => (showImport.value = true) },
])

function onImportFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
        importText.value = String(reader.result ?? '')
    }
    reader.readAsText(file)
}

function submitImport() {
    try {
        const imported = importFromJson(importText.value)
        toast.add({ title: 'Map imported', description: `"${imported.name}" added`, color: 'primary' })
        importText.value = ''
        showImport.value = false
    } catch (error: any) {
        toast.add({ title: 'Import failed', description: error?.message ?? 'Unknown error', color: 'error' })
    }
}

function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    remove(id)
    toast.add({ title: 'Map deleted', color: 'primary' })
}
</script>

<template>
    <UContainer class="py-8">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
            <h1 class="text-2xl sm:text-3xl font-bold">Your Worlds</h1>
            <div class="flex items-center gap-2">
                <UButton to="/maps/new" icon="i-heroicons-plus" size="lg" class="grow sm:grow-0 justify-center">
                    Create World
                </UButton>
                <UDropdownMenu :items="createMenuItems">
                    <UButton icon="i-heroicons-ellipsis-vertical" variant="soft" size="lg" aria-label="More options" />
                </UDropdownMenu>
            </div>
        </div>

        <div v-if="list.length === 0" class="text-center py-12">
            <UIcon name="i-heroicons-map" class="text-6xl text-gray-400 mb-4" />
            <h2 class="text-xl font-semibold mb-2">No worlds yet</h2>
            <p class="text-gray-500 mb-4">Create your first world to begin the adventure</p>
            <UButton to="/maps/new" size="lg">Create Your First World</UButton>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <UCard v-for="map in list" :key="map.id" class="hover:shadow-lg transition-shadow">
                <template #header>
                    <div class="flex justify-between items-start gap-2">
                        <ULink :to="`/maps/${map.id}`">
                            <h3 class="text-lg font-semibold">{{ map.name }}</h3>
                        </ULink>
                        <UButton
                            icon="i-heroicons-trash"
                            variant="ghost"
                            color="error"
                            size="xs"
                            @click="onDelete(map.id, map.name)"
                        />
                    </div>
                </template>

                <div class="text-sm text-gray-500">
                    Created {{ new Date(map.createdAt).toLocaleDateString() }}
                </div>
                <div class="text-xs text-gray-400 mt-1">
                    {{ map.sizeW }} × {{ map.sizeH }}
                </div>
                <ULink :to="`/maps/${map.id}`" class="mt-2 inline-block">Open</ULink>
            </UCard>
        </div>

        <UModal v-model:open="showImport" title="Import World">
            <template #body>
                <div class="space-y-3">
                    <p class="text-sm text-gray-500">Paste a Hexer map JSON or upload a .json file.</p>
                    <input type="file" accept="application/json" @change="onImportFileChange" />
                    <UTextarea v-model="importText" :rows="10" placeholder='{ "id": "...", "name": "..." }' class="w-full" />
                </div>
            </template>
            <template #footer>
                <div class="flex justify-end gap-2 w-full">
                    <UButton variant="ghost" @click="showImport = false">Cancel</UButton>
                    <UButton :disabled="!importText.trim()" @click="submitImport">Import</UButton>
                </div>
            </template>
        </UModal>
    </UContainer>
</template>
