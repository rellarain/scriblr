import type { ModelBlend, ModelContent, ModelGradDir } from '../../../../../api/types'
import { mix } from '../../../writer/characters/portrait/colour'
import { paintLayer, type Colouring, type PaintLayer } from './colour'
import type { Solved } from './rig'
import { coveringObjects } from './wear'

// Painting a solved model (phase 4b): what each shape is drawn with, and the SVG definitions (gradients, clip paths, masks) that the effects need. Pure: the
// canvas, the preview tiles and the pictures of forms all draw from the same items, so they cannot disagree. The solver gives each shape's outline as path text in
// canvas space, so a clip, a cut-out or a shading shape's base shapes are read straight from it.

export interface PaintItem {
  id: string
  d: string
  fill: string
  opacity: number
  // `reach` (percent of the way across the shape the second colour is reached at; 100 unless an authored field says otherwise) and `angle` (degrees a linear gradient is turned) are
  // there only when they are not at rest
  gradient: { dir: ModelGradDir; end: string; reach?: number; angle?: number } | null
  blend: ModelBlend | null
  // the outline the shape is kept inside, the outlines of the base shapes a shading shape is kept inside, and the outlines that cut a hole in it
  clipD: string | null
  compDs: string[]
  cutDs: string[]
  helper: boolean
  shading: boolean
  // what the object it belongs to is worn under (phase 6b): the outlines of the garments over it that are shown, which it is trimmed to; `key` is the object, so its shapes share one
  // clip. Null when the object is worn under nothing or none of it is shown.
  wear: { key: string; ds: string[] } | null
  // something it must be kept inside is not there (a clip to a shape a form hides, a shading shape with no base shape to lie on): nothing is drawn
  blank: boolean
}

// The items for these shapes (default: the visible ones, in draw order). A shape with no outline is left out.
export function paintShapes(c: ModelContent, solved: Solved, colouring: Colouring, ids: readonly string[] = solved.order): PaintItem[] {
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const layers = new Map<string, PaintLayer>()
  const layerOf = (id: string): PaintLayer | undefined => {
    const hit = layers.get(id)
    if (hit) return hit
    const s = shapes.get(id)
    if (!s) return undefined
    const made = paintLayer(c, colouring, s)
    layers.set(id, made)
    return made
  }
  const outline = (id: string | null): string => (id ? solved.shapes[id]?.d ?? '' : '')
  // the garments a shape's object is worn under (only worked out when some object is worn under anything)
  const anyWear = c.objects.some(o => (o.under ?? []).length > 0)
  const ownerOf = new Map<string, string>()
  if (anyWear) for (const o of c.objects) for (const sid of o.shapes) if (!ownerOf.has(sid)) ownerOf.set(sid, o.id)
  const objects = new Map(c.objects.map(o => [o.id, o]))
  const wears = new Map<string, { key: string; ds: string[] } | null>()
  const wearOf = (shapeId: string): { key: string; ds: string[] } | null => {
    const oid = ownerOf.get(shapeId), o = oid ? objects.get(oid) : undefined
    if (!o) return null
    if (wears.has(o.id)) return wears.get(o.id)!
    const ds: string[] = []
    for (const t of coveringObjects(c, o)) {
      for (const sid of t.shapes) {
        const r = solved.shapes[sid], b = layerOf(sid)
        if (r?.visible && r.d && b && !b.helper && !b.shading) ds.push(r.d)
      }
    }
    const made = ds.length > 0 ? { key: o.id, ds } : null
    wears.set(o.id, made)
    return made
  }
  const items: PaintItem[] = []
  for (const id of ids) {
    const r = solved.shapes[id], layer = layerOf(id)
    if (!r?.d || !layer) continue
    const clipD = layer.clip ? outline(layer.clip) : ''
    let compDs: string[] = []
    if (layer.shading) {
      const home = c.objects.find(o => o.shapes.includes(id))
      compDs = (home?.shapes ?? []).filter(sid => {
        const b = layerOf(sid)
        return sid !== id && !!b && !b.shading && !b.helper && !!solved.shapes[sid]?.visible && !!solved.shapes[sid]?.d
      }).map(sid => solved.shapes[sid].d)
    }
    const cutDs = layer.cuts.map(outline).filter(Boolean)
    items.push({
      id, d: r.d, fill: layer.fill, opacity: layer.opacity * (r.fade ?? 1), gradient: layer.gradient, blend: layer.blend, clipD: clipD || null, compDs, cutDs, helper: layer.helper, shading: layer.shading, wear: anyWear && !layer.helper ? wearOf(id) : null,
      blank: (!!layer.clip && !clipD) || (layer.shading && compDs.length === 0),
    })
  }
  return items
}

// What a preview or a picture of a form draws: no helpers, and nothing that has nothing to be kept inside.
export const drawable = (items: PaintItem[]): PaintItem[] => items.filter(i => !i.helper && !i.blank)

// ---- the definitions an item needs, and the attributes that use them ----

// Each definition has an id of the form prefix-kind-shape. Ids of inline SVG are global to the whole page, so the prefix is the drawing's own (see PaintedPath).
export type PaintDef =
  | { kind: 'gradient'; id: string; dir: ModelGradDir; from: string; to: string; reach?: number; angle?: number }
  | { kind: 'clip'; id: string; ds: string[] }
  | { kind: 'mask'; id: string; ds: string[] }

const gradId = (prefix: string, id: string) => `${prefix}-g-${id}`
const clipId = (prefix: string, id: string) => `${prefix}-k-${id}`
const compId = (prefix: string, id: string) => `${prefix}-c-${id}`
const maskId = (prefix: string, id: string) => `${prefix}-m-${id}`
const wearId = (prefix: string, key: string) => `${prefix}-w-${key}`

export function paintDefs(items: PaintItem[], prefix: string): PaintDef[] {
  const defs: PaintDef[] = []
  const worn = new Set<string>()
  for (const i of items) {
    if (i.blank) continue
    if (i.wear && !worn.has(i.wear.key)) { worn.add(i.wear.key); defs.push({ kind: 'clip', id: wearId(prefix, i.wear.key), ds: i.wear.ds }) }
    if (i.gradient) defs.push({ kind: 'gradient', id: gradId(prefix, i.id), dir: i.gradient.dir, from: i.fill, to: i.gradient.end, ...(i.gradient.reach !== undefined ? { reach: i.gradient.reach } : {}), ...(i.gradient.angle !== undefined ? { angle: i.gradient.angle } : {}) })
    if (i.clipD) defs.push({ kind: 'clip', id: clipId(prefix, i.id), ds: [i.clipD] })
    if (i.compDs.length) defs.push({ kind: 'clip', id: compId(prefix, i.id), ds: i.compDs })
    if (i.cutDs.length) defs.push({ kind: 'mask', id: maskId(prefix, i.id), ds: i.cutDs })
  }
  return defs
}

export interface PaintAttrs {
  // what `fill` takes: the colour, or the gradient
  fill: string
  clip?: string
  // the group around the path that keeps a shading shape inside the base shapes of its object
  comp?: string
  // the group around all of that, for a garment worn under others: it is drawn only inside their outlines
  wear?: string
  mask?: string
  blend?: string
}

const url = (id: string) => `url(#${id})`

export function paintAttrs(item: PaintItem, prefix: string): PaintAttrs {
  return {
    fill: item.gradient ? url(gradId(prefix, item.id)) : item.fill,
    clip: item.clipD ? url(clipId(prefix, item.id)) : undefined,
    comp: item.compDs.length ? url(compId(prefix, item.id)) : undefined,
    wear: item.wear ? url(wearId(prefix, item.wear.key)) : undefined,
    mask: item.cutDs.length ? url(maskId(prefix, item.id)) : undefined,
    blend: item.blend ?? undefined,
  }
}

// The two ends of a linear gradient in the shape's own box: the colour is at the first, the second colour at the last.
export const GRADIENT_AXES: Record<Exclude<ModelGradDir, 'radial'>, { x1: number; y1: number; x2: number; y2: number }> = {
  down: { x1: 0, y1: 0, x2: 0, y2: 1 },
  up: { x1: 0, y1: 1, x2: 0, y2: 0 },
  left: { x1: 1, y1: 0, x2: 0, y2: 0 },
  right: { x1: 0, y1: 0, x2: 1, y2: 0 },
}

// The two ends of a linear gradient turned by `angle` degrees about the middle of the shape's box (the direction is turned in the box's own units, so a long thin shape
// turns its gradient as the box is turned).
export function gradientAxis(dir: Exclude<ModelGradDir, 'radial'>, angle = 0): { x1: number; y1: number; x2: number; y2: number } {
  if (!angle) return GRADIENT_AXES[dir]
  // turned, the axis has to run through the middle of the box, which the plain ones (along an edge) do not
  const base = GRADIENT_AXES[dir], a = dir === 'down' || dir === 'up' ? { ...base, x1: 0.5, x2: 0.5 } : { ...base, y1: 0.5, y2: 0.5 }
  const t = (angle * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const turn = (x: number, y: number): [number, number] => [0.5 + (x - 0.5) * c - (y - 0.5) * s, 0.5 + (x - 0.5) * s + (y - 0.5) * c]
  const [x1, y1] = turn(a.x1, a.y1), [x2, y2] = turn(a.x2, a.y2)
  return { x1, y1, x2, y2 }
}

// The stops of a gradient from one colour to another, the second reached `reach` percent of the way across the shape (100: at its far side). Past 100 the gradient has only
// got part of the way there at the far side, so the last stop is a mix; at 0 the shape is the second colour throughout.
export function gradientStops(from: string, to: string, reach = 100): Array<{ offset: number; colour: string }> {
  const r = Math.max(0, reach) / 100
  if (r > 1) return [{ offset: 0, colour: from }, { offset: 1, colour: mix(from, to, 1 / r) }]
  if (r >= 0.999) return [{ offset: 0, colour: from }, { offset: 1, colour: to }]
  return [{ offset: 0, colour: from }, { offset: r, colour: to }, { offset: 1, colour: to }]
}

// The region a mask covers: wide enough for any outline a model can have, after its scale.
export const MASK_BOX = { x: -1000, y: -1000, w: 2400, h: 2400 } as const
