import type { ModelBind, ModelContent, ModelPoint, ModelShape, ModelTintKind } from '../../../../../api/types'
import { addShape, freshId, objectOfShape, randomId, shapeById, type MakeId } from '../modelContent'
import { bakedPaint } from './colour'
import { apply, boxOf, clamp, edgeAt, inverse, r2, windSign, type BuiltPoint } from './geometry'
import { LIMITS, linkCount, shadingCount } from './limits'
import { twinShape } from './pairEdit'
import { solveAtRest } from './rig'
import { done, fail, type Edit } from './rigEdit'
import { DEFAULT_AMOUNT } from './paintEdit'

// Shading shapes: a shadow, a mid tone or a highlight laid along one edge of a shape. A new one is a band whose points are locked to that edge (the edge links of
// the rig), so it follows the shape wherever sliders, forms and poses take it; it is kept inside the base shapes of its object when drawn, so it never has to be
// trimmed by hand.

export type Side = 'left' | 'right' | 'top' | 'bottom'
export const SIDES: Array<{ id: Side; name: string }> = [{ id: 'left', name: 'Left' }, { id: 'right', name: 'Right' }, { id: 'top', name: 'Top' }, { id: 'bottom', name: 'Bottom' }]
export const KINDS: Array<{ id: ModelTintKind; name: string }> = [{ id: 'shadow', name: 'Shadow' }, { id: 'mid', name: 'Mid tone' }, { id: 'highlight', name: 'Highlight' }]

const FACING: Record<Side, [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }

// The edge of an outline that faces a side most squarely: the one whose outward direction, in the middle of the edge, points that way (the first of equals).
export function edgeFacing(pre: BuiltPoint[], side: Side): number {
  const sign = windSign(pre), [fx, fy] = FACING[side]
  let best = 0, score = -Infinity
  for (let e = 0; e < pre.length; e++) {
    const [, , nx, ny] = edgeAt(pre, sign, e, 0.5, 0)
    const s = Math.round((nx * fx + ny * fy) * 1000) / 1000
    if (s > score) { score = s; best = e }
  }
  return best
}

// How far the band reaches into the shape, from the edge: a fifth of the shape's smaller side, not under 3 units or over 30.
const depthFor = (pre: Array<{ x: number; y: number }>): number => {
  const b = boxOf(pre.map((p): [number, number] => [p.x, p.y]))
  return r2(clamp(Math.min(b.w, b.h) * 0.2, 3, 30))
}

// Add a shading shape to a shape: a band along the edge of the shape that faces `side`, of a kind, locked to that edge. It goes into the shape's object, just above
// the object's top shape, painted from the same colour slot.
export function addShading(c: ModelContent, baseId: string, kind: ModelTintKind, side: Side, make: MakeId = randomId): Edit & { shapeId?: string } {
  const base = shapeById(c, baseId), home = base && objectOfShape(c, baseId)
  if (!base || !home) return fail('There is no such shape.')
  if (base.mirrorOf) return fail('A twin follows its original: add the shading to the original, or break the pair.')
  if (base.shade) return fail('That is a shading shape already: add the shading to the shape it lies on.')
  if (base.pts.length < 3) return fail('Draw the outline first: shading follows an edge of the shape.')
  if (shadingCount(c, home.id) >= LIMITS.shadesMax) return fail(`An object may have at most ${LIMITS.shadesMax} shading shapes.`)
  if (home.shapes.length >= LIMITS.shapesPerObjectMax) return fail(`An object may have at most ${LIMITS.shapesPerObjectMax} shapes.`)
  if (c.shapes.length >= LIMITS.shapesMax) return fail(`A model may have at most ${LIMITS.shapesMax} shapes.`)
  if (linkCount(c) + 6 > LIMITS.linksMax) return fail(`A band takes six point links and the model may have at most ${LIMITS.linksMax}.`)
  const rest = solveAtRest(c), r = rest.shapes[baseId]
  if (!r || r.pre.length < 3) return fail('That shape is not drawn, so it has no edge to follow.')
  const e = edgeFacing(r.pre, side), sign = windSign(r.pre), depth = depthFor(r.pre), inv = inverse(r.frame)
  // along the outside of the edge (a little past it, so the clip trims it exactly), then back along the inside
  const spec: Array<{ t: number; o: number; m: ModelPoint['m'] }> = [
    { t: 0, o: 1.5, m: 's' }, { t: 0.5, o: 1.5, m: 'c' }, { t: 1, o: 1.5, m: 's' },
    { t: 1, o: -depth, m: 's' }, { t: 0.5, o: -depth, m: 'c' }, { t: 0, o: -depth, m: 's' },
  ]
  const pts: ModelPoint[] = spec.map(p => {
    const [mx, my] = edgeAt(r.pre, sign, e, p.t, p.o)
    const [lx, ly] = apply(inv, mx, my)
    const bind: ModelBind = { kind: 'edge', s: baseId, i: 0, d: [0, 0], e, t: p.t, o: p.o }
    return { x: r2(lx), y: r2(ly), m: p.m, hi: null, ho: null, bind }
  })
  const id = freshId(c, 's', make)
  const topZ = Math.max(base.z, ...home.shapes.map(sid => shapeById(c, sid)?.z ?? 0))
  const topBack = Math.max(base.zBack ?? base.z, ...home.shapes.map(sid => { const x = shapeById(c, sid); return x?.zBack ?? x?.z ?? 0 }))
  const paint = bakedPaint(c, base)
  const names = { shadow: 'Shadow', mid: 'Mid tone', highlight: 'Highlight' }
  const band: ModelShape = {
    id, name: `${names[kind]} ${side}`, closed: true, z: r2(Math.min(100, topZ + 0.05)), op: 1, view: base.view, pts, half: 0, template: null, mirrorOf: null,
    back: null, zBack: base.zBack != null ? r2(Math.min(100, topBack + 0.05)) : null, loose: base.loose ?? null, copyOf: null, hide: false,
    slot: paint.slot, gray: paint.gray, tone: 0, derive: null, shade: { kind, t: DEFAULT_AMOUNT[kind] }, grad: null, blend: null, clip: null, cut: [], helper: false,
  }
  let next = addShape(c, home.id, band, home.shapes[home.shapes.length - 1])
  // a shape with a twin gets the twin of its shading too, on the twin's side (in the twin's object): the other arm is shaded like this one
  const twinBase = c.shapes.find(s => s.mirrorOf === baseId), twinHome = twinBase && objectOfShape(c, twinBase.id)
  if (twinBase && twinHome) {
    if (twinHome.shapes.length + (twinHome.id === home.id ? 1 : 0) >= LIMITS.shapesPerObjectMax || next.shapes.length >= LIMITS.shapesMax) return fail('The twin side has no room for the twin of the band: remove a shape there first.')
    next = addShape(next, twinHome.id, twinShape(band, freshId(next, 's', make)), twinBase.id)
  }
  return { ...done(next), shapeId: id }
}
