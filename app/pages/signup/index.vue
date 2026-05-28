<script setup lang="ts">
import { scorePassword } from '~/utils/passwordStrength'

useHead({ title: 'Sign up' })

const supabase = useSupabaseClient()
const { createAndStoreKeys } = useEncryptionKey()
const toast = useToast()

const email = ref('')
const password = ref('')
const passwordConfirm = ref('')
const submitting = ref(false)

const strength = computed(() => scorePassword(password.value))
const confirmMismatch = computed(
  () => passwordConfirm.value.length > 0 && password.value !== passwordConfirm.value,
)
const canSubmit = computed(() => {
  return email.value.includes('@')
    && strength.value.acceptable
    && password.value === passwordConfirm.value
    && !submitting.value
})

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
  let signedUp = false
  try {
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: email.value.trim(),
      password: password.value,
    })
    if (signUpError) throw signUpError
    signedUp = true
    const userId = authData.user?.id
    const accessToken = authData.session?.access_token
    if (!userId) throw new Error('Signup did not return a user id')
    if (!accessToken) throw new Error('Signup did not return a session')

    await createAndStoreKeys(accessToken, userId, password.value)
    await navigateTo('/signup/recovery-code')
  } catch (error) {
    // Full error to console for debugging; toast gets a short extracted message.
    // eslint-disable-next-line no-console
    console.error('[signup] failed', error)
    toast.add({
      title: 'Signup failed',
      description: errorMessage(error),
      color: 'error',
    })
    // If we got past supabase.auth.signUp but failed afterwards (e.g. the
    // user_keys insert hit a transient error), sign out so we don't leave a
    // half-baked auth.users row with a live session and no key bundle.
    // The next login attempt will detect the missing user_keys row and run
    // the key-creation flow as a self-repair.
    if (signedUp) {
      try { await supabase.auth.signOut() } catch { /* ignore */ }
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UContainer class="py-12 max-w-md">
    <h1 class="text-2xl font-bold mb-2">Create your account</h1>
    <p class="text-sm text-gray-500 mb-6">
      Your maps are end-to-end encrypted. We never see your password or the
      contents of your maps.
    </p>

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
          autocomplete="new-password"
          required
          class="w-full"
        />
        <PasswordStrengthMeter :password="password" class="mt-2" />
      </UFormField>

      <UFormField
        label="Confirm password"
        required
        :error="confirmMismatch ? 'Passwords do not match' : undefined"
      >
        <UInput
          v-model="passwordConfirm"
          type="password"
          autocomplete="new-password"
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
        Sign up
      </UButton>
    </form>

    <p class="text-sm text-gray-500 mt-6 text-center">
      Already have an account?
      <ULink to="/login" class="font-medium">Log in</ULink>
    </p>
  </UContainer>
</template>
