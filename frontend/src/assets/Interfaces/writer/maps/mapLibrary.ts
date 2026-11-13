import type { MapLevel, MapLibraryShape, MapShape, MapShapeCategory, MapShapePoint, MapUnits } from '../../../../api/types'
import { FEET_PER_METRE } from './mapLevels'
import { newSeed } from './mapOutline'
import type { Rect } from './mapShapes'

// Shapes of a library (the admin's default shapes and a writer's own, "My shapes"): a shape kept in a box of 1 by 1, with the size it was (`w` by `h`
// cells) and what it is drawn with. Placing one scales it into a box on the map (keeping its proportions unless asked not to); saving one takes a shape of
// a map into a box of 1 by 1. Heights are kept in metres and turned into feet on an imperial map.

export const CATEGORIES: Array<{ id: MapShapeCategory; name: string }> = [
  { id: 'land', name: 'Land forms' }, { id: 'space', name: 'Space objects' }, { id: 'building', name: 'Building parts' }, { id: 'marker', name: 'Markers' },
]
export const categoryName = (id: MapShapeCategory) => CATEGORIES.find(c => c.id === id)?.name ?? id

// Whether a library shape is offered on a level (none named = every level).
export const offeredAt = (lib: Pick<MapLibraryShape, 'levels'>, level: MapLevel) => lib.levels.length === 0 || lib.levels.includes(level)

// The box a library shape takes in a dragged box: all of it, or (keeping its proportions) the largest box of its shape centred in it.
export function fitInBox(lib: Pick<MapLibraryShape, 'w' | 'h'>, box: Rect, keepAspect = true): Rect {
  if (!keepAspect) return box
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0
  const aspect = lib.w > 0 && lib.h > 0 ? lib.w / lib.h : 1
  let w = bw, h = bw / aspect
  if (h > bh) { h = bh; w = bh * aspect }
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 }
}

// The box a library shape takes at its own size, centred on a point.
export const ownBox = (lib: Pick<MapLibraryShape, 'w' | 'h'>, x: number, y: number): Rect => ({ x0: x - lib.w / 2, y0: y - lib.h / 2, x1: x + lib.w / 2, y1: y + lib.h / 2 })

const r3 = (n: number) => Math.round(n * 1000) / 1000
const scalePoint = (p: MapShapePoint, box: Rect): MapShapePoint => {
  const w = box.x1 - box.x0, h = box.y1 - box.y0
  return { x: r3(box.x0 + p.x * w), y: r3(box.y0 + p.y * h), smooth: p.smooth, hx: p.hx === null ? null : r3(p.hx * w), hy: p.hy === null ? null : r3(p.hy * h) }
}

// A library shape placed in a box on a map (its own id and layer). A rough one gets a seed of its own, so two of them are not alike.
export function shapeFromLibrary(lib: MapLibraryShape, box: Rect, id: string, layerId: string, units: MapUnits): MapShape {
  const feet = units === 'imperial' ? FEET_PER_METRE : 1
  const shape: MapShape = {
    id, layerId, type: lib.type, points: lib.points.map(p => scalePoint(p, box)),
    style: lib.style, color: lib.color, width: lib.width, fill: lib.fill, opacity: lib.opacity, pattern: lib.pattern, kind: lib.id,
  }
  if (lib.type !== 'line' && lib.holes.length > 0) shape.holes = lib.holes.map(ring => ring.map(p => scalePoint(p, box)))
  if (lib.type === 'biome') {
    Object.assign(shape, { biome: lib.biome, heightMode: lib.heightMode, height: Math.round(lib.height * feet), profile: lib.profile, slope: lib.slope, name: '', mapIds: [] })
  } else if (lib.type === 'region') Object.assign(shape, { name: '', mapIds: [] })
  if (lib.rough > 0) { shape.rough = lib.rough; shape.seed = newSeed() }
  return shape
}

// A shape of a map kept as a library shape: its points (and other rings) in a box of 1 by 1, the size it was, and what it is drawn with (its height in
// metres). Not its name, places or political role: those belong to the map.
export function libraryFromShape(shape: MapShape, fields: { id: string; name: string; category: MapShapeCategory; levels: MapLevel[]; units: MapUnits }): MapLibraryShape {
  const rings = [shape.points, ...(shape.type === 'line' ? [] : shape.holes ?? [])]
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const ring of rings) for (const p of ring) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  const w = Math.max(0.01, x1 - x0), h = Math.max(0.01, y1 - y0)
  const unit = (p: MapShapePoint): MapShapePoint => ({
    x: r3((p.x - x0) / w), y: r3((p.y - y0) / h), smooth: p.smooth, hx: p.hx === null ? null : r3(p.hx / w), hy: p.hy === null ? null : r3(p.hy / h),
  })
  const metres = fields.units === 'imperial' ? 1 / FEET_PER_METRE : 1
  return {
    id: fields.id, name: fields.name.trim().slice(0, 60) || 'Shape', category: fields.category, levels: fields.levels, type: shape.type,
    w: r3(w), h: r3(h), points: shape.points.map(unit), holes: shape.type === 'line' ? [] : (shape.holes ?? []).map(ring => ring.map(unit)),
    style: shape.style, color: shape.color, width: shape.width, fill: shape.fill, opacity: shape.opacity, pattern: shape.pattern,
    biome: shape.type === 'biome' ? shape.biome ?? null : null,
    heightMode: shape.type === 'biome' ? shape.heightMode ?? 'none' : 'none',
    height: shape.type === 'biome' ? Math.round((shape.height ?? 0) * metres) : 0,
    profile: shape.profile ?? 'plateau', slope: shape.slope ?? 0, rough: shape.rough ?? 0,
  }
}

// The name of a marker from its library id ("marker:castle" is a Castle) when the library does not say.
export function kindName(kind: string): string {
  const part = kind.includes(':') ? kind.slice(kind.indexOf(':') + 1) : kind
  const words = part.replace(/[_-]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Marker'
}
