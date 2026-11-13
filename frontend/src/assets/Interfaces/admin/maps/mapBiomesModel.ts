import type { MapBiome, MapBiomeGroup, MapLevel } from '../../../../api/types'
import { MAP_MAX_BIOMES } from '../../../../api/types'
import { GROUP_LEVELS } from '../../writer/maps/mapLevels'

// The admin's biome list (Configuration > Maps), pure: a new biome, moving one, its levels, and what stops the list being published (the server's
// publish_faults, same words). The list is published as a whole.

export const BIOME_GROUPS: Array<{ id: MapBiomeGroup; name: string }> = [
  { id: 'land', name: 'Land' }, { id: 'water', name: 'Water' }, { id: 'material', name: 'Floor material' }, { id: 'space', name: 'Space' },
  { id: 'star', name: 'Kind of star' }, { id: 'planet', name: 'Kind of planet' },
]

const NEW_COLOURS = ['#7fae5a', '#c9a36a', '#6c9bd2', '#b5654a', '#9aa86a', '#d9a441', '#4fa89a', '#8e7aa8']

// An id for a new biome: its name made into a word, unique in the list.
export function biomeIdOf(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'biome'
  let id = stem
  for (let n = 2; used.has(id) || id.startsWith('own_'); n += 1) id = `${stem}_${n}`
  return id
}

export function newBiome(list: MapBiome[]): MapBiome {
  return { id: biomeIdOf('New biome', list.map(b => b.id)), name: 'New biome', color: NEW_COLOURS[list.length % NEW_COLOURS.length], group: 'land', levels: [], retired: false }
}

export const canAdd = (list: MapBiome[]) => list.length < MAP_MAX_BIOMES

export function addBiome(list: MapBiome[]): MapBiome[] {
  return canAdd(list) ? [...list, newBiome(list)] : list
}

export function editBiome(list: MapBiome[], id: string, patch: Partial<Omit<MapBiome, 'id'>>): MapBiome[] {
  return list.map(b => (b.id === id ? { ...b, ...patch, name: patch.name !== undefined ? patch.name.slice(0, 40) : b.name } : b))
}

export const removeBiome = (list: MapBiome[], id: string): MapBiome[] => list.filter(b => b.id !== id)

// Move a biome one place up (-1) or down (+1): the order the Biomes panel of a map offers them in.
export function moveBiome(list: MapBiome[], id: string, delta: -1 | 1): MapBiome[] {
  const at = list.findIndex(b => b.id === id)
  const to = at + delta
  if (at < 0 || to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[at], next[to]] = [next[to], next[at]]
  return next
}

// The levels a biome is offered on: its own, or (when it names none) its group's.
export const levelsShown = (b: MapBiome): MapLevel[] => (b.levels.length > 0 ? b.levels : GROUP_LEVELS[b.group] ?? [])

// Turn one level on or off. The first change from "as its group" starts from the group's levels.
export function toggleLevel(b: MapBiome, level: MapLevel): MapLevel[] {
  const now = levelsShown(b)
  return now.includes(level) ? now.filter(l => l !== level) : [...now, level]
}

// What stops the list being published (the server's words).
export function biomeFaults(list: MapBiome[]): string[] {
  const faults: string[] = []
  const names = new Set<string>()
  list.filter(b => !b.retired).forEach((b, i) => {
    if (!b.name.trim()) { faults.push(`Biome ${i + 1} needs a name.`); return }
    const key = b.name.trim().toLowerCase()
    if (names.has(key)) faults.push(`Two biomes are called ${b.name.trim()}.`)
    names.add(key)
  })
  return faults
}

// Whether the draft differs from what is published (retired biomes are the server's to keep, so they do not count).
export function hasChanges(draft: MapBiome[], published: MapBiome[] | null): boolean {
  const live = (published ?? []).filter(b => !b.retired)
  return JSON.stringify(draft) !== JSON.stringify(live)
}
