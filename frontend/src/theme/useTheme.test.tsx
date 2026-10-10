import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests } from '../settings/settingsStore'
import { ThemeZoneProvider, useThemeState } from './useTheme'

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
})

function Reading() {
  const { activeZone, settings } = useThemeState()
  return <p>{activeZone}:{settings.zones[activeZone].palette.theme.h}</p>
}

describe('useThemeState inside a ThemeZoneProvider', () => {
  it('reads the zone the clock says outside one', () => {
    render(<Reading />)
    expect(screen.getByText(/^(dawn|day|dusk|night):/)).toBeTruthy()
  })

  it('shows the zone it is given, whatever the clock says', () => {
    render(<ThemeZoneProvider value={{ zone: 'night' }}><Reading /></ThemeZoneProvider>)
    expect(screen.getByText(/^night:/)).toBeTruthy()
  })

  it('takes the palette it is given for that zone, and leaves the other zones alone', () => {
    const palette = { theme: { h: 111 }, accent: { h: 22 }, alert: { h: 33 }, accent2: { h: 44 } }
    render(
      <>
        <ThemeZoneProvider value={{ zone: 'dusk', palette }}><Reading /></ThemeZoneProvider>
        <ThemeZoneProvider value={{ zone: 'day' }}><Reading /></ThemeZoneProvider>
      </>,
    )
    expect(screen.getByText('dusk:111')).toBeTruthy()
    expect(screen.getByText('day:330')).toBeTruthy()
  })
})
