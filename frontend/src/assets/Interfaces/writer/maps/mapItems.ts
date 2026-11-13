import { MAP_MAX_ROUGH, MAP_MAX_SLOPE, type MapEllipse, type MapHeightMode, type MapLabel, type MapLibraryShape, type MapShape, type MapShapePoint, type MapShapeType, type MapUnits } from '../../../../api/types'
import { MAX_POINTS, MIN_POINTS, SHAPE_WIDTH_RANGE, hitShape, makeBiomeShape, makeShape, nearestOnShape, shapeBounds, type Pen, type Rect as ShapeRect } from './mapShapes'
import { mapHeightRange } from './mapHeights'
import { heightUnit } from './mapUnits'
import { biomeLayer, change, type Change, type MakeId, type MapDraft } from './mapModel'
import { resolveBiome, usedBiomeIds, type BiomeIndex } from './mapBiomes'
import { nationFill } from './mapDrawShapes'
import { newSeed } from './mapOutline'
import { shapeFromLibrary } from './mapLibrary'
import { markerName, starterShapes } from './mapShapeSeed'
import { catchBodies, followOrbit, letGo, makeOrbit, settleBody, withEllipse } from './mapOrbits'
import { levelDef } from './mapLevels'

// The things on a map: biome shapes (the land, on the biomes layer), labels (text) and shapes (lines, regions and markers, mapShapes.ts), each on a layer
// of its kind (markers, the castles and trees and doors placed from the Markers library, on a markers layer above the regions). All pure: placing, moving,
// editing and removing return a new draft (and the undo entry), and the hit test, the legend and the scale bar are computed from a draft. Positions are in
// cells, so they stay where they are when the view zooms.

export const MAX_LABELS = 1000
export const LABEL_SIZE_RANGE = { min: 0.25, max: 16 } as const
export const LABEL_TEXT_MAX = 120
export const MAX_SHAPES = 2000
export const MAX_BIOME_SHAPES = 2000
export const MAX_MARKERS = 5000
export const MARKER_SIZE_RANGE = { min: 0.25, max: 16 } as const
export const HEIGHT_LIMIT = 100000

// A marker: a region drawn with a halo (it reads over any land), from the Markers library or drawn so.
export const isMarker = (s: Pick<MapShape, 'type' | 'style'>) => s.type === 'region' && s.style === 'halo'

export type ItemKind = 'label' | 'shape'
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

export function itemBounds(item: MapLabel | MapShape, kind: ItemKind): Rect {
  if (kind === 'shape') return shapeBounds(item as MapShape)
  const at = item as MapLabel
  const { w, h } = labelExtent(at.text, at.size)
  return { x0: at.x - w / 2, y0: at.y - h / 2, x1: at.x + w / 2, y1: at.y + h / 2 }
}

export function findItem(draft: MapDraft, ref: ItemRef): MapLabel | MapShape | undefined {
  if (ref.kind === 'shape') return draft.shapes.find(s => s.id === ref.id)
  return draft.labels.find(l => l.id === ref.id)
}

// The layer new things of a kind go on: the topmost of that kind that is shown and not locked (none when there is not one). `symbols` is a markers layer.
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

// The ids a new shape must not take: ids name places.
const placeIds = (draft: Pick<MapDraft, 'shapes'>) => new Set(draft.shapes.map(s => s.id))

// The layer a shape of a type goes on: the biomes layer for a biome shape; for a marker the topmost markers layer (else a shapes layer); for a line or a
// region the topmost shapes layer (a markers layer only on a map that has no shapes layer). None when the right layer is hidden or locked.
export function layerFor(draft: Pick<MapDraft, 'layers'>, shape: Pick<MapShape, 'type' | 'style'>): string | null {
  if (shape.type === 'biome') return biomeLayer(draft)?.id ?? null
  const has = (kind: 'symbols' | 'shapes') => draft.layers.some(l => l.kind === kind)
  if (isMarker(shape)) return has('symbols') ? activeLayerId(draft, 'symbols') : activeLayerId(draft, 'shapes')
  return has('shapes') ? activeLayerId(draft, 'shapes') : activeLayerId(draft, 'symbols')
}

// Whether a map holds as many shapes of this kind as it can.
function full(draft: Pick<MapDraft, 'shapes'>, shape: Pick<MapShape, 'type' | 'style'>): boolean {
  if (shape.type === 'biome') return draft.shapes.filter(s => s.type === 'biome').length >= MAX_BIOME_SHAPES
  if (isMarker(shape)) return draft.shapes.filter(isMarker).length >= MAX_MARKERS
  return draft.shapes.filter(s => s.type !== 'biome' && !isMarker(s)).length >= MAX_SHAPES
}

// A library shape placed in a box (in cells) on the layer it belongs on. None when that layer is hidden or locked, or the map is full.
export function addLibraryShape(draft: MapDraft, lib: MapLibraryShape, box: ShapeRect, units: MapUnits, makeId: MakeId = randomId): { change: NonNullable<Change>; id: string } | null {
  const layerId = layerFor(draft, lib)
  if (!layerId || full(draft, lib)) return null
  const id = freshId(lib.type === 'biome' ? 'bio' : isMarker(lib) ? 'mrk' : 'shp', placeIds(draft), makeId)
  const shape = settled(draft, heldShape(draft, shapeFromLibrary(lib, box, id, layerId, units)))
  return { change: change(draft, { shapes: [...draft.shapes, shape] }), id }
}

// A shape held to the map: its points and other rings inside it.
function heldShape(draft: Pick<MapDraft, 'width' | 'height'>, shape: MapShape): MapShape {
  const at = (p: MapShapePoint) => ({ ...p, x: clamp(p.x, 0, draft.width), y: clamp(p.y, 0, draft.height) })
  return { ...shape, points: shape.points.map(at), ...(shape.holes ? { holes: shape.holes.map(r => r.map(at)) } : {}) }
}

// A template made into a biome area (in a biome, with what new areas do to the height) or a region (with the region pen).
export function addTemplateShape(
  draft: MapDraft, type: 'biome' | 'region', points: MapShapePoint[], opts: { biome?: string | null; look?: AreaLook; pen?: Pen }, makeId: MakeId = randomId,
): { change: NonNullable<Change>; id: string } | null {
  if (points.length < 3 || points.length > MAX_POINTS) return null
  const held_ = points.map(p => ({ ...p, x: clamp(p.x, 0, draft.width), y: clamp(p.y, 0, draft.height) }))
  if (type === 'biome') {
    const r = addBiomeShape(draft, held_.map(p => [p.x, p.y] as [number, number]), opts.biome ?? null, false, makeId, opts.look ?? {})
    if (!r) return null
    return { change: change(draft, { shapes: r.change.draft.shapes.map(s => (s.id === r.id ? settled(draft, { ...s, points: held_ }) : s)) }), id: r.id }
  }
  const r = addShape(draft, 'region', held_.map(p => [p.x, p.y] as [number, number]), opts.pen ?? { style: 'solid', color: null, width: 0.15, smooth: false, fill: null, opacity: 0.35, pattern: 'solid' }, makeId)
  if (!r) return null
  return { change: change(draft, { shapes: r.change.draft.shapes.map(s => (s.id === r.id ? settled(draft, { ...s, points: held_ }) : s)) }), id: r.id }
}

// ---- orbits (space maps) ----

// Whether a map is of space (its bodies can go round on orbits).
export const isSpace = (draft: Pick<MapDraft, 'level'>) => levelDef(draft.level).drawn === 'space'

// A shape that was placed or moved, settled: on a space map a body keeps to its orbit or is caught by one it was dropped near (mapOrbits.ts).
export function settled(draft: Pick<MapDraft, 'level' | 'shapes' | 'width' | 'height'>, shape: MapShape): MapShape {
  return isSpace(draft) ? settleBody(draft.shapes, shape, draft.width, draft.height) : shape
}

// A new orbit round a centre (a star, most often), on the regions layer; the bodies lying on its path are caught by it.
export function addOrbit(draft: MapDraft, cx: number, cy: number, radius: number, makeId: MakeId = randomId): { change: NonNullable<Change>; id: string } | null {
  const layerId = layerFor(draft, { type: 'orbit', style: 'dashed' })
  if (!layerId || full(draft, { type: 'orbit', style: 'dashed' })) return null
  const [x, y] = held(draft, cx, cy)
  const orbit = makeOrbit(freshId('orb', placeIds(draft), makeId), layerId, x, y, radius)
  return { change: change(draft, { shapes: catchBodies([...draft.shapes, orbit], orbit, draft.width, draft.height) }), id: orbit.id }
}

// An orbit made wider, taller or turned (or moved): its bodies go with it, each at its own angle.
export function editOrbit(draft: MapDraft, id: string, patch: Partial<MapEllipse>): Change {
  const old = draft.shapes.find(s => s.id === id)
  if (!old || old.type !== 'orbit') return null
  const next = withEllipse(old, patch, draft.width, draft.height)
  if (JSON.stringify(next.ellipse) === JSON.stringify(old.ellipse)) return null
  return change(draft, { shapes: followOrbit(draft.shapes.map(s => (s.id === id ? next : s)), next, draft.width, draft.height) })
}

// A body taken off its orbit, where it is.
export function leaveOrbit(draft: MapDraft, id: string): Change {
  const old = draft.shapes.find(s => s.id === id)
  if (!old?.orbit) return null
  return change(draft, { shapes: draft.shapes.map(s => (s.id === id ? { ...s, orbit: null } : s)) })
}

// The bodies on an orbit, in their order.
export const bodiesOn = (draft: Pick<MapDraft, 'shapes'>, orbitId: string) => draft.shapes.filter(s => s.orbit?.id === orbitId)

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
  const layerId = layerFor(draft, { type, style: pen.style })
  if (!layerId || full(draft, { type, style: pen.style }) || points.length < MIN_POINTS[type] || points.length > MAX_POINTS) return null
  const held_ = points.map(([x, y]) => held(draft, x, y))
  const id = freshId('shp', placeIds(draft), makeId)
  return { change: change(draft, { shapes: [...draft.shapes, makeShape(id, layerId, type, held_, pen)] }), id }
}

// What a new biome area does to the height (the defaults of the Biomes panel): keeps it, or sets, raises or lowers it, spread by a profile; and how rough
// its edge is.
export type AreaLook = Partial<Pick<MapShape, 'heightMode' | 'height' | 'profile' | 'slope' | 'rough'>>

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
  if (look.rough && look.rough > 0) { shape.rough = clamp(Math.round(look.rough), 0, MAP_MAX_ROUGH); shape.seed = newSeed() }
  return { change: change(draft, { shapes: [...draft.shapes, shape] }), id }
}

// What combining gave (mapCombine.ts): each shape replaces the one of its id, new pieces go right after the first, and the shapes taken in go. One undo step.
export function combineShapes(draft: MapDraft, shapes: MapShape[], removed: string[]): Change {
  if (shapes.length === 0) return null
  const byId = new Map(shapes.map(s => [s.id, s]))
  const there = new Set(draft.shapes.map(s => s.id))
  const fresh = shapes.filter(s => !there.has(s.id))
  const gone = new Set(removed)
  const out: MapShape[] = []
  for (const s of draft.shapes) {
    if (gone.has(s.id)) continue
    out.push(byId.get(s.id) ?? s)
    if (s.id === shapes[0].id) out.push(...fresh)
  }
  return change(draft, { shapes: out })
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
  return change(draft, { shapes: withShape(draft, shape).shapes })
}

// The draft with a shape replaced (no undo entry): for a drag that is shown as it goes.
// An orbit takes its bodies with it.
export function withShape(draft: MapDraft, shape: MapShape): MapDraft {
  const shapes = draft.shapes.map(s => (s.id === shape.id ? shape : s))
  return { ...draft, shapes: shape.type === 'orbit' ? followOrbit(shapes, shape, draft.width, draft.height) : shapes }
}

export function editShape(
  draft: MapDraft, id: string,
  fields: Partial<Pick<MapShape, 'style' | 'color' | 'width' | 'fill' | 'opacity' | 'pattern' | 'biome' | 'heightMode' | 'height' | 'profile' | 'slope' | 'political' | 'rough'>>,
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
  if (fields.rough !== undefined && Number.isFinite(fields.rough)) {
    next.rough = clamp(Math.round(fields.rough), 0, MAP_MAX_ROUGH)
    if (next.rough > 0 && !old.seed) next.seed = newSeed()
  }
  const same = (Object.keys(next) as Array<keyof MapShape>).every(k => k === 'points' || k === 'holes' || next[k] === old[k])
  return same ? null : change(draft, { shapes: draft.shapes.map(s => (s.id === id ? next : s)) })
}

// The draft with a label somewhere else (held to the map): for a drag, which is shown as it goes and is one undo step when it ends.
export function movedItem(draft: MapDraft, ref: ItemRef, x: number, y: number): MapDraft {
  const [px, py] = held(draft, x, y)
  return { ...draft, labels: draft.labels.map(l => (l.id === ref.id ? { ...l, x: px, y: py } : l)) }
}

export const MAX_PLACE_MAPS = 20
export const PLACE_NAME_MAX = 80

// A shape (a marker, most often) made a given width in cells, about its middle, keeping its proportions.
export function resizeShape(draft: MapDraft, id: string, width: number): Change {
  const old = draft.shapes.find(s => s.id === id)
  if (!old || !Number.isFinite(width)) return null
  const b = shapeBounds({ type: old.type, points: [...old.points, ...(old.holes ?? []).flat()], width: 0 })
  const w0 = Math.max(b.x1 - b.x0, b.y1 - b.y0)
  if (!(w0 > 0)) return null
  const k = clamp(width, MARKER_SIZE_RANGE.min, MARKER_SIZE_RANGE.max) / w0
  if (Math.abs(k - 1) < 1e-9) return null
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
  const r3 = (n: number) => Math.round(n * 1000) / 1000
  const at = (p: MapShapePoint): MapShapePoint => ({
    ...p, x: r3(clamp(cx + (p.x - cx) * k, 0, draft.width)), y: r3(clamp(cy + (p.y - cy) * k, 0, draft.height)),
    hx: p.hx === null ? null : r3(p.hx * k), hy: p.hy === null ? null : r3(p.hy * k),
  })
  const next: MapShape = { ...old, points: old.points.map(at), ...(old.holes ? { holes: old.holes.map(r => r.map(at)) } : {}) }
  return change(draft, { shapes: draft.shapes.map(s => (s.id === id ? next : s)) })
}

// How wide a shape is, in cells (the larger of its width and height).
export function shapeWidth(shape: MapShape): number {
  const b = shapeBounds({ type: shape.type, points: [...shape.points, ...(shape.holes ?? []).flat()], width: 0 })
  return Math.round(Math.max(b.x1 - b.x0, b.y1 - b.y0) * 100) / 100
}

// How wide on screen (pixels) a marker must be before its points show and can be dragged: its points lie close together, so at a smaller size a drag
// moves the whole marker instead of catching a point. Zoom in to reshape one.
export const MARKER_POINTS_PX = 160
export const showsPoints = (shape: MapShape, zoom: number) => !isMarker(shape) || shapeWidth(shape) * zoom >= MARKER_POINTS_PX

// ---- places ----

// A region, marker or biome shape with a name is a place: a scene can happen there, and the maps in `mapIds` open from it.
export const isPlace = (s: { name?: string; type?: MapShapeType }) => !!s.name && s.type !== 'line'
export const placeKey = (mapId: string, placeId: string) => `${mapId}/${placeId}`

export interface MapPlaceItem { ref: ItemRef; name: string; mapIds: string[] }

// The places of a map: its named regions, markers and biome shapes.
export function placesOf(draft: Pick<MapDraft, 'shapes'>): MapPlaceItem[] {
  return draft.shapes.filter(isPlace).map(s => ({ ref: { kind: 'shape' as const, id: s.id }, name: s.name ?? '', mapIds: s.mapIds ?? [] }))
}

// The place a shape is (its name and the maps that open from it), none for a label or a line.
export function placeOf(draft: MapDraft, ref: ItemRef): { name: string; mapIds: string[] } | null {
  if (ref.kind === 'shape') {
    const s = draft.shapes.find(x => x.id === ref.id)
    return s && s.type !== 'line' ? { name: s.name ?? '', mapIds: s.mapIds ?? [] } : null
  }
  return null
}

// Name an area or a marker (making it a place, or no longer one when the name is cleared), or change the maps that open from it.
export function editPlace(draft: MapDraft, ref: ItemRef, fields: { name?: string; mapIds?: string[] }): Change {
  const old = ref.kind === 'shape' ? draft.shapes.find(s => s.id === ref.id) : undefined
  if (!old || old.type === 'line') return null
  const name = fields.name !== undefined ? fields.name.trim().slice(0, PLACE_NAME_MAX) : old.name ?? ''
  const mapIds = fields.mapIds !== undefined ? [...new Set(fields.mapIds)].slice(0, MAX_PLACE_MAPS) : old.mapIds ?? []
  const was = old.mapIds ?? []
  if (name === (old.name ?? '') && mapIds.length === was.length && mapIds.every((m, i) => m === was[i])) return null
  return change(draft, { shapes: draft.shapes.map(s => (s.id === old.id ? { ...s, name, mapIds } : s)) })
}

// The marker a new place is made with (a star: a point of interest).
let placeMarker: MapLibraryShape | null = null
const pointOfInterest = () => (placeMarker ??= starterShapes().find(s => s.id === 'marker:interest')!)

// New places for these names (named markers), on the topmost shown, unlocked markers layer, laid out in rows from the top left, three cells apart; they are
// meant to be dragged to where they belong. None when there is no layer to put them on or the map is full.
export function addPlaces(draft: MapDraft, names: string[], makeId: MakeId = randomId): { change: NonNullable<Change>; ids: string[] } | null {
  const lib = pointOfInterest()
  const layerId = layerFor(draft, lib)
  if (!layerId || names.length === 0 || draft.shapes.filter(isMarker).length + names.length > MAX_MARKERS) return null
  const taken = placeIds(draft)
  const perRow = Math.max(1, Math.floor((draft.width - 1) / 3))
  const made: MapShape[] = names.map((name, i) => {
    const id = freshId('mrk', taken, makeId)
    taken.add(id)
    const [x, y] = held(draft, 1.5 + (i % perRow) * 3, 1.5 + Math.floor(i / perRow) * 3)
    return { ...heldShape(draft, shapeFromLibrary(lib, { x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 }, id, layerId, draft.units)), name: name.trim().slice(0, PLACE_NAME_MAX), mapIds: [] }
  })
  return { change: change(draft, { shapes: [...draft.shapes, ...made] }), ids: made.map(s => s.id) }
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
  // An orbit's bodies stay where they are.
  if (ref.kind === 'shape') return change(draft, { shapes: letGo(draft.shapes.filter(s => s.id !== ref.id), ref.id) })
  return change(draft, { labels: draft.labels.filter(l => l.id !== ref.id) })
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
    } else if (layer.kind === 'shapes' || layer.kind === 'symbols') {
      for (let n = draft.shapes.length - 1; n >= 0; n -= 1) {
        const sh = draft.shapes[n]
        if (sh.type === 'biome' || sh.layerId !== layer.id) continue
        // A political area is only its border over the land: it is picked by its border, so the land inside it can still be picked.
        // A marker is given a little more room, so a small one can be hit.
        const hit = sh.political ? (nearestOnShape(sh, x, y)?.dist ?? Infinity) <= sh.width / 2 + slack : hitShape(sh, x, y, isMarker(sh) ? slack + 0.15 : slack)
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
  // A kind of marker on the map, with one of them to draw in the legend.
  | { type: 'marker'; kind: string; name: string; shape: MapShape }
  // The height scale: the darkest depth to the lightest height, in the map's height unit.
  | { type: 'heights'; name: string; low: number; high: number; unit: string }

// What the legend lists: the biomes the map is drawn with (its base and its biome shapes, in the biome list's order), then the kinds of marker that are on
// it (in the order they were first placed), then the height scale of a map shaded by height.
export function legendEntries(draft: Pick<MapDraft, 'base' | 'shapes' | 'layers' | 'level' | 'units' | 'heightRange'>, biomes: BiomeIndex, nations = false): LegendEntry[] {
  const out: LegendEntry[] = []
  // The Nations view: the political areas that are shown, nations first, each in the colour it is filled with, then the markers; no biomes, no heights.
  if (nations) {
    const shown = new Set(draft.layers.filter(l => l.kind === 'shapes' && l.visible).map(l => l.id))
    const rank = { nation: 0, state: 1, municipality: 2 } as const
    const areas = draft.shapes.filter(s => s.type === 'region' && s.political && shown.has(s.layerId))
      .map((s, n) => ({ s, n })).sort((a, b) => rank[a.s.political!] - rank[b.s.political!] || a.n - b.n)
    for (const { s } of areas) out.push({ type: 'terrain', name: s.name?.trim() || (s.political === 'nation' ? 'A nation' : s.political === 'state' ? 'A state or province' : 'A municipality'), color: nationFill(s) })
    out.push(...markerEntries(draft))
    return out
  }
  const used = new Set(usedBiomeIds(draft))
  for (const b of biomes.values()) if (used.delete(b.id)) out.push({ type: 'terrain', name: b.name, color: b.color })
  for (const id of used) { const b = resolveBiome(biomes, id); out.push({ type: 'terrain', name: b.name, color: b.color }) }
  out.push(...markerEntries(draft))
  const range = mapHeightRange(draft)
  if (range > 0) out.push({ type: 'heights', name: 'Height', low: -Math.round(range), high: Math.round(range), unit: heightUnit(draft.units) })
  return out
}

function markerEntries(draft: Pick<MapDraft, 'shapes' | 'layers'>): LegendEntry[] {
  const out: LegendEntry[] = []
  const shown = new Set(draft.layers.filter(l => (l.kind === 'symbols' || l.kind === 'shapes') && l.visible).map(l => l.id))
  const seen = new Set<string>()
  for (const s of draft.shapes) {
    if (!isMarker(s) || !shown.has(s.layerId)) continue
    const kind = s.kind ?? 'marker'
    if (seen.has(kind)) continue
    seen.add(kind)
    out.push({ type: 'marker', kind, name: s.kind ? markerName(s.kind) : 'Marker', shape: s })
  }
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
