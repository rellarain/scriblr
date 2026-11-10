import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPreset } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, publishFaults, removeObject, removeShape, starterContent } from '../modelContent'
import { hexHsl, hslHex, paintOf, removeColour, removeSlot, resolveColour, resolveLocked, slotById, type Colouring } from './colour'
import { newShape } from './edit'
import { activeLocks, objectLocks, setObjectLock, setStyleLock, slotsUsedBy } from './locks'
import { drawOrder, shapesInOrder } from './order'
import { makeTwin } from './pairEdit'
import { applyPreset, awayCount, clearedBy, isOn, restState, savePreset, saveStyle, updatePreset, type TestState } from './presets'
import { previewSpecs, specState } from './previews'
import type { Edit } from './rigEdit'
import { solve } from './rig'

// Complete variants, locked and free parts of a colour, and styles that put an object's shapes in another order (phase D3a).
const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
let n = 0
const make = (prefix: string) => `${prefix}_${++n}`
const SLIT = [{ x: 86, y: 44, m: 's' as const }, { x: 94, y: 44, m: 's' as const }, { x: 94, y: 45, m: 's' as const }, { x: 86, y: 45, m: 's' as const }]

// An Eye (white, iris painted from the Eye slot, pupil) with an axis of two expressions, a style that hides the pupil and draws the iris behind the white and locks the
// lightness of the eye colour, and a style of another kind that only changes the expression. Two variants of the kind Age: Elder (slit eye, that style, a blue eye) and Young (a dark eye).
function eyed(over: Partial<ModelContent> = {}): ModelContent {
  let c = starterContent('Adult')
  c = addGroup(c, newGroup('gH', 'Head'))
  c = addObject(c, 'gH', {
    id: 'oE', name: 'Eye', layer: 'body', shapes: [],
    axes: [{ id: 'aShape', name: 'Shape', initial: 'round', options: [{ id: 'round', name: 'Round', ovr: [] }, { id: 'slit', name: 'Slit', ovr: [{ shape: 'iris', pts: SLIT }] }] }],
  })
  c = addShape(c, 'oE', { ...newShape('white', 'White', 'oval', box(84, 41, 12, 8)), gray: 100 })
  c = addShape(c, 'oE', { ...newShape('iris', 'Iris', 'oval', box(88, 42, 5, 5)), slot: 'k_eye' })
  c = addShape(c, 'oE', newShape('pupil', 'Pupil', 'oval', box(90, 43, 2, 2)))
  const presets: ModelPreset[] = [
    { id: 'stDeep', name: 'Deep', kind: 'Style', scope: 'oE', values: {}, hidden: ['pupil'], forms: {}, order: ['iris', 'white'], hsl: { k_eye: { h: null, s: null, l: 20 } } },
    { id: 'stSlit', name: 'Slit', kind: 'Look', scope: 'oE', values: {}, hidden: [], forms: { 'oE.aShape': 'slit' } },
    { id: 'vElder', name: 'Elder', kind: 'Age', values: {}, hidden: [], forms: { 'oE.aShape': 'slit' }, styles: { oE: 'stDeep' }, picks: { k_eye: 'c_eye_8' } },
    { id: 'vYoung', name: 'Young', kind: 'Age', values: {}, hidden: [], picks: { k_eye: 'c_eye_1' } },
  ]
  return { ...c, presets, ...over }
}
const preset = (c: ModelContent, id: string): ModelPreset => c.presets!.find(p => p.id === id)!

describe('a variant is a bundle of choices over the same shapes', () => {
  const c = eyed()
  it('sets the expression, turns a style on and picks a default colour', () => {
    const s = applyPreset(c, restState(c), preset(c, 'vElder'))
    expect(s.forms['oE.aShape']).toBe('slit')
    expect(s.hidden).toEqual(['pupil'])                                   // what the style hides
    expect(s.order).toEqual({ oE: ['iris', 'white'] })                    // and the order it draws in
    expect(s.colours).toEqual({ k_eye: { src: 'colour', id: 'c_eye_8' } })
  })
  it('puts back what the variants of its kind controlled before: the style, the expression and the colour', () => {
    const elder = applyPreset(c, restState(c), preset(c, 'vElder'))
    const young = applyPreset(c, elder, preset(c, 'vYoung'))
    expect(young.forms['oE.aShape']).toBeUndefined()                      // Young says nothing of the expression, so it is back to the default
    expect(young.hidden).toEqual([])
    expect(young.order).toBeUndefined()
    expect(young.colours).toEqual({ k_eye: { src: 'colour', id: 'c_eye_1' } })
  })
  it('leaves a colour of a slot no variant of the kind picks alone', () => {
    const rolled: TestState = { ...restState(c), colours: { k_skin: { src: 'colour', id: 'c_skin_3' } } }
    expect(applyPreset(c, rolled, preset(c, 'vElder')).colours).toEqual({ k_skin: { src: 'colour', id: 'c_skin_3' }, k_eye: { src: 'colour', id: 'c_eye_8' } })
  })
  it('keeps the brightness and opacity already set for a colour that is picked again', () => {
    const tuned: TestState = { ...restState(c), colours: { k_eye: { src: 'colour', id: 'c_eye_8', l: 70, a: 90 } } }
    expect(applyPreset(c, tuned, preset(c, 'vElder')).colours?.k_eye).toEqual({ src: 'colour', id: 'c_eye_8', l: 70, a: 90 })
  })
  it('does not undo what it sets itself when one of the styles it clears controls the same thing', () => {
    // Elder sets the slit expression and its style Deep; the other style of the object (Slit) also controls that axis, and is cleared first
    const both = eyed({ presets: [...eyed().presets!.filter(p => p.id !== 'vElder'), { id: 'vElder', name: 'Elder', kind: 'Age', values: {}, hidden: [], forms: { 'oE.aShape': 'slit' }, styles: { oE: 'stDeep' } }] })
    expect(applyPreset(both, restState(both), preset(both, 'vElder')).forms['oE.aShape']).toBe('slit')
  })
  it('is on exactly when every part of it is as it sets it', () => {
    const c2 = eyed()
    const elder = preset(c2, 'vElder')
    expect(isOn(c2, restState(c2), elder)).toBe(false)
    const on = applyPreset(c2, restState(c2), elder)
    expect(isOn(c2, on, elder)).toBe(true)
    expect(isOn(c2, { ...on, colours: { k_eye: { src: 'colour', id: 'c_eye_1' } } }, elder)).toBe(false)     // another colour
    expect(isOn(c2, { ...on, order: undefined }, elder)).toBe(false)                                            // the style's order is gone
    expect(isOn(c2, { ...on, forms: {} }, elder)).toBe(false)                                                   // another expression
    expect(isOn(c2, { ...on, colours: { ...on.colours, k_eye: { ...on.colours!.k_eye, l: 10 } } }, elder)).toBe(true)   // brightness is not a pick
  })
  it('ignores a style or a colour that is not there', () => {
    const odd = eyed({ presets: [{ id: 'vOdd', name: 'Odd', kind: 'Age', values: {}, hidden: [], styles: { oE: 'gone', oX: 'stDeep' }, picks: { k_eye: 'gone', k_x: 'c' } }] })
    const s = applyPreset(odd, restState(odd), preset(odd, 'vOdd'))
    expect(s.colours).toBeUndefined()
    expect(s.hidden).toEqual([])
  })
})

describe('saving a look as a variant keeps the parts that are asked for', () => {
  const c = eyed()
  const looking = applyPreset(c, restState(c), preset(c, 'vElder'))
  it('keeps sliders and hidden things only by default', () => {
    const saved = must(savePreset(c, looking, 'Look', 'Variant', make))
    const p = saved.presets!.at(-1)!
    expect(p.forms).toBeUndefined(); expect(p.styles).toBeUndefined(); expect(p.picks).toBeUndefined()
    expect(p.hidden).toEqual([])                                           // a shape the style hides is not a thing a variant hides
  })
  it('keeps the expressions, the style that is on for each object and the default colours', () => {
    const p = must(savePreset(c, looking, 'Look', 'Variant', make, { forms: true, styles: true, colours: true })).presets!.at(-1)!
    expect(p.forms).toEqual({ 'oE.aShape': 'slit' })
    expect(p.styles).toEqual({ oE: 'stDeep' })
    expect(p.picks).toEqual({ k_eye: 'c_eye_8' })
  })
  it('keeps a default colour but not a swatch of the palette', () => {
    const swatch: TestState = { ...looking, colours: { k_eye: { src: 'swatch', id: 'k3' } } }
    expect(must(savePreset(c, swatch, 'Look', 'Variant', make, { colours: true })).presets!.at(-1)!.picks).toEqual({})
  })
  it('does not call a style that sets nothing the one that is on', () => {
    const quiet = eyed({ presets: [{ id: 'stNone', name: 'None', kind: 'Style', scope: 'oE', values: {}, hidden: [], forms: {} }] })
    expect(must(savePreset(quiet, restState(quiet), 'Look', 'Variant', make, { styles: true })).presets!.at(-1)!.styles).toEqual({})
  })
  it('updates from the current look, keeping the parts it already had', () => {
    const e = eyed()
    const before = preset(e, 'vElder')
    const next = updatePreset(e, 'vElder', restState(e))                      // everything at rest
    const p = preset(next, 'vElder')
    expect(p.forms).toEqual({}); expect(p.styles).toEqual({}); expect(p.picks).toEqual({})
    expect(p.name).toBe(before.name)
    const again = preset(updatePreset(e, 'vYoung', looking, { forms: true }), 'vYoung')
    expect(again.forms).toEqual({ 'oE.aShape': 'slit' })                    // asked for
    expect(again.picks).toEqual({ k_eye: 'c_eye_8' })                       // it had a pick, so it keeps picking
    expect(again.styles).toBeUndefined()                                    // it had none and none was asked for
  })
})

describe('a style that rearranges the shapes of its object', () => {
  const c = eyed()
  it('sets the order and hides its shapes while it is on, and puts both back when another of its kind is on', () => {
    const on = applyPreset(c, restState(c), preset(c, 'stDeep'))
    expect(on.order).toEqual({ oE: ['iris', 'white'] }); expect(on.hidden).toEqual(['pupil'])
    const other = eyed({ presets: [...c.presets!, { id: 'stOther', name: 'Other', kind: 'Style', scope: 'oE', values: {}, hidden: [], forms: {} }] })
    const off = applyPreset(other, on, preset(other, 'stOther'))              // another style of the same kind
    expect(off.order).toBeUndefined(); expect(off.hidden).toEqual([])
    expect(clearedBy(c, on, preset(c, 'stDeep')).order).toBeUndefined()
    expect(applyPreset(c, on, preset(c, 'stSlit')).order).toEqual({ oE: ['iris', 'white'] })   // a style of another kind leaves it
  })
  it('keeps the order and the hidden shapes of the object when the look is saved as a style', () => {
    const s: TestState = { ...restState(c), hidden: ['pupil', 'gH'], order: { oE: ['pupil', 'iris', 'white'] } }
    const saved = must(saveStyle(c, s, 'oE', 'Mine', 'Style', make)).presets!.at(-1)!
    expect(saved.order).toEqual(['pupil', 'iris', 'white'])
    expect(saved.hidden).toEqual(['pupil', 'gH'].filter(h => h !== 'gH'))    // the group is not in the object
  })
  it('counts as something away from rest, and is not a thing a group can hide', () => {
    expect(awayCount(c, { ...restState(c), order: { oE: ['iris', 'white'] }, hidden: ['pupil'] })).toBe(2)
  })
  it('draws the shapes in the order given and the ones left out behind them', () => {
    const rest = solve(c, {}, 'front').order.filter(id => ['white', 'iris', 'pupil'].includes(id))
    expect(rest).toEqual(['white', 'iris', 'pupil'])
    expect(solve(c, {}, 'front', { order: { oE: ['iris', 'white'] } }).order).toEqual(['pupil', 'iris', 'white'])
    expect(shapesInOrder(c, c.objects[0], { oE: ['pupil', 'iris', 'white'] })).toEqual(['pupil', 'iris', 'white'])
  })
  it('puts only the shapes of the object in a new order and leaves the places of the others alone', () => {
    let d = eyed()
    d = addObject(d, 'gH', { id: 'oH', name: 'Hair', layer: 'hair', shapes: [] })
    d = addShape(d, 'oH', newShape('hair', 'Hair', 'rounded', box(70, 20, 60, 20)))
    const before = solve(d, {}, 'front').order
    const after = solve(d, {}, 'front', { order: { oE: ['pupil', 'iris', 'white'] } }).order
    expect(after.indexOf('hair')).toBe(before.indexOf('hair'))
    expect(after.filter(id => id !== 'hair')).toEqual(['pupil', 'iris', 'white'])
  })
  it('does not draw a shape a style hides, nor its twin', () => {
    const twinned = must(makeTwin(eyed(), 'object', 'oE', make))
    const twinShape = twinned.shapes.find(s => s.mirrorOf === 'pupil')!
    const solved = solve(twinned, {}, 'front', { hidden: ['pupil'] })
    expect(solved.shapes.pupil.visible).toBe(false)
    expect(solved.shapes[twinShape.id].visible).toBe(false)
    expect(solved.shapes.iris.visible).toBe(true)
  })
  it('gives a twin object the order of its original, shape for shape', () => {
    const twinned = must(makeTwin(eyed(), 'object', 'oE', make))
    const twin = twinned.objects.find(o => o.mirrorOf === 'oE')!
    const seq = shapesInOrder(twinned, twin, { oE: ['pupil', 'iris', 'white'] })
    expect(seq.map(id => twinned.shapes.find(s => s.id === id)!.mirrorOf)).toEqual(['pupil', 'iris', 'white'])
  })
  it('sorts by z and the tree when no order is given', () => {
    const shapes = c.shapes.map(s => ({ id: s.id, z: s.z }))
    expect(drawOrder(c, shapes).map(s => s.id)).toEqual(drawOrder(c, shapes, undefined, {}).map(s => s.id))
  })
})

describe('a style that only holds parts of a colour', () => {
  const muted: ModelPreset = { id: 'stMuted', name: 'Muted', kind: 'Tone', scope: 'oE', values: {}, hidden: [], forms: {}, hsl: { k_eye: { h: null, s: 30, l: null } } }
  const vivid: ModelPreset = { id: 'stVivid', name: 'Vivid', kind: 'Tone', scope: 'oE', values: {}, hidden: [], forms: {}, hsl: { k_eye: { h: null, s: 90, l: null } } }
  const c = eyed({ presets: [...eyed().presets!, muted, vivid, { id: 'vQuiet', name: 'Quiet', kind: 'Mood', values: {}, hidden: [], styles: { oE: 'stMuted' } }] })
  it('sets nothing, so it is on only once it has been applied, and off again when another of its kind is applied or it is cleared', () => {
    const rest = restState(c)
    expect(isOn(c, rest, muted)).toBe(false); expect(isOn(c, rest, vivid)).toBe(false)
    const on = applyPreset(c, rest, muted)
    expect(isOn(c, on, muted)).toBe(true); expect(isOn(c, on, vivid)).toBe(false)
    const other = applyPreset(c, on, vivid)
    expect(isOn(c, other, muted)).toBe(false); expect(isOn(c, other, vivid)).toBe(true)
    expect(isOn(c, clearedBy(c, on, muted), muted)).toBe(false)
    expect(clearedBy(c, on, muted).on).toBeUndefined()
  })
  it('holds its parts of the colour while it is on, and counts as away from rest', () => {
    const on = applyPreset(c, restState(c), muted)
    expect(activeLocks(c, restState(c))).toEqual({})
    expect(activeLocks(c, on)).toEqual({ oE: { k_eye: { h: null, s: 30, l: null } } })
    expect(awayCount(c, on)).toBe(1)
  })
  it('is turned on by a variant that lists it, kept by a variant that is saved while it is on, and turned off with the variant\'s kind', () => {
    const quiet = preset(c, 'vQuiet')
    const on = applyPreset(c, restState(c), quiet)
    expect(on.on).toEqual(['stMuted'])
    expect(isOn(c, on, quiet)).toBe(true)
    expect(isOn(c, { ...restState(c), on: [] }, quiet)).toBe(false)           // a state that keeps marks knows it was not applied
    const saved = must(savePreset(c, on, 'Kept', 'Mood', make, { styles: true })).presets!.at(-1)!
    expect(saved.styles).toEqual({ oE: 'stMuted' })
    const loud = eyed({ presets: [...c.presets!, { id: 'vLoud', name: 'Loud', kind: 'Mood', values: {}, hidden: [], styles: { oE: 'stVivid' } }] })
    const next = applyPreset(loud, applyPreset(loud, restState(loud), preset(loud, 'vQuiet')), preset(loud, 'vLoud'))
    expect(next.on).toEqual(['stVivid'])
  })
})

describe('locked and free parts of a colour', () => {
  const eye = slotById(starterContent('x'), 'k_eye')!
  const blue = { src: 'colour', id: 'c_eye_8' } as const          // #2f4a7a
  it('replaces each locked part of the chosen colour and leaves the free ones', () => {
    const [h, s, l] = hexHsl('#2f4a7a')
    const r = resolveLocked(eye, blue, [], { h: 30, s: null, l: null })
    const [rh, rs, rl] = hexHsl(r.css)
    expect(rh).toBeCloseTo(30, 0); expect(rs).toBeCloseTo(s, 0); expect(rl).toBeCloseTo(l, 0)
    const sat = hexHsl(resolveLocked(eye, blue, [], { h: null, s: 10, l: null }).css)
    expect(sat[1]).toBeCloseTo(10, 0); expect(sat[0]).toBeCloseTo(h, 0)
    expect(hexHsl(resolveLocked(eye, blue, [], { h: null, s: null, l: 55 }).css)[2]).toBeCloseTo(55, 0)
  })
  it('holds the lightness inside the slot\'s range', () => {
    expect(hexHsl(resolveLocked(eye, blue, [], { h: null, s: null, l: 100 }).css)[2]).toBeCloseTo(eye.lMax, 0)
    expect(hexHsl(resolveLocked(eye, blue, [], { h: null, s: null, l: 0 }).css)[2]).toBeCloseTo(eye.lMin, 0)
  })
  it('is the colour itself when nothing is locked', () => {
    expect(resolveLocked(eye, blue, [], undefined)).toEqual(resolveColour(eye, blue, []))
    expect(resolveLocked(eye, blue, [], { h: null, s: null, l: null })).toEqual(resolveColour(eye, blue, []))
  })
  it('leaves a slot with no colour chosen gray, whatever is locked', () => {
    const gray = resolveColour(eye, undefined, [])
    expect(resolveLocked(eye, undefined, [], { h: 200, s: 80, l: 50 })).toEqual(gray)
    expect(resolveLocked(eye, { src: 'colour', id: 'gone' }, [], { h: 200, s: 80, l: 50 })).toEqual(resolveColour(eye, { src: 'colour', id: 'gone' }, []))
    expect(resolveLocked(eye, { src: 'swatch', id: 'gone' }, [{ id: 'k1', name: '', h: 20, s: 50 }], { h: 200, s: 80, l: 50 }).css).toBe(gray.css)
  })
  it('makes a swatch of the palette keep the locked hue and saturation', () => {
    const palette = [{ id: 'k1', name: 'Warm', h: 24, s: 46 }]
    const r = resolveLocked(eye, { src: 'swatch', id: 'k1' }, palette, { h: 200, s: 60, l: null })
    expect([r.h, r.s]).toEqual([200, 60])
    expect(r.l).toBe(eye.lRest)
    expect(r.css).toBe(hslHex(200, 60, eye.lRest))
  })

  const c = eyed()
  const chosen: Colouring = { palette: c.palette ?? [], choices: { k_eye: blue } }
  const fill = (colouring: Colouring, id: string) => paintOf(c, colouring, c.shapes.find(s => s.id === id)!).fill
  it('paints the shapes of an object that holds a part with it, and no other', () => {
    const free = fill(chosen, 'iris')
    const held = fill({ ...chosen, locks: { oE: { k_eye: { h: null, s: null, l: 20 } } } }, 'iris')
    expect(free).not.toBe(held)
    expect(hexHsl(held)[2]).toBeCloseTo(20, 0)
    expect(fill({ ...chosen, locks: { oOther: { k_eye: { h: null, s: null, l: 20 } } } }, 'iris')).toBe(free)
    expect(fill({ ...chosen, locks: { oE: { k_eye: { h: null, s: null, l: 20 } } } }, 'white')).toBe('#ffffff')       // a fixed gray has no slot
  })
  it('lets the colour of the slot change the free parts and not the locked ones', () => {
    const locks = { oE: { k_eye: { h: 120, s: null, l: null } } }
    const a = hexHsl(fill({ ...chosen, locks }, 'iris')), b = hexHsl(fill({ palette: [], choices: { k_eye: { src: 'colour', id: 'c_eye_2' } }, locks }, 'iris'))
    expect(a[0]).toBeCloseTo(120, 0); expect(b[0]).toBeCloseTo(120, 0)
    expect(a[2]).not.toBeCloseTo(b[2], 0)
  })

  it('belongs to the object, and a twin holds what its original holds', () => {
    const held = { ...c, objects: c.objects.map(o => (o.id === 'oE' ? { ...o, hsl: { k_eye: { h: 10, s: null, l: null } } } : o)) }
    const twinned = must(makeTwin(held, 'object', 'oE', make))
    const twin = twinned.objects.find(o => o.mirrorOf === 'oE')!
    expect(objectLocks(twinned)[twin.id]).toEqual({ k_eye: { h: 10, s: null, l: null } })
    expect(slotsUsedBy(twinned, twinned.objects.find(o => o.id === 'oE')!).map(s => s.id)).toEqual(['k_eye'])
  })
  it('adds the parts a style holds while it is on, and the object\'s own win', () => {
    const none = activeLocks(c, restState(c))
    expect(none).toEqual({})                                                            // Deep holds a lightness, but is not on
    const deep = applyPreset(c, restState(c), preset(c, 'stDeep'))
    expect(activeLocks(c, deep)).toEqual({ oE: { k_eye: { h: null, s: null, l: 20 } } })
    const owned = { ...c, objects: c.objects.map(o => (o.id === 'oE' ? { ...o, hsl: { k_eye: { h: 99, s: null, l: 70 } } } : o)) }
    expect(activeLocks(owned, applyPreset(owned, restState(owned), preset(owned, 'stDeep')))).toEqual({ oE: { k_eye: { h: 99, s: null, l: 70 } } })
  })
  it('sets one part at a time, drops a lock that holds nothing, and refuses a twin, a missing slot and a missing object', () => {
    let d = must(setObjectLock(c, 'oE', 'k_eye', 'h', 200))
    d = must(setObjectLock(d, 'oE', 'k_eye', 'l', 130))
    expect(d.objects[0].hsl).toEqual({ k_eye: { h: 200, s: null, l: 100 } })            // held to 0..100
    d = must(setObjectLock(d, 'oE', 'k_eye', 'h', null))
    d = must(setObjectLock(d, 'oE', 'k_eye', 'l', null))
    expect(d.objects[0].hsl).toEqual({})
    const twinned = must(makeTwin(c, 'object', 'oE', make))
    expect(refused(setObjectLock(twinned, twinned.objects.find(o => o.mirrorOf)!.id, 'k_eye', 'h', 1))).toMatch(/twin/)
    expect(refused(setObjectLock(c, 'oE', 'k_none', 'h', 1))).toMatch(/colour slot/)
    expect(refused(setObjectLock(c, 'oNone', 'k_eye', 'h', 1))).toMatch(/object/)
    const s = must(setStyleLock(c, 'stSlit', 'k_eye', 's', 40))
    expect(preset(s, 'stSlit').hsl).toEqual({ k_eye: { h: null, s: 40, l: null } })
    expect(refused(setStyleLock(c, 'vElder', 'k_eye', 's', 40))).toMatch(/style/)       // a variant is no style
  })
})

describe('what is left when things are deleted', () => {
  it('forgets the locks and picks of a deleted slot, and the picks of a deleted colour', () => {
    const c = eyed({ objects: eyed().objects.map(o => ({ ...o, hsl: { k_eye: { h: 1, s: null, l: null } } })) })
    const gone = must(removeSlot(c, 'k_eye'))
    expect(gone.objects[0].hsl).toEqual({})
    expect(preset(gone, 'stDeep').hsl).toEqual({})
    expect(preset(gone, 'vElder').picks).toEqual({})
    const off = removeColour(c, 'k_eye', 'c_eye_8')
    expect(preset(off, 'vElder').picks).toEqual({}); expect(preset(off, 'vYoung').picks).toEqual({ k_eye: 'c_eye_1' })
  })
  it('forgets the styles of a deleted object, the variants that turned them on, and the shapes of a deleted shape', () => {
    const c = eyed()
    const noObject = removeObject(c, 'oE')
    expect(noObject.presets?.map(p => p.id)).toEqual(['vElder', 'vYoung'])
    expect(preset(noObject, 'vElder').styles).toEqual({})
    const noShape = removeShape(c, 'white')
    expect(preset(noShape, 'stDeep').order).toEqual(['iris'])
    const noPupil = removeShape(c, 'pupil')
    expect(preset(noPupil, 'stDeep').hidden).toEqual([])
  })
})

describe('what a save and a publish say about them', () => {
  const faults = (c: ModelContent) => publishFaults(c)
  it('has none for a whole model, and normalising adds nothing the server would not', () => {
    const c = eyed({ objects: eyed().objects.map(o => ({ ...o, hsl: { k_eye: { h: 20, s: null, l: null } } })) })
    expect(faults(c)).toEqual([])
    const saved = normalizeContent(c)
    expect(saved.objects[0].hsl).toEqual({ k_eye: { h: 20, s: null, l: null } })
    expect(saved.presets!.find(p => p.id === 'vYoung')).toMatchObject({ styles: {}, picks: { k_eye: 'c_eye_1' }, hsl: {}, order: [] })
  })
  it('repairs locks the way the server does', () => {
    const c = eyed({ objects: eyed().objects.map(o => ({ ...o, hsl: { k_eye: { h: 400, s: -5, l: null }, k_none: { h: null, s: null, l: null } } })) })
    expect(normalizeContent(c).objects[0].hsl).toEqual({ k_eye: { h: 359, s: 0, l: null } })
    const dup = eyed({ presets: [{ id: 'st', name: 'St', kind: 'Style', scope: 'oE', values: {}, hidden: [], order: ['iris', 'iris', 'white'] }] })
    expect(normalizeContent(dup).presets![0].order).toEqual(['iris', 'white'])
  })
  it('says the server\'s words for each fault', () => {
    const bad = (p: ModelPreset) => faults(eyed({ presets: [...eyed().presets!, p] }))
    const base = { values: {}, hidden: [] as string[] }
    expect(bad({ id: 'a', name: 'A', kind: 'Age', ...base, styles: { oE: 'vElder' } })).toContain('Preset A turns on a style that does not exist.')
    expect(bad({ id: 'a', name: 'A', kind: 'Age', ...base, styles: { oX: 'stDeep' } })).toContain('Preset A turns on a style that does not exist.')
    expect(bad({ id: 'a', name: 'A', kind: 'Age', ...base, picks: { k_eye: 'nope' } })).toContain('Preset A picks a colour that does not exist.')
    expect(bad({ id: 'a', name: 'A', kind: 'Age', ...base, picks: { k_nope: 'c_eye_1' } })).toContain('Preset A picks a colour that does not exist.')
    expect(bad({ id: 'a', name: 'A', kind: 'Style', scope: 'oE', ...base, hsl: { k_nope: { h: 1, s: null, l: null } } })).toContain('Preset A locks a colour of a slot that does not exist.')
    expect(bad({ id: 'a', name: 'A', kind: 'Style', scope: 'oE', ...base, order: ['iris', 'elsewhere'] })).toContain('Preset A puts shapes in order that are not in its object.')
    expect(bad({ id: 'a', name: 'A', kind: 'Age', ...base, order: ['iris'] })).toContain('Preset A puts shapes in order that are not in its object.')
    expect(bad({ id: 'a', name: 'A', kind: 'Style', scope: 'oE', values: {}, hidden: ['elsewhere'] })).toContain('Preset A hides something that does not exist.')
    expect(bad({ id: 'a', name: 'A', kind: 'Age', values: {}, hidden: ['pupil'] })).toContain('Preset A hides something that does not exist.')   // a variant hides objects and groups
    const c = eyed({ objects: eyed().objects.map(o => ({ ...o, hsl: { k_nope: { h: 1, s: null, l: null } } })) })
    expect(faults(c)).toContain('Object Eye locks a colour of a slot that does not exist.')
  })
})

describe('previews', () => {
  it('draw the default colours a variant picks, finite and in the slot\'s colours', () => {
    const c = eyed()
    let picked = 0
    for (let seed = 1; seed <= 12; seed++) {
      for (const spec of previewSpecs(seed, 'rand', 6, c.ranges, c)) {
        const choice = spec.choices.k_eye
        if (choice?.src === 'colour' && (choice.id === 'c_eye_8' || choice.id === 'c_eye_1')) picked++
        expect(specState(spec).colours).toBe(spec.choices)
        if (spec.order) expect(Object.keys(spec.order)).toEqual(['oE'])
      }
    }
    expect(picked).toBeGreaterThan(0)
  })
})
