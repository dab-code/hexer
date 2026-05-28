<script setup lang="ts">
import { scorePassword } from '~/utils/passwordStrength'

const props = defineProps<{ password: string }>()

const result = computed(() => scorePassword(props.password))

// 5 segments. Each segment is "filled" if its index <= tier (and password is
// non-empty). Colors progress red → green.
const segmentColors = [
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-400',
  'bg-lime-500',
  'bg-emerald-500',
]
const segmentClass = (i: number) => {
  if (!props.password) return 'bg-gray-200 dark:bg-gray-700'
  return i <= result.value.tier
    ? segmentColors[result.value.tier]!
    : 'bg-gray-200 dark:bg-gray-700'
}

const labelColorClass = computed(() => {
  if (!props.password) return 'text-gray-500'
  return [
    'text-red-600 dark:text-red-400',
    'text-orange-600 dark:text-orange-400',
    'text-amber-600 dark:text-amber-400',
    'text-lime-600 dark:text-lime-400',
    'text-emerald-600 dark:text-emerald-400',
  ][result.value.tier]
})

defineExpose({ result })
</script>

<template>
  <div>
    <div class="flex gap-1 h-1.5">
      <div
        v-for="i in 5"
        :key="i"
        class="flex-1 rounded-sm transition-colors"
        :class="segmentClass(i - 1)"
      />
    </div>
    <div class="mt-1 flex justify-between text-xs">
      <span :class="labelColorClass">{{ password ? result.label : ' ' }}</span>
      <span v-if="result.hint" class="text-gray-500">{{ result.hint }}</span>
    </div>
  </div>
</template>
