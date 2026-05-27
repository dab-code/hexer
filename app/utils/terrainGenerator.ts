import { Orientation } from 'honeycomb-grid'

export const randomRoll = (entryCount: number) => {
    return Math.floor((Math.random() * entryCount))
}

// ----------------------------------------------------------------------------
// Packs: tile-art families. Orientation picks which pack a map uses.
// ----------------------------------------------------------------------------

export type Pack = 'hexes2' | 'worldhex'

export const packForOrientation = (o: Orientation): Pack =>
    o === Orientation.FLAT ? 'worldhex' : 'hexes2'

// Worldhex asset root (72 DPI). PNG export upgrades these to 300-DPI WebP at
// fetch time — see MapPreview's upgradeUrlForExport.
const WORLDHEX_ROOT_72 = 'worldhex/Assets - 72 DPI'

const encodeSegments = (path: string): string =>
    path.split('/').map(encodeURIComponent).join('/')

// Worldhex assets that ship as 72-DPI PNG only (no 300-DPI WebP twin yet). PNG
// export falls back to the 72-DPI source for these instead of a missing WebP.
// Keyed by bare filename — unique across the worldhex hex + Extras sets.
const WX_72_ONLY: ReadonlySet<string> = new Set<string>([
    // New hexes (root folder)
    'Flat Hex - Anvil Rock.png',
    'Flat Hex - Forest, Mushroom (red) 1.png',
    'Flat Hex - Forest, Mushroom (red) 2.png',
    'Flat Hex - Forest, Mushroom (white) 1.png',
    'Flat Hex - Forest, Mushroom (white) 2.png',
    'Flat Hex - Forest, Stone Circle (lush).png',
    'Flat Hex - Hills (Ice Spikes) 1.png',
    'Flat Hex - Hills (Ice Spikes) 3.png',
    'Flat Hex - Hills (Onyx Spikes) 1.png',
    'Flat Hex - Hills (Onyx Spikes) 3.png',
    // New Extras (POIs) — incl. Wall segments (placed as free stamps)
    'Wall 1.png', 'Wall 2.png', 'Wall 3.png', 'Wall 4.png', 'Wall 5.png',
    'Wall 6.png', 'Wall 7.png', 'Wall 8.png', 'Wall 9.png',
    'Buildings - Farmland Cowpen (lush).png',
    'Buildings - Lighthouse (off).png', 'Buildings - Lighthouse (on).png',
    'Buildings - Observatory.png', 'Buildings - Orchard.png', 'Buildings - Tower Fort.png',
    'Foliage - Mushroom 1 (red).png', 'Foliage - Mushroom 1 (white).png',
    'Foliage - Mushroom 2 (red).png', 'Foliage - Mushroom 2 (white).png',
    'Foliage - Mushroom 3 (red).png', 'Foliage - Mushroom 3 (white).png',
    'Foliage - Mushroom 4 (red).png', 'Foliage - Mushroom 4 (white).png',
    'Foliage - Mushroom 5 (red).png', 'Foliage - Mushroom 5 (white).png',
    'Foliage - Mushroom 6 (red).png', 'Foliage - Mushroom 6 (white).png',
    'Foliage - Mushroom 7 (white).png',
    'Structures - Anvil Rock.png',
    'Structures - Sitting Stone (mossy).png', 'Structures - Sitting Stone (stone).png',
    'Structures - Standing Stone (Broken).png', 'Structures - Standing Stone (mossy).png',
    'Structures - Standing Stone (stone).png',
    'Vehicles - Shipwreck.png',
])

// True for worldhex assets that ship as 72-DPI PNG only (no 300-DPI WebP twin).
// Export paths must keep the 72-DPI source for these — upgrading to WebP would
// point at a missing file. `file` is the bare filename (decoded, no path).
export const isWorldhex72Only = (file: string): boolean => WX_72_ONLY.has(file)

// ----------------------------------------------------------------------------
// Terrain types
// IDs 0–5: existing hexes2 (pointy-top). NEVER renumber — persisted maps refer
// to these by integer. New worldhex terrains use IDs 100+.
// ----------------------------------------------------------------------------

export enum TerrainTypes {
    // hexes2 (pointy-top)
    Sea = 0,
    Swamp = 1,
    Blank = 2,
    Grass = 3,
    Desert = 4,
    Wetlands = 5,

    // worldhex (flat-top) — bases
    WhBaseBlank = 100,
    WhBaseLush = 101,
    WhBaseOcean = 102,
    WhBaseRocky = 103,
    WhBaseSnowy = 104,

    // plains
    WhPlainsLush = 110,
    WhPlainsDamp = 111,
    WhPlainsDesert = 112,
    WhPlainsFarmland = 113,

    // wetlands
    WhWetlandsDamp = 120,

    // snow
    WhSnowArea = 130,
    WhSnowDrifts = 131,
    WhSnowField = 132,

    // hills
    WhHillsLush = 140,
    WhHillsDesert = 141,
    WhHillsSnowy = 142,
    WhHillWithTreeLush = 143,
    WhHillsIceSpikes = 144,
    WhHillsOnyxSpikes = 145,

    // mountains
    WhMountainsFoothillsLush = 150,
    WhMountainsFoothillsRocky = 151,
    WhMountainsFoothillsSnowy = 152,
    WhMountainsLowLush = 153,
    WhMountainsLowRocky = 154,
    WhMountainsLowSnowy = 155,
    WhMountainsMediumLush = 156,
    WhMountainsMediumRocky = 157,
    WhMountainsMediumSnowy = 158,
    WhMountainsPeakLush = 159,
    WhMountainsPeakRocky = 160,
    WhMountainsPeakSnowy = 161,
    WhVolcanoLush = 162,
    WhVolcanoRocky = 163,
    WhVolcanoSnowy = 164,

    // forest
    WhForestConiferLush = 170,
    WhForestConiferSnowy = 171,
    WhForestDeciduousLush = 172,
    WhForestMixedLush = 173,
    WhForestSparseLush = 174,
    WhForestSparseSnowy = 175,
    WhForestMushroomRed = 176,
    WhForestMushroomWhite = 177,
    WhForestStoneCircleLush = 178,

    // water
    WhOceanStill = 180,
    WhOceanWaves = 181,
    WhOceanSoftWaves = 182,
    WhSwampStill = 183,
    WhSwampWaves = 184,
    WhSwampSoftWaves = 185,

    // urban
    WhUrbanCity = 190,
    WhUrbanTown = 191,
    WhUrbanFarm = 192,
    WhUrbanFarmland = 193,
    WhUrbanModernInhabited = 194,
    WhUrbanModernAbandoned = 195,
    WhUrbanLumberYard = 196,
    WhUrbanMonastery = 197,
    WhUrbanTower = 198,

    // ruins
    WhRuinLush = 200,
    WhRuinDesert = 201,

    // landmarks
    WhLandmarkAnvilRock = 210,
}

interface VariantPack {
    pack: Pack
    folder: string
    files: string[]
    label?: string
    group?: string
}

// Worldhex tiles live flat under "Assets - 72 DPI"; folder is the same for all.
const wh = (files: string[], label: string, group: string): VariantPack => ({
    pack: 'worldhex',
    folder: WORLDHEX_ROOT_72,
    files,
    label,
    group,
})

export const TerrainVariants: Record<keyof typeof TerrainTypes, VariantPack> = {
    // ---- hexes2 (pointy-top) ----
    Sea:      { pack: 'hexes2', folder: 'sea',       files: ['sea1.png'] },
    Swamp:    { pack: 'hexes2', folder: 'deadlands', files: ['deadlands1.png', 'deadlands2.png'] },
    Blank:    { pack: 'hexes2', folder: 'blank',     files: ['blank1.png'] },
    Grass:    { pack: 'hexes2', folder: 'grass',     files: ['grass1.png', 'grass2.png', 'grass3.png'] },
    Desert:   { pack: 'hexes2', folder: 'desert',    files: ['desert1.png', 'desert2.png', 'desert3.png', 'desert4.png', 'desert5.png', 'desert6.png', 'desert7.png'] },
    Wetlands: { pack: 'hexes2', folder: 'wetlands',  files: ['wetands1.png', 'wetlands2.png', 'wetlands3.png', 'wetlands4.png', 'wetlands5.png', 'wetlands6.png'] },

    // ---- worldhex (flat-top) ----
    WhBaseBlank: wh(['Hex - Base (blank).png'], 'Blank', 'Base'),
    WhBaseLush:  wh(['Hex - Base (lush).png'],  'Lush',  'Base'),
    WhBaseOcean: wh(['Hex - Base (ocean).png'], 'Ocean', 'Base'),
    WhBaseRocky: wh(['Hex - Base (rocky).png'], 'Rocky', 'Base'),
    WhBaseSnowy: wh(['Hex - Base (snowy).png'], 'Snowy', 'Base'),

    WhPlainsLush:     wh(['Hex - Plains (lush) 1.png','Hex - Plains (lush) 2.png','Hex - Plains (lush) 3.png','Hex - Plains (lush) 4.png','Hex - Plains (lush) 5.png'], 'Plains (lush)', 'Plains'),
    WhPlainsDamp:     wh(['Hex - Plains (damp) 1.png','Hex - Plains (damp) 2.png','Hex - Plains (damp) 3.png','Hex - Plains (damp) 4.png','Hex - Plains (damp) 5.png'], 'Plains (damp)', 'Plains'),
    WhPlainsDesert:   wh(['Hex - Plains (desert) 4.png','Hex - Plains (desert) 5.png'], 'Plains (desert)', 'Plains'),
    WhPlainsFarmland: wh(['Hex - Plains (farmland) 1.png','Hex - Plains (farmland) 2.png','Hex - Plains (farmland) 3.png'], 'Plains (farmland)', 'Plains'),

    WhWetlandsDamp: wh(['Hex - Wetlands (damp) 1.png','Hex - Wetlands (damp) 2.png','Hex - Wetlands (damp) 3.png','Hex - Wetlands (damp) 4.png','Hex - Wetlands (damp) 5.png','Hex - Wetlands (damp) 6.png','Hex - Wetlands (damp) 7.png'], 'Wetlands (damp)', 'Wetlands'),

    WhSnowArea:   wh(['Hex - Snow (area) 1.png','Hex - Snow (area) 2.png'], 'Snow (area)', 'Snow'),
    WhSnowDrifts: wh(['Hex - Snow (drifts) 1.png','Hex - Snow (drifts) 2.png'], 'Snow (drifts)', 'Snow'),
    WhSnowField:  wh(['Hex - Snow (field) 1.png','Hex - Snow (field) 2.png','Hex - Snow (field) 3.png','Hex - Snow (field) 4.png','Hex - Snow (field) 5.png'], 'Snow (field)', 'Snow'),

    WhHillsLush:        wh(['Hex - Hills (lush) 1.png','Hex - Hills (lush) 2.png','Hex - Hills (lush) 3.png','Hex - Hills (lush) 4.png','Hex - Hills (lush) 5.png'], 'Hills (lush)', 'Hills'),
    WhHillsDesert:      wh(['Hex - Hills (desert) 1.png','Hex - Hills (desert) 1b.png','Hex - Hills (desert) 2.png','Hex - Hills (desert) 2b.png','Hex - Hills (desert) 3.png','Hex - Hills (desert) 3b.png','Hex - Hills (desert) 4.png','Hex - Hills (desert) 4b.png'], 'Hills (desert)', 'Hills'),
    WhHillsSnowy:       wh(['Hex - Hills (snowy) 1.png','Hex - Hills (snowy) 2.png','Hex - Hills (snowy) 3.png','Hex - Hills (snowy) 4.png','Hex - Hills (snowy) 5.png'], 'Hills (snowy)', 'Hills'),
    WhHillWithTreeLush: wh(['Hex - Hill with Tree (lush).png'], 'Hill w/ Tree', 'Hills'),
    WhHillsIceSpikes:   wh(['Flat Hex - Hills (Ice Spikes) 1.png','Flat Hex - Hills (Ice Spikes) 3.png'], 'Hills (ice spikes)', 'Hills'),
    WhHillsOnyxSpikes:  wh(['Flat Hex - Hills (Onyx Spikes) 1.png','Flat Hex - Hills (Onyx Spikes) 3.png'], 'Hills (onyx spikes)', 'Hills'),

    WhMountainsFoothillsLush:  wh(['Hex - Mountains, foothills (lush).png'], 'Foothills (lush)', 'Mountains'),
    WhMountainsFoothillsRocky: wh(['Hex - Mountains, foothills (rocky).png'], 'Foothills (rocky)', 'Mountains'),
    WhMountainsFoothillsSnowy: wh(['Hex - Mountains, foothills (snowy).png'], 'Foothills (snowy)', 'Mountains'),
    WhMountainsLowLush:        wh(['Hex - Mountains, low (lush).png'], 'Low (lush)', 'Mountains'),
    WhMountainsLowRocky:       wh(['Hex - Mountains, low (rocky).png'], 'Low (rocky)', 'Mountains'),
    WhMountainsLowSnowy:       wh(['Hex - Mountains, low (snowy).png'], 'Low (snowy)', 'Mountains'),
    WhMountainsMediumLush:     wh(['Hex - Mountains, medium (lush).png'], 'Medium (lush)', 'Mountains'),
    WhMountainsMediumRocky:    wh(['Hex - Mountains, medium (rocky).png'], 'Medium (rocky)', 'Mountains'),
    WhMountainsMediumSnowy:    wh(['Hex - Mountains, medium (snowy).png'], 'Medium (snowy)', 'Mountains'),
    WhMountainsPeakLush:       wh(['Hex - Mountains, peak (lush).png'], 'Peak (lush)', 'Mountains'),
    WhMountainsPeakRocky:      wh(['Hex - Mountains, peak (rocky).png'], 'Peak (rocky)', 'Mountains'),
    WhMountainsPeakSnowy:      wh(['Hex - Mountains, peak (snowy).png'], 'Peak (snowy)', 'Mountains'),
    WhVolcanoLush:             wh(['Hex - Mountain, Volcano (lush) 1.png','Hex - Mountain, Volcano (lush) 2.png'], 'Volcano (lush)', 'Mountains'),
    WhVolcanoRocky:            wh(['Hex - Mountain, Volcano (rocky) 1.png','Hex - Mountain, Volcano (rocky) 2.png'], 'Volcano (rocky)', 'Mountains'),
    WhVolcanoSnowy:            wh(['Hex - Mountain, Volcano (snowy) 1.png','Hex - Mountain, Volcano (snowy) 2.png'], 'Volcano (snowy)', 'Mountains'),

    WhForestConiferLush:   wh(['Hex - Forest, conifer (lush).png','Hex - Forest, conifer (lush) 2.png'], 'Conifer (lush)', 'Forest'),
    WhForestConiferSnowy:  wh(['Hex - Forest, conifer (snowy).png','Hex - Forest, conifer (snowy) 2.png'], 'Conifer (snowy)', 'Forest'),
    WhForestDeciduousLush: wh(['Hex - Forest, deciduous (lush).png'], 'Deciduous (lush)', 'Forest'),
    WhForestMixedLush:     wh(['Hex - Forest, mixed (lush).png'], 'Mixed (lush)', 'Forest'),
    WhForestSparseLush:    wh(['Hex - Sparse Trees (lush) 1.png','Hex - Sparse Trees (lush) 2.png'], 'Sparse (lush)', 'Forest'),
    WhForestSparseSnowy:   wh(['Hex - Sparse Trees (snowy).png'], 'Sparse (snowy)', 'Forest'),
    WhForestMushroomRed:     wh(['Flat Hex - Forest, Mushroom (red) 1.png','Flat Hex - Forest, Mushroom (red) 2.png'], 'Mushroom (red)', 'Forest'),
    WhForestMushroomWhite:   wh(['Flat Hex - Forest, Mushroom (white) 1.png','Flat Hex - Forest, Mushroom (white) 2.png'], 'Mushroom (white)', 'Forest'),
    WhForestStoneCircleLush: wh(['Flat Hex - Forest, Stone Circle (lush).png'], 'Stone Circle', 'Forest'),

    WhOceanStill:     wh(['Hex - Water - Ocean (still water) 1.png','Hex - Water - Ocean (still water) 2.png','Hex - Water - Ocean (still water) 3.png','Hex - Water - Ocean (still water) 4.png','Hex - Water - Ocean (still water) 5.png'], 'Ocean (still)', 'Water'),
    WhOceanWaves:     wh(['Hex - Water - Ocean (waves) 1.png','Hex - Water - Ocean (waves) 2.png'], 'Ocean (waves)', 'Water'),
    WhOceanSoftWaves: wh(['Hex - Water - Ocean (soft waves) 1.png','Hex - Water - Ocean (soft waves) 2.png'], 'Ocean (soft)', 'Water'),
    WhSwampStill:     wh(['Hex - Water - Swamp (still water) 1.png','Hex - Water - Swamp (still water) 2.png','Hex - Water - Swamp (still water) 3.png','Hex - Water - Swamp (still water) 4.png','Hex - Water - Swamp (still water) 5.png'], 'Swamp (still)', 'Water'),
    WhSwampWaves:     wh(['Hex - Water - Swamp (waves) 1.png','Hex - Water - Swamp (waves) 2.png'], 'Swamp (waves)', 'Water'),
    WhSwampSoftWaves: wh(['Hex - Water - Swamp (soft waves) 1.png','Hex - Water - Swamp (soft waves) 2.png'], 'Swamp (soft)', 'Water'),

    WhUrbanCity:            wh(['Hex - Urban - City (lush).png'], 'City', 'Urban'),
    WhUrbanTown:            wh(['Hex - Urban - Town (lush).png'], 'Town', 'Urban'),
    WhUrbanFarm:            wh(['Hex - Urban - Farm (lush).png'], 'Farm', 'Urban'),
    WhUrbanFarmland:        wh(['Hex - Urban - Farmland (lush) 1.png','Hex - Urban - Farmland (lush) 2.png','Hex - Urban - Farmland (lush) 3.png'], 'Farmland', 'Urban'),
    WhUrbanModernInhabited: wh(['Hex - Urban - Modern Town, inhabited (lush) 1.png','Hex - Urban - Modern Town, inhabited (lush) 2.png'], 'Modern Town', 'Urban'),
    WhUrbanModernAbandoned: wh(['Hex - Urban - Modern Town, abandoned (lush) 1.png','Hex - Urban - Modern Town, abandoned (lush) 2.png'], 'Modern Town (abandoned)', 'Urban'),
    WhUrbanLumberYard:      wh(['Hex - Urban - Modern Town, lumber yard (lush).png'], 'Lumber Yard', 'Urban'),
    WhUrbanMonastery:       wh(['Hex - Urban - Monastery (lush).png'], 'Monastery', 'Urban'),
    WhUrbanTower:           wh(['Hex - Urban - Tower (lush).png'], 'Tower', 'Urban'),

    WhRuinLush:   wh(['Hex - Ruin (lush).png'], 'Ruin (lush)', 'Ruins'),
    WhRuinDesert: wh(['Hex - Ruin (desert).png'], 'Ruin (desert)', 'Ruins'),

    WhLandmarkAnvilRock: wh(['Flat Hex - Anvil Rock.png'], 'Anvil Rock', 'Landmarks'),
}

const FALLBACK_TERRAIN: keyof typeof TerrainTypes = 'Blank'

function resolveVariantPack(terrainType: TerrainTypes): VariantPack {
    const key = TerrainTypes[terrainType] as keyof typeof TerrainVariants | undefined
    if (key && TerrainVariants[key]) return TerrainVariants[key]
    return TerrainVariants[FALLBACK_TERRAIN]
}

const buildAssetUrl = (pack: Pack, folder: string, file: string): string => {
    if (pack === 'worldhex') {
        // folder already includes the WORLDHEX_ROOT prefix
        // (e.g. "worldhex/Assets - 72 DPI" or that + "/Extras").
        return `/media/${encodeSegments(folder)}/${encodeURIComponent(file)}`
    }
    return folder
        ? `/media/${pack}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`
        : `/media/${pack}/${encodeURIComponent(file)}`
}

// Positive modulo: wrap any integer (incl. negative) into [0, length).
export const wrapIndex = (index: number, length: number): number =>
    ((index % length) + length) % length

const resolveOverlayEntry = (
    list: OverlayVariantList,
    index: number,
): { folder: string; file: string } => {
    const entry = list.files[wrapIndex(index, list.files.length)]!
    return typeof entry === 'string'
        ? { folder: list.folder, file: entry }
        : { folder: entry.folder, file: entry.file }
}

const variantUrl = (v: VariantPack, index: number): string =>
    buildAssetUrl(v.pack, v.folder, v.files[wrapIndex(index, v.files.length)]!)

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

export const terrainPackOf = (terrainType: TerrainTypes): Pack => resolveVariantPack(terrainType).pack

/** Returns an ordered list of terrain types belonging to the given pack. */
export const terrainTypesForPack = (pack: Pack): TerrainTypes[] => {
    return (Object.keys(TerrainVariants) as (keyof typeof TerrainVariants)[])
        .filter(k => TerrainVariants[k].pack === pack)
        .map(k => TerrainTypes[k] as TerrainTypes)
        .filter((v): v is TerrainTypes => typeof v === 'number')
}

/** Returns terrain types for a pack grouped by their `group` label, preserving insertion order. */
export const terrainGroupsForPack = (pack: Pack): { group: string; types: TerrainTypes[] }[] => {
    const groups = new Map<string, TerrainTypes[]>()
    for (const k of Object.keys(TerrainVariants) as (keyof typeof TerrainVariants)[]) {
        const v = TerrainVariants[k]
        if (v.pack !== pack) continue
        const key = v.group ?? 'Other'
        const arr = groups.get(key) ?? []
        arr.push(TerrainTypes[k] as TerrainTypes)
        groups.set(key, arr)
    }
    return Array.from(groups, ([group, types]) => ({ group, types }))
}

export const terrainLabel = (terrainType: TerrainTypes): string => {
    const v = resolveVariantPack(terrainType)
    return v.label ?? (TerrainTypes[terrainType] as string)
}

export const DefaultTerrainForPack: Record<Pack, TerrainTypes> = {
    hexes2: TerrainTypes.Sea,
    worldhex: TerrainTypes.WhBaseOcean,
}

// ----------------------------------------------------------------------------
// Overlays: stackable on top of base terrain (one or more per category per hex).
// POIs are placed free-form (not snapped to a hex).
// ----------------------------------------------------------------------------

export type OverlayCategory = 'river' | 'path' | 'coast' | 'poi'

// Note: 'river' and 'path' are commented out — rivers are now drawn via the
// Edge tool (between-hex bands) and paths via the new pen-style Path tool.
// The categories remain in the schema so existing maps with overlays still
// load; they just don't surface in the palette.
export const OverlayCategoriesForPack: Record<Pack, readonly OverlayCategory[]> = {
    hexes2: [/* 'river', 'path', */ 'poi'],
    worldhex: [/* 'river', 'path', */ 'poi', 'coast'],
}

export const OverlayCategoryLabels: Record<OverlayCategory, string> = {
    river: 'River',
    path: 'Path',
    coast: 'Coast',
    poi: 'POI',
}

export type OverlayVariantEntry = string | { folder: string; file: string }

interface OverlayVariantList {
    folder: string
    files: OverlayVariantEntry[]
}

const wxAssetsFolder = WORLDHEX_ROOT_72
const wxExtrasFolder = `${WORLDHEX_ROOT_72}/Extras`

// Worldhex directional patterns. Filenames embed pattern# + direction. The
// underlying variants array is flat (ordered) so existing storage works as
// integer indices. The palette UI groups by pattern.
const wxRiver = (file: string): OverlayVariantEntry => ({ folder: wxAssetsFolder, file })
const wxPath = wxRiver
const wxCoast = wxRiver

const WX_RIVERS: OverlayVariantEntry[] = [
    wxRiver('Hex - River 1 N.png'),  wxRiver('Hex - River 1 NE.png'), wxRiver('Hex - River 1 S.png'),  wxRiver('Hex - River 1 SE.png'),
    wxRiver('Hex - River 2 N.png'),  wxRiver('Hex - River 2 NE.png'),
    wxRiver('Hex - River 3 N.png'),  wxRiver('Hex - River 3 NE.png'), wxRiver('Hex - River 3 SE.png'),
    wxRiver('Hex - River 4 N.png'),  wxRiver('Hex - River 4 NE.png'), wxRiver('Hex - River 4 S.png'),  wxRiver('Hex - River 4 SE.png'),
    wxRiver('Hex - River 5 E.png'),  wxRiver('Hex - River 5 NE.png'), wxRiver('Hex - River 5 SE.png'),
    wxRiver('Hex - River 6 N.png'),  wxRiver('Hex - River 6 NE.png'), wxRiver('Hex - River 6 S.png'),  wxRiver('Hex - River 6 SE.png'),
    wxRiver('Hex - River 7 N.png'),  wxRiver('Hex - River 7 NW.png'), wxRiver('Hex - River 7 S.png'),  wxRiver('Hex - River 7 SE.png'),  wxRiver('Hex - River 7 SW.png'),
    wxRiver('Hex - River 8 NW.png'), wxRiver('Hex - River 8 SW.png'), wxRiver('Hex - River 8 W.png'),
    wxRiver('Hex - River 9 N.png'),  wxRiver('Hex - River 9 SE.png'),
    wxRiver('Hex - River 10 N.png'), wxRiver('Hex - River 10 NW.png'), wxRiver('Hex - River 10 S.png'), wxRiver('Hex - River 10 SW.png'),
    wxRiver('Hex - River 11 N.png'), wxRiver('Hex - River 11 NE.png'), wxRiver('Hex - River 11 S.png'), wxRiver('Hex - River 11 SE.png'),
    wxRiver('Hex - River 12 E.png'), wxRiver('Hex - River 12 N.png'),
    wxRiver('Hex - River 13 N.png'), wxRiver('Hex - River 13 NE.png'), wxRiver('Hex - River 13 S.png'), wxRiver('Hex - River 13 SE.png'),
    // Append-only: stable POI/overlay indices. Non-directional variants (no N/S/etc suffix).
    wxRiver('Hex - River 4b.png'),
    wxRiver('Hex - River 14.png'),
]

const WX_PATHS: OverlayVariantEntry[] = [
    wxPath('Hex - Dirt Path 1 N.png'),  wxPath('Hex - Dirt Path 1 NE.png'), wxPath('Hex - Dirt Path 1 S.png'),  wxPath('Hex - Dirt Path 1 SE.png'),
    wxPath('Hex - Dirt Path 2 N.png'),  wxPath('Hex - Dirt Path 2 NE.png'),
    wxPath('Hex - Dirt Path 3 N.png'),  wxPath('Hex - Dirt Path 3 NE.png'), wxPath('Hex - Dirt Path 3 SE.png'),
    wxPath('Hex - Dirt Path 4 N.png'),  wxPath('Hex - Dirt Path 4 NE.png'), wxPath('Hex - Dirt Path 4 S.png'),  wxPath('Hex - Dirt Path 4 SE.png'),
    wxPath('Hex - Dirt Path 5 E.png'),  wxPath('Hex - Dirt Path 5 NE.png'), wxPath('Hex - Dirt Path 5 SE.png'),
    wxPath('Hex - Dirt Path 6 N.png'),  wxPath('Hex - Dirt Path 6 NE.png'), wxPath('Hex - Dirt Path 6 S.png'),  wxPath('Hex - Dirt Path 6 SE.png'),
    wxPath('Hex - Dirt Path 7 N.png'),  wxPath('Hex - Dirt Path 7 NW.png'), wxPath('Hex - Dirt Path 7 S.png'),  wxPath('Hex - Dirt Path 7 SE.png'),  wxPath('Hex - Dirt Path 7 SW.png'),
    wxPath('Hex - Dirt Path 8 NW.png'), wxPath('Hex - Dirt Path 8 SW.png'), wxPath('Hex - Dirt Path 8 W.png'),
    wxPath('Hex - Dirt Path 9 N.png'),  wxPath('Hex - Dirt Path 9 SE.png'),
    wxPath('Hex - Dirt Path 10 N.png'), wxPath('Hex - Dirt Path 10 NW.png'), wxPath('Hex - Dirt Path 10 S.png'), wxPath('Hex - Dirt Path 10 SW.png'),
    wxPath('Hex - Dirt Path 11 N.png'), wxPath('Hex - Dirt Path 11 NE.png'), wxPath('Hex - Dirt Path 11 S.png'), wxPath('Hex - Dirt Path 11 SE.png'),
    wxPath('Hex - Dirt Path 12 E.png'), wxPath('Hex - Dirt Path 12 N.png'),
    wxPath('Hex - Dirt Path 13 N.png'), wxPath('Hex - Dirt Path 13 NE.png'), wxPath('Hex - Dirt Path 13 S.png'), wxPath('Hex - Dirt Path 13 SE.png'),
    // Append-only: stable POI/overlay indices. Non-directional variants (no N/S/etc suffix).
    wxPath('Hex - Dirt Path 7b.png'),
]

const WX_COASTS: OverlayVariantEntry[] = [
    wxCoast('Hex - Coast - Beach (big) N.png'), wxCoast('Hex - Coast - Beach (big) NE.png'), wxCoast('Hex - Coast - Beach (big) NW.png'), wxCoast('Hex - Coast - Beach (big) S.png'), wxCoast('Hex - Coast - Beach (big) SE.png'), wxCoast('Hex - Coast - Beach (big) SW.png'),
    wxCoast('Hex - Coast - Beach (medium) E.png'), wxCoast('Hex - Coast - Beach (medium) NE.png'), wxCoast('Hex - Coast - Beach (medium) NW.png'), wxCoast('Hex - Coast - Beach (medium) SE.png'), wxCoast('Hex - Coast - Beach (medium) SW.png'), wxCoast('Hex - Coast - Beach (medium) W.png'),
    wxCoast('Hex - Coast - Beach (small) N.png'), wxCoast('Hex - Coast - Beach (small) NE.png'), wxCoast('Hex - Coast - Beach (small) NW.png'), wxCoast('Hex - Coast - Beach (small) S.png'), wxCoast('Hex - Coast - Beach (small) SE.png'), wxCoast('Hex - Coast - Beach (small) SW.png'),
]

const wxExtra = (file: string): OverlayVariantEntry => ({ folder: wxExtrasFolder, file })

// Extras: free-positioned stamps. Each entry lives in `Extras/`. Order is
// stable so persisted POI indices remain valid across deploys — append only.
const WX_EXTRAS: OverlayVariantEntry[] = [
    // Foliage — trees
    wxExtra('Foliage - Tree, conifer 1 (cold).png'),
    wxExtra('Foliage - Tree, conifer 2 (cold).png'),
    wxExtra('Foliage - Tree, conifer 3 (cold).png'),
    wxExtra('Foliage - Tree, deciduous 1 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 2 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 3 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 4 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 5 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 6 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 7 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 8 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 9 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 10 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 11 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 12 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 13 (lush).png'),
    wxExtra('Foliage - Tree, deciduous 14 (lush).png'),
    wxExtra('Foliage - Tree, palm 1 (bright).png'),
    wxExtra('Foliage - Tree, palm 2 (bright).png'),
    wxExtra('Foliage - Tree, willow 1 (swamp).png'),
    wxExtra('Foliage - Tree, willow 2 (swamp).png'),
    // Foliage — bushes & grass
    wxExtra('Foliage - Bush 1 (lush).png'),
    wxExtra('Foliage - Bush 2 (lush).png'),
    wxExtra('Foliage - Bush 3 (lush).png'),
    wxExtra('Foliage - Bush 4 (lush).png'),
    wxExtra('Foliage - Bush 5 (lush).png'),
    wxExtra('Foliage - Grass Patch 1 (lush).png'),
    wxExtra('Foliage - Grass Patch 2 (lush).png'),
    wxExtra('Foliage - Grass Patch 3 (lush).png'),
    wxExtra('Foliage - Grass Patch 4 (lush).png'),
    wxExtra('Foliage - Grass Patch 5 (lush).png'),
    wxExtra('Foliage - Grass Patch 6 (lush).png'),
    wxExtra('Foliage - Grass Patch 7 (lush).png'),
    wxExtra('Foliage - Grass Patch 8.png'),
    wxExtra('Foliage - Grass Patch 9.png'),
    // Hills (small stamps)
    wxExtra('Hill 1 (lush).png'), wxExtra('Hill 2 (lush).png'), wxExtra('Hill 3 (lush).png'), wxExtra('Hill 4 (lush).png'),
    wxExtra('Hill 1 (desert).png'), wxExtra('Hill 2 (desert).png'), wxExtra('Hill 3 (desert).png'), wxExtra('Hill 4 (desert).png'),
    wxExtra('Hill 1 (rocky).png'), wxExtra('Hill 2 (rocky).png'), wxExtra('Hill 3 (rocky).png'), wxExtra('Hill 4 (rocky).png'),
    wxExtra('Hill 1 (snowy).png'), wxExtra('Hill 2 (snowy).png'), wxExtra('Hill 3 (snowy).png'), wxExtra('Hill 4 (snowy).png'),
    // Buildings
    wxExtra('Buildings - City Building 1 (blue).png'), wxExtra('Buildings - City Building 1 (red).png'),
    wxExtra('Buildings - City Building 2 (blue).png'), wxExtra('Buildings - City Building 2 (red).png'),
    wxExtra('Buildings - City Building 3 (blue).png'), wxExtra('Buildings - City Building 3 (red).png'),
    wxExtra('Buildings - City Building 4 (blue).png'), wxExtra('Buildings - City Building 4 (red).png'),
    wxExtra('Buildings - City Building 5 (blue).png'), wxExtra('Buildings - City Building 5 (red).png'),
    wxExtra('Buildings - City Building 6 (blue).png'), wxExtra('Buildings - City Building 6 (red).png'),
    wxExtra('Buildings - City Statue.png'),
    wxExtra('Buildings - City with Wall (blue).png'), wxExtra('Buildings - City with Wall (red).png'),
    wxExtra('Buildings - City with no Walls (blue).png'), wxExtra('Buildings - City with no Walls (red).png'),
    wxExtra('Buildings - Desert Building (bright) 1.png'),
    wxExtra('Buildings - Desert Building (bright) 2.png'),
    wxExtra('Buildings - Desert Building (bright) 3.png'),
    wxExtra('Buildings - Desert Building (sandstone) 1.png'),
    wxExtra('Buildings - Desert Building (sandstone) 2.png'),
    wxExtra('Buildings - Desert Building (sandstone) 3.png'),
    wxExtra('Buildings - Farmhouse (lush).png'),
    wxExtra('Buildings - Farmland (lush).png'),
    wxExtra('Buildings - Farmland Fence (lush).png'),
    wxExtra('Buildings - Jetty (right).png'),
    wxExtra('Buildings - Jetty (boat, right).png'),
    wxExtra('Buildings - Jetty (ship, right).png'),
    wxExtra('Buildings - Monastery (blue).png'), wxExtra('Buildings - Monastery (red).png'),
    wxExtra('Buildings - Tower (blue).png'), wxExtra('Buildings - Tower (red).png'),
    wxExtra('Buildings - Town (red).png'),
    wxExtra('Buildings - Town Building 1 (red).png'),
    wxExtra('Buildings - Town Building 2 (red).png'),
    wxExtra('Buildings - Town Building 3 (red).png'),
    wxExtra('Buildings - Town Building 4 (red).png'),
    wxExtra('Buildings - Town Building 5 (red).png'),
    wxExtra('Buildings - Windmill (red).png'),
    // Structures
    wxExtra('Structures - Cave (sand).png'),
    wxExtra('Structures - Cave (sandstone).png'),
    wxExtra('Structures - Cave (snowy).png'),
    wxExtra('Structures - Cave (stone).png'),
    wxExtra('Structures - Gate (sandstone, right).png'),
    wxExtra('Structures - Gate (stone, right).png'),
    wxExtra('Structures - Ruins (stone).png'),
    wxExtra('Structures - Small Ruins (stone).png'),
    wxExtra('Structures - Tent (tarp).png'),
    // Vehicles
    wxExtra('Vehicles - Boat 1.png'),
    wxExtra('Vehicles - Cart 1.png'),
    wxExtra('Vehicles - Sailship 1.png'),
    wxExtra('Vehicles - Crashed Spaceship 2.png'),
    wxExtra('Vehicle - Space Rover 1.png'),
    // Atmosphere
    wxExtra('Clouds 1.png'), wxExtra('Clouds 2.png'), wxExtra('Clouds 3.png'), wxExtra('Clouds 4.png'),
    wxExtra('Clouds 5.png'), wxExtra('Clouds 6.png'), wxExtra('Clouds 7.png'), wxExtra('Clouds 8.png'),
    wxExtra('Lake.png'),
    wxExtra('Oasis.png'),
    // Markers — pins
    wxExtra('Pins - Pin, blue.png'), wxExtra('Pins - Pin, blue (large).png'),
    wxExtra('Pins - Pin, green.png'), wxExtra('Pins - Pin, green (large).png'),
    wxExtra('Pins - Pin, red.png'), wxExtra('Pins - Pin, red (large).png'),
    wxExtra('Pins - Pin, white.png'), wxExtra('Pins - Pin, white (large).png'),
    wxExtra('Pins - Pin, yellow.png'), wxExtra('Pins - Pin, yellow (large).png'),
    wxExtra('Pins - Party 1.png'), wxExtra('Pins - Party 2.png'),
    // Markers — banners (small)
    wxExtra('Banner 1 (blue).png'), wxExtra('Banner 1 (red).png'), wxExtra('Banner 1 (white).png'),
    wxExtra('Banner 2 (blue).png'), wxExtra('Banner 2 (red).png'), wxExtra('Banner 2 (white).png'),
    wxExtra('Banner 3 (blue).png'), wxExtra('Banner 3 (red).png'), wxExtra('Banner 3 (white).png'),
    wxExtra('Banner 4 (blue).png'), wxExtra('Banner 4 (red).png'), wxExtra('Banner 4 (white).png'),
    wxExtra('Banner 5 (blue).png'), wxExtra('Banner 5 (red).png'), wxExtra('Banner 5 (white).png'),
    wxExtra('Banner 6 (blue).png'), wxExtra('Banner 6 (red).png'), wxExtra('Banner 6 (white).png'),
    // Markers — icon banners
    wxExtra('Pins - Banner.png'),
    wxExtra('Pins - Banner (cave).png'), wxExtra('Pins - Banner (coins).png'), wxExtra('Pins - Banner (house).png'),
    wxExtra('Pins - Banner (paw print round).png'), wxExtra('Pins - Banner (paw print sharp).png'),
    wxExtra('Pins - Banner (ruins).png'), wxExtra('Pins - Banner (skull).png'), wxExtra('Pins - Banner (star).png'),
    wxExtra('Pins - Banner (swords).png'), wxExtra('Pins - Banner (tent).png'), wxExtra('Pins - Banner (tower).png'),
    // Markers — pedestals
    wxExtra('Pins - Pedestal, wood.png'),
    wxExtra('Pins - Pedestal, wood (cave).png'), wxExtra('Pins - Pedestal, wood (coins).png'), wxExtra('Pins - Pedestal, wood (house).png'),
    wxExtra('Pins - Pedestal, wood (party 1).png'), wxExtra('Pins - Pedestal, wood (party 2).png'),
    wxExtra('Pins - Pedestal, wood (paw print round).png'), wxExtra('Pins - Pedestal, wood (paw print sharp).png'),
    wxExtra('Pins - Pedestal, wood (ruins).png'), wxExtra('Pins - Pedestal, wood (skull).png'),
    wxExtra('Pins - Pedestal, wood (star).png'), wxExtra('Pins - Pedestal, wood (swords).png'),
    wxExtra('Pins - Pedestal, wood (tent).png'), wxExtra('Pins - Pedestal, wood (tower).png'),
    // Markers — "you're here" pins
    wxExtra("Pins - You're Here, red (blank).png"),
    wxExtra("Pins - You're Here, red (cave).png"), wxExtra("Pins - You're Here, red (coins).png"),
    wxExtra("Pins - You're Here, red (house).png"),
    wxExtra("Pins - You're Here, red (paw print round).png"), wxExtra("Pins - You're Here, red (paw print sharp).png"),
    wxExtra("Pins - You're Here, red (ruins).png"), wxExtra("Pins - You're Here, red (skull).png"),
    wxExtra("Pins - You're Here, red (star).png"), wxExtra("Pins - You're Here, red (swords).png"),
    wxExtra("Pins - You're Here, red (tent).png"), wxExtra("Pins - You're Here, red (tower).png"),
    // Icons
    wxExtra('Icon - Cave.png'), wxExtra('Icon - Coins.png'), wxExtra('Icon - House.png'),
    wxExtra('Icon - Paw Print Round.png'), wxExtra('Icon - Paw Print Sharp.png'),
    wxExtra('Icon - Ruins.png'), wxExtra('Icon - Skull.png'), wxExtra('Icon - Star.png'),
    wxExtra('Icon - Swords.png'), wxExtra('Icon - Tent.png'),
    wxExtra('Icon - Tower.png'), wxExtra('Icon - Tower 2.png'),
    // Append-only: new entries must go at the end so existing maps' POI indices
    // keep pointing to the same asset. These are the left-facing jetty flips;
    // the palette (groupExtras) displays each beside its right-facing original.
    wxExtra('Buildings - Jetty (left).png'),
    wxExtra('Buildings - Jetty (boat, left).png'),
    wxExtra('Buildings - Jetty (ship, left).png'),
    // Bridges
    wxExtra('Structures - Bridge 1.png'),
    wxExtra('Structures - Bridge 2.png'),
    wxExtra('Structures - Bridge 3.png'),
    // Title banners — banner 1 has flex extensions; 2–6 share the standard set.
    wxExtra('Title Banner 1 (small).png'),
    wxExtra('Title Banner 1 (long).png'),
    wxExtra('Title Banner 1 (flex) left.png'),
    wxExtra('Title Banner 1 (flex) left extension.png'),
    wxExtra('Title Banner 1 (flex) mid.png'),
    wxExtra('Title Banner 1 (flex) right extension.png'),
    wxExtra('Title Banner 1 (flex) right.png'),
    wxExtra('Title Banner 2 (small).png'),
    wxExtra('Title Banner 2 (long).png'),
    wxExtra('Title Banner 2 (flex) left.png'),
    wxExtra('Title Banner 2 (flex) mid.png'),
    wxExtra('Title Banner 2 (flex) right.png'),
    wxExtra('Title Banner 3 (small).png'),
    wxExtra('Title Banner 3 (long).png'),
    wxExtra('Title Banner 3 (flex) left.png'),
    wxExtra('Title Banner 3 (flex) mid.png'),
    wxExtra('Title Banner 3 (flex) right.png'),
    wxExtra('Title Banner 4 (small).png'),
    wxExtra('Title Banner 4 (long).png'),
    wxExtra('Title Banner 4 (flex) left.png'),
    wxExtra('Title Banner 4 (flex) mid.png'),
    wxExtra('Title Banner 4 (flex) right.png'),
    wxExtra('Title Banner 5 (small).png'),
    wxExtra('Title Banner 5 (long).png'),
    wxExtra('Title Banner 5 (flex) left.png'),
    wxExtra('Title Banner 5 (flex) mid.png'),
    wxExtra('Title Banner 5 (flex) right.png'),
    wxExtra('Title Banner 6 (small).png'),
    wxExtra('Title Banner 6 (long).png'),
    wxExtra('Title Banner 6 (flex) left.png'),
    wxExtra('Title Banner 6 (flex) mid.png'),
    wxExtra('Title Banner 6 (flex) right.png'),
    // Left-facing gate flips (paired with the right-facing originals in the palette).
    wxExtra('Structures - Gate (sandstone, left).png'),
    wxExtra('Structures - Gate (stone, left).png'),
    // New worldhex Extras (72-DPI only; see WX_72_ONLY for export fallback).
    wxExtra('Buildings - Farmland Cowpen (lush).png'),
    wxExtra('Buildings - Lighthouse (off).png'),
    wxExtra('Buildings - Lighthouse (on).png'),
    wxExtra('Buildings - Observatory.png'),
    wxExtra('Buildings - Orchard.png'),
    wxExtra('Buildings - Tower Fort.png'),
    wxExtra('Foliage - Mushroom 1 (red).png'),
    wxExtra('Foliage - Mushroom 1 (white).png'),
    wxExtra('Foliage - Mushroom 2 (red).png'),
    wxExtra('Foliage - Mushroom 2 (white).png'),
    wxExtra('Foliage - Mushroom 3 (red).png'),
    wxExtra('Foliage - Mushroom 3 (white).png'),
    wxExtra('Foliage - Mushroom 4 (red).png'),
    wxExtra('Foliage - Mushroom 4 (white).png'),
    wxExtra('Foliage - Mushroom 5 (red).png'),
    wxExtra('Foliage - Mushroom 5 (white).png'),
    wxExtra('Foliage - Mushroom 6 (red).png'),
    wxExtra('Foliage - Mushroom 6 (white).png'),
    wxExtra('Foliage - Mushroom 7 (white).png'),
    wxExtra('Structures - Anvil Rock.png'),
    wxExtra('Structures - Sitting Stone (mossy).png'),
    wxExtra('Structures - Sitting Stone (stone).png'),
    wxExtra('Structures - Standing Stone (Broken).png'),
    wxExtra('Structures - Standing Stone (mossy).png'),
    wxExtra('Structures - Standing Stone (stone).png'),
    wxExtra('Vehicles - Shipwreck.png'),
    // Wall segments — hex-spanning structures placed as free stamps so they
    // overlay terrain (transparent base) instead of replacing it. Sequential
    // 1–9; adjacent numbers (1/2, 5/6, 7/8) are left/right mirror pairs.
    wxExtra('Wall 1.png'),
    wxExtra('Wall 2.png'),
    wxExtra('Wall 3.png'),
    wxExtra('Wall 4.png'),
    wxExtra('Wall 5.png'),
    wxExtra('Wall 6.png'),
    wxExtra('Wall 7.png'),
    wxExtra('Wall 8.png'),
    wxExtra('Wall 9.png'),
]

export const OverlayVariantsByPack: Record<Pack, Partial<Record<OverlayCategory, OverlayVariantList>>> = {
    hexes2: {
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
            { folder: 'lakes', file: 'lake-2.png' },
        ] },
    },
    worldhex: {
        river: { folder: wxAssetsFolder, files: WX_RIVERS },
        path:  { folder: wxAssetsFolder, files: WX_PATHS },
        coast: { folder: wxAssetsFolder, files: WX_COASTS },
        poi:   { folder: wxExtrasFolder, files: WX_EXTRAS },
    },
}

export const overlayVariantFilename = (entry: OverlayVariantEntry): string =>
    typeof entry === 'string' ? entry : entry.file

const resolveOverlayList = (pack: Pack, category: OverlayCategory): OverlayVariantList | undefined =>
    OverlayVariantsByPack[pack]?.[category]

export const getOverlayPath = (category: OverlayCategory, index: number, pack: Pack = 'hexes2'): string => {
    const v = resolveOverlayList(pack, category)
    if (!v || !v.files.length) return ''
    const { folder, file } = resolveOverlayEntry(v, index)
    return buildAssetUrl(pack, folder, file)
}

export const getOverlayVariants = (pack: Pack, category: OverlayCategory): OverlayVariantEntry[] =>
    resolveOverlayList(pack, category)?.files ?? []

// ----------------------------------------------------------------------------
// Worldhex overlay grouping for the palette UI.
// ----------------------------------------------------------------------------

export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'

/** Parse a worldhex path/river/coast filename into (pattern, direction). The
 * direction is null for whole-hex tiles like "Hex - River 14.png" that don't
 * attach to a single edge. */
export const parseDirectionalFile = (file: string): { pattern: string; direction: Direction | null } | null => {
    // With direction: "Hex - River 5 NE.png", "Hex - Coast - Beach (big) NW.png"
    const withDir = file.match(/^Hex\s*-\s*(.+?)\s+(N|NE|E|SE|S|SW|W|NW)\.png$/i)
    if (withDir) return { pattern: withDir[1]!.trim(), direction: withDir[2]!.toUpperCase() as Direction }
    // Whole-hex variant with no direction suffix: "Hex - River 14.png", "Hex - Dirt Path 7b.png"
    const noDir = file.match(/^Hex\s*-\s*(.+?)\.png$/i)
    if (noDir) return { pattern: noDir[1]!.trim(), direction: null }
    return null
}

export interface OverlayPatternGroup {
    pattern: string                 // e.g. "Dirt Path 5" or "Coast - Beach (big)"
    entries: { index: number; direction: Direction | null; file: string }[]
}

export const groupDirectionalOverlays = (pack: Pack, category: OverlayCategory): OverlayPatternGroup[] => {
    const files = getOverlayVariants(pack, category)
    const groups = new Map<string, OverlayPatternGroup>()
    files.forEach((entry, index) => {
        const file = overlayVariantFilename(entry)
        const parsed = parseDirectionalFile(file)
        if (!parsed) return
        const g = groups.get(parsed.pattern) ?? { pattern: parsed.pattern, entries: [] }
        g.entries.push({ index, direction: parsed.direction, file })
        groups.set(parsed.pattern, g)
    })
    // Sort directions in canonical order so the palette doesn't shuffle them.
    // Null (whole-hex, no direction) sorts last within a pattern.
    const dirOrder: (Direction | null)[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', null]
    for (const g of groups.values()) {
        g.entries.sort((a, b) => dirOrder.indexOf(a.direction) - dirOrder.indexOf(b.direction))
    }
    return Array.from(groups.values())
}

// ----------------------------------------------------------------------------
// Worldhex Extras grouping for the palette UI.
// ----------------------------------------------------------------------------

export interface ExtraGroup {
    group: string
    entries: { index: number; file: string }[]
}

const extraGroupFor = (file: string): string => {
    if (file.startsWith('Foliage - Tree')) return 'Trees'
    if (file.startsWith('Foliage - Bush')) return 'Bushes'
    if (file.startsWith('Foliage - Grass Patch')) return 'Grass'
    if (file.startsWith('Foliage - Mushroom')) return 'Mushrooms'
    if (file.startsWith('Hill ')) return 'Hills'
    if (file.startsWith('Buildings - ')) return 'Buildings'
    if (file.startsWith('Structures - ')) return 'Structures'
    if (/^Wall \d/.test(file)) return 'Walls'
    if (file.startsWith('Vehicles - ') || file.startsWith('Vehicle - ')) return 'Vehicles'
    if (file.startsWith('Clouds ')) return 'Atmosphere'
    if (file === 'Lake.png' || file === 'Oasis.png') return 'Atmosphere'
    if (file.startsWith('Pins - Pin')) return 'Pins'
    if (file.startsWith('Pins - Party')) return 'Pins'
    if (file.startsWith('Banner ')) return 'Banners'
    if (file.startsWith('Pins - Banner')) return 'Banners'
    if (file.startsWith('Title Banner ')) return 'Title Banners'
    if (file.startsWith('Pins - Pedestal')) return 'Pedestals'
    if (file.startsWith("Pins - You're Here")) return '"You\'re Here"'
    if (file.startsWith('Icon - ')) return 'Icons'
    return 'Other'
}

// Directional flips ("(left)"/"(right)" partners) live at append-only positions
// far from their originals. For display only, pull each flip up to sit right
// after its partner so the pair shows together — stored indices are untouched.
type ExtraEntry = { index: number; file: string }
const flipDirection = (f: string): 'left' | 'right' | null =>
    /\bleft\b/i.test(f) ? 'left' : /\bright\b/i.test(f) ? 'right' : null
const flipBaseKey = (f: string): string => f.replace(/[,(]\s*(left|right)\)?/i, '')
const pairDirectionalFlips = (entries: ExtraEntry[]): ExtraEntry[] => {
    const out: ExtraEntry[] = []
    const used = new Set<number>()
    for (const e of entries) {
        if (used.has(e.index)) continue
        out.push(e); used.add(e.index)
        const dir = flipDirection(e.file)
        if (!dir) continue
        const key = flipBaseKey(e.file)
        const partner = entries.find(o =>
            !used.has(o.index) && flipBaseKey(o.file) === key && flipDirection(o.file) === (dir === 'left' ? 'right' : 'left'))
        if (partner) { out.push(partner); used.add(partner.index) }
    }
    return out
}

export const groupExtras = (pack: Pack): ExtraGroup[] => {
    if (pack !== 'worldhex') return []
    const files = getOverlayVariants(pack, 'poi')
    const order: string[] = []
    const map = new Map<string, ExtraGroup>()
    files.forEach((entry, index) => {
        const file = overlayVariantFilename(entry)
        const group = extraGroupFor(file)
        if (!map.has(group)) {
            order.push(group)
            map.set(group, { group, entries: [] })
        }
        map.get(group)!.entries.push({ index, file })
    })
    return order.map(g => ({ group: g, entries: pairDirectionalFlips(map.get(g)!.entries) }))
}

// Helper function to get terrain key name
export const getTerrainKeyByIndex = (index: number): keyof typeof TerrainTypes => {
    return TerrainTypes[index] as keyof typeof TerrainTypes
}

