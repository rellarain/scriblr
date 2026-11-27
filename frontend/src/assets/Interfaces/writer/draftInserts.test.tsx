import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { mockFetchBy } from '../../../test/mockFetch'
import { changeMomentDraft, registerOpenDraft } from './draftInserts'
import { withParagraph } from './scratchpad/noteConversion'
import { useChapterDraft } from './useChapterDraft'

// A change to a moment's draft made from elsewhere: into the open chapter's draft as typed text, or written to the backend.

const DRAFT = { moments: { m1: { body: 'One.', updatedAt: '2026-11-27T10:00:00Z' } } }
function backend() {
  return mockFetchBy((url, init) => {
    if (url.endsWith('/draft/chapter/c1') && !init?.method) return DRAFT
    if (url.includes('/revisions/')) return []
    return {}
  })
}
const puts = (fetch: ReturnType<typeof mockFetchBy>) => fetch.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([url, init]) => [url, JSON.parse(String(init?.body))])

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

describe('changeMomentDraft', () => {
  it('reads, changes and writes back a moment whose chapter is not open', async () => {
    const fetch = backend()
    expect(await changeMomentDraft('p1', 'c1', 'm1', body => withParagraph(body, 'New.', 'end'))).toBe('saved')
    expect(puts(fetch)).toEqual([['/api/projects/p1/draft/chapter/c1/moment/m1', expect.objectContaining({ body: 'One.\n\nNew.' })]])
  })

  it('starts a moment with no draft yet', async () => {
    const fetch = backend()
    await changeMomentDraft('p1', 'c1', 'm9', body => withParagraph(body, 'New.', 'start'))
    expect(puts(fetch)[0][1]).toEqual(expect.objectContaining({ body: 'New.' }))
  })

  it('gives the change to an open chapter instead, and to the backend again once it has closed', async () => {
    const fetch = backend()
    const taker = vi.fn()
    const close = registerOpenDraft('p1', 'c1', taker)
    expect(await changeMomentDraft('p1', 'c1', 'm1', body => `${body}!`)).toBe('open')
    expect(taker).toHaveBeenCalledWith('m1', expect.any(Function))
    expect(fetch).not.toHaveBeenCalled()
    close()
    expect(await changeMomentDraft('p1', 'c1', 'm1', body => `${body}!`)).toBe('saved')
  })
})

describe('the open chapter draft', () => {
  it('takes a change into its text once it has loaded, as an unsaved edit, and stops when it closes', async () => {
    const fetch = backend()
    const { result, unmount } = renderHook(() => useChapterDraft('p1', 'c1'))
    await waitFor(() => expect(result.current.bodies.m1).toBe('One.'))
    let where: string = ''
    await act(async () => { where = await changeMomentDraft('p1', 'c1', 'm1', body => withParagraph(body, 'New.', 'end')) })
    expect(where).toBe('open')
    expect(result.current.bodies.m1).toBe('One.\n\nNew.')
    expect(result.current.dirty).toBe(true)
    expect(puts(fetch)).toEqual([])
    unmount()
    await waitFor(() => expect(puts(fetch).length).toBeGreaterThan(0)) // closing saves what was typed
    expect(await changeMomentDraft('p1', 'c1', 'm1', b => b)).toBe('saved')
  })
})
