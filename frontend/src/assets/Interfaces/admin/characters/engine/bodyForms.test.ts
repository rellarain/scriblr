import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, publishFaults, starterContent } from '../modelContent'
import { newShape } from './edit'
import { addField, addFieldset, fieldsetsOnFeature, type FeatureRef } from './fields'
import { setAxisCarry } from './formEdit'
import { PROPS } from './props'
import { solve } from './rig'
import type { Edit } from './rigEdit'

// Phase O8: forms that carry what follows them, and the Flare property.

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
let n = 0
const make = (prefix: string) => `${prefix}_${++n}`
const shape = (c: ModelContent, id: string): ModelShape => c.shapes.find(s => s.id === id)!
const near = (a: number, b: number, digits = 3) => expect(a).toBeCloseTo(b, digits)

// A Chest object of a plate (80 x 40) with an axis of two forms, the second wider, and a Shirt object whose first point is welded to the plate's second point.
function dressed(carry: boolean, wide?: ModelPoint[]): ModelContent {
  let c = starterContent('Adult')
  c = addGroup(c, newGroup('gT', 'Torso'))
  c = addObject(c, 'gT', { id: 'oC', name: 'Chest', layer: 'body', shapes: [] })
  c = addShape(c, 'oC', { ...newShape('plate', 'Plate', 'square', box(60, 20, 80, 40)), slot: 'k_skin' })
  c = addObject(c, 'gT', { id: 'oS', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oS', { ...newShape('shirt', 'Shirt', 'square', box(60, 20, 80, 50)), slot: 'k_skin' })
  const base = shape(c, 'plate').pts
  const out = wide ?? base.map(p => ({ ...p, x: 100 + (p.x - 100) * 1.5 }))
  c = { ...c, objects: c.objects.map(o => (o.id === 'oC' ? { ...o, axes: [{ id: 'size', name: 'Size', initial: 'base', carry, options: [{ id: 'base', name: 'Base', ovr: [] }, { id: 'wide', name: 'Wide', ovr: [{ shape: 'plate', pts: out }] }] }] } : o)) }
  c = { ...c, shapes: c.shapes.map(s => (s.id === 'shirt' ? { ...s, pts: s.pts.map((p, i) => (i === 0 ? { ...p, bind: { kind: 'point' as const, s: 'plate', i: 1, d: [0, 0] as [number, number], e: 0, t: 0, o: 0 } } : p)) } : s)) }
  return c
}
const wideNow = (c: ModelContent) => solve(c, {}, 'front', { forms: { 'oC.size': 'wide' } }).shapes

describe('forms that carry what follows them (phase O8)', () => {
  it('lets a garment locked to a shape follow the outline the chosen form gives it', () => {
    const plain = dressed(false), carried = dressed(true)
    const basePoint = shape(plain, 'plate').pts[1], widePoint = carried.objects.find(o => o.id === 'oC')!.axes![0].options[1].ovr[0].pts[1]
    // an axis that does not carry: the shirt stays on the plate's own outline, as anchors and links always read it
    near(wideNow(plain).shirt.local[0].x, basePoint.x)
    // one that carries: the shirt goes out with the wider form, and the plate's rig outline (what anchors read) is the form's
    near(wideNow(carried).shirt.local[0].x, widePoint.x)
    near(wideNow(carried).plate.rig[1].x, widePoint.x)
    // with the base form chosen nothing changes
    near(solve(carried, {}).shapes.shirt.local[0].x, basePoint.x)
  })

  it('reads the shape\'s own outline when the form has another number of points, and says so', () => {
    const base = shape(dressed(true), 'plate').pts
    const five: ModelPoint[] = [...base.map(p => ({ ...p, x: 100 + (p.x - 100) * 1.5 })), { x: 100, y: 64, m: 's' }]
    const c = dressed(true, five)
    near(wideNow(c).shirt.local[0].x, base[1].x)
    expect(publishFaults(c)).toContain('Form Wide of Chest carries what follows it, but its outline of shape Plate has 5 points, not 4.')
    expect(publishFaults(dressed(false, five)).some(f => f.includes('carries what follows it'))).toBe(false)
  })

  it('is set and cleared on the axis, kept by a model file round trip and repaired when it is not a yes', () => {
    const on = setAxisCarry(dressed(false), 'oC', 'size', true)
    expect(on.objects.find(o => o.id === 'oC')!.axes![0].carry).toBe(true)
    expect(setAxisCarry(on, 'oC', 'size', false).objects.find(o => o.id === 'oC')!.axes![0].carry).toBe(false)
    const odd = { ...on, objects: on.objects.map(o => (o.id === 'oC' ? { ...o, axes: o.axes!.map(a => ({ ...a, carry: 'yes' as unknown as boolean })) } : o)) }
    expect(normalizeContent(odd).objects.find(o => o.id === 'oC')!.axes![0].carry).toBe(false)
  })
})

describe('the Flare property (phase O8)', () => {
  // the Chest object with a second shape beside the plate (a shadow on the jaw stays on it as the jaw widens)
  const jawed = () => addShape(dressed(false), 'oC', { ...newShape('dot', 'Dot', 'square', box(140, 30, 20, 20)), slot: 'k_skin' })
  function withFlare(c: ModelContent, ref: FeatureRef): { c: ModelContent; id: string } {
    const set = fieldsetsOnFeature(c, ref)[0]
    let next = c, setId = set?.id
    if (!set) { const made = addFieldset(c, { kind: 'object', id: 'oC' }, ref, '', make); next = must(made); setId = made.ok ? made.fieldsetId! : '' }
    const added = addField(next, setId!, 'flare', make)
    return { c: must(added), id: added.ok ? added.rangeId! : '' }
  }

  it('has a slider from narrower to wider, nothing at rest', () => {
    expect(PROPS.flare).toMatchObject({ rest: 0, lo: -100, hi: 100, unit: '%' })
  })

  it('widens the lower half of a whole object about its middle at rest, the most at its bottom, and leaves the top', () => {
    const { c, id } = withFlare(jawed(), { feature: 'object', target: 'oC', i: 0 })
    const rest = solve(c, {}).shapes, wide = solve(c, { [id]: 30 }).shapes, narrow = solve(c, { [id]: -30 }).shapes
    // the object spans x 60..160 and y 20..60: its middle is x 110, y 40
    const at = (s: typeof rest, sid: string, y: number) => s[sid].local.filter(p => Math.abs(p.y - y) < 1e-6).map(p => p.x).sort((a, b) => a - b)
    expect(at(wide, 'plate', 20)).toEqual(at(rest, 'plate', 20))                           // the top stays
    at(wide, 'plate', 60).forEach((x, i) => near(x, 110 + (at(rest, 'plate', 60)[i] - 110) * 1.3))
    at(narrow, 'plate', 60).forEach((x, i) => near(x, 110 + (at(rest, 'plate', 60)[i] - 110) * 0.7))
    // the second shape flares about the same middle: its bottom is half way down the lower half
    at(wide, 'dot', 50).forEach((x, i) => near(x, 110 + (at(rest, 'dot', 50)[i] - 110) * 1.15))
    for (const s of Object.values(wide)) expect(s.d).not.toMatch(/NaN|undefined/)
  })

  it('flares a single shape about its own middle', () => {
    const { c, id } = withFlare(jawed(), { feature: 'shape', target: 'plate', i: 0 })
    const rest = solve(c, {}).shapes.plate.local, wide = solve(c, { [id]: 30 }).shapes.plate.local
    // the plate spans x 60..140 and y 20..60
    wide.forEach((p, i) => { if (rest[i].y === 60) near(p.x, 100 + (rest[i].x - 100) * 1.3); else if (rest[i].y === 20) near(p.x, rest[i].x) })
  })
})
