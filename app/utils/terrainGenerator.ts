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

export enum TerrainTypes {
    Sea = 0,
    Swamp = 1,
    Blank = 2,
    Grass = 3,
    Desert = 4,
    Wetlands = 5
}

interface VariantPack {
    pack: 'hexes' | 'hexes2'
    folder: string
    files: string[]
}

export const TerrainVariants: Record<keyof typeof TerrainTypes, VariantPack> = {
    Sea:      { pack: 'hexes2', folder: 'sea',       files: ['sea1.png'] },
    Swamp:    { pack: 'hexes2', folder: 'deadlands', files: ['deadlands1.png', 'deadlands2.png'] },
    Blank:    { pack: 'hexes2', folder: 'blank',     files: ['blank1.png'] },
    Grass:    { pack: 'hexes2', folder: 'grass',     files: ['grass1.png', 'grass2.png', 'grass3.png'] },
    Desert:   { pack: 'hexes2', folder: 'desert',    files: ['desert1.png', 'desert2.png', 'desert3.png', 'desert4.png', 'desert5.png', 'desert6.png', 'desert7.png'] },
    Wetlands: { pack: 'hexes2', folder: 'wetlands',  files: ['wetands1.png', 'wetlands2.png', 'wetlands3.png', 'wetlands4.png', 'wetlands5.png', 'wetlands6.png'] }
}

const FALLBACK_TERRAIN: keyof typeof TerrainTypes = 'Blank'

function resolveVariantPack(terrainType: TerrainTypes): VariantPack {
    const key = TerrainTypes[terrainType] as keyof typeof TerrainVariants | undefined
    if (key && TerrainVariants[key]) return TerrainVariants[key]
    return TerrainVariants[FALLBACK_TERRAIN]
}

const variantUrl = (v: VariantPack, index: number): string => {
    const safeIndex = ((index % v.files.length) + v.files.length) % v.files.length
    const file = v.files[safeIndex]
    return v.folder ? `/media/${v.pack}/${encodeURIComponent(v.folder)}/${file}` : `/media/${v.pack}/${file}`
}

/**
 * Get a random terrain variant image path for a given terrain type
 */
export const getRandomTerrainVariant = (terrainType: TerrainTypes): string => {
    const v = resolveVariantPack(terrainType)
    return variantUrl(v, randomRoll(v.files.length))
}

/**
 * Get terrain variant by specific index (for deterministic selection)
 */
export const getTerrainVariantByIndex = (terrainType: TerrainTypes, variantIndex: number): string => {
    return variantUrl(resolveVariantPack(terrainType), variantIndex)
}

// ----------------------------------------------------------------------------
// Overlays: stackable on top of base terrain (one per category per hex).
// POIs are placed free-form (not snapped to a hex).
// ----------------------------------------------------------------------------

export type OverlayCategory = 'river' | 'path' | 'poi'

export const OverlayCategories: readonly OverlayCategory[] = ['river', 'path', 'poi']

export const OverlayCategoryLabels: Record<OverlayCategory, string> = {
    river: 'River',
    path: 'Path',
    poi: 'POI',
}

export type OverlayVariantEntry = string | { folder: string; file: string }

export const OverlayVariants: Record<OverlayCategory, { folder: string; files: OverlayVariantEntry[] }> = {
    river: { folder: 'rivers',             files: ['river01.png','river02.png','river03.png','river04.png','river05.png','river06.png','river07.png','river08.png','river09.png','river10.png','river11.png','river12.png','river13.png','river14.png','river15.png'] },
    path:  { folder: 'paths',              files: ['r1.png','r2.png','r3.png','r4.png','r5.png','r6.png','r7.png','r8.png','r9.png','r10.png','r11.png','r12.png','r13.png','r14.png','r15.png'] },
    poi:   { folder: 'points of interest', files: [
        's01.png','s02.png','s03.png','s04.png','s05.png','s06.png','s07.png','s08.png','s09.png','s10.png','s11.png','s12.png','s13.png','s14.png','s15.png','s17.png','s18.png',
        { folder: 'sea', file: 'sea2.png' },
        { folder: 'sea', file: 'sea6.png' },
        { folder: 'hills', file: 'hills1.png' },
        { folder: 'hills', file: 'hills2.png' },
        { folder: 'hills', file: 'hills3.png' },
        { folder: 'hills', file: 'hills4.png' },
        { folder: 'hills', file: 'hills5.png' },
        { folder: 'hills', file: 'hills6.png' },
        { folder: 'mountains', file: 'mountain1.png' },
        { folder: 'mountains', file: 'mountain2.png' },
        { folder: 'mountains', file: 'mountain3.png' },
        { folder: 'mountains', file: 'mountain4.png' },
        { folder: 'mountains', file: 'mountain5.png' },
        { folder: 'forest', file: 'forest1.png' },
        { folder: 'forest', file: 'forest2.png' },
        { folder: 'forest', file: 'forest3.png' },
        { folder: 'forest', file: 'forest4.png' },
        { folder: 'forest', file: 'forest5.png' },
        { folder: 'fields', file: 'field1.png' },
        { folder: 'fields', file: 'field2.png' },
        { folder: 'fields', file: 'field3.png' },
        { folder: 'fields', file: 'field4.png' },
    ] },
}

export const overlayVariantFilename = (entry: OverlayVariantEntry): string =>
    typeof entry === 'string' ? entry : entry.file

export const getOverlayPath = (category: OverlayCategory, index: number): string => {
    const v = OverlayVariants[category]
    const safeIndex = ((index % v.files.length) + v.files.length) % v.files.length
    const entry = v.files[safeIndex]!
    const folder = typeof entry === 'string' ? v.folder : entry.folder
    const file = typeof entry === 'string' ? entry : entry.file
    return `/media/hexes2/${encodeURIComponent(folder)}/${file}`
}

// Helper function to get terrain key name
export const getTerrainKeyByIndex = (index: number): keyof typeof TerrainTypes => {
    return TerrainTypes[index] as keyof typeof TerrainTypes
}
