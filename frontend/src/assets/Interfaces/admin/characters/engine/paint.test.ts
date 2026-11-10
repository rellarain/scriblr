import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, publishFaults, removeShape, sameContent, starterContent } from '../modelContent'
import { addMember, detachMember, makeClass } from './classEdit'
import {
  bakedPaint, hexHsl, paintLayer, paintOf, paintOrigin, paletteOf, removeSlot, resolveColour, slotById, toneHex, toneShift, type Colouring, type SlotChoices,
} from './colour'
import { newShape } from './edit'
import { addAxis, addForm, hideInForm, setLook } from './formEdit'
import { formKey } from './forms'
import { LIMITS, limitNotes, shadingCount } from './limits'
import { MASK_BOX, drawable, paintAttrs, paintDefs, paintShapes } from './paint'
import { isUsed, paintLocked, setBlend, setClip, setDerive, setGradient, setHelper, setShadeKind, setTone, stepTint, toggleCut } from './paintEdit'
import { breakPair, makeTwin } from './pairEdit'
import { paintCheck } from './rigCheck'
import { solve, solveAtRest } from './rig'
import type { Edit } from './rigEdit'
import { addShading, edgeFacing } from './shadeEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
let n = 0
const make = (prefix: string) => `${prefix}_${++n}`
const shape = (c: ModelContent, id: string): ModelShape => c.shapes.find(s => s.id === id)!

// A head with a skull (Skin), a cheek and a hole (a helper) in one object, an eye in another, in one group.
function head(): ModelContent {
  let c = starterContent('Adult')
  c = addGroup(c, newGroup('gH', 'Head'))
  c = addObject(c, 'gH', { id: 'oS', name: 'Skull', layer: 'body', shapes: [] })
  c = addShape(c, 'oS', { ...newShape('skull', 'Skull', 'square', box(60, 20, 80, 80)), slot: 'k_skin' })
  c = addShape(c, 'oS', { ...newShape('cheek', 'Cheek', 'square', box(70, 50, 30, 30)), slot: 'k_skin' })
  c = addShape(c, 'oS', { ...newShape('hole', 'Hole', 'square', box(95, 40, 20, 20)), slot: 'k_skin' })
  c = addObject(c, 'gH', { id: 'oE', name: 'Eye', layer: 'body', shapes: [] })
  c = addShape(c, 'oE', { ...newShape('iris', 'Iris', 'square', box(80, 45, 10, 10)), slot: 'k_eye' })
  return c
}
const palette = (c: ModelContent) => paletteOf(c)
const colouringOf = (c: ModelContent, choices: SlotChoices = {}): Colouring => ({ palette: palette(c), choices })
const lightness = (hex: string) => hexHsl(hex)[2]

describe('tone maths', () => {
  const base = '#c08060'
  it('makes a shadow darker, a highlight lighter and a mid tone something between', () => {
    expect(lightness(toneHex(base, 'shadow', 0.3))).toBeLessThan(lightness(toneHex(base, 'mid', 0.3)))
    expect(lightness(toneHex(base, 'mid', 0.3))).toBeLessThan(lightness(base))
    expect(lightness(toneHex(base, 'highlight', 0.3))).toBeGreaterThan(lightness(base))
    expect(toneHex(base, 'highlight', 0)).toBe(base)
  })
  it('steps a colour lighter by 9 and darker by 12, held to 2..98, and leaves it alone with no step', () => {
    const l = lightness('#808080')
    expect(lightness(toneShift('#808080', 1))).toBeCloseTo(l + 9, 0)
    expect(lightness(toneShift('#808080', -1))).toBeCloseTo(l - 12, 0)
    expect(lightness(toneShift('#808080', 2))).toBeCloseTo(l + 18, 0)
    expect(lightness(toneShift('#ffffff', 2))).toBeCloseTo(98, 0)
    expect(lightness(toneShift('#000000', -2))).toBeCloseTo(2, 0)
    expect(toneShift('#808080', 0)).toBe('#808080')
  })
})

describe('what a shape is painted with', () => {
  const c = head(), skin = slotById(c, 'k_skin')!, hair = slotById(c, 'k_hair')!
  const colouring = colouringOf(c, { k_skin: { src: 'colour', id: skin.colours[0].id }, k_hair: { src: 'colour', id: hair.colours[0].id } })
  const plain = paintLayer(c, colouring, shape(c, 'skull'))

  it('is the plain colour, with no effects, until some are set (and paintOf says the same fill)', () => {
    expect(plain).toMatchObject({ gradient: null, blend: null, clip: null, cuts: [], shading: false, helper: false })
    expect(plain.fill).toBe(resolveColour(skin, colouring.choices.k_skin, palette(c)).css)
    expect(paintOf(c, colouring, shape(c, 'skull'))).toEqual({ fill: plain.fill, opacity: plain.opacity })
  })
  it('steps lighter and darker with the tone, and leaves the opacity alone', () => {
    const lighter = paintLayer(must(setTone(c, 'skull', 1)), colouring, shape(must(setTone(c, 'skull', 1)), 'skull'))
    const darker = paintLayer(must(setTone(c, 'skull', -1)), colouring, shape(must(setTone(c, 'skull', -1)), 'skull'))
    expect(lightness(lighter.fill)).toBeGreaterThan(lightness(plain.fill))
    expect(lightness(darker.fill)).toBeLessThan(lightness(plain.fill))
    expect(lighter.opacity).toBe(plain.opacity)
  })
  it('makes a derived tone of the colour (a brow is a shadow of the hair)', () => {
    const d = must(setDerive(c, 'skull', 'shadow'))
    expect(paintLayer(d, colouring, shape(d, 'skull')).fill).toBe(toneHex(plain.fill, 'shadow', 0.12))
    const hi = must(setDerive(c, 'skull', 'highlight'))
    expect(paintLayer(hi, colouring, shape(hi, 'skull')).fill).toBe(toneHex(plain.fill, 'highlight', 0.1))
    const off = must(setDerive(d, 'skull', null))
    expect(paintLayer(off, colouring, shape(off, 'skull')).fill).toBe(plain.fill)
  })
  it('makes a shading shape a tone of its slot colour at full strength, and ignores its tone and gradient', () => {
    const s = { ...shape(c, 'cheek'), shade: { kind: 'shadow' as const, t: 0.3 }, tone: 2, grad: { dir: 'down' as const, to: null } }
    const layer = paintLayer(c, colouring, s)
    expect(layer.shading).toBe(true)
    expect(layer.fill).toBe(toneHex(plain.fill, 'shadow', 0.3))
    expect(layer.gradient).toBeNull()
    expect(layer.opacity).toBe(plain.opacity)
  })
  it('runs a gradient to another slot\'s colour as the test character has chosen it, else to a darker tone of its own', () => {
    const toHair = must(setGradient(c, 'skull', { dir: 'left', to: 'k_hair' }))
    expect(paintLayer(toHair, colouring, shape(toHair, 'skull')).gradient).toEqual({ dir: 'left', end: resolveColour(hair, colouring.choices.k_hair, palette(c)).css })
    const own = must(setGradient(c, 'skull', { dir: 'radial', to: null }))
    const g = paintLayer(own, colouring, shape(own, 'skull')).gradient!
    expect(g.dir).toBe('radial')
    expect(g.end).toBe(toneShift(plain.fill, -1))
    // a slot nothing is chosen for is a gray at its resting brightness: the gradient still has an end
    expect(paintLayer(toHair, colouringOf(c), shape(toHair, 'skull')).gradient!.end).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('carries the blend mode, the helper flag, the clip and the cut-outs', () => {
    let d = must(setBlend(c, 'cheek', 'multiply'))
    d = must(setHelper(d, 'cheek', true)); d = must(setClip(d, 'cheek', 'skull')); d = must(toggleCut(d, 'cheek', 'hole'))
    expect(paintLayer(d, colouring, shape(d, 'cheek'))).toMatchObject({ blend: 'multiply', helper: true, clip: 'skull', cuts: ['hole'] })
  })
})

describe('where paint comes from', () => {
  // a pair of arms: an arm, a sleeve cut out of it, and the same on the other side
  function pair() {
    let c = head()
    c = must(setClip(c, 'cheek', 'skull')); c = must(toggleCut(c, 'cheek', 'hole'))
    c = must(setTone(c, 'cheek', 1)); c = must(setBlend(c, 'cheek', 'screen'))
    c = must(makeTwin(c, 'object', 'oS', make))
    return c
  }
  const twinOf = (c: ModelContent, id: string) => c.shapes.find(s => s.mirrorOf === id)!

  it('lets a twin take every paint field from its original, with what it clips to and is cut by turned into their twins', () => {
    const c = pair(), twin = twinOf(c, 'cheek')
    expect(paintOrigin(c, twin).shape.id).toBe('cheek')
    const layer = paintLayer(c, colouringOf(c), twin)
    expect(layer).toMatchObject({ blend: 'screen', clip: twinOf(c, 'skull').id, cuts: [twinOf(c, 'hole').id] })
    expect(layer.fill).toBe(paintLayer(c, colouringOf(c), shape(c, 'cheek')).fill)
  })
  it('keeps a twin\'s own fields once it has a slot of its own', () => {
    const c = pair(), twin = twinOf(c, 'cheek')
    const own = { ...twin, slot: 'k_hair' }
    expect(paintOrigin(c, own).shape.id).toBe(twin.id)
    expect(paintLayer(c, colouringOf(c), own)).toMatchObject({ blend: null, clip: null, cuts: [] })
  })
  it('refuses to change the paint of a shape that takes it from another, and says how to get out', () => {
    const c = pair(), twin = twinOf(c, 'cheek')
    expect(paintLocked(c, twin)).toMatch(/painted like Cheek: change that original instead, or give .* a colour slot of its own first/)
    expect(refused(setTone(c, twin.id, 1))).toMatch(/painted like/)
    expect(paintLocked(c, shape(c, 'cheek'))).toBeNull()
  })

  it('lets the shape of a class member take the template shape\'s paint, with references turned into the member\'s own shapes', () => {
    let c = head()
    c = must(setClip(c, 'cheek', 'skull')); c = must(toggleCut(c, 'cheek', 'hole')); c = must(setTone(c, 'cheek', -1))
    const made = makeClass(c, 'oS', 'Skull class', false, make)
    c = must(made)
    const added = addMember(c, made.classId!, make)
    c = must(added)
    const member = c.objects.find(o => o.id === added.memberId)!
    const copyOf = (id: string) => member.shapes.map(sid => shape(c, sid)).find(s => s.copyOf === id)!
    const mine = copyOf('cheek')
    expect(paintOrigin(c, mine).shape.id).toBe('cheek')
    expect(paintLayer(c, colouringOf(c), mine)).toMatchObject({ clip: copyOf('skull').id, cuts: [copyOf('hole').id] })
    // detaching bakes what it followed: the member keeps its look
    const detached = must(detachMember(c, member.id))
    const baked = shape(detached, mine.id)
    expect(baked.copyOf).toBeNull()
    expect(baked).toMatchObject({ slot: 'k_skin', tone: -1, clip: copyOf('skull').id, cut: [copyOf('hole').id] })
    expect(paintLayer(detached, colouringOf(detached), baked).fill).toBe(paintLayer(c, colouringOf(c), mine).fill)
  })
  it('bakes the paint a twin had when the pair is broken', () => {
    const c = pair(), twin = twinOf(c, 'cheek')
    const broken = shape(must(breakPair(c, 'shape', twin.id)), twin.id)
    expect(broken.mirrorOf).toBeNull()
    expect(broken).toMatchObject({ slot: 'k_skin', tone: 1, blend: 'screen', clip: twinOf(c, 'skull').id, cut: [twinOf(c, 'hole').id] })
    expect(bakedPaint(c, shape(c, 'cheek'))).toMatchObject({ slot: 'k_skin', tone: 1, clip: 'skull' })
  })
})

describe('what a form does to the paint of a shape', () => {
  function formed() {
    let c = head()
    const axis = addAxis(c, 'oE', 'Eye colour', make)
    c = must(axis)
    const second = addForm(c, 'oE', axis.axisId!, {}, 'Dark', make)
    c = must(second)
    return { c, axisId: axis.axisId!, plain: axis.formId!, dark: second.formId! }
  }
  it('changes the slot, the fixed gray or the tone of a shape, only while the form is chosen', () => {
    const { c, axisId, plain, dark } = formed()
    const looked = must(setLook(c, 'oE', axisId, dark, 'iris', { slot: 'k_hair', gray: null, tone: -1 }))
    const choices: SlotChoices = {}
    const withForm = (formId: string): Colouring => ({ palette: palette(looked), choices, forms: { [formKey('oE', axisId)]: formId } })
    const at = (formId: string) => paintLayer(looked, withForm(formId), shape(looked, 'iris')).fill
    expect(at(plain)).toBe(paintLayer(looked, colouringOf(looked), shape(looked, 'iris')).fill)
    const hair = slotById(looked, 'k_hair')!
    expect(at(dark)).toBe(toneShift(resolveColour(hair, undefined, palette(looked)).css, -1))
    const gray = must(setLook(looked, 'oE', axisId, dark, 'iris', { slot: null, gray: 100, tone: null }))
    expect(paintLayer(gray, withForm(dark), shape(gray, 'iris')).fill).toBe('#ffffff')
  })
  it('takes the look away when it changes nothing, lets a slot win over a gray, and refuses what cannot be', () => {
    const { c, axisId, dark } = formed()
    const a = must(setLook(c, 'oE', axisId, dark, 'iris', { slot: 'k_hair', gray: 50, tone: null }))
    expect(a.objects.find(o => o.id === 'oE')!.axes![0].options.find(f => f.id === dark)!.looks).toEqual([{ shape: 'iris', slot: 'k_hair', gray: null, tone: null, round: null }])
    const gone = must(setLook(a, 'oE', axisId, dark, 'iris', null))
    expect(gone.objects.find(o => o.id === 'oE')!.axes![0].options.find(f => f.id === dark)!.looks).toEqual([])
    expect(refused(setLook(c, 'oE', axisId, dark, 'skull', { slot: null, gray: null, tone: 1 }))).toMatch(/not in the object/)
    expect(refused(setLook(c, 'oE', axisId, dark, 'iris', { slot: 'k_none', gray: null, tone: null }))).toMatch(/no such colour slot/)
    const twinned = must(makeTwin(c, 'object', 'oE', make))
    const twinShape = twinned.shapes.find(s => s.mirrorOf === 'iris')!
    const twinObject = twinned.objects.find(o => o.mirrorOf === 'oE')!
    expect(twinObject.shapes).toContain(twinShape.id)
    expect(refused(setLook(twinned, 'oE', axisId, dark, twinShape.id, { slot: null, gray: null, tone: 1 }))).toMatch(/not in the object|twin/)
  })
  it('gives a class member\'s shape the template\'s look under the member\'s own choice of form', () => {
    let c = head()
    const axis = addAxis(c, 'oE', 'Eye colour', make); c = must(axis)
    const dark = addForm(c, 'oE', axis.axisId!, {}, 'Dark', make); c = must(dark)
    c = must(setLook(c, 'oE', axis.axisId!, dark.formId!, 'iris', { slot: 'k_hair', gray: null, tone: null }))
    const k = makeClass(c, 'oE', 'Eyes', false, make); c = must(k)
    const m1 = addMember(c, k.classId!, make); c = must(m1)
    const m2 = addMember(c, k.classId!, make); c = must(m2)
    const irisOf = (memberId: string) => c.objects.find(o => o.id === memberId)!.shapes.map(sid => shape(c, sid)).find(s => s.copyOf === 'iris')!
    const forms = { [formKey(m1.memberId!, axis.axisId!)]: dark.formId! }
    const hairFill = paintLayer(c, { palette: palette(c), choices: {}, forms }, irisOf(m1.memberId!)).fill
    expect(hairFill).toBe(resolveColour(slotById(c, 'k_hair')!, undefined, palette(c)).css)
    // the other member chose nothing: it keeps the template's eye colour
    expect(paintLayer(c, { palette: palette(c), choices: {}, forms }, irisOf(m2.memberId!)).fill).toBe(resolveColour(slotById(c, 'k_eye')!, undefined, palette(c)).css)
  })
})

describe('drawing the paint', () => {
  it('lists every visible shape in draw order with its paint, and leaves helpers and shapes with nothing to lie in out of what is drawn', () => {
    let c = head()
    c = must(setHelper(c, 'hole', true)); c = must(setClip(c, 'cheek', 'skull')); c = must(toggleCut(c, 'cheek', 'hole')); c = must(setBlend(c, 'cheek', 'multiply'))
    c = must(setGradient(c, 'skull', { dir: 'down', to: 'k_hair' }))
    const solved = solveAtRest(c), items = paintShapes(c, solved, colouringOf(c))
    expect(items.map(i => i.id)).toEqual(solved.order)
    const cheek = items.find(i => i.id === 'cheek')!
    expect(cheek).toMatchObject({ clipD: solved.shapes.skull.d, cutDs: [solved.shapes.hole.d], blend: 'multiply', blank: false })
    expect(items.find(i => i.id === 'hole')!.helper).toBe(true)
    expect(drawable(items).map(i => i.id)).not.toContain('hole')
    const defs = paintDefs(items, 'p1'), attrs = paintAttrs(cheek, 'p1')
    expect(defs.map(d => d.id)).toEqual(expect.arrayContaining(['p1-g-skull', 'p1-k-cheek', 'p1-m-cheek']))
    expect(attrs).toMatchObject({ fill: cheek.fill, clip: 'url(#p1-k-cheek)', mask: 'url(#p1-m-cheek)', blend: 'multiply' })
    expect(paintAttrs(items.find(i => i.id === 'skull')!, 'p1').fill).toBe('url(#p1-g-skull)')
    // a mask is a white rectangle and a black cutter, over a region wide enough for any model
    expect(MASK_BOX.w).toBeGreaterThan(1000)
    const text = JSON.stringify([defs, items])
    expect(text).not.toMatch(/NaN|undefined/)
  })
  it('draws nothing for a shape clipped to a shape that a form hides', () => {
    let c = head()
    c = must(setClip(c, 'cheek', 'iris'))
    const axis = addAxis(c, 'oE', 'Shut', make); c = must(axis)
    const shut = addForm(c, 'oE', axis.axisId!, {}, 'Shut', make); c = must(shut)
    c = must(hideInForm(c, 'oE', axis.axisId!, shut.formId!, 'iris'))
    const shown = paintShapes(c, solve(c, {}, 'front', {}), colouringOf(c)).find(i => i.id === 'cheek')!
    expect(shown.blank).toBe(false)
    const hidden = paintShapes(c, solve(c, {}, 'front', { forms: { [formKey('oE', axis.axisId!)]: shut.formId! } }), colouringOf(c)).find(i => i.id === 'cheek')!
    expect(hidden.blank).toBe(true)
    expect(drawable([hidden])).toEqual([])
    expect(paintDefs([hidden], 'p')).toEqual([])
  })
  it('draws a gradient in each direction as a definition of its own', () => {
    let c = head()
    const dirs = ['down', 'up', 'left', 'right', 'radial'] as const
    const items = dirs.map(dir => paintShapes(must(setGradient(c, 'skull', { dir, to: null })), solveAtRest(c), colouringOf(c)).find(i => i.id === 'skull')!)
    const kinds = items.map(i => paintDefs([i], 'x')[0])
    expect(kinds.map(d => d.kind === 'gradient' && d.dir)).toEqual([...dirs])
    c = must(setGradient(c, 'skull', null))
    expect(paintDefs(paintShapes(c, solveAtRest(c), colouringOf(c)), 'x')).toEqual([])
  })
})

describe('shading shapes', () => {
  const shaded = (side: 'left' | 'right' | 'top' | 'bottom', kind: 'shadow' | 'mid' | 'highlight' = 'shadow') => {
    const c = head(), e = addShading(c, 'skull', kind, side, make)
    return { c, e, content: must(e), id: (e as { shapeId?: string }).shapeId! }
  }
  it('adds a band along the edge that faces the chosen side, locked to that edge', () => {
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const { c, content, id } = shaded(side)
      const band = shape(content, id), base = solveAtRest(content).shapes.skull
      expect(band.pts).toHaveLength(6)
      expect(band.pts.every(p => p.bind?.kind === 'edge' && p.bind.s === 'skull' && p.bind.e === band.pts[0].bind!.e)).toBe(true)
      expect(band.pts.map(p => p.bind!.o).sort((a, b) => a - b)[0]).toBeLessThan(0)   // part of it lies inside the shape
      expect(band.shade).toEqual({ kind: 'shadow', t: 0.12 })
      expect(band.slot).toBe('k_skin')
      expect(content.objects.find(o => o.id === 'oS')!.shapes).toContain(id)
      expect(shape(content, id).z).toBeGreaterThan(Math.max(...c.shapes.map(s => s.z)))
      const box = solveAtRest(content).shapes[id].box, centre = (b: { x: number; w: number; y: number; h: number }) => [b.x + b.w / 2, b.y + b.h / 2]
      const [bx, by] = centre(base.box), [sx, sy] = centre(box)
      if (side === 'left') expect(sx).toBeLessThan(bx)
      if (side === 'right') expect(sx).toBeGreaterThan(bx)
      if (side === 'top') expect(sy).toBeLessThan(by)
      if (side === 'bottom') expect(sy).toBeGreaterThan(by)
    }
  })
  it('keeps to the edge when the shape it lies on is changed', () => {
    const { content, id } = shaded('left')
    const before = solveAtRest(content).shapes[id].box
    const base = shape(content, 'skull')
    const moved = { ...content, shapes: content.shapes.map(s => (s.id === 'skull' ? { ...s, pts: s.pts.map(p => ({ ...p, x: p.x + 30 })) } : s)) }
    const after = solveAtRest(moved).shapes[id].box
    expect(base.pts.length).toBeGreaterThanOrEqual(3)
    expect(after.x).toBeCloseTo(before.x + 30, 0)
  })
  it('is painted as a tone of its slot, kept inside the base shapes of its object', () => {
    const { content, id } = shaded('left', 'highlight')
    const solved = solveAtRest(content)
    const item = paintShapes(content, solved, colouringOf(content)).find(i => i.id === id)!
    expect(item.shading).toBe(true)
    expect(item.compDs).toEqual(['skull', 'cheek', 'hole'].map(s => solved.shapes[s].d))   // not itself, not other objects' shapes
    expect(item.blank).toBe(false)
    expect(paintDefs([item], 'q').map(d => d.id)).toEqual(['q-c-' + id])
    expect(paintAttrs(item, 'q').comp).toBe(`url(#q-c-${id})`)
  })
  it('draws nothing when its object has no base shape left to lie on', () => {
    const { content, id } = shaded('left')
    const only = { ...content, shapes: content.shapes.map(s => (['skull', 'cheek', 'hole'].includes(s.id) ? { ...s, hide: true } : s)) }
    const item = paintShapes(only, solveAtRest(only), colouringOf(only)).find(i => i.id === id)!
    expect(item.blank).toBe(true)
  })
  it('changes its kind and amount, one step at a time, held to 0.02..0.8', () => {
    const { content, id } = shaded('right')
    const mid = must(setShadeKind(content, id, 'mid'))
    expect(shape(mid, id).shade).toEqual({ kind: 'mid', t: 0.12 })
    let t = mid
    for (let i = 0; i < 100; i++) t = must(stepTint(t, id, 'shade', 1))
    expect(shape(t, id).shade!.t).toBe(0.8)
    expect(shape(must(stepTint(mid, id, 'shade', 1)), id).shade!.t).toBe(0.13)
    expect(shape(must(stepTint(mid, id, 'shade', 1, true)), id).shade!.t).toBe(0.22)
    for (let i = 0; i < 100; i++) t = must(stepTint(t, id, 'shade', -1))
    expect(shape(t, id).shade!.t).toBe(0.02)
    expect(refused(setShadeKind(content, 'skull', 'mid'))).toMatch(/not a shading shape/)
    expect(refused(setGradient(content, id, { dir: 'down', to: null }))).toMatch(/one tone/)
  })
  it('refuses a twin, a shading shape, a shape with no outline of its own, and an eleventh band', () => {
    const c = must(makeTwin(head(), 'object', 'oS', make))
    const twin = c.shapes.find(s => s.mirrorOf === 'skull')!
    expect(refused(addShading(c, twin.id, 'shadow', 'left', make))).toMatch(/twin/)
    const { content, id } = shaded('left')
    expect(refused(addShading(content, id, 'shadow', 'left', make))).toMatch(/shading shape already/)
    expect(refused(addShading(head(), 'nothing', 'shadow', 'left', make))).toMatch(/no such shape/)
    let full = head()
    for (let i = 0; i < LIMITS.shadesMax; i++) full = must(addShading(full, 'skull', 'mid', 'left', make))
    expect(refused(addShading(full, 'skull', 'mid', 'left', make))).toMatch(/at most 10 shading shapes/)
    expect(limitNotes(full).some(x => /shading shapes: the limit is 10/.test(x.text))).toBe(true)
  })
  it('gives the twin of a shaded shape the twin of its shading, in the object of the twin, and does not count it', () => {
    const c = must(makeTwin(head(), 'object', 'oS', make)), e = addShading(c, 'skull', 'shadow', 'left', make), next = must(e)
    const twinObject = next.objects.find(o => o.mirrorOf === 'oS')!
    const twinBand = next.shapes.find(s => s.mirrorOf === e.shapeId)!
    expect(twinObject.shapes).toContain(twinBand.id)
    expect(shadingCount(next, 'oS')).toBe(1)
    expect(shadingCount(next, twinObject.id)).toBe(0)
    const item = paintShapes(next, solveAtRest(next), colouringOf(next)).find(i => i.id === twinBand.id)!
    expect(item).toMatchObject({ shading: true, blank: false })
    expect(item.compDs).toHaveLength(twinObject.shapes.length - 1)   // the twin side's own shapes
  })
  it('warns above eight shading shapes in an object', () => {
    let c = head()
    for (let i = 0; i < LIMITS.shadesWarn + 1; i++) c = must(addShading(c, 'skull', 'mid', 'top', make))
    const note = limitNotes(c).find(x => /shading shapes/.test(x.text))
    expect(note?.level).toBe('warn')
  })
  it('chooses the first of equally facing edges, and one edge for every side of a square', () => {
    const solved = solveAtRest(head()).shapes.skull
    const edges = (['left', 'right', 'top', 'bottom'] as const).map(side => edgeFacing(solved.pre, side))
    expect(new Set(edges).size).toBe(4)
  })
})

describe('changing the paint of one shape', () => {
  it('sets the tone, derived tone, blend, clip, cut-outs and helper flag, one at a time', () => {
    let c = head()
    c = must(setTone(c, 'cheek', 9))   // held to two steps
    expect(shape(c, 'cheek').tone).toBe(2)
    c = must(setDerive(c, 'cheek', 'mid'))
    expect(shape(c, 'cheek').derive).toEqual({ kind: 'mid', t: 0.12 })
    c = must(stepTint(c, 'cheek', 'derive', 1, true))
    expect(shape(c, 'cheek').derive!.t).toBe(0.22)
    expect(refused(stepTint(head(), 'cheek', 'derive', 1))).toMatch(/no derived tone/)
    c = must(setBlend(c, 'cheek', 'overlay')); c = must(setBlend(c, 'cheek', null))
    expect(shape(c, 'cheek').blend).toBeNull()
    c = must(setClip(c, 'cheek', 'skull')); expect(shape(c, 'cheek').clip).toBe('skull')
    c = must(toggleCut(c, 'cheek', 'hole')); expect(shape(c, 'cheek').cut).toEqual(['hole'])
    c = must(toggleCut(c, 'cheek', 'hole')); expect(shape(c, 'cheek').cut).toEqual([])
    c = must(setHelper(c, 'hole', true)); expect(isUsed(c, 'hole')).toBe(false)
    c = must(toggleCut(c, 'cheek', 'hole')); expect(isUsed(c, 'hole')).toBe(true)
  })
  it('refuses a clip or a cut-out to itself or to nothing, a gradient to a slot that is not there, and a ninth cut-out', () => {
    let c = head()
    expect(refused(setClip(c, 'cheek', 'cheek'))).toMatch(/itself/)
    expect(refused(setClip(c, 'cheek', 'nothing'))).toMatch(/no such shape/)
    expect(refused(toggleCut(c, 'cheek', 'cheek'))).toMatch(/itself/)
    expect(refused(setGradient(c, 'cheek', { dir: 'down', to: 'k_none' }))).toMatch(/no such colour slot/)
    for (let i = 0; i < LIMITS.cutsMax + 1; i++) c = addShape(c, 'oS', newShape(`x${i}`, `X${i}`, 'square', box(10, 10, 5, 5)))
    for (let i = 0; i < LIMITS.cutsMax; i++) c = must(toggleCut(c, 'cheek', `x${i}`))
    expect(refused(toggleCut(c, 'cheek', `x${LIMITS.cutsMax}`))).toMatch(/at most 8 cut-outs/)
  })
})

describe('the model with paint effects', () => {
  it('has publish faults in the server\'s words', () => {
    const c = head()
    const faults = (patch: Partial<ModelShape>, id = 'cheek') => publishFaults({ ...c, shapes: c.shapes.map(s => (s.id === id ? { ...s, ...patch } : s)) })
    expect(faults({ clip: 'nothing' })).toContain('Shape Cheek is clipped to a shape that does not exist.')
    expect(faults({ clip: 'cheek' })).toContain('Shape Cheek is clipped to itself.')
    expect(faults({ cut: ['nothing'] })).toContain('Shape Cheek is cut by a shape that does not exist.')
    expect(faults({ cut: ['cheek'] })).toContain('Shape Cheek is cut by itself.')
    expect(faults({ grad: { dir: 'down', to: 'k_none' } })).toContain('Shape Cheek has a gradient to a colour slot that does not exist.')
    expect(faults({ clip: 'skull', cut: ['hole'], grad: { dir: 'up', to: 'k_hair' } })).toEqual([])
  })
  it('has publish faults for forms that change the paint of what they should not', () => {
    let c = head()
    const axis = addAxis(c, 'oE', 'Colour', make); c = must(axis)
    const f = addForm(c, 'oE', axis.axisId!, {}, 'Dark', make); c = must(f)
    const withLooks = (looks: ModelContent['objects'][number]['axes']) => publishFaults({ ...c, objects: c.objects.map(o => (o.id === 'oE' ? { ...o, axes: looks } : o)) })
    const setLooks = (looks: Array<{ shape: string; slot: string | null; gray: number | null; tone: number | null }>) =>
      withLooks(c.objects.find(o => o.id === 'oE')!.axes!.map(a => ({ ...a, options: a.options.map(o => (o.id === f.formId ? { ...o, looks } : o)) })))
    expect(setLooks([{ shape: 'skull', slot: null, gray: null, tone: 1 }])).toContain('Form Dark of Eye changes the paint of a shape that is not in the object.')
    expect(setLooks([{ shape: 'iris', slot: 'k_none', gray: null, tone: null }])).toContain('Form Dark of Eye paints shape Iris from a colour slot that does not exist.')
    expect(setLooks([{ shape: 'iris', slot: 'k_hair', gray: null, tone: -1 }])).toEqual([])
  })
  it('refuses more than ten shading shapes in an object, not counting twins', () => {
    let c = head()
    for (let i = 0; i < LIMITS.shadesMax; i++) c = must(addShading(c, 'skull', 'mid', 'left', make))
    expect(publishFaults(c)).toEqual([])
    const extra = { ...shape(c, c.objects.find(o => o.id === 'oS')!.shapes.find(id => shape(c, id).shade)!), id: 'eleventh' }
    const over = addShape(c, 'oS', extra)
    expect(publishFaults(over)).toContain('Object Skull has more than 10 shading shapes.')
  })
  it('is saved as the server keeps it, so a model compares as unchanged after a save', () => {
    const c = head()
    const saved = normalizeContent(c)
    expect(shape(saved, 'cheek')).toMatchObject({ tone: 0, derive: null, shade: null, grad: null, blend: null, clip: null, cut: [], helper: false })
    expect(saved.objects.every(o => (o.axes ?? []).every(a => a.options.every(f => Array.isArray(f.looks))))).toBe(true)
    expect(sameContent(c, saved)).toBe(true)
    const odd = { ...c, shapes: c.shapes.map(s => (s.id === 'cheek' ? { ...s, tone: 9, derive: { kind: 'shadow' as const, t: 5 }, cut: ['a', 'a', 'b'] } : s)) }
    expect(shape(normalizeContent(odd), 'cheek')).toMatchObject({ tone: 2, derive: { kind: 'shadow', t: 0.8 }, cut: ['a', 'b'] })
  })
  it('lets go of what a deleted shape was used for, and of a deleted slot', () => {
    let c = head()
    c = must(setClip(c, 'cheek', 'skull')); c = must(toggleCut(c, 'cheek', 'hole')); c = must(setGradient(c, 'cheek', { dir: 'down', to: 'k_hair' }))
    const axis = addAxis(c, 'oS', 'Look', make); c = must(axis)
    const f = addForm(c, 'oS', axis.axisId!, {}, 'Alt', make); c = must(f)
    c = must(setLook(c, 'oS', axis.axisId!, f.formId!, 'hole', { slot: 'k_hair', gray: null, tone: 1 }))
    c = must(setLook(c, 'oS', axis.axisId!, f.formId!, 'skull', { slot: 'k_hair', gray: null, tone: null }))
    const lookIds = (x: ModelContent) => x.objects.find(o => o.id === 'oS')!.axes![0].options.find(o => o.id === f.formId)!.looks!.map(l => l.shape)
    const noSkull = removeShape(c, 'skull')
    expect(shape(noSkull, 'cheek').clip).toBeNull()
    expect(lookIds(noSkull)).toEqual(['hole'])
    const noHole = removeShape(c, 'hole')
    expect(shape(noHole, 'cheek').cut).toEqual([])
    const noHair = must(removeSlot(c, 'k_hair'))
    expect(shape(noHair, 'cheek').grad).toEqual({ dir: 'down', to: null })
    expect(noHair.objects.find(o => o.id === 'oS')!.axes![0].options.find(o => o.id === f.formId)!.looks).toEqual([{ shape: 'hole', slot: null, gray: null, tone: 1, round: null }])
  })
})

describe('the Check panel', () => {
  it('says which helper shapes nothing uses, and which shading has nothing to lie on', () => {
    let c = head()
    c = must(setHelper(c, 'hole', true))
    expect(paintCheck(c).map(l => l.text)).toEqual(['Hole is a helper shape, but nothing is clipped to it or cut by it: it is never drawn.'])
    c = must(toggleCut(c, 'cheek', 'hole'))
    expect(paintCheck(c)).toEqual([])
    // an object with only shading in it
    let lone = starterContent('Lone')
    lone = addGroup(lone, newGroup('g', 'G')); lone = addObject(lone, 'g', { id: 'o', name: 'Only', layer: 'body', shapes: [] })
    lone = addShape(lone, 'o', { ...newShape('band', 'Band', 'square', box(10, 10, 20, 20)), shade: { kind: 'shadow', t: 0.2 } })
    expect(paintCheck(lone).map(l => l.text)).toEqual(['Only has shading but no base shape for it to lie on: the shading is not drawn.'])
  })
})
