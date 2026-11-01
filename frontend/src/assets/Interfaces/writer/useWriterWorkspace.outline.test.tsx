import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PlotNode } from '../../../api/types'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { hueDelta, wrapHue } from '../../../theme/bookColors'
import { outlineNode, placing, plotNode, projectIndex, standInBackend } from '../../../test/workspaceBackend'
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
  plotNode('point', 'plotpoint', 'line', 'A point', { placements: [placing('m1', 'front')] }),
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
  const targets = (point: PlotNode | undefined) => (point?.placements ?? []).map(p => [p.targetId, p.awareness])

  it('has the placement go back to the chapter when its moment is deleted', async () => {
    const { result, point } = await opened()
    expect(targets(point())).toEqual([['m1', 'front']])
    act(() => { result.current.deleteOutlineNode('m1') })
    expect(targets(point())).toEqual([['c1', null]])
  })

  it('has the placement go back to the chapter when the act around its moment is deleted', async () => {
    const { result, point } = await opened()
    act(() => { result.current.deleteOutlineNode('a1') })
    expect(targets(point())).toEqual([['c1', null]])
  })

  it('has the placement go when its whole chapter is deleted, and the plotpoint stays', async () => {
    const { result, point } = await opened()
    act(() => { result.current.deleteOutlineNode('c1') })
    expect(point()).toBeDefined()
    expect(targets(point())).toEqual([])
  })

  it('leaves the placements where they are when something else is deleted', async () => {
    const { result, point } = await opened()
    act(() => { result.current.deleteOutlineNode('c2') })
    expect(targets(point())).toEqual([['m1', 'front']])
  })
})

describe('useWriterWorkspace: a plotpoint placed in several places, one of them deleted', () => {
  async function openedTwice() {
    const placed = PLOT.map(n => (n.id === 'point' ? { ...n, placements: [placing('m1', 'back'), placing('c1'), placing('c2')] } : n))
    const backend = standInBackend({ p1: { index: projectIndex('p1', 'First'), outline: OUTLINE, plot: placed } })
    const hook = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(hook.result.current.projects).toHaveLength(1))
    await act(async () => { await hook.result.current.openProject('p1') })
    await waitFor(() => expect(hook.result.current.plotStatus).toBe('idle'))
    return { ...hook, backend, targets: () => (hook.result.current.plotNodes.find(n => n.id === 'point')?.placements ?? []).map(p => p.targetId) }
  }

  it('is placed on the chapter once when its moment goes and it is already there, and keeps its other places', async () => {
    const { result, targets } = await openedTwice()
    act(() => { result.current.deleteOutlineNode('m1') })
    expect(targets()).toEqual(['c1', 'c2'])
  })

  it('loses only the placements inside a deleted chapter', async () => {
    const { result, targets } = await openedTwice()
    act(() => { result.current.deleteOutlineNode('c1') })
    expect(targets()).toEqual(['c2'])
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
    expect(backend.saved.plot.at(-1)?.find(n => n.id === 'point')?.placements?.map(p => p.targetId)).toEqual(['c1'])
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
    expect(Math.abs(hueDelta(result.current.projectHue, get(chapter)?.themeHue as number))).toBeLessThanOrEqual(30) // b1 has no colour: it shows the project's
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

describe('useWriterWorkspace: the range and inherit of a colour', () => {
  it('records the range a node chose, held to its parent\'s, and lowers the ranges under a parent that is narrowed', async () => {
    const { result, get } = await opened()
    const project = result.current.projectHue
    act(() => { result.current.setNodeHueRange('c1', 120) })
    expect(get('c1')?.hueRange).toBe(90) // the book's own range is 90 until it chooses another
    act(() => { result.current.setNodeHueRange('b1', 180) })
    expect(get('b1')?.hueRange).toBe(180)
    act(() => { result.current.setNodeHueRange('c1', 120) })
    expect(get('c1')?.hueRange).toBe(120)
    act(() => { result.current.setNodeHue('c1', project + 110) })
    expect(get('c1')?.themeHue).toBe(wrapHue(project + 110))
    act(() => { result.current.setNodeHueRange('b1', 60) })
    expect(get('c1')?.hueRange).toBe(60)
    expect(get('c1')?.themeHue).toBe(wrapHue(project + 60))
    expect(result.current.levelRangeOf(get('c1')!)).toBe(60)
  })

  it('pulls a node\'s own hue into a narrower window of its parent, and never moves it for a wider one', async () => {
    const { result, get } = await opened()
    const project = result.current.projectHue
    act(() => { result.current.setNodeHueRange('b1', 120) })
    act(() => { result.current.setNodeHue('b1', project + 100) })
    expect(get('b1')?.themeHue).toBe(wrapHue(project + 100))
    act(() => { result.current.setNodeHueRange('b1', 60) })
    expect(get('b1')?.themeHue).toBe(wrapHue(project + 60))
    act(() => { result.current.setNodeHueRange('b1', 180) })
    expect(get('b1')?.themeHue).toBe(wrapHue(project + 60))
  })

  it('does not move a child of a node with a range of 180 or 360 when the parent changes', async () => {
    const { result, get } = await opened()
    const project = result.current.projectHue
    act(() => { result.current.setNodeHueRange('b1', 360) })
    act(() => { result.current.setNodeHueRange('c1', 180) })
    act(() => { result.current.setNodeHue('c1', project + 170) })
    act(() => { result.current.setNodeHue('b1', project + 60) })
    expect(get('c1')?.themeHue).toBe(wrapHue(project + 170))
  })

  it('turns Inherit on (no own colour, it follows the parent) and off (the hue it showed becomes its own)', async () => {
    const { result, get } = await opened()
    const project = result.current.projectHue
    act(() => { result.current.setNodeHue('c1', project + 20) })
    expect(result.current.hueSliderOf(get('c1')!).inherit).toBe(false)
    act(() => { result.current.setNodeInherit('c1', true) })
    expect(get('c1')?.themeHue).toBeNull()
    expect(result.current.hueSliderOf(get('c1')!)).toMatchObject({ inherit: true, hue: result.current.levelHueOf(get('b1')!) })
    act(() => { result.current.setNodeHue('b1', project + 40) })
    expect(result.current.levelHueOf(get('c1')!)).toBe(wrapHue(project + 40)) // it follows
    act(() => { result.current.setNodeInherit('c1', false) })
    expect(get('c1')?.themeHue).toBe(wrapHue(project + 40))
  })

  it('lets a book inherit the project\'s colour too, and clears an old hex colour so it does not come back', async () => {
    const { result, get } = await opened()
    act(() => { result.current.setNodeHue('b1', 10) })
    act(() => { result.current.setNodeInherit('b1', true) })
    expect(get('b1')?.themeHue).toBeNull()
    expect(get('b1')?.color).toBeNull()
    expect(result.current.levelHueOf(get('b1')!)).toBe(result.current.projectHue)
  })

  it('has no Inherit at a range of 360 (it keeps the hue it showed as its own), and refuses it', async () => {
    const { result, get } = await opened()
    act(() => { result.current.setNodeHueRange('b1', 360) })
    expect(get('b1')?.themeHue).toBe(result.current.projectHue)
    act(() => { result.current.setNodeInherit('b1', true) })
    expect(get('b1')?.themeHue).toBe(result.current.projectHue)
    expect(result.current.hueSliderOf(get('b1')!)).toMatchObject({ inherit: false, range: 360 })
  })

  it('offers a node the ranges up to its parent\'s', async () => {
    const { result, get } = await opened()
    act(() => { result.current.setNodeHueRange('b1', 120) })
    expect(result.current.hueSliderOf(get('c1')!).maxRange).toBe(120)
    expect(result.current.hueSliderOf(get('b1')!).maxRange).toBe(360)
  })
})

describe('useWriterWorkspace: the project\'s own range and inherit', () => {
  it('follows the app theme\'s hue while it inherits, and holds a hue it chooses within its range of that', async () => {
    const { result } = await opened()
    const app = result.current.appHue
    act(() => { result.current.setProjectHueRange(60) })
    expect(result.current.projectRange).toBe(60)
    expect(Math.abs(hueDelta(app, result.current.projectHue))).toBeLessThanOrEqual(60)
    act(() => { result.current.setProjectHue(app + 170) })
    expect(result.current.projectHue).toBe(wrapHue(app + 60))
    act(() => { result.current.setProjectInherit(true) })
    expect(result.current.activeProject?.settings.hueInherit).toBe(true)
    expect(result.current.projectHue).toBe(app)
    expect(result.current.projectHueSlider()).toMatchObject({ inherit: true, hue: app, centre: app, range: 60 })
    act(() => { result.current.setProjectInherit(false) })
    expect(result.current.activeProject?.settings.hueInherit).toBe(false)
    expect(result.current.activeProject?.settings.themeHue).toBe(app)
  })

  it('starts at 360, which has no Inherit; picking a colour turns it off', async () => {
    const { result } = await opened()
    act(() => { result.current.setProjectInherit(true) })
    expect(result.current.activeProject?.settings.hueInherit).toBeFalsy() // the project starts at 360: nothing to follow
    act(() => { result.current.setProjectHueRange(180) })
    act(() => { result.current.setProjectInherit(true) })
    expect(result.current.activeProject?.settings.hueInherit).toBe(true)
    act(() => { result.current.setProjectHue(result.current.appHue + 100) })
    expect(result.current.activeProject?.settings.hueInherit).toBe(false)
    act(() => { result.current.setProjectInherit(true) })
    expect(result.current.activeProject?.settings.hueInherit).toBe(true)
    act(() => { result.current.setProjectHueRange(360) })
    expect(result.current.activeProject?.settings.hueInherit).toBe(false) // 360 keeps the hue it showed as its own
    act(() => { result.current.setProjectInherit(true) })
    expect(result.current.activeProject?.settings.hueInherit).toBe(false) // and cannot inherit
  })

  it('holds the books under it to its range', async () => {
    const { result, get } = await opened()
    const app = result.current.appHue
    act(() => { result.current.setProjectHue(app) })
    act(() => { result.current.setNodeHueRange('b1', 90) })
    act(() => { result.current.setNodeHue('b1', app + 90) })
    act(() => { result.current.setProjectHueRange(30) })
    expect(get('b1')?.hueRange).toBe(30)
    expect(get('b1')?.themeHue).toBe(wrapHue(app + 30))
  })

  it('saves the range and the inherit flag with the project\'s settings', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.setProjectHueRange(90) })
    act(() => { result.current.setProjectInherit(true) })
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings.at(-1)).toMatchObject({ hueRange: 90, hueInherit: true })
  })
})

describe('useWriterWorkspace: a range is the range of every sibling', () => {
  it('sets the range of a chapter on the chapters beside it, and pulls their own hues into the new window', async () => {
    const { result, get } = await opened()
    const project = result.current.projectHue
    act(() => { result.current.setNodeHueRange('b1', 360) })
    act(() => { result.current.setNodeHueRange('c1', 120) })
    expect([get('c1')?.hueRange, get('c2')?.hueRange]).toEqual([120, 120])
    act(() => { result.current.setNodeHue('c1', project + 100) })
    act(() => { result.current.setNodeHue('c2', project - 100) })
    act(() => { result.current.setNodeHueRange('c2', 30) })
    expect([get('c1')?.hueRange, get('c2')?.hueRange]).toEqual([30, 30])
    expect(get('c1')?.themeHue).toBe(wrapHue(project + 30))
    expect(get('c2')?.themeHue).toBe(wrapHue(project - 30))
  })

  it('touches no node that is not a sibling: another kind, another parent', async () => {
    const outline = [
      outlineNode('b1', 'book', null, 'Book one'), outlineNode('b2', 'book', null, 'Book two', 1),
      outlineNode('a1', 'arc', 'b1', 'Arc'), outlineNode('c1', 'chapter', 'a1', 'In the arc'),
      outlineNode('c2', 'chapter', 'b1', 'Straight under the book', 1), outlineNode('c3', 'chapter', 'b2', 'Other book'),
    ]
    const backend = standInBackend({ p1: { index: projectIndex('p1', 'First'), outline, plot: [] } })
    const hook = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(hook.result.current.projects).toHaveLength(1))
    await act(async () => { await hook.result.current.openProject('p1') })
    await waitFor(() => expect(hook.result.current.outlineStatus).toBe('idle'))
    expect(backend).toBeTruthy()
    const get = (id: string) => hook.result.current.outlineNodes.find(n => n.id === id)
    act(() => { hook.result.current.setNodeHueRange('b2', 30) })
    expect([get('b1')?.hueRange, get('b2')?.hueRange]).toEqual([30, 30]) // the books of the project
    act(() => { hook.result.current.setNodeHueRange('a1', 30) })
    expect(get('a1')?.hueRange).toBe(30)
    expect(get('c1')?.hueRange).toBeUndefined() // under the arc: not its sibling
    expect(get('c2')?.hueRange).toBeUndefined() // under the book, a different kind of node from the arc
    act(() => { hook.result.current.setNodeHueRange('c2', 30) })
    expect(get('c3')?.hueRange).toBeUndefined() // another book's chapter
  })

  it('has every sibling inherit at 360 keep the hue it showed as its own', async () => {
    const { result, get } = await opened()
    act(() => { result.current.setNodeHueRange('b1', 360) })
    act(() => { result.current.setNodeHueRange('c1', 360) })
    expect([get('c1')?.themeHue, get('c2')?.themeHue]).toEqual([result.current.projectHue, result.current.projectHue])
  })
})
