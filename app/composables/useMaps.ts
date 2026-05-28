import { createSharedComposable, useDebounceFn, useLocalStorage } from '@vueuse/core'
import { type MapListEntry, type SavedMap, parseSavedMap } from '~/types/map'
import {
  createCloudMap,
  deleteCloudMap,
  fetchAllCloudMaps,
  updateCloudMap,
} from '~/composables/useCloudMaps'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const LOCAL_STORAGE_KEY = 'hexer:local-maps'
const LEGACY_STORAGE_KEY = 'hexer:maps'
const CLOUD_CACHE_KEY = 'hexer:cloud-cache'

// Move a pre-rename localStorage payload to the new key once. After this
// runs the user's existing local maps survive the rename without manual
// migration. Idempotent: if the new key already has data, the legacy entry
// is just dropped.
function migrateLegacyLocalKey(): void {
  if (typeof localStorage === 'undefined') return
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (legacy === null) return
  if (localStorage.getItem(LOCAL_STORAGE_KEY) === null) {
    localStorage.setItem(LOCAL_STORAGE_KEY, legacy)
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY)
}

function readLocal(raw: string): SavedMap[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(parseSavedMap).filter((m): m is SavedMap => m !== null)
  } catch {
    return []
  }
}

export const useMaps = createSharedComposable(() => {
  migrateLegacyLocalKey()

  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const { dek } = useEncryptionKey()

  // Local maps: existing behavior, just under a renamed key.
  const localMaps = useLocalStorage<SavedMap[]>(LOCAL_STORAGE_KEY, [], {
    serializer: {
      read: readLocal,
      write: (value) => JSON.stringify(value),
    },
  })

  // Cloud maps: warm cache in localStorage (plaintext, cleared on logout),
  // refreshed from the network whenever user+DEK become available.
  const cloudCache = useLocalStorage<SavedMap[]>(CLOUD_CACHE_KEY, [], {
    serializer: {
      read: readLocal,
      write: (value) => JSON.stringify(value),
    },
  })
  const cloudMaps = ref<SavedMap[]>(cloudCache.value)

  async function getAccessToken(): Promise<string | null> {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) return null
    return data.session.access_token
  }

  async function refreshCloud(): Promise<void> {
    if (!user.value || !dek.value) {
      cloudMaps.value = []
      cloudCache.value = []
      return
    }
    const token = await getAccessToken()
    if (!token) return
    try {
      const fetched = await fetchAllCloudMaps(token, dek.value)
      cloudMaps.value = fetched
      cloudCache.value = fetched
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[useMaps] cloud refresh failed', error)
    }
  }

  // Re-fetch whenever the user or DEK changes (login / logout / new tab
  // restore). { immediate: true } catches the initial app-load case where
  // both refs may already be populated by the time this composable runs.
  watch([user, dek], () => { void refreshCloud() }, { immediate: true })

  const list = computed<MapListEntry[]>(() => {
    const merged: MapListEntry[] = [
      ...localMaps.value.map(m => ({ ...m, source: 'local' as const })),
      ...cloudMaps.value.map(m => ({ ...m, source: 'cloud' as const })),
    ]
    return merged.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  })

  const get = (id: string): MapListEntry | undefined =>
    list.value.find(m => m.id === id)

  function stripSource(entry: MapListEntry): SavedMap {
    const { source: _source, ...rest } = entry
    return rest as SavedMap
  }

  // Async because cloud writes need a real network round-trip before we let
  // the caller navigate away (the editor that opens next will lookup the
  // map by id). For local-destination writes, resolves immediately.
  async function add(
    map: SavedMap,
    opts?: { destination?: 'auto' | 'local' | 'cloud' },
  ): Promise<void> {
    const dest = opts?.destination ?? 'auto'
    const goCloud = dest === 'cloud'
      || (dest === 'auto' && Boolean(user.value && dek.value))

    if (goCloud) {
      const token = await getAccessToken()
      if (!token || !user.value || !dek.value) {
        throw new Error('Not authenticated for cloud write')
      }
      await createCloudMap(token, dek.value, map)
      cloudMaps.value = [...cloudMaps.value, map]
      cloudCache.value = cloudMaps.value
    } else {
      localMaps.value = [...localMaps.value, map]
    }
  }

  // Per-map save status drives the SaveStatus pill in the editor header.
  // Map id → status; entries are added lazily on first cloud update.
  const saveStatusByMap = ref<Record<string, SaveStatus>>({})

  // Latest pending SavedMap per id, picked up by the debounced flusher when
  // it fires. A burst of edits → one PATCH at the end carrying the final
  // shape.
  const pendingByMap = new Map<string, SavedMap>()

  // One debounced flusher per id. Kept in a Map so cross-map edits don't
  // share a single timer.
  const flushersByMap = new Map<string, () => void>()

  function setStatus(id: string, status: SaveStatus): void {
    saveStatusByMap.value = { ...saveStatusByMap.value, [id]: status }
  }

  function ensureFlusher(id: string): () => void {
    const cached = flushersByMap.get(id)
    if (cached) return cached
    const flush = useDebounceFn(async () => {
      const next = pendingByMap.get(id)
      if (!next) return
      pendingByMap.delete(id)
      setStatus(id, 'saving')
      try {
        const token = await getAccessToken()
        if (!token || !dek.value) throw new Error('Not authenticated')
        await updateCloudMap(token, dek.value, next)
        setStatus(id, 'saved')
        // Fade back to idle after a moment unless new edits land in the
        // meantime (they'd flip status back to 'dirty' first).
        setTimeout(() => {
          if (saveStatusByMap.value[id] === 'saved' && !pendingByMap.has(id)) {
            setStatus(id, 'idle')
          }
        }, 1500)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[useMaps] cloud save failed', error)
        setStatus(id, 'error')
      }
    }, 1000)
    flushersByMap.set(id, flush)
    return flush
  }

  function getSaveStatus(id: string): SaveStatus {
    return saveStatusByMap.value[id] ?? 'idle'
  }

  // Sync from caller's POV: state is updated immediately. Cloud writes are
  // debounced ~1s so a burst of paint clicks coalesces into one PATCH.
  function update(id: string, mutator: (map: SavedMap) => SavedMap): void {
    const entry = get(id)
    if (!entry) return
    const next = mutator(stripSource(entry))
    if (entry.source === 'cloud') {
      cloudMaps.value = cloudMaps.value.map(m => m.id === id ? next : m)
      cloudCache.value = cloudMaps.value
      pendingByMap.set(id, next)
      setStatus(id, 'dirty')
      ensureFlusher(id)()
    } else {
      localMaps.value = localMaps.value.map(m => m.id === id ? next : m)
    }
  }

  // Async because cloud delete must succeed before we clear local cache;
  // otherwise the row reappears on next refresh.
  async function remove(id: string): Promise<void> {
    const entry = get(id)
    if (!entry) return
    if (entry.source === 'cloud') {
      const token = await getAccessToken()
      if (!token) throw new Error('Not authenticated')
      await deleteCloudMap(token, id)
      cloudMaps.value = cloudMaps.value.filter(m => m.id !== id)
      cloudCache.value = cloudMaps.value
    } else {
      localMaps.value = localMaps.value.filter(m => m.id !== id)
    }
  }

  function exportToJson(id: string): string {
    const entry = get(id)
    if (!entry) throw new Error(`Map ${id} not found`)
    return JSON.stringify(stripSource(entry), null, 2)
  }

  // Imports always land as local maps. The user can promote them to the
  // cloud via the "Upload to cloud" button (Task 3B).
  function importFromJson(text: string): SavedMap {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Not valid JSON')
    }
    const result = parseSavedMap(parsed)
    if (!result) throw new Error('JSON is not a valid Hexer map')
    const imported: SavedMap = {
      ...result,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    localMaps.value = [...localMaps.value, imported]
    return imported
  }

  function clearCloudCache(): void {
    cloudMaps.value = []
    cloudCache.value = []
  }

  // Promote a local map to the cloud. The map's UUID is preserved, so any
  // currently-open editor keeps working — only its `source` discriminator
  // flips. Idempotent: if the row already exists (409 unique-violation), we
  // treat it as success and drop the local copy.
  async function uploadToCloud(id: string): Promise<void> {
    const localEntry = localMaps.value.find(m => m.id === id)
    if (!localEntry) throw new Error(`Local map ${id} not found`)
    if (!user.value || !dek.value) throw new Error('Not authenticated')

    const token = await getAccessToken()
    if (!token) throw new Error('Not authenticated')

    try {
      await createCloudMap(token, dek.value, localEntry)
    } catch (error) {
      // 409 conflict on the primary key means the row already exists in the
      // cloud — likely from a previous upload attempt that got the row in
      // but failed to delete the local copy. Treat as success.
      const message = error instanceof Error ? error.message : String(error)
      const isConflict = message.includes('(409)') || message.includes('duplicate key')
      if (!isConflict) throw error
    }

    cloudMaps.value = [...cloudMaps.value, localEntry]
    cloudCache.value = cloudMaps.value
    localMaps.value = localMaps.value.filter(m => m.id !== id)
  }

  return {
    list,
    get,
    add,
    update,
    remove,
    exportToJson,
    importFromJson,
    refreshCloud,
    clearCloudCache,
    uploadToCloud,
    getSaveStatus,
  }
})

export default useMaps
