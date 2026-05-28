<script setup lang="ts">
import { base64ToBytes, deriveKek, unwrapKey } from '~/utils/crypto'

useHead({ title: 'Log in' })

const supabase = useSupabaseClient()
const { setDek, createAndStoreKeys } = useEncryptionKey()
const toast = useToast()
const route = useRoute()

const email = ref('')
const password = ref('')
const submitting = ref(false)

const canSubmit = computed(
  () => email.value.includes('@') && password.value.length > 0 && !submitting.value,
)

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.error_description === 'string') return obj.error_description
    if (typeof obj.error === 'string') return obj.error
  }
  return 'Unknown error'
}

async function onSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  let signedIn = false
  try {
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    })
    if (signInError) throw signInError
    signedIn = true
    const userId = authData.user?.id
    const accessToken = authData.session?.access_token
    if (!userId) throw new Error('Login did not return a user id')
    if (!accessToken) throw new Error('Login did not return a session')

    // Use raw fetch with the access_token from the auth response. See note
    // in useEncryptionKey.createAndStoreKeys() — the wrapped client's
    // session storage adapter has been observed to drop the JWT in dev,
    // which makes RLS treat us as anonymous.
    const cfg = useRuntimeConfig().public.supabase as { url: string, key: string }
    const keyRes = await fetch(
      `${cfg.url}/rest/v1/user_keys?select=salt,kdf_iterations,wrapped_dek_password,wrapped_dek_password_iv&user_id=eq.${userId}`,
      { headers: { apikey: cfg.key, Authorization: `Bearer ${accessToken}` } },
    )
    if (!keyRes.ok) throw new Error(`user_keys fetch failed (${keyRes.status}): ${await keyRes.text()}`)
    const rows = await keyRes.json() as Array<{
      salt: string
      kdf_iterations: number
      wrapped_dek_password: string
      wrapped_dek_password_iv: string
    }>
    const keyRow = rows[0]

    if (!keyRow) {
      // Self-repair: previous signup created auth.users but failed before
      // inserting user_keys. Run the key-creation step now and show the
      // recovery code to the user so they don't lose it.
      await createAndStoreKeys(accessToken, userId, password.value)
      toast.add({
        title: 'Account setup completed',
        description: 'Your encryption keys are now stored. Save the recovery code shown next.',
        color: 'warning',
      })
      await navigateTo('/signup/recovery-code')
      return
    }

    const salt = base64ToBytes(keyRow.salt)
    const iv = base64ToBytes(keyRow.wrapped_dek_password_iv)
    const ct = base64ToBytes(keyRow.wrapped_dek_password)

    const kek = await deriveKek(password.value, salt, keyRow.kdf_iterations)
    const dek = await unwrapKey(ct, iv, kek)

    await setDek(dek)
    // eslint-disable-next-line no-console
    console.log('[login] setDek done', { userId })

    const next = typeof route.query.next === 'string' ? route.query.next : '/maps'
    await navigateTo(next)
  } catch (error) {
    // Full error to console for debugging; toast gets the extracted message.
    // eslint-disable-next-line no-console
    console.error('[login] failed', error)
    const message = errorMessage(error)
    const looksLikeDecryptFail = /OperationError|decrypt|key bundle/i.test(message)
    toast.add({
      title: 'Login failed',
      description: looksLikeDecryptFail ? 'Wrong password (or your key bundle is missing).' : message,
      color: 'error',
    })
    // If we signed in but the post-login step failed, sign back out so the
    // auth state matches the (lack of) usable DEK.
    if (signedIn) {
      try { await supabase.auth.signOut() } catch { /* ignore */ }
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UContainer class="py-12 max-w-md">
    <h1 class="text-2xl font-bold mb-6">Log in</h1>

    <form class="space-y-4" @submit.prevent="onSubmit">
      <UFormField label="Email" required>
        <UInput
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="w-full"
        />
      </UFormField>

      <UFormField label="Password" required>
        <UInput
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="w-full"
        />
      </UFormField>

      <UButton
        type="submit"
        :loading="submitting"
        :disabled="!canSubmit"
        block
        size="lg"
      >
        Log in
      </UButton>
    </form>

    <p class="text-sm text-gray-500 mt-6 text-center">
      No account yet?
      <ULink to="/signup" class="font-medium">Sign up</ULink>
    </p>
  </UContainer>
</template>
