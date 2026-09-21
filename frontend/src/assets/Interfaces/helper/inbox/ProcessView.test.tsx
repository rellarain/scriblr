import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProcessView, { type ProcessActions } from './ProcessView'
import { SEARCH, bundle, statementCase, tone, vote } from './inboxTestData'

function setup(cases = [statementCase('c1')]) {
  const actions: ProcessActions = {
    voteCase: vi.fn(), voteSolution: vi.fn(), propose: vi.fn(async () => true), close: vi.fn(async () => true), reopen: vi.fn(),
  }
  render(<ProcessView bundle={bundle({ cases })} actions={actions} />)
  return { actions }
}

const card = () => screen.getByRole('article')
const expand = () => fireEvent.click(within(card()).getByRole('button', { expanded: false }))

describe('the process list', () => {
  it('shows a collapsed card with the essentials: verb, subject, tone, votes, validators and messages', () => {
    setup([statementCase('c1', { votes: [vote({ approve: true }), vote({ deny: true }), vote({ passed: true })] })])
    const head = within(card()).getByRole('button', { expanded: false })
    expect(head).toHaveTextContent('Increase')
    expect(head).toHaveTextContent('Writer / Shelf / Sidebar Shelf')          // the levels above, small
    expect(head).toHaveTextContent('Book Spines')                            // the most specific level
    expect(within(head).getByLabelText('1 yes, 1 no, 1 pass')).toBeInTheDocument()
    expect(within(head).getByTitle('3 validators')).toBeInTheDocument()
    expect(within(head).getByLabelText('Mixed-leaning unpleasant')).toBeInTheDocument()
    expect(screen.queryByText('Icons are dim')).not.toBeInTheDocument()       // messages open on demand
  })

  it('opens to the vote buttons, solutions, messages and history, and names nobody', () => {
    setup([statementCase('c1', {
      votes: [vote({ mine: false, approve: true, approveNote: 'Real problem' })],
      solutions: [{ id: 's1', title: 'Brighter icons', description: 'Raise lightness', target: SEARCH, mine: true, createdAt: '2026-08-12', votes: [] }],
      history: [{ at: '2026-08-12T10:00:00Z', kind: 'vote', detail: 'approved', mine: false }],
    })])
    expand()
    expect(screen.getByRole('button', { name: /vote yes on this statement/i })).toBeInTheDocument()
    expect(screen.getByText('Real problem')).toBeInTheDocument()
    expect(screen.getByText('Brighter icons')).toBeInTheDocument()
    expect(screen.getByText('yours')).toBeInTheDocument()
    expect(screen.getByText('Icons are dim')).toBeInTheDocument()
    expect(screen.getByText(/Someone voted yes/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Dana|Lee|a\.kim|j\.rivera/)
  })

  it('passes a vote to the vote action with all three sides', () => {
    const { actions } = setup()
    expand()
    fireEvent.click(screen.getByRole('button', { name: /vote pass on this statement/i }))
    expect(actions.voteCase).toHaveBeenCalledWith('c1', { approve: false, deny: false, passed: true, approveNote: '', denyNote: '', passNote: '' })
  })

  it('explains, as a tooltip, why proposing and closing are unavailable', () => {
    setup([statementCase('c1', { can: { vote: true, propose: false, close: false, reopen: false } })])
    expand()
    expect(screen.getByRole('button', { name: 'Propose a solution' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Propose a solution' })).toHaveAttribute('title', 'Proposing a solution needs the Configurer role on Writer > Shelf.')
    expect(screen.getByRole('button', { name: 'Close case' })).toHaveAttribute('title', 'Closing a case needs the Planner role on Writer > Shelf.')
  })

  it('closes with a note, as approved, through an icon button', async () => {
    const { actions } = setup()
    expand()
    fireEvent.click(screen.getByRole('button', { name: 'Close case' }))
    fireEvent.change(screen.getByLabelText('Closing note'), { target: { value: 'Ship it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close as approved' }))
    expect(actions.close).toHaveBeenCalledWith('c1', 'approved', 'Ship it')
  })

  it('a closed case shows its state and offers Reopen to Configurers only', () => {
    setup([statementCase('c1', { status: 'approved', closedAt: '2026-09-01T00:00:00Z', closeNote: 'Done', can: { vote: true, propose: false, close: false, reopen: false } })])
    expand()
    expect(screen.getByText(/Approved.*Done/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reopen case' })).toBeDisabled()
  })

  it('filters by tone category with the swatches and by view with the icon buttons', () => {
    const pleasant = statementCase('p', { verbName: 'Keep', tone: tone('pleasant', 3, 0, 0) })
    const bad = statementCase('b', { verbName: 'Fix', tone: tone('unpleasant', 0, 3, 0), status: 'rejected' })
    setup([pleasant, bad])
    expect(screen.getAllByRole('article')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Unpleasant' }))
    expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual([expect.stringContaining('Fix')])
    fireEvent.click(screen.getByRole('button', { name: 'Unpleasant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Closed' }))
    expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual([expect.stringContaining('Fix')])
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual([expect.stringContaining('Keep')])
  })

  it('marks what needs your vote with a dot and counts it on the filter', () => {
    setup([statementCase('c1')])
    expect(screen.getByLabelText('Needs your vote')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Needs my vote (1)' })).toBeInTheDocument()
  })
})
