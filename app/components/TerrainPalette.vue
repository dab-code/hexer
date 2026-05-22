<script setup lang="ts">
import { TerrainTypes, getTerrainKeyByIndex, getTerrainVariantByIndex } from '~/utils/terrainGenerator'

const value = defineModel<TerrainTypes>({ required: true })

const swatches = Object.values(TerrainTypes)
  .filter((v): v is TerrainTypes => typeof v === 'number')
  .map((t) => ({ value: t, label: getTerrainKeyByIndex(t) }))
</script>

<template>
  <div class="flex flex-wrap gap-2 items-center">
    <button
      v-for="s in swatches"
      :key="s.value"
      type="button"
      class="swatch"
      :class="{ 'is-active': value === s.value }"
      :title="s.label"
      @click="value = s.value"
    >
      <img class="tile" :src="getTerrainVariantByIndex(s.value, 0)" :alt="s.label">
      <span class="label">{{ s.label }}</span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.swatch {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  border: 2px solid transparent;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 4px;
  cursor: pointer;
  overflow: hidden;
  background: #e9e9e9;
  transition: transform 0.1s, border-color 0.1s;

  &:hover {
    transform: translateY(-2px);
  }

  &.is-active {
    border-color: #111;
    outline: 2px solid #fff;
    outline-offset: -4px;
  }

  .tile {
    position: absolute;
    inset: 2px 2px 14px 2px;
    object-fit: contain;
    pointer-events: none;
  }

  .label {
    position: relative;
    font-size: 10px;
    color: rgba(0, 0, 0, 0.75);
    text-shadow:
      0 1px 0 rgba(255, 255, 255, 0.7),
      0 0 4px rgba(255, 255, 255, 0.6);
    font-weight: 600;
  }
}
</style>
