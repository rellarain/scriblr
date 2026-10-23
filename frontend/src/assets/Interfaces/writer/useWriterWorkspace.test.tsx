import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { mockFetchBy } from '../../../test/mockFetch'
import { outlineNode, projectIndex, standInBackend } from '../../../test/workspaceBackend'
import { useWriterWorkspace } from './useWriterWorkspace'

// The workspace hook against a stand-in backend: what it asks for and what it keeps, which the components built on it rely on.
// (Navigation, the outline, the plot and Undo have files of their own: useWriterWorkspace.*.test.tsx.)

const PROJECTS = {
  p1: { index: projectIndex('p1', 'First'), outline: [outlineNode('b1', 'book', null, 'Book one'), outlineNode('c1', 'chapter', 'b1', 'Chapter one')] },
  p2: { index: projectIndex('p2', 'Second'), outline: [outlineNode('b2', 'book', null, 'Book two')] },
}

const backend = () => standInBackend(PROJECTS)

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

describe('useWriterWorkspace: the project list', () => {
  it('loads every project, its outline and its progress with one request', async () => {
    const { calls } = backend()
    const { result } = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(result.current.projects).toHaveLength(2))
    expect(result.current.projects.map(p => p.title)).toEqual(['First', 'Second'])
    expect(result.current.projectOutlines.p1.map(n => n.id)).toEqual(['b1', 'c1'])
    expect(result.current.projectOutlines.p2.map(n => n.id)).toEqual(['b2'])
    expect(calls.filter(c => c.startsWith('GET /projects'))).toEqual(['GET /projects/overview'])
  })

  it('reports a failed load', async () => {
    mockFetchBy(() => { throw new Error('offline') })
    const { result } = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(result.current.projectsStatus).toBe('error'))
    expect(result.current.projectsError).toBeTruthy()
  })
})

describe('useWriterWorkspace: the open project\'s outline in the shelves', () => {
  async function opened() {
    const calls = backend().calls
    const hook = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(hook.result.current.projects).toHaveLength(2))
    await act(async () => { await hook.result.current.openProject('p1') })
    await waitFor(() => expect(hook.result.current.outlineStatus).toBe('idle'))
    return { ...hook, calls }
  }

  it('follows an edit at once, in the same render', async () => {
    const { result } = await opened()
    act(() => { result.current.updateOutlineNode('b1', { title: 'Renamed' }) })
    expect(result.current.outlineNodes.find(n => n.id === 'b1')?.title).toBe('Renamed')
    expect(result.current.projectOutlines.p1.find(n => n.id === 'b1')?.title).toBe('Renamed')
    expect(result.current.projectOutlines.p2.map(n => n.title)).toEqual(['Book two'])
  })

  it('keeps the last copy for the shelves when the project is closed', async () => {
    const { result } = await opened()
    act(() => { result.current.updateOutlineNode('b1', { title: 'Renamed' }) })
    act(() => { result.current.backToShelves() })
    expect(result.current.hasOpenProject).toBe(false)
    expect(result.current.projectOutlines.p1.find(n => n.id === 'b1')?.title).toBe('Renamed')
  })

  it('keeps the last copy when another project is opened instead', async () => {
    const { result } = await opened()
    act(() => { result.current.updateOutlineNode('b1', { title: 'Renamed' }) })
    await act(async () => { await result.current.openProject('p2') })
    await waitFor(() => expect(result.current.activeProjectId).toBe('p2'))
    expect(result.current.projectOutlines.p1.find(n => n.id === 'b1')?.title).toBe('Renamed')
    expect(result.current.projectOutlines.p2.map(n => n.id)).toEqual(['b2'])
  })

  it('drops a deleted project from the shelves', async () => {
    const { result } = await opened()
    await act(async () => { await result.current.deleteProject('p2') })
    expect(result.current.projects.map(p => p.projectId)).toEqual(['p1'])
    expect(result.current.projectOutlines.p2).toBeUndefined()
  })
})

describe('useWriterWorkspace: the history behind Undo', () => {
  it('fetches the outline\'s history again after an outline save, and not the plot\'s or the settings\'', async () => {
    const { calls } = backend()
    const { result } = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(result.current.projects).toHaveLength(2))
    await act(async () => { await result.current.openProject('p1') })
    await waitFor(() => expect(calls.filter(c => c.endsWith('/outline/history'))).toHaveLength(1))
    expect(calls.filter(c => c.endsWith('/plot/history'))).toHaveLength(1)
    expect(calls.filter(c => c.endsWith('/settings-log'))).toHaveLength(1)

    act(() => { result.current.updateOutlineNode('b1', { title: 'Renamed' }) })
    await act(async () => { await result.current.saveNow() })
    await waitFor(() => expect(calls.filter(c => c.endsWith('/outline/history'))).toHaveLength(2))
    expect(calls.filter(c => c.endsWith('/plot/history'))).toHaveLength(1)
    expect(calls.filter(c => c.endsWith('/settings-log'))).toHaveLength(1)
  })
})
