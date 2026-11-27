import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { outlineNode } from '../plotTestWorkspace'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { mockFetchBy } from '../../../../test/mockFetch'
import type { useChapterDraft } from '../useChapterDraft'
import type { usePublications } from '../usePublications'
import { PreviewPane } from './PreviewPane'

// The Preview's Export tool is given the project, the chapter's book (its place among the books) and the chapter (its place in the book).

const book1 = outlineNode('b1', 'book', null, { title: 'Salt & Ledger' })
const book2 = outlineNode('b2', 'book', null, { title: 'The Lantern Road', order: 1 })
const first = outlineNode('c1', 'chapter', 'b2', { title: 'Dawn' })
const chapter = outlineNode('c2', 'chapter', 'b2', { title: '', order: 1 })
const OUTLINE = [book1, book2, first, chapter, outlineNode('m1', 'moment', 'c2')]

const draft = { bodies: { m1: 'She had coins.' }, status: 'idle', error: undefined } as unknown as ReturnType<typeof useChapterDraft>
const pubs = { publications: [], publishing: false, error: undefined, publish: async () => {} } as unknown as ReturnType<typeof usePublications>

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  mockFetchBy(url => (url.includes('/revision-flags') ? [] : { footnotes: [], flags: [] }))
})

describe('the Preview: the Export tool', () => {
  it("opens on the Export tool with the project's books, this book and this chapter", () => {
    const w = makeWorkspace({
      activeProjectId: 'p1', activeProject: { title: 'Harbour Lights' }, outlineNodes: OUTLINE,
      books: [book1, book2], activeBook: book2, activeBookChapters: [first, chapter],
    })
    render(<PreviewPane w={w} chapter={chapter} draft={draft} pubs={pubs} component="export" onComponent={() => {}} />)
    expect(screen.getByRole('button', { name: /The project.*Harbour Lights · 2 books/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /This book.*Book 2 · The Lantern Road · 2 chapters/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /This chapter.*Chapter 2 · Untitled chapter/ })).toBeTruthy()
    expect(screen.getByText('the-lantern-road.pdf')).toBeTruthy()
    // The old inline buttons are gone.
    expect(screen.queryByRole('button', { name: 'DOC' })).toBeNull()
  })
})
