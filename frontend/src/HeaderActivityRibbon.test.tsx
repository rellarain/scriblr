import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from './settings/settingsStore'
import { emptyPlanner, FACETS } from './lib/facets'
import { mockFetchBy } from './test/mockFetch'
import HeaderActivityRibbon from './HeaderActivityRibbon'

const zeros = () => Object.fromEntries(FACETS.map(f => [f, Array(144).fill(0)])) as Record<string, number[]>

function serve() {
  const today = zeros()
  const average = zeros()
  today.draft[50] = 4; average.draft[50] = 2 // busier than usual
  today.draft[51] = 2; average.draft[51] = 2 // as usual
  today.draft[52] = 1; average.draft[52] = 3 // quieter
  return mockFetchBy(url => {
    if (url === '/api/activity/ribbon') return { date: '2026-10-31', today, average }
    if (url === '/api/projects') return [{ projectId: 'p1' }]
    if (url === '/api/projects/p1/planner') {
      const shift = (id: string, startSlot: number, endSlot: number) => ({ id, title: id, facet: 'draft', date: '2026-10-31', startSlot, endSlot, targetNodeId: null, targetTree: null, target: null, recurrence: null, pauses: [], skipped: [], overrides: {} })
      return { ...emptyPlanner(), shifts: [shift('later', 90, 93), shift('earlier', 40, 43)] }
    }
    return {}
  })
}

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 9, 31, 14, 25)) // 2:25 PM local: the 86th slot
})
afterEach(() => { vi.useRealTimers() })

const segments = () => Array.from(screen.getByRole('img', { name: /Today's activity/ }).children).map(c => c.className.replace('headerRibbonSegment headerRibbonSegment--', ''))

describe('the header activity ribbon', () => {
  it('draws 144 ten-minute slots from the account\'s real activity and its scheduled shifts', async () => {
    serve()
    render(<HeaderActivityRibbon />)
    await waitFor(() => expect(segments()[50]).toBe('high'))
    const s = segments()
    expect(s).toHaveLength(144)
    expect([s[50], s[51], s[52]]).toEqual(['high', 'avg', 'low'])
    expect(s[86]).toBe('now') // the clock's slot
    expect([s[90], s[92]]).toEqual(['sched', 'sched']) // a shift still to come
    expect([s[40], s[42]]).toEqual(['missed', 'missed']) // a shift that passed with nothing logged in it
    expect([s[0], s[60], s[100]]).toEqual(['idle', 'idle', 'idle'])
  })

  it('is on a light ground in the day zone and a dark one at night', async () => {
    serve()
    const { rerender } = render(<HeaderActivityRibbon />)
    await waitFor(() => expect(segments()[50]).toBe('high'))
    expect(screen.getByRole('img', { name: /Today's activity/ }).getAttribute('data-ground')).toBe('light')
    rerender(<HeaderActivityRibbon />)
  })

  it('looks again a moment after something is saved anywhere in the app', async () => {
    const fetchMock = serve()
    render(<HeaderActivityRibbon />)
    await waitFor(() => expect(segments()[50]).toBe('high'))
    const before = fetchMock.mock.calls.filter(c => String(c[0]) === '/api/activity/ribbon').length
    act(() => { window.dispatchEvent(new Event('scriblr:changed')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(fetchMock.mock.calls.filter(c => String(c[0]) === '/api/activity/ribbon').length).toBe(before + 1)
  })

  it('shows nothing but the clock\'s slot before the first answer', () => {
    mockFetchBy(() => new Promise(() => {}))
    render(<HeaderActivityRibbon />)
    expect(segments().filter(c => c !== 'idle')).toEqual(['now'])
  })
})
