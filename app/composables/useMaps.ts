import { createSharedComposable, useLocalStorage } from '@vueuse/core'
import { type SavedMap, parseSavedMap } from '~/types/map'

const STORAGE_KEY = 'hexer:maps'

export const useMaps = createSharedComposable(() => {
  const maps = useLocalStorage<SavedMap[]>(STORAGE_KEY, [], {
    serializer: {
      read: (raw) => {
        try {
          const parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return []
          return parsed.map(parseSavedMap).filter((m): m is SavedMap => m !== null)
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
    const result = parseSavedMap(parsed)
    if (!result) {
      throw new Error('JSON is not a valid Hexer map')
    }
    const imported: SavedMap = {
      ...result,
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
