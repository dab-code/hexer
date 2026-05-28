<script setup lang="ts">
import { base64ToBytes, bytesToBase64, deriveKek, unwrapKey, wrapKey } from '~/utils/crypto'
import { scorePassword } from '~/utils/passwordStrength'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Account' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { setDek, clear: clearDek } = useEncryptionKey()
const { clearCloudCache } = useMaps()
const toast = useToast()

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
  }
  return 'Unknown error'
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Not authenticated')
  return data.session.access_token
}

// =============================================================================
// Change password
// =============================================================================

const currentPassword = ref('')
const newPassword = ref('')
const newPasswordConfirm = ref('')
const changingPassword = ref(false)

const newStrength = computed(() => scorePassword(newPassword.value))
const newMismatch = computed(
  () => newPasswordConfirm.value.length > 0 && newPassword.value !== newPasswordConfirm.value,
)
const canChangePassword = computed(() => {
  return currentPassword.value.length > 0
    && newStrength.value.acceptable
    && newPassword.value === newPasswordConfirm.value
    && !changingPassword.value
})

async function onChangePassword() {
  if (!canChangePassword.value) return
  changingPassword.value = true
  try {
    const accessToken = await getAccessToken()
    // Pull the canonical user id from the access token's sub claim — same
    // pattern as useCloudMaps. The reactive useSupabaseUser ref can be
    // momentarily out of sync after a fresh login.
    const userId = JSON.parse(atob(accessToken.split('.')[1] ?? '')).sub as string
    if (!userId) throw new Error('Access token missing sub claim')

    const cfg = useRuntimeConfig().public.supabase as { url: string, key: string }
    const fetchRes = await fetch(
      `${cfg.url}/rest/v1/user_keys?select=salt,kdf_iterations,wrapped_dek_password,wrapped_dek_password_iv&user_id=eq.${userId}`,
      { headers: { apikey: cfg.key, Authorization: `Bearer ${accessToken}` } },
    )
    if (!fetchRes.ok) throw new Error(`Key fetch failed: ${await fetchRes.text()}`)
    const rows = await fetchRes.json() as Array<{
      salt: string
      kdf_iterations: number
      wrapped_dek_password: string
      wrapped_dek_password_iv: string
    }>
    const keyRow = rows[0]
    if (!keyRow) throw new Error('No key bundle for this account')

    const salt = base64ToBytes(keyRow.salt)
    const oldIv = base64ToBytes(keyRow.wrapped_dek_password_iv)
    const oldCt = base64ToBytes(keyRow.wrapped_dek_password)

    // Verify current password by attempting to unwrap the DEK with it. AES-GCM
    // throws OperationError on tag mismatch, which only happens if the KEK is
    // wrong — i.e. the password is wrong.
    const oldKek = await deriveKek(currentPassword.value, salt, keyRow.kdf_iterations)
    let dekKey: CryptoKey
    try {
      dekKey = await unwrapKey(oldCt, oldIv, oldKek)
    } catch {
      throw new Error('Current password is incorrect')
    }

    // Re-wrap the DEK with a KEK derived from the new password. Same salt:
    // we don't need to rotate it because the password change doesn't affect
    // the DEK itself, and any previously-wrapped recovery copy stays valid.
    const newKek = await deriveKek(newPassword.value, salt, keyRow.kdf_iterations)
    const newWrap = await wrapKey(dekKey, newKek)

    const updateRes = await fetch(
      `${cfg.url}/rest/v1/user_keys?user_id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          wrapped_dek_password: bytesToBase64(newWrap.ct),
          wrapped_dek_password_iv: bytesToBase64(newWrap.iv),
        }),
      },
    )
    if (!updateRes.ok) throw new Error(`Key update failed: ${await updateRes.text()}`)

    // Update the Supabase Auth password last. If this fails, we've already
    // re-wrapped the DEK with the new KEK, so the old-password path would
    // no longer unwrap. The user would be locked out — except the auth
    // password is still old too, so they'd log in fine, then hit our login
    // self-repair flow (which would generate new keys and overwrite the
    // re-wrap). Order matters but the worst case is recoverable.
    const { error: authError } = await supabase.auth.updateUser({ password: newPassword.value })
    if (authError) throw authError

    // Refresh the in-session DEK cache so subsequent ops use the new one
    // (functionally identical — same DEK — but keeps the cached extractable
    // CryptoKey instance in sync with the latest wrap).
    await setDek(dekKey)

    toast.add({ title: 'Password updated', color: 'primary' })
    currentPassword.value = ''
    newPassword.value = ''
    newPasswordConfirm.value = ''
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[account] change password failed', error)
    toast.add({
      title: 'Password change failed',
      description: errorMessage(error),
      color: 'error',
    })
  } finally {
    changingPassword.value = false
  }
}

// =============================================================================
// Delete account
// =============================================================================

const emailConfirm = ref('')
const deleting = ref(false)
const canDelete = computed(
  () => Boolean(user.value?.email) && emailConfirm.value === user.value?.email && !deleting.value,
)

async function onDeleteAccount() {
  if (!canDelete.value) return
  if (!confirm('Delete account and all cloud maps? This cannot be undone.')) return
  deleting.value = true
  try {
    const { error } = await supabase.rpc('delete_self')
    if (error) throw error

    // Cascade is server-side (auth.users → user_keys + maps). Clear local
    // state to match. Local maps in localStorage stay — those weren't tied
    // to the deleted account.
    clearDek()
    clearCloudCache()
    await supabase.auth.signOut()
    toast.add({ title: 'Account deleted', color: 'primary' })
    await navigateTo('/')
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[account] delete failed', error)
    toast.add({
      title: 'Delete failed',
      description: errorMessage(error),
      color: 'error',
    })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UContainer class="py-8 max-w-md">
    <h1 class="text-2xl font-bold mb-6">Account</h1>

    <UCard class="mb-6">
      <template #header>
        <h2 class="font-semibold">Signed in as</h2>
      </template>
      <p class="text-sm break-all">{{ user?.email }}</p>
    </UCard>

    <UCard class="mb-6">
      <template #header>
        <h2 class="font-semibold">Change password</h2>
      </template>
      <form class="space-y-4" @submit.prevent="onChangePassword">
        <UFormField label="Current password" required>
          <UInput
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            required
            class="w-full"
          />
        </UFormField>
        <UFormField label="New password" required>
          <UInput
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            required
            class="w-full"
          />
          <PasswordStrengthMeter :password="newPassword" class="mt-2" />
        </UFormField>
        <UFormField
          label="Confirm new password"
          required
          :error="newMismatch ? 'Passwords do not match' : undefined"
        >
          <UInput
            v-model="newPasswordConfirm"
            type="password"
            autocomplete="new-password"
            required
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          :loading="changingPassword"
          :disabled="!canChangePassword"
          block
        >
          Change password
        </UButton>
      </form>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold text-red-600 dark:text-red-400">Delete account</h2>
      </template>
      <UAlert
        icon="i-heroicons-exclamation-triangle"
        color="error"
        variant="subtle"
        title="This cannot be undone"
        class="mb-4"
      >
        <template #description>
          Your account, all your encrypted cloud maps, and your encryption keys
          will be permanently deleted. Local maps on this device are kept.
        </template>
      </UAlert>
      <UFormField :label="`Type your email (${user?.email ?? ''}) to confirm`">
        <UInput v-model="emailConfirm" type="email" class="w-full" />
      </UFormField>
      <UButton
        color="error"
        :disabled="!canDelete"
        :loading="deleting"
        class="mt-4"
        @click="onDeleteAccount"
      >
        Delete my account
      </UButton>
    </UCard>
  </UContainer>
</template>
