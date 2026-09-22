import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, setTheme } from '../settings/settingsStore'
import { defaultThemeSettings } from './defaults'
import { enableZone } from './zones'
import SkyZoneTab from './SkyZoneTab'
import ThemeSettingsPanel from './ThemeSettingsPanel'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 8, 20, 9, 5, 10))
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const palette = defaultThemeSettings().zones.day.palette

describe('SkyZoneTab', () => {
  it('shows the zone name where the time goes and its start time where the date goes', () => {
    render(<SkyZoneTab zone="dusk" palette={palette} configured startMinute={1080} selected={false} now={new Date()} onSelect={() => {}} />)
    const tab = screen.getByRole('tab', { name: 'Dusk, from 6:00 PM' })
    expect(within(tab).getByText('Dusk')).toBeTruthy()
    expect(within(tab).getByText('6:00 PM')).toBeTruthy()
    expect(tab.getAttribute('aria-selected')).toBe('false')
  })

  it('says Off and is dimmed while the zone is not in use, and can still be clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SkyZoneTab zone="night" palette={palette} configured={false} startMinute={1260} selected={false} now={new Date()} onSelect={onSelect} />)
    const tab = screen.getByRole('tab', { name: 'Night, not in use' })
    expect(within(tab).getByText('Off')).toBeTruthy()
    expect(tab.className).toContain('skyTab--off')
    await user.click(tab)
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('draws that zone\'s own sky: the moon and stars at night, only the sun by day', () => {
    const { unmount } = render(<SkyZoneTab zone="night" palette={palette} configured startMinute={1260} selected now={new Date()} onSelect={() => {}} />)
    expect(screen.getByTestId('moon').getAttribute('width')).toBe('10')
    expect(screen.getByTestId('constellation').querySelectorAll('line').length).toBeGreaterThan(0)
    unmount()
    render(<SkyZoneTab zone="day" palette={palette} configured startMinute={420} selected now={new Date()} onSelect={() => {}} />)
    expect(screen.getByTestId('sun')).toBeTruthy()
    expect(screen.queryByTestId('moon')).toBeNull()
  })

  it('marks the selected zone', () => {
    render(<SkyZoneTab zone="day" palette={palette} configured startMinute={420} selected now={new Date()} onSelect={() => {}} />)
    const tab = screen.getByRole('tab')
    expect(tab.getAttribute('aria-selected')).toBe('true')
    expect(tab.className).toContain('skyTab--selected')
  })
})

describe('ThemeSettingsPanel zone tabs', () => {
  it('lists the four zones as sky tabs and switches the editor on click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ThemeSettingsPanel />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(t => t.getAttribute('data-zone'))).toEqual(['dawn', 'day', 'dusk', 'night'])
    expect(screen.getByRole('tab', { name: /^Day/ }).getAttribute('aria-selected')).toBe('true')

    await user.click(screen.getByRole('tab', { name: 'Night, not in use' }))
    expect(screen.getByRole('tab', { name: /^Night/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: 'Use Night' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Use Night' }))
    expect(screen.getByRole('tab', { name: /^Night, from/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop using this zone' })).toBeTruthy()
  })

  it('paints each tab from its own zone\'s saved hues', () => {
    act(() => {
      setTheme(t => {
        const on = enableZone(t, 'dusk')
        const dusk = on.zones.dusk
        return { ...on, zones: { ...on.zones, dusk: { ...dusk, palette: { ...dusk.palette, accent: { h: 120 } } } } }
      })
    })
    render(<ThemeSettingsPanel />)
    // The sun is always white, so compare the twilight moons, which are tinted by the zone's accent hue.
    const moonFill = (name: RegExp) => within(screen.getByRole('tab', { name })).getByTestId('moon').querySelector('path')!.getAttribute('fill')
    expect(moonFill(/^Dusk/)).not.toBe(moonFill(/^Dawn/)) // dusk's accent hue is 120, dawn's is 32
  })
})
