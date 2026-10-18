import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, setTheme } from '../settings/settingsStore'
import { useThemeState } from './useTheme'
import { mockFetch } from '../test/mockFetch'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function Reading() {
  const { clockZone } = useThemeState()
  return <p data-testid="zone">{clockZone}</p>
}

const everyMinute = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(call => call[1] === 60_000)

describe('the shared theme clock', () => {
  it('runs one timer however many components read the theme', () => {
    const interval = vi.spyOn(window, 'setInterval')
    render(<><Reading /><Reading /><Reading /></>)
    expect(everyMinute(interval)).toHaveLength(1)
  })

  it('stops when nothing reads the theme any more, and starts again for the next reader', () => {
    const interval = vi.spyOn(window, 'setInterval')
    const cleared = vi.spyOn(window, 'clearInterval')
    const first = render(<Reading />)
    first.unmount()
    expect(cleared).toHaveBeenCalledTimes(1)
    render(<Reading />)
    expect(everyMinute(interval)).toHaveLength(2)
  })

  it('moves every reader to the next zone at its boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 9, 59, 0))
    setTheme(t => ({ ...t, timeBasedEnabled: true, zones: { ...t.zones, dawn: { ...t.zones.dawn, configured: true } } }))
    render(<><Reading /><Reading /></>)
    expect(screen.getAllByTestId('zone').map(el => el.textContent)).toEqual(['dawn', 'dawn'])
    act(() => { vi.advanceTimersByTime(61_000) })
    expect(screen.getAllByTestId('zone').map(el => el.textContent)).toEqual(['day', 'day'])
  })

  it('shows Day throughout when the schedule is off', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 5, 23, 0, 0))
    render(<Reading />)
    expect(screen.getByTestId('zone').textContent).toBe('day')
  })
})
