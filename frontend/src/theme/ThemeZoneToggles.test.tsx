import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, getSettings, setTheme } from '../settings/settingsStore'
import { enableZone } from './zones'
import ThemeZoneToggles from './ThemeZoneToggles'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 0, 15, 12, 0)) // noon
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function configure(zones: Array<'dawn' | 'dusk' | 'night'>, timeBased: boolean) {
  act(() => {
    setTheme(t => {
      let next = { ...t, timeBasedEnabled: timeBased }
      for (const z of zones) next = enableZone(next, z)
      return next
    })
  })
}

describe('ThemeZoneToggles', () => {
  it('shows one icon per configured zone', () => {
    render(<ThemeZoneToggles />)
    expect(screen.getAllByRole('button')).toHaveLength(1) // just Day by default
    configure(['night'], false)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    configure(['dawn', 'dusk'], false)
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('highlights the clock zone with the theme color and no override', () => {
    configure(['night'], true) // day 07:00, night 21:00 -> noon is Day
    render(<ThemeZoneToggles />)
    const day = screen.getByRole('button', { name: /^Day/ })
    const night = screen.getByRole('button', { name: /^Night/ })
    expect(day.className).toContain('themeZoneBtn--clock')
    expect(day.className).not.toContain('themeZoneBtn--override')
    expect(night.className).not.toContain('themeZoneBtn--clock')
  })

  it('forces a zone with the accent highlight, and releases it on a second click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    configure(['night'], true)
    render(<ThemeZoneToggles />)

    await user.click(screen.getByRole('button', { name: /^Night/ }))
    expect(getSettings().theme.override).toBe('night')
    const night = screen.getByRole('button', { name: /^Night/ })
    expect(night.className).toContain('themeZoneBtn--override')
    expect(night.getAttribute('aria-pressed')).toBe('true')
    // The clock zone keeps its own (theme) highlight while another is forced.
    expect(screen.getByRole('button', { name: /^Day/ }).className).toContain('themeZoneBtn--clock')

    await user.click(screen.getByRole('button', { name: /^Night/ }))
    expect(getSettings().theme.override).toBeNull()
    expect(screen.getByRole('button', { name: /^Night/ }).className).not.toContain('themeZoneBtn--override')
  })

  it('works when time-based theming is off (the clock zone is Day)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    configure(['night'], false)
    render(<ThemeZoneToggles />)
    expect(screen.getByRole('button', { name: /^Day/ }).className).toContain('themeZoneBtn--clock')
    await user.click(screen.getByRole('button', { name: /^Night/ }))
    expect(getSettings().theme.override).toBe('night')
  })
})
