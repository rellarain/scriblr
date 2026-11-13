import { describe, expect, it } from 'vitest'
import type { ModelContent } from '../../../../../api/types'
import { addGroup, addObject, addShape, blankContent, publishFaults } from '../modelContent'
import { newShape } from './edit'
import { LIMITS } from './limits'
import { templateBox } from './templates'
import {
  WRITER_LIMIT_ROWS, defaultWriterLimits, designerMax, growthRefusal, isTightened, measures, normalizeWriterLimits, stepWriterLimit, writerFaults,
} from './writerLimits'

// A model of `objects` objects in one group, each of `perObject` ovals.
function model(objects: number, perObject: number, name = 'Wide'): ModelContent {
  let c = addGroup(blankContent(name), { id: 'g', name: 'Body', parent: null, objects: [], pivot: null, attach: null })
  for (let o = 0; o < objects; o++) {
    c = addObject(c, 'g', { id: `o${o}`, name: `Object ${o}`, layer: 'body', shapes: [] })
    for (let i = 0; i < perObject; i++) c = addShape(c, `o${o}`, newShape(`s${o}_${i}`, `Shape ${o}-${i}`, 'oval', templateBox('oval', 100, 46, 40)))
  }
  return c
}

describe('the table of limits', () => {
  it('starts every limit at the admin\'s own', () => {
    const d = defaultWriterLimits()
    expect(d).toEqual({ points: 60, shapesPerObject: 72, objectsPerGroup: 48, shapes: 800, objects: 200, groups: 120, sliders: 120, copyKb: 2048, models: 100 })
    expect(isTightened(d)).toBe(false)
    expect(WRITER_LIMIT_ROWS.every(r => r.floor <= r.ceiling && r.step > 0 && r.big >= r.step)).toBe(true)
  })

  it('holds a limit between its floor and its ceiling, and the ceiling for what is not a number', () => {
    const n = normalizeWriterLimits({ points: 9999, shapes: 0, sliders: -3, copyKb: 1, models: 5.9, groups: Number.NaN, objects: '12' as unknown as number })
    expect(n).toMatchObject({ points: 60, shapes: 1, sliders: 0, copyKb: 16, models: 5, groups: 120, objects: 200 })
    expect(normalizeWriterLimits(null)).toEqual(defaultWriterLimits())
    expect(normalizeWriterLimits({ points: 24 }).shapes).toBe(800)
  })

  it('steps one limit at a time and stops at its floor and ceiling', () => {
    const d = defaultWriterLimits()
    expect(stepWriterLimit(d, 'shapes', -1, false).shapes).toBe(790)
    expect(stepWriterLimit(d, 'shapes', -1, true).shapes).toBe(750)
    expect(stepWriterLimit(d, 'shapes', 1, false).shapes).toBe(800)   // the ceiling
    const low = { ...d, points: 4 }
    expect(stepWriterLimit(low, 'points', -1, true).points).toBe(3)   // the floor
    expect(stepWriterLimit(low, 'sliders', -1, false).sliders).toBe(115)
    expect(isTightened(stepWriterLimit(d, 'models', -1, false))).toBe(true)
  })

  it('is the limit of the page where there is none of the writer\'s', () => {
    expect(designerMax(null)).toEqual({ points: LIMITS.pointsMax, shapesPerObject: LIMITS.shapesPerObjectMax, objectsPerGroup: LIMITS.objectsPerGroupMax, shapes: LIMITS.shapesMax, objects: LIMITS.objectsMax, groups: LIMITS.groupsMax, sliders: LIMITS.rangesMax })
    expect(designerMax({ ...defaultWriterLimits(), shapes: 10 }).shapes).toBe(10)
  })
})

describe('what an edit may do', () => {
  it('measures the largest shape, object and group, and the totals', () => {
    const c = model(3, 2)
    expect(measures(c)).toMatchObject({ shapes: 6, objects: 3, groups: 1, sliders: 0, shapesPerObject: 2, objectsPerGroup: 3 })
    expect(measures(c).points).toBeGreaterThanOrEqual(4)
  })

  it('refuses an edit that makes a count grow past a limit, and says which', () => {
    const limits = { ...defaultWriterLimits(), shapes: 4, objectsPerGroup: 2, shapesPerObject: 3 }
    const four = model(2, 2)
    expect(growthRefusal(four, model(2, 3), limits)).toBe('A model of your own may have at most 4 shapes.')
    expect(growthRefusal(model(1, 3), model(1, 4), limits)).toBe('An object in a model of your own may have at most 3 shapes.')
    expect(growthRefusal(model(2, 1), model(3, 1), limits)).toBe('A group in a model of your own may have at most 2 objects.')
    expect(growthRefusal(four, four, limits)).toBeNull()
    expect(growthRefusal(model(1, 1), model(2, 1), limits)).toBeNull()
  })

  it('lets a model that is over a limit stay as it is and be trimmed', () => {
    const limits = { ...defaultWriterLimits(), shapes: 4 }
    const big = model(3, 2)   // 6 shapes
    expect(growthRefusal(big, big, limits)).toBeNull()
    expect(growthRefusal(big, model(3, 1), limits)).toBeNull()
    // but not one more
    expect(growthRefusal(big, model(2, 4), limits)).not.toBeNull()
  })

  it('refuses a shape with more points than the limit when that is what grew', () => {
    const c = model(1, 1)
    const more = { ...c, shapes: c.shapes.map(s => ({ ...s, pts: [...s.pts, ...s.pts.slice(0, 2)] })) }
    const limits = { ...defaultWriterLimits(), points: c.shapes[0].pts.length }
    expect(growthRefusal(c, more, limits)).toBe(`A shape in a model of your own may have at most ${limits.points} points.`)
  })
})

describe('what stops a model of your own from being published', () => {
  it('says each count that is over, in the server\'s words', () => {
    const limits = { ...defaultWriterLimits(), shapesPerObject: 1, objectsPerGroup: 1, shapes: 3, objects: 2, groups: 0 + 1, sliders: 0 }
    const c = { ...model(2, 2), ranges: [{ id: 'r', name: 'Tilt', scope: 'g', min: -10, def: 0, max: 10, unit: '', show: true, rand: null, drives: [] }] } as unknown as ModelContent
    expect(writerFaults(c, limits)).toEqual([
      'Object Object 0 has 2 shapes: the limit for a model of your own is 1.',
      'Object Object 1 has 2 shapes: the limit for a model of your own is 1.',
      'Group Body has 2 objects: the limit for a model of your own is 1.',
      'The model has 4 shapes: the limit for a model of your own is 3.',
      'The model has 1 sliders: the limit for a model of your own is 0.',
    ])
  })

  it('says a shape that has too many points', () => {
    const c = model(1, 1)
    const faults = writerFaults(c, { ...defaultWriterLimits(), points: 3 })
    expect(faults).toEqual([`Shape Shape 0-0 has ${c.shapes[0].pts.length} points: the limit for a model of your own is 3.`])
  })

  it('says the size of a character\'s copy when it is over the writer\'s limit but not the admin\'s', () => {
    const c = model(2, 30)
    const faults = writerFaults(c, { ...defaultWriterLimits(), copyKb: 16 })
    expect(faults).toHaveLength(1)
    expect(faults[0]).toMatch(/^A character's copy of this model would be \d+ KB; the limit for a model of your own is 16 KB\.$/)
  })

  it('is nothing at the limits, and nothing for a model that fits', () => {
    expect(writerFaults(model(2, 2), defaultWriterLimits())).toEqual([])
    expect(writerFaults(model(2, 2), { ...defaultWriterLimits(), shapes: 4, objects: 2, shapesPerObject: 2 })).toEqual([])
    // the ordinary publish faults are another list
    expect(publishFaults(model(2, 2))).toEqual([])
  })
})
