import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyPlanner, type Planner } from '../../../../lib/facets'
import { outlineNode } from '../plotTestWorkspace'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { mockFetchBy } from '../../../../test/mockFetch'
import { localToday } from '../schedule/useSchedule'
import type { useChapterDraft } from '../useChapterDraft'
import type { usePublications } from '../usePublications'
import { PreviewPane } from './PreviewPane'

// A chapter opened in the Preview counts as read for a running revision pass with a reading goal.

const book = outlineNode('b1', 'book', null, { title: 'Salt & Ledger' })
const chapter = outlineNode('c1', 'chapter', 'b1', { title: 'Dawn' })
const OUTLINE = [book, chapter, outlineNode('m1', 'moment', 'c1')]
const draft = { bodies: { m1: 'She had coins.' }, status: 'idle', error: undefined } as unknown as ReturnType<typeof useChapterDraft>
const pubs = { publications: [], publishing: false, error: undefined, publish: async () => {} } as unknown as ReturnType<typeof usePublications>

function backend(planner: Planner) {
  return mockFetchBy(url => {
    if (url.endsWith('/planner')) return planner
    if (url.includes('/revision-flags')) return []
    return { footnotes: [], flags: [] }
  })
}
const reads = (fetch: ReturnType<typeof mockFetchBy>) => fetch.mock.calls.filter(([url, init]) => String(url).endsWith('/activity/read') && init?.method === 'POST')

function open() {
  const w = makeWorkspace({ activeProjectId: 'p1', activeProject: { title: 'Harbour Lights' }, outlineNodes: OUTLINE, books: [book], activeBook: book, activeBookChapters: [chapter] })
  render(<PreviewPane w={w} chapter={chapter} draft={draft} pubs={pubs} component="export" onComponent={() => {}} />)
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

describe('the Preview: reading for a revision pass', () => {
  it('records the chapter as read while a pass with a reading goal runs', async () => {
    const fetch = backend({ ...emptyPlanner(), passes: [{ id: 'p', name: 'Read', start: localToday(), end: null, kinds: [], goals: [{ id: 'g', kind: 'read', words: null }] }] })
    open()
    await waitFor(() => expect(reads(fetch)).toHaveLength(1))
    expect(JSON.parse(String(reads(fetch)[0][1]?.body))).toEqual({ chapterId: 'c1' })
  })

  it('records nothing without such a pass', async () => {
    const fetch = backend(emptyPlanner())
    open()
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/planner'))).toBe(true))
    await new Promise(r => setTimeout(r, 10))
    expect(reads(fetch)).toHaveLength(0)
  })
})
