<script setup lang="ts">
const SIGNUP_CODE_KEY = 'hexer:signup-recovery-code'

const code = ref<string | null>(null)
const confirmed = ref(false)
const copied = ref(false)
const toast = useToast()

// Split the 24-char code into 4-char groups for readable display:
// e.g. "ABCD-EFGH-IJKL-MNOP-QRST-UVWX". The user can paste either form back
// at recovery time; parseRecoveryCode() strips dashes and whitespace.
const formattedCode = computed(() => {
  if (!code.value) return ''
  return code.value.match(/.{1,4}/g)?.join('-') ?? code.value
})

onMounted(() => {
  const stored = sessionStorage.getItem(SIGNUP_CODE_KEY)
  if (!stored) {
    navigateTo('/', { replace: true })
    return
  }
  code.value = stored
})

async function copy() {
  if (!code.value) return
  try {
    await navigator.clipboard.writeText(formattedCode.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    toast.add({
      title: 'Copy failed',
      description: 'Select the code manually and copy it.',
      color: 'error',
    })
  }
}

function continueToMaps() {
  if (!confirmed.value) return
  sessionStorage.removeItem(SIGNUP_CODE_KEY)
  navigateTo('/maps')
}
</script>

<template>
  <UContainer class="py-12 max-w-lg">
    <h1 class="text-2xl font-bold mb-2">Save your recovery code</h1>
    <UAlert
      icon="i-heroicons-exclamation-triangle"
      color="warning"
      variant="subtle"
      title="Read this carefully"
      class="mb-6"
    >
      <template #description>
        This code is your <strong>only</strong> way back in if you forget your
        password. We can't recover it for you — your maps are encrypted with
        keys that never leave your browser. Save it in a password manager
        (1Password, Bitwarden) or print it.
      </template>
    </UAlert>

    <div class="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 p-6 mb-4 text-center">
      <div class="text-xs uppercase tracking-wide text-gray-500 mb-2">
        Recovery code
      </div>
      <div class="font-mono text-xl md:text-2xl tracking-wider select-all break-all">
        {{ formattedCode }}
      </div>
      <UButton
        :icon="copied ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'"
        variant="ghost"
        size="sm"
        class="mt-4"
        @click="copy"
      >
        {{ copied ? 'Copied' : 'Copy to clipboard' }}
      </UButton>
    </div>

    <UCheckbox
      v-model="confirmed"
      label="I've saved my recovery code somewhere safe"
      class="mb-4"
    />

    <UButton
      :disabled="!confirmed"
      block
      size="lg"
      @click="continueToMaps"
    >
      Continue to your maps
    </UButton>
  </UContainer>
</template>
