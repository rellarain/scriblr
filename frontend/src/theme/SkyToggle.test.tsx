import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, getSettings, setTheme } from '../settings/settingsStore'
import { enableZone } from './zones'
import SkyToggle from './SkyToggle'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 8, 20, 9, 5, 10)) // Sep 20, 9:05:10 AM
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const group = () => screen.getByRole('group', { name: 'Time of day' })
const sunButton = () => screen.getByRole('button', { name: /^Theme:/ })
const timeButton = () => screen.getByRole('button', { name: /(Following the clock|Follow the clock)/ })
const lock = (zone: 'dawn' | 'day' | 'dusk' | 'night') => act(() => { setTheme(t => ({ ...t, override: zone })) })

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
    render(<SkyToggle />)
    expect(group().getAttribute('data-zone')).toBe('day') // time-based theming is off
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

  it('locks a zone that is not configured', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SkyToggle />)
    await user.click(sunButton())
    expect(getSettings().theme.zones.dusk.configured).toBe(false)
    expect(getSettings().theme.override).toBe('dusk')
    expect(group().getAttribute('data-zone')).toBe('dusk')
  })

  it('steps from the clock zone when nothing is locked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    act(() => { setTheme(t => enableZone({ ...t, timeBasedEnabled: true }, 'night')) }) // day 07:00, night 21:00
    vi.setSystemTime(new Date(2026, 8, 20, 22, 0, 0))
    render(<SkyToggle />)
    expect(group().getAttribute('data-zone')).toBe('night')
    await user.click(sunButton())
    expect(getSettings().theme.override).toBe('dawn')
  })

  it('releases the lock and follows the clock, turning time-based theming on', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    lock('night')
    render(<SkyToggle />)
    expect(group().getAttribute('data-zone')).toBe('night')
    expect(getSettings().theme.timeBasedEnabled).toBe(false)

    await user.click(timeButton())
    expect(getSettings().theme.override).toBeNull()
    expect(getSettings().theme.timeBasedEnabled).toBe(true)
    expect(group().getAttribute('data-locked')).toBe('false')
    expect(group().getAttribute('data-zone')).toBe('day') // only Day is configured
  })

  it('dims the time and date only while a zone is locked', () => {
    render(<SkyToggle />)
    expect(timeButton().className).not.toContain('skyTimeBtn--locked')
    lock('dusk')
    expect(screen.getByRole('button', { name: /Locked to Dusk/ }).className).toContain('skyTimeBtn--locked')
  })

  it('draws a phase moon and a constellation with lines at night', () => {
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
    const { container } = render(<SkyToggle />)
    expect(container.querySelector('.skyFade')).toBeNull()
    await user.click(sunButton())
    expect(container.querySelector('.skyFade')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(1100) })
    expect(container.querySelector('.skyFade')).toBeNull()
  })
})
