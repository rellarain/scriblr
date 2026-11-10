import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelPreset, ModelShape } from '../../../../api/types'
import { NONE, type Selection } from './designerState'
import { blankContent, newGroup } from './modelContent'
import { CARD_MODES, displayed, expressionsOf, levelsOf, modesFor, nextMode, openPath, posesOf, searchHits, stepTo, storedBefore, stylesOfObject, variantsOf } from './treeNav'

const sharp = (id: string, name: string): ModelShape => ({ id, name, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: [[0, 0], [10, 0], [10, 10]].map(([x, y]) => ({ x, y, m: 's' as const })) })
const preset = (id: string, over: Partial<ModelPreset> = {}): ModelPreset => ({ id, name: id, kind: 'Pose', values: {}, hidden: [], ...over })

// Two groups; the first has two objects (the second with two shapes and an axis of two forms); the second has one.
function model(): ModelContent {
  return {
    ...blankContent('Adult'),
    shapes: [sharp('s1', 'Skull'), sharp('s2', 'Jaw'), sharp('s3', 'Arm shape')],
    objects: [
      { id: 'oHead', name: 'Head', layer: 'body', shapes: ['s1', 's2'], axes: [{ id: 'ax', name: 'Shape', initial: 'f1', options: [{ id: 'f1', name: 'Oval', ovr: [] }, { id: 'f2', name: 'Square', ovr: [] }] }] },
      { id: 'oNeck', name: 'Neck', layer: 'body', shapes: [] },
      { id: 'oArm', name: 'Arm', layer: 'body', shapes: ['s3'] },
    ],
    groups: [newGroup('gHead', 'Head group', null, ['oNeck', 'oHead']), newGroup('gArm', 'Arm group', null, ['oArm'])],
    presets: [preset('vElder', { kind: 'Age' }), preset('pWave', { scope: 'gArm' }), preset('stRed', { scope: 'oHead', kind: 'Style' }), preset('vChild', { kind: 'Age' })],
  }
}
const sel = (kind: Selection['kind'], id: string): Selection => ({ kind, id })

describe('what a selection opens', () => {
  it('opens the group, object and shape on the way to what is selected', () => {
    const c = model()
    expect(openPath(c, NONE)).toEqual({ group: null, object: null, shape: null })
    expect(openPath(c, sel('group', 'gHead')).group?.id).toBe('gHead')
    const o = openPath(c, sel('object', 'oHead'))
    expect([o.group?.id, o.object?.id, o.shape]).toEqual(['gHead', 'oHead', null])
    const s = openPath(c, sel('shape', 's2'))
    expect([s.group?.id, s.object?.id, s.shape?.id]).toEqual(['gHead', 'oHead', 's2'])
  })
  it('opens nothing for something that is gone', () => {
    expect(openPath(model(), sel('shape', 'gone'))).toEqual({ group: null, object: null, shape: null })
  })
})

describe('the levels of the tree', () => {
  const names = (l: ReturnType<typeof levelsOf>) => l.map(x => `${x.kind}:${(x.cards as Array<{ id: string }>).map(k => k.id).join(',')}|${(x.open as { id: string } | null)?.id ?? '-'}`)
  it('lists every group while none is open, topmost first', () => {
    expect(names(levelsOf(model(), NONE))).toEqual(['group:gArm,gHead|-'])
  })
  it('shows the open group with its objects under it, topmost first', () => {
    expect(names(levelsOf(model(), sel('group', 'gHead')))).toEqual(['group:gArm,gHead|gHead', 'object:oHead,oNeck|-'])
  })
  it('goes down to the shapes of the open object, and marks the open shape', () => {
    expect(names(levelsOf(model(), sel('object', 'oHead')))).toEqual(['group:gArm,gHead|gHead', 'object:oHead,oNeck|oHead', 'shape:s2,s1|-'])
    expect(names(levelsOf(model(), sel('shape', 's1')))).toEqual(['group:gArm,gHead|gHead', 'object:oHead,oNeck|oHead', 'shape:s2,s1|s1'])
  })
})

describe('stepping through the cards', () => {
  const c = model()
  it('opens a card that is not open', () => {
    expect(stepTo(c, NONE, 'group', 'gHead')).toEqual(sel('group', 'gHead'))
    expect(stepTo(c, sel('group', 'gHead'), 'object', 'oHead')).toEqual(sel('object', 'oHead'))
    expect(stepTo(c, sel('object', 'oHead'), 'shape', 's1')).toEqual(sel('shape', 's1'))
  })
  it('steps back up when the card that is open and deepest is clicked', () => {
    expect(stepTo(c, sel('shape', 's1'), 'shape', 's1')).toEqual(sel('object', 'oHead'))
    expect(stepTo(c, sel('object', 'oHead'), 'object', 'oHead')).toEqual(sel('group', 'gHead'))
    expect(stepTo(c, sel('group', 'gHead'), 'group', 'gHead')).toEqual(NONE)
  })
  it('makes an open card above the deepest one the deepest, closing what was under it', () => {
    expect(stepTo(c, sel('shape', 's1'), 'object', 'oHead')).toEqual(sel('object', 'oHead'))
    expect(stepTo(c, sel('shape', 's1'), 'group', 'gHead')).toEqual(sel('group', 'gHead'))
  })
  it('switches to a card of another branch', () => {
    expect(stepTo(c, sel('group', 'gHead'), 'group', 'gArm')).toEqual(sel('group', 'gArm'))
  })
})

describe('the order the cards are in', () => {
  it('lists topmost first: the stored lists are back to front', () => {
    expect(displayed(['a', 'b', 'c'])).toEqual(['c', 'b', 'a'])
  })
  it('turns a drop before a displayed card into a place in the stored list', () => {
    const stored = ['a', 'b', 'c', 'd']   // displayed: d c b a
    expect(storedBefore(stored, 'c')).toBe('d')   // above c in the picture = after c in the stored order
    expect(storedBefore(stored, 'd')).toBeNull()   // above d: the very front, last in the stored order
    expect(storedBefore(stored, null)).toBe('a')   // below a: the very back, first in the stored order
    expect(storedBefore(stored, 'gone')).toBeNull()
  })
})

describe('the states a card carries', () => {
  const c = model()
  it('finds the variants (presets of no scope), the poses of a group and the styles of an object', () => {
    expect(variantsOf(c).map(p => p.id)).toEqual(['vElder', 'vChild'])
    expect(posesOf(c, 'gArm').map(p => p.id)).toEqual(['pWave'])
    expect(posesOf(c, 'gHead')).toEqual([])
    expect(stylesOfObject(c, 'oHead').map(p => p.id)).toEqual(['stRed'])
  })
  it('lists the expressions of an object by axis with the form each shows', () => {
    const [e] = expressionsOf(c, c.objects[0], {})
    expect(e.axis.name).toBe('Shape')
    expect(e.forms.map(f => f.name)).toEqual(['Oval', 'Square'])
    expect(e.chosen?.id).toBe('f1')
    expect(expressionsOf(c, c.objects[0], { 'oHead.ax': 'f2' })[0].chosen?.id).toBe('f2')
    expect(expressionsOf(c, c.objects[1], {})).toEqual([])
  })
})

describe('the button of a card', () => {
  it('can hide only a model, a group or an object that is listed, and add or copy anything', () => {
    expect(CARD_MODES.model).toEqual(['hide', 'plus', 'copy'])
    expect(CARD_MODES.group).toContain('hide')
    expect(CARD_MODES.shape).toEqual(['plus', 'copy'])
    expect(CARD_MODES.pose).not.toContain('hide')
    expect(modesFor('object', { open: false })).toContain('hide')
    expect(modesFor('object', { open: true })).toEqual(['plus', 'copy'])
  })
  it('moves on to the next mode, round to the first', () => {
    const modes = CARD_MODES.group
    expect(nextMode(modes, 'hide')).toBe('plus')
    expect(nextMode(modes, 'plus')).toBe('copy')
    expect(nextMode(modes, 'copy')).toBe('hide')
    expect(nextMode(CARD_MODES.shape, 'copy')).toBe('plus')
    expect(nextMode(CARD_MODES.shape, 'plus')).toBe('copy')
  })
})

describe('searching the tree', () => {
  it('lists the cards of every level that match, with where each lies', () => {
    const hits = searchHits(model(), 'arm')
    expect(hits.map(h => `${h.kind}:${h.id}:${h.crumbs}`)).toEqual(['group:gArm:', 'object:oArm:Arm group', 'shape:s3:Arm group › Arm'])
    expect(searchHits(model(), 'jaw')).toEqual([{ kind: 'shape', id: 's2', name: 'Jaw', crumbs: 'Head group › Head' }])
  })
  it('finds nothing for nothing', () => {
    expect(searchHits(model(), '  ')).toEqual([])
    expect(searchHits(model(), 'zzz')).toEqual([])
  })
})
