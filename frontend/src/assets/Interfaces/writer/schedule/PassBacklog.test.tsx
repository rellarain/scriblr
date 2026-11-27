import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyPlanner } from '../../../../lib/facets'
import type { RevisionPass } from '../../../../lib/revisionPasses'
import { Backlog } from './Backlog'
import { PassBacklog } from './PassBacklog'
import type { RevisionFlag } from './scheduleApi'

const TODAY = '2026-11-27'
const pass = (over: Partial<RevisionPass> = {}): RevisionPass => ({ id: 'p1', name: 'Tighten', start: '2026-11-14', end: '2026-12-20', kinds: ['remove', 'merge'], goals: [], ...over })
const flag = (id: string, over: Partial<RevisionFlag> = {}): RevisionFlag => ({
  id, scope: 'passage', type: 'remove', note: '', chapterId: 'c1', momentId: 'm1', start: 0, end: 5, snippet: `Line ${id}`, stale: false,
  mergeWith: null, createdAt: '2026-11-01T10:00:00', resolvedAt: null, outcome: '', ...over,
})
const WHERE: Record<string, string> = { c1: 'Book 1 · Ch 1', c2: 'Book 1 · Ch 2' }
const whereOf = (id: string) => WHERE[id] ?? ''

describe('PassBacklog', () => {
  it('lists a running pass’s open flags of its kinds, each with its kind, where it is and the flagged text', () => {
    const flags = [flag('a'), flag('b', { type: 'merge', chapterId: 'c2' }), flag('c', { type: 'change' }), flag('d', { resolvedAt: '2026-11-20T10:00:00' })]
    render(<PassBacklog passes={[pass()]} flags={flags} today={TODAY} whereOf={whereOf} search="" />)
    const group = screen.getByRole('region', { name: 'Pass 1 · Tighten' })
    expect(within(group).getByText('2 open · due 20 Dec')).toBeTruthy()
    const rows = Array.from(group.querySelectorAll('.wrPassTask')).map(r => r.textContent)
    expect(rows).toEqual(['RemoveBook 1 · Ch 1“Line a”', 'MergeBook 1 · Ch 2“Line b”'])
  })

  it('leaves out passes not running and passes with no kinds chosen', () => {
    render(
      <PassBacklog
        passes={[pass({ id: 'up', name: 'Later', start: '2027-01-01' }), pass({ id: 'none', name: 'Bare', kinds: [] }), pass({ id: 'old', name: 'Old', start: '2026-10-01', end: '2026-10-30' })]}
        flags={[flag('a')]} today={TODAY} whereOf={whereOf} search=""
      />,
    )
    expect(screen.queryAllByRole('region')).toEqual([])
  })

  it('says when every flag of a running pass is resolved', () => {
    render(<PassBacklog passes={[pass({ end: null })]} flags={[]} today={TODAY} whereOf={whereOf} search="" />)
    const group = screen.getByRole('region', { name: 'Pass 1 · Tighten' })
    expect(within(group).getByText('0 open')).toBeTruthy()
    expect(within(group).getByText('Every flag of this pass is resolved.')).toBeTruthy()
  })

  it('says a flag on the whole project by its note, and a flag whose text is gone as gone', () => {
    const flags = [flag('p', { scope: 'project', chapterId: null, momentId: null, note: 'Cut the prologue' }), flag('s', { stale: true, snippet: 'old words' })]
    render(<PassBacklog passes={[pass()]} flags={flags} today={TODAY} whereOf={whereOf} search="" />)
    expect(screen.getByText('The project')).toBeTruthy()
    expect(screen.getByText('Cut the prologue')).toBeTruthy()
    expect(screen.getByText('Text gone: “old words”')).toBeTruthy()
  })

  it('opens a flag’s chapter from its row', async () => {
    const onOpenChapter = vi.fn()
    render(<PassBacklog passes={[pass()]} flags={[flag('a', { chapterId: 'c2' })]} today={TODAY} whereOf={whereOf} search="" onOpenChapter={onOpenChapter} />)
    await userEvent.click(screen.getByRole('button', { name: /Line a/ }))
    expect(onOpenChapter).toHaveBeenCalledWith('c2')
  })

  it('shows the first five rows, and the rest behind “N more”', async () => {
    const flags = Array.from({ length: 8 }, (_, i) => flag(`f${i}`))
    const { container } = render(<PassBacklog passes={[pass()]} flags={flags} today={TODAY} whereOf={whereOf} search="" />)
    expect(container.querySelectorAll('.wrPassTask')).toHaveLength(5)
    await userEvent.click(screen.getByRole('button', { name: '3 more' }))
    expect(container.querySelectorAll('.wrPassTask')).toHaveLength(8)
  })

  it('keeps only the rows the search finds, by kind, place or text, and drops a group with none', () => {
    const flags = [flag('a', { snippet: 'the storm broke' }), flag('b', { chapterId: 'c2', snippet: 'quiet morning' })]
    const { rerender } = render(<PassBacklog passes={[pass()]} flags={flags} today={TODAY} whereOf={whereOf} search="storm" />)
    expect(screen.getByText('“the storm broke”')).toBeTruthy()
    expect(screen.queryByText('“quiet morning”')).toBeNull()
    rerender(<PassBacklog passes={[pass()]} flags={flags} today={TODAY} whereOf={whereOf} search="ch 2" />)
    expect(screen.getByText('“quiet morning”')).toBeTruthy()
    rerender(<PassBacklog passes={[pass()]} flags={flags} today={TODAY} whereOf={whereOf} search="nowhere" />)
    expect(screen.queryByRole('region', { name: 'Pass 1 · Tighten' })).toBeNull()
  })
})

describe('the Backlog with revision passes', () => {
  const backlog = (passCount: number) => (
    <Backlog
      owners={[{ id: 'p1', label: 'Novel', planner: emptyPlanner() }]} today={TODAY} nowSlot={60} todayTicks={{ p1: [] }} events={[]} targets={[]} nodes={[]}
      onPlanner={() => undefined} onTick={() => undefined} passCount={passCount}
      passGroups={search => <PassBacklog passes={[pass()]} flags={[flag('a', { snippet: 'the storm broke' }), flag('b', { snippet: 'quiet' })]} today={TODAY} whereOf={whereOf} search={search} />}
    />
  )

  it('shows the running passes’ flags as groups, and no “Nothing waiting” while they are open', () => {
    render(backlog(2))
    expect(screen.getByRole('region', { name: 'Pass 1 · Tighten' })).toBeTruthy()
    expect(screen.queryByText(/Nothing waiting/)).toBeNull()
  })

  it('hands the backlog’s search to the pass groups', async () => {
    render(backlog(2))
    await userEvent.type(screen.getByLabelText('Search the backlog'), 'storm')
    expect(screen.getByText('“the storm broke”')).toBeTruthy()
    expect(screen.queryByText('“quiet”')).toBeNull()
  })

  it('says nothing is waiting when no pass has open flags and there are no tasks', () => {
    render(
      <Backlog
        owners={[{ id: 'p1', label: 'Novel', planner: emptyPlanner() }]} today={TODAY} nowSlot={60} todayTicks={{ p1: [] }} events={[]} targets={[]} nodes={[]}
        onPlanner={() => undefined} onTick={() => undefined} passCount={0} passGroups={() => null}
      />,
    )
    expect(screen.getByText(/Nothing waiting/)).toBeTruthy()
  })
})
