import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyPlanner, newTask, type Planner } from '../../../../lib/facets'
import { Backlog } from './Backlog'

const TODAY = '2026-11-04'
const TARGETS = [{ id: 'c3', title: 'Chapter 3', tree: 'outline' as const, kind: 'chapter' }]
const NODES = [{ id: 'c3', parentId: null, title: 'Chapter 3' }]

function Harness({ start, seen, onOpenNode }: { start: Planner; seen?: (p: Planner) => void; onOpenNode?: (tree: 'outline' | 'plot', id: string) => void }) {
  const [planner, setPlanner] = useState(start)
  const [ticks, setTicks] = useState<string[]>([])
  return (
    <Backlog
      owners={[{ id: 'p1', label: 'Novel', planner }]} today={TODAY} nowSlot={60} todayTicks={{ p1: ticks }} events={[]} targets={TARGETS} nodes={NODES} onOpenNode={onOpenNode}
      onPlanner={(_id, next) => { setPlanner(next); seen?.(next) }}
      onTick={(_o, id, on) => { setTicks(t => (on ? [...t, id] : t.filter(x => x !== id))); setPlanner(p => ({ ...p, items: p.items.map(i => (i.id === id ? { ...i, doneOn: on ? TODAY : null } : i)) })) }}
    />
  )
}
const planner = (...items: ReturnType<typeof newTask>[]): Planner => ({ ...emptyPlanner(), items })
const region = (name: RegExp) => screen.getByRole('region', { name })

describe('Backlog', () => {
  it('lists the tasks by priority, with the ones without a priority in a fold', () => {
    render(<Harness start={planner(newTask('a', 'Alpha', TODAY, { priority: 'high' }), newTask('b', 'Bravo', TODAY, { priority: 'low' }), newTask('c', 'Charlie', TODAY))} />)
    expect(within(region(/^High/)).getByText('Alpha')).toBeTruthy()
    expect(within(region(/^Low/)).getByText('Bravo')).toBeTruthy()
    expect(screen.queryByText('Charlie')).toBeNull()
    expect(screen.getByRole('button', { name: /None priority · 1/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('opens the fold of tasks without a priority by itself when nothing else is waiting', () => {
    render(<Harness start={planner(newTask('c', 'Charlie', TODAY))} />)
    expect(screen.getByText('Charlie')).toBeTruthy()
    expect(screen.getByRole('button', { name: /None priority · 1/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('puts an overdue task in its own group, marked', () => {
    render(<Harness start={planner(newTask('a', 'Late one', '2026-10-01', { priority: 'low', dueDate: '2026-11-01' }))} />)
    const overdue = region(/^Overdue/)
    expect(within(overdue).getByText('Late one')).toBeTruthy()
    expect(within(overdue).getByText('Overdue')).toBeTruthy()
  })

  it('adds a task from the quick-add line: priority, estimate, due day and node', async () => {
    const seen = vi.fn()
    render(<Harness start={planner()} seen={seen} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('New task'), 'Revise it !high ~2h ^2026-11-09 @chapter 3{Enter}')
    const added = (seen.mock.calls.at(-1)?.[0] as Planner).items[0]
    expect(added).toMatchObject({ label: 'Revise it', priority: 'high', estimateMinutes: 120, dueDate: '2026-11-09', targetNodeId: 'c3', targetTree: 'outline', addedOn: TODAY })
    expect(within(region(/^High/)).getByText('Revise it')).toBeTruthy()
  })

  it('changes a priority from the marker, which opens into the four to pick from', async () => {
    render(<Harness start={planner(newTask('a', 'Alpha', TODAY, { priority: 'high' }))} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Alpha: High priority/ }))
    expect(within(screen.getByRole('radiogroup', { name: 'Alpha priority' })).getAllByRole('radio').map(r => r.textContent)).toEqual(['High', 'Medium', 'Low', 'None'])
    await user.click(screen.getByRole('radio', { name: 'Low' }))
    expect(within(region(/^Low/)).getByText('Alpha')).toBeTruthy()
  })

  it('opens a task in place to add subtasks and shows their progress', async () => {
    render(<Harness start={planner(newTask('a', 'Alpha', TODAY, { priority: 'medium' }))} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Alpha details' }))
    await user.type(screen.getByLabelText('New subtask'), 'First{Enter}')
    await user.type(screen.getByLabelText('New subtask'), 'Second{Enter}')
    await user.click(screen.getByRole('checkbox', { name: 'First' }))
    expect(screen.getByRole('progressbar', { name: 'Alpha progress' }).getAttribute('aria-valuenow')).toBe('50')
    expect(screen.getByText('Subtasks · 1/2')).toBeTruthy()
  })

  it('ticks a task done and moves it to the done list for today', async () => {
    render(<Harness start={planner(newTask('a', 'Alpha', TODAY, { priority: 'medium' }))} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'Alpha' }))
    expect(within(region(/^Done/)).getByText('Alpha')).toBeTruthy()
    expect(screen.queryByRole('region', { name: /^Medium/ })).toBeNull()
  })

  it('searches the tasks and routines', async () => {
    render(<Harness start={planner(newTask('a', 'Alpha', TODAY, { priority: 'high' }), newTask('b', 'Bravo', TODAY, { priority: 'high', notes: 'harbour' }))} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Search the backlog'), 'harbour')
    expect(screen.queryByText('Alpha')).toBeNull()
    expect(screen.getByText('Bravo')).toBeTruthy()
    await user.clear(screen.getByLabelText('Search the backlog'))
    await user.type(screen.getByLabelText('Search the backlog'), 'zzz')
    expect(screen.getByText('Nothing matches.')).toBeTruthy()
  })

  it('opens the node a task is about', async () => {
    const open = vi.fn()
    render(<Harness start={planner(newTask('a', 'Alpha', TODAY, { priority: 'high', targetNodeId: 'c3', targetTree: 'outline' }))} onOpenNode={open} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Alpha details' }))
    await user.click(screen.getByRole('button', { name: /Open Chapter 3/ }))
    expect(open).toHaveBeenCalledWith('outline', 'c3')
  })

  it('adds a routine with a preset from the repeat picker', async () => {
    const seen = vi.fn()
    render(<Harness start={planner()} seen={seen} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Add a routine' }))
    await user.type(screen.getByLabelText('Routine'), 'Water the plants')
    await user.click(screen.getByRole('radio', { name: 'Weekdays' }))
    await user.click(screen.getByRole('button', { name: 'Add routine' }))
    const routine = (seen.mock.calls.at(-1)?.[0] as Planner).routines[0]
    expect(routine).toMatchObject({ label: 'Water the plants', recurrence: { kind: 'weekly', every: 1, days: [0, 1, 2, 3, 4] } })
  })
})
