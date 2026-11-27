import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthorFootnote, ChapterAuthorNotes } from '../../../../api/bookPublishing'
import { getKv, setKv } from '../../../../settings/settingsStore'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { mockFetchBy } from '../../../../test/mockFetch'
import { outlineNode } from '../plotTestWorkspace'
import { useParagraphTools } from './useParagraphTools'

// The paragraph tools change the moments' text and take with each paragraph what is pinned to it: plotpoints (through the workspace),
// the chapter's footnotes (counted across the chapter) and the Preview's reactions (kept on this machine); a move to another chapter writes
// that chapter's moment first and moves the footnotes and reactions over.

const OUTLINE = [
  outlineNode('book', 'book', null),
  outlineNode('c1', 'chapter', 'book'), outlineNode('m1', 'moment', 'c1'), outlineNode('m2', 'moment', 'c1', { order: 1 }),
  outlineNode('c2', 'chapter', 'book', { order: 1 }), outlineNode('m3', 'moment', 'c2'),
]
const footnote = (id: string, paragraph: number, sentence = 0): AuthorFootnote => ({ id, paragraph, sentence, title: id, text: '', published: true })

let notes: Record<string, ChapterAuthorNotes>
let saved: Record<string, ChapterAuthorNotes>
let otherDraft: Record<string, string>
let calls: string[]

beforeEach(() => {
  notes = {}
  saved = {}
  otherDraft = { m3: 'Far bank.' }
  calls = []
  mockFetchBy((url, init) => {
    const method = init?.method ?? 'GET'
    const chapterNotes = url.match(/chapters\/(\w+)\/author-notes/)
    if (chapterNotes) {
      if (method === 'PUT') { saved[chapterNotes[1]] = JSON.parse(String(init?.body)); calls.push(`notes ${chapterNotes[1]}`); return saved[chapterNotes[1]] }
      return notes[chapterNotes[1]] ?? { footnotes: [], flags: [] }
    }
    if (url.includes('/draft/chapter/c2/moment/m3') && method === 'PUT') { otherDraft.m3 = JSON.parse(String(init?.body)).body; calls.push('put m3'); return {} }
    if (url.includes('/draft/chapter/c2')) return { chapterId: 'c2', moments: Object.fromEntries(Object.entries(otherDraft).map(([id, body]) => [id, { body, wordCount: 1, updatedAt: '2026-11-26T00:00:00Z' }])) }
    return {}
  })
})

function setup(bodies: Record<string, string>) {
  const follow = vi.fn()
  const w = makeWorkspace({ activeProjectId: 'p1', outlineNodes: OUTLINE, followPlotParagraphs: follow })
  const draft = { bodies: { ...bodies }, setBody: vi.fn((id: string, body: string) => { draft.bodies[id] = body; calls.push(`set ${id}`) }), flush: vi.fn(async () => {}) }
  const { result } = renderHook(() => useParagraphTools(w, 'c1', draft))
  return { result, draft, follow }
}

describe('the paragraph tools', () => {
  it('move a paragraph up, with its plotpoints, footnotes and reactions', async () => {
    notes.c1 = { footnotes: [footnote('a', 1, 1), footnote('b', 2)], flags: [] }
    setKv('scriblr.writer.marks.p1.c1', { 'm1:1:1': { like: 2, dislike: 0 }, 'm2:0:0': { like: 1, dislike: 0 } })
    const { result, draft, follow } = setup({ m1: 'One.\n\nTwo. Three.', m2: 'Four.' })
    let caret: number | null = null
    act(() => { caret = result.current.move('m1', 1, -1) })
    expect(caret).toBe(0)
    expect(draft.setBody).toHaveBeenCalledWith('m1', 'Two. Three.\n\nOne.')
    const moved = follow.mock.calls[0][0]
    expect(moved({ momentId: 'm1', paragraph: 1, sentence: 0 })).toEqual({ momentId: 'm1', paragraph: 0, sentence: 0 })
    await waitFor(() => expect(saved.c1).toBeTruthy())
    expect(saved.c1.footnotes.map(f => [f.id, f.paragraph, f.sentence])).toEqual([['a', 0, 1], ['b', 2, 0]])
    expect(getKv('scriblr.writer.marks.p1.c1')).toEqual({ 'm1:0:1': { like: 2, dislike: 0 }, 'm2:0:0': { like: 1, dislike: 0 } })
    expect(draft.flush).not.toHaveBeenCalled() // saved with the Save button or by autosave, as typed text is
  })

  it('split a paragraph at the caret and join two', async () => {
    const { result, draft } = setup({ m1: 'One. Two.\n\nThree.' })
    let caret: number | null = null
    act(() => { caret = result.current.split('m1', 5) })
    expect(draft.setBody).toHaveBeenLastCalledWith('m1', 'One.\n\nTwo.\n\nThree.')
    expect(caret).toBe(6)
    act(() => { caret = result.current.join('m1', 1) })
    expect(draft.setBody).toHaveBeenLastCalledWith('m1', 'One.\n\nTwo. Three.')
    expect(result.current.split('m1', 0)).toBeNull()
    await waitFor(() => expect(result.current.busy).toBe(false))
  })

  it('move a paragraph to another moment of the chapter', async () => {
    notes.c1 = { footnotes: [footnote('a', 0), footnote('b', 1)], flags: [] }
    const { result, draft } = setup({ m1: 'One.\n\nTwo.', m2: 'Four.' })
    await act(() => result.current.moveTo('m1', 0, 'c1', 'm2', 'end'))
    expect(draft.bodies).toEqual({ m1: 'Two.', m2: 'Four.\n\nOne.' })
    expect(saved.c1.footnotes.map(f => [f.id, f.paragraph])).toEqual([['a', 2], ['b', 0]])
  })

  it('move a paragraph to another chapter: that chapter first, then this one, the footnote and reaction going with it', async () => {
    notes.c1 = { footnotes: [footnote('a', 1), footnote('b', 0)], flags: [] }
    notes.c2 = { footnotes: [footnote('c', 0)], flags: [] }
    setKv('scriblr.writer.marks.p1.c1', { 'm1:1:0': { like: 3, dislike: 0 } })
    const { result, draft, follow } = setup({ m1: 'One.\n\nTwo.' })
    await act(() => result.current.moveTo('m1', 1, 'c2', 'm3', 'start'))
    expect(otherDraft.m3).toBe('Two.\n\nFar bank.')
    expect(draft.bodies.m1).toBe('One.')
    expect(calls.indexOf('put m3')).toBeLessThan(calls.indexOf('set m1'))
    expect(follow.mock.calls[0][0]({ momentId: 'm1', paragraph: 1, sentence: 0 })).toEqual({ momentId: 'm3', paragraph: 0, sentence: 0 })
    expect(saved.c1.footnotes.map(f => f.id)).toEqual(['b'])
    expect(saved.c2.footnotes.map(f => [f.id, f.paragraph])).toEqual([['c', 1], ['a', 0]])
    expect(getKv('scriblr.writer.marks.p1.c1')).toEqual({})
    expect(getKv('scriblr.writer.marks.p1.c2')).toEqual({ 'm3:0:0': { like: 3, dislike: 0 } })
    expect(result.current.error).toBeNull()
  })

  it('say so when a move to another chapter fails, and leave this chapter as it was', async () => {
    mockFetchBy(() => { throw new Error('offline') })
    const { result, draft } = setup({ m1: 'One.\n\nTwo.' })
    await act(() => result.current.moveTo('m1', 1, 'c2', 'm3', 'start'))
    expect(draft.setBody).not.toHaveBeenCalled()
    expect(result.current.error).toBeTruthy()
  })
})
