import { Grid, Orientation, rectangle } from 'honeycomb-grid'
import { createCustomHex, type CustomHex } from '~/classes/CustomHex'
import type { TerrainTypes } from '~/utils/terrainGenerator'

export const useHexGrid = () => {
    const isCreating = ref(false)
    const grid = ref<any>(null)
    const hexArray = ref<CustomHex[]>([])
    const boundingBox = ref<{ minX: number, minY: number, maxX: number, maxY: number } | null>(null)

    const createGrid = (
        width: number,
        height: number,
        orientation: Orientation,
        getTerrain: (hex: CustomHex) => TerrainTypes,
    ) => {
        isCreating.value = true

        const hex = createCustomHex(orientation)
        const generatedGrid = new Grid(hex, rectangle({ width, height }))

        let minX = Infinity, minY = Infinity
        let maxX = -Infinity, maxY = -Infinity

        const square = rectangle({ start: [0, 0], width, height })
        const hexes = generatedGrid.traverse(square)

        hexes.forEach((hex: CustomHex) => {
            hex.terrain = getTerrain(hex)
            hex.corners.forEach(({ x, y }) => {
                minX = Math.min(minX, x)
                minY = Math.min(minY, y)
                maxX = Math.max(maxX, x)
                maxY = Math.max(maxY, y)
            })
        })

        hexArray.value = [...hexes]
        boundingBox.value = { minX, minY, maxX, maxY }
        grid.value = markRaw(generatedGrid)

        isCreating.value = false

        return generatedGrid
    }

    return {
        grid,
        hexArray,
        boundingBox,
        createGrid,
        isCreating
    }
}
