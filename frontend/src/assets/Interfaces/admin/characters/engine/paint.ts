import type { ModelBlend, ModelContent, ModelGradDir } from '../../../../../api/types'
import { paintLayer, type Colouring, type PaintLayer } from './colour'
import type { Solved } from './rig'

// Painting a solved model (phase 4b): what each shape is drawn with, and the SVG definitions (gradients, clip paths, masks) that the effects need. Pure: the
// canvas, the preview tiles and the pictures of forms all draw from the same items, so they cannot disagree. The solver gives each shape's outline as path text in
// canvas space, so a clip, a cut-out or a shading shape's base shapes are read straight from it.

export interface PaintItem {
  id: string
  d: string
  fill: string
  opacity: number
  gradient: { dir: ModelGradDir; end: string } | null
  blend: ModelBlend | null
  // the outline the shape is kept inside, the outlines of the base shapes a shading shape is kept inside, and the outlines that cut a hole in it
  clipD: string | null
  compDs: string[]
  cutDs: string[]
  helper: boolean
  shading: boolean
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
      id, d: r.d, fill: layer.fill, opacity: layer.opacity, gradient: layer.gradient, blend: layer.blend, clipD: clipD || null, compDs, cutDs, helper: layer.helper, shading: layer.shading,
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
  | { kind: 'gradient'; id: string; dir: ModelGradDir; from: string; to: string }
  | { kind: 'clip'; id: string; ds: string[] }
  | { kind: 'mask'; id: string; ds: string[] }

const gradId = (prefix: string, id: string) => `${prefix}-g-${id}`
const clipId = (prefix: string, id: string) => `${prefix}-k-${id}`
const compId = (prefix: string, id: string) => `${prefix}-c-${id}`
const maskId = (prefix: string, id: string) => `${prefix}-m-${id}`

export function paintDefs(items: PaintItem[], prefix: string): PaintDef[] {
  const defs: PaintDef[] = []
  for (const i of items) {
    if (i.blank) continue
    if (i.gradient) defs.push({ kind: 'gradient', id: gradId(prefix, i.id), dir: i.gradient.dir, from: i.fill, to: i.gradient.end })
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
  mask?: string
  blend?: string
}

const url = (id: string) => `url(#${id})`

export function paintAttrs(item: PaintItem, prefix: string): PaintAttrs {
  return {
    fill: item.gradient ? url(gradId(prefix, item.id)) : item.fill,
    clip: item.clipD ? url(clipId(prefix, item.id)) : undefined,
    comp: item.compDs.length ? url(compId(prefix, item.id)) : undefined,
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

// The region a mask covers: wide enough for any outline a model can have, after its scale.
export const MASK_BOX = { x: -1000, y: -1000, w: 2400, h: 2400 } as const
