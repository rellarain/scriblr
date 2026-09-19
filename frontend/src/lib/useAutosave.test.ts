import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { combineSaveStatus, useAutosave } from './useAutosave'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

type Opts = { delay?: number; retryDelay?: number; enabled?: boolean }
function setup(save: (v: string) => Promise<void>, opts: Opts = {}) {
  return renderHook((props: Opts) => useAutosave<string>({ save, ...opts, ...props }), { initialProps: {} as Opts })
}

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

  it('waits 30 seconds of inactivity by default', async () => {
    const save = vi.fn(async () => {})
    const { result } = setup(save)
    act(() => { result.current.schedule('a') })
    await act(async () => { await vi.advanceTimersByTimeAsync(29_000) })
    act(() => { result.current.schedule('ab') }) // another change restarts the wait
    await act(async () => { await vi.advanceTimersByTimeAsync(29_000) })
    expect(save).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('ab')
  })

  it('saveNow saves immediately, and flush saves what is waiting', async () => {
    const save = vi.fn(async () => {})
    const { result } = setup(save)
    await act(async () => { await result.current.saveNow('now') })
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

    act(() => { void result.current.saveNow('one') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => { void result.current.saveNow('two') })
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
    await act(async () => { await result.current.saveNow('x') })
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

  it('a newer value replaces one that failed', async () => {
    let fail = true
    const save = vi.fn(async () => { if (fail) throw new Error('nope') })
    const { result } = setup(save, { retryDelay: 1000 })
    await act(async () => { await result.current.saveNow('old') })
    fail = false
    await act(async () => { await result.current.saveNow('new') })
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
    act(() => { void result.current.saveNow('inflight') })
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
