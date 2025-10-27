import { Grid, Orientation, rectangle } from 'honeycomb-grid'
import { createCustomHex, type CustomHex } from '~/classes/CustomHex'
import { getDangerLevel, TerrainNoiseGenerator, type NoiseConfig } from '~/utils/terrainGenerator'

export const useHexGrid = () => {
    const isCreating = ref(false)
    const grid = ref<any>(null)
    const hexArray = ref<CustomHex[]>([])
    const boundingBox = ref<{ minX: number, minY: number, maxX: number, maxY: number } | null>(null)
    const noiseGenerator = ref<TerrainNoiseGenerator | null>(null)

    const createGrid = (width: number, height: number, orientation: Orientation, noiseConfig?: Partial<NoiseConfig>) => {
        isCreating.value = true

        const hex = createCustomHex(orientation)
        const generatedGrid = new Grid(hex, rectangle({ width, height }))

        // Initialize noise generator
        noiseGenerator.value = new TerrainNoiseGenerator(noiseConfig)

        // Initialize bounding box
        let minX = Infinity, minY = Infinity
        let maxX = -Infinity, maxY = -Infinity

        // Traverse all hexes in grid
        const square = rectangle({ start: [0, 0], width, height })
        const hexes = generatedGrid.traverse(square)

        hexes.forEach((hex: CustomHex) => {
            // Generate terrain using noise
            hex.terrain = noiseGenerator.value!.getTerrainIndex(hex)
            // hex.danger_level = getDangerLevel()

            // Calculate bounding box
            hex.corners.forEach(({ x, y }) => {
                minX = Math.min(minX, x)
                minY = Math.min(minY, y)
                maxX = Math.max(maxX, x)
                maxY = Math.max(maxY, y)
            })
        })

        // Store the hex array and bounding box
        hexArray.value = [...hexes]
        boundingBox.value = { minX, minY, maxX, maxY }

        console.log('Grid created with noise-based terrain')
        console.log('Hex count:', hexArray.value.length)

        // Use markRaw to prevent Vue from making the Grid reactive
        grid.value = markRaw(generatedGrid)

        isCreating.value = false

        return generatedGrid
    }

    return {
        grid,
        hexArray,
        boundingBox,
        noiseGenerator,
        createGrid,
        isCreating
    }
}