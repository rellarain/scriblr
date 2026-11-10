import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup } from '../modelContent'
import { alignTo, guideTargets } from './guides'
import { solve } from './rig'

const sharp = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
function figure(): ModelContent {
  return {
    ...blankContent('G'), axis: 100,
    shapes: [sharp('a', [[60, 100], [80, 100], [80, 140], [60, 140]]), sharp('b', [[120, 200], [150, 200], [150, 230], [120, 230]])],
    objects: [{ id: 'oA', name: 'A', layer: 'body', shapes: ['a'] }, { id: 'oB', name: 'B', layer: 'body', shapes: ['b'] }],
    groups: [newGroup('g', 'G', null, ['oA', 'oB'])],
  }
}

describe('what a dragged thing can line up with', () => {
  it('collects the mirror line, and the points, edges and middles of the other shapes', () => {
    const c = figure(), t = guideTargets(c, solve(c), ['a'])
    expect(t.xs).toEqual(expect.arrayContaining([100, 120, 135, 150]))
    expect(t.ys).toEqual(expect.arrayContaining([200, 215, 230]))
    expect(t.xs).not.toContain(60)   // the shape being dragged is left out
  })
  it('adds the sides of frames', () => {
    const c = figure(), t = guideTargets(c, solve(c), [], [{ x: 10, y: 20, w: 50, h: 60 }])
    expect(t.xs).toEqual(expect.arrayContaining([10, 60]))
    expect(t.ys).toEqual(expect.arrayContaining([20, 80]))
  })
})

describe('lining up', () => {
  const targets = { xs: [100, 150], ys: [200] }
  it('finds the move that lands on a line within reach, and the line', () => {
    expect(alignTo({ xs: [101.2], ys: [190] }, targets, 2)).toEqual({ dx: -1.2000000000000028, dy: 0, x: 100, y: null })
    const hit = alignTo({ xs: [97], ys: [201] }, targets, 2)
    expect(hit.x).toBeNull()
    expect(hit.y).toBe(200)
    expect(hit.dy).toBe(-1)
  })
  it('lines up whichever of a shape\'s lines is nearest, and none when all are out of reach', () => {
    expect(alignTo({ xs: [60, 80, 99.5], ys: [] }, targets, 2)).toMatchObject({ x: 100, dx: 0.5 })
    expect(alignTo({ xs: [10], ys: [10] }, targets, 2)).toEqual({ dx: 0, dy: 0, x: null, y: null })
  })
})
