<script setup lang="ts">
definePageMeta({
    middleware: 'auth'
})

const { client, userId, sessionUser } = useSupaUser()

interface MapWithRole {
    id: string
    map_name: string
    created_at: string
    role: 'world_engineer' | 'player'
}

// Use a single useAsyncData call without duplicate watches
const { data: maps, pending, error, refresh } = await useAsyncData(
    'user-maps',
    async () => {
        const { data, error } = await client
            .from('map_users')
            .select(`
                role,
                maps!inner (
                    id,
                    name,
                    created_at
                )
            `)
            .eq('user_id', userId.value)

        if (error) {
            console.error('Error fetching user maps:', error)
            return []
        }

        const mappedData = (data || []).map(item => ({
            id: item.maps.id,
            map_name: item.maps.name,
            created_at: item.maps.created_at,
            role: item.role
        })) as MapWithRole[]

        return mappedData.sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
    },
    {
        immediate: false,
        lazy: true
    }
)

watch(sessionUser, (newVal) => {
    if (newVal) refresh()
}, {
    immediate: true
})

const getRoleBadge = (role: string) => {
    return role === 'world_engineer'
        ? { label: 'Engineer', color: 'primary' as const }
        : { label: 'Player', color: 'green' as const }
}
</script>

<template>
    <UContainer class="py-8">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-3xl font-bold">Your Worlds</h1>
            <UButton to="/maps/new" icon="i-heroicons-plus" size="lg">
                Create World
            </UButton>
        </div>

        <div v-if="pending" class="flex justify-center py-12">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl" />
        </div>

        <div v-else-if="error" class="text-center py-12">
            <p class="text-red-500">Failed to load maps</p>
            <small>
                <pre>{{ error }}</pre>
            </small>
            <UButton @click="refresh" class="mt-4">Retry</UButton>
        </div>

        <div v-else-if="!maps || maps.length === 0" class="text-center py-12">
            <UIcon name="i-heroicons-map" class="text-6xl text-gray-400 mb-4" />
            <h2 class="text-xl font-semibold mb-2">No worlds yet</h2>
            <p class="text-gray-500 mb-4">Create your first world to begin the adventure</p>
            <UButton to="/maps/new" size="lg">Create Your First World</UButton>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <UCard v-for="map in maps" :key="map.id" class="hover:shadow-lg transition-shadow cursor-pointer">
                <template #header>
                    <div class="flex justify-between items-start">
                        <ULink :to="`/maps/${map.id}`">
                            <h3 class="text-lg font-semibold">{{ map.map_name }}</h3>
                        </ULink>
                        <UBadge :color="getRoleBadge(map.role).color" variant="soft">
                            {{ getRoleBadge(map.role).label }}
                        </UBadge>
                    </div>
                </template>

                <div class="text-sm text-gray-500">
                    Created {{ new Date(map.created_at).toLocaleDateString() }}
                </div>
                <ULink :to="`/maps/${map.id}`">Enter</ULink>
            </UCard>
        </div>
    </UContainer>
</template>