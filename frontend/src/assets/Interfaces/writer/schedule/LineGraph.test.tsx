import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineGraph, goalMetOn } from './LineGraph'

const goal = (pcts: number[]) => ({ points: pcts.map((pct, i) => ({ date: `2026-10-0${i + 1}`, pct })), projection: [] })

describe('goalMetOn', () => {
  it('is the first point that reaches the whole goal, and null before that', () => {
    expect(goalMetOn(goal([0.2, 0.9, 1, 1.2]).points)?.date).toBe('2026-10-03')
    expect(goalMetOn(goal([0.2, 0.9]).points)).toBeNull()
  })
})

describe('the line graph', () => {
  it('rings the day a facet reached its goal, and only for a facet that did', () => {
    const { container } = render(<LineGraph today="2026-10-05" deadline={null} series={[{ facet: 'draft', goal: goal([0.5, 1]) }, { facet: 'plot', goal: goal([0.1, 0.3]) }]} />)
    const rings = container.querySelectorAll('.wrSchedRing')
    expect(rings).toHaveLength(1)
    expect(rings[0].textContent).toContain('goal met 2026-10-02')
  })
})
