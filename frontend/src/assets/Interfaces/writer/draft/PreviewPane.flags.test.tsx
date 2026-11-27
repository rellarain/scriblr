import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { outlineNode } from '../plotTestWorkspace'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { mockFetchBy } from '../../../../test/mockFetch'
import type { useChapterDraft } from '../useChapterDraft'
import type { usePublications } from '../usePublications'
import { PreviewPane } from './PreviewPane'

const chapter = outlineNode('c1', 'chapter', null, { title: 'Crossing' })
const OUTLINE = [chapter, outlineNode('m1', 'moment', 'c1'), outlineNode('m2', 'moment', 'c1', { order: 1 })]
const BODIES = { m1: 'She had coins. And a letter.', m2: 'They were enough.' }

const draft = { bodies: BODIES, status: 'idle', error: undefined } as unknown as ReturnType<typeof useChapterDraft>
const pubs = { publications: [], publishing: false, error: undefined, publish: async () => {} } as unknown as ReturnType<typeof usePublications>

let sent: Array<Record<string, unknown>> = []
beforeEach(() => {
  sent = []
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  mockFetchBy((url, init) => {
    if (url.includes('/revision-flags') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      sent.push(body)
      const other = body.mergeWith as { momentId: string; start: number; end: number } | undefined
      const mergeWith = other ? { ...other, snippet: BODIES[other.momentId as keyof typeof BODIES].slice(other.start, other.end), stale: false } : null
      return { id: 'f1', note: '', snippet: 'She had coins.', stale: false, createdAt: '2026-11-27T00:00:00Z', resolvedAt: null, outcome: '', ...body, mergeWith }
    }
    if (url.includes('/revision-flags')) return []
    return { footnotes: [], flags: [] }
  })
})

function open() {
  const w = makeWorkspace({ activeProjectId: 'p1', outlineNodes: OUTLINE, activeBookChapters: [chapter] })
  render(<PreviewPane w={w} chapter={chapter} draft={draft} pubs={pubs} component="flag" onComponent={() => {}} />)
  return userEvent.setup()
}
const sentence = (text: string) => screen.getByText(text, { selector: '.wrSentence' })

describe('the Preview: a Merge flag', () => {
  it('picks the second sentence on the page and sends it with the flag', async () => {
    const user = open()
    await user.click(screen.getByRole('button', { name: 'Merge' }))
    await user.click(sentence('She had coins.'))
    await user.click(screen.getByRole('button', { name: 'Pick on the page' }))
    await user.click(sentence('They were enough.'))
    // The click picked it: the first stays selected, the second is marked to merge with.
    expect(sentence('She had coins.').className).toContain('wrSentence--selected')
    expect(sentence('They were enough.').className).toContain('wrSentence--merge')
    expect(within(screen.getByRole('group', { name: 'Merge with' })).getByText('“They were enough.”')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Flag this sentence' }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ scope: 'passage', type: 'merge', chapterId: 'c1', momentId: 'm1', start: 0, mergeWith: { momentId: 'm2', start: 0 } })
    // Once flagged, the pick is cleared.
    expect(sentence('They were enough.').className).not.toContain('wrSentence--merge')
  })

  it('sends no second passage for another kind, and forgets the pick when the kind changes', async () => {
    const user = open()
    await user.click(screen.getByRole('button', { name: 'Merge' }))
    await user.click(sentence('She had coins.'))
    await user.click(screen.getByRole('button', { name: 'Pick on the page' }))
    await user.click(sentence('They were enough.'))
    await user.click(screen.getByRole('button', { name: 'Simplify' }))
    expect(screen.queryByRole('group', { name: 'Merge with' })).toBeNull()
    expect(sentence('They were enough.').className).not.toContain('wrSentence--merge')
    await user.click(screen.getByRole('button', { name: 'Flag this sentence' }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].type).toBe('simplify')
    expect(sent[0].mergeWith).toBeUndefined()
  })
})
