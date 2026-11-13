import { useEffect, useSyncExternalStore } from 'react'
import { getProjectBiomes, getPublishedBiomes, putProjectBiomes } from '../../../../api/mapBiomesApi'
import type { MapBiome, MapBiomeGroup, MapDoc, MapLevel } from '../../../../api/types'
import { GROUP_LEVELS } from './mapLevels'

// The biomes a map is drawn with: the admin's published list (Configuration > Maps) and the project's own ("own_" ids). A biome id resolves to the project's
// own first, then the admin's; one that resolves to nothing is drawn in a neutral gray and named "Unknown biome". The colours are the map's art (data).

type Seed = [id: string, name: string, color: string, group: MapBiomeGroup, levels?: MapLevel[]]

// The starter list (the backend's MAP_BIOME_SEED; a test holds them equal): what is drawn until the published list has loaded, and in the design system.
const SEED: Seed[] = [
  ['saltwater', 'Saltwater', '#2f62b0', 'water'],
  ['freshwater', 'Freshwater', '#6fb8e8', 'water', ['planetary', 'continental', 'national', 'regional', 'local', 'architectural', 'interior']],
  ['desert', 'Desert', '#d2b48c', 'land'],
  ['plain', 'Plain', '#a4c34a', 'land'],
  ['forest', 'Forest', '#3f8f3a', 'land'],
  ['swamp', 'Swamp', '#7a7a2e', 'land'],
  ['tundra', 'Tundra', '#e9eef0', 'land'],
  ['taiga', 'Taiga', '#6f8f76', 'land'],
  ['rocky', 'Rocky', '#8e8e8e', 'land'],
  ['lava', 'Lava fields', '#e3702a', 'land'],
  ['savannah', 'Savannah', '#d4a62a', 'land'],
  ['jungle', 'Jungle and rainforest', '#1f6b36', 'land'],
  ['mangrove', 'Mangrove', '#3f8a74', 'land'],
  ['ice', 'Ice and glacier', '#cfe8f2', 'land'],
  ['beach', 'Beach and sand', '#ecdcab', 'land'],
  ['steppe', 'Steppe and grassland', '#c9bd7a', 'land'],
  ['badlands', 'Badlands and canyon', '#a5583a', 'land'],
  ['urban', 'Urban and settlement', '#9e948a', 'land'],
  ['farmland', 'Farmland', '#d8c45a', 'land'],
  ['wood', 'Wood', '#b98a5a', 'material'],
  ['stone', 'Stone', '#9a948c', 'material'],
  ['tile', 'Tile', '#d9d4c7', 'material'],
  ['marble', 'Marble', '#e8e4dc', 'material'],
  ['carpet', 'Carpet', '#9c4a4a', 'material'],
  ['dirt', 'Dirt', '#9b7b55', 'material', ['local', 'architectural', 'interior']],
  ['paving', 'Paving', '#b5aea3', 'material', ['local', 'architectural', 'interior']],
  ['grass', 'Grass', '#7fae5a', 'material'],
  ['outside', 'Outside', '#4a4450', 'material'],
  ['space', 'Space', '#0f1626', 'space'],
  // Added with the space levels (seed version 2): the kinds of star and planet.
  ['star_yellow', 'Yellow star', '#ffd54a', 'star'],
  ['star_red', 'Red dwarf', '#ff7a4a', 'star'],
  ['star_blue', 'Blue giant', '#8fb8ff', 'star'],
  ['star_white_dwarf', 'White dwarf', '#f4f7ff', 'star'],
  ['star_neutron', 'Neutron star', '#c9e6ff', 'star'],
  ['star_black_hole', 'Black hole', '#0b0b10', 'star'],
  ['planet_rocky', 'Rocky planet', '#a08a72', 'planet'],
  ['planet_ocean', 'Ocean world', '#3a78c2', 'planet'],
  ['planet_gas_giant', 'Gas giant', '#d9a066', 'planet'],
  ['planet_ice', 'Ice world', '#cfe3ee', 'planet'],
  ['planet_lava', 'Lava world', '#d4542a', 'planet'],
  ['planet_desert', 'Desert world', '#d9b77e', 'planet'],
  ['planet_garden', 'Garden world', '#4f9a5a', 'planet'],
]

export const STARTER_BIOMES: MapBiome[] = SEED.map(([id, name, color, group, levels]) => ({ id, name, color, group, levels: levels ?? [], retired: false }))

export const UNKNOWN_BIOME_COLOR = '#9a9a9a'
export const unknownBiome = (id: string): MapBiome => ({ id, name: 'Unknown biome', color: UNKNOWN_BIOME_COLOR, group: 'land', levels: [], retired: true })

export type BiomeIndex = Map<string, MapBiome>

// The biomes by id: the admin's list, then the project's own over it.
export function biomeIndex(published: MapBiome[], own: MapBiome[] = []): BiomeIndex {
  const out: BiomeIndex = new Map()
  for (const b of published) out.set(b.id, b)
  for (const b of own) out.set(b.id, b)
  return out
}

export const resolveBiome = (index: BiomeIndex, id: string | null | undefined): MapBiome => (id ? index.get(id) ?? unknownBiome(id) : unknownBiome(''))

// The levels a biome is offered on: its own, or its group's.
export const levelsOfBiome = (b: MapBiome): MapLevel[] => (b.levels.length > 0 ? b.levels : GROUP_LEVELS[b.group] ?? [])

// The biomes a map of a level offers (the admin's in their order, then the project's own), without the retired ones.
export function offeredBiomes(index: BiomeIndex, level: MapLevel): MapBiome[] {
  return [...index.values()].filter(b => !b.retired && levelsOfBiome(b).includes(level))
}

// The biome ids a map uses: its base and its biome shapes.
export function usedBiomeIds(doc: Pick<MapDoc, 'base' | 'shapes'>): string[] {
  const out = new Set<string>([doc.base.biome])
  for (const s of doc.shapes) if (s.type === 'biome' && s.biome) out.add(s.biome)
  return [...out]
}

// How many biome shapes of a map use each biome.
export function biomeCounts(doc: Pick<MapDoc, 'shapes'>): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of doc.shapes) if (s.type === 'biome' && s.biome) out.set(s.biome, (out.get(s.biome) ?? 0) + 1)
  return out
}

// A new id for a biome of the project's own.
export function ownBiomeId(taken: Iterable<string>, make: () => string = () => Math.random().toString(36).slice(2, 10)): string {
  const used = new Set(taken)
  let id = `own_${make()}`
  while (used.has(id)) id = `own_${make()}`
  return id
}

// ---- the store: the admin's published list (loaded once per run; again after the admin publishes) and the open project's own biomes ----

let published: MapBiome[] = STARTER_BIOMES
let publishedStatus: 'idle' | 'loading' | 'ready' = 'idle'
let projectId: string | null = null
let own: MapBiome[] = []
let version = 0
const listeners = new Set<() => void>()
const emit = () => { version += 1; for (const l of listeners) l() }

export async function loadPublishedBiomes(force = false): Promise<void> {
  if (!force && publishedStatus !== 'idle') return
  publishedStatus = 'loading'
  try {
    const res = await getPublishedBiomes()
    if (Array.isArray(res?.biomes) && res.biomes.length > 0) published = res.biomes
  } catch {
    // The starter list stays.
  }
  publishedStatus = 'ready'
  emit()
}

// Read the project's own biomes again (after an import of map files added some on the server).
export const reloadOwnBiomes = (id: string): Promise<void> => loadOwn(id)

async function loadOwn(id: string): Promise<void> {
  if (projectId !== id) { projectId = id; own = []; emit() }
  try {
    const res = await getProjectBiomes(id)
    if (projectId === id && Array.isArray(res?.biomes)) { own = res.biomes; emit() }
  } catch {
    // None of its own, for now.
  }
}

// Replace the project's own biomes (saved at once, outside a map's undo: a biome belongs to every map of the project).
export async function saveOwnBiomes(id: string, biomes: MapBiome[]): Promise<boolean> {
  const before = own
  if (projectId === id) { own = biomes; emit() }
  try {
    const res = await putProjectBiomes(id, biomes)
    if (projectId === id && Array.isArray(res?.biomes)) { own = res.biomes; emit() }
    return true
  } catch {
    if (projectId === id) { own = before; emit() }
    return false
  }
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export interface BiomesView { published: MapBiome[]; own: MapBiome[]; index: BiomeIndex }
let cached: { version: number; id: string | null; view: BiomesView } | null = null

// The biomes of the open project (the admin's list and the project's own), loading them when first used.
export function useBiomes(id: string | null): BiomesView {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    void loadPublishedBiomes()
    if (id) void loadOwn(id)
  }, [id])
  const mine = id && projectId === id ? own : []
  if (!cached || cached.version !== version || cached.id !== id) cached = { version, id, view: { published, own: mine, index: biomeIndex(published, mine) } }
  return cached.view
}

export function __resetBiomesForTests() {
  published = STARTER_BIOMES; publishedStatus = 'idle'; projectId = null; own = []; version = 0; cached = null
  listeners.clear()
}
