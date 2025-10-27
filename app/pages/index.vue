<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  ssr: true
})

navigateTo('/maps')
</script>

<template>
  <div />
</template>