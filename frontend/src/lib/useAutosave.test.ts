import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { combineCountdown, combineSaveStatus, useAutosave, type Autosave } from './useAutosave'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

type Opts = { delay?: number; retryDelay?: number; enabled?: boolean }
function setup(save: (v: string) => Promise<void>, opts: Opts = {}) {
  return renderHook((props: Opts) => useAutosave<string>({ save, enabled: true, ...opts, ...props }), { initialProps: {} as Opts })
}
// A structural edit, then a Save: saveNow waits like schedule now, so these tests flush it.
const now = (r: { current: Autosave<string> }, v: string) => { void r.current.saveNow(v); return r.current.flush() }

describe('useAutosave', () => {
  it('debounces: only the latest value is saved, after the delay', async () => {
    const save = vi.fn(async () => {})
    const { result } = setup(save, { delay: 500 })
    act(() => { result.current.schedule('a'); result.current.schedule('ab'); result.current.schedule('abc') })
    expect(result.current.dirty).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(499) })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('abc')
    expect(result.current.dirty).toBe(false)
    expect(result.current.lastSavedAt).not.toBeNull()
  })

  it('waits the chosen interval of inactivity, and another change restarts the wait', async () => {
    const save = vi.fn(async () => {})
    const { result } = setup(save, { delay: 60_000 })
    act(() => { result.current.schedule('a') })
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000) })
    act(() => { result.current.schedule('ab') }) // another change restarts the wait
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000) })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('ab')
  })

  it('saveNow waits like schedule, and flush saves what is waiting right away', async () => {
    const save = vi.fn(async () => {})
    const { result } = setup(save, { delay: 500 })
    act(() => { void result.current.saveNow('now') })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(save).toHaveBeenLastCalledWith('now')

    act(() => { result.current.schedule('later') })
    await act(async () => { await result.current.flush() })
    expect(save).toHaveBeenLastCalledWith('later')
    expect(save).toHaveBeenCalledTimes(2)

    await act(async () => { await result.current.flush() }) // nothing waiting
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('saves what is waiting when unmounted', async () => {
    const save = vi.fn(async () => {})
    const { result, unmount } = setup(save)
    act(() => { result.current.schedule('pending') })
    unmount()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledWith('pending')
  })

  it('runs saves one at a time, in order, and stays dirty until the latest one lands', async () => {
    const order: string[] = []
    const resolvers: Array<() => void> = []
    const save = vi.fn((v: string) => new Promise<void>(resolve => {
      order.push(`start ${v}`)
      resolvers.push(() => { order.push(`end ${v}`); resolve() })
    }))
    const { result } = setup(save)

    act(() => { void now(result, 'one') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => { void now(result, 'two') })
    expect(result.current.saving).toBe(true)
    expect(save).toHaveBeenCalledTimes(1) // 'two' waits for 'one'

    await act(async () => { resolvers[0](); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.dirty).toBe(true) // 'two' is still in flight
    await act(async () => { resolvers[1](); await vi.advanceTimersByTimeAsync(0) })
    expect(order).toEqual(['start one', 'end one', 'start two', 'end two'])
    expect(result.current.dirty).toBe(false)
    expect(result.current.saving).toBe(false)
  })

  it('keeps the value and reports the error on failure, then retries', async () => {
    let fail = true
    const save = vi.fn(async () => { if (fail) throw new Error('offline') })
    const { result } = setup(save, { retryDelay: 1000 })
    await act(async () => { await now(result, 'x') })
    expect(result.current.error).toBe('offline')
    expect(result.current.dirty).toBe(true)
    expect(result.current.isPending()).toBe(true)

    fail = false
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('x')
    expect(result.current.error).toBeUndefined()
    expect(result.current.dirty).toBe(false)
  })

  it('hasNewer is true inside a save while a later one is queued behind it', async () => {
    const seen: boolean[] = []
    const resolvers: Array<() => void> = []
    let api: { hasNewer: () => boolean } = { hasNewer: () => false }
    const save = vi.fn((_v: string) => new Promise<void>(resolve => {
      seen.push(api.hasNewer())
      resolvers.push(resolve)
    }))
    const { result } = setup(save)
    api = result.current
    act(() => { void now(result, 'one') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => { void now(result, 'two') })
    await act(async () => { resolvers[0](); await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { resolvers[1](); await vi.advanceTimersByTimeAsync(0) })
    // While 'one' ran nothing else was queued yet at its start; 'two' ran alone afterwards.
    expect(seen).toEqual([false, false])
    // Queued behind a running save it is reported (checked while 'three' waits for 'four's turn).
    act(() => { void now(result, 'three') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => { void now(result, 'four') })
    expect(result.current.hasNewer()).toBe(true)
    await act(async () => { resolvers[2](); await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { resolvers[3](); await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.hasNewer()).toBe(false)
  })

  it('a newer value replaces one that failed', async () => {
    let fail = true
    const save = vi.fn(async () => { if (fail) throw new Error('nope') })
    const { result } = setup(save, { retryDelay: 1000 })
    await act(async () => { await now(result, 'old') })
    fail = false
    await act(async () => { await now(result, 'new') })
    expect(save).toHaveBeenLastCalledWith('new')
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(save).toHaveBeenCalledTimes(2) // no stale retry of 'old'
  })

  it('cancel forgets a waiting value', async () => {
    const save = vi.fn(async () => {})
    const { result } = setup(save)
    act(() => { result.current.schedule('gone') })
    act(() => { result.current.cancel() })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(save).not.toHaveBeenCalled()
    expect(result.current.dirty).toBe(false)
  })
})

describe("useAutosave: the user's autosave setting", () => {
  it('holds edits while autosave is off, saving only on flush', async () => {
    const save = vi.fn(async () => {})
    const { result } = setup(save, { enabled: false, delay: 100 })
    act(() => { result.current.schedule('a') })
    await act(async () => { void result.current.saveNow('b') }) // a structural edit waits too
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000) })
    expect(save).not.toHaveBeenCalled()
    expect(result.current.dirty).toBe(true)
    await act(async () => { await result.current.flush() })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('b')
    expect(result.current.dirty).toBe(false)
  })

  it('saves what is waiting when autosave is turned on, or the wait changes', async () => {
    const save = vi.fn(async () => {})
    const { result, rerender } = setup(save, { enabled: false, delay: 10_000 })
    act(() => { result.current.schedule('held') })
    rerender({ enabled: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(save).toHaveBeenCalledWith('held')

    act(() => { result.current.schedule('next') })
    rerender({ enabled: true, delay: 60_000 })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(save).toHaveBeenLastCalledWith('next')
  })

  it('does not retry a failed save on its own while autosave is off', async () => {
    const save = vi.fn(async () => { throw new Error('offline') })
    const { result } = setup(save, { enabled: false, retryDelay: 1000 })
    act(() => { result.current.schedule('x') })
    await act(async () => { await result.current.flush() })
    expect(result.current.error).toBe('offline')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('discard drops the waiting value and any error, after the save under way', async () => {
    let release: () => void = () => {}
    const save = vi.fn((_v: string) => new Promise<void>((_resolve, reject) => { release = () => reject(new Error('late failure')) }))
    const { result } = setup(save, { retryDelay: 500 })
    act(() => { void now(result, 'inflight') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    let done = false
    act(() => { void result.current.discard().then(() => { done = true }) })
    expect(done).toBe(false) // waits for the save under way
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(0) })
    expect(done).toBe(true)
    expect(result.current.dirty).toBe(false)
    expect(result.current.error).toBeUndefined()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(save).toHaveBeenCalledTimes(1) // the failed value did not come back to retry
  })
})

describe('useAutosave: the countdown', () => {
  it('reports when the waiting value will save, restarting on each edit and clearing once saved', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const save = vi.fn(async () => {})
    const { result } = setup(save, { delay: 60_000 })
    expect(result.current.nextSaveAt).toBeNull()
    expect(result.current.wait).toBe(60_000)
    act(() => { result.current.schedule('a') })
    const first = result.current.nextSaveAt!
    expect(first).toBe(Date.now() + 60_000)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    act(() => { result.current.schedule('ab') })
    expect(result.current.nextSaveAt).toBe(first + 30_000) // refilled by the new edit
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })
    expect(save).toHaveBeenCalledWith('ab')
    expect(result.current.nextSaveAt).toBeNull()
  })

  it('has no countdown while autosave is off', () => {
    const { result } = setup(vi.fn(async () => {}), { enabled: false })
    act(() => { result.current.schedule('a') })
    expect(result.current.nextSaveAt).toBeNull()
    expect(result.current.wait).toBeNull()
  })

  it('retries a failed save when the next wait ends', async () => {
    let fail = true
    const save = vi.fn(async () => { if (fail) throw new Error('offline') })
    const { result } = setup(save, { delay: 60_000 })
    act(() => { void now(result, 'x') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.error).toBe('offline')
    expect(result.current.nextSaveAt).not.toBeNull()
    fail = false
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeUndefined()
  })

  it('combines several into the soonest save', () => {
    expect(combineCountdown({ nextSaveAt: null, wait: null }, { nextSaveAt: 5, wait: 60_000 }, { nextSaveAt: 3, wait: 60_000 })).toEqual({ nextSaveAt: 3, wait: 60_000 })
    expect(combineCountdown({ nextSaveAt: null, wait: null })).toEqual({ nextSaveAt: null, wait: null })
  })
})

describe('combineSaveStatus', () => {
  const idle = { dirty: false, saving: false, error: undefined, lastSavedAt: null }
  it('reports the most urgent state', () => {
    expect(combineSaveStatus(idle, idle).state).toBe('saved')
    expect(combineSaveStatus(idle, { ...idle, dirty: true }).state).toBe('unsaved')
    expect(combineSaveStatus({ ...idle, dirty: true }, { ...idle, saving: true, dirty: true }).state).toBe('saving')
    expect(combineSaveStatus({ ...idle, saving: true }, { ...idle, error: 'boom', dirty: true }).state).toBe('error')
    expect(combineSaveStatus({ ...idle, error: 'boom' }).error).toBe('boom')
  })

  it('reports the most recent save time', () => {
    expect(combineSaveStatus(idle, idle).lastSavedAt).toBeNull()
    expect(combineSaveStatus({ ...idle, lastSavedAt: 100 }, { ...idle, lastSavedAt: 300 }, idle).lastSavedAt).toBe(300)
  })
})
