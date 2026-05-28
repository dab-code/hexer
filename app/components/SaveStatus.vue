<script setup lang="ts">
import type { SaveStatus } from '~/composables/useMaps'

const props = defineProps<{ status: SaveStatus }>()

// 'idle' renders nothing — no pill until there's something to say. The
// editor header keeps its visual rhythm rather than flashing a pill on
// every page load.
const visible = computed(() => props.status !== 'idle')

const meta = computed(() => {
  switch (props.status) {
    case 'dirty':
      return { label: 'Unsaved changes', icon: 'i-heroicons-pencil-square', color: 'neutral' as const }
    case 'saving':
      return { label: 'Saving…', icon: 'i-heroicons-arrow-path', color: 'amber' as const, spin: true }
    case 'saved':
      return { label: 'Saved', icon: 'i-heroicons-check-circle', color: 'success' as const }
    case 'error':
      return { label: 'Save failed', icon: 'i-heroicons-exclamation-triangle', color: 'error' as const }
    default:
      return null
  }
})
</script>

<template>
  <UBadge
    v-if="visible && meta"
    :color="meta.color"
    variant="subtle"
    size="sm"
    :icon="meta.icon"
    :ui="{ leadingIcon: meta.spin ? 'animate-spin' : '' }"
  >
    {{ meta.label }}
  </UBadge>
</template>
