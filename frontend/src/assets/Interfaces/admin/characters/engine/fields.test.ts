import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelFieldset, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, publishFaults, removeGroup, removeObject, removeShape, starterContent } from '../modelContent'
import { hexHsl, paintLayer, paletteOf, type Colouring, type SlotChoices } from './colour'
import { newShape } from './edit'
import {
  addField, addFieldset, fieldDrive, fieldProp, fieldsOf, fieldsetsOnFeature, fieldsetsOwnedBy, featureProblem, featureText, isOffered, removeField, removeFieldset, renameFieldset, setFieldProp, waitsOn,
  type FeatureRef,
} from './fields'
import { limitNotes, LIMITS } from './limits'
import { paintDefs, paintShapes, gradientAxis, gradientStops } from './paint'
import { setGradient } from './paintEdit'
import { makeTwin } from './pairEdit'
import { PROPS, PROP_KEYS, hasProp, propsOf } from './props'
import { applyPreset, deletePreset, restState, savePreset } from './presets'
import { solve, solveAtRest, type Values } from './rig'
import { fieldCheck } from './rigCheck'
import { removeRange, type Edit } from './rigEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
let n = 0
const make = (prefix: string) => `${prefix}_${++n}`
const shape = (c: ModelContent, id: string): ModelShape => c.shapes.find(s => s.id === id)!
const near = (a: number, b: number, digits = 3) => expect(a).toBeCloseTo(b, digits)

// A Nose object of a wide plate (80 x 40) and a dot beside it, and a Hair object, in one group; the nose plate is painted Skin.
function nosed(): ModelContent {
  let c = starterContent('Adult')
  c = addGroup(c, newGroup('gH', 'Head'))
  c = addObject(c, 'gH', { id: 'oN', name: 'Nose', layer: 'body', shapes: [] })
  c = addShape(c, 'oN', { ...newShape('plate', 'Plate', 'square', box(60, 20, 80, 40)), slot: 'k_skin' })
  c = addShape(c, 'oN', { ...newShape('dot', 'Dot', 'square', box(140, 30, 20, 20)), slot: 'k_skin' })
  c = addObject(c, 'gH', { id: 'oH', name: 'Hair', layer: 'hair', shapes: [] })
  c = addShape(c, 'oH', { ...newShape('fringe', 'Fringe', 'square', box(60, 0, 80, 20)), slot: 'k_hair' })
  return c
}
const plate: FeatureRef = { feature: 'shape', target: 'plate', i: 0 }
const owner = { kind: 'object', id: 'oN' } as const

// the content with a field of `prop` on `ref`; returns it with the field's slider id
function withField(c: ModelContent, ref: FeatureRef, prop: Parameters<typeof addField>[2]): { c: ModelContent; id: string } {
  const set = fieldsetsOnFeature(c, ref)[0]
  let next = c, setId = set?.id
  if (!set) { const made = addFieldset(c, owner, ref, '', make); next = must(made); setId = made.ok ? made.fieldsetId! : '' }
  const added = addField(next, setId, prop, make)
  return { c: must(added), id: added.ok ? added.rangeId! : '' }
}
const boxOf = (c: ModelContent, values: Values, id: string) => solve(c, values).shapes[id].box

describe('the properties', () => {
  it('every property belongs to a feature, and a point has a place, an edge an offset, a shape or an object the rest', () => {
    expect(propsOf('point').map(p => p.key)).toEqual(['x', 'y'])
    expect(propsOf('edge').map(p => p.key)).toEqual(['offset'])
    expect(propsOf('shape').map(p => p.key)).toEqual(propsOf('object').map(p => p.key))
    expect(propsOf('shape').length).toBe(PROP_KEYS.length - 1)
    expect(hasProp('point', 'width')).toBe(false)
    expect(hasProp('edge', 'offset')).toBe(true)
    expect(hasProp('shape', 'nonsense')).toBe(false)
  })
})

describe('making fieldsets and fields', () => {
  it('adds a fieldset for a feature, named after it, owned by an object, and a field with a slider of the property\'s own span', () => {
    const c = nosed()
    const made = addFieldset(c, owner, plate, '', make)
    const set = must(made).fieldsets![0]
    expect(set).toMatchObject({ ownerKind: 'object', owner: 'oN', feature: 'shape', target: 'plate', i: 0, ranges: [], name: 'Shape Plate' })
    const added = addField(must(made), set.id, 'width', make)
    const out = must(added)
    const [r] = fieldsOf(out, out.fieldsets![0])
    expect(r).toMatchObject({ name: 'Width', scope: 'oN', min: 50, rest: 100, max: 150, unit: '%', show: true })
    expect(r.drives[0]).toMatchObject({ kind: 'prop', feature: 'shape', shape: 'plate', prop: 'width', atMin: 50, atMax: 150, id: null })
    expect(fieldProp(r, plate)!.key).toBe('width')
    expect(fieldDrive(r, plate)!.atMax).toBe(150)
  })

  it('gives a field of a point or an edge its number, a field of an object its object, and a preset\'s field the scope of its feature\'s object', () => {
    let c = nosed()
    c = { ...c, presets: [{ id: 'p_elder', name: 'Elder', kind: 'Age', values: {}, hidden: [] }] }
    const point = must(addFieldset(c, { kind: 'preset', id: 'p_elder' }, { feature: 'point', target: 'plate', i: 2 }, 'Corner', make))
    const withPoint = must(addField(point, point.fieldsets![0].id, 'x', make))
    expect(withPoint.ranges[0].drives[0]).toMatchObject({ feature: 'point', shape: 'plate', i: 2, prop: 'x' })
    expect(withPoint.ranges[0].scope).toBe('oN')
    const whole = must(addFieldset(withPoint, owner, { feature: 'object', target: 'oN', i: 0 }, '', make))
    const both = must(addField(whole, whole.fieldsets![1].id, 'rotation', make))
    expect(both.ranges[1].drives[0]).toMatchObject({ feature: 'object', id: 'oN', shape: null, prop: 'rotation', i: 0 })
    expect(featureText(both, { feature: 'edge', target: 'plate', i: 1 })).toBe('Edge 2 of Plate')
    expect(featureText(both, { feature: 'object', target: 'oN', i: 0 })).toBe('Object Nose')
  })

  it('refuses what cannot hold fields: a missing or twin feature, a point that is not there, a missing owner, and past the limits', () => {
    let c = nosed()
    expect(featureProblem(c, { feature: 'shape', target: 'gone', i: 0 })).toMatch(/no such shape/)
    expect(featureProblem(c, { feature: 'point', target: 'plate', i: 9 })).toMatch(/no such point/)
    expect(featureProblem(c, { feature: 'edge', target: 'plate', i: 9 })).toMatch(/no such edge/)
    expect(featureProblem(c, { feature: 'object', target: 'gone', i: 0 })).toMatch(/no such object/)
    expect(refused(addFieldset(c, { kind: 'group', id: 'gone' }, plate))).toMatch(/no such group/)
    expect(refused(addFieldset(c, { kind: 'preset', id: 'gone' }, plate))).toMatch(/no such variant or style/)
    c = must(makeTwin(c, 'shape', 'dot', make))
    const twin = c.shapes.find(s => s.mirrorOf === 'dot')!
    expect(refused(addFieldset(c, owner, { feature: 'shape', target: twin.id, i: 0 }))).toMatch(/twin follows its original/)
    const full = { ...c, fieldsets: Array.from({ length: LIMITS.fieldsetsMax }, (_, i): ModelFieldset => ({ id: `f${i}`, name: 'F', ownerKind: 'object', owner: 'oN', feature: 'shape', target: 'plate', i: 0, ranges: [] })) }
    expect(refused(addFieldset(full, owner, plate))).toMatch(/at most 24 fieldsets/)
  })

  it('refuses a property the feature does not have, one it already has a field for, and more fields than a fieldset may hold', () => {
    const c = must(addFieldset(nosed(), owner, { feature: 'point', target: 'plate', i: 0 }, '', make))
    const set = c.fieldsets![0]
    expect(refused(addField(c, set.id, 'width'))).toMatch(/not something a point has/)
    const one = must(addField(c, set.id, 'x', make))
    expect(refused(addField(one, set.id, 'x'))).toMatch(/already has a field for position across/)
    expect(refused(addField(one, 'gone', 'x'))).toMatch(/no such fieldset/)
    const crowded = { ...one, fieldsets: [{ ...one.fieldsets![0], ranges: Array.from({ length: LIMITS.fieldsMax }, (_, i) => `r${i}`) }] }
    expect(refused(addField(crowded, set.id, 'y'))).toMatch(/at most 12 fields/)
  })

  it('changes the property of a field: the slider takes the new span and the name follows unless it was renamed', () => {
    const { c, id } = withField(nosed(), plate, 'width')
    const set = c.fieldsets![0]
    const tall = must(setFieldProp(c, set.id, id, 'rotation'))
    expect(tall.ranges[0]).toMatchObject({ name: 'Rotation', min: -30, rest: 0, max: 30, unit: '°' })
    expect(tall.ranges[0].drives[0]).toMatchObject({ prop: 'rotation', atMin: -30, atMax: 30 })
    const named = { ...c, ranges: c.ranges.map(r => ({ ...r, name: 'Broader' })) }
    expect(must(setFieldProp(named, set.id, id, 'height')).ranges[0].name).toBe('Broader')
    expect(refused(setFieldProp(c, set.id, id, 'offset'))).toMatch(/not something a shape has/)
    expect(must(setFieldProp(c, set.id, id, 'width'))).toBe(c)
  })

  it('removes a field with its slider, a fieldset with its sliders, and renames a fieldset', () => {
    const a = withField(nosed(), plate, 'width'), b = withField(a.c, plate, 'height')
    const set = b.c.fieldsets![0]
    expect(set.ranges).toEqual([a.id, b.id])
    const without = removeField(b.c, a.id)
    expect(without.ranges.map(r => r.id)).toEqual([b.id])
    expect(without.fieldsets![0].ranges).toEqual([b.id])
    expect(removeFieldset(b.c, set.id)).toMatchObject({ fieldsets: [], ranges: [] })
    expect(renameFieldset(b.c, set.id, 'Plate sizes').fieldsets![0].name).toBe('Plate sizes')
    expect(fieldsetsOwnedBy(b.c, owner)).toHaveLength(1)
  })
})

describe('what the sliders do to the drawing', () => {
  const rest = (c: ModelContent) => solveAtRest(c).shapes
  it('draws the model exactly as it was with every field at rest', () => {
    let c = nosed()
    for (const prop of ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const) c = withField(c, plate, prop).c
    c = withField(c, { feature: 'object', target: 'oN', i: 0 }, 'width').c
    const plain = rest(nosed()), now = rest(c)
    for (const id of Object.keys(plain)) { expect(now[id].d).toBe(plain[id].d); expect(now[id].fade).toBe(plain[id].fade) }
  })

  it('widens and heightens a shape about its middle, by the percent the slider reaches', () => {
    const { c, id } = withField(nosed(), plate, 'width')
    const at0 = boxOf(c, {}, 'plate'), wide = boxOf(c, { [id]: 150 }, 'plate'), narrow = boxOf(c, { [id]: 50 }, 'plate')
    near(wide.w, at0.w * 1.5); near(narrow.w, at0.w * 0.5); near(wide.h, at0.h)
    near(wide.x + wide.w / 2, at0.x + at0.w / 2)         // about its middle
    const h = withField(c, plate, 'height')
    near(boxOf(h.c, { [h.id]: 150 }, 'plate').h, at0.h * 1.5)
  })

  it('moves a shape across and up, in the units of the model, and turns it about its middle', () => {
    const x = withField(nosed(), plate, 'x'), y = withField(x.c, plate, 'y')
    expect(x.c.ranges[0]).toMatchObject({ min: -20, rest: 0, max: 20 })
    const at0 = boxOf(y.c, {}, 'plate'), moved = boxOf(y.c, { [x.id]: 10, [y.id]: -10 }, 'plate')
    near(moved.x, at0.x + 10); near(moved.y, at0.y - 10); near(moved.w, at0.w)
    const r = withField(nosed(), plate, 'rotation')
    const turned = boxOf(r.c, { [r.id]: 30 }, 'plate')
    expect(turned.h).toBeGreaterThan(at0.h + 10)         // a wide plate turned leans over
    const quarter = withField(nosed(), plate, 'rotation')
    const c2 = { ...quarter.c, ranges: quarter.c.ranges.map(rg => ({ ...rg, max: 90, drives: rg.drives.map(d => ({ ...d, atMax: 90 })) })) }
    const flat = boxOf(c2, { [quarter.id]: 90 }, 'plate')
    near(flat.w, at0.h, 2); near(flat.h, at0.w, 2)     // a quarter turn swaps width and height
  })

  it('lifts the two ends of a shape against its middle (a smile) and drops them for a negative amount, whatever its points', () => {
    let c = nosed()
    c = addShape(c, 'oN', { ...newShape('lip', 'Lip', 'oval', box(60, 80, 80, 20)), slot: 'k_skin' })
    const { c: d, id } = withField(c, { feature: 'shape', target: 'lip', i: 0 }, 'curve')
    expect(d.ranges[0]).toMatchObject({ min: -10, rest: 0, max: 10 })
    const pts = (v: number) => solve(d, { [id]: v }).shapes.lip.local
    const at0 = pts(0), up = pts(10), down = pts(-10)
    const left = at0.reduce((m, p, i) => (p.x < at0[m].x ? i : m), 0), right = at0.reduce((m, p, i) => (p.x > at0[m].x ? i : m), 0)
    const top = at0.reduce((m, p, i) => (p.y < at0[m].y ? i : m), 0)
    near(up[left].y, at0[left].y - 2); near(up[right].y, at0[right].y - 2)        // a smile: the ends go up (y runs downward)
    near(down[left].y, at0[left].y + 2); near(down[right].y, at0[right].y + 2)    // a frown
    near(up[top].y, at0[top].y)                                                   // the middle stays where it was
    near(up[top].x, at0[top].x)
    // an object's curve reaches every shape in it about the object's own middle, and a form with another number of points is curved too
    const o = withField(nosed(), { feature: 'object', target: 'oN', i: 0 }, 'curve')
    const before = solve(o.c, {}).shapes.plate.local, after = solve(o.c, { [o.id]: 10 }).shapes.plate.local
    expect(after.length).toBe(before.length)
    expect(after.some((p, i) => Math.abs(p.y - before[i].y) > 0.5)).toBe(true)
  })

  it('stretches the weighted ends of a lock of hair away from its roots, and draws them textured, whatever the points it is drawn with', () => {
    // a strip: three roots across the top (no weight) and three tips below (weight 1, 0.5, 1)
    const lock: ModelShape = { ...newShape('lock', 'Lock', 'square', box(80, 10, 40, 40)), slot: 'k_hair', pts: [
      { x: 80, y: 10, m: 's' }, { x: 100, y: 10, m: 's' }, { x: 120, y: 10, m: 's' },
      { x: 120, y: 50, m: 's', w: 1 }, { x: 100, y: 40, m: 's', w: 0.5 }, { x: 80, y: 50, m: 's', w: 1 },
    ] }
    let c = nosed()
    c = addShape(c, 'oH', lock)
    const { c: d, id } = withField(c, { feature: 'shape', target: 'lock', i: 0 }, 'length')
    expect(d.ranges[0]).toMatchObject({ min: 50, rest: 100, max: 200 })
    const at = (v: number) => solve(d, { [id]: v }).shapes.lock.local
    const rest = at(100), long = at(200), short = at(50)
    near(long[3].y, 10 + 40 * 2); near(long[4].y, 10 + 30 + 30 * 0.5)      // the tip doubles its distance from the roots; the half weight moves half as far
    near(short[3].y, 10 + 40 * 0.5)
    for (const i of [0, 1, 2]) near(long[i].y, rest[i].y)                      // the roots stay
    expect(solve(d, {}).shapes.lock.d).toBe(solve(c, {}).shapes.lock.d)        // at rest nothing changed
    const w = withField(c, { feature: 'shape', target: 'lock', i: 0 }, 'texture')
    expect(w.c.ranges[0]).toMatchObject({ min: 0, rest: 0, max: 99 })
    // the texture is drawn (phase O7): the points and the outline hit tests read stay where they were, and the painted path is another one
    const waved = solve(w.c, { [w.id]: 99 }).shapes.lock, plain = solve(w.c, {}).shapes.lock
    waved.local.forEach((p, i) => { near(p.x, plain.local[i].x); near(p.y, plain.local[i].y) })
    expect(waved.poly).toEqual(plain.poly)
    expect(waved.d).not.toBe(plain.d)
    expect(waved.d).not.toMatch(/NaN|undefined/)
    expect(waved.d.startsWith('M80 10')).toBe(true)                           // the path starts at a root, where the edge is smooth
    // an object's length reaches every shape in it with the roots of its own
    const o = withField(c, { feature: 'object', target: 'oH', i: 0 }, 'length')
    near(solve(o.c, { [o.id]: 200 }).shapes.lock.local[3].y, 10 + 40 * 2)
  })

  it('moves one point and pushes one edge outward', () => {
    const p = withField(nosed(), { feature: 'point', target: 'plate', i: 1 }, 'x')       // the top right corner
    const at0 = boxOf(p.c, {}, 'plate'), out = boxOf(p.c, { [p.id]: 10 }, 'plate')
    near(out.w, at0.w + 10); near(out.x, at0.x)
    const e = withField(nosed(), { feature: 'edge', target: 'plate', i: 1 }, 'offset')   // the right side, between the top right and the bottom right corner
    const pushed = boxOf(e.c, { [e.id]: 10 }, 'plate'), pulled = boxOf(e.c, { [e.id]: -10 }, 'plate')
    near(pushed.w, at0.w + 10); near(pushed.x, at0.x)
    near(pulled.w, at0.w - 10)
    const top = withField(nosed(), { feature: 'edge', target: 'plate', i: 0 }, 'offset')
    near(boxOf(top.c, { [top.id]: 10 }, 'plate').h, at0.h + 10)                           // the top side pushes up
    near(boxOf(top.c, { [top.id]: 10 }, 'plate').y, at0.y - 10)
  })

  it('changes every shape of an object as one, about the middle of the object', () => {
    const { c, id } = withField(nosed(), { feature: 'object', target: 'oN', i: 0 }, 'width')
    const left = boxOf(c, {}, 'plate'), right = boxOf(c, {}, 'dot')
    const wide = { plate: boxOf(c, { [id]: 150 }, 'plate'), dot: boxOf(c, { [id]: 150 }, 'dot') }
    const mid = (left.x + right.x + right.w) / 2         // the plate runs to 140 and the dot to 160, so the object's middle is at 110
    near(wide.plate.w, left.w * 1.5); near(wide.dot.w, right.w * 1.5)
    near(wide.plate.x, mid - (mid - left.x) * 1.5); near(wide.dot.x, mid + (right.x - mid) * 1.5)
  })

  it('does the same to a twin, as a mirror image', () => {
    let c = must(makeTwin(nosed(), 'shape', 'plate', make))
    const twin = c.shapes.find(s => s.mirrorOf === 'plate')!
    const { c: withIt, id } = withField(c, plate, 'width')
    c = withIt
    const at0 = boxOf(c, {}, twin.id), wide = boxOf(c, { [id]: 150 }, twin.id), original = boxOf(c, { [id]: 150 }, 'plate')
    near(wide.w, at0.w * 1.5); near(wide.w, original.w)
    near(wide.x + wide.w / 2, at0.x + at0.w / 2)
  })

  it('fades a shape or an object: the percent of its own opacity it keeps', () => {
    const s = withField(nosed(), plate, 'opacity'), o = withField(s.c, { feature: 'object', target: 'oH', i: 0 }, 'opacity')
    const solved = (values: Values) => solve(o.c, values).shapes
    expect(solved({}).plate.fade).toBe(1)
    near(solved({ [s.id]: 40 }).plate.fade, 0.4); expect(solved({ [s.id]: 40 }).dot.fade).toBe(1)
    near(solved({ [o.id]: 25 }).fringe.fade, 0.25)
    const items = paintShapes(o.c, solve(o.c, { [s.id]: 40 }), { palette: paletteOf(o.c), choices: {} })
    near(items.find(i => i.id === 'plate')!.opacity, 0.4)
  })

  it('draws finite shapes whatever the slider values are', () => {
    let c = nosed()
    // a fieldset holds up to 12 fields, so the properties of a shape go to two
    const shapeProps = PROP_KEYS.filter(k => PROPS[k].features.includes('shape'))
    c = must(addFieldset(c, owner, plate, 'Plate', make))
    for (const [k, prop] of shapeProps.entries()) {
      if (k === 8) c = must(addFieldset(c, owner, plate, 'More', make))
      const set = fieldsetsOnFeature(c, plate).at(-1)!
      c = must(addField(c, set.id, prop, make))
    }
    c = withField(c, { feature: 'point', target: 'plate', i: 3 }, 'y').c
    c = withField(c, { feature: 'edge', target: 'plate', i: 2 }, 'offset').c
    c = withField(c, { feature: 'object', target: 'oN', i: 0 }, 'rotation').c
    let seed = 7
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    for (let k = 0; k < 60; k++) {
      const values: Values = Object.fromEntries(c.ranges.map(r => [r.id, r.min - (r.max - r.min) * 0.2 + next() * (r.max - r.min) * 1.4]))
      const solved = solve(c, values)
      for (const sh of Object.values(solved.shapes)) { expect(sh.d).not.toMatch(/NaN|undefined|Infinity/); expect(Number.isFinite(sh.fade)).toBe(true) }
    }
  })
})

describe('what the sliders do to the paint', () => {
  // the most colourful default colour of a slot (a hue means nothing on a black or a gray)
  const first = (c: ModelContent, slot: string) => [...c.slots!.find(s => s.id === slot)!.colours].sort((a, b) => hexHsl(b.hex)[1] - hexHsl(a.hex)[1])[0].id
  const skin = (c: ModelContent): Colouring => ({ palette: paletteOf(c), choices: { k_skin: { src: 'colour', id: first(c, 'k_skin') }, k_hair: { src: 'colour', id: first(c, 'k_hair') } } as SlotChoices })
  const layer = (c: ModelContent, values: Values, id = 'plate') => paintLayer(c, { ...skin(c), values }, shape(c, id))
  const hsl = (hex: string) => hexHsl(hex)

  it('shifts the hue, the saturation and the lightness of a colour, and leaves it alone at rest', () => {
    const h = withField(nosed(), plate, 'fillHue'), s = withField(h.c, plate, 'fillSat'), l = withField(s.c, plate, 'fillLight')
    const c = l.c
    const base = layer(c, {}).fill
    expect(base).toBe(paintLayer(nosed(), skin(nosed()), shape(nosed(), 'plate')).fill)
    near((hsl(layer(c, { [h.id]: 60 }).fill)[0] - hsl(base)[0] + 360) % 360, 60, 0)
    expect(hsl(layer(c, { [s.id]: -30 }).fill)[1]).toBeLessThan(hsl(base)[1])
    const slot = c.slots!.find(x => x.id === 'k_skin')!
    expect(hsl(layer(c, { [l.id]: 50 }).fill)[2]).toBeGreaterThan(hsl(base)[2])
    expect(hsl(layer(c, { [l.id]: 50 }).fill)[2]).toBeLessThanOrEqual(Math.max(slot.lMax, hsl(base)[2]) + 0.6)    // held inside the slot's brightness range
    expect(layer(c, { [h.id]: 60 }, 'dot').fill).toBe(layer(c, {}, 'dot').fill)                                    // only the shape the field is bound to
  })

  it('shifts every shape of an object, and a twin follows its original', () => {
    const o = withField(nosed(), { feature: 'object', target: 'oN', i: 0 }, 'fillHue')
    const dot = layer(o.c, {}, 'dot').fill
    expect(layer(o.c, { [o.id]: 90 }, 'dot').fill).not.toBe(dot)
    expect(layer(o.c, { [o.id]: 90 }, 'fringe').fill).toBe(layer(o.c, {}, 'fringe').fill)
    let c = must(makeTwin(nosed(), 'shape', 'plate', make))
    const twin = c.shapes.find(s => s.mirrorOf === 'plate')!
    const { c: withIt, id } = withField(c, plate, 'fillHue')
    c = withIt
    expect(layer(c, { [id]: 90 }, twin.id).fill).toBe(layer(c, { [id]: 90 }).fill)
    expect(layer(c, { [id]: 90 }, twin.id).fill).not.toBe(layer(c, {}, twin.id).fill)
  })

  it('shapes the gradient: how far it reaches, how far it blends, its direction and the shift of its second colour', () => {
    const graded = must(setGradient(nosed(), 'plate', { dir: 'down', to: 'k_hair' }))
    const reach = withField(graded, plate, 'gradReach'), blend = withField(reach.c, plate, 'gradBlend'), dir = withField(blend.c, plate, 'gradDir')
    const hue = withField(dir.c, plate, 'gradHue')
    const c = hue.c
    const plain = layer(nosed(), {}).gradient
    expect(plain).toBeNull()
    const rest = layer(c, {}).gradient!
    expect(rest).toEqual({ dir: 'down', end: rest.end })          // nothing extra is said at rest
    expect(layer(c, { [reach.id]: 50 }).gradient).toMatchObject({ reach: 50 })
    expect(layer(c, { [reach.id]: 150 }).gradient).toMatchObject({ reach: 150 })
    expect(layer(c, { [dir.id]: 45 }).gradient).toMatchObject({ angle: 45 })
    expect(layer(c, { [blend.id]: 0 }).gradient!.end).toBe(layer(c, {}).fill)       // none of the second colour: the colour alone
    const half = hsl(layer(c, { [blend.id]: 50 }).gradient!.end), full = hsl(rest.end), first = hsl(layer(c, {}).fill)
    expect(Math.abs(half[2] - first[2])).toBeLessThanOrEqual(Math.abs(full[2] - first[2]) + 0.6)
    expect(layer(c, { [hue.id]: 90 }).gradient!.end).not.toBe(rest.end)
  })

  it('leaves a shape with no gradient, and a radial gradient\'s direction, alone', () => {
    const plain = withField(nosed(), plate, 'gradReach')
    expect(layer(plain.c, { [plain.id]: 50 }).gradient).toBeNull()
    const radial = withField(must(setGradient(nosed(), 'plate', { dir: 'radial', to: null })), plate, 'gradDir')
    expect(layer(radial.c, { [radial.id]: 45 }).gradient!.angle).toBeUndefined()
  })

  it('turns the axis of a linear gradient and gives the stops of a reach', () => {
    expect(gradientAxis('down')).toEqual({ x1: 0, y1: 0, x2: 0, y2: 1 })
    const turned = gradientAxis('down', 90)
    near(turned.x1, 1); near(turned.y1, 0.5, 6); near(turned.x2, 0); near(turned.y2, 0.5, 6)
    expect(gradientStops('#000000', '#ffffff')).toEqual([{ offset: 0, colour: '#000000' }, { offset: 1, colour: '#ffffff' }])
    expect(gradientStops('#000000', '#ffffff', 50)).toEqual([{ offset: 0, colour: '#000000' }, { offset: 0.5, colour: '#ffffff' }, { offset: 1, colour: '#ffffff' }])
    const far = gradientStops('#000000', '#ffffff', 200)
    expect(far.map(s => s.offset)).toEqual([0, 1]); expect(hexHsl(far[1].colour)[2]).toBeCloseTo(50, 0)         // only half way there at the far side
    expect(gradientStops('#000000', '#ffffff', 0).map(s => s.offset)).toEqual([0, 0, 1])
  })

  it('carries the reach and the angle into the definitions of the drawing, and only when they are not at rest', () => {
    const graded = must(setGradient(nosed(), 'plate', { dir: 'down', to: 'k_hair' }))
    const reach = withField(graded, plate, 'gradReach')
    const defs = (values: Values) => paintDefs(paintShapes(reach.c, solveAtRest(reach.c), { ...skin(reach.c), values }), 'x')
    expect(defs({})[0]).toMatchObject({ kind: 'gradient', dir: 'down' }); expect('reach' in defs({})[0]).toBe(false)
    expect(defs({ [reach.id]: 60 })[0]).toMatchObject({ kind: 'gradient', reach: 60 })
  })
})

describe('what a fieldset waits on', () => {
  it('offers an object\'s or a group\'s fieldset always, and a preset\'s only while the preset is on', () => {
    let c = nosed()
    const saved = savePreset({ ...c, ranges: [{ id: 'r_s', name: 'S', scope: null, min: 0, rest: 0, max: 100, unit: '', show: true, rand: null, drives: [] }] }, { ...restState(c), values: { r_s: 50 } }, 'Elder', 'Age', make)
    c = must(saved)
    const preset = c.presets![0]
    const forPreset = must(addFieldset(c, { kind: 'preset', id: preset.id }, plate, 'Elder plate', make))
    const forObject = must(addFieldset(forPreset, owner, plate, 'Plate', make))
    const [byPreset, byObject] = forObject.fieldsets!
    expect(waitsOn(forObject, byPreset)).toMatchObject({ id: preset.id }); expect(waitsOn(forObject, byObject)).toBeUndefined()
    expect(isOffered(forObject, restState(forObject), byObject)).toBe(true)
    expect(isOffered(forObject, restState(forObject), byPreset)).toBe(false)
    expect(isOffered(forObject, applyPreset(forObject, restState(forObject), preset), byPreset)).toBe(true)
  })
})

describe('cascades', () => {
  it('goes with its owner or its feature: the shape, the object, the group, the preset or the slider', () => {
    const a = withField(nosed(), plate, 'width')
    expect(removeShape(a.c, 'plate')).toMatchObject({ fieldsets: [], ranges: [] })
    expect(removeShape(a.c, 'dot').fieldsets).toHaveLength(1)
    expect(removeObject(a.c, 'oN')).toMatchObject({ fieldsets: [], ranges: [] })
    expect(removeObject(a.c, 'oH').fieldsets).toHaveLength(1)
    expect(removeGroup(a.c, 'gH')).toMatchObject({ fieldsets: [], ranges: [] })
    const asGroup = { ...a.c, fieldsets: a.c.fieldsets!.map(f => ({ ...f, ownerKind: 'group' as const, owner: 'gH' })) }
    expect(removeObject(asGroup, 'oN')).toMatchObject({ fieldsets: [], ranges: [] })                      // bound to a shape that went with its object
    expect(removeObject(asGroup, 'oH').fieldsets).toHaveLength(1)
    const o = withField(nosed(), { feature: 'object', target: 'oH', i: 0 }, 'opacity')
    expect(removeObject(o.c, 'oH').fieldsets).toEqual([])
    // a slider that is deleted leaves the fieldset, which keeps its other fields
    const b = withField(a.c, plate, 'height')
    const gone = must(removeRange(b.c, a.id))
    expect(gone.fieldsets![0].ranges).toEqual([b.id])
  })

  it('goes with the preset that owns it', () => {
    let c = must(savePreset(nosed(), restState(nosed()), 'Elder', 'Age', make))
    const preset = c.presets![0]
    c = must(addFieldset(c, { kind: 'preset', id: preset.id }, plate, '', make))
    c = must(addField(c, c.fieldsets![0].id, 'width', make))
    expect(deletePreset(c, preset.id)).toMatchObject({ fieldsets: [], ranges: [] })
  })

  it('also takes the values presets and group states set for the deleted sliders', () => {
    const a = withField(nosed(), plate, 'width')
    const preset = must(savePreset(a.c, { ...restState(a.c), values: { [a.id]: 140 } }, 'Wide', 'Build', make))
    expect(preset.presets![0].values).toEqual({ [a.id]: 140 })
    expect(removeFieldset(preset, a.c.fieldsets![0].id).presets![0].values).toEqual({})
  })
})

describe('what Publish says', () => {
  const faults = (c: ModelContent) => publishFaults(c).filter(f => /ieldset|Slider/.test(f))
  it('says nothing of a whole fieldset', () => {
    expect(faults(withField(nosed(), plate, 'width').c)).toEqual([])
  })
  it('names a slider that changes something that is not there, and a fieldset whose owner or feature is gone', () => {
    const a = withField(nosed(), plate, 'width')
    const gone = (patch: Partial<ModelFieldset>) => ({ ...a.c, fieldsets: a.c.fieldsets!.map(f => ({ ...f, ...patch })) })
    expect(faults(gone({ owner: 'x' }))).toContain('Fieldset Shape Plate belongs to something that does not exist.')
    expect(faults(gone({ target: 'x' }))).toContain('Fieldset Shape Plate is bound to a shape that does not exist.')
    expect(faults(gone({ feature: 'object', target: 'x' }))).toContain('Fieldset Shape Plate is bound to an object that does not exist.')
    expect(faults(gone({ feature: 'point', i: 9 }))).toContain('Fieldset Shape Plate is bound to a point that does not exist.')
    expect(faults(gone({ ranges: [a.id, 'r_x'] }))).toContain('Fieldset Shape Plate lists a slider that does not exist.')
    expect(faults(gone({ feature: 'edge', i: 1 }))).toContain('Slider Width of fieldset Shape Plate does not change a property of its feature.')
    const noShape = { ...a.c, ranges: a.c.ranges.map(r => ({ ...r, drives: r.drives.map(d => ({ ...d, shape: 'x' })) })) }
    expect(faults(noShape)).toContain('Slider Width changes a property of a shape that does not exist.')
    const noPoint = withField(nosed(), { feature: 'point', target: 'plate', i: 3 }, 'x')
    const fewer = { ...noPoint.c, shapes: noPoint.c.shapes.map(s => (s.id === 'plate' ? { ...s, pts: s.pts.slice(0, 3) } : s)) }
    expect(faults(fewer)).toContain('Slider Position across changes a point of Plate that is no longer there.')
  })
})

describe('what a save keeps', () => {
  it('holds the amounts of a prop drive to what its property allows and drops one that names no property of its feature', () => {
    const a = withField(nosed(), plate, 'opacity')
    const wild = { ...a.c, ranges: a.c.ranges.map(r => ({ ...r, drives: [...r.drives.map(d => ({ ...d, atMin: -50, atMax: 900 })), { ...r.drives[0], prop: 'offset' }, { ...r.drives[0], shape: null }, { ...r.drives[0], feature: 'dial' as never }] })) }
    const kept = normalizeContent(wild).ranges[0].drives
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ prop: 'opacity', atMin: 0, atMax: 100 })
  })
  it('cleans a fieldset the way the server does: the kinds, the number, one entry per slider, and none without an owner or a target', () => {
    const a = withField(nosed(), plate, 'width')
    const messy = { ...a.c, fieldsets: [
      { ...a.c.fieldsets![0], ownerKind: 'robot' as never, feature: 'dial' as never, i: 5, ranges: [a.id, a.id], name: ` ${'x'.repeat(60)}` },
      { ...a.c.fieldsets![0], id: 'fs_x', owner: '' },
      { ...a.c.fieldsets![0], id: 'fs_y', target: '' },
      a.c.fieldsets![0],
    ] }
    const out = normalizeContent(messy).fieldsets!
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ ownerKind: 'object', feature: 'shape', i: 0, ranges: [a.id] })
    expect(out[0].name).toHaveLength(40)
  })
})

describe('the limits', () => {
  it('say how many fieldsets and fields a model has once it is past the warning', () => {
    const c = nosed()
    const sets = Array.from({ length: LIMITS.fieldsetsWarn + 1 }, (_, i): ModelFieldset => ({ id: `f${i}`, name: `F${i}`, ownerKind: 'object', owner: 'oN', feature: 'shape', target: 'plate', i: 0, ranges: i === 0 ? Array.from({ length: LIMITS.fieldsWarn + 1 }, (_, k) => `r${k}`) : [] }))
    const notes = limitNotes({ ...c, fieldsets: sets }).map(x => x.text)
    expect(notes).toContain('The model has 13 fieldsets: the warning starts above 12.')
    expect(notes).toContain('F0 has 7 fields: the warning starts above 6.')
  })
})

describe('what the Check panel says', () => {
  const says = (c: ModelContent) => fieldCheck(c).map(l => l.text)
  it('says nothing of a field that does something', () => {
    expect(says(withField(nosed(), plate, 'width').c)).toEqual([])
  })
  it('says a gradient field of a shape with no gradient has no effect, and a radial gradient has no direction', () => {
    const plain = withField(nosed(), plate, 'gradReach').c
    expect(says(plain)).toEqual(['Field Gradient reach changes the gradient of Plate, which has none: it has no effect.'])
    const graded = must(setGradient(nosed(), 'plate', { dir: 'down', to: null }))
    expect(says(withField(graded, plate, 'gradReach').c)).toEqual([])
    const radial = must(setGradient(nosed(), 'plate', { dir: 'radial', to: null }))
    expect(says(withField(radial, plate, 'gradDir').c)).toEqual(['Field Gradient direction turns the direction of the gradient of Plate, which is radial: it has no effect.'])
    const object = withField(graded, { feature: 'object', target: 'oN', i: 0 }, 'gradBlend').c
    expect(says(object)).toEqual([])                       // one shape of the object has a gradient
  })
  it('says a field whose ends are the amount at rest changes nothing', () => {
    const a = withField(nosed(), plate, 'width')
    const dead = { ...a.c, ranges: a.c.ranges.map(r => ({ ...r, drives: r.drives.map(d => ({ ...d, atMin: 100, atMax: 100 })) })) }
    expect(says(dead)).toEqual(['Field Width changes nothing: width is the same at both ends of the slider.'])
  })
})
