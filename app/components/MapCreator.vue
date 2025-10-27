<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from "vue";
import { z } from "zod";
import { SVG } from "@svgdotjs/svg.js";
import type { FormSubmitEvent } from "#ui/types";
import { Orientation } from "honeycomb-grid";
import { type CustomHex } from "~/classes/CustomHex";
import { TerrainColors, getTerrainKeyByIndex, DEFAULT_NOISE_CONFIG, DEFAULT_TERRAIN_DISTRIBUTION, type NoiseConfig, type TerrainDistribution, getRandomTerrainVariant } from "~/utils/terrainGenerator";
import { generateSeed } from "~/utils/seedGenerator";

// ============================================================================
// Types & Schema
// ============================================================================

const schema = z.object({
  mapName: z.string({ error: "Name is required" }).min(3, "Must be at least 3 characters"),
  hexOrientation: z.literal([Orientation.FLAT, Orientation.POINTY], { error: "Please select an orientation" }),
  sizeW: z.number({ error: "Must be between 5 and 50" }).gte(5).lte(50),
  sizeH: z.number({ error: "Must be between 5 and 50" }).gte(5).lte(50),
});

type Schema = z.output<typeof schema>;

// ============================================================================
// Constants
// ============================================================================

const ORIENTATION_OPTIONS = [Orientation.FLAT, Orientation.POINTY];
const MAX_MAP_WIDTH = 600;
const MAX_MAP_HEIGHT = 600;
const SVG_PADDING = 2;

// ============================================================================
// State
// ============================================================================

const state = reactive({
  mapName: undefined,
  hexOrientation: Orientation.POINTY,
  sizeW: 5,
  sizeH: 5,
});

const showAdvanced = ref(false);

const terrainDistribution = reactive<TerrainDistribution>({
  ...DEFAULT_TERRAIN_DISTRIBUTION,
});

const noiseConfig = reactive<NoiseConfig>({
  seed: "",
  scale: DEFAULT_NOISE_CONFIG.scale,
  octaves: DEFAULT_NOISE_CONFIG.octaves,
  persistence: DEFAULT_NOISE_CONFIG.persistence,
  lacunarity: DEFAULT_NOISE_CONFIG.lacunarity,
  redistribution: DEFAULT_NOISE_CONFIG.redistribution,
  terrainDistribution: terrainDistribution,
});

const mapRef = ref<HTMLElement>();
const selectedHex = ref<CustomHex | null>(null);
const isLoading = ref(false);

// ============================================================================
// Composables
// ============================================================================

const toast = useToast();
const router = useRouter();
const { grid, hexArray, boundingBox, createGrid, isCreating } = useHexGrid();

// ============================================================================
// Computed
// ============================================================================

// ============================================================================
// Watchers
// ============================================================================

watch(grid, async (newVal) => {
  if (!newVal) return;
  await nextTick();
  generateMapSVG();
});

// ============================================================================
// Methods - SVG Generation
// ============================================================================

function generateMapSVG() {
  if (!mapRef.value || !hexArray.value.length || !boundingBox.value) return;

  mapRef.value.innerHTML = "";

  const draw = SVG().addTo(mapRef.value);
  const { minX, minY, maxX, maxY } = boundingBox.value;
  const width = maxX - minX;
  const height = maxY - minY;

  // Calculate scale to fit within max dimensions while maintaining aspect ratio
  const scaleX = MAX_MAP_WIDTH / width;
  const scaleY = MAX_MAP_HEIGHT / height;
  const scale = Math.min(scaleX, scaleY);

  const svgWidth = width * scale;
  const svgHeight = height * scale;

  draw.size(svgWidth, svgHeight).viewbox(minX - SVG_PADDING, minY - SVG_PADDING, width + SVG_PADDING * 2, height + SVG_PADDING * 2);

  const defs = draw.defs();

  hexArray.value.forEach((hex, index) => {
    const corners = hex.corners.map((corner) => `${corner.x},${corner.y}`).join(" ");
    const terrainKey = getTerrainKeyByIndex(hex.terrain);
    const terrainAsset = getRandomTerrainVariant(hex.terrain);
    const color = TerrainColors[terrainKey];

    // Calculate hex bounding box
    const hexBounds = {
      x: Math.min(...hex.corners.map((c) => c.x)),
      y: Math.min(...hex.corners.map((c) => c.y)),
      width: Math.max(...hex.corners.map((c) => c.x)) - Math.min(...hex.corners.map((c) => c.x)),
      height: Math.max(...hex.corners.map((c) => c.y)) - Math.min(...hex.corners.map((c) => c.y)),
    };

    // Create clip path for this hex
    const clipId = `hex-clip-${index}`;
    defs.clip().attr("id", clipId).polygon(corners);

    // Create a group for this hex
    const hexGroup = draw.group();

    // Background color polygon
    hexGroup.polygon(corners).fill(color);

    // Image clipped to hex shape
    hexGroup.image(terrainAsset).size(hexBounds.width, hexBounds.height).move(hexBounds.x, hexBounds.y).attr("clip-path", `url(#${clipId})`);

    // Border stroke
    hexGroup.polygon(corners).fill("none").stroke({ color: "#333", width: 0.05 });

    hexGroup.node.addEventListener("click", () => {
      selectedHex.value = hex;
      console.log("Selected hex:", hex);
    });
  });
}

// ============================================================================
// Methods - Map Generation
// ============================================================================

async function handleGenerateMap() {
  await createGrid(state.sizeW, state.sizeH, state.hexOrientation, noiseConfig);
}

// ============================================================================
// Methods - Utilities
// ============================================================================

function randomizeSeed() {
  noiseConfig.seed = generateSeed();
}

function resetDistribution() {
  Object.assign(terrainDistribution, DEFAULT_TERRAIN_DISTRIBUTION);
}

// ============================================================================
// Methods - Form Submission
// ============================================================================

async function onSubmit(event: FormSubmitEvent<Schema>) {
  console.log("Creating map with:", event.data);

  try {
    const response = await $fetch("/api/maps/create", {
      method: "POST",
      body: {
        mapName: event.data.mapName,
        hexOrientation: event.data.hexOrientation,
        sizeW: event.data.sizeW,
        sizeH: event.data.sizeH,
      },
    });

    console.log("Map created:", response);

    toast.add({
      title: "Map created successfully",
      description: `"${event.data.mapName}" has been forged`,
      color: "primary",
    });

    router.push(`/maps/${response.data.id}`);
  } catch (error) {
    console.error("Error creating map:", error);
    toast.add({
      title: "Error creating map",
      description: error.message || "An unexpected error occurred",
      color: "error",
    });
  }
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(() => {
  randomizeSeed();
  handleGenerateMap();
});
</script>

<template>
  <UCard class="w-full flex flex-col h-full">
    <template #header>
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold">Forge a New World</h2>
      </div>
    </template>

    <section class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
      <!-- Settings Panel -->
      <div class="lg:col-span-1">
        <UForm :schema="schema" :state="state" @submit="onSubmit" class="space-y-6">
          <UFormField label="World Name" name="mapName" required>
            <UInput v-model="state.mapName" placeholder="The Forgotten Realm" />
          </UFormField>

          <UFormField label="Hex Orientation" name="hexOrientation" required>
            <USelect v-model="state.hexOrientation" :options="ORIENTATION_OPTIONS" disabled />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Width" name="sizeW" required>
              <UInputNumber v-model="state.sizeW" :min="5" :max="50" />
            </UFormField>

            <UFormField label="Height" name="sizeH" required>
              <UInputNumber v-model="state.sizeH" :min="5" :max="50" />
            </UFormField>
          </div>

          <USeparator />

          <div class="space-y-3">
            <UFormField label="Seed" help="A unique identifier for this world's terrain generation">
              <div class="flex gap-2">
                <UInput v-model="noiseConfig.seed" placeholder="my-world" class="flex-1" />
                <UButton icon="i-heroicons-arrow-path" @click="randomizeSeed" />
              </div>
            </UFormField>
          </div>

          <USeparator />

          <div class="space-y-3">
            <div class="flex justify-between items-center text-sm">
              <h3 class="text-xl font-bold">Terrain Distribution</h3>
              <UButton size="xs" variant="ghost" @click="resetDistribution">Reset</UButton>
            </div>

            <UFormField label="Sea">
              <USlider v-model="terrainDistribution.sea" :min="0" :max="100" class="w-full" />
            </UFormField>

            <UFormField label="Swamp">
              <USlider v-model="terrainDistribution.swamp" :min="0" :max="100" class="w-full" />
            </UFormField>

            <UFormField label="Desert">
              <USlider v-model="terrainDistribution.desert" :min="0" :max="100" class="w-full" />
            </UFormField>

            <UFormField label="Grass">
              <USlider v-model="terrainDistribution.grass" :min="0" :max="100" class="w-full" />
            </UFormField>

            <UFormField label="Forest">
              <USlider v-model="terrainDistribution.forest" :min="0" :max="100" class="w-full" />
            </UFormField>

            <UFormField label="Hills">
              <USlider v-model="terrainDistribution.hills" :min="0" :max="100" class="w-full" />
            </UFormField>

            <UFormField label="Mountains">
              <USlider v-model="terrainDistribution.mountains" :min="0" :max="100" class="w-full" />
            </UFormField>
          </div>

          <UButton variant="ghost" block @click="showAdvanced = !showAdvanced" :icon="showAdvanced ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" trailing>Advanced settings</UButton>

          <div v-show="showAdvanced" class="space-y-4">
            <UFormField label="Terrain Feature Size" help="Controls how large terrain features are. Lower values create larger continents and biomes, higher values create more varied, smaller features.">
              <UInputNumber v-model="noiseConfig.scale" :min="0.01" :max="0.2" :step="0.01" class="w-full" />
            </UFormField>

            <UFormField label="Terrain Detail Layers" help="Number of detail layers added to the terrain. More layers create more intricate, realistic terrain with smaller features and variations.">
              <UInputNumber v-model="noiseConfig.octaves" :min="1" :max="6" class="w-full" />
            </UFormField>

            <UFormField label="Detail Layer Intensity" help="Controls how much each detail layer contributes. Higher values make fine details more prominent, lower values create smoother terrain.">
              <UInputNumber v-model="noiseConfig.persistence" :min="0.1" :max="1" :step="0.1" class="w-full" />
            </UFormField>

            <UFormField label="Detail Frequency Multiplier" help="Determines how much frequency increases between detail layers. Higher values add smaller, more frequent details to the terrain.">
              <UInputNumber v-model="noiseConfig.lacunarity" :min="1" :max="4" :step="0.1" class="w-full" />
            </UFormField>
          </div>
        </UForm>
      </div>

      <!-- Map Preview Panel with Separator -->
      <div class="lg:col-span-2 flex flex-col lg:flex-row gap-6 overflow-hidden">
        <USeparator orientation="vertical" class="hidden lg:block" />

        <div class="flex-1 flex flex-col min-h-[400px] overflow-hidden">
          <div class="mb-4 flex-shrink-0">
            <h3 class="text-lg font-semibold">Map Preview</h3>
            <p class="text-sm text-gray-500">Preview your world before forging.</p>
          </div>

          <div class="map-container flex-1">
            <div v-if="!grid" class="empty-state">
              <div class="text-center">
                <UIcon name="i-heroicons-map" class="w-16 h-16 mx-auto text-gray-400 mb-3" />
                <p class="text-gray-500">Generate a map to see the preview</p>
              </div>
            </div>
            <div v-else ref="mapRef" class="map-wrapper">
              <div class="map" />
            </div>
          </div>
        </div>
      </div>
    </section>
    <template #footer>
      <!-- Generate button on desktop (hidden on small screens) -->
      <div class="hidden lg:block">
        <UButton type="button" label="Generate Map" :loading="isCreating" size="lg" block @click="handleGenerateMap" />
      </div>
    </template>
  </UCard>
</template>

<style lang="scss" scoped>
.map-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  width: 100%;
  height: 100%;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.map-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

svg {
  max-width: 100%;
  max-height: 100%;
  height: auto;
  display: block;
}
</style>
