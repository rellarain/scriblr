import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, publishFaults, removeGroup, removeObject, removeShape, repairLooks, starterContent } from '../modelContent'
import { bakedPaint, paintLayer, paletteOf } from './colour'
import { newShape } from './edit'
import { addAxis, addForm, setLook } from './formEdit'
import { formKey } from './forms'
import { addField, addFieldset } from './fields'
import { inPolygon, roundCorners } from './geometry'
import { limitNotes, LIMITS } from './limits'
import { drawable, paintShapes } from './paint'
import { addPattern, patternOfMark, patternsOn, removePattern, renamePattern, toggleMark } from './patterns'
import { breakPair, makeTwin } from './pairEdit'
import { ROUND_MAX } from './props'
import { savePreset, restState } from './presets'
import { solve, solveAtRest, type Values } from './rig'
import { setRound, stepRound } from './paintEdit'
import type { Edit } from './rigEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
let n = 0
const make = (prefix: string) => `${prefix}_${++n}`
const shape = (c: ModelContent, id: string): ModelShape => c.shapes.find(s => s.id === id)!
const sharp = (x: number, y: number): ModelPoint => ({ x, y, m: 's', hi: null, ho: null })

// A Shirt object of a base (80 x 80) and two stripes (marks), and a Hair object, in one group.
function shirted(): ModelContent {
  let c = starterContent('Adult')
  c = addGroup(c, newGroup('gT', 'Torso'))
  c = addObject(c, 'gT', { id: 'oS', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oS', { ...newShape('stripe1', 'Stripe 1', 'square', box(50, 30, 100, 10)), slot: 'k_cloth', z: 30 })
  c = addShape(c, 'oS', { ...newShape('base', 'Base', 'square', box(60, 20, 80, 80)), slot: 'k_cloth' })
  c = addShape(c, 'oS', { ...newShape('stripe2', 'Stripe 2', 'square', box(50, 60, 100, 10)), slot: 'k_cloth' })
  c = addObject(c, 'gT', { id: 'oH', name: 'Hair', layer: 'hair', shapes: [] })
  c = addShape(c, 'oH', newShape('fringe', 'Fringe', 'square', box(60, 0, 80, 20)))
  return c
}
const colouring = (c: ModelContent, values: Values = {}) => ({ palette: paletteOf(c), choices: {}, values })
const withRound = (c: ModelContent, id: string, round: number): ModelContent => ({ ...c, shapes: c.shapes.map(s => (s.id === id ? { ...s, round } : s)) })

describe('rounding corners', () => {
  const square = [sharp(0, 0), sharp(40, 0), sharp(40, 40), sharp(0, 40)]
  it('replaces each sharp corner by two points and a curve, a radius along each side', () => {
    const out = roundCorners(square, true, 10)
    expect(out).toHaveLength(8)
    expect(out[0]).toMatchObject({ x: 0, y: 10, m: 'sc' })            // on the side before the first corner, 10 from it
    expect(out[1]).toMatchObject({ x: 10, y: 0, m: 'cs' })            // on the side after it
    for (const p of out) { expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true) }
    expect(out[0].ho).toEqual([0, -5.5]); expect(out[1].hi).toEqual([-5.5, 0])
  })
  it('leaves the outline alone for no radius, and returns the list itself when nothing is a corner', () => {
    expect(roundCorners(square, true, 0)).toBe(square)
    const curved: ModelPoint[] = square.map(p => ({ ...p, m: 'c' as const }))
    expect(roundCorners(curved, true, 10)).toBe(curved)
  })
  it('holds the radius to 45% of the shorter side, so neighbouring corners never meet', () => {
    const out = roundCorners(square, true, 1000)
    expect(out[0].y).toBeCloseTo(18, 6)                 // 45% of 40 from the corner, along the left side
    expect(out[1].x).toBeCloseTo(18, 6)
  })
  it('leaves a curve point, a sharp point beside a curved side, and the ends of an open outline', () => {
    const mixed: ModelPoint[] = [sharp(0, 0), { x: 40, y: 0, m: 'c', hi: null, ho: null }, sharp(40, 40), sharp(0, 40)]
    const out = roundCorners(mixed, true, 10)
    expect(out.filter(p => p.m === 'c')).toHaveLength(1)                     // the curve point is as drawn
    expect(out.some(p => p.x === 0 && p.y === 0)).toBe(true)                 // the corner beside the curved side stays sharp
    const open = roundCorners(square, false, 10)
    expect(open[0]).toMatchObject({ x: 0, y: 0 }); expect(open[open.length - 1]).toMatchObject({ x: 0, y: 40 })
    expect(open).toHaveLength(6)                                              // only the two middle corners
  })
})

describe('what is drawn with a radius', () => {
  it('draws a shape with no radius exactly as before, and rounds the corners of one with a radius, leaving the points it was drawn with', () => {
    const c = shirted(), r = withRound(c, 'base', 10)
    const plain = solveAtRest(c).shapes.base, rounded = solveAtRest(r).shapes.base
    expect(plain.d).not.toMatch(/C/)
    expect(rounded.d).toMatch(/C/)
    expect(rounded.local).toEqual(plain.local); expect(rounded.rig).toEqual(plain.rig)         // the points are as drawn
    expect(inPolygon(plain.poly, 60.5, 20.5)).toBe(true); expect(inPolygon(rounded.poly, 60.5, 20.5)).toBe(false)
    expect(rounded.box).toEqual(plain.box)                                                      // the sides still reach the same extremes
    expect(solveAtRest(r).shapes.fringe.d).toBe(solveAtRest(c).shapes.fringe.d)                 // others untouched
  })
  it('gives a twin the radius of the shape it mirrors, and breaking the pair keeps it', () => {
    let c = withRound(must(makeTwin(shirted(), 'shape', 'base', make)), 'base', 8)
    const twin = c.shapes.find(s => s.mirrorOf === 'base')!
    expect(solveAtRest(c).shapes[twin.id].d).toMatch(/C/)
    c = must(breakPair(c, 'shape', twin.id))
    expect(shape(c, twin.id).round).toBe(8)
    expect(solveAtRest(c).shapes[twin.id].d).toMatch(/C/)
  })
  it('lets a form change the radius of a shape, and the default form leaves the shape as it was', () => {
    let c = withRound(shirted(), 'base', 4)
    const made = addAxis(c, 'oS', 'Cut', make)
    c = must(made)
    const axisId = made.ok ? made.axisId! : ''
    const soft = addForm(c, 'oS', axisId, {}, 'Soft', make)
    c = must(soft)
    const softId = soft.ok ? soft.formId! : ''
    c = must(setLook(c, 'oS', axisId, softId, 'base', { slot: null, gray: null, tone: null, round: 14 }))
    const key = formKey('oS', axisId)
    const draw = (forms: Record<string, string>) => solve(c, {}, 'front', { forms }).shapes.base.d
    const initial = c.objects.find(o => o.id === 'oS')!.axes![0].initial
    expect(draw({ [key]: initial })).toBe(solveAtRest(withRound(shirted(), 'base', 4)).shapes.base.d)
    expect(draw({ [key]: softId })).toBe(solveAtRest(withRound(shirted(), 'base', 14)).shapes.base.d)
  })
  it('keeps the radius a look had when the look changes its colour, and drops the look when nothing is left', () => {
    let c = shirted()
    const made = addAxis(c, 'oS', 'Cut', make)
    c = must(made)
    const axisId = made.ok ? made.axisId! : ''
    const f = addForm(c, 'oS', axisId, {}, 'Soft', make)
    c = must(f)
    const formId = f.ok ? f.formId! : ''
    const looksOf = () => c.objects.find(o => o.id === 'oS')!.axes![0].options.find(o => o.id === formId)!.looks
    c = must(setLook(c, 'oS', axisId, formId, 'base', { slot: null, gray: null, tone: null, round: 6 }))
    c = must(setLook(c, 'oS', axisId, formId, 'base', { slot: 'k_hair', gray: null, tone: null }))
    expect(looksOf()).toEqual([{ shape: 'base', slot: 'k_hair', gray: null, tone: null, round: 6 }])
    c = must(setLook(c, 'oS', axisId, formId, 'base', { slot: null, gray: null, tone: null, round: null }))
    expect(looksOf()).toEqual([])
  })
  it('adds what an authored field gives, held between none and the most', () => {
    let c = shirted()
    const set = addFieldset(c, { kind: 'object', id: 'oS' }, { feature: 'shape', target: 'base', i: 0 }, '', make)
    c = must(set)
    const added = addField(c, set.ok ? set.fieldsetId! : '', 'roundness', make)
    c = must(added)
    const id = added.ok ? added.rangeId! : ''
    expect(c.ranges[0]).toMatchObject({ name: 'Corner roundness', min: 0, rest: 0, max: 20 })
    const d = (values: Values) => solve(c, values).shapes.base.d
    expect(d({})).toBe(solveAtRest(shirted()).shapes.base.d)
    expect(d({ [id]: 10 })).toBe(solveAtRest(withRound(shirted(), 'base', 10)).shapes.base.d)
    expect(d({ [id]: 20 })).toBe(solveAtRest(withRound(shirted(), 'base', ROUND_MAX)).shapes.base.d)
    // a field only adds to the radius the shape has; it cannot take it below none or above the most
    const own = { ...c, shapes: c.shapes.map(s => (s.id === 'base' ? { ...s, round: 15 } : s)) }
    expect(solve(own, { [id]: 20 }).shapes.base.d).toBe(solveAtRest(withRound(shirted(), 'base', ROUND_MAX)).shapes.base.d)
  })
  it('is finite and valid for any radius', () => {
    for (const r of [0, 1, 7, 20, 500]) {
      const out = solveAtRest(withRound(shirted(), 'base', r)).shapes.base
      expect(out.d).not.toMatch(/NaN|undefined|Infinity/)
      expect(JSON.stringify(out.poly)).not.toMatch(/null/)
    }
  })
})

describe('setting a radius', () => {
  it('sets it whole and held to 0..the most, and steps it', () => {
    const c = shirted()
    expect(shape(must(setRound(c, 'base', 6.4)), 'base').round).toBe(6)
    expect(shape(must(setRound(c, 'base', 999)), 'base').round).toBe(LIMITS.roundMax)
    expect(shape(must(setRound(c, 'base', -3)), 'base').round).toBe(0)
    expect(shape(must(stepRound(c, 'base', 1)), 'base').round).toBe(1)
    expect(shape(must(stepRound(withRound(c, 'base', 3), 'base', 1, true)), 'base').round).toBe(8)
    expect(shape(must(stepRound(c, 'base', -1)), 'base').round).toBe(0)
  })
  it('refuses a twin and a shape that follows a template, with the way out', () => {
    const twinned = must(makeTwin(shirted(), 'shape', 'base', make))
    expect(refused(setRound(twinned, twinned.shapes.find(s => s.mirrorOf)!.id, 5))).toMatch(/change the original/)
    expect(refused(setRound(shirted(), 'gone', 5))).toMatch(/no such shape/)
  })
})

describe('patterns', () => {
  const pattern = (c = shirted()) => { const made = addPattern(c, 'base', ['stripe1', 'stripe2'], 'Stripes', make); return { c: must(made), id: made.ok ? made.patternId! : '' } }

  it('keeps the marks inside the base: they are painted as clipped to it, and a shape that is no mark is not', () => {
    const { c } = pattern()
    expect(paintLayer(c, colouring(c), shape(c, 'stripe1')).clip).toBe('base')
    expect(paintLayer(c, colouring(c), shape(c, 'stripe2')).clip).toBe('base')
    expect(paintLayer(c, colouring(c), shape(c, 'base')).clip).toBeNull()
    expect(paintLayer(shirted(), colouring(shirted()), shape(shirted(), 'stripe1')).clip).toBeNull()
    const items = paintShapes(c, solveAtRest(c), colouring(c))
    expect(items.find(i => i.id === 'stripe1')).toMatchObject({ clipD: solveAtRest(c).shapes.base.d, blank: false })
    expect(drawable(items).map(i => i.id)).toContain('stripe2')
  })
  it('lets a mark with a clip of its own keep it', () => {
    const { c } = pattern()
    const own = { ...c, shapes: c.shapes.map(s => (s.id === 'stripe1' ? { ...s, clip: 'fringe' } : s)) }
    expect(paintLayer(own, colouring(own), shape(own, 'stripe1')).clip).toBe('fringe')
  })
  it('puts the marks over the base: after it in its object, at its depth', () => {
    const { c } = pattern()
    expect(c.objects[0].shapes).toEqual(['base', 'stripe1', 'stripe2'])      // stripe 1 was drawn first and under it
    expect(shape(c, 'stripe1').z).toBe(40)                                   // lifted from 30 to the base's 40
    const order = solveAtRest(c).order
    expect(order.indexOf('stripe1')).toBeGreaterThan(order.indexOf('base'))
  })
  it('is switched off by hiding its id, which takes every mark with it and nothing else', () => {
    const { c, id } = pattern()
    const off = solve(c, {}, 'front', { hidden: [id] })
    expect(off.shapes.stripe1.visible).toBe(false); expect(off.shapes.stripe2.off).toBe(true)
    expect(off.shapes.base.visible).toBe(true); expect(off.shapes.fringe.visible).toBe(true)
    expect(solveAtRest(c).shapes.stripe1.visible).toBe(true)
  })
  it('gives a twin of a mark the same clip (to the twin of the base) and the same on and off', () => {
    let c = shirted()
    c = must(makeTwin(c, 'shape', 'base', make))
    c = must(makeTwin(c, 'shape', 'stripe1', make))
    const twinOf = (id: string) => c.shapes.find(s => s.mirrorOf === id)!.id
    const made = addPattern(c, 'base', ['stripe1'], 'Stripes', make)
    c = must(made)
    expect(paintLayer(c, colouring(c), shape(c, twinOf('stripe1'))).clip).toBe(twinOf('base'))
    expect(solve(c, {}, 'front', { hidden: [made.ok ? made.patternId! : ''] }).shapes[twinOf('stripe1')].off).toBe(true)
    // breaking the pair leaves the shape clipped to what it was clipped to, though it is no longer a mark
    const broken = must(breakPair(c, 'shape', twinOf('stripe1')))
    expect(shape(broken, twinOf('stripe1')).clip).toBe(twinOf('base'))
    expect(bakedPaint(c, shape(c, 'stripe1')).clip).toBe('base')
  })
  it('refuses a twin, the base, a shape that is a mark already, no marks, and past the limits', () => {
    const twinned = must(makeTwin(shirted(), 'shape', 'stripe1', make))
    const twin = twinned.shapes.find(s => s.mirrorOf === 'stripe1')!
    expect(refused(addPattern(twinned, 'base', [twin.id], '', make))).toMatch(/is a twin/)
    expect(refused(addPattern(twinned, twin.id, ['stripe2'], '', make))).toMatch(/make the pattern on the original/)
    expect(refused(addPattern(shirted(), 'base', [], '', make))).toMatch(/at least one shape/)
    const helped = { ...shirted(), shapes: shirted().shapes.map(s => (s.id === 'stripe1' ? { ...s, helper: true } : s)) }
    expect(refused(addPattern(helped, 'base', ['stripe1'], '', make))).toMatch(/is a helper shape: it is never drawn/)
    expect(refused(addPattern(shirted(), 'base', ['base'], '', make))).toMatch(/at least one shape/)
    expect(refused(addPattern(shirted(), 'gone', ['stripe1'], '', make))).toMatch(/no such shape/)
    const { c } = pattern()
    expect(refused(addPattern(c, 'fringe', ['stripe1'], '', make))).toMatch(/already a mark of Stripes/)
    // a shape is a base or a mark, not both
    expect(refused(addPattern(c, 'stripe1', ['fringe'], '', make))).toMatch(/is a mark of Stripes: a mark cannot be the base/)
    expect(refused(addPattern(c, 'fringe', ['base'], '', make))).toMatch(/is the base of a fill pattern: it cannot also be a mark/)
    const full = { ...c, patterns: Array.from({ length: LIMITS.patternsMax }, (_, i) => ({ id: `p${i}`, name: 'P', base: 'fringe', marks: ['x'] })) }
    expect(refused(addPattern(full, 'fringe', ['base'], '', make))).toMatch(/at most 24 patterns/)
  })
  it('adds and takes away marks, keeping at least one, and renames and removes a pattern', () => {
    const made = addPattern(shirted(), 'base', ['stripe1'], 'Stripes', make)
    let p = must(made)
    const pid = made.ok ? made.patternId! : ''
    p = must(toggleMark(p, pid, 'stripe2'))
    expect(p.patterns![0].marks).toEqual(['stripe1', 'stripe2'])
    expect(patternOfMark(p, 'stripe2')!.id).toBe(pid); expect(patternsOn(p, 'base')).toHaveLength(1)
    p = must(toggleMark(p, pid, 'stripe1'))
    expect(p.patterns![0].marks).toEqual(['stripe2'])
    expect(refused(toggleMark(p, pid, 'stripe2'))).toMatch(/needs a mark/)
    expect(refused(toggleMark(p, pid, 'base'))).toMatch(/cannot be one of its own marks/)
    expect(renamePattern(p, pid, 'Bands').patterns![0].name).toBe('Bands')
    expect(removePattern(p, pid).patterns).toEqual([])
    expect(removePattern(p, 'gone')).toBe(p)
  })
  it('goes with its base, loses a mark that is deleted and goes with the last, and is no longer switched off', () => {
    const { c, id } = pattern()
    const withPreset = must(savePreset(c, { ...restState(c), hidden: [id] }, 'Plain', 'Outfit', make))
    expect(withPreset.presets![0].hidden).toEqual([id])
    expect(removePattern(withPreset, id).presets![0].hidden).toEqual([])
    expect(removeShape(c, 'stripe1').patterns![0].marks).toEqual(['stripe2'])
    expect(removeShape(removeShape(withPreset, 'stripe1'), 'stripe2')).toMatchObject({ patterns: [] })
    const gone = removeShape(withPreset, 'base')
    expect(gone.patterns).toEqual([]); expect(gone.presets![0].hidden).toEqual([])
    expect(removeObject(c, 'oS').patterns).toEqual([]); expect(removeGroup(c, 'gT').patterns).toEqual([])
    expect(removeShape(c, 'fringe').patterns).toEqual(c.patterns)
  })
  it('counts in the limits once past the warning', () => {
    const { c } = pattern()
    const many = { ...c, patterns: Array.from({ length: LIMITS.patternsWarn + 1 }, (_, i) => ({ id: `p${i}`, name: 'P', base: 'base', marks: ['stripe1'] })) }
    expect(limitNotes(many).map(x => x.text)).toContain('The model has 13 patterns: the warning starts above 12.')
  })
})

describe('what a save and Publish do', () => {
  const faults = (c: ModelContent) => publishFaults(c).filter(f => /attern/.test(f))
  it('says nothing of a whole pattern', () => {
    const made = addPattern(shirted(), 'base', ['stripe1', 'stripe2'], 'Stripes', make)
    expect(faults(must(made))).toEqual([])
  })
  it('names a base or a mark that is not there, the base as a mark, a twin base or mark', () => {
    const c = must(addPattern(shirted(), 'base', ['stripe1', 'stripe2'], 'Stripes', make))
    const patch = (p: Partial<NonNullable<ModelContent['patterns']>[number]>) => ({ ...c, patterns: c.patterns!.map(x => ({ ...x, ...p })) })
    expect(faults(patch({ base: 'x' }))).toContain('Pattern Stripes is on a shape that does not exist.')
    expect(faults(patch({ marks: ['stripe1', 'x'] }))).toContain('Pattern Stripes has a mark that does not exist.')
    expect(faults(patch({ marks: ['base'] }))).toContain('Pattern Stripes has its own base as a mark.')
    const twinned = must(makeTwin(c, 'shape', 'base', make)), twin = twinned.shapes.find(s => s.mirrorOf)!
    expect(faults({ ...twinned, patterns: twinned.patterns!.map(x => ({ ...x, base: twin.id })) })).toContain('Pattern Stripes is on a twin; put it on the original.')
    const withMarkTwin = must(makeTwin(c, 'shape', 'stripe1', make)), markTwin = withMarkTwin.shapes.find(s => s.mirrorOf === 'stripe1')!
    expect(faults({ ...withMarkTwin, patterns: c.patterns!.map(x => ({ ...x, marks: [markTwin.id] })) })).toContain('Pattern Stripes has a mark that is a twin; use the original.')
  })
  it('lets a preset or a group state switch a pattern off, and refuses one that is gone', () => {
    const { c, id } = (() => { const made = addPattern(shirted(), 'base', ['stripe1'], 'Stripes', make); return { c: must(made), id: made.ok ? made.patternId! : '' } })()
    const preset = must(savePreset(c, { ...restState(c), hidden: [id] }, 'Plain', 'Outfit', make))
    expect(publishFaults(preset)).toEqual([])
    const bad = { ...preset, presets: preset.presets!.map(p => ({ ...p, hidden: ['pt_gone'] })) }
    expect(publishFaults(bad)).toContain('Preset Plain hides something that does not exist.')
  })
  it('holds a radius to a whole number between none and the most, in a shape and in a look', () => {
    const c: ModelContent = { ...shirted(), shapes: shirted().shapes.map((s, i) => ({ ...s, round: [6.4, 999, -3, NaN][i] ?? 0 })) }
    expect(normalizeContent(c).shapes.map(s => s.round)).toEqual([6, LIMITS.roundMax, 0, 0])
    expect(repairLooks([{ shape: 'a', slot: null, gray: null, tone: null, round: 99 }, { shape: 'b', slot: null, gray: null, tone: null, round: null }, { shape: 'c', slot: null, gray: null, tone: null }])).toEqual([{ shape: 'a', slot: null, gray: null, tone: null, round: 20 }])
  })
  it('cleans a pattern the way the server does: one per id, a mark once, none without a base', () => {
    const c: ModelContent = { ...shirted(), patterns: [
      { id: 'p1', name: ` ${'x'.repeat(60)}`, base: 'base', marks: ['stripe1', 'stripe1', 'stripe2'] },
      { id: 'p1', name: 'again', base: 'base', marks: [] },
      { id: 'p2', name: 'No base', base: '', marks: [] },
    ] }
    const out = normalizeContent(c).patterns!
    expect(out).toHaveLength(1)
    expect(out[0].name).toHaveLength(40); expect(out[0].marks).toEqual(['stripe1', 'stripe2'])
  })
})
