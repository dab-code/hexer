// Raw-fetch wrapper around the encrypted /rest/v1/maps endpoint. We bypass
// supabase.from('maps').*() to avoid the storage-adapter JWT drop that the
// @nuxtjs/supabase v2 + @supabase/ssr combination exhibits in dev mode (see
// useEncryptionKey.createAndStoreKeys for the original incident). Every
// call takes the access_token explicitly so there's no hidden auth state.
//
// All encrypt/decrypt happens here so useMaps() above can stay
// crypto-unaware.

import {
  base64ToBytes,
  bytesToBase64,
  decryptJson,
  encryptJson,
  encryptString,
} from '~/utils/crypto'
import type { MapEnvelope, SavedMap } from '~/types/map'

interface SupabaseConfig { url: string, key: string }

function cfg(): SupabaseConfig {
  return useRuntimeConfig().public.supabase as SupabaseConfig
}

function authHeaders(accessToken: string): HeadersInit {
  const { key } = cfg()
  return {
    apikey: key,
    Authorization: `Bearer ${accessToken}`,
  }
}

// Pull the user id out of the access token's `sub` claim. Using this rather
// than useSupabaseUser().value.id guarantees user_id = auth.uid() at the
// RLS-check layer, even if the reactive user ref hasn't been hydrated yet.
function userIdFromToken(accessToken: string): string {
  const payload = JSON.parse(atob(accessToken.split('.')[1] ?? ''))
  const sub = payload?.sub
  if (typeof sub !== 'string') throw new Error('Access token missing sub claim')
  return sub
}

async function encryptForRow(map: SavedMap, dek: CryptoKey): Promise<{
  name_ct: string, name_iv: string, data_ct: string, data_iv: string,
}> {
  const [nameCt, dataCt] = await Promise.all([
    encryptString(map.name, dek),
    encryptJson(map, dek),
  ])
  return {
    name_ct: bytesToBase64(nameCt.ct),
    name_iv: bytesToBase64(nameCt.iv),
    data_ct: bytesToBase64(dataCt.ct),
    data_iv: bytesToBase64(dataCt.iv),
  }
}

async function decryptRow(row: MapEnvelope, dek: CryptoKey): Promise<SavedMap> {
  // We only need the data payload; the name lives inside `data` too. We could
  // skip decrypting `name_ct` for free, but it's a cheap sanity check.
  const data = await decryptJson<SavedMap>(
    base64ToBytes(row.data_ct),
    base64ToBytes(row.data_iv),
    dek,
  )
  return data
}

export async function fetchAllCloudMaps(
  accessToken: string,
  dek: CryptoKey,
): Promise<SavedMap[]> {
  const { url } = cfg()
  const r = await fetch(
    `${url}/rest/v1/maps?select=id,name_ct,name_iv,data_ct,data_iv,created_at,updated_at&order=updated_at.desc`,
    { headers: authHeaders(accessToken) },
  )
  if (!r.ok) throw new Error(`cloud fetch failed (${r.status}): ${await r.text()}`)
  const rows = await r.json() as MapEnvelope[]
  const maps = await Promise.all(rows.map(row => decryptRow(row, dek)))
  return maps
}

export async function createCloudMap(
  accessToken: string,
  dek: CryptoKey,
  map: SavedMap,
): Promise<void> {
  const { url } = cfg()
  const userId = userIdFromToken(accessToken)
  const encrypted = await encryptForRow(map, dek)
  const r = await fetch(`${url}/rest/v1/maps`, {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      id: map.id,
      user_id: userId,
      created_at: map.createdAt,
      ...encrypted,
    }),
  })
  if (!r.ok) throw new Error(`cloud insert failed (${r.status}): ${await r.text()}`)
}

export async function updateCloudMap(
  accessToken: string,
  dek: CryptoKey,
  map: SavedMap,
): Promise<void> {
  const { url } = cfg()
  const encrypted = await encryptForRow(map, dek)
  const r = await fetch(
    `${url}/rest/v1/maps?id=eq.${encodeURIComponent(map.id)}`,
    {
      method: 'PATCH',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        ...encrypted,
        updated_at: new Date().toISOString(),
      }),
    },
  )
  if (!r.ok) throw new Error(`cloud update failed (${r.status}): ${await r.text()}`)
}

export async function deleteCloudMap(
  accessToken: string,
  id: string,
): Promise<void> {
  const { url } = cfg()
  const r = await fetch(
    `${url}/rest/v1/maps?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: authHeaders(accessToken) },
  )
  if (!r.ok) throw new Error(`cloud delete failed (${r.status}): ${await r.text()}`)
}
