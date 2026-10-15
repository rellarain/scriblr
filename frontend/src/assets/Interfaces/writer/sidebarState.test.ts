import { describe, expect, it } from 'vitest'
import { SIDE_MIN_W, clampSideWidth, sideVars } from './sidebarState'

describe('the side column width', () => {
  it('is held between 200px and 60% of the Writer', () => {
    expect(clampSideWidth(100, 1200)).toBe(SIDE_MIN_W)
    expect(clampSideWidth(350, 1200)).toBe(350)
    expect(clampSideWidth(1000, 1200)).toBe(720)
  })

  it('is never under the minimum, however narrow the window', () => {
    expect(clampSideWidth(500, 300)).toBe(SIDE_MIN_W)
  })

  it('is given to CSS with the same limits, so a smaller window holds a stored width too', () => {
    expect(sideVars(400)).toEqual({
      '--wr-side-w': 'min(max(400px, 200px), 60%)',
      '--wr-side-px': 'clamp(200px, 400px, 60cqw)',
    })
  })
})
