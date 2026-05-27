<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import {
  OverlayCategoryLabels,
  TerrainTypes,
  getTerrainKeyByIndex,
  groupDirectionalOverlays,
  groupExtras,
  overlayVariantFilename,
  parseDirectionalFile,
  terrainGroupsForPack,
  terrainLabel,
  OverlayVariantsByPack,
  type Pack,
} from '~/utils/terrainGenerator'
import type { OverlaySelection } from './OverlayPalette.vue'

export type PaintMode = 'terrain' | 'overlay' | 'edge' | 'path'

const tool = defineModel<PaintMode>('tool', { required: true })
const eraseMode = defineModel<boolean>('eraseMode', { required: true })
const activeTerrain = defineModel<TerrainTypes>('activeTerrain', { required: true })
const activeOverlay = defineModel<OverlaySelection>('activeOverlay', { required: true })
const collapsed = defineModel<boolean>('collapsed', { default: false })
type SheetState = 'closed' | 'peek' | 'expanded'
const sheetState = defineModel<SheetState>('sheetState', { default: 'closed' })

const props = defineProps<{
  pack: Pack
  // Path tool: number of anchors currently dropped on the in-progress trail.
  // Zero means "not drawing"; controls whether the action buttons are enabled.
  pathDraftAnchorCount?: number
}>()

const emit = defineEmits<{
  finishPath: []
  cancelPath: []
  undoPathAnchor: []
}>()

const search = ref('')
const isMobile = useMediaQuery('(max-width: 767px)')

watch(isMobile, (m) => {
  if (!m) sheetState.value = 'closed'
})

function selectTool(t: PaintMode) {
  tool.value = t
  eraseMode.value = false
  if (collapsed.value) collapsed.value = false
  if (isMobile.value && sheetState.value === 'closed') sheetState.value = 'peek'
}

// Last sub-mode picked under the "Paths" tab; remembered so re-opening the tab
// reselects the previously active River/Path sub-tab instead of always
// defaulting to one or the other.
const lastPathsSubMode = ref<'edge' | 'path'>('edge')
watch(tool, (t) => {
  if (t === 'edge' || t === 'path') lastPathsSubMode.value = t
})
const isPathsTab = computed(() => tool.value === 'edge' || tool.value === 'path')
function selectPathsTab() {
  selectTool(isPathsTab.value ? tool.value : lastPathsSubMode.value)
}

function toggleErase() {
  eraseMode.value = !eraseMode.value
  if (collapsed.value) collapsed.value = false
  if (isMobile.value && sheetState.value === 'closed') sheetState.value = 'peek'
}

function openSheet() { sheetState.value = 'peek' }
function closeSheet() { sheetState.value = 'closed' }
function toggleSheetSize() {
  sheetState.value = sheetState.value === 'expanded' ? 'peek' : 'expanded'
}

const terrainGroupLabel = computed(() => {
  if (props.pack !== 'worldhex') return null
  const groups = terrainGroupsForPack(props.pack)
  return groups.find((g) => g.types.includes(activeTerrain.value))?.group ?? null
})

const terrainLabelText = computed(() => {
  return props.pack === 'hexes2'
    ? getTerrainKeyByIndex(activeTerrain.value)
    : terrainLabel(activeTerrain.value)
})

const overlayLabelText = computed(() => {
  const sel = activeOverlay.value
  if (!sel) return null
  const catLabel = OverlayCategoryLabels[sel.category]

  if (props.pack === 'worldhex' && (sel.category === 'river' || sel.category === 'path' || sel.category === 'coast')) {
    const groups = groupDirectionalOverlays(props.pack, sel.category)
    for (const g of groups) {
      const hit = g.entries.find((e) => e.index === sel.index)
      if (hit) return `${catLabel} · ${g.pattern} ${hit.direction}`
    }
  }
  if (props.pack === 'worldhex' && sel.category === 'poi') {
    const groups = groupExtras(props.pack)
    for (const g of groups) {
      const hit = g.entries.find((e) => e.index === sel.index)
      if (hit) return `${g.group} · ${hit.file.replace(/\.png$/i, '')}`
    }
  }
  const list = OverlayVariantsByPack[props.pack]?.[sel.category]
  const entry = list?.files[sel.index]
  if (entry) {
    const file = overlayVariantFilename(entry)
    const parsed = parseDirectionalFile(file)
    if (parsed) return `${catLabel} · ${parsed.pattern}${parsed.direction ? ` ${parsed.direction}` : ''}`
    return `${catLabel} · ${file.replace(/\.png$/i, '')}`
  }
  return catLabel
})

const eraseScopeLabel = computed(() => {
  if (tool.value === 'terrain') return 'terrain'
  if (tool.value === 'edge') return 'river'
  if (tool.value === 'path') return 'path'
  const cat = activeOverlay.value?.category ?? 'river'
  return OverlayCategoryLabels[cat].toLowerCase()
})

const statusLabel = computed(() => {
  if (eraseMode.value) return `Erasing · ${eraseScopeLabel.value}`
  if (tool.value === 'terrain') {
    const group = terrainGroupLabel.value
    return group ? `Painting · ${group} › ${terrainLabelText.value}` : `Painting · ${terrainLabelText.value}`
  }
  if (tool.value === 'edge') return 'Painting · River'
  if (tool.value === 'path') {
    const n = props.pathDraftAnchorCount ?? 0
    return n > 0 ? `Drawing path · ${n} anchor${n === 1 ? '' : 's'}` : 'Path tool'
  }
  return overlayLabelText.value ? `Painting · ${overlayLabelText.value}` : 'Painting · Overlay'
})

const hasPathDraft = computed(() => (props.pathDraftAnchorCount ?? 0) > 0)
const canFinishPath = computed(() => (props.pathDraftAnchorCount ?? 0) >= 2)

// Paths tab has no searchable list — the sub-tab body is action buttons and
// instructions — so the search input is hidden there.
const showSearch = computed(() => !eraseMode.value && !collapsed.value && !isPathsTab.value)
</script>

<template>
  <div
    class="editor-shell"
    :class="{
      'is-mobile': isMobile,
      'is-collapsed': !isMobile && collapsed,
      [`sheet-${sheetState}`]: isMobile,
    }"
  >
    <!-- Scrim for tap-to-close on mobile -->
    <div
      v-if="isMobile && sheetState !== 'closed'"
      class="sheet-scrim"
      @click="closeSheet"
    />

    <!-- Mobile FAB (only when sheet closed) -->
    <button
      v-if="isMobile && sheetState === 'closed'"
      type="button"
      class="fab"
      aria-label="Open palette"
      @click="openSheet"
    >
      <UIcon name="i-heroicons-paint-brush" class="text-2xl" />
    </button>

    <aside v-if="!isMobile || sheetState !== 'closed'" class="sidebar">
      <!-- Mobile drag handle -->
      <button
        v-if="isMobile"
        type="button"
        class="sheet-handle"
        :aria-label="sheetState === 'expanded' ? 'Collapse palette' : 'Expand palette'"
        @click="toggleSheetSize"
      >
        <span class="grabber" />
      </button>

      <!-- Desktop collapse toggle -->
      <button
        v-if="!isMobile"
        type="button"
        class="collapse-toggle"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="collapsed = !collapsed"
      >
        <UIcon :name="collapsed ? 'i-heroicons-chevron-right' : 'i-heroicons-chevron-left'" />
      </button>

      <!-- Tool tabs (always visible, even when collapsed - rendered differently) -->
      <div class="tool-tabs" :class="{ rail: !isMobile && collapsed }">
        <!-- Scrollable region: the actual mode tabs. When the sidebar is too
             narrow to fit them all, this region scrolls horizontally behind the
             fixed Erase button on the right. -->
        <div class="tool-tabs-scroll">
          <button
            type="button"
            class="tool-btn"
            :class="{ 'is-active': tool === 'terrain' && !eraseMode }"
            :title="!isMobile && collapsed ? 'Terrain' : undefined"
            @click="selectTool('terrain')"
          >
            <UIcon name="i-heroicons-squares-2x2" class="text-lg" />
            <span v-if="!(!isMobile && collapsed)" class="label">Terrain</span>
          </button>
          <button
            type="button"
            class="tool-btn"
            :class="{ 'is-active': tool === 'overlay' && !eraseMode }"
            :title="!isMobile && collapsed ? 'Overlay' : undefined"
            @click="selectTool('overlay')"
          >
            <UIcon name="i-heroicons-sparkles" class="text-lg" />
            <span v-if="!(!isMobile && collapsed)" class="label">Overlay</span>
          </button>
          <button
            type="button"
            class="tool-btn"
            :class="{ 'is-active': isPathsTab && !eraseMode }"
            :title="!isMobile && collapsed ? 'Paths' : undefined"
            @click="selectPathsTab"
          >
            <UIcon name="i-heroicons-pencil" class="text-lg" />
            <span v-if="!(!isMobile && collapsed)" class="label">Paths</span>
          </button>
        </div>
        <button
          type="button"
          class="tool-btn erase-btn"
          :class="{ 'is-active': eraseMode }"
          :aria-label="`Erase · ${eraseScopeLabel}`"
          :title="`Erase · ${eraseScopeLabel}`"
          @click="toggleErase"
        >
          <UIcon name="i-heroicons-no-symbol" class="text-lg" />
        </button>
      </div>

      <!-- Search input (hidden when collapsed or in erase-only mode) -->
      <div v-if="showSearch && (!isMobile || sheetState === 'expanded')" class="search-row">
        <UInput
          v-model="search"
          placeholder="Search tiles…"
          icon="i-heroicons-magnifying-glass"
          size="sm"
          class="w-full"
        />
      </div>

      <!-- Palette body -->
      <div v-if="!(!isMobile && collapsed)" class="palette-body">
        <TerrainPalette
          v-if="tool === 'terrain'"
          v-model="activeTerrain"
          :pack="pack"
          :search-query="search"
        />
        <OverlayPalette
          v-else-if="tool === 'overlay'"
          v-model="activeOverlay"
          :pack="pack"
          :search-query="search"
        />
        <div v-else-if="isPathsTab" class="paths-pane">
          <div class="paths-subtabs">
            <button
              type="button"
              class="subtab-btn"
              :class="{ 'is-active': tool === 'edge' }"
              @click="selectTool('edge')"
            >
              <UIcon name="i-heroicons-arrows-right-left" class="text-base" />
              River
            </button>
            <button
              type="button"
              class="subtab-btn"
              :class="{ 'is-active': tool === 'path' }"
              @click="selectTool('path')"
            >
              <UIcon name="i-heroicons-pencil" class="text-base" />
              Path
            </button>
          </div>
          <div v-if="tool === 'edge'" class="edge-info">
            <p class="edge-title">River</p>
            <p class="edge-hint">
              Click near a hex border to mark or unmark it. Painted borders render as a thick
              band shared by both neighbours, like a river running between hexes.
            </p>
          </div>
          <div v-else class="edge-info path-info">
            <p class="edge-title">Path tool</p>
            <p class="edge-hint">
              Tap or click on the map to drop anchor points. The path auto-smooths between
              anchors and renders as a red dashed trail.
            </p>
            <div class="path-actions">
              <UButton
                size="sm"
                color="primary"
                :disabled="!canFinishPath"
                icon="i-heroicons-check"
                @click="emit('finishPath')"
              >
                Finish ({{ props.pathDraftAnchorCount ?? 0 }} anchor{{ (props.pathDraftAnchorCount ?? 0) === 1 ? '' : 's' }})
              </UButton>
              <UButton
                size="sm"
                variant="soft"
                :disabled="!hasPathDraft"
                icon="i-heroicons-arrow-uturn-left"
                @click="emit('undoPathAnchor')"
              >
                Undo last anchor
              </UButton>
              <UButton
                size="sm"
                variant="soft"
                color="neutral"
                :disabled="!hasPathDraft"
                icon="i-heroicons-x-mark"
                @click="emit('cancelPath')"
              >
                Cancel
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Status footer -->
      <div v-if="!(!isMobile && collapsed)" class="status-footer" :class="{ 'is-erasing': eraseMode }">
        <UIcon
          :name="eraseMode ? 'i-heroicons-no-symbol' : tool === 'terrain' ? 'i-heroicons-squares-2x2' : 'i-heroicons-sparkles'"
          class="text-base"
        />
        <span class="status-text" :title="statusLabel">{{ statusLabel }}</span>
      </div>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.editor-shell {
  display: contents;
}

.sidebar {
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  width: 320px;
  flex-shrink: 0;
  position: relative;

  :where(html.dark) & {
    background: #1a1d23;
    border-right-color: rgba(255, 255, 255, 0.08);
  }
}

.editor-shell.is-collapsed .sidebar {
  width: 56px;
}

/* Mobile bottom-sheet layout */
.editor-shell.is-mobile .sidebar {
  position: fixed;
  inset-x: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-height: 85vh;
  z-index: 40;
  border-right: none;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);
  transition: transform 0.25s ease, height 0.25s ease;
}

.editor-shell.is-mobile.sheet-peek .sidebar {
  height: 35vh;
}

.editor-shell.is-mobile.sheet-expanded .sidebar {
  height: 85vh;
}

.sheet-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.18);
  z-index: 35;
}

.fab {
  position: fixed;
  // Clear the device's home indicator / browser bottom bar on mobile.
  bottom: calc(16px + env(safe-area-inset-bottom));
  right: 16px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: #111;
  color: white;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;

  &:hover { background: #333; }
}

.sheet-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 8px 0 4px;
  cursor: pointer;

  .grabber {
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: rgba(0, 0, 0, 0.25);
  }
}

.collapse-toggle {
  position: absolute;
  // Sit above the status-footer (~32px tall) with breathing room.
  bottom: 44px;
  right: -12px;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.12);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  color: inherit;

  &:hover { background: #f0f0f0; }

  :where(html.dark) & {
    background: #2a2d33;
    border-color: rgba(255, 255, 255, 0.12);
    color: #e5e7eb;
    &:hover { background: #353941; }
  }
}

.tool-tabs {
  display: flex;
  gap: 4px;
  padding: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  // The outer container does NOT scroll — the inner .tool-tabs-scroll handles
  // overflow so the Erase button stays pinned to the right edge.
  flex-wrap: nowrap;
  align-items: center;

  :where(html.dark) & {
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }

  .tool-tabs-scroll {
    flex: 1 1 auto;
    // min-width: 0 is critical — otherwise a flex item refuses to shrink below
    // its content width and would push the Erase button off-sidebar.
    min-width: 0;
    display: flex;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;

    // Minimalistic horizontal scrollbar: very thin, transparent track, faint
    // thumb that brightens on hover. Firefox via scrollbar-* properties,
    // Chromium/Safari via the ::-webkit-scrollbar pseudo-elements.
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.18) transparent;
    &::-webkit-scrollbar { height: 3px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.18);
      border-radius: 3px;
    }
    &::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.35); }

    :where(html.dark) & {
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
      &::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); }
      &::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.4); }
    }
  }

  &.rail {
    flex-direction: column;
    // Bottom padding clears the collapse toggle docked at bottom: 44px so the
    // last rail button doesn't run into it on the right edge.
    padding: 8px 8px 76px;
    gap: 8px;
    align-items: stretch;

    // In rail mode the scroll wrapper disappears as a layout element so all
    // buttons (including Erase) become direct children of the column.
    .tool-tabs-scroll {
      display: contents;
    }
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    // Don't shrink below the label's intrinsic width — overflow scrolls instead.
    min-width: max-content;
    justify-content: center;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    color: #333;

    &:hover { background: rgba(0, 0, 0, 0.05); }

    &.is-active {
      background: white;
      border-color: rgba(0, 0, 0, 0.15);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    }

    .scope {
      font-weight: 500;
      font-size: 11px;
      opacity: 0.7;
      margin-left: 2px;
    }

    :where(html.dark) & {
      color: #e5e7eb;

      &:hover { background: rgba(255, 255, 255, 0.06); }

      &.is-active {
        background: #2a2d33;
        border-color: rgba(255, 255, 255, 0.18);
        box-shadow: none;
      }
    }
  }

  &.rail .tool-btn {
    flex: 0 0 auto;
    padding: 10px;
    justify-content: center;
  }

  .erase-btn {
    // Pinned right (sibling of .tool-tabs-scroll, not inside it) so it stays
    // visible regardless of how far the tab row has scrolled.
    flex: 0 0 auto;
    min-width: 36px;
    padding: 8px;
    margin-left: 12px;
    // Always-on outline so the button reads as a distinct control even when
    // not active (the .is-active rule below tints both background and border).
    border-color: rgba(0, 0, 0, 0.15);
    position: relative;

    // Vertical divider sitting halfway through the gap between the scroll
    // region and this button. Hidden in rail mode (column layout) where the
    // column-gap is the natural separator.
    &::before {
      content: '';
      position: absolute;
      left: -6px;
      top: 4px;
      bottom: 4px;
      width: 1px;
      background: rgba(0, 0, 0, 0.1);
    }

    :where(html.dark) & {
      border-color: rgba(255, 255, 255, 0.18);
      &::before { background: rgba(255, 255, 255, 0.1); }
    }
  }

  &.rail .erase-btn::before { display: none; }

  .erase-btn.is-active {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #b91c1c;
  }

  :where(html.dark) & .erase-btn.is-active {
    background: rgba(185, 28, 28, 0.22);
    border-color: rgba(252, 165, 165, 0.5);
    color: #fca5a5;
  }
}

.search-row {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);

  :where(html.dark) & {
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }
}

.palette-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.edge-info {
  font-size: 13px;
  line-height: 1.45;
  color: #444;

  .edge-title {
    font-weight: 700;
    margin-bottom: 6px;
  }

  .edge-hint { color: #666; }

  :where(html.dark) & {
    color: #e5e7eb;
    .edge-hint { color: #9ca3af; }
  }
}

.path-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.paths-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.paths-subtabs {
  display: flex;
  gap: 4px;
  padding: 2px;
  background: rgba(127, 127, 127, 0.1);
  border-radius: 8px;

  .subtab-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;

    &:hover { background: rgba(127, 127, 127, 0.12); }

    &.is-active {
      background: white;
      border-color: rgba(0, 0, 0, 0.12);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    :where(html.dark) & {
      &.is-active {
        background: #2a2d33;
        border-color: rgba(255, 255, 255, 0.16);
        box-shadow: none;
      }
    }
  }
}

.status-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  font-weight: 600;
  color: #444;

  .status-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &.is-erasing { color: #b91c1c; }

  :where(html.dark) & {
    border-top-color: rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.25);
    color: #d1d5db;

    &.is-erasing { color: #fca5a5; }
  }
}
</style>
