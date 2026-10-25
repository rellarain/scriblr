import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAutosaveMode } from '../../../../settings/settingsStore'
import { content, draftEntry, liveEntry, presetsBackend } from '../../../../test/presetsBackend'
import { usePlotPresets } from './usePlotPresets'

let n = 0
const makeId = (prefix: string) => `${prefix}-${(n += 1)}`
const puts = (b: { calls: string[] }) => b.calls.filter(c => c === 'PUT /presets')

async function load(initial = [liveEntry('a', content('Characters', { fields: ['Name'] })), draftEntry('b', content('Heist crew'))]) {
  const backend = presetsBackend(initial)
  const hook = renderHook(() => usePlotPresets(makeId))
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
    const backend = presetsBackend([draftEntry('a', content('Cast'))])
    backend.failNext('/presets', 500, 'The presets file is damaged.')
    const hook = renderHook(() => usePlotPresets(makeId))
    await waitFor(() => expect(hook.result.current.status).toBe('error'))
    expect(hook.result.current.loadError).toBe('The presets file is damaged.')
    await act(async () => { await hook.result.current.reload() })
    expect(hook.result.current.status).toBe('ready')
    expect(hook.result.current.entries).toHaveLength(1)
  })
})

describe('saving the drafts', () => {
  it('shows an edit at once and sends every draft, cleaned, when Save is pressed', async () => {
    const { backend, hook } = await load()
    act(() => hook.result.current.edit('a', c => ({ ...c, name: ' People ', fields: ['Name', ' ', 'Age'] })))
    expect(hook.result.current.entries[0].draft.name).toBe(' People ')
    expect(hook.result.current.saveStatus.state).toBe('unsaved')
    expect(puts(backend)).toEqual([])
    await act(async () => { await hook.result.current.saveNow() })
    expect(puts(backend)).toHaveLength(1)
    const body = JSON.parse(String(backend.fetch.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!.body))
    expect(body.presets.map((p: { id: string }) => p.id)).toEqual(['a', 'b'])
    expect(body.presets[0].draft).toMatchObject({ name: 'People', fields: ['Name', 'Age'] })
    expect(hook.result.current.saveStatus.state).toBe('saved')
  })

  it('saves by itself after the wait when autosave is on', async () => {
    vi.useFakeTimers()
    setAutosaveMode(60)
    const backend = presetsBackend([draftEntry('a', content('Cast'))])
    const hook = renderHook(() => usePlotPresets(makeId))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    act(() => hook.result.current.edit('a', c => ({ ...c, description: 'who' })))
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(puts(backend)).toHaveLength(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000) })
    expect(puts(backend)).toHaveLength(1)
    expect(backend.entries[0].draft.description).toBe('who')
  })

  it('keeps what was typed when the save comes back, and takes the published copies from it', async () => {
    const { backend, hook } = await load()
    act(() => hook.result.current.edit('a', c => ({ ...c, description: 'typed with a space ' })))
    await act(async () => { await hook.result.current.saveNow() })
    expect(hook.result.current.entries[0].draft.description).toBe('typed with a space ')
    expect(backend.entries[0].draft.description).toBe('typed with a space')
    expect(hook.result.current.entries[0].published?.version).toBe(1)
  })

  it('says so when a save fails, and keeps the edit', async () => {
    const { backend, hook } = await load()
    backend.failNext('/presets', 500, 'disk full')
    act(() => hook.result.current.edit('a', c => ({ ...c, name: 'People' })))
    await act(async () => { await hook.result.current.saveNow() })
    expect(hook.result.current.saveStatus.state).toBe('error')
    expect(hook.result.current.saveStatus.error).toBe('disk full')
    expect(hook.result.current.entries[0].draft.name).toBe('People')
  })
})

describe('the list', () => {
  it('adds a blank preset last, or after another, and removes and moves them', async () => {
    const { hook } = await load()
    let first = ''
    act(() => { first = hook.result.current.addPreset() })
    expect(hook.result.current.entries.map(e => e.id)).toEqual(['a', 'b', first])
    let second = ''
    act(() => { second = hook.result.current.addPreset(undefined, 'a') })
    expect(hook.result.current.entries.map(e => e.id)).toEqual(['a', second, 'b', first])
    act(() => hook.result.current.movePreset(first, 'a'))
    expect(hook.result.current.entries.map(e => e.id)).toEqual([first, 'a', second, 'b'])
    act(() => hook.result.current.movePreset('a', null))
    expect(hook.result.current.entries.map(e => e.id)).toEqual([first, second, 'b', 'a'])
    act(() => hook.result.current.removePreset(second))
    expect(hook.result.current.entries.map(e => e.id)).toEqual([first, 'b', 'a'])
  })

  it('duplicates a preset right after it, as an unpublished draft with a free name and new card ids', async () => {
    const sub = { id: 's1', name: 'Heroes', description: '', keywords: [], fields: [], clusters: [{ id: 'k1', name: 'Core', description: '', keywords: [], fields: [] }] }
    const { hook } = await load([liveEntry('a', content('Characters', { subcategories: [sub] })), draftEntry('b', content('Other'))])
    let copy: string | null = null
    act(() => { copy = hook.result.current.duplicatePreset('a') })
    const entries = hook.result.current.entries
    expect(entries.map(e => e.draft.name)).toEqual(['Characters', 'Characters (copy)', 'Other'])
    expect(entries[1]).toMatchObject({ id: copy, published: null, history: [], nextVersion: 1 })
    expect(entries[1].draft.subcategories[0].id).not.toBe('s1')
    expect(entries[1].draft.subcategories[0].clusters[0].id).not.toBe('k1')
    expect(hook.result.current.duplicatePreset('nope')).toBeNull()
  })

  it('imports presets as drafts at the end, renames a name that is taken, and saves them at once', async () => {
    const { backend, hook } = await load()
    let added: Array<{ id: string; name: string }> = []
    await act(async () => { added = await hook.result.current.importPresets([content('Characters'), content('Crew')]) })
    expect(added.map(a => a.name)).toEqual(['Characters (copy)', 'Crew'])
    expect(hook.result.current.entries.map(e => e.draft.name)).toEqual(['Characters', 'Heist crew', 'Characters (copy)', 'Crew'])
    expect(backend.entries.map(e => e.draft.name)).toEqual(['Characters', 'Heist crew', 'Characters (copy)', 'Crew'])
    expect(backend.entries[2].published).toBeNull()
    await act(async () => { expect(await hook.result.current.importPresets([])).toEqual([]) })
  })
})

describe('publishing', () => {
  it('saves what is waiting, then publishes, and takes the catalog from the answer', async () => {
    const { backend, hook } = await load()
    act(() => hook.result.current.edit('b', c => ({ ...c, description: 'The team' })))
    let ok = false
    await act(async () => { ok = await hook.result.current.publish('b') })
    expect(ok).toBe(true)
    expect(backend.calls.filter(c => c !== 'GET /presets')).toEqual(['PUT /presets', 'POST /presets/b/publish'])
    expect(hook.result.current.entries[1].published).toMatchObject({ version: 1, content: { description: 'The team' } })
    expect(hook.result.current.busy).toBe(false)
  })

  it('reports why a publish was refused and changes nothing', async () => {
    const { hook } = await load([draftEntry('a', content(''))])
    let ok = true
    await act(async () => { ok = await hook.result.current.publish('a') })
    expect(ok).toBe(false)
    expect(hook.result.current.actionError).toBe('The preset needs a name.')
    expect(hook.result.current.entries[0].published).toBeNull()
    act(() => hook.result.current.clearActionError())
    expect(hook.result.current.actionError).toBeUndefined()
  })

  it('does not publish when the draft could not be saved first', async () => {
    const { backend, hook } = await load()
    backend.failNext('/presets', 500, 'disk full')
    act(() => hook.result.current.edit('b', c => ({ ...c, description: 'x' })))
    let ok = true
    await act(async () => { ok = await hook.result.current.publish('b') })
    expect(ok).toBe(false)
    expect(hook.result.current.actionError).toMatch(/could not be saved first/)
    expect(backend.calls.some(c => c.endsWith('/publish'))).toBe(false)
  })

  it('unpublishes, discards changes, and brings an earlier version into the draft', async () => {
    const v1 = content('Cast', { description: 'first' })
    const a = liveEntry('a', content('Cast', { description: 'second' }), { nextVersion: 3 })
    a.published = { version: 2, publishedAt: '2026-10-20T09:00:00Z', content: content('Cast', { description: 'second' }) }
    a.history = [{ version: 1, publishedAt: '2026-10-12T09:00:00Z', content: v1 }]
    const { hook } = await load([a])

    act(() => hook.result.current.edit('a', c => ({ ...c, description: 'unsaved' })))
    await act(async () => { await hook.result.current.discard('a') })
    expect(hook.result.current.entries[0].draft.description).toBe('second')

    await act(async () => { await hook.result.current.restore('a', 1) })
    expect(hook.result.current.entries[0].draft.description).toBe('first')
    expect(hook.result.current.entries[0].published?.version).toBe(2)

    await act(async () => { await hook.result.current.unpublish('a') })
    expect(hook.result.current.entries[0].published).toBeNull()
    expect(hook.result.current.entries[0].history.map(h => h.version)).toEqual([2, 1])
  })
})
