import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { emptyPlanner, newMilestone, newPhase, type Planner } from '../../../../lib/facets'
import { PhaseTimeline } from './PhaseTimeline'

const plan = (): Planner => ({
  ...emptyPlanner(),
  timelineStart: '2026-10-01', timelineEnd: '2026-12-31',
  restDays: [{ id: 'x', start: '2026-12-24', end: '2026-12-26', label: 'Holiday' }],
  phases: [newPhase('a', 'Outlining', { status: 'done', start: '2026-10-01', end: '2026-10-31' }), newPhase('b', 'First draft', { status: 'active', start: '2026-11-01', end: '2026-12-20' })],
  milestones: [newMilestone('m', 'Outline locked', { date: '2026-10-30', phaseId: 'a' })],
})

let latest: Planner
function Harness({ initial }: { initial: Planner }) {
  const [p, setP] = useState(initial)
  latest = p
  return <PhaseTimeline planner={p} setPlanner={setP} today="2026-11-15" />
}

describe('the phase timeline', () => {
  it('draws a bar for each dated phase, a flag for each milestone, the rest days and today', () => {
    render(<Harness initial={plan()} />)
    const chart = screen.getByRole('group', { name: 'Phase timeline' })
    expect(within(chart).getByRole('button', { name: /^Outlining, Oct 1 to Oct 31/ }).className).toMatch(/--done/)
    expect(within(chart).getByRole('button', { name: /^First draft, Nov 1 to Dec 20/ }).className).toMatch(/--active/)
    expect(within(chart).getByRole('button', { name: 'Outline locked, Oct 30, not done' }).getAttribute('aria-pressed')).toBe('false')
    expect(chart.querySelectorAll('.wrTimelineRest i')).toHaveLength(1)
    expect(chart.querySelector('.wrTimelineNow')).toBeTruthy()
    expect(Array.from(chart.querySelectorAll('.wrTimelineRuler span')).map(s => s.textContent)).toEqual(['Oct', 'Nov', 'Dec'])
  })

  it('moves a phase a day with the arrows, a week with Shift, and changes where it ends with Alt', () => {
    render(<Harness initial={plan()} />)
    const bar = screen.getByRole('button', { name: /^First draft/ })
    fireEvent.keyDown(bar, { key: 'ArrowRight' })
    expect(latest.phases[1]).toMatchObject({ start: '2026-11-02', end: '2026-12-21' })
    fireEvent.keyDown(bar, { key: 'ArrowLeft', shiftKey: true })
    expect(latest.phases[1]).toMatchObject({ start: '2026-10-26', end: '2026-12-14' })
    fireEvent.keyDown(bar, { key: 'ArrowLeft', altKey: true })
    expect(latest.phases[1]).toMatchObject({ start: '2026-10-26', end: '2026-12-13' })
  })

  it('ticks a milestone, with the day, from its flag', async () => {
    const user = userEvent.setup()
    render(<Harness initial={plan()} />)
    await user.click(screen.getByRole('button', { name: 'Outline locked, Oct 30, not done' }))
    expect(latest.milestones[0]).toMatchObject({ done: true, doneOn: '2026-11-15' })
    expect(screen.getByRole('button', { name: 'Outline locked, Oct 30, done' })).toBeTruthy()
  })

  it('says what is missing before anything has a date', () => {
    render(<Harness initial={emptyPlanner()} />)
    expect(screen.getByText(/Give a phase dates/)).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Phase timeline' })).toBeNull()
  })

  it('sets the project start and end, and adds and changes rest days, in the fold under it', async () => {
    const user = userEvent.setup()
    render(<Harness initial={emptyPlanner()} />)
    await user.click(screen.getByRole('button', { name: /^Project dates and rest days/ }))
    fireEvent.change(screen.getByLabelText('Project starts'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Project ends'), { target: { value: '2027-03-01' } })
    expect(latest).toMatchObject({ timelineStart: '2026-10-01', timelineEnd: '2027-03-01' })
    await user.click(screen.getByRole('button', { name: 'Add rest days' }))
    await user.type(screen.getByLabelText('Rest days name'), 'Away')
    fireEvent.change(screen.getByLabelText('Away end'), { target: { value: '2026-10-05' } })
    expect(latest.restDays[0]).toMatchObject({ label: 'Away', start: '2026-10-01', end: '2026-10-05' })
    await user.click(screen.getByRole('button', { name: 'Delete Away' }))
    expect(latest.restDays).toEqual([])
  })
})
