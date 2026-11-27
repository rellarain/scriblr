import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OutlineNode } from '../../../../api/types'
import { emptyDay, type ActivityEvent } from '../../../../lib/facets'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { mockFetchBy } from '../../../../test/mockFetch'
import { registerOpenDraft } from '../draftInserts'
import { outlineNode } from '../plotTestWorkspace'
import { localToday } from '../schedule/useSchedule'
import { HistoryTab } from './HistoryTab'

// The Project level's History tab against a backend that answers the facets, the outline's and the plot's snapshots and the chapters' revisions.

const TODAY = localToday()
const at = (hm: string) => new Date(`${TODAY}T${hm}:00`).toISOString()
const OUTLINE: OutlineNode[] = [
  outlineNode('b1', 'book', null, { title: 'The Lantern Road' }), outlineNode('c1', 'chapter', 'b1', { title: 'The Courier' }), outlineNode('m1', 'moment', 'c1'),
  outlineNode('b2', 'book', null, { title: 'Salt', order: 1 }), outlineNode('c2', 'chapter', 'b2', { title: 'Tide' }), outlineNode('m2', 'moment', 'c2'),
]
const words = (hm: string, nodeId: string, amount: number): ActivityEvent =>
  ({ ts: at(hm), date: TODAY, slot: 0, facet: 'draft', action: 'words', nodeId, kind: 'moment', label: null, amount })
const FACETS = {
  today: TODAY, monthly: {}, daily: { [TODAY]: { ...emptyDay(), draft: 186 } },
  events: [words('08:00', 'm1', 120), words('11:30', 'm2', 66)],
}
// Newest first, as the backend lists them.
const OUTLINE_SNAPS = [
  { snapshotId: 'o2', treeType: 'outline', createdAt: at('09:00'), trigger: 'auto', nodeCount: 6, summary: '+2 added' },
  { snapshotId: 'o1', treeType: 'outline', createdAt: at('07:00'), trigger: 'auto', nodeCount: 4, summary: '+4 added' },
]
const PLOT_SNAPS = [{ snapshotId: 'p1', treeType: 'plot', createdAt: at('10:00'), trigger: 'auto', nodeCount: 3, summary: '+3 added' }]
const REVISIONS = [
  { snapshotId: 'r1', chapterId: 'c1', createdAt: at('10:15'), label: 'Before the rewrite', trigger: 'manual', wordCount: 120 },
  { snapshotId: 'r2', chapterId: 'c2', createdAt: at('11:45'), label: 'Auto', trigger: 'auto', wordCount: 66 },
]
const RESTORED = [outlineNode('b1', 'book', null, { title: 'The Lantern Road' })]

function backend({ facets = FACETS as unknown, fail = false } = {}) {
  return mockFetchBy((url, init) => {
    if (fail) throw new Error('down')
    if (url.includes('/activity/facets')) return facets
    if (url.endsWith('/outline/history')) return OUTLINE_SNAPS
    if (url.includes('/outline/history/')) return { snapshotId: 'o1', nodes: RESTORED }
    if (url.endsWith('/plot/history')) return PLOT_SNAPS
    if (url.endsWith('/revision-summaries')) return REVISIONS
    if (url.includes('/diff?')) {
      return url.includes('momentId=m1')
        ? { ops: [{ op: 'equal', text: 'She ran. ' }, { op: 'delete', text: 'The ferryman took the coins.' }, { op: 'insert', text: 'The ferryman looked away.' }] }
        : { ops: [{ op: 'equal', text: 'Unchanged.' }] }
    }
    if (url.endsWith('/revert') && init?.method === 'POST') return { snapshotId: 'safety', moments: {} }
    if (url.includes('/revisions/c1/')) return { snapshotId: 'r1', moments: { m1: 'She ran. The ferryman took the coins.', m9: 'Unchanged.' } }
    return {}
  })
}

function setup(over: Record<string, unknown> = {}) {
  const w = makeWorkspace({ activeProjectId: 'p1', outlineNodes: OUTLINE, restoreOutline: vi.fn(), restorePlot: vi.fn(), ...over })
  render(<HistoryTab w={w} />)
  return w
}
const rowOf = (text: string | RegExp) => screen.getByText(text).closest('li') as HTMLElement
const shownTexts = () => screen.getAllByRole('listitem').map(li => li.querySelector('.wrHistoryText')?.firstChild?.textContent)

describe('the History tab', () => {
  it('shows the project’s day, newest first, its first four changes and the rest behind a button', async () => {
    backend()
    setup()
    expect(await screen.findByRole('heading', { name: /^Today, .* · 186 words · 7 changes$/ })).toBeInTheDocument()
    expect(shownTexts()).toEqual([
      'Chapter 1 · Tide · the rolling snapshot after 5 minutes idle',
      '66 words in Chapter 1 · Tide',
      'Chapter 1 · The Courier · saved by you, Before the rewrite (120 words)',
      'The plot’s oldest snapshot · 3 nodes',
    ])
    await userEvent.click(screen.getByRole('button', { name: '3 more on this day' }))
    expect(shownTexts()).toHaveLength(7)
    expect(screen.queryByRole('button', { name: /more on this day/ })).toBeNull()
  })

  it('keeps the kinds chosen, one book, and what is searched for', async () => {
    backend()
    setup()
    await screen.findByRole('heading', { name: /^Today/ })
    const show = screen.getByRole('group', { name: 'Show' })
    await userEvent.click(within(show).getByRole('button', { name: 'Outline' }))
    expect(within(show).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
    expect(shownTexts()).toEqual(['2 added · the outline then: 6 nodes', 'The outline’s oldest snapshot · 4 nodes'])
    await userEvent.click(within(show).getByRole('button', { name: 'All' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Book' }), 'Book 2 · Salt')
    expect(shownTexts()).toEqual(['Chapter 1 · Tide · the rolling snapshot after 5 minutes idle', '66 words in Chapter 1 · Tide'])
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the history' }), 'words')
    expect(shownTexts()).toEqual(['66 words in Chapter 1 · Tide'])
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the history' }), ' nowhere')
    expect(screen.getByText('Nothing like that in the history.')).toBeInTheDocument()
  })

  it('compares a revision with the chapter now: what is gone struck through, what is new underlined', async () => {
    backend()
    setup()
    await screen.findByRole('heading', { name: /^Today/ })
    const row = rowOf('Chapter 1 · The Courier · saved by you, Before the rewrite (120 words)')
    await userEvent.click(within(row).getByRole('button', { name: 'Compare' }))
    const changes = await within(row).findByLabelText('Changes since then')
    expect(changes.querySelector('del')).toHaveTextContent('The ferryman took the coins.')
    expect(changes.querySelector('ins')).toHaveTextContent('The ferryman looked away.')
    expect(changes.querySelectorAll('.wrHistoryDiff')).toHaveLength(1) // m9, a moment then that has not changed, is left out
    await userEvent.click(within(row).getByRole('button', { name: 'Hide changes' }))
    expect(within(row).queryByLabelText('Changes since then')).toBeNull()
  })

  it('restores the outline through the workspace once it is confirmed, and not when it is cancelled', async () => {
    backend()
    const w = setup()
    await screen.findByRole('heading', { name: /^Today/ })
    await userEvent.click(screen.getByRole('button', { name: '3 more on this day' }))
    const row = rowOf('The outline’s oldest snapshot · 4 nodes')
    await userEvent.click(within(row).getByRole('button', { name: 'Restore' }))
    expect(within(row).getByText('Put the outline back as it was at 07:00?')).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
    expect(w.restoreOutline).not.toHaveBeenCalled()
    await userEvent.click(within(row).getByRole('button', { name: 'Restore' }))
    await userEvent.click(within(within(row).getByRole('group', { name: 'Restore' })).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(w.restoreOutline).toHaveBeenCalledWith(RESTORED))
    expect(within(row).getByRole('status')).toHaveTextContent('Put back: Undo takes it back, Save keeps it.')
  })

  it('restores a chapter on the backend, the open draft saving first and reading it again after, and reads the history again', async () => {
    const fetch = backend()
    const order: string[] = []
    const close = registerOpenDraft('p1', 'c1', { take: () => {}, save: async () => { order.push('save') }, reload: () => { order.push('reload') } })
    setup()
    await screen.findByRole('heading', { name: /^Today/ })
    const row = rowOf('Chapter 1 · The Courier · saved by you, Before the rewrite (120 words)')
    await userEvent.click(within(row).getByRole('button', { name: 'Restore' }))
    expect(within(row).getByText('Put the chapter back as it was at 10:15?')).toBeInTheDocument()
    await userEvent.click(within(within(row).getByRole('group', { name: 'Restore' })).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(order).toEqual(['save', 'reload']))
    expect(fetch.mock.calls.some(([url, init]) => String(url).endsWith('/revisions/c1/r1/revert') && init?.method === 'POST')).toBe(true)
    await waitFor(() => expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/revision-summaries'))).toHaveLength(2))
    close()
  })

  it('says when the history cannot be read', async () => {
    backend({ fail: true })
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('The history could not be read.')
  })

  it('says when there is nothing in it yet', async () => {
    mockFetchBy(url => (url.includes('/activity/facets') ? { today: TODAY, events: [], daily: {}, monthly: {} } : []))
    setup()
    expect(await screen.findByText('Nothing in the history yet.')).toBeInTheDocument()
  })
})
