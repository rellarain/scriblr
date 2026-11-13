import type { MapLevel, MapLibraryShape, MapShapeCategory, MyMapShape } from '../../../../api/types'
import { MAP_MAX_LIBRARY_SHAPES } from '../../../../api/types'
import { LEVELS } from '../../writer/maps/mapLevels'

// The admin's default map shapes (Configuration > Maps > Shapes), pure: adding one from My shapes, its name, kind, levels and place in the list, and what
// stops the list being published (the server's publish_faults, same words). The list is published as a whole.

// An id for a shape added to the list: its kind and its name made into a word, unique in the list ("land:round_hill").
export function shapeIdOf(category: MapShapeCategory, name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'shape'
  let id = `${category}:${stem}`
  for (let n = 2; used.has(id); n += 1) id = `${category}:${stem}_${n}`
  return id
}

export const canAdd = (list: MapLibraryShape[]) => list.length < MAP_MAX_LIBRARY_SHAPES

// A shape of My shapes put at the end of the list, as a shape of the library (not the project it came from or when it was saved). A name the kind
// already has gets a number.
export function addFromMine(list: MapLibraryShape[], mine: MyMapShape): MapLibraryShape[] {
  if (!canAdd(list)) return list
  const { projectId: _p, projectTitle: _t, savedAt: _s, ...shape } = mine
  const names = new Set(list.filter(s => s.category === shape.category).map(s => s.name.toLowerCase()))
  let name = shape.name
  for (let n = 2; names.has(name.toLowerCase()); n += 1) name = `${shape.name.slice(0, 55)} ${n}`
  return [...list, { ...shape, name, id: shapeIdOf(shape.category, shape.name, list.map(s => s.id)) }]
}

export function editShape(list: MapLibraryShape[], id: string, patch: Partial<Pick<MapLibraryShape, 'name' | 'category' | 'levels'>>): MapLibraryShape[] {
  return list.map(s => (s.id === id ? { ...s, ...patch, name: patch.name !== undefined ? patch.name.slice(0, 60) : s.name } : s))
}

export const removeShape = (list: MapLibraryShape[], id: string): MapLibraryShape[] => list.filter(s => s.id !== id)

// Move a shape one place up (-1) or down (+1) among the shapes of its kind: the order a map's Shapes panel offers them in.
export function moveShape(list: MapLibraryShape[], id: string, delta: -1 | 1): MapLibraryShape[] {
  const at = list.findIndex(s => s.id === id)
  if (at < 0) return list
  let to = at + delta
  while (to >= 0 && to < list.length && list[to].category !== list[at].category) to += delta
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[at], next[to]] = [next[to], next[at]]
  return next
}

// Turn a level on or off. A shape that names no level is offered on every level, so the first change starts from all of them; when every level is on
// again it names none.
export function toggleLevel(s: Pick<MapLibraryShape, 'levels'>, level: MapLevel): MapLevel[] {
  const now = s.levels.length > 0 ? s.levels : LEVELS.map(l => l.id)
  const next = now.includes(level) ? now.filter(l => l !== level) : LEVELS.map(l => l.id).filter(l => l === level || now.includes(l))
  return next.length === LEVELS.length ? [] : next
}

export const offeredOn = (s: Pick<MapLibraryShape, 'levels'>, level: MapLevel) => s.levels.length === 0 || s.levels.includes(level)

// What stops the list being published (the server's words).
export function shapeFaults(list: MapLibraryShape[]): string[] {
  const faults: string[] = []
  const names = new Set<string>()
  for (const s of list) {
    const key = `${s.category}/${s.name.toLowerCase()}`
    if (names.has(key)) faults.push(`Two shapes of one category are called ${s.name}.`)
    names.add(key)
  }
  return faults
}

// Whether the list differs from what is published.
export function hasChanges(draft: MapLibraryShape[], published: MapLibraryShape[] | null): boolean {
  return JSON.stringify(draft) !== JSON.stringify(published ?? [])
}
