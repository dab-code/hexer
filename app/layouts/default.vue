<script setup lang="ts">
const { sessionUser, userName, logout } = useSupaUser()
</script>
<template>
  <div>
    <UHeader :toggle="false">
        <template #title>
            HEXER
        </template>
        <template #right>
          <UButton
            v-if="sessionUser"
            variant="link"
            color="primary"
            @click="logout"
            >
            Logout
          </UButton>

          <UColorModeButton variant="ghost" />
        </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>