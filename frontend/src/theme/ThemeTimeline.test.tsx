import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetSettingsForTests, getSettings, setTheme } from '../settings/settingsStore'
import { enableZone } from './zones'
import { ThemeTimeline } from './ThemeTimeline'
import type { ZoneKey } from './types'

// A strip 1,440px wide from the left edge: one pixel a minute.
function stubStrip() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const wide = this.classList.contains('themeTimelineBar')
    return { width: wide ? 1440 : 0, height: 26, x: 0, y: 0, top: 0, left: 0, right: wide ? 1440 : 0, bottom: 26, toJSON: () => ({}) } as DOMRect
  })
}
const start = (key: ZoneKey) => getSettings().theme.zones[key].startMinute
const handle = (key: string) => screen.getByRole('slider', { name: `${key} starts at` })

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
  // Day at 10 AM (the default), Dusk at 4 PM and Night at 10 PM.
  setTheme(prev => enableZone(enableZone(prev, 'dusk'), 'night'))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('the timeline\'s handles', () => {
  it('has one for each zone in use, and one for Day alone (the seam it makes on the strip)', () => {
    const { unmount } = render(<ThemeTimeline selected="day" onSelect={() => {}} />)
    expect(screen.getAllByRole('slider').map(s => s.getAttribute('aria-valuetext'))).toEqual(['10:00 AM', '4:00 PM', '10:00 PM'])
    unmount()
    window.localStorage.clear()
    __resetSettingsForTests()
    render(<ThemeTimeline selected="day" onSelect={() => {}} />)
    expect(screen.getAllByRole('slider').map(s => s.getAttribute('aria-valuetext'))).toEqual(['10:00 AM'])
  })

  it('drags a zone\'s start, snapping to the nearest hour, and selects the zone', () => {
    stubStrip()
    const onSelect = vi.fn()
    render(<ThemeTimeline selected="day" onSelect={onSelect} />)
    fireEvent.mouseDown(handle('Dusk'), { button: 0, clientX: 960 })
    expect(onSelect).toHaveBeenCalledWith('dusk')
    act(() => { fireEvent.mouseMove(window, { clientX: 1043 }) }) // 17:23 -> 5 PM
    expect(start('dusk')).toBe(1020)
    act(() => { fireEvent.mouseMove(window, { clientX: 1080 + 31 }) }) // 18:31 -> 7 PM
    expect(start('dusk')).toBe(1140)
    act(() => { fireEvent.mouseUp(window) })
    act(() => { fireEvent.mouseMove(window, { clientX: 300 }) }) // released: no longer follows the mouse
    expect(start('dusk')).toBe(1140)
    expect(handle('Dusk')).toHaveAttribute('aria-valuetext', '7:00 PM')
  })

  it('pushes the next zone along when it is dragged into it', () => {
    stubStrip()
    render(<ThemeTimeline selected="dusk" onSelect={() => {}} />)
    fireEvent.mouseDown(handle('Dusk'), { button: 0, clientX: 960 })
    act(() => { fireEvent.mouseMove(window, { clientX: 1330 }) }) // 22:10 -> 10 PM, where Night begins
    expect(start('dusk')).toBe(1320)
    expect(start('night')).toBe(1380)
    act(() => { fireEvent.mouseUp(window) })
  })

  it('moves an hour with the arrow keys, and ten minutes with Shift', () => {
    render(<ThemeTimeline selected="day" onSelect={() => {}} />)
    fireEvent.keyDown(handle('Day'), { key: 'ArrowRight' })
    expect(start('day')).toBe(660)
    fireEvent.keyDown(handle('Day'), { key: 'ArrowLeft', shiftKey: true })
    expect(start('day')).toBe(650)
    fireEvent.keyDown(handle('Day'), { key: 'ArrowLeft' })
    expect(start('day')).toBe(590)
  })

  it('goes back to the zone\'s default time on a double click', () => {
    setTheme(prev => ({ ...prev, zones: { ...prev.zones, dusk: { ...prev.zones.dusk, startMinute: 1100 } } }))
    render(<ThemeTimeline selected="day" onSelect={() => {}} />)
    fireEvent.doubleClick(handle('Dusk'))
    expect(start('dusk')).toBe(960)
  })
})
