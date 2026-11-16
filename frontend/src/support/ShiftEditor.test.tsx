import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedbackBackend } from '../test/feedbackBackend'
import { getRosterState, useRoster } from '../staff/rosterStore'
import ShiftEditor from './ShiftEditor'
import WeekTable from './WeekTable'

vi.setConfig({ testTimeout: 30000 })

let backend: ReturnType<typeof feedbackBackend>
beforeEach(() => { backend = feedbackBackend() })

// The roster's people of one team, as the Office's Team tile gives them.
function TeamWeek({ teamId }: { teamId: string }) {
  const { view } = useRoster()
  if (!view) return null
  return <WeekTable label="Shifts of the team" people={view.people.filter(p => p.teamId === teamId)} />
}

describe('the shift editor and the week table', () => {
  it('lets an admin (the owner) set next week on Admin > Dashboard > Schedule, within their hours', async () => {
    render(<ShiftEditor label="Schedule" />)
    const next = await screen.findByRole('region', { name: 'Next week' })
    expect(screen.getByLabelText('Schedule')).toHaveTextContent('30 h a week')
    const friday = within(next).getByRole('switch', { name: 'Work on Friday' })
    if (friday.getAttribute('aria-checked') === 'true') fireEvent.click(friday)
    fireEvent.click(within(next).getByRole('switch', { name: 'Work on Friday' }))
    fireEvent.click(within(next).getByRole('button', { name: 'Save next week' }))
    await waitFor(() => expect(backend.calls).toContain('PUT /support/schedule'))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Next week' })).getByRole('button', { name: 'Save next week' })).toBeDisabled())
  })

  it("shows a team's people with helper hours, day by day, this week or next (read only)", async () => {
    render(<TeamWeek teamId="team-help" />)
    const table = await screen.findByRole('table', { name: 'Shifts of the team, this week' })
    expect(within(table).getAllByRole('rowheader').map(r => r.textContent).sort()).toEqual(['Ari Chen', 'Noor Haddad', 'Sam Ortiz'])
    expect(within(table).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['Name', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Hours'])
    const ari = within(table).getByRole('row', { name: /Ari Chen/ })
    expect(ari).toHaveTextContent(/\d+:00–\d+:00/)
    expect(ari).toHaveTextContent('4 h')
    expect(within(table).queryByRole('button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.getByRole('table', { name: 'Shifts of the team, next week' })).toBeInTheDocument()
    // Dana and Lee (another team) are not listed
    expect(getRosterState().view?.people.some(p => p.id === 'adm-lee')).toBe(true)
    expect(screen.queryByText('Lee Park')).toBeNull()
  })
})
