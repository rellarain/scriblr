import type { MapFloor } from '../../../../api/types'
import { cleanFloor } from './mapFloors'
import type { MapBase, MapDoc, MapLayer, MapLayerKind, MapLevel, MapSummary, MapUnits, ReaderShare } from '../../../../api/types'
import { MAP_MAX_HEIGHT_RANGE, MAP_MAX_SIDE, NO_SHARE, shareOf } from '../../../../api/types'
import { changeUnits, type ConvertMode } from './mapUnits'

// Maps, as pure functions: the working copy of a map, the changes of its own fields and layers, and the undo log. The land is biome shapes over a base
// (mapItems.ts edits the shapes); the painted cells of a map from before levels are kept by the server as they were, and never touched here. The server's
// MapDoc repairs what is odd (schema.py), so what is made here only has to be right, not defended.

export const MAP_MAX_LAYERS = 30
export const MAP_TITLE_MAX = 120

// The working copy of a map is the map itself (shapes are replaced, never changed in place, so the undo log can keep the ones before).
export type MapDraft = MapDoc
// Everything of a map but when it was saved.
export type MapMeta = Omit<MapDraft, 'updatedAt'>

export const draftOf = (doc: MapDoc): MapDraft => ({ ...doc })
export const docOf = (draft: MapDraft): MapDoc => ({ ...draft })
export const metaOf = ({ updatedAt: _updatedAt, ...meta }: MapDraft): MapMeta => meta

export const inside = (draft: Pick<MapDraft, 'width' | 'height'>, x: number, y: number) => x >= 0 && y >= 0 && x < draft.width && y < draft.height

// ---- the undo log ----

// A change to the map's fields (its shapes, labels and layers are fields too): the fields before and after.
export type MapEdit = { kind: 'meta'; before: MapMeta; after: MapMeta }

// One map's undo and redo. A drag is one entry; so is a change of a field. A new change takes the redo away.
export class MapHistory {
  private done: MapEdit[] = []
  private undone: MapEdit[] = []
  constructor(private readonly limit = 100) {}

  get canUndo() { return this.done.length > 0 }
  get canRedo() { return this.undone.length > 0 }

  push(edit: MapEdit) {
    this.done.push(edit)
    if (this.done.length > this.limit) this.done.shift()
    this.undone = []
  }

  // Take back the last change; the draft it makes.
  undo(draft: MapDraft): MapDraft | null {
    const edit = this.done.pop()
    if (!edit) return null
    this.undone.push(edit)
    return { ...draft, ...edit.before }
  }

  redo(draft: MapDraft): MapDraft | null {
    const edit = this.undone.pop()
    if (!edit) return null
    this.done.push(edit)
    return { ...draft, ...edit.after }
  }
}

// A change of the map's own fields as an undo entry (and the new draft).
export function change(draft: MapDraft, fields: Partial<MapMeta>): { draft: MapDraft; edit: MapEdit } {
  const next: MapDraft = { ...draft, ...fields }
  return { draft: next, edit: { kind: 'meta', before: metaOf(draft), after: metaOf(next) } }
}

export type Change = { draft: MapDraft; edit: MapEdit } | null

// ---- the map's fields ----

export function setTitle(draft: MapDraft, title: string): Change {
  const next = title.trim().slice(0, MAP_TITLE_MAX)
  return next === '' || next === draft.title ? null : change(draft, { title: next })
}

export function setScale(draft: MapDraft, cellSize: number, unit: string): Change {
  const size = Number.isFinite(cellSize) && cellSize > 0 ? Math.min(cellSize, 1_000_000) : draft.cellSize
  const name = unit.trim().slice(0, 20) || draft.unit
  return size === draft.cellSize && name === draft.unit ? null : change(draft, { cellSize: size, unit: name })
}

// What the map holds (the next level down is what a place's map is by default).
export function setLevel(draft: MapDraft, level: MapLevel): Change {
  return level === draft.level ? null : change(draft, { level })
}

// What lies under every biome shape.
export function setBase(draft: MapDraft, base: Partial<MapBase>): Change {
  const next = { ...draft.base, ...base }
  return next.biome === draft.base.biome && next.height === draft.base.height ? null : change(draft, { base: next })
}

// Another unit system: convert every number (the size of a cell, a day's travel, the heights) or keep the numbers and only rename the units.
export function setUnits(draft: MapDraft, units: MapUnits, mode: ConvertMode): Change {
  if (units === draft.units) return null
  return change(draft, changeUnits(draft, units, mode))
}

// Move the map inside another (null = a top-level map). The caller keeps it out of itself and what it holds (descendantIds).
export function setParent(draft: MapDraft, parentId: string | null): Change {
  return parentId === draft.parentId ? null : change(draft, { parentId })
}

// How far a traveller goes in a day, in the map's unit (null = not set).
export function setPace(draft: MapDraft, pace: number | null): Change {
  const next = pace !== null && Number.isFinite(pace) && pace > 0 ? Math.min(pace, 1_000_000) : null
  return next === draft.pace ? null : change(draft, { pace: next })
}

// A floor's place among the floors of its building and its name (a map that is not a floor has none).
export function setFloor(draft: MapDraft, patch: Partial<MapFloor>): Change {
  if (!draft.floor) return null
  const next = cleanFloor(patch, draft.floor)
  return next.order === draft.floor.order && next.name === draft.floor.name ? null : change(draft, { floor: next })
}

export function setOverlay(draft: MapDraft, field: 'scaleBar' | 'compass' | 'legend' | 'contours' | 'relief', on: boolean): Change {
  return Boolean(draft[field]) === on ? null : change(draft, { [field]: on })
}

// The height that reads lightest (the same depth reads darkest), in the map's height unit; null = the level's.
export function setHeightRange(draft: MapDraft, range: number | null): Change {
  const next = range !== null && Number.isFinite(range) && range > 0 ? Math.min(Math.round(range), MAP_MAX_HEIGHT_RANGE) : null
  return next === (draft.heightRange ?? null) ? null : change(draft, { heightRange: next })
}

// The outline chapter or scene from which a version is the map that is true (null = not placed yet).
export function setAppliesFrom(draft: MapDraft, at: string | null): Change {
  const next = at || null
  if ((draft.appliesFrom ?? null) === next) return null
  return change({ ...draft, appliesFrom: draft.appliesFrom ?? null }, { appliesFrom: next })
}

// What readers may see of the map (see ReaderShare).
export function setShare(draft: MapDraft, share: ReaderShare): Change {
  if (JSON.stringify(shareOf(draft)) === JSON.stringify(share)) return null
  // A map from before readers existed has no share: it is given the empty one first, so an undo has something to go back to.
  return change(draft.reader ? draft : { ...draft, reader: NO_SHARE }, { reader: share })
}

// A new size (what lies outside it is held to the edge by the server).
export function resize(draft: MapDraft, width: number, height: number): Change {
  const w = Math.max(1, Math.min(MAP_MAX_SIDE, Math.round(width)))
  const h = Math.max(1, Math.min(MAP_MAX_SIDE, Math.round(height)))
  if (w === draft.width && h === draft.height) return null
  return change(draft, { width: w, height: h })
}

export type MakeId = () => string
const randomId: MakeId = () => Math.random().toString(36).slice(2, 8)

// ---- layers ----

export const LAYER_NAMES: Record<MapLayerKind, string> = { terrain: 'Biomes', shapes: 'Regions and lines', symbols: 'Markers', labels: 'Labels', notes: 'Notes' }

export function toggleLayer(draft: MapDraft, id: string, field: 'visible' | 'locked'): Change {
  if (!draft.layers.some(l => l.id === id)) return null
  return change(draft, { layers: draft.layers.map(l => (l.id === id ? { ...l, [field]: !l[field] } : l)) })
}

export function renameLayer(draft: MapDraft, id: string, name: string): Change {
  const next = name.trim().slice(0, 40)
  const layer = draft.layers.find(l => l.id === id)
  if (!layer || next === '' || next === layer.name) return null
  return change(draft, { layers: draft.layers.map(l => (l.id === id ? { ...l, name: next } : l)) })
}

// An undo entry for a change that was made without one (a drag that was shown as it went): the fields before and after.
export const metaEdit = (before: MapDraft, after: MapDraft): MapEdit => ({ kind: 'meta', before: metaOf(before), after: metaOf(after) })

// A layer one place up (+1, drawn later) or down (-1).
export function moveLayer(draft: MapDraft, id: string, dir: -1 | 1): Change {
  const from = draft.layers.findIndex(l => l.id === id)
  const to = from + dir
  if (from < 0 || to < 0 || to >= draft.layers.length) return null
  const layers = [...draft.layers]
  ;[layers[from], layers[to]] = [layers[to], layers[from]]
  return change(draft, { layers })
}

// A layer of a kind other than the biomes (a map has the one biomes layer), put on top.
export function addLayer(draft: MapDraft, kind: Exclude<MapLayerKind, 'terrain'>, makeId: MakeId = randomId): Change {
  if (draft.layers.length >= MAP_MAX_LAYERS) return null
  const same = draft.layers.filter(l => l.kind === kind).length
  const layer: MapLayer = { id: `lay_${makeId()}`, name: `${LAYER_NAMES[kind]} ${same + 1}`, kind, visible: true, locked: false }
  return change(draft, { layers: [...draft.layers, layer] })
}

// Take a layer away (never the biomes layer).
export function removeLayer(draft: MapDraft, id: string): Change {
  const layer = draft.layers.find(l => l.id === id)
  if (!layer || layer.kind === 'terrain') return null
  return change(draft, { layers: draft.layers.filter(l => l.id !== id), labels: draft.labels.filter(i => i.layerId !== id), shapes: draft.shapes.filter(i => i.layerId !== id) })
}

// The biomes layer, when biome shapes can be drawn on it now (it is shown and not locked).
export function biomeLayer(draft: Pick<MapDraft, 'layers'>): MapLayer | null {
  const layer = draft.layers.find(l => l.kind === 'terrain')
  return layer && layer.visible && !layer.locked ? layer : null
}

// ---- the tree of maps ----

export interface MapRow { map: MapSummary; depth: number; hasChildren: boolean }

// The maps depth first: each map's own maps (by order, then title) under it.
export function mapRows(maps: MapSummary[]): MapRow[] {
  const ids = new Set(maps.map(m => m.id))
  const kids = new Map<string | null, MapSummary[]>()
  // A version is not in the tree: it is listed under the map it is a version of.
  for (const m of maps.filter(x => !x.versionOf)) {
    const parent = m.parentId !== null && ids.has(m.parentId) ? m.parentId : null
    kids.set(parent, [...(kids.get(parent) ?? []), m])
  }
  for (const list of kids.values()) list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  const rows: MapRow[] = []
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const m of kids.get(parent) ?? []) {
      if (seen.has(m.id)) continue
      rows.push({ map: m, depth, hasChildren: (kids.get(m.id) ?? []).length > 0 })
      walk(m.id, depth + 1, new Set([...seen, m.id]))
    }
  }
  walk(null, 0, new Set())
  return rows
}

export const summaryOf = (doc: MapDoc | MapDraft): MapSummary => ({
  id: doc.id, title: doc.title, kind: doc.kind, level: doc.level, parentId: doc.parentId, order: doc.order, width: doc.width, height: doc.height, updatedAt: doc.updatedAt,
  versionOf: doc.versionOf ?? null, appliesFrom: doc.appliesFrom ?? null, floor: doc.floor ?? null,
})

// The maps a map is inside, outermost first, and the map itself last (a loop in the data is cut).
export function mapPath(maps: MapSummary[], id: string): MapSummary[] {
  const byId = new Map(maps.map(m => [m.id, m]))
  const out: MapSummary[] = []
  const seen = new Set<string>()
  for (let cur = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    seen.add(cur.id)
    out.unshift(cur)
  }
  return out
}

// The ids of every map inside a map, at any depth.
export function descendantIds(maps: MapSummary[], id: string): Set<string> {
  const out = new Set<string>()
  const queue = [id]
  while (queue.length > 0) {
    const at = queue.pop()!
    for (const m of maps) if (m.parentId === at && !out.has(m.id) && m.id !== id) { out.add(m.id); queue.push(m.id) }
  }
  return out
}
