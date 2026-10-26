import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PALETTE } from './defaults'
import { OFF_SKY_SATURATION, skyLook } from './skyLook'
import SkyZoneCard from './SkyZoneCard'
import type { ZonePalette } from './types'

const off: ZonePalette = { theme: { h: 120 }, accent: { h: 120 }, alert: { h: 120 }, accent2: { h: 120 } }
const now = new Date(2026, 8, 20, 9, 5, 10)

function card(props: Partial<Parameters<typeof SkyZoneCard>[0]> = {}) {
  const onToggle = vi.fn()
  render(<SkyZoneCard zone="dusk" configured startMinute={1080} palette={DEFAULT_PALETTE} offPalette={off} onlyOne={false} now={now} onToggle={onToggle} {...props} />)
  return { onToggle, button: screen.getByRole('button') }
}

describe('SkyZoneCard', () => {
  it('shows the zone name and its start time, and turns the zone off when pressed', () => {
    const { button, onToggle } = card()
    expect(button.getAttribute('aria-label')).toBe('Dusk, on, from 6:00 PM. Turn off')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.textContent).toBe('Dusk6:00 PM')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('says Off for a zone that is off, and turns it on when pressed', () => {
    const { button, onToggle } = card({ configured: false })
    expect(button.getAttribute('aria-label')).toBe('Dusk, off. Turn on')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.textContent).toBe('DuskOff')
    expect(button.className).toContain('skyCard--off')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('cannot turn off the last zone that is on, and says why', () => {
    const { button, onToggle } = card({ onlyOne: true })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('aria-label')).toMatch(/only time of day on, so it stays on/)
    expect(button.className).toContain('skyCard--stuck')
    fireEvent.click(button)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('lets a zone that is off be turned on whether or not it is the only one', () => {
    const { button, onToggle } = card({ configured: false, onlyOne: true })
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('fits the text to the sky it paints: a zone that is on from its own palette, one that is off from the subtle one', () => {
    // (jsdom drops a gradient it cannot parse, so the text colour, which is fitted to the sky, tells which sky was made.)
    const probe = (c: string) => { const d = document.createElement('div'); d.style.color = c; return d.style.color }
    const colour = (button: HTMLElement) => (button.querySelector('.skyCardText') as HTMLElement).style.color
    const { button: on } = card()
    expect(colour(on)).toBe(probe(skyLook('dusk', DEFAULT_PALETTE).text))
    document.body.innerHTML = ''
    const { button: dim } = card({ configured: false })
    expect(colour(dim)).toBe(probe(skyLook('dusk', off, OFF_SKY_SATURATION).text))
    expect(colour(dim)).not.toBe(colour(on))
  })

  it('scales its 120px sky to the width of the header, and follows it as it is resized', () => {
    // (Measured, not left to CSS: Electron's Chromium reads atan2(100cqw, 120px) wrongly, which left the sky a small patch in the corner.)
    let width = 480
    const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => width)
    let resized: () => void = () => {}
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback }
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    try {
      const { button } = card()
      expect(button.style.getPropertyValue('--sky-scale')).toBe('4')
      width = 300
      resized()
      expect(button.style.getPropertyValue('--sky-scale')).toBe('2.5')
    } finally {
      offsetWidth.mockRestore()
    }
  })

  it('leaves the scale to the stylesheet where nothing can be measured', () => {
    const { button } = card()
    expect(button.style.getPropertyValue('--sky-scale')).toBe('')
  })

  it('draws the zone\'s own sun, moon and stars', () => {
    card({ zone: 'night' })
    expect(screen.getByTestId('moon')).toBeTruthy()
    expect(screen.getByTestId('constellation')).toBeTruthy()
    expect(OFF_SKY_SATURATION).toBeLessThan(1)
  })
})
