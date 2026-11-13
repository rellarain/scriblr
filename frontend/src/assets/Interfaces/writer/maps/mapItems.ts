import { MAP_MAX_SLOPE, type MapHeightMode, type MapLabel, type MapShape, type MapShapeType, type MapSymbol } from '../../../../api/types'
import { MAX_POINTS, MIN_POINTS, SHAPE_WIDTH_RANGE, hitShape, makeBiomeShape, makeShape, nearestOnShape, shapeBounds, type Pen } from './mapShapes'
import { mapHeightRange } from './mapHeights'
import { heightUnit } from './mapUnits'
import { SYMBOL_SETS, symbolName } from './mapSymbols'
import { biomeLayer, change, type Change, type MakeId, type MapDraft } from './mapModel'
import { resolveBiome, usedBiomeIds, type BiomeIndex } from './mapBiomes'
import { nationFill } from './mapDrawShapes'

// The things on a map: biome shapes (the land, on the biomes layer), symbols (stamps), labels (text) and shapes (lines and regions, mapShapes.ts), each on
// a layer of its kind. All pure: placing, moving, editing and removing return a new draft (and the undo entry), and the hit test, the legend and the scale
// bar are computed from a draft. Positions are in cells (a symbol's or label's centre), so they stay where they are when the view zooms.

export const MAX_SYMBOLS = 5000
export const MAX_LABELS = 1000
export const SYMBOL_SIZE_RANGE = { min: 0.25, max: 16 } as const
export const LABEL_SIZE_RANGE = { min: 0.25, max: 16 } as const
export const LABEL_TEXT_MAX = 120
export const MAX_SHAPES = 2000
export const MAX_BIOME_SHAPES = 2000
export const HEIGHT_LIMIT = 100000

export type ItemKind = 'symbol' | 'label' | 'shape'
export interface ItemRef { kind: ItemKind; id: string }
export interface Rect { x0: number; y0: number; x1: number; y1: number }

const randomId: MakeId = () => Math.random().toString(36).slice(2, 8)
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))
const held = (draft: Pick<MapDraft, 'width' | 'height'>, x: number, y: number): [number, number] => [clamp(x, 0, draft.width), clamp(y, 0, draft.height)]

// A point on the grid: the middle of the cell it is in, or exactly where it is when the snap is off.
export function snapPoint(x: number, y: number, free: boolean): [number, number] {
  return free ? [x, y] : [Math.floor(x) + 0.5, Math.floor(y) + 0.5]
}

// The size a line of text takes, in cells (an estimate that does not need a canvas: about 0.55 of its height per character).
export function labelExtent(text: string, size: number): { w: number; h: number } {
  return { w: Math.max(1, text.length) * size * 0.55, h: size * 1.15 }
}

export function itemBounds(item: MapSymbol | MapLabel | MapShape, kind: ItemKind): Rect {
  if (kind === 'shape') return shapeBounds(item as MapShape)
  const at = item as MapSymbol | MapLabel
  if (kind === 'symbol') {
    const half = (at as MapSymbol).size / 2
    return { x0: at.x - half, y0: at.y - half, x1: at.x + half, y1: at.y + half }
  }
  const { w, h } = labelExtent((at as MapLabel).text, (at as MapLabel).size)
  return { x0: at.x - w / 2, y0: at.y - h / 2, x1: at.x + w / 2, y1: at.y + h / 2 }
}

export function findItem(draft: MapDraft, ref: ItemRef): MapSymbol | MapLabel | MapShape | undefined {
  if (ref.kind === 'shape') return draft.shapes.find(s => s.id === ref.id)
  return ref.kind === 'symbol' ? draft.symbols.find(s => s.id === ref.id) : draft.labels.find(l => l.id === ref.id)
}

// The layer new things of a kind go on: the topmost of that kind that is shown and not locked (none when there is not one).
export function activeLayerId(draft: Pick<MapDraft, 'layers'>, kind: 'symbols' | 'labels' | 'shapes'): string | null {
  for (let i = draft.layers.length - 1; i >= 0; i -= 1) {
    const layer = draft.layers[i]
    if (layer.kind === kind && layer.visible && !layer.locked) return layer.id
  }
  return null
}

function freshId(prefix: string, taken: Set<string>, makeId: MakeId): string {
  let id = `${prefix}_${makeId()}`
  while (taken.has(id)) id = `${prefix}_${makeId()}`
  return id
}

// The ids a new symbol or shape must not take: ids name places, so a symbol and a shape never share one.
const placeIds = (draft: Pick<MapDraft, 'symbols' | 'shapes'>) => new Set([...draft.symbols.map(s => s.id), ...draft.shapes.map(s => s.id)])

export function addSymbol(draft: MapDraft, kind: string, x: number, y: number, size: number, makeId: MakeId = randomId): { change: NonNullable<Change>; id: string } | null {
  const layerId = activeLayerId(draft, 'symbols')
  if (!layerId || draft.symbols.length >= MAX_SYMBOLS) return null
  const [px, py] = held(draft, x, y)
  const id = freshId('sym', placeIds(draft), makeId)
  const symbol: MapSymbol = { id, layerId, kind, x: px, y: py, size: clamp(size, SYMBOL_SIZE_RANGE.min, SYMBOL_SIZE_RANGE.max), color: null, name: '', mapIds: [] }
  return { change: change(draft, { symbols: [...draft.symbols, symbol] }), id }
}

export function addLabel(draft: MapDraft, text: string, x: number, y: number, size: number, makeId: MakeId = randomId): { change: NonNullable<Change>; id: string } | null {
  const layerId = activeLayerId(draft, 'labels')
  if (!layerId || draft.labels.length >= MAX_LABELS) return null
  const [px, py] = held(draft, x, y)
  const id = freshId('lbl', new Set(draft.labels.map(l => l.id)), makeId)
  const label: MapLabel = { id, layerId, text: text.trim().slice(0, LABEL_TEXT_MAX) || 'Label', x: px, y: py, size: clamp(size, LABEL_SIZE_RANGE.min, LABEL_SIZE_RANGE.max) }
  return { change: change(draft, { labels: [...draft.labels, label] }), id }
}

// A line or a region from the points that were clicked (in cells), drawn with the pen, on the topmost shown, unlocked shapes layer. None when there are too
// few points or no layer to put it on.
export function addShape(draft: MapDraft, type: MapShapeType, points: Array<[number, number]>, pen: Pen, makeId: MakeId = randomId): { change: NonNullable<Change>; id: string } | null {
  const layerId = activeLayerId(draft, 'shapes')
  if (!layerId || draft.shapes.length >= MAX_SHAPES || points.length < MIN_POINTS[type] || points.length > MAX_POINTS) return null
  const held_ = points.map(([x, y]) => held(draft, x, y))
  const id = freshId('shp', placeIds(draft), makeId)
  return { change: change(draft, { shapes: [...draft.shapes, makeShape(id, layerId, type, held_, pen)] }), id }
}

// What a new biome area does to the height (the defaults of the Biomes panel): keeps it, or sets, raises or lowers it, spread by a profile.
export type AreaLook = Partial<Pick<MapShape, 'heightMode' | 'height' | 'profile' | 'slope'>>

// A biome shape (an area of land in a biome) from the points that were clicked, on the biomes layer, drawn over the biome shapes already there. None when
// there are too few points, the biomes layer is hidden or locked, or the map has as many as it can hold.
export function addBiomeShape(
  draft: MapDraft, points: Array<[number, number]>, biome: string | null, smooth: boolean, makeId: MakeId = randomId, look: AreaLook = {},
): { change: NonNullable<Change>; id: string } | null {
  const layer = biomeLayer(draft)
  const count = draft.shapes.filter(s => s.type === 'biome').length
  if (!layer || count >= MAX_BIOME_SHAPES || points.length < MIN_POINTS.biome || points.length > MAX_POINTS) return null
  const held_ = points.map(([x, y]) => held(draft, x, y))
  const id = freshId('bio', placeIds(draft), makeId)
  const shape = makeBiomeShape(id, layer.id, held_, biome, smooth)
  if (look.heightMode && look.heightMode !== 'none') {
    shape.heightMode = look.heightMode
    shape.height = clamp(Math.round(look.height ?? 0), look.heightMode === 'set' ? -HEIGHT_LIMIT : 0, HEIGHT_LIMIT)
    shape.profile = look.profile ?? 'plateau'
    shape.slope = clamp(look.slope ?? 0, 0, MAP_MAX_SLOPE)
  }
  return { change: change(draft, { shapes: [...draft.shapes, shape] }), id }
}

// A shape brought to the front of its layer (drawn last, on top of the others) or sent to the back.
export function moveShapeOrder(draft: MapDraft, id: string, to: 'front' | 'back'): Change {
  const shape = draft.shapes.find(s => s.id === id)
  if (!shape) return null
  const rest = draft.shapes.filter(s => s.id !== id)
  const mates = rest.filter(s => s.layerId === shape.layerId)
  if (mates.length === 0) return null
  const anchor = to === 'front' ? mates[mates.length - 1] : mates[0]
  const at = rest.indexOf(anchor) + (to === 'front' ? 1 : 0)
  const shapes = [...rest.slice(0, at), shape, ...rest.slice(at)]
  return shapes.every((s, i) => s === draft.shapes[i]) ? null : change(draft, { shapes })
}

// A shape replaced by an edited copy of itself, as a change of the map (one undo step).
export function replaceShape(draft: MapDraft, shape: MapShape): Change {
  const old = draft.shapes.find(s => s.id === shape.id)
  if (!old || old === shape) return null
  return change(draft, { shapes: draft.shapes.map(s => (s.id === shape.id ? shape : s)) })
}

// The draft with a shape replaced (no undo entry): for a drag that is shown as it goes.
export function withShape(draft: MapDraft, shape: MapShape): MapDraft {
  return { ...draft, shapes: draft.shapes.map(s => (s.id === shape.id ? shape : s)) }
}

export function editShape(
  draft: MapDraft, id: string,
  fields: Partial<Pick<MapShape, 'style' | 'color' | 'width' | 'fill' | 'opacity' | 'pattern' | 'biome' | 'heightMode' | 'height' | 'profile' | 'slope' | 'political'>>,
): Change {
  const old = draft.shapes.find(s => s.id === id)
  if (!old) return null
  const next: MapShape = { ...old }
  if (fields.style !== undefined) next.style = fields.style
  if (fields.pattern !== undefined) next.pattern = fields.pattern
  if (fields.color !== undefined) next.color = fields.color
  if (fields.fill !== undefined) next.fill = fields.fill
  if (fields.width !== undefined && Number.isFinite(fields.width)) next.width = clamp(fields.width, SHAPE_WIDTH_RANGE.min, SHAPE_WIDTH_RANGE.max)
  if (fields.opacity !== undefined && Number.isFinite(fields.opacity)) next.opacity = clamp(fields.opacity, 0, 1)
  if (old.type === 'biome') {
    if (fields.biome !== undefined) next.biome = fields.biome
    if (fields.heightMode !== undefined) next.heightMode = fields.heightMode as MapHeightMode
    if (fields.height !== undefined && Number.isFinite(fields.height)) next.height = clamp(Math.round(fields.height), -HEIGHT_LIMIT, HEIGHT_LIMIT)
    if (fields.profile !== undefined) next.profile = fields.profile
    if (fields.slope !== undefined && Number.isFinite(fields.slope)) next.slope = clamp(Math.round(fields.slope * 10) / 10, 0, MAP_MAX_SLOPE)
  }
  if (old.type === 'region' && fields.political !== undefined) next.political = fields.political
  const same = (Object.keys(next) as Array<keyof MapShape>).every(k => k === 'points' || next[k] === old[k])
  return same ? null : change(draft, { shapes: draft.shapes.map(s => (s.id === id ? next : s)) })
}

// The draft with one item somewhere else (held to the map): for a drag, which is shown as it goes and is one undo step when it ends.
export function movedItem(draft: MapDraft, ref: ItemRef, x: number, y: number): MapDraft {
  const [px, py] = held(draft, x, y)
  if (ref.kind === 'symbol') return { ...draft, symbols: draft.symbols.map(s => (s.id === ref.id ? { ...s, x: px, y: py } : s)) }
  return { ...draft, labels: draft.labels.map(l => (l.id === ref.id ? { ...l, x: px, y: py } : l)) }
}

export const MAX_PLACE_MAPS = 20
export const PLACE_NAME_MAX = 80

export function editSymbol(draft: MapDraft, id: string, fields: Partial<Pick<MapSymbol, 'kind' | 'size' | 'color' | 'name' | 'mapIds'>>): Change {
  const old = draft.symbols.find(s => s.id === id)
  if (!old) return null
  const next: MapSymbol = {
    ...old,
    ...(fields.kind !== undefined ? { kind: fields.kind } : {}),
    ...(fields.size !== undefined && Number.isFinite(fields.size) ? { size: clamp(fields.size, SYMBOL_SIZE_RANGE.min, SYMBOL_SIZE_RANGE.max) } : {}),
    ...(fields.color !== undefined ? { color: fields.color } : {}),
    ...(fields.name !== undefined ? { name: fields.name.trim().slice(0, PLACE_NAME_MAX) } : {}),
    ...(fields.mapIds !== undefined ? { mapIds: [...new Set(fields.mapIds)].slice(0, MAX_PLACE_MAPS) } : {}),
  }
  const sameMaps = next.mapIds.length === old.mapIds.length && next.mapIds.every((m, i) => m === old.mapIds[i])
  if (next.kind === old.kind && next.size === old.size && next.color === old.color && next.name === old.name && sameMaps) return null
  return change(draft, { symbols: draft.symbols.map(s => (s.id === id ? next : s)) })
}

// ---- places ----

// A symbol, region or biome shape with a name is a place: a scene can happen there, and the maps in `mapIds` open from it.
export const isPlace = (s: { name?: string; type?: MapShapeType }) => !!s.name && s.type !== 'line'
export const placeKey = (mapId: string, placeId: string) => `${mapId}/${placeId}`

export interface MapPlaceItem { ref: ItemRef; name: string; mapIds: string[] }

// The places of a map: its named symbols, then its named regions and biome shapes.
export function placesOf(draft: Pick<MapDraft, 'symbols' | 'shapes'>): MapPlaceItem[] {
  return [
    ...draft.symbols.filter(isPlace).map(s => ({ ref: { kind: 'symbol' as const, id: s.id }, name: s.name, mapIds: s.mapIds })),
    ...draft.shapes.filter(isPlace).map(s => ({ ref: { kind: 'shape' as const, id: s.id }, name: s.name ?? '', mapIds: s.mapIds ?? [] })),
  ]
}

// The place a symbol or shape is (its name and the maps that open from it), none for a label or a line.
export function placeOf(draft: MapDraft, ref: ItemRef): { name: string; mapIds: string[] } | null {
  if (ref.kind === 'symbol') {
    const s = draft.symbols.find(x => x.id === ref.id)
    return s ? { name: s.name, mapIds: s.mapIds } : null
  }
  if (ref.kind === 'shape') {
    const s = draft.shapes.find(x => x.id === ref.id)
    return s && s.type !== 'line' ? { name: s.name ?? '', mapIds: s.mapIds ?? [] } : null
  }
  return null
}

// Name a symbol or an area (making it a place, or no longer one when the name is cleared), or change the maps that open from it.
export function editPlace(draft: MapDraft, ref: ItemRef, fields: { name?: string; mapIds?: string[] }): Change {
  if (ref.kind === 'symbol') return editSymbol(draft, ref.id, fields)
  const old = ref.kind === 'shape' ? draft.shapes.find(s => s.id === ref.id) : undefined
  if (!old || old.type === 'line') return null
  const name = fields.name !== undefined ? fields.name.trim().slice(0, PLACE_NAME_MAX) : old.name ?? ''
  const mapIds = fields.mapIds !== undefined ? [...new Set(fields.mapIds)].slice(0, MAX_PLACE_MAPS) : old.mapIds ?? []
  const was = old.mapIds ?? []
  if (name === (old.name ?? '') && mapIds.length === was.length && mapIds.every((m, i) => m === was[i])) return null
  return change(draft, { shapes: draft.shapes.map(s => (s.id === old.id ? { ...s, name, mapIds } : s)) })
}

// New places for these names (symbols that are named), on the topmost shown, unlocked symbols layer, laid out in rows from the top left, three cells apart;
// they are meant to be dragged to where they belong. None when there is no layer to put them on or the map is full.
export function addPlaces(draft: MapDraft, names: string[], makeId: MakeId = randomId): { change: NonNullable<Change>; ids: string[] } | null {
  const layerId = activeLayerId(draft, 'symbols')
  if (!layerId || names.length === 0 || draft.symbols.length + names.length > MAX_SYMBOLS) return null
  const taken = new Set(draft.symbols.map(s => s.id))
  const perRow = Math.max(1, Math.floor((draft.width - 1) / 3))
  const symbols: MapSymbol[] = names.map((name, i) => {
    const id = freshId('sym', taken, makeId)
    taken.add(id)
    const [x, y] = held(draft, 1.5 + (i % perRow) * 3, 1.5 + Math.floor(i / perRow) * 3)
    return { id, layerId, kind: 'interest', x, y, size: 2, color: null, name: name.trim().slice(0, PLACE_NAME_MAX), mapIds: [] }
  })
  return { change: change(draft, { symbols: [...draft.symbols, ...symbols] }), ids: symbols.map(s => s.id) }
}

export function editLabel(draft: MapDraft, id: string, fields: Partial<Pick<MapLabel, 'text' | 'size'>>): Change {
  const old = draft.labels.find(l => l.id === id)
  if (!old) return null
  const text = fields.text !== undefined ? fields.text.trim().slice(0, LABEL_TEXT_MAX) : old.text
  const size = fields.size !== undefined && Number.isFinite(fields.size) ? clamp(fields.size, LABEL_SIZE_RANGE.min, LABEL_SIZE_RANGE.max) : old.size
  if ((text === '' && fields.text !== undefined) || (text === old.text && size === old.size)) return null
  return change(draft, { labels: draft.labels.map(l => (l.id === id ? { ...l, text, size } : l)) })
}

export function removeItem(draft: MapDraft, ref: ItemRef): Change {
  if (!findItem(draft, ref)) return null
  if (ref.kind === 'shape') return change(draft, { shapes: draft.shapes.filter(s => s.id !== ref.id) })
  return ref.kind === 'symbol'
    ? change(draft, { symbols: draft.symbols.filter(s => s.id !== ref.id) })
    : change(draft, { labels: draft.labels.filter(l => l.id !== ref.id) })
}

// The topmost item at a point (in cells): layers from the top down, each layer's later items first. A hidden or locked layer cannot be picked from.
// A small thing is given a little room, so it can be hit with the pointer. A biome shape is hit inside its outline (the land under the pointer).
export function hitItem(draft: MapDraft, x: number, y: number, slack = 0.3): ItemRef | null {
  for (let i = draft.layers.length - 1; i >= 0; i -= 1) {
    const layer = draft.layers[i]
    if (!layer.visible || layer.locked) continue
    if (layer.kind === 'terrain') {
      for (let n = draft.shapes.length - 1; n >= 0; n -= 1) {
        const sh = draft.shapes[n]
        if (sh.type === 'biome' && sh.layerId === layer.id && hitShape(sh, x, y, 0)) return { kind: 'shape', id: sh.id }
      }
    } else if (layer.kind === 'symbols') {
      for (let n = draft.symbols.length - 1; n >= 0; n -= 1) {
        const s = draft.symbols[n]
        if (s.layerId !== layer.id) continue
        const half = Math.max(s.size / 2, 0.4) + slack
        if (Math.abs(x - s.x) <= half && Math.abs(y - s.y) <= half) return { kind: 'symbol', id: s.id }
      }
    } else if (layer.kind === 'shapes') {
      for (let n = draft.shapes.length - 1; n >= 0; n -= 1) {
        const sh = draft.shapes[n]
        if (sh.type === 'biome' || sh.layerId !== layer.id) continue
        // A political area is only its border over the land: it is picked by its border, so the land inside it can still be picked.
        const hit = sh.political ? (nearestOnShape(sh, x, y)?.dist ?? Infinity) <= sh.width / 2 + slack : hitShape(sh, x, y, slack)
        if (hit) return { kind: 'shape', id: sh.id }
      }
    } else if (layer.kind === 'labels') {
      for (let n = draft.labels.length - 1; n >= 0; n -= 1) {
        const l = draft.labels[n]
        if (l.layerId !== layer.id) continue
        const { w, h } = labelExtent(l.text, l.size)
        if (Math.abs(x - l.x) <= w / 2 + slack && Math.abs(y - l.y) <= h / 2 + slack) return { kind: 'label', id: l.id }
      }
    }
  }
  return null
}

// ---- the legend ----

export type LegendEntry =
  | { type: 'terrain'; name: string; color: string }
  | { type: 'symbol'; kind: string; name: string }
  // The height scale: the darkest depth to the lightest height, in the map's height unit.
  | { type: 'heights'; name: string; low: number; high: number; unit: string }

// What the legend lists: the biomes the map is drawn with (its base and its biome shapes, in the biome list's order), then the kinds of symbol that are on
// it, in the library's order (a kind the library does not have goes last under its own name), then the height scale of a map shaded by height.
export function legendEntries(draft: Pick<MapDraft, 'base' | 'shapes' | 'symbols' | 'layers' | 'level' | 'units' | 'heightRange'>, biomes: BiomeIndex, nations = false): LegendEntry[] {
  const out: LegendEntry[] = []
  // The Nations view: the political areas that are shown, nations first, each in the colour it is filled with, then the symbols; no biomes, no heights.
  if (nations) {
    const shown = new Set(draft.layers.filter(l => l.kind === 'shapes' && l.visible).map(l => l.id))
    const rank = { nation: 0, state: 1, municipality: 2 } as const
    const areas = draft.shapes.filter(s => s.type === 'region' && s.political && shown.has(s.layerId))
      .map((s, n) => ({ s, n })).sort((a, b) => rank[a.s.political!] - rank[b.s.political!] || a.n - b.n)
    for (const { s } of areas) out.push({ type: 'terrain', name: s.name?.trim() || (s.political === 'nation' ? 'A nation' : s.political === 'state' ? 'A state or province' : 'A municipality'), color: nationFill(s) })
    out.push(...symbolEntries(draft))
    return out
  }
  const used = new Set(usedBiomeIds(draft))
  for (const b of biomes.values()) if (used.delete(b.id)) out.push({ type: 'terrain', name: b.name, color: b.color })
  for (const id of used) { const b = resolveBiome(biomes, id); out.push({ type: 'terrain', name: b.name, color: b.color }) }
  out.push(...symbolEntries(draft))
  const range = mapHeightRange(draft)
  if (range > 0) out.push({ type: 'heights', name: 'Height', low: -Math.round(range), high: Math.round(range), unit: heightUnit(draft.units) })
  return out
}

function symbolEntries(draft: Pick<MapDraft, 'symbols' | 'layers'>): LegendEntry[] {
  const out: LegendEntry[] = []
  const shown = new Set(draft.layers.filter(l => l.kind === 'symbols' && l.visible).map(l => l.id))
  const used = new Set(draft.symbols.filter(s => shown.has(s.layerId)).map(s => s.kind))
  for (const set of SYMBOL_SETS) for (const def of set.symbols) if (used.delete(def.id)) out.push({ type: 'symbol', kind: def.id, name: def.name })
  for (const kind of used) out.push({ type: 'symbol', kind, name: symbolName(kind) })
  return out
}

// ---- the scale bar ----

// A length for the scale bar: a round number of units (1, 2 or 5 times a power of ten) that is about `targetPx` pixels long at this zoom.
export function niceScale(cellSize: number, zoom: number, targetPx = 110): { units: number; px: number } | null {
  if (!(cellSize > 0) || !(zoom > 0)) return null
  const raw = (targetPx / zoom) * cellSize
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const units = [10, 5, 2, 1].map(m => m * magnitude).find(u => u <= raw) ?? magnitude
  return { units: Number(units.toPrecision(6)), px: (units / cellSize) * zoom }
}
