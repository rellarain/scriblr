// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelDrive, ModelGroup, ModelPoint, ModelRange, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup } from '../modelContent'
import { HEAD_LINES_MAX, HEAD_MARKS, headGuide } from './guides'
import { solve } from './rig'

const pt = (x: number, y: number): ModelPoint => ({ x, y, m: 's' })
const rect = (id: string, x0: number, y0: number, x1: number, y1: number): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)] })
const group = (id: string, parent: string | null, objects: string[], over: Partial<ModelGroup> = {}): ModelGroup => ({ ...newGroup(id, id, parent, objects), ...over })
const drive = (over: Partial<ModelDrive>): ModelDrive => ({
  kind: 'length', group: null, target: null, id: null, axis: 'xy', shape: null, moves: [], sym: false, pivot: null, y0: 0, y1: 0, atMin: 100, atMax: 100, mirror: true, ...over,
})
const range = (id: string, drives: ModelDrive[]): ModelRange => ({ id, name: id, scope: null, min: 0, rest: 0, max: 100, unit: '%', show: true, rand: null, drives })

// A figure 300 tall: a head from the crown (y 0) to the chin (y 40) and a body from the chin to the soles (y 300), 60 wide. The head bone runs from the chin (the head
// group's pivot) to the crown (the pivot of a crown group); a slider lengthens it.
function figure(extra: Partial<ModelContent> = {}): ModelContent {
  return {
    ...blankContent('Figure'),
    shapes: [rect('head', 85, 0, 115, 40), rect('body', 70, 40, 130, 300)],
    objects: [{ id: 'oHead', name: 'Head', layer: 'body', shapes: ['head'] }, { id: 'oBody', name: 'Body', layer: 'body', shapes: ['body'] }],
    groups: [group('gBody', null, ['oBody'], { pivot: [100, 300] }), group('gHead', 'gBody', ['oHead'], { pivot: [100, 40] }), group('gCrown', 'gHead', [], { pivot: [100, 0] })],
    bones: [{ id: 'bHead', name: 'Head', start: 'gHead', end: { kind: 'group', id: 'gCrown', i: 0 } }],
    headBone: 'bHead',
    ...extra,
  }
}

describe('the head-units guide', () => {
  it('draws a line every head from the crown down past the lowest drawn point, numbered from the crown', () => {
    const g = headGuide(figure(), solve(figure(), {}))!
    expect(g.unit).toBeCloseTo(40, 6)
    expect(g.top).toBeCloseTo(0, 6)
    expect(g.bottom).toBeCloseTo(300, 6)
    expect(g.heads).toBe(7.5)
    expect(g.lines.map(l => l.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(g.lines[3].y).toBeCloseTo(120, 6)
    // the lines run across the figure and half a head each side
    expect(g.x0).toBeCloseTo(50, 6)
    expect(g.x1).toBeCloseTo(150, 6)
  })

  it('marks where a figure 7.5 heads tall has its landmarks', () => {
    const g = headGuide(figure(), solve(figure(), {}))!
    expect(g.marks.map(m => m.name)).toEqual(['Chin', 'Nipples', 'Navel', 'Crotch', 'Knees', 'Soles'])
    expect(g.marks.find(m => m.name === 'Chin')!.y).toBeCloseTo(40, 6)
    expect(g.marks.find(m => m.name === 'Crotch')!.y).toBeCloseTo(150, 6)
    expect(g.marks.find(m => m.name === 'Soles')!.y).toBeCloseTo(300, 6)
    expect(HEAD_MARKS).toHaveLength(6)
  })

  it('follows the sliders: a longer head bone makes the heads longer and the figure fewer heads tall', () => {
    const c = figure({ ranges: [range('rHead', [drive({ id: 'bHead', atMin: 100, atMax: 150 })])] })
    const g = headGuide(c, solve(c, { rHead: 100 }))!
    expect(g.unit).toBeCloseTo(60, 6)
    // the crown rises with the longer bone; the soles stay where they are
    expect(g.top).toBeCloseTo(-20, 6)
    expect(g.heads).toBeCloseTo(320 / 60, 2)
  })

  it('reads the whole-model height (the canvas space)', () => {
    const c = figure({ ranges: [range('rHeight', [drive({ kind: 'scale', target: 'model', atMin: 100, atMax: 50 })])] })
    const g = headGuide(c, solve(c, { rHeight: 100 }))!
    expect(g.unit).toBeCloseTo(20, 6)
    expect(g.heads).toBe(7.5)
  })

  it('is not there with no head bone, a head bone that is gone, or one with no length', () => {
    expect(headGuide(figure({ headBone: null }), solve(figure({ headBone: null }), {}))).toBeNull()
    expect(headGuide(figure({ headBone: 'nope' }), solve(figure({ headBone: 'nope' }), {}))).toBeNull()
    const flat = figure({ groups: [group('gBody', null, ['oBody'], { pivot: [100, 300] }), group('gHead', 'gBody', ['oHead'], { pivot: [100, 40] }), group('gCrown', 'gHead', [], { pivot: [100, 40] })] })
    expect(headGuide(flat, solve(flat, {}))).toBeNull()
  })

  it('draws a limited number of lines for a head bone far too short', () => {
    const tiny = figure({ groups: [group('gBody', null, ['oBody'], { pivot: [100, 300] }), group('gHead', 'gBody', ['oHead'], { pivot: [100, 40] }), group('gCrown', 'gHead', [], { pivot: [100, 39] })] })
    const g = headGuide(tiny, solve(tiny, {}))!
    expect(g.lines).toHaveLength(HEAD_LINES_MAX + 1)
    expect(g.lines.every(l => Number.isFinite(l.y))).toBe(true)
  })
})
