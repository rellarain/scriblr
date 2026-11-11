import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { boxOf, build, flatten } from './geometry'
import { newShape } from './edit'
import { CAP, emptyHistory, redo, remember, undo } from './history'
import { LIMITS, canAddPoint, copyBytes, level, limitNotes, pointLevel } from './limits'
import { PREVIEW_BACKGROUNDS, PREVIEW_RANGES, previewSpecs, previewTransform, seededRng } from './previews'
import { shapeBox, shapePath, shapesBox, viewBoxFor } from './svgText'
import { TEMPLATES, TEMPLATE_IDS, templateBox, templatePoints } from './templates'

describe('templates', () => {
  it('has every shape the user listed, and the extras they ticked', () => {
    for (const id of ['square', 'circle', 'hexagon', 'trapezoid', 'teardrop', 'line', 'rectangle', 'path', 'oval', 'rounded', 'triangle', 'diamond', 'crescent', 'leaf', 'heart', 'arc', 'star', 'wave', 'blob', 'tapered']) {
      expect(TEMPLATE_IDS).toContain(id)
    }
  })
  it('every template is finite, has at least three points, stays under the point limit and fits its box', () => {
    for (const t of TEMPLATES) {
      const box = templateBox(t.id, 100, 100, 40)
      const pts = templatePoints(t.id, box)
      expect(pts.length, t.id).toBeGreaterThanOrEqual(3)
      expect(pts.length, t.id).toBeLessThanOrEqual(LIMITS.pointsWarn)
      for (const p of pts) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), t.id).toBe(true)
        expect(p.x).toBeGreaterThanOrEqual(box.x - 0.01); expect(p.x).toBeLessThanOrEqual(box.x + box.w + 0.01)
        expect(p.y).toBeGreaterThanOrEqual(box.y - 0.01); expect(p.y).toBeLessThanOrEqual(box.y + box.h + 0.01)
      }
      const poly = flatten(build(pts, true), true)
      const b = boxOf(poly)
      expect(b.w * b.h, t.id).toBeGreaterThan(0)
    }
  })
  it('a tiny box is widened so a template is never a dot', () => {
    const pts = templatePoints('square', { x: 100, y: 100, w: 0, h: 0 })
    expect(pts[1].x - pts[0].x).toBeGreaterThanOrEqual(6)
  })
  it('an unknown template has no points', () => {
    expect(templatePoints('nope', { x: 0, y: 0, w: 10, h: 10 })).toEqual([])
  })
})

describe('history', () => {
  it('undoes and redoes whole values', () => {
    let h = emptyHistory<number>()
    h = remember(h, 1)
    h = remember(h, 2)
    const u = undo(h, 3)!
    expect(u.value).toBe(2)
    const r = redo(u.history, u.value)!
    expect(r.value).toBe(3)
    expect(undo(emptyHistory<number>(), 1)).toBeNull()
    expect(redo(emptyHistory<number>(), 1)).toBeNull()
  })
  it('a new change forgets what could have been redone, and the stack is capped', () => {
    let h = remember(remember(emptyHistory<number>(), 1), 2)
    const u = undo(h, 3)!
    expect(remember(u.history, 9).future).toEqual([])
    h = emptyHistory<number>()
    for (let i = 0; i < CAP + 10; i++) h = remember(h, i)
    expect(h.past).toHaveLength(CAP)
    expect(h.past[CAP - 1]).toBe(CAP + 9)
  })
  it('does not touch the stacks it is given', () => {
    const h = remember(emptyHistory<number>(), 1)
    undo(h, 2)
    expect(h.past).toEqual([1])
  })
})

const content = (over: Partial<ModelContent> = {}): ModelContent => ({ name: 'Adult', description: '', shapes: [], objects: [], groups: [], axis: 100, ranges: [], ...over })

describe('limits', () => {
  it('uses the numbers the user chose', () => {
    expect([LIMITS.pointsWarn, LIMITS.pointsMax, LIMITS.objectsPerGroupWarn, LIMITS.objectsPerGroupMax, LIMITS.shapesPerObjectWarn, LIMITS.shapesPerObjectMax]).toEqual([24, 60, 24, 48, 36, 72])
    expect([LIMITS.copyWarnBytes, LIMITS.copyMaxBytes]).toEqual([1200 * 1024, 2048 * 1024])
  })
  it('warns above the first number and stops at the second', () => {
    expect(level(24, 24, 60)).toBe('ok'); expect(level(25, 24, 60)).toBe('warn'); expect(level(59, 24, 60)).toBe('warn'); expect(level(60, 24, 60)).toBe('stop')
    const s = newShape('s', 'S', 'circle', { x: 0, y: 0, w: 10, h: 10 })
    expect(pointLevel(s)).toBe('ok')
    expect(pointLevel({ pts: Array.from({ length: 30 }, () => s.pts[0]) })).toBe('warn')
    expect(canAddPoint({ pts: Array.from({ length: 59 }, () => s.pts[0]) })).toBe(true)
    expect(canAddPoint({ pts: Array.from({ length: 60 }, () => s.pts[0]) })).toBe(false)
  })
  it('says which limits the content is at', () => {
    const many: ModelShape = { ...newShape('s1', 'Big', 'circle', { x: 0, y: 0, w: 10, h: 10 }), pts: Array.from({ length: 61 }, (_, i) => ({ x: i, y: i % 5, m: 'c' as const })) }
    const notes = limitNotes(content({
      shapes: [many],
      objects: [{ id: 'o', name: 'Obj', layer: 'body', shapes: Array.from({ length: 40 }, (_, i) => `x${i}`) }],
      groups: [{ id: 'g', name: 'Grp', parent: null, objects: Array.from({ length: 48 }, (_, i) => `o${i}`), pivot: null, attach: null }],
    }))
    expect(notes.find(n => n.text.includes('Big'))?.level).toBe('stop')
    expect(notes.find(n => n.text.includes('Obj'))?.level).toBe('warn')
    expect(notes.find(n => n.text.includes('Grp'))?.level).toBe('stop')
    expect(limitNotes(content())).toEqual([])
  })
  it('counts the size of a character\'s copy', () => {
    expect(copyBytes(content())).toBeGreaterThan(20)
    const big = content({ shapes: Array.from({ length: 560 }, (_, i) => ({ ...newShape(`s${i}`, 'x'.repeat(60), 'star', { x: 0, y: 0, w: 10, h: 10 }), pts: Array.from({ length: 60 }, (_, j) => ({ x: j + 0.123456, y: j % 9 + 0.654321, m: 'c' as const, hi: [1.123456, 2.123456] as [number, number], ho: [3.123456, 4.123456] as [number, number] })) })) })
    expect(copyBytes(big)).toBeGreaterThan(LIMITS.copyMaxBytes)
    expect(limitNotes(big).some(n => n.level === 'stop' && n.text.includes('KB'))).toBe(true)
  })
})

describe('svg text', () => {
  it('a shape with fewer than three points has no path and no box', () => {
    expect(shapePath({ pts: [{ x: 1, y: 1, m: 'c' }], closed: true })).toBe('')
    expect(shapeBox({ pts: [], closed: true })).toBeNull()
    expect(shapesBox([])).toBeNull()
  })
  it('paths and boxes have no NaN', () => {
    for (const t of TEMPLATES) {
      const s = newShape('s', t.id, t.id, templateBox(t.id, 100, 100))
      expect(shapePath(s)).not.toMatch(/NaN|undefined|Infinity/)
      const b = shapeBox(s)!
      expect([b.x, b.y, b.w, b.h].every(Number.isFinite)).toBe(true)
    }
  })
  it('a box around several shapes covers each', () => {
    const a = newShape('a', 'a', 'square', { x: 0, y: 0, w: 10, h: 10 }), b = newShape('b', 'b', 'square', { x: 50, y: 60, w: 10, h: 10 })
    const box = shapesBox([a, b])!
    expect(box.x).toBeLessThanOrEqual(0); expect(box.y).toBeLessThanOrEqual(0)
    expect(box.x + box.w).toBeGreaterThanOrEqual(60); expect(box.y + box.h).toBeGreaterThanOrEqual(70)
  })
  it('viewBoxFor holds the box in the aspect asked, with room around it', () => {
    const parts = viewBoxFor({ x: 10, y: 10, w: 20, h: 40 }, 6, 2).split(' ').map(Number)
    expect(parts[2] / parts[3]).toBeCloseTo(2)
    expect(parts[1]).toBeLessThan(10); expect(parts[1] + parts[3]).toBeGreaterThan(50)
    const dflt = viewBoxFor(null).split(' ').map(Number)
    expect(dflt).toHaveLength(4); expect(dflt.every(Number.isFinite)).toBe(true)
  })
})

describe('previews', () => {
  it('are repeatable from a seed and finite', () => {
    expect(previewSpecs(5, 'rand')).toEqual(previewSpecs(5, 'rand'))
    expect(previewSpecs(5, 'rand')).not.toEqual(previewSpecs(6, 'rand'))
    const rng = seededRng(1), a = rng(), b = rng()
    expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(1); expect(a).not.toBe(b)
  })
  it('stay inside the ranges; min and max are the ends', () => {
    const [s0, s1] = PREVIEW_RANGES.scale
    for (const seed of [1, 2, 3, 99, 12345]) {
      for (const p of previewSpecs(seed, 'rand', 12)) {
        expect(p.scale).toBeGreaterThanOrEqual(0.5); expect(p.scale).toBeLessThanOrEqual(1.15)
        expect(p.tilt).toBeGreaterThanOrEqual(PREVIEW_RANGES.tilt[0]); expect(p.tilt).toBeLessThanOrEqual(PREVIEW_RANGES.tilt[1])
        expect(p.skew).toBeGreaterThanOrEqual(PREVIEW_RANGES.skew[0]); expect(p.skew).toBeLessThanOrEqual(PREVIEW_RANGES.skew[1])
        expect(p.bg).toBeLessThan(PREVIEW_BACKGROUNDS)
      }
    }
    expect(previewSpecs(1, 'min').every(p => p.scale === s0)).toBe(true)
    expect(previewSpecs(1, 'max').every(p => p.scale === s1)).toBe(true)
  })
  it('the transform fits a box in a 100 cell and has no NaN', () => {
    const box = { x: 60, y: 20, w: 80, h: 120 }
    for (const mode of ['rand', 'min', 'max'] as const) {
      for (const spec of previewSpecs(7, mode, 8)) expect(previewTransform(box, spec)).not.toMatch(/NaN|Infinity/)
    }
    expect(previewTransform({ x: 0, y: 0, w: 0, h: 0 }, previewSpecs(1, 'rand')[0])).not.toMatch(/NaN|Infinity/)
  })
})
