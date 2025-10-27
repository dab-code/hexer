export const randomRoll = (entryCount: number) => {
    return Math.floor((Math.random() * entryCount))
}

export const multipleRolls = (entryCount: number, rolls: number) => {
    let total = 0

    for(let i = 0; i < rolls; i++) {
        total += randomRoll(entryCount)
    }

    return total
}

// Danger level
enum DangerLevel {
    Safe = 0,
    Unsafe = 1,
    Risky = 2,
    Deadly = 3
}
export const getDangerLevelKeyByValue = (value: number): keyof typeof DangerLevel | undefined => {
    return DangerLevel[value] as keyof typeof DangerLevel | undefined
}
const dangerLevelsWeighted = [
    DangerLevel.Safe,
    DangerLevel.Unsafe,
    DangerLevel.Unsafe,
    DangerLevel.Risky,
    DangerLevel.Risky,
    DangerLevel.Deadly
]
export const getDangerLevel = () => dangerLevelsWeighted[randomRoll(dangerLevelsWeighted.length)] ?? DangerLevel.Safe

// Terrain
import { createNoise2D } from 'simplex-noise'
import type { CustomHex } from '~/classes/CustomHex'

export enum TerrainTypes {
    Sea = 0,
    Swamp = 1,
    Desert = 2,
    Grass = 3,
    Forest = 4,
    Hills = 5,
    Mountains = 6
}

export enum TerrainColors {
    Sea = '#417C9B',         // Deep blue water
    Swamp = '#76a390ff',       // Muted swamp green
    Desert = '#dad5a9ff',      // Sandy beige
    Grass = '#86BD8F',       // Light green
    Forest = '#77ad80ff',      // Dark green
    Hills = '#7BA276',       // Brown/tan
    Mountains = '#b2bfc6ff'  // Gray
}

// Terrain variant images
export const TerrainVariants = {
    Sea: ['sea1.png'],
    Swamp: ['deadlands1.png', 'deadlands2.png'],
    Desert: ['desert1.png', 'desert2.png', 'desert3.png', 'desert4.png', 'desert6.png', 'desert7.png'],
    Grass: ['grass1.png', 'grass2.png'],
    Forest: ['forest1.png', 'forest2.png', 'forest3.png', 'forest4.png'],
    Hills: ['hills1.png', 'hills2.png', 'hills3.png', 'hills4.png'],
    Mountains: ['mountain1.png', 'mountain2.png']
}

/**
 * Get a random terrain variant image path for a given terrain type
 */
export const getRandomTerrainVariant = (terrainType: TerrainTypes): string => {
    const terrainKey = TerrainTypes[terrainType] as keyof typeof TerrainVariants
    const variants = TerrainVariants[terrainKey]
    const randomIndex = randomRoll(variants.length)
    return `/media/hexes/${variants[randomIndex]}`
}

/**
 * Get terrain variant by specific index (for deterministic selection)
 */
export const getTerrainVariantByIndex = (terrainType: TerrainTypes, variantIndex: number): string => {
    const terrainKey = TerrainTypes[terrainType] as keyof typeof TerrainVariants
    const variants = TerrainVariants[terrainKey]
    const index = variantIndex % variants.length // Wrap around if index exceeds variants
    return `/media/hexes/${variants[index]}`
}

export interface TerrainDistribution {
    sea: number        // 0-100 (percentage)
    swamp: number      // 0-100
    desert: number     // 0-100
    grass: number      // 0-100
    forest: number     // 0-100
    hills: number      // 0-100
    mountains: number  // 0-100
}

export const DEFAULT_TERRAIN_DISTRIBUTION: TerrainDistribution = {
    sea: 30,
    swamp: 10,
    desert: 10,
    grass: 20,
    forest: 15,
    hills: 10,
    mountains: 5
}

export interface NoiseConfig {
    seed?: string
    scale: number           // Controls "zoom level" of noise (0.01 = zoomed out, 0.1 = zoomed in)
    octaves: number         // Number of noise layers (more = more detail)
    persistence: number     // How much each octave contributes (0-1)
    lacunarity: number      // How much detail is added per octave (usually 2)
    redistribution: number  // Exponent to redistribute height values (1 = linear, 2+ = more land, 0.5 = more water)
    terrainDistribution: TerrainDistribution
}

export const DEFAULT_NOISE_CONFIG: NoiseConfig = {
    scale: 0.1,
    octaves: 2,
    persistence: 0.5,
    lacunarity: 2,
    redistribution: 1.0,
    terrainDistribution: DEFAULT_TERRAIN_DISTRIBUTION
}

export class TerrainNoiseGenerator {
    private noise2D: ReturnType<typeof createNoise2D>
    private config: NoiseConfig
    private heightThresholds: number[] = []

    constructor(config: Partial<NoiseConfig> = {}) {
        this.config = { ...DEFAULT_NOISE_CONFIG, ...config }

        // Use seed if provided, otherwise random
        const seed = this.config.seed ? this.hashString(this.config.seed) : Math.random()
        this.noise2D = createNoise2D(() => seed)

        // Calculate thresholds based on distribution
        this.calculateThresholds()
    }

    private hashString(str: string): number {
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }
        return Math.abs(hash) / 2147483647 // Normalize to 0-1
    }

    /**
     * Calculate height thresholds based on terrain distribution percentages
     */
    private calculateThresholds() {
        const dist = this.config.terrainDistribution

        // Normalize percentages to sum to 100
        const total = dist.sea + dist.swamp + dist.desert + dist.grass +
                     dist.forest + dist.hills + dist.mountains

        const normalized = {
            sea: dist.sea / total,
            swamp: dist.swamp / total,
            desert: dist.desert / total,
            grass: dist.grass / total,
            forest: dist.forest / total,
            hills: dist.hills / total,
            mountains: dist.mountains / total
        }

        // Calculate cumulative thresholds
        this.heightThresholds = [
            normalized.sea,
            normalized.sea + normalized.swamp,
            normalized.sea + normalized.swamp + normalized.desert,
            normalized.sea + normalized.swamp + normalized.desert + normalized.grass,
            normalized.sea + normalized.swamp + normalized.desert + normalized.grass + normalized.forest,
            normalized.sea + normalized.swamp + normalized.desert + normalized.grass + normalized.forest + normalized.hills,
            1.0 // mountains
        ]
    }

    /**
     * Generate layered octave noise for a position
     */
    private getNoiseValue(x: number, y: number): number {
        let total = 0
        let frequency = 1
        let amplitude = 1
        let maxValue = 0

        for (let i = 0; i < this.config.octaves; i++) {
            const sampleX = x * this.config.scale * frequency
            const sampleY = y * this.config.scale * frequency

            // simplex-noise returns values between -1 and 1
            const noiseValue = this.noise2D(sampleX, sampleY)

            total += noiseValue * amplitude
            maxValue += amplitude

            amplitude *= this.config.persistence
            frequency *= this.config.lacunarity
        }

        // Normalize to 0-1
        const normalized = (total / maxValue + 1) / 2

        // Apply redistribution curve
        return Math.pow(normalized, this.config.redistribution)
    }

    /**
     * Map height value (0-1) to terrain type based on dynamic thresholds
     */
    private heightToTerrain(height: number): TerrainTypes {
        if (height < this.heightThresholds[0]) return TerrainTypes.Sea
        if (height < this.heightThresholds[1]) return TerrainTypes.Swamp
        if (height < this.heightThresholds[2]) return TerrainTypes.Desert
        if (height < this.heightThresholds[3]) return TerrainTypes.Grass
        if (height < this.heightThresholds[4]) return TerrainTypes.Forest
        if (height < this.heightThresholds[5]) return TerrainTypes.Hills
        return TerrainTypes.Mountains
    }

    /**
     * Generate terrain for a hex based on its coordinates
     */
    public getTerrainForHex(hex: CustomHex): { terrain: TerrainTypes, height: number } {
        const height = this.getNoiseValue(hex.q, hex.r)
        const terrain = this.heightToTerrain(height)

        return { terrain, height }
    }

    /**
     * Get terrain type index (for compatibility with existing code)
     */
    public getTerrainIndex(hex: CustomHex): number {
        return this.getTerrainForHex(hex).terrain
    }

    /**
     * Update config and regenerate noise
     */
    public updateConfig(newConfig: Partial<NoiseConfig>) {
        this.config = { ...this.config, ...newConfig }
        if (newConfig.seed !== undefined) {
            const seed = this.hashString(newConfig.seed)
            this.noise2D = createNoise2D(() => seed)
        }

        // Recalculate thresholds if distribution changed
        if (newConfig.terrainDistribution) {
            this.calculateThresholds()
        }
    }
}

// Helper function to get terrain key name
export const getTerrainKeyByIndex = (index: number): keyof typeof TerrainTypes => {
    return TerrainTypes[index] as keyof typeof TerrainTypes
}