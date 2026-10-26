import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, getSettings, setTheme } from '../settings/settingsStore'
import { enableZone } from './zones'
import { ZONE_KEYS } from './types'
import SkyToggle from './SkyToggle'
import { mockFetch } from '../test/mockFetch'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 8, 20, 9, 5, 10)) // Sep 20, 9:05:10 AM
  window.localStorage.clear()
  __resetSettingsForTests()
  mockFetch()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const group = () => screen.getByRole('group', { name: 'Time of day' })
const sunButton = () => screen.getByRole('button', { name: /^Theme:/ })
const timeButton = () => screen.getByRole('button', { name: /(Following the clock|Follow the clock)/ })
const lock = (zone: 'dawn' | 'day' | 'dusk' | 'night') => act(() => { setTheme(t => ({ ...t, override: zone })) })
// A zone can only be locked while it is on: turn them all on, at fixed times (the clock follows them when there are several).
const STARTS = { dawn: 330, day: 420, dusk: 1080, night: 1260 }
const allOn = () => act(() => {
  setTheme(t => {
    const on = (['dawn', 'dusk', 'night'] as const).reduce(enableZone, t)
    const zones = { ...on.zones }
    for (const key of ZONE_KEYS) zones[key] = { ...zones[key], startMinute: STARTS[key] }
    return { ...on, zones }
  })
})

describe('SkyToggle', () => {
  it('shows the real time and date, right-aligned in the second button', () => {
    render(<SkyToggle />)
    expect(screen.getByText('9:05 AM')).toBeTruthy()
    expect(screen.getByText('SEP 20')).toBeTruthy()
    expect(timeButton().textContent).toBe('9:05 AMSEP 20')
  })

  it('reads the minute on the minute', () => {
    render(<SkyToggle />)
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('9:06 AM')).toBeTruthy()
  })

  it('steps to the next zone and locks it, through all four', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    allOn()
    render(<SkyToggle />)
    expect(group().getAttribute('data-zone')).toBe('day') // 9:05, after Day starts at 7:00
    expect(sunButton().getAttribute('aria-label')).toBe('Theme: Day. Switch to Dusk')

    const seen: Array<string | null> = []
    for (let i = 0; i < 4; i++) {
      await user.click(sunButton())
      seen.push(getSettings().theme.override)
    }
    expect(seen).toEqual(['dusk', 'night', 'dawn', 'day'])
    expect(group().getAttribute('data-zone')).toBe('day')
    expect(group().getAttribute('data-locked')).toBe('true')
  })

  it('steps over a zone that is off', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    act(() => { // Day (07:00) and Night (21:00) on; Dawn and Dusk off
      setTheme(t => {
        const on = enableZone(t, 'night')
        return { ...on, zones: { ...on.zones, day: { ...on.zones.day, startMinute: STARTS.day }, night: { ...on.zones.night, startMinute: STARTS.night } } }
      })
    })
    render(<SkyToggle />)
    expect(sunButton().getAttribute('aria-label')).toBe('Theme: Day. Switch to Night')
    await user.click(sunButton())
    expect(getSettings().theme.override).toBe('night')
    await user.click(sunButton())
    expect(getSettings().theme.override).toBe('day')
  })

  it('does nothing with a single zone on, and says so', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SkyToggle />)
    expect(sunButton().getAttribute('aria-label')).toBe('Theme: Day. It is the only time of day turned on')
    expect(sunButton().getAttribute('aria-disabled')).toBe('true')
    await user.click(sunButton())
    expect(getSettings().theme.override).toBeNull()
  })

  it('does not lock a zone that is off', () => {
    render(<SkyToggle />)
    lock('dusk')
    expect(getSettings().theme.zones.dusk.configured).toBe(false)
    expect(getSettings().theme.override).toBeNull()
    expect(group().getAttribute('data-zone')).toBe('day')
  })

  it('steps from the clock zone when nothing is locked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    allOn()
    vi.setSystemTime(new Date(2026, 8, 20, 23, 0, 0))
    render(<SkyToggle />)
    expect(group().getAttribute('data-zone')).toBe('night')
    await user.click(sunButton())
    expect(getSettings().theme.override).toBe('dawn')
  })

  it('releases the lock and follows the clock', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    allOn()
    lock('night')
    render(<SkyToggle />)
    expect(group().getAttribute('data-zone')).toBe('night')
    expect(getSettings().theme.timeBasedEnabled).toBe(true) // several zones are on

    await user.click(timeButton())
    expect(getSettings().theme.override).toBeNull()
    expect(group().getAttribute('data-locked')).toBe('false')
    expect(group().getAttribute('data-zone')).toBe('day') // 9:05 is in Day
  })

  it('dims the time and date only while a zone is locked', () => {
    allOn()
    render(<SkyToggle />)
    expect(timeButton().className).not.toContain('skyTimeBtn--locked')
    lock('dusk')
    expect(screen.getByRole('button', { name: /Locked to Dusk/ }).className).toContain('skyTimeBtn--locked')
  })

  it('draws a phase moon and a constellation with lines at night', () => {
    allOn()
    lock('night')
    const { container } = render(<SkyToggle />)
    expect(screen.getByTestId('moon').getAttribute('width')).toBe('10')
    expect(screen.queryByTestId('sun')).toBeNull()
    const stars = screen.getByTestId('constellation')
    expect(stars.querySelectorAll('circle').length).toBeGreaterThanOrEqual(5)
    expect(stars.querySelectorAll('line').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.skyCloudLayer')).toHaveLength(2)
  })

  it('shows only the sun in the day', () => {
    render(<SkyToggle />)
    expect(screen.getByTestId('sun')).toBeTruthy()
    expect(screen.queryByTestId('moon')).toBeNull()
    expect(screen.queryByTestId('constellation')).toBeNull()
  })

  it.each([['dawn'], ['dusk']] as const)('shows the sun, a small moon and faint stars without lines at %s', zone => {
    allOn()
    lock(zone)
    render(<SkyToggle />)
    expect(screen.getByTestId('sun')).toBeTruthy()
    expect(screen.getByTestId('moon').getAttribute('width')).toBe('6')
    const stars = screen.getByTestId('constellation')
    expect(stars.querySelectorAll('line')).toHaveLength(0)
    expect(stars.querySelectorAll('circle').length).toBeGreaterThanOrEqual(5)
    expect(Number((stars as unknown as HTMLElement).style.opacity)).toBeLessThan(0.5)
  })

  it('puts the twilight moon above the sun at dusk and below it at dawn', () => {
    allOn()
    lock('dusk')
    const { unmount } = render(<SkyToggle />)
    expect(parseFloat(screen.getByTestId('moon').style.top)).toBeLessThan(parseFloat(screen.getByTestId('sun').style.top))
    unmount()
    lock('dawn')
    render(<SkyToggle />)
    expect(parseFloat(screen.getByTestId('moon').style.top)).toBeGreaterThan(parseFloat(screen.getByTestId('sun').style.top))
  })

  it('fades the old sky out when the zone changes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    allOn()
    const { container } = render(<SkyToggle />)
    expect(container.querySelector('.skyFade')).toBeNull()
    await user.click(sunButton())
    expect(container.querySelector('.skyFade')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(1100) })
    expect(container.querySelector('.skyFade')).toBeNull()
  })
})
