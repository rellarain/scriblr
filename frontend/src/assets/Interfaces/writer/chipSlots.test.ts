import { describe, expect, it } from 'vitest'
import { CHIP_TAIL, chipBeforeAt, chipSlides, flowOf, type ChipBox, type ChipFlow, type ChipSize } from './chipSlots'

// Chips 50 wide and 20 tall in a line 120 wide with 10px gaps: two to a line, so a and b are on the first line and c on the second.
const flow: ChipFlow = { width: 120, columnGap: 10, rowGap: 10 }
const chip = (id: string, width = 50, height = 20): ChipSize => ({ id, width, height })
const [a, b, c] = [chip('a'), chip('b'), chip('c')]
const boxes: ChipBox[] = [
  { id: 'a', left: 0, top: 0, width: 50, height: 20 },
  { id: 'b', left: 60, top: 0, width: 50, height: 20 },
  { id: 'c', left: 0, top: 30, width: 50, height: 20 },
]

describe('chipBeforeAt', () => {
  it('puts the chip in front of the first one whose middle the pointer has not passed, on the pointer\'s line', () => {
    expect(chipBeforeAt(boxes, 10, 5)).toBe('a')
    expect(chipBeforeAt(boxes, 40, 5)).toBe('b')
    expect(chipBeforeAt(boxes, 70, 5)).toBe('b')
    expect(chipBeforeAt(boxes, 10, 35)).toBe('c')
  })

  it('goes to the first chip of the next line when the pointer is past the end of its own, and last when there is none', () => {
    expect(chipBeforeAt(boxes, 100, 5)).toBe('c')
    expect(chipBeforeAt(boxes, 400, 5)).toBe('c')
    expect(chipBeforeAt(boxes, 40, 35)).toBeNull()
  })

  it('reads the gap between two lines as the lower line, and a pointer above everything as the first line', () => {
    expect(chipBeforeAt(boxes, 10, 25)).toBe('c')
    expect(chipBeforeAt(boxes, 10, -20)).toBe('a')
  })

  it('is last below every line and when there are no chips', () => {
    expect(chipBeforeAt(boxes, 10, 200)).toBeNull()
    expect(chipBeforeAt([], 10, 10)).toBeNull()
  })

  it('keeps a shorter chip on the line of the taller ones', () => {
    const uneven: ChipBox[] = [
      { id: 'a', left: 0, top: 0, width: 50, height: 30 },
      { id: 'b', left: 60, top: 5, width: 50, height: 20 },
      { id: 'c', left: 0, top: 40, width: 50, height: 30 },
    ]
    expect(chipBeforeAt(uneven, 90, 2)).toBe('c') // above b's top, but still on the first line, to the right of b's middle
    expect(chipBeforeAt(uneven, 70, 2)).toBe('b')
  })
})

describe('flowOf', () => {
  it('lays chips out left to right, breaking the line where the next one does not fit', () => {
    const at = flowOf([a, b, c], flow)
    expect(at.get('a')).toEqual({ x: 0, y: 0 })
    expect(at.get('b')).toEqual({ x: 60, y: 0 })
    expect(at.get('c')).toEqual({ x: 0, y: 30 })
  })

  it('centres a shorter chip in its line, and gives a chip wider than the line a line to itself', () => {
    const at = flowOf([chip('a', 50, 30), chip('b', 50, 20), chip('wide', 300, 20), chip('d')], flow)
    expect(at.get('b')).toEqual({ x: 60, y: 5 })
    expect(at.get('wide')).toEqual({ x: 0, y: 40 })
    expect(at.get('d')).toEqual({ x: 0, y: 70 })
  })
})

describe('chipSlides', () => {
  const tail = chip('add', 40)

  it('slides each chip to where the wrapped new order puts it, a line down for one that wraps', () => {
    // c in front of a: c, a, b. a goes right, b wraps to the second line; the add chip stays where it was after the last chip
    const moves = chipSlides([a, b, c], tail, 'c', 'a', flow)
    expect(moves.get('a')).toEqual({ dx: 60, dy: 0 })
    expect(moves.get('b')).toEqual({ dx: -60, dy: 30 })
    expect(moves.has('c')).toBe(false) // the dragged chip does not slide
    expect(moves.has(CHIP_TAIL)).toBe(false)
  })

  it('slides the chips after it back when it goes last', () => {
    const moves = chipSlides([a, b, c], tail, 'a', null, flow)
    expect(moves.get('b')).toEqual({ dx: -60, dy: 0 })
    expect(moves.get('c')).toEqual({ dx: 60, dy: -30 })
  })

  it('slides the add chip too when a line breaks differently', () => {
    // chips of 70, 30 and 50: a and b fill the first line, c and the add chip share the second. With c first, c leaves no room for a beside it,
    // so a and b are on the second line, which the add chip does not fit on: it is on a third.
    const uneven = [chip('a', 70), chip('b', 30), chip('c', 50)]
    const moves = chipSlides(uneven, tail, 'c', 'a', flow)
    expect(moves.get('a')).toEqual({ dx: 0, dy: 30 })
    expect(moves.get('b')).toEqual({ dx: 0, dy: 30 })
    expect(moves.get(CHIP_TAIL)).toEqual({ dx: -60, dy: 30 })
  })

  it('moves nothing when the chip would stay where it is, or the slot is not one of the chips', () => {
    expect(chipSlides([a, b, c], tail, 'b', 'b', flow).size).toBe(0)
    expect(chipSlides([a, b, c], tail, 'b', 'c', flow).size).toBe(0)
    expect(chipSlides([a, b, c], tail, 'c', null, flow).size).toBe(0)
    expect(chipSlides([a, b, c], tail, 'b', 'nope', flow).size).toBe(0)
    expect(chipSlides([a, b, c], tail, 'nope', null, flow).size).toBe(0)
  })

  it('works without an add chip', () => {
    expect(chipSlides([a, b, c], null, 'c', 'a', flow).get('a')).toEqual({ dx: 60, dy: 0 })
  })
})
