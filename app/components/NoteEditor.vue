<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'

const props = defineProps<{
  // 'create' = new draft pin, 'edit' = existing note (editable), 'view' = read-only.
  mode: 'create' | 'edit' | 'view'
  title?: string
  body?: string
}>()

const emit = defineEmits<{
  save: [payload: { title: string; body: string }]
  remove: []
  close: []
}>()

const isMobile = useMediaQuery('(max-width: 767px)')
const readonly = computed(() => props.mode === 'view')

// Local editable copies, reseeded whenever a different note opens.
const draftTitle = ref(props.title ?? '')
const draftBody = ref(props.body ?? '')
watch(
  () => [props.mode, props.title, props.body],
  () => {
    draftTitle.value = props.title ?? ''
    draftBody.value = props.body ?? ''
  },
)

const canSave = computed(() => Boolean(draftTitle.value.trim() || draftBody.value.trim()))

const heading = computed(() =>
  props.mode === 'create' ? 'New note' : props.mode === 'edit' ? 'Edit note' : (props.title?.trim() || 'Note'),
)

function onSave() {
  if (!canSave.value) return
  emit('save', { title: draftTitle.value.trim(), body: draftBody.value.trim() })
}
</script>

<template>
  <div class="note-shell" :class="{ 'is-mobile': isMobile }">
    <div v-if="isMobile" class="note-scrim" @click="emit('close')" />

    <aside class="note-panel">
      <header class="note-header">
        <span class="note-heading">{{ heading }}</span>
        <button type="button" class="note-close" aria-label="Close" @click="emit('close')">
          <UIcon name="i-heroicons-x-mark" class="text-xl" />
        </button>
      </header>

      <!-- Read-only view -->
      <div v-if="readonly" class="note-body note-read">
        <h3 v-if="title?.trim()" class="read-title">{{ title }}</h3>
        <p v-if="body?.trim()" class="read-text">{{ body }}</p>
        <p v-else class="read-empty">No additional details.</p>
      </div>

      <!-- Editable form -->
      <div v-else class="note-body">
        <UInput
          v-model="draftTitle"
          placeholder="Title (optional)"
          size="md"
          class="w-full"
          autofocus
        />
        <UTextarea
          v-model="draftBody"
          placeholder="Write your note…"
          :rows="8"
          autoresize
          class="w-full"
        />
      </div>

      <footer class="note-footer">
        <template v-if="readonly">
          <UButton variant="soft" color="neutral" class="grow justify-center" @click="emit('close')">
            Close
          </UButton>
        </template>
        <template v-else>
          <UButton
            v-if="mode === 'edit'"
            icon="i-heroicons-trash"
            color="error"
            variant="soft"
            aria-label="Delete note"
            @click="emit('remove')"
          />
          <span class="grow" />
          <UButton variant="ghost" color="neutral" @click="emit('close')">Cancel</UButton>
          <UButton :disabled="!canSave" icon="i-heroicons-check" @click="onSave">
            {{ mode === 'create' ? 'Save' : 'Update' }}
          </UButton>
        </template>
      </footer>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.note-shell {
  display: contents;
}

.note-panel {
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
  border-left: 1px solid rgba(0, 0, 0, 0.08);
  width: 320px;
  flex-shrink: 0;

  :where(html.dark) & {
    background: #1a1d23;
    border-left-color: rgba(255, 255, 255, 0.08);
  }
}

.note-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);

  :where(html.dark) & {
    border-bottom-color: rgba(255, 255, 255, 0.06);
  }
}

.note-heading {
  font-weight: 700;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: inherit;
  border-radius: 6px;
  padding: 2px;

  &:hover { background: rgba(0, 0, 0, 0.06); }
  :where(html.dark) &:hover { background: rgba(255, 255, 255, 0.08); }
}

.note-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.note-read {
  gap: 8px;

  .read-title {
    font-size: 1.05rem;
    font-weight: 700;
  }

  .read-text {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }

  .read-empty {
    color: rgba(0, 0, 0, 0.45);
    font-style: italic;
    :where(html.dark) & { color: rgba(255, 255, 255, 0.4); }
  }
}

.note-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);

  :where(html.dark) & {
    border-top-color: rgba(255, 255, 255, 0.06);
  }

  .grow { flex: 1; }
}

/* Mobile: bottom drawer that overlays the canvas (replaces the palette sheet). */
.note-shell.is-mobile .note-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-height: 80vh;
  z-index: 45;
  border-left: none;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.18);
}

.note-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.18);
  z-index: 44;
}
</style>
