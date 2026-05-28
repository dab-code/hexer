<script setup lang="ts">
import { reactive } from 'vue'
import { z } from 'zod'
import type { FormSubmitEvent } from '#ui/types'
import { Orientation } from 'honeycomb-grid'
import { DefaultTerrainForPack, packForOrientation } from '~/utils/terrainGenerator'
import type { ManualMap } from '~/types/map'

const schema = z.object({
  mapName: z.string({ error: 'Name is required' }).min(3, 'Must be at least 3 characters'),
  hexOrientation: z.literal([Orientation.FLAT, Orientation.POINTY], { error: 'Please select an orientation' }),
  sizeW: z.number({ error: 'Must be between 5 and 50' }).gte(5).lte(50),
  sizeH: z.number({ error: 'Must be between 5 and 50' }).gte(5).lte(50),
})

type Schema = z.output<typeof schema>

const ORIENTATION_OPTIONS = [Orientation.FLAT, Orientation.POINTY]

const state = reactive({
  mapName: undefined,
  hexOrientation: Orientation.POINTY,
  sizeW: 10,
  sizeH: 10,
})

const toast = useToast()
const router = useRouter()
const { add } = useMaps()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    const map: ManualMap = {
      id: crypto.randomUUID(),
      kind: 'manual',
      name: event.data.mapName,
      createdAt: new Date().toISOString(),
      sizeW: event.data.sizeW,
      sizeH: event.data.sizeH,
      hexOrientation: event.data.hexOrientation,
      defaultTerrain: DefaultTerrainForPack[packForOrientation(event.data.hexOrientation)],
      overrides: {},
    }

    await add(map)

    toast.add({
      title: 'Manual world created',
      description: `"${map.name}" is ready to build`,
      color: 'primary',
    })

    router.push(`/maps/${map.id}`)
  } catch (error: any) {
    console.error('Error creating manual map:', error)
    toast.add({
      title: 'Error creating map',
      description: error?.message || 'An unexpected error occurred',
      color: 'error',
    })
  }
}
</script>

<template>
  <UCard class="w-full max-w-md mx-auto">
    <template #header>
      <h2 class="text-2xl font-bold">Build a New World by Hand</h2>
      <p class="text-sm text-gray-500 mt-1">Start from a sea of nothing. Paint hexes after saving.</p>
    </template>

    <UForm :schema="schema" :state="state" class="space-y-6" @submit="onSubmit">
      <UFormField label="World Name" name="mapName" required>
        <UInput v-model="state.mapName" placeholder="The Empty Realm" />
      </UFormField>

      <UFormField label="Hex Orientation" name="hexOrientation" required>
        <USelect v-model="state.hexOrientation" :items="ORIENTATION_OPTIONS" />
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Width" name="sizeW" required>
          <UInputNumber v-model="state.sizeW" :min="5" :max="50" />
        </UFormField>

        <UFormField label="Height" name="sizeH" required>
          <UInputNumber v-model="state.sizeH" :min="5" :max="50" />
        </UFormField>
      </div>

      <UButton type="submit" label="Create & Start Building" color="primary" size="lg" block />
    </UForm>
  </UCard>
</template>
