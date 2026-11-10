import { describe, expect, it } from 'vitest'
import type { ModelContent } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, objectById, publishFaults, removeObject, starterContent } from '../modelContent'
import { paintLayer, paletteOf } from './colour'
import { addMember, deleteClass, detachMember, makeClass } from './classEdit'
import { newShape } from './edit'
import { classKey } from './forms'
import { paintAttrs, paintDefs, paintShapes } from './paint'
import { toggleCut } from './paintEdit'
import { breakPair, makeTwin } from './pairEdit'
import { solve, solveAtRest } from './rig'
import { wearCheck } from './rigCheck'
import type { Edit } from './rigEdit'
import { LIMITS } from './limits'
import { coveringObjects, toggleUnder, underChoices, wearsRoundInACircle, wornUnder } from './wear'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
let n = 0
const make = (prefix: string) => `${prefix}_${++n}`
const colouring = (c: ModelContent) => ({ palette: paletteOf(c), choices: {}, values: {} })
const withUnder = (c: ModelContent, id: string, under: string[]): ModelContent => ({ ...c, objects: c.objects.map(o => (o.id === id ? { ...o, under } : o)) })

// A shirt (two shapes) worn under a jacket (a body, and a neckline helper that cuts a hole in it).
function dressed(): ModelContent {
  let c = starterContent('Adult')
  c = addGroup(c, newGroup('gT', 'Torso')); c = addGroup(c, newGroup('gJ', 'Outerwear'))
  c = addObject(c, 'gT', { id: 'oSh', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oSh', { ...newShape('shirt', 'Shirt', 'square', box(50, 20, 100, 80)), slot: 'k_cloth' })
  c = addShape(c, 'oSh', { ...newShape('collar', 'Collar', 'square', box(80, 10, 40, 14)), slot: 'k_cloth' })
  c = addObject(c, 'gJ', { id: 'oJa', name: 'Jacket', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oJa', { ...newShape('jacket', 'Jacket', 'square', box(60, 10, 80, 100)), slot: 'k_cloth' })
  c = addShape(c, 'oJa', { ...newShape('neckline', 'Neckline', 'oval', box(90, 8, 20, 20)), helper: true })
  c = must(toggleCut(c, 'jacket', 'neckline'))
  return withUnder(c, 'oSh', ['oJa'])
}
const item = (c: ModelContent, id: string, opts: Parameters<typeof solve>[3] = {}) => paintShapes(c, solve(c, {}, 'front', opts), colouring(c)).find(i => i.id === id)!

describe('painting a garment worn under others', () => {
  it('trims it to the outline of what it is worn under, and the garment over it is not trimmed', () => {
    const c = dressed(), solved = solveAtRest(c)
    const items = paintShapes(c, solved, colouring(c))
    const shirt = items.find(i => i.id === 'shirt')!, collar = items.find(i => i.id === 'collar')!
    expect(shirt.wear).toEqual({ key: 'oSh', ds: [solved.shapes.jacket.d] })            // the helper neckline is not an outline; the cut-out does not change the outline
    expect(collar.wear).toBe(shirt.wear)                                                  // the two shapes of the shirt share one clip
    expect(items.find(i => i.id === 'jacket')!.wear).toBeNull()
    expect(items.find(i => i.id === 'jacket')!.cutDs).toHaveLength(1)                     // the jacket's own cut-out is still its own
  })

  it('trims nothing when none of what it is worn under is shown', () => {
    const c = dressed()
    expect(item(c, 'shirt').wear).not.toBeNull()
    expect(item(c, 'shirt', { hidden: ['oJa'] }).wear).toBeNull()
    expect(item(c, 'shirt', { hidden: ['gJ'] }).wear).toBeNull()                          // the group of the jacket is off
    expect(paintShapes(withUnder(c, 'oSh', []), solveAtRest(c), colouring(c)).every(i => i.wear === null)).toBe(true)
  })

  it('shares one clip per garment in the definitions, and says which to draw inside', () => {
    const c = dressed()
    const items = paintShapes(c, solveAtRest(c), colouring(c))
    const defs = paintDefs(items, 'p').filter(d => d.kind === 'clip' && d.id.includes('-w-'))
    expect(defs).toHaveLength(1)
    expect(defs[0]).toMatchObject({ id: 'p-w-oSh', ds: [solveAtRest(c).shapes.jacket.d] })
    expect(paintAttrs(items.find(i => i.id === 'shirt')!, 'p').wear).toBe('url(#p-w-oSh)')
    expect(paintAttrs(items.find(i => i.id === 'jacket')!, 'p').wear).toBeUndefined()
  })

  it('trims a shading shape of the garment too, and leaves a helper alone', () => {
    let c = dressed()
    c = { ...c, shapes: c.shapes.map(s => (s.id === 'collar' ? { ...s, shade: { kind: 'shadow' as const, t: 0.2 } } : s.id === 'shirt' ? { ...s, helper: true } : s)) }
    expect(item(c, 'collar').wear).not.toBeNull()
    expect(item(c, 'shirt').wear).toBeNull()
  })

  it('does not count what a form hides, and follows the figure into the back view', () => {
    const c = dressed()
    const hidden = { ...c, shapes: c.shapes.map(s => (s.id === 'jacket' ? { ...s, view: 'front' as const } : s)) }
    expect(paintShapes(hidden, solve(hidden, {}, 'back'), colouring(hidden)).find(i => i.id === 'shirt')!.wear).toBeNull()       // the jacket has no back outline to trim to
    expect(paintShapes(hidden, solve(hidden, {}, 'front'), colouring(hidden)).find(i => i.id === 'shirt')!.wear).not.toBeNull()
  })
})

describe('what an object is worn under', () => {
  it('is what it names; a twin goes with its original, each on its own side', () => {
    let c = starterContent('Adult')
    c = addGroup(c, newGroup('gT', 'Torso'))
    for (const [o, s] of [['oSl', 'sleeve'], ['oJs', 'jsleeve']]) {
      c = addObject(c, 'gT', { id: o, name: o === 'oSl' ? 'Sleeve' : 'Jacket sleeve', layer: 'clothing', shapes: [] })
      c = addShape(c, o, { ...newShape(s, s, 'square', box(o === 'oSl' ? 20 : 15, 30, 20, 50)), slot: 'k_cloth' })
    }
    c = withUnder(c, 'oSl', ['oJs'])
    c = must(makeTwin(c, 'object', 'oSl', make)); c = must(makeTwin(c, 'object', 'oJs', make))
    const twinSl = c.objects.find(o => o.mirrorOf === 'oSl')!, twinJs = c.objects.find(o => o.mirrorOf === 'oJs')!
    expect(wornUnder(c, objectById(c, 'oSl')!)).toEqual(['oJs'])
    expect(wornUnder(c, twinSl)).toEqual([twinJs.id])
    const solved = solveAtRest(c)
    expect(item(c, twinSl.shapes[0]).wear).toEqual({ key: twinSl.id, ds: [solved.shapes[twinJs.shapes[0]].d] })
    // breaking the pair keeps it
    const broken = must(breakPair(c, 'object', twinSl.id))
    expect(objectById(broken, twinSl.id)!.under).toEqual([twinJs.id])
    expect(objectById(broken, twinSl.id)!.mirrorOf).toBeNull()
  })

  it('may be a family: its template and members count, and only the one shown trims', () => {
    let c = dressed()
    const made = makeClass(c, 'oJa', 'Jackets', true, make)
    c = must(made)
    const classId = made.ok ? made.classId! : ''
    const added = addMember(c, classId, make)
    c = must(added)
    const member = objectById(c, added.ok ? added.memberId! : '')!
    c = withUnder(c, 'oSh', [classId])
    expect(coveringObjects(c, objectById(c, 'oSh')!).map(o => o.id).sort()).toEqual(['oJa', member.id].sort())
    const solved = solveAtRest(c)
    const outlines = (sol: typeof solved) => [...objectById(c, 'oJa')!.shapes, ...member.shapes].filter(id => sol.shapes[id]?.visible && sol.shapes[id].d && !paintLayer(c, colouring(c), c.shapes.find(s => s.id === id)!).helper)
    const bodyShapes = outlines(solved)
    expect(bodyShapes).toHaveLength(1)                                                    // one jacket is shown, whichever
    expect(item(c, 'shirt').wear!.ds).toEqual([solved.shapes[bodyShapes[0]].d])
    // choosing the other member shows its outline
    const other = solve(c, {}, 'front', { forms: { [classKey(classId)]: member.id } })
    const shown = outlines(other)
    expect(paintShapes(c, other, colouring(c)).find(i => i.id === 'shirt')!.wear!.ds).toEqual(shown.map(id => other.shapes[id].d))
    // deleting the family takes it out of the list
    expect(objectById(must(deleteClass(c, classId)), 'oSh')!.under).toEqual([])
  })

  it('is the template\'s for a member that names nothing, its own once it names something, and kept when it stops following', () => {
    let c = dressed()
    const made = makeClass(c, 'oSh', 'Shirts', true, make)
    c = must(made)
    const added = addMember(c, made.ok ? made.classId! : '', make)
    c = must(added)
    const memberId = added.ok ? added.memberId! : ''
    expect(objectById(c, memberId)!.under ?? []).toEqual([])
    expect(wornUnder(c, objectById(c, memberId)!)).toEqual(['oJa'])
    expect(objectById(must(detachMember(c, memberId)), memberId)!.under).toEqual(['oJa'])
    const own = must(toggleUnder(c, memberId, 'oSh'))
    expect(wornUnder(own, objectById(own, memberId)!)).toEqual(['oSh'])
  })

  it('is cleaned when what it was worn under goes', () => {
    const c = dressed()
    expect(objectById(removeObject(c, 'oJa'), 'oSh')!.under).toEqual([])
  })
})

describe('putting a garment under another', () => {
  it('toggles it on and off, keeping the order', () => {
    let c = dressed()
    c = addObject(c, 'gT', { id: 'oCo', name: 'Coat', layer: 'clothing', shapes: [] })
    c = must(toggleUnder(c, 'oSh', 'oCo'))
    expect(objectById(c, 'oSh')!.under).toEqual(['oJa', 'oCo'])
    c = must(toggleUnder(c, 'oSh', 'oJa'))
    expect(objectById(c, 'oSh')!.under).toEqual(['oCo'])
  })

  it('refuses a twin, itself, what is not there, a garment that is worn under it already, and the limit', () => {
    const c = dressed()
    const twinned = must(makeTwin(c, 'object', 'oSh', make))
    expect(refused(toggleUnder(twinned, twinned.objects.find(o => o.mirrorOf)!.id, 'oJa'))).toMatch(/is a twin/)
    expect(refused(toggleUnder(c, 'oSh', 'oSh'))).toMatch(/cannot be worn under itself/)
    expect(refused(toggleUnder(c, 'oSh', 'nothing'))).toMatch(/no such garment or family/)
    expect(refused(toggleUnder(c, 'gone', 'oJa'))).toMatch(/no such object/)
    expect(refused(toggleUnder(c, 'oJa', 'oSh'))).toMatch(/Jacket cannot be worn under Shirt: that is worn under Jacket already/)
    const full = withUnder(c, 'oSh', Array.from({ length: LIMITS.underMax }, (_, i) => `x${i}`))
    expect(refused(toggleUnder(full, 'oSh', 'oJa'))).toMatch(/at most 24/)
    expect(objectById(must(toggleUnder(full, 'oSh', 'x3')), 'oSh')!.under).toHaveLength(LIMITS.underMax - 1)       // taking one out is always allowed
  })

  it('offers the other clothing, and families of clothing, but not itself, a twin, a member or the body', () => {
    let c = dressed()
    c = addObject(c, 'gT', { id: 'oBody', name: 'Torso', layer: 'body', shapes: [] })
    const made = makeClass(c, 'oJa', 'Jackets', true, make)
    c = must(made)
    c = must(addMember(c, made.ok ? made.classId! : '', make))
    expect(underChoices(c, 'oSh')).toEqual([{ id: 'oJa', name: 'Jacket', family: false }, { id: made.ok ? made.classId! : '', name: 'Jackets', family: true }])
    expect(underChoices(c, 'oJa').map(x => x.name)).toEqual(['Shirt'])                      // not its own family
  })
})

describe('what a save and Publish do', () => {
  it('names what is not there and the object itself, in the words of the server', () => {
    const c = dressed()
    expect(publishFaults(c).filter(f => /worn under/.test(f))).toEqual([])
    expect(publishFaults(withUnder(c, 'oSh', ['oGone'])).filter(f => /worn under/.test(f))).toEqual(['Object Shirt is worn under something that does not exist.'])
    expect(publishFaults(withUnder(c, 'oSh', ['oSh'])).filter(f => /worn under/.test(f))).toEqual(['Object Shirt is worn under itself.'])
  })

  it('keeps each garment once and no more than the limit, as the server does', () => {
    const c = withUnder(dressed(), 'oSh', ['oJa', 'oJa', ...Array.from({ length: 40 }, (_, i) => `x${i}`)])
    expect(objectById(normalizeContent(c), 'oSh')!.under).toHaveLength(LIMITS.underMax)
    expect(objectById(normalizeContent(c), 'oSh')!.under![0]).toBe('oJa')
    expect(objectById(normalizeContent(dressed()), 'oJa')!.under).toEqual([])
  })

  it('says in the Check panel when two garments are each worn under the other', () => {
    const c = dressed()
    expect(wearCheck(c)).toEqual([])
    const circle = withUnder(c, 'oJa', ['oSh'])
    expect(wearsRoundInACircle(circle, objectById(circle, 'oSh')!)).toBe(true)
    expect(wearCheck(circle).map(l => l.text)).toEqual(['Shirt is worn under something that is worn under it: they trim each other.', 'Jacket is worn under something that is worn under it: they trim each other.'])
  })
})
