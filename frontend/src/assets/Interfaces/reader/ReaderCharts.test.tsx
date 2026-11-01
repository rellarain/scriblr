import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DayLine, MonthBars } from './ReaderCharts'

const days = [{ date: '2026-10-08', value: 5 }, { date: '2026-10-09', value: 22 }, { date: '2026-10-10', value: 20 }]

describe('the day line', () => {
  it('rings each day that reached the goal, and says how many did', () => {
    const { container } = render(<DayLine days={days} goal={20} unit="pages" label="Pages a day" />)
    expect(container.querySelectorAll('.rdChartRing')).toHaveLength(2)
    expect(screen.getByRole('img', { name: /goal of 20 pages met on 2/ })).toBeInTheDocument()
    expect(container.querySelector('.rdChartGoal')).not.toBeNull()
  })

  it('has no ring and no goal line without a goal', () => {
    const { container } = render(<DayLine days={days} unit="pages" label="Pages a day" />)
    expect(container.querySelectorAll('.rdChartRing')).toHaveLength(0)
    expect(container.querySelector('.rdChartGoal')).toBeNull()
  })
})

describe('the month bars', () => {
  const bars = [{ key: '2026-09', label: 'Sep', value: 12, days: 30 }, { key: '2026-10', label: 'Oct', value: 31, days: 10 }]

  it('draws a bar for each month with its value, and the goal across them', () => {
    const { container } = render(<MonthBars bars={bars} goal={30} unit="minutes a day" label="Minutes read a day" />)
    expect(container.querySelectorAll('.rdChartBar')).toHaveLength(2)
    expect(container.querySelectorAll('.rdChartBar--met')).toHaveLength(1) // October is over the goal
    expect(screen.getByRole('img', { name: /Sep 12, Oct 31\. Goal 30 minutes a day/ })).toBeInTheDocument()
  })

  it('leaves out the goal line when there is none', () => {
    const { container } = render(<MonthBars bars={bars} unit="posts" label="Posts" />)
    expect(container.querySelector('.rdChartGoal')).toBeNull()
  })
})
