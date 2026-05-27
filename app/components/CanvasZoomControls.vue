<script setup lang="ts">
const zoom = defineModel<number>({ required: true })

// 0.25 (25%) up to 10× lets users zoom well into pixel-level detail on the
// worldhex tiles, which carry a lot of fine ink work.
function zoomIn() { zoom.value = Math.min(10, +(zoom.value * 1.25).toFixed(3)) }
function zoomOut() { zoom.value = Math.max(0.25, +(zoom.value / 1.25).toFixed(3)) }
function zoomReset() { zoom.value = 1 }
</script>

<template>
  <div class="zoom-widget">
    <UButton
      icon="i-heroicons-plus"
      variant="solid"
      color="neutral"
      size="sm"
      square
      aria-label="Zoom in"
      @click="zoomIn"
    />
    <button
      type="button"
      class="zoom-percent"
      :title="zoom === 1 ? 'Zoom' : 'Reset zoom'"
      @click="zoomReset"
    >
      {{ Math.round(zoom * 100) }}%
    </button>
    <UButton
      icon="i-heroicons-minus"
      variant="solid"
      color="neutral"
      size="sm"
      square
      aria-label="Zoom out"
      @click="zoomOut"
    />
  </div>
</template>

<style lang="scss" scoped>
.zoom-widget {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.9);
  padding: 4px;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(4px);

  :where(html.dark) & {
    background: rgba(30, 33, 39, 0.85);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
}

/* On mobile, dock the zoom to the top-right instead of the bottom: the bottom
   edge is crowded by the edit FAB and the bottom sheet, and the top-right is
   clear. Offset by the safe-area inset so it clears the status bar / notch. */
@media (max-width: 767px) {
  .zoom-widget {
    top: calc(12px + env(safe-area-inset-top));
    bottom: auto;
  }
}

.zoom-percent {
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  border: none;
  color: #333;
  text-align: center;

  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }

  :where(html.dark) & {
    color: #e5e7eb;
    &:hover { background: rgba(255, 255, 255, 0.08); }
  }
}
</style>
