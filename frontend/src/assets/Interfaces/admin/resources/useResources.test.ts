import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResourceNode, ResourcesFile } from '../../../../api/types'
import * as resourcesApi from '../../../../api/resourcesApi'
import { useResources } from './useResources'

afterEach(() => { vi.restoreAllMocks() })

function node(id: string, kind: ResourceNode['kind'], parentId: string | null, order: number, name: string): ResourceNode {
  return { id, kind, parentId, order, name }
}

function file(nodes: ResourceNode[], patch: Partial<ResourcesFile> = {}): ResourcesFile {
  return { schemaVersion: 1, nodes, content: {}, assessments: {}, ...patch }
}

describe('useResources', () => {
  it('loads the tree and exposes childrenOf/findNode/pathTo', async () => {
    const writer = node('writer', 'interface', null, 0, 'Writer')
    const shelf = node('writer/shelf', 'console', 'writer', 0, 'Shelf')
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(file([writer, shelf]))

    const { result } = renderHook(() => useResources())
    await waitFor(() => expect(result.current.status).toBe('idle'))

    expect(result.current.childrenOf(null)).toEqual([writer])
    expect(result.current.childrenOf('writer')).toEqual([shelf])
    expect(result.current.findNode('writer/shelf')?.name).toBe('Shelf')
    expect(result.current.pathTo('writer/shelf').map(n => n.name)).toEqual(['Writer', 'Shelf'])
  })

  it('reports an error status when the load fails', async () => {
    vi.spyOn(resourcesApi, 'getResources').mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useResources())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('boom')
  })

  it('addNode returns the id of the node the server actually added', async () => {
    const writer = node('writer', 'interface', null, 0, 'Writer')
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(file([writer]))
    const added = node('writer/abc123', 'console', 'writer', 0, '')
    vi.spyOn(resourcesApi, 'addResourceNode').mockResolvedValue(file([writer, added]))

    const { result } = renderHook(() => useResources())
    await waitFor(() => expect(result.current.status).toBe('idle'))

    let newId = ''
    await act(async () => { newId = await result.current.addNode('writer', 'console') })
    expect(newId).toBe('writer/abc123')
    expect(result.current.childrenOf('writer')).toEqual([added])
  })

  it('setGuide adopts the server response into contentOf', async () => {
    const feature = node('writer/shelf/plot/plotlines', 'feature', 'writer/shelf/plot', 0, 'Plotlines')
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(file([feature]))
    vi.spyOn(resourcesApi, 'putResourceGuide').mockResolvedValue(
      file([feature], { content: { [feature.id]: { guide: '# Hi', tutorials: [], faq: [] } } }),
    )

    const { result } = renderHook(() => useResources())
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.contentOf(feature.id)).toEqual({ guide: '', tutorials: [], faq: [] })

    await act(async () => { await result.current.setGuide(feature.id, '# Hi') })
    expect(result.current.contentOf(feature.id).guide).toBe('# Hi')
  })

  it('two rapid edits to the same node both survive, even if their saves resolve out of order', async () => {
    // Reproduces a real race: editing a question's prompt, then one of its
    // options, well within a network round-trip -- each mutator used to
    // compute its next value from the (stale) `file` state, so whichever
    // save resolved last would stomp the other edit. Firing both before
    // either's mocked save resolves is exactly that scenario.
    const feature = node('writer/shelf/plot/plotlines', 'feature', 'writer/shelf/plot', 0, 'Plotlines')
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(file([feature]))
    let resolveFirst!: (f: ResourcesFile) => void
    let resolveSecond!: (f: ResourcesFile) => void
    vi.spyOn(resourcesApi, 'putResourceGuide')
      .mockImplementationOnce(() => new Promise<ResourcesFile>(res => { resolveFirst = res }))
      .mockImplementationOnce(() => new Promise<ResourcesFile>(res => { resolveSecond = res }))

    const { result } = renderHook(() => useResources())
    await waitFor(() => expect(result.current.status).toBe('idle'))

    let firstCall!: Promise<void>
    let secondCall!: Promise<void>
    act(() => {
      firstCall = result.current.setGuide(feature.id, 'first edit')
      secondCall = result.current.setGuide(feature.id, 'first edit, second edit')
    })
    // The second (later) local edit should already be visible, even before either save resolves.
    expect(result.current.contentOf(feature.id).guide).toBe('first edit, second edit')

    // Resolve the SECOND save first (out of order) -- must not revert the newer local edit.
    await act(async () => { resolveSecond(file([feature], { [feature.id]: { guide: 'first edit, second edit', tutorials: [], faq: [] } })); await secondCall })
    expect(result.current.contentOf(feature.id).guide).toBe('first edit, second edit')
    await act(async () => { resolveFirst(file([feature], { [feature.id]: { guide: 'first edit', tutorials: [], faq: [] } })); await firstCall })
    expect(result.current.contentOf(feature.id).guide).toBe('first edit, second edit')
  })

  it('assessmentOf defaults to an empty question list for a node with none', async () => {
    const console_ = node('writer/shelf', 'console', null, 0, 'Shelf')
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(file([console_]))
    const { result } = renderHook(() => useResources())
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(result.current.assessmentOf(console_.id)).toEqual({ questions: [] })
  })
})
