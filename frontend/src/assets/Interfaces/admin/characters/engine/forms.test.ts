import { describe, expect, it } from 'vitest'
import type { ModelAxis, ModelContent, ModelPoint, ModelPreset, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, normalizeContent, publishFaults, removeGroup, removeObject, removeShape } from '../modelContent'
import { addAxis, addForm, hideInForm, moveForm, moveAxis, overrideState, removeAxis, removeForm, renameAxis, renameForm, setInitialForm, setOverride, useBaseOutline } from './formEdit'
import { chosenForm, editTarget, formKey, formsAway, formsByViews, overrideFor } from './forms'
import { LIMITS, limitNotes } from './limits'
import { makeTwin } from './pairEdit'
import { applyPreset, awayCount, deletePreset, footprint, isOn, kindsOf, renamePreset, restState, savePreset, setPresetKind, updatePreset, type TestState } from './presets'
import { previewSpecs, seededRng } from './previews'
import { solve } from './rig'
import { formCheck } from './rigCheck'
import { addRange, addTurn, attachGroup, newRange, removeRange, type Edit } from './rigEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const P = (pts: Array<[number, number]>): ModelPoint[] => pts.map(([x, y]) => ({ x, y, m: 's' as const }))
const sharp = (id: string, pts: Array<[number, number]>, over: Partial<ModelShape> = {}): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: P(pts), ...over })
let counter = 0
const make = (prefix: string) => `${prefix}_${++counter}`

const HEAD: Array<[number, number]> = [[70, 20], [130, 20], [130, 100], [70, 100]]
const EYE: Array<[number, number]> = [[80, 50], [100, 50], [100, 60], [80, 60]]
const PUPIL: Array<[number, number]> = [[88, 53], [92, 53], [92, 57], [88, 57]]
const SHIRT: Array<[number, number]> = [[60, 110], [140, 110], [140, 190], [60, 190]]
const HAIR: Array<[number, number]> = [[70, 10], [130, 10], [130, 20], [70, 20]]
const WIDE: Array<[number, number]> = [[76, 48], [104, 48], [104, 62], [76, 62]]
const SLIT: Array<[number, number]> = [[80, 54], [100, 54], [100, 56], [80, 56]]
const FIVE: Array<[number, number]> = [[80, 50], [100, 50], [104, 56], [100, 60], [80, 60]]
const BACK: Array<[number, number]> = [[110, 50], [130, 50], [130, 60], [110, 60]]

const shapeAxis: ModelAxis = {
  id: 'aShape', name: 'Eye shape', initial: 'std',
  options: [
    { id: 'std', name: 'Standard', ovr: [] },
    { id: 'wide', name: 'Wide', ovr: [{ shape: 'eye', pts: P(WIDE) }] },
    { id: 'five', name: 'Five', ovr: [{ shape: 'eye', pts: P(FIVE) }] },
    { id: 'shut', name: 'Shut', ovr: [{ shape: 'pupil', pts: [] }] },
  ],
}
const moodAxis: ModelAxis = {
  id: 'aMood', name: 'Mood', initial: 'calm',
  options: [
    { id: 'calm', name: 'Calm', ovr: [] },
    { id: 'sly', name: 'Sly', ovr: [{ shape: 'eye', pts: P(SLIT) }, { shape: 'pupil', pts: [] }] },
  ],
}

// A head (with an eye of two shapes, and a hair group under it), a body with a shirt, a slider that tilts the head and one that leans the body.
function faced(over: Partial<ModelContent> = {}): ModelContent {
  let c: ModelContent = {
    ...blankContent('Face'),
    shapes: [sharp('head', HEAD), sharp('eye', EYE), sharp('pupil', PUPIL), sharp('shirt', SHIRT), sharp('hair', HAIR)],
    objects: [
      { id: 'oHead', name: 'Head', layer: 'body', shapes: ['head'] },
      { id: 'oEye', name: 'Eye', layer: 'body', shapes: ['eye', 'pupil'], axes: [shapeAxis, moodAxis] },
      { id: 'oShirt', name: 'Shirt', layer: 'clothing', shapes: ['shirt'] },
      { id: 'oHair', name: 'Hair', layer: 'hair', shapes: ['hair'] },
    ],
    groups: [newGroup('gHead', 'Head', null, ['oHead', 'oEye']), newGroup('gBody', 'Body', null, ['oShirt']), newGroup('gHair', 'Hair', 'gHead', ['oHair']), newGroup('gIris', 'Iris', 'gHead', [])],
  }
  for (const [id, group, lo, hi] of [['tilt', 'gHead', -20, 20], ['lean', 'gBody', -10, 10]] as const) {
    c = must(addRange(c, { ...newRange(id, id, 'turn', group), min: lo, max: hi, rest: 0 }))
    c = must(addTurn(c, id, group))
    c = { ...c, ranges: c.ranges.map(r => (r.id === id ? { ...r, drives: r.drives.map(d => ({ ...d, atMin: lo, atMax: hi })) } : r)) }
  }
  c = must(attachGroup(c, 'gIris', { shape: 'eye', kind: 'point', i: 1, t: 0, slider: null, rx: 0, ry: 0 }))
  return { ...c, ...over }
}

const xy = (list: ModelPoint[]): Array<[number, number]> => list.map(p => [p.x, p.y])
const show = (c: ModelContent, forms: Record<string, string> = {}, view: 'front' | 'back' = 'front', hidden: string[] = [], values = {}) => solve(c, values, view, { forms, hidden })
const eyeForm = (formId: string) => ({ [formKey('oEye', 'aShape')]: formId })

// ---------------------------------------------------------------------------------------------------- the solver

describe('solve with forms', () => {
  it('is unchanged when nothing is chosen or there are no axes', () => {
    const base = solve(faced(), {}).shapes
    const none = solve(faced({ objects: faced().objects.map(o => ({ ...o, axes: [] })) }), {}, 'front', { forms: eyeForm('wide') }).shapes
    for (const id of Object.keys(base)) { expect(none[id].d).toBe(base[id].d); expect(none[id].visible).toBe(base[id].visible) }
    expect(show(faced()).shapes.eye.d).toBe(base.eye.d)
  })

  it('draws the chosen form\'s outline while the rig keeps the base outline', () => {
    const s = show(faced(), eyeForm('wide')).shapes.eye
    expect(xy(s.local)).toEqual(WIDE)
    expect(xy(s.rig)).toEqual(EYE)
    expect(s.pre.map((p): [number, number] => [p.x, p.y])).toEqual(EYE)
    expect(s.box).toMatchObject({ x: 76, y: 48, w: 28, h: 14 })
    expect(show(faced()).shapes.eye.box).toMatchObject({ x: 80, y: 50, w: 20, h: 10 })
  })

  it('shows the default form\'s outline when none is chosen, and falls back to it for ids that are not there', () => {
    const c = faced()
    const base = show(c).shapes.eye.d
    expect(show(c, eyeForm('std')).shapes.eye.d).toBe(base)
    expect(show(c, { [formKey('oEye', 'aShape')]: 'nope', 'oEye.zzz': 'wide', 'ghost.aShape': 'wide' }).shapes.eye.d).toBe(base)
    // a default form that has an outline is what shows when nothing is chosen
    const wideDefault = faced({ objects: faced().objects.map(o => (o.id === 'oEye' ? { ...o, axes: [{ ...shapeAxis, initial: 'wide' }, moodAxis] } : o)) })
    expect(xy(show(wideDefault).shapes.eye.local)).toEqual(WIDE)
  })

  it('lets the first axis, in order, that has an outline for a shape win, and combines axes that change different shapes', () => {
    const c = faced()
    const both = show(c, { ...eyeForm('wide'), [formKey('oEye', 'aMood')]: 'sly' }).shapes
    expect(xy(both.eye.local)).toEqual(WIDE)                       // the shape axis comes first: not merged with the mood's slit
    expect(both.pupil.visible).toBe(false)                          // only the mood changes the pupil
    const other = show(c, { ...eyeForm('shut'), [formKey('oEye', 'aMood')]: 'sly' }).shapes
    expect(xy(other.eye.local)).toEqual(SLIT)                       // the shape axis has no outline for the eye, so the mood's does
    expect(other.pupil.visible).toBe(false)
    const swapped = faced({ objects: faced().objects.map(o => (o.id === 'oEye' ? { ...o, axes: [moodAxis, shapeAxis] } : o)) })
    expect(xy(show(swapped, { ...eyeForm('wide'), [formKey('oEye', 'aMood')]: 'sly' }).shapes.eye.local)).toEqual(SLIT)   // now the mood comes first
  })

  it('hides a shape whose outline is empty in the chosen form, but anchors still read it', () => {
    const base = show(faced())
    const shut = show(faced(), eyeForm('shut'))
    expect(shut.shapes.pupil).toMatchObject({ visible: false, d: '' })
    expect(shut.shapes.pupil.pre.length).toBe(4)
    expect(shut.shapes.eye.visible).toBe(true)
    expect(shut.order).not.toContain('pupil')
    expect(base.order).toContain('pupil')
  })

  it('has anchors, links and the rig read the base outline, also when the form has another number of points', () => {
    const c = faced({ objects: faced().objects.map(o => (o.id === 'oEye' ? { ...o, axes: [{ ...shapeAxis, options: shapeAxis.options.map(f => (f.id === 'wide' ? { ...f, ovr: [{ shape: 'eye', pts: P([[76, 48], [110, 40], [104, 62], [76, 62]]) }] } : f)) }, moodAxis] } : o)) })
    const at = show(c).anchors.gIris
    expect(at).toEqual([100, 50])
    expect(show(c, eyeForm('wide')).anchors.gIris).toEqual(at)
    expect(show(c, eyeForm('five')).anchors.gIris).toEqual(at)
    expect(show(c, eyeForm('five')).shapes.eye.local.length).toBe(5)
    expect(show(c, eyeForm('five')).shapes.eye.rig.length).toBe(4)
  })

  it('has a twin follow the form of its original', () => {
    const c = must(makeTwin(faced(), 'shape', 'eye', n => `${n}_tw`))
    const twin = show(c, eyeForm('wide')).shapes.s_tw
    expect(twin.box).toMatchObject({ x: 96, w: 28, y: 48, h: 14 })    // the mirror image of the wide eye about x = 100
    expect(show(c).shapes.s_tw.box).toMatchObject({ x: 100, w: 20 })
    expect(show(c, { ...eyeForm('shut'), [formKey('oEye', 'aMood')]: 'sly' }).shapes.eye.visible).toBe(true)
    // a hidden original hides its twin; the twin of a pupil that the form hides is hidden too
    const withPupil = must(makeTwin(faced(), 'shape', 'pupil', n => `${n}_tw`))
    expect(show(withPupil, eyeForm('shut')).shapes.s_tw.visible).toBe(false)
  })

  it('shows the own back outline in the back view, whatever the form, and the form\'s outline when there is none', () => {
    const c = faced({ shapes: faced().shapes.map(s => (s.id === 'eye' ? { ...s, back: P(BACK) } : s)) })
    expect(xy(show(c, eyeForm('wide'), 'back').shapes.eye.local)).toEqual(BACK)
    expect(xy(show(c, eyeForm('wide'), 'front').shapes.eye.local)).toEqual(WIDE)
    expect(xy(show(faced(), eyeForm('wide'), 'back').shapes.eye.local)).toEqual(WIDE)
    // a form that hides the shape hides it from behind too
    const hid = faced({ shapes: faced().shapes.map(s => (s.id === 'pupil' ? { ...s, back: P(BACK) } : s)) })
    expect(show(hid, eyeForm('shut'), 'back').shapes.pupil.visible).toBe(false)
  })

  it('hides switched-off objects and groups (and the groups under them) but still solves them', () => {
    const c = faced()
    const off = show(c, {}, 'front', ['oEye'])
    expect(off.shapes.eye.visible).toBe(false)
    expect(off.shapes.pupil.visible).toBe(false)
    expect(off.shapes.head.visible).toBe(true)
    expect(off.shapes.eye.pre.length).toBe(4)
    expect(off.anchors.gIris).toEqual([100, 50])                    // the iris still hangs from the hidden eye
    const group = show(c, {}, 'front', ['gHead'])
    expect(['head', 'eye', 'pupil', 'hair'].map(id => group.shapes[id].visible)).toEqual([false, false, false, false])   // hair is in a group under the head
    expect(group.shapes.shirt.visible).toBe(true)
    expect(group.order).toEqual(['shirt'])
    expect(show(c, {}, 'front', ['nothing', 'g_gone']).order).toEqual(show(c).order)
  })

  it('keeps a hidden group\'s sliders working for the shapes that are shown', () => {
    const c = faced()
    const turned = show(c, {}, 'front', ['oShirt'], { tilt: 15 })
    expect(turned.shapes.head.matrix).toEqual(show(c, {}, 'front', [], { tilt: 15 }).shapes.head.matrix)
  })

  it('gives finite shapes for any forms, hidden things and slider values', () => {
    const c = must(makeTwin(faced(), 'shape', 'eye', n => `${n}_tw`))
    const rng = seededRng(7)
    const ids = ['oHead', 'oEye', 'oShirt', 'oHair', 'gHead', 'gBody', 'gHair', 'gIris', 'ghost']
    for (let i = 0; i < 80; i++) {
      const forms: Record<string, string> = {}
      for (const o of c.objects) for (const a of o.axes ?? []) if (rng() < 0.8) forms[formKey(o.id, a.id)] = a.options[Math.floor(rng() * a.options.length)].id
      const hidden = ids.filter(() => rng() < 0.3)
      const values = { tilt: (rng() - 0.5) * 100, lean: (rng() - 0.5) * 100 }
      for (const view of ['front', 'back'] as const) {
        const out = solve(c, values, view, { forms, hidden })
        for (const s of Object.values(out.shapes)) {
          expect(s.d).not.toMatch(/NaN|Infinity/)
          expect(s.matrix.every(Number.isFinite)).toBe(true)
          expect(Object.values(s.box).every(Number.isFinite)).toBe(true)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------- reading forms

describe('reading forms', () => {
  const eye = () => faced().objects.find(o => o.id === 'oEye')!

  it('says which form an axis shows, which outline a shape has and which form is being edited', () => {
    const o = eye()
    expect(chosenForm(o, o.axes![0], {})?.id).toBe('std')
    expect(chosenForm(o, o.axes![0], eyeForm('wide'))?.id).toBe('wide')
    expect(chosenForm(o, o.axes![0], eyeForm('gone'))?.id).toBe('std')
    expect(overrideFor(o, 'eye', {})).toBeUndefined()
    expect(overrideFor(o, 'eye', eyeForm('wide'))?.length).toBe(4)
    expect(overrideFor(o, 'pupil', eyeForm('shut'))).toEqual([])
    expect(editTarget(o, {})).toBeNull()
    expect(editTarget(o, eyeForm('std'))).toBeNull()
    expect(editTarget(o, eyeForm('wide'))).toMatchObject({ axis: { id: 'aShape' }, form: { id: 'wide' } })
    // the first axis (in order) whose chosen form is not its default is the one that is edited
    expect(editTarget(o, { ...eyeForm('wide'), [formKey('oEye', 'aMood')]: 'sly' })?.axis.id).toBe('aShape')
    expect(editTarget(o, { [formKey('oEye', 'aMood')]: 'sly' })?.axis.id).toBe('aMood')
  })

  it('counts axes away from their default', () => {
    expect(formsAway(faced(), {})).toBe(0)
    expect(formsAway(faced(), { ...eyeForm('wide'), [formKey('oEye', 'aMood')]: 'sly' })).toBe(2)
    expect(formsAway(faced(), { ...eyeForm('std'), 'oEye.zzz': 'x' })).toBe(0)
  })

  it('lists what each form does in each view', () => {
    const rows = formsByViews(faced({ shapes: faced().shapes.map(s => (s.id === 'eye' ? { ...s, back: P(BACK) } : s)) }))
    expect(rows.length).toBe(6)
    const row = (form: string) => rows.find(r => r.form === form)!
    expect(row('Standard')).toMatchObject({ object: 'Eye', axis: 'Eye shape', isDefault: true, front: 'base outline', back: 'base outline' })
    expect(row('Wide')).toMatchObject({ isDefault: false, front: '1 own outline' })
    expect(row('Wide').back).toMatch(/own back outline.*front only/)
    expect(row('Shut')).toMatchObject({ front: '1 shape hidden', back: 'derived from the front' })
    expect(row('Sly').front).toBe('1 own outline, 1 shape hidden')
  })

  it('says in the Check panel which forms show from the front only and which have another number of points', () => {
    expect(formCheck(faced()).map(l => l.text)).toEqual([expect.stringMatching(/Five \(Eye shape of Eye\) changes eye with 5 points where the base has 4/)])
    const lines = formCheck(faced({ shapes: faced().shapes.map(s => (s.id === 'eye' ? { ...s, back: P(BACK) } : s)) }))
    expect(lines.some(l => /has an outline of its own for the back: the form shows from the front only/.test(l.text))).toBe(true)
    expect(lines.every(l => l.level === 'info')).toBe(true)
    expect(formCheck(blankContent('x'))).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------- editing forms

describe('editing axes and forms', () => {
  const axisOf = (c: ModelContent, id = 'aShape') => c.objects.find(o => o.id === 'oEye')!.axes!.find(a => a.id === id)!

  it('adds an axis with one default form and refuses past the limit', () => {
    const e = addAxis(faced(), 'oHead', 'Skull', make)
    expect(e.ok && e.axisId && e.formId).toBeTruthy()
    const c = must(e)
    expect(c.objects.find(o => o.id === 'oHead')!.axes).toEqual([{ id: e.axisId, name: 'Skull', initial: e.formId, options: [{ id: e.formId, name: 'Standard', ovr: [] }] }])
    expect(refused(addAxis(faced(), 'o_gone'))).toMatch(/no such object/)
    let full = faced()
    for (let i = 0; i < LIMITS.axesMax - 2; i++) full = must(addAxis(full, 'oEye', 'A', make))
    expect(full.objects.find(o => o.id === 'oEye')!.axes!.length).toBe(LIMITS.axesMax)
    expect(refused(addAxis(full, 'oEye', 'One more', make))).toMatch(new RegExp(`at most ${LIMITS.axesMax} axes`))
  })

  it('removes, renames and moves axes', () => {
    const c = faced()
    expect(c.objects.find(o => o.id === 'oEye')!.axes!.map(a => a.id)).toEqual(['aShape', 'aMood'])
    expect(removeAxis(c, 'oEye', 'aShape').objects.find(o => o.id === 'oEye')!.axes!.map(a => a.id)).toEqual(['aMood'])
    expect(axisOf(renameAxis(c, 'oEye', 'aShape', 'Outline')).name).toBe('Outline')
    expect(moveAxis(c, 'oEye', 'aMood', -1).objects.find(o => o.id === 'oEye')!.axes!.map(a => a.id)).toEqual(['aMood', 'aShape'])
    expect(moveAxis(c, 'oEye', 'aShape', -1)).toEqual(c)
    expect(moveAxis(c, 'oEye', 'aMood', 1)).toEqual(c)
  })

  it('adds a form that starts as a copy of the outlines now drawn', () => {
    const drawn = { eye: P(WIDE), pupil: P(PUPIL), head: P(HEAD), tiny: P([[1, 1], [2, 2]]) }
    const e = addForm(faced(), 'oEye', 'aShape', drawn, '  Round  ', make)
    const form = axisOf(must(e)).options.at(-1)!
    expect(form).toMatchObject({ id: e.ok && e.formId, name: 'Round' })
    expect(form.ovr.map(v => v.shape)).toEqual(['eye', 'pupil'])        // head is not in the object
    expect(xy(form.ovr[0].pts)).toEqual(WIDE)
    form.ovr[0].pts[0].x = 999                                           // a copy, not the same list
    expect(drawn.eye[0].x).toBe(76)
    expect(refused(addForm(faced(), 'oEye', 'aGone', drawn))).toMatch(/no such axis/)
  })

  it('leaves a twin out of a new form and refuses past the limit', () => {
    const c = must(makeTwin(faced(), 'shape', 'eye', n => `${n}_tw`))
    const drawn = { eye: P(WIDE), s_tw: P(WIDE) }
    expect(axisOf(must(addForm(c, 'oEye', 'aShape', drawn, 'x', make))).options.at(-1)!.ovr.map(v => v.shape)).toEqual(['eye'])
    let full = faced()
    for (let i = shapeAxis.options.length; i < LIMITS.formsMax; i++) full = must(addForm(full, 'oEye', 'aShape', {}, 'F', make))
    expect(axisOf(full).options.length).toBe(LIMITS.formsMax)
    expect(refused(addForm(full, 'oEye', 'aShape', {}, 'F', make))).toMatch(new RegExp(`at most ${LIMITS.formsMax} forms`))
  })

  it('removes a form but never the last, and moves the default along', () => {
    const c = faced()
    expect(axisOf(must(removeForm(c, 'oEye', 'aShape', 'wide'))).options.map(f => f.id)).toEqual(['std', 'five', 'shut'])
    expect(axisOf(must(removeForm(c, 'oEye', 'aShape', 'wide'))).initial).toBe('std')
    const gone = axisOf(must(removeForm(c, 'oEye', 'aShape', 'std')))
    expect(gone.options.map(f => f.id)).toEqual(['wide', 'five', 'shut'])
    expect(gone.initial).toBe('wide')
    expect(refused(removeForm(must(removeForm(c, 'oEye', 'aMood', 'sly')), 'oEye', 'aMood', 'calm'))).toMatch(/at least one form/)
    expect(refused(removeForm(c, 'oEye', 'aGone', 'x'))).toMatch(/no such axis/)
  })

  it('renames, orders and defaults forms', () => {
    const c = faced()
    expect(axisOf(renameForm(c, 'oEye', 'aShape', 'wide', 'Broad')).options[1].name).toBe('Broad')
    expect(axisOf(setInitialForm(c, 'oEye', 'aShape', 'shut')).initial).toBe('shut')
    expect(axisOf(setInitialForm(c, 'oEye', 'aShape', 'nope')).initial).toBe('std')
    expect(axisOf(moveForm(c, 'oEye', 'aShape', 'wide', 1)).options.map(f => f.id)).toEqual(['std', 'five', 'wide', 'shut'])
    expect(axisOf(moveForm(c, 'oEye', 'aShape', 'std', -1)).options.map(f => f.id)).toEqual(['std', 'wide', 'five', 'shut'])
    expect(axisOf(moveForm(c, 'oEye', 'aShape', 'shut', 1)).options.map(f => f.id)).toEqual(['std', 'wide', 'five', 'shut'])
  })

  it('sets, hides and lets go of the outline a form gives a shape', () => {
    const c = faced()
    const set = must(setOverride(c, 'oEye', 'aShape', 'std', 'eye', P(WIDE)))
    expect(overrideState(axisOf(set).options[0], 'eye')).toBe('own')
    expect(overrideState(axisOf(set).options[0], 'pupil')).toBe('base')
    const again = must(setOverride(set, 'oEye', 'aShape', 'std', 'eye', P(SLIT)))
    expect(axisOf(again).options[0].ovr.length).toBe(1)
    expect(xy(axisOf(again).options[0].ovr[0].pts)).toEqual(SLIT)
    const hid = must(hideInForm(set, 'oEye', 'aShape', 'std', 'eye'))
    expect(overrideState(axisOf(hid).options[0], 'eye')).toBe('hidden')
    const back = must(useBaseOutline(hid, 'oEye', 'aShape', 'std', 'eye'))
    expect(overrideState(axisOf(back).options[0], 'eye')).toBe('base')
    expect(axisOf(back).options[0].ovr).toEqual([])
  })

  it('refuses an outline it cannot take', () => {
    const c = must(makeTwin(faced(), 'shape', 'eye', n => `${n}_tw`))
    expect(refused(setOverride(c, 'oEye', 'aShape', 'nope', 'eye', P(WIDE)))).toMatch(/no such form/)
    expect(refused(setOverride(c, 'oEye', 'aGone', 'std', 'eye', P(WIDE)))).toMatch(/no such form/)
    expect(refused(setOverride(c, 'oEye', 'aShape', 'std', 'head', P(WIDE)))).toMatch(/not in the object/)
    expect(refused(setOverride(c, 'oEye', 'aShape', 'std', 's_tw', P(WIDE)))).toMatch(/twin/)
    expect(refused(setOverride(c, 'oEye', 'aShape', 'std', 'eye', P([[1, 1], [2, 2]])))).toMatch(/at least 3 points/)
    expect(refused(setOverride(c, 'oEye', 'aShape', 'std', 'eye', P(Array.from({ length: LIMITS.pointsMax + 1 }, (_, i) => [i, i] as [number, number]))))).toMatch(new RegExp(`at most ${LIMITS.pointsMax} points`))
  })

  it('never changes the content it was given', () => {
    const c = faced()
    const before = JSON.stringify(c)
    addAxis(c, 'oEye', 'A', make); removeAxis(c, 'oEye', 'aShape'); renameAxis(c, 'oEye', 'aShape', 'X'); moveAxis(c, 'oEye', 'aMood', -1)
    addForm(c, 'oEye', 'aShape', { eye: P(WIDE) }, 'F', make); removeForm(c, 'oEye', 'aShape', 'wide'); renameForm(c, 'oEye', 'aShape', 'wide', 'X')
    setInitialForm(c, 'oEye', 'aShape', 'shut'); moveForm(c, 'oEye', 'aShape', 'wide', 1)
    setOverride(c, 'oEye', 'aShape', 'std', 'eye', P(WIDE)); hideInForm(c, 'oEye', 'aShape', 'wide', 'eye'); useBaseOutline(c, 'oEye', 'aShape', 'wide', 'eye')
    expect(JSON.stringify(c)).toBe(before)
  })

  it('drops the overrides of a removed shape and the hidden ids of a removed thing', () => {
    const presets: ModelPreset[] = [{ id: 'p1', name: 'No shirt', kind: 'Outfit', values: { tilt: 5, lean: 3 }, hidden: ['oShirt', 'gHair', 'oEye'] }]
    const c = faced({ presets })
    const noEye = removeShape(c, 'eye')
    expect(noEye.objects.find(o => o.id === 'oEye')!.axes!.flatMap(a => a.options.flatMap(f => f.ovr.map(v => v.shape))).sort()).toEqual(['pupil', 'pupil'])
    expect(removeObject(c, 'oShirt').presets![0].hidden).toEqual(['gHair', 'oEye'])
    expect(removeGroup(c, 'gHair').presets![0].hidden).toEqual(['oShirt', 'oEye'])
    const noLean = must(removeRange(c, 'lean'))
    expect(noLean.presets![0].values).toEqual({ tilt: 5 })
  })

  it('warns at the limits that are counted', () => {
    const many = faced({ presets: Array.from({ length: LIMITS.presetsWarn + 1 }, (_, i) => ({ id: `p${i}`, name: 'P', kind: 'Pose', values: {}, hidden: [] })) })
    expect(limitNotes(many).some(n => n.level === 'warn' && /presets/.test(n.text))).toBe(true)
    expect(limitNotes(faced()).some(n => /axes|forms|presets/.test(n.text))).toBe(false)
  })

  it('refuses to publish what the server refuses, in the same words', () => {
    const bad = faced({ objects: faced().objects.map(o => (o.id === 'oEye' ? { ...o, axes: [{ ...shapeAxis, initial: 'gone', options: [{ id: 'std', name: 'Standard', ovr: [{ shape: 'head', pts: P(WIDE) }, { shape: 'eye', pts: P(WIDE).slice(0, 2) }] }] }] } : o)) })
    const faults = publishFaults(bad)
    expect(faults).toContain('Axis Eye shape of object Eye has a default form that does not exist.')
    expect(faults).toContain('Form Standard of Eye changes a shape that is not in the object.')
    expect(faults).toContain('Form Standard of Eye has an outline of fewer than 3 points for shape eye.')
    const twin = must(makeTwin(faced(), 'shape', 'eye', n => `${n}_tw`))
    const onTwin = { ...twin, objects: twin.objects.map(o => (o.id === 'oEye' ? { ...o, axes: [{ ...moodAxis, options: [{ id: 'calm', name: 'Calm', ovr: [{ shape: 's_tw', pts: P(WIDE) }] }] }] } : o)) }
    expect(publishFaults(onTwin)).toContain('Form Calm of Eye changes a twin; change the original instead.')
    const preset = faced({ presets: [{ id: 'p', name: 'Smile', kind: 'Pose', values: { gone: 1 }, hidden: ['nothing'] }] })
    expect(publishFaults(preset)).toEqual(expect.arrayContaining(['Preset Smile sets a slider that does not exist.', 'Preset Smile hides something that does not exist.']))
    expect(publishFaults(faced({ presets: [{ id: 'p', name: 'Hide the head', kind: 'Pose', values: { tilt: 3 }, hidden: ['gHead'] }] }))).toEqual([])
    expect(publishFaults(faced())).toEqual([])
  })

  it('normalises names and kinds', () => {
    const out = normalizeContent(faced({ presets: [{ id: 'p', name: '  Smile ', kind: '   ', values: {}, hidden: [] }] }))
    expect(out.presets![0]).toMatchObject({ name: 'Smile', kind: 'Pose' })
    expect(normalizeContent(blankContent('x')).presets).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------- presets

describe('presets', () => {
  const preset = (id: string, kind: string, values: Record<string, number>, hidden: string[] = []): ModelPreset => ({ id, name: id, kind, values, hidden })
  const library = (): ModelContent => faced({
    presets: [
      preset('rest', 'Pose', {}), preset('left', 'Pose', { lean: -8 }), preset('right', 'Pose', { lean: 8 }),
      preset('curious', 'Expression', { tilt: 12 }), preset('bare', 'Outfit', {}, ['oShirt']), preset('dressed', 'Outfit', {}),
    ],
  })
  const byId = (c: ModelContent, id: string) => c.presets!.find(p => p.id === id)!

  it('sets the sliders and switches off the things the preset says', () => {
    const c = library()
    const s = applyPreset(c, restState(c), byId(c, 'left'))
    expect(s.values).toMatchObject({ lean: -8, tilt: 0 })
    expect(applyPreset(c, restState(c), byId(c, 'bare')).hidden).toEqual(['oShirt'])
  })

  it('lets a preset replace the last one of its kind and leave the others alone', () => {
    const c = library()
    let s = applyPreset(c, restState(c), byId(c, 'left'))
    s = applyPreset(c, s, byId(c, 'curious'))
    expect(s.values).toMatchObject({ lean: -8, tilt: 12 })              // an expression leaves the pose alone
    s = applyPreset(c, s, byId(c, 'right'))
    expect(s.values).toMatchObject({ lean: 8, tilt: 12 })               // a pose replaces the last pose
    s = applyPreset(c, s, byId(c, 'rest'))
    expect(s.values).toMatchObject({ lean: 0, tilt: 12 })               // a pose that sets nothing still puts the pose back
    s = applyPreset(c, applyPreset(c, s, byId(c, 'bare')), byId(c, 'dressed'))
    expect(s.hidden).toEqual([])                                         // another outfit shows the shirt again
  })

  it('keeps the chosen forms and the input untouched', () => {
    const c = library()
    const start: TestState = { values: { lean: 3, tilt: 0 }, forms: eyeForm('wide'), hidden: ['oHair'] }
    const before = JSON.stringify(start)
    const next = applyPreset(c, start, byId(c, 'bare'))
    expect(next.forms).toEqual(eyeForm('wide'))
    expect(next.hidden.sort()).toEqual(['oHair', 'oShirt'])
    expect(JSON.stringify(start)).toBe(before)
  })

  it('holds values to the slider\'s range and ignores sliders and things that are gone', () => {
    const c = faced({ presets: [preset('wild', 'Pose', { tilt: 99, gone: 5 }, ['oShirt', 'nothing'])] })
    const s = applyPreset(c, restState(c), byId(c, 'wild'))
    expect(s.values.tilt).toBe(20)
    expect(s.values.gone).toBeUndefined()
    expect(s.hidden).toEqual(['oShirt'])
  })

  it('knows which preset is on, within a hundredth', () => {
    const c = library()
    const rest = restState(c)
    expect(isOn(c, rest, byId(c, 'rest'))).toBe(true)
    expect(isOn(c, rest, byId(c, 'left'))).toBe(false)
    const left = applyPreset(c, rest, byId(c, 'left'))
    expect(isOn(c, left, byId(c, 'left'))).toBe(true)
    expect(isOn(c, left, byId(c, 'right'))).toBe(false)
    expect(isOn(c, left, byId(c, 'rest'))).toBe(false)
    expect(isOn(c, { ...left, values: { ...left.values, lean: -8.005 } }, byId(c, 'left'))).toBe(true)
    expect(isOn(c, { ...left, values: { ...left.values, lean: -7.9 } }, byId(c, 'left'))).toBe(false)
    expect(isOn(c, applyPreset(c, rest, byId(c, 'bare')), byId(c, 'bare'))).toBe(true)
    expect(isOn(c, rest, byId(c, 'bare'))).toBe(false)
  })

  it('lists the kinds in use and what a kind controls', () => {
    const c = faced({ presets: [preset('a', 'Pose', { lean: 1 }), preset('b', 'pose', { tilt: 1 }, ['oHair']), preset('c', 'Expression', {})] })
    expect(kindsOf(c)).toEqual(['Pose', 'Expression'])
    const fp = footprint(c, 'POSE')
    expect([...fp.values].sort()).toEqual(['lean', 'tilt'])
    expect([...fp.hidden]).toEqual(['oHair'])
    expect(kindsOf(blankContent('x'))).toEqual([])
  })

  it('counts what is away from rest', () => {
    const c = library()
    expect(awayCount(c, restState(c))).toBe(0)
    expect(awayCount(c, { values: { lean: 4, tilt: 20 }, forms: { ...eyeForm('wide'), 'oEye.aMood': 'calm' }, hidden: ['oShirt', 'oShirt', 'nothing'] })).toBe(4)
  })

  it('saves the sliders away from rest and the things switched off', () => {
    const c = faced()
    const state: TestState = { values: { tilt: 12.3456, lean: 0.004, gone: 9 }, forms: eyeForm('wide'), hidden: ['oShirt', 'oShirt', 'nothing'] }
    const e = savePreset(c, state, '  Bent over  ', ' Pose ', make)
    const saved = must(e).presets!.at(-1)!
    expect(saved).toEqual({ id: e.ok && e.presetId, name: 'Bent over', kind: 'Pose', values: { tilt: 12.35 }, hidden: ['oShirt'] })
    expect(must(savePreset(c, restState(c), '', '', make)).presets![0]).toMatchObject({ name: 'Preset', kind: 'Pose', values: {}, hidden: [] })
  })

  it('refuses a preset past the limit', () => {
    const many = faced({ presets: Array.from({ length: LIMITS.presetsMax }, (_, i) => preset(`p${i}`, 'Pose', {})) })
    expect(refused(savePreset(many, restState(many), 'One more', 'Pose', make))).toMatch(new RegExp(`at most ${LIMITS.presetsMax} presets`))
  })

  it('updates, renames, re-kinds and deletes', () => {
    const c = library()
    const state = applyPreset(c, restState(c), byId(c, 'right'))
    const updated = updatePreset(c, 'left', state)
    expect(byId(updated, 'left')).toMatchObject({ name: 'left', kind: 'Pose', values: { lean: 8 }, hidden: [] })
    expect(byId(renamePreset(c, 'left', 'Lean left'), 'left').name).toBe('Lean left')
    expect(byId(setPresetKind(c, 'left', ' Stance '), 'left').kind).toBe('Stance')
    expect(byId(setPresetKind(c, 'left', '   '), 'left').kind).toBe('Pose')
    expect(deletePreset(c, 'left').presets!.map(p => p.id)).not.toContain('left')
    expect(deletePreset(c, 'left').presets!.length).toBe(c.presets!.length - 1)
  })
})

// ---------------------------------------------------------------------------------------------------- previews

describe('previews with forms and presets', () => {
  it('has the stress previews take the first and the last form of every axis', () => {
    const c = faced()
    expect(previewSpecs(1, 'min', 4, c.ranges, c).every(p => p.forms['oEye.aShape'] === 'std' && p.forms['oEye.aMood'] === 'calm')).toBe(true)
    expect(previewSpecs(1, 'max', 4, c.ranges, c).every(p => p.forms['oEye.aShape'] === 'shut' && p.forms['oEye.aMood'] === 'sly')).toBe(true)
    expect(previewSpecs(1, 'min', 4, c.ranges, c).every(p => p.hidden.length === 0)).toBe(true)
  })

  it('draws random forms, repeatably, and some presets', () => {
    const c = faced({ presets: [{ id: 'bare', name: 'Bare', kind: 'Outfit', values: {}, hidden: ['oShirt'] }, { id: 'lean', name: 'Lean', kind: 'Pose', values: { lean: 8 }, hidden: [] }] })
    const specs = Array.from({ length: 30 }, (_, i) => previewSpecs(i + 1, 'rand', 6, c.ranges, c)).flat()
    expect(previewSpecs(5, 'rand', 6, c.ranges, c)).toEqual(previewSpecs(5, 'rand', 6, c.ranges, c))
    expect(new Set(specs.map(p => p.forms['oEye.aShape'])).size).toBe(4)
    expect(specs.every(p => ['std', 'wide', 'five', 'shut'].includes(p.forms['oEye.aShape']))).toBe(true)
    expect(specs.some(p => p.hidden.includes('oShirt'))).toBe(true)
    expect(specs.some(p => !p.hidden.includes('oShirt'))).toBe(true)
    expect(specs.some(p => p.values.lean === 8)).toBe(true)
  })

  it('gives nothing extra to a model without axes or presets', () => {
    const plain = previewSpecs(2, 'rand', 3)
    expect(plain.every(p => Object.keys(p.forms).length === 0 && p.hidden.length === 0)).toBe(true)
    expect(previewSpecs(2, 'rand', 3, [], blankContent('x')).every(p => Object.keys(p.forms).length === 0)).toBe(true)
  })
})
