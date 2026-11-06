import type { MapDoc, MapLayer, MapLayerKind, MapSummary, MapTerrain } from '../../../../api/types'
import { MAP_MAX_SIDE } from '../../../../api/types'

// Maps, as pure functions: the working copy of a map (its cells decoded, one terrain index per cell, so painting is direct), the run-length coding of
// the cells the backend keeps, the brush and flood fill, terrain and layer changes, and the undo log. The server's MapDoc repairs what is odd (schema.py),
// so what is made here only has to be right, not defended.

export const MAP_MAX_TERRAINS = 64
export const MAP_MAX_LAYERS = 30
export const MAP_TITLE_MAX = 120

export interface MapDraft extends Omit<MapDoc, 'cells'> { cells: Uint16Array }
// Everything of a map but its cells and when it was saved.
export type MapMeta = Omit<MapDraft, 'cells' | 'updatedAt'>

// ---- the cells ----

// The run pairs [terrain index, how many, ...] as one terrain index per cell (`total` cells; a surplus is cut, a shortfall is the first terrain).
export function decodeCells(runs: number[], total: number): Uint16Array {
  const cells = new Uint16Array(total)
  let at = 0
  for (let i = 0; i + 1 < runs.length && at < total; i += 2) {
    const count = Math.min(runs[i + 1], total - at)
    if (runs[i] !== 0) cells.fill(runs[i], at, at + count)
    at += count
  }
  return cells
}

export function encodeCells(cells: Uint16Array): number[] {
  const runs: number[] = []
  let at = 0
  while (at < cells.length) {
    const value = cells[at]
    let end = at + 1
    while (end < cells.length && cells[end] === value) end += 1
    runs.push(value, end - at)
    at = end
  }
  return runs
}

export const draftOf = (doc: MapDoc): MapDraft => ({ ...doc, cells: decodeCells(doc.cells, doc.width * doc.height) })
export const docOf = (draft: MapDraft): MapDoc => ({ ...draft, cells: encodeCells(draft.cells) })
export const metaOf = ({ cells: _cells, updatedAt: _updatedAt, ...meta }: MapDraft): MapMeta => meta

export const cellIndex = (width: number, x: number, y: number) => y * width + x
export const inside = (draft: Pick<MapDraft, 'width' | 'height'>, x: number, y: number) => x >= 0 && y >= 0 && x < draft.width && y < draft.height

// ---- painting ----

export const BRUSH_SIZES = [1, 2, 3] as const
export type BrushSize = (typeof BRUSH_SIZES)[number]

// The cells a square brush of `size` covers with its top-left-of-centre cell at (x, y) (a brush of 2 reaches right and down), kept on the map.
export function brushCells(draft: Pick<MapDraft, 'width' | 'height'>, x: number, y: number, size: number): number[] {
  const start = -Math.floor((size - 1) / 2)
  const out: number[] = []
  for (let dy = start; dy < start + size; dy += 1) {
    for (let dx = start; dx < start + size; dx += 1) {
      if (inside(draft, x + dx, y + dy)) out.push(cellIndex(draft.width, x + dx, y + dy))
    }
  }
  return out
}

// The cells on the line from one cell to another, both ends included (Bresenham).
export function lineBetween(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy, x = x0, y = y0
  for (;;) {
    points.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x += sx }
    if (e2 <= dx) { err += dx; y += sy }
  }
  return points
}

// A paint stroke in progress: the cells are changed as the pointer moves, and what each cell was before is kept (once) so the stroke is one undo.
export class Stroke {
  private readonly was = new Map<number, number>()
  constructor(private readonly draft: Pick<MapDraft, 'width' | 'height' | 'cells'>, readonly terrain: number, readonly size: number) {}

  // Paint along the line from the last point to this one (the first point is just painted).
  paint(fromX: number | null, fromY: number | null, x: number, y: number) {
    const points = fromX === null || fromY === null ? [[x, y] as [number, number]] : lineBetween(fromX, fromY, x, y)
    for (const [px, py] of points) {
      for (const i of brushCells(this.draft, px, py, this.size)) {
        const old = this.draft.cells[i]
        if (old === this.terrain) continue
        if (!this.was.has(i)) this.was.set(i, old)
        this.draft.cells[i] = this.terrain
      }
    }
  }

  // The undo entry of what the stroke changed (none when nothing did).
  finish(): MapEdit | null { return cellsEdit(this.draft.cells, this.was) }
}

function cellsEdit(cells: Uint16Array, was: Map<number, number>): MapEdit | null {
  const idx: number[] = [], before: number[] = [], after: number[] = []
  for (const [i, old] of was) {
    if (cells[i] !== old) { idx.push(i); before.push(old); after.push(cells[i]) }
  }
  if (idx.length === 0) return null
  return { kind: 'cells', idx: Uint32Array.from(idx), before: Uint16Array.from(before), after: Uint16Array.from(after) }
}

// Fill the connected area (up, down, left, right) of the terrain at (x, y) with `terrain`.
export function floodFill(draft: Pick<MapDraft, 'width' | 'height' | 'cells'>, x: number, y: number, terrain: number): MapEdit | null {
  if (!inside(draft, x, y)) return null
  const { width, height, cells } = draft
  const target = cells[cellIndex(width, x, y)]
  if (target === terrain) return null
  const was = new Map<number, number>()
  const stack = [cellIndex(width, x, y)]
  while (stack.length > 0) {
    const i = stack.pop()!
    if (cells[i] !== target) continue
    was.set(i, target)
    cells[i] = terrain
    const cx = i % width, cy = (i - cx) / width
    if (cx > 0) stack.push(i - 1)
    if (cx < width - 1) stack.push(i + 1)
    if (cy > 0) stack.push(i - width)
    if (cy < height - 1) stack.push(i + width)
  }
  return cellsEdit(cells, was)
}

// ---- the undo log ----

export type MapEdit =
  | { kind: 'cells'; idx: Uint32Array; before: Uint16Array; after: Uint16Array }
  // A change to the map's own fields, and, when the cells were made new (resized, a terrain removed), the cells before and after.
  | { kind: 'meta'; before: MapMeta; after: MapMeta; cellsBefore?: Uint16Array; cellsAfter?: Uint16Array }

// One map's undo and redo. A paint stroke is one entry; so is a change of a field. A new change takes the redo away.
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

  // Take back the last change; the draft it makes (the cells of a stroke are put back in place).
  undo(draft: MapDraft): MapDraft | null {
    const edit = this.done.pop()
    if (!edit) return null
    this.undone.push(edit)
    return applyEdit(draft, edit, 'undo')
  }

  redo(draft: MapDraft): MapDraft | null {
    const edit = this.undone.pop()
    if (!edit) return null
    this.done.push(edit)
    return applyEdit(draft, edit, 'redo')
  }
}

function applyEdit(draft: MapDraft, edit: MapEdit, way: 'undo' | 'redo'): MapDraft {
  if (edit.kind === 'cells') {
    const values = way === 'undo' ? edit.before : edit.after
    for (let n = 0; n < edit.idx.length; n += 1) draft.cells[edit.idx[n]] = values[n]
    return { ...draft }
  }
  const meta = way === 'undo' ? edit.before : edit.after
  const cells = way === 'undo' ? edit.cellsBefore : edit.cellsAfter
  return { ...draft, ...meta, cells: cells ?? draft.cells }
}

// A change of the map's own fields as an undo entry (and the new draft).
export function change(draft: MapDraft, fields: Partial<MapMeta>, cells?: Uint16Array): { draft: MapDraft; edit: MapEdit } {
  const next: MapDraft = { ...draft, ...fields, cells: cells ?? draft.cells }
  return { draft: next, edit: { kind: 'meta', before: metaOf(draft), after: metaOf(next), ...(cells ? { cellsBefore: draft.cells, cellsAfter: cells } : {}) } }
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

// Move the map inside another (null = a top-level map). The caller keeps it out of itself and what it holds (descendantIds).
export function setParent(draft: MapDraft, parentId: string | null): Change {
  return parentId === draft.parentId ? null : change(draft, { parentId })
}

// How far a traveller goes in a day, in the map's unit (null = not set).
export function setPace(draft: MapDraft, pace: number | null): Change {
  const next = pace !== null && Number.isFinite(pace) && pace > 0 ? Math.min(pace, 1_000_000) : null
  return next === draft.pace ? null : change(draft, { pace: next })
}

// The map's look (how its terrain colours and text are drawn), and what is drawn over it.
export function setTheme(draft: MapDraft, theme: MapDraft['theme']): Change {
  return theme === draft.theme ? null : change(draft, { theme })
}

export function setOverlay(draft: MapDraft, field: 'scaleBar' | 'compass' | 'legend', on: boolean): Change {
  return draft[field] === on ? null : change(draft, { [field]: on })
}

// A new size: what the old cells cover is kept (from the top left), the new cells are the first terrain.
export function resize(draft: MapDraft, width: number, height: number): Change {
  const w = Math.max(1, Math.min(MAP_MAX_SIDE, Math.round(width)))
  const h = Math.max(1, Math.min(MAP_MAX_SIDE, Math.round(height)))
  if (w === draft.width && h === draft.height) return null
  const cells = new Uint16Array(w * h)
  for (let y = 0; y < Math.min(h, draft.height); y += 1) {
    for (let x = 0; x < Math.min(w, draft.width); x += 1) cells[y * w + x] = draft.cells[y * draft.width + x]
  }
  return change(draft, { width: w, height: h }, cells)
}

// ---- terrain ----

export type MakeId = () => string
const randomId: MakeId = () => Math.random().toString(36).slice(2, 8)

export function addTerrain(draft: MapDraft, name: string, color: string, makeId: MakeId = randomId): { change: NonNullable<Change>; index: number } | null {
  if (draft.terrains.length >= MAP_MAX_TERRAINS) return null
  const taken = new Set(draft.terrains.map(t => t.id))
  let id = `ter_${makeId()}`
  while (taken.has(id)) id = `ter_${makeId()}`
  const terrain: MapTerrain = { id, name: name.trim().slice(0, 40) || 'New terrain', color, builtIn: false }
  return { change: change(draft, { terrains: [...draft.terrains, terrain] }), index: draft.terrains.length }
}

export function editTerrain(draft: MapDraft, index: number, fields: Partial<Pick<MapTerrain, 'name' | 'color'>>): Change {
  const old = draft.terrains[index]
  if (!old) return null
  const next = { ...old, ...(fields.name !== undefined ? { name: fields.name.trim().slice(0, 40) || old.name } : {}), ...(fields.color !== undefined ? { color: fields.color } : {}) }
  if (next.name === old.name && next.color === old.color) return null
  return change(draft, { terrains: draft.terrains.map((t, i) => (i === index ? next : t)) })
}

// Take a terrain out of the palette: the cells that used it become the first terrain, and the indexes after it move down. The last terrain stays.
export function removeTerrain(draft: MapDraft, index: number): Change {
  if (draft.terrains.length <= 1 || !draft.terrains[index]) return null
  const cells = new Uint16Array(draft.cells.length)
  for (let i = 0; i < cells.length; i += 1) {
    const v = draft.cells[i]
    cells[i] = v === index ? 0 : v > index ? v - 1 : v
  }
  return change(draft, { terrains: draft.terrains.filter((_, i) => i !== index) }, cells)
}

export function terrainCounts(cells: Uint16Array, terrains: number): number[] {
  const counts = new Array<number>(terrains).fill(0)
  for (let i = 0; i < cells.length; i += 1) if (cells[i] < terrains) counts[cells[i]] += 1
  return counts
}

// ---- layers ----

export const LAYER_NAMES: Record<MapLayerKind, string> = { terrain: 'Terrain', shapes: 'Regions and lines', symbols: 'Symbols', labels: 'Labels', notes: 'Notes' }

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

// A layer of a kind other than terrain (a map has the one terrain layer), put on top.
export function addLayer(draft: MapDraft, kind: Exclude<MapLayerKind, 'terrain'>, makeId: MakeId = randomId): Change {
  if (draft.layers.length >= MAP_MAX_LAYERS) return null
  const same = draft.layers.filter(l => l.kind === kind).length
  const layer: MapLayer = { id: `lay_${makeId()}`, name: `${LAYER_NAMES[kind]} ${same + 1}`, kind, visible: true, locked: false }
  return change(draft, { layers: [...draft.layers, layer] })
}

// Take a layer away (never the terrain layer).
export function removeLayer(draft: MapDraft, id: string): Change {
  const layer = draft.layers.find(l => l.id === id)
  if (!layer || layer.kind === 'terrain') return null
  return change(draft, { layers: draft.layers.filter(l => l.id !== id), symbols: draft.symbols.filter(i => i.layerId !== id), labels: draft.labels.filter(i => i.layerId !== id), shapes: draft.shapes.filter(i => i.layerId !== id) })
}

// Whether the terrain can be painted now: its layer is shown and not locked.
export function terrainEditable(draft: Pick<MapDraft, 'layers'>): boolean {
  const layer = draft.layers.find(l => l.kind === 'terrain')
  return !!layer && layer.visible && !layer.locked
}

// ---- the tree of maps ----

export interface MapRow { map: MapSummary; depth: number; hasChildren: boolean }

// The maps depth first: each map's own maps (by order, then title) under it.
export function mapRows(maps: MapSummary[]): MapRow[] {
  const ids = new Set(maps.map(m => m.id))
  const kids = new Map<string | null, MapSummary[]>()
  for (const m of maps) {
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
  id: doc.id, title: doc.title, kind: doc.kind, parentId: doc.parentId, order: doc.order, width: doc.width, height: doc.height, updatedAt: doc.updatedAt,
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
