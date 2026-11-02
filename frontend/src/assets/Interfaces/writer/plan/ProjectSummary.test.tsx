import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import { mockFetchBy } from '../../../../test/mockFetch'
import { emptyPlanner, newMilestone, newPhase, newTask, type Planner } from '../../../../lib/facets'
import { ProjectSummary } from './ProjectSummary'

const TODAY = '2026-10-31'
const withPlan = (): Planner => ({
  ...emptyPlanner(),
  phases: [newPhase('a', 'Outlining', { status: 'done' }), newPhase('b', 'First draft', { status: 'active' })],
  milestones: [newMilestone('m', 'Half way', { phaseId: 'b', date: '2026-11-05' })],
  items: [newTask('t', 'Chapter 1', null, { phaseId: 'b', doneOn: TODAY }), newTask('u', 'Chapter 2', null, { phaseId: 'b' })],
})

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetchBy(url => {
    if (url.endsWith('/activity/facets')) return { today: TODAY, events: [], daily: {}, monthly: {} }
    if (url.endsWith('/planner')) return url.includes('/p1/') ? withPlan() : emptyPlanner()
    return {}
  })
})

describe('the Project summary', () => {
  it('shows the phase a project is in, how far it is, and the next milestone with the days to go', async () => {
    render(<ProjectSummary projectIds={['p1']} titles={{ p1: 'Saga' }} />)
    expect(await screen.findByText('First draft')).toBeTruthy()
    expect(screen.getByText('33%')).toBeTruthy() // one of three tagged with it: two tasks and a milestone
    expect(screen.getByText('Next: Half way')).toBeTruthy()
    expect(screen.getByText('in 5 days')).toBeTruthy()
    expect(screen.getByText(/2 phases · 0 processes · 0 exercises/)).toBeTruthy()
  })

  it('names each project when there are several, and says so when one has no phase yet', async () => {
    render(<ProjectSummary projectIds={['p1', 'p2']} titles={{ p1: 'Saga', p2: 'Novella' }} />)
    expect(await screen.findByText('Saga')).toBeTruthy()
    expect(screen.getByText('Novella')).toBeTruthy()
    expect(screen.getByText('No phase yet')).toBeTruthy()
  })
})
