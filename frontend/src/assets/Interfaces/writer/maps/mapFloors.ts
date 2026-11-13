import type { MapFloor, MapSummary } from '../../../../api/types'

// The floors of a building, pure: a floor is a map inside a building's map (an architectural map), with its place among the floors (-3 to 20: 0 is the
// ground floor, below it the basements) and an optional name of its own. The building map and each floor show a switcher of the building and its floors.

export const FLOOR_RANGE = { min: -3, max: 20 } as const
export const FLOOR_NAME_MAX = 40

// The name of a floor: its own, else from its place ("Ground floor", "Floor 2", "Basement 1").
export function floorName(floor: Pick<MapFloor, 'order' | 'name'>): string {
  if (floor.name.trim()) return floor.name.trim()
  if (floor.order === 0) return 'Ground floor'
  return floor.order > 0 ? `Floor ${floor.order}` : `Basement ${-floor.order}`
}

type Row = Pick<MapSummary, 'id' | 'title' | 'level' | 'parentId'> & { floor?: MapFloor | null; versionOf?: string | null }

// The building a map belongs to: the map it is a floor of, or the map itself when it is an architectural map that is not a floor; none otherwise.
export function buildingOf(maps: Row[], mapId: string): Row | null {
  const map = maps.find(m => m.id === mapId)
  if (!map) return null
  if (map.floor && map.parentId) return maps.find(m => m.id === map.parentId) ?? null
  return map.level === 'architectural' && !map.versionOf ? map : null
}

// The floors of a building, lowest first (then by title, for two of one place).
export function floorsOf(maps: Row[], buildingId: string): Array<Row & { floor: MapFloor }> {
  return maps
    .filter((m): m is Row & { floor: MapFloor } => m.parentId === buildingId && !!m.floor && !m.versionOf)
    .sort((a, b) => a.floor.order - b.floor.order || a.title.localeCompare(b.title))
}

// The place of a new floor: the one above the highest (the ground floor when there is none), held to the range; none when the range is full.
export function nextFloorOrder(floors: Array<{ floor: MapFloor }>): number | null {
  if (floors.length === 0) return 0
  const top = Math.max(...floors.map(f => f.floor.order))
  if (top < FLOOR_RANGE.max) return top + 1
  const free = Array.from({ length: FLOOR_RANGE.max - FLOOR_RANGE.min + 1 }, (_, k) => FLOOR_RANGE.min + k).find(o => !floors.some(f => f.floor.order === o))
  return free ?? null
}

// A floor's place and name, held to the range and the length.
export function cleanFloor(floor: Partial<MapFloor>, old: MapFloor = { order: 0, name: '' }): MapFloor {
  const order = floor.order === undefined || !Number.isFinite(floor.order) ? old.order : Math.round(Math.min(FLOOR_RANGE.max, Math.max(FLOOR_RANGE.min, floor.order)))
  const name = floor.name === undefined ? old.name : floor.name.trim().slice(0, FLOOR_NAME_MAX)
  return { order, name }
}
