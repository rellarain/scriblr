import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { wrapHue } from '../../../theme/bookColors'
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

describe('useWriterWorkspace: fieldsets', () => {
  it('makes, names, fills, orders and deletes a set; a deleted set leaves its fields loose', async () => {
    const { result, get } = await opened()
    let set: string | null = null
    let other: string | null = null
    let field: string | null = null
    act(() => { set = result.current.addPlotFieldset('line') })
    act(() => { other = result.current.addPlotFieldset('line', 'Second') })
    expect(get('line')?.customFieldSets).toEqual([{ id: set, name: '' }, { id: other, name: 'Second' }])
    act(() => { result.current.renamePlotFieldset('line', set!, 'First') })
    act(() => { field = result.current.addPlotField('line', 'Beat', undefined, set!) })
    expect(get('line')?.customFieldDefs).toEqual([{ id: 'f1', name: 'Beats' }, { id: field, name: 'Beat', setId: set }])

    act(() => { result.current.setPlotFieldSet('line', 'f1', other!) })
    expect(get('line')?.customFieldDefs.find(d => d.id === 'f1')?.setId).toBe(other)
    act(() => { result.current.movePlotFieldset('line', other!, set!) })
    expect(get('line')?.customFieldSets?.map(s => s.name)).toEqual(['Second', 'First'])

    act(() => { result.current.removePlotFieldset('line', set!) })
    expect(get('line')?.customFieldSets).toEqual([{ id: other, name: 'Second' }])
    expect(get('line')?.customFieldDefs.find(d => d.id === field)).toEqual({ id: field, name: 'Beat' })
  })

  it('refuses a set on a plotpoint, and a field put in a set the node does not have', async () => {
    const { result, get } = await opened()
    let set: string | null = 'unset'
    act(() => { set = result.current.addPlotFieldset('free') })
    expect(set).toBeNull()
    act(() => { result.current.setPlotFieldSet('line', 'f1', 'nope') })
    expect(get('line')?.customFieldDefs).toEqual([{ id: 'f1', name: 'Beats' }])
  })

  it('is undone as one step, and saved with the plot', async () => {
    const { result, get, backend } = await opened()
    act(() => { result.current.addPlotFieldset('cat', 'Setting') })
    expect(get('cat')?.customFieldSets).toHaveLength(1)
    act(() => { result.current.history.undo('plot') })
    expect(get('cat')?.customFieldSets ?? []).toHaveLength(0)
    act(() => { result.current.history.redo('plot') })
    expect(get('cat')?.customFieldSets).toHaveLength(1)
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.plot).toHaveLength(1)
    expect(backend.saved.plot[0].find(n => n.id === 'cat')?.customFieldSets).toEqual([{ id: expect.any(String), name: 'Setting' }])
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

describe('useWriterWorkspace: adding a plot preset', () => {
  const PRESET = {
    name: 'Characters', description: 'The cast', keywords: ['cast'], fields: ['Name', 'Role'],
    subcategories: [{
      id: 'x', name: 'Heroes', description: 'Those we follow', keywords: [], fields: ['Want'],
      clusters: [{ id: 'y', name: 'Core', description: '', keywords: [], fields: [] }],
    }],
  }

  it('adds the category with its subcategories and clusters, last, and returns the category\'s id', async () => {
    const { result, get, childIds } = await opened()
    let id = ''
    act(() => { id = result.current.addPlotPreset(PRESET) })
    expect(get(id)).toMatchObject({ kind: 'category', parentId: null, title: 'Characters', body: 'The cast', keywords: ['cast'], order: 1 })
    expect(get(id)?.customFieldDefs.map(f => f.name)).toEqual(['Name', 'Role'])
    const [sub] = childIds(id)
    expect(get(sub)).toMatchObject({ kind: 'subcategory', title: 'Heroes', body: 'Those we follow' })
    const [cluster] = childIds(sub)
    expect(get(cluster)).toMatchObject({ kind: 'cluster', title: 'Core' })
    expect(childIds(null)).toEqual(['cat', id])
    expect(result.current.plotNodes).toHaveLength(PLOT.length + 3)
  })

  it('is one step: a single Undo takes the whole preset back, and Redo brings it back', async () => {
    const { result } = await opened()
    act(() => { result.current.addPlotPreset(PRESET) })
    expect(result.current.history.canUndo('plot')).toBe(true)
    act(() => { result.current.history.undo('plot') })
    expect(result.current.plotNodes.map(n => n.id)).toEqual(PLOT.map(n => n.id))
    expect(result.current.history.canUndo('plot')).toBe(false)
    act(() => { result.current.history.redo('plot') })
    expect(result.current.plotNodes.filter(n => n.kind === 'category').map(n => n.title)).toEqual(['Category', 'Characters'])
    expect(result.current.plotNodes).toHaveLength(PLOT.length + 3)
  })

  it('is saved with the plot, and a preset added twice makes two separate categories', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.addPlotPreset(PRESET); result.current.addPlotPreset(PRESET) })
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.plot).toHaveLength(1)
    const saved = backend.saved.plot[0]
    expect(saved.filter(n => n.title === 'Characters')).toHaveLength(2)
    expect(new Set(saved.map(n => n.id)).size).toBe(saved.length)
  })
})

describe('useWriterWorkspace: plot colour ranges', () => {
  it('starts a new category at the project\'s hue, and a subcategory or cluster with none (it shows its parent\'s)', async () => {
    const { result, get } = await opened()
    let category = ''
    let subcategory = ''
    let cluster = ''
    act(() => { category = result.current.addPlotNode(null, 'category') })
    act(() => { subcategory = result.current.addPlotNode(category, 'subcategory') })
    act(() => { cluster = result.current.addPlotNode(subcategory, 'cluster') })
    expect(get(category)?.hue).toBe(result.current.projectHue)
    expect(get(subcategory)?.hue).toBeUndefined()
    expect(get(cluster)?.hue).toBeUndefined()
  })

  it('holds a category within 90 degrees of the project, a subcategory within 60 of its category and a cluster within 30 of its subcategory', async () => {
    const { result, get } = await opened()
    const project = result.current.projectHue
    let cluster = ''
    act(() => { cluster = result.current.addPlotNode('sub', 'cluster') })
    act(() => { result.current.setPlotHue('cat', project + 180) })
    expect(get('cat')?.hue).toBe(wrapHue(project + 90))
    act(() => { result.current.setPlotHue('sub', project + 90 + 100, project + 90) })
    expect(get('sub')?.hue).toBe(wrapHue(project + 90 + 60))
    act(() => { result.current.setPlotHue(cluster, project + 90 + 60 + 100, project + 90 + 60) })
    expect(get(cluster)?.hue).toBe(wrapHue(project + 90 + 60 + 30))
  })

  it('pulls the subcategories and clusters under a category back inside their ranges when it moves, and nothing outside it', async () => {
    const { result, get } = await opened()
    const project = result.current.projectHue
    let cluster = ''
    let other = ''
    act(() => { cluster = result.current.addPlotNode('sub', 'cluster') })
    act(() => { other = result.current.addPlotNode(null, 'category') })
    act(() => { result.current.setPlotHue('cat', project) })
    act(() => { result.current.setPlotHue('sub', project + 60, project) })
    act(() => { result.current.setPlotHue(cluster, project + 90, project + 60) })
    expect([get('sub')?.hue, get(cluster)?.hue]).toEqual([wrapHue(project + 60), wrapHue(project + 90)])
    // The category moves 90 degrees back: its subcategory (150 away now) comes to within 60, then its cluster to within 30 of that.
    act(() => { result.current.setPlotHue('cat', project - 90) })
    expect(get('cat')?.hue).toBe(wrapHue(project - 90))
    expect(get('sub')?.hue).toBe(wrapHue(project - 30))
    expect(get(cluster)?.hue).toBe(wrapHue(project))
    expect(get(other)?.hue).toBe(project)
  })

  it("stores the parent's shown hue on it when the parent had none of its own and a child is coloured", async () => {
    const { result, get } = await opened()
    act(() => { result.current.setPlotHue('sub', 130, 120) })
    expect(get('cat')?.hue).toBe(120)
    expect(get('sub')?.hue).toBe(130)
  })
})
