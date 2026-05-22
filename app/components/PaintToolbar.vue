<script setup lang="ts">
import { TerrainTypes } from '~/utils/terrainGenerator'
import type { OverlaySelection } from './OverlayPalette.vue'

export type PaintMode = 'terrain' | 'overlay'

const mode = defineModel<PaintMode>('mode', { required: true })
const activeTerrain = defineModel<TerrainTypes>('activeTerrain', { required: true })
const activeOverlay = defineModel<OverlaySelection>('activeOverlay', { required: true })
const zoom = defineModel<number>('zoom', { required: true })

function zoomIn() { zoom.value = Math.min(4, +(zoom.value * 1.25).toFixed(3)) }
function zoomOut() { zoom.value = Math.max(0.5, +(zoom.value / 1.25).toFixed(3)) }
function zoomReset() { zoom.value = 1 }
</script>

<template>
  <div class="paint-toolbar">
    <div class="toolbar-header">
      <div class="mode-tabs">
        <button
          type="button"
          :class="{ 'is-active': mode === 'terrain' }"
          @click="mode = 'terrain'"
        >
          Terrain
        </button>
        <button
          type="button"
          :class="{ 'is-active': mode === 'overlay' }"
          @click="mode = 'overlay'"
        >
          Overlay
        </button>
      </div>
      <div class="zoom-controls">
        <UButton icon="i-heroicons-minus" variant="ghost" size="xs" aria-label="Zoom out" @click="zoomOut" />
        <button
          type="button"
          class="zoom-percent"
          :title="zoom === 1 ? 'Zoom' : 'Reset zoom'"
          @click="zoomReset"
        >
          {{ Math.round(zoom * 100) }}%
        </button>
        <UButton icon="i-heroicons-plus" variant="ghost" size="xs" aria-label="Zoom in" @click="zoomIn" />
      </div>
    </div>

    <div class="palette">
      <TerrainPalette
        v-if="mode === 'terrain'"
        v-model="activeTerrain"
      />
      <OverlayPalette v-else v-model="activeOverlay" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.paint-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toolbar-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
  padding-bottom: 6px;
}

.mode-tabs {
  display: flex;
  gap: 4px;

  button {
    padding: 6px 14px;
    border-radius: 6px 6px 0 0;
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;

    &:hover { background: rgba(127, 127, 127, 0.1); }

    &.is-active {
      background: rgba(127, 127, 127, 0.2);
      border-color: rgba(127, 127, 127, 0.3);
    }
  }
}

.zoom-controls {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  color: rgb(107, 114, 128);

  .zoom-percent {
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
    border: none;
    color: inherit;

    &:hover {
      background: rgba(127, 127, 127, 0.1);
    }
  }
}
</style>
