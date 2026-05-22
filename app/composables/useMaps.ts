import { createSharedComposable, useLocalStorage } from '@vueuse/core'
import { Orientation } from 'honeycomb-grid'
import { z } from 'zod'
import { type SavedMap, normalizeSavedMap } from '~/types/map'

const STORAGE_KEY = 'hexer:maps'

const overlayCategorySchema = z.enum(['river', 'path', 'poi'])
const hexOverlaysSchema = z.record(overlayCategorySchema, z.array(z.number().int().min(0)))
const overlaysSchema = z.record(z.string(), hexOverlaysSchema).optional()

const freePoiSchema = z.object({
  id: z.string(),
  index: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
})
const freePoisSchema = z.array(freePoiSchema).optional()

const manualMapSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.string(),
  sizeW: z.number().int().positive(),
  sizeH: z.number().int().positive(),
  hexOrientation: z.enum([Orientation.FLAT, Orientation.POINTY]),
  overlays: overlaysSchema,
  freePois: freePoisSchema,
  variantOverrides: z.record(z.string(), z.number().int().min(0)).optional(),
  kind: z.literal('manual'),
  defaultTerrain: z.number().int().min(0).max(5),
  overrides: z.record(z.string(), z.number().int().min(0).max(5)),
})

export const useMaps = createSharedComposable(() => {
  const maps = useLocalStorage<SavedMap[]>(STORAGE_KEY, [], {
    serializer: {
      read: (raw) => {
        try {
          const parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return []
          return parsed.map(normalizeSavedMap).filter((m): m is SavedMap => m !== null)
        } catch {
          return []
        }
      },
      write: (value) => JSON.stringify(value),
    },
  })

  const list = computed(() =>
    [...maps.value].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  )

  const get = (id: string): SavedMap | undefined => maps.value.find((m) => m.id === id)

  const add = (map: SavedMap) => {
    maps.value = [...maps.value, map]
  }

  const remove = (id: string) => {
    maps.value = maps.value.filter((m) => m.id !== id)
  }

  const update = (id: string, mutator: (map: SavedMap) => SavedMap) => {
    maps.value = maps.value.map((m) => (m.id === id ? mutator(m) : m))
  }

  const exportToJson = (id: string): string => {
    const map = get(id)
    if (!map) throw new Error(`Map ${id} not found`)
    return JSON.stringify(map, null, 2)
  }

  const importFromJson = (text: string): SavedMap => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Not valid JSON')
    }
    const normalized = normalizeSavedMap(parsed)
    const result = manualMapSchema.safeParse(normalized)
    if (!result.success) {
      throw new Error('JSON is not a valid Hexer map')
    }
    const imported: SavedMap = {
      ...result.data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    add(imported)
    return imported
  }

  return {
    list,
    get,
    add,
    remove,
    update,
    exportToJson,
    importFromJson,
  }
})

export default useMaps
