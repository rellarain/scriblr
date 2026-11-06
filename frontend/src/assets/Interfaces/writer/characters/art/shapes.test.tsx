import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { bump, hull, limbGeometry, limbOutline, limbShape, shadedShape, taper } from './shapes'

describe('shapes: the contoured limbs and the hull', () => {
  it('a taper runs from one radius to the other, with a bump where asked', () => {
    const w = taper(10, 6)
    expect(w(0)).toBeCloseTo(10)
    expect(w(1)).toBeCloseTo(6)
    const b = taper(10, 6, bump(0.5, 3))
    expect(b(0.5)).toBeGreaterThan(w(0.5) + 2.5)
  })

  it('a limb outline is a closed contour round the axis, as wide as the profile', () => {
    const g = limbGeometry([0, 0], [0, 100], () => 8)
    const pts = limbOutline(g, () => 8)
    expect(pts.length).toBeGreaterThan(8)
    const xs = pts.map(p => p[0])
    expect(Math.max(...xs)).toBeGreaterThan(7)
    expect(Math.min(...xs)).toBeLessThan(-7)
  })

  it('a limb shape draws a body and a plane of shadow', () => {
    const { container } = render(<svg>{limbShape([0, 0], [0, 80], () => 9, '#d8a27a', '#b88862', 'k')}</svg>)
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2)
  })

  it('a shaded shape keeps its shadow inside by a clip path', () => {
    const { container } = render(<svg>{shadedShape([[0, 0], [20, 0], [20, 30], [0, 30]], 0.5, '#6a8a9a', '#4a6a7a', 'c1', 'k')}</svg>)
    expect(container.querySelector('clipPath#c1')).not.toBeNull()
  })

  it('the hull of some points holds all of them', () => {
    const h = hull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 4]])
    expect(h.length).toBe(4)
  })
})
