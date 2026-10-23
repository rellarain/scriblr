import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { outlineNode, projectIndex, standInBackend } from '../../../test/workspaceBackend'
import { useWriterWorkspace } from './useWriterWorkspace'

// Moving through the Writer's levels: the project, a book, a chapter's outline and draft. What each step selects, which console it shows,
// and that leaving a page saves what was waiting on it.

const PROJECTS = {
  p1: {
    index: projectIndex('p1', 'First'),
    outline: [
      outlineNode('b1', 'book', null, 'Book one'),
      outlineNode('c1', 'chapter', 'b1', 'Chapter one'),
      outlineNode('c2', 'chapter', 'b1', 'Chapter two', 1),
      outlineNode('b2', 'book', null, 'Book two', 1),
      outlineNode('c3', 'chapter', 'b2', 'Chapter three'),
    ],
  },
}

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

async function opened(bookId?: string) {
  const backend = standInBackend(PROJECTS)
  const hook = renderHook(() => useWriterWorkspace())
  await waitFor(() => expect(hook.result.current.projects).toHaveLength(1))
  await act(async () => { await hook.result.current.openProject('p1', bookId) })
  await waitFor(() => expect(hook.result.current.outlineStatus).toBe('idle'))
  return { ...hook, backend }
}

describe('useWriterWorkspace: opening a project', () => {
  it('starts on the shelves, with no project open', async () => {
    standInBackend(PROJECTS)
    const { result } = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(result.current.projectsStatus).toBe('idle'))
    expect(result.current.hasOpenProject).toBe(false)
    expect(result.current.activeConsole).toBe('shelves')
  })

  it('opens at the project level, with no book or chapter chosen', async () => {
    const { result } = await opened()
    expect(result.current.activeProjectId).toBe('p1')
    expect(result.current.activeConsole).toBe('shelf')
    expect(result.current.activeBookId).toBeNull()
    expect(result.current.activeChapterId).toBeNull()
    expect(result.current.books.map(b => b.id)).toEqual(['b1', 'b2'])
  })

  it('opens straight into a book when asked, and ignores an id that is not a book', async () => {
    const direct = await opened('b2')
    expect(direct.result.current.activeConsole).toBe('book')
    expect(direct.result.current.activeBook?.id).toBe('b2')
    expect(direct.result.current.activeBookChapters.map(c => c.id)).toEqual(['c3'])

    const wrong = await opened('c1')
    expect(wrong.result.current.activeConsole).toBe('shelf')
    expect(wrong.result.current.activeBookId).toBeNull()
  })

  it('reports a project that cannot be read', async () => {
    standInBackend(PROJECTS, (path) => { if (path === '/projects/p1') throw new Error('corrupt') })
    const { result } = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(result.current.projects).toHaveLength(1))
    await act(async () => { await result.current.openProject('p1') })
    expect(result.current.outlineStatus).toBe('error')
    expect(result.current.outlineError).toBeTruthy()
    expect(result.current.hasOpenProject).toBe(false)
  })
})

describe('useWriterWorkspace: the levels', () => {
  it('goes down from the project to a book, a chapter\'s outline and its draft, and back', async () => {
    const { result } = await opened()

    act(() => { result.current.openBook('b1') })
    expect(result.current.activeConsole).toBe('book')
    expect(result.current.activeBookChapters.map(c => c.id)).toEqual(['c1', 'c2'])
    expect(result.current.activeChapterId).toBeNull()

    act(() => { result.current.openChapter('c2') })
    expect(result.current.activeConsole).toBe('page')
    expect(result.current.activeChapter?.id).toBe('c2')

    act(() => { result.current.showPreview() })
    expect(result.current.activeConsole).toBe('pages')
    act(() => { result.current.showDraft() })
    expect(result.current.activeConsole).toBe('page')

    act(() => { result.current.backToBook() })
    expect(result.current.activeConsole).toBe('book')
    expect(result.current.activeBookId).toBe('b1')
    expect(result.current.activeChapterId).toBeNull()

    act(() => { result.current.showProject() })
    expect(result.current.activeConsole).toBe('shelf')
  })

  it('selecting a chapter keeps the level and takes its book along', async () => {
    const { result } = await opened()
    act(() => { result.current.selectChapter('c3') })
    expect(result.current.activeConsole).toBe('shelf')
    expect(result.current.activeChapterId).toBe('c3')
    expect(result.current.activeBookId).toBe('b2')
  })

  it('shows the dashboard without closing the project', async () => {
    const { result } = await opened()
    act(() => { result.current.openChapter('c1') })
    act(() => { result.current.showDash() })
    expect(result.current.activeConsole).toBe('shelves')
    expect(result.current.hasOpenProject).toBe(true)
    expect(result.current.activeChapterId).toBe('c1')
  })

  it('has no draft or preview to show before a chapter is chosen', async () => {
    const { result } = await opened()
    act(() => { result.current.openBook('b1') })
    act(() => { result.current.showDraft() })
    expect(result.current.activeConsole).toBe('book')
    act(() => { result.current.showPreview() })
    expect(result.current.activeConsole).toBe('book')
  })

  it('closing the project forgets the book and chapter', async () => {
    const { result } = await opened()
    act(() => { result.current.openChapter('c1') })
    act(() => { result.current.backToShelves() })
    expect(result.current.hasOpenProject).toBe(false)
    expect(result.current.activeBookId).toBeNull()
    expect(result.current.activeChapterId).toBeNull()
    expect(result.current.outlineNodes).toEqual([])
  })
})

describe('useWriterWorkspace: a selection that no longer exists', () => {
  it('falls back to the book when the open chapter is deleted', async () => {
    const { result } = await opened()
    act(() => { result.current.openChapter('c1') })
    act(() => { result.current.deleteOutlineNode('c1') })
    await waitFor(() => expect(result.current.activeChapterId).toBeNull())
    expect(result.current.activeConsole).toBe('book')
    expect(result.current.activeBookId).toBe('b1')
  })

  it('falls back to the project when the open book is deleted', async () => {
    const { result } = await opened('b2')
    act(() => { result.current.deleteOutlineNode('b2') })
    await waitFor(() => expect(result.current.activeBookId).toBeNull())
    expect(result.current.activeConsole).toBe('shelf')
  })
})

describe('useWriterWorkspace: leaving a page saves it', () => {
  it('sends what was waiting when another level is opened', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.updateOutlineNode('b1', { title: 'Renamed' }) })
    // Autosave is off: the edit only waits.
    expect(backend.saved.outline).toHaveLength(0)
    act(() => { result.current.openBook('b1') })
    await waitFor(() => expect(backend.saved.outline).toHaveLength(1))
    expect(backend.saved.outline[0].find(n => n.id === 'b1')?.title).toBe('Renamed')
  })

  it('sends nothing when nothing changed', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.openBook('b1') })
    act(() => { result.current.openChapter('c1') })
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.outline).toHaveLength(0)
    expect(backend.saved.plot).toHaveLength(0)
  })
})
