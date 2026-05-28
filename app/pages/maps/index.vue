<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { list, remove, importFromJson, uploadToCloud } = useMaps()
const user = useSupabaseUser()
const toast = useToast()

const showImport = ref(false)
const importText = ref('')
const uploadingIds = ref(new Set<string>())

// Banner: nudge anonymous users with local maps to log in for cloud backup.
// Disappears as soon as they sign in (or once they have no local maps).
const hasLocalMaps = computed(() => list.value.some(m => m.source === 'local'))
const showBackupNudge = computed(() => !user.value && hasLocalMaps.value)

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

async function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    try {
        await remove(id)
        toast.add({ title: 'Map deleted', color: 'primary' })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        toast.add({ title: 'Delete failed', description: message, color: 'error' })
    }
}

async function onUpload(id: string, name: string) {
    uploadingIds.value = new Set([...uploadingIds.value, id])
    try {
        await uploadToCloud(id)
        toast.add({
            title: 'Uploaded to cloud',
            description: `"${name}" is now end-to-end encrypted in your account`,
            color: 'primary',
        })
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[upload] failed', error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        toast.add({ title: 'Upload failed', description: message, color: 'error' })
    } finally {
        const next = new Set(uploadingIds.value)
        next.delete(id)
        uploadingIds.value = next
    }
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

        <UAlert
            v-if="showBackupNudge"
            icon="i-heroicons-cloud-arrow-up"
            color="primary"
            variant="subtle"
            title="Back these up to your account"
            class="mb-4"
        >
            <template #description>
                <span>
                    Your worlds are saved on this device only. Log in to encrypt them and sync to your account.
                </span>
            </template>
            <template #actions>
                <UButton to="/login" size="sm" color="primary">Sign in</UButton>
                <UButton to="/signup" size="sm" color="primary" variant="ghost">Sign up</UButton>
            </template>
        </UAlert>

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
                        <ULink :to="`/maps/${map.id}`" class="min-w-0">
                            <h3 class="text-lg font-semibold truncate">{{ map.name }}</h3>
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

                <div class="flex items-center gap-2 mb-1">
                    <UBadge
                        v-if="map.source === 'local'"
                        color="neutral"
                        variant="subtle"
                        size="xs"
                        icon="i-heroicons-computer-desktop"
                    >
                        Local
                    </UBadge>
                    <UBadge
                        v-else
                        color="primary"
                        variant="subtle"
                        size="xs"
                        icon="i-heroicons-cloud"
                    >
                        Cloud
                    </UBadge>
                </div>
                <div class="text-sm text-gray-500">
                    Created {{ new Date(map.createdAt).toLocaleDateString() }}
                </div>
                <div class="text-xs text-gray-400 mt-1">
                    {{ map.sizeW }} × {{ map.sizeH }}
                </div>
                <div class="mt-2 flex items-center justify-between gap-2">
                    <ULink :to="`/maps/${map.id}`">Open</ULink>
                    <UButton
                        v-if="map.source === 'local' && user"
                        icon="i-heroicons-cloud-arrow-up"
                        variant="soft"
                        size="xs"
                        :loading="uploadingIds.has(map.id)"
                        :disabled="uploadingIds.has(map.id)"
                        @click="onUpload(map.id, map.name)"
                    >
                        Upload to cloud
                    </UButton>
                </div>
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
