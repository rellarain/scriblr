import { describe, expect, it } from 'vitest'
import { beforeAt, slides, staysPut } from './fieldSlots'

// Four rows of 40px laid out one under another with 6px between them: tops 0, 46, 92, 138.
const rows = (...ids: string[]) => ids.map((id, i) => ({ id, top: i * 46, height: 40 }))

describe('beforeAt: where the pointer puts the dragged field', () => {
  it('goes in front of the row whose upper half the pointer is over, and in front of the next when it is over the lower half', () => {
    const list = rows('a', 'b', 'c')
    expect(beforeAt(list, 5)).toBe('a')
    expect(beforeAt(list, 19)).toBe('a')
    expect(beforeAt(list, 21)).toBe('b') // the lower half of a is the slot in front of b
    expect(beforeAt(list, 46 + 10)).toBe('b')
    expect(beforeAt(list, 46 + 25)).toBe('c')
  })

  it('goes last below the middle of the last row, and above the first when the pointer is above everything', () => {
    const list = rows('a', 'b')
    expect(beforeAt(list, 46 + 30)).toBeNull()
    expect(beforeAt(list, 500)).toBeNull()
    expect(beforeAt(list, -20)).toBe('a')
  })

  it('goes last in a group with no other row', () => {
    expect(beforeAt([], 12)).toBeNull()
  })
})

describe('slides: the rows that make room', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('moves the rows it passes down, into the place it leaves, when it goes up', () => {
    // d to the front of b: b and c slide down
    expect(slides(ids, 'd', 'b', 46)).toEqual(new Map([['b', 46], ['c', 46]]))
    expect(slides(ids, 'd', 'a', 46)).toEqual(new Map([['a', 46], ['b', 46], ['c', 46]]))
    expect(slides(ids, 'b', 'a', 46)).toEqual(new Map([['a', 46]]))
  })

  it('moves the rows it passes up when it goes down, and all of them below it when it goes last', () => {
    expect(slides(ids, 'a', 'd', 46)).toEqual(new Map([['b', -46], ['c', -46]]))
    expect(slides(ids, 'a', null, 46)).toEqual(new Map([['b', -46], ['c', -46], ['d', -46]]))
    expect(slides(ids, 'b', null, 30)).toEqual(new Map([['c', -30], ['d', -30]]))
  })

  it('moves nothing when the field would stay where it is', () => {
    expect(slides(ids, 'b', 'b', 46).size).toBe(0)
    expect(slides(ids, 'b', 'c', 46).size).toBe(0) // in front of the next row is the same place
    expect(slides(ids, 'd', null, 46).size).toBe(0)
  })

  it('moves nothing for a field that is not in the group, or a slot that is not', () => {
    expect(slides(ids, 'x', 'a', 46).size).toBe(0)
    expect(slides(ids, 'a', 'x', 46).size).toBe(0)
  })
})

describe('staysPut', () => {
  it('is true for the field\'s own place and the place just after it', () => {
    const ids = ['a', 'b', 'c']
    expect(staysPut(ids, 'b', 'b')).toBe(true)
    expect(staysPut(ids, 'b', 'c')).toBe(true)
    expect(staysPut(ids, 'c', null)).toBe(true)
    expect(staysPut(ids, 'a', 'c')).toBe(false)
    expect(staysPut(ids, 'c', 'a')).toBe(false)
    expect(staysPut(ids, 'x', 'a')).toBe(false)
  })
})
