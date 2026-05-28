// End-to-end encryption primitives for hexer maps.
//
// The threat model: Supabase storage / DB admins / a stolen disk image must
// see only ciphertext. The user's password (or recovery code) is the sole
// route to decryption.
//
// Design:
//   - KDF: PBKDF2-SHA-256, 600 000 iterations (OWASP 2023 recommendation),
//     16-byte salt stored in user_keys.
//   - Cipher: AES-256-GCM with random 12-byte IV per record (96-bit IVs are
//     the GCM-recommended size).
//   - DEK: a random 256-bit data key generated at signup, wrapped twice:
//     once by the password-derived KEK, once by the recovery-code-derived
//     KEK. Password change = re-wrap the DEK only; existing map rows do not
//     re-encrypt.
//
// All inputs/outputs at the boundary are Uint8Array (raw bytes). Use the
// base64 helpers to convert to/from PostgREST-friendly strings.

const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12
const DEK_BITS = 256

// Crockford base32: omits I, L, O, U to avoid visual ambiguity in printouts
// and confusion with 1/0. 32 symbols × 24 chars ≈ 120 bits of entropy.
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_LENGTH = 24

/** Random 16-byte salt for PBKDF2. Stored alongside the wrapped DEK. */
export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES))
}

/** Random 12-byte IV for AES-GCM. One per encryption operation. */
export function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_BYTES))
}

/**
 * Derive an AES-256 wrap key from a passphrase + salt via PBKDF2-SHA-256.
 * Used for both passwords and recovery codes — both go through the same KDF
 * so the resulting KEK has identical strength regardless of source.
 */
export async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

/** Generate a fresh random DEK (256-bit AES-GCM, extractable so it can be wrapped). */
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: DEK_BITS },
    true,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Wrap (encrypt) the DEK with a KEK. Returns ciphertext + IV; both are needed
 * to unwrap. The wrapped output is opaque bytes that can be stored in a bytea
 * column or base64-encoded for JSON transport.
 */
export async function wrapKey(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<{ ct: Uint8Array, iv: Uint8Array }> {
  const iv = randomIv()
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  })
  return { ct: new Uint8Array(wrapped), iv }
}

/**
 * Unwrap a DEK previously produced by wrapKey(). Default returns an
 * extractable key so it can be exported into sessionStorage for same-tab
 * reload persistence (see useEncryptionKey). Pass `extractable=false` if you
 * really need a sealed key for a single operation.
 */
export async function unwrapKey(
  wrapped: Uint8Array,
  iv: Uint8Array,
  kek: CryptoKey,
  extractable = true,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped as BufferSource,
    kek,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: DEK_BITS },
    extractable,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypt a UTF-8 string under the DEK. Returns ciphertext + IV. */
export async function encryptString(
  s: string,
  dek: CryptoKey,
): Promise<{ ct: Uint8Array, iv: Uint8Array }> {
  const iv = randomIv()
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    new TextEncoder().encode(s),
  )
  return { ct: new Uint8Array(ct), iv }
}

export async function decryptString(
  ct: Uint8Array,
  iv: Uint8Array,
  dek: CryptoKey,
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    ct as BufferSource,
  )
  return new TextDecoder().decode(pt)
}

/** JSON.stringify + encryptString. Returns ciphertext + IV. */
export async function encryptJson(
  value: unknown,
  dek: CryptoKey,
): Promise<{ ct: Uint8Array, iv: Uint8Array }> {
  return encryptString(JSON.stringify(value), dek)
}

export async function decryptJson<T = unknown>(
  ct: Uint8Array,
  iv: Uint8Array,
  dek: CryptoKey,
): Promise<T> {
  return JSON.parse(await decryptString(ct, iv, dek)) as T
}

/**
 * Generate a 24-character Crockford base32 recovery code. Exposed to the user
 * exactly once at signup; the user is responsible for storing it. Combined
 * with the per-user salt it has ~120 bits of entropy.
 */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_LENGTH))
  let out = ''
  for (let i = 0; i < RECOVERY_LENGTH; i++) {
    // Map each random byte into the 32-symbol alphabet by masking the low 5
    // bits. The remaining bits are discarded — slight statistical bias is
    // immaterial compared to the symbol entropy itself.
    out += RECOVERY_ALPHABET[bytes[i]! & 0x1f]
  }
  return out
}

/**
 * Normalize a user-entered recovery code: strip whitespace + dashes, upper-
 * case, and map a few common transcription substitutions (1→1, l/I→1,
 * O→0, U→V). Throws if the cleaned string isn't RECOVERY_LENGTH chars from
 * the Crockford alphabet.
 */
export function parseRecoveryCode(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')
  if (cleaned.length !== RECOVERY_LENGTH) {
    throw new Error(`Recovery code must be ${RECOVERY_LENGTH} characters`)
  }
  for (const c of cleaned) {
    if (!RECOVERY_ALPHABET.includes(c)) {
      throw new Error(`Recovery code contains invalid character: ${c}`)
    }
  }
  return cleaned
}

// =============================================================================
// Base64 helpers for PostgREST transport. Supabase serializes bytea columns
// to/from "\\x..." hex by default — we'd rather work with base64 because it
// halves the on-the-wire size compared to hex. The Supabase JS client passes
// bytea through as Uint8Array when using the supabase-js v2 helper format,
// but PostgREST itself returns base64 when columns are typed as bytea via
// the REST API. We standardize on base64 strings as the wire format and
// convert at the edge.
// =============================================================================

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
