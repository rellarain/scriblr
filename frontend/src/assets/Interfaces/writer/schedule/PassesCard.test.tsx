import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { emptyPlanner, type Planner } from '../../../../lib/facets'
import type { FlagLike, PassFacts, RevisionPass } from '../../../../lib/revisionPasses'
import { PassesCard } from './PassesCard'

const TODAY = '2026-11-27'
const pass = (over: Partial<RevisionPass> = {}): RevisionPass => ({ id: 'p1', name: 'Tighten', start: '2026-11-14', end: '2026-12-20', kinds: ['remove', 'merge'], goals: [], ...over })
const flag = (id: string, type: FlagLike['type'], resolvedAt: string | null = null): FlagLike => ({ id, scope: 'passage', type, resolvedAt })
const FACTS: PassFacts = {
  flags: [flag('a', 'remove'), flag('b', 'merge', '2026-11-20T10:00:00'), flag('c', 'change')],
  daily: {}, events: [], chapterIds: ['c1', 'c2', 'c3'], today: TODAY,
}

function Harness({ start, seen }: { start: Planner; seen?: (p: Planner) => void }) {
  const [planner, setPlanner] = useState(start)
  return <PassesCard planner={planner} onPlanner={next => { setPlanner(next); seen?.(next) }} facts={FACTS} projectTitle="Saga" bookCount={2} />
}
const withPasses = (...passes: RevisionPass[]): Planner => ({ ...emptyPlanner(), passes })
const last = (seen: Planner[]) => seen[seen.length - 1]

describe('PassesCard', () => {
  it('says there are no passes yet, and starts the first from today with a goal to resolve its flags', async () => {
    const seen: Planner[] = []
    render(<Harness start={emptyPlanner()} seen={p => seen.push(p)} />)
    expect(screen.getByText(/No revision passes yet/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'New pass' }))
    const made = last(seen).passes ?? []
    expect(made).toHaveLength(1)
    expect(made[0]).toMatchObject({ name: 'Pass 1', start: TODAY, end: null, kinds: [] })
    expect(made[0].goals.map(g => g.kind)).toEqual(['flags'])
    expect(screen.getByRole('region', { name: 'Pass 1' })).toBeTruthy()
    expect(screen.getByText('Resolve the pass’s flags (choose their kinds)')).toBeTruthy()
  })

  it('shows a card for each pass in the order they come, and opens the running one first', () => {
    render(<Harness start={withPasses(pass({ id: 'later', name: 'Polish', start: '2027-01-05', end: null }), pass())} />)
    const cards = within(screen.getByRole('list', { name: 'Revision passes' })).getAllByRole('listitem')
    expect(cards.map(c => c.querySelector('.wrPassCardName')?.textContent)).toEqual(['Pass 1 · Tighten', 'Pass 2 · Polish'])
    expect(cards[0].textContent).toContain('14 Nov to 20 Dec · 1 of 2 flags')
    expect(cards[1].textContent).toContain('From 5 Jan · not started')
    expect(cards[0].getAttribute('aria-current')).toBe('true')
    expect((screen.getByLabelText('Pass name') as HTMLInputElement).value).toBe('Tighten')
  })

  it('says what a pass covers: every book and chapter of the project', () => {
    render(<Harness start={withPasses(pass())} />)
    expect(screen.getByText('Every book and chapter of Saga: 2 books, 3 chapters.')).toBeTruthy()
  })

  it('chooses the kinds of flag a pass works through, kept in the order of the kinds', async () => {
    const seen: Planner[] = []
    render(<Harness start={withPasses(pass({ kinds: ['merge'] }))} seen={p => seen.push(p)} />)
    const kinds = screen.getByRole('group', { name: 'Kinds of flag in this pass' })
    expect(within(kinds).getByRole('button', { name: 'Merge' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(within(kinds).getByRole('button', { name: 'Review' }))
    expect(last(seen).passes?.[0].kinds).toEqual(['review', 'merge'])
    await userEvent.click(within(kinds).getByRole('button', { name: 'Merge' }))
    expect(last(seen).passes?.[0].kinds).toEqual(['review'])
  })

  it('adds a goal to cut words, only with a number, and removes a goal', async () => {
    const seen: Planner[] = []
    render(<Harness start={withPasses(pass())} seen={p => seen.push(p)} />)
    await userEvent.selectOptions(screen.getByLabelText('Kind of goal'), 'words')
    const add = screen.getByRole('button', { name: 'Add a goal' })
    expect((add as HTMLButtonElement).disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Words'), '500')
    await userEvent.click(add)
    expect(last(seen).passes?.[0].goals).toEqual([expect.objectContaining({ kind: 'words', words: -500 })])
    const goals = screen.getByRole('list', { name: 'Goals of this pass' })
    expect(within(goals).getByText('Cut 500 words across the project')).toBeTruthy()
    expect(within(goals).getByText('0 cut')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove the goal: Cut 500 words across the project' }))
    expect(last(seen).passes?.[0].goals).toEqual([])
    expect(screen.getByText('No goals yet.')).toBeTruthy()
  })

  it('shows how far its flags goal has come, of the flags of its kinds', () => {
    render(<Harness start={withPasses(pass({ goals: [{ id: 'g', kind: 'flags', words: null }] }))} />)
    const goals = screen.getByRole('list', { name: 'Goals of this pass' })
    expect(within(goals).getByText('Resolve every Remove and Merge flag')).toBeTruthy()
    expect(within(goals).getByText('1 of 2')).toBeTruthy()
    expect(within(goals).getByRole('img', { name: 'Resolve every Remove and Merge flag: 50 percent' })).toBeTruthy()
  })

  it('moves the last day with the first when the first goes past it', () => {
    const seen: Planner[] = []
    render(<Harness start={withPasses(pass())} seen={p => seen.push(p)} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-25' } })
    expect(last(seen).passes?.[0]).toMatchObject({ start: '2026-12-25', end: '2026-12-25' })
  })

  it('deletes a pass once confirmed, leaving its flags be', async () => {
    const seen: Planner[] = []
    render(<Harness start={withPasses(pass())} seen={p => seen.push(p)} />)
    await userEvent.click(within(screen.getByRole('region', { name: 'Pass 1' })).getByRole('button', { name: /^Delete/ }))
    expect(screen.getByText('Delete Tighten? Its flags stay.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(last(seen).passes).toEqual([])
    expect(screen.getByText(/No revision passes yet/)).toBeTruthy()
  })
})
