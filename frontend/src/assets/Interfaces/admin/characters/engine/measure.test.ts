import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { ModelContent } from '../../../../../api/types'
import { normalizeContent } from '../modelContent'
import { ellipse, measure, shapeClass, sliderFor } from './measure'

// Measurements (slice 9f-2): the templates measured as a fashion designer takes a body, the shape class from the girths, and a typed measurement found on its slider.
vi.setConfig({ testTimeout: 60000 })

const seed = JSON.parse(readFileSync(new URL('../../../../../../../backend/app/seed/body_templates.json', import.meta.url), 'utf-8')) as { templates: Array<{ id: string; content: ModelContent }> }
const tpl = (id: string) => normalizeContent(seed.templates.find(t => t.id === id)!.content)

describe('an ellipse', () => {
  it('has a circle’s perimeter when round, and four times its widths at most', () => {
    expect(ellipse(10, 10)).toBeCloseTo(Math.PI * 10, 6)
    expect(ellipse(30, 20)).toBeGreaterThan(Math.PI * 20)
    expect(ellipse(30, 20)).toBeLessThan(2 * (30 + 20))
  })
})

describe('the shape class', () => {
  it('follows the FFIT rules in order', () => {
    // in cm: a rectangle, an hourglass, a spoon, a triangle, an inverted triangle
    expect(shapeClass({ bust: 94, waist: 80, highHip: 88, hip: 98 })).toBe('rectangle')
    expect(shapeClass({ bust: 96, waist: 68, highHip: 84, hip: 97 })).toBe('hourglass')
    expect(shapeClass({ bust: 88, waist: 70, highHip: 90, hip: 106 })).toBe('spoon')
    expect(shapeClass({ bust: 88, waist: 80, highHip: 90, hip: 100 })).toBe('triangle')
    expect(shapeClass({ bust: 106, waist: 90, highHip: 92, hip: 94 })).toBe('inverted triangle')
  })
})

describe('the templates measured', () => {
  it('give the average man’s body in cm, a rectangle', () => {
    const m = measure(tpl('man'), {})!
    expect(m.height).toBe(175)
    expect(m.bust).toBeGreaterThan(90); expect(m.bust).toBeLessThan(110)
    expect(m.waist).toBeGreaterThan(72); expect(m.waist).toBeLessThan(95)
    expect(m.neck).toBeGreaterThan(34); expect(m.neck).toBeLessThan(46)
    expect(m.inseam).toBeGreaterThan(74); expect(m.inseam).toBeLessThan(88)
    expect(m.arm).toBeGreaterThan(52); expect(m.arm).toBeLessThan(66)
    expect(shapeClass(m)).toBe('rectangle')
  })
  it('grow with the sliders: a heavier body has a bigger waist, a taller one a longer inseam', () => {
    const c = tpl('man'), rest = measure(c, {})!
    expect(measure(c, { 'body-fat': 14 })!.waist).toBeGreaterThan(rest.waist + 15)
    expect(measure(c, { 'body-height': 195 })!.inseam).toBeGreaterThan(rest.inseam + 8)
    // the heavier woman carries her fat at the hips: a spoon
    expect(shapeClass(measure(tpl('heavywoman'), {})!)).toBe('spoon')
  })
  it('find a typed measurement on its slider, as near as the span allows', () => {
    const c = tpl('woman'), rest = measure(c, {})!
    const v = sliderFor(c, {}, 'waist', rest.waist + 4, [-25, 25], 'body-waist')!
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(25)
    expect(Math.abs(measure(c, { 'body-waist': v })!.waist - (rest.waist + 4))).toBeLessThan(0.3)
    // far past what the slider reaches: its end
    expect(sliderFor(c, {}, 'waist', rest.waist + 80, [-25, 25], 'body-waist')).toBe(25)
    expect(sliderFor(c, {}, 'height', 230, [145, 200], 'body-height')).toBe(200)
  })
})
