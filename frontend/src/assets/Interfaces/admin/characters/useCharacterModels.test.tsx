import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAutosaveMode } from '../../../../settings/settingsStore'
import { content, draftEntry, liveEntry, modelsBackend } from '../../../../test/characterModelsBackend'
import { newShape } from './engine/edit'
import { templateBox } from './engine/templates'
import { addGroup, addObject, addShape } from './modelContent'
import { useCharacterModels } from './useCharacterModels'

let n = 0
const makeId = (prefix: string) => `${prefix}_${(n += 1)}`
const puts = (b: { calls: string[] }) => b.calls.filter(c => c === 'PUT /character-models')

// a model that can be published: one shape in one object in one group
function complete(name: string) {
  let c = content(name)
  c = addGroup(c, { id: 'g', name: 'Head', parent: null, objects: [] })
  c = addObject(c, 'g', { id: 'o', name: 'Head', layer: 'body', shapes: [] })
  return addShape(c, 'o', newShape('s', 'Head', 'oval', templateBox('oval', 100, 46, 40)))
}

async function load(initial = [liveEntry('a', complete('Adult')), draftEntry('b', content('Stylised'))]) {
  const backend = modelsBackend(initial)
  const hook = renderHook(() => useCharacterModels(makeId))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return { backend, hook }
}

beforeEach(() => { n = 0 })
afterEach(() => { vi.useRealTimers() })

describe('loading', () => {
  it('reads the catalog', async () => {
    const { hook } = await load()
    expect(hook.result.current.entries.map(e => e.id)).toEqual(['a', 'b'])
    expect(hook.result.current.saveStatus.state).toBe('saved')
  })
  it('reports a catalog that could not be read, and reads it again on request', async () => {
    const backend = modelsBackend([draftEntry('a', content('Cast'))])
    backend.failNext('/character-models', 500, 'The models file is damaged.')
    const hook = renderHook(() => useCharacterModels(makeId))
    await waitFor(() => expect(hook.result.current.status).toBe('error'))
    expect(hook.result.current.loadError).toBe('The models file is damaged.')
    await act(async () => { await hook.result.current.reload() })
    expect(hook.result.current.status).toBe('ready')
    expect(hook.result.current.entries).toHaveLength(1)
  })
})

describe('saving the drafts', () => {
  it('shows an edit at once and sends every draft, cleaned, when Save is pressed', async () => {
    const { backend, hook } = await load()
    act(() => hook.result.current.edit('a', c => ({ ...c, name: ' Adult 2 ' })))
    expect(hook.result.current.entries[0].draft.name).toBe(' Adult 2 ')
    expect(hook.result.current.saveStatus.state).toBe('unsaved')
    expect(puts(backend)).toEqual([])
    await act(async () => { await hook.result.current.saveNow() })
    expect(puts(backend)).toHaveLength(1)
    const body = JSON.parse(String(backend.fetch.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!.body))
    expect(body.models.map((m: { id: string }) => m.id)).toEqual(['a', 'b'])
    expect(body.models[0].draft.name).toBe('Adult 2')
    expect(hook.result.current.saveStatus.state).toBe('saved')
  })

  it('saves by itself after the wait when autosave is on', async () => {
    vi.useFakeTimers()
    setAutosaveMode(60)
    const backend = modelsBackend([draftEntry('a', content('Cast'))])
    const hook = renderHook(() => useCharacterModels(makeId))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    act(() => hook.result.current.edit('a', c => ({ ...c, description: 'who' })))
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(puts(backend)).toHaveLength(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000) })
    expect(puts(backend)).toHaveLength(1)
    expect(backend.entries[0].draft.description).toBe('who')
  })

  it('keeps what was typed when the save comes back, and takes the published copies from it', async () => {
    const { hook } = await load()
    act(() => hook.result.current.edit('a', c => ({ ...c, description: 'typed ' })))
    await act(async () => { await hook.result.current.saveNow() })
    expect(hook.result.current.entries[0].draft.description).toBe('typed ')
    expect(hook.result.current.entries[0].published?.version).toBe(1)
  })
})

describe('the list', () => {
  it('adds, duplicates, moves and removes models, saving each at once (when autosave is off it waits for Save)', async () => {
    const { backend, hook } = await load()
    let id = ''
    act(() => { id = hook.result.current.addModel(content('Child')) })
    expect(id).toBe('model_1')
    act(() => { hook.result.current.duplicateModel('a') })
    expect(hook.result.current.entries.map(e => e.draft.name)).toEqual(['Adult', 'Adult (copy)', 'Stylised', 'Child'])
    act(() => hook.result.current.moveModel('model_1', 'a'))
    expect(hook.result.current.entries[0].id).toBe('model_1')
    act(() => hook.result.current.removeModel('b'))
    await act(async () => { await hook.result.current.saveNow() })
    expect(backend.entries.map(e => e.draft.name)).toEqual(['Child', 'Adult', 'Adult (copy)'])
    expect(backend.entries[2].published).toBeNull()   // the copy was never published
  })
})

describe('publishing', () => {
  it('saves what is waiting first, then publishes', async () => {
    const { backend, hook } = await load([draftEntry('a', complete('Adult'))])
    act(() => hook.result.current.edit('a', c => ({ ...c, description: 'before publish' })))
    let ok = false
    await act(async () => { ok = await hook.result.current.publish('a') })
    expect(ok).toBe(true)
    expect(backend.calls.slice(-2)).toEqual(['PUT /character-models', 'POST /character-models/a/publish'])
    expect(hook.result.current.entries[0].published?.content.description).toBe('before publish')
  })
  it('reports a refusal and changes nothing', async () => {
    const { hook } = await load([draftEntry('a', content('Empty'))])
    // the shape-less model publishes (nothing to check), so break it: no name
    act(() => hook.result.current.edit('a', c => ({ ...c, name: '' })))
    let ok = true
    await act(async () => { ok = await hook.result.current.publish('a') })
    expect(ok).toBe(false)
    expect(hook.result.current.actionError).toMatch(/needs a name/)
    expect(hook.result.current.entries[0].published).toBeNull()
  })
  it('unpublishes, discards and restores', async () => {
    const { hook } = await load([liveEntry('a', complete('Adult'))])
    await act(async () => { await hook.result.current.publish('a') })       // version 2, version 1 in the history
    expect(hook.result.current.entries[0].published?.version).toBe(2)
    act(() => hook.result.current.edit('a', c => ({ ...c, description: 'edited' })))
    await act(async () => { await hook.result.current.discard('a') })
    expect(hook.result.current.entries[0].draft.description).toBe('')
    await act(async () => { await hook.result.current.restore('a', 1) })
    expect(hook.result.current.entries[0].draft.name).toBe('Adult')
    await act(async () => { await hook.result.current.unpublish('a') })
    expect(hook.result.current.entries[0].published).toBeNull()
    expect(hook.result.current.entries[0].history.length).toBeGreaterThan(0)
  })
  it('does nothing when the changes could not be saved first', async () => {
    const { backend, hook } = await load()
    act(() => hook.result.current.edit('a', c => ({ ...c, description: 'x' })))
    backend.failNext('/character-models', 500, 'disk full')
    let ok = true
    await act(async () => { ok = await hook.result.current.publish('a') })
    expect(ok).toBe(false)
    expect(backend.calls).not.toContain('POST /character-models/a/publish')
  })
})
