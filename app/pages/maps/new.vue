<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  ssr: false
})
</script>

<template>
  <UContainer class="py-8">
    <div class="mx-auto">
      <!-- <UButton
        to="/maps"
        icon="i-heroicons-arrow-left"
        variant="ghost"
        class="mb-6"
      >
        Back to Worlds
      </UButton> -->

      <MapCreator />
    </div>
  </UContainer>
</template>