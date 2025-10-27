<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const { client, userId, sessionUser } = useSupaUser()

const mapId = route.params.id as string

const { data: mapData, pending, error, refresh } = await useAsyncData(
  `map-${mapId}`,
  async () => {
    const { data, error } = await client
      .from('map_users')
      .select(`
        role,
        maps!inner (
          id,
          name,
          terrain_seed,
          poi_seed,
          player_q,
          player_r,
          size_w,
          size_h,
          hex_orientation,
          major_pois (
            id,
            name,
            q,
            r,
            type
          ),
          hexes (
            id,
            q,
            r,
            terrain,
            is_revealed,
            we_notes
          )
        )
      `)
      .eq('map_id', mapId)
      .eq('user_id', userId.value)
      .single()

    if (error) throw error

    return {
      map: {
        id: data.maps.id,
        name: data.maps.name,
        terrain_seed: data.maps.terrain_seed,
        poi_seed: data.maps.poi_seed,
        size_w: data.maps.size_w,
        size_h: data.maps.size_h,
        hex_orientation: data.maps.hex_orientation,
        player_q: data.maps.player_q,
        player_r: data.maps.player_r
      },
      role: data.role as 'world_engineer' | 'player',
      pois: data.maps.major_pois || [],
      revealedHexes: data.maps.hexes || []
    }
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
</script>

<template>
  <UContainer class="py-4">
    <div v-if="pending" class="flex justify-center items-center h-[calc(100vh-200px)]">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-6xl" />
    </div>

    <div v-else-if="mapData?.map">
      <div class="flex justify-between items-center mb-6">
        <div class="flex items-center gap-4">
          <UButton to="/maps" icon="i-heroicons-arrow-left" variant="ghost">
            Back
          </UButton>
          <div>
            <h1 class="text-2xl font-bold">{{ mapData.map.name }}</h1>
            <UBadge :color="mapData.role === 'world_engineer' ? 'primary' : 'green'" variant="soft">
              {{ mapData.role === 'world_engineer' ? 'World Engineer' : 'Player' }}
            </UBadge>
          </div>
        </div>

        <div v-if="mapData.role === 'world_engineer'" class="flex gap-2">
          <UButton icon="i-heroicons-map-pin" variant="soft">
            Add POI
          </UButton>
          <UButton icon="i-heroicons-users" variant="soft">
            Invite Players
          </UButton>
        </div>
      </div>

      <UCard class="min-h-[600px]">
        <div class="text-center py-12">
          <UIcon name="i-heroicons-map" class="text-6xl text-gray-400 mb-4" />
          <h2 class="text-xl font-semibold mb-2">Map Rendering Coming Soon</h2>
          <div class="text-sm text-gray-500 space-y-1">
            <p>Map ID: {{ mapData.map.id }}</p>
            <p>Terrain Seed: {{ mapData.map.terrain_seed }}</p>
            <p>POI Seed: {{ mapData.map.poi_seed }}</p>
            <p>Hex orientation: {{ mapData.map.hex_orientation }}</p>
            <p>Map size H: {{ mapData.map.size_h }}</p>
            <p>Map size H: {{ mapData.map.size_h }}</p>

            <p>Player Token: ({{ mapData.map.player_q }}, {{ mapData.map.player_r }})</p>
            <p>Major POIs: {{ mapData.pois.length }}</p>
            <p>Revealed Hexes: {{ mapData.revealedHexes.length }}</p>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>