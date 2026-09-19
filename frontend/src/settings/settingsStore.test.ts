import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStoredState } from '../assets/Interfaces/writer/storage'
import { defaultThemeSettings } from '../theme/defaults'
import {
  __resetSettingsForTests, flushSettings, getKv, getSettings, initSettings, setKv, setTheme,
} from './settingsStore'

interface Call { url: string; method: string; body: unknown; keepalive?: boolean }

function remote(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    theme: defaultThemeSettings(),
    ui: { viewAs: null, handedness: 'right' },
    kv: {},
    migratedFromLocal: true,
    ...over,
  }
}

let calls: Call[]
let respond: (call: Call) => unknown

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  __resetSettingsForTests()
  calls = []
  respond = () => remote()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = {
      url, method: init?.method ?? 'GET', keepalive: init?.keepalive,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    }
    calls.push(call)
    return { ok: true, status: 200, json: async () => respond(call) }
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('kv writes', () => {
  it('reads and writes through memory and the localStorage cache', () => {
    expect(getKv('scriblr.writer.chapterMode')).toBeUndefined()
    setKv('scriblr.writer.chapterMode', 'draft')
    expect(getKv('scriblr.writer.chapterMode')).toBe('draft')
    expect(JSON.parse(window.localStorage.getItem('scriblr.writer.chapterMode')!)).toBe('draft')
  })

  it('debounces backend PUTs, sending only the latest value', async () => {
    setKv('scriblr.writer.scratchpad', [1])
    setKv('scriblr.writer.scratchpad', [1, 2])
    setKv('scriblr.writer.scratchpad', [1, 2, 3])
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(450)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      url: '/api/user-settings/kv/scriblr.writer.scratchpad', method: 'PUT', body: { value: [1, 2, 3] },
    })
  })

  it('flushes pending writes immediately with keepalive', () => {
    setKv('scriblr.writer.a', 1)
    setTheme(t => ({ ...t, timeBasedEnabled: true }))
    flushSettings()
    expect(calls.map(c => c.url).sort()).toEqual(['/api/user-settings/kv/scriblr.writer.a', '/api/user-settings/theme'])
    expect(calls.every(c => c.keepalive)).toBe(true)
  })

  it('retries a failed send later', async () => {
    let fail = true
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: undefined })
      return fail ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({}) }
    }))
    setKv('scriblr.writer.a', 1)
    await vi.advanceTimersByTimeAsync(450)
    expect(calls).toHaveLength(1)
    fail = false
    await vi.advanceTimersByTimeAsync(15_100)
    expect(calls).toHaveLength(2)
  })
})

describe('theme', () => {
  it('normalizes what is set and caches it', () => {
    setTheme(t => ({ ...t, override: 'night' })) // night is not configured
    expect(getSettings().theme.override).toBeNull()
    setTheme(t => ({ ...t, timeBasedEnabled: true }))
    const cache = JSON.parse(window.localStorage.getItem('scriblr.settings.cache')!)
    expect(cache.theme.timeBasedEnabled).toBe(true)
  })
})

describe('initSettings', () => {
  it('applies the backend copy, and the backend wins for kv', async () => {
    window.localStorage.setItem('scriblr.writer.chapterMode', JSON.stringify('outline'))
    const theme = defaultThemeSettings()
    theme.zones.day.palette.brightness = 60
    respond = () => remote({ theme, kv: { 'scriblr.writer.chapterMode': 'draft' } })
    await initSettings()
    expect(getSettings().loaded).toBe(true)
    expect(getSettings().theme.zones.day.palette.brightness).toBe(60)
    expect(getKv('scriblr.writer.chapterMode')).toBe('draft')
  })

  it('does not overwrite a value with a write still pending', async () => {
    respond = () => remote({ kv: { 'scriblr.writer.a': 'remote' } })
    setKv('scriblr.writer.a', 'local')
    await initSettings()
    expect(getKv('scriblr.writer.a')).toBe('local')
  })

  it('migrates scriblr.writer.* localStorage keys once', async () => {
    window.localStorage.setItem('scriblr.writer.scratchpad', JSON.stringify([{ id: 'x' }]))
    window.localStorage.setItem('unrelated', JSON.stringify(1))
    respond = call => (call.url.endsWith('/kv-import')
      ? remote({ kv: (call.body as { values: object }).values, migratedFromLocal: true })
      : remote({ migratedFromLocal: false }))
    await initSettings()
    const imported = calls.find(c => c.url.endsWith('/kv-import'))
    expect(imported?.body).toEqual({ values: { 'scriblr.writer.scratchpad': [{ id: 'x' }] } })
  })

  it('does not migrate again once the backend says it is done', async () => {
    window.localStorage.setItem('scriblr.writer.scratchpad', JSON.stringify([1]))
    await initSettings()
    expect(calls.some(c => c.url.endsWith('/kv-import'))).toBe(false)
  })

  it('still loads (from the cache) when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await initSettings()
    expect(getSettings().loaded).toBe(true)
  })
})

describe('useStoredState', () => {
  it('reads the stored value, writes through, and composes functional updates', () => {
    window.localStorage.setItem('scriblr.writer.n', JSON.stringify(5))
    const { result } = renderHook(() => useStoredState<number>('scriblr.writer.n', 0))
    expect(result.current[0]).toBe(5)
    act(() => { result.current[1](n => n + 1); result.current[1](n => n + 1) })
    expect(result.current[0]).toBe(7)
    expect(getKv('scriblr.writer.n')).toBe(7)
  })

  it('re-reads when the key changes', () => {
    setKv('scriblr.writer.marks.a', { x: 1 })
    setKv('scriblr.writer.marks.b', { y: 2 })
    const { result, rerender } = renderHook(({ k }) => useStoredState<Record<string, number>>(k, {}), {
      initialProps: { k: 'scriblr.writer.marks.a' },
    })
    expect(result.current[0]).toEqual({ x: 1 })
    rerender({ k: 'scriblr.writer.marks.b' })
    expect(result.current[0]).toEqual({ y: 2 })
    rerender({ k: 'scriblr.writer.marks.c' })
    expect(result.current[0]).toEqual({})
  })

  it('follows a value that arrives from the backend', async () => {
    const { result } = renderHook(() => useStoredState<string>('scriblr.writer.mode', 'outline'))
    expect(result.current[0]).toBe('outline')
    respond = () => remote({ kv: { 'scriblr.writer.mode': 'draft' } })
    await act(async () => { await initSettings() })
    expect(result.current[0]).toBe('draft')
  })
})
