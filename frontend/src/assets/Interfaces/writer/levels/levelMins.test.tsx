import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../../api/types'
import { emptyDay, emptyPlanner, newTask, type FacetActivityData, type Goal, type Planner } from '../../../../lib/facets'
import { mockFetchBy } from '../../../../test/mockFetch'
import { makeWorkspace, type WorkspaceOverrides } from '../../../../test/makeWorkspace'
import { __resetPlanStoreForTests } from '../schedule/planStore'
import { DashMin, OutlineMin } from './levelMins'

// What the Dash and the Outline show under their header strip when they are Min.

const TODAY = '2026-11-01'
const outline = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)
const goal = (over: Partial<Goal> = {}): Goal => ({ id: 'g1', facet: 'draft', scope: 'project', nodeId: null, kind: null, daily: null, weekly: null, total: null, deadline: null, ...over })

function backend(planner: Planner, draftToday: number) {
  const activity: FacetActivityData = { today: TODAY, events: [], daily: { [TODAY]: { ...emptyDay(), draft: draftToday } }, monthly: {} }
  return mockFetchBy(url => {
    if (url.endsWith('/activity/facets')) return activity
    if (url.endsWith('/planner')) return planner
    if (url.endsWith('/analytics')) return { perChapter: [{ nodeId: 'c1', wordCount: 1200 }], perBook: [{ nodeId: 'b1', wordCount: 5000 }], perNode: [] }
    return {}
  })
}

beforeEach(() => {
  __resetPlanStoreForTests()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 1, 12, 0))
})
afterEach(() => { vi.useRealTimers() })

describe('DashMin', () => {
  const w = makeWorkspace({ projects: [{ projectId: 'p1', title: 'Saga' }] })

  it('shows the words written today against the first daily draft goal, and the tasks waiting', async () => {
    backend({ ...emptyPlanner(), goals: [goal({ daily: 500 })], items: [newTask('t1', 'Write the harbor scene', null), newTask('t2', 'Done one', null, { doneOn: TODAY })] }, 200)
    render(<DashMin w={w} />)
    const bar = await screen.findByRole('progressbar', { name: 'Written today' })
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(screen.getByText('200 of 500 words')).toBeTruthy()
    expect(within(screen.getByText('Tasks waiting').parentElement as HTMLElement).getByText('1')).toBeTruthy()
  })

  it('shows the plain count when there is no daily goal, and says no shift is coming up', async () => {
    backend(emptyPlanner(), 30)
    render(<DashMin w={w} />)
    expect(await screen.findByText('No shifts coming up.')).toBeTruthy()
    expect(screen.getByText('30 words')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

describe('OutlineMin', () => {
  const book = outline('b1', 'book', null, { title: 'Cold Harbor', chapterCountTarget: 4, wordCountGoal: 10000 } as Partial<OutlineNode>)
  const c1 = outline('c1', 'chapter', 'b1', { title: 'The Harbor Master' })
  const c2 = outline('c2', 'chapter', 'b1', { title: 'Low Tide' })
  const base: WorkspaceOverrides = { activeProjectId: 'p1', activeBook: book, activeBookChapters: [c1, c2], activeChapter: c2 }

  it('shows the chapters and the words against the book goals, and where you are in the book', async () => {
    backend(emptyPlanner(), 120)
    render(<OutlineMin w={makeWorkspace(base)} />)
    expect(screen.getByRole('progressbar', { name: 'Chapters' }).getAttribute('aria-valuenow')).toBe('50') // 2 of 4
    expect(await screen.findByRole('progressbar', { name: 'Words' })).toBeTruthy()
    expect(await screen.findByText('Open · Chapter 2')).toBeTruthy()
    expect(await screen.findByText(/Low Tide · 120 words written today/)).toBeTruthy()
  })

  it('shows plain counts when the book has no targets, and nothing without a book', async () => {
    backend(emptyPlanner(), 0)
    const plain = outline('b1', 'book', null, { title: 'Cold Harbor' })
    const { container, rerender } = render(<OutlineMin w={makeWorkspace({ ...base, activeBook: plain, activeChapter: undefined })} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('Chapters').parentElement?.textContent).toContain('2')
    rerender(<OutlineMin w={makeWorkspace({ ...base, activeBook: undefined })} />)
    expect(container.textContent).toBe('')
  })
})
