import { describe, expect, it } from 'vitest'
import { auiSizeOf, auiWidth, oneTileEach, snapAui, stepAui } from './auiSize'

const SCREEN = 2000

describe("AUI's modes, by resizing", () => {
  it('snaps a dragged width to mini, small, medium (by the column) or max', () => {
    expect(snapAui(0, SCREEN)).toEqual({ mode: 'mini', columns: 0 })
    expect(snapAui(190, SCREEN)).toEqual({ mode: 'mini', columns: 0 })
    expect(snapAui(210, SCREEN)).toEqual({ mode: 'small', columns: 1 })
    expect(snapAui(590, SCREEN)).toEqual({ mode: 'small', columns: 1 })
    expect(snapAui(610, SCREEN)).toEqual({ mode: 'medium', columns: 2 })
    expect(snapAui(1300, SCREEN)).toEqual({ mode: 'medium', columns: 3 })
    expect(snapAui(1810, SCREEN)).toEqual({ mode: 'max', columns: 5 })
    // a column count that would fill the room is max
    expect(snapAui(1100, 1200)).toEqual({ mode: 'max', columns: 3 })
  })

  it('gives each mode its width, never more than there is', () => {
    expect(auiWidth({ mode: 'mini', columns: 0 }, SCREEN)).toBe(0)
    expect(auiWidth({ mode: 'small', columns: 1 }, SCREEN)).toBe(400)
    expect(auiWidth({ mode: 'medium', columns: 3 }, SCREEN)).toBe(1200)
    expect(auiWidth({ mode: 'medium', columns: 3 }, 1000)).toBe(1000)
    expect(auiWidth({ mode: 'max', columns: 0 }, SCREEN)).toBe(SCREEN)
    expect(auiWidth({ mode: 'small', columns: 1 }, 300)).toBe(300)
  })

  it('steps a column at a time with the arrow keys, from mini to max and back', () => {
    let size = snapAui(0, 1700)
    const seen = [size.mode]
    for (let i = 0; i < 5; i++) { size = stepAui(size, 1, 1700); seen.push(size.mode) }
    expect(seen).toEqual(['mini', 'small', 'medium', 'medium', 'max', 'max'])
    expect(stepAui({ mode: 'small', columns: 1 }, -1, 1700)).toEqual({ mode: 'mini', columns: 0 })
    expect(stepAui({ mode: 'max', columns: 4 }, -1, 1700).mode).toBe('medium')
  })

  it('reads a stored size back, or the width AUI had before it had modes', () => {
    expect(auiSizeOf({ mode: 'max', columns: 3 })).toEqual({ mode: 'max', columns: 3 })
    expect(auiSizeOf({ mode: 'medium', columns: 1 })).toEqual({ mode: 'medium', columns: 2 })
    expect(auiSizeOf({ mode: 'huge' }, 1200)).toEqual({ mode: 'medium', columns: 3 })
    expect(auiSizeOf(undefined, 400)).toEqual({ mode: 'small', columns: 1 })
    expect(auiSizeOf(undefined, undefined)).toEqual({ mode: 'medium', columns: 2 })
  })

  it('holds each console to one tile when small, and when several consoles share medium', () => {
    expect(oneTileEach('small', 1)).toBe(true)
    expect(oneTileEach('medium', 1)).toBe(false)
    expect(oneTileEach('medium', 2)).toBe(true)
    expect(oneTileEach('max', 5)).toBe(false)
  })
})
