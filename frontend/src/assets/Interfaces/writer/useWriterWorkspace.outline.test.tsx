import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { hueDelta, wrapHue } from '../../../theme/bookColors'
import { outlineNode, plotNode, projectIndex, standInBackend } from '../../../test/workspaceBackend'
import { useWriterWorkspace } from './useWriterWorkspace'

// The outline's editing actions through the workspace hook: what each one does to the tree, what it does to the plot that points into it,
// and when it is sent to the backend.

const OUTLINE = [
  outlineNode('s1', 'series', null, 'Series'),
  outlineNode('b1', 'book', 's1', 'Book one'),
  outlineNode('c1', 'chapter', 'b1', 'Chapter one'),
  outlineNode('c2', 'chapter', 'b1', 'Chapter two', 1),
  outlineNode('a1', 'act', 'c1', 'Act'),
  outlineNode('m1', 'moment', 'a1', 'Moment'),
]
const PLOT = [
  plotNode('cat', 'category', null),
  plotNode('line', 'plotline', 'cat'),
  plotNode('point', 'plotpoint', 'line', 'A point', { assignedMomentId: 'm1', awareness: 'front' }),
]

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

async function opened() {
  const backend = standInBackend({ p1: { index: projectIndex('p1', 'First'), outline: OUTLINE, plot: PLOT } })
  const hook = renderHook(() => useWriterWorkspace())
  await waitFor(() => expect(hook.result.current.projects).toHaveLength(1))
  await act(async () => { await hook.result.current.openProject('p1') })
  await waitFor(() => expect(hook.result.current.outlineStatus).toBe('idle'))
  const ids = () => hook.result.current.outlineNodes.map(n => n.id)
  const childIds = (parentId: string | null) => (hook.result.current.childrenByParentId.get(parentId) ?? []).map(n => n.id)
  const get = (id: string) => hook.result.current.outlineNodes.find(n => n.id === id)
  const point = () => hook.result.current.plotNodes.find(n => n.id === 'point')
  return { ...hook, backend, ids, childIds, get, point }
}

describe('useWriterWorkspace: adding to the outline', () => {
  it('adds a node last under its parent, nameless, and returns its id', async () => {
    const { result, childIds, get } = await opened()
    let id = ''
    act(() => { id = result.current.addOutlineNode('c2', 'act') })
    expect(childIds('c2')).toEqual([id])
    expect(get(id)).toMatchObject({ kind: 'act', parentId: 'c2', title: '', draftRef: null })
  })

  it('puts a node right after a sibling when asked', async () => {
    const { result, childIds } = await opened()
    let id = ''
    act(() => { id = result.current.addOutlineNode('b1', 'chapter', {}, 'c1') })
    expect(childIds('b1')).toEqual(['c1', id, 'c2'])
  })

  it('gives a new chapter a colour of its own, and a moment none', async () => {
    const { result, get } = await opened()
    let chapter = ''
    let moment = ''
    act(() => { chapter = result.current.addOutlineNode('b1', 'chapter') })
    act(() => { moment = result.current.addOutlineNode('a1', 'moment') })
    expect(typeof get(chapter)?.themeHue).toBe('number')
    expect(get(moment)?.themeHue).toBeUndefined()
  })

  it('takes the fields it is given', async () => {
    const { result, get } = await opened()
    let id = ''
    act(() => { id = result.current.addOutlineNode('a1', 'moment', { title: 'Opening', freeDraft: true }) })
    expect(get(id)).toMatchObject({ title: 'Opening', freeDraft: true })
  })
})

describe('useWriterWorkspace: changing the outline', () => {
  it('edits a node, and edits made in the same tick compose', async () => {
    const { result, get } = await opened()
    act(() => {
      result.current.updateOutlineNode('c1', { title: 'One' })
      result.current.updateOutlineNode('c1', { synopsis: 'It begins.' })
      result.current.updateOutlineNode('c2', { title: 'Two' })
    })
    expect(get('c1')).toMatchObject({ title: 'One', synopsis: 'It begins.' })
    expect(get('c2')?.title).toBe('Two')
  })

  it('deletes a node with everything inside it', async () => {
    const { result, ids } = await opened()
    act(() => { result.current.deleteOutlineNode('c1') })
    expect(ids()).toEqual(['s1', 'b1', 'c2'])
  })

  it('moves a node before a sibling, and to another parent', async () => {
    const { result, childIds, get } = await opened()
    act(() => { result.current.moveOutlineNodeInto('c2', 'b1', 'c1') })
    expect(childIds('b1')).toEqual(['c2', 'c1'])
    act(() => { result.current.moveOutlineNodeInto('a1', 'c2', null) })
    expect(get('a1')?.parentId).toBe('c2')
    expect(childIds('c1')).toEqual([])
  })

  it('refuses a move that would break the tree', async () => {
    const { result, ids, get } = await opened()
    const before = result.current.outlineNodes
    act(() => { result.current.moveOutlineNodeInto('b1', 'c1', null) }) // a book into its own chapter
    act(() => { result.current.moveOutlineNodeInto('m1', null, null) }) // a moment to the top level
    expect(result.current.outlineNodes).toBe(before)
    expect(ids()).toHaveLength(OUTLINE.length)
    expect(get('b1')?.parentId).toBe('s1')
  })

  it('turns a free draft into an ordinary moment when it is dropped among the outline', async () => {
    const { result, get } = await opened()
    act(() => { result.current.updateOutlineNode('m1', { freeDraft: true }) })
    act(() => { result.current.moveOutlineNodeInto('m1', 'a1', null) })
    expect(get('m1')?.freeDraft).toBe(false)
  })

  it('takes a series away and keeps its books where it was', async () => {
    const { result, childIds, get } = await opened()
    act(() => { result.current.deleteSeries('s1') })
    expect(get('s1')).toBeUndefined()
    expect(get('b1')?.parentId).toBeNull()
    expect(childIds(null)).toEqual(['b1'])
  })

  it('flags a node and clears the flag when the same one is chosen again', async () => {
    const { result, get } = await opened()
    act(() => { result.current.toggleNodeFlag('c1', 'review') })
    expect(get('c1')?.flag).toEqual({ type: 'review', note: '' })
    act(() => { result.current.toggleNodeFlag('c1', 'edit') })
    expect(get('c1')?.flag?.type).toBe('edit')
    act(() => { result.current.toggleNodeFlag('c1', 'edit') })
    expect(get('c1')?.flag).toBeNull()
  })
})

describe('useWriterWorkspace: colour', () => {
  it('sets a chapter\'s colour, and leaves a moment without one', async () => {
    const { result, get } = await opened()
    act(() => { result.current.setNodeHue('c1', 200.4) })
    expect(typeof get('c1')?.themeHue).toBe('number')
    const before = result.current.outlineNodes
    act(() => { result.current.setNodeHue('m1', 200) })
    expect(result.current.outlineNodes).toBe(before)
  })

  it('sets the project\'s colour, sends it with the other settings, and keeps what it holds inside its window', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.setProjectHue(120.4) })
    expect(result.current.projectHue).toBe(120)
    expect(result.current.activeProject?.settings.themeHue).toBe(120)
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings.at(-1)).toMatchObject({ themeHue: 120 })
  })
})

describe('useWriterWorkspace: a plotpoint placed in what is deleted', () => {
  it('goes back to the chapter when its moment is deleted', async () => {
    const { result, point } = await opened()
    expect(point()?.assignedMomentId).toBe('m1')
    act(() => { result.current.deleteOutlineNode('m1') })
    expect(point()).toMatchObject({ assignedMomentId: 'c1', assignedParagraphIndex: null, awareness: null })
  })

  it('goes back to the chapter when the act around its moment is deleted', async () => {
    const { result, point } = await opened()
    act(() => { result.current.deleteOutlineNode('a1') })
    expect(point()?.assignedMomentId).toBe('c1')
  })

  it('is unassigned when its whole chapter is deleted', async () => {
    const { result, point } = await opened()
    act(() => { result.current.deleteOutlineNode('c1') })
    expect(point()).toMatchObject({ assignedMomentId: null, awareness: null })
  })

  it('stays where it is when something else is deleted', async () => {
    const { result, point } = await opened()
    act(() => { result.current.deleteOutlineNode('c2') })
    expect(point()?.assignedMomentId).toBe('m1')
  })
})

describe('useWriterWorkspace: saving the outline', () => {
  it('holds edits until Save, then sends them in one request, structural and text edits together', async () => {
    const { result, backend, ids } = await opened()
    let id = ''
    act(() => { id = result.current.addOutlineNode('b1', 'chapter') })
    act(() => { result.current.updateOutlineNode(id, { title: 'New chapter' }) })
    expect(backend.saved.outline).toHaveLength(0)
    expect(result.current.saveStatus.state).not.toBe('saved')

    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.outline).toHaveLength(1)
    expect(backend.saved.outline[0].find(n => n.id === id)?.title).toBe('New chapter')
    expect(backend.saved.outline[0].map(n => n.id)).toEqual(ids())
    expect(result.current.saveStatus.state).toBe('saved')
  })

  it('brings a plot saved in an older shape up to date, and saves it on opening', async () => {
    const { backend, point, result } = await opened()
    // The plotpoint had no field: it now sits in a field of its plotline.
    expect(point()?.fieldId).toBeTruthy()
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.plot).toHaveLength(1)
    expect(backend.saved.plot[0].find(n => n.id === 'point')?.fieldId).toBeTruthy()
  })

  it('sends the plot too when a deletion changed it, and not otherwise', async () => {
    const { result, backend } = await opened()
    await act(async () => { await result.current.saveNow() }) // the plot's update to the current shape is saved on opening
    const plotSaves = backend.saved.plot.length

    act(() => { result.current.updateOutlineNode('c2', { title: 'Two' }) })
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.outline).toHaveLength(1)
    expect(backend.saved.plot).toHaveLength(plotSaves)

    act(() => { result.current.deleteOutlineNode('m1') })
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.outline).toHaveLength(2)
    expect(backend.saved.plot).toHaveLength(plotSaves + 1)
    expect(backend.saved.plot.at(-1)?.find(n => n.id === 'point')?.assignedMomentId).toBe('c1')
  })

  it('reports a failed save and keeps the edit for the next try', async () => {
    let failing = true
    const backend = standInBackend({ p1: { index: projectIndex('p1', 'First'), outline: OUTLINE, plot: PLOT } }, (path, method) => {
      if (failing && method === 'PUT' && path.endsWith('/outline')) throw new Error('disk full')
    })
    const { result } = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(result.current.projects).toHaveLength(1))
    await act(async () => { await result.current.openProject('p1') })
    act(() => { result.current.updateOutlineNode('c1', { title: 'Changed' }) })
    await act(async () => { await result.current.saveNow() })
    expect(result.current.saveError).toBeTruthy()
    expect(result.current.saveStatus.state).toBe('error')

    failing = false
    await act(async () => { await result.current.saveNow() })
    expect(result.current.saveError).toBeUndefined()
    expect(backend.saved.outline.at(-1)?.find(n => n.id === 'c1')?.title).toBe('Changed')
  })
})

describe('useWriterWorkspace: colour ranges', () => {
  it('starts a new book at the project\'s hue, a new chapter inside 30 of its book\'s, and gives a series none', async () => {
    const { result, get } = await opened()
    let book = ''
    let chapter = ''
    let series = ''
    act(() => { book = result.current.addOutlineNode(null, 'book') })
    act(() => { chapter = result.current.addOutlineNode('b1', 'chapter') })
    act(() => { series = result.current.addOutlineNode(null, 'series') })
    expect(get(book)?.themeHue).toBe(result.current.projectHue)
    expect(Math.abs(hueDelta(28, get(chapter)?.themeHue as number))).toBeLessThanOrEqual(30) // the book default, 28, as b1 has no colour
    expect(get(series)?.themeHue).toBeUndefined()
  })

  it('holds a book within 90 degrees of the project, and a chapter within 30 of its book', async () => {
    const { result, get } = await opened()
    const project = result.current.projectHue
    act(() => { result.current.setNodeHue('b1', project + 180) })
    expect(get('b1')?.themeHue).toBe(wrapHue(project + 90))
    act(() => { result.current.setNodeHue('b1', project + 40) })
    expect(get('b1')?.themeHue).toBe(wrapHue(project + 40))
    act(() => { result.current.setNodeHue('c1', project + 40 + 100) })
    expect(get('c1')?.themeHue).toBe(wrapHue(project + 40 + 30))
  })

  it('does not accept a colour for a series', async () => {
    const { result } = await opened()
    const before = result.current.outlineNodes
    act(() => { result.current.setNodeHue('s1', 200) })
    expect(result.current.outlineNodes).toBe(before)
  })

  it('moves only what is under the node it changes: a colour already outside its range elsewhere stays until its parent changes', async () => {
    const { result, get } = await opened()
    act(() => { result.current.updateOutlineNode('c2', { themeHue: 200 }) }) // far from its book's colour
    act(() => { result.current.setNodeHue('c1', 40) })
    expect(get('c2')?.themeHue).toBe(200)
    act(() => { result.current.setNodeHue('b1', 50) }) // now its parent changes: c2 is pulled within 30 of it
    expect(get('c2')?.themeHue).toBe(80)
  })

  it('clears a series colour saved by an older version the next time the outline is saved', async () => {
    const withColour = OUTLINE.map(n => (n.id === 's1' ? { ...n, themeHue: 300 } : n))
    const backend = standInBackend({ p1: { index: projectIndex('p1', 'First'), outline: withColour, plot: PLOT } })
    const hook = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(hook.result.current.projects).toHaveLength(1))
    await act(async () => { await hook.result.current.openProject('p1') })
    await waitFor(() => expect(hook.result.current.outlineStatus).toBe('idle'))
    expect(hook.result.current.outlineNodes.find(n => n.id === 's1')?.themeHue).toBe(300) // loading changes nothing
    act(() => { hook.result.current.updateOutlineNode('c2', { title: 'Two' }) })
    await act(async () => { await hook.result.current.saveNow() })
    expect(backend.saved.outline.at(-1)?.find(n => n.id === 's1')?.themeHue).toBeNull()
    expect(hook.result.current.levelHueOf(hook.result.current.outlineNodes.find(n => n.id === 's1')!)).toBe(hook.result.current.projectHue)
  })
})
