import type { MapSummary } from '../../../../api/types'
import type { StoryPoint } from '../characters/story'

// Versions of a map over the story: a version is a copy of the map that is true from a chapter or scene on (backend: MapDoc.versionOf and appliesFrom). The first map
// is the one from the start; a version is listed under it, not in the tree of maps inside maps, and its symbols are not places (the first map's are).

export const isVersion = (m: MapSummary) => !!m.versionOf

// The first map of a map or of one of its versions.
export const baseIdOf = (maps: MapSummary[], id: string): string => maps.find(m => m.id === id)?.versionOf ?? id

// The versions of a map, in the order they were made.
export const versionsOf = (maps: MapSummary[], baseId: string): MapSummary[] =>
  maps.filter(m => m.versionOf === baseId).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))

// The map and its versions, the map first: what "the map at a point" chooses among.
export const familyOf = (maps: MapSummary[], id: string): MapSummary[] => {
  const base = maps.find(m => m.id === baseIdOf(maps, id))
  return base ? [base, ...versionsOf(maps, base.id)] : []
}

// The map of a family that is true at a point of the story: the version whose point is the last at or before it (the first map when none is yet).
// A version with no point, or one that is gone from the outline, is not placed and is never chosen.
export function versionAt(maps: MapSummary[], id: string, points: StoryPoint[], pointId: string): string {
  const base = baseIdOf(maps, id)
  const at = points.findIndex(p => p.id === pointId)
  if (at < 0) return base
  let best = base
  let bestIndex = -1
  for (const v of versionsOf(maps, base)) {
    const i = v.appliesFrom ? points.findIndex(p => p.id === v.appliesFrom) : -1
    if (i >= 0 && i <= at && i >= bestIndex) { best = v.id; bestIndex = i }
  }
  return best
}

// Where a map of a family begins to be true, for a list: "from Chapter 2" (the first map is "from the start"; an unplaced version says so).
export function appliesLabel(map: MapSummary, points: StoryPoint[]): string {
  if (!map.versionOf) return 'from the start'
  const p = map.appliesFrom ? points.find(x => x.id === map.appliesFrom) : undefined
  return p ? `from ${p.title}` : map.appliesFrom ? 'from a part of the book that is gone' : 'not placed yet'
}
