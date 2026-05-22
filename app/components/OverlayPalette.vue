<script setup lang="ts">
import {
  OverlayCategories,
  OverlayCategoryLabels,
  OverlayVariants,
  getOverlayPath,
  overlayVariantFilename,
  type OverlayCategory,
} from '~/utils/terrainGenerator'

export type OverlaySelection =
  | { category: OverlayCategory; index: number }
  | { category: OverlayCategory; erase: true }
  | null

const selection = defineModel<OverlaySelection>({ required: true })

const activeCategory = ref<OverlayCategory>(
  selection.value && 'category' in selection.value ? selection.value.category : 'river'
)

const POI_NAMES: Record<string, string> = {
  's01.png': 'Castle',
  's02.png': 'Cliff Fort',
  's03.png': 'Walled City',
  's04.png': 'Castle Town',
  's05.png': 'Manor',
  's06.png': 'Ruins',
  's07.png': 'Cathedral',
  's08.png': 'Forest Village',
  's09.png': 'Chapel',
  's10.png': 'Village',
  's11.png': 'Hamlet',
  's12.png': 'Houses',
  's13.png': 'Mountain Pass',
  's14.png': 'Caravan',
  's15.png': 'Citadel',
  's17.png': 'Spires',
  's18.png': 'Tower',
  'sea2.png': 'Ship',
  'sea6.png': 'Boat',
  'hills1.png': 'Hills',
  'hills2.png': 'Hills',
  'hills3.png': 'Hills',
  'hills4.png': 'Hills',
  'hills5.png': 'Hills',
  'hills6.png': 'Hills',
  'mountain1.png': 'Mountains',
  'mountain2.png': 'Mountains',
  'mountain3.png': 'Mountains',
  'mountain4.png': 'Mountains',
  'mountain5.png': 'Mountains',
  'forest1.png': 'Forest',
  'forest2.png': 'Forest',
  'forest3.png': 'Forest',
  'forest4.png': 'Forest',
  'forest5.png': 'Forest',
  'field1.png': 'Fields',
  'field2.png': 'Fields',
  'field3.png': 'Fields',
  'field4.png': 'Fields',
}

function variantLabel(category: OverlayCategory, index: number): string {
  const entry = OverlayVariants[category].files[index]
  if (!entry) return `${index + 1}`
  const file = overlayVariantFilename(entry)
  if (category === 'poi') return POI_NAMES[file] ?? `POI ${index + 1}`
  if (category === 'river') return `River ${index + 1}`
  if (category === 'path') return `Path ${index + 1}`
  return `${index + 1}`
}

function pick(index: number) {
  selection.value = { category: activeCategory.value, index }
}

function chooseErase() {
  selection.value = { category: activeCategory.value, erase: true }
}

function isPicked(index: number) {
  const s = selection.value
  return s && 'index' in s && s.category === activeCategory.value && s.index === index
}

const isEraseActive = computed(() => {
  const s = selection.value
  return s && 'erase' in s && s.category === activeCategory.value
})

const variants = computed(() => OverlayVariants[activeCategory.value].files)
</script>

<template>
  <div class="overlay-palette">
    <div class="category-tabs">
      <button
        v-for="cat in OverlayCategories"
        :key="cat"
        type="button"
        class="cat-btn"
        :class="{ 'is-active': cat === activeCategory }"
        @click="activeCategory = cat"
      >
        {{ OverlayCategoryLabels[cat] }}
      </button>
    </div>

    <div class="variant-grid">
      <button
        v-for="(file, idx) in variants"
        :key="overlayVariantFilename(file)"
        type="button"
        class="variant"
        :class="{ 'is-active': isPicked(idx) }"
        :title="variantLabel(activeCategory, idx)"
        @click="pick(idx)"
      >
        <img :src="getOverlayPath(activeCategory, idx)" :alt="variantLabel(activeCategory, idx)">
        <span class="variant-label">{{ variantLabel(activeCategory, idx) }}</span>
      </button>
      <button
        type="button"
        class="variant erase"
        :class="{ 'is-active': isEraseActive }"
        :title="`Remove ${OverlayCategoryLabels[activeCategory]}`"
        @click="chooseErase"
      >
        <span class="erase-icon">
          <UIcon name="i-heroicons-no-symbol" class="text-2xl" />
        </span>
        <span class="variant-label">None</span>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.overlay-palette {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-tabs {
  display: flex;
  gap: 4px;

  .cat-btn {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: rgba(127, 127, 127, 0.1);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;

    &:hover {
      background: rgba(127, 127, 127, 0.2);
    }

    &.is-active {
      background: rgba(127, 127, 127, 0.3);
      border-color: #111;
    }
  }
}

.variant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 60px);
  gap: 6px;
}

.variant {
  width: 60px;
  height: 80px;
  border-radius: 6px;
  border: 2px solid #d4d4d8;
  background: #f4f5f7;
  color: #333;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  cursor: pointer;
  padding: 2px;
  overflow: hidden;
  gap: 2px;

  img {
    width: 100%;
    flex: 1;
    min-height: 0;
    object-fit: contain;
  }

  .variant-label {
    font-size: 9px;
    font-weight: 600;
    text-align: center;
    line-height: 1;
    color: #444;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    background: #e9ecef;
  }

  &.is-active {
    border-color: #111;
    background: #e0e3e7;
  }

  &.erase {
    color: #b91c1c;
    .variant-label { color: #b91c1c; }
    .erase-icon {
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
}
</style>
