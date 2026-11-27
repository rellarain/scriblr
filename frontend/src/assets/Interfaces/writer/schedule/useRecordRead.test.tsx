import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { emptyPlanner, type Planner } from '../../../../lib/facets'
import type { RevisionPass } from '../../../../lib/revisionPasses'
import { mockFetchBy } from '../../../../test/mockFetch'
import { useRecordRead } from './useRecordRead'
import { localToday } from './useSchedule'

const reading = (over: Partial<RevisionPass> = {}): RevisionPass =>
  ({ id: 'p', name: 'Read through', start: localToday(), end: null, kinds: [], goals: [{ id: 'g', kind: 'read', words: null }], ...over })

function backend(planner: Planner) {
  return mockFetchBy(url => (url.endsWith('/planner') ? planner : {}))
}
const posts = (fetch: ReturnType<typeof mockFetchBy>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === 'POST').map(([url, init]) => [url, JSON.parse(String(init?.body))])

describe('useRecordRead', () => {
  it('records the chapter as read when a pass with a reading goal is running', async () => {
    const fetch = backend({ ...emptyPlanner(), passes: [reading()] })
    renderHook(() => useRecordRead('prj', 'c1'))
    await waitFor(() => expect(posts(fetch)).toEqual([['/api/projects/prj/activity/read', { chapterId: 'c1' }]]))
  })

  it('records nothing when no running pass has a reading goal', async () => {
    const fetch = backend({
      ...emptyPlanner(),
      passes: [reading({ goals: [{ id: 'g', kind: 'flags', words: null }] }), reading({ id: 'q', start: '2999-01-01' })],
    })
    renderHook(() => useRecordRead('prj', 'c1'))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 10))
    expect(posts(fetch)).toEqual([])
  })

  it('does nothing without a project', async () => {
    const fetch = backend(emptyPlanner())
    renderHook(() => useRecordRead(null, 'c1'))
    await new Promise(r => setTimeout(r, 10))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('records the next chapter opened, too', async () => {
    const fetch = backend({ ...emptyPlanner(), passes: [reading()] })
    const { rerender } = renderHook(({ id }) => useRecordRead('prj', id), { initialProps: { id: 'c1' } })
    await waitFor(() => expect(posts(fetch)).toHaveLength(1))
    rerender({ id: 'c2' })
    await waitFor(() => expect(posts(fetch).map(([, body]) => body.chapterId)).toEqual(['c1', 'c2']))
  })
})
