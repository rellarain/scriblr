import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, getSettings } from '../settings/settingsStore'
import { mockFetch, mockFetchBy } from '../test/mockFetch'
import { assignHue } from './themeHues'
import {
  discardThemeDraft, editThemeDraft, getThemeDraft, redoThemeDraft, saveThemeDraft, undoThemeDraft, useThemeDraft, useThemeDraftView,
} from './themeDraft'
import { enableZone } from './zones'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  discardThemeDraft()
  mockFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

const saved = () => getSettings().theme

describe('the staged theme draft', () => {
  it('is the saved theme until something is edited', () => {
    const { result } = renderHook(() => useThemeDraft())
    expect(result.current.theme).toBe(saved())
    expect(result.current.dirty).toBe(false)
    expect(result.current.canUndo).toBe(false)
  })

  it('shows an edit in the draft and leaves the saved theme alone', () => {
    const { result } = renderHook(() => useThemeDraft())
    act(() => { editThemeDraft(t => enableZone(t, 'night')) })
    expect(result.current.dirty).toBe(true)
    expect(result.current.theme.zones.night.configured).toBe(true)
    expect(saved().zones.night.configured).toBe(false) // the rest of the app is unchanged
  })

  it('counts no change as no edit', () => {
    const { result } = renderHook(() => useThemeDraft())
    act(() => { editThemeDraft(t => t) })
    act(() => { editThemeDraft(t => ({ ...t, override: null })) })
    expect(result.current.dirty).toBe(false)
    expect(result.current.canUndo).toBe(false)
  })

  it('normalizes what is edited, like the saved theme', () => {
    const { result } = renderHook(() => useThemeDraft())
    act(() => { editThemeDraft(t => ({ ...t, zones: { ...t.zones, night: { ...t.zones.night, configured: true, startMinute: 1263 } } })) })
    expect(result.current.theme.zones.night.startMinute).toBe(1260)
    expect(result.current.theme.timeBasedEnabled).toBe(true) // two zones are on
  })

  it('undoes and redoes its edits, step by step, back to clean', () => {
    const { result } = renderHook(() => useThemeDraft())
    act(() => { editThemeDraft(t => enableZone(t, 'night')) })
    act(() => { editThemeDraft(t => assignHue(t, 'night', 'accent', 'h1')) })
    expect(result.current.theme.zones.night.links.accent).toBe('h1')
    expect(result.current.canUndo).toBe(true)

    act(() => { undoThemeDraft() })
    expect(result.current.theme.zones.night.links.accent).toBe('h2')
    expect(result.current.dirty).toBe(true)
    expect(result.current.canRedo).toBe(true)

    act(() => { undoThemeDraft() })
    expect(result.current.dirty).toBe(false) // back to what is saved
    expect(result.current.canUndo).toBe(false)

    act(() => { redoThemeDraft() })
    expect(result.current.theme.zones.night.configured).toBe(true)
    expect(result.current.dirty).toBe(true)
  })

  it('discards what is staged', () => {
    const { result } = renderHook(() => useThemeDraft())
    act(() => { editThemeDraft(t => enableZone(t, 'night')) })
    act(() => { discardThemeDraft() })
    expect(result.current.dirty).toBe(false)
    expect(result.current.theme.zones.night.configured).toBe(false)
    expect(result.current.canUndo).toBe(false)
  })

  it('drops the draft, without asking, when the last panel goes', () => {
    const first = renderHook(() => useThemeDraft())
    const second = renderHook(() => useThemeDraft())
    act(() => { editThemeDraft(t => enableZone(t, 'night')) })
    first.unmount()
    expect(getThemeDraft().dirty).toBe(true) // another panel still has it open
    second.unmount()
    expect(getThemeDraft().dirty).toBe(false)
    expect(getThemeDraft().theme).toBe(saved())
  })

  it('is seen by something that only reads it (the Save control)', () => {
    const panel = renderHook(() => useThemeDraft())
    const reader = renderHook(() => useThemeDraftView())
    act(() => { editThemeDraft(t => enableZone(t, 'night')) })
    expect(reader.result.current.dirty).toBe(true)
    panel.unmount()
    expect(reader.result.current.dirty).toBe(false)
  })

  it('saves: the app takes on the staged zones and hues, the draft is clean, and the settings are sent', async () => {
    const fetchMock = mockFetchBy(() => ({}))
    const { result } = renderHook(() => useThemeDraft())
    act(() => { editThemeDraft(t => enableZone(t, 'night')) })
    act(() => { editThemeDraft(t => ({ ...t, hues: t.hues.map(h => (h.id === 'h2' ? { ...h, h: 90 } : h)) })) })
    await act(async () => { await saveThemeDraft() })
    expect(saved().zones.night.configured).toBe(true)
    expect(saved().hues.find(h => h.id === 'h2')?.h).toBe(90)
    expect(result.current.dirty).toBe(false)
    expect(result.current.canUndo).toBe(false)
    const puts = fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/user-settings/theme') && init?.method === 'PUT')
    expect(puts.length).toBeGreaterThan(0)
    expect(JSON.parse(String(puts.at(-1)?.[1]?.body)).zones.night.configured).toBe(true)
  })

  it('keeps the lock on a zone, which is the header\'s and not staged', () => {
    const { result } = renderHook(() => useThemeDraft())
    act(() => { editThemeDraft(t => enableZone(t, 'night')) })
    expect(result.current.theme.override).toBe(saved().override)
  })
})
