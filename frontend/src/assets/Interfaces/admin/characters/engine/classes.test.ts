import { describe, expect, it } from 'vitest'
import type { ModelAxis, ModelContent, ModelPoint, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup, objectById, outlineSize, publishFaults, removeObject, removeShape, shapeById } from '../modelContent'
import { addMember, classOfObject, deleteClass, detachBeforeRemoval, detachMember, followTemplate, followedShape, makeClass, moveObjectToGroup, reconcileClasses, renameClass, setExclusive, setShapeHide } from './classEdit'
import { axesFor, classKey, formKey, formsAway, membersOf } from './forms'
import { LIMITS, limitNotes } from './limits'
import { makeTwin } from './pairEdit'
import { applyPreset, awayCount, footprint, isOn, restState, saveStyle, scopeOf, stylesOf, updatePreset } from './presets'
import { previewSpecs } from './previews'
import { solve, type Solved } from './rig'
import { addRange, addTurn, newRange, recordPoints, setPivot, type Edit } from './rigEdit'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const P = (pts: Array<[number, number]>): ModelPoint[] => pts.map(([x, y]) => ({ x, y, m: 's' as const }))
const sharp = (id: string, pts: Array<[number, number]>, over: Partial<ModelShape> = {}): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: P(pts), ...over })
let counter = 0
const make = (prefix: string) => `${prefix}_${++counter}`

const EYE: Array<[number, number]> = [[80, 50], [100, 50], [100, 60], [80, 60]]
const PUPIL: Array<[number, number]> = [[88, 53], [92, 53], [92, 57], [88, 57]]
const WIDE: Array<[number, number]> = [[76, 48], [104, 48], [104, 62], [76, 62]]
const OWN: Array<[number, number]> = [[82, 52], [98, 52], [98, 58], [82, 58]]
const BACK: Array<[number, number]> = [[110, 50], [130, 50], [130, 60], [110, 60]]

const shapeAxis: ModelAxis = {
  id: 'aShape', name: 'Eye shape', initial: 'std',
  options: [{ id: 'std', name: 'Standard', ovr: [] }, { id: 'wide', name: 'Wide', ovr: [{ shape: 'eye', pts: P(WIDE) }] }, { id: 'shut', name: 'Shut', ovr: [{ shape: 'pupil', pts: [] }] }],
}

// A head group with an Eye object (two shapes, an axis of forms) and a second group, Other, that turns about (100, 55) with a slider.
function eyeModel(): ModelContent {
  let c: ModelContent = {
    ...blankContent('Eyes'),
    shapes: [sharp('eye', EYE), sharp('pupil', PUPIL)],
    objects: [{ id: 'oEye', name: 'Eye', layer: 'body', shapes: ['eye', 'pupil'], axes: [shapeAxis] }],
    groups: [newGroup('gHead', 'Head', null, ['oEye']), newGroup('gOther', 'Other', null, [])],
  }
  c = setPivot(c, 'gOther', 100, 55)
  c = must(addRange(c, { ...newRange('spin', 'Spin', 'turn', 'gOther'), min: 0, rest: 0, max: 40 }))
  c = must(addTurn(c, 'spin', 'gOther'))
  c = { ...c, ranges: c.ranges.map(r => ({ ...r, drives: r.drives.map(d => ({ ...d, atMin: 0, atMax: 30 })) })) }
  return c
}

interface Family { c: ContentWithIds; k: string; m1: string; m2: string }
type ContentWithIds = ModelContent
// the Eye class (a family) with two members, Round and Hooded, next to the template in the head group
function family(exclusive = true): Family {
  let c = eyeModel()
  const made = makeClass(c, 'oEye', 'Eye', exclusive, make)
  c = must(made)
  const a = addMember(c, made.classId!, make); c = must(a)
  const b = addMember(c, made.classId!, make); c = must(b)
  return { c, k: made.classId!, m1: a.memberId!, m2: b.memberId! }
}
const shapesOf = (c: ModelContent, objectId: string): string[] => objectById(c, objectId)!.shapes
const drawn = (s: Solved, id: string) => s.shapes[id]
const box = (s: Solved, id: string) => s.shapes[id].box

// ---------------------------------------------------------------------------------------------------- making classes

describe('making a class and its members', () => {
  it('makes a class of an object, named after it unless a name is given', () => {
    const e = makeClass(eyeModel(), 'oEye', '  ', true, make)
    expect(must(e).classes).toEqual([{ id: e.ok && e.classId, name: 'Eye', template: 'oEye', exclusive: true }])
    expect(must(makeClass(eyeModel(), 'oEye', 'Eyes of the cast', false, make)).classes![0]).toMatchObject({ name: 'Eyes of the cast', exclusive: false })
  })

  it('renames a class and turns a family into copies and back', () => {
    const { c, k } = family()
    expect(renameClass(c, k, 'Eyes').classes![0].name).toBe('Eyes')
    expect(setExclusive(c, k, false).classes![0].exclusive).toBe(false)
  })

  it('refuses what cannot be a template', () => {
    const { c, k, m1 } = family()
    expect(refused(makeClass(c, 'gone', 'x', true))).toMatch(/no such object/)
    expect(refused(makeClass(c, 'oEye', 'x', true))).toMatch(/already the template/)
    expect(refused(makeClass(c, m1, 'x', true))).toMatch(/already a member/)
    const twinned = must(makeTwin(eyeModel(), 'object', 'oEye', n => `${n}_tw`))
    const twin = twinned.objects.find(o => o.mirrorOf === 'oEye')!
    expect(refused(makeClass(twinned, twin.id, 'x', true))).toMatch(/twin cannot be the template/)
    const paired = must(makeTwin(eyeModel(), 'shape', 'eye', n => `${n}_ts`))
    expect(refused(makeClass(paired, 'oEye', 'x', true))).toMatch(/cannot hold twins/)
    expect(k).toBeTruthy()
  })

  it('refuses a class past the limit', () => {
    let c = eyeModel()
    c = { ...c, objects: [...c.objects, ...Array.from({ length: LIMITS.classesMax }, (_, i) => ({ id: `o${i}`, name: `O${i}`, layer: 'body' as const, shapes: [] }))] }
    c = { ...c, groups: c.groups.map(g => (g.id === 'gHead' ? { ...g, objects: [...g.objects, ...Array.from({ length: LIMITS.classesMax }, (_, i) => `o${i}`)] } : g)) }
    for (let i = 0; i < LIMITS.classesMax; i++) c = must(makeClass(c, `o${i}`, `C${i}`, false, make))
    expect(refused(makeClass(c, 'oEye', 'one more', false, make))).toMatch(new RegExp(`at most ${LIMITS.classesMax} classes`))
  })

  it('adds a member right after the template, with a shape that follows each shape of the template', () => {
    const { c, k, m1, m2 } = family()
    expect(c.groups[0].objects).toEqual(['oEye', m1, m2])
    expect(membersOf(c, k).map(o => o.id)).toEqual([m1, m2])
    const member = objectById(c, m1)!
    expect(member).toMatchObject({ name: 'Eye 1', layer: 'body', classOf: k, axes: [] })
    expect(objectById(c, m2)!.name).toBe('Eye 2')
    const followed = member.shapes.map(id => shapeById(c, id)!)
    expect(followed.map(s => s.copyOf)).toEqual(['eye', 'pupil'])
    expect(followed.every(s => s.pts.length === 0 && s.hide === false && s.mirrorOf === null)).toBe(true)
    expect(followed[0]).toMatchObject({ name: 'eye', closed: true, z: 40, op: 1, view: 'both' })
    expect(classOfObject(c, member)!.id).toBe(k)
    expect(classOfObject(c, objectById(c, 'oEye')!)!.id).toBe(k)
    expect(followedShape(c, followed[0])!.id).toBe('eye')
    expect(outlineSize(c, followed[0])).toBe(4)          // as many points as the shape it follows
  })

  it('refuses a member the model cannot hold', () => {
    const { c, k } = family()
    expect(refused(addMember(c, 'gone'))).toMatch(/no such class/)
    const loose = { ...c, groups: c.groups.map(g => ({ ...g, objects: g.objects.filter(id => id !== 'oEye') })) }
    expect(refused(addMember(loose, k))).toMatch(/Put the template in a group/)
    let many = c
    for (let i = membersOf(c, k).length; i < LIMITS.membersMax; i++) many = must(addMember(many, k, make))
    expect(membersOf(many, k)).toHaveLength(LIMITS.membersMax)
    expect(refused(addMember(many, k, make))).toMatch(new RegExp(`at most ${LIMITS.membersMax} members`))
  })

  it('moves an object to another group', () => {
    const { c, m1 } = family()
    const moved = must(moveObjectToGroup(c, m1, 'gOther'))
    expect(moved.groups.find(g => g.id === 'gOther')!.objects).toEqual([m1])
    expect(moved.groups.find(g => g.id === 'gHead')!.objects).not.toContain(m1)
    expect(must(moveObjectToGroup(moved, m1, 'gOther'))).toBe(moved)
    expect(refused(moveObjectToGroup(c, 'gone', 'gOther'))).toMatch(/no such object/)
    expect(refused(moveObjectToGroup(c, m1, 'gone'))).toMatch(/no such group/)
  })

  it('does not move an object into a twin group, which follows its original', () => {
    const { c, m1 } = family()
    const twinned = must(makeTwin(c, 'group', 'gOther', make))
    const twinGroup = twinned.groups.find(g => g.mirrorOf === 'gOther')!
    expect(refused(moveObjectToGroup(twinned, m1, twinGroup.id))).toMatch(/twin group follows its original/)
  })
})

// ---------------------------------------------------------------------------------------------------- keeping members in step

describe('keeping the members in step with the template', () => {
  it('gives every member a shape for a shape the template gains, and takes away what the template loses', () => {
    const { c, m1, m2 } = family()
    const grown = { ...c, shapes: [...c.shapes, sharp('lash', [[78, 46], [102, 46], [102, 49], [78, 49]])], objects: c.objects.map(o => (o.id === 'oEye' ? { ...o, shapes: [...o.shapes, 'lash'] } : o)) }
    const synced = reconcileClasses(grown, make)
    for (const id of [m1, m2]) expect(shapesOf(synced, id).map(s => shapeById(synced, s)!.copyOf)).toEqual(['eye', 'pupil', 'lash'])
    expect(reconcileClasses(synced, make)).toBe(synced)                              // nothing more to do: the same content comes back
    const gone = removeShape(synced, 'pupil')
    for (const id of [m1, m2]) expect(shapesOf(gone, id).map(s => shapeById(gone, s)!.copyOf)).toEqual(['eye', 'lash'])
    expect(reconcileClasses(gone, make)).toBe(gone)
  })

  it('does not follow a twin of the template, and does not follow a shape twice', () => {
    const { c, m1 } = family()
    const paired = { ...c, shapes: [...c.shapes, sharp('eye2', [], { mirrorOf: 'eye' })], objects: c.objects.map(o => (o.id === 'oEye' ? { ...o, shapes: [...o.shapes, 'eye2'] } : o)) }
    expect(reconcileClasses(paired, make)).toBe(paired)
    const doubled = { ...c, shapes: [...c.shapes, sharp('again', [], { copyOf: 'eye' })], objects: c.objects.map(o => (o.id === m1 ? { ...o, shapes: [...o.shapes, 'again'] } : o)) }
    const fixed = reconcileClasses(doubled, make)
    expect(shapesOf(fixed, m1)).not.toContain('again')
    expect(fixed.shapes.some(s => s.id === 'again')).toBe(false)
  })

  it('leaves a model without classes alone', () => {
    const c = eyeModel()
    expect(reconcileClasses(c, make)).toBe(c)
  })

  it('takes the shapes of a removed template shape with it', () => {
    const { c, m1 } = family()
    const out = removeShape(c, 'eye')
    expect(shapesOf(out, m1).map(id => shapeById(out, id)!.copyOf)).toEqual(['pupil'])
    expect(publishFaults({ ...out, name: 'x' })).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------- drawing members

describe('drawing the template and its members', () => {
  it('draws a template that has no members like any object, and hides it once it has some', () => {
    const lone = must(makeClass(eyeModel(), 'oEye', 'Eye', true, make))
    expect(solve(lone).shapes.eye.visible).toBe(true)
    const { c, m1 } = family()
    const s = solve(c)
    expect(s.shapes.eye).toMatchObject({ visible: false, off: true })
    expect(s.shapes.eye.pre.length).toBe(4)                                       // still solved: anchors can read it
    expect(drawn(s, shapesOf(c, m1)[0]).visible).toBe(true)
  })

  it('draws a member the way the template draws, in the member\'s own group', () => {
    const { c, m1 } = family()
    const [eyeId, pupilId] = shapesOf(c, m1)
    const s = solve(c)
    const t = solve(c, {}, 'front', { show: ['oEye'] })
    expect(drawn(s, eyeId).d).toBe(t.shapes.eye.d)
    expect(drawn(s, pupilId).d).toBe(t.shapes.pupil.d)
    expect(box(s, eyeId)).toMatchObject({ x: 80, y: 50, w: 20, h: 10 })
    // in another group the same numbers are read in that group's frame: here a group that turns about (100, 55)
    const moved = must(moveObjectToGroup(c, m1, 'gOther'))
    const spun = solve(moved, { spin: 40 })
    expect(box(spun, eyeId).y).not.toBeCloseTo(50, 1)
    expect(box(spun, eyeId).w).not.toBeCloseTo(20, 1)
    expect(box(solve(moved), eyeId)).toMatchObject({ x: 80, y: 50, w: 20, h: 10 })
    expect(box(solve(c, { spin: 40 }), eyeId)).toMatchObject({ x: 80, y: 50, w: 20, h: 10 })                // the head group does not turn
  })

  it('follows what is done to the template: its points, its sliders, its back outline', () => {
    const { c, m1 } = family()
    const [eyeId] = shapesOf(c, m1)
    const edited = { ...c, shapes: c.shapes.map(s => (s.id === 'eye' ? { ...s, pts: P(WIDE) } : s)) }
    expect(box(solve(edited), eyeId)).toMatchObject({ x: 76, w: 28 })
    // a slider that moves a point of the template's eye moves it in every member
    const wider = must(recordPoints(must(addRange(c, newRange('open', 'Open', 'points', 'eye'))), 'open', 'eye', 'max', { ...shapeById(c, 'eye')!, pts: P(EYE).map((p, i) => (i === 1 || i === 2 ? { ...p, x: p.x + 10 } : p)) }))
    expect(box(solve(wider, { open: 100 }), eyeId).w).toBeGreaterThan(box(solve(wider), eyeId).w)
    const backed = { ...c, shapes: c.shapes.map(s => (s.id === 'eye' ? { ...s, back: P(BACK) } : s)) }
    expect(box(solve(backed, {}, 'back'), eyeId).w).toBeCloseTo(20, 3)
    expect(box(solve(backed, {}, 'back'), eyeId).x).toBeCloseTo(200 - 130, 3)                                  // the back outline, turned round
  })

  it('shows a family one member at a time: the first, the one chosen, or the one being shown', () => {
    const { c, k, m1, m2 } = family()
    const visible = (s: Solved) => [m1, m2, 'oEye'].filter(id => shapesOf(c, id).some(sid => s.shapes[sid].visible))
    expect(visible(solve(c))).toEqual([m1])
    expect(visible(solve(c, {}, 'front', { forms: { [classKey(k)]: m2 } }))).toEqual([m2])
    expect(visible(solve(c, {}, 'front', { forms: { [classKey(k)]: 'gone' } }))).toEqual([m1])
    expect(visible(solve(c, {}, 'front', { show: [m2] }))).toEqual([m2])
    expect(visible(solve(c, {}, 'front', { show: ['oEye'] }))).toEqual(['oEye'])                              // the pattern alone
  })

  it('draws every member of copies, and the pattern only when it is shown', () => {
    const { c, m1, m2 } = family(false)
    const visible = (s: Solved) => [m1, m2, 'oEye'].filter(id => shapesOf(c, id).some(sid => s.shapes[sid].visible))
    expect(visible(solve(c))).toEqual([m1, m2])
    expect(visible(solve(c, {}, 'front', { show: ['oEye'] }))).toEqual([m1, m2, 'oEye'])
  })

  it('gives a twin of a member the member\'s visibility', () => {
    const { c, k, m1, m2 } = family()
    const twinned = must(makeTwin(c, 'object', m1, n => `${n}_tw`))
    const twin = twinned.objects.find(o => o.mirrorOf === m1)!
    const on = (s: Solved) => shapesOf(twinned, twin.id).every(id => s.shapes[id].visible)
    expect(on(solve(twinned))).toBe(true)
    expect(on(solve(twinned, {}, 'front', { forms: { [classKey(k)]: m2 } }))).toBe(false)
    expect(twin.classOf ?? null).toBeNull()
  })

  it('lets each member choose its own form on the template\'s axes', () => {
    const { c, k, m1, m2 } = family(false)
    const [e1] = shapesOf(c, m1), [e2] = shapesOf(c, m2)
    expect(axesFor(c, objectById(c, m1)!).map(a => a.id)).toEqual(['aShape'])
    const s = solve(c, {}, 'front', { forms: { [formKey(m1, 'aShape')]: 'wide' } })
    expect(box(s, e1)).toMatchObject({ x: 76, w: 28 })                                // the wide outline
    expect(box(s, e2)).toMatchObject({ x: 80, w: 20 })                                // the other member keeps the base
    expect(box(solve(c, {}, 'front', { forms: { [formKey('oEye', 'aShape')]: 'wide' } }), e2)).toMatchObject({ w: 20 })   // the template's own choice is the template's
    const shut = solve(c, {}, 'front', { forms: { [formKey(m2, 'aShape')]: 'shut' } })
    expect(shut.shapes[shapesOf(c, m2)[1]].visible).toBe(false)                       // a form that hides the pupil hides the member's
    expect(shut.shapes[shapesOf(c, m1)[1]].visible).toBe(true)
    expect(k).toBeTruthy()
  })

  it('draws an outline of its own for a shape the member has points for, and a ghost of what it would be', () => {
    const { c, m1 } = family(false)
    const [eyeId] = shapesOf(c, m1)
    const own = { ...c, shapes: c.shapes.map(s => (s.id === eyeId ? { ...s, pts: P(OWN) } : s)) }
    const s = solve(own)
    expect(box(s, eyeId)).toMatchObject({ x: 82, y: 52, w: 16, h: 6 })
    expect(s.shapes[eyeId].ghost).toBe(solve(c).shapes[eyeId].d)                       // the template's outline, in the member's place
    expect(solve(c).shapes[eyeId].ghost).toBe('')
    expect(solve(own).shapes[shapesOf(own, m1)[1]].ghost).toBe('')
    const back = followTemplate(own, eyeId)
    expect(shapeById(back, eyeId)!.pts).toEqual([])
    expect(box(solve(back), eyeId)).toMatchObject({ w: 20 })
    expect(followTemplate(c, 'eye')).toEqual(c)                                        // a shape of the template does not follow anything
  })

  it('leaves out a shape the member hides, and lets anchors read it all the same', () => {
    const { c, m1 } = family(false)
    const [, pupilId] = shapesOf(c, m1)
    const hidden = setShapeHide(c, pupilId, true)
    const s = solve(hidden)
    expect(s.shapes[pupilId]).toMatchObject({ visible: false, off: false })
    expect(s.shapes[pupilId].pre.length).toBe(4)
    expect(setShapeHide(hidden, pupilId, false)).toEqual(c)
    expect(setShapeHide(c, 'pupil', true)).toEqual(c)                                  // not for a shape of the template itself
  })

  it('gives finite shapes whatever the class settings', () => {
    const { c, k, m1, m2 } = family()
    for (const exclusive of [true, false]) {
      for (const show of [[], ['oEye'], [m1], [m1, m2], ['gone']]) {
        for (const choice of [m1, m2, 'gone']) {
          for (const view of ['front', 'back'] as const) {
            const out = solve(setExclusive(c, k, exclusive), { spin: 12 }, view, { show, forms: { [classKey(k)]: choice, [formKey(m1, 'aShape')]: 'wide', [formKey(m2, 'aShape')]: 'shut' }, hidden: ['gHead'] })
            for (const sh of Object.values(out.shapes)) { expect(sh.d).not.toMatch(/NaN|Infinity/); expect(sh.ghost).not.toMatch(/NaN|Infinity/) }
          }
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------- leaving a class

describe('leaving a class', () => {
  it('detaches a member: it keeps what it followed as its own, with the template\'s forms and its own choice', () => {
    const { c, m1, m2 } = family(false)
    const [eyeId, pupilId] = shapesOf(c, m1)
    const prepared = setShapeHide(c, shapesOf(c, m2)[1], true)
    const out = must(detachMember(prepared, m2))
    const member = objectById(out, m2)!
    expect(member.classOf).toBeNull()
    expect(member.shapes).toHaveLength(1)                                             // the pupil it hid is gone
    const kept = shapeById(out, member.shapes[0])!
    expect(kept).toMatchObject({ copyOf: null, hide: false })
    expect(kept.pts.map(p => [p.x, p.y])).toEqual(EYE)
    expect(member.axes!.map(a => a.id)).toEqual(['aShape'])
    expect(member.axes![0].options[1].ovr).toEqual([{ shape: member.shapes[0], pts: P(WIDE) }])    // the form's outline for its own eye shape
    expect(member.axes![0].options[2].ovr).toEqual([])                                 // what it changed for the shape it dropped goes
    // from now on it stands alone: the template can change, it does not
    const edited = { ...out, shapes: out.shapes.map(s => (s.id === 'eye' ? { ...s, pts: P(WIDE) } : s)) }
    expect(box(solve(edited), member.shapes[0])).toMatchObject({ x: 80, w: 20 })
    expect(box(solve(edited), eyeId)).toMatchObject({ x: 76, w: 28 })                  // the other member still follows
    expect(box(solve(edited, {}, 'front', { forms: { [formKey(m2, 'aShape')]: 'wide' } }), member.shapes[0])).toMatchObject({ x: 76, w: 28 })
    expect(publishFaults({ ...out, name: 'x' })).toEqual([])
    expect(pupilId).toBeTruthy()
    expect(refused(detachMember(out, m2))).toMatch(/not a member/)
  })

  it('keeps an outline of its own when it detaches, and forgets the family choice that named it', () => {
    const { c, k, m1 } = family()
    const [eyeId] = shapesOf(c, m1)
    const own = { ...c, shapes: c.shapes.map(s => (s.id === eyeId ? { ...s, pts: P(OWN) } : s)), presets: [{ id: 'p', name: 'Sleepy', kind: 'Style', scope: 'gHead', values: {}, hidden: [], forms: { [classKey(k)]: m1 } }] }
    const out = must(detachMember(own, m1))
    expect(shapeById(out, eyeId)!.pts.map(p => [p.x, p.y])).toEqual(OWN)
    expect(out.presets![0].forms).toEqual({})
  })

  it('deletes a class: every member is detached and the template is an ordinary object again', () => {
    const { c, k, m1, m2 } = family()
    const out = must(deleteClass({ ...c, presets: [{ id: 'p', name: 'Sleepy', kind: 'Style', scope: 'gHead', values: {}, hidden: [], forms: { [classKey(k)]: m2 } }] }, k))
    expect(out.classes).toEqual([])
    expect(out.objects.every(o => !o.classOf)).toBe(true)
    expect(shapeById(out, shapesOf(out, m1)[0])!.pts).toHaveLength(4)
    expect(out.presets![0].forms).toEqual({})
    expect(solve(out).shapes.eye.visible).toBe(true)
    expect(publishFaults({ ...out, name: 'x' })).toEqual([])
    expect(refused(deleteClass(out, k))).toMatch(/no such class/)
  })

  it('lets a template be deleted: its members keep their look', () => {
    const { c, k, m1 } = family()
    const first = detachBeforeRemoval(c, { objects: ['oEye'] })
    const out = removeObject(first, 'oEye')
    expect(out.classes).toEqual([])
    expect(objectById(out, m1)).toMatchObject({ classOf: null })
    expect(shapeById(out, shapesOf(out, m1)[0])!.pts).toHaveLength(4)
    expect(publishFaults({ ...out, name: 'x' })).toEqual([])
    expect(k).toBeTruthy()
    // a member being deleted leaves the class and the other members as they were
    const gone = removeObject(detachBeforeRemoval(c, { objects: [m1] }), m1)
    expect(gone.classes).toHaveLength(1)
    expect(membersOf(gone, k)).toHaveLength(1)
    expect(detachBeforeRemoval(c, { objects: ['nothing'] })).toBe(c)
  })

  it('refuses to publish what the server refuses, in the same words', () => {
    const { c, k, m1 } = family()
    const named = { ...c, name: 'x' }
    expect(publishFaults(named)).toEqual([])
    const noTemplate = { ...named, classes: [{ id: k, name: 'Eye', template: 'gone', exclusive: true }] }
    expect(publishFaults(noTemplate)).toContain('Class Eye has a template that does not exist.')
    expect(publishFaults({ ...named, objects: named.objects.map(o => (o.id === m1 ? { ...o, classOf: 'c_gone' } : o)) })).toContain('Object Eye 1 is a member of a class that does not exist.')
    expect(publishFaults({ ...named, objects: named.objects.map(o => (o.id === 'oEye' ? { ...o, classOf: k } : o)) })).toEqual(expect.arrayContaining(['Class Eye has a template that is a member of a class.', 'Object Eye is a member of the class it is the template of.']))
    expect(publishFaults({ ...named, shapes: named.shapes.map(s => (s.id === shapesOf(c, m1)[0] ? { ...s, copyOf: 'gone' } : s)) })).toContain('Shape eye copies a shape that does not exist.')
    expect(publishFaults({ ...named, shapes: named.shapes.map(s => (s.id === 'eye' ? { ...s, copyOf: 'pupil' } : s)) })).toContain('Shape eye copies a shape but is not in a member of a class.')
    expect(publishFaults({ ...named, shapes: named.shapes.map(s => (s.id === shapesOf(c, m1)[0] ? { ...s, pts: P(WIDE).slice(0, 2) } : s)) })).toContain('Shape eye needs at least 3 points.')
  })
})

// ---------------------------------------------------------------------------------------------------- counting, previews and limits

describe('what the test state and the previews say about classes', () => {
  it('counts the member of a family that is not the first, and the forms members choose', () => {
    const { c, k, m1, m2 } = family()
    expect(formsAway(c, {})).toBe(0)
    expect(formsAway(c, { [classKey(k)]: m2 })).toBe(1)
    expect(formsAway(c, { [classKey(k)]: m1 })).toBe(0)
    expect(formsAway(c, { [formKey(m1, 'aShape')]: 'wide', [formKey('oEye', 'aShape')]: 'wide' })).toBe(2)
    expect(awayCount(c, { values: {}, forms: { [classKey(k)]: m2 }, hidden: [] })).toBe(1)
  })

  it('draws a random member of a family and a random form for each member, and the ends for the stress previews', () => {
    const { c, k, m1, m2 } = family()
    const specs = Array.from({ length: 20 }, (_, i) => previewSpecs(i + 1, 'rand', 6, c.ranges, c)).flat()
    expect(new Set(specs.map(p => p.forms[classKey(k)]))).toEqual(new Set([m1, m2]))
    expect(specs.some(p => p.forms[formKey(m1, 'aShape')] === 'shut')).toBe(true)
    expect(previewSpecs(1, 'min', 3, c.ranges, c).every(p => p.forms[classKey(k)] === m1)).toBe(true)
    expect(previewSpecs(1, 'max', 3, c.ranges, c).every(p => p.forms[classKey(k)] === m2 && p.forms[formKey(m2, 'aShape')] === 'shut')).toBe(true)
    expect(previewSpecs(1, 'rand', 3, c.ranges, family(false).c).every(p => Object.keys(p.forms).every(key => !key.startsWith('class:')))).toBe(true)
  })

  it('warns at the limits that are counted', () => {
    const { c, k } = family()
    let many = c
    for (let i = membersOf(c, k).length; i <= LIMITS.membersWarn; i++) many = must(addMember(many, k, make))
    expect(limitNotes(many).some(n => n.level === 'warn' && /members/.test(n.text))).toBe(true)
    expect(limitNotes(c).some(n => /members|classes/.test(n.text))).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------- styles

describe('styles', () => {
  function styled() {
    const f = family()
    let c = f.c
    c = { ...c, groups: [...c.groups, newGroup('gHand', 'Hand', null, [])], objects: [...c.objects, { id: 'oHand', name: 'Hand', layer: 'body', shapes: [], axes: [{ id: 'aGrip', name: 'Grip', initial: 'open', options: [{ id: 'open', name: 'Open', ovr: [] }, { id: 'fist', name: 'Fist', ovr: [] }] }] }] }
    c = { ...c, groups: c.groups.map(g => (g.id === 'gHand' ? { ...g, objects: ['oHand'] } : g)) }
    c = { ...c, ranges: c.ranges.map(r => (r.id === 'spin' ? { ...r, scope: 'gHead' } : r)) }
    return { ...f, c }
  }

  it('keeps the look of an object: the forms, the sliders listed under it, the family member shown', () => {
    const { c, k, m2 } = styled()
    const state = { values: { spin: 20 }, forms: { [classKey(k)]: m2, [formKey(m2, 'aShape')]: 'wide', [formKey('oHand', 'aGrip')]: 'fist' }, hidden: ['oEye', 'oHand'] }
    const e = saveStyle(c, state, 'gHead', '  Sleepy  ', 'Style', make)
    const style = must(e).presets!.at(-1)!
    expect(style).toEqual({ id: e.ok && e.presetId, name: 'Sleepy', kind: 'Style', scope: 'gHead', values: { spin: 20 }, hidden: ['oEye'], forms: { [classKey(k)]: m2, [formKey(m2, 'aShape')]: 'wide' } })
    const mine = must(saveStyle(c, state, 'oHand', 'Fist', 'Style', make)).presets!.at(-1)!
    expect(mine).toMatchObject({ scope: 'oHand', values: {}, hidden: ['oHand'], forms: { [formKey('oHand', 'aGrip')]: 'fist' } })
    expect(refused(saveStyle(c, state, 'gone', 'x'))).toMatch(/no such object or group/)
    expect(scopeOf(c, 'gone')).toBeNull()
    expect(scopeOf(c, 'gHead')!.objects.map(o => o.id)).toEqual(['oEye', ...membersOf(c, k).map(o => o.id)])
  })

  it('applies a style: its forms and member, and puts back what other styles of its kind in its scope set', () => {
    const { c, k, m1, m2 } = styled()
    const sleepy = must(saveStyle(c, { values: { spin: 20 }, forms: { [classKey(k)]: m2, [formKey(m2, 'aShape')]: 'wide' }, hidden: [] }, 'gHead', 'Sleepy', 'Style', make))
    const alert = must(saveStyle(sleepy, restState(sleepy), 'gHead', 'Alert', 'Style', make))
    const fist = must(saveStyle(alert, { values: {}, forms: { [formKey('oHand', 'aGrip')]: 'fist' }, hidden: [] }, 'oHand', 'Fist', 'Style', make))
    const by = (name: string) => fist.presets!.find(p => p.name === name)!
    let state = applyPreset(fist, restState(fist), by('Fist'))
    state = applyPreset(fist, state, by('Sleepy'))
    expect(state.forms).toMatchObject({ [classKey(k)]: m2, [formKey(m2, 'aShape')]: 'wide', [formKey('oHand', 'aGrip')]: 'fist' })
    expect(state.values.spin).toBe(20)
    expect(isOn(fist, state, by('Sleepy'))).toBe(true)
    expect(isOn(fist, state, by('Alert'))).toBe(false)
    state = applyPreset(fist, state, by('Alert'))
    expect(state.forms).toEqual({ [formKey('oHand', 'aGrip')]: 'fist' })               // the head's styles are replaced; the hand's is not
    expect(state.values.spin).toBe(0)
    expect(isOn(fist, state, by('Alert'))).toBe(true)
    expect(isOn(fist, state, by('Fist'))).toBe(true)
    expect([...footprint(fist, 'Style', 'gHead').forms].sort()).toEqual([classKey(k), formKey(m2, 'aShape')].sort())
    expect([...footprint(fist, 'Style', null).forms]).toEqual([])
    expect(m1).toBeTruthy()
  })

  it('draws the style it applies', () => {
    const { c, k, m1, m2 } = styled()
    const withStyle = must(saveStyle(c, { values: {}, forms: { [classKey(k)]: m2, [formKey(m2, 'aShape')]: 'wide' }, hidden: [] }, 'gHead', 'Round and wide', 'Style', make))
    const state = applyPreset(withStyle, restState(withStyle), withStyle.presets!.at(-1)!)
    const s = solve(withStyle, state.values, 'front', state)
    expect(shapesOf(withStyle, m1).some(id => s.shapes[id].visible)).toBe(false)
    expect(box(s, shapesOf(withStyle, m2)[0])).toMatchObject({ x: 76, w: 28 })
  })

  it('updates a style from the current look, within its scope', () => {
    const { c, m2 } = styled()
    const one = must(saveStyle(c, restState(c), 'gHead', 'Look', 'Style', make))
    const id = one.presets![0].id
    const updated = updatePreset(one, id, { values: { spin: 10 }, forms: { [formKey(m2, 'aShape')]: 'shut', [formKey('oHand', 'aGrip')]: 'fist' }, hidden: ['oHand'] })
    expect(updated.presets![0]).toMatchObject({ scope: 'gHead', name: 'Look', values: { spin: 10 }, hidden: [], forms: { [formKey(m2, 'aShape')]: 'shut' } })
    expect(stylesOf(updated, 'gHead').map(p => p.name)).toEqual(['Look'])
    expect(stylesOf(updated, 'oHand')).toEqual([])
  })

  it('goes when its scope goes, and loses the choices that name what is gone', () => {
    const { c, k, m1, m2 } = styled()
    const withStyles = must(saveStyle(must(saveStyle(c, restState(c), 'oHand', 'Hand look', 'Style', make)), { values: {}, forms: { [classKey(k)]: m2, [formKey(m2, 'aShape')]: 'wide' }, hidden: [] }, 'gHead', 'Head look', 'Style', make))
    expect(removeObject(withStyles, 'oHand').presets!.map(p => p.name)).toEqual(['Head look'])
    const noMember = removeObject(detachBeforeRemoval(withStyles, { objects: [m2] }), m2)
    expect(noMember.presets!.find(p => p.name === 'Head look')!.forms).toEqual({})
    expect(publishFaults({ ...noMember, name: 'x' })).toEqual([])
    expect(publishFaults({ ...withStyles, name: 'x' })).toEqual([])
    expect(m1).toBeTruthy()
  })

  it('refuses to publish a style that names something that is not there', () => {
    const { c, k, m2 } = styled()
    const good = must(saveStyle(c, { values: {}, forms: { [classKey(k)]: m2, [formKey(m2, 'aShape')]: 'wide' }, hidden: [] }, 'gHead', 'Look', 'Style', make))
    const bad = (forms: Record<string, string>, scope = 'gHead') => publishFaults({ ...good, name: 'x', presets: [{ ...good.presets![0], scope, forms }] })
    expect(bad(good.presets![0].forms!)).toEqual([])
    expect(bad({}, 'gone')).toContain('Preset Look belongs to something that does not exist.')
    const wrong: Array<Record<string, string>> = [{ [formKey(m2, 'aShape')]: 'f_gone' }, { [formKey(m2, 'aGone')]: 'wide' }, { 'class:gone': m2 }, { [classKey(k)]: 'oEye' }, { 'oGone.aShape': 'wide' }]
    for (const forms of wrong) {
      expect(bad(forms)).toContain('Preset Look chooses a form that does not exist.')
    }
  })
})
