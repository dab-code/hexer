<script setup lang="ts">
import {
  TerrainTypes,
  getTerrainKeyByIndex,
  getTerrainVariantByIndex,
  terrainGroupsForPack,
  terrainLabel,
  type Pack,
} from '~/utils/terrainGenerator'

const value = defineModel<TerrainTypes>({ required: true })
const props = defineProps<{
  pack: Pack
  searchQuery?: string
}>()

const groups = computed(() => terrainGroupsForPack(props.pack))

function swatchLabel(t: TerrainTypes): string {
  return props.pack === 'hexes2' ? getTerrainKeyByIndex(t) : terrainLabel(t)
}

function matchesQuery(t: TerrainTypes, groupLabel: string, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return swatchLabel(t).toLowerCase().includes(needle) || groupLabel.toLowerCase().includes(needle)
}

const filteredGroups = computed(() => {
  const q = (props.searchQuery ?? '').trim()
  if (!q) return groups.value.map((g) => ({ ...g, hasMatch: true }))
  return groups.value
    .map((g) => ({
      group: g.group,
      types: g.types.filter((t) => matchesQuery(t, g.group, q)),
      hasMatch: true,
    }))
    .filter((g) => g.types.length > 0)
})

// Accordion state — only one group expanded at a time. Default to the group
// containing the active terrain (or first group).
const expandedGroup = ref<string | null>(null)
function initialExpanded(): string | null {
  if (groups.value.length <= 1) return null
  const match = groups.value.find((g) => g.types.includes(value.value))
  return match?.group ?? groups.value[0]?.group ?? null
}
expandedGroup.value = initialExpanded()

watch(groups, () => {
  expandedGroup.value = initialExpanded()
})

// Auto-expand all matching groups while a query is active.
const effectiveExpanded = computed<Set<string>>(() => {
  const q = (props.searchQuery ?? '').trim()
  if (q) return new Set(filteredGroups.value.map((g) => g.group))
  return new Set(expandedGroup.value ? [expandedGroup.value] : [])
})

function toggleGroup(name: string) {
  if (props.searchQuery?.trim()) return // search mode owns expansion
  expandedGroup.value = expandedGroup.value === name ? null : name
}

function isExpanded(name: string): boolean {
  return effectiveExpanded.value.has(name) || filteredGroups.value.length === 1
}
</script>

<template>
  <div class="terrain-palette">
    <div v-if="filteredGroups.length === 0" class="empty">No tiles match "{{ searchQuery }}"</div>
    <div
      v-for="g in filteredGroups"
      :key="g.group"
      class="group-block"
      :class="{ expanded: isExpanded(g.group) }"
    >
      <button
        v-if="groups.length > 1"
        type="button"
        class="group-header"
        @click="toggleGroup(g.group)"
      >
        <UIcon
          :name="isExpanded(g.group) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
          class="chevron"
        />
        <span class="group-title">{{ g.group }}</span>
        <span class="count">{{ g.types.length }}</span>
      </button>
      <div v-if="isExpanded(g.group)" class="swatch-grid">
        <button
          v-for="t in g.types"
          :key="t"
          type="button"
          class="swatch"
          :class="{ 'is-active': value === t }"
          :title="swatchLabel(t)"
          @click="value = t"
        >
          <img class="tile" :src="getTerrainVariantByIndex(t, 0)" :alt="swatchLabel(t)">
          <span class="label">{{ swatchLabel(t) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.terrain-palette {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  gap: 6px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 6px 4px;
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
  width: 100%;

  &:hover { background: rgba(0, 0, 0, 0.04); }

  .chevron {
    flex-shrink: 0;
    color: #666;
  }

  .group-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #555;
    flex: 1;
  }

  .count {
    font-size: 10px;
    font-weight: 600;
    color: #999;
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 6px;
    border-radius: 8px;
  }

  :where(html.dark) & {
    &:hover { background: rgba(255, 255, 255, 0.05); }
    .chevron { color: #9ca3af; }
    .group-title { color: #d1d5db; }
    .count {
      color: #9ca3af;
      background: rgba(255, 255, 255, 0.08);
    }
  }
}

.swatch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 6px;
  padding-bottom: 4px;
}

.swatch {
  height: 76px;
  border-radius: 8px;
  border: 2px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
  background: #e9e9e9;
  padding: 4px 4px 6px;
  gap: 4px;
  transition: transform 0.1s, border-color 0.1s;

  &:hover { transform: translateY(-2px); }

  &.is-active {
    border-color: #111;
    outline: 2px solid #fff;
    outline-offset: -4px;
  }

  .tile {
    flex: 1;
    min-height: 0;
    width: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .label {
    flex-shrink: 0;
    font-size: 9px;
    color: rgba(0, 0, 0, 0.85);
    font-weight: 600;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1;
  }

  :where(html.dark) & {
    background: #2a2d33;

    .label { color: rgba(255, 255, 255, 0.85); }

    &.is-active {
      border-color: #f3f4f6;
      outline-color: #1a1d23;
    }
  }
}

.empty {
  :where(html.dark) & { color: #6b7280; }
}
</style>
