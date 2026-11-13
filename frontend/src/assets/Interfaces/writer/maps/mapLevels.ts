import type { MapBiomeGroup, MapLevel, MapUnits } from '../../../../api/types'

// The levels of a map, from the largest to the smallest, and what a new map of each starts with (the backend's MAP_LEVEL_DEFAULTS holds the same table).
// Heights are in metres here; an imperial map keeps feet.

export interface LevelDef {
  id: MapLevel
  name: string
  // What a map of this level holds, in a few words (shown under the level select).
  holds: string
  // How the land is drawn: biomes (land and water), materials (floors) or space.
  drawn: 'biomes' | 'materials' | 'space'
  base: string
  baseHeight: number
  // The height that reads lightest (the same depth reads darkest), in metres; 0 = not shaded by height.
  heightRange: number
  metric: { cell: number; unit: string }
  imperial: { cell: number; unit: string }
  // The size a new map of this level is made at.
  size: { width: number; height: number }
}

export const LEVELS: LevelDef[] = [
  { id: 'intergalactic', name: 'Intergalactic', holds: 'Several star systems', drawn: 'space', base: 'space', baseHeight: 0, heightRange: 0, metric: { cell: 1, unit: 'ly' }, imperial: { cell: 1, unit: 'ly' }, size: { width: 64, height: 48 } },
  { id: 'galactic', name: 'Galactic', holds: 'One star system and its planets', drawn: 'space', base: 'space', baseHeight: 0, heightRange: 0, metric: { cell: 0.1, unit: 'AU' }, imperial: { cell: 0.1, unit: 'AU' }, size: { width: 64, height: 48 } },
  { id: 'planetary', name: 'Planetary', holds: 'One planet and its continents', drawn: 'biomes', base: 'saltwater', baseHeight: -3000, heightRange: 8000, metric: { cell: 100, unit: 'km' }, imperial: { cell: 60, unit: 'mi' }, size: { width: 128, height: 64 } },
  { id: 'continental', name: 'Continental', holds: 'One land mass and its nations', drawn: 'biomes', base: 'saltwater', baseHeight: -200, heightRange: 6000, metric: { cell: 25, unit: 'km' }, imperial: { cell: 15, unit: 'mi' }, size: { width: 64, height: 48 } },
  { id: 'national', name: 'National', holds: 'A nation and its states, provinces or regions', drawn: 'biomes', base: 'plain', baseHeight: 0, heightRange: 4000, metric: { cell: 10, unit: 'km' }, imperial: { cell: 6, unit: 'mi' }, size: { width: 64, height: 48 } },
  { id: 'regional', name: 'Regional', holds: 'One state or region: its biomes and municipalities', drawn: 'biomes', base: 'plain', baseHeight: 0, heightRange: 2000, metric: { cell: 2, unit: 'km' }, imperial: { cell: 1, unit: 'mi' }, size: { width: 64, height: 48 } },
  { id: 'local', name: 'Local', holds: 'One biome or municipality and its buildings', drawn: 'biomes', base: 'plain', baseHeight: 0, heightRange: 300, metric: { cell: 10, unit: 'm' }, imperial: { cell: 30, unit: 'ft' }, size: { width: 64, height: 48 } },
  { id: 'architectural', name: 'Architectural', holds: 'One building: its floors and rooms', drawn: 'materials', base: 'outside', baseHeight: 0, heightRange: 0, metric: { cell: 1, unit: 'm' }, imperial: { cell: 3, unit: 'ft' }, size: { width: 32, height: 24 } },
  { id: 'interior', name: 'Interior', holds: 'One room', drawn: 'materials', base: 'wood', baseHeight: 0, heightRange: 0, metric: { cell: 0.5, unit: 'm' }, imperial: { cell: 1, unit: 'ft' }, size: { width: 32, height: 24 } },
]

export const MAP_LEVELS: MapLevel[] = LEVELS.map(l => l.id)

export const levelDef = (id: MapLevel | undefined): LevelDef => LEVELS.find(l => l.id === id) ?? LEVELS[2]
export const levelName = (id: MapLevel | undefined): string => levelDef(id).name

// The levels below a level (a place's map can be any of them), and the next one down (what it is by default). The last level has none below it.
export function levelsBelow(id: MapLevel): MapLevel[] {
  const at = MAP_LEVELS.indexOf(id)
  return MAP_LEVELS.slice(at + 1)
}
export function nextLevelDown(id: MapLevel): MapLevel {
  return levelsBelow(id)[0] ?? id
}

// The groups of biomes a level offers when a biome names no levels of its own (the backend's BIOME_GROUP_LEVELS).
export const GROUP_LEVELS: Record<MapBiomeGroup, MapLevel[]> = {
  land: ['planetary', 'continental', 'national', 'regional', 'local'],
  water: ['planetary', 'continental', 'national', 'regional', 'local'],
  material: ['architectural', 'interior'],
  space: ['intergalactic', 'galactic'],
}

export const FEET_PER_METRE = 1 / 0.3048

// What a new map of a level starts with in a unit system (custom maps take metric numbers with their own unit chosen later).
export function defaultsFor(id: MapLevel, units: MapUnits) {
  const def = levelDef(id)
  const imperial = units === 'imperial'
  const scale = imperial ? def.imperial : def.metric
  return {
    cellSize: scale.cell,
    unit: scale.unit,
    base: { biome: def.base, height: Math.round(def.baseHeight * (imperial ? FEET_PER_METRE : 1)) },
    width: def.size.width,
    height: def.size.height,
  }
}

// The height range of a map (in its height unit): the level's default (M2 lets a map set its own).
export function heightRangeOf(id: MapLevel, units: MapUnits): number {
  return levelDef(id).heightRange * (units === 'imperial' ? FEET_PER_METRE : 1)
}
