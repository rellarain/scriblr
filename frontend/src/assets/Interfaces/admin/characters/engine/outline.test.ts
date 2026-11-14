import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, starterContent } from '../modelContent'
import { NO_COLOURING, paintLayer } from './colour'
import { newShape } from './edit'
import { LIMITS } from './limits'
import { OUTLINE_INK, paintShapes } from './paint'
import { makeTwin } from './pairEdit'
import { solveAtRest, type Solved } from './rig'
import type { Edit } from './rigEdit'
import { POLYGON_SIDES, SHAPE_BASICS, STAR_INNER, STAR_POINTS, polygonId, starId, templateBox, templateById, templatePoints } from './templates'

// The shape editor's templates and outline (S3): the basics and the polygons and stars with a count are the shapes they say they are, and a shape's outline is drawn
// at its width scaled as the shape is, faded with it by a slider but not by its own opacity.

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const pointsOf = (id: string) => templatePoints(id, templateBox(id, 100, 100, 40))
const sides = (id: string) => { const p = pointsOf(id); return p.map((q, i) => dist(q, p[(i + 1) % p.length])) }

describe('the shape editor templates', () => {
  it('offers every basic by name', () => {
    expect(SHAPE_BASICS.map(id => templateById(id)?.name)).toEqual(['Square', 'Rectangle', 'Circle', 'Ellipse', 'Equilateral triangle', 'Right triangle', 'Pentagon', 'Hexagon'])
  })

  it('draws an equilateral triangle, a pentagon and a hexagon with equal sides', () => {
    for (const id of ['triangle-eq', 'pentagon', 'hexagon']) {
      const s = sides(id)
      for (const len of s) expect(len).toBeCloseTo(s[0], 1)
    }
  })

  it('draws a right triangle with a right angle and two equal legs', () => {
    const [a, b, c] = pointsOf('triangle-right')
    // the corner at the third point: its two sides are at right angles
    const u = { x: a.x - c.x, y: a.y - c.y }, v = { x: b.x - c.x, y: b.y - c.y }
    expect(u.x * v.x + u.y * v.y).toBeCloseTo(0, 6)
    expect(Math.hypot(u.x, u.y)).toBeCloseTo(Math.hypot(v.x, v.y), 6)
  })

  it('draws an ellipse wider than it is tall, from four curve points', () => {
    const p = pointsOf('ellipse'), xs = p.map(q => q.x), ys = p.map(q => q.y)
    expect(p.every(q => q.m === 'c')).toBe(true)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys))
  })

  it('makes a polygon with every count from 3 to 12, regular, its first corner at the top', () => {
    for (let n = POLYGON_SIDES.min; n <= POLYGON_SIDES.max; n++) {
      const t = templateById(polygonId(n))!
      expect(t.name).toBe(`Polygon, ${n} sides`)
      const p = pointsOf(t.id)
      expect(p).toHaveLength(n)
      expect(p.every(q => q.m === 's')).toBe(true)
      const s = sides(t.id)
      for (const len of s) expect(len).toBeCloseTo(s[0], 1)
      expect(p[0].x).toBeCloseTo(100, 6)
      expect(p[0].y).toBe(Math.min(...p.map(q => q.y)))
    }
  })

  it('makes a star with every count from 4 to 12, its corners alternating between the outer and the inner circle', () => {
    for (let n = STAR_POINTS.min; n <= STAR_POINTS.max; n++) {
      const t = templateById(starId(n))!
      expect(t.name).toBe(`Star, ${n} points`)
      const p = pointsOf(t.id), centre = { x: 100, y: 100 }
      expect(p).toHaveLength(2 * n)
      const outer = dist(p[0], centre)
      p.forEach((q, i) => expect(dist(q, centre)).toBeCloseTo(i % 2 ? outer * STAR_INNER : outer, 1))
    }
  })

  it('knows no polygon or star outside its counts', () => {
    for (const id of ['polygon-2', 'polygon-13', 'star-3', 'star-13', 'polygon-x', 'star-']) expect(templateById(id)).toBeUndefined()
  })
})

// One group, one object with a square of side 20 at (90, 90).
function square(outline: number | null): ModelContent {
  let c = addGroup(starterContent('Demo'), newGroup('g', 'Group'))
  c = addObject(c, 'g', { id: 'o', name: 'Part', layer: 'body', shapes: [] })
  return addShape(c, 'o', { ...newShape('s', 'Square', 'square', { x: 90, y: 90, w: 20, h: 20 }), outline })
}

describe('a shape outline', () => {
  it('is drawn at its width, in the one ink, over the fill', () => {
    const c = square(0.75)
    const [item] = paintShapes(c, solveAtRest(c), NO_COLOURING)
    expect(item.line).toEqual({ w: 0.75, alpha: 1 })
    expect(OUTLINE_INK).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is left out when the shape has none', () => {
    const c = square(null)
    expect(paintShapes(c, solveAtRest(c), NO_COLOURING)[0].line).toBeNull()
  })

  it('scales with the shape', () => {
    const c = square(1.5), solved = solveAtRest(c)
    const scaled: Solved = { ...solved, shapes: { ...solved.shapes, s: { ...solved.shapes.s, matrix: [2, 0, 0, 2, 0, 0] } } }
    expect(paintShapes(c, scaled, NO_COLOURING)[0].line?.w).toBe(3)
  })

  it('is not faded by the shape opacity, but is by a slider that fades the shape', () => {
    const c0 = square(1)
    const c = { ...c0, shapes: c0.shapes.map(s => ({ ...s, op: 0.4 })) }
    const solved = solveAtRest(c)
    const [item] = paintShapes(c, solved, NO_COLOURING)
    expect(item.opacity).toBeCloseTo(0.4, 6)
    expect(item.line?.alpha).toBe(1)
    const faded: Solved = { ...solved, shapes: { ...solved.shapes, s: { ...solved.shapes.s, fade: 0.25 } } }
    expect(paintShapes(c, faded, NO_COLOURING)[0].line?.alpha).toBe(0.25)
  })

  it('belongs to a twin as to its original, and never to a helper or a shading shape', () => {
    const c = must(makeTwin(square(2), 'shape', 's', (p: string) => `${p}_twin`))
    const twin = c.shapes.find(s => s.mirrorOf === 's')!
    expect(paintLayer(c, NO_COLOURING, twin).line).toBe(2)
    const helper: ModelShape = { ...c.shapes.find(s => s.id === 's')!, helper: true }
    expect(paintLayer(c, NO_COLOURING, helper).line).toBeNull()
    const shading: ModelShape = { ...c.shapes.find(s => s.id === 's')!, shade: { kind: 'shadow', t: 0.2 } }
    expect(paintLayer(c, NO_COLOURING, shading).line).toBeNull()
  })

  it('is repaired as the server repairs it: held to its range, two decimals, none unless it is a number', () => {
    const fix = (v: unknown) => normalizeContent({ ...square(null), shapes: [{ ...square(null).shapes[0], outline: v as number }] }).shapes[0].outline
    expect(fix(0.75)).toBe(0.75)
    expect(fix(0.1)).toBe(LIMITS.outlineMin)
    expect(fix(500)).toBe(LIMITS.outlineMax)
    expect(fix(1.23456)).toBe(1.23)
    expect(fix('thick')).toBeNull()
    expect(fix(true)).toBeNull()
    expect(fix(undefined)).toBeNull()
  })
})
