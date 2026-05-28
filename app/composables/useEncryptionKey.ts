import { createSharedComposable } from '@vueuse/core'
import {
  base64ToBytes,
  bytesToBase64,
  deriveKek,
  generateDek,
  generateRecoveryCode,
  randomSalt,
  wrapKey,
} from '~/utils/crypto'

const RECOVERY_CODE_SESSION_KEY = 'hexer:signup-recovery-code'

// Holds the unwrapped Data Encryption Key (DEK) for the current session.
//
// Caching strategy: same-tab reloads must NOT re-prompt for the password, so
// we cache the DEK's raw bytes in sessionStorage. This means the in-session
// DEK is held as an extractable CryptoKey. Within a single browser tab,
// "extractable" doesn't add a meaningful boundary — any JS running in the
// page already has the same access as our own code. The relevant boundary
// is the server / disk-at-rest one, and that is enforced by storing only
// ciphertext on Supabase. The tradeoff: a browser-extension or XSS attack
// against the running tab could exfiltrate the DEK from sessionStorage.

const DEK_SESSION_KEY = 'hexer:dek'

export const useEncryptionKey = createSharedComposable(() => {
  // shallowRef so Vue's reactivity proxy doesn't wrap the opaque CryptoKey.
  const dek = shallowRef<CryptoKey | null>(null)
  const isLoaded = computed(() => dek.value !== null)

  async function setDek(newDek: CryptoKey): Promise<void> {
    if (!newDek.extractable) {
      throw new Error('setDek requires an extractable CryptoKey for caching')
    }
    dek.value = newDek
    const raw = await crypto.subtle.exportKey('raw', newDek)
    sessionStorage.setItem(DEK_SESSION_KEY, bytesToBase64(new Uint8Array(raw)))
  }

  async function restoreFromSession(): Promise<boolean> {
    if (dek.value) return true
    const cached = typeof sessionStorage === 'undefined'
      ? null
      : sessionStorage.getItem(DEK_SESSION_KEY)
    if (!cached) return false
    try {
      const bytes = base64ToBytes(cached)
      const restored = await crypto.subtle.importKey(
        'raw',
        bytes as BufferSource,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      )
      dek.value = restored
      return true
    } catch {
      sessionStorage.removeItem(DEK_SESSION_KEY)
      return false
    }
  }

  function clear(): void {
    dek.value = null
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(DEK_SESSION_KEY)
    }
  }

  /**
   * Generate a fresh DEK + recovery code for a user, wrap both, INSERT a row
   * into user_keys, cache the unwrapped DEK in session, and stash the
   * recovery code so /signup/recovery-code can display it once.
   *
   * We use raw fetch with an explicit Authorization header rather than
   * supabase.from('user_keys').insert(). The @nuxtjs/supabase v2 client (via
   * @supabase/ssr's cookie storage adapter) has been observed to drop the
   * JWT on the next request in dev mode, leading to RLS violations because
   * auth.uid() resolves to null. Passing the access_token directly is the
   * least-magical reliable path.
   */
  async function createAndStoreKeys(
    accessToken: string,
    userId: string,
    password: string,
  ): Promise<{ recoveryCode: string }> {
    const salt = randomSalt()
    const dekKey = await generateDek()
    const recoveryCode = generateRecoveryCode()

    const [passwordKek, recoveryKek] = await Promise.all([
      deriveKek(password, salt),
      deriveKek(recoveryCode, salt),
    ])
    const [passwordWrap, recoveryWrap] = await Promise.all([
      wrapKey(dekKey, passwordKek),
      wrapKey(dekKey, recoveryKek),
    ])

    const cfg = useRuntimeConfig().public.supabase as { url: string, key: string }
    const r = await fetch(`${cfg.url}/rest/v1/user_keys`, {
      method: 'POST',
      headers: {
        'apikey': cfg.key,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        salt: bytesToBase64(salt),
        kdf_iterations: 600_000,
        wrapped_dek_password: bytesToBase64(passwordWrap.ct),
        wrapped_dek_password_iv: bytesToBase64(passwordWrap.iv),
        wrapped_dek_recovery: bytesToBase64(recoveryWrap.ct),
        wrapped_dek_recovery_iv: bytesToBase64(recoveryWrap.iv),
      }),
    })
    if (!r.ok) {
      const body = await r.text()
      throw new Error(`user_keys insert failed (${r.status}): ${body}`)
    }

    await setDek(dekKey)
    sessionStorage.setItem(RECOVERY_CODE_SESSION_KEY, recoveryCode)
    return { recoveryCode }
  }

  return { dek, isLoaded, setDek, restoreFromSession, clear, createAndStoreKeys }
})

export default useEncryptionKey
