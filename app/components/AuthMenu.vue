<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const { clear: clearDek } = useEncryptionKey()

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: 'Account', icon: 'i-heroicons-user-circle', to: '/account' }],
  [{
    label: 'Sign out',
    icon: 'i-heroicons-arrow-right-on-rectangle',
    onSelect: async () => {
      clearDek()
      await supabase.auth.signOut()
      await navigateTo('/maps')
    },
  }],
])
</script>

<template>
  <div class="flex items-center gap-2">
    <template v-if="user">
      <UDropdownMenu :items="menuItems">
        <UButton
          icon="i-heroicons-user-circle"
          variant="ghost"
          size="sm"
          trailing-icon="i-heroicons-chevron-down"
        >
          <span class="hidden sm:inline">{{ user.email ?? 'Account' }}</span>
        </UButton>
      </UDropdownMenu>
    </template>
    <template v-else>
      <UButton to="/login" variant="ghost" size="sm">Sign in</UButton>
      <UButton to="/signup" size="sm">Sign up</UButton>
    </template>
  </div>
</template>
