import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../../api/types'
import { emptyDay, type DayTotals } from '../../../../lib/facets'
import { addDays } from '../../../../lib/projection'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { mockFetchBy } from '../../../../test/mockFetch'
import { outlineNode } from '../plotTestWorkspace'
import { localToday } from '../schedule/useSchedule'
import { BookGoals, bookFacts } from './BookGoals'

const TODAY = localToday()
// Three arcs of two chapters each (so each is a third of the word goal), and a chapter outside them in the second test.
const OUTLINE: OutlineNode[] = [
  outlineNode('b', 'book', null, { title: 'The Lantern Road' }),
  outlineNode('a1', 'arc', 'b', { title: 'Crossing' }),
  outlineNode('c1', 'chapter', 'a1'), outlineNode('s1', 'scene', 'c1'), outlineNode('m1', 'moment', 's1'), outlineNode('m2', 'moment', 's1', { order: 1 }),
  outlineNode('c2', 'chapter', 'a1', { order: 1 }),
  outlineNode('a2', 'arc', 'b', { title: 'The Toll', order: 1 }),
  outlineNode('c3', 'chapter', 'a2'), outlineNode('c4', 'chapter', 'a2', { order: 1 }),
  outlineNode('a3', 'arc', 'b', { title: 'Far Bank', order: 2 }),
  outlineNode('c5', 'chapter', 'a3'), outlineNode('c6', 'chapter', 'a3', { order: 1 }),
]
const WORDS = { b: 41200, a1: 30000, a2: 11200, c1: 30000, c3: 11200 }
// Eight weeks of 1,400 to 1,900 words, and a chapter made in two of them.
const WEEKS = [1500, 1700, 1600, 1800, 1500, 1900, 1400, 1650]
function activity(weeks = WEEKS): Record<string, DayTotals> {
  const daily: Record<string, DayTotals> = {}
  weeks.forEach((words, i) => { daily[addDays(TODAY, -i * 7)] = { ...emptyDay(), draft: words, kinds: i < 2 ? { chapter: 1 } : {} } })
  return daily
}
const backend = (daily: Record<string, DayTotals>) => mockFetchBy(url => (url.includes('/activity/facets') ? { today: TODAY, events: [], daily, monthly: {} } : {}))

function Harness({ book, nodes = OUTLINE, spy }: { book: Partial<OutlineNode>; nodes?: OutlineNode[]; spy?: (id: string, patch: Partial<OutlineNode>) => void }) {
  const [tree, setTree] = useState(() => nodes.map(n => (n.id === 'b' ? { ...n, ...book } : n)))
  const w = makeWorkspace({
    activeProjectId: 'p1', outlineNodes: tree,
    updateOutlineNode: (id: string, patch: Partial<OutlineNode>) => { spy?.(id, patch); setTree(t => t.map(n => (n.id === id ? { ...n, ...patch } : n))) },
  })
  return <BookGoals w={w} book={tree.find(n => n.id === 'b') as OutlineNode} nodeWords={WORDS} />
}

beforeEach(() => { backend(activity()) })

describe("a book's facts", () => {
  it('counts what the book holds, and makes a part of each arc', () => {
    const { counts, parts } = bookFacts(OUTLINE, OUTLINE[0], WORDS)
    expect(counts).toEqual({ words: 41200, chapter: 6, scene: 1, moment: 2 })
    expect(parts.map(p => [p.label, p.done, p.chapters])).toEqual([['Arc 1 · Crossing', 30000, 2], ['Arc 2 · The Toll', 11200, 2], ['Arc 3 · Far Bank', 0, 2]])
  })

  it('puts the chapters outside an arc in a part of their own, after the arcs', () => {
    const nodes = [...OUTLINE, outlineNode('loose', 'chapter', 'b', { order: 5 })]
    const { parts } = bookFacts(nodes, nodes[0], { ...WORDS, loose: 900 })
    expect(parts[parts.length - 1]).toMatchObject({ id: 'loose', label: 'Chapters outside an arc', done: 900, chapters: 1 })
  })
})

describe('BookGoals', () => {
  it('asks for a goal when there is none', () => {
    render(<Harness book={{}} />)
    expect(screen.getByText(/Set a goal for the words or for the outline to fill/)).toBeTruthy()
    expect(screen.queryByText(/Your usual pace/)).toBeNull()
  })

  it('sets a goal for the words and for each kind of node, a nought being no goal', async () => {
    const spy = vi.fn()
    render(<Harness book={{}} spy={spy} />)
    const field = (name: string) => within(screen.getByText(name).closest('label') as HTMLElement).getByRole('textbox')
    await userEvent.type(field('Scenes'), '120')
    expect(spy).toHaveBeenLastCalledWith('b', { sceneCountTarget: 120 })
    await userEvent.type(field('Moments'), '0')
    expect(spy).toHaveBeenLastCalledWith('b', { momentCountTarget: null })
  })

  it('without dates, estimates how long the rest takes at the usual pace, and draws each arc on the timeline', async () => {
    render(<Harness book={{ wordCountGoal: 90000 }} />)
    expect(await screen.findByText(/1,500 to 1,750 words a week, from your writing activity over the last 8 weeks/)).toBeTruthy()
    expect(screen.getByText(/^About \d+( to \d+)? months? at your usual pace$/)).toBeTruthy()
    expect(screen.getByText(/^The book would be done (between|around) .+ \d{4}\. The timeline below follows these estimates\.$/)).toBeTruthy()
    expect(screen.getByText('Timeline from the estimates')).toBeTruthy()
    const rows = screen.getAllByRole('img').map(r => r.getAttribute('aria-label'))
    expect(rows[0]).toBe('Arc 1 · Crossing: done')
    expect(rows[1]).toMatch(/^Arc 2 · The Toll: done (between|around) .+ at your pace$/)
    expect(rows[2]).toMatch(/^Arc 3 · Far Bank: done/)
    expect(screen.queryByText('Your dates')).toBeNull()
    // The months' years: under the first month and each January; narrow (every second month shown), under each shown month a year begins.
    const years = (selector: string) => Array.from(document.querySelectorAll(selector)).map(e => e.textContent)
    expect(years('.wrBookTimelineYear:not(.wrBookTimelineYear--narrow)')[0]).toBe(TODAY.slice(0, 4))
    const narrow = years('.wrBookTimelineYear--narrow')
    expect(narrow[0]).toBe(TODAY.slice(0, 4))
    expect(new Set(narrow).size).toBe(narrow.length)
  })

  it('says every goal is met', async () => {
    render(<Harness book={{ wordCountGoal: 40000, chapterCountTarget: 6 }} />)
    expect(await screen.findByText('Every goal is met')).toBeTruthy()
  })

  it('says which goals have no pace yet, and gives no estimate then', async () => {
    render(<Harness book={{ wordCountGoal: 90000, sceneCountTarget: 40 }} />)
    expect(await screen.findByText(/Not enough activity in the last 8 weeks yet to know your pace for scenes/)).toBeTruthy()
    expect(screen.queryByText(/at your usual pace$/)).toBeNull()
  })

  it('with too little activity, has no pace at all', async () => {
    backend(activity([1500]))
    render(<Harness book={{ wordCountGoal: 90000 }} />)
    expect(await screen.findByText(/Not enough activity .* for words/)).toBeTruthy()
    expect(screen.queryByText(/Your usual pace/)).toBeNull()
    expect(screen.queryByText('Timeline from the estimates')).toBeNull()
  })

  it('switches to deadlines: a date for the book and each arc, with the pace each needs and whether it is within reach', async () => {
    const spy = vi.fn()
    const nodes = OUTLINE.map(n => (n.id === 'a2' ? { ...n, dueDate: addDays(TODAY, 28) } : n.id === 'a3' ? { ...n, dueDate: addDays(TODAY, 300) } : n))
    render(<Harness book={{ wordCountGoal: 90000, dueDate: addDays(TODAY, 300) }} nodes={nodes} spy={spy} />)
    await screen.findByText(/Your usual pace/)
    await userEvent.click(screen.getByRole('button', { name: 'Deadlines' }))
    expect(spy).toHaveBeenLastCalledWith('b', { goalsDated: true })
    expect(screen.getByRole('button', { name: 'Deadlines' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText(/at your usual pace$/)).toBeNull()

    const row = (label: string) => {
      const name = screen.getAllByText(label).find(e => e.classList.contains('wrBookGoalsPart')) as HTMLElement
      return name.nextElementSibling?.nextElementSibling as HTMLElement
    }
    expect(within(row('The book')).getByText('Within reach')).toBeTruthy()
    expect(row('The book').textContent).toMatch(/needs 1,1\d0 words a week/)
    expect(within(row('Arc 1 · Crossing')).getByText('No date')).toBeTruthy()
    expect(within(row('Arc 2 · The Toll')).getByText('Above your pace')).toBeTruthy()
    expect(row('Arc 2 · The Toll').textContent).toMatch(/needs 4,700 words a week; at your pace it ends/)
    expect(within(row('Arc 3 · Far Bank')).getByText('Within reach')).toBeTruthy()
    expect(row('Arc 3 · Far Bank').textContent).toMatch(/a week after Arc 2 · The Toll$/)
    expect(screen.getByText('Timeline: your dates and the estimates beside them')).toBeTruthy()
    expect(screen.getByText('Your dates')).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Arc 1 · Crossing's date"), { target: { value: '2027-01-31' } })
    expect(spy).toHaveBeenLastCalledWith('a1', { dueDate: '2027-01-31' })
    fireEvent.change(screen.getByLabelText("The book's date"), { target: { value: '' } })
    expect(spy).toHaveBeenLastCalledWith('b', { dueDate: null })
  })

  it('with deadlines but no word goal, plans the book in its outline goal and says the arcs need a word goal for dates', async () => {
    render(<Harness book={{ chapterCountTarget: 12, goalsDated: true, dueDate: addDays(TODAY, 70) }} />)
    await waitFor(() => expect(screen.getByText(/a week, from your writing activity/)).toBeTruthy())
    expect(screen.getByLabelText("The book's date")).toBeTruthy()
    expect(screen.queryByLabelText("Arc 1 · Crossing's date")).toBeNull()
    expect(screen.getByText('With a word count goal, each arc can have a date of its own.')).toBeTruthy()
    const name = screen.getAllByText('The book').find(e => e.classList.contains('wrBookGoalsPart')) as HTMLElement
    // Six chapters left in ten weeks is a chapter a week, above a pace of a chapter in each of the last two weeks only.
    expect(name.nextElementSibling?.nextElementSibling?.textContent).toMatch(/^Above your paceneeds 1 chapter a week; at your pace it ends \w/)
  })
})
