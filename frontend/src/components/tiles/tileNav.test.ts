import { describe, expect, it } from 'vitest'
import { nextFocus, type Box } from './tileNav'

// Two rows: a wide tile and a small one on top, a small one and a tall one below.
const boxes: Box[] = [
  { left: 0, top: 0, width: 200, height: 100 },
  { left: 208, top: 0, width: 100, height: 100 },
  { left: 0, top: 108, width: 100, height: 100 },
  { left: 108, top: 108, width: 100, height: 200 },
]

describe('nextFocus', () => {
  it('moves to the nearest tile in the direction of the arrow', () => {
    expect(nextFocus(boxes, 0, 'right')).toBe(1)
    expect(nextFocus(boxes, 1, 'left')).toBe(0)
    expect(nextFocus(boxes, 0, 'down')).toBe(2)
    expect(nextFocus(boxes, 2, 'up')).toBe(0)
    expect(nextFocus(boxes, 2, 'right')).toBe(3)
  })

  it('stays put at an edge', () => {
    expect(nextFocus(boxes, 0, 'left')).toBe(0)
    expect(nextFocus(boxes, 0, 'up')).toBe(0)
    expect(nextFocus(boxes, 1, 'right')).toBe(1)
  })

  it('steps through tiles in order when nothing can be measured', () => {
    const flat = boxes.map(() => ({ left: 0, top: 0, width: 0, height: 0 }))
    expect(nextFocus(flat, 1, 'right')).toBe(2)
    expect(nextFocus(flat, 1, 'down')).toBe(2)
    expect(nextFocus(flat, 1, 'left')).toBe(0)
    expect(nextFocus(flat, 0, 'up')).toBe(0)
    expect(nextFocus(flat, 3, 'right')).toBe(3)
  })
})
