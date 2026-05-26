<script setup lang="ts">
import {
  OverlayCategoryLabels,
  OverlayVariantsByPack,
  overlayVariantFilename,
  type OverlayCategory,
  type Pack,
} from '~/utils/terrainGenerator'
import { packAdapterFor } from '~/packs'

export type OverlaySelection = { category: OverlayCategory; index: number } | null

const selection = defineModel<OverlaySelection>({ required: true })
const props = defineProps<{
  pack: Pack
  searchQuery?: string
}>()

const adapter = computed(() => packAdapterFor(props.pack))
const categories = computed(() => adapter.value.overlayCategories)
const paletteShape = computed(() => adapter.value.overlayPaletteShape(activeCategory.value))

const activeCategory = ref<OverlayCategory>(
  selection.value ? selection.value.category : 'river'
)

watch(categories, (cats) => {
  if (!cats.includes(activeCategory.value)) {
    activeCategory.value = cats[0] ?? 'river'
  }
}, { immediate: true })

// hexes2 POI labels (kept here because they're descriptive, not derivable from filename).
const HEXES2_POI_NAMES: Record<string, string> = {
  's01.png': 'Castle', 's02.png': 'Cliff Fort', 's03.png': 'Walled City',
  's04.png': 'Castle Town', 's05.png': 'Manor', 's06.png': 'Ruins',
  's07.png': 'Cathedral', 's08.png': 'Forest Village', 's09.png': 'Chapel',
  's10.png': 'Village', 's11.png': 'Hamlet', 's12.png': 'Houses',
  's13.png': 'Mountain Pass', 's14.png': 'Caravan', 's15.png': 'Citadel',
  's17.png': 'Spires', 's18.png': 'Tower',
  'sea2.png': 'Ship', 'sea6.png': 'Boat',
  'hills1.png': 'Hills', 'hills2.png': 'Hills', 'hills3.png': 'Hills',
  'hills4.png': 'Hills', 'hills5.png': 'Hills', 'hills6.png': 'Hills',
  'mountain1.png': 'Mountains', 'mountain2.png': 'Mountains',
  'mountain3.png': 'Mountains', 'mountain4.png': 'Mountains', 'mountain5.png': 'Mountains',
  'forest1.png': 'Forest', 'forest2.png': 'Forest', 'forest3.png': 'Forest',
  'forest4.png': 'Forest', 'forest5.png': 'Forest',
  'field1.png': 'Fields', 'field2.png': 'Fields', 'field3.png': 'Fields', 'field4.png': 'Fields',
  'lake-2.png': 'Lake',
}

function flatVariantLabel(category: OverlayCategory, index: number): string {
  const list = OverlayVariantsByPack[props.pack]?.[category]
  const entry = list?.files[index]
  if (!entry) return `${index + 1}`
  const file = overlayVariantFilename(entry)
  if (props.pack === 'hexes2' && category === 'poi') return HEXES2_POI_NAMES[file] ?? `POI ${index + 1}`
  if (category === 'river') return `River ${index + 1}`
  if (category === 'path') return `Path ${index + 1}`
  return `${index + 1}`
}

function pick(index: number) {
  selection.value = { category: activeCategory.value, index }
}
function isPicked(index: number) {
  const s = selection.value
  return !!s && s.category === activeCategory.value && s.index === index
}

const flatVariants = computed(() =>
  paletteShape.value.kind === 'flat' ? paletteShape.value.entries : [],
)

const directionalGroups = computed(() =>
  paletteShape.value.kind === 'directional' ? paletteShape.value.groups : null,
)

const extrasGroups = computed(() =>
  paletteShape.value.kind === 'extras' ? paletteShape.value.groups : null,
)

const query = computed(() => (props.searchQuery ?? '').trim().toLowerCase())

const filteredDirectionalGroups = computed(() => {
  if (!directionalGroups.value) return null
  const q = query.value
  if (!q) return directionalGroups.value
  return directionalGroups.value
    .map((g) => ({
      pattern: g.pattern,
      entries: g.entries.filter((e) =>
        g.pattern.toLowerCase().includes(q) || (e.direction?.toLowerCase().includes(q) ?? false)
      ),
    }))
    .filter((g) => g.entries.length > 0)
})

const filteredExtrasGroups = computed(() => {
  if (!extrasGroups.value) return null
  const q = query.value
  if (!q) return extrasGroups.value
  return extrasGroups.value
    .map((g) => ({
      group: g.group,
      entries: g.entries.filter((e) =>
        g.group.toLowerCase().includes(q) || e.file.toLowerCase().includes(q)
      ),
    }))
    .filter((g) => g.entries.length > 0)
})

const filteredFlatVariants = computed(() => {
  const q = query.value
  if (!q) return flatVariants.value.map((entry, index) => ({ entry, index }))
  return flatVariants.value
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => {
      const file = overlayVariantFilename(entry).toLowerCase()
      return file.includes(q) || flatVariantLabel(activeCategory.value, index).toLowerCase().includes(q)
    })
})
</script>

<template>
  <div class="overlay-palette">
    <div class="category-tabs">
      <button
        v-for="cat in categories"
        :key="cat"
        type="button"
        class="cat-btn"
        :class="{ 'is-active': cat === activeCategory }"
        @click="activeCategory = cat"
      >
        {{ OverlayCategoryLabels[cat] }}
      </button>
    </div>

    <!-- Worldhex paths/rivers/coasts: pattern → directions -->
    <div v-if="filteredDirectionalGroups" class="grouped">
      <div v-if="filteredDirectionalGroups.length === 0" class="empty">No variants match "{{ searchQuery }}"</div>
      <div v-for="g in filteredDirectionalGroups" :key="g.pattern" class="group-block">
        <div class="group-title">{{ g.pattern }}</div>
        <div class="variant-grid">
          <button
            v-for="e in g.entries"
            :key="e.index"
            type="button"
            class="variant"
            :class="{ 'is-active': isPicked(e.index) }"
            :title="e.direction ? `${g.pattern} ${e.direction}` : g.pattern"
            @click="pick(e.index)"
          >
            <img :src="adapter.overlayUrl(activeCategory, e.index)" :alt="e.direction ? `${g.pattern} ${e.direction}` : g.pattern">
            <span class="variant-label">{{ e.direction ?? 'full' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Worldhex extras (POI): grouped sub-buckets -->
    <div v-else-if="filteredExtrasGroups" class="grouped">
      <div v-if="filteredExtrasGroups.length === 0" class="empty">No extras match "{{ searchQuery }}"</div>
      <div v-for="g in filteredExtrasGroups" :key="g.group" class="group-block">
        <div class="group-title">{{ g.group }}</div>
        <div class="variant-grid">
          <button
            v-for="e in g.entries"
            :key="e.index"
            type="button"
            class="variant"
            :class="{ 'is-active': isPicked(e.index) }"
            :title="e.file.replace(/\.png$/, '')"
            @click="pick(e.index)"
          >
            <img :src="adapter.overlayUrl(activeCategory, e.index)" :alt="e.file">
          </button>
        </div>
      </div>
    </div>

    <!-- Default (hexes2) flat grid -->
    <div v-else class="grouped">
      <div v-if="filteredFlatVariants.length === 0" class="empty">No variants match "{{ searchQuery }}"</div>
      <div class="variant-grid">
        <button
          v-for="item in filteredFlatVariants"
          :key="overlayVariantFilename(item.entry)"
          type="button"
          class="variant"
          :class="{ 'is-active': isPicked(item.index) }"
          :title="flatVariantLabel(activeCategory, item.index)"
          @click="pick(item.index)"
        >
          <img :src="adapter.overlayUrl(activeCategory, item.index)" :alt="flatVariantLabel(activeCategory, item.index)">
          <span class="variant-label">{{ flatVariantLabel(activeCategory, item.index) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.overlay-palette {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;

  .cat-btn {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: rgba(127, 127, 127, 0.1);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: inherit;

    &:hover { background: rgba(127, 127, 127, 0.2); }

    &.is-active {
      background: rgba(127, 127, 127, 0.3);
      border-color: #111;
    }

    :where(html.dark) & {
      &.is-active {
        background: rgba(255, 255, 255, 0.15);
        border-color: #f3f4f6;
      }
    }
  }
}

.grouped {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty {
  font-size: 12px;
  color: #888;
  font-style: italic;
  padding: 16px 8px;
  text-align: center;
}

.group-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #555;

  :where(html.dark) & { color: #d1d5db; }
}

.empty {
  :where(html.dark) & { color: #6b7280; }
}

.variant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 6px;
}

.variant {
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

  &:hover { background: #e9ecef; }

  &.is-active {
    border-color: #111;
    background: #e0e3e7;
  }

  :where(html.dark) & {
    border-color: rgba(255, 255, 255, 0.1);
    background: #2a2d33;
    color: #e5e7eb;

    .variant-label { color: #d1d5db; }

    &:hover { background: #353941; }

    &.is-active {
      border-color: #f3f4f6;
      background: #3a3f48;
    }
  }
}
</style>
