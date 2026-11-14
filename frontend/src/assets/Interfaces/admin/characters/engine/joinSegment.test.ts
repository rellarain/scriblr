import { describe, expect, it } from 'vitest'
import type { ModelShape } from '../../../../../api/types'
import { clearClipboard, copyShape, hasCopy, pasted, PASTE_OFFSET } from '../shapeClipboard'
import { joinSegment, newShape } from './edit'
import { frameOf } from './transform'

// Shape types T2: a segment's two points joined into one at its middle (Ctrl + click), and the clipboard a shape is copied to and pasted from.

const square = (): ModelShape => ({ ...newShape('sq', 'Square', 'square', { x: 0, y: 0, w: 40, h: 40 }), pts: [[0, 0], [40, 0], [40, 40], [0, 40]].map(([x, y]) => ({ x, y, m: 's' as const })) })

describe('joining a segment', () => {
  it('puts one point at the middle of a straight segment', () => {
    const j = joinSegment(square(), 0)!
    expect(j.pts.map(p => [p.x, p.y])).toEqual([[20, 0], [40, 40], [0, 40]])
  })

  it('joins the last segment of a closed shape across the start', () => {
    const j = joinSegment(square(), 3)!
    expect(j.pts.map(p => [p.x, p.y])).toEqual([[40, 0], [40, 40], [0, 20]])
  })

  it('keeps the curve coming in to the first point and going out of the second', () => {
    const s = square()
    s.pts[0] = { ...s.pts[0], m: 'c' }
    s.pts[1] = { ...s.pts[1], m: 's' }
    expect(joinSegment(s, 0)!.pts[0].m).toBe('cs')
  })

  it('refuses to leave fewer than three points, and the end of an open line', () => {
    const tri: ModelShape = { ...square(), pts: square().pts.slice(0, 3) }
    expect(joinSegment(tri, 0)).toBeNull()
    expect(joinSegment({ ...square(), closed: false }, 3)).toBeNull()
  })
})

describe('the clipboard', () => {
  it('pastes a copy with a new id, under the pointer or a little off, following nothing', () => {
    clearClipboard()
    expect(hasCopy()).toBe(false)
    const s = square()
    s.pts[0] = { ...s.pts[0], bind: { kind: 'point', s: 'x', i: 0, d: [0, 0], e: 0, t: 0, o: 0 } }
    copyShape(s)
    const under = pasted('p1', [100, 200])!
    expect(under.id).toBe('p1')
    expect(frameOf(under)).toMatchObject({ cx: 100, cy: 200 })
    expect(under.pts.some(p => p.bind)).toBe(false)
    const off = pasted('p2', null)!
    expect(frameOf(off)).toMatchObject({ cx: 20 + PASTE_OFFSET, cy: 20 + PASTE_OFFSET })
    // the copy itself is left alone, so it can be pasted again
    expect(pasted('p3', null)!.id).toBe('p3')
    clearClipboard()
  })
})
