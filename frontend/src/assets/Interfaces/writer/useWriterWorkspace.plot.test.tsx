import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { outlineNode, plotNode, projectIndex, standInBackend } from '../../../test/workspaceBackend'
import { useWriterWorkspace } from './useWriterWorkspace'

// The plot's editing actions through the workspace hook: the tree of categories, plotlines and plotpoints, the fields and values on it,
// where plotpoints are placed in the outline, and what a deletion keeps.

const OUTLINE = [
  outlineNode('b1', 'book', null, 'Book'),
  outlineNode('c1', 'chapter', 'b1', 'Chapter'),
  outlineNode('m1', 'moment', 'c1', 'Moment'),
]
// A plot already in the current shape (its plotpoints sit in fields), so opening it changes nothing.
const PLOT = [
  plotNode('cat', 'category', null, 'Category'),
  plotNode('sub', 'subcategory', 'cat', 'Subcategory'),
  plotNode('line', 'plotline', 'sub', 'Plotline', { customFieldDefs: [{ id: 'f1', name: 'Beats' }] }),
  plotNode('line2', 'plotline', 'sub', 'Another', { order: 1 }),
  plotNode('free', 'plotpoint', 'line', 'Free point', { fieldId: 'f1' }),
  plotNode('placed', 'plotpoint', 'line', 'Placed point', { fieldId: 'f1', order: 1, assignedMomentId: 'm1', awareness: 'front' }),
]

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})
afterEach(() => { vi.useRealTimers() })

async function opened() {
  const backend = standInBackend({ p1: { index: projectIndex('p1', 'First'), outline: OUTLINE, plot: PLOT } })
  const hook = renderHook(() => useWriterWorkspace())
  await waitFor(() => expect(hook.result.current.projects).toHaveLength(1))
  await act(async () => { await hook.result.current.openProject('p1') })
  await waitFor(() => expect(hook.result.current.plotStatus).toBe('idle'))
  const get = (id: string) => hook.result.current.plotNodes.find(n => n.id === id)
  const childIds = (parentId: string | null) => (hook.result.current.plotChildrenByParentId.get(parentId) ?? []).map(n => n.id)
  return { ...hook, backend, get, childIds }
}

describe('useWriterWorkspace: opening a plot', () => {
  it('keeps a plot that is already in the current shape as it is, and indexes it', async () => {
    const { result, backend, childIds } = await opened()
    expect(result.current.plotNodes.map(n => n.id)).toEqual(PLOT.map(n => n.id))
    expect(backend.saved.plot).toHaveLength(0)
    expect(childIds('sub')).toEqual(['line', 'line2'])
    expect(result.current.plotNodeById.get('line')?.title).toBe('Plotline')
  })
})

describe('useWriterWorkspace: adding and changing plot nodes', () => {
  it('adds a node last under its parent and returns its id', async () => {
    const { result, childIds, get } = await opened()
    let id = ''
    act(() => { id = result.current.addPlotNode('cat', 'subcategory', 'Second') })
    expect(childIds('cat')).toEqual(['sub', id])
    expect(get(id)).toMatchObject({ kind: 'subcategory', parentId: 'cat', title: 'Second', body: '', keywords: [] })
  })

  it('puts a node right after a sibling when asked', async () => {
    const { result, childIds } = await opened()
    let id = ''
    act(() => { id = result.current.addPlotNode('sub', 'plotline', 'Middle', 'line') })
    expect(childIds('sub')).toEqual(['line', id, 'line2'])
  })

  it('edits a title and a description, and edits made in the same tick compose', async () => {
    const { result, get } = await opened()
    act(() => {
      result.current.updatePlotNodeField('line', 'title', 'Renamed')
      result.current.updatePlotNodeField('line', 'body', 'What happens.')
      result.current.updatePlotNodeField('line2', 'title', 'Other')
    })
    expect(get('line')).toMatchObject({ title: 'Renamed', body: 'What happens.' })
    expect(get('line2')?.title).toBe('Other')
  })

  it('keeps a keyword once, trimmed, and drops a blank one', async () => {
    const { result, get } = await opened()
    act(() => { result.current.addPlotKeyword('line', '  storm ') })
    act(() => { result.current.addPlotKeyword('line', 'storm') })
    act(() => { result.current.addPlotKeyword('line', '   ') })
    expect(get('line')?.keywords).toEqual(['storm'])
    act(() => { result.current.removePlotKeyword('line', 'storm') })
    expect(get('line')?.keywords).toEqual([])
  })

  it('sets a category\'s colour, and does not colour a plotline', async () => {
    const { result, get } = await opened()
    act(() => { result.current.setPlotHue('cat', 100.4) })
    expect(get('cat')?.hue).toBe(100)
    act(() => { result.current.setPlotHue('sub', 130) })
    expect(typeof get('sub')?.hue).toBe('number')
    const before = result.current.plotNodes
    act(() => { result.current.setPlotHue('line', 200) })
    expect(result.current.plotNodes).toBe(before)
  })
})

describe('useWriterWorkspace: choosing plotlines', () => {
  it('ticks and unticks one, or a group at once', async () => {
    const { result } = await opened()
    act(() => { result.current.togglePlotSelection('line') })
    expect(result.current.plotSelection).toEqual(['line'])
    act(() => { result.current.togglePlotSelection(['line', 'line2']) })
    expect(result.current.plotSelection.sort()).toEqual(['line', 'line2'])
    act(() => { result.current.togglePlotSelection(['line', 'line2']) })
    expect(result.current.plotSelection).toEqual([])
    act(() => { result.current.togglePlotSelection(['line', 'line2'], false) })
    expect(result.current.plotSelection).toEqual([])
    act(() => { result.current.togglePlotSelection(['line', 'line2'], true) })
    expect(result.current.plotSelection.sort()).toEqual(['line', 'line2'])
  })

  it('focuses a node and lets go of it', async () => {
    const { result } = await opened()
    act(() => { result.current.focusPlotNode('line') })
    expect(result.current.focusedPlotNode?.id).toBe('line')
    act(() => { result.current.focusPlotNode(null) })
    expect(result.current.focusedPlotNode).toBeUndefined()
  })

  it('forgets the focus and the selection when a project is closed', async () => {
    const { result } = await opened()
    act(() => { result.current.focusPlotNode('line'); result.current.togglePlotSelection('line') })
    act(() => { result.current.backToShelves() })
    expect(result.current.focusedPlotNodeId).toBeNull()
    expect(result.current.plotSelection).toEqual([])
    expect(result.current.plotNodes).toEqual([])
  })
})

describe('useWriterWorkspace: deleting from the plot', () => {
  it('deletes a plotpoint that is not placed, and refuses one that is', async () => {
    const { result, get } = await opened()
    act(() => { result.current.deletePlotNode('placed') })
    expect(get('placed')).toBeDefined()
    act(() => { result.current.deletePlotNode('free') })
    expect(get('free')).toBeUndefined()
  })

  it('refuses to delete a plotline that holds a placed plotpoint, until it is unassigned', async () => {
    const { result, get } = await opened()
    act(() => { result.current.deletePlotNode('line') })
    expect(get('line')).toBeDefined()
    act(() => { result.current.assignPlotpoint('placed', null) })
    act(() => { result.current.deletePlotNode('line') })
    expect(get('line')).toBeUndefined()
    expect(get('free')).toBeUndefined()
    expect(get('placed')).toBeUndefined()
  })

  it('moves the plotlines of a deleted subcategory into an "Unassigned" one, made once', async () => {
    const { result, get } = await opened()
    act(() => { result.current.deletePlotNode('sub') })
    expect(get('sub')).toBeUndefined()
    const bucket = result.current.plotNodes.find(n => n.kind === 'subcategory' && n.title === 'Unassigned')
    expect(bucket).toBeDefined()
    expect(get('line')?.parentId).toBe(bucket?.id)
    expect(get('line2')?.parentId).toBe(bucket?.id)
    expect(result.current.plotNodes.find(n => n.id === bucket?.parentId)).toMatchObject({ kind: 'category', title: 'Unassigned' })
    // Its plotpoints went with their plotline.
    expect(get('placed')?.parentId).toBe('line')

    act(() => { result.current.deletePlotNode('cat') })
    expect(result.current.plotNodes.filter(n => n.title === 'Unassigned')).toHaveLength(2)
  })

  it('lets go of the focus and the selection of what was deleted', async () => {
    const { result } = await opened()
    act(() => { result.current.focusPlotNode('line2'); result.current.togglePlotSelection(['line', 'line2']) })
    act(() => { result.current.deletePlotNode('line2') })
    expect(result.current.focusedPlotNodeId).toBeNull()
    expect(result.current.plotSelection).toEqual(['line'])
  })
})

describe('useWriterWorkspace: placing plotpoints in the outline', () => {
  it('assigns to a chapter, to a moment (front-stage), and back to nothing', async () => {
    const { result, get } = await opened()
    act(() => { result.current.assignPlotpoint('free', 'c1') })
    expect(get('free')).toMatchObject({ assignedMomentId: 'c1', awareness: null })
    act(() => { result.current.assignPlotpoint('free', 'm1') })
    expect(get('free')).toMatchObject({ assignedMomentId: 'm1', awareness: 'front' })
    act(() => { result.current.assignPlotpoint('free', null) })
    expect(get('free')).toMatchObject({ assignedMomentId: null, awareness: null })
  })

  it('refuses a book, and a node that is not in the outline', async () => {
    const { result } = await opened()
    const before = result.current.plotNodes
    act(() => { result.current.assignPlotpoint('free', 'b1') })
    act(() => { result.current.assignPlotpoint('free', 'nowhere') })
    expect(result.current.plotNodes).toBe(before)
  })

  it('steps a placed plotpoint through the four awareness states and round again', async () => {
    const { result, get } = await opened()
    const seen: Array<string | null | undefined> = []
    for (let i = 0; i < 4; i += 1) {
      act(() => { result.current.cyclePlotAwareness('placed') })
      seen.push(get('placed')?.awareness)
    }
    expect(seen).toEqual(['back', 'mid', 'off', 'front'])
  })

  it('leaves the awareness of a plotpoint that is not placed alone', async () => {
    const { result, get } = await opened()
    act(() => { result.current.cyclePlotAwareness('free') })
    expect(get('free')?.awareness ?? null).toBeNull()
  })

  it('points the Draft level at a plotpoint for a few seconds', async () => {
    const { result } = await opened()
    vi.useFakeTimers()
    act(() => { result.current.highlightPlotpoint('placed') })
    expect(result.current.highlightedPointId).toBe('placed')
    act(() => { vi.advanceTimersByTime(3900) })
    expect(result.current.highlightedPointId).toBe('placed')
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current.highlightedPointId).toBeNull()
  })

  it('does not clear a newer highlight when an older one runs out', async () => {
    const { result } = await opened()
    vi.useFakeTimers()
    act(() => { result.current.highlightPlotpoint('free') })
    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { result.current.highlightPlotpoint('placed') })
    act(() => { vi.advanceTimersByTime(2500) })
    expect(result.current.highlightedPointId).toBe('placed')
  })
})

describe('useWriterWorkspace: fields and values', () => {
  it('adds, renames and removes a field on a category', async () => {
    const { result, get } = await opened()
    let field: string | null = null
    act(() => { field = result.current.addPlotField('cat', 'Mood') })
    expect(field).toBeTruthy()
    expect(get('cat')?.customFieldDefs).toEqual([{ id: field, name: 'Mood' }])
    act(() => { result.current.renamePlotField('cat', field!, 'Feeling') })
    expect(get('cat')?.customFieldDefs[0].name).toBe('Feeling')
    act(() => { result.current.removePlotField('cat', field!) })
    expect(get('cat')?.customFieldDefs).toEqual([])
  })

  it('refuses a field on a plotpoint', async () => {
    const { result } = await opened()
    let field: string | null = 'unset'
    act(() => { field = result.current.addPlotField('free', 'Nope') })
    expect(field).toBeNull()
  })

  it('gives every plotline below a reference to a value defined on its category, and takes it back with the value', async () => {
    const { result, get } = await opened()
    let field: string | null = null
    let value: string | null = null
    act(() => { field = result.current.addPlotField('cat', 'Mood') })
    act(() => { value = result.current.addPlotValue('cat', field!) })
    expect(value).toBeTruthy()
    const referencesTo = (plotline: string) => result.current.plotNodes.filter(n => n.parentId === plotline && n.refId === value)
    expect(referencesTo('line')).toHaveLength(1)
    expect(referencesTo('line2')).toHaveLength(1)

    act(() => { result.current.updatePlotValue(value!, { title: 'Dread', body: 'Low and constant.' }) })
    expect(get(value!)).toMatchObject({ title: 'Dread', body: 'Low and constant.' })

    act(() => { result.current.removePlotValue(value!) })
    expect(get(value!)).toBeUndefined()
    expect(referencesTo('line')).toHaveLength(0)
    expect(referencesTo('line2')).toHaveLength(0)
  })

  it('moves a plotline\'s own value into another of its fields, unless it is placed', async () => {
    const { result, get } = await opened()
    let second: string | null = null
    act(() => { second = result.current.addPlotField('line', 'Twists') })
    act(() => { result.current.movePlotValue('free', second!) })
    expect(get('free')?.fieldId).toBe(second)
    act(() => { result.current.movePlotValue('placed', second!) })
    expect(get('placed')?.fieldId).toBe('f1')
  })
})

describe('useWriterWorkspace: saving the plot', () => {
  it('holds edits until Save, then sends the plot once, and the outline not at all', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.addPlotNode('cat', 'subcategory', 'Second') })
    act(() => { result.current.updatePlotNodeField('line', 'title', 'Renamed') })
    expect(backend.saved.plot).toHaveLength(0)

    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.plot).toHaveLength(1)
    expect(backend.saved.plot[0].find(n => n.id === 'line')?.title).toBe('Renamed')
    expect(backend.saved.plot[0].some(n => n.title === 'Second')).toBe(true)
    expect(backend.saved.outline).toHaveLength(0)
  })

  it('adopts the plot the backend answers with', async () => {
    const backend = standInBackend(
      { p1: { index: projectIndex('p1', 'First'), outline: OUTLINE, plot: PLOT } },
      (path, method, init) => {
        if (method === 'PUT' && path.endsWith('/plot')) {
          const body = JSON.parse(String(init?.body))
          return { ...body, nodes: body.nodes.map((n: { id: string; title: string }) => (n.id === 'line' ? { ...n, title: 'Set by the backend' } : n)) }
        }
        return undefined
      },
    )
    const { result } = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(result.current.projects).toHaveLength(1))
    await act(async () => { await result.current.openProject('p1') })
    act(() => { result.current.updatePlotNodeField('line2', 'title', 'Edited') })
    await act(async () => { await result.current.saveNow() })
    expect(backend.count('PUT /projects/p1/plot')).toBe(1)
    expect(result.current.plotNodes.find(n => n.id === 'line')?.title).toBe('Set by the backend')
    expect(result.current.plotNodes.find(n => n.id === 'line2')?.title).toBe('Edited')
  })
})
