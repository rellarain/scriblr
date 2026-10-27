import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TimeSystem } from '../../../api/types'
import { __resetSettingsForTests } from '../../../settings/settingsStore'
import { outlineNode, plotNode, projectIndex, standInBackend } from '../../../test/workspaceBackend'
import { PROJECT_NAME_MAX, useWriterWorkspace } from './useWriterWorkspace'

// Undo and Redo through the workspace hook: one history for each of the outline, the plot and the project's settings, kept in memory
// while a page is open, and continued into what the backend logged today when that is used up.

const OUTLINE = [
  outlineNode('b1', 'book', null, 'Book'),
  outlineNode('c1', 'chapter', 'b1', 'Chapter one'),
  outlineNode('c2', 'chapter', 'b1', 'Chapter two', 1),
]
const PLOT = [plotNode('cat', 'category', null, 'Category'), plotNode('line', 'plotline', 'cat', 'Plotline')]
const MOON: TimeSystem = { id: 't1', name: 'Moon', units: [] }

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})

type Answer = Parameters<typeof standInBackend>[1]

async function opened(answer?: Answer) {
  const backend = standInBackend({ p1: { index: projectIndex('p1', 'First'), outline: OUTLINE, plot: PLOT } }, answer)
  const hook = renderHook(() => useWriterWorkspace())
  await waitFor(() => expect(hook.result.current.projects).toHaveLength(1))
  await act(async () => { await hook.result.current.openProject('p1') })
  await waitFor(() => expect(hook.result.current.outlineStatus).toBe('idle'))
  // The logs are fetched once the project is open.
  await waitFor(() => expect(backend.count('GET /projects/p1/settings-log')).toBe(1))
  const title = (id: string) => hook.result.current.outlineNodes.find(n => n.id === id)?.title
  return { ...hook, backend, title }
}

describe('useWriterWorkspace: undo of the outline', () => {
  it('has nothing to undo or redo until something is edited', async () => {
    const { result } = await opened()
    expect(result.current.history.canUndo('outline')).toBe(false)
    expect(result.current.history.canRedo('outline')).toBe(false)
    act(() => { result.current.history.undo('outline') })
    expect(result.current.outlineNodes.map(n => n.title)).toEqual(['Book', 'Chapter one', 'Chapter two'])
  })

  it('undoes and redoes an edit', async () => {
    const { result, title } = await opened()
    act(() => { result.current.updateOutlineNode('c1', { title: 'Changed' }) })
    expect(result.current.history.canUndo('outline')).toBe(true)

    act(() => { result.current.history.undo('outline') })
    expect(title('c1')).toBe('Chapter one')
    expect(result.current.history.canUndo('outline')).toBe(false)
    expect(result.current.history.canRedo('outline')).toBe(true)

    act(() => { result.current.history.redo('outline') })
    expect(title('c1')).toBe('Changed')
    expect(result.current.history.canRedo('outline')).toBe(false)
  })

  it('takes a burst of typing as one step, and structural edits as a step each', async () => {
    const { result, title } = await opened()
    act(() => { result.current.updateOutlineNode('c1', { title: 'C' }) })
    act(() => { result.current.updateOutlineNode('c1', { title: 'Ch' }) })
    act(() => { result.current.updateOutlineNode('c1', { title: 'Cha' }) })
    act(() => { result.current.history.undo('outline') })
    expect(title('c1')).toBe('Chapter one')

    act(() => { result.current.addOutlineNode('b1', 'chapter', { title: 'Three' }) })
    act(() => { result.current.addOutlineNode('b1', 'chapter', { title: 'Four' }) })
    act(() => { result.current.history.undo('outline') })
    expect(result.current.outlineNodes.map(n => n.title)).toEqual(['Book', 'Chapter one', 'Chapter two', 'Three'])
    act(() => { result.current.history.undo('outline') })
    expect(result.current.outlineNodes.map(n => n.title)).toEqual(['Book', 'Chapter one', 'Chapter two'])
  })

  it('forgets what could be redone when a new edit is made', async () => {
    const { result } = await opened()
    act(() => { result.current.addOutlineNode('b1', 'chapter', { title: 'Three' }) })
    act(() => { result.current.history.undo('outline') })
    expect(result.current.history.canRedo('outline')).toBe(true)
    act(() => { result.current.addOutlineNode('b1', 'chapter', { title: 'Other' }) })
    expect(result.current.history.canRedo('outline')).toBe(false)
  })

  it('shows an undo as an unsaved edit, which a Save sends', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.updateOutlineNode('c1', { title: 'Changed' }) })
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.outline.at(-1)?.find(n => n.id === 'c1')?.title).toBe('Changed')

    act(() => { result.current.history.undo('outline') })
    expect(result.current.saveStatus.state).toBe('unsaved')
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.outline).toHaveLength(2)
    expect(backend.saved.outline.at(-1)?.find(n => n.id === 'c1')?.title).toBe('Chapter one')
  })

  it('starts afresh when another page is opened', async () => {
    const { result } = await opened()
    act(() => { result.current.updateOutlineNode('c1', { title: 'Changed' }) })
    expect(result.current.history.canUndo('outline')).toBe(true)
    act(() => { result.current.openBook('b1') })
    await waitFor(() => expect(result.current.history.canUndo('outline')).toBe(false))
    expect(result.current.history.canRedo('outline')).toBe(false)
  })

  it('does not mix the outline\'s steps with the plot\'s', async () => {
    const { result, title } = await opened()
    act(() => { result.current.updateOutlineNode('c1', { title: 'Changed' }) })
    expect(result.current.history.canUndo('plot')).toBe(false)
    act(() => { result.current.addPlotNode('cat', 'plotline', 'New') })
    act(() => { result.current.history.undo('plot') })
    expect(result.current.plotNodes.map(n => n.title)).toEqual(['Category', 'Plotline'])
    expect(title('c1')).toBe('Changed')
  })
})

describe('useWriterWorkspace: undo of the plot', () => {
  it('undoes and redoes an edit of the plot', async () => {
    const { result } = await opened()
    act(() => { result.current.addPlotNode('cat', 'plotline', 'New') })
    expect(result.current.plotNodes).toHaveLength(3)
    act(() => { result.current.history.undo('plot') })
    expect(result.current.plotNodes).toHaveLength(2)
    expect(result.current.history.canRedo('plot')).toBe(true)
    act(() => { result.current.history.redo('plot') })
    expect(result.current.plotNodes.map(n => n.title)).toEqual(['Category', 'Plotline', 'New'])
  })
})

describe('useWriterWorkspace: undo of the project\'s settings', () => {
  it('sends a change of time systems, undoes it, and sends the undo', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.updateTimeSystems([MOON], true) })
    expect(result.current.activeProject?.settings.timeSystems).toEqual([MOON])
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings.at(-1)).toMatchObject({ timeSystems: [MOON] })

    expect(result.current.history.canUndo('settings')).toBe(true)
    act(() => { result.current.history.undo('settings') })
    expect(result.current.activeProject?.settings.timeSystems).toEqual([])
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings.at(-1)).toMatchObject({ timeSystems: [] })

    act(() => { result.current.history.redo('settings') })
    expect(result.current.activeProject?.settings.timeSystems).toEqual([MOON])
  })

  it('keeps the colour with the time systems when either is changed', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.setProjectHue(200) })
    act(() => { result.current.updateTimeSystems([MOON], false) })
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings.at(-1)).toMatchObject({ timeSystems: [MOON], themeHue: 200 })
  })

  it('renames the project: the shelves show it at once, the settings save sends it, and Undo and Redo step through it', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.renameProject('  Second Draft  ') })
    expect(result.current.activeProject?.title).toBe('Second Draft')
    expect(result.current.projects.map(p => p.title)).toEqual(['Second Draft'])
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings.at(-1)).toMatchObject({ title: 'Second Draft' })
    expect(result.current.projects.map(p => p.title)).toEqual(['Second Draft'])

    act(() => { result.current.history.undo('settings') })
    expect(result.current.activeProject?.title).toBe('First')
    expect(result.current.projects.map(p => p.title)).toEqual(['First'])
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings.at(-1)).toMatchObject({ title: 'First' })

    act(() => { result.current.history.redo('settings') })
    expect(result.current.activeProject?.title).toBe('Second Draft')
  })

  it('sends the name only until the server has it, and keeps one that is waiting when the colour changes', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.renameProject('Second Draft') })
    act(() => { result.current.setProjectHue(200) })
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings.at(-1)).toMatchObject({ title: 'Second Draft', themeHue: 200 })

    act(() => { result.current.setProjectHue(90) })
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings.at(-1)).toMatchObject({ themeHue: 90 })
    expect(backend.saved.settings.at(-1)).not.toHaveProperty('title')
  })

  it('gives each project its colour for the shelves: its own, else the default, and the open one follows its colour at once', async () => {
    const { result } = await opened()
    const [shelf] = result.current.projects
    expect(result.current.projectHueOf(shelf)).toBe(result.current.projectHue) // none of its own: the default
    expect(result.current.projectHueOf({ ...shelf, settings: { ...shelf.settings, themeHue: 40 } })).toBe(40)

    act(() => { result.current.setProjectHue(200) })
    expect(result.current.projectHue).toBe(200)
    expect(result.current.projectHueOf(result.current.projects[0])).toBe(200) // the list's entry, not only the open project's
    await act(async () => { await result.current.saveNow() })
    expect(result.current.projectHueOf(result.current.projects[0])).toBe(200)
  })

  it('does not rename to a blank name, and cuts a name that is too long', async () => {
    const { result, backend } = await opened()
    act(() => { result.current.renameProject('   ') })
    expect(result.current.activeProject?.title).toBe('First')
    expect(result.current.history.canUndo('settings')).toBe(false)
    await act(async () => { await result.current.saveNow() })
    expect(backend.saved.settings).toEqual([])

    act(() => { result.current.renameProject('x'.repeat(PROJECT_NAME_MAX + 50)) })
    expect(result.current.activeProject?.title).toBe('x'.repeat(PROJECT_NAME_MAX))
  })

  it('ignores a change when no project is open', async () => {
    standInBackend({ p1: { index: projectIndex('p1', 'First'), outline: OUTLINE } })
    const { result } = renderHook(() => useWriterWorkspace())
    await waitFor(() => expect(result.current.projects).toHaveLength(1))
    act(() => { result.current.updateTimeSystems([MOON], true) })
    expect(result.current.activeProject).toBeNull()
  })
})

describe('useWriterWorkspace: undo into today\'s log', () => {
  const now = Date.now()
  const stamp = (secondsAgo: number) => new Date(now - secondsAgo * 1000).toISOString()
  const snapshotOf = (title: string) => OUTLINE.map(n => (n.id === 'c1' ? { ...n, title } : n))

  function logged(entries: Array<{ id: string; ago: number; title: string }>): Answer {
    return (path) => {
      if (path === '/projects/p1/outline/history') return entries.map(e => ({ snapshotId: e.id, createdAt: stamp(e.ago), treeType: 'outline', trigger: 'save', nodeCount: 3, summary: '' }))
      const snapshot = /^\/projects\/p1\/outline\/history\/(\w+)$/.exec(path)
      if (snapshot) {
        const entry = entries.find(e => e.id === snapshot[1])!
        return { snapshotId: entry.id, createdAt: stamp(entry.ago), trigger: 'save', nodes: snapshotOf(entry.title) }
      }
      return undefined
    }
  }

  it('goes back to the snapshot before the one the outline is at, once the memory is used up', async () => {
    const { result, title } = await opened(logged([
      { id: 's2', ago: 10, title: 'Chapter one' },
      { id: 's1', ago: 60, title: 'Older title' },
    ]))
    await waitFor(() => expect(result.current.history.canUndo('outline')).toBe(true))
    await act(async () => { result.current.history.undo('outline') })
    await waitFor(() => expect(title('c1')).toBe('Older title'))
    // The step is an unsaved edit that can be redone.
    expect(result.current.history.canRedo('outline')).toBe(true)
    act(() => { result.current.history.redo('outline') })
    expect(title('c1')).toBe('Chapter one')
  })

  it('goes past a snapshot that is the same as what is shown', async () => {
    const { result, title } = await opened(logged([
      { id: 's3', ago: 10, title: 'Chapter one' },
      { id: 's2', ago: 30, title: 'Chapter one' },
      { id: 's1', ago: 60, title: 'Oldest' },
    ]))
    await waitFor(() => expect(result.current.history.canUndo('outline')).toBe(true))
    await act(async () => { result.current.history.undo('outline') })
    await waitFor(() => expect(title('c1')).toBe('Oldest'))
  })

  it('offers nothing from a day before, or when the log holds only the state shown', async () => {
    const yesterday = await opened((path) => {
      if (path === '/projects/p1/outline/history') {
        return [
          { snapshotId: 's2', createdAt: '2020-01-02T10:00:00Z', treeType: 'outline', trigger: 'save', nodeCount: 3, summary: '' },
          { snapshotId: 's1', createdAt: '2020-01-02T09:00:00Z', treeType: 'outline', trigger: 'save', nodeCount: 3, summary: '' },
        ]
      }
      return undefined
    })
    expect(yesterday.result.current.history.canUndo('outline')).toBe(false)

    const single = await opened(logged([{ id: 's1', ago: 10, title: 'Chapter one' }]))
    expect(single.result.current.history.canUndo('outline')).toBe(false)
  })

  it('restores the value a settings log entry holds from before its change', async () => {
    const { result } = await opened((path) => {
      if (path === '/projects/p1/settings-log') {
        return [{ id: 'e1', createdAt: stamp(5), kind: 'project', label: 'Time systems', before: { timeSystems: [MOON], themeHue: null } }]
      }
      return undefined
    })
    await waitFor(() => expect(result.current.history.canUndo('settings')).toBe(true))
    await act(async () => { result.current.history.undo('settings') })
    await waitFor(() => expect(result.current.activeProject?.settings.timeSystems).toEqual([MOON]))
    // (An entry from before the name was logged has none: the name stays as it is.)
    expect(result.current.activeProject?.title).toBe('First')
  })

  it('restores the name a settings log entry holds from before its change', async () => {
    const { result } = await opened((path) => {
      if (path === '/projects/p1/settings-log') {
        return [{ id: 'e1', createdAt: stamp(5), kind: 'project', label: 'Project settings changed', before: { timeSystems: [], themeHue: null, title: 'Older name' } }]
      }
      return undefined
    })
    await waitFor(() => expect(result.current.history.canUndo('settings')).toBe(true))
    await act(async () => { result.current.history.undo('settings') })
    await waitFor(() => expect(result.current.activeProject?.title).toBe('Older name'))
    expect(result.current.projects.map(p => p.title)).toEqual(['Older name'])
  })
})
