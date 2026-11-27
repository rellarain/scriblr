import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import { templateFrom } from '../../../lib/outlineTemplates'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { outlineNode, projectIndex, standInBackend } from '../../../test/workspaceBackend'
import { useWriterWorkspace } from './useWriterWorkspace'

// A new book or chapter from one of the writer's outline templates, through the workspace hook.

const OUTLINE = [
  outlineNode('b1', 'book', null, 'Book one'),
  outlineNode('a1', 'arc', 'b1', 'Crossing'),
  outlineNode('c1', 'chapter', 'a1', 'The Courier'),
  outlineNode('s1', 'scene', 'c1', ''),
  outlineNode('m1', 'moment', 's1', 'Lanterns'),
  outlineNode('c2', 'chapter', 'a1', 'Tolls', 1),
]
const BOOK_TEMPLATE = templateFrom(OUTLINE as OutlineNode[], 'b1', 'book', 'Three-arc', { titles: true, summaries: true }, 'tpl', 'now')
const CHAPTER_TEMPLATE = templateFrom(OUTLINE as OutlineNode[], 'c1', 'chapter', 'Cold open', { titles: false, summaries: false }, 'tpl2', 'now')

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

async function opened() {
  standInBackend({ p1: { index: projectIndex('p1', 'First'), outline: OUTLINE, plot: [] } })
  const hook = renderHook(() => useWriterWorkspace())
  await waitFor(() => expect(hook.result.current.projects).toHaveLength(1))
  await act(async () => { await hook.result.current.openProject('p1') })
  await waitFor(() => expect(hook.result.current.outlineStatus).toBe('idle'))
  const nodes = () => hook.result.current.outlineNodes
  const under = (parentId: string | null) => nodes().filter(n => n.parentId === parentId).sort((a, b) => a.order - b.order)
  return { ...hook, nodes, under }
}

describe('useWriterWorkspace: from an outline template', () => {
  it("makes a new book last at its level with the template's shape under it", async () => {
    const { result, nodes, under } = await opened()
    const before = nodes().length
    let id = ''
    act(() => { id = result.current.addFromTemplate(null, BOOK_TEMPLATE) })
    expect(under(null).map(n => n.id)).toEqual(['b1', id])
    const book = nodes().find(n => n.id === id) as OutlineNode
    expect(book).toMatchObject({ kind: 'book', title: '' })
    expect(nodes()).toHaveLength(before + 1 + BOOK_TEMPLATE.nodes.length)
    const [arc] = under(id)
    expect(arc).toMatchObject({ kind: 'arc', title: 'Crossing' })
    expect(under(arc.id).map(c => [c.kind, c.title, c.order])).toEqual([['chapter', 'The Courier', 0], ['chapter', 'Tolls', 1]])
    const scene = under(under(arc.id)[0].id)[0]
    expect(under(scene.id).map(m => [m.kind, m.title, m.draftRef])).toEqual([['moment', 'Lanterns', null]])
    // Every node is new: none of the template's book is touched.
    expect(nodes().filter(n => n.id === 'a1')).toHaveLength(1)
  })

  it('gives the new book, its arcs and its chapters colours of their own, as if added by hand', async () => {
    const { result, nodes, under } = await opened()
    let id = ''
    act(() => { id = result.current.addFromTemplate(null, BOOK_TEMPLATE) })
    const arc = under(id)[0]
    expect(typeof nodes().find(n => n.id === id)?.themeHue).toBe('number')
    expect(typeof arc.themeHue).toBe('number')
    expect(under(arc.id).every(c => typeof c.themeHue === 'number')).toBe(true)
  })

  it('makes a new chapter in a book with only the shape when the template kept no titles', async () => {
    const { result, under } = await opened()
    let id = ''
    act(() => { id = result.current.addFromTemplate('b1', CHAPTER_TEMPLATE) })
    expect(under('b1').map(n => n.id)).toEqual(['a1', id])
    const [scene] = under(id)
    expect(scene).toMatchObject({ kind: 'scene', location: '', action: '' })
    expect(under(scene.id).map(m => [m.kind, m.title])).toEqual([['moment', '']])
  })

  it('is one change, undone at once', async () => {
    const { result, nodes } = await opened()
    const before = nodes().map(n => n.id)
    act(() => { result.current.addFromTemplate(null, BOOK_TEMPLATE) })
    act(() => { result.current.history.undo('outline') })
    expect(nodes().map(n => n.id)).toEqual(before)
  })
})
